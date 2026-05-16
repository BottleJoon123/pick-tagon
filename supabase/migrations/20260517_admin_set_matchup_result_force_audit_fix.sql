-- ================================================================
-- Fix: admin_set_matchup_result force audit metadata 보강
--
-- 이전 migration (20260517_admin_set_matchup_result_force_audit.sql):
--   win_count / lose_count / cancelled_count / total_settled_payout 만 기록.
--   lose/cancelled의 bet_cost 영향이 누락되어 포인트 영향 summary 불완전.
--
-- service_settle_matchup force 역산 실제 포인트 영향:
--   win:       users.points -= settled_payout
--   lose:      users.points += bet_cost
--   cancelled: users.points -= bet_cost
--
-- 추가 필드:
--   total_count             — win + lose + cancelled 총 픽 수
--   affected_user_count     — 영향받는 고유 유저 수
--   win_settled_payout_total — SUM(settled_payout) WHERE win
--   lose_bet_cost_total      — SUM(bet_cost) WHERE lose
--   cancelled_bet_cost_total — SUM(bet_cost) WHERE cancelled
--   net_reversal_points_delta — 역산으로 인한 전체 포인트 변화량
--                               = -win_settled_payout_total
--                                 + lose_bet_cost_total
--                                 - cancelled_bet_cost_total
--
-- 기존 필드 유지 (하위 호환):
--   win_count / lose_count / cancelled_count
--   total_settled_payout (= win_settled_payout_total alias)
--
-- 기존 동작 전혀 변경 없음:
--   - is_admin() guard 유지
--   - archived guard 유지
--   - service_settle_matchup 호출 유지
--   - metadata = v_result || v_force_snapshot 유지
--   - 반환값 유지
--
-- 권한 정리 (이번 migration에서 anon 명시적 REVOKE):
--   admin_set_matchup_result: authenticated 실행 가능, anon 제거
--   service_settle_matchup: 건드리지 않음 (service_role only 유지)
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
                -- 기존 필드 (하위 호환)
                'win_count',               COALESCE(SUM(CASE WHEN status = 'win'       THEN 1 ELSE 0 END), 0),
                'lose_count',              COALESCE(SUM(CASE WHEN status = 'lose'      THEN 1 ELSE 0 END), 0),
                'cancelled_count',         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0),
                'total_settled_payout',    COALESCE(SUM(CASE WHEN status = 'win' THEN settled_payout ELSE 0 END), 0),
                -- 신규 필드
                'total_count',             COALESCE(COUNT(*), 0),
                'affected_user_count',     COALESCE(COUNT(DISTINCT user_id), 0),
                'win_settled_payout_total',    COALESCE(SUM(CASE WHEN status = 'win'       THEN settled_payout ELSE 0 END), 0),
                'lose_bet_cost_total',         COALESCE(SUM(CASE WHEN status = 'lose'      THEN bet_cost       ELSE 0 END), 0),
                'cancelled_bet_cost_total',    COALESCE(SUM(CASE WHEN status = 'cancelled' THEN bet_cost       ELSE 0 END), 0),
                -- 역산으로 인한 전체 포인트 변화량
                -- win: -settled_payout / lose: +bet_cost / cancelled: -bet_cost
                'net_reversal_points_delta', (
                    - COALESCE(SUM(CASE WHEN status = 'win'       THEN settled_payout ELSE 0 END), 0)
                    + COALESCE(SUM(CASE WHEN status = 'lose'      THEN bet_cost       ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN status = 'cancelled' THEN bet_cost       ELSE 0 END), 0)
                )
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
REVOKE ALL ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_matchup_result(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated;
