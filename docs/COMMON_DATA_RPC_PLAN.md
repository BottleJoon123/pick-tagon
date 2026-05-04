# Common Data RPC Plan

작성일: 2026-05-04  
목적: 화면마다 따로 계산하던 집계 데이터를 DB 공식 함수(RPC)로 통일.

---

## 배경

기존 Pick-tagon은 이벤트 리더보드, 픽 비율, 유저 프로필 stat 등을 프론트에서
각자 계산하거나 mock 데이터로 채웠다. "공식 기록실" RPC 계층을 만들어
DB가 집계의 source of truth가 되도록 한다.

---

## Phase 4A — Event Leaderboard RPC ✅ (2026-05-04)

### 완료 내용
- `get_event_leaderboard(p_event_id UUID)` 구현 및 DB 적용
- migration: `supabase/migrations/20260504_get_event_leaderboard_rpc.sql`
- `index.html` `renderEventLeaderboard()` → async RPC 호출로 교체

### RPC 계약

```sql
FUNCTION public.get_event_leaderboard(p_event_id UUID)
RETURNS TABLE (
  rank          BIGINT,
  user_id       UUID,
  nickname      TEXT,
  event_points  INTEGER,   -- SUM(settled_payout) WHERE status='win'
  total_picks   INTEGER,
  win_count     INTEGER,
  lose_count    INTEGER,
  cancel_count  INTEGER,
  pending_count INTEGER,
  accuracy      INTEGER    -- NULL if no settled picks
)
LANGUAGE sql STABLE SECURITY DEFINER
GRANT anon, authenticated
```

### 집계 기준
- source: `picks` → `matchups` (matchup_id) → filter by `event_id`
- event_points = `SUM(settled_payout)` WHERE `status = 'win'`
- accuracy = `win / (win + lose) * 100` (settled 기준, pending 미포함)
- pending pick은 `pending_count`로만 노출
- 정렬: event_points DESC → win_count DESC → total_picks DESC

### 보안
- SECURITY DEFINER: users SELECT RLS(본인만) 우회해 nickname 읽기
- 반환 aggregate only — 개별 pick 선택(pick_name, predicted_side) 미노출

### QA 결과

| 케이스 | 기대 | 결과 |
|--------|------|------|
| UFC FN 274 (completed) | rank/points/accuracy 정상 | PASS (1140pt, 75%) |
| UFC FN 275 (upcoming, pending) | accuracy null, pending_count 표시 | PASS |
| 존재하지 않는 event_id | 빈 배열 | PASS |

---

## Phase 4B — User Profile Stats RPC (예정)

목표: 유저의 체급별/방식별/이벤트별 예측 성향 집계

후보 RPC: `get_user_pick_stats(p_user_id UUID)`

반환 후보:
- 전체 적중률
- 체급별 win/lose/accuracy
- 방식별 (KO, SUB, Decision) 예측 vs 실제 적중률
- 최근 N이벤트 폼 (streak)
- 보너스 픽 (method bonus, upset bonus) 현황

---

## Phase 4C — Community Pick Ratio RPC ✅ (2026-05-04)

### source-of-truth 판단

| 항목 | event_picks | picks |
|------|-------------|-------|
| cancelled 포함 여부 | 포함 (NC/무승부 환급픽 오염) | 제외 가능 (status 필터) |
| 레거시 fight_id | 'f1','f2' 등 UUID 매핑 불가 | matchup_id UUID 정확 |
| predicted_side 정밀도 | fighter_index 0/1만 (draw/nc도 1) | 'red'/'blue'/'draw'/'nc' |
| 실시간 쓰기 | place_pick RPC + 레거시 saveEventPick | place_pick RPC만 |

**결론: `picks` 테이블이 source of truth.** `event_picks`는 실시간 구독 트리거 역할만 유지.

### 완료 내용
- `get_event_pick_ratios(p_event_id UUID)` 구현 및 DB 적용
- migration: `supabase/migrations/20260504_get_event_pick_ratios_rpc.sql`
- `index.html` `loadAllEventPickCounts()` → RPC 호출로 교체
  - `loadMyEventPicks()`: 개인 데이터, `event_picks` 직접 읽기 유지
  - `saveEventPick()`: 레거시 + 실시간 구독 트리거용, `event_picks` 쓰기 유지
  - Realtime 구독 `event_picks` → debounce → `loadAllEventPickCounts()` → RPC 경로 유지

### RPC 계약

```sql
FUNCTION public.get_event_pick_ratios(p_event_id UUID)
RETURNS TABLE (
  matchup_id   UUID,
  red_count    INTEGER,
  blue_count   INTEGER,
  total_count  INTEGER,
  red_pct      INTEGER,   -- 0 if total_count = 0
  blue_pct     INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
GRANT anon, authenticated
```

### 집계 기준
- source: `matchups LEFT JOIN picks` (matchup_id 기준)
- 포함 status: `pending`, `win`, `lose`
- 제외 status: `cancelled` (NC/무승부 환급)
- 포함 predicted_side: `'red'`, `'blue'` 만 (draw/nc 제외)
- 0픽 matchup: 0/0/0/0/0 반환 (null 없음, crash 없음)
- 정렬: card_segment (main 우선), sort_order

### QA 결과

| 케이스 | 기대 | 결과 |
|--------|------|------|
| UFC FN 274 matchup(cancelled blue있음) | blue=0(cancelled 제외) | PASS |
| 0픽 matchup | 0/0/0/0/0 | PASS |
| UFC FN 275 upcoming (pending) | pending 포함, 50/50 | PASS |
| 존재하지 않는 event_id | 빈 배열 | PASS (LEFT JOIN → 0행) |

---

## Phase 4D — Ticket/Point Aggregation RPC (예정)

목표: 이벤트별 총 베팅 포인트, 총 페이아웃, 집계 통계

후보 RPC: `get_event_pick_summary(p_event_id UUID)`
