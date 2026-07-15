# cross-spec-promise-tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize the ad hoc spec-13-23 "promise register" pattern into a repeatable mechanism
that survives past the pipeline run that creates it — a `## Cross-Spec Promises` section on a
decomposition's parent GitHub issue, seeded by `/specify` and maintained by ordinary `/review`.

**Architecture:** An additive, sibling parser (`parseDependencyAssumptions`) alongside the
existing `parseDependencies`/`DEP_RE`; a new `Parent: #N` body-metadata line for the one link mode
that currently has no way to resolve a leaf's own parent; a new decomposition-time seeding step in
`/specify`; a new, non-blocking `/review` step that checks and maintains the parent's promises
section on every parent-linked record's own review, regardless of dispatch mode.

**Tech Stack:** Node.js (`node --test`, no new dependencies), Markdown skill files (prose
procedure — this project's plugin content, per `CLAUDE.md`).

## Global Constraints

- `promise-register-min-leaves` default: `4`.
- `bin/lib/issues/record.js`'s existing `parseDependencies` and `DEP_RE` are never modified — the
  new parser is a separate, additive function. Verified in Task 6.
- No new file format, skill, or storage branch. The register lives entirely on the parent GitHub
  issue (body + comments) — see the design doc's Non-Goals.
- The `/review` Step 1.6 check (Task 4) never blocks the review's own PASS/BLOCKED verdict — it
  only updates the parent record's promises section and, when relevant, notes something in the
  summary.
- Do **not** edit `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`, its
  implementation plan, or its worktree (`assess-agent-autonomy-impl`) — that work is in-flight on
  a separate branch; the `grant-check` amendment this design documents is an explicit follow-up,
  not part of this plan (see the design doc's Coordination Note).
- All commits in this plan are plain (no `refs #N` trailer) — this design has no GitHub record
  filed against it yet.
- All work happens in the existing worktree
  `.claude/worktrees/cross-spec-promise-tracking-design` (branch
  `worktree-cross-spec-promise-tracking-design`) — every command below assumes that as the working
  directory.

---

### Task 1: `bin/lib/issues/record.js` — `parseDependencyAssumptions` (pure, tested)

**Files:**
- Modify: `bin/lib/issues/record.js:39` (add new regex + function near `DEP_RE`/`parseDependencies`), `:235-238` (module.exports)
- Test: `bin/lib/issues/tests/record.test.js:187-204` (add new test block after the existing `parseDependencies` tests)

**Interfaces:**
- Produces: `parseDependencyAssumptions(body: string): Array<{ number: number, assumption: string }>` — Task 3 and Task 4's prose reference this exact name. Returns one entry per line matching `Blocked by #N: {text}` (trailing colon + text), in order of appearance. A bare `Blocked by #N` line (no colon) contributes nothing to this list — it is not present with `assumption: null`.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/issues/tests/record.test.js`, immediately after the existing `parseDependencies` test block (after line 203's closing `});`):

```js
// AC — dependency assumptions (cross-spec-promise-tracking)

test('parseDependencyAssumptions captures trailing text after the colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #14: needs getStatus() to exist'),
    [{ number: 14, assumption: 'needs getStatus() to exist' }],
  );
});

test('parseDependencyAssumptions handles multiple lines in order of appearance', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #12: first thing\nBlocked by #7: second thing'),
    [
      { number: 12, assumption: 'first thing' },
      { number: 7, assumption: 'second thing' },
    ],
  );
});

test('parseDependencyAssumptions omits bare Blocked-by lines with no colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #12\nBlocked by #7: has text'),
    [{ number: 7, assumption: 'has text' }],
  );
});

test('parseDependencyAssumptions returns an empty array when there are no assumption lines', () => {
  assert.deepStrictEqual(parseDependencyAssumptions('Blocked by #9\nno colon here'), []);
});

test('parseDependencyAssumptions ignores mid-line occurrences (line-anchored only)', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('see Blocked by #9: mid-line text'),
    [],
  );
});

test('parseDependencyAssumptions trims leading whitespace after the colon', () => {
  assert.deepStrictEqual(
    parseDependencyAssumptions('Blocked by #3:    padded text'),
    [{ number: 3, assumption: 'padded text' }],
  );
});
```

Update the `require` block at the top of the file (currently `const { ..., extractFingerprint, parseRecordFacets, parseDependencies, specShapedBody } = require('../record');`) to also destructure `parseDependencyAssumptions`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: FAIL — `parseDependencyAssumptions is not a function` (or `is not defined`), 6 new failing tests, the 39 pre-existing tests still pass.

- [ ] **Step 3: Implement the minimal code**

In `bin/lib/issues/record.js`, immediately after the existing `DEP_RE` declaration (line 39: `const DEP_RE = /^Blocked by #(\d+)\b/gm;`), add:

```js
// Line-anchored 'Blocked by #N: {text}' assumption declarations (multiline) —
// a separate, additive sibling to DEP_RE/parseDependencies below, never a
// modification of either. DEP_RE already stops matching at the number, so a
// trailing ': {text}' parses under it with zero changes; this regex only
// exists to capture that trailing text when a caller wants it.
const DEP_ASSUMPTION_RE = /^Blocked by #(\d+):\s*(.+)$/gm;
```

Immediately after the existing `parseDependencies` function (after its closing `}` on line 199, before the `specShapedBody` comment), add:

```js
// body -> array of {number, assumption} for every line-anchored
// 'Blocked by #N: {text}' declaration, in order of appearance. A bare
// 'Blocked by #N' line (no colon) contributes nothing here — parseDependencies
// above is still the only reader of bare dependency lines. Not deduped by
// number: a caller writing the same N twice with different text gets both
// entries back, same as matchAll would naturally produce.
function parseDependencyAssumptions(body) {
  if (typeof body !== 'string' || !body) return [];
  const result = [];
  for (const match of body.matchAll(DEP_ASSUMPTION_RE)) {
    result.push({ number: Number(match[1]), assumption: match[2] });
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS — all 45 tests (39 pre-existing + 6 new).

- [ ] **Step 5: Export the new function**

Find (`bin/lib/issues/record.js`, current `module.exports`):

```js
module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, parseRecordFacets, parseDependencies,
};
```

Replace with:

```js
module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, parseRecordFacets, parseDependencies,
  parseDependencyAssumptions,
};
```

- [ ] **Step 6: Run the full test file once more to confirm the export works from outside the module**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS — all 45 tests (the new tests import `parseDependencyAssumptions` from `../record`, so this also validates the export line).

- [ ] **Step 7: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Add parseDependencyAssumptions to record.js

Additive sibling to parseDependencies/DEP_RE — reads the optional
trailing ': {text}' on a 'Blocked by #N' line. DEP_RE already stops
matching at the number, so this needed no change to the existing
parser or its consumers (dispatch's queue filter)."
```

