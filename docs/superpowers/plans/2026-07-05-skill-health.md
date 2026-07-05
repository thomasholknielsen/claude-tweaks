# Skill Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/claude-tweaks:skill-health` — a new utility skill + scheduled Routine that audits `.claude/skills/*.md` files for drift and new-skill gaps — and unify its judgment procedure with `/claude-tweaks:wrap-up` Step 7 and `/claude-tweaks:init` Phase 6/Phase 3, which currently duplicate the same logic.

**Architecture:** A new shared markdown procedure (`skills/_shared/skill-health-analysis.md`) becomes the single canonical judge of skill-doc accuracy, consumed by three callers: the new `/claude-tweaks:skill-health` skill (churn/staleness rotation via a small deterministic engine mirroring `bin/lib/recon/`), `/claude-tweaks:wrap-up` Step 7 (spec-diff scope), and `/claude-tweaks:init` Phase 3/6 (whole-codebase reconnaissance scope). All three read/write the same persistent cursor+cache state under `.claude-tweaks/skill-health/`.

**Tech Stack:** Node.js (built-ins only — `fs`, `path`, `crypto`, `child_process`; zero npm dependencies, matching this repo's existing constraint), `node --test`, markdown skill files, `gh` CLI for issue filing.

## Global Constraints

- Node 18+, zero runtime/dev npm dependencies (verify `package.json` stays dependency-free — mirror `bin/lib/recon/`'s Node-built-ins-only approach).
- Test runner: `node --test` — new test files must be added to `package.json`'s `"test"` script glob.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes).
- No emojis in any skill file.
- Every cross-reference table update must be bidirectional (if skill A's Relationship table gets a row for skill B, skill B's table gets a row for skill A).
- Don't spread parsed external/untrusted JSON after derived/trusted fields — when combining a validated finding with a computed `id`, the computed field must come last: `{ ...value, id }`, never `{ id, ...value }`.
- Version: bump `.claude-plugin/plugin.json`'s `version` for this feature addition (current: `5.7.0` → `5.8.0`). Before bumping, check `git log --oneline -5 .claude-plugin/plugin.json` for a concurrent bump from another session; renumber if one landed after this plan was written.

---

### Task 1: Shared skill-health analysis procedure

**Files:**
- Create: `skills/_shared/skill-health-analysis.md`

**Interfaces:**
- Produces: the canonical "Finding Shape" JSON schema (fields: `kind`, `skill`, `section`, `classification`, `confidence`, `reversibility`, `description`, `reason`, plus `oldString`/`newString` for `kind: "patch"` or `proposedBody` for `kind: "new-skill"`) — Tasks 4, 6, 7, 8 all reference this shape by name.

This task has no automated test (it's a judgment procedure for an LLM to follow, not code) — verification is a grep-based self-check, matching how this repo verifies its other shared-procedure markdown files (`_shared/github-pr-scan.md`, `_shared/routine-template-schema.md`).

- [ ] **Step 1: Write the shared fragment**

Create `skills/_shared/skill-health-analysis.md` with exactly this content:

````markdown
# Skill Health Analysis — Shared Procedure

Canonical procedure for judging whether a `.claude/skills/*.md` file still accurately describes the codebase, and for detecting a cohesive, reusable pattern with no skill covering it. Read by three consumers, each supplying its own scope model:

| Consumer | Supplies |
|---|---|
| `/claude-tweaks:skill-health` | One skill-target per firing, selected by churn/staleness rotation (`next-target`) |
| `/claude-tweaks:wrap-up` Step 7 | A finished spec's changed files + ledger/reflection seeds |
| `/claude-tweaks:init` Phase 3/6 | Whole-codebase Phase 2 reconnaissance |

This file owns the judgment. It does not own scope selection, staging destination, or cursor/cache mechanics — those are each consumer's own job.

## Finding Shape

Emit each finding as a JSON object in exactly this shape:

```json
{
  "kind": "patch",
  "skill": "auth",
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
  "skill": "queue-retry-pattern",
  "classification": "additive",
  "confidence": "med",
  "reversibility": "high",
  "description": "Three files under src/jobs/ implement the same retry-with-backoff pattern with no skill documenting it",
  "proposedBody": "---\nname: queue-retry-pattern\ndescription: ...\n---\n...",
  "reason": "src/jobs/emailQueue.js, src/jobs/webhookQueue.js, and src/jobs/syncQueue.js all implement retry-with-exponential-backoff independently — a reusable pattern with no skill covering it."
}
```

Required fields for every finding: `kind` (`patch` | `new-skill`), `skill`, `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`. `kind: "new-skill"` additionally requires `proposedBody`.

**`oldString`/`newString` must be exact, unique, verbatim quotes from the skill file** — not paraphrased "Current/Proposed" prose. The consuming skill applies additive+high-confidence+high-reversibility patches directly via the `Edit` tool, which requires `oldString` to match uniquely; a paraphrased or non-unique quote will fail to apply or apply to the wrong location.

## Step 1: Evidence Pre-Checks (deterministic, before judging)

Before forming any finding, run these mechanical checks and treat their output as evidence the judgment step weighs — not findings themselves:

1. **Stale-example check.** For every backtick-quoted file path or command referenced in the skill (e.g. `` `src/auth/login.js` ``, `` `npm run build` ``), verify it still exists / still works:
   ```bash
   ls "<referenced-path>" 2>&1
   ```
   For commands, check the command exists in `package.json` scripts, a `Makefile`, or is a known binary. A referenced path or command that no longer resolves is strong evidence for a `stale examples` finding — cite the exact `ls`/check output as the finding's evidence, not just "this looks outdated."

2. **Quantified convention-drift check.** For each documented convention or pattern (e.g., "this project always uses X for Y"), grep how many current files actually match it vs. how many files in the same domain don't:
   ```bash
   grep -rl "<pattern-signature>" <domain-dir> | wc -l
   ```
   A convention followed by a small minority of relevant files (e.g., "2 of 15") is quantified evidence of drift — cite the ratio in the finding's evidence field, not just an impression.

Both checks are optional assists — skip gracefully if a referenced path/command genuinely can't be checked mechanically (e.g., a described convention with no clean grep signature). A finding grounded in one of these checks is higher-confidence than one based on reading alone.

## Step 2: The 6-Dimension Check

For the target skill (or, for wrap-up/init, each skill in their own read set), apply all six dimensions:

| Check | Question |
|-------|----------|
| **Pattern accuracy** | Do the skill's Key Patterns still match how the codebase works? |
| **Convention drift** | Do Project Conventions reflect current practice, or has the codebase diverged? (Use the quantified check from Step 1 where a clean grep signature exists.) |
| **Missing patterns** | Has the codebase introduced patterns that belong in this skill but aren't documented? |
| **Stale examples** | Do code examples still exist at the referenced file paths? (Use the stale-example check from Step 1.) |
| **Anti-pattern gaps** | Has the codebase revealed new anti-patterns worth documenting? |
| **Decision framework completeness** | Does the Decision Framework cover the choices the codebase actually makes? |

**Bounded sub-file reads.** If the skill references sub-files (lazy-loaded content, e.g. `init`'s 11 sub-files or `build`'s 6), do not read all of them by default — read only the sub-files whose content plausibly relates to what changed (matched by filename/section keyword against the change source: churned domain paths for the routine, the spec's changed files for wrap-up, Phase 2 findings for init). Note explicitly which sub-files were skipped and why, so a human reviewing the finding can request a deeper read if needed.

## Step 3: New-Skill Gap Detection

Independent of any specific skill's audit, look for a **cohesive** set of files implementing one reusable pattern with **no** skill covering it. "Cohesive" means multiple files implementing the same pattern, not scattered one-off edits — ground this in concrete signals, not impression alone:

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

1. **Is it real?** Does the skill actually diverge from the codebase, or did the judge misread the skill's prose or the code's structure?
2. **Is it actionable?** For a patch: is `oldString` an exact, unique quote from the skill file, and does `newString` concretely fix the drift (not "consider updating this")? For a new-skill candidate: is `proposedBody` a real, codebase-grounded SKILL.md, not a generic template?
3. **Does it reproduce?** Given the evidence cited, would a reviewer applying `newString` (or creating the proposed skill) end up with content that's actually correct, without further investigation?

Drop any finding that fails any of the three questions. Log the drop reason. This gate is a judgment step, not mechanical — do not skip it even for a routine firing under no time pressure to rush.

## Step 6: Quality Gates (before finalizing any patch or new skill)

- [ ] Every code example is adapted from actual codebase patterns (not generic).
- [ ] File paths referenced actually exist (post-patch).
- [ ] Commands referenced actually work.
- [ ] Conventions described match what the codebase actually does.
- [ ] No generic advice that adds no project-specific value.
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings.
- [ ] A `kind: "new-skill"` finding's `proposedBody` description starts with "Use when..." and names a clear trigger.

## Anchor Requirement

Every finding must trace to a concrete anchor — a specific referenced path/command that failed the Step 1 check, a quantified drift ratio, a ledger entry, a reflection insight, or a specific changed-file/commit observation. A finding with no concrete anchor is indistinguishable from a hallucinated one — discard it, and note what was discarded and why.
````

- [ ] **Step 2: Self-check the file was written correctly**

Run:

```bash
grep -c "^## " skills/_shared/skill-health-analysis.md
```

Expected: `8` (the six numbered Step headers, plus "## Finding Shape" and "## Anchor Requirement").

```bash
grep -n "oldString\|newString\|proposedBody" skills/_shared/skill-health-analysis.md | wc -l
```

Expected: a non-zero count (at least 6) — confirms the Finding Shape's field names are documented, not just implied.

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/skill-health-analysis.md
git commit -m "Add shared skill-health-analysis procedure — canonical skill-drift judge for init, wrap-up, and skill-health"
```

---

### Task 2: Engine — score and scope (skill selection)

**Files:**
- Create: `bin/lib/skill-health/score.js`
- Create: `bin/lib/skill-health/scope.js`
- Test: `bin/lib/skill-health/tests/scope.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `STALE_DAYS` (number, from `score.js`); `listSkills(root): [{id, path}]`, `extractDomainPaths(content): string[]`, `domainChurn(root, relPaths, sinceMs): number`, `selectTarget(root, cursors, opts): {id, path, why} | null` (from `scope.js`) — Task 5's CLI calls `selectTarget` and `listSkills`.

- [ ] **Step 1: Write the failing test for `score.js` and `scope.js`**

Create `bin/lib/skill-health/tests/scope.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { listSkills, extractDomainPaths, domainChurn, selectTarget } = require('../scope');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-scope-')); }

function initGitRepo(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
}

function commit(root, msg) {
  execFileSync('git', ['-C', root, 'add', '-A']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg]);
}

// ─── listSkills ────────────────────────────────────────────────────────────

test('listSkills returns [] when .claude/skills does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listSkills(root), []);
});

test('listSkills lists .md files under .claude/skills, sorted by id', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'zebra.md'), '# zebra');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  const skills = listSkills(root);
  assert.deepStrictEqual(skills.map((s) => s.id), ['auth', 'zebra']);
  assert.strictEqual(skills[0].path, path.join(root, '.claude', 'skills', 'auth.md'));
});

test('listSkills ignores non-.md files', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'notes.txt'), 'ignore me');
  assert.deepStrictEqual(listSkills(root).map((s) => s.id), ['auth']);
});

// ─── extractDomainPaths ────────────────────────────────────────────────────

test('extractDomainPaths finds backtick-quoted file paths', () => {
  const content = 'See `src/api/user.js` for the pattern, also `bin/recon.js`.';
  assert.deepStrictEqual(extractDomainPaths(content).sort(), ['bin/recon.js', 'src/api/user.js']);
});

test('extractDomainPaths ignores backtick-quoted strings with no slash', () => {
  const content = 'Run `npm test` and see `SKILL.md`.';
  assert.deepStrictEqual(extractDomainPaths(content), []);
});

test('extractDomainPaths dedupes repeated references', () => {
  const content = '`src/a.js` is used here and `src/a.js` again there.';
  assert.deepStrictEqual(extractDomainPaths(content), ['src/a.js']);
});

// ─── domainChurn ───────────────────────────────────────────────────────────

test('domainChurn returns 0 for an empty path list', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, [], 0), 0);
});

test('domainChurn counts commits touching the given paths since sinceMs', () => {
  const root = tmp();
  initGitRepo(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 1;\n');
  commit(root, 'first');
  const sinceMs = Date.now() - 86400000;
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const x = 2;\n');
  commit(root, 'second');
  const churn = domainChurn(root, ['src/a.js'], sinceMs);
  assert.ok(churn >= 1, 'must count the commit touching src/a.js');
});

test('domainChurn returns 0 when git is unavailable (bad root)', () => {
  const churn = domainChurn('/nonexistent/path/xyz', ['a.js'], 0);
  assert.strictEqual(churn, 0);
});

// ─── selectTarget ──────────────────────────────────────────────────────────

test('selectTarget returns null when no skills exist', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}, { now: Date.now() }), null);
});

test('selectTarget force-picks a never-audited skill as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth\nSee `src/auth.js`.');
  const result = selectTarget(root, {}, { now: Date.now() });
  assert.ok(result !== null);
  assert.strictEqual(result.id, 'auth');
  assert.strictEqual(result.why, 'stale');
});

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/scope.test.js`
Expected: FAIL — `Cannot find module '../scope'` (the module doesn't exist yet).

- [ ] **Step 3: Write `score.js`**

Create `bin/lib/skill-health/score.js`:

```js
'use strict';
// Round-robin floor: skills unaudited past this many days are force-boosted
// regardless of churn. Longer than recon's 30-day floor (bin/lib/recon/score.js)
// because skill-doc drift moves slower than code bugs.
const STALE_DAYS = 90;

module.exports = { STALE_DAYS };
```

- [ ] **Step 4: Write `scope.js`**

Create `bin/lib/skill-health/scope.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { STALE_DAYS } = require('./score');

// ─── listSkills ──────────────────────────────────────────────────────────────
// Returns [{ id, path }] for each .claude/skills/*.md file, sorted by id.
// Empty array if the directory doesn't exist — a project with no generated
// skills yet is a valid state, not an error.
function listSkills(root) {
  const dir = path.join(root, '.claude', 'skills');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => ({ id: e.name.slice(0, -3), path: path.join(dir, e.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ─── extractDomainPaths ──────────────────────────────────────────────────────
// Mechanical proxy for "what this skill documents": backtick-quoted strings
// that look like a file path (no whitespace, a dot-extension, AND a slash).
// Deliberately NOT prose understanding — that's the LLM judge's job, not the
// engine's.
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
// opts: { now?: number, signals?: { [id]: number } }
// Returns { id, path, why: 'stale' | 'hotspot' } or null.
function selectTarget(root, cursors, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const signals = opts.signals || null; // test injection hook — churn override by skill id

  const candidates = listSkills(root);
  if (candidates.length === 0) return null;

  // Phase 1: force-pick any skill unaudited past STALE_DAYS.
  for (const skill of candidates) {
    const cursor = cursors[skill.id];
    const lastAuditedMs = cursor && cursor.lastAuditedMs != null ? cursor.lastAuditedMs : null;
    const daysSince = lastAuditedMs === null ? Infinity : (now - lastAuditedMs) / 86400000;
    if (daysSince > STALE_DAYS) {
      return { ...skill, why: 'stale' };
    }
  }

  // Phase 2: among non-stale candidates, score by domain churn since last audit.
  const scored = [];
  for (const skill of candidates) {
    const cursor = cursors[skill.id] || {};
    const sinceMs = cursor.lastAuditedMs || 0;
    let churn;
    if (signals) {
      churn = signals[skill.id] || 0;
    } else {
      let content;
      try { content = fs.readFileSync(skill.path, 'utf8'); } catch { content = ''; }
      const domainPaths = extractDomainPaths(content);
      churn = domainChurn(root, domainPaths, sinceMs);
    }
    if (churn > 0) scored.push({ skill, churn });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => (b.churn !== a.churn ? b.churn - a.churn : (a.skill.id < b.skill.id ? -1 : 1)));
  return { ...scored[0].skill, why: 'hotspot' };
}

module.exports = { listSkills, extractDomainPaths, domainChurn, selectTarget };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/scope.test.js`
Expected: PASS — all tests green, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/skill-health/score.js bin/lib/skill-health/scope.js bin/lib/skill-health/tests/scope.test.js
git commit -m "Add skill-health engine: score/scope modules for churn+staleness skill rotation"
```

---

### Task 3: Engine — fingerprint, cache, and dedup

**Files:**
- Create: `bin/lib/skill-health/fingerprint.js`
- Create: `bin/lib/skill-health/cache.js`
- Create: `bin/lib/skill-health/dedup.js`
- Test: `bin/lib/skill-health/tests/fingerprint.test.js`
- Test: `bin/lib/skill-health/tests/cache.test.js`
- Test: `bin/lib/skill-health/tests/dedup.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `fingerprint({skill, section, description}): string` (from `fingerprint.js`); `readCache/writeCache/readCursors/writeCursors/recordAudit/readGapScanCursor/recordGapScan/recordRun/readRuns/computeChurn` (from `cache.js`); `decide(finding, issueIndex, cache): {action, issue?}` (from `dedup.js`) — Task 4's CLI wiring and Task 5's CLI use all of these by name.

- [ ] **Step 1: Write the failing test for `fingerprint.js`**

Create `bin/lib/skill-health/tests/fingerprint.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { fingerprint, normalizeDescription } = require('../fingerprint');

test('fingerprint returns a skillhealth-<8hex> id', () => {
  const id = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.match(id, /^skillhealth-[0-9a-f]{8}$/);
});

test('fingerprint is stable across whitespace and case differences in description', () => {
  const a = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'Stale   Example Path' });
  const b = fingerprint({ skill: 'auth', section: 'Key Patterns', description: 'stale example path' });
  assert.strictEqual(a, b);
});

test('fingerprint differs when skill, section, or description differs', () => {
  const base = { skill: 'auth', section: 'Key Patterns', description: 'stale example' };
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, skill: 'billing' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, section: 'Anti-Patterns' }));
  assert.notStrictEqual(fingerprint(base), fingerprint({ ...base, description: 'different text' }));
});

test('normalizeDescription collapses whitespace and lowercases', () => {
  assert.strictEqual(normalizeDescription('  Foo   BAR  baz '), 'foo bar baz');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/fingerprint.test.js`
Expected: FAIL — `Cannot find module '../fingerprint'`.

- [ ] **Step 3: Write `fingerprint.js`**

Create `bin/lib/skill-health/fingerprint.js`:

```js
'use strict';
const crypto = require('crypto');

// Collapse whitespace and lowercase so cosmetic rewording doesn't mint a new id.
function normalizeDescription(description) {
  return String(description).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Stable id from skill + section + normalized description. Same shape as
// recon's fingerprint (criterion+areaId+anchor) — skill/section stand in for
// criterion/areaId, description stands in for anchor.
function fingerprint({ skill, section, description }) {
  const basis = JSON.stringify([skill, section, normalizeDescription(description)]);
  return 'skillhealth-' + crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
}

module.exports = { fingerprint, normalizeDescription };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/fingerprint.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `cache.js`**

Create `bin/lib/skill-health/tests/cache.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readGapScanCursor, recordGapScan,
  recordRun, readRuns, computeChurn,
} = require('../cache');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-cache-')); }

test('readCache returns {} when the cache file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCache(root), {});
});

test('writeCache then readCache round-trips', () => {
  const root = tmp();
  writeCache(root, { 'skillhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
  assert.deepStrictEqual(readCache(root), { 'skillhealth-abc123': { status: 'staged', lastSeenMs: 1000 } });
});

test('cachePath points under .claude-tweaks/skill-health/cache.json', () => {
  const root = tmp();
  assert.strictEqual(cachePath(root), path.join(root, '.claude-tweaks', 'skill-health', 'cache.json'));
});

test('readCursors returns {} when the cursors file does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readCursors(root), {});
});

test('recordAudit writes a per-skill cursor entry', () => {
  const root = tmp();
  recordAudit(root, 'auth', { sha: 'abc123', whenMs: 5000 });
  const cursors = readCursors(root);
  assert.deepStrictEqual(cursors.auth, { lastAuditedSha: 'abc123', lastAuditedMs: 5000 });
});

test('recordAudit defaults whenMs to now when omitted', () => {
  const root = tmp();
  const before = Date.now();
  recordAudit(root, 'auth', {});
  const cursors = readCursors(root);
  assert.ok(cursors.auth.lastAuditedMs >= before);
});

test("recordAudit for one skill does not clobber another skill's entry", () => {
  const root = tmp();
  recordAudit(root, 'auth', { sha: 'a1', whenMs: 1000 });
  recordAudit(root, 'billing', { sha: 'b1', whenMs: 2000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.auth.lastAuditedSha, 'a1');
  assert.strictEqual(cursors.billing.lastAuditedSha, 'b1');
});

test('readGapScanCursor returns nulls when never recorded', () => {
  const root = tmp();
  assert.deepStrictEqual(readGapScanCursor(root), { lastScannedSha: null, lastScannedMs: null });
});

test('recordGapScan then readGapScanCursor round-trips and does not appear in listSkills-relevant keys', () => {
  const root = tmp();
  recordGapScan(root, { sha: 'gap1', whenMs: 9000 });
  assert.deepStrictEqual(readGapScanCursor(root), { lastScannedSha: 'gap1', lastScannedMs: 9000 });
  const cursors = readCursors(root);
  assert.strictEqual(cursors.__gapScan.lastScannedSha, 'gap1');
});

test('readRuns returns [] when no run logs exist', () => {
  const root = tmp();
  assert.deepStrictEqual(readRuns(root), []);
});

test('recordRun then readRuns round-trips, sorted oldest first', () => {
  const root = tmp();
  recordRun(root, 'run-2', ['skillhealth-b']);
  recordRun(root, 'run-1', ['skillhealth-a']);
  const runs = readRuns(root);
  assert.strictEqual(runs.length, 2);
  // Sort key is runAt (write order here), not runId — both records get a runAt
  // at write time, so run-2 (written first) sorts first.
  assert.strictEqual(runs[0].runId, 'run-2');
  assert.strictEqual(runs[1].runId, 'run-1');
});

test('computeChurn: no prior run gives ratio 0 for identical sets, appeared for new ones', () => {
  const result = computeChurn(['a', 'b'], null);
  assert.deepStrictEqual(result.appeared, ['a', 'b']);
  assert.deepStrictEqual(result.disappeared, []);
});

test('computeChurn: identical current and prior gives ratio 0', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['a', 'b'], prior);
  assert.strictEqual(result.ratio, 0);
});

test('computeChurn: complete turnover gives ratio 1', () => {
  const prior = { fingerprints: ['a', 'b'] };
  const result = computeChurn(['c', 'd'], prior);
  assert.strictEqual(result.ratio, 1);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/cache.test.js`
Expected: FAIL — `Cannot find module '../cache'`.

- [ ] **Step 7: Write `cache.js`**

Create `bin/lib/skill-health/cache.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');

// Gitignored, rebuildable-from-issues state. Canonical path:
// <root>/.claude-tweaks/skill-health/{cache,cursors}.json and .../runs/*.json

function cachePath(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'cache.json');
}

function readCache(root) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(root), 'utf8'));
  } catch {
    return {}; // missing or corrupt -> empty (the cache is an optimization, not state)
  }
}

