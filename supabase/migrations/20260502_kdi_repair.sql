-- ================================================================
-- KDI Repair: Correct matchup result data based on official results
--
-- KDI-01  JohnCastaneda vs MarkVologdin (UFC 273)
--         Official result: Majority Draw (29-27, 28-28, 28-28)
--         DB had: result_status=completed, winner=JohnCastaneda, method=NC
--         Fix: result_status='draw', winner=NULL, method='MD'
--         pick 66 (cancelled+refunded): no re-settlement needed
--
-- KDI-02  TalitaAlencar vs JuliaPolastri (UFC 274)
--         Official result: Talita Alencar UD (29-28, 29-28, 29-28)
--         DB had: canonical 3006a883 as no_contest, orphan 500d5fd1 as completed-UD
--         Fix A: 3006a883 → completed, TalitaAlencar UD
--         Fix B: 500d5fd1 → DELETE (orphan, no connected picks/event_picks)
--         pick 71 (TalitaAlencar/red, cancelled): → WIN, +90 pts net
--         pick 75 (JuliaPolastri/blue, cancelled): status stays 'cancelled'
--           picks_uniq_user_fight_active index prevents status='lose' while
--           pick 71 is 'win' for the same fight_id. Points-only: -100 pts.
--
-- KINGBOTTLE baseline at time of this migration: 3015 pts
-- (3315 post-orphan-repair − 300 from picks 80/81/82, ISSUE-04)
-- Expected result: 3015 + 90 − 100 = 3005 pts, success_picks 14
--
-- Future-safety: no-op if already applied or rows absent (fresh DB).
-- RAISE EXCEPTION if matchup B has unexpected picks or picks are
-- in an unexpected state.
-- ================================================================

BEGIN;

DO $$
DECLARE
    v_m248    RECORD;  -- KDI-01 matchup
    v_m3006   RECORD;  -- KDI-02 canonical matchup
    v_m500    RECORD;  -- KDI-02 orphan matchup
    v_p71     RECORD;  -- KDI-02 pick (TalitaAlencar, red)
    v_p75     RECORD;  -- KDI-02 pick (JuliaPolastri, blue)
    v_user_id UUID    := 'ed396e42-3533-4c13-979f-d8c8b2affb4c'; -- KINGBOTTLE
    v_m500_picks INT;
    v_all_done BOOLEAN;
