# QA Run: Fighter DB / Matchup Builder Data Integrity
> 실행일: 2026-05-28  
> 방법: 코드 정적 분석 + Supabase MCP read-only SQL  
> 대상: admin 수동 등록 파이터 → 이벤트 빌더 매치업 추가 경로  
> 제약: DB write 금지, migration 생성 금지

---

## Verdict: PASS (with 2 bugs fixed)

버그 2개 발견 및 수정 완료. Jose Souza / Rodrigo Vera는 DB에 정상 존재하며, 아래 수정 후 이벤트 빌더 검색에서 정상 노출된다.

---

## 1. DB 파이터 존재 확인

| 파이터 | ID | Division | DB 존재 | stat 컬럼 |
|---|---|---|---|---|
| Jose Souza | `f_1779963554447` | ww | ✅ | 모두 null/0 |
| Rodrigo Vera | `f_1779963996479` | fw | ✅ | 모두 null/0 |

→ 두 파이터 모두 DB에 정상 저장됨. 매치업 미등록 상태.

---

## 2. 버그 A — `_allFightersCache` 스테일 캐시 ⚠️ (수정됨)

### 원인

`runMemSearch()` (admin.js:1528):
```javascript
if (!_allFightersCache.length) {
    const { data } = await sb.from('fighters').select(...).limit(5000);
    _allFightersCache = data || [];
}
```

`_allFightersCache`는 **빈 배열일 때만 DB에서 재로드**된다. 세션 중 검색을 한 번 수행하면 캐시가 채워지고, 이후 `saveFighter()`로 새 파이터를 등록해도 캐시가 갱신되지 않는다.

### 재현 경로
1. 이벤트 빌더 → 매치업 추가 → 파이터 검색 (캐시 로드됨)
2. 파이터 탭 → Jose Souza 등록 → `saveFighter()` 호출
3. 이벤트 빌더로 돌아와 "Souza" 검색
4. `_allFightersCache.length > 0` → DB 재조회 없음 → **검색 결과 없음**

### 수정 (admin.js, `saveFighter()` RPC 콜백)

```javascript
// 수정 전
} else {
    renderAdminFighterList();
}

// 수정 후
} else {
    _allFightersCache = [];   // ← 추가
    renderAdminFighterList();
}
```

→ DB 저장 성공 시 `_allFightersCache`를 비워 다음 검색에서 최신 데이터 조회.

---

## 3. 버그 B — `populateFighterSelects()` record undefined ⚠️ (수정됨)

### 원인

`renderAdminFighterList()`가 `sb.from('fighters').select('*')`로 `fighterDB`를 갱신하면, DB에는 `record` 컬럼이 없으므로 `f.record === undefined`가 된다. 이후 로컬 커스텀 파이트 카드 모달(openFightCardModal)의 드롭다운:

```javascript
// 수정 전
sel.innerHTML += `<option value="${f.id}">${f.name} (${f.record})</option>`;
// → "Jose Souza (undefined)"
```

### 수정 (admin.js, `populateFighterSelects()`)

```javascript
// 수정 후
var rec = f.record || ((f.wins !== undefined) ? (f.wins + '-' + f.losses + (f.draws > 0 ? '-' + f.draws : '')) : '?-?');
sel.innerHTML += `<option value="${f.id}">${f.name} (${rec})</option>`;
// → "Jose Souza (0-0)"
```

---

## 4. `fetchUpcomingMatchups()` stats 경로 분석

파이터가 매치업에 등록된 후 이벤트 카드 렌더링 경로:

| 단계 | 코드 | 결과 |
|---|---|---|
| matchup에 `red_fighter_id` 있음 | `_missingIds.push(m.red_fighter_id)` | ID 기반 fetch |
| `fighters` 테이블 조회 | `sb.from('fighters').select(_fSelectCols).in('id', _missingIds)` | Jose Souza row 반환 |
| `_cacheFighter(f)` | `f.record = wins + '-' + losses + (draws>0 ? '-'+draws : '')` | "0-0" |
| 이벤트 카드 표시 | stats 0, record "0-0" | ✅ 정상 렌더링 (데이터 없음 표시) |

→ **수동 등록 파이터의 stats 미입력은 의도된 상태**. 이벤트 카드에서는 "0-0" record + 0 stats로 표시됨.

---

## 5. 이벤트 빌더 매치업 검색 경로 (builder modal)

`openMatchupEditModal()` → `runMemSearch()` → `_allFightersCache` 조회 → `setMemCorner()` → `saveMatchupFromModal()` → `admin_upsert_matchup` RPC

| 단계 | 상태 |
|---|---|
| 검색 (`runMemSearch`) | ✅ 버그 A 수정 후 정상 |
| 선수 선택 (`setMemCorner`) | ✅ wins/losses/draws 직접 표시 (record 불필요) |
| 저장 (`saveMatchupFromModal`) | ✅ fighter.id + fighter.name FK 정상 저장 |
| 이미지 자동입력 | ✅ f.image_url 존재 시 자동 |

---

## 6. 수정 파일 요약

| 파일 | 수정 내용 |
|---|---|
| `public/js/admin.js` | `saveFighter()`: RPC 성공 시 `_allFightersCache = []` 추가 |
| `public/js/admin.js` | `populateFighterSelects()`: record fallback `wins-losses-draws` 계산 추가 |

---

## 7. 미대응 항목

| 항목 | 판단 |
|---|---|
| Jose Souza / Rodrigo Vera의 stats 미입력 | 수동 등록 파이터 정상 상태 — 운영자가 직접 stats 입력 필요 |
| `fighters.wins/losses/draws` 정산 후 자동갱신 | P1-B (QA_RUN_2026-05-28_SETTLEMENT_INTEGRITY.md 참조) — 별도 승인 후 처리 |
