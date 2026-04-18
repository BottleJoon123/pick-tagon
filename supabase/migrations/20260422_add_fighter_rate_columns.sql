begin;
alter table public.fighters
  add column if not exists dec_rate  numeric,
  add column if not exists ko_rate   numeric,
  add column if not exists sub_rate  numeric,
  add column if not exists str_acc   numeric,
  add column if not exists str_def   numeric,
  add column if not exists td_avg    numeric,
  add column if not exists td_acc    numeric,
  add column if not exists td_def    numeric,
  add column if not exists sub_avg   numeric,
  add column if not exists slpm      numeric;
commit;
