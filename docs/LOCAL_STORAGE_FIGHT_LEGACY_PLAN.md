# localStorage Fight Legacy 경로 조사 및 정리 계획

최초 작성: 2026-05-17 / 마지막 업데이트: 2026-05-17 (LEGACY_CANCELLED 마커 영향 확인)  
기준 커밋: f451486

**현재 잔존 legacy:**
- `settleBet()` (index.html:3277) — 정의 및 `confirmAdminResult()` 내 호출 1건 남아 있음
- `confirmAdminResult()` localStorage 분기 — L2 guard 추가됨, UUID/`_fromDB` 이상 케이스 차단
- `admin-panel-fights` + `fight-card-admin-list` — 접근 불가 hidden 패널, `renderAdminFightCardList()` 존재

**제거 완료:**
- `simulateFight()` — L1 (586bf66)에서 제거, 현재 정의·호출 모두 0건

---

## 1. 개요

Pick-tagon은 DB 기반 matchup이 도입되기 전에 localStorage 기반 싸움(customFights) + 정적 배열(FIGHTS)로 운영됐다. 현재 프로덕션은 DB matchup(_dbMatchups) 우선 경로를 사용한다.

- `simulateFight()`: L1에서 제거 완료 (호출자 없는 dead code였음)
- `settleBet()` + `confirmAdminResult()` localStorage 분기: 잔존, 정상 운영 중 도달 불가이나 코드상 존재

이 문서는 잔존 legacy의 호출경로·데이터 영향·제거 후보를 정리한다.

---

## 2. getActiveFights() 우선순위 체인

```javascript
// public/js/admin.js:79
function getActiveFights() {
    if (typeof _dbMatchups !== 'undefined' && _dbMatchups.length > 0) return _dbMatchups;
    return customFights.length > 0 ? customFights : FIGHTS;
}
```

| 우선순위 | 소스 | 조건 | 출처 |
|---------|------|------|------|
| 1 (최고) | `_dbMatchups` | `_dbMatchups.length > 0` | `fetchUpcomingMatchups()` → DB |
| 2 | `customFights` | `_dbMatchups` 비어 있고 `customFights.length > 0` | `localStorage.picktagon_custom_fights` |
| 3 (최저) | `FIGHTS` | 위 둘 다 비어 있을 때 | `public/js/data/fights.js` 정적 배열 |

- `_dbMatchups` 항목은 `_fromDB: true`, `_resultStatus`, `_resultWinner` 등 DB 필드 포함
- `customFights` 항목: localStorage 어드민이 생성한 싸움, `_fromDB` 없음
- `FIGHTS`: UFC 311-era 11개 하드코딩 항목 (id: 'f1'~'f11'), `_fromDB` 없음

---

## 3. simulateFight() — ✅ 제거됨 (L1, 586bf66)

**현재 상태: 정의·호출 모두 0건**

### L1 이전 코드 (참고용)

```javascript
// index.html:3140 (L1 이전)
function simulateFight(fightId) {
    const pending = state.pendings[fightId];
    if (!pending) return;
    const fight = getActiveFights().find(f => f.id === fightId);
    if (!fight) return;

    const leftWon = Math.random() < fight.leftBias;
    const actualWinner = leftWon ? fight.f1.name : fight.f2.name;
    const methods = ['KO/TKO', 'SUB', 'UD', 'UD'];
    const actualMethod = methods[Math.floor(Math.random() * methods.length)];
    settleBet(fightId, actualWinner, actualMethod, leftWon ? 'left' : 'right');
}
```

호출자 없는 완전 dead code였으므로 L1에서 제거. `fight._fromDB` 체크 없이 `settleBet()` 직행하는 구조였으나 현재는 코드 자체가 없으므로 리스크 해소됨.

---

## 4. settleBet()

### 정의 (index.html:3271)

```javascript
async function settleBet(fightId, actualWinner, actualMethod, winnerSide, round, time) {
    const pending = state.pendings[fightId];
    if (!pending) return;
    // ... 승패 계산, 보너스 계산 ...
    state.points += finalPayout;         // 승리 시 포인트 증가
    state.success += 1;                  // 승리 시 카운터
    state.settled[fightId] = { ... };    // 정산 기록 저장
    delete state.pendings[fightId];      // pending 제거
    // ...
    if (sb && currentUser) {
        await updatePickResult(fightId, userWon ? 'WIN' : 'LOSE', actualWinner, actualMethod, payout);
    }
    refreshUI();
}
```

