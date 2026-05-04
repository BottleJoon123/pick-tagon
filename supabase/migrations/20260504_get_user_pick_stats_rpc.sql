-- ================================================================
-- Common Data RPC Phase 4B: get_user_pick_stats
--
-- 목적: 유저별 픽 통계를 DB에서 집계해 JSONB로 반환.
--       프론트 localStorage/state 기반 계산을 대체하는 공식 source of truth.
--
-- 집계 기준:
--   source: picks JOIN matchups (weight_class 획득 목적)
--   settled_picks = status IN ('win','lose','cancelled') 합산
--   accuracy = win / (win + lose) * 100 (cancelled/pending 제외)
--   net_points  = SUM(settled_payout) WHERE status = 'win'
--   by_weight_class: picks → matchups.weight_class 조인, 체급별 win/lose/accuracy
--   by_method: picks.actual_method 기준 (예측 방식이 아닌 실제 결과 방식)
--   upset stats: picks.is_upset 필터
--
-- 반환: JSONB 단일 객체 (픽 없는 유저도 0/null 정상 반환)
-- 권한: authenticated 전용 (개인 데이터)
-- 보안: SECURITY DEFINER (일관성 유지; users 조인 없으므로 RLS 우회 불필요)
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_user_pick_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'settled_picks',
      COUNT(*) FILTER (WHERE p.status IN ('win', 'lose', 'cancelled'))::INTEGER,
    'win_count',
      COUNT(*) FILTER (WHERE p.status = 'win')::INTEGER,
    'lose_count',
      COUNT(*) FILTER (WHERE p.status = 'lose')::INTEGER,
    'cancel_count',
      COUNT(*) FILTER (WHERE p.status = 'cancelled')::INTEGER,
    'pending_count',
      COUNT(*) FILTER (WHERE p.status = 'pending')::INTEGER,
    'accuracy',
      CASE
        WHEN COUNT(*) FILTER (WHERE p.status IN ('win', 'lose')) = 0 THEN NULL
        ELSE ROUND(
          COUNT(*) FILTER (WHERE p.status = 'win')::NUMERIC /
          COUNT(*) FILTER (WHERE p.status IN ('win', 'lose')) * 100
        )::INTEGER
      END,
    'net_points',
      COALESCE(SUM(p.settled_payout) FILTER (WHERE p.status = 'win'), 0)::INTEGER,
    'upset_wins',
      COUNT(*) FILTER (WHERE p.is_upset = true AND p.status = 'win')::INTEGER,
    'upset_picks',
      COUNT(*) FILTER (WHERE p.is_upset = true)::INTEGER,

    -- 체급별 win/lose/accuracy (현재 이벤트뿐 아니라 전체 픽 기준)
    'by_weight_class', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'weight_class', wc.weight_class,
          'win_count',    wc.win_count,
          'lose_count',   wc.lose_count,
          'total',        wc.total,
          'accuracy',
            CASE WHEN (wc.win_count + wc.lose_count) = 0 THEN NULL
                 ELSE ROUND(
                   wc.win_count::NUMERIC / (wc.win_count + wc.lose_count) * 100
                 )::INTEGER
            END
        ) ORDER BY wc.total DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          m2.weight_class,
          COUNT(*) FILTER (WHERE p2.status = 'win')::INTEGER   AS win_count,
          COUNT(*) FILTER (WHERE p2.status = 'lose')::INTEGER  AS lose_count,
          COUNT(*)::INTEGER                                     AS total
        FROM public.picks p2
        JOIN public.matchups m2 ON m2.id = p2.matchup_id
        WHERE p2.user_id = p_user_id
          AND m2.weight_class IS NOT NULL
        GROUP BY m2.weight_class
      ) wc
    ),

    -- 실제 결과 방식별 승리/정산 픽 수
    -- actual_method NULL = 미정산(pending) 또는 NC/draw → 제외
    'by_method', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'method',    am.actual_method,
          'win_count', am.win_count,
          'total',     am.total
        ) ORDER BY am.win_count DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          p3.actual_method,
          COUNT(*) FILTER (WHERE p3.status = 'win')::INTEGER   AS win_count,
          COUNT(*)::INTEGER                                     AS total
        FROM public.picks p3
        WHERE p3.user_id = p_user_id
          AND p3.actual_method IS NOT NULL
          AND p3.status IN ('win', 'lose')
        GROUP BY p3.actual_method
      ) am
    )
  )
  FROM public.picks p
  WHERE p.user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_pick_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_pick_stats(UUID) TO authenticated;
