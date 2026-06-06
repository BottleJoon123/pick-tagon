-- ================================================================
-- Security P2 — post_comments 작성자 신원 서버 강제 (user_id + user_nick)
--
-- 배경:
--   INSERT 정책이 WITH CHECK(true) 라 클라이언트가 보낸 user_nick 을 그대로 저장 →
--   user_id 는 기존 트리거가 auth.uid() 로 강제하지만 user_nick(표시명)은 무방비 →
--   타 사용자 닉네임 사칭(표시 임퍼소네이션) 가능. (user_id 자체는 진실)
--
-- 조치:
--   기존 BEFORE INSERT 트리거 함수 post_comments_set_user_id() 를 확장:
--     • auth.uid() IS NULL → 'auth_required' 예외(로그인 필수, RLS 와 이중 방어)
--     • NEW.user_id  := auth.uid()                  (클라이언트 전송 user_id 무시)
--     • NEW.user_nick := public.users.nickname       (클라이언트 전송 user_nick 무시)
--       - users RLS(users_select_own = auth.uid()=id)에 의존하지 않도록 SECURITY DEFINER(owner=postgres)
--         로 전환하여 nickname 을 신뢰성 있게 조회. users RLS/정책은 변경하지 않음.
--       - nickname 이 null/empty 면 'nickname_required' 예외로 작성 차단(명확한 오류).
--         (user_nick 은 NOT NULL 컬럼이며 현재 모든 users 가 nickname 보유 → 정상 사용 영향 없음)
--
-- 비변경:
--   • 기존 댓글/레거시(user_id null) row backfill 없음(BEFORE INSERT 트리거 → 신규 INSERT 만 영향).
--   • post_comments INSERT 정책/권한, UPDATE/DELETE 정책(부재), soft-delete RPC delete_post_comment 무변경.
--   • users RLS/정책/권한, posts/picks/points/settlement/community 로직 무변경.
--   • 프론트 무변경(클라이언트가 보낸 user_id/user_nick 은 서버가 덮어씀).
-- ================================================================

CREATE OR REPLACE FUNCTION public.post_comments_set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_nick text;
BEGIN
  -- 댓글 작성은 로그인 필수(RLS INSERT 정책과 이중 방어)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  -- 작성자 신원은 서버가 강제 — 클라이언트가 보낸 user_id 는 무시
  NEW.user_id := v_uid;

  -- 표시명도 서버가 강제 — 클라이언트가 보낸 user_nick 무시, users.nickname 으로 고정
  SELECT NULLIF(btrim(u.nickname), '')
    INTO v_nick
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_nick IS NULL THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;

  NEW.user_nick := v_nick;

  RETURN NEW;
END;
$$;
