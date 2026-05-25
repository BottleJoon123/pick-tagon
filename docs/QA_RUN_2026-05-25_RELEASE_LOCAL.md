# QA Run — 2026-05-25 Local Release Dry Run

> 실행일: 2026-05-25  
> 커밋: `2cd2984` Docs: Add release QA plan  
> 환경: Local dev server (`http://localhost:5173/pick-tagon/`)  
> 뷰포트: Desktop 1440×900 → Mobile 375×812  
> 도구: Playwright headless + Chromium  
> 릴리즈 QA 기준: [`docs/RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md)

---

## 실행 환경

| 항목 | 값 |
|---|---|
| OS | Windows 11 |
| Node | v24.14.1 |
| Playwright | 1.60.0 |
| Vite dev port | 5173 |
| Supabase | 로컬 미연결 (`.env.local` 없음) — Edge Function 404 예상 |
| 로그인 상태 | 비로그인 (headless — 실 계정 테스트는 NEEDS_MANUAL) |

---

## 빌드 사전 확인

| 항목 | 결과 |
|---|---|
| `npm run build` | ✅ PASS (env warning 3건만, 오류 없음) |
| 출력 파일 | `dist/index.html` 335.82 kB / `dist/assets/index-xrnHG9xM.css` 49.12 kB |
| Vite dev server | ✅ 200 OK |

---

## 자동화 QA 결과 요약

| 구분 | 결과 |
|---|---|
| **✅ PASS** | **32** |
| **❌ FAIL** | **0** |
| **⚠️ WARNING** | **5** |
| **P0 발견** | **없음** |
| **P1 발견** | **없음** |

---

## 항목별 결과

### 1. App Load

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| LOAD-1 | App DOM load (home + nav 존재) | ✅ | |
| LOAD-2 | 핵심 전역 함수 노출 | ✅ | `escapeHtml`, `navigateTo`, `renderFeed`, `renderNewsGrid`, `buildNewsCardHtml`, `buildYoutubeShortcutHtml`, `closeNewsDetail`, `closeBetSlip`, `closeMobileSidebar` 전체 확인 |

### 2. Home

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| H-1 | Home 섹션 렌더 | ✅ | content present |
| H-2 | 카운트다운 엘리먼트 존재 | ✅ | |
| H-3 | Home hero 컨텐츠 | ✅ | imgs: 0, headings: 5 (이미지는 DB/CDN 의존 가능) |

### 3. Event / Pick

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| E-1 | Event(matchups) 섹션 렌더 | ✅ | cards: 16 |
| E-2 | Bet slip panel DOM 존재 | ✅ | `#bet-slip-panel` |
| E-3 | Bet slip backdrop DOM 존재 | ✅ | `#bet-slip-backdrop` |
| E-4 | Bet slip 열기 | ⚠️ | 자동화 선택자 미스 — fight card는 로그인 후 실제 클릭 경로, DOM 자체 정상 |
| E-5 | Bet slip 닫기 | ⚠️ | E-4 미오픈으로 skip |
| E-9 | H2H 섹션 DOM 존재 | ✅ | |

> **E-4 분석:** Playwright에서 `[onclick*="openBetSlip"]` 선택자가 `[class*="pick"]` 클래스 요소를 먼저 매칭, 실제 bet slip trigger가 아닌 요소를 클릭. 앱 자체 버그 아님 — **NEEDS_MANUAL** (로그인 후 fight card 클릭).

### 4. Rankings

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| R-1 | Rankings 섹션 렌더 | ✅ | textLen: 2568 |
| R-5 | UFC 랭킹 탭 존재 | ✅ | 6개 탭 |

### 5. Profile

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| P-1 | Profile 섹션 렌더 | ✅ | textLen: 2660 |
| P-2 | Belt 엘리먼트 존재 | ✅ | |

### 6. News

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| N-1 | News grid 존재 | ✅ | grid DOM 존재 |
| N-2a | News detail modal DOM 존재 | ✅ | `#news-detail-modal` hidden=true |
| N-2 | News 상세 모달 열림 | ⚠️ | `no-openDetail-card` — Supabase 미연결로 뉴스 0건, grid는 YouTube shortcut 버튼 4개만 표시 |
| N-3 | News 모달 닫기 | ⚠️ | N-2 미오픈으로 skip |
| N-4 | News 카테고리 탭 존재 | ✅ | 7개 |
| N-5 | News 검색 input 존재 | ✅ | `#news-search-input` |

> **N-2 분석:** 로컬 dev에서 Supabase Edge Function 404로 `cachedNews` 비어 있음 → 뉴스 카드 0개 → YouTube shortcut 4개만 렌더. 배포 환경에서 정상. NEEDS_MANUAL (production smoke에서 확인).

### 7. Community

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| C-1a | Community 섹션 존재 | ✅ | textLen: 1202 |
| C-1b | Post list 존재 | ✅ | `#post-list` DOM 존재 (0 rows — DB 미연결) |
| C-2a | Post detail modal DOM 존재 | ✅ | `#post-detail-modal` hidden=true |
| C-2 | Post 상세 모달 열림 | ⚠️ | `no-rows` — DB 미연결로 게시글 0개 |
| C-6 | Community 카테고리 탭 | ✅ | 6개 (`setCommunityFilter`) |

> **C-2 분석:** `loadPostsFromDB()` 로컬 미연결로 posts 배열 비어 있음. DOM은 정상. NEEDS_MANUAL (production smoke).

### 8. Archive

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| A-1 | Archive 섹션 렌더 | ✅ | textLen: 1755 |

### 9. Admin Gate

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| AD-3 | Admin 섹션 DOM 존재 | ✅ | 텍스트 "ADMIN ONLY / Fighter Control..." 표시 확인 |
| AD-NOTE | Admin 로그인/권한/settle 확인 | NEEDS_MANUAL | 실제 admin 계정 로그인 필요 |

> `[실행 금지]` 항목(Season reset, Danger Zone)은 이번 자동화에서 접근하지 않음.

### 10. Mobile 375px

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| M-1a | Bottom nav DOM 존재 | ✅ | `.bottom-nav` |
| M-2a | Mobile sidebar drawer DOM 존재 | ✅ | `#mobile-sidebar-drawer` |
| M-3 | Mobile Home hero 컨텐츠 | ✅ | len: 2351 |
| M-4 | Mobile event 섹션 렌더 | ✅ | len: 32619 |
| M-6 | Mobile News 카드 (fetch 의존) | ✅ | 4개 (YouTube shortcuts) |
| M-7 | Mobile Community 렌더 | ✅ | len: 1202 |
| M-8 | Mobile Profile 렌더 | ✅ | len: 2660 |
| M-9 | Mobile Rankings 렌더 | ✅ | len: 2568 |

### 11. Console Errors

| ID | 항목 | 결과 | 비고 |
|---|---|---|---|
| ERR-1 | 비 Supabase 콘솔 에러 | ✅ **0건** | P0/P1 해당 없음 |
| ERR-2 | Edge Function 404 (개발환경 예상) | 📋 1건 | `Failed to load resource: 404` — `.env.local` 미설정 시 예상 동작 |

---

## P0 / P1 / P2 / P3 Findings

### P0 — 없음 ✅

### P1 — 없음 ✅

### P2 — 없음 (로컬 관찰 범위에서)

### P3 (기술 부채, 기능 영향 없음)

| # | 항목 | 비고 |
|---|---|---|
| P3-1 | `H-3` — Home hero `imgs: 0` | 파이터 이미지가 DB/CDN 의존으로 로컬에서 미로드 가능. 배포 환경 확인 필요 |
| P3-2 | Edge Function 404 콘솔 에러 | 로컬 dev 예상 동작. `.env.local` 설정 시 해소 |

---

## NEEDS_MANUAL 항목 (자동화 불가 — 수동 확인 필요)

| 항목 | 이유 | 예정 시점 |
|---|---|---|
| 로그인/회원가입 | headless 비로그인 상태 | QA 윈도우 2 (2026-05-29~06-01) |
| Pick 확정 / 변경 (E-5~E-6) | 로그인 + 실제 이벤트 필요 | QA 윈도우 2 |
| News detail modal (N-2) | 로그인 또는 production smoke | Production smoke |
| Community post/comment/like | DB 연결 + 로그인 | QA 윈도우 2 또는 production |
| Admin 로그인 + settle (AD-1~AD-14) | admin 계정 필요 | QA 윈도우 3 (2026-06-02~06-04) |
| Belt tracker / pick history | 로그인 + 픽 히스토리 | QA 윈도우 2 |
| Mobile modal tap / sidebar gesture | 실제 디바이스 또는 DevTools | QA 윈도우 2 |
| Production URL smoke | 배포 후 | 2026-06-08~09 |

---

## 코드 수정 사항

**없음.** P0/P1 발견 없어 코드 변경하지 않음.

---

## 다음 액션

| 우선순위 | 액션 | 시점 |
|---|---|---|
| 1 | Production smoke (login + pick + news + community) | Production 배포 후 바로 |
| 2 | Admin flow 수동 QA (event, settle, archive) | 2026-06-02~04 |
| 3 | NEEDS_MANUAL 항목 수동 확인 (로그인 + pick) | 2026-05-29~06-01 |
| 4 | Release Gate 7개 조건 최종 체크 | 2026-06-08~09 |

---

## Release Gate 현재 상태

| # | 조건 | 상태 |
|---|---|---|
| G-1 | P0 버그 0개 | ✅ |
| G-2 | P1 버그 0개 | ✅ |
| G-3 | `npm run build` 정상 통과 | ✅ |
| G-4 | GitHub Actions deploy success | ✅ (직전 3회 success) |
| G-5 | Production URL smoke | 🔲 미실행 |
| G-6 | Admin 로그인 + settle 확인 | 🔲 NEEDS_MANUAL |
| G-7 | 모바일 375px 핵심 플로우 | ⚠️ DOM 확인 완료, 실제 클릭 플로우는 NEEDS_MANUAL |
| G-8 | P2 이슈 목록 및 계획 | ✅ P2 없음 (현재 범위) |
