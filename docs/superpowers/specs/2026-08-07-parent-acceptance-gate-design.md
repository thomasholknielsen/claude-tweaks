# Parent-Record Acceptance Gate — Design

Give a `/claude-tweaks:specify` decomposition's parent record a demoable end-to-end
checkpoint, so a multi-leaf family reaches an explicit human verdict on the assembled
whole rather than only on its parts.

## Problem

`/claude-tweaks:specify`'s decomposition heuristics cut a design along layer lines —
data layer, then API, then UI (`skills/specify/decomposition-mode.md:119-132`). The
worked example in that file produces `73 → 74 → 75`, a strictly serial chain in which
no single leaf is independently demoable. The chain buys no parallelism either: the
leaves block each other, so a layered cut of one feature is serial *and* checkpoint-free.

Cutting that way makes every failure land on the seam *between* leaves, which per-leaf
review cannot see by construction. The incident log is largely made of this shape —
`[IL-02]`, `[IL-04]`, `[IL-10]`, `[IL-56]`, `[IL-97]` are all cross-boundary defects that
each task's own review passed. The response so far has been a mitigation rather than a
prevention: CLAUDE.md's Releasing section now makes the whole-branch review gate the
version bump, because v6.48.0 shipped a Critical that per-task review could not have
caught (`[IL-97]`).

There is a record that *should* hold the family-level verdict — the parent — and it holds
nothing.

**The parent sits in a double blind spot.** Both existing acceptance sweeps miss it, for
different reasons:

| Sweep | Consumer | Why it cannot see a parent |
|---|---|---|
| `acceptance-queue` | `/help` Stage 4.7 | Lists records carrying `demo:pending`. Only `/wrap-up` writes that label (`skills/wrap-up/verification-brief.md:201`, the sole `--add-label demo:pending` in the repo), and parents never reach `/wrap-up` because they never get `ready`. |
| `acceptance-gap` | `/tidy` Step 4.8 | `needsBackstop` returns `false` unless `record.state === 'CLOSED'` (`bin/lib/issues/acceptance.js:57`). Nothing anywhere closes a parent. |

So a decomposed feature can be fully built, fully closed, and never receive a single
statement that the assembled thing works.

## Measured state

Every claim below was verified against the tree at v6.53.0 (`origin/main`, 2298 tests
passing) — not against the snapshot this design was first sketched on, which was 31
commits stale.

| Fact | Evidence |
|---|---|
| Parents are created with no labels | `recordPayload` "returns zero labels for the parent" — `skills/specify/record-creation.md:58` |
| Parents never become `ready` | `skills/_shared/work-record.md:195` |
| `demo:pending` has exactly one *procedure* that writes it | `skills/wrap-up/verification-brief.md`. **Not one caller** — upstream v6.57.1 added two more (`wrap-up/review-console.md`'s auto-merge short-circuit, `dispatch/settle-and-merge.md`'s group gate), which is why this design's leaf-skip condition lives in that procedure's own header rather than in any caller |
| `needsBackstop` requires CLOSED | `bin/lib/issues/acceptance.js:57` |
| Nothing closes a parent | No match repo-wide for a parent-closing path |
| Promise register threshold | `promise-register-min-leaves`, default `4` — `bin/lib/policy-schema.js:37` |
| Register is github-issues only | Permanent `local-files` exclusion — `skills/specify/record-creation.md:225` |
| Register is not a hard gate | `skills/review/SKILL.md:173-175` |
| Trust cells count all closed records | `trustRows`' `closed` filter and its `cell.total += 1` — `bin/lib/issues/trust.js` |
| Trust verdict floor | `total >= MIN_SAMPLES (8) && dispositioned >= MIN_VERDICTS (5)`, plus a rendered `coverage = dispositioned / total`, `notPlanned` not a verdict input — `bin/lib/issues/trust.js`. **Superseded upstream after this table was first written**; the row above and the Trust-population section were re-derived against the merged module, and this is the shape they were re-derived against |

## Decisions

Four decisions were taken before this document was written. They are recorded here with
what was rejected, because each one closes off a design space someone will otherwise
reopen.

