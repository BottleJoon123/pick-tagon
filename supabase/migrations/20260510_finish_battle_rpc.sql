-- ================================================================
-- Phase 5C-3: finish_battle RPC
--
-- 목적: 배틀 종료 및 winner 결정을 서버사이드로 이전
--   - 기존: _endBattle()이 클라이언트 HP 기준으로 winner 결정
--   - 변경: finish_battle RPC가 DB HP 기준으로 winner 결정
--   - 이중 종료 방지: SELECT FOR UPDATE + already_finished 멱등성
--   - Tie-break: battle_messages 발언 수 기준 (동점 시 starter 우선)
--
-- 전제: Phase 5C-1(battles.starter_hp/receiver_hp) 적용 완료
-- ================================================================

CREATE OR REPLACE FUNCTION public.finish_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID    := auth.uid();
    v_battle RECORD;
    v_winner TEXT;
    v_s_msgs BIGINT  := 0;
    v_r_msgs BIGINT  := 0;
BEGIN
    -- 1. 인증 필수
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'authentication_required');
    END IF;

    -- 2. 배틀 조회 + 잠금 (이중 종료 race 방지)
    SELECT * INTO v_battle
    FROM public.battles
    WHERE id = p_battle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
    END IF;

    -- 3. 이미 종료된 경우 멱등성 반환 (ok:true, reason:'already_finished')
    IF v_battle.status = 'finished' THEN
        RETURN jsonb_build_object(
            'ok',                true,
            'winner_nick',       v_battle.winner_nick,
            'starter_hp',        v_battle.starter_hp,
            'receiver_hp',       v_battle.receiver_hp,
            'starter_votes',     v_battle.starter_votes,
            'receiver_votes',    v_battle.receiver_votes,
            'starter_messages',  0,
            'receiver_messages', 0,
            'reason',            'already_finished'
        );
    END IF;

    -- 4. active 상태만 허용
    IF v_battle.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active');
    END IF;

    -- 5. 참가자 검증 (starter 또는 receiver만 종료 가능)
    --    IS DISTINCT FROM: NULL-safe 비교 (NULL = v_uid → false, NULL ≠ v_uid → true)
    IF v_battle.starter_id IS DISTINCT FROM v_uid
       AND v_battle.receiver_id IS DISTINCT FROM v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'participant_required');
    END IF;

    -- 6. winner 결정: DB HP 기준
    IF v_battle.starter_hp > v_battle.receiver_hp THEN
        v_winner := v_battle.starter_nick;

    ELSIF v_battle.receiver_hp > v_battle.starter_hp THEN
        v_winner := v_battle.receiver_nick;

    ELSE
        -- HP 동점 → battle_messages 발언 수 Tie-break
        SELECT
            COUNT(*) FILTER (WHERE user_nick = v_battle.starter_nick),
            COUNT(*) FILTER (WHERE user_nick = v_battle.receiver_nick)
        INTO v_s_msgs, v_r_msgs
        FROM public.battle_messages
        WHERE battle_id = p_battle_id;

        v_s_msgs := COALESCE(v_s_msgs, 0);
        v_r_msgs := COALESCE(v_r_msgs, 0);

        -- 동수 시 starter 우선 (기존 정책 유지)
        v_winner := CASE
            WHEN v_s_msgs >= v_r_msgs THEN v_battle.starter_nick
            ELSE v_battle.receiver_nick
        END;
    END IF;

    -- 7. DB 업데이트 (finished_at은 COALESCE로 최초 종료 시각 보존)
    UPDATE public.battles SET
        status      = 'finished',
        winner_nick = v_winner,
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = p_battle_id;

    RETURN jsonb_build_object(
        'ok',                true,
        'winner_nick',       v_winner,
        'starter_hp',        v_battle.starter_hp,
        'receiver_hp',       v_battle.receiver_hp,
        'starter_votes',     v_battle.starter_votes,
        'receiver_votes',    v_battle.receiver_votes,
        'starter_messages',  v_s_msgs,
        'receiver_messages', v_r_msgs,
        'reason',            'finished'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_battle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_battle(UUID) TO authenticated;
