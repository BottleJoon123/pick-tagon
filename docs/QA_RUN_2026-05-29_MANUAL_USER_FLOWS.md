# Manual User Flow QA Run Sheet — 2026-05-29

> 작성일: 2026-05-25  
> 실행 예정: **2026-05-29 ~ 2026-06-01** (QA 윈도우 2)  
> 공개 배포: **2026-06-10**  
> Production URL: **https://bottlejoon123.github.io/pick-tagon/**  
> 릴리즈 기준: [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md)  
> QA 체크리스트: [`docs/RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md)  
> Admin rehearsal: [`docs/ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md)

---

## 1. QA 범위

| 항목 | 기준 |
|---|---|
| 환경 | Production — `https://bottlejoon123.github.io/pick-tagon/` |
| 뷰포트 | Desktop 1440×900 + Mobile 375×812 |
| 계정 | 일반 유저 계정 (로그인 가능, 포인트/픽 있는 계정) |
| Admin 계정 | read-only 확인만 — write action 금지 |
| 자동화 범위 | 해당 없음 — 이 문서는 100% 수동 체크리스트 |
| 기준 커밋 | `a995c79` Docs: Add admin settlement rehearsal plan |

---

## 2. 준비물 및 사전 확인

### 2-1. 준비물

- [ ] 데스크톱 브라우저 (Chrome 최신 권장)
- [ ] DevTools 열어 둘 것 (Console 탭 + Network 탭)
- [ ] 일반 유저 계정 이메일 / 비밀번호
- [ ] Admin 계정 이메일 / 비밀번호 (read-only 확인용)
- [ ] 모바일 디바이스 또는 Chrome DevTools → 375px 에뮬레이션
- [ ] 이 문서 — finding 기록용 템플릿 (Section 8)

### 2-2. 절대 금지 액션

> **사전 명시적 승인 없이 아래 액션은 실행하지 않는다.**

| 금지 항목 | 이유 |
|---|---|
| ❌ 실제 pick confirm (test matchup 제외) | 실 데이터 pick 기록 |
| ❌ Community post 작성 | 실 데이터 생성 |
| ❌ Community comment 작성 | 실 데이터 생성 |
| ❌ Community like (확인 필요 — 실행 전 승인) | 실 데이터 변경 |
| ❌ Admin settle 실행 | 포인트/픽 결과 변경 |
| ❌ Season reset / Danger zone | 복구 불가 |
| ❌ Admin archive/delete/purge | 복구 불가 |

### 2-3. Finding 기록 기준

| 심각도 | 기준 |
|---|---|
| **P0** | 앱이 열리지 않음 / 로그인 불가 / 픽 전체 불가 / 데이터 손상 |
| **P1** | 핵심 화면 렌더 실패 / 모바일 핵심 플로우 불가 / 모달 열기/닫기 불가 |
| **P2** | 일부 UI 오작동 / 기능 저하 있지만 우회 가능 |
| **P3** | 미관 문제 / 오탈자 / 기능 영향 없는 경고 |

---

## 3. Manual Flow A — 로그인 / 세션

> **전제:** 비로그인 상태에서 시작.

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| A-1 | 로그인 버튼 또는 진입 경로 확인 | 로그인 UI 접근 가능 | | |
| A-2 | 이메일 + 비밀번호로 로그인 | 로그인 성공, 화면 전환 | | |
| A-3 | 로그인 후 닉네임 표시 | 헤더/프로필에 닉네임 노출 | | |
| A-4 | 로그인 후 포인트 표시 | 헤더/프로필에 포인트 숫자 노출 | | |
| A-5 | 새로고침 후 로그인 세션 유지 | 페이지 리로드 후에도 로그인 상태 | | |
| A-6 | 로그아웃 | 로그아웃 후 비로그인 상태로 전환 | | |
| A-7 | 로그아웃 후 재로그인 | 정상 재로그인 | | |

