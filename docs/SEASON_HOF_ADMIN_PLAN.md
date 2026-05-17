# Pick-tagon Season / HOF Admin 관리 설계 문서

**작성일:** 2026-05-17  
**대상 브랜치:** main (ab3a808)  
**상태:** Phase S3-A 완료 (2026-05-17) / Phase S3-B 완료 (2026-05-17) / Phase S3-C 완료 (2026-05-17) / Admin HOF UX 고도화 완료 (2026-05-17)

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

**hidden/is_visible 컬럼: 없음 (S3-A 이후에도 변경 없음)**

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

**Phase S3-A 이후 추가된 컬럼 (20260517_season_hof_soft_hide_rpc.sql):**
- `is_hidden     BOOLEAN     NOT NULL DEFAULT FALSE`
- `hidden_at     TIMESTAMPTZ NULL`
- `hidden_by     UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL`
- `hidden_reason TEXT        NULL`

### RPC 권한 현황

| RPC | anon | authenticated | service_role | is_admin() guard |
|---|---|---|---|---|
| `get_current_season` | ✅ | ✅ | ✅ | ❌ |
| `get_hall_of_fame` | ✅ | ✅ | ✅ | ❌ |
| `admin_update_season_name` | ❌ | ✅ | ✅ | ✅ |
| `admin_end_season` | ❌ | ✅ | ✅ | ✅ |
| `admin_hide_hof_entry` | ❌ | ✅ | ✅ | ✅ |
| `admin_restore_hof_entry` | ❌ | ✅ | ✅ | ✅ |

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
admin_hide_hof_entry(p_hof_id):
  season_hof JOIN seasons → v_season.is_active = TRUE
    RETURN {ok: false, reason: 'active_season_not_allowed'}
```

active 시즌은 season_hof 행이 구조상 없으므로 이 guard는 방어적 추가임.

### audit log 정책

- `admin_hide_hof_entry` / `admin_restore_hof_entry` 모두 `admin_audit_logs` 기록
- action: `'hide_hof_entry'` / `'restore_hof_entry'`
- metadata: `{ season_id, season_name, rank, nickname, reason }`

---

## 7. 구현 계획

### Phase S3-A: soft hide schema + RPC (DB migration)

**migration 파일:** `20260517_season_hof_soft_hide_rpc.sql` (적용 완료)

```sql
-- 1. season_hof에 soft hide 컬럼 추가
ALTER TABLE public.season_hof
    ADD COLUMN IF NOT EXISTS is_hidden     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hidden_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- 2. get_hall_of_fame 필터 추가
CREATE OR REPLACE FUNCTION public.get_hall_of_fame()
...
WHERE s.is_active  = FALSE
  AND h.is_hidden  = FALSE   -- 추가
ORDER BY s.id DESC, h.rank ASC;

