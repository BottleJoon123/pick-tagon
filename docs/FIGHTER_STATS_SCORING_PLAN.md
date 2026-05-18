# Fighter Stats Auto-Scoring Plan

작성: 2026-05-18
구현 상태: Step A 완료 (admin UI 자동 계산 버튼)

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

## 주의사항

- 공식은 근사치. 체급별 편차가 크므로 division baseline 데이터 채워진 후 재검증 권장.
- 현재 fallback baseline은 UFC 전체 기준 추정값으로, 체급별 특성(예: 헤비급 vs 스트로급 slpm 분포)을 반영하지 않는다.
