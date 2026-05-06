# Faction Ranking RPC Plan

작성일: 2026-05-05
Phase: 5A

---

## 배경 및 목적

Pick-tagon의 집단(faction) 랭킹 화면은 `factions.total_score`를 읽어 표시하고 있었으나,
이 필드는 실제로 업데이트되는 경로가 없는 dead field다.
Phase 5A에서 `picks` 기반 실시간 집계 RPC를 만들어 집단 랭킹의 공식 source of truth로 삼는다.

---

## factions.total_score Dead Field 진단

| 코드 경로 | 호출 여부 |
|-----------|-----------|
| `increment_faction_score` RPC | `add_faction_system.sql`에 정의됨 |
| `place_pick` RPC | faction 관련 코드 없음 ❌ |
| `service_settle_matchup` v3 | faction 관련 코드 없음 ❌ |
| 배틀 시스템 (`battles` 테이블) | faction score 연결 없음 ❌ |
| 프론트 JS 전체 | `increment_faction_score` 호출 없음 ❌ |

**결론: `factions.total_score`는 수동 초기값 이외로는 갱신되지 않는다.**
이 Phase에서는 동기화하지 않고 RPC 집계로 대체한다.
`service_settle_matchup` → `increment_faction_score` 연결은 별도 Phase로 보류.

---

## Source of Truth 비교

| 안 | 소스 | 신뢰도 | 이유 |
|----|------|--------|------|
| A. `factions.total_score` | factions 테이블 | ❌ Dead | 업데이트 경로 없음 |
| B. `SUM(users.points)` per faction | users JOIN factions | ⚠ 부분적 | 초기 1000pt × 멤버 수 포함, 픽 성과 아닌 지갑 잔고 합산 |
| **C. `SUM(settled_payout WHERE win)`** | **picks JOIN users JOIN factions** | **✅ 권장** | Phase 4 source-of-truth 패턴 일치, 픽 성과만 측정 |
| D. battles 결과 기반 | battles 테이블 | ❌ 미연결 | 배틀 → faction score 연결 없음 |

**결론: 안 C 채택** — `picks.settled_payout` WHERE `status='win'` 기반 집계.

---

## Phase 5A — Faction Ranking RPCs ✅ (2026-05-05)

### 완료 내용
- `get_faction_leaderboard()` 구현 및 DB 적용
- `get_faction_member_rankings(p_faction_id INTEGER)` 구현 및 DB 적용
- migration: `supabase/migrations/20260505_get_faction_ranking_rpcs.sql`
- 프론트 연결 없음 — Phase 5A-3로 분리

---

## RPC 계약

### get_faction_leaderboard()

```sql
FUNCTION public.get_faction_leaderboard()
RETURNS TABLE (
  rank              BIGINT,
  faction_id        INTEGER,
  faction_name      TEXT,
  emoji_icon        TEXT,
  member_count      INTEGER,
  total_win_points  INTEGER,   -- SUM(settled_payout) WHERE status='win'
  win_picks         INTEGER,
  total_picks       INTEGER,   -- pending + win + lose (cancelled 제외)
  accuracy          INTEGER    -- NULL if win+lose = 0
)
LANGUAGE sql STABLE SECURITY DEFINER
GRANT anon, authenticated
```

### get_faction_member_rankings(p_faction_id INTEGER)

```sql
FUNCTION public.get_faction_member_rankings(p_faction_id INTEGER)
RETURNS TABLE (
  rank        BIGINT,
  user_id     UUID,
  nickname    TEXT,
  net_points  INTEGER,   -- SUM(settled_payout) WHERE status='win'
  win_picks   INTEGER,
  lose_picks  INTEGER,
  total_picks INTEGER,   -- pending + win + lose (cancelled 제외)
  accuracy    INTEGER    -- NULL if win+lose = 0
)
LANGUAGE sql STABLE SECURITY DEFINER
GRANT anon, authenticated
```

---

## 집계 기준

### get_faction_leaderboard
- source: `factions LEFT JOIN users ON faction_id LEFT JOIN picks ON user_id`
- `member_count` = `COUNT(DISTINCT users.id)` — 픽 없는 멤버도 포함
- `total_win_points` = `COALESCE(SUM(settled_payout) FILTER (WHERE status='win'), 0)`
- `total_picks` = pending + win + lose (cancelled 제외 — Phase 4C 기준 일치)
- accuracy = `win / (win + lose) * 100` (NULL if no settled picks)
- 정렬: `total_win_points DESC → win_picks DESC → member_count DESC`
- 0멤버 faction: 행 포함, 모두 0, accuracy NULL

