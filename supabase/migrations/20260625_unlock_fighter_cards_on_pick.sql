-- ============================================================================
-- Pick-tagon · Archive Collection V1 — unlock hook on place_pick / change_pick
-- Follow-up to 20260624_user_fighter_cards_v1.
--
-- WHAT THIS DOES:
--   • place_pick : after a successful pick INSERT, unlock the picked fighter's card
--                  (source_type='pick').
--   • change_pick: after a successful pick UPDATE, unlock the newly-picked fighter's
--                  card (source_type='change_pick'). The previously-unlocked card is
--                  NEVER revoked (helper only INSERTs ... ON CONFLICT DO NOTHING).
--
-- SAFETY:
--   • The unlock is a BEST-EFFORT side-effect. The helper never raises on
--     unresolvable picks (it returns a reason), and the call is additionally wrapped
--     in BEGIN ... EXCEPTION WHEN OTHERS THEN NULL so that NO unlock failure can ever
--     break pick placement / pick change. Pick success is the contract; unlock is
--     opportunistic.
--   • matchup_id NULL / invalid side / selected-side fighter_id NULL → helper no-op
--     (the pick still succeeds, no card is granted). NO name fallback.
--
-- PRESERVATION:
--   • Both functions are CREATE OR REPLACE with their EXACT existing bodies; only the
--     two unlock blocks are inserted just before RETURN. Signatures, SECURITY DEFINER,
--     owner (postgres), search_path, and all hardening (financial constants, canonical
--     name/event/match, lock checks, duplicate/ pending checks, FOR UPDATE/SHARE) are
--     unchanged. CREATE OR REPLACE preserves existing EXECUTE grants (not re-granted).
--   • No other function is touched.
--
-- ORDERING: prefixed 20260625 (strictly after 20260624_user_fighter_cards_v1.sql) so a
-- fresh replay always creates user_fighter_cards + unlock_fighter_card_for_pick first.
-- ============================================================================