---

### Task 2: `skills/_shared/work-record.md` — document the convention

**Files:**
- Modify: `skills/_shared/work-record.md`

**Interfaces:**
- Consumes: `parseDependencyAssumptions` (Task 1) — referenced by name in prose, not called from
  this file.
- Produces: the `Blocked by #N: {assumption}`, `Parent: #N`, and `## Cross-Spec Promises`
  conventions Task 3 and Task 4 implement against.

- [ ] **Step 1: Add a bullet to Decomposition rules**

Find:

```markdown
- **Only leaf records get `ready`** (+ scoring). Leaves link to the parent (sub-issue when
  `work-links: native`; parent task-list + `Blocked by #N` body lines when
  `work-links: body-text`).
```

Replace with:

```markdown
- **Only leaf records get `ready`** (+ scoring). Leaves link to the parent (sub-issue when
  `work-links: native`; parent task-list + `Blocked by #N` body lines when
  `work-links: body-text`).
- **`Blocked by #N` may carry an optional assumption**: `Blocked by #N: {assumption}` — the colon
  and trailing text are optional; a bare line means exactly what it means today.
  `parseDependencies`/`DEP_RE` are unchanged (they already stop matching at the number);
  `parseDependencyAssumptions` (`bin/lib/issues/record.js`) reads the trailing text when present.
  See Cross-Spec Promise Tracking, below.
