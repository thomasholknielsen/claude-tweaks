# Demo Observation Plan — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorm with Thomas, session "demoimprove")
**Scope:** `skills/wrap-up/verification-brief.md`, `skills/demo/SKILL.md`; `bin/lib/issues/acceptance.js` unchanged

## Problem

`/claude-tweaks:demo` exists so a human can qualify the agent's work — see it, test it, inspect
it — before giving a verdict. Today that "seeing" is gated by a binary path classifier:
`verificationSurface` (`bin/lib/issues/acceptance.js`) sorts changed paths into `interactive`
(dev-server UI → browser walkthrough offered) or `non-interactive` (everything else → "Verify it
yourself (manual)" prose). The binary is wrong in both directions for the purpose it serves:

- A markdown doc in a project whose docs site renders it (the motivating case: a competitor
  research doc in a Nextra site) classifies `non-interactive` and gets "go read the raw file" —
  when a first-class render surface with a specific route exists.
- Flow-shaped work (a multi-stage extraction pipeline producing a transcript, frames, and a
  merged doc) has verdict-relevant *intermediates* a human would catch discrepancies in, and the
  brief re-narrates them as prose instead of putting them in front of the human.
- The ceremony is ask-first: verdict question → "how to check" question → pre-flight → finally
  the thing. Three interaction rounds before the human's eyes touch the result.
- "Show me live" drives an agent-browser session; for acceptance the human wants their own
  browser at a ready URL.

The right abstraction is not "does this have a UI?" but "**what is the best observation surface
for this outcome, and what exact entry point puts human eyes on it?**"

## Decisions (made in brainstorm)

1. **Builder bakes the plan.** The session that built the thing authors an observation plan into
   the Verification Brief at wrap-up time — it just worked in the surface, so route/command
   knowledge is free at that moment. Detection heuristics survive only where no builder
   knowledge exists (closing-commit reconstruction).
2. **Show-first, always.** Demo prepares the surface silently, puts it in front of the human,
   then asks one verdict question. No ask-first ceremony.
3. **The human's own browser.** agent-browser validates the render; `open <url>` hands over the
   real thing. Headless/cloud degrades to verified URL + self-contained steps.
4. **Nothing durable but the plan itself.** Demo is a viewing instrument, not a record-keeper.
   The plan is text in the brief (which already persists as an issue comment / record body).
   No evidence archive, no new storage: inspect-pointers reference where artifacts landed, with
   an optional per-pointer regenerate command for staleness. The existing screenshot commit to
   `docs/demo-evidence/{record}/` is unchanged — it predates this design and stays as-is.
5. **Approach: plan-in-brief, thin demo.** No generated HTML demo page (revisit only if raw-file
   inspection proves insufficient in practice), no demonstration-script framework.

## Design

### 1. Brief schema — `### Observation plan`

`wrap-up/verification-brief.md` Step 4's template replaces the mutually-exclusive
`### See it yourself (optional)` / `### Verify it yourself (manual)` pair with one
always-present section:

```markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run}
- Prepare: {command(s) to get the surface live — dev-server invocation + port; `none` for cli/diff}
- Inspect: {ordered pointers — each names what to open/run and what to look for;
  a flow pointer may carry one `Regenerate: {command}` line for when the artifact is gone}
```

Surface kinds:

- `rendered-page` — content with a render surface (docs site, storybook, email template).
  Entry point is the deep link to the changed page, not the site root.
- `app-route` — application UI. Entry point is the affected route, with any state-seeding
  noted in Prepare.
- `cli` — a runnable invocation whose real output is the observable outcome.
- `flow` — multi-stage work whose intermediates are the evidence. Inspect carries one pointer
  per verdict-relevant intermediate (path or URL), ordered by the flow's own stages.
- `diff` — the floor, when nothing above resolves. Entry point is the diff range.

The section is plain markdown: human-readable in the posted comment, structured enough for demo
to execute mechanically.

**Compatibility (expand-contract):** the old two sections stop being *written*, not being
*read*. `/claude-tweaks:demo` reads `### Observation plan` when present and falls back to the
old `### See it yourself` / `### Verify it yourself (manual)` handling for briefs already posted
before this ships. No backfill of existing records.

### 2. Wrap-up changes (`wrap-up/verification-brief.md`)

- **Step 2 ("Determine testability") becomes "Author the observation plan."** The builder picks
  the surface kind and writes the section by judgment from what this run actually did — the
  `verificationSurface` call is removed from this step. Per-kind guidance replaces the current
  non-interactive category list (skill/harness file → the invocation and specific behavior;
  `bin/` code → command + expected output; doc → its rendered route when the project has one,
  else the file and the claim to check).
- **Step 2.5 (visual-review safety net)** keys off plan kind `app-route` or `rendered-page`
  instead of `interactive`. Branch table and severity-floor behavior unchanged.
- **Step 3 (Confirmed sourcing) and the screenshot-commit procedure**: unchanged.
- **Step 4 template**: the two old sections replaced by `### Observation plan` per above.
  Everything else in the template (ask/shipped/confirmed/branch/footer) unchanged.
- **Family-Gate Procedure: untouched in v1.** A parent brief's inline end-to-end walkthrough
  already is a hand-written observation plan; migrating parents to the structured section is a
  possible follow-up, not this build. Parent briefs continue to omit both old sections and the
  new one.

### 3. Demo changes (`skills/demo/SKILL.md` Step 2) — show-first

After resolving the item and rendering the brief + design-contract section, demo executes the
observation plan **before any question**:

1. **Prepare** — run the plan's Prepare command(s). If they fail or predate reality (server
   moved ports), fall back to `dev-url-detection.md`'s resolution. `none` → skip.
