-- ================================================================
-- admin_apply_fighter_seed_policy_b  v2
--
-- 변경점 (v1 → v2):
--   audit log before_data / after_data에 fighter 식별 정보 추가
--   before_data: + fighter_id, name, name_en, division, rank
--   after_data : + fighter_id, name, name_en, division, rank
--   기능 로직, 안전장치, 권한 설정 동일
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_apply_fighter_seed_policy_b(
    p_fighter_id text,
    p_confirm    text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_before_stats      jsonb;
    v_before_updated_at timestamptz;
    v_fighter_name      text;
    v_fighter_name_en   text;
    v_fighter_division  text;
    v_fighter_rank      integer;

    v_p0 integer; v_p1 integer; v_p2 integer; v_p3 integer; v_p4 integer;
    v_has_raw      boolean;
    v_total_fights integer;
    v_slpm_capped  boolean;
    v_no_raw       boolean;
    v_fight_cap    boolean;
    v_flat_floor   boolean;

    v_after_stats       jsonb;
    v_after_updated_at  timestamptz;

    v_before_overall numeric;
    v_after_overall  numeric;
    v_admin_uid      uuid;
    v_result         jsonb;
BEGIN
    -- ─── 권한 체크 ─────────────────────────────────────────────────────────
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- ─── confirmation 체크 ──────────────────────────────────────────────────
    IF p_confirm IS DISTINCT FROM 'APPLY_SEED_B' THEN
        RAISE EXCEPTION 'confirmation_required';
    END IF;

    -- ─── fighter 존재 확인 + before 스냅샷 ────────────────────────────────
    SELECT
        f.name, f.name_en, f.division, f.rank,
        f.stats, f.stats_updated_at
    INTO
        v_fighter_name, v_fighter_name_en, v_fighter_division, v_fighter_rank,
        v_before_stats, v_before_updated_at
    FROM public.fighters f
    WHERE f.id = p_fighter_id
      AND f.stats IS NOT NULL
      AND jsonb_array_length(f.stats) = 5;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'fighter_not_found';
    END IF;

    -- ─── Policy B 계산 (해당 선수 1명만 스캔) ────────────────────────────
    WITH
    fb AS (
        SELECT
            f.id,
            f.rank,
            f.slpm, f.str_acc, f.sapm, f.str_def,
            f.td_avg, f.td_acc, f.td_def, f.sub_avg,
            f.dec_rate, f.ko_rate,
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
        WHERE f.id = p_fighter_id
    ),
    slpm_capped AS (
        SELECT
            fb.*,
            LEAST(COALESCE(fb.slpm, 9999.0), 6.22)  AS slpm_b,
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
                ROUND((m.r4::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) AS p4,
            (m.rg != 'Unranked'
             AND GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap), ROUND((m.r0::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) = m.fl
             AND GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap), ROUND((m.r1::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) = m.fl
             AND GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap), ROUND((m.r2::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) = m.fl
             AND GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap), ROUND((m.r3::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) = m.fl
             AND GREATEST(m.fl, LEAST(LEAST(m.ceil_r, m.fcap), ROUND((m.r4::float*(1-m.blend)+m.rmid*m.blend)::numeric)::integer)) = m.fl
            ) AS flat_floor
        FROM with_meta m
    )
    SELECT
        pb.p0, pb.p1, pb.p2, pb.p3, pb.p4,
        pb.has_raw, pb.total_fights,
        pb.slpm_was_capped, pb.no_raw,
        (pb.total_fights < 3), pb.flat_floor
    INTO
        v_p0, v_p1, v_p2, v_p3, v_p4,
        v_has_raw, v_total_fights,
        v_slpm_capped, v_no_raw,
        v_fight_cap, v_flat_floor
    FROM policy_b pb;

    -- ─── 계산 실패 방어 ──────────────────────────────────────────────────────
    IF v_p0 IS NULL THEN
        RAISE EXCEPTION 'policy_b_compute_failed';
    END IF;

    -- ─── before overall ──────────────────────────────────────────────────────
    v_before_overall := ROUND((
        (v_before_stats->>0)::numeric +
        (v_before_stats->>1)::numeric +
        (v_before_stats->>2)::numeric +
        (v_before_stats->>3)::numeric +
        (v_before_stats->>4)::numeric
    ) / 5.0, 1);

    -- ─── UPDATE fighters (stats + stats_updated_at만) ────────────────────
    UPDATE public.fighters
    SET
        stats            = jsonb_build_array(v_p0, v_p1, v_p2, v_p3, v_p4),
        stats_updated_at = now()
    WHERE id = p_fighter_id;

    -- ─── after 스냅샷 ────────────────────────────────────────────────────────
    SELECT f.stats, f.stats_updated_at
    INTO v_after_stats, v_after_updated_at
    FROM public.fighters f
    WHERE f.id = p_fighter_id;

    v_after_overall := ROUND((v_p0+v_p1+v_p2+v_p3+v_p4)::numeric / 5.0, 1);

    -- ─── admin_user_id 추출 ──────────────────────────────────────────────────
    BEGIN
        v_admin_uid := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_admin_uid := NULL;
    END;

    -- ─── audit log 기록 (v2: before_data/after_data에 fighter 식별 정보 포함) ─
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
    VALUES (
        v_admin_uid,
        'apply_fighter_seed_policy_b',
        'fighters',
        p_fighter_id,
        jsonb_build_object(
            'fighter_id',      p_fighter_id,
            'name',            v_fighter_name,
            'name_en',         v_fighter_name_en,
            'division',        v_fighter_division,
            'rank',            v_fighter_rank,
            'stats',           v_before_stats,
            'stats_updated_at', v_before_updated_at
        ),
        jsonb_build_object(
            'fighter_id',      p_fighter_id,
            'name',            v_fighter_name,
            'name_en',         v_fighter_name_en,
            'division',        v_fighter_division,
            'rank',            v_fighter_rank,
            'stats',           v_after_stats,
            'stats_updated_at', v_after_updated_at
        ),
        jsonb_build_object(
            'policy',          'B',
            'delta',           jsonb_build_array(
                                   v_p0-(v_before_stats->>0)::integer,
                                   v_p1-(v_before_stats->>1)::integer,
                                   v_p2-(v_before_stats->>2)::integer,
                                   v_p3-(v_before_stats->>3)::integer,
                                   v_p4-(v_before_stats->>4)::integer
                               ),
            'raw_flags',       jsonb_build_object(
                                   'has_raw',           v_has_raw,
                                   'total_fights',      v_total_fights,
                                   'slpm_capped',       v_slpm_capped,
                                   'no_raw_default',    v_no_raw,
                                   'fight_cap_applied', v_fight_cap,
                                   'flat_floor',        v_flat_floor
                               ),
            'before_overall',  v_before_overall,
            'after_overall',   v_after_overall,
            'source',          'admin_apply_fighter_seed_policy_b'
        )
    );

    -- ─── 반환 ────────────────────────────────────────────────────────────────
    v_result := jsonb_build_object(
        'ok',      TRUE,
        'applied', TRUE,
        'policy',  'B',
        'fighter', jsonb_build_object(
            'id',       p_fighter_id,
            'name',     v_fighter_name,
            'name_en',  v_fighter_name_en,
            'division', v_fighter_division,
            'rank',     v_fighter_rank
        ),
        'before_stats',    v_before_stats,
        'after_stats',     v_after_stats,
        'delta',           jsonb_build_array(
                               v_p0-(v_before_stats->>0)::integer,
                               v_p1-(v_before_stats->>1)::integer,
                               v_p2-(v_before_stats->>2)::integer,
                               v_p3-(v_before_stats->>3)::integer,
                               v_p4-(v_before_stats->>4)::integer
                           ),
        'before_overall',  v_before_overall,
        'after_overall',   v_after_overall,
        'raw_flags', jsonb_build_object(
            'has_raw',           v_has_raw,
            'total_fights',      v_total_fights,
            'slpm_capped',       v_slpm_capped,
            'no_raw_default',    v_no_raw,
            'fight_cap_applied', v_fight_cap,
            'flat_floor',        v_flat_floor
        ),
        'stats_updated_at', v_after_updated_at
    );

    RETURN v_result;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_apply_fighter_seed_policy_b(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_fighter_seed_policy_b(text, text) TO authenticated;

COMMIT;
