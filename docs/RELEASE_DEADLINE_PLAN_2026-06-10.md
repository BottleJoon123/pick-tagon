# Pick-tagon Release Deadline Plan

> Created: 2026-05-25  
> Target event: White House event on 2026-06-15  
> Public release deadline: **2026-06-10**  
> Feature freeze: **2026-06-07 night**

---

## Operating Rule

Until the 2026-06-10 public release, every task should be judged against release stability.

Primary goal:

- Ship a stable, usable Pick-tagon build before the 2026-06-15 event.

Non-goal before release:

- Perfectly finishing the full monolith split.
- Large Auth/Admin/Octagon rewrites.
- New major features that increase QA scope.
- Major visual redesign beyond targeted fixes.

---

## Timeline

| Date | Milestone | Rule |
|---|---|---|
| 2026-05-25 to 2026-05-28 | Safe refactor window | Continue low-risk refactors only. Keep changes small and verifiable. |
| 2026-05-29 to 2026-06-01 | Full browser QA + P0/P1 fixes | Test all core user/operator flows. Fix blocking bugs first. |
| 2026-06-02 to 2026-06-04 | Admin/operator flow hardening | Verify event creation, result entry, settlement, archive, admin access. |
| 2026-06-04 | Internal beta | App should be usable end-to-end by the operator. |
| 2026-06-05 to 2026-06-07 | Beta feedback fixes | Small fixes only. No broad rewrites. |
| 2026-06-07 night | Feature freeze | After this point, bug fixes and release QA only. |
| 2026-06-08 to 2026-06-09 | Final QA / deployment rehearsal | Smoke test production URL, mobile, admin, Supabase config. |
| 2026-06-10 | Public release | Release before the event week. |

---

## Must-Have Before 2026-06-10

- GitHub Pages deployment succeeds from `main`.
- Supabase env bridge and GitHub Actions secrets remain working.
- Login/logout works for normal users.
- Admin access works only for configured admins.
- Home, event pick cards, ranking, leaderboard, news, community, profile, archive, and admin screens render without P0/P1 UI regressions.
- Pick flow works:
  - open pick slip
  - confirm pick
  - change pick
  - pending/settled UI state
- Ranking/profile point display remains coherent after picks/settlement.
- Admin flow works:
  - event/matchup review
  - result entry
  - settlement
  - archive visibility
- Mobile 375px smoke QA passes for core screens.
- No hardcoded Supabase secrets in runtime source.

---

## Allowed Before Feature Freeze

- Low-risk JS extraction from `index.html`.
- CSS/UI bug fixes with clear before/after scope.
- Browser QA documentation.
- Small operator-flow safety improvements.
- P0/P1/P2 bug fixes.
- Documentation that helps release execution.

---

## Avoid Before Public Release

- Large Auth refactor.
- Large Admin core logic refactor.
- Large Octagon realtime/battle rewrite.
- Major scoring formula redesign.
- Large visual redesign pass.
- New feature branches that require broad QA.
- Removing inline handlers globally.
- Rewriting navigation/state orchestration in one pass.

---

## Phase 9 Guidance

Phase 9 should continue only while it reduces risk.

Recommended:

- Finish low-risk feature helper extraction.
- Prefer News/Community/Leaderboard helpers.
- Keep each commit small.
- Add smoke QA after visible or click-path changes.

Be cautious:

- Phase 9E medium-risk extraction should be selective.
- Phase 9F high-risk extraction should be deferred unless there is a release-blocking reason.

Release rule:

- If a refactor does not clearly improve release confidence before 2026-06-10, defer it.

---

## Decision Checklist For Every Next Task

Before starting a task, ask:

1. Does this help the 2026-06-10 release?
2. Can it be verified quickly?
3. Does it avoid Auth/Admin/Octagon high-risk rewrites?
4. Is the rollback surface small?
5. Can it be completed and pushed without leaving the app half-migrated?

If any answer is weak, defer the task until after release unless it fixes a P0/P1 bug.