```

- [ ] **Step 2: Add the Cross-Spec Promise Tracking subsection**

Find (the section immediately following Decomposition rules):

```markdown
## Fingerprint marker
```

Replace with:

```markdown
## Cross-Spec Promise Tracking

A decomposition of `>= promise-register-min-leaves` leaves (Config keys, below) gets a
`## Cross-Spec Promises` section on the **parent** record's body, seeded by `/specify` and
maintained by `/claude-tweaks:review`'s Step 1.6 on every parent-linked leaf's own review — not
gated on the leaves being built together in one multi-spec `/flow` batch, since the dominant
workflow dispatches leaves independently, possibly weeks apart. This formalizes the ad hoc
"promise register" pattern from the spec 13-23 build (see
`docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md`), which caught 3 real
cross-spec breaks but previously lived in a gitignored pipeline directory and died with the run
that created it.

**The register** lives on the parent as two GitHub primitives, not a new file: a
`## Cross-Spec Promises` table in the body (current-state truth, edited in place) and issue
comments (the chronological reconciliation log). Format:

```
| # | Promise | Owner (#leaf) | Status |
|---|---------|-----------------|--------|
| F1 | leaf #48 assumes leaf #46: exposes getStatus() | #48 | open |
```

**`Parent: #N`** — a decomposition-mode-only body-metadata line (`spec-template.md`), present on a
leaf's body only under `work-backend: github-issues` + `work-links: body-text` — the one
combination where nothing else records a leaf's own parent (`work-links: native`'s sub-issue
relationship is queryable from either side; `local-files` carries `facets.parent`). This is what
lets `/claude-tweaks:review`'s Step 1.6 resolve a leaf's parent without a native relationship to
query.

## Fingerprint marker
```

- [ ] **Step 3: Add the config key**

Find:

```markdown
| `dispatch-pick-max-concurrent` | `3` | Max concurrent groups a bare `/dispatch` multi-pick may run |
```

Replace with:

```markdown
| `dispatch-pick-max-concurrent` | `3` | Max concurrent groups a bare `/dispatch` multi-pick may run |
| `promise-register-min-leaves` | `4` | Minimum leaf count in one `/specify` decomposition before a `## Cross-Spec Promises` section is seeded on the parent record |
```

- [ ] **Step 4: Extend the `/specify` row in the Consumers table**

Find:

```markdown
| `/specify` | Shapes records to spec shape; decomposes designs into parent + `ready` leaves |
```

Replace with:

```markdown
| `/specify` | Shapes records to spec shape; decomposes designs into parent + `ready` leaves; seeds `## Cross-Spec Promises` on the parent for decompositions at or above `promise-register-min-leaves` |
```

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/work-record.md
git commit -m "Document Cross-Spec Promise Tracking in work-record.md

New Blocked-by-#N assumption convention, Parent: body line, the
promise-register-min-leaves config key, and the Cross-Spec Promise
Tracking contract section. Implements
docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md."
```

---

### Task 3: `skills/specify/spec-template.md` + `skills/specify/SKILL.md` — seed the register

**Files:**
- Modify: `skills/specify/spec-template.md` (metadata block section)
- Modify: `skills/specify/SKILL.md` (Step 3 Leaves subsection; Step 4 Linking subsection; Step 4 Decision Rationale and Assumptions subsection)

**Interfaces:**
- Consumes: `_shared/work-record.md`'s Cross-Spec Promise Tracking contract (Task 2).
- Produces: the `Parent: #N` line and `## Cross-Spec Promises` section Task 4's `/review` Step 1.6
  reads.

- [ ] **Step 1: Add `Parent:` to `spec-template.md`'s metadata block**

Find (`skills/specify/spec-template.md`):

