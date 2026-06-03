-- Community author nickname full sync (no users RLS change)
-- users RLS is users_select_own (auth.uid()=id) so a guest/other viewer can't read
-- users.nickname via embed. Instead we keep posts.nickname as the rendered source of
-- truth and sync it to users.nickname: (1) one-time backfill, (2) an authenticated RPC
-- the client calls after a nickname change to update only the caller's own posts.
-- post_comments (user_nick snapshot, no user_id) is intentionally out of scope.

-- ── 1) One-time backfill: align posts.nickname to users.nickname ──
-- only posts with a user_id, non-empty users.nickname, and a real difference.
UPDATE public.posts p
SET nickname = u.nickname
FROM public.users u
WHERE p.user_id = u.id
  AND u.nickname IS NOT NULL
  AND btrim(u.nickname) <> ''
  AND p.nickname IS DISTINCT FROM u.nickname;

-- ── 2) RPC: caller syncs their OWN posts' nickname to their current users.nickname ──
CREATE OR REPLACE FUNCTION public.sync_my_post_nickname()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_nick text;
  v_cnt  integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT nickname INTO v_nick FROM public.users WHERE id = v_uid;
  IF v_nick IS NULL OR btrim(v_nick) = '' THEN
    RETURN jsonb_build_object('ok', true, 'updated_count', 0, 'nickname', v_nick, 'note', 'no_nickname');
  END IF;

  -- 본인(user_id = auth.uid()) 글만, 다른 유저 글은 절대 건드리지 않음
  UPDATE public.posts
     SET nickname = v_nick
   WHERE user_id = v_uid
     AND nickname IS DISTINCT FROM v_nick;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated_count', v_cnt, 'nickname', v_nick);
END;
$$;

-- authenticated 만 호출. PUBLIC + anon EXECUTE 명시 회수.
REVOKE ALL ON FUNCTION public.sync_my_post_nickname() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_my_post_nickname() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_my_post_nickname() TO authenticated;
