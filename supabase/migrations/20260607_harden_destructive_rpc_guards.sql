-- ================================================================
-- Security 방어심층 — 파괴적 RPC 내부 가드 + SECURITY DEFINER search_path 고정
--
-- 전제: 20260607_lock_down_exposed_destructive_rpcs 로 anon/authenticated/PUBLIC
--       직접 EXECUTE 는 이미 회수됨. 이번 단계는 함수 본문/속성 방어심층 보강.
--
-- (A) purge_inactive_fighters / _dry_run : 본문 맨 앞에 service_role 내부 가드 추가.
--     - 정상 호출자: Edge Function `purge-inactive-fighters` (SERVICE_ROLE_KEY) 만.
--     - SECURITY DEFINER 라 current_user=postgres → 인증 판별 불가. JWT role claim(auth.role()) 사용.
--       (검증: request.jwt.claims role=service_role → auth.role()='service_role'; authenticated/anon 은 차단.)
--     - 기존 개수 가드(>=600)/DELETE/count 계산 로직은 그대로 보존.
--     - 권한 잠금(anon/auth/PUBLIC 회수, service_role 유지) 재확인.
-- (B) increment_faction_score : 호출자 0건(프론트/DB/트리거 전부 0) 확정 → service_role 까지
--     회수하여 postgres owner 전용 dormant 로 잠금. 본문(점수 계산) 불변. search_path 고정.
-- (C) search_path 미고정 SECURITY DEFINER/트리거 함수 고정(본문 재작성 없이 ALTER):
--     public.is_admin(), public.set_matchup_fight_stats_updated_at(),
--     private.protect_users_privileged_fields().
--     (private.is_admin() 는 이미 고정되어 있어 제외.)
--
-- 비변경: 다른 함수/권한/데이터/RLS/프론트/Edge Function.
-- ================================================================

-- (A) purge_inactive_fighters : service_role 가드 prepend (기존 로직 보존)
CREATE OR REPLACE FUNCTION public.purge_inactive_fighters(active_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_deleted integer;
begin
  -- [방어심층] service_role 호출만 허용. current_user 는 definer 때문에 postgres 이므로
  -- 인증 판별에 쓰지 않고, 요청 JWT 의 role claim(auth.role())으로 식별한다.
  if auth.role() is distinct from 'service_role' then
    raise exception 'purge_inactive_fighters: service_role only';
  end if;

  if coalesce(array_length(active_ids, 1), 0) < 600 then
    raise exception 'Refusing purge: active_ids count (%) is too low — expected at least 600', array_length(active_ids, 1);
  end if;

  delete from public.fighters f
  where not (f.id = any(active_ids));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- (A) purge_inactive_fighters_dry_run : service_role 가드 prepend (기존 count 로직 보존)
CREATE OR REPLACE FUNCTION public.purge_inactive_fighters_dry_run(active_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'purge_inactive_fighters_dry_run: service_role only';
  end if;

  select count(*) into v_count
  from public.fighters f
  where not (f.id = any(active_ids));
  return v_count;
end;
$function$;

-- (A) 권한 잠금 재확인(CREATE OR REPLACE 는 ACL 보존하나 멱등성 위해 재적용)
REVOKE EXECUTE ON FUNCTION public.purge_inactive_fighters(text[])         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_inactive_fighters_dry_run(text[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_inactive_fighters(text[])         TO service_role;
GRANT  EXECUTE ON FUNCTION public.purge_inactive_fighters_dry_run(text[]) TO service_role;

-- (B) increment_faction_score : dormant 잠금(service_role 까지 회수) + search_path 고정
REVOKE EXECUTE ON FUNCTION public.increment_faction_score(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
ALTER  FUNCTION public.increment_faction_score(integer, integer) SET search_path TO 'public', 'pg_temp';

-- (C) search_path 고정 (본문 재작성 없이 ALTER)
ALTER FUNCTION public.is_admin()                                SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.set_matchup_fight_stats_updated_at()      SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.protect_users_privileged_fields()        SET search_path TO 'public', 'pg_temp';
