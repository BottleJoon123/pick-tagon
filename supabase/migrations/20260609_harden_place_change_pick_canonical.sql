-- ================================================================
-- place_pick / change_pick CRITICAL 하드닝 (server canonical + Option A 금융값)
--
--   배경: 두 RPC가 클라이언트 금융 파라미터(p_bet_cost, p_base_payout, p_odds,
--   p_is_upset)와 식별값(p_pick_name, p_predicted_side, p_event_id, p_fight_id)을
--   그대로 신뢰·저장했음. 결과로
--     - 음수 p_bet_cost → 즉시 포인트 무한 증가 (place_pick)
--     - 임의 p_base_payout → 정산 시 임의 지급 (place/change)
--     - side↔이름·event_id·fight_id 위조, 잠금 우회(p_matchup_id=NULL)
--   가 가능했음.
--
--   하드닝: matchup_id로 matchups+events를 FOR SHARE 조회해 서버가 canonical
--   값을 결정하고, 클라이언트 불일치는 조용히 교정하지 않고 명확한 예외로 거부.
--   금융값은 Option A 서버 상수(bet_cost=100, odds=1.9, base_payout=190,
--   is_upset=false)로 강제. 실제 차감/INSERT/UPDATE는 클라값이 아닌 서버 상수 사용.
--
--   범위: 두 함수 본문만 교체. 시그니처/SECURITY DEFINER/owner/검색경로/EXECUTE
--   권한 유지(+place_pick의 잔존 PUBLIC EXECUTE 회수). RLS/정산 RPC/다른 함수/
--   데이터 변경 없음. admin_upsert_matchup 변경 가드는 별도 후속 migration.
--
--   trusted odds 원천: matchups/events에 odds 컬럼 없음. 현재 프론트는 항상
--   odds=1.9, bet_cost=100, base_payout=190, is_upset=false 전송(활성 pending 28건
--   전부 일치). 따라서 Option A 상수가 정상 프론트 payload와 100% 호환.
-- ================================================================

