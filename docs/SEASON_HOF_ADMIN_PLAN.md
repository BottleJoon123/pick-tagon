# Pick-tagon Season / HOF Admin 관리 설계 문서

**작성일:** 2026-05-17  
**대상 브랜치:** main (ab3a808)  
**상태:** 설계 완료 / 구현 미착수

---

## 1. 현재 시즌/HOF 구조

### 데이터 흐름

```
admin_end_season RPC
  └─ seasons (is_active: TRUE → FALSE, end_date 기록)
  └─ season_hof INSERT (Top 3 스냅샷)
  └─ seasons INSERT (새 시즌, is_active: TRUE)
  └─ users.points = 1000 (전체 리셋)
  └─ admin_audit_logs 기록

get_hall_of_fame RPC (anon/authenticated 읽기)
  └─ seasons JOIN season_hof WHERE is_active = FALSE
  └─ ORDER BY s.id DESC, h.rank ASC

loadHallOfFameFromDB()
  └─ sb.rpc('get_hall_of_fame')
  └─ 클라이언트에서 season_id 기준 그룹화
  └─ seasonData.hallOfFame에 oldest-first 저장
  └─ saveSeason() → localStorage fallback

renderHallOfFame() / renderSeasonAdminPanel()
  └─ seasonData.hallOfFame.reverse() → newest-first 표시
```

### localStorage 패턴

- `picktagon_season` 키: `{ current: {...}, hallOfFame: [...] }` 구조
- DB 로드 성공 시 항상 localStorage 갱신
- RPC 실패 시 기존 localStorage 값 유지 (fallback)
- DB 기반 마이그레이션 후에도 fallback 코드 유지됨

---

## 2. deleteSeasonRecord 현재 상태

### 함수 코드 (`public/js/season.js:350-353`)

```javascript
function deleteSeasonRecord(idx) {
    // DB HOF 연결 완료 전까지 localStorage-only 삭제 비활성
    showToast('⚠ DB 시즌 기록 삭제는 아직 지원하지 않습니다');
}
```

### 현재 상태 요약

| 항목 | 상태 |
|---|---|
| 함수 존재 여부 | ✅ `public/js/season.js:350` |
| 실제 동작 | ❌ 토스트만 표시, 동작 없음 |
| UI 버튼 노출 | ❌ `renderSeasonAdminPanel`이 "DB 관리 예정" 라벨만 렌더링 (버튼 없음) |
| localStorage 삭제 코드 | ❌ 현재 버전에서 제거됨 |
| index.html 직접 호출점 | ❌ 없음 |

### 구 버전(picktagon_v5_9_7.html) vs 현재

구 버전에는 실제 localStorage 삭제 로직이 있었음:
```javascript
// 구 버전 (참고용, 현재는 없음)
function deleteSeasonRecord(idx) {
    if (!confirm('이 시즌 기록을 삭제하시겠습니까?')) return;
    seasonData.hallOfFame.splice(idx, 1);
    saveSeason();
    renderSeasonAdminPanel();
    renderHallOfFame();
    showToast('🗑 시즌 기록 삭제됨');
}
```
DB 마이그레이션 시점에 의도적으로 비활성화됨.

---

## 3. DB 테이블/RPC 현황

### seasons 테이블

```sql
CREATE TABLE IF NOT EXISTS public.seasons (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL,
    start_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    end_date   DATE,                      -- NULL = 진행 중
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 동시에 활성 시즌은 1개만 (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active
    ON public.seasons (is_active) WHERE is_active = TRUE;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
```

**hidden/is_visible 컬럼: 없음**

### season_hof 테이블

```sql
CREATE TABLE IF NOT EXISTS public.season_hof (
    id            SERIAL      PRIMARY KEY,
    season_id     INTEGER     NOT NULL REFERENCES public.seasons(id),
    rank          INTEGER     NOT NULL CHECK (rank BETWEEN 1 AND 3),
    user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nickname      TEXT        NOT NULL,
    points        INTEGER     NOT NULL,
    total_picks   INTEGER     NOT NULL DEFAULT 0,
    success_picks INTEGER     NOT NULL DEFAULT 0,
    accuracy      INTEGER,               -- 0-100, NULL = 정산 픽 없음
    belt          TEXT        NOT NULL DEFAULT 'White',
    faction_id    INTEGER     REFERENCES public.factions(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (season_id, rank)
);
ALTER TABLE public.season_hof ENABLE ROW LEVEL SECURITY;
```

