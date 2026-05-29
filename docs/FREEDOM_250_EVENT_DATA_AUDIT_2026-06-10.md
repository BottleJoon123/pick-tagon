# UFC Freedom 250 — Event Data Readiness Audit

> 작성일: 2026-05-29  
> Release-Prep-20A (read-only audit)  
> 감사 기준: Pick-tagon 대진표/픽슬립/Stats/Analysis 정상 동작 여부

---

## 1. Event Row

| 항목 | 값 | 판정 |
|---|---|---|
| id | `bf300955-a088-4789-b73c-3ec99effe3d3` | ✅ PASS |
| title | `UFC FREEDOM 250` | ✅ PASS |
| event_date | `2026-06-15 00:00:00+00` | ✅ PASS |
| status | `upcoming` | ✅ PASS |
| picks_locked_at | `NULL` (미설정) | ✅ PASS |
| venue | `NULL` | ⚠️ WARN — 사이드바/홈 venue 표시 공란 |

---

## 2. Matchup 데이터 품질 표

총 7경기, 전부 `card_segment = 'main'`, `result_status = 'scheduled'`

| sort | 경기 | weight_class | fighter_id 존재 | 이미지(card) | left_bias | 판정 |
|---|---|---|---|---|---|---|
| 1 | **Ilia Topuria vs Justin Gaethje** | lw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 2 | **Alex Pereira vs Ciryl Gane** | hw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 3 | **Sean O'Malley vs Aiemann Zahabi** | bw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 4 | **Josh Hokit vs Derrick Lewis** | hw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 5 | **Mauricio Ruffy vs Michael Chandler** | lw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 6 | **Bo Nickal vs Kyle Daukaus** | mw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |
| 7 | **Diego Lopes vs Steve Garcia** | fw | ✅ 양쪽 | ✅ 양쪽 | 0.5 | ⚠️ WARN |

**WARN 공통 원인: 전 경기 `left_bias = 0.5`** → 아래 §4 상세 분석 참조

---

## 3. Fighter DB 데이터 품질 표

| 선수명 | DB 존재 | W-L-D | stats JSONB | raw stats | height | reach | style | 판정 |
|---|---|---|---|---|---|---|---|---|
| Ilia Topuria | ✅ | 17-0-0 | ✅ | ✅ | 170cm | `—` (문자열) | all-around | ⚠️ |
| Justin Gaethje | ✅ | 27-5-0 | ✅ | ✅ | 180cm | 178cm | null | ⚠️ |
| Alex Pereira | ✅ | 13-3-0 | ✅ | ✅ | 193cm | 201cm | null | ⚠️ |
| Ciryl Gane | ✅ | 13-2-0 | ✅ | ✅ | 193cm | 206cm | null | ⚠️ |
| Sean O'Malley | ✅ | 19-3-0 | ✅ | ✅ | 180cm | 183cm | null | ⚠️ |
| Aiemann Zahabi | ✅ | 14-2-0 | ✅ | ✅ | **null** | **null** | null | ⚠️ |
| Josh Hokit | ✅ | 9-0-0 | ✅ | ✅ | 185cm | 187cm | null | ⚠️ |
| Derrick Lewis | ✅ | 29-13-0 | ✅ | ✅ | 191cm | 201cm | null | ✅ |
| Mauricio Ruffy | ✅ | 13-2-0 | ✅ | ✅ | **null** | **null** | null | ⚠️ |
| Michael Chandler | ✅ | 23-10-0 | ✅ | ✅ | 173cm | 182cm | null | ⚠️ |
| Bo Nickal | ✅ | 8-1-0 | ✅ | ✅ | 185cm | 193cm | null | ✅ |
| Kyle Daukaus | ✅ | 17-4-0 | ✅ | ✅ | 188cm | 193cm | null | ✅ |
| Diego Lopes | ✅ | 27-8-0 | ✅ | ✅ | 180cm | 184cm | null | ✅ |
| Steve Garcia | ✅ | 19-5-0 | ✅ | ✅ | 183cm | 191cm | null | ✅ |

---

## 4. 핵심 이슈 상세

### 4-A. `left_bias = 0.5` — 전 경기 균등 배당 ⚠️ WARN

**현상:**  
`matchups` 테이블에 독립 `odds` 컬럼 없음. `left_bias`가 픽 슬립 odds의 원천.  
`left_bias = 0.5` → `f1.odds = null`, `f2.odds = null` (fetchUpcomingMatchups 변환 결과).

**UI 영향:**
| 영향 위치 | 현상 |
|---|---|
| 파이터 카드 odds 표시 | "ODDS X.X · +XXXP" 대신 **"TAP TO PICK ›"** 표시 |
| 픽 슬립 odds | `fight.f1.odds \|\| 1.9` fallback → **1.9 고정** |
| 픽 슬립 payout | 100P 베팅 → 190P 고정 (양 파이터 동일) |
| upset 보너스 | `isUpset = odds >= 2.0` → 1.9이므로 **업셋 없음** |
| 카드 glow border | `leftBias > 0.65` 조건 미충족 → **중립 테두리** |