```markdown
Every record body opens with a short metadata block — plain body-metadata lines, never YAML frontmatter. `Surface:` and `Design-intent:` are lifted verbatim into the materialized header by `/flow`/`/build` at build time (spec 20's contract). Legacy `frontend` (pre-migration spec frontmatter) reads as `web`; `mixed` is retired — pick the single dominant surface per leaf, since a unit that is genuinely both frontend and backend at once is a decomposition smell.

```markdown
Surface: {web | mobile | desktop | backend | infra}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
```
```

Replace with:

```markdown
Every record body opens with a short metadata block — plain body-metadata lines, never YAML frontmatter. `Surface:` and `Design-intent:` are lifted verbatim into the materialized header by `/flow`/`/build` at build time (spec 20's contract). Legacy `frontend` (pre-migration spec frontmatter) reads as `web`; `mixed` is retired — pick the single dominant surface per leaf, since a unit that is genuinely both frontend and backend at once is a decomposition smell. `Parent:` is decomposition-mode-only, present on a leaf's body only under `work-backend: github-issues` + `work-links: body-text` — the one combination with no other way to record a leaf's own parent (`work-links: native`'s sub-issue relationship is queryable from either side; `work-backend: local-files` carries `facets.parent`). `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) reads it to resolve a leaf's parent when checking for a `## Cross-Spec Promises` section (`_shared/work-record.md`).

```markdown
Surface: {web | mobile | desktop | backend | infra}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Parent: {#N — decomposition-mode leaves under work-links: body-text only; omitted for work-links: native, local-files, and Shaping mode}
```
```

- [ ] **Step 2: Write `Parent:` during leaf creation (`specify/SKILL.md` Step 3)**

Find:

```markdown
**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents, just run once per leaf instead of once per shaped record.
```

Replace with:

```markdown
**Body** — spec-shaped per `spec-template.md`'s record body template, prefixed with the metadata block (`Surface: {value}` and, when the unit is frontend-flavored, `Design-intent: {value}`) — the identical per-record procedure Shaping mode's Metadata block subsection already documents, just run once per leaf instead of once per shaped record. Under `work-backend: github-issues` + `work-links: body-text`, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a leaf's own parent (`spec-template.md`).
```

- [ ] **Step 3: Write the assumption text during linking (`specify/SKILL.md` Step 4)**

Find:

```markdown
- Leaf ↔ leaf / leaf ↔ pre-existing record — add one `Blocked by #N` line to the dependent leaf's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $LEAF_NUM --body-file` with the recomposed body.
```

Replace with:

```markdown
- Leaf ↔ leaf / leaf ↔ pre-existing record — add one `Blocked by #N` line to the dependent leaf's body per dependency (line-anchored, matching `record.js`'s `DEP_RE`: the literal text `Blocked by #` followed by the number, at the start of a line), then a single `gh issue edit $LEAF_NUM --body-file` with the recomposed body. When the dependency is between two leaves of this same decomposition (not a pre-existing companion record) and this decomposition met `promise-register-min-leaves` (`_shared/work-record.md`'s Config keys table), write the extended form instead — `Blocked by #N: {one-line assumption}` — stating what the dependent leaf actually needs from #N (`record.js`'s `parseDependencyAssumptions` reads the trailing text; bare lines and pre-existing-record links are unaffected).
```

- [ ] **Step 4: Seed the parent's Cross-Spec Promises section (`specify/SKILL.md` Step 4)**

Find:

```markdown
### Decision Rationale and Assumptions

Before Step 7 deletes the design doc and brief, absorb the last of their context into the records that survive:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). Add as a `## Decision Rationale` section in the **parent** body — recompose the parent's full body (design summary + this new section + the task list, under `body-text`) and write once.
2. **Assumptions** — from the brief (produced by `/claude-tweaks:challenge`), extract validated assumptions, surfaced blind spots, and hard constraints relevant to each leaf. Fold them into that leaf's **existing `## Gotchas` section** as additional bullets — there's no separate `## Assumptions` section anymore. Recompose the affected leaf's body and write once.

