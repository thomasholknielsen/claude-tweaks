# Acceptance Disposition Backstop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that every closed work record reaches an explicit acceptance disposition, on every closing path, so the earned-autonomy trust table has a signal to read.

**Architecture:** A pure classifier module (`bin/lib/issues/acceptance.js`) decides what disposition a record needs and whether it has one. `/claude-tweaks:tidy`'s Step 4.8 GitHub scan calls it to find closed records with no disposition and surfaces them as findings. No hook change — the closing commit in git history is already the durable attribution record. `/claude-tweaks:wrap-up`'s verification brief gains a manual-verification path so non-UI records (nearly all of this repo) stop being unverifiable by construction.

**Tech Stack:** Node 18+ (no external deps), `node --test`, `gh` CLI, markdown skill files.

**Source spec:** `docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md` — Phase 1, parts 1.3 and 1.4. This plan is the first of two for Phase 1; provenance stamping (part 1.1) is a separate plan.

## Global Constraints

- No emojis in skill files — use `**(Recommended)**` bold text for emphasis instead.
- Skill references inside actionable instruction text use the fully-qualified `/claude-tweaks:{skill}` form.
- New `bin/lib/` modules are CommonJS (`require`/`module.exports`), matching every sibling in `bin/lib/issues/`.
- `bin/lib/issues/tests/*.test.js` is already enumerated in `package.json`'s test script — no glob change needed for this plan.
- Version bump: before writing any version literal, `git fetch origin main`, check `git log --oneline -5 origin/main -- .claude-plugin/plugin.json`, **and** check every sibling worktree branch (`git worktree list`, then `git log --oneline main..<branch> -- .claude-plugin/plugin.json`). A version is claimed by whatever ships first.
- The `CHANGELOG.md` entry and the `docs/shipped-versions.tsv` line land **in the same commit as the bump**.
- Do not add a Relationship-to-Other-Skills table to any skill — edges belong in `docs/skill-graph.md`.

---

### Task 1: Acceptance classifier module

**Files:**
- Create: `bin/lib/issues/acceptance.js`
- Test: `bin/lib/issues/tests/acceptance.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `dispositionState(labels: string[]) -> 'approved' | 'changes-requested' | 'pending' | 'none'`
  - `verificationSurface(changedPaths: string[]) -> 'interactive' | 'non-interactive'`
  - `needsBackstop(record: {state: string, labels: string[]}) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `bin/lib/issues/tests/acceptance.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  dispositionState,
  verificationSurface,
  needsBackstop,
} = require('../acceptance.js');

test('dispositionState reads each acceptance label', () => {
  assert.equal(dispositionState(['demo:pending']), 'pending');
  assert.equal(dispositionState(['demo:approved']), 'approved');
  assert.equal(dispositionState(['demo:changes-requested']), 'changes-requested');
});

test('dispositionState returns none when no acceptance label is present', () => {
  assert.equal(dispositionState(['ready', 'type:bug']), 'none');
  assert.equal(dispositionState([]), 'none');
  assert.equal(dispositionState(undefined), 'none');
});

test('a resolved verdict wins over a stale demo:pending', () => {
  // /demo removes demo:pending as it adds the verdict, but a partial write or a
  // concurrent edit can leave both. A resolved record must never be re-swept.
  assert.equal(dispositionState(['demo:pending', 'demo:approved']), 'approved');
  assert.equal(dispositionState(['demo:pending', 'demo:changes-requested']), 'changes-requested');
});

test('verificationSurface treats docs, skills, bin and config as non-interactive', () => {
  assert.equal(verificationSurface(['docs/plugin-structure.md']), 'non-interactive');
  assert.equal(verificationSurface(['skills/tidy/SKILL.md']), 'non-interactive');
  assert.equal(verificationSurface(['bin/lib/issues/acceptance.js']), 'non-interactive');
  assert.equal(verificationSurface(['.claude-plugin/plugin.json']), 'non-interactive');
});

test('verificationSurface treats stories and journeys as interactive despite being markdown', () => {
  assert.equal(verificationSurface(['docs/journeys/checkout.md']), 'interactive');
  assert.equal(verificationSurface(['stories/login.md']), 'interactive');
});

test('verificationSurface is interactive when any path is a UI surface', () => {
  assert.equal(verificationSurface(['docs/a.md', 'src/components/Button.tsx']), 'interactive');
});

test('verificationSurface defaults to non-interactive for an empty path list', () => {
  assert.equal(verificationSurface([]), 'non-interactive');
  assert.equal(verificationSurface(undefined), 'non-interactive');
});

test('needsBackstop fires only for a closed record with no disposition', () => {
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [] }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: ['demo:approved'] }), false);
  assert.equal(needsBackstop({ state: 'OPEN', labels: [] }), false);
  assert.equal(needsBackstop(undefined), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: FAIL — `Cannot find module '../acceptance.js'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/acceptance.js`:

```js
'use strict';

