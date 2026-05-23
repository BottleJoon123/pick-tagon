# Fighter Stats Auto-Scoring Plan

작성: 2026-05-18
업데이트: 2026-05-23 (Step B RPC 구현 + dry_run 검증 + raw stat 데이터 수급 전략 수립 + UFCStats 스크래퍼 완료 + CSV 검증 완료 + Staging import 완료 + Match report 생성 + Step 3 apply 설계 완료 + Step 4 승인 정책 수립)
구현 상태: Step A 완료 + Race-condition 버그 수정 + clamp [45, 98] 적용 + Step B RPC 배포 완료 (dry_run=true 검증 통과) + UFCStats CSV 수집 완료 (4,494건) + Staging import 완료 (4,494행) + Match report 완료 + Approval 정책 수립 완료 (852 auto-approve 대상, 24 수동 처리 대상 식별)

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

⚠ **중요: 동명이인 — 동일 데이터가 아님**  
source_name은 같지만 `source_ufc_stats_id`가 다르며 스탯 값도 다름.  
UFCStats에 동명이인이 존재하며, 현재 fighters DB의 동일 `fighter_id`에 잘못 매칭된 케이스.  
**MAX(id) 자동 선택 불가 — 수동으로 어느 UFCStats 선수가 해당 파이터인지 확인 필요.**

| fighter_id | staging_id A | ufc_stats_id A | slpm A | staging_id B | ufc_stats_id B | slpm B |
|---|---|---|---|---|---|---|
| `bruno-silva` | 3826 | `294aa73dbf37d281` | 3.95 | 3827 | `12ebd7d157e91701` | 3.86 |
| `jean-silva` | 3812 | `9211aae062b799d6` | 0.73 | 3837 | `52ef95b5860fb28c` | 4.82 |
| `maiku-teihisu` | 893 | `c8661e204c66f325` | 0.00 | 898 | `fb3e61720be4690c` | 4.73 |
| `victor-valenzuela-0` | 4248 | `de277a4abcfeea46` | 1.28 | 4250 | `078695e385ec2f57` | 3.47 |

→ 각 파이터에 대해 어느 staging row가 올바른지 UFCStats 프로필 URL 확인 후 수동 `approved=true` + 나머지 row `approved=false` 처리 필요.

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

### Step 4 — UFCStats Staging Approval 이후 별도 단계

1. `admin_recompute_fighter_stats(p_dry_run=true)` 재실행
   - `after_stats` 분포가 `[45–98]` 전반으로 다양하게 분포하는지 확인
   - 기존 `[50,50,98,50,98]` 수렴 패턴 해소 여부 검증
2. 샘플 10명 수동 공식 검증
3. `admin_recompute_fighter_stats(p_dry_run=false)` — **별도 승인 필요**

---

## Step 4 — UFCStats Staging Approval 정책

업데이트: 2026-05-23  
상태: **실행 완료** — approved=true 880건 세팅 완료 (2026-05-23) / fighters 테이블 변경 없음

---

### 승인 분류 요약 (2026-05-23 실행 완료)

| 분류 | 계획 | 실행 결과 | 상태 |
|---|---|---|---|
| auto-approve (exact match, 전 stat 비NULL) | 852건 | **852건** (match_reason=name_match) | ✅ 완료 |
| 수동 — 동명이인 중복 4건 | 4건 | **4건** (match_reason=manual_duplicate_resolved) | ✅ 완료 |
| 수동 — 악센트/특수문자 불일치 | 15건 | **15건** (match_reason=manual_diacritic) | ✅ 완료 |
| 수동 — 아포스트로피 불일치 | 3건 | **3건** (match_reason=manual_apostrophe) | ✅ 완료 |
| 수동 — 이름 형식 불일치 | 6건 | **6건** (match_reason=manual_name_format) | ✅ 완료 |
| **합계 approved=true** | **880건** | **880건** | ✅ |
| invalid_approved (조건 불충족) | 0건 | **0건** | ✅ |
| 중복 approved fighter_id | 0건 | **0건** | ✅ |
| 조사 필요 — staging 후보 없음 | 59 fighters | 미처리 | 추후 |
| 제외 | `testy-test` | skip | — |

