-- ================================================================
-- Pick-tagon: Faction System Migration
-- Supabase SQL Editor에서 한 번만 실행하세요
-- ================================================================

-- 1. factions 테이블 생성
CREATE TABLE IF NOT EXISTS factions (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  emoji_icon            TEXT NOT NULL,
  representative_fighters TEXT NOT NULL,   -- 쉼표 구분 문자열
  total_score           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users 테이블에 faction_id 컬럼 추가 (없을 경우에만)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL;

-- 3. RLS 설정
ALTER TABLE factions ENABLE ROW LEVEL SECURITY;

-- 누구나 집단 목록 조회 가능
CREATE POLICY "factions_select_all"
  ON factions FOR SELECT
  USING (true);

-- 서버(서비스 롤)만 total_score 업데이트 가능 (일반 유저 직접 수정 불가)
CREATE POLICY "factions_update_service_only"
  ON factions FOR UPDATE
  USING (auth.role() = 'service_role');

-- 4. 시드 데이터 INSERT (중복 방지: ON CONFLICT DO NOTHING)
INSERT INTO factions (name, emoji_icon, representative_fighters) VALUES
  ('다게스탄',  '🐻',  '하빕 누르마고메도프, 이슬람 마카체프'),
  ('브라질',    '🇧🇷', '찰스 올리베이라, 알렉스 페레이라'),
  ('미국',      '🇺🇸', '존 존스, 더스틴 포이리에'),
  ('영국',      '🇬🇧', '톰 아스피날, 패디 핌블렛'),
  ('한국',      '🇰🇷', '정찬성, 최두호'),
  ('아프리카',  '🌍',  '드리커스 뒤 플레시스, 카마루 우스만'),
  ('조지아',    '⚔️',  '일리아 토푸리아, 메랍 드발리쉬빌리'),
  ('일본',      '🌸',  '타이라 타츠로, 아사쿠라 카이')
ON CONFLICT (name) DO NOTHING;

-- 5. faction_score 증가 함수 (배틀 승리/픽 적중 시 호출용)
CREATE OR REPLACE FUNCTION increment_faction_score(p_faction_id INTEGER, p_amount INTEGER DEFAULT 1)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE factions SET total_score = total_score + p_amount WHERE id = p_faction_id;
END;
$$;
