# Admin 결과 입력 경로 통일 설계안

작성: 2026-05-16 / 마지막 업데이트: 2026-05-16 / 상태: Path B 전환 완료 (d07156e)

---

## 1. 현재 결과 입력 경로 요약

### 현재 운영 경로 (Path B — d07156e 기준)

```
[Admin UI — UFC Builder]
  openResultModal() / openResultModalForEdit()
    → confirmAdminResult()                          [index.html:3180]
      force=true 시: confirm 다이얼로그 (8903621)
      → adminSetMatchupResultWithUI(matchupId, ...) [index.html:3234 — 신규]
          → adminSetMatchupResult(...)              [admin.js:1586]
            → sb.rpc('admin_set_matchup_result', ...) [RPC 직접 호출]
              → public.service_settle_matchup(...)  [실제 정산 로직]
          → toast / 상태 갱신 체인
```

### Legacy Fallback 경로 (settle-matchup Edge Function — 보존)

```
submitMatchupResult(matchupId, ...)                 [index.html:3267 — legacy fallback]
  → sb.functions.invoke('settle-matchup', {         [Edge Function HTTP 호출]
      matchupId, winnerName, winnerSide,
      method, round, time, force
    })
      → anonClient.rpc('admin_set_matchup_result', ...) [Edge Function 내부]
        → public.service_settle_matchup(...)        [실제 정산 로직]
```

---

## 2. Edge Function `settle-matchup` 책임 범위

**파일**: `supabase/functions/settle-matchup/index.ts`

| 항목 | 내용 |
|------|------|
| 인증 | Bearer JWT → `auth.getUser()` → `users.is_admin` 직접 조회 |
| 입력 파라미터 | matchupId(UUID), winnerName, winnerSide(red/blue/draw/nc), method, round, time?, force? |
| 입력 검증 | UUID 형식 체크, 필수 필드 존재 체크, winnerSide enum 체크 |
| 실제 정산 | **위임**: `admin_set_matchup_result` RPC (사용자 JWT 컨텍스트 유지) |
| audit log | **없음** (RPC 레이어에서 기록) |
| 반환 | `admin_set_matchup_result`의 반환값을 그대로 pass-through |
| cold start | 프론트에서 3회 retry 로직 존재 (index.html:3227-3236) |
| 역할 | HTTP 래퍼 + 입력 검증 레이어 |

**중요**: Edge Function은 정산 로직을 갖지 않는다. 인증·검증 후 `admin_set_matchup_result` RPC를 사용자 JWT로 호출하는 것이 전부.

---

## 3. DB RPC 경로 책임 범위

### 3-1. `admin_set_matchup_result` (20260502_event_lifecycle_phase1.sql)

| 항목 | 내용 |
|------|------|
| 인증 | `private.is_admin()` — non-admin → `admin_required` 예외 |
| 보안 | SECURITY DEFINER, `GRANT authenticated` |
| 정산 위임 | `service_settle_matchup(...)` 에 완전 위임 |
| audit log | **있음** — `admin_audit_logs` 에 before_data(matchup row) + after_data(결과 파라미터) + metadata(service_settle_matchup 반환값) 기록 |
| force 지원 | `p_force BOOLEAN DEFAULT false` — service_settle_matchup에 그대로 전달 |
| 반환 | service_settle_matchup 반환값 그대로 |

### 3-2. `service_settle_matchup` (20260426_settle_matchup_v3.sql + fix 20260503)

| 항목 | 내용 |
|------|------|
| 인증 | 없음 — `GRANT service_role` only (admin_set_matchup_result 경유 또는 서비스 내부 전용) |
| matchup 업데이트 | result_status, result_winner, result_winner_side, result_method, result_round, result_time, settled_at |
| result_status 값 | 'completed'(WIN) / 'draw' / 'no_contest'(NC) |
| picks 업데이트 | pending → win/lose/cancelled (matchup_id 또는 fight_id 기준 모두 처리) |
| users.points | WIN: +settled_payout, LOSE: 변화 없음, DRAW/NC: +bet_cost(환급) |
| users.success_picks | WIN: +1, force 역산 시: -1 |
| 보너스 계산 | method 일치: +30%, is_upset=true: +20% (KO/SUB +30%는 method=KO/TKO or SUB 시) |
| 이벤트 자동 완료 | 모든 matchup result_status IN ('completed','cancelled','no_contest','draw') 시 events.status → 'completed', completed_at = NOW() |
| archive 스냅샷 | event 완료 시 archive_events/archive_fights 갱신 (비치명적 EXCEPTION 처리) |
| 멱등성 | 이미 정산된 matchup + force=false → `{ok:true, idempotent:true}` no-op |
| force 역산 | win→points 차감, success_picks-1 / lose→bet_cost 환급 / cancelled→bet_cost 재차감 → 모두 pending으로 초기화 후 재정산 |
| NC/DRAW | picks → cancelled, bet_cost 전액 환급 |
| 반환 | ok, idempotent, settled_count, win_count, lose_count, cancel_count, event_completed, event_id |