**1. The parent replaces leaf demos; it does not stack on top of them.** A leaf with a
resolvable parent never receives `demo:pending`. One human verdict per family instead of
N. Rejected: stacking (N+1 verdicts per decomposition, directly against the throughput
priority this whole change serves) and a surface-aware split (a leaf keeps its own gate
when `verificationSurface()` reports `interactive`) — the split is defensible and closes
the stall hole below, but adds a conditional branch to an already-dense lifecycle for a
benefit the parent gate largely subsumes.

**This narrows a guarantee that shipped in v6.50.0**, and the narrowing is deliberate.
That release's stated invariant was that *every closed work record* reaches an explicit
acceptance disposition on every closing path — "silence stops being a valid outcome."
After this design the invariant reads: every closed record **that is not a decomposed
leaf**, plus every completed family, reaches an explicit disposition. The unit changes
from record to family; silence is still not a valid outcome for a family. The live
statement of the old reach is `skills/wrap-up/SKILL.md:416`'s Anti-Patterns row ("the
Acceptance axis applies uniformly"), which was true when written and which nothing
contradicts on its own — the `[IL-93]` shape. Amending that row is part of the work, not
an afterthought.

**2. Eager writer plus sweep backstop.** `/wrap-up` applies the gate when it closes the
last open leaf; a new `/tidy` scope independently finds families that are complete but
un-gated. This mirrors the pairing the codebase already uses one level down —
`acceptance-queue` is the eager path, `acceptance-gap` the backstop. The backstop is
load-bearing, not belt-and-braces: a leaf closed via `auto:merge`, by hand, or by a
dispatch that ends early never runs `/wrap-up` at all. Rejected: wrap-up alone (silent
permanent gaps) and sweep alone (the checkpoint arrives whenever hygiene happens to run).

**3. The brief is seams plus one end-to-end path.** Every `## Cross-Spec Promises` row
becomes an explicit verification item, and the brief additionally walks the feature's
primary path end to end. Rejected: seam items alone (catches broken contracts but not a
feature that is wrong while every contract holds, and produces an empty brief below the
register threshold) and a roll-up digest (re-presents per-leaf evidence that per-leaf
review already produced, adding a click without adding information).

**4. Decomposed leaves leave the trust population.** See *Trust population*, below.

## Architecture

### The predicate

One new pure export in `bin/lib/issues/acceptance.js`, matching that module's existing
style — data in, verdict out, no I/O:

```js
familyGateState({ leaves, parentLabels })
// leaves: [{ number, state }]   parentLabels: [string]
// → 'incomplete' | 'due' | 'gated' | 'resolved'
```

| State | Meaning | Actor |
|---|---|---|
| `incomplete` | At least one leaf still open | none |
| `due` | All leaves closed, parent carries no `demo:*` | `/wrap-up` or `/tidy` applies the gate |
| `gated` | Parent carries `demo:pending` | `/demo` takes the verdict |
| `resolved` | Parent carries `demo:approved` or `demo:changes-requested` | none |

An empty `leaves` array resolves to `incomplete`, never `due` — a parent with no
discoverable leaves is a resolution failure, and treating it as a complete family would
gate a feature nobody built.

`needsBackstop` gains an optional `hasParent` field and returns `false` when it is
explicitly `true`. The check is on the literal boolean, not truthiness of a
default-constructed object — `[IL-31]`. An absent field preserves today's behavior, which
keeps human-filed and `/capture`d records working unchanged.

`acceptance.js` is the right home: its own header declares it the source of this
classification for `wrap-up/verification-brief.md`, `demo/SKILL.md`, and
`_shared/github-pr-scan.md`, all of which call in rather than restate.

### Finding parents

The sweep must enumerate parents cheaply, and today nothing marks one. `recordPayload`
emits zero labels, and the `{design-doc-slug}:parent` fingerprint is a body marker
reachable only through `gh issue list --search` — which `record-creation.md:90`
deliberately avoids, since that rides the search index.