-- ── place_pick ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_pick(
    p_fight_id        TEXT,
    p_matchup_id      UUID,
    p_pick_name       TEXT,
    p_predicted_side  TEXT,
    p_method          TEXT,
    p_predicted_round INTEGER,
    p_odds            NUMERIC,
    p_base_payout     INTEGER,
    p_bet_cost        INTEGER,
    p_is_upset        BOOLEAN,
    p_event_id        TEXT,
    p_match_name      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Option A 서버 상수 (클라이언트 값 신뢰 금지)
    c_bet_cost    CONSTANT INTEGER := 100;
    c_odds        CONSTANT NUMERIC := 1.9;
    c_base_payout CONSTANT INTEGER := 190;
    c_is_upset    CONSTANT BOOLEAN := false;

    v_user_id     UUID    := auth.uid();
    v_points      INTEGER;
    v_new_points  INTEGER;
    v_pick_id     BIGINT;
    v_matchup     RECORD;
    v_canon_name  TEXT;
    v_canon_event TEXT;
    v_canon_match TEXT;
    v_method      TEXT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- ── 1. 공통 필수 검증 (matchup 기준 canonical 결정) ──
    IF p_matchup_id IS NULL THEN
        RAISE EXCEPTION 'matchup_required';
    END IF;

    SELECT m.id, m.event_id, m.red_fighter_name, m.blue_fighter_name,
           m.result_status, e.picks_locked_at
      INTO v_matchup
      FROM public.matchups m
      JOIN public.events e ON e.id = m.event_id
     WHERE m.id = p_matchup_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    IF p_fight_id IS DISTINCT FROM p_matchup_id::text THEN
        RAISE EXCEPTION 'fight_matchup_mismatch';
    END IF;

    IF p_predicted_side IS NULL OR p_predicted_side NOT IN ('red', 'blue') THEN
        RAISE EXCEPTION 'invalid_predicted_side';
    END IF;

    v_canon_name := CASE WHEN p_predicted_side = 'red'
                         THEN v_matchup.red_fighter_name
                         ELSE v_matchup.blue_fighter_name END;
    IF v_canon_name IS NULL OR v_canon_name = '' THEN
        RAISE EXCEPTION 'matchup_fighter_missing';
    END IF;

    v_canon_event := v_matchup.event_id::text;
    v_canon_match := v_matchup.red_fighter_name || ' vs ' || v_matchup.blue_fighter_name;

    IF v_matchup.picks_locked_at IS NOT NULL
       OR v_matchup.result_status IN ('completed', 'draw', 'no_contest') THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    -- ── 2. 클라이언트 payload 불일치 거부 (조용한 교정 금지) ──
    IF p_pick_name IS DISTINCT FROM v_canon_name THEN
        RAISE EXCEPTION 'pick_name_mismatch';
    END IF;
    IF p_event_id IS DISTINCT FROM v_canon_event THEN
        RAISE EXCEPTION 'event_id_mismatch';
    END IF;

    -- ── 3. 금융값 Option A 강제 ──
    IF p_bet_cost IS DISTINCT FROM c_bet_cost THEN
        RAISE EXCEPTION 'invalid_bet_cost';
    END IF;
    IF p_odds IS DISTINCT FROM c_odds THEN
        RAISE EXCEPTION 'invalid_odds';
    END IF;
    IF p_base_payout IS DISTINCT FROM c_base_payout THEN
        RAISE EXCEPTION 'invalid_base_payout';
    END IF;
    IF p_is_upset IS DISTINCT FROM c_is_upset THEN
        RAISE EXCEPTION 'invalid_is_upset';
    END IF;

    -- ── 4. method / round 검증 ──
    v_method := NULLIF(p_method, '');
    IF v_method IS NOT NULL AND v_method NOT IN ('KO/TKO', 'SUB', 'UD', 'ANY') THEN
        RAISE EXCEPTION 'invalid_method';
    END IF;
    IF p_predicted_round IS NOT NULL AND (p_predicted_round < 1 OR p_predicted_round > 5) THEN
        RAISE EXCEPTION 'invalid_predicted_round';
    END IF;

    -- ── 5. 포인트 잠금·차감 (서버 상수 사용) ──
    SELECT points INTO v_points
      FROM public.users
     WHERE id = v_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    IF COALESCE(v_points, 0) < c_bet_cost THEN
        RAISE EXCEPTION 'insufficient_points';
    END IF;

    -- 중복 픽 검사 (fight_id = matchup_id::text 기준; 활성 unique index가 백스톱)
    IF EXISTS (
        SELECT 1 FROM public.picks
        WHERE user_id = v_user_id
          AND fight_id = p_fight_id
          AND status IN ('pending', 'win', 'lose')
    ) THEN
        RAISE EXCEPTION 'duplicate_pick';
    END IF;

    v_new_points := COALESCE(v_points, 0) - c_bet_cost;

    UPDATE public.users
       SET points      = v_new_points,
           total_picks = COALESCE(total_picks, 0) + 1
     WHERE id = v_user_id;

    -- canonical 값으로만 저장
    INSERT INTO public.picks (
        user_id, fight_id, match_name, pick_name, method, predicted_round,
        odds, bet_cost, payout, base_payout, is_upset, status, matchup_id, predicted_side
    ) VALUES (
        v_user_id, p_fight_id, v_canon_match, v_canon_name, v_method, p_predicted_round,
        c_odds, c_bet_cost, c_base_payout, c_base_payout, c_is_upset, 'pending', p_matchup_id, p_predicted_side
    )
    RETURNING id INTO v_pick_id;

    -- event_picks: canonical event_id + side 기반 fighter_index (red=0, blue=1)
    v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
    INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
    VALUES (v_user_id, v_canon_event, p_fight_id, v_fighter_idx)
    ON CONFLICT (user_id, fight_id)
    DO UPDATE SET fighter_index = EXCLUDED.fighter_index,
                  event_id      = EXCLUDED.event_id;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id, 'new_points', v_new_points);

EXCEPTION
    -- 동시성 race: picks_uniq_user_fight_active unique index 위반 → 차감 포함 자동 롤백
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_pick';
END;
$$;

