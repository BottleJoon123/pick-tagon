-- ================================================================
-- Phase D1: Admin 운영 대시보드 요약 RPC
--
-- get_admin_dashboard_summary()
--   Admin 전용 읽기 전용 집계 RPC.
--   단일 왕복으로 운영 핵심 지표를 반환.
--
-- 반환 구조:
--   event_counts        — events.status 기준 5종 카운트
--   pending_picks_total — picks.status = 'pending' 전체 수
--   active_battles      — battles.status = 'active' 수
--   news_count          — news_cache WHERE source = 'admin' 수
--   current_season      — seasons.is_active=TRUE row (name, start_date, days_elapsed)
--   recent_audit_logs   — admin_audit_logs 최근 5건
--
-- 보안:
--   private.is_admin() 검증 필수
--   non-admin → {ok:false, reason:'admin_required'}
--   SECURITY DEFINER으로 picks/admin_audit_logs RLS 우회
--   GRANT authenticated only (anon 불허)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event_counts   JSONB;
    v_pending_picks  INTEGER;
    v_active_battles INTEGER;
    v_news_count     INTEGER;
    v_cur_season     JSONB;
    v_audit_logs     JSONB;
BEGIN
    -- 1. Admin 검증
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    -- 2. 이벤트 상태별 카운트
    --    events.status 흐름: upcoming → locked → completed → settled → archived
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

    -- 5. 뉴스 수 (admin 등록 기준 — news_admin UI source='admin' 패턴과 동일)
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

    RETURN jsonb_build_object(
        'ok',                  true,
        'event_counts',        COALESCE(v_event_counts, '{}'::JSONB),
        'pending_picks_total', COALESCE(v_pending_picks,  0),
        'active_battles',      COALESCE(v_active_battles, 0),
        'news_count',          COALESCE(v_news_count,     0),
        'current_season',      COALESCE(v_cur_season,    '{}'::JSONB),
        'recent_audit_logs',   COALESCE(v_audit_logs,    '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_summary() TO authenticated;
