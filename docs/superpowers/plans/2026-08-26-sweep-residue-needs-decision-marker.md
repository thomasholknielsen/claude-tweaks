# Sweep Residue: needs:decision Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `needs:decision` — one GitHub label, one comment template, one worklist rule — as
the tracker-side channel for a headless unit's "I can't decide this alone" outcome, absorbing #1317
(backlog refine's comment-only human-only marker) and #825 (specify shaping mode's missing
`needs:definition` removal authority) into one generalized `needs:*` family.

**Architecture:** A new label-taxonomy row + canonical comment template + resolution rule live in
`_shared/work-record.md` (after extracting its oversized Permission matrix section into a sibling
file to make byte room). `bin/lib/issues/grant-gate.js`'s Gate 1c generalizes from a
`needs:definition`-only check to any `needs:*`-prefixed label. `backlog/refine-mode.md`'s Step 3
gains a new branch (scored-but-refused → `needs:decision`, keep `ready`; unscored → existing
flag-back, unchanged) extracted into a new `backlog/grant-lane-decision.md` sub-file to protect
`refine-mode.md`'s own byte ceiling. `backlog/grant-mode.md`'s identical headless gate-4 refusal
reuses the same marker and idempotence check. `specify/shaping-mode.md` gains the promotion-time
`needs:*` removal authority (generalizing #825's single-label ask), including closing out any live
`needs:decision` comment before removing the label. `specify/next-mode.md`'s eligibility EXCLUDE set
and `tidy/step-1-records.md`'s record-scoped shapes generalize their `needs:definition`-only
exclusion to the same `needs:*` prefix rule, stated once in `_shared/work-record.md`.

**Tech Stack:** Node 18+ (`bin/lib/issues/*.js`, `node --test`), GitHub CLI (`gh`) for label/comment
writes, markdown skill prose (`plugin/skills/**/*.md`, 40,960-byte-per-file ceiling).

**Spec:** `.claude-tweaks/pipelines/2026-08-26T170944-spec-1488/work/1488-spec.md`

## Global Constraints

- Every `plugin/skills/**/*.md` file (including every `_shared/*.md` file) must stay at or under
  40,960 bytes — mechanically enforced (`tests/bin-lib/skill-audit/context-cost.test.js`). Measure
  `wc -c` on every touched file after every edit, not just before starting.
- `bin/lib/issues/local-store.js` (the `local-files` driver) is **not touched** by this record — the
  whole `needs:decision` write path (`/backlog refine`'s Grant-lane fix, `/backlog grant`'s Step 4)
  is `work-backend: github-issues` only, per the existing Never-column carve-outs on both actors'
  permission-matrix rows.
- `bin/lib/issues/grant-gate.js`'s Gate 1c change must keep the existing `'needs-definition'`
  `failedKey` string exactly as-is for an actual `needs:definition` label (two existing test files —
  `tests/bin-lib/issues/grant-gate.test.js`, `tests/bin-lib/issues/backlog.test.js` — assert on that
  literal string with `assert.equal`/`assert.deepEqual`).
- Never restate the worklist rule ("a headless unit skips any record carrying a `needs:*` label") —
  state it once in `_shared/work-record.md`, cite it from `grant-gate.js`'s code comment,
  `next-mode.md`'s prose, and `tidy/step-1-records.md`'s prose.
- `#1317` and `#825` are real, live GitHub issues in `thomasholknielsen/claude-tweaks`. `#825` is
  **already closed** (verified live: closed 2026-08-26T15:05:51Z with a comment naming #1488 as the
  absorbing record) — do not attempt to re-close it; only verify and report that state. `#1317` is
  still **OPEN** (PR #1440 targeting it is also still open, unmerged) — close it as part of this
  plan's work, per AC5.
- PR #1440 has **not merged** as of this plan (verified live via `gh pr view 1440`). Build against
  the current, unmerged state of every file below — do not assume any of #1440's diff is present.
  If #1440 merges mid-implementation, re-read the merged diff for
  `backlog/refine-mode.md`/`refine-lanes.md`/`grant-gate.js`/`backlog/human-only-outcome.md` before
  continuing, and adapt (don't duplicate) its idempotence-check logic.
- Every `gh` command below is a literal, paste-ready command — no placeholders left unresolved.

---

## Task 1: Free byte headroom in `_shared/work-record.md` by extracting its Permission matrix

`_shared/work-record.md` is 40,896 bytes today — 64 bytes under the 40,960 ceiling. Its
`## Permission matrix` section (lines 124–161, verified via `sed -n '124,161p' … | wc -c` = exactly
**10,070 bytes**) is the natural, self-contained thing to extract: a dense, mostly-independent table
cited by name from many other skills, never restated. Extracting it frees ~9,600+ bytes — comfortably
enough for every later `_shared/work-record.md` addition in this plan (label-taxonomy row, comment
template + resolution rule, worklist-rule statement) plus its own three edited rows.

**Files:**
- Create: `plugin/skills/_shared/work-record-permission-matrix.md`
- Modify: `plugin/skills/_shared/work-record.md:124-161`
- Modify: `tests/specify-parent-guard.test.js:97-100`
- Test: `tests/specify-parent-guard.test.js` (existing suite, updated), full `npm test` run

**Interfaces:**
- Produces: `plugin/skills/_shared/work-record-permission-matrix.md` — a new sibling `_shared` file
  holding exactly the `## Permission matrix` heading, its intro paragraph, the actor table, and the
  driver-conditional note that followed it (lines 124–160 of the original file). Every later task in
  this plan that edits an Adds/Removes/Never cell edits **this new file**, not `work-record.md`.

- [ ] **Step 1: Derive the consumer list before touching anything**

  Confirm no test other than `tests/specify-parent-guard.test.js` reads permission-matrix *content*
  (not just the phrase "permission matrix" in a citation sentence, which stays valid since it still
  correctly points at `work-record.md`, which will carry a one-paragraph pointer to the new file):

  ```bash
  grep -rn "case-1 parent-record guard cleanup\|granting on a headless path\|granting a human-filed record" tests/
  ```

  Expected: only `tests/specify-parent-guard.test.js` matches (its `'permission-matrix carve-out
  missing from work-record.md'` assertion, which reads the phrase `'parent-marked record only
  (case-1 parent-record guard cleanup'` out of the `/specify` row).

- [ ] **Step 2: Write the failing test (updated existing test)**

  Edit `tests/specify-parent-guard.test.js`'s last test to also read the new file:

  ```javascript
  test('work-record-permission-matrix.md grants /specify the parent-guard removal carve-out', () => {
    const src = readFlat('plugin/skills/_shared/work-record-permission-matrix.md');
    assert.ok(src.includes('parent-marked record only (case-1 parent-record guard cleanup'), 'permission-matrix carve-out missing from work-record-permission-matrix.md');
  });
  ```

  Replace the old test name/body (`'work-record.md permission matrix grants /specify the
  parent-guard removal carve-out'`) with this one — the content moved, so the assertion's target
  file must move with it.

  Also add four new tests to the same file, pinning the four cells this task's Step 4 edits directly
  (these are new assertions, not migrations of existing ones — nothing pinned them before this task):

  ```javascript
  const PERMISSION_MATRIX_FLAT = readFlat('plugin/skills/_shared/work-record-permission-matrix.md');

  test('permission-matrix.md /backlog refine row Adds column carries needs:decision', () => {
    assert.ok(PERMISSION_MATRIX_FLAT.includes('`needs:decision` (a scored, spec-shaped record `grant-check` refuses'), 'needs:decision missing from /backlog refine\'s Adds column');
  });

  test('permission-matrix.md /backlog grant row Adds column carries needs:decision', () => {
    assert.ok(PERMISSION_MATRIX_FLAT.includes('`needs:decision` (a gate-4 `grant-check` refusal'), 'needs:decision missing from /backlog grant\'s Adds column');
  });

  test('permission-matrix.md /specify row Removes column carries the generalized needs:* removal', () => {
    assert.ok(PERMISSION_MATRIX_FLAT.includes('every `needs:*`-prefixed label present, on promotion'), 'generalized needs:* removal missing from /specify\'s Removes column');
  });

  test('permission-matrix.md /tidy row Adds column reserves needs:decision for Phase 6', () => {
    assert.ok(PERMISSION_MATRIX_FLAT.includes('`needs:decision` (Phase 6 — reserved here, not yet wired'), 'needs:decision Phase-6 reservation missing from /tidy\'s Adds column');
  });
  ```

- [ ] **Step 3: Run it to confirm FAIL**

  ```bash
  node --test tests/specify-parent-guard.test.js
  ```

  Expected: FAIL — `plugin/skills/_shared/work-record-permission-matrix.md` does not exist yet, so
  the renamed test and all four new cell-pinning tests throw `ENOENT`/fail their `includes()` checks.

- [ ] **Step 4: Create `work-record-permission-matrix.md`**

  Write the new file with this exact content (lines 124–160 of the current `work-record.md`, verbatim,
  under a new top-of-file framing sentence):

  ```markdown
  # Work Record — Permission Matrix

  Extracted from `_shared/work-record.md` (which cites this file rather than restating it) to keep
  that file under the 40 KB per-file lazy-load ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`).
  Every consumer that previously said "`_shared/work-record.md`'s permission matrix" still resolves
  correctly — that file's own `## Permission matrix` section is now a one-paragraph pointer here.

  ## Permission matrix

  Who may add / remove which labels. "Machinery" = any headless or autonomous path.

  **Every row is exhaustive for its actor.** There is no general "agent path" row that widens the
  specific ones — each actor's born-`ready` conditions are documented on its own row directly:
  `/capture`'s (the ceiling-gated `--chained` shaping its Never column describes, and — since #625 — the Shaped-body branch its Adds column authorizes) and, since
  #623, the `side-effect:*` residue producers' — `/wrap-up` (leftover, ledger, and residue-sweep
  routing), `/reflect`, `/review`, and `/visual-review` — whose rows below state the `specShapedBody`
  composition their `ready` is conditional on. Extending born-`ready` to any further actor (`/demo`
  follow-ups) still means editing that actor's own row, deliberately, and until then its `Never`
  column holds as written whatever the ceiling says.

  | Actor | Adds | Removes | Never |
  |---|---|---|---|
  | **Human** (GitHub UI or interactive session) | anything, incl. `auto:*` | anything | — |
  | **Health skills** (`/code-health`, `/harness-health`, `/journey-health`, `/docs-health`) | `by:{self}`, `risk:*`, `size:*`, `ready` (born-ready), Type; on a headless D5 finding, `upstream-candidate` **instead of** `ready`/`risk:*`/`size:*` | nothing | `auto:*`, `bot:*`, `parked` |
  | **`/capture`** | `by:capture`, Type (`type:*` only when `work-types: labels`), `needs:definition` (content judgment at filing time — see Judging Definition in `capture/SKILL.md`); `risk:*`, `size:*`, `ready` (**only** on the Shaped-body branch — structural check passed, `needs:definition` false, `via specShapedBody` footer present — see `capture/SKILL.md`); `size:*` on an **absorb target** record — a different, pre-existing record, raise-only, never lowered, on any branch (see Absorb mechanics in `capture/SKILL.md`) | nothing | `parked`, `auto:*`, `bot:*` — always; scoring and `ready` on the **new record** of any **stub** filing, at every ceiling (the Shaped-body branch is the sole exception, per Adds; the absorb-target `size:` raise is a write to a different record, not a scoring of the filing). Under `autonomy: trusted`+ with a `clean` `producer:capture` verdict the filing chains into `/claude-tweaks:specify --chained`, and *specify* stamps scoring and `ready` under its own row's authority (see `_shared/autonomy-ceiling.md`); the chain never fires alongside `needs:definition` — an undecided record cannot be born-ready |
  | **`/feedback`** | `needs:definition` (content judgment at filing time, same posture as `/capture`'s), `bug`/`enhancement` **only** when `gh label list` confirms the label exists on `thomasholknielsen/claude-tweaks` | nothing | every other label in this repository's own internal automation taxonomy (`by:*`, `type:*`, `risk:*`, `size:*`, `ready`, `ceremony:*`, `auto:*`, `bot:*`, `parked`) — `needs:definition` is the single named exception |
  | **`/specify`** (shaper) | `ready`, `risk:*`/`size:*` when unstamped, `ceremony:*` (always — no unscored state), `solution:unjustified` (via `/claude-tweaks:challenge`'s `framing-check`), Type, `parent-issue` (decomposition parents only, never sub-issues), `shaped:headless` (`next` mode only, stamped alongside `ready` in the same call — never on an interactively-shaped record) | `parked` (promotion); every `needs:*`-prefixed label present, on promotion (`shaping-mode.md`'s compose-then-write-once call — generalizes #825's single-label `needs:definition` removal to the whole family); `ready`/`risk:*`/`size:*`/`ceremony:*`/`solution:unjustified` from a parent-marked record only (case-1 parent-record guard cleanup — `skills/specify/SKILL.md`); `needs:definition` from the origin record a 1-unit collapse shapes in place (`specify/record-creation.md`'s Origin-set carve-out) | `auto:*`, `bot:*` |
  | **`/backlog refine`** (write mode, human present) | `auto:build`, `auto:merge` (human-confirmed), `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed), scoring supplied inline, `needs:decision` (a scored, spec-shaped record `grant-check` refuses — the Grant-lane refusal `backlog/grant-lane-decision.md` documents; keeps `ready`, adds no `auto:*`) | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path, adding any `bot:*`, `risk:*`/`size:*` beyond the inline-override case, body-shaping beyond the `**Related:**` line |
  | **`/backlog grant`** (headless machine-grant mode, `github-issues` only — the one machine-origination path, see Grant semantics above) | `auto:build` (+`auto:merge-pending` when authorized), only on a record whose full gate chain clears (`bin/lib/issues/grant-gate.js`, `backlog/grant-mode.md`); `needs:decision` (a gate-4 `grant-check` refusal on a candidate that already cleared gates 1-3 — the identical outcome `/backlog refine`'s Grant-lane produces, per `backlog/grant-lane-decision.md`) | `bot:blocked` (re-authorize, `auto:build` only — never bundles `auto:merge`) | granting a human-filed record (no `by:*`), adding `ready`/`priority:*`/any `bot:*`, body-shaping beyond the audit comment, running at all under `work-backend: local-files` (no headless consumer acts on a local grant) |
  | **`/backlog overview`** (read mode) | nothing | nothing | everything — pure read-only distribution/recommendation view |
  | **`/dispatch`** (queue consumer) | `bot:in-progress` (claim mirror), `bot:blocked` (at retry ceiling), `demo:pending` (group auto-merge gate, `dispatch/settle-and-merge.md` — reuses `/wrap-up`'s own `verification-brief.md` procedure, including its parent-gate routing, so on a parent-linked sub-issue the label lands on the parent instead), `auto:merge` (**maturation only**) | `auto:merge` (failure downgrade), `auto:merge-pending` (maturation's label swap), `auto:*` (at ceiling), `bot:in-progress` (release) | originating a fresh `auto:*` grant (promotion, not origination), adding `ready`, `demo:approved`, `demo:changes-requested` |
  | **`/tidy`** (hygiene) | `parked` (Defer action, with trigger), `demo:pending` (Open parent gate action, either driver — the local twin writes the parent's `acceptance: pending` facet; both reuse `/wrap-up`'s own gate-opening write); `needs:decision` (Phase 6 — reserved here, not yet wired: `/tidy` does not write this label until a future record wires its own `tidy` scan to stamp it) | `parked` (trigger-met wake), `bot:in-progress` (orphaned-claim sweep) | `auto:*`, `demo:approved`, `demo:changes-requested` |
  | **Executors** (`/flow`, `/build`) | `bot:blocked` — merge-verification park only (`_shared/pr-first-merge.md` Step 2.5's red path). This path parks **without** revoking `auto:*`: a red or timed-out CI check is not a build failure, so there is no Settle classification and no retry increment behind it — unlike `/dispatch`'s retry-ceiling write above | nothing | `auto:*`, `ready` |
  | **`/wrap-up`** (all filing paths: leftover routing, ledger Phase 2/3 routing, residue-sweep records) | `demo:pending`; `parked` (a `Trigger:` leftover or Defer — never alongside `ready`); `bot:blocked` (the same `_shared/pr-first-merge.md` Step 2.5 red path, reached through `wrap-up/review-console.md`'s fast-lane merge — same no-`auto:*`-revocation rule as the Executors row); `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer; a `Trigger:` leftover carries `parked` instead of `ready`); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `auto:merge` (**maturation only**) | `bot:in-progress` (claim release); `auto:merge-pending` (short-circuit's swap) | originating a fresh `auto:*` grant (promotion, not origination), `bot:*` (other than the release), `priority:*`, `demo:approved`, `demo:approved-batch`, `demo:changes-requested`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
  | **`/reflect`** (tangential routing, Defer) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
  | **`/review`** (Step 3 Defer — Capture routes file under `/capture`'s own row) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
  | **`/visual-review`** (Findings & Ideas Defer — standalone runs; under `/review` its findings route through that row) | `risk:*`, `size:*` (scored per the Scoring axis from the filed content); `ready` (born-ready — **only** on a body composed via `specShapedBody` carrying a valid `Defer-reason:` and a `via specShapedBody` footer); Type (content-judged: `task`/`bug`/`feature`); `needs:definition` (**instead of** `ready`/scoring, on the composer's `openQuestion` variant); `parked` (a Defer with a real `Trigger:` — never alongside `ready`) | nothing | `auto:*`, `bot:*`, `priority:*`, `demo:*`, and `ready` on any body not composed by `specShapedBody` or alongside `parked`/`needs:definition` |
  | **`/demo`** | `demo:approved`, `demo:changes-requested`, `demo:approved-batch` (Approve only, stacked alongside `demo:approved`, batch-sourced verdicts only) | `demo:pending` (on resolution) | `auto:*`, `ready`, `bot:*`, adding `demo:pending` itself |

  **Driver-conditional note:** grants are *enforceable* only under the `github-issues` driver —
  GitHub's RBAC means applying a label requires triage permission (a label is a maintainer's
  signature), and the label audit trail records who granted what. The `local-files` driver
  records grants as frontmatter for isomorphism, but no headless consumer acts on them —
  headless dispatch is github-issues only.
  ```

  Note: four cells above already carry this record's own edits (`/specify`'s Removes column,
  `/backlog refine`'s and `/backlog grant`'s Adds columns, `/tidy`'s Adds column) — written directly
  into the new file at creation time rather than as a separate later pass, since the file does not
  exist yet for an earlier task to have edited. Step 2's four new tests (above) pin exactly these
  four cells; no later task re-derives them.

- [ ] **Step 5: Replace the extracted section in `work-record.md` with a pointer**

  Replace `work-record.md`'s current lines 124–161 (`## Permission matrix` through the driver-conditional
  note's last line) with:

  ```markdown
  ## Permission matrix

  Who may add / remove which labels, per actor — extracted to keep this file under the 40 KB
  lazy-load ceiling. See `_shared/work-record-permission-matrix.md` for the full actor table
  (every row exhaustive for its actor) and the driver-conditional enforceability note.
  ```

- [ ] **Step 6: Run the updated test to confirm PASS**

  ```bash
  node --test tests/specify-parent-guard.test.js
  ```

  Expected: PASS — all 9 tests in the file (the 4 pre-existing tests, the renamed carve-out test, and
  the 4 new cell-pinning tests).

- [ ] **Step 7: Measure both files' byte sizes**

  ```bash
  wc -c plugin/skills/_shared/work-record.md plugin/skills/_shared/work-record-permission-matrix.md
  ```

  Expected: `work-record.md` at roughly 31,200–31,400 bytes (40,896 − 10,070 extracted + ~450 bytes
  of new pointer prose + the three-cell edits' extra bytes now living in the new file, not here);
  `work-record-permission-matrix.md` at roughly 10,300–10,600 bytes (the extracted 10,070 bytes plus
  the new framing paragraph and the three edited cells' additions). Both must be well under 40,960 —
  if either isn't, stop and re-check the copy-paste before proceeding.

- [ ] **Step 8: Full suite**

  ```bash
  npm test 2>&1 | tail -40
  ```

  Expected: no new failures. (A `docs/skill-graph.md` edge for the new file is added in Task 15, not
  here — this task's job is the byte-headroom fix, not the cross-reference sweep.)

- [ ] **Step 9: Commit**

  ```bash
  git add plugin/skills/_shared/work-record.md plugin/skills/_shared/work-record-permission-matrix.md tests/specify-parent-guard.test.js
  git commit -m "Extract work-record.md's Permission matrix into a sibling file — frees byte headroom for #1488"
  ```

---

## Task 2: Add the `needs:decision` label taxonomy row, comment template, resolution rule, and worklist rule to `work-record.md`

**Files:**
- Modify: `plugin/skills/_shared/work-record.md` (Label taxonomy table, a new subsection after it,
  and a new worklist-rule paragraph)
- Test: `tests/work-record-needs-decision-conformance.test.js` (new file — created here, extended in
  later tasks)

**Interfaces:**
- Produces: the canonical comment marker `<!-- needs-decision: {unit} -->`, the `## Decision needed`
  template shape, and the resolution rule text every later task (`grant-lane-decision.md`,
  `grant-mode.md`, `shaping-mode.md`) cites by name rather than restates.

- [ ] **Step 1: Write the failing test**

  Create `tests/work-record-needs-decision-conformance.test.js`:

  ```javascript
  'use strict';

  const { test } = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');

  const ROOT = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

  const WORK_RECORD_FLAT = readFlat('plugin/skills/_shared/work-record.md');

  test('work-record.md declares needs:decision in the Label taxonomy table, Definition family', () => {
    assert.ok(WORK_RECORD_FLAT.includes('`needs:decision`'), 'needs:decision label missing from work-record.md');
    assert.ok(WORK_RECORD_FLAT.includes('a headless unit proposed an action it may not take alone'), 'needs:decision meaning missing');
    assert.ok(WORK_RECORD_FLAT.includes('newest unresolved decision comment'), 'newest-unresolved-comment pointer missing from needs:decision meaning');
  });

  test('work-record.md carries the canonical decision-comment template', () => {
    assert.ok(WORK_RECORD_FLAT.includes('<!-- needs-decision: {unit} -->'), 'decision-comment marker template missing');
    assert.ok(WORK_RECORD_FLAT.includes('## Decision needed'), 'Decision needed heading missing');
    assert.ok(WORK_RECORD_FLAT.includes('**Proposed:**'), 'Proposed field missing from template');
    assert.ok(WORK_RECORD_FLAT.includes('**Why:**'), 'Why field missing from template');
    assert.ok(WORK_RECORD_FLAT.includes('**Command:**'), 'Command field missing from template');
  });

  test('work-record.md states the resolution rule: prepend Resolved, remove label only when zero unresolved comments remain', () => {
    assert.ok(WORK_RECORD_FLAT.includes('**Resolved:** {choice} — {date}'), 'resolution line format missing');
    assert.ok(WORK_RECORD_FLAT.includes('zero unresolved `needs-decision:*` comments remain'), 'zero-unresolved-comments removal condition missing');
    assert.ok(WORK_RECORD_FLAT.includes('A comment with no `**Resolved:**` line is unresolved'), 'unresolved-comment definition missing');
    assert.ok(WORK_RECORD_FLAT.includes('the literal skill/mode name that wrote it'), '{unit} definition missing');
  });

  test('work-record.md states the worklist rule once: a headless unit skips any open record carrying a needs:* label', () => {
    assert.ok(WORK_RECORD_FLAT.includes('a headless unit skips any open record carrying a `needs:*` label'), 'worklist rule statement missing from work-record.md');
  });

  // Go-red control: the pre-#1488 taxonomy table had no needs:decision row and no worklist-rule
  // statement anywhere in the file. Freeze a short excerpt of the pre-change Definition family row
  // to prove the assertions above can actually fail.
  const PRE_CHANGE_DEFINITION_ROW = '| Definition (1) | `needs:definition` | Marks a record naming a genuine open choice with no tradeoff made yet, rather than a single clear ask; stamped by `/capture` and `/feedback` at filing time (a content judgment, not a structural heuristic), absent means the ask read clear |';

  test('go-red control: pre-change Definition-family row does not carry needs:decision or the worklist rule', () => {
    assert.ok(!PRE_CHANGE_DEFINITION_ROW.includes('needs:decision'), 'control must not already contain needs:decision (proves the row-presence assertion above can fail)');
    assert.ok(!PRE_CHANGE_DEFINITION_ROW.includes('a headless unit skips any open record'), 'control must not already contain the worklist rule (proves that assertion above can fail)');
  });
  ```

- [ ] **Step 2: Run it to confirm FAIL**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: FAIL on the first four tests (the go-red control test passes immediately — it asserts
  against a frozen string literal, not live prose).

- [ ] **Step 3: Add the `needs:decision` row to the Label taxonomy table**

  In `work-record.md`, change the Definition row (currently `| Definition (1) | \`needs:definition\`
  | ... |`) to a two-row Definition family:

  ```markdown
  | Definition (2) | `needs:definition`, `needs:decision` | Marks a record naming a genuine open choice with no tradeoff made yet (`needs:definition`, stamped by `/capture`/`/feedback` at filing time — a content judgment), or a record where a headless unit proposed an action it may not take alone (`needs:decision` — the proposal and its command are in the record's newest unresolved decision comment; stamped by `/backlog refine`'s Grant lane and `/backlog grant`'s gate-4 refusal, see `backlog/grant-lane-decision.md`) |
  ```

  Update the taxonomy table's own per-family/total count line if one exists near the table's intro
  (`_shared/work-record.md`'s "Label taxonomy" section opening states counts per family — re-read it
  and bump the total count by 1 to match the new 2-count Definition family; the section's own prose
  says "see the table for the current per-family and total counts" so the table is the only place
  the count is asserted).

- [ ] **Step 4: Add the canonical comment template + resolution rule subsection**

  Insert a new `### Decision-comment template` subsection immediately after the Label taxonomy table
  (before `## Permission matrix`'s pointer paragraph):

  ```markdown
  ### Decision-comment template

  The canonical shape for a `needs:decision` residue comment — cited by every writer
  (`backlog/grant-lane-decision.md`, `backlog/grant-mode.md`) rather than restated:

  ```
  <!-- needs-decision: {unit} -->
  ## Decision needed
  **Proposed:** {one line — the action}
  **Why:** {one line — the rationale, e.g. the grant-check RATIONALE}
  **Command:** `{paste-ready, fully-qualified}`
  ```

  `{unit}` is the literal skill/mode name that wrote it (`backlog-refine`, `backlog-grant`, `tidy`) —
  this is what lets a later reader (and Phase 6's tidy loop-safety rule) tell which unit's proposal a
  given comment is.

  **Resolution rule.** A resolver prepends `**Resolved:** {choice} — {date}` to the comment body and
  removes the label **only when zero unresolved `needs-decision:*` comments remain on the record** —
  a record refused by both `backlog-refine` and `backlog-grant` concurrently carries two separate
  comments under the one shared label; resolving one leaves the label in place until the other is
  also resolved, so a still-open proposal from a second unit is never silently hidden by the first
  unit's own resolution. A comment with no `**Resolved:**` line is unresolved.
  ```

- [ ] **Step 5: State the worklist rule once**

  Immediately after the Decision-comment template subsection (still before `## Permission matrix`'s
  pointer), add:

  ```markdown
  ### Worklist rule

  A headless unit skips any open record carrying a `needs:*` label — a genuine open choice
  (`needs:definition`) or a proposal awaiting a human decision (`needs:decision`) is never a
  candidate for further autonomous action until a human resolves it. Every headless
  eligibility/candidate filter cites this rule rather than restating the label list:
  `bin/lib/issues/grant-gate.js`'s Gate 1c, `specify/next-mode.md`'s Eligibility query, and
  `tidy/step-1-records.md`'s record-scoped shapes.
  ```

- [ ] **Step 6: Run the test to confirm PASS**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: PASS, all 5 tests.

- [ ] **Step 7: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/_shared/work-record.md
  ```

  Expected: still comfortably under 40,960 (Task 1 freed ~9,600 bytes; this task's additions total
  roughly 1,600–2,000 bytes).

- [ ] **Step 8: Commit**

  ```bash
  git add plugin/skills/_shared/work-record.md tests/work-record-needs-decision-conformance.test.js
  git commit -m "Add needs:decision label, decision-comment template, resolution rule, and worklist rule to work-record.md"
  ```

---

## Task 3: Add `needs:decision` to `_shared/label-bootstrap.md`'s `LABELS_JSON` and bump the bootstrap version

**Files:**
- Modify: `plugin/skills/_shared/label-bootstrap.md`
- Test: `tests/work-record-needs-decision-conformance.test.js` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `["needs:decision", "a headless unit proposed an action it may not take alone — see the newest decision comment"]` as a `LABELS_JSON` entry every bootstrapping consumer may now copy.

- [ ] **Step 1: Write the failing test**

  Append to `tests/work-record-needs-decision-conformance.test.js`:

  ```javascript
  const { ensureLabelPayload } = require('../plugin/bin/lib/issues/labels.js');
  const LABEL_BOOTSTRAP_FLAT = readFlat('plugin/skills/_shared/label-bootstrap.md');

  test('label-bootstrap.md carries needs:decision in the canonical LABELS_JSON list', () => {
    assert.ok(LABEL_BOOTSTRAP_FLAT.includes('["needs:decision",'), 'needs:decision missing from LABELS_JSON');
    assert.ok(LABEL_BOOTSTRAP_FLAT.includes('a headless unit proposed an action it may not take alone — see the newest decision comment'), 'needs:decision description text missing or altered');
  });

  test('label-bootstrap.md bumps LABEL_BOOTSTRAP_VERSION from 5 to 6', () => {
    assert.ok(LABEL_BOOTSTRAP_FLAT.includes('current value: `6`'), 'LABEL_BOOTSTRAP_VERSION must read current value: 6');
    assert.ok(!LABEL_BOOTSTRAP_FLAT.includes('current value: `5`'), 'stale current value: 5 must be gone');
  });

  test('needs:decision description fits GitHub\'s 100-char label description cap', () => {
    assert.doesNotThrow(() => ensureLabelPayload('needs:decision', 'a headless unit proposed an action it may not take alone — see the newest decision comment'));
  });
  ```

- [ ] **Step 2: Run it to confirm FAIL**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: FAIL on the first two new tests (the third, `ensureLabelPayload`, passes immediately —
  it's a pure length check against a 90-char string, unaffected by the doc edit).

- [ ] **Step 3: Add the label to `LABELS_JSON` and bump the version**

  In `label-bootstrap.md`'s `LABELS_JSON` array, insert immediately after the `needs:definition` entry:

  ```javascript
  ["needs:definition",  "Undecided idea — must go through /specify's brainstorm redirect before reaching ready"],
  ["needs:decision",    "a headless unit proposed an action it may not take alone — see the newest decision comment"],
  ```

  Change the version line:

  ```
  `{LABEL_BOOTSTRAP_VERSION}` is the literal integer below — **current value: `6`**. Bump it (and
  ```

  (was `**current value: \`5\`**`).

- [ ] **Step 4: Run the test to confirm PASS**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: PASS, all 8 tests so far.

- [ ] **Step 5: Commit**

  ```bash
  git add plugin/skills/_shared/label-bootstrap.md tests/work-record-needs-decision-conformance.test.js
  git commit -m "Add needs:decision to label-bootstrap.md's LABELS_JSON, bump bootstrap version to 6"
  ```

---

## Task 4: Add the `needsDecisionMarker` Bookkeeping capability to `_shared/autonomy-ceiling.md`

**Files:**
- Modify: `plugin/skills/_shared/autonomy-ceiling.md:159-166` (the Bookkeeping capabilities table)
- Test: `tests/work-record-needs-decision-conformance.test.js` (extend)

**Interfaces:**
- This capability is **documentation-only** — it is deliberately **not** added to
  `bin/lib/issues/autonomy.js`'s `bookkeepingPermissions(ceiling)` return object. That function's
  return shape is pinned by `tests/bin-lib/issues/autonomy.test.js` via several `assert.deepEqual`
  calls against complete object literals (`assert.deepEqual(bookkeepingPermissions('supervised'), {
  ledgerNarrowing: false, ... })`); adding a new key would break every one of those. The other six
  Bookkeeping rows are each backed by a `bookkeepingPermissions()` key precisely because each gates
  a live `AskUserQuestion`-skip decision at runtime; `needsDecisionMarker` gates nothing new — it
  documents behavior (`next-mode.md`'s existing `needs:definition` stamp, and this record's new
  `needs:decision` stamp) that already runs unconditionally once a unit's own ceiling reads
  `trusted`+, per that unit's own `resolve-policy.js` Preflight call. No record with its own ceiling
  exists — this is never a per-record override.

- [ ] **Step 1: Write the failing test**

  Append to `tests/work-record-needs-decision-conformance.test.js`:

  ```javascript
  const AUTONOMY_CEILING_FLAT = readFlat('plugin/skills/_shared/autonomy-ceiling.md');

  test('autonomy-ceiling.md documents needsDecisionMarker as a trusted+ Bookkeeping capability', () => {
    assert.ok(AUTONOMY_CEILING_FLAT.includes('`needsDecisionMarker`'), 'needsDecisionMarker row missing from Bookkeeping capabilities table');
    assert.ok(AUTONOMY_CEILING_FLAT.includes('| `needsDecisionMarker` | `trusted`+ |'), 'needsDecisionMarker must be unlocked at trusted+, matching the table\'s own column format');
    assert.ok(AUTONOMY_CEILING_FLAT.includes('a headless unit may write a `needs:*` label plus its explanatory comment as its residue channel, with no per-write approval'), 'needsDecisionMarker description missing its core behavior statement');
    assert.ok(AUTONOMY_CEILING_FLAT.includes('never a per-record override'), 'needsDecisionMarker row must disclaim a per-record ceiling override');
  });

  test('bookkeepingPermissions() return shape is unchanged by the needsDecisionMarker doc row (no code key added)', () => {
    const { bookkeepingPermissions } = require('../plugin/bin/lib/issues/autonomy.js');
    assert.ok(!('needsDecisionMarker' in bookkeepingPermissions('unattended')), 'needsDecisionMarker must NOT be a bookkeepingPermissions() key — it is documentation-only, per this task\'s own design note');
  });
  ```

- [ ] **Step 2: Run it to confirm FAIL**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: the first new test FAILs (row doesn't exist yet); the second already PASSes (nothing has
  touched `autonomy.js`).

- [ ] **Step 3: Add the row**

  In `autonomy-ceiling.md`'s Bookkeeping capabilities table, add a new row (placement: after
  `queueWriteAutoFile`, since both are `trusted`+ rows, keeping the two `trusted`+ rows adjacent
  ahead of the four `unattended`-only rows):

  ```markdown
  | `needsDecisionMarker` | `trusted`+ | A headless unit may write a `needs:*` label plus its explanatory comment as its residue channel, with no per-write approval — describing exactly what `specify next`'s existing `needs:definition` stamp and this record's new `needs:decision` stamp both already do. This documents existing behavior for `needs:definition` as much as it authorizes the new label. The `trusted`+ check reads the *acting unit's own* invocation-context ceiling (the `resolve-policy.js` call each unit's own Preflight already makes) — never a per-record override; there is no such thing as a record with its own ceiling. Prose-governed only — not one of `bookkeepingPermissions()`'s returned keys, since nothing here gates a live `AskUserQuestion` skip the way the other six rows do. |
  ```

- [ ] **Step 4: Run the test to confirm PASS**

  ```bash
  node --test tests/work-record-needs-decision-conformance.test.js
  ```

  Expected: PASS, both new tests.

- [ ] **Step 5: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/_shared/autonomy-ceiling.md
  ```

  Expected: ~30,500 bytes (29,860 + ~650), well under 40,960.

- [ ] **Step 6: Commit**

  ```bash
  git add plugin/skills/_shared/autonomy-ceiling.md tests/work-record-needs-decision-conformance.test.js
  git commit -m "Document needsDecisionMarker as a trusted+ Bookkeeping capability in autonomy-ceiling.md"
  ```

---

## Task 5: Generalize `grant-gate.js`'s Gate 1c from `needs:definition`-only to any `needs:*`-prefixed label

**Files:**
- Modify: `plugin/bin/lib/issues/grant-gate.js:69-75`
- Test: `tests/bin-lib/issues/grant-gate.test.js` (extend)

**Interfaces:**
- Consumes: `names` (already computed at line 54: `normalizeLabelNames(rec.labels)`), `facets`
  (already computed/passed at line 55).
- Produces: an unchanged `failedKey: 'needs-definition'` for an actual `needs:definition` label
  (backward-compatible with `tests/bin-lib/issues/backlog.test.js:579`'s
  `assert.deepEqual(out.refused, { 'needs-definition': [5] })`), and a new `failedKey: 'needs-label'`
  for any other `needs:*`-prefixed label (e.g. `needs:decision`).

- [ ] **Step 1: Write the failing tests**

  Add to `tests/bin-lib/issues/grant-gate.test.js`, immediately after the existing two
  `needs:definition` tests (after line 99):

  ```javascript
  test('needs:decision (a different needs:* label) refuses under a new needs-label failedKey, not needs-definition', () => {
    const result = evaluateGrantGate({
      record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'needs:decision'] }),
      policy: basePolicy(),
      trustVerdicts: cleanVerdict,
      grantCheck: clearGrantCheck,
    });
    assert.equal(result.grant, false);
    assert.equal(result.failedKey, 'needs-label');
    assert.match(result.reason, /needs:decision/);
  });

  test('needs:decision refuses even with no trustVerdicts/grantCheck passed at all (same posture as needs:definition)', () => {
    const result = evaluateGrantGate({
      record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'needs:decision'] }),
      policy: basePolicy(),
    });
    assert.equal(result.grant, false);
    assert.equal(result.failedKey, 'needs-label');
    assert.equal(result.needsGrantCheck, undefined);
  });

  test('a record carrying both needs:definition and needs:decision denies under needs-definition (checked first)', () => {
    const result = evaluateGrantGate({
      record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'needs:definition', 'needs:decision'] }),
      policy: basePolicy(),
      trustVerdicts: cleanVerdict,
      grantCheck: clearGrantCheck,
    });
    assert.equal(result.failedKey, 'needs-definition');
  });
  ```

- [ ] **Step 2: Run tests to confirm FAIL**

  ```bash
  node --test tests/bin-lib/issues/grant-gate.test.js
  ```

  Expected: the first two new tests FAIL (`result.failedKey` is currently `undefined`/gate never
  fires for `needs:decision` — the record falls through to gate 2's trust check); the third PASSes
  already (needs:definition is already checked and would already win, coincidentally, even before
  this change, since only `needs:definition` is recognized at all today).

- [ ] **Step 3: Implement the generalized Gate 1c**

  Replace lines 69-75:

  ```javascript
  // Gate 1c: needs:definition — cheapest possible per-record disqualifier (no
  // trustVerdicts row lookup, independent of origin), so it runs first among the
  // per-record checks, before any trust-row computation is spent on a record
  // this gate would refuse anyway.
  if (facets.needsDefinition === true) {
    return deny('needs-definition', 'record carries needs:definition — an open choice has not been decided yet; run /claude-tweaks:specify to route through brainstorming first');
  }
  ```

  with:

  ```javascript
  // Gate 1c: needs:* — cheapest possible per-record disqualifier (no
  // trustVerdicts row lookup, independent of origin), so it runs first among the
  // per-record checks, before any trust-row computation is spent on a record
  // this gate would refuse anyway. Generalized (#1488) from a needs:definition-only
  // check to _shared/work-record.md's worklist rule: a headless unit skips any
  // record carrying any needs:*-prefixed label. needs:definition keeps its own
  // named failedKey for backward compatibility with existing callers; any other
  // needs:* label (e.g. needs:decision) denies under the generic 'needs-label' key.
  if (facets.needsDefinition === true) {
    return deny('needs-definition', 'record carries needs:definition — an open choice has not been decided yet; run /claude-tweaks:specify to route through brainstorming first');
  }
  const needsLabel = names.find((n) => n.startsWith('needs:'));
  if (needsLabel) {
    return deny('needs-label', `record carries ${needsLabel} — a headless unit is waiting on a human decision; see the record's newest unresolved decision comment`);
  }
  ```

- [ ] **Step 4: Run tests to confirm PASS**

  ```bash
  node --test tests/bin-lib/issues/grant-gate.test.js
  ```

  Expected: PASS, all tests in the file.

- [ ] **Step 5: Confirm the pre-existing `backlog.test.js` pin still holds**

  ```bash
  node --test tests/bin-lib/issues/backlog.test.js
  ```

  Expected: PASS — `machineGrantOutlook`'s `needs:definition` test (line 573-580) is unaffected,
  since it never carries any other `needs:*` label.

- [ ] **Step 6: Commit**

  ```bash
  git add plugin/bin/lib/issues/grant-gate.js tests/bin-lib/issues/grant-gate.test.js
  git commit -m "Generalize grant-gate.js Gate 1c from needs:definition-only to any needs:*-prefixed label"
  ```

---

## Task 6: Generalize `specify/next-mode.md`'s eligibility EXCLUDE set and its Claim-step re-read, citing the worklist rule

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` (Eligibility query prose + code at line ~130, Claim
  step re-read prose at line ~189, Framing Guard citation)
