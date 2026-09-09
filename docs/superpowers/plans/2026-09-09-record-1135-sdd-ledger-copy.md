# Copy Surviving SDD Deferred-Minor Ledger Lines Into the Run Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before `/superpowers:subagent-driven-development`'s own Finish step deletes a plan's SDD workspace (`rm -rf <workspace>`), the composed dispatch instruction directs it to copy any surviving `minor (deferred)` / `parked` lines from `<workspace>/progress.md` into claude-tweaks' own run ledger, so those findings are no longer structurally lost at that seam.

**Architecture:** `plugin/skills/build/dispatch.md` already composes one long invocation instruction that `/claude-tweaks:build`'s Common Step 2 hands to `/superpowers:subagent-driven-development` (profile override, AC-forwarding, no-stash rule, whole-branch review model, etc. — one bolded directive sentence per concern, all folded into the same instruction). Add one more bolded directive sentence to that same instruction, naming the source lines and the destination ledger's column shape. A conformance test pins its presence, following the existing `tests/dispatch-no-stash-conformance.test.js` pattern for the same file.

**Tech Stack:** Markdown skill-prose editing; `node --test` for the conformance check.

**Spec:** `.claude-tweaks/pipelines/2026-09-09T122033-record-1135/work/1135-spec.md`

## Global Constraints

- Ceremony profile is `fast-lane` (single-file, self-contained prose change) — this plan is a single task; Common Step 1.5 (Plan Audit) and Common Step 4.5 (Architecture Alignment) both skip per `_shared/ceremony-profile.md`'s roster.
- `plugin/skills/build/dispatch.md` is governed skill prose (`plugin/skills/**/*.md`) — stay well clear of the 40 KB ceiling (currently ~9.8 KB; the new sentence adds well under 1 KB).
- Cite `_shared/ledger-format.md`'s Phase Taxonomy / Add Item shape rather than restating it, matching every other directive already in this file (e.g. the no-stash directive cites `_shared/subagent-output-contract.md` instead of re-deriving its mechanism).

---

### Task 1: Add the ledger-copy directive to dispatch.md, and pin it with a conformance test

**Files:**
- Modify: `plugin/skills/build/dispatch.md` (the single long **subagent** paragraph, line 14)
- Create: `tests/sdd-ledger-copy-conformance.test.js`

**Interfaces:**
- Consumes: nothing new — the directive is inserted into the existing composed invocation-instruction paragraph, between the existing "Forbid `git stash`…" sentence and the "`profile=<fast|standard|capable|frontier>` token:" sentence.
- Produces: no new function or module — this task's only observable output is the added prose sentence in `dispatch.md`, verified by the new test file.

- [ ] **Step 1: Write the failing test**

Create `tests/sdd-ledger-copy-conformance.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #1135: /superpowers:subagent-driven-development's own Finish step deletes the plan's SDD
// workspace (`.superpowers/sdd/{plan}/`), including `progress.md`, where SDD convention
// ledgers deferred-minor / parked review findings. claude-tweaks' /wrap-up reads only the run
// ledger (docs/plans/*-ledger.md), so any observation ledgered solely in the SDD workspace was
// structurally lost at that seam (run 2026-08-20T154419-spec-1076). This file pins the
// directive in build/dispatch.md's composed SDD invocation instruction that closes the gap —
// mirrors tests/dispatch-no-stash-conformance.test.js's own guard for the same file.

const ROOT = path.join(__dirname, '..');
const BUILD_DISPATCH = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'build', 'dispatch.md'), 'utf8');

test('build/dispatch.md: instructs subagent-driven-development to copy surviving SDD ledger lines into the run ledger before Finish deletes the workspace', () => {
  assert.match(
    BUILD_DISPATCH,
    /before it deletes `<workspace>`/,
    'build/dispatch.md must direct /superpowers:subagent-driven-development to act before its ' +
      'Finish step deletes the SDD workspace (#1135) — otherwise the copy happens too late, ' +
      'after the source lines are already gone.',
  );
  assert.match(
    BUILD_DISPATCH,
    /`minor \(deferred\)`.*`parked`/,
    'build/dispatch.md must name both progress.md line shapes SDD actually writes ' +
      '(`minor (deferred)` and `parked`) as the source of the copied lines.',
  );
  assert.match(
    BUILD_DISPATCH,
    /`build\/\*`/,
    'build/dispatch.md must name the destination ledger phase (`build/*`) the copied lines land under.',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sdd-ledger-copy-conformance.test.js`
Expected: FAIL — `build/dispatch.md` does not yet contain the directive, so all three `assert.match` calls fail.

- [ ] **Step 3: Add the directive to dispatch.md**

In `plugin/skills/build/dispatch.md`, inside the single **subagent** paragraph (line 14), insert the following sentence immediately after the existing sentence that ends `"...or set its own work aside with a temporary WIP commit instead."` and immediately before the existing sentence that begins `"**`profile=<fast|standard|capable|frontier>` token:**"`:

```
**Copy surviving SDD ledger lines into the run ledger before Finish deletes the workspace (#1135):** in the same invocation instruction, also direct `/superpowers:subagent-driven-development` that its own `## Finish` step — before it deletes `<workspace>` (`rm -rf <workspace>`) — must first copy every surviving `<workspace>/progress.md` line matching `Task <N>: minor (deferred): ...` or `Task <N>: parked — ...` into this run's own open items ledger via `/claude-tweaks:ledger`'s Add Item operation (`_shared/ledger-format.md`'s Phase Taxonomy and Add Item shape): `Phase` = `build/*`, `Item` = the line's own finding text, `Status` = `deferred` for a `minor (deferred)` line or `observation` for a `parked` line, `Resolution` = the line's own `Ruling:` text when present — claude-tweaks' `/claude-tweaks:wrap-up` reads only the run ledger (`docs/plans/*-ledger.md`), never `<workspace>/progress.md`, so a finding ledgered solely in the SDD workspace is otherwise lost the instant this step deletes it.
```

The paragraph is one long line in the source file — insert the new sentence in the same single-line, no-newline style as its neighbors (do not introduce a line break the rest of the paragraph doesn't have).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sdd-ledger-copy-conformance.test.js`
Expected: PASS

- [ ] **Step 5: Run the full suite once to confirm nothing else regressed**

Run: `npm test`
Expected: PASS (pre-existing failure count, if any, must not increase — see CLAUDE.md's flake-tolerance note for how to interpret a run-to-run-varying count)

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/build/dispatch.md tests/sdd-ledger-copy-conformance.test.js
git commit -m "build: copy surviving SDD deferred-minor ledger lines into the run ledger before workspace deletion

refs #1135"
```
