# Pick-tagon Release QA Plan — 2026-06-10

> 작성일: 2026-05-25  
> 공개 배포: **2026-06-10**  
> 기능 동결: **2026-06-07 night**  
> Production URL: **https://bottlejoon123.github.io/pick-tagon/**  
> 릴리즈 플래닝: [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md)  
> 기존 QA 참고: [`docs/QA_CHECKLIST.md`](QA_CHECKLIST.md)

---

## 1. QA 목표

| 목표 | 설명 |
|---|---|
| P0/P1 차단 버그 발견 | 배포 전 블로킹 버그 0개 |
| 핵심 플로우 확인 | 일반 사용자 + 관리자/운영자 필수 경로 전체 통과 |
| 모바일 375px 회귀 확인 | 핵심 화면이 모바일에서 동작 불능이 되지 않음 |
| Production smoke | GitHub Pages 배포 URL 기준으로 최종 확인 |
| 2026-06-15 이벤트 대비 | 실제 이벤트에서 픽/정산이 작동해야 함 |

---

## 2. 테스트 환경

### 2-1. URL

| 환경 | URL |
|---|---|
| **Local dev** | `http://localhost:5173/pick-tagon/` (npm run dev) |
| **Production** | `https://bottlejoon123.github.io/pick-tagon/` |

> Local QA 우선 → P0/P1 수정 → Production deploy → Production smoke 순서로 진행한다.

### 2-2. Viewport

| 뷰포트 | 기준 |
|---|---|
| Desktop | 1440 × 900 |
| Mobile | 375 × 812 (iPhone SE/13 mini 기준) |
| Mobile wide | 430 × 932 (iPhone 14 Plus 기준, 선택) |

### 2-3. 계정

| 역할 | 조건 |
|---|---|
| **일반 사용자 A** | 로그인 가능, 닉네임/포인트 있음, 픽 가능 |
| **일반 사용자 B** | 별도 계정 (배틀/like 상대 테스트용) |
| **Admin** | `is_admin = true` 설정 계정 |

> `season reset` / `danger zone` 기능은 **실제 실행 금지** — 아래 Admin 체크리스트 참고.

### 2-4. 사전 조건

- [ ] `npm run build` 정상 통과 확인
- [ ] GitHub Actions deploy 마지막 커밋 `success` 확인
- [ ] Supabase Edge Function `settle-matchup` active 상태 확인
- [ ] 테스트용 이벤트/매치업 1개 이상 존재 (Admin에서 확인)
- [ ] `.env.local` Supabase URL/key 설정 확인 (local QA용)

---

## 3. P0 / P1 / P2 / P3 기준

### P0 — 배포 차단 (즉시 수정 필수)

| # | 항목 |
|---|---|
| P0-1 | 로그인 불가 (회원가입 또는 로그인 버튼 동작 안 함) |
| P0-2 | 앱 진입 불가 (JavaScript error on load, 흰 화면) |
| P0-3 | 픽 확정 불가 (pick slip 제출이 DB에 저장 안 됨) |
| P0-4 | Admin 관리자 접근 불가 (admin 계정으로 admin 섹션 열 수 없음) |
| P0-5 | 정산(settle) 불가 (settle-matchup Edge Function 에러) |
| P0-6 | GitHub Actions deploy 실패 (production URL 404) |
| P0-7 | 데이터 손상 가능성 있는 버그 (잘못된 포인트 차감, 중복 INSERT 등) |
| P0-8 | Supabase secret 노출 (anon key가 source에 하드코딩 등) |

### P1 — 릴리즈 전 수정 권장 (Release Gate 통과 조건)

| # | 항목 |
|---|---|
| P1-1 | 핵심 화면 렌더 실패 (Home / Pick 카드 / Ranking / Profile 중 1개 이상 빈 화면) |
| P1-2 | 모바일 375px에서 핵심 플로우 동작 불가 (nav, pick, modal) |
| P1-3 | 랭킹/포인트 표시 심각 오류 (음수 포인트, 전체 0 표시 등) |
| P1-4 | 뉴스/커뮤니티 핵심 modal 열림/닫힘 불가 |
| P1-5 | Admin result 입력 후 저장 안 됨 |
| P1-6 | pick 변경 불가 (pending 상태에서 re-pick 안 됨) |

