-- ================================================================
-- Leaderboard v2 — full-user, settled-accuracy RPCs (LB2-A)
--
-- get_leaderboard_v2(p_limit)
--   목적: 전체 유저 기준 랭킹 리스트(상위 p_limit). 기존 get_leaderboard(top-N,
--         users 직접조회)를 대체할 풍부한 컬럼 + settled 정확도 제공.
--   rank      = users.points DESC (RANK())
--   wins      = picks.status = 'win'
--   losses    = picks.status = 'lose'
--   settled   = wins + losses
--   accuracy  = settled > 0 ? round(wins/settled*100) : 0   (settled 기준)
--   percentile= 전체 유저 수 기준 상위 백분위 (rank1=100, 최하=0)
--   belt      = points 임계값 (_LB_TIERS / getBeltInfo 와 동일)
--               White <=1000, Blue <=2000, Purple <=5000, Brown <=10000, Black >10000
--   nickname null/'' → 'UNKNOWN'
--   email/is_admin/auth 정보 미반환.
--
-- get_leaderboard_summary()
--   목적: 표시 범위가 아닌 "전체 유저" 기준 요약 (벨트 분포/총원).
--   total_users       = 전체 users 수
--   ranked_users      = points > 0 인 유저 수
--   belt_distribution = {white,blue,purple,brown,black} (전체 users 기준)
--   avg_accuracy      = SUM(wins)/SUM(wins+losses)*100 (micro-average), 0 when none
--
-- 보안: 둘 다 SECURITY DEFINER + search_path 고정.
--   users RLS(본인 행만 SELECT)는 변경하지 않음 — 전체 집계는 definer RPC로만.
--   REVOKE ALL FROM PUBLIC 후 anon, authenticated 에만 EXECUTE 부여(기존 패턴).
-- ================================================================

-- ── get_leaderboard_v2 ───────────────────────────────────────────

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
  percentile    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH agg AS (
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
    END                                                        AS percentile
  FROM ranked r
  ORDER BY r.rank ASC, r.points DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_v2(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2(INTEGER) TO anon, authenticated;


-- ── get_leaderboard_summary ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_leaderboard_summary()
RETURNS TABLE (
  total_users       INTEGER,
  ranked_users      INTEGER,
  belt_distribution JSONB,
  avg_accuracy      INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH agg AS (
    SELECT
      u.id                                            AS id,
      COALESCE(u.points, 0)                           AS points,
      COUNT(p.id) FILTER (WHERE p.status = 'win')     AS wins,
      COUNT(p.id) FILTER (WHERE p.status = 'lose')    AS losses
    FROM public.users u
    LEFT JOIN public.picks p ON p.user_id = u.id
    GROUP BY u.id, u.points
  )
  SELECT
    COUNT(*)::INTEGER                                  AS total_users,
    COUNT(*) FILTER (WHERE points > 0)::INTEGER        AS ranked_users,
    jsonb_build_object(
      'white',  COUNT(*) FILTER (WHERE points <= 1000),
      'blue',   COUNT(*) FILTER (WHERE points > 1000  AND points <= 2000),
      'purple', COUNT(*) FILTER (WHERE points > 2000  AND points <= 5000),
      'brown',  COUNT(*) FILTER (WHERE points > 5000  AND points <= 10000),
      'black',  COUNT(*) FILTER (WHERE points > 10000)
    )                                                  AS belt_distribution,
    CASE
      WHEN SUM(wins + losses) = 0 THEN 0
      ELSE ROUND(SUM(wins)::NUMERIC / SUM(wins + losses) * 100)::INTEGER
    END                                                AS avg_accuracy
  FROM agg;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_summary() TO anon, authenticated;
