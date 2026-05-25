# Phase 7A — Tailwind CDN → npm Migration Plan

**작성일:** 2026-05-25  
**기준 커밋:** `4938e0d`  
**목적:** `cdn.tailwindcss.com` 의존성 제거, Vite 빌드 파이프라인에 Tailwind를 통합한다.

---

## 1. 현재 상태 분석

### 1-1. Tailwind 로딩 방식

```html
<!-- index.html line 7 -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- line 16-20: inline config -->
<script>
tailwind.config = {
  theme: { extend: {
    colors: { dark:'#080808', ufcRed:'#E10600', ufcBlue:'#2563eb', gold:'#f59e0b' },
    fontFamily: { barlow:['Barlow Condensed','sans-serif'], inter:['Inter','sans-serif'], oswald:['Oswald','sans-serif'] }
  }}
}
</script>
```

CDN JIT 방식: 브라우저가 `<script>` 를 실행한 뒤 DOM을 스캔해 필요한 CSS를 동적으로 `<style>` 태그로 주입한다. **런타임 생성** → build output에 포함되지 않음 → 별도 번들 없이 `dist/index.html`에 Tailwind CSS가 없다.

### 1-2. 사용 규모 (정적 분석 기준)

| 파일 | Tailwind 클래스 포함 라인 수 |
|---|---|
| `index.html` | 6,301줄 중 대부분 |
| `public/js/fights-render.js` | 31개 `classList`/`className` 사용 |
| `public/js/admin.js` | 192개 |
| `public/js/profile.js` | 72개 |
| `public/js/community.js` | 9개 |
| `public/js/news.js` | 13개 |

### 1-3. 사용 패턴별 분류

#### 커스텀 컬러 (다수 사용)
| 클래스 | 카운트 | 특이사항 |
|---|---|---|
| `text-ufcRed` | 81 | config `extend.colors.ufcRed` 필요 |
| `border-ufcRed` | 88 | |
| `bg-ufcRed` | 40 | |
| `border-ufcRed/30`, `/50` 등 | 36 | opacity modifier — v3 JIT ✓ |
| `text-ufcBlue`, `border-ufcBlue` | 14 | |
| `bg-ufcRed/10`, `/15` 등 | 16 | |

#### Arbitrary values (다수 사용)
| 패턴 | 카운트 | 비고 |
|---|---|---|
| `text-[10px]` | 143 (HTML+JS) | 가장 많음 |
| `text-[9px]` | 101 | |
| `text-[8px]` | 73 | |
| `rounded-[2rem]`, `[2.5rem]`, `[4rem]` 등 | 34 | |
| `tracking-[0.3em]`, `[0.25em]` 등 | 22 | |
| `max-w-[1440px]`, `max-h-[92vh]` 등 | 20 | |
| `text-[clamp(3.2rem,10vw,8rem)]` | 1 | CSS clamp |
| `text-[12vw]` | 1 | viewport unit |
| `shadow-[0_0_20px_rgba(255,255,255,0.2)]` | 2 | 긴 arbitrary shadow |

→ **282건+** arbitrary value 클래스. CDN JIT에서 자동 처리 중. npm 전환 후 동일하게 처리 가능 (Tailwind v3 JIT 동일 지원).

#### Responsive prefixes
`lg:`, `xl:`, `sm:`, `md:` — 광범위 사용 (lg 단독 100+건). 모두 content 스캔에서 감지됨.

#### 플러그인 필요 클래스
| 클래스 | 위치 | 필요 플러그인 |
|---|---|---|
| `scrollbar-hide` | `index.html` line 757 (`#division-tabs`) | `tailwindcss-scrollbar-hide` |

