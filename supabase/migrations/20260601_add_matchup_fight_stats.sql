-- ============================================================
-- migration: 20260601_add_matchup_fight_stats
-- 경기별 파이터 세부 스탯 테이블 + RLS + admin RPC
-- ============================================================

-- [1] updated_at 전용 트리거 함수 (generic 함수 사용 금지)
CREATE OR REPLACE FUNCTION public.set_matchup_fight_stats_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- [2] 테이블 생성
--     fighter_id: fighters.id(text PK) FK, 삭제 시 SET NULL
--     matchup_id: matchups.id(uuid PK) FK, 삭제 시 CASCADE
--     land <= att CHECK: NULL 포함 시 비교식이 NULL → 자동 통과 (PostgreSQL 기본 동작)
CREATE TABLE public.matchup_fight_stats (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    matchup_id      uuid        NOT NULL
                                REFERENCES public.matchups(id)  ON DELETE CASCADE,
    fighter_id      text
                                REFERENCES public.fighters(id)  ON DELETE SET NULL,
    fighter_name    text        NOT NULL,
    side            text        NOT NULL
                                CHECK (side IN ('red', 'blue')),

    total_strikes_att   smallint    CHECK (total_strikes_att  >= 0),
    total_strikes_land  smallint    CHECK (total_strikes_land >= 0),
    CONSTRAINT chk_total_strikes_land_lte_att
        CHECK (total_strikes_land <= total_strikes_att),

    sig_strikes_att     smallint    CHECK (sig_strikes_att  >= 0),
    sig_strikes_land    smallint    CHECK (sig_strikes_land >= 0),
    CONSTRAINT chk_sig_strikes_land_lte_att
        CHECK (sig_strikes_land <= sig_strikes_att),

    td_att          smallint    CHECK (td_att  >= 0),
    td_land         smallint    CHECK (td_land >= 0),
    CONSTRAINT chk_td_land_lte_att
        CHECK (td_land <= td_att),

    sub_att         smallint    CHECK (sub_att     >= 0),
    knockdowns      smallint    CHECK (knockdowns  >= 0),
    ctrl_time_sec   smallint    CHECK (ctrl_time_sec >= 0),

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (matchup_id, side)
);

COMMENT ON TABLE public.matchup_fight_stats IS
    '경기별 파이터 세부 스탯. matchup 1:2 관계 (red/blue). 향후 fighter stats 재계산 원천 데이터.';

-- [3] updated_at 전용 트리거
CREATE TRIGGER trg_matchup_fight_stats_updated_at
    BEFORE UPDATE ON public.matchup_fight_stats
    FOR EACH ROW EXECUTE FUNCTION public.set_matchup_fight_stats_updated_at();

-- [4] 인덱스
CREATE INDEX idx_matchup_fight_stats_matchup_id
    ON public.matchup_fight_stats (matchup_id);

CREATE INDEX idx_matchup_fight_stats_fighter_id
    ON public.matchup_fight_stats (fighter_id);

-- ============================================================
-- RLS
-- SELECT: 전체 공개 (matchups / fighters와 동일 패턴)
-- INSERT/UPDATE/DELETE: authenticated + private.is_admin() 전용
-- ============================================================

ALTER TABLE public.matchup_fight_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfs_select_public"
    ON public.matchup_fight_stats
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "mfs_insert_admin"
    ON public.matchup_fight_stats
    FOR INSERT
    TO authenticated
    WITH CHECK (private.is_admin());

CREATE POLICY "mfs_update_admin"
    ON public.matchup_fight_stats
    FOR UPDATE
    TO authenticated
    USING (private.is_admin());

CREATE POLICY "mfs_delete_admin"
    ON public.matchup_fight_stats
    FOR DELETE
    TO authenticated
    USING (private.is_admin());