Step 3's Rules already asked for brief-absorption while each leaf was being drafted; this is the systematic completeness pass — the last chance to catch a leaf that missed something, before the source becomes unrecoverable.

This is what keeps the records self-contained: reading the parent, or any leaf, later explains *why* the approach was chosen without needing the deleted design doc.
```

Replace with:

```markdown
### Decision Rationale and Assumptions

Before Step 7 deletes the design doc and brief, absorb the last of their context into the records that survive:

1. **Decision Rationale** — from the design doc, extract the "why" behind major decisions (approach choices, technology selections, rejected alternatives). Add as a `## Decision Rationale` section in the **parent** body — recompose the parent's full body (design summary + this new section + the task list, under `body-text`) and write once.
2. **Assumptions** — from the brief (produced by `/claude-tweaks:challenge`), extract validated assumptions, surfaced blind spots, and hard constraints relevant to each leaf. Fold them into that leaf's **existing `## Gotchas` section** as additional bullets — there's no separate `## Assumptions` section anymore. Recompose the affected leaf's body and write once.
3. **Cross-Spec Promises** (only when this decomposition met `promise-register-min-leaves` — default `4`, `_shared/work-record.md`'s Config keys table) — add a `## Cross-Spec Promises` section to the **parent** body, recomposed alongside Decision Rationale and the task list. Seed one row per `Blocked by #N: {assumption}` line the Linking pass above just wrote between two leaves of this decomposition (pre-existing-record links don't get a row — the register tracks promises within this family, not every dependency):

   ```
   | # | Promise | Owner (#leaf) | Status |
   |---|---------|-----------------|--------|
   | F1 | leaf #{N} assumes leaf #{M}: {assumption} | #{N} | open |
   ```

   Below threshold, or when no leaf-to-leaf assumption lines exist, still create the section with just the header row — `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) looks for this section by name on every parent-linked record it reviews, and an absent section means "nothing to track" while a present-but-empty one means "tracked, nothing found yet." Post one comment on the parent noting the seed: `gh issue comment $PARENT_NUM --body "Cross-Spec Promises seeded: {count} forward reference(s) at decomposition time."` (skip the comment, but still create the empty section, when count is 0).

Step 3's Rules already asked for brief-absorption while each leaf was being drafted; this is the systematic completeness pass — the last chance to catch a leaf that missed something, before the source becomes unrecoverable.

This is what keeps the records self-contained: reading the parent, or any leaf, later explains *why* the approach was chosen without needing the deleted design doc.
```

- [ ] **Step 5: Verify no stray reference to the old two-item list survives**

```bash
grep -n "there's no separate .## Assumptions. section anymore" skills/specify/SKILL.md
```

