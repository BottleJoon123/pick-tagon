# Pick-tagon Design System Refactor Plan

> 브랜치: `refactor/design-apply`  
> 기준 커밋: `83eac18` (main)  
> 핸드오프 경로: `docs/design_handoff_picktagon/`

---

## 현황 분석

### 현재 index.html CSS 구조

- **총 6,447줄** 단일 HTML 파일 (CSS 인라인 `<style>` 블록 + JS 혼재)
- `:root` 변수 5개만 정의됨 — 대부분 값이 하드코딩

```css
/* 현재 index.html :root */
--red: #e8000d;
--red-dim: rgba(232,0,13,0.15);
--red-glow: 0 0 40px rgba(232,0,13,0.4);
--glass: rgba(255,255,255,0.03);
--glass-border: rgba(255,255,255,0.08);
--dark: #0c0c0c;
```

### 설계 토큰 (`docs/design_handoff_picktagon/design-system/tokens.css`)

`--pt-*` 네임스페이스로 완전히 정의된 시스템 (약 65개 변수):

| 그룹 | 토큰 수 | 예시 |
|---|---|---|
| Surface (bg-0~4) | 5 | `--pt-bg-1: #0E0F12` |
| Border/hairline | 4 | `--pt-line-2: rgba(255,255,255,0.10)` |
| Ink (ink-0~4) | 5 | `--pt-ink-2: #B3B5BC` |
| Red scale (50~900) | 8 + glow | `--pt-red-500: #E10600` |
| Corner colors | 4 | `--pt-corner-blue: #1F6FEB` |
| Status | 4 | `--pt-win: #1FBF6B` |
| Belt tiers | 5 | `--pt-belt-purple: #8B3FE3` |
| Typography | 4 fonts + 8 sizes + 5 lh/tracking | `--pt-font-body: 'Barlow'` |
| Space | 10 | `--pt-space-4: 16px` |
| Radius | 6 | `--pt-r-md: 12px` |
| Shadow | 3 | `--pt-shadow-card` |
| Motion | 3 easing + 3 duration | `--pt-dur-base: 220ms` |

### 주요 변경 포인트 (현재 → 토큰)

| 항목 | 현재 값 | 토큰 값 |
|---|---|---|
| Red accent | `#e8000d` | `--pt-red-500: #E10600` |
| Background | `#0c0c0c` | `--pt-bg-1: #0E0F12` |
| Body font | `'Inter'` | `--pt-font-body: 'Barlow'` |
| Display font | `'Oswald'` | `--pt-font-display: 'Barlow Condensed'` |
| Card bg | hardcoded `#131313` | `--pt-bg-2: #14161B` |
| Border | `rgba(255,255,255,0.08)` | `--pt-line-2: rgba(255,255,255,0.10)` |
| Ink secondary | `rgba(255,255,255,0.78)` | `--pt-ink-1: #ECECEE` |

---

## 파일 구조 목표

```
index.html           (CSS 인라인 → <link> 참조로 이동)
public/
  css/
    tokens.css       ← Phase 1: 핸드오프 tokens.css 이식
    shell.css        ← Phase 2: 앱 헤더/컨테이너 공통 CSS
    components.css   ← Phase 2: 재사용 컴포넌트 (card, button, badge 등)
  js/
    ...              (기존 유지)
docs/
  design_handoff_picktagon/
    design-system/tokens.css   ← 원본 기준 자료 (수정 금지)
```

---

## Phase 1 — Design Tokens 도입

**목표:** 하드코딩된 색상/폰트/간격 값을 `--pt-*` 토큰으로 교체하는 기반 마련

### 작업 범위

1. `public/css/tokens.css` 생성  
   - `docs/design_handoff_picktagon/design-system/tokens.css` 내용 그대로 이식  
   - 유일한 변경: `@import` 폰트 URL (동일하게 유지)

2. `index.html` `<head>` 수정  
   - Google Fonts `<link>` 바로 아래 두 CSS 파일 링크 추가  
   - 기존 인라인 `:root { --red: ... }` 블록 제거 (bridge가 대체)

3. `public/css/theme-bridge.css` 생성  
   - 레거시 변수(`--red`, `--dark` 등)를 기존 값 그대로 유지  
   - Phase 3+에서 `var(--pt-*)` 참조로 단계적 교체 예정

### 결정 사항 — Font Policy

| 역할 | Phase 1 결정 | 향후 |
|---|---|---|
| Body | `Pretendard → Inter` (Korean 가독성 우선) | 유지 |
| Display | `Barlow Condensed` (이미 로드됨) | `--pt-font-display` 참조로 교체 |
| Eyebrow | `Oswald` (이미 로드됨) | Phase 3: `Bebas Neue`로 전환 |
| Mono | `JetBrains Mono` (Phase 1에서 신규 로드) | `--pt-font-mono` 참조 |

**Red color 결정**: Phase 1에서는 `--red: #e8000d` 값 유지 (시각 동결).  
Phase 3부터 `var(--pt-red-500)` (`#E10600`)으로 점진 교체.  
두 값 hex 차이 미미 (`#e8000d` vs `#E10600`) — 사용자 눈에 구분 불가능 수준.

### 결과 (적용 완료)

| 파일 | 변경 | 결과 |
|---|---|---|
| `public/css/tokens.css` | 신규 생성 | `--pt-*` 65개 변수 active |
| `public/css/theme-bridge.css` | 신규 생성 | 레거시 `--red` 등 backward compat 유지 |
| `index.html` `<head>` | 2개 `<link>` 추가 + `:root` 제거 | 빌드 통과, 시각 변화 없음 |
| `npm run build` | 통과 | `dist/css/tokens.css`, `dist/css/theme-bridge.css` 생성 확인 |

### 완료 기준

- [x] `--pt-bg-1`, `--pt-red-500` 등 토큰이 페이지에서 active 상태
- [x] 기존 `var(--red)` 21회 참조 정상 동작 (bridge 제공)
- [x] `npm run build` 통과
- [ ] 폰트 교체 (Phase 3: Display/Eyebrow 단계적 전환)

---

## Phase 2 — 공통 CSS 분리

**목표:** `index.html` 인라인 `<style>` 에서 재사용 가능한 컴포넌트/셸 CSS를 별도 파일로 추출

### 결과 (적용 완료)

**추출 → `public/css/app.css`** (221줄):

| 그룹 | 클래스 |
|---|---|
| Base reset | `*`, `body`, media |
| Build badge | `.build-badge` |
| Typography | `.barlow`, `.oswald-sharp` |
| Glass card | `.glass-card`, `.glass-card-gold` |
| Section transitions | `.section-animate`, `@keyframes sectionFade` |
| Nav | `.nav-link`, `.bottom-nav-item` |
| Button | `.btn-red` |
| Card hover | `.fight-card-hover` |
| Ticker | `.ticker-wrap`, `.ticker-content`, `@keyframes ticker` |
| Progress/Pulse | `.progress-bar-fill`, `.pulse-dot`, `@keyframes pulse` |
| Mobile nav | `#mobile-nav`, `.scrollbar-hide` |
| Toast | `#toast-container`, `.toast`, keyframes |
| Stat slider | `.stat-slider` |
| Chart | `.chart-wrapper`, `@keyframes spin/slideUp` |
| Input override | `input[type=*]`, `textarea`, `select` |
| Transition helpers | `.method-btn`, `.round-btn` |
| Section divider | `.section-header-line` |

**남은 index.html `<style>`** (405줄 — 원래 635줄에서 -230줄):

| 그룹 | 이유 |
|---|---|
| `#home` hero + animations | Home 화면 전용 |
| `.countdown-unit/num/label` | Home 화면 전용 |
| `.stat-counter` | Home 화면 전용 |
| `.admin-tab` | Admin 화면 전용 |
| `@keyframes fighter-*` + `.anim-*` | Pick 화면 전용 |
| `.faction-card` | Community 전용 |
| Community Dense UI (matchup/post) | Community 전용 |
| `#bet-slip-*` | Pick/Bet 전용 |

### 영향 파일

| 파일 | 변경 유형 | 결과 |
|---|---|---|
| `public/css/app.css` | 신규 생성 (221줄) | 17개 그룹 공통 스타일 분리 |
| `index.html` `<style>` | 230줄 제거 + link 추가 | 635줄 → 405줄 (-36%) |
| `npm run build` | 통과 | `dist/css/app.css` 생성 확인 |

---

## Phase 3 — Event / Pick 화면 디자인 적용

**목표:** 가장 노출 빈도 높은 두 화면을 핸드오프 기준으로 재구현

### 핸드오프 기준 파일

- `docs/design_handoff_picktagon/screens/screen-event.html`
- `docs/design_handoff_picktagon/screens/screen-home.html` (Pick 탭 포함)

### Phase 3A 결과 (적용 완료)

| 파일 | 변경 | 결과 |
|---|---|---|
| `public/css/theme-bridge.css` | `--red: var(--pt-red-500)` 마이그레이션 | 모든 `var(--red)` 참조(JS 인라인 포함)가 `#E10600`으로 해결 |
| `public/css/app.css` | `#fight-cards-container .glass-card` 토큰 업그레이드 + `.sx-head` + `.live-bar-*` | 파이트 카드 배경 `--pt-bg-2`, 테두리 `--pt-line-1` 적용 |
| `index.html` 인라인 `<style>` | 베팅 슬립 CSS 토큰화 | `#111` → `var(--pt-bg-2)`, `#e8000d` → `var(--pt-red-500)` 등 |
| `npm run build` | 통과 | `dist/css/*` 3개 파일 갱신 확인 |

### Phase 3A 완료 기준

- [x] `--red` 마이그레이션: `#e8000d` → `var(--pt-red-500)` (theme-bridge.css)
- [x] 파이트 카드 배경 `--pt-bg-2` 적용 (`#fight-cards-container .glass-card`)
- [x] 베팅 슬립 패널 배경 `--pt-bg-2`, 테두리 `--pt-line-2`
- [x] `.sx-head` 유틸리티 클래스 추가
- [x] `.live-bar-left/.live-bar-right` CSS 토큰 기본값 정의
- [x] `npm run build` 통과
- [ ] `api/supabase.js:383` `stats: []` 수정 (레이더 차트 빈값) — Phase 3B로 이월

### Phase 3B 완료 기준

- [x] `#matchups` 섹션 헤더 `.sx-head` 적용 (3B-1)
- [x] `stats: []` 하드코딩 제거 — `fighterDB` 이름 매칭으로 대체 (3B-2)
- [x] `_parseStats` 헬퍼 추가 (JSONB 배열 / JSON 문자열 / 미존재 3가지 경로 처리)
- [x] `record`, `nameEn`, `recent` 도 fighterDB에서 함께 매핑

---

## Phase 3C — QA & 리스크 리뷰

**목표:** Phase 3A/3B 변경이 코드·빌드 기준으로 안전한지 검증하고 잔여 리스크를 문서화한다.

### 코드 경로 검증 결과

| 검증 항목 | 결과 |
|---|---|
| `stats: []` 하드코딩 잔존 여부 (`rg "stats: \[\]"`) | **없음** — 완전 제거 |
| `_parseStats` / `_f1db` dist 반영 | `dist/js/api/supabase.js` 정상 반영 |
| `npm run build` | **통과** (370.51 kB, 297 ms) |
| DB write 경로(`supabase.update/upsert`) 변경 | **없음** |
| `openBetSlip` / `confirmBetSlip` / `updateAllFightCards` 변경 | **없음** |
| `analyzeStyleMatchup` 호출 경로 (`h2h.js:75`) | 변경 없음 — `stats1 = f1.stats \|\| [75,75,75,75,75]` 유지 |

### 이름 매칭 리스크 분석

**현재 동작:**
- `fetchUpcomingMatchups` → `fighterDB.find(d.name === m.red_fighter_name)` 정확히 일치 시 stats 전달
- 불일치 시 `stats: []`, `record: ''`, `recent: []` fallback (기존과 동일)

**잔여 리스크:**

| 리스크 | 영향 | 심각도 |
|---|---|---|
| `matchups.red_fighter_name`이 `fighters.name`과 대소문자·공백 차이 | stats 빈값 → 레이더 차트 blank | 중간 |
| `[]` 는 JS truthy → `h2h.js:62` `f.stats \|\| [75,75,75,75,75]` 가 `[]`를 그냥 통과시킴 | H2H 레이더 차트 빈값 표시 (크래시 없음) | 낮음 |
| `analyzeStyleMatchup([])` → `undefined` 비교 → "올라운더" 반환 | 분석 텍스트 부정확 (크래시 없음) | 낮음 |
| `fighterDB`가 비어있는 cold start (admin 탭 미방문) | 매핑 불가 → fallback | 낮음 |

**`[]` truthy 문제 상세:**
```js
// h2h.js:62 — [] 는 truthy이므로 || 가 작동 안 함
const stats1 = f1.stats || [75, 75, 75, 75, 75];
// f1.stats = [] → stats1 = [] (의도와 다름)
// 수정 권장: f1.stats?.length ? f1.stats : [75, 75, 75, 75, 75]
```

### 권장 후속 개선 (Phase 3D)

