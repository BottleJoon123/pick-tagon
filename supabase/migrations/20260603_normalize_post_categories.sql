-- Community C3-3: normalize posts.category to a fixed allowed list.
-- Previously category was derived from the title prefix ([분석]/[파이터]/[라이브]/[뉴스]/[유머]);
-- there was no category column. We add one, backfill from the title prefix, then enforce
-- NOT NULL DEFAULT 'general' + CHECK. Allowed: analysis, fighter, live, news, humor, general.
-- Only public.posts is touched.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS category text;

-- Backfill from title prefix; anything unrecognized / null-title → general.
UPDATE public.posts SET category =
  CASE
    WHEN title LIKE '[분석]%'  THEN 'analysis'
    WHEN title LIKE '[파이터]%' THEN 'fighter'
    WHEN title LIKE '[라이브]%' THEN 'live'
    WHEN title LIKE '[뉴스]%'  THEN 'news'
    WHEN title LIKE '[유머]%'  THEN 'humor'
    ELSE 'general'
  END
WHERE category IS NULL
   OR category NOT IN ('analysis','fighter','live','news','humor','general');

-- Safety: any remaining null/empty → general (before NOT NULL / CHECK).
UPDATE public.posts SET category = 'general'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE public.posts ALTER COLUMN category SET DEFAULT 'general';
ALTER TABLE public.posts ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_category_chk;
ALTER TABLE public.posts ADD CONSTRAINT posts_category_chk
  CHECK (category IN ('analysis','fighter','live','news','humor','general'));

CREATE INDEX IF NOT EXISTS idx_posts_category_created
  ON public.posts(category, created_at DESC);
