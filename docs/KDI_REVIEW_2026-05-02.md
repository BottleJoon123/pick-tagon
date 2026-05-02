# KDI Data Review — 2026-05-02

**조사일:** 2026-05-02  
**공식 결과 반영 업데이트:** 2026-05-02  
**대상:** KDI-01, KDI-02 (docs/QA_RUN_2026-05-02.md Known Data Issues 섹션)  
**방법:** Supabase MCP execute_sql — 조회 전용, 수정 없음

---

## 공식 결과 출처

| 경기 | 출처 |
|---|---|
| Castaneda vs Vologdin | UFC official event page — UFC Fight Night 273 scorecards (29-27, 28-28, 28-28 → Majority Draw) |
| Talita Alencar vs Julia Polastri | UFC official event page — UFC Fight Night 274 scorecards (29-28, 29-28, 29-28 → Talita Alencar UD), ESPN FightCenter, UFC post-fight interview with Talita Alencar |

---

## 1. 조사 기준

- 실제 DB row 상태를 조회해 데이터 불일치 원인을 파악한다.
- 어떤 row를 정답으로 볼지, 어떤 조치가 안전한지 판단 근거를 제시한다.
- 이미 완료된 pick 정산(`repair_orphan_pending_picks.sql`)과 충돌 여부를 확인한다.
- 수정 여부는 이 문서를 바탕으로 별도 승인 후 진행한다.

---

## 2. KDI-01 현재 DB 상태

**matchup `248de009`**

| 필드 | 현재 값 | 공식 결과 | 상태 |
|---|---|---|---|
| id | `248de009-b232-44cf-9750-9cb15b92c708` | — | — |
| event | UFC Fight Night 273 - Burns vs. Malott (`settled`) | — | — |
| red_fighter_name | JohnCastaneda | — | — |
| blue_fighter_name | MarkVologdin | — | — |
| weight_class | lhw | — | — |
| card_segment | prelim, sort_order=9 | — | — |
| **result_status** | `completed` | `draw` | ❌ 불일치 |
| **result_winner** | `JohnCastaneda` | `NULL` | ❌ 불일치 |
| **result_winner_side** | `red` | `NULL` | ❌ 불일치 |
| **result_method** | `NC` | `MD` (Majority Draw) | ❌ 불일치 |
| result_round | 3 | 3 | ✅ |
| result_time | 5:00 | 5:00 | ✅ |
| settled_at | 2026-04-26 13:50:36 | — | — |

**공식 결과:** Majority Draw (29-27, 28-28, 28-28)

**불일치 구조 (재분석):**
- 입력자가 `result_method=NC`를 입력했으나 이는 오기입. 실제는 MD(Majority Draw).
- `result_status=completed`에 `result_winner=JohnCastaneda`가 같이 입력됐지만 draw이므로 승자 없음.
- 모든 핵심 필드(status/winner/winner_side/method)가 잘못 입력됨.

**현재 프로젝트 result_status 컨벤션:**

| 값 | 의미 |
|---|---|
| `completed` | 승자 있는 경기 |
| `no_contest` | NC 무효 경기 |
| `scheduled` | 미결 |
| **`draw`** | **현재 미존재 — 신규 추가 필요** |

현재 DB에는 `draw` result_status가 없으므로, 수정 전 서비스 코드/프론트에서 `draw` 처리 여부를 확인해야 한다.

---

## 3. KDI-01 영향받는 Picks

| pick_id | user | pick_name | predicted_side | status | settled_payout | 현재 정산 | draw 기준 정산 |
|---|---|---|---|---|---|---|---|
| 66 | KINGBOTTLE | MarkVologdin | blue | **cancelled** | 0 | cancel+환급 (+100pts) | draw → cancel+환급 ✅ |

**pick 66 재정산 필요 없음:**
- draw 경기에서 픽은 통상 무효(cancel+환급) 처리
- 현재 pick 66은 이미 cancelled, bet_cost=100 환급 완료
- 정산 결과는 공식 결과(draw)와 일치 → **재정산 불필요**

---

## 4. KDI-01 가능한 조치 옵션

### 옵션 A — result_status='draw'로 전면 수정 (권장)

```sql
UPDATE public.matchups
SET
    result_status      = 'draw',
    result_winner      = NULL,
    result_winner_side = NULL,
    result_method      = 'MD'
WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
```

| | 내용 |
|---|---|
| **장점** | 공식 결과(Majority Draw) 반영. 모든 필드 정합. |
| **단점** | `draw` result_status가 현재 DB에 없음 → 프론트/서비스 코드에서 `draw` 처리 로직 확인 필요. |
| **pick 영향** | 없음 — pick 66 already cancelled (draw 기준 정산과 일치). |
| **리스크** | 낮음. 단, 프론트 `draw` 렌더링 여부 사전 확인 권장. |
| **사전 조건** | `result_status='draw'`를 프론트/admin이 올바르게 표시하는지 확인. |