### P2 — 배포 후 처리 가능

| 예시 |
|---|
| 특정 카테고리 뉴스 필터가 일부 결과 누락 |
| Community 게시글 정렬 미세 오류 |
| 모바일 레이아웃 여백 이슈 (기능 동작은 됨) |
| Profile belt 애니메이션 재생 오류 |
| Leaderboard 페이지네이션 edge case |

### P3 — 비기능/기술 부채

| 예시 |
|---|
| 콘솔 에러 (Edge Function 404 in local dev — 배포 환경 정상) |
| 코드 중복 (DRY 위반) |
| 불필요한 `console.log` 잔재 |

---

## 4. Core User Flow Checklist

> 각 항목: ✅ PASS / ❌ FAIL / ⚠️ P2 이슈 / 🔲 미테스트

### 4-1. Home

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| H-1 | Home 섹션 렌더 (hero, countdown, fighter cards) | 🔲 | 🔲 |
| H-2 | 이벤트 카운트다운 표시 | 🔲 | 🔲 |
| H-3 | Fighter face-off 카드 표시 | 🔲 | 🔲 |
| H-4 | News 바로가기 → News 섹션 이동 | 🔲 | 🔲 |
| H-5 | Community 바로가기 → Community 섹션 이동 | 🔲 | 🔲 |

### 4-2. Event / Pick 카드

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| E-1 | 대진표(matchups) 섹션 렌더 — 매치업 카드 표시 | 🔲 | 🔲 |
| E-2 | Fight 카드 클릭 → pick slip 열림 | 🔲 | 🔲 |
| E-3 | pick slip — 파이터 선택 → 베팅 패널 표시 | 🔲 | 🔲 |
| E-4 | pick slip — 닫기 (X 버튼 / backdrop 클릭) | 🔲 | 🔲 |
| E-5 | **pick 확정** — 로그인 사용자가 픽 제출 → DB 저장 확인 | 🔲 | 🔲 |
| E-6 | **pick 변경** — pending 상태에서 반대편 선택 가능 | 🔲 | 🔲 |
| E-7 | pending 카드에 "✓ PICKED" 표시 | 🔲 | 🔲 |
| E-8 | settled 카드에 WIN/LOSS/DRAW 결과 표시 | 🔲 | 🔲 |
| E-9 | H2H / radar chart 표시 | 🔲 | 🔲 |
| E-10 | Method/round 보너스 선택 UI 표시 | 🔲 | 🔲 |
| E-11 | Bet slip 총 배당/예상 포인트 계산 표시 | 🔲 | 🔲 |

### 4-3. Rankings / Leaderboard

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| R-1 | Rankings 섹션 렌더 — 리더보드 테이블 표시 | 🔲 | 🔲 |
| R-2 | 현재 사용자 하이라이트 표시 | 🔲 | 🔲 |
| R-3 | Division 탭 전환 (전체/헤비웨이트 등) | 🔲 | 🔲 |
| R-4 | Top 3 티어 뱃지 표시 | 🔲 | 🔲 |
| R-5 | UFC 공식 랭킹 탭 렌더 | 🔲 | 🔲 |

### 4-4. Profile

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| P-1 | Profile 섹션 렌더 — 닉네임/포인트/벨트 표시 | 🔲 | 🔲 |
| P-2 | Belt tracker 진행도 표시 | 🔲 | 🔲 |
| P-3 | 최근 픽 히스토리 표시 (WIN/LOSS/PENDING) | 🔲 | 🔲 |
| P-4 | 로그아웃 → 로그인 화면 복귀 | 🔲 | 🔲 |
| P-5 | 닉네임 변경 모달 | 🔲 | - |
| P-6 | Faction 선택 모달 | 🔲 | 🔲 |

