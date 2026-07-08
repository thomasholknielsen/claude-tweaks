# Worktree Directory Convention Two-Domain Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/init`'s single-winner "the standard worktree directory is `.worktrees/`" framing (and its dangerous "migrate `.claude/worktrees/` to `.worktrees/`" instruction) with an accurate two-domain description, fix a related misleading health-check row, and fix `/code-health`'s `SKIP_DIRS` so its scanners stop walking into other sessions' live worktrees under `.claude/worktrees/`.

**Architecture:** Three prose edits across two `/init` files plus one doc-consistency file (no code, no tests — verified by grep), and one identical one-line array fix repeated across four `bin/lib/code-health/lenses/*.js` files (code, TDD, existing test suites extended).

**Tech Stack:** Markdown skill files for the doc tasks. Plain Node.js (`node --test`, zero runtime deps) for the code-health lens tests.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md` — read it if any task below seems to contradict it; the spec wins.
- **Execute this entire plan inside the isolated worktree already created for this task** (`.claude/worktrees/worktree-convention-fix-design`, branch `worktree-worktree-convention-fix-design`) — this repo's `.claude-tweaks/policy.yml` sets `worktree.always: true`, so any `Edit`/`Write`/`git commit` against the main checkout is mechanically denied. Before every task's commit step, run `pwd && git rev-parse --show-toplevel && git branch --show-current` and confirm the path contains `.claude/worktrees/worktree-convention-fix-design` and the branch is `worktree-worktree-convention-fix-design` — do not trust a stated working directory alone.
- Never `git add -A`/`git add .` — stage exact files by name.
- Commit messages: imperative voice, no Conventional Commit prefixes (e.g. `feat:`, `chore:`).
- No placeholders, no "TBD" — every insertion below is the literal text to write.
- Out of scope (per the design doc): no changes to superpowers itself, no new claude-tweaks-side cleanup mechanism, no INBOX item tracking upstream's rototill design, no changes to the seven files verified during brainstorming to need none (`auto-decision-log.md`, `flow/multi-spec.md`, `flow/multispec-review-console.md`, `wrap-up/SKILL.md`, `wrap-up/cleanup-procedures.md`, `tidy/SKILL.md`, `help/context-flow.md`, `subagent-output-contract.md`).

---

### Task 1: `bootstrap-steps.md` — the core two-domain fix

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (Step 6, lines 149-155)

**Interfaces:**
- Produces: the exact phrase `"Two worktree conventions coexist by design, not by drift"` and the exact phrase `"Do not suggest migrating it into \`.worktrees/\`"` — Task 2 does not repeat these verbatim but must not contradict them.

- [ ] **Step 1: Make the edit**

Open `skills/init/bootstrap-steps.md`. Find this exact block:

```
### Step 6 — Worktree Configuration (detailed procedure)

`/claude-tweaks:build worktree` and `/claude-tweaks:flow worktree` use `/superpowers:using-git-worktrees` to create isolated workspaces. The standard worktree directory is `.worktrees/` in the project root — this matches superpowers v5.1.0's preferred path and is the only directory `/superpowers:finishing-a-development-branch` will clean up.

1. Check if `.worktrees/` exists in the project root.
2. If it doesn't exist, create it and verify it's in `.gitignore` (suggest adding if not).
3. If a legacy `.claude/worktrees/` directory exists, suggest migrating to `.worktrees/` so superpowers's cleanup step owns the path.
4. **Base ref** — claude-tweaks branches worktrees from the current local HEAD, but the harness setting `worktree.baseRef` defaults to `fresh` (branches from `origin/<default-branch>`).
```

Replace it with:

```
### Step 6 — Worktree Configuration (detailed procedure)

`/claude-tweaks:build worktree` and `/claude-tweaks:flow worktree` use `/superpowers:using-git-worktrees` to create isolated workspaces. Two worktree conventions coexist by design, not by drift: the native-tool path (e.g. `EnterWorktree` → `.claude/worktrees/`, harness-owned — cleanup is the harness's job, not superpowers') and the git-fallback path (`git worktree add` per `using-git-worktrees` Step 1b, used only when no native tool exists → `.worktrees/` in the project root, superpowers-owned — this is the only directory `/superpowers:finishing-a-development-branch` cleans up). Neither supersedes the other. Anything that needs to detect a worktree should run `git worktree list` or check `GIT_DIR != GIT_COMMON` (see `bin/lib/hooks/worktree-detect.js`) rather than assume a fixed directory name.

