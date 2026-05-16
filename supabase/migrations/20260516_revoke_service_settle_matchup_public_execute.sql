-- ================================================================
-- Security Fix: service_settle_matchup 직접 호출 권한 차단
--
-- 발견: QA_RUN_2026-05-16_ADMIN_RESULT_PATH_B.md FINDING-01
--
-- 문제: service_settle_matchup의 실제 DB proacl에 anon/authenticated
--       EXECUTE가 남아 있음. 함수 본문에 is_admin() 체크가 없어
--       비관리자가 직접 RPC 호출로 matchup 결과/포인트 변경 가능.
--
-- 의도: 이 함수는 내부 전용(service_role) 함수로 설계됨.
--       외부 진입점은 admin_set_matchup_result (is_admin() + audit log).
--
-- 조치:
--   - PUBLIC, anon, authenticated REVOKE
--   - service_role GRANT 유지
--   - postgres(owner) 권한 변경 없음
--   - admin_set_matchup_result는 SECURITY DEFINER로 실행되므로
--     내부 service_settle_matchup 호출 경로는 그대로 동작함
-- ================================================================

REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO service_role;
