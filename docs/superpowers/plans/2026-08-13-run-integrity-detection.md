# Run-Integrity Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag pipeline runs whose work already shipped while bookkeeping stayed open (`shipped-unclosed`), surfaced through the existing SessionStart unfinished-runs scan.

**Architecture:** One new pure read-side module `bin/lib/hooks/run-integrity.js` exporting `checkRunIntegrity(runDir)`. It validates `run-state.json`, derives the branch from the recorded worktree path, checks merged-evidence (ancestry, then `git cherry` patch-equivalence), and reads `events.jsonl` for `skill_invoked` events. `session-start.js` calls it per enumerated stale run — inside the existing stale-runs block, which already executes BEFORE the reaper block (the required ordering). Every indeterminate answer forces `in-progress` (fail-open, per-field).

**Tech Stack:** Node built-ins + in-repo helpers (`git-exec.js`'s `runGit`, `worktree-reap.js`'s `parseWorktreeList`/`resolveIntegrationBranch`). Tests via `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-13T201329-spec-371-372-373/spec-372/work/372-spec.md` (materialized from GitHub issue #372 — includes the measured-boundary addendum from #371's landed implementation; the module header must state those boundaries)

## Global Constraints

- **Pure read-side:** no writes to run state, no event appends, no git mutations. `git worktree list`, `rev-parse`, `merge-base --is-ancestor`, `cherry`, `branch --show-current` only.
- **Never break a session:** SessionStart is inform-tier; every path exits 0, no throws escape the module.
- **Fail-open is per-field:** any `null` evidence field forces `in-progress`. Branch deletion alone is NEVER merged-evidence.
- **Landed event shape (verified against #371's implementation):** one JSON object per line; match `type === 'skill_invoked'` and `skill === 'claude-tweaks:wrap-up'` on FIELDS — key order varies (`ts`/`type` are last) and unowned lines carry an extra `attribution` field. Never match on line shape.
- **Never hardcode `main`** — integration branch via `worktree-reap.js`'s `resolveIntegrationBranch` (the existing cited resolver; do NOT write a new one — `tests/integration-branch-conformance.test.js` fails on un-cited resolvers). Local refs only, no fetch.
- **Byte-identical output** for genuinely in-progress runs — the existing SessionStart line format must not change for them.
- Fixtures use real git repos, full-length SHAs where asserted, real `skill_invoked` lines; the squash fixture uses an actual `git merge --squash` (`[IL-122]`).
- **Commit messages:** `refs #372` — NEVER closing keywords.
- No new package dependencies.

---

### Task 1: run-integrity.js module + unit suite + consumer row

**Files:**
- Create: `bin/lib/hooks/run-integrity.js`
- Create: `tests/run-integrity.test.js`
- Modify: `skills/_shared/integration-branch.md` (add the consumer row — this module is a new rank-6 consumer)

**Interfaces:**
- Consumes: `runGit(args, cwd)` → `{stdout, failure}` (failure: `'timeout'|'spawn'|'no-git'|'git-error'|null`; ONLY `git-error` is a definitive negative answer — `merge-base --is-ancestor` exits 1 (→ `git-error`) for "not an ancestor", so indeterminate kinds must map to `null` evidence, not `false`); `parseWorktreeList(porcelain)` → `[{path, branch, locked, ...}]`; `resolveIntegrationBranch(repoRoot)` → `string|null`.
- Produces: `checkRunIntegrity(runDir)` → `{ state: 'in-progress'|'shipped-unclosed', evidence: { branch: string|null, merged: 'ancestor'|'cherry'|false|null, ledgerActive: boolean|null, wrapupInvoked: boolean|null } }` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/run-integrity.test.js`. Fixture builder (real git, tmpdir):

```js
// tests/run-integrity.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkRunIntegrity } = require('../bin/lib/hooks/run-integrity');

function sh(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A main-checkout repo with an integration branch (named "trunk" — never "main",
// resolved via policy.yml's integration-branch key), one linked worktree on a
// feature branch with one commit, and one active run dir recording that worktree.
function fixtureRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-')));
  execFileSync('git', ['init', '-q', '-b', 'trunk', root]);
  sh(root, 'config', 'user.email', 't@example.com');
  sh(root, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  sh(root, 'add', 'a.txt');
  sh(root, 'commit', '-q', '-m', 'base');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-branch: trunk\n');
  const wt = path.join(root, '.claude', 'worktrees', 'feat');
  sh(root, 'worktree', 'add', '-q', '-b', 'feat-branch', wt);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'feature\n');
  sh(wt, 'add', 'b.txt');
  sh(wt, 'commit', '-q', '-m', 'feature work');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(runDir, { recursive: true });
  writeRunState(runDir, { status: 'active', worktree: wt });
  return { root, wt, runDir };
}

function writeRunState(runDir, state) {
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(state));
}

// Real landed event-line shapes from #371 (field order matters not; extra fields tolerated).
const EV_BUILD = '{"skill":"claude-tweaks:build","ts":"2026-08-01T09:05:00.000Z","type":"skill_invoked"}';
const EV_BUILD_FALLBACK = '{"skill":"claude-tweaks:build","attribution":"fallback","ts":"2026-08-01T09:05:00.000Z","type":"skill_invoked"}';
const EV_WRAPUP = '{"skill":"claude-tweaks:wrap-up","ts":"2026-08-01T09:50:00.000Z","type":"skill_invoked"}';
const EV_OTHER = '{"path":"/x","ts":"2026-08-01T09:00:00.000Z","type":"commit"}';

function writeEvents(runDir, lines) {
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), lines.join('\n') + '\n');
}

