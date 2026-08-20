# Fix auto-decision-log.md's false worktree-gate claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the false "a worktree already satisfies the gate" claim and its worktree-conditional append-shape block from `plugin/skills/_shared/auto-decision-log.md`, replace it with one unconditional instruction to use `bin/log-decision.js`, sweep the one other file that still prescribes a stale heredoc/redirect append shape, and pin both with a test.

**Architecture:** This is a documentation-correctness fix, not new runtime code. Research (Task 1) established that `bin/log-decision.js` (shipped under #686, predating this record) already IS the canonical, working append CLI the record's Deliverable 1 asks for — it already works correctly from a worktree session against a main-checkout run dir (empirically verified live during this build's own `/flow` orchestration). `docs/hooks.md` (line 13) explicitly documents the project's convention that a *second* pipeline-bookkeeping write CLI follows the same standalone-`bin/{name}.js` shape as its precedent rather than becoming a `bin/hooks.js` subcommand — so adding `bin/hooks.js log-decision` as literally worded in the record's Deliverable 1 / Acceptance Criteria would contradict the project's own already-documented convention and duplicate `bin/log-decision.js`'s logic. Task 1 therefore reconciles the record's stale literal wording against live repo state (an Architecture Alignment "update the spec" classification, `build/architecture-alignment.md`) instead of building a redundant CLI. The remaining, still-live bug is exactly what's left after that reconciliation: the prose in `auto-decision-log.md` (lines 162–174) still claims a worktree "already satisfies the gate" and prescribes an obsolete printf/heredoc fallback, and `pipeline-run-dir.md` (lines 83–90) still illustrates the same obsolete heredoc pattern. Tasks 2–3 fix both, gated by a `node --test` pin (Task 2 writes it red against the pre-fix text; Task 3's fix turns it green).

**Tech Stack:** Markdown skill-prose files (`plugin/skills/_shared/*.md`), Node's built-in `node:test` + `node:assert` (this repo's only test runner, per CLAUDE.md).

