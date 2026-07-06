# Harness Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize `/claude-tweaks:skill-health` into `/claude-tweaks:harness-health`, extending its drift/best-practice audit from skills-only to skills + `.claude/rules/*.md` + CLAUDE.md, with a full rename and no back-compat shim.

**Architecture:** One unified target pool (`listTargets` = skills + rules + CLAUDE.md, each tagged `kind`) feeds the existing stale-then-churn `selectTarget` rotation unchanged. The Finding Shape gains `assetType` and `category` fields. The shared judge procedure (`_shared/harness-health-analysis.md`) gains two new dimensions (template conformance, best-practice fit) read live from each kind's own origin template. CLAUDE.md findings never auto-apply.

**Tech Stack:** Node 18+ (`node --test`), no new runtime dependencies (hand-rolled minimal frontmatter parsing for rules' `paths:` glob — this repo ships zero runtime npm deps).

## Global Constraints

- No back-compat shim: this repo has zero existing `skill-health`-labelled GitHub issues (verified), so the rename is a clean break.
- Historical docs (`docs/superpowers/plans/2026-07-05-skill-health.md`, `docs/superpowers/specs/2026-07-05-skill-health-design.md`, `docs/superpowers/plans/2026-07-06-recon-signal-quality.md`, `docs/superpowers/specs/2026-07-06-harness-health-design.md`) are never edited — they are records of past decisions, not live cross-references.
- CLAUDE.md findings always file as a GitHub issue; they never auto-apply, regardless of classification/confidence/reversibility.
- Gap detection (proposing a brand-new artifact, `kind: "new-skill"`) stays skill-only — rules and CLAUDE.md only ever produce `kind: "patch"` findings.
- Every `git mv` preserves file history — never delete-and-recreate.
- Run `npm test` at the end of every task; it must be 100% green before moving to the next task.

---

### Task 1: Rename engine + skill directories and identifiers (mechanical only)

**Files:**
- Move: `bin/skill-health.js` → `bin/harness-health.js`
- Move: `bin/lib/skill-health/` → `bin/lib/harness-health/` (all 8 lib files + `tests/` with 8 test files)
- Move: `skills/skill-health/` → `skills/harness-health/` (`SKILL.md` + `routine-template.yml`)
- Modify: `bin/harness-health.js`, `bin/lib/harness-health/cache.js`, `bin/lib/harness-health/dedup.js`, `bin/lib/harness-health/fingerprint.js`, `bin/lib/harness-health/issue-payload.js`, `bin/lib/harness-health/validate-finding.js`
- Modify (test files, path/prefix/label literals only — no new fields yet): all 8 files under `bin/lib/harness-health/tests/`

**Interfaces:**
- Produces: every module now lives under `bin/lib/harness-health/*`, importable via `require('./lib/harness-health/<name>')` from `bin/harness-health.js`. All prior exports (`listSkills`, `extractDomainPaths`, `domainChurn`, `selectTarget`, `fingerprint`, `normalizeDescription`, `decide`, `validateFinding`, `toIssuePayload`, cache functions, `STALE_DAYS`) are unchanged in shape — only the file locations and string literals (`skill-health`→`harness-health`, `skillhealth-`→`harnesshealth-`) change. Later tasks build on this renamed-but-behaviorally-identical baseline.

- [ ] **Step 1: Move the directories with git mv**

```bash
git mv bin/skill-health.js bin/harness-health.js
git mv bin/lib/skill-health bin/lib/harness-health
git mv skills/skill-health skills/harness-health
```

- [ ] **Step 2: Fix `bin/harness-health.js`'s requires and user-facing strings**

Read the moved file, then replace it with:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/harness-health/fingerprint');
const {
  readCache, writeCache, readCursors, recordAudit,
  readGapScanCursor, recordGapScan, recordRun, readRuns, computeChurn,
} = require('./lib/harness-health/cache');
const { decide } = require('./lib/harness-health/dedup');
const { validateFinding } = require('./lib/harness-health/validate-finding');
const { toIssuePayload } = require('./lib/harness-health/issue-payload');
const { selectTarget, listSkills } = require('./lib/harness-health/scope');
const { STALE_DAYS } = require('./lib/harness-health/score');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--skill') args.skill = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--gap-scan') args.gapScan = true;
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[harness-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[harness-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();
  const gapScan = readGapScanCursor(root);
  const gapScanDue = gapScan.lastScannedMs == null || (now - gapScan.lastScannedMs) / 86400000 > STALE_DAYS;

  if (args.skill) {
    const found = listSkills(root).find((s) => s.id === args.skill) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readCursors(root);

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now });
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different skill (mirrors recon's next-slice --budget).
  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now });
    if (!target) break;
    targets.push(target);
    cursors = { ...cursors, [target.id]: { ...(cursors[target.id] || {}), lastAuditedMs: now } };
  }
  process.stdout.write(JSON.stringify({ targets, gapScanDue }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: harness-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--skill <id>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  const survivors = [];
  for (const f of raw) {
    const v = validateFinding(f);
    if (!v.ok) {
      process.stderr.write(
        `[harness-health] validate-findings: dropped finding for skill "${(f && f.skill) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      skill: v.value.skill,
      section: v.value.section || v.value.kind,
      description: v.value.description,
    });
    survivors.push({ ...v.value, id });
  }

  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    if (args.skill) recordAudit(root, args.skill, {});
    if (args.gapScan) recordGapScan(root, {});
    recordRun(root, args.runId, [...seen]);
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[harness-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readRuns(root);
  if (runs.length === 0) {
    process.stdout.write('no run logs found\n');
    return;
  }
  const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
  const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
  let exceeded = false;
  for (let i = 0; i < runs.length; i++) {
    const prior = i > 0 ? runs[i - 1] : null;
    const c = computeChurn(runs[i].fingerprints, prior);
    rows.push([
      runs[i].runId,
      (runs[i].runAt || '').slice(0, 19),
      String(runs[i].fingerprints.length),
      String(c.appeared.length),
      String(c.disappeared.length),
      String(c.ratio),
    ]);
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
  }
  if (exceeded) {
    process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
    process.exit(1);
  }
}

const MARK_STATUSES = new Set(['applied', 'declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: harness-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  process.stderr.write(
    'usage: harness-health.js <command> [options]\n' +
    'commands: next-target [--skill <id>], validate-findings <file> [--skill <id>] [--gap-scan], churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```

- [ ] **Step 3: Fix `bin/lib/harness-health/cache.js`'s path literals**

Edit `bin/lib/harness-health/cache.js`:

```
old_string:
// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/skill-health/{cache,cursors}.json and .../runs/*.json

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'cache.json');
}
```
```
new_string:
// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/harness-health/{cache,cursors}.json and .../runs/*.json

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'harness-health', 'cache.json');
}
```

```
old_string:
function cursorsPath(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json');
}
```
```
new_string:
function cursorsPath(root) {
  return path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json');
}
```

```
old_string:
function runsDir(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'runs');
}
```
```
new_string:
function runsDir(root) {
  return path.join(root, '.claude-tweaks', 'harness-health', 'runs');
}
```

- [ ] **Step 4: Fix `bin/lib/harness-health/dedup.js`'s comment**

Edit `bin/lib/harness-health/dedup.js`:

```
old_string:
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label skill-health` output (the skill builds
//   it; the engine never calls network) — same contract as recon's dedup.js.
```
```
new_string:
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label harness-health` output (the skill builds
//   it; the engine never calls network) — same contract as recon's dedup.js.
```

- [ ] **Step 5: Fix `bin/lib/harness-health/fingerprint.js`'s id prefix**

Edit `bin/lib/harness-health/fingerprint.js`:

```
old_string:
function fingerprint({ skill, section, description }) {
  const basis = JSON.stringify([skill, section, normalizeDescription(description)]);
  return 'skillhealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}
```
```
new_string:
function fingerprint({ skill, section, description }) {
  const basis = JSON.stringify([skill, section, normalizeDescription(description)]);
  return 'harnesshealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}
```

- [ ] **Step 6: Fix `bin/lib/harness-health/issue-payload.js`'s marker/labels and header comment**

Edit `bin/lib/harness-health/issue-payload.js`:

```
old_string:
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
function toIssuePayload(finding) {
  const marker = `<!-- skill-health-fingerprint: ${finding.id} -->`;
```
```
new_string:
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
function toIssuePayload(finding) {
  const marker = `<!-- harness-health-fingerprint: ${finding.id} -->`;
```

```
old_string:
    '_Filed by `/claude-tweaks:skill-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');
```
```
new_string:
    '_Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');
```

```
old_string:
    labels: ['skill-health', finding.kind === 'new-skill' ? 'skill-health:new-skill' : `skill-health:${finding.classification}`],
  };
```
```
new_string:
    labels: ['harness-health', finding.kind === 'new-skill' ? 'harness-health:new-skill' : `harness-health:${finding.classification}`],
  };
```

- [ ] **Step 7: Fix `bin/lib/harness-health/validate-finding.js`'s header comment**

Edit `bin/lib/harness-health/validate-finding.js`:

```
old_string:
// Validates a skill-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/skill-health-analysis.md.
```
```
new_string:
// Validates a harness-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/harness-health-analysis.md.
```

- [ ] **Step 8: Fix the 3 CLI test files' hardcoded binary path and cache-path assertions**

Edit `bin/lib/harness-health/tests/cli-mark.test.js`:

```
old_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'skill-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-mark-')); }
```
```
new_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-mark-')); }
```

```
old_string:
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'skill-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['skillhealth-abc12345'].status, 'applied');
```
```
new_string:
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['skillhealth-abc12345'].status, 'applied');
```

```
old_string:
  execFileSync('node', [CLI, 'mark', 'skillhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'skill-health', 'cache.json'), 'utf8'));
```
```
new_string:
  execFileSync('node', [CLI, 'mark', 'skillhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
```

(Fingerprint literals like `'skillhealth-abc12345'` are opaque test IDs, not the engine's generated prefix — they stay as arbitrary strings here and are not required to match `harnesshealth-`; leave them as-is.)

Edit `bin/lib/harness-health/tests/cli-next-target.test.js`:

```
old_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'skill-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-nt-')); }
```
```
new_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-nt-')); }
```

Edit `bin/lib/harness-health/tests/cli-validate-findings.test.js`:

```
old_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'skill-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-vf-')); }
```
```
new_string:
const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-vf-')); }
```

```
old_string:
  assert.ok(payloads[0].labels.includes('skill-health'));
  assert.ok(payloads[0].body.includes('<!-- skill-health-fingerprint: skillhealth-'));
```
```
new_string:
  assert.ok(payloads[0].labels.includes('harness-health'));
  assert.ok(payloads[0].body.includes('<!-- harness-health-fingerprint: skillhealth-'));
```

```
old_string:
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'skill-health', 'cache.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json')), false);
```
```
new_string:
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json')), false);
```

```
old_string:
  const result = runValidateFindings(root, findingsFile, ['--skill', 'auth']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors.auth.lastAuditedMs === 'number');
});

test('validate-findings: --gap-scan records the global gap-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([]));

  const result = runValidateFindings(root, findingsFile, ['--gap-scan']);
  assert.strictEqual(result.status, 0);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json'), 'utf8'));
```
```
new_string:
  const result = runValidateFindings(root, findingsFile, ['--skill', 'auth']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors.auth.lastAuditedMs === 'number');
});

test('validate-findings: --gap-scan records the global gap-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([]));

  const result = runValidateFindings(root, findingsFile, ['--gap-scan']);
  assert.strictEqual(result.status, 0);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
```

```
old_string:
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['skill-health'], fingerprint: fp }]));
```
```
new_string:
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['harness-health'], fingerprint: fp }]));
```

- [ ] **Step 9: Fix the `cachePath`/tmpdir-prefix cosmetics in `cache.test.js` and `scope.test.js`**

Edit `bin/lib/harness-health/tests/cache.test.js`:

```
old_string:
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-cache-')); }
```
```
new_string:
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-cache-')); }
```

```
old_string:
test('cachePath points under .claude-tweaks/skill-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'skill-health', 'cache.json'));
});
```
```
new_string:
test('cachePath points under .claude-tweaks/harness-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'));
});
```

Edit `bin/lib/harness-health/tests/scope.test.js`:

```
old_string:
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-scope-')); }
```
```
new_string:
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-scope-')); }
```

- [ ] **Step 10: Fix `fingerprint.test.js`'s prefix assertion**

Edit `bin/lib/harness-health/tests/fingerprint.test.js`:

```
old_string:
test('fingerprint returns a skillhealth-<8hex> id', () => {
  const id = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.match(id, /^skillhealth-[0-9a-f]{8}$/);
});
```
```
new_string:
test('fingerprint returns a harnesshealth-<8hex> id', () => {
  const id = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.match(id, /^harnesshealth-[0-9a-f]{8}$/);
});
```

- [ ] **Step 11: Fix `issue-payload.test.js`'s marker/label assertions**

Edit `bin/lib/harness-health/tests/issue-payload.test.js`:

```
old_string:
test('toIssuePayload for a patch finding includes the fingerprint marker and labels', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('<!-- skill-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:new-skill']);
```
```
new_string:
test('toIssuePayload for a patch finding includes the fingerprint marker and labels', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('<!-- harness-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:new-skill']);
```

- [ ] **Step 12: Run the full suite and confirm it's green under the new names**

```bash
npm test
```

Expected: all prior test counts pass unchanged (no new tests yet — this task only renames).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Rename skill-health engine and skill directory to harness-health"
```