### 옵션 B — result_status='no_contest'로 수정 (차선)

```sql
UPDATE public.matchups
SET
    result_status      = 'no_contest',
    result_winner      = NULL,
    result_winner_side = NULL,
    result_method      = 'NC'
WHERE id = '248de009-b232-44cf-9750-9cb15b92c708';
```

| | 내용 |
|---|---|
| **장점** | 기존 no_contest 컨벤션 활용, 프론트 처리 이미 있음. pick 66 cancel 처리와 일치. |
| **단점** | 실제 결과가 draw인데 no_contest로 표기 → 기록상 부정확. |
| **pick 영향** | 없음. |
| **리스크** | 매우 낮음. 단, 데이터 정확성 희생. |

### 옵션 C — 현 상태 유지

| | 내용 |
|---|---|
| **장점** | 추가 수정 없음. |
| **단점** | result_status=completed + winner=JohnCastaneda가 남음 → 공식 결과와 완전히 다름. |

---

## 5. KDI-02 현재 DB 상태

**UFC 274 — TalitaAlencar vs JuliaPolastri 중복 matchup**

**공식 결과:** Talita Alencar Unanimous Decision 승 (29-28, 29-28, 29-28)

### Matchup A — `3006a883` (canonical, 픽 연결됨)

| 필드 | 현재 값 | 공식 결과 | 상태 |
|---|---|---|---|
| id | `3006a883-feb5-423f-ae84-d44aa45771ee` | — | — |
| red_fighter_name | `TalitaAlencar` | Talita Alencar | (공백 없는 형식) |
| blue_fighter_name | `JuliaPolastri` | Julia Polastri | (공백 없는 형식) |
| sort_order | 1 | — | 원본 row |
| **result_status** | `no_contest` | `completed` | ❌ 불일치 |
| **result_winner** | `null` | `TalitaAlencar` | ❌ 불일치 |
| **result_winner_side** | `null` | `red` | ❌ 불일치 |
| **result_method** | `NC` | `UD` | ❌ 불일치 |
| result_round | 3 | 3 | ✅ |
| result_time | 5:00 | 5:00 | ✅ |
| settled_at | 2026-04-28 10:12:57 | — | — |

### Matchup B — `500d5fd1` (orphan, 픽 없음)

| 필드 | 현재 값 | 공식 결과 | 상태 |
|---|---|---|---|
| id | `500d5fd1-b477-4563-9055-919f7d924f97` | — | — |
| red_fighter_name | `Talita Alencar` | — | 공백 있는 형식 |
| blue_fighter_name | `Julia Polastri` | — | 공백 있는 형식 |
| sort_order | 7 | — | 나중에 추가된 row |
| result_status | `completed` | — | 공식 결과와 일치 |
| result_winner | `Talita Alencar` | — | 공식 결과와 일치 |
| result_method | `UD` | — | 공식 결과와 일치 |
| **연결 picks** | **없음** | — | orphan |

---

## 6. KDI-02 영향받는 Picks / Community Data

### Matchup A (`3006a883`)에 연결된 picks

| pick_id | user | pick_name | side | 현재 status | settled_payout | 공식 결과 기준 |
|---|---|---|---|---|---|---|
| 71 | KINGBOTTLE | TalitaAlencar | red | **cancelled** | 0 | **WIN 재정산 필요** → payout 지급 |
| 75 | KINGBOTTLE | JuliaPolastri | blue | **cancelled** | 0 | **LOSE로 변경 필요** → 환급 회수 |

### Matchup B (`500d5fd1`)에 연결된 picks

없음 — 0건

### event_picks

| fight_id | user | fighter_index | 비고 |
|---|---|---|---|
| `3006a883` | KINGBOTTLE | 1 (JuliaPolastri/blue) | — |
| `500d5fd1` | — | — | 없음 |

**pick 71/75 공식 결과 기준 재정산 영향:**

| pick_id | 현재 | 공식 기준 변경 | points 영향 |
|---|---|---|---|
| 71 | cancelled (환급 +100) | → **win** (payout 지급) | +payout (현재 payout=0으로 초기화됨, 원래 값 확인 필요) |
| 75 | cancelled (환급 +100) | → **lose** | 환급받은 100 회수 필요 (-100) |

> **주의:** pick 71의 `payout` 컬럼은 `repair_orphan_pending_picks.sql`에서 변경되지 않았으나, pick 71은 해당 migration 대상이 아님. pick 71의 원래 payout 값은 `service_settle_matchup`이 NC 처리하면서 0으로 설정됐을 가능성 있음 — 재정산 전 원래 base_payout 확인 필요.

---

## 7. KDI-02 가능한 조치 옵션