**Spec:** `.claude-tweaks/pipelines/2026-08-20T043953-record-596/work/596-spec.md` (materialized from GitHub issue #596; plan argues from it, task text quotes the parts each task needs).

## Global Constraints

- Repo payload lives under `plugin/` (e.g. `plugin/skills/_shared/auto-decision-log.md`), not at repo root — every file path in this plan is relative to the repo root and includes the `plugin/` prefix.
- Tests live under `tests/` at the repo root (`npm test` runs `node --test tests/` — a recursive glob, per CLAUDE.md).
- No conventional-commit prefixes; commit messages are `{Verb} {what} — {detail}`, imperative.
- `npm test` must pass in full before this plan is done (Acceptance Criteria's last bullet).
- Never write `closes #596` / `fixes #596` in any commit message on this branch — use `refs #596` only (governs every commit step below).

---

### Task 1: Reconcile Deliverable 1 / Acceptance Criteria against live repo state (no code changes)

**Files:**
- Read: `plugin/skills/_shared/auto-decision-log.md` (already read in full during planning — lines 61–70, 134–147 document `bin/log-decision.js` as the canonical appender)
- Read: `plugin/bin/log-decision.js` (already read in full during planning)
- Read: `docs/hooks.md` (already read in full during planning — line 13's standalone-CLI convention)
- Modify: `.claude-tweaks/pipelines/2026-08-20T043953-record-596/work/596-spec.md` (append a reconciliation note; do not alter the verbatim record body above it)

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: a documented reconciliation decision later tasks build on — "Deliverable 1 / the `bin/hooks.js log-decision` acceptance criterion is satisfied-by-equivalent via the pre-existing `bin/log-decision.js`; no new CLI is built." Task 2/3 read this decision to know their scope stops at the prose fix (Deliverables 2–4), never a new `bin/hooks.js` subcommand.

- [ ] **Step 1: Confirm `bin/log-decision.js` already satisfies Deliverable 1's functional requirement**

Run the exact scenario the record's Current State and Acceptance Criteria describe — invoked from a worktree session, targeting a main-checkout run dir:

```bash
node "${CLAUDE_PLUGIN_ROOT:-/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.97.0}/bin/log-decision.js" --help
```

Expected: prints usage (`--run <run-dir> --status ... --text ...`), exit 0. This was also already verified live during this build's own pipeline orchestration (`decisions.md` under `.claude-tweaks/pipelines/2026-08-20T043953-record-596/` has real `AUTO`-status entries appended from this worktree against the main-checkout run dir — read that file to confirm, it is not fabricated).

- [ ] **Step 2: Confirm the project convention that forbids adding a duplicate `bin/hooks.js log-decision` subcommand**

```bash
grep -n "bin/log-decision.js\|standalone CLI\|hooks.js subcommand" docs/hooks.md
```

Expected: the line reading (paraphrased) "`bin/log-decision.js` (#686) and `bin/stage-item.js` (#637) are standalone CLIs instead... Default to a standalone `bin/{name}.js` sibling when a same-purpose precedent CLI already exists; default to a `hooks.js` subcommand only for the first one." This is the documented reason Deliverable 1's literal wording (`bin/hooks.js log-decision`) is now stale: `bin/log-decision.js` is that precedent CLI, already shipped, and a second CLI for the identical purpose must follow its shape, not fork into `bin/hooks.js`.

- [ ] **Step 3: Append a reconciliation note to the materialized spec**

Append (do not modify anything above it) to `.claude-tweaks/pipelines/2026-08-20T043953-record-596/work/596-spec.md`:

```markdown

## Build reconciliation note (Architecture Alignment — Common Step 4.5, "Update the spec")

Deliverable 1 / the first Acceptance Criteria bullet ask for a new `bin/hooks.js log-decision
--run <dir> --skill <name> --entry <text>` subcommand. Live repo research at build time found
this is already satisfied by a pre-existing, differently-shaped CLI: `bin/log-decision.js --run
<run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED|REFUSED --text "..." [--section "/<skill>"]`
(shipped under #686, predating this record), already documented in
`plugin/skills/_shared/auto-decision-log.md` as "the canonical appender for this schema", and
already the tool `docs/hooks.md` names as the project's established standalone-CLI convention
for a second pipeline-bookkeeping write verb (line 13: a same-purpose precedent CLI gets a
standalone `bin/{name}.js` sibling, never folded into `bin/hooks.js`). Empirically verified
during this build's own `/flow` orchestration: invoked from a worktree session against a
main-checkout run dir, it appended correctly (see this run's own `decisions.md`).

Building a second, `bin/hooks.js`-hosted CLI for the identical purpose would duplicate
`bin/log-decision.js`'s logic and contradict `docs/hooks.md`'s own documented convention. This
build satisfies Deliverable 1's intent via the existing CLI and does not add a new one. The
remaining deliverables (2–4: fix the false "already satisfies the gate" prose, sweep the one
other file with a stale append-shape prescription, add test pinning) are unaffected and proceed
as specified.
```

- [ ] **Step 4: Log the decision**

```bash
node "${CLAUDE_PLUGIN_ROOT:-/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.97.0}/bin/log-decision.js" --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-20T043953-record-596" --status AUTO --section "/build" --step "Spec Step 3 Task 1 — Architecture Alignment" --text "Deliverable 1 satisfied-by-equivalent via pre-existing bin/log-decision.js (docs/hooks.md's standalone-CLI convention, #686); no new bin/hooks.js subcommand added. Reconciliation note appended to materialized spec." --reversibility high
```

- [ ] **Step 5: Commit**

```bash
git add ".claude-tweaks/pipelines/2026-08-20T043953-record-596/work/596-spec.md"
git commit -m "Reconcile record #596 Deliverable 1 against existing bin/log-decision.js

Live repo research found bin/log-decision.js (#686) already satisfies the
functional need; docs/hooks.md documents the standalone-CLI convention that
makes a bin/hooks.js log-decision subcommand the wrong shape for a second
CLI of the same purpose. Appends a reconciliation note to the materialized
spec rather than building a duplicate tool.

refs #596"
```

---

### Task 2: Write the failing prose-pin test (red)

**Files:**
- Create: `tests/auto-decision-log-worktree-gate.test.js`
- Read: `plugin/skills/_shared/auto-decision-log.md`
- Read: `plugin/skills/_shared/pipeline-run-dir.md`

**Interfaces:**
- Consumes: nothing beyond the two file paths above (plain text reads).
- Produces: a `node --test` file with assertions that fail against the current (pre-fix) text of both files and will pass once Task 3's fix lands — read by Task 3's Step 4 verification.

- [ ] **Step 1: Write the test file**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #596: skills/_shared/auto-decision-log.md falsely claimed a skill already
// running inside a /flow-/build-created worktree "is unaffected ... the
// worktree already satisfies the gate" for decisions.md appends. It does
// not — the run directory is anchored to the main checkout while the
// session runs in the worktree, so Edit/Write/heredoc/redirect attempts
// against it are refused regardless of worktree existence. This pin:
// (1) asserts the false claim and its worktree-conditional append-shape
// block are gone, replaced by one unconditional log-decision instruction;
// (2) asserts pipeline-run-dir.md no longer illustrates the same obsolete
// heredoc/redirect append shape for decisions.md; (3) a repo-wide negative
// sweep — no plugin/skills/**/*.md file prescribes a `>>`/`<<` append
// against decisions.md under a run-dir variable, catching a future
// regression anywhere in the tree, not just these two known files.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const AUTO_DECISION_LOG = read('plugin', 'skills', '_shared', 'auto-decision-log.md');
const PIPELINE_RUN_DIR = read('plugin', 'skills', '_shared', 'pipeline-run-dir.md');

test('auto-decision-log.md no longer claims a worktree "already satisfies the gate"', () => {
  assert.doesNotMatch(AUTO_DECISION_LOG, /already satisfies the gate/);
});

test('auto-decision-log.md no longer gates the append shape on worktree existence', () => {
  assert.doesNotMatch(AUTO_DECISION_LOG, /before a worktree exists for this run/);
});

test('auto-decision-log.md states the append path is unconditional regardless of worktree state', () => {
  assert.match(
    AUTO_DECISION_LOG,
    /regardless of whether the session sits in a worktree or the main checkout/,
  );
});

test('pipeline-run-dir.md no longer illustrates a heredoc/redirect append to decisions.md', () => {
  assert.doesNotMatch(PIPELINE_RUN_DIR, /cat >> "\$RUN_DIR\/decisions\.md"/);
});

test('pipeline-run-dir.md cites bin/log-decision.js for the Edit/Write refusal case', () => {
  assert.match(PIPELINE_RUN_DIR, /bin\/log-decision\.js/);
});

// --- Repo-wide negative sweep (Deliverable 4) ---
// Windowed, not a same-line-only match: a redirect/heredoc token can wrap
// onto an adjacent line in prose (see the project's own
// whitespace-spanning-sweep-greps lesson), so this scans a character
// window around every decisions.md occurrence rather than requiring both
// tokens on one line.

function findSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSkillFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('no plugin/skills/**/*.md file prescribes a >>/<< append to decisions.md under a run-dir variable', () => {
  const skillsDir = path.join(ROOT, 'plugin', 'skills');
  const offenders = [];
  for (const file of findSkillFiles(skillsDir)) {
    const text = fs.readFileSync(file, 'utf8');
    let idx = text.indexOf('decisions.md');
    while (idx !== -1) {
      const windowStart = Math.max(0, idx - 120);
      const windowEnd = Math.min(text.length, idx + 40);
      const window = text.slice(windowStart, windowEnd);
      // A redirect (>>) or heredoc (<<) token in the same window as a
      // decisions.md occurrence under a $RUN_DIR-shaped variable name.
      if (/(>>|<<)\s*['"]?\$\{?(RUN_DIR|PIPELINE_RUN_DIR)\}?\/?[^\s'"]*decisions\.md/.test(window)
        || /decisions\.md['"]?\s*(>>|<<)/.test(window)) {
        offenders.push(`${path.relative(ROOT, file)} (near offset ${idx})`);
      }
      idx = text.indexOf('decisions.md', idx + 1);
    }
  }
  assert.deepStrictEqual(offenders, [], `stale append-shape prescriptions found: ${offenders.join(', ')}`);
});
```

- [ ] **Step 2: Run the new test file to verify it fails (red) against the current, pre-fix prose**

```bash
node --test tests/auto-decision-log-worktree-gate.test.js
```

Expected: FAIL — at minimum the "no longer claims", "no longer gates", "states the append path is unconditional", "no longer illustrates a heredoc/redirect", and the repo-wide negative sweep tests all fail against the current text (the false claim, the conditional heading, and the two heredoc/redirect illustrations are all still present pre-fix). Confirm the failure output names these specific tests, not an unrelated error (a require/path typo) — a wrong-reason failure does not count as red.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/auto-decision-log-worktree-gate.test.js
git commit -m "Add failing prose pin for auto-decision-log.md's worktree-gate claim

Red against current text — deletes/replaces in the next commit. Pins both
the specific false sentence and a repo-wide negative sweep for the same
append-shape class, per #596's acceptance criteria.

refs #596"
```

---

### Task 3: Fix the prose (green)

**Files:**
- Modify: `plugin/skills/_shared/auto-decision-log.md:162-174`
- Modify: `plugin/skills/_shared/pipeline-run-dir.md:83-90`

**Interfaces:**
- Consumes: Task 2's test file (`tests/auto-decision-log-worktree-gate.test.js`) as the verification gate.
- Produces: nothing further downstream — this is the terminal content fix; Task 4 runs full verification.

- [ ] **Step 1: Replace the worktree-conditional block in `auto-decision-log.md`**

Replace (the whole block from the `**Under `worktree-always: true`...` heading through the closing false sentence, including the bash fence between them — lines 162–174 in the pre-fix file):

```
replacing:
**Under `worktree-always: true`, before a worktree exists for this run.** Every standalone-auto skill (`_shared/pipeline-run-dir.md`'s step 4 allowlist: `/tidy`, `/init`, `/capture`, `/dispatch`, `/backlog`) writes its own `decisions.md` directly against the main checkout — there is no per-run worktree the way a `/build`/`/flow` pipeline has one. The `worktree-always` PreToolUse gate blocks `Edit`/`Write`/`NotebookEdit` there, so the Read+Write pattern above is denied. Use `bin/log-decision.js` (above) or a Bash append instead — the gate's Bash coverage is the `cp`/`mv`/`tee` shapes only, not a Node process or output redirection (see CLAUDE.md's Hooks section):

```bash
HEADING="## /{skill-name}"
if [ ! -f "$RUN_DIR/decisions.md" ] || ! grep -qF "$HEADING" "$RUN_DIR/decisions.md" 2>/dev/null; then
  printf '%s\n' "$HEADING" >> "$RUN_DIR/decisions.md"
fi
cat >> "$RUN_DIR/decisions.md" <<'EOF'
AUTO 14:32:14 — {step or location}: {short action}. Reversibility: high.
EOF
```

This produces the identical entry format (Entry schema, above) and end state as the Read+Write pattern — it's a mechanical substitution for *how* the write lands under this specific policy condition, not a different log format. A skill already running inside a `/flow`/`/build`-created worktree is unaffected and keeps using the Read+Write pattern — the worktree already satisfies the gate.

with:
**Regardless of worktree state.** `bin/log-decision.js` (above) is the sole append path for `decisions.md` — unconditionally, whether the session sits inside a `/flow`/`/build`-created worktree or the main checkout. The run directory is always anchored to the main checkout (`_shared/pipeline-run-dir.md`'s Anchoring section); a worktree session's `Edit`/`Write`/heredoc/redirect attempts against a file under it are refused by the harness regardless of whether a worktree exists for this run — worktree existence was never the deciding factor, and there is no separate append shape for the worktree case.
```

- [ ] **Step 2: Fix the heredoc illustration in `pipeline-run-dir.md`**

```
replacing:
**The hook-level exemption above is necessary but not sufficient.** The Edit/Write/NotebookEdit
tools apply their own cross-checkout write-pinning refusal for a path under the shared main
checkout, independent of and not covered by the `worktree-always` hook exemption — a session
isolated to this worktree can still see an Edit/Write attempt against `decisions.md`,
`staged/*.md`, `manifest.yml`, or any other file under a resolved run directory refused outright.
When that happens, use a Bash heredoc instead (`cat >> "$RUN_DIR/decisions.md" << 'EOF' ... EOF`,
or `cat > "$RUN_DIR/staged/{name}.md" << 'EOF' ... EOF` for a new file) — Bash write redirection
is not subject to this tool-level pinning.

with:
**The hook-level exemption above is necessary but not sufficient.** The Edit/Write/NotebookEdit
tools apply their own cross-checkout write-pinning refusal for a path under the shared main
checkout, independent of and not covered by the `worktree-always` hook exemption — a session
isolated to this worktree can still see an Edit/Write attempt against `decisions.md`,
`staged/*.md`, `manifest.yml`, or any other file under a resolved run directory refused outright.
When that happens, use `bin/log-decision.js` (`_shared/auto-decision-log.md`'s canonical
appender) for a `decisions.md` entry, or `bin/stage-item.js` for a new staged file — neither is
subject to this tool-level pinning, and both work identically from a worktree session or the
main checkout.
```

- [ ] **Step 3: Run the pin test to verify it passes (green)**

```bash
node --test tests/auto-decision-log-worktree-gate.test.js
```

Expected: PASS — all tests, including the repo-wide negative sweep.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/auto-decision-log.md plugin/skills/_shared/pipeline-run-dir.md
git commit -m "Fix false worktree-gate claim in auto-decision-log.md's decisions.md contract

Delete the worktree-conditional append-shape block and its closing 'a
worktree already satisfies the gate' sentence — the conditional's premise
(worktree existence determines write pattern) was itself wrong, not just
its conclusion. Replace with one unconditional instruction: use
bin/log-decision.js regardless of worktree state. Fix the matching stale
heredoc illustration in pipeline-run-dir.md to cite the same CLI.

refs #596"
```

---

### Task 4: Full verification

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: the full working tree as of Task 3's commit.
- Produces: the build's `VERIFICATION_PASSED=true` signal for `/build` Common Step 5 (outside this plan's own scope — the executing skill sets this after this task).

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: PASS in full (types/lint/tests per CLAUDE.md's `npm test` — this repo has no separate type-check step). If anything unrelated to this change fails, treat per the project's own re-run guidance (CLAUDE.md: a failure count that varies run-to-run on byte-identical code tracks machine load, not a regression — re-run only the affected file(s) in isolation before concluding anything is actually broken).

- [ ] **Step 2: Confirm no stray uncommitted changes**

```bash
git status --short
```

Expected: clean (nothing to commit) — every change from Tasks 1–3 already landed in its own commit.