#### JS 동적 클래스 (스캔 위험 항목)
```javascript
// fights-render.js — 조건부 클래스, 양쪽 값이 리터럴 → 스캔 가능
`fc-my-pick ${isLeft ? 'fc-pick-red' : 'fc-pick-blue'}`  // custom CSS만, Tailwind 없음
`${isMain ? 'text-xl lg:text-3xl' : 'text-lg lg:text-2xl'}`  // 리터럴 → 스캔 ✓
`${rank<=3 ? \`border-l-4 lb-row-top${rank}\` : ''}`          // border-l-4 리터럴 ✓, lb-row-topN custom CSS

// admin.js — 색상 클래스가 문자열 리터럴
'text-ufcRed'
'border-emerald-500/20 bg-emerald-500/5'
'border-amber-500/20  bg-amber-500/5'
```

⚠️ **주의**: 동적으로 구성되는 Tailwind 클래스 (`text-${size}`, `bg-${color}` 형태)는 스캐너가 감지 못함. 현재 코드에서 이 패턴은 없지만, 스캔 후 누락 여부를 반드시 확인해야 함.

### 1-4. CSS 레이어 스택 (현재)

```
① tokens.css          (loaded via <link>, first)
② theme-bridge.css    (loaded via <link>)
③ app.css             (loaded via <link>)
④ index.html <style>  (inline, DOM parse 후 적용)
⑤ Tailwind CDN JIT    (<script> 실행 → 마지막에 <style> 주입)
```

현재 ⑤ CDN Tailwind가 **마지막**에 주입되므로 동일 specificity에서 Tailwind가 이긴다.  
Phase 3~6에서 app.css 규칙들이 `#id .class` (1,1,0) 이상의 specificity를 사용한 이유가 이것이다.

### 1-5. 빌드 환경

| 항목 | 현재 값 |
|---|---|
| Vite | 5.4.21 |
| dependencies | `@google/generative-ai ^0.24.1` |
| devDependencies | `vite ^5.0.0` |
| PostCSS config | 없음 |
| Tailwind config | 없음 (`tailwind.config.js` 미생성) |
| dist tracked | ✅ `.gitignore`에 `dist/` 미포함, 22개 파일 tracked |

---

## 2. 전환 목표 (Target State)

```
① tokens.css           <link> — unchanged
② theme-bridge.css     <link> — unchanged
③ tailwind.css (new)   <link> — Vite가 PostCSS 통해 빌드 시 처리
④ app.css              <link> — unchanged, but AFTER tailwind.css
⑤ index.html <style>   inline — unchanged
```

- CDN `<script>` 제거, `<script>tailwind.config=...` 인라인 제거
- `tailwind.config.js` 생성 (커스텀 colors/fonts 포함)
- `postcss.config.cjs` 생성 (tailwindcss + autoprefixer)
- `src/tailwind.css` 생성 (`@tailwind base/components/utilities`)
- `package.json` devDependencies 추가
- Specificity 순서 변화: ④ app.css가 ③ Tailwind 이후에 로드 → **app.css가 동일 specificity에서 자연스럽게 이김**

---

## 3. 설치 및 설정

### 3-1. npm install

```bash
npm install -D tailwindcss@3 postcss autoprefixer
npm install -D tailwindcss-scrollbar-hide
```

Tailwind v3 선택 이유:
- 현재 CDN JIT가 v3 기반 → 동작 방식 동일, 마이그레이션 리스크 최소
- v4는 CSS-first config, `@apply` 변경 등 파괴적 변경 많음
- `scrollbar-hide` 등 v3 플러그인 생태계 성숙

### 3-2. tailwind.config.js (프로젝트 루트)

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        dark:    '#080808',
        ufcRed:  '#E10600',
        ufcBlue: '#2563eb',
        gold:    '#f59e0b',
      },
      fontFamily: {
        barlow: ['Barlow Condensed', 'sans-serif'],
        inter:  ['Inter', 'sans-serif'],
        oswald: ['Oswald', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('tailwindcss-scrollbar-hide'),
  ],
}
```

**content 경로 주의:**
- `./index.html` — 정적 클래스 모두 포함
- `./public/js/**/*.js` — 동적 클래스 문자열 포함 (admin.js 192건, fights-render.js 31건 등)
- `docs/` — 제외 (markdown은 클래스 사용 없음)

### 3-3. postcss.config.cjs (프로젝트 루트)

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

> ESM 환경에서 `.cjs` 확장자 사용. `package.json`에 `"type": "module"` 없으므로 `.js`도 가능하나 `.cjs` 권장.

### 3-4. src/tailwind.css (신규 생성)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

이 파일을 Vite root 상대 경로로 `index.html`에 링크하면 빌드 시 PostCSS 처리.

### 3-5. index.html 변경

**제거:**
```html
<!-- 제거 -->
<script src="https://cdn.tailwindcss.com"></script>
```

```html
<!-- 제거 (inline tailwind.config) -->
<script>
tailwind.config = { ... }
</script>
```

**추가/변경:**
```html
<!-- tokens/bridge 뒤, app.css 앞에 삽입 -->
<link href="/src/tailwind.css" rel="stylesheet">
<link href="/css/app.css" rel="stylesheet">
```

최종 `<head>` CSS 로딩 순서:
```html
<link href="/css/tokens.css" rel="stylesheet">
<link href="/css/theme-bridge.css" rel="stylesheet">
<link href="/src/tailwind.css" rel="stylesheet">   <!-- NEW -->
<link href="/css/app.css" rel="stylesheet">
```

---

## 4. Specificity 변화 분석

### 4-1. 현재 vs 전환 후

| 시나리오 | 현재 (CDN) | 전환 후 (npm) |
|---|---|---|
| Tailwind vs app.css (동일 specificity) | CDN 주입이 나중 → **Tailwind 승** | app.css가 나중 → **app.css 승** |
| app.css `#id .class` (1,1,0) vs Tailwind (0,1,0) | app.css 승 | app.css 승 (변화 없음) |
| inline style vs app.css | inline 승 | inline 승 (변화 없음) |

