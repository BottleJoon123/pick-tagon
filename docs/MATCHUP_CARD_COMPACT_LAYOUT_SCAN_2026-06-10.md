# Matchup Card Compact Layout — Feasibility Scan
스캔 일자: 2026-05-26  
대상 커밋: 6e7ba3f  
데드라인: 공개 출시 2026-06-10 / 기능 동결 2026-06-07

---

## 1. 현재 구조 요약

### 1-1. 컨테이너 계층
```
<section id="matchups" class="max-w-[1440px] mx-auto ...">
  <div class="flex gap-6 lg:gap-8 items-start">
    <div class="flex-1 min-w-0">                         ← 메인 컬럼 (flex-1)
      <div id="fight-cards-container"
           class="space-y-6 lg:space-y-8">              ← 카드 스택 (단일 컬럼)
        <!-- section headers + cards -->
      </div>
      <div class="mt-16 lg:mt-24">                       ← event leaderboard
    </div>
    <aside class="...">                                  ← UFC 일정 사이드바 (lg 이상 표시)
  </div>
</section>
```

메인 컬럼 실효 너비:
- 1440px 뷰포트: 사이드바(~200px) + gap(32px) 제외 → 약 **1160px**
- 1280px 뷰포트: 약 **1010px**
- 모바일: 사이드바 없음 → `100vw - 32px`

### 1-2. 카드 유형

#### Hero Card (메인 카드 섹션, `fight.sectionLabel === '메인 카드'`)
`renderHeroCard()` in `public/js/fights-render.js:69`

| 요소 | 상세 |
|---|---|
| 최소 높이 | MAIN: `320px`, CO-MAIN: `280px` (inline style) |
| 파이터 이미지 | `absolute inset-y-0 left/right-0 w-1/2` — 카드 폭에 종속 |
| 커뮤니티 픽 바 | `px-5 lg:px-10 py-4` 블록 |
| MY PICK 배너 | `id="my-pick-${id}"` — JS가 className 주입 |
| Stats Overlay | `z-40`, `hidden/visible` 토글 — 카드 내부 relative flow |
| Analysis 패널 | 4탭 (차트/스탯/분석/최근전적), 레이더 차트 `height:260px max-w-md` |
| Settled 배지 | 카드 하단 border-top 영역 |
| onclick 위임 | 카드 전체 클릭 → `openPickSlipFromCard`, `data-no-pick` 예외 처리 |

#### Strip Row (프렐림/얼리 프렐림)
`renderStripRow()` in `public/js/fights-render.js:211`

| 요소 | 상세 |
|---|---|
| 높이 | 약 70~80px (flex row, 썸네일 `h-14`) |
| 파이터 썸네일 | `w-10 h-14 rounded-lg`, `background-size:cover` |
| 픽 바 | 상단 `h-1` 얇은 바만 |
| Stats/Analysis | **없음** |
| onclick | 카드 전체 → `openPickSlipFromCard` |

#### Section Header
`renderSectionHeader()` in `public/js/fights-render.js:29`

```javascript
_html += renderSectionHeader(fight, idx);  // 카드 HTML과 같은 _html에 인라인 삽입
container.innerHTML = _html;               // 단일 innerHTML 할당
```

**핵심 제약**: 섹션 헤더는 CSS grid 컨텍스트에서 **별도 grid item**으로 취급된다.  
현재 코드 구조상 `col-span-all`을 JS 쪽에서 처리하지 않으면, 2열 grid 적용 시 헤더가 첫 번째 열만 차지한다.

### 1-3. CSS Phase별 규칙

| Phase | 파일:줄 | 내용 |
|---|---|---|
| Phase 3A | `app.css:277` | `.glass-card` background/border 토큰 오버라이드 |
| Phase 6C | `app.css:573` | `.fc-pick-bar`, `.fc-strip-card .fc-red/blue-side`, `.fc-card-pending/settled`, `.fc-my-pick`, `.fc-pick-red/blue`, `.fc-settled-win/lose` |
| Phase 6C-2 | `app.css:772` | `.fc-hero-img-l/r` filter (brightness/contrast) |