2. **Validate** — for URL surfaces (`rendered-page`, `app-route`), a quick agent-browser session
   confirms the exact entry-point deep link actually renders (not just HTTP 200), attempting
   login when Auth-Vault credentials resolve; then closes. Same discipline as today's
   pre-flight, relocated before the first question.
3. **Show** —
   - URL surfaces: `open <entry-point>` (macOS; `xdg-open` on Linux) — the human's own default
     browser at the validated deep link.
   - `cli`: run the entry-point command; show its real output.
   - `flow`: walk the Inspect pointers in order — `open` each artifact (Preview for images, the
     terminal for text/JSON), stating what to look for from the pointer's own text. A stale
     pointer (file gone) runs its `Regenerate:` command when present; otherwise say it's gone
     and continue — never block on missing evidence.
   - `diff`: render the diff (full under ~200 lines, else stat + central hunks — same bounds
     Step 3 of the brief procedure already uses).
4. **One verdict question** — Approve / Request changes / Skip for now. The "See it
   yourself"/"Verify it yourself" verdict option and the live-vs-steps follow-up question are
   deleted; seeing already happened. A human who wants to drive it themselves just says so —
   the steps composition rules (self-contained `cd`, copy-paste-clean, explain
   surprising-but-correct state) survive as the response to that request and as the
   headless-environment degradation.

**Failure semantics unchanged in spirit:** a Prepare/Validate failure is evidence, not a side
quest — capture what broke, fold it into the brief as grounds for Request changes, never debug
the application from inside `/demo`. Browser tools unavailable → skip validation, still `open`
the URL when a display exists; no display (cloud/headless) → present the validated-or-best-known
URL plus self-contained steps and proceed to the verdict.

**Per-record once:** preparation/validation runs once per record per `/demo` session, reused for
the rest of that record's walkthrough (unchanged from today's pre-flight rule).

Scope-fork checkpoint, task-anchor discipline, Step 3 verdict application, Next Actions,
Component-Skill Contract: all unchanged.

### 4. Fallback paths — where the classifier lives on

- **Session-recall (no record):** the builder knowledge is in this same session — compose the
  plan directly from recall in the new schema. ("Always-present" in Section 1 describes the
  wrap-up-posted template; here the existing recall rules keep governing: no recallable work at
  all → "Nothing awaiting sign-off," stop; work recalled but no confident path/surface → render
  the brief without a plan and go straight to the verdict question.) The classifier is not
  called on this path anymore.
- **Closing-commit reconstruction (`#N`, no brief, other session's work):** the one path with
  no builder knowledge anywhere. `verificationSurface` over the commit's changed-path list
  stays as the floor: `interactive` → best-effort `app-route` plan via `dev-url-detection.md`;
  `non-interactive` → manual steps composed as today, presented as a `diff`/`cli` plan. This is
  today's behavior, demoted to last resort.
- **`bin/lib/issues/acceptance.js` is not modified.** `verificationSurface` keeps its two
  non-demo consumers (tidy's acceptance-gap sweeps on both drivers) and the reconstruction
  fallback above; its tests don't move.

## Consequences (accepted in brainstorm)

- **Show-first may cold-start a dev server before the human has said anything.** Chosen
  deliberately ("show-first, always") — preparation cost is paid silently up front.
- **Old briefs keep the old shape** until their records are resolved; no backfill.
- **The builder can bake a wrong plan** (typo'd route, wrong port). Demo's Validate step is the
  guard for URL surfaces; cli/flow surfaces fail visibly at Show time and degrade to the diff
  floor plus a plain statement of what didn't resolve.

## Out of scope

- Generated HTML demo pages (Approach B in brainstorm) — revisit only on evidence that raw-file
  inspection is insufficient.
- A demonstration-script framework (Approach C) — the per-pointer `Regenerate:` line is the
  only borrowing.
- Family/parent brief migration to the structured section.
- Any durable evidence store beyond what already exists (`docs/demo-evidence/` screenshots).
- Backfilling or rewriting already-posted briefs.

## Cross-file obligations for the implementing spec

- `skills/wrap-up/verification-brief.md` and `skills/demo/SKILL.md` both change — producer and
  consumer of the brief schema in one change-set (the `[IL-02]`/`[IL-04]` producer/consumer
  discipline).
- `docs/skill-graph.md`: check whether the demo↔wrap-up / demo↔browse edges' descriptions
  restate the ask-first shape; update edge text if so.
- Sweep for prose restating the retired shape: `README.md`, `/help`, `_shared/github-pr-scan.md`,
  `tidy/step-1-records.md`, `_shared/design-contract.md`, and any other file naming
  "See it yourself" / "Verify it yourself (manual)" or demo's Option-2 flow (`[IL-93]`: widening
  a mechanism owes a sweep of prose describing its old reach). Note: tidy/pr-scan cite the
  *classifier*, which is unchanged — verify their prose doesn't also describe the brief's
  section pair.
- Anti-Patterns tables in both changed skills: retire rows describing deleted branches (e.g.
  "Handing over 'Give me the steps' instructions without running the pre-flight first" becomes
  a show-first equivalent), add rows for the new failure modes (blocking on a stale flow
  pointer; asking before showing).
- Version bump per convention (minor — feature change), claimed at ship time, not reserved.
