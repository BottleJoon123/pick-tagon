-- ================================================================
-- admin_apply_fighter_seed_policy_b_division
--
-- 목적: Policy B seed를 특정 체급(division) 단위로 fighters.stats에 적용
--       단, current_stats != policy_b_stats 인 선수만 UPDATE
--       delta=0 선수는 skip (unchanged)
--
-- 안전장치:
--   1. private.is_admin() 필수 (미충족 → admin_required RAISE)
--   2. p_division 필수 (NULL/빈값 → division_required 반환)
--   3. p_division 유효성 (12개 체급 화이트리스트 외 → invalid_division 반환)
--   4. p_confirm = 'APPLY_SEED_B_DIVISION:' || p_division 정확 일치
--        (불일치/누락 → confirmation_required 반환, UPDATE 없음)
--   5. 전체/all division 일괄 적용 불가 — p_division 필수 강제
--   6. UPDATE 대상: fighters.stats, fighters.stats_updated_at 만
--
-- Policy B 공식: preview/single-apply RPC와 동일
--   slpm p90 cap(6.22) + 5축 raw score + fight_cap(<3 → 68)
--   + rank blend + floor/ceiling
--
-- 권한: SECURITY DEFINER, private.is_admin(), authenticated only
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_apply_fighter_seed_policy_b_division(
    p_division text,
    p_confirm  text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_valid_divisions text[] := ARRAY[
        'hw','lhw','mw','ww','lw','fw','bw','flw','wmw','wfw','wbw','wfe'
    ];
    v_admin_uid       uuid;
    v_total_in_scope  integer := 0;
    v_changed_count   integer := 0;
    v_applied_count   integer := 0;
    v_skipped_count   integer := 0;
    v_updated         jsonb := '[]'::jsonb;
    v_before_updated_at timestamptz;
    v_after_updated_at  timestamptz;
    v_before_overall  numeric;
    v_after_overall   numeric;
    v_delta           jsonb;
    v_flags           jsonb;
    r                 record;
BEGIN
    -- ─── 권한 체크 ─────────────────────────────────────────────────────────
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- ─── division 필수 ─────────────────────────────────────────────────────
    IF p_division IS NULL OR btrim(p_division) = '' THEN
        RETURN jsonb_build_object('ok', FALSE, 'applied', FALSE, 'error', 'division_required');
    END IF;

    -- ─── division 유효성 (화이트리스트, all 금지) ──────────────────────────
    IF NOT (p_division = ANY(v_valid_divisions)) THEN
        RETURN jsonb_build_object('ok', FALSE, 'applied', FALSE, 'error', 'invalid_division',
            'division', p_division);
    END IF;

    -- ─── confirmation 체크 (정확 문자열) ──────────────────────────────────
    IF p_confirm IS DISTINCT FROM ('APPLY_SEED_B_DIVISION:' || p_division) THEN
        RETURN jsonb_build_object('ok', FALSE, 'applied', FALSE, 'error', 'confirmation_required',
            'division', p_division,
            'expected_confirm', 'APPLY_SEED_B_DIVISION:' || p_division);
    END IF;

    -- ─── admin_user_id 추출 ──────────────────────────────────────────────────
    BEGIN
        v_admin_uid := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_admin_uid := NULL;
    END;

    -- ─── scope 내 전체 대상 수 (stats 5개 보유 선수) ──────────────────────
    SELECT COUNT(*) INTO v_total_in_scope
    FROM public.fighters f
    WHERE f.division = p_division
      AND f.stats IS NOT NULL
      AND jsonb_array_length(f.stats) = 5;

    -- ─── Policy B 계산 후 delta != 0 인 선수만 순회하며 UPDATE + audit ──────
    FOR r IN
        WITH
        fb AS (
            SELECT
                f.id, f.name, f.name_en, f.division, f.rank,
                f.stats AS cur_stats, f.stats_updated_at,
                f.slpm, f.str_acc, f.sapm, f.str_def,
                f.td_avg, f.td_acc, f.td_def, f.sub_avg,
                f.dec_rate, f.ko_rate,
                (f.stats->>0)::integer AS s0_cur,
                (f.stats->>1)::integer AS s1_cur,
                (f.stats->>2)::integer AS s2_cur,
                (f.stats->>3)::integer AS s3_cur,
                (f.stats->>4)::integer AS s4_cur,
                CASE
                    WHEN f.rank = 0               THEN 'Champion'
                    WHEN f.rank BETWEEN 1 AND 5   THEN 'Top5'
                    WHEN f.rank BETWEEN 6 AND 10  THEN 'Top10'
                    WHEN f.rank BETWEEN 11 AND 15 THEN 'Top15'
                    ELSE 'Unranked'
                END AS rg,
                (f.slpm IS NOT NULL OR f.str_acc IS NOT NULL
                 OR f.sapm IS NOT NULL OR f.td_avg IS NOT NULL) AS has_raw,
                COALESCE(f.wins,0)+COALESCE(f.losses,0)+COALESCE(f.draws,0) AS total_fights
            FROM public.fighters f
            WHERE f.division = p_division
              AND f.stats IS NOT NULL
              AND jsonb_array_length(f.stats) = 5
        ),
        slpm_capped AS (
            SELECT
                fb.*,
                LEAST(COALESCE(fb.slpm, 9999.0), 6.22)   AS slpm_b,
                (fb.slpm IS NOT NULL AND fb.slpm > 6.22) AS slpm_was_capped
            FROM fb
        ),
        raw_scores AS (
            SELECT
                sc.*,
                GREATEST(45, LEAST(98, ROUND((
                    CASE WHEN (CASE WHEN sc.slpm    IS NOT NULL THEN 0.55 ELSE 0 END
                              +CASE WHEN sc.str_acc IS NOT NULL THEN 0.45 ELSE 0 END) = 0
                         THEN 50::float
                         ELSE
                             (COALESCE(GREATEST(0.0,LEAST(100.0,(sc.slpm_b -1.5 )/6.0 *100))*0.55, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.str_acc-28.0)/34.0*100))*0.45, 0.0))
                             /(CASE WHEN sc.slpm    IS NOT NULL THEN 0.55 ELSE 0 END
                              +CASE WHEN sc.str_acc IS NOT NULL THEN 0.45 ELSE 0 END)
                    END)::numeric)::integer)) AS r0,
                GREATEST(45, LEAST(98, ROUND((
                    CASE WHEN (CASE WHEN sc.td_avg  IS NOT NULL THEN 0.45 ELSE 0 END
                              +CASE WHEN sc.td_acc  IS NOT NULL THEN 0.35 ELSE 0 END
                              +CASE WHEN sc.sub_avg IS NOT NULL THEN 0.20 ELSE 0 END) = 0
                         THEN 50::float
                         ELSE
                             (COALESCE(GREATEST(0.0,LEAST(100.0,(sc.td_avg -0.0 )/4.5 *100))*0.45, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.td_acc -15.0)/55.0*100))*0.35, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.sub_avg-0.0 )/2.5 *100))*0.20, 0.0))
                             /(CASE WHEN sc.td_avg  IS NOT NULL THEN 0.45 ELSE 0 END
                              +CASE WHEN sc.td_acc  IS NOT NULL THEN 0.35 ELSE 0 END
                              +CASE WHEN sc.sub_avg IS NOT NULL THEN 0.20 ELSE 0 END)
                    END)::numeric)::integer)) AS r1,
                GREATEST(45, LEAST(98, ROUND((
                    CASE WHEN (CASE WHEN sc.sapm     IS NOT NULL THEN 0.60 ELSE 0 END
                              +CASE WHEN sc.dec_rate IS NOT NULL THEN 0.40 ELSE 0 END) = 0
                         THEN 50::float
                         ELSE
                             (COALESCE(GREATEST(0.0,LEAST(100.0,(6.5       -sc.sapm     )/5.0 *100))*0.60, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.dec_rate-20.0       )/60.0*100))*0.40, 0.0))
                             /(CASE WHEN sc.sapm     IS NOT NULL THEN 0.60 ELSE 0 END
                              +CASE WHEN sc.dec_rate IS NOT NULL THEN 0.40 ELSE 0 END)
                    END)::numeric)::integer)) AS r2,
                GREATEST(45, LEAST(98, ROUND((
                    CASE WHEN (CASE WHEN sc.str_def IS NOT NULL THEN 0.60 ELSE 0 END
                              +CASE WHEN sc.td_def  IS NOT NULL THEN 0.40 ELSE 0 END) = 0
                         THEN 50::float
                         ELSE
                             (COALESCE(GREATEST(0.0,LEAST(100.0,(sc.str_def-45.0)/31.0*100))*0.60, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.td_def -40.0)/48.0*100))*0.40, 0.0))
                             /(CASE WHEN sc.str_def IS NOT NULL THEN 0.60 ELSE 0 END
                              +CASE WHEN sc.td_def  IS NOT NULL THEN 0.40 ELSE 0 END)
                    END)::numeric)::integer)) AS r3,
                GREATEST(45, LEAST(98, ROUND((
                    CASE WHEN (CASE WHEN sc.slpm    IS NOT NULL THEN 0.40 ELSE 0 END
                              +CASE WHEN sc.ko_rate IS NOT NULL THEN 0.35 ELSE 0 END
                              +CASE WHEN sc.str_acc IS NOT NULL THEN 0.25 ELSE 0 END) = 0
                         THEN 50::float
                         ELSE
                             (COALESCE(GREATEST(0.0,LEAST(100.0,(sc.slpm_b -1.5 )/6.0 *100))*0.40, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.ko_rate-0.0  )/60.0*100))*0.35, 0.0)
                             +COALESCE(GREATEST(0.0,LEAST(100.0,(sc.str_acc-28.0 )/34.0*100))*0.25, 0.0))
                             /(CASE WHEN sc.slpm    IS NOT NULL THEN 0.40 ELSE 0 END
                              +CASE WHEN sc.ko_rate IS NOT NULL THEN 0.35 ELSE 0 END
                              +CASE WHEN sc.str_acc IS NOT NULL THEN 0.25 ELSE 0 END)
                    END)::numeric)::integer)) AS r4,
                NOT (sc.slpm     IS NOT NULL OR sc.str_acc IS NOT NULL
                     OR sc.sapm  IS NOT NULL OR sc.td_avg  IS NOT NULL
                     OR sc.str_def IS NOT NULL OR sc.td_def IS NOT NULL
                     OR sc.ko_rate IS NOT NULL OR sc.dec_rate IS NOT NULL) AS no_raw
            FROM slpm_capped sc
        ),
        with_meta AS (
            SELECT
                rs.*,
                CASE rs.rg
                    WHEN 'Champion' THEN 62 WHEN 'Top5'  THEN 58
                    WHEN 'Top10'    THEN 55 WHEN 'Top15' THEN 52
                    ELSE 45
                END AS fl,
                CASE rs.rg
                    WHEN 'Champion' THEN 98 WHEN 'Top5'  THEN 94
                    WHEN 'Top10'    THEN 90 WHEN 'Top15' THEN 87
                    ELSE CASE WHEN rs.has_raw THEN 78 ELSE 55 END
                END AS ceil_r,
                CASE WHEN rs.total_fights < 3 THEN 68 ELSE 99 END AS fcap,
                CASE rs.rg
                    WHEN 'Champion' THEN 0.40 WHEN 'Top5'  THEN 0.30
                    WHEN 'Top10'    THEN 0.20 WHEN 'Top15' THEN 0.10
                    ELSE 0.0
                END AS blend,
                CASE rs.rg
                    WHEN 'Champion' THEN 75 WHEN 'Top5'  THEN 68
                    WHEN 'Top10'    THEN 63 WHEN 'Top15' THEN 60
                    ELSE 0
                END AS rmid
            FROM raw_scores rs
        ),
        policy_b AS (
            SELECT
                m.*,
                GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap),
                    ROUND((m.r0::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p0,
                GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap),
                    ROUND((m.r1::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p1,
                GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap),
                    ROUND((m.r2::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p2,
                GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap),
                    ROUND((m.r3::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p3,
                GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap),
                    ROUND((m.r4::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p4
            FROM with_meta m
        ),
        full_result AS (
            SELECT
                pb.*,
                (pb.rg != 'Unranked'
                 AND pb.p0=pb.fl AND pb.p1=pb.fl AND pb.p2=pb.fl
                 AND pb.p3=pb.fl AND pb.p4=pb.fl) AS flat_floor
            FROM policy_b pb
        )
        SELECT
            fr.id, fr.name, fr.name_en, fr.division, fr.rank,
            fr.cur_stats, fr.stats_updated_at,
            fr.s0_cur, fr.s1_cur, fr.s2_cur, fr.s3_cur, fr.s4_cur,
            fr.p0, fr.p1, fr.p2, fr.p3, fr.p4,
            fr.has_raw, fr.total_fights, fr.slpm_was_capped, fr.no_raw,
            (fr.total_fights < 3) AS fight_cap_applied,
            fr.flat_floor
        FROM full_result fr
        WHERE (fr.p0 != fr.s0_cur OR fr.p1 != fr.s1_cur OR fr.p2 != fr.s2_cur
            OR fr.p3 != fr.s3_cur OR fr.p4 != fr.s4_cur)
        ORDER BY fr.rank NULLS LAST, fr.name_en
    LOOP
        v_changed_count := v_changed_count + 1;
        v_before_updated_at := r.stats_updated_at;

        v_before_overall := ROUND((r.s0_cur+r.s1_cur+r.s2_cur+r.s3_cur+r.s4_cur)::numeric / 5.0, 1);
        v_after_overall  := ROUND((r.p0+r.p1+r.p2+r.p3+r.p4)::numeric / 5.0, 1);

        v_delta := jsonb_build_array(
            r.p0-r.s0_cur, r.p1-r.s1_cur, r.p2-r.s2_cur, r.p3-r.s3_cur, r.p4-r.s4_cur
        );
        v_flags := jsonb_build_object(
            'has_raw',           r.has_raw,
            'total_fights',      r.total_fights,
            'slpm_capped',       r.slpm_was_capped,
            'no_raw_default',    r.no_raw,
            'fight_cap_applied', r.fight_cap_applied,
            'flat_floor',        r.flat_floor
        );

        -- UPDATE (stats + stats_updated_at만)
        UPDATE public.fighters
        SET stats            = jsonb_build_array(r.p0, r.p1, r.p2, r.p3, r.p4),
            stats_updated_at = now()
        WHERE id = r.id
        RETURNING stats_updated_at INTO v_after_updated_at;

        v_applied_count := v_applied_count + 1;

        -- audit log
        INSERT INTO public.admin_audit_logs
            (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
        VALUES (
            v_admin_uid,
            'apply_fighter_seed_policy_b_division',
            'fighters',
            r.id,
            jsonb_build_object(
                'fighter_id',       r.id,
                'name',             r.name,
                'name_en',          r.name_en,
                'division',         r.division,
                'rank',             r.rank,
                'stats',            r.cur_stats,
                'stats_updated_at', v_before_updated_at
            ),
            jsonb_build_object(
                'fighter_id',       r.id,
                'name',             r.name,
                'name_en',          r.name_en,
                'division',         r.division,
                'rank',             r.rank,
                'stats',            jsonb_build_array(r.p0, r.p1, r.p2, r.p3, r.p4),
                'stats_updated_at', v_after_updated_at
            ),
            jsonb_build_object(
                'policy',         'B',
                'scope',          'division',
                'division',       p_division,
                'before_stats',   r.cur_stats,
                'after_stats',    jsonb_build_array(r.p0, r.p1, r.p2, r.p3, r.p4),
                'delta',          v_delta,
                'before_overall', v_before_overall,
                'after_overall',  v_after_overall,
                'flags',          v_flags,
                'applied_by',     v_admin_uid,
                'source',         'admin_apply_fighter_seed_policy_b_division'
            )
        );

        -- 반환용 updated_fighters 누적
        v_updated := v_updated || jsonb_build_object(
            'id',       r.id,
            'name',     r.name,
            'name_en',  r.name_en,
            'rank',     r.rank,
            'before',   r.cur_stats,
            'after',    jsonb_build_array(r.p0, r.p1, r.p2, r.p3, r.p4),
            'delta',    v_delta,
            'before_overall', v_before_overall,
            'after_overall',  v_after_overall,
            'flags',    v_flags
        );
    END LOOP;

    v_skipped_count := v_total_in_scope - v_changed_count;

    RETURN jsonb_build_object(
        'ok',               TRUE,
        'applied',          (v_applied_count > 0),
        'policy',           'B',
        'scope',            'division',
        'division',         p_division,
        'total_in_scope',   v_total_in_scope,
        'changed_count',    v_changed_count,
        'applied_count',    v_applied_count,
        'skipped_count',    v_skipped_count,
        'updated_fighters', v_updated,
        'warnings',         '[]'::jsonb
    );
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_apply_fighter_seed_policy_b_division(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_fighter_seed_policy_b_division(text, text) TO authenticated;

COMMIT;
