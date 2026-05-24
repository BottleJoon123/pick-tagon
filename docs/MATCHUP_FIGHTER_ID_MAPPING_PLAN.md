# Matchup Fighter ID Mapping Plan

> 브랜치: `refactor/design-apply`  
> 작성: 2026-05-24 / 검증: 2026-05-24  
> 관련 Phase: 3D-2, 3D-3

---

## 조사 결과 요약

### 현재 상태 (Phase 3D-2 착수 전)

| 경로 | 상태 |
|---|---|
| `matchups.red_fighter_id` / `matchups.blue_fighter_id` 컬럼 | **이미 존재** (TEXT, nullable) |
| `fighters.id` 타입 | TEXT (UUID 아님) |
| Admin builder `saveMem()` | `red_fighter_id: redFighter?.id` 저장 중 |
| `fetchBuilderMatchups` | `select('*')` → ID 포함해서 가져옴 |
| `admin.js` edit modal | `m.red_fighter_id`로 `_allFightersCache` 조회 |
| **`fetchUpcomingMatchups` SELECT** | ❌ `red_fighter_id, blue_fighter_id` 누락 |
| **`_f1db` / `_f2db` 매칭 로직** | ❌ name-only (`d.name === m.red_fighter_name`) |

**결론: DB 스키마 변경(migration) 불필요. SELECT 컬럼 추가 + 매핑 로직 2순위 변경만 필요.**

---

## Phase 3D-3 운영 DB 검증 결과 (2026-05-24)

### 컬럼 존재 확인 ✅

Supabase `information_schema.columns` 직접 조회:

| 컬럼 | 타입 | nullable | 상태 |
|---|---|---|---|
| `matchups.red_fighter_id` | TEXT | YES | ✅ 존재 |
| `matchups.blue_fighter_id` | TEXT | YES | ✅ 존재 |
| `fighters.id` | TEXT | NO | ✅ 타입 일치 |

### SELECT 안전성 ✅

- 컬럼이 실제 존재하므로 `fetchUpcomingMatchups` SELECT에 추가해도 에러 없음
- 에러 발생 시 `mRes.error` 체크 → `renderFightCards()` 호출 후 return (graceful degradation)
- fighter_id가 NULL인 행도 JS에서 name fallback으로 처리됨

### upcoming 매치업 ID 채움 현황

전체 `matchups` 65행 중 upcoming 이벤트 소속 27행:
- sort_order=99 (오래된/정렬 미설정 데이터): 16행 — 모두 fighter_id NULL
- 정상 정렬 매치업: 11행

**정상 매치업 ID 채움률 (11행 기준):**

| | red_fighter_id | blue_fighter_id |
|---|---|---|
| 채움 | 9/11 (82%) | 7/11 (64%) |
| NULL | 2/11 (18%) | 4/11 (36%) |

### 주목할 데이터 이슈

`red_fighter_name = "King Green"`, `red_fighter_id = "bobby-green"`:
- name-only 매핑: fighterDB에 "Bobby Green"으로 등록 → 매칭 실패 → stats `[]`
- **ID 우선 매핑 (Phase 3D-2 구현 후)**: `d.id === "bobby-green"` → 정확히 매칭 → stats 정상 표시
- 이 케이스가 ID 기반 매핑의 실제 필요성을 증명함

---

## 컬럼 타입 확인

```
matchups.red_fighter_id   TEXT  nullable  → fighters.id (TEXT) FK-like
matchups.blue_fighter_id  TEXT  nullable  → fighters.id (TEXT) FK-like
```

- `20260429_admin_server_phase1.sql`: 처음 UUID 타입으로 추가
- `20260503_fix_matchup_fighter_ids_text.sql`: UUID → TEXT 변경 (fighters.id와 타입 통일)

---

## Backfill 현황

Admin builder를 통해 저장된 매치업은 `red_fighter_id`/`blue_fighter_id` 값 있음.  
이전 매치업(admin builder 사용 전 또는 fighter_id 없이 저장된 경우)은 NULL 가능.

**Backfill은 코드 변경과 무관** — NULL인 경우 name fallback으로 처리됨.

---

## 실행 계획 (Phase 3D-2 구현)

### 변경 파일: `public/js/api/supabase.js`

#### 1. SELECT 컬럼 추가

