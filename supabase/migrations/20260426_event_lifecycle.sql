-- ================================================================
-- Pick-tagon: 이벤트 라이프사이클 완결 마이그레이션
-- 1) events 테이블: venue 컬럼 + completed_at
-- 2) matchups 테이블: 결과 컬럼 (result_status, winner, method, round, time)
-- 3) picks 테이블: matchup_id, predicted_side, base_payout 추가
-- 4) service_settle_matchup SQL RPC 함수 (서버사이드 일괄 정산)
-- ================================================================

-- ── 1. events ─────────────────────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON public.events(status, event_date DESC);

-- ── 2. matchups 결과 컬럼 ──────────────────────────────────────────────
ALTER TABLE public.matchups
  ADD COLUMN IF NOT EXISTS result_status TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS result_winner TEXT,
  ADD COLUMN IF NOT EXISTS result_winner_side TEXT,   -- 'red' | 'blue'
  ADD COLUMN IF NOT EXISTS result_method TEXT,
  ADD COLUMN IF NOT EXISTS result_round INTEGER,
  ADD COLUMN IF NOT EXISTS result_time TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matchups_event_result
  ON public.matchups(event_id, result_status);

-- ── 3. picks 정산용 컬럼 ───────────────────────────────────────────────
ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS matchup_id UUID REFERENCES public.matchups(id),
  ADD COLUMN IF NOT EXISTS predicted_side TEXT,   -- 'red' | 'blue'
  ADD COLUMN IF NOT EXISTS base_payout INTEGER,
  ADD COLUMN IF NOT EXISTS settled_payout INTEGER,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- fight_id (text) → matchup_id 자동 백필 (UUID 형식인 경우만)
UPDATE public.picks p
SET matchup_id = p.fight_id::UUID
WHERE p.matchup_id IS NULL
  AND p.fight_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX IF NOT EXISTS idx_picks_matchup_pending
  ON public.picks(matchup_id, status)
  WHERE status = 'pending';

-- ── 4. service_settle_matchup ──────────────────────────────────────────
-- 어드민 Edge Function이 service_role로 호출.
-- 멱등성 보장: 이미 completed이면 no-op 반환.
-- 트랜잭션 내에서:
--   a) matchups 결과 저장
--   b) 해당 matchup의 모든 pending picks 정산
--   c) users.points / success 증분 (overwrite 아님)
--   d) users.pendings / users.settled JSON 업데이트
--   e) 이벤트의 모든 matchups 완료 시 events.status = 'completed'
--   f) archive_events / archive_fights 자동 snapshot upsert

