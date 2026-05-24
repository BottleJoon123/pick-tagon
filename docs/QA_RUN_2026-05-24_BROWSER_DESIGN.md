# Browser QA — Design Refactor Polish
**Date:** 2026-05-24  
**Branch/Commit:** `main @ 6f1372a`  
**Scope:** Phases 3A–5B design token polish 결과물 전체  
**Method:** 코드 정적 분석 (CSS specificity, HTML 구조, JS 렌더링 경로) + dev server 기동 확인  
**Dev Server:** `http://localhost:5173/pick-tagon/`

> **Note:** Claude Code는 브라우저 창을 직접 열 수 없다.  
> - `PASS (code)` — 코드 분석으로 확인 가능  
> - `ISSUE (code)` — 코드에서 문제가 이미 식별됨  
> - `NEEDS_BROWSER` — 시각/인터랙션 확인이 필요한 항목  

---

## 요약

| 카테고리 | PASS | ISSUE | NEEDS_BROWSER |
|---|---|---|---|
| Home | 4 | 0 | 3 |
| Event/Pick | 3 | 0 | 3 |
| Profile | 4 | 0 | 3 |
| Rankings/Leaderboard | 4 | 0 | 3 |
| Community | 4 | 0 | 3 |
| News | 3 | 0 | 2 |
| Admin | 5 | 0 | 4 |
| 공통 (section header) | — | 2 (P2) | 0 |
| **합계** | **27** | **2** | **21** |

---

## Home

| 항목 | 상태 | 근거 |
|---|---|---|
| `hero-faceoff-card` overflow | PASS (code) | `overflow-hidden`, `w-full xl:w-auto` responsive 적용 |
| `#home-news-grid .glass-card:hover` border | PASS (code) | Phase 4C-QA fix: `border-color` 제거, hover 시 Tailwind `hover:border-ufcRed/30` 동작 |
| `#home-ticker` overflow | PASS (code) | `overflow-hidden` + `border-y border-white/10` — Phase 4C token 적용 |
| Home news glass-card surface | PASS (code) | `#home-news-grid .glass-card { background: var(--pt-bg-2); border-color: var(--pt-line-1); }` |
| countdown unit 375px 클리핑 | NEEDS_BROWSER | `min-width: 64px` × 4 = 256px + gap, faceoff card 내부 — flex 배치에 따라 가능 |
| hero faceoff 좌/우 파이터 패널 375px | NEEDS_BROWSER | 두 열 flex → mobile에서 stack 여부 확인 |
| ticker 애니메이션 | NEEDS_BROWSER | `@keyframes ticker` CSS 기반, 시각 확인 필요 |

---

## Event / Pick

| 항목 | 상태 | 근거 |
|---|---|---|
| Fight card surface/hover | PASS (code) | `#fight-cards-container .glass-card { background: var(--pt-bg-2); }` Phase 3A ✓ |
| Bet slip method/round token 색상 | PASS (code) | `.bs-method-btn.bs-sel-ko` = `--pt-red-500`, sub = purple, ud = blue — color-coded ✓ |
| H2H/radar stats fallback | PASS (code) | Phase 3B: `stats: []` 하드코딩 제거, `_parseStats()` 헬퍼로 교체. `stats1 = f1.stats \|\| [75,75,75,75,75]` fallback 있음 |
| fight card selected/pending/disabled 시각 | NEEDS_BROWSER | JS class toggle 방식 — 시각 확인 필요 |
| bet slip 375px layout overflow | NEEDS_BROWSER | method 4개 + round 5개 버튼 flex layout |
| H2H radar chart 실제 렌더 | NEEDS_BROWSER | DB 데이터 필요, blank 여부는 실환경에서만 확인 가능 |

---

## Profile

| 항목 | 상태 | 근거 |
|---|---|---|
| Profile hero gradient | PASS (code) | `.profile-hero-card::before { radial-gradient(55% 120% at 0% 60%, rgba(225,6,0,0.07), ...) }` ✓ |
| Belt tracker 5 dots 정렬 | PASS (code) | `grid-template-columns: repeat(5, 1fr)` ✓ |
| Profile glass-card surface | PASS (code) | `#profile .glass-card:not(#profile-report-card) { background: var(--pt-bg-2); }` — `profile-report-card` red accent 보존 ✓ |
| `pt-belt-pts` overflow-wrap | PASS (code) | `word-break: keep-all; overflow-wrap: normal` 설정 — "1,000P" 포맷 wrap 방지 |
| Belt label/points 375px 클리핑 | NEEDS_BROWSER | 5열 그리드 내 9px 레이블 + 8px 포인트 — "GOLD BELT 1,000P" 렌더 확인 필요 |
| Profile stat cards 375px overflow | NEEDS_BROWSER | `grid grid-cols-2 lg:grid-cols-4 gap-3` — 2열 layout 확인 |
| Profile report card streak/form chart | NEEDS_BROWSER | JS 렌더 — 데이터 있을 때 실확인 |