| 우선순위 | 개선안 | 근거 |
|---|---|---|
| 1 | `matchups` 테이블에 `red_fighter_id` / `blue_fighter_id` FK 추가 후 ID 기반 매핑으로 전환 | 이름 불일치 리스크 근본 해결 |
| 2 | `h2h.js:62-63` fallback 수정: `f.stats?.length ? f.stats : [75,75,75,75,75]` | `[]` truthy 문제 해결 |
| 3 | `index.html` tailwind.config `ufcRed: '#e8000d'` → `'#E10600'` | CSS `var(--red)` 마이그레이션과 일치 |
| 4 | `fighterDB`가 비어있을 때 `fetchUpcomingMatchups` 내에서 fighters 테이블 서브쿼리 추가 | cold start 신뢰성 향상 |

### Visual QA 체크리스트

브라우저에서 직접 확인 필요 (코드 검증 범위 밖):

**Event 화면 (desktop)**
- [ ] `#matchups` 섹션 헤더 좌측 8px 레드 보더 + `--pt-red-500` 컬러
- [ ] 파이트 카드 배경 `var(--pt-bg-2)` (`#14161B`) — 이전보다 약간 더 진한 다크
- [ ] 카드 hover 시 `var(--pt-line-red)` 보더 + 글로우 적용
- [ ] 커뮤니티 픽 바 레드 컬러 (`--pt-red-500 #E10600`, 이전 `#e8000d`와 시각 동일)

**Event 화면 (mobile 375px / 430px)**
- [ ] 섹션 헤더 텍스트·버튼이 flex-wrap으로 줄바꿈 처리 — overflow 없음
- [ ] `glass-card` 위젯(Active Picks, Pick Closes) 모바일에서 잘림 없음

**Bet Slip (Pick 선택 후)**
- [ ] 패널 배경 `var(--pt-bg-2)` (`#14161B`) — 이전 `#111`보다 약간 밝음
- [ ] KO/TKO 선택 시 `var(--pt-red-500)` 보더·배경
- [ ] 판정(UD) 선택 시 `var(--pt-corner-blue)` 보더
- [ ] 라운드 선택 시 `var(--pt-warn)` 보더·텍스트
- [ ] 미선택 버튼 보더 `var(--pt-line-2)` 색상

**Pick 상태 배너**
- [ ] Pending 상태: 레드/블루 인라인 bg (JS 제어, CSS 무관)
- [ ] Settled WIN: 레드 bg + `text-ufcRed` (JS 제어)
- [ ] Settled LOSE: `text-gray-400` (JS 제어)

**레이더 차트**
- [ ] fighterDB에 이름이 일치하는 fighter가 있으면 실제 stats 표시
- [ ] 불일치 시 차트 blank (크래시 없음)

---

## Phase 3E — Red Token Hardcode Cleanup

**목표:** Phase 4 진입 전 red color foundation 정리 — `#e8000d` / `#d20a0a` 잔존값을 design token 기준으로 교체.

### 변경 내용

| 파일 | 변경 유형 | 결과 |
|---|---|---|
| `index.html:18` | Tailwind config `ufcRed` 값 | `'#e8000d'` → `'#E10600'` |
| `index.html` CSS block | `color: #e8000d` → `color: var(--red)` | ~8개 CSS 규칙 |
| `index.html` CSS block | `background: #e8000d` → `background: var(--red)` | ~2개 CSS 규칙 |
| `index.html` CSS block | `border-left: 2px solid #e8000d` → `var(--red)` | 1개 CSS 규칙 |
| `index.html` static span | `color:#e8000d` → `color:var(--red)` | KO/TKO 보너스 span |
| `index.html` JS constant | `CAT_BAR_HEX.ufc` | `'#e8000d'` → `'#E10600'` |
| `index.html` Chart.js | `STAT_COLORS[0]`, radar dataset borderColor | `'#d20a0a'` → `'#E10600'` |
| `index.html` Chart.js | radar dataset backgroundColor | `rgba(210,10,10,` → `rgba(225,6,0,` |
| `public/js/fights-render.js` | Chart.js radar dataset | `'#d20a0a'` → `'#E10600'`, rgba 동일 |
| `public/js/h2h.js` | comparison bar + radar dataset | `'#d20a0a'` → `'#E10600'`, rgba 동일 |

### 의도적으로 변경하지 않은 항목

| 위치 | 이유 |
|---|---|
| `index.html` JS 이벤트 핸들러 (onmouseover/out) | JS 문자열 내 값 — 동작 연동 위험 |
| `index.html` battle UI JS-generated HTML (lines 5001, 5782, 5812, 5909, 5921, 5945) | 동적 생성 HTML — 기능 영향 가능 |
| `index.html` 알림 배지 JS cssText (line 4962) | JS inline style string |
| `public/js/community.js` (lines 107, 108, 115, 326, 477) | community 렌더 함수 — 별도 Phase에서 일괄 처리 예정 |

---

## Phase 4A — Profile 디자인 1차 적용

**목표:** Profile 화면 hero/belt/stats 영역의 시각 구조 개선. 기능/DB/API/JS 로직 변경 없음.

### 변경 내용

| 영역 | 변경 내용 |
|---|---|
| 섹션 헤더 | `border-l-4 border-ufcRed` → `.sx-head` (8px/12px token border) |
| 프로필 아이덴티티 카드 | `glass-card border-white/5` → `.profile-hero-card` (pt-bg-2 surface + subtle red radial gradient) |
| Belt Progression Tracker | 신규 HTML 블록 + `refreshUI()` 내 JS 렌더 (5 belt stops + line fill + progress bar) |
| 4 핵심 지표 카드 border | `border-white/5` → `border-white/10` (pt-line-1 근사값) |
| Profile 섹션 glass-card | `#profile .glass-card` → `pt-bg-2 + pt-line-1` override (app.css) |
| Analyst Report 카드 | `#profile #profile-report-card` → `pt-line-red` border 유지 |

### 신규 CSS 클래스 (app.css)

- `.profile-hero-card` — profile identity 카드 표면
- `.pt-belt-tracker` — belt tracker 컨테이너
- `.pt-belt-line` + `::before` — track + dot grid
- `.pt-belt-stop` (`.done`, `.current`, `.next`) — belt 상태별 스타일
- `.pt-belt-dot`, `.pt-belt-nm`, `.pt-belt-pts`

### Phase 4A-QA 코드 검토 결과 (2026-05-24)

**발견 및 수정:**

| 항목 | 내용 | 처리 |
|---|---|---|
| `#profile #profile-report-card { border-color: var(--pt-line-red) }` | `--pt-line-red: rgba(225,6,0,0.55)` — 원본 `ufcRed/15(0.15)` 대비 너무 진함 | `#profile .glass-card:not(#profile-report-card)` 로 교체 |
| `var pts = state.points` | undefined/NaN 시 bt-next-label에 "NaN P" 표시 가능 | `state.points \|\| 0` 가드 추가 |
| `pt-belt-pts` overflow | "10,000P" 등 숫자 텍스트 모바일 잘림 가능성 | `word-break: keep-all` 추가 |

**코드 QA 확인:**

- ✅ `onclick="openNicknameModal()"`, `onclick="logoutUser()"` 변경 없음
- ✅ `id="prof-pts/tot/acc/belt-box/belt-name"` 모두 유지
- ✅ `#profile .glass-card` CSS — `#profile` ID selector scope으로 community 섹션 영향 없음
- ✅ `top: 40px` track 라인 — lg(24px 도트): 정확히 도트 센터. mobile(20px 도트): 2px 아래 (불가시)
- ✅ `state.points || 0` — White belt(0P) fallback 정상 (0 >= 0 이므로 ci=0 유지)
- ✅ progress bar `flex-1` — 양 shrink-0 레이블 사이 공간 확보됨
- ✅ `profile-hero-card::before` radial gradient — `pointer-events: none`, `> * { position: relative }` 로 아바타 위에 오버레이 없음

**브라우저 확인 필요 (코드 범위 밖):**

- [ ] Belt tracker 5 dots 정렬 — mobile 375px 시각 확인
- [ ] Profile-hero-card gradient 아바타 가림 없음
- [ ] logout/닉네임 변경 버튼 실제 동작

---

## Phase 4B — Rankings / Leaderboard 디자인 1차 적용

**목표:** Rankings 화면 leaderboard/faction 영역을 design token 기반으로 정리. Profile에서 만든 belt/card 시각 언어와 맞춤.

### 변경 내용

| 영역 | 변경 내용 |
|---|---|
| 섹션 헤더 | `border-l-8 lg:border-l-[12px] border-ufcRed pl-4 lg:pl-8` → `.sx-head` |
| 테이블 헤더 배경 | `bg-black/30 border-white/5` → `bg-white/[0.02] border-white/[0.06]` |
| 현재 유저 행 | `bg-red-950/20` 클래스 → `.lb-row-me` CSS class (gradient + left border) |
| `#leaderboard-player-panel` | `background: var(--pt-bg-2); border-color: var(--pt-line-1)` |
| `#my-rank-card` | `background: var(--pt-bg-2)` (ufcRed/30 border + box-shadow inline 유지) |
| `#faction-ranking-board .glass-card` | `pt-bg-2 + pt-line-1` (`.faction-ranking-mine` 제외) |
| `getBeltInfo` 벨트 dot 색상 | 설계 토큰 기준으로 정정: Black `#d20a0a→#ffffff`, Brown `#92400e→#B5803A`, Purple `#7c3aed→#8B3FE3`, Blue `#2563eb→#1F6FEB`, White `#ffffff→#ECECEE` |

### 신규 CSS 클래스 (app.css)

- `.lb-row-me` — 현재 유저 행 gradient highlight + 3px red left border

### Phase 4B-QA 코드 검토 결과

**발견 및 수정:**

| 항목 | 내용 | 처리 |
|---|---|---|
| `.lb-row-me { padding-left: 21px }` | Tailwind CDN JIT가 static CSS 이후 주입 → `px-6`(24px)이 override, 무효 | `padding-left: 21px` 제거 |
| `hover:bg-white/[0.03]` Tailwind class | 호버 시 유저 행의 red gradient가 흰색으로 대체됨 | `.lb-row-me:hover { background: linear-gradient(…rgba(225,6,0,0.15)…) !important }` 추가 |

**코드 QA 확인:**

- ✅ `setRankTab` className.replace 로직 — Phase 4B 변경 없음, 정상
- ✅ `renderFactionRanking` — `faction-ranking-mine` `:not()` 로 ufcRed/50 accent 보존 확인
- ✅ `#leaderboard-player-panel` ID 선택자 (specificity 1,0,0) — `.glass-card:hover` (0,2,0)보다 높아 hover glow override 없음
- ✅ `.lb-row-me` + `border-l-4 border-l-red-600` (rank ≤ 3 동시) — Tailwind 4px red 우선, gradient bg 유지
- ✅ `getBeltInfo` 반환값: `bg`/`text` 클래스 변경 없음, `color` 필드만 token 정렬
- ✅ `season.js:303` `belt` 미사용 — 기존 dead code, Phase 4B 회귀 없음

**브라우저 확인 필요 (코드 범위 밖):**