---

### Task 2: Extend `scope.js` — rules, CLAUDE.md, and a unified target pool

**Files:**
- Modify: `bin/lib/harness-health/scope.js`
- Modify: `bin/lib/harness-health/tests/scope.test.js`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond the renamed location.
- Produces: `listSkills(root)` now returns items tagged `{ kind: 'skill', id, path }`. New: `listRules(root)` → `{ kind: 'rule', id, path, pathGlobs }[]`. New: `listClaudeMd(root)` → `{ kind: 'claude-md', id: 'CLAUDE', path }[]` (0 or 1 items). New: `listTargets(root)` → concatenation of all three. `selectTarget(root, cursors, opts)` now operates over `listTargets` instead of `listSkills`, with cursor/signal keys namespaced as `` `${kind}:${id}` ``, and accepts an optional `opts.kind` filter. `parseRulePaths(content)` (new, exported for testing) extracts a rule's `paths:` frontmatter list. Task 3 and Task 4 both depend on these new exports.

- [ ] **Step 1: Write failing tests for `listRules` and `parseRulePaths`**

Add to `bin/lib/harness-health/tests/scope.test.js`, after the `extractDomainPaths` test block:

```js
// ─── parseRulePaths / listRules ────────────────────────────────────────────

test('parseRulePaths extracts a paths: frontmatter list', () => {
  const content = '---\npaths:\n  - src/api/**\n  - src/routes/**\n---\nBody text.';
  assert.deepStrictEqual(parseRulePaths(content), ['src/api/**', 'src/routes/**']);
});

test('parseRulePaths returns [] when there is no frontmatter', () => {
  assert.deepStrictEqual(parseRulePaths('# no frontmatter here'), []);
});

test('parseRulePaths returns [] when there is no paths: key', () => {
  const content = '---\nother: value\n---\nBody.';
  assert.deepStrictEqual(parseRulePaths(content), []);
});

test('listRules returns [] when .claude/rules does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listRules(root), []);
});

test('listRules lists .claude/rules/*.md sorted by id, tagged kind: rule, with parsed pathGlobs', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '---\npaths:\n  - src/api/**\n---\nUse the error handler.');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'zzz.md'), '# no frontmatter');
  const rules = listRules(root);
  assert.deepStrictEqual(rules.map((r) => r.id), ['api-errors', 'zzz']);
  assert.strictEqual(rules[0].kind, 'rule');
  assert.deepStrictEqual(rules[0].pathGlobs, ['src/api/**']);
  assert.deepStrictEqual(rules[1].pathGlobs, []);
});

// ─── listClaudeMd ───────────────────────────────────────────────────────────

test('listClaudeMd returns [] when CLAUDE.md does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listClaudeMd(root), []);
});

test('listClaudeMd returns a single kind: claude-md item when CLAUDE.md exists', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const result = listClaudeMd(root);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'claude-md');
  assert.strictEqual(result[0].id, 'CLAUDE');
  assert.strictEqual(result[0].path, path.join(root, 'CLAUDE.md'));
});

// ─── listTargets ────────────────────────────────────────────────────────────

test('listTargets aggregates skills, rules, and CLAUDE.md, each correctly tagged', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'api-errors.md'), '---\npaths:\n  - src/api/**\n---\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const targets = listTargets(root);
  assert.deepStrictEqual(
    targets.map((t) => `${t.kind}:${t.id}`).sort(),
    ['claude-md:CLAUDE', 'rule:api-errors', 'skill:auth'],
  );
});
```

Update the import line at the top of the file:

```
old_string:
const { listSkills, extractDomainPaths, domainChurn, selectTarget } = require('../scope');
```
```
new_string:
const {
  listSkills, extractDomainPaths, domainChurn, selectTarget,
  listRules, parseRulePaths, listClaudeMd, listTargets,
} = require('../scope');
```

Also update the existing `listSkills` test to assert the new `kind` tag:

```
old_string:
test('listSkills lists .md files under .claude/skills, sorted by id', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'zebra.md'), '# zebra');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const skills = listSkills(root);
  assert.deepStrictEqual(skills.map((s) => s.id), ['auth', 'zebra']);
  assert.strictEqual(skills[0].path, path.join(root, '.claude', 'skills', 'auth.md'));
});
```
```
new_string:
test('listSkills lists .md files under .claude/skills, sorted by id, tagged kind: skill', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'zebra.md'), '# zebra');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const skills = listSkills(root);
  assert.deepStrictEqual(skills.map((s) => s.id), ['auth', 'zebra']);
  assert.strictEqual(skills[0].path, path.join(root, '.claude', 'skills', 'auth.md'));
  assert.strictEqual(skills[0].kind, 'skill');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
node --test bin/lib/harness-health/tests/scope.test.js
```

Expected: FAIL — `parseRulePaths`, `listRules`, `listClaudeMd`, `listTargets` are not exported yet; the `kind` assertion on `listSkills` also fails.

- [ ] **Step 3: Implement `listRules`, `parseRulePaths`, `listClaudeMd`, `listTargets`, and namespace `selectTarget`**

Read `bin/lib/harness-health/scope.js`, then replace its full contents with:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');