```js
// 현재 (supabase.js:353)
.select('id, event_id, red_fighter_name, blue_fighter_name, red_image_url, blue_image_url, ...')

// 변경 후
.select('id, event_id, red_fighter_id, blue_fighter_id, red_fighter_name, blue_fighter_name, red_image_url, blue_image_url, ...')
```

#### 2. `_f1db` / `_f2db` 매핑 우선순위 업데이트

```js
// 현재 (name-only)
var _f1db = (typeof fighterDB !== 'undefined' && fighterDB.length)
    ? fighterDB.find(function(d) { return d.name === m.red_fighter_name; })
    : null;

// 변경 후 (ID 우선, name fallback)
var _f1db = null;
if (typeof fighterDB !== 'undefined' && fighterDB.length) {
    _f1db = m.red_fighter_id
        ? fighterDB.find(function(d) { return d.id === m.red_fighter_id; })
        : null;
    if (!_f1db) {
        _f1db = fighterDB.find(function(d) { return d.name === m.red_fighter_name; });
    }
}
```

같은 방식으로 `_f2db` 적용.

#### 3. 정규화 name fallback (선택, 3순위)

이름 표기 차이(대소문자, 공백)까지 처리하려면 3순위 fallback 추가:

```js
function _normalizeName(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().replace(/\s+/g, ' ');
}

// _f1db 미발견 시 normalized fallback
if (!_f1db) {
    var norm = _normalizeName(m.red_fighter_name);
    _f1db = fighterDB.find(function(d) {
        return _normalizeName(d.name) === norm || _normalizeName(d.name_en) === norm;
    });
}
```

**Phase 3D-2 범위**: 1순위(ID) + 2순위(name) 만 구현. 3순위는 필요 시 추가.

---

## 매핑 우선순위 (구현 후)

```
1순위: m.red_fighter_id → fighterDB.find(d.id === m.red_fighter_id)
         ↓ null/미발견
2순위: fighterDB.find(d.name === m.red_fighter_name)  [기존 로직]
         ↓ 미발견
3순위: (선택) normalized name match
         ↓ 미발견
4순위: stats: [], record: '', recent: []  [기존 fallback]
```

---

## 영향 경로 분석

| 경로 | 영향 | 안전 여부 |
|---|---|---|
| `fetchUpcomingMatchups` → `f1.stats` | ID 기반으로 정확도 향상 | ✅ |
| `renderFightCards` / `renderHeroCard` | stats 전달 개선 | ✅ |
| `updateAllFightCards` | 변경 없음 (inline style로 pick 표시) | ✅ |
| `openBetSlip` / `confirmBetSlip` | 변경 없음 | ✅ |
| admin `fetchBuilderMatchups` | `select('*')` 이미 ID 포함 — 변경 없음 | ✅ |
| admin `saveMem()` | 이미 `red_fighter_id` 저장 — 변경 없음 | ✅ |
| `loadUserPicksFromDB` | `fight_id` 기반, fighter name/id 무관 | ✅ |
| settlement RPC | matchup.id 기반, fighter name/id 무관 | ✅ |
| `home.js` `red_fighter_name` 표시 | name 필드 유지 — 영향 없음 | ✅ |
| RLS (Row Level Security) | SELECT 컬럼 추가 — RLS 정책 변경 없음 | ✅ |
| localStorage legacy fights | `customFights` 는 DB를 거치지 않음 — 무관 | ✅ |

---

## 리스크

| 항목 | 심각도 | 처리 |
|---|---|---|
| `red_fighter_id` NULL인 기존 매치업 | 낮음 | name fallback으로 처리 |
| fighterDB 비어있는 cold start | 낮음 | 기존 fallback `[]` 유지 |
| ID 값이 있지만 fighterDB에 없는 fighter | 낮음 | name fallback → 또는 `[]` |
| admin에서 fighter 미선택 시 null 저장 | 낮음 | name fallback 작동 |

---

## 진행 현황

| 단계 | 상태 |
|---|---|
| DB 스키마 조사 (컬럼 존재 확인) | ✅ 완료 |
| admin 저장 경로 확인 | ✅ 완료 |
| 설계 문서화 | ✅ 완료 |
| SELECT 컬럼 추가 + ID 우선 매핑 구현 | ✅ 완료 (22be5d4) |
| 운영 DB 컬럼 존재 검증 | ✅ 완료 (Phase 3D-3) |

---

*작성: 2026-05-24 / 최종 업데이트: 2026-05-24*
