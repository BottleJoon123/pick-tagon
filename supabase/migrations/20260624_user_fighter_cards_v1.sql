-- ============================================================================
-- Pick-tagon · Archive Collection V1 — "career-permanent fighter codex"
-- Migration DRAFT (20260624_user_fighter_cards_v1)
--
-- PRODUCT POLICY (confirmed):
--   • Collection is CAREER-PERMANENT — survives season reset (admin_end_season
--     only resets users.points; it does NOT delete picks).
--   • Once unlocked, a card is NEVER revoked (no DELETE on settlement/force/re-settle).
--   • Simple unlock: placing a pick on a fighter unlocks that fighter's card,
--     independent of the pick result.
--   • change_pick also unlocks the newly-picked fighter; the previous card stays.
--   • Legacy picks with matchup_id IS NULL are excluded.
--   • Picks whose fighter_id cannot be SAFELY resolved are excluded — NO name fallback.
--     Resolution is server-side only: predicted_side ∈ {red,blue} → matchups.{red|blue}_fighter_id.
--   • V1 does NOT store rarity. CHAMP/#N badges are derived on the client from
--     ufc_rankings (existing _getDivisionRank), the single source of truth for rank.
--   • V1 progress denominator is the OBTAINABLE POOL (fighters that appear in a
--     matchup with a fighter_id), NOT all 942 fighters.
--
-- SECURITY MODEL (mirrors picks): clients can only SELECT their own rows; all
-- writes happen through SECURITY DEFINER server functions. No client INSERT/
-- UPDATE/DELETE policy or grant exists.
--
-- NOTE: This migration intentionally does NOT modify place_pick / change_pick.
-- The unlock hook into those RPCs is deferred to a SEPARATE follow-up migration
-- (see "HOOK — DEFERRED" at the bottom) so the existing pick-path hardening can
-- be re-verified in isolation before it is touched.
-- ============================================================================
-- NOTE: no explicit BEGIN/COMMIT — the migration runner wraps this file in a
-- single transaction, so DDL + backfill apply atomically.
-- ============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.user_fighter_cards (
    user_id           uuid        not null references public.users(id)     on delete cascade,
    fighter_id        text        not null references public.fighters(id)  on delete cascade,
    unlocked_at       timestamptz not null default now(),
    source_type       text        not null,
    source_pick_id    bigint      null     references public.picks(id)      on delete set null,
    source_matchup_id uuid        null     references public.matchups(id)   on delete set null,
    created_at        timestamptz not null default now(),
    constraint user_fighter_cards_pkey primary key (user_id, fighter_id),
    constraint user_fighter_cards_source_type_chk
        check (source_type in ('pick','change_pick','backfill','reward'))
);

comment on table public.user_fighter_cards is
  'Career-permanent fighter-card unlock ledger. One row per (user, fighter). '
  'Writes only via SECURITY DEFINER fns; never revoked. Source = how it was first unlocked.';

-- ── 2. Indexes ──────────────────────────────────────────────────────────────
-- PK already covers (user_id, fighter_id) lookups + per-user listing.
create index if not exists idx_ufc_cards_fighter   on public.user_fighter_cards (fighter_id);
create index if not exists idx_ufc_cards_pick       on public.user_fighter_cards (source_pick_id)    where source_pick_id    is not null;
create index if not exists idx_ufc_cards_matchup    on public.user_fighter_cards (source_matchup_id) where source_matchup_id is not null;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
alter table public.user_fighter_cards enable row level security;
-- NOTE: deliberately NOT FORCE'd. The SECURITY DEFINER helper (owned by postgres)
-- must INSERT with owner-bypass, and there is no INSERT policy; FORCE would block it.
-- Clients are still fully constrained by the policy below + the grant revocations.

-- Own-rows SELECT only. No INSERT/UPDATE/DELETE policy → clients cannot write.
drop policy if exists ufc_cards_select_own on public.user_fighter_cards;
create policy ufc_cards_select_own
    on public.user_fighter_cards
    for select
    to authenticated
    using (auth.uid() = user_id);

-- ── 4. Grants (least privilege) ─────────────────────────────────────────────
revoke all on table public.user_fighter_cards from public;
revoke all on table public.user_fighter_cards from anon;
revoke all on table public.user_fighter_cards from authenticated;
grant  select on table public.user_fighter_cards to authenticated;   -- scoped by RLS to own rows
grant  all    on table public.user_fighter_cards to service_role;