### 4-2. 영향도 평가

Phase 3~6에서 app.css 규칙을 모두 `#id .class` (1,1,0) 이상으로 강화했다.  
전환 후 동일 specificity 충돌이 **app.css 방향으로 바뀌는 것**은 오히려 의도된 방향이다.

**잠재 시각 변화 영역:**
- Tailwind `hover:` 유틸리티가 app.css base style 위에 있었던 경우: 전환 후 Tailwind hover가 app.css 뒤에서 주입되지 않으므로 CSS 파일 순서상 app.css 이전 → hover가 우선순위 잃을 수 있음
- 단, hover pseudo-class는 (0,2,0) specificity라 base app.css (0,1,0)보다 높음 → 일반적으로 문제 없음
- 실제 회귀는 **반드시 브라우저 QA로 확인** 필요

### 4-3. app.css 경감 기회 (전환 후 후속 작업)

전환 성공 후, Phase 3~6에서 specificity를 높인 규칙들 중  
Tailwind CDN 방어용이었던 것들은 낮출 수 있다.  
예: `#fight-cards-container .fc-pick-bar` → `.fc-pick-bar` 가능할 수 있음.  
→ 이는 별도 cleanup phase에서 진행.

---

## 5. 리스크 매트릭스

| 리스크 | 심각도 | 가능성 | 완화 방법 |
|---|---|---|---|
| 동적 클래스 스캔 누락 | 높음 | 중간 | build 후 브라우저 QA, `safelist` 추가 |
| `scrollbar-hide` 누락 | 중간 | 낮음 | 플러그인 설치 확인 |
| arbitrary value 일부 누락 | 중간 | 낮음 | JIT 동일 엔진 — 빌드 후 diff 확인 |
| Specificity 순서 변화 → 시각 회귀 | 중간 | 중간 | CSS order 분석 + 브라우저 QA |
| build 시간 증가 | 낮음 | 높음 | 허용 범위 (Vite fast build) |
| dist tracked → diff 폭증 | 낮음 | 높음 | 전환 커밋에 dist 포함 → 1회성 large diff |
| Tailwind base reset이 기존 스타일 오버라이드 | 중간 | 중간 | `@tailwind base` → `preflight` 비활성화 고려 |

### 5-1. `@tailwind base` (Preflight) 주의

`@tailwind base`에는 브라우저 기본 스타일을 리셋하는 **Preflight**가 포함된다.  
현재 CDN JIT도 Preflight를 주입하므로 기술적으로 동일하지만,  
`public/css/app.css`의 base 스타일과 Preflight의 관계를 확인해야 한다.

만약 Preflight 충돌이 발생하면:
```javascript
// tailwind.config.js에서 비활성화
corePlugins: {
  preflight: false,
},
```

### 5-2. `safelist` 후보

빌드 후 누락이 발견되면 다음 패턴을 safelist에 추가:
```javascript
safelist: [
  { pattern: /^(text|bg|border)-(ufcRed|ufcBlue|gold)/ },
  { pattern: /^text-\[(8|9|10|11)px\]/ },
  // 브라우저 QA에서 발견된 누락 클래스 추가
],
```

---

## 6. dist 정책 결정

현재 `dist/` 22개 파일이 git tracked.

### 선택지

| 옵션 | 설명 | 장점 | 단점 |
|---|---|---|---|
| A. 유지 | 현행 그대로 dist tracked | 배포=checkout, 추가 CI 불필요 | diff 지속 증가, 생성물 저장소에 혼재 |
| B. 제거 | `dist/` gitignore + rm --cached | 저장소 clean, 표준 관행 | 배포 전 로컬 build 필요, CI/CD 셋업 필요 |
| C. 전환 후 결정 | 7A 전환 시 B와 병행 | 한 번에 정리 | 단일 커밋에 변경사항 집중 |

