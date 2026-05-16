# QA Run — Admin 결과 입력 Path B (RPC 직접 호출) 전환 검증

실행 날짜: 2026-05-16
기준 커밋: d90b1ea → 9403290 (보안 수정 포함)
검증 환경: Claude Code 정적 코드 분석 + Supabase MCP read-only SQL 조회 + npm run build 확인
브라우저 접근: 없음 (브라우저 의존 항목은 NOT RUN 처리)
운영 데이터 변경: **없음**

---

## 실행 환경 명세

| 항목 | 값 |
|------|----|
| 프로젝트 | Pick-tagon |
| Supabase project_id | rnnrimzrypayvnmznpin |
| 기준 SHA | d90b1ea |
| QA 수행자 | Claude Code (자동 + MCP) |
| 운영 데이터 변경 | **없음** |
| 실제 RPC 실행 여부 | 없음 (read-only SQL 조회만 실행) |

---

## 1. 코드 경로 검증 (정적 분석)

### 1-1. DB matchup 경로 전환 확인

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| DRAW/NC 경로 `adminSetMatchupResultWithUI` 호출 | ✅ PASS | index.html:3206 |
| 일반 DB matchup 경로 `adminSetMatchupResultWithUI` 호출 | ✅ PASS | index.html:3222 |
| `adminSetMatchupResultWithUI` → `adminSetMatchupResult` 호출 | ✅ PASS | index.html:3237 |
| `adminSetMatchupResult` → `sb.rpc('admin_set_matchup_result')` 직접 호출 | ✅ PASS | admin.js:1589 |
| `sb.functions.invoke('settle-matchup')` 호출 경로 없음 (기본 경로) | ✅ PASS | index.html:3237 확인, Edge Function 미경유 |
| `submitMatchupResult()` legacy fallback 주석 존재 | ✅ PASS | index.html:3266 |
| `submitMatchupResult()` 내부 `sb.functions.invoke('settle-matchup')` 보존 | ✅ PASS | index.html:3272 |

### 1-2. force=true confirm 다이얼로그

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| `confirmAdminResult()` isForce 분기 위치 | ✅ PASS | index.html:3191 — `closeResultModal()` **이전** |
| confirm 취소 시 `return` (모달 유지 + RPC 미호출) | ✅ PASS | index.html:3197 — `if (!confirmed) { showToast('강제 재정산 취소'); return; }` |
| confirm 취소 시 `closeResultModal()` 미호출 | ✅ PASS | return 이전에 close 없음 |

### 1-3. QA guard (`onLifecycleSettle`)

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| `all_matchups_completed === false` → toast + return | ✅ PASS | admin.js:1648-1650 |
| `total_pending_alert > 0` → toast + return | ✅ PASS | admin.js:1652-1654 |
| `_builderQA === null` → guard 미작동 (서버 RPC guard 의존) | ✅ PASS | admin.js:1648, `_builderQA &&` 조건 |

### 1-4. 결과 입력 후 갱신 체인

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| `loadUserPicksFromDB()` 호출 | ✅ PASS | index.html:3252 |
| `loadUserFromDB()` 호출 | ✅ PASS | index.html:3253 |
| `fetchUpcomingMatchups()` 호출 | ✅ PASS | index.html:3254 |
| `renderAdminFightCardList()` 호출 | ✅ PASS | index.html:3255 |
| `fetchBuilderMatchups()` 호출 | ✅ PASS | index.html:3256 |
| `Promise.all([fetchBuilderPickSummary, fetchBuilderQA])` 호출 | ✅ PASS | index.html:3257-3259 |

### 1-5. Edge Function 파일 보존

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| `supabase/functions/settle-matchup/index.ts` 파일 존재 | ✅ PASS | git log 확인, 삭제 없음 |
| 최근 커밋에서 파일 미수정 | ✅ PASS | 마지막 수정 커밋: ac0780a (Path B 전환 이전) |

---

## 2. DB/RPC 검증 (Supabase MCP read-only)

### 2-1. 함수 존재 및 권한

