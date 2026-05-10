-- ================================================================
-- Phase 5C-1: Server-backed Battle HP Columns
--
-- 목적: battles 테이블에 서버 source-of-truth HP 컬럼 추가
--   - starter_hp / receiver_hp: DB 레벨 HP 상태 보존
--   - Phase 5C-2 이후 vote_battle RPC가 이 컬럼을 갱신
--   - Phase 5C-3 이후 finish_battle RPC가 이 컬럼 기준 winner 결정
--
-- idempotent: ADD COLUMN IF NOT EXISTS + DO $$ EXCEPTION duplicate_object $$
-- ================================================================

BEGIN;

-- ── 1. HP 컬럼 추가 ──────────────────────────────────────────────
ALTER TABLE public.battles
    ADD COLUMN IF NOT EXISTS starter_hp  INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS receiver_hp INTEGER NOT NULL DEFAULT 100;

-- ── 2. CHECK 제약 추가 (idempotent) ──────────────────────────────
DO $$
BEGIN
    ALTER TABLE public.battles
        ADD CONSTRAINT battles_starter_hp_range CHECK (starter_hp BETWEEN 0 AND 100);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.battles
        ADD CONSTRAINT battles_receiver_hp_range CHECK (receiver_hp BETWEEN 0 AND 100);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. 기존 row backfill ──────────────────────────────────────────
-- ADD COLUMN DEFAULT 100은 기존 row에 즉시 DEFAULT 값이 적용되므로
-- NULL row는 발생하지 않음. 안전 확인용 UPDATE 포함.
UPDATE public.battles
SET
    starter_hp  = 100,
    receiver_hp = 100
WHERE starter_hp IS NULL OR receiver_hp IS NULL;

COMMIT;
