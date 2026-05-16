-- ================================================================
-- Phase QA1 Fix: admin_event_qa_rpc 중첩 aggregate 수정
--
-- 문제: 기존 구현의 jsonb_agg(jsonb_build_object(... SUM(...) ...))는
--       PostgreSQL에서 중첩 aggregate로 실행 오류 발생.
--       (aggregate function calls cannot be nested)
--
-- 수정: 서브쿼리 q에서 matchup별 SUM 계산 후
--       외부 SELECT에서 jsonb_agg(jsonb_build_object(...)) 적용.
--       0픽 matchup도 LEFT JOIN으로 반드시 포함.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_admin_event_qa(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event             RECORD;
    v_matchups          JSONB;
    v_all_completed     BOOLEAN;
    v_pending_alert     INTEGER;
    v_unresolved_count  INTEGER;
    v_matchup_count     INTEGER;
BEGIN
    -- 1. Admin 검증
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    -- 2. 이벤트 존재 확인
    SELECT id, status INTO v_event
    FROM public.events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
    END IF;

    -- 3. 매치업 총 수 + 미완료 수 계산
    SELECT
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (
            WHERE result_status IS NULL
               OR result_status = 'scheduled'
        )::INTEGER
    INTO v_matchup_count, v_unresolved_count
    FROM public.matchups
    WHERE event_id = p_event_id;

    -- 매치업 1개 이상 + 미완료 0개 → all_matchups_completed = true
    v_all_completed := (v_matchup_count > 0 AND v_unresolved_count = 0);

    -- 4. 전체 pending picks 수 (해당 이벤트 기준)
    SELECT COUNT(*)::INTEGER INTO v_pending_alert
    FROM public.picks p
    JOIN public.matchups m ON m.id = p.matchup_id
    WHERE m.event_id = p_event_id
      AND p.status = 'pending';

    -- 5. 매치업별 픽 집계 (fix: 서브쿼리 q에서 SUM 선계산 후 외부 jsonb_agg)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'matchup_id',      q.matchup_id,
                'red_name',        q.red_name,
                'blue_name',       q.blue_name,
                'result_status',   q.result_status,
                'result_winner',   q.result_winner,
                'result_round',    q.result_round,
                'red_picks',       q.red_picks,
                'blue_picks',      q.blue_picks,
                'win_picks',       q.win_picks,
                'lose_picks',      q.lose_picks,
                'pending_picks',   q.pending_picks,
                'cancelled_picks', q.cancelled_picks
            )
            ORDER BY q.card_segment ASC, q.sort_order ASC
        ),
        '[]'::JSONB
    ) INTO v_matchups
    FROM (
        SELECT
            m.id                                                                                        AS matchup_id,
            m.red_fighter_name                                                                          AS red_name,
            m.blue_fighter_name                                                                         AS blue_name,
            COALESCE(m.result_status, 'scheduled')                                                      AS result_status,
            m.result_winner,
            m.result_round,
            m.card_segment,
            m.sort_order,
            COALESCE(SUM(CASE WHEN p.predicted_side = 'red'     THEN 1 ELSE 0 END), 0)::INTEGER        AS red_picks,
            COALESCE(SUM(CASE WHEN p.predicted_side = 'blue'    THEN 1 ELSE 0 END), 0)::INTEGER        AS blue_picks,
            COALESCE(SUM(CASE WHEN p.status = 'win'             THEN 1 ELSE 0 END), 0)::INTEGER        AS win_picks,
            COALESCE(SUM(CASE WHEN p.status = 'lose'            THEN 1 ELSE 0 END), 0)::INTEGER        AS lose_picks,
            COALESCE(SUM(CASE WHEN p.status = 'pending'         THEN 1 ELSE 0 END), 0)::INTEGER        AS pending_picks,
            COALESCE(SUM(CASE WHEN p.status = 'cancelled'       THEN 1 ELSE 0 END), 0)::INTEGER        AS cancelled_picks
        FROM public.matchups m
        LEFT JOIN public.picks p ON p.matchup_id = m.id
        WHERE m.event_id = p_event_id
        GROUP BY
            m.id, m.red_fighter_name, m.blue_fighter_name,
            m.result_status, m.result_winner, m.result_round,
            m.card_segment, m.sort_order
    ) q;

    RETURN jsonb_build_object(
        'ok',                     true,
        'event_id',               p_event_id,
        'event_status',           v_event.status,
        'all_matchups_completed', v_all_completed,
        'total_pending_alert',    COALESCE(v_pending_alert, 0),
        'matchups',               v_matchups
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_event_qa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_event_qa(UUID) TO authenticated;
