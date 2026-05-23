# Fighter Stats Auto-Scoring Plan

작성: 2026-05-18
업데이트: 2026-05-23 (Step B RPC 구현 + dry_run 검증 + raw stat 데이터 수급 전략 수립 + UFCStats 스크래퍼 완료 + CSV 검증 완료 + Staging import 완료 + Match report 생성)
구현 상태: Step A 완료 + Race-condition 버그 수정 + clamp [45, 98] 적용 + Step B RPC 배포 완료 (dry_run=true 검증 통과) + UFCStats CSV 수집 완료 (4,494건) + Staging import 완료 (4,494행) + Match report 완료

---

## 배경

H2H 레이더 차트 및 스타일 분석(`analyzeStyleMatchup`)은 `fighter.stats` 배열
`[Striking, Grappling, Stamina, Defense, Speed]` (0–100)을 사용한다.
기존 방식은 admin 슬라이더 수동 입력 — 주관 개입, 이중 작업.

Raw UFC 퍼포먼스 스탯(SLpM, Str Acc 등)이 DB 컬럼으로 존재하므로
이를 토대로 5개 스탯을 자동 파생하는 공식을 정의한다.

---

## DB 상태 (2026-05-18 기준)

| 항목 | 상태 |
|---|---|
| `fighters` table raw stat 컬럼 | `slpm`, `str_acc`, `sapm`, `str_def`, `td_avg`, `td_acc`, `td_def`, `sub_avg`, `ko_rate`, `sub_rate`, `dec_rate` 존재 |
| `fighter_stat_baselines` table | 구조 존재, 데이터 **비어있음** |
| `admin_upsert_fighter` RPC | `slpm`, `str_acc`, `sapm`, `str_def`, `td_avg`, `td_acc`, `td_def`, `sub_avg`, `ko_rate`, `sub_rate`, `dec_rate` 전체 처리 (20260518 migration 적용) |

---

## Step A — Admin UI 자동 계산 (구현 완료)

### 위치
`public/js/admin.js` — `computeStatsFromPerf()`, `autoComputeFighterStats()`
`index.html` — 퍼포먼스 스탯 섹션 "⚡ 자동 계산" 버튼

### 흐름
1. Admin이 Raw 스탯 입력 (SLpM, Str Acc, SApM 등)
2. "⚡ 자동 계산" 버튼 클릭
3. `autoComputeFighterStats()` → raw 값 읽기 → `computeStatsFromPerf()` 호출
4. 슬라이더 5개 자동 업데이트 + toast "스탯 자동 계산 완료"
5. 수동 fine-tune 가능 상태 유지
6. "SAVE FIGHTER" 클릭 시 슬라이더 현재값으로 저장

---

## 정규화 공식

### normalize(val, key)
```
score = clamp((val − p05) / (p95 − p05) × 100, 0, 100)
```

### inverse normalize(val, key) — sapm (낮을수록 유리)
```
score = clamp((p95 − val) / (p95 − p05) × 100, 0, 100)
```

### missing stat 처리
값이 null/빈칸인 스탯은 가중 평균에서 제외.
모든 스탯이 null이면 neutral 50 반환.

---

## 5개 스탯 파생 공식

| 스탯 | Raw 입력 | 가중치 |
|---|---|---|
| **Striking** | SLpM × 0.55 + Str Acc × 0.45 | |
| **Grappling** | TD Avg × 0.45 + TD Acc × 0.35 + Sub Avg × 0.20 | |
| **Stamina** | inv(SApM) × 0.60 + Dec Rate × 0.40 | |
| **Defense** | Str Def × 0.60 + TD Def × 0.40 | |
| **Speed** | SLpM × 0.40 + KO Rate × 0.35 + Str Acc × 0.25 | |

---

## Fallback Baselines (division baseline 없을 때 사용)

`FIGHTER_STAT_FALLBACK_BASELINES` — UFC 전체 선수 기준 추정 p05/p95:

| 스탯 | p05 | p95 |
|---|---|---|
| slpm | 1.5 | 7.5 |
| str_acc | 28% | 62% |
| sapm | 1.5 | 6.5 |
| str_def | 45% | 76% |
| td_avg | 0.0 | 4.5 |
| td_acc | 15% | 70% |
| td_def | 40% | 88% |
| sub_avg | 0.0 | 2.5 |
| ko_rate | 0% | 60% |
| sub_rate | 0% | 35% |
| dec_rate | 20% | 80% |