**hidden/is_visible 컬럼: 없음**

### RPC 권한 현황

| RPC | anon | authenticated | service_role | is_admin() guard |
|---|---|---|---|---|
| `get_current_season` | ✅ | ✅ | ✅ | ❌ |
| `get_hall_of_fame` | ✅ | ✅ | ✅ | ❌ |
| `admin_update_season_name` | ❌ | ✅ | ✅ | ✅ |
| `admin_end_season` | ❌ | ✅ | ✅ | ✅ |
| **신규 필요** `admin_hide_hof_entry` | ❌ | ✅ | ✅ | ✅ |

### RLS 정책 현황

- `seasons`, `season_hof` 모두 RLS 활성화
- 직접 SELECT/INSERT/UPDATE/DELETE 정책 없음
- 모든 읽기/쓰기는 SECURITY DEFINER RPC 경유
- 일반 쿼리로 직접 접근 불가

### get_hall_of_fame 반환 조건

```sql
WHERE s.is_active = FALSE  -- 종료된 시즌만 반환
ORDER BY s.id DESC, h.rank ASC
```

active 시즌의 HOF 행은 이 RPC에서 반환되지 않음.  
단, `admin_end_season`이 생성하는 season_hof 행은 항상 `is_active=FALSE` 시즌에 속함 — 구조상 active 시즌에는 season_hof 행이 생기지 않음.

---

## 4. 운영 리스크 분석

### 4-1. active season 삭제 시 위험

| 위험 | 설명 |
|---|---|
| 진행 중인 picks 고아화 | picks.user_id 기반 season 연결 끊김 |
| 포인트 집계 오류 | getCurrentSeasonRankings()가 active season 기준으로 동작 |
| 시즌 종료 RPC 실패 | admin_end_season이 활성 시즌 없음으로 실패 |
| HOF 생성 불가 | 다음 시즌 종료 시 이전 시즌 스냅샷 없음 |
| 대시보드 오작동 | 어드민 요약, 랭킹, 시즌 뱃지 모두 null/empty |

**→ active season 삭제는 무조건 RPC 레벨에서 차단해야 함.**

### 4-2. is_active=FALSE 시즌의 HOF row 삭제 시 위험

| 위험 | 설명 |
|---|---|
| 운영 이력 손실 | 누가 1위를 했는지 영구 소멸 |
| 복구 불가 | season_hof는 admin_end_season 시점 1회 생성 후 재생성 방법 없음 |
| audit 공백 | 어드민이 특정 기록을 삭제했는지 사후 추적 어려움 |
| user_id 기반 연산 영향 | 미래에 all-time 통계 기능 추가 시 데이터 불완전 |

**→ hard delete는 피해야 함. soft hide가 적절.**

### 4-3. 현재 deleteSeasonRecord 호출 경로 위험

- 현재 UI에 삭제 버튼 없음 (`renderSeasonAdminPanel`이 "DB 관리 예정" 라벨만 표시)
- 함수 자체는 존재하지만 토스트만 표시하고 종료
- 즉각적인 위험 없음. 다만 함수를 실수로 연결하면 동작 없이 토스트만 뜸

---

## 5. 후보 정책 A-D 비교

### 후보 A: 삭제 기능 제거

| | |
|---|---|
| **내용** | `deleteSeasonRecord` 함수 + "DB 관리 예정" 라벨 제거. HOF는 불변 운영 이력으로 처리. |
| **장점** | 구현 0. 유지보수 0. 데이터 손실 위험 0. |
| **단점** | 오류 입력된 시즌 기록 수정 불가. 운영 융통성 없음. |
| **위험도** | 낮음 |
| **추천** | 운영 이력이 완전히 신뢰 가능할 때 적합 |

### 후보 B: soft hide 방식 (추천)

| | |
|---|---|
| **내용** | `season_hof`에 `is_hidden BOOLEAN DEFAULT FALSE` 추가. `get_hall_of_fame`에 `WHERE h.is_hidden = FALSE` 추가. admin RPC로 숨김/복구. |
| **장점** | 데이터 보존. 복구 가능. 공개 뷰에서 제외. audit log 기록 가능. |
| **단점** | schema migration 필요. UI 업데이트 필요. |
| **위험도** | 낮음 |
| **추천** | ✅ 권장 — 운영 이력 보존 + 유연성 균형 |