-- ── 5. Internal unlock helper (server-authoritative; never trusts a side from client) ──
-- Resolves the picked fighter from picks+matchups on the SERVER. Inserts idempotently.
-- No-op (with reason) on any unsafe/unresolvable pick. Never name-matches.
create or replace function public.unlock_fighter_card_for_pick(
    p_pick_id     bigint,
    p_source_type text default 'pick'
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
    v_pick    public.picks%rowtype;
    v_mu      public.matchups%rowtype;
    v_fid     text;
begin
    if p_source_type not in ('pick','change_pick','backfill','reward') then
        return jsonb_build_object('ok', false, 'reason', 'bad_source_type');
    end if;

    select * into v_pick from public.picks where id = p_pick_id;
    if not found             then return jsonb_build_object('ok', false, 'reason', 'pick_not_found'); end if;
    if v_pick.user_id is null then return jsonb_build_object('ok', false, 'reason', 'pick_no_user');  end if;
    if v_pick.matchup_id is null then return jsonb_build_object('ok', false, 'reason', 'matchup_null'); end if;
    if v_pick.predicted_side is null or v_pick.predicted_side not in ('red','blue') then
        return jsonb_build_object('ok', false, 'reason', 'side_invalid');
    end if;

    select * into v_mu from public.matchups where id = v_pick.matchup_id;
    if not found then return jsonb_build_object('ok', false, 'reason', 'matchup_not_found'); end if;

    v_fid := case v_pick.predicted_side
                 when 'red'  then v_mu.red_fighter_id
                 when 'blue' then v_mu.blue_fighter_id
             end;
    if v_fid is null then return jsonb_build_object('ok', false, 'reason', 'selected_fid_null'); end if;
    if not exists (select 1 from public.fighters where id = v_fid) then
        return jsonb_build_object('ok', false, 'reason', 'fighter_missing');
    end if;

    insert into public.user_fighter_cards
        (user_id, fighter_id, source_type, source_pick_id, source_matchup_id)
    values
        (v_pick.user_id, v_fid, p_source_type, v_pick.id, v_pick.matchup_id)
    on conflict (user_id, fighter_id) do nothing;

    -- Privacy: do not echo user_id back.
    return jsonb_build_object('ok', true, 'fighter_id', v_fid);
end;
$fn$;

-- Helper is server-only: no client may call it directly.
revoke all on function public.unlock_fighter_card_for_pick(bigint, text) from public;
revoke all on function public.unlock_fighter_card_for_pick(bigint, text) from anon;
revoke all on function public.unlock_fighter_card_for_pick(bigint, text) from authenticated;
grant  execute on function public.unlock_fighter_card_for_pick(bigint, text) to service_role;

-- ── 6. Read API — my collection (SECURITY INVOKER; RLS scopes to own rows) ──
-- INVOKER chosen deliberately: least privilege. The SELECT on user_fighter_cards
-- is scoped by RLS (own rows); fighters/matchups are public-readable. No need to
-- bypass RLS, so we don't. Returns ONLY fighter fields + unlock metadata — never
-- the user's id/email/nickname. Rank/champ badge is derived client-side from the
-- already-loaded ufc_rankings (existing _getDivisionRank), so SQL stays the
-- single-source-free of rank logic divergence.
create or replace function public.get_my_fighter_collection()
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $fn$
declare
    v_uid        uuid := auth.uid();
    v_obtainable int;
    v_owned      int;
    v_cards      jsonb;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
    end if;

    -- Obtainable pool: distinct fighters appearing in any matchup with a fighter_id.
    select count(*) into v_obtainable
    from (
        select red_fighter_id  as fid from public.matchups where red_fighter_id  is not null
        union
        select blue_fighter_id as fid from public.matchups where blue_fighter_id is not null
    ) p;

    select
        count(*),
        coalesce(jsonb_agg(jsonb_build_object(
            'fighter_id',        c.fighter_id,
            'name',              f.name,
            'name_en',           f.name_en,
            'division',          f.division,
            'wins',              f.wins,
            'losses',            f.losses,
            'draws',             f.draws,
            'image_url',         f.image_url,
            'nickname',          f.nickname,
            'unlocked_at',       c.unlocked_at,
            'source_type',       c.source_type,
            'source_pick_id',    c.source_pick_id,
            'source_matchup_id', c.source_matchup_id
        ) order by c.unlocked_at desc), '[]'::jsonb)
      into v_owned, v_cards
    from public.user_fighter_cards c
    join public.fighters f on f.id = c.fighter_id
    where c.user_id = v_uid;   -- defensive; RLS also enforces own-rows

    return jsonb_build_object(
        'ok',               true,
        'total_owned',      v_owned,
        'obtainable_total', v_obtainable,
        'progress_pct',     case when v_obtainable > 0
                                 then round(v_owned::numeric / v_obtainable * 100, 1)
                                 else 0 end,
        'cards',            v_cards
    );
end;
$fn$;

revoke all on function public.get_my_fighter_collection() from public;
revoke all on function public.get_my_fighter_collection() from anon;
grant  execute on function public.get_my_fighter_collection() to authenticated;

-- ── 7. Backfill (idempotent; strict side-based; no name fallback) ───────────
-- One row per (user, fighter); earliest qualifying pick is recorded as the source.
insert into public.user_fighter_cards
    (user_id, fighter_id, source_type, source_pick_id, source_matchup_id, unlocked_at)
select distinct on (p.user_id, s.fid)
    p.user_id, s.fid, 'backfill', p.id, p.matchup_id, coalesce(p.created_at, now())
from public.picks p
join public.matchups m on m.id = p.matchup_id
cross join lateral (
    select case p.predicted_side when 'red' then m.red_fighter_id
                                 when 'blue' then m.blue_fighter_id end as fid
) s
where p.matchup_id is not null
  and p.predicted_side in ('red','blue')
  and s.fid is not null
  and exists (select 1 from public.fighters f where f.id = s.fid)
order by p.user_id, s.fid, p.created_at asc
on conflict (user_id, fighter_id) do nothing;

-- ============================================================================
-- HOOK — DEFERRED to a follow-up migration (NOT included here).
-- After this migration is verified in production, place_pick / change_pick will
-- each append, just before RETURN, on the freshly inserted/updated pick row:
--     PERFORM public.unlock_fighter_card_for_pick(<new_pick_id>, 'pick');         -- place_pick
--     PERFORM public.unlock_fighter_card_for_pick(<changed_pick_id>, 'change_pick'); -- change_pick
-- Both are SECURITY DEFINER already, so they may call the helper. The unlock is a
-- best-effort side-effect: the helper never raises on unresolvable picks (returns
-- a reason), so it cannot break pick placement. That change must ship with its own
-- rollback QA proving the existing pick-path hardening is preserved.
-- ============================================================================