---

## Step B — DB 자동 계산 연동 (보류)

Step A(admin UI 자동 계산 + 전체 raw stat 저장)는 완료.
Step B는 공식 안정화 + `fighter_stat_baselines` 실데이터 채워진 후 진행.

필요 작업:
1. `fighter_stat_baselines` 테이블에 division별 실측 p05/p95 데이터 입력
2. (선택) DB function `compute_fighter_stats(fighter_id)` — 신규 파이터 저장 시 stats 배열 자동 산출

---

## 최소 수치 정책 (2026-05-18 적용)

이 스탯은 0–100 raw 실측값이 아니라 **normalized rating** (게임 카드 능력치).
완전한 raw data가 없는 파이터도 게임 내에서 적절한 수준을 유지해야 한다.

| 규칙 | 내용 | 구현 |
|------|------|------|
| null raw stat | 가중 평균에서 제외 (0 취급 금지) | `wa()` null 제외 |
| 카테고리 전체 null | neutral 50 반환 | `wa()` wSum==0 → 50 |
| 최종 clamp | 최소 **45**, 최대 **98** | `clamp()` 적용 |

---

## 버그 수정 이력 (2026-05-18)

### 버그 1: 저장 후 stats 반영 안 되는 것처럼 보이는 문제 (FIXED)

**원인**: `saveFighter()`에서 `renderAdminFighterList()`가 `admin_upsert_fighter` RPC보다
먼저 실행되어 **race condition** 발생.

```
saveFighter()
  ├─ sb.rpc('admin_upsert_fighter', ...).then(...)   ← 비동기, 200–400ms
  └─ renderAdminFighterList()  ← 즉시 실행
       └─ sb.from('fighters').select('*')  ← 50–150ms → RPC보다 먼저 완료
            └─ fighterDB = res.data  ← 구버전 stats로 덮어씌움
```

**수정**: `renderAdminFighterList()` 호출을 RPC `.then()` success 브랜치 내부로 이동.
RPC 실패 시 console.warn 외에 `showToast()` 추가.

**위치**: `public/js/admin.js` `saveFighter()` (lines ~658-679)

---

## Step B — DB 대량 자동 계산 RPC (구현 완료, dry_run 검증 통과)

### 구현 위치

`supabase/migrations/20260519_admin_recompute_fighter_stats.sql`
→ Supabase 프로젝트 `rnnrimzrypayvnmznpin` 에 적용 완료

### RPC: `admin_recompute_fighter_stats(p_dry_run BOOLEAN DEFAULT TRUE)`

| 파라미터 | 동작 |
|---|---|
| `p_dry_run = true` | 실제 UPDATE 없음. 통계 + 샘플 10명 before/after 반환 |
| `p_dry_run = false` | fighters.stats 일괄 UPDATE + admin_audit_logs 기록 |

반환값:

```json
{
  "dry_run": true,
  "total_fighters": 940,
  "has_any_raw": 811,
  "missing_raw": 129,
  "updated_count": 0,
  "samples": [ { "id": "...", "name": "...", "division": "...", "before_stats": [...], "after_stats": [...] } ],
  "missing_fields": { "slpm": 940, "str_acc": 940, ... }
}
```

### dry_run=true 실행 결과 (2026-05-19)

```json
{
  "dry_run": true,
  "total_fighters": 940,
  "has_any_raw": 811,
  "missing_raw": 129,
  "updated_count": 0,
  "missing_fields": {
    "slpm": 940, "str_acc": 940, "sapm": 940,
    "str_def": 940, "td_avg": 940, "td_acc": 940,
    "td_def": 940, "sub_avg": 940,
    "ko_rate": 129, "dec_rate": 129, "sub_rate": 129
  }
}
```

- `updated_count: 0` ✓ — dry_run=true, 실제 업데이트 없음
- `missing_raw: 129` — raw stat 전부 null인 파이터 129명

### ⚠ Critical Finding: raw stat 데이터 공백 (2026-05-19)

