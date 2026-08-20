# Artifacts Residue Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give QA artifacts a retention story — a new `artifacts` residue probe flags aged artifact dirs (30-day newest-file rule) under `.claude-tweaks/artifacts/` and legacy project-root `screenshots/`/`traces/` trees, surfaced by `/tidy`; the two "no automatic retention policy" sentences become true statements of the new contract.

**Architecture:** One new probe module mirroring `pipeline-runs.js`'s contract, generalized to five independent roots with per-root ENOENT-clean semantics and fail-loud aggregation; `'artifact'` joins the frozen `KINDS`; findings are `scope: 'observed'` (visible under `/tidy`'s default `--scope repo`, deliberately invisible to `/wrap-up`'s `--scope blast-radius`). Tests use tmpdir fixtures with `fs.utimesSync` mtimes and an injected `now`.

**Tech Stack:** Node (no deps), `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T154526-spec-1077-1078/spec-1078/work/1078-spec.md`

## Global Constraints

- Work in the shared run worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/qa-artifact-retention-884`; verify `pwd` + `git rev-parse --show-toplevel` before committing. One plain command per Bash call (no `&&`, `;`, heredocs, loops).
- Finding contract (live-verified at plan time): `finding.js` scope enum is `'blast-radius' | 'observed'`; remedies `'auto' | 'record'`; all five fields non-empty. The probe emits `scope: 'observed'` for every finding.
- The 30-day threshold is a module constant `THIRTY_DAYS_MS` — no policy key.
- **Edit-anchor warning (ledger row 3):** `visual-review/journey-mode.md:117`'s tail already reads `` `.claude-tweaks/artifacts/` belongs in `.gitignore` `` (prefixed by #1077); there are TWO retention sentences to rewrite — journey-mode.md:117 AND `browse/SKILL.md:91`. Derive anchors from live text.
- Commit messages `refs #1078`, never closing keywords.
- Full `npm test` runs once, centrally, at Task 2's end.

---

### Task 1: Probe module + KINDS + wiring + tests (TDD)

**Files:**
- Create: `plugin/bin/lib/residue/probes/artifacts.js`
- Modify: `plugin/bin/lib/residue/finding.js:11` (KINDS array)
- Modify: `plugin/bin/residue.js` (require at the probe block ~line 20, invocation in the `filterResultsByScope([...])` array ~line 120)
- Test: `tests/bin-lib/residue/artifacts.test.js` (create)

**Interfaces:**
- Consumes: `makeFinding` (`../finding`), `mainCheckoutRoot` (`../../hooks/worktree-detect`) — same imports as `pipeline-runs.js`.
- Produces: `probeArtifacts({ cwd, now })` → `{ran, reason, findings[]}`; findings `kind: 'artifact'`, `scope: 'observed'`, `remedy: 'auto' | 'record'`.

- [ ] **Step 1: Write the failing test** at `tests/bin-lib/residue/artifacts.test.js`:

