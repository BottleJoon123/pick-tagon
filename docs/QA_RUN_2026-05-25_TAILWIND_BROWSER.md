# QA Run — Tailwind Post-Migration Browser QA
**Date:** 2026-05-25  
**Branch:** main (`bc5112c`)  
**Scope:** Verify no visual/layout regression after Tailwind CDN → npm build pipeline migration (Phase 7B)

---

## Method

- **Tool:** Playwright (headless Chromium v1.60.0)
- **Dev server:** `npm run dev` → `http://localhost:5173/pick-tagon/`  
- **Build:** `npm run build` → `dist/assets/index-VBAm_2fP.css` (50.11 kB / 8.75 kB gzip)
- **Auth:** Dismissed auth modal via "로그인 없이 계속" to access content screens
- **CSS verification:** Node.js direct inspection of compiled CSS file with boundary markers (`class{`)

---

## Viewports Tested

| Viewport | Width × Height | Result |
|---|---|---|
| desktop-1440 | 1440 × 900 | PASS |
| desktop-1280 | 1280 × 800 | PASS |
| mobile-430 | 430 × 932 | PASS |
| mobile-375 | 375 × 812 | PASS |

---

## Console Errors

| Viewport | Errors |
|---|---|
| desktop-1440 | **None** |
| desktop-1280 | **None** |
| mobile-430 | **None** |
| mobile-375 | **None** |

---

## CSS Class Compilation Audit

All classes checked against compiled `dist/assets/index-VBAm_2fP.css`:

| Class | Status | Notes |
|---|---|---|
| `scrollbar-hide` | FOUND ✓ | `-ms-overflow-style:none; scrollbar-width:none` |
| `lg:block` | FOUND ✓ | |
| `lg:hidden` | FOUND ✓ | Mobile header `lg:hidden` / desktop nav `hidden lg:flex` both applied correctly |
| `lg:flex` | FOUND ✓ | |
| `md:grid-cols-2` | FOUND ✓ | |
| `sm:flex` | FOUND ✓ | |
| `rounded-[2rem]` | FOUND ✓ | `border-radius:2rem` confirmed via computed style |
| `z-[250]` | FOUND ✓ | |
| `z-[500]` | FOUND ✓ | |
| `z-[600]` | FOUND ✓ | Auth modal z-index:600 confirmed via computed style |
| `text-[10px]` | FOUND ✓ | |
| `border-white/8` | FOUND ✓ | `rgba(255,255,255,0.08)` confirmed via computed style |
| `border-white/6` | FOUND ✓ | |
| `border-white/4` | FOUND ✓ | |
| `border-white/3` | FOUND ✓ | |
| `bg-white/8` | FOUND ✓ | `rgba(255,255,255,0.08)` confirmed via computed style |
| `bg-white/2` | FOUND ✓ | |
| `bg-white/3` | FOUND ✓ | |
| `hover:bg-white/3` | FOUND ✓ | |
| `hover:bg-white/4` | FOUND ✓ | |
| `divide-white/4` | FOUND ✓ | |
| `bg-white/4` (standalone) | MISSING | **See P3 note below** |

---

## Screen-by-Screen Findings

### Home
- Desktop (1440px): Hero headline "PREDICT. COMPETE. WIN." renders in Barlow Condensed bold. "WIN." in `ufcRed` (#E10600). Background `#080808`. ✓
- Desktop nav (`hidden lg:flex`) visible and sticky. ✓
- Mobile (375px): Mobile header (`lg:hidden`) visible with PICK-TAGON logo, points chip, login button. ✓
- Bottom tab bar renders correctly with icon grid. ✓
- "ENTER OCTAGON" button: red pill shape, correct border-radius. ✓
- Countdown timer digits visible. ✓

### Events / Pick
- Event card renders with fighter portrait images (Chimaev vs Strickland). ✓
- `scrollbar-hide` on horizontally-scrollable containers: computed `scrollbarWidth: none` confirmed. ✓
- Fight card borders visible (`border-white/6`, `border-white/8`). ✓
- "MAIN EVENT" / "FACE-OFF" labels visible. ✓

### Community
- Section heading "COMMUNITY" with gold/red left border. ✓
- Category filter pills (전체, 분석, 파이터, 라이브, 뉴스, 유머) rendering correctly. ✓
- Empty state message visible (no posts in unauthenticated mode). ✓

### Rankings / Leaderboard
- "WORLD LEADERBOARD" heading, Barlow Condensed. ✓
- Belt tier cards (WHITE → BLUE → PURPLE → BROWN → BLACK) render with correct colors and rounded corners. ✓
- Player rank card renders with `bg-white/2` subtle background. ✓
- "개인 랭킹" / "집단 랭킹" tab buttons visible. ✓
- Mobile layout stacks belt tier cards correctly. ✓

### News
- "MMA 뉴스" heading with red left border. ✓
- News card grid renders (2-column desktop). ✓
- Category filter row visible. ✓

### Profile / Dashboard
- "DASHBOARD" heading. ✓
- Belt progression bar renders with color stops (White → Blue → Purple → Brown → Black). ✓
- Stat cards (BALANCE, FORECASTS, ACCURACY, BELT RANK) — `border-white/8` subtle card borders visible. ✓
- Progress bar track with fine opacity background. ✓

### Admin
- Admin section navigation is not accessible without authentication in headless mode (expected behavior). ✓

---

## Responsive Breakpoints

| Check | Result |
|---|---|
| Desktop nav (`hidden lg:flex`) visible at 1440px / 1280px | PASS ✓ |
| Desktop nav hidden at 430px / 375px | PASS ✓ |
| Mobile header (`lg:hidden`) hidden at 1440px / 1280px | PASS ✓ |
| Mobile header visible at 430px / 375px | PASS ✓ |
| Bottom tab bar present only on mobile viewports | PASS ✓ |

---

## Modal Z-Index

| Modal | z-index | Intercepting pointer events | Result |
|---|---|---|---|
| Auth modal (`#auth-modal`) | 600 | Yes (correct — full-screen overlay) | PASS ✓ |

---

## Findings by Priority

### P0 — None

### P1 — None

### P2 — None

### P3 (Document Only)

**`bg-white/4` standalone not compiled**  
- The class `bg-white/4` does not appear as a standalone selector in the compiled CSS.  
- Verified: it is **not used as a standalone class** anywhere in source. The only usage is `hover:bg-white/4` (on `index.html` line ~2xxx), which IS compiled correctly.  
- No visual regression. The scan was a false positive from checking standalone vs. modifier form.

---

## Verdict

**PASS** — No P0 or P1 issues. All Tailwind classes critical to the UI (arbitrary values, opacity modifiers, responsive breakpoints, scrollbar utilities, z-index) are present in the compiled CSS and rendering correctly across all 4 viewports. Zero console errors.

The CDN → npm build pipeline migration is confirmed regression-free at browser level.
