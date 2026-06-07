-- ================================================================
-- Security P2 후속 — 비식별 Realtime 신호로 event_picks 공개 SELECT 제거
--
-- 배경:
--   라이브 선택률 갱신을 위해 프론트가 event_picks 를 postgres_changes 구독 →
--   그러나 event_picks 는 supabase_realtime publication 에 없어 실제로는 미작동.
--   동시에 event_picks 공개 SELECT(USING true) 가 user_id/fight_id/fighter_index 원자료를
--   anon 까지 노출. → 비식별 신호 테이블로 Realtime 을 재구성하고 원자료 SELECT 를 본인 한정으로 축소.
--
-- 설계 안전성:
--   • event_picks.event_id 는 TEXT 이며 'ufc327'(비-uuid 레거시) 값을 포함 →
--     신호 테이블 event_id 를 uuid+events FK 로 두면 트리거가 place_pick/change_pick 트랜잭션
--     안에서 invalid uuid / FK 위반으로 실패해 픽 생성이 깨질 수 있음.
--     ∴ event_id 는 TEXT PRIMARY KEY, FK 생략(비식별 공개 이벤트 식별자라 안전).
--   • 신호 테이블은 event_id/version/updated_at 3컬럼만 — 개인/선택 정보 없음.
--   • 선택률 정답 소스는 기존 get_event_pick_ratios(picks 기반) 유지(계산식 미변경).
--   • place_pick/change_pick/정산 본문 미변경, event_picks 데이터 미변경.
-- ================================================================

-- ── B) 비식별 신호 테이블 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_pick_signals (
  event_id   text        PRIMARY KEY,         -- 공개 이벤트 식별자(비식별). FK 생략(레거시 비-uuid 허용)
  version    bigint      NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_pick_signals ENABLE ROW LEVEL SECURITY;

-- 권한: anon/authenticated 는 SELECT 만, 쓰기 금지. service_role 정상.
REVOKE ALL ON public.event_pick_signals FROM anon, authenticated;
GRANT  SELECT ON public.event_pick_signals TO anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.event_pick_signals TO service_role;

-- 공개 SELECT 정책(노출 컬럼은 event_id/version/updated_at 뿐). 쓰기 정책 없음 → 트리거(정의자)/service_role 만 기록.
DROP POLICY IF EXISTS event_pick_signals_select_public ON public.event_pick_signals;
CREATE POLICY event_pick_signals_select_public ON public.event_pick_signals
  FOR SELECT TO anon, authenticated USING (true);

-- ── C) event_picks 변경 → 신호 version 증가 트리거 ───────────────────────
CREATE OR REPLACE FUNCTION public.bump_event_pick_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new text;
  v_old text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_new := OLD.event_id; v_old := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := NEW.event_id; v_old := NULL;
  ELSE  -- UPDATE: event_id 가 바뀌면 OLD/NEW 양쪽 신호 갱신
    v_new := NEW.event_id;
    v_old := CASE WHEN NEW.event_id IS DISTINCT FROM OLD.event_id THEN OLD.event_id ELSE NULL END;
  END IF;

  IF v_new IS NOT NULL THEN
    INSERT INTO public.event_pick_signals (event_id, version, updated_at)
    VALUES (v_new, 1, now())
    ON CONFLICT (event_id) DO UPDATE
      SET version = public.event_pick_signals.version + 1, updated_at = now();
  END IF;

  IF v_old IS NOT NULL THEN
    INSERT INTO public.event_pick_signals (event_id, version, updated_at)
    VALUES (v_old, 1, now())
    ON CONFLICT (event_id) DO UPDATE
      SET version = public.event_pick_signals.version + 1, updated_at = now();
  END IF;

  RETURN NULL;  -- AFTER 트리거
END;
$$;

-- 함수 EXECUTE 는 PUBLIC/anon/authenticated 회수(운영 규칙). 트리거 발동에는 grant 불필요.
REVOKE EXECUTE ON FUNCTION public.bump_event_pick_signal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_event_pick_signal() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_event_picks_signal ON public.event_picks;
CREATE TRIGGER trg_event_picks_signal
AFTER INSERT OR UPDATE OR DELETE ON public.event_picks
FOR EACH ROW EXECUTE FUNCTION public.bump_event_pick_signal();

-- ── D) Realtime publication 에 신호 테이블 추가(멱등) ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname='supabase_realtime' AND n.nspname='public' AND c.relname='event_pick_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_pick_signals;
  END IF;
END $$;
-- (event_picks 는 애초에 publication 에 없음 → 제거 대상 없음)

-- ── E) event_picks 공개 SELECT 축소(본인 한정) ──────────────────────────
DROP POLICY IF EXISTS "누구나 픽 통계 조회 가능" ON public.event_picks;
DROP POLICY IF EXISTS event_picks_select_own ON public.event_picks;
CREATE POLICY event_picks_select_own ON public.event_picks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE SELECT ON public.event_picks FROM anon;
-- authenticated SELECT grant 유지(본인 막대 하이라이트). 직접 쓰기 차단 상태/ service_role/postgres 유지.
