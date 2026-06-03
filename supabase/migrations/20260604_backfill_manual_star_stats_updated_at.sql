-- Work B: backfill stats_updated_at for the 12 stars manually re-rated on 2026-06-03.
-- Their stats were edited via admin_upsert_fighter (audit action=update_fighter) before
-- the Work A fix landed, so stats_updated_at stayed at the old 2026-05-23 value. We set
-- stats_updated_at to each fighter's update_fighter audit created_at. Stats VALUES are
-- NOT modified. Only these exact 12 ids are touched, and only when the current stats
-- still equal the audited after_stats (safety guard against drift).

WITH src AS (
  SELECT DISTINCT ON (entity_id)
         entity_id,
         created_at,
         (after_data->'stats') AS after_stats
  FROM public.admin_audit_logs
  WHERE action = 'update_fighter'
    AND created_at >= TIMESTAMPTZ '2026-06-03 00:00:00+00'
    AND created_at <  TIMESTAMPTZ '2026-06-04 00:00:00+00'
    AND entity_id IN (
      'ilia-topuria','valentina-shevchenko','sean-strickland','islam-makhachev',
      'charles-oliveira','aljamain-sterling','weili-zhang','dricus-du-plessis',
      'israel-adesanya','leon-edwards','derrick-lewis','robert-whittaker'
    )
  ORDER BY entity_id, created_at DESC
)
UPDATE public.fighters f
SET stats_updated_at = src.created_at
FROM src
WHERE f.id = src.entity_id
  AND f.stats = src.after_stats;  -- only if current stats still match the audited values
