# Smoke QA — 핵심 플로우 (2026-05-17)

기준 커밋: 98ef6a7  
실행 환경: Vite dev server localhost:5174, 코드 grep/read 검증 병행  
목적: localStorage legacy 정리 완료(L1~L3-c) 이후 핵심 사용자/관리자 화면 회귀 확인

---

## 1. 공통

| 항목 | 방법 | 결과 | 비고 |
|------|------|------|------|
| git status | `git status --short --branch` | ✅ PASS | main == origin/main, .claude 3개 미커밋만 존재 |
| npm run build | `npm run build` | ✅ PASS | 372ms, 에러 없음 |
| dev server 기동 | `npm run dev --port 5174` | ✅ PASS | localhost:5174 ready |
| 브라우저 앱 로드 | Edge 브라우저 실행 | ✅ PASS | 앱 페이지 정상 열림 |
| console.error 활성 여부 | 코드 grep | ✅ PASS | 모두 에러 핸들러 (mutation failure, RPC failure, UFC rankings helper) — 의도된 코드 |

---

## 2. 사용자 화면

| 항목 | 방법 | 결과 | 비고 |
|------|------|------|------|
| 홈 화면 렌더 | 코드 확인 | ✅ PASS (CODE) | Hero text: `text-gray-500`/`text-gray-400` (7차 contrast fix 유지) |
| Pick 화면 데이터 경로 | 코드: `fetchUpcomingMatchups()` → `renderFightCards()` | ✅ PASS (CODE) | `_dbMatchups` 우선 경로 정상 |
| Pick 등록 RPC | 코드: `castVote()` → `savePick()` → `place_pick` RPC | ✅ PASS (CODE) | localStorage legacy 경로 없음 확인 |
| Profile 통계 RPC | 코드: `get_user_pick_stats` → `renderProfileStats()` → `renderMethodStats()` | ✅ PASS (CODE) | `getAnalystType()` 연결 정상 |
| Rankings 내 순위 카드 | 코드: `my-rank-card`, `my-rank-nickname`, `getFactionBadge`, `getAnalystType` | ✅ PASS (CODE) | 랭킹 진입 시 `renderLeaderboard()` 호출 정상 |
| Rankings HOF/시즌 | 코드: `loadHallOfFameFromDB()` + `loadCurrentSeasonFromDB()` 연결 | ✅ PASS (CODE) | `get_hall_of_fame`, `get_current_season` RPC 경로 정상 |
| 모바일 폭 텍스트 겹침 | 브라우저 실측 | ⬜ NOT RUN | 스크린샷 도구 없음, DevTools 모바일 에뮬레이션 필요 |
| Pick 실제 등록/정산 화면 | 브라우저 실측 | ⬜ NOT RUN | 운영 데이터 변경 방지 |

---

## 3. 관리자 화면

| 항목 | 방법 | 결과 | 비고 |
|------|------|------|------|
| 비로그인 admin 차단 | 코드: `if (id==='admin' && !adminUnlocked) { id='home'; }` | ✅ PASS (CODE) | `navigateTo()` 내 guard |
| Dashboard 기본 탭 | 코드: `switchAdminTab('dashboard')` → `renderAdminDashboard()` → `get_admin_dashboard_summary` | ✅ PASS (CODE) | 기본 탭 Dashboard |
| 대진표 관리 탭 + QA 패널 | 코드: `fetchBuilderQA()` + `renderBuilderQAPanel()` 연결 | ✅ PASS (CODE) | 이벤트 선택 시 픽 현황 + QA 패널 |
| 결과 입력 모달 구조 | 코드: winner/method/round/time 필드, force hidden input | ✅ PASS (CODE) | 이전 smoke QA(Section 12)에서 확인됨 |
| 정산 버튼 QA guard | 코드: `_qaBlockUnresolved` / `_qaBlockPending` → 버튼 disabled | ✅ PASS (CODE) | `onLifecycleSettle()` 내부 guard 동일 |
| admin-panel-fights hidden | 코드: `class="hidden"` 유지 | ✅ PASS (CODE) | switchAdminTab 목록에 없음, UI 접근 불가 |
| 실제 결과 입력 submit | — | ⬜ NOT RUN | 운영 데이터 변경 방지 |
| 실제 정산 실행 | — | ⬜ NOT RUN | 운영 데이터 변경 방지 |
| admin_required RPC 차단 | — | ⬜ NOT RUN | 비관리자 계정 없음 |

---

## 4. 레거시 회귀 확인

| 항목 | 방법 | 결과 |
|------|------|------|
| `settleBet` index.html + dist | `rg "settleBet" index.html dist/index.html` | ✅ 0건 |
| `simulateFight` | `rg "simulateFight" index.html dist/index.html` | ✅ 0건 |
| `updatePickResult` | `rg "updatePickResult" index.html dist/index.html` | ✅ 0건 |
| `functions.invoke('settle-matchup')` | `rg` 검색 | ✅ 0건 |
| `adminSetMatchupResultWithUI` 유지 | `rg --count` | ✅ 4건 (정상) |
| `confirmAdminResult()` non-DB → toast | 코드 index.html:3223-3224 | ✅ PASS (CODE) |

---

## 5. Findings

| ID | 심각도 | 내용 | 처리 |
|----|--------|------|------|
| — | — | 코드 레벨 검증 범위 내 버그 없음 | — |
| INFO | INFO | `console.error` at index.html:4169: UFC rankings admin 기능에서 `ufc_rankings` 테이블 부재 시 CREATE TABLE SQL 힌트 출력 — 의도된 admin helper | NOT RUN 조건(테이블 없을 때만 발동), 수정 불필요 |

---

## 6. 결론

**코드 레벨 검증 전 항목 PASS. 회귀 없음.**  
localStorage legacy (settleBet/simulateFight/updatePickResult/settle-matchup) 제거 후 핵심 경로(Pick 등록, Profile 통계, Rankings, Admin 결과 입력, 정산 guard) 모두 정상.  
실제 브라우저 인터랙션이 필요한 항목(모바일 폭 확인, 실제 submit, admin_required 차단)은 NOT RUN으로 유지.

**코드 수정 없음 — docs-only 커밋.**
