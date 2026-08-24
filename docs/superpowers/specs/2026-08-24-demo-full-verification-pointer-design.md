# Demo: Full-verification pointer on a decomposed sub-issue's Observation plan — Design

**Origin record:** #1194 (`needs:definition`, redirected through brainstorming by `/claude-tweaks:specify`)
**Date:** 2026-08-24
**Surface:** backend (skill prose + one `bin/lib` helper — the value this repo's own skill-prose records declare; `terminal` would route the design wrapper's terminal track at output that has no formatting contract of its own)

## Problem

For a sub-issue that is one slice of a decomposed feature whose user-facing behavior only exists
once later siblings ship (the repro: an early backend/data-layer slice of a webhook-driven
pipeline), `/claude-tweaks:demo #N` renders an Observation plan that is *correct* for the slice —
`Surface: cli`, `Entry point: {the record's scoped test command}` — and *silent* about the fact
that it is a slice: nothing says end-to-end verification is not yet possible, which sibling
records gate it, or what the eventual check looks like.

### Why it happens (audit, not speculation)

- `wrap-up/verification-brief.md`'s Routing sends every parent-linked sub-issue to the
  Parent-Gate Procedure **in place of** Steps 1-4. A decomposed sub-issue therefore never gets a
  wrap-up brief or `demo:pending`; its parent gets one gate once every sibling has closed.
- So `/demo #N` on an early slice always resolves through `demo/entry-paths.md`'s `#N` branch
  fallbacks — the closing-commit reconstruction (`verificationSurface` → `non-interactive` →
  `cli`/`diff`) or the `#N`-scoped session-recall — and neither composer knows the record is a
  sub-issue of anything.
- The "end-to-end verification lands on the parent" concept already exists in the system: the
  parent brief's inline walkthrough (`verification-brief-parent-gate.md`, Compose part 2),
  `parentGateState`'s `incomplete`/`due`, and `needsBackstop` skipping `hasParent` records. What
  is missing is a forward pointer *from* the sub-issue's own plan *to* that concept.
- Every input the pointer needs is derivable at demo time: the sub-issue-side parent resolution
  `review/cross-spec-promise-check.md` already performs, and the parent-side sibling enumeration
  (`sub_issues` / `parseSubIssues` / `queryRecords` by `parent`) the parent gate already performs.
  Sibling open/closed state is *live* at demo time — fresher than anything wrap-up could have
  written at build time.

## Decision

**Approach A — an optional schema block on the Observation plan, composed at demo time.**
The schema gains a `Full verification:` block; `/demo`'s two `#N`-branch composers populate it for
any parent-linked record from live parent/sibling state; the parent brief and wrap-up's Routing are
untouched.

### Alternatives rejected

- **Widen `/demo` to the parent's scope** when `#N` is a sub-issue with open siblings (the
  record's other stated option). The parent has no brief until its gate is `due`, the end-to-end
  check cannot run while siblings are unshipped, and it breaks both `/demo`'s one-item contract
  and the one-gate-per-parent invariant — the human would receive a walkthrough they cannot
  execute and a verdict with nowhere to land.
- **Have wrap-up post a (label-free) sub-issue brief carrying the pointer.** Richer builder
  context, but sibling state goes stale the moment it is posted, `/demo`'s `#N` lookup keys on
  `demo:pending` so the brief would not even be found without a second contract change, and it
  reintroduces the per-sub-issue ceremony the Routing rule exists to avoid.

## Design

### 1. Schema — `plugin/skills/_shared/observation-plan.md`

One optional block appended after `Inspect`, valid on every Surface kind:

```markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {…}
- Prepare: {…}
- Inspect: {…}
- Full verification: {present only on a parent-linked sub-issue}
  - Parent: #P {parent title}
  - Pending: #X {title} (open), #Y {title} (open)
  - Then: {one line — what a human triggers and observes once every sibling ships}
```

Grammar rules to add:

- `Full verification:` is optional and present **only** when the record has a resolvable parent.
  It never appears on a parentless record, and never on a parent brief (which carries its
  walkthrough inline in `### Confirmed` and has no Observation plan at all).
- Exactly three sub-bullets, in this order: `Parent:`, `Pending:`, `Then:`.
- `Pending:` lists every still-open sibling as `#N {title} (open)`, comma-separated, in ascending
  number order. When no sibling is open it reads `none — every sibling closed; parent gate
  {due|gated|resolved}` using `parentGateState`'s own vocabulary, so the human learns whether the
  parent's acceptance gate is already waiting for them.
- `Then:` is one line stating the trigger and the observable outcome of the whole feature — drawn
  from the parent body's design summary (`_shared/work-record.md`'s Decomposition rules: problem,
  chosen approach) — never a test command, never "run the suite". For the record's own repro that
  is e.g. "configure the GitHub webhook against the receiving endpoint, push a commit, and see the
  pipeline record appear in the dashboard".