### 수정하는 state 필드

| 필드 | 동작 |
|------|------|
| `state.pendings[fightId]` | 읽기 후 `delete` |
| `state.points` | 승리 시 `+= finalPayout` |
| `state.success` | 승리 시 `+= 1` |
| `state.settled[fightId]` | 새 정산 레코드 쓰기 (WIN/LOSE, payout, resolvedAt 등) |
| `state.history[...].res` | `findHistoryEntry(fightId)` → `.res = 'WIN'/'LOSE'` |
| `state.history[...].payout` | 승리 시 `.payout = finalPayout` |

- `state` 전체는 `localStorage.picktagon_v3`에 저장됨 (`save()` 호출)

### DB 사이드 이펙트

`updatePickResult(fightId, result, actualWinner, actualMethod, finalPayout)` (index.html:4934):
```javascript
sb.from('picks')
  .update({ status, actual_winner, actual_method, payout })
  .eq('user_id', currentUser.id)
  .eq('fight_id', fightId)
  .eq('status', 'pending');
```
이후 `syncUserToDB()` 호출 → `users` 테이블 포인트/통계 업데이트.

**중요:** `admin_set_matchup_result` RPC를 거치지 않으므로:
- `matchups.result_status` 가 `'scheduled'`로 유지됨 (DB 경기 미정산 상태)
- 다른 유저의 `picks` rows는 그대로 → 불완전 정산

### 호출 경로 (L2 이후 현재)

```
confirmAdminResult()      (index.html:3167)
  │
  ├── isDbMatchup=true  → adminSetMatchupResultWithUI() [DB RPC 경로]
  │
  └── isDbMatchup=false && fight 존재
        ├── isLegacyLocalFight=false (UUID 또는 _fromDB 이상)
        │     └── showToast 차단  [L2 guard]
        └── isLegacyLocalFight=true (non-UUID && !_fromDB)
              └── settleBet()  [localStorage 경로]  ← index.html:3231
```

### isDbMatchup 판정 로직

```javascript
// index.html:3211-3212
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDbMatchup = (fight && fight._fromDB) || (!fight && uuidRe.test(fightId));
```

| fightId 형태 | fight._fromDB | isDbMatchup 결과 |
|-------------|--------------|-----------------|
| UUID + `_fromDB: true` | true | **true → RPC 경로** |
| UUID + fight 미발견 | — | true (UUID 패턴) → **RPC 경로** |
| 'f1'~'f11' (FIGHTS 정적) | undefined | **false → settleBet 경로** |
| 커스텀 non-UUID | undefined | **false → settleBet 경로** |

---

## 5. renderAdminFightCardList() 버튼 조건

```javascript
// public/js/admin.js:863
const dbDone = fight._fromDB && fight._resultStatus === 'completed';
```

| 조건 | 표시 버튼 |
|------|----------|
| `!settled && !dbDone` | 🏆 **결과 입력** (`adminSetResult`) |
| `dbDone` | ✏️ **수정** (`editMatchupResult`) |

- localStorage fight (`_fromDB` 없음): 항상 `dbDone = false` → "결과 입력"만 표시, "수정" 버튼 없음
- DB fight (completed): `dbDone = true` → "수정" 버튼만 표시

즉, localStorage fight에 "결과 입력" → `confirmAdminResult()` → `isDbMatchup=false` → `settleBet()` 경로.

---

## 6. FIGHTS 정적 배열

- 파일: `public/js/data/fights.js:1`
- 11개 항목 (id: 'f1'~'f11'), UFC 311-era 하드코딩 데이터
- 프로덕션에서 `_dbMatchups`가 채워지면 완전히 무시됨
- `leftBias` 필드는 `simulateFight()`가 사용했으나 해당 함수가 L1에서 제거됨 → FIGHTS의 `leftBias`는 현재 미사용

---

## 7. 프로덕션 도달 가능성 분석

**정상 프로덕션 상태** (`fetchUpcomingMatchups()` 완료 후):