So the parent gains one label at creation: **`family:parent`**, bootstrapped through
`_shared/label-bootstrap.md` like every other label in the taxonomy. This is a deliberate
reversal of "parents carry no labels," named here rather than smuggled in. The
alternative — deriving the parent set by walking every leaf's `Parent: #N` line — costs a
full issue-body scan per sweep and fails under `work-links: native`, where leaves carry no
such line.

**`hasParent` is resolved from the parent side, never the leaf side.** This matters
because the two `work-links` modes express the link asymmetrically: `body-text` writes
`Parent: #N` onto the leaf, `native` writes nothing onto the leaf and expresses the
relationship as a sub-issue. A leaf-side lookup would therefore work in one mode and
silently return `false` for every leaf in the other — a failure that produces no error, just a
quietly wrong trust table.

The corollary, which the first implementation missed: **every place that branches on
`work-links` must carry a way to resolve it.** Two branches with no resolution step is a branch
pair that always takes the first one, and under `native` the `body-text` branch returns nothing
rather than failing. This bites hardest in the procedures a dispatcher inlines into a subagent
prompt, since a subagent cannot read the sibling file the key is documented in.

The resolution is uniform: query `family:parent` (one cheap label query, few records),
then collect each parent's own leaf numbers — from its task list under `body-text`, from
its sub-issues under `native`. Both modes answer this from the parent. Every record number
in that union gets `hasParent: true`; everything else is left absent, not `false`, so
`needsBackstop`'s explicit-`true` check stays meaningful.

### Write sites

| Skill | Change |
|---|---|
| `/specify` | Parent created with `family:parent`. No other change. |
| `/wrap-up` | When the record has a resolvable parent: skip its own acceptance labeling entirely. Then evaluate `familyGateState`; on `due`, compose the parent brief and apply `demo:pending` to the parent. **The condition lives in `verification-brief.md`'s own Routing header, not in the caller** — the other two callers of that procedure (`wrap-up/review-console.md`'s auto-merge short-circuit, `dispatch/settle-and-merge.md`'s group gate) inherit it there, and an `auto:merge`'d leaf is exactly the population the `/tidy` backstop exists for. |
| `/tidy` | New `family-gate` scope in `_shared/github-pr-scan.md` for families reading `due`. Existing `acceptance-gap` scope passes `hasParent: true` for parent-linked leaves. |
| `/demo` | Parent entries resolve through the existing label-backed branch. On **approve**, additionally close the parent. On **changes-requested**, existing follow-up filing applies and the parent stays open. |
| `/help` | **No change.** Stage 4.7 queries `--label demo:pending --state all`, so gated parents appear for free. |

The `acceptance-gap` edit is not optional polish. Under decision 1 every leaf closes
un-dispositioned by design, so without it that scope emits a row per leaf — on a scope
whose own documentation already warns it "returns a three-digit set on every run"
(`_shared/github-pr-scan.md:180-185`). Adding `hasParent` to `needsBackstop` without
updating that scope's `node -e` caller changes nothing at all, which is the `[IL-02]`
trap in this change: a producer whose consumer sits in a different file.

### Ordering

`/wrap-up` evaluates the gate while closing the very leaf it is running on. If the
predicate reads that leaf's state from `gh`, the last leaf always evaluates `incomplete`
and the gate never fires — a same-function self-inconsistency of the `[IL-65]` kind, and
one no test would catch because the failure is a no-op.

`/wrap-up` therefore passes its own record as `state: 'CLOSED'` regardless of what `gh`
currently reports, overriding the fetched value for that one record.

### The brief, and the Non-Goal it preserves

Two parts:

1. **Seam items** — one verification item per `## Cross-Spec Promises` row, phrased as the
   claim to confirm: *"F1: #48 assumed #46 exposes `getStatus()` — confirm it does."*
2. **One end-to-end path** — a walkthrough of the feature's primary path across the
   assembled leaves. For a markdown/skill repo the runnable unit is a skill invocation,
   not a deploy; the brief names the invocation and the observable outcome.

