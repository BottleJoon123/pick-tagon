-- ================================================================
-- Phase S3-A: season_hof soft hide — 컬럼 추가 + hide/restore RPC
--
-- 배경 (docs/SEASON_HOF_ADMIN_PLAN.md):
--   season_hof는 운영 이력 — hard delete는 복구 불가.
--   오입력/테스트 시즌 기록은 숨김(soft hide)으로 관리한다.
--
-- 변경 내용:
--   1. season_hof 컬럼 추가
--      - is_hidden      BOOLEAN NOT NULL DEFAULT FALSE
--      - hidden_at      TIMESTAMPTZ NULL
--      - hidden_by      UUID NULL REFERENCES auth.users(id)
--      - hidden_reason  TEXT NULL
--
--   2. get_hall_of_fame() 수정
--      - WHERE h.is_hidden = FALSE 추가
--      - 반환 구조/권한 변경 없음 (하위 호환)
--
--   3. admin_hide_hof_entry(p_hof_id INTEGER, p_reason TEXT)
--      - is_admin() guard + SECURITY DEFINER
--      - active season HOF 숨기기 차단
--      - is_hidden=true / hidden_at / hidden_by / hidden_reason 기록
--      - idempotent: 이미 hidden이면 {ok:true, idempotent:true}
--      - audit_logs 기록
--
--   4. admin_restore_hof_entry(p_hof_id INTEGER)
--      - is_admin() guard + SECURITY DEFINER
--      - is_hidden=false / null 초기화
--      - idempotent: 이미 visible이면 {ok:true, idempotent:true}
--      - audit_logs 기록
--
-- 기존 동작 변경 없음:
--   - seasons / season_hof hard delete 없음
--   - admin_end_season 호출 방식 변경 없음
--   - 운영 데이터 수정 없음
--   - active season 삭제/숨김 허용 없음
--
-- 권한:
--   get_hall_of_fame:          anon, authenticated (기존 유지)
--   admin_hide_hof_entry:      authenticated only
--   admin_restore_hof_entry:   authenticated only
-- ================================================================

-- ── 1. season_hof 컬럼 추가 ────────────────────────────────────────

ALTER TABLE public.season_hof
    ADD COLUMN IF NOT EXISTS is_hidden     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hidden_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- ── 2. get_hall_of_fame() — is_hidden=FALSE 필터 추가 ──────────────

CREATE OR REPLACE FUNCTION public.get_hall_of_fame()
RETURNS TABLE (
    season_id     INTEGER,
    season_name   TEXT,
    end_date      DATE,
    rank          INTEGER,
    nickname      TEXT,
    points        INTEGER,
    total_picks   INTEGER,
    success_picks INTEGER,
    accuracy      INTEGER,
    belt          TEXT,
    faction_id    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        s.id,
        s.name,
        s.end_date,
        h.rank,
        h.nickname,
        h.points,
        h.total_picks,
        h.success_picks,
        h.accuracy,
        h.belt,
        h.faction_id
    FROM public.seasons s
    JOIN public.season_hof h ON h.season_id = s.id
    WHERE s.is_active  = FALSE
      AND h.is_hidden  = FALSE
    ORDER BY s.id DESC, h.rank ASC;
$$;

REVOKE ALL ON FUNCTION public.get_hall_of_fame() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hall_of_fame() TO anon, authenticated;

-- ── 3. admin_hide_hof_entry ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_hide_hof_entry(
    p_hof_id INTEGER,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_hof      RECORD;
    v_season   RECORD;
    v_before   JSONB;
    v_after    JSONB;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    -- HOF row 조회 + 잠금
    SELECT * INTO v_hof
    FROM public.season_hof
    WHERE id = p_hof_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'hof_entry_not_found');
    END IF;

    -- active season HOF 숨기기 차단
    SELECT * INTO v_season FROM public.seasons WHERE id = v_hof.season_id;
    IF v_season.is_active = TRUE THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'active_season_not_allowed');
    END IF;

    -- idempotent
    IF v_hof.is_hidden = TRUE THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true, 'hof_id', p_hof_id);
    END IF;

    v_before := to_jsonb(v_hof);

    UPDATE public.season_hof
    SET
        is_hidden     = TRUE,
        hidden_at     = NOW(),
        hidden_by     = v_uid,
        hidden_reason = p_reason
    WHERE id = p_hof_id;

    SELECT to_jsonb(h) INTO v_after FROM public.season_hof h WHERE id = p_hof_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
    VALUES (
        v_uid,
        'hide_hof_entry',
        'season_hof',
        p_hof_id::TEXT,
        v_before,
        v_after,
        jsonb_build_object(
            'season_id',   v_hof.season_id,
            'season_name', v_season.name,
            'rank',        v_hof.rank,
            'nickname',    v_hof.nickname,
            'reason',      COALESCE(p_reason, '')
        )
    );

    RETURN jsonb_build_object(
        'ok',          true,
        'hof_id',      p_hof_id,
        'season_id',   v_hof.season_id,
        'season_name', v_season.name,
        'rank',        v_hof.rank,
        'nickname',    v_hof.nickname
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) TO authenticated;

-- ── 4. admin_restore_hof_entry ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_restore_hof_entry(
    p_hof_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_hof    RECORD;
    v_season RECORD;
    v_before JSONB;
    v_after  JSONB;
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    -- HOF row 조회 + 잠금
    SELECT * INTO v_hof
    FROM public.season_hof
    WHERE id = p_hof_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'hof_entry_not_found');
    END IF;

    SELECT * INTO v_season FROM public.seasons WHERE id = v_hof.season_id;

    -- idempotent
    IF v_hof.is_hidden = FALSE THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true, 'hof_id', p_hof_id);
    END IF;

    v_before := to_jsonb(v_hof);

    UPDATE public.season_hof
    SET
        is_hidden     = FALSE,
        hidden_at     = NULL,
        hidden_by     = NULL,
        hidden_reason = NULL
    WHERE id = p_hof_id;

    SELECT to_jsonb(h) INTO v_after FROM public.season_hof h WHERE id = p_hof_id;

    INSERT INTO public.admin_audit_logs
        (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
    VALUES (
        v_uid,
        'restore_hof_entry',
        'season_hof',
        p_hof_id::TEXT,
        v_before,
        v_after,
        jsonb_build_object(
            'season_id',   v_hof.season_id,
            'season_name', v_season.name,
            'rank',        v_hof.rank,
            'nickname',    v_hof.nickname
        )
    );

    RETURN jsonb_build_object(
        'ok',          true,
        'hof_id',      p_hof_id,
        'season_id',   v_hof.season_id,
        'season_name', v_season.name,
        'rank',        v_hof.rank,
        'nickname',    v_hof.nickname
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restore_hof_entry(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restore_hof_entry(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_hof_entry(INTEGER) TO authenticated;