**fighters 테이블: slpm 전부 NULL (940/940) — 변경 없음 확인.**

---

### Auto-Approve SQL (실행 완료 — 2026-05-23)

중복 없는 exact match rows 852건을 `approved=true`로 설정.

```sql
-- 실행 완료: 2026-05-23, 852건 approved=true 세팅됨
WITH dup_fighters AS (
  SELECT matched_fighter_id
  FROM public.fighter_stats_staging
  WHERE import_batch = 'ufcstats_20260519'
    AND match_status = 'exact'
    AND matched_fighter_id IS NOT NULL
  GROUP BY matched_fighter_id
  HAVING COUNT(*) > 1
)
UPDATE public.fighter_stats_staging
SET
  approved    = true,
  reviewed_at = NOW()
WHERE import_batch        = 'ufcstats_20260519'
  AND match_status        = 'exact'
  AND matched_fighter_id  IS NOT NULL
  AND approved            = false
  AND matched_fighter_id NOT IN (SELECT matched_fighter_id FROM dup_fighters)
  AND slpm      IS NOT NULL AND str_acc IS NOT NULL
  AND sapm      IS NOT NULL AND str_def IS NOT NULL
  AND td_avg    IS NOT NULL AND td_acc  IS NOT NULL
  AND td_def    IS NOT NULL AND sub_avg IS NOT NULL;
-- Expected: 852 rows updated
```

---

### 수동 처리 A — 동명이인 중복 4케이스

각 fighter에 대해 UFC 프로필 참조 후 올바른 staging row 1개만 수동 승인.

