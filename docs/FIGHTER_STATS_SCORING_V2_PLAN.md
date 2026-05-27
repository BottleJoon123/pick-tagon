# Fighter Stats Scoring V2 — 설계 + Dry-Run 계획
> 작성: 2026-05-28  
> origin/main HEAD: `5b53abb`  
> 조사 방법: Supabase read-only SQL, 코드 정적 분석, 수식 수기 검증  
> **운영 반영 금지** — fighters.stats[] 업데이트 없음. admin_recompute_fighter_stats(false) 호출 없음.  
> 운영 적용 예정: 2026-06-10 배포 이후 (별도 승인 필요)

---

## 1. 배경 및 문제 분석

### 1-1. 사용자 피드백

> "현재 fighter stats[]가 UFCStats raw stat의 상대 비율처럼 보이고, 랭커/챔피언/상위권 파이터의 실제 강함이 충분히 반영되지 않는 느낌"

### 1-2. v1 정량 분석 (2026-05-28 read-only DB 쿼리)

**rank tier별 v1 평균 stats:**

| Tier | n | Striking | Grappling | Stamina | Defense | Speed | Avg Fights |
|---|---|---|---|---|---|---|---|
| champion(0) | 11 | 68.0 | 52.1 | 53.4 | 60.7 | 67.5 | 24.2 |
| top3(1-3) | 33 | 58.8 | 50.7 | 54.7 | 50.2 | 61.5 | 25.3 |
| ranked(4-10) | 78 | 54.4 | 48.9 | 53.8 | 51.2 | 56.9 | 23.8 |
| ranked(11-15) | 58 | 57.4 | 51.4 | 51.6 | 49.3 | 60.6 | 20.9 |
| unranked | 760 | 54.0 | 48.9 | **55.8** | 49.1 | **61.1** | 13.8 |

**핵심 문제점:**

1. **역전 현상**: unranked 평균 Stamina(55.8) > champion(53.4), unranked 평균 Speed(61.1) > ranked(4-10)(56.9)
   → rank가 높을수록 오히려 스탯이 낮은 역전 현상 발생.
2. **champion 차별화 미흡**: champion vs unranked 차이: Striking +14, Grappling +3.2, 그 외 거의 동일.
3. **floor 집중 심각:**

| Stat | floor=45 수 | 비율 |
|---|---|---|
| Grappling | 666 | 75.7% |
| Defense | 606 | 64.5% |
| Stamina | 451 | 48.0% |
| Striking | 400 | 45.5% |
| Speed | 259 | 27.6% |

4. **개별 케이스:**
   - Sean Strickland (MW champion, 31-7): `[60, 45, 45, 52, 63]` ← 평균 이하
   - Islam Makhachev (WW champion, 28-1): `[48, 65, 70, 71, 45]` ← Striking/Speed 최하
   - Ilia Topuria (LW champion, 17-0): `[57, 58, 45, 77, 61]` ← Striking이 unranked 평균 이하

### 1-3. v1 공식의 근본 한계

v1은 **population-relative normalization** — 전체 파이터 분포 대비 상대적 위치만 반영.
보수적/방어적 스타일 파이터(낮은 slpm, 높은 td/grappling 대신 conservative striking)는
기술적으로 우수해도 v1에서 낮은 점수를 받음.
**championship 달성 여부, 커리어 기록, finish rate 등 "강함"의 다른 차원이 전혀 반영되지 않음.**

---

## 2. V2 공식 설계

### 2-1. 설계 철학

V2 = 기술 기반 점수 + 경력 검증 보정

| 레이어 | 목적 |
|---|---|
| **A. Baseline 조정** | floor 집중 해소 — grappling/defense/stamina 분포 개선 |
| **B. Record Confidence** | 저표본 파이터 점수 편향 억제 |
| **C. Prestige Bonus** | 랭킹/챔피언 지위 반영 |
| **D. Finish Rate Supplement** | KO/서브 마무리 능력 반영 |

### 2-2. Baseline 변경 (레이어 A)

