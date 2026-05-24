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
- [ ] Pending 상태: 레드/블루 `rgba(210,10,10,0.07)` 인라인 bg (JS 제어, CSS 무관)
- [ ] Settled WIN: 레드 bg + `text-ufcRed` (JS 제어)
- [ ] Settled LOSE: `text-gray-400` (JS 제어)

**레이더 차트**
- [ ] fighterDB에 이름이 일치하는 fighter가 있으면 실제 stats 표시
- [ ] 불일치 시 차트 blank (크래시 없음)

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

## Phase 5 — Community / News / Admin 적용

**목표:** 나머지 화면 일괄 정리 (낮은 노출 빈도)

### 핸드오프 기준 파일

- `docs/design_handoff_picktagon/screens/screen-community.html`
- `docs/design_handoff_picktagon/screens/screen-news.html`
- `docs/design_handoff_picktagon/screens/screen-admin.html`

### 주의

- **Admin 화면**: 내부 도구 성격 — 디자인 완성도보다 기능 안정성 우선
- Community 피드 카드: `.pt-card` 기반 통일
- News 카드: 섬네일 비율, 카테고리 뱃지 (`--pt-belt-*` 색상 활용 가능)

### 영향 파일

| 파일 | 변경 유형 | 위험도 |
|---|---|---|
| `index.html` (Community 섹션) | 마크업 + CSS | 낮음 |
| `public/js/community.js` | 클래스명 업데이트 | 낮음 |
| `index.html` (News 섹션) | 마크업 + CSS | 낮음 |
| `public/js/news.js` | 클래스명 업데이트 | 낮음 |
| `index.html` (Admin 섹션) | CSS만 | 낮음 |

---

## 리스크 & 전제조건

| 항목 | 설명 | Phase 3C 이후 상태 |
|---|---|---|
| **폰트 로딩** | Barlow / Bebas Neue Google Fonts 의존 — 오프라인/느린 네트워크 시 폴백 필요 | 미해결 |
| **색상 미세 차이** | `#e8000d` vs `#E10600` — Phase 3A에서 `--red: var(--pt-red-500)` 마이그레이션 완료 | **해결** |
| **Tailwind `ufcRed`** | `tailwind.config` 내 `ufcRed: '#e8000d'` 는 CSS 변수와 무관하게 하드코딩 — Phase 3D에서 `'#E10600'`으로 업데이트 필요 | 미해결 |
| **Pretendard** | `screen-shell.css`가 `'Pretendard'` 사용 → tokens.css는 `'Barlow'`. 실제 앱에선 Pretendard 유지 결정 | 미해결 |
| **JS 클래스 참조** | `public/js/*.js` 파일들이 DOM 클래스명을 직접 참조하는 경우 마크업 변경 시 동반 수정 필요 | 미해결 |
| **index.html 규모** | 단일 파일이라 회귀 테스트 범위 넓음 — Phase별 작은 단위 커밋 필수 | 미해결 |
| **stats 이름 매칭** | `matchups.red_fighter_name` ↔ `fighters.name` 정확 일치 요구 — Phase 3D에서 ID 기반 매핑으로 전환 예정 | **Phase 3D 예정** |
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
| Phase 3D-2: matchups fighter_id 기반 매핑 | 대기 | — |
| Phase 4: Home/Profile/Leaderboard | 대기 | — |
| Phase 5: Community/News/Admin | 대기 | — |

---

*최초 작성: 2026-05-23*