```
_dbMatchups.length > 0
  → getActiveFights() returns _dbMatchups
  → 모든 fight._fromDB = true
  → confirmAdminResult(): isDbMatchup = true
  → settleBet() 도달 불가
```

**settleBet() 도달 조건 (모두 충족 필요):**
1. `_dbMatchups`가 비어 있음 (DB 오프라인 또는 matchup 0건)
2. `customFights` 또는 `FIGHTS`에 해당 fightId 존재
3. admin이 해당 fight에 결과 입력

---

## 8. 후보 평가

### ~~A. 현행 유지~~ (simulateFight 잔존 문제 → L1에서 해소)

### ~~B. confirmAdminResult() localStorage 분기에 _fromDB 가드 추가~~ → ✅ **L2 완료**
- `isLegacyLocalFight` guard 삽입: `!fight._fromDB && !uuidRe.test(String(fightId))`
- UUID / `_fromDB` 이상 케이스 → toast 차단, return
- 정상 localStorage fight(non-UUID, !_fromDB)만 통과

### ~~C. simulateFight()만 제거~~ → ✅ **L1 (586bf66)에서 완료**

### D. settleBet() 전체 제거 + confirmAdminResult() localStorage 분기 삭제 (Phase L3 후보)
- `settleBet()` 삭제
- `confirmAdminResult()`에서 `else if (fight)` 분기 전체 삭제
- ✅ 코드베이스 정리 효과 큼
- ⚠️ `customFights` admin 워크플로우가 완전히 DB로 이전된 것을 먼저 확인 필요
- ⚠️ FIGHTS 정적 배열도 함께 제거 대상

---

## 9. 권장 순서

| 단계 | 작업 | 위험도 | 상태 |
|------|------|--------|------|
| ~~1~~ | ~~`simulateFight()` 제거~~ | 낮음 | ✅ **L1 완료 (586bf66)** |
| ~~2 (L2)~~ | ~~`confirmAdminResult()` localStorage 분기에 `_fromDB` 가드 추가~~ | 매우 낮음 | ✅ **L2 완료** |
| 3 (L3) | `settleBet()` 제거 + `else if (fight)` 분기 전체 삭제 | 중간 | DB matchup 100% 전환 확인 후 |
| 4 | `FIGHTS` 정적 배열 제거 | 중간 | L3 완료 후 |

---

## 10. 관련 파일 위치

| 함수/변수 | 파일 | 라인 | 비고 |
|----------|------|------|------|
| `getActiveFights()` | public/js/admin.js | 79 | |
| `customFights` 로드 | public/js/admin.js | 64-71 | |
| `_dbMatchups` 채우기 | public/js/api/supabase.js | 343-388 | |
| ~~`simulateFight()`~~ | ~~index.html~~ | ~~3140~~ | **제거됨 (L1, 586bf66)** |
| `confirmAdminResult()` | index.html | 3167 | L2 guard 추가됨 |
| `settleBet()` | index.html | 3277 | |
| `updatePickResult()` | index.html | 4934 | |
| `renderAdminFightCardList()` | public/js/admin.js | 850 | |
| `FIGHTS` 정적 배열 | public/js/data/fights.js | 1 | |
| `findHistoryEntry()` | public/js/storage.js | 7 | |

---

## 11. Phase L3 준비 — settleBet 제거 가능성 재확인 (read-only)

### 조사 기준 커밋: 607bec5

### 11-1. 프로덕션 admin 결과 입력 실제 경로

```
admin → 대진표 관리 탭 (switchAdminTab('ufc'))
  → fetchEventsForBuilder()
    → _builderMatchups (DB 직접 fetch)
      → 🏆 버튼 클릭 → openResultModal(matchupId)  [admin.js:1303]
        ├── getActiveFights().find(f => f.id === matchupId) 있으면
        │     → adminSetResult(matchupId) → confirmAdminResult()
        │         → isDbMatchup=true → adminSetMatchupResultWithUI() [DB RPC]
        └── 없으면 _builderMatchups에서 직접 모달 채움 → confirmAdminResult()
              → isDbMatchup=true (UUID fightId) → adminSetMatchupResultWithUI() [DB RPC]
```

**결론**: 현재 admin UI에서 결과 입력은 100% DB RPC 경로. `settleBet()` 도달 경로 없음.

