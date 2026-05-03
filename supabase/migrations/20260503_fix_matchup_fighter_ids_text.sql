-- ================================================================
-- Fix: admin_upsert_matchup fighter_id UUID cast 제거
--
-- 원인: fighters.id와 matchups.red/blue_fighter_id는 TEXT인데
--       함수가 ::UUID로 캐스팅해서 400 에러 발생.
--
-- 수정: red_fighter_id, blue_fighter_id의 ::UUID 캐스팅 제거.
--       event_id, matchup id는 UUID이므로 유지.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_matchup(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid UUID := auth.uid(); v_id UUID; v_before JSONB; v_after JSONB; v_action TEXT;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
    v_id := NULLIF(p_payload->>'id', '')::UUID;
    IF v_id IS NOT NULL THEN
        SELECT to_jsonb(m) INTO v_before FROM public.matchups m WHERE id = v_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'matchup_not_found'; END IF;
        UPDATE public.matchups SET
            event_id          = COALESCE(NULLIF(p_payload->>'event_id', '')::UUID,   event_id),
            red_fighter_id    = NULLIF(p_payload->>'red_fighter_id',  ''),
            blue_fighter_id   = NULLIF(p_payload->>'blue_fighter_id', ''),
            red_fighter_name  = COALESCE(NULLIF(p_payload->>'red_fighter_name',  ''), red_fighter_name),
            blue_fighter_name = COALESCE(NULLIF(p_payload->>'blue_fighter_name', ''), blue_fighter_name),
            red_image_url     = NULLIF(p_payload->>'red_image_url',  ''),
            blue_image_url    = NULLIF(p_payload->>'blue_image_url', ''),
            weight_class      = NULLIF(p_payload->>'weight_class',   ''),
            card_segment      = COALESCE(NULLIF(p_payload->>'card_segment', ''),  card_segment),
            sort_order        = COALESCE(NULLIF(p_payload->>'sort_order',   '')::INT, sort_order),
            is_main_event     = COALESCE((p_payload->>'is_main_event')::BOOLEAN, is_main_event)
        WHERE id = v_id;
        v_action := 'update_matchup';
    ELSE
        INSERT INTO public.matchups (
            event_id, red_fighter_id, blue_fighter_id,
            red_fighter_name, blue_fighter_name,
            red_image_url, blue_image_url, weight_class,
            card_segment, sort_order, is_main_event
        ) VALUES (
            NULLIF(p_payload->>'event_id', '')::UUID,
            NULLIF(p_payload->>'red_fighter_id',  ''),
            NULLIF(p_payload->>'blue_fighter_id', ''),
            p_payload->>'red_fighter_name', p_payload->>'blue_fighter_name',
            NULLIF(p_payload->>'red_image_url',  ''), NULLIF(p_payload->>'blue_image_url', ''),
            NULLIF(p_payload->>'weight_class', ''),
            COALESCE(NULLIF(p_payload->>'card_segment', ''), 'main'),
            COALESCE(NULLIF(p_payload->>'sort_order', '')::INT, 1),
            COALESCE((p_payload->>'is_main_event')::BOOLEAN, false)
        ) RETURNING id INTO v_id;
        v_action := 'insert_matchup';
    END IF;
    SELECT to_jsonb(m) INTO v_after FROM public.matchups m WHERE id = v_id;
    INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'matchups', v_id::TEXT, v_before, v_after);
    RETURN jsonb_build_object('ok', true, 'matchup_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_matchup(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_matchup(JSONB) TO authenticated;
