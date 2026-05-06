-- ================================================================
-- get_faction_leaderboard v2
--
-- 변경: representative_fighters 컬럼 추가
--   _renderFactionCards() 집단 선택 모달 호환성 유지를 위해 필요.
--   반환 타입 변경이므로 DROP 후 재생성.
-- ================================================================

DROP FUNCTION IF EXISTS public.get_faction_leaderboard();

CREATE FUNCTION public.get_faction_leaderboard()
RETURNS TABLE (
  rank                    BIGINT,
  faction_id              INTEGER,
  faction_name            TEXT,
  emoji_icon              TEXT,
  representative_fighters TEXT,
  member_count            INTEGER,
  total_win_points        INTEGER,
  win_picks               INTEGER,
  total_picks             INTEGER,
  accuracy                INTEGER
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
    )::BIGINT                                                                       AS rank,
    f.id::INTEGER                                                                   AS faction_id,
    f.name                                                                          AS faction_name,
    f.emoji_icon,
    f.representative_fighters,
    COUNT(DISTINCT u.id)::INTEGER                                                   AS member_count,
    COALESCE(
      SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0
    )::INTEGER                                                                      AS total_win_points,
    COUNT(p.id) FILTER (WHERE p.status = 'win')::INTEGER                            AS win_picks,
    COUNT(p.id) FILTER (
      WHERE p.status IN ('pending', 'win', 'lose')
    )::INTEGER                                                                      AS total_picks,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) = 0 THEN NULL
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.status = 'win')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) * 100
      )::INTEGER
    END                                                                             AS accuracy
  FROM public.factions f
  LEFT JOIN public.users  u ON u.faction_id = f.id
  LEFT JOIN public.picks  p ON p.user_id    = u.id
  GROUP BY f.id, f.name, f.emoji_icon, f.representative_fighters
  ORDER BY total_win_points DESC, win_picks DESC, member_count DESC;
$$;

REVOKE ALL ON FUNCTION public.get_faction_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faction_leaderboard() TO anon, authenticated;