### 11-2. fight-card-admin-list 패널 접근 가능성

- `admin-panel-fights` (HTML:1622) — `fight-card-admin-list` 포함
- `switchAdminTab()` 목록: `['dashboard', 'fighters', 'archive', 'news', 'season', 'event', 'ufc', 'settings']`
- **'fights'는 목록에 없음** → 탭 버튼 없음 → UI에서 접근 불가
- `renderAdminFightCardList()`는 `_runPostSettleRefresh()` 후 호출되지만 패널이 hidden이므로 무효

### 11-3. DB 실패 시 fallback 경로

`fetchUpcomingMatchups()` 실패 시나리오:
| 실패 원인 | 결과 |
|----------|------|
| `sb` undefined | `_dbMatchups = []` 유지, return |
| `allEvRes.error` | `_dbMatchups = []` 유지, renderFightCards + return |
| `event` 없음 (upcoming 없음) | `_dbMatchups = []` 유지, renderFightCards + return |
| `mRes.error / !mRes.data` | `_dbMatchups = []` 유지, renderFightCards + return |
| catch(e) | console.warn만, `_dbMatchups = []` 유지 |

→ 실패 시 `getActiveFights()` = `customFights` → `FIGHTS` 순으로 fallback  
→ 그러나 admin-panel-fights는 UI 접근 불가 → admin이 결과 입력 버튼에 도달하는 경로 없음

### 11-4. 일반 유저 pick 등록의 legacy fightId 처리

`castVote()` → `savePick()` (index.html:4903):
```javascript
const matchupId = (fight && fight._fromDB) ? fightId : null;
```
- `_dbMatchups` 활성 시: `matchupId = UUID fightId` → `picks.matchup_id = UUID`
- `FIGHTS`/`customFights` 활성 시: `matchupId = null` → `picks.matchup_id = null`, `fight_id = 'f1'`

**레거시 픽 정산 문제**:
- `admin_set_matchup_result` RPC는 `matchup_id` 기준 정산 → `matchup_id = null`인 픽 정산 불가
- `settleBet()`은 `fight_id = 'f1'` 픽을 직접 `picks.update()` → 유일한 정산 경로
- 그러나 `_dbMatchups` 활성 상태에서 legacy fightId로 신규 pick 등록 불가 (fight 카드 미표시)

### 11-5. state.history / state.pendings / state.settled — legacy fightId 영향

| 필드 | legacy fightId ('f1'~'f11') 있을 때 영향 |
|------|----------------------------------------|
| `state.history` | profile.js 렌더링 — 항목 표시되지만 기존 fight 이름 텍스트만 (crash 없음) |
| `state.pendings` | `loadUserPicksFromDB()` 재구성 시 UUID fightIds만 처리 → legacy는 남아 있음 (invisible) |
| `state.settled` | profile.js `divMap[fightId]` miss → `division = '기타'` 표시 (cosmetic degradation) |

### 11-6. L3 실행 전 필수 선행 확인 (DB 쿼리)

**settleBet() 제거 전 반드시 확인:**

```sql
-- DB에 legacy fightId (non-UUID) + status='pending'인 픽이 있는지 확인
SELECT fight_id, COUNT(*) AS cnt
FROM picks
WHERE fight_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND status = 'pending'
GROUP BY fight_id;
```

- 결과 0건 → L3 실행 안전
- 결과 있음 → 먼저 해당 픽 `status = 'cancelled'` 처리 후 L3 실행

### 11-7. L3 제거 후보 재평가

#### A. settleBet() 유지 + 경고 문서화
- ✅ 회귀 0
- ⚠️ 완전 dead code 잔존 (L2 guard 후 도달 경로 없음)

#### B. admin-panel-fights 숨김 처리 + renderAdminFightCardList() 제거
- 이미 탭 접근 불가 → 별도 작업 가치 낮음
- `renderAdminFightCardList()`는 hidden 패널에 렌더링 → 무해하지만 낭비

#### C. confirmAdminResult() localStorage 분기 삭제 + settleBet() 유지 ← **단기 안전 선택**
- `else if (fight)` 전체 삭제 (isLegacyLocalFight guard 포함)
- `settleBet()` 정의는 남겨 둠 → 완전 dead code (호출자 0)
- DB 선행 쿼리 불필요
- 위험도: 낮음