// ─── listSkills ──────────────────────────────────────────────────────────────
// Returns [{ kind: 'skill', id, path }] for each .claude/skills/*.md file,
// sorted by id. Empty array if the directory doesn't exist — a project with
// no generated skills yet is a valid state, not an error.
function listSkills(root) {
  const dir = path.join(root, '.claude', 'skills');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => ({ kind: 'skill', id: e.name.slice(0, -3), path: path.join(dir, e.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── parseRulePaths ────────────────────────────────────────────────────────────
// Extracts a rule file's `paths:` frontmatter list, e.g.:
//   ---
//   paths:
//     - src/api/**
//   ---
// Returns [] if there's no frontmatter, no `paths:` key, or no list items —
// an unparseable header means "no declared domain," not an error.
function parseRulePaths(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const pathsIdx = frontmatter.findIndex((l) => /^paths:\s*$/.test(l));
  if (pathsIdx === -1) return [];
  const globs = [];
  for (let i = pathsIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    globs.push(m[1]);
  }
  return globs;
}

// ─── listRules ───────────────────────────────────────────────────────────────
// Returns [{ kind: 'rule', id, path, pathGlobs }] for each .claude/rules/*.md
// file, sorted by id. pathGlobs is the parsed `paths:` frontmatter list (may
// be [] for an unparseable or absent header).
function listRules(root) {
  const dir = path.join(root, '.claude', 'rules');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => {
      const filePath = path.join(dir, e.name);
      let content = '';
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { /* unreadable -> no globs */ }
      return { kind: 'rule', id: e.name.slice(0, -3), path: filePath, pathGlobs: parseRulePaths(content) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── listClaudeMd ──────────────────────────────────────────────────────────────
// Returns a single-item list, [{ kind: 'claude-md', id: 'CLAUDE', path }], if
// <root>/CLAUDE.md exists — [] otherwise. Not a rotation candidate among
// siblings of its own kind (there's only ever one project CLAUDE.md), but
// competes in the same unified pool as skills/rules for churn/staleness
// selection.
function listClaudeMd(root) {
  const filePath = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(filePath)) return [];
  return [{ kind: 'claude-md', id: 'CLAUDE', path: filePath }];
}

// ─── listTargets ────────────────────────────────────────────────────────────
// Aggregates listSkills + listRules + listClaudeMd into one flat pool for the
// unified rotation/selection algorithm.
function listTargets(root) {
  return [...listSkills(root), ...listRules(root), ...listClaudeMd(root)];
}

// ─── extractDomainPaths ────────────────────────────────────────────────────────
// Mechanical proxy for "what this document documents": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a slash).
// Deliberately NOT prose understanding — that's the LLM judge's job, not the
// engine's. Reused unchanged for skills and CLAUDE.md; rules prefer their own
// parsed pathGlobs (a precise, structured signal) when present.
function extractDomainPaths(content) {
  const matches = content.match(/`([^`\s]+\.[a-zA-Z0-9]+)`/g) || [];
  const paths = matches
    .map((m) => m.slice(1, -1))
    .filter((p) => p.includes('/'));
  return [...new Set(paths)];
}

// ─── domainChurn ─────────────────────────────────────────────────────────────
// Count commits touching any of `relPaths` since `sinceMs` (epoch ms). Returns
// 0 (not an error) when git is unavailable, paths don't exist, or there is no
// churn — the caller treats 0 as "nothing changed," not a failure signal.
// relPaths may be exact file paths (skills, CLAUDE.md's extracted references)
// or glob pathspecs (a rule's pathGlobs) — git's pathspec matching accepts
// both.
function domainChurn(root, relPaths, sinceMs) {
  if (!relPaths || relPaths.length === 0) return 0;
  try {
    const since = new Date(sinceMs || 0).toISOString().slice(0, 10);
    const out = execFileSync(
      'git',
      ['-C', root, 'log', '--oneline', `--since=${since}`, '--', ...relPaths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

// ─── selectTarget ────────────────────────────────────────────────────────────
// opts: { now?: number, signals?: { [kind:id]: number }, kind?: string }
// Returns { kind, id, path, why: 'stale' | 'hotspot' } or null. Cursor and
// signal lookups are namespaced as `${kind}:${id}` so a skill and a rule that
// happen to share a bare id never collide.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by "kind:id" key
  const kindFilter = opts.kind || null;

  let candidates = listTargets(root);
  if (kindFilter) candidates = candidates.filter((c) => c.kind === kindFilter);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any target unaudited past STALE_DAYS.
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...candidate, why: 'stale' };
    }
  }

  // Phase 2: among non-stale candidates, score by domain churn since last audit.
  const scored = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    const cursor = cursors[key] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[key] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(candidate.path, 'utf8'); } catch { content = ''; }
      const domainPaths = candidate.kind === 'rule' && candidate.pathGlobs && candidate.pathGlobs.length > 0
        ? candidate.pathGlobs
        : extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
    }
    if (churn > 0) scored.push({ candidate, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.candidate.id < b.candidate.id ? -1 : 1)));
  return { ...scored[0].candidate, why: 'hotspot' };
}

module.exports = {
  listSkills, parseRulePaths, listRules, listClaudeMd, listTargets,
  extractDomainPaths, domainChurn, selectTarget,
};
```

- [ ] **Step 4: Update the existing `selectTarget` tests to use namespaced cursor/signal keys**

The pre-existing `selectTarget` tests passed bare ids (`auth`, `billing`) as cursor/signal keys. They must now use the namespaced `skill:<id>` form to test the intended scenario (a stale/fresh *skill* specifically), not an accidental cursor-miss.

```
old_string:
test('selectTarget force-picks a skill unaudited past STALE_DAYS even with a cursor present', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const staleMs = Date.now() - (90 + 5) * 86400000;
  const result = selectTarget(root, { auth: { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget returns null when all skills are fresh with zero churn', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { auth: { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { auth: 0 },
  });
  assert.strictEqual(result, null);
});

test('selectTarget picks the highest-churn skill among fresh candidates (via signals injection)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    auth: { lastAuditedMs: recentMs },
    billing: { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { auth: 2, billing: 8 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'billing');
  assert.strictEqual(result.why, 'hotspot');
});
```
```
new_string:
test('selectTarget force-picks a skill unaudited past STALE_DAYS even with a cursor present', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const staleMs = Date.now() - (90 + 5) * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: staleMs } }, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget returns null when all skills are fresh with zero churn', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const recentMs = Date.now() - 1 * 86400000;
  const result = selectTarget(root, { 'skill:auth': { lastAuditedMs: recentMs } }, {
    now: Date.now(),
    signals: { 'skill:auth': 0 },
  });
  assert.strictEqual(result, null);
});

test('selectTarget picks the highest-churn skill among fresh candidates (via signals injection)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    'skill:auth': { lastAuditedMs: recentMs },
    'skill:billing': { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { 'skill:auth': 2, 'skill:billing': 8 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'billing');
  assert.strictEqual(result.why, 'hotspot');
});

test('selectTarget does not collide when a skill and a rule share the same bare id', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'auth.md'), '---\npaths:\n  - src/auth/**\n---\n');
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    'skill:auth': { lastAuditedMs: recentMs },
    'rule:auth': { lastAuditedMs: recentMs },
  };
  const result = selectTarget(root, cursors, {
    now: Date.now(),
    signals: { 'skill:auth': 0, 'rule:auth': 5 },
  });
  assert.ok(result !== null);
  assert.strictEqual(result.kind, 'rule');
  assert.strictEqual(result.id, 'auth');
});

test('selectTarget --kind filter restricts the pool to one kind', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const result = selectTarget(root, {}, { now: Date.now(), kind: 'claude-md' });
  assert.ok(result !== null);
  assert.strictEqual(result.kind, 'claude-md');
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test bin/lib/harness-health/tests/scope.test.js
```

Expected: PASS, all tests including the new ones.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add bin/lib/harness-health/scope.js bin/lib/harness-health/tests/scope.test.js
git commit -m "Extend scope.js with listRules/listClaudeMd/listTargets and a unified target pool"
```

---

### Task 3: Extend the Finding Shape — `target`/`assetType`/`category` across fingerprint, validation, and issue payload

**Files:**
- Modify: `bin/lib/harness-health/fingerprint.js`, `bin/lib/harness-health/tests/fingerprint.test.js`
- Modify: `bin/lib/harness-health/validate-finding.js`, `bin/lib/harness-health/tests/validate-finding.test.js`
- Modify: `bin/lib/harness-health/issue-payload.js`, `bin/lib/harness-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: nothing new from Task 2 (this task is independent of scope.js).
- Produces: `fingerprint({ assetType, target, section, description })` (renamed `skill`→`target`, added `assetType`, both part of the hash basis). `validateFinding` now requires `target`, `assetType` (`skill|rule|claude-md`), and `category` (`drift|template-conformance|best-practice`) on every finding, in addition to the pre-existing required fields. `toIssuePayload` reads `finding.target`/`finding.assetType`/`finding.category` and produces asset-type- and category-aware titles (e.g. `"Rule drift: api-errors — paths glob"`, `"CLAUDE.md best-practice: CLAUDE — Conventions"`) and carries `assetType`/`category` through to the payload object. Task 4 wires `bin/harness-health.js`'s caller code to these new signatures.

- [ ] **Step 1: Write failing tests for the new required fields**

Read `bin/lib/harness-health/tests/fingerprint.test.js`, then replace its full contents with:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../fingerprint');

test('fingerprint returns a harnesshealth-<8hex> id', () => {
  const id = fingerprint({ assetType: 'skill', target: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.match(id, /^harnesshealth-[0-9a-f]{8}$/);
});

test('fingerprint is stable across whitespace and case differences in description', () => {
  const a = fingerprint({ assetType: 'skill', target: 'auth', section: 'Key Patterns', description: 'Stale   Example Path' });
  const b = fingerprint({ assetType: 'skill', target: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when assetType, target, section, or description differs', () => {
  const base = { assetType: 'skill', target: 'auth', section: 'Key Patterns', description: 'stale example' };
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, assetType: 'rule' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, target: 'billing' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, section: 'Anti-Patterns' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, description: 'different text' }));
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
```

Read `bin/lib/harness-health/tests/validate-finding.test.js`, then replace its full contents with:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validPatch(overrides = {}) {
  return {
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'additive',
    confidence: 'high',
    reversibility: 'high',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

function validNewSkill(overrides = {}) {
  return {
    kind: 'new-skill',
    target: 'queue-retry-pattern',
    assetType: 'skill',
    category: 'drift',
    classification: 'additive',
    confidence: 'med',
    reversibility: 'high',
    description: 'Three files implement retry-with-backoff with no skill covering it',
    proposedBody: '---\nname: queue-retry-pattern\ndescription: Use when...\n---\n# Queue Retry Pattern',
    reason: 'src/jobs/a.js, b.js, c.js all implement the same pattern independently.',
    ...overrides,
  };
}

test('validateFinding accepts a well-formed patch finding', () => {
  const result = validateFinding(validPatch());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.target, 'auth');
});

test('validateFinding accepts a well-formed new-skill finding', () => {
  const result = validateFinding(validNewSkill());
  assert.strictEqual(result.ok, true);
});

test('validateFinding rejects a non-object', () => {
  const result = validateFinding(null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('validateFinding rejects a missing required string field', () => {
  const bad = validPatch();
  delete bad.description;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('description:')));
});

test('validateFinding rejects an unknown kind', () => {
  const result = validateFinding(validPatch({ kind: 'bogus' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('kind:')));
});

test('validateFinding rejects an unknown assetType', () => {
  const result = validateFinding(validPatch({ assetType: 'agent' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('assetType:')));
});

test('validateFinding rejects an unknown category', () => {
  const result = validateFinding(validPatch({ category: 'vibes' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('category:')));
});

test('validateFinding rejects an unknown classification/confidence/reversibility', () => {
  assert.strictEqual(validateFinding(validPatch({ classification: 'huge' })).ok, false);
  assert.strictEqual(validateFinding(validPatch({ confidence: 'super' })).ok, false);
  assert.strictEqual(validateFinding(validPatch({ reversibility: 'meh' })).ok, false);
});

test('validateFinding rejects a patch finding missing section, oldString, or newString', () => {
  const noSection = validPatch(); delete noSection.section;
  assert.strictEqual(validateFinding(noSection).ok, false);

  const noOld = validPatch(); delete noOld.oldString;
  assert.strictEqual(validateFinding(noOld).ok, false);

  const noNew = validPatch({ newString: '' });
  assert.strictEqual(validateFinding(noNew).ok, false);
});

test('validateFinding accepts an empty oldString for a pure addition', () => {
  const result = validateFinding(validPatch({ oldString: '' }));
  assert.strictEqual(result.ok, true);
});

test('validateFinding rejects a new-skill finding missing proposedBody', () => {
  const bad = validNewSkill(); delete bad.proposedBody;
  const result = validateFinding(bad);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('proposedBody:')));
});
```

Read `bin/lib/harness-health/tests/issue-payload.test.js`, then replace its full contents with:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function patchFinding(overrides = {}) {
  return {
    id: 'skillhealth-abc12345',
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

function newSkillFinding(overrides = {}) {
  return {
    id: 'skillhealth-def67890',
    kind: 'new-skill',
    target: 'queue-retry-pattern',
    assetType: 'skill',
    category: 'drift',
    classification: 'additive',
    confidence: 'med',
    reversibility: 'high',
    description: 'Three files implement retry-with-backoff with no skill covering it',
    proposedBody: '---\nname: queue-retry-pattern\n---\n# Queue Retry Pattern',
    reason: 'src/jobs/a.js, b.js, c.js all implement the same pattern independently.',
    ...overrides,
  };
}

test('toIssuePayload for a patch finding includes the fingerprint marker and labels', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('<!-- harness-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['harness-health', 'harness-health:new-skill']);
  assert.ok(payload.title.includes('queue-retry-pattern'));
  assert.ok(payload.body.includes('Queue Retry Pattern'));
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});

test('toIssuePayload for a patch finding carries structured decision fields matching the input finding', () => {
  const finding = patchFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
  assert.strictEqual(payload.oldString, finding.oldString);
  assert.strictEqual(payload.newString, finding.newString);
});

test('toIssuePayload for a new-skill finding carries structured decision fields matching the input finding', () => {
  const finding = newSkillFinding();
  const payload = toIssuePayload(finding);
  assert.strictEqual(payload.id, finding.id);
  assert.strictEqual(payload.kind, finding.kind);
  assert.strictEqual(payload.target, finding.target);
  assert.strictEqual(payload.assetType, finding.assetType);
  assert.strictEqual(payload.category, finding.category);
  assert.strictEqual(payload.classification, finding.classification);
  assert.strictEqual(payload.confidence, finding.confidence);
  assert.strictEqual(payload.reversibility, finding.reversibility);
});

test('toIssuePayload title reflects asset type and category', () => {
  const rule = toIssuePayload(patchFinding({ assetType: 'rule', target: 'api-errors', section: 'paths glob' }));
  assert.ok(rule.title.startsWith('Rule drift:'), rule.title);

  const claudeMd = toIssuePayload(patchFinding({ assetType: 'claude-md', target: 'CLAUDE', section: 'Conventions', category: 'best-practice' }));
  assert.ok(claudeMd.title.startsWith('CLAUDE.md best-practice:'), claudeMd.title);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test bin/lib/harness-health/tests/fingerprint.test.js bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js
```

Expected: FAIL — `fingerprint` doesn't yet accept `assetType`/`target`, `validateFinding` doesn't require them, `toIssuePayload` doesn't read them.

- [ ] **Step 3: Implement the new fingerprint basis**

Read `bin/lib/harness-health/fingerprint.js`, then replace its full contents with:

```js
'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from assetType + target + section + normalized description. Same
// shape as recon's fingerprint (criterion+areaId+anchor) — assetType+target
// stand in for criterion, section stands in for areaId, description stands in
// for anchor. assetType is included so a skill and a rule that happen to
// share a target id never collide.
function fingerprint({ assetType, target, section, description }) {
  const basis = JSON.stringify([assetType, target, section, normalizeDescription(description)]);
  return 'harnesshealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 4: Implement the new required fields in `validate-finding.js`**

Read `bin/lib/harness-health/validate-finding.js`, then replace its full contents with:

```js
'use strict';

// Validates a harness-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/harness-health-analysis.md.
// Returns { ok:true, value } or { ok:false, errors:string[] }.

const KIND_VALUES = new Set(['patch', 'new-skill']);
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md']);
const CATEGORY_VALUES = new Set(['drift', 'template-conformance', 'best-practice']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['kind', 'target', 'assetType', 'category', 'description', 'reason', 'classification', 'confidence', 'reversibility'];

function validateFinding(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, errors: ['finding: must be an object'] };
  }

  for (const field of REQUIRED_STRINGS) {
    const v = obj[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`${field}: required non-empty string (got ${JSON.stringify(v)})`);
    }
  }

  if (typeof obj.kind === 'string' && !KIND_VALUES.has(obj.kind)) {
    errors.push(`kind: must be one of ${[...KIND_VALUES].join('|')} (got "${obj.kind}")`);
  }
  if (typeof obj.assetType === 'string' && !ASSET_TYPE_VALUES.has(obj.assetType)) {
    errors.push(`assetType: must be one of ${[...ASSET_TYPE_VALUES].join('|')} (got "${obj.assetType}")`);
  }
  if (typeof obj.category === 'string' && !CATEGORY_VALUES.has(obj.category)) {
    errors.push(`category: must be one of ${[...CATEGORY_VALUES].join('|')} (got "${obj.category}")`);
  }
  if (typeof obj.classification === 'string' && !CLASSIFICATION_VALUES.has(obj.classification)) {
    errors.push(`classification: must be one of ${[...CLASSIFICATION_VALUES].join('|')} (got "${obj.classification}")`);
  }
  if (typeof obj.confidence === 'string' && !CONFIDENCE_VALUES.has(obj.confidence)) {
    errors.push(`confidence: must be one of ${[...CONFIDENCE_VALUES].join('|')} (got "${obj.confidence}")`);
  }
  if (typeof obj.reversibility === 'string' && !REVERSIBILITY_VALUES.has(obj.reversibility)) {
    errors.push(`reversibility: must be one of ${[...REVERSIBILITY_VALUES].join('|')} (got "${obj.reversibility}")`);
  }

  if (obj.kind === 'patch') {
    if (typeof obj.section !== 'string' || obj.section.trim() === '') {
      errors.push('section: required non-empty string when kind is "patch"');
    }
    if (typeof obj.oldString !== 'string') {
      errors.push('oldString: required string when kind is "patch" (empty string allowed for pure additions)');
    }
    if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
      errors.push('newString: required non-empty string when kind is "patch"');
    }
  }
  if (obj.kind === 'new-skill') {
    if (typeof obj.proposedBody !== 'string' || obj.proposedBody.trim() === '') {
      errors.push('proposedBody: required non-empty string when kind is "new-skill"');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}

module.exports = {
  validateFinding, KIND_VALUES, ASSET_TYPE_VALUES, CATEGORY_VALUES,
  CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES,
};
```

- [ ] **Step 5: Implement asset-type- and category-aware output in `issue-payload.js`**

Read `bin/lib/harness-health/issue-payload.js`, then replace its full contents with:

```js
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.

const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md' };
const CATEGORY_LABELS = { drift: 'drift', 'template-conformance': 'structure', 'best-practice': 'best-practice' };

function toIssuePayload(finding) {
  const marker = `<!-- harness-health-fingerprint: ${finding.id} -->`;
  const assetLabel = ASSET_TYPE_LABELS[finding.assetType] || finding.assetType;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const kindLine = finding.kind === 'new-skill'
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**${assetLabel}:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = finding.kind === 'new-skill'
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  const body = [
    marker,
    '',
    kindLine,
    '',
    '## Current State',
    '',
    finding.reason,
    '',
    '## Deliverables',
    '',
    deliverables,
    '',
    '## Acceptance Criteria',
    '',
    finding.description,
    '',
    '_Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  const title = finding.kind === 'new-skill'
    ? `New skill candidate: ${finding.target}`
    : `${assetLabel} ${categoryLabel}: ${finding.target} — ${finding.section}`;

  return {
    id: finding.id,
    kind: finding.kind,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    title,
    body,
    labels: ['harness-health', finding.kind === 'new-skill' ? 'harness-health:new-skill' : `harness-health:${finding.classification}`],
  };
}

module.exports = { toIssuePayload };
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
node --test bin/lib/harness-health/tests/fingerprint.test.js bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js
```

Expected: PASS.

- [ ] **Step 7: Run the full suite**

Expected: some `cli-*.test.js` and `cache.test.js` failures are OK at this checkpoint — `bin/harness-health.js` itself still calls `fingerprint({ skill: ... })` (the old shape) until Task 4 rewires it, and `validateFinding` now rejects findings missing `target`/`assetType`/`category`, which the CLI tests' `validFinding()`/`patchFinding()` fixtures don't yet provide. Run it anyway to see the expected failure set, but do not attempt to fix `bin/harness-health.js` or the CLI tests here — that's Task 4.

```bash
npm test
```

Expected: `bin/lib/harness-health/tests/fingerprint.test.js`, `validate-finding.test.js`, `issue-payload.test.js` PASS; `cli-mark.test.js`, `cli-next-target.test.js`, `cli-validate-findings.test.js` FAIL (expected — fixed in Task 4).

- [ ] **Step 8: Commit**

```bash
git add bin/lib/harness-health/fingerprint.js bin/lib/harness-health/tests/fingerprint.test.js \
        bin/lib/harness-health/validate-finding.js bin/lib/harness-health/tests/validate-finding.test.js \
        bin/lib/harness-health/issue-payload.js bin/lib/harness-health/tests/issue-payload.test.js
git commit -m "Add assetType/category fields and rename skill->target across the Finding Shape"
```

Note: this commit intentionally leaves `npm test` red (the 3 CLI test files) — Task 4 fixes it in the same work session. If your workflow requires green-at-every-commit, squash Tasks 3-4 into a single commit instead.

---

### Task 4: Wire `--target`/`--kind` into `bin/harness-health.js` and fix the 3 CLI test files

**Files:**
- Modify: `bin/harness-health.js`
- Modify: `bin/lib/harness-health/tests/cli-mark.test.js`, `cli-next-target.test.js`, `cli-validate-findings.test.js`

**Interfaces:**
- Consumes: `listTargets`/`selectTarget(root, cursors, { now, kind })` from Task 2; `fingerprint({ assetType, target, section, description })` and `validateFinding`'s new required fields from Task 3.
- Produces: a fully working CLI — `next-target [--target <id>] [--kind <skill|rule|claude-md>] [--budget <n>]` and `validate-findings <file> [--target <id>] [--kind <kind>] [--issues <file>] [--gap-scan] [--dry-run]`. Cursor recording uses the namespaced `${kind}:${target}` key. This closes out the engine work — Tasks 5-8 are documentation/cross-reference only.

- [ ] **Step 1: Update the 3 CLI test files to use `--target`/`--kind` and the new Finding Shape**

Read `bin/lib/harness-health/tests/cli-mark.test.js`, then replace its full contents with:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-mark-')); }

test('mark writes an applied status to the cache', () => {
  const root = tmp();
  const raw = execFileSync('node', [CLI, 'mark', 'skillhealth-abc12345', 'applied', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.status, 'applied');
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['skillhealth-abc12345'].status, 'applied');
});

test('mark writes a declined status to the cache', () => {
  const root = tmp();
  execFileSync('node', [CLI, 'mark', 'skillhealth-xyz98765', 'declined', '--root', root], { encoding: 'utf8' });
  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache['skillhealth-xyz98765'].status, 'declined');
});

test('mark exits non-zero for an invalid status', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', 'skillhealth-abc12345', 'bogus', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('mark exits non-zero when the fingerprint arg is missing', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'mark', '--root', root], { encoding: 'utf8' });
  assert.notStrictEqual(result.status, 0);
});

test('a finding marked declined is suppressed by a later validate-findings run on the same fingerprint', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  const finding = {
    kind: 'patch', target: 'auth', assetType: 'skill', category: 'drift', section: 'Auth', classification: 'restructural',
    confidence: 'high', reversibility: 'med', description: 'x', oldString: 'a', newString: 'b', reason: 'y',
  };
  fs.writeFileSync(findingsFile, JSON.stringify([finding]));
  const first = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(first.length, 1, 'first run must file the finding');
  const fp = first[0].id;
  execFileSync('node', [CLI, 'mark', fp, 'declined', '--root', root], { encoding: 'utf8' });
  const second = JSON.parse(execFileSync('node', [CLI, 'validate-findings', findingsFile, '--root', root], { encoding: 'utf8' }));
  assert.strictEqual(second.length, 0, 'declined finding must be suppressed on the next run');
});
```

Read `bin/lib/harness-health/tests/cli-next-target.test.js`, then replace its full contents with:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeCursors } = require('../cache');

const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-nt-')); }
function runNextTarget(args, root) {
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-target returns { target: null, gapScanDue: true } for a project with no targets yet', () => {
  const root = tmp();
  const result = runNextTarget([], root);
  assert.strictEqual(result.target, null);
  assert.strictEqual(result.gapScanDue, true, 'a never-scanned project is due for its first gap scan');
});

test('next-target picks a never-audited skill as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = runNextTarget([], root);
  assert.ok(result.target !== null);
  assert.strictEqual(result.target.id, 'auth');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --target <id> bypasses selection and returns why: "manual"', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const result = runNextTarget(['--target', 'billing'], root);
  assert.strictEqual(result.target.id, 'billing');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --target <id> --kind <kind> disambiguates a skill/rule id collision', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'auth.md'), '---\npaths:\n  - src/auth/**\n---\n');
  const result = runNextTarget(['--target', 'auth', '--kind', 'rule'], root);
  assert.strictEqual(result.target.kind, 'rule');
});

test('next-target --kind filters the auto-selected pool to one kind', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project\n');
  const result = runNextTarget(['--kind', 'claude-md'], root);
  assert.strictEqual(result.target.kind, 'claude-md');
});

test('next-target gapScanDue is false right after a gap scan was recorded (via --gap-scan on validate-findings)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  writeCursors(root, { __gapScan: { lastScannedSha: null, lastScannedMs: Date.now() } });
  const result = runNextTarget([], root);
  assert.strictEqual(result.gapScanDue, false);
});

test('next-target --budget 2 returns an array of up to 2 unique targets', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result.targets), 'must return a targets array when --budget > 1');
  assert.ok(result.targets.length >= 1 && result.targets.length <= 2);
  const ids = result.targets.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-target without --budget still returns a single target object (default budget=1, no shape regression)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const result = runNextTarget([], root);
  assert.ok(!Array.isArray(result.target), 'default (no --budget) must not change the existing target shape');
  assert.strictEqual(result.target.id, 'auth');
});
```

Read `bin/lib/harness-health/tests/cli-validate-findings.test.js`, then replace its full contents with:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'harness-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-health-vf-')); }

function runValidateFindings(root, findingsFile, extraArgs = []) {
  return spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs], { encoding: 'utf8' });
}

function validFinding(overrides = {}) {
  return {
    kind: 'patch',
    target: 'auth',
    assetType: 'skill',
    category: 'drift',
    section: 'Key Patterns',
    classification: 'restructural',
    confidence: 'high',
    reversibility: 'med',
    description: 'Stale example path',
    oldString: 'See `src/auth/login.js`.',
    newString: 'See `src/auth/session.js`.',
    reason: 'login.js was renamed to session.js.',
    ...overrides,
  };
}

test('validate-findings: valid finding emits one payload on stdout', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(payloads[0].labels.includes('harness-health'));
  assert.ok(payloads[0].body.includes('<!-- harness-health-fingerprint: harnesshealth-'));
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { kind: 'patch', target: 'auth' }; // missing required fields
  const good = validFinding({ target: 'billing', description: 'other issue' });
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([malformed, good]));

  const result = runValidateFindings(root, findingsFile);
  assert.strictEqual(result.status, 0);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1);
  assert.ok(result.stderr.includes('dropped'));
});

test('validate-findings: --dry-run emits payloads but writes no state', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const result = runValidateFindings(root, findingsFile, ['--dry-run', '--target', 'auth', '--kind', 'skill', '--gap-scan']);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(JSON.parse(result.stdout).length, 1);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json')), false);
});

test('validate-findings: --target <id> --kind <kind> records the audit cursor under the namespaced key', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([])); // an empty array is valid — still records the audit

  const result = runValidateFindings(root, findingsFile, ['--target', 'auth', '--kind', 'skill']);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors['skill:auth'].lastAuditedMs === 'number');
});

