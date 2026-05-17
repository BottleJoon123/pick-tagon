# Picktagon Next Work Plan

최초 작성: 2026-05-02 / 마지막 업데이트: 2026-05-17 (Phase S3-B admin HOF UI 연결 완료)
현재 기준 커밋: push 후 최신 SHA 확인

---

## 2026-05-17 마감 상태 (22차)

**origin/main = HEAD = 8e7a967 (push 예정)**

**오늘 완료 (22차): Phase S3-B — admin HOF soft hide UI 연결**

**변경 파일:**
- `supabase/migrations/20260517_season_hof_admin_get_rpc.sql` (신규)
- `public/js/season.js`
- `public/js/admin.js`
- `dist/index.html` (빌드 산출물)
- `docs/SEASON_HOF_ADMIN_PLAN.md`
- `docs/NEXT_WORK_PLAN.md`

**DB 변경:**
- `admin_get_hall_of_fame()` RPC 추가: hof_id + is_hidden + hidden_at + hidden_reason 포함, is_admin guard, authenticated only, anon REVOKE

**JS 변경:**
- `seasonData.adminHallOfFame` 필드 추가
- `loadAdminHallOfFameFromDB()` 추가 — admin_get_hall_of_fame RPC 기반
- `renderSeasonAdminPanel()` 개선 — adminHallOfFame 기반 렌더, per-rank 숨김(빨간)/복구(노란) 버튼
- `hideSeasonHofEntry(hofId)` 추가 — admin_hide_hof_entry RPC + confirm dialog
- `restoreSeasonHofEntry(hofId)` 추가 — admin_restore_hof_entry RPC
- `deleteSeasonRecord()` 완전 제거 (no-op toast 삭제)
- admin.js: season 탭 → `loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel)`

**DB 검증:**
- `admin_get_hall_of_fame` 함수 존재, is_admin guard ✓
- `admin_get_hall_of_fame` acl: authenticated ✓ / anon ✗ ✓
- apply_migration 성공 ✓

**빌드 검증:**
- `npm run build` PASS ✓
- dist에서 `deleteSeasonRecord` / `DB 관리 예정` 문구 없음 ✓
- 운영 데이터 수정 없음 ✓

**다음 세션 후보 (우선순위 순):**
A. Phase P3 (선택): settled 이벤트 force 재정산 UI confirm 경고 강화
B. localStorage settleBet/simulateFight 정리
C. Phase S3-C (선택): admin HOF 숨김/복구 통합 테스트

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (21차)

**origin/main = HEAD = 3b17a54 (push 예정)**

**오늘 완료 (21차): Phase S3-A — season_hof soft hide DB migration + RPC**

**변경 파일:**
- `supabase/migrations/20260517_season_hof_soft_hide_rpc.sql` (신규)
- `docs/SEASON_HOF_ADMIN_PLAN.md`
- `docs/NEXT_WORK_PLAN.md`

**DB 변경:**
- `season_hof` 컬럼 추가: `is_hidden BOOLEAN NOT NULL DEFAULT FALSE`, `hidden_at`, `hidden_by`, `hidden_reason`
- `get_hall_of_fame()` 수정: `AND h.is_hidden = FALSE` 필터 추가 (하위 호환, 반환 구조 변경 없음)
- `admin_hide_hof_entry(p_hof_id, p_reason)` RPC 추가
- `admin_restore_hof_entry(p_hof_id)` RPC 추가

**DB 검증:**
- `is_hidden` 컬럼: boolean NOT NULL DEFAULT false ✓
- `get_hall_of_fame` 본문: `AND h.is_hidden = FALSE` 존재 ✓
- `admin_hide_hof_entry`: is_admin guard ✓ / active_season_not_allowed guard ✓ / idempotent ✓ / audit_logs ✓
- `admin_restore_hof_entry`: is_admin guard ✓ / idempotent ✓ / audit_logs ✓
- `admin_hide_hof_entry` acl: authenticated ✓ / anon ✗ ✓
- `admin_restore_hof_entry` acl: authenticated ✓ / anon ✗ ✓
- `get_hall_of_fame` acl: anon ✓ / authenticated ✓ 유지 ✓
- apply_migration 성공 ✓ / 운영 데이터 수정 없음 ✓

**다음 세션 후보 (우선순위 순):**
A. Phase S3-B: admin UI 연결 (숨김/복구 버튼, `deleteSeasonRecord` → `hideSeasonHofEntry` 교체, admin-hof-list 렌더 개선)
B. Phase P3 (선택): settled 이벤트 force 재정산 UI confirm 경고 강화
C. localStorage settleBet/simulateFight 정리

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (20차)

**origin/main = HEAD = ab3a808 (push 예정)**

**오늘 완료 (20차): deleteSeasonRecord DB 연동 설계 — read-only 조사 + 정책 문서화**

**변경 파일:**
- `docs/SEASON_HOF_ADMIN_PLAN.md` (신규)
- `docs/NEXT_WORK_PLAN.md`

**조사 결과:**
- `deleteSeasonRecord`: 현재 완전 비활성화 (토스트만 표시), UI 버튼 없음
- `renderSeasonAdminPanel` HOF 목록: "DB 관리 예정" 라벨만, 삭제 버튼 없음
- `season_hof` 테이블: `is_hidden`/`is_visible` 컬럼 없음 — soft hide 미구현 상태
- RLS 활성화, 모든 mutation은 SECURITY DEFINER RPC 경유, 직접 접근 불가
- `get_hall_of_fame`: `is_active = FALSE` 시즌만 반환 (종료 시즌 전용)
- active season HOF 행은 구조상 존재하지 않음 (admin_end_season 호출 시점에 생성)
- localStorage는 DB fallback 용도로 유지, DB 로드 성공 시 항상 갱신

**정책 추천: 후보 B (soft hide)**
- `season_hof.is_hidden` 컬럼 추가 → `get_hall_of_fame` WHERE 필터
- `admin_hide_hof_entry` / `admin_restore_hof_entry` RPC
- active season HOF 숨기기 RPC 레벨 차단
- audit_logs 기록 필수
- hard delete 비추천 (운영 이력 보존 원칙)