// Resolved verdicts are listed before `pending` deliberately: /claude-tweaks:demo
// removes demo:pending in the same operation it adds the verdict, but a partial
// write or a concurrent edit can leave both on the record. First-match-wins over
// this order means a resolved record is never re-swept as un-dispositioned.
const ACCEPTANCE_BY_LABEL = [
  ['demo:approved', 'approved'],
  ['demo:changes-requested', 'changes-requested'],
  ['demo:pending', 'pending'],
];

// Paths with no interactive verification surface. Mirrors the classification in
// skills/wrap-up/verification-brief.md Step 2.
const NON_INTERACTIVE = [
  /^docs\//,
  /^\.claude/,
  /^skills\/.*\.md$/,
  /^bin\//,
  /^tests\//,
  /^perf\//,
  /\.(ya?ml|json|toml|tsv)$/,
  /\.md$/,
];

// Markdown that IS a user-facing surface, checked before NON_INTERACTIVE so the
// broad `^docs/` and `\.md$` patterns cannot claim it first.
const INTERACTIVE_PATHS = [/^stories\//, /^docs\/journeys\//];

function dispositionState(labels) {
  const names = Array.isArray(labels) ? labels : [];
  for (const [label, state] of ACCEPTANCE_BY_LABEL) {
    if (names.includes(label)) return state;
  }
  return 'none';
}

function verificationSurface(changedPaths) {
  const paths = (Array.isArray(changedPaths) ? changedPaths : []).filter(Boolean);
  const anyInteractive = paths.some((path) => {
    if (INTERACTIVE_PATHS.some((re) => re.test(path))) return true;
    return !NON_INTERACTIVE.some((re) => re.test(path));
  });
  return anyInteractive ? 'interactive' : 'non-interactive';
}

function needsBackstop(record) {
  if (!record || record.state !== 'CLOSED') return false;
  return dispositionState(record.labels) === 'none';
}

module.exports = { dispositionState, verificationSurface, needsBackstop };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: PASS, 8 tests, 0 failures

- [ ] **Step 5: Run the full suite for regressions**

Run: `npm test 2>&1 | tail -30`
Expected: no new failures. `tests/hooks-*` and `perf/` are known to flap under concurrent agent load (`#104`) — re-run a failing file alone before treating it as a regression.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/acceptance.js bin/lib/issues/tests/acceptance.test.js
git commit -m "Add the acceptance-disposition classifier — refs #135"
```

---

### Task 2: Surface un-dispositioned closed records in /tidy's GitHub scan

**Files:**
- Modify: `skills/tidy/SKILL.md` (Step 4.8 row in the scan table, and Step 4.8's own section)

**Interfaces:**
- Consumes: `needsBackstop`, `verificationSurface` from Task 1.
- Produces: a new `[gh-issue]` finding subtype, `acceptance-gap`, consumed by Step 6's batch report.

- [ ] **Step 1: Read the current Step 4.8 section**

Run: `grep -n "4.8" skills/tidy/SKILL.md` and read the section it points at, plus `skills/_shared/github-pr-scan.md`.
Do not proceed until you can state what Step 4.8 currently emits and where Step 6 renders it.

- [ ] **Step 2: Add the acceptance-gap scan to Step 4.8**

Add to Step 4.8's scan description. The record set is closed records from the last 30 days; the classifier decides which lack a disposition:

```bash
gh issue list --state closed --limit 200 \
  --json number,title,state,labels,closedAt \
  --jq '[.[] | select(.closedAt > "'"$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)"'")]' \
  > /tmp/tidy-closed-records.json

node -e "
  const { needsBackstop } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const records = require('/tmp/tidy-closed-records.json');
  const gaps = records
    .map(r => ({ ...r, labels: r.labels.map(l => l.name) }))
    .filter(r => needsBackstop({ state: 'CLOSED', labels: r.labels }));
  gaps.forEach(r => console.log('[gh-issue] #' + r.number + ' ' + r.title + ' — closed with no acceptance disposition — recommend /claude-tweaks:demo #' + r.number));
"
```

Note the `date` fallback: BSD `date` (macOS, this project's platform) uses `-v-30d`; GNU `date` uses `-d '30 days ago'`. Both forms are present so the command works on either.

- [ ] **Step 3: Add the finding subtype to the Step 4.8 table row**

In the scan table (the row beginning `| 4.8 |`), add `acceptance-gap` to the emitted-types cell so the taxonomy stays complete. Keep the existing `[pr]` / `[gh-issue]` types.

- [ ] **Step 4: State the disposition rule in the finding's recommendation**

Un-dispositioned closed records are **staged, never auto-applied**, regardless of `tidy-aggressiveness`. Applying a disposition is a judgment about whether shipped work solved the problem — it is not a mechanical cleanup, and `_shared/auto-mode-contract.md` places work-record judgment outside what `auto` silences. Write this rule explicitly into the Step 4.8 text so a later reader does not "optimize" it into the auto-apply set.

- [ ] **Step 5: Verify the scan text against a real run**

Run the Step 2 bash block verbatim against this repo.
Expected: a non-empty list including records such as `#144`, `#139`, `#132` — closed with no acceptance label. If it returns empty, the classifier or the `--jq` filter is wrong; fix before committing.

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/SKILL.md
git commit -m "Scan for closed records with no acceptance disposition in /tidy Step 4.8 — refs #135"
```

---

### Task 3: Manual-verification path for non-interactive records

**Files:**
- Modify: `skills/wrap-up/verification-brief.md` (Step 2, and the `### See it yourself` section of the brief template)
- Modify: `skills/demo/SKILL.md` (Step 2's "See it yourself" pre-flight)

**Interfaces:**
- Consumes: `verificationSurface` from Task 1 — the same classification, so the two files cannot drift apart.
- Produces: a `### Verify it yourself (manual)` brief section for non-interactive records.

- [ ] **Step 1: Read both current call sites**

Read `skills/wrap-up/verification-brief.md` Steps 2 and 4 in full, and `skills/demo/SKILL.md` Step 2's "See it yourself" subsection.
State plainly what each currently does when a record has no interactive surface. This is the gap `#135` records — confirm it before changing anything.

- [ ] **Step 2: Replace Step 2's binary testability outcome**

Step 2 currently classifies a record as testable or not, and a non-testable record silently loses its verification path. Change the non-testable branch so it produces **manual verification steps** instead of nothing: the concrete commands, file paths, or observable behavior a human can check by hand. For a skill-file change that means naming the skill and the behavior to exercise; for a `bin/` change, the command to run and its expected output.

Point Step 2 at `verificationSurface` so the classification has one implementation:

```bash
node -e "
  const { verificationSurface } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const paths = process.argv.slice(1);
  console.log(verificationSurface(paths));
" $(git diff --name-only {base}...HEAD)
```

- [ ] **Step 3: Add the brief template section**

In the `## Verification Brief` template, add a `### Verify it yourself (manual)` section rendered when `verificationSurface` returns `non-interactive`. It sits in the same slot the existing `### See it yourself (optional)` occupies for interactive records — the two are mutually exclusive, never both.

- [ ] **Step 4: Teach /demo to walk manual steps**

In `skills/demo/SKILL.md` Step 2, add the branch: when the brief carries `### Verify it yourself (manual)`, walk those steps with the user instead of attempting a browser pre-flight. The existing live/manual fork already exists in that section — extend it rather than adding a parallel structure.

- [ ] **Step 5: Verify the two classifications agree**

Run: `grep -n "verificationSurface" skills/wrap-up/verification-brief.md skills/demo/SKILL.md`
Expected: both files reference the shared module. Neither restates the path patterns inline — a restated copy is the drift this task exists to prevent.

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/verification-brief.md skills/demo/SKILL.md
git commit -m "Give non-interactive records a manual verification path — closes #135"
```

---

### Task 4: Cross-references, changelog, and release

**Files:**
- Modify: `docs/skill-graph.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/shipped-versions.tsv`

- [ ] **Step 1: Add the skill-graph edges**

Add the edges this plan creates: `/claude-tweaks:tidy` → `/claude-tweaks:demo` (the acceptance-gap finding recommends it), and `/claude-tweaks:wrap-up` → `/claude-tweaks:demo` for the manual path. Every relationship is stated once, here, and never restated in a SKILL.md.

- [ ] **Step 2: Re-check the version before claiming one**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git worktree list
grep -rn "6\.4[89]\|6\.5[0-9]" docs/superpowers/plans/ | grep -v "2026-08-07-acceptance"
```
Expected: identify the highest version already claimed anywhere — `origin/main`, a sibling worktree branch, or an unexecuted plan. Take the next free one. Re-run `git fetch origin main` immediately before Step 5's push; a concurrent session can ship during this task.

- [ ] **Step 3: Bump the version**

Edit `.claude-plugin/plugin.json`'s `version` to the number resolved in Step 2. This is a feature addition, so bump the minor version.

- [ ] **Step 4: Add the changelog entry and the shipped-versions line**

In `CHANGELOG.md`, directly under the `# Changelog` header:

```markdown
## v{version} — Closed records now reach an explicit acceptance disposition
```

In `docs/shipped-versions.tsv`, append `{version}\t{YYYY-MM-DD}\trelease`.

The heading shape is load-bearing — `bin/lib/changelog.js` requires a strict `X.Y.Z` and the em-dash title, and `tests/changelog-coverage.test.js` fails the suite otherwise.

- [ ] **Step 5: Run the full suite, then commit**

```bash
npm test 2>&1 | tail -30
git add docs/skill-graph.md .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
git diff --cached --name-only
git commit -m "Release {version} — closed records reach an explicit acceptance disposition"
```

Verify `git diff --cached --name-only` lists exactly those four files before committing — `git commit` with no pathspec takes the entire staged index.

---

## Out of scope for this plan

- Provenance (`by:*`) stamping — Phase 1's other half, its own plan.
- The trust table, the survival sweep, and any backfill — Phase 2.
- The `autonomy` ceiling lever and born-authorized records — Phase 3.
- The in-run initiative budget and the finalization drain — Phase 4.
- Changing any closing path to *apply* a disposition automatically. This plan makes the gap
  visible and actionable; deciding a record's acceptance stays a human judgment until Phase 3
  establishes what has earned otherwise.
