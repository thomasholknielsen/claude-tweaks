# demo Verification Brief Redesign — Design

**Goal:** Fix `/claude-tweaks:demo`'s actual defect — its walkthrough step displays a thin,
pointer-based brief instead of substantive evidence, which is why the shipped skill reads like
`/claude-tweaks:triage`'s batch-then-label bookkeeping instead of a genuine human-judgment tool.
Replace the brief with a digest of what `/review` and `/visual-review` already established, add a
safety-net gate so bugs are always fixed before a human ever sees the record, and reframe the
walkthrough itself around vision/fit rather than mechanical script-following.

**Architecture:** No taxonomy change — the seven-axis Acceptance model from
`2026-07-16-demo-skill-design.md` ships as-is. This revision touches three things: (1)
`/claude-tweaks:wrap-up`'s Step 10 gains a safety-net check that triggers a full `/visual-review`
pass (reusing `/review` Step 6's own invocation, never duplicating it) when one hasn't already run
for this record, gating on any bug being fixed before continuing; (2)
`skills/wrap-up/verification-brief.md`'s content-sourcing step is rewritten so the brief is always
a self-contained digest — vision, what shipped, confirmed evidence (visual-review's result +
committed screenshots, or a code-review digest + diff for non-UI work) — instead of a pointer to
re-run another skill; (3) `/claude-tweaks:demo`'s per-item walkthrough reframes its verdict prompt
around vision/fit and adds an on-demand "show me live" escape hatch.

## Motivation

`2026-07-16-demo-skill-design.md` shipped a real Acceptance axis and a real `/demo` skill
(v6.3.0), but in production the skill reads wrong: its Step 1 (discovery) and Step 4 (apply
verdicts) are almost entirely `gh issue edit`/label-bootstrap mechanics — structurally identical
to `/claude-tweaks:triage`'s Step 1/Step 4 — and its Step 2 (batch table → one `AskUserQuestion`)
mirrors `/triage`'s Step 3 exactly. The part that's supposed to be the point, Step 3's "per-item
walkthrough," is the thinnest part of the skill: it renders whatever `verification-brief.md`
produced and asks for a verdict. It never executes, drives, or attaches anything itself.

The root cause lives in `verification-brief.md`'s content-sourcing priority order, not in
`demo/SKILL.md`:

1. **Story match** → the brief says *"run `/claude-tweaks:test qa story={name}`"* — a pointer to
   go invoke a different skill, not a self-contained artifact.
2. **Journey match** → the brief says *"walk it live via `/claude-tweaks:visual-review`"* — same
   problem.
3. **No match** → a synthesized 2-4-step walkthrough. The one tier that's actually close to
   self-contained, and only a fallback.
4. **Non-testable** → *"review the diff and rationale"* — with no diff ever attached.

Because tiers 1-2 cover the common case (most testable work has a matching story), `/demo`'s
walkthrough usually hands the human a pointer to go run something else and come back — the exact
"asking for more specific instructions" pain the original design set out to close, still present
one layer down.

Separately: `/review` Step 6 already invokes `/claude-tweaks:visual-review` (in `full` mode) and
already gates any bug it finds through Step 3 Routing before `/review` can PASS — but only when
`/review` runs in `full` mode. Standalone `/review` (outside `/claude-tweaks:flow`) defaults to
**code mode**, where Step 6 only calls `/visual-review --mode=recommendation` — a routing signal,
not an actual browser walk. So a record built via `/build` → `/review` (no `full`) → `/wrap-up`,
outside `/flow`, can reach `demo:pending` with zero bugs ever having been mechanically caught.

## Non-Goals

- **Not a taxonomy change.** The Acceptance axis, its three labels, the permission matrix, and
  "`/wrap-up` produces / `/demo` consumes" shape from the original design are correct and unchanged.
- **Not giving `/demo` its own browser-automation default mode.** `/visual-review` stays the sole
  agentic, step-by-step, bug-catching pass. `/demo` stays human-driven, evidence-plus-judgment,
  except for the opt-in "show me live" escape hatch (below), which the human explicitly requests.
- **Not a second visual-review implementation.** `/wrap-up`'s new safety-net check reuses
  `/review` Step 6's own mode-resolution and invocation of `/claude-tweaks:visual-review` — it
  does not reimplement journey/page resolution.
- **Not a general screenshot-retention policy.** Scope is bounded to "cap committed screenshots at
  1-3 per record." Broader lifecycle (pruning old evidence, storage limits) is future work.
- **Not resolving the `/tidy`-style staleness sweep deferral** — still out of scope, per the
  original design's Non-Goals.
- **Not changing how `/demo`'s Step 1/2/4 bookkeeping works.** Discovery, the batch table, and
  verdict-application mechanics (label swap, follow-up filing) are unaffected — only Step 3's
  content and framing change.

## Architecture

### 1. Safety-net visual-review gate (`/wrap-up` Step 10)

Before composing the Verification Brief for a testable record (Step 2's existing testability
check in `verification-brief.md` already determines this), `/wrap-up` checks whether a *full*
`/visual-review` pass — an actual browser walk, not a `recommendation`-mode signal — already ran
for this run. The signal already exists verbatim in `/review`'s own summary
(`review-summary-template.md`'s `### Visual Review` section, `**Status:**` field): a value of
`Completed (code + visual)` or `Completed (code + visual, QA-enriched)` means a full pass ran; a
`Recommended — …` value means only `recommendation` mode ran (no browser walk); a `Skipped — …`
value means neither ran (e.g., no browser tools configured — see the escalation note below).

- **Already ran full** (the common case — anything through `/dispatch` → `/flow`, which defaults
  `/review` to `full`): skip straight to composing the brief from the existing report. No second
  invocation.
- **Did not run full** (standalone `/review` defaulted to code mode, or `/build` ran outside
  `/flow` entirely): invoke `/claude-tweaks:visual-review` now, using the same mode resolution
  `/review` Step 6 already applies (journey mode when a matching journey exists, else page/discover
  per `/visual-review`'s own detection). Any bug it finds — per the existing severity floors in
  `_shared/criteria-review-quality.md` (high/critical: broken layout, accessibility barrier,
  functional defect) — is fixed and reverified using the same fix-then-reverify mechanics
  `/review`'s Step 3 Routing already has. Medium/low findings (polish, consistency suggestions) are
  not "buggy" under this gate and flow into the brief as context, not a blocker. `demo:pending` is
  never applied until this resolves clean.
- **No interactive surface** (Step 2's existing non-testable determination): skip this gate
  entirely — matches "unless the work doesn't make sense to do a visual review."
- **Triggered but browser unavailable** (`/visual-review`'s own Step 1 prerequisite check reports
  `Skipped — browser tools not configured`, the same condition it already handles today): this is
  not a bug-found case — there is nothing to fix, only nothing to verify. Proceed without blocking,
  using the same auto-mode stage/skip semantics `/visual-review` already applies elsewhere (never a
  new failure mode invented here). The brief's Confirmed section falls back to text-only for this
  record: no screenshots, a note that visual verification wasn't available in this environment,
  and the diff/rationale as the fallback evidence — same shape as the non-testable case.

This makes "everything buggy found by visual review is handled before demo" true unconditionally,
without duplicating `/review`'s own machinery for the common path.

### 2. Verification Brief becomes a digest, not a fresh script

`verification-brief.md`'s Step 3 (content sourcing) is rewritten. Every tier converges on the same
self-contained shape instead of branching between "pointer to another skill" and "generic
fallback":

```markdown
## Verification Brief

### The ask
{condensed vision/why — pulled from the record's problem statement, not just the Acceptance
Criteria checklist; a human returning to a record days later needs to remember *why*, not just
*what to check*}

### What shipped
{one-paragraph summary of what changed, from the record body + diff}

### Confirmed
{testable:}
Visual review walked {journey/page name} — {clean | "found and fixed: {N} issues"}.
{1-3 committed screenshots, embedded inline via raw.githubusercontent.com URL}

{non-testable:}
Code review: {spec-compliance verdict + key quality notes, digested from /review's own summary}
{the actual diff, embedded or bounded to the most relevant hunks}

### See it yourself (optional)
{APP_URL}/{path} — {journey name, when applicable}
```

Story/journey matches now feed this template as their *source data* (which journey, which
screenshots, which findings) rather than being surfaced as a "go run this yourself" pointer. The
synthesized-walkthrough and non-testable tiers collapse into the same shape — the only branch left
is testable-with-evidence vs. non-testable-with-diff.

### 3. Screenshot durability

No `gh` CLI command or public GitHub REST endpoint uploads an image into an issue comment (verified
against this codebase — every existing screenshot reference, e.g. `browser-review.md`'s dispatcher
column mapping, points at a local run-artifact path, never an uploaded/embedded one). Durable
inline rendering in a GitHub issue requires the image to live at a stable URL, which means
committing it to the repo and referencing it via `raw.githubusercontent.com`.

- Cap: **1-3 key screenshots per record** — the most representative state(s) visual-review
  captured (e.g., the primary journey step's final screenshot), not the full per-step set. Bounds
  repo growth; the full screenshot set remains available as an uncommitted local run artifact for
  anyone still in the same environment.
- `work-backend: local-files` has no comment mechanism (existing constraint, per the original
  design and `_shared/work-record.md`) — the same committed-screenshot path is referenced via a
  relative repo path in the record body's own `## Verification Brief` section instead of a raw URL.
- Exact commit path/naming convention is a plan-level decision (candidates: a dedicated
  `docs/demo-evidence/{record}/` directory, or colocating under the existing
  `screenshots/browse/` convention with a durable subpath) — not fixed here.

### 4. `/demo` Step 3 walkthrough reframe

- The verdict prompt changes from generic ("Verdict for #N: {title}?") to vision/fit framed:
  **"Does {title} do what you asked for?"** — same three options (Approve / Request changes / Skip
  for now), different framing, because the brief itself now supports answering that question
  instead of a checklist-completion question.
- New **"Show me live"** option, available only for testable records with a resolved entry point:
  opens an `agent-browser` session at the resolved URL, following `/browse`'s conventions (session
  naming, lifecycle) directly — the same relationship `/visual-review` already has with `/browse`
  (a documented conventions dependency, not a workflow-step invocation; see `/browse`'s own
  Component-Skill Contract). For a human who isn't satisfied by the committed screenshots and wants
  to interact themselves. This is the one place `/demo` touches browser automation directly, and
  only on explicit human request — it does not change the skill's default (static evidence, no
  automation) for anyone who doesn't ask.

## Relationship to Existing Mechanisms (delta from the original design)

- **vs. `/review`** — unchanged as the code-quality/correctness gate. `/review` Step 6 remains the
  *only* place `/visual-review` normally runs; `/wrap-up`'s new gate is a safety net for the one
  path (`full` mode not selected) where it didn't, not a parallel implementation.
- **vs. `/visual-review`** — `/wrap-up`'s safety-net invocation and `/demo`'s "show me live" both
  reuse `/visual-review`'s existing mode resolution and dev-URL detection verbatim; neither
  reimplements journey/page resolution. `/visual-review` remains the sole agentic, step-by-step,
  bug-catching pass — `/demo` never replaces it, only cites its output or, on request, launches a
  bounded live look via `/browse`.
- **vs. `/browse`** — new relationship: `/demo`'s "show me live" option consumes `/browse`'s
  conventions directly (agent-browser session naming, lifecycle) the same way `/visual-review`
  does — not a workflow-step invocation of `/browse` itself — gated behind explicit human request
  rather than run automatically.

## Testing

- `bin/lib/issues/record.js` / `local-store.js` — unaffected; no taxonomy or facet-shape change in
  this revision.
- New coverage for the safety-net gate's detection logic (full-mode-ran vs. recommendation-only)
  and its fix-then-reverify loop — scoped as a plan-level task, likely prose/procedure verification
  (grep-based, matching this project's existing pattern for skill-file changes) rather than a new
  `bin/` unit suite, since this logic lives in skill prose, not a CLI module.
- Manual verification: run `/demo` against a record produced via the standalone
  `/build` → `/review` (code mode) → `/wrap-up` path and confirm the safety-net gate actually
  triggers a visual-review pass before `demo:pending` is applied.
- `npm test` must stay green throughout (no expected changes to existing suites — this revision is
  entirely skill-prose plus one new committed-screenshot path convention).

## Known Touch Points

- `skills/wrap-up/verification-brief.md` — Step 2 (testability) gains the full-mode-ran detection;
  new safety-net gate step inserted before Step 3; Step 3 (content sourcing) and Step 4 (compose +
  post) rewritten for the digest shape; screenshot commit + embed procedure added.
- `skills/wrap-up/SKILL.md` — Step 10's description updated to reflect the safety-net gate.
- `skills/demo/SKILL.md` — Step 3 rewritten (vision/fit verdict framing, new "Show me live" option
  wired to `/claude-tweaks:browse`); Anti-Patterns table gains a row for the reframed verdict
  question if warranted.
- `skills/review/SKILL.md` — Relationship-to-Other-Skills row for `/wrap-up` gains a note about the
  safety-net gate reusing Step 6's invocation (bidirectional update on `/wrap-up`'s own table too).
- `skills/visual-review/SKILL.md` — Relationship table gains rows for both new callers
  (`/wrap-up`'s safety-net gate, `/demo`'s "show me live"), mirroring how `/review`'s existing
  invocation is already documented there.
- `skills/browse/SKILL.md` — Relationship table gains a `/demo` row (new consumer).
- No taxonomy, label, `record.js`/`local-store.js`, or `README.md`/`CLAUDE.md` skill-count changes
  — this revision does not add or remove a skill, axis, or label.
- `.claude-plugin/plugin.json` — version bump (minor, per CLAUDE.md versioning rules) — check
  `origin/main` for a concurrent bump first, per the Releasing section's discipline.

## Prior Design

This revises behavior shipped by `2026-07-16-demo-skill-design.md` (v6.3.0). That document remains
the historical record of the Acceptance axis and `/demo`'s original shape; this document is
additive/corrective to its Architecture section, not a replacement.