Expected: one match (the sentence is preserved inside item 2 — this check confirms the Find/Replace in Step 4 didn't accidentally drop it).

- [ ] **Step 6: Commit**

```bash
git add skills/specify/spec-template.md skills/specify/SKILL.md
git commit -m "Seed Cross-Spec Promises on the parent during decomposition

specify's Step 3 now writes a Parent: #N body line under
work-backend: github-issues + work-links: body-text (the one
combination that otherwise has no way to resolve a leaf's own
parent). Step 4's linking pass writes Blocked-by-#N assumption text
between same-decomposition leaves, and seeds the parent's
Cross-Spec Promises section from it once promise-register-min-leaves
is met. Implements
docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md."
```

---

### Task 4: `skills/review/SKILL.md` — new Step 1.6

**Files:**
- Modify: `skills/review/SKILL.md`

**Interfaces:**
- Consumes: the `Parent: #N` body line and `## Cross-Spec Promises` section (Task 3);
  `parseDependencyAssumptions` (Task 1, referenced in prose).

- [ ] **Step 1: Insert Step 1.6 between the Test Gate and Step 2**

Find:

```markdown
| `TEST_PASSED=true` (pipeline) | Proceed to Step 2 |
| Recent `/test` pass (standalone) | Proceed to Step 2 |
| `/test` triggered and passes | Proceed to Step 2 |
| `/test` triggered and fails | **STOP** — present test failures. Fix before continuing. Run `/claude-tweaks:test` to re-verify. |

> **Why this gates review:** Mechanical correctness is a prerequisite for analytical quality judgment. Code review on broken code wastes effort.

## Step 2: Identify What Changed
```

Replace with:

```markdown
| `TEST_PASSED=true` (pipeline) | Proceed to Step 2 |
| Recent `/test` pass (standalone) | Proceed to Step 2 |
| `/test` triggered and passes | Proceed to Step 2 |
| `/test` triggered and fails | **STOP** — present test failures. Fix before continuing. Run `/claude-tweaks:test` to re-verify. |

> **Why this gates review:** Mechanical correctness is a prerequisite for analytical quality judgment. Code review on broken code wastes effort.

## Step 1.6: Cross-Spec Promise Check (parent-linked records only)

Skip silently when this record has no resolvable parent, or its parent has no `## Cross-Spec
Promises` section (`_shared/work-record.md`) — most records. This step never blocks the review;
it only updates the parent record and, when relevant, notes something in the Step 7 summary.

**Resolve the parent**, per `work-links`: `native` — query the sub-issue relationship from this
record's own side; `body-text` (`work-backend: github-issues`) — read the `Parent: #N` line from
this record's own body, written at decomposition time (`spec-template.md`); `local-files` —
`facets.parent`. No parent resolvable (a record human-filed or `/capture`d directly, not produced
by a `/specify` decomposition) → skip this step entirely.

**If the parent has a `## Cross-Spec Promises` section:**

1. **Check whether an `open` row names this record as Owner.** If so, this review's own diff
   (Step 2, once available — or the same change scope Step 1 already used for the deliverables
   check) is exactly the evidence needed: judge whether it satisfies the stated promise.
   - Satisfied → update the row's Status to `SATISFIED (commit {short-sha})` via `gh issue edit
     $PARENT_NUM --body-file`, and post a comment: `gh issue comment $PARENT_NUM --body "F{n}
     satisfied by #{this-record}: {one-line why}."`
   - Not yet satisfied → leave the row `open`, post a comment explaining what's still missing.
     Never edit another leaf's body from here — only the parent's promises section and comments.
2. **Check whether this record's own work reveals a new forward assumption on another sibling**
   not yet tracked (the same kind of gap the spec 13-23 build's whole-branch review caught
   mid-flight, not anticipated at decomposition time). If so: add a row to the parent's table, post
   a seeding comment, and — when the assumption concerns a still-open sibling — add the
   corresponding `Blocked by #N: {assumption}` line to this record's own body (a normal body edit,
   same as any other review-driven change to the record under review).

Both writes are additive to the parent's body/comments only — never touch a sibling leaf's body
from this step, and never block the review's own PASS/BLOCKED verdict on anything found here (see
`docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md`'s Non-Goals: not a hard
gate anywhere).

## Step 2: Identify What Changed
```

- [ ] **Step 2: Extend the `_shared/work-record.md` row in the Relationship table**

Find:

```markdown
| `_shared/work-record.md` (`parked`) | /claude-tweaks:review routes implementation-related deferrals to a new work record here (with origin, files, trigger) |
```

Replace with:

```markdown
| `_shared/work-record.md` (`parked`) | /claude-tweaks:review routes implementation-related deferrals to a new work record here (with origin, files, trigger). Step 1.6 also reads/writes a decomposition parent's `## Cross-Spec Promises` section for any parent-linked record under review. |
```

- [ ] **Step 3: Verify the new step doesn't collide with an existing "Step 1.6" or duplicate heading**

```bash
grep -n "^## Step 1\." skills/review/SKILL.md
```

Expected: exactly two matches — `## Step 1.5: Test Gate` and `## Step 1.6: Cross-Spec Promise Check (parent-linked records only)`.

- [ ] **Step 4: Commit**