모두 `#fight-cards-container` 하위 스코프 — grid 전환 시 영향 없음.

---

## 2. 옵션별 분석

### Option A — 현행 유지 (`space-y-6 lg:space-y-8`)

**변경**: 없음  
**리스크**: 없음  
**효과**: 없음 (세로 스크롤 길이 유지)

---

### Option B — Desktop-only 2열 grid

**변경 범위**:

#### (B-1) CSS only 시도
```css
/* app.css 추가 */
@media (min-width: 1024px) {
  #fight-cards-container {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
    align-items: start;
  }
}
```

이것만으로는 **P1 결함 2건 발생**:

**P1-A: 섹션 헤더 컬럼 스팬 불가**  
`renderSectionHeader()` HTML이 일반 grid item이 되므로 첫 번째 열만 차지.  
"메인 카드", "프렐림" 레이블이 카드 왼쪽에만 부착되어 레이아웃 파손.  
→ 해결하려면 `renderFightCards()` JS 수정 필요 (`col-span-2` wrapper 추가).

**P1-B: Hero 카드와 Strip 카드 높이 혼재**  
`min-height:320px` Hero 카드 옆에 `~70px` Strip 카드가 나란히 배치됨.  
`align-items:start` 적용해도 시각적 불균형이 뚜렷함.  
→ 해결하려면 사용 가능한 방법:
- (a) 메인 카드는 `col-span-2` 유지, 프렐림만 2열 — JS에서 sectionLabel 분기 필요
- (b) 아예 hero/strip 컨테이너 분리 — `renderFightCards()` 구조 변경 필요

#### (B-2) 올바른 구현 (JS + CSS)
```javascript
// renderFightCards() 수정 예시
let _heroHtml = '', _prelimHtml = '';
fights.forEach((fight, idx) => {
    if (fight.sectionLabel === '메인 카드') {
        if (fight.sectionLabel !== _lastMainSection) {
            _heroHtml += renderSectionHeader(fight, 0);
            _lastMainSection = fight.sectionLabel;
        }
        _heroHtml += renderHeroCard(fight, idx);
    } else {
        if (fight.sectionLabel !== _lastPrelimSection) {
            // col-span-2 섹션 헤더 필요
            _prelimHtml += `<div class="lg:col-span-2">${renderSectionHeader(fight, idx)}</div>`;
            _lastPrelimSection = fight.sectionLabel;
        }
        _prelimHtml += renderStripRow(fight);
    }
});
container.innerHTML = `
  <div class="space-y-6 lg:space-y-8">${_heroHtml}</div>
  <div class="grid lg:grid-cols-2 gap-4">${_prelimHtml}</div>
`;
```

**추가 위험 항목**:

| 기능 | 위험도 | 상세 |
|---|---|---|
| `openPickSlip` | 낮음 | DOM ID 기반, 컨테이너 구조 무관 |
| Stats Overlay | 낮음 | `z-40`, 카드 내부 relative — 폭 변화만 영향 |
| Analysis 탭 | **중간** | 레이더 차트 `max-w-md / height:260px`. 카드 폭 ~550px로 줄면 chart가 cramped, canvas resize 이슈 가능성 (`responsive:true, maintainAspectRatio:false` 설정이므로 크리티컬은 아님) |
| 파이터 이미지 | **중간** | `background-size:auto 90%` — 카드 폭 ~550px에서 이미지가 잘려 보일 수 있음. 1440px에서는 Hero card 폭 1160px였는데 550px로 반감. 인물 이미지 프레이밍 회귀 가능 |
| `updateLivePickBar` | 낮음 | `id` 기반, 레이아웃 무관 |
| `updateAllFightCards` | 낮음 | `id` 기반, 레이아웃 무관 |
| `initRadarChart` | **중간** | Chart.js `canvas` resize. 레이아웃 변경 후 탭 open 시 `canvas.getBoundingClientRect()` 재측정 — `setTimeout(..., 100)` 이미 있으므로 대체로 안전하나 확인 필요 |
| MY PICK 배너 | 낮음 | `flex`/`truncate` 기반, 폭 축소 시 텍스트 truncate 증가 (허용 범위) |
| Settled 배지 | 낮음 | `text-center` 기반, 폭 무관 |
| 모바일 375px | 없음 | `lg:` 조건부, 모바일 레이아웃 변화 없음 |

