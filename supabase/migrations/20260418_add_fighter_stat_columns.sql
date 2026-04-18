begin;

alter table public.fighters
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric,
  add column if not exists reach_cm  numeric,
  add column if not exists sapm      numeric,
  add column if not exists str_def   numeric,
  add column if not exists td_acc    numeric,
  add column if not exists td_def    numeric,
  add column if not exists stats_updated_at timestamptz;

create index if not exists idx_fighters_division
  on public.fighters (division);
create index if not exists idx_fighters_stats_updated_at
  on public.fighters (stats_updated_at desc nulls last);

-- 체급별 정규화 baseline (p05/p95 백분위 + 피니시 prior)
create table if not exists public.fighter_stat_baselines (
  division           text primary key,
  slpm_p05           numeric,
  slpm_p95           numeric,
  str_acc_p05        numeric,
  str_acc_p95        numeric,
  sapm_p05           numeric,
  sapm_p95           numeric,
  str_def_p05        numeric,
  str_def_p95        numeric,
  td_avg_p05         numeric,
  td_avg_p95         numeric,
  td_acc_p05         numeric,
  td_acc_p95         numeric,
  td_def_p05         numeric,
  td_def_p95         numeric,
  sub_avg_p05        numeric,
  sub_avg_p95        numeric,
  finish_mix_p05     numeric,
  finish_mix_p95     numeric,
  avg_ko_rate        numeric,
  avg_sub_rate       numeric,
  sample_size        integer not null default 0,
  source             text    not null default 'manual',
  notes              text,
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now()),
  constraint fighter_stat_baselines_division_not_blank
    check (char_length(trim(division)) > 0)
);

alter table public.fighter_stat_baselines enable row level security;

drop policy if exists fighter_stat_baselines_select_public on public.fighter_stat_baselines;
drop policy if exists fighter_stat_baselines_insert_admin  on public.fighter_stat_baselines;
drop policy if exists fighter_stat_baselines_update_admin  on public.fighter_stat_baselines;
drop policy if exists fighter_stat_baselines_delete_admin  on public.fighter_stat_baselines;

create policy fighter_stat_baselines_select_public
  on public.fighter_stat_baselines for select
  to anon, authenticated
  using (true);

create policy fighter_stat_baselines_insert_admin
  on public.fighter_stat_baselines for insert
  to authenticated
  with check (exists (select 1 from public.users where id = auth.uid() and is_admin = true));

create policy fighter_stat_baselines_update_admin
  on public.fighter_stat_baselines for update
  to authenticated
  using  (exists (select 1 from public.users where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.users where id = auth.uid() and is_admin = true));

create policy fighter_stat_baselines_delete_admin
  on public.fighter_stat_baselines for delete
  to authenticated
  using  (exists (select 1 from public.users where id = auth.uid() and is_admin = true));

commit;
