begin;
alter table public.fighters
  add column if not exists espn_id text;
create index if not exists idx_fighters_espn_id on public.fighters (espn_id);
commit;