- [ ] mobile 375px — 유저 행 border-left + px-6 레이아웃 확인
- [ ] faction 카드 "내 집단" hover 상태 accent 유지
- [ ] White belt 점(#ECECEE) / Black belt 점(#ffffff) 시각 구분 확인

### 완료 기준

- [x] 섹션 헤더 `.sx-head` 적용
- [x] leaderboard table 표면 `pt-bg-2 + pt-line-1`
- [x] 현재 유저 행 `lb-row-me` 그라데이션 적용 + hover 유지
- [x] `getBeltInfo` 벨트 색상 design token 기준 정렬
- [x] `npm run build` 통과

---

## Phase 4C — Home 화면 디자인 1차 적용

**목표:** Home 화면 countdown/news 영역을 design token 기반으로 정리. 기능/JS 로직 변경 없음.

### 변경 내용

| 영역 | 변경 내용 |
|---|---|
| `.countdown-unit` bg/border | `rgba(255,255,255,0.04)` / `rgba(255,255,255,0.08)` → `var(--pt-bg-2)` / `var(--pt-line-1)` (index.html inline style) |
| 뉴스 섹션 헤더 | `w-1 h-6 dot + flex wrap` → `.sx-head` 통일 |
| `#hero-faceoff-card` border | Tailwind `border-white/10` → `var(--pt-line-1)` (app.css CSS override) |
| `#home-ticker` border | `border-white/10` → `var(--pt-line-1)` (app.css CSS override) |
| `#home-news-grid .glass-card` | `pt-bg-2 + pt-line-1` surface; hover → `pt-bg-3 + pt-line-2` (app.css) |
| `home.js` news badge | `rgba(210,10,10,0.9)` → `rgba(225,6,0,0.9)` (Phase 3E miss 수정) |

### 변경하지 않은 항목 (이유)

| 항목 | 이유 |
|---|---|
| `#home` 배경 이미지 / overlay gradient | 헤어로 비주얼 핵심, 변경 시 대규모 재작성 필요 |
| Hero face-off card 배경 | inline `style` 속성 (CSS override 불가 without `!important`) |
| `.stat-counter` 색상 | 이미 `var(--red)` → `var(--pt-red-500)` bridge 적용 |
| Hero text animation 클래스 | 기능 의존 (heroReveal, fadeUp) |
| Fight/countdown 데이터 바인딩 | JS 로직 변경 금지 |
| `renderNewsCards` 카드 구조 | JS markup 대규모 변경 금지 (CSS override로 대체) |

### 완료 기준

- [x] `.countdown-unit` token surface 적용
- [x] 뉴스 섹션 헤더 `.sx-head` 통일
- [x] `#home-news-grid .glass-card` `pt-bg-2` surface
- [x] `home.js` news badge red 수정
- [x] `npm run build` 통과

**브라우저 확인 필요 (코드 범위 밖):**

- [ ] countdown unit mobile 375px 잘림 없음 (min-width: 64px, padding: 12px 16px 확인)
- [ ] news 카드 hover scale + border 교체 시각 확인
- [ ] 뉴스 섹션 헤더 sx-head 8px 좌측 보더 시각

---

## Phase 4C-QA — Home 디자인 QA

**목표:** Phase 4C 변경이 desktop/mobile에서 깨지지 않는지 검증.

### QA 결과

| 항목 | 결과 |
|---|---|
| `navigateTo('matchups')` CTA 버튼 | ✅ 변경 없음 |
| `hero-red-name/blue-name/img` 데이터 바인딩 | ✅ 변경 없음 |
| countdown `cd-d/h/m/s` DOM 바인딩 | ✅ 변경 없음 |
| countdown unit 375px overflow | ✅ Phase 4C 변경 없음 (기존 pre-existing) |
| `.sx-head` Home 뉴스 헤더 일관성 | ✅ Profile/Rankings/Matchups와 동일 패턴 |
| `hover:scale-[1.02]` + grid layout | ✅ transform이 layout flow에 영향 없음 |

### 발견된 이슈 및 수정

**이슈:** `#home-news-grid .glass-card:hover { border-color: var(--pt-line-2) }` (specificity 1,2,0) 가 `news.js renderHomeNewsFromRSS`의 `hover:border-ufcRed/30` Tailwind 클래스 (0,2,0)를 override.

**수정:** `app.css` hover rule에서 `border-color: var(--pt-line-2)` 제거. `box-shadow: none`은 유지하여 glow 억제. 결과: RSS 카드는 `hover:border-ufcRed/30`, DB 카드는 generic `.glass-card:hover` red border — 두 경로 모두 red hover 표시.

### 완료 기준

- [x] `#home-news-grid .glass-card:hover` border-color override 제거
- [x] `npm run build` 통과

---

## Phase 4 — Home / Profile / Leaderboard 적용

**목표:** 메인 진입 화면 3종 핸드오프 반영

### 핸드오프 기준 파일

- `docs/design_handoff_picktagon/screens/screen-home.html`
- `docs/design_handoff_picktagon/screens/screen-profile.html`
- `docs/design_handoff_picktagon/screens/screen-leaderboard.html`

### 주요 변경 포인트

- **Home**: 히어로 배너, 최근 픽 요약 카드, 랭킹 스냅샷
- **Profile**: 벨트 티어 표시 (`--pt-belt-*`), 승률 통계, 픽 히스토리 타임라인
- **Leaderboard**: 랭킹 테이블, 1~3위 하이라이트, 벨트 배지

### 영향 파일

| 파일 | 변경 유형 | 위험도 |
|---|---|---|
| `index.html` (Home 섹션) | 마크업 + CSS | 중간 |
| `public/js/home.js` | 렌더 함수 클래스명 업데이트 | 낮음 |
| `index.html` (Profile 섹션) | 마크업 + CSS | 중간 |
| `public/js/profile.js` | 렌더 함수 클래스명 업데이트 | 낮음 |
| `index.html` (Leaderboard 섹션) | 마크업 + CSS | 낮음 |

---

## Phase 5A — Community / News 디자인 1차 적용

**목표:** Community 피드 / News 뉴스 화면 section header, card surface, filter chips, modal surface를 design token 기반으로 1차 정리. Admin은 Phase 5B 별도 처리.

### 변경 내용

| 영역 | 변경 내용 |
|---|---|
| Community 섹션 헤더 | `border-l-4 border-ufcRed pl-3` → `.sx-head` (index.html) |
| News 섹션 헤더 | `border-l-8 lg:border-l-[12px] border-ufcRed pl-4 lg:pl-8` → `.sx-head` (index.html) |
| `post-list-container` | `border: #1a1a1a` → `var(--pt-line-2)` (app.css) |
| `post-list-head` | `background: #0d0d0d` → `var(--pt-bg-1)`, border → `var(--pt-line-2)` |
| `post-row` hover | `rgba(255,255,255,0.02)` → `var(--pt-bg-3)` |
| `post-row` border | `#111` → `var(--pt-line-1)` |
| `post-expand-body` left border | `#252525` → `var(--pt-line-2)` |
| `post-com-input` border | `#1e1e1e` → `var(--pt-line-1)` |
| `comm-filter-btn` border | `#222` → `var(--pt-line-2)` |
| `comm-dropdown` bg/border | `#0d0d0d / #222` → `var(--pt-bg-1) / var(--pt-line-2)` |
| `#post-detail-modal .glass-card` | `pt-bg-2 + pt-line-1` surface |
| `#news-grid .glass-card` | `pt-bg-2 + pt-line-1` surface; hover → `pt-bg-3 + shadow:none` |
| `#news-detail-modal .glass-card` | `pt-bg-2 + pt-line-1` surface |

### 변경하지 않은 항목 (이유)

| 항목 | 이유 |
|---|---|
| `comm-filter-btn.active` red bg | 이미 rgba(232,0,13,...) — 기능적 강조, 변경 불필요 |
| `my-battle-panel` border-ufcRed/20 | 내 배틀 패널 강조를 위한 의도적 accent |
| `post-type-tag` 카테고리 색상 | 카테고리별 구분 색상 (analysis/fighter/live/news/humor) |
| `post-comment-block` left border (--red) | 댓글 강조 기능 색상 |
| `news-cat-tabs` active 클래스 | JS 생성 (youtube.js), ufcRed는 theme-bridge로 pt-red-500 연결됨 |
| Admin 섹션 | Phase 5B 별도 처리 |

### 완료 기준

- [x] Community / News 섹션 헤더 `.sx-head` 통일
- [x] post-list surface token 적용
- [x] filter chips/dropdown token 적용
- [x] post-detail-modal + news-detail-modal surface 적용
- [x] news-grid cards `pt-bg-2` surface
- [x] `npm run build` 통과

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] 모바일 375px comm-filter-bar overflow (flex-wrap 동작 확인)
- [ ] post-row hover bg `pt-bg-3` 시각 확인
- [ ] post-expand 열렸을 때 배경 자연스러움
- [ ] news-detail-modal glass 배경 확인

---

## Phase 5A-QA — Community / News 디자인 QA

**목표:** Phase 5A 변경이 Community/News 기존 상호작용을 깨지 않는지 검증.

### QA 결과

| 항목 | 결과 |
|---|---|
| `renderPosts` / `post-list-head` / `post-row` | ✅ 순수 외관 변경, 상호작용 무관 |
| `openPostDetail` / `closePostDetail` body.overflow 복구 | ✅ 변경 없음 |
| `sendDetailComment` / `likePost` / `likePostFromDetail` | ✅ 변경 없음 |
| `my-battle-panel` border-ufcRed/20 accent | ✅ Phase 5A 미변경 (inline 클래스) |
| `post-act-btn.liked` red accent | ✅ app.css override 없음 |
| `post-type-tag` 카테고리 색상 | ✅ Phase 5A 미변경 |
| `openNewsDetail` / `closeNewsDetail` body.overflow 복구 | ✅ 변경 없음 |
| `news-cat-tabs` active state | ✅ JS 생성 Tailwind 클래스, Phase 5A 미개입 |
| `#news-grid` hover border | ℹ `hover:border-ufcRed/30` suppressed (이유 아래) |

### 발견된 이슈 및 수정

**이슈 (fix 적용):** `#community .comm-filter-btn` (specificity 1,1,0)이 인라인 CSS `.comm-filter-btn.active { border-color: rgba(232,0,13,0.4) }` (0,2,0)를 override → active 필터 버튼의 빨간 border 손실.

**수정:** `app.css`에 다음 추가:
```css
#community .comm-filter-btn:hover { border-color: var(--pt-line-3); }
#community .comm-filter-btn.active { border-color: rgba(225,6,0,0.4); }
```
(specificity 1,2,0 → 인라인 active 규칙 + base 규칙 모두 override)

**문서화 (fix 불필요):** `#news-grid .glass-card { border-color: var(--pt-line-1) }` (1,1,0)이 `hover:border-ufcRed/30` (0,2,0)보다 높은 우선순위를 가져 hover border 변화가 없음. `#news-grid .glass-card:hover { background: var(--pt-bg-3) }` 로 충분한 hover 피드백 제공 (image scale-105 추가). 의도적 허용.

### 완료 기준

- [x] `comm-filter-btn.active` border 복구
- [x] `comm-filter-btn:hover` border 복구
- [x] `npm run build` 통과

---

## Phase 5B — Admin 화면 디자인 polish

**브랜치:** `refactor/admin-design-polish`  
**기준 커밋:** `155bf4d` (main)  
**핸드오프:** `docs/design_handoff_picktagon/screens/screen-admin.html`

**목표:** Admin 화면 section header, tab bar, panel surface, modal surface를 design token 기반으로 1차 정리. 운영 기능/로직은 변경하지 않는다.

---

### Admin 섹션 구조 파악

| 탭 | ID | 렌더 방식 |
|---|---|---|
| 대시보드 | `admin-panel-dashboard` | 100% JS (`renderAdminDashboard()`) |
| 파이터 DB | `admin-panel-fighters` | JS + HTML 골격 |
| 대진표 관리 | `admin-panel-ufc` | HTML 골격 (`bg-zinc-900/60`) |
| 아카이브 | `admin-panel-archive` | HTML 골격 |
| 뉴스 관리 | `admin-panel-news` | HTML 골격 |
| 시즌 관리 | `admin-panel-season` | HTML 골격 (yellow accent + danger zone) |
| 설정 | `admin-panel-settings` | HTML 골격 (glass-card) |

---

### 적용 범위 (low-risk CSS only)

| 영역 | 현재 | 변경 방향 | 위치 |
|---|---|---|---|
| Admin 섹션 헤더 | `border-l-8 lg:border-l-[12px] border-ufcRed pl-4 lg:pl-8` | → `.sx-head` | index.html |
| Tab bar border | `border-b border-white/10` | → `var(--pt-line-1)` | app.css |
| `.admin-tab` base border | `rgba(255,255,255,0.07)` | → `var(--pt-line-1)` | app.css |
| `.admin-tab:hover` bg | `rgba(255,255,255,0.04)` | → `var(--pt-bg-3)` | app.css |
| `#admin .glass-card` surface | `rgba(255,255,255,0.04)` | → `var(--pt-bg-2) / var(--pt-line-1)` | app.css |
| `#admin-panel-ufc .glass-card` bg | `bg-zinc-900/60` (Tailwind) | → `var(--pt-bg-2)` via ID scope | app.css |
| Admin gate modal inner panel | `glass-card border-white/10` | → `var(--pt-bg-2) / var(--pt-line-1)` | app.css |
| Settings `hr` divider | `border-white/10` | → `var(--pt-line-1)` (CSS scope) | app.css |

---

### 변경하지 않을 항목 — 위험 경로

| 항목 | 이유 |
|---|---|
| `renderAdminDashboard()` JS 출력 | 100% JS 생성, CSS override만으로 대응 (대시보드 stat card 색상은 JS inline style) |
| `admin-tab.active-tab` red bg/border | 탭 active state 식별 색상, 기능 의존 |
| Season 현재 시즌 카드 `yellow-500/20` | 의도적 accent (현재 시즌 강조) |
| Season Danger Zone `ufcRed/20` bg | 파괴적 작업 경고 UI — 의도적 red accent |
| `confirmSeasonReset` 버튼 | 파괴적 DB 작업, 변경 금지 |
| `adminSettleEvent` / `adminSetMatchupResult` / `adminArchiveEvent` | result settlement 로직, 변경 금지 |
| `saveFighter` / `deleteFighter` / `syncAllFighters` / `purgeInactiveFighters` | 파이터 DB 작업, 변경 금지 |
| `saveMatchupFromModal` / `deleteMatchupFromModal` / `saveNewEvent` | Event builder 로직, 변경 금지 |
| `openResultModal` / `openMatchupEditModal` | Result/matchup edit modal 기능, 변경 금지 |
| Fighter modal (`openFighterModal`) | 파이터 편집 modal 기능, 변경 금지 |
| News admin `openNewsModal` | 뉴스 추가 기능, 변경 금지 |

---

### 특이사항 — CSS 우선순위 주의점

Phase 5A에서 학습한 패턴 적용:
- `#admin .admin-tab` (1,1,0) > `.admin-tab` 인라인 CSS (0,1,0) → 탭 base border override 가능
- `.admin-tab.active-tab` (0,2,0) < `#admin .admin-tab.active-tab` (1,2,0) → active 보존 시 명시 rule 필요
- `#admin .admin-tab:hover:not(.active-tab)` — 현재 인라인 hover rule도 동일하게 명시 필요

---

### 완료 기준 (Phase 5B)

