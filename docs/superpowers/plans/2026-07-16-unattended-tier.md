# unattended-tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new opt-in policy lever, `unattended-tier` (`off` default | `on`), that lets three
specific, low-stakes decision points — ledger Phase 2 residue, queue-write record creation, and
ops-item acknowledgment — resolve without a live click, everywhere `auto`/`hybrid` mode runs
(headless `/claude-tweaks:dispatch` firings or local `/claude-tweaks:flow` runs alike), while
leaving every other `auto`-mode guarantee (HARD-GATEs, merge conflicts, `Fix anyway`/`Accept`/`Drop`
dispositions) exactly as strict as today.

**Architecture:** One new shared reference file (`skills/_shared/unattended-tier.md`) is the single
source of truth for the lever's precedence, floor rule, and logging/notification shape. One new
pure Node module (`bin/lib/issues/unattended-tier.js`) implements the floor-check predicate. Seven
existing skill files get the lever threaded into the same precedence chain and Manifesto machinery
every other `auto`-mode lever already uses, plus a caveat added everywhere the "auto never
silences X" guarantee is currently asserted.

**Tech Stack:** Markdown skill-file edits (prose procedure) + one small pure Node module tested via
`node --test`, following the existing `bin/lib/issues/` pattern (see `blast-radius.js` /
`blast-radius.test.js` as the reference shape). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-unattended-tier-design.md`

## Global Constraints

- Config key name is exactly `unattended-tier` (kebab-case, matching `scope-creep`,
  `leftover-default`, etc.) everywhere it appears — CLI arg, `config.yml`, CLAUDE.md/`policy.yml`,
  skill docs. No aliases, no renamed forms.
- Default value is `off` everywhere it is read or documented — no silent default drift between
  files.
- No new runtime dependencies. `bin/lib/issues/unattended-tier.js` follows the existing pattern:
  `'use strict'`, `module.exports = { ... }`, tests via `node:test` + `node:assert`.
- Every auto-resolved action writes exactly one `decisions.md` entry in the existing shape:
  `AUTO {time} — {what}. Reason: {policy-source}. Reversibility: {tier}.` — never silent.
- Ambiguity always fails toward **asking** — the inverse of this project's hook-enforcement
  convention (which fails toward allow). Call this out inline wherever a task implements a
  fallback branch.
- Prose edits must preserve the modified file's existing Markdown table structure exactly (same
  column count, valid header-separator row) — don't reflow unrelated table rows while editing.
- Every commit message should reference `unattended-tier` in its subject line so `git log --grep`
  finds the whole feature later.

---

### Task 1: Floor-check predicate (`bin/lib/issues/unattended-tier.js`)

**Files:**
- Create: `bin/lib/issues/unattended-tier.js`
- Test: `bin/lib/issues/tests/unattended-tier.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond Node built-ins)
- Produces: `clearsFloor(blockerReason: string): boolean` — used by `ledger/resolve-gate.md`'s
  Phase 2 narrowing (Task 5) and its standalone Phase 3 fallback (also Task 5). `blockerReason` is
  the free-text "why not fixed now" string a ledger item already carries per
  `ledger/resolve-gate.md`'s existing Phase 2 table.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/unattended-tier.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { clearsFloor } = require('../unattended-tier');

test('clearsFloor returns true for an external-state blocker', () => {
  assert.strictEqual(
    clearsFloor('Requires external state (third-party API data) before this can be fixed'),
    true,
  );
});

test('clearsFloor returns true for a product/design-decision blocker', () => {
  assert.strictEqual(
    clearsFloor('Needs a product decision on the rate-limit value'),
    true,
  );
});

test('clearsFloor returns true for a not-yet-built-dependency blocker', () => {
  assert.strictEqual(
    clearsFloor('Depends on functionality not yet built in this pipeline (the /auth refresh endpoint)'),
    true,
  );
});

test('clearsFloor returns true for a scope-expansion blocker', () => {
  assert.strictEqual(
    clearsFloor('Would expand scope -- breaks 14 unrelated tests'),
    true,
  );
});

test('clearsFloor is case-insensitive', () => {
  assert.strictEqual(clearsFloor('REQUIRES EXTERNAL STATE to proceed'), true);
});

test('clearsFloor returns false for an ambiguous or unrecognized reason', () => {
  assert.strictEqual(clearsFloor('Not sure if this is even still relevant'), false);
});

test('clearsFloor returns false for an empty string', () => {
  assert.strictEqual(clearsFloor(''), false);
});

