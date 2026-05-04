-- ================================================================
-- Common Data RPC Phase 4C: get_event_pick_ratios
--
-- 목적: 이벤트 내 매치업별 red/blue 픽 비율을 집계해 반환.
--       대진표 픽 바 및 커뮤니티 픽 비율의 공식 source of truth.
--
-- source-of-truth: picks 테이블 (event_picks 사용 안 함)
--   이유 1) picks.predicted_side 가 더 정확 ('red'/'blue'/'draw'/'nc')
--   이유 2) picks.status 로 cancelled(NC/무승부 환급) 제외 가능
--   이유 3) event_picks 에는 레거시 'f1','f2' 등 UUID 매핑 불가 fight_id 존재
--   이유 4) event_picks 는 cancelled 픽이 정리되지 않아 집계 오염
--
-- 집계 포함 status: pending, win, lose
-- 집계 제외 status: cancelled (NC/무승부로 환급된 픽)
-- 집계 포함 predicted_side: 'red', 'blue' 만
--   (draw/nc 픽은 비율에 포함하지 않음 — 사실상 없어야 하나 방어적 필터)
--
-- 반환: 이벤트의 모든 matchup을 포함 (pick 0개인 경우도 0/0/0)
-- 정렬: card_segment, sort_order (대진표 순서와 동일)
-- 보안: aggregate만 반환, 개별 pick 내용(pick_name/predicted_side) 미노출
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_event_pick_ratios(p_event_id UUID)
RETURNS TABLE (
  matchup_id   UUID,
  red_count    INTEGER,
  blue_count   INTEGER,
  total_count  INTEGER,
  red_pct      INTEGER,
  blue_pct     INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    m.id                                                                 AS matchup_id,
    COUNT(p.id) FILTER (WHERE p.predicted_side = 'red')::INTEGER        AS red_count,
    COUNT(p.id) FILTER (WHERE p.predicted_side = 'blue')::INTEGER       AS blue_count,
    COUNT(p.id) FILTER (
      WHERE p.predicted_side IN ('red', 'blue')
    )::INTEGER                                                           AS total_count,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.predicted_side IN ('red','blue')) = 0 THEN 0
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.predicted_side = 'red')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.predicted_side IN ('red','blue')) * 100
      )::INTEGER
    END                                                                  AS red_pct,
    CASE
      WHEN COUNT(p.id) FILTER (WHERE p.predicted_side IN ('red','blue')) = 0 THEN 0
      ELSE ROUND(
        COUNT(p.id) FILTER (WHERE p.predicted_side = 'blue')::NUMERIC /
        COUNT(p.id) FILTER (WHERE p.predicted_side IN ('red','blue')) * 100
      )::INTEGER
    END                                                                  AS blue_pct
  FROM public.matchups m
  LEFT JOIN public.picks p
    ON  p.matchup_id = m.id
    AND p.predicted_side IN ('red', 'blue')
    AND p.status IN ('pending', 'win', 'lose')
  WHERE m.event_id = p_event_id
  GROUP BY m.id, m.card_segment, m.sort_order
  ORDER BY
    CASE m.card_segment WHEN 'main' THEN 0 ELSE 1 END,
    m.sort_order;
$$;

REVOKE ALL ON FUNCTION public.get_event_pick_ratios(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_pick_ratios(UUID) TO anon, authenticated;