- [x] Admin 섹션 헤더 `.sx-head` 통일
- [x] Tab bar + `.admin-tab` token border 적용
- [x] `#admin .glass-card` surface token 적용 (범위 수정 → QA 참고)
- [x] `#admin-panel-ufc` bg-zinc-900 override
- [x] Admin gate modal surface
- [x] `npm run build` 통과
- [x] docs 업데이트
- [x] 커밋: `Style: Apply admin design system polish`

> **Phase 5B-1 완료** (`refactor/admin-design-polish`, 2026-05-24)  
> Notes: tab bar `border-white/10` = `rgba(255,255,255,0.10)` = `--pt-line-2` 와 동일값이므로 별도 override 생략. Settings `hr` divider = 다음 QA에서 확인.

---

### Phase 5B-QA 결과 (2026-05-24)

**발견된 이슈 — `#admin .glass-card` 범위 과다**

| 패널 | glass-card 내 상태 | 영향 |
|---|---|---|
| `admin-panel-dashboard` | JS 생성 stat cards: `border-amber-500/20 bg-amber-500/5` 등 accent | `background` 덮임 → 의미색 손실 |
| `admin-panel-season` | `border-yellow-500/20` (Current Season), `border-ufcRed/20` (Danger Zone) Tailwind border classes | `border-color` 덮임 → accent border 손실 |

**수정 방향**  
`#admin .glass-card` → 안전한 패널만 명시적 타겟으로 교체:
```css
#admin-panel-ufc > .glass-card,
#admin-panel-settings > .glass-card { background: var(--pt-bg-2); border-color: var(--pt-line-1); }
```

**CSS 우선순위 최종 확인 (admin-tab)**

| 상태 | 속성 | 적용 소스 | 값 |
|---|---|---|---|
| base | border-color | `#admin .admin-tab` (1,1,0) | `var(--pt-line-1)` |
| active-tab | border-color | `#admin .admin-tab.active-tab` (1,2,0) | `rgba(225,6,0,0.35)` |
| active-tab | background | inline `.admin-tab.active-tab` (0,2,0) | `rgba(232,0,13,0.12)` (보존) |
| active-tab | color | inline `.admin-tab.active-tab` (0,2,0) | `var(--red)` (보존) |
| hover(non-active) | background | `#admin .admin-tab:hover:not(.active-tab)` (1,3,0) | `var(--pt-bg-3)` |
| hover(non-active) | color | inline `.admin-tab:hover:not(.active-tab)` (0,3,0) | `#fff` (보존) |

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] 탭 전환 시 active-tab 시각 확인
- [ ] Season danger zone 강조색 보존 확인
- [ ] Dashboard stat card 의미색 확인
- [ ] Mobile 375px admin tab overflow

---

## 리스크 & 전제조건

| 항목 | 설명 | Phase 3C 이후 상태 |
|---|---|---|
| **폰트 로딩** | Barlow / Bebas Neue Google Fonts 의존 — 오프라인/느린 네트워크 시 폴백 필요 | 미해결 |
| **색상 미세 차이** | `#e8000d` vs `#E10600` — Phase 3A: `--red: var(--pt-red-500)` 마이그레이션, Phase 3E: CSS/Chart.js 잔존값 정리 완료 | **해결** |
| **Tailwind `ufcRed`** | `tailwind.config` `ufcRed:'#e8000d'` → `'#E10600'` Phase 3E에서 수정 완료 | **해결** (3E) |
| **Pretendard** | `screen-shell.css`가 `'Pretendard'` 사용 → tokens.css는 `'Barlow'`. 실제 앱에선 Pretendard 유지 결정 | 미해결 |
| **JS 클래스 참조** | `public/js/*.js` 파일들이 DOM 클래스명을 직접 참조하는 경우 마크업 변경 시 동반 수정 필요 | 미해결 |
| **index.html 규모** | 단일 파일이라 회귀 테스트 범위 넓음 — Phase별 작은 단위 커밋 필수 | 미해결 |
| **stats 이름 매칭** | ID 우선 매핑 구현 완료 (3D-2). "King Green"→"bobby-green" ID로 name mismatch 해결 확인. 나머지 NULL ID 행은 name fallback 처리. | **해결** (3D-2/3D-3) |
| **`[]` truthy 문제** | `h2h.js` `stats \|\| [75,75,75,75,75]` 가 빈 배열 통과 → `_getDisplayStats()` 헬퍼로 해결 | **해결** (3D-1) |

---

## 진행 현황

| Phase | 상태 | 브랜치 커밋 |
|---|---|---|
| Phase 1: Tokens 도입 | **완료** | `Refactor: Add design tokens bridge` |
| Phase 2: 공통 CSS 분리 | **완료** | `Refactor: Extract shared app styles` |
| Phase 3A: Event/Pick 1차 토큰 적용 | **완료** | `Style: Apply event pick design system polish` |
| Phase 3B-1: 섹션 헤더 .sx-head 적용 | **완료** | `Style: Polish matchups section header` |
| Phase 3B-2: fighter stats UI 매핑 fix | **완료** | `Fix: Map persisted fighter stats into UI models` |
| Phase 3C: QA & 리스크 리뷰 | **완료** | `Docs: Record event pick QA and stats mapping risks` |
| Phase 3D-1: H2H stats empty-array fallback fix | **완료** | `Fix: Fallback empty fighter stats in H2H radar` |
| Phase 3D-2: matchups fighter_id 기반 매핑 설계 | **완료** | `Docs: Plan matchup fighter ID mapping` |
| Phase 3D-2: SELECT 추가 + ID 우선 매핑 구현 | **완료** | `Fix: Use fighter ID for matchup lookup with name fallback` |
| Phase 3D-3: 운영 DB 컬럼 존재 검증 | **완료** | `Docs: Verify matchup fighter ID column readiness` |
| Phase 3E: red token hardcode cleanup | **완료** | `Refactor: Align red styling with design tokens` |
| Phase 4A: Profile 디자인 1차 적용 | **완료** | `Style: Apply profile design system polish` |
| Phase 4A-QA: Profile 코드 QA + fix | **완료** | `Fix: Polish profile design QA findings` |
| Phase 4B: Home / Leaderboard | **완료** | `Style: Apply home/leaderboard design system polish` |
| Phase 4C-QA: Home news hover fix | **완료** | `Fix: Polish home design QA findings` |
| Phase 5A: Community / News | **완료** | `Style: Apply community news design system polish` |
| Phase 5A-QA: filter active border fix | **완료** | `Fix: Polish community news design QA findings` |
| Phase 5B: Admin low-risk CSS | **완료** | `Style: Apply admin design system polish` |
| Phase 5B-QA: glass-card 범위 수정 | **완료** | `Fix: Polish admin design QA findings` |
| Phase 5B → main merge + push | **완료** | `Merge branch 'refactor/admin-design-polish'` |
| Browser QA Round 1 | **완료** | `Docs: Add browser QA for design refactor` |
| P2 fix: remaining section headers | **완료** | `Style: Polish remaining section headers` |
| Phase 6A: Global header/nav upgrade | **완료** | `Style: Upgrade global navigation design` |
| Phase 6B: Home hero upgrade | **완료** | `Style: Upgrade home hero design` |
| Phase 6B-QA: Home hero QA | **완료** | `Fix: Polish home hero QA findings` |
| Phase 6C: Event/Pick card upgrade | **완료** | `Style: Upgrade event pick card design` |
| Phase 6C-QA: Event/Pick card state QA | **완료** | `Fix: Polish event pick card QA findings` |
| Phase 6D: Profile design upgrade | **완료** | `Style: Upgrade profile design` |
| Phase 6D-QA: Profile visible upgrade QA | **완료** | `Fix: Polish profile visible QA findings` |
| Phase 6E: Leaderboard/Rankings upgrade | **완료** | `Style: Upgrade leaderboard rankings design` |
| Phase 6E-QA: Leaderboard/Rankings QA | **완료** | `Fix: Polish leaderboard rankings QA findings` |
| Phase 6F: Community/News upgrade | **완료** | `Style: Upgrade community news design` |
| Phase 6F-QA: Community/News visible upgrade QA | **완료** | `Fix: Polish community news visible QA findings` |
| Phase 6C-2: Event/Pick card detail polish | **완료** | `Style: Polish event pick card details` |
| Phase 6C-2-QA: Event/Pick detail polish QA | **완료** | `Fix: Polish event pick detail QA findings` |
| **Phase 6 Closeout** | **완료** | `Docs: Close out visible design round` |
| Phase 7A: Tailwind CDN migration plan | **완료** | `Docs: Plan Tailwind CDN migration` |
| Phase 7B: Tailwind CDN → npm 전환 실행 | **완료** | `Refactor: Replace Tailwind CDN with build pipeline` |

> Phase 6 마감 문서 → [`docs/PHASE6_VISIBLE_DESIGN_CLOSEOUT.md`](PHASE6_VISIBLE_DESIGN_CLOSEOUT.md)  
> Phase 7A/7B 전환 계획 및 결과 → [`docs/TAILWIND_CDN_MIGRATION_PLAN.md`](TAILWIND_CDN_MIGRATION_PLAN.md)

---

## Phase 6C-2-QA — Event/Pick Detail Polish QA (2026-05-25)

**분석 방법:** 정적 코드 분석 (JS 코드 경로, CSS specificity, DOM 구조 분석)

### CTA 상태 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| no pick: "TAP TO PICK ›" 유지 | PASS | `renderHeroCard` 템플릿 — odds 없을 때 "TAP TO PICK ›" 초기값 ✓ |
| pending selected side: "CHANGE PICK ›" | PASS | `updateAllFightCards` pending 블록 — `cta-l/r-{id}` innerHTML 업데이트 ✓ |
| pending opposite side 문구 | PASS | 반대 side는 변경 없음 — `fc-card-pending` cursor:default로 시각적 잠금 표현 ✓ |
| settled: CTA 클리어 | PASS | settled 블록 `ctaL/R.innerHTML = ''` — 클릭 유도 문구 제거 ✓ |
| `cta-l/r-{id}` ID 중복 여부 | PASS | fight.id는 DB 유니크 키, 화면에 동시에 동일 ID 없음 ✓ |
| strip row에서 `getElementById` null 처리 | PASS | strip row는 cta-l/r 요소 없음 → `if (ctaL)` null-guard로 안전 처리 ✓ |

### P2 버그 발견 및 수정 — CTA reset 경로 누락

**원인:** `updateAllFightCards`가 `supabase.js:500` (`loadUserPicksFromDB` 완료 후)에서 renderFightCards 없이 단독 호출됨. 리셋 블록이 CTA 텍스트를 원복하지 않아 stale "CHANGE PICK ›"가 남을 수 있었음.

**시나리오:** localStorage에 pending이 있는 상태로 페이지 로드 → renderFightCards 시 CTA = "TAP TO PICK" → updateAllFightCards가 pending 적용 → "CHANGE PICK ›" 표시. 이후 loadUserPicksFromDB에서 DB 데이터 우선 재적용 시, 해당 픽이 DB에 없으면 state.pendings 클리어 → 리셋 블록 실행되지만 CTA 텍스트는 복원 안 됨 → "CHANGE PICK ›" 잔존.

**수정:** 리셋 블록에 CTA 원복 로직 추가 — `_fightCardCache[fight.id]`에서 odds 정보 읽어 innerHTML 복원.

| 적용 파일 | 변경 |
|---|---|
| `fights-render.js` reset 블록 (line 444 이후) | `_cached` 기반 `cta-l/r` innerHTML 원복 5줄 추가 |

### 코드 경로 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `openPickSlip` 로직 변경 없음 | PASS | Phase 6C-2 fights-render.js 에서 해당 함수 내부 무변경 ✓ |
| `selectPickFighter` / `confirmBetSlip` 무변경 | PASS | 픽 제출 경로 전체 미변경 ✓ |
| `state.pendings` / `state.settled` 데이터 구조 | PASS | updateAllFightCards에서 읽기만, 쓰기 없음 ✓ |
| `supabase.js:500` 독립 호출 경로 | PASS (after fix) | P2 fix로 CTA 원복 보장 ✓ |

### Fighter Image 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `filter` 적용 대상 | PASS | `fc-hero-img-l/r` — background-image 전용 div, 자식 요소 없음 ✓ |
| `filter` stacking context | PASS | `z-20` fighter info 요소는 형제 노드 — filter stacking context에 포함되지 않음 ✓ |
| red/blue 균형 | PASS | 동일 `filter: brightness(1.18) contrast(1.04)` 양쪽 적용 ✓ |
| mask-image 상호작용 | PASS | filter는 mask 적용 후의 결과에 적용 — 페이드 엣지 유지, 밝기만 올라감 ✓ |
| top fade 0.40 텍스트 가독성 | PASS | 텍스트(fighter info z-20, 이름/CTA)는 bottom fade 영역에 위치 — top fade는 이미지 상단만 영향 ✓ |
| image fallback (imgUrl 없을 때) | PASS | fallback은 `background: linear-gradient(...)` — filter 적용되지만 gradient에 brightness는 무영향 ✓ |

