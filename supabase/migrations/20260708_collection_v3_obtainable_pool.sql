-- ============================================================================
-- Pick-tagon · Archive Collection V3 — obtainable pool exposed to the client
-- Migration (20260708_collection_v3_obtainable_pool)
--
-- PRODUCT POLICY (confirmed):
--   • Obtainable pool = distinct fighter_id appearing as matchups.red_fighter_id
--     OR matchups.blue_fighter_id (non-null). Same definition as V1 — V3 only
--     additionally EXPOSES this pool as an authoritative ID array so the client
--     can render "obtainable" / "unowned" states without ever locking the full
--     943-fighter roster (obtainable pool is currently 194 of 943; the other
--     749 fighters have never appeared in a matchup and are shown unlocked,
--     exactly as before, under the "전체" filter).
--   • progress_pct = obtainable_owned / obtainable_total (NOT total_owned).
--     A card unlocked for a fighter who later falls out of the pool (matchup's
--     fighter_id nulled/matchup deleted, or a future 'reward' unlock for a
--     non-pool fighter) is KEPT in the owned ledger (career-permanent,
--     unchanged from V1) but EXCLUDED from the progress numerator/denominator
--     — this keeps progress_pct <= 100 even as pool composition changes.
--   • total_owned (full ledger count, including any out-of-pool cards) is
--     still returned so the client can show a "도감 외 보유" footnote when
--     total_owned > obtainable_owned. Today (backfill data) total_owned ==
--     obtainable_owned for every user (0 out-of-pool rows), so this is purely
--     forward hardening — no visible change for current users.
--   • obtainable_fighter_ids is returned as a DETERMINISTICALLY SORTED
--     (ascending by fighter_id) text array — same array on repeated calls
--     with unchanged data.
--   • cards[] keeps ALL owned history (including out-of-pool) — never revoked,
--     never trimmed, unchanged unlock semantics from V1/V2. Per-card fields
--     are reduced to LEDGER-ONLY data (fighter_id, unlocked_at, source_type,
--     source_matchup_id); fighter detail (name/division/wins/image_url/...)
--     is intentionally NOT duplicated here since the client already holds the
--     full fighters dataset (943 rows) and joins by fighter_id. source_pick_id
--     is dropped (unused by any current UI).
--
-- SCOPE: this migration ONLY replaces get_my_fighter_collection(). It does not
-- touch user_fighter_cards (table/RLS/grants), unlock_fighter_card_for_pick,
-- place_pick, change_pick, or the V1 backfill — all unchanged from
-- 20260624_user_fighter_cards_v1.sql / 20260625_unlock_fighter_cards_on_pick.sql.
--
-- SECURITY: unchanged posture from V1 — SECURITY INVOKER (RLS on
-- user_fighter_cards scopes rows to auth.uid(); matchups/fighters are
-- public-readable so no invoker/definer privilege gap is needed — the
-- obtainable pool is derivable by any client from already-public matchups
-- data, so exposing it as an ID array adds no new data exposure). Grants are
-- re-asserted idempotently below (same authenticated-only EXECUTE as V1) so
-- this migration is self-contained and safe to re-run; no anon/public grant.
--
-- VERIFIED (BEGIN…ROLLBACK against production data before this file was
-- authored — see conversation record; nothing below was ever committed):
--   • Live pool = 194 distinct fighters (138 matchups, 93 with both sides
--     set, 45 draft/one-sided). 0 duplicate ids, 0 ids missing from fighters
--     (red/blue_fighter_id are nullable columns — hence the 45 draft/one-sided
--     matchups above — but their NON-NULL values are FK-constrained to
--     fighters(id), so any id that DOES make it into the pool array, built
--     from the "is not null" filters below, can never be dangling).
--   • Live ledger = 96 rows / 9 users / 61 distinct fighters, ALL 96 already
--     inside the pool (0 out-of-pool today).
--   • Heaviest user: total_owned=41, obtainable_owned=41, obtainable_total=194,
--     progress_pct=21.1 — matches the new formula exactly (no user-visible
--     change today; only the response shape changes).
--   • Synthetic out-of-pool 'reward' card (rolled back): total_owned +1,
--     obtainable_owned/progress_pct UNCHANGED, card retained in cards[].
--   • Synthetic pool=0 fixture (matchups fighter_id columns nulled, rolled
--     back): obtainable_total=0, obtainable_owned=0, progress_pct=0,
--     obtainable_fighter_ids=[], total_owned unaffected (ledger untouched).
--   • anon EXECUTE: blocked (insufficient_privilege — no grant exists).
--   • authenticated with no 'sub' claim: {ok:false, reason:'not_authenticated'}.
--   • Cross-user isolation: a second user's call returned only that user's
--     own count — never the caller's count, another user's count, or the
--     full 96-row ledger total.
--   • ACL / security (INVOKER) / search_path identical before and after the
--     replace: acl = {postgres=X/postgres,service_role=X/postgres,
--     authenticated=X/postgres}, search_path = public, pg_temp.
--   • cards[] payload contains no fighter detail fields (name/image_url/
--     division/wins/losses/nickname/name_en/draws/source_pick_id) and no PII
--     (user_id/email/nickname) anywhere in the response, at top level or in
--     any card.
-- ============================================================================
-- NOTE: no explicit BEGIN/COMMIT — the migration runner wraps this file in a
-- single transaction, so the replace applies atomically.
-- ============================================================================