### 옵션 A — Matchup A 결과 수정 + Matchup B 삭제 (권장)

**Step 1: Matchup A 공식 결과로 수정**
```sql
UPDATE public.matchups
SET
    result_status      = 'completed',
    result_winner      = 'TalitaAlencar',
    result_winner_side = 'red',
    result_method      = 'UD'
WHERE id = '3006a883-feb5-423f-ae84-d44aa45771ee';
```

**Step 2: Matchup B 삭제 (연결 데이터 없음)**
```sql
DELETE FROM public.matchups
WHERE id = '500d5fd1-b477-4563-9055-919f7d924f97';
```

**Step 3: pick 71 WIN 재정산 (별도 결정 필요)**
- TalitaAlencar를 선택한 pick 71 → WIN 처리
- 원래 base_payout 확인 후 settled_payout 설정, KINGBOTTLE points 지급

**Step 4: pick 75 LOSE 처리 + 환급 회수 (별도 결정 필요)**
- JuliaPolastri를 선택한 pick 75 → LOSE
- 현재 cancelled(환급 +100) 상태에서 LOSE로 변경 시 100pts 회수 필요

| | 내용 |
|---|---|
| **장점** | 공식 결과 완전 반영. Matchup A가 canonical row로 유지됨. 중복 제거. |
| **단점** | pick 71/75 재정산 필요 — KINGBOTTLE points 조정 복잡. pick 71 원래 payout 값 확인 필요. |
| **리스크** | 중간 — pick 재정산이 동반되므로 별도 검토 후 진행. |

### 옵션 B — Matchup B만 삭제, Matchup A 결과 수정, 픽 재정산 생략

pick 71/75는 over-refund/under-refund 상태를 감수하고 그대로 두는 방식.

| | 내용 |
|---|---|
| **장점** | matchup 데이터 정리 가능, pick 재정산 작업 생략. |
| **단점** | pick 71(WIN이어야 함)이 cancelled로 남음 — KINGBOTTLE이 이긴 픽의 포인트를 못 받음. |
| **리스크** | 낮음. 단, 데이터 정확성 희생. |

### 옵션 C — 둘 다 유지, 표시만 조정

| | 내용 |
|---|---|
| **장점** | 추가 수정 없음. |
| **단점** | 대진표 중복 노출 지속. |

---

## 8. 추천 조치

### KDI-01 추천: **옵션 A — result_status='draw' 수정**

- 공식 결과: Majority Draw (29-27, 28-28, 28-28)
- `result_status='draw'`, `result_method='MD'`, `result_winner=NULL`, `result_winner_side=NULL`
- pick 66은 재정산 불필요 (cancelled = draw 기준과 일치)
- **사전 확인 필요:** 프론트/admin이 `draw` status를 올바르게 렌더링하는지

### KDI-02 추천: **옵션 A — Matchup A 수정 + Matchup B 삭제 + pick 재정산**

- 공식 결과: Talita Alencar UD 승 (29-28, 29-28, 29-28)
- Matchup A(`3006a883`) → completed, winner=TalitaAlencar(red), UD 수정
- Matchup B(`500d5fd1`) → 삭제 (연결 데이터 없음, 안전)
- pick 71 → WIN 재정산 (KINGBOTTLE, TalitaAlencar 선택, 이겼으므로 payout 지급)
- pick 75 → LOSE 처리 + 환급 100pts 회수 (KINGBOTTLE, JuliaPolastri 선택, 졌으므로)
- **pick 재정산은 별도 migration으로 분리하여 진행 권장**

---

## 9. 수정 전 반드시 승인받아야 할 결정사항

### KDI-01

- [ ] **`draw` result_status 신규 도입 승인** — 프론트/admin에서 draw 표시 처리 필요 여부 확인
- [ ] **result_method 컨벤션 확정** — `'MD'` vs `'Decision - Majority'` 중 선택
- [ ] pick 66 재정산 불필요 확인 ✅ (draw → cancel 일치)

### KDI-02

- [ ] **Matchup A 결과 수정 승인** — `3006a883` no_contest → completed (Talita UD)
- [ ] **Matchup B 삭제 승인** — `500d5fd1` orphan row 삭제
- [ ] **pick 71 WIN 재정산 진행 여부** — KINGBOTTLE points 지급 (base_payout 확인 후)
- [ ] **pick 75 LOSE 처리 + 환급 100pts 회수 진행 여부** — KINGBOTTLE points -100

> **참고:** KDI-02의 pick 재정산은 KINGBOTTLE(admin) 유저만 영향받음. 서비스 운영에 즉각적인 지장은 없으나 포인트 기록의 정확성을 위해 처리 권장.

---

*Review generated by Claude Code — read-only investigation. No DB changes made.*  
*Official results verified: UFC Fight Night 273 & 274 scorecards, ESPN FightCenter, UFC post-fight interview.*