### Scrollbar 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `#event-sidebar-content`에만 적용 | PASS | 셀렉터가 ID 기반 — 다른 `overflow-y: auto` 요소에 전파 없음 ✓ |
| `#mobile-sidebar-panel` 적용 | PASS | 동일 규칙 세트 병기 ✓ |
| body/global scrollbar 영향 없음 | PASS | `::-webkit-scrollbar` 규칙이 ID 스코프 — body scrollbar 무변경 ✓ |
| Firefox 지원 | PASS (after fix) | P3 fix — `scrollbar-width: thin; scrollbar-color: var(--pt-line-2) var(--pt-bg-1)` 추가 ✓ |
| Webkit fallback | PASS | `-webkit-scrollbar*` 규칙 — Chrome/Safari/Edge 지원 ✓ |

### 수정 사항

| 우선순위 | 내용 | 파일 |
|---|---|---|
| P2 | CTA 리셋 경로 누락 — `updateAllFightCards` 리셋 블록에 `_fightCardCache` 기반 CTA 원복 추가 | `fights-render.js` |
| P3 | Firefox scrollbar fallback — `scrollbar-width: thin; scrollbar-color:` 추가 | `app.css` |

### 완료 기준

- [x] CTA 상태별 동작 6개 검증 완료
- [x] P2 fix: CTA reset 경로 보강
- [x] P3 fix: Firefox scrollbar fallback 추가
- [x] fighter image filter / stacking context 검증 완료
- [x] 코드 경로 4개 검증 완료
- [x] `npm run build` 통과 (376.42 kB / 79.34 kB gzip)
- [x] docs 업데이트
- [x] 커밋: `Fix: Polish event pick detail QA findings`

---

## Phase 6C-2 — Event/Pick Card Detail Polish (2026-05-25)

**브랜치:** `main`  
**기준 커밋:** `5e4dbb1`

### 변경 사항

#### `public/js/fights-render.js`

| 위치 | 이전 | 이후 |
|---|---|---|
| `renderHeroCard` F1 bg div | `class="absolute inset-y-0 left-0 w-1/2"` | `class="fc-hero-img-l absolute inset-y-0 ..."` |
| `renderHeroCard` F2 bg div | `class="absolute inset-y-0 right-0 w-1/2"` | `class="fc-hero-img-r absolute inset-y-0 ..."` |
| `renderHeroCard` top fade | `rgba(8,8,8,0.75)` | `rgba(8,8,8,0.40)` — 얼굴 영역 가시성 개선 |
| F1 CTA `<p>` | 조건부 익명 요소 | `id="cta-l-${fight.id}"` — 상태별 텍스트 타겟 |
| F2 CTA `<p>` | 조건부 익명 요소 | `id="cta-r-${fight.id}"` — 상태별 텍스트 타겟 |
| `updateAllFightCards` pending 블록 | CTA 텍스트 변경 없음 | 픽한 side → `"CHANGE PICK ›"` |
| `updateAllFightCards` settled 블록 | CTA 텍스트 변경 없음 | 양쪽 CTA → `""` (비움) |

#### `public/css/app.css` — Phase 6C-2 block 추가

| 규칙 | 적용 효과 |
|---|---|
| `.fc-hero-img-l, .fc-hero-img-r` | `filter: brightness(1.18) contrast(1.04)` — fighter 이미지 선명도 향상 |
| `#event-sidebar-content::-webkit-scrollbar` | `width: 4px` — 다크 슬림 스크롤바 |
| `#event-sidebar-content::-webkit-scrollbar-track` | `background: var(--pt-bg-1)` — 어두운 트랙 |
| `#event-sidebar-content::-webkit-scrollbar-thumb` | `var(--pt-line-2)` + `border-radius: 2px` |
| `#event-sidebar-content::-webkit-scrollbar-thumb:hover` | `rgba(225,6,0,0.45)` — hover 시 subtle red |
| `#mobile-sidebar-panel::-webkit-scrollbar*` | 동일 규칙, 모바일 드로어 적용 |

### 변경하지 않은 항목
- `openPickSlip` / `selectPickFighter` / `confirmBetSlip` 로직 무변경
- `state.pendings` / `state.settled` 데이터 구조 무변경
- pick submit / scoring / settlement 로직 무변경
- strip row (`renderStripRow`) — CTA 없음, 변경 없음

### Specificity 검증

| 규칙 | Specificity | 경합 | 결과 |
|---|---|---|---|
| `#fight-cards-container .fc-hero-img-l` filter | (1,1,0) | 신규 클래스 — 충돌 없음 | PASS ✓ |
| `#event-sidebar-content::-webkit-scrollbar*` | (1,0,1) | 신규 — 충돌 없음 | PASS ✓ |

### CTA 상태별 동작

| 상태 | L side CTA | R side CTA |
|---|---|---|
| no pick | "TAP TO PICK ›" (odds 없을 때) / "ODDS x.x · +xxxP" | 동일 |
| pending — left 픽 | `"CHANGE PICK ›"` | 변경 없음 |
| pending — right 픽 | 변경 없음 | `"CHANGE PICK ›"` |
| settled | `""` (비움) | `""` (비움) |

### 완료 기준

- [x] CTA 텍스트 상태별 분기 (`cta-l/r-{id}` ID 추가)
- [x] Fighter image brightness 향상 (`fc-hero-img-l/r` + `filter`)
- [x] Top fade 완화 (`0.75 → 0.40`)
- [x] UFC 일정 패널 스크롤바 다크 테마 (`#event-sidebar-content`, `#mobile-sidebar-panel`)
- [x] `npm run build` 통과 (376.42 kB / 79.34 kB gzip)
- [x] docs 업데이트
- [x] 커밋: `Style: Polish event pick card details`

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] "CHANGE PICK ›" 텍스트 — 픽 등록 후 hero card에서 실제 표시 확인
- [ ] Fighter image brightness — 다크 분위기 유지 여부 확인
- [ ] Top fade 0.40 — 얼굴 가시성 개선 확인
- [ ] UFC 일정 패널 스크롤바 — 실제 hover 시 red 확인

---

## Phase 6F-QA — Community/News Upgrade QA (2026-05-25)

**분석 방법:** 정적 코드 분석 (CSS specificity, JS 코드 경로, flex 수치 분석)

### 코드 경로 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `setCommunityFilter` — `.active` 클래스 토글 | PASS | `classList.add/remove('active')` → `#community .comm-filter-btn.active` CSS 정상 적용 ✓ |
| `openPostDetail` — `bar.style.background` 인라인 | PASS | inline background override, Phase 6F는 height만 변경 (`pd-cat-bar`) ✓ |
| `closePostDetail` — `document.body.style.overflow` | PASS | overflow 리셋만, Phase 6F 무관 ✓ |
| `likePost` / `_syncDetailLikeBtn` — `#pd-like-btn` 타겟 | PASS | `#post-detail-modal` 내부 — `#community .post-act-btn` 규칙 불적용 ✓ |
| `sendDetailComment` — 댓글 렌더 | PASS | `_renderDetailComments`가 `.post-comment-block` 렌더 → Phase 6F `#post-detail-modal .post-comment-block` 적용 ✓ |
| `requestBattle` 버튼 | PASS | inline-styled → Phase 6F 충돌 없음 ✓ |
| `fetchMMANews` / `renderNewsGrid` / `setNewsCat` | PASS | Phase 6F JS 변경 없음, `nc-cat-bar` 클래스 추가만 ✓ |
| `openNewsDetail` — `nd-cat-bar.style.background` | PASS | inline background, Phase 6F는 `nd-cat-bar` height만 변경 ✓ |

### CSS Specificity 검증

| 규칙 | Specificity | 경합 대상 | 결과 |
|---|---|---|---|
| `#community .post-list-container` bg | (1,1,0) | base `.glass-card` (0,1,0) | PASS ✓ |
| `#community .post-list-head` color | (1,1,0) | Tailwind text- (0,1,0) | PASS ✓ |
| `#community .post-row-title` color | (1,1,0) | Tailwind text- (0,1,0) | PASS ✓ |
| `#community .post-act-btn` border/color | (1,1,0) | Phase 5A `#community .post-act-btn` (1,1,0) — 파일 후반부 위치로 우선 | PASS ✓ |
| `#community .post-act-btn:hover` | (1,2,0) | Phase 5A (1,2,0) — Phase 6F 후반부 위치로 우선 | PASS ✓ |
| `#community .post-act-btn.liked` | (1,2,0) | 신규 규칙 — 충돌 없음 | PASS ✓ |
| `#community .comm-filter-btn.active` | (1,2,0) | Phase 5A `#community .comm-filter-btn.active` (1,2,0) — Phase 6F 후반부 위치로 우선 | PASS ✓ |
| `#post-detail-modal #pd-cat-bar` height | (2,0,0) | Tailwind `h-1` (0,1,0) | PASS ✓ |
| `#post-detail-modal .glass-card > div:last-child` bg/border | (1,1,2) | Phase 5A `.glass-card` (0,1,0) | PASS ✓ |
| `#post-detail-modal .post-comment-block` bg/border | (1,1,0) | base (0,1,0) | PASS ✓ |
| `#post-detail-modal .post-comment-nick` color | (1,1,0) | Tailwind text- (0,1,0) | PASS ✓ |
| `#post-detail-modal .post-comment-txt` color | (1,1,0) | Tailwind text- (0,1,0) | PASS ✓ |
| `#news-detail-modal #nd-cat-bar` height | (2,0,0) | Tailwind `h-1` (0,1,0) | PASS ✓ |
| `#mma-news #news-search-input` bg/border | (2,0,0) | Tailwind bg-black/40 (0,1,0) | PASS ✓ |
| `#mma-news #news-search-input:focus` border | (2,1,0) | Tailwind focus:border- (0,2,0) | PASS ✓ |
| `#news-grid .glass-card:hover` box-shadow/border | (1,2,0) | Phase 5A (1,2,0) `box-shadow: none` — Phase 6F 후반부 위치로 override | PASS ✓ |
| `#news-grid .nc-cat-bar` height | (1,1,0) | Tailwind `h-1` (0,1,0) | PASS ✓ |
| `var(--pt-ink-0)` in filter active color | `#FFFFFF` | `#fff`와 동일 — 예기치 않은 색상 변화 없음 | PASS ✓ |
| `pd-like-btn` modal scope 격리 | `#post-detail-modal` 내부 — `#community .post-act-btn` 미적용 | modal like 버튼 독립 | PASS ✓ |

### Mobile 레이아웃 검증 (375px)

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| Post-detail modal footer | PASS | `flex-shrink-0` + `flex` row — `#pd-like-btn` + `#pd-stats` 단일 행 유지 ✓ |
| 댓글 입력란 overflow | PASS | `flex-1` input + `flex-shrink-0` SEND 버튼 — overflow 없음 ✓ |
| News card `nc-cat-bar` 6px | PASS | height 2px 증가, 카드 레이아웃 영향 없음 ✓ |
| News search input | PASS | `w-full` 유지 — bg/border 변경만, overflow 없음 ✓ |
| Community post-row 텍스트 | PASS | 색상 변경만, DOM 구조/크기 변경 없음 ✓ |

### 수정 사항

없음 — 정적 분석 결과 모든 Phase 6F 변경이 정상 동작. CSS/마크업 fix 불필요.

### 완료 기준

- [x] Community 코드 경로 8개 검증 완료
- [x] CSS specificity 19개 규칙 검증 완료
- [x] Mobile 375px 레이아웃 5개 검증 완료
- [x] 코드 수정 불필요 확인
- [x] `npm run build` 통과
- [x] docs 업데이트
- [x] 커밋: `Fix: Polish community news visible QA findings`

---

## Phase 6F — Community / News 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `5aad312`

### 변경 사항

#### `public/css/app.css` — Phase 6F CSS block 추가

| 규칙 | 적용 효과 |
|---|---|
| `#community .post-list-container` | `background: var(--pt-bg-2)` — 컨테이너 표면 명확화 |
| `#community .post-list-head` | `color: var(--pt-ink-3)` — 헤더 레이블 token 색상 |
| `#community .post-row-title/author/stats/date` | 하드코딩 회색(`#e8e8e8`, `#888`, `#777`) → `var(--pt-ink-0/3)` |
| `#community .post-act-btn` | border `#2a2a2a` → `var(--pt-line-2)`, color `#888` → `var(--pt-ink-3)` |
| `#community .post-act-btn:hover` | red glow bg `rgba(225,6,0,0.06)` + stronger border/color |
| `#community .post-act-btn.liked` | 동일 glow 상태 명확화 |
| `#community .comm-filter-btn.active` | Phase 5A border-only → `background rgba(0.15)` + `box-shadow` glow 추가 |
| `#post-detail-modal #pd-cat-bar` | `h-1` 4px → 6px (ID×2 specificity) |
| `#post-detail-modal .glass-card > div:last-child` | footer `background: var(--pt-bg-1)` + `border-top-color: var(--pt-line-2)` |
| `#post-detail-modal .post-comment-block` | `background: var(--pt-bg-1)` + `border-left-color: var(--pt-red-500)` |
| `#post-detail-modal .post-comment-nick/txt` | `var(--pt-ink-2/1)` 색상 업그레이드 |
| `#news-detail-modal #nd-cat-bar` | `h-1` 4px → 6px |
| `#mma-news #news-search-input` | `bg-black/40` → `var(--pt-bg-2)`, `border-white/10` → `var(--pt-line-2)` |
| `#mma-news #news-search-input:focus` | `border-color: rgba(225,6,0,0.50)` 강화 |
| `#news-grid .glass-card:hover` | Phase 5A `box-shadow: none` 제거 → `0 0 20px rgba(225,6,0,0.08)` + `border-color rgba(225,6,0,0.35)` |
| `#news-grid .nc-cat-bar` | `h-1` 4px → 6px (ID context beats Tailwind) |