test('AC1: merged (ancestor) + active + non-wrap-up skill_invoked -> shipped-unclosed', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch'); // fast-forward or merge — either way ancestor
  writeEvents(runDir, [EV_OTHER, EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.branch, 'feat-branch');
  assert.strictEqual(r.evidence.merged, 'ancestor');
  assert.strictEqual(r.evidence.ledgerActive, true);
  assert.strictEqual(r.evidence.wrapupInvoked, false);
});

test('AC2: squash-merged (ancestry false, cherry all applied) -> shipped-unclosed via cherry', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--squash', 'feat-branch');
  sh(root, 'commit', '-q', '-m', 'squash: feature work');
  writeEvents(runDir, [EV_BUILD_FALLBACK]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'shipped-unclosed');
  assert.strictEqual(r.evidence.merged, 'cherry');
});

test('AC3a: branch unmerged -> in-progress', () => {
  const { runDir } = fixtureRepo();
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.merged, false);
});

test('AC3b: worktree + branch deleted, no other signal -> in-progress (deletion is never evidence)', () => {
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'worktree', 'remove', '--force', wt);
  sh(root, 'branch', '-q', '-D', 'feat-branch');
  writeEvents(runDir, [EV_BUILD]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.branch, null);
});

test('AC4a: merged but wrap-up event present -> in-progress', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_BUILD, EV_WRAPUP]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.wrapupInvoked, true);
});

test('AC4b: merged but zero skill_invoked events of any kind -> in-progress (pre-ledger run)', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_OTHER]);
  const r = checkRunIntegrity(runDir);
  assert.strictEqual(r.state, 'in-progress');
  assert.strictEqual(r.evidence.ledgerActive, false);
});

test('AC5: each fail-open input -> in-progress, no throw', () => {
  // absent run-state.json
  const f1 = fixtureRepo();
  fs.unlinkSync(path.join(f1.runDir, 'run-state.json'));
  assert.strictEqual(checkRunIntegrity(f1.runDir).state, 'in-progress');
  // wrong shapes
  for (const bad of ['{}', '[]', '{"status":"weird","worktree":"/x"}', JSON.stringify({ status: 'active', worktree: '' })]) {
    const f = fixtureRepo();
    fs.writeFileSync(path.join(f.runDir, 'run-state.json'), bad);
    assert.strictEqual(checkRunIntegrity(f.runDir).state, 'in-progress');
  }
  // recorded path gone
  const f2 = fixtureRepo();
  writeRunState(f2.runDir, { status: 'active', worktree: path.join(f2.root, 'nope') });
  assert.strictEqual(checkRunIntegrity(f2.runDir).state, 'in-progress');
  // detached HEAD in the worktree
  const f3 = fixtureRepo();
  sh(f3.wt, 'checkout', '-q', '--detach');
  writeEvents(f3.runDir, [EV_BUILD]);
  assert.strictEqual(checkRunIntegrity(f3.runDir).state, 'in-progress');
  // git failure: run dir tree that is not a repo at all
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ri-bare-'));
  const fakeRun = path.join(bare, '.claude-tweaks', 'pipelines', '2026-08-01T090000-spec-9');
  fs.mkdirSync(fakeRun, { recursive: true });
  writeRunState(fakeRun, { status: 'active', worktree: bare });
  assert.strictEqual(checkRunIntegrity(fakeRun).state, 'in-progress');
  // missing events.jsonl (merged branch, but no log at all)
  const f4 = fixtureRepo();
  sh(f4.root, 'merge', '-q', '--no-edit', 'feat-branch');
  assert.strictEqual(checkRunIntegrity(f4.runDir).state, 'in-progress');
});