#### D. settleBet() 함수 삭제 + confirmAdminResult() localStorage 분기 삭제 ← **권장 최종 목표**
- `settleBet()` 삭제
- `confirmAdminResult()` else if 분기 전체 삭제
- `FIGHTS` leftBias 미사용 → `FIGHTS` 제거도 가능 (별도 판단)
- **선행 조건**: 11-6 DB 쿼리 실행 → legacy pending 픽 0건 확인 필수
- 위험도: 중간 (선행 조건 충족 시 낮음)

### 11-8. L3-pre SELECT 결과 (2026-05-17)

```sql
-- 실행 결과
SELECT fight_id, COUNT(*) AS cnt
FROM picks
WHERE fight_id !~ '^[0-9a-f]{8}-...' AND status = 'pending'
GROUP BY fight_id;
```

| fight_id | cnt |
|----------|-----|
| f1 | 2 |
| f2 | 1 |
| f3 | 1 |
| f4 | 2 |
| f5 | 2 |
| f6 | 1 |
| f7 | 1 |
| **합계** | **10** |

**판정: legacy_pending_total = 10 → L3 실행 보류**

`settleBet()` 제거 전에 이 10건을 처리해야 한다.  
처리 방안은 별도 설계 필요 (cancel/NC 처리, 수동 보정 등).

### 11-9. 권장 L3 실행 순서 (개정)

| 단계 | 작업 | 선행 조건 |
|------|------|-----------|
| L3-pre ✅ | DB 쿼리: legacy pending 픽 확인 | — |
| **L3-repair** | legacy pending 10건 처리 (cancel or NC 보정) | 정책 결정 필요 |
| L3-a | `confirmAdminResult()` else if 분기 삭제 | L3-repair 완료 |
| L3-b | `settleBet()` 함수 삭제 | L3-a |
| L3-c | `FIGHTS` 정적 배열 제거 판단 | L3-b 완료 + 이벤트 종료 후 |

---

## 12. Phase L3-repair Dry-run (2026-05-17, NOT RUN)

### 12-1. 대상 row 목록 (10건)

| id | user_id (앞8) | fight_id | pick_name | bet_cost | payout | matchup_id |
|----|--------------|----------|-----------|----------|--------|------------|
| 6 | 974fe018 | f1 | 더스틴 포이리에 | 100 | 280 | NULL |
| 42 | 275cb9d4 | f1 | 지리 프로차스카 | 100 | 175 | NULL |
| 43 | 275cb9d4 | f2 | 아자마트 무르자카노프 | 100 | 155 | NULL |
| 44 | 275cb9d4 | f3 | 커티스 블레이즈 | 100 | 135 | NULL |
| 4 | ed396e42 | f4 | 질베르 번스 | 100 | 190 | NULL |
| 21 | 275cb9d4 | f4 | 닐 마그니 | 100 | 195 | NULL |
| 20 | 275cb9d4 | f5 | 알리아킴 카말로프 | 100 | 155 | NULL |
| 51 | ed396e42 | f5 | 컵 스완슨 | 100 | 175 | NULL |
| 52 | ed396e42 | f6 | 에런 피코 | 100 | 165 | NULL |
| 47 | ed396e42 | f7 | 케빈 홀랜드 | 100 | 170 | NULL |

### 12-2. 안전성 확인

| 항목 | 결과 |
|------|------|
| matchup_id = NULL | 10/10 ✅ |
| matchup_id ≠ NULL | 0 ✅ |
| bet_cost > 0 | 10/10 ✅ |
| bet_cost = 0 또는 NULL | 0 ✅ |
| status = 'pending' 외 다른 값 | 없음 ✅ |

→ **모든 안전성 조건 충족. repair 실행 시 이상 케이스 없음.**

### 12-3. 유저별 환급 합계 및 repair 전후 points

| user_id (앞8) | 현재 points | pick_count | 환급 | repair 후 points |
|--------------|------------|------------|------|----------------|
| 275cb9d4 | 635 | 5 | +500 | 1135 |
| ed396e42 | 3379 | 4 | +400 | 3779 |
| 974fe018 | 1000 | 1 | +100 | 1100 |