**판단:** 픽 기능 자체는 동작하나 (1.9 fallback), 스포츠 예측 UX에서 확률 정보가 없어 몰입도 저하. **출시 전 최소 메인 이벤트 3경기는 실제 left_bias 설정 권장.**

**수정 방법:** Admin UI → 매치업 편집 → `left_bias` 수치 입력 (0~1 범위, 0.3 = 레드 70% 파이팟, 0.7 = 블루 70% 파이팟)  
예시: Topuria vs Gaethje → Topuria 약 -350 → left_bias ≈ 0.25 (레드 강세)

---

### 4-B. 카드 세그먼트 구성 — 전부 'main', prelim 없음 ⚠️ WARN

| 이벤트 | main | prelim | early_prelim |
|---|---|---|---|
| UFC FN 277 | 6 | 7 | 0 |
| **UFC FREEDOM 250** | **7** | **0** | **0** |

**영향:**  
- 렌더링 문제 없음 (7경기 모두 MAIN EVENT 태그 체계로 정상 표시)
- `sort_order 1` = MAIN EVENT, `sort_order 2` = CO-MAIN EVENT, `sort_order 3-7` = 태그 없음 (빈 문자열)
- 출시 전 prelim 매치업이 확정되면 추가 필요

**수정 방법:** Admin → 매치업 추가 (`card_segment = 'prelim'` or `'early_prelim'`)

---

### 4-C. 선수 height/reach 누락 ⚠️ WARN

| 선수 | 누락 항목 |
|---|---|
| Aiemann Zahabi | height, reach, style |
| Mauricio Ruffy | height, reach, style |
| Ilia Topuria | reach = `"—"` (빈 문자열 취급) |
| 나머지 11명 | style = null |

**UI 영향:**  
- Stats/Analysis 탭의 신체 스펙 표시: `—` 또는 공란
- 레이더 차트는 raw stats 기반이라 **영향 없음** ✅
- Pick slip / 픽 기능 **영향 없음** ✅

**수정 방법:** Admin → 파이터 편집 → height/reach 입력  
`style` null은 파이터 카드에 style 배지가 없는 것으로 처리 (현재 UI에서 무해)

---

### 4-D. venue = NULL ⚠️ WARN (낮음)

현재 UI에서 venue를 사용하는 위치 없음 → **실질 영향 없음**. 추후 이벤트 상세 표시 시 공란.

---

### 4-E. Freedom 250 노출 경로 — 멀티 이벤트 UI 보류 상태 ⚠️ WARN (운영)

**현재 `fetchUpcomingMatchups()` 로직:**
```js
event = allEvRes.data.find(e => e.status === 'upcoming');  // 첫 번째만
```

**2026-05-30 (UFC FN 277 당일) 이후 흐름:**

| 단계 | 동작 |
|---|---|
| FN277 진행 중 | status=upcoming → FN277이 대진표 표시 |
| 경기 후 admin이 FN277 settle/archive | status→'archived' |
| 다음 fetchUpcomingMatchups() 호출 | Freedom 250이 자동으로 첫 upcoming → **대진표 자동 교체** ✅ |

**Freedom 250이 대진표에 노출되려면 FN277이 먼저 archived 상태여야 한다.**  
멀티 이벤트 UI(19A, 출시 후 보류) 없이도 FN277 종료 → Freedom 250 자동 전환이 작동함.

**운영 액션:** FN277 종료 후 Admin에서 신속하게 settle/archive 처리.

---

## 5. 전체 PASS/WARN/FAIL 요약

| 항목 | 상태 | 세부 |
|---|---|---|
| Event row 기본 정보 | ✅ PASS | id/title/date/status 모두 정상 |
| picks_locked_at | ✅ PASS | NULL (미마감), 출시 전 운영 시 설정 필요 |
| 매치업 7경기 등록 | ✅ PASS | sort_order 1-7 순차적, result_status=scheduled |
| fighter_id → fighters DB | ✅ PASS | 14/14명 모두 존재 |
| fighters raw stats | ✅ PASS | 14/14명 slpm/str_acc 등 보유 |
| fighters stats JSONB | ✅ PASS | 14/14명 보유 |
| fighters W-L-D | ✅ PASS | 14/14명 보유 |
| 카드 이미지 (matchup) | ✅ PASS | 14/14 red_image_url, blue_image_url 존재 |
| 파이터 프로필 이미지 | ✅ PASS | 14/14 image_url 존재 |
| 픽 슬립 기본 동작 | ✅ PASS | 1.9 fallback으로 픽/포인트 정상 작동 |
| **left_bias 실제 배당** | **⚠️ WARN** | 전 경기 0.5 → 실제 odds 미반영 |
| **prelim 매치업** | **⚠️ WARN** | 0개 — 출시 전 추가 권장 |
| Zahabi/Ruffy height/reach | **⚠️ WARN** | Stats 표시 공란 |
| Topuria reach | **⚠️ WARN** | "—" 문자열 |
| style 필드 | **⚠️ WARN** | 1명(Topuria) 제외 전부 null |
| venue | **⚠️ WARN (낮음)** | NULL, 현재 UI 영향 없음 |
| Freedom 250 노출 타이밍 | **⚠️ WARN (운영)** | FN277 archive 이후 자동 표시 |
| **FAIL 항목** | **없음** | |

