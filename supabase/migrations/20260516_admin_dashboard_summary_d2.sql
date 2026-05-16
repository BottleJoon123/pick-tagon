-- ================================================================
-- Phase D2: Admin 운영 대시보드 이상 감지 지표 추가
--
-- get_admin_dashboard_summary()를 CREATE OR REPLACE로 확장.
-- 기존 D1 필드는 그대로 유지하고 D2 지표 5개 추가:
--
--   points_paid_7d       — 최근 7일 win pick 지급 포인트 합계
--   unresolved_matchups  — locked/completed 이벤트 내 결과 미입력 matchup 수
--   unsettled_events     — locked/completed 상태 이벤트 수 (정산 전)
--   pending_picks_alert  — 전체 pending picks 수 (D1 pending_picks_total과 동일 값)
--   health_flags         — 운영 이상 여부 boolean 4종
--
-- 보안: 기존 그대로 유지
--   private.is_admin() guard
--   SECURITY DEFINER
--   GRANT authenticated (anon 불허)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event_counts        JSONB;
    v_pending_picks       INTEGER;
    v_active_battles      INTEGER;
    v_news_count          INTEGER;
    v_cur_season          JSONB;
    v_audit_logs          JSONB;
    -- D2
    v_points_paid_7d      BIGINT;
    v_unresolved_matchups INTEGER;
    v_unsettled_events    INTEGER;
    v_health_flags        JSONB;
BEGIN
    -- 1. Admin 검증
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    -- 2. 이벤트 상태별 카운트
    SELECT jsonb_build_object(
        'upcoming',  COALESCE(SUM(CASE WHEN status = 'upcoming'  THEN 1 ELSE 0 END), 0)::INTEGER,
        'locked',    COALESCE(SUM(CASE WHEN status = 'locked'    THEN 1 ELSE 0 END), 0)::INTEGER,
        'completed', COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::INTEGER,
        'settled',   COALESCE(SUM(CASE WHEN status = 'settled'   THEN 1 ELSE 0 END), 0)::INTEGER,
        'archived',  COALESCE(SUM(CASE WHEN status = 'archived'  THEN 1 ELSE 0 END), 0)::INTEGER
    ) INTO v_event_counts
    FROM public.events;

    -- 3. 전체 미정산 픽 수
    SELECT COUNT(*)::INTEGER INTO v_pending_picks
    FROM public.picks
    WHERE status = 'pending';

    -- 4. 활성 배틀 수
    SELECT COUNT(*)::INTEGER INTO v_active_battles
    FROM public.battles
    WHERE status = 'active';

    -- 5. 뉴스 수
    SELECT COUNT(*)::INTEGER INTO v_news_count
    FROM public.news_cache
    WHERE source = 'admin';

    -- 6. 현재 활성 시즌
    SELECT jsonb_build_object(
        'name',         s.name,
        'start_date',   s.start_date::TEXT,
        'days_elapsed', (CURRENT_DATE - s.start_date)::INTEGER
    ) INTO v_cur_season
    FROM public.seasons s
    WHERE s.is_active = TRUE
    LIMIT 1;

    -- 7. 최근 admin 작업 로그 5건
    SELECT jsonb_agg(
        jsonb_build_object(
            'action',       a.action,
            'entity_table', a.entity_table,
            'entity_id',    a.entity_id,
            'created_at',   a.created_at
        )
    ) INTO v_audit_logs
    FROM (
        SELECT action, entity_table, entity_id, created_at
        FROM public.admin_audit_logs
        ORDER BY created_at DESC
        LIMIT 5
    ) a;

    -- D2-1. 최근 7일 지급 포인트 합계 (win picks)
    SELECT COALESCE(SUM(p.settled_payout), 0)
    INTO v_points_paid_7d
    FROM public.picks p
    WHERE p.status = 'win'
      AND p.settled_at >= now() - interval '7 days';

    -- D2-2. locked/completed 이벤트 내 결과 미입력 matchup 수
    SELECT COUNT(*)::INTEGER
    INTO v_unresolved_matchups
    FROM public.matchups m
    JOIN public.events e ON e.id = m.event_id
    WHERE e.status IN ('locked', 'completed')
      AND (m.result_status IS NULL OR m.result_status = 'scheduled');

    -- D2-3. 정산 대기 이벤트 수 (locked/completed)
    SELECT COUNT(*)::INTEGER
    INTO v_unsettled_events
    FROM public.events
    WHERE status IN ('locked', 'completed');

    -- D2-4. health_flags
    v_health_flags := jsonb_build_object(
        'has_pending_picks',       COALESCE(v_pending_picks,       0) > 0,
        'has_unresolved_matchups', COALESCE(v_unresolved_matchups, 0) > 0,
        'has_unsettled_events',    COALESCE(v_unsettled_events,    0) > 0,
        'has_active_battles',      COALESCE(v_active_battles,      0) > 0
    );

    RETURN jsonb_build_object(
        'ok',                  true,
        -- D1 (하위 호환 유지)
        'event_counts',        COALESCE(v_event_counts,  '{}'::JSONB),
        'pending_picks_total', COALESCE(v_pending_picks,  0),
        'active_battles',      COALESCE(v_active_battles, 0),
        'news_count',          COALESCE(v_news_count,     0),
        'current_season',      COALESCE(v_cur_season,    '{}'::JSONB),
        'recent_audit_logs',   COALESCE(v_audit_logs,    '[]'::JSONB),
        -- D2
        'points_paid_7d',      COALESCE(v_points_paid_7d,      0),
        'unresolved_matchups', COALESCE(v_unresolved_matchups,  0),
        'unsettled_events',    COALESCE(v_unsettled_events,     0),
        'pending_picks_alert', COALESCE(v_pending_picks,        0),
        'health_flags',        v_health_flags
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_summary() TO authenticated;