### 4-5. News

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| N-1 | News 섹션 렌더 — 카드 그리드 표시 | 🔲 | 🔲 |
| N-2 | 뉴스 카드 클릭 → 상세 모달 열림 | 🔲 | 🔲 |
| N-3 | 상세 모달 닫기 (X / backdrop) | 🔲 | 🔲 |
| N-4 | 카테고리 탭 필터 (전체/UFC/이벤트 등) | 🔲 | 🔲 |
| N-5 | 검색 키워드 필터 | 🔲 | 🔲 |
| N-6 | 외부 링크 카드 → 새 탭 열림 | 🔲 | 🔲 |
| N-7 | YouTube 바로가기 버튼 표시 | 🔲 | - |

### 4-6. Community

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| C-1 | Community 섹션 렌더 — 게시글 목록 표시 | 🔲 | 🔲 |
| C-2 | 게시글 클릭 → 상세 모달 열림 | 🔲 | 🔲 |
| C-3 | 상세 모달 닫기 | 🔲 | 🔲 |
| C-4 | 댓글 입력 → 저장 | 🔲 | 🔲 |
| C-5 | 좋아요(🔥 추천) 클릭 → 카운트 증가 | 🔲 | 🔲 |
| C-6 | 게시글 카테고리 탭 필터 | 🔲 | 🔲 |
| C-7 | 게시글 정렬 (최신/추천/HOT) | 🔲 | 🔲 |
| C-8 | 새 게시글 작성 → 저장 | 🔲 | 🔲 |
| C-9 | Matchup board 표시 (커뮤니티 내 대진표) | 🔲 | 🔲 |
| C-10 | Pick share 포스트 표시 (🎯 픽 배지) | 🔲 | - |

### 4-7. Archive

| # | 항목 | Desktop | Mobile |
|---|---|---|---|
| A-1 | Archive 섹션 렌더 — 이전 이벤트 목록 표시 | 🔲 | 🔲 |
| A-2 | 이벤트 펼치기 → 결과 표시 | 🔲 | 🔲 |
| A-3 | 이벤트별 정산 결과 (WIN/LOSS) 표시 | 🔲 | 🔲 |

---

## 5. Admin / Operator Checklist

> ⚠️ **Season Reset / Danger Zone은 실제 실행 금지**  
> 아래 항목 중 `[실행 금지]` 표시 항목은 UI 렌더 확인만 하고 실제 동작 버튼은 누르지 말 것.

| # | 항목 | 결과 |
|---|---|---|
| AD-1 | Admin 계정으로 로그인 → Admin 섹션 표시 | 🔲 |
| AD-2 | 일반 계정으로 Admin 섹션 접근 불가 확인 | 🔲 |
| AD-3 | Admin dashboard 렌더 (탭, 패널 표시) | 🔲 |
| AD-4 | 현재 이벤트/매치업 목록 표시 | 🔲 |
| AD-5 | 매치업 빌더 — 파이터 선택/저장 UI 동작 | 🔲 |
| AD-6 | 결과 입력 — WIN/LOSS/DRAW/NC 선택 후 저장 | 🔲 |
| AD-7 | **Settle 실행** — 실제 테스트 이벤트 기준, 포인트 정산 확인 | 🔲 |
| AD-8 | 정산 후 Archive에 이벤트 표시 | 🔲 |
| AD-9 | 정산 후 사용자 포인트 반영 확인 (Ranking 또는 Profile) | 🔲 |
| AD-10 | News 관리 — 뉴스 추가/삭제 UI | 🔲 |
| AD-11 | Fighter 정보 편집 UI | 🔲 |
| AD-12 | Season 관리 탭 표시 확인 **[UI만 확인, 실행 금지]** | 🔲 |
| AD-13 | Danger Zone 탭 표시 확인 **[UI만 확인, 절대 실행 금지]** | 🔲 |
| AD-14 | Admin 로그아웃 → admin 섹션 사라짐 | 🔲 |

---

## 6. Mobile Checklist (375px)

> 기능 동작 여부 기준. 레이아웃 미세 이슈는 P2.