---

## 6. 출시 전 수정 필요 체크리스트

### P1 — 권장 (픽 UX 영향)

| # | 항목 | 수정 방법 | 난이도 |
|---|---|---|---|
| 1 | **main 3경기 이상 left_bias 실제 배당 입력** | Admin → 매치업 편집 → left_bias | 쉬움 |
| 2 | **Aiemann Zahabi height/reach 입력** | Admin → 파이터 편집 | 쉬움 |
| 3 | **Mauricio Ruffy height/reach 입력** | Admin → 파이터 편집 | 쉬움 |
| 4 | **Ilia Topuria reach `"—"` → 실제 수치로 수정** | Admin → 파이터 편집 | 쉬움 |

### P2 — 선택 (이벤트 완성도)

| # | 항목 | 수정 방법 | 난이도 |
|---|---|---|---|
| 5 | 확정된 prelim 매치업 추가 | Admin → 매치업 추가 | 중간 (경기별) |
| 6 | venue 입력 (예: "T-Mobile Arena, Las Vegas") | Admin → 이벤트 편집 | 쉬움 |
| 7 | style 필드 주요 선수 입력 | Admin → 파이터 편집 | 쉬움 |

### 운영 — FN277 종료 후 즉시

| # | 항목 | 타이밍 |
|---|---|---|
| O-1 | FN277 경기 결과 입력 후 settle | 2026-05-30 경기 종료 직후 |
| O-2 | FN277 archive → Freedom 250 자동 노출 확인 | settle 완료 후 |
| O-3 | Freedom 250 countdown 정상 표시 확인 | 노출 확인 후 |
| O-4 | Freedom 250 picks_locked_at 설정 (이벤트 당일 직전) | 2026-06-15 이전 |

---

## 7. left_bias 입력 가이드

`left_bias` = 레드 코너(red, 왼쪽 파이터) 승리 확률 추정치 (0~1)

| left_bias | 의미 | 적용 예 |
|---|---|---|
| 0.25 | 레드 75% 강세 (레드 heavy favorite) | Topuria vs Gaethje (Topuria ~-350) |
| 0.35 | 레드 65% 우세 | O'Malley vs Zahabi |
| 0.5 | 균등 (현재 기본값) | 정보 없을 때 |
| 0.65 | 블루 65% 우세 | |
| 0.75 | 블루 75% 강세 | |

`left_bias` → 픽 슬립 내 odds 변환은 현재 미구현 (f1.odds=null).  
**현재 fallback 1.9 고정**이므로 left_bias 값 자체가 픽 슬립 payout에 영향 없음.  
→ left_bias는 카드 **비주얼 기울기(glow 색상/방향)**에만 영향.  
→ 실제 odds-based payout 구현은 19A 이후 별도 기획 필요.

---

## 8. 결론

**UFC FREEDOM 250은 기능적으로 픽 가능한 상태다.**

- 픽 슬립, 포인트 차감/지급, place_pick RPC 모두 정상 작동 예상 ✅
- 모든 파이터가 DB에 존재하고 stats 데이터 완비 ✅
- 카드 이미지 모두 존재 ✅

**단, 아래 2가지는 출시 전 처리 권장:**
1. main 경기 `left_bias` 실제 배당 입력 (현재 모두 1.9 fallback으로 업셋 없음)
2. Zahabi, Ruffy height/reach, Topuria reach 수정 (Stats 탭 공란)

**Freedom 250 대진표 노출 타이밍:**  
FN277(05/30) archive 완료 직후 자동 전환 — 멀티 이벤트 UI 없이도 운영 가능.

---

## 9. 관련 문서

| 문서 | 내용 |
|---|---|
| [`docs/MULTI_EVENT_PICKER_PLAN_2026-06-10.md`](MULTI_EVENT_PICKER_PLAN_2026-06-10.md) | 멀티 이벤트 UI 설계 (출시 후 P1) |
| [`docs/ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md) | FN277 정산 리허설 |
| [`docs/RELEASE_FIX_CLOSEOUT_2026-05-26.md`](RELEASE_FIX_CLOSEOUT_2026-05-26.md) | Release gate 현황 |
