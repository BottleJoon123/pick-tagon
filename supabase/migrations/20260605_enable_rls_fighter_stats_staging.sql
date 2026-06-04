-- Enable RLS on public.fighter_stats_staging (Supabase Advisor: "RLS Disabled in Public").
-- anon/public access is denied; only admins (private.is_admin()) may SELECT/INSERT/UPDATE/DELETE.
-- service_role bypasses RLS, so the existing import/staging pipeline is unaffected.

ALTER TABLE public.fighter_stats_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fss_select_admin ON public.fighter_stats_staging;
DROP POLICY IF EXISTS fss_insert_admin ON public.fighter_stats_staging;
DROP POLICY IF EXISTS fss_update_admin ON public.fighter_stats_staging;
DROP POLICY IF EXISTS fss_delete_admin ON public.fighter_stats_staging;

CREATE POLICY fss_select_admin
ON public.fighter_stats_staging
FOR SELECT
TO authenticated
USING (private.is_admin());

CREATE POLICY fss_insert_admin
ON public.fighter_stats_staging
FOR INSERT
TO authenticated
WITH CHECK (private.is_admin());

CREATE POLICY fss_update_admin
ON public.fighter_stats_staging
FOR UPDATE
TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

CREATE POLICY fss_delete_admin
ON public.fighter_stats_staging
FOR DELETE
TO authenticated
USING (private.is_admin());
