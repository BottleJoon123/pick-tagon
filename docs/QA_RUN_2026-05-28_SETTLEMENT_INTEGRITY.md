# QA Run: Settlement / Profile / Ranking Integrity Audit
> 실행일: 2026-05-28  
> 방법: Supabase MCP read-only SQL + 코드 정적 분석  
> 대상: FN276 정산 → picks → user points → profile/ranking → archive/fighter 전적 반영 경로  
> 제약: DB write 금지, settle 재실행 금지, user points 수동 수정 금지

---

## Verdict: PARTIAL PASS — P1 버그 2개 발견

FN276 정산 및 포인트 업데이트는 **DB 기준 정상 완료**. 그러나:
- **P1-A**: `state.history` 항목이 서버 정산 후 PENDING에서 WIN/LOSE로 업데이트되지 않음 → 프로필 최근 폼 미반영
- **P1-B**: `service_settle_matchup`이 `fighters` 테이블 전적(W/L/D)을 업데이트하지 않음 → 파이터 DB 전적 자동갱신 없음

---

## 1. FN276 정산 결과

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| 이벤트 상태 | `events.status = 'archived'` | ✅ archived (정산 완료) |
| FN276 픽 수 | 4개 (KINGBOTTLE 기준) | ✅ |
| WIN 픽 | 2개 — Arnold Allen (UD, +247), DooHo Choi (KO/TKO, +247) | ✅ settled_payout 정상 |
| LOSE 픽 | 2개 — MalcolmWellmaker, Christian Edwards | ✅ settled_payout = 0 |
| 정산 시각 | 2026-05-28 (all 4) | ✅ |
| pending 픽 | 0개 | ✅ |

→ **FN276 정산은 정상 완료됨.** "포인트 정산 안 됨" 보고는 UI 캐시 지연일 가능성 높음 (아래 §3 참조).

---

## 2. 포인트 수학 검증 (KINGBOTTLE)

### 현재 DB 상태
| 지표 | 값 |
|---|---|
| `users.points` | 4,347 |
| `users.total_picks` | 40 |
| `users.success_picks` | 21 |

### picks 테이블 집계
| 항목 | 값 |
|---|---|
| wins | 21 |
| losses | 13 |
| cancels | 6 |
| pending | 0 |
| 전체 bet_cost 합계 | 4,000 (40 × 100) |
| WIN settled_payout 합계 | 4,085 |
| CANCEL refund 합계 | 600 (6 × 100) |
| **누적 포인트 순변화** | **+685** |

```
순변화 = win_payout(4085) + cancel_refund(600) - total_bet_cost(4000) = +685
```

→ `4347 - 685 = 3662` : 첫 픽 이전 잔액  
→ FN276 순기여: `+494(win) - 400(4픽 bet_cost) = +94`

> **포인트 정산은 DB 기준 정상.** FN276 2승 +494, 4픽 베팅 -400, 순 +94 반영됨.  
> 유저가 "오르지 않음"을 보고한 원인: `loadUserFromDB` 비동기 업데이트 전에 localStorage 캐시(이전 값)를 먼저 표시하는 렌더 순서. **페이지 새로고침 후 정상값 표시.**

---

## 3. 프로필 최근 폼이 빈 이유 — P1-A ⚠️

### 데이터 흐름 분석

```
픽 등록 시 (index.html:2635):
  state.history.unshift({ fightId, match, pick, res: 'PENDING' })
  → localStorage 저장

서버 정산 후 (loadUserPicksFromDB):
  state.pendings, state.settled → DB에서 재동기화
  state.history → ❌ 업데이트 없음
```

`loadUserPicksFromDB()` (supabase.js:522~578)는 `state.pendings`/`state.settled`만 갱신하고 `state.history` 항목의 `res` 필드를 PENDING → WIN/LOSE로 변환하지 않는다.

### 영향 범위
| 항목 | 사용 소스 | 증상 |
|---|---|---|
| 프로필 "히스토리" 목록 (`#history-card-list`) | `state.history` | 전체 항목 `res: 'PENDING'` → "?" 아이콘, 펄싱 배지 |
| 프로필 Form Chart (`renderFormChart`) | `state.history.filter(h => h.res !== 'PENDING')` | 정산된 픽 없음 → **차트 비어있음** |
| 연승 스트릭 (`calcStreak`) | `state.history.filter(h => h.res !== 'PENDING')` | 항상 `{ type: 'none', count: 0 }` |
| 롤링 랭킹 점수 (`getRollingScore`) | `state.history` 최근 10경기 | 반영 안 됨 |
| 통계 (division/method/accuracy) | `get_user_pick_stats` RPC | ✅ DB 직접 → **정상** |
| 리더보드 | `get_leaderboard` RPC | ✅ `users.points` 직접 → **정상** |

### 최소 수정안 (P1-A Fix)

`loadUserPicksFromDB()` 내 `Object.assign(state.pendings, ...)` 직후에 history 항목 reconcile 추가:

