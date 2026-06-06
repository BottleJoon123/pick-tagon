-- ================================================================
-- Security 후속 — postgres 역할 default privileges 최소권한화 (신규 객체 한정)
--
-- 배경:
--   pg_default_acl(FOR ROLE postgres, schema public) 가 신규 객체에 anon/authenticated
--   과다 권한을 자동 부여:
--     • TABLES    : anon/authenticated = arwdDxtm (INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
--     • SEQUENCES : anon/authenticated = rwU (SELECT/UPDATE/USAGE)
--     • FUNCTIONS : anon/authenticated = X (EXECUTE)
--   → 새 테이블이 생길 때마다 anon 에 풀 DML 이 자동으로 붙어, 테이블별 RLS 설계 실수 시
--     즉시 노출되는 구조. (기존 테이블은 RLS 로 실효 차단되어 있으나 default 가 근본원인)
--
-- 조치(FOR ROLE postgres, schema public 에만):
--   1) TABLES   : anon/authenticated 의 INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
--                 자동부여 회수. SELECT 자동부여는 이번 범위에서 유지(요청).
--   2) SEQUENCES: anon/authenticated 의 USAGE/SELECT/UPDATE 자동부여 회수.
--   3) FUNCTIONS: (public 한정) default ACL 에서 anon/authenticated 의 "명시" EXECUTE 자동부여만 제거.
--      함수의 PUBLIC EXECUTE 는 PostgreSQL 의 "전역 내장 기본권한"(acldefault, 모든 스키마 공통)이다.
--      • schema 한정 형식(... IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC)으로는
--        이 전역 PUBLIC 을 상쇄하지 못한다 → 신규 public 함수 proacl 에 '=X'(PUBLIC) 잔존(검증됨).
--      • 전역 형식(ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,
--        IN SCHEMA 없이)으로는 상쇄 가능함을 rollback 테스트로 확인.
--        그러나 전역 형식은 public 뿐 아니라 postgres 가 소유한 "모든 스키마"(예: extensions 49개)의
--        미래 함수까지 영향 → 향후 CREATE EXTENSION / 내부 의존(컬럼 default, 연산자) 등에서
--        비-superuser 실행 실패 가능성 등 영향이 불확실 → 본 작업의 public-only 안전 범위에서 제외(보류).
--      ∴ 신규 RPC 의 PUBLIC 노출 차단은 default 로 처리하지 않고, 각 RPC migration 에서
--        반드시 REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC (+필요 역할 GRANT) 로 명시 처리한다(운영 규칙).
--        (본 레포 최근 RPC 들은 이미 이 패턴을 따름: REVOKE ... FROM PUBLIC,anon → GRANT TO ...)
--   service_role 기본 권한은 전부 유지(회수 대상에서 제외).
--
-- 본 migration 의 실효 범위(정정): "신규 테이블·시퀀스의 anon/authenticated 자동 과다권한 최소화".
--   함수 PUBLIC EXECUTE 억제는 전역 변경이 필요해 본 작업에서 적용하지 않음(per-RPC 규칙으로 대체).
--
-- 영향 범위:
--   • 기존 테이블/시퀀스/함수 권한·RLS·데이터는 변경 없음(default 변경은 신규 객체에만, 소급 없음).
--   • 신규 테이블/시퀀스: anon/authenticated 자동 쓰기/USAGE 권한 제거(테이블 SELECT 만 유지) — 검증 완료.
--   • 신규 함수: PUBLIC EXECUTE 는 위 사유로 남으므로 RPC 별 명시 REVOKE 가 계속 필수(개발 표준).
--   • 신규 개발 흐름: 새 테이블은 명시 GRANT(SELECT 외 필요한 것) + RLS 정책,
--     새 RPC 는 REVOKE EXECUTE FROM PUBLIC,anon,authenticated 후 필요한 역할에만 GRANT.
--
-- 미적용(이번 범위 제외):
--   • supabase_admin 소유 default ACL 은 supabase_admin 권한이 필요해 일반 migration 에서
--     변경 불가 → 본 migration 에서 손대지 않음(별도 트랙/콘솔 확인 필요).
--   • 기존 테이블의 REF/TRIGGER/TRUNCATE 전역 회수는 다음 작업으로 보류.
-- ================================================================

-- 1) 신규 테이블: 쓰기/DDL성 권한 자동부여 회수(SELECT 유지, service_role 유지)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon, authenticated;

-- 2) 신규 시퀀스: anon/authenticated 자동부여 회수(service_role 유지)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;

-- 3) 신규 함수: PUBLIC/anon/authenticated 자동 EXECUTE 회수(service_role/postgres 유지)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