| raw stat 컬럼 | null 수 | 비고 |
|---|---|---|
| `slpm`, `str_acc`, `sapm` | **940 (전체)** | 데이터 없음 |
| `str_def`, `td_avg`, `td_acc` | **940 (전체)** | 데이터 없음 |
| `td_def`, `sub_avg` | **940 (전체)** | 데이터 없음 |
| `ko_rate`, `dec_rate`, `sub_rate` | 129 | 811명 데이터 있음 |

**결과**: 현재 DB에는 `ko_rate`, `dec_rate`, `sub_rate` 3개 컬럼만 채워져 있어, 대부분 파이터의 after_stats가 `[50, 50, 98, 50, 98]`으로 수렴.

- Striking=50 (slpm, str_acc 모두 null)
- Grappling=50 (td_avg, td_acc, sub_avg 모두 null)
- Stamina=98 (sapm null 제외 → dec_rate만 반영)
- Defense=50 (str_def, td_def 모두 null)
- Speed=98 (slpm, str_acc null 제외 → ko_rate만 반영)

**→ dry_run=false 실행 금지.** 지금 실행하면 수동 입력된 stats가 오히려 나빠진다.

### dry_run=false 실행 전제조건

1. `slpm`, `str_acc`, `sapm`, `str_def`, `td_avg`, `td_acc`, `td_def`, `sub_avg` 8개 컬럼에 실데이터 입력 필요
2. admin UI 자동 계산 버튼으로 파이터 개별 입력하거나, UFC Stats 스크래퍼로 bulk 입력
3. dry_run=true 재실행 → before/after 샘플이 다양한 값으로 나오는지 확인
4. 승인 후 dry_run=false 실행

---

## Raw Stat 데이터 수급 전략 (2026-05-19)

### 현황 분석

| 식별자/컬럼 | 보유 수 | 비고 |
|---|---|---|
| `fighters` 총 행수 | 940 | |
| `espn_id` | 814 | 86.6% 보유 |
| `ufc_stats_id` | 0 | 컬럼만 존재 (미입력) |
| `name_en` | 940 | 100% (매칭 키 사용 가능) |
| `ko_rate` / `dec_rate` / `sub_rate` | 811 | ESPN 소스 추정, % 단위 (0–100) |
| `slpm` / `str_acc` / `sapm` / `str_def` | **0** | UFCStats.com 소스, 전체 미입력 |
| `td_avg` / `td_acc` / `td_def` / `sub_avg` | **0** | UFCStats.com 소스, 전체 미입력 |

→ 8개 missing stat은 **ufcstats.com** 에서만 제공하는 필드이며, 현재 하나도 없다.

### 추천 방식: Hybrid (Python 스크래퍼 + SQL Staging)

| 방식 | 장점 | 단점 |
|---|---|---|
| Admin UI 개별 입력 | 즉시 가능 | 940명 × 8필드 = 7,520 입력, 비현실적 |
| CSV 직접 import | 빠름 | 매칭 오류 처리 불가, 비가역적 위험 |
| **Python 스크래퍼 + Staging** | 재현 가능, 감사 가능, 단계별 검증 | 구현 필요 |
| UFC Stats API | N/A | 공개 API 없음 |

**→ Python 스크래퍼로 ufcstats.com 데이터 수집 → SQL staging 테이블 → 매칭 리포트 → admin 검토 → bulk apply**

### UFC Stats 데이터 소스

- 사이트: `http://ufcstats.com/statistics/fighters?char=a&page=all` (a–z 알파벳별)
- 파이터 상세: `http://ufcstats.com/fighter-details/{ufc_stats_id}` (hash 형태)
- 스탯 필드 (1:1 매핑):

| ufcstats.com 표시 | DB 컬럼 |
|---|---|
| SLpM (Sig. Str. Landed/min) | `slpm` |
| Str. Acc. | `str_acc` |
| SApM (Sig. Str. Absorbed/min) | `sapm` |
| Str. Def. | `str_def` |
| TD Avg. (per 15min) | `td_avg` |
| TD Acc. | `td_acc` |
| TD Def. | `td_def` |
| Sub. Avg. (per 15min) | `sub_avg` |

