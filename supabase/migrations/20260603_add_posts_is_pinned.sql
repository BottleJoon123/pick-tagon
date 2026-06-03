-- Community C3-2: pinned posts (공지 고정) — admin-only
-- posts.id bigint. RLS: SELECT public(true); UPDATE/INSERT own-post-only.
-- The own-post UPDATE/INSERT policies are column-agnostic, so without a guard a normal
-- owner could self-pin their own post (is_pinned=true) via PostgREST and force it to the
-- top of everyone's feed. Pinning must be admin-only → (1) admin RPC is the intended path,
-- (2) a BEFORE INSERT/UPDATE guard reverts is_pinned changes from non-admins. private.is_admin()
-- reads auth.uid(); inside the admin RPC the caller is the admin so the guard allows it.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_pinned_created
  ON public.posts(is_pinned DESC, created_at DESC);

-- ── Admin-only guard: only private.is_admin() may set/clear is_pinned ──
CREATE OR REPLACE FUNCTION public.posts_guard_is_pinned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pinned IS TRUE AND NOT private.is_admin() THEN
      NEW.is_pinned := false;            -- 비관리자 신규글은 고정 불가
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: is_pinned 변경은 관리자만, 그 외 컬럼 변경(글 수정 등)은 그대로 허용
  IF NEW.is_pinned IS DISTINCT FROM OLD.is_pinned AND NOT private.is_admin() THEN
    NEW.is_pinned := OLD.is_pinned;      -- 변경 무시(되돌림), 다른 컬럼 변경은 통과
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_guard_is_pinned ON public.posts;
CREATE TRIGGER trg_posts_guard_is_pinned
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.posts_guard_is_pinned();

-- ── Admin pin/unpin RPC (sole intended write path for is_pinned) ──
CREATE OR REPLACE FUNCTION public.admin_set_post_pinned(p_post_id bigint, p_is_pinned boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_before boolean;
  v_new    boolean := COALESCE(p_is_pinned, false);
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT is_pinned INTO v_before FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  UPDATE public.posts SET is_pinned = v_new WHERE id = p_post_id;

  INSERT INTO public.admin_audit_logs
    (admin_user_id, action, entity_table, entity_id, before_data, after_data)
  VALUES (
    v_uid, 'set_post_pinned', 'posts', p_post_id::text,
    jsonb_build_object('is_pinned', v_before),
    jsonb_build_object('is_pinned', v_new)
  );

  RETURN jsonb_build_object('ok', true, 'post_id', p_post_id, 'is_pinned', v_new);
END;
$$;

-- authenticated 만 호출 가능. PUBLIC + anon EXECUTE 명시적으로 회수
-- (Supabase 기본 권한이 anon 에도 EXECUTE 를 부여하므로 anon 도 명시 회수). admin_required 가 최종 방어.
REVOKE ALL ON FUNCTION public.admin_set_post_pinned(bigint, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_post_pinned(bigint, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_post_pinned(bigint, boolean) TO authenticated;
