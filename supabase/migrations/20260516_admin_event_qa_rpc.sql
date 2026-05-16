-- ================================================================
-- Phase QA1: Admin 이벤트 결과 입력 QA RPC
--
-- get_admin_event_qa(p_event_id UUID)
--   Admin 전용 이벤트별 매치업 QA 집계 RPC.
--   결과 입력 전/후 정산 상태를 단일 왕복으로 반환.
--
-- 반환 구조:
--   event_id               — 요청 이벤트 UUID
--   event_status           — events.status
--   all_matchups_completed — 모든 matchup 결과 입력 여부 (settle 전 체크)
--   total_pending_alert    — 전체 pending picks 수 (>0 이면 경보)
--   matchups               — 매치업별 집계 배열
--     matchup_id, red_name, blue_name
--     result_status, result_winner, result_round
--     red_picks, blue_picks (predicted_side 기준)
--     win_picks, lose_picks, pending_picks, cancelled_picks
--
-- 보안:
--   private.is_admin() 검증 필수
--   non-admin → {ok:false, reason:'admin_required'}
--   SECURITY DEFINER으로 picks/matchups RLS 우회
--   GRANT authenticated only (anon 불허)
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

    -- 5. 매치업별 픽 집계
    SELECT jsonb_agg(
        jsonb_build_object(
            'matchup_id',      m.id,
            'red_name',        m.red_fighter_name,
            'blue_name',       m.blue_fighter_name,
            'result_status',   COALESCE(m.result_status, 'scheduled'),
            'result_winner',   m.result_winner,
            'result_round',    m.result_round,
            'red_picks',       COALESCE(SUM(CASE WHEN p.predicted_side = 'red'       THEN 1 ELSE 0 END), 0)::INTEGER,
            'blue_picks',      COALESCE(SUM(CASE WHEN p.predicted_side = 'blue'      THEN 1 ELSE 0 END), 0)::INTEGER,
            'win_picks',       COALESCE(SUM(CASE WHEN p.status = 'win'               THEN 1 ELSE 0 END), 0)::INTEGER,
            'lose_picks',      COALESCE(SUM(CASE WHEN p.status = 'lose'              THEN 1 ELSE 0 END), 0)::INTEGER,
            'pending_picks',   COALESCE(SUM(CASE WHEN p.status = 'pending'           THEN 1 ELSE 0 END), 0)::INTEGER,
            'cancelled_picks', COALESCE(SUM(CASE WHEN p.status = 'cancelled'         THEN 1 ELSE 0 END), 0)::INTEGER
        )
        ORDER BY m.card_segment ASC, m.sort_order ASC
    ) INTO v_matchups
    FROM public.matchups m
    LEFT JOIN public.picks p ON p.matchup_id = m.id
    WHERE m.event_id = p_event_id
    GROUP BY
        m.id,
        m.red_fighter_name,
        m.blue_fighter_name,
        m.result_status,
        m.result_winner,
        m.result_round,
        m.card_segment,
        m.sort_order;

    RETURN jsonb_build_object(
        'ok',                    true,
        'event_id',              p_event_id,
        'event_status',          v_event.status,
        'all_matchups_completed', v_all_completed,
        'total_pending_alert',   COALESCE(v_pending_alert, 0),
        'matchups',              COALESCE(v_matchups, '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_event_qa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_event_qa(UUID) TO authenticated;
