-- ==========================================================
-- Release-Fix-11C (Part 2): posts column-level UPDATE hardening
-- 2026-05-28
-- 배경:
--   column-level REVOKE (REVOKE UPDATE (col) FROM role)는
--   table-level GRANT UPDATE가 살아있으면 무력화됨.
--   올바른 방법: table-level REVOKE 후 column-specific GRANT.
--
-- 적용 후 허용 상태:
--   authenticated: title, content 컬럼만 직접 UPDATE 가능 (owner-only RLS 적용)
--   anon: posts UPDATE 전혀 불가
--   likes / user_id: 클라이언트 직접 UPDATE 불가
--   likes 변경: increment_post_likes RPC (SECURITY DEFINER, postgres 역할로 실행)
-- ==========================================================

-- Step 1: table-level UPDATE 제거
REVOKE UPDATE ON posts FROM authenticated;
REVOKE UPDATE ON posts FROM anon;

-- Step 2: authenticated는 title, content 컬럼만 직접 UPDATE 허용
-- (belt, nickname, is_pick_share, comments, likes, user_id 등은 클라이언트 직접 변경 불가)
GRANT UPDATE (title, content) ON posts TO authenticated;

-- NOTE: increment_post_likes RPC는 SECURITY DEFINER (postgres 역할로 실행)이므로
--       위 REVOKE의 영향을 받지 않고 likes UPDATE 가능.
