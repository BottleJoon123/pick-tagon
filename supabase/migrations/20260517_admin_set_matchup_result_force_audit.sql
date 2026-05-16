-- ================================================================
-- Phase P2: admin_set_matchup_result force=true audit before snapshot 강화
--
-- 발견: docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md (Phase P2)
--
-- 기존 문제:
--   force=true 재정산 시 audit log metadata에 기록되는 내용:
--     - force 여부 자체 미기록
--     - 역산 대상 picks 집계 미기록 (win/lose/cancelled 몇 개인지)
--     - 회수되는 총 포인트 합계 미기록
--   → 사후 추적이 어렵고 포인트 영향 규모를 즉시 파악 불가
--
-- 수정:
--   p_force=true 일 때, service_settle_matchup 호출 전에
--   역산 대상 picks 집계와 총 포인트 영향을 수집해 v_force_snapshot에 저장.
--   audit log metadata = v_result || v_force_snapshot (force 시)
--                      = v_result                     (non-force 시, 기존 동작)
--
-- v_force_snapshot 구조:
--   {
--     "force": true,
--     "picks_before_reversal": {
--       "win_count":             INTEGER,   -- win → pending으로 역산될 픽 수
--       "lose_count":            INTEGER,   -- lose → pending으로 역산될 픽 수
--       "cancelled_count":       INTEGER,   -- cancelled → pending으로 역산될 픽 수
--       "total_settled_payout":  BIGINT     -- 회수될 총 포인트 합계 (win picks 기준)
--     }
--   }
--
-- 기존 동작 전혀 변경 없음:
--   - is_admin() guard 유지
--   - matchup before snapshot (v_before) 유지
--   - archived event guard 유지
--   - service_settle_matchup 호출 유지
--   - after_data 구조 유지
--   - 반환값 유지
--
-- 보안: 기존 그대로 유지
--   SECURITY DEFINER
--   REVOKE ALL FROM PUBLIC
--   GRANT authenticated (anon 불허)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_set_matchup_result(
    p_matchup_id  UUID,
    p_winner_name TEXT,
    p_winner_side TEXT,
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
    v_uid            UUID := auth.uid();
    v_before         JSONB;
    v_result         JSONB;
    v_event_status   TEXT;
    v_force_snapshot JSONB := NULL;
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

    -- force=true: service_settle_matchup 호출 전에 역산 대상 picks 집계
    IF p_force THEN
        SELECT jsonb_build_object(
            'force', true,
            'picks_before_reversal', jsonb_build_object(
                'win_count',            COALESCE(SUM(CASE WHEN status = 'win'       THEN 1 ELSE 0 END), 0),
                'lose_count',           COALESCE(SUM(CASE WHEN status = 'lose'      THEN 1 ELSE 0 END), 0),
                'cancelled_count',      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0),
                'total_settled_payout', COALESCE(SUM(CASE WHEN status = 'win' THEN settled_payout ELSE 0 END), 0)
            )
        ) INTO v_force_snapshot
        FROM public.picks
        WHERE (matchup_id = p_matchup_id OR fight_id = p_matchup_id::TEXT)
          AND status IN ('win', 'lose', 'cancelled');
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
        CASE WHEN v_force_snapshot IS NOT NULL
             THEN v_result || v_force_snapshot
             ELSE v_result
        END
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated;