1. Check if `.worktrees/` exists in the project root.
2. If it doesn't exist, create it and verify it's in `.gitignore` (suggest adding if not) — this keeps the git-fallback path ready even on projects that primarily use a native tool.
3. If a `.claude/worktrees/` directory exists, leave it alone — it belongs to the native tool's own harness-managed lifecycle, not superpowers'. Do not suggest migrating it into `.worktrees/`: doing so would relocate a live, harness-tracked worktree into the one path superpowers' own cleanup step will later remove, deleting it out from under the harness's bookkeeping.
4. **Base ref** — claude-tweaks branches worktrees from the current local HEAD, but the harness setting `worktree.baseRef` defaults to `fresh` (branches from `origin/<default-branch>`).
```

- [ ] **Step 2: Verify the edit landed**

Run:
```bash
grep -n "Two worktree conventions coexist by design" skills/init/bootstrap-steps.md
grep -F "Do not suggest migrating it into \`.worktrees/\`" skills/init/bootstrap-steps.md
grep -c "legacy" skills/init/bootstrap-steps.md
```
Expected: first two each print exactly one matching line. Third prints `0` — the word "legacy" (describing `.claude/worktrees/`) must be fully gone from this file after the edit (note: `0` is expected specifically because this file has no other "legacy" mentions — if this repo's copy of the file has since gained an unrelated "legacy" reference elsewhere, treat a nonzero count as a signal to inspect, not a failure to force to zero).

- [ ] **Step 3: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Replace single-winner worktree directory framing with two-domain description"
```

---

### Task 2: `init/SKILL.md` + `summary-templates.md` — downstream consistency

**Files:**
- Modify: `skills/init/SKILL.md` (Step 6 summary line)
- Modify: `skills/init/summary-templates.md` (Phase 9 health-check row)

**Interfaces:**
- Consumes: Task 1's two-domain framing (this task must not contradict it, but does not need to repeat Task 1's exact wording).

- [ ] **Step 1: Edit `init/SKILL.md`'s Step 6 summary**

Find this exact block:

```
### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root; suggest migration if a legacy `.claude/worktrees/` is found. Also offers the `worktree.always` policy opt-in (recommended default: on) — the decision is queued here but the file write is deferred to avoid this same run denying its own later writes; see "Finalizing the worktree.always Decision" and "Worktree Policy Finalization" below. Read `bootstrap-steps.md` (Step 6) for the full procedure.
```

Replace it with:

```
### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root for the git-fallback path; leave any `.claude/worktrees/` directory alone as a separate, harness-owned convention that needs no migration. Also offers the `worktree.always` policy opt-in (recommended default: on) — the decision is queued here but the file write is deferred to avoid this same run denying its own later writes; see "Finalizing the worktree.always Decision" and "Worktree Policy Finalization" below. Read `bootstrap-steps.md` (Step 6) for the full procedure.
```

- [ ] **Step 2: Edit `summary-templates.md`'s health-check row**

Find this exact block:

```
| Node (statusline) | v{X} present |
| Statusline | wired to claude-tweaks wrapper |
| Workflow dirs (`specs/`, `docs/`, `.worktrees/`) | present |
```

Replace it with:

```
| Node (statusline) | v{X} present |
| Statusline | wired to claude-tweaks wrapper |
| Workflow dirs (`specs/`, `docs/`) | present |
```

- [ ] **Step 3: Verify both edits landed**

Run:
```bash
grep -n "leave any \`.claude/worktrees/\` directory alone as a separate, harness-owned convention" skills/init/SKILL.md
grep -n "Workflow dirs (\`specs/\`, \`docs/\`)" skills/init/summary-templates.md
grep -c "\`.worktrees/\`) | present" skills/init/summary-templates.md
```
Expected: first two each print exactly one matching line. Third prints `0` — confirms the old three-item row (with `.worktrees/`) is fully gone, not just shadowed by the new two-item row.