test('validate-findings: --gap-scan records the global gap-scan cursor', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([]));

  const result = runValidateFindings(root, findingsFile, ['--gap-scan']);
  assert.strictEqual(result.status, 0);
  const cursors = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cursors.json'), 'utf8'));
  assert.ok(typeof cursors.__gapScan.lastScannedMs === 'number');
});

test('validate-findings: a finding already open in the issue index is skipped (dedup)', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*harness-health-fingerprint:\s*(harnesshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['harness-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(JSON.parse(second.stdout).length, 0, 'open finding must be skipped');
});

test('validate-findings: a malformed --issues file degrades gracefully with a stderr warning, not a hard failure', () => {
  const root = tmp();
  const f = validFinding();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([f]));
  const badIssuesFile = path.join(root, 'bad-issues.json');
  fs.writeFileSync(badIssuesFile, 'not valid json{{{');

  const result = runValidateFindings(root, findingsFile, ['--issues', badIssuesFile]);
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('could not read or parse --issues file'), `expected a warning in stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'must still file the finding, just without issue-based dedup');
});

test('validate-findings: exits non-zero when the findings file is missing', () => {
  const root = tmp();
  const result = runValidateFindings(root, path.join(root, 'nonexistent.json'));
  assert.notStrictEqual(result.status, 0);
});

test('churn-report: prints "no run logs found" when no runs exist', () => {
  const root = tmp();
  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0);
  assert.ok(result.stdout.includes('no run logs found'));
});

test('churn-report: a real run followed by churn-report prints a table row', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));
  runValidateFindings(root, findingsFile, ['--run-id', 'run-1']);

  const result = spawnSync('node', [CLI, 'churn-report', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('run-1'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `bin/harness-health.js` still parses `--skill` and calls `fingerprint({ skill: ... })`, so `--target`/`--kind` are unrecognized and `validateFinding` rejects the missing `assetType`/`category`.

- [ ] **Step 3: Implement `--target`/`--kind` in `bin/harness-health.js`**

Read `bin/harness-health.js`, then replace its full contents with:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/harness-health/fingerprint');
const {
  readCache, writeCache, readCursors, recordAudit,
  readGapScanCursor, recordGapScan, recordRun, readRuns, computeChurn,
} = require('./lib/harness-health/cache');
const { decide } = require('./lib/harness-health/dedup');
const { validateFinding } = require('./lib/harness-health/validate-finding');
const { toIssuePayload } = require('./lib/harness-health/issue-payload');
const { selectTarget, listTargets } = require('./lib/harness-health/scope');
const { STALE_DAYS } = require('./lib/harness-health/score');

function parseArgs(argv) {
  const args = { _: [], root: process.cwd(), dryRun: false, runId: new Date().toISOString() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--kind') args.kind = argv[++i];
    else if (a === '--issues') args.issues = argv[++i];
    else if (a === '--gap-scan') args.gapScan = true;
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--fail-on-high-churn') args['fail-on-high-churn'] = argv[++i];
    else if (a === '--budget') args.budget = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[harness-health] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[harness-health] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

function cmdNextTarget(args) {
  const root = args.root || process.cwd();
  const now = Date.now();
  const gapScan = readGapScanCursor(root);
  const gapScanDue = gapScan.lastScannedMs == null || (now - gapScan.lastScannedMs) / 86400000 > STALE_DAYS;

  if (args.target) {
    // --kind disambiguates when a skill/rule/CLAUDE.md id collides; without it,
    // the first match in listTargets' skill->rule->claude-md order wins.
    const found = listTargets(root).find((t) => t.id === args.target && (!args.kind || t.kind === args.kind)) || null;
    const target = found ? { ...found, why: 'manual' } : null;
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  const budget = Number.isFinite(args.budget) && args.budget > 0 ? args.budget : 1;
  let cursors = readCursors(root);

  if (budget === 1) {
    const target = selectTarget(root, cursors, { now, kind: args.kind });
    process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
    return;
  }

  // budget > 1: iterate, simulating post-audit cursor state in-memory so each
  // pick is a different target (mirrors recon's next-slice --budget).
  const targets = [];
  for (let i = 0; i < budget; i++) {
    const target = selectTarget(root, cursors, { now, kind: args.kind });
    if (!target) break;
    targets.push(target);
    const key = `${target.kind}:${target.id}`;
    cursors = { ...cursors, [key]: { ...(cursors[key] || {}), lastAuditedMs: now } };
  }
  process.stdout.write(JSON.stringify({ targets, gapScanDue }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: harness-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--target <id>] [--kind <skill|rule|claude-md>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
    );
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  } catch {
    process.stderr.write(`validate-findings: could not read or parse findings file: ${findingsPath}\n`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    process.stderr.write('validate-findings: findings file must contain a JSON array\n');
    process.exit(1);
  }

  const survivors = [];
  for (const f of raw) {
    const v = validateFinding(f);
    if (!v.ok) {
      process.stderr.write(
        `[harness-health] validate-findings: dropped finding for target "${(f && f.target) || '?'}": ${v.errors.join('; ')}\n`,
      );
      continue;
    }
    const id = fingerprint({
      assetType: v.value.assetType,
      target: v.value.target,
      section: v.value.section || v.value.kind,
      description: v.value.description,
    });
    survivors.push({ ...v.value, id });
  }

  const cache = readCache(root);
  const issueIndex = loadIssueIndex(args.issues);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }

  if (!args.dryRun) {
    writeCache(root, cache);
    if (args.target && args.kind) recordAudit(root, `${args.kind}:${args.target}`, {});
    if (args.gapScan) recordGapScan(root, {});
    recordRun(root, args.runId, [...seen]);
  }

  process.stdout.write(JSON.stringify(payloads, null, 2) + '\n');
  process.stderr.write(
    `[harness-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
  );
}

function cmdChurnReport(args) {
  const root = args.root || process.cwd();
  const runs = readRuns(root);
  if (runs.length === 0) {
    process.stdout.write('no run logs found\n');
    return;
  }
  const threshold = args['fail-on-high-churn'] != null ? parseFloat(args['fail-on-high-churn']) : null;
  const rows = [['runId', 'runAt', 'findings', 'appeared', 'disappeared', 'ratio']];
  let exceeded = false;
  for (let i = 0; i < runs.length; i++) {
    const prior = i > 0 ? runs[i - 1] : null;
    const c = computeChurn(runs[i].fingerprints, prior);
    rows.push([
      runs[i].runId,
      (runs[i].runAt || '').slice(0, 19),
      String(runs[i].fingerprints.length),
      String(c.appeared.length),
      String(c.disappeared.length),
      String(c.ratio),
    ]);
    if (threshold != null && prior != null && c.ratio >= threshold) exceeded = true;
  }
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    process.stdout.write(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ') + '\n');
  }
  if (exceeded) {
    process.stdout.write(`\nhigh churn: one or more runs >= ${threshold}\n`);
    process.exit(1);
  }
}

const MARK_STATUSES = new Set(['applied', 'declined']);

function cmdMark(args) {
  const root = args.root || process.cwd();
  const fp = args._[1];
  const status = args._[2];
  if (!fp || !MARK_STATUSES.has(status)) {
    process.stderr.write(`usage: harness-health.js mark <fingerprint> <${[...MARK_STATUSES].join('|')}> [--root <dir>]\n`);
    process.exit(2);
  }
  const cache = readCache(root);
  cache[fp] = { status, lastSeenMs: Date.now() };
  writeCache(root, cache);
  process.stdout.write(JSON.stringify(cache[fp], null, 2) + '\n');
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  if (cmd === 'mark') return cmdMark(args);
  process.stderr.write(
    'usage: harness-health.js <command> [options]\n' +
    'commands: next-target [--target <id>] [--kind <skill|rule|claude-md>] [--budget <n>], ' +
    'validate-findings <file> [--target <id>] [--kind <skill|rule|claude-md>] [--gap-scan], ' +
    'churn-report [--fail-on-high-churn <r>], mark <fingerprint> <applied|declined>\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, cmdMark, main };
```

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: PASS — 100% green across `tests/`, `bin/lib/recon/tests/`, `bin/lib/issues/tests/`, and `bin/lib/harness-health/tests/`.

- [ ] **Step 5: Commit**

```bash
git add bin/harness-health.js bin/lib/harness-health/tests/cli-mark.test.js \
        bin/lib/harness-health/tests/cli-next-target.test.js bin/lib/harness-health/tests/cli-validate-findings.test.js
git commit -m "Wire --target/--kind CLI flags into harness-health's engine"
```

This closes out all engine (code) work. Tasks 5-8 are documentation and cross-reference updates only.

---

### Task 5: Rewrite the shared judge procedure — `_shared/harness-health-analysis.md`

**Files:**
- Move: `skills/_shared/skill-health-analysis.md` → `skills/_shared/harness-health-analysis.md`
- Modify: full content rewrite of the moved file

**Interfaces:**
- Consumes: nothing from earlier tasks (documentation-only; not read by any test).
- Produces: the canonical judge procedure that Task 6's `skills/harness-health/SKILL.md` (and, unchanged this phase, `/init` and `/wrap-up`'s existing skill-only call sites) reads. Defines the Finding Shape (`target`/`assetType`/`category` fields matching Task 3's `validate-finding.js` enums exactly), the 8-dimension check, and the per-kind reference-pointer table.

- [ ] **Step 1: Move the file**

```bash
git mv skills/_shared/skill-health-analysis.md skills/_shared/harness-health-analysis.md
```

- [ ] **Step 2: Replace its full contents**

Read `skills/_shared/harness-health-analysis.md`, then replace its full contents with:

````markdown
# Harness Health Analysis — Shared Procedure

Canonical procedure for judging whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows known best practices for getting an LLM harness to perform well; and for detecting a cohesive, reusable pattern with no skill covering it. Read by three consumers, each supplying its own scope model:

| Consumer | Supplies |
|---|---|
| `/claude-tweaks:harness-health` | One target per firing (any of skill/rule/claude-md), selected by churn/staleness rotation (`next-target`) |
| `/claude-tweaks:wrap-up` Step 7 | A finished spec's changed skill files + ledger/reflection seeds (skill-only this phase — see Scope note below) |
| `/claude-tweaks:init` Phase 3/6 | Whole-codebase Phase 2 reconnaissance (skill-only this phase — see Scope note below) |

**Scope note:** all three consumers can read every section of this procedure. `/claude-tweaks:wrap-up` and `/claude-tweaks:init` currently only invoke it against skills (their own scope-selection logic hasn't been extended to pass rule/CLAUDE.md files in) — extending them is a separate, smaller follow-on, not required by the harness-health design. `/claude-tweaks:harness-health` is the only consumer that exercises the rule/claude-md paths today.

This file owns the judgment. It does not own scope selection, staging destination, or cursor/cache mechanics — those are each consumer's own job.

## Finding Shape

Emit each finding as a JSON object in exactly this shape:

```json
{
  "kind": "patch",
  "target": "auth",
  "assetType": "skill",
  "category": "drift",
  "section": "Key Patterns",
  "classification": "additive",
  "confidence": "high",
  "reversibility": "high",
  "description": "The referenced example at src/auth/login.js no longer exists",
  "oldString": "See `src/auth/login.js` for the canonical flow.",
  "newString": "See `src/auth/session.js` for the canonical flow.",
  "reason": "src/auth/login.js was renamed to src/auth/session.js in a prior refactor; the skill still points at the old path."
}
```

For a new-skill candidate, use `"kind": "new-skill"` and replace `section`/`oldString`/`newString` with `"proposedBody"` (the full proposed SKILL.md content, using the Initial Mode template from `/claude-tweaks:init`'s `skill-template.md`):

```json
{
  "kind": "new-skill",
  "target": "queue-retry-pattern",
  "assetType": "skill",
  "category": "drift",
  "classification": "additive",
  "confidence": "med",
  "reversibility": "high",
  "description": "Three files under src/jobs/ implement the same retry-with-backoff pattern with no skill documenting it",
  "proposedBody": "---\nname: queue-retry-pattern\ndescription: ...\n---\n...",
  "reason": "src/jobs/emailQueue.js, src/jobs/webhookQueue.js, and src/jobs/syncQueue.js all implement retry-with-exponential-backoff independently — a reusable pattern with no skill covering it."
}
```

Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, or `"CLAUDE"` for CLAUDE.md), `assetType` (`skill` | `rule` | `claude-md`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`. `kind: "new-skill"` additionally requires `proposedBody`. **`new-skill` is the only artifact-creation kind** — rules and CLAUDE.md never get a `"new-rule"` or `"new-claude-md-section"` kind; a "missing pattern" finding against an existing rule or CLAUDE.md is always a `kind: "patch"` addition to that file's existing content (see Step 3).

`category` distinguishes *why* a finding exists, so a human skimming filed issues can tell them apart at a glance:
- **`drift`** — the document no longer matches the codebase's current reality.
- **`template-conformance`** — the document no longer matches the structure its own generator established.
- **`best-practice`** — the document is accurate and well-structured, but not written in a way that gets the harness to perform well.

**`oldString`/`newString` must be exact, unique, verbatim quotes from the target file** — not paraphrased "Current/Proposed" prose. The consuming skill applies additive+high-confidence+high-reversibility patches directly via the `Edit` tool, which requires `oldString` to match uniquely; a paraphrased or non-unique quote will fail to apply or apply to the wrong location. **Exception: CLAUDE.md findings never auto-apply regardless of classification/confidence/reversibility** — see the caller's own auto-apply gate (`skills/harness-health/SKILL.md` Step 7). CLAUDE.md governs every future session's behavior; an unattended routine editing it unattended carries outsized blast radius compared to a single skill's documentation.

## Step 1: Evidence Pre-Checks (deterministic, before judging)

Before forming any finding, run these mechanical checks and treat their output as evidence the judgment step weighs — not findings themselves:

1. **Stale-example check.** For every backtick-quoted file path or command referenced in the target (e.g. `` `src/auth/login.js` ``, `` `npm run build` ``), verify it still exists / still works:
   ```bash
   ls "<referenced-path>" 2>&1
   ```
   For commands, check the command exists in `package.json` scripts, a `Makefile`, or is a known binary. A referenced path or command that no longer resolves is strong evidence for a `stale examples` finding — cite the exact `ls`/check output as the finding's evidence, not just "this looks outdated."

2. **Quantified convention-drift check.** For each documented convention or pattern (e.g., "this project always uses X for Y"), grep how many current files actually match it vs. how many files in the same domain don't:
   ```bash
   grep -rl "<pattern-signature>" <domain-dir> | wc -l
   ```
   A convention followed by a small minority of relevant files (e.g., "2 of 15") is quantified evidence of drift — cite the ratio in the finding's evidence field, not just an impression.

3. **Rule glob-resolution check** (rules only, new). Expand the rule's `paths:` frontmatter glob(s) against the actual filesystem:
   ```bash
   find "<root>" -path "<glob>" 2>&1
   ```
   Zero matches is strong, mechanical evidence the rule's domain no longer exists (a renamed/removed directory) — a high-confidence `drift` finding proposing either an updated glob or retiring the rule.

4. **CLAUDE.md line-budget check** (CLAUDE.md only, new). `/init`'s own template caps CLAUDE.md at 150 lines:
   ```bash
   wc -l CLAUDE.md
   ```
   Over budget is mechanical, high-confidence evidence for a `template-conformance` finding — content belongs in a skill or rule instead, per `skills/init/claude-md-template.md`'s own "Under 150 lines" principle.

Checks 1-2 are optional assists — skip gracefully if a referenced path/command genuinely can't be checked mechanically (e.g., a described convention with no clean grep signature). A finding grounded in one of these checks is higher-confidence than one based on reading alone.

## Step 2: The 8-Dimension Check

For the target (or, for wrap-up/init, each skill in their own read set), apply the dimensions that meaningfully apply to its kind:

| Check | Question | Skill | Rule | CLAUDE.md |
|-------|----------|:---:|:---:|:---:|
| **1. Pattern accuracy** | Do documented examples/patterns still match how the codebase works? | ✓ | ✓ (does the stated convention still hold for files matching `paths:`?) | ✓ |
| **2. Convention drift** | Do documented conventions reflect current practice, or has the codebase diverged? (Use the quantified check from Step 1 where a clean grep signature exists.) | ✓ | ✓ (the adherence-ratio check — see guard below) | ✓ |
| **3. Missing patterns** | Has the codebase introduced patterns that belong here but aren't documented? | ✓ | — | ✓ (always a `patch` to an existing section, never a new one) |
| **4. Stale examples** | Do referenced file paths/commands still exist? (Use the stale-example check from Step 1.) | ✓ | ✓ (the glob-resolution check) | ✓ |
| **5. Anti-pattern gaps** | Has the codebase revealed new anti-patterns worth documenting? | ✓ | — | ✓ (Don'ts) |
| **6. Decision framework completeness** | Does the Decision Framework cover the choices the codebase actually makes? | ✓ | — | rarely (only if the project's CLAUDE.md happens to have one) |
| **7. Template/structural conformance** (new) | Does this artifact still match the structure its own generator established? | ✓ (CLAUDE.md's own "SKILL.md structure" convention + `skills/init/skill-template.md`) | ✓ (`skills/init/rules-template.md`'s frontmatter shape) | ✓ (`skills/init/claude-md-template.md`'s "Principles" — 150-line budget, observed-not-aspirational, required sections, Working Approach present verbatim) |
| **8. Best-practice/harness-performance fit** (new) | Does it follow known practices for getting an LLM harness to perform well (clear triggers, no cross-skill overlap, right-sized scope, concision)? | ✓ (`superpowers:writing-skills`) | ✓ (`skills/init/rules-template.md`'s own "path-specific only; project-wide belongs in CLAUDE.md" guidance — a suspiciously broad glob should be a CLAUDE.md convention instead) | ✓ (`skills/init/claude-md-template.md`'s Principles, same source as dimension 7 for this kind) |

For rules and CLAUDE.md, dimensions 7 and 8 read from the *same* origin-template file — for those two kinds the structural template and the best-practice guidance are the same document, since the project's own author already encoded best-practice judgment into the template. Read these templates **live** each time, not from a frozen copy of their content — a future tightening of `skill-template.md`/`rules-template.md`/`claude-md-template.md` is picked up automatically by every subsequent audit.

**Rule adherence-ratio guard (dimension 2).** A low adherence ratio (few files matching `paths:` actually follow the stated convention) has two different causes, and only one belongs to this procedure:
- **The codebase's shape moved on** (the glob now matches files the rule was never meant to cover, e.g. a newer sibling directory) → this is documentation drift, a real finding here.
- **Files that should comply, don't** (the rule is still correct; code violates it) → this is a code-quality/compliance problem, `/claude-tweaks:recon`'s job, not this procedure's. Do not emit a finding for this case.

Always reason about *why* the ratio is low before emitting a finding — never report the raw ratio as if a low number were self-evidently a documentation problem.

**CLAUDE.md-specific checks unlocked by dimension 7/8 (concrete, largely mechanical):**
- **Line budget** — Step 1's `wc -l` check vs. 150 lines.
- **Observed-not-aspirational** — flag language ("should", "TODO", "need to add") describing infrastructure that doesn't exist yet; that belongs in the project's INBOX, not CLAUDE.md.
- **Working Approach present verbatim** — `skills/init/claude-md-template.md` mandates this section be included unmodified in every generated CLAUDE.md; a structural presence check.
- **Don'ts are guardrails, not wishes** — every Don't must describe an *existing* pattern (grep-checkable, same evidence style as dimension 2), never aspirational infrastructure.
- **Philosophy matches current maturity** — re-derive today's maturity signal (the classification `/claude-tweaks:init` Phase 2h would compute right now) and compare it to what the Philosophy section says; flags e.g. a project that shipped to real users since the CLAUDE.md was written but still reads "Greenfield."
- **Project Defaults / claude-tweaks Pipeline sections in sync with the installed plugin version** — does the documented auto-mode-policy lever list match what the currently installed claude-tweaks plugin version actually supports? This one is checked against the plugin's own evolving contract (its bundled `_shared/auto-mode-contract.md`), not the target project's own source — a genuinely different kind of drift from every other check in this file.

**Bounded sub-file reads.** If the target references sub-files (lazy-loaded content, e.g. `init`'s 11 sub-files or `build`'s 6), do not read all of them by default — read only the sub-files whose content plausibly relates to what changed (matched by filename/section keyword against the change source: churned domain paths for the routine, the spec's changed files for wrap-up, Phase 2 findings for init). Note explicitly which sub-files were skipped and why, so a human reviewing the finding can request a deeper read if needed.

## Step 3: New-Skill Gap Detection

Independent of any specific target's audit, look for a **cohesive** set of files implementing one reusable pattern with **no** skill covering it. This step is skill-only — rules and CLAUDE.md never get an equivalent "new-rule" or "new-claude-md-section" gap scan this phase; their dimension 3 ("missing patterns") is the closest analog, and it always produces a `patch` against existing content instead. "Cohesive" means multiple files implementing the same pattern, not scattered one-off edits — ground this in concrete signals, not impression alone:

- A new top-level directory with 3+ files sharing a naming convention (e.g. `*.queue.js`, `*Repository.ts`).
- A recurring import combination (the same 2+ modules imported together) appearing in 3+ files with no matching skill.
- A commit-message keyword or phrase recurring across 3+ commits, none of which are covered by an existing skill's domain.

## Step 4: New-Skill Qualification Gate

Evaluate each gap candidate (from Step 3, or seeded by a caller — e.g. wrap-up's `[skill: NEW - {name}]` ledger tags) against three criteria:

1. **Reusability** — the pattern applies to 2+ future builds, not a one-off.
2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md, not a skill).
3. **Project-specific** — the pattern is specific to this project, not generic best practice.

**Propose the candidate when at least 2 of the 3 criteria are clearly met.** A candidate meeting all three is a strong recommendation; one meeting exactly two is proposed for human review. A candidate meeting ≤1 criterion is dropped — note which criteria were missing so the decision is auditable.

## Step 5: Verify Gate (adversarial, before staging)

Before a finding is emitted, re-examine it and answer three questions — same discipline `/recon` already applies:

1. **Is it real?** Does the target actually diverge from the codebase (or its own origin template, or known best practice), or did the judge misread the target's prose, the code's structure, or the template's requirements?
2. **Is it actionable?** For a patch: is `oldString` an exact, unique quote from the target file, and does `newString` concretely fix the issue (not "consider updating this")? For a new-skill candidate: is `proposedBody` a real, codebase-grounded SKILL.md, not a generic template?
3. **Does it reproduce?** Given the evidence cited, would a reviewer applying `newString` (or creating the proposed skill) end up with content that's actually correct, without further investigation?

Drop any finding that fails any of the three questions. Log the drop reason. This gate is a judgment step, not mechanical — do not skip it even for a routine firing under no time pressure to rush.

## Step 6: Quality Gates (before finalizing any patch or new skill)

- [ ] Every code example is adapted from actual codebase patterns (not generic).
- [ ] File paths referenced actually exist (post-patch).
- [ ] Commands referenced actually work.
- [ ] Conventions described match what the codebase actually does.
- [ ] No generic advice that adds no project-specific value.
- [ ] Anti-patterns/Don'ts cite project-specific reasons, not textbook warnings.
- [ ] A `kind: "new-skill"` finding's `proposedBody` description starts with "Use when..." and names a clear trigger.
- [ ] A `category: "template-conformance"` or `"best-practice"` finding cites the specific origin-template requirement it's checking against (not a vague "this could be better").

## Anchor Requirement

Every finding must trace to a concrete anchor — a specific referenced path/command that failed the Step 1 check, a quantified drift ratio, a zero-match glob expansion, a line-count over budget, a ledger entry, a reflection insight, or a specific changed-file/commit observation. A finding with no concrete anchor is indistinguishable from a hallucinated one — discard it, and note what was discarded and why.
````

- [ ] **Step 3: Sanity-check the rewrite**

```bash
grep -c "assetType\|category" skills/_shared/harness-health-analysis.md
grep -n "skill-health\|skillhealth" skills/_shared/harness-health-analysis.md
```

Expected: first command prints a count > 0; second command prints nothing (no stray old-name references survived the rewrite).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/harness-health-analysis.md
git commit -m "Rewrite the shared judge procedure for skills, rules, and CLAUDE.md"
```

---

### Task 6: Rewrite `skills/harness-health/SKILL.md` and `routine-template.yml`

**Files:**
- Modify: `skills/harness-health/SKILL.md` (full content rewrite)
- Modify: `skills/harness-health/routine-template.yml`

**Interfaces:**
- Consumes: `_shared/harness-health-analysis.md`'s Finding Shape and dimension table (Task 5); `--target`/`--kind` CLI flags (Task 4).
- Produces: the user-facing skill definition. Task 7's cross-reference updates in other skills point at this file's new name/location.

- [ ] **Step 1: Replace `skills/harness-health/SKILL.md`'s full contents**

Read `skills/harness-health/SKILL.md`, then replace its full contents with:

````markdown
---
name: claude-tweaks:harness-health
description: Use when you want to check whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows best practices for getting the harness to perform well; or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only harness documentation, and never auto-applies to CLAUDE.md. Keywords - harness health, skill health, skill drift, rule drift, CLAUDE.md drift, best practice, template conformance, new-skill gap, scheduled, routine.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Harness Health — Keep Skills, Rules, and CLAUDE.md Honest

A recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and either auto-applies a safe patch or files a `harness-health`-labelled GitHub issue. CLAUDE.md findings always file as an issue — never auto-applied. Never edits code — only harness documentation.

```
              [ /claude-tweaks:harness-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> auto-apply (skill/rule, additive+high-confidence+high-reversibility)
                              OR file GitHub issue (harness-health label; always for CLAUDE.md)
```

## When to Use

- You want skill, rule, and CLAUDE.md documentation to stay accurate between spec completions and full `/init` re-runs, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through skills, rules, and CLAUDE.md and flags drift, structural decay, or best-practice gaps as they're found.
- You want to check one specific target right now (`--target <name> [--kind <skill|rule|claude-md>]`).

Not for: code-quality findings (`/claude-tweaks:recon`'s job — including cases where a rule's `paths:` glob is still correct but the code doesn't comply with it). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does (currently against skills only), on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation. Not for auditing memory (`~/.claude/projects/*/memory/`) — out of scope; see the harness-health design doc for why.

## Input

`$ARGUMENTS` may contain:

- `--target <id>` — manual override: audit one specific target directly, bypassing `next-target` selection.
- `--kind <skill|rule|claude-md>` — disambiguate `--target` when an id collides across kinds, or (without `--target`) restrict auto-selection to one kind.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh` or `Edit`.
- `--budget <n>` — audit up to `n` targets in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null, gapScanDue: boolean }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...], gapScanDue: boolean }` instead — up to `n` targets, each a different id (possibly mixing kinds). When `targets` is present, run Steps 2-3 once per entry before moving on to Step 4 (gap scan runs once per firing regardless of budget, not once per target).

Read the `why` field on whichever target(s) came back:
- If both `target`/`targets` are empty and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this target has not been audited in over 90 days regardless of domain churn.
- `why: "hotspot"` — this target's domain paths (backtick-quoted references for skills/CLAUDE.md; the `paths:` frontmatter glob for rules) have the highest git churn since its last audit among targets with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

If there is no target to deep-audit this firing (`target` is `null`, or `targets` is empty) but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — the gap scan is still due even with nothing else to audit.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If none of `.claude/skills/`, `.claude/rules/`, or CLAUDE.md exist yet, report "no harness documentation to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.

**Step 4 — GAP SCAN (when due, per Step 1's `gapScanDue`).**

Apply `_shared/harness-health-analysis.md`'s new-skill gap detection over commits since the gap-scan cursor (or the whole repo, if this is the first-ever gap scan). Append any new-skill candidates to the same findings array from Step 3. This step is skill-only — it never proposes a new rule or a new CLAUDE.md section.

**Step 5 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label harness-health --state all --json number,state,labels,body --limit 500 > /tmp/harness-health-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- harness-health-fingerprint: harnesshealth-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/harness-health-issues.json`. If `gh` is unavailable or the repo has no `harness-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 6 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings /tmp/harness-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} ${TARGET_KIND:+--kind "$TARGET_KIND"} \
  ${GAP_SCAN_RAN:+--gap-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/harness-health-payloads.json
```

`TARGET_ID`/`TARGET_KIND` are `target.id`/`target.kind` from Step 1 (omit both if Step 1 returned `target: null` and only the gap scan ran — pass both together or neither, since cursor recording needs the namespaced `kind:id` key). `GAP_SCAN_RAN` is passed whenever Step 4 actually ran this firing. The command validates each finding, fingerprints via `assetType + target + section + normalizedDescription`, dedups against open `harness-health` issues and the local cache, records the audit cursor for `${TARGET_KIND}:${TARGET_ID}` (and the gap-scan cursor when `--gap-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 7 — APPLY or FILE.**

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown).

For each payload:
- If `payload.assetType === 'claude-md'` — **always file it, regardless of classification/confidence/reversibility.** CLAUDE.md governs every future session's behavior; an unattended routine auto-editing it carries outsized blast radius compared to one skill's documentation. This overrides the additive/high/high rule below.
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly), commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`, then mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
- Otherwise (restructural patches, any new-skill candidate, lower confidence/reversibility, or any CLAUDE.md finding) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`.

In `--dry-run` mode, print what would be applied/filed but do not call `Edit`, `git commit`, `gh`, or `mark`.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many auto-applied vs filed vs skipped by dedup. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: apply now / file issue / dismiss. For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

## Routine Configuration

`/harness-health` ships a routine template (`skills/harness-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create harness-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → apply/file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Additive+high-confidence+high-reversibility patches on **skills and rules** auto-apply and commit directly — this depends on the target project's CLAUDE.md already setting `auto-mode: default-on` (same situation `/tidy`'s routine is in, not `/recon`'s report-only case — see `_shared/auto-mode-contract.md`). Without that project policy, everything files as an issue instead of blocking on an unanswerable prompt. **CLAUDE.md findings always file as an issue, regardless of this policy.**

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

1. `/claude-tweaks:routine create harness-health` — schedule this as a recurring Routine. **(Recommended after a first standalone run confirms the output looks right.)**
2. `/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md>` — audit one specific target right now.
3. `/claude-tweaks:tidy` — fold any filed `harness-health` issues into a backlog-hygiene pass.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:harness-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Auto-applying a CLAUDE.md patch | CLAUDE.md findings always file as an issue for human review, regardless of classification/confidence/reversibility — it governs every future session's behavior, so an unattended bad edit has outsized blast radius. |
| Auto-applying a restructural patch (skill/rule) | Only additive+high-confidence+high-reversibility patches auto-apply — restructural changes always go through a filed issue for human review. |
| Treating a rule's low compliance ratio as automatic drift | A low adherence ratio can mean the code violates a still-correct rule (a `/recon` code-quality problem) rather than the rule being stale — always reason about *why* the ratio is low before emitting a finding. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging — the verify gate in `_shared/harness-health-analysis.md` is not optional. |
| Reading every sub-file of a candidate skill regardless of relevance | Some skills (`build`, `stories`, `init`) have many sub-files — exhaustive reads get expensive across a whole-library rotation. Bound reads by relevance. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/recon`. |
| Editing code to "fix" what a skill, rule, or CLAUDE.md describes | This skill only ever touches harness documentation, never the code it describes. |
| Proposing a "new-rule" or "new-claude-md-section" finding | Gap detection (proposing a brand-new artifact) is skill-only this phase — rules and CLAUDE.md only ever get `patch` findings against their existing content. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/harness-health-analysis.md` procedure on a spec's changed skill files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
| `_shared/harness-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 8-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `harness-health`-labelled issues alongside `recon`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
````

- [ ] **Step 2: Update `routine-template.yml`**

Read `skills/harness-health/routine-template.yml`, then replace its full contents with:

```yaml
template_version: 1
routine_name: harness-health-daily
prompt: "/claude-tweaks:harness-health"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob, Edit]
mcp_connections: []
default_schedule:
  cron_expression: "0 5 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Unlike recon, harness-health has a genuine stage-vs-auto-apply decision (additive +
  high-confidence + high-reversibility patches on skills/rules auto-apply; everything
  else, and every CLAUDE.md finding regardless of confidence, files as an issue) — the
  same situation tidy is in, not recon's report-only case. A bare firing has zero
  conversation history and no CLI arg to signal auto mode, so this routine only
  auto-applies safely when the target project's CLAUDE.md already sets
  `auto-mode: default-on`; otherwise it degrades to filing everything as an issue
  instead of blocking. See skills/_shared/auto-mode-contract.md. Default budget is
  1 target per firing — see skills/harness-health/SKILL.md's Routine
  Configuration section for tuning guidance this template doesn't restate.
```

- [ ] **Step 3: Sanity-check the rewrite**

```bash
grep -n "skill-health\|skillhealth" skills/harness-health/SKILL.md skills/harness-health/routine-template.yml
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add skills/harness-health/SKILL.md skills/harness-health/routine-template.yml
git commit -m "Rewrite harness-health's SKILL.md and routine template for the expanded scope"
```

---

### Task 7: Update cross-references across the rest of the plugin

**Files:**
- Modify: `package.json`, `CLAUDE.md`, `README.md`, `skills/help/reference-card.md`, `skills/init/SKILL.md`, `skills/init/skill-template.md`, `skills/routine/SKILL.md`, `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/wrap-up/SKILL.md`, `skills/wrap-up/skill-curation.md`, `skills/_shared/github-pr-scan.md`, `specs/DEFERRED.md`

**Interfaces:**
- Consumes: the new names/paths/CLI flags established in Tasks 1-6.
- Produces: a repo with zero remaining `skill-health`/`skillhealth` references outside the historical docs the Global Constraints list excludes.

- [ ] **Step 1: `package.json`**

```
old_string:
    "test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/skill-health/tests/*.test.js"
```
```
new_string:
    "test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/harness-health/tests/*.test.js"
```

- [ ] **Step 2: `CLAUDE.md`**

```
old_string:
skills/_shared/*.md               → Cross-skill shared content (subagent contract, auto-mode contract, auto-decision log, browser detection, pipeline run dir, dev URL detection, git discipline, design-wrapper handling, multi-agent coordination, decision records / ADR gate, **shared analysis criteria: architecture-depth / simplification / review-quality**, skill-health-analysis (canonical skill-drift judge shared by /init, /wrap-up, and /skill-health), issue-claims contract (refs/claims/* atomic lock), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5))
```
```
new_string:
skills/_shared/*.md               → Cross-skill shared content (subagent contract, auto-mode contract, auto-decision log, browser detection, pipeline run dir, dev URL detection, git discipline, design-wrapper handling, multi-agent coordination, decision records / ADR gate, **shared analysis criteria: architecture-depth / simplification / review-quality**, harness-health-analysis (canonical harness-drift judge shared by /init, /wrap-up, and /harness-health), issue-claims contract (refs/claims/* atomic lock), github-pr-scan (GitHub PR/issue state for /tidy Step 4.8 + /help Stage 4.5))
```

```
old_string:
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine, skill-health
```
```
new_string:
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine, harness-health
```

```
old_string:
claude --plugin-dir ./              # Local development — load plugin from current directory
npm test                            # Runs node --test over tests/ AND bin/lib/recon/tests/ AND bin/lib/issues/tests/ AND bin/lib/skill-health/tests/
node --test bin/lib/recon/tests/*.test.js   # Recon unit suite only
node bin/recon.js <cmd>             # Recon CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/skill-health/tests/*.test.js   # Skill-health unit suite only
node bin/skill-health.js <cmd>       # Skill-health CLI: next-target, validate-findings, mark, churn-report
```
```
new_string:
claude --plugin-dir ./              # Local development — load plugin from current directory
npm test                            # Runs node --test over tests/ AND bin/lib/recon/tests/ AND bin/lib/issues/tests/ AND bin/lib/harness-health/tests/
node --test bin/lib/recon/tests/*.test.js   # Recon unit suite only
node bin/recon.js <cmd>             # Recon CLI: validate-findings, classify, next-slice, status, churn-report, pull-issues
node --test bin/lib/harness-health/tests/*.test.js   # Harness-health unit suite only
node bin/harness-health.js <cmd>     # Harness-health CLI: next-target, validate-findings, mark, churn-report
```

```
old_string:
- Don't consider a producer/consumer task pair complete just because each task's own review passed — verify the producer's actual output shape satisfies every field the consumer's documented workflow reads from it. Task-scoped review only sees one task's diff at a time and can't catch a shape mismatch across the task boundary; only a whole-branch review (or an explicit cross-check while planning) will. This bit skill-health: `issue-payload.js`'s payload dropped `classification`/`confidence`/`reversibility`/`oldString`/`newString`/`id`, while `skill-health/SKILL.md`'s Step 7 branched on exactly those fields to decide auto-apply vs. file — both tasks passed their own review, and the gap survived until the final whole-branch pass caught it.
```
```
new_string:
- Don't consider a producer/consumer task pair complete just because each task's own review passed — verify the producer's actual output shape satisfies every field the consumer's documented workflow reads from it. Task-scoped review only sees one task's diff at a time and can't catch a shape mismatch across the task boundary; only a whole-branch review (or an explicit cross-check while planning) will. This bit harness-health (as skill-health, before its rename): `issue-payload.js`'s payload dropped `classification`/`confidence`/`reversibility`/`oldString`/`newString`/`id`, while `harness-health/SKILL.md`'s Step 7 branched on exactly those fields to decide auto-apply vs. file — both tasks passed their own review, and the gap survived until the final whole-branch pass caught it.
```

- [ ] **Step 3: `README.md`**

```
old_string:
**`/claude-tweaks:skill-health`** — Recurring watchman for `.claude/skills/*.md`: picks one skill to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/skill-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 — and either auto-applies a safe additive patch or files a `skill-health`-labelled GitHub issue. Runs on a scheduled Routine for continuous coverage, rotating through the skill library via a churn/staleness cursor shared with `/init` and `/wrap-up`. Never edits code — only skill documentation.
```
```
new_string:
**`/claude-tweaks:harness-health`** — Recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and either auto-applies a safe additive patch (skills/rules only) or files a `harness-health`-labelled GitHub issue. CLAUDE.md findings always file as an issue, never auto-applied. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Never edits code — only harness documentation.
```

- [ ] **Step 4: `skills/help/reference-card.md`**

```
old_string:
| `/claude-tweaks:skill-health` | Recurring watchman auditing `.claude/skills/*.md` for drift + new-skill gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits code. | `--skill <name>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```
```
new_string:
| `/claude-tweaks:harness-health` | Recurring watchman auditing `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits code; CLAUDE.md findings never auto-apply. | `--target <name>`, `--kind <skill\|rule\|claude-md>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 5: `skills/init/SKILL.md`**

```
old_string:
For the complete SKILL.md template and depth guide, read `skill-template.md` in this skill's directory. For the drift-patch procedure and quality gates applied to drifted/gap skills, read `_shared/skill-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:skill-health` routine use.
```
```
new_string:
For the complete SKILL.md template and depth guide, read `skill-template.md` in this skill's directory. For the drift-patch procedure and quality gates applied to drifted/gap skills, read `_shared/harness-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:harness-health` routine use.
```

```
old_string:
| `/claude-tweaks:skill-health` and `_shared/skill-health-analysis.md` | Phase 6's drift-patch procedure and Phase 3/1u's skill classification apply this shared procedure instead of an inline copy, sharing its judgment logic and `.claude-tweaks/skill-health/` cursor/cache state with `/claude-tweaks:wrap-up` Step 7 and the standalone routine. |
```
```
new_string:
| `/claude-tweaks:harness-health` and `_shared/harness-health-analysis.md` | Phase 6's drift-patch procedure and Phase 3/1u's skill classification apply this shared procedure instead of an inline copy, sharing its judgment logic and `.claude-tweaks/harness-health/` cursor/cache state with `/claude-tweaks:wrap-up` Step 7 and the standalone routine. |
```

- [ ] **Step 6: `skills/init/skill-template.md`**

```
old_string:
For each skill classified **drifted** or **gap** in Phase 3, apply the full procedure in `_shared/skill-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:skill-health` routine use for judging drift and proposing patches. That file owns the 6-dimension check, evidence pre-checks, the tightened patch format (exact `oldString`/`newString`, required for reliable auto-apply), the new-skill qualification gate, and the verify gate — do not duplicate them here.
```
```
new_string:
For each skill classified **drifted** or **gap** in Phase 3, apply the full procedure in `_shared/harness-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:harness-health` routine use for judging drift and proposing patches. That file owns the 8-dimension check, evidence pre-checks, the tightened patch format (exact `oldString`/`newString`, required for reliable auto-apply), the new-skill qualification gate, and the verify gate — do not duplicate them here.
```

```
old_string:
Before classifying a skill in Phase 1u/Phase 3, check `.claude-tweaks/skill-health/cursors.json`: a skill with `lastAuditedMs` within the last 90 days was recently verified by `/claude-tweaks:wrap-up` or the `/claude-tweaks:skill-health` routine — mark it "recently verified — skipped" rather than re-judging it from scratch in Phase 2. After Phase 6 patches a drifted skill, record the audit so wrap-up and the routine see it too:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings <findings.json> --root . --skill <skill-id>
```
```
```
new_string:
Before classifying a skill in Phase 1u/Phase 3, check `.claude-tweaks/harness-health/cursors.json` under the `skill:<id>` key: a skill with `lastAuditedMs` within the last 90 days was recently verified by `/claude-tweaks:wrap-up` or the `/claude-tweaks:harness-health` routine — mark it "recently verified — skipped" rather than re-judging it from scratch in Phase 2. After Phase 6 patches a drifted skill, record the audit so wrap-up and the routine see it too:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings <findings.json> --root . --target <skill-id> --kind skill
```
```

- [ ] **Step 7: `skills/routine/SKILL.md`**

```
old_string:
| `/claude-tweaks:skill-health` | Fourth consumer — `skills/skill-health/routine-template.yml` audits `.claude/skills/*.md` for drift and new-skill gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
```
```
new_string:
| `/claude-tweaks:harness-health` | Fourth consumer — `skills/harness-health/routine-template.yml` audits `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md for drift, template-conformance, and best-practice gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
```

- [ ] **Step 8: `skills/tidy/SKILL.md`**

```
old_string:
| 4.8 | `gh pr list` / `gh issue list --label recon` / `gh issue list --label skill-health` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
```
```
new_string:
| 4.8 | `gh pr list` / `gh issue list --label recon` / `gh issue list --label harness-health` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
```

```
old_string:
| `/claude-tweaks:skill-health` | `/skill-health` files skill-drift findings as `skill-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them alongside recon issues — stale/superseded ones closed after batch approval, still-valid ones suggested for direct application or re-judging. |
```
```
new_string:
| `/claude-tweaks:harness-health` | `/harness-health` files skill/rule/CLAUDE.md drift findings as `harness-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them alongside recon issues — stale/superseded ones closed after batch approval, still-valid ones suggested for direct application or re-judging. |
```

```
old_string:
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs, recon issues, and skill-health issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
```
```
new_string:
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs, recon issues, and harness-health issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
```

- [ ] **Step 9: `skills/tidy/scan-procedures.md`**

```
old_string:
The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon or skill-health issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).
```
```
new_string:
The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon or harness-health issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).
```

```
old_string:
Scoped strictly to issues carrying the `recon` label — this does not touch skill-health-labelled issues or any other tracker content.
```
```
new_string:
Scoped strictly to issues carrying the `recon` label — this does not touch harness-health-labelled issues or any other tracker content.
```

- [ ] **Step 10: `skills/wrap-up/SKILL.md`**

```
old_string:
| `/claude-tweaks:skill-health` and `_shared/skill-health-analysis.md` | Step 7's 7.3-7.5 apply this shared procedure instead of an inline copy — sharing its judgment logic and its `.claude-tweaks/skill-health/` cursor/cache state with `/claude-tweaks:init` and the standalone `/claude-tweaks:skill-health` routine. |
```
```
new_string:
| `/claude-tweaks:harness-health` and `_shared/harness-health-analysis.md` | Step 7's 7.3-7.5 apply this shared procedure instead of an inline copy — sharing its judgment logic and its `.claude-tweaks/harness-health/` cursor/cache state with `/claude-tweaks:init` and the standalone `/claude-tweaks:harness-health` routine. |
```

- [ ] **Step 11: `skills/wrap-up/skill-curation.md`**

```
old_string:
Apply the full procedure in `_shared/skill-health-analysis.md` (Steps 1-6: evidence pre-checks, the 6-dimension check, new-skill gap detection, the new-skill qualification gate, the verify gate, and quality gates) to every skill in the read set (seeded + scanned from 7.2) and to any new-skill candidates discovered there. That file is the single canonical procedure — also read by `/claude-tweaks:init` (Phase 3/6) and the standalone `/claude-tweaks:skill-health` routine — so a skill's drift verdict doesn't depend on which of the three ever looked at it.
```
```
new_string:
Apply the full procedure in `_shared/harness-health-analysis.md` (Steps 1-6: evidence pre-checks, the 8-dimension check, new-skill gap detection, the new-skill qualification gate, the verify gate, and quality gates) to every skill in the read set (seeded + scanned from 7.2) and to any new-skill candidates discovered there. That file is the single canonical procedure — also read by `/claude-tweaks:init` (Phase 3/6) and the standalone `/claude-tweaks:harness-health` routine — so a skill's drift verdict doesn't depend on which of the three ever looked at it.
```

```
old_string:
**Record the audit.** For each skill analyzed in this pass — whether or not a patch was proposed — record it in the shared cursor so `/claude-tweaks:skill-health`'s rotation and `/claude-tweaks:init`'s classification skip a skill wrap-up just reviewed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings <findings-for-that-skill.json> --root . --skill <skill-id>
```
```
```
new_string:
**Record the audit.** For each skill analyzed in this pass — whether or not a patch was proposed — record it in the shared cursor so `/claude-tweaks:harness-health`'s rotation and `/claude-tweaks:init`'s classification skip a skill wrap-up just reviewed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings <findings-for-that-skill.json> --root . --target <skill-id> --kind skill
```
```

- [ ] **Step 12: `skills/_shared/github-pr-scan.md`**

```
old_string:
Full sweep of open PRs, recon-labelled issues, and skill-health-labelled issues.
```
```
new_string:
Full sweep of open PRs, recon-labelled issues, and harness-health-labelled issues.
```

```
old_string:
5. **Skill-health issues** — `gh issue list --label skill-health --state open --json number,title,updatedAt,url`.
```
```
new_string:
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.
```

```
old_string:
| Skill-health issue stale (>4 weeks, the referenced skill or code has since changed again) | Close (GitHub) — superseded |
| Skill-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:skill-health --skill <name>` to re-judge |
```
```
new_string:
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:harness-health --target <name> --kind <skill\|rule\|claude-md>` to re-judge |
```

- [ ] **Step 13: `specs/DEFERRED.md`**

```
old_string:
### Scope skill-health's runs/ + churn-report to a single coherent caller
```
```
new_string:
### Scope harness-health's runs/ + churn-report to a single coherent caller
```

```
old_string:
**Origin:** Reflection during `/claude-tweaks:wrap-up` for the skill-health feature (2026-07-06), seeded by whole-branch review Minor finding #3.
```
```
new_string:
**Origin:** Reflection during `/claude-tweaks:wrap-up` for the skill-health feature (2026-07-06, renamed harness-health 2026-07-07), seeded by whole-branch review Minor finding #3.
```

```
old_string:
**Context:** `bin/skill-health.js`'s `validate-findings` command calls `recordRun` on every non-dry-run invocation, and it's invoked by three different callers with different scopes: the skill-health routine (one skill-target per firing), `/claude-tweaks:wrap-up` Step 7 (once per skill in its read set), and `/claude-tweaks:init` Phase 6 (once per drifted skill). Each of wrap-up's/init's per-skill calls writes its own single-skill run record to `.claude-tweaks/skill-health/runs/`, so `churn-report`'s appeared/disappeared/ratio math — designed around one coherent sweep per run — ends up computed across interleaved, incomparable run boundaries from three unrelated callers.
```
```
new_string:
**Context:** `bin/harness-health.js`'s `validate-findings` command calls `recordRun` on every non-dry-run invocation, and it's invoked by three different callers with different scopes: the harness-health routine (one target per firing), `/claude-tweaks:wrap-up` Step 7 (once per skill in its read set), and `/claude-tweaks:init` Phase 6 (once per drifted skill). Each of wrap-up's/init's per-skill calls writes its own single-skill run record to `.claude-tweaks/harness-health/runs/`, so `churn-report`'s appeared/disappeared/ratio math — designed around one coherent sweep per run — ends up computed across interleaved, incomparable run boundaries from three unrelated callers.
```

```
old_string:
**Trigger:** Revisit when someone actually wants to use `churn-report` for real diagnostics (it currently has no documented reader in `skill-health/SKILL.md`), or when the `runs/` directory's unbounded growth becomes a practical nuisance.
```
```
new_string:
**Trigger:** Revisit when someone actually wants to use `churn-report` for real diagnostics (it currently has no documented reader in `harness-health/SKILL.md`), or when the `runs/` directory's unbounded growth becomes a practical nuisance.
```

- [ ] **Step 14: Repo-wide sanity check**

```bash
grep -rn "skill-health\|skillhealth\|skill_health" . \
  --include="*.md" --include="*.js" --include="*.json" --include="*.yml" \
  2>/dev/null | grep -v node_modules | \
  grep -v "docs/superpowers/plans/2026-07-05-skill-health.md" | \
  grep -v "docs/superpowers/specs/2026-07-05-skill-health-design.md" | \
  grep -v "docs/superpowers/plans/2026-07-06-recon-signal-quality.md" | \
  grep -v "docs/superpowers/specs/2026-07-06-harness-health-design.md" | \
  grep -v "docs/superpowers/plans/2026-07-07-harness-health.md"
```

Expected: no output (the only surviving references are the intentional historical mentions in `CLAUDE.md`'s Don'ts entry and `specs/DEFERRED.md`'s parenthetical, both deliberately kept for historical accuracy, plus test fixtures using `skillhealth-` as an arbitrary opaque test string rather than the engine's generated prefix — review any hit manually before treating it as a miss).

- [ ] **Step 15: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "Update cross-references across the plugin for the harness-health rename"
```

---

### Task 8: Bump the plugin version and do a final full verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing further consumes this — it's the closing task.

Per this repo's own versioning convention (CLAUDE.md's "Versioning" section): bump the minor version for a feature addition. This step only touches this repo's `plugin.json` — the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`) release step is a deliberate, separate action the user takes when actually ready to release, not part of this implementation plan.

- [ ] **Step 1: Check for a concurrent version bump before bumping**

```bash
git log --oneline -5 .claude-plugin/plugin.json
```

If a bump landed on `main` after this plan's work started (from a concurrent session), renumber this task's bump to the next free version instead of colliding.

- [ ] **Step 2: Bump the version**

Read `.claude-plugin/plugin.json`, then edit:

```
old_string:
  "version": "5.11.0",
```
```
new_string:
  "version": "5.12.0",
```

(Adjust the target version per Step 1's check if `5.11.0` is no longer the current `main` version by the time this task runs.)

- [ ] **Step 3: Final full verification**

```bash
npm test
```

Expected: PASS, 100% green.

```bash
node "${PWD}/bin/harness-health.js" next-target --root . --dry-run 2>&1 || true
```

Expected: runs without a crash (this repo itself has no `.claude/skills/`, `.claude/rules/`, or CLAUDE.md-as-a-target-project state in the shape `harness-health` audits — it's the plugin source, not an adopting project — so a `{ target: null, gapScanDue: true }`-shaped result or equivalent "nothing to audit" output is expected and correct, not a failure).

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.12.0 — generalize skill-health into harness-health"
```

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-06-harness-health-design.md` maps to a task — Scope/Rename → Tasks 1, 6, 7; Unified target model → Task 2; What drift means per kind + new dimensions → Task 5; Finding shape/fingerprint/labels → Task 3; Auto-apply policy → Task 6 (Step 7's `assetType !== 'claude-md'` gate); Ripple effects on init/wrap-up → noted as explicitly out of scope for code changes, cross-references updated in Task 7 to describe the current (skill-only) call sites accurately.
- **Placeholder scan:** no TBD/TODO; every step shows complete, runnable code or an exact markdown block.
- **Type consistency:** `fingerprint({ assetType, target, section, description })` (Task 3) matches every call site in `bin/harness-health.js` (Task 4) and every test fixture (Tasks 3-4). `selectTarget(root, cursors, { now, signals, kind })`'s namespaced-key contract (Task 2) matches `bin/harness-health.js`'s cursor read/write (Task 4) and `cache.js`'s `recordAudit(root, <namespaced-key>, ...)` call (Task 4) — `cache.js` itself is kind-agnostic (Task 1 only renamed its path constants), so no further change was needed there beyond Task 1.