- Modify: `tests/specify-next-mode.test.js:48-50,147-149` (update two pre-existing pinned tests)
- Test: `tests/specify-next-mode.test.js` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `EXCLUDE = new Set(['ready', 'parked', 'parent-issue', 'bot:in-progress'])` (4 literal
  members, down from 5) plus a `.some(l => l.startsWith('needs:'))` prefix check ORed alongside it.

- [ ] **Step 1: Write/update the failing tests**

  In `tests/specify-next-mode.test.js`, replace the test at lines 48-50:

  ```javascript
  test('next-mode.md states the eligibility predicate excluding all 5 labels', () => {
    assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`'), 'eligibility predicate must exclude ready, needs:definition, parked, parent-issue, and bot:in-progress');
  });
  ```

  with:

  ```javascript
  test('next-mode.md states the eligibility predicate: ready, any needs:*-prefixed label, parked, parent-issue, bot:in-progress', () => {
    assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, any `needs:*`-prefixed label'), 'eligibility predicate must exclude ready and any needs:*-prefixed label');
    assert.ok(NEXT_MODE_FLAT.includes("`_shared/work-record.md`'s worklist rule"), 'eligibility predicate must cite the shared worklist rule rather than restate it');
    assert.ok(NEXT_MODE_FLAT.includes('`parked`, `parent-issue`, and `bot:in-progress`'), 'eligibility predicate must still exclude parked, parent-issue, and bot:in-progress');
  });
  ```

  Replace the test at lines 147-149:

  ```javascript
  test('next-mode.md eligibility predicate still excludes needs:definition and parked (AC 5 re-pin)', () => {
    assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, `needs:definition`, `parked`, `parent-issue`, and `bot:in-progress`'), 'eligibility predicate must still exclude needs:definition and parked — this is #967\'s own loop-guard invariant, re-asserted here since #968\'s guard depends on it staying true');
  });
  ```

  with:

  ```javascript
  test('next-mode.md eligibility predicate still excludes needs:definition, now via the needs:* prefix (AC 5 re-pin, generalized by #1488)', () => {
    assert.ok(NEXT_MODE_FLAT.includes('carrying none of `ready`, any `needs:*`-prefixed label'), 'eligibility predicate must still exclude needs:definition — #967/#968\'s own loop-guard invariant, re-asserted here since #968\'s guard depends on it staying true, now expressed as a needs:* prefix rather than a literal');
    assert.ok(NEXT_MODE_FLAT.includes("EXCLUDE.has(l.name) || l.name.startsWith('needs:')"), 'EXCLUDE construction must generalize to a needs:* prefix check, not a literal needs:definition Set entry');
    assert.ok(!NEXT_MODE_FLAT.includes("'ready', 'needs:definition', 'parked'"), 'needs:definition must no longer be a literal EXCLUDE Set member — it is covered by the prefix check instead');
  });

  test('next-mode.md Claim-step re-read excludes any needs:*-prefixed label, not just needs:definition', () => {
    assert.ok(NEXT_MODE_FLAT.includes('now carries `ready`, any `needs:*`-prefixed label, `parked`, `parent-issue`, or `bot:in-progress`'), 'Claim-step re-read must generalize to any needs:*-prefixed label');
  });

  test('next-mode.md Framing Guard cites the needsDecisionMarker capability retroactively', () => {
    assert.ok(NEXT_MODE_FLAT.includes('needsDecisionMarker'), 'Framing Guard must cite the needsDecisionMarker capability naming its needs:definition stamp');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/specify-next-mode.test.js
  ```

  Expected: the two updated tests FAIL against the current, unchanged prose; the two brand-new tests
  also FAIL.

- [ ] **Step 3: Edit the Eligibility query's intro prose**

  Replace (current lines 81-83):

  ```
  Per `_shared/record-queue-fetch.md`'s `work-backend: github-issues` fetch:
  open records carrying none of `ready`, `needs:definition`, `parked`,
  `parent-issue`, and `bot:in-progress`. The last is a cheap label-based
  ```

  with:

  ```
  Per `_shared/record-queue-fetch.md`'s `work-backend: github-issues` fetch:
  open records carrying none of `ready`, any `needs:*`-prefixed label
  (`_shared/work-record.md`'s worklist rule), `parked`, `parent-issue`, and
  `bot:in-progress`. The last is a cheap label-based
  ```

- [ ] **Step 4: Edit the rationale prose (current lines 98-103)**

  Replace:

  ```
  The other two exclusions are content judgments, not mechanical ones, and each rules out headless
  shaping for a different reason: **`needs:definition`** marks "a genuine open
  choice with no tradeoff made yet, rather than a single clear ask"
  (`_shared/work-record.md`'s Definition family) — an undecided record cannot
  be born-ready, and a headless firing has nobody present to make the decision
  it's waiting on, so shaping it would mean fabricating that human
  call. **`parked`** marks a record a human deliberately deferred;
  ```

  with:

  ```
  The other two exclusions are content judgments, not mechanical ones, and each rules out headless
  shaping for a different reason: **any `needs:*`-prefixed label** marks a record another unit is
  already asking a human to decide (`_shared/work-record.md`'s worklist rule; `needs:definition`
  specifically marks "a genuine open choice with no tradeoff made yet, rather than a single clear
  ask" — that file's Definition family) — an undecided record cannot be born-ready, and a headless
  firing has nobody present to make the decision it's waiting on, so shaping it would mean
  fabricating that human call. **`parked`** marks a record a human deliberately deferred;
  ```

- [ ] **Step 5: Edit the `EXCLUDE` set construction (current line 130)**

  Replace:

  ```javascript
    const EXCLUDE = new Set(['ready', 'needs:definition', 'parked', 'parent-issue', 'bot:in-progress']);
    const eligible = records.filter((r) =>
      !r.labels.some((l) => EXCLUDE.has(l.name))
    );
  ```

  with:

  ```javascript
    const EXCLUDE = new Set(['ready', 'parked', 'parent-issue', 'bot:in-progress']);
    const eligible = records.filter((r) =>
      !r.labels.some((l) => EXCLUDE.has(l.name) || l.name.startsWith('needs:'))
    );
  ```

- [ ] **Step 6: Edit the Claim-step re-read prose (current lines 189-190)**

  Replace:

  ```
  If the re-read shows the record no longer eligible (now carries `ready`,
  `needs:definition`, `parked`, `parent-issue`, or `bot:in-progress`) — exit
  ```

  with:

  ```
  If the re-read shows the record no longer eligible (now carries `ready`,
  any `needs:*`-prefixed label, `parked`, `parent-issue`, or `bot:in-progress`) — exit
  ```

- [ ] **Step 7: Add the Framing Guard citation**

  Immediately after the Framing Guard's opening paragraph (the sentence ending "...not fixed here."
  around current line 242), add a new paragraph:

  ```
  This stamp is the original instance of the residue-channel capability `_shared/autonomy-ceiling.md`'s
  Bookkeeping capabilities table names `needsDecisionMarker` (`trusted`+, documented retroactively by
  #1488) — a headless unit may write a `needs:*` label plus its explanatory comment with no per-write
  approval.
  ```

- [ ] **Step 8: Run tests to confirm PASS**

  ```bash
  node --test tests/specify-next-mode.test.js
  ```

  Expected: PASS, all tests in the file.

- [ ] **Step 9: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/specify/next-mode.md
  ```

  Expected: ~28,600 bytes (27,923 + ~700), well under 40,960.

- [ ] **Step 10: Commit**

  ```bash
  git add plugin/skills/specify/next-mode.md tests/specify-next-mode.test.js
  git commit -m "Generalize next-mode.md's eligibility EXCLUDE set to any needs:*-prefixed label"
  ```

---

## Task 7: Extract `refine-mode.md`'s `RECOMMEND_BUILD: false` branch into a new `backlog/grant-lane-decision.md`

`refine-mode.md` is 40,933 bytes today — 27 bytes under the 40,960 ceiling. Adding the new
`needs:decision` branch (risk/size-present check, Step 3.5 population expansion, a new Step 5
subsection) cannot fit inline. Per the record's own Gotcha, extract the whole
`RECOMMEND_BUILD: false` branch decision into a new sub-file — the Gotcha's own suggested name,
`backlog/grant-lane-decision.md`, is used verbatim.

**Files:**
- Create: `plugin/skills/backlog/grant-lane-decision.md`
- Modify: `plugin/skills/backlog/refine-mode.md:161-165` (Step 3 bullets), `:194` (Step 3.5
  population line), and a new subsection in Step 5 (after the existing Flag-back-rows section,
  currently ending at line 342)
- Test: `tests/backlog-grant-lane-decision.test.js` (new file)

**Interfaces:**
- Produces: the idempotence-check query and write mechanics for `needs:decision`, reusable verbatim
  by `backlog/grant-mode.md` (Task 8) and `backlog/refine-lanes.md`'s new lane (Task 9).

- [ ] **Step 1: Write the failing test**

  Create `tests/backlog-grant-lane-decision.test.js`:

  ```javascript
  'use strict';

  const { test } = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');

  const ROOT = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

  const REFINE_MODE_FLAT = readFlat('plugin/skills/backlog/refine-mode.md');

  test('grant-lane-decision.md exists and documents the RECOMMEND_BUILD: false branch', () => {
    const p = path.join(ROOT, 'plugin', 'skills', 'backlog', 'grant-lane-decision.md');
    assert.ok(fs.existsSync(p), 'expected plugin/skills/backlog/grant-lane-decision.md to exist');
    const flat = readFlat('plugin/skills/backlog/grant-lane-decision.md');
    assert.ok(flat.includes('flag back'), 'flag-back branch missing from grant-lane-decision.md');
    assert.ok(flat.includes('needs:decision'), 'needs:decision branch missing from grant-lane-decision.md');
    assert.ok(flat.includes('<!-- needs-decision: {unit} -->') || flat.includes('needs-decision: {unit}'), 'decision-comment marker missing from grant-lane-decision.md');
    assert.ok(flat.includes('grant despite the flag, or build it yourself'), 'canonical Proposed text missing');
    assert.ok(flat.includes('/claude-tweaks:backlog refine #{n}'), 'canonical Command text missing');
    assert.ok(flat.includes('contains("**Resolved:**")'), 'idempotence check must exclude already-resolved comments');
  });

  test('refine-mode.md Step 3 cites grant-lane-decision.md for the RECOMMEND_BUILD: false branch', () => {
    assert.ok(REFINE_MODE_FLAT.includes('grant-lane-decision.md'), 'refine-mode.md Step 3 must cite grant-lane-decision.md');
  });

  test('refine-mode.md Step 3.5 body-shape re-verification also covers records headed to needs:decision', () => {
    assert.ok(REFINE_MODE_FLAT.includes('grant-lane-decision.md'), 'Step 3.5 population must reference the needs:decision branch via grant-lane-decision.md');
  });

  test('refine-mode.md Step 5 has a Needs-decision rows subsection pointing at grant-lane-decision.md', () => {
    assert.ok(REFINE_MODE_FLAT.includes('Needs-decision rows'), 'Step 5 Needs-decision rows subsection missing');
  });

  // Go-red control: pre-#1488 Step 3 had exactly a two-bullet RECOMMEND_BUILD:true/false shape with
  // no mention of needs:decision or grant-lane-decision.md at all.
  const PRE_CHANGE_STEP_3_BULLETS = '- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also `true`).\n- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/ `size:*` labels alongside the grant (Step 5).';

  test('go-red control: pre-change Step 3 bullets do not cite grant-lane-decision.md or needs:decision', () => {
    assert.ok(!PRE_CHANGE_STEP_3_BULLETS.includes('grant-lane-decision.md'), 'control must not already cite grant-lane-decision.md');
    assert.ok(!PRE_CHANGE_STEP_3_BULLETS.includes('needs:decision'), 'control must not already mention needs:decision');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: FAIL on the first four tests (file doesn't exist, citations don't exist yet); the go-red
  control test passes immediately.

- [ ] **Step 3: Create `backlog/grant-lane-decision.md`**

  ```markdown
  # Backlog Refine/Grant — Grant-lane Decision (RECOMMEND_BUILD: false branch)

  Referenced by `refine-mode.md`'s Step 3 (the branch this file documents) and Step 3.5 (which of the
  two outcomes below also needs body-shape re-verification) and Step 5 (the write mechanics), by
  `refine-lanes.md`'s Needs-decision lane (the rendered row + annotation template), and by
  `grant-mode.md`'s Step 4 (the headless gate-4 refusal that reaches the identical `needs:decision`
  outcome). Split out to keep `refine-mode.md` under the 40 KB per-file lazy-load ceiling
  (`tests/bin-lib/skill-audit/context-cost.test.js`) rather than duplicating this branch and its
  bash snippets inline at every call site.

  ## The branch

  `grant-check` (`/claude-tweaks:assess-agent-autonomy` in `grant-check` mode) returns
  `RECOMMEND_BUILD: false` for a record. Two outcomes, mutually exclusive:

  - **`risk:*` or `size:*` is missing** — a genuine scoring gap, not a content refusal. Flag back
    exactly as before this record existed: remove `ready`, post the flag-back comment
    (`refine-mode.md` Step 5's Flag-back-rows mechanics, unchanged by this file).
  - **Both `risk:*` and `size:*` are already present, and the record passes Step 3.5's body-shape
    re-verification** — a content-based denial (risk:high merge-authority work, a body naming a
    human-present-only deliverable, a record already resolved live), not a scoring gap. This is the
    outcome this file documents: stamp `needs:decision`, keep `ready`, add no `auto:*`.

  `refine-mode.md` Step 1's fetch already carries `facets.risk`/`facets.size` for every selected
  record — this check reads already-fetched facts, no new API call.

  **`/backlog grant`'s identical outcome (`grant-mode.md` Step 4):** Phase C's `evaluateGrantGate`
  returns `grant: false, failedKey: 'grant-check'` — gate 4 denied a candidate that already cleared
  gates 1-3. Unlike `refine`'s path, no risk/size precondition applies here — every other `failedKey`
  at any phase stays a silent Skip row (`grant-mode.md` Step 4, unchanged).

  ## Idempotence check (before lanning/applying)

  Query whether this record already carries an *unresolved* decision comment from this unit:

  ```bash
  gh issue view "$ISSUE" --json comments -q '.comments[] | select(.body | contains("<!-- needs-decision: {unit} -->")) | select(.body | contains("**Resolved:**") | not) | .id'
  ```

  `{unit}` is `backlog-refine` or `backlog-grant`, per caller. A resolved comment's `**Resolved:**`
  line is prepended above the marker (`_shared/work-record.md`'s resolution rule), so a resolved
  comment never matches this query even though the marker text is still present in its body — that's
  deliberate: a resolved comment must never gate a fresh one.

  - **Non-empty** — an earlier run already marked this record for this unit. Render one annotation
    line only, never a fresh row, and write nothing this run.
  - **Empty** — lane/apply it as a fresh row.

  ## Write mechanics (`needs:decision` outcome only)

  Keep `ready`, add no `auto:*` grant, add `needs:decision` (bootstrap per
  `_shared/label-bootstrap.md`), post one marker comment:

  ```
  <!-- needs-decision: {unit} -->
  ## Decision needed
  **Proposed:** grant despite the flag, or build it yourself
  **Why:** {grant-check RATIONALE, verbatim}
  **Command:** `/claude-tweaks:backlog refine #{n}`
  ```

  `{unit}` is `backlog-refine` or `backlog-grant` — the literal skill/mode name that wrote it, per
  `_shared/work-record.md`'s decision-comment template. `**Command:**` is always
  `/claude-tweaks:backlog refine #{n}`, regardless of which unit wrote the comment — both origins
  resolve through the same front door (`grant-mode.md`'s own Gotcha).

  ```bash
  eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" "BACKLOG_NEEDS_DECISION=backlog-needs-decision-${ISSUE}.md")"
  gh issue edit "$ISSUE" --add-label needs:decision
  gh issue comment "$ISSUE" --body-file "$BACKLOG_NEEDS_DECISION"
  ```

  `refine-mode.md`'s batched application (`refine-lanes.md`'s Needs-decision lane): write
  `{issue, addLabels: ["needs:decision"], commentFile}` per row to
  `$ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION`, then one `bin/apply-refine-labels.js` call applies the
  whole lane — same batching every other lane uses (`apply-refine-labels.js` already accepts
  `addLabels` + `commentFile` together in one action, the identical shape Flag-back already uses with
  `removeLabels` + `commentFile`). `grant-mode.md`'s Step 4 applies its own single-record write
  inline — that mode has no batched-lane apply step at all.
  ```

- [ ] **Step 4: Replace `refine-mode.md` Step 3's bullets with a pointer**

  Byte-verified (`wc -c`): the original two-bullet block is 359 bytes; this replacement is 219
  bytes — a **−140 byte** change. Replace (current lines 161-165):

  ```
  - **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also
    `true`).
  - **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as
    a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/
    `size:*` labels alongside the grant (Step 5).
  ```

  with:

  ```
  Read `grant-lane-decision.md` in this skill's directory for the full `RECOMMEND_BUILD` outcome
  table (`auto:build`/`auto:merge`, flag back, `needs:decision`) and Step 5's write mechanics for
  each — not restated here.
  ```

- [ ] **Step 5: Edit Step 3.5's population line**

  Byte-verified: the original sentence is 459 bytes; this replacement is 467 bytes — a **+8 byte**
  change. Replace (current line 194):

  ```
  For every record the grant-check pass recommends **granting** (not flag-back/blocked rows) — fetch the body and re-verify spec shape immediately before writing any label, using the same cached-body-reuse trick the retired `/claude-tweaks:triage` skill's old Step 3.5 used (`grant-check` already fetched and cached the body at this run's session-scoped `assess-grant-{n}.json` — `_shared/session-tmp-root.md`; reuse it instead of a second API round-trip).
  ```

  with:

  ```
  For every record `grant-lane-decision.md`'s outcome table resolves to granting or `needs:decision`
  — fetch the body and re-verify spec shape immediately before writing any label, using the same
  cached-body-reuse trick the retired `/claude-tweaks:triage` skill's old Step 3.5 used (`grant-check`
  already fetched and cached the body at this run's session-scoped `assess-grant-{n}.json` —
  `_shared/session-tmp-root.md`; reuse it instead of a second API round-trip).
  ```

- [ ] **Step 6: Add a Needs-decision rows subsection to Step 5**

  `refine-mode.md`'s Step 5 is a flat sequence of bold inline sub-headers, not `##` headings, in this
  order: **Priority/Related rows:** (current line 271) → **Grant rows:** (line 301) →
  **Dependency-repair rows:** (line 329) → **Flag-back rows:** (lines 336-342, ending with the
  `gh issue comment` bash block) → then the shared logging paragraph beginning "Check each write's
  own result before logging it..." (line 344). Insert the new subsection immediately after the
  Flag-back-rows bash block (after line 342) and before that shared logging paragraph (line 344) —
  re-verify these exact line numbers against the live file before inserting, since this task's own
  Step 4/5 edits (above) shift everything below them.

  Byte-verified: this insertion (including its leading blank line) is 150 bytes, added — no existing
  text is removed here, and **no new line is added to the `decisions.md` logging template
  fenced-block** (current lines 350-359) — logging reuses that template's existing `AUTO {time} —
  Backlog refine: …` shape by substitution, keeping this task's total footprint inside `refine-mode.md`
  to −140 + 8 + 150 = **+18 bytes** net, against the file's 27-byte headroom:

  ```markdown

  **Needs-decision rows:** `grant-lane-decision.md`'s Write mechanics — label, comment, keep `ready`,
  no `auto:*`. Logged the same as any row above.
  ```

  Add `needs:decision` writes to the closing summary's per-type tally line (the "Per-type tally line"
  bullet, current lines 368-373) alongside `granted`/`flagged back`/etc. — this is a one- or two-word
  addition to an existing enumerated list (e.g. `· 1 needs-decision ·`), not a new sentence, so it is
  not separately byte-budgeted above; re-measure the whole file in Step 8 regardless.

- [ ] **Step 7: Run tests to confirm PASS**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: PASS, all tests.

- [ ] **Step 8: Byte-ceiling check — the critical gate for this task**

  ```bash
  wc -c plugin/skills/backlog/refine-mode.md
  ```

  Expected: **at or below 40,960**. If over, trim the Step 3 bullet, the Step 3.5 sentence, or the
  Needs-decision rows subsection further before proceeding — do not leave this file over budget.
  (Net effect of Steps 4-6: Step 4 shrinks the file relative to the original two-bullet block by
  moving the branch detail into the new sub-file; Steps 5-6 add a modest pointer each. Re-measure
  after every edit, not just at the end.)

- [ ] **Step 9: Full suite**

  ```bash
  npm test 2>&1 | tail -40
  ```

  Expected: no new failures (in particular, re-run
  `tests/backlog-refine-body-reverify.test.js`, `tests/backlog-refine-closing-render.test.js`,
  `tests/backlog-refine-reverify-before-write.test.js`, `tests/backlog-refine-foldin-no-truncation.test.js`
  in isolation if the full run shows any drift, since these already pin `refine-mode.md`'s prose).

- [ ] **Step 10: Commit**

  ```bash
  git add plugin/skills/backlog/grant-lane-decision.md plugin/skills/backlog/refine-mode.md tests/backlog-grant-lane-decision.test.js
  git commit -m "Extract refine-mode.md's RECOMMEND_BUILD:false branch into grant-lane-decision.md, add needs:decision outcome"
  ```

---

## Task 8: Wire `backlog/grant-mode.md`'s headless gate-4 refusal to the identical `needs:decision` outcome

**Files:**
- Modify: `plugin/skills/backlog/grant-mode.md:378-382` (the "Skip rows" section)
- Test: `tests/backlog-grant-lane-decision.test.js` (extend)

**Interfaces:**
- Consumes: `grant-lane-decision.md`'s idempotence check and write mechanics (Task 7).

- [ ] **Step 1: Write the failing test**

  Append to `tests/backlog-grant-lane-decision.test.js`:

  ```javascript
  const GRANT_MODE_FLAT = readFlat('plugin/skills/backlog/grant-mode.md');

  test('grant-mode.md Step 4 carves failedKey grant-check out of the generic Skip rows silence into a needs:decision write', () => {
    assert.ok(GRANT_MODE_FLAT.includes('grant-lane-decision.md'), 'grant-mode.md Step 4 must cite grant-lane-decision.md');
    assert.ok(GRANT_MODE_FLAT.includes("failedKey === 'grant-check'") || GRANT_MODE_FLAT.includes('`grant-check`'), 'grant-mode.md must name the grant-check failedKey as the carved-out case');
  });

  const PRE_CHANGE_SKIP_ROWS = '**Skip rows** (any `failedKey` set, at any phase): no label change, no comment on the record — a skip is silent to the record itself (a human-filed record, an out-of-cap record, or a transiently-unclean class should not accumulate visible noise every firing). Log to `decisions.md` only, naming the exact `failedKey` and `reason` — no per-verdict branching, per this record\'s own gate-chain design.';

  test('go-red control: pre-change Skip rows section treats every failedKey identically, no needs:decision carve-out', () => {
    assert.ok(!PRE_CHANGE_SKIP_ROWS.includes('grant-lane-decision.md'), 'control must not already cite grant-lane-decision.md');
    assert.ok(!PRE_CHANGE_SKIP_ROWS.includes('needs:decision'), 'control must not already carve out a needs:decision case');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: the new positive assertion FAILs; the go-red control passes immediately.

- [ ] **Step 3: Edit `grant-mode.md`'s Skip rows section**

  Replace (current lines 378-382):

  ```
  **Skip rows** (any `failedKey` set, at any phase): no label change, no comment on the record —
  a skip is silent to the record itself (a human-filed record, an out-of-cap record, or a
  transiently-unclean class should not accumulate visible noise every firing). Log to
  `decisions.md` only, naming the exact `failedKey` and `reason` — no per-verdict branching, per
  this record's own gate-chain design.
  ```

  with:

  ```
  **Needs-decision rows** (`failedKey === 'grant-check'` only — gate 4 refused a candidate that
  already cleared gates 1-3): see `grant-lane-decision.md`'s Idempotence check and Write mechanics
  sections in this skill's directory — the identical `needs:decision` outcome `/backlog refine`'s
  Grant lane produces, keyed `{unit}` = `backlog-grant`. Log the same way any other write is logged
  here (Audit format, below), naming the `grant-check` `RATIONALE` as `{grant-check RATIONALE}`.

  **Skip rows** (every other `failedKey`, at any phase): no label change, no comment on the record —
  a skip is silent to the record itself (a human-filed record, an out-of-cap record, or a
  transiently-unclean class should not accumulate visible noise every firing). Log to
  `decisions.md` only, naming the exact `failedKey` and `reason` — no per-verdict branching, per
  this record's own gate-chain design.
  ```

- [ ] **Step 4: Run tests to confirm PASS**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: PASS.

- [ ] **Step 5: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/backlog/grant-mode.md
  ```

  Expected: ~29,000 bytes (28,406 + ~600), well under 40,960.

- [ ] **Step 6: Full suite (grant-mode.md is pinned elsewhere too)**

  ```bash
  npm test 2>&1 | tail -40
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add plugin/skills/backlog/grant-mode.md tests/backlog-grant-lane-decision.test.js
  git commit -m "Wire grant-mode.md's gate-4 refusal to the shared needs:decision outcome"
  ```

---

## Task 9: Add a Needs-decision lane to `refine-lanes.md`

**Files:**
- Modify: `plugin/skills/backlog/refine-lanes.md` (lane precedence line, count-summary line,
  session-tmp variable resolution block, a new `## Needs-decision` section between `## Flag-back` and
  `## Priority`)
- Test: `tests/backlog-grant-lane-decision.test.js` (extend)

**Interfaces:**
- Consumes: `grant-lane-decision.md`'s Write mechanics (Task 7); `apply-refine-labels.js`'s existing
  `{issue, addLabels, commentFile}` action shape (no code change needed there — already supports this
  combination, the same shape Flag-back already uses with `removeLabels` + `commentFile`).

- [ ] **Step 1: Write the failing tests**

  Append to `tests/backlog-grant-lane-decision.test.js`:

  ```javascript
  const REFINE_LANES_FLAT = readFlat('plugin/skills/backlog/refine-lanes.md');

  test('refine-lanes.md declares a Needs-decision lane between Flag-back and Priority', () => {
    const flagBackIdx = REFINE_LANES_FLAT.indexOf('## Flag-back');
    const needsDecisionIdx = REFINE_LANES_FLAT.indexOf('## Needs-decision');
    const priorityIdx = REFINE_LANES_FLAT.indexOf('## Priority');
    assert.ok(flagBackIdx !== -1 && needsDecisionIdx !== -1 && priorityIdx !== -1, 'all three lane headings must exist');
    assert.ok(flagBackIdx < needsDecisionIdx && needsDecisionIdx < priorityIdx, 'Needs-decision lane must sit between Flag-back and Priority');
  });

  test('refine-lanes.md Needs-decision lane writes addLabels + commentFile via apply-refine-labels.js', () => {
    const needsDecisionIdx = REFINE_LANES_FLAT.indexOf('## Needs-decision');
    const priorityIdx = REFINE_LANES_FLAT.indexOf('## Priority');
    const section = REFINE_LANES_FLAT.slice(needsDecisionIdx, priorityIdx);
    assert.ok(section.includes('ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION'), 'Needs-decision lane must resolve its own actions-file variable');
    assert.ok(section.includes('apply-refine-labels.js'), 'Needs-decision lane must apply via apply-refine-labels.js');
    assert.ok(section.includes('needs:decision'), 'Needs-decision lane must name the needs:decision label');
  });

  test('refine-lanes.md lane precedence line names Needs-decision', () => {
    assert.ok(REFINE_LANES_FLAT.includes('Needs-decision'), 'the one-lane-per-record precedence statement must name the Needs-decision lane');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: FAIL — no `## Needs-decision` heading exists yet.

- [ ] **Step 3: Update the precedence line and count-summary line**

  In the file's opening paragraph (current lines 9-21), change:

  ```
  One lane per record, precedence: Re-authorize → Grant → Flag-back (populated during the run by
  Step 3.5 downgrades) → Priority (annotation-line when the record is already laned above) →
  ```

  to:

  ```
  One lane per record, precedence: Re-authorize → Grant → Flag-back (populated during the run by
  Step 3.5 downgrades) → Needs-decision (populated by `grant-lane-decision.md`'s scored-but-refused
  branch) → Priority (annotation-line when the record is already laned above) →
  ```

  In the count-summary line (current lines 27-30), change:

  ```
  `23` suggestions across `6` lanes: `2` re-authorize, `7` grant, `3` flag-back, `8` priority,
  `1` dependency-repair, `2` needs-you — counts are lane array lengths, computed fresh every run.
  ```

  to:

  ```
  `24` suggestions across `7` lanes: `2` re-authorize, `7` grant, `3` flag-back, `1` needs-decision,
  `8` priority, `1` dependency-repair, `2` needs-you — counts are lane array lengths, computed fresh
  every run.
  ```

- [ ] **Step 4: Add the session-tmp variable**

  In the resolution block (current line 35), add `ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION` to the
  list:

  ```bash
  eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" ST_BACKLOG_REFINE_ACTIONS_REAUTHORIZE=backlog-refine-actions-reauthorize.json ST_BACKLOG_REFINE_ACTIONS_GRANT=backlog-refine-actions-grant.json ST_BACKLOG_REFINE_ACTIONS_FLAGBACK=backlog-refine-actions-flagback.json ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION=backlog-refine-actions-needsdecision.json ST_BACKLOG_REFINE_ACTIONS_PRIORITY=backlog-refine-actions-priority.json)"
  ```

- [ ] **Step 5: Add the `## Needs-decision` section**

  Insert immediately after the existing `## Flag-back` section (after its last paragraph, current
  line 174, before `## Priority`):

  ````markdown
  ## Needs-decision

  Population: rows `grant-lane-decision.md`'s branch routes to `needs:decision` — a scored,
  spec-shaped record `grant-check` refused for a content reason, not a scoring gap (`refine-mode.md`
  Step 3 / Step 3.5). Rows already carrying an unresolved `<!-- needs-decision: backlog-refine -->`
  comment (`grant-lane-decision.md`'s Idempotence check) render one annotation line instead of a
  fresh row and write nothing this run.

  | # | Record | Current → Recommended | Evidence |
  |---|---|---|---|
  | 1 | #301: {title} | ready → ready + needs:decision | RECOMMEND_BUILD: false, already scored — {grant-check RATIONALE} |

  Accepted defaults, paste-ready (`grant-lane-decision.md`'s Write mechanics — bootstrap comment
  lives there, not repeated here). Write every needs-decision row's action to
  `"$ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION"` (`addLabels: ["needs:decision"], commentFile:
  "/tmp/backlog-needs-decision-{issue}.md"` per record), then apply the whole lane in one call:

  ```bash
  ── Needs-decision ──
  node "${CLAUDE_PLUGIN_ROOT}/bin/apply-refine-labels.js" "$ST_BACKLOG_REFINE_ACTIONS_NEEDSDECISION" --run "$PIPELINE_RUN_DIR"
  ```

  Unlike Flag-back, this lane never removes `ready` — `apply-refine-labels.js`'s action carries only
  `addLabels` + `commentFile`, no `removeLabels`.
  ````

- [ ] **Step 6: Run tests to confirm PASS**

  ```bash
  node --test tests/backlog-grant-lane-decision.test.js
  ```

  Expected: PASS.

- [ ] **Step 7: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/backlog/refine-lanes.md
  ```

  Expected: ~28,000 bytes (26,489 + ~1,500), well under 40,960.

- [ ] **Step 8: Full suite**

  ```bash
  npm test 2>&1 | tail -40
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add plugin/skills/backlog/refine-lanes.md tests/backlog-grant-lane-decision.test.js
  git commit -m "Add a Needs-decision lane to refine-lanes.md"
  ```

---

## Task 10: Implement `specify/shaping-mode.md`'s `needs:*` removal authority (closes #825's gap)

**Files:**
- Modify: `plugin/skills/specify/shaping-mode.md:150-152` (stamp bullets), `:194-202` (compose call),
  `:232-237` (read-back verification), `:253` (territory-line summary)
- Test: `tests/shaping-mode-needs-removal.test.js` (new file)

**Interfaces:**
- Produces: on every promotion write, `--remove-label "needs:definition" --remove-label
  "needs:decision"` (each omitted individually when the record never carried it), plus — for a
  `needs:decision` removal specifically — a prior comment-edit step closing out every unresolved
  `needs-decision:*` comment via the identical `updateIssueComment` GraphQL mutation
  `_shared/pr-run-comments.md`'s Post-or-update procedure Step 2 already documents for editing an
  existing comment in place (same `IssueComment` node-ID shape, targeting an issue comment instead of
  a PR comment).

- [ ] **Step 1: Write the failing test**

  Create `tests/shaping-mode-needs-removal.test.js`:

  ```javascript
  'use strict';

  const { test } = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');

  const ROOT = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

  const SHAPING_MODE_FLAT = readFlat('plugin/skills/specify/shaping-mode.md');

  test('shaping-mode.md states the needs:* removal-on-promotion bullet, generalizing #825', () => {
    assert.ok(SHAPING_MODE_FLAT.includes('generalizes #825'), 'shaping-mode.md must cite #825 in its needs:* removal bullet');
    assert.ok(SHAPING_MODE_FLAT.includes('remove every `needs:*`-prefixed label'), 'needs:* removal bullet missing its core statement');
  });

  test('shaping-mode.md resolves every unresolved needs-decision comment before removing needs:decision', () => {
    assert.ok(SHAPING_MODE_FLAT.includes('**Resolved:** promoted via /specify'), 'promotion-time resolution line text missing');
    assert.ok(SHAPING_MODE_FLAT.includes('updateIssueComment'), 'shaping-mode.md must use the GraphQL updateIssueComment mutation to edit the live comment in place');
    assert.ok(SHAPING_MODE_FLAT.includes('needs:definition` carries no such comment and needs no equivalent write'), 'shaping-mode.md must distinguish needs:definition (no comment) from needs:decision (has a comment)');
  });

  test('shaping-mode.md compose-then-write-once call removes both needs:definition and needs:decision', () => {
    assert.ok(SHAPING_MODE_FLAT.includes('--remove-label "needs:definition"'), 'compose call must remove needs:definition');
    assert.ok(SHAPING_MODE_FLAT.includes('--remove-label "needs:decision"'), 'compose call must remove needs:decision');
  });

  test('shaping-mode.md read-back verification asserts no needs:* label survived the write', () => {
    assert.ok(SHAPING_MODE_FLAT.includes('needs:') && /needs:\*/.test(SHAPING_MODE_FLAT), 'read-back verification must assert against the needs:* family, not just parked/solution:unjustified');
  });

  // #763 is a real, currently-closed record that hit exactly this bug: it entered shaping carrying
  // needs:definition, had its open question resolved via an in-shaping AskUserQuestion, and was
  // stamped ready + full scoring while needs:definition remained on the final label set (verified
  // live via `gh issue view 763 --json labels` — both `ready` and `needs:definition` are present on
  // the closed issue today). This is AC4's own named historical scenario.
  const PRE_CHANGE_STAMP_BULLETS = '- **`parked` present** — remove it; a record entering shaping mode is being promoted out of hold.\n- **`ready`** — add it (idempotent when already present, e.g. a born-ready record).';

  test('go-red control (#763\'s bug): pre-change stamp bullets have no needs:* removal step at all', () => {
    assert.ok(!PRE_CHANGE_STAMP_BULLETS.includes('needs:'), 'control must not already remove any needs:* label — this is the exact absence #763 hit and #825 reported');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/shaping-mode-needs-removal.test.js
  ```

  Expected: FAIL on the first four tests; the go-red control PASSes immediately (proves the
  pre-change text really did lack any needs:* removal, grounding AC4's #763 claim).

- [ ] **Step 3: Add the `needs:*`-present stamp bullet**

  Insert a new bullet between the `parked` bullet and the `ready` bullet (current lines 151-152):

  ```
  - **`parked` present** — remove it; a record entering shaping mode is being promoted out of hold.
  - **`needs:*` present** — remove every `needs:*`-prefixed label the record carries (generalizes
    #825's `needs:definition`-only removal authority to the whole family — a record entering shaping
    mode is having its open question(s) resolved by this pass). For each `needs:decision` label
    being cleared this way — a label that owns a live decision comment, per
    `_shared/work-record.md`'s resolution rule — find every unresolved `<!-- needs-decision: -->`
    comment on the record and prepend `**Resolved:** promoted via /specify — {date}` to each, in the
    same edit, before removing the label. `needs:definition` carries no such comment and needs no
    equivalent write.
  - **`ready`** — add it (idempotent when already present, e.g. a born-ready record).
  ```

- [ ] **Step 4: Add the comment-resolution mechanics before the compose-then-write-once call**

  Immediately before the `### Compose-then-write-once` heading (current line 156), add:

  ```markdown
  **Resolving live `needs:decision` comments (before the write below), when `needs:decision` is
  present:**

  ```bash
  gh issue view {n} --json comments -q '.comments[] | select(.body | contains("<!-- needs-decision: ")) | select(.body | contains("**Resolved:**") | not) | .id'
  ```

  For each returned GraphQL node ID, fetch that comment's current body, prepend `**Resolved:**
  promoted via /specify — {date}\n\n` to it, and edit it in place — the identical
  `updateIssueComment` GraphQL mutation `_shared/pr-run-comments.md`'s Post-or-update procedure Step
  2 uses for PR comments, applied here to an issue comment's node ID instead of a PR's (same
  `IssueComment` type, same mutation shape):

  ```bash
  gh api graphql -f query='mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{id}}}' \
    -f id="{found-id}" -F body=@/tmp/needs-decision-resolved-{n}-{found-id}.md
  ```

  Do this for every unresolved comment found — a record refused by both `backlog-refine` and
  `backlog-grant` concurrently carries two separate `needs:decision`-labeled comments, and both must
  be resolved in this same shaping pass before the label itself is removed below.
  ```

- [ ] **Step 5: Edit the compose-then-write-once GitHub-issues call**

  Replace (current lines 194-202):

  ```bash
  gh issue edit {n} \
    --body-file "$SPECIFY_SHAPED_BODY" \
    --add-label ready \
    --add-label "risk:{tier}" \
    --add-label "size:{tier}" \
    --add-label "ceremony:{tier}" \
    --type {t} \
    --remove-label parked
  ```

  with:

  ```bash
  gh issue edit {n} \
    --body-file "$SPECIFY_SHAPED_BODY" \
    --add-label ready \
    --add-label "risk:{tier}" \
    --add-label "size:{tier}" \
    --add-label "ceremony:{tier}" \
    --type {t} \
    --remove-label parked \
    --remove-label "needs:definition" \
    --remove-label "needs:decision"
  ```

  And extend the following omission-rule paragraph (current line 204) with:

  ```
  Omit `--remove-label "needs:definition"` / `--remove-label "needs:decision"` individually for
  whichever the record never carried — same omit-when-absent rule as `--remove-label parked` — and
  run the comment-resolution mechanics above first when `needs:decision` is one of the labels being
  removed.
  ```

- [ ] **Step 6: Edit the Read-back verification section**

  In the assertion list (current lines 232-237), add a new bullet after the `parked` absence
  assertion:

  ```
  - No `needs:*`-prefixed label survived the write — this pass's own removal bullet (above) always
    clears every one the record carried on entry.
  ```

- [ ] **Step 7: Edit the territory-line summary**

  Update the closing summary sentence (current line 253):

  ```
  `/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes
  `parked` on promotion — and, as the one removal carve-out, strips `ready`/`risk:*`/`size:*`/
  `ceremony:*`/`solution:unjustified` from a record bearing the parent marker...
  ```

  to:

  ```
  `/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), removes
  `parked` and every `needs:*`-prefixed label on promotion — and, as the one removal carve-out,
  strips `ready`/`risk:*`/`size:*`/`ceremony:*`/`solution:unjustified` from a record bearing the
  parent marker...
  ```

- [ ] **Step 8: Run tests to confirm PASS**

  ```bash
  node --test tests/shaping-mode-needs-removal.test.js
  ```

  Expected: PASS, all 5 tests.

- [ ] **Step 9: Re-run `tests/specify-next-mode.test.js` (it also reads shaping-mode.md)**

  ```bash
  node --test tests/specify-next-mode.test.js
  ```

  Expected: still PASS — none of this task's edits touch the `--add-label ready` /
  `--add-label "shaped:headless"` strings that file pins.

- [ ] **Step 10: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/specify/shaping-mode.md
  ```

  Expected: ~30,300 bytes (29,170 + ~1,100), well under 40,960.

- [ ] **Step 11: Full suite**

  ```bash
  npm test 2>&1 | tail -40
  ```

- [ ] **Step 12: Commit**

  ```bash
  git add plugin/skills/specify/shaping-mode.md tests/shaping-mode-needs-removal.test.js
  git commit -m "specify shaping mode: remove every needs:* label on promotion, resolving live needs:decision comments first — closes #825's gap"
  ```

---

## Task 11: Generalize `tidy/step-1-records.md`'s worklist exclusion across Shapes 1, 2, 3, 4, 5, 7, 8

**Files:**
- Modify: `plugin/skills/tidy/step-1-records.md` (a new paragraph after line 48, before `### Shape
  1`; Shape 7's `node -e` script around lines 186-222; Shape 8's `node -e` script around lines
  283-303)
- Test: `tests/tidy-needs-worklist-rule.test.js` (new file)

**Interfaces:**
- Produces: a `needsDefinition` field on Shape 7's per-parent gate objects, and a leading `.filter()`
  on both Shape 7's and Shape 8's chains.

- [ ] **Step 1: Write the failing test**

  Create `tests/tidy-needs-worklist-rule.test.js`:

  ```javascript
  'use strict';

  const { test } = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');

  const ROOT = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

  const STEP1_RECORDS = read('plugin/skills/tidy/step-1-records.md');
  const STEP1_RECORDS_FLAT = readFlat('plugin/skills/tidy/step-1-records.md');

  test('step-1-records.md states the worklist rule once, scoped to Shapes 1, 2, 3, 4, 5, 7, 8', () => {
    assert.ok(STEP1_RECORDS_FLAT.includes('Worklist rule (Shapes 1, 2, 3, 4, 5, 7, 8)'), 'worklist-rule heading/scope statement missing');
    assert.ok(STEP1_RECORDS_FLAT.includes("`_shared/work-record.md`'s worklist rule"), 'must cite the shared worklist rule rather than restate it');
    assert.ok(STEP1_RECORDS_FLAT.includes('Shapes 5.5 and 6 are exempt'), 'must state the two exempt shapes explicitly');
  });

  test('worklist-rule paragraph sits before Shape 1', () => {
    const ruleIdx = STEP1_RECORDS_FLAT.indexOf('Worklist rule (Shapes 1, 2, 3, 4, 5, 7, 8)');
    const shape1Idx = STEP1_RECORDS_FLAT.indexOf('### Shape 1');
    assert.ok(ruleIdx !== -1 && shape1Idx !== -1 && ruleIdx < shape1Idx, 'worklist rule must precede Shape 1');
  });

  test('Shape 7 node -e script filters out needsDefinition parents before the floor/gate-state checks', () => {
    assert.ok(STEP1_RECORDS.includes('needsDefinition: p.facets.needsDefinition === true,'), 'Shape 7 must compute a needsDefinition field per parent');
    assert.ok(STEP1_RECORDS.includes('.filter((f) => !f.needsDefinition)'), 'Shape 7 must filter out needsDefinition parents');
  });

  test('Shape 8 node -e script filters out needsDefinition closed records', () => {
    assert.ok(STEP1_RECORDS.includes('.filter((r) => r.facets.needsDefinition !== true)'), 'Shape 8 must filter out needsDefinition records');
  });

  // Go-red control: pre-change Shape 7/8 scripts had no needsDefinition-aware filter anywhere.
  const PRE_CHANGE_SHAPE7_MAP_RETURN = 'return {\n      id: p.id,\n      title: p.title,\n      path: p.path,\n      parentLabels: p.facets.acceptance ? [\'demo:\' + p.facets.acceptance] : [],\n      subIssues: subIssueRecords.map((r) => ({ number: r.id, state: r.facets.closed ? \'CLOSED\' : \'OPEN\', risk: r.facets.risk })),\n    };';

  test('go-red control: pre-change Shape 7 per-parent object carries no needsDefinition field', () => {
    assert.ok(!PRE_CHANGE_SHAPE7_MAP_RETURN.includes('needsDefinition'), 'control must not already carry a needsDefinition field (proves the assertion above can fail)');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/tidy-needs-worklist-rule.test.js
  ```

  Expected: FAIL on the first four tests; the go-red control passes immediately.

- [ ] **Step 3: Add the worklist-rule paragraph**

  Insert immediately before `### Shape 1` (current line 50), after the predicates paragraph (current
  line 48):

  ```markdown
  **Worklist rule (Shapes 1, 2, 3, 4, 5, 7, 8).** Per `_shared/work-record.md`'s worklist rule — a
  headless unit skips any record another unit is already asking a human to decide — every
  record-scoped shape below excludes a record carrying a `needs:*`-prefixed label from its own
  findings, before applying that shape's own classification. `work-backend: github-issues`: exclude
  any record whose raw `labels` array (preserved alongside `facets` by the shared fetch above)
  contains a name matching `/^needs:/`. `work-backend: local-files`: exclude any record with
  `facets.needsDefinition === true` — the only `needs:*` concept this driver structurally carries;
  `needs:decision` is a `github-issues`-only label in this record's scope, with no local-files facet
  to check. Shapes 5.5 and 6 are exempt — 5.5 never mutates anything (it only surfaces a rename
  recommendation), and 6 is a stub pointing at Step 4.8. This is the first of the worklist rule's two
  checks; the narrower same-unit dedup check (skip a record already carrying `/tidy`'s own unresolved
  `needs-decision` comment for an identical proposal) is Phase 6's own scope, once `/tidy` writes
  that marker — out of scope here.
  ```

- [ ] **Step 4: Edit Shape 7's `node -e` script**

  In the `gates = parents.map(...)` block's `return` object (current lines 200-207, inside the
  `.map()` callback that starts at line 195), add a `needsDefinition` field:

  ```javascript
    return {
      id: p.id,
      title: p.title,
      path: p.path,
      needsDefinition: p.facets.needsDefinition === true,
      parentLabels: p.facets.acceptance ? ['demo:' + p.facets.acceptance] : [],
      subIssues: subIssueRecords.map((r) => ({ number: r.id, state: r.facets.closed ? 'CLOSED' : 'OPEN', risk: r.facets.risk })),
    };
  ```

  And add a leading filter to the chain (current lines 218-221):

  ```javascript
    gates
      .filter((f) => !f.needsDefinition)
      .filter((f) => exceedsOversightFloor({ risk: maxRiskTier(f.subIssues) }, { riskFloor, sizeFloor: null }).exceeds)
      .filter((f) => parentGateState({ subIssues: f.subIssues, parentLabels: f.parentLabels }) === 'due')
      .forEach((f) => console.log(f.path + '\t[parent-gate] ' + f.id + ': ' + f.title + ' — parent complete, no acceptance disposition — Open parent gate, then /claude-tweaks:demo ' + f.id));
  ```

- [ ] **Step 5: Edit Shape 8's `node -e` script**

  Add a leading filter to the chain (current lines 291-302):

  ```javascript
    queryRecords('specs', { closed: true })
      .filter((r) => r.facets.needsDefinition !== true)
      .filter((r) => {
        const closedAt = Date.parse(r.facets.closedAt);
        return Number.isNaN(closedAt) || closedAt >= cutoff;
      })
      .filter((r) => exceedsOversightFloor({ risk: r.facets.risk, size: r.facets.size }, { riskFloor, sizeFloor }).exceeds)
      .filter((r) => needsBackstop({
        state: r.facets.closed ? 'CLOSED' : 'OPEN',
        labels: r.facets.acceptance ? ['demo:' + r.facets.acceptance] : [],
        hasParent: r.facets.parent !== null,
      }))
      .forEach((r) => console.log(r.path + '\t[acceptance-gap] ' + r.id + ': ' + r.title + ' — closed with no acceptance disposition — recommend /claude-tweaks:demo ' + r.id));
  ```

- [ ] **Step 6: Run tests to confirm PASS**

  ```bash
  node --test tests/tidy-needs-worklist-rule.test.js
  ```

  Expected: PASS, all 5 tests.

- [ ] **Step 7: Byte-ceiling check**

  ```bash
  wc -c plugin/skills/tidy/step-1-records.md
  ```

  Expected: ~30,400 bytes (29,376 + ~1,050), well under 40,960.

- [ ] **Step 8: Full suite**

  ```bash
  npm test 2>&1 | tail -40
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add plugin/skills/tidy/step-1-records.md tests/tidy-needs-worklist-rule.test.js
  git commit -m "tidy: exclude any needs:*-prefixed record from Shapes 1, 2, 3, 4, 5, 7, 8"
  ```

---

## Task 12: AC3's dedicated conformance test — grant-gate.js, next-mode.md, and tidy's worklist-rule predicates, each with a go-red control

AC3 requires one conformance test reading the live `EXCLUDE` set construction and the `grant-gate.js`
filter predicate, each with a go-red control proving the assertion can actually fail. Tasks 5, 6, and
11 above already exercise these individually inside their own suites (with per-file go-red controls).
This task adds one **consolidated** cross-cutting suite that asserts all three call sites agree on
the same `needs:*` prefix behavior — the thing no single per-file suite proves on its own.

**Files:**
- Create: `tests/needs-worklist-rule-cross-consumer.test.js`

**Interfaces:**
- Consumes: `evaluateGrantGate` (Task 5), `next-mode.md`'s live prose (Task 6), `step-1-records.md`'s
  live prose (Task 11).

- [ ] **Step 1: Write the failing test**

  Create `tests/needs-worklist-rule-cross-consumer.test.js`:

  ```javascript
  'use strict';

  const { test } = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { evaluateGrantGate } = require('../plugin/bin/lib/issues/grant-gate.js');

  const ROOT = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

  test('grant-gate.js denies a record carrying an arbitrary future needs:*-prefixed label, not just the two named today', () => {
    const result = evaluateGrantGate({
      record: { number: 999, labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'needs:something-not-yet-invented'], body: 'x' },
      policy: { ceiling: 'unattended', grantOriginationEnabled: true, sensitivePaths: [] },
    });
    assert.equal(result.grant, false);
    assert.equal(result.failedKey, 'needs-label');
  });

  test('next-mode.md EXCLUDE prefix check matches the same predicate shape as grant-gate.js', () => {
    const NEXT_MODE_FLAT = readFlat('plugin/skills/specify/next-mode.md');
    assert.ok(NEXT_MODE_FLAT.includes("l.name.startsWith('needs:')"), 'next-mode.md must use the identical needs: prefix-match shape grant-gate.js uses');
  });

  test('tidy/step-1-records.md worklist-rule paragraph names the same /^needs:/ prefix, github-issues side', () => {
    const STEP1_FLAT = readFlat('plugin/skills/tidy/step-1-records.md');
    assert.ok(STEP1_FLAT.includes('/^needs:/'), 'tidy worklist-rule paragraph must name the same needs: prefix pattern');
  });

  // Go-red controls: freeze the pre-#1488 shape of each call site (a needs:definition-only literal
  // check) and prove none of the three assertions above match it.
  const PRE_CHANGE_GRANT_GATE_1C = "if (facets.needsDefinition === true) {\n    return deny('needs-definition', 'record carries needs:definition — an open choice has not been decided yet; run /claude-tweaks:specify to route through brainstorming first');\n  }";
  const PRE_CHANGE_NEXT_MODE_EXCLUDE = "const EXCLUDE = new Set(['ready', 'needs:definition', 'parked', 'parent-issue', 'bot:in-progress']);\n  const eligible = records.filter((r) =>\n    !r.labels.some((l) => EXCLUDE.has(l.name))\n  );";

  test('go-red control: pre-change grant-gate.js Gate 1c has no needs: prefix check at all', () => {
    assert.ok(!PRE_CHANGE_GRANT_GATE_1C.includes("startsWith('needs:')"), 'control must not already have a prefix check');
  });

  test('go-red control: pre-change next-mode.md EXCLUDE construction has no needs: prefix check at all', () => {
    assert.ok(!PRE_CHANGE_NEXT_MODE_EXCLUDE.includes("startsWith('needs:')"), 'control must not already have a prefix check');
  });
  ```

- [ ] **Step 2: Run to confirm FAIL**

  ```bash
  node --test tests/needs-worklist-rule-cross-consumer.test.js
  ```

  Expected (run this **before** Tasks 5, 6, 11 land, or against a stash of the pre-Task-5/6/11 tree,
  to see the real red state): the first three tests FAIL; the two go-red controls PASS immediately.
  Since Tasks 5, 6, and 11 above are expected to already be complete by the time this task runs in
  sequence, run this suite as **verification** that their combined effect is consistent — if it
  fails here, one of those tasks' implementations diverged from the others' prefix-matching shape.

- [ ] **Step 3: No implementation changes expected**

  If Step 2 passes cleanly (the normal case, since Tasks 5/6/11 already implemented each piece), this
  task adds pure verification value with no further code/prose changes needed. If Step 2 fails,
  reconcile the diverging call site against the other two before proceeding — do not weaken this
  test to match a divergent implementation.

- [ ] **Step 4: Run to confirm PASS**

  ```bash
  node --test tests/needs-worklist-rule-cross-consumer.test.js
  ```

  Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/needs-worklist-rule-cross-consumer.test.js
  git commit -m "Add cross-consumer conformance test pinning needs:* prefix behavior across grant-gate.js, next-mode.md, tidy"
  ```

---

## Task 13: Create the `needs:decision` GitHub label (AC6)

**Files:** none (live GitHub state only)

- [ ] **Step 1: Check whether it already exists (another session may have created it)**

  ```bash
  gh label list --search "needs:decision" --json name,description -q '.[] | select(.name == "needs:decision")'
  ```

- [ ] **Step 2: Create it if absent**

  If Step 1 printed nothing:

  ```bash
  gh label create "needs:decision" --description "a headless unit proposed an action it may not take alone — see the newest decision comment"
  ```

  If Step 1 printed a result with a **different** description than the one above, update it instead:

  ```bash
  gh label edit "needs:decision" --description "a headless unit proposed an action it may not take alone — see the newest decision comment"
  ```

- [ ] **Step 3: Verify**

  ```bash
  gh label list --search "needs:decision" --json name,description -q '.[] | select(.name == "needs:decision")'
  ```

  Expected: one result, `needs:decision`, with exactly the description above — satisfies AC6's first
  half. (AC6's second half — `claude-tweaks:bootstrapped-v6` replacing `-v5` — is a side effect of
  Task 3's version bump firing at this repo's next label-bootstrap run, not a separate manual step;
  it is not re-verified here since no bootstrap-triggering skill run is part of this plan.)

---

## Task 14: Close #1317, verify #825's already-closed state (AC5)

**Files:** none (live GitHub state only)

- [ ] **Step 1: Re-verify both issues' live state immediately before writing (state can drift across a long session)**

  ```bash
  gh issue view 1317 --json state,title
  gh issue view 825 --json state,title
  ```

  Expected: `1317` reads `OPEN`; `825` reads `CLOSED` (already closed 2026-08-26T15:05:51Z per this
  plan's own research, with a comment naming #1488 as the absorbing record — do not re-close it or
  post a duplicate absorption comment).

- [ ] **Step 2: Close #1317 with a linking comment**

  ```bash
  gh issue close 1317 --comment "Superseded by #1488 (sweep/residue-markers decomposition), which generalizes this record's comment-only human-only marker into a real needs:decision label plus the shared decision-comment template and worklist rule. PR #1440 (open, targets this issue) ships a comment-only precursor of the same idempotence-check shape; #1488's own Grant-lane fix (backlog/grant-lane-decision.md) supersedes it rather than building alongside it. Closing as absorbed."
  ```

- [ ] **Step 3: Verify #825's existing closure comment still stands (no action, informational check only)**

  ```bash
  gh issue view 825 --json comments -q '.comments[-1].body'
  ```

  Expected: the last comment already reads "Superseded by #1488 ... Closing as absorbed." — confirms
  no further action is needed on #825 for this plan.

- [ ] **Step 4: Verify #1317's closure**

  ```bash
  gh issue view 1317 --json state,comments -q '{state: .state, lastComment: .comments[-1].body}'
  ```

  Expected: `state: "CLOSED"`, last comment matching Step 2's text.

---

## Task 15: Update `docs/skill-graph.md` — one new edge for the extracted permission-matrix file

Per CLAUDE.md's Cross-references rule, a new `_shared/*.md` file gets its consumer edges added once.
`backlog/grant-lane-decision.md` is an internal sub-file split within `/backlog` (cited only by
`refine-mode.md`, `refine-lanes.md`, and `grant-mode.md` — all inside the same skill), not a new
cross-skill relationship, so it needs no `docs/skill-graph.md` row of its own (consistent with how
`refine-lanes.md`, `refine-mode.md`, and `overview-mode.md` — all pre-existing sub-files of the same
skill — have none either). `_shared/work-record-permission-matrix.md`, however, is a genuinely new
`_shared/*.md` fragment multiple *other* skills' rows already reference by the phrase "permission
matrix" (`/backlog`, `/specify`, `/tidy`, `/dispatch`, `/help`, `/wrap-up` sections) — those existing
sentences remain factually correct (they still resolve through `work-record.md`'s new pointer
paragraph), so this task adds one clarifying entry rather than rewriting every existing citation.

**Files:**
- Modify: `docs/skill-graph.md`

- [ ] **Step 1: Add a new row under the `## backlog` section**

  Immediately after the existing `_shared/work-record.md`-citing rows in the `## backlog` section
  (search for the row beginning `| _shared/autonomy-ceiling.md |` in that section and insert after
  it, or after whichever `_shared/work-record.md` row is closest, re-verifying the live file's exact
  row order before inserting), add:

  ```markdown
  | `_shared/work-record-permission-matrix.md` | Extracted (#1488) from `_shared/work-record.md`'s
  `## Permission matrix` section to keep that file under the 40 KB lazy-load ceiling — every existing
  citation of "`_shared/work-record.md`'s permission matrix" elsewhere in this document still
  resolves correctly via that file's own one-paragraph pointer. `refine-mode.md`'s Grant lane and
  `backlog/grant-lane-decision.md`'s needs:decision outcome edit its `/backlog refine` and
  `/backlog grant` rows' Adds columns; `specify/shaping-mode.md` edits its `/specify` row's Removes
  column. |
  ```

- [ ] **Step 2: No other rows need rewriting**

  Confirm this by re-running the consumer-list grep from Task 1 Step 1 one more time, now against
  the finished tree, and eyeballing that every hit still reads sensibly with `work-record.md`'s new
  pointer paragraph in place:

  ```bash
  grep -n -i "permission matrix" plugin/skills/wrap-up/verification-brief.md plugin/skills/backlog/refine-mode.md plugin/skills/backlog/grant-mode.md plugin/skills/dispatch/SKILL.md plugin/skills/tidy/SKILL.md plugin/skills/_shared/work-record-config.md plugin/skills/specify/record-creation.md plugin/skills/specify/spec-template.md plugin/skills/help/status-scan.md docs/skill-graph.md
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs/skill-graph.md
  git commit -m "docs/skill-graph.md: add the work-record-permission-matrix.md extraction edge"
  ```

---

## Task 16: Final full-suite run and repo-wide byte-ceiling re-verification

Per the shared-contract-extraction convention's own Gotcha: "The ~40 KB ceiling check is a merge-time
check, not only an authoring-time one." Re-measure every touched ceiling-gated file one more time
after every task above has landed and after merging any upstream changes, immediately before
considering this record done.

**Files:** none (verification only)

- [ ] **Step 1: Byte-ceiling sweep across every file this plan touched**

  ```bash
  wc -c plugin/skills/_shared/work-record.md plugin/skills/_shared/work-record-permission-matrix.md plugin/skills/_shared/label-bootstrap.md plugin/skills/_shared/autonomy-ceiling.md plugin/skills/backlog/refine-mode.md plugin/skills/backlog/grant-lane-decision.md plugin/skills/backlog/refine-lanes.md plugin/skills/backlog/grant-mode.md plugin/skills/specify/next-mode.md plugin/skills/specify/shaping-mode.md plugin/skills/tidy/step-1-records.md
  ```

  Expected: every number at or under 40,960.

- [ ] **Step 2: Merge `origin/main` (or the integration branch) and re-run Step 1**

  ```bash
  git fetch origin
  git merge origin/main
  wc -c plugin/skills/_shared/work-record.md plugin/skills/_shared/work-record-permission-matrix.md plugin/skills/_shared/label-bootstrap.md plugin/skills/_shared/autonomy-ceiling.md plugin/skills/backlog/refine-mode.md plugin/skills/backlog/grant-lane-decision.md plugin/skills/backlog/refine-lanes.md plugin/skills/backlog/grant-mode.md plugin/skills/specify/next-mode.md plugin/skills/specify/shaping-mode.md plugin/skills/tidy/step-1-records.md
  ```

  Expected: still every number at or under 40,960. If a merge pushed any file over budget, resolve it
  before proceeding — do not merge a red ceiling check.

- [ ] **Step 3: Full test suite**

  ```bash
  npm test 2>&1 | tee /tmp/npm-test-final.log | tail -60
  ```

  Expected: 0 failures. If any count varies run-to-run on byte-identical code, re-run only the
  affected file(s) in isolation before concluding anything is actually broken (machine-load flake,
  per this repo's own `npm test` convention) — never accept a subagent's self-reported pass/fail
  numbers as a run.

- [ ] **Step 4: Grep for any remaining bare restatement of the worklist rule**

  ```bash
  grep -rn "a headless unit skips any open record carrying" plugin/skills/
  ```

  Expected: exactly one hit — `_shared/work-record.md`'s own statement. Every other file cites it by
  name (`_shared/work-record.md`'s worklist rule) rather than restating the sentence.