**Findings:**
- (발견 시 Section 8 Finding 형식으로 기록)

---

## 4. Manual Flow B — Pick 플로우

> **전제:** 일반 유저 로그인 상태. pick confirm은 승인된 test matchup에서만 실행.

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| B-1 | Event 섹션 진입 | 매치업 카드 목록 표시 | | |
| B-2 | fight card 클릭 → pick slip open | pick slip 패널 열림 | | |
| B-3 | pick slip 내 fighter 선택 UI | red/blue 선택 가능 | | |
| B-4 | method 선택 UI | KO/TKO/SUB/UD/SD/MD 등 선택 가능 | | |
| B-5 | round 선택 UI | round 숫자 선택 가능 (또는 N/A) | | |
| B-6 | pick slip close (X 버튼 또는 backdrop 클릭) | pick slip 닫힘 | | |
| B-7 | pick confirm (test matchup 전용) | 픽 저장 성공 메시지 또는 상태 변경 | | |
| B-8 | 픽 후 pick slip 재진입 → 기존 픽 표시 | 이미 선택한 fighter/method/round 표시 | | |
| B-9 | 픽 변경 UI 확인 | 변경 가능 버튼 또는 안내 표시 | | |
| B-10 | settled matchup 카드 표시 | settled 상태 표시 (결과/winner 표시) | | |
| B-11 | pending matchup 카드 표시 | pending/upcoming 상태 표시 | | |

> **B-7 주의:** `[실제 pick confirm은 운영자 명시적 승인 후 test matchup에서만 실행]`  
> 승인 없이는 B-7을 Skip 처리하고 UI만 확인.

**Findings:**

---

## 5. Manual Flow C — News

> **전제:** 로그인 여부 무관. Supabase에서 뉴스 데이터 로드됨 (production 기준 27개 이상 예상).

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| C-1 | News 섹션 진입 | 뉴스 카드 그리드 렌더 | | |
| C-2 | 뉴스 카드 클릭 → detail modal 열림 | 뉴스 제목/내용/이미지 표시된 모달 오픈 | | |
| C-3 | detail modal 닫기 (X 버튼 또는 backdrop) | 모달 닫힘, 뉴스 그리드로 복귀 | | |
| C-4 | 검색 input 입력 ("UFC") | 관련 카드만 필터링 표시 | | |
| C-5 | 검색 초기화 | 전체 카드 복귀 | | |
| C-6 | 카테고리 탭 클릭 | 해당 카테고리 카드만 필터 | | |
| C-7 | 외부 링크 카드 클릭 | 새 탭에서 외부 URL 열림 | | |
| C-8 | YouTube shortcut 버튼 클릭 | YouTube 또는 영상 섹션으로 이동 | | |
| C-9 | 모달 열린 상태에서 뒤로가기/새로고침 | 앱 상태 정상 유지 (크래시 없음) | | |

**Findings:**

---

## 6. Manual Flow D — Community

> **전제:** 로그인 상태 권장. post/comment/like write는 승인 없이 금지.

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| D-1 | Community 섹션 진입 | 게시글 목록 표시 | | |
| D-2 | 게시글 카드 클릭 → post detail modal 열림 | 제목/내용/댓글 수 표시 | | |
| D-3 | post detail modal 닫기 | 모달 닫힘, 목록으로 복귀 | | |
| D-4 | 카테고리 탭 클릭 필터 | 해당 카테고리 게시글만 표시 | | |
| D-5 | 댓글 UI 확인 (input 존재 여부) | 댓글 입력 필드 표시 (작성은 금지) | | |
| D-6 | 좋아요 버튼 UI 확인 | 좋아요 버튼 표시 (클릭은 승인 후) | | |
| D-7 | 게시글 작성 버튼 UI 확인 | 작성 버튼 또는 진입 경로 표시 (작성은 금지) | | |
| D-8 | 비로그인 상태에서 comment/like 시도 시 | 로그인 유도 또는 차단 메시지 | | |