-- ── place_pick : + unlock 'pick' ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_pick(
    p_fight_id text, p_matchup_id uuid, p_pick_name text, p_predicted_side text,
    p_method text, p_predicted_round integer, p_odds numeric, p_base_payout integer,
    p_bet_cost integer, p_is_upset boolean, p_event_id text, p_match_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    c_bet_cost    CONSTANT INTEGER := 100;
    c_odds        CONSTANT NUMERIC := 1.9;
    c_base_payout CONSTANT INTEGER := 190;
    c_is_upset    CONSTANT BOOLEAN := false;
    v_user_id     UUID    := auth.uid();
    v_points      INTEGER;
    v_new_points  INTEGER;
    v_pick_id     BIGINT;
    v_matchup     RECORD;
    v_canon_name  TEXT;
    v_canon_event TEXT;
    v_canon_match TEXT;
    v_method      TEXT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    IF p_matchup_id IS NULL THEN
        RAISE EXCEPTION 'matchup_required';
    END IF;

    SELECT m.id, m.event_id, m.red_fighter_name, m.blue_fighter_name,
           m.result_status, e.picks_locked_at
      INTO v_matchup
      FROM public.matchups m
      JOIN public.events e ON e.id = m.event_id
     WHERE m.id = p_matchup_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    IF p_fight_id IS DISTINCT FROM p_matchup_id::text THEN
        RAISE EXCEPTION 'fight_matchup_mismatch';
    END IF;

    IF p_predicted_side IS NULL OR p_predicted_side NOT IN ('red', 'blue') THEN
        RAISE EXCEPTION 'invalid_predicted_side';
    END IF;

    v_canon_name := CASE WHEN p_predicted_side = 'red'
                         THEN v_matchup.red_fighter_name
                         ELSE v_matchup.blue_fighter_name END;
    IF v_canon_name IS NULL OR v_canon_name = '' THEN
        RAISE EXCEPTION 'matchup_fighter_missing';
    END IF;

    v_canon_event := v_matchup.event_id::text;
    v_canon_match := v_matchup.red_fighter_name || ' vs ' || v_matchup.blue_fighter_name;

    IF v_matchup.picks_locked_at IS NOT NULL
       OR v_matchup.result_status IN ('completed', 'draw', 'no_contest') THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    IF p_pick_name IS DISTINCT FROM v_canon_name THEN
        RAISE EXCEPTION 'pick_name_mismatch';
    END IF;
    IF p_event_id IS DISTINCT FROM v_canon_event THEN
        RAISE EXCEPTION 'event_id_mismatch';
    END IF;

    IF p_bet_cost IS DISTINCT FROM c_bet_cost THEN
        RAISE EXCEPTION 'invalid_bet_cost';
    END IF;
    IF p_odds IS DISTINCT FROM c_odds THEN
        RAISE EXCEPTION 'invalid_odds';
    END IF;
    IF p_base_payout IS DISTINCT FROM c_base_payout THEN
        RAISE EXCEPTION 'invalid_base_payout';
    END IF;
    IF p_is_upset IS DISTINCT FROM c_is_upset THEN
        RAISE EXCEPTION 'invalid_is_upset';
    END IF;

    v_method := NULLIF(p_method, '');
    IF v_method IS NOT NULL AND v_method NOT IN ('KO/TKO', 'SUB', 'UD', 'ANY') THEN
        RAISE EXCEPTION 'invalid_method';
    END IF;
    IF p_predicted_round IS NOT NULL AND (p_predicted_round < 1 OR p_predicted_round > 5) THEN
        RAISE EXCEPTION 'invalid_predicted_round';
    END IF;

    SELECT points INTO v_points
      FROM public.users
     WHERE id = v_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;

    IF COALESCE(v_points, 0) < c_bet_cost THEN
        RAISE EXCEPTION 'insufficient_points';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.picks
        WHERE user_id = v_user_id
          AND fight_id = p_fight_id
          AND status IN ('pending', 'win', 'lose')
    ) THEN
        RAISE EXCEPTION 'duplicate_pick';
    END IF;

    v_new_points := COALESCE(v_points, 0) - c_bet_cost;

    UPDATE public.users
       SET points      = v_new_points,
           total_picks = COALESCE(total_picks, 0) + 1
     WHERE id = v_user_id;

    INSERT INTO public.picks (
        user_id, fight_id, match_name, pick_name, method, predicted_round,
        odds, bet_cost, payout, base_payout, is_upset, status, matchup_id, predicted_side
    ) VALUES (
        v_user_id, p_fight_id, v_canon_match, v_canon_name, v_method, p_predicted_round,
        c_odds, c_bet_cost, c_base_payout, c_base_payout, c_is_upset, 'pending', p_matchup_id, p_predicted_side
    )
    RETURNING id INTO v_pick_id;

    v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
    INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
    VALUES (v_user_id, v_canon_event, p_fight_id, v_fighter_idx)
    ON CONFLICT (user_id, fight_id)
    DO UPDATE SET fighter_index = EXCLUDED.fighter_index,
                  event_id      = EXCLUDED.event_id;

    -- Collection V1 unlock (best-effort; NEVER blocks pick success).
    BEGIN
        PERFORM public.unlock_fighter_card_for_pick(v_pick_id, 'pick');
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id, 'new_points', v_new_points);

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_pick';
END;
$function$;

