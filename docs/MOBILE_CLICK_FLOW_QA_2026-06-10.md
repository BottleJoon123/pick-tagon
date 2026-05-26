# Mobile Click Flow QA — 2026-05-29
상세 체크리스트 (Release Gate G-7)

> 작성일: 2026-05-26  
> 실행 예정: **2026-05-29 ~ 2026-06-01**  
> 환경: Production — `https://bottlejoon123.github.io/pick-tagon/`  
> 뷰포트: **375×812** (Chrome DevTools 또는 실제 모바일)  
> 참조: [`docs/QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md`](QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md)  
> Faction 조사: [`docs/FACTION_DEFAULT_INVESTIGATION_2026-06-10.md`](FACTION_DEFAULT_INVESTIGATION_2026-06-10.md)

---

## 0. 준비

### 기기 / 환경
- [ ] Chrome 최신 버전
- [ ] DevTools → Device → **iPhone SE (375×667)** 또는 375×812 수동 설정
- [ ] 실제 모바일 기기 병행 권장 (touch event 확인용)
- [ ] Console 탭 열어 에러 모니터링
- [ ] 일반 유저 계정 준비 (이메일 + 비밀번호)
- [ ] Admin 계정 준비 (read-only 확인용)
- [ ] **신규 가입용 이메일 준비** (faction default 재현 확인용 — 섹션 G)

### 절대 금지 액션
| ❌ 금지 | 이유 |
|---|---|
| pick confirm (test matchup 제외) | 실 데이터 |
| community post/comment 작성 | 실 데이터 |
| community like | 실 데이터 변경 |
| admin settle / season reset | 복구 불가 |

---

## A. Bottom Nav — 8개 탭 전환

> 비로그인 상태에서 시작. 하단 네비게이션 바 기준.

| ID | 탭 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| A-1 | 홈 (Home) | 홈 화면 렌더, hero 섹션 표시 | | |
| A-2 | 대진 (Event) | 대진표 화면 렌더 | | |
| A-3 | UFC (Rankings) | UFC 랭킹 화면 렌더 | | |
| A-4 | 랭킹 (Leaderboard) | 랭킹 화면 렌더 | | |
| A-5 | 뉴스 (News) | 뉴스 카드 그리드 렌더 | | |
| A-6 | 커뮤 (Community) | 게시글 목록 렌더 | | |
| A-7 | 아카이브 (Archive) | 아카이브 화면 렌더 | | |
| A-8 | 프로필 (Profile) | 프로필 화면 렌더 (로그인 필요 시 로그인 유도) | | |
| A-9 | Admin 탭 비노출 확인 | 비로그인 / 일반 유저 — Admin 탭 없어야 함 | | |

**Findings (A):**

---

## B. Home 화면

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| B-1 | Hero 섹션 렌더 | 파이터 이미지 + 텍스트 표시 | | |
| B-2 | CTA 버튼 탭 | 대진표 또는 지정 화면으로 이동 | | |
| B-3 | Event ticker/stats 표시 | 통계 숫자 렌더 (0 포함) | | |
| B-4 | Event sidebar 진입 버튼 (모바일 FAB) | UFC 일정 사이드바 패널 열림 | | |
| B-5 | Event sidebar 닫기 | 사이드바 닫힘, 홈 화면 복귀 | | |
| B-6 | 뉴스 섹션 카드 렌더 | 홈 뉴스 그리드 표시 | | |
| B-7 | 가로 스크롤 / overflow 없음 | 375px에서 가로 스크롤 없어야 함 | | |

**Findings (B):**

---

## C. Event — Fight Card & Pick Slip