**전체 변경 범위**:
- `renderFightCards()` 구조 분기 (~20줄 추가)
- `renderSectionHeader()` 수정 또는 호출 측에서 wrapper 추가
- `app.css` 추가 (~6줄)
- 브라우저 QA: 1440px/1280px, Analysis 탭 오픈 후 레이더 차트, 파이터 이미지 프레이밍, Stats Overlay z-index, MY PICK/Settled 표시 확인

---

### Option C — Compact variant (gap/padding 축소만)

**변경 범위**:

```css
/* app.css 1줄 변경 */
/* 현재: class="space-y-6 lg:space-y-8" — inline Tailwind (HTML 수정 필요) */
```

또는 HTML에서:
```html
<!-- 변경 전 -->
<div id="fight-cards-container" class="space-y-6 lg:space-y-8">
<!-- 변경 후 -->
<div id="fight-cards-container" class="space-y-4 lg:space-y-5">
```

추가 선택사항 (Hero 카드 min-height 축소):
```javascript
// fights-render.js renderHeroCard() 124번 줄
// 변경 전: min-height:${isMain ? '320px' : '280px'}
// 변경 후: min-height:${isMain ? '260px' : '220px'}
```

**효과**: 카드 간 간격 24px → 16px 절감. Hero 카드 60px 단축.  
8개 프렐림 + 2개 Hero 기준: 총 세로 길이 약 **200~350px 감소** (전체의 10~15%).  
"세로로 너무 길다"는 체감 개선 효과는 제한적.

**리스크**: 거의 없음.  
- `space-y-*` 변경: CSS-only, 기능 무관  
- `min-height` 변경: 파이터 이미지 프레이밍 재확인 필요 (이미지 `background-position: 60% bottom` — 높이 축소 시 인물 하단 잘릴 수 있음)

---

### Option D — 출시 후 재설계 (Phase 8)

**변경**: 없음 (현 출시 범위 외)

디자인 handoff 후 별도 Phase에서:
- 메인 카드: 전체 너비 hero 유지
- 프렐림: 2열 strip grid
- 섹션 헤더: `col-span-2` wrapper
- 파이터 이미지: 새 폭 기준으로 background-size/position 재조정
- 레이더 차트: 탭 열림 시 `chart.resize()` 명시 호출

---

## 3. 기능별 회귀 위험 매트릭스

| 기능 경로 | A(유지) | B(2열) | C(compact) |
|---|---|---|---|
| openPickSlip | ✅ | ✅ | ✅ |
| Stats Overlay toggle | ✅ | ⚠️ z-index 확인 필요 | ✅ |
| Analysis 4탭 | ✅ | ⚠️ radar chart 폭 | ✅ |
| Pending pick 상태 | ✅ | ✅ | ✅ |
| Settled pick 상태 | ✅ | ✅ | ✅ |
| Community pick bar | ✅ | ✅ | ✅ |
| 파이터 이미지 프레이밍 | ✅ | ⚠️ 폭 50% 축소 | ⚠️ 높이 축소 |
| 섹션 헤더 표시 | ✅ | ❌ P1 (JS 수정 필요) | ✅ |
| 모바일 375px | ✅ | ✅ | ✅ |
| 모바일 430px | ✅ | ✅ | ✅ |
| updateLivePickBar | ✅ | ✅ | ✅ |
| Event Leaderboard | ✅ | ✅ | ✅ |

---

## 4. Desktop / Mobile 영향

### Desktop 1440px

