-- ================================================================
-- Phase 5A: Faction Ranking RPCs
--
-- get_faction_leaderboard()
--   목적: 집단별 픽 성과 집계 리더보드.
--   source: factions LEFT JOIN users LEFT JOIN picks
--   factions.total_score는 현재 dead field (increment_faction_score 호출 없음).
--   이 RPC가 집단 랭킹의 공식 source of truth.
--
-- get_faction_member_rankings(p_faction_id INTEGER)
--   목적: 특정 집단 내 멤버별 픽 성과 순위.
--   source: users LEFT JOIN picks WHERE users.faction_id = p_faction_id
--
-- 집계 기준:
--   total_win_points = SUM(settled_payout) WHERE status='win'
--   total_picks      = pending + win + lose (cancelled 제외)
--   accuracy         = win / (win + lose) * 100, win+lose=0이면 NULL
-- ================================================================

-- ── get_faction_leaderboard ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_faction_leaderboard()
RETURNS TABLE (
  rank              BIGINT,
  faction_id        INTEGER,
  faction_name      TEXT,
  emoji_icon        TEXT,
  member_count      INTEGER,
  total_win_points  INTEGER,
  win_picks         INTEGER,
  total_picks       INTEGER,
  accuracy          INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    RANK() OVER (
      ORDER BY
        COALESCE(SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0) DESC,
        COUNT(p.id)        FILTER (WHERE p.status = 'win')                 DESC,
        COUNT(DISTINCT u.id)                                               DESC
    )::BIGINT                                                                      AS rank,
    f.id::INTEGER                                                                  AS faction_id,
    f.name                                                                         AS faction_name,
    f.emoji_icon,
    COUNT(DISTINCT u.id)::INTEGER                                                  AS member_count,
    COALESCE(
      SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0
    )::INTEGER                                                                     AS total_win_points,
    COUNT(p.id) FILTER (WHERE p.status = 'win')::INTEGER                           AS win_picks,
    COUNT(p.id) FILTER (
      WHERE p.status IN ('pending', 'win', 'lose')
    )::INTEGER                                                                     AS total_picks,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) = 0 THEN NULL
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.status = 'win')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) * 100
      )::INTEGER
    END                                                                            AS accuracy
  FROM public.factions f
  LEFT JOIN public.users  u ON u.faction_id = f.id
  LEFT JOIN public.picks  p ON p.user_id    = u.id
  GROUP BY f.id, f.name, f.emoji_icon
  ORDER BY total_win_points DESC, win_picks DESC, member_count DESC;
$$;

REVOKE ALL ON FUNCTION public.get_faction_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faction_leaderboard() TO anon, authenticated;


-- ── get_faction_member_rankings ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_faction_member_rankings(p_faction_id INTEGER)
RETURNS TABLE (
  rank        BIGINT,
  user_id     UUID,
  nickname    TEXT,
  net_points  INTEGER,
  win_picks   INTEGER,
  lose_picks  INTEGER,
  total_picks INTEGER,
  accuracy    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    RANK() OVER (
      ORDER BY
        COALESCE(SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0) DESC,
        COUNT(p.id) FILTER (WHERE p.status = 'win')                         DESC
    )::BIGINT                                                                      AS rank,
    u.id                                                                           AS user_id,
    u.nickname,
    COALESCE(
      SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0
    )::INTEGER                                                                     AS net_points,
    COUNT(p.id) FILTER (WHERE p.status = 'win')::INTEGER                           AS win_picks,
    COUNT(p.id) FILTER (WHERE p.status = 'lose')::INTEGER                          AS lose_picks,
    COUNT(p.id) FILTER (
      WHERE p.status IN ('pending', 'win', 'lose')
    )::INTEGER                                                                     AS total_picks,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) = 0 THEN NULL
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.status = 'win')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) * 100
      )::INTEGER
    END                                                                            AS accuracy
  FROM public.users u
  LEFT JOIN public.picks p ON p.user_id = u.id
  WHERE u.faction_id = p_faction_id
  GROUP BY u.id, u.nickname
  ORDER BY net_points DESC, win_picks DESC;
$$;

REVOKE ALL ON FUNCTION public.get_faction_member_rankings(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faction_member_rankings(INTEGER) TO anon, authenticated;
