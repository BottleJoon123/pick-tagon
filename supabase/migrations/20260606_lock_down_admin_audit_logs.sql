-- ================================================================
-- Security 후속 — admin_audit_logs 직접 쓰기 권한 잠금 (defense-in-depth)
--
-- 감사 결과(read-only):
--   • RLS = ON. 정책은 SELECT 1개뿐:
--       admin_audit_logs_select_admin (authenticated, USING private.is_admin())
--     → INSERT/UPDATE/DELETE 정책이 없어 RLS 가 이미 anon/authenticated 직접 쓰기를 차단.
--       (실측: anon/auth INSERT → 42501, non-admin UPDATE/DELETE → 0행/무효)
--   • 그러나 테이블 GRANT 는 anon/authenticated 에 full CRUD(INSERT/UPDATE/DELETE/TRUNCATE/SELECT…)
--     로 과다 부여되어 있음 → RLS 로 무력화되어 있을 뿐, 최소권한 위배(잠재 위험).
--   • 정상 기록 주체: admin_audit_logs 에 INSERT 하는 함수 30개 전부 owner=postgres + SECURITY DEFINER
--     (admin_settle_event, admin_upsert_news, admin_delete_news, admin_set_matchup_result …).
--     정의자(owner postgres) 는 grant/RLS 와 무관하게 기록. service_role 은 rolbypassrls=true.
--     → anon/authenticated 직접 grant 에 의존하는 정상 writer 없음 → 회수 안전.
--   • 프론트(js/html)에서 admin_audit_logs 직접 접근 없음(grep 무매치).
--   • 관리자 조회 경로: admin_audit_logs_select_admin(is_admin) 정책으로 충분 → 유지.
--
-- 조치:
--   1) anon/authenticated 직접 INSERT/UPDATE/DELETE/TRUNCATE 권한 회수.
--   2) anon SELECT 권한 회수(감사 로그는 anon 이 읽을 일 없음; RLS 로도 0행이나 grant 레벨에서 차단).
--   3) authenticated SELECT 는 유지 → 기존 admin-only SELECT 정책(is_admin) 동작 보존.
--
-- 비변경: SELECT 정책 admin_audit_logs_select_admin, service_role 권한,
--         정의자 RPC 본문, 기존 감사 로그 데이터, users/picks/points/settlement/news_cache.
--   (공개 write 정책은 애초에 없음 — 제거 대상 없음.)
-- ================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM anon, authenticated;
REVOKE SELECT ON public.admin_audit_logs FROM anon;
-- authenticated SELECT 유지: admin_audit_logs_select_admin (USING private.is_admin()) 가 admin 으로 제한.
