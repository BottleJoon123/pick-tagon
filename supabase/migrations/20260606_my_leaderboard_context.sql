-- ================================================================
-- Leaderboard v2 — my context RPC (LB2-B)
--
-- get_my_leaderboard_context()
--   목적: 로그인 사용자의 My Rank 히어로 / 내 주변 ±2 / 최근 5픽 form을
--         "전체 유저 기준" 실데이터로 한 번에 반환.
--   authenticated 전용. anon EXECUTE 금지(REVOKE PUBLIC, GRANT authenticated).
--   내부에서 auth.uid() 없으면 'auth_required'(28000) 예외.
--   users RLS는 변경하지 않음 — 전체 집계는 definer 함수로만 노출.
--
--   rank/percentile/accuracy/belt 기준은 LB2-A(get_leaderboard_v2)와 동일.
--     rank      = users.points DESC (RANK())
--     accuracy  = settled win/(win+lose) (없으면 0)
--     belt      = White<=1000, Blue<=2000, Purple<=5000, Brown<=10000, Black>10000
--   email/is_admin/auth 정보 미반환.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_total         integer;
  v_rank          bigint;
  v_points        integer;
  v_belt          text;
  v_above_points  integer;
  v_next_belt     text;
  v_next_belt_min integer;
  v_nearby        jsonb;
  v_form          jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.users;

  -- 내 rank/points/belt (전체 기준)
  WITH agg AS (
    SELECT u.id, COALESCE(u.points, 0) AS points
    FROM public.users u
  ),
  ranked AS (
    SELECT id, points, RANK() OVER (ORDER BY points DESC) AS rank
    FROM agg
  )
  SELECT r.rank, r.points,
         CASE
           WHEN r.points <= 1000  THEN 'White'
           WHEN r.points <= 2000  THEN 'Blue'
           WHEN r.points <= 5000  THEN 'Purple'
           WHEN r.points <= 10000 THEN 'Brown'
           ELSE 'Black'
         END
    INTO v_rank, v_points, v_belt
  FROM ranked r
  WHERE r.id = v_uid;

  -- users 행이 없으면(엣지) null-safe 최소 결과 → 프론트 fallback
  IF v_rank IS NULL THEN
    RETURN jsonb_build_object(
      'my_rank', NULL, 'total_users', v_total, 'percentile', NULL,
      'my_points', NULL, 'my_belt', NULL, 'next_belt', NULL,
      'next_belt_points', NULL, 'points_to_next_belt', NULL,
      'points_to_next_rank', NULL,
      'nearby_rankers', '[]'::jsonb, 'recent_form', '[]'::jsonb
    );
  END IF;

  -- 바로 위 랭커까지 포인트 차 (1위/공동선두면 NULL)
  SELECT MIN(COALESCE(u.points, 0)) INTO v_above_points
  FROM public.users u
  WHERE COALESCE(u.points, 0) > v_points;

  -- 다음 벨트
  v_next_belt := CASE v_belt
    WHEN 'White'  THEN 'Blue'
    WHEN 'Blue'   THEN 'Purple'
    WHEN 'Purple' THEN 'Brown'
    WHEN 'Brown'  THEN 'Black'
    ELSE NULL END;
  v_next_belt_min := CASE v_belt
    WHEN 'White'  THEN 1001
    WHEN 'Blue'   THEN 2001
    WHEN 'Purple' THEN 5001
    WHEN 'Brown'  THEN 10001
    ELSE NULL END;

  -- 내 주변 ±2 (전체 기준 rank)
  WITH agg AS (
    SELECT u.id, COALESCE(NULLIF(u.nickname, ''), 'UNKNOWN') AS nickname,
           COALESCE(u.points, 0) AS points, u.faction_id,
           f.name AS faction_name, f.emoji_icon AS faction_emoji,
           COUNT(p.id) FILTER (WHERE p.status = 'win')  AS wins,
           COUNT(p.id) FILTER (WHERE p.status = 'lose') AS losses
    FROM public.users u
    LEFT JOIN public.factions f ON f.id = u.faction_id
    LEFT JOIN public.picks    p ON p.user_id = u.id
    GROUP BY u.id, u.nickname, u.points, u.faction_id, f.name, f.emoji_icon
  ),
  ranked AS (
    SELECT RANK() OVER (ORDER BY points DESC) AS rank,
           id, nickname, points, faction_id, faction_name, faction_emoji,
           CASE WHEN (wins + losses) = 0 THEN 0
                ELSE ROUND(wins::numeric / (wins + losses) * 100)::int END AS accuracy,
           CASE
             WHEN points <= 1000  THEN 'White'
             WHEN points <= 2000  THEN 'Blue'
             WHEN points <= 5000  THEN 'Purple'
             WHEN points <= 10000 THEN 'Brown'
             ELSE 'Black'
           END AS belt
    FROM agg
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'rank', r.rank, 'user_id', r.id, 'nickname', r.nickname,
             'points', r.points, 'belt', r.belt,
             'faction_id', r.faction_id, 'faction_name', r.faction_name,
             'faction_emoji', r.faction_emoji, 'accuracy', r.accuracy,
             'is_me', (r.id = v_uid)
           ) ORDER BY r.rank
         ), '[]'::jsonb)
    INTO v_nearby
  FROM ranked r
  WHERE r.rank BETWEEN v_rank - 2 AND v_rank + 2;

  -- 최근 settled pick 5개 (win/lose만, settled_at desc)
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'status',     t.status,
             'matchup_id', t.matchup_id,
             'label',      t.label,
             'settled_at', t.settled_at,
             'payout',     t.payout
           ) ORDER BY t.settled_at DESC NULLS LAST
         ), '[]'::jsonb)
    INTO v_form
  FROM (
    SELECT CASE WHEN p.status = 'win' THEN 'W' ELSE 'L' END AS status,
           p.matchup_id, p.match_name AS label, p.settled_at,
           p.settled_payout AS payout
    FROM public.picks p
    WHERE p.user_id = v_uid AND p.status IN ('win', 'lose')
    ORDER BY p.settled_at DESC NULLS LAST
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'my_rank',             v_rank,
    'total_users',         v_total,
    'percentile',          CASE WHEN v_total <= 1 THEN 100
                                ELSE ROUND((v_total - v_rank)::numeric / (v_total - 1) * 100)::int END,
    'my_points',           v_points,
    'my_belt',             v_belt,
    'next_belt',           v_next_belt,
    'next_belt_points',    v_next_belt_min,
    'points_to_next_belt', CASE WHEN v_next_belt_min IS NULL THEN 0
                                ELSE GREATEST(v_next_belt_min - v_points, 0) END,
    'points_to_next_rank', COALESCE(v_above_points - v_points, 0),
    'nearby_rankers',      v_nearby,
    'recent_form',         v_form
  );
END;
$$;

-- authenticated 전용. PUBLIC + anon(기본 권한으로 부여될 수 있음) 모두 명시적 REVOKE.
REVOKE ALL ON FUNCTION public.get_my_leaderboard_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_context() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_context() TO authenticated;
