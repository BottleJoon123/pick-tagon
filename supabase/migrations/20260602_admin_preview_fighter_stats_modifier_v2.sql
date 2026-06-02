-- ================================================================
-- migration: 20260602_admin_preview_fighter_stats_modifier_v2
-- Stamina / Speed 계산 추가 + Defense skip reason 개선
-- ================================================================
-- 변경 내용:
--   - Stamina (r2): elapsed_sec/scheduled_sec 기반 duration + activity per min 복합 공식
--   - Speed   (r4): sig_land_per_min + sig_accuracy + KD + early_finish_bonus 복합 공식
--   - Defense skip reason 문구 개선 (상대 스탯 입력 안내 강화)
--   - raw_recent_scores에 r2_stamina / r4_speed 추가
-- DB 스키마 변경 없음 — CREATE OR REPLACE FUNCTION 만 적용
-- p_dry_run=true  : SELECT only (preview, no writes)
-- p_dry_run=false : fighters.stats UPDATE + admin_audit_logs
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_preview_fighter_stats_modifier(
    p_fighter_id   text,
    p_dry_run      boolean DEFAULT true,
    p_global_alpha numeric DEFAULT 0.3,
    p_min_sample   integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid          uuid    := auth.uid();
    v_fighter      record;
    v_base         numeric[];
    v_rank         integer;
    v_alpha        numeric;
    v_dmax         integer;
    v_scaler       numeric;
    v_R            numeric[];
    v_n            integer[];
    v_delta        numeric[] := ARRAY[0,0,0,0,0]::numeric[];
    v_final        integer[];
    v_fn           numeric;
    v_applied      text[]    := ARRAY[]::text[];
    v_skipped      jsonb     := '[]'::jsonb;
    v_raw_scores   jsonb;
    v_input        jsonb;
    v_before_stats jsonb;
    v_skip_reason  text;
    v_axis_names   text[]    := ARRAY['striking','grappling','stamina','defense','speed'];
    i              integer;
BEGIN
    -- ── [1] 파라미터 validation ────────────────────────────────────────
    IF p_fighter_id IS NULL OR trim(p_fighter_id) = '' THEN
        RAISE EXCEPTION 'fighter_id_required';
    END IF;
    p_global_alpha := GREATEST(0.0, LEAST(1.0, COALESCE(p_global_alpha, 0.3)));
    p_min_sample   := GREATEST(1, COALESCE(p_min_sample, 1));

    -- ── [2] admin 체크 ─────────────────────────────────────────────────
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- ── [3] fighter 로드 ───────────────────────────────────────────────
    SELECT id, name, division, rank, stats
    INTO v_fighter
    FROM public.fighters
    WHERE id = p_fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'fighter_not_found';
    END IF;

    -- ── [4] baseline stats 검증 ────────────────────────────────────────
    IF v_fighter.stats IS NULL
       OR jsonb_typeof(v_fighter.stats) <> 'array'
       OR jsonb_array_length(v_fighter.stats) <> 5 THEN
        RAISE EXCEPTION 'invalid_baseline_stats: stats is null or not a 5-element array';
    END IF;

    v_base := ARRAY[
        (v_fighter.stats->>0)::numeric,
        (v_fighter.stats->>1)::numeric,
        (v_fighter.stats->>2)::numeric,
        (v_fighter.stats->>3)::numeric,
        (v_fighter.stats->>4)::numeric
    ];
    v_before_stats := v_fighter.stats;
    v_rank         := v_fighter.rank;

    -- ── [5] rank factor / delta_max ────────────────────────────────────
    v_alpha := CASE
        WHEN v_rank = 0               THEN 0.20
        WHEN v_rank BETWEEN 1 AND 5   THEN 0.30
        WHEN v_rank BETWEEN 6 AND 10  THEN 0.40
        WHEN v_rank BETWEEN 11 AND 15 THEN 0.50
        ELSE                               0.60
    END;
    v_dmax := CASE
        WHEN v_rank = 0               THEN 2
        WHEN v_rank BETWEEN 1 AND 5   THEN 3
        WHEN v_rank BETWEEN 6 AND 10  THEN 4
        WHEN v_rank BETWEEN 11 AND 15 THEN 5
        ELSE                               6
    END;
    v_scaler := p_global_alpha / 0.3;
    v_alpha  := LEAST(0.95, v_alpha * v_scaler);

    -- ── [6] 최근 완료 경기 → 축별 raw_score 집계 ──────────────────────
    WITH fights AS (
        SELECT
            s.matchup_id,
            s.side,
            (row_number() OVER (
                ORDER BY COALESCE(e.event_date, m.settled_at) DESC
            ) - 1)::integer                                             AS rr,
            power(0.6,
                row_number() OVER (
                    ORDER BY COALESCE(e.event_date, m.settled_at) DESC
                ) - 1
            )                                                           AS w,
            s.sig_strikes_att,  s.sig_strikes_land,  s.knockdowns,
            s.td_att,           s.td_land,           s.sub_att,
            s.ctrl_time_sec,
            o.sig_strikes_att   AS o_sig_att,
            o.sig_strikes_land  AS o_sig_land,
            o.td_att            AS o_td_att,
            o.td_land           AS o_td_land,
            (o.matchup_id IS NOT NULL) AS has_opp,
            -- Stamina / Speed용: 경기 경과 시간 (초)
            -- result_time은 "M:SS" 형식 텍스트
            CASE
                WHEN m.result_round IS NOT NULL
                  AND m.result_time  IS NOT NULL
                  AND m.result_time  LIKE '%:%'
                THEN
                    (m.result_round - 1) * 300
                    + split_part(m.result_time, ':', 1)::integer * 60
                    + split_part(m.result_time, ':', 2)::integer
                ELSE NULL
            END                                                         AS elapsed_sec,
            -- 예정 경기 시간: main_event=5R(1500s), 일반=3R(900s)
            CASE WHEN COALESCE(m.is_main_event, false)
                 THEN 1500 ELSE 900 END                                 AS scheduled_sec,
            m.result_method,
            m.result_winner_side
        FROM      public.matchup_fight_stats AS s
        JOIN      public.matchups            AS m ON m.id = s.matchup_id
        LEFT JOIN public.events              AS e ON e.id = m.event_id
        LEFT JOIN public.matchup_fight_stats AS o
               ON o.matchup_id = s.matchup_id AND o.side <> s.side
        WHERE s.fighter_id    = p_fighter_id
          AND m.result_status = 'completed'
        ORDER BY COALESCE(e.event_date, m.settled_at) DESC
        LIMIT 10
    ),
    scored AS (
        SELECT
            f.matchup_id, f.rr, f.w, f.has_opp,

            -- ── [0] Striking: sig_acc(×0.45) + volume(×0.40) + KD(×0.15) ──
            -- p05/p95: sig_acc=0.30~0.62(range=0.32), volume=8~90(range=82), KD=0~2
            CASE
                WHEN f.sig_strikes_land IS NULL AND f.knockdowns IS NULL THEN NULL
                ELSE (
                    COALESCE(LEAST(100, GREATEST(0,
                        (f.sig_strikes_land::numeric
                            / NULLIF(f.sig_strikes_att, 0) - 0.30) / 0.32 * 100
                    )) * 0.45, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        (f.sig_strikes_land - 8) / 82.0 * 100
                    )) * 0.40, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        f.knockdowns::numeric / 2.0 * 100
                    )) * 0.15, 0)
                ) / NULLIF(
                      (CASE WHEN f.sig_strikes_att > 0          THEN 0.45 ELSE 0 END)
                    + (CASE WHEN f.sig_strikes_land IS NOT NULL  THEN 0.40 ELSE 0 END)
                    + (CASE WHEN f.knockdowns IS NOT NULL        THEN 0.15 ELSE 0 END),
                0)
            END AS r0,

            -- ── [1] Grappling: td_vol(×0.35) + td_acc(×0.25) + ctrl(×0.25) + sub(×0.15) ──
            -- p05/p95: td_vol=0~5, td_acc=0.20~0.75(range=0.55), ctrl_min=0~10, sub=0~3
            CASE
                WHEN f.td_land IS NULL AND f.sub_att IS NULL AND f.ctrl_time_sec IS NULL THEN NULL
                ELSE (
                    COALESCE(LEAST(100, GREATEST(0,
                        f.td_land::numeric / 5.0 * 100
                    )) * 0.35, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        (f.td_land::numeric / NULLIF(f.td_att, 0) - 0.20) / 0.55 * 100
                    )) * 0.25, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        (f.ctrl_time_sec / 60.0) / 10.0 * 100
                    )) * 0.25, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        f.sub_att::numeric / 3.0 * 100
                    )) * 0.15, 0)
                ) / NULLIF(
                      (CASE WHEN f.td_land IS NOT NULL       THEN 0.35 ELSE 0 END)
                    + (CASE WHEN f.td_att > 0                THEN 0.25 ELSE 0 END)
                    + (CASE WHEN f.ctrl_time_sec IS NOT NULL THEN 0.25 ELSE 0 END)
                    + (CASE WHEN f.sub_att IS NOT NULL       THEN 0.15 ELSE 0 END),
                0)
            END AS r1,

            -- ── [2] Stamina: duration_score(×0.55) + activity_per_min(×0.45) ──
            -- duration_score = elapsed_sec / scheduled_sec → [0,100]
            -- activity_score = (sig_land + td_land×3 + ctrl_min×2) / elapsed_min / 6 → [0,100]
            --   p95 기준치: 6 의미 행동 / 분
            -- 활동 데이터 없으면 duration_score × 1.0 단독 사용
            -- skip: elapsed_sec NULL 또는 < 300 (R1 종료 경기는 지구력 판단 불가)
            CASE
                WHEN f.elapsed_sec IS NULL OR f.elapsed_sec < 300 THEN NULL
                WHEN f.sig_strikes_land IS NULL
                 AND f.td_land IS NULL
                 AND f.ctrl_time_sec IS NULL THEN
                    -- 활동 데이터 없음 → duration 단독
                    LEAST(100, GREATEST(0,
                        f.elapsed_sec::numeric / f.scheduled_sec * 100
                    ))
                ELSE
                    -- duration + activity 복합
                    LEAST(100, GREATEST(0,
                        f.elapsed_sec::numeric / f.scheduled_sec * 100
                    )) * 0.55
                  + LEAST(100, GREATEST(0,
                        (
                            COALESCE(f.sig_strikes_land, 0)
                          + COALESCE(f.td_land, 0) * 3
                          + COALESCE(f.ctrl_time_sec / 60.0, 0) * 2
                        ) / NULLIF(f.elapsed_sec::numeric / 60.0, 0) / 6.0 * 100
                    )) * 0.45
            END AS r2,

            -- ── [3] Defense: (1-opp_sig_acc)×0.60 + (1-opp_td_acc)×0.40 ──
            CASE
                WHEN NOT f.has_opp
                  OR (f.o_sig_att IS NULL AND f.o_td_att IS NULL) THEN NULL
                ELSE (
                    COALESCE(LEAST(100, GREATEST(0,
                        ((1 - f.o_sig_land::numeric / NULLIF(f.o_sig_att, 0))
                         - 0.38) / 0.32 * 100
                    )) * 0.60, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        ((1 - f.o_td_land::numeric / NULLIF(f.o_td_att, 0))
                         - 0.25) / 0.55 * 100
                    )) * 0.40, 0)
                ) / NULLIF(
                      (CASE WHEN f.o_sig_att > 0 THEN 0.60 ELSE 0 END)
                    + (CASE WHEN f.o_td_att  > 0 THEN 0.40 ELSE 0 END),
                0)
            END AS r3,

            -- ── [4] Speed: sig_per_min(×0.45) + sig_acc(×0.25) + KD(×0.20) + early_finish(×0.10) ──
            -- sig_per_min: sig_land / elapsed_min → [0,100] (p95≈6/min)
            -- sig_acc: same normalization as Striking (0.30~0.62 range)
            -- KD: 2회 = 100점 기준
            -- early_finish: 이 파이터가 조기 결판 냈을 때 가산 (≤2:30=100, ≤5:00=60, 기타=30)
            -- elapsed_sec NULL이면 per_min 컴포넌트 제외, 나머지 가중치만 사용
            -- skip: sig_land NULL AND knockdowns NULL
            CASE
                WHEN f.sig_strikes_land IS NULL AND f.knockdowns IS NULL THEN NULL
                ELSE (
                    COALESCE(LEAST(100, GREATEST(0,
                        COALESCE(f.sig_strikes_land, 0)::numeric
                        / NULLIF(f.elapsed_sec::numeric / 60.0, 0) / 6.0 * 100
                    )) * 0.45, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        (f.sig_strikes_land::numeric
                            / NULLIF(f.sig_strikes_att, 0) - 0.30) / 0.32 * 100
                    )) * 0.25, 0)
                  + COALESCE(LEAST(100, GREATEST(0,
                        f.knockdowns::numeric / 2.0 * 100
                    )) * 0.20, 0)
                  + CASE
                        WHEN f.result_method IN ('KO/TKO', 'TKO', 'SUB')
                          AND f.result_winner_side IS NOT DISTINCT FROM f.side
                          AND f.elapsed_sec IS NOT NULL
                        THEN CASE
                            WHEN f.elapsed_sec <= 150 THEN 100.0
                            WHEN f.elapsed_sec <= 300 THEN 60.0
                            ELSE 30.0
                        END * 0.10
                        ELSE 0.0
                    END
                ) / NULLIF(
                      (CASE WHEN f.elapsed_sec IS NOT NULL
                             AND f.sig_strikes_land IS NOT NULL THEN 0.45 ELSE 0 END)
                    + (CASE WHEN f.sig_strikes_att > 0          THEN 0.25 ELSE 0 END)
                    + (CASE WHEN f.knockdowns IS NOT NULL        THEN 0.20 ELSE 0 END)
                    + 0.10,
                0)
            END AS r4

        FROM fights f
    )
    SELECT
        ARRAY[
            SUM(w * r0) / NULLIF(SUM(w) FILTER (WHERE r0 IS NOT NULL), 0),
            SUM(w * r1) / NULLIF(SUM(w) FILTER (WHERE r1 IS NOT NULL), 0),
            SUM(w * r2) / NULLIF(SUM(w) FILTER (WHERE r2 IS NOT NULL), 0),
            SUM(w * r3) / NULLIF(SUM(w) FILTER (WHERE r3 IS NOT NULL), 0),
            SUM(w * r4) / NULLIF(SUM(w) FILTER (WHERE r4 IS NOT NULL), 0)
        ]::numeric[],
        ARRAY[
            COUNT(*) FILTER (WHERE r0 IS NOT NULL)::integer,
            COUNT(*) FILTER (WHERE r1 IS NOT NULL)::integer,
            COUNT(*) FILTER (WHERE r2 IS NOT NULL)::integer,
            COUNT(*) FILTER (WHERE r3 IS NOT NULL)::integer,
            COUNT(*) FILTER (WHERE r4 IS NOT NULL)::integer
        ]::integer[],
        jsonb_agg(
            jsonb_build_object(
                'matchup_id',    matchup_id,
                'recency_rank',  rr,
                'weight',        round(w::numeric, 3),
                'r0_striking',   round(r0::numeric, 1),
                'r1_grappling',  round(r1::numeric, 1),
                'r2_stamina',    round(r2::numeric, 1),
                'r3_defense',    round(r3::numeric, 1),
                'r4_speed',      round(r4::numeric, 1),
                'has_opponent',  has_opp
            )
            ORDER BY rr ASC
        )
    INTO v_R, v_n, v_raw_scores
    FROM scored;

    -- ── [7] 축별 delta 계산 + applied/skipped 분류 ────────────────────
    v_final := ARRAY[
        round(v_base[1])::integer,
        round(v_base[2])::integer,
        round(v_base[3])::integer,
        round(v_base[4])::integer,
        round(v_base[5])::integer
    ];

    FOR i IN 1..5 LOOP
        IF v_R[i] IS NULL THEN
            v_skip_reason := CASE i
                WHEN 3 THEN 'Stamina: 경기 시간 데이터 없음 — 300초 이상 경기만 반영 (result_round/result_time 필요)'
                WHEN 4 THEN 'Defense: 상대 스탯 필요 — 상대의 Sig. Strikes 또는 Takedown 시도값 입력 필요'
                WHEN 5 THEN 'Speed: 유효타(Sig. Strikes) 또는 넉다운 데이터 없음'
                ELSE        v_axis_names[i] || ': 경기 데이터 없음'
            END;
        ELSIF v_n[i] < p_min_sample THEN
            v_skip_reason := v_axis_names[i]
                || ': 표본 부족 (n=' || v_n[i]
                || ' < min_sample=' || p_min_sample || ')';
        ELSE
            v_skip_reason := NULL;
        END IF;

        IF v_skip_reason IS NOT NULL THEN
            v_skipped := v_skipped
                || jsonb_build_object('axis', v_axis_names[i], 'reason', v_skip_reason);
            CONTINUE;
        END IF;

        v_fn       := v_n[i]::numeric / (v_n[i] + 3);
        v_delta[i] := (v_R[i] - v_base[i]) * v_fn * v_alpha;
        v_delta[i] := GREATEST(-v_dmax::numeric, LEAST(v_dmax::numeric, v_delta[i]));
        v_final[i] := GREATEST(45, LEAST(98, round(v_base[i] + v_delta[i])))::integer;
        v_applied  := v_applied || v_axis_names[i];
    END LOOP;

    -- ── [8] input summary ─────────────────────────────────────────────
    SELECT jsonb_build_object(
        'total_mfs_rows',      (
            SELECT COUNT(*) FROM public.matchup_fight_stats
            WHERE fighter_id = p_fighter_id
        ),
        'completed_fights',    (
            SELECT COUNT(*)
            FROM public.matchup_fight_stats s
            JOIN public.matchups m ON m.id = s.matchup_id
            WHERE s.fighter_id = p_fighter_id
              AND m.result_status = 'completed'
        ),
        'fights_with_opponent',(
            SELECT COUNT(*)
            FROM public.matchup_fight_stats s
            JOIN public.matchups m ON m.id = s.matchup_id
            WHERE s.fighter_id = p_fighter_id
              AND m.result_status = 'completed'
              AND EXISTS (
                  SELECT 1 FROM public.matchup_fight_stats o
                  WHERE o.matchup_id = s.matchup_id AND o.side <> s.side
              )
        ),
        'used_in_calculation', (
            SELECT LEAST(10, COUNT(*)::integer)
            FROM public.matchup_fight_stats s
            JOIN public.matchups m ON m.id = s.matchup_id
            WHERE s.fighter_id = p_fighter_id
              AND m.result_status = 'completed'
        )
    ) INTO v_input;

    -- ── [9] p_dry_run=false: UPDATE + audit ───────────────────────────
    IF NOT p_dry_run THEN
        UPDATE public.fighters
        SET stats            = jsonb_build_array(
                                   v_final[1], v_final[2], v_final[3],
                                   v_final[4], v_final[5]
                               ),
            stats_updated_at = now()
        WHERE id = p_fighter_id;

        INSERT INTO public.admin_audit_logs
            (admin_user_id, action, entity_table, entity_id,
             before_data, after_data, metadata)
        VALUES (
            v_uid,
            'apply_fighter_stats_modifier',
            'fighters',
            p_fighter_id,
            jsonb_build_object('stats', v_before_stats),
            jsonb_build_object('stats', jsonb_build_array(
                v_final[1], v_final[2], v_final[3], v_final[4], v_final[5]
            )),
            jsonb_build_object(
                'baseline',     to_jsonb(v_base),
                'delta',        to_jsonb(v_delta),
                'alpha',        round(v_alpha::numeric, 4),
                'delta_max',    v_dmax,
                'global_alpha', p_global_alpha,
                'sample_count', to_jsonb(v_n),
                'applied_axes', to_jsonb(v_applied)
            )
        );
    END IF;

    -- ── [10] 반환 ─────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'ok',                true,
        'dry_run',           p_dry_run,
        'fighter_id',        p_fighter_id,
        'fighter_name',      v_fighter.name,
        'division',          v_fighter.division,
        'rank',              v_rank,
        'current_stats',     v_before_stats,
        'baseline_stats',    to_jsonb(v_base),
        'computed_stats',    to_jsonb(v_final),
        'delta',             to_jsonb(v_delta),
        'raw_recent_scores', COALESCE(v_raw_scores, '[]'::jsonb),
        'sample_count',      to_jsonb(v_n),
        'rank_factor',       round(v_alpha::numeric, 4),
        'delta_max',         v_dmax,
        'sample_factor',     jsonb_build_object(
                                 'k', 3,
                                 'per_axis', (
                                     SELECT jsonb_agg(
                                         CASE WHEN x > 0
                                             THEN round(x::numeric / (x + 3), 3)
                                             ELSE 0
                                         END
                                     )
                                     FROM unnest(v_n) x
                                 )
                             ),
        'applied_axes',      to_jsonb(v_applied),
        'skipped_axes',      v_skipped,
        'input_summary',     v_input
    );
END;
$$;

-- ================================================================
-- REVOKE / GRANT (인터페이스 동일 — 시그니처 불변)
-- ================================================================

REVOKE ALL ON FUNCTION public.admin_preview_fighter_stats_modifier(
    text, boolean, numeric, integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_preview_fighter_stats_modifier(
    text, boolean, numeric, integer
) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_preview_fighter_stats_modifier(
    text, boolean, numeric, integer
) TO authenticated;