create or replace function public.get_my_fighter_collection()
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $fn$
declare
    v_uid               uuid := auth.uid();
    v_pool_ids          text[];
    v_obtainable_total  int;
    v_total_owned       int;
    v_obtainable_owned  int;
    v_cards             jsonb;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
    end if;

    -- Obtainable pool: distinct fighter_id from either matchup side, non-null,
    -- deterministically sorted ascending. matchups.{red|blue}_fighter_id are
    -- nullable columns, but their non-null values are FK-constrained to
    -- fighters(id) — so, filtered by "is not null" below, this array can
    -- never contain a dangling id.
    select coalesce(array_agg(fid order by fid), '{}'::text[])
      into v_pool_ids
    from (
        select distinct fid
        from (
            select red_fighter_id  as fid from public.matchups where red_fighter_id  is not null
            union
            select blue_fighter_id as fid from public.matchups where blue_fighter_id is not null
        ) u
    ) p;

    v_obtainable_total := coalesce(array_length(v_pool_ids, 1), 0);

    -- Ledger: ALL owned history (career-permanent, never revoked — unchanged from V1).
    -- obtainable_owned = ledger rows whose fighter_id is currently in the pool.
    -- Card payload carries LEDGER FIELDS ONLY — no fighter name/division/image/etc:
    -- the client already has the full fighters dataset and joins by fighter_id.
    select
        count(*),
        count(*) filter (where c.fighter_id = any (v_pool_ids)),
        coalesce(jsonb_agg(jsonb_build_object(
            'fighter_id',        c.fighter_id,
            'unlocked_at',       c.unlocked_at,
            'source_type',       c.source_type,
            'source_matchup_id', c.source_matchup_id
        ) order by c.unlocked_at desc), '[]'::jsonb)
      into v_total_owned, v_obtainable_owned, v_cards
    from public.user_fighter_cards c
    where c.user_id = v_uid;   -- defensive; RLS also enforces own-rows

    return jsonb_build_object(
        'ok',                     true,
        'total_owned',            v_total_owned,
        'obtainable_owned',       v_obtainable_owned,
        'obtainable_total',       v_obtainable_total,
        'progress_pct',           case when v_obtainable_total > 0
                                       then round(v_obtainable_owned::numeric / v_obtainable_total * 100, 1)
                                       else 0 end,
        'obtainable_fighter_ids', to_jsonb(v_pool_ids),
        'cards',                  v_cards
    );
end;
$fn$;

-- ACL — identical to V1, re-asserted idempotently (CREATE OR REPLACE alone
-- already preserves the existing ACL/owner; this is defensive/self-contained,
-- not a behavior change). No PUBLIC/anon EXECUTE; authenticated only.
revoke all on function public.get_my_fighter_collection() from public;
revoke all on function public.get_my_fighter_collection() from anon;
grant  execute on function public.get_my_fighter_collection() to authenticated;