Rows still `open` at gate time appear as **unverified items**. They do not block the gate
from opening. This is deliberate and preserves the register's stated Non-Goal — that it is
"not a hard gate anywhere" (`skills/review/SKILL.md:173-175`) — the register informs the
human, and the human is the gate. Where no register exists (below `promise-register-min-leaves`,
or `work-backend: local-files`), the walkthrough alone is the brief.

### Trust population

**Re-derived against the merged module, not the one this design was sketched against.**
`trust.js` changed on `origin/main` while this branch was in flight and arrived with the
v6.59.0 merge: the `dispositioned >= 1` floor is gone, replaced by `MIN_VERDICTS = 5` plus a
rendered `coverage = dispositioned / total` ratio, and `notPlanned` left the verdict entirely.
The live formula is:

```js
const dispositioned = cell.approved + cell.changesRequested;
const coverage = cell.total === 0 ? 0 : dispositioned / cell.total;
if (cell.kind !== UNGRADABLE_KIND && cell.total >= MIN_SAMPLES && dispositioned >= MIN_VERDICTS) {
  verdict = (cell.changesRequested === 0 && cell.followUps === 0) ? 'clean' : 'mixed';
}
// MIN_SAMPLES = 8, MIN_VERDICTS = 5
```

The worked example this section used to carry — seven leaves plus one approved parent →
`total = 8`, `dispositioned = 1` → `clean` — **no longer describes the module.** One
disposition is under `MIN_VERDICTS`, so that cell now reads `insufficient-evidence`. The
one-click-manufactured `clean` is closed on its own.

**The conclusion still holds, for a different and now-primary reason: leaves dilute coverage
while clearing `MIN_SAMPLES` on evidence nobody produced.** Work the numbers on a class whose
volume is decomposed families — the case this design creates:

| | five 7-leaf families, parents approved | eight 7-leaf families, parents approved |
|---|---|---|
| Leaves counted | `total` 40, `dispositioned` 5 → **`clean` at 13% coverage** | `total` 64, `dispositioned` 8 → **`clean` at 13% coverage** |
| Leaves excluded | `total` 5 → `insufficient-evidence` (under `MIN_SAMPLES`) | `total` 8, `dispositioned` 8 → **`clean` at 100% coverage** |

Both floors are cleared either way once enough families accumulate; what differs is what the
cell's numbers then mean. With leaves counted, `MIN_SAMPLES` is satisfied by 35 records nobody
examined while `MIN_VERDICTS` is satisfied by the 5 parents alone — exactly the split
`trust.js`'s own filter comment names ("counting leaves here would let `total >= 8` be satisfied
by records nobody judged"). The module accepts low coverage by design and mitigates it with the
Coverage column, on the stated assumption that "the counts sit beside the verdict and a human
reads both." Decomposition breaks that assumption in a specific way: it manufactures low coverage
*structurally*, on every family, rather than as an artifact of one class's filing habits — and
the module's own commentary is that "a governor reads the verdict alone."

**Resolution, unchanged:** if the family is the unit of acceptance, the family is the unit of
evidence. `trustRows` skips closed records with `hasParent: true`, so a decomposed family
contributes exactly one graded record — its parent — to `cell.total`. It reuses the `hasParent`
signal introduced for `needsBackstop`, so this is one new field with two consumers rather than
two mechanisms. A useful side effect: with leaves excluded, a family-heavy class has
`total ≈ dispositioned`, so `MIN_SAMPLES` (8) becomes the single binding floor and
`MIN_VERDICTS` (5) is subsumed — the cell's size and its evidence stop being separable numbers,
which is the state the Coverage column exists to reveal when they are not.

Previously rejected here — "also raising the `dispositioned >= 1` floor" — has since shipped
upstream as `MIN_VERDICTS`. It closed the manufactured-`clean` hole; it did not close the
coverage-dilution one, which is what this section now rests on.

## Error handling

Every path fails open. The gate is an aid to a human decision, not a correctness
mechanism, and a failure to compute it must never block a wrap-up or a review.

