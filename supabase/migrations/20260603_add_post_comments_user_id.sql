-- Community C3-4: add post_comments.user_id (basis for future comment-author sync).
-- post_comments only had user_nick (snapshot), so comment authors don't reflect nickname
-- changes. We add a nullable user_id FK and force it to auth.uid() on INSERT via trigger
-- (anti-spoof). Existing comments keep user_id NULL and fall back to user_nick. users RLS
-- is NOT changed; no full users SELECT exposure. Only public.post_comments is touched.

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_user_id
  ON public.post_comments(user_id);

-- Force user_id = auth.uid() on every insert; ignore any client-supplied value (no spoofing).
-- INSERT policy is authenticated-only, so auth.uid() is normally present; if null, stays null.
CREATE OR REPLACE FUNCTION public.post_comments_set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_set_user_id ON public.post_comments;
CREATE TRIGGER trg_post_comments_set_user_id
  BEFORE INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.post_comments_set_user_id();