function writeCache(root, cache) {
  const p = cachePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return p;
}

function cursorsPath(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json');
}

function readCursors(root) {
  try {
    return JSON.parse(fs.readFileSync(cursorsPath(root), 'utf8'));
  } catch {
    return {};
  }
}

function writeCursors(root, cursors) {
  const p = cursorsPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cursors, null, 2) + '\n', 'utf8');
  return p;
}

// Record that `skillId` was audited. Shared by wrap-up, init, and the routine —
// whichever consumer analyzes a skill writes its cursor here so the others'
// rotation/classification skips it.
function recordAudit(root, skillId, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  cursors[skillId] = { lastAuditedSha: sha, lastAuditedMs: whenMs };
  writeCursors(root, cursors);
  return cursors[skillId];
}

// Gap-scan cursor is a single global entry (key "__gapScan"), not per-skill.
function readGapScanCursor(root) {
  const cursors = readCursors(root);
  return cursors.__gapScan || { lastScannedSha: null, lastScannedMs: null };
}

function recordGapScan(root, { sha = null, whenMs = Date.now() } = {}) {
  const cursors = readCursors(root);
  cursors.__gapScan = { lastScannedSha: sha, lastScannedMs: whenMs };
  writeCursors(root, cursors);
  return cursors.__gapScan;
}

