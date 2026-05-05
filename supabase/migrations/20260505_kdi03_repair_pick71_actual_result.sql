-- ================================================================
-- KDI-03 Repair: pick 71 stale actual result fields
--
-- Background:
--   KDI-02 corrected matchup 3006a883 from no_contest/NC to
--   completed/TalitaAlencar/UD and moved pick 71 to status='win'.
--   The pick's actual_winner/actual_method fields were left as NC.
--
-- Scope:
--   Update only pick 71 actual result fields to match the official
--   matchup result. Do not change status, payout, settled_payout,
--   bet_cost, user points, or success_picks.
--
-- Fresh replay / no-op behavior:
--   This UPDATE only runs when both the matchup and pick are in the
--   exact known stale state. If the row is absent or already fixed,
--   it is a no-op.
-- ================================================================

BEGIN;

UPDATE public.picks p
SET
  actual_winner = m.result_winner,
  actual_method = m.result_method
FROM public.matchups m
WHERE p.id = 71
  AND p.matchup_id = m.id
  AND m.id = '3006a883-feb5-423f-ae84-d44aa45771ee'
  AND m.result_status = 'completed'
  AND m.result_winner = 'TalitaAlencar'
  AND m.result_winner_side = 'red'
  AND m.result_method = 'UD'
  AND p.status = 'win'
  AND p.actual_winner = 'NC'
  AND p.actual_method = 'NC';

COMMIT;
