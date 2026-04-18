begin;
alter table public.fighters
  add column if not exists ufc_stats_id text;
create index if not exists idx_fighters_ufc_stats_id on public.fighters (ufc_stats_id);
commit;
