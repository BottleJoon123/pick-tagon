# Handoff: Pick-tagon Design System

## Overview

**Pick-tagon** is a UFC/MMA fight prediction and fan-intelligence platform. Users pick winners, compare fighter data, climb belt-tier leaderboards, and discuss matchups. The product feels like a premium "fight-night intelligence console" — dark arena UI, UFC-inspired red accents, dense sports data, bold typography, but cleaner and more trustworthy than a betting site.

This bundle contains the full design system (foundations + components) and 8 high-fidelity screen mockups that show how it all comes together in real product surfaces.

---

## About the Design Files

**Everything in this bundle is a design reference, not production code.** The HTML/CSS files are pixel-perfect prototypes built to show intended look, layout, and behavior — they are *not* meant to be shipped as-is.

Your job: **recreate these designs in the target codebase's environment** (React/Vue/Svelte/etc.) using its established component patterns, state management, and routing.

If no codebase exists yet, pick the most appropriate stack for the product (the design assumes a responsive web app with possible mobile-first considerations — Next.js + Tailwind would be a natural fit) and implement there.

---

## Fidelity

**High-fidelity (hifi).** All colors, typography, spacing, shadows, and interactions are final. Recreate pixel-perfect using the codebase's existing libraries. The exact hex values, type scale, spacing scale, and component patterns are all defined in `design-system/tokens.css` — pull from there, don't re-derive.

---

## Files in This Bundle

```
design_handoff_picktagon/
├── README.md                          ← you are here
├── screenshots/                       ← PNG previews of every screen & card
│   ├── 00-index.png                   ← design system overview
│   ├── 01-brand-logo.png              ← foundations
│   ├── 02-colors.png
│   ├── 03-type.png
│   ├── 04-spacing.png
│   ├── 05-components-core.png         ← components
│   ├── 06-components-matchup.png
│   ├── 07-screen-home.png             ← app screens
│   ├── 08-screen-event.png
│   ├── 09-screen-profile.png
│   ├── 10-screen-rankings.png
│   ├── 11-screen-leaderboard.png
│   ├── 12-screen-community.png
│   ├── 13-screen-news.png
│   └── 14-screen-admin.png
├── design-system/
│   ├── tokens.css                     ← all design tokens (colors, type, spacing, shadows)
│   ├── ds-shell.css                   ← shared shell for design system cards (skip for app)
│   ├── screen-shell.css               ← shared app header/container (relevant for app)
│   ├── index.html                     ← visual index of the whole system
│   ├── foundations/
│   │   ├── brand-logo.html            ← logo anatomy, variants, usage rules
│   │   ├── colors.html                ← 5 color groups: brand red, surfaces, belts, corners, status
│   │   ├── type.html                  ← 4 font families + 9-step scale
│   │   └── spacing.html               ← spacing scale, radii, shadows, layout grid
│   └── components/
│       ├── components-core.html       ← buttons, badges, belt chips, inputs, filter chips, toasts
│       └── components-matchup.html    ← event hero, VS bar, fighter card, pick card, stat compare, result card
└── screens/
    ├── screen-home.html               ← home dashboard
    ├── screen-event.html              ← event detail / pick page
    ├── screen-profile.html            ← user profile / season record
    ├── screen-rankings.html           ← UFC rankings page (middleweight)
    ├── screen-leaderboard.html        ← season leaderboard
    ├── screen-community.html          ← community feed
    ├── screen-news.html               ← news page
    └── screen-admin.html              ← admin dashboard (events management)
```

---

## Design Tokens

All tokens live in `design-system/tokens.css` as CSS custom properties. Port these to your styling system (Tailwind config, CSS variables, theme provider, etc.) **first** — every other component reads from them.

### Colors

#### Brand Red (the single most important color)
```
--pt-red-50:  #FFE9E8
--pt-red-100: #FFC7C4
--pt-red-300: #FF5D55     ← hover / highlight on dark
--pt-red-500: #E10600     ← PRIMARY — wordmark, CTAs, live indicators, rank #1
--pt-red-600: #C20500     ← button :active
--pt-red-700: #9A0400     ← danger borders, corner gradient end
--pt-red-900: #3A0100     ← loss badge background, danger hover
```

