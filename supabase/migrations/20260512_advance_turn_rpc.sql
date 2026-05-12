-- ================================================================
-- Phase 5D-0: advance_turn RPC + battles_update_participant 축소
--
-- 목적:
--   1. advance_turn RPC: 턴 교체를 SECURITY DEFINER 서버 함수로 처리
--   2. battles_update_participant DROP: 참가자 직접 battles UPDATE 제거
--      → starter_hp/receiver_hp 컬럼 직접 변조 경로 차단 (Finding-02)
--
-- 전제 (이번 Phase 완료 후):
--   - accept_battle   → RPC (Phase 5B)
--   - decline_battle  → RPC (Phase 5B)
--   - cancel_battle   → RPC (Phase 5B, 프론트 5D-0 적용)
--   - vote_battle     → RPC (Phase 5C)
--   - finish_battle   → RPC (Phase 5C-3)
--   - advance_turn    → RPC (이번 Phase 5D-0)
--   모든 battles UPDATE 경로 RPC화 완료 → 직접 UPDATE 정책 제거 안전
--
-- idempotent: CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS
-- ================================================================

BEGIN;

-- ── 1. advance_turn RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_turn(
    p_battle_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid          UUID        := auth.uid();
    v_battle       RECORD;
    v_next_turn    TEXT;
    v_next_round   INTEGER;
    v_turn_started TIMESTAMPTZ := now();
BEGIN
    -- 1. 인증 필수
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'authentication_required');
    END IF;

    -- 2. 배틀 조회 + 잠금 (race condition 방지)
    SELECT * INTO v_battle
    FROM public.battles
    WHERE id = p_battle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
    END IF;

    -- 3. active 상태에서만 허용
    IF v_battle.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active');
    END IF;

    -- 4. 참가자 검증 (IS DISTINCT FROM: NULL-safe 비교)
    IF v_battle.starter_id IS DISTINCT FROM v_uid
       AND v_battle.receiver_id IS DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'participant_required');
    END IF;

    -- 5. 턴 전환 계산
    IF v_battle.current_turn_nick = v_battle.starter_nick THEN
        -- starter 턴 완료 → receiver 턴 (같은 라운드)
        v_next_turn  := v_battle.receiver_nick;
        v_next_round := v_battle.current_round;
    ELSIF v_battle.current_turn_nick = v_battle.receiver_nick THEN
        -- receiver 턴 완료 → 라운드 종료 검사
        IF v_battle.current_round >= 5 THEN
            -- 5라운드 완료 → 종료 신호, 프론트가 _endBattle() 호출
            RETURN jsonb_build_object('ok', false, 'reason', 'battle_should_finish');
        END IF;
        v_next_turn  := v_battle.starter_nick;
        v_next_round := v_battle.current_round + 1;
    ELSE
        -- current_turn_nick이 starter/receiver 어느 쪽도 아님 (오염된 상태)
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_turn_state');
    END IF;

    -- 6. battles 턴 상태 갱신
    UPDATE public.battles
    SET
        current_turn_nick = v_next_turn,
        current_round     = v_next_round,
        turn_started_at   = v_turn_started
    WHERE id = p_battle_id;

    RETURN jsonb_build_object(
        'ok',                true,
        'current_turn_nick', v_next_turn,
        'current_round',     v_next_round,
        'turn_started_at',   v_turn_started
    );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_turn(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_turn(UUID) TO authenticated;


-- ── 2. battles_update_participant 정책 DROP ───────────────────────
-- 모든 battles UPDATE 경로가 SECURITY DEFINER RPC로 이전됨
-- → 참가자 직접 UPDATE 허용 정책 제거
-- → HP 컬럼 직접 변조 경로 차단
DROP POLICY IF EXISTS battles_update_participant ON public.battles;

COMMIT;