#### `index.html` — JS 템플릿 변경

| 위치 | 변경 내용 |
|---|---|
| `renderNewsGrid` category bar div | `h-1 {bar}` → `nc-cat-bar h-1 {bar}` — CSS 높이 타겟팅용 클래스 추가 |

### 변경하지 않은 항목
- `renderPosts`, `openPostDetail`, `likePost`, `sendDetailComment` 로직 무변경
- `renderNewsGrid`, `openNewsDetail`, `setNewsCat` 로직 무변경
- `publishPost`, `setCommunityFilter` 로직 무변경
- `post-detail-modal` / `news-detail-modal` open/close / body overflow 로직 무변경
- 모든 JS 바인딩 ID 유지

### 완료 기준

- [x] Community 텍스트 위계 `pt-ink` 토큰 정렬
- [x] Filter btn active glow 강화
- [x] Post-detail modal cat-bar 6px + footer 어두운 표면
- [x] Post 댓글 블록 token surface
- [x] News-detail modal cat-bar 6px
- [x] News search input token surface
- [x] News card hover glow 복원
- [x] News card category bar 6px
- [x] `npm run build` 통과 (376.42 kB / 79.34 kB gzip)

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] Community post-list `pt-ink-0/3` 가독성 실제 확인
- [ ] Filter btn active glow 강도 확인
- [ ] Post-detail modal footer `bg-1` 색감 확인
- [ ] News card hover glow 강도 확인
- [ ] News category bar 6px 두께 시각 확인
- [ ] Mobile 375px: post-detail modal 댓글+입력란 overflow 확인

---

## Phase 6E-QA — Leaderboard/Rankings Upgrade QA (2026-05-24)

**분석 방법:** 정적 코드 분석 (CSS specificity, JS 코드 경로, flex/grid 수치 분석)

### 코드 경로 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `setRankTab('player'/'faction')` 로직 | PASS | `className.replace()` 대상 클래스 문자열 무변경 — 탭 전환 정상 ✓ |
| `renderLeaderboardList` 랭킹/정렬 로직 | PASS | 포인트 계산/정렬 무변경 — template class 추가만 ✓ |
| `renderFactionRanking` faction 정렬/통계 | PASS | 정렬/계산 로직 무변경 — bar div class 추가만 ✓ |
| `getBeltInfo` 영향 | PASS | Phase 6E 변경 없음 ✓ |
| `.lb-row-me` current user highlight | PASS | Phase 4B `background: linear-gradient(...)` + `border-left: 3px solid` 유지 ✓ |
| `.lb-row-me:hover !important` | PASS | Phase 4B `!important` — Tailwind hover bg override 차단 유지 ✓ |

### CSS Specificity 분석

| 규칙 | 특이성 | 경쟁 규칙 | 결과 |
|---|---|---|---|
| `#my-rank-card` background (Phase 6E) | (1,0,0) | Phase 4B (1,0,0) 동일 — 후반부 위치로 우선 | PASS ✓ |
| `#my-rank-card` border-color (Phase 6E) | (1,0,0) | Tailwind `border-ufcRed/30` (0,1,0) | PASS ✓ |
| `#my-rank-card` box-shadow `!important` | — | inline style 완전 override | PASS ✓ |
| `#leaderboard-player-panel > div:first-child` | (1,0,1) | Tailwind `bg-white/[0.02]` (0,1,0) | PASS ✓ |
| `#leaderboard-player-panel .lb-row-top1` border-left-color | (1,1,0) | Tailwind `border-white/[0.06]` border-color shorthand (0,1,0) | PASS ✓ |
| `#faction-ranking-board .faction-ranking-mine` background | (1,1,0) | `.glass-card` (0,1,0) | PASS ✓ |
| `#faction-ranking-board .glass-card:hover` | (1,2,0) | `.glass-card:hover` (0,2,0) | PASS ✓ |
| `#faction-ranking-board .faction-ranking-mine:hover` | (1,2,0) | `#faction-ranking-board .glass-card:hover` (1,2,0) — 후반부 위치로 border-color 우선 | PASS ✓ |
| `#faction-ranking-board .lb-faction-bar` height/bg | (1,1,0) | Tailwind `h-1.5` / `bg-white/5` (0,1,0) | PASS ✓ |
| `#faction-ranking-board .lb-faction-bar > div` height/bg | (1,1,1) | Tailwind `h-1.5` / `bg-ufcRed` (0,1,0) | PASS ✓ |

### 수정 사항 (P3 fix)

| 우선순위 | 항목 | 원인 | 조치 |
|---|---|---|---|
| **P3** | `.faction-ranking-mine` 호버 시 ring shadow 소실 | `#faction-ranking-board .glass-card:hover` (1,2,0)가 비호버 shadow (1,1,0) override | `.faction-ranking-mine:hover`에 `box-shadow` 명시 추가 — 동일 (1,2,0)에서 후반부 위치로 우선 |

### Mobile 375px 레이아웃 분석

| 항목 | 수치 | 결과 |
|---|---|---|
| My Rank Card flex-wrap | content 287px (p-6=24px 양쪽), 왼쪽(~180px) + 오른쪽(~200px) = 396px > 287px → wrap | PASS (flex-wrap 의도적 줄바꿈, Phase 6E 이전과 동일) ✓ |
| Leaderboard grid accuracy col | `col-span-2 hidden lg:block` — 모바일 숨김, 셀 내 inline ACC(`lg:hidden`) 유지 | PASS ✓ |
| Leaderboard points col-span-3 | 3/12 = 24px × 3 = 72px — "1,234P" text-sm Oswald ≈ 60px | PASS ✓ |
| Faction card name+score 1행 | flex-1 영역 ~187px, name 3–5자(~80px) + score(~80px) < 187px | PASS ✓ |
| Faction member panel W/L+acc+pts (shrink-0) | ~90px, 나머지 nickname min-w-0 truncate | PASS ✓ |

### 상태 상호작용 확인

| 시나리오 | 결과 | 근거 |
|---|---|---|
| lb-row-me + lb-row-top1 동시 적용 (유저 1위) | PASS | bg는 lb-row-me red gradient 유지, border-color는 (1,1,0) gold로 override ✓ |
| lb-row-me:hover — red gradient 유지 | PASS | `!important` 여전히 유효, Phase 6E hover 규칙 없음 ✓ |
| faction mine card 비호버 ring | PASS | `#faction-ranking-board .faction-ranking-mine` (1,1,0) 적용 ✓ |
| faction mine card 호버 ring 보존 | **FIXED** | P3 fix 적용 — `.faction-ranking-mine:hover` box-shadow 명시로 ring 유지 ✓ |
| 일반 faction card 호버 white lift | PASS | `#faction-ranking-board .glass-card:hover` (1,2,0) — 전역 red glow (0,2,0) override ✓ |

### NEEDS_BROWSER (시각 확인 필요)

| 항목 | 이유 |
|---|---|
| My rank card gradient 좌측 강도 | `rgba(225,6,0,0.10)` 55% fade — 너무 약하거나 강한지 확인 |
| Top 3 gold/silver/bronze border 색감 | `#D4AF37` / `rgba(192,192,210,0.75)` / `#B5803A` — 실제 렌더 확인 |
| Faction mine card ring 1px | `rgba(225,6,0,0.22)` — 실제 가시성 확인 |
| Faction bar 8px height | 카드 레이아웃 내 어색하지 않은지 확인 |
| Mobile My Rank Card flex-wrap | 오른쪽 블록 wrapping 시 시각 확인 |

---

## Phase 6E — Leaderboard / Rankings 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `6262113`

### 변경 사항

#### `public/css/app.css` — Phase 6E CSS block 추가

| 규칙 | 적용 효과 |
|---|---|
| `#my-rank-card` background | Phase 4B 단색 `bg-2` → 왼쪽 red radial gradient overlay + `bg-2` base |
| `#my-rank-card` border-color | `ufcRed/30` → `rgba(225,6,0,0.28)` (ID specificity로 Tailwind 우선) |
| `#my-rank-card` box-shadow | 인라인 `0 0 30px 0.1` → `0 0 40px 0.18 + ring 0.12` (!important override) |
| `#my-rank-num` text-shadow | 없음 → `0 0 16px rgba(225,6,0,0.45)` subtle red glow |
| `#leaderboard-player-panel > div:first-child` | `bg-white/[0.02]` → `var(--pt-bg-3)` + `border-line-2` |
| `#leaderboard-player-panel .lb-row-top1/top2/top3` | 모두 red border → gold `#D4AF37` / silver `rgba(192,192,210,0.75)` / bronze `#B5803A` |
| `#faction-ranking-board .faction-ranking-mine` | `glass-card` 기본 bg → red radial gradient + `bg-2` + ring shadow |
| `#faction-ranking-board .glass-card:hover` | 전역 red glow → subtle white lift `rgba(255,255,255,0.12)` + dim shadow |
| `#faction-ranking-board .faction-ranking-mine:hover` | mine card hover border `rgba(225,6,0,0.40)` 유지 |
| `#faction-ranking-board .lb-faction-bar` | `h-1.5` → `8px` (ID context beats Tailwind) |
| `#faction-ranking-board .lb-faction-bar > div` | `bg-ufcRed` 단색 → `linear-gradient(red → faded red)` + `height:100%` |

#### `index.html` — 마크업/템플릿 변경

| 위치 | 변경 내용 |
|---|---|
| Belt legend grid | `id="lb-belt-legend"` 추가 (향후 per-belt 타겟팅 대비) |
| `renderLeaderboardList` row template | `${rank<=3?'border-l-4 border-l-red-600':''}` → `` ${rank<=3?`border-l-4 lb-row-top${rank}`:''} `` — Tailwind color 제거, CSS 클래스로 gold/silver/bronze 색상 제어 |
| `renderFactionRanking` progress bar | `w-full bg-white/5 ... h-1.5` → `lb-faction-bar` 클래스 추가 (CSS로 height/bg override) |

### 변경하지 않은 항목
- `setRankTab()` 로직 및 className string 변경 없음
- `renderLeaderboardList()` 랭킹/정렬/포인트 계산 로직 무변경
- `renderFactionRanking()` faction 정렬/통계 계산 로직 무변경
- `toggleFactionMemberRanking()` 토글 로직 무변경
- 모든 JS 바인딩 ID (`my-rank-num`, `my-rank-pts`, `my-rank-acc`, `my-belt-badge`, `rank-tab-player`, `rank-tab-faction`, `leaderboard-list`, `leaderboard-player-panel`, `leaderboard-faction-panel`, `faction-ranking-board`) 유지

### 완료 기준

- [x] My rank card red radial gradient + stronger glow
- [x] Leaderboard table header elevated surface
- [x] Top 3 rows gold/silver/bronze left-border accent
- [x] Faction mine card red gradient glow
- [x] Faction card hover subtler (white lift vs red)
- [x] Faction score bar 8px + gradient fill
- [x] `npm run build` 통과 (376.41 kB / 79.33 kB gzip)
- [x] setRankTab/renderLeaderboardList/renderFactionRanking 로직 유지 확인

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] My rank card gradient 좌측 강도 — 너무 강하거나 약하지 않은지 확인
- [ ] Top 3 gold/silver/bronze border — 실제 색감 확인
- [ ] Faction mine card gradient ring — ring 1px 가시성 확인
- [ ] Faction bar 8px height — 레이아웃 overflow 확인
- [ ] Mobile 375px: My rank card flex (`flex items-center justify-between flex-wrap`) — points/acc/belt badge 줄바꿈 여부 확인

---

## Phase 6D-QA — Profile Visible Upgrade QA (2026-05-24)

**분석 방법:** 정적 코드 분석 (CSS specificity, JS 바인딩 경로, flex layout 수치 분석)

### 코드 경로 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `refreshUI()` — `prof-pts/prof-tot/prof-acc` textContent | PASS | ID 전부 유지, JS line ~2811 `state.points \|\| 0` guard 유지 ✓ |
| `refreshUI()` — `belt-box/belt-name` className 할당 | PASS | Phase 6D 마크업 변경 없음, JS 그대로 작동 ✓ |
| `refreshUI()` — `bt-prog-fill.style.width` | PASS | JS는 `style.width`만 업데이트 — HTML inline `background:linear-gradient(...)` 유지 ✓ |
| `bt-line-fill.style.width/background` | PASS | belt track line JS 할당 별도 — progress fill과 무관 ✓ |
| `openNicknameModal()` onclick | PASS | Phase 6D 마크업 변경 없음 ✓ |
| `logoutUser()` onclick (`id="logout-btn"`) | PASS | Phase 6D 마크업 변경 없음 ✓ |
| `bt-stops` innerHTML 렌더 IIFE | PASS | `bt-stops` ID 유지, innerHTML 덮어쓰기 — `.pt-belt-stop.current` 클래스 JS가 할당 ✓ |
| `.pt-belt-stop.current .pt-belt-dot` CSS glow | PASS | `.pt-belt-stop.current` 클래스를 JS가 동적 추가 → CSS 규칙 적용 ✓ |

