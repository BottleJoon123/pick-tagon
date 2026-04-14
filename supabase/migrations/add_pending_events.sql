-- ================================================================
-- Pick-tagon: pending_events 테이블 (UFC 크롤러 임시 저장소)
-- 어드민 승인 전 임시 보관 → events 테이블로 승인 이동
-- ================================================================

CREATE TABLE IF NOT EXISTS pending_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL UNIQUE,
  event_date  TEXT,
  source_url  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE pending_events ENABLE ROW LEVEL SECURITY;

-- 어드민(service_role)만 전체 접근 허용
CREATE POLICY "pending_events_service_only"
  ON pending_events
  USING (auth.role() = 'service_role');

-- 인덱스: status 필터링용
CREATE INDEX IF NOT EXISTS idx_pending_events_status ON pending_events(status);
CREATE INDEX IF NOT EXISTS idx_pending_events_created ON pending_events(created_at DESC);
