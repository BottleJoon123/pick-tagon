-- ================================================================
-- Security 2차 P1 — cache public write + staging import 잠금
--
-- 감사 결과(정상 쓰기 경로):
--   ufc_data_cache : 유일한 라이터 = Edge Function fetch-ufc-rankings(smart-service)
--                    → createClient(..., SERVICE_ROLE_KEY) 로 upsert.
--                    repo 내 클라이언트 리더/라이터 없음, 활성 cron 없음, 1행(낡은 캐시).
--                    service_role 은 rolbypassrls=true → RLS 정책/컬럼 REVOKE 와 무관하게 동작.
--   _staging_bulk_import(jsonb) : owner=postgres, SECURITY DEFINER.
--                    유일한 호출처 = scripts/_run_staging_import_mcp.py → MCP(postgres) 연결로 실행.
--                    anon/authenticated PostgREST 클라이언트 호출 경로 없음.
--                    함수 본문은 fighter_stats_staging 로의 ON CONFLICT DO NOTHING INSERT 뿐.
--
--   ※ news_cache 는 이번 범위에서 제외(수정 중단).
--     이유: 관리자 뉴스 UI(public/js/news-admin.js)가 authenticated/anon 세션으로
--           news_cache 에 직접 upsert/delete 한다(서비스 계정 경로 아님).
--           anon/authenticated 쓰기를 회수하면 관리자 뉴스 추가/삭제가 깨지며,
--           올바른 수정(is_admin() 가드 RPC 경유)은 프론트 수정이 필요해 이번 범위(프론트/Edge 수정 금지) 밖.
--           → 별도 작업으로 보고. 본 migration 은 news_cache 권한/정책을 건드리지 않는다.
--
-- 조치(이번 범위):
--   1) ufc_data_cache : anon/authenticated 직접 INSERT/UPDATE/DELETE/TRUNCATE 권한 회수,
--                       PUBLIC 대상 오설정 쓰기 정책 "Service write"(roles=PUBLIC, ALL) 제거.
--                       공개 읽기("Public read") 와 service_role 쓰기는 유지.
--   2) _staging_bulk_import : PUBLIC/anon/authenticated EXECUTE 회수, service_role-only.
--                       (정상 파이프라인 = postgres(owner)/service_role 만 사용 → 영향 없음)
--
-- 비변경: news_cache(권한/정책 전부), picks/users/points/정산 로직, fighters,
--         fighter_stats_staging(RLS/정책), Edge Function, 프론트, 기존 데이터.
--   (REFERENCES/TRIGGER 권한은 PostgREST 미도달 — 전역 권한 정리 시 일괄 처리 대상.)
-- ================================================================

-- ── 1) ufc_data_cache: 클라이언트 직접 쓰기 차단(공개 읽기 유지) ──────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ufc_data_cache FROM anon, authenticated;

-- 오설정 정책 제거: "Service write" 는 이름과 달리 roles=PUBLIC + cmd=ALL + USING true
-- → 사실상 모든 역할(anon 포함)에 INSERT/UPDATE/DELETE 를 허용하던 구멍.
-- service_role 은 RLS 를 우회하므로 쓰기 정책 없이도 정상 동작.
DROP POLICY IF EXISTS "Service write" ON public.ufc_data_cache;
-- 공개 읽기 정책 "Public read"(SELECT, USING true) 은 유지 — 변경하지 않음.

-- ── 2) _staging_bulk_import: service_role-only 로 잠금 ───────────────────────
REVOKE EXECUTE ON FUNCTION public._staging_bulk_import(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._staging_bulk_import(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public._staging_bulk_import(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public._staging_bulk_import(jsonb) TO service_role;
-- owner(postgres) 는 항상 실행 가능 → MCP/script 임포트 경로 유지.