| stat | v1 p05 | v1 p95 | v2 p05 | v2 p95 | 변경 이유 |
|---|---|---|---|---|---|
| slpm | 1.5 | 7.5 | 1.5 | 7.5 | 변경 없음 |
| str_acc | 28% | 62% | 28% | **60%** | 소폭 tighten |
| sapm | 1.5 | **6.5** | 1.5 | **5.5** | 과도한 p95 → stamina floor 개선 |
| str_def | **45%** | **76%** | **42%** | **71%** | defense floor 해소 |
| td_avg | 0.0 | **4.5** | 0.0 | **2.8** | **핵심 변경** — grappling 75.7% floor 해소 |
| td_acc | 15% | **70%** | 15% | **65%** | 소폭 tighten |
| td_def | **40%** | **88%** | **38%** | **83%** | defense floor 해소 |
| sub_avg | 0.0 | **2.5** | 0.0 | **1.5** | grappling floor 해소 |
| ko_rate | 0% | **60%** | 0% | **55%** | 소폭 tighten |
| sub_rate | 0% | **35%** | 0% | **30%** | 소폭 tighten |
| dec_rate | **20%** | 80% | **15%** | 80% | lower range 확장 |

**핵심 근거 — td_avg p95 4.5 → 2.8:**
- v1에서 td_avg=1.5인 파이터: n=(1.5/4.5)*100=33 → Grappling floor.
- v2에서 td_avg=1.5인 파이터: n=(1.5/2.8)*100=54 → floor 탈출.
- Islam Makhachev (td_avg=3.1): v1 n=69, v2 n=110 → clamped 100 → Grappling 최상위.

### 2-3. Record Confidence Dampener (레이어 B)

저표본 파이터의 극단 점수를 50 방향으로 수렴.

```
total_fights = wins + losses + draws
confidence:
  >= 10 경기 → 1.00 (dampening 없음)
  >= 5  경기 → 0.85
  >= 2  경기 → 0.70
  <  2  경기 → 0.55

score_dampened = score_raw × confidence + 50 × (1 − confidence)
```

**적용 예시:**
- 0-0 파이터 (ko_rate 미반영, sapm만으로 Stamina=98): conf=0.55 → Stamina = 0.55×98 + 0.45×50 = 76.4
- 15-0 Khamzat Chimaev: conf=1.0 → 변화 없음

### 2-4. Prestige Bonus (레이어 C)

랭킹/챔피언 지위를 점수에 반영.

```
rank=0 (champion):    각 stat에 +8, 최소 점수(prestige floor)=62
rank=1~3:             +5, floor=56
rank=4~10:            +3, floor=50
rank=11~15:           +1, floor=47
rank=null 또는 >15:   +0, floor=45 (v1과 동일)
```

**prestige floor 작동 방식:**
- champion Sean Strickland의 Grappling: raw=45 + bonus=8 = 53 → floor=62로 lift → 62
- champion Tom Aspinall의 Striking: raw=98 + bonus=8 = 106 → clamped=98

### 2-5. Finish Rate Supplement (레이어 D)

```
ko_rate > 60%:  Speed += 3
sub_rate > 30%: Grappling += 3
```

마무리 능력이 강한 파이터에게 해당 stat 소폭 추가 보너스. prestige 적용 후, clamp 전.

### 2-6. 최종 clamp

```
final_stat = max(prestige_floor, min(98, score))
```

v2 ceiling은 v1과 동일하게 98.

---

## 3. Notable Fighter V2 예측 비교

> 수식 수기 검증 결과 (실행 전 예측치). 실제 스크립트 실행 시 미세 차이 가능.

### 3-1. Champions (rank=0)

| 파이터 | Div | W-L | v1 stats | v2 예측 | 주요 변화 |
|---|---|---|---|---|---|
| **Sean Strickland** | mw | 31-7 | [60, 45, 45, 52, 63] | **[69, 62, 62, 72, 74]** | prestige floor: Grappling/Stamina → 62 |
| **Ilia Topuria** | lw | 17-0 | [57, 58, 45, 77, 61] | **[67, 89, 62, 94, 72]** | sub bonus: Grappling+3, prestige: Defense 94 |
| **Islam Makhachev** | ww | 28-1 | [48, 65, 70, 71, 45] | **[62, 98, 81, 88, 62]** | td_avg baseline fix → Grappling 98, sub bonus |
| **Joshua Van** | flw | 17-2 | [93, 45, 45, 54, 92] | **[98, 62, 62, 74, 98]** | prestige floor lifts Grappling/Stamina |
| **Tom Aspinall** | hw | 15-3 | [98, 72, 45, 61, 98] | **[98, 80, 62, 70, 98]** | td_avg baseline→Grappling↑, prestige floor→Stamina 62 |
| **Carlos Ulberg** | lhw | 15-1 | [82, 45, 45, 49, 89] | **[90, 62, 62, 60, 97]** | prestige floor, ko bonus (ko_rate=67%) |
| **Petr Yan** | bw | 20-5 | [68, 45, 54, 65, 64] | **[76, 62, 62, 73, 72]** | prestige floor: Grappling→62 |
| **Alexander Volkanovski** | fw | 28-4 | [80, 45, 54, 48, 78] | **[88, 62, 62, 62, 86]** | prestige floor: Grappling/Defense↑ |

