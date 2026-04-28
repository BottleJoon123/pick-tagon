-- ================================================================
-- place_pick RPC: 픽 저장 + 포인트 차감 원자 트랜잭션
-- 변경:
--   1) picks_uniq_user_fight_active: 활성 픽 중복 방지 partial unique index
--   2) place_pick SECURITY DEFINER 함수
--      - 포인트 충분 여부 확인 (FOR UPDATE 잠금)
--      - fight_id / matchup_id 중복 픽 확인
--      - users.points 차감 + users.total_picks 증가
--      - picks INSERT (method, predicted_round 포함)
--      - event_picks UPSERT (커뮤니티 픽 바)
--      - 성공 시 { ok, pick_id, new_points } 반환
-- ================================================================

-- ── 1. 중복 픽 방지 partial unique index ──────────────────────────────
-- pending/win/lose 상태에서 같은 user+fight 중복 불가.
-- cancelled (NC 환급) 후에는 재픽 가능하도록 partial 처리.
CREATE UNIQUE INDEX IF NOT EXISTS picks_uniq_user_fight_active
  ON public.picks (user_id, fight_id)
  WHERE status IN ('pending', 'win', 'lose');

-- ── 2. place_pick RPC ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_pick(
  p_fight_id        TEXT,
  p_matchup_id      UUID,        -- NULL for legacy (non-DB) fights
  p_pick_name       TEXT,
  p_predicted_side  TEXT,        -- 'red' | 'blue' | NULL
  p_method          TEXT,        -- NULL or '' if not selected
  p_predicted_round INTEGER,     -- NULL if not selected
  p_odds            NUMERIC,
  p_base_payout     INTEGER,
  p_bet_cost        INTEGER,
  p_is_upset        BOOLEAN,
  p_event_id        TEXT         -- for event_picks upsert
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     UUID    := auth.uid();
  v_points      INTEGER;
  v_new_points  INTEGER;
  v_pick_id     UUID;
  v_fighter_idx INTEGER;
BEGIN
  -- 인증 확인
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 유저 row 잠금 (포인트 race condition 방지)
  SELECT points INTO v_points
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- 포인트 충분 여부 확인
  IF COALESCE(v_points, 0) < p_bet_cost THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  -- fight_id 기준 중복 픽 확인
  IF EXISTS (
    SELECT 1 FROM public.picks
    WHERE user_id = v_user_id
      AND fight_id = p_fight_id
      AND status IN ('pending', 'win', 'lose', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'duplicate_pick';
  END IF;

  -- matchup_id 기준 추가 중복 확인 (DB 매치업인 경우)
  IF p_matchup_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.picks
    WHERE user_id   = v_user_id
      AND matchup_id = p_matchup_id
      AND status IN ('pending', 'win', 'lose', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'duplicate_pick';
  END IF;

  -- 포인트 차감 + total_picks 증가
  v_new_points := COALESCE(v_points, 0) - p_bet_cost;
  UPDATE public.users
  SET
    points      = v_new_points,
    total_picks = COALESCE(total_picks, 0) + 1
  WHERE id = v_user_id;

  -- picks INSERT (method, predicted_round 포함)
  INSERT INTO public.picks (
    user_id,
    fight_id,
    match_name,
    pick_name,
    method,
    predicted_round,
    odds,
    bet_cost,
    payout,
    base_payout,
    is_upset,
    status,
    matchup_id,
    predicted_side
  ) VALUES (
    v_user_id,
    p_fight_id,
    p_pick_name,
    p_pick_name,
    NULLIF(p_method, ''),
    p_predicted_round,
    p_odds,
    p_bet_cost,
    p_base_payout,
    p_base_payout,
    p_is_upset,
    'pending',
    p_matchup_id,
    p_predicted_side
  )
  RETURNING id INTO v_pick_id;

  -- event_picks UPSERT (커뮤니티 픽 바)
  IF p_event_id IS NOT NULL AND p_predicted_side IS NOT NULL THEN
    v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
    INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
    VALUES (v_user_id, p_event_id, p_fight_id, v_fighter_idx)
    ON CONFLICT (user_id, fight_id)
    DO UPDATE SET
      fighter_index = EXCLUDED.fighter_index,
      event_id      = EXCLUDED.event_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'pick_id',    v_pick_id,
    'new_points', v_new_points
  );
END;
$$;

-- authenticated 사용자만 호출 가능 (SECURITY DEFINER이므로 함수 내부는 postgres 권한으로 실행)
REVOKE ALL ON FUNCTION public.place_pick FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_pick TO authenticated;