**총 환급: 1000P / 3 users / 10 picks**

※ ed396e42는 `success_picks(18) > total_picks(16)` 기존 데이터 이상값 존재 — repair와 무관, 별도 이슈.

### 12-4. actual_method 정책 후보

| 후보 | actual_winner | actual_method | 비고 |
|------|--------------|---------------|------|
| **A (추천)** | NULL | `'LEGACY_CANCELLED'` | legacy 구분 마커, 일반 취소와 명확 구분 |
| B | NULL | `'CANCELLED'` | 일반 취소와 동일 표기 |

**추천: A** — 추후 레거시 픽만 필터할 때 `actual_method = 'LEGACY_CANCELLED'`로 식별 가능.

### 12-5. Repair SQL 초안 (NOT RUN — 승인 후 execute_sql로 실행)

```sql
-- ⚠ 실제 실행 전 반드시 승인 받을 것
-- 멱등성: WHERE status = 'pending' 조건으로 재실행 시 0건 처리
BEGIN;

WITH legacy_picks AS (
    SELECT id, user_id, bet_cost
    FROM picks
    WHERE fight_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND status = 'pending'
),
refund AS (
    UPDATE users u
    SET points = u.points + lp.refund
    FROM (
        SELECT user_id, SUM(bet_cost) AS refund
        FROM legacy_picks
        GROUP BY user_id
    ) lp
    WHERE u.id = lp.user_id
    RETURNING u.id AS user_id, u.points AS points_after
),
cancelled AS (
    UPDATE picks
    SET status      = 'cancelled',
        actual_winner = NULL,
        actual_method = 'LEGACY_CANCELLED',
        payout      = 0,
        settled_at  = now()
    WHERE id IN (SELECT id FROM legacy_picks)
    RETURNING id, user_id, fight_id, pick_name, bet_cost
)
SELECT
    c.id,
    c.user_id,
    c.fight_id,
    c.pick_name,
    c.bet_cost  AS refunded,
    r.points_after
FROM cancelled c
LEFT JOIN refund r ON c.user_id = r.user_id
ORDER BY c.user_id, c.id;

COMMIT;
```

**실행 결과 예상:**
- `picks` 10행: `status → 'cancelled'`, `actual_method → 'LEGACY_CANCELLED'`, `payout → 0`, `settled_at → now()`
- `users` 3행: 275cb9d4 +500, ed396e42 +400, 974fe018 +100
- RETURNING: 10행 audit 레코드 반환

---

## 13. 이력

| 날짜 | 커밋 | 내용 |
|------|------|------|
| 2026-05-17 | 3bc05f9 | 초기 read-only 조사 완료, 문서 작성 |
| 2026-05-17 | 586bf66 | **L1**: `simulateFight()` 제거 — index.html, dist/index.html (dead code, 정의·호출 0건) |
| 2026-05-17 | 607bec5 | **L2**: `confirmAdminResult()` localStorage 분기에 `isLegacyLocalFight` guard 추가 |
| 2026-05-17 | f3a7a42 | **L3 준비**: admin 결과 입력 경로, DB 실패 fallback, legacy 픽 정산 문제 read-only 재확인 |
| 2026-05-17 | 6674b68 | **L3-pre SELECT**: legacy pending pick 10건 확인 (f1~f7) → L3 실행 보류, repair 필요 |
| 2026-05-17 | f451486 | **L3-repair dry-run**: 10건 / 1000P 환급 / 3 users 확인, repair SQL 초안 작성 |
| 2026-05-17 | (marker-check) | **LEGACY_CANCELLED 마커 영향 확인**: 모든 RPC + profile.js 안전 확인 → 마커 유지 가능 |

---

## 14. LEGACY_CANCELLED 마커 영향 확인 (read-only, 2026-05-17)

### 목적

repair SQL의 `actual_method = 'LEGACY_CANCELLED'` 마커가 기존 RPC/UI에 의도치 않은 값으로 노출되는지 확인한다.

### 14-1. 검토 RPC / UI 목록

