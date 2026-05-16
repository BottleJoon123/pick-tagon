-- ================================================================
-- Fix: service_settle_matchup settled/archived 이벤트 상태 역행 버그
--
-- 발견: docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md (Phase P1)
--
-- 문제:
--   force=true로 settled 이벤트의 matchup을 재정산하면
--   이벤트 자동 완료 체크가 events.status를 무조건 'completed'로 SET.
--   결과: settled → completed 상태 역행 발생.
--   대시보드 unsettled_events 카운트 오작동 + 재정산 흔적 노출.
--
-- 수정:
--   이벤트 자동 완료 UPDATE에 상태 보호 조건 추가.
--   settled / archived 이벤트는 force 재정산 후에도 상태 유지.
--
--   기존:
--     WHERE id = v_matchup.event_id
--   수정:
--     WHERE id = v_matchup.event_id
--       AND status NOT IN ('settled', 'archived')
--
-- 함수 본체 외 변경 없음:
--   - 파라미터 동일
--   - 역산 로직 변경 없음
--   - 정산/포인트 로직 변경 없음
--   - archive snapshot 로직 변경 없음 (archive 자체는 settled 보호 조건 아래에서 실행됨)
--
-- 보안: 기존 그대로 유지
--   SECURITY DEFINER
--   REVOKE ALL FROM PUBLIC, anon, authenticated
--   GRANT service_role only
-- ================================================================

