# Phase 6 — Visible Design Round Closeout

**작성일:** 2026-05-25  
**origin/main:** `2796614`  
**범위:** Phase 6A–6F + 6C-2 visible design upgrade (정적 코드 분석 기반, 브라우저 미확인)

---

## 개요

Phase 4~5B(토큰 적용 라운드)에서 CSS 변수 정렬을 완료한 뒤,  
Phase 6은 **시각적 임팩트 강화**를 목표로 한 두 번째 design 라운드다.  
각 화면의 핵심 요소에 gradient, glow, depth를 추가하고  
interaction 상태(hover/pending/settled/active)를 더 명확하게 만들었다.

---

## 커밋 이력

| 커밋 | 메시지 | Phase |
|---|---|---|
| `ea5c91f` | Style: Upgrade global navigation design | 6A |
| `763dad4` | Style: Upgrade home hero design | 6B |
| `ee14956` | Fix: Polish home hero QA findings | 6B-QA |
| `ce927b5` | Style: Upgrade event pick card design | 6C |
| `e499e16` | Fix: Polish event pick card QA findings | 6C-QA |
| `5c30a7e` | Style: Upgrade profile design | 6D |
| `6262113` | Fix: Polish profile visible QA findings | 6D-QA |
| `3cdf7bc` | Style: Upgrade leaderboard rankings design | 6E |
| `5aad312` | Fix: Polish leaderboard rankings QA findings | 6E-QA |
| `800de49` | Style: Upgrade community news design | 6F |
| `5e4dbb1` | Fix: Polish community news visible QA findings | 6F-QA |
| `c7d0989` | Style: Polish event pick card details | 6C-2 |
| `2796614` | Fix: Polish event pick detail QA findings | 6C-2-QA |

**선행 작업 (Phase 6 준비):**

| 커밋 | 메시지 |
|---|---|
| `7652b03` | Docs: Add browser QA for design refactor |
| `a42e5d3` | Style: Polish remaining section headers (P2 fix) |

---

## 화면별 변경 요약

### Phase 6A — Global Header / Nav

| 영역 | 변경 |
|---|---|
| Desktop nav backdrop | `blur(24px)` → `blur(12px) saturate(180%)` |
| Logo | 텍스트 → SVG octagon + `--pt-red-500` |
| Nav link 색상 | 미지정 → `--pt-ink-2` / hover `--pt-ink-0` |
| Active state | red underline → pill bg `--pt-bg-3` + white text |
| Points pill | glass-card pulse → amber `◆` `--pt-warn` |
| Bottom nav | `rgba(8,8,8,0.92)` → `rgba(7,8,10,0.94) saturate(180%)` |

### Phase 6B — Home Hero

| 영역 | 변경 |
|---|---|
| Hero section 배경 | `#080808` → `--pt-bg-1` |
| Stats pill | bg 명확화 + `--pt-ink-3` label |
| Event countdown | glass surface `--pt-bg-3` + `--pt-line-2` border |
| Fighter faceoff | top/bottom fade 명확화, fighter img framing 개선 |
| Home news card | hover glow `rgba(225,6,0,0.08)` + `--pt-red-500` border |
| Home ticker | `--pt-bg-3` surface + `--pt-line-1` border-y |

**6B-QA fix:** countdown unit `min-width: 64px` → `56px` mobile overflow 방지

### Phase 6C — Event/Pick Card

| 영역 | 변경 |
|---|---|
| `fc-pick-bar` | `--pt-bg-1` surface + `--pt-line-1` border |
| Strip row fc-red/blue-side | 2px 좌우 corner border tint |
| `fc-card-pending/settled` | `cursor: default !important` |
| MY PICK banner | `fc-pick-red/blue` gradient + colored border |
| `fc-settled-win` | `rgba(225,6,0,0.06)` + red border-top |
| `fc-settled-lose` | `--pt-bg-1` + `opacity: 0.7` |

**6C-QA fix:** `updateAllFightCards` — `myPickEl.style.background = ''` inline override 방지

### Phase 6C-2 — Event/Pick Detail Polish

| 영역 | 변경 |
|---|---|
| CTA `<p id="cta-l/r-{id}">` | ID 추가 → 상태별 텍스트: "CHANGE PICK ›" (pending picked side) / "" (settled) |
| Fighter image divs | `fc-hero-img-l/r` 클래스 → `brightness(1.18) contrast(1.04)` |
| Hero top fade | `rgba(8,8,8,0.75)` → `rgba(8,8,8,0.40)` — 얼굴 가시성 개선 |
| UFC 일정 패널 scrollbar | 4px dark thumb + `--pt-line-2`, hover red + Firefox fallback |

