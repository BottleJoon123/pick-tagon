-- ================================================================
-- YouTube 안정 수집 V1 — public.youtube_cache (서버 수집 캐시 테이블)
--
-- 배경:
--   프론트(public/js/youtube.js)가 r.jina.ai → YouTube 를 직접 스크래핑했으나
--   403/CAPTCHA 로 ~83% 실패(간헐 성공). 프론트 재시도/regex 보강은 완화일 뿐 근본 해결이 아님.
--   → 수집을 서버(Edge Function refresh-youtube-cache)로 이전하고, 프론트는 이 캐시만 SELECT 한다.
--
-- 이 테이블:
--   • 공개 읽기(anon/authenticated SELECT) + 서버 전용 쓰기(service_role) — news_cache 와 동일 모델.
--   • 개인식별정보(user_id/email/nickname) 미포함 — 순수 공개 영상 메타데이터.
--   • 정상 쓰기 주체: Edge Function refresh-youtube-cache 가 createClient(..., SERVICE_ROLE_KEY) 로 upsert.
--     service_role 은 rolbypassrls=true → 정책/권한과 무관하게 쓰기 가능.
--   • (query, video_id) UNIQUE → 재수집 시 idempotent upsert(중복 영상 누적 방지). arbiter 로 사용.
--
-- 비변경: users/picks/points/settlement/news_cache/기존 정책·데이터.
--   RLS ON + 공개 SELECT 정책 1개 + write 권한 회수. anon/authenticated 는 SELECT 만 가능.
--
-- cron (별도 운영 적용 — Edge Function 배포 후, 아래를 youtube_cache_refresh 로 schedule):
--   -- pg_net(net.http_post)로 Edge Function 을 secret 헤더와 함께 호출(무인증 refresh 차단).
--   -- select cron.schedule(
--   --   'youtube_cache_refresh', '0 */6 * * *',   -- 6시간마다(뉴스 갱신 주기와 정합)
--   --   $cron$ select net.http_post(
--   --     url    := 'https://<PROJECT_REF>.functions.supabase.co/refresh-youtube-cache',
--   --     headers:= jsonb_build_object('x-refresh-secret', '<REFRESH_SECRET>'),
--   --     body   := '{}'::jsonb) $cron$);
--   -- (REFRESH_SECRET / YOUTUBE_API_KEY 는 Edge secret 으로만 보관 — 프론트 노출 없음.)
--
-- idempotent: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS 후 CREATE, 권한 REVOKE/GRANT 반복 안전.
-- ================================================================

-- ── 1) 테이블 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.youtube_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query         text        NOT NULL,
  video_id      text        NOT NULL,
  title         text        NOT NULL,
  channel_title text        NULL,
  thumbnail_url text        NULL,
  published_at  timestamptz NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  source        text        NOT NULL DEFAULT 'youtube',
  CONSTRAINT youtube_cache_query_video_uniq UNIQUE (query, video_id)
);

-- 인덱스: query별 최신 조회(프론트) + 전역 fetched_at(운영/prune)
CREATE INDEX IF NOT EXISTS idx_youtube_cache_query_pub  ON public.youtube_cache (query, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_youtube_cache_query      ON public.youtube_cache (query);
CREATE INDEX IF NOT EXISTS idx_youtube_cache_fetched    ON public.youtube_cache (fetched_at DESC);

-- ── 2) RLS: 공개 읽기만, 쓰기는 service_role 전용 ────────────────
ALTER TABLE public.youtube_cache ENABLE ROW LEVEL SECURITY;

-- 공개 SELECT 정책(anon/authenticated). 쓰기 정책은 두지 않음 → 직접 쓰기 전부 거부.
DROP POLICY IF EXISTS youtube_cache_select_public ON public.youtube_cache;
CREATE POLICY youtube_cache_select_public
  ON public.youtube_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 3) 테이블 권한: 읽기만 공개, 쓰기 회수, service_role 명시 허용 ──
-- (20260607 default-privileges 하드닝 이후 anon/authenticated 는 기본 무권한 → SELECT 를 명시 GRANT)
REVOKE ALL     ON public.youtube_cache FROM anon, authenticated;
GRANT  SELECT  ON public.youtube_cache TO   anon, authenticated;
-- 직접 쓰기 명시 회수(정책 부재로도 거부되나, 이중 방어)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.youtube_cache FROM anon, authenticated;
-- 서버 수집 주체
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.youtube_cache TO service_role;