function runsDir(root) {
  return path.join(root, '.claude-tweaks', 'skill-health', 'runs');
}

// Persist the fingerprint set a firing produced, for churn-report diagnostics.
function recordRun(root, runId, fingerprints) {
  const dir = runsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const record = { runId, runAt: new Date().toISOString(), fingerprints: [...fingerprints] };
  fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return record;
}

// All run records, oldest first (by runAt).
function readRuns(root) {
  let entries;
  try {
    entries = fs.readdirSync(runsDir(root));
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(runsDir(root), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((r) => r && Array.isArray(r.fingerprints) && r.runId)
    .sort((a, b) => ((a.runAt || '') < (b.runAt || '') ? -1 : 1));
}

// Churn vs the prior run. ratio = (appeared + disappeared) / |prior ∪ current|.
function computeChurn(currentFps, priorRun) {
  const priorFps = priorRun && Array.isArray(priorRun.fingerprints) ? priorRun.fingerprints : [];
  const current = new Set(currentFps);
  const prior = new Set(priorFps);
  const appeared = currentFps.filter((fp) => !prior.has(fp));
  const disappeared = priorFps.filter((fp) => !current.has(fp));
  const union = new Set([...currentFps, ...priorFps]);
  const total = Math.max(union.size, 1);
  const ratio = Math.round(((appeared.length + disappeared.length) / total) * 1000) / 1000;
  return { appeared, disappeared, ratio };
}

module.exports = {
  cachePath, readCache, writeCache,
  cursorsPath, readCursors, writeCursors,
  recordAudit, readGapScanCursor, recordGapScan,
  runsDir, recordRun, readRuns, computeChurn,
};
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/cache.test.js`
Expected: PASS.

- [ ] **Step 9: Write the failing test for `dedup.js`**

Create `bin/lib/skill-health/tests/dedup.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { decide } = require('../dedup');

test('decide files a brand-new finding with no issue or cache match', () => {
  const result = decide({ id: 'skillhealth-abc' }, {}, {});
  assert.deepStrictEqual(result, { action: 'file' });
});

test('decide skips when an open issue already matches the fingerprint', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 42 });
});