```js
'use strict';
// tests/bin-lib/residue/artifacts.test.js — the artifacts retention probe
// (#1078): aged artifact dirs under .claude-tweaks/artifacts/ (30-day
// newest-file rule), legacy project-root screenshots/ + traces/ residue,
// per-root ENOENT-clean semantics, fail-loud on unreadable roots.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probeArtifacts, THIRTY_DAYS_MS } = require('../../../plugin/bin/lib/residue/probes/artifacts');
const { validateFinding } = require('../../../plugin/bin/lib/residue/finding');

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);
const OLD = new Date(NOW - THIRTY_DAYS_MS - 24 * 60 * 60 * 1000); // 31 days ago
const FRESH = new Date(NOW - 24 * 60 * 60 * 1000); // 1 day ago

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-probe-'));
}

function mkFile(p, mtime) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, 'x');
  fs.utimesSync(p, mtime, mtime);
}

test('no roots at all is a clean, ran result', () => {
  const root = tmpRoot();
  assert.deepStrictEqual(probeArtifacts({ cwd: root, now: NOW }), { ran: true, reason: null, findings: [] });
});

test('partial presence: missing sibling subdirs are silently clean', () => {
  const root = tmpRoot();
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/browse/sess1/01.png'), FRESH);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.ran, true);
  assert.deepStrictEqual(r.findings, []);
});

test('aged dir (newest file >30d) yields an auto artifact finding that validates', () => {
  const root = tmpRoot();
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/qa/20260601_010101_abc123/shot.png'), OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  const f = r.findings[0];
  assert.strictEqual(f.kind, 'artifact');
  assert.strictEqual(f.scope, 'observed');
  assert.strictEqual(f.remedy, 'auto');
  assert.ok(f.subject.includes('20260601_010101_abc123'));
  assert.deepStrictEqual(validateFinding(f), []);
});

test('discrimination: old dir mtime but one fresh file is NOT flagged', () => {
  const root = tmpRoot();
  const dir = path.join(root, '.claude-tweaks/artifacts/traces/story-1');
  mkFile(path.join(dir, 'old.zip'), OLD);
  mkFile(path.join(dir, 'new.zip'), FRESH);
  fs.utimesSync(dir, OLD, OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.deepStrictEqual(r.findings, []);
});

test('empty aged dir falls back to its own mtime and is flagged', () => {
  const root = tmpRoot();
  const dir = path.join(root, '.claude-tweaks/artifacts/screenshots/qa/20260501_010101_dead00');
  fs.mkdirSync(dir, { recursive: true });
  fs.utimesSync(dir, OLD, OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].remedy, 'auto');
});

test('legacy root with fresh content is flagged remedy record', () => {
  const root = tmpRoot();
  mkFile(path.join(root, 'traces/story-2/t.zip'), FRESH);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].kind, 'artifact');
  assert.strictEqual(r.findings[0].remedy, 'record');
  assert.ok(r.findings[0].evidence.includes('.claude-tweaks/artifacts/'));
  assert.deepStrictEqual(validateFinding(r.findings[0]), []);
});

test('legacy root aged >30d is flagged remedy auto', () => {
  const root = tmpRoot();
  mkFile(path.join(root, 'screenshots/qa-old/x.png'), OLD);
  const r = probeArtifacts({ cwd: root, now: NOW });
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].remedy, 'auto');
});

test('an unreadable root fails the whole probe loudly, naming it', { skip: process.getuid && process.getuid() === 0 }, () => {
  const root = tmpRoot();
  const locked = path.join(root, '.claude-tweaks/artifacts/traces');
  fs.mkdirSync(locked, { recursive: true });
  mkFile(path.join(root, '.claude-tweaks/artifacts/screenshots/qa/run1/a.png'), OLD);
  fs.chmodSync(locked, 0o000);
  try {
    const r = probeArtifacts({ cwd: root, now: NOW });
    assert.strictEqual(r.ran, false);
    assert.ok(r.reason.includes('traces'));
    assert.deepStrictEqual(r.findings, []);
  } finally {
    fs.chmodSync(locked, 0o755);
  }
});

test("'artifact' is a registered kind", () => {
  const { KINDS } = require('../../../plugin/bin/lib/residue/finding');
  assert.ok(KINDS.includes('artifact'));
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `node --test tests/bin-lib/residue/artifacts.test.js`. Expected: FAIL (cannot find module `.../probes/artifacts`).
- [ ] **Step 3: Add `'artifact'` to KINDS** — `plugin/bin/lib/residue/finding.js:11`: `['worktree', 'branch', 'pr', 'suite', 'release', 'pipeline-run']` → `['worktree', 'branch', 'pr', 'suite', 'release', 'pipeline-run', 'artifact']`.
- [ ] **Step 4: Write the probe** at `plugin/bin/lib/residue/probes/artifacts.js`:

```js
// bin/lib/residue/probes/artifacts.js — QA artifact retention (#1078).
// Two finding classes, both kind 'artifact', both scope 'observed' (repo
// housekeeping unattributable to the current run — never blast-radius, so
// /wrap-up's --scope blast-radius sweep deliberately never surfaces these;
// /tidy's default --scope repo does):
//   - aged artifact dir: a first-level entry under one of the three
//     .claude-tweaks/artifacts/ roots whose newest contained file (recursive;
//     the dir's own mtime when it contains no files, so empty dirs are not
//     immortal) is older than 30 days. remedy 'auto' — gitignored,
//     declared-transient evidence past its shelf life.
//   - legacy root residue: a project-root screenshots/ or traces/ tree (the
//     pre-#1077 convention). remedy 'auto' only when the same 30-day rule
//     passes; 'record' when anything fresher is inside — a trace captured the
//     day before the plugin update must surface for a human, not auto-delete.
// Per-root ENOENT is clean (a project that has only ever run /browse has no
// traces/ root); any OTHER read failure fails the whole probe loudly — a
// partial scan must never report as a clean sweep (sibling probes' contract).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { makeFinding } = require('../finding');
const { mainCheckoutRoot } = require('../../hooks/worktree-detect');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ARTIFACT_ROOTS = [
  path.join('.claude-tweaks', 'artifacts', 'screenshots', 'qa'),
  path.join('.claude-tweaks', 'artifacts', 'screenshots', 'browse'),
  path.join('.claude-tweaks', 'artifacts', 'traces'),
];
const LEGACY_ROOTS = ['screenshots', 'traces'];

