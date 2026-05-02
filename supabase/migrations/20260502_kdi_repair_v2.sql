-- ================================================================
-- KDI Repair v2: Complete KDI fixes not applied in v1
--
-- v1 migration (20260502104246) was registered but matchup UPDATEs
-- and pick re-settlements did not take effect; only the orphan
-- matchup DELETE (500d5fd1) ran.
--
-- This migration completes the remaining 4 operations:
--
-- KDI-01: matchup 248de009 (Castaneda vs Vologdin)
--         completed/NC → draw/MD (Majority Draw, 29-27 28-28 28-28)
--
-- KDI-02A: matchup 3006a883 (TalitaAlencar vs JuliaPolastri)
--          no_contest/NC → completed/TalitaAlencar/UD (29-28x3)
--
-- KDI-02 pick 71 (TalitaAlencar/red, cancelled)
--   cancel refund +100 already applied; net WIN adjustment: +90
--
-- KDI-02 pick 75 (JuliaPolastri/blue, cancelled)
--   cancel refund +100 already applied; net LOSE adjustment: -100
--
-- KINGBOTTLE baseline at time of this migration: 3015 pts
-- (3315 post-orphan-repair − 300 from picks 80/81/82, ISSUE-04)
-- Expected result: 3015 + 90 − 100 = 3005 pts, success_picks 14
--
-- Future-safety: no-op if already applied or rows absent.
-- ================================================================

BEGIN;

DO $$
DECLARE
    v_m248    RECORD;
    v_m3006   RECORD;
    v_p71     RECORD;
    v_p75     RECORD;
    v_user_id UUID := 'ed396e42-3533-4c13-979f-d8c8b2affb4c';
    v_all_done BOOLEAN;
BEGIN
    SELECT * INTO v_m248  FROM public.matchups WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
    SELECT * INTO v_m3006 FROM public.matchups WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee';
    SELECT * INTO v_p71   FROM public.picks    WHERE id = 71;
    SELECT * INTO v_p75   FROM public.picks    WHERE id = 75;

    v_all_done := (
        (v_m248  IS NULL OR v_m248.result_status  = 'draw')
        AND (v_m3006 IS NULL OR (v_m3006.result_status = 'completed'
                                  AND v_m3006.result_winner = 'TalitaAlencar'))
        AND (v_p71 IS NULL OR v_p71.status = 'win')
        AND (v_p75 IS NULL OR v_p75.status = 'lose')
    );
    IF v_all_done THEN
        RAISE NOTICE 'kdi_repair_v2: already fully applied. No changes.';
        RETURN;
    END IF;

    IF v_p71 IS NOT NULL AND v_p71.status <> 'cancelled' THEN
        RAISE EXCEPTION 'kdi_repair_v2: pick 71 unexpected state "%" — expected "cancelled"', v_p71.status;
    END IF;
    IF v_p75 IS NOT NULL AND v_p75.status <> 'cancelled' THEN
        RAISE EXCEPTION 'kdi_repair_v2: pick 75 unexpected state "%" — expected "cancelled"', v_p75.status;
    END IF;

    IF v_m248  IS NOT NULL THEN SELECT * INTO v_m248  FROM public.matchups WHERE id = '248de009-b232-44cf-9750-9cb15b92c708' FOR UPDATE; END IF;
    IF v_m3006 IS NOT NULL THEN SELECT * INTO v_m3006 FROM public.matchups WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee'  FOR UPDATE; END IF;
    IF v_p71   IS NOT NULL THEN SELECT * INTO v_p71   FROM public.picks    WHERE id = 71 FOR UPDATE; END IF;
    IF v_p75   IS NOT NULL THEN SELECT * INTO v_p75   FROM public.picks    WHERE id = 75 FOR UPDATE; END IF;
    PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;

    -- KDI-01: Castaneda vs Vologdin → Majority Draw
    IF v_m248 IS NOT NULL AND v_m248.result_status <> 'draw' THEN
        UPDATE public.matchups SET
            result_status      = 'draw',
            result_winner      = NULL,
            result_winner_side = NULL,
            result_method      = 'MD',
            result_round       = 3,
            result_time        = '5:00'
        WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
        RAISE NOTICE 'kdi_repair_v2: KDI-01 applied — matchup 248de009 → draw (MD)';
    ELSE
        RAISE NOTICE 'kdi_repair_v2: KDI-01 already applied, skipping.';
    END IF;

    -- KDI-02A: TalitaAlencar vs JuliaPolastri → completed UD
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
        RAISE NOTICE 'kdi_repair_v2: KDI-02A applied — matchup 3006a883 → completed TalitaAlencar UD';
    ELSE
        RAISE NOTICE 'kdi_repair_v2: KDI-02A already applied, skipping.';
    END IF;

    -- pick 71: cancelled → WIN (+90 net)
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
        RAISE NOTICE 'kdi_repair_v2: pick 71 → win | payout=% | net=+%', v_p71.base_payout, (v_p71.base_payout - v_p71.bet_cost);
    ELSE
        RAISE NOTICE 'kdi_repair_v2: pick 71 already processed, skipping.';
    END IF;

    -- pick 75: cancelled → LOSE (-100 net)
    IF v_p75 IS NOT NULL AND v_p75.status = 'cancelled' THEN
        UPDATE public.picks SET
            status         = 'lose',
            payout         = 0,
            settled_payout = 0,
            settled_at     = NOW()
        WHERE id = 75;
        UPDATE public.users SET
            points = COALESCE(points, 0) - v_p75.bet_cost
        WHERE id = v_user_id;
        RAISE NOTICE 'kdi_repair_v2: pick 75 → lose | net=-%', v_p75.bet_cost;
    ELSE
        RAISE NOTICE 'kdi_repair_v2: pick 75 already processed, skipping.';
    END IF;

END;
$$;

COMMIT;