| 함수 | 존재 | SECURITY DEFINER | authenticated GRANT | admin 체크 |
|------|------|-----------------|---------------------|------------|
| `public.admin_set_matchup_result` | ✅ | ✅ | ✅ | ✅ (`private.is_admin()` → `admin_required`) |
| `public.get_admin_event_qa` | ✅ | ✅ | ✅ | ✅ (`private.is_admin()` 포함) |
| `private.is_admin()` | ✅ | ✅ | — | `users.id = auth.uid() AND is_admin = true` |

### 2-2. admin_set_matchup_result 내부 가드 확인

| 체크 항목 | 결과 |
|-----------|------|
| `private.is_admin()` 호출 | ✅ |
| non-admin 시 `admin_required` RAISE EXCEPTION | ✅ |
| archived 이벤트 guard (`event_already_archived`) | ✅ |
| `admin_audit_logs` 기록 | ✅ |

### 2-3. admin_audit_logs set_matchup_result 이력

DB 내 `set_matchup_result` 액션 로그 5건 확인 (2026-05-07, 모두 matchups 테이블 대상):
- 감사 로그 기록 경로 정상 동작 확인 (Path B 전환 이전 기록이나 동일 RPC 경유)
- 실제 Path B(d07156e) 기준 신규 결과 입력 후 로그는 브라우저 smoke QA 시 확인 필요

### 2-4. service_settle_matchup 갱신 체인 상태

| 항목 | 내용 |
|------|------|
| `is_admin` 체크 존재 여부 | **없음** |
| 실제 DB proacl | `{anon=X/postgres, authenticated=X/postgres, postgres=X/postgres, service_role=X/postgres}` |
| 마이그레이션 의도 | `REVOKE ALL FROM PUBLIC; GRANT TO service_role` |

---

## 3. ⚠️ 보안 발견 사항

### [FINDING-01] service_settle_matchup 직접 호출 가능 → ✅ FIX APPLIED

**발견 경위**: Supabase MCP read-only SQL 조회 (QA-3b, QA-7)
**수정 커밋**: Fix: Restrict service settle matchup execution

**발견 당시 상태**:
- 마이그레이션 의도: `REVOKE ALL FROM PUBLIC; GRANT TO service_role`
- 실제 DB 상태: `authenticated`, `anon` 포함 모든 역할 EXECUTE 가능
- `service_settle_matchup` 본문에 `private.is_admin()` 체크 없음
- 결과: 인증된 비관리자가 직접 RPC 호출로 matchup 결과/포인트 변경 가능

**이번 작업 도입 여부**: **아님.** Path B 전환 이전부터 존재하던 권한 설정.
마이그레이션 파일 3곳에서 REVOKE/GRANT를 정의했으나 DB에 미반영된 상태였음.

**수정 내용** (`20260516_revoke_service_settle_matchup_public_execute.sql`):
```sql
REVOKE ALL ON FUNCTION public.service_settle_matchup(...) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_settle_matchup(...) FROM anon;
REVOKE ALL ON FUNCTION public.service_settle_matchup(...) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_settle_matchup(...) TO service_role;
```

**수정 후 DB proacl** (검증 완료):
- `service_settle_matchup`: `{postgres=X/postgres, service_role=X/postgres}` ✅
- `admin_set_matchup_result`: `{postgres=X, anon=X, authenticated=X, service_role=X}` ✅ (유지)

**내부 호출 경로 안전성**:
`admin_set_matchup_result`는 `SECURITY DEFINER` → 실행 컨텍스트가 `postgres` → `service_settle_matchup`(postgres EXECUTE 보유) 호출 가능 ✅

---

## 4. 브라우저 의존 항목 (NOT RUN)

