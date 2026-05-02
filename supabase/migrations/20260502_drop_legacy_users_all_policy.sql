-- Drop legacy broad users policy that allowed DELETE via FOR ALL.
-- Replaced by users_select_own, users_insert_own, users_update_own.
-- No DELETE policy is added: account deletion is not a supported feature.
DROP POLICY IF EXISTS "유저 본인만 수정" ON public.users;