### 후보 C: hard delete 방식

| | |
|---|---|
| **내용** | `admin_delete_season_hof` RPC로 season_hof rows 또는 season 전체 삭제. active season guard 필수. |
| **장점** | 깔끔한 데이터. UI 단순. |
| **단점** | 복구 불가. 운영 이력 손실. season 전체 삭제 시 seasons 테이블 foreign key 연쇄 삭제 위험. |
| **위험도** | 높음 |
| **추천** | ❌ 비추천 |

### 후보 D: admin-only repair RPC

| | |
|---|---|
| **내용** | `admin_patch_season_hof` RPC로 특정 row의 nickname/points 등 수정 가능. reason 필수 + audit log. |
| **장점** | 가장 유연. 오입력 수정 가능. 완전한 audit trail. |
| **단점** | 구현 복잡. 데이터 무결성 유지 로직 필요 (rank 중복 등). |
| **위험도** | 중간 |
| **추천** | 향후 별도 Phase로 검토 가능 |

---

## 6. 추천 정책

### 기본 방향: **후보 B (soft hide)**

근거:
1. HOF는 운영 이력 — hard delete 피해야 함
2. 오입력 시즌 기록은 숨길 수 있어야 함 (예: 테스트 시즌, 오작동 시즌)
3. schema 변경은 backward-compatible (기존 RPC에 WHERE 조건 추가)
4. 복구 가능성 보장 → 실수 시 원복 가능
5. active season 삭제는 RPC 레벨에서 무조건 차단

### active season 처리 규칙

```
admin_hide_hof_entry(p_season_id):
  IF seasons.is_active = TRUE WHERE id = p_season_id
    RAISE EXCEPTION 'cannot_hide_active_season'
```

active 시즌은 season_hof 행이 구조상 없으므로 이 guard는 방어적 추가임.

### audit log 정책

- `admin_hide_hof_entry` / `admin_restore_hof_entry` 모두 `admin_audit_logs` 기록
- action: `'hide_hof_entry'` / `'restore_hof_entry'`
- metadata: `{ season_id, season_name, rank, nickname, reason }`

---

## 7. 구현 계획

### Phase S3-A: soft hide schema + RPC (DB migration)

**migration 파일:** `YYYYMMDD_season_hof_soft_hide.sql`

```sql
-- 1. season_hof에 is_hidden 컬럼 추가
ALTER TABLE public.season_hof
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. get_hall_of_fame 필터 추가
CREATE OR REPLACE FUNCTION public.get_hall_of_fame()
...
WHERE s.is_active = FALSE
  AND h.is_hidden = FALSE   -- 추가
ORDER BY s.id DESC, h.rank ASC;

-- 3. admin_hide_hof_entry RPC
CREATE OR REPLACE FUNCTION public.admin_hide_hof_entry(
    p_season_hof_id INTEGER,
    p_reason        TEXT DEFAULT ''
)
RETURNS JSONB ...

-- 4. admin_restore_hof_entry RPC
CREATE OR REPLACE FUNCTION public.admin_restore_hof_entry(
    p_season_hof_id INTEGER,
    p_reason        TEXT DEFAULT ''
)
RETURNS JSONB ...

-- 5. REVOKE/GRANT
REVOKE ALL ON FUNCTION public.admin_hide_hof_entry(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hide_hof_entry(...) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_hof_entry(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_restore_hof_entry(...) TO authenticated;
```

**RPC 설계 (`admin_hide_hof_entry`):**

```
입력: p_season_hof_id INTEGER, p_reason TEXT
동작:
  1. is_admin() guard
  2. season_hof row 조회 (FOR UPDATE)
     - NOT FOUND → RAISE 'hof_entry_not_found'
  3. seasons JOIN → is_active 확인
     - is_active = TRUE → RAISE 'cannot_hide_active_season'
  4. is_hidden이 이미 TRUE → RAISE 'already_hidden' (멱등 허용 가능)
  5. UPDATE season_hof SET is_hidden = TRUE WHERE id = p_season_hof_id
  6. admin_audit_logs INSERT
     - action: 'hide_hof_entry'
     - entity_table: 'season_hof'
     - entity_id: p_season_hof_id::TEXT
     - metadata: { season_id, season_name, rank, nickname, reason: p_reason }
  7. RETURN { ok: true, season_hof_id: p_season_hof_id, season_name, rank, nickname }
```