---

## Rankings / Leaderboard

| 항목 | 상태 | 근거 |
|---|---|---|
| `#my-rank-card` red gradient 보존 | PASS (code) | `#my-rank-card { background: var(--pt-bg-2); }` + 원본 `border-ufcRed/30` + `box-shadow` inline 보존 ✓ |
| `#leaderboard-player-panel` surface | PASS (code) | Phase 4B: `background: var(--pt-bg-2); border-color: var(--pt-line-1);` ✓ |
| Faction ranking board glass-cards | PASS (code) | `#faction-ranking-board .glass-card:not(.faction-ranking-mine)` — `mine` state 보존 ✓ |
| Player/faction tab 전환 | PASS (code) | `switchLeaderboardTab` 함수 존재 확인 ✓ |
| Leaderboard accuracy/mobile 열 | NEEDS_BROWSER | `grid-cols-12` 복잡 grid — 375px narrow 확인 |
| faction card selected/mine state 시각 | NEEDS_BROWSER | `.faction-ranking-mine` class 보존 확인 |
| Event Leaderboard sub-section | NEEDS_BROWSER | JS `renderEventLeaderboard()` 출력 — 데이터 있을 때 확인 |

---

## Community

| 항목 | 상태 | 근거 |
|---|---|---|
| Filter active red border | PASS (code) | Phase 5A-QA fix: `#community .comm-filter-btn.active { border-color: rgba(225,6,0,0.4); }` (1,2,0) ✓ |
| Filter hover border | PASS (code) | `#community .comm-filter-btn:hover { border-color: var(--pt-line-3); }` (1,2,0) ✓ |
| Post list / row surface | PASS (code) | `post-list-container`, `post-list-head`, `post-row` 모두 token 적용 ✓ |
| Post detail modal glass-card surface | PASS (code) | `#post-detail-modal .glass-card { background: var(--pt-bg-2); }` ✓ |
| Post detail modal open/close + body scroll | NEEDS_BROWSER | `openPostDetail` → `document.body.style.overflow = 'hidden'`, close → `''` 복원 |
| comment input layout 375px | NEEDS_BROWSER | `.post-com-input` 실렌더 확인 |
| post expand/collapse 애니메이션 | NEEDS_BROWSER | JS toggle 방식 — 시각 확인 |

---

## News (MMA)

| 항목 | 상태 | 근거 |
|---|---|---|
| News category tab active 상태 | PASS (code) | `renderNewsCatTabs` — active: `bg-ufcRed/15 border-ufcRed/50 text-white` (inline HTML), CSS specificity 이슈 없음 |
| News card surface/hover | PASS (code) | `#news-grid .glass-card { background: var(--pt-bg-2); }` / hover `{ background: var(--pt-bg-3); box-shadow: none; }` ✓ |
| News detail modal surface | PASS (code) | `#news-detail-modal .glass-card { background: var(--pt-bg-2); border-color: var(--pt-line-1); }` ✓ |
| News tab 375px horizontal scroll | NEEDS_BROWSER | `#news-cat-tabs` div: `overflow-x-auto` ✓ — scroll behavior 시각 확인 |
| News detail modal open/close | NEEDS_BROWSER | JS 인터랙션 확인 필요 |

---

## Admin