// Recursive max file mtime (ms) under dir; null when it contains no files.
// Throws on any read error other than ENOENT — the caller turns that into
// the probe-level ran:false.
function newestFileMtimeMs(dir) {
  let newest = null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = newestFileMtimeMs(p);
      if (child !== null && (newest === null || child > newest)) newest = child;
    } else if (entry.isFile()) {
      const m = fs.statSync(p).mtimeMs;
      if (newest === null || m > newest) newest = m;
    }
  }
  return newest;
}

// Age basis for a directory: newest contained file, else the dir's own mtime.
function ageBasisMs(dir) {
  const newest = newestFileMtimeMs(dir);
  return newest !== null ? newest : fs.statSync(dir).mtimeMs;
}

function probeArtifacts({ cwd, now = Date.now() } = {}) {
  const start = cwd || process.cwd();
  const root = mainCheckoutRoot(start) || start;
  const findings = [];
  const failed = [];

  for (const rel of ARTIFACT_ROOTS) {
    const base = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') continue; // per-root clean — never a probe failure
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      let basis;
      try {
        basis = ageBasisMs(dir);
      } catch (err) {
        failed.push(`${path.join(rel, entry.name)} (${(err && err.code) || err})`);
        continue;
      }
      const ageMs = now - basis;
      if (ageMs <= THIRTY_DAYS_MS) continue;
      findings.push(makeFinding({
        kind: 'artifact',
        scope: 'observed',
        subject: path.join(rel, entry.name),
        remedy: 'auto',
        evidence: `newest content ${Math.floor(ageMs / 86400000)}d old — aged past the 30-day retention window`,
      }));
    }
  }

  for (const rel of LEGACY_ROOTS) {
    const base = path.join(root, rel);
    let stat;
    try {
      stat = fs.statSync(base);
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    if (!stat.isDirectory()) continue;
    let basis;
    try {
      basis = ageBasisMs(base);
    } catch (err) {
      failed.push(`${rel} (${(err && err.code) || err})`);
      continue;
    }
    const aged = now - basis > THIRTY_DAYS_MS;
    findings.push(makeFinding({
      kind: 'artifact',
      scope: 'observed',
      subject: rel,
      remedy: aged ? 'auto' : 'record',
      evidence: aged
        ? 'pre-relocation artifact root, aged past the 30-day window — superseded by .claude-tweaks/artifacts/'
        : 'pre-relocation artifact root with content fresher than 30 days — superseded by .claude-tweaks/artifacts/; surface for human disposition, do not auto-delete',
    }));
  }

  if (failed.length) return { ran: false, reason: `could not read ${failed.join(', ')}`, findings: [] };
  return { ran: true, reason: null, findings };
}

