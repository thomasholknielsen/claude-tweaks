# Staged Inventory Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and surface a `decisions.md` `STAGED` entry whose named `staged/{name}` file was never written (a crash between `log-decision.js`'s write and `stage-item.js`'s write), instead of letting it silently pass through resume or Review Console read.

**Architecture:** A new pure function `checkStagedInventory(runDir)` in `plugin/bin/lib/hooks/staged-inventory.js` parses every `Stage path: staged/{name}.` occurrence in `decisions.md` and checks each named path against disk. A new CLI verb `check-staged-inventory --run <dir>` in `plugin/bin/hooks.js` wraps it with a one-line stdout report, mirroring the existing `check-resume-freshness` verb's shape but kept fully separate (own function, own CLI verb, own output line) so `checkResumeFreshness`'s pinned return shape and `check-resume-freshness`'s documented "exactly one line" contract are untouched. Skill prose wires the new command in as a non-blocking companion check at the three `check-resume-freshness` call sites plus the Review Console's "Read inputs" step.

**Tech Stack:** Node.js (no external deps), `node --test` for tests — this repo's existing conventions (see `plugin/bin/lib/hooks/resume-freshness.js` and `tests/hooks-resume-freshness.test.js` for the pattern being mirrored).

**Spec:** `.claude-tweaks/pipelines/2026-08-23T201517-record-1269/work/1269-spec.md` (GitHub record #1269)

## Global Constraints

- Do not modify `checkResumeFreshness`'s return shape (`plugin/bin/lib/hooks/resume-freshness.js`) or the existing `check-resume-freshness` CLI output line — both are pinned by existing tests (`tests/hooks-resume-freshness.test.js`'s `assert.deepStrictEqual` calls) and a documented contract (`plugin/skills/_shared/run-resume-freshness.md`'s "The command writes exactly one line to stdout, and always exits `0`").
- New CLI verb `check-staged-inventory` always exits `0` and writes exactly one line to stdout, mirroring `check-resume-freshness`'s own contract.
- Surgical changes only: no restructuring of `hooks.js`'s existing flat if/else dispatch chain (confirmed: no central command-list/help enumeration exists in that file today).
- `Stage path: staged/{name}.` parsing must tolerate (a) trailing prose after the path on the same line (e.g. `... Stage path: staged/foo.patch. Reversibility: high.`), and (b) filenames containing dots before their extension (e.g. `staged/review-2.patch`).

---

### Task 1: `checkStagedInventory` module + regression tests

**Files:**
- Create: `plugin/bin/lib/hooks/staged-inventory.js`
- Test: `tests/hooks-staged-inventory.test.js`

**Interfaces:**
- Produces: `checkStagedInventory(runDir: string) -> { checked: number, missing: string[] }` — `checked` is the total count of `Stage path: staged/...` occurrences found in `{runDir}/decisions.md`; `missing` is the subset of those relative paths (each starting `staged/`) that do not exist on disk under `runDir`. Returns `{ checked: 0, missing: [] }` when `{runDir}/decisions.md` does not exist.
- Produces: `parseStagePaths(text: string) -> string[]` — every `staged/...` path found in `text` via the `Stage path:` marker, in order of appearance, duplicates included (mirrors line-count semantics of `checked`).
- Consumes: `fs.existsSync`, `fs.readFileSync`, `path.join` — Node built-ins only, no other module in this repo.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks-staged-inventory.test.js`:

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkStagedInventory, parseStagePaths } = require('../plugin/bin/lib/hooks/staged-inventory');

function tmpRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-staged-inventory-'));
}

function writeDecisions(runDir, text) {
  fs.writeFileSync(path.join(runDir, 'decisions.md'), text);
}

test('parseStagePaths: extracts a simple Stage path line', () => {
  const text = 'STAGED 14:41:15 — Step 3 Routing: 1 finding. Stage path: staged/review-2.patch.';
  assert.deepStrictEqual(parseStagePaths(text), ['staged/review-2.patch']);
});

test('parseStagePaths: extracts the path even with trailing prose on the same line', () => {
  const text = 'STAGED 14:41:15 — Step 3 Routing: high-severity finding. Stage path: staged/review-3.patch. Reversibility: high.';
  assert.deepStrictEqual(parseStagePaths(text), ['staged/review-3.patch']);
});

test('parseStagePaths: extracts a filename containing a dot before its extension', () => {
  const text = 'STAGED 15:02:18 — Leftover routing: section cannot finish. Stage path: staged/leftover-error-handling-edge-cases.md.';
  assert.deepStrictEqual(parseStagePaths(text), ['staged/leftover-error-handling-edge-cases.md']);
});

test('parseStagePaths: extracts multiple lines in order, ignores non-STAGED lines', () => {
  const text = [
    'AUTO 14:32:14 — Step 1.5: scope-creep applied. Reversibility: high (commit abc1234).',
    'STAGED 14:41:15 — Step 3 Routing: finding one. Stage path: staged/review-1.patch.',
    'KEPT-PROMPT 14:12:40 — Step 2.6: needed input. Surfaced inline.',
    'STAGED 14:41:22 — Step 3 Routing: finding two. Stage path: staged/review-2.patch.',
  ].join('\n');
  assert.deepStrictEqual(parseStagePaths(text), ['staged/review-1.patch', 'staged/review-2.patch']);
});

test('checkStagedInventory: no decisions.md is checked:0, missing:[] (nothing to reconcile)', () => {
  const runDir = tmpRunDir();
  assert.deepStrictEqual(checkStagedInventory(runDir), { checked: 0, missing: [] });
});

test('checkStagedInventory: every named staged/ file exists — missing is empty', () => {
  const runDir = tmpRunDir();
  fs.mkdirSync(path.join(runDir, 'staged'));
  fs.writeFileSync(path.join(runDir, 'staged', 'review-1.patch'), 'diff content');
  writeDecisions(runDir, 'STAGED 14:41:15 — Step 3 Routing: finding. Stage path: staged/review-1.patch.');
  assert.deepStrictEqual(checkStagedInventory(runDir), { checked: 1, missing: [] });
});

test('checkStagedInventory: a STAGED line naming a staged/ file that was never written is flagged (regression, #1269)', () => {
  const runDir = tmpRunDir();
  // No staged/ dir at all -- simulates the exact crash: log-decision.js's
  // write landed, stage-item.js's write never happened.
  writeDecisions(runDir, 'STAGED 08:22:19 — Step 3 lens dispatch: deferred finding. Stage path: staged/review-defer-1.md.');
  const result = checkStagedInventory(runDir);
  assert.strictEqual(result.checked, 1);
  assert.deepStrictEqual(result.missing, ['staged/review-defer-1.md']);
});

test('checkStagedInventory: mixed present and missing entries — only the missing one is reported', () => {
  const runDir = tmpRunDir();
  fs.mkdirSync(path.join(runDir, 'staged'));
  fs.writeFileSync(path.join(runDir, 'staged', 'review-1.patch'), 'diff content');
  writeDecisions(runDir, [
    'STAGED 14:41:15 — Step 3 Routing: finding one. Stage path: staged/review-1.patch.',
    'STAGED 14:41:22 — Step 3 Routing: finding two. Stage path: staged/review-2.patch.',
  ].join('\n'));
  const result = checkStagedInventory(runDir);
  assert.strictEqual(result.checked, 2);
  assert.deepStrictEqual(result.missing, ['staged/review-2.patch']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/hooks-staged-inventory.test.js`
Expected: FAIL — `Cannot find module '../plugin/bin/lib/hooks/staged-inventory'`

- [ ] **Step 3: Write the implementation**

Create `plugin/bin/lib/hooks/staged-inventory.js`:

```javascript
// bin/lib/hooks/staged-inventory.js — reconciles decisions.md's STAGED
// entries against staged/'s actual file inventory (#1269).
//
// Why this exists: log-decision.js (writes the decisions.md STAGED line)
// and stage-item.js (writes the actual staged/{name} file) are two
// independent calls with no atomicity between them. A session crash
// between the two leaves decisions.md claiming a staged proposal exists
// when the file was never written -- observed directly: review's Step 3
// lens dispatch logged a STAGED line for staged/review-defer-1.md, but the
// session crashed before the file was written, and the next wrap-up run
// had to manually re-derive the missing proposal from decisions.md's
// prose. This module is the check that should have caught it.
//
// Deliberately separate from resume-freshness.js / checkResumeFreshness:
// that function's return shape is pinned by existing tests
// (assert.deepStrictEqual against exact objects) and its CLI verb
// (check-resume-freshness) is documented to write exactly one line to
// stdout. Folding this concern in there would break both. This module and
// its own CLI verb (check-staged-inventory) are additive and orthogonal --
// a staged-inventory mismatch never blocks a resume, it only surfaces.
'use strict';
const fs = require('fs');
const path = require('path');

// Matches "Stage path: staged/{name}." anywhere in decisions.md, capturing
// the path non-greedily up to a literal period that is followed by
// whitespace or end-of-string -- tolerates trailing prose on the same line
// ("... Stage path: staged/foo.patch. Reversibility: high.") and filenames
// that themselves contain dots (extensions like ".patch"/".md").
const STAGE_PATH_RE = /Stage path:\s+(staged\/\S+?)\.(?=\s|$)/g;

function parseStagePaths(text) {
  const found = [];
  const re = new RegExp(STAGE_PATH_RE);
  let m;
  while ((m = re.exec(text))) {
    found.push(m[1]);
  }
  return found;
}

// runDir: the pipeline run directory (holding decisions.md and staged/).
// Returns { checked, missing } -- missing is empty when every named STAGED
// destination exists on disk, including when decisions.md is absent or
// carries no STAGED lines at all (nothing to reconcile).
function checkStagedInventory(runDir) {
  const decisionsPath = path.join(runDir, 'decisions.md');
  if (!fs.existsSync(decisionsPath)) return { checked: 0, missing: [] };
  const text = fs.readFileSync(decisionsPath, 'utf8');
  const staged = parseStagePaths(text);
  const missing = staged.filter((rel) => !fs.existsSync(path.join(runDir, rel)));
  return { checked: staged.length, missing };
}

module.exports = { checkStagedInventory, parseStagePaths };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-staged-inventory.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/staged-inventory.js tests/hooks-staged-inventory.test.js
git commit -m "Add checkStagedInventory: reconcile decisions.md STAGED lines against staged/'s file inventory (refs #1269)"
```

---

### Task 2: `check-staged-inventory` CLI verb + CLI-level tests

**Files:**
- Modify: `plugin/bin/hooks.js` (add `require` near line 17, add command handler near line 496's `check-resume-freshness` block)
- Test: `tests/hooks-dispatcher.test.js` (add cases near the existing `check-resume-freshness` tests, around line 615)

**Interfaces:**
- Consumes: `checkStagedInventory(runDir)` from Task 1 (`plugin/bin/lib/hooks/staged-inventory.js`).
- Consumes: `resolveRunArg(args, cwd, env)` and `reportWorktreeLocalFallback(runDir, worktreeLocalFallback)` — both already defined in `plugin/bin/hooks.js` (used by the existing `check-resume-freshness` handler; same signatures, no changes to either).
- Produces: CLI verb `check-staged-inventory --run <dir>` — always exits `0`, writes exactly one line to stdout:
  - `claude-tweaks: staged inventory OK for {run-id} ({checked} STAGED entries)` when `missing.length === 0`.
  - `claude-tweaks: staged inventory MISMATCH for {run-id} — {N} of {checked} STAGED entries missing from staged/: {missing.join(', ')}` when `missing.length > 0` (`N` = `missing.length`).
  - `claude-tweaks: --run path rejected: {invalidRunArg} — staged inventory not checked` when `resolveRunArg` reports `invalidRunArg` (mirrors the existing `check-resume-freshness` message shape, substituting the trailing clause).
  - `claude-tweaks: no pipeline run dir found — staged inventory not checked` when no `runDir` resolves (mirrors the existing message shape, substituting the trailing clause).

- [ ] **Step 1: Write the failing tests**

Add to `tests/hooks-dispatcher.test.js`, immediately after the existing three `check-resume-freshness` tests (after the one ending around line 642, before the `#1130` comment block that follows):

```javascript
test('check-staged-inventory: reports OK when decisions.md has no STAGED entries', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-3');
  fs.mkdirSync(run, { recursive: true });
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory OK for 2026-08-01T000000-record-3 \(0 STAGED entries\)/);
});

test('check-staged-inventory: reports OK when every STAGED entry has a backing file', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-4');
  fs.mkdirSync(path.join(run, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(run, 'staged', 'review-1.patch'), 'diff');
  fs.writeFileSync(path.join(run, 'decisions.md'), 'STAGED 14:41:15 — Step 3 Routing: finding. Stage path: staged/review-1.patch.');
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory OK for 2026-08-01T000000-record-4 \(1 STAGED entries\)/);
});

test('check-staged-inventory: reports MISMATCH naming the missing path when a STAGED entry has no backing file', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-5');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'decisions.md'), 'STAGED 08:22:19 — Step 3 lens dispatch: deferred finding. Stage path: staged/review-defer-1.md.');
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory MISMATCH for 2026-08-01T000000-record-5 — 1 of 1 STAGED entries missing from staged\/: staged\/review-defer-1\.md/);
});

test('check-staged-inventory: no resolvable --run path reports the not-found line', () => {
  const project = tmpProject();
  const result = runHook(['check-staged-inventory', '--run', path.join(project, 'nope')], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL on the four new `check-staged-inventory` tests — `hooks.js` exits non-zero or prints nothing recognizable, since the `check-staged-inventory` command does not exist yet (falls through to whatever `hooks.js` does for an unrecognized command).

- [ ] **Step 3: Write the implementation**

In `plugin/bin/hooks.js`, add the require near the existing `resumeFreshness` require (around line 17):

```javascript
const resumeFreshness = require('./lib/hooks/resume-freshness');
const stagedInventory = require('./lib/hooks/staged-inventory');
```

Immediately after the existing `check-resume-freshness` handler block (which ends at the `return 0;` / closing `}` around line 520), add the new handler:

```javascript
  if (cmd === 'check-staged-inventory') {
    // Read-only, non-blocking companion to check-resume-freshness: reports
    // whether decisions.md's STAGED entries all have a backing staged/
    // file, but never gates a resume (#1269).
    const { runDir, invalidRunArg, worktreeLocalFallback } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    reportWorktreeLocalFallback(runDir, worktreeLocalFallback);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — staged inventory not checked\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — staged inventory not checked\n');
      return 0;
    }
    const result = stagedInventory.checkStagedInventory(runDir);
    const runId = path.basename(runDir);
    if (result.missing.length === 0) {
      process.stdout.write(`claude-tweaks: staged inventory OK for ${runId} (${result.checked} STAGED entries)\n`);
    } else {
      process.stdout.write(`claude-tweaks: staged inventory MISMATCH for ${runId} — ${result.missing.length} of ${result.checked} STAGED entries missing from staged/: ${result.missing.join(', ')}\n`);
    }
    return 0;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS (including the four new tests; no regression in existing `check-resume-freshness` tests, since that handler and its output are untouched)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/hooks.js tests/hooks-dispatcher.test.js
git commit -m "Wire check-staged-inventory CLI verb into hooks.js (refs #1269)"
```

---

### Task 3: Wire the companion check into skill prose

**Files:**
- Modify: `plugin/skills/_shared/run-resume-freshness.md`
- Modify: `plugin/skills/dispatch/resume-confirmation.md:37`
- Modify: `plugin/skills/flow/steps-and-gates.md:60`
- Modify: `plugin/skills/wrap-up/SKILL.md:61`
- Modify: `plugin/skills/wrap-up/review-console.md` (`## Read inputs` section)

**Interfaces:**
- Consumes: the `check-staged-inventory --run <dir>` CLI verb from Task 2 — no code interface, prose only.

- [ ] **Step 1: Add the companion-check subsection to `_shared/run-resume-freshness.md`**

In `plugin/skills/_shared/run-resume-freshness.md`, immediately after the `## Branching on the result` section's closing content and before `## When blocked` (i.e. insert a new `##` section between the two — locate the exact insertion point by finding the blank line that follows the `## Branching on the result` section's last paragraph, which ends "...within the same now-resumed run." and precedes the `## When blocked` heading), add:

