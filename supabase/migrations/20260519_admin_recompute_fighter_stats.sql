-- ================================================================
-- admin_recompute_fighter_stats: bulk fighter stats recompute RPC
--
-- 목적: ~940명 파이터 stats 배열을 raw 퍼포먼스 스탯에서 일괄 재계산
-- p_dry_run=true:  실제 UPDATE 없음 — 샘플 10명 before/after + 통계 반환
-- p_dry_run=false: fighters.stats 일괄 UPDATE + admin_audit_logs 기록
--
-- 공식: public/js/admin.js computeStatsFromPerf() 와 동일
--   [0] Striking  = clamp(wa([n(slpm,0.55),  n(str_acc,0.45)]))
--   [1] Grappling = clamp(wa([n(td_avg,0.45), n(td_acc,0.35),  n(sub_avg,0.20)]))
--   [2] Stamina   = clamp(wa([ni(sapm,0.60),  n(dec_rate,0.40)]))
--   [3] Defense   = clamp(wa([n(str_def,0.60),n(td_def,0.40)]))
--   [4] Speed     = clamp(wa([n(slpm,0.40),   n(ko_rate,0.35), n(str_acc,0.25)]))
--
-- Baselines: fighter_stat_baselines 테이블 비어있으므로 fallback 하드코딩
--   slpm:    p05=1.5  p95=7.5   span=6.0
--   str_acc: p05=28   p95=62    span=34.0
--   sapm:    p05=1.5  p95=6.5   span=5.0   (inverse)
--   str_def: p05=45   p95=76    span=31.0
--   td_avg:  p05=0    p95=4.5   span=4.5
--   td_acc:  p05=15   p95=70    span=55.0
--   td_def:  p05=40   p95=88    span=48.0
--   sub_avg: p05=0    p95=2.5   span=2.5
--   ko_rate: p05=0    p95=60    span=60.0
--   dec_rate:p05=20   p95=80    span=60.0
--
-- null 처리: missing raw stat → 가중치 제외 (0점 처리 금지)
--            해당 카테고리 전체 null → 50
-- clamp:     [45, 98]
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_recompute_fighter_stats(
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid            UUID    := auth.uid();
    v_total          INTEGER;
    v_has_any_raw    INTEGER;
    v_missing_raw    INTEGER;
    v_updated        INTEGER := 0;
    v_samples        JSONB   := '[]'::JSONB;
    v_missing_fields JSONB;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- 전체 fighter 수
    SELECT COUNT(*) INTO v_total FROM public.fighters;

    -- raw stat이 모두 null인 fighter 수 (계산 불가)
    SELECT COUNT(*) INTO v_missing_raw
    FROM public.fighters
    WHERE slpm     IS NULL AND str_acc IS NULL AND sapm    IS NULL
      AND str_def  IS NULL AND td_avg  IS NULL AND td_acc  IS NULL
      AND td_def   IS NULL AND sub_avg IS NULL AND ko_rate IS NULL
      AND sub_rate IS NULL AND dec_rate IS NULL;

    v_has_any_raw := v_total - v_missing_raw;

    -- 컬럼별 null 건수 (missing field summary)
    SELECT jsonb_build_object(
        'slpm',    (SELECT COUNT(*) FROM public.fighters WHERE slpm     IS NULL),
        'str_acc', (SELECT COUNT(*) FROM public.fighters WHERE str_acc  IS NULL),
        'sapm',    (SELECT COUNT(*) FROM public.fighters WHERE sapm     IS NULL),
        'str_def', (SELECT COUNT(*) FROM public.fighters WHERE str_def  IS NULL),
        'td_avg',  (SELECT COUNT(*) FROM public.fighters WHERE td_avg   IS NULL),
        'td_acc',  (SELECT COUNT(*) FROM public.fighters WHERE td_acc   IS NULL),
        'td_def',  (SELECT COUNT(*) FROM public.fighters WHERE td_def   IS NULL),
        'sub_avg', (SELECT COUNT(*) FROM public.fighters WHERE sub_avg  IS NULL),
        'ko_rate', (SELECT COUNT(*) FROM public.fighters WHERE ko_rate  IS NULL),
        'sub_rate',(SELECT COUNT(*) FROM public.fighters WHERE sub_rate IS NULL),
        'dec_rate',(SELECT COUNT(*) FROM public.fighters WHERE dec_rate IS NULL)
    ) INTO v_missing_fields;

    -- ─── 샘플 10명 (raw stat 있는 fighter 중 랜덤) ───────────────────────
    -- dry_run=true/false 모두 계산 (preview용)
    SELECT COALESCE(jsonb_agg(s), '[]'::JSONB)
    INTO v_samples
    FROM (
        SELECT jsonb_build_object(
            'id',           f.id,
            'name',         f.name,
            'division',     f.division,
            'before_stats', f.stats,
            'after_stats',  jsonb_build_array(

                -- [0] Striking: wa([n(slpm,0.55), n(str_acc,0.45)])
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.slpm    IS NOT NULL THEN 0.55 ELSE 0.0 END
                              +CASE WHEN f.str_acc IS NOT NULL THEN 0.45 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.slpm   -1.5 )/6.0 *100))*0.55,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_acc-28.0)/34.0*100))*0.45,0))
                        /(CASE WHEN f.slpm    IS NOT NULL THEN 0.55 ELSE 0.0 END
                         +CASE WHEN f.str_acc IS NOT NULL THEN 0.45 ELSE 0.0 END)
                    END)::INTEGER)),

                -- [1] Grappling: wa([n(td_avg,0.45), n(td_acc,0.35), n(sub_avg,0.20)])
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.td_avg  IS NOT NULL THEN 0.45 ELSE 0.0 END
                              +CASE WHEN f.td_acc  IS NOT NULL THEN 0.35 ELSE 0.0 END
                              +CASE WHEN f.sub_avg IS NOT NULL THEN 0.20 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_avg -0.0 )/4.5 *100))*0.45,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_acc -15.0)/55.0*100))*0.35,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.sub_avg-0.0 )/2.5 *100))*0.20,0))
                        /(CASE WHEN f.td_avg  IS NOT NULL THEN 0.45 ELSE 0.0 END
                         +CASE WHEN f.td_acc  IS NOT NULL THEN 0.35 ELSE 0.0 END
                         +CASE WHEN f.sub_avg IS NOT NULL THEN 0.20 ELSE 0.0 END)
                    END)::INTEGER)),

                -- [2] Stamina: wa([ni(sapm,0.60), n(dec_rate,0.40)])
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.sapm     IS NOT NULL THEN 0.60 ELSE 0.0 END
                              +CASE WHEN f.dec_rate IS NOT NULL THEN 0.40 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(6.5      -f.sapm    )/5.0 *100))*0.60,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.dec_rate-20.0     )/60.0*100))*0.40,0))
                        /(CASE WHEN f.sapm     IS NOT NULL THEN 0.60 ELSE 0.0 END
                         +CASE WHEN f.dec_rate IS NOT NULL THEN 0.40 ELSE 0.0 END)
                    END)::INTEGER)),

                -- [3] Defense: wa([n(str_def,0.60), n(td_def,0.40)])
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.str_def IS NOT NULL THEN 0.60 ELSE 0.0 END
                              +CASE WHEN f.td_def  IS NOT NULL THEN 0.40 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_def-45.0)/31.0*100))*0.60,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_def -40.0)/48.0*100))*0.40,0))
                        /(CASE WHEN f.str_def IS NOT NULL THEN 0.60 ELSE 0.0 END
                         +CASE WHEN f.td_def  IS NOT NULL THEN 0.40 ELSE 0.0 END)
                    END)::INTEGER)),

                -- [4] Speed: wa([n(slpm,0.40), n(ko_rate,0.35), n(str_acc,0.25)])
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.slpm    IS NOT NULL THEN 0.40 ELSE 0.0 END
                              +CASE WHEN f.ko_rate IS NOT NULL THEN 0.35 ELSE 0.0 END
                              +CASE WHEN f.str_acc IS NOT NULL THEN 0.25 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.slpm   -1.5 )/6.0 *100))*0.40,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.ko_rate-0.0 )/60.0*100))*0.35,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_acc-28.0)/34.0*100))*0.25,0))
                        /(CASE WHEN f.slpm    IS NOT NULL THEN 0.40 ELSE 0.0 END
                         +CASE WHEN f.ko_rate IS NOT NULL THEN 0.35 ELSE 0.0 END
                         +CASE WHEN f.str_acc IS NOT NULL THEN 0.25 ELSE 0.0 END)
                    END)::INTEGER))

            )
        ) AS s
        FROM public.fighters f
        WHERE f.slpm    IS NOT NULL OR f.str_acc IS NOT NULL
           OR f.td_avg  IS NOT NULL OR f.sapm    IS NOT NULL
           OR f.ko_rate IS NOT NULL OR f.str_def IS NOT NULL
        ORDER BY RANDOM()
        LIMIT 10
    ) sub;

    -- ─── 실제 UPDATE (dry_run=false 전용) ────────────────────────────────
    IF NOT p_dry_run THEN
        WITH computed AS (
            SELECT
                f.id,
                -- [0] Striking
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.slpm    IS NOT NULL THEN 0.55 ELSE 0.0 END
                              +CASE WHEN f.str_acc IS NOT NULL THEN 0.45 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.slpm   -1.5 )/6.0 *100))*0.55,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_acc-28.0)/34.0*100))*0.45,0))
                        /(CASE WHEN f.slpm    IS NOT NULL THEN 0.55 ELSE 0.0 END
                         +CASE WHEN f.str_acc IS NOT NULL THEN 0.45 ELSE 0.0 END)
                    END)::INTEGER)) AS s0,
                -- [1] Grappling
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.td_avg  IS NOT NULL THEN 0.45 ELSE 0.0 END
                              +CASE WHEN f.td_acc  IS NOT NULL THEN 0.35 ELSE 0.0 END
                              +CASE WHEN f.sub_avg IS NOT NULL THEN 0.20 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_avg -0.0 )/4.5 *100))*0.45,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_acc -15.0)/55.0*100))*0.35,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.sub_avg-0.0 )/2.5 *100))*0.20,0))
                        /(CASE WHEN f.td_avg  IS NOT NULL THEN 0.45 ELSE 0.0 END
                         +CASE WHEN f.td_acc  IS NOT NULL THEN 0.35 ELSE 0.0 END
                         +CASE WHEN f.sub_avg IS NOT NULL THEN 0.20 ELSE 0.0 END)
                    END)::INTEGER)) AS s1,
                -- [2] Stamina
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.sapm     IS NOT NULL THEN 0.60 ELSE 0.0 END
                              +CASE WHEN f.dec_rate IS NOT NULL THEN 0.40 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(6.5      -f.sapm    )/5.0 *100))*0.60,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.dec_rate-20.0     )/60.0*100))*0.40,0))
                        /(CASE WHEN f.sapm     IS NOT NULL THEN 0.60 ELSE 0.0 END
                         +CASE WHEN f.dec_rate IS NOT NULL THEN 0.40 ELSE 0.0 END)
                    END)::INTEGER)) AS s2,
                -- [3] Defense
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.str_def IS NOT NULL THEN 0.60 ELSE 0.0 END
                              +CASE WHEN f.td_def  IS NOT NULL THEN 0.40 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_def-45.0)/31.0*100))*0.60,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.td_def -40.0)/48.0*100))*0.40,0))
                        /(CASE WHEN f.str_def IS NOT NULL THEN 0.60 ELSE 0.0 END
                         +CASE WHEN f.td_def  IS NOT NULL THEN 0.40 ELSE 0.0 END)
                    END)::INTEGER)) AS s3,
                -- [4] Speed
                GREATEST(45, LEAST(98, ROUND(
                    CASE WHEN (CASE WHEN f.slpm    IS NOT NULL THEN 0.40 ELSE 0.0 END
                              +CASE WHEN f.ko_rate IS NOT NULL THEN 0.35 ELSE 0.0 END
                              +CASE WHEN f.str_acc IS NOT NULL THEN 0.25 ELSE 0.0 END) = 0
                    THEN 50 ELSE
                        (COALESCE(GREATEST(0.0,LEAST(100.0,(f.slpm   -1.5 )/6.0 *100))*0.40,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.ko_rate-0.0 )/60.0*100))*0.35,0)
                        +COALESCE(GREATEST(0.0,LEAST(100.0,(f.str_acc-28.0)/34.0*100))*0.25,0))
                        /(CASE WHEN f.slpm    IS NOT NULL THEN 0.40 ELSE 0.0 END
                         +CASE WHEN f.ko_rate IS NOT NULL THEN 0.35 ELSE 0.0 END
                         +CASE WHEN f.str_acc IS NOT NULL THEN 0.25 ELSE 0.0 END)
                    END)::INTEGER)) AS s4
            FROM public.fighters f
        )
        UPDATE public.fighters tgt
        SET
            stats            = jsonb_build_array(c.s0, c.s1, c.s2, c.s3, c.s4),
            stats_updated_at = NOW()
        FROM computed c
        WHERE tgt.id = c.id;

        GET DIAGNOSTICS v_updated = ROW_COUNT;

        INSERT INTO public.admin_audit_logs
            (admin_user_id, action, entity_table, metadata)
        VALUES
            (v_uid, 'bulk_recompute_fighter_stats', 'fighters',
             jsonb_build_object(
                 'updated_count', v_updated,
                 'dry_run',       FALSE,
                 'computed_at',   NOW()
             ));
    END IF;

    RETURN jsonb_build_object(
        'dry_run',        p_dry_run,
        'total_fighters', v_total,
        'has_any_raw',    v_has_any_raw,
        'missing_raw',    v_missing_raw,
        'updated_count',  v_updated,
        'samples',        v_samples,
        'missing_fields', v_missing_fields
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recompute_fighter_stats(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recompute_fighter_stats(BOOLEAN) TO authenticated;

COMMIT;
