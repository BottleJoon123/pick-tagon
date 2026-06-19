-- ================================================================
-- 아카이브 리캡 2차: archive_events ↔ 원본 events 안정 연결 (source_event_id)
--
--   배경: 리캡은 archive_events.name + event_date ↔ events.title + event_date 복합키로
--   canonical event_id 를 찾는다. 제목/날짜가 바뀌면 매핑이 깨질 수 있어, archive_events 에
--   원본 events 행을 직접 가리키는 source_event_id 를 둔다(제목/날짜 변경에 안전).
--
--   설계:
--     • archive_events.source_event_id uuid NULL, FK → events(id) ON DELETE SET NULL.
--     • partial unique index: source_event_id IS NOT NULL 인 행은 source_event_id 유일.
--       (한 events 행에 두 archive_events 가 연결되는 것을 방지.)
--     • 백필: 정규화제목+event_date 가 events 와 정확히 1:1(이벤트 측 유일 + 아카이브 측 유일)일 때만.
--       0건/복수이벤트/아카이브충돌/날짜NULL → NULL 유지(추측 연결 금지).
--     • 자동연결 트리거(BEFORE INSERT OR UPDATE OF name,event_date): source_event_id 가 NULL 이고
--       정규화제목+event_date 가 정확히 1개 이벤트와 매칭되며 그 이벤트가 아직 미점유면 채움.
--       이미 값이 있으면 보존(제목/날짜 변경에도 유지). 모호/충돌이면 NULL.
--   정규화: lower(btrim(regexp_replace(x, '\s+', ' ', 'g'))). events.event_date(timestamptz) → ::date.
--
--   범위: archive_events 컬럼 1개 + FK + partial unique index + 백필 UPDATE + 자동연결 함수/트리거.
--   events/matchups/picks/fighters/archive_fights 데이터 미변경(source_event_id 백필 외).
-- ================================================================

-- ── A. 컬럼 ─────────────────────────────────────────────────────
ALTER TABLE public.archive_events
    ADD COLUMN IF NOT EXISTS source_event_id uuid;

-- ── B. FK (ON DELETE SET NULL) ──────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.archive_events'::regclass
          AND conname = 'archive_events_source_event_id_fkey'
    ) THEN
        ALTER TABLE public.archive_events
            ADD CONSTRAINT archive_events_source_event_id_fkey
            FOREIGN KEY (source_event_id) REFERENCES public.events(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ── C. partial unique index ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS archive_events_source_event_id_uniq
    ON public.archive_events (source_event_id)
    WHERE source_event_id IS NOT NULL;

-- ── D. 백필 (정확히 1:1 매칭만; 이벤트측·아카이브측 모두 유일) ────
WITH match AS (
    SELECT ae.id AS ae_id,
        (SELECT count(*) FROM public.events e
           WHERE lower(btrim(regexp_replace(coalesce(e.title,''),'\s+',' ','g')))
               = lower(btrim(regexp_replace(coalesce(ae.name,''),'\s+',' ','g')))
             AND e.event_date::date = ae.event_date) AS ev_cnt,
        (SELECT e.id FROM public.events e
           WHERE lower(btrim(regexp_replace(coalesce(e.title,''),'\s+',' ','g')))
               = lower(btrim(regexp_replace(coalesce(ae.name,''),'\s+',' ','g')))
             AND e.event_date::date = ae.event_date
           ORDER BY e.id LIMIT 1) AS ev_id
    FROM public.archive_events ae
    WHERE ae.source_event_id IS NULL AND ae.event_date IS NOT NULL
),
ae_per_ev AS (
    SELECT ev_id, count(*) AS ae_cnt
    FROM match WHERE ev_cnt = 1 AND ev_id IS NOT NULL
    GROUP BY ev_id
)
UPDATE public.archive_events ae
   SET source_event_id = m.ev_id
  FROM match m
  JOIN ae_per_ev ape ON ape.ev_id = m.ev_id
 WHERE ae.id = m.ae_id
   AND m.ev_cnt = 1            -- 이벤트 측 유일
   AND ape.ae_cnt = 1;         -- 아카이브 측 유일(충돌 방지)

-- ── E. 자동연결 함수 ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_events_autolink_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm text;
    v_cnt  int;
    v_eid  uuid;
BEGIN
    IF NEW.source_event_id IS NOT NULL THEN
        RETURN NEW;                       -- 이미 연결됨 → 보존(제목/날짜 변경에도 유지)
    END IF;
    IF NEW.name IS NULL OR NEW.event_date IS NULL THEN
        RETURN NEW;                       -- 키 불완전 → NULL 유지
    END IF;

    v_norm := lower(btrim(regexp_replace(NEW.name, '\s+', ' ', 'g')));

    SELECT count(*), (array_agg(e.id ORDER BY e.id))[1]
      INTO v_cnt, v_eid
      FROM public.events e
     WHERE lower(btrim(regexp_replace(coalesce(e.title,''),'\s+',' ','g'))) = v_norm
       AND e.event_date::date = NEW.event_date;

    -- 정확히 1개 이벤트 매칭 + 그 이벤트가 아직 다른 archive_events 에 미점유 → 연결.
    -- 0건/복수이벤트/충돌이면 NULL 유지(추측 연결 금지).
    IF v_cnt = 1 AND v_eid IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.archive_events ae
            WHERE ae.source_event_id = v_eid
              AND ae.id IS DISTINCT FROM NEW.id
       )
    THEN
        NEW.source_event_id := v_eid;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.archive_events_autolink_source() OWNER TO postgres;

-- 신규 SECURITY DEFINER 함수 권한 정리: 기존 운영 규칙대로 PUBLIC/anon/authenticated EXECUTE 명시 회수.
-- (트리거는 테이블 소유자 권한으로 자동 실행되므로 직접 EXECUTE 는 service_role/owner 만 필요.)
REVOKE ALL ON FUNCTION public.archive_events_autolink_source() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_events_autolink_source() FROM anon;
REVOKE ALL ON FUNCTION public.archive_events_autolink_source() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.archive_events_autolink_source() TO service_role;

-- ── F. 트리거 (INSERT / name·event_date UPDATE 시 자동연결) ──────
-- FK 의 ON DELETE SET NULL(source_event_id 단독 UPDATE)에서는 발동하지 않도록
-- name, event_date 변경에만 한정(불필요한 재연결 방지).
DROP TRIGGER IF EXISTS trg_archive_events_autolink ON public.archive_events;
CREATE TRIGGER trg_archive_events_autolink
    BEFORE INSERT OR UPDATE OF name, event_date ON public.archive_events
    FOR EACH ROW
    EXECUTE FUNCTION public.archive_events_autolink_source();
