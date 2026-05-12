-- ================================================================
-- Phase S1: Season Management Tables + RPCs
--
-- 테이블:
--   public.seasons     — 현재/과거 시즌 메타데이터
--   public.season_hof  — 시즌 종료 시 Top 3 스냅샷
--
-- RPC (공개 읽기):
--   get_current_season()   — 현재 활성 시즌 1행 반환
--   get_hall_of_fame()     — 종료 시즌 × Top 3 반환
--
-- RPC (admin 전용):
--   admin_update_season_name(p_name)          — 현재 시즌명 변경
--   admin_end_season(p_next_season_name)       — 시즌 종료 + 다음 시즌 생성 + points 리셋
--
-- 포인트 리셋 정책:
--   users.points만 1000으로 리셋
--   total_picks, success_picks는 all-time 커리어 지표로 유지
--   picks row 유지
--
-- RLS 정책:
--   모든 mutation은 SECURITY DEFINER RPC 경유
--   직접 테이블 mutation 불허 (no INSERT/UPDATE/DELETE policy)
--   SELECT는 RPC로만 읽으므로 별도 public SELECT policy 없음
-- ================================================================


-- ================================================================
-- 1. public.seasons 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS public.seasons (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL,
    start_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    end_date   DATE,                          -- NULL = 진행 중
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 동시에 활성 시즌은 1개만 (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active
    ON public.seasons (is_active)
    WHERE is_active = TRUE;

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 2. public.season_hof 테이블
-- ================================================================

CREATE TABLE IF NOT EXISTS public.season_hof (
    id            SERIAL      PRIMARY KEY,
    season_id     INTEGER     NOT NULL REFERENCES public.seasons(id),
    rank          INTEGER     NOT NULL CHECK (rank BETWEEN 1 AND 3),
    user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nickname      TEXT        NOT NULL,
    points        INTEGER     NOT NULL,
    total_picks   INTEGER     NOT NULL DEFAULT 0,
    success_picks INTEGER     NOT NULL DEFAULT 0,
    accuracy      INTEGER,                    -- 0-100, NULL = 정산 픽 없음
    belt          TEXT        NOT NULL DEFAULT 'White',
    faction_id    INTEGER     REFERENCES public.factions(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (season_id, rank)
);

ALTER TABLE public.season_hof ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 3. 초기 시드 — 활성 시즌이 없을 때만 Season 1 생성
--    기존 운영 데이터 덮어쓰기 없음 (WHERE NOT EXISTS 가드)
-- ================================================================

INSERT INTO public.seasons (name, start_date, is_active)
SELECT 'Season 1', CURRENT_DATE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.seasons WHERE is_active = TRUE
);

-- ================================================================
-- 4. get_current_season()
--    현재 활성 시즌 1행 반환
--    권한: anon, authenticated
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_current_season()
RETURNS TABLE (id INTEGER, name TEXT, start_date DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id, s.name, s.start_date
    FROM public.seasons s
    WHERE s.is_active = TRUE
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_current_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_season() TO anon, authenticated;

-- ================================================================
-- 5. get_hall_of_fame()
--    종료된 시즌 × Top 3 반환 (최신 시즌 먼저, rank ASC)
--    권한: anon, authenticated
-- ================================================================

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
    WHERE s.is_active = FALSE
    ORDER BY s.id DESC, h.rank ASC;
$$;

REVOKE ALL ON FUNCTION public.get_hall_of_fame() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hall_of_fame() TO anon, authenticated;

-- ================================================================
-- 6. admin_update_season_name(p_name TEXT)
--    현재 활성 시즌명 변경 — admin 전용
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

    -- 4. 시즌명 업데이트
    UPDATE public.seasons SET name = v_name WHERE id = v_season.id;

    RETURN jsonb_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_season_name(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_season_name(TEXT) TO authenticated;

-- ================================================================
-- 7. admin_end_season(p_next_season_name TEXT)
--    시즌 종료 + Top 3 스냅샷 + 다음 시즌 생성 + users.points 리셋
--    — admin 전용
--
--    벨트 기준 (프론트 getBeltInfo와 동일):
--      points > 10000 → Black
--      points > 5000  → Brown
--      points > 2000  → Purple
--      points > 1000  → Blue
--      else           → White
--
--    포인트 리셋:
--      users.points = 1000  (all users)
--      total_picks, success_picks 유지 (all-time 커리어 지표)
--      picks row 유지
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_end_season(p_next_season_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_name TEXT   := TRIM(COALESCE(p_next_season_name, ''));
    v_season    RECORD;
    v_cur_num   INTEGER;
    v_new_name  TEXT;
    v_top3      JSONB;
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

    -- 3. 다음 시즌명 결정 (빈 문자열이면 자동 +1 증가)
    IF v_next_name = '' THEN
        v_cur_num  := COALESCE(
            (regexp_match(v_season.name, '\d+'))[1]::INTEGER, 1
        );
        v_new_name := 'Season ' || (v_cur_num + 1);
    ELSE
        v_new_name := v_next_name;
    END IF;

    -- 4. Top 3 스냅샷 → season_hof INSERT
    --    ON CONFLICT DO NOTHING: 동일 시즌 중복 호출 안전 처리
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

    -- 5. 현재 시즌 종료 처리
    UPDATE public.seasons
    SET is_active = FALSE,
        end_date  = CURRENT_DATE
    WHERE id = v_season.id;

    -- 6. 새 시즌 생성
    INSERT INTO public.seasons (name, start_date, is_active)
    VALUES (v_new_name, CURRENT_DATE, TRUE);

    -- 7. 전체 유저 points만 1000으로 리셋
    --    total_picks / success_picks: all-time 커리어 지표 — 유지
    UPDATE public.users SET points = 1000;

    -- 8. 반환: 종료 시즌명 + 새 시즌명 + top3 스냅샷
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