**권장: 옵션 C** — Tailwind 전환 커밋에서 함께 처리.

```bash
# 전환 시 함께 실행
echo "dist/" >> .gitignore
git rm -r --cached dist/
```

이후 배포는 `npm run build` → `dist/` 수동 복사 또는 CI/CD 구성.

---

## 7. 마이그레이션 실행 순서

### Step 1: 의존성 설치
```bash
npm install -D tailwindcss@3 postcss autoprefixer tailwindcss-scrollbar-hide
```

### Step 2: Config 파일 생성
- `tailwind.config.js` — colors, fonts, content paths, plugins
- `postcss.config.cjs` — tailwindcss + autoprefixer

### Step 3: CSS entry 생성
```bash
mkdir -p src
# src/tailwind.css 생성: @tailwind base/components/utilities
```

### Step 4: index.html 수정
- `<script src="https://cdn.tailwindcss.com">` 제거
- `<script>tailwind.config = {...}</script>` 제거
- `<link href="/src/tailwind.css" rel="stylesheet">` 추가 (app.css 앞)

### Step 5: 빌드 테스트
```bash
npm run build
# dist/ 확인 — Tailwind CSS가 포함된 번들 생성되는지
```

### Step 6: 브라우저 QA (반드시 필요)

주요 확인 항목:
- [ ] ufcRed / ufcBlue 커스텀 컬러 정상 적용
- [ ] `text-[10px]`, `text-[9px]` arbitrary size 정상
- [ ] `bg-ufcRed/30`, `border-ufcRed/50` opacity modifier 정상
- [ ] `scrollbar-hide` 동작 (`#division-tabs`)
- [ ] `rounded-[2rem]`, `shadow-[...]` arbitrary 정상
- [ ] 반응형 `lg:`, `sm:` 동작
- [ ] 동적 클래스 (fights-render.js, admin.js) 모두 적용
- [ ] Preflight 충돌 없음 (base reset 확인)
- [ ] 기존 app.css 스타일 회귀 없음

### Step 7: dist 정책 적용 (옵션 C)
```bash
echo "dist/" >> .gitignore
git rm -r --cached dist/
```

### Step 8: 커밋
```
Build: Migrate Tailwind CDN to npm
```

---

## 8. 예상 빌드 결과

| 항목 | CDN 방식 | npm 방식 |
|---|---|---|
| 네트워크 요청 | `cdn.tailwindcss.com` 외부 요청 1회 | 없음 (번들 포함) |
| dist CSS 크기 | app.css 약 25KB (gzip ~5KB) | app.css + compiled Tailwind (~20-40KB gzip 예상) |
| 빌드 시간 | Vite 만 (~350ms) | PostCSS 추가 (~500-800ms 예상) |
| 런타임 스캔 | 있음 (DOMContentLoaded 후 JIT 스캔) | 없음 (build time 처리) |
| 오프라인 동작 | CDN 불가 시 스타일 없음 | 완전 오프라인 가능 |

---

## 9. 전환 후 후속 작업 (Phase 7A-2)

Phase 7A(전환) 성공 확인 후:

1. **CSS specificity 경감**: app.css에서 CDN 방어용 `#id` prefix 제거 가능 여부 검토
2. **dist gitignore 적용**: 배포 파이프라인 연결 (Vercel/Netlify/GH Actions)
3. **tailwind.config.js 확장**: 현재 arbitrary value를 theme token으로 흡수 (`text-[10px]` → `text-2xs` custom size 등)
4. **`@tailwind base` preflight 정책 확정**: 현재 스타일과 충돌 여부 기록

---

## 10. 롤백 계획

전환 실패 시:
```bash
# 커밋 되돌리기 (revert 방식 — force push 금지)
git revert <migration-commit-hash>
# 즉시 CDN 방식 복원
```

CDN 방식은 index.html의 `<script>` 한 줄이므로 롤백이 매우 쉽다.  
전환 커밋은 반드시 단일 atomic commit으로 진행.

---

## 11. 연관 문서

