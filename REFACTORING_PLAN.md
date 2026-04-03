# Pick-tagon Refactoring Plan

## Scope

This document evaluates the current `picktagon_v5_9_7.html` implementation and proposes a practical refactoring roadmap.

Primary review target:

- `picktagon_v5_9_7.html`

Current project shape:

- Single-file HTML application
- UI, state, auth, admin, news, rankings, realtime, and persistence are all mixed together
- Heavy use of global state, inline event handlers, `localStorage`, and direct DOM string rendering

## Executive Summary

The project is already strong as a product prototype, but it is carrying significant technical debt.

Main concerns:

1. Security boundaries are weak because admin logic and sensitive flows are handled in the browser.
2. State is split across `localStorage`, in-memory globals, and Supabase without a clear source of truth.
3. The codebase is difficult to extend because most logic lives in one file with tightly coupled rendering and business logic.
4. Several features look production-ready in the UI but still rely on mock or partially synced data flows.

Recommended strategy:

1. Stabilize the existing single-file app first.
2. Extract modules and move to a multi-file structure.
3. Move privileged operations and validation to server-side boundaries.
4. Normalize data flow so Supabase is the source of truth for persistent entities.

## Priority Table

| Priority | Area | Problem | Impact | Recommendation |
| --- | --- | --- | --- | --- |
| P0 | Admin security | Admin password is stored and verified in `localStorage` | Anyone with browser access can bypass local admin protection | Replace local admin password gate with Supabase auth + role-based access |
| P0 | Data consistency | Fire-and-forget DB writes with almost no error handling | UI can say success while DB silently fails | Make persistence async, await results, and show failure states |
| P0 | Realtime picks | Realtime counters can accumulate duplicate counts on re-entry | Incorrect live percentages and totals | Reset in-memory counters before bootstrap and re-subscription |
| P1 | Code structure | 5,000+ lines in one HTML file | Very high regression risk | Split into HTML, CSS, and JS modules |
| P1 | Source of truth | `localStorage`, mock data, and Supabase are mixed | Hard-to-debug state drift | Define per-feature ownership: local-only, cached, or DB-backed |
| P1 | Rendering model | Extensive `innerHTML` string rendering | Fragile event wiring and higher XSS risk | Move to reusable render helpers or a framework later |
| P2 | UX resilience | Error, loading, and empty states are inconsistent | Users cannot tell what really happened | Standardize async status handling |
| P2 | Versioning | Multiple HTML snapshots in root | Hard to know which file is canonical | Keep one active app entrypoint and archive older versions separately |
| P2 | Testability | No tests, no linting, no automated verification | Refactors are risky | Add minimal smoke checks and linting |

## Immediate Findings To Address First

### 1. Admin is not a real security boundary

Current pattern:

- Admin password is saved in `localStorage`
- Access is checked entirely in browser code
- Admin UI unlock is effectively a client-side toggle

Why this matters:

- This is acceptable for a personal demo only
- It is not safe for any shared or public deployment

Action:

- Remove client-managed admin passwords
- Use authenticated Supabase users
- Add an `is_admin` or role-based permission model enforced by RLS
- Hide admin UI client-side, but enforce authorization server-side

### 2. State and persistence are not trustworthy enough

Current pattern:

- Core state is updated locally first
- DB sync often happens without awaiting success
- Failure paths are mostly ignored

Why this matters:

- Pick history, points, rankings, and posts can silently diverge
- Debugging user-specific issues will be difficult

Action:

- Create a small persistence layer with functions like:
  - `savePick()`
  - `settlePick()`
  - `syncUserProfile()`
  - `saveNewsItem()`
- Return success/error consistently
- Update UI only after success, or explicitly mark optimistic updates and rollback on failure

### 3. Realtime counters need deterministic reset behavior

Current pattern:

- Realtime subscriptions are restarted
- Initial counts are reloaded
- In-memory counters are not clearly reset before rehydration

Why this matters:

- Live percentages can inflate simply by navigating back into the view

Action:

- Clear `livePicks` before `loadInitialPickCounts()`
- Add idempotent recomputation from fetched rows
- Separate "initial aggregate load" from "incremental realtime delta"

### 4. Mock and production data paths are mixed

Current pattern:

- Rankings and event displays partially combine mock data with real user data
- News and admin features use both cache and DB sync logic

Why this matters:

- Users may see outputs that look authoritative but are partly fabricated
- Maintenance becomes harder because behavior depends on runtime context

Action:

- Mark each entity with one clear source:
  - `users`: Supabase
  - `picks`: Supabase
  - `posts`: Supabase
  - `news_cache`: Supabase
  - `ufc_rankings`: Supabase with optional local cache fallback
  - UI-only preferences: `localStorage`
- Remove mock data from production rendering paths once the DB path is stable

## Recommended Refactoring Phases

## Phase 0: Stabilization

Goal:

- Reduce the most dangerous bugs without a full rewrite

Tasks:

1. Fix invalid markup and obvious structure issues
2. Reset realtime counters before re-subscribing
3. Add async error handling to Supabase writes
4. Prevent admin access from relying on `localStorage` password
5. Add a visible app version label so the active file is obvious