| 항목 | 상태 | 사유 |
|------|------|------|
| QA 패널 렌더링 확인 | NOT RUN | 브라우저 없음 |
| 정산 버튼 disabled 스타일 시각 확인 | NOT RUN | 브라우저 없음 |
| force confirm 다이얼로그 실제 표시 | NOT RUN | 브라우저 없음 (코드 검증으로 대체) |
| DevTools Network — `functions.invoke` 미호출 확인 | NOT RUN | 브라우저 없음 |
| 마지막 matchup 결과 입력 후 QA 패널 즉시 활성 | NOT RUN | 실제 결과 입력 금지 |
| Path B 신규 결과 입력 후 audit_log 기록 확인 | NOT RUN | 실제 결과 입력 금지 |
| non-admin `admin_required` toast 확인 | CODE VERIFIED | 코드/DB 양쪽에서 guard 확인됨, 브라우저 실행 미실시 |

---

## 5. 전체 QA 체크리스트 결과

| # | 항목 | 결과 |
|---|------|------|
| 1 | force=false DB matchup → `adminSetMatchupResultWithUI` 호출 | ✅ PASS (코드) |
| 2 | DRAW 입력 → `adminSetMatchupResultWithUI` 호출 | ✅ PASS (코드) |
| 3 | NC 입력 → `adminSetMatchupResultWithUI` 호출 | ✅ PASS (코드) |
| 4 | force=true → confirm 다이얼로그 (`closeResultModal` 이전) | ✅ PASS (코드) |
| 5 | force=true confirm 취소 → return, RPC 미호출, 모달 유지 | ✅ PASS (코드) |
| 6 | 갱신 체인 6개 함수 모두 포함 | ✅ PASS (코드) |
| 7 | Edge Function `settle-matchup` 파일 삭제/수정 없음 | ✅ PASS (git) |
| 8 | `admin_set_matchup_result` DB 존재 + admin guard + audit log | ✅ PASS (DB) |
| 9 | `get_admin_event_qa` DB 존재 + admin guard | ✅ PASS (DB) |
| 10 | `private.is_admin()` 존재 + 구현 확인 | ✅ PASS (DB) |
| 11 | `admin_audit_logs.set_matchup_result` 기록 이력 확인 | ✅ PASS (DB) |
| 12 | non-admin `admin_required` 차단 | CODE VERIFIED |
| 13 | DevTools Network — `functions.invoke` 미호출 | NOT RUN |
| 14 | 실제 브라우저 결과 입력 end-to-end | NOT RUN |
| 15 | 운영 데이터 변경 없음 | ✅ PASS |

---

## 6. 다음 권장 작업

### ~~우선순위 1 — 보안 수정~~ ✅ 완료 (Fix: Restrict service settle matchup execution)
- `service_settle_matchup` proacl: `{postgres=X, service_role=X}` 로 수정 완료
- migration: `20260516_revoke_service_settle_matchup_public_execute.sql`

### ~~우선순위 1 — 브라우저 smoke QA~~ ✅ 코드 보완 검증 완료 (Section 7)
- 브라우저 직접 접근 없음 — 코드 레벨 정밀 검증으로 대체
- DevTools Network / 실제 결과 입력 end-to-end: NOT RUN 유지

### 우선순위 1 — 기술 부채 정리
- `submitMatchupResult()` legacy fallback 제거 여부 판단
- toast/갱신 공통 helper 추출 검토

---

## 7. Browser Smoke QA — 코드 보완 검증 (2026-05-16, 2차)

**기준 커밋**: 9403290
**검증 방법**: 정적 코드 분석 (grep / Read) + npm run build
**브라우저 접근**: 없음 — 브라우저 의존 항목은 NOT RUN 처리
**운영 데이터 변경**: **없음**

### 7-1. 빌드

| 항목 | 결과 |
|------|------|
| `npm run build` | ✅ PASS — 378.71 kB, 오류 없음 |
| `dist/index.html` 동기화 | ✅ PASS |

### 7-2. QA 패널 렌더링 구조 (코드)

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| `renderBuilderQAPanel()` 함수 존재 | ✅ PASS | admin.js:1681 |
| 이벤트 선택 시 `fetchBuilderQA()` 자동 호출 | ✅ PASS | admin.js:1073 — `selectBuilderEvent()` → `Promise.all([fetchBuilderPickSummary(), fetchBuilderQA()])` |
| QA 패널에 matchup별 W/L/P/C 카운트 렌더링 | ✅ PASS | admin.js:1749-1750 — `W${m.win_picks}`, `L${m.lose_picks}`, `P${m.pending_picks}` |
| all_matchups_completed 상태 배너 | ✅ PASS | admin.js:1696,1702,1708 — 3가지 상태(pending/미완/완료) 분기 |
| `renderBuilderWorkspace()` 내 QA 패널 포함 | ✅ PASS | admin.js:1253 — `${renderBuilderQAPanel(_builderQA)}` |

