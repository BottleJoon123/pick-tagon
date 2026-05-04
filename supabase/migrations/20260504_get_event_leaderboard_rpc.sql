-- ================================================================
-- Common Data RPC Phase 4A: get_event_leaderboard
--
-- 목적: 이벤트별 리더보드를 DB에서 집계해 반환.
--       기존 프론트의 mock 데이터를 실데이터로 교체할 source of truth.
--
-- 집계 기준:
--   picks.matchup_id → matchups.event_id 조인
--   event_points = SUM(settled_payout) WHERE status = 'win'
--   accuracy = win / (win + lose) * 100 (settled pick 기준)
--   pending pick은 pending_count로 노출, 순위에 미포함
--
-- 보안:
--   SECURITY DEFINER — users.SELECT RLS(본인만)를 우회해 nickname 조회
--   반환값은 aggregate 전용; 개별 pick 선택(pick_name/predicted_side) 미노출
--   GRANT anon, authenticated — 공개 리더보드
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_event_leaderboard(p_event_id UUID)
RETURNS TABLE (
  rank          BIGINT,
  user_id       UUID,
  nickname      TEXT,
  event_points  INTEGER,
  total_picks   INTEGER,
  win_count     INTEGER,
  lose_count    INTEGER,
  cancel_count  INTEGER,
  pending_count INTEGER,
  accuracy      INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        SUM(p.settled_payout) FILTER (WHERE p.status = 'win') DESC NULLS LAST,
        COUNT(*) FILTER (WHERE p.status = 'win') DESC,
        COUNT(*) FILTER (WHERE p.status IN ('win','lose','cancelled','pending')) DESC
    )::BIGINT                                                             AS rank,
    p.user_id,
    u.nickname,
    COALESCE(SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0)::INTEGER
                                                                          AS event_points,
    COUNT(*)::INTEGER                                                     AS total_picks,
    COUNT(*) FILTER (WHERE p.status = 'win')::INTEGER                    AS win_count,
    COUNT(*) FILTER (WHERE p.status = 'lose')::INTEGER                   AS lose_count,
    COUNT(*) FILTER (WHERE p.status = 'cancelled')::INTEGER              AS cancel_count,
    COUNT(*) FILTER (WHERE p.status = 'pending')::INTEGER                AS pending_count,
    CASE
      WHEN COUNT(*) FILTER (WHERE p.status IN ('win','lose')) = 0 THEN NULL
      ELSE ROUND(
        COUNT(*) FILTER (WHERE p.status = 'win')::NUMERIC /
        COUNT(*) FILTER (WHERE p.status IN ('win','lose')) * 100
      )::INTEGER
    END                                                                   AS accuracy
  FROM public.picks p
  JOIN public.matchups m ON m.id = p.matchup_id
  JOIN public.users    u ON u.id = p.user_id
  WHERE m.event_id = p_event_id
    AND p.user_id  IS NOT NULL
  GROUP BY p.user_id, u.nickname
  ORDER BY 4 DESC, 6 DESC, 5 DESC;
$$;

REVOKE ALL ON FUNCTION public.get_event_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_leaderboard(UUID) TO anon, authenticated;
