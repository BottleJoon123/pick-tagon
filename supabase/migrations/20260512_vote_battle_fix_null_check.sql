-- ================================================================
-- Phase 5D-1: vote_battle RPC 참가자 차단 NULL-safe 통일
--
-- 변경: 참가자 본인 투표 차단 조건을 IS NOT DISTINCT FROM 으로 교체
--   기존: starter_id = v_uid OR receiver_id = v_uid
--         (NULL = non-null → NULL → 조건 평가 false, 차단 실패 가능)
--   신규: starter_id IS NOT DISTINCT FROM v_uid
--         OR receiver_id IS NOT DISTINCT FROM v_uid
--         (NULL IS NOT DISTINCT FROM non-null → FALSE, 안전하게 동작)
--
-- 기타 동작 유지 (Phase 5C-2 그대로):
--   - auth.uid() null → authentication_required
--   - invalid_side, battle_not_found, battle_not_active
--   - already_voted (ON CONFLICT race-safe)
--   - HP + votes 단일 UPDATE (변수 기반 계산)
--   - ok:true + starter_hp/receiver_hp/votes 반환
-- ================================================================

CREATE OR REPLACE FUNCTION public.vote_battle(
    p_battle_id UUID,
    p_side      TEXT   -- 'starter' | 'receiver'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid         UUID    := auth.uid();
    v_battle      RECORD;
    v_new_s_hp    INTEGER;
    v_new_r_hp    INTEGER;
    v_new_s_votes INTEGER;
    v_new_r_votes INTEGER;
BEGIN
    -- 1. 인증 필수
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'authentication_required');
    END IF;

    -- 2. side 검증
    IF p_side NOT IN ('starter', 'receiver') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_side');
    END IF;

    -- 3. 배틀 조회 + 잠금 (race condition 방지)
    SELECT * INTO v_battle
    FROM public.battles
    WHERE id = p_battle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
    END IF;

    -- 4. active 상태에서만 허용
    IF v_battle.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active');
    END IF;

    -- 5. 참가자 본인 투표 차단 (IS NOT DISTINCT FROM: NULL-safe 동등 비교)
    --    receiver_id NULL인 경우에도 FALSE로 안전하게 평가됨
    IF v_battle.starter_id IS NOT DISTINCT FROM v_uid
       OR v_battle.receiver_id IS NOT DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'participant_cannot_vote');
    END IF;

    -- 6. INSERT — ON CONFLICT로 race condition 처리
    INSERT INTO public.battle_votes (battle_id, voter_id, side)
    VALUES (p_battle_id, v_uid, p_side)
    ON CONFLICT (battle_id, voter_id) DO NOTHING;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
    END IF;

    -- 7. 새 HP / votes 계산 (FOR UPDATE로 읽은 현재값 기준)
    IF p_side = 'starter' THEN
        v_new_s_hp    := LEAST(100, v_battle.starter_hp + 3);
        v_new_r_hp    := GREATEST(0, v_battle.receiver_hp - 3);
        v_new_s_votes := COALESCE(v_battle.starter_votes, 0) + 1;
        v_new_r_votes := COALESCE(v_battle.receiver_votes, 0);
    ELSE
        v_new_r_hp    := LEAST(100, v_battle.receiver_hp + 3);
        v_new_s_hp    := GREATEST(0, v_battle.starter_hp - 3);
        v_new_r_votes := COALESCE(v_battle.receiver_votes, 0) + 1;
        v_new_s_votes := COALESCE(v_battle.starter_votes, 0);
    END IF;

    -- 8. HP + votes 단일 UPDATE
    UPDATE public.battles SET
        starter_hp     = v_new_s_hp,
        receiver_hp    = v_new_r_hp,
        starter_votes  = v_new_s_votes,
        receiver_votes = v_new_r_votes
    WHERE id = p_battle_id;

    RETURN jsonb_build_object(
        'ok',             true,
        'side',           p_side,
        'starter_hp',     v_new_s_hp,
        'receiver_hp',    v_new_r_hp,
        'starter_votes',  v_new_s_votes,
        'receiver_votes', v_new_r_votes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.vote_battle(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_battle(UUID, TEXT) TO authenticated;