### CSS 특이성 분석

| 규칙 | 특이성 | 비고 |
|---|---|---|
| `.profile-hero-card` (Phase 6D) | (0,1,0) | Phase 4A (0,1,0)과 동일 — 파일 후반부 위치로 우선 ✓ |
| `.profile-hero-card::before` `background-image:` (Phase 6D) | (0,2,0) | Phase 4A `background:` shorthand는 리셋 — Phase 6D sub-property로 image만 교체, `content/position/inset` 유지 ✓ |
| `.prof-avatar-wrap` `box-shadow` (Phase 6D) | (0,1,0) | 새 클래스 — Tailwind 충돌 없음 ✓ |
| `.pt-belt-stop.current .pt-belt-dot` (Phase 6D) | (0,3,0) | Phase 4A (0,3,0) 동일 — Phase 6D 후반부 위치로 우선 ✓ |
| `.pt-belt-stop.current .pt-belt-nm` (Phase 6D) | (0,3,0) | Phase 4A `color: var(--pt-ink-0)` → Phase 6D `color: #C39DF1` 교체 ✓ |

### 레이아웃 안전성 — Mobile 375px

| 항목 | 검증 | 결과 |
|---|---|---|
| Avatar flex row — 버튼 줄바꿈 여부 | avatar 64px + gap-4(16px) + name(min-w-0) + gap-4(16px) + buttons(~130px) = 226px < 335px content | PASS ✓ |
| Avatar `flex-shrink-0` + name `flex-1 min-w-0` | name 영역 ~109px, `truncate` class 유지 — overflow 없음 | PASS ✓ |
| Belt dot `scale(1.30)` — 인접 요소 밀림 | `transform` 은 layout flow 외 — 26px 시각 크기, 인접 column 67px(375/5 기준) 여유 있음 | PASS ✓ |
| Belt dot label(`.pt-belt-nm`) overlap | 2~3자 한국어 label, 14px font, column 67px — 겹침 없음 | PASS ✓ |
| Progress bar `h-2` — 컨테이너 내 넘침 | 부모 `overflow-hidden rounded-full` 유지 — 두께만 증가, 넘침 없음 | PASS ✓ |
| `sx-head` 헤더 — flex layout | `.sx-head { display:flex; align-items:center; gap:16px }` + `::after` bar — 375px 전체폭 정상 ✓ | PASS ✓ |

### Desktop 확인

| 항목 | 결과 | 근거 |
|---|---|---|
| Avatar `lg:w-20 lg:h-20` (80px) | PASS | hero flex row 충분한 너비 — 버튼 줄바꿈 없음 ✓ |
| `lg:text-4xl` avatar 아이콘 | PASS | 80px 컨테이너 내 `text-4xl`(36px) — 여유 ✓ |
| profile-hero-card gradient overlay | PASS | radial gradient left purple + right red — spec 일치 ✓ |

### 수정 내역

없음 — 정적 분석 결과 모든 Phase 6D 변경이 정상 동작. CSS/마크업 fix 불필요.

### NEEDS_BROWSER (시각 확인 필요)

| 항목 | 이유 |
|---|---|
| purple/red gradient 강도 | `rgba(139,63,227,0.22)` + `rgba(225,6,0,0.14)` — subtle 강도 시각 확인 필요 |
| grid cage texture 가시성 | `rgba(255,255,255,0.025)` — 실제 렌더에서 보이는지 확인 |
| avatar glow box-shadow | `rgba(225,6,0,0.25)` 24px — 실제 발광 느낌 확인 |
| belt dot scale(1.30) + purple glow | 인접 dot과 실제 간격 시각 확인 |
| progress fill purple→brown gradient | `rgba(139,63,227,0.90) → rgba(181,128,58,0.80)` 색감 확인 |

---

## Phase 6B-QA — Home Hero QA (2026-05-24)

**분석 방법:** 코드 정적 분석 (CSS specificity, HTML 구조, JS 바인딩 경로)

### QA 항목

| 항목 | 상태 | 근거 |
|---|---|---|
| `#home::before` z-index vs content | PASS (code) | `z-index:0`, 콘텐츠 `relative z-10`, ticker `relative z-10` — 정상 적층 |
| `#home` display:flex vs `::before` position:absolute | PASS (code) | absolute는 flex flow 제외, `#home { position:relative }` 포함 블록 제공 ✓ |
| `hero-event-label` — JS textContent 덮어쓰기 | PASS (code) | JS는 textContent만 변경, CSS pill 스타일 무영향 ✓ |
| `hero-red-img / hero-blue-img` — JS backgroundImage | PASS (code) | JS: `style.backgroundImage = 'gradient, url(...)'` + size/position/repeat — inline style이 CSS 우선 ✓ |
| `renderFaceOffGlow` boxShadow override | PASS (code) | `card.style.boxShadow=''` 시 `.hero-faceoff` CSS 복원 ✓ |
| `hero-event-label` 색상 — `text-gray-500` vs CSS | **ISSUE P2** | ID(1,0,0) > class(0,1,0) → CSS 이김. 그러나 overridden class 잔존 → `text-gray-500` 제거 |
| 375px: faceoff card grid 너비 | PASS (code) | content 335px, fighter col 133px, w-24=96px — 마진 18px씩 여유 ✓ |
| 375px: VS badge (52px) center column | PASS (code) | (335-52-16)/2=133px/col — fighter image 넘치지 않음 ✓ |
| Fighter image h-44 lg:h-56 overflow | PASS (code) | card `overflow-hidden` + 302px card height ≈ 37% 375×812 viewport ✓ |
| `.hero-fighter-name max-width:100px` | PASS (code) | Oswald condensed "CHIMAEV"(7ch) ≈ 73px < 100px, word-break 적용 ✓ |
| VS badge `pb-10` 수직 정렬 | PASS (code) | 기존 동일 패턴 — `items-end` + pb-10 offset 유지 ✓ |
| `bg-cover bg-top` Tailwind vs JS | PASS (code) | JS `style.backgroundSize/Position` inline > stylesheet — fallback gradient 무해 ✓ |
| hero-fighter-img hover lift | PASS (code) | `.hero-faceoff:hover .hero-fighter-img { transform: translateY(-4px) }` — overflow:hidden 내 ✓ |
| `hero-grid-overlay` z-index 0 vs card content | PASS (code) | inner `.relative` div DOM order 이후 → content on top ✓ |
| JS 바인딩 ID 6종 | PASS (code) | hero-red-img, hero-blue-img, hero-red-name, hero-blue-name, hero-event-label, cd-d/h/m/s 모두 존재 ✓ |
| `navigateTo('matchups')` CTA | PASS (code) | line 637 유지 ✓ |

### 수정 내역

| 우선순위 | 항목 | 조치 |
|---|---|---|
| **P2** | `#hero-event-label` class에 `text-gray-500` 잔존 | 제거 (CSS ID rule이 완전 제어) |

### NEEDS_BROWSER (시각 확인 필요)

| 항목 | 이유 |
|---|---|
| Red/blue gradient 강도 | 0.18/0.14 opacity — 미묘한 값, 시각 확인 필요 |
| Grid texture 가시성 | 0.025/0.028 opacity — 실제 렌더 확인 |
| Fighter image 실사진 framing | JS `bg-top center` → 상반신 중심 크롭 확인 |
| VS badge 크기/위치 시각 | 52px circle on mobile vs 60px desktop |
| Corner pill 가독성 | 8px italic font — 너무 작지 않은지 확인 |
| hero-event-label pill 렌더 | red-tinted border+bg — 실제 색감 확인 |
| `renderFaceOffGlow` 결과 | pick 상태에서 card box-shadow override 시각 확인 |

---

## Phase 6B — Home Hero 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `ea5c91f`

### 변경 사항

| 영역 | 이전 | 이후 |
|---|---|---|
| `#home` 배경 | Unsplash 사진 URL + gradient overlay | `radial-gradient` red/blue corner + `linear-gradient` dark base (토큰 시스템) |
| `#home::before` | 없음 | 28px grid cage texture overlay (subtle) |
| `#hero-event-label` | 일반 텍스트 | red tinted pill (rgba border + bg) via CSS |
| `hero-faceoff-card` 배경 | `rgba(10,10,14,0.7)` + `backdrop-blur-xl` | `.hero-faceoff` (0.90 opacity) + red/blue dual box-shadow |
| 코너 gradient 강도 | `red-500/20 → transparent` | `rgba(225,6,0,0.28) → transparent 60%` (더 선명) |
| 상단 highlight line | `from-transparent via-white/20 to-transparent` | red→neutral→blue gradient (방향성 강조) |
| 카드 내부 grid texture | 없음 | 20px `.hero-grid-overlay` |
| 카드 헤더 | "Main Event Face-off" 일반 텍스트 | "Main Event" red pill badge + "Face-off" dimmed |
| Fighter image 높이 | `h-40 lg:h-48` | `h-44 lg:h-56` (더 큰 fighter silhouette) |
| Fighter image class | 없음 | `.hero-fighter-img` (hover lift effect on card hover) |
| Fighter name | `text-sm lg:text-base` inline Tailwind | `.hero-fighter-name` CSS class |
| Corner label | 일반 `text-gray-400` 텍스트 | `.hero-corner-pill .hero-corner-red / .hero-corner-blue` (색상 pill) |
| VS 배지 | 단순 border + bg inline | `.hero-vs-badge` (50% border-radius, dual glow, 더 큰 크기) |
| Faceoff card 너비 (xl) | `xl:w-auto` | `xl:max-w-[460px]` |

### 변경하지 않은 항목
- 모든 JS 바인딩 ID (`hero-red-img`, `hero-blue-img`, `hero-red-name`, `hero-blue-name`, `hero-event-label`, `cd-d/h/m/s`)
- `navigateTo('matchups')` CTA 동작
- Countdown 계산 로직
- Home 전체 layout (headline → CTA → faceoff card → ticker → news)

---

## Phase 6D — Profile 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `e499e16`

### 변경 사항

#### `public/css/app.css` — Phase 6D CSS block 추가

| 규칙 | 적용 효과 |
|---|---|
| `.profile-hero-card` background | Phase 4A 단일 red radial → purple/red 이중 radial gradient (`rgba(139,63,227,0.22)` left + `rgba(225,6,0,0.14)` right) + `var(--pt-bg-2)` base |
| `.profile-hero-card::before` | Phase 4A red radial gradient → 28px grid cage texture (home hero와 동일 패턴) |
| `.prof-avatar-wrap` | red glow `box-shadow: 0 0 24px rgba(225,6,0,0.25)` + inner highlight |
| `.pt-belt-stop.current .pt-belt-dot` | Phase 4A red glow → purple glow (`rgba(139,63,227,0.80/0.22/0.35)`) — 현재 belt 색상과 일치 |
| `.pt-belt-stop.current .pt-belt-nm` | Phase 4A `var(--pt-ink-0)` (흰색) → `#C39DF1` (purple tint) — 핸드오프 기준 |

#### `index.html` — 마크업 변경

| 위치 | 변경 내용 |
|---|---|
| Profile 섹션 서브타이틀 | `text-gray-600` → `text-gray-500` (가독성) |
| Avatar div | `w-14 h-14 lg:w-16 lg:h-16 rounded-xl from-ufcRed/20 to-black border-ufcRed/20` → `w-16 h-16 lg:w-20 lg:h-20 rounded-2xl from-red-900/60 to-black/90 border-ufcRed/30` + `prof-avatar-wrap` 클래스 추가 |
| Avatar 아이콘 | `text-2xl` → `text-3xl lg:text-4xl` |
| Belt progress bar 트랙 | `h-1.5 bg-white/[0.06]` → `h-2 bg-white/[0.08]` |
| Belt progress fill | `background:var(--pt-red-500)` → `background:linear-gradient(90deg,rgba(139,63,227,0.90),rgba(181,128,58,0.80))` (purple→brown 그라디언트) |
| "Recent Fight History" 헤더 | `flex + h-px divider` → `.sx-head` (섹션 헤더 패턴 통일) |

### 변경하지 않은 항목
- `openNicknameModal()` / `logoutUser()` onclick 유지
- `state.points || 0` guard 유지
- `refreshUI()` — `prof-pts`, `prof-tot`, `prof-acc`, `belt-box`, `belt-name`, `bt-line-fill`, `bt-prog-fill` ID 모두 유지
- belt tracker JS 렌더 로직 (`refreshUI` 내 IIFE) 무변경
- `renderProfileStats()` / `renderBeltTracker()` 경로 무변경

### 완료 기준

- [x] profile-hero-card purple/red gradient + grid texture
- [x] avatar 크기/스타일 업그레이드 + prof-avatar-wrap 클래스
- [x] belt tracker current dot purple glow
- [x] progress bar 두께 h-2 + purple→brown fill gradient
- [x] Recent Fight History 헤더 sx-head 통일
- [x] `npm run build` 통과
- [x] JS 바인딩 ID 전체 유지 확인

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] purple/red gradient 강도 — subtle vs 너무 강한지 확인
- [ ] grid cage texture 가시성 (0.025 opacity) 확인
- [ ] avatar w-20 — mobile flex 레이아웃에서 버튼 줄바꿈 확인
- [ ] belt dot purple glow scale(1.30) — 인접 dot label overlap 확인
- [ ] progress fill purple→brown gradient 시각 확인