-- ── change_pick ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_pick(
    p_fight_id        TEXT,
    p_matchup_id      UUID,
    p_pick_name       TEXT,
    p_predicted_side  TEXT,
    p_method          TEXT,
    p_predicted_round INTEGER,
    p_odds            NUMERIC,
    p_base_payout     INTEGER,
    p_is_upset        BOOLEAN,
    p_event_id        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- Option A 서버 상수 (change_pick은 재차감 없음; 금융값만 상수로 재설정)
    c_odds        CONSTANT NUMERIC := 1.9;
    c_base_payout CONSTANT INTEGER := 190;
    c_is_upset    CONSTANT BOOLEAN := false;

    v_user_id     UUID   := auth.uid();
    v_pick_id     BIGINT;
    v_matchup     RECORD;
    v_canon_name  TEXT;
    v_canon_event TEXT;
    v_method      TEXT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- ── 1. 공통 필수 검증 ──
    IF p_matchup_id IS NULL THEN
        RAISE EXCEPTION 'matchup_required';
    END IF;

    SELECT m.id, m.event_id, m.red_fighter_name, m.blue_fighter_name,
           m.result_status, e.picks_locked_at
      INTO v_matchup
      FROM public.matchups m
      JOIN public.events e ON e.id = m.event_id
     WHERE m.id = p_matchup_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    IF p_fight_id IS DISTINCT FROM p_matchup_id::text THEN
        RAISE EXCEPTION 'fight_matchup_mismatch';
    END IF;

    IF p_predicted_side IS NULL OR p_predicted_side NOT IN ('red', 'blue') THEN
        RAISE EXCEPTION 'invalid_predicted_side';
    END IF;

    v_canon_name := CASE WHEN p_predicted_side = 'red'
                         THEN v_matchup.red_fighter_name
                         ELSE v_matchup.blue_fighter_name END;
    IF v_canon_name IS NULL OR v_canon_name = '' THEN
        RAISE EXCEPTION 'matchup_fighter_missing';
    END IF;

    v_canon_event := v_matchup.event_id::text;

    IF v_matchup.picks_locked_at IS NOT NULL
       OR v_matchup.result_status IN ('completed', 'draw', 'no_contest') THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    -- ── 2. 클라이언트 payload 불일치 거부 ──
    IF p_pick_name IS DISTINCT FROM v_canon_name THEN
        RAISE EXCEPTION 'pick_name_mismatch';
    END IF;
    IF p_event_id IS DISTINCT FROM v_canon_event THEN
        RAISE EXCEPTION 'event_id_mismatch';
    END IF;

    -- ── 3. 금융값 Option A 강제 ──
    IF p_odds IS DISTINCT FROM c_odds THEN
        RAISE EXCEPTION 'invalid_odds';
    END IF;
    IF p_base_payout IS DISTINCT FROM c_base_payout THEN
        RAISE EXCEPTION 'invalid_base_payout';
    END IF;
    IF p_is_upset IS DISTINCT FROM c_is_upset THEN
        RAISE EXCEPTION 'invalid_is_upset';
    END IF;

    -- ── 4. method / round 검증 ──
    v_method := NULLIF(p_method, '');
    IF v_method IS NOT NULL AND v_method NOT IN ('KO/TKO', 'SUB', 'UD', 'ANY') THEN
        RAISE EXCEPTION 'invalid_method';
    END IF;
    IF p_predicted_round IS NOT NULL AND (p_predicted_round < 1 OR p_predicted_round > 5) THEN
        RAISE EXCEPTION 'invalid_predicted_round';
    END IF;

    -- ── 5. pending 픽 조회·잠금 (user_id + fight_id + matchup_id 기준) ──
    --      다른 matchup 행은 절대 변경하지 않음
    SELECT id INTO v_pick_id
      FROM public.picks
     WHERE user_id    = v_user_id
       AND fight_id   = p_fight_id
       AND matchup_id = p_matchup_id
       AND status     = 'pending'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_pending_pick';
    END IF;

    -- canonical + 서버 상수만 저장 (포인트/total_picks 변경 없음)
    UPDATE public.picks SET
        pick_name       = v_canon_name,
        predicted_side  = p_predicted_side,
        method          = v_method,
        predicted_round = p_predicted_round,
        odds            = c_odds,
        payout          = c_base_payout,
        base_payout     = c_base_payout,
        is_upset        = c_is_upset
     WHERE id = v_pick_id;

    v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
    INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
    VALUES (v_user_id, v_canon_event, p_fight_id, v_fighter_idx)
    ON CONFLICT (user_id, fight_id)
    DO UPDATE SET fighter_index = EXCLUDED.fighter_index,
                  event_id      = EXCLUDED.event_id;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id);
END;
$$;

-- ── 권한: PUBLIC EXECUTE 회수, authenticated 정상 권한 유지 ──
REVOKE ALL ON FUNCTION public.place_pick(
    TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_pick(
    TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.change_pick(
    TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_pick(
    TEXT, UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, BOOLEAN, TEXT
) TO authenticated;
