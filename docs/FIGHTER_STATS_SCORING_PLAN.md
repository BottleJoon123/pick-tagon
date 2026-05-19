# Fighter Stats Auto-Scoring Plan

작성: 2026-05-18
업데이트: 2026-05-19 (Step B RPC 구현 + dry_run 검증 + raw stat 데이터 공백 발견)
구현 상태: Step A 완료 + Race-condition 버그 수정 + clamp [45, 98] 적용 + Step B RPC 배포 완료 (dry_run=true 검증 통과)

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
