# QA Run — Admin 결과 입력 Path B (RPC 직접 호출) 전환 검증

실행 날짜: 2026-05-16
기준 커밋: d90b1ea (origin/main)
검증 환경: Claude Code 정적 코드 분석 + Supabase MCP read-only SQL 조회
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

### [FINDING-01] service_settle_matchup 직접 호출 가능 (HIGH RISK)

**발견 경위**: Supabase MCP read-only SQL 조회 (QA-3b, QA-7)

**내용**:
- 마이그레이션 의도: `REVOKE ALL ON FUNCTION public.service_settle_matchup FROM PUBLIC; GRANT EXECUTE TO service_role`
- 실제 DB 상태: `authenticated`, `anon` 포함 모든 역할이 EXECUTE 권한 보유
- `service_settle_matchup` 함수 본문에 `private.is_admin()` 체크 **없음**
- 결과: **인증된 비관리자 사용자가 직접 `service_settle_matchup` RPC를 호출해 matchup 결과를 입력하고 points를 변경할 수 있음**

**이번 작업 도입 여부**: **아님.** Path B 전환 이전부터 존재하던 권한 설정.
마이그레이션 파일 3곳(20260426_event_lifecycle.sql, 20260426_settle_matchup_v3.sql, 20260503_fix_service_settle_matchup_archive_date_cast.sql) 모두 동일한 REVOKE/GRANT가 적용됐으나 DB에는 반영되지 않은 상태.

**현재 위험도**:
- `admin_set_matchup_result` 경로는 안전 (admin 체크 + audit log ✓)
- `service_settle_matchup` 직접 호출 경로는 가드 없음

**권고 조치**:
```sql
-- migration 필요 (별도 승인 후 진행)
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_settle_matchup(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO service_role;
```
또는 함수 본문에 admin 체크 추가 (단, 설계 의도와 다름 — service_settle_matchup은 내부 전용).

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

### 우선순위 1 — 보안 수정 (별도 승인 필요)
- `service_settle_matchup` 직접 호출 권한 수정 migration 작성
  - `REVOKE` + 함수 본문 admin 체크 추가 또는 `service_role`만 EXECUTE
  - **이번 세션에서 코드/DB 변경 금지 — 별도 보고 후 진행**

### 우선순위 2 — 브라우저 smoke QA
- 실제 브라우저에서 force confirm / QA guard / audit_log 항목 확인
- 새 결과 입력 1건 (test matchup 또는 별도 승인 후 실 matchup)

### 우선순위 3 — 기술 부채 정리
- `submitMatchupResult()` legacy fallback 제거 여부 판단
- toast/갱신 공통 helper 추출 검토
