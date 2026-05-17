# localStorage Fight Legacy 경로 조사 및 정리 계획

최초 작성: 2026-05-17 / 마지막 업데이트: 2026-05-17 (L3 준비 — settleBet 제거 가능성 재확인)  
기준 커밋: 607bec5

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

## 12. 이력

| 날짜 | 커밋 | 내용 |
|------|------|------|
| 2026-05-17 | 3bc05f9 | 초기 read-only 조사 완료, 문서 작성 |
| 2026-05-17 | 586bf66 | **L1**: `simulateFight()` 제거 — index.html, dist/index.html (dead code, 정의·호출 0건) |
| 2026-05-17 | 607bec5 | **L2**: `confirmAdminResult()` localStorage 분기에 `isLegacyLocalFight` guard 추가 |
| 2026-05-17 | f3a7a42 | **L3 준비**: admin 결과 입력 경로, DB 실패 fallback, legacy 픽 정산 문제 read-only 재확인 |
| 2026-05-17 | (L3-pre) | **L3-pre SELECT**: legacy pending pick 10건 확인 (f1~f7) → L3 실행 보류, repair 필요 |