스크래퍼 동시에 **`ufc_stats_id`(URL hash)도 추출** → `fighters.ufc_stats_id` 컬럼에 저장 → 이후 재매칭 영구 정확화.

### Staging 테이블 스키마 초안

```sql
CREATE TABLE public.fighter_stats_staging (
    id              BIGSERIAL   PRIMARY KEY,
    import_batch    TEXT        NOT NULL,          -- 'ufcstats_20260520' 등
    source_ufc_stats_id TEXT,                      -- ufcstats.com URL hash
    source_name     TEXT        NOT NULL,           -- 원본 영문명
    slpm            NUMERIC,
    str_acc         NUMERIC,
    sapm            NUMERIC,
    str_def         NUMERIC,
    td_avg          NUMERIC,
    td_acc          NUMERIC,
    td_def          NUMERIC,
    sub_avg         NUMERIC,
    -- 매칭 결과
    matched_fighter_id   TEXT,                     -- fighters.id
    match_method         TEXT,                     -- 'exact_name' | 'fuzzy_name' | 'manual' | 'unmatched'
    match_confidence     NUMERIC,                  -- 0–100
    match_note           TEXT,
    -- 처리 상태
    status          TEXT    DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected' | 'applied'
    reviewed_by     UUID,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Name Matching 정책

**정규화 규칙 (양쪽 동일 적용):**
1. 소문자 변환
2. Unicode NFC 정규화 (악센트 문자 통일)
3. 앞뒤 공백 제거
4. 하이픈 · 아포스트로피 제거

**매칭 우선순위:**

| 우선순위 | 방법 | confidence | 처리 |
|---|---|---|---|
| 1 | `ufc_stats_id` 직접 매칭 | 100 | 자동 승인 |
| 2 | `name_en` 정규화 완전 일치 | 100 | 자동 승인 |
| 3 | Levenshtein 거리 ≤ 2 | 85 | **admin 검토 필요** |
| 4 | 후보 복수 (동명이인) | — | ambiguous, **수동 지정** |
| 5 | 매칭 실패 | 0 | unmatched, **수동 지정 또는 skip** |

**리스크 케이스:**
- id에 `-0`, `-1` 접미사 파이터 (동명이인): 수동 검토 대상
- URL-encoded Cyrillic id (예: `%D0%9C...`): name_en 기준 매칭으로 처리 가능
- 닉네임/약칭 등록 파이터: unmatched로 분류 후 수동 지정

### Dry-run Report 설계

staging 테이블 채워진 후 `admin_match_staging_report()` (또는 SELECT 쿼리)로 출력:

```json
{
  "import_batch": "ufcstats_20260520",
  "total_staged": 3800,
  "matched_in_fighters_db": 895,
  "match_exact": 820,
  "match_fuzzy": 45,
  "match_manual": 30,
  "unmatched": 45,
  "match_rate_pct": 95.2,
  "ambiguous": 12
}
```

### 실제 UPDATE 전 QA 체크리스트

- [ ] staging 매칭률 ≥ 90%
- [ ] fuzzy/manual 매칭 케이스 전원 admin 검토 완료 (status = 'approved')
- [ ] ambiguous 케이스 전원 해소
- [ ] `admin_recompute_fighter_stats(true)` 재실행
  - after_stats 분포가 [45–98] 범위 전반에 분포하는지 확인 (기존처럼 [50,50,98,50,98] 수렴 없어야 함)
  - 이미 수동 입력된 파이터(예: Dooho Choi)의 before/after 비교가 합리적인지 확인
- [ ] 샘플 10명 수동 공식 검증 (JS computeStatsFromPerf 결과와 SQL 결과 일치 확인)
- [ ] admin 최종 승인 후 `admin_recompute_fighter_stats(false)` 실행

### Step 1: UFCStats 스크래퍼 실행 결과 (2026-05-19 완료)

`scripts/scrape_ufcstats.py` 실행 완료.

| 항목 | 값 |
|---|---|
| 수집 대상 | ufcstats.com 전체 파이터 a–z |
| 수집 행수 | 4,485행 (1차 실행) |
| 재수집 성공 | 9행 (`scripts/rescrape_failed.py`) |
| **최종 합계** | **4,494행** |
| null 컬럼 | 0 (전 stat 컬럼 완전 채워짐) |
| 범위 위반 | 0 |
| 중복 ufc_stats_id | 0 |
| 중복 name_en | 7건 (정상 동명이인) |
| 전 stat 0.0 파이터 | 718 (UFC 경기 없음, 유효) |

**실패 9건 원인**: `_get()` retry 메시지의 em-dash(`—`) 문자 → Windows cp949 콘솔 인코딩 에러.  
→ hyphen(`-`)으로 교체 수정 완료 (`scripts/scrape_ufcstats.py`), 재수집 전원 성공.

**출력 파일**: `data/ufcstats_fighters_raw.csv` (로컬 전용, 커밋/DB import 금지)

**Notable fighters 검증 (일부):**

| 파이터 | slpm | str_acc | sapm | str_def | td_avg | td_acc | td_def | sub_avg |
|---|---|---|---|---|---|---|---|---|
| Islam Makhachev | 2.45 | 50% | 2.01 | 72% | 4.57 | 37% | 90% | 0.8 |
| Khamzat Chimaev | 4.01 | 57% | 2.71 | 62% | 6.37 | 65% | 76% | 1.5 |
| Jon Jones | 4.38 | 57% | 2.22 | 64% | 1.89 | 44% | 94% | 0.9 |
| Conor McGregor | 5.32 | 50% | 4.66 | 54% | 0.68 | 50% | 67% | 0.1 |
| Luke Rockhold | 4.10 | 49% | — | — | — | — | — | — |

### 다음 작업 단계

1. ~~Python 스크래퍼 작성~~ **완료** (`scripts/scrape_ufcstats.py`, CSV 4,494행)
2. ~~`fighter_stats_staging` 테이블 migration 작성 + 적용~~ **완료** (`supabase/migrations/20260519_fighter_stats_staging.sql`)
3. ~~CSV → staging 테이블 import (45개 배치, `data/_jsonbatches/batch_000~044.sql`)~~ **완료** (4,494행)
4. ~~매칭 SQL 실행 → match report 확인~~ **완료** (아래 Step 2 참조)
5. 미매칭/ambiguous admin 검토 ← **다음 단계**
6. dry-run 재실행 → QA 통과 → 승인 → apply

---

### Step 2: Staging Import + Match Report (2026-05-23 완료)

#### Import 결과

| 항목 | 값 |
|---|---|
| import_batch | `ufcstats_20260519` |
| 총 import 행수 | **4,494** |
| 배치 파일 수 | 45개 (batch_000 ~ batch_044, 각 100행, 마지막 배치 94행) |
| ON CONFLICT DO NOTHING 스킵 | 6행 (late-addition 파이터 중복, 정상) |
| staging 테이블 적용 migration | `supabase/migrations/20260519_fighter_stats_staging.sql` |

#### 매칭 결과

| 항목 | 값 |
|---|---|
| 전체 행 | 4,494 |
| exact (name_match) | **860** (19.1%) |
| exact (ufc_stats_id_match) | 0 (fighters.ufc_stats_id 미입력 상태) |
| ambiguous | 0 |
| unmatched | **3,634** (80.9%) |

#### 해석

- **80.9% unmatched는 예상된 정상 결과**: UFCStats에는 역대 UFC 출전 파이터 4,494명이 있으나, 우리 `fighters` 테이블은 현재 로스터 **940명**만 보유.
- **860 / 940 = 91.5%** — 현재 활성 파이터 중 91.5%가 name_match 성공.
- 미매칭 80명: 닉네임 등록, 한글명 불일치, 최근 추가 파이터 등.
- `ufc_stats_id` 컬럼 (fighters 테이블)은 현재 전체 0건. 향후 이 컬럼에 hash 채우면 id_match 100%로 개선 가능.

#### fighters 테이블 무결성 확인

- `fighters` 테이블: 940행, `updated_at` 1시간 내 변경 0건 → **운영 데이터 미변경 확인**

#### Top 30 Unmatched (active roster 미매칭 후보 일부, 알파벳 순)

Aalon Cruz, Aaron Brink, Aaron Ely, Aaron Jeffery, Aaron Lanfranco, Aaron Miller, Aaron Phillips, Aaron Riley, Aaron Rosa, Aaron Simpson, Aaron Tau, Aaron Trujillo, Aaron Wetherspoon, Aaron Wilkinson, Abdellah Er-Ramy, Abdul Razak Alhassan, Abdul-Kerim Edilov, Abel Cullum, Abel Trujillo, Abner Lloveras, Abongo Humphrey, Abram Torres, Abu Azaitar, Abubakar Vagaev, Acacio Dos Santos, Achilles Estremadura, Achmed Labasanov, Adam Antolin, Adam Bramhald, Adam Cella

*(대부분 former UFC 파이터 — 현재 로스터에 없음. 활성 파이터 미매칭은 별도 수동 검토 필요.)*

---

## Step 3: Approved Raw Stat Apply 설계 (2026-05-23)

### 개요

`fighter_stats_staging`에서 admin이 승인한 rows만 `fighters` 테이블 raw stat 컬럼에 반영한다.
`fighters.stats[]` 배열 재계산은 별도 Step (admin_recompute_fighter_stats)으로 분리.

### 현재 상태 스냅샷 (2026-05-23 기준)

| 항목 | 값 |
|---|---|
| staging 전체 rows | 4,494 |
| approved=true | **0** (아직 미승인) |
| exact match rows | 860 |
| unique matched fighters | 856 |
| 중복 matched_fighter_id | 4건 (Mike Davis, Victor Valenzuela, Jean Silva, Bruno Silva) |
| fighters raw stat 현황 | 전체 NULL (overwrite 위험 없음) |
| 미매칭 활성 파이터 | **84명** |

### Apply 조건 (모두 충족 필수)

| 조건 | 설명 |
|---|---|
| `approved = true` | admin 검토 후 명시적 승인 필수 |
| `matched_fighter_id IS NOT NULL` | 매칭된 파이터 없으면 적용 불가 |
| `match_status = 'exact'` | exact 매칭만 허용 (fuzzy/ambiguous 불가) |
| `import_batch = 'ufcstats_20260519'` | 배치 명시 필수 |
| 중복 시 `MAX(id)` 선택 | 동일 파이터에 staging 2개 이상이면 최신 row(최대 id) 우선 |

### 업데이트 대상 컬럼 (fighters 테이블)

```
slpm, str_acc, sapm, str_def, td_avg, td_acc, td_def, sub_avg, stats_updated_at
```

**업데이트하지 않는 컬럼**: `stats[]`, `ufc_stats_id`, `ko_rate`, `dec_rate`, `sub_rate`, 기타 모든 컬럼

### Apply SQL (참고용 — 직접 실행 금지)

```sql
UPDATE public.fighters f
SET
  slpm             = s.slpm,
  str_acc          = s.str_acc,
  sapm             = s.sapm,
  str_def          = s.str_def,
  td_avg           = s.td_avg,
  td_acc           = s.td_acc,
  td_def           = s.td_def,
  sub_avg          = s.sub_avg,
  stats_updated_at = NOW()