- [`docs/PHASE6_VISIBLE_DESIGN_CLOSEOUT.md`](PHASE6_VISIBLE_DESIGN_CLOSEOUT.md) — Phase 6 현황 및 기술부채
- [`docs/DESIGN_REFACTOR_PLAN.md`](DESIGN_REFACTOR_PLAN.md) — 전체 진행 현황
- [`docs/QA_RUN_2026-05-24_BROWSER_DESIGN.md`](QA_RUN_2026-05-24_BROWSER_DESIGN.md) — 브라우저 QA 기준

---

## 12. Phase 7B 실행 결과 (2026-05-25)

**커밋:** `Refactor: Replace Tailwind CDN with build pipeline`  
**기준 커밋:** `4938e0d` (Phase 7A doc)

### 실행 요약

| 단계 | 결과 |
|---|---|
| `npm install -D tailwindcss@3.4.19 postcss autoprefixer` | 설치 완료 |
| `npm install -D tailwind-scrollbar-hide@4.0.0` | 설치 완료 (주의사항 아래 참고) |
| `tailwind.config.js` 생성 | 완료 |
| `postcss.config.cjs` 생성 | 완료 |
| `src/tailwind.css` 생성 | 완료 |
| `index.html` CDN `<script>` 제거 + `<link>` 추가 | 완료 |
| `.gitignore`에 `dist/` 추가 | 완료 |
| `git rm -r --cached dist/` | 완료 (22개 파일 untrack) |
| `npm run build` | **통과** — `dist/assets/index-*.css` 50.16 kB / 8.77 kB gzip |

### 계획 대비 실제 변경 사항

**`tailwind-scrollbar-hide` v4 ESM 호환성 이슈:**  
`tailwind-scrollbar-hide@4.0.0`은 ESM-only (`export default`) — CJS `require()` 방식의 `tailwind.config.js`에서 직접 `require` 불가.  
→ 해결: 플러그인 로직을 `tailwind.config.js`에 직접 인라인 (20줄, `tailwindcss/plugin` 사용).

**`preflight` 비활성화:**  
Phase 7A 계획에서 "충돌 시 고려"였던 `corePlugins.preflight: false`를  
Phase 7B 실행 시 선제적으로 적용. 기존 `app.css`의 base reset과 충돌 방지.

**`index.html` link href 형식:**  
계획서의 `/src/tailwind.css` (절대 경로) 대신 `./src/tailwind.css` (상대 경로) 사용.  
Vite dev server에서 상대 경로가 프로젝트 루트 기준으로 처리됨 — 동작 동일.

### 빌드 결과 검증

| 항목 | 계획 예측 | 실제 결과 |
|---|---|---|
| CSS 번들 크기 | ~20-40KB gzip 예상 | 50.16 kB raw / **8.77 kB gzip** ✓ |
| `text-ufcRed` | 컴파일 포함 예상 | 26 hits in compiled CSS ✓ |
| `scrollbar-hide` | 플러그인 필요 | 2 hits in compiled CSS ✓ |
| `text-[10px]`, `[9px]`, `[8px]` | arbitrary value 포함 | compiled CSS에 포함 ✓ |
| `border-ufcRed\/50`, `bg-ufcRed\/10` | opacity modifier | compiled CSS에 포함 ✓ |
| `clamp()`, `hidden`, `flex`, `grid` | 기본 유틸리티 | compiled CSS에 포함 ✓ |
| cascade 위치 (dist) | head 말미 예상 | `dist/index.html` line 420 (</head> 전) ✓ |

### 완료 기준

- [x] Tailwind CDN `<script>` 제거 (`index.html`)
- [x] inline `tailwind.config` 스크립트 제거 (`index.html`)
- [x] `tailwind.config.js` 생성 (scrollbar-hide 인라인 포함)
- [x] `postcss.config.cjs` 생성
- [x] `src/tailwind.css` 생성
- [x] `npm run build` 통과 — 50.16 kB / 8.77 kB gzip
- [x] `dist/` git 추적 제외 (`.gitignore` + `git rm --cached`)
- [x] docs 업데이트
- [x] 커밋: `Refactor: Replace Tailwind CDN with build pipeline`

### 후속 확인 필요 (브라우저 QA)

- [ ] 전체 UI 시각 회귀 없음 확인 (ufcRed 컬러, arbitrary sizes, responsive breakpoints)
- [ ] `scrollbar-hide` 동작 확인 (`#division-tabs`)
- [ ] Preflight 비활성화 — 기존 reset과 충돌 없음 확인
- [ ] Specificity 순서 변화 → app.css 규칙 정상 우선 확인