**다음 세션 후보 (우선순위 순):**
A. Phase S3-A: `season_hof.is_hidden` schema + hide/restore RPC migration
B. Phase S3-B: admin UI 연결 (숨김/복구 버튼, `deleteSeasonRecord` 교체)
C. Phase P3 (선택): settled 이벤트 force 재정산 UI confirm 경고 강화
D. localStorage settleBet/simulateFight 정리

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (19차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (19차): Phase P2 — force=true audit before snapshot 강화 (fix 포함)**

**변경 파일:**
- `supabase/migrations/20260517_admin_set_matchup_result_force_audit.sql` (신규)
- `supabase/migrations/20260517_admin_set_matchup_result_force_audit_fix.sql` (신규)
- `docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md`
- `docs/NEXT_WORK_PLAN.md`

**수정 내용 (fix 포함 최종):**
- `admin_set_matchup_result`에 `p_force=true` 시 역산 대상 picks 집계 추가
- picks_before_reversal 필드:
  - `win_count` / `lose_count` / `cancelled_count` / `total_count`
  - `affected_user_count` — 영향받는 고유 유저 수
  - `win_settled_payout_total` / `lose_bet_cost_total` / `cancelled_bet_cost_total`
  - `net_reversal_points_delta` — 역산 순 포인트 변화량 (`-win + lose - cancelled`)
  - `total_settled_payout` — 하위 호환 유지
- anon EXECUTE 명시적 REVOKE (`admin_set_matchup_result` acl에서 anon 제거)
- 기존 동작(is_admin guard, archived guard, service_settle_matchup, 반환값) 변경 없음

**DB 검증:**
- `net_reversal_points_delta` / `affected_user_count` / `lose_bet_cost_total` / `cancelled_bet_cost_total` 존재 ✓
- `ARCHIVED GUARD OK` / `ADMIN GUARD OK` / `SECURITY DEFINER` ✓
- `admin_set_matchup_result` acl: `{postgres=X, authenticated=X, service_role=X}` ✓
- `service_settle_matchup` acl: `{postgres=X, service_role=X}` 유지 ✓
- apply_migration 성공 (2회) ✓ / 운영 데이터 수정 없음 ✓

**Phase P1+P2 완료 요약:**
- P1: `service_settle_matchup` settled 이벤트 상태 역행 버그 수정
- P2: `admin_set_matchup_result` force=true audit before snapshot 강화

**다음 세션 후보 (우선순위 순):**
A. Phase P3 (선택): settled 이벤트 force 재정산 UI confirm 경고 강화
B. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)
C. localStorage settleBet/simulateFight 정리

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (18차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (18차): Phase P1 — settled 이벤트 상태 역행 버그 수정**

**변경 파일:**
- `supabase/migrations/20260517_fix_settle_matchup_event_status_regression.sql` (신규)
- `docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md` (Phase P1 완료 기록)
- `docs/NEXT_WORK_PLAN.md`

**수정 내용:**
- `service_settle_matchup` 이벤트 자동 완료 UPDATE에 조건 추가:
  ```sql
  WHERE id = v_matchup.event_id
    AND status NOT IN ('settled', 'archived')   -- 추가
  ```
- settled/archived 이벤트에 force 재정산 후에도 events.status가 역행하지 않음
- 정산/포인트/역산/archive snapshot 로직 변경 없음

**DB 검증:**
- `service_settle_matchup` 본문 `FIX PRESENT` ✓
- `service_settle_matchup` proacl: `{postgres=X, service_role=X}` — anon/authenticated 없음 ✓
- `admin_set_matchup_result`: `SECURITY DEFINER`, `ARCHIVED GUARD OK`, authenticated GRANT 유지 ✓
- apply_migration 성공 ✓
- 운영 데이터 수정 없음 ✓

**다음 세션 후보 (우선순위 순):**
A. Phase P2: force=true audit before snapshot 강화
   - force=true 시 역산 picks 집계 + 총 포인트 회수 합계를 audit log metadata에 추가
   - `admin_set_matchup_result` 수정 migration 필요
B. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)
C. localStorage settleBet/simulateFight 정리

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (17차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (17차): settled/archived 결과 수정 정책 설계 (read-only 조사)**

**변경 파일:**
- `docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md` (신규)
- `docs/NEXT_WORK_PLAN.md`

**주요 발견:**

1. **archived 이벤트 차단 이미 구현됨** (20260503 migration):
   - `admin_set_matchup_result`에서 `archived` 이벤트는 `event_already_archived` 예외로 차단
   - 추가 구현 불필요

2. **CRITICAL 버그 발견: settled 이벤트 상태 역행**
   - 시나리오: `settled` 이벤트 matchup에 force=true 재정산 실행
   - `service_settle_matchup` 내부: 모든 matchup 완료 시 `events.status = 'completed'` 무조건 SET
   - 결과: `settled` → `completed` 상태 역행 발생
   - 대시보드 `unsettled_events` 카운트 증가 (이상 감지 알림 오작동)
   - archive_fights 스냅샷도 재작성됨
   - **수정 필요: `WHERE status NOT IN ('settled','archived')` 조건 추가**

3. **audit before snapshot 부분적 부족**:
   - `before_data` = matchup 전체 row (✓ 충분)
   - `after_data` = 입력 파라미터만 (실제 after DB row 아님)
   - `metadata` = 재정산 집계 (settled_count 등) — 역산 집계 없음
   - force=true 여부가 audit log에 기록되지 않음
   - 강화 필요: force 재정산 시 역산 대상 picks 집계 + 총 포인트 회수 합계

4. **settled 이벤트 force 재정산 정책**:
   - 허용 유지 (KDI류 수정 필요 사례 존재)
   - Phase P1 버그 수정 + Phase P2 audit 강화로 안전성 보완

**추천 정책 (B + D + 버그 수정):**
- B: archived 차단 ✓ 이미 구현됨
- 버그 수정 (CRITICAL): settled 이벤트 상태 역행 패치
- D: force=true audit before snapshot 강화
- Phase P3 (선택): settled 이벤트 confirm 경고 강화

**구현 계획 (상세: docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md):**
- Phase P1: `service_settle_matchup` 상태 역행 버그 수정 (migration)
- Phase P2: `admin_set_matchup_result` force=true audit before snapshot 강화 (migration)
- Phase P3 (선택): UI reason/second confirm 추가

**코드/DB/운영 데이터 변경 없음** (read-only 조사)

**settle-matchup Edge Function:**
- 삭제하지 않고 보존 유지 (Phase 1 dead code 제거 완료, EF 파일은 보존)

**다음 세션 후보 (우선순위 순):**
A. Phase P1 버그 수정 (CRITICAL)
   - `service_settle_matchup` settled 이벤트 상태 역행 패치
   - migration: `20260517_fix_settle_matchup_event_status_regression.sql`
B. Phase P2 audit before snapshot 강화
   - force=true 시 역산 picks 집계 + 포인트 영향 audit metadata 추가
C. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-17 마감 상태 (16차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (16차): 기술 부채 Phase 1 — submitMatchupResult dead code 제거 + helper 추출**

**변경 파일:**
- `index.html`, `dist/index.html`
- `docs/NEXT_WORK_PLAN.md`

**변경 내용:**

제거:
- `submitMatchupResult()` 함수 정의 삭제 (index.html ~50줄)
  - `sb.functions.invoke('settle-matchup')` 호출 완전 제거
  - 3-retry cold start 로직 제거
  - 중복 toast/갱신 체인 제거

추가:
- `_showMatchupSettleToast(data, winnerName, winnerSide, method, round)`: 결과 toast 포맷 단일 관리
- `_runPostSettleRefresh()`: 6단계 갱신 체인 단일 관리

단순화:
- `adminSetMatchupResultWithUI()`: 4줄로 축약 (showToast → RPC → toast helper → refresh helper)

유지:
- `settle-matchup` Edge Function 파일(`supabase/functions/settle-matchup/index.ts`) 삭제 안 함 — 보존
- `settleBet()`, `simulateFight()` 미변경
- force=true confirm 다이얼로그 유지
- DRAW/NC 경로 유지
- Path B 동작 동일

**검증:**
- `submitMatchupResult(` index.html/dist: 0건 ✓
- `functions.invoke('settle-matchup')` index.html/dist: 0건 ✓
- `_showMatchupSettleToast`, `_runPostSettleRefresh` dist: 4건 ✓
- `supabase/functions/settle-matchup/index.ts` EXISTS ✓
- `npm run build` PASS (376.13 kB) ✓
- dist/index.html 동기화 ✓
- 코드 외 변경 없음 (DB/migration/운영 데이터 없음) ✓

**다음 세션 후보 (우선순위 순):**
A. Edge Function deprecation 판단
   - settle-matchup 배포 삭제 여부 (Path B 안정 확인 후)
B. archived/settled 결과 수정 정책 설계
   - before 스냅샷 audit log 저장 (DB migration)
C. localStorage settleBet/simulateFight 정리
   - simulateFight 테스트 전용 여부 확인 후 제거 판단

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (15차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (15차): 결과 입력 경로 기술 부채 분석 (read-only 조사)**

**변경 파일:**
- `docs/ADMIN_RESULT_PATH_TECH_DEBT_PLAN.md` (신규)
- `docs/NEXT_WORK_PLAN.md`

**조사 결과 요약:**

현재 경로:
- **운영 경로 (Path B)**: `confirmAdminResult → adminSetMatchupResultWithUI → adminSetMatchupResult → sb.rpc('admin_set_matchup_result')`
- **Dead code**: `submitMatchupResult()` (index.html:3267) — 어디서도 호출 안 됨
- **Dead code**: `settle-matchup` Edge Function — 현재 미호출 (배포 유지 중)
- **Legacy 경로**: `settleBet()` — localStorage fight 전용, 운영 환경 사용 없음

핵심 발견:
- `submitMatchupResult()`와 `adminSetMatchupResultWithUI()`가 toast 포맷 + 6단계 갱신 체인을 동일하게 중복
- `settle-matchup` Edge Function은 내부에서 `admin_set_matchup_result` RPC를 호출 (동일 최종 경로)
- `service_settle_matchup` 직접 호출 없음 — 보안 경로 정상
- archived/settled 이벤트 force 재정산 정책 미확정 (before 스냅샷 없음)

추천 구현 순서 (상세: docs/ADMIN_RESULT_PATH_TECH_DEBT_PLAN.md):
- Phase 1: `submitMatchupResult` 제거 + 공통 갱신 헬퍼 추출
- Phase 2: `settle-matchup` Edge Function 제거 (Path B 안정 확인 후)
- Phase 3: archived/settled 수정 정책 (before 스냅샷, DB migration)
- Phase 4: `settleBet` / `simulateFight` 정리 (판단 후)

**코드/DB/운영 데이터 변경 없음:**
- read-only 조사 전용, 코드 수정 없음, migration 없음

**다음 세션 후보 (우선순위 순):**
A. 기술 부채 Phase 1 실행
   - `submitMatchupResult()` 제거 (dead code, index.html:3266-3316)
   - 공통 갱신 헬퍼 `_runPostSettleRefresh()` 추출
B. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)
C. 실제 브라우저 D2 UI smoke QA (브라우저 접근 시)

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (14차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (14차): Admin 대시보드 Phase D2 — 운영 이상 감지 지표**

**변경 파일:**
- `supabase/migrations/20260516_admin_dashboard_summary_d2.sql` (신규)
- `public/js/admin.js`, `dist/js/admin.js`
- `docs/NEXT_WORK_PLAN.md`

**RPC 확장 (get_admin_dashboard_summary CREATE OR REPLACE):**
- D1 기존 필드 하위 호환 유지
- D2 신규 필드 5개 추가:
  - `points_paid_7d`: 최근 7일 win pick 지급 포인트 합계
  - `unresolved_matchups`: locked/completed 이벤트 내 결과 미입력 matchup 수
  - `unsettled_events`: locked/completed 이벤트 수 (정산 전)
  - `pending_picks_alert`: 전체 pending picks 수 (pending_picks_total과 동일 값)
  - `health_flags`: { has_pending_picks, has_unresolved_matchups, has_unsettled_events, has_active_battles }

**UI 추가 (admin.js):**
- health flags 경고 strip: 이상 감지 시 amber 경고, 정상 시 green "✓ 운영 이상 없음"
- D2 지표 카드 3종 grid (Unresolved / Unsettled Events / Points 7D)
  - 0이면 green, 이상 시 amber 강조
- 기존 D1 레이아웃 순서 유지 (이벤트 상태 → D2 카드 → D1 핵심 지표 3종 → 시즌 → 감사 로그)

**검증:**
- apply_migration 성공 ✓
- non-admin: `{ok:false, reason:'admin_required'}` ✓
- D1 + D2 필드 모두 함수 본문에 존재 확인 ✓
- `npm run build` PASS (378.71 kB) ✓
- `dist/js/admin.js` 동기화 확인 ✓
- 운영 데이터 수정 없음 ✓

**다음 세션 후보 (우선순위 순):**
A. 결과 입력 경로 기술 부채 정리
   - submitMatchupResult legacy fallback 제거 여부 판단
   - toast/갱신 공통 helper 추출
B. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)
C. 실제 브라우저 D2 UI smoke QA (브라우저 접근 시)

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (13차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (13차): Admin 결과 입력 Path B 브라우저 smoke QA (코드 보완 검증)**

**변경 파일:**
- `docs/QA_RUN_2026-05-16_ADMIN_RESULT_PATH_B.md` (Section 7 추가)
- `docs/NEXT_WORK_PLAN.md`

**QA 결과 요약 (Section 7):**
- 빌드: `npm run build` PASS (378.71 kB)
- QA 패널 렌더링 구조: 5항목 PASS
- 정산 버튼 QA guard: 6항목 PASS
- force=true confirm: 9항목 PASS
- Edge Function 미경유 확인: 3항목 PASS
- 브라우저 직접 확인: 6항목 NOT RUN (브라우저 없음 / 운영 데이터 변경 금지)

**NOT RUN 항목 (브라우저 직접 필요):**
- QA 패널 실제 화면 렌더링
- 정산 버튼 disabled 시각 확인
- force confirm 다이얼로그 실제 표시
- DevTools Network `settle-matchup` 미호출
- 실제 결과 입력 end-to-end / 신규 audit_log 기록

**다음 세션 후보 (우선순위 순):**
A. Admin 대시보드 Phase D2
   - 최근 7일 지급 포인트 / 미결 matchup 수 / 이상 감지 지표
B. 결과 입력 경로 기술 부채 정리
   - submitMatchupResult legacy fallback 제거 여부 판단
   - toast/갱신 공통 helper 추출
C. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (12차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (12차): service_settle_matchup 직접 호출 권한 차단 (FINDING-01 보안 수정)**

**변경 파일:**
- `supabase/migrations/20260516_revoke_service_settle_matchup_public_execute.sql` (신규)
- `docs/QA_RUN_2026-05-16_ADMIN_RESULT_PATH_B.md` (FINDING-01 fix 반영)
- `docs/NEXT_WORK_PLAN.md`

**수정 내용:**
- `service_settle_matchup` proacl에서 `anon`, `authenticated` EXECUTE 제거
- `service_role` GRANT 유지
- `admin_set_matchup_result` SECURITY DEFINER → postgres 컨텍스트 → 내부 호출 경로 정상

**수정 후 DB 검증:**
- `service_settle_matchup` proacl: `{postgres=X, service_role=X}` ✅
- `admin_set_matchup_result` proacl: `{postgres=X, anon=X, authenticated=X, service_role=X}` ✅ 유지
- Supabase apply_migration 성공

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. 실제 브라우저 smoke QA (NOT RUN 항목)
   - force confirm / audit_log 신규 기록 / DevTools network 확인
B. Admin 대시보드 Phase D2
   - 최근 7일 지급 포인트 / 미결 matchup 수 / 이상 감지 지표
C. 결과 입력 경로 후속 정리
   - submitMatchupResult legacy fallback 제거 여부 판단
   - toast/갱신 공통 helper 추출

---

## 2026-05-16 마감 상태 (11차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (11차): Admin 결과 입력 Path B 브라우저 smoke QA**

**변경 파일:**
- `docs/QA_RUN_2026-05-16_ADMIN_RESULT_PATH_B.md` (신규)
- `docs/ADMIN_RESULT_SETTLEMENT_PATH_PLAN.md` (Known Limitations + 이력 업데이트)
- `docs/NEXT_WORK_PLAN.md`

**QA 결과 요약:**
- 코드 경로 검증 15항목 중 12 PASS, 2 NOT RUN, 1 CODE VERIFIED
- DB/RPC: admin_set_matchup_result, get_admin_event_qa, private.is_admin(), audit_logs 모두 PASS
- 운영 데이터 변경 없음

**⚠️ FINDING-01 — service_settle_matchup 직접 호출 가능 (HIGH RISK)**
- 마이그레이션 의도: `REVOKE ALL FROM PUBLIC; GRANT TO service_role`
- 실제 DB 상태: `authenticated`, `anon` 포함 전 역할 EXECUTE 가능
- `service_settle_matchup` 본문에 `is_admin` 체크 없음
- 비관리자가 RPC 직접 호출로 matchup 결과 입력 + points 변경 가능
- **이번 작업 도입이 아님** — 기존 권한 설정 문제
- 수정 migration 필요 (별도 승인 후 진행)

**다음 세션 후보 (우선순위 순):**
A. ⚠️ FINDING-01 수정 — service_settle_matchup 권한 수정 migration
   - `REVOKE authenticated/anon; GRANT service_role only`
   - 또는 함수 본문에 admin 체크 추가 (설계상 비권장)
B. 실제 브라우저 smoke QA (NOT RUN 항목)
   - force confirm / audit_log 신규 기록 / DevTools network 확인
C. Admin 대시보드 Phase D2
   - 최근 7일 지급 포인트 / 미결 matchup 수 / 이상 감지 지표

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (10차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (10차): Admin 결과 입력 Path B 전환 QA/마감 문서화**

**변경 파일:**
- `docs/ADMIN_RESULT_SETTLEMENT_PATH_PLAN.md`
- `docs/NEXT_WORK_PLAN.md`

**내용:**
- `ADMIN_RESULT_SETTLEMENT_PATH_PLAN.md` 전면 업데이트:
  - Section 1: 현재 운영 경로(Path B) + legacy fallback 경로 분리 기술
  - Section 4: 비교표 연결 상태 반영
  - Section 5-5: 미연결 이슈 해소 처리
  - Section 6: force=true confirm 완료(8903621) 처리
  - Section 7: Path B 완료 표시
  - Section 8: 구현 순서 완료 기록
  - Section 9: QA 패널 호환성 Path B 현재 기준
  - Section 10: QA 체크리스트 완료/미완료 구분
  - Section 11 (신규): Known Limitations
  - 이력 테이블 추가

**Known Limitations (요약):**
- legacy `submitMatchupResult()` / Edge Function fallback 코드 잔류
- toast/갱신 로직 일부 중복
- archived 이벤트 결과 수정 정책 미확정
- force=true 고위험 경로 — 실제 사용 시 주의 필요
- localStorage `settleBet()` legacy 경로 미제거
- 브라우저 smoke QA(audit_log, admin_required) 미실시

**다음 세션 후보 (우선순위 순):**
A. 실제 브라우저 smoke QA
   - force confirm / QA guard / RPC 직접 호출 동작 확인
   - admin_audit_logs set_matchup_result 기록 확인
   - admin_required 차단 동작 확인
B. Admin 대시보드 Phase D2
   - 최근 7일 지급 포인트 / 미결 matchup 수 / 이상 감지 지표
C. 결과 입력 경로 후속 정리
   - submitMatchupResult legacy fallback 제거 여부 판단
   - toast/갱신 공통 helper 추출
   - archived 이벤트 수정 정책 확정

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

---

## 2026-05-16 마감 상태 (9차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (9차): Admin 결과 입력 Path B 전환 (RPC 직접 호출)**

**변경 파일:**
- `index.html`, `dist/index.html`

**내용:**
- `confirmAdminResult()` DB matchup 경로: `submitMatchupResult()` (Edge Function) → `adminSetMatchupResultWithUI()` (RPC 직접 호출)
- DRAW/NC 경로 동일 전환
- `adminSetMatchupResultWithUI()` 신규 추가:
  - `adminSetMatchupResult()` (admin.js) 호출 → `admin_set_matchup_result` RPC 직접 호출
  - 성공 toast: 승패/DRAW/NC 포맷 동일 유지
  - 갱신 체인 유지: loadUserPicksFromDB → loadUserFromDB → fetchUpcomingMatchups → renderAdminFightCardList → fetchBuilderMatchups → Promise.all([fetchBuilderPickSummary, fetchBuilderQA])
- `submitMatchupResult()` legacy 주석 추가 후 보존 (Edge Function 경로, 삭제 안 함)
- force=true confirm 다이얼로그(8903621) 유지
- QA 패널 갱신(f708e83) 유지

**Edge Function `settle-matchup`:**
- 삭제하지 않음, legacy fallback으로 보존
- 현재 DB matchup 기본 경로는 RPC 직접 호출, Edge Function은 legacy fallback

**검증:**
- force=false RPC 직접 호출, toast/갱신 유지 ✓
- force=true confirm 다이얼로그 → RPC 직접 호출 ✓
- DRAW/NC → cancels 환급 toast ✓
- QA 패널 마지막 결과 입력 후 즉시 갱신 ✓
- `npm run build` PASS ✓

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. Admin 대시보드 Phase D2 (7일 지급 포인트, 미결 matchup 수)
B. 운영 이상 감지 알림 (pending_picks > N 경고, 미정산 이벤트 경고)
C. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

---

## 2026-05-16 마감 상태 (8차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (8차): QA 패널 정산 버튼 연동**

**변경 파일:**
- `public/js/admin.js`, `dist/js/admin.js`

**UI:**
- `_renderLifecyclePanel(ev)`: QA 상태 기반 정산 버튼 분기
  - `_builderQA.all_matchups_completed === false` → 버튼 disabled 스타일 + "⚠ 결과 미입력 경기 있음" 보조 문구
  - `_builderQA.total_pending_alert > 0` → 버튼 disabled 스타일 + "⚠ pending N건 잔류" 보조 문구
  - `_builderQA === null` → 기존 활성 버튼 유지 (서버 RPC guard 있음)
  - QA 통과 시 → 기존 green 정산 버튼
- `onLifecycleSettle(eventId)`: QA guard 추가
  - `all_matchups_completed === false` → toast + return (RPC 호출 없음)
  - `total_pending_alert > 0` → toast + return (RPC 호출 없음)
  - QA 통과 시 → 기존 confirm + adminSettleEvent 흐름 유지
  - 정산 완료 후 `Promise.all([fetchBuilderPickSummary(), fetchBuilderQA()])` 병렬 갱신

**검증:**
- 미입력/pending 차단: toast만 표시, RPC 미호출 ✓
- QA null: 기존 동작 유지 ✓
- 정산 완료 후 QA 패널 재조회 ✓
- `npm run build` PASS ✓

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. Admin 대시보드 Phase D2 (7일 지급 포인트, 미결 matchup 수)
B. 운영 이상 감지 알림 (pending_picks > N 경고, 미정산 이벤트 경고)
C. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

---

## 2026-05-16 마감 상태 (7차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (7차):**

### Fix: Improve home text contrast
**변경 파일:**
- `index.html`, `dist/index.html`

홈 hero 섹션 저대비 텍스트 개선:
- Next Event / Total Fights / Your Picks / Points: `text-gray-600` → `text-gray-500`
- Red Corner / Blue Corner: `text-gray-600` → `text-gray-400`

---

### Feat: Add admin event QA panel (Phase QA1)
**변경 파일:**
- `supabase/migrations/20260516_admin_event_qa_rpc.sql` (신규)
- `public/js/admin.js`, `dist/js/admin.js`

**DB:**
- `get_admin_event_qa(p_event_id UUID)` RPC 추가
- SECURITY DEFINER, `private.is_admin()` 검증, `GRANT authenticated`
- 반환: event_id, event_status, all_matchups_completed, total_pending_alert, matchups[]
- matchups[]: matchup_id, red/blue_name, result_status, result_winner, result_round, red/blue/win/lose/pending/cancelled_picks

**UI:**
- `_builderQA` 상태 변수 추가
- `fetchBuilderQA()`: `get_admin_event_qa` RPC 호출, 실패 시 silent fallback
- `renderBuilderQAPanel()`: 픽 현황 패널 하단에 QA 패널 렌더링
  - 전체 상태 배너: ✅ 정산 가능 / ⚠ pending 잔류 경보 / ℹ 미입력 경기
  - 매치업별: 레드/블루 픽 비율 바, 결과 입력 여부, W/L/P/C 카운트
- `selectBuilderEvent()`: `fetchBuilderPickSummary()`와 `fetchBuilderQA()` 병렬 호출

**QA 결과:**
- non-admin 호출 → `{ok:false, reason:'admin_required'}` ✓
- archived 이벤트 (13 matchups, 0 unresolved, 0 pending) → all_matchups_completed=true ✓
- `npm run build` PASS ✓
- dist 동기화 완료 ✓

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. QA 패널 정산 버튼 연동 (all_matchups_completed=false 시 onLifecycleSettle 비활성화/경고)
B. Admin 대시보드 Phase D2 (7일 지급 포인트, 미결 matchup 수)
C. 운영 이상 감지 알림 (pending_picks > N 경고, 미정산 이벤트 경고)
D. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

---

## 2026-05-12 마감 상태 (6차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (6차): Phase D1 — Admin 운영 대시보드**

**변경 파일:**
- `supabase/migrations/20260512_admin_dashboard_summary.sql` (신규)
- `public/js/admin.js`, `dist/js/admin.js`
- `index.html`, `dist/index.html`

**DB:**
- `get_admin_dashboard_summary()` RPC 추가
- SECURITY DEFINER, `private.is_admin()` 검증, `GRANT authenticated`
- 반환: event_counts(5종), pending_picks_total, active_battles, news_count, current_season, recent_audit_logs(5건)
- news_count: `source='admin'` 기준 (news_admin UI 패턴 일치)

**UI:**
- Admin 탭 바에 "📊 대시보드" 탭 추가 (맨 앞, 기본 탭)
- `admin-panel-dashboard` 패널 추가
- `switchAdminTab()`: 'dashboard' 포함, `renderAdminDashboard()` 연결
- `renderAdminDashboard()`: RPC 호출 → loading → 결과 렌더링, 새로고침 버튼
- Admin 진입 시 `switchAdminTab('dashboard')` 기본 실행 (기존 fighters 기본 탭 교체)
- fighters / ufc 탭은 lazy (탭 클릭 시 자동 렌더)

**QA 결과:**
- non-admin 호출 → `{ok:false, reason:'admin_required'}` ✓
- 직접 집계 기준값: pending_picks=15, active_battles=1, news_count=0, event_counts={upcoming:2, archived:3}, Season 1 (0D), audit_logs 75건 ✓
- `npm run build` PASS ✓
- dist 동기화 완료 ✓
- 기존 탭 전환 (fighters/ufc/archive/news/season/settings) 코드 유지 ✓

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. 결과 입력 QA 패널 (미정산 대진표 현황 + 정산 버튼 연동)
B. Admin 대시보드 Phase D2 (7일 지급 포인트, 미결 matchup 수)
C. 운영 이상 감지 알림 (pending_picks > N 경고, 미정산 이벤트 경고)
D. deleteSeasonRecord DB 연동 (DB HOF 삭제 RPC)

---

## 2026-05-12 마감 상태 (5차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (5차): Phase S2 — 시즌 관리 프론트 연결**

**변경 파일:**
- `public/js/season.js`, `dist/js/season.js`
- `index.html`, `dist/index.html`

**DB helper 추가:**
- `loadCurrentSeasonFromDB()`: `get_current_season()` 호출 → `seasonData.current` 갱신 → badge 업데이트
- `loadHallOfFameFromDB()`: `get_hall_of_fame()` 호출 → row 그룹화 → `seasonData.hallOfFame` 갱신 → `renderHallOfFame()` 호출
- 두 함수 모두 `sb` 없거나 RPC 실패 시 localStorage fallback 유지

**읽기 경로 전환:**
- rankings 페이지: `renderHallOfFame()` 직접 호출 제거 → `loadHallOfFameFromDB() + loadCurrentSeasonFromDB()` 호출 (비동기, fallback 먼저 표시 후 DB 덮어쓰기)
- admin 페이지: `renderSeasonAdminPanel()` 즉시 표시 후 `Promise.all([loadCurrentSeasonFromDB, loadHallOfFameFromDB])` → `renderSeasonAdminPanel()` 재렌더

**쓰기 경로 전환:**
- `updateSeasonName()`: `admin_update_season_name(p_name)` RPC 호출 → ok/reason 분기 toast → localStorage fallback 제거
- `executeSeasonReset()`: `admin_end_season('')` RPC 호출 → `seasonResetSubmitting` 중복 클릭 방지 → 버튼 disabled/텍스트 변경 → 성공 시 state 동기화(points=1000) + DB 재로드 → localStorage-only 종료 경로 완전 제거

**검증:**
- `mockRankings`는 `getCurrentSeasonRankings()` (모달 미리보기 전용)에서만 사용, `executeSeasonReset()` 에서 참조 없음 ✓
- localStorage-only 시즌 종료 코드 (`hallOfFame.push`, 로컬 시즌 증가) 완전 제거 ✓
- `seasonResetSubmitting` 중복 클릭 방지 구현 ✓
- 성공 후 `state.points=1000` 동기화 ✓
- `sb` 없을 때 조기 반환 + toast ✓
- `npm run build` PASS ✓
- dist 동기화 완료 ✓
- `admin_end_season` 실제 호출 QA 금지 준수

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. 운영 대시보드 (미정산 이벤트, pending picks 현황 통합 뷰)
B. 결과 입력 QA 패널 (정산 전 미입력 결과 검증)
C. Admin RPC 서버 권한 체계 점검 (SECURITY DEFINER guard 일관성)
D. deleteSeasonRecord localStorage 전용 함수 — DB 연결 고려

---

## 2026-05-12 마감 상태 (4차)

**origin/main = HEAD = push 후 최신 SHA 확인**

**오늘 완료 (4차): Phase S1 — 시즌 관리 DB 이전 (DB/RPC)**
- `supabase/migrations/20260512_season_management_rpc.sql` — DB 적용 완료
- `public.seasons` 테이블: id, name, start_date, end_date, is_active, partial unique index (활성 시즌 1개 제한), RLS enabled
- `public.season_hof` 테이블: season_id, rank(1~3), user_id, nickname, points, total_picks, success_picks, accuracy, belt, faction_id, UNIQUE(season_id, rank), RLS enabled
- 초기 시드: Season 1 생성 (is_active=TRUE, start_date=2026-05-12)
- `get_current_season()`: anon/authenticated 공개 읽기
- `get_hall_of_fame()`: anon/authenticated 공개 읽기 (종료 시즌 × Top3)
- `admin_update_season_name(p_name)`: private.is_admin() 검증, authenticated 전용
- `admin_end_season(p_next_season_name)`: private.is_admin() 검증, FOR UPDATE 잠금, Top3 스냅샷, points만 1000 리셋, authenticated 전용

**⚠️ 포인트 리셋 정책:**
- `users.points`만 1000으로 리셋 (all users)
- `total_picks`, `success_picks`: all-time 커리어 지표 — 유지
- `picks` row: 유지

**⚠️ 알려진 기존 데이터 이상값:**
- `KINGBOTTLE`: success_picks(18) > total_picks(16) → accuracy 113% — 기존 DB 데이터 무결성 문제
- `admin_end_season`은 있는 값 그대로 스냅샷하므로 동작에는 영향 없음

**QA 결과:**
- 테이블 생성 + RLS enabled ✓
- 초기 시드 Season 1 (1행) ✓
- `get_current_season()` 반환 정상 ✓
- `get_hall_of_fame()` 빈 배열 반환 ✓
- 비admin `admin_update_season_name` → `admin_required` ✓
- 비admin `admin_end_season` → `admin_required` ✓
- partial unique index: 활성 시즌 중복 INSERT 차단 ✓
- Top3 스냅샷 로직 ROLLBACK 검증 ✓
- `admin_end_season` 실제 실행 안 함 — 운영 points 리셋 보호

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`, `.claude/settings.local.json`: 커밋하지 않음

**다음 세션 후보 (우선순위 순):**
A. **Phase S2: 시즌 관리 프론트 연결**
   - `renderHallOfFame()` → `get_hall_of_fame()` DB 기반으로 전환
   - `renderLeaderboard()` 시즌 badge → `get_current_season()` 사용
   - `renderSeasonAdminPanel()` → DB 기반으로 전환
   - `updateSeasonName()` → `admin_update_season_name()` RPC 호출
   - `executeSeasonReset()` → `admin_end_season()` RPC 호출
   - localStorage `seasonData` fallback → 점진적 제거
B. 운영 대시보드 (미정산 이벤트, pending picks 현황 통합 뷰)
C. 결과 입력 QA 패널 (정산 전 미입력 결과 검증)
D. Admin RPC 서버 권한 체계 점검 (SECURITY DEFINER guard 일관성)

---

## 2026-05-12 마감 상태 (3차)

**오늘 완료 (3차): Admin UI gate repair**
- `public/js/config.js`: `ADMIN_EMAILS` 화이트리스트 추가
- `public/js/api/supabase.js` `loadUserFromDB()`: `is_admin` DB 컬럼 OR `ADMIN_EMAILS` 체크로 `adminUnlocked` 설정 (기존 hardcoded 이메일 제거)
- `index.html` `navigateTo()`: admin 진입 guard 추가 — `adminUnlocked` 아닐 때 hash/popstate/직접호출 모두 home으로 리다이렉트

**⚠️ 보안 범위 명시 (client-side gate):**
- 이 작업은 Admin UI 진입만 차단하는 client-side gate임
- 실제 데이터 보안은 Supabase SECURITY DEFINER RPC 레벨에서 별도 보호됨
- Admin RPC 권한 체계 점검은 별도 Phase로 예정

---

## 2026-05-12 마감 상태 (2차)

**오늘 완료 (2차):**
- `my-rank-nickname` 버그 수정: `renderLeaderboard()`에서 `getDisplayUsername()` 로 갱신
- `my-rank-card`에 analyst type 표시 (`getAnalystType()` 결과 타이틀+색상)
- `my-rank-card`에 faction badge 표시 (`getFactionBadge(currentFaction, 'sm')`)
- mockRankings dummy injection 제거, 실제 DB 유저 없을 때 placeholder 표시

---

## 2026-05-12 마감 상태 (1차)

**오늘 완료 (1차):**
- Phase 5D 설계: `docs/BATTLE_ATTACK_SERVER_PLAN.md` (Finding-02 포함) (`9038169`)
- Phase 5D-0: `advance_turn` RPC 신규, `_advanceTurn()` RPC 이전, `cancelBattleRequest()` RPC 이전, `battles_update_participant` DROP (`550ff5e`, `cebe600`, `ee2f49a`)
- Phase 5D-1: `vote_battle` 참가자 차단 `IS NOT DISTINCT FROM` 통일 — DB 적용 완료
- Phase 5D-2: attack/foul 수신 damage cap 클램핑 (`safeDmg = Math.min(Number(d.damage)||0, 10)`)
- Phase 5D-3: 결과 화면에 "투표 기준 HP · 공격/반칙은 화면 연출" 캡션 추가

**Phase 5D-0 상세:**
- Migration: `supabase/migrations/20260512_advance_turn_rpc.sql` + `_fix.sql` — DB 적용 완료
- `advance_turn` RPC: SELECT FOR UPDATE, IS DISTINCT FROM 참가자 검증, 턴 소유자 검증, 5라운드 완료 시 `battle_should_finish` 반환
- `_advanceTurn()`: async RPC 호출, 서버 반환값으로 로컬 상태 갱신, RPC 실패 시 local 상태/broadcast 없음
- `cancelBattleRequest()`: `cancel_battle` RPC로 교체 (기존 직접 UPDATE 제거)
- `battles_update_participant` 정책 DROP: HP 컬럼 직접 변조 경로 차단 (Finding-02 해소)

**Known Limitations (Phase 5D 전체 완료 이후 잔존):**
- fake attack/foul broadcast frequency는 여전히 가능 (cosmetic — 다음 vote 시 DB값으로 자동 정정)
- `battle_messages.user_id` 컬럼 없음 (nick만 저장)

**Phase 5D 완료 요약:**
- 5D-0: advance_turn RPC, battles_update_participant DROP → HP 직접 변조 경로 차단
- 5D-1: vote_battle IS NOT DISTINCT FROM → NULL-safe 참가자 차단
- 5D-2: attack/foul damage cap → 과장 damage 무력화
- 5D-3: 결과 화면 cosmetic 명시화

**완료 항목 참조 (이하 목록에서 완료된 것):**
- 1번 KDI 데이터 정리 ✅
- 2번 QA 2차 ✅
- 3번 공통 데이터 RPC (Phase 4A/B/C) ✅
- 4번 Event Lifecycle Phase 3 ✅
- 9번 프로필 고도화 (1차) ✅
- 12번 배포/레포 정리 (.gitignore) ✅

---

## 2026-05-05 상태 업데이트 (이전)

**완료:**
- Phase 4A: `get_event_leaderboard` RPC 구현 · DB 적용 · 프론트 연결 · push (`6eabf9e`)
- Phase 4C: `get_event_pick_ratios` RPC 구현 · DB 적용 · 프론트 연결 · push (`bfcae51`)
- Phase 4B: `get_user_pick_stats` RPC 구현 · DB 적용 · docs 업데이트 · push (`1c0e6d8`)
- Phase 4D Admin smoke QA 완료 (`docs/QA_RUN_2026-05-05_PHASE4D_ADMIN.md`)
- Build: dist/ 4개 파일 커밋 (`a6ecbfa`)

---

## 현재 완료 상태

- `place_pick` 서버 함수 도입 및 pick 저장/포인트 차감 원자화 완료
- method/round 저장 및 중복 예측 차단 완료
- users RLS insert own 및 구형 broad policy 제거 완료
- admin 이벤트/대진표/fighter/ranking mutation RPC 서버화 1차 완료
- event lifecycle Phase 1/2 완료
- Phase 4A/B/C/D 공통 데이터 RPC 완료
- Phase 5A 집단 랭킹 RPC + UI 완료 (leaderboard v2, member ranking)
- Profile 고도화 UI 1차 완료 (get_user_pick_stats 기반)
- Phase 5B battle vote dedup 완료 (battle_votes + vote_battle RPC)
- Phase 5C-1: battles.starter_hp / receiver_hp DB 컬럼 + CHECK 제약 적용 완료
- Phase 5C-2: vote_battle RPC HP 갱신 확장 + octagonVote() 서버 HP 적용 완료
- Phase 5C-3: finish_battle RPC 신규 + _endBattle() 서버 위임 완료
- Phase 5C-4: postgres_changes 구독으로 battles DB 상태 HP/votes/종료 정정 완료
- Phase 5C-5: Phase 5C 전체 코드 레벨 QA 완료 (59/59 PASS, 4개 Finding 기록)
- ISSUE-01/02/03 repair 완료

---

## 다음 작업 순서

### 1. KDI 데이터 정리

목표: 과거 이벤트 데이터의 남은 불일치/중복을 정리한다.

작업:
- KDI-01: matchup `248de009`의 `result_status=completed` / `result_method=NC` 불일치 확인
- KDI-02: UFC 274 `TalitaAlencar vs JuliaPolastri` 중복 matchup 확인
- 먼저 조회만 수행
- 어떤 row를 살릴지 결정 후 repair migration 작성
- repair 후 QA_RUN 문서 업데이트

원칙:
- 바로 수정하지 말고 조회 결과를 먼저 보고
- 데이터 삭제/변경은 migration으로만 수행
- 운영 DB에 적용한 경우 문서에 before/after 기록

---

### 2. QA 2차 실행

목표: 오늘 수정한 ISSUE-01/02/03과 lifecycle 흐름이 실제 운영 기준으로 닫혔는지 확인한다.

필수 확인:
- 로그인 사용자 예측 등록
- 포인트 차감 및 새로고침 후 유지
- method/round 저장
- 중복 예측 차단
- 픽 마감 후 `pick_locked` 차단
- 결과 입력
- 이벤트 정산
- 중복 정산 방지
- 랭킹 반영
- admin lifecycle 버튼
- completed/locked 이벤트 내 pending pick 잔존 여부

산출물:
- `docs/QA_RUN_YYYY-MM-DD.md` 또는 기존 QA_RUN 업데이트
- 발견 이슈는 ISSUE/KDI로 분류

---

### 3. 공통 데이터/RPC 기반 구축 ✅ (Phase 4A/B/C 완료)

완료:
- Phase 4A: `get_event_leaderboard(p_event_id)` — 이벤트 리더보드 ✅
- Phase 4B: `get_user_pick_stats(p_user_id)` — 유저 프로필 집계 + `profile.js` 연결 ✅
- Phase 4C: `get_event_pick_ratios(p_event_id)` — 커뮤니티 픽 비율 ✅

남은 작업:
- Phase 4D: `get_event_pick_summary(p_event_id)` — 어드민 워크스페이스 연결 완료 ✅ (`38a798c`)
- 집단/소속 랭킹 포인트 산정 RPC (미설계)
- 파이터 상세 stat 조회 RPC (미설계)

참고 문서: `docs/COMMON_DATA_RPC_PLAN.md`

---

### 4. Event Lifecycle Phase 3 + Archive 연동

목표: 결과 입력, 정산, 아카이브, 감사 로그 흐름을 하나로 정리한다.

작업:
- 결과 입력 경로를 `settle-matchup` Edge Function에서 `admin_set_matchup_result` RPC 중심으로 통일 검토
- 대진표 관리에서 입력한 결과가 아카이브에 자동 반영되도록 로직 정리
- archived 이벤트 결과 수정 가능 여부 정책 결정
- 결과 재수정/재정산 시 audit log 기록 강화

결정 필요:
- archived 이벤트에서 결과 수정 허용 여부
- NC/DRAW/결과 수정 시 포인트 재정산 정책

---

### 5. 랭킹 시스템 고도화

목표: 단순 전체 포인트 랭킹을 넘어 운영에 쓸 수 있는 랭킹 체계를 만든다.

작업:
- 전체 랭킹
- 시즌 랭킹
- 이벤트별 랭킹
- 소속/집단 랭킹
- 보조 랭킹 아이디어
  - 최근 폼 랭킹
  - 언더독 적중왕
  - 방식 적중왕
  - 연승 랭킹
  - 참여율 랭킹

주의:
- 집단 랭킹 포인트 산정 시스템이 현재 작동하지 않는 것으로 보이므로 우선 검증 필요
- 포인트 산정 공식은 문서화 후 구현

---

### 6. 대진표 UX 개선

목표: 유저가 예측할 때 더 빠르고 명확하게 판단할 수 있는 경기 카드 경험을 만든다.

작업:
- 이벤트 리더보드 데이터 연동 및 고도화
- H2H 비교 기능 속도 개선
  - 캐싱
  - lazy load
  - 필요한 데이터만 조회
- 대진표 경기 카드 UI/UX 개선
- 파이터 사진 선명도/구도 개선
- 모든 대진표 카드에서 선수 프로필/stat 연동
- 메인카드뿐 아니라 전체 matchup 선수의 stat 접근 가능하게 개선

검토 포인트:
- 현재 카드에서 어떤 정보가 과하고 어떤 정보가 부족한지 유저 관점으로 평가
- 모바일에서 카드 높이/버튼/사진이 답답하지 않은지 확인

---

### 7. 커뮤니티 개선 1차

목표: 현재 커뮤니티 영역의 정보 과다와 실시간성 문제를 먼저 정리한다.

작업:
- 메인/코메인 픽 비율 실시간 연동 검증
- 픽 비율 영역 UI 축소
- 커뮤니티 영역 확대
- 픽 비율 카드에 사진 표시
- 커뮤니티 글에 "내가 픽한 내용" 자동 노출 제거
- 글 목록/댓글 구조 정리

주의:
- 픽 비율 source of truth: Phase 4C에서 `picks` 테이블로 확정 완료 (`event_picks`는 실시간 구독 트리거 역할만 유지)

---

### 8. 커뮤니티 개선 2차

목표: 긴 분석글과 이미지가 가능한 게시판 구조로 확장한다.

작업:
- 게시글 클릭 시 상세 페이지 구조 도입
- 이미지 첨부 지원
- 긴 분석글 레이아웃 지원
- 카테고리 분리
  - 전체
  - 이벤트별
  - 소속별
  - 분석글
  - 자유글
- 내 소속별 게시판 설계
- 소속 게시판 RLS 설계

결정 필요:
- 소속 가입/탈퇴/관리 방식
- 소속 게시판 공개 범위

---

### 9. 프로필 고도화 ✅ (1차 완료)

완료:
- `get_user_pick_stats` RPC 기반 totalAll/accuracy null 처리/업셋 비율/by_method 동적 렌더 (`fd595a6`)

남은 작업:
- 대표 배지/칭호 시스템
- 시즌별 성과
- 더 많은 체급/방식 stat 시각화

---

### Phase 5B — Battle Vote Dedup ✅ (2026-05-10, `8c4d731`)

완료:
- `battle_votes` 테이블 + `vote_battle` RPC 구현 및 DB 적용
- `octagonVote()` RPC 기반 전환, `voteSubmitting` 중복 클릭 방지
- DB 레벨 UNIQUE(battle_id, voter_id) 제약으로 중복 투표 차단

참고 문서: `docs/BATTLE_VOTE_SECURITY_PLAN.md`

---

### Phase 5C — Battle Broadcast 보안 강화

설계 완료: `docs/BATTLE_STATE_SERVER_PLAN.md`
추천안: battles HP 컬럼 + finish_battle RPC + postgres_changes fallback

진행 상황:
- ✅ **5C-1**: `battles.starter_hp / receiver_hp` INTEGER NOT NULL DEFAULT 100 + CHECK 제약 추가
  - migration: `supabase/migrations/20260510_battle_state_server.sql`
- ✅ **5C-2**: vote_battle RPC HP 갱신 확장 + 프론트 투표 흐름 변경
  - migration: `supabase/migrations/20260510_vote_battle_server_hp.sql`
  - vote_battle이 HP 갱신 후 starter_hp/receiver_hp 반환
  - octagonVote() 서버 HP 절대값 적용, vote_cast payload HP 포함
  - vote_cast 수신 payload HP 절대값 우선 적용 (legacy fallback 유지)
- ✅ **5C-3**: finish_battle RPC 신규 + _endBattle() 서버 위임
  - migration: `supabase/migrations/20260510_finish_battle_rpc.sql`
  - finish_battle: SELECT FOR UPDATE + already_finished 멱등성 + HP 기준 winner
  - _endBattle() async 전환, battle_messages INSERT 선행 후 RPC 호출
  - battle_ended broadcast: already_finished 시 생략
- ✅ **5C-4**: postgres_changes 구독 추가 (broadcast 스팸 방어)
  - `octagon.battleChannel`에 battles UPDATE 구독 체이닝 (별도 채널 불필요)
  - HP/votes DB 공식값으로 정정, 종료 fallback (battle_ended 누락 시 DB로 처리)
  - 방어 조건: battleId 불일치, idle 상태, already finished 모두 skip
  - exitOctagon removeChannel 한 번으로 postgres_changes 포함 전체 해제
- ✅ **5C-5**: Phase 5C 전체 코드 레벨 QA 완료
  - 59/59 항목 PASS (A.DB구조, B.vote_battle, C.octagonVote UI, D.finish_battle, E.postgres_changes fallback)
  - Finding-01(LOW): vote_battle 참가자 차단 `=` vs `IS DISTINCT FROM` 불일치 — active 배틀 제약으로 실위험 없음
  - Finding-02(INFO): HP 하한 서버(0) vs legacy fallback(10) 불일치 — 의도된 설계
  - Finding-03(INFO): _advanceTurn에서 _endBattle() await 없음 — fire-and-forget 의도
  - Finding-04(INFO): battles Realtime publication 직접 확인 불가 — inviteChannel 간접 확인

---

### Phase 5D — Battle 보안 강화 2차 (후보)

Phase 5C Finding + Known Limitations 기반 후속 작업 후보.

작업 후보:
- **5D-1**: `vote_battle` RPC 참가자 차단 조건 `IS DISTINCT FROM` 적용 (Finding-01)
- **5D-2**: attack/foul broadcast HP 서버화 (새 RPC or battles.attack_hp 컬럼)
- **5D-3**: `battle_messages.user_id` 컬럼 추가 (nick→id 이중 저장, tie-break 강화)
- **5D-4**: anon GRANT cleanup (vote_battle 등)
- **5D-5**: battle_ended broadcast 누락 시나리오 브라우저 실제 테스트

우선순위: 5C Finding-01은 LOW severity, 현재 배포에 즉각적 위험 없음. 다른 기능 작업 후 별도 세션에서 진행 권장.

---

### 10. Admin 고도화

목표: 운영자가 직접 안정적으로 관리할 수 있는 admin 시스템으로 확장한다.

작업:
- 뉴스 관리 방식 설계
  - 자동 수집 후보
  - admin 검수
  - 게시/숨김
  - 출처/날짜 관리
- 시즌 관리 방식 설계
  - 시즌 생성
  - 기간 설정
  - 시즌 랭킹
  - 시즌 종료/아카이브
  - 보상 관리
- audit log 조회 UI
- 운영 대시보드
  - 미정산 이벤트
  - pending pick
  - sync 실패
  - RLS/Security warning

---

### 11. Picktagon 고유 파이터 stat 로직

목표: `striking / grappling / stamina / defensive / speed`를 Picktagon만의 일관된 방식으로 산정한다.

작업:
- 데이터 소스 정의
  - UFCStats
  - ESPN
  - 수동 입력
  - 기존 fighter stats
- 정규화 공식 설계
- 체급별 보정
- 경기 수 보정
- 최근 경기 가중치
- 결측치 처리
- admin 수동 보정
- stat 버전 기록

권장 접근:
- 바로 코드화하지 말고 먼저 `docs/FIGHTER_STAT_FORMULA.md` 작성
- 샘플 파이터 10명으로 계산 결과 검증
- 운영자가 납득 가능한 수치인지 확인 후 DB 반영

---

### 12. 배포/레포 정리

목표: 반복적으로 남는 unstaged/untracked 파일 혼란을 줄인다.

작업:
- `dist/*` 운영 원칙 확정
- `node_modules/`, `supabase/.temp/`, `.claude*` 처리 방식 정리
- 필요하면 `.gitignore` 추가
- Tailwind CDN 제거/빌드 방식 전환 검토
- CI 빌드 산출물과 로컬 빌드 산출물 책임 분리

주의:
- `.gitignore` 추가는 영향 범위가 있으므로 별도 커밋으로 진행

---

### 13. 프론트 구조 정리

목표: 이후 화면 개선이 쉬운 구조로 만든다.

작업:
- `index.html` 인라인 로직 축소
- 전역 상태 제거/축소
- localStorage는 캐시/비로그인 모드로 제한
- admin JS와 사용자 JS 경계 정리
- 기능별 모듈 분리

우선순위:
- 데이터/RPC 안정화 후 진행
- 큰 리팩터링 전 QA 기준을 먼저 고정

---

## 다음 세션 시작 추천 프롬프트

```text
Pick-tagon 작업 이어서 진행하자.

현재 상태:
- main == origin/main == 8c4d731
- Phase 5B battle vote dedup 완료 (battle_votes + vote_battle RPC + octagonVote 전환)
- Profile 고도화 UI 1차 완료
- dirty: .claude/settings.json, .claudeignore untracked (커밋 금지)

우선순위 후보 (선택해줘):
A. Phase 5C 설계 — HP snapshot 서버 저장 방식으로 broadcast 스팸 완화
   (docs/BATTLE_VOTE_SECURITY_PLAN.md Phase 5C 후보 A 참고)
B. 랭킹 시스템 고도화 — 전체/시즌/이벤트별 랭킹 RPC 설계 (NEXT_WORK_PLAN 5번)
C. 커뮤니티 개선 1차 — 픽 비율 실시간 연동 검증 + UI 정리 (NEXT_WORK_PLAN 7번)

원칙:
- 운영 데이터 수정 금지
- .claude/settings.json, .claudeignore 커밋 금지
- push는 별도 승인 전까지 금지
- 새 기능 전 git status 확인 먼저
```

---

## 작업 운영 원칙

- 운영 DB 수정은 항상 migration으로 수행
- 과거 migration 파일 직접 수정 금지
- 데이터 repair migration은 fresh DB replay를 고려해 no-op 가드 포함
- UI 개선 전 source of truth와 RPC 계약 먼저 확정
- QA 문서와 실제 수정 커밋을 함께 추적
- `dist/*`는 별도 지시 없으면 커밋하지 않음
