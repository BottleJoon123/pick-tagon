# Fighter Stats Auto-Scoring Plan

작성: 2026-05-18
업데이트: 2026-05-18 (버그 수정 + 최소 수치 정책 + Step B RPC 설계)
구현 상태: Step A 완료 + Race-condition 버그 수정 + clamp [45, 98] 적용

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

## Step B — DB 대량 자동 계산 RPC 설계

### 배경

파이터 약 940명 수동 자동 계산 불가. raw stat이 DB에 저장되어 있으므로
SQL 함수에서 동일 공식으로 일괄 계산 후 `fighters.stats` 컬럼 업데이트 가능.

### RPC 후보: `admin_recompute_fighter_stats`

```sql
CREATE OR REPLACE FUNCTION public.admin_recompute_fighter_stats(
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid          UUID := auth.uid();
    v_total        INTEGER := 0;
    v_missing_raw  INTEGER := 0;
    v_updated      INTEGER := 0;
    v_samples      JSONB   := '[]';
    -- Fallback baselines (UFC-wide p05/p95 추정치)
    b_slpm_05      NUMERIC := 1.5;   b_slpm_95   NUMERIC := 7.5;
    b_sacc_05      NUMERIC := 28;    b_sacc_95   NUMERIC := 62;
    b_sapm_05      NUMERIC := 1.5;   b_sapm_95   NUMERIC := 6.5;
    b_sdef_05      NUMERIC := 45;    b_sdef_95   NUMERIC := 76;
    b_tda_05       NUMERIC := 0;     b_tda_95    NUMERIC := 4.5;
    b_tdacc_05     NUMERIC := 15;    b_tdacc_95  NUMERIC := 70;
    b_tddef_05     NUMERIC := 40;    b_tddef_95  NUMERIC := 88;
    b_sub_05       NUMERIC := 0;     b_sub_95    NUMERIC := 2.5;
    b_ko_05        NUMERIC := 0;     b_ko_95     NUMERIC := 60;
    b_subr_05      NUMERIC := 0;     b_subr_95   NUMERIC := 35;
    b_dec_05       NUMERIC := 20;    b_dec_95    NUMERIC := 80;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    -- 인라인 정규화 헬퍼 (normalize / inverse_normalize / clamp)
    -- weighted average 계산 후 clamp(45, 98) 적용
    -- 각 파이터의 slpm, str_acc, sapm, str_def, td_avg, td_acc, td_def,
    --   sub_avg, ko_rate, dec_rate 기반으로 5개 stat 계산
    -- null raw stat → 해당 가중치 제외
    -- 카테고리 전체 null → 50
    -- 최종 clamp [45, 98]

    -- dry_run=true: 샘플 10명 before/after, 총 대상 수, missing 수 반환
    -- dry_run=false: fighters.stats 일괄 UPDATE + audit log

    RETURN jsonb_build_object(
        'dry_run',       p_dry_run,
        'total_fighters', v_total,
        'missing_raw',   v_missing_raw,
        'updated_count', v_updated,
        'samples',       v_samples
    );
END;
$$;
```

### SQL 공식 (Striking 예시 — 나머지 동일 패턴)

```sql
-- normalize: clamp((val - p05) / (p95 - p05) * 100, 0, 100)
-- inverse_normalize: clamp((p95 - val) / (p95 - p05) * 100, 0, 100)

-- Striking = wa([n(slpm, 0.55), n(str_acc, 0.45)])
-- n(slpm, 0.55):
CASE
  WHEN f.slpm IS NOT NULL
  THEN GREATEST(0, LEAST(100, (f.slpm - b_slpm_05) / (b_slpm_95 - b_slpm_05) * 100)) * 0.55
  ELSE NULL
END

-- weighted average (null 제외):
-- vSum / wSum, 단 wSum = 0 이면 50
-- final: GREATEST(45, LEAST(98, ROUND(vSum / wSum)))
```

### dry_run=true 반환값

```json
{
  "dry_run": true,
  "total_fighters": 940,
  "missing_raw": 112,
  "samples": [
    { "id": "conor-mcgregor", "name": "Conor McGregor",
      "before": [78, 42, 65, 72, 85],
      "after":  [89, 48, 67, 74, 91] },
    ...
  ]
}
```

### 구현 전제조건

1. `fighter_stat_baselines` 테이블이 비어 있으므로 **fallback baseline을 SQL 함수 내에 하드코딩**
   (또는 별도 migration으로 baseline seed 후 JOIN)
2. `private.is_admin()` 권한 확인
3. `admin_audit_logs` INSERT (dry_run=false 시)
4. Supabase MCP `apply_migration`으로 적용

### 다음 작업 단계 (미구현)

1. SQL 함수 전체 구현 migration 작성
2. admin UI에 "⚡ 전체 자동 계산 (Dry Run)" 버튼 추가
3. dry_run=true 결과 확인 후 dry_run=false 실행

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