Expected outcome:

- Lower regression risk
- More trustworthy runtime behavior
- Safer demo environment

## Phase 1: Split the single file

Goal:

- Make the project maintainable without changing the UI too much

Suggested structure:

```text
pick-tagon/
  index.html
  assets/
    styles/
      app.css
    js/
      app.js
      state.js
      supabase.js
      features/
        auth.js
        admin.js
        fights.js
        rankings.js
        news.js
        community.js
        profile.js
```

Tasks:

1. Move CSS into `assets/styles/app.css`
2. Move the script block into `assets/js/app.js`
3. Extract constants and seeds into separate files
4. Group related functions by feature
5. Replace inline `onclick` handlers with event listeners where practical

Expected outcome:

- Smaller review surface
- Safer edits
- Easier onboarding for future contributors

## Phase 2: Normalize state management

Goal:

- Define clear ownership of persistent and transient state

Proposed state categories:

- Session state: `currentUser`, auth status, current tab
- UI state: modal visibility, filters, selected division, search keywords
- Local cache: non-sensitive preferences and temporary cached reads
- Persistent domain state: users, picks, posts, news, rankings

Rules:

1. `localStorage` should only keep non-sensitive user preferences and caches
2. Persistent entities should come from Supabase
3. Feature modules should not mutate unrelated global state directly

Recommended abstraction:

```js
const store = {
  session: {},
  ui: {},
  cache: {},
};
```

Expected outcome:

- Easier debugging
- Better feature isolation
- More predictable rendering

## Phase 3: Harden backend boundaries

Goal:

- Move trust-sensitive logic out of the browser

Tasks:

1. Enforce RLS on all tables
2. Restrict admin writes by authenticated role
3. Move privileged mutations to Edge Functions if needed
4. Audit tables used by:
   - `users`
   - `picks`
   - `posts`
   - `fighters`
   - `news_cache`
   - `ufc_rankings`

Minimum policy direction:

- Users can read public data
- Users can only modify their own picks/profile/posts
- Only admins can modify fighters, rankings, and curated news

Expected outcome:

- Real security boundary
- Safer public deployment

## Phase 4: Improve rendering architecture

Goal:

- Reduce string-built UI and repeated DOM updates

Short-term option:

- Keep vanilla JS, but use feature render functions and smaller templates

Mid-term option:

- Move to a lightweight frontend framework if the app will continue growing

Recommendation:

- Do not rewrite to a framework immediately
- First modularize and stabilize the current code
- Reassess framework migration after Phase 1 and Phase 2

## Suggested Technical Backlog

### P0 backlog

- Replace local admin password flow
- Add awaited Supabase persistence with error handling
- Reset and recompute realtime pick counters safely
- Remove or isolate mock ranking data from real ranking view
- Fix invalid closing tags and malformed markup

### P1 backlog

- Extract `index.html` from historical snapshot naming
- Split CSS and JS out of the HTML file
- Introduce feature modules
- Centralize constants and configuration
- Add a single `render()` strategy per feature area

### P2 backlog

- Add ESLint and formatting rules
- Add a small smoke test checklist
- Add migration notes for data tables and RLS
- Archive old version files into a `legacy/` folder

## Architecture Target

Recommended target architecture for the next stable version:

```text
Browser UI
  -> Feature modules
  -> Shared store
  -> API/persistence layer
  -> Supabase auth/database/realtime
```

Responsibilities:

- UI modules render and handle events
- Store manages transient client state
- API layer owns Supabase calls and error normalization
- Supabase owns persistence and authorization

## Suggested Milestone Plan

### Milestone 1: Safe demo baseline

Duration:

- 1 to 2 sessions

Deliverables:

- Realtime count bug fixed
- Async save error handling added
- Admin flow no longer depends on local password
- Canonical entry file identified

### Milestone 2: Maintainable codebase

Duration:

- 2 to 4 sessions

Deliverables:

- HTML/CSS/JS split
- Feature modules extracted
- Shared state conventions documented

### Milestone 3: Production readiness

Duration:

- 2 to 5 sessions

Deliverables:

- RLS hardened
- Admin and write paths secured
- Mock data removed from live flows
- Basic test and release checklist created

## What Not To Do Yet

Avoid these until the stabilization pass is done:

- Full framework rewrite
- Large visual redesign
- New feature expansion on top of current global-state patterns
- Deeper AI integrations before data flow is reliable

## Recommended First Implementation Order

If work starts immediately, this is the safest order:

1. Fix markup and realtime duplication bugs
2. Add proper Supabase error handling
3. Replace local admin password logic with authenticated role checks
4. Separate the single file into HTML, CSS, and JS
5. Extract feature modules one by one
6. Remove mock/live data mixing
7. Add linting and a smoke-test routine

## Final Assessment

The project is promising and already demonstrates strong product instincts. The biggest risk is not lack of features, but lack of boundaries. If the next cycle focuses on stabilization and separation instead of expansion, `pick-tagon` can move from an impressive prototype to a maintainable application.
