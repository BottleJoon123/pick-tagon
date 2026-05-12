-- ================================================================
-- Phase 5D-0 review fix: advance_turn RPC 턴 소유자 검증 추가
--
-- 변경: step 5에 현재 턴 소유자 ID 검증 추가
--   - starter 턴이면 starter_id = auth.uid() 검증
--   - receiver 턴이면 receiver_id = auth.uid() 검증
--   - 불일치 시 { ok:false, reason:'not_current_turn' }
--   - IS DISTINCT FROM: NULL-safe 비교
-- ================================================================

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

    -- 5. 현재 턴 소유자 검증 + 턴 전환 계산
    --    IS DISTINCT FROM: NULL-safe 비교 (NULL = v_uid → false)
    IF v_battle.current_turn_nick = v_battle.starter_nick THEN
        -- starter 턴: starter_id가 호출자여야 함
        IF v_battle.starter_id IS DISTINCT FROM v_uid THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'not_current_turn');
        END IF;
        v_next_turn  := v_battle.receiver_nick;
        v_next_round := v_battle.current_round;
    ELSIF v_battle.current_turn_nick = v_battle.receiver_nick THEN
        -- receiver 턴: receiver_id가 호출자여야 함
        IF v_battle.receiver_id IS DISTINCT FROM v_uid THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'not_current_turn');
        END IF;
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