> **D-5, D-6, D-7:** UI 존재 확인만. 실제 write는 `[데이터 write 금지]` 제약으로 Skip.  
> write rehearsal이 필요하면 운영자가 별도 승인 후 진행.

**Findings:**

---

## 7. Manual Flow E — Mobile 375px (상세)

> **전제:** Chrome DevTools → Device 375×812 에뮬레이션 또는 실제 모바일 디바이스.  
> 로그인 상태에서 진행 권장.  
> **상세 체크리스트**: [`docs/MOBILE_CLICK_FLOW_QA_2026-06-10.md`](MOBILE_CLICK_FLOW_QA_2026-06-10.md) — 섹션 A~H 참조.

**핵심 항목 요약 (이 문서 기준):**

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| E-1 | Bottom nav 8탭 전환 | Home/대진/UFC/랭킹/뉴스/커뮤/아카이브/프로필 모두 이동 | | |
| E-2 | Admin 탭 비노출 (비어드민) | Admin 항목 없음 | | |
| E-3 | Event sidebar FAB 탭 | UFC 일정 패널 열림 | | |
| E-4 | Event sidebar 닫기 | 패널 닫힘 | | |
| E-5 | fight card tap → pick slip open | pick slip 패널 열림 | | |
| E-6 | pick slip 선수/method/round UI | UI 표시, 탭 반응 | | |
| E-7 | pick slip close (X + backdrop) | 정상 닫힘 | | |
| E-8 | Stats overlay (ℹ️) open/close | Tale of the Tape 표시/닫힘 | | |
| E-9 | Analysis 패널 확장/축소 | 탭 전환 정상 | | |
| E-10 | 뉴스 카드 이미지 다양화 | 카드마다 다른 이미지 | | |
| E-11 | 뉴스 카드 tap → 외부 링크 또는 modal | 새 탭 또는 modal 열림 | | |
| E-12 | 뉴스 modal 닫기 | 정상 닫힘 | | |
| E-13 | Community post tap → modal 열림 | 정상 열림 | | |
| E-14 | Community modal 닫기 | 정상 닫힘 | | |
| E-15 | Profile — faction 미배정 시 "집단 선택" 버튼 | 버튼 표시 | | |
| E-16 | Faction 선택 모달 open/close | 8개 faction 카드 표시, 닫기 동작 | | |
| E-17 | 가로 overflow 없음 (Home/Event/News/Community) | 375px에서 가로 스크롤 없음 | | |
| E-18 | Console error 없음 (비-Supabase) | 0건 | | |

**Findings:**

---

## 8. Manual Flow F — Signup / Faction Default 확인

> **전제:** 신규 이메일 준비 필요. 운영자 확인 후 실행.  
> 목적: Dagestan 자동 배정 버그 최종 재현 여부 확인.  
> 상세: [`docs/FACTION_DEFAULT_INVESTIGATION_2026-06-10.md`](FACTION_DEFAULT_INVESTIGATION_2026-06-10.md) — 조사 결과 버그 없음으로 결론.

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail/Skip |
|---|---|---|---|---|
| F-1 | 신규 이메일로 회원가입 | 가입 성공, 환영 메시지 | | |
| F-2 | 가입 직후 faction 자동 배정 여부 | **다게스탄 자동 배정 없음** — 프로필에 "집단 선택" 버튼 | | |
| F-3 | 집단 선택 모달 자동 오픈 (0.8초 후) | 모달 자동 표시 | | |
| F-4 | 모달 첫 번째 카드 pre-selected 여부 | 선택된 카드 없음 (다게스탄 포함) | | |
| F-5 | 모달 X 닫기 후 faction 미배정 확인 | 닫기 후 "집단 선택" 버튼 유지 | | |
| F-6 | 비밀번호 확인 필드 불일치 | 에러 메시지 표시 | | |
| F-7 | 이미 가입된 이메일 재시도 | "이미 사용 중" 안내 | | |

