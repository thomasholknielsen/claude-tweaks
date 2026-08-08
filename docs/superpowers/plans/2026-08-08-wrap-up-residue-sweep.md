# Wrap-Up Residue Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:wrap-up` a close-time residue sweep so outstanding work acquires a tracked disposition instead of surviving as prose in a transcript.

**Architecture:** A new `bin/lib/residue/` module computes findings from git and forge state via injectable runners (the pattern `bin/lib/wrap-up/state.js` already uses). `bin/residue.js` is its CLI. `/wrap-up` runs the sweep as a preamble to Step 8.5, whose existing nothing-left-behind gate then forces each finding's disposition; `/tidy` re-points three existing steps at the same probes, so the scans exist once in JavaScript. The report template gains `Outstanding` (every row carrying a disposition) and `Routed` (pointers to durable destinations).

**Tech Stack:** Node 18+, `node --test`, CommonJS, `git` CLI, `gh` CLI (optional — absence degrades to `unknown`, never to "clean").

## Global Constraints

- **Purity:** `bin/lib/residue/probes/*.js` and `scope.js` take an injectable runner and perform no I/O of their own. Follow `bin/lib/wrap-up/state.js`'s `readState({ cwd, since, run })` shape exactly.
- **Unknown is printed, never omitted.** Every probe result carries `ran: true|false` and a `reason` when false. A probe that could not run must never render as one that found nothing (`skills/wrap-up/SKILL.md` Step 7.9's established `audit not run` convention).
- **Exit codes:** 0 for any successful render including a degraded one; 2 only for a malformed invocation. Copy `bin/wrap-up-state.js`'s contract.
- **Fixtures, never live repo state.** No test may assert against this repository's real branches, worktrees, or history (`[IL-80]`).
- **`skills/wrap-up/SKILL.md` has 382 bytes of headroom** (40,578 of a 40,960 soft ceiling). Task 8 measures before and after; exceeding it is a stop, not a judgment call.
- **Worktree domains are separate.** Never create a worktree with `git worktree add` under `.claude/worktrees/` (ADR-0004, `docs/decisions/0004-worktree-two-domain-convention.md`). Detect worktrees via `git worktree list` or `GIT_DIR != GIT_COMMON`, never by asserting a directory name.
- **Commit discipline:** verify `git diff --cached --name-only` immediately before every commit (`[IL-42]`). Use `refs #185`-style references, never closing keywords, in task commits.

---

### Task 1: Finding shape and fingerprinting

**Files:**
- Create: `bin/lib/residue/finding.js`
- Create: `bin/lib/residue/tests/finding.test.js`
- Modify: `package.json` (test glob)

**Interfaces:**
- Consumes: `bin/lib/health-core/fingerprint.js`'s `createFingerprint(skillName, fields)` — a **factory** returning `{ fingerprint, normalizeDescription }`; call `fingerprint(obj)` on the returned object. Also `bin/lib/health-core/finding-validation.js`'s `requireNonEmptyStrings(obj, fields)` returning an array of error strings (empty when valid).
- Produces: `makeFinding({ kind, scope, subject, remedy, evidence })` returning a finding object with an added `id`; `validateFinding(finding)` returning `string[]` of errors; `KINDS` and `REMEDIES` frozen arrays.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/finding.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { makeFinding, validateFinding, KINDS, REMEDIES } = require('../finding');

const BRANCH = {
  kind: 'branch', scope: 'blast-radius', subject: 'worktree-foo',
  remedy: 'auto', evidence: 'git branch -r --merged origin/main',
};

test('makeFinding assigns a stable id for identical input', () => {
  assert.strictEqual(makeFinding(BRANCH).id, makeFinding(BRANCH).id);
});

test('makeFinding assigns different ids to different subjects', () => {
  const other = makeFinding({ ...BRANCH, subject: 'worktree-bar' });
  assert.notStrictEqual(makeFinding(BRANCH).id, other.id);
});

test('the id is stable across cosmetic evidence rewording', () => {
  // Evidence is diagnostic text, not identity — re-running a probe that
  // formats its output differently must not re-file the same finding.
  const reworded = makeFinding({ ...BRANCH, evidence: 'git   branch -r  --merged   origin/main' });
  assert.strictEqual(makeFinding(BRANCH).id, reworded.id);
});

test('validateFinding rejects an unknown kind', () => {
  const errors = validateFinding(makeFinding({ ...BRANCH, kind: 'nonsense' }));
  assert.ok(errors.some((e) => e.includes('kind')), `expected a kind error, got ${JSON.stringify(errors)}`);
});

test('validateFinding rejects a missing subject', () => {
  const errors = validateFinding(makeFinding({ ...BRANCH, subject: '' }));
  assert.ok(errors.some((e) => e.includes('subject')), `expected a subject error, got ${JSON.stringify(errors)}`);
});

test('validateFinding accepts a well-formed finding', () => {
  assert.deepStrictEqual(validateFinding(makeFinding(BRANCH)), []);
});

test('KINDS and REMEDIES are frozen', () => {
  assert.ok(Object.isFrozen(KINDS) && Object.isFrozen(REMEDIES));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/finding.test.js`
Expected: FAIL — `Cannot find module '../finding'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// bin/lib/residue/finding.js — the shared residue finding shape.
//
// `id` is a fingerprint over identity fields only. Evidence is deliberately
// excluded from the basis: it is diagnostic text, and a probe that reformats
// its output must not mint a new id and re-file a finding already tracked.
'use strict';

const { createFingerprint } = require('../health-core/fingerprint');
const { requireNonEmptyStrings } = require('../health-core/finding-validation');

const KINDS = Object.freeze(['worktree', 'branch', 'claim', 'pr', 'suite', 'release']);
const REMEDIES = Object.freeze(['auto', 'record']);

const { fingerprint } = createFingerprint('residue', ['kind', 'scope', 'subject']);

function makeFinding({ kind, scope, subject, remedy, evidence } = {}) {
  const base = { kind, scope, subject, remedy, evidence };
  return { ...base, id: fingerprint(base) };
}

function validateFinding(finding = {}) {
  const errors = requireNonEmptyStrings(finding, ['id', 'kind', 'scope', 'subject', 'remedy', 'evidence']);
  if (finding.kind && !KINDS.includes(finding.kind)) errors.push(`kind: must be one of ${KINDS.join(', ')} (got ${JSON.stringify(finding.kind)})`);
  if (finding.remedy && !REMEDIES.includes(finding.remedy)) errors.push(`remedy: must be one of ${REMEDIES.join(', ')} (got ${JSON.stringify(finding.remedy)})`);
  if (finding.scope && !['blast-radius', 'observed'].includes(finding.scope)) errors.push(`scope: must be blast-radius or observed (got ${JSON.stringify(finding.scope)})`);
  return errors;
}

module.exports = { makeFinding, validateFinding, KINDS, REMEDIES };
```

- [ ] **Step 4: Add the test glob**

In `package.json`, add `bin/lib/residue/tests/*.test.js` to the `test` script's enumerated glob list, immediately after `bin/lib/wrap-up/tests/*.test.js`. The list does not pick up new directories on its own (`[IL-84]`).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test bin/lib/residue/tests/finding.test.js`
Expected: PASS (7 tests)

Then confirm the glob works: `npm test 2>&1 | grep -c "residue"` — expected: non-zero.

- [ ] **Step 6: Verify the id-stability test discriminates**

Temporarily add `'evidence'` to the `createFingerprint` field list. Re-run the suite: the "stable across cosmetic evidence rewording" test MUST fail. Revert. A test that reads correct but cannot fail is not evidence (`[IL-105]`).

- [ ] **Step 7: Commit**

```bash
git add bin/lib/residue/finding.js bin/lib/residue/tests/finding.test.js package.json
git diff --cached --name-only
git commit -m "Add the residue finding shape and its fingerprint — refs #185"
```

---

### Task 2: Scope resolution

**Files:**
- Create: `bin/lib/residue/scope.js`
- Create: `bin/lib/residue/tests/scope.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — this task is independent.
- Produces: `resolveScope({ base, run })` returning `{ ran, reason, base, branches, worktrees, headBranch }` where `branches` is `string[]` of branch names whose tip is reachable from HEAD, `worktrees` is `Array<{ path, branch, locked }>`, and `ran` is `false` with a `reason` string when the base is unresolvable.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/scope.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveScope } = require('../scope');

// Same stub shape as bin/lib/wrap-up/tests/state.test.js: a map of
// joined-args -> output, with null modelling a failing git invocation.
function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

// Verified against real `git worktree list --porcelain` output: the locked
// line carries a payload ("locked claude session … (pid 44923 …)"), it is NOT
// a bare "locked". A parser matching the bare token reports every live
// worktree as unlocked — which would mark a session in use for auto-removal.
const WORKTREE_PORCELAIN = [
  'worktree /repo', 'HEAD aaa', 'branch refs/heads/main', '',
  'worktree /repo/.claude/worktrees/feat', 'HEAD bbb', 'branch refs/heads/worktree-feat',
  'locked claude session feat (pid 44923 start Sat Aug  8 07:04:41 2026)', '',
].join('\n');

const REPO = {
  'rev-parse --is-inside-work-tree': 'true',
  'rev-parse --verify a1b2c3d': 'a1b2c3d',
  'branch --show-current': 'worktree-feat',
  'branch --format=%(refname:short) --merged HEAD': 'main\nworktree-feat\nworktree-old',
  'worktree list --porcelain': WORKTREE_PORCELAIN,
};

test('resolveScope lists branches merged into HEAD', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.strictEqual(s.ran, true);
  assert.deepStrictEqual(s.branches, ['main', 'worktree-feat', 'worktree-old']);
});

test('resolveScope parses worktrees including their locked state', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.deepStrictEqual(s.worktrees, [
    { path: '/repo', branch: 'main', locked: false, lockReason: null },
    {
      path: '/repo/.claude/worktrees/feat',
      branch: 'worktree-feat',
      locked: true,
      lockReason: 'claude session feat (pid 44923 start Sat Aug  8 07:04:41 2026)',
    },
  ]);
});

test('a lock line with a reason payload still reads as locked', () => {
  // Guards the exact defect this fixture was corrected for: matching only a
  // bare "locked" token marks every live session's worktree auto-removable.
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.strictEqual(s.worktrees[1].locked, true);
});

test('an unresolvable base does not run, and says why', () => {
  const s = resolveScope({ base: 'nope', run: stubRunner(REPO) });
  assert.strictEqual(s.ran, false);
  assert.match(s.reason, /not a resolvable commit-ish/);
});

test('outside a repository the scope does not run, and says why', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner({}) });
  assert.strictEqual(s.ran, false);
  assert.match(s.reason, /not a git repository/);
});

test('a missing base is a malformed call, not a degraded read', () => {
  assert.throws(() => resolveScope({ run: stubRunner(REPO) }), /base is required/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/scope.test.js`
Expected: FAIL — `Cannot find module '../scope'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// bin/lib/residue/scope.js — resolve what "this work" covers.
//
// The base is a commit-ish supplied by the caller (the same base the State
// block prints), so a wrong base is visible in the output rather than
// silently narrowing the window. Every field is present even when the scope
// could not be resolved; `ran: false` plus a reason is how that is reported —
// an empty branch list must never be confusable with an unrun scan.
'use strict';

const { execFileSync } = require('node:child_process');

function defaultRunner(cwd) {
  return (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function parseWorktrees(porcelain) {
  const out = [];
  let current = null;
  for (const line of String(porcelain).split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null, locked: false, lockReason: null };
      out.push(current);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (current && (line === 'locked' || line.startsWith('locked '))) {
      // The locked line carries a reason payload when one was given
      // ("locked claude session … (pid …)") and is bare otherwise. Matching
      // only the bare token reports every live worktree as unlocked.
      current.locked = true;
      current.lockReason = line === 'locked' ? null : line.slice('locked '.length);
    }
  }
  return out;
}

function resolveScope({ base, cwd, run } = {}) {
  if (!base) throw new Error('resolveScope: base is required');
  const git = run || defaultRunner(cwd);
  const empty = { ran: false, reason: null, base, branches: [], worktrees: [], headBranch: null };

  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return { ...empty, reason: 'not a git repository' };
  }
  if (!git(['rev-parse', '--verify', base])) {
    return { ...empty, reason: `base is not a resolvable commit-ish: ${base}` };
  }

  const merged = git(['branch', '--format=%(refname:short)', '--merged', 'HEAD']);
  const worktrees = git(['worktree', 'list', '--porcelain']);
  return {
    ran: true,
    reason: null,
    base,
    branches: merged ? merged.split('\n').filter(Boolean) : [],
    worktrees: worktrees ? parseWorktrees(worktrees) : [],
    headBranch: git(['branch', '--show-current']) || null,
  };
}

module.exports = { resolveScope, parseWorktrees };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/residue/tests/scope.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Verify the degradation tests discriminate**

Temporarily change the non-repo branch to return `{ ...empty, ran: true }`. The "outside a repository" test MUST fail. Revert. This is the exact confusion the `ran` flag exists to prevent.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/residue/scope.js bin/lib/residue/tests/scope.test.js
git diff --cached --name-only
git commit -m "Resolve residue scope from a caller-supplied base — refs #185"
```

---

### Task 3: Git-state probes (worktrees, branches)

**Files:**
- Create: `bin/lib/residue/probes/worktrees.js`
- Create: `bin/lib/residue/probes/branches.js`
- Create: `bin/lib/residue/tests/probes-git.test.js`

**Interfaces:**
- Consumes: Task 1's `makeFinding`; Task 2's `resolveScope` return shape (the `worktrees` and `branches` arrays, and `headBranch`).
- Produces: `probeWorktrees({ scope, reaperDomain })` and `probeBranches({ scope, run })`, each returning `{ ran, reason, findings }`.

**Domain rule (ADR-0004):** a worktree under `.claude/worktrees/` is the harness-owned domain, which `SessionStart`'s reaper collects from; one under `.worktrees/` is superpowers' domain and has no reaper. The finding's `remedy` differs accordingly, and neither is detected by asserting a directory name for *existence* — `resolveScope` already enumerated them via `git worktree list`.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/probes-git.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { probeWorktrees } = require('../probes/worktrees');
const { probeBranches } = require('../probes/branches');

function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

const SCOPE = {
  ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat',
  branches: ['main', 'worktree-feat', 'worktree-old'],
  worktrees: [
    { path: '/repo', branch: 'main', locked: false },
    { path: '/repo/.claude/worktrees/live', branch: 'worktree-live', locked: true },
    { path: '/repo/.claude/worktrees/done', branch: 'worktree-done', locked: false },
    { path: '/repo/.worktrees/fallback', branch: 'worktree-fallback', locked: false },
  ],
};

test('the main working tree is never a finding', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.ok(!findings.some((f) => f.subject === '/repo'), 'main checkout must not be reported');
});

test('a locked worktree is reported for a human, not for auto-removal', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  const locked = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.strictEqual(locked.remedy, 'record', 'a live lock means a session is using it');
});

test('an unlocked worktree in the harness domain is auto-remediable', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.strictEqual(findings.find((f) => f.subject === '/repo/.claude/worktrees/done').remedy, 'auto');
});

test('an unlocked worktree outside the reaper domain is still auto-remediable', () => {
  // No reaper collects .worktrees/ — that makes explicit teardown MORE
  // necessary, not less.
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.strictEqual(findings.find((f) => f.subject === '/repo/.worktrees/fallback').remedy, 'auto');
});

test('an unresolved scope produces no findings and says why', () => {
  const r = probeWorktrees({ scope: { ran: false, reason: 'not a git repository', worktrees: [] } });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /not a git repository/);
});

test('a merged remote branch is reported as auto-remediable', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  const stale = findings.find((f) => f.subject === 'origin/worktree-old');
  assert.strictEqual(stale.kind, 'branch');
  assert.strictEqual(stale.remedy, 'auto');
});

test('the integration branch itself is never a finding', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.ok(!findings.some((f) => f.subject === 'origin/main'), 'deleting the integration branch would be catastrophic');
});

test('the branch currently checked out is never a finding', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-feat' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.ok(!findings.some((f) => f.subject.endsWith('worktree-feat')), 'HEAD is on this branch');
});

test('branches on other remotes are never findings', () => {
  // Verified live: `git branch -r --merged origin/main` in this repo returns
  // local-check/main, local/main-check, and a bare `origin` alongside
  // origin/*. Proposing a delete on another remote's main is the worst
  // output this probe could produce.
  const run = stubRunner({
    'branch -r --format=%(refname:short) --merged origin/main':
      'origin\norigin/main\nlocal-check/main\nlocal/main-check\norigin/worktree-old',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.deepStrictEqual(findings.map((f) => f.subject), ['origin/worktree-old']);
});

test('an unreadable branch list does not run, rather than reporting none', () => {
  const r = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run: stubRunner({}) });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/probes-git.test.js`
Expected: FAIL — `Cannot find module '../probes/worktrees'`

- [ ] **Step 3: Write the worktree probe**

```javascript
// bin/lib/residue/probes/worktrees.js — worktrees that outlived their work.
//
// Existence comes from `git worktree list` (via resolveScope), never from
// asserting a directory name — ADR-0004. The directory only decides whether a
// reaper would eventually collect it, which changes the evidence line, not
// whether it is reported.
'use strict';

const path = require('node:path');
const { makeFinding } = require('../finding');

const REAPER_DOMAIN = path.join('.claude', 'worktrees');

function probeWorktrees({ scope } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const findings = [];
  for (const wt of scope.worktrees) {
    // The first entry of `git worktree list` is the main working tree. It is
    // never residue, and removing it is not a thing that can happen.
    if (wt === scope.worktrees[0]) continue;
    const reaped = wt.path.includes(REAPER_DOMAIN);
    findings.push(makeFinding({
      kind: 'worktree',
      scope: 'blast-radius',
      subject: wt.path,
      // A live lock means a session is using it; that is a human's call.
      remedy: wt.locked ? 'record' : 'auto',
      evidence: wt.locked
        ? `git worktree list --porcelain: locked, branch ${wt.branch || 'unknown'}`
        : `git worktree list --porcelain: unlocked, branch ${wt.branch || 'unknown'}, ${reaped ? 'in reaper domain' : 'outside reaper domain (no reaper collects it)'}`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeWorktrees, REAPER_DOMAIN };
```

- [ ] **Step 4: Write the branch probe**

```javascript
// bin/lib/residue/probes/branches.js — remote branches already merged.
//
// Two exclusions are load-bearing: the integration branch itself (always
// "merged" into itself) and the branch HEAD is currently on (deleting it
// strands the session). Both are absences, so each has its own test — an
// exclusion that silently stops matching produces no error, just a
// catastrophic recommendation.
'use strict';

const { makeFinding } = require('../finding');

function probeBranches({ scope, integrationBranch, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const cmd = ['branch', '-r', '--format=%(refname:short)', '--merged', integrationBranch];
  const out = run(cmd);
  if (out === null) {
    return { ran: false, reason: `could not read merged remote branches (${integrationBranch})`, findings: [] };
  }
  // `--merged` lists branches across EVERY configured remote, plus a bare
  // remote-name entry. Verified live: an `origin/main` query returned
  // `local-check/main`, `local/main-check`, and a bare `origin`. Restrict to
  // the integration branch's own remote — proposing a delete on another
  // remote's main is the worst thing this probe could produce.
  const remotePrefix = `${integrationBranch.split('/')[0]}/`;
  const findings = [];
  for (const name of out.split('\n').filter(Boolean)) {
    if (name === integrationBranch) continue;
    if (!name.startsWith(remotePrefix)) continue;
    if (name.endsWith('/HEAD')) continue;
    if (scope.headBranch && name.endsWith(`/${scope.headBranch}`)) continue;
    findings.push(makeFinding({
      kind: 'branch',
      scope: 'blast-radius',
      subject: name,
      remedy: 'auto',
      evidence: `git ${cmd.join(' ')} — merged, not deleted`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeBranches };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/residue/tests/probes-git.test.js`
Expected: PASS (9 tests)

- [ ] **Step 6: Verify the exclusion tests discriminate**

Remove the `if (name === integrationBranch) continue;` line and re-run: the "integration branch itself is never a finding" test MUST fail. Restore it. Repeat for the `headBranch` exclusion. An exclusion is exactly the kind of code that passes review by reading right (`[IL-105]`).

- [ ] **Step 7: Commit**

```bash
git add bin/lib/residue/probes/worktrees.js bin/lib/residue/probes/branches.js bin/lib/residue/tests/probes-git.test.js
git diff --cached --name-only
git commit -m "Add the worktree and branch residue probes — refs #185"
```

---

### Task 4: Forge and claim probes

**Files:**
- Create: `bin/lib/residue/probes/forge.js`
- Create: `bin/lib/residue/probes/claims.js`
- Create: `bin/lib/residue/tests/probes-forge.test.js`

**Interfaces:**
- Consumes: Task 1's `makeFinding`; Task 2's scope shape.
- Produces: `probeForge({ scope, run })` and `probeClaims({ scope, run })`, each returning `{ ran, reason, findings }`. `run` here takes a full argv array whose first element is the executable (`['gh', 'pr', 'list', ...]`), so absence of `gh` is modelled as `null` exactly like a failing git call.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/probes-forge.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { probeForge } = require('../probes/forge');
const { probeClaims } = require('../probes/claims');

function stubRunner(responses) {
  return (argv) => (Object.prototype.hasOwnProperty.call(responses, argv.join(' ')) ? responses[argv.join(' ')] : null);
}

const SCOPE = { ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat', branches: [], worktrees: [] };
const PR_LIST = 'gh pr list --state open --json number,title,headRefName';
const PRS = JSON.stringify([
  { number: 182, title: 'Read Key Files', headRefName: 'worktree-fix-154' },
  { number: 198, title: 'Reaping', headRefName: 'worktree-feat' },
]);

test('an open PR for this work is reported', () => {
  const { findings } = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: PRS }) });
  assert.ok(findings.some((f) => f.subject === 'PR #198'), 'the PR for HEAD branch is this work');
});

test('an open PR for another lane is reported but not auto-remediable', () => {
  const { findings } = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: PRS }) });
  const other = findings.find((f) => f.subject === 'PR #182');
  assert.strictEqual(other.remedy, 'record', 'residue must not act on another lane PR');
  assert.strictEqual(other.scope, 'observed');
});

test('a missing gh does not run, rather than reporting a clean forge', () => {
  const r = probeForge({ scope: SCOPE, run: stubRunner({}) });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /gh/);
});

test('unparseable gh output does not run, rather than throwing', () => {
  const r = probeForge({ scope: SCOPE, run: stubRunner({ [PR_LIST]: 'not json' }) });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /could not parse/);
});

// Claims are enumerated from the REMOTE — they are created via `gh api
// .../git/refs` and never exist as local refs. A fixture keyed on
// `git for-each-ref refs/claims` would pass while the real probe saw
// nothing forever.
const CLAIM_LIST = 'gh api repos/{owner}/{repo}/git/matching-refs/claims/ -q .[].ref';

test('a claim ref for a closed record is reported as auto-releasable', () => {
  const run = stubRunner({
    [CLAIM_LIST]: 'refs/claims/issue-185',
    'gh issue view 185 --json state': JSON.stringify({ state: 'CLOSED' }),
  });
  const { findings } = probeClaims({ scope: SCOPE, run });
  const claim = findings.find((f) => f.subject === 'refs/claims/issue-185');
  assert.strictEqual(claim.remedy, 'auto');
});

test('a claim ref for an open record is not residue', () => {
  const run = stubRunner({
    [CLAIM_LIST]: 'refs/claims/issue-185',
    'gh issue view 185 --json state': JSON.stringify({ state: 'OPEN' }),
  });
  assert.deepStrictEqual(probeClaims({ scope: SCOPE, run }).findings, []);
});

test('an unreadable record state leaves the claim alone', () => {
  const run = stubRunner({ [CLAIM_LIST]: 'refs/claims/issue-185' });
  const r = probeClaims({ scope: SCOPE, run });
  assert.deepStrictEqual(r.findings, [], 'releasing a claim whose state is unknown could unclaim live work');
  assert.strictEqual(r.ran, true, 'the scan itself ran; it simply had nothing provable');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/probes-forge.test.js`
Expected: FAIL — `Cannot find module '../probes/forge'`

- [ ] **Step 3: Write the forge probe**

```javascript
// bin/lib/residue/probes/forge.js — open PRs this session is implicated in.
//
// `gh` is optional across this plugin, so its absence must render `unknown`
// rather than an empty-and-therefore-clean forge. A PR on another lane is
// reported (the session observed it) but never auto-remediable — acting on
// another lane's PR is well outside what a wrap-up may decide.
'use strict';

const { makeFinding } = require('../finding');

function probeForge({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const argv = ['gh', 'pr', 'list', '--state', 'open', '--json', 'number,title,headRefName'];
  const out = run(argv);
  if (out === null) return { ran: false, reason: 'gh unavailable or not authenticated', findings: [] };

  let prs;
  try {
    prs = JSON.parse(out);
  } catch {
    return { ran: false, reason: 'could not parse gh pr list output', findings: [] };
  }
  if (!Array.isArray(prs)) return { ran: false, reason: 'could not parse gh pr list output', findings: [] };

  const findings = prs.map((pr) => {
    const mine = scope.headBranch && pr.headRefName === scope.headBranch;
    return makeFinding({
      kind: 'pr',
      scope: mine ? 'blast-radius' : 'observed',
      subject: `PR #${pr.number}`,
      remedy: 'record',
      evidence: `${argv.join(' ')} — open, head ${pr.headRefName}${mine ? ' (this work)' : ' (another lane)'}`,
    });
  });
  return { ran: true, reason: null, findings };
}

module.exports = { probeForge };
```

- [ ] **Step 4: Write the claim probe**

```javascript
// bin/lib/residue/probes/claims.js — claim refs outliving their record.
//
// A claim is released ONLY on proof the record is closed. An unreadable
// record state yields no finding: releasing a claim whose state is unknown
// could unclaim live work another session is holding. That is a ran-but-empty
// result, not a failed scan.
//
// Claims live on the REMOTE. They are created via `gh api .../git/refs`
// (`_shared/issue-claims.md`) and never pushed from a local ref, and the
// default fetch refspec is `+refs/heads/*` only — so `git for-each-ref
// refs/claims` is empty on every machine, always. Enumerate the same way
// `_shared/issue-claims.md` and `/tidy` Step 4.7 do, or this probe reports
// a clean sweep forever while seeing nothing.
'use strict';

const { makeFinding } = require('../finding');

function probeClaims({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  // `{owner}`/`{repo}` are LITERAL — gh substitutes them from repo context.
  const refs = run(['gh', 'api', 'repos/{owner}/{repo}/git/matching-refs/claims/', '-q', '.[].ref']);
  if (refs === null) {
    return { ran: false, reason: 'could not list claim refs (gh unavailable or not authenticated)', findings: [] };
  }

  const findings = [];
  for (const ref of refs.split('\n').filter(Boolean)) {
    const match = /issue-(\d+)$/.exec(ref);
    if (!match) continue;
    const stateOut = run(['gh', 'issue', 'view', match[1], '--json', 'state']);
    if (stateOut === null) continue;
    let state;
    try {
      state = JSON.parse(stateOut).state;
    } catch {
      continue;
    }
    if (String(state).toLowerCase() !== 'closed') continue;
    findings.push(makeFinding({
      kind: 'claim',
      scope: 'blast-radius',
      subject: ref,
      remedy: 'auto',
      evidence: `gh issue view ${match[1]} --json state — CLOSED, claim ref still present`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeClaims };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/residue/tests/probes-forge.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Verify the safety tests discriminate**

Change the claim probe's `continue` on unreadable state into a `findings.push(...)`. The "unreadable record state leaves the claim alone" test MUST fail. Revert.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/residue/probes/forge.js bin/lib/residue/probes/claims.js bin/lib/residue/tests/probes-forge.test.js
git diff --cached --name-only
git commit -m "Add the forge and claim residue probes — refs #185"
```

---

### Task 5: Suite and release probes

**Files:**
- Create: `bin/lib/residue/probes/suite.js`
- Create: `bin/lib/residue/probes/release.js`
- Create: `bin/lib/residue/tests/probes-observed.test.js`

**Interfaces:**
- Consumes: Task 1's `makeFinding`; Task 2's scope shape.
- Produces: `probeSuite({ scope, run, timeoutMs })` and `probeRelease({ scope, run, manifest })`, each returning `{ ran, reason, findings }`. `probeSuite`'s `run` returns `{ code, stdout }` or `null`.

**Guard:** `probeRelease` applies only when the manifest's `name` is `claude-tweaks`, mirroring `bin/lib/hooks/post-tool-use.js`'s own check. Every other project gets `ran: false, reason: 'not applicable'`.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/probes-observed.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { probeSuite } = require('../probes/suite');
const { probeRelease } = require('../probes/release');

const SCOPE = { ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat', branches: [], worktrees: [] };

test('a failing suite is reported as observed residue', () => {
  const { findings, ran } = probeSuite({ scope: SCOPE, run: () => ({ code: 1, stdout: '# fail 1\nnot ok 3 - heading unique' }) });
  assert.strictEqual(ran, true);
  assert.strictEqual(findings[0].kind, 'suite');
  assert.strictEqual(findings[0].scope, 'observed', 'a red suite counts whether or not this work caused it');
});

test('a passing suite produces no findings', () => {
  assert.deepStrictEqual(probeSuite({ scope: SCOPE, run: () => ({ code: 0, stdout: '# pass 8' }) }).findings, []);
});

test('an unrunnable suite does not run, rather than reporting green', () => {
  const r = probeSuite({ scope: SCOPE, run: () => null });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /could not run/);
});

test('a timed-out suite does not run, rather than reporting green', () => {
  const r = probeSuite({ scope: SCOPE, run: () => ({ code: null, stdout: '', timedOut: true }) });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /timed out/);
});

test('the release probe is inert outside claude-tweaks', () => {
  const r = probeRelease({ scope: SCOPE, manifest: { name: 'some-other-plugin', version: '1.0.0' }, run: () => null });
  assert.strictEqual(r.ran, false);
  assert.match(r.reason, /not applicable/);
});

test('a version missing from the changelog is reported', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.64.0 — old\n' : '6.64.0\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.ok(findings.some((f) => f.evidence.includes('CHANGELOG.md')), 'the missing changelog entry must be named');
});

test('a version missing from the shipped record is reported', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.68.1 — new\n' : '6.64.0\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.ok(findings.some((f) => f.evidence.includes('shipped-versions.tsv')), 'the missing shipped line must be named');
});

test('a complete release triple produces no findings', () => {
  const run = (argv) => (argv.join(' ').includes('CHANGELOG.md') ? '# Changelog\n\n## v6.68.1 — new\n' : '6.68.1\t2026-08-08\trelease\n');
  const { findings } = probeRelease({ scope: SCOPE, manifest: { name: 'claude-tweaks', version: '6.68.1' }, run });
  assert.deepStrictEqual(findings, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/probes-observed.test.js`
Expected: FAIL — `Cannot find module '../probes/suite'`

- [ ] **Step 3: Write the suite probe**

```javascript
// bin/lib/residue/probes/suite.js — the project's own test suite at close time.
//
// This is the `observed` class: a suite red for reasons unrelated to this
// work still belongs in the report, because the session hit it. A suite that
// could not be run, or timed out, reports `ran: false` — never green.
'use strict';

const { makeFinding } = require('../finding');

function probeSuite({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  const result = run();
  if (result === null) return { ran: false, reason: 'could not run the project test command', findings: [] };
  if (result.timedOut) return { ran: false, reason: 'test command timed out', findings: [] };
  if (result.code === 0) return { ran: true, reason: null, findings: [] };

  const failing = String(result.stdout || '').split('\n').filter((l) => l.startsWith('not ok')).slice(0, 5);
  return {
    ran: true,
    reason: null,
    findings: [makeFinding({
      kind: 'suite',
      scope: 'observed',
      subject: `test suite exit ${result.code}`,
      remedy: 'record',
      evidence: failing.length ? failing.join('; ') : `test command exited ${result.code}`,
    })],
  };
}

module.exports = { probeSuite };
```

- [ ] **Step 4: Write the release probe**

```javascript
// bin/lib/residue/probes/release.js — this repo's release triple.
//
// Guarded by manifest.name, exactly as bin/lib/hooks/post-tool-use.js guards
// its own release reminder: the triple is a claude-tweaks convention, and
// nagging an adopter about a CHANGELOG heading shape they never adopted is
// noise. The marketplace mirror is deliberately not checked — it lives in a
// separate repository this probe cannot read.
'use strict';

const { makeFinding } = require('../finding');

function probeRelease({ scope, manifest, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  if (!manifest || manifest.name !== 'claude-tweaks') {
    return { ran: false, reason: 'not applicable — release triple is a claude-tweaks convention', findings: [] };
  }
  const version = typeof manifest.version === 'string' ? manifest.version : null;
  if (!version) return { ran: false, reason: 'manifest carries no version string', findings: [] };

  const changelog = run(['git', 'show', 'HEAD:CHANGELOG.md']);
  const record = run(['git', 'show', 'HEAD:docs/shipped-versions.tsv']);
  if (changelog === null || record === null) {
    return { ran: false, reason: 'could not read CHANGELOG.md or docs/shipped-versions.tsv at HEAD', findings: [] };
  }

  const findings = [];
  if (!changelog.includes(`## v${version} — `)) {
    findings.push(makeFinding({
      kind: 'release', scope: 'blast-radius', subject: `CHANGELOG entry for v${version}`, remedy: 'auto',
      evidence: `CHANGELOG.md at HEAD has no "## v${version} — {summary}" heading`,
    }));
  }
  if (!new RegExp(`^${version.replace(/\./g, '\\.')}\t`, 'm').test(record)) {
    findings.push(makeFinding({
      kind: 'release', scope: 'blast-radius', subject: `shipped-versions line for ${version}`, remedy: 'auto',
      evidence: `docs/shipped-versions.tsv at HEAD has no "${version}\t{date}\trelease" line`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeRelease };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/residue/tests/probes-observed.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: Verify the green-vs-unrun tests discriminate**

Change `probeSuite`'s `run() === null` branch to return `{ ran: true, findings: [] }`. The "unrunnable suite does not run" test MUST fail. Revert. Then do the same for `timedOut`. These two are the exact shape of a check that passes whether or not the thing it checks is true (`[IL-105]`).

- [ ] **Step 7: Commit**

```bash
git add bin/lib/residue/probes/suite.js bin/lib/residue/probes/release.js bin/lib/residue/tests/probes-observed.test.js
git diff --cached --name-only
git commit -m "Add the suite and release residue probes — refs #185"
```

---

### Task 6: Render and CLI

**Files:**
- Create: `bin/lib/residue/render.js`
- Create: `bin/residue.js`
- Create: `bin/lib/residue/tests/render.test.js`
- Modify: `docs/plugin-structure.md`

**Interfaces:**
- Consumes: every probe's `{ ran, reason, findings }`; Task 1's `validateFinding`.
- Produces: `renderOutstanding({ results, dispositions })` returning the markdown table as a string. `dispositions` is a map of `finding.id -> string`; a finding with no disposition renders `NEEDS DISPOSITION`. **The renderer never throws and never validates** — it is the last step before the report reaches a human, and throwing there would cost the whole report to save one malformed row, which contradicts this plan's own "a degraded read must never cost the caller the whole report" rule. Validation belongs at construction (`makeFinding`), not at render.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/residue/tests/render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderOutstanding } = require('../render');
const { makeFinding } = require('../finding');

const BRANCH = makeFinding({ kind: 'branch', scope: 'blast-radius', subject: 'origin/worktree-old', remedy: 'auto', evidence: 'merged, not deleted' });

test('a finding with a disposition renders it', () => {
  const out = renderOutstanding({ results: [{ ran: true, findings: [BRANCH] }], dispositions: { [BRANCH.id]: 'Fixed — a1b2c3d' } });
  assert.match(out, /Fixed — a1b2c3d/);
});

test('a finding without a disposition renders NEEDS DISPOSITION, never blank', () => {
  const out = renderOutstanding({ results: [{ ran: true, findings: [BRANCH] }], dispositions: {} });
  assert.match(out, /NEEDS DISPOSITION/);
});

test('an unrun probe renders as unknown with its reason', () => {
  const out = renderOutstanding({ results: [{ ran: false, reason: 'gh unavailable', findings: [] }], dispositions: {} });
  assert.match(out, /unknown/);
  assert.match(out, /gh unavailable/);
});

test('an unrun probe is never rendered as finding nothing', () => {
  const out = renderOutstanding({ results: [{ ran: false, reason: 'gh unavailable', findings: [] }], dispositions: {} });
  assert.doesNotMatch(out, /No outstanding items/);
});

test('a clean run says so explicitly', () => {
  const out = renderOutstanding({ results: [{ ran: true, reason: null, findings: [] }], dispositions: {} });
  assert.match(out, /No outstanding items/);
});

test('a truncated finding list reports the cap rather than hiding it', () => {
  const many = Array.from({ length: 30 }, (_, i) => makeFinding({ ...BRANCH, subject: `origin/b-${i}` }));
  const out = renderOutstanding({ results: [{ ran: true, findings: many }], dispositions: {}, cap: 10 });
  assert.match(out, /20 more/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/residue/tests/render.test.js`
Expected: FAIL — `Cannot find module '../render'`

- [ ] **Step 3: Write the renderer**

```javascript
// bin/lib/residue/render.js — the Outstanding table.
//
// Two rules are load-bearing. A row never renders blank in its Disposition
// column: a blank one is exactly the untracked transcript note this feature
// exists to eliminate. And an unrun probe renders `unknown` with its reason
// rather than contributing to a "No outstanding items" conclusion.
'use strict';

const DEFAULT_CAP = 20;

function renderOutstanding({ results = [], dispositions = {}, cap = DEFAULT_CAP } = {}) {
  const findings = results.filter((r) => r.ran).flatMap((r) => r.findings);
  const unrun = results.filter((r) => !r.ran);

  const lines = [];
  const shown = findings.slice(0, cap);
  if (shown.length) {
    lines.push(`### Outstanding (${findings.length})`, '');
    lines.push('| # | What | Kind | Disposition |', '|---|------|------|-------------|');
    shown.forEach((f, i) => {
      lines.push(`| ${i + 1} | ${f.subject} — ${f.evidence} | ${f.kind} | ${dispositions[f.id] || 'NEEDS DISPOSITION'} |`);
    });
    if (findings.length > shown.length) {
      lines.push('', `> ${findings.length - shown.length} more not shown (cap ${cap}).`);
    }
  } else if (!unrun.length) {
    lines.push('### Outstanding (0)', '', 'No outstanding items — every probe ran and found nothing.');
  } else {
    lines.push('### Outstanding (0)', '');
  }

  if (unrun.length) {
    lines.push('', 'Probes that did not run — these are `unknown`, not clean:', '');
    for (const r of unrun) lines.push(`- unknown: ${r.reason}`);
  }
  return lines.join('\n');
}

module.exports = { renderOutstanding, DEFAULT_CAP };
```

- [ ] **Step 4: Write the CLI**

```javascript
#!/usr/bin/env node
// bin/residue.js — compute outstanding residue at close time.
//
// Exit codes: 0 for any successful render INCLUDING a degraded one; 2 only
// for a malformed invocation. Copies bin/wrap-up-state.js's contract — a
// degraded read must never cost the caller the whole report.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolveScope } = require('./lib/residue/scope');
const { probeWorktrees } = require('./lib/residue/probes/worktrees');
const { probeBranches } = require('./lib/residue/probes/branches');
const { probeForge } = require('./lib/residue/probes/forge');
const { probeClaims } = require('./lib/residue/probes/claims');
const { probeSuite } = require('./lib/residue/probes/suite');
const { probeRelease } = require('./lib/residue/probes/release');
const { renderOutstanding } = require('./lib/residue/render');

function parseArgs(argv) {
  const out = { base: null, scope: 'blast-radius', integrationBranch: 'origin/main', json: false, noSuite: false };
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === '--base' && next && !next.startsWith('--')) { out.base = next; i += 1; continue; }
    if (argv[i] === '--scope' && next && !next.startsWith('--')) { out.scope = next; i += 1; continue; }
    if (argv[i] === '--integration-branch' && next && !next.startsWith('--')) { out.integrationBranch = next; i += 1; continue; }
    if (argv[i] === '--json') { out.json = true; continue; }
    if (argv[i] === '--no-suite') { out.noSuite = true; continue; }
  }
  return out;
}

function runner(cwd) {
  return (argv) => {
    try {
      return execFileSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.base) {
    process.stderr.write('usage: residue.js --base <commit-ish> [--scope blast-radius|repo] [--integration-branch <ref>] [--no-suite] [--json]\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  const run = runner(cwd);
  const git = (args) => run(['git', ...args]);
  const scope = resolveScope({ base: opts.base, run: git });

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.claude-plugin', 'plugin.json'), 'utf8'));
  } catch { /* absent manifest is normal outside this plugin */ }

  const suiteRun = opts.noSuite
    ? () => null
    : () => {
      try {
        return { code: 0, stdout: execFileSync('npm', ['test'], { cwd, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'ignore'] }) };
      } catch (err) {
        if (err && err.killed) return { code: null, stdout: '', timedOut: true };
        if (err && typeof err.status === 'number') return { code: err.status, stdout: String(err.stdout || '') };
        return null;
      }
    };

  const results = [
    probeWorktrees({ scope }),
    probeBranches({ scope, integrationBranch: opts.integrationBranch, run: git }),
    probeForge({ scope, run }),
    probeClaims({ scope, run }),
    probeSuite({ scope, run: suiteRun }),
    // NOTE the runner shapes differ and are NOT interchangeable. probeBranches
    // calls run(['branch', ...]) — bare git args, so it gets the `git` wrapper.
    // probeRelease calls run(['git', 'show', ...]) — full argv including the
    // executable — so it gets the raw `run`, like probeForge/probeClaims.
    // Passing `git` here yields `git git show …`, and the probe then reports
    // ran:false on every invocation of a perfectly healthy repo.
    probeRelease({ scope, manifest, run }),
  ];

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ scope, results }, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderOutstanding({ results })}\n`);
  }
}

main();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/residue/tests/render.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Exercise the CLI against this repository**

Run: `node bin/residue.js --base HEAD~1 --no-suite`
Expected: exit 0, an Outstanding table or an explicit "No outstanding items". Confirm nothing renders with a blank Disposition cell.

Run: `node bin/residue.js` (no `--base`)
Expected: exit 2 with the usage line.

- [ ] **Step 7: Register the module**

In `docs/plugin-structure.md`, add `bin/residue.js` and `bin/lib/residue/` alongside the existing `bin/wrap-up-state.js` entry, including the test invocation `node --test bin/lib/residue/tests/*.test.js`.

- [ ] **Step 8: Commit**

```bash
git add bin/residue.js bin/lib/residue/render.js bin/lib/residue/tests/render.test.js docs/plugin-structure.md
git diff --cached --name-only
git commit -m "Add the residue CLI and Outstanding renderer — refs #185"
```

---

### Task 7: health-core purity boundary

**Files:**
- Create: `bin/lib/health-core/tests/purity.test.js`
- Modify: `bin/lib/health-core/dedup.js` (header comment only)

**Interfaces:**
- Consumes: nothing. Independent of Tasks 1-6.
- Produces: nothing consumed by later tasks. This task defends a property.

**Why:** `dedup.js`'s header already claims "Pure — no I/O, no network", and residue depends on that claim. Nothing enforces it. A future edit adding `require('./durable-state')` would silently give every consumer — including `/wrap-up` — a write to the shared `health-state` git branch, which is the `[IL-73]` hazard.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/health-core/tests/purity.test.js
//
// The pure/stateful split in health-core is real but was previously only a
// convention. dedup.js's own header claims purity and consumers rely on it,
// so this asserts the claim instead of trusting it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PURE_MODULES = [
  'dedup.js', 'finding-validation.js', 'fingerprint.js', 'budget.js',
  'rotation.js', 'mark.js', 'churn-report.js', 'frontmatter-list.js',
];
const FORBIDDEN = ['fs', 'node:fs', 'child_process', 'node:child_process', './durable-state', './cache'];

for (const mod of PURE_MODULES) {
  test(`${mod} imports nothing stateful`, () => {
    const src = fs.readFileSync(path.join(__dirname, '..', mod), 'utf8');
    const imports = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    const violations = imports.filter((i) => FORBIDDEN.includes(i));
    assert.deepStrictEqual(
      violations, [],
      `${mod} is in the pure set but requires ${violations.join(', ')}. `
      + 'Either the import is wrong, or this module belongs in the stateful set — '
      + 'moving it means auditing every consumer that relies on its purity (bin/lib/residue/ does).',
    );
  });
}

test('the pure module list matches what is on disk', () => {
  // A module renamed or deleted must fail loudly rather than silently
  // dropping out of the check.
  for (const mod of PURE_MODULES) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', mod)), `${mod} is listed as pure but does not exist`);
  }
});
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `node --test bin/lib/health-core/tests/purity.test.js`
Expected: PASS (9 tests) — the property already holds; this test is a ratchet, not a fix.

- [ ] **Step 3: Verify the test discriminates**

This step is mandatory. A test asserting an already-true property is exactly the kind that can pass on any input (`[IL-105]`).

Temporarily add `const fs = require('fs');` to the top of `bin/lib/health-core/dedup.js`. Re-run: the `dedup.js imports nothing stateful` test MUST fail, naming `dedup.js` and `fs`. Then remove the line and re-run to confirm PASS.

- [ ] **Step 4: Record the boundary in the header**

In `bin/lib/health-core/dedup.js`, extend the existing "Pure — no I/O, no network." line to:

```
// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network, and asserted so by
// bin/lib/health-core/tests/purity.test.js. Consumers outside the health
// sweeps rely on this (bin/lib/residue/), so adding a stateful import here is
// a breaking change to them, not a local edit.
```

- [ ] **Step 5: Run the full suite**

Run: `npm test 2>&1 | tail -20`
Expected: no new failures. Note `tests/changelog-coverage.test.js` may be red for pre-existing reasons unrelated to this work — record its state before and after to confirm this task changed nothing there.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/health-core/tests/purity.test.js bin/lib/health-core/dedup.js
git diff --cached --name-only
git commit -m "Assert health-core's pure/stateful boundary instead of trusting it — refs #185"
```

---

### Task 8: Wrap-up residue sweep and the record-signal split

**REVISED after the first attempt hit the size ceiling.** A standalone `## Step 8.7` was measured at 723 bytes against 382 of headroom — nearly double, before the signal split's 167. The revision is not a workaround for the budget; it is the better design the budget forced into view.

**The residue sweep feeds Step 8.5's existing gate instead of adding a parallel one.** Step 8.5's nothing-left-behind gate is already per-item forced disposition, and its `Acknowledge` path already creates a real record — precisely the guarantee this feature wants. It skips only when no ledger exists, which is the standalone case by definition. So the sweep becomes the producer that case lacks: its findings are written as ledger items, and the existing three-phase resolve gate forces each one's disposition. No second disposition rule to keep in sync.

**Files:**
- Modify: `skills/wrap-up/SKILL.md` (Step 8.5 preamble + signal split)
- Create: `skills/wrap-up/residue-sweep.md` (already drafted in the first attempt — 5,895 bytes, uncommitted)
- Modify: `skills/wrap-up/cleanup-procedures.md`, `skills/wrap-up/execution-and-verification.md`, `skills/wrap-up/verification-brief.md` — the three files the design doc's Modified table named but the first plan revision failed to schedule (`[IL-56]`)

**Interfaces:**
- Consumes: Task 6's `bin/residue.js` CLI contract.
- Produces: the `Outstanding` rows Task 9's template renders.

**HARD PRECONDITION — measure first.** `skills/wrap-up/SKILL.md` is 40,578 bytes against a 40,960-byte soft ceiling: **382 bytes of headroom**. Step 8.7's pointer plus the record-signal split must fit within it. If the edit exceeds the ceiling, STOP and report — do not proceed by trimming unrelated content, and do not "just go slightly over". The extraction that would make room is its own record.

- [ ] **Step 1: Measure the starting size**

Run: `wc -c skills/wrap-up/SKILL.md`
Record the number. Expected: 40578 (if it differs, the file changed — re-derive the headroom before continuing).

- [ ] **Step 2: Write the residue-sweep procedure**

Create `skills/wrap-up/residue-sweep.md` with: the CLI invocation (`node "${CLAUDE_PLUGIN_ROOT}/bin/residue.js" --base {base} --integration-branch {ref}`), the base-resolution rule (identical to `summary-template.md`'s three-rule ladder — reuse it by reference, do not restate it), the disposition rule (every finding gets `Fixed — {sha}` / `Filed as #{n}` / `Accepted — {reason}`), the `remedy: auto` → scratch-worktree branch (pointing at `_shared/scratch-worktree.md`, Task 10), the `remedy: record` → record-creation branch, and the named triggers for the judgment class (a sibling record read and found wrong; a decision made and not acted on).

State explicitly: a probe reporting `ran: false` renders `unknown` with its reason and is never folded into a "nothing outstanding" conclusion — the same rule Step 7.9 already applies to `audit not run`.

- [ ] **Step 3: Add the sweep as a Step 8.5 preamble (NOT a new step)**

**Hard budget: the total SKILL.md growth across Steps 3 and 5 must be ≤ 382 bytes.** Measure after each edit. There is no SCANNED summary line — the ledger items ARE the audit trail, which is what makes this fit; do not add one back.

Insert at the top of `## Step 8.5`, before its existing "Run the resolve gate" line. Target ≤ 215 bytes including the blank line:

```markdown
**Residue sweep first.** Run `residue-sweep.md` in this skill's directory: it writes what this work leaves outstanding as ledger items, so this gate has something to enforce on a standalone run.
```

Then amend Step 8.5's existing skip condition, which currently reads that the gate is skipped when the ledger "doesn't exist (standalone wrap-up, …), or exists but is empty". That sentence is now wrong for a standalone run: the sweep may have just created the ledger. Adjust it minimally so the skip is conditioned on the ledger being empty **after** the sweep has run, not on the run being standalone. Keep the edit small — rewording, not rewriting.

- [ ] **Step 4: Measure the size after the edit**

Run: `wc -c skills/wrap-up/SKILL.md`
Expected: **at most 40960**. If it exceeds that, revert the Step 8.3 insertion and STOP — report the overage and the required extraction.

- [ ] **Step 5: Split the record-mode signal**

Enumerate the audit set — do not work from a remembered count:

```bash
grep -rn "materialized header" skills/wrap-up/
grep -rn "work/\*-spec.md" skills/wrap-up/
```

For **each** occurrence, restate the criterion against the new question: does this site need a *record identified* (a reference resolved from an argument, branch name, or commit trailer), or does it genuinely need *header fields* (`effort:`, `blocked-by:`) that only a materialized file carries? Record closure, acceptance labeling, unblocked-records, and claim release are the first; anything reading a header field is the second.

Do not bulk-assign. `[IL-101]`: the last time one set was reused as the gate for a second question, three of four answers matched and the fourth was the largest bucket in the repo.

- [ ] **Step 5b: Apply the split to the three files the first revision failed to schedule**

`skills/wrap-up/cleanup-procedures.md`, `execution-and-verification.md`, and `verification-brief.md` carry the identical conflation at the sites governing **claim release**, **record closure**, and **acceptance labeling**. The design doc's Modified table named `cleanup-procedures.md`; the plan's own Files list dropped it, and the other two were never scheduled at all (`[IL-56]`).

These are not optional. Without them `/claude-tweaks:wrap-up #185` standalone still silently skips record closure and acceptance labeling — the headline case this task exists to fix. Apply the same per-site criterion restatement as Step 5; these files have no size ceiling.

- [ ] **Step 6: Verify the split by scenario, not by grep**

Hand-trace `/claude-tweaks:wrap-up #185` invoked standalone (no `$PIPELINE_RUN_DIR`, no `${RUN_DIR}/work/*-spec.md`). Walk the literal edited text across ALL FOUR files and confirm: record closure runs, acceptance labeling runs, unblocked-records runs, claim release runs, and no step attempts to read a header field. A grep cannot answer this — the defect is a step that silently skips.

Also trace the ledger path: on a standalone run with no pre-existing ledger, confirm the sweep's findings create one, and that Step 8.5's amended skip condition then lets the gate run rather than skipping on "standalone".

- [ ] **Step 7: Re-measure and commit**

```bash
wc -c skills/wrap-up/SKILL.md
git add skills/wrap-up/SKILL.md skills/wrap-up/residue-sweep.md
git diff --cached --name-only
git commit -m "Give wrap-up a residue sweep and separate record identity from header presence — refs #185"
```

---

### Task 9: Report template — Outstanding and Routed

**Files:**
- Modify: `skills/wrap-up/summary-template.md`

**Interfaces:**
- Consumes: Task 6's renderer output; the residue findings Task 8 writes as ledger items ahead of Step 8.5.
- Produces: nothing downstream — this is the user-facing surface.

- [ ] **Step 0: Fix the conversation-mode selector — a live bug Task 8's split exposed**

`summary-template.md`'s **Conversation mode** paragraph currently opens: *"When no materialized header exists for this run (`SKILL.md`'s Conversation-based row)…"*. That restates the pre-split equivalence — header-absence means conversation mode — which Task 8 just retired.

Consequence today: for `/claude-tweaks:wrap-up #185` invoked standalone, Steps 1, 8 and 10 all correctly treat the run as record-based, but Step 9 reads this sentence literally and renders the **conversation-mode** template — dropping the `Record #{n}` heading and the Origin / Record / Ledger lines for a run that has a record.

Re-key the selector on **record identity**, matching Task 8's split: conversation mode is for a run where no record was identified (no argument, no branch/commit reference, no header), not merely one with no materialized header. Keep the rest of the paragraph as-is.

- [ ] **Step 1: Replace the Manual Steps Required section**

In `skills/wrap-up/summary-template.md`, replace the `### Manual Steps Required` block with `### Outstanding`, keeping its existing blockquote about rows being real trackable records. Add the `Generate from:` clause it has never had — the third such clause in the file, matching the two that already exist at Actions Performed and Decisions:

```
### Outstanding ({n})
| # | What | Kind | Disposition |
|---|------|------|-------------|
| 1 | {subject — evidence} | {kind} | {Fixed — `{hash}` | Filed as #{n} | Accepted — {reason}} |
(or omit the section entirely — every probe ran and found nothing.)

Generate from: the residue sweep's ledger items (`residue-sweep.md`, run ahead
of Step 8.5), Step 4's routed leftover sections, and any ledger item resolved
to `Acknowledge`.

No row may render without a disposition. A blank Disposition cell is the
untracked transcript note this section exists to eliminate. A probe that could
not run renders as `unknown` with its reason — never folded into an omitted
section, which would read as "nothing outstanding".
```

- [ ] **Step 2: Add the Routed section**

Immediately after `### Outstanding`, add:

```
### Routed ({n})
| Learning | Destination |
|---|---|
| {one line} | {CLAUDE.md [IL-nn] | docs/x.md | record #{n} | Memory | Upstream issue} |

Generate from: every learning routed by Steps 6-7.11, named by destination.

Name the destination; never restate what landed there. This is the existing
rule under Evidence ("Do NOT restate an insight that already became a Decisions
row") given a section of its own. A learning with no destination is visibly
missing from this table, which is the point.
```

- [ ] **Step 3: Add the Verdict line**

At the top of the render template, immediately after the `## Wrap-Up:` heading and before `### State`:

```
### Verdict

{One line: what shipped, where it is now, and what blocks it. State the
push status from the State block's own measurement — never assert "it
landed" from memory.}
```

- [ ] **Step 4: Verify the rendered result, not the diff**

Read the whole template top to bottom. Confirm: no stray sentence landed inside a fenced block, no existing paragraph was split by an insertion, and the section order reads State → Actions Performed → Decisions → Outstanding → Routed → Evidence. Reading the diff cannot catch either failure (`[IL-27]`).

- [ ] **Step 5: Check fence balance**

Run: `grep -c '^```' skills/wrap-up/summary-template.md`
Expected: an even number.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/summary-template.md
git diff --cached --name-only
git commit -m "Give the wrap-up report an Outstanding table with dispositions and a Routed section — refs #185"
```

---

### Task 10: Shared scratch-worktree procedure

**Files:**
- Create: `skills/_shared/scratch-worktree.md`
- Modify: `docs/skill-graph.md`

**Interfaces:**
- Consumes: Task 8's `remedy: auto` branch.
- Produces: the procedure `/tidy` also consumes in Task 11.

- [ ] **Step 1: Write the procedure**

Create `skills/_shared/scratch-worktree.md` covering, in order:

1. **When to provision** — only when at least one finding carries `remedy: auto` AND needs an `Edit`/`Write`/`commit`/`push`. Worktree removal and local branch deletion do not qualify: both are already legal from the main checkout under `pre-tool-use.js`'s `GATE_COVERAGE`. A run with no such finding must never create a worktree.
2. **Creation** — native tool (`EnterWorktree`) first; `git worktree add` into `.worktrees/` only when no native tool exists (`superpowers:using-git-worktrees` Step 1a before 1b). **Never** `git worktree add` under `.claude/worktrees/` — ADR-0004 keeps the two domains separate, and a git-created worktree in the harness domain gets removed out from under the harness's bookkeeping.
3. **First action inside** — `git fetch origin {integration-branch}` then `git merge origin/{integration-branch}`, unconditionally (`[IL-106]`). The harness `worktree.baseRef` default is `fresh`; claude-tweaks expects `head` (`_shared/worktree-base-ref.md`). The merge makes this correct under either.
4. **Apply** — one remedy per commit, so a mid-sequence failure leaves the completed ones intact.
5. **Return** — `git push . <sha>:{integration-branch}`; when that branch is checked out the push is refused, so use a branch-guarded `git merge --ff-only` verified with `git branch --show-current` in the same command (`[IL-05]`).
6. **Teardown** — `ExitWorktree`, never raw `git worktree remove` (it fails on the live lock, `[IL-58]`). A `.worktrees/` worktree has no reaper and MUST be torn down explicitly; a `.claude/worktrees/` one is collected by `SessionStart`'s reaper if teardown fails.
7. **Shell constraint** — after entering a worktree, `&&` chains and heredocs are refused by shape. One plain command per call; use `Edit` rather than heredoc append.

- [ ] **Step 2: Record the edges**

In `docs/skill-graph.md`, add the `/wrap-up` → `_shared/scratch-worktree.md` and `/tidy` → `_shared/scratch-worktree.md` edges. Every relationship is stated once, there.

- [ ] **Step 3: Verify against the live gate**

Confirm the claim about what is legal from the main checkout by reading `bin/lib/hooks/pre-tool-use.js`'s exported `GATE_COVERAGE` — it must still list `Edit`, `Write`, `NotebookEdit` and git `commit`/`push`. If it has widened, correct the procedure's step 1 to match rather than shipping a stale claim.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/scratch-worktree.md docs/skill-graph.md
git diff --cached --name-only
git commit -m "Add the shared scratch-worktree procedure for post-teardown remedies — refs #185"
```

---

### Task 11: Point /tidy at the shared probes

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: Task 6's CLI (`--scope repo`); Task 10's procedure.
- Produces: nothing downstream.

**Convention note:** `_shared/health-finding-shapes.md` establishes that each consumer writes its shared *prose* out in full inline. So this task does NOT replace `/tidy`'s wording with a pointer to wrap-up's. It replaces `/tidy`'s hand-run git commands with the shared CLI, keeping `/tidy`'s own recommendation vocabulary and its own inline explanation.

- [ ] **Step 0: Fix two scratch-worktree instructions that predate `_shared/scratch-worktree.md`**

Both were found by Task 10's reviewer and confirmed against the live files. Neither is a stylistic tidy-up.

**(a) `skills/tidy/SKILL.md` line ~199 — a provable functional bug.** Its `worktree.always` branch says to remove the scratch worktree *"mirroring Step 4.5's own worktree cleanup"*, and Step 4.5 uses raw `git -C "{REPO_ROOT}" worktree remove {path}`. That is valid only for worktrees the session is **not** standing in. The scratch worktree is by definition the one it just worked inside, so the harness holds a live lock and the raw remove exits 128 — the exact case `[IL-58]` was narrowed to cover, and the reason `cleanup-procedures.md` Section C step 4 distinguishes the two. Repoint the whole branch at `_shared/scratch-worktree.md`, whose §6 already states `ExitWorktree` is the only remedy here.

**(b) `skills/flow/worktree-merge.md` line ~73 — a missing branch guard.** Its fast-forward step is a bare `git merge --ff-only` with no `git branch --show-current` verification in the same compound command. That is `[IL-05]` precisely: concurrent sessions switch the main checkout's branch underfoot. Add the guard, matching the shape in `_shared/scratch-worktree.md` §5 and the precedent in `dispatch/settle-and-merge.md`. Its `git worktree add` also names no directory — make it cite `_shared/scratch-worktree.md` §2 rather than leaving the domain choice implicit (ADR-0004).

Do not restate the procedure in either file — cite `_shared/scratch-worktree.md`. That is the whole point of Task 10 having created it.

- [ ] **Step 1: Re-point Step 4.5**

In `skills/tidy/scan-procedures.md` Step 4.5, replace the hand-run `git worktree list` / `git branch --list "build/*"` enumeration with:

    node "${CLAUDE_PLUGIN_ROOT}/bin/residue.js" --base {merge-base} --scope repo --no-suite --json

Map its `kind: worktree` and `kind: branch` findings onto Step 4.5's existing Status/Recommendation table. **Keep** the step's working-directory discipline paragraph, the locked-worktree paragraph, and the reaper-reach paragraph verbatim — they carry constraints the CLI does not encode.

- [ ] **Step 2: Re-point Step 4.7**

Replace Step 4.7's claim enumeration with the same invocation's `kind: claim` findings, keeping the step's existing disposition table.

- [ ] **Step 3: Re-point Step 4.8**

Replace Step 4.8's PR/issue enumeration with the same invocation's `kind: pr` findings, keeping the step's existing table.

- [ ] **Step 4: Verify no scan lost a case**

For each of the three steps, list every Status row in its table before the edit and confirm a probe finding maps to it after. A row with no corresponding finding is a dropped case — either the probe needs it or the row is dead, and both are decisions to make explicitly rather than by omission.

- [ ] **Step 5: Verify the rendered result**

Read each edited step end to end. Confirm the inserted command block sits outside neighbouring fences and no paragraph was split (`[IL-27]`).

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/scan-procedures.md
git diff --cached --name-only
git commit -m "Point /tidy's worktree, claim, and PR scans at the shared residue probes — refs #185"
```

---

### Task 12: Gate-denial breadcrumbs

**Files:**
- Modify: `bin/lib/hooks/pre-tool-use.js`
- Modify: `tests/hooks-dispatcher.test.js` (or the nearest existing pre-tool-use suite)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `events.jsonl` entries the residue sweep's judgment class can cite.

**Scope limit:** this is run-dir-scoped by design. Ad-hoc work with no run directory records nothing, and that gap is stated in the design rather than papered over. Do not invent a new storage location to close it.

- [ ] **Step 1: Write the failing test**

Add to the existing pre-tool-use suite:

```javascript
test('a resolved deny appends a gate-denial event', () => {
  // Arrange a ctx with an owned run dir and a Write outside the worktree,
  // matching the suite's existing fixture style for a denied write.
  // Assert: the run dir's events.jsonl gained one entry of type
  // 'gate-denial' carrying the tool name and the target path.
});

test('a deny with no resolved run dir writes nothing and still denies', () => {
  // The fail-open/no-storage case. Assert: no throw, permissionDecision
  // is still 'deny', and no file was created.
});
```

Fill both bodies against the suite's existing fixture helpers — do not leave them as comments.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

In `bin/lib/hooks/pre-tool-use.js`, where the deny decision is finalised, append a `gate-denial` event via the same `ctxLib.appendEvent` path other hooks use, scoped to `ctx.ownedRun` (never `ctx.runDir` — a run owned by another session is never written to).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-dispatcher.test.js`
Expected: PASS, including the pre-existing garbage-stdin invariant test.

- [ ] **Step 5: Verify the session-safety invariant**

Confirm the new path exits 0 on every branch, including when `events.jsonl` is unwritable. A hook must never break a session — a failed breadcrumb is strictly less bad than a failed tool call.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/hooks/pre-tool-use.js tests/hooks-dispatcher.test.js
git diff --cached --name-only
git commit -m "Record gate denials as run-dir breadcrumbs — refs #185"
```

---

### Task 13: Whole-branch review and release

**Files:**
- Modify: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/shipped-versions.tsv`

**Interfaces:**
- Consumes: every prior task.
- Produces: the shipped release.

**Ordering is deliberate.** The cross-task review runs BEFORE the bump, not after. Per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers in different files. A plan that bumps first has decided any cross-task defect ships.

- [ ] **Step 1: Run the full suite**

Run: `npm test 2>&1 | tee /tmp/residue-suite.txt | tail -30`
Redirect to a file before grepping — piping a long run directly can hide the real failure.

Compare failures against the pre-existing baseline recorded in Task 7 Step 5. Any NEW failure blocks the release.

- [ ] **Step 2: Cross-task review**

Review the whole branch diff, specifically for the seams per-task review cannot see:

- Does every probe's return shape carry the fields `render.js` reads (`[IL-04]`)?
- Does `residue-sweep.md`'s described CLI invocation match `bin/residue.js`'s actual argument parsing?
- Does Task 9's template reference sections Task 8's sweep actually produces?
- **And the reverse direction, which is a named finding, not a generic sweep:** `skills/wrap-up/SKILL.md` Step 9 (line ~337) describes the summary as "State (from `bin/wrap-up-state.js`), Actions Performed, Decisions, Evidence". Task 9 added Verdict, Outstanding, and Routed. Add all three to that sentence — `[IL-60]`, a consumer's own "what this contains" sentence must name a new subsection or the subsection silently no-ops. Measured cost 30 bytes; SKILL.md was 40,862 of 40,960 after Task 8, so this lands at 40,892 with 68 to spare. **Re-measure before and after — do not assume the budget survived later tasks.** A Task 9 reviewer swept every other consumer of `summary-template.md` and found no further stale descriptions, so this is the only one.
- Did Task 11 leave `/tidy` prose asserting the OLD hand-run behavior anywhere it was not edited (`[IL-10]`)?
- Grep the repo for prose describing wrap-up's reach that the sweep has now widened (`[IL-93]`) — including any surviving mention of a "Step 8.7", which was designed, measured against the size ceiling, and replaced by the Step 8.5 fold. A reference to a step that never shipped is the clearest form of this hazard.

- [ ] **Step 3: Re-verify the version is free**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git show main:.claude-plugin/plugin.json
git worktree list
```

Check all four sources: `origin/main`, local `main` (which can hold already-executed bumps invisible to `git log origin/main`, `[IL-98]`), sibling worktree branches, and unexecuted plans under `docs/superpowers/plans/` for version literals. Parallel sessions ship during long test runs — this check is worthless if it happened before Step 1.

- [ ] **Step 4: Bump, changelog, and shipped record — one commit**

All three in the SAME commit (`bin/lib/hooks/post-tool-use.js` warns otherwise, and `tests/changelog-coverage.test.js` fails a deferred entry):

- `.claude-plugin/plugin.json`: `version` → the next free version
- `CHANGELOG.md`: `## v{version} — {one-line summary}` directly under `# Changelog`
- `docs/shipped-versions.tsv`: `{version}\t{YYYY-MM-DD}\trelease`

- [ ] **Step 5: Verify the changelog gate**

Run: `node --test tests/changelog-coverage.test.js`
Expected: no NEW failure. If `6.61.2`'s duplicate-heading failure is still present, it is pre-existing and out of scope — record it as an Outstanding item rather than fixing it here.

- [ ] **Step 6: Commit and push**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
git diff --cached --name-only
git commit -m "Release {version} — wrap-up computes what it leaves outstanding — closes #185"
git push
```

- [ ] **Step 7: Mirror the marketplace**

In `thomasholknielsen/claude-tweaks-marketplace`, set `plugins[].version` to the new version, bump `metadata.version`, keep `plugins[].description` aligned, commit and push. This is authorized as part of the same release action — do not stop to ask (`[IL-59]`).

---

## Self-Review

**Spec coverage:**

| Design section | Task |
|---|---|
| `bin/lib/residue/` module + CLI | 1, 2, 3, 4, 5, 6 |
| Finding model | 1 |
| Scope resolution (blast-radius + observed) | 2, 5 |
| Report shape — Outstanding, Routed, Verdict | 9 |
| Scratch-worktree procedure | 10 |
| Record-mode half-state | 8 |
| health-core demarcation | 7 |
| `/tidy` as second consumer | 11 |
| Gate-denial breadcrumbs | 12 |
| Error handling (`unknown` never omitted) | 2, 3, 4, 5, 6 — each has a discriminating test |
| Testing (fixtures, `[IL-84]` glob, revert-to-verify) | 1 Step 4/6, and a verify step in 2-5, 7 |

No design section is unimplemented. The design's "out of scope" items (the four duplicated sweep wrappers, the `health-core` rename) correctly have no task.

**Type consistency:** `makeFinding` / `validateFinding` (Task 1) are used under those names in Tasks 3, 4, 5, 6. `resolveScope` returns `{ ran, reason, base, branches, worktrees, headBranch }` (Task 2) and every probe reads only those fields. Every probe returns `{ ran, reason, findings }`, which is exactly what `renderOutstanding` consumes (Task 6). `createFingerprint` is used as a **factory** returning `{ fingerprint }` — matching its real signature in `bin/lib/health-core/fingerprint.js`, not a direct-call function.

**Placeholder scan:** no TBD/TODO. Task 12's test bodies are the one place describing rather than showing — deliberate, because they must match the existing suite's fixture helpers, and Step 1 states they must be filled in rather than left as comments.

**Executed during authoring — two defects found and fixed.** Each was found by running the code against real output, not by re-reading it:

1. **`git worktree list --porcelain`'s lock line carries a payload** — `locked claude session … (pid 44923 …)`, not a bare `locked`. The original parser matched `line === 'locked'`, so **every live worktree would have read as unlocked** and been classified `remedy: auto` — marking a worktree a session is actively using for automatic removal. Fixed, and the fixture now carries the real payload shape; the corrected parser was re-run against this repository's own live output and reads this session's worktree as locked.

2. **`git branch -r --merged origin/main` spans every configured remote.** Run live here it returned `local-check/main`, `local/main-check`, and a bare `origin` alongside `origin/*`. The original exclusions (integration branch, `/HEAD`, head branch) would have proposed deleting **another remote's main**. Fixed with a remote-prefix restriction, and the filter was executed to confirm it yields exactly `['origin/worktree-old']`.

Also verified live: `createFingerprint` is a factory returning `{ fingerprint }` (not a direct-call function), `requireNonEmptyStrings` returns `string[]`, and `gh pr list --json number,title,headRefName` produces those exact field names.

**Re-verify before executing.** This repository ships continuously — the base moved from 6.65.1 to 6.68.1 during this plan's authoring, and PR #182 (named in the originating report) closed in the same window. Re-run Task 13 Step 3's four-source version check and re-measure `wc -c skills/wrap-up/SKILL.md` immediately before the tasks that depend on them, rather than trusting the numbers recorded here (`[IL-109]`).
