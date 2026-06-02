-- ================================================================
-- admin_preview_fighter_seed_policy_b
--
-- 목적: Policy B 초기 seed 재계산 dry-run preview
--       fighters.stats 는 절대 수정하지 않음 (READ-ONLY)
--
-- Policy B 공식:
--   1. slpm outlier cap  : slpm_b = LEAST(slpm, 6.22)  [p90 cap]
--   2. 5축 raw score      : admin_recompute_fighter_stats 동일 공식/가중치
--        s0 Striking  = wa([n(slpm_b,0.55), n(str_acc,0.45)])
--        s1 Grappling = wa([n(td_avg,0.45), n(td_acc,0.35), n(sub_avg,0.20)])
--        s2 Stamina   = wa([ni(sapm,0.60),  n(dec_rate,0.40)])
--        s3 Defense   = wa([n(str_def,0.60),n(td_def,0.40)])
--        s4 Speed     = wa([n(slpm_b,0.40), n(ko_rate,0.35), n(str_acc,0.25)])
--        null 전체 → 50 중립, clamp [45,98]
--   3. fight_cap          : total_fights < 3 → per-axis ceiling 68
--   4. rank blend         : score = raw*(1-blend) + rank_mid*blend
--        Champion  blend=0.40  rank_mid=75
--        Top5      blend=0.30  rank_mid=68
--        Top10     blend=0.20  rank_mid=63
--        Top15     blend=0.10  rank_mid=60
--        Unranked  blend=0.00
--   5. floor / ceiling    :
--        Champion  floor=62  ceil=98
--        Top5      floor=58  ceil=94
--        Top10     floor=55  ceil=90
--        Top15     floor=52  ceil=87
--        Unranked+raw    floor=45  ceil=78
--        Unranked+no_raw floor=45  ceil=55
--        total_fights<3 → ceil = MIN(existing_ceil, 68)
--
-- 파라미터:
--   p_fighter_id      text    DEFAULT NULL  — 특정 선수 1명 scope
--   p_division        text    DEFAULT NULL  — 특정 체급 scope (rows only)
--   p_limit           integer DEFAULT 200   — 반환 rows 최대 수
--   p_include_samples boolean DEFAULT TRUE  — rows + summary 포함 여부
--
-- 권한: admin only (private.is_admin())
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_preview_fighter_seed_policy_b(
    p_fighter_id      text    DEFAULT NULL,
    p_division        text    DEFAULT NULL,
    p_limit           integer DEFAULT 200,
    p_include_samples boolean DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    WITH
    -- ─── 0. 전체 fighters 기본 데이터 (no filter — summary는 전체 기준) ─────
    fb AS (
        SELECT
            f.id,
            f.name,
            f.name_en,
            f.division,
            f.rank,
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
        WHERE f.stats IS NOT NULL AND jsonb_array_length(f.stats) = 5
    ),

    -- ─── 1. slpm outlier cap (p90 = 6.22) ────────────────────────────────
    slpm_capped AS (
        SELECT
            fb.*,
            LEAST(COALESCE(fb.slpm, 9999.0), 6.22)  AS slpm_b,
            (fb.slpm IS NOT NULL AND fb.slpm > 6.22) AS slpm_was_capped
        FROM fb
    ),

    -- ─── 2. 5축 raw score (admin_recompute 동일 공식, slpm_b 적용) ─────────
    raw_scores AS (
        SELECT
            sc.*,

            -- r0 Striking: wa([n(slpm_b,0.55), n(str_acc,0.45)])
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

            -- r1 Grappling: wa([n(td_avg,0.45), n(td_acc,0.35), n(sub_avg,0.20)])
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

            -- r2 Stamina: wa([ni(sapm,0.60), n(dec_rate,0.40)])
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

            -- r3 Defense: wa([n(str_def,0.60), n(td_def,0.40)])
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

            -- r4 Speed: wa([n(slpm_b,0.40), n(ko_rate,0.35), n(str_acc,0.25)])
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

            -- no_raw_default: 모든 raw 컬럼이 null → formula는 50 반환
            NOT (sc.slpm     IS NOT NULL OR sc.str_acc IS NOT NULL
                 OR sc.sapm  IS NOT NULL OR sc.td_avg  IS NOT NULL
                 OR sc.str_def IS NOT NULL OR sc.td_def IS NOT NULL
                 OR sc.ko_rate IS NOT NULL OR sc.dec_rate IS NOT NULL) AS no_raw

        FROM slpm_capped sc
    ),

    -- ─── 3. Rank 메타 (floor, ceiling, fight_cap, blend, rank_mid) ──────────
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

    -- ─── 4. blend → fight_cap → floor → ceiling ─────────────────────────
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

    -- ─── 5. overall 계산 + flat_floor 플래그 ─────────────────────────────
    full_result AS (
        SELECT
            pb.*,
            ROUND(((pb.s0_cur+pb.s1_cur+pb.s2_cur+pb.s3_cur+pb.s4_cur)/5.0)::numeric,1) AS ov_cur,
            ROUND(((pb.p0+pb.p1+pb.p2+pb.p3+pb.p4)/5.0)::numeric,1) AS ov_pb,
            -- flat_floor: ranked 선수인데 모든 축이 동일한 floor값 → 개성 상실 경고용
            (pb.rg != 'Unranked'
             AND pb.p0=pb.fl AND pb.p1=pb.fl AND pb.p2=pb.fl
             AND pb.p3=pb.fl AND pb.p4=pb.fl) AS flat_floor
        FROM policy_b pb
    ),

    -- ─── 6. 그룹별 summary (전체 데이터 기준) ────────────────────────────
    group_summary AS (
        SELECT
            fr.rg,
            COUNT(*)::integer AS n,
            ROUND(AVG(fr.ov_cur)::numeric,1) AS cur_avg,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fr.ov_cur)::numeric,1) AS cur_med,
            ROUND(AVG(fr.ov_pb)::numeric,1)  AS pb_avg,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fr.ov_pb)::numeric,1)  AS pb_med
        FROM full_result fr
        GROUP BY fr.rg
    ),

    -- ─── 7. Top10 median (전체 기준) ─────────────────────────────────────
    top10_med AS (
        SELECT
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fr.ov_cur)::numeric, 53.0) AS cur_med,
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fr.ov_pb)::numeric,  58.0) AS pb_med
        FROM full_result fr WHERE fr.rg = 'Top10'
    ),

    -- ─── 8. 집계 통계 ────────────────────────────────────────────────────
    agg_stats AS (
        SELECT
            tm.cur_med                                    AS t10_cur,
            tm.pb_med                                     AS t10_pb,
            ROUND(100.0
                * COUNT(*) FILTER (WHERE fr.rg='Unranked' AND fr.ov_cur > tm.cur_med)
                / NULLIF(COUNT(*) FILTER (WHERE fr.rg='Unranked'), 0), 1) AS unranked_pct_cur,
            ROUND(100.0
                * COUNT(*) FILTER (WHERE fr.rg='Unranked' AND fr.ov_pb  > tm.pb_med)
                / NULLIF(COUNT(*) FILTER (WHERE fr.rg='Unranked'), 0), 1) AS unranked_pct_pb,
            COUNT(*) FILTER (WHERE fr.rg != 'Unranked'
                AND fr.s0_cur=45 AND fr.s1_cur=45 AND fr.s2_cur=45
                AND fr.s3_cur=45 AND fr.s4_cur=45)       AS all45_cur,
            COUNT(*) FILTER (WHERE fr.rg != 'Unranked'
                AND fr.p0=45 AND fr.p1=45 AND fr.p2=45
                AND fr.p3=45 AND fr.p4=45)               AS all45_pb,
            COUNT(*) FILTER (WHERE
                fr.s0_cur=50 AND fr.s1_cur=50
                AND fr.s2_cur >= 95 AND fr.s3_cur=50 AND fr.s4_cur >= 95) AS pattern_cur,
            COUNT(*) FILTER (WHERE
                fr.p0=50 AND fr.p1=50
                AND fr.p2 >= 95 AND fr.p3=50 AND fr.p4 >= 95)            AS pattern_pb,
            COUNT(*) FILTER (WHERE fr.flat_floor)         AS flat_floor_cnt,
            COUNT(*) FILTER (WHERE fr.total_fights < 3)   AS fight_cap_cnt,
            COUNT(*) FILTER (WHERE fr.slpm_was_capped)    AS slpm_cap_cnt
        FROM full_result fr
        CROSS JOIN top10_med tm
        GROUP BY tm.cur_med, tm.pb_med
    )

    -- ─── 9. JSONB 결과 빌드 ──────────────────────────────────────────────
    SELECT
        jsonb_build_object(
            'ok',      TRUE,
            'dry_run', TRUE,
            'policy',  'B',

            'scope', jsonb_build_object(
                'fighter_id',    p_fighter_id,
                'division',      p_division,
                'total_in_scope', (
                    SELECT COUNT(*) FROM full_result fr2
                    WHERE (p_fighter_id IS NULL OR fr2.id       = p_fighter_id)
                      AND (p_division   IS NULL OR fr2.division = p_division)
                ),
                'total_global', (SELECT COUNT(*) FROM full_result)
            ),

            'summary', CASE WHEN p_include_samples THEN
                jsonb_build_object(
                    'current', (
                        SELECT jsonb_object_agg(gs.rg,
                            jsonb_build_object('n',gs.n,'avg',gs.cur_avg,'median',gs.cur_med))
                        FROM group_summary gs
                    ),
                    'policy_b', (
                        SELECT jsonb_object_agg(gs.rg,
                            jsonb_build_object('n',gs.n,'avg',gs.pb_avg,'median',gs.pb_med))
                        FROM group_summary gs
                    ),
                    'top10_median_current',                    (SELECT a.t10_cur           FROM agg_stats a),
                    'top10_median_policy_b',                   (SELECT a.t10_pb            FROM agg_stats a),
                    'unranked_over_top10_median_pct_current',  (SELECT a.unranked_pct_cur  FROM agg_stats a),
                    'unranked_over_top10_median_pct_policy_b', (SELECT a.unranked_pct_pb   FROM agg_stats a),
                    'ranked_all45_current',                    (SELECT a.all45_cur         FROM agg_stats a),
                    'ranked_all45_policy_b',                   (SELECT a.all45_pb          FROM agg_stats a),
                    'pattern_50_50_9x_50_9x_current',          (SELECT a.pattern_cur       FROM agg_stats a),
                    'pattern_50_50_9x_50_9x_policy_b',         (SELECT a.pattern_pb        FROM agg_stats a)
                )
            ELSE NULL END,

            'rows', CASE WHEN p_include_samples THEN (
                SELECT COALESCE(jsonb_agg(row_obj ORDER BY row_rank NULLS LAST, row_name), '[]'::jsonb)
                FROM (
                    SELECT
                        jsonb_build_object(
                            'id',               fr.id,
                            'name',             fr.name,
                            'name_en',          fr.name_en,
                            'division',         fr.division,
                            'rank',             fr.rank,
                            'group',            fr.rg,
                            'current_stats',    jsonb_build_array(fr.s0_cur,fr.s1_cur,fr.s2_cur,fr.s3_cur,fr.s4_cur),
                            'policy_b_stats',   jsonb_build_array(fr.p0,fr.p1,fr.p2,fr.p3,fr.p4),
                            'current_overall',  fr.ov_cur,
                            'policy_b_overall', fr.ov_pb,
                            'delta',            jsonb_build_array(
                                fr.p0-fr.s0_cur, fr.p1-fr.s1_cur, fr.p2-fr.s2_cur,
                                fr.p3-fr.s3_cur, fr.p4-fr.s4_cur
                            ),
                            'raw_flags', jsonb_build_object(
                                'has_raw',           fr.has_raw,
                                'total_fights',      fr.total_fights,
                                'slpm_capped',       fr.slpm_was_capped,
                                'no_raw_default',    fr.no_raw,
                                'fight_cap_applied', (fr.total_fights < 3),
                                'flat_floor',        fr.flat_floor
                            )
                        ) AS row_obj,
                        fr.rank   AS row_rank,
                        fr.name_en AS row_name
                    FROM full_result fr
                    WHERE (p_fighter_id IS NULL OR fr.id       = p_fighter_id)
                      AND (p_division   IS NULL OR fr.division = p_division)
                    ORDER BY fr.rank NULLS LAST, fr.name_en
                    LIMIT p_limit
                ) sub
            ) ELSE '[]'::jsonb END,

            'warnings', (
                SELECT COALESCE(jsonb_agg(w), '[]'::jsonb)
                FROM (
                    SELECT jsonb_build_object(
                        'type',  'flat_floor',
                        'count', a.flat_floor_cnt,
                        'note',  'Ranked fighters all-axes set to floor (raw stats below rank floor) — 개성 상실. 추후 proportional lift 개선 예정'
                    ) AS w FROM agg_stats a WHERE a.flat_floor_cnt > 0
                    UNION ALL
                    SELECT jsonb_build_object(
                        'type',  'fight_cap_applied',
                        'count', a.fight_cap_cnt,
                        'note',  'total_fights < 3 선수: per-axis ceiling capped at 68 (팬텀/신인 과대평가 방지)'
                    ) AS w FROM agg_stats a WHERE a.fight_cap_cnt > 0
                    UNION ALL
                    SELECT jsonb_build_object(
                        'type',  'slpm_outlier_capped',
                        'count', a.slpm_cap_cnt,
                        'note',  'slpm > 6.22(p90) 선수: slpm → 6.22 cap 적용 (Striking/Speed에만 영향)'
                    ) AS w FROM agg_stats a WHERE a.slpm_cap_cnt > 0
                ) warn_rows
            )
        )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_preview_fighter_seed_policy_b(text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_preview_fighter_seed_policy_b(text, text, integer, boolean) TO authenticated;

COMMIT;