- [ ] **Step 4: Commit**

```bash
git add skills/init/SKILL.md skills/init/summary-templates.md
git commit -m "Align init/SKILL.md and summary-templates.md with the two-domain worktree description"
```

---

### Task 3: `/code-health` `SKIP_DIRS` fix — 4 lenses, TDD

**Files:**
- Modify: `bin/lib/code-health/lenses/oversized-file.js`, `bin/lib/code-health/lenses/dead-export.js`, `bin/lib/code-health/lenses/todo-comments.js`, `bin/lib/code-health/lenses/dependency-freshness.js`
- Test: `bin/lib/code-health/tests/oversized-file.test.js`, `bin/lib/code-health/tests/dead-export.test.js`, `bin/lib/code-health/tests/todo-comments.test.js`, `bin/lib/code-health/tests/dependency-freshness.test.js`

**Interfaces:**
- Produces: each lens's `SKIP_DIRS` set gains `'.claude'` (all four sets become `new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks'])`). No other lens exports change.

All four lenses share an identical `SKIP_DIRS` line and an identical `.claude-tweaks` self-pollution-guard test idiom already in their test files — this task repeats the same RED/GREEN pair four times, once per lens, following each file's own existing test style exactly.

- [ ] **Step 1: Write the failing test — `oversized-file.test.js`**

Open `bin/lib/code-health/tests/oversized-file.test.js`. Find this exact block (the file's last test):

```js
test('respects .claude-tweaks self-pollution guard', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});
```

Replace it with (adds one new test immediately after the existing one, byte-identical existing test preserved):

```js
test('respects .claude-tweaks self-pollution guard', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'big.js'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --test bin/lib/code-health/tests/oversized-file.test.js
```
Expected: FAIL — the new test reports 1 finding instead of 0, because `.claude` is not yet in `SKIP_DIRS`.

- [ ] **Step 3: Implement — `oversized-file.js`**

Find this exact line:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

Replace it with:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node --test bin/lib/code-health/tests/oversized-file.test.js
```
Expected: PASS — all tests in the file, including the new one, pass.

- [ ] **Step 5: Write the failing test — `dead-export.test.js`**

Open `bin/lib/code-health/tests/dead-export.test.js`. Find this exact block (the file's last test):

```js
test('import type { X } does not count as dead export', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'types.ts'), 'export const Foo = {};\n');
  fs.writeFileSync(path.join(root, 'consumer.ts'), "import type { Foo } from './types';\n");
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 0, 'Foo should not be flagged as dead when imported via import type');
});
```

Replace it with:

```js
test('import type { X } does not count as dead export', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'types.ts'), 'export const Foo = {};\n');
  fs.writeFileSync(path.join(root, 'consumer.ts'), "import type { Foo } from './types';\n");
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 0, 'Foo should not be flagged as dead when imported via import type');
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'x.js'), 'export const orphan = 1;\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
node --test bin/lib/code-health/tests/dead-export.test.js
```
Expected: FAIL — the new test reports 1 finding instead of 0.

- [ ] **Step 7: Implement — `dead-export.js`**

Find this exact line:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

Replace it with:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

- [ ] **Step 8: Run it to verify it passes**

```bash
node --test bin/lib/code-health/tests/dead-export.test.js
```
Expected: PASS — all tests in the file pass.

- [ ] **Step 9: Write the failing test — `todo-comments.test.js`**

Open `bin/lib/code-health/tests/todo-comments.test.js`. Find this exact block (the file's last test):

```js
test('skips node_modules and .git', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'node_modules', 'p'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'p', 'i.js'), '// TODO: vendored\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

Replace it with:

```js
test('skips node_modules and .git', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'node_modules', 'p'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'p', 'i.js'), '// TODO: vendored\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'i.js'), '// TODO: in another session\'s worktree\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

- [ ] **Step 10: Run it to verify it fails**

```bash
node --test bin/lib/code-health/tests/todo-comments.test.js
```
Expected: FAIL — the new test reports 1 finding instead of 0.

- [ ] **Step 11: Implement — `todo-comments.js`**

Find this exact line:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

Replace it with:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

- [ ] **Step 12: Run it to verify it passes**

```bash
node --test bin/lib/code-health/tests/todo-comments.test.js
```
Expected: PASS — all tests in the file pass.

- [ ] **Step 13: Write the failing test — `dependency-freshness.test.js`**

Open `bin/lib/code-health/tests/dependency-freshness.test.js`. Find this exact block (the file's last test):

```js
test('no package.json yields no findings', () => {
  assert.strictEqual(lens.run(AREA, tmp()).length, 0);
});
```

Replace it with:

```js
test('no package.json yields no findings', () => {
  assert.strictEqual(lens.run(AREA, tmp()).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'package.json'), JSON.stringify({
    dependencies: { wild: '*' },
  }));
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
```

- [ ] **Step 14: Run it to verify it fails**

```bash
node --test bin/lib/code-health/tests/dependency-freshness.test.js
```
Expected: FAIL — the new test reports 1 finding instead of 0.

- [ ] **Step 15: Implement — `dependency-freshness.js`**

Find this exact line:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

Replace it with:

```js
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']);
```

- [ ] **Step 16: Run it to verify it passes**

```bash
node --test bin/lib/code-health/tests/dependency-freshness.test.js
```
Expected: PASS — all tests in the file pass.

- [ ] **Step 17: Run the full code-health test suite as a regression guard**

```bash
node --test bin/lib/code-health/tests/*.test.js
```
Expected: all tests pass — this task only added `.claude` to four already-tested `SKIP_DIRS` sets; no other lens behavior should change.

- [ ] **Step 18: Commit**

```bash
git add bin/lib/code-health/lenses/oversized-file.js bin/lib/code-health/lenses/dead-export.js bin/lib/code-health/lenses/todo-comments.js bin/lib/code-health/lenses/dependency-freshness.js bin/lib/code-health/tests/oversized-file.test.js bin/lib/code-health/tests/dead-export.test.js bin/lib/code-health/tests/todo-comments.test.js bin/lib/code-health/tests/dependency-freshness.test.js
git commit -m "Add .claude to code-health SKIP_DIRS so scans don't walk other sessions' worktrees"
```

---

### Task 4: Final regression + cross-file consistency check

**Files:**
- None modified — verification only.

- [ ] **Step 1: Run the full project test suite**

```bash
npm test
```
Expected: all tests pass, or the single pre-existing flaky `tests/statusline.test.js` timing test under concurrent load (unrelated to this change) — any other failure is unexpected since this plan touches only markdown files plus four already-tested lens modules.

- [ ] **Step 2: Cross-file consistency check**

```bash
grep -c "legacy" skills/init/bootstrap-steps.md skills/init/SKILL.md
grep -rn "'.claude'" bin/lib/code-health/lenses/oversized-file.js bin/lib/code-health/lenses/dead-export.js bin/lib/code-health/lenses/todo-comments.js bin/lib/code-health/lenses/dependency-freshness.js
```
Expected: first command prints `0` for both files (no lingering "legacy" framing for `.claude/worktrees/` in either init file). Second command prints one matching line per file (4 total), confirming all four `SKIP_DIRS` sets were updated identically.

No commit for this task — it is verification only, over commits already made in Tasks 1-3.

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's core two-domain fix in `bootstrap-steps.md`. Task 2 covers `init/SKILL.md` and `summary-templates.md`. Task 3 covers the `bin/lib/code-health/lenses/*.js` fix with TDD. Task 4 covers the design's "Testing" section's regression-guard requirement. The design's "Out of scope" list names seven files needing no change — none of them appear in any task above, matching the design's own scoping.
- **No placeholders:** every task step gives literal find/replace text or literal shell commands with literal expected output — verified by re-scanning this plan for "TBD"/"add appropriate"/vague steps before finalizing.
- **Type/interface consistency:** the `SKIP_DIRS` array literal (`['node_modules', '.git', '.worktrees', '.claude', 'dist', 'build', 'coverage', '.claude-tweaks']`) is identical across all four Task 3 edits — verified by literal copy-paste between each Step, not paraphrase.