```bash
git add skills/review/SKILL.md
git commit -m "Add review Step 1.6: Cross-Spec Promise Check

Runs on any parent-linked record's review, solo or batch-dispatched
— not gated on whole-branch review, which only exists inside a live
multi-spec /flow batch and would miss the dominant case of leaves
dispatched independently. Never blocks the review's own verdict.
Implements
docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md."
```

---

### Task 5: `skills/ledger/SKILL.md` — Anti-Patterns table pointer fix

**Files:**
- Modify: `skills/ledger/SKILL.md`

**Interfaces:** none — pure documentation correction, no code.

- [ ] **Step 1: Fix the stale-for-Record-mode anti-pattern row**

Find:

```markdown
| Using the ledger for feature tracking | The ledger tracks findings and tasks within a single pipeline run — use specs/INDEX.md for feature-level tracking |
```

Replace with:

```markdown
| Using the ledger for feature tracking | The ledger tracks findings and tasks within a single pipeline run. `work-backend: local-files` (legacy spec-file-alias records with no materialized header) — use specs/INDEX.md. `work-backend: github-issues` (the current Record path) — cross-spec/cross-run tracking belongs on the decomposition's parent record's `## Cross-Spec Promises` section instead (`_shared/work-record.md`) — specs/INDEX.md is never touched by Record-mode closure (`wrap-up/cleanup-procedures.md`). |
```

- [ ] **Step 2: Commit**

```bash
git add skills/ledger/SKILL.md
git commit -m "Point ledger's feature-tracking anti-pattern at the parent record

The existing specs/INDEX.md pointer only applies to the legacy
spec-file-alias path (wrap-up/cleanup-procedures.md). The current
Record/GitHub-issue path had no equivalent pointer; it now names the
decomposition parent's Cross-Spec Promises section."
```

---

### Task 6: Full verification

**Files:** none — verification only, no changes.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including the 6 new `parseDependencyAssumptions` tests from Task 1
(45 total in `bin/lib/issues/tests/record.test.js`) — no regressions anywhere else in the suite.

- [ ] **Step 2: Confirm `DEP_RE`/`parseDependencies` are byte-unchanged**

```bash
git log --oneline -- bin/lib/issues/record.js
git show <task-1-commit-sha> -- bin/lib/issues/record.js | grep -A2 "^-const DEP_RE\|^-function parseDependencies"
```

Expected: the diff for Task 1's commit contains no `-` (removal) lines touching `DEP_RE` or
`parseDependencies` — only additions.

- [ ] **Step 3: Confirm consistent terminology across every touched skill file**

```bash
grep -rn "Cross-Spec Promises\|promise-register-min-leaves\|parseDependencyAssumptions" skills/ bin/lib/issues/record.js
```

Expected: every occurrence spells these identically (exact case, exact hyphenation) — no
`Cross-spec Promises`, `crossSpecPromises`, `promise-register-min-leafs`, or similar drift across
`work-record.md`, `specify/SKILL.md`, `specify/spec-template.md`, `review/SKILL.md`,
`ledger/SKILL.md`, and `record.js`.

- [ ] **Step 4: Confirm `Parent:` line documentation is consistent between the template and the procedure**

```bash
grep -n "Parent:" skills/specify/spec-template.md skills/specify/SKILL.md skills/review/SKILL.md skills/_shared/work-record.md
```

Expected: all four files describe the same condition (`work-backend: github-issues` +
`work-links: body-text` only) — no file describing a different scope for when the line appears.

- [ ] **Step 5: Verify all 5 commits landed with their intended content**

```bash
git log --oneline -6
git show --stat HEAD~4 HEAD~3 HEAD~2 HEAD~1 HEAD
```

Expected: 5 commits (Tasks 1-5, Task 6 has none), each touching exactly the files listed in its
own task above — no unrelated file swept in, no commit missing its intended file (this repo's own
established practice — see `CLAUDE.md`'s git verification guidance).

- [ ] **Step 6: Report status**

No commit for this task. Summarize: test results, terminology-consistency grep results, and the
final `git log --oneline -6` — ready for the design doc's own review, or for whoever picks up the
deferred `assess-agent-autonomy` `grant-check` amendment once that implementation lands.
