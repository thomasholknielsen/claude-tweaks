# Record 686 — release-claim and log-decision CLI wrappers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-sequenced claim-release (`node -e` + `gh api PUT` + `gh issue comment` + `gh issue edit`) and the ad-hoc `decisions.md` appends with two thin CLIs — `bin/release-claim.js` and `bin/log-decision.js` — each backed by an injectable-runner module under `bin/lib/`, and cite them from every skill site that currently prose-describes the sequence.

**Architecture:** Two new `bin/lib/{name}/` modules (`bin/lib/log-decision/append.js`, `bin/lib/release-claim/release.js`) hold all logic behind `deps`/`runner` seams; two thin CLIs (`bin/log-decision.js`, `bin/release-claim.js`) parse argv and map outcomes to a documented exit-code contract. `bin/lib/reconcile/release-merged.js` stops composing its own tombstone `PUT` and calls the shared `writeTombstone` so there is one write path for every release. Prose in `wrap-up/cleanup-procedures.md` Section E, `flow/multispec-review-console.md`'s Shared teardown, `dispatch/settle-and-merge.md`, `_shared/issue-claims.md`, and `_shared/auto-decision-log.md` cites the CLIs instead of inlining `node -e` + `gh api` blocks.

**Tech Stack:** Node 18+ (no deps), `node --test`, `gh` CLI via `execFileSync` argv arrays.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T210742-spec-686-687-688-689-690-691-692-693/spec-686/work/686-spec.md`

## Global Constraints

- Follow the `gh-api-module-pattern` project skill (`.claude/skills/gh-api-module-pattern/SKILL.md`): injectable `runner(args)` invoked as `gh ${args.join(' ')}`; `defaultRunner = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })`; CLI logic in exported `run(argv, deps)`; `require.main === module` sets `process.exitCode`; `--help` short-circuits before any availability probe; every `deps` call that can throw is try/caught into the exit-code contract.
- `gh api` value mechanisms: contents-API fields (`message`, `content`, `branch`, `sha`) are already-resolved strings → `-f`. `repos/{owner}/{repo}/…` paths are built from a resolved `owner`/`repo` pair (from `--repo` or `git remote get-url origin`, exactly as `bin/link-records.js`'s `parseRepo` does).
- Multi-file modules live in `bin/lib/{name}/` as flat sibling directories (CLAUDE.md `## Structure`) — never a nested `_shared/`.
- Never write the literal placeholder tokens `TBD`/`TODO` into any skill prose.
- `skills/flow/multispec-review-console.md` is at 40,956 of a 40,960-byte ceiling (`tests/console-on-pr.test.js`); every edit there must net-shrink the file. Re-measure `wc -c` after editing.
- Commit message style: `{Verb} {what} — {detail}`; use `refs #686` (never `closes`/`fixes`) in commit bodies. Every commit ends with `Claude-Session: https://claude.ai/code/session_013PMKMjSUXzgFEP3jc6rrmV`.
- Work from the worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-686-687-688-689-690-691-692-693` — verify with `pwd` + `git rev-parse --show-toplevel` before any commit. Run only the targeted suites listed per task; the full `npm test` runs centrally after the build.

---

### Task 1: `bin/lib/log-decision/append.js` — entry formatter + anchored append

**Files:**
- Create: `bin/lib/log-decision/append.js`
- Test: `tests/bin-lib/log-decision/append.test.js`

**Interfaces:**
- Consumes: `mainCheckoutRoot(p)` from `bin/lib/hooks/worktree-detect.js` (returns the main checkout root for a path inside a linked worktree, the repo root inside the main checkout, or `null`).
- Produces:
  - `formatEntry({ status, now, step, spec, text, reversibility, lever })` → string, one line, no trailing newline. `status ∈ {'AUTO','STAGED','KEPT-PROMPT','SCANNED'}`; `now` epoch ms (local `HH:MM:SS`); location = `step` if given, else `spec #{spec}` if given, else `log-decision`; when both given → `spec #{spec} — {step}`; `text` trimmed with a trailing period added if missing; `Reversibility: {reversibility}` (default `n/a`); optional ` [lever: {lever}]` last.
  - `resolveTarget({ runDir, cwd, mainRoot })` → `{ ok: true, file }` or `{ ok: false, reason: 'not-anchored' | 'missing' }`. `mainRoot` defaults to `mainCheckoutRoot(cwd)`; when `mainRoot` is `null` the check is skipped (fall back to accepting an existing dir). `runDir` must exist as a directory and its realpath must start with `mainRoot + path.sep`.
  - `appendEntry({ runDir, section, entry })` → `{ file, created }`. Creates `decisions.md` when absent; when `section` given (e.g. `/wrap-up`), ensures a `## {section}` heading exists (appended if absent) and inserts the entry at the end of that section (before the next `^## ` line, or at EOF); no section → append at EOF.
  - `STATUSES` array export.

- [ ] **Step 1: Write the failing test**

```js
// tests/bin-lib/log-decision/append.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatEntry, resolveTarget, appendEntry, STATUSES } = require('../../../bin/lib/log-decision/append');

// The schema line _shared/auto-decision-log.md documents — a test-side parser, so
// every entry the module emits is proven readable by the documented shape.
const SCHEMA = /^- (AUTO|STAGED|KEPT-PROMPT|SCANNED) (\d{2}:\d{2}:\d{2}) — (.+?): (.+)\. Reversibility: (high|med|low|n\/a)(?:[^\[]*)?( \[lever: .+\])?$/;

const NOW = new Date(2026, 7, 16, 14, 32, 14).getTime(); // local 14:32:14

test('formatEntry: AUTO line with step + spec matches the documented schema', () => {
  const line = formatEntry({ status: 'AUTO', now: NOW, step: 'Section E', spec: 12, text: 'released claim', reversibility: 'high' });
  assert.equal(line, '- AUTO 14:32:14 — spec #12 — Section E: released claim. Reversibility: high.');
  assert.match(line, SCHEMA);
});

test('formatEntry: spec-only location, default reversibility n/a, lever last', () => {
  const line = formatEntry({ status: 'STAGED', now: NOW, spec: 12, text: 'x.', lever: 'scope-creep=add-to-plan (policy)' });
  assert.equal(line, '- STAGED 14:32:14 — spec #12: x. Reversibility: n/a. [lever: scope-creep=add-to-plan (policy)]');
  assert.match(line, SCHEMA);
});

test('formatEntry: no step/spec falls back to log-decision; rejects unknown status', () => {
  assert.match(formatEntry({ status: 'SCANNED', now: NOW, text: 'swept 3 files' }), /— log-decision: swept 3 files\. Reversibility: n\/a\.$/);
  assert.throws(() => formatEntry({ status: 'MAYBE', now: NOW, text: 'x' }), /status/);
  assert.deepEqual(STATUSES, ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED']);
});

test('resolveTarget: run dir under mainRoot ok; under a linked worktree not-anchored; missing dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-'));
  const main = path.join(root, 'main');
  const wt = path.join(root, 'main', '.claude', 'worktrees', 'wt');
  const good = path.join(main, '.claude-tweaks', 'pipelines', 'run-a');
  const shadow = path.join(wt, '.claude-tweaks', 'pipelines', 'run-a');
  fs.mkdirSync(good, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  // mainRoot injected: the shadow lives *under* main on disk, so anchoring must
  // compare against the main root AND reject the worktree admin subtree.
  assert.deepEqual(resolveTarget({ runDir: good, mainRoot: main }).ok, true);
  const bad = resolveTarget({ runDir: shadow, mainRoot: main });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not-anchored');
  assert.deepEqual(resolveTarget({ runDir: path.join(main, 'nope'), mainRoot: main }), { ok: false, reason: 'missing' });
});

test('appendEntry: creates the file, then inserts under the named section before the next heading', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-run-'));
  const r1 = appendEntry({ runDir, section: '/build', entry: '- AUTO 10:00:00 — a: b. Reversibility: high.' });
  assert.equal(r1.created, true);
  appendEntry({ runDir, section: '/review', entry: '- AUTO 10:00:01 — c: d. Reversibility: high.' });
  appendEntry({ runDir, section: '/build', entry: '- AUTO 10:00:02 — e: f. Reversibility: high.' });
  appendEntry({ runDir, entry: '- AUTO 10:00:03 — g: h. Reversibility: high.' });
  const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.equal(text,
    '## /build\n' +
    '- AUTO 10:00:00 — a: b. Reversibility: high.\n' +
    '- AUTO 10:00:02 — e: f. Reversibility: high.\n' +
    '## /review\n' +
    '- AUTO 10:00:01 — c: d. Reversibility: high.\n' +
    '- AUTO 10:00:03 — g: h. Reversibility: high.\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/log-decision/append.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/log-decision/append'`

