-- ================================================================
-- Fix: Add audit logs to season admin RPCs
--
-- 기존 admin_update_season_name / admin_end_season 재정의
-- admin_audit_logs INSERT 추가 (admin_server_phase1 패턴 준수)
--
-- admin_update_season_name:
--   before_data: 변경 전 seasons row
--   after_data:  변경 후 seasons row
--   action:      'update_season_name'
--   entity_table: 'seasons'
--   entity_id:   season id
--
-- admin_end_season:
--   before_data: 종료 전 active season row
--   metadata:    ended/new season id·name, reset_points_to, affected_users_count, top3
--   action:      'end_season'
--   entity_table: 'seasons'
--   entity_id:   ended season id
-- ================================================================


-- ================================================================
-- 1. admin_update_season_name (audit 추가)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_update_season_name(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name   TEXT   := TRIM(COALESCE(p_name, ''));
    v_season RECORD;
    v_before JSONB;
    v_after  JSONB;
    v_uid    UUID   := auth.uid();
BEGIN
    -- 1. admin 검증
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    -- 2. 이름 유효성 검사
    IF v_name = '' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'name_required');
    END IF;

    -- 3. 활성 시즌 확인
    SELECT * INTO v_season FROM public.seasons WHERE is_active = TRUE LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_active_season');
    END IF;

    -- 4. before_data 스냅샷
    SELECT to_jsonb(s) INTO v_before FROM public.seasons s WHERE id = v_season.id;

    -- 5. 시즌명 업데이트
    UPDATE public.seasons SET name = v_name WHERE id = v_season.id;

    -- 6. after_data 스냅샷
    SELECT to_jsonb(s) INTO v_after FROM public.seasons s WHERE id = v_season.id;

    -- 7. audit log
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, 'update_season_name', 'seasons', v_season.id::TEXT, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_season_name(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_season_name(TEXT) TO authenticated;


-- ================================================================
-- 2. admin_end_season (audit 추가)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_end_season(p_next_season_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_name     TEXT    := TRIM(COALESCE(p_next_season_name, ''));
    v_season        RECORD;
    v_cur_num       INTEGER;
    v_new_name      TEXT;
    v_top3          JSONB;
    v_before        JSONB;
    v_new_season_id INTEGER;
    v_affected      INTEGER;
    v_uid           UUID    := auth.uid();
BEGIN
    -- 1. admin 검증
    IF NOT private.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'admin_required');
    END IF;

    -- 2. 현재 활성 시즌 잠금 (중복 종료 방지)
    SELECT * INTO v_season
    FROM public.seasons
    WHERE is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_active_season');
    END IF;

    -- 3. before_data 스냅샷 (잠금 후)
    SELECT to_jsonb(s) INTO v_before FROM public.seasons s WHERE id = v_season.id;

    -- 4. 다음 시즌명 결정 (빈 문자열이면 자동 +1 증가)
    IF v_next_name = '' THEN
        v_cur_num  := COALESCE(
            (regexp_match(v_season.name, '\d+'))[1]::INTEGER, 1
        );
        v_new_name := 'Season ' || (v_cur_num + 1);
    ELSE
        v_new_name := v_next_name;
    END IF;

    -- 5. Top 3 스냅샷 → season_hof INSERT
    INSERT INTO public.season_hof (
        season_id, rank, user_id, nickname,
        points, total_picks, success_picks, accuracy, belt, faction_id
    )
    SELECT
        v_season.id,
        ROW_NUMBER() OVER (
            ORDER BY u.points DESC, u.success_picks DESC, u.total_picks DESC
        )::INTEGER                                          AS rank,
        u.id,
        COALESCE(u.nickname, '익명'),
        u.points,
        COALESCE(u.total_picks, 0),
        COALESCE(u.success_picks, 0),
        CASE WHEN COALESCE(u.total_picks, 0) = 0 THEN NULL
             ELSE ROUND(
                 u.success_picks::NUMERIC / u.total_picks * 100
             )::INTEGER
        END,
        CASE
            WHEN u.points > 10000 THEN 'Black'
            WHEN u.points > 5000  THEN 'Brown'
            WHEN u.points > 2000  THEN 'Purple'
            WHEN u.points > 1000  THEN 'Blue'
            ELSE                       'White'
        END,
        u.faction_id
    FROM (
        SELECT id, nickname, points, total_picks, success_picks, faction_id
        FROM public.users
        ORDER BY points DESC, success_picks DESC, total_picks DESC
        LIMIT 3
    ) u
    ON CONFLICT (season_id, rank) DO NOTHING;

    -- 6. 현재 시즌 종료 처리
    UPDATE public.seasons
    SET is_active = FALSE,
        end_date  = CURRENT_DATE
    WHERE id = v_season.id;

    -- 7. 새 시즌 생성
    INSERT INTO public.seasons (name, start_date, is_active)
    VALUES (v_new_name, CURRENT_DATE, TRUE)
    RETURNING id INTO v_new_season_id;

    -- 8. 전체 유저 points 리셋 + affected count
    UPDATE public.users SET points = 1000;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    -- 9. top3 데이터 조회
    SELECT jsonb_agg(
        jsonb_build_object(
            'rank',     h.rank,
            'nickname', h.nickname,
            'points',   h.points,
            'accuracy', h.accuracy,
            'belt',     h.belt
        ) ORDER BY h.rank
    ) INTO v_top3
    FROM public.season_hof h
    WHERE h.season_id = v_season.id;

    -- 10. audit log
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, metadata)
    VALUES (
        v_uid,
        'end_season',
        'seasons',
        v_season.id::TEXT,
        v_before,
        jsonb_build_object(
            'ended_season_id',      v_season.id,
            'ended_season_name',    v_season.name,
            'new_season_id',        v_new_season_id,
            'new_season_name',      v_new_name,
            'reset_points_to',      1000,
            'affected_users_count', v_affected,
            'top3',                 COALESCE(v_top3, '[]'::JSONB)
        )
    );

    RETURN jsonb_build_object(
        'ok',           true,
        'ended_season', v_season.name,
        'new_season',   v_new_name,
        'top3',         COALESCE(v_top3, '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_end_season(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_end_season(TEXT) TO authenticated;
