-- ================================================================
-- Event Lifecycle Phase 1
--   1. events 라이프사이클 컬럼 보강 (picks_locked_at, settled_at, archived_at)
--   2. admin_lock_event_picks(p_event_id uuid)
--   3. admin_reopen_event_picks(p_event_id uuid)
--   4. admin_set_matchup_result(...)  -- service_settle_matchup 위임 + audit log
--   5. admin_settle_event(p_event_id uuid)
--   6. admin_archive_event(p_event_id uuid)
--   7. place_pick 보호 로직 — picks_locked_at 또는 matchup result 있으면 'pick_locked' 예외
--
-- events.status 흐름: upcoming → locked → completed (auto) → settled → archived
-- ================================================================

BEGIN;

-- ── 1. events 라이프사이클 컬럼 보강 ─────────────────────────────
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS picks_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS settled_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ;


-- ── 2. admin_lock_event_picks ─────────────────────────────────────
-- 픽 마감 처리: status → 'locked', picks_locked_at = NOW()
CREATE OR REPLACE FUNCTION public.admin_lock_event_picks(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_event  RECORD;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
    IF v_event.status IN ('settled', 'archived') THEN
        RAISE EXCEPTION 'event_already_finalized';
    END IF;
    -- 멱등성: 이미 locked이면 ok 반환
    IF v_event.picks_locked_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;

    UPDATE public.events
    SET status = 'locked', picks_locked_at = NOW()
    WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (
        v_uid, 'lock_event_picks', 'events', p_event_id::TEXT,
        jsonb_build_object('status', v_event.status, 'picks_locked_at', v_event.picks_locked_at),
        jsonb_build_object('status', 'locked', 'picks_locked_at', NOW())
    );

    RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lock_event_picks(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lock_event_picks(UUID) TO authenticated;


-- ── 3. admin_reopen_event_picks ───────────────────────────────────
-- 픽 재오픈: picks_locked_at 초기화, status → 'upcoming'
-- 이미 settled/archived 이벤트는 reopen 금지
CREATE OR REPLACE FUNCTION public.admin_reopen_event_picks(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_event RECORD;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
    IF v_event.status IN ('settled', 'archived') THEN
        RAISE EXCEPTION 'event_already_finalized';
    END IF;
    -- 멱등성: 이미 열려 있으면 ok 반환
    IF v_event.picks_locked_at IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;

    UPDATE public.events
    SET status = 'upcoming', picks_locked_at = NULL
    WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (
        v_uid, 'reopen_event_picks', 'events', p_event_id::TEXT,
        jsonb_build_object('status', v_event.status, 'picks_locked_at', v_event.picks_locked_at),
        jsonb_build_object('status', 'upcoming', 'picks_locked_at', NULL)
    );

    RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reopen_event_picks(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reopen_event_picks(UUID) TO authenticated;


-- ── 4. admin_set_matchup_result ───────────────────────────────────
-- 경기 결과 입력 — service_settle_matchup 위임 + admin 체크 + audit log
CREATE OR REPLACE FUNCTION public.admin_set_matchup_result(
    p_matchup_id  UUID,
    p_winner_name TEXT,
    p_winner_side TEXT,             -- 'red' | 'blue' | 'draw' | 'nc'
    p_method      TEXT,
    p_round       INTEGER,
    p_time        TEXT,
    p_force       BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_before JSONB;
    v_result JSONB;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT to_jsonb(m) INTO v_before FROM public.matchups m WHERE id = p_matchup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'matchup_not_found'; END IF;

    -- 실제 정산은 service_settle_matchup에 완전 위임
    v_result := public.service_settle_matchup(
        p_matchup_id, p_winner_name, p_winner_side,
        p_method, p_round, p_time, p_force
    );

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
    VALUES (
        v_uid, 'set_matchup_result', 'matchups', p_matchup_id::TEXT,
        v_before,
        jsonb_build_object(
            'result_winner',      p_winner_name,
            'result_winner_side', p_winner_side,
            'result_method',      p_method,
            'result_round',       p_round,
            'result_time',        p_time
        ),
        v_result
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated;


-- ── 5. admin_settle_event ─────────────────────────────────────────
-- 이벤트 정산 확정: status → 'settled', settled_at = NOW()
-- 요건: events.status IN ('completed', 'locked') — 최소한 matchup 결과가 있어야 함
-- 잔존 pending picks 안전망 취소
CREATE OR REPLACE FUNCTION public.admin_settle_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_event        RECORD;
    v_pick         RECORD;
    v_cancel_count INT := 0;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
    -- 중복 정산 방지
    IF v_event.status IN ('settled', 'archived') THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', v_event.status);
    END IF;
    -- 미완료 이벤트 정산 금지
    IF v_event.status NOT IN ('completed', 'locked') THEN
        RAISE EXCEPTION 'event_not_completable: current status is %', v_event.status;
    END IF;

    -- locked 상태에서 결과 미입력 matchup 있으면 정산 금지
    -- completed는 service_settle_matchup이 모든 matchup 완료 후 auto-set → 이미 검증됨
    IF v_event.status = 'locked' THEN
        IF EXISTS (
            SELECT 1 FROM public.matchups
            WHERE event_id = p_event_id AND result_status = 'scheduled'
        ) THEN
            RAISE EXCEPTION 'event_has_unresolved_matchups';
        END IF;
    END IF;

    -- 안전망: 해당 이벤트 matchup에 남아있는 pending picks → cancelled
    FOR v_pick IN
        SELECT p.* FROM public.picks p
        JOIN public.matchups m ON m.id = p.matchup_id
        WHERE m.event_id = p_event_id AND p.status = 'pending'
        FOR UPDATE OF p
    LOOP
        UPDATE public.picks
        SET status = 'cancelled', settled_payout = 0, payout = 0, settled_at = NOW()
        WHERE id = v_pick.id;

        UPDATE public.users
        SET points = COALESCE(points, 1000) + COALESCE(v_pick.bet_cost, 0)
        WHERE id = v_pick.user_id;

        v_cancel_count := v_cancel_count + 1;
    END LOOP;

    UPDATE public.events
    SET status = 'settled', settled_at = NOW()
    WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
    VALUES (
        v_uid, 'settle_event', 'events', p_event_id::TEXT,
        jsonb_build_object('status', v_event.status),
        jsonb_build_object('status', 'settled', 'settled_at', NOW()),
        jsonb_build_object('cancelled_pending_picks', v_cancel_count)
    );

    RETURN jsonb_build_object('ok', true, 'idempotent', false, 'cancelled_pending_picks', v_cancel_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_settle_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_settle_event(UUID) TO authenticated;


-- ── 6. admin_archive_event ────────────────────────────────────────
-- 아카이브: status → 'archived', archived_at = NOW()
-- settled 상태에서만 가능 (completed → archived 직행 금지: pending picks 미정산 위험)
-- completed 상태에서는 반드시 admin_settle_event 먼저 호출할 것
CREATE OR REPLACE FUNCTION public.admin_archive_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid   UUID := auth.uid();
    v_event RECORD;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
    -- 멱등성
    IF v_event.status = 'archived' THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;
    -- settled 상태에서만 archive 허용
    IF v_event.status <> 'settled' THEN
        RAISE EXCEPTION 'event_not_settled: cannot archive an event with status %', v_event.status;
    END IF;

    UPDATE public.events
    SET status = 'archived', archived_at = NOW()
    WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (
        v_uid, 'archive_event', 'events', p_event_id::TEXT,
        jsonb_build_object('status', v_event.status),
        jsonb_build_object('status', 'archived', 'archived_at', NOW())
    );

    RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_archive_event(UUID) TO authenticated;


-- ── 7. place_pick 보호 로직 ───────────────────────────────────────
-- picks_locked_at IS NOT NULL 또는 matchup에 결과가 이미 있는 경우 → 'pick_locked'
CREATE OR REPLACE FUNCTION public.place_pick(
    p_fight_id       TEXT,
    p_matchup_id     UUID,
    p_pick_name      TEXT,
    p_predicted_side TEXT,
    p_method         TEXT,
    p_predicted_round INTEGER,
    p_odds           NUMERIC,
    p_base_payout    INTEGER,
    p_bet_cost       INTEGER,
    p_is_upset       BOOLEAN,
    p_event_id       TEXT
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

    -- ── 픽 마감 체크 ──────────────────────────────────────────────
    -- 이벤트 픽이 잠겼거나 matchup에 이미 결과가 입력된 경우 픽 금지
    IF p_matchup_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.matchups m
        JOIN public.events e ON e.id = m.event_id
        WHERE m.id = p_matchup_id
          AND (
            e.picks_locked_at IS NOT NULL
            OR m.result_status IN ('completed', 'draw', 'no_contest')
          )
    ) THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    v_new_points := COALESCE(v_points, 0) - p_bet_cost;
    UPDATE public.users
    SET
        points      = v_new_points,
        total_picks = COALESCE(total_picks, 0) + 1
    WHERE id = v_user_id;

    INSERT INTO public.picks (
        user_id, fight_id, match_name, pick_name, method, predicted_round,
        odds, bet_cost, payout, base_payout, is_upset, status, matchup_id, predicted_side
    ) VALUES (
        v_user_id, p_fight_id, p_pick_name, p_pick_name, NULLIF(p_method, ''), p_predicted_round,
        p_odds, p_bet_cost, p_base_payout, p_base_payout, p_is_upset, 'pending', p_matchup_id, p_predicted_side
    )
    RETURNING id INTO v_pick_id;

    IF p_event_id IS NOT NULL AND p_predicted_side IS NOT NULL THEN
        v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
        INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
        VALUES (v_user_id, p_event_id, p_fight_id, v_fighter_idx)
        ON CONFLICT (user_id, fight_id)
        DO UPDATE SET fighter_index = EXCLUDED.fighter_index, event_id = EXCLUDED.event_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id, 'new_points', v_new_points);
END;
$$;

COMMIT;
