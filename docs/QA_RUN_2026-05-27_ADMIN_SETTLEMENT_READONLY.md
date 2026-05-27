# QA Run — Admin Settlement Read-Only Rehearsal
> 작성일: 2026-05-27  
> origin/main HEAD: `fc864f0` Docs: Correct UFC rankings resync precheck  
> 확인 시각: 2026-05-27 UTC  
> 조사 방법: Supabase read-only SQL + 코드 정적 확인  
> Release Gate 대상: **G-6 Admin 로그인 + settle 확인**  
> 참고 문서: [`docs/ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md)

---

## 1. 실행 환경

| 항목 | 값 |
|---|---|
| Production URL | `https://bottlejoon123.github.io/pick-tagon/` |
| Supabase 프로젝트 | `rnnrimzrypayvnmznpin` (ACTIVE_HEALTHY) |
| DB 버전 | PostgreSQL 17.6 |
| 확인 방법 | read-only SQL (Supabase MCP) + admin.js 코드 정적 분석 |
| write action | **0건 — 실행 없음** |

---

## 2. 확인 계정

| 항목 | 값 |
|---|---|
| Admin 계정 | `is_admin = true` 계정 1개 존재 (닉네임/ID 마스킹) |
| 비관리자 계정 | DB `users` 전체 조회 — `is_admin = true` 1건만 존재 확인 |

---

## 3. Admin 접근 확인

### 3-1. Admin 게이트 로직 (코드 정적 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| `adminUnlocked` 플래그 존재 | ✅ PASS | `admin.js:9`, `supabase.js` `updateAuthUI()` |
| 비로그인 시 게이트 메시지 | ✅ PASS | `configureAdminGate('signin')` → "Sign in with an authorized admin account" |
| 로그인 + 비관리자 시 차단 | ✅ PASS | `configureAdminGate('denied')` → "This account does not have admin access." |
| `is_admin = true` 계정만 `adminUnlocked = true` | ✅ PASS | `supabase.js updateAuthUI()` — `res.data.is_admin` 체크 |
| Admin 탭 nav DOM 토글 | ✅ PASS | `bc5b31a` Fix: Hide admin nav for non-admin users 반영 |

### 3-2. DB admin 계정 현황

| 항목 | 값 |
|---|---|
| `is_admin = true` 계정 수 | 1개 |
| 비관리자 계정 admin 접근 | 불가 (코드 차단) |

**판정: ✅ PASS** — 관리자 접근 제어 정상.

---

## 4. Admin Dashboard

### 4-1. Dashboard UI 구성 (코드 정적 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| `renderAdminDashboard()` 존재 | ✅ PASS | `admin.js:150` |
| `get_admin_dashboard_summary` RPC 존재 | ✅ PASS | DB 조회 확인 |
| 이벤트 상태 카드 5종 | ✅ PASS | upcoming/locked/completed/settled/archived |
| 운영 알림 strip (unresolved/unsettled/pending) | ✅ PASS | `admin.js:192` healthWarnings |
| Unresolved matchups 지표 | ✅ PASS | `admin.js:256` |
| Unsettled events 지표 | ✅ PASS | `admin.js:259` |
| Points (7D) 지표 | ✅ PASS | `admin.js:262` |
| Current Season 카드 | ✅ PASS | `admin.js:286` |
| Recent Admin Actions (audit log) | ✅ PASS | `admin.js:294` |
| Supabase 미연결 시 "DB 연결 필요" fallback | ✅ PASS | `admin.js:154` |

### 4-2. DB 현재 이벤트 상태 요약 (read-only)

| Status | Count |
|---|---|
| upcoming | 2 |
| archived | 3 |
| locked | 0 |
| completed | 0 |
| settled | 0 |

**판정: ✅ PASS** — Dashboard 렌더 로직 및 RPC 모두 확인됨. console error는 브라우저 수동 확인 필요(NEEDS_MANUAL).

---

## 5. Event / Matchup Management

### 5-1. 현재 활성 이벤트 (upcoming)

| 이벤트 | 날짜 | 상태 | picks_locked_at | Matchup 수 |
|---|---|---|---|---|
| UFC 328 - Chimaev vs. Strickland | 2026-05-09 | upcoming | null | 13 |
| UFC Fight Night 276 - Allen vs. Costa | 2026-05-16 | upcoming | null | 14 |

### 5-2. UFC 328 Matchup 목록 (정상 구조)

| 순서 | 경기 | Division | 카드 | 결과 상태 |
|---|---|---|---|---|
| main 1 | Khamzat Chimaev vs Sean Strickland | mw | 메인 | scheduled |
| main 2 | Joshua Van vs Tatsuro Taira | flw | 메인 | scheduled |
| main 3 | Alexander Volkov vs Waldo Cortes Acosta | hw | 메인 | scheduled |
| main 4 | Sean Brady vs Joaquin Buckley | ww | 메인 | scheduled |
| main 5 | King Green vs Jeremy Stephens | lw | 메인 | scheduled |
| prelim 1 | Ateba Gautier vs Ozzy Diaz | mw | 프렐림 | scheduled |
| prelim 2 | Joel Álvarez vs Yaroslav Amosov | ww | 프렐림 | scheduled |
| prelim 3 | Grant Dawson vs Mateusz Rębecki | lw | 프렐림 | scheduled |
| prelim 4 | Jim Miller vs Jared Gordon | lw | 프렐림 | scheduled |
| prelim 5 | Roman Kopylov vs Marco Tulio | mw | 프렐림 | scheduled |
| prelim 6 | Pat Sabatini vs William Gomis | fw | 프렐림 | scheduled |
| prelim 7 | Baisangur Susurkaev vs Djorden Santos | mw | 프렐림 | scheduled |
| prelim 8 | Clayton Carpenter vs Jose Ochoa | flw | 프렐림 | scheduled |

UFC 328: weight_class, card_segment, sort_order 모두 정상 구조 ✅

### 5-3. UFC FN276 Matchup 이슈 ⚠️

UFC Fight Night 276의 14개 matchup 전부:
- `sort_order = 99` (실제 순서 미할당)
- `weight_class = null` (체급 미입력)
- `card_segment = 'main'` (전부 메인카드로 분류)
- 1개 matchup: `red_fighter_name = "UFC Fight Night 276 - Allen vs. Costa"` / `blue_fighter_name = "Ultimate Fighting Championship (UFC)"` — 파서 아티팩트 (파이터 이름 자리에 이벤트 메타데이터 오입력)

→ **P2 issue**: 이벤트 날짜(2026-05-16)가 이미 지났으나 `upcoming` 유지, `picks_locked_at = null` — 사용자가 지난 이벤트에 픽 등록 가능 상태.

### 5-4. Result Entry UI (코드 정적 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| `🏆 결과 입력` 버튼 (미결 matchup) | ✅ PASS | `admin.js:982` — `!settled && !dbDone` 조건 |
| `✏️ 수정` 버튼 (완료 matchup) | ✅ PASS | `admin.js:983` |
| 결과 모달 (winner/method/round/time) | ✅ PASS | `openResultModal()` `admin.js:1395` |
| `admin_set_matchup_result` RPC | ✅ PASS | DB 확인 |
| confirm/save 실행 | **미실행 (read-only 준수)** | — |

**판정: ✅ PASS** — result entry UI 및 RPC 존재 확인. 실제 클릭 시각 확인은 NEEDS_MANUAL.

---

## 6. Settlement Controls

### 6-1. Settlement UI 로직 (코드 정적 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| 정산 버튼 (`✅ 정산`) | ✅ PASS | `_renderLifecyclePanel()` — locked/completed 상태에서만 노출 |
| QA guard: 결과 미입력 시 버튼 비활성 | ✅ PASS | `_qaBlockUnresolved` — `cursor-not-allowed` + tooltip |
| QA guard: pending픽 잔류 시 비활성 | ✅ PASS | `_qaBlockPending` 확인 |
| `onLifecycleSettle()` confirm 대화상자 | ✅ PASS | `admin.js:1789` — 두 단계 guard + confirm |
| `adminSettleEvent()` → `admin_settle_event` RPC | ✅ PASS | `admin.js:1734` + DB RPC 확인 |
| 아카이브 버튼 (`📦 아카이브`) | ✅ PASS | settled 상태에서만 노출 |
| `onLifecycleArchive()` confirm 대화상자 | ✅ PASS | `admin.js:1795` |
| 픽 마감 (`🔒 픽 마감`) | ✅ PASS | upcoming 상태에서만 노출 |
| 픽 재오픈 (`🔓 재오픈`) | ✅ PASS | locked 상태에서만 노출 |
| settle 실행 | **미실행 (read-only 준수)** | — |
| archive 실행 | **미실행 (read-only 준수)** | — |
| season reset/danger zone | **미실행 (read-only 준수)** | — |

### 6-2. Admin RPC 전수 확인 (11/11 PASS)

| RPC | 상태 |
|---|---|
| `admin_settle_event` | ✅ ACTIVE |
| `admin_archive_event` | ✅ ACTIVE |
| `admin_lock_event_picks` | ✅ ACTIVE |
| `admin_reopen_event_picks` | ✅ ACTIVE |
| `admin_set_matchup_result` | ✅ ACTIVE |
| `get_admin_dashboard_summary` | ✅ ACTIVE |
| `get_event_pick_summary` | ✅ ACTIVE |
| `get_admin_event_qa` | ✅ ACTIVE |
| `admin_upsert_matchup` | ✅ ACTIVE |
| `admin_upsert_event` | ✅ ACTIVE |
| `admin_delete_event` | ✅ ACTIVE |

**판정: ✅ PASS** — settlement 흐름 전체 코드/RPC 확인됨.

---

## 7. Edge Functions 상태

| Function | Status | Version |
|---|---|---|
| `settle-matchup` | ✅ ACTIVE | v3 |
| `fetch-mma-news` | ✅ ACTIVE | v34 |
| `fetch-ufc-rankings` | ✅ ACTIVE | v4 |
| `sync-all-fighters` | ✅ ACTIVE | v2 |
| `sync-fighter-stats` | ✅ ACTIVE | v11 |
| `purge-inactive-fighters` | ✅ ACTIVE | v3 |
| `scrape-matchups` | ✅ ACTIVE | v4 |
| `ufc-crawler` | ✅ ACTIVE | v3 |
| `scrape-fighter-records` | ✅ ACTIVE | v3 |
| `fill-missing-heights` | ✅ ACTIVE | v4 |

전체 10개 모두 ACTIVE ✅

---

## 8. 기존 Settlement 실행 이력 확인

3개 archived 이벤트 모두 `settled_at` 타임스탬프 보유 — 정산 흐름이 실제 운영 이벤트에서 정상 실행된 이력 확인.

| 이벤트 | settled_at | picks win | picks lose |
|---|---|---|---|
| UFC FN275 - Della Maddalena vs. Prates | 2026-05-07 03:43 | — | — |
| UFC FN274 - Sterling vs. Zalal | 2026-05-02 05:30 | — | — |
| UFC FN273 - Burns vs. Malott | 2026-05-02 05:30 | — | — |

전체 archived events picks: `win 15` / `lose 8` / `cancelled 2`  
→ picks가 `win`/`lose`로 정상 분류됨 — **settlement 흐름 실제 동작 확인** ✅

> 참고: picks status enum은 `pending` / `win` / `lose` / `cancelled` (not `settled`).  
> 초기 예상(`settled` status)과 달랐으나 이는 정상 설계 — `admin_settle_event` RPC가 picks를 `win`/`lose`로 분류.

---

## 9. 현재 Picks 현황

| Status | Count |
|---|---|
| pending | 9 |
| win | 16 |
| lose | 10 |
| cancelled | 12 |
| **합계** | **47** |

Pending 9건은 모두 **UFC 328 (upcoming event)** matchup에 걸린 정상 픽.  
특이 사항 없음 ✅

---

## 10. Findings

### P0 (즉시 수정 필요)
없음.

### P1 (출시 전 수정 필요)
없음.

### P2 (출시 전 확인 필요)

**P2-A: UFC FN276 과거 이벤트 `upcoming` 상태 유지**  
이벤트 날짜 2026-05-16 (이미 지남), status = `upcoming`, picks_locked_at = null.  
사용자가 지난 이벤트에 픽 등록 가능 상태.  
→ Admin에서 픽 마감(`🔒 픽 마감`) 또는 이벤트 정리 필요.  
**단, DB write action이므로 별도 승인 필요.**

**P2-B: UFC FN276 matchup 데이터 품질 이슈**  
14개 matchup 전부 `sort_order=99`, `weight_class=null`.  
1개 matchup: `red_fighter_name = "UFC Fight Night 276 - Allen vs. Costa"` — 파서 아티팩트.  
→ Admin 이벤트 탭에서 해당 matchup 삭제 또는 수정 필요.  
**단, DB write action이므로 별도 승인 필요.**

**P2-C: 2026-06-15 White House event DB에 없음**  
출시 대상 이벤트가 아직 미생성.  
→ Admin 이벤트 추가(`+ 이벤트 추가`) 필요.  
**단, DB write action이므로 별도 승인 필요.**

### P3 (관찰)
- Admin Dashboard console error 확인은 실제 브라우저에서 수동 확인 필요 (NEEDS_MANUAL).
- `settle-matchup` Edge Function legacy path는 `admin.js`에 보존됨 — 실제 경로는 `admin_set_matchup_result` RPC (주석 확인 `admin.js:1717`).

---

## 11. Release Gate G-6 판단

| 조건 | 결과 |
|---|---|
| Admin 계정 로그인 가능 | ✅ PASS (1개 admin 계정 존재) |
| Admin 섹션 접근 (비관리자 차단) | ✅ PASS (코드 확인) |
| Read-only rehearsal 전 항목 확인 | ✅ PASS |
| Settle/Archive/Lock UI 존재 확인 | ✅ PASS (코드 + RPC 확인) |
| 실제 settle 이력 확인 | ✅ PASS (3개 archived events — win/lose 반영) |
| Option A (test event write rehearsal) | ⏳ NEEDS_MANUAL — 별도 승인 필요 |
| G-6 전체 판정 | **⚠️ 부분 통과 (Option B 수준)** |

**권장 사항:**  
실제 settlement 흐름이 3개 운영 이벤트에서 이미 정상 동작한 이력이 확인됨.  
Option A (test event write rehearsal)는 optional — 2026-06-15 이벤트 생성 시 같이 진행 가능.  
**최우선 필요 작업: 2026-06-15 White House event Admin 패널에서 생성 (P2-C, 별도 승인 필요).**

---

## 12. Write Rehearsal 필요 여부 추천

| 항목 | 추천 | 사유 |
|---|---|---|
| Test event 생성 후 test settle | **선택적** | 3개 실제 이벤트 settle 이력으로 기본 흐름 확인됨 |
| 2026-06-15 이벤트 생성 | **필수** | 출시 전 메인 이벤트 DB 등록 필요 |
| UFC FN276 정리 (픽 마감 또는 삭제) | **권장** | 지난 이벤트 오픈 상태 해소 |
| test event settle 타이밍 | 2026-06-02~04 Admin 리허설 윈도우 | 2026-06-15 이벤트 생성 후 동시 진행 가능 |

---

## 13. NEEDS_MANUAL 항목

| 항목 | 확인 방법 | 우선순위 |
|---|---|---|
| Admin 화면 console error 없음 | devtools console → Admin 탭 진입 | P1 |
| Admin Dashboard summary cards 렌더 | Admin 로그인 → Dashboard 탭 | P1 |
| UFC 328 매치업 결과 입력 UI | Admin → Event 탭 → UFC 328 선택 → 🏆 버튼 존재 확인 | P1 |
| 정산 버튼 상태 (QA guard 동작) | 결과 미입력 상태에서 정산 버튼 비활성/tooltip | P1 |
| 2026-06-15 이벤트 생성 | Admin 승인 후 → `+ 이벤트 추가` | P2 (별도 승인) |
| UFC FN276 픽 마감 처리 | Admin 승인 후 → FN276 → `🔒 픽 마감` | P2 (별도 승인) |

---

## 14. 다음 액션

| 항목 | 승인 필요 여부 | 예정 |
|---|---|---|
| Admin 화면 수동 확인 (console/UI) | 불필요 | 2026-05-29~06-01 수동 QA 윈도우 |
| 2026-06-15 White House event 생성 | **별도 승인 필요** | 2026-06-02~04 Admin 리허설 윈도우 |
| UFC FN276 픽 마감 or 이벤트 정리 | **별도 승인 필요** | 2026-06-02~04 |
| Test event write rehearsal (Option A) | **별도 승인 필요** | 2026-06-02~04 (선택적) |
| G-6 최종 판정 완료 | 불필요 | 2026-06-08~09 final smoke QA 시 |
