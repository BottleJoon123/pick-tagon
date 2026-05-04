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

## Phase 4C — Community Pick Ratio RPC (예정)

목표: event_picks vs picks 중 어느 것이 커뮤니티 비율의 source of truth인지 정리

현재 이슈:
- `event_picks.fighter_index` (TEXT column, event_id도 TEXT)가 있음
- `picks`에서 직접 집계하는 방식도 가능
- 두 테이블 간 불일치 가능성 있음

확인 필요:
- `saveEventPick` 함수가 어떤 테이블에 쓰는지
- 중복 write가 있는지 (place_pick RPC + saveEventPick 동시 호출 여부)

후보 RPC: `get_event_pick_ratios(p_event_id UUID)`

반환:
- matchup_id별 red_count, blue_count, total

---

## Phase 4D — Ticket/Point Aggregation RPC (예정)

목표: 이벤트별 총 베팅 포인트, 총 페이아웃, 집계 통계

후보 RPC: `get_event_pick_summary(p_event_id UUID)`