**6C-2-QA fix (P2):** `updateAllFightCards` reset 블록에 CTA 원복 로직 추가 — `supabase.js:500` 단독 호출 시 stale "CHANGE PICK ›" 잔존 버그 수정  
**6C-2-QA fix (P3):** `scrollbar-width: thin; scrollbar-color:` Firefox 지원 추가

### Phase 6D — Profile

| 영역 | 변경 |
|---|---|
| Profile hero card | `radial-gradient(55% 120% at 0% 60%, rgba(225,6,0,0.07))` |
| Hero `::before` | `background-image:` sub-property로 교체 (shorthand 리셋 방지) |
| Avatar wrap | `box-shadow: 0 0 24px rgba(225,6,0,0.20), 0 0 0 2px rgba(225,6,0,0.12)` |
| Belt tracker | current dot `#C39DF1` + label purple glow |
| My record card | `border-left: 3px solid rgba(225,6,0,0.35)` accent |
| Stat cards (공통) | `--pt-bg-3` surface 명확화 |

**6D-QA:** 코드 수정 불필요 (전체 PASS)

### Phase 6E — Leaderboard / Rankings

| 영역 | 변경 |
|---|---|
| `#my-rank-card` | radial-gradient left red + ring `!important` glow |
| `#my-rank-num` | `text-shadow` red glow |
| 테이블 헤더 | `--pt-bg-3` surface + `--pt-line-2` border |
| Top-1/2/3 row | gold `#D4AF37` / silver `rgba(192,192,210,0.75)` / bronze `#B5803A` left border |
| Faction mine card | radial-gradient + ring glow |
| Faction card hover | subtle border + `rgba(225,6,0,0.07)` glow |
| Faction mine hover | 강화 glow + ring 유지 (P3 fix) |
| Faction score bar | 8px + `linear-gradient(90deg, red, red-dim)` |

**6E-QA fix (P3):** `.faction-ranking-mine:hover` box-shadow — `.glass-card:hover` 동일 specificity override 수정

### Phase 6F — Community / News

| 영역 | 변경 |
|---|---|
| Post list container | `--pt-bg-2` surface |
| Post row 텍스트 | `--pt-ink-0/3` 위계 정렬 |
| `post-act-btn` | `--pt-line-2` border + hover/liked red glow |
| Filter btn active | bg `rgba(225,6,0,0.15)` + border + `box-shadow` glow |
| Post-detail `pd-cat-bar` | 4px → 6px |
| Post-detail modal footer | `--pt-bg-1` + `--pt-line-2` border-top |
| Post comment block | `--pt-bg-1` surface + `--pt-red-500` left border |
| News search input | `--pt-bg-2` + `--pt-line-2`, focus red border |
| News card hover | `box-shadow: none` 제거 → `rgba(225,6,0,0.08)` glow 복원 |
| News `nc-cat-bar` | 4px → 6px |
| News-detail `nd-cat-bar` | 4px → 6px |

**6F-QA:** 코드 수정 불필요 (전체 PASS)

---

## 변경하지 않은 항목 (전 Phase 공통)

- DB/API/RPC 로직 — 무변경
- Pick submit / scoring / settlement — 무변경
- `openPickSlip` / `confirmBetSlip` — 무변경
- `state.pendings` / `state.settled` 데이터 구조 — 무변경
- Community like/comment/publish — 무변경
- Modal open/close / body overflow — 무변경
- Ranking/scoring 알고리즘 — 무변경
- Admin destructive action 경로 — 무변경

---

## NEEDS_BROWSER 모음 (브라우저 직접 확인 필요)

정적 코드 분석으로 확인 불가한 항목들. 사람이 직접 브라우저에서 확인 필요.

### Phase 6C-2 (4개)

- [ ] "CHANGE PICK ›" — 픽 등록 후 hero card에서 실제 표시
- [ ] Fighter image brightness (1.18) — 다크 분위기 유지 여부
- [ ] Top fade 0.40 — 얼굴/상체 가시성 개선 확인
- [ ] UFC 일정 패널 scrollbar — hover 시 `rgba(225,6,0,0.45)` red 시각 확인

### Phase 6D (3개)

- [ ] Profile hero radial gradient — 아바타 가림 없는지 확인
- [ ] Belt tracker 5 dots — mobile 375px 레이블 클리핑 없음 확인
- [ ] Avatar glow ring — 실제 색감 확인

### Phase 6E (4개)

- [ ] My rank card left radial gradient — 강도 적절한지 확인
- [ ] Top-3 gold/silver/bronze border — 실제 색감 및 구분 확인
- [ ] Faction mine card gradient ring — 1px ring 가시성 확인
- [ ] Faction score bar 8px — 레이아웃 overflow 없음 확인

### Phase 6F (6개)

