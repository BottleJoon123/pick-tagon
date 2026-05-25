# Admin Settlement Rehearsal Plan — 2026-06-10

> 작성일: 2026-05-25  
> 공개 배포: **2026-06-10**  
> 대상 이벤트: **2026-06-15 White House event**  
> Release Gate: **G-6 Admin 로그인 + settle 확인**  
> 릴리즈 기준: [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md)  
> QA 체크리스트: [`docs/RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md)  
> Production smoke 결과: [`docs/QA_RUN_2026-05-25_RELEASE_PRODUCTION.md`](QA_RUN_2026-05-25_RELEASE_PRODUCTION.md)

---

## 1. 목적

| 목적 | 설명 |
|---|---|
| Admin settle 흐름 검증 | 2026-06-10 공개 배포 전 result entry / settlement 흐름이 정상 동작하는지 확인 |
| 운영 데이터 보호 | 실제 운영 데이터 손상 없이 정산 가능 상태를 검증 |
| Release Gate G-6 충족 | `Admin 로그인 + settle 확인` 조건 판정 근거 확보 |
| 운영자 숙지 | 2026-06-15 이벤트 당일 정산 오류 없이 실행할 수 있도록 리허설 |

---

## 2. 절대 금지 사항

> **이 문서의 어떤 단계에서도 아래 항목은 실행하지 않는다.**  
> Claude에게도 동일하게 적용된다 — 별도 명시적 승인 없이 실행 금지.

| 금지 항목 | 이유 |
|---|---|
| ❌ Season Reset 실행 | 모든 사용자 포인트/픽/랭킹 초기화 — 복구 불가 |
| ❌ Danger Zone 실행 | 데이터 전체 삭제/초기화 — 복구 불가 |
| ❌ Archive / Delete / Purge 실행 | 운영 데이터 소실 |
| ❌ 승인 없는 settle 실행 | 사용자 포인트 변경 — rollback 복잡 |
| ❌ 승인 없는 result overwrite | 기존 픽 결과 재계산 유발 |
| ❌ Supabase 직접 SQL DELETE/UPDATE (승인 없이) | 데이터 정합성 파괴 |

---

## 3. Read-only Rehearsal 체크리스트

> **이 섹션은 실제 데이터 변경 없음.** Admin 화면을 눈으로 확인만 한다.

### 3-1. Admin 접근 확인

- [ ] `https://bottlejoon123.github.io/pick-tagon/` 접속
- [ ] Admin 계정으로 로그인 (`is_admin = true` 계정)
- [ ] Admin 섹션 진입 (`navigateTo('admin')` 또는 상단 메뉴)
- [ ] "ADMIN ONLY" 문구 및 Fighter Control 패널 표시 확인
- [ ] 비관리자 계정으로 접근 시 차단 확인 (선택)

### 3-2. Event / Matchup 현황 확인

- [ ] 현재 등록된 이벤트 목록 확인
- [ ] 각 이벤트의 `pending` / `settled` / `cancelled` 상태 확인
- [ ] 대상 이벤트(2026-06-15)의 matchup 목록 확인
- [ ] 각 matchup의 red/blue fighter 이름 확인
- [ ] 각 matchup에 연결된 picks count 확인 (있다면)

### 3-3. Result Entry UI 확인

- [ ] result 입력 폼 존재 확인 (winner / method / round / time 입력 필드)
- [ ] settle 버튼 위치 및 상태(활성/비활성) 확인
- [ ] 이미 settled된 matchup의 상태 표시 확인
- [ ] result 입력 없이 settle 버튼 클릭 시 validation 동작 확인 (실제 settle 제외)

### 3-4. Archive / 반영 화면 확인

- [ ] Archive 섹션에서 settled 이벤트 표시 확인
- [ ] settled matchup의 결과(winner, method) 표시 확인
- [ ] Rankings / Leaderboard에서 포인트 반영 상태 확인

### 3-5. Console / Network 확인

- [ ] Admin 화면 접속 중 console error 없음 확인
- [ ] Network 탭에서 Admin API 요청 정상 응답(200/201) 확인
- [ ] `settle-matchup` Edge Function이 활성 상태인지 Supabase 대시보드에서 확인

---

## 4. Write Rehearsal 옵션

운영자가 실제 settle 흐름을 사전 검증하려면 아래 3가지 옵션 중 하나를 선택한다.

### Option A — Test Event / Test Matchup 생성 후 리허설 (권장)

| 항목 | 내용 |
|---|---|
| 방법 | Admin에서 `[TEST] 리허설 이벤트` 신규 생성 → 가상 matchup 2~3개 추가 → result 입력 → settle 실행 → 결과 확인 후 이벤트 삭제 또는 보관 |
| 장점 | 실제 운영 데이터에 영향 없음. settle 전 전체 흐름(result entry → settle → 포인트 반영 → archive) 검증 가능 |
| 단점 | 테스트 이벤트에 실제 사용자가 픽을 할 수 있음 (이벤트 이름을 명확히 `[TEST]`로 표시 필요) |
| 추천 여부 | ✅ **권장** — 가장 안전하고 완전한 흐름 검증 가능 |

### Option B — 실제 이벤트, settle 직전까지만 UI 확인

| 항목 | 내용 |
|---|---|
| 방법 | 2026-06-15 이벤트 Admin 화면에서 result 입력 UI까지 확인. 실제 settle 버튼은 클릭하지 않음 |
| 장점 | 추가 데이터 생성 없음 |
| 단점 | settle 이후 흐름(포인트 반영, archive, leaderboard) 미검증. G-6 판정 근거 약함 |
| 추천 여부 | ⚠️ 부분 검증만 가능 — Option A 불가 시 대안 |

### Option C — Supabase SQL Dry-run

| 항목 | 내용 |
|---|---|
| 방법 | Supabase SQL Editor에서 `SELECT`만으로 settle 대상 matchup / picks / 예상 포인트 변화를 미리 조회. `settle-matchup` Edge Function을 실제 호출하지 않고 로직만 검증 |
| 장점 | 데이터 변경 없음. 정합성 사전 확인 가능 |
| 단점 | UI settle 흐름 비검증. Edge Function 내부 동작이 SQL 조회와 다를 수 있음 |
| 추천 여부 | 📋 보조 수단 — Option A/B 이후 정합성 확인용으로 활용 |

### 권장 실행 순서

```
Option A (test event settle) → Option C (SQL 정합성 확인) → Read-only G-6 판정
실제 이벤트 settle은 당일 이벤트 종료 후 실제 결과 입력 시 단 1회 실행
```

---

## 5. 실제 Settle 실행 전 체크리스트

> **이 체크리스트는 실제 settle 직전에 운영자가 수동으로 확인하는 항목이다.**  
> Claude에게 settle 실행을 요청하려면 아래 모든 항목을 명시적으로 확인한 후 승인 문구를 포함해야 한다.

```
승인 문구 예시:
"아래 항목 모두 확인했습니다. settle 실행을 승인합니다.
 - event_id: [값]
 - matchup_id: [값]
 - winner: [red/blue]
 - method: [KO/TKO/SUB/UD/SD/MD]
 - round: [숫자]
 - time: [예: 4:32]"
```

| # | 확인 항목 | 확인 방법 |
|---|---|---|
| 1 | 대상 `event_id` 확인 | Admin 이벤트 목록 또는 Supabase `events` 테이블 |
| 2 | 대상 `matchup_id` 확인 | Admin matchup 목록 또는 Supabase `matchups` 테이블 |
| 3 | red fighter 이름 / ID 확인 | matchup 상세 또는 Supabase `fighters` 테이블 |
| 4 | blue fighter 이름 / ID 확인 | 동일 |
| 5 | winner (red/blue/draw/no_contest) 확인 | 실제 경기 결과 |
| 6 | method (KO/TKO/SUB/UD/SD/MD/DQ 등) 확인 | 실제 경기 결과 |
| 7 | round 확인 | 실제 경기 결과 |
| 8 | time 확인 | 실제 경기 결과 |
| 9 | 해당 matchup picks count 확인 | Supabase `picks` 테이블 `WHERE matchup_id = [값]` |
| 10 | 중복 settle 여부 확인 | matchup `status = 'settled'` 이면 실행 금지 |
| 11 | rollback 계획 확인 | settle 오류 시 Supabase SQL로 `picks.result`, `picks.actual` 수동 수정 가능한지 확인 |
| 12 | 포인트 계산 방식 확인 | 정확히 맞힌 픽만 포인트 부여 로직 재확인 |

---

## 6. 실제 Settle 실행 후 체크리스트

| # | 확인 항목 | 예상 결과 |
|---|---|---|
| 1 | matchup `status` | `settled` 로 변경 |
| 2 | picks `actual` / `result` 필드 | winner 기준 `win`/`loss` 반영 |
| 3 | user `points` 변화 | 맞힌 사용자에게 포인트 추가 |
| 4 | Leaderboard / Rankings 반영 | 포인트 변화가 랭킹에 즉시 또는 다음 렌더에 반영 |
| 5 | Profile → pick history 반영 | 해당 픽에 결과 표시 |
| 6 | Archive 화면 반영 | settled event/matchup이 archive에 표시 |
| 7 | console / network error 없음 | DevTools console 에러 0건 |
| 8 | settle-matchup Edge Function 응답 | HTTP 200 + `{ settled: true }` 형태 확인 |

---

## 7. Release Gate G-6 판정 기준

| 조건 | 판정 |
|---|---|
| Admin 계정 로그인 성공 | PASS 필요 |
| Admin 섹션 접근 (비관리자 차단) 확인 | PASS 필요 |
| Read-only rehearsal 전 항목 확인 | PASS 필요 |
| settle 버튼/result entry UI 존재 확인 | PASS 필요 |
| Option A (test event settle) 1회 이상 실행 | ✅ **권장** — G-6 완전 통과 |
| Option B만 실행 (settle 직전 UI 확인) | ⚠️ 부분 통과 — 운영자 판단으로 승인 가능 |
| Read-only만 실행, write 없음 | 🔲 NEEDS_MANUAL — G-6 미통과 |

> **G-6 최소 통과 조건:** Admin 로그인 + Admin 섹션 접근 + settle UI 존재 확인 + Option A 또는 Option B 실행  
> **G-6 완전 통과 조건:** Option A (test event settle → 포인트 반영 → archive 확인) 전체 흐름 확인

---

## 8. 다음 액션

| 우선순위 | 액션 | 시점 | 담당 |
|---|---|---|---|
| 1 | Read-only admin rehearsal 실행 (Section 3) | 2026-06-02~04 | 운영자 |
| 2 | Option A — test event 생성 여부 결정 | 2026-06-02~04 | 운영자 승인 필요 |
| 3 | Option A write rehearsal 실행 (승인 후) | 2026-06-02~04 | 운영자 승인 후 실행 |
| 4 | Option C SQL dry-run (정합성 확인) | 2026-06-02~04 | 운영자 |
| 5 | Release Gate G-6 판정 완료 | 2026-06-08~09 | 운영자 |
| 6 | 2026-06-15 이벤트 당일 실제 settle 실행 | 2026-06-15 이벤트 종료 후 | 운영자 |

### Claude에게 Write Rehearsal 실행을 요청할 때 필요한 프롬프트

```
Admin Write Rehearsal 승인 프롬프트 (Option A):

"Admin settlement write rehearsal을 실행한다.
 test event를 생성하고 test matchup에 result를 입력하여 settle을 실행한다.
 대상: [TEST] 리허설 이벤트 — 실제 운영 이벤트 아님.
 실행 범위: test event 생성 → matchup 추가 → result 입력 → settle → 확인 → 이벤트 아카이브/삭제.
 Season reset / Danger zone / 실제 이벤트 settle 은 이 승인에 포함되지 않는다."
```

---

## 참고 문서

| 문서 | 링크 |
|---|---|
| Release QA Plan | [`docs/RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md) |
| Production Smoke QA 결과 | [`docs/QA_RUN_2026-05-25_RELEASE_PRODUCTION.md`](QA_RUN_2026-05-25_RELEASE_PRODUCTION.md) |
| Release Deadline Plan | [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md) |