-- 3. admin_hide_hof_entry RPC
CREATE OR REPLACE FUNCTION public.admin_hide_hof_entry(
    p_hof_id INTEGER,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB ...

-- 4. admin_restore_hof_entry RPC
CREATE OR REPLACE FUNCTION public.admin_restore_hof_entry(
    p_hof_id INTEGER
)
RETURNS JSONB ...

-- 5. REVOKE/GRANT
REVOKE ALL ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_hof_entry(INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_hof_entry(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restore_hof_entry(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_hof_entry(INTEGER) TO authenticated;
```

**RPC 설계 (`admin_hide_hof_entry`):**

```
입력: p_hof_id INTEGER, p_reason TEXT DEFAULT NULL
동작:
  1. is_admin() guard
  2. season_hof row 조회 (FOR UPDATE)
     - NOT FOUND → {ok: false, reason: 'hof_entry_not_found'}
  3. seasons JOIN → is_active 확인
     - is_active = TRUE → {ok: false, reason: 'active_season_not_allowed'}
  4. is_hidden = TRUE 이미 → {ok: true, idempotent: true, hof_id}
  5. UPDATE season_hof SET is_hidden=TRUE, hidden_at=NOW(), hidden_by=uid, hidden_reason=p_reason
  6. admin_audit_logs INSERT
     - action: 'hide_hof_entry'
     - entity_table: 'season_hof'
     - entity_id: p_hof_id::TEXT
     - metadata: { season_id, season_name, rank, nickname, reason }
  7. RETURN { ok: true, hof_id, season_id, season_name, rank, nickname }
```

**RPC 설계 (`admin_restore_hof_entry`):**

```
입력: p_hof_id INTEGER
동작:
  1. is_admin() guard
  2. season_hof row 조회 (FOR UPDATE)
     - NOT FOUND → {ok: false, reason: 'hof_entry_not_found'}
  3. is_hidden = FALSE 이미 → {ok: true, idempotent: true, hof_id}
  4. UPDATE season_hof SET is_hidden=FALSE, hidden_at=NULL, hidden_by=NULL, hidden_reason=NULL
  5. admin_audit_logs INSERT
     - action: 'restore_hof_entry'
  6. RETURN { ok: true, hof_id, season_id, season_name, rank, nickname }
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

→ `admin_get_hall_of_fame()` RPC로 S3-B에서 구현 완료. (hof_id + is_hidden + hidden_at + hidden_reason 반환, is_hidden 필터 없음, is_admin guard, anon REVOKE)

### Phase S3-C: smoke QA 문서화 (완료)

→ S3-A/S3-B 구현에 대한 정적 구조 검증. DB/RPC/JS/빌드 전 항목 PASS. NOT RUN 항목 및 Known Limitations 문서화. 운영 데이터 변경 없음.

---

## 8. QA 체크리스트

### Phase S3-A (DB) — 완료 (2026-05-17, migration: 20260517_season_hof_soft_hide_rpc.sql)

- [x] `season_hof` 컬럼 추가 후 기존 rows `is_hidden = FALSE` 기본값 확인
- [x] `get_hall_of_fame` 함수 본문에 `AND h.is_hidden = FALSE` 조건 존재 확인
- [x] `admin_hide_hof_entry` — `private.is_admin()` guard 존재 확인
- [x] `admin_hide_hof_entry` — active season 차단 로직 (`v_season.is_active = TRUE`) 존재 확인
- [x] `admin_hide_hof_entry` — `admin_audit_logs` INSERT 존재 확인
- [x] `admin_restore_hof_entry` — 동일 guard/audit 구조 확인
- [x] `admin_hide_hof_entry` acl: authenticated ✓ / anon ✗ 확인
- [x] `admin_restore_hof_entry` acl: authenticated ✓ / anon ✗ 확인
- [x] `get_hall_of_fame` acl: anon ✓ / authenticated ✓ 유지 확인
- [NOT RUN] `admin_hide_hof_entry` 실제 호출 — 운영 데이터 변경이므로 미실행
- [NOT RUN] `admin_hide_hof_entry` 호출 후 `get_hall_of_fame` 미반환 확인 — 미실행
- [NOT RUN] `admin_restore_hof_entry` 호출 후 복원 확인 — 미실행

### Phase S3-B (UI) — 완료 (2026-05-17, migration: 20260517_season_hof_admin_get_rpc.sql)

- [x] `admin_get_hall_of_fame()` RPC 추가 — hof_id + is_hidden + hidden_reason 포함, is_admin guard ✓
- [x] `admin_get_hall_of_fame` acl: authenticated ✓ / anon ✗ 확인
- [x] `loadAdminHallOfFameFromDB()` — `seasonData.adminHallOfFame` 갱신 (season.js)
- [x] `renderSeasonAdminPanel()` — adminHallOfFame 기반 렌더, 숨김/복구 버튼 per-rank entry
- [x] `hideSeasonHofEntry(hofId)` — admin_hide_hof_entry RPC 호출, 성공 시 admin/공개 HOF 새로고침
- [x] `restoreSeasonHofEntry(hofId)` — admin_restore_hof_entry RPC 호출, 성공 시 재로드
- [x] `deleteSeasonRecord()` 제거 — no-op toast 코드 삭제됨
- [x] admin.js: season 탭 진입 시 `loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel)` 로 변경
- [x] `npm run build` PASS
- [x] dist에서 `deleteSeasonRecord` / `DB 관리 예정` 문구 없음 확인
- [NOT RUN] admin UI 실제 숨김/복구 버튼 클릭 — 운영 데이터 변경이므로 미실행

### Phase S3-C (Smoke QA) — 완료 (2026-05-17, 정적 구조 검증)

> 운영 데이터 변경 없이 DB/코드 구조를 정적으로 검증함.

#### DB/RPC 구조 검증

| 항목 | 결과 |
|---|---|
| `20260517_season_hof_soft_hide_rpc.sql` 파일 존재 | ✅ PASS |
| `20260517_season_hof_admin_get_rpc.sql` 파일 존재 | ✅ PASS |
| `get_hall_of_fame()` 본문에 `AND h.is_hidden = FALSE` 존재 | ✅ PASS |
| `admin_get_hall_of_fame()` 반환 컬럼: `hof_id`, `is_hidden`, `hidden_at`, `hidden_reason` 포함 | ✅ PASS |
| `admin_get_hall_of_fame()` 본문에 `private.is_admin()` guard 존재 | ✅ PASS |
| `admin_get_hall_of_fame()` is_hidden 필터 없음 (숨김 포함 전체 반환) | ✅ PASS |
| `admin_hide_hof_entry` 본문: `is_admin()` guard ✓ | ✅ PASS |
| `admin_hide_hof_entry` 본문: `active_season_not_allowed` guard (`v_season.is_active = TRUE`) ✓ | ✅ PASS |
| `admin_hide_hof_entry` 본문: idempotent (`is_hidden = TRUE → {ok:true, idempotent:true}`) ✓ | ✅ PASS |
| `admin_hide_hof_entry` 본문: `admin_audit_logs` INSERT ✓ | ✅ PASS |
| `admin_restore_hof_entry` 본문: `is_admin()` guard ✓ | ✅ PASS |
| `admin_restore_hof_entry` 본문: idempotent ✓ | ✅ PASS |
| `admin_restore_hof_entry` 본문: `admin_audit_logs` INSERT ✓ | ✅ PASS |
| `get_hall_of_fame` acl: anon ✓ / authenticated ✓ | ✅ PASS |
| `admin_get_hall_of_fame` acl: authenticated ✓ / anon ✗ | ✅ PASS |
| `admin_hide_hof_entry` acl: authenticated ✓ / anon ✗ | ✅ PASS |
| `admin_restore_hof_entry` acl: authenticated ✓ / anon ✗ | ✅ PASS |

#### JS/UI 구조 검증

| 항목 | 결과 |
|---|---|
| `seasonData.adminHallOfFame` 필드 선언 (season.js:26) | ✅ PASS |
| `loadAdminHallOfFameFromDB()` 선언 + `admin_get_hall_of_fame` 호출 (season.js:98,100) | ✅ PASS |
| `renderSeasonAdminPanel()` — `adminHallOfFame` 기반 렌더 (season.js:232) | ✅ PASS |
| `renderSeasonAdminPanel()` — per-rank 숨김 버튼 `hideSeasonHofEntry(hofId)` (season.js:243) | ✅ PASS |
| `renderSeasonAdminPanel()` — per-rank 복구 버튼 `restoreSeasonHofEntry(hofId)` (season.js:246) | ✅ PASS |
| `hideSeasonHofEntry()` — `admin_hide_hof_entry` RPC 호출 (season.js:397) | ✅ PASS |
| `hideSeasonHofEntry()` — 성공 후 `loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel)` + `loadHallOfFameFromDB()` (season.js:410) | ✅ PASS |
| `restoreSeasonHofEntry()` — `admin_restore_hof_entry` RPC 호출 (season.js:417) | ✅ PASS |
| `restoreSeasonHofEntry()` — 성공 후 동일 재로드 패턴 (season.js:429) | ✅ PASS |
| `deleteSeasonRecord` 문자열 없음 | ✅ PASS |
| `DB 관리 예정` 문자열 없음 | ✅ PASS |
| `renderHallOfFame()` 메달/강조: `rankNum = Number(p.rank) || (i+1)` 기준 (season.js:178) | ✅ PASS |
| admin.js season 탭: `loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel)` (admin.js:144) | ✅ PASS |

#### Build/dist 검증

| 항목 | 결과 |
|---|---|
| `npm run build` PASS | ✅ PASS |
| `public/js/season.js` ↔ `dist/js/season.js` 동기화 (`diff` 출력 없음) | ✅ PASS |
| `public/js/admin.js` ↔ `dist/js/admin.js` 동기화 (`diff` 출력 없음) | ✅ PASS |

#### NOT RUN 항목 (운영 데이터 변경 방지)

| 항목 | 이유 |
|---|---|
| `admin_hide_hof_entry` 실제 RPC 호출 | 운영 HOF 데이터 변경 |
| `admin_restore_hof_entry` 실제 RPC 호출 | 운영 HOF 데이터 변경 |
| 브라우저에서 숨김/복구 버튼 클릭 | 운영 HOF 데이터 변경 |
| hide 후 `get_hall_of_fame` 미반환 확인 | RPC 실행 필요 |
| restore 후 재표시 확인 | RPC 실행 필요 |

#### Known Limitations (S3-C 기준 — Admin HOF UX 고도화 이후 해소된 항목 표시)

- ~~**reason 입력 UX**~~: `hideSeasonHofEntry`가 `prompt()`로 사유 입력 UI 제공. `p_reason` 전달됨. **(Admin HOF UX 고도화에서 해소)**
- ~~**숨김 항목 필터 UI**~~: 전체/공개/숨김 3단계 필터 토글 구현됨. **(Admin HOF UX 고도화에서 해소)**
- ~~**partial hide 표시**~~: `[일부 숨김 N/N]` 뱃지 + 우승자 `(숨김 처리됨)` 표시 구현됨. **(Admin HOF UX 고도화에서 해소)**

---

## 9. 변경 이력 및 제약 명시

초기 조사 세션(ab3a808)에서 코드/DB/운영 데이터 수정 없음.

Phase S3-A (2026-05-17, 별도 세션):
- migration 적용: `20260517_season_hof_soft_hide_rpc.sql`
- DB 변경: `season_hof` 컬럼 추가 (is_hidden, hidden_at, hidden_by, hidden_reason)
- RPC 추가: `admin_hide_hof_entry`, `admin_restore_hof_entry`
- `get_hall_of_fame` 필터 추가
- 운영 데이터 수정 없음 / 실제 HOF hide/restore 실행 없음

Phase S3-B (2026-05-17):
- migration 적용: `20260517_season_hof_admin_get_rpc.sql`
- RPC 추가: `admin_get_hall_of_fame()` (hof_id + is_hidden + hidden_reason, is_admin guard)
- `loadAdminHallOfFameFromDB()` 추가 (season.js)
- `renderSeasonAdminPanel()` 개선: adminHallOfFame 기반, per-rank 숨김/복구 버튼
- `hideSeasonHofEntry()` / `restoreSeasonHofEntry()` 추가 (season.js)
- `deleteSeasonRecord()` 제거
- admin.js season 탭: `loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel)`
- 공개 `renderHallOfFame()` 메달 버그 수정: index i → rankNum 기준
- 운영 데이터 수정 없음 / 실제 hide/restore 실행 없음

Phase S3-C (2026-05-17):
- 정적 구조 smoke QA 실행 — DB/RPC/JS/빌드 전 항목 PASS
- 운영 데이터 변경이 필요한 항목 NOT RUN 명시
- Known Limitations 문서화

Admin HOF UX 고도화 (2026-05-17):
- `hideSeasonHofEntry()` — `confirm()` → `prompt()` 교체, `p_reason` 전달 추가 (season.js)
- `adminHofFilter` 전역 변수 + `setAdminHofFilter()` 함수 추가 (season.js)
- `renderSeasonAdminPanel()` HOF 목록 개선:
  - 전체/공개/숨김 3단계 필터 토글 + 항목 수 표시
  - 필터 결과 없을 때 "조건에 맞는 HOF 항목 없음" 안내
  - `[일부 숨김 N/N]` 뱃지 (allHidden이 아닌 partial 상태)
  - 우승자(rank=1)가 숨김 처리 시 `(숨김 처리됨)` 표시
- DB/migration/운영 데이터 변경 없음

---

## 10. Admin HOF UX 고도화 QA

### 구조 검증

| 항목 | 결과 |
|---|---|
| `adminHofFilter` 전역 변수 선언 (`var adminHofFilter = 'all'`) | ✅ PASS |
| `setAdminHofFilter(f)` 함수: `adminHofFilter = f` 후 `renderSeasonAdminPanel()` 호출 | ✅ PASS |
| `hideSeasonHofEntry()` — `prompt()` 사용, `reasonInput === null` 취소 처리 | ✅ PASS |
| `hideSeasonHofEntry()` — `p_reason: reason` (trim 후 빈값이면 null) RPC에 전달 | ✅ PASS |
| `renderSeasonAdminPanel()` — 필터 토글 버튼 3개 (전체/공개/숨김) + 항목 수 | ✅ PASS |
| 필터: `adminHofFilter === 'visible'` 시 `!e.isHidden` entries만 | ✅ PASS |
| 필터: `adminHofFilter === 'hidden'` 시 `e.isHidden` entries만 | ✅ PASS |
| 필터 결과 없는 시즌 카드: `null` 반환 후 `.filter(Boolean)` 제거 | ✅ PASS |
| 전체 필터 후 빈 목록: "조건에 맞는 HOF 항목 없음" | ✅ PASS |
| `partialHidden`: `!allHidden && s.top3.some(e => e.isHidden)` | ✅ PASS |
| `[일부 숨김 N/N]` 뱃지: `partialHidden === true` 시 노란색 표시 | ✅ PASS |
| 우승자 hidden 시 `(숨김 처리됨)` 표시 (champion.isHidden) | ✅ PASS |
| `renderHallOfFame()` — `adminHofFilter` 참조 없음 (공개 HOF 영향 없음) | ✅ PASS |
| `deleteSeasonRecord` 문자열 없음 | ✅ PASS |
| `npm run build` PASS (376.13 kB) | ✅ PASS |
| `public/js/season.js` ↔ `dist/js/season.js` 동기화 | ✅ PASS |

### Known Limitations (Admin HOF UX 고도화 이후)

- **reason 복구 표시**: `restoreSeasonHofEntry`는 reason 입력 없음 유지 (설계 의도)
- **필터 상태 미저장**: 페이지/탭 이동 후 adminHofFilter = 'all'로 리셋됨 (전역 변수이므로 세션 내 유지)
- **브라우저 QA**: 실제 운영 HOF 데이터로 숨김/복구 버튼 동작은 NOT RUN (운영 데이터 변경 금지)

---

## 이력

| 날짜 | 내용 |
|---|---|
| 2026-05-17 | read-only 조사 + 설계 문서 작성 (main ab3a808) |
| 2026-05-17 | Phase S3-A: season_hof soft hide migration 적용 + RPC 추가 |
| 2026-05-17 | Phase S3-B: admin_get_hall_of_fame RPC + admin UI 숨김/복구 버튼 연결 |
| 2026-05-17 | Phase S3-C: smoke QA 정적 검증 + Known Limitations 문서화 |
| 2026-05-17 | Admin HOF UX 고도화: reason prompt, 필터 토글, 부분 숨김 표시 |
