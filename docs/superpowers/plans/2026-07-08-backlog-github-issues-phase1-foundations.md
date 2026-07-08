# Backlog on GitHub Issues — Phase 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational, non-user-facing pieces the backlog-on-GitHub-issues feature needs before `/capture` and `/tidy`'s behavior can change: the pure issue-payload library, a GitHub-Enterprise-safe remote-detection check (fixing a real bug in three places), and the `backlog-backend` CLAUDE.md flag that later phases will read.

**Architecture:** Three independent-but-sequenced pieces. Task 1 is pure JS (payload builders for inbox-stage and parked issues, plus a body-field extractor), unit-tested with `node --test`, following the exact emit-only pattern `bin/lib/code-health/issue-payload.js` and `bin/lib/issues/ingest.js` already establish (no network in library code — the skill's shell steps run `gh`). Tasks 2 and 3 are skill-markdown edits, not code — Task 2 fixes a GitHub Enterprise detection bug (a literal `github.com` string-match that false-negates on any Enterprise host) in three independent locations; Task 3 depends on Task 2 because it reuses the same fixed gate. Neither task produces unit-testable code, so their "tests" are concrete verification commands run against this repo's real, already-authenticated GitHub backend.

**Tech Stack:** Node.js (`node --test`, no external test framework — matches this repo's zero-runtime-npm-deps convention), Markdown (skill prose), `gh` CLI.

## Global Constraints

- No new npm runtime dependencies — this plugin ships zero runtime deps by design (see `bin/lib/policy.js`'s own comment: "No YAML dependency: the plugin ships zero runtime npm deps").
- Library code under `bin/lib/` is emit-only: pure functions, no `child_process`, no network. Skills run `gh` in shell steps and pass results to `node -e` snippets that `require()` these modules.
- Tests use `node:test` / `node:assert` only, placed under `bin/lib/issues/tests/`, run via `npm test` (which runs `node --test` over `tests/`, `bin/lib/code-health/tests/`, `bin/lib/issues/tests/`, `bin/lib/harness-health/tests/`).
- Label naming has no `claude-tweaks:` prefix — matches the existing bare-label convention (`code-health`, `harness-health`, `agent:go`).
- CLAUDE.md flags (not `.claude-tweaks/policy.yml`) follow the `design-integration`/`diagram-integration` pattern exactly: a `## {Name} integration` section, a flag line, a re-run/upgrade-path note, and explicit failure handling that never aborts the rest of `/init`.

---

### Task 1: `bin/lib/issues/backlog.js` — issue payload builders

**Files:**
- Create: `bin/lib/issues/backlog.js`
- Test: `bin/lib/issues/tests/backlog.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (no dependencies).
- Produces (for later phases): `categoryLabel(category)`, `inboxIssuePayload({ title, related, context, scope, category }) -> { title, body, labels }`, `parkedIssuePayload({ title, origin, context, trigger, optionsConsidered, category, watchedPaths? }) -> { title, body, labels }`, `extractWatchedPaths(body) -> string[] | null`, `CATEGORIES` (array of the four category strings). Phase 2 will `require()` these from `/claude-tweaks:capture` and `/claude-tweaks:tidy`'s shell steps via inline `node -e` snippets, the same way `flow/from-code-health.md` already does for `bin/lib/issues/ingest.js`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/backlog.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, CATEGORIES } = require('../backlog');

test('CATEGORIES lists the four backlog categories', () => {
  assert.deepStrictEqual(CATEGORIES, ['product', 'technical', 'legal', 'infrastructure']);
});

test('categoryLabel formats as backlog:category-<value>', () => {
  assert.strictEqual(categoryLabel('technical'), 'backlog:category-technical');
});

// ── inboxIssuePayload ────────────────────────────────────────────────────

const INBOX_INPUT = {
  title: 'Voice command to add item to shopping list',
  related: 'none',
  context: 'User asked for hands-free entry while cooking.',
  scope: 'Voice capture UI + parsing into existing shopping-list schema.',
  category: 'product',
};

test('inboxIssuePayload labels are backlog + backlog:category-<value>', () => {
  assert.deepStrictEqual(inboxIssuePayload(INBOX_INPUT).labels, ['backlog', 'backlog:category-product']);
});

test('inboxIssuePayload title is the entry title', () => {
  assert.strictEqual(inboxIssuePayload(INBOX_INPUT).title, INBOX_INPUT.title);
});

test('inboxIssuePayload body carries Related, Context, and Scope', () => {
  const { body } = inboxIssuePayload(INBOX_INPUT);
  assert.ok(body.includes('**Related:** none'));
  assert.ok(body.includes('Context: User asked for hands-free entry while cooking.'));
  assert.ok(body.includes('Scope: Voice capture UI + parsing into existing shopping-list schema.'));
});

test('inboxIssuePayload body has no Category prose — category lives in the label only', () => {
  const { body } = inboxIssuePayload(INBOX_INPUT);
  assert.ok(!body.includes('Category'));
});

test('inboxIssuePayload defaults Related to "none" when omitted', () => {
  const { body } = inboxIssuePayload({ ...INBOX_INPUT, related: undefined });
  assert.ok(body.includes('**Related:** none'));
});

// ── parkedIssuePayload ───────────────────────────────────────────────────

const PARKED_INPUT = {
  title: 'Fix flaky tests/statusline.test.js "render under 500ms" timing assertion',
  origin: 'Observed repeatedly during the Impeccable re-baseline work.',
  context: 'Passes in isolation but intermittently fails under full-suite load.',
  trigger: 'Revisit when someone next touches tests/statusline.test.js or the statusline renderer.',
  optionsConsidered: '(a) raise the timing budget; (b) mock the slow dependency; (c) move to a separate benchmark suite.',
  category: 'technical',
};

test('parkedIssuePayload labels are backlog + parked + backlog:category-<value>', () => {
  assert.deepStrictEqual(parkedIssuePayload(PARKED_INPUT).labels, ['backlog', 'parked', 'backlog:category-technical']);
});

test('parkedIssuePayload title is the entry title', () => {
  assert.strictEqual(parkedIssuePayload(PARKED_INPUT).title, PARKED_INPUT.title);
});

test('parkedIssuePayload body carries Origin, Context, Trigger, and Options considered', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.ok(body.includes('**Origin:** Observed repeatedly during the Impeccable re-baseline work.'));
  assert.ok(body.includes('Context: Passes in isolation but intermittently fails under full-suite load.'));
  assert.ok(body.includes('**Trigger:** Revisit when someone next touches tests/statusline.test.js or the statusline renderer.'));
  assert.ok(body.includes('Options considered: (a) raise the timing budget'));
});

test('parkedIssuePayload body omits Watched paths when not given', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.ok(!body.includes('Watched paths'));
});

test('parkedIssuePayload body includes Watched paths when given a non-empty array', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['tests/statusline.test.js', 'bin/statusline.js'] });
  assert.ok(body.includes('**Watched paths:** tests/statusline.test.js, bin/statusline.js'));
});

test('parkedIssuePayload body omits Watched paths when given an empty array', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: [] });
  assert.ok(!body.includes('Watched paths'));
});

test('parkedIssuePayload places Watched paths between Trigger and Options considered', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['a.js'] });
  const triggerIdx = body.indexOf('**Trigger:**');
  const watchedIdx = body.indexOf('**Watched paths:**');
  const optionsIdx = body.indexOf('Options considered:');
  assert.ok(triggerIdx < watchedIdx && watchedIdx < optionsIdx, 'expected Trigger < Watched paths < Options considered');
});

// ── extractWatchedPaths ──────────────────────────────────────────────────

test('extractWatchedPaths returns null when the field is absent', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.strictEqual(extractWatchedPaths(body), null);
});

test('extractWatchedPaths returns the trimmed path array when the field is present', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['tests/statusline.test.js', 'bin/statusline.js'] });
  assert.deepStrictEqual(extractWatchedPaths(body), ['tests/statusline.test.js', 'bin/statusline.js']);
});

test('extractWatchedPaths round-trips through parkedIssuePayload for a single path', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['a.js'] });
  assert.deepStrictEqual(extractWatchedPaths(body), ['a.js']);
});

test('extractWatchedPaths returns null for a body with other bold fields but no Watched paths', () => {
  assert.strictEqual(extractWatchedPaths('**Origin:** x\n\nContext: y'), null);
});

test('extractWatchedPaths returns null for non-string input', () => {
  assert.strictEqual(extractWatchedPaths(undefined), null);
  assert.strictEqual(extractWatchedPaths(null), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: FAIL — `Error: Cannot find module '../backlog'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/backlog.js`:

```javascript
// bin/lib/issues/backlog.js
// Pure: build GitHub issue payloads for the backlog (INBOX/DEFERRED) system, and
// extract the Watched paths field back out of a parked issue's body. The SKILL.md
// runs gh and passes results back — no network here.
// Contract: skills/_shared/issue-claims.md; design doc:
// docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md.
'use strict';

const CATEGORIES = ['product', 'technical', 'legal', 'infrastructure'];
const WATCHED_PATHS_RE = /^\*\*Watched paths:\*\*\s*(.+)$/m;

function categoryLabel(category) {
  return `backlog:category-${category}`;
}

// opts: { title, related, context, scope, category }
// Returns { title, body, labels } for a fresh inbox-stage issue.
function inboxIssuePayload({ title, related, context, scope, category }) {
  const body = [
    `**Related:** ${related || 'none'}`,
    '',
    `Context: ${context}`,
    '',
    `Scope: ${scope}`,
  ].join('\n');
  return { title, body, labels: ['backlog', categoryLabel(category)] };
}

// opts: { title, origin, context, trigger, optionsConsidered, category, watchedPaths? }
// watchedPaths, when a non-empty array, adds a **Watched paths:** field between
// Trigger and Options considered.
// Returns { title, body, labels } for a fresh parked issue (e.g. DEFERRED.md migration).
function parkedIssuePayload({ title, origin, context, trigger, optionsConsidered, category, watchedPaths }) {
  const lines = [
    `**Origin:** ${origin}`,
    '',
    `Context: ${context}`,
    '',
    `**Trigger:** ${trigger}`,
  ];
  if (Array.isArray(watchedPaths) && watchedPaths.length > 0) {
    lines.push('', `**Watched paths:** ${watchedPaths.join(', ')}`);
  }
  lines.push('', `Options considered: ${optionsConsidered}`);
  return { title, body: lines.join('\n'), labels: ['backlog', 'parked', categoryLabel(category)] };
}

// Extracts the **Watched paths:** field from a parked issue's body, comma-split and
// trimmed. Returns string[] or null when the field is absent or body isn't a string.
function extractWatchedPaths(body) {
  if (typeof body !== 'string') return null;
  const m = WATCHED_PATHS_RE.exec(body);
  if (!m) return null;
  return m[1].split(',').map((p) => p.trim()).filter(Boolean);
}

module.exports = { CATEGORIES, categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: PASS — all 19 tests green, 0 failures.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS except the pre-existing, unrelated `tests/statusline.test.js` "render under 500ms" flake under load (already tracked in `specs/DEFERRED.md` — not introduced by this change). If any *other* test fails, stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/backlog.js bin/lib/issues/tests/backlog.test.js
git commit -m "Add bin/lib/issues/backlog.js — inbox/parked issue payload builders"
```

---

### Task 2: Fix GitHub Enterprise detection (three locations)

**Files:**
- Modify: `skills/_shared/github-pr-scan.md` (Detection Ladder table)
- Modify: `skills/init/bootstrap-steps.md` (Step 9 gate, Step 14 gate)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (for Task 3): a GHE-safe two-tier gate description at Step 9 that Task 3's new Step 15 will reference by name ("same gate Step 9 uses").

**Context — the bug.** All three locations currently gate on `git remote get-url origin` output containing the literal substring `github.com`. A real GitHub Enterprise hostname like `github.mycompany.com` does **not** contain that substring as a contiguous match, so this always false-negates on GHE. `github-pr-scan.md`'s Detection Ladder already requires `gh` for its other two checks (installed, authenticated), so replacing its check #1 with a `gh repo view` capability probe costs nothing extra there. Steps 9 and 14 in `bootstrap-steps.md` are different: they gate a pure *file-write* (no `gh` needed to write a YAML template) — requiring `gh` there would be a new, unnecessary hard dependency, so they get a softer two-tier check instead: prefer `gh repo view` when `gh` is available (GHE-safe), fall back to "a remote exists" when it isn't (worst case: a non-GitHub git host sees an irrelevant offer and declines it — free of cost).

- [ ] **Step 1: Demonstrate the bug**

Run:

```bash
echo "https://github.mycompany.com/org/repo.git" | grep -o "github.com" || echo "OLD CHECK: false negative on a real GHE hostname"
```

Expected output: `OLD CHECK: false negative on a real GHE hostname` — confirming a realistic Enterprise hostname does not contain the literal substring `github.com`.

- [ ] **Step 2: Fix the Detection Ladder in `github-pr-scan.md`**

Read the current table (already confirmed at lines 11-13 of `skills/_shared/github-pr-scan.md`):

```markdown
| # | Check | Command | On failure, emit Finding / Evidence |
|---|-------|---------|-------------------------------------|
| 1 | GitHub remote exists | `git -C "{REPO_ROOT}" remote get-url origin` output contains `github.com` | `GitHub scan skipped` / `no GitHub remote` |
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |
| 3 | gh authenticated | `gh auth status` exits 0 | `GitHub scan skipped` / `gh not authenticated` |
```

Replace with:

```markdown
| # | Check | Command | On failure, emit Finding / Evidence |
|---|-------|---------|-------------------------------------|
| 1 | GitHub remote exists | `git -C "{REPO_ROOT}" remote get-url origin` exits 0 (any host — no longer string-matched against `github.com`, which false-negated on GitHub Enterprise hosts like `github.mycompany.com`) | `GitHub scan skipped` / `no GitHub remote` |
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |
| 3 | gh authenticated + repo reachable | `gh repo view --json owner,name` exits 0 (resolves the host from the remote automatically — works identically for github.com and GitHub Enterprise once authenticated for that host; replaces the old bare `gh auth status` check) | `GitHub scan skipped` / `gh not authenticated or repo unreachable` |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Fix Step 9's gate in `bootstrap-steps.md`**

Current text (lines 243-244):

```
Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`). Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
```

Replace with:

```
Offer only when the project has a GitHub-flavored remote — a two-tier check that stays
GHE-safe without requiring `gh` as a hard new dependency for what is otherwise a pure
file-write step: when `gh` is installed and authenticated, confirm via `gh repo view
--json owner,name` succeeding (works for GitHub Enterprise, not just github.com); when
`gh` isn't available, fall back to just checking a remote exists (`git remote get-url
origin` exits 0) — a non-GitHub git host would simply see the offer and decline it, which
costs nothing. Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Fix Step 14's gate in `bootstrap-steps.md`**

Current text (lines 611-612):

```
Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`) — same gate Step 9 uses. Check whether
```

Replace with:

```
Offer only when the project has a GitHub-flavored remote — same two-tier, GHE-safe gate
Step 9 uses (`gh repo view` when available, remote-exists fallback otherwise). Check
whether
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Verify against this repo's real GitHub backend**

Run:

```bash
gh repo view --json owner,name
```

Expected: succeeds, printing JSON with `owner`/`name` fields resolved from this repo's actual github.com remote — confirms the new check works for the true-positive case. (No live GitHub Enterprise host is available to test the true-positive-on-GHE path directly; this is a known, called-out limitation, not a gap in this task — same as the design doc's Testing section notes.)

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/init/bootstrap-steps.md
git commit -m "Fix GitHub Enterprise false-negative in three github.com string-match checks"
```

---

### Task 3: `backlog-backend` CLAUDE.md flag + `/init` Step 15

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (add Step 15)
- Modify: `CLAUDE.md` (dogfood the flag on this repo)

**Interfaces:**
- Consumes: Task 2's fixed Step 9 gate (referenced by name — this task must run after Task 2).
- Produces (for Phase 2): a `backlog-backend: github-issues | local-files` flag in CLAUDE.md that `/claude-tweaks:capture` and `/claude-tweaks:tidy` will read in Phase 2's implementation.

- [ ] **Step 1: Add Step 15 to `bootstrap-steps.md`**

Append after Step 14 (which currently ends the file at line 663). Read the file first to confirm the exact ending, then append:

```markdown

---

### Step 15 — Backlog Backend (detailed procedure)

`/claude-tweaks:capture` and `/claude-tweaks:tidy` back the INBOX/DEFERRED backlog with
either GitHub issues or the classic local markdown files
(`specs/INBOX.md`/`specs/DEFERRED.md`). Decide the backend once here so every future
capture/defer/tidy run is consistent — no split-brain between issue-backed and
file-backed entries for the same repo.

**Gate:** run the same GHE-safe two-tier check Step 9 uses. When it succeeds (a
GitHub-flavored remote is reachable), default the recommendation to option 1 below;
otherwise default to option 2.

**Present:**

```
How should claude-tweaks store captured ideas and deferred work?

1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /flow --from-label and --from-milestone
2. Local markdown files (specs/INBOX.md, specs/DEFERRED.md) — no GitHub dependency
```

**Write the flag to CLAUDE.md.** Add (or update) a `## Backlog integration` section:

```markdown
## Backlog integration

backlog-backend: github-issues
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (GitHub issues) | `github-issues` |
| Option 2 (Local files) | `local-files` |

`/claude-tweaks:capture` and `/claude-tweaks:tidy` read this flag to decide where a new
entry lands. Missing flag is treated identically to `local-files` — the GitHub-backed
path only activates when explicitly enabled by `/init`, matching `design-integration`'s
missing-flag convention.

**Re-run behavior (Update-Mode drift).** When `/init` is re-run on a project where
`backlog-backend: github-issues` is already set, this step is a no-op. When the flag is
`local-files`, re-run the Gate check — if a GitHub remote has since become available (the
project was local-only at the last `/init` and has since been pushed), offer the upgrade
path back to `github-issues`. When the flag is **missing** (pre-this-feature projects),
present the first-run prompt above — same as a fresh init.

**Failure handling:** if writing the CLAUDE.md section fails, surface the failure and
continue `/init` — never abort the rest of bootstrap on this step.
```

Use the Write or Edit tool to append this block after the existing Step 14 content.

- [ ] **Step 2: Verify the new step reads consistently**

Run:

```bash
grep -n "^### Step 15" skills/init/bootstrap-steps.md
```

Expected: one match, `### Step 15 — Backlog Backend (detailed procedure)`.

Then re-read the full file's step list to confirm no duplicate or out-of-order headings:

```bash
grep -n "^### Step" skills/init/bootstrap-steps.md
```

Expected: Steps 1 through 15, in order, each appearing exactly once.

- [ ] **Step 3: Dogfood the flag on this repo's own CLAUDE.md**

This repo (`claude-tweaks`) has a real, already-authenticated github.com remote (confirmed earlier: `gh auth status` shows logged in, `git remote -v` shows `https://github.com/thomasholknielsen/claude-tweaks.git`), so `github-issues` is the correct value per the Gate's own recommendation logic. Setting it now gives Phase 2/3 a real flag to implement and test against without a live `/init` interview.

Read `CLAUDE.md`, locate the `## Commands` section (ends before `## Don'ts`), and insert a new section between them:

```markdown
## Backlog integration

backlog-backend: github-issues
```

Use the Edit tool, anchoring on the existing `## Don'ts` heading as the insertion point (insert the new section immediately before it, with the existing blank line separating sections preserved).

- [ ] **Step 4: Verify the flag was written correctly**

Run:

```bash
grep -A2 "^## Backlog integration" CLAUDE.md
```

Expected:

```
## Backlog integration

backlog-backend: github-issues
```

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS except the pre-existing, unrelated `tests/statusline.test.js` timing flake (see Task 1 Step 5's note — unchanged by this task).

- [ ] **Step 6: Commit**

```bash
git add skills/init/bootstrap-steps.md CLAUDE.md
git commit -m "Add /init Step 15 (backlog-backend flag) and set it on this repo"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design doc's "Issue body templates" section (both templates as pure functions) and the emit-only architecture note. Task 2 covers the "GitHub Enterprise detection fix" section, widened to all three locations per the follow-up discussion. Task 3 covers the "Backend selection (CLAUDE.md flag)" section including the CLAUDE.md-not-policy.yml correction. Phase 1 deliberately does **not** cover `/capture`/`/tidy` behavior changes, the resilient local fallback, migration, or the lifecycle labels (`parked`, `status:in-progress`, `recon-was-parked`) — those are Phase 2 and Phase 3's scope per the phased-plan decomposition.
- **Type consistency:** `inboxIssuePayload`/`parkedIssuePayload`/`extractWatchedPaths`/`categoryLabel`/`CATEGORIES` are the exact export names used consistently across Task 1's implementation, its tests, and the Interfaces block Phase 2 will consume.
- **No placeholders:** every step above has complete, runnable code or an exact markdown diff — no "TBD," no "add appropriate handling."