FROM (
  SELECT DISTINCT ON (matched_fighter_id)
    matched_fighter_id,
    slpm, str_acc, sapm, str_def, td_avg, td_acc, td_def, sub_avg
  FROM public.fighter_stats_staging
  WHERE import_batch        = 'ufcstats_20260519'
    AND approved            = true
    AND matched_fighter_id  IS NOT NULL
    AND match_status        = 'exact'
  ORDER BY matched_fighter_id, id DESC   -- 중복 시 최신 row 선택
) s
WHERE f.id = s.matched_fighter_id;
```

### 중복 matched_fighter_id 4건 분석

| fighter_id | source_names | 원인 |
|---|---|---|
| `maiku-teihisu` | Mike Davis \| Mike Davis | late-addition 재스크래핑 중복 |
| `victor-valenzuela-0` | Victor Valenzuela \| Victor Valenzuela | late-addition 재스크래핑 중복 |
| `jean-silva` | Jean Silva \| Jean Silva | late-addition 재스크래핑 중복 |
| `bruno-silva` | Bruno Silva \| Bruno Silva | late-addition 재스크래핑 중복 |

→ source_name 동일하므로 어느 row든 동일 값. MAX(id) 선택으로 안전하게 처리 가능.

### 미매칭 활성 파이터 84명 원인 분석

| 원인 유형 | 예시 | 조치 |
|---|---|---|
| 특수문자 불일치 | Aleksandar Rakić (`ć`), Brando Peričić (`č`) | 수동 `source_ufc_stats_id` 직접 지정 |
| 아포스트로피 | Lone'er Kavanagh, Ode' Osbourne | 수동 지정 |
| 최근 UFC 데뷔 | Davi Costa, Jung Hyun Lee 등 | UFCStats 미등재일 가능성 |
| 테스트 레코드 | Testy Test | skip 처리 |
| 이름 변형 | Jose Miguel Delgado (→ Jose Delgado?) | 수동 지정 |

→ 84명 중 "Testy Test" 1건 제외, 나머지는 수동 `matched_fighter_id` + `approved=true` 세팅으로 해소 가능.

### 스크립트

| 파일 | 역할 | 실행 안전성 |
|---|---|---|
| `scripts/report_staging_apply.py` | 읽기 전용 dry-run 리포트 | 항상 안전 |
| `scripts/apply_staging_to_fighters.py` | 기본: dry-run / `--execute`: 실제 적용 | `--execute` 없으면 안전 |

```bash
# 현재 상태 리포트 (안전)
python scripts/report_staging_apply.py --batch ufcstats_20260519