### 3-3. `admin_settle_event` (20260502_event_lifecycle_phase1.sql)

| 항목 | 내용 |
|------|------|
| 역할 | 이벤트 단위 정산 확정 (matchup 결과 입력과 별도 단계) |
| 요건 | events.status IN ('completed', 'locked') |
| 안전망 | 남아있는 pending picks → cancelled (bet_cost 환급) |
| events 업데이트 | status → 'settled', settled_at = NOW() |
| audit log | 있음 |
| QA 연동 | `onLifecycleSettle()` 호출 전 `_builderQA.all_matchups_completed` + `total_pending_alert` guard |

---

## 4. 두 경로 비교표

| 항목 | Path A: Edge Function | Path B: RPC 직접 |
|------|----------------------|-----------------|
| 호출 위치 | `submitMatchupResult()` → HTTP | `adminSetMatchupResult()` → RPC |
| 정산 핵심 | `service_settle_matchup` (동일) | `service_settle_matchup` (동일) |
| 인증 레이어 | Edge Function Bearer + users.is_admin (HTTP), RPC private.is_admin() (DB) — **이중** | RPC private.is_admin() (DB) — **단일** |
| audit log | `admin_set_matchup_result` 내부에서 기록 ✓ | `admin_set_matchup_result` 내부에서 기록 ✓ |
| 입력 검증 | Edge Function에서 UUID/필드/enum 검증 | 없음 (프론트 책임 또는 RPC RAISE EXCEPTION) |
| cold start 문제 | 있음 (3회 retry) | 없음 |
| 네트워크 홉 | 2회 (브라우저→Edge Function→DB) | 1회 (브라우저→DB) |
| 코드 복잡도 | 높음 (retry 로직, error.context.json() 파싱) | 낮음 |
| force=true 지원 | ✓ | ✓ |
| NC/DRAW | ✓ | ✓ |
| 레거시 fight_id 처리 | service_settle_matchup이 처리 (동일) | service_settle_matchup이 처리 (동일) |
| 현재 연결 상태 | **legacy fallback (submitMatchupResult)** | **현재 운영 중 (adminSetMatchupResultWithUI)** |

---

## 5. 중복·불일치·위험 포인트

### 5-1. 이중 인증 (중복)
Edge Function에서 `users.is_admin`을 **HTTP 레이어**에서 한 번 체크하고,
`admin_set_matchup_result` RPC에서 `private.is_admin()`을 **DB 레이어**에서 또 체크한다.
기능상 문제는 없지만 불필요한 중복.

### 5-2. 보너스 계산 불일치 위험 ⚠
`service_settle_matchup`의 보너스 계산:
- method 일치: `+ROUND(v_payout * 0.3)`
- is_upset: `+ROUND(v_payout * 0.2)`

`settleBet()` (index.html:3269 — localStorage 기반 레거시 경로)의 보너스 계산:
- `methodBonus` 필드 기반 (KO/TKO→30%, SUB→50%)
- round 일치: +20% 별도
- upset: +20%

**현재 DB matchup은 모두 RPC 경로(`service_settle_matchup`)로 처리되므로 불일치 미발생.
단, `settleBet()`은 localStorage fight에만 사용되며 DB matchup과 혼재 시 위험.**

### 5-3. fight_id/matchup_id 이중 처리
`service_settle_matchup`은 picks를 `matchup_id = p_matchup_id OR fight_id = v_fight_id_text` 두 조건으로 조회.
레거시 `fight_id` 기반 픽 처리를 위한 하위 호환 코드. DB matchup 전환 완료 후 정리 가능.

### 5-4. force=true 역산 위험 🚨 (별도 섹션 6 참조)

