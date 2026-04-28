-- ================================================================
-- Admin Server Phase 1: 이벤트/대진표 관리 RPC + audit log
--   1. admin_audit_logs 테이블
--   2. admin_upsert_event(p_payload jsonb)
--   3. admin_delete_event(p_event_id uuid)
--   4. admin_upsert_matchup(p_payload jsonb)
--   5. admin_delete_matchup(p_matchup_id uuid)
--   6. admin_reorder_matchups(p_updates jsonb)
--
-- 모든 RPC: private.is_admin() 체크, SECURITY DEFINER,
--           성공/실패 무관하게 audit log 기록
-- ================================================================

BEGIN;

-- ── 1. admin_audit_logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID        NOT NULL,
    action        TEXT        NOT NULL,
    entity_table  TEXT        NOT NULL,
    entity_id     TEXT,
    before_data   JSONB,
    after_data    JSONB,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_logs_select_admin ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_select_admin
    ON public.admin_audit_logs FOR SELECT
    TO authenticated
    USING (private.is_admin());

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
    ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
    ON public.admin_audit_logs (entity_table, entity_id);


-- ── 2. admin_upsert_event ─────────────────────────────────────────
-- payload 키: id(optional uuid), title, event_date, venue, status
CREATE OR REPLACE FUNCTION public.admin_upsert_event(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_id     UUID;
    v_before JSONB;
    v_after  JSONB;
    v_action TEXT;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_id := NULLIF(p_payload->>'id', '')::UUID;

    IF v_id IS NOT NULL THEN
        SELECT to_jsonb(e) INTO v_before FROM public.events e WHERE id = v_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

        UPDATE public.events SET
            title      = COALESCE(NULLIF(p_payload->>'title', ''),      title),
            event_date = COALESCE(NULLIF(p_payload->>'event_date', '')::TIMESTAMPTZ, event_date),
            venue      = NULLIF(p_payload->>'venue',  ''),
            status     = COALESCE(NULLIF(p_payload->>'status', ''),     status)
        WHERE id = v_id;

        v_action := 'update_event';
    ELSE
        INSERT INTO public.events (title, event_date, venue, status)
        VALUES (
            p_payload->>'title',
            NULLIF(p_payload->>'event_date', '')::TIMESTAMPTZ,
            NULLIF(p_payload->>'venue', ''),
            COALESCE(NULLIF(p_payload->>'status', ''), 'upcoming')
        )
        RETURNING id INTO v_id;

        v_action := 'insert_event';
    END IF;

    SELECT to_jsonb(e) INTO v_after FROM public.events e WHERE id = v_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'events', v_id::TEXT, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'event_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_event(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_event(JSONB) TO authenticated;


-- ── 3. admin_delete_event ─────────────────────────────────────────
-- matchups 먼저 삭제 후 event 삭제 (원자적)
CREATE OR REPLACE FUNCTION public.admin_delete_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_before   JSONB;
    v_matchups JSONB;
    v_deleted  INT;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    SELECT to_jsonb(e) INTO v_before FROM public.events e WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;

    SELECT jsonb_agg(to_jsonb(m)) INTO v_matchups
    FROM public.matchups m WHERE event_id = p_event_id;

    DELETE FROM public.matchups WHERE event_id = p_event_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    DELETE FROM public.events WHERE id = p_event_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, metadata)
    VALUES (
        v_uid, 'delete_event', 'events', p_event_id::TEXT, v_before,
        jsonb_build_object('deleted_matchups_count', v_deleted, 'deleted_matchups', COALESCE(v_matchups, '[]'::JSONB))
    );

    RETURN jsonb_build_object('ok', true, 'deleted_matchups', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_event(UUID) TO authenticated;


-- ── 4. admin_upsert_matchup ───────────────────────────────────────
-- payload 키: id(optional uuid), event_id, red_fighter_id, blue_fighter_id,
--             red_fighter_name, blue_fighter_name, red_image_url, blue_image_url,
--             weight_class, card_segment, sort_order, is_main_event
CREATE OR REPLACE FUNCTION public.admin_upsert_matchup(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_id     UUID;
    v_before JSONB;
    v_after  JSONB;
    v_action TEXT;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_id := NULLIF(p_payload->>'id', '')::UUID;

    IF v_id IS NOT NULL THEN
        SELECT to_jsonb(m) INTO v_before FROM public.matchups m WHERE id = v_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'matchup_not_found'; END IF;

        UPDATE public.matchups SET
            event_id          = COALESCE(NULLIF(p_payload->>'event_id', '')::UUID,    event_id),
            red_fighter_id    = NULLIF(p_payload->>'red_fighter_id',    '')::UUID,
            blue_fighter_id   = NULLIF(p_payload->>'blue_fighter_id',   '')::UUID,
            red_fighter_name  = COALESCE(NULLIF(p_payload->>'red_fighter_name',  ''), red_fighter_name),
            blue_fighter_name = COALESCE(NULLIF(p_payload->>'blue_fighter_name', ''), blue_fighter_name),
            red_image_url     = NULLIF(p_payload->>'red_image_url',  ''),
            blue_image_url    = NULLIF(p_payload->>'blue_image_url', ''),
            weight_class      = NULLIF(p_payload->>'weight_class',   ''),
            card_segment      = COALESCE(NULLIF(p_payload->>'card_segment', ''),  card_segment),
            sort_order        = COALESCE(NULLIF(p_payload->>'sort_order',   '')::INT, sort_order),
            is_main_event     = COALESCE((p_payload->>'is_main_event')::BOOLEAN,      is_main_event)
        WHERE id = v_id;

        v_action := 'update_matchup';
    ELSE
        INSERT INTO public.matchups (
            event_id, red_fighter_id, blue_fighter_id,
            red_fighter_name, blue_fighter_name,
            red_image_url, blue_image_url,
            weight_class, card_segment, sort_order, is_main_event
        ) VALUES (
            NULLIF(p_payload->>'event_id', '')::UUID,
            NULLIF(p_payload->>'red_fighter_id',  '')::UUID,
            NULLIF(p_payload->>'blue_fighter_id',  '')::UUID,
            p_payload->>'red_fighter_name',
            p_payload->>'blue_fighter_name',
            NULLIF(p_payload->>'red_image_url',  ''),
            NULLIF(p_payload->>'blue_image_url', ''),
            NULLIF(p_payload->>'weight_class',   ''),
            COALESCE(NULLIF(p_payload->>'card_segment', ''), 'main'),
            COALESCE(NULLIF(p_payload->>'sort_order',   '')::INT, 1),
            COALESCE((p_payload->>'is_main_event')::BOOLEAN, false)
        )
        RETURNING id INTO v_id;

        v_action := 'insert_matchup';
    END IF;

    SELECT to_jsonb(m) INTO v_after FROM public.matchups m WHERE id = v_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'matchups', v_id::TEXT, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'matchup_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_matchup(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_matchup(JSONB) TO authenticated;


-- ── 5. admin_delete_matchup ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_matchup(p_matchup_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_before JSONB;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    SELECT to_jsonb(m) INTO v_before FROM public.matchups m WHERE id = p_matchup_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'matchup_not_found'; END IF;

    DELETE FROM public.matchups WHERE id = p_matchup_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data)
    VALUES (v_uid, 'delete_matchup', 'matchups', p_matchup_id::TEXT, v_before);

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_matchup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_matchup(UUID) TO authenticated;


-- ── 6. admin_reorder_matchups ─────────────────────────────────────
-- p_updates: [{id: uuid, sort_order: int}, ...]
CREATE OR REPLACE FUNCTION public.admin_reorder_matchups(p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_item JSONB;
    v_cnt  INT  := 0;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        UPDATE public.matchups
        SET sort_order = (v_item->>'sort_order')::INT
        WHERE id = (v_item->>'id')::UUID;

        v_cnt := v_cnt + 1;
    END LOOP;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, metadata)
    VALUES (
        v_uid, 'reorder_matchups', 'matchups', NULL,
        jsonb_build_object('count', v_cnt, 'updates', p_updates)
    );

    RETURN jsonb_build_object('ok', true, 'updated_count', v_cnt);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reorder_matchups(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reorder_matchups(JSONB) TO authenticated;

COMMIT;