- [ ] **Step 3: Write minimal implementation**

```js
// bin/lib/log-decision/append.js
// Format one _shared/auto-decision-log.md entry and append it to a run's
// decisions.md — the decisions.md half of #637's "no CLI writes decisions.md
// or staged/" gap (the staged/ half is #637's remaining scope). Every AUTO /
// STAGED site that used to compose the line by hand (or via a scratch node -e)
// calls bin/log-decision.js, which is a thin wrapper over this module.
// The run dir must resolve under the main checkout ($RUN_ROOT — see
// _shared/pipeline-run-dir.md's Anchoring section): a worktree-local shadow
// copy is refused, never silently written ([IL-127]).
'use strict';

const fs = require('fs');
const path = require('path');
const { mainCheckoutRoot } = require('../hooks/worktree-detect');

const STATUSES = ['AUTO', 'STAGED', 'KEPT-PROMPT', 'SCANNED'];
const WORKTREE_ADMIN = `${path.sep}.claude${path.sep}worktrees${path.sep}`;

function pad2(n) { return String(n).padStart(2, '0'); }

function hms(now) {
  const d = new Date(now);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// { status, now, step?, spec?, text, reversibility?, lever? } -> one schema line (no newline).
function formatEntry({ status, now, step, spec, text, reversibility = 'n/a', lever }) {
  if (!STATUSES.includes(status)) throw new Error(`invalid status: ${status} (expected ${STATUSES.join('|')})`);
  const body = String(text || '').trim();
  if (!body) throw new Error('text is required');
  let location;
  if (step && spec !== undefined && spec !== null && spec !== '') location = `spec #${spec} — ${step}`;
  else if (step) location = String(step);
  else if (spec !== undefined && spec !== null && spec !== '') location = `spec #${spec}`;
  else location = 'log-decision';
  const action = /[.!?]$/.test(body) ? body : `${body}.`;
  let line = `- ${status} ${hms(now)} — ${location}: ${action} Reversibility: ${reversibility}.`;
  if (lever) line += ` [lever: ${lever}]`;
  return line;
}