| # | 항목 | 결과 |
|---|---|---|
| M-1 | Bottom nav 탭 전환 — 각 섹션 이동 | 🔲 |
| M-2 | Mobile sidebar 열기/닫기 | 🔲 |
| M-3 | Home hero 렌더 (fighter cards 표시) | 🔲 |
| M-4 | Event pick 카드 — pick slip 열기/닫기 | 🔲 |
| M-5 | Bet slip 패널 동작 (BS open/close) | 🔲 |
| M-6 | News 카드 그리드 → 상세 모달 열기 | 🔲 |
| M-7 | Community 게시글 목록 → 상세 모달 열기 | 🔲 |
| M-8 | Profile belt tracker 표시 | 🔲 |
| M-9 | Leaderboard / Rankings 탭 전환 | 🔲 |
| M-10 | Login / Logout 흐름 | 🔲 |
| M-11 | 모달 닫기 — backdrop 탭 또는 X 버튼 | 🔲 |

---

## 7. Release Gate

모든 조건이 충족되어야 **2026-06-10 공개 배포를 진행**한다.

| # | 조건 | 상태 |
|---|---|---|
| G-1 | **P0 버그 0개** | 🔲 |
| G-2 | **P1 버그 0개** | 🔲 |
| G-3 | `npm run build` 정상 통과 | 🔲 |
| G-4 | GitHub Actions Deploy to GitHub Pages **success** | 🔲 |
| G-5 | Production URL smoke — 앱 로딩, 로그인, 핵심 화면 렌더 PASS | 🔲 |
| G-6 | Admin 로그인 + 결과 입력 + settle 동작 확인 | 🔲 |
| G-7 | 모바일 375px 핵심 플로우 PASS | 🔲 |
| G-8 | P2 이슈 목록 정리 및 배포 후 처리 계획 수립 | 🔲 |

> P2 이슈는 이 문서 하단 [발견 이슈 기록](#9-발견-이슈-기록) 또는 별도 이슈 추적으로 관리.

---

## 8. 실행 순서

```
1. Local QA
   ├─ npm run dev 실행
   ├─ Section 4 (User flow) 전체 체크
   ├─ Section 5 (Admin flow) 전체 체크
   └─ Section 6 (Mobile 375px) 전체 체크

2. P0 / P1 수정
   ├─ P0 발견 시 즉시 수정 → commit → 재검증
   └─ P1 발견 시 수정 → commit → 재검증

3. Pre-deploy 확인
   ├─ npm run build PASS
   └─ git status — .env / settings.local.json 미포함 확인

4. Production deploy
   ├─ git push origin main
   └─ GitHub Actions success 확인

5. Production smoke (Section 4-1 ~ 4-7 핵심 경로만)
   ├─ https://bottlejoon123.github.io/pick-tagon/ 접속
   ├─ 로그인 → 픽 → 커뮤니티 → 뉴스 → 랭킹 확인
   └─ Mobile 375px smoke (M-1 ~ M-5)

6. Release decision
   ├─ Release Gate 7개 항목 전체 체크
   └─ P2 이슈 목록 최종 정리
```

---

## 9. 발견 이슈 기록

> QA 실행 중 발견된 이슈를 아래에 기록한다.

| 날짜 | ID | 심각도 | 화면 | 재현 경로 | 상태 |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

---

## 10. 참고 문서

| 문서 | 링크 |
|---|---|
| 릴리즈 플래닝 | [`RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md) |
| 기존 QA 체크리스트 | [`QA_CHECKLIST.md`](QA_CHECKLIST.md) |
| 5월 17일 최근 QA 런 | [`QA_RUN_2026-05-17_CORE_FLOWS.md`](QA_RUN_2026-05-17_CORE_FLOWS.md) |
| Tailwind 브라우저 QA | [`QA_RUN_2026-05-25_TAILWIND_BROWSER.md`](QA_RUN_2026-05-25_TAILWIND_BROWSER.md) |
| Monolith split 현황 | [`MONOLITH_SPLIT_PLAN.md`](MONOLITH_SPLIT_PLAN.md) |