| 대상 | 마커 영향 경로 후보 |
|------|-------------------|
| `get_user_pick_stats` | `by_method` 집계에 LEGACY_CANCELLED 노출 여부 |
| `get_event_pick_summary` | `actual_method` 집계에 노출 여부 |
| `get_event_pick_ratios` | legacy 픽 포함 여부 |
| `get_event_leaderboard` | legacy 픽 포인트 산정 포함 여부 |
| `get_faction_leaderboard` | 취소 픽 포함 여부 |
| `get_admin_dashboard_summary` | `pending_picks_total` 변화 |
| `get_admin_event_qa` | cancelled 픽 처리 방식 |
| `profile.js` METHOD_CONFIG | `by_method` UI 렌더링 |

### 14-2. RPC별 분석

#### get_user_pick_stats (by_method)

```sql
-- 내부 서브쿼리 (p3)
AND p3.status IN ('win', 'lose')
```

- `status = 'cancelled'` 행은 이 필터에서 **완전 제외**
- `by_method` 집계에 LEGACY_CANCELLED 절대 등장 불가 ✅

#### get_event_pick_summary

- `actual_method` 참조 없음 — `status` 카운트(pending/win/lose/cancelled)만 집계
- cancelled 픽은 `cancelled_picks` 카운트에만 포함 (actual_method 불노출) ✅

#### get_event_pick_ratios

```sql
WHERE p.status IN ('pending', 'win', 'lose')
```

- `cancelled` 제외 필터 + `matchup_id JOIN` → legacy 픽(matchup_id=NULL) 이중 제외 ✅

#### get_event_leaderboard

```sql
JOIN public.matchups m ON m.id = p.matchup_id
```

- `matchup_id = NULL`인 legacy 픽은 JOIN 실패 → 리더보드에서 완전 제외 ✅

#### get_faction_leaderboard

```sql
WHERE status IN ('pending', 'win', 'lose')   -- total_picks 집계 기준
```

- cancelled 제외 → LEGACY_CANCELLED 마커 영향 없음 ✅

#### get_admin_dashboard_summary

```sql
SELECT COUNT(*) FROM picks WHERE status = 'pending'  -- pending_picks_total
```

- repair 후 10건이 `'pending'` → `'cancelled'`로 전환
- `pending_picks_total` **10 감소** (15→5 예상) — **긍정적 효과** ✅

#### get_admin_event_qa

```sql
JOIN public.matchups m ON m.id = p.matchup_id
-- cancelled_picks: status = 'cancelled' 카운트만
```

- legacy 픽은 matchup JOIN 실패로 매치업별 집계에 미포함
- `cancelled_picks` 카운트 증가(+10)는 있으나 `actual_method` 노출 없음 ✅

### 14-3. profile.js METHOD_CONFIG

```javascript
// public/js/profile.js:19
const METHOD_CONFIG = { 'KO/TKO': ..., 'SUB': ..., 'UD': ..., ... };
const METHOD_DEFAULT_CONFIG = { ... };  // 미정의 method 폴백
```

- `renderMethodStats()`는 `_rpcStats.by_method`를 순회 → by_method는 `status IN ('win','lose')`만 포함
- cancelled 행은 by_method에 절대 포함 안 됨 → LEGACY_CANCELLED가 METHOD_CONFIG 키로 참조될 일 없음 ✅
- METHOD_DEFAULT_CONFIG 폴백도 발동 안 됨

### 14-4. 결론

**판정: LEGACY_CANCELLED 마커 유지 가능 (안전)**

| 항목 | 결과 |
|------|------|
| profile by_method UI 노출 | ✅ 없음 (`status IN (win,lose)` 필터) |
| 이벤트 픽 비율 포함 | ✅ 없음 (`cancelled` + `matchup_id=NULL` 이중 제외) |
| 리더보드 포인트 포함 | ✅ 없음 (`matchup_id JOIN`) |
| admin QA 패널 actual_method 노출 | ✅ 없음 (cancelled 카운트만) |
| pending_picks_total | ✅ 10 감소 (긍정적) |

repair SQL 실행 후 `LEGACY_CANCELLED` 값은 `picks.actual_method` 컬럼에만 저장되며,  
어떤 RPC도 이 값을 집계·UI에 노출하지 않는다. NULL 대신 마커 사용 추천 이유 유지.

**다음 단계**: repair SQL 실행 승인 → execute_sql 적용 → L3-a/b (settleBet 제거)