BEGIN
    -- ── Initial reads (no lock) ──────────────────────────────────────
    SELECT * INTO v_m248  FROM public.matchups WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
    SELECT * INTO v_m3006 FROM public.matchups WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee';
    SELECT * INTO v_m500  FROM public.matchups WHERE id = '500d5fd1-b477-4563-9055-919f7d924f97';
    SELECT * INTO v_p71   FROM public.picks    WHERE id = 71;
    SELECT * INTO v_p75   FROM public.picks    WHERE id = 75;

    -- ── Full no-op guard ─────────────────────────────────────────────
    -- pick 75 is intentionally excluded: its status remains 'cancelled'
    -- before and after, so status cannot signal whether points correction
    -- was already applied.
    v_all_done := (
        (v_m248  IS NULL OR v_m248.result_status = 'draw')
        AND (v_m3006 IS NULL OR (v_m3006.result_status = 'completed'
                                  AND v_m3006.result_winner = 'TalitaAlencar'))
        AND v_m500 IS NULL
        AND (v_p71 IS NULL OR v_p71.status = 'win')
    );
    IF v_all_done THEN
        RAISE NOTICE 'kdi_repair: already fully applied or not applicable. No changes made.';
        RETURN;
    END IF;

    -- ── Safety: orphan matchup must have no picks before deletion ───
    IF v_m500 IS NOT NULL THEN
        SELECT COUNT(*) INTO v_m500_picks
        FROM public.picks WHERE matchup_id = '500d5fd1-b477-4563-9055-919f7d924f97';
        IF v_m500_picks > 0 THEN
            RAISE EXCEPTION 'kdi_repair: orphan matchup 500d5fd1 has % picks — cannot delete safely',
                v_m500_picks;
        END IF;
    END IF;

    -- ── Safety: picks must be in expected state ──────────────────────
    IF v_p71 IS NOT NULL AND v_p71.status <> 'cancelled' THEN
        RAISE EXCEPTION 'kdi_repair: pick 71 is in unexpected state "%" — expected "cancelled"',
            v_p71.status;
    END IF;
    IF v_p75 IS NOT NULL AND v_p75.status <> 'cancelled' THEN
        RAISE EXCEPTION 'kdi_repair: pick 75 is in unexpected state "%" — expected "cancelled"',
            v_p75.status;
    END IF;

    -- ── Lock rows for modification ───────────────────────────────────
    IF v_m248  IS NOT NULL THEN
        SELECT * INTO v_m248  FROM public.matchups WHERE id = '248de009-b232-44cf-9750-9cb15b92c708' FOR UPDATE;
    END IF;
    IF v_m3006 IS NOT NULL THEN
        SELECT * INTO v_m3006 FROM public.matchups WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee' FOR UPDATE;
    END IF;
    IF v_m500  IS NOT NULL THEN
        SELECT * INTO v_m500  FROM public.matchups WHERE id = '500d5fd1-b477-4563-9055-919f7d924f97' FOR UPDATE;
    END IF;
    IF v_p71 IS NOT NULL THEN
        SELECT * INTO v_p71 FROM public.picks WHERE id = 71 FOR UPDATE;
    END IF;
    IF v_p75 IS NOT NULL THEN
        SELECT * INTO v_p75 FROM public.picks WHERE id = 75 FOR UPDATE;
    END IF;
    PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;


    -- ════════════════════════════════════════════════════════════════
    -- KDI-01: Castaneda vs Vologdin → Majority Draw
    -- ════════════════════════════════════════════════════════════════
    IF v_m248 IS NOT NULL AND v_m248.result_status <> 'draw' THEN
        UPDATE public.matchups SET
            result_status      = 'draw',
            result_winner      = NULL,
            result_winner_side = NULL,
            result_method      = 'MD',
            result_round       = 3,
            result_time        = '5:00'
        WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
        RAISE NOTICE 'kdi_repair: KDI-01 applied — matchup 248de009 → draw (MD)';
    ELSE
        RAISE NOTICE 'kdi_repair: KDI-01 already applied, skipping.';
    END IF;


    -- ════════════════════════════════════════════════════════════════
    -- KDI-02A: TalitaAlencar vs JuliaPolastri (canonical) → UD win
    -- ════════════════════════════════════════════════════════════════
    IF v_m3006 IS NOT NULL
       AND NOT (v_m3006.result_status = 'completed' AND v_m3006.result_winner = 'TalitaAlencar')
    THEN
        UPDATE public.matchups SET
            result_status      = 'completed',
            result_winner      = 'TalitaAlencar',
            result_winner_side = 'red',
            result_method      = 'UD',
            result_round       = 3,
            result_time        = '5:00'
        WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee';
        RAISE NOTICE 'kdi_repair: KDI-02A applied — matchup 3006a883 → completed, TalitaAlencar UD';
    ELSE
        RAISE NOTICE 'kdi_repair: KDI-02A already applied, skipping.';
    END IF;


    -- ════════════════════════════════════════════════════════════════
    -- KDI-02B: orphan matchup 500d5fd1 → DELETE
    -- ════════════════════════════════════════════════════════════════
    IF v_m500 IS NOT NULL THEN
        DELETE FROM public.matchups WHERE id = '500d5fd1-b477-4563-9055-919f7d924f97';
        RAISE NOTICE 'kdi_repair: KDI-02B applied — orphan matchup 500d5fd1 deleted';
    ELSE
        RAISE NOTICE 'kdi_repair: KDI-02B already applied, skipping.';
    END IF;


    -- ════════════════════════════════════════════════════════════════
    -- KDI-02 pick 71: cancelled → WIN
    --   cancel refund already received: +bet_cost (100) into points
    --   net adjustment: +base_payout(190) - bet_cost(100) = +90 pts
    -- ════════════════════════════════════════════════════════════════
    IF v_p71 IS NOT NULL AND v_p71.status = 'cancelled' THEN
        UPDATE public.picks SET
            status         = 'win',
            payout         = v_p71.base_payout,
            settled_payout = v_p71.base_payout,
            settled_at     = NOW()
        WHERE id = 71;

        UPDATE public.users SET
            points        = COALESCE(points, 0) + v_p71.base_payout - v_p71.bet_cost,
            success_picks = COALESCE(success_picks, 0) + 1
        WHERE id = v_user_id;

        RAISE NOTICE 'kdi_repair: pick 71 → win | payout=% | net points=+%',
            v_p71.base_payout, (v_p71.base_payout - v_p71.bet_cost);
    ELSE
        RAISE NOTICE 'kdi_repair: pick 71 already processed, skipping.';
    END IF;


    -- ════════════════════════════════════════════════════════════════
    -- KDI-02 pick 75: points-only correction (-100 net)
    --   status stays 'cancelled': picks_uniq_user_fight_active index
    --   (WHERE status IN ('pending','win','lose')) prevents setting
    --   status='lose' while pick 71 holds 'win' for the same fight_id.
    --   cancel refund already received: reverting it via -bet_cost(100).
    -- ════════════════════════════════════════════════════════════════
    IF v_p75 IS NOT NULL AND v_p75.status = 'cancelled' THEN
        UPDATE public.users SET
            points = COALESCE(points, 0) - v_p75.bet_cost
        WHERE id = v_user_id;

        RAISE NOTICE 'kdi_repair: pick 75 points -% (cancelled status retained, unique constraint)',
            v_p75.bet_cost;
    ELSE
        RAISE NOTICE 'kdi_repair: pick 75 already processed or absent, skipping.';
    END IF;

END;
$$;

COMMIT;