---

## Phase 6C-QA — Event/Pick Card State QA (2026-05-24)

**분석 방법:** 정적 코드 분석 (CSS specificity, JS 상태 경로, HTML 구조, 함수 흐름)

### 코드 경로 검증

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| `updateAllFightCards` 리셋 블록 | PASS | `fc-card-pending/settled` 제거, `myPickEl` hidden+class clear, `settledDiv` hidden+class clear ✓ |
| pending → `fc-card-pending` 추가 | PASS | `cardEl.classList.add('fc-card-pending')` + early return ✓ |
| pending → `fc-my-pick` 클래스 교체 | PASS | `className` 완전 교체로 `hidden` 제거, `fc-my-pick fc-pick-red/blue` 적용 ✓ |
| settled → `fc-card-settled` 추가 | PASS | `cardEl.classList.add('fc-card-settled')` ✓ |
| settled → `fc-settled-win/lose` 추가 | PASS | `settledDiv.classList.add('fc-settled-win/lose')` + `style.background=''` ✓ |
| `hidden` show/hide 로직 | PASS | Tailwind `hidden { display:none !important }` > `.fc-my-pick { display:flex }` → 표시/숨김 정상 ✓ |
| `openPickSlip` / `selectPickFighter` 로직 | PASS | Phase 6C 변경 없음, 회귀 없음 ✓ |
| `confirmBetSlip` / `castVote` 로직 | PASS | Phase 6C 변경 없음, 회귀 없음 ✓ |
| `openBetSlip` (index.html 레거시) | PASS | Phase 6C 변경 없음 ✓ |
| `state.pendings` 구조 | PASS | `{side:'left'/'right', pick, payout, ...}` — `side` key 'left'/'right' → `isLeft` 분기 정확 ✓ |
| `state.settled` 구조 (DB sync) | PASS | `supabase.js:481` `{result:'WIN'/'LOSE', actualWinner, actualMethod, payout}` → WIN/LOSE 분기 정확 ✓ |
| `state.settled` 로컬 write (season reset) | PASS | `season.js:404` `state.settled = {}` 초기화 ✓ |
| H2H/radar `initRadarChart` | PASS | Phase 6C 변경 없음 ✓ |
| `toggleStatsOverlay` / `toggleAnalysis` | PASS | Phase 6C 변경 없음 ✓ |
| `bet-btn-f1/f2-*` guard no-ops | PASS | 해당 ID 카드 마크업에 없음, `if(btn1)` 가드로 안전 ✓ |

### CSS Specificity 검증

| 규칙 | Specificity | Tailwind 경쟁 | 결과 |
|---|---|---|---|
| `#fight-cards-container .fc-pick-bar` bg | (1,1,0) | `bg-black/20` (0,1,0) | 우리 CSS 승 ✓ |
| `#fight-cards-container .fc-pick-bar` border-color | (1,1,0) | `border-white/5` (0,1,0) | 우리 CSS 승 ✓ |
| `#fight-cards-container .fc-strip-card .fc-red-side` | (1,2,0) | 경쟁 클래스 없음 | 안전 ✓ |
| `#fight-cards-container .fc-card-pending/settled` cursor | (1,1,0) + `!important` | hero 인라인 `cursor:pointer`, strip `cursor-pointer` | `!important` 승 ✓ |
| `#fight-cards-container .fc-pick-red` border-top-color | (1,1,0) | `border-white/10` (0,1,0) | 우리 CSS 승 ✓ |
| `#fight-cards-container .fc-settled-win` border-top | (1,1,0) | `border-white/10` (0,1,0) | 우리 CSS 승 (shorthand) ✓ |
| `#fight-cards-container .fc-settled-win/lose` bg | (1,1,0) | `bg-black/20` (0,1,0, strip) | 우리 CSS 승 ✓ |

### 상태별 UI 검증 (코드 기준)

| 상태 | 확인 항목 | 결과 |
|---|---|---|
| no pick | 양쪽 fighter 동등 노출 | PASS — fc-red/blue-side 미선택 시 동일 border opacity ✓ |
| pending | MY PICK 배너 방향 gradient | PASS — `isLeft ? fc-pick-red : fc-pick-blue` 정확히 분기 ✓ |
| pending | 카드 cursor | PASS — `fc-card-pending cursor:default !important` ✓ |
| settled WIN | 레드 tint bg + 보너스 태그 | PASS — `fc-settled-win` + bonusHtml (DB 미포함 시 empty string — 기존 동작) ✓ |
| settled LOSE | 흐릿한 외관 | PASS — `fc-settled-lose opacity:0.7` ✓ |
| settled | 클릭 불가 외관 | PASS — `fc-card-settled cursor:default !important` ✓ |

### 모바일 375px 레이아웃 검증

| 항목 | 결과 | 근거 |
|---|---|---|
| strip row fc-red-side border-left + padding-left | PASS | box-sizing border-box → content area ≈100px, 파이터명 truncate ✓ |
| fc-blue-side border-right + padding-right | PASS | 동일 ✓ |
| fc-my-pick banner overflow | PASS | inner span `truncate`, 카드 너비 이내 ✓ |
| hero card my-pick banner 위치 | PASS | community pick bar 아래, face-off 위에 삽입 ✓ |
| strip row my-pick banner 위치 | PASS | 메인 flex row 아래, settled badge 위에 삽입 ✓ |

### 기존 기능 영향 확인

| 기능 | 결과 |
|---|---|
| pick submit (castVote → DB 저장) | 변경 없음 ✓ |
| settlement / scoring 로직 | 변경 없음 ✓ |
| community pick ratio 업데이트 | 변경 없음 ✓ |
| analysis 4탭 (radar/stats/insight/recent) | 변경 없음 ✓ |
| H2H 레이더 차트 fallback | 변경 없음 ✓ |

### Pre-existing 항목 (Phase 6C 무관)

| 항목 | 설명 | 심각도 |
|---|---|---|
| DB-loaded settled에 `hadMethodBonus` 등 없음 | `supabase.js:481-488` DB sync 시 해당 필드 미포함 → 보너스 태그 표시 안됨 | 낮음 (데이터 없는 기능 — Phase 6C 이전 동작과 동일) |

### 수정 내역

없음 — 정적 분석 결과 모든 Phase 6C 변경이 정상 동작.

### NEEDS_BROWSER (시각 확인 필요)

| 항목 | 이유 |
|---|---|
| fc-my-pick gradient visibility | `rgba(225,6,0,0.10 → 0.04)` — 매우 미묘한 opacity, 실제 렌더 확인 필요 |
| fc-pick-red/blue border accent | 3px 좌/우 accent — 두께/강도 시각 확인 |
| fc-strip-card red/blue side border | `rgba(225,6,0,0.30)` 2px — mobile에서 가시성 확인 |
| fc-settled-lose opacity:0.7 | LOSE 텍스트 `opacity:0.7` — 가독성 확인 |
| cursor:default on pending/settled | 브라우저 devtools로 인라인 `cursor:pointer` override 확인 |
| fc-pick-bar bg `#0E0F12` vs 카드 bg `#14161B` | 약간 더 어두운 pick bar — 시각적 구분감 확인 |
| hero card MY PICK banner 삽입 위치 | community bar 아래 face-off 위 — mobile 흐름 자연스러움 확인 |

---

## Phase 6C — Event / Pick Card 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `ee14956`

### 변경 사항

#### `public/js/fights-render.js` — CSS class hooks 추가

| 위치 | 변경 내용 |
|---|---|
| `renderHeroCard` outer div | `fc-hero-card` 클래스 추가 |
| `renderHeroCard` pick bar section | `fc-pick-bar` 클래스 추가 |
| `renderStripRow` outer div | `fc-strip-card` 클래스 추가 |
| `renderStripRow` F1 info div | `fc-red-side` 클래스 추가 |
| `renderStripRow` F2 info div | `fc-blue-side` 클래스 추가 |

#### `public/js/fights-render.js` — `updateAllFightCards` state 로직 업그레이드

| 상태 | 이전 | 이후 |
|---|---|---|
| 카드 초기화 | 없음 | `cardEl.classList.remove('fc-card-pending', 'fc-card-settled')` |
| 픽 pending | `myPickEl.className` = Tailwind 유틸 + `myPickEl.style.background` 인라인 | `myPickEl.className = 'fc-my-pick fc-pick-red/blue'` + `style.background=''` 클리어 |
| 픽 pending 카드 | 없음 | `cardEl.classList.add('fc-card-pending')` |
| settled WIN | `settledDiv.style.background` 인라인 | `settledDiv.classList.add('fc-settled-win')` + `style.background=''` |
| settled LOSE | `settledDiv.style.background` 인라인 | `settledDiv.classList.add('fc-settled-lose')` + `style.background=''` |
| settled 카드 | 없음 | `cardEl.classList.add('fc-card-settled')` |

#### `public/css/app.css` — Phase 6C CSS block 추가

| 클래스 | 적용 효과 |
|---|---|
| `.fc-pick-bar` | `var(--pt-bg-1)` surface, `var(--pt-line-1)` border |
| `.fc-strip-card .fc-red-side` | `2px solid rgba(225,6,0,0.30)` 좌측 border + padding-left |
| `.fc-strip-card .fc-blue-side` | `2px solid rgba(31,111,235,0.25)` 우측 border + padding-right |
| `.fc-card-pending`, `.fc-card-settled` | `cursor: default !important` (hero card 인라인 `cursor:pointer` override) |
| `.fc-my-pick` | min-height 36px, flex center, padding, border-top transparent |
| `.fc-pick-red` | `linear-gradient(to right, red tint)` + 3px red left border |
| `.fc-pick-blue` | `linear-gradient(to left, blue tint)` + 3px blue right border |
| `.fc-settled-win` | `rgba(225,6,0,0.06)` bg + red border-top |
| `.fc-settled-lose` | `var(--pt-bg-1)` bg + `opacity: 0.7` |

모든 규칙: `#fight-cards-container .fc-*` (specificity 1,1,0) — Tailwind CDN JIT (0,1,0) override.

### 변경하지 않은 항목
- `openBetSlip` / `confirmBetSlip` 로직 — 완전 무변경
- `state.pendings` / `state.settled` 데이터 구조 — 무변경
- pick submit / scoring / settlement 로직 — 무변경
- Community pick ratio 계산/렌더 — 무변경
- H2H / radar fallback 경로 — 무변경

### 완료 기준

- [x] `fights-render.js` CSS class hooks 추가 (`fc-hero-card`, `fc-pick-bar`, `fc-strip-card`, `fc-red-side`, `fc-blue-side`)
- [x] `fights-render.js` `updateAllFightCards` state 클래스 기반으로 업그레이드
- [x] `app.css` Phase 6C CSS block 추가
- [x] `npm run build` 통과
- [x] docs 업데이트
- [x] 커밋: `Style: Upgrade event pick card design`

**브라우저 확인 필요 (코드 범위 밖):**
- [ ] Strip row red/blue side border — mobile 375px 확인
- [ ] MY PICK banner gradient — pending pick 선택 후 시각 확인
- [ ] settled WIN/LOSE 배경 — 결과 확정 카드 시각 확인
- [ ] Hero card `cursor:default` — pending/settled 시 cursor override 동작 확인

---

## Phase 6A — Global Header / Nav 디자인 업그레이드 (2026-05-24)

**브랜치:** `main`  
**기준 커밋:** `a42e5d3`

### 변경 사항

| 영역 | 이전 | 이후 |
|---|---|---|
| Desktop nav 배경 | `rgba(8,8,8,0.85) blur(24px)` | `rgba(7,8,10,0.92) blur(12px) saturate(180%)` |
| Desktop nav 하단 border | `rgba(255,255,255,0.05)` | `var(--pt-line-2)` |
| Mobile header 배경/border | 동일 방향으로 업데이트 | — |
| 로고 | 텍스트만 | SVG 아이콘(octagon) + 텍스트, `var(--pt-red-500)` |
| Nav link 기본색 | 미지정(흰색) | `var(--pt-ink-2)` (중간 회색) |
| Nav link hover | 없음 | `var(--pt-ink-0)` (흰색) |
| Nav active state | 빨간 underline + 빨간 텍스트 | pill bg `var(--pt-bg-3)` + 흰 텍스트 |
| Points pill | glass-card + pulse dot + "Balance" label | amber `◆` pill — `var(--pt-warn)` 색상 |
| Bottom nav 배경 | `rgba(8,8,8,0.92)` | `rgba(7,8,10,0.94) saturate(180%)` |
| Bottom nav border-top | `rgba(255,255,255,0.06)` | `var(--pt-line-1)` |

### 변경하지 않은 항목
- `navigateTo()` 로직 — `.active` 클래스 토글 그대로
- `logoutUser()` / `openAdminGate()` / auth modal — 로직 그대로
- 로그인/로그아웃 버튼 — 기능 그대로 (스타일 소폭 조정 없음)
- 모바일 바텀 nav active=red — 유지

---

*최초 작성: 2026-05-23*