**RPC 설계 (`admin_restore_hof_entry`):**

```
입력: p_season_hof_id INTEGER, p_reason TEXT
동작:
  1. is_admin() guard
  2. season_hof row 조회 (FOR UPDATE)
  3. UPDATE season_hof SET is_hidden = FALSE WHERE id = p_season_hof_id
  4. admin_audit_logs INSERT
     - action: 'restore_hof_entry'
  5. RETURN { ok: true, ... }
```

### Phase S3-B: admin UI 연결

**변경 파일:** `public/js/season.js`, `index.html`

1. `renderSeasonAdminPanel`의 `admin-hof-list` 렌더링에 숨김/복구 버튼 추가
   - 현재: `<span class="...">DB 관리 예정</span>`
   - 변경 후: 숨김 버튼 (`admin_hide_hof_entry` 호출) + is_hidden 상태 표시
2. `deleteSeasonRecord` → `hideSeasonHofEntry(hofId, reason)` 함수로 교체 또는 연결
3. `loadHallOfFameFromDB`가 `is_hidden` 상태도 받아와서 어드민 뷰에서 표시 가능하도록 별도 어드민 전용 RPC 또는 필드 추가 고려
4. 숨김 항목 복구 버튼: 어드민 패널에서만 표시

**어드민 HOF 목록 표시 정책:**
- 일반 사용자(hof-list): `get_hall_of_fame` 기반, `is_hidden=TRUE` 항목 미표시
- 어드민 패널(admin-hof-list): 숨김 항목도 표시 (회색/취소선), 복구 버튼 제공

이를 위해 별도 `admin_get_all_seasons_hof` RPC 필요 (is_hidden 무관 전체 반환).

### Phase S3-C: 숨김 항목 어드민 전용 조회 RPC (선택)

```sql
CREATE OR REPLACE FUNCTION public.admin_get_all_season_hof()
...
WHERE s.is_active = FALSE
-- is_hidden 필터 없음 (is_hidden 상태도 반환)
ORDER BY s.id DESC, h.rank ASC;
-- authenticated + is_admin() guard
```

---

## 8. QA 체크리스트

### Phase S3-A (DB)

- [ ] `season_hof` 컬럼 추가 후 기존 rows `is_hidden = FALSE` 기본값 확인
- [ ] `get_hall_of_fame` 변경 후 기존 HOF 데이터 정상 반환 확인
- [ ] `admin_hide_hof_entry` — active season HOF 숨기기 시도 시 `cannot_hide_active_season` 오류 확인
- [ ] `admin_hide_hof_entry` — NOT FOUND 시 `hof_entry_not_found` 오류 확인
- [ ] `admin_hide_hof_entry` 호출 후 `get_hall_of_fame`에서 해당 항목 미반환 확인
- [ ] `admin_restore_hof_entry` 호출 후 `get_hall_of_fame`에서 해당 항목 복원 확인
- [ ] `admin_audit_logs`에 `hide_hof_entry` / `restore_hof_entry` action 기록 확인
- [ ] anon이 `admin_hide_hof_entry` 호출 시 거부 확인
- [ ] non-admin authenticated가 호출 시 `admin_required` 오류 확인

### Phase S3-B (UI)

- [ ] admin-hof-list 숨김 버튼 클릭 → 성공 토스트 + 목록 새로고침 확인
- [ ] 숨긴 항목이 일반 hof-list에서 사라지는지 확인
- [ ] 복구 버튼 클릭 → 성공 토스트 + 항목 복원 확인
- [ ] localStorage fallback 시 숨김 항목 처리 확인

---

## 9. 이번 조사에서 코드/DB/운영 데이터 변경 없음 명시

**이 문서는 read-only 조사 결과를 기록한 설계 문서입니다.**

조사 과정에서:
- 코드 수정 없음
- DB migration 없음
- 운영 데이터 수정 없음
- 실제 시즌/HOF 삭제 없음
- force 재정산 실행 없음

Phase S3-A/B/C 구현은 별도 세션에서 수행 예정.

---

## 이력

| 날짜 | 내용 |
|---|---|
| 2026-05-17 | read-only 조사 + 설계 문서 작성 (main ab3a808) |