> 로그인 상태 필요.

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| C-1 | 대진표 진입 | fight card 목록 렌더 (스켈레톤 → 실 카드) | | |
| C-2 | 섹션 헤더 표시 | "메인 카드" / "프렐림" 구분 표시 | | |
| C-3 | Hero 카드 탭 | pick slip 패널 열림 | | |
| C-4 | Strip (프렐림) 카드 탭 | pick slip 패널 열림 | | |
| C-5 | pick slip 선수 선택 UI | Red/Blue 버튼 표시, 탭 가능 | | |
| C-6 | method 선택 UI | KO/TKO, SUB, UD, SD, MD 버튼 | | |
| C-7 | round 선택 UI | 1~5라운드 버튼 또는 N/A | | |
| C-8 | pick slip 닫기 (X 버튼) | 패널 닫힘, fight card 화면 복귀 | | |
| C-9 | pick slip 닫기 (backdrop 탭) | 패널 닫힘 | | |
| C-10 | STATS (ℹ️) 버튼 탭 | Tale of the Tape overlay 열림 | | |
| C-11 | STATS overlay 닫기 | overlay 닫힘 | | |
| C-12 | ANALYSIS (▼) 버튼 탭 | 분석 패널 확장됨 | | |
| C-13 | Analysis 탭 전환 (차트/스탯/분석/최근전적) | 탭 전환, 해당 내용 표시 | | |
| C-14 | ANALYSIS (▲) 버튼 탭 | 분석 패널 축소됨 | | |
| C-15 | 커뮤니티 픽 바 표시 | Red/Blue 비율 막대 표시 | | |
| C-16 | MY PICK 배너 (픽 후) | 기존 픽 Fighter 이름 표시 | | |
| C-17 | Settled 카드 표시 | 결과 WIN/LOSE 배지 표시 | | |
| C-18 | 파이터 이름 탭 → 프로필 모달 | 파이터 정보 모달 열림 | | |
| C-19 | 파이터 프로필 모달 닫기 | 모달 닫힘 | | |

> **C pick confirm**: 운영자 승인 없이는 실행 금지. C-5~C-7은 UI 확인까지만.

**Findings (C):**

---

## D. News

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| D-1 | News 진입 | 뉴스 카드 그리드 렌더 | | |
| D-2 | 뉴스 카드 이미지 다양화 확인 | 카드마다 다른 이미지 (동일 이미지 반복 ❌) | | |
| D-3 | 카테고리 탭 — UFC | UFC 카드만 표시 | | |
| D-4 | 카테고리 탭 — 결과 | 결과 카드만 표시 | | |
| D-5 | 카테고리 탭 — 전체 | 전체 카드 표시 | | |
| D-6 | 검색 input 탭 | 키보드 열림, 입력 가능 | | |
| D-7 | 검색어 입력 ("UFC") | 관련 카드만 필터 | | |
| D-8 | 검색 초기화 | 전체 카드 복귀 | | |
| D-9 | 뉴스 카드 탭 (외부 링크) | 새 탭 열림, 기사 페이지 이동 | | |
| D-10 | 뉴스 detail modal 열림 (있는 경우) | 제목/본문 표시 | | |
| D-11 | 뉴스 modal 닫기 | 닫힘 | | |
| D-12 | 가로 overflow 없음 | 375px에서 카드 잘림 없음 | | |

**Findings (D):**

---

## E. Community

> post/comment 작성, like는 실행 금지.

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| E-1 | Community 진입 | 게시글 목록 렌더 | | |
| E-2 | 카테고리 탭 필터 | 해당 카테고리만 표시 | | |
| E-3 | 게시글 카드 탭 → post detail modal 열림 | 제목/내용/댓글수 표시 | | |
| E-4 | post detail modal — X 버튼 닫기 | 모달 닫힘, 목록 복귀 | | |
| E-5 | post detail modal — backdrop 탭 닫기 | 모달 닫힘 | | |
| E-6 | 댓글 input UI 표시 (작성 금지) | 입력 필드 노출 확인 | | |
| E-7 | 좋아요 버튼 UI 표시 (탭 금지) | 버튼 노출 확인 | | |
| E-8 | 게시글 작성 버튼 UI (탭 금지) | 버튼 노출 확인 | | |
| E-9 | 비로그인 상태 write 시도 | 로그인 유도 메시지 표시 | | |
| E-10 | 가로 overflow 없음 | 375px에서 post 카드 잘림 없음 | | |

**Findings (E):**

---

## F. Profile / Leaderboard

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| F-1 | Profile 진입 (로그인) | 닉네임, 포인트, 픽 통계 표시 | | |
| F-2 | 벨트 트래커 렌더 | belt 이미지/등급 표시, overflow 없음 | | |
| F-3 | 체급별 적중률 차트 | 내용 렌더 (데이터 없으면 empty state) | | |
| F-4 | 방식별 적중률 / 보너스 현황 | 내용 렌더 | | |
| F-5 | faction 미선택 유저 — "집단 선택" 버튼 노출 | 버튼 표시 | | |
| F-6 | 집단 선택 모달 열기 | 8개 faction 카드 그리드 표시 | | |
| F-7 | 집단 선택 모달 닫기 (X 또는 backdrop) | 모달 닫힘 | | |
| F-8 | Leaderboard 진입 | 순위 테이블 렌더 | | |
| F-9 | Leaderboard 탭 전환 (개인/집단) | 탭 전환 정상 | | |
| F-10 | UFC Rankings 진입 | 랭킹 테이블 렌더 | | |
| F-11 | Rankings 체급 탭 전환 | 해당 체급 랭킹 표시 | | |
| F-12 | Rankings 챔피언 배지 C | 올바른 선수에게만 C 배지 | | |