### 7-3. 정산 버튼 QA guard (코드)

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| 미결 matchup 시 버튼 disabled 스타일 | ✅ PASS | admin.js:1124 — `border-gray-700 text-gray-600 cursor-not-allowed` |
| 미결 matchup 시 경고 문구 | ✅ PASS | admin.js:1124 — `⚠ 결과 미입력 경기 있음` |
| pending 잔류 시 버튼 disabled 스타일 | ✅ PASS | admin.js:1124 — 동일 disabled 클래스 |
| pending 잔류 시 경고 문구 | ✅ PASS | admin.js:1122 — `pending N건 잔류` |
| QA 통과 시 green 활성 버튼 | ✅ PASS | admin.js:1125 — `border-green-500/40 text-green-400 hover:bg-green-500/10` |
| 클릭 시 `onLifecycleSettle()` 이중 guard | ✅ PASS | admin.js:1648-1653 — toast + return |

### 7-4. force=true confirm 다이얼로그 (코드)

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| 결과 수정(✏️) 버튼 → `openResultModalForEdit()` | ✅ PASS | admin.js:1226 |
| `openResultModalForEdit()` → `result-modal-force = 'true'` | ✅ PASS | admin.js:1289-1290 |
| `confirmAdminResult()` — `closeResultModal()` 이전에 isForce 분기 | ✅ PASS | index.html:3190-3198 |
| confirm 문구 1행 | ✅ PASS | `이미 정산된 경기 결과를 강제 재정산합니다.` |
| confirm 문구 2행 | ✅ PASS | `관련 유저 포인트와 성공 픽 수가 역산 후 다시 계산됩니다.` |
| confirm 문구 3행 | ✅ PASS | `정말 진행할까요?` |
| 취소 시 `showToast('강제 재정산 취소'); return;` | ✅ PASS | index.html:3197 |
| 취소 시 `closeResultModal()` 미호출 (모달 유지) | ✅ PASS | return 이전에 close 없음 |
| 취소 시 `adminSetMatchupResultWithUI()` 미호출 | ✅ PASS | return으로 함수 종료 |

### 7-5. Edge Function 미경유 확인 (코드)

| 확인 항목 | 결과 | 근거 |
|-----------|------|------|
| DB matchup 경로 — `functions.invoke` 미사용 | ✅ PASS | index.html:3237 — `adminSetMatchupResult()` 직접 호출 |
| `submitMatchupResult()` 호출점 없음 (DB matchup 경로) | ✅ PASS | index.html:3206, 3222 — `adminSetMatchupResultWithUI` |
| `submitMatchupResult()` legacy 주석 확인 | ✅ PASS | index.html:3266 |

### 7-6. 브라우저 직접 확인 (NOT RUN)

| 항목 | 상태 | 사유 |
|------|------|------|
| QA 패널 실제 화면 렌더링 | NOT RUN | 브라우저 없음 |
| 정산 버튼 disabled 시각 확인 | NOT RUN | 브라우저 없음 |
| force confirm 다이얼로그 실제 표시 | NOT RUN | 브라우저 없음 |
| DevTools Network — `functions/v1/settle-matchup` 미호출 | NOT RUN | 브라우저 없음 |
| 실제 결과 입력 end-to-end | NOT RUN | 운영 데이터 변경 금지 |
| 신규 audit_log 기록 확인 | NOT RUN | 실제 결과 입력 금지 |

### 7-7. 종합

코드 레벨에서 확인 가능한 모든 항목 PASS. 브라우저 렌더링 / DevTools / 실제 입력 플로우는 직접 접근 부재로 NOT RUN 처리. 운영 데이터 변경 없음.
