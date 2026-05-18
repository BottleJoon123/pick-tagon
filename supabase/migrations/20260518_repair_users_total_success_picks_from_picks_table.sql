-- ================================================================
-- Repair users.total_picks / users.success_picks
--
-- 문제: 일부 유저의 users.total_picks, users.success_picks가
--       실제 picks 테이블 집계와 불일치. (예: KINGBOTTLE total=17 vs 실제 33)
--       원인: 수동 repair 스크립트 반복 실행, 직접 INSERT된 picks 등.
--
-- 수정: picks 테이블을 source-of-truth로 삼아 일괄 동기화.
--       total_picks  = picks 테이블 전체 행 수 (상태 무관)
--       success_picks = status = 'win' 행 수
--       불일치 유저만 업데이트 (noop for correct rows)
-- ================================================================

UPDATE public.users u
SET
  total_picks   = COALESCE(sub.total_all,   0),
  success_picks = COALESCE(sub.win_count,   0)
FROM (
  SELECT
    user_id,
    COUNT(*)                                    AS total_all,
    COUNT(*) FILTER (WHERE status = 'win')      AS win_count
  FROM public.picks
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id
  AND (u.total_picks IS DISTINCT FROM sub.total_all
    OR u.success_picks IS DISTINCT FROM sub.win_count);
