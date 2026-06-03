-- Community C3-1: real post view_count + safe increment RPC
-- posts.id is bigint. RLS: SELECT public(true), UPDATE own-post-only (auth.uid()=user_id).
-- View increment must NOT open posts UPDATE to users → use a SECURITY DEFINER RPC that
-- increments only view_count, runs as the function owner (bypasses RLS), and is the sole
-- write path. Existing rows default to 0.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_view_count_nonneg_chk;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_view_count_nonneg_chk CHECK (view_count >= 0);

CREATE OR REPLACE FUNCTION public.increment_post_view(p_post_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  UPDATE public.posts
     SET view_count = view_count + 1
   WHERE id = p_post_id
   RETURNING view_count INTO v_new;
  IF NOT FOUND THEN
    RETURN NULL;  -- 존재하지 않는 post_id → 호출측에서 무시
  END IF;
  RETURN v_new;
END;
$$;

-- 권한: 기본 PUBLIC EXECUTE 회수 후 anon/authenticated 에게만 부여.
-- (커뮤니티 SELECT가 게스트 공개이므로 비로그인 조회수도 집계)
-- service_role/postgres 의 소유자 권한은 건드리지 않음.
REVOKE ALL ON FUNCTION public.increment_post_view(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_view(bigint) TO anon, authenticated;
