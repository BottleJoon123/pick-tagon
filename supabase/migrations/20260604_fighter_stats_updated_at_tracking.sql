-- Work A: track stats_updated_at on the manual fighter save path.
-- admin_upsert_fighter (called by admin.js saveFighter) previously set updated_at=NOW()
-- but never touched stats_updated_at, so manual stat edits left stats_updated_at stale.
-- Fix: bump stats_updated_at to NOW() ONLY when the stats array actually changes
-- (new fighter with stats, or stats payload differs from the existing row). Editing
-- only name/image/record/etc. leaves stats_updated_at untouched. No stats VALUES are
-- changed here; audit logging is unchanged. Seed B RPCs are NOT touched.

CREATE OR REPLACE FUNCTION public.admin_upsert_fighter(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid    UUID := auth.uid();
    v_id     TEXT;
    v_before JSONB;
    v_after  JSONB;
    v_action TEXT;
    v_rank   INTEGER;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_id := NULLIF(TRIM(p_payload->>'id'), '');
    IF v_id IS NULL THEN RAISE EXCEPTION 'fighter_id_required'; END IF;

    v_rank := NULLIF(REGEXP_REPLACE(COALESCE(p_payload->>'rank', ''), '[^0-9]', '', 'g'), '')::INTEGER;

    SELECT to_jsonb(f) INTO v_before FROM public.fighters f WHERE id = v_id;
    v_action := CASE WHEN FOUND THEN 'update_fighter' ELSE 'insert_fighter' END;

    INSERT INTO public.fighters (
        id, name, name_en, country, division,
        wins, losses, draws, rank, style,
        height, reach, odds, image_url, stats,
        slpm, str_acc, sapm, str_def,
        td_avg, td_acc, td_def, sub_avg,
        ko_rate, sub_rate, dec_rate,
        updated_at, stats_updated_at
    ) VALUES (
        v_id,
        p_payload->>'name',
        NULLIF(p_payload->>'name_en', ''),
        NULLIF(p_payload->>'country', ''),
        NULLIF(p_payload->>'division', ''),
        NULLIF(p_payload->>'wins', '')::INTEGER,
        NULLIF(p_payload->>'losses', '')::INTEGER,
        NULLIF(p_payload->>'draws', '')::INTEGER,
        v_rank,
        NULLIF(p_payload->>'style', ''),
        NULLIF(p_payload->>'height', ''),
        NULLIF(p_payload->>'reach', ''),
        NULLIF(p_payload->>'odds', ''),
        NULLIF(p_payload->>'image_url', ''),
        CASE WHEN p_payload->'stats' IS NOT NULL THEN p_payload->'stats' ELSE NULL END,
        NULLIF(p_payload->>'slpm',     '')::NUMERIC,
        NULLIF(p_payload->>'str_acc',  '')::NUMERIC,
        NULLIF(p_payload->>'sapm',     '')::NUMERIC,
        NULLIF(p_payload->>'str_def',  '')::NUMERIC,
        NULLIF(p_payload->>'td_avg',   '')::NUMERIC,
        NULLIF(p_payload->>'td_acc',   '')::NUMERIC,
        NULLIF(p_payload->>'td_def',   '')::NUMERIC,
        NULLIF(p_payload->>'sub_avg',  '')::NUMERIC,
        NULLIF(p_payload->>'ko_rate',  '')::NUMERIC,
        NULLIF(p_payload->>'sub_rate', '')::NUMERIC,
        NULLIF(p_payload->>'dec_rate', '')::NUMERIC,
        NOW(),
        -- new fighter: stamp stats_updated_at only if stats were provided
        CASE WHEN p_payload->'stats' IS NOT NULL THEN NOW() ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE SET
        name       = COALESCE(NULLIF(p_payload->>'name', ''),       fighters.name),
        name_en    = NULLIF(p_payload->>'name_en', ''),
        country    = NULLIF(p_payload->>'country', ''),
        division   = COALESCE(NULLIF(p_payload->>'division', ''),   fighters.division),
        wins       = COALESCE(NULLIF(p_payload->>'wins',   '')::INTEGER, fighters.wins),
        losses     = COALESCE(NULLIF(p_payload->>'losses', '')::INTEGER, fighters.losses),
        draws      = COALESCE(NULLIF(p_payload->>'draws',  '')::INTEGER, fighters.draws),
        rank       = v_rank,
        style      = NULLIF(p_payload->>'style', ''),
        height     = NULLIF(p_payload->>'height', ''),
        reach      = NULLIF(p_payload->>'reach', ''),
        odds       = NULLIF(p_payload->>'odds', ''),
        image_url  = NULLIF(p_payload->>'image_url', ''),
        stats      = CASE WHEN p_payload->'stats' IS NOT NULL THEN p_payload->'stats' ELSE fighters.stats END,
        slpm       = COALESCE(NULLIF(p_payload->>'slpm',     '')::NUMERIC, fighters.slpm),
        str_acc    = COALESCE(NULLIF(p_payload->>'str_acc',  '')::NUMERIC, fighters.str_acc),
        sapm       = COALESCE(NULLIF(p_payload->>'sapm',     '')::NUMERIC, fighters.sapm),
        str_def    = COALESCE(NULLIF(p_payload->>'str_def',  '')::NUMERIC, fighters.str_def),
        td_avg     = COALESCE(NULLIF(p_payload->>'td_avg',   '')::NUMERIC, fighters.td_avg),
        td_acc     = COALESCE(NULLIF(p_payload->>'td_acc',   '')::NUMERIC, fighters.td_acc),
        td_def     = COALESCE(NULLIF(p_payload->>'td_def',   '')::NUMERIC, fighters.td_def),
        sub_avg    = COALESCE(NULLIF(p_payload->>'sub_avg',  '')::NUMERIC, fighters.sub_avg),
        ko_rate    = COALESCE(NULLIF(p_payload->>'ko_rate',  '')::NUMERIC, fighters.ko_rate),
        sub_rate   = COALESCE(NULLIF(p_payload->>'sub_rate', '')::NUMERIC, fighters.sub_rate),
        dec_rate   = COALESCE(NULLIF(p_payload->>'dec_rate', '')::NUMERIC, fighters.dec_rate),
        updated_at = NOW(),
        -- bump stats_updated_at only when the stats array actually changes
        stats_updated_at = CASE
            WHEN p_payload->'stats' IS NOT NULL
                 AND (p_payload->'stats') IS DISTINCT FROM fighters.stats
            THEN NOW()
            ELSE fighters.stats_updated_at
        END;

    SELECT to_jsonb(f) INTO v_after FROM public.fighters f WHERE id = v_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'fighters', v_id, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'fighter_id', v_id, 'action', v_action);
END;
$function$;