-- ── change_pick : + unlock 'change_pick' ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.change_pick(
    p_fight_id text, p_matchup_id uuid, p_pick_name text, p_predicted_side text,
    p_method text, p_predicted_round integer, p_odds numeric, p_base_payout integer,
    p_is_upset boolean, p_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    c_odds        CONSTANT NUMERIC := 1.9;
    c_base_payout CONSTANT INTEGER := 190;
    c_is_upset    CONSTANT BOOLEAN := false;
    v_user_id     UUID   := auth.uid();
    v_pick_id     BIGINT;
    v_matchup     RECORD;
    v_canon_name  TEXT;
    v_canon_event TEXT;
    v_method      TEXT;
    v_fighter_idx INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    IF p_matchup_id IS NULL THEN
        RAISE EXCEPTION 'matchup_required';
    END IF;

    SELECT m.id, m.event_id, m.red_fighter_name, m.blue_fighter_name,
           m.result_status, e.picks_locked_at
      INTO v_matchup
      FROM public.matchups m
      JOIN public.events e ON e.id = m.event_id
     WHERE m.id = p_matchup_id
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    IF p_fight_id IS DISTINCT FROM p_matchup_id::text THEN
        RAISE EXCEPTION 'fight_matchup_mismatch';
    END IF;

    IF p_predicted_side IS NULL OR p_predicted_side NOT IN ('red', 'blue') THEN
        RAISE EXCEPTION 'invalid_predicted_side';
    END IF;

    v_canon_name := CASE WHEN p_predicted_side = 'red'
                         THEN v_matchup.red_fighter_name
                         ELSE v_matchup.blue_fighter_name END;
    IF v_canon_name IS NULL OR v_canon_name = '' THEN
        RAISE EXCEPTION 'matchup_fighter_missing';
    END IF;

    v_canon_event := v_matchup.event_id::text;

    IF v_matchup.picks_locked_at IS NOT NULL
       OR v_matchup.result_status IN ('completed', 'draw', 'no_contest') THEN
        RAISE EXCEPTION 'pick_locked';
    END IF;

    IF p_pick_name IS DISTINCT FROM v_canon_name THEN
        RAISE EXCEPTION 'pick_name_mismatch';
    END IF;
    IF p_event_id IS DISTINCT FROM v_canon_event THEN
        RAISE EXCEPTION 'event_id_mismatch';
    END IF;

    IF p_odds IS DISTINCT FROM c_odds THEN
        RAISE EXCEPTION 'invalid_odds';
    END IF;
    IF p_base_payout IS DISTINCT FROM c_base_payout THEN
        RAISE EXCEPTION 'invalid_base_payout';
    END IF;
    IF p_is_upset IS DISTINCT FROM c_is_upset THEN
        RAISE EXCEPTION 'invalid_is_upset';
    END IF;

    v_method := NULLIF(p_method, '');
    IF v_method IS NOT NULL AND v_method NOT IN ('KO/TKO', 'SUB', 'UD', 'ANY') THEN
        RAISE EXCEPTION 'invalid_method';
    END IF;
    IF p_predicted_round IS NOT NULL AND (p_predicted_round < 1 OR p_predicted_round > 5) THEN
        RAISE EXCEPTION 'invalid_predicted_round';
    END IF;

    SELECT id INTO v_pick_id
      FROM public.picks
     WHERE user_id    = v_user_id
       AND fight_id   = p_fight_id
       AND matchup_id = p_matchup_id
       AND status     = 'pending'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_pending_pick';
    END IF;

    UPDATE public.picks SET
        pick_name       = v_canon_name,
        predicted_side  = p_predicted_side,
        method          = v_method,
        predicted_round = p_predicted_round,
        odds            = c_odds,
        payout          = c_base_payout,
        base_payout     = c_base_payout,
        is_upset        = c_is_upset
     WHERE id = v_pick_id;

    v_fighter_idx := CASE WHEN p_predicted_side = 'red' THEN 0 ELSE 1 END;
    INSERT INTO public.event_picks (user_id, event_id, fight_id, fighter_index)
    VALUES (v_user_id, v_canon_event, p_fight_id, v_fighter_idx)
    ON CONFLICT (user_id, fight_id)
    DO UPDATE SET fighter_index = EXCLUDED.fighter_index,
                  event_id      = EXCLUDED.event_id;

    -- Collection V1 unlock for the newly-picked fighter (best-effort; NEVER blocks
    -- the change; previously-unlocked card is NOT revoked).
    BEGIN
        PERFORM public.unlock_fighter_card_for_pick(v_pick_id, 'change_pick');
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object('ok', true, 'pick_id', v_pick_id);
END;
$function$;