# Dry-run (안전 — 실제 변경 없음)
python scripts/apply_staging_to_fighters.py --batch ufcstats_20260519

# 실제 적용 (승인 후에만 — 별도 확인 프롬프트 있음)
python scripts/apply_staging_to_fighters.py --batch ufcstats_20260519 --execute
```

### Apply 전 QA 체크리스트

- [ ] `approved=true` 행 수 ≥ 1 (현재: 0)
- [ ] 무효 approved rows = 0 (matched_fighter_id NULL, match_status != 'exact')
- [ ] 중복 matched_fighter_id 확인 (현재 4건, 동일값 → 안전)
- [ ] overwrite 위험 확인 (현재: 0건 → 안전)
- [ ] `report_staging_apply.py` 실행 → STATUS: READY 확인
- [ ] 미매칭 84명 중 현역 파이터 수동 처리 (또는 skip 명시)
- [ ] `apply_staging_to_fighters.py` dry-run 실행 → 예상 출력 검토
- [ ] admin 최종 승인 후 `--execute` 실행

### Audit 로그

apply 실행 시 `admin_audit_logs`에 per-fighter 기록:

```json
{
  "action": "ufc_stats_bulk_apply",
  "entity_table": "fighters",
  "entity_id": "<fighter_id>",
  "before_data": { "slpm": null, "str_acc": null, ... },
  "after_data":  { "slpm": 4.38, "str_acc": 57.0, ... },
  "metadata": {
    "import_batch":        "ufcstats_20260519",
    "staging_id":          12345,
    "source_name":         "Jon Jones",
    "source_ufc_stats_id": "abcd1234"
  }
}
```

### Step 4 (apply 후 별도 단계)

1. `admin_recompute_fighter_stats(p_dry_run=true)` 재실행
   - `after_stats` 분포가 `[45–98]` 전반으로 다양하게 분포하는지 확인
   - 기존 `[50,50,98,50,98]` 수렴 패턴 해소 여부 검증
2. 샘플 10명 수동 공식 검증
3. `admin_recompute_fighter_stats(p_dry_run=false)` — **별도 승인 필요**

---

## Finding: fight.f1.stats: [] 문제

`api/supabase.js` matchup 빌드 시 `stats: []` 하드코딩 (line 383-384).
Pick 화면 fight card의 radar chart가 empty data를 받음.
H2H 모달은 `fighterDB`에서 읽으므로 영향 없음.
→ 후순위: matchup 빌드 시 fighters 테이블 JOIN으로 stats 채우기.

---

## 주의사항

- 공식은 근사치. 체급별 편차가 크므로 division baseline 데이터 채워진 후 재검증 권장.
- 현재 fallback baseline은 UFC 전체 기준 추정값으로, 체급별 특성(예: 헤비급 vs 스트로급 slpm 분포)을 반영하지 않는다.
- clamp [45, 98]은 게임 카드 UX 목적. 실제 실측 퍼포먼스 분석 목적이 아님.
