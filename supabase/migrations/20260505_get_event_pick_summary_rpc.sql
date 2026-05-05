-- ================================================================
-- Common Data RPC Phase 4D: get_event_pick_summary
--
-- 목적: 이벤트별 픽 집계 통계를 반환.
--       어드민 대시보드, 이벤트 결과 카드, 랭킹 시스템의 공식 source of truth.
--
-- source: events LEFT JOIN matchups LEFT JOIN picks
--   이벤트 행을 anchor로 잡아 픽 없는 이벤트도 0값 1행 반환.
--   존재하지 않는 event_id는 0행 반환.
--
-- 집계 기준:
--   total_picks     = COUNT(p.id) — status 무관 전체 픽
--   unique_bettors  = COUNT(DISTINCT p.user_id)
--   win/lose/cancelled/pending = status별 COUNT
--   total_paid_out  = SUM(settled_payout) WHERE status='win'
--   bonus_paid_out  = SUM(GREATEST(settled_payout - base_payout, 0)) WHERE status='win'
--     base_payout NULL → COALESCE(base_payout, settled_payout) → 차액 = 0 (방어)
--     음수 방어: GREATEST(..., 0)
--   accuracy        = win / (win + lose) * 100 (NULL if no settled picks)
--   upset_wins      = is_upset=true AND status='win'
--
-- total_wagered 제외: payout/bet_cost 필드 의미 혼재 (레거시 데이터) → 별도 정리 후 추가
--
-- 반환: TABLE (단일 이벤트 기준 0 or 1행)
-- 권한: anon, authenticated (공개 이벤트 집계, 개인 데이터 미포함)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_event_pick_summary(p_event_id UUID)
RETURNS TABLE (
  event_id        UUID,
  total_picks     INTEGER,
  unique_bettors  INTEGER,
  win_picks       INTEGER,
  lose_picks      INTEGER,
  cancelled_picks INTEGER,
  pending_picks   INTEGER,
  total_paid_out  INTEGER,
  bonus_paid_out  INTEGER,
  accuracy        INTEGER,
  upset_wins      INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id                                                                     AS event_id,
    COUNT(p.id)::INTEGER                                                     AS total_picks,
    COUNT(DISTINCT p.user_id)::INTEGER                                       AS unique_bettors,
    COUNT(p.id) FILTER (WHERE p.status = 'win')::INTEGER                     AS win_picks,
    COUNT(p.id) FILTER (WHERE p.status = 'lose')::INTEGER                    AS lose_picks,
    COUNT(p.id) FILTER (WHERE p.status = 'cancelled')::INTEGER               AS cancelled_picks,
    COUNT(p.id) FILTER (WHERE p.status = 'pending')::INTEGER                 AS pending_picks,
    COALESCE(
      SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0
    )::INTEGER                                                               AS total_paid_out,
    COALESCE(
      SUM(
        GREATEST(
          p.settled_payout - COALESCE(p.base_payout, p.settled_payout),
          0
        )
      ) FILTER (WHERE p.status = 'win'),
      0
    )::INTEGER                                                               AS bonus_paid_out,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) = 0 THEN NULL
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.status = 'win')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.status IN ('win', 'lose')) * 100
      )::INTEGER
    END                                                                      AS accuracy,
    COUNT(p.id) FILTER (WHERE p.is_upset = true AND p.status = 'win')::INTEGER
                                                                             AS upset_wins
  FROM public.events e
  LEFT JOIN public.matchups m ON m.event_id = e.id
  LEFT JOIN public.picks    p ON p.matchup_id = m.id
  WHERE e.id = p_event_id
  GROUP BY e.id;
$$;

REVOKE ALL ON FUNCTION public.get_event_pick_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_pick_summary(UUID) TO anon, authenticated;