```markdown
## Staged inventory reconciliation (non-blocking companion check, #1269)

Run alongside `check-resume-freshness` at every call site that cites this file, not as a
replacement for it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-staged-inventory --run "{run-dir}"
```

Parses every `STAGED ... Stage path: staged/{name}` line in this run's `decisions.md` and checks
whether the named file actually exists under `staged/` — catching the case where a session
crashed between `log-decision.js`'s write of the `decisions.md` line and `stage-item.js`'s write
of the actual staged file, leaving `decisions.md` claiming a proposal exists that was never
written.

**Never blocks the resume.** Unlike `check-resume-freshness`'s `OK`/`BLOCKED` verdict, this
command always exits `0` and its result never stops a resume from proceeding — it only surfaces
what it found:

- `claude-tweaks: staged inventory OK for {run-id} ({N} STAGED entries)` — every named `staged/`
  destination exists (or there are none). Proceed silently.
- `claude-tweaks: staged inventory MISMATCH for {run-id} — {N} of {M} STAGED entries missing from
  staged/: {paths}` — report this line verbatim alongside the resume's normal outcome so a human
  or agent re-deriving the missing proposal(s) from `decisions.md`'s prose knows to do so, rather
  than assuming `staged/` is complete.
```

- [ ] **Step 2: Add the companion-check instruction to `dispatch/resume-confirmation.md:37`**

In `plugin/skills/dispatch/resume-confirmation.md`, in the paragraph at line 37 (the one beginning "Before re-adopting, run `_shared/run-resume-freshness.md`'s probe against `{run-dir}`"), immediately after the sentence ending "...report that line verbatim in place of the confirmation above and stop; do not re-adopt." and before the sentence beginning "The actual resume mechanism, on an `OK` result,", insert:

```
Also run that file's staged-inventory companion check (`check-staged-inventory --run "{run-dir}"`) at the same time — non-blocking; report a `MISMATCH` line verbatim alongside the confirmation if one comes back.
```

- [ ] **Step 3: Add the companion-check instruction to `flow/steps-and-gates.md:60`**

In `plugin/skills/flow/steps-and-gates.md`, in the numbered item at line 60 (the "Set, the directory it names exists..." adoption case), immediately after the sentence ending "...do not adopt." and before the sentence beginning "On `OK`, create no new run directory.", insert:

```
Also run that file's staged-inventory companion check (`check-staged-inventory --run "{run-dir}"`) at the same time — non-blocking; note a `MISMATCH` line verbatim in the pipeline's output if one comes back.
```

**Size-headroom note:** `plugin/skills/wrap-up/SKILL.md` measures 39,070 bytes on this plan's merge base — inside the ~10% headroom zone of the 40 KB (40,960 byte) ceiling. This step's addition is a single ~195-byte sentence (no new section), landing the file at ~39,265 bytes — still ~1,700 bytes under the ceiling, so no split is needed for this change. Re-measure (`wc -c`) after the edit lands in Step 6 to confirm.

- [ ] **Step 4: Add the companion-check instruction to `wrap-up/SKILL.md:61`**

In `plugin/skills/wrap-up/SKILL.md`, in the paragraph at line 61 (the `resume` command description), immediately after the sentence ending "...report that line verbatim and stop; do not fall through to conversation-based work." and before the sentence beginning "On `OK`, set `$PIPELINE_RUN_DIR`", insert:

```
Also run that file's staged-inventory companion check (`check-staged-inventory --run "{run-dir}"`) at the same time — non-blocking; report a `MISMATCH` line verbatim alongside the resume's outcome if one comes back.
```

- [ ] **Step 5: Add a 5th "Read inputs" item to `wrap-up/review-console.md`**

In `plugin/skills/wrap-up/review-console.md`, in the `## Read inputs` section (currently a 4-item numbered list ending with `4. \`events.jsonl\` — hook-recorded typed events; surface \`wd-deny\`, \`wd-push-mismatch\`, \`contract-violation\`, and \`gate-denial\` events`), add a 5th item:

