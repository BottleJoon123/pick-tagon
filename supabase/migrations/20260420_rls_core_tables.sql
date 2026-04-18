begin;

-- =========================================================
-- Helper schema + admin helper
-- =========================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin is true
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- =========================================================
-- Protect is_admin from self-promotion
-- RLS controls rows, not columns — without this trigger,
-- a user updating their own row could set is_admin = true.
-- =========================================================

create or replace function private.protect_users_privileged_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role'
     and coalesce(old.is_admin, false) is distinct from coalesce(new.is_admin, false) then
    raise exception 'changing is_admin is not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_users_privileged_fields on public.users;

create trigger trg_protect_users_privileged_fields
before update on public.users
for each row
execute function private.protect_users_privileged_fields();

-- =========================================================
-- fighters
-- =========================================================

alter table public.fighters enable row level security;

drop policy if exists fighters_select_public on public.fighters;
drop policy if exists fighters_insert_admin  on public.fighters;
drop policy if exists fighters_update_admin  on public.fighters;
drop policy if exists fighters_delete_admin  on public.fighters;

create policy fighters_select_public
  on public.fighters for select
  to anon, authenticated
  using (true);

create policy fighters_insert_admin
  on public.fighters for insert
  to authenticated
  with check (private.is_admin());

create policy fighters_update_admin
  on public.fighters for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy fighters_delete_admin
  on public.fighters for delete
  to authenticated
  using (private.is_admin());

-- =========================================================
-- events
-- =========================================================

alter table public.events enable row level security;

drop policy if exists events_select_public on public.events;
drop policy if exists events_insert_admin  on public.events;
drop policy if exists events_update_admin  on public.events;
drop policy if exists events_delete_admin  on public.events;

create policy events_select_public
  on public.events for select
  to anon, authenticated
  using (true);

create policy events_insert_admin
  on public.events for insert
  to authenticated
  with check (private.is_admin());

create policy events_update_admin
  on public.events for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy events_delete_admin
  on public.events for delete
  to authenticated
  using (private.is_admin());

-- =========================================================
-- matchups
-- =========================================================

alter table public.matchups enable row level security;

drop policy if exists matchups_select_public on public.matchups;
drop policy if exists matchups_insert_admin  on public.matchups;
drop policy if exists matchups_update_admin  on public.matchups;
drop policy if exists matchups_delete_admin  on public.matchups;

create policy matchups_select_public
  on public.matchups for select
  to anon, authenticated
  using (true);

create policy matchups_insert_admin
  on public.matchups for insert
  to authenticated
  with check (private.is_admin());

create policy matchups_update_admin
  on public.matchups for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy matchups_delete_admin
  on public.matchups for delete
  to authenticated
  using (private.is_admin());

-- =========================================================
-- ufc_rankings
-- =========================================================

alter table public.ufc_rankings enable row level security;

drop policy if exists ufc_rankings_select_public on public.ufc_rankings;
drop policy if exists ufc_rankings_insert_admin  on public.ufc_rankings;
drop policy if exists ufc_rankings_update_admin  on public.ufc_rankings;
drop policy if exists ufc_rankings_delete_admin  on public.ufc_rankings;

create policy ufc_rankings_select_public
  on public.ufc_rankings for select
  to anon, authenticated
  using (true);

create policy ufc_rankings_insert_admin
  on public.ufc_rankings for insert
  to authenticated
  with check (private.is_admin());

create policy ufc_rankings_update_admin
  on public.ufc_rankings for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy ufc_rankings_delete_admin
  on public.ufc_rankings for delete
  to authenticated
  using (private.is_admin());

-- =========================================================
-- news_cache
-- service_role writes bypass RLS — no client write policies needed
-- =========================================================

alter table public.news_cache enable row level security;

drop policy if exists news_cache_select_public on public.news_cache;

create policy news_cache_select_public
  on public.news_cache for select
  to anon, authenticated
  using (true);

-- =========================================================
-- users
-- own row only; is_admin protected by trigger above
-- =========================================================

alter table public.users enable row level security;

drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select_own
  on public.users for select
  to authenticated
  using (auth.uid() = id);

create policy users_update_own
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

commit;