### 3-2. Top Contender

| 파이터 | Div | Rank | W-L | v1 stats | v2 예측 | 주요 변화 |
|---|---|---|---|---|---|---|
| **Khamzat Chimaev** | mw | 1 | 15-0 | [57, 84, 45, 53, 59] | **[65, 98, 56, 66, 68]** | td_avg baseline → Grappling 98, sub bonus |

### 3-3. Unranked Legend

| 파이터 | Div | Rank | W-L | v1 stats | v2 예측 | 주요 변화 |
|---|---|---|---|---|---|---|
| **Jon Jones** | hw | null | 28-1 | [66, 45, 62, 77, 64] | **[69, 58, 62, 86, 68]** | td_avg baseline → Grappling 45→58, defense 77→86 |

*Jon Jones rank=null → prestige 없음. baseline 개선만 반영.*

### 3-4. Unranked Low-Sample (confidence dampener 시연)

| 파이터 | Div | W-L | v1 stats (inflated) | v2 예측 | 주요 변화 |
|---|---|---|---|---|---|
| **JJ Okanovich** | lw | 0-0 | [86, 45, 91, 50, 98] | **~[71, 45, 76, 50, 88]** | conf=0.55 → 극단값 50 방향 수렴 |

*Stamina=91 (v1): 극소수 경기 dec_rate 편향 → v2에서 conf=0.55로 수렴.*

---

## 4. Grappling Floor 개선 예측

| 항목 | v1 | v2 예측 | 개선 |
|---|---|---|---|
| Grappling floor=45 수 | 666 (75.7%) | ~300~350 (32~37%) | ~-320 |

**근거:**
- td_avg=0: Grappling baseline 무관, floor 유지 (그래플링 전혀 안 하는 파이터)
- td_avg=0.5~1.0: v1 n=11~22 → floor. v2 n=18~36 → 여전히 낮지만 td_acc/sub_avg 조합으로 개선 가능
- td_avg=1.5: v1 n=33 → floor. v2 n=54 → floor 탈출
- td_avg=2.0+: v1에서 floor였던 다수가 v2에서 유의미한 점수로 분포

챔피언/랭커는 prestige floor(56~62)로 Grappling이 자동으로 floor 탈출.

---

## 5. 의심 출력 예상 케이스

| 케이스 | 예시 | 상황 | 검토 사항 |
|---|---|---|---|
| Striking/Speed ceiling(98) 도달 | Iwo Baraniewski (slpm=15.77) | 이상값 raw stat → 98 | 소수 경기 편향, UX 이슈 없음 |
| Grappling+sub 보너스 중복 | Makhachev, Chimaev | sub_rate>30% + td_avg 상승 → Grappling 매우 높음 | 의도된 결과 — 실제 최상위 그래플러 |
| Stamina↓ for active finishers | Topuria (dec_rate<p05) | ko 파이터의 dec_rate=11.76% < v2 p05=15% → 0 기여 → Stamina 낮음 → prestige floor 62로 lift | floor가 보정하므로 blocking 없음 |
| rank=null 레전드 | Jon Jones | prestige 없음 → 랭커보다 낮을 수 있음 | 의도된 설계: 현역 활동 기준 |

---

## 6. Dry-Run Script

### 6-1. 파일 위치

`scripts/dry_run_fighter_stats_v2.py`

### 6-2. 실행 방법

```bash
# 기본 실행 (reports/ 디렉터리에 markdown 리포트 생성)
python scripts/dry_run_fighter_stats_v2.py

# notable 파이터만 콘솔 출력
python scripts/dry_run_fighter_stats_v2.py --notable-only

# 출력 경로 지정
python scripts/dry_run_fighter_stats_v2.py --out reports/v2_dry_run.md
```

