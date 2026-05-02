-- ================================================================
-- Repair: Orphan pending picks created after matchup settlement
--
-- Root cause: place_pick had no pick_locked guard before Phase 1
-- (3d8e716). These 4 picks were placed AFTER their matchups were
-- already settled, so service_settle_matchup never processed them.
--
-- Picks and their correct outcomes:
--   pick 65  JamieSiraj(red)     vs winner JohnYannis(blue)   → LOSE
--   pick 66  MarkVologdin(blue)  matchup method=NC             → CANCEL + refund
--   pick 74  RaoniBarcelos(blue) vs winner RaoniBarcelos(blue) → WIN + payout
--   pick 75  JuliaPolastri(blue) matchup no_contest            → CANCEL + refund
--
-- All 4 picks belong to user ed396e42 (KINGBOTTLE).
-- Points delta: +100 (pick66) + 190 (pick74) + 100 (pick75) = +390
--
-- Future-safety: if the 4 picks do not all exist in 'pending' state
-- (already applied or not present in a fresh DB), the block exits
-- with a NOTICE and makes no changes.
-- ================================================================

BEGIN;

DO $$
DECLARE
    v_pick65  RECORD;
    v_pick66  RECORD;
    v_pick74  RECORD;
    v_pick75  RECORD;
    v_user_id UUID := 'ed396e42-3533-4c13-979f-d8c8b2affb4c';
    v_pending INT;
BEGIN
    -- Guard: count how many of the 4 target picks are still pending.
    -- If not all 4 are pending (already processed or not present in
    -- this environment), skip the entire repair as a no-op.
    SELECT COUNT(*) INTO v_pending
    FROM public.picks
    WHERE id IN (65, 66, 74, 75) AND status = 'pending';

    IF v_pending < 4 THEN
        RAISE NOTICE
            'repair_orphan_pending_picks: skipping — % of 4 target picks '
            'are in pending state (already applied or not applicable in '
            'this environment). No changes made.',
            v_pending;
        RETURN;
    END IF;

    -- Lock all target picks and user row
    SELECT * INTO v_pick65 FROM public.picks WHERE id = 65 FOR UPDATE;
    SELECT * INTO v_pick66 FROM public.picks WHERE id = 66 FOR UPDATE;
    SELECT * INTO v_pick74 FROM public.picks WHERE id = 74 FOR UPDATE;
    SELECT * INTO v_pick75 FROM public.picks WHERE id = 75 FOR UPDATE;
    PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;

    -- pick 65: LOSE (JamieSiraj picked, JohnYannis won)
    UPDATE public.picks
    SET status = 'lose', settled_payout = 0, settled_at = NOW()
    WHERE id = 65;

    -- pick 66: CANCEL + refund (result_method=NC despite completed status)
    UPDATE public.picks
    SET status = 'cancelled', payout = 0, settled_payout = 0, settled_at = NOW()
    WHERE id = 66;

    -- pick 74: WIN (RaoniBarcelos picked and won via SD)
    UPDATE public.picks
    SET status = 'win', settled_payout = v_pick74.payout, settled_at = NOW()
    WHERE id = 74;

    -- pick 75: CANCEL + refund (matchup result_status = no_contest)
    UPDATE public.picks
    SET status = 'cancelled', payout = 0, settled_payout = 0, settled_at = NOW()
    WHERE id = 75;

    -- User points update (single atomic statement):
    --   pick66 refund: +100 (bet_cost)
    --   pick74 win   : +190 (payout)
    --   pick75 refund: +100 (bet_cost)
    --   success_picks: +1   (pick74 win)
    UPDATE public.users
    SET
        points        = COALESCE(points, 0)
                        + v_pick66.bet_cost
                        + v_pick74.payout
                        + v_pick75.bet_cost,
        success_picks = COALESCE(success_picks, 0) + 1
    WHERE id = v_user_id;

    -- Settle both events; guard against re-settling on replay
    UPDATE public.events
    SET status = 'settled', settled_at = NOW()
    WHERE id = '9fc00c11-12fc-46a5-81c1-8506ad3b3da0'
      AND status <> 'settled';

    UPDATE public.events
    SET status = 'settled', settled_at = NOW()
    WHERE id = '0a54d83f-c847-43ee-b6a7-64e36a38eecf'
      AND status <> 'settled';

    RAISE NOTICE 'repair_orphan_pending_picks: completed successfully.';
END;
$$;

COMMIT;
