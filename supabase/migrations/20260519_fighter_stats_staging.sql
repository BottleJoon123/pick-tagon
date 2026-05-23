-- ================================================================
-- fighter_stats_staging: UFCStats.com 원시 데이터 staging 테이블
--
-- 목적: ufcstats.com 스크래퍼 CSV를 운영 fighters 테이블에 직접 반영하기 전
--       매칭 검증 + admin 승인 단계를 거치기 위한 중간 테이블.
--
-- 흐름: CSV → import → 자동 매칭 → admin 검토 → approved=true → apply (별도 승인)
-- ================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.fighter_stats_staging (
    id                  BIGSERIAL       PRIMARY KEY,
    import_batch        TEXT            NOT NULL,           -- 'ufcstats_20260519' 등
    source_ufc_stats_id TEXT,                               -- ufcstats.com URL hash
    profile_url         TEXT,                               -- http://ufcstats.com/fighter-details/{hash}
    source_name         TEXT            NOT NULL,           -- CSV name_en 원본
    slpm                NUMERIC,
    str_acc             NUMERIC,
    sapm                NUMERIC,
    str_def             NUMERIC,
    td_avg              NUMERIC,
    td_acc              NUMERIC,
    td_def              NUMERIC,
    sub_avg             NUMERIC,
    scraped_at          TIMESTAMPTZ,
    -- 매칭 결과
    matched_fighter_id  TEXT            REFERENCES public.fighters(id),
    match_status        TEXT            NOT NULL DEFAULT 'pending',
    -- 'pending' | 'exact' | 'fuzzy' | 'ambiguous' | 'unmatched'
    match_confidence    NUMERIC,        -- 0–100
    match_reason        TEXT,           -- 매칭 방법 설명
    -- 승인 관리
    approved            BOOLEAN         NOT NULL DEFAULT FALSE,
    reviewed_by         UUID            REFERENCES auth.users(id),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_fss_import_batch    ON public.fighter_stats_staging (import_batch);
CREATE INDEX IF NOT EXISTS idx_fss_match_status    ON public.fighter_stats_staging (match_status);
CREATE INDEX IF NOT EXISTS idx_fss_matched_fighter ON public.fighter_stats_staging (matched_fighter_id);
CREATE INDEX IF NOT EXISTS idx_fss_ufc_stats_id    ON public.fighter_stats_staging (source_ufc_stats_id);
CREATE INDEX IF NOT EXISTS idx_fss_source_name     ON public.fighter_stats_staging (lower(source_name));

-- 중복 import 방지: 동일 batch + ufc_stats_id 조합
CREATE UNIQUE INDEX IF NOT EXISTS uq_fss_batch_ufc_stats_id
    ON public.fighter_stats_staging (import_batch, source_ufc_stats_id)
    WHERE source_ufc_stats_id IS NOT NULL;

-- 내부 staging 테이블: RLS 비활성화 (서비스 롤 전용, 사용자 직접 접근 없음)
ALTER TABLE public.fighter_stats_staging DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fighter_stats_staging IS
    'UFCStats.com 스크래퍼 데이터 staging 영역. approved=true + admin 최종 승인 후 fighters 테이블에 적용.';
COMMENT ON COLUMN public.fighter_stats_staging.match_status IS
    'pending | exact | fuzzy | ambiguous | unmatched';
COMMENT ON COLUMN public.fighter_stats_staging.approved IS
    'admin 검토 후 fighters 적용 허가 여부. TRUE여도 별도 apply 단계 필요.';

COMMIT;
