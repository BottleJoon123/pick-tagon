-- ================================================================
-- Phase S3-B 전처리: admin_get_hall_of_fame() — 어드민 전용 HOF 조회
--
-- 배경:
--   get_hall_of_fame()은 anon/authenticated 공개 읽기이며
--   is_hidden=FALSE 필터로 숨김 항목 제외 반환.
--   admin UI에서 숨김 항목도 포함하여 표시 + hide/restore 연결을 위해
--   어드민 전용 전체 반환 RPC가 필요함.
--
-- 반환 차이점:
--   - hof_id (season_hof.id) 포함 — hide/restore RPC 호출 키
--   - is_hidden / hidden_at / hidden_reason 포함
--   - is_hidden 필터 없음 (전체 반환)
--   - is_admin() guard 필수
--
-- 권한:
--   anon: REVOKE (명시적)
--   authenticated: GRANT (is_admin() guard 내부 적용)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_get_hall_of_fame()
RETURNS TABLE (
    hof_id        INTEGER,
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
    faction_id    INTEGER,
    is_hidden     BOOLEAN,
    hidden_at     TIMESTAMPTZ,
    hidden_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

    RETURN QUERY
    SELECT
        h.id,
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
        h.faction_id,
        h.is_hidden,
        h.hidden_at,
        h.hidden_reason
    FROM public.seasons s
    JOIN public.season_hof h ON h.season_id = s.id
    WHERE s.is_active = FALSE
    ORDER BY s.id DESC, h.rank ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_hall_of_fame() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_hall_of_fame() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_hall_of_fame() TO authenticated;
