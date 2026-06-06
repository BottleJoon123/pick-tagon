-- ================================================================
-- Leaderboard v2 — snapshot prune (보관 정책)
--
-- public.prune_leaderboard_snapshots(p_keep_days int=90, p_min_keep_keys int=7)
--   public.user_rank_snapshots 에서만 삭제.
--   삭제 기준: captured_at < now() - keep_days
--             단, "최신 p_min_keep_keys 개 distinct snapshot_key"(키별 최대 captured_at 기준)는
--             날짜와 무관하게 무조건 보존 → 데이터가 적을 때 전체가 날아가는 사고 방지.
--   daily/event_settled/manual 혼재 — recency 기반 키 보존이라 trigger_type 무관하게
--   최근 키는 모두 보호됨(1차는 daily 중심이지만 event/manual 최근 key도 자동 보존).
--   방어: keep_days < 30 → 30 clamp, min_keep_keys < 3 → 3 clamp.
--
--   service_role / pg_cron(postgres) 전용. anon/authenticated EXECUTE 금지.
--   정산/users/picks/points/admin 테이블은 건드리지 않음(snapshots 단일 테이블만 DELETE).
--
-- cron (별도 운영 적용, leaderboard_snapshot_prune 으로 schedule):
--   select cron.schedule('leaderboard_snapshot_prune','30 19 * * 0',
--          $cron$ select public.prune_leaderboard_snapshots(90, 7) $cron$);
--   ('30 19 * * 0' = UTC 일 19:30 = KST 월 04:30, daily snapshot 이후)
-- ================================================================

CREATE OR REPLACE FUNCTION public.prune_leaderboard_snapshots(
  p_keep_days     int DEFAULT 90,
  p_min_keep_keys int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep_days int := GREATEST(COALESCE(p_keep_days, 90), 30);   -- 최소 30일
  v_min_keys  int := GREATEST(COALESCE(p_min_keep_keys, 7), 3); -- 최소 3개 키
  v_deleted   int;
  v_rows      int;
  v_keys      int;
BEGIN
  WITH keep_keys AS (
    SELECT s.snapshot_key
    FROM (
      SELECT snapshot_key, MAX(captured_at) AS mx
      FROM public.user_rank_snapshots
      GROUP BY snapshot_key
      ORDER BY mx DESC
      LIMIT v_min_keys
    ) s
  ),
  del AS (
    DELETE FROM public.user_rank_snapshots t
    WHERE t.captured_at < now() - make_interval(days => v_keep_days)
      AND t.snapshot_key NOT IN (SELECT snapshot_key FROM keep_keys)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  SELECT COUNT(*), COUNT(DISTINCT snapshot_key)
    INTO v_rows, v_keys
  FROM public.user_rank_snapshots;

  RETURN jsonb_build_object(
    'ok',             true,
    'deleted_count',  v_deleted,
    'keep_days',      v_keep_days,
    'min_keep_keys',  v_min_keys,
    'remaining_rows', v_rows,
    'remaining_keys', v_keys
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_leaderboard_snapshots(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_leaderboard_snapshots(int, int) FROM anon;
REVOKE ALL ON FUNCTION public.prune_leaderboard_snapshots(int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_leaderboard_snapshots(int, int) TO service_role;