> **F-2 판정**: 가입 직후 profile에 🐻 다게스탄 배지가 표시되면 FAIL.  
> 조사 결과: DB DEFAULT null, trigger faction 미설정 → 정상이라면 PASS.

**Findings (F):**

---

## 9. Finding 기록 템플릿

발견 사항은 아래 형식으로 이 문서에 직접 추가하거나 별도 텍스트로 기록한다.

```
### Finding #[번호]

| 항목 | 내용 |
|---|---|
| ID | F-[번호] |
| 심각도 | P0 / P1 / P2 / P3 |
| 화면 | 예: News, Community, Mobile Pick Slip |
| 뷰포트 | Desktop 1440 / Mobile 375 |
| 재현 단계 | 1. ... / 2. ... / 3. ... |
| 예상 결과 | |
| 실제 결과 | |
| 스크린샷 경로 | (선택) |
| 판정 | Fix Required / Backlog / WONTFIX / NEEDS_MANUAL |
```

---

## 10. Pass 기준

이 QA 윈도우 종료 시 아래 조건이 모두 충족되어야 QA 윈도우 2를 PASS로 처리한다.

| # | 기준 | 판정 |
|---|---|---|
| 1 | P0 Finding 0개 | |
| 2 | P1 Finding 0개 (또는 수정 완료) | |
| 3 | write action은 승인된 test-only 또는 Skip 처리 | |
| 4 | Bottom nav 8탭 전환 동작 확인 (E-1, E-2) | |
| 5 | Pick slip open/close, Stats/Analysis 동작 확인 (E-5~E-9) | |
| 6 | News/Community modal open/close 확인 (E-10~E-14) | |
| 7 | Faction 미배정 유저 — 집단 선택 UI 확인 (E-15, E-16) | |
| 8 | **Dagestan 자동 배정 없음 확인 (F-2: PASS)** | |
| 9 | 가로 overflow 없음 확인 (E-17) | |
| 10 | 모든 Finding이 P0/P1/P2/P3로 트리아지 완료 | |

---

## 11. QA 종료 후 다음 액션

| 우선순위 | 액션 | 시점 |
|---|---|---|
| 1 | P0/P1 발견 시 즉시 fix 브랜치 생성 및 수정 | QA 윈도우 2 중 |
| 2 | P2 finding backlog 정리 | QA 윈도우 2 종료 시 |
| 3 | Admin read-only rehearsal 실행 (Section 3 of admin rehearsal doc) | 2026-06-02~04 |
| 4 | Admin write rehearsal Option A 승인 여부 결정 | 2026-06-02~04 |
| 5 | Release Gate G-6 Admin settle 판정 완료 | 2026-06-04 이전 |
| 6 | Feature freeze — 이후 bug fix / release QA only | **2026-06-07 night** |
| 7 | Release Gate 7개 조건 최종 체크 | 2026-06-08~09 |
| 8 | Public release | **2026-06-10** |

---

## Release Gate 현재 상태 (이 문서 작성 시점)

| # | 조건 | 상태 |
|---|---|---|
| G-1 | P0 버그 0개 | ✅ |
| G-2 | P1 버그 0개 | ✅ |
| G-3 | `npm run build` 정상 | ✅ |
| G-4 | GitHub Actions deploy success | ✅ |
| G-5 | Production URL smoke | ✅ (34 PASS / 0 FAIL, 2026-05-25) |
| G-6 | Admin 로그인 + settle 확인 | 🔲 2026-06-02~04 예정 |
| G-7 | 모바일 375px 핵심 플로우 | ⚠️ DOM 확인 완료 / **이 QA 윈도우에서 클릭 플로우 확인** |
| G-8 | P2 이슈 목록 및 계획 | ✅ P2 없음 (현재) |