test('interrupted status is in the non-terminal set (verdict can fire on it)', () => {
  const { root, wt, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeRunState(runDir, { status: 'interrupted', worktree: wt });
  writeEvents(runDir, [EV_BUILD]);
  assert.strictEqual(checkRunIntegrity(runDir).state, 'shipped-unclosed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/run-integrity.test.js`
Expected: FAIL — module does not exist (`Cannot find module`).

- [ ] **Step 3: Implement the module**

Create `bin/lib/hooks/run-integrity.js`:

```js
// bin/lib/hooks/run-integrity.js — run-integrity detection (inform tier, read-only).
// Distinguishes a run genuinely in progress from one whose work already shipped
// while bookkeeping stayed open (#364's failure mode). Pure read side: no writes,
// no event appends, no git mutations, no fetch (SessionStart must be offline-safe).
//
// Fail-open is per-field: every evidence field that cannot be determined is null,
// and any null forces 'in-progress'. A wrong verdict here costs one misleading
// advisory line, so every ambiguity resolves toward NOT alarming.
//
// Measured boundaries inherited from #371's ledger (see that spec's
// work/task0-findings.md): skill_invoked events exist only for MODEL-INITIATED
// Skill tool calls — a human typing /claude-tweaks:wrap-up leaves no event, and
// runs predating the ledger have none at all. Both are why the verdict requires
// at least one skill_invoked of any kind (pre-ledger precondition) and treats a
// present wrap-up event as proof the procedure ran; absence of a wrap-up event
// alone is never a verdict. Subagent Skill calls ARE visible (parent-session
// hooks, agent-tagged in the payload), so dispatch-driven wrap-ups do register.
'use strict';
const fs = require('fs');
const path = require('path');
const { runGit } = require('./git-exec');
const { parseWorktreeList, resolveIntegrationBranch } = require('./worktree-reap');

const NON_TERMINAL = new Set(['active', 'interrupted']);
const RUN_STATE_STATUSES = new Set(['active', 'interrupted', 'clean']);
const WRAP_UP_SKILL = 'claude-tweaks:wrap-up';

// run dirs live at {root}/.claude-tweaks/pipelines/{run-id} by anchoring
// (_shared/pipeline-run-dir.md), so the repo root is three levels up.
function repoRootOf(runDir) {
  return path.resolve(runDir, '..', '..', '..');
}

// Field contract per [IL-123]: validate fields, not typeof object.
function readValidatedRunState(runDir) {
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8')); } catch { return null; }
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  if (!RUN_STATE_STATUSES.has(state.status)) return null;
  if ('worktree' in state && (typeof state.worktree !== 'string' || state.worktree === '')) return null;
  return state;
}

// Branch from the recorded worktree PATH (run-state.json stores no branch).
// Prefer asking the worktree directly; fall back to matching the porcelain
// list on path. Detached HEAD, missing path, or any git failure -> null.
function deriveBranch(root, worktreePath) {
  if (!worktreePath) return null;
  const direct = runGit(['branch', '--show-current'], worktreePath);
  if (!direct.failure && direct.stdout) return direct.stdout;
  const list = runGit(['worktree', 'list', '--porcelain'], root);
  if (list.failure || list.stdout === null) return null;
  let target = worktreePath;
  try { target = fs.realpathSync(worktreePath); } catch { /* keep recorded form */ }
  const entry = parseWorktreeList(list.stdout).find((e) => e.path === worktreePath || e.path === target);
  return entry && entry.branch ? entry.branch : null;
}

// 'ancestor' | 'cherry' | false (definitively unmerged) | null (indeterminate).
// merge-base --is-ancestor answers via exit code: 0 = ancestor (success), 1 =
// not an ancestor (classified 'git-error' by runGit — the one failure kind that
// is a real answer). Indeterminate kinds (timeout/spawn/no-git) -> null.
function mergedEvidence(root, branch, integration) {
  const anc = runGit(['merge-base', '--is-ancestor', branch, integration], root);
  if (!anc.failure) return 'ancestor';
  if (anc.failure !== 'git-error') return null;
  const cherry = runGit(['cherry', integration, branch], root);
  if (cherry.failure || cherry.stdout === null) return null;
  const lines = cherry.stdout.split('\n').filter(Boolean);
  if (lines.length === 0) return false; // no commits to compare — never evidence
  return lines.every((l) => l.startsWith('-')) ? 'cherry' : false;
}

// events.jsonl scan; missing file or unreadable -> null (indeterminate).
function scanSkillEvents(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'); } catch { return null; }
  let any = false;
  let wrapup = false;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.type !== 'skill_invoked') continue;
    any = true;
    if (ev.skill === WRAP_UP_SKILL) wrapup = true;
  }
  return { any, wrapup };
}

function checkRunIntegrity(runDir) {
  const evidence = { branch: null, merged: null, ledgerActive: null, wrapupInvoked: null };
  const inProgress = { state: 'in-progress', evidence };
  try {
    const state = readValidatedRunState(runDir);
    if (!state || !NON_TERMINAL.has(state.status)) return inProgress;
    const root = repoRootOf(runDir);
    evidence.branch = deriveBranch(root, state.worktree || null);
    if (!evidence.branch) return inProgress;
    const integration = resolveIntegrationBranch(root);
    if (!integration) return inProgress;
    evidence.merged = mergedEvidence(root, evidence.branch, integration);
    if (evidence.merged !== 'ancestor' && evidence.merged !== 'cherry') return inProgress;
    const events = scanSkillEvents(runDir);
    if (!events) return inProgress;
    evidence.ledgerActive = events.any;
    evidence.wrapupInvoked = events.wrapup;
    if (!events.any) return inProgress;   // pre-ledger run — a log the ledger never wrote to proves nothing
    if (events.wrapup) return inProgress; // wrap-up ran; close-run lag is not drift worth alarming on
    return { state: 'shipped-unclosed', evidence };
  } catch {
    return inProgress;
  }
}

module.exports = { checkRunIntegrity };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS (all). If AC2's cherry path fails, debug against the real squash fixture — do not weaken the fixture to synthetic diffs.

- [ ] **Step 5: Add the consumer row to `skills/_shared/integration-branch.md`**

In the `## Per-consumer fallback` table, add after the SessionStart worktree reaper row:

```markdown
| `SessionStart` run-integrity check (`bin/lib/hooks/session-start.js` → `bin/lib/hooks/run-integrity.js`) | The branch a run's recorded worktree must be merged into before the run is flagged `shipped-unclosed` | **Flag nothing** (every run reads `in-progress`). Same rank restriction as the reaper row above — rank 3 and rank 5's GitHub-default half only, current-branch half excluded — via the same shared resolver (`worktree-reap.js`'s `resolveIntegrationBranch`). Nothing resolved means no safe measurement; here a wrong measurement is one misleading advisory line, but the fail-open direction is kept identical to the reaper's for the same anti-pattern reasons |
```

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/run-integrity.js tests/run-integrity.test.js skills/_shared/integration-branch.md
git commit -m "Add run-integrity detection module: shipped-unclosed vs in-progress — refs #372"
```

---

### Task 2: session-start.js integration + rendering tests

**Files:**
- Modify: `bin/lib/hooks/session-start.js` (stale-runs block only)
- Test: `tests/run-integrity.test.js` (append SessionStart rendering tests — same file, the module and its one caller share fixtures)

**Interfaces:**
- Consumes: `checkRunIntegrity(runDir)` from Task 1.
- Produces: extended SessionStart message — only `shipped-unclosed` runs get new text.

- [ ] **Step 1: Write the failing tests**

Append to `tests/run-integrity.test.js` (spawn the real dispatcher, pattern from `tests/hooks-dispatcher.test.js`):

```js
const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');
function runSessionStart(cwd) {
  try {
    const stdout = execFileSync('node', [HOOKS, 'session-start'], {
      input: JSON.stringify({ cwd }), cwd, encoding: 'utf8',
      env: { ...process.env, PIPELINE_RUN_DIR: '' },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

test('SessionStart: shipped-unclosed run line names both remediations (AC1 message half)', () => {
  const { root, runDir } = fixtureRepo();
  sh(root, 'merge', '-q', '--no-edit', 'feat-branch');
  writeEvents(runDir, [EV_BUILD]);
  const r = runSessionStart(root);
  assert.strictEqual(r.code, 0);
  const ctxOut = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctxOut, /appears shipped/);
  assert.match(ctxOut, /\/claude-tweaks:wrap-up/);
  assert.match(ctxOut, /close-run --run/);
});

test('SessionStart: genuinely in-progress run line is byte-identical to the pre-change format (AC6 half)', () => {
  const { runDir, root } = fixtureRepo(); // unmerged branch -> in-progress
  writeEvents(runDir, [EV_BUILD]);
  const r = runSessionStart(root);
  assert.strictEqual(r.code, 0);
  const ctxOut = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  const base = path.basename(runDir);
  assert.ok(ctxOut.includes(`- ${base} (status: active)`), `expected the unchanged line, got: ${ctxOut}`);
  assert.ok(!ctxOut.includes('appears shipped'), 'in-progress run must not carry the new text');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/run-integrity.test.js`
Expected: the first new test FAILS (no "appears shipped" text exists); the second passes vacuously (that is fine — it is the regression pin).

- [ ] **Step 3: Integrate into session-start.js**

In `bin/lib/hooks/session-start.js`, inside the existing stale-runs `try` block (which already runs BEFORE the reaper block — the ordering the spec's Gotcha requires; add a one-line comment stating that ordering is load-bearing), extend the `lines` mapping:

```js
const runIntegrity = require('./run-integrity');
```

and replace the `const lines = stale.map(...)` expression with:

```js
const lines = stale.map(({ dir, state }) => {
  const base = `- ${path.basename(dir)} (status: ${(state && state.status) || 'unknown'})`;
  try {
    const verdict = runIntegrity.checkRunIntegrity(dir);
    if (verdict.state === 'shipped-unclosed') {
      // Evidence names what was checked so the reader can judge the claim.
      const how = verdict.evidence.merged === 'cherry' ? 'squash/rebase-equivalent' : 'merged';
      return (
        `${base} — work appears shipped (branch ${verdict.evidence.branch} ${how} into the integration branch, ` +
        'no wrap-up recorded): close out with /claude-tweaks:wrap-up, or bookkeeping-only: ' +
        `node "${process.env.CLAUDE_PLUGIN_ROOT || '${CLAUDE_PLUGIN_ROOT}'}/bin/hooks.js" close-run --run ${dir}`
      );
    }
  } catch { /* integrity check is advisory — never break the scan */ }
  return base;
});
```

(Keep the surrounding block otherwise byte-identical — the trailing "Review {run}/decisions.md…" line and the header line do not change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/run-integrity.test.js`
Expected: PASS (all, including Task 1's).

Run: `node --test tests/hooks-dispatcher.test.js tests/hooks-session-start.test.js 2>/dev/null || node --test tests/hooks-dispatcher.test.js`
Expected: PASS — if a dedicated session-start suite exists (check `ls tests/ | grep session`), run it too; its existing expectations must pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/hooks/session-start.js tests/run-integrity.test.js
git commit -m "Surface shipped-unclosed verdict in SessionStart unfinished-runs scan — refs #372"
```

---

### Task 3: Full-suite verification

- [ ] **Step 1:** Run `npm test` (redirect to a file, inspect the tail). Expected: PASS.
- [ ] **Step 2:** Map ACs: AC1 → Task 1 AC1 test + Task 2 message test; AC2 → cherry test; AC3 → AC3a/AC3b; AC4 → AC4a/AC4b; AC5 → fail-open battery; AC6 → full suite + byte-identical regression test.
- [ ] **Step 3:** Commit fixes only if Step 1 surfaced failures caused by this build (`Fix {what} — refs #372`).
