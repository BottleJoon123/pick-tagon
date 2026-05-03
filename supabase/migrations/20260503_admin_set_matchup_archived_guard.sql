-- ================================================================
-- admin_set_matchup_result: archived event guard
--
-- 기존 함수에 누락된 archived 상태 보호를 추가한다.
-- 다른 lifecycle RPC들(admin_lock_event_picks 등)은 이미 settled/archived
-- 이벤트를 막고 있으나 admin_set_matchup_result만 event status 체크가 없었음.
--
-- 정책:
--   archived  → 항상 차단 (event_already_archived)
--   settled   → 허용 유지 (KDI-류 결과 수정 필요 사례 존재)
--
-- 함수 본체 외 변경 없음 (파라미터, GRANT, REVOKE 동일).
-- ================================================================

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
    v_uid          UUID := auth.uid();
    v_before       JSONB;
    v_result       JSONB;
    v_event_status TEXT;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    SELECT to_jsonb(m) INTO v_before FROM public.matchups m WHERE id = p_matchup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'matchup_not_found'; END IF;

    -- archived event guard
    SELECT e.status INTO v_event_status
    FROM public.events e
    JOIN public.matchups m ON m.event_id = e.id
    WHERE m.id = p_matchup_id;

    IF v_event_status = 'archived' THEN
        RAISE EXCEPTION 'event_already_archived';
    END IF;

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