- [ ] Community post-list `--pt-ink-0/3` 가독성 실확인
- [ ] Filter btn active glow 강도 확인
- [ ] Post-detail modal footer `--pt-bg-1` 색감 확인
- [ ] News card hover glow 강도 확인
- [ ] News category bar 6px 두께 시각 확인
- [ ] Mobile 375px: post-detail modal 댓글 + 입력란 overflow 없음

### Browser QA Round 1 잔여 (NEEDS_BROWSER, Phases 3–5B 범위, 21개)

Home(3), Event/Pick(3), Profile(3), Rankings/Leaderboard(3), Community(3), News(2), Admin(4)  
→ 상세 목록: `docs/QA_RUN_2026-05-24_BROWSER_DESIGN.md`

---

## 남은 이슈 / 기술 부채

### P2 — 코드에서 확인된 이슈

| 항목 | 위치 | 내용 |
|---|---|---|
| Section header 미변환 | `index.html` `#ufc-rankings`, `#archive` | `sx-head` 대신 inline `border-l-8 border-ufcRed pl-4` 사용 중 |
| JS hardcoded color | `fights-render.js` | `rgba(210,10,10,*)`, `#2563eb`, `#080808` 등 다수 잔존 |
| JS hardcoded color | `index.html` JS 블록 | community, ranking 등 inline style 문자열 |

### P3 — 구조적 부채

| 항목 | 내용 |
|---|---|
| Tailwind CDN JIT | `cdn.tailwindcss.com` CDN 사용 — purge 없음, 번들 비대, app.css와 specificity 충돌 구조 지속 |
| `dist/` tracked | dist 디렉토리가 git tracked — 일반적으로 `.gitignore` 대상, CI/CD 도입 시 충돌 |
| monolithic `index.html` | 6,301줄 단일 파일 (HTML + `<style>` + `<script>` 혼재) |
| `app.css` 성장 | 779줄 + Phase별 append — 향후 specificity 관리 복잡도 증가 예상 |
| Global JS | `fights-render.js`, `community.js` 등이 전역 함수 — module system 없음 |

---

## Phase 7 후보 (우선순위 순)

### P7-A. Tailwind CDN 제거 + npm Tailwind 도입 (고우선)

- **현황:** `<script src="https://cdn.tailwindcss.com">` CDN, JIT 모드
- **문제:** purge 없음 → 전체 Tailwind utility 로드, app.css specificity 충돌 구조
- **작업:** `npm install -D tailwindcss postcss autoprefixer` → `tailwind.config.js` → `@tailwind` directives → Vite CSS pipeline 통합
- **효과:** 빌드 최적화, specificity 정리, CDN 의존성 제거

### P7-B. `dist/` gitignore + CI/CD 정비 (중우선)

- **현황:** `dist/` tracked — 매 커밋마다 dist 파일 포함
- **작업:** `.gitignore`에 `dist/` 추가, 배포 파이프라인(Vercel/Netlify/GH Actions) 설정
- **효과:** 저장소 정리, 빌드 아티팩트 분리

### P7-C. `index.html` 분리 (중우선)

- **현황:** 6,301줄 monolith — HTML + `<style>` + 인라인 `<script>`
- **작업:** Vite 멀티엔트리 또는 JS 파일로 분리 (community UI, pick slip UI 등)
- **효과:** 유지보수성, 파일 추적 명확화

### P7-D. JS hardcoded color 일괄 정리 (저우선)

- **현황:** `fights-render.js`, index.html JS 블록 내 `rgba(210,10,10,*)`, `#2563eb` 등
- **작업:** `--pt-*` 토큰 CSS custom property로 교체 or JS const 상수화
- **효과:** 디자인 토큰 완전 정렬

### P7-E. Admin 전면 재설계 (후순위)

- **현황:** Phase 5B에서 low-risk CSS만 적용, 구조는 미변경
- **참고:** `docs/ADMIN_RESULT_EDIT_POLICY_PLAN.md`, `docs/ADMIN_RESULT_SETTLEMENT_PATH_PLAN.md`
- **작업:** 별도 기능 라운드와 병행 권장

---

## 빌드 상태

| 항목 | 값 |
|---|---|
| 빌드 툴 | Vite 5.4.21 |
| 출력 | `dist/index.html` 376.42 kB / gzip 79.34 kB |
| 마지막 통과 | `2796614` (2026-05-25) |
| P0/P1 | 없음 |

---

## 다음 세션 권장 작업

1. **브라우저 QA** — NEEDS_BROWSER 항목 중 시각 임팩트가 큰 것부터 확인  
   우선순위: 6E top-3 colors → 6C-2 fighter brightness → 6F community readability → 6D profile gradient
2. **Phase 7-A 착수** — Tailwind CDN → npm 전환 (specificity 부채 해소)
3. **기능 라운드** — battle/octagon 시스템, admin 운영 고도화, community 상세 UX