#### Surfaces (dark arena)
```
--pt-bg-0: #07080A   ← deepest — page bottom, header overlay
--pt-bg-1: #0E0F12   ← default canvas (body)
--pt-bg-2: #14161B   ← card surface
--pt-bg-3: #1B1E25   ← card hover / lifted
--pt-bg-4: #232730   ← input / chip background
```

#### Borders / Ink
```
--pt-line-1: rgba(255,255,255,0.06)    ← hairlines
--pt-line-2: rgba(255,255,255,0.10)    ← default borders
--pt-line-3: rgba(255,255,255,0.18)    ← strong borders / hover

--pt-ink-0: #FFFFFF                    ← pure white (rare)
--pt-ink-1: #ECECEE                    ← primary text
--pt-ink-2: #B3B5BC                    ← secondary text
--pt-ink-3: #71757F                    ← tertiary / labels
--pt-ink-4: #4A4D55                    ← disabled
```

#### Belt Tier Colors (ranking system)
Earned by points + accuracy. Drives leaderboards, profile badges, user chips.
```
White:  #ECECEE   ← 0–1,000 P
Blue:   #1F6FEB   ← 1,001–2,000 P
Purple: #8B3FE3   ← 2,001–5,000 P
Brown:  #B5803A   ← 5,001–10,000 P
Black:  #0E0F12   ← 10,001 P+
```

#### Corner Colors (matchup fighter sides — RESERVED, do not use for general UI)
```
--pt-corner-red:       #E10600 → #6B0200    ← always the favorite/champion side
--pt-corner-blue:      #1F6FEB → #0A2A66    ← always the challenger
```

#### Status (inside badges only — never as page backgrounds)
```
--pt-win:  #1FBF6B   ← win / upcoming
--pt-loss: #E10600   ← loss / live
--pt-draw: #71757F   ← draw / no contest
--pt-warn: #F4B400   ← balance / points / warning
--pt-info: #1F6FEB   ← info toasts
```

### Typography

Four font families, each with a specific role. Load all four; don't substitute.

```
Display:  'Barlow Condensed' 700/800/900 italic    ← headlines, hero titles, big numbers
Eyebrow:  'Bebas Neue' 400                          ← all-caps labels, table headers, badges (letter-spacing 0.18em)
Body:     'Pretendard' 400/500/600/700              ← Korean body, buttons, nav, descriptions
Mono:     'JetBrains Mono' 500/700                  ← numbers (balance, %, odds, timestamps) — tabular-nums
```

#### Type Scale (px)
```
HERO     80–96   line 0.9    italic   ← landing hero (1 per page)
DISPLAY  56–72   line 0.92   italic   ← section hero / event header
H1       36–48   line 1.0    italic   ← page title
H2       26–32   line 1.05   italic   ← section title
H3       20–24   line 1.2    italic   ← card title
BODY     15      line 1.55            ← main copy
SMALL    13      line 1.5             ← meta, captions
EYEBROW  11–13   tracking 0.22em      ← small labels above sections
MONO     12–14                        ← numbers (always tabular-nums)
```

The Display family is **always italic** and **mostly uppercase** — the forward lean is the brand voice. Don't render it upright.

### Spacing (4px base)
```
1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=56 · 16=80
```
- **16px** — default card-to-card gap
- **24px** — card inner padding, grid gutter
- **56px** — page L/R margin
- **80px** — section vertical gap

### Radii
```
xs=4   ← badges, tiny tags
sm=8   ← inputs, toasts
md=12  ← stat cards, small cards
lg=18  ← default cards
xl=24  ← large panels, modals
pill=999  ← buttons, chips, avatars
```

### Shadows
```
card:  0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)
pop:   0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)
red:   0 12px 36px rgba(225,6,0,0.35)     ← primary CTA hover only
```

### Motion
```
fast:  120ms cubic-bezier(0.2, 0.8, 0.2, 1)
base:  220ms cubic-bezier(0.2, 0.8, 0.2, 1)
slow:  420ms cubic-bezier(0.2, 0.8, 0.2, 1)
```

### Layout Grid
12-column, 24px gutter, 1280px max container, 56px L/R margin.

---

## Components

Each component is fully styled in the design-system HTML files. Reference the specific `.html` file when implementing — the markup shows the exact structure.

### Core Components (`components-core.html`)

