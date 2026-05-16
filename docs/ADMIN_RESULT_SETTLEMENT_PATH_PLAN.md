# Admin 결과 입력 경로 통일 설계안

작성: 2026-05-16 / 상태: read-only 조사 완료 — 코드/DB/운영 데이터 변경 없음

---

## 1. 현재 결과 입력 경로 요약

### 실제 호출 스택 (현재 운영 경로)

```
[Admin UI — UFC Builder]
  openResultModal() / openResultModalForEdit()
    → confirmAdminResult()                          [index.html:3180]
      → submitMatchupResult(matchupId, ...)         [index.html:3223]
        → sb.functions.invoke('settle-matchup', {   [Edge Function HTTP 호출]
            matchupId, winnerName, winnerSide,
            method, round, time, force
          })
            → anonClient.rpc('admin_set_matchup_result', ...) [Edge Function 내부]
              → public.service_settle_matchup(...)  [실제 정산 로직]
```

### 대안 경로 (admin.js에 이미 준비됨, 현재 미연결)

```
adminSetMatchupResult(matchupId, ...)               [admin.js:1572 — 현재 미사용]
  → sb.rpc('admin_set_matchup_result', ...)         [RPC 직접 호출]
    → public.service_settle_matchup(...)            [실제 정산 로직]
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
| 현재 연결 상태 | **운영 중** | **admin.js에 준비됨, 미연결** |

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

### 5-5. admin.js `adminSetMatchupResult()` 미연결
[admin.js:1572]에 함수가 정의되어 있지만 `confirmAdminResult()`에서 호출되지 않음.
코드 주석: "향후 Edge Function 대체 시 사용". 이 함수로 전환하면 cold start 문제 해소.

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
- confirm 다이얼로그 없음 — 클릭 한 번으로 force 실행

**권고**: force=true 경로에 별도 "강제 재정산 확인" confirm 다이얼로그 추가 필요.

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

### 최종 추천: **후보 B** (단계적 전환)

---

## 8. 추천 구현 순서

> ⚠ 아래는 향후 구현 시 순서. 이번 조사에서는 코드 변경 없음.

1. **force=true confirm 다이얼로그 추가** (index.html)
   - `openResultModalForEdit()` 또는 `confirmAdminResult()` isForce 분기에 추가 confirm
   - 위험 경고 문구: "이미 정산된 경기를 강제 재정산합니다. 모든 관련 유저 포인트가 변경됩니다."

2. **`confirmAdminResult()` DB matchup 분기에서 `adminSetMatchupResult()` 연결**
   - isDbMatchup 경로: `submitMatchupResult()` → `adminSetMatchupResult()` 교체
   - `adminSetMatchupResult()` 반환 구조가 `service_settle_matchup` 반환과 동일하므로 toast 로직 재사용 가능
   - retry 로직 제거 (cold start 불필요)

3. **`adminSetMatchupResult()`의 toast/갱신 출력 통일**
   - 현재 함수는 RPC 결과를 return만 하고 toast 없음
   - `submitMatchupResult()`의 toast/갱신 로직을 `adminSetMatchupResult()` 또는 공통 함수로 이동

4. **QA 패널 호환성 확인**
   - `submitMatchupResult()` 성공 블록에 이미 `fetchBuilderQA()` 호출 추가됨 (f708e83)
   - Path B 전환 후에도 동일 갱신 블록이 `adminSetMatchupResult()` 성공 후에 실행되어야 함

5. **legacy settleBet() 경로 격리**
   - `confirmAdminResult()`의 localStorage fight 분기(`!isDbMatchup && fight`)는 `settleBet()` 경로 유지
   - DB matchup이 전수 완료된 후 해당 분기 제거 가능

---

## 9. QA 패널과 경로 호환성

| 기능 | Path A (Edge Function) | Path B (RPC 직접) |
|------|----------------------|-----------------|
| `_builderQA` 갱신 | `submitMatchupResult()` 성공 후 `fetchBuilderQA()` 호출 ✓ (f708e83) | 동일 갱신 블록 필요 |
| `all_matchups_completed` 반영 | matchup 결과 입력 → DB 업데이트 → QA 재조회 ✓ | 동일 |
| `total_pending_alert` 반영 | 정산 완료 후 pending=0 확인 ✓ | 동일 |
| 정산 버튼 guard | `onLifecycleSettle()` QA guard ✓ (f708e83) | 변경 불필요 |

**현재 Admin QA 패널은 두 경로 모두와 호환됨.** Path B 전환 시 `adminSetMatchupResult()` 성공 후 동일 갱신 블록(`fetchBuilderMatchups`, `fetchBuilderPickSummary`, `fetchBuilderQA`) 실행 필요.

---

## 10. QA 체크리스트 (향후 구현 시)

- [ ] force=false 정상 결과 입력 → win/lose/pending count 정확
- [ ] DRAW 입력 → picks 전부 cancelled, bet_cost 환급
- [ ] NC 입력 → picks 전부 cancelled, bet_cost 환급
- [ ] 마지막 matchup 결과 입력 → event auto-completed
- [ ] force=true 재정산 → 이전 포인트 역산 후 재계산
- [ ] force=true confirm 다이얼로그 표시 확인
- [ ] non-admin 호출 → `admin_required` (toast + 차단)
- [ ] 결과 입력 후 `_builderQA` stale 없이 즉시 갱신
- [ ] QA 통과 후 정산 버튼 활성 상태 확인
- [ ] `npm run build` PASS
- [ ] audit_logs에 set_matchup_result 기록 확인

---

## 이번 조사 범위 명시

> **이번 작업에서 코드, DB, 운영 데이터 변경 없음.**
> 모든 내용은 read-only 조사 결과이며, 구현은 별도 승인 후 진행.
> 운영 데이터 및 users.points에 영향을 줄 수 있는 force=true 경로는
> **반드시 별도 승인 후에만 UI 변경 가능.**