### 5-5. admin.js `adminSetMatchupResult()` 연결 ✅ (d07156e 해소)
`adminSetMatchupResultWithUI()`(index.html)가 `adminSetMatchupResult()`를 호출하는 구조로 전환 완료.
cold start retry 로직 미사용. legacy `submitMatchupResult()` 및 Edge Function은 fallback으로 보존.

---

## 6. force=true 재정산 위험 분석 🚨

**변경 금지 / 별도 승인 필요 구역**

### 역산 로직 (service_settle_matchup)
```
force=true + 이미 정산된 matchup:
  - win pick: users.points -= settled_payout, success_picks -= 1
  - lose pick: users.points += bet_cost (환급)
  - cancelled pick: users.points -= bet_cost (환급 취소)
  → 모두 status = 'pending'으로 초기화
  → 새 결과로 재정산
```

### 위험
- 다수 사용자의 points가 동시에 변경됨
- `success_picks`가 음수가 되지 않도록 `GREATEST(0, ...)` 보호 있음
- `settled_payout` NULL 방어: `COALESCE(v_pick.settled_payout, 0)` 있음
- **롤백**: 트랜잭션 안에서 실행되므로 실패 시 원자적 롤백

### 현재 UI 진입점
- `openResultModalForEdit()` → `result-modal-force` 값 `'true'`
- `confirmAdminResult()` → `isForce = document.getElementById('result-modal-force').value === 'true'`
- **confirm 다이얼로그 추가됨 ✅ (8903621)**: force=true 시 `confirm()` 표시, 취소 시 모달 유지 + RPC 미호출

**현재 상태**: 강제 재정산 confirm 완료. 실제 운영 사용 시에도 여전히 주의 필요.

---

## 7. 추천 통일 방향

### 후보 A: Edge Function 유지 + RPC는 보조
**현재 상태 유지.**
- `confirmAdminResult()` → `submitMatchupResult()` → Edge Function 경로 유지
- `adminSetMatchupResult()` (admin.js)는 fallback용으로만 보존
- 장점: 추가 변경 불필요
- 단점: cold start retry 코드 유지, 이중 인증, 불필요한 네트워크 홉

### 후보 B: RPC 직접 호출로 전환 (추천 ⭐)
**Edge Function을 우회하고 `admin_set_matchup_result` RPC를 직접 호출.**
- `confirmAdminResult()` → `adminSetMatchupResult()` (admin.js) → RPC
- 실질 변경:
  1. `confirmAdminResult()` 내 `submitMatchupResult()` 호출을 `adminSetMatchupResult()` 호출로 교체
  2. `adminSetMatchupResult()`의 반환값으로 toast/갱신 로직 통일
  3. Edge Function `settle-matchup`은 레거시로 보존 (삭제 금지)
- 장점: cold start 없음, 코드 단순화, 단일 인증, 기존 audit log 유지
- 단점: Edge Function의 UUID/필드 검증을 프론트 또는 RPC RAISE EXCEPTION으로 대체 필요
- ⚠ **변경 전 force=true 별도 confirm 추가 권장**

### 후보 C: 새 단일 RPC `admin_enter_matchup_result`로 통합
`admin_set_matchup_result` + 결과 검증 + 이벤트 완료 체크를 하나의 RPC로 통합.
- 장점: 완전한 단일 진입점
- 단점: 신규 RPC migration + 기존 RPC 교체 → 운영 영향 범위가 큼
- 현재 불필요 — `admin_set_matchup_result` → `service_settle_matchup` 분리가 이미 깔끔함

### 최종 추천: **후보 B** — ✅ **완료 (d07156e)**

---

## 8. 구현 순서 (완료 기록)

1. ✅ **force=true confirm 다이얼로그 추가** (8903621)
   - `confirmAdminResult()` isForce 분기: `confirm()` 표시, 취소 시 `showToast('강제 재정산 취소'); return;`

2. ✅ **`confirmAdminResult()` DB matchup 분기에서 `adminSetMatchupResultWithUI()` 연결** (d07156e)
   - isDbMatchup 경로 + DRAW/NC 경로: `submitMatchupResult()` → `adminSetMatchupResultWithUI()` 교체
   - retry 로직 미사용 (cold start 불필요)

3. ✅ **`adminSetMatchupResultWithUI()` 신규 추가** (d07156e)
   - `adminSetMatchupResult()` 호출 + toast/갱신 로직 포함
   - RPC 반환 필드(`settled_count`, `win_count`, `lose_count`, `cancel_count`, `event_completed`) 동일 사용