**Findings (F):**

---

## G. Signup / Faction Default 재확인

> **신규 가입용 이메일 필요.** 실행 전 운영자 확인.  
> 목적: Dagestan 자동 배정 버그 재현 여부 최종 확인.

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| G-1 | 신규 이메일로 회원가입 폼 접근 | 닉네임/이메일/비밀번호 입력 필드 표시 | | |
| G-2 | 비밀번호 확인 필드 불일치 입력 | 에러 메시지 표시 | | |
| G-3 | 이미 가입된 이메일 입력 | "이미 사용 중인 이메일" 안내 표시 | | |
| G-4 | 신규 계정 가입 완료 | 환영 메시지 표시 | | |
| G-5 | 가입 직후 faction 표시 확인 | **다게스탄 자동 배정 없어야 함** — `currentFaction = null` | | |
| G-6 | 집단 선택 모달 자동 오픈 여부 | 약 0.8초 후 faction 선택 모달 자동 표시 | | |
| G-7 | 모달 첫 번째 카드 확인 | 다게스탄이 첫 번째 → pre-selected 상태는 아님 | | |
| G-8 | 모달 X 닫기 — faction 미배정 확인 | 닫기 후 프로필에 "집단 선택" 버튼 표시 | | |
| G-9 | 비밀번호 재설정 링크 탭 | 재설정 화면 또는 이메일 발송 안내 | | |
| G-10 | 재가입 방지 — 동일 이메일 재시도 | 에러 또는 로그인 유도 | | |

> **G-5 판정 기준**: 가입 후 profile 화면에 집단 배지(🐻 등)가 표시되면 FAIL.  
> 예상: 집단 배지 없음 + "집단 선택" 버튼 표시.

**Findings (G):**

---

## H. Console Error 확인

| ID | 체크 항목 | 예상 | 실제 | P/F |
|---|---|---|---|---|
| H-1 | 앱 최초 로드 시 console error | 비-Supabase 에러 0건 | | |
| H-2 | 각 섹션 이동 후 console error | 비-Supabase 에러 0건 | | |
| H-3 | pick slip 오픈/닫기 후 console error | 0건 | | |
| H-4 | 로그인 / 로그아웃 후 console error | 0건 | | |

> Supabase 관련 CORS/ERR_NAME_NOT_RESOLVED 는 production에서 정상 — 제외하고 판정.

**Findings (H):**

---

## Pass 기준 (G-7 완료 조건)

이 체크리스트 실행 후 아래가 모두 충족되면 **G-7 PASS**:

| # | 조건 |
|---|---|
| 1 | Bottom nav 8개 탭 전환 동작 (A-1~A-9) |
| 2 | Pick slip open/close 정상 (C-3, C-4, C-8, C-9) |
| 3 | Stats overlay / Analysis 탭 동작 (C-10~C-14) |
| 4 | News 카드 탭 및 이미지 다양화 확인 (D-2, D-9) |
| 5 | Community post modal open/close (E-3, E-4) |
| 6 | Faction 미배정 유저 — 집단 선택 UI 표시 (F-5, F-6) |
| 7 | **G-5: Dagestan 자동 배정 없음 확인** |
| 8 | 가로 overflow 없음 (B-7, D-12, E-10) |
| 9 | P0/P1 Finding 0건 |

---

## Finding 기록 템플릿

```
### Finding #[번호]

| 항목 | 내용 |
|---|---|
| ID | MF-[번호] |
| 심각도 | P0 / P1 / P2 / P3 |
| 섹션 | A / B / C / D / E / F / G / H |
| 체크 ID | 예: C-8 |
| 뷰포트 | Mobile 375 / 430 |
| 재현 단계 | 1. ... / 2. ... |
| 예상 결과 | |
| 실제 결과 | |
| 판정 | Fix Required / Backlog / WONTFIX |
```

---

## 결과 요약 템플릿

QA 완료 후 아래를 채워 `docs/RELEASE_FIX_CLOSEOUT_2026-05-26.md` G-7에 붙여넣는다.

```
G-7 Mobile 핵심 플로우: [PASS / FAIL]
실행일: 2026-XX-XX
실행자:
P0: X건 / P1: X건 / P2: X건 / P3: X건
Dagestan 자동 배정: [재현 없음 / 재현됨 — 상세 기록]
```