**환경 변수 설정 (.env.local 또는 shell):**
```
SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
# 또는
VITE_SUPABASE_URL=https://rnnrimzrypayvnmznpin.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

스크립트는 `.env.local` 자동 로드 지원 (dotenv 라이브러리 불필요).

### 6-3. 출력 파일

- `reports/v2_dry_run_YYYYMMDD_HHMM.md` (gitignore — 커밋 불필요)
- 포함 내용:
  - total fighters analyzed, ranked/champion count
  - rank tier별 v1/v2 평균 비교
  - notable fighter 비교표
  - top 30 biggest increases / decreases
  - grappling floor 개선 통계
  - 의심 출력 목록

### 6-4. DB Write 없음 확인

스크립트 내 HTTP 요청: **GET 전용**
- `paginate()` → `requests.get()` 만 사용
- `PATCH`, `POST`, `DELETE` 없음
- `admin_recompute_fighter_stats()` 미호출
- `fighters.stats[]` 미변경

---

## 7. 운영 반영 절차 (2026-06-10 배포 후)

### Step 1 — Dry-Run Review

```bash
python scripts/dry_run_fighter_stats_v2.py
```

결과 검토 항목:
- [ ] grappling floor 수가 목표 수준으로 감소했는가
- [ ] champion/top3 평균 stats가 unranked보다 유의미하게 높은가
- [ ] 의심 출력 목록에서 실제 blocking 이슈가 있는가
- [ ] notable 10명의 v2 점수가 경기 실적과 합리적으로 일치하는가

### Step 2 — 수동 승인

Dry-Run 결과를 기반으로 아래 승인 문구로 운영 반영을 요청:

```
Fighter Stats V2 운영 반영 승인 요청

dry-run 검토 완료:
- grappling floor: __ → __ (목표 <40% 달성 여부)
- champion avg 전 stat이 unranked avg 초과 여부
- notable 10명 v2 검증 완료

승인하시면 admin_recompute_fighter_stats SQL (v2 공식 적용)을 실행합니다.
```

### Step 3 — 공식 DB SQL 작성

현재 `admin_recompute_fighter_stats` RPC는 v1 공식 하드코딩.
v2 적용을 위해 새 RPC 또는 SQL이 필요:
- Option A: 새 RPC `admin_recompute_fighter_stats_v2(p_dry_run)` migration 작성
- Option B: `admin_recompute_fighter_stats` 내 공식 업데이트 (기존 RPC 교체)

**→ 어느 옵션이든 migration 작성은 별도 작업으로 진행 (이번 단계에서 금지)**

### Step 4 — Staging 검증 (선택)

가능하면 Supabase branch 또는 staging 환경에서 먼저 검증.

### Step 5 — 운영 Apply

```sql
-- v2 공식 UPDATE SQL (Step 3에서 작성 예정)
-- admin_recompute_fighter_stats_v2(p_dry_run := false)
```

### Step 6 — Rollback Plan

v2 적용 직전 `fighters.stats[]` 전체 스냅샷 확보:

```sql
-- Apply 전 백업 (별도 테이블 또는 admin_audit_logs)
INSERT INTO admin_audit_logs (action, entity_table, before_data, metadata)
SELECT 'stats_v2_backup', 'fighters', jsonb_build_object('stats', stats, 'id', id),
       jsonb_build_object('v', 'v2_backup_pre', 'ts', NOW())
FROM fighters
WHERE stats IS NOT NULL;
```

롤백 시:
```sql
-- 백업에서 복원 (별도 승인 필요)
UPDATE fighters f
SET stats = (
  SELECT (al.before_data->>'stats')::jsonb
  FROM admin_audit_logs al
  WHERE al.entity_table = 'fighters'
    AND al.metadata->>'v' = 'v2_backup_pre'
    AND (al.before_data->>'id') = f.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM admin_audit_logs al
  WHERE al.entity_table = 'fighters'
    AND al.metadata->>'v' = 'v2_backup_pre'
    AND (al.before_data->>'id') = f.id
);
```

---

## 8. 이번 단계 제약 확인

| 항목 | 상태 |
|---|---|
| fighters.stats[] 업데이트 | ✅ 미실행 |
| admin_recompute_fighter_stats(false) | ✅ 미호출 |
| DB write / PATCH / DELETE | ✅ 없음 |
| Migration 생성 | ✅ 없음 |
| 앱 화면 scoring 연결 | ✅ 없음 |
| 대량 CSV 커밋 | ✅ reports/ gitignore 추가 |

---

## 9. 관련 문서 / 파일

| 파일 | 역할 |
|---|---|
| `docs/FIGHTER_STATS_SCORING_PLAN.md` | v1 공식 + staging apply 이력 |
| `scripts/dry_run_fighter_stats_v2.py` | 이번 dry-run 스크립트 |
| `public/js/admin.js` lines 471~529 | v1 공식 JS 구현 (`computeStatsFromPerf`) |
| `supabase/migrations/20260519_admin_recompute_fighter_stats.sql` | v1 RPC |
| `reports/v2_dry_run_*.md` | 스크립트 실행 출력 (gitignore) |
