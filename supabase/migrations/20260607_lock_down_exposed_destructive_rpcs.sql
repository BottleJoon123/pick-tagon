-- ================================================================
-- Security 긴급 — 노출된 파괴적 RPC 직접 EXECUTE 회수
--
-- 배경(read-only 감사): 아래 3개 SECURITY DEFINER(owner=postgres) 함수가
--   anon/authenticated(및 PUBLIC)에 직접 EXECUTE 가 부여되어 있어,
--   공개 anon 키만으로 PostgREST /rest/v1/rpc 직접 호출이 가능했다.
--     - purge_inactive_fighters(text[])         : fighters 대량 DELETE (가드=개수>=600 뿐, 인증 없음)
--                                                 → garbage 600개로 전체 로스터 삭제 가능 (P0)
--     - purge_inactive_fighters_dry_run(text[]) : 동일 패턴(read), 함께 차단
--     - increment_faction_score(int,int)        : factions.total_score 임의 가감 (P1)
--
-- 정상 호출 주체(유지):
--     - purge_inactive_fighters / _dry_run : Edge Function `purge-inactive-fighters` 가
--          SERVICE_ROLE_KEY 클라이언트로 .rpc() 호출 → service_role EXECUTE 만 필요.
--     - increment_faction_score : 현재 프론트/DB 내부 호출자 0건(dormant) → service_role 만 유지.
--   → authenticated 직접 EXECUTE 에 의존하는 정상 경로 없음(감사 확인).
--
-- 이번 변경 범위: EXECUTE 권한만. 함수 본문/search_path/인증 로직/다른 함수 권한 불변.
-- 멱등성: REVOKE/GRANT 재적용 안전. postgres owner 는 본래 EXECUTE 보유.
-- ================================================================

REVOKE EXECUTE ON FUNCTION public.purge_inactive_fighters(text[])           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_inactive_fighters_dry_run(text[])   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_faction_score(integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purge_inactive_fighters(text[])           TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_inactive_fighters_dry_run(text[])   TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_faction_score(integer, integer) TO service_role;
