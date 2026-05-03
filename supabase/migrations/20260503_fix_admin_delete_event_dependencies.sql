-- ================================================================
-- Fix: admin_delete_event — FK dependency 순서 수정 + 안전 guard 추가
--
-- 기존 함수는 matchups를 먼저 삭제해 picks.matchup_id FK에 걸려 409.
--
-- 수정 내용:
--   1. settled/archived 이벤트 삭제 차단 (event_already_finalized)
--   2. 정산된 pick(win/lose/cancelled) 있으면 삭제 차단 (event_has_settled_picks)
--   3. pending pick bet_cost → 유저 points 환급
--   4. 삭제 순서: event_picks → picks → matchups → events
--   5. audit log에 삭제 메타데이터 기록
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid            UUID := auth.uid();
    v_event          RECORD;
    v_before         JSONB;
    v_matchups_snap  JSONB;
    v_pick           RECORD;
    v_settled_count  INT;
    v_refund_count   INT := 0;
    v_picks_count    INT;
    v_ep_count       INT;
    v_matchup_count  INT;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

    -- settled / archived 이벤트 삭제 차단
    IF v_event.status IN ('settled', 'archived') THEN
        RAISE EXCEPTION 'event_already_finalized';
    END IF;

    -- 정산된 pick이 하나라도 있으면 삭제 차단
    SELECT COUNT(*) INTO v_settled_count
    FROM public.picks p
    JOIN public.matchups m ON m.id = p.matchup_id
    WHERE m.event_id = p_event_id
      AND p.status IN ('win', 'lose', 'cancelled');

    IF v_settled_count > 0 THEN
        RAISE EXCEPTION 'event_has_settled_picks';
    END IF;

    -- 삭제 전 스냅샷
    SELECT to_jsonb(e) INTO v_before FROM public.events e WHERE id = p_event_id;
    SELECT jsonb_agg(to_jsonb(m)) INTO v_matchups_snap
    FROM public.matchups m WHERE event_id = p_event_id;

    -- 1. pending pick bet_cost 환급
    FOR v_pick IN
        SELECT p.*
        FROM public.picks p
        JOIN public.matchups m ON m.id = p.matchup_id
        WHERE m.event_id = p_event_id AND p.status = 'pending'
        FOR UPDATE OF p
    LOOP
        UPDATE public.users
        SET points = COALESCE(points, 0) + COALESCE(v_pick.bet_cost, 0)
        WHERE id = v_pick.user_id;
        v_refund_count := v_refund_count + 1;
    END LOOP;

    -- 2. event_picks 삭제 (event_id는 TEXT 컬럼)
    DELETE FROM public.event_picks WHERE event_id = p_event_id::TEXT;
    GET DIAGNOSTICS v_ep_count = ROW_COUNT;

    -- 3. picks 삭제
    DELETE FROM public.picks p
    USING public.matchups m
    WHERE p.matchup_id = m.id AND m.event_id = p_event_id;
    GET DIAGNOSTICS v_picks_count = ROW_COUNT;

    -- 4. matchups 삭제
    DELETE FROM public.matchups WHERE event_id = p_event_id;
    GET DIAGNOSTICS v_matchup_count = ROW_COUNT;

    -- 5. event 삭제
    DELETE FROM public.events WHERE id = p_event_id;

    -- audit log
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, metadata)
    VALUES (
        v_uid, 'delete_event', 'events', p_event_id::TEXT,
        v_before,
        jsonb_build_object(
            'deleted_matchups_count',    v_matchup_count,
            'deleted_picks_count',       v_picks_count,
            'deleted_event_picks_count', v_ep_count,
            'refunded_picks_count',      v_refund_count,
            'deleted_matchups',          COALESCE(v_matchups_snap, '[]'::JSONB)
        )
    );

    RETURN jsonb_build_object(
        'ok',              true,
        'deleted_matchups', v_matchup_count,
        'deleted_picks',    v_picks_count,
        'refunded_picks',   v_refund_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_event(UUID) TO authenticated;