CREATE OR REPLACE FUNCTION public.service_settle_matchup(
  p_matchup_id  UUID,
  p_winner_name TEXT,
  p_winner_side TEXT,   -- 'red' or 'blue'
  p_method      TEXT,
  p_round       INTEGER,
  p_time        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matchup       RECORD;
  v_event         RECORD;
  v_pick          RECORD;
  v_fight_id_text TEXT;
  v_settled_count INT  := 0;
  v_win_count     INT  := 0;
  v_lose_count    INT  := 0;
  v_event_done    BOOLEAN := FALSE;
  v_payout        INT;
  v_user_won      BOOLEAN;
  v_tag           TEXT;
  v_archive_event_id UUID;
BEGIN
  -- ── 매치업 로드 + 잠금 ────────────────────────────────────────────────
  SELECT * INTO v_matchup
  FROM public.matchups
  WHERE id = p_matchup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'matchup not found: %', p_matchup_id;
  END IF;

  -- 멱등성: 이미 정산된 경우
  IF v_matchup.result_status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'settled_count', 0,
      'win_count', 0,
      'lose_count', 0,
      'event_completed', false
    );
  END IF;

  -- ── 이벤트 로드 ────────────────────────────────────────────────────────
  SELECT * INTO v_event
  FROM public.events
  WHERE id = v_matchup.event_id;

  -- ── matchup 결과 저장 ──────────────────────────────────────────────────
  UPDATE public.matchups
  SET
    result_status      = 'completed',
    result_winner      = p_winner_name,
    result_winner_side = p_winner_side,
    result_method      = p_method,
    result_round       = p_round,
    result_time        = p_time,
    settled_at         = NOW()
  WHERE id = p_matchup_id;

  v_fight_id_text := p_matchup_id::TEXT;

  -- ── 모든 pending picks 정산 ────────────────────────────────────────────
  FOR v_pick IN
    SELECT *
    FROM public.picks
    WHERE (matchup_id = p_matchup_id OR fight_id = v_fight_id_text)
      AND status = 'pending'
    FOR UPDATE
  LOOP
    -- WIN 여부 판정 (predicted_side 또는 pick_name 기반)
    IF v_pick.predicted_side IS NOT NULL THEN
      v_user_won := (v_pick.predicted_side = p_winner_side);
    ELSE
      -- legacy: pick_name이 winner 이름을 포함하는지
      v_user_won := (lower(v_pick.pick_name) = lower(p_winner_name));
    END IF;

    IF v_user_won THEN
      -- 기본 배당
      v_payout := COALESCE(v_pick.base_payout, v_pick.payout, 0);

      -- 방식 보너스 (+30%)
      IF v_pick.method IS NOT NULL
         AND v_pick.method <> 'ANY'
         AND lower(v_pick.method) = lower(p_method) THEN
        v_payout := v_payout + ROUND(v_payout * 0.3);
      END IF;

      -- 업셋 보너스 (+20%)
      IF v_pick.is_upset = true THEN
        v_payout := v_payout + ROUND(v_payout * 0.2);
      END IF;

      -- picks 업데이트
      UPDATE public.picks
      SET
        status         = 'win',
        actual_winner  = p_winner_name,
        actual_method  = p_method,
        payout         = v_payout,
        settled_payout = v_payout,
        settled_at     = NOW()
      WHERE id = v_pick.id;

      -- users.points 증분 (overwrite 아님), success_picks 카운트
      -- total_picks는 픽 제출 시 이미 카운트됨 → 건드리지 않음
      -- pendings/settled는 localStorage 전용 → SQL에서 관리하지 않음
      UPDATE public.users
      SET
        points        = COALESCE(points, 1000)       + v_payout,
        success_picks = COALESCE(success_picks, 0)   + 1
      WHERE id = v_pick.user_id;

      v_win_count := v_win_count + 1;
    ELSE
      -- 패배: points/success_picks 변화 없음 (bet_cost는 픽 제출 시 이미 차감)
      UPDATE public.picks
      SET
        status         = 'lose',
        actual_winner  = p_winner_name,
        actual_method  = p_method,
        payout         = 0,
        settled_payout = 0,
        settled_at     = NOW()
      WHERE id = v_pick.id;

      v_lose_count := v_lose_count + 1;
    END IF;

    v_settled_count := v_settled_count + 1;
  END LOOP;

  -- ── 이벤트 자동 완료 체크 ──────────────────────────────────────────────
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.matchups
    WHERE event_id    = v_matchup.event_id
      AND result_status NOT IN ('completed', 'cancelled', 'no_contest')
  ) INTO v_event_done;

  IF v_event_done THEN
    UPDATE public.events
    SET
      status       = 'completed',
      completed_at = NOW()
    WHERE id = v_matchup.event_id;

    -- ── archive_events snapshot upsert ────────────────────────────────
    INSERT INTO public.archive_events (name, event_date, venue, status, source_url)
    VALUES (
      v_event.title,
      v_event.event_date::TEXT,
      v_event.venue,
      'past',
      NULL
    )
    ON CONFLICT (name) DO UPDATE
      SET event_date = EXCLUDED.event_date,
          venue      = EXCLUDED.venue,
          status     = 'past';

    SELECT id INTO v_archive_event_id
    FROM public.archive_events
    WHERE name = v_event.title;

    -- ── archive_fights snapshot insert (기존 rows 교체) ──────────────
    IF v_archive_event_id IS NOT NULL THEN
      DELETE FROM public.archive_fights
      WHERE event_id = v_archive_event_id;

      INSERT INTO public.archive_fights
        (event_id, tag, f1_name, f2_name, f1_image_url, f2_image_url,
         winner, method, round, fight_time, sort_order)
      SELECT
        v_archive_event_id,
        CASE
          WHEN m.card_segment = 'main' AND m.sort_order = 1 THEN 'MAIN EVENT'
          WHEN m.card_segment = 'main' AND m.sort_order = 2 THEN 'CO-MAIN EVENT'
          WHEN m.card_segment = 'main' THEN 'FEATURED'
          ELSE 'PRELIMS'
        END AS tag,
        m.red_fighter_name,
        m.blue_fighter_name,
        m.red_image_url,
        m.blue_image_url,
        m.result_winner,
        m.result_method,
        m.result_round,
        m.result_time,
        m.sort_order
      FROM public.matchups m
      WHERE m.event_id = v_matchup.event_id
      ORDER BY m.sort_order;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'idempotent',      false,
    'settled_count',   v_settled_count,
    'win_count',       v_win_count,
    'lose_count',      v_lose_count,
    'event_completed', v_event_done,
    'event_id',        v_matchup.event_id
  );
END;
$$;

-- service_role / authenticated(admin)만 호출 가능
REVOKE ALL ON FUNCTION public.service_settle_matchup FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_settle_matchup TO service_role;