### get_faction_member_rankings
- source: `users LEFT JOIN picks ON user_id` WHERE `users.faction_id = p_faction_id`
- 픽 없는 멤버: 행 포함, net_points=0, accuracy NULL
- 존재하지 않는 faction_id: 0행 반환
- 정렬: `net_points DESC → win_picks DESC`

---

## 보안

| 항목 | 내용 |
|------|------|
| SECURITY DEFINER | users SELECT RLS 우회 (nickname 읽기 목적) |
| SET search_path | `public, pg_temp` (고정) |
| REVOKE ALL FROM PUBLIC | 기본 권한 제거 후 명시적 GRANT |
| GRANT | anon, authenticated — 공개 집단 랭킹 |
| 개인 데이터 | aggregate/nickname only, 개별 pick 선택(pick_name, predicted_side) 미노출 |

---

## QA 결과

### get_faction_leaderboard()

| 케이스 | 기대 | 결과 |
|--------|------|------|
| 다게스탄 (1멤버, 28픽) | rank=1, 2090pt, 12W, 26total, 63% | PASS |
| 조지아 (1멤버, 9픽) | rank=2, 190pt, 1W, 9total, 50% | PASS |
| 한국 (1멤버, 0픽) | rank=3, 0pt, 0W, acc=NULL, 행 포함 | PASS |
| 0멤버 5개 집단 | rank=4 동률, 모두 0, acc=NULL | PASS |

참고: `total_picks=26` — 다게스탄 유저 28픽 중 cancelled 2건 제외 → 26 (설계대로).

### get_faction_member_rankings()

| 케이스 | 기대 | 결과 |
|--------|------|------|
| faction_id=1 (다게스탄) | KINGBOTTLE / 2090pt / 12W 7L / 63% | PASS |
| faction_id=7 (조지아) | 보틀준 / 190pt / 1W 1L / 50% | PASS |
| faction_id=5 (한국, 0픽 멤버) | 멤버 1행, 0pt, acc=NULL | PASS |
| faction_id=999 (존재 안 함) | 0행 | PASS |

**전체 PASS. Phase 5A RPC 구현 완료.**

---

## Phase 5A-3 — Frontend 연결 ✅ (2026-05-06)

### 완료 내용
- `get_faction_leaderboard()` v2: `representative_fighters` 추가 (반환 타입 변경 → DROP/CREATE)
  - migration: `supabase/migrations/20260505_get_faction_leaderboard_v2.sql`
- `loadFactions()` in `public/js/api/supabase.js` — RPC 호출로 교체
  - 반환 객체 정규화: `faction_id → id`, `faction_name → name`, `total_win_points → total_score` (레거시 호환)
  - RPC 실패 시 `factions` 기존 캐시 유지, `renderFactionRanking()` 호출
- `renderFactionRanking()` in `index.html` — RPC 필드 우선 사용
  - 점수: `f.total_win_points` (기존 `f.total_score` → 교체)
  - 추가 스탯 라인: `N명 · NW / N총 · N%` (member_count, win_picks, total_picks, accuracy)
  - accuracy 색상: ≥70% ufcRed, ≥50% white, <50% gray, null → gray `—`
  - 정렬: `total_win_points` 기준 재정렬 (RPC pre-sorted + 안전 재정렬)
- `dist/js/api/supabase.js`, `dist/index.html` 반영 완료

### 호환성 보장
| 기존 코드 경로 | 호환 방법 |
|----------------|-----------|
| `_renderFactionCards()` — `f.id`, `f.name`, `f.emoji_icon`, `f.representative_fighters` | RPC 반환값 정규화로 그대로 작동 |
| `setUserFaction()` — `factions.find(f.id === factionId)` | `id: r.faction_id` 매핑으로 그대로 작동 |
| `selectFaction()` — `factions[i].id` | 동일 |
| `currentFaction.id === f.id` 비교 | 동일 |

### 집단 멤버 랭킹 UI
현재 없음 — 후속 Phase에서 팩션 클릭 시 멤버 랭킹 패널 신규 추가 예정

---

## 보류 항목

| 항목 | 상태 | 이유 |
|------|------|------|
| `service_settle_matchup` → `increment_faction_score` 연결 | 보류 | 별도 Phase — settle_matchup 수정은 신중하게 |
| `factions.total_score` 필드 동기화 | 보류 | RPC 전환 후 backfill migration으로 처리 가능 |
| 집단 배틀 → faction score 연결 | 미설계 | 배틀 시스템 전면 재검토 필요 |