| 항목 | 상태 | 근거 |
|---|---|---|
| Admin section header sx-head | PASS (code) | `class="sx-head"` (line 1331) ✓ |
| Admin tab 기본 border token | PASS (code) | `#admin .admin-tab { border-color: var(--pt-line-1); }` (1,1,0) > inline (0,1,0) ✓ |
| Admin tab active-tab border 보존 | PASS (code) | `#admin .admin-tab.active-tab { border-color: rgba(225,6,0,0.35); }` (1,2,0) 명시 ✓ |
| Admin tab active-tab bg/color 보존 | PASS (code) | `background:rgba(232,0,13,0.12); color:var(--red)` — 우리 규칙이 이 속성 미override ✓ |
| Dashboard stat card accent colors 보존 | PASS (code) | `#admin-panel-dashboard` 미포함 — Tailwind bg accent classes 그대로 유지 ✓ |
| Season yellow/red accent borders 보존 | PASS (code) | `#admin-panel-season` 미포함 — `border-yellow-500/20`, `border-ufcRed/20` 유지 ✓ |
| Admin gate modal surface | PASS (code) | `#admin-gate-modal .glass-card { background: var(--pt-bg-2); border-color: var(--pt-line-1); }` ✓ |
| Admin tab active/hover 시각 | NEEDS_BROWSER | CSS 정합성은 확인됨, 눈으로 confirm 필요 |
| Dashboard stat card 실렌더 시각 | NEEDS_BROWSER | JS `renderAdminDashboard()` — 로그인 후 확인 |
| Season danger zone 강조색 시각 | NEEDS_BROWSER | inline `style=background:...` → CSS override 없음이 눈으로 확인 필요 |
| Mobile 375px admin tab wrap | NEEDS_BROWSER | 7개 탭 + `flex-wrap` — 2~3행으로 wrap 예상, overflow 없는지 확인 |

---

## 공통 — Section Header 미변환 (ISSUE P2)

Phase 3~5B 범위에 포함되지 않았던 두 섹션이 여전히 inline 클래스 사용 중.

| 섹션 ID | 현재 | 권장 | 우선순위 |
|---|---|---|---|
| `#ufc-rankings` (line 726) | `class="border-l-8 lg:border-l-[12px] border-ufcRed pl-4 lg:pl-8"` | `class="sx-head"` | P2 |
| `#archive` (line 1216) | `class="border-l-8 lg:border-l-[12px] border-ufcRed pl-4 lg:pl-8"` | `class="sx-head"` | P2 |

> 기능/레이아웃 영향 없음. `sx-head`와 시각적으로 동일한 값. 다음 polish phase에서 일괄 처리 권장.

---

## Section Header 의도적 non-sx-head (정상)

| 섹션 | 클래스 | 이유 |
|---|---|---|
| Event Leaderboard sub-header (line 787) | `border-yellow-500` | 이벤트 전용 노란 accent — 의도적 |
| Hall of Fame sub-header (line 941) | `border-yellow-500` | 역대 시즌 기록 노란 accent — 의도적 |

---

## 수정 우선순위

| 우선순위 | 항목 | 현황 |
|---|---|---|
| **P0** | 기능 깨짐 | 없음 |
| **P1** | 모바일 레이아웃 심각 | 없음 (code 분석상) |
| **P2** | `#ufc-rankings` / `#archive` section header 미변환 | 다음 phase에서 처리 |
| **P2** | `#ufc-rankings` / `#archive` glass-card token 미적용 | 다음 phase에서 처리 |
| **P3** | NEEDS_BROWSER 21개 항목 | 사람이 직접 브라우저 확인 필요 |

---

## 브라우저 확인 권장 순서 (사람이 직접)

```
1. Home (desktop 1440 → mobile 375)
   - 타이머 4개 단위 표시 확인
   - ticker 흐름 확인
   - news card hover red border 확인

2. Event/Pick (모바일 우선)
   - fight card tap → bet slip open
   - method/round 선택 시 색상 token 확인
   - H2H 탭 클릭 → 레이더 차트 or fallback

3. Profile (375px)
   - 벨트 트래커 5칸 레이블 클리핑 없는지 확인

4. Leaderboard (375px)
   - player/faction tab 전환
   - 내 순위 row 빨간 gradient

5. Community
   - 필터 active 빨간 테두리 확인
   - post detail 열고 닫기 (body scroll 복원)

6. News
   - 카테고리 탭 active 상태
   - 뉴스 카드 클릭 → detail modal

7. Admin (로그인 필수, destructive action 절대 금지)
   - 탭 전환: dashboard → fighters → ufc → season → settings
   - season 탭: Current Season 노란 border, Danger Zone 빨간 border 확인
   - 375px: 탭이 자연스럽게 wrap 되는지 확인
```

---

## Console 확인 권장 항목 (브라우저 DevTools)

- `Supabase select error` — DB 연결 실패 여부
- `missing asset 404` — CSS/JS/image 경로
- `Cannot read properties of undefined` — 초기 로드 race condition
- `ResizeObserver loop` — chart 렌더 관련 경고