| Component | Variants | Notes |
|---|---|---|
| **Button** | Primary, Secondary, Ghost | Primary uses red glow shadow on hover. All buttons are pill-shape (border-radius 10px), uppercase, letter-spacing 0.04em |
| **Badge** | live (pulse), upcoming, final, main-event | `badge-live` has animated pulse dot |
| **Belt Chip** | white / blue / purple / brown / black | Circular swatch + uppercase belt name |
| **Input** | text, focus | Background `--pt-bg-4`, focus ring `rgba(225,6,0,0.18)` 3px |
| **Filter Chip** | default, active | Active = red fill |
| **Toast** | success / error / warn | Dot indicator + message; appears top-right, 4s auto-dismiss |

### Matchup Components (`components-matchup.html`)

| Component | Purpose |
|---|---|
| **Event Hero** | Full-width banner: red corner left, VS center, blue corner right; meta + countdown |
| **VS Bar** | Slim list version of a matchup; red gradient bar on left for main, blue for prelim |
| **Fighter Card** | Photo (placeholder) + name + record (W/L/KO) + rank badge + flag |
| **Pick Card** | Two fighter boxes side by side; click to select; selected side gets corner-color glow + 1px inset shadow |
| **Stat Compare** | Two-column comparison with split horizontal bar showing ratio |
| **Result Card** | Post-fight: winner side gets green gradient, loser gets 40% opacity dim, center shows method/round/time |

---

## Screens

Each screen file is a complete HTML page using the shared `screen-shell.css` (app header + container). All screens share the same global header (logo + nav + search + balance + belt chip + avatar) and link to each other via standard `<a href="">` — preserve this navigation structure.

### 1. Home Dashboard (`screen-home.html`)
**Layout:** Hero (next main event) → 4-stat row (balance/accuracy/streak/belt) → 2-col grid (left: quick-pick cards, right: leaderboard top 5 + activity feed)
**State needed:** Current user (name, belt, balance, accuracy), next event, user's pick state per match, top 5 leaderboard, recent activity log

### 2. Event Detail / Pick Page (`screen-event.html`)
**Layout:** Breadcrumb → event hero with progress bar → tabs (main card / prelim) → 2-col (left: 5 pick cards with main expanded showing method+round picker, right: my pick summary + main event stat compare + community vote split)
**State needed:** Event metadata, 11 matches, user's pick per match (fighter + method + round), community vote counts
**Interactions:** Clicking a fighter side selects them and highlights with corner color. The first pick card shows the "expanded" state with method/round selectors.

### 3. Profile (`screen-profile.html`)
**Layout:** Profile hero (avatar + belt + name) → belt-progression tracker (5 dots on a line, current dot scaled + glowing) → 2-col (left: pick history with win/loss/pending icons, right: season stats grid + weight-class accuracy bars + 9 achievements grid)
**State needed:** User profile, pick history (paginated), per-weight-class accuracy stats, achievement unlock state

### 4. UFC Rankings (`screen-rankings.html`)
**Layout:** Page head with men/women + current/changes toggles → 3-col (left: weight class nav 9 items, center: champion hero + top 12 contender table, right: weight class insights + recent movers + champion history)
**State needed:** Per-weight-class data — champion, ranked fighters with rank delta, recent ranking changes, title history

### 5. Season Leaderboard (`screen-leaderboard.html`)
**Layout:** Page head with season pill + countdown → top 3 podium (2nd left, 1st center scaled up, 3rd right) → filter row → 2-col (left: paginated table — uses `is-me` row variant to highlight current user, right: my season summary + "near me ±3" + belt distribution chart)
**State needed:** Full leaderboard (paginated), current user position, neighbors, season metadata
**Critical:** The "내 주변 ±3" feature requires server-side calculation of user's rank position.

### 6. Community Feed (`screen-community.html`)
**Layout:** Tabs + sort chips → 2-col (left: pinned post + post cards of various types — debate with poll, analyst report, pick-share, free, right: trending topics + suggested follows + community pulse stats)
**State needed:** Posts (with author belt, type, vote counts, comment counts), votes, follow state per user, trending algorithm output

### 7. News (`screen-news.html`)
**Layout:** Page head with category tabs → featured row (1 big + 3 small) → 2-col (left: news list with thumbnail + tags + meta + pagination, right: top 5 most-read + 3 video clips + 4 upcoming events)
**State needed:** News articles (paginated, by category), view counts, video thumbnails, event schedule

