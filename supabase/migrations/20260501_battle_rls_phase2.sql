-- ================================================================
-- Battle RLS Phase 2: 참가자 기반 권한 정밀화
--   1. accept_battle(p_battle_id uuid)  — receiver_nick 검증 후 수락
--   2. decline_battle(p_battle_id uuid) — receiver만 거절
--   3. cancel_battle(p_battle_id uuid)  — starter/receiver만 취소
--   4. battles UPDATE RLS — pending+NULL 절 제거, 참가자만
--   5. battle_messages INSERT RLS — 참가자 battles 서브쿼리로 좁힘
-- ================================================================

BEGIN;

-- ── 1. accept_battle ──────────────────────────────────────────────
-- receiver_nick과 현재 사용자 nickname 일치 검증
-- pending + receiver_id IS NULL 상태에서만 수락 허용
CREATE OR REPLACE FUNCTION public.accept_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_battle  RECORD;
    v_my_nick TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'authentication_required';
    END IF;

    SELECT * INTO v_battle FROM public.battles WHERE id = p_battle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
    IF v_battle.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;
    IF v_battle.receiver_id IS NOT NULL THEN RAISE EXCEPTION 'already_accepted'; END IF;

    SELECT nickname INTO v_my_nick FROM public.users WHERE id = v_uid;

    IF v_my_nick IS NULL OR v_my_nick <> v_battle.receiver_nick THEN
        RAISE EXCEPTION 'not_receiver';
    END IF;

    UPDATE public.battles SET
        receiver_id       = v_uid,
        receiver_nick     = v_my_nick,
        status            = 'active',
        current_turn_nick = v_battle.starter_nick,
        current_round     = 1,
        turn_started_at   = NOW()
    WHERE id = p_battle_id;

    RETURN jsonb_build_object(
        'ok',               true,
        'starter_nick',     v_battle.starter_nick,
        'receiver_nick',    v_my_nick,
        'current_turn_nick', v_battle.starter_nick
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_battle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_battle(UUID) TO authenticated;


-- ── 2. decline_battle ─────────────────────────────────────────────
-- pending 상태에서 receiver만 거절 가능
-- receiver_id 미설정 시 닉네임으로 검증 (requestBattle 시 receiver_id 미저장)
CREATE OR REPLACE FUNCTION public.decline_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_battle  RECORD;
    v_my_nick TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'authentication_required';
    END IF;

    SELECT * INTO v_battle FROM public.battles WHERE id = p_battle_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
    IF v_battle.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;

    SELECT nickname INTO v_my_nick FROM public.users WHERE id = v_uid;

    IF v_battle.receiver_id IS NOT NULL THEN
        -- 이미 receiver_id가 세팅된 경우 UUID로 검증
        IF v_battle.receiver_id <> v_uid THEN
            RAISE EXCEPTION 'not_receiver';
        END IF;
    ELSE
        -- pending 초기 상태: receiver_nick 닉네임으로 검증
        IF v_my_nick IS NULL OR v_my_nick <> v_battle.receiver_nick THEN
            RAISE EXCEPTION 'not_receiver';
        END IF;
    END IF;

    UPDATE public.battles SET status = 'declined' WHERE id = p_battle_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_battle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_battle(UUID) TO authenticated;


-- ── 3. cancel_battle ──────────────────────────────────────────────
-- starter 또는 receiver만 취소 가능 (pending/active 상태)
CREATE OR REPLACE FUNCTION public.cancel_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_battle RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'authentication_required';
    END IF;

    SELECT * INTO v_battle FROM public.battles WHERE id = p_battle_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
    IF v_battle.status NOT IN ('pending', 'active') THEN
        RAISE EXCEPTION 'battle_not_cancellable';
    END IF;

    IF v_battle.starter_id <> v_uid
       AND (v_battle.receiver_id IS NULL OR v_battle.receiver_id <> v_uid) THEN
        RAISE EXCEPTION 'not_participant';
    END IF;

    UPDATE public.battles SET status = 'cancelled' WHERE id = p_battle_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_battle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_battle(UUID) TO authenticated;


-- ── 4. battles UPDATE RLS 수정 ────────────────────────────────────
-- 기존: pending + receiver_id IS NULL이면 아무 로그인 사용자가 UPDATE 가능
-- 신규: starter 또는 확정된 receiver만 UPDATE 가능
--       수락/거절/취소는 RPC를 통해 처리 (SECURITY DEFINER로 서버 검증)
--       _advanceTurn(), _endBattle() 직접 update는 active 상태에서
--       receiver_id가 이미 세팅되므로 이 정책으로 커버됨
DROP POLICY IF EXISTS battles_update_participant ON public.battles;
CREATE POLICY battles_update_participant
    ON public.battles FOR UPDATE
    TO authenticated
    USING (starter_id = auth.uid() OR receiver_id = auth.uid());


-- ── 5. battle_messages INSERT RLS 수정 ───────────────────────────
-- 기존: WITH CHECK (true) — 아무 로그인 사용자나 insert 가능
-- 신규: 해당 battle의 starter 또는 receiver만 insert 가능
--       battle_messages에 user_id 컬럼이 없으므로 battles 서브쿼리로 검증
-- SELECT: 공개 유지 — 관전 기능(진행 중/완료 배틀 전체 관람 허용)
DROP POLICY IF EXISTS battle_messages_insert_auth ON public.battle_messages;
CREATE POLICY battle_messages_insert_participant
    ON public.battle_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.battles b
            WHERE b.id = battle_id
              AND (b.starter_id = auth.uid() OR b.receiver_id = auth.uid())
        )
    );

COMMIT;
