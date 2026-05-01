-- ================================================================
-- Admin Server Phase 2: Fighter / UFC Rankings 관리 RPC
--   1. admin_upsert_fighter(p_payload jsonb)
--   2. admin_delete_fighter(p_fighter_id text)
--   3. admin_update_fighter_ranks(p_updates jsonb)   -- batch rank sync
--   4. admin_update_ufc_ranking_name(p_division text, p_rank_position text, p_name text)
--   5. admin_upsert_ufc_rankings(p_rows jsonb)       -- bulk scraper upsert
--
-- 모든 RPC: private.is_admin() 체크, SECURITY DEFINER, audit log 기록
-- fighters.id는 TEXT ('f_' + timestamp 형식)
-- fighters.rank는 INTEGER — '#NR' 등 비숫자 값은 NULL로 처리
-- ================================================================

BEGIN;

-- ── 1. admin_upsert_fighter ───────────────────────────────────────
-- INSERT ON CONFLICT(id) DO UPDATE — saveFighter()의 upsert({onConflict:'id'}) 동일 동작
CREATE OR REPLACE FUNCTION public.admin_upsert_fighter(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

    -- '#NR', 빈 문자열, 비숫자 값은 NULL로 처리
    v_rank := NULLIF(REGEXP_REPLACE(COALESCE(p_payload->>'rank', ''), '[^0-9]', '', 'g'), '')::INTEGER;

    SELECT to_jsonb(f) INTO v_before FROM public.fighters f WHERE id = v_id;
    v_action := CASE WHEN FOUND THEN 'update_fighter' ELSE 'insert_fighter' END;

    INSERT INTO public.fighters (
        id, name, name_en, country, division,
        wins, losses, draws, rank, style,
        height, reach, odds, image_url, stats,
        slpm, str_acc, td_avg, sub_avg, ko_rate, sub_rate, dec_rate,
        updated_at
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
        NULLIF(p_payload->>'slpm', '')::NUMERIC,
        NULLIF(p_payload->>'str_acc', '')::NUMERIC,
        NULLIF(p_payload->>'td_avg', '')::NUMERIC,
        NULLIF(p_payload->>'sub_avg', '')::NUMERIC,
        NULLIF(p_payload->>'ko_rate', '')::NUMERIC,
        NULLIF(p_payload->>'sub_rate', '')::NUMERIC,
        NULLIF(p_payload->>'dec_rate', '')::NUMERIC,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name       = COALESCE(NULLIF(p_payload->>'name', ''),        fighters.name),
        name_en    = NULLIF(p_payload->>'name_en', ''),
        country    = NULLIF(p_payload->>'country', ''),
        division   = COALESCE(NULLIF(p_payload->>'division', ''),    fighters.division),
        wins       = COALESCE(NULLIF(p_payload->>'wins', '')::INTEGER,   fighters.wins),
        losses     = COALESCE(NULLIF(p_payload->>'losses', '')::INTEGER, fighters.losses),
        draws      = COALESCE(NULLIF(p_payload->>'draws', '')::INTEGER,  fighters.draws),
        rank       = v_rank,
        style      = NULLIF(p_payload->>'style', ''),
        height     = NULLIF(p_payload->>'height', ''),
        reach      = NULLIF(p_payload->>'reach', ''),
        odds       = NULLIF(p_payload->>'odds', ''),
        image_url  = NULLIF(p_payload->>'image_url', ''),
        stats      = CASE WHEN p_payload->'stats' IS NOT NULL THEN p_payload->'stats' ELSE fighters.stats END,
        slpm       = COALESCE(NULLIF(p_payload->>'slpm', '')::NUMERIC,    fighters.slpm),
        str_acc    = COALESCE(NULLIF(p_payload->>'str_acc', '')::NUMERIC, fighters.str_acc),
        td_avg     = COALESCE(NULLIF(p_payload->>'td_avg', '')::NUMERIC,  fighters.td_avg),
        sub_avg    = COALESCE(NULLIF(p_payload->>'sub_avg', '')::NUMERIC, fighters.sub_avg),
        ko_rate    = COALESCE(NULLIF(p_payload->>'ko_rate', '')::NUMERIC, fighters.ko_rate),
        sub_rate   = COALESCE(NULLIF(p_payload->>'sub_rate', '')::NUMERIC, fighters.sub_rate),
        dec_rate   = COALESCE(NULLIF(p_payload->>'dec_rate', '')::NUMERIC, fighters.dec_rate),
        updated_at = NOW();

    SELECT to_jsonb(f) INTO v_after FROM public.fighters f WHERE id = v_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'fighters', v_id, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'fighter_id', v_id, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_fighter(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_fighter(JSONB) TO authenticated;


-- ── 2. admin_delete_fighter ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_fighter(p_fighter_id TEXT)
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

    SELECT to_jsonb(f) INTO v_before FROM public.fighters f WHERE id = p_fighter_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'fighter_not_found'; END IF;

    DELETE FROM public.fighters WHERE id = p_fighter_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data)
    VALUES (v_uid, 'delete_fighter', 'fighters', p_fighter_id, v_before);

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_fighter(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_fighter(TEXT) TO authenticated;


-- ── 3. admin_update_fighter_ranks ─────────────────────────────────
-- syncFighterRanksFromRankings JS 루프를 서버 단 배치 처리로 교체
-- p_updates: ufc_rankings rows [{division, rank_position, fighter_name, ...}]
-- p4p 디비전은 체급 랭킹과 충돌하므로 건너뜀
CREATE OR REPLACE FUNCTION public.admin_update_fighter_ranks(p_updates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_item     JSONB;
    v_name     TEXT;
    v_last     TEXT;
    v_rank     INTEGER;
    v_cnt      INT;
    v_updated  INT  := 0;
    v_skipped  INT  := 0;
    v_failures JSONB := '[]'::JSONB;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        IF (v_item->>'division') = 'p4p' THEN CONTINUE; END IF;

        v_name := TRIM(COALESCE(v_item->>'fighter_name', ''));
        IF v_name = '' THEN CONTINUE; END IF;

        v_rank := CASE
            WHEN (v_item->>'rank_position') = 'C' THEN 0
            ELSE NULLIF(REGEXP_REPLACE(v_item->>'rank_position', '[^0-9]', '', 'g'), '')::INTEGER
        END;
        IF v_rank IS NULL THEN CONTINUE; END IF;

        -- 1차: 정확한 ilike 매칭
        UPDATE public.fighters SET rank = v_rank WHERE name_en ILIKE v_name;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        IF v_cnt > 0 THEN v_updated := v_updated + 1; CONTINUE; END IF;

        -- 2차: 성(last word) 부분 매칭
        v_last := SPLIT_PART(v_name, ' ', ARRAY_LENGTH(STRING_TO_ARRAY(v_name, ' '), 1));
        IF LENGTH(v_last) >= 4 THEN
            UPDATE public.fighters SET rank = v_rank WHERE name_en ILIKE '%' || v_last || '%';
            GET DIAGNOSTICS v_cnt = ROW_COUNT;
            IF v_cnt > 0 THEN v_updated := v_updated + 1; CONTINUE; END IF;
        END IF;

        v_skipped  := v_skipped + 1;
        v_failures := v_failures || jsonb_build_array(v_name);
    END LOOP;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, metadata)
    VALUES (
        v_uid, 'update_fighter_ranks', 'fighters', NULL,
        jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'failures', v_failures)
    );

    RETURN jsonb_build_object('ok', true, 'updated', v_updated, 'skipped', v_skipped, 'failures', v_failures);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_fighter_ranks(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_fighter_ranks(JSONB) TO authenticated;


-- ── 4. admin_update_ufc_ranking_name ─────────────────────────────
-- saveRankRow() 직접 ufc_rankings.update() 대체
CREATE OR REPLACE FUNCTION public.admin_update_ufc_ranking_name(
    p_division      TEXT,
    p_rank_position TEXT,
    p_name          TEXT
)
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

    SELECT to_jsonb(r) INTO v_before
    FROM public.ufc_rankings r
    WHERE division = p_division AND rank_position = p_rank_position;
    IF NOT FOUND THEN RAISE EXCEPTION 'ranking_row_not_found'; END IF;

    UPDATE public.ufc_rankings
    SET fighter_name = p_name, fighter_name_ko = p_name
    WHERE division = p_division AND rank_position = p_rank_position;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data,
         after_data)
    VALUES (
        v_uid, 'update_ufc_ranking_name', 'ufc_rankings',
        p_division || '/' || p_rank_position,
        v_before,
        jsonb_build_object('fighter_name', p_name, 'fighter_name_ko', p_name)
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_ufc_ranking_name(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_ufc_ranking_name(TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. admin_upsert_ufc_rankings ─────────────────────────────────
-- fetchAndSyncUFCRankings()의 sb.from('ufc_rankings').upsert(allRows) 대체
-- p_rows: [{division, rank_position, fighter_name, fighter_name_ko, trend, stats, updated_at}]
CREATE OR REPLACE FUNCTION public.admin_upsert_ufc_rankings(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_cnt  INT;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    INSERT INTO public.ufc_rankings
        (division, rank_position, fighter_name, fighter_name_ko, trend, stats, updated_at)
    SELECT
        r->>'division',
        r->>'rank_position',
        r->>'fighter_name',
        COALESCE(NULLIF(r->>'fighter_name_ko', ''), r->>'fighter_name'),
        COALESCE(NULLIF(r->>'trend', ''), '→'),
        CASE WHEN r->'stats' IS NOT NULL THEN r->'stats' ELSE '[75,75,75,75,75]'::JSONB END,
        NOW()
    FROM jsonb_array_elements(p_rows) AS r
    ON CONFLICT (division, rank_position) DO UPDATE SET
        fighter_name    = EXCLUDED.fighter_name,
        fighter_name_ko = EXCLUDED.fighter_name_ko,
        trend           = EXCLUDED.trend,
        stats           = EXCLUDED.stats,
        updated_at      = EXCLUDED.updated_at;

    GET DIAGNOSTICS v_cnt = ROW_COUNT;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, metadata)
    VALUES (
        v_uid, 'upsert_ufc_rankings', 'ufc_rankings', NULL,
        jsonb_build_object('row_count', v_cnt)
    );

    RETURN jsonb_build_object('ok', true, 'row_count', v_cnt);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_ufc_rankings(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_ufc_rankings(JSONB) TO authenticated;

COMMIT;