test('decide suppresses when the matching issue is labelled wontfix', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'open', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'suppress', issue: 42 });
});

test('decide skips when the matching issue is closed (assumed applied)', () => {
  const issueIndex = { 'skillhealth-abc': { number: 42, state: 'closed', labels: [] } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, issueIndex, {}), { action: 'skip', issue: 42 });
});

test('decide suppresses a finding the local cache marked declined', () => {
  const cache = { 'skillhealth-abc': { status: 'declined', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'suppress' });
});

test('decide skips a finding the local cache marked applied', () => {
  const cache = { 'skillhealth-abc': { status: 'applied', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'skip' });
});

test('decide skips a finding the local cache marked staged (avoid re-filing while unresolved)', () => {
  const cache = { 'skillhealth-abc': { status: 'staged', lastSeenMs: 1 } };
  assert.deepStrictEqual(decide({ id: 'skillhealth-abc' }, {}, cache), { action: 'skip' });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/dedup.test.js`
Expected: FAIL — `Cannot find module '../dedup'`.

- [ ] **Step 11: Write `dedup.js`**

Create `bin/lib/skill-health/dedup.js`:

```js
'use strict';

// Decide what to do with a freshly-fingerprinted proposal given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built from `gh issue list --label skill-health` output (the skill builds
//   it; the engine never calls network) — same contract as recon's dedup.js.
//
// Decision logic:
//   open issue match           -> skip      (already staged, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> skip      (assume applied via commit)
//   'declined' in local cache  -> suppress  (user rejected this exact proposal)
//   'applied' in local cache   -> skip      (already auto-applied and committed)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'applied') return { action: 'skip' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/dedup.test.js`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add bin/lib/skill-health/fingerprint.js bin/lib/skill-health/cache.js bin/lib/skill-health/dedup.js bin/lib/skill-health/tests/fingerprint.test.js bin/lib/skill-health/tests/cache.test.js bin/lib/skill-health/tests/dedup.test.js
git commit -m "Add skill-health engine: fingerprint, cursor/cache state, and dedup decision logic"
```

---

### Task 4: Engine — finding validation and issue payload projection

**Files:**
- Create: `bin/lib/skill-health/validate-finding.js`
- Create: `bin/lib/skill-health/issue-payload.js`
- Test: `bin/lib/skill-health/tests/validate-finding.test.js`
- Test: `bin/lib/skill-health/tests/issue-payload.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (this task's tests construct finding objects inline, matching Task 1's Finding Shape).
- Produces: `validateFinding(obj): {ok, value?, errors?}` (from `validate-finding.js`); `toIssuePayload(finding): {title, body, labels}` (from `issue-payload.js`) — Task 5's CLI imports both by name.

- [ ] **Step 1: Write the failing test for `validate-finding.js`**

Create `bin/lib/skill-health/tests/validate-finding.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validateFinding } = require('../validate-finding');

function validPatch(overrides = {}) {
  return {
    kind: 'patch',
    skill: 'auth',
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
    skill: 'queue-retry-pattern',
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
  assert.strictEqual(result.value.skill, 'auth');
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/validate-finding.test.js`
Expected: FAIL — `Cannot find module '../validate-finding'`.

- [ ] **Step 3: Write `validate-finding.js`**

Create `bin/lib/skill-health/validate-finding.js`:

```js
'use strict';

// Validates a skill-health finding (a patch proposal or new-skill candidate)
// against the Finding Shape in _shared/skill-health-analysis.md.
// Returns { ok:true, value } or { ok:false, errors:string[] }.

const KIND_VALUES = new Set(['patch', 'new-skill']);
const CLASSIFICATION_VALUES = new Set(['additive', 'restructural']);
const CONFIDENCE_VALUES = new Set(['high', 'med', 'low']);
const REVERSIBILITY_VALUES = new Set(['high', 'med', 'low']);

const REQUIRED_STRINGS = ['kind', 'skill', 'description', 'reason', 'classification', 'confidence', 'reversibility'];

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

module.exports = { validateFinding, KIND_VALUES, CLASSIFICATION_VALUES, CONFIDENCE_VALUES, REVERSIBILITY_VALUES };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/validate-finding.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `issue-payload.js`**

Create `bin/lib/skill-health/tests/issue-payload.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { toIssuePayload } = require('../issue-payload');

function patchFinding(overrides = {}) {
  return {
    id: 'skillhealth-abc12345',
    kind: 'patch',
    skill: 'auth',
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
    skill: 'queue-retry-pattern',
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
  assert.ok(payload.body.includes('<!-- skill-health-fingerprint: skillhealth-abc12345 -->'));
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:restructural']);
  assert.ok(payload.title.includes('auth'));
  assert.ok(payload.body.includes('src/auth/login.js'));
  assert.ok(payload.body.includes('src/auth/session.js'));
});

test('toIssuePayload for a new-skill finding uses the new-skill label and includes proposedBody', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.deepStrictEqual(payload.labels, ['skill-health', 'skill-health:new-skill']);
  assert.ok(payload.title.includes('queue-retry-pattern'));
  assert.ok(payload.body.includes('Queue Retry Pattern'));
});

test('toIssuePayload body always includes Current State, Deliverables, and Acceptance Criteria sections', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(payload.body.includes('## Current State'));
  assert.ok(payload.body.includes('## Deliverables'));
  assert.ok(payload.body.includes('## Acceptance Criteria'));
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/issue-payload.test.js`
Expected: FAIL — `Cannot find module '../issue-payload'`.

- [ ] **Step 7: Write `issue-payload.js`**

Create `bin/lib/skill-health/issue-payload.js`:

```js
'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
function toIssuePayload(finding) {
  const marker = `<!-- skill-health-fingerprint: ${finding.id} -->`;
  const kindLine = finding.kind === 'new-skill'
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**Skill:** ${finding.skill} | **Section:** ${finding.section} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = finding.kind === 'new-skill'
    ? `Proposed new skill \`${finding.skill}\`:\n\n${finding.proposedBody}`
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
    '_Filed by `/claude-tweaks:skill-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.kind === 'new-skill'
      ? `New skill candidate: ${finding.skill}`
      : `Skill drift: ${finding.skill} — ${finding.section}`,
    body,
    labels: ['skill-health', finding.kind === 'new-skill' ? 'skill-health:new-skill' : `skill-health:${finding.classification}`],
  };
}

module.exports = { toIssuePayload };
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test bin/lib/skill-health/tests/issue-payload.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add bin/lib/skill-health/validate-finding.js bin/lib/skill-health/issue-payload.js bin/lib/skill-health/tests/validate-finding.test.js bin/lib/skill-health/tests/issue-payload.test.js
git commit -m "Add skill-health engine: finding validation and GitHub issue payload projection"
```

---

### Task 5: CLI — `bin/skill-health.js`

**Files:**
- Create: `bin/skill-health.js`
- Test: `bin/lib/skill-health/tests/cli-next-target.test.js`
- Test: `bin/lib/skill-health/tests/cli-validate-findings.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `selectTarget`, `listSkills` (Task 2); `fingerprint` (Task 3); `readCache`, `writeCache`, `readCursors`, `recordAudit`, `readGapScanCursor`, `recordGapScan`, `recordRun`, `readRuns`, `computeChurn` (Task 3); `decide` (Task 3); `validateFinding` (Task 4); `toIssuePayload` (Task 4); `STALE_DAYS` (Task 2).
- Produces: the `next-target`, `validate-findings`, and `churn-report` CLI commands — Task 6's SKILL.md workflow steps invoke these by exact command name and flag.

- [ ] **Step 1: Write the failing test for `next-target`**

Create `bin/lib/skill-health/tests/cli-next-target.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeCursors } = require('../cache');

const CLI = path.resolve(__dirname, '..', '..', '..', 'skill-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-nt-')); }
function runNextTarget(args, root) {
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-target returns { target: null, gapScanDue: true } for a project with no skills yet', () => {
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

test('next-target --skill <id> bypasses selection and returns why: "manual"', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'billing.md'), '# billing');
  const result = runNextTarget(['--skill', 'billing'], root);
  assert.strictEqual(result.target.id, 'billing');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target gapScanDue is false right after a gap scan was recorded (via --gap-scan on validate-findings)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'auth.md'), '# auth');
  writeCursors(root, { __gapScan: { lastScannedSha: null, lastScannedMs: Date.now() } });
  const result = runNextTarget([], root);
  assert.strictEqual(result.gapScanDue, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/skill-health/tests/cli-next-target.test.js`
Expected: FAIL — the file `bin/skill-health.js` does not exist yet.

- [ ] **Step 3: Write the failing test for `validate-findings`**

Create `bin/lib/skill-health/tests/cli-validate-findings.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'skill-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-health-vf-')); }

function runValidateFindings(root, findingsFile, extraArgs = []) {
  return spawnSync('node', [CLI, 'validate-findings', findingsFile, '--root', root, ...extraArgs], { encoding: 'utf8' });
}

function validFinding(overrides = {}) {
  return {
    kind: 'patch',
    skill: 'auth',
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
  assert.ok(payloads[0].labels.includes('skill-health'));
  assert.ok(payloads[0].body.includes('<!-- skill-health-fingerprint: skillhealth-'));
});

test('validate-findings: malformed finding is dropped with a stderr reason, valid ones survive', () => {
  const root = tmp();
  const malformed = { kind: 'patch', skill: 'auth' }; // missing required fields
  const good = validFinding({ skill: 'billing', description: 'other issue' });
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

  const result = runValidateFindings(root, findingsFile, ['--dry-run', '--skill', 'auth', '--gap-scan']);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(JSON.parse(result.stdout).length, 1);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'skill-health', 'cache.json')), false);
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'skill-health', 'cursors.json')), false);
});

test('validate-findings: --skill <id> records the audit cursor for that skill', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([])); // an empty array is valid — still records the audit

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
  assert.ok(typeof cursors.__gapScan.lastScannedMs === 'number');
});

test('validate-findings: a finding already open in the issue index is skipped (dedup)', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*skill-health-fingerprint:\s*(skillhealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 1, state: 'open', labels: ['skill-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(JSON.parse(second.stdout).length, 0, 'open finding must be skipped');
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

- [ ] **Step 4: Run both new test files to verify they fail**

Run: `node --test bin/lib/skill-health/tests/cli-next-target.test.js bin/lib/skill-health/tests/cli-validate-findings.test.js`
Expected: FAIL — `bin/skill-health.js` does not exist.

- [ ] **Step 5: Write `bin/skill-health.js`**

Create `bin/skill-health.js`:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { fingerprint } = require('./lib/skill-health/fingerprint');
const {
  readCache, writeCache, readCursors, recordAudit,
  readGapScanCursor, recordGapScan, recordRun, readRuns, computeChurn,
} = require('./lib/skill-health/cache');
const { decide } = require('./lib/skill-health/dedup');
const { validateFinding } = require('./lib/skill-health/validate-finding');
const { toIssuePayload } = require('./lib/skill-health/issue-payload');
const { selectTarget, listSkills } = require('./lib/skill-health/scope');
const { STALE_DAYS } = require('./lib/skill-health/score');

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
    else args._.push(a);
  }
  return args;
}

// --issues <file> is an array of { number, state, labels, fingerprint } objects
// (the shape gh issue list + fingerprint extraction produces).
function loadIssueIndex(file) {
  if (!file) return {};
  let arr;
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  if (!Array.isArray(arr)) return {};
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
  const cursors = readCursors(root);
  const now = Date.now();

  let target = null;
  if (args.skill) {
    const found = listSkills(root).find((s) => s.id === args.skill) || null;
    target = found ? { ...found, why: 'manual' } : null;
  } else {
    target = selectTarget(root, cursors, { now });
  }

  const gapScan = readGapScanCursor(root);
  const gapScanDue = gapScan.lastScannedMs == null || (now - gapScan.lastScannedMs) / 86400000 > STALE_DAYS;

  process.stdout.write(JSON.stringify({ target, gapScanDue }, null, 2) + '\n');
}

function cmdValidateFindings(args) {
  const root = args.root || process.cwd();
  const findingsPath = args._[1];
  if (!findingsPath) {
    process.stderr.write(
      'usage: skill-health.js validate-findings <findings.json> [--root <dir>] [--issues <file>] [--skill <id>] [--gap-scan] [--run-id <id>] [--dry-run]\n',
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
        `[skill-health] validate-findings: dropped finding for skill "${(f && f.skill) || '?'}": ${v.errors.join('; ')}\n`,
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
    `[skill-health] validate-findings: ${survivors.length} valid finding(s), ${payloads.length} payload(s) after dedup\n`,
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

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'next-target') return cmdNextTarget(args);
  if (cmd === 'validate-findings') return cmdValidateFindings(args);
  if (cmd === 'churn-report') return cmdChurnReport(args);
  process.stderr.write(
    'usage: skill-health.js <command> [options]\n' +
    'commands: next-target [--skill <id>], validate-findings <file> [--skill <id>] [--gap-scan], churn-report [--fail-on-high-churn <r>]\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { parseArgs, cmdNextTarget, cmdValidateFindings, cmdChurnReport, main };
```

- [ ] **Step 6: Run both CLI test files to verify they pass**

Run: `node --test bin/lib/skill-health/tests/cli-next-target.test.js bin/lib/skill-health/tests/cli-validate-findings.test.js`
Expected: PASS — all tests green, 0 failures.

- [ ] **Step 7: Wire the new tests into `package.json`**

Read `package.json`, then update the `"test"` script from:

```json
"test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js"
```

to:

```json
"test": "node --test tests/ bin/lib/recon/tests/*.test.js bin/lib/issues/tests/*.test.js bin/lib/skill-health/tests/*.test.js"
```

- [ ] **Step 8: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — all suites green, including the new `bin/lib/skill-health/tests/*.test.js` files.

- [ ] **Step 9: Commit**

```bash
git add bin/skill-health.js bin/lib/skill-health/tests/cli-next-target.test.js bin/lib/skill-health/tests/cli-validate-findings.test.js package.json
git commit -m "Add skill-health CLI (next-target, validate-findings, churn-report) and wire tests into npm test"
```

---

### Task 6: New skill — `/claude-tweaks:skill-health`

**Files:**
- Create: `skills/skill-health/SKILL.md`
- Create: `skills/skill-health/routine-template.yml`

**Interfaces:**
- Consumes: `bin/skill-health.js`'s `next-target`/`validate-findings`/`churn-report` commands (Task 5, by exact flag names); `skills/_shared/skill-health-analysis.md`'s Finding Shape and procedure (Task 1).
- Produces: nothing consumed elsewhere in code — Task 10's cross-reference updates reference this skill's existence and command name.

No automated test — this is a skill definition an LLM interprets, not code. Verification is a self-review checklist plus `npm test` staying green (structural regression check only).

- [ ] **Step 1: Write `skills/skill-health/SKILL.md`**

Create `skills/skill-health/SKILL.md` with exactly this content:

````markdown
---
name: claude-tweaks:skill-health
description: Use when you want to check whether a project's .claude/skills/*.md files still accurately describe the codebase, or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only skill documentation. Keywords - skill health, skill drift, skill accuracy, new skill gap, scheduled, routine.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Skill Health — Keep the Skill Library Honest

A recurring watchman for `.claude/skills/*.md`: picks one skill to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/skill-health-analysis.md` procedure, and either auto-applies a safe patch or files a `skill-health`-labelled GitHub issue. Never edits code — only skill documentation.

```
              [ /claude-tweaks:skill-health ] <- utility (no fixed lifecycle position)
                           |  picks a skill via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> auto-apply (additive+high-confidence+high-reversibility) OR file GitHub issue (skill-health label)
```

## When to Use

- You want skill documentation to stay accurate between spec completions and full `/init` re-runs, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through the skill library and flags drift as it's found.
- You want to check one specific skill right now (`--skill <name>`).

Not for: auditing CLAUDE.md or `.claude/rules/` (out of scope for this skill). Not for code-quality findings (`/claude-tweaks:recon`'s job). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does, on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation.

## Input

`$ARGUMENTS` may contain:

- `--skill <name>` — manual override: audit one specific skill directly, bypassing `next-target` selection.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh` or `Edit`.
- `--budget <n>` — audit up to `n` skill-targets in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" next-target --root . ${SKILL:+--skill "$SKILL"}
```

Prints `{ target: { id, path, why } | null, gapScanDue: boolean }`. Read the output:
- If `target` is `null` and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- If `why: "stale"`: this skill has not been audited in over 90 days regardless of domain churn.
- If `why: "hotspot"`: this skill's documented file paths (backtick-quoted references extracted from its own content) have the highest git churn since its last audit among skills with any churn at all.
- If `why: "manual"`: `--skill` was passed, bypassing selection.

If `target` is `null` but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — there's no specific skill to deep-audit this firing, but the gap scan is still due.

**Step 2 — READ the target skill.**

Read the skill file at `target.path` in full. If `.claude/skills/` doesn't exist at all, report "no skills to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target skill.**

Apply the full procedure in `_shared/skill-health-analysis.md` (6-dimension check, evidence pre-checks, verify gate, concrete gap signals) to the target skill. Emit findings as a JSON array in the Finding Shape that file defines. Write the array to `/tmp/skill-health-findings.json`.

**Step 4 — GAP SCAN (when due, per Step 1's `gapScanDue`).**

Apply `_shared/skill-health-analysis.md`'s new-skill gap detection over commits since the gap-scan cursor (or the whole repo, if this is the first-ever gap scan). Append any new-skill candidates to the same findings array from Step 3.

**Step 5 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label skill-health --state all --json number,state,labels,body --limit 500 > /tmp/skill-health-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- skill-health-fingerprint: skillhealth-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/skill-health-issues.json`. If `gh` is unavailable or the repo has no `skill-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 6 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings /tmp/skill-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${SKILL_ID:+--skill "$SKILL_ID"} \
  ${GAP_SCAN_RAN:+--gap-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/skill-health-payloads.json
```

`SKILL_ID` is `target.id` from Step 1 (omit if Step 1 returned `target: null` and only the gap scan ran). `GAP_SCAN_RAN` is passed whenever Step 4 actually ran this firing. The command validates each finding, fingerprints via `skill + section + normalizedDescription`, dedups against open `skill-health` issues and the local cache, records the audit cursor for `SKILL_ID` (and the gap-scan cursor when `--gap-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 7 — APPLY or FILE.**

For each payload in `/tmp/skill-health-payloads.json`:
- If the underlying finding is `kind: "patch"` with `classification: "additive"`, `confidence: "high"`, and `reversibility: "high"` — apply it directly with `Edit` (using the finding's exact `oldString`/`newString`), then commit: `git commit -am "skill-health: apply additive patch to {skill} ({section})"`.
- Otherwise (restructural patches, any new-skill candidate, or lower confidence/reversibility) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label skill-health --label "<payload.labels[1]>"`.

In `--dry-run` mode, print what would be applied/filed but do not call `Edit`, `git commit`, or `gh`.

**Step 8 — SUMMARIZE.**

Report: which skill was audited (or that only the gap scan ran), how many findings were emitted, how many auto-applied vs filed vs skipped by dedup. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: apply now / file issue / dismiss.

## Routine Configuration

`/skill-health` ships a routine template (`skills/skill-health/routine-template.yml`) designed for small, predictable sips: one skill-target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create skill-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → apply/file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Additive+high-confidence+high-reversibility patches auto-apply and commit directly — this depends on the target project's CLAUDE.md already setting `auto-mode: default-on` (same situation `/tidy`'s routine is in, not `/recon`'s report-only case — see `_shared/auto-mode-contract.md`). Without that project policy, everything files as an issue instead of blocking on an unanswerable prompt.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

1. `/claude-tweaks:routine create skill-health` — schedule this as a recurring Routine. **(Recommended after a first standalone run confirms the output looks right.)**
2. `/claude-tweaks:skill-health --skill <name>` — audit one specific skill right now.
3. `/claude-tweaks:tidy` — fold any filed `skill-health` issues into a backlog-hygiene pass.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:skill-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Auto-applying a restructural patch | Only additive+high-confidence+high-reversibility patches auto-apply — restructural changes always go through a filed issue for human review. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging — the verify gate in `_shared/skill-health-analysis.md` is not optional. |
| Reading every sub-file of a candidate skill regardless of relevance | Some skills (`build`, `stories`, `init`) have many sub-files — exhaustive reads get expensive across a whole-library rotation. Bound reads by relevance. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/recon`. |
| Editing code to "fix" what a skill describes | This skill only ever touches skill documentation, never the code the skill describes. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/skill-health-analysis.md` procedure on a spec's changed files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
| `_shared/skill-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 6-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `skill-health`-labelled issues alongside `recon`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:routine` | `/routine create skill-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
````

- [ ] **Step 2: Write `skills/skill-health/routine-template.yml`**

Create `skills/skill-health/routine-template.yml`:

```yaml
template_version: 1
routine_name: skill-health-daily
prompt: "/claude-tweaks:skill-health"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob, Edit]
mcp_connections: []
default_schedule:
  cron_expression: "0 5 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Unlike recon, skill-health has a genuine stage-vs-auto-apply decision (additive +
  high-confidence + high-reversibility patches auto-apply; everything else files as
  an issue) — the same situation tidy is in, not recon's report-only case. A bare
  firing has zero conversation history and no CLI arg to signal auto mode, so this
  routine only auto-applies safely when the target project's CLAUDE.md already sets
  `auto-mode: default-on`; otherwise it degrades to filing everything as an issue
  instead of blocking. See skills/_shared/auto-mode-contract.md. Default budget is
  1 skill-target per firing — see skills/skill-health/SKILL.md's Routine
  Configuration section for tuning guidance this template doesn't restate.
