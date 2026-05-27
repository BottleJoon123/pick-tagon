-- ==========================================================
-- Release-Fix-11C: Secure posts UPDATE RLS + increment_post_likes RPC
-- 2026-05-28
-- 목적: broad "posts likes update" (USING: true) 제거,
--       좋아요는 SECURITY DEFINER RPC로만 처리,
--       게시글 수정은 owner-only로 제한
-- ==========================================================

-- ─── Step 1: increment_post_likes RPC ──────────────────────
-- 좋아요 증가를 atomic하게 처리.
-- SECURITY DEFINER로 실행 → RLS 우회하여 posts.likes UPDATE 가능.
-- auth.uid() null → EXCEPTION으로 거부.
-- post_likes UNIQUE(post_id, user_id) ON CONFLICT DO NOTHING → 중복 방지.
-- FOUND = true인 경우에만 likes 증가.

CREATE OR REPLACE FUNCTION increment_post_likes(p_post_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO post_likes (post_id, user_id)
  VALUES (p_post_id, auth.uid())
  ON CONFLICT (post_id, user_id) DO NOTHING;

  IF FOUND THEN
    UPDATE posts SET likes = likes + 1 WHERE id = p_post_id;
  END IF;
END;
$$;

-- authenticated 유저만 RPC 호출 가능 (anon 제외)
REVOKE EXECUTE ON FUNCTION increment_post_likes(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_post_likes(bigint) TO authenticated;


-- ─── Step 2: UPDATE 정책 교체 ──────────────────────────────
-- 기존: USING true (anyone can update any row, any column)
-- 신규: USING auth.uid() = user_id (owner-only)

DROP POLICY IF EXISTS "posts likes update" ON posts;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posts' AND policyname = 'own post update'
  ) THEN
    CREATE POLICY "own post update"
    ON posts
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ─── Step 3: Column-level 보강 ─────────────────────────────
-- posts.likes: 클라이언트 직접 UPDATE 불가, RPC로만 변경
-- posts.user_id: 생성 후 변경 불필요, 클라이언트 직접 UPDATE 불가
-- SECURITY DEFINER 함수(postgres 역할로 실행)는 이 제한에 영향 없음

REVOKE UPDATE (likes, user_id) ON posts FROM authenticated;
REVOKE UPDATE (likes, user_id) ON posts FROM anon;