```javascript
// state.history PENDING 항목을 DB 결과 기준으로 WIN/LOSE/CANCEL로 갱신
res.data.forEach(function(pick) {
    if (pick.status === 'pending') return;
    var entry = state.history.find(function(h) {
        return h.fightId === pick.fight_id && h.res === 'PENDING';
    });
    if (!entry) return;
    if (pick.status === 'win') {
        entry.res = 'WIN';
        entry.payout = pick.payout || 0;
    } else if (pick.status === 'lose') {
        entry.res = 'LOSE';
    } else if (pick.status === 'cancelled') {
        entry.res = 'CANCEL';
    }
});
```

> **적용 위치**: `public/js/api/supabase.js`, `loadUserPicksFromDB()` 함수, `save()` 호출 직전.

---

## 4. Fighter DB 전적 자동 업데이트 여부 — P1-B ⚠️

### `service_settle_matchup` RPC 분석

RPC 완료 시 업데이트되는 테이블:
| 테이블 | 업데이트 내용 |
|---|---|
| `matchups` | `result_status`, `result_winner`, `result_method`, `result_round`, `result_time` |
| `picks` | `status`, `settled_payout`, `actual_winner`, `actual_method` |
| `users` | `points` (+= settled_payout on WIN), `success_picks` (+= 1 on WIN) |
| `archive_events` | 이벤트 스냅샷 INSERT/UPSERT |
| `archive_fights` | 경기 결과 스냅샷 전체 재삽입 |
| `fighters` | ❌ **업데이트 없음** |

→ **`fighters.wins` / `fighters.losses` / `fighters.draws` 는 settlement 후 자동 갱신되지 않는다.**

### fighters 테이블 구조 확인
- `wins`, `losses`, `draws` 컬럼 존재 (integer)
- 수동 업데이트 또는 별도 Admin UFC 랭킹 자동갱신 버튼 경로만 존재

### 판단
정산 흐름에서 파이터 전적 자동갱신 로직이 설계 단계부터 없음. **의도된 수동 관리**일 수 있으나, 장기적으로 불일치가 누적된다.

**최소 수정안 (P1-B Fix)**: `service_settle_matchup` 의 archive insert 블록 직후, matchup 결과가 'completed'인 경우 red/blue fighter 전적 자동 갱신 로직 추가 필요. 단, DB 스키마 변경 없이 기존 컬럼 사용 가능.

> 단, **이 수정은 DB 스키마 변경 없이 migration으로 RPC를 UPDATE OR REPLACE하는 방식이므로, 별도 승인 후 진행.**

---

## 5. Leaderboard / Ranking 검증

`get_leaderboard` RPC:
```sql
SELECT nickname, points, total_picks, success_picks,
  ROW_NUMBER() OVER (ORDER BY points DESC) AS rank
FROM public.users
ORDER BY points DESC
LIMIT p_limit;
```
→ `users.points` 직접 읽기. 정산 후 즉시 반영. ✅

---

## 6. Archive 반영 검증

`service_settle_matchup` 완료 시 모든 matchup 정산이 끝나면:
1. `archive_events` UPSERT (name 기준 unique)
2. `archive_fights` DELETE + INSERT (event_id 기준 전체 재삽입)

FN276의 경우 이미 archived 상태이므로 `events.status`는 settled/archived 유지됨 (status 역행 방지 분기 존재).

---

## 7. 전체 버그 분류

| 구분 | 항목 | 영향 | 수정 방법 |
|---|---|---|---|
| **P1-A** | `state.history` 정산 미반영 — 프로필 최근 폼 비어있음 | 모든 유저의 프로필 Form Chart / 히스토리 목록 | `loadUserPicksFromDB()` 내 history reconcile 추가 (§3) |
| **P1-B** | `fighters` 전적 자동갱신 없음 | 파이터 W/L/D 통계 수동 관리 필요 | RPC 수정 (별도 승인 필요) |
| **정보** | 포인트 UI 캐시 지연 | 정산 직후 localStorage 구값 표시 | 기존 설계 (loadUserFromDB 비동기 후 갱신), 수정 불필요 |
| **정보** | state.history localStorage 의존 | 다른 기기/브라우저 초기화 시 히스토리 소실 | P1-A fix가 페이지 로드마다 DB와 reconcile → 장기적 해소 |

---

## 8. 관련 파일

| 파일 | 내용 |
|---|---|
| `public/js/api/supabase.js` | `loadUserPicksFromDB()` — P1-A 수정 위치 |
| `supabase/migrations/20260517_fix_settle_matchup_event_status_regression.sql` | `service_settle_matchup` RPC 전체 정의 |
| `public/js/profile.js` | `renderFormChart()`, `calcStreak()` — state.history 의존 확인 |
| `index.html:2635` | `state.history.unshift({..., res: 'PENDING'})` — 히스토리 최초 기록 위치 |