```

- [ ] **Step 3: Self-check the SKILL.md follows plugin conventions**

Run:

```bash
grep -c "^## " skills/skill-health/SKILL.md
```

Expected: `8`.

```bash
grep "^## " skills/skill-health/SKILL.md
```

Expected headers, in order: `## When to Use`, `## Input`, `## Workflow`, `## Routine Configuration`, `## Next Actions`, `## Component-Skill Contract`, `## Anti-Patterns`, `## Relationship to Other Skills`.

```bash
grep -c "😀\|🎉\|✅\|👍" skills/skill-health/SKILL.md skills/skill-health/routine-template.yml
```

Expected: `0` (no emojis, matching this plugin's convention).

- [ ] **Step 4: Commit**

```bash
git add skills/skill-health/SKILL.md skills/skill-health/routine-template.yml
git commit -m "Add /claude-tweaks:skill-health skill and routine template"
```

---

### Task 7: Wrap-up integration — delegate Step 7 to the shared fragment

**Files:**
- Modify: `skills/wrap-up/skill-curation.md`
- Modify: `skills/wrap-up/SKILL.md`

**Interfaces:**
- Consumes: `skills/_shared/skill-health-analysis.md` (Task 1, by exact filename reference); `bin/skill-health.js validate-findings --skill <id>` (Task 5, by exact CLI invocation).
- Produces: nothing consumed elsewhere in code.

No automated test — markdown procedure edits. Verification is grep-based.

- [ ] **Step 1: Replace skill-curation.md's 7.3-7.5 with a pointer to the shared fragment**

In `skills/wrap-up/skill-curation.md`, replace this exact block (sections 7.3 through 7.5, verbatim as they exist today):

```markdown
## 7.3: Analyze Each Relevant Skill

Compare each skill in the read set (seeded + scanned) against what the build actually did. Check across 6 dimensions:

| Check | Question |
|-------|----------|
| **Pattern accuracy** | Do the skill's Key Patterns still match how the codebase works? |
| **Convention drift** | Do Project Conventions reflect current practice, or has the build diverged? |
| **Missing patterns** | Did the build introduce patterns that belong in this skill but aren't documented? |
| **Stale examples** | Do code examples still exist at the referenced file paths? |
| **Anti-pattern gaps** | Did the build reveal new anti-patterns worth documenting? |
| **Decision framework completeness** | Does the Decision Framework cover the choices made during this build? |

For each needed change, produce a patch in `/claude-tweaks:init`'s Update Mode format (read `skill-template.md` in the `/claude-tweaks:init` skill's directory for the format):

```
### Edit {N}: {description}
**Section:** {section name}
**Action:** Replace / Add / Remove
**Current:** `{current text or "N/A" for additions}`
**Proposed:** `{new text}`
**Reason:** {what changed — cite the specific build/review observation or changed-file diff}
```

## 7.4: Identify New-Skill Candidates

Candidates come from two sources:

- **Seeded** — `[skill: NEW - {name}]` ledger entries and reflection insights that don't fit existing skills (7.1). (The tag uses a hyphen, not an em-dash — match it exactly when scanning.)
- **Discovered** — gap candidates from the independent scan (7.2 step 4). These do **not** require a pre-tag — wrap-up surfaces them on its own.

Evaluate each candidate against three criteria:

1. **Reusability** — the pattern applies to 2+ future builds (not a one-off).
2. **Complexity** — the pattern is non-obvious (simple conventions belong in CLAUDE.md).
3. **Project-specific** — the pattern is specific to this project (not generic best practice).

**Gate — propose the candidate when at least 2 of the 3 criteria are clearly met.** (Previously all three were required, which suppressed nearly every candidate.) A candidate meeting all three is a strong recommendation; one meeting exactly two is proposed for the user / Review Console to decide. A candidate meeting ≤1 criterion is dropped — note which were dropped and why so the decision is auditable.

A proposed candidate is **never auto-created** — it is always staged for an explicit decision (7.6). For approved candidates, note the skill name and scope; the actual skill file is created during SKILL.md Step 10 execution.

## 7.5: Quality Check

Verify each proposed update against the quality gates from `skill-template.md` in the `/claude-tweaks:init` skill's directory:

- [ ] Every code example is adapted from actual codebase patterns (not generic)
- [ ] File paths referenced actually exist
- [ ] Commands referenced actually work
- [ ] Conventions described match what the codebase actually does
- [ ] No generic advice that adds no project-specific value
- [ ] Anti-patterns cite project-specific reasons, not textbook warnings

**Anchor check:** every proposed update must trace to a concrete anchor — a ledger entry, a reflection insight, **or a specific changed-file observation from the independent scan (7.2)**. Updates with no concrete anchor are indistinguishable from hallucinated ones — discard them. Note what was discarded and why.
```

with:

```markdown
## 7.3-7.5: Judge Each Relevant Skill and New-Skill Candidates

Apply the full procedure in `_shared/skill-health-analysis.md` (Steps 1-6: evidence pre-checks, the 6-dimension check, new-skill gap detection, the new-skill qualification gate, the verify gate, and quality gates) to every skill in the read set (seeded + scanned from 7.2) and to any new-skill candidates discovered there. That file is the single canonical procedure — also read by `/claude-tweaks:init` (Phase 3/6) and the standalone `/claude-tweaks:skill-health` routine — so a skill's drift verdict doesn't depend on which of the three ever looked at it.

Emit findings in the Finding Shape that file defines. A proposed new-skill candidate is **never auto-created** — it is always staged for an explicit decision (7.6). For approved candidates, note the skill name and scope; the actual skill file is created during SKILL.md Step 10 execution.

**Record the audit.** For each skill analyzed in this pass — whether or not a patch was proposed — record it in the shared cursor so `/claude-tweaks:skill-health`'s rotation and `/claude-tweaks:init`'s classification skip a skill wrap-up just reviewed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings <findings-for-that-skill.json> --root . --skill <skill-id>
```

An empty findings array is valid here — it still records `lastAuditedSha`/`lastAuditedMs` for that skill.
```

- [ ] **Step 2: Add the skill-health cross-reference to wrap-up's SKILL.md Relationship table**

In `skills/wrap-up/SKILL.md`, find this exact row in the Relationship to Other Skills table:

```markdown
| `_shared/issue-claims.md` | Cleanup item 8 (Section E of `cleanup-procedures.md`) releases claims for specs with `recon-issue:` frontmatter, with the branch outcome as the release reason. |
```

and add a new row directly after it:

```markdown
| `_shared/issue-claims.md` | Cleanup item 8 (Section E of `cleanup-procedures.md`) releases claims for specs with `recon-issue:` frontmatter, with the branch outcome as the release reason. |
| `/claude-tweaks:skill-health` and `_shared/skill-health-analysis.md` | Step 7's 7.3-7.5 apply this shared procedure instead of an inline copy — sharing its judgment logic and its `.claude-tweaks/skill-health/` cursor/cache state with `/claude-tweaks:init` and the standalone `/claude-tweaks:skill-health` routine. |
```

- [ ] **Step 3: Self-check the edits landed**

Run:

```bash
grep -n "skill-health-analysis" skills/wrap-up/skill-curation.md skills/wrap-up/SKILL.md
```

Expected: at least 2 matches in `skill-curation.md` and 1 in `SKILL.md`.

```bash
grep -n "## 7.4\|## 7.5" skills/wrap-up/skill-curation.md
```

Expected: no matches — those headers were replaced by the merged `## 7.3-7.5` section.

- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/skill-curation.md skills/wrap-up/SKILL.md
git commit -m "Delegate wrap-up Step 7 skill judgment to the shared skill-health-analysis procedure"
```

---

### Task 8: Init integration — delegate Phase 6 patching to the shared fragment

**Files:**
- Modify: `skills/init/skill-template.md`
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: `skills/_shared/skill-health-analysis.md` (Task 1, by exact filename reference); `bin/skill-health.js validate-findings --skill <id>` (Task 5, by exact CLI invocation).
- Produces: nothing consumed elsewhere in code.

No automated test — markdown procedure edits. Verification is grep-based.

- [ ] **Step 1: Replace skill-template.md's "Update Mode" section body, keep "Quality Gates for Generated Skills" untouched**

In `skills/init/skill-template.md`, replace this exact block:

```markdown
## Update Mode

For each approved drifted skill, produce **targeted edits** — not a full rewrite:

```markdown
## Skill Patches: `{skill-name}`

### Edit 1: {description}
**Section:** {section name}
**Action:** Replace / Add / Remove
**Current:** `{current text or "N/A" for additions}`
**Proposed:** `{new text}`
**Reason:** {what changed in the codebase}
```

For approved gap skills (new patterns needing new skills), generate full SKILL.md as in Initial Mode.
```

with:

```markdown
## Update Mode

For each skill classified **drifted** or **gap** in Phase 3, apply the full procedure in `_shared/skill-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:skill-health` routine use for judging drift and proposing patches. That file owns the 6-dimension check, evidence pre-checks, the tightened patch format (exact `oldString`/`newString`, required for reliable auto-apply), the new-skill qualification gate, and the verify gate — do not duplicate them here.

For approved gap skills that qualify as new-skill candidates (per the shared fragment's qualification gate), generate the full SKILL.md as in Initial Mode, above — the shared fragment's `proposedBody` field uses that same template.

### Cursor Participation

Before classifying a skill in Phase 1u/Phase 3, check `.claude-tweaks/skill-health/cursors.json`: a skill with `lastAuditedMs` within the last 90 days was recently verified by `/claude-tweaks:wrap-up` or the `/claude-tweaks:skill-health` routine — mark it "recently verified — skipped" rather than re-judging it from scratch in Phase 2. After Phase 6 patches a drifted skill, record the audit so wrap-up and the routine see it too:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings <findings.json> --root . --skill <skill-id>
```
```

(Leave the following `## Quality Gates for Generated Skills` section completely untouched — it still governs Initial Mode's from-scratch skill generation, which this change does not affect.)

- [ ] **Step 2: Update init/SKILL.md's Phase 6 pointer text**

In `skills/init/SKILL.md`, find this exact line:

```markdown
For the complete SKILL.md template, update patch format, quality gates checklist, and depth guide, read `skill-template.md` in this skill's directory.
```

and replace it with:

```markdown
For the complete SKILL.md template and depth guide, read `skill-template.md` in this skill's directory. For the drift-patch procedure and quality gates applied to drifted/gap skills, read `_shared/skill-health-analysis.md` — the same procedure `/claude-tweaks:wrap-up` Step 7 and the standalone `/claude-tweaks:skill-health` routine use.
```

- [ ] **Step 3: Add the skill-health cross-reference to init's SKILL.md Relationship table**

In `skills/init/SKILL.md`, find this exact row:

```markdown
| `/claude-tweaks:routine` | Phase 0.96 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record for the current project, and offers to invoke `/claude-tweaks:routine create <skill> --source init` for each the user selects — pure discovery + handoff, no logic duplicated. |
```

and add a new row directly after it:

```markdown
| `/claude-tweaks:routine` | Phase 0.96 discovers claude-tweaks skills shipping a `routine-template.yml` with no existing instantiated record for the current project, and offers to invoke `/claude-tweaks:routine create <skill> --source init` for each the user selects — pure discovery + handoff, no logic duplicated. |
| `/claude-tweaks:skill-health` and `_shared/skill-health-analysis.md` | Phase 6's drift-patch procedure and Phase 3/1u's skill classification apply this shared procedure instead of an inline copy, sharing its judgment logic and `.claude-tweaks/skill-health/` cursor/cache state with `/claude-tweaks:wrap-up` Step 7 and the standalone routine. |
```

- [ ] **Step 4: Self-check the edits landed**

Run:

```bash
grep -n "skill-health-analysis" skills/init/skill-template.md skills/init/SKILL.md
```

Expected: at least 2 matches in `skill-template.md` and 2 in `SKILL.md`.

```bash
grep -n "^## Quality Gates for Generated Skills" skills/init/skill-template.md
```

Expected: exactly 1 match — confirms that section survived untouched.

- [ ] **Step 5: Commit**

```bash
git add skills/init/skill-template.md skills/init/SKILL.md
git commit -m "Delegate init Phase 6 skill-patch procedure and Phase 3 skill classification to the shared skill-health-analysis fragment"
```

---

### Task 9: Tidy integration — sweep skill-health-labelled issues

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/tidy/SKILL.md`
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: the `skill-health` GitHub label (Task 6, by exact label string — matches `toIssuePayload`'s `labels: ['skill-health', ...]` from Task 4).
- Produces: nothing consumed elsewhere in code.

No automated test — markdown procedure edits. Verification is grep-based.

- [ ] **Step 1: Extend github-pr-scan.md's repo-wide scope**

In `skills/_shared/github-pr-scan.md`, replace this exact block:

```markdown
## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs and recon-labelled issues.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Recon issues** — `gh issue list --label recon --state open --json number,title,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to INBOX or run `/review` — local action |
| Recon issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
| Recon issue still valid | Suggest `/flow --from-recon` or Capture to INBOX |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract.
```

with:

```markdown
## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs, recon-labelled issues, and skill-health-labelled issues.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Recon issues** — `gh issue list --label recon --state open --json number,title,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.
5. **Skill-health issues** — `gh issue list --label skill-health --state open --json number,title,updatedAt,url`.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to INBOX or run `/review` — local action |
| Recon issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
| Recon issue still valid | Suggest `/flow --from-recon` or Capture to INBOX |
| Skill-health issue stale (>4 weeks, the referenced skill or code has since changed again) | Close (GitHub) — superseded |
| Skill-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:skill-health --skill <name>` to re-judge |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract.
```

- [ ] **Step 2: Update tidy/SKILL.md's Step 4.8 table row and Relationship table**

In `skills/tidy/SKILL.md`, find this exact line:

```markdown
| 4.8 | `gh pr list` / `gh issue list --label recon` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
```

and replace it with:

```markdown
| 4.8 | `gh pr list` / `gh issue list --label recon` / `gh issue list --label skill-health` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
```

Then find this exact line:

```markdown
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs and recon issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
```

and replace it with:

```markdown
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs, recon issues, and skill-health issues per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping |
```

Then find this exact row:

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/flow --from-recon` or captured to INBOX. |
```

and add a new row directly after it:

```markdown
| `/claude-tweaks:recon` | `/recon` files improvement findings as `recon`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/flow --from-recon` or captured to INBOX. |
| `/claude-tweaks:skill-health` | `/skill-health` files skill-drift findings as `skill-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them alongside recon issues — stale/superseded ones closed after batch approval, still-valid ones suggested for direct application or re-judging. |
```

- [ ] **Step 3: Update the summary sentence in tidy/scan-procedures.md**

In `skills/tidy/scan-procedures.md`, find this exact sentence (inside the "## Step 4.8: Audit GitHub PRs and Issues" section):

```markdown
The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).
```

and replace it with:

```markdown
The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads and still-valid recon or skill-health issues → Capture or a suggested local command; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly).
```

- [ ] **Step 4: Self-check the edits landed**

Run:

```bash
grep -n "skill-health" skills/_shared/github-pr-scan.md skills/tidy/SKILL.md skills/tidy/scan-procedures.md
```

Expected: at least 4 matches in `github-pr-scan.md`, 3 in `SKILL.md`, and 1 in `scan-procedures.md`.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/tidy/SKILL.md skills/tidy/scan-procedures.md
git commit -m "Extend tidy Step 4.8 to sweep skill-health-labelled GitHub issues alongside recon's"
```

---

### Task 10: Cross-reference doc updates and version bump

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`
- Modify: `skills/routine/SKILL.md`
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing new — pure documentation of the skill created in Task 6.
- Produces: nothing consumed elsewhere in code.

No automated test — pure documentation. Verification is grep-based.

- [ ] **Step 1: Update CLAUDE.md's skill directory count and utility list**

In `CLAUDE.md`, find this exact block:

```markdown
### Skill directories (24 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine
```

and replace it with:

```markdown
### Skill directories (25 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research, recon, routine, skill-health
```

- [ ] **Step 2: Add skill-health's paragraph to README.md**

In `README.md`, find this exact paragraph:

```markdown
**`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. recon's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `--dry-run` to inspect the assembled configuration before anything is created.
```

and add a new paragraph directly after it:

```markdown
**`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. recon's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `--dry-run` to inspect the assembled configuration before anything is created.

**`/claude-tweaks:skill-health`** — Recurring watchman for `.claude/skills/*.md`: picks one skill to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/skill-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 — and either auto-applies a safe additive patch or files a `skill-health`-labelled GitHub issue. Runs on a scheduled Routine for continuous coverage, rotating through the skill library via a churn/staleness cursor shared with `/init` and `/wrap-up`. Never edits code — only skill documentation.
```

- [ ] **Step 3: Add a row to the Utility table in `skills/help/reference-card.md`**

In `skills/help/reference-card.md`, find this exact line:

```markdown
| `/claude-tweaks:routine` | Instantiate a skill's routine template (e.g. recon's) into a live cloud Routine via `RemoteTrigger` — template-driven, resolves project/account values with minimal prompts | `create <skill>`, `update <skill>`, `status <skill>`, `--dry-run` |
```

and add a new row directly after it:

```markdown
| `/claude-tweaks:routine` | Instantiate a skill's routine template (e.g. recon's) into a live cloud Routine via `RemoteTrigger` — template-driven, resolves project/account values with minimal prompts | `create <skill>`, `update <skill>`, `status <skill>`, `--dry-run` |
| `/claude-tweaks:skill-health` | Recurring watchman auditing `.claude/skills/*.md` for drift + new-skill gaps, sharing its judgment procedure with `/init`/`/wrap-up`. Scheduled Routine. Never edits code. | `--skill <name>`, `--dry-run`, `--budget <n>`, `--root <dir>` |
```

- [ ] **Step 4: Add skill-health as a fourth consumer in routine/SKILL.md's Relationship table**

In `skills/routine/SKILL.md`, find this exact row:

```markdown
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
```

and add a new row directly after it:

```markdown
| `/claude-tweaks:tidy` | Tidy is this skill's second consumer — `skills/tidy/routine-template.yml` relies on tidy's own Standalone-auto support for safe unattended execution. |
| `/claude-tweaks:skill-health` | Fourth consumer — `skills/skill-health/routine-template.yml` audits `.claude/skills/*.md` for drift and new-skill gaps, sharing its judgment procedure with `/init` and `/wrap-up`. |
```

- [ ] **Step 5: Bump the plugin version**

Check for a concurrent bump first:

```bash
git log --oneline -5 .claude-plugin/plugin.json
```

If the most recent entry is not already `5.7.0` (i.e., someone bumped past it since this plan was written), use the next free version instead of `5.8.0` below.

In `.claude-plugin/plugin.json`, find:

```json
  "version": "5.7.0",
```

and replace it with:

```json
  "version": "5.8.0",
```

- [ ] **Step 6: Self-check all edits landed**

Run:

```bash
grep -n "skill-health" CLAUDE.md README.md skills/help/reference-card.md skills/routine/SKILL.md
```

Expected: at least 1 match in each file.

```bash
grep -n '"version"' .claude-plugin/plugin.json
```

Expected: `"version": "5.8.0",` (or the renumbered value from Step 5 if a concurrent bump was found).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md skills/help/reference-card.md skills/routine/SKILL.md .claude-plugin/plugin.json
git commit -m "Cross-reference skill-health in CLAUDE.md, README, reference card, and routine's relationship table — bump to 5.8.0"
```

---

### Task 11: Final verification

**Files:** none created or modified — this task only runs checks.

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every suite green, including `bin/lib/skill-health/tests/*.test.js`, with 0 failures.

- [ ] **Step 2: Smoke-test the CLI end-to-end against a fixture project**

```bash
FIXTURE=$(mktemp -d)
mkdir -p "$FIXTURE/.claude/skills"
cat > "$FIXTURE/.claude/skills/auth.md" <<'EOF'
---
name: auth
description: Use when working with authentication.
---
# Auth
See `src/auth/login.js` for the canonical flow.
EOF

node bin/skill-health.js next-target --root "$FIXTURE"
```

Expected: prints `{ "target": { "id": "auth", "path": "...", "why": "stale" }, "gapScanDue": true }` (never-audited skill, never-scanned gap cursor).

```bash
cat > /tmp/smoke-findings.json <<'EOF'
[{
  "kind": "patch",
  "skill": "auth",
  "section": "Auth",
  "classification": "restructural",
  "confidence": "high",
  "reversibility": "med",
  "description": "src/auth/login.js does not exist in this fixture",
  "oldString": "See `src/auth/login.js` for the canonical flow.",
  "newString": "See `src/auth/session.js` for the canonical flow.",
  "reason": "Smoke test: verifying the CLI end-to-end."
}]
EOF

node bin/skill-health.js validate-findings /tmp/smoke-findings.json --root "$FIXTURE" --skill auth --gap-scan
```

Expected: prints a JSON array with one payload; `labels` includes `"skill-health"` and `"skill-health:restructural"`; body includes `<!-- skill-health-fingerprint: skillhealth-`.

```bash
node bin/skill-health.js next-target --root "$FIXTURE"
```

Expected: `target` is now `null` (the only skill was just audited, its cursor is fresh, and there's no churn signal to trigger a re-pick) and `gapScanDue` is `false` (just recorded).

```bash
node bin/skill-health.js churn-report --root "$FIXTURE"
```

Expected: a table with one data row.

```bash
rm -rf "$FIXTURE" /tmp/smoke-findings.json
```

- [ ] **Step 3: Confirm no emojis were introduced anywhere in this feature's files**

```bash
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' skills/skill-health/ skills/_shared/skill-health-analysis.md bin/skill-health.js bin/lib/skill-health/ 2>/dev/null
```

Expected: no output (no matches).

- [ ] **Step 4: Confirm every cross-reference is bidirectional**

```bash
grep -l "skill-health" skills/wrap-up/SKILL.md skills/init/SKILL.md skills/tidy/SKILL.md skills/routine/SKILL.md skills/_shared/github-pr-scan.md
```

Expected: all 5 files listed (each references skill-health, and Task 6's `skills/skill-health/SKILL.md` Relationship table references each of them back).

```bash
grep -c "wrap-up\|init\|tidy\|routine\|github-pr-scan" skills/skill-health/SKILL.md
```

Expected: non-zero — confirms the reverse direction is documented too.

This task requires no commit — it's a verification pass over work already committed in Tasks 1-10.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-skill-health.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