test('clearsFloor returns false for a non-string input', () => {
  assert.strictEqual(clearsFloor(undefined), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/unattended-tier.test.js`
Expected: FAIL — `Cannot find module '../unattended-tier'`

- [ ] **Step 3: Write the minimal implementation**

Create `bin/lib/issues/unattended-tier.js`:

```javascript
'use strict';

// Pure: the floor-check predicate for the unattended-tier lever. Decides whether a ledger
// item's Phase 1 "why not fixed now" blocker reason is one of the four categories
// ledger/resolve-gate.md's Phase 1 already requires as legitimate -- the only categories
// unattended-tier is allowed to auto-route without asking. See
// docs/superpowers/specs/2026-07-16-unattended-tier-design.md.

const CATEGORY_PATTERNS = [
  /external state/i,
  /third-party/i,
  /prod(uction)? traffic/i,
  /\bapproval\b/i,
  /product( or design)? decision/i,
  /design decision/i,
  /not[ -]yet[ -]built/i,
  /future (spec|plan|record)/i,
  /depends on #\d+/i,
  /scope expansion/i,
  /expands? (pipeline )?scope/i,
  /breaks? (more than )?\d+ unrelated tests/i,
  /long rebuild/i,
];

function clearsFloor(blockerReason) {
  if (typeof blockerReason !== 'string' || blockerReason.trim() === '') return false;
  return CATEGORY_PATTERNS.some((re) => re.test(blockerReason));
}

module.exports = { clearsFloor };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/unattended-tier.test.js`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all existing tests still pass, plus the 8 new ones (1015 → 1023 total)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/unattended-tier.js bin/lib/issues/tests/unattended-tier.test.js
git commit -m "Add unattended-tier floor-check predicate

Pure clearsFloor(blockerReason) matching the four blocker categories
ledger/resolve-gate.md's Phase 1 already requires as legitimate --
the deterministic check the unattended-tier lever uses to decide
whether a ledger item is safe to auto-route without asking.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 2: Canonical shared reference (`skills/_shared/unattended-tier.md`)

**Files:**
- Create: `skills/_shared/unattended-tier.md`

**Interfaces:**
- Consumes: `clearsFloor` from `bin/lib/issues/unattended-tier.js` (Task 1) — referenced by name,
  not re-described
- Produces: the canonical prose every later task points to instead of restating (precedence,
  floor rule, restricted-disposition rule, logging shape, notification shape, error handling)

- [ ] **Step 1: Write the file**

Create `skills/_shared/unattended-tier.md`:

```markdown
# Unattended Tier

Single source of truth for the `unattended-tier` policy lever (`off` default | `on`). Referenced,
not restated, by every consumer: `flow/manifesto.md` (Manifesto lever #9), `flow/SKILL.md` Step 3,
`ledger/resolve-gate.md` Phase 2 + Phase 3, `wrap-up/review-console.md` Step 8.6,
`wrap-up/SKILL.md` Step 8.5, `wrap-up/leftover-routing.md`.

## What it authorizes

Exactly three behaviors, all opt-in, all logged, all reversible:

1. **Ledger Phase 2 narrowing** (`ledger/resolve-gate.md`) — skip the per-item drill for an item
   whose Phase 1 blocker reason clears the floor (below), auto-selecting `Route to a record ->
   Keep (backlog)` only. Never `Fix anyway`, `Accept`, `Drop`, or `Defer -> parked` from this
   drill specifically.
2. **Queue-write auto-file** (`wrap-up/review-console.md`) — create a proposed record (from the
   above, from leftover routing, or from `/reflect`'s tangential-idea routing) directly, instead
   of waiting for a live per-item approval at the Review Console.
3. **Ops-item auto-acknowledge** (`wrap-up/SKILL.md` Step 8.5) — auto-select "Acknowledge all"
   for the ops-acknowledgment block.

It never touches `Fix anyway`/`Accept`/`Drop` dispositions, HARD-GATEs, `BLOCKED`/`STOP`
conditions, or merge-conflict resolution — those stay fully human-gated regardless of this
lever's state.

## Precedence

Same resolution order as every other lever in `_shared/auto-mode-contract.md`:

1. Explicit CLI arg
2. `config.yml` (this run's Manifesto answer)
3. CLAUDE.md / `.claude-tweaks/policy.yml` project default
4. Skill default: `off`

## Floor rule

An item is eligible for auto-routing only when its blocker reason matches one of the four
categories `ledger/resolve-gate.md`'s Phase 1 already requires as legitimate:

| Category | Example blocker-reason text |
|---|---|
| External state | "Requires external state (third-party API data)" |
| User product/design decision | "Needs a product decision on the rate-limit value" |
| Not-yet-built dependency | "Depends on functionality not yet built in this pipeline" |
| Scope expansion | "Would expand scope — breaks 14 unrelated tests" |

Implemented by `bin/lib/issues/unattended-tier.js`'s `clearsFloor(blockerReason)`. Anything else —
including an ambiguous or unrecognized reason — fails closed: ask, exactly as if the lever were
off for that one item.

## Restricted-disposition rule

The lever only ever authorizes routing to a new **backlog** record (no `parked` stage, no
trigger to invent) from the ledger drill. Leftover routing is different: it follows whatever
disposition (`backlog` or `parked`) its own existing `leftover-default` auto-mode policy already
decided — this lever only changes whether *creating* that record needs a click, never which
disposition auto-mode policy already picked.

## Logging

One `decisions.md` entry per auto-resolved item, in the same shape every other auto-decision
uses:

```
AUTO {time} -- {what}. Reason: {policy-source}. Reversibility: high.
```

Examples:

```
AUTO 15:04:22 -- Ledger Phase 2: item #3 auto-routed to backlog (blocker: product decision). Reversibility: high.
AUTO 15:06:03 -- Queue write: created record "Add OAuth refresh edge case" (parked, trigger: /auth provider docs land). Reversibility: high.
AUTO 15:06:04 -- Ops acknowledgment: 2 items auto-acknowledged. Reversibility: high.
```

## Notification

One consolidated `PushNotification` per run, sent at the same point the existing auto-merge fast
lane sends its FYI (see `wrap-up/review-console.md`'s auto-merge short-circuit) — not one
notification per item. Summarize every action this lever resolved in the run.

## Error handling

Every failure path fails toward asking, not toward silence:

- Record creation fails (`gh issue create` / `local-store.js` error) — leave the proposal
  staged, log the failure, let it render as a normal Queue write at the console.
- `PushNotification` fails or isn't configured — non-blocking; `decisions.md` and the Wrap-Up
  summary remain the durable record.
- Floor check is ambiguous — fails closed, ask exactly as if the lever were off.
```

- [ ] **Step 2: Verify the file's key terms are present**

Run: `grep -c "clearsFloor\|Restricted-disposition\|AUTO {time}\|PushNotification" skills/_shared/unattended-tier.md`
Expected: `4` (or more) — each term appears at least once

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/unattended-tier.md
git commit -m "Add unattended-tier canonical shared reference

Single source of truth for the new lever's precedence, floor rule,
restricted-disposition rule, logging shape, notification shape, and
error handling -- every consuming skill file references this instead
of restating it.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 3: Wire the lever into `_shared/auto-mode-contract.md`

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md`

**Interfaces:**
- Consumes: `skills/_shared/unattended-tier.md` (Task 2) — referenced by path, not restated
- Produces: n/a (prose-only change; downstream tasks reference this file's existing table
  structure, which is unchanged in shape)

- [ ] **Step 1: Add the lever to the Bookend Architecture's lever list**

Find this exact line (in the "Bookend Architecture" section, the "Begin stop" bullet):

```
- **Begin stop** — the Pipeline Config Manifesto computes all policy levers (scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) and saves them to `config.yml` inside the run directory at `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`.
```

Replace with:

```
- **Begin stop** — the Pipeline Config Manifesto computes all policy levers (scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness, unattended-tier) and saves them to `config.yml` inside the run directory at `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`.
```

- [ ] **Step 2: Add the caveat to the "What auto does NOT silence" table's ledger row**

Find this exact row (in the "What `auto` does NOT silence" table):

```
| Ledger resolve gate Phase 2 (every open item, per-item) | Items represent unfinished work — silently dropping them is the bug `auto` is *not* allowed to introduce |
```

Replace with:

```
| Ledger resolve gate Phase 2 (every open item, per-item) | Items represent unfinished work — silently dropping them is the bug `auto` is *not* allowed to introduce, unless `unattended-tier` is on — see `_shared/unattended-tier.md` for the narrow, backlog-only carve-out |
```

- [ ] **Step 3: Add the caveat to the work-record-creation row**

Find this exact row:

```
| Work-record creation (new backlog records) | Each record filed on the user's tracker needs explicit user approval — the record queue is the user's, not the model's. Scheduled health-skill filing is exempt — born-ready records are those skills' documented output (see `_shared/work-record.md`, born-ready rule). |
```

Replace with:

```
| Work-record creation (new backlog records) | Each record filed on the user's tracker needs explicit user approval — the record queue is the user's, not the model's. Scheduled health-skill filing is exempt — born-ready records are those skills' documented output (see `_shared/work-record.md`, born-ready rule). Queue-write proposals are also exempt when `unattended-tier` is on — see `_shared/unattended-tier.md`. |
```

- [ ] **Step 4: Add the caveat to the Anti-Patterns table**

Find this exact row (in the "Anti-Patterns" table at the end of the file):

```
| Filing work records autonomously because a finding "obviously belongs there" | Each record needs user approval. "Obvious" is the model's judgment, not the user's. |
```

Replace with:

```
| Filing work records autonomously because a finding "obviously belongs there" | Each record needs user approval. "Obvious" is the model's judgment, not the user's. This still holds by default — `unattended-tier` (see `_shared/unattended-tier.md`) is a separate, explicit, project-level opt-in with its own floor and audit trail, not a model deciding something is "obvious" on its own. |
```

- [ ] **Step 5: Verify all four edits landed**

Run: `grep -c "unattended-tier" skills/_shared/auto-mode-contract.md`
Expected: `4`

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/auto-mode-contract.md
git commit -m "Reference unattended-tier from the auto-mode contract

Add the new lever to the Manifesto's computed-levers list and add
the narrow opt-in caveat everywhere this file currently asserts
'auto never silences' the ledger gate or work-record creation, so
the two documents don't contradict each other.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 4: Wire the lever into the Manifesto (`flow/SKILL.md` + `flow/manifesto.md`)

**Files:**
- Modify: `skills/flow/SKILL.md`
- Modify: `skills/flow/manifesto.md`

**Interfaces:**
- Consumes: `skills/_shared/unattended-tier.md` (Task 2)
- Produces: `config.yml`'s `unattended-tier: off|on` key, read by Tasks 5-8

- [ ] **Step 1: Add the lever to `flow/SKILL.md` Step 3's lever list**

Find this exact sentence (in "### Step 3: Pipeline Config Manifesto"):

```
In every mode except `interactive`, it computes the levers (scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) from the precedence chain and writes `config.yml` + initializes `decisions.md` in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`.
```

Replace with:

```
In every mode except `interactive`, it computes the levers (scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness, unattended-tier) from the precedence chain and writes `config.yml` + initializes `decisions.md` in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`.
```

- [ ] **Step 2: Add a suppression rule to `flow/manifesto.md`'s "Determine lever suppressions" table**

Find this exact table (in "## Determine lever suppressions"):

```
| Lever | Suppressed when |
|---|---|
| **Overlap** (3) | `/specify` not in the pipeline (always suppressed for `/flow` — specs already exist) |
| **Design intent** (4) | All records have `design-intent:` locked in their materialized header (or body metadata / legacy spec header), OR all records are non-frontend (polish auto-skips regardless) |
| **Tidy aggressiveness** (8) | Effectively always suppressed by `/flow` — `/tidy` is not in the default step list. This lever is consulted only when a `/flow` caller explicitly adds `/tidy` to the step list (rare). Kept in the canonical 8-lever count for stable numbering across all skills that reference these levers. |
| **Auto-fix threshold** (6) | `/test` not in the step list |
| **Review severity floor** (7) | `/review` not in the step list |
| **Leftover routing** (5) | `/wrap-up` not in the step list |
```

Replace with:

```
| Lever | Suppressed when |
|---|---|
| **Overlap** (3) | `/specify` not in the pipeline (always suppressed for `/flow` — specs already exist) |
| **Design intent** (4) | All records have `design-intent:` locked in their materialized header (or body metadata / legacy spec header), OR all records are non-frontend (polish auto-skips regardless) |
| **Tidy aggressiveness** (8) | Effectively always suppressed by `/flow` — `/tidy` is not in the default step list. This lever is consulted only when a `/flow` caller explicitly adds `/tidy` to the step list (rare). Kept in the canonical 8-lever count for stable numbering across all skills that reference these levers. |
| **Auto-fix threshold** (6) | `/test` not in the step list |
| **Review severity floor** (7) | `/review` not in the step list |
| **Leftover routing** (5) | `/wrap-up` not in the step list |
| **Unattended tier** (9) | `/wrap-up` not in the step list — none of its three behaviors (ledger routing, queue-write filing, ops-ack) run outside wrap-up |
```

- [ ] **Step 3: Extend the canonical lever numbering line**

Find this exact sentence:

```
**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review severity floor, 8=Tidy aggressiveness. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.
```

Replace with:

```
**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review severity floor, 8=Tidy aggressiveness, 9=Unattended tier. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.
```

- [ ] **Step 4: Add a row to the illustrative Policy levers example table**

Find this exact table:

```
| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review severity floor | **low** | none / **low** / medium | LOW findings auto-applied; MED staged; HIGH still prompts |
```

Replace with:

```
| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review severity floor | **low** | none / **low** / medium | LOW findings auto-applied; MED staged; HIGH still prompts |
| 9 | Unattended tier | **off** | **off** / on | Floor-clearing ledger residue, queue writes, and ops-ack resolve without a click; off leaves today's behavior unchanged |
```

- [ ] **Step 5: Update the Suppressed/Valid-overrides footer line to include 9**

Find this exact sentence:

```
**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7.
```

Replace with:

```
**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7, 9.
```

- [ ] **Step 6: Add a row to the "Override semantics" table**

Find this exact table:

```
| Lever | Option | What changes |
|---|---|---|
| Mode | `hybrid` | Same as auto but skills still prompt when reversibility/confidence/severity floors fail |
| Mode | `interactive` | Skips the Manifesto pipeline-wide; every skill presents decisions in-flow as today |
| Scope-creep | `stop-and-ask` | Pipeline pauses inline when files outside plan are referenced |
| Scope-creep | `drop` | Files outside plan are noted in `decisions.md` but not added |
| Leftover routing | `backlog` | Unfinished sections route to a new work record with no stage label, instead of `parked` |
| Leftover routing | `drop` | Unfinished sections are noted in `decisions.md` but no work record staged |
| Auto-fix threshold | `lint-only` | Type errors surface as prompts; tests always surface |
| Auto-fix threshold | `lint+type+test` | Mechanical test failures also auto-fixed (rare; risky — semantic changes hidden) |
| Review severity floor | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review severity floor | `medium` | LOW + MED auto-applied; only HIGH prompts |
```

Replace with:

```
| Lever | Option | What changes |
|---|---|---|
| Mode | `hybrid` | Same as auto but skills still prompt when reversibility/confidence/severity floors fail |
| Mode | `interactive` | Skips the Manifesto pipeline-wide; every skill presents decisions in-flow as today |
| Scope-creep | `stop-and-ask` | Pipeline pauses inline when files outside plan are referenced |
| Scope-creep | `drop` | Files outside plan are noted in `decisions.md` but not added |
| Leftover routing | `backlog` | Unfinished sections route to a new work record with no stage label, instead of `parked` |
| Leftover routing | `drop` | Unfinished sections are noted in `decisions.md` but no work record staged |
| Auto-fix threshold | `lint-only` | Type errors surface as prompts; tests always surface |
| Auto-fix threshold | `lint+type+test` | Mechanical test failures also auto-fixed (rare; risky — semantic changes hidden) |
| Review severity floor | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review severity floor | `medium` | LOW + MED auto-applied; only HIGH prompts |
| Unattended tier | `on` | Floor-clearing ledger residue, queue writes, and ops-ack resolve without a click; still fully logged and reversible — see `_shared/unattended-tier.md` |
```

- [ ] **Step 7: Add a row to the "Recommendation defaults" table**

Find this exact table (in "## Recommendation defaults (when no arg and no policy)"):

```
| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review severity floor | `low` | Auto LOW (nits), stage MED, prompt HIGH |
| Tidy aggressiveness | `conservative` | Keep + unambiguous Delete only |
```

Replace with:

```
| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review severity floor | `low` | Auto LOW (nits), stage MED, prompt HIGH |
| Tidy aggressiveness | `conservative` | Keep + unambiguous Delete only |
| Unattended tier | `off` | Conservative default; each project/run opts in explicitly |
```

- [ ] **Step 8: Add the key to the `config.yml` example**

Find this exact code block:

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-severity-floor: low
tidy-aggressiveness: conservative
spec: 42
created: 2026-05-15T143207
```

Replace with:

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-severity-floor: low
tidy-aggressiveness: conservative
unattended-tier: off
spec: 42
created: 2026-05-15T143207
```

- [ ] **Step 9: Verify all edits landed**

Run: `grep -c "unattended-tier\|Unattended tier" skills/flow/SKILL.md skills/flow/manifesto.md`
Expected: `skills/flow/SKILL.md:1` and `skills/flow/manifesto.md:6` (suppression row, numbering line, example-table row, override-semantics row, recommendation-defaults row, config.yml line — the footer-line edit in Step 5 doesn't add literal "unattended-tier"/"Unattended tier" text, only the numeral `9`, so it doesn't add to this count)

- [ ] **Step 10: Commit**

```bash
git add skills/flow/SKILL.md skills/flow/manifesto.md
git commit -m "Add unattended-tier as Manifesto lever #9

Thread the new lever through every table the Pipeline Config
Manifesto already maintains: suppression rules, canonical numbering,
the illustrative policy-levers example, override semantics,
recommendation defaults, and the config.yml schema.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 5: Ledger Phase 2 narrowing + Phase 3 standalone fallback (`ledger/resolve-gate.md`)

**Files:**
- Modify: `skills/ledger/resolve-gate.md`

**Interfaces:**
- Consumes: `clearsFloor` from `bin/lib/issues/unattended-tier.js` (Task 1); precedence/logging
  contract from `skills/_shared/unattended-tier.md` (Task 2)
- Produces: `decisions.md` `AUTO` entries for narrowed items, consumed by `wrap-up/review-console.md`
  (Task 6)

- [ ] **Step 1: Add the caveat to the top-of-file "auto does NOT silence" line**

Find this exact sentence:

```
**`auto` mode does NOT silence this gate.** Per-item user input on the resolve gate is mandatory regardless of mode. For the full list of what `auto` silences (and what it does not), see `_shared/auto-mode-contract.md`.
```

Replace with:

```
**`auto` mode does NOT silence this gate.** Per-item user input on the resolve gate is mandatory regardless of mode. For the full list of what `auto` silences (and what it does not), see `_shared/auto-mode-contract.md`. The one narrow exception is the `unattended-tier` lever (off by default) — see `_shared/unattended-tier.md` and the narrowing step at the top of Phase 2 below.
```

- [ ] **Step 2: Insert the narrowing step at the top of Phase 2**

Find this exact heading and paragraph:

```
## Phase 2 — Present remainder (per-item user input required)

After Phase 1, only items the agent could not fix remain `open`. Present the full table once, upfront — it is not re-rendered per item as the drill below proceeds:
```

Replace with:

```
## Phase 2 — Present remainder (per-item user input required)

### Unattended-tier narrowing (runs first, before the table below)

If `unattended-tier: on` (see `_shared/unattended-tier.md`), before building the table below,
check each remaining `open` item's Phase 1 blocker reason against
`bin/lib/issues/unattended-tier.js`'s `clearsFloor(blockerReason)`. For every item where it
returns `true`: auto-select `Route to a record -> Keep (backlog)` — the only disposition this
lever ever authorizes from this drill; never `Fix anyway`, `Accept`, `Drop`, or `Defer ->
parked` — compose the staged-proposal body exactly as Phase 3's `Keep` branch below already does,
update ledger status to `deferred` (note `-> backlog`), and log:

```
AUTO {time} -- Ledger Phase 2: item #{N} auto-routed to backlog (blocker: {category}). Reversibility: high.
```

Remove the item from this phase's remaining set — it does not appear in the table below and does
not get an `AskUserQuestion` drill. Items whose blocker reason returns `false` (ambiguous, or
outside the four categories) fall through to the unchanged per-item drill below — the floor check
fails closed, exactly as if the lever were off for that one item.

After Phase 1 (and, when the lever is on, after the narrowing above), only items that still
qualify for neither remain `open`. Present the full table once, upfront — it is not re-rendered
per item as the drill below proceeds:
```

- [ ] **Step 3: Add the standalone-fallback check to Phase 3**

Find this exact bullet (in "## Phase 3 — Apply user decisions"):

```
- **No pipeline run directory resolves** (truly standalone `/claude-tweaks:ledger resolve`, outside any `/flow` or `/wrap-up` run — see `_shared/pipeline-run-dir.md`): no Review Console will ever read a staged file, so create the record directly instead, using the same dual-driver contract the console would have used
```

Replace with:

```
- **No pipeline run directory resolves** (truly standalone `/claude-tweaks:ledger resolve`, outside any `/flow` or `/wrap-up` run — see `_shared/pipeline-run-dir.md`): no Review Console will ever read a staged file, so create the record directly instead, using the same dual-driver contract the console would have used. When `unattended-tier: on`, apply Phase 2's narrowing check inline here too (there is no Step 8.6 to centralize the auto-file decision through in this standalone path).
```

- [ ] **Step 4: Verify all three edits landed**

Run: `grep -c "unattended-tier" skills/ledger/resolve-gate.md`
Expected: `4` (top-of-file line, narrowing heading, narrowing body reference, Phase 3 fallback)

- [ ] **Step 5: Commit**

```bash
git add skills/ledger/resolve-gate.md
git commit -m "Add unattended-tier narrowing to the ledger resolve gate

Phase 2 auto-routes a floor-clearing item straight to backlog when
the lever is on, skipping its AskUserQuestion drill entirely. Every
other disposition (Fix anyway/Accept/Drop/Defer->parked) is
unaffected. Phase 3's standalone no-run-directory fallback gets the
same check inline, since there's no Review Console to centralize
through there.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 6: Queue-write auto-file at the Review Console (`wrap-up/review-console.md`)

**Files:**
- Modify: `skills/wrap-up/review-console.md`

**Interfaces:**
- Consumes: `decisions.md` `AUTO`/`STAGED` entries (existing input, unchanged shape);
  `_shared/unattended-tier.md` (Task 2)
- Produces: n/a (this is the terminal creation point; nothing downstream consumes new output from
  here beyond the existing GitHub issue / local record it already created)

- [ ] **Step 1: Insert the auto-file section**

Find this exact heading boundary (the end of "## Numbering rules" and the start of "## Present the
console"):

```
- This applies to both the example below and any real Console output. Do not restart numbering within a section.

## Present the console
```

Replace with:

```
- This applies to both the example below and any real Console output. Do not restart numbering within a section.

## Unattended-tier auto-file (runs before rendering)

If `unattended-tier: on` (see `_shared/unattended-tier.md`), before building any of the tables
below: for every queue-write proposal already staged (from ledger Phase 2's narrowing, leftover
routing Step 4, or `/reflect`'s tangential-idea routing Step 3 — all three run earlier in
`/wrap-up`'s own step order, before Step 8.6) create the record directly via the same `gh issue
create` / `local-store.js` path "On approval" step 5 below already uses, log it as `AUTO` instead
of `STAGED`, and list it under **Auto-applied** instead of **Queue writes**. On a fully-on run
with no ambiguous residue, the Queue writes section below therefore renders empty.

Do not sweep up reflect's non-queue-write staged findings (convention drift, pattern
observations, skill-update proposals) here — identify a queue write the same way this console
already distinguishes one: a `decisions.md` `STAGED` entry phrased as a record proposal ("--
backlog candidate" / a `leftover-` or `ledger-record-` staged file), not a bare stage path.

If record creation fails for one proposal, leave that one staged and let it render normally in
Queue writes below — do not drop it.

## Present the console
```

- [ ] **Step 2: Add the caveat to the Queue writes section intro**

Find this exact sentence (in the "#### Queue writes — REQUIRES PER-ITEM APPROVAL" section):

```
Render this section only when leftover routing or another step (e.g. `/reflect`'s
tangential-idea routing) has proposed a new work record. Each row gets its own prompt — bulk
approval is forbidden per `_shared/auto-mode-contract.md`'s work-record-creation row.
```

Replace with:

```
Render this section only when leftover routing or another step (e.g. `/reflect`'s
tangential-idea routing) has proposed a new work record **and it wasn't already auto-filed by the
Unattended-tier auto-file step above**. Each remaining row gets its own prompt — bulk
approval is forbidden per `_shared/auto-mode-contract.md`'s work-record-creation row.
```

- [ ] **Step 3: Verify all edits landed**

Run: `grep -c "unattended-tier\|Unattended-tier" skills/wrap-up/review-console.md`
Expected: `3` (new section heading + 2 body references + intro caveat = check actual count is ≥3)

- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/review-console.md
git commit -m "Auto-file queue writes at the Review Console when unattended-tier is on

Centralizes the one creation path every queue-write producer (ledger
Phase 2, leftover routing, reflect's tangential-idea routing) funnels
through -- avoids duplicating the auto-file check in three separate
producer steps. Explicitly scoped to exclude reflect's non-queue-write
staged findings, which share the same file-naming convention.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 7: Ops-item auto-acknowledge (`wrap-up/SKILL.md` Step 8.5)

**Files:**
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: `_shared/unattended-tier.md` (Task 2)
- Produces: n/a

- [ ] **Step 1: Add the auto-acknowledge branch**

Find this exact paragraph (in "### Ops acknowledgment (when ops items exist)"):

```
Call `AskUserQuestion` with `question`: `"How do you want to handle these ops items?"`, `header`: `"Ops items"`, `multiSelect`: `false` — neither option's label is marked as the default:
```

Replace with:

```
**Unattended-tier auto-acknowledge:** if `unattended-tier: on` (see `_shared/unattended-tier.md`),
skip the `AskUserQuestion` below entirely — update status to `acknowledged` for every item, log
`AUTO {time} -- Ops acknowledgment: {N} items auto-acknowledged. Reversibility: high.` to
`decisions.md`, and continue to Step 8.6. Otherwise, present the block below.

Call `AskUserQuestion` with `question`: `"How do you want to handle these ops items?"`, `header`: `"Ops items"`, `multiSelect`: `false` — neither option's label is marked as the default:
```

- [ ] **Step 2: Verify the edit landed**

Run: `grep -c "unattended-tier" skills/wrap-up/SKILL.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/SKILL.md
git commit -m "Auto-acknowledge ops items when unattended-tier is on

Ops items are read-only post-merge FYIs; when the lever is on, skip
the AskUserQuestion and auto-select 'Acknowledge all', logging the
decision exactly like every other unattended-tier action.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 8: Leftover-routing caveat (`wrap-up/leftover-routing.md`)

**Files:**
- Modify: `skills/wrap-up/leftover-routing.md`

**Interfaces:**
- Consumes: `_shared/unattended-tier.md` (Task 2); the centralized auto-file path from
  `wrap-up/review-console.md` (Task 6)
- Produces: n/a

- [ ] **Step 1: Add the caveat**

Find this exact sentence (Auto mode section, step 5):

```
5. Do NOT create the record autonomously. The Wrap-Up Review Console (Step 8.6) presents each staged leftover in its Queue writes section for mandatory per-item approval — never bulk, per `_shared/auto-mode-contract.md`'s work-record-creation row. On approval, the console creates it: `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading the `Title:`/`Type:`/`Labels:` header and the body back out of the staged file. See `review-console.md`'s Queue writes section in this skill's directory.
```

Replace with:

```
5. Do NOT create the record autonomously. The Wrap-Up Review Console (Step 8.6) presents each staged leftover in its Queue writes section for mandatory per-item approval — never bulk, per `_shared/auto-mode-contract.md`'s work-record-creation row — unless `unattended-tier: on`, in which case the console's auto-file step (see `review-console.md`) creates it directly before rendering, per `_shared/unattended-tier.md`. Either way, the disposition (`backlog` vs. `parked`) chosen by `leftover-default` above is unchanged; this only affects whether creating the record needs a click. On approval (or auto-file), the record is created via: `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading the `Title:`/`Type:`/`Labels:` header and the body back out of the staged file. See `review-console.md`'s Queue writes section in this skill's directory.
```

- [ ] **Step 2: Verify the edit landed**

Run: `grep -c "unattended-tier" skills/wrap-up/leftover-routing.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/leftover-routing.md
git commit -m "Note unattended-tier's effect on leftover-routing record creation

Leftover routing's own disposition logic (leftover-default) is
unchanged; the caveat only clarifies that creation timing is now
governed centrally at the Review Console's auto-file step.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 9: Root `CLAUDE.md` caveat

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `_shared/unattended-tier.md` (Task 2)
- Produces: n/a

- [ ] **Step 1: Add the caveat to the auto-mode-contract summary line**

Find this exact sentence (in the "Auto-Mode Contract + Bookend Architecture" section):

```
**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog or parked records, `/challenge` lenses, governance gates).
```

Replace with:

```
**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog or parked records, `/challenge` lenses, governance gates) — except the narrow, explicit `unattended-tier` opt-in (see `_shared/unattended-tier.md`), which lets floor-clearing ledger residue, queue writes, and ops-ack resolve without a click.
```

- [ ] **Step 2: Verify the edit landed**

Run: `grep -c "unattended-tier" CLAUDE.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Note the unattended-tier opt-in in CLAUDE.md's auto-mode summary

Keeps this summary line from contradicting the auto-mode-contract's
own updated 'does NOT silence' table.

See docs/superpowers/specs/2026-07-16-unattended-tier-design.md."
```

---

### Task 10: Manual verification pass

**Files:** none (verification only — no code or doc changes)

**Interfaces:**
- Consumes: everything from Tasks 1-9
- Produces: a pass/fail record for this plan's four scenarios (report results; no file changes
  unless a scenario fails, in which case stop and fix the responsible task before continuing)

- [ ] **Step 1: Confirm the full test suite still passes**

Run: `npm test`
Expected: PASS, 0 failures (includes the 8 new tests from Task 1)

- [ ] **Step 2: Confirm the cross-reference sweep is complete**

Run: `grep -rc "unattended-tier" skills/_shared/auto-mode-contract.md skills/ledger/resolve-gate.md skills/wrap-up/leftover-routing.md skills/wrap-up/review-console.md CLAUDE.md`
Expected: every listed file shows a count ≥ 1 (zero would mean a task's edit didn't land)

- [ ] **Step 3: Walk through the design doc's four verification scenarios manually**

Using a scratch pipeline run directory (or a real local `/claude-tweaks:flow` invocation on a
throwaway record, per the user's preference at execution time):

1. **Lever `off`** — confirm zero behavior change: a ledger item with an unfixable blocker still
   presents the full `AskUserQuestion` drill; ops items still ask; queue writes still wait for a
   click.
2. **Lever `on`, one floor-clearing ledger item** — confirm it lands in the Review Console's
   Auto-applied section with a real record link, not in Queue writes, and that `decisions.md`
   shows the `AUTO` entry from Task 5.
3. **Lever `on`, one item with an ambiguous blocker reason** ("Not sure if this is even still
   relevant") — confirm it still falls through to the per-item drill.
4. **Simulate a failed record-creation call** (e.g., temporarily point `gh` at an invalid repo, or
   stub the call) — confirm the proposal falls back to a staged Queue write rather than vanishing.

Record the outcome of each scenario. If any fails, identify which task (1-9) is responsible, fix
it, and re-run this task's Step 1 and the specific failing scenario before considering the plan
complete.

- [ ] **Step 4: Final commit (only if Step 3 required fixes)**

If Step 3 was clean, no commit is needed here — Task 9's commit is the last one. If a fix was
required, commit it separately with a message identifying which scenario caught the bug.
