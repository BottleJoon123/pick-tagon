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

### 작업 범위

1. `public/css/shell.css` 생성  
   - 앱 헤더, 네비게이션, 컨테이너, 섹션 헤더 (`app-header`, `app-nav`, `app-container`, `sx-head` 등)  
   - 핸드오프 `screen-shell.css` 기준 재작성

2. `public/css/components.css` 생성  
   - 카드 (`.matchup-card`, `.fighter-card`, `.pt-card`)
   - 버튼, 뱃지, 탭, 상태 칩
   - Bottom nav 공통 스타일

3. `index.html` `<style>` 블록 슬림화  
   - 추출된 CSS 제거, `<link>` 참조로 교체

### 영향 파일

| 파일 | 변경 유형 | 위험도 |
|---|---|---|
| `public/css/shell.css` | 신규 생성 | 없음 |
| `public/css/components.css` | 신규 생성 | 없음 |
| `index.html` `<style>` | 삭제 + link 교체 | 중간 — 셀렉터 충돌 주의 |

---

## Phase 3 — Event / Pick 화면 디자인 적용

**목표:** 가장 노출 빈도 높은 두 화면을 핸드오프 기준으로 재구현

### 핸드오프 기준 파일

- `docs/design_handoff_picktagon/screens/screen-event.html`
- `docs/design_handoff_picktagon/screens/screen-home.html` (Pick 탭 포함)

### 작업 범위

1. **Event 화면** — 파이트 카드 목록 레이아웃 교체  
   - 매치업 카드: 현재 스타일 → `--pt-bg-2`, `--pt-line-1`, 코너 컬러 반영  
   - 섹션 헤더: `.sx-head` 패턴 적용  
   - 승률 바: 핸드오프 레드/블루 그라디언트

2. **Pick 화면** — 배팅/픽 UI 업데이트  
   - `api/supabase.js:383` `stats: []` 하드코딩 수정 (레이더 차트 빈값 버그)  
   - 픽 카드 레이아웃 핸드오프 기준 재정렬

### 영향 파일

| 파일 | 변경 유형 | 위험도 |
|---|---|---|
| `index.html` (Event 섹션) | CSS 클래스 + 마크업 수정 | 중간 |
| `index.html` (Pick 섹션) | CSS 클래스 + 마크업 수정 | 중간 |
| `public/js/api/supabase.js:383` | `stats: []` 수정 | 낮음 |

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

| 항목 | 설명 |
|---|---|
| **폰트 로딩** | Barlow / Bebas Neue Google Fonts 의존 — 오프라인/느린 네트워크 시 폴백 필요 |
| **색상 미세 차이** | `#e8000d` vs `#E10600` — 시각적으로 동일하나 hex 다름. Phase 1 이후 일괄 교체 |
| **Pretendard** | `screen-shell.css`가 `'Pretendard'` body font 사용 → tokens.css는 `'Barlow'`. 실제 앱에선 Pretendard 유지 or Barlow로 통일 결정 필요 |
| **JS 클래스 참조** | `public/js/*.js` 파일들이 DOM 클래스명을 직접 참조하는 경우 마크업 변경 시 동반 수정 필요 |
| **index.html 6,447줄** | 단일 파일이라 회귀 테스트 범위 넓음 — Phase별 작은 단위 커밋 필수 |

---

## 진행 현황

| Phase | 상태 | 브랜치 커밋 |
|---|---|---|
| Phase 1: Tokens 도입 | **완료** | `Refactor: Add design tokens bridge` |
| Phase 2: 공통 CSS 분리 | 대기 | — |
| Phase 3: Event/Pick 적용 | 대기 | — |
| Phase 4: Home/Profile/Leaderboard | 대기 | — |
| Phase 5: Community/News/Admin | 대기 | — |

---

*최초 작성: 2026-05-23*