현재 Hero 카드 폭: **~1160px** (메인 컬럼 flex-1)  
Option B 2열 적용 시 Hero 카드 폭: **~564px** (gap 32px 제외)

파이터 이미지 `background-size: auto 90%`:
- 1160px → 564px: 이미지 높이 고정 90%, 폭이 좁아지므로 배경이 center 위치 기준으로 양쪽 더 잘림
- `background-position: 60% bottom` (F1) / `40% bottom` (F2) — 얼굴/상체 프레이밍 재확인 필요

### Desktop 1280px

메인 컬럼 폭 ~1010px → 2열 시 ~488px. 더 tight.

### Mobile 375px / 430px

`lg:grid-cols-2` 조건이라면 **변화 없음**. `space-y-4` 변경만 적용.

---

## 5. Release Deadline 관점 판단

기능 동결: **2026-06-07 night** (현재로부터 12일)  
공개 출시: **2026-06-10** (현재로부터 15일)

### Option B 소요 예상

| 작업 | 시간 |
|---|---|
| JS 리팩토링 (`renderFightCards` 분기) | 1~2h |
| CSS 추가 | 0.5h |
| 브라우저 QA (1440/1280/375, 각 탭·오버레이 확인) | 1~2h |
| Playwright 회귀 스크립트 | 0.5h |
| 버그 수정 여유 | 1h |
| **합계** | **4~6h** |

P0/P1 발생 시 롤백 결정 포함 시 **최대 1일**.  
기능 동결 전 진행은 가능하나, openPickSlip·Stats·Analysis 경로에 ⚠️ 항목이 존재하므로 **출시 전 도입 비추천**.

### Option C 소요 예상

| 작업 | 시간 |
|---|---|
| HTML 1줄 수정 + (선택) JS 1줄 수정 | 15분 |
| 브라우저 확인 | 30분 |
| **합계** | **~45분** |

리스크: P3 수준. 기능 동결 전 진행 가능 → **P2 quick-win 후보**.

---

## 6. 추천안

### 출시 전 (2026-06-07 이전)

**Option C — Compact gap/padding 축소** (P2 quick-win)

```html
<!-- index.html ~380번 줄, 변경 1줄 -->
<div id="fight-cards-container" class="space-y-4 lg:space-y-5">
```

선택적 추가: `fights-render.js`의 Hero 카드 `min-height`를 `280px/240px`으로 축소.  
단, 파이터 이미지 등록 상태에 따라 프레이밍 확인 필요.

이 변경만으로도 카드 간 공백이 줄어 체감 밀도가 높아짐.  
기능 경로 회귀 없음.

### 출시 후 (Phase 8 이후)

**Option B — Hero 1열 유지 + 프렐림 2열 grid**

```javascript
// renderFightCards() 분리 구조
<div id="fc-hero-stack" class="space-y-6 lg:space-y-8">   /* 메인 카드 */
<div id="fc-prelim-grid" class="grid lg:grid-cols-2 gap-4"> /* 프렐림/얼리 */
```

섹션 헤더를 `lg:col-span-2` wrapper로 처리.  
레이더 차트 `resize()` 명시 호출 추가.  
파이터 이미지 background-size/position 1280px 기준으로 재조정.

---

## 7. 출시 전 진행 여부 결론

| 옵션 | 출시 전 진행 | 이유 |
|---|---|---|
| A (유지) | ✅ 가능 | 변경 없음 |
| B (2열 full) | ❌ 보류 | P1 섹션 헤더 + JS 리팩토링 필요, openPickSlip/Stats 경로 회귀 위험 |
| C (compact gap) | ✅ P2로 가능 | CSS/HTML 1줄, 기능 무관, 45분 작업 |
| D (재설계) | ❌ 출시 후 | 별도 Phase |

**최종 권고**: 출시 전에는 Option C만 진행. Option B는 Phase 8 (출시 후 첫 번째 UI 개선 사이클)에서 proper QA와 함께 진행.