-- ============================================================
-- RPC: admin_upsert_matchup_fight_stats
-- 패턴: admin_set_matchup_result / admin_upsert_fighter와 동일
--   SECURITY DEFINER
--   SET search_path = public, pg_temp
--   private.is_admin() 체크
--   RETURNS jsonb
--   admin_audit_logs INSERT (6컬럼, no metadata — admin_upsert_fighter 패턴)
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_matchup_fight_stats(
    p_matchup_id         uuid,
    p_side               text,
    p_fighter_id         text     DEFAULT NULL,
    p_fighter_name       text     DEFAULT NULL,
    p_total_strikes_att  smallint DEFAULT NULL,
    p_total_strikes_land smallint DEFAULT NULL,
    p_sig_strikes_att    smallint DEFAULT NULL,
    p_sig_strikes_land   smallint DEFAULT NULL,
    p_td_att             smallint DEFAULT NULL,
    p_td_land            smallint DEFAULT NULL,
    p_sub_att            smallint DEFAULT NULL,
    p_knockdowns         smallint DEFAULT NULL,
    p_ctrl_time_sec      smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      uuid    := auth.uid();
    v_matchup  record;
    v_name     text;
    v_fid      text;
    v_before   jsonb;
    v_after    jsonb;
BEGIN
    -- [1] admin 체크 (기존 RPC 패턴과 완전 동일)
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- [2] side 유효성
    IF p_side NOT IN ('red', 'blue') THEN
        RAISE EXCEPTION 'invalid_side';
    END IF;

    -- [3] matchup 존재 확인 + 코너 이름 로드
    SELECT id, red_fighter_id, blue_fighter_id,
           red_fighter_name, blue_fighter_name
    INTO v_matchup
    FROM public.matchups
    WHERE id = p_matchup_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'matchup_not_found';
    END IF;

    -- [4] fighter_name: 입력값(공백제거) → matchup 해당 코너 이름 → 'Unknown' 순 fallback
    v_name := NULLIF(TRIM(COALESCE(p_fighter_name, '')), '');
    IF v_name IS NULL THEN
        v_name := CASE p_side
            WHEN 'red'  THEN COALESCE(v_matchup.red_fighter_name,  'Unknown')
            WHEN 'blue' THEN COALESCE(v_matchup.blue_fighter_name, 'Unknown')
            ELSE 'Unknown'
        END;
    END IF;

    -- [5] fighter_id 정리: 빈 문자열 → NULL
    v_fid := NULLIF(TRIM(COALESCE(p_fighter_id, '')), '');

    -- [6] 기존 행 스냅샷 (audit before)
    SELECT to_jsonb(s) INTO v_before
    FROM public.matchup_fight_stats s
    WHERE matchup_id = p_matchup_id AND side = p_side;

    -- [7] upsert (UNIQUE(matchup_id, side) 기반)
    INSERT INTO public.matchup_fight_stats (
        matchup_id, side, fighter_id, fighter_name,
        total_strikes_att,  total_strikes_land,
        sig_strikes_att,    sig_strikes_land,
        td_att, td_land, sub_att, knockdowns, ctrl_time_sec
    ) VALUES (
        p_matchup_id, p_side, v_fid, v_name,
        p_total_strikes_att,  p_total_strikes_land,
        p_sig_strikes_att,    p_sig_strikes_land,
        p_td_att, p_td_land, p_sub_att, p_knockdowns, p_ctrl_time_sec
    )
    ON CONFLICT (matchup_id, side) DO UPDATE SET
        fighter_id           = EXCLUDED.fighter_id,
        fighter_name         = EXCLUDED.fighter_name,
        total_strikes_att    = EXCLUDED.total_strikes_att,
        total_strikes_land   = EXCLUDED.total_strikes_land,
        sig_strikes_att      = EXCLUDED.sig_strikes_att,
        sig_strikes_land     = EXCLUDED.sig_strikes_land,
        td_att               = EXCLUDED.td_att,
        td_land              = EXCLUDED.td_land,
        sub_att              = EXCLUDED.sub_att,
        knockdowns           = EXCLUDED.knockdowns,
        ctrl_time_sec        = EXCLUDED.ctrl_time_sec,
        updated_at           = now();

    -- [8] after 스냅샷 (audit after)
    SELECT to_jsonb(s) INTO v_after
    FROM public.matchup_fight_stats s
    WHERE matchup_id = p_matchup_id AND side = p_side;

    -- [9] audit log (admin_upsert_fighter 6컬럼 패턴, no metadata)
    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (
        v_uid,
        'upsert_matchup_fight_stats',
        'matchup_fight_stats',
        p_matchup_id::text,
        v_before,
        v_after
    );

    RETURN jsonb_build_object(
        'ok',         true,
        'matchup_id', p_matchup_id,
        'side',       p_side
    );
END;
$$;

-- ============================================================
-- REVOKE / GRANT
-- ============================================================

REVOKE ALL ON FUNCTION public.admin_upsert_matchup_fight_stats(
    uuid, text, text, text,
    smallint, smallint, smallint, smallint,
    smallint, smallint, smallint, smallint, smallint
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_upsert_matchup_fight_stats(
    uuid, text, text, text,
    smallint, smallint, smallint, smallint,
    smallint, smallint, smallint, smallint, smallint
) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_upsert_matchup_fight_stats(
    uuid, text, text, text,
    smallint, smallint, smallint, smallint,
    smallint, smallint, smallint, smallint, smallint
) TO authenticated;
