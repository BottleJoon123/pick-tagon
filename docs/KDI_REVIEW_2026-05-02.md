# KDI Data Review — 2026-05-02

**조사일:** 2026-05-02  
**수정 완료:** 2026-05-02  
**대상:** KDI-01, KDI-02 (docs/QA_RUN_2026-05-02.md Known Data Issues 섹션)

---

## 수정 결과 요약 ✅

| 항목 | 상태 | 비고 |
|---|---|---|
| KDI-01 matchup 248de009 | **✅ Fixed** | draw/MD/winner=NULL |
| KDI-02A matchup 3006a883 | **✅ Fixed** | completed/TalitaAlencar/UD |
| KDI-02B matchup 500d5fd1 | **✅ Fixed** | orphan 삭제 완료 |
| KDI-02 pick 71 | **✅ Fixed** | win, settled_payout=190 |
| KDI-02 pick 75 | **⚠️ 제약 예외** | cancelled 유지, 포인트 -100 조정 (아래 참고) |

**KINGBOTTLE points 최종:** 3005  
**KINGBOTTLE success_picks 최종:** 14

---

## 적용된 마이그레이션

| 파일 | 설명 | 비고 |
|---|---|---|
| `20260502_kdi_repair.sql` | v1 — 최초 시도 | `apply_migration` DO블록 DML 미반영 버그. DELETE(500d5fd1)만 적용됨 |
| `20260502_kdi_repair_v2.sql` | v2 — 재시도 | 동일 버그로 미반영 |
| execute_sql 직접 적용 | 실제 수정 | matchup 2건 UPDATE, pick 71 UPDATE, users points UPDATE |

> **참고 (tooling):** Supabase MCP `apply_migration` 도구는 DO 블록 내 DML UPDATE를 반영하지 않는 버그가 확인됨. DDL은 정상. DML 수정은 `execute_sql`로 직접 적용해야 함.

---

## 공식 결과 출처

| 경기 | 출처 |
|---|---|
| Castaneda vs Vologdin | UFC official event page — UFC Fight Night 273 scorecards (29-27, 28-28, 28-28 → Majority Draw) |
| Talita Alencar vs Julia Polastri | UFC official event page — UFC Fight Night 274 scorecards (29-28, 29-28, 29-28 → Talita Alencar UD) |

---

## KDI-01 — Castaneda vs Vologdin (matchup 248de009)

**수정 전 → 수정 후:**

| 필드 | 수정 전 | 수정 후 |
|---|---|---|
| result_status | `completed` ❌ | `draw` ✅ |
| result_winner | `JohnCastaneda` ❌ | `NULL` ✅ |
| result_winner_side | `red` ❌ | `NULL` ✅ |
| result_method | `NC` ❌ | `MD` ✅ |
| result_round | 3 | 3 |
| result_time | 5:00 | 5:00 |

**pick 66 재정산:** 불필요. draw → cancel+환급이 공식 결과와 일치 (이미 cancelled 상태).

---

## KDI-02 — TalitaAlencar vs JuliaPolastri

### Matchup A (3006a883) — 수정 전 → 수정 후

| 필드 | 수정 전 | 수정 후 |
|---|---|---|
| result_status | `no_contest` ❌ | `completed` ✅ |
| result_winner | `null` ❌ | `TalitaAlencar` ✅ |
| result_winner_side | `null` ❌ | `red` ✅ |
| result_method | `NC` ❌ | `UD` ✅ |

### Matchup B (500d5fd1) — 삭제 완료

orphan row (픽 없음) → DELETE 완료.

### pick 71 — TalitaAlencar(red), KINGBOTTLE

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| status | `cancelled` | `win` ✅ |
| payout | 0 | 190 |
| settled_payout | 0 | 190 |
| 포인트 순영향 | cancel refund +100 적용됨 | +base_payout(190) - bet_cost(100) = **+90** |

### pick 75 — JuliaPolastri(blue), KINGBOTTLE (제약 예외 처리)

| 항목 | 상태 |
|---|---|
| status | `cancelled` 유지 |
| 사유 | unique constraint `picks_uniq_user_fight_active` — WHERE status IN ('pending','win','lose'). pick 71이 win 상태이므로 동일 (user_id, fight_id)에 lose 추가 불가 |
| 포인트 처리 | 포인트만 -100 직접 조정 (orphan refund 회수) |

pick 75는 본래 `place_pick` pick_locked 가드 부재로 인해 matchup settlement 이후 생성된 orphan pick. 정상 상황이라면 place_pick이 차단되었을 것.

---

## KINGBOTTLE 포인트 추적

| 시점 | points | success_picks | 변화 원인 |
|---|---|---|---|
| QA 전 | 2925 | 12 | — |
| repair_orphan_pending_picks 후 | 3315 | 13 | picks 66/74/75 정산 +390 |
| picks 80/81/82 배팅 후 | 3015 | 13 | UFC 327 picks 3개 × -100 (ISSUE-04) |
| KDI repair 후 | **3005** | **14** | pick 71 win +90, pick 75 포인트 -100 |

---

## ISSUE-04 — UFC 327 orphan pending picks (신규 발견)

| 항목 | 내용 |
|---|---|
| 발견 | KDI repair 조사 중 KINGBOTTLE -300 포인트 원인 추적 |
| 상태 | **Open** |
| picks | id=80 (Carlos Prates/blue), id=81 (QuillanSalkilld/blue), id=82 (SteveErceg/blue) |
| event | UFC 327 (`0a25c905-359a-441f-84c7-de17277ff3de`) — settled 2026-05-02 05:38:46 |
| 원인 | picks 배팅(05:39~05:40)이 event settle(05:38:46) 이후에 발생 |
| matchup 상태 | 3개 matchup 모두 `scheduled` (결과 미입력) |
| 조치 | UFC 327 matchup 결과 입력 후 별도 repair migration 필요 |

---

## Known UI Follow-up

Admin 매치업 상세에서 `result_status='draw'`일 때 배지가 초록(completed와 동일)으로 표시될 수 있음. 코드 커버리지는 이미 지원하나 배지 스타일 구분은 추후 개선 가능.

---

*Review updated by Claude Code — KDI fixes applied 2026-05-02.*  
*Official results verified: UFC Fight Night 273 & 274 scorecards.*
