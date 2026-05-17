# localStorage Fight Legacy 경로 조사

최초 작성: 2026-05-17  
조사 기준 커밋: a8bf1e7 (origin/main)  
조사 범위: read-only (코드/DB/migration 변경 없음)

---

## 1. 개요

Pick-tagon은 DB 기반 matchup이 도입되기 전에 localStorage 기반 싸움(customFights) + 정적 배열(FIGHTS)로 운영됐다. 현재 프로덕션은 DB matchup(_dbMatchups) 우선 경로를 사용하지만, `settleBet()` / `simulateFight()` 두 함수가 코드에 잔존한다.

이 문서는 해당 함수의 정의·호출경로·데이터 영향·제거 가능성을 정리한다.

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

## 3. simulateFight()

### 정의

```javascript
// index.html:3140
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

### 호출 경로

| 위치 | 형태 | 존재 여부 |
|------|------|-----------|
| index.html (onclick) | `onclick="simulateFight('...')"` | **없음** |
| public/js/admin.js | 함수 호출 | **없음** |
| index.html 다른 함수 | 간접 호출 | **없음** |

**결론: `simulateFight()`는 정의만 있고 호출 경로가 전혀 없는 완전한 dead code.**

### 잠재 위험

만약 브라우저 콘솔에서 수동 호출 시:
- `_dbMatchups` 활성 상태이면 `getActiveFights()`가 DB fight 반환
- `fight._fromDB` 체크 없이 `settleBet()` 직행 → DB fight을 localStorage 경로로 정산하는 불일치 발생

---

## 4. settleBet()

### 정의

```javascript
// index.html:3284
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

`updatePickResult(fightId, result, actualWinner, actualMethod, finalPayout)` (index.html:4947):
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

### 호출 경로

```
confirmAdminResult()      (index.html:3180)
  │
  ├── isDbMatchup=true  → adminSetMatchupResultWithUI() [DB RPC 경로]
  │
  └── isDbMatchup=false && fight 존재
        └── settleBet()  [localStorage 경로]  ← index.html:3238

simulateFight()           (index.html:3140)  [dead code — 호출 없음]
  └── settleBet()
```

### isDbMatchup 판정 로직

```javascript
// index.html:3224-3225
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
- `leftBias` 필드 존재 (simulateFight가 사용) → 정적 배열이 simulateFight 전용 설계 흔적

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

**simulateFight() 도달 조건:**
- 불가능 (호출자 없음) — 브라우저 콘솔 수동 실행만 가능

---

## 8. 후보 평가

### A. 현행 유지 (아무것도 하지 않음)
- ✅ 회귀 위험 없음
- ⚠️ dead code 누적
- ⚠️ `simulateFight()`를 콘솔에서 실수 호출 시 DB 불일치 가능

### B. admin 차단 가드 추가
- `confirmAdminResult()`의 localStorage 분기에 `fight._fromDB` 경비 추가
- `simulateFight()` 내부에 `if (fight._fromDB) return` 추가
- ✅ 낮은 위험, 실수 방지
- ⚠️ dead code 자체는 남음

### C. simulateFight()만 제거
- `simulateFight()` 정의 삭제 (호출자 없음 → 순수 dead code)
- `settleBet()` 및 localStorage 분기는 유지
- ✅ 안전: 호출자 없으므로 회귀 없음
- ✅ 가장 보수적인 정리

### D. 전체 제거 (simulateFight + settleBet + confirmAdminResult localStorage 분기)
- `simulateFight()` 삭제
- `settleBet()` 삭제
- `confirmAdminResult()`에서 `else if (fight)` 분기 삭제
- ✅ 코드베이스 정리 효과 큼
- ⚠️ `customFights` admin 워크플로우가 완전히 DB로 이전된 것을 먼저 확인 필요
- ⚠️ FIGHTS 정적 배열도 제거 대상이 됨 (단, 이벤트 종료 전 안전한지 확인 필요)

---

## 9. 권장 순서

| 단계 | 작업 | 위험도 | 선행 조건 |
|------|------|--------|-----------|
| 1 | `simulateFight()` 제거 | 낮음 | 없음 (호출자 없음) |
| 2 | `confirmAdminResult()` localStorage 분기에 `_fromDB` 가드 추가 | 매우 낮음 | 없음 |
| 3 | `settleBet()` 제거 + `confirmAdminResult()` else if 분기 삭제 | 중간 | DB matchup 100% 전환 확인 후 |
| 4 | `FIGHTS` 정적 배열 제거 | 중간 | Step 3 완료 후 |

**단기 권장: 1 + 2 (simulateFight 제거 + 가드 추가)**

---

## 10. 관련 파일 위치

| 함수/변수 | 파일 | 라인 |
|----------|------|------|
| `getActiveFights()` | public/js/admin.js | 79 |
| `customFights` 로드 | public/js/admin.js | 64-71 |
| `_dbMatchups` 채우기 | public/js/api/supabase.js | 343-388 |
| `simulateFight()` | index.html | 3140 |
| `confirmAdminResult()` | index.html | 3180 |
| `settleBet()` | index.html | 3284 |
| `updatePickResult()` | index.html | 4947 |
| `renderAdminFightCardList()` | public/js/admin.js | 850 |
| `FIGHTS` 정적 배열 | public/js/data/fights.js | 1 |
| `findHistoryEntry()` | public/js/storage.js | 7 |

---

## 11. 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-17 | 초기 read-only 조사 완료, 문서 작성 (a8bf1e7 기준) |