module.exports = { probeArtifacts, THIRTY_DAYS_MS };
```

- [ ] **Step 5: Wire it in `plugin/bin/residue.js`** — add `const { probeArtifacts } = require('./lib/residue/probes/artifacts');` after the `probePipelineRuns` require (~line 20), and add `probeArtifacts({ cwd }),` after `probePipelineRuns({ cwd }),` in the `filterResultsByScope([...])` array (~line 125).
- [ ] **Step 6: Run the new suite to verify it passes** — Run: `node --test tests/bin-lib/residue/artifacts.test.js`. Expected: 9/9 PASS.
- [ ] **Step 7: Run the sibling residue suites** — Run: `node --test tests/bin-lib/residue/*.test.js`. Expected: all pass (KINDS widening must not break existing pins; if a suite pins the KINDS list literally, flag it in the report rather than silently editing it).
- [ ] **Step 8: Commit** — `git add plugin/bin/lib/residue/probes/artifacts.js plugin/bin/lib/residue/finding.js plugin/bin/residue.js tests/bin-lib/residue/artifacts.test.js` then `git commit -m "Add artifacts residue probe: 30-day retention + legacy-root findings — refs #1078"`

### Task 2: Routing prose + retention sentences + full suite

**Files:**
- Modify: `plugin/skills/tidy/step-6-auto.md` (the auto-apply Delete row + the judgment Delete row)
- Modify: `plugin/skills/tidy/SKILL.md:82` (Step 4.5 data-source parenthetical)
- Modify: `plugin/skills/visual-review/journey-mode.md:117` (retention sentence)
- Modify: `plugin/skills/browse/SKILL.md:91` (retention sentence)

**Interfaces:**
- Consumes: Task 1's `artifact` kind and its `auto`/`record` remedy split.

- [ ] **Step 1: Edit `plugin/skills/tidy/step-6-auto.md`** — two edits, anchored on live text:
  - In the row beginning `| **Delete** (stale temp files, broken symlinks, marked-as-specified design docs, merged worktrees/branches, orphaned plans whose related spec is complete)`, extend the parenthetical to `…orphaned plans whose related spec is complete, aged \`artifact\` residue findings — \`remedy: auto\`, gitignored declared-transient QA screenshots/traces past the 30-day window)`.
  - In the row beginning `| **Delete** (any case requiring judgment, excluding backlog records`, extend its parenthetical: after `design docs with no specs` insert `, legacy-root \`artifact\` findings carrying \`remedy: record\` (a pre-relocation screenshots/ or traces/ tree with content fresher than 30 days)`.
- [ ] **Step 2: Edit `plugin/skills/tidy/SKILL.md` line 82** — in the Step 4.5 row's parenthetical `(\`kind: worktree\` — all worktrees; \`kind: branch\` — merged remote-tracking branches, supplementary)`, extend to `(\`kind: worktree\` — all worktrees; \`kind: branch\` — merged remote-tracking branches, supplementary; \`kind: artifact\` — aged QA artifact dirs + legacy artifact roots)`. Check `wc -c` on tidy/SKILL.md before committing (near-ceiling file class).
- [ ] **Step 3: Edit `plugin/skills/visual-review/journey-mode.md` line 117** — replace the final sentence `There is no automatic retention policy; users manage cleanup, and \`.claude-tweaks/artifacts/\` belongs in \`.gitignore\`.` with `Artifacts older than 30 days are surfaced for deletion by \`/tidy\`'s residue sweep (the \`artifact\` residue finding); \`.claude-tweaks/artifacts/\` belongs in \`.gitignore\`.`
- [ ] **Step 4: Edit `plugin/skills/browse/SKILL.md` line 91** — replace the sentence `There is no automatic retention policy — users manage cleanup.` with `Artifacts older than 30 days are surfaced for deletion by \`/tidy\`'s residue sweep (the \`artifact\` residue finding).` (rest of the line unchanged).
- [ ] **Step 5: Verify** — Run: `grep -rn "no automatic retention" plugin/` — Expected: zero hits. Run: `grep -rn "kind: artifact\|artifact\` residue" plugin/skills/tidy plugin/skills/visual-review/journey-mode.md plugin/skills/browse/SKILL.md` — Expected: the four edits present. Run: `grep -n "Delete" plugin/skills/tidy/step-6-interactive.md` — Expected: no routing-table Delete row of its own (it defers to step-6-auto.md by reference), confirming the spec's verify-don't-assume no-edit call; if a Delete row DOES exist there, flag it in the report instead of editing.
- [ ] **Step 6: Full suite** — Run: `npm test` redirected to a file; read the tail. Expected: 0 fail (byte ceilings + all conformance suites included). A single fail in `tests/bin-lib/reconcile/pr-state.test.js`'s event-loop timing test is a known machine-load flake — re-run that file in isolation once before treating it as breakage.
- [ ] **Step 7: Commit** — `git add plugin/skills/tidy/step-6-auto.md plugin/skills/tidy/SKILL.md plugin/skills/visual-review/journey-mode.md plugin/skills/browse/SKILL.md` then `git commit -m "Route artifact residue findings in tidy; retention sentences state the 30-day contract — refs #1078"`
