-- Community C3-5: soft delete for posts and comments.
-- MVP: authors and admins can delete their own posts/comments. We use SOFT delete
-- (deleted_at/deleted_by) instead of hard delete so content is recoverable and
-- likes/comments are preserved. Deletion goes only through SECURITY DEFINER RPCs
-- (delete_post / delete_post_comment) which enforce "owner OR private.is_admin()".
-- The pre-existing client-callable hard DELETE policy on posts is removed so the
-- soft-delete RPC is the single deletion path (cannot be bypassed). users RLS is
-- NOT changed; no full users SELECT exposure. Only public.posts / public.post_comments
-- are touched.

-- ── 1. soft-delete columns ──
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- partial indexes to keep "not deleted" feed/comment scans fast
CREATE INDEX IF NOT EXISTS idx_posts_not_deleted
  ON public.posts(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_comments_not_deleted
  ON public.post_comments(post_id) WHERE deleted_at IS NULL;

-- ── 2. remove bypassable hard-delete path ──
-- Previously authors could hard-delete their own posts directly. Soft delete via RPC
-- replaces this; dropping the policy STRENGTHENS RLS (no client DELETE remains).
DROP POLICY IF EXISTS "own post delete" ON public.posts;

-- ── 2b. pinned guard: a (soft-)deleted post is never pinned ──
-- The C3-2 guard reverts is_pinned changes for non-admins. When a non-admin owner
-- deletes their own (admin-)pinned post, delete_post's is_pinned=false would be
-- reverted. We extend the guard so any row with deleted_at set is forced unpinned.
-- Non-deleted posts keep the original C3-2 pin protection unchanged (no regression).
CREATE OR REPLACE FUNCTION public.posts_guard_is_pinned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pinned IS TRUE AND NOT private.is_admin() THEN
      NEW.is_pinned := false;
    END IF;
    RETURN NEW;
  END IF;
  -- a soft-deleted post is never pinned (overrides pin protection for deleted rows)
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.is_pinned := false;
    RETURN NEW;
  END IF;
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned AND NOT private.is_admin() THEN
    NEW.is_pinned := OLD.is_pinned;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. delete_post RPC ──
CREATE OR REPLACE FUNCTION public.delete_post(p_post_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_deleted timestamptz;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT user_id, deleted_at INTO v_owner, v_deleted
  FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  v_admin := private.is_admin();
  IF NOT ((v_owner IS NOT NULL AND v_owner = v_uid) OR v_admin) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- idempotent: already deleted → return ok
  IF v_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'post_id', p_post_id,
                              'deleted_at', v_deleted, 'already_deleted', true);
  END IF;

  UPDATE public.posts
     SET deleted_at = now(), deleted_by = v_uid, is_pinned = false
   WHERE id = p_post_id
   RETURNING deleted_at INTO v_deleted;

  -- audit only moderation (admin deleting someone else's post), mirrors admin_set_post_pinned
  IF v_admin AND (v_owner IS DISTINCT FROM v_uid) THEN
    INSERT INTO public.admin_audit_logs
      (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, 'delete_post', 'posts', p_post_id::text,
            jsonb_build_object('deleted_at', null),
            jsonb_build_object('deleted_at', v_deleted, 'deleted_by', v_uid));
  END IF;

  RETURN jsonb_build_object('ok', true, 'post_id', p_post_id, 'deleted_at', v_deleted);
END;
$$;

-- ── 4. delete_post_comment RPC ──
CREATE OR REPLACE FUNCTION public.delete_post_comment(p_comment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_deleted timestamptz;
  v_admin   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT user_id, deleted_at INTO v_owner, v_deleted
  FROM public.post_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  v_admin := private.is_admin();
  -- legacy comments (user_id NULL) cannot be self-claimed → admin only
  IF NOT ((v_owner IS NOT NULL AND v_owner = v_uid) OR v_admin) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'comment_id', p_comment_id,
                              'deleted_at', v_deleted, 'already_deleted', true);
  END IF;

  UPDATE public.post_comments
     SET deleted_at = now(), deleted_by = v_uid
   WHERE id = p_comment_id
   RETURNING deleted_at INTO v_deleted;

  IF v_admin AND (v_owner IS DISTINCT FROM v_uid) THEN
    INSERT INTO public.admin_audit_logs
      (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, 'delete_post_comment', 'post_comments', p_comment_id::text,
            jsonb_build_object('deleted_at', null),
            jsonb_build_object('deleted_at', v_deleted, 'deleted_by', v_uid));
  END IF;

  RETURN jsonb_build_object('ok', true, 'comment_id', p_comment_id, 'deleted_at', v_deleted);
END;
$$;

-- ── 5. grants: authenticated only (no anon / no PUBLIC) ──
REVOKE ALL ON FUNCTION public.delete_post(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_post(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_post(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_post_comment(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_post_comment(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_post_comment(bigint) TO authenticated;
