---
record: 680
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 680: flow / Next Actions: "Cut the release" was pre-marked Recommended with a paste-ready release.js command for work that had already shipped — verify the merge-vs-bump premise before rendering the row

Surface: backend

## Current State

- `skills/flow/summary-template.md`'s `### Next Actions` renders four options: next spec's run (Recommended), pipeline status, build-unblocked-spec, depth opportunities. **There is no release row at all** — the "Cut the release (Recommended)" option with a paste-ready `node bin/release.js minor "…"` seen in the incident session was improvised by the model outside the template (`grep -rni "cut the release\|release\.js" skills/` returns nothing).
- `docs/skill-authoring.md`'s Next Actions convention (the "Skill handoffs" bullet) requires one Recommended option and paste-ready commands, but says nothing about the *premise* a Recommended option rests on.
- Incident: after a pr-first merge, the closing Next Actions recommended cutting a release for work that v6.87.1 had already carried; the user took the recommendation and ~20 tool calls were spent discovering it. Run as written it would have minted a spurious 6.88.0.
- Whether a merge is already in a shipped version is a two-command git check (`git merge-base --is-ancestor <merge> <newest-bump-commit>`); #678 turns this into a `bin/` subcommand whose one-line output the flow report can consume.

## Deliverables

- [ ] `skills/flow/summary-template.md`: a release-state row in Next Actions, rendered only for a project with a documented release procedure (here `docs/releasing.md` / `bin/release.js`), as exactly one of two mutually exclusive options: "Cut the release" (`node bin/release.js <minor|patch> "<summary>"`) when the merge is **not** an ancestor of the newest version-bump commit; "Already shipped in vX.Y.Z — backfill the CHANGELOG" when it is. Neither is marked Recommended unless the check ran and succeeded; if the check cannot run, render no release row.
- [ ] `docs/skill-authoring.md` Next Actions convention gains one sentence: an option carrying a runnable, state-changing command (release bump, push, delete, merge) is never marked `(Recommended)` on an unverified premise — the option's description names the check that verified it.
- [ ] A conformance test pinning both prose additions (fails if either sentence is removed).

## Acceptance Criteria

1. In `summary-template.md`, the release row's rendering rule names the ancestry check and both mutually exclusive outcomes; "Cut the release" cannot be rendered without the check having run.
2. `docs/skill-authoring.md` contains the premise-verification sentence inside the "Skill handoffs" bullet.
3. `tests/` gains a test pinning both prose additions.
4. The template cites #678's subcommand output as the row's source when that subcommand exists, and shows the two inline git commands otherwise.
5. `summary-template.md`'s Next Actions still has ≥2 options and exactly one Recommended in every rendering (existing skill-authoring rule).
6. `npm test` passes.

## Technical Approach

- Template edit + one convention sentence + a grep-based test; no runtime code.
- Inline form of the check: `git fetch origin && git merge-base --is-ancestor <merge> $(git log -1 --format=%H -S'"version"' -- .claude-plugin/plugin.json)` — exit 0 = already shipped.

### Key Files
- `skills/flow/summary-template.md`
- `docs/skill-authoring.md`
- `tests/next-actions-premise.test.js` (new, or fold into an existing conformance suite)

## Gotchas

- The row is only meaningful for repos with a release procedure — most consuming projects have no `bin/release.js`; keep it conditional.
- Fetch before the ancestry check — a sibling session's bump can land mid-run (project memory: version collision, re-check after every pause).
- Coupled to #678: build #678 first or in the same run; this record must still stand alone (inline git form) if #678 hasn't shipped.

## Original request

flow / Next Actions: "Cut the release" was pre-marked Recommended with a paste-ready release.js command for work that had already shipped — verify the merge-vs-bump premise before rendering the row

**Summary:** The closing `## Next Actions` offered "Cut the release (Recommended)" with a runnable `node bin/release.js minor "…"` for a merge that v6.87.1 had already carried; the user picked the Recommendation and the next ~20 tool calls were spent discovering it was wrong. Run as written it would have minted a spurious 6.88.0.

**Kind:** Gap

**Affected component:** `/claude-tweaks:flow` summary Next Actions (`skills/flow/summary-template.md`); `docs/skill-authoring.md` Next Actions convention

**Objective:** Avoidable interactions

**Measurement:** total AskUserQuestion calls in the segment: 2 (3 questions); 1 of 1 single-select resolved to the pre-marked Recommended option, and that option was factually wrong; the 2 multiSelect questions carried no Recommended marker (8 of 8 pre-filled items accepted).

**Use case:** A Next Actions option that carries a runnable, state-changing command (a release bump) must rest on a verified premise — the merge commit's ancestry against the newest version-bump commit is a two-command check.

**Proposed fix:** Make the release row conditional: resolve `git merge-base --is-ancestor <merge> <newest-bump-commit>` and render exactly one of two mutually exclusive rows — "Cut the release" when the merge is not yet in a shipped number, or "Already shipped in vX.Y.Z — backfill the CHANGELOG" when it is. Add to the Next Actions convention: an option carrying a runnable state-changing command is never marked Recommended on an unverified premise.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-9d7fbad5 -->