CREATE OR REPLACE FUNCTION public.service_settle_matchup(
  p_matchup_id  UUID,
  p_winner_name TEXT,
  p_winner_side TEXT,
  p_method      TEXT,
  p_round       INTEGER,
  p_time        TEXT,
  p_force       BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matchup         RECORD;
  v_event           RECORD;
  v_pick            RECORD;
  v_fight_id_text   TEXT;
  v_settled_count   INT  := 0;
  v_win_count       INT  := 0;
  v_lose_count      INT  := 0;
  v_cancel_count    INT  := 0;
  v_event_done      BOOLEAN := FALSE;
  v_payout          INT;
  v_user_won        BOOLEAN;
  v_is_draw_nc      BOOLEAN;
  v_result_status   TEXT;
  v_archive_event_id UUID;
BEGIN
  -- ── 매치업 로드 + 잠금 ────────────────────────────────────────────────
  SELECT * INTO v_matchup
  FROM public.matchups
  WHERE id = p_matchup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'matchup not found: %', p_matchup_id;
  END IF;

  -- 멱등성: 이미 정산됐고 force 아닌 경우 no-op
  IF v_matchup.result_status IN ('completed', 'draw', 'no_contest') AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok',             true,
      'idempotent',     true,
      'settled_count',  0,
      'win_count',      0,
      'lose_count',     0,
      'cancel_count',   0,
      'event_completed', false
    );
  END IF;

  -- ── force: 이전 정산 역산 ──────────────────────────────────────────────
  IF p_force AND v_matchup.result_status IN ('completed', 'draw', 'no_contest') THEN
    FOR v_pick IN
      SELECT * FROM public.picks
      WHERE (matchup_id = p_matchup_id OR fight_id = p_matchup_id::TEXT)
        AND status IN ('win', 'lose', 'cancelled')
      FOR UPDATE
    LOOP
      IF v_pick.status = 'win' THEN
        UPDATE public.users
        SET
          points        = COALESCE(points, 0)        - COALESCE(v_pick.settled_payout, 0),
          success_picks = GREATEST(0, COALESCE(success_picks, 0) - 1)
        WHERE id = v_pick.user_id;
      ELSIF v_pick.status = 'lose' THEN
        UPDATE public.users
        SET points = COALESCE(points, 0) + COALESCE(v_pick.bet_cost, 0)
        WHERE id = v_pick.user_id;
      ELSIF v_pick.status = 'cancelled' THEN
        UPDATE public.users
        SET points = COALESCE(points, 0) - COALESCE(v_pick.bet_cost, 0)
        WHERE id = v_pick.user_id;
      END IF;

      UPDATE public.picks
      SET
        status         = 'pending',
        actual_winner  = NULL,
        actual_method  = NULL,
        payout         = COALESCE(base_payout, payout),
        settled_payout = NULL,
        settled_at     = NULL
      WHERE id = v_pick.id;
    END LOOP;
  END IF;

  -- ── 이벤트 로드 ────────────────────────────────────────────────────────
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_matchup.event_id;

  -- 무승부 / 경기취소 여부
  v_is_draw_nc    := p_winner_side IN ('draw', 'nc');
  v_result_status := CASE
    WHEN p_winner_side = 'draw' THEN 'draw'
    WHEN p_winner_side = 'nc'   THEN 'no_contest'
    ELSE 'completed'
  END;

  -- ── matchup 결과 저장 ──────────────────────────────────────────────────
  UPDATE public.matchups
  SET
    result_status      = v_result_status,
    result_winner      = CASE WHEN v_is_draw_nc THEN NULL ELSE p_winner_name END,
    result_winner_side = CASE WHEN v_is_draw_nc THEN NULL ELSE p_winner_side END,
    result_method      = p_method,
    result_round       = p_round,
    result_time        = p_time,
    settled_at         = NOW()
  WHERE id = p_matchup_id;

  v_fight_id_text := p_matchup_id::TEXT;

  -- ── 모든 pending picks 정산 ────────────────────────────────────────────
  FOR v_pick IN
    SELECT *
    FROM public.picks
    WHERE (matchup_id = p_matchup_id OR fight_id = v_fight_id_text)
      AND status = 'pending'
    FOR UPDATE
  LOOP
    IF v_is_draw_nc THEN
      UPDATE public.picks
      SET
        status         = 'cancelled',
        actual_winner  = p_winner_name,
        actual_method  = p_method,
        payout         = 0,
        settled_payout = 0,
        settled_at     = NOW()
      WHERE id = v_pick.id;

      UPDATE public.users
      SET points = COALESCE(points, 1000) + COALESCE(v_pick.bet_cost, 0)
      WHERE id = v_pick.user_id;

      v_cancel_count := v_cancel_count + 1;
    ELSE
      IF v_pick.predicted_side IS NOT NULL THEN
        v_user_won := (v_pick.predicted_side = p_winner_side);
      ELSE
        v_user_won := (lower(v_pick.pick_name) = lower(p_winner_name));
      END IF;

      IF v_user_won THEN
        v_payout := COALESCE(v_pick.base_payout, v_pick.payout, 0);

        IF v_pick.method IS NOT NULL
           AND v_pick.method <> 'ANY'
           AND lower(v_pick.method) = lower(p_method) THEN
          v_payout := v_payout + ROUND(v_payout * 0.3);
        END IF;

        IF v_pick.is_upset = true THEN
          v_payout := v_payout + ROUND(v_payout * 0.2);
        END IF;

        UPDATE public.picks
        SET
          status         = 'win',
          actual_winner  = p_winner_name,
          actual_method  = p_method,
          payout         = v_payout,
          settled_payout = v_payout,
          settled_at     = NOW()
        WHERE id = v_pick.id;

        UPDATE public.users
        SET
          points        = COALESCE(points, 1000)     + v_payout,
          success_picks = COALESCE(success_picks, 0) + 1
        WHERE id = v_pick.user_id;

        v_win_count := v_win_count + 1;
      ELSE
        UPDATE public.picks
        SET
          status         = 'lose',
          actual_winner  = p_winner_name,
          actual_method  = p_method,
          payout         = 0,
          settled_payout = 0,
          settled_at     = NOW()
        WHERE id = v_pick.id;

        v_lose_count := v_lose_count + 1;
      END IF;
    END IF;

    v_settled_count := v_settled_count + 1;
  END LOOP;

  -- ── 이벤트 자동 완료 체크 ──────────────────────────────────────────────
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.matchups
    WHERE event_id    = v_matchup.event_id
      AND result_status NOT IN ('completed', 'cancelled', 'no_contest', 'draw')
  ) INTO v_event_done;

  IF v_event_done THEN
    -- settled/archived 이벤트는 force 재정산 후에도 상태 역행하지 않음
    UPDATE public.events
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_matchup.event_id
      AND status NOT IN ('settled', 'archived');

    -- archive 실패해도 정산 트랜잭션은 유지
    BEGIN
      INSERT INTO public.archive_events (name, event_date, venue, status, source_url)
      VALUES (v_event.title, v_event.event_date::DATE, v_event.venue, 'past', NULL)
      ON CONFLICT (name) DO UPDATE
        SET event_date = EXCLUDED.event_date,
            venue      = EXCLUDED.venue,
            status     = 'past';

      SELECT id INTO v_archive_event_id
      FROM public.archive_events
      WHERE name = v_event.title;

      IF v_archive_event_id IS NOT NULL THEN
        DELETE FROM public.archive_fights WHERE event_id = v_archive_event_id;

        INSERT INTO public.archive_fights
          (event_id, tag, f1_name, f2_name, f1_image_url, f2_image_url,
           winner, method, round, fight_time, sort_order)
        SELECT
          v_archive_event_id,
          CASE
            WHEN m.card_segment = 'main' AND m.sort_order = 1 THEN 'MAIN EVENT'
            WHEN m.card_segment = 'main' AND m.sort_order = 2 THEN 'CO-MAIN EVENT'
            WHEN m.card_segment = 'main' THEN 'FEATURED'
            ELSE 'PRELIMS'
          END,
          m.red_fighter_name, m.blue_fighter_name,
          m.red_image_url, m.blue_image_url,
          m.result_winner, m.result_method, m.result_round, m.result_time,
          m.sort_order
        FROM public.matchups m
        WHERE m.event_id = v_matchup.event_id
        ORDER BY m.sort_order;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'archive snapshot failed (non-fatal): %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'idempotent',     false,
    'settled_count',  v_settled_count,
    'win_count',      v_win_count,
    'lose_count',     v_lose_count,
    'cancel_count',   v_cancel_count,
    'event_completed', v_event_done,
    'event_id',       v_matchup.event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO service_role;
