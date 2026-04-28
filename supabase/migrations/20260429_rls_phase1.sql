-- ================================================================
-- RLS Phase 1 + place_pick 잔여 정리
--   A.  place_pick: 'cancelled' 중복 체크 제거 (index와 일치)
--   B1. users INSERT 정책 추가 + trigger BEFORE INSERT OR UPDATE 확장
--   B2. get_leaderboard SECURITY DEFINER RPC + 공개 SELECT 정책 삭제
--   B3. picks 직접 INSERT 정책 삭제 (place_pick RPC 전용)
--   B4. battles / battle_messages RLS 활성화 + 정책
-- ================================================================

BEGIN;

-- ================================================================
-- A. place_pick: 'cancelled' 중복 체크 제거
--    picks_uniq_user_fight_active 인덱스는 pending/win/lose만 커버.
--    cancelled 후 재픽을 허용하는 설계 의도와 함수 내 체크를 일치시킴.
-- ================================================================
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
  p_event_id        TEXT
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT points INTO v_points
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF COALESCE(v_points, 0) < p_bet_cost THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  -- cancelled 제외: NC 후 재픽 허용 (인덱스와 동일 범위)
  IF EXISTS (
    SELECT 1 FROM public.picks
    WHERE user_id = v_user_id
      AND fight_id = p_fight_id
      AND status IN ('pending', 'win', 'lose')
  ) THEN
    RAISE EXCEPTION 'duplicate_pick';
  END IF;

  IF p_matchup_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.picks
    WHERE user_id   = v_user_id
      AND matchup_id = p_matchup_id
      AND status IN ('pending', 'win', 'lose')
  ) THEN
    RAISE EXCEPTION 'duplicate_pick';
  END IF;

  v_new_points := COALESCE(v_points, 0) - p_bet_cost;
  UPDATE public.users
  SET
    points      = v_new_points,
    total_picks = COALESCE(total_picks, 0) + 1
  WHERE id = v_user_id;

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

REVOKE ALL ON FUNCTION public.place_pick FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_pick TO authenticated;


-- ================================================================
-- B1. users INSERT 정책 + 트리거 BEFORE INSERT OR UPDATE 확장
-- ================================================================

-- 트리거 함수: INSERT 시 is_admin=true 차단, UPDATE 시 is_admin 변경 차단
CREATE OR REPLACE FUNCTION private.protect_users_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.is_admin, false) = true THEN
        RAISE EXCEPTION 'setting is_admin is not allowed';
      END IF;
    ELSE
      IF COALESCE(OLD.is_admin, false) IS DISTINCT FROM COALESCE(NEW.is_admin, false) THEN
        RAISE EXCEPTION 'changing is_admin is not allowed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_users_privileged_fields ON public.users;
CREATE TRIGGER trg_protect_users_privileged_fields
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_users_privileged_fields();

-- users INSERT 정책
DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);


-- ================================================================
-- B2. get_leaderboard RPC + 공개 SELECT 정책 삭제
--    '랭킹 전체 공개' 정책은 is_admin 컬럼도 노출하므로 삭제.
--    SECURITY DEFINER 함수로 닉네임/포인트만 안전하게 반환.
-- ================================================================

-- Dashboard/SQL Editor에서 직접 추가된 정책명 포함해 DROP
DROP POLICY IF EXISTS "랭킹 전체 공개"   ON public.users;
DROP POLICY IF EXISTS users_select_public ON public.users;

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  nickname      TEXT,
  points        INTEGER,
  total_picks   INTEGER,
  success_picks INTEGER,
  rank          BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    nickname,
    points,
    total_picks,
    success_picks,
    ROW_NUMBER() OVER (ORDER BY points DESC) AS rank
  FROM public.users
  ORDER BY points DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(INTEGER) TO anon, authenticated;


-- ================================================================
-- B3. picks 직접 INSERT 정책 삭제
--    클라이언트는 place_pick RPC만 사용해야 함.
--    직접 INSERT 허용 시 포인트 차감 없이 픽 삽입 가능.
-- ================================================================
DROP POLICY IF EXISTS "픽 삽입 본인만" ON public.picks;


-- ================================================================
-- B4. battles / battle_messages RLS
-- ================================================================

ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS battles_select_public    ON public.battles;
DROP POLICY IF EXISTS battles_insert_own       ON public.battles;
DROP POLICY IF EXISTS battles_update_participant ON public.battles;

-- 배틀 목록은 누구나 조회 가능
CREATE POLICY battles_select_public
  ON public.battles FOR SELECT
  TO anon, authenticated
  USING (true);

-- 본인만 배틀 신청 가능 (starter_id = 본인)
CREATE POLICY battles_insert_own
  ON public.battles FOR INSERT
  TO authenticated
  WITH CHECK (starter_id = auth.uid());

-- starter 또는 receiver만 수정 가능.
-- receiver_id IS NULL인 pending 배틀은 상대방이 수락(receiver_id 세팅)할 수 있도록 허용.
CREATE POLICY battles_update_participant
  ON public.battles FOR UPDATE
  TO authenticated
  USING (
    starter_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (status = 'pending' AND receiver_id IS NULL)
  );


ALTER TABLE public.battle_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS battle_messages_select_public ON public.battle_messages;
DROP POLICY IF EXISTS battle_messages_insert_auth   ON public.battle_messages;

CREATE POLICY battle_messages_select_public
  ON public.battle_messages FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY battle_messages_insert_auth
  ON public.battle_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMIT;
