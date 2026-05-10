-- ================================================================
-- Phase 5B: Battle Vote Dedup
--
-- 목적: 관전자 투표의 DB 레벨 중복 방지
--   - battle_votes 테이블: UNIQUE(battle_id, voter_id) 제약
--   - vote_battle RPC: 인증·상태·참가자 검증 후 INSERT
--   - 기존 battles.starter_votes / receiver_votes 유지 (카운터 역할)
--
-- 범위:
--   - Phase 5B: DB 레벨 중복 투표 방지
--   - Phase 5C (미구현): Broadcast 스팸 / HP 서버사이드화
-- ================================================================

BEGIN;

-- ── 1. battle_votes 테이블 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.battle_votes (
    id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    battle_id  UUID         NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
    voter_id   UUID         NOT NULL REFERENCES auth.users(id),
    side       TEXT         NOT NULL CHECK (side IN ('starter', 'receiver')),
    created_at TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (battle_id, voter_id)
);

-- 조회 인덱스
CREATE INDEX IF NOT EXISTS battle_votes_battle_id_idx ON public.battle_votes (battle_id);
CREATE INDEX IF NOT EXISTS battle_votes_voter_id_idx  ON public.battle_votes (voter_id);

-- RLS
ALTER TABLE public.battle_votes ENABLE ROW LEVEL SECURITY;

-- 공개 조회 — 관전 통계 표시용
DROP POLICY IF EXISTS battle_votes_select_public ON public.battle_votes;
CREATE POLICY battle_votes_select_public
    ON public.battle_votes FOR SELECT
    USING (true);

-- 직접 INSERT 차단 — vote_battle RPC(SECURITY DEFINER)로만 삽입
-- (INSERT 정책 없음 → RLS가 차단, RPC는 SECURITY DEFINER로 우회)


-- ── 2. vote_battle RPC ───────────────────────────────────────────
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
    v_uid    UUID := auth.uid();
    v_battle RECORD;
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

    -- 5. 참가자 본인 투표 차단
    IF v_battle.starter_id = v_uid OR v_battle.receiver_id = v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'participant_cannot_vote');
    END IF;

    -- 6. INSERT — ON CONFLICT로 race condition 처리
    --    이미 투표한 경우 아무 일 없이 already_voted 반환
    INSERT INTO public.battle_votes (battle_id, voter_id, side)
    VALUES (p_battle_id, v_uid, p_side)
    ON CONFLICT (battle_id, voter_id) DO NOTHING;

    -- INSERT가 실제로 됐는지 확인
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
    END IF;

    -- 7. 카운터 increment
    IF p_side = 'starter' THEN
        UPDATE public.battles
        SET starter_votes = COALESCE(starter_votes, 0) + 1
        WHERE id = p_battle_id;
    ELSE
        UPDATE public.battles
        SET receiver_votes = COALESCE(receiver_votes, 0) + 1
        WHERE id = p_battle_id;
    END IF;

    RETURN jsonb_build_object('ok', true, 'side', p_side);
END;
$$;

REVOKE ALL ON FUNCTION public.vote_battle(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_battle(UUID, TEXT) TO authenticated;

COMMIT;