```markdown
5. **Staged inventory reconciliation** — run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-staged-inventory --run "{run-dir}"` (`_shared/run-resume-freshness.md`'s companion check, #1269). When it reports `MISMATCH`, surface it as a visible warning line in the rendered console output (never a silent log entry) — a `STAGED` entry in `decisions.md` whose named `staged/` file does not exist means that proposal needs to be manually re-derived from `decisions.md`'s prose before it can be applied at this console.
```

- [ ] **Step 6: Verify every edit landed correctly**

```bash
grep -n "check-staged-inventory" plugin/skills/_shared/run-resume-freshness.md plugin/skills/dispatch/resume-confirmation.md plugin/skills/flow/steps-and-gates.md plugin/skills/wrap-up/SKILL.md plugin/skills/wrap-up/review-console.md
```

Expected: one or more matches in each of the five files.

Step 5 inserts a 5th row into `review-console.md`'s `## Read inputs` numbered list (previously 4 items) — a renumbering-completeness check (`build/plan-authoring-checks.md`) requires searching for the affected fact in three independent forms before trusting the insertion is complete. All three were checked at plan-authoring time and came back empty (no other file cites this list's size), but re-run them here to confirm nothing changed since:

```bash
grep -rn "Read inputs" plugin/ docs/ tests/                              # the list's own heading, any other reference to it
grep -rn "four.input\|4.input\|4-item\|four items" plugin/skills/wrap-up/ # cardinal-word/numeral count of the list's size
grep -rn "events\.jsonl.*Read inputs\|Read inputs.*events" plugin/ tests/ # any other file naming "item 4" (events.jsonl) by position
```

Expected: no matches beyond `review-console.md` itself in any of the three — confirms no other file's prose depends on this list staying at 4 items.

- [ ] **Step 7: Run the full prose-conformance suite to confirm no citation drift**

Run: `node --test tests/flow-resume-freshness-citations.test.js`
Expected: PASS — this file was not deleted or restructured, only extended, so existing citations remain valid.

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/_shared/run-resume-freshness.md plugin/skills/dispatch/resume-confirmation.md plugin/skills/flow/steps-and-gates.md plugin/skills/wrap-up/SKILL.md plugin/skills/wrap-up/review-console.md
git commit -m "Wire check-staged-inventory companion check into resume/console call sites (refs #1269)"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, no failures attributable to this change (per CLAUDE.md's flake-tolerance note, a count that varies run-to-run on byte-identical code tracks machine load, not a regression — re-run only the affected files in isolation if anything looks off).

- [ ] **Step 2: Re-run the specific new/touched files in isolation**

Run:
```bash
node --test tests/hooks-staged-inventory.test.js
node --test tests/hooks-dispatcher.test.js
node --test tests/hooks-resume-freshness.test.js
node --test tests/flow-resume-freshness-citations.test.js
```
Expected: PASS on all four — the last two confirm no regression to the existing, untouched `check-resume-freshness` behavior and its citations.