| Condition | Behavior |
|---|---|
| `gh` unavailable, unauthenticated, or no GitHub remote | Skip silently. Same posture as `/review` Step 1.6. |
| Parent unresolvable (human-filed or `/capture`d record) | No-op. The leaf keeps today's own `demo:pending` behavior rather than being silently un-gated. |
| `work-backend: local-files` | Gate applies; brief is walkthrough-only, since no register can exist. |
| Leaf enumeration returns empty | `incomplete`, never `due`. |

## Testing

`bin/lib/issues/tests/acceptance.test.js` already exists, so no new glob is needed in
`package.json` — `[IL-84]` applies only to new `bin/lib/{name}/tests/` directories.

- `familyGateState` — a case table across all four states, plus the empty-`leaves` edge
  and a parent carrying both `demo:pending` and a resolved label (the partial-write case
  `ACCEPTANCE_BY_LABEL`'s ordering comment already anticipates).
- `needsBackstop` — a pair pinning that `hasParent: true` suppresses and `hasParent`
  absent preserves current behavior.
- `trustRows` — a cell whose members are parent-linked leaves must not reach
  `MIN_SAMPLES` on their strength alone. This is the test that would have caught the
  manufactured-`clean` path.

Each new case is checked against the un-patched module first, to confirm it actually
fails before the change makes it pass.

## Risks

**The checkpoint is still at the end of a family.** This design does not make slices
vertical; it makes the end-to-end check exist, be findable, and be enforced. What keeps
"at the end" from meaning "an afternoon of surprises" is the promise register doing real
work per-leaf-review along the way — and that register only exists at or above four leaves
and only under `work-backend: github-issues`. Below that threshold the gate is a
walkthrough with no seam items, which is weaker.

**Excluding leaves shrinks the trust population.** Decision 4 is right in principle but
has a cost: families now contribute one record to `cell.total` instead of N, so cells
reach `MIN_SAMPLES` more slowly. On a repo where much of the closed-record volume is
decomposed leaves, this could push cells back to `insufficient-evidence` for some time.
That sharpens the earned-autonomy design's own Open Question 1 rather than answering it.
The real population impact should be measured against live data before this ships.

**A stalled family gets no disposition at all.** Under decision 1, a decomposition whose
leaves land weeks apart — which the promise-tracking design calls the dominant workflow —
carries zero acceptance evidence until the last leaf closes, and a family abandoned
half-built never gets any. This is the hole the rejected surface-aware split would have
closed. Accepted deliberately; `/tidy`'s `family-gate` scope makes such families visible
even though it cannot gate them.

## Non-goals

- Changing `/specify`'s decomposition heuristics. The layer-cut question is real (see
  *Problem*) but re-slicing is a separate change; this design makes the resulting chain
  checkpointed, not vertical.
- Making the promise register a hard gate. Explicitly preserved as a Non-Goal above.
- Grading or gating non-decomposed records differently. A record with no parent behaves
  exactly as it does today.

## Adjacency

Two pieces of `docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md` touch
this, neither overlapping it:

- **Phase 4's "verdict-only-where-it-matters routing"** in `/demo` also reduces verdict
  count, but along a different axis: that one drops verdicts for classes that have earned
  trust, this one collapses N leaf verdicts into one family verdict. They compose, and
  whoever builds Phase 4 should know the unit it is filtering may already be a family.
- **That design's Open Question 1** — the minimum sample count before a cell may move off
  `supervised` — is made more pressing by decision 4, which lowers sample counts.

## Open questions

1. ~~Should `trust.js`'s `dispositioned >= 1` floor be raised so a cell cannot be graded on
   a single disposition?~~ **Answered upstream, before this branch merged.** The floor is now
   `MIN_VERDICTS = 5`, and a `coverage = dispositioned / total` ratio is rendered beside every
   verdict. That closes the single-disposition hole this question was about. It does not close
   the coverage-dilution one — see *Trust population* above, which was re-derived against the
   merged module and now rests on that instead.
2. What is the live population impact of excluding parent-linked leaves from the trust
   table — how many of the 118 closed records are decomposed leaves? Measurable with one
   `gh` query before implementation.
