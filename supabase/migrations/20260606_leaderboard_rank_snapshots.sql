-- ================================================================
-- Leaderboard v2 — rank movement snapshots (phase 1, daily)
--
-- 1) public.user_rank_snapshots  — 시점별 전 유저 rank/points/belt 저장
--      RLS ON + 정책 없음 → anon/authenticated 직접 접근 0 (definer 함수로만).
-- 2) public.capture_leaderboard_snapshot(key, type, event_id)
--      service_role/postgres(pg_cron) 전용. anon/authenticated EXECUTE 금지.
--      RANK() OVER (ORDER BY points DESC), ON CONFLICT DO NOTHING (idempotent).
-- 3) get_leaderboard_v2 에 movement 컬럼 append
--      movement = (가장 최근 snapshot_key의 내 rank) - (현재 rank)
--      스냅샷 없으면/신규면 NULL. 기존 컬럼/계약 유지.
--
-- 정산/admin/settle-matchup/points/picks/RLS(users) 는 변경하지 않음.
-- belt 임계값은 LB2-A 와 동일: White<=1000, Blue<=2000, Purple<=5000, Brown<=10000, Black>10000.
--
-- cron (별도 운영 적용, 아래 명령을 leaderboard_daily_snapshot 으로 schedule):
--   select cron.schedule(
--     'leaderboard_daily_snapshot', '0 19 * * *',
--     $cron$ select public.capture_leaderboard_snapshot(
--              'daily-' || to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD'),
--              'daily') $cron$);
-- ================================================================

