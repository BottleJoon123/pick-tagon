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

## Phase 4B — User Profile Stats RPC ✅ (2026-05-04)

### 완료 내용
- `get_user_pick_stats(p_user_id UUID)` 구현 및 DB 적용
- migration: `supabase/migrations/20260504_get_user_pick_stats_rpc.sql`
- `public/js/profile.js` RPC 연결 완료 (`2d21781`)
  - `renderProfileStats()` → async, state 1차 즉시 렌더 후 RPC 데이터로 덮어쓰기
  - `renderProfileReport()`: total/accuracy/net_points/upset_wins → RPC 우선
  - `renderDivisionStats()`: `by_weight_class` 전체 이벤트 체급별 집계 → RPC 우선
  - `renderMethodStats()`: `by_method` actual_method 기반 전체 집계 → RPC 우선
  - `renderFormChart()`, `renderBonusSummary()`: state-only 유지 (RPC 해당 필드 없음)
  - RPC 실패 시 기존 state/localStorage 기반 렌더로 silent fallback
- `by_weight_class.total` = 참여 픽 전체 수 (pending 포함), accuracy 분모는 `win + lose`만

### RPC 계약

```sql
FUNCTION public.get_user_pick_stats(p_user_id UUID)
RETURNS JSONB   -- 단일 객체
LANGUAGE sql STABLE SECURITY DEFINER
GRANT authenticated
```

반환 구조:
```json
{
  "settled_picks": INTEGER,   -- win+lose+cancelled
  "win_count":     INTEGER,
  "lose_count":    INTEGER,
  "cancel_count":  INTEGER,
  "pending_count": INTEGER,
  "accuracy":      INTEGER,   -- NULL if no settled (win+lose) picks
  "net_points":    INTEGER,   -- SUM(settled_payout) WHERE status='win'
  "upset_wins":    INTEGER,
  "upset_picks":   INTEGER,
  "by_weight_class": [
    { "weight_class": TEXT, "win_count": INTEGER, "lose_count": INTEGER,
      "total": INTEGER, "accuracy": INTEGER }
    ...                       -- ORDER BY total DESC
  ],
  "by_method": [
    { "method": TEXT, "win_count": INTEGER, "total": INTEGER }
    ...                       -- actual_method 기준, ORDER BY win_count DESC
  ]
}
```

### 집계 기준
- source: `picks` (전체 기록) + `picks JOIN matchups` (weight_class 획득)
- accuracy = `win / (win + lose) * 100` (cancelled/pending 제외)
- by_weight_class: `matchups.weight_class` 기준 (NULL weight_class 제외)
- by_method: `picks.actual_method` 기준 (예측 방식이 아닌 실제 결과 방식)
  - `status IN ('win','lose')` AND `actual_method IS NOT NULL` 만 집계
- upset stats: `picks.is_upset = true` 필터
- 픽 없는 유저: 전부 0, accuracy null, arrays 빈 배열 (crash 없음)

### 보안
- SECURITY DEFINER: 일관성 유지 (users 조인 없어 RLS 우회 불필요하나 패턴 통일)
- GRANT authenticated only: 개인 데이터 — anon 미부여
- 반환 aggregate only — 개별 pick 선택(pick_name, predicted_side) 미노출

### QA 결과

| 케이스 | 기대 | 결과 |
|--------|------|------|
| 실유저 (28픽, 12승) | accuracy 63%, net_points 2090, by_weight_class/method 정상 | PASS |
| 픽 없는 유저 (nil UUID) | 전부 0, accuracy null, arrays [] | PASS |

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