function realpathOrNull(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

// { runDir, cwd?, mainRoot? } -> { ok, file } | { ok:false, reason:'missing'|'not-anchored' }
function resolveTarget({ runDir, cwd = process.cwd(), mainRoot }) {
  const real = realpathOrNull(runDir);
  let isDir = false;
  try { isDir = !!real && fs.statSync(real).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { ok: false, reason: 'missing' };
  const root = mainRoot === undefined ? mainCheckoutRoot(cwd) : mainRoot;
  if (root) {
    const rootReal = realpathOrNull(root) || root;
    const inRoot = real === rootReal || real.startsWith(rootReal + path.sep);
    if (!inRoot || real.includes(WORKTREE_ADMIN)) return { ok: false, reason: 'not-anchored' };
  }
  return { ok: true, file: path.join(real, 'decisions.md') };
}

// { runDir, section?, entry } -> { file, created }. Append-only; never rewrites prior lines.
function appendEntry({ runDir, section, entry }) {
  const file = path.join(runDir, 'decisions.md');
  const created = !fs.existsSync(file);
  let text = created ? '' : fs.readFileSync(file, 'utf8');
  if (text && !text.endsWith('\n')) text += '\n';
  if (!section) {
    fs.writeFileSync(file, text + entry + '\n');
    return { file, created };
  }
  const heading = `## ${section}`;
  const lines = text ? text.split('\n') : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const start = lines.indexOf(heading);
  if (start === -1) {
    lines.push(heading, entry);
  } else {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { if (/^## /.test(lines[i])) { end = i; break; } }
    lines.splice(end, 0, entry);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { file, created };
}

module.exports = { STATUSES, formatEntry, resolveTarget, appendEntry, hms };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/log-decision/append.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/log-decision/append.js tests/bin-lib/log-decision/append.test.js
git commit -m "Add log-decision append module — schema formatter + anchored decisions.md append — refs #686"
```

---

### Task 2: `bin/log-decision.js` CLI

**Files:**
- Create: `bin/log-decision.js`
- Test: `tests/bin-lib/log-decision/cli.test.js`

**Interfaces:**
- Consumes: `formatEntry`, `resolveTarget`, `appendEntry`, `STATUSES` from Task 1.
- Produces: `run(argv, deps)` → exit code. `deps = { now, cwd, mainRoot, stdout, stderr }` (`mainRoot` may be `undefined` to use the real resolver). Usage: `node bin/log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED --text "..." [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] [--section "/<skill>"] [--help]`. Exit 0 appended (prints the entry line to stdout); 2 malformed invocation; 3 run dir missing or not anchored under the main checkout (message names the shadow path and points at `_shared/pipeline-run-dir.md`).

- [ ] **Step 1: Write the failing test**

```js
// tests/bin-lib/log-decision/cli.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../bin/log-decision');

const SCHEMA = /^- (AUTO|STAGED|KEPT-PROMPT|SCANNED) (\d{2}:\d{2}:\d{2}) — (.+?): (.+)\. Reversibility: (high|med|low|n\/a)\.(?: \[lever: .+\])?$/;
const NOW = new Date(2026, 7, 16, 9, 5, 7).getTime();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ldcli-'));
  const main = path.join(root, 'main');
  const run = path.join(main, '.claude-tweaks', 'pipelines', '2026-08-16T090000-spec-12');
  const shadow = path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.claude-tweaks', 'pipelines', '2026-08-16T090000-spec-12');
  fs.mkdirSync(run, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  // Realistic git shape: the main checkout has a `.git` DIRECTORY; a linked worktree has a
  // `.git` FILE carrying a gitdir: pointer. resolveTarget's structural check keys on that.
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-12\n');
  return { main, run, shadow };
}

function deps(main, out) {
  return { now: () => NOW, cwd: () => main, mainRoot: main, stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) };
}

test('appends a schema-valid AUTO line and prints it', () => {
  const { main, run: runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--spec', '12', '--status', 'AUTO', '--text', 'x'], deps(main, out));
  assert.equal(code, 0);
  const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.equal(text, '- AUTO 09:05:07 — spec #12: x. Reversibility: n/a.\n');
  assert.match(text.trim(), SCHEMA);
  assert.equal(out.filter((o) => o[0] === 'out').map((o) => o[1]).join(''), text);
});

test('--section places the entry under the heading; --lever/--reversibility carried', () => {
  const { main, run: runDir } = fixture();
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# Auto-Decision Log — pipeline x\n\n## /build\n- AUTO 08:00:00 — a: b. Reversibility: high.\n## /test\n- AUTO 08:00:01 — c: d. Reversibility: high.\n');
  const code = run(['--run', runDir, '--status', 'STAGED', '--step', 'Step 3 Routing', '--text', '2 findings staged', '--reversibility', 'high', '--lever', 'review-auto-apply-ceiling=low (default)', '--section', '/build'], deps(main, []));
  assert.equal(code, 0);
  const lines = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8').split('\n');
  assert.equal(lines[4], '- STAGED 09:05:07 — Step 3 Routing: 2 findings staged. Reversibility: high. [lever: review-auto-apply-ceiling=low (default)]');
  assert.equal(lines[5], '## /test');
});

test('a --run inside a linked-worktree path is rejected non-zero and names the shadow', () => {
  const { main, shadow } = fixture();
  const out = [];
  const code = run(['--run', shadow, '--status', 'AUTO', '--text', 'x'], deps(main, out));
  assert.equal(code, 3);
  const err = out.filter((o) => o[0] === 'err').map((o) => o[1]).join('');
  assert.match(err, /not anchored/);
  assert.match(err, /pipeline-run-dir\.md/);
  assert.equal(fs.existsSync(path.join(shadow, 'decisions.md')), false, 'nothing written to the shadow');
});

test('malformed invocations exit 2: missing --run, bad status, empty text, missing dir exits 3', () => {
  const { main, run: runDir } = fixture();
  assert.equal(run(['--status', 'AUTO', '--text', 'x'], deps(main, [])), 2);
  assert.equal(run(['--run', runDir, '--status', 'MAYBE', '--text', 'x'], deps(main, [])), 2);
  assert.equal(run(['--run', runDir, '--status', 'AUTO', '--text', '   '], deps(main, [])), 2);
  assert.equal(run(['--run', runDir, '--status', 'AUTO', '--text', 'x', '--reversibility', 'sometimes'], deps(main, [])), 2);
  assert.equal(run(['--run', path.join(main, 'missing'), '--status', 'AUTO', '--text', 'x'], deps(main, [])), 3);
  const out = [];
  assert.equal(run(['--help'], deps(main, out)), 0);
  assert.match(out[0][1], /usage: log-decision\.js/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/log-decision/cli.test.js`
Expected: FAIL — `Cannot find module '../../../bin/log-decision'`

- [ ] **Step 3: Write minimal implementation**

```js
#!/usr/bin/env node
// bin/log-decision.js — append one _shared/auto-decision-log.md entry to a run's decisions.md.
//   node bin/log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED --text "..." \
//     [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] \
//     [--section "/<skill>"] [--help]
// Exit 0 appended (entry echoed to stdout); 2 malformed invocation; 3 run dir missing or not
// anchored under the main checkout (a worktree-local shadow — _shared/pipeline-run-dir.md).
// The decisions.md half of #637; the staged/ writer is #637's remaining scope.
'use strict';

const { STATUSES, formatEntry, resolveTarget, appendEntry } = require('./lib/log-decision/append');

const USAGE = 'usage: log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED --text "..." [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] [--section "/<skill>"] [--help]\n';
const REVERSIBILITY = ['high', 'med', 'low', 'n/a'];

function parseArgs(argv) {
  const o = { run: null, status: null, text: null, spec: null, step: null, reversibility: 'n/a', lever: null, section: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--status') o.status = next();
    else if (a === '--text') o.text = next();
    else if (a === '--spec') o.spec = next();
    else if (a === '--step') o.step = next();
    else if (a === '--reversibility') o.reversibility = next();
    else if (a === '--lever') o.lever = next();
    else if (a === '--section') o.section = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  now: () => Date.now(),
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) { deps.stderr('log-decision.js: --run <run-dir> is required\n' + USAGE); return 2; }
  if (!STATUSES.includes(o.status)) { deps.stderr(`log-decision.js: --status must be one of ${STATUSES.join('|')}\n` + USAGE); return 2; }
  if (!o.text || !String(o.text).trim()) { deps.stderr('log-decision.js: --text is required\n' + USAGE); return 2; }
  if (!REVERSIBILITY.includes(o.reversibility)) { deps.stderr(`log-decision.js: --reversibility must be one of ${REVERSIBILITY.join('|')}\n` + USAGE); return 2; }
  if (o.spec !== null && !/^\d+$/.test(String(o.spec))) { deps.stderr('log-decision.js: --spec must be a record number\n' + USAGE); return 2; }
  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) { deps.stderr(`log-decision.js: ${err && err.message}\n`); return 3; }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`log-decision.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`log-decision.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }
  const entry = formatEntry({ status: o.status, now: deps.now(), step: o.step, spec: o.spec, text: o.text, reversibility: o.reversibility, lever: o.lever });
  appendEntry({ runDir: o.run, section: o.section, entry });
  deps.stdout(entry + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/log-decision/cli.test.js tests/bin-lib/log-decision/append.test.js`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Smoke against a real dir + commit**

Run: `mkdir -p /tmp/ld-smoke && node bin/log-decision.js --run /tmp/ld-smoke --status AUTO --text smoke` — expected: exit 3 (`/tmp` is not under this checkout — proves the anchoring guard fires from a real cwd). Then:

```bash
git add bin/log-decision.js tests/bin-lib/log-decision/cli.test.js
git commit -m "Add log-decision CLI — one command per decisions.md entry, anchoring-guarded — refs #686"
```

---

### Task 3: `bin/lib/release-claim/release.js` — read/classify/ownership/tombstone/comment/labels

**Files:**
- Create: `bin/lib/release-claim/release.js`
- Test: `tests/bin-lib/release-claim/release.test.js`

**Interfaces:**
- Consumes: `classifyClaimBlob`, `releasePayload`, `CLAIMS_BRANCH`, `claimFilePath` from `bin/lib/issues/claims.js`.
- Produces:
  - `defaultRunner(args)`; `errorText(err)`.
  - `readClaimBlob({ owner, repo, issueNumber, runner })` → `{ content, sha }` | `{ content: null, sha: null, absent: true }` on a 404 (error text matches `/\b404\b|Not Found/`); any other throw propagates.
  - `writeTombstone({ owner, repo, issueNumber, sha, tombstoneContent, message, runner })` → stdout string; throws on failure. Args: `['api','--method','PUT',\`repos/${owner}/${repo}/contents/claims/issue-${n}.json\`,'-f',\`message=${message}\`,'-f',\`content=${base64}\`,'-f',\`branch=${CLAIMS_BRANCH}\`,'-f',\`sha=${sha}\`]`.
  - `isAlreadyReleasedError(err)` → true when error text matches `/\b(404|409|422)\b/` (already released / swept / sha stale).
  - `postReleaseComment({ owner, repo, issueNumber, body, runner })` → runner(`['issue','comment',String(n),'--repo',\`${owner}/${repo}\`,'--body',body]`).
  - `removeLabel({ owner, repo, issueNumber, label, runner })` → `{ ok, error? }` never throws; args `['issue','edit',String(n),'--repo',\`${owner}/${repo}\`,'--remove-label',label]`.
  - `releaseClaim({ owner, repo, issueNumber, runId, reason, link, removeGrants, removeInProgress, runner, now })` → `{ outcome: 'released'|'already-released'|'skipped-not-owner'|'failed', holder?, calls: string[], commentPosted: boolean, labelsRemoved: string[], labelsFailed: string[], error? }`. Order: read → classify → (`absent`/`tombstone` → `already-released`, still posts the comment) → ownership (`live`/`stale` with `runId !== ours` → `skipped-not-owner`, no writes at all; `unreadable` → `skipped-not-owner` with `holder: 'unreadable'`) → tombstone PUT with the read sha → comment → labels (`auto:build`,`auto:merge` when `removeGrants`; `bot:in-progress` when `removeInProgress`) — labels also run on `already-released`. A PUT failure that `isAlreadyReleasedError` → `already-released` (comment still posted); any other PUT failure → `failed` (no comment, no labels). Comment failure never changes the outcome (`commentPosted:false`, `error` set).

- [ ] **Step 1: Write the failing test**

```js
// tests/bin-lib/release-claim/release.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  readClaimBlob, writeTombstone, isAlreadyReleasedError, releaseClaim, removeLabel,
} = require('../../../bin/lib/release-claim/release');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const OWN = '2026-08-16T100000-spec-999';
const live = (runId) => JSON.stringify({ runId, sessionId: 's', claimedAt: '2026-08-16T11:00:00.000Z', ttlHours: 72, host: 'h' });
const isGet = (a) => a[0] === 'api' && a[1] === 'repos/acme/w/contents/claims/issue-999.json?ref=claims-registry';
const isPut = (a) => a[0] === 'api' && a[1] === '--method' && a[2] === 'PUT' && a[3] === 'repos/acme/w/contents/claims/issue-999.json';
const isComment = (a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '999';
const isEdit = (a) => a[0] === 'issue' && a[1] === 'edit' && a[2] === '999';
const fieldOf = (a, name) => { for (let k = 0; k < a.length; k++) if (a[k] === '-f' && String(a[k + 1]).startsWith(name + '=')) return a[k + 1].slice(name.length + 1); return undefined; };
function fakeRunner({ content, sha = 'blobsha1', putThrows, commentThrows, editThrows }) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (isGet(args)) {
      if (content === null) { const e = new Error('gh: Not Found (HTTP 404)'); throw e; }
      return JSON.stringify({ content, sha });
    }
    if (isPut(args)) { if (putThrows) throw new Error(putThrows); return '{"content":{"sha":"newsha"}}'; }
    if (isComment(args)) { if (commentThrows) throw new Error(commentThrows); return ''; }
    if (isEdit(args)) { if (editThrows) throw new Error(editThrows); return ''; }
    throw new Error('unexpected ' + args.join(' '));
  };
  return { runner, calls };
}

test('readClaimBlob: 404 -> absent; otherwise decoded content + sha', () => {
  const absent = fakeRunner({ content: null });
  assert.deepEqual(readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 999, runner: absent.runner }), { content: null, sha: null, absent: true });
  const present = fakeRunner({ content: live(OWN), sha: 'abc' });
  const r = readClaimBlob({ owner: 'acme', repo: 'w', issueNumber: 999, runner: present.runner });
  assert.equal(r.sha, 'abc');
  assert.equal(JSON.parse(r.content).runId, OWN);
  assert.match(present.calls[0].join(' '), /-q \{content: \(\.content \| @base64d\), sha: \.sha\}/);
});

test('releaseClaim happy path: read -> PUT with the read sha -> comment; exact call order + payloads', () => {
  const f = fakeRunner({ content: live(OWN), sha: 'blobsha1' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', link: 'https://x/pr/1', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  assert.equal(f.calls.length, 3, 'exactly read, PUT, comment — no label edits without flags');
  assert.ok(isGet(f.calls[0]));
  assert.ok(isPut(f.calls[1]));
  assert.equal(fieldOf(f.calls[1], 'sha'), 'blobsha1', 'PUT carries the sha from the read');
  assert.equal(fieldOf(f.calls[1], 'branch'), 'claims-registry');
  const tomb = JSON.parse(Buffer.from(fieldOf(f.calls[1], 'content'), 'base64').toString('utf8'));
  assert.equal(tomb.released, true);
  assert.equal(tomb.runId, OWN);
  assert.equal(tomb.reason, 'merged: spec 999');
  assert.equal(tomb.link, 'https://x/pr/1');
  assert.doesNotMatch(f.calls[1].join(' '), /-F /, 'contents-API fields are resolved strings -> -f only');
  assert.ok(isComment(f.calls[2]));
  const body = f.calls[2][f.calls[2].indexOf('--body') + 1];
  assert.match(body, /<!-- agent-claim-release: \{"runId":"2026-08-16T100000-spec-999","reason":"merged: spec 999"/);
  assert.equal(r.commentPosted, true);
});

test('releaseClaim --remove-grants adds exactly two label removals after the comment; --remove-in-progress adds bot:in-progress', () => {
  const f = fakeRunner({ content: live(OWN) });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, removeInProgress: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  const edits = f.calls.filter(isEdit).map((a) => a[a.indexOf('--remove-label') + 1]);
  assert.deepEqual(edits, ['auto:build', 'auto:merge', 'bot:in-progress']);
  assert.ok(f.calls.findIndex(isComment) < f.calls.findIndex(isEdit), 'labels come after the comment');
  assert.deepEqual(r.labelsRemoved, ['auto:build', 'auto:merge', 'bot:in-progress']);
});

test('a 404/422 on the PUT still posts the comment and reports already-released', () => {
  for (const msg of ['gh: Not Found (HTTP 404)', 'gh: sha does not match (HTTP 422)']) {
    const f = fakeRunner({ content: live(OWN), putThrows: msg });
    const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', runner: f.runner, now: NOW });
    assert.equal(r.outcome, 'already-released', msg);
    assert.equal(f.calls.filter(isComment).length, 1, 'comment still posted');
    assert.equal(r.commentPosted, true);
  }
  assert.equal(isAlreadyReleasedError(new Error('HTTP 500')), false);
});

test('an absent or tombstoned blob is already-released: no PUT, comment posted, labels still processed', () => {
  const f = fakeRunner({ content: null });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'already-released');
  assert.equal(f.calls.filter(isPut).length, 0);
  assert.equal(f.calls.filter(isComment).length, 1);
  assert.equal(f.calls.filter(isEdit).length, 2);
});

test('a blob owned by another run exits skipped-not-owner and writes nothing', () => {
  const f = fakeRunner({ content: live('2026-08-16T110000-spec-999') });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'merged: spec 999', removeGrants: true, runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'skipped-not-owner');
  assert.equal(r.holder, '2026-08-16T110000-spec-999');
  assert.equal(f.calls.length, 1, 'only the read');
});

test('unreadable blob fails closed to skipped-not-owner; other PUT failures -> failed with no comment', () => {
  const u = fakeRunner({ content: 'not json' });
  assert.equal(releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: u.runner, now: NOW }).outcome, 'skipped-not-owner');
  const f = fakeRunner({ content: live(OWN), putThrows: 'HTTP 500 boom' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'failed');
  assert.match(r.error, /500/);
  assert.equal(f.calls.filter(isComment).length, 0);
});

test('comment failure never changes the outcome; removeLabel never throws', () => {
  const f = fakeRunner({ content: live(OWN), commentThrows: 'HTTP 502' });
  const r = releaseClaim({ owner: 'acme', repo: 'w', issueNumber: 999, runId: OWN, reason: 'r', runner: f.runner, now: NOW });
  assert.equal(r.outcome, 'released');
  assert.equal(r.commentPosted, false);
  const e = fakeRunner({ content: live(OWN), editThrows: 'HTTP 404' });
  assert.equal(removeLabel({ owner: 'acme', repo: 'w', issueNumber: 999, label: 'auto:build', runner: e.runner }).ok, false);
});

test('writeTombstone composes the contents-API PUT with -f fields only', () => {
  const f = fakeRunner({ content: live(OWN) });
  writeTombstone({ owner: 'acme', repo: 'w', issueNumber: 999, sha: 's1', tombstoneContent: '{"released":true}', message: 'Release claim on issue #999', runner: f.runner });
  const a = f.calls[0];
  assert.deepEqual(a.slice(0, 4), ['api', '--method', 'PUT', 'repos/acme/w/contents/claims/issue-999.json']);
  assert.equal(fieldOf(a, 'message'), 'Release claim on issue #999');
  assert.equal(Buffer.from(fieldOf(a, 'content'), 'base64').toString('utf8'), '{"released":true}');
  assert.equal(fieldOf(a, 'sha'), 's1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/release-claim/release.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/release-claim/release'`

- [ ] **Step 3: Write minimal implementation**

```js
// bin/lib/release-claim/release.js
// The one claim-release write path: read the claim blob, classify it, honor the
// ownership rule, overwrite it with releasePayload's tombstone (conditional on
// the read sha), post the release comment, and optionally strip labels — the
// mechanics wrap-up/cleanup-procedures.md Section E steps 3-8 describe, in one
// call. bin/release-claim.js is the thin CLI; bin/lib/reconcile/release-merged.js
// shares writeTombstone below instead of composing its own PUT. Injectable
// runner(args) is invoked as `gh ${args.join(' ')}` (gh-api-module-pattern);
// tests never touch real gh. Contract: skills/_shared/issue-claims.md.
'use strict';

const { execFileSync } = require('child_process');
const { classifyClaimBlob, releasePayload, CLAIMS_BRANCH, claimFilePath } = require('../issues/claims');

const GRANT_LABELS = ['auto:build', 'auto:merge'];
const IN_PROGRESS_LABEL = 'bot:in-progress';

function defaultRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function errorText(err) {
  const parts = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).map(String);
  return parts.length ? parts.join(' ') : String(err);
}

function isNotFoundError(err) { return /\b404\b|Not Found/i.test(errorText(err)); }
// 404 (already swept), 409/422 (sha mismatch — someone else re-claimed or released first).
function isAlreadyReleasedError(err) { return /\b(404|409|422)\b/.test(errorText(err)); }

// -> { content, sha } | { content:null, sha:null, absent:true }; other failures throw.
function readClaimBlob({ owner, repo, issueNumber, runner = defaultRunner }) {
  let out;
  try {
    out = runner(['api', `repos/${owner}/${repo}/contents/${claimFilePath(issueNumber)}?ref=${CLAIMS_BRANCH}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
  } catch (err) {
    if (isNotFoundError(err)) return { content: null, sha: null, absent: true };
    throw err;
  }
  const parsed = JSON.parse(out);
  return { content: parsed.content, sha: parsed.sha };
}

// Conditional overwrite (sha = the blob's current sha from the read) — the same
// PUT release-merged.js and Section E issue; contents-API fields are resolved
// strings, so -f throughout (never -F).
function writeTombstone({ owner, repo, issueNumber, sha, tombstoneContent, message, runner = defaultRunner }) {
  const encoded = Buffer.from(tombstoneContent, 'utf8').toString('base64');
  return runner([
    'api', '--method', 'PUT', `repos/${owner}/${repo}/contents/${claimFilePath(issueNumber)}`,
    '-f', `message=${message}`, '-f', `content=${encoded}`, '-f', `branch=${CLAIMS_BRANCH}`, '-f', `sha=${sha}`,
  ]);
}

function postReleaseComment({ owner, repo, issueNumber, body, runner = defaultRunner }) {
  return runner(['issue', 'comment', String(issueNumber), '--repo', `${owner}/${repo}`, '--body', body]);
}

// Best-effort — never throws (a failed label edit never blocks a release).
function removeLabel({ owner, repo, issueNumber, label, runner = defaultRunner }) {
  try {
    runner(['issue', 'edit', String(issueNumber), '--repo', `${owner}/${repo}`, '--remove-label', label]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

// -> { outcome, holder?, calls, commentPosted, labelsRemoved, labelsFailed, error? }
function releaseClaim({ owner, repo, issueNumber, runId, reason, link, removeGrants = false, removeInProgress = false, runner = defaultRunner, now = Date.now() }) {
  const result = { outcome: 'failed', calls: [], commentPosted: false, labelsRemoved: [], labelsFailed: [] };
  let blob;
  try { blob = readClaimBlob({ owner, repo, issueNumber, runner }); } catch (err) { result.error = errorText(err); return result; }
  result.calls.push('read');
  const classified = classifyClaimBlob(blob.content, now);
  if (classified.state === 'unreadable') { result.outcome = 'skipped-not-owner'; result.holder = 'unreadable'; return result; }
  if (classified.state === 'live' || classified.state === 'stale') {
    const holder = JSON.parse(blob.content).runId;
    if (holder !== runId) { result.outcome = 'skipped-not-owner'; result.holder = holder; return result; }
  }
  const payload = releasePayload({ issueNumber, runId, reason, link: link || undefined, now });
  if (classified.state === 'live' || classified.state === 'stale') {
    try {
      writeTombstone({ owner, repo, issueNumber, sha: blob.sha, tombstoneContent: payload.tombstoneContent, message: `Release claim on issue #${issueNumber}`, runner });
      result.calls.push('put');
      result.outcome = 'released';
    } catch (err) {
      if (!isAlreadyReleasedError(err)) { result.error = errorText(err); return result; }
      result.outcome = 'already-released';
      result.error = errorText(err);
    }
  } else {
    result.outcome = 'already-released'; // absent or tombstone — nothing to overwrite
  }
  try { postReleaseComment({ owner, repo, issueNumber, body: payload.commentBody, runner }); result.calls.push('comment'); result.commentPosted = true; } catch (err) { result.error = errorText(err); }
  const labels = [...(removeGrants ? GRANT_LABELS : []), ...(removeInProgress ? [IN_PROGRESS_LABEL] : [])];
  for (const label of labels) {
    const r = removeLabel({ owner, repo, issueNumber, label, runner });
    result.calls.push(`label:${label}`);
    (r.ok ? result.labelsRemoved : result.labelsFailed).push(label);
  }
  return result;
}

module.exports = {
  defaultRunner, errorText, isNotFoundError, isAlreadyReleasedError,
  readClaimBlob, writeTombstone, postReleaseComment, removeLabel, releaseClaim,
  GRANT_LABELS, IN_PROGRESS_LABEL,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/release-claim/release.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/release-claim/release.js tests/bin-lib/release-claim/release.test.js
git commit -m "Add release-claim module — read/classify/ownership/tombstone/comment/labels in one call — refs #686"
```

---

### Task 4: `bin/release-claim.js` CLI (logs its own AUTO line via the log-decision module)

**Files:**
- Create: `bin/release-claim.js`
- Test: `tests/bin-lib/release-claim/cli.test.js`

**Interfaces:**
- Consumes: `releaseClaim`, `defaultRunner` (Task 3); `formatEntry`, `appendEntry` (Task 1); `parseRepo` shape from `bin/link-records.js` (re-implemented locally, same regex).
- Produces: `run(argv, deps)` → exit code. `deps = { runner, ghAvailable, remoteUrl, now, stdout, stderr }`. Usage: `node bin/release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress] [--repo owner/name] [--help]`. `runId = path.basename(<run-dir>)` (a trailing slash is stripped first). Exit codes: `0` released; `3` already-released-or-swept (comment still posted); `4` skipped-not-owner (nothing written); `1` failed (read/PUT failure that isn't 404/409/422); `2` malformed invocation or `gh` absent (message names `_shared/github-write-transport.md`'s MCP path as the documented fallback). Stdout: one JSON envelope `{ issue, runId, reason, link, outcome, holder, commentPosted, labelsRemoved, labelsFailed, note, error, logged }` (`note` = non-fatal diagnostics from the module — a 404/422 PUT text on the already-released path or a comment-post failure; `error` only when `outcome` is `failed`). When `<run-dir>` exists as a directory, the CLI appends one entry to `<run-dir>/decisions.md` (section `/release-claim` omitted — appended at EOF) — `AUTO — Section E: released claim on #{n} ({reason}){; link} …` for `released`/`already-released` (detail `already released or swept` for the latter), or `AUTO — Section E: skipped release of issue #{n}: claim held by run {holder}` for `skipped-not-owner`; `logged: true|false` reports whether the append happened (a missing run dir is a stderr warning, never a failure — the release itself is the deliverable). Not logged for `failed`.

- [ ] **Step 1: Write the failing test**

```js
// tests/bin-lib/release-claim/cli.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../bin/release-claim');

const NOW = Date.parse('2026-08-16T12:00:00Z');
const RUN_DIR_NAME = '2026-08-16T100000-spec-999';
const live = (runId) => JSON.stringify({ runId, sessionId: 's', claimedAt: '2026-08-16T11:00:00.000Z', ttlHours: 72, host: 'h' });
const isGet = (a) => a[0] === 'api' && String(a[1]).startsWith('repos/acme/w/contents/claims/issue-999.json?ref=');
const isPut = (a) => a[0] === 'api' && a[1] === '--method' && a[2] === 'PUT';
const isComment = (a) => a[0] === 'issue' && a[1] === 'comment';
const isEdit = (a) => a[0] === 'issue' && a[1] === 'edit';

function mkRun() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', RUN_DIR_NAME);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}
function deps({ content, putThrows, gh = true, out }) {
  const calls = [];
  const runner = (a) => {
    calls.push(a);
    if (isGet(a)) { if (content === null) throw new Error('HTTP 404'); return JSON.stringify({ content, sha: 'blobsha1' }); }
    if (isPut(a)) { if (putThrows) throw new Error(putThrows); return '{}'; }
    if (isComment(a) || isEdit(a)) return '';
    throw new Error('unexpected ' + a.join(' '));
  };
  return { calls, d: { runner, ghAvailable: () => gh, remoteUrl: () => 'git@github.com:acme/w.git', now: () => NOW, stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) } };
}
const envelope = (out) => JSON.parse(out.filter((o) => o[0] === 'out').map((o) => o[1]).join(''));

test('happy path: read -> PUT(sha) -> comment; --remove-grants adds two label removals; exit 0; logs to decisions.md', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), out });
  const code = run(['999', '--run', runDir + '/', '--reason', 'merged: spec 999', '--link', 'https://x/1', '--remove-grants'], d);
  assert.equal(code, 0);
  assert.deepEqual(calls.map((a) => (isGet(a) ? 'get' : isPut(a) ? 'put' : isComment(a) ? 'comment' : a[a.indexOf('--remove-label') + 1])), ['get', 'put', 'comment', 'auto:build', 'auto:merge']);
  const put = calls.find(isPut);
  assert.ok(put.includes('sha=blobsha1'), 'PUT carries the read sha');
  const env = envelope(out);
  assert.equal(env.outcome, 'released');
  assert.equal(env.runId, RUN_DIR_NAME, 'runId is basename(--run), trailing slash stripped');
  assert.equal(env.logged, true);
  const log = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(log, /^- AUTO \d{2}:\d{2}:\d{2} — Section E: released claim on #999 \(merged: spec 999\); link https:\/\/x\/1\. Reversibility: high\.$/m);
});

test('404/422 on the PUT: comment still posted, exit 3', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), putThrows: 'HTTP 422 sha mismatch', out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'merged: spec 999'], d), 3);
  assert.equal(calls.filter(isComment).length, 1);
  assert.equal(envelope(out).outcome, 'already-released');
});

test('blob owned by another run: exit 4, nothing written, skip line logged', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live('2026-08-16T110000-spec-999'), out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'merged: spec 999', '--remove-grants'], d), 4);
  assert.equal(calls.length, 1, 'only the read');
  assert.match(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), /skipped release of issue #999: claim held by run 2026-08-16T110000-spec-999/);
});

test('failed PUT (500): exit 1, no comment; missing run dir still releases (logged:false, warning)', () => {
  const runDir = mkRun();
  const out = [];
  const { calls, d } = deps({ content: live(RUN_DIR_NAME), putThrows: 'HTTP 500', out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'r'], d), 1);
  assert.equal(calls.filter(isComment).length, 0);
  const out2 = [];
  const { d: d2 } = deps({ content: live(RUN_DIR_NAME), out: out2 });
  // Same basename (so the ownership check still matches) under a directory that does not exist.
  assert.equal(run(['999', '--run', path.join(os.tmpdir(), 'rc-none-' + process.pid, RUN_DIR_NAME), '--reason', 'r'], d2), 0);
  assert.equal(envelope(out2).logged, false);
  assert.match(out2.filter((o) => o[0] === 'err').map((o) => o[1]).join(''), /decisions\.md not written/);
});

test('malformed invocation / gh absent exit 2 with the MCP fallback named; --help exits 0', () => {
  const runDir = mkRun();
  const out = [];
  const { d } = deps({ content: live(RUN_DIR_NAME), out });
  assert.equal(run(['--run', runDir, '--reason', 'r'], d), 2, 'issue missing');
  assert.equal(run(['abc', '--run', runDir, '--reason', 'r'], d), 2, 'issue not a number');
  assert.equal(run(['999', '--reason', 'r'], d), 2, '--run missing');
  assert.equal(run(['999', '--run', runDir], d), 2, '--reason missing');
  const { d: noGh } = deps({ content: live(RUN_DIR_NAME), gh: false, out });
  assert.equal(run(['999', '--run', runDir, '--reason', 'r'], noGh), 2);
  assert.match(out.filter((o) => o[0] === 'err').map((o) => o[1]).join(''), /github-write-transport\.md/);
  const help = [];
  const { d: h } = deps({ content: null, out: help });
  assert.equal(run(['--help'], h), 0);
  assert.match(help[0][1], /usage: release-claim\.js/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/release-claim/cli.test.js`
Expected: FAIL — `Cannot find module '../../../bin/release-claim'`

- [ ] **Step 3: Write minimal implementation**

```js
#!/usr/bin/env node
// bin/release-claim.js — release a claims-registry claim in one command.
//   node bin/release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] \
//     [--remove-grants] [--remove-in-progress] [--repo owner/name] [--help]
// Performs wrap-up/cleanup-procedures.md Section E steps 3-8 for one issue: read the
// blob, ownership check (never delete a successor's claim), releasePayload -> tombstone
// PUT carrying the read sha, release comment; --remove-grants strips auto:build/auto:merge,
// --remove-in-progress strips bot:in-progress; one AUTO line is appended to
// <run-dir>/decisions.md when that directory exists. runId = basename(<run-dir>).
// Exit 0 released; 3 already released or swept (404/409/422 — comment still posted);
// 4 skipped, claim held by another run (nothing written); 1 failed; 2 malformed
// invocation or `gh` absent — the MCP path in _shared/github-write-transport.md is the
// documented fallback there, deliberately not grown into this CLI.
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const release = require('./lib/release-claim/release');
const { formatEntry, appendEntry } = require('./lib/log-decision/append');

const USAGE = 'usage: release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress] [--repo owner/name] [--help]\n';
const EXIT = { released: 0, 'already-released': 3, 'skipped-not-owner': 4, failed: 1 };

function parseArgs(argv) {
  const o = { issue: null, run: null, reason: null, link: null, removeGrants: false, removeInProgress: false, repo: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; return v === undefined ? null : v; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--reason') o.reason = next();
    else if (a === '--link') o.link = next();
    else if (a === '--remove-grants') o.removeGrants = true;
    else if (a === '--remove-in-progress') o.removeInProgress = true;
    else if (a === '--repo') o.repo = next();
    else if (/^--/.test(a)) return { error: `unknown argument: ${a}` };
    else if (o.issue === null) o.issue = a;
    else return { error: `unexpected argument: ${a}` };
  }
  return o;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

const realDeps = {
  runner: release.defaultRunner,
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  now: () => Date.now(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function decisionText(issue, r, reason, link) {
  if (r.outcome === 'skipped-not-owner') return `skipped release of issue #${issue}: claim held by run ${r.holder}`;
  const detail = r.outcome === 'already-released' ? ' — already released or swept' : '';
  return `released claim on #${issue} (${reason})${link ? `; link ${link}` : ''}${detail}`;
}

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  const issue = Number(o.issue);
  if (!Number.isInteger(issue) || issue <= 0) { deps.stderr('release-claim.js: <issue> must be a positive integer\n' + USAGE); return 2; }
  if (!o.run) { deps.stderr('release-claim.js: --run <run-dir> is required (its basename is the claim runId)\n' + USAGE); return 2; }
  if (!o.reason || !o.reason.trim()) { deps.stderr('release-claim.js: --reason is required\n' + USAGE); return 2; }
  if (!deps.ghAvailable()) {
    deps.stderr('release-claim.js: `gh` is required — in a gh-absent environment run the same read-classify-write over the MCP tools per _shared/github-write-transport.md and _shared/issue-claims.md ("The lock").\n');
    return 2;
  }
  let remote = null;
  if (!o.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = o.repo ? parseRepo(`github.com/${o.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('release-claim.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const runDir = o.run.replace(/[\/]+$/, '');
  const runId = path.basename(runDir);
  const r = release.releaseClaim({
    owner: repoSpec.owner, repo: repoSpec.repo, issueNumber: issue, runId, reason: o.reason.trim(), link: o.link || undefined,
    removeGrants: o.removeGrants, removeInProgress: o.removeInProgress, runner: deps.runner, now: deps.now(),
  });
  let logged = false;
  if (r.outcome !== 'failed') {
    let isDir = false;
    try { isDir = fs.statSync(runDir).isDirectory(); } catch { isDir = false; }
    if (isDir) {
      const entry = formatEntry({ status: 'AUTO', now: deps.now(), step: 'Section E', text: decisionText(issue, r, o.reason.trim(), o.link), reversibility: r.outcome === 'skipped-not-owner' ? 'n/a' : 'high' });
      try { appendEntry({ runDir, entry }); logged = true; } catch (err) { deps.stderr(`release-claim.js: decisions.md not written (${err && err.message})\n`); }
    } else {
      deps.stderr(`release-claim.js: decisions.md not written — run dir does not exist: ${runDir}\n`);
    }
  }
  deps.stdout(JSON.stringify({ issue, runId, reason: o.reason.trim(), link: o.link || null, outcome: r.outcome, holder: r.holder || null, commentPosted: r.commentPosted, labelsRemoved: r.labelsRemoved, labelsFailed: r.labelsFailed, note: r.note || null, error: r.error || null, logged }, null, 2) + '\n');
  return EXIT[r.outcome];
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/release-claim/cli.test.js tests/bin-lib/release-claim/release.test.js`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Commit**

```bash
git add bin/release-claim.js tests/bin-lib/release-claim/cli.test.js
git commit -m "Add release-claim CLI — Section E steps 3-8 in one command with a documented exit-code contract — refs #686"
```

---

### Task 5: `release-merged.js` shares the tombstone write path

**Files:**
- Modify: `bin/lib/reconcile/release-merged.js` (the `writeTombstone` function, ~lines 122-133, and its call at ~line 209)
- Test: `tests/bin-lib/reconcile/release-merged.test.js` (add one test), `tests/bin-lib/release-claim/release.test.js` (already covers the shared function)

**Interfaces:**
- Consumes: `writeTombstone({ owner, repo, issueNumber, sha, tombstoneContent, message, runner })` from Task 3.
- Produces: `release-merged.js` no longer defines its own PUT arg list; its local `writeTombstone(repoSlug, name, sha, tombstoneContent, reason)` becomes a thin adapter that splits `repoSlug`, derives `issueNumber` from `name`, and passes a 5-second-timeout runner — same failure semantics as before (returns `false` on any throw).

- [ ] **Step 1: Write the failing test**

Append to `tests/bin-lib/reconcile/release-merged.test.js`:

```js
// The reconciler's PUT is composed by the shared release-claim module — one write path
// for every release (Section E CLI, reconciler). Pin the adapter's contract: it delegates
// to release-claim's writeTombstone with owner/repo split from the slug and the issue
// number parsed from the blob name, and maps any throw to false.
test('writeTombstone adapter delegates to bin/lib/release-claim/release.js writeTombstone', () => {
  const rm = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(typeof rm.writeTombstone, 'function', 'adapter is exported for this pin');
  const seen = [];
  const ok = rm.writeTombstone('acme/w', 'issue-42.json', 'sha42', '{"released":true}', 'merged: reconciled from PR #7', (args) => { seen.push(args); return '{}'; });
  assert.equal(ok, true);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].slice(0, 4), ['api', '--method', 'PUT', 'repos/acme/w/contents/claims/issue-42.json']);
  assert.ok(seen[0].includes('sha=sha42'));
  assert.ok(seen[0].some((a) => /^message=Release claim issue-42\.json — merged: reconciled from PR #7$/.test(a)));
  assert.equal(rm.writeTombstone('acme/w', 'issue-42.json', 'sha42', '{}', 'r', () => { throw new Error('HTTP 422'); }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js`
Expected: FAIL — `adapter is exported for this pin` (writeTombstone is not exported yet)

- [ ] **Step 3: Write minimal implementation**

In `bin/lib/reconcile/release-merged.js`, add the require and replace the local `writeTombstone`:

```js
const { writeTombstone: writeTombstoneShared } = require('../release-claim/release');
```

```js
// Conditional-update — sha = the target file's current blob sha from the
// fresh read above, per `_shared/issue-claims.md`'s "The lock" step 4/5. The
// PUT itself is composed by bin/lib/release-claim/release.js's writeTombstone —
// the one write path Section E's CLI and this reconciler share — so a sha
// mismatch (someone else already broke/re-claimed it) surfaces as an ordinary
// throw there and maps to false here; the caller logs it as a release race,
// exactly the posture that file's Failure posture table documents. `runner`
// is injectable for tests; the default keeps this module's 5s gh timeout.
function writeTombstone(repoSlug, name, sha, tombstoneContent, reason, runner) {
  const [owner, repo] = repoSlug.split('/');
  const issueNumber = Number((/^issue-(\d+)\.json$/.exec(name) || [])[1]);
  const gh = runner || ((args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GH_TIMEOUT_MS }));
  try {
    writeTombstoneShared({ owner, repo, issueNumber, sha, tombstoneContent, message: `Release claim ${name} — ${reason}`, runner: gh });
    return true;
  } catch {
    return false;
  }
}
```

and extend the export line:

```js
module.exports = { releaseMerged, decideRelease, releasedEntry, repoSlugOf, writeTombstone };
```

The call site (`const ok = writeTombstone(repoSlug, name, claim.sha, payload.tombstoneContent, reason);`) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/reconcile/release-merged.test.js tests/bin-lib/release-claim/*.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/reconcile/release-merged.js tests/bin-lib/reconcile/release-merged.test.js
git commit -m "Route release-merged's tombstone PUT through the shared release-claim write path — refs #686"
```

---

### Task 6: Cite the CLIs from every prose site + docs table

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md` (Section E, lines 224-330 — steps 3-8)
- Modify: `skills/flow/multispec-review-console.md` (Shared teardown steps 3-5 and "Per-issue label cleanup", lines ~294-306) — MUST net-shrink; measure `wc -c` before and after
- Modify: `skills/dispatch/settle-and-merge.md` (step 2 of the HARD-GATE Settle procedure, ~line 31)
- Modify: `skills/_shared/issue-claims.md` ("Release" bullet under "The lock", ~line 100, and the "Every claim, skip, break, and release is logged" line)
- Modify: `skills/_shared/auto-decision-log.md` (Append protocol section, ~line 116)
- Modify: `docs/plugin-structure.md` (line 17 bin/ list, the bin/lib/ entries around lines 22-24, and the command reference block lines ~80-105)
- Test: existing `npm test` conformance suites; the AC greps below

**Interfaces:**
- Consumes: the CLI usages from Tasks 2 and 4 verbatim.
- Produces: prose only.

- [ ] **Step 1: Section E (`skills/wrap-up/cleanup-procedures.md`)** — steps 3 through 8 keep their numbers (steps 6 and 7 are cited by number from `wrap-up/review-console.md`, `tidy/scan-procedures.md`, and `_shared/issue-claims.md`'s Release triggers table). Replace the text of steps 3 through 8 (from `3. **Ownership check` through `8. Log each release…decisions.md (status \`AUTO\`, reason string as detail).`) with:

```markdown
3. **Ownership check (per `_shared/issue-claims.md`, "Release triggers") — performed by the CLI in
   step 4.** Resolve `$RUN_ID` as `basename($PIPELINE_RUN_DIR)`. Whether that value matches the
   run id `/claude-tweaks:dispatch` claimed under follows directly from dispatch minting the run
   directory itself: dispatch Step 4 mints `PIPELINE_RUN_DIR` and writes the claim's `runId` as that
   directory's own basename, then passes the same `PIPELINE_RUN_DIR` value inline on both of a
   group's Task calls — `/flow` Step 3 adopts it rather than creating a separate run directory of
   its own, so this pipeline's `$PIPELINE_RUN_DIR` **is** the directory the claim was written
   under, for a singleton. (A multi-spec bundle is the one exception this single-spec Section E does
   not itself resolve — see the callout below.) A spec reaching this point through any other path
   (a human running `/flow #{issue}` directly, or a spec merely *derived from* an issue with no
   live claim) resolves the same way. The CLI reads the blob at `claims/issue-${ISSUE}.json` on
   `claims-registry` itself; a `runId` other than `$RUN_ID` means a successor holds the lock — it
   exits `4`, writes nothing, posts nothing, and appends `AUTO — skipped release of issue
   #{issue}: claim held by run {claim.runId}` to `decisions.md`; continue to the next step's
   label handling for nothing else — the issue is done here.

   **Multi-spec bundle callout.** This section is skipped entirely for a bundle spec under
   `MULTISPEC_REVIEW_DEFER=1` (see "Multi-spec defer behavior" above) — release happens once, at
   end-of-run, in `flow/multispec-review-console.md`'s "Shared teardown," which passes
   `--run "$MULTISPEC_PARENT_DIR"` instead: the claim dispatch wrote is keyed to the parent
   directory's basename (the identity minted for the whole group), while each spec's own
   `$PIPELINE_RUN_DIR` in that context is the `spec-{N}/` subdirectory, not the parent.
4. **Release in one command** — ownership check, `releasePayload` tombstone `PUT` (sha = the
   blob's current sha from the CLI's own read), release comment, and the label removals of steps
   6-7, once per issue:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/release-claim.js" "$ISSUE" --run "$PIPELINE_RUN_DIR" \
     --reason "$REASON" ${LINK:+--link "$LINK"} --remove-in-progress [--remove-grants]
   ```

   (`--remove-grants` per step 6's rule.) The CLI wraps `gh` only — in a `gh`-absent environment
   run the same read-classify-write over the MCP tools per `_shared/github-write-transport.md`;
   the MCP path stays the documented fallback rather than a second mode of the CLI.
5. Exit `0` = released. Exit `3` = a 404/422 from the blob write — the claim was already released
   or swept (or the sha went stale between the read and this write); the CLI still posts the
   release comment so the trail records the outcome. Exit `1` = any other failure: retry the
   command once, then log and continue — TTL is the backstop, never block wrap-up. Exit `2` =
   malformed call or `gh` absent (see step 4's fallback).
6. **Remove grants** when the outcome was `merged:` or `pr-opened:`: pass `--remove-grants`, which
   strips `auto:build` and `auto:merge`, whichever are present, best-effort per label — reversible,
   each removal logged to `decisions.md` by the CLI. Omit it for issues released as `abandoned:`
   (the grant is the standing retry request); an issue carrying no `auto:*` label is a harmless
   no-op. See "Grant revocation" and the "Release triggers" table in `_shared/issue-claims.md`.
7. **Remove `bot:in-progress`; restore `parked` if applicable.** `--remove-in-progress` (always
   passed) removes `bot:in-progress` — best-effort, the CLI logs a warning and continues on
   failure. Then, only when the outcome reason is `abandoned: spec {spec}` (i.e. NOT
   `merged:`/`pr-opened:`) AND the materialized header (`${RUN_DIR}/work/*-spec.md` — read
   directly; per the step above, the file is never deleted before this point) carries
   `parked-at-shaping: true` (`materialize.md`'s field for exactly this restore-on-abandon case):
   restore `parked` — bootstrap the label if missing (per _shared/label-bootstrap.md, LABELS_JSON =
   [['parked', 'Deferred backlog entry, waiting on a trigger condition']]), then
   `gh issue edit "$ISSUE" --add-label parked`. Skip restoration silently when no materialized
   header exists or `parked-at-shaping` is absent, or when the outcome was `merged:`/`pr-opened:`
   (the record shipped or is under review — it should stay unparked). Best-effort — on failure, log
   a warning and continue; `/tidy` Step 4.7's backstop check catches a restoration that silently
   failed.
8. The CLI logs the release (or ownership skip) and every label removal to `decisions.md` (status
   `AUTO`, reason string as detail). Log the `parked` restoration yourself:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO --step
   "Section E" --text "restored parked on #{issue}" --reversibility high`.
```

Then update the section's earlier prose that says "step 3's ownership check ends the section harmlessly there, before the write is attempted, logging the misleading-but-harmless `claim held by run undefined`" — keep it (still true: the CLI exits `4` on a foreign holder; for an `absent` blob it exits `3` and posts the comment). Amend that sentence to: "step 3's CLI exits `3` (already released / never claimed) or `4` (held by another run) there without touching the blob."

- [ ] **Step 2: Shared teardown (`skills/flow/multispec-review-console.md`)** — record `wc -c` first (expected 40956). Replace step 3's text from `Every other status uses the outcome-mapped reason and procedure` through `never a per-spec \`$PIPELINE_RUN_DIR\`.**` with:

```markdown
Every other status uses the outcome-mapped reason from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`) and its one-command release — `node "${CLAUDE_PLUGIN_ROOT}/bin/release-claim.js" "$ISSUE" --run "$MULTISPEC_PARENT_DIR" --reason "$REASON" --link "$LINK" --remove-in-progress [--remove-grants]` — which ownership-checks (a successor's claim is never deleted), writes the tombstone, posts the comment, and logs one `AUTO` line to the parent's `decisions.md`. `$LINK` is the branch-finish outcome's merge commit sha or PR URL. **`--run` is `$MULTISPEC_PARENT_DIR`, never a per-spec `$PIPELINE_RUN_DIR`.**
```

Replace step 4's body (`**Remove grants** for each issue released … in \`_shared/issue-claims.md\`.`) with:

```markdown
**Remove grants** — pass `--remove-grants` for each issue released with a `merged:` or `pr-opened:` outcome (strips `auto:build`/`auto:merge`, best-effort per label); omit it for `abandoned:` (the grant is the standing retry request). See "Grant revocation" in `_shared/issue-claims.md`.
```

Replace the "Per-issue label cleanup" paragraph's first sentence after "only what triggered it differs." (`Per \`wrap-up/cleanup-procedures.md\` Section E: always remove \`bot:in-progress\` (\`gh issue edit "$ISSUE" --remove-label bot:in-progress\`, best-effort).`) with:

```markdown
Per `wrap-up/cleanup-procedures.md` Section E: `bot:in-progress` is removed by `--remove-in-progress` in the release command above (best-effort).
```

Then re-measure: `wc -c skills/flow/multispec-review-console.md` MUST be ≤ 40960 and less than the starting value.

- [ ] **Step 3: Settle (`skills/dispatch/settle-and-merge.md`)** — replace step 2 (`2. Release the claim (reason: \`failed: {gate}\`, per \`_shared/issue-claims.md\`'s Release triggers table), then remove \`bot:in-progress\` the same way \`wrap-up/cleanup-procedures.md\` Section E's claim-mirror removal does (best-effort — log a warning and continue on failure). This is a cross-reference, not a restatement — if Section E's mechanics for this step ever change, this step must be re-verified against it rather than assumed still correct.`) with:

```markdown
2. Release the claim and remove `bot:in-progress` in one command — `node "${CLAUDE_PLUGIN_ROOT}/bin/release-claim.js" "$ISSUE" --run "$PIPELINE_RUN_DIR" --reason "failed: {gate}" --remove-in-progress` (reason per `_shared/issue-claims.md`'s Release triggers table; label removal best-effort, the CLI logs a warning and continues on failure). Same CLI `wrap-up/cleanup-procedures.md` Section E uses — the exit-code contract lives there, not restated here.
```

Also fold step 1's ownership-check prose into a shorter form since the CLI performs it: replace step 1's sentence `A mismatch means a successor already broke the stale claim and now holds the lock — skip the rest of this step entirely (no release, no label changes, no comment), log, and move to the next record.` with `A mismatch means a successor already broke the stale claim and now holds the lock — the CLI in step 2 exits \`4\` there without writing anything (it performs this same read itself); skip the rest of this step and move to the next record.`

- [ ] **Step 4: `skills/_shared/issue-claims.md`** — in "The lock", replace the `- **Release:**` bullet's text with:

```markdown
- **Release:** the same read-then-classify (steps 1-2 above), then write the payload's
  `tombstoneContent` with `sha` = the current file's blob sha — structurally the same
  conditional-overwrite as step 4's re-claim, differing only in what content it writes. A sha
  mismatch means someone else already broke/re-claimed it; treat as a release race (log, TTL is
  the backstop, per the Failure posture table below). **`bin/release-claim.js`** performs this
  whole sequence (read → classify → ownership check → tombstone `PUT` → comment → optional
  label removals) in one command on the `gh` path — `node "${CLAUDE_PLUGIN_ROOT}/bin/release-claim.js"
  <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress]`,
  exit `0` released / `3` already released or swept / `4` held by another run / `1` failed / `2`
  malformed or `gh` absent. The MCP path stays the manual read-classify-write above.
```

and replace the sentence `Every claim, skip, break, and release is logged to the run's \`decisions.md\` per \`_shared/auto-decision-log.md\` (status \`AUTO\`, reversible: release overwrites the blob with a tombstone).` with `Every claim, skip, break, and release is logged to the run's \`decisions.md\` per \`_shared/auto-decision-log.md\` (status \`AUTO\`, reversible: release overwrites the blob with a tombstone) — \`bin/release-claim.js\` appends its own line; claim-side entries go through \`bin/log-decision.js\`.`

- [ ] **Step 5: `skills/_shared/auto-decision-log.md`** — in "Append protocol", immediately after the numbered 1-3 pattern and its "For the very first entry…" paragraph, add:

```markdown
**One command per entry.** `bin/log-decision.js` performs steps 1-3 for a single entry — format
per the Entry schema above, place under the `## /{skill}` heading (creating it when absent), append
— and refuses a run dir that does not resolve under `$RUN_ROOT` (`_shared/pipeline-run-dir.md`'s
Anchoring section) with exit `3`, so a worktree-local shadow is never written silently:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO \
  --section "/{skill-name}" --step "{step or location}" --text "{short action}" --reversibility high \
  [--spec <n>] [--lever "<key>=<value> (<source>)"]
```

Prefer it over composing the line by hand or via a scratch `node -e` at every AUTO/STAGED site.
```

and change the `worktree-always` paragraph's opening (`Use a Bash append instead — the gate's Bash coverage is the \`cp\`/\`mv\`/\`tee\` shapes only, not output redirection`) to `Use \`bin/log-decision.js\` (above) or a Bash append instead — the gate's Bash coverage is the \`cp\`/\`mv\`/\`tee\` shapes only, not a Node process or output redirection`.

- [ ] **Step 6: `docs/plugin-structure.md`** — line 17: append `, release-claim, log-decision` to the standalone-CLI parenthetical. After the `bin/lib/issues/` line (~24), add two lines in the same style:

```
bin/lib/release-claim/            → release.js — the one claim-release write path (read → classify → ownership → tombstone PUT → comment → label removals; injectable runner). Consumed by bin/release-claim.js and bin/lib/reconcile/release-merged.js (shares writeTombstone)
bin/lib/log-decision/             → append.js — _shared/auto-decision-log.md entry formatter + anchored decisions.md append (refuses a worktree-local shadow). Consumed by bin/log-decision.js and bin/release-claim.js
```

In the command-reference block, after the `link-records.js` line, add:

```
node --test tests/bin-lib/release-claim/*.test.js tests/bin-lib/log-decision/*.test.js   # Release-claim + log-decision unit suites only
node bin/release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants] [--remove-in-progress] [--repo owner/name]   # Release-claim CLI — Section E steps 3-8 in one command (read → ownership check → tombstone PUT with the read sha → comment → labels; logs one AUTO line to <run-dir>/decisions.md); exit 0 released, 3 already released or swept, 4 held by another run, 1 failed, 2 malformed or `gh` absent (fallback: _shared/github-write-transport.md's MCP path)
node bin/log-decision.js --run <run-dir> --status AUTO|STAGED|KEPT-PROMPT|SCANNED --text "..." [--spec <n>] [--step <text>] [--reversibility high|med|low|n/a] [--lever "<k>=<v> (<source>)"] [--section "/<skill>"]   # Log-decision CLI — appends one _shared/auto-decision-log.md entry (the decisions.md half of #637); exit 0 appended, 2 malformed, 3 run dir missing or not anchored under the main checkout
```

- [ ] **Step 7: Verify the acceptance greps and the targeted suites**

Run: `grep -rln "releasePayload" skills/`
Expected: exactly `skills/_shared/issue-claims.md` and `skills/tidy/scan-procedures.md`.

Run: `grep -rn "release-claim.js" skills/ | wc -l`
Expected: ≥ 4 (cleanup-procedures, multispec-review-console, settle-and-merge, issue-claims).

Run: `wc -c skills/flow/multispec-review-console.md`
Expected: ≤ 40960 and below 40956.

Run: `grep -rn "TBD\|TODO" skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md skills/dispatch/settle-and-merge.md skills/_shared/issue-claims.md skills/_shared/auto-decision-log.md`
Expected: no output.

Run: `node --test tests/console-on-pr.test.js tests/sweep-backstop.test.js tests/integration-model.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md skills/dispatch/settle-and-merge.md skills/_shared/issue-claims.md skills/_shared/auto-decision-log.md docs/plugin-structure.md
git commit -m "Cite release-claim and log-decision CLIs from Section E, Shared teardown, Settle, issue-claims, and the decision-log append protocol — refs #686"
```