-- ── 1) 테이블 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_rank_snapshots (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key text        NOT NULL,
  trigger_type text        NOT NULL,
  event_id     uuid        NULL,
  user_id      uuid        NOT NULL,
  rank         int         NOT NULL,
  points       int         NOT NULL,
  belt         text        NOT NULL,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_rank_snapshots_key_user_uniq UNIQUE (snapshot_key, user_id),
  CONSTRAINT user_rank_snapshots_trigger_chk   CHECK (trigger_type IN ('daily','event_settled','manual')),
  CONSTRAINT user_rank_snapshots_user_fk  FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE,
  CONSTRAINT user_rank_snapshots_event_fk FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_urs_key_rank      ON public.user_rank_snapshots (snapshot_key, rank);
CREATE INDEX IF NOT EXISTS idx_urs_user_captured ON public.user_rank_snapshots (user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_urs_captured      ON public.user_rank_snapshots (captured_at DESC);

-- RLS ON, 정책 없음 → 직접 SELECT/INSERT/UPDATE/DELETE 모두 거부(definer 함수만 접근)
ALTER TABLE public.user_rank_snapshots ENABLE ROW LEVEL SECURITY;

-- ── 2) capture RPC (service_role / pg_cron 전용) ─────────────────
CREATE OR REPLACE FUNCTION public.capture_leaderboard_snapshot(
  p_snapshot_key text,
  p_trigger_type text,
  p_event_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_trigger_type NOT IN ('daily','event_settled','manual') THEN
    RAISE EXCEPTION 'invalid_trigger_type: %', p_trigger_type;
  END IF;

  WITH ranked AS (
    SELECT u.id AS user_id,
           RANK() OVER (ORDER BY COALESCE(u.points, 0) DESC) AS rank,
           COALESCE(u.points, 0) AS points,
           CASE
             WHEN COALESCE(u.points,0) <= 1000  THEN 'White'
             WHEN COALESCE(u.points,0) <= 2000  THEN 'Blue'
             WHEN COALESCE(u.points,0) <= 5000  THEN 'Purple'
             WHEN COALESCE(u.points,0) <= 10000 THEN 'Brown'
             ELSE 'Black'
           END AS belt
    FROM public.users u
  ),
  ins AS (
    INSERT INTO public.user_rank_snapshots
      (snapshot_key, trigger_type, event_id, user_id, rank, points, belt)
    SELECT p_snapshot_key, p_trigger_type, p_event_id, r.user_id, r.rank, r.points, r.belt
    FROM ranked r
    ON CONFLICT (snapshot_key, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_key', p_snapshot_key,
    'trigger_type', p_trigger_type,
    'inserted_count', v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_leaderboard_snapshot(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_leaderboard_snapshot(text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.capture_leaderboard_snapshot(text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_leaderboard_snapshot(text, text, uuid) TO service_role;

-- ── 3) get_leaderboard_v2 + movement (컬럼 append → DROP/CREATE 필요) ──
DROP FUNCTION IF EXISTS public.get_leaderboard_v2(integer);

CREATE OR REPLACE FUNCTION public.get_leaderboard_v2(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  rank          BIGINT,
  user_id       UUID,
  nickname      TEXT,
  faction_id    INTEGER,
  faction_emoji TEXT,
  faction_name  TEXT,
  belt          TEXT,
  points        INTEGER,
  settled_picks INTEGER,
  wins          INTEGER,
  losses        INTEGER,
  accuracy      INTEGER,
  percentile    INTEGER,
  movement      INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH latest_key AS (
    SELECT s.snapshot_key
    FROM public.user_rank_snapshots s
    ORDER BY s.captured_at DESC
    LIMIT 1
  ),
  prev AS (
    SELECT s.user_id, s.rank AS prev_rank
    FROM public.user_rank_snapshots s
    JOIN latest_key lk ON lk.snapshot_key = s.snapshot_key
  ),
  agg AS (
    SELECT
      u.id                                                       AS id,
      COALESCE(NULLIF(u.nickname, ''), 'UNKNOWN')                AS nickname,
      COALESCE(u.points, 0)                                      AS points,
      u.faction_id                                               AS faction_id,
      f.emoji_icon                                               AS faction_emoji,
      f.name                                                     AS faction_name,
      COUNT(p.id) FILTER (WHERE p.status = 'win')                AS wins,
      COUNT(p.id) FILTER (WHERE p.status = 'lose')               AS losses
    FROM public.users u
    LEFT JOIN public.factions f ON f.id = u.faction_id
    LEFT JOIN public.picks    p ON p.user_id = u.id
    GROUP BY u.id, u.nickname, u.points, u.faction_id, f.emoji_icon, f.name
  ),
  ranked AS (
    SELECT
      RANK() OVER (ORDER BY a.points DESC)  AS rank,
      COUNT(*) OVER ()                      AS total_users,
      a.id, a.nickname, a.points, a.faction_id, a.faction_emoji, a.faction_name,
      a.wins, a.losses,
      (a.wins + a.losses)                   AS settled_picks
    FROM agg a
  )
  SELECT
    r.rank::BIGINT                                              AS rank,
    r.id                                                       AS user_id,
    r.nickname                                                 AS nickname,
    r.faction_id::INTEGER                                      AS faction_id,
    r.faction_emoji                                            AS faction_emoji,
    r.faction_name                                             AS faction_name,
    CASE
      WHEN r.points <= 1000  THEN 'White'
      WHEN r.points <= 2000  THEN 'Blue'
      WHEN r.points <= 5000  THEN 'Purple'
      WHEN r.points <= 10000 THEN 'Brown'
      ELSE 'Black'
    END                                                        AS belt,
    r.points::INTEGER                                          AS points,
    r.settled_picks::INTEGER                                   AS settled_picks,
    r.wins::INTEGER                                            AS wins,
    r.losses::INTEGER                                          AS losses,
    CASE WHEN r.settled_picks = 0 THEN 0
         ELSE ROUND(r.wins::NUMERIC / r.settled_picks * 100)::INTEGER
    END                                                        AS accuracy,
    CASE WHEN r.total_users <= 1 THEN 100
         ELSE ROUND((r.total_users - r.rank)::NUMERIC / (r.total_users - 1) * 100)::INTEGER
    END                                                        AS percentile,
    CASE WHEN pr.prev_rank IS NULL THEN NULL
         ELSE (pr.prev_rank - r.rank)::INTEGER
    END                                                        AS movement
  FROM ranked r
  LEFT JOIN prev pr ON pr.user_id = r.id
  ORDER BY r.rank ASC, r.points DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_v2(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2(INTEGER) TO anon, authenticated;