### 8. Admin (`screen-admin.html`)
**Different visual identity** — pull-down header (smaller logo, ADMIN badge, PRODUCTION env, user role). Sidebar layout instead of top nav.
**Layout:** Sidebar (Content / System / Monitoring groups) → main: page head with action buttons → 4 stat cards → 2-col (left: events table with status badges + pick-progress mini bars + bulk select, right: quick actions + real-time activity log)
**Critical pattern:** The result-pending state (yellow status) and a separate result-input flow is core to the admin workflow.

---

## Interactions & Behavior

### Global
- **Header is sticky** with backdrop-blur over a `rgba(7,8,10,0.92)` background
- **Hover on cards:** `translateY(-2px)` + border lifts from `--pt-line-1` to `--pt-line-3` + shadow gets deeper. 150ms transition.
- **Hover on primary buttons:** background `--pt-red-500` → `--pt-red-300` + `--pt-shadow-red` glow appears

### Pick interaction (the most important one)
1. User clicks one fighter side in a pick card
2. That side gets corner-color border + 1px inset glow + gradient background
3. The other side stays default
4. Optional: method + round selectors appear below (see expanded state on event page)
5. State persists until user changes pick OR event closes
6. Toast: "픽이 제출됐습니다 · +XXP 적립"

### Live indicator
- Red badge with `●` dot that pulses every 1.4s (opacity 1 ↔ 0.4)
- Used for live events and active countdowns

### Belt progression
- Animated horizontal line with 5 colored dots
- Current belt dot is scaled 1.15x with red `box-shadow` ring + purple glow
- Progress fill bar below uses gradient from current belt color to next belt color

### Countdown timers
- Format: `D-5 · 14:23:18` (days · hours:min:sec)
- Color: `--pt-warn` when >24h, `--pt-loss` (red) when <1h

---

## State Management (general guidance)

The product naturally splits into:

- **Auth + user profile** — current user, belt, balance, accuracy stats
- **Events + matches** — event metadata, match cards, pick state per user-per-match
- **Leaderboard + rankings** — paginated, filtered, with "near me" calculation
- **Community + news** — posts, comments, votes, follow state
- **Admin** — separate role-gated context with bulk-edit + activity log

Real-time updates are nice-to-have for live events (pick counts, community votes) but not required for v1.

---

## Assets

**Images:** None included. The HTML uses CSS placeholders (radial gradients + monogram initials) where fighter photos go. Replace with real photos from the data source.

**Logo:** Pure SVG, defined inline in every screen header. Reference `foundations/brand-logo.html` for the canonical mark (8-sided octagon ring + pick check) and wordmark.

**Fonts:** Three Google Fonts (Barlow Condensed, Bebas Neue, JetBrains Mono) + Pretendard (Korean). All loaded via Google Fonts CDN in `tokens.css` — port to whatever font-loading strategy the codebase uses.

**Icons:** Emoji used as placeholders for medals, badges, and decorative icons. Replace with a proper icon library (Phosphor, Lucide, Tabler) when implementing.

---

## Implementation Order (recommended)

1. **Port `tokens.css`** into the target system (Tailwind theme extension, or CSS variables in `:root`, or theme provider). This is the foundation everything else reads from.
2. **Build core components** in this order: Button → Badge → BeltChip → Input → Card shell → FilterChip → Toast
3. **Build matchup components:** PickCard (most complex), then VsBar, FighterCard, EventHero, StatCompare, ResultCard
4. **Build app shell:** sticky header (logo + nav + search + balance + avatar) + page container
5. **Build screens in order of dependency:** Home → Event → Profile → Leaderboard → Rankings → Community → News
6. **Build admin separately** — different shell, different state context

---

## Open Questions for the Developer

- **Data model:** The user mentioned a Supabase schema exists. Map the screens to existing tables before starting.
- **Real-time:** Should live event indicators use Supabase Realtime channels, or polling?
- **Korean/English content:** The mockups are Korean-first with English fighter names. Confirm i18n strategy.
- **Mobile:** The mockups are desktop (1280px). A mobile breakpoint set hasn't been designed yet — coordinate with the design owner before improvising.
- **Pick scoring algorithm:** Point values (+95P, +120P, etc.) shown in mockups are illustrative. Confirm the real formula with the product owner.

---

**Questions?** Reference the original HTML files in this bundle — they show exact pixel measurements, hover states, and component structure. When in doubt, open the file in a browser and inspect.