| fighter_id | 확인 방법 | staging A | ufc_stats_id A | slpm A | staging B | ufc_stats_id B | slpm B |
|---|---|---|---|---|---|---|---|
| `bruno-silva` | [A](http://ufcstats.com/fighter-details/294aa73dbf37d281) vs [B](http://ufcstats.com/fighter-details/12ebd7d157e91701) | 3826 | `294aa73dbf37d281` | 3.95 | 3827 | `12ebd7d157e91701` | 3.86 |
| `jean-silva` | [A](http://ufcstats.com/fighter-details/9211aae062b799d6) vs [B](http://ufcstats.com/fighter-details/52ef95b5860fb28c) | 3812 | `9211aae062b799d6` | 0.73 | 3837 | `52ef95b5860fb28c` | 4.82 |
| `maiku-teihisu` | [A](http://ufcstats.com/fighter-details/c8661e204c66f325) vs [B](http://ufcstats.com/fighter-details/fb3e61720be4690c) | 893 | `c8661e204c66f325` | 0.00 | 898 | `fb3e61720be4690c` | 4.73 |
| `victor-valenzuela-0` | [A](http://ufcstats.com/fighter-details/de277a4abcfeea46) vs [B](http://ufcstats.com/fighter-details/078695e385ec2f57) | 4248 | `de277a4abcfeea46` | 1.28 | 4250 | `078695e385ec2f57` | 3.47 |

#### 수동 검증 결과 (2026-05-23, DB 교차검증)

검증 방법: fighters 테이블 `division`, `wins/losses`, `ko_rate`, `sub_rate`, `td_avg`와 staging 스탯 상관관계 분석.  
외부 URL 직접 접근 없이 DB 데이터만으로 판단 (UFCStats 프로필 직접 확인으로 최종 검증 권장).

**Auto-approve SQL 안전성 확인 완료**: CTE `dup_fighters` 조건으로 4케이스 전부 제외됨 (`dup_in_result = 0`).

---

**케이스 1: `maiku-teihisu` (Mike Davis)** — 결론: **B 확정 (고신뢰)**

| 항목 | fighters DB | staging A (id=893) | staging B (id=898) |
|---|---|---|---|
| division | lw | — | — |
| record | 12-3-0 | — | — |
| ko_rate | 66.67% | slpm=0.00 (전부 0) | slpm=4.73 |
| 판정 | 12승 중 8KO 선수가 slpm=0은 불가능 | ❌ 다른 인물 | ✅ 일치 |

→ staging A (`c8661e204c66f325`)는 UFC 경기 기록 없는 다른 Mike Davis (전부 0.0).  
→ staging B (`fb3e61720be4690c`, slpm=4.73, ko_rate 66% 일치) 가 `maiku-teihisu` 본인.  
→ **처리: staging_id=898만 승인, 893은 `match_status='excluded'` 또는 approved=false 유지.**

---

**케이스 2: `victor-valenzuela-0` (Victor Valenzuela)** — 결론: **B 유력 (고신뢰)**

| 항목 | fighters DB | staging A (id=4248) | staging B (id=4250) |
|---|---|---|---|
| division | ww | — | — |
| record | 14-4-0 | str_acc=**100.0%** | str_acc=40% |
| 판정 | 18경기 커리어 | ❌ str_acc=100%는 통계적 불가 | ✅ 정상 범위 |

→ staging A (`de277a4abcfeea46`): str_acc=100%, str_def=0%, td 전부 0 → UFC 경기 수 극히 적은 다른 인물(1-2전 샘플 오류) 또는 신인.  
→ staging B (`078695e385ec2f57`, slpm=3.47, str_acc=40%) 가 14-4 커리어 파이터 프로파일에 부합.  
→ **처리: staging_id=4250만 승인, 4248은 approved=false 유지.**  
→ ⚠ UFCStats URL 직접 확인 권장 (str_acc=100% 이상값의 원인 확인).

---

**케이스 3: `jean-silva` (Jean Silva)** — 결론: **B 유력 (고신뢰)**

| 항목 | fighters DB | staging A (id=3812) | staging B (id=3837) |
|---|---|---|---|
| division | fw (featherweight) | — | — |
| record | 17-3-0 | slpm=0.73, str_acc=22% | slpm=4.82, str_acc=51% |
| ko_rate | **70.59%** | td_avg/acc/def=0.0 | td_avg=1.2, sub_avg=0.6 |
| 판정 | KO 위주 적극적 스트라이커 | ❌ slpm=0.73은 심각 불일치 | ✅ 고slpm 파이터 프로파일 일치 |

→ staging A (`9211aae062b799d6`): slpm=0.73, str_acc=22%, td 0.0 → UFC 경기 극소 또는 다른 Jean Silva.  
→ staging B (`52ef95b5860fb28c`, slpm=4.82): ko_rate 70%+인 fw 파이터 프로파일과 일치. Jean "Cebolinha" Silva 추정.  
→ **처리: staging_id=3837만 승인, 3812는 approved=false 유지.**  
→ ⚠ UFCStats URL 최종 확인 권장.

---

**케이스 4: `bruno-silva` (Bruno Silva)** — 결론: **A 확정 (고신뢰, ESPN 교차검증 완료)**

검증 방법: UFC stats 직접 연결 불가 (ECONNREFUSED) → ESPN fighter page (espn_id=3895544) 확인.

| 항목 | fighters DB | ESPN 확인 결과 | staging A (id=3826) | staging B (id=3827) |
|---|---|---|---|---|
| name | Bruno Silva | Bruno "Bulldog" Silva | — | — |
| division | **flw** | Flyweight ✓ | — | — |
| record | 15-8-2 | 15-8-2 ✓ | — | — |
| height | 162.56cm | 5'4" (162.56cm) ✓ | — | — |
| style | — | Brazilian Jiu-Jitsu | — | — |
| sub_wins | sub_rate=33.33% | 5 subs (5/15=33%) ✓ | sub_avg=0.2, td_avg=2.01 ✅ | sub_avg=0.0, td_avg=0.77 ❌ |
| 판정 | | | ✅ BJJ 그래플러 프로파일 완벽 일치 | ❌ sub_avg=0.0 은 BJJ 5sub 선수 불가 |

ESPN 확인 세부:
- 닉네임: "Bulldog", 국적: Brazil, 출생: 1990-03-16, 훈련: Fight Ready
- TKO 기록: 6-3 (ko_rate=40% ✓), Sub 기록: 5-1 (sub_rate=33.33% ✓)

→ staging A (`294aa73dbf37d281`): BJJ 스타일 파이터 — td_avg=2.01, sub_avg=0.2, sub_rate=33% **완벽 일치**. Bruno "Bulldog" Silva.  
→ staging B (`12ebd7d157e91701`): sub_avg=0.0, td_avg=0.77 — UFC 다른 Bruno Silva (추정: MW 스트라이커).  
→ **처리 확정: staging_id=3826 승인, 3827은 approved=false 유지.**

---

#### 케이스 처리 SQL 패턴 (실행 금지 — 검증 완료 후 개별 적용)

```sql
-- maiku-teihisu: staging B (id=898) 승인 — 고신뢰
UPDATE public.fighter_stats_staging
SET approved = true, reviewed_at = NOW()
WHERE id = 898;

-- victor-valenzuela-0: staging B (id=4250) 승인 — 고신뢰
UPDATE public.fighter_stats_staging
SET approved = true, reviewed_at = NOW()
WHERE id = 4250;

-- jean-silva: staging B (id=3837) 승인 — 고신뢰
UPDATE public.fighter_stats_staging
SET approved = true, reviewed_at = NOW()
WHERE id = 3837;

-- bruno-silva: staging A (id=3826) 승인 — ESPN 교차검증 완료, 고신뢰
UPDATE public.fighter_stats_staging
SET approved = true, reviewed_at = NOW()
WHERE id = 3826;
```

---

### 수동 처리 B — 미매칭 파이터 (staging 후보 있음, 24명)

이름 표기 차이(악센트, 아포스트로피, 이름 형식)로 자동 매칭 실패.  
각 파이터에 대해 `fighter_stats_staging.matched_fighter_id` UPDATE 후 `approved=true` 세팅 필요.

처리 SQL 패턴 (실행 금지 — 확인 후 개별 적용):
```sql
-- 예시: aleksandar-rakic → staging_id=3355 연결
UPDATE public.fighter_stats_staging
SET matched_fighter_id = 'aleksandar-rakic',
    match_status       = 'exact',
    match_reason       = 'manual_diacritic',
    match_confidence   = 1.0,
    approved           = true,
    reviewed_at        = NOW()
WHERE id = 3355;
```

#### 대상 목록 (악센트/특수문자 불일치)

| fighter_id | fighter_name | division | staging_id | source_name | ufc_stats_id | slpm |
|---|---|---|---|---|---|---|
| `aleksandar-rakic` | Aleksandar Rakić | lhw | 3355 | Aleksandar Rakic | `333b9e5c723ac873` | 4.13 |
| `brando-pericic` | Brando Peričić | hw | 3220 | Brando Pericic | `d0fd0d9ee560dae7` | 11.00 |
| `dusko-todorovic` | Duško Todorović | mw | 4153 | Dusko Todorovic | `866fd7b1a6c90e7f` | 4.73 |
| `ernesta-kareckaite` | Ernesta Kareckaitė | wfw | 2084 | Ernesta Kareckaite | `e4faa79383c9f214` | 7.28 |
| `fares-ziam` | Farès Ziam | lw | 4574 | Fares Ziam | `1e4f273069fb9e85` | 2.87 |
| `jan-blachowicz` | Jan Błachowicz | lhw | 376 | Jan Blachowicz | `99df7d0a2a08a8a8` | 3.55 |
| `jessica-andrade` | Jéssica Andrade | wmw | 146 | Jessica Andrade | `6a1901c62ab3870f` | 6.37 |
| `jiri-prochazka` | Jiří Procházka | lhw | 3313 | Jiri Prochazka | `009341ed974bad72` | 5.61 |
| `joel-alvarez` | Joel Álvarez | ww | 113 | Joel Alvarez | `58bbef3770bb2dfc` | 4.53 |
| `julianna-pena` | Julianna Peña | wbw | 3186 | Julianna Pena | `3253b16d38ae087d` | 3.10 |
| `mantas-kondratavicius` | Mantas Kondratavičius | mw | 2190 | Mantas Kondratavicius | `3cc506f115cbb9d5` | 4.97 |
| `mateusz-rebecki` | Mateusz Rębecki | lw | 3385 | Mateusz Rebecki | `849c5d9979df5357` | 4.79 |
| `tereza-bleda` | Tereza Bledá | wfw | 388 | Tereza Bleda | `59c438c81fbf3ece` | 2.92 |
| `thiago-moises` | Thiago Moisés | lw | 2783 | Thiago Moises | `d945aae53e3e54e6` | 2.52 |
| `uros-medic` | Uroš Medić | ww | 2670 | Uros Medic | `681399317dbf4701` | 5.59 |

#### 대상 목록 (아포스트로피 불일치)

| fighter_id | fighter_name | division | staging_id | source_name | ufc_stats_id | slpm |
|---|---|---|---|---|---|---|
| `loneer-kavanagh` | Lone'er Kavanagh | flw | 2094 | Lone'er Kavanagh | `bb2c3c3a466224af` | 4.13 |
| `ode-osbourne` | Ode' Osbourne | flw | 3079 | Ode Osbourne | `6d68c1afe954f121` | 2.94 |
| `treston-vines` | Tre'ston Vines | mw | 4324 | Tre'ston Vines | `563a1d42bb0e3cef` | 0.00 |

#### 대상 목록 (이름 형식 불일치)

| fighter_id | fighter_name | division | staging_id | source_name | ufc_stats_id | slpm |
|---|---|---|---|---|---|---|
| `mariya-agapova-0` | Benoît Saint Denis | lw | 3590 | Benoit Saint Denis | `c2299ec916bc7c56` | 5.62 |
| `tamia-hasohitsuku` | Damir Hadžović | lw | 1653 | Damir Hadzovic | `38c626ca912c7bac` | 3.34 |
| `jose-delgado` | Jose Miguel Delgado | fw | 932 | Jose Delgado | `7d6ceff6747f2de2` | 7.48 |
| `viktoriya-leonardo-0` | Mandy Böhm | wfw | 404 | Mandy Bohm | `297a2b35444c245b` | 2.51 |
| `michael-page` | Michael Venom Page | ww | 3109 | Michael Page | `a67d071163962af8` | 2.28 |
| `paulo-renato-jr` | Paulo Renato Jr. | lhw | 3405 | Paulo Renato Junior | `01dfb60661153735` | 4.89 |

---

### 수동 처리 C — Staging 후보 없음 (59명)

UFCStats에 미등재 가능성 (신규 데뷔, 등록명 상이, 비UFCStats 경력 등).  
별도 수동 조사 후 skip 확정 또는 향후 배치 업데이트 시 처리.

<details>
<summary>전체 목록 (59명)</summary>

| fighter_id | name | division |
|---|---|---|
| `juan-martinetti` | Adrián Luna Martinetti | bw |
| `trevin-dzhayls-6` | Cristian Quiñonez | bw |
| `eduardo-matias-torres` | Eduardo Matias Torres | bw |
| `mariya-agapova-4` | Reyes Cortez | bw |
| `willian-souza` | Willian Souza | bw |
| `davi-costa` | Davi Costa | flw |
| `jung-hyun-lee` | Jung Hyun Lee | flw |
| `mateus-mendonca` | Mateus Mendonça | flw |
| `rafael-de-freitas` | Rafael de Freitas | flw |
| `dinis-paiva` | Dinis Paiva | fw |
| `freddy-emiliano-linares` | Freddy Emiliano Linares | fw |
| `li-kaiwen` | Li Kaiwen | fw |
| `rheza-arianto` | Rheza Arianto | fw |
| `rick-palacios` | Rick Palacios | fw |
| `sang-won-kim` | Sang Won Kim | fw |
| `cory-corbin` | Cory Corbin | hw |
| `frank-holland` | Frank Holland | hw |
| `jonathan-correa` | Jonathan Correa | hw |
| `jordan-jackson` | Jordan Jackson | hw |
| `keifer-roberts` | Keifer Roberts | hw |
| `logan-greenhalgh` | Logan Greenhalgh | hw |
| `marcos-conrado-junior` | Marcos Conrado Junior | hw |
| `martin-mishtaku` | Martin Mishtaku | hw |
| `timothy-thomas` | Timothy Thomas | hw |
| `cody-belisle` | Cody Belisle | lhw |
| `dakota-weigher` | Dakota Weigher | lhw |
| `evan-sweesy` | Evan Sweesy | lhw |
| `harrison-garcia` | Harrison Garcia | lhw |
| `jesse-mariotti` | Jesse Mariotti | lhw |
| `lukasz-sudolski` | Lukasz Sudolski | lhw |
| `vineesh-subrahmanyan` | Vineesh Subrahmanyan | lhw |
| `asikeerbai-jinensibieke` | Asikeerbai Jinensibieke | lw |
| `jae-hyun-park` | Jae Hyun Park | lw |
| `joseph-lowry` | Joseph Lowry | lw |
| `kaue-fernandes` | Kauê Fernandes | lw |
| `nair-nelikyan` | Nair Nelikyan | lw |
| `nariman-abbassov` | Nariman Abbassov | lw |
| `wendri-patilima` | Wendri Patilima | lw |
| `dominik-melendez` | Dominik Melendez | mw |
| `donavan-beard` | Donavan Beard | mw |
| `fabio-agu` | Fabio Agu | mw |
| `garrett-grimes` | Garrett Grimes | mw |
| `khadzhimurat-bestaev` | Khadzhimurat Bestaev | mw |
| `leonardo-de-oliveira` | Leonardo De Oliveira | mw |
| `luis-dias-de-assis` | Luis Dias de Assis | mw |
| `marcio-alexandre` | Marcio Alexandre | mw |
| `matej-penaz` | Matěj Peňáz | mw |
| `montrel-talbert` | Montrel Talbert | mw |
| `steve-regman` | Steve Regman | mw |
| `zach-borrego` | Zach Borrego | mw |
| `zachary-reese` | Zachary Reese | mw |
| `jingnan-xiong` | Jingnan Xiong | wmw |
| `maiara-amajanas-dos-santos` | Maiara Amajanas Dos Santos | wmw |
| `dallas-marron` | Dallas Marron | ww |
| `jose-henrique` | José Henrique | ww |
| `michael-bonnette` | Michael Bonnette | ww |
| `taiyilake-nueraji` | Nueraji Taiyilake | ww |
| `sang-hoon-yoo` | Sang Hoon Yoo | ww |
| `sean-mcinerney` | Sean Mcinerney | ww |

</details>

---

### 승인 전 체크리스트

**완료된 항목:**
- [x] Auto-approve SQL 안전성 확인 — 동명이인 4케이스 전부 자동 제외됨 (`dup_in_result=0`)
- [x] 동명이인 4케이스 DB 교차검증 완료 (2026-05-23)
  - [x] `maiku-teihisu` → staging B (id=898) 확정 (slpm=0 불가, B=4.73 일치)
  - [x] `victor-valenzuela-0` → staging B (id=4250) 유력 (A: str_acc=100% 이상값)
  - [x] `jean-silva` → staging B (id=3837) 유력 (A: slpm=0.73 ko_rate 70% 불일치)
  - [x] `bruno-silva` → staging A (id=3826) 유력 (sub_rate 33% vs sub_avg=0.2 일치)

**완료된 항목 (2026-05-23):**
- [x] `bruno-silva` ESPN 교차검증 완료 → staging A (id=3826) 확정
- [x] 동명이인 4건 수동 승인 실행: staging id=898, 4250, 3837, 3826 → approved=true
- [x] 수동 처리 B 24명 `matched_fighter_id` UPDATE + approved=true 실행
- [x] Auto-approve SQL 실행 (852건 → approved=true)
- [x] 검증: approved=880건, invalid_approved=0, 중복 approved=0, fighters 무변경

**다음 단계:**
- [ ] `report_staging_apply.py` 재실행 → STATUS: READY 확인
- [ ] `apply_staging_to_fighters.py --batch ufcstats_20260519` dry-run 실행
- [ ] 최종: `apply_staging_to_fighters.py --batch ufcstats_20260519 --execute` (별도 승인 필요)

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