4. ✅ **QA 패널 갱신 체인 유지** (d07156e)
   - `adminSetMatchupResultWithUI()` 성공 후 `fetchBuilderMatchups` + `Promise.all([fetchBuilderPickSummary, fetchBuilderQA])` 실행

5. **legacy settleBet() 경로 격리** — 보류
   - `confirmAdminResult()`의 `!isDbMatchup && fight` 분기는 `settleBet()` 경로 유지
   - DB matchup 전수 완료 이후 별도 판단 필요

---

## 9. QA 패널과 경로 호환성

| 기능 | Path A (Edge Function, legacy) | Path B (RPC 직접, 현재 운영) |
|------|-------------------------------|------------------------------|
| `_builderQA` 갱신 | `submitMatchupResult()` 성공 후 `fetchBuilderQA()` 호출 ✓ (f708e83) | `adminSetMatchupResultWithUI()` 성공 후 동일 갱신 블록 ✓ (d07156e) |
| `all_matchups_completed` 반영 | matchup 결과 입력 → DB 업데이트 → QA 재조회 ✓ | 동일 ✓ |
| `total_pending_alert` 반영 | 정산 완료 후 pending=0 확인 ✓ | 동일 ✓ |
| 정산 버튼 guard | `onLifecycleSettle()` QA guard ✓ (f708e83) | 변경 없음 ✓ |

**Path B 전환 완료.** `adminSetMatchupResultWithUI()` 성공 후 `fetchBuilderMatchups` + `Promise.all([fetchBuilderPickSummary, fetchBuilderQA])` 실행됨.

---

## 10. QA 체크리스트 (Path B 전환 기준)

- [x] force=false DB matchup 결과 입력 → RPC 직접 호출, toast/갱신 정상
- [x] DRAW 입력 → `cancelled` 처리, `${cancels}명 환급` toast
- [x] NC 입력 → `cancelled` 처리, `${cancels}명 환급` toast
- [x] force=true 결과 수정 → confirm 다이얼로그 표시 (8903621)
- [x] force=true confirm 취소 → RPC 호출 없음, 모달 유지
- [x] 결과 입력 후 `fetchBuilderMatchups` / `fetchBuilderPickSummary` / `fetchBuilderQA` 갱신
- [x] 마지막 matchup 결과 입력 후 QA 패널/정산 버튼 즉시 활성화
- [x] `npm run build` PASS
- [ ] admin_audit_logs에 `set_matchup_result` 기록 확인 (브라우저 smoke QA 필요)
- [ ] non-admin RPC 호출 → `admin_required` toast + 차단 확인 (브라우저 smoke QA 필요)
- [ ] Edge Function `settle-matchup` 파일 삭제/수정 없음 ✓ (소스 확인 완료)

---

## 11. Known Limitations

| 항목 | 내용 |
|------|------|
| Legacy fallback 잔류 | `submitMatchupResult()` + Edge Function `settle-matchup`은 삭제하지 않고 코드에 보존 중 |
| 토스트/갱신 로직 중복 | `submitMatchupResult()`와 `adminSetMatchupResultWithUI()` 양쪽에 유사한 toast/갱신 체인 존재 |
| archived 이벤트 수정 정책 미확정 | `admin_set_matchup_result`는 `archived` 차단, `settled`는 허용. 허용 범위 최종 정책 별도 확정 필요 |
| force=true 고위험 경로 | confirm 추가됐으나, 다수 사용자 포인트 동시 변경 — 실제 운영 사용 시 사전 검토 필수 |
| localStorage legacy 경로 | `settleBet()` (localStorage fight) 경로 미제거 — DB matchup 전수 전환 이후 정리 가능 |
| 브라우저 smoke QA 미실시 | `admin_audit_logs` 기록, `admin_required` 차단 동작은 실제 브라우저에서 미확인 |

---

## 이력

| 날짜 | 작업 | 커밋 |
|------|------|------|
| 2026-05-16 | read-only 조사 + 설계 문서화 | f643024 |
| 2026-05-16 | force=true confirm 다이얼로그 추가 | 8903621 |
| 2026-05-16 | Path B RPC 직접 호출 전환 완료 | d07156e |
| 2026-05-16 | QA/마감 문서화 | (이번 커밋) |