Naming: the block is `Full verification`, deliberately **not** `Blocked-by:` — `Blocked by #N`
is already the parsed dependency-edge vocabulary (`record.js`'s `DEP_RE`,
`_shared/work-record.md`'s Decomposition rules), and a reader would take the same words in a
plan to mean an edge.

Producer statement to add to the schema file: the block is composed only by
`/claude-tweaks:demo`'s `#N`-branch composers (`demo/entry-paths.md`). `wrap-up/verification-brief.md`'s
Step 2 never composes it — its default path never sees a parent-linked record, because Routing
sends those to the Parent-Gate Procedure in place of Steps 1-4.

### 2. Producers — `plugin/skills/demo/entry-paths.md`, `#N` branch

Both fallback composers on the `#N` branch — the **closing-commit reconstruction** and the
**`#N`-scoped session-recall** — gain the same sub-procedure, stated once in that file and cited
from both:

1. **Resolve the parent**, exactly as `review/cross-spec-promise-check.md` does, per driver and
   `work-links`: `local-files` — `facets.parent`; `github-issues` + `body-text` — the `Parent: #N`
   line in this record's own body; `github-issues` + `native` — the sub-issue relationship queried
   from this record's own side. The native side has no query helper today (the prose says "query
   from this record's own side" without giving the query), so add `buildNativeParentQuery(numbers)`
   to `bin/lib/issues/record.js` beside `buildNativeSubIssuesQuery`: same aliased-batch shape
   (`i{n}: issue(number:{n}){ number parent{ number title state } }`), same `null` on empty input.
   `/demo` runs it via `gh api graphql` with `-F owner`/`-F repo` per `_shared/github-write-transport.md`'s
   read conventions. **No parent resolvable** → the block is omitted and nothing is rendered; this
   is the majority case and is silent by design.
2. **Enumerate siblings and their state** from the parent side, reusing the parent gate's own
   enumeration (`verification-brief-parent-gate.md`, "Enumerate the parent's sub-issues"):
   `sub_issues` (`native`), `parseSubIssues` over the parent body (`body-text`), or
   `queryRecords('specs', { parent })` open+closed (`local-files`); then one `gh issue view {n}
   --json state,title` per sibling (`github-issues`). Exclude the record in hand from `Pending:`.
   Fetch the parent's own labels in the same pass so `parentGateState` can name the gate state
   for the `none` case.
3. **Compose the block** per the schema above. `Then:` is authored by judgment from the parent's
   body, the same way the plan's Surface kind is picked by judgment rather than a classifier.
4. **Reconstruction's `### Confirmed`** — when the block is present, its opening reconstruction
   sentence gains one more: end-to-end behavior was not observable at this slice; see the plan's
   Full verification block. Nothing else in Confirmed changes.

The no-argument session-recall path has no record, hence no parent, and never composes the block.
The label-backed `demo:pending` path is unreachable for a parent-linked sub-issue by Routing, so
it needs no change; a parent brief has no Observation plan and is likewise untouched.

**Fail open, visibly.** Any `gh` failure in steps 1-2 (unavailable, unauthenticated, no remote,
GraphQL error, a sibling fetch failing) omits the block and states so in **one plain line above the
verdict**, naming which lookup failed — the same trace posture `_shared/design-contract.md`'s
malformed case takes in `/demo`, for the same reason: `/demo` is standalone-only with no run
directory, so that line is the only place the omission becomes distinguishable from a record that
simply has no parent. Never a silent omission.

### 3. Consumer — `plugin/skills/demo/SKILL.md`, Step 2 Show-first walkthrough

- **Show:** after the kind's own Show (the `cli` output, the `flow` walk, the rendered diff),
  render the `Full verification:` block verbatim when the plan carries one, then proceed to the
  Verdict. The verdict question stays about *this slice* — the block tells the human what the
  slice is not yet, it does not change what they are judging.
- **Anti-Patterns:** one new row — handing a sub-issue's `cli`/`diff` plan to a human as if the
  slice were the feature; the plan must say which siblings gate the real check and what that
  check is.

### 4. Docs

- `docs/skill-graph.md`: the wrap-up→demo row and the `## demo` section gain the new edge —
  `/demo` reads the same parent/sibling state the Parent-Gate Procedure reads, from the sub-issue
  side, to compose the `Full verification:` block; wrap-up never composes it.
- `docs/journeys/accept-built-work-via-demo.md`: the "Should understand" lines naming the plan's
  kinds and the parent-brief exception gain the block and its sub-issue-only scope.

### 5. Tests

- `tests/bin-lib/issues/record.test.js` (the suite that already pins `buildNativeSubIssuesQuery`
  at its line ~517): `buildNativeParentQuery` — `null` on empty/non-array input; one alias per
  number; the `parent{ number title state }` selection present.
- A prose-conformance test (per the repo's `skill-prose-conformance-tests` skill): pins that
  `observation-plan.md` declares the `Full verification:` block with its three sub-bullets, that
  `demo/entry-paths.md` cites `buildNativeParentQuery` and the fail-open line, and that
  `demo/SKILL.md`'s Show renders the block. Proved red by reverting before it lands.
- `tests/bin-lib/issues/acceptance.test.js` is unchanged — `verificationSurface` is still the
  floor classifier, unmodified.

## Error handling

Covered in §2: every lookup failure fails open with a visible one-line trace; no failure ever
blocks the walkthrough or the verdict.

## Non-goals

- **Parentless Step 2.6 collapse.** A collapsed decomposition (≤ 2 units, `Blocked by` edges, no
  parent) has no parent gate to point at; those records already get their own wrap-up brief, and
  the dependency is one visible body line. Pointing a blocker at its dependents would need a
  reverse `blockedBy` lookup and a different target — out of scope, revisit only if it bites.
- Any change to `wrap-up/verification-brief.md`'s Routing or to the parent brief's inline
  walkthrough.
- Widening `/demo` to parent scope, or any change to its one-item-at-a-time contract.
- A `Blocked-by:` line in the Observation plan (see the naming note in §1).

## Sizing

One work unit — the schema block, the two composers, the Show render, the helper + tests, and
the doc edges are one coherent contract change that a reader can only verify together. A
decomposition into separate schema/producer/consumer records would ship a schema nobody writes
or a writer nobody renders in between.
