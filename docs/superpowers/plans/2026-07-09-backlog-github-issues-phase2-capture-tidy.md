# Backlog on GitHub Issues — Phase 2: Capture + Tidy on the New Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:capture` and `/claude-tweaks:tidy` actually read and act on the `backlog-backend` flag Phase 1 introduced — captures create GitHub issues instead of appending to `specs/INBOX.md`, tidy's scan and triage actions operate on `backlog`-labeled issues, and existing `specs/INBOX.md`/`specs/DEFERRED.md` content gets a migration path onto the new backend.

**Architecture:** Five tasks. Task 1 extends the pure payload library from Phase 1 with a classification helper (issue JSON in, structured fields out — no network) that the scan side needs to split `backlog`-labeled issues into inbox/parked buckets without ad hoc `jq`. Task 2 makes `/claude-tweaks:capture` backend-aware (create an issue, falling back to the local file on failure). Task 3 folds one `backlog` issue query into `_shared/github-pr-scan.md`'s `repo-wide` scope (consumed by `/tidy` Step 4.8) and turns `/tidy`'s Steps 1/1.5 into a local-file "unsynced" check when the GitHub backend is active, so the two scans stay independently parallelizable. Task 4 rewrites `/tidy`'s Action Vocabulary table so Delete/Defer/Merge/Promote have GitHub-issue-based execution paths alongside the existing file-based ones, plus a new Sync to GitHub action. Task 5 fixes a now-stale future-tense claim in `/claude-tweaks:init` Step 15 and adds the one-time existing-content migration procedure the design doc specifies.

Only Task 3 has a hard code dependency (on Task 1's new export). Tasks 2, 4, and 5 are conceptually related but touch disjoint files with no shared interface — dispatch in numeric order for narrative clarity, but a reviewer rejecting Task 2 does not block Task 4 or 5.

**Tech Stack:** Node.js (`node --test`), Markdown (skill prose), `gh` CLI. No new dependencies.

## Global Constraints

- No new npm runtime dependencies — this plugin ships zero runtime deps by design.
- Library code under `bin/lib/` is emit-only: pure functions, no `child_process`, no network. Skills run `gh` in shell steps and pass results to `node -e` snippets that `require()` these modules — see `bin/lib/issues/backlog.js`'s existing `inboxIssuePayload`/`parkedIssuePayload`/`extractWatchedPaths`/`categoryLabel`/`CATEGORIES` exports (Phase 1) and this phase's new `classifyBacklogIssue` (Task 1).
- Tests use `node:test` / `node:assert` only, under `bin/lib/issues/tests/`, run via `npm test`.
- Label names (fixed by the design doc, no per-project config): `backlog`, `backlog:category-{product|technical|legal|infrastructure}`, `backlog:priority-{high|medium|low}`, `parked`. (`status:in-progress` is Phase 3 scope — do not add it in this phase.)
- Every new/changed label must be bootstrapped with a real description before first use: `gh label list --search "$LABEL" --json name -q '.[].name' | grep -qx "$LABEL" || gh label create "$LABEL" --description "$DESCRIPTION"` — exact pattern already established in `skills/code-health/SKILL.md` Step 9 and reused here.
- `backlog-backend` is read from CLAUDE.md's `## Backlog integration` section (not `.claude-tweaks/policy.yml`). A missing flag is treated identically to `local-files` — same missing-flag convention as `design-integration` (`skills/design/SKILL.md` Step 1, Layer 1).
- Every Action Vocabulary execution (existing or new) stays atomic: either fully executed or not at all. A "Sync to GitHub" or "Defer" mutation never removes/clears local content before the corresponding `gh` write has confirmed success.
- Component-Skill Contract conventions (Next Actions omission under `$PIPELINE_RUN_DIR`, etc.) are unaffected by this phase — do not touch them.
- `/claude-tweaks:specify`'s issue-ingestion path, `_shared/issue-claims.md`'s claim protocol, and the `parked`-removal-at-promotion lifecycle are explicitly **Phase 3** scope. Do not implement or partially implement them here — Task 4's Promote row must recommend `/claude-tweaks:specify #{n}` without attempting any label mutation at promotion time.

---

### Task 1: `classifyBacklogIssue` — pure issue classifier

**Files:**
- Modify: `bin/lib/issues/backlog.js`
- Modify: `bin/lib/issues/tests/backlog.test.js`

**Interfaces:**
- Consumes: `extractWatchedPaths` (already exported by this module from Phase 1).
- Produces (for Task 3): `classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url }) -> { number, title, stage: 'inbox'|'parked', category: string|null, priority: string|null, milestone: string|null, watchedPaths: string[]|null, updatedAt, url }`. `labels` accepts either `gh`'s `[{name: "..."}]` shape or a bare `string[]` (both appear across this codebase's `gh --json` call sites). `milestone` accepts `gh`'s `{title: "..."}` object or `null`.

- [ ] **Step 1: Write the failing tests**

Add to the top of `bin/lib/issues/tests/backlog.test.js`, updating the existing `require` line:

```javascript
const { categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, classifyBacklogIssue, CATEGORIES } = require('../backlog');
```

Append these tests at the end of the file:

```javascript
// ── classifyBacklogIssue ─────────────────────────────────────────────────

const OPEN_INBOX_ISSUE = {
  number: 101,
  title: 'Voice command to add item to shopping list',
  labels: [{ name: 'backlog' }, { name: 'backlog:category-product' }],
  body: '**Related:** none\n\nContext: came up in a call\n\nScope: needs a new intent',
  milestone: null,
  updatedAt: '2026-07-01T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/101',
};

const PARKED_ISSUE = {
  number: 102,
  title: 'Revisit /deepen boundary',
  labels: [{ name: 'backlog' }, { name: 'parked' }, { name: 'backlog:category-technical' }, { name: 'backlog:priority-low' }],
  body: '**Origin:** ADR 0001\n\nContext: shipped standalone\n\n**Trigger:** if skill count grows\n\nOptions considered: merge into /simplify',
  milestone: { title: 'Before launch' },
  updatedAt: '2026-06-14T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/102',
};

const PARKED_WITH_WATCHED_PATHS = {
  number: 103,
  title: 'Load-tolerant statusline perf assertion',
  labels: [{ name: 'backlog' }, { name: 'parked' }, { name: 'backlog:category-technical' }],
  body: '**Origin:** flake report\n\nContext: flakes under load\n\n**Trigger:** touching statusline.test.js\n\n**Watched paths:** tests/statusline.test.js, bin/statusline.js\n\nOptions considered: CPU time instead of wall clock',
  milestone: null,
  updatedAt: '2026-07-04T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/103',
};

test('classifyBacklogIssue: open backlog issue with no parked label is stage "inbox"', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).stage, 'inbox');
});

test('classifyBacklogIssue: issue carrying the parked label is stage "parked"', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).stage, 'parked');
});

test('classifyBacklogIssue extracts category from the backlog:category-* label', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).category, 'product');
});

test('classifyBacklogIssue category is null when no category label is present', () => {
  const noCategoryIssue = { ...OPEN_INBOX_ISSUE, labels: [{ name: 'backlog' }] };
  assert.strictEqual(classifyBacklogIssue(noCategoryIssue).category, null);
});

test('classifyBacklogIssue extracts priority from the backlog:priority-* label', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).priority, 'low');
});

test('classifyBacklogIssue priority is null when no priority label is present', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).priority, null);
});

test('classifyBacklogIssue surfaces the attached milestone title', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).milestone, 'Before launch');
});

test('classifyBacklogIssue milestone is null when none is attached', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).milestone, null);
});

test('classifyBacklogIssue extracts watchedPaths from the body via extractWatchedPaths', () => {
  assert.deepStrictEqual(classifyBacklogIssue(PARKED_WITH_WATCHED_PATHS).watchedPaths, ['tests/statusline.test.js', 'bin/statusline.js']);
});

test('classifyBacklogIssue watchedPaths is null when the body has no Watched paths field', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).watchedPaths, null);
});

test('classifyBacklogIssue passes through number, title, updatedAt, and url unchanged', () => {
  const result = classifyBacklogIssue(OPEN_INBOX_ISSUE);
  assert.strictEqual(result.number, 101);
  assert.strictEqual(result.title, 'Voice command to add item to shopping list');
  assert.strictEqual(result.updatedAt, '2026-07-01T00:00:00Z');
  assert.strictEqual(result.url, 'https://github.com/acme/repo/issues/101');
});

test('classifyBacklogIssue handles bare-string labels (not {name} objects)', () => {
  const bareLabels = { ...OPEN_INBOX_ISSUE, labels: ['backlog', 'backlog:category-product'] };
  const result = classifyBacklogIssue(bareLabels);
  assert.strictEqual(result.stage, 'inbox');
  assert.strictEqual(result.category, 'product');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: FAIL — `classifyBacklogIssue is not a function` (or similar `TypeError`/`ReferenceError` from the destructured `require`).

- [ ] **Step 3: Implement `classifyBacklogIssue`**

In `bin/lib/issues/backlog.js`, add before the final `module.exports` line:

```javascript
function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

// issue: { number, title, labels, body, milestone, updatedAt, url } — shaped like
// `gh issue list --json number,title,labels,body,milestone,updatedAt,url` output.
// Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
// watchedPaths, updatedAt, url } — category/priority/milestone/watchedPaths are null
// when absent.
function classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url }) {
  const names = labelNames(labels);
  const stage = names.includes('parked') ? 'parked' : 'inbox';
  const categoryLabelName = names.find((n) => n.startsWith('backlog:category-'));
  const priorityLabelName = names.find((n) => n.startsWith('backlog:priority-'));
  return {
    number,
    title,
    stage,
    category: categoryLabelName ? categoryLabelName.slice('backlog:category-'.length) : null,
    priority: priorityLabelName ? priorityLabelName.slice('backlog:priority-'.length) : null,
    milestone: milestone ? milestone.title : null,
    watchedPaths: extractWatchedPaths(body),
    updatedAt,
    url,
  };
}
```

Update the `module.exports` line at the bottom of the file:

```javascript
module.exports = { CATEGORIES, categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, classifyBacklogIssue };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: PASS — all tests green (19 existing from Phase 1 + 12 new = 31 tests). Verify the exact count: `grep -c "^test(" bin/lib/issues/tests/backlog.test.js` should print `31`.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js bin/lib/issues/tests/backlog.test.js
git commit -m "Add classifyBacklogIssue pure classifier to bin/lib/issues/backlog.js"
```

---

### Task 2: `/claude-tweaks:capture` — backend-aware entry creation

**Files:**
- Modify: `skills/capture/SKILL.md`

**Interfaces:**
- Consumes: `inboxIssuePayload({ title, related, context, scope, category })` from `bin/lib/issues/backlog.js` (already exists from Phase 1 — unchanged).
- Produces: nothing new for later tasks in this phase.

- [ ] **Step 1: Update the INBOX vs DEFERRED note**

Current text (near the top, after the "When to Use" section):

```markdown
> **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes to `specs/DEFERRED.md` instead — it carries origin context, file references, and timing triggers that INBOX entries don't have.
```

Replace with:

```markdown
> **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes through `/claude-tweaks:tidy`'s Defer action instead — `specs/DEFERRED.md` under `backlog-backend: local-files`, or the `parked` label under `backlog-backend: github-issues`. Either way it carries origin context, file references, and timing triggers that INBOX entries don't have.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Update the Workflow step table**

Current:

```markdown
## Workflow

| Step | What |
|------|------|
| 1 | Append entry to `specs/INBOX.md` per the Entry Format below. |
| 2 | Route per `--route` arg, or via the Routing Prompt below. |
| 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). |
```

Replace with:

```markdown
## Workflow

| Step | What |
|------|------|
| 1 | Add the entry — GitHub issue or `specs/INBOX.md` append, per Backend Selection below. |
| 2 | Route per `--route` arg, or via the Routing Prompt below. |
| 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). Issue-backend captures have nothing new to commit unless the fallback path wrote to `specs/INBOX.md`. |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Replace "File Location" with "Backend Selection", and update "Entry Format"**

Current:

````markdown
## File Location

`specs/INBOX.md` — single file, append-only during capture.

## Entry Format

```markdown
## [Short Title]

**Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

### Hard cap: ~5 lines per entry

If it takes more than 5 lines to describe, it's past the inbox stage — run `/superpowers:brainstorming` on it instead.

## Adding an Entry

1. Open `specs/INBOX.md`
2. Append new entry at the bottom
3. Don't overthink — capture the essence
````

Replace with:

````markdown
## Backend Selection

Read the `backlog-backend` field from the project's CLAUDE.md (under a `## Backlog integration` section, written by `/claude-tweaks:init` Step 15). A missing flag is treated as `local-files` — same missing-flag convention as `design-integration`.

**When `backlog-backend: github-issues`:**

1. Bootstrap the `backlog` label and the specific `backlog:category-<value>` label about to be used (not all four category labels up front). Two explicit blocks, not a packed-string loop — a `name:description` delimiter would collide with the literal `:` inside `backlog:category-<value>` itself:

   ```bash
   gh label list --search backlog --json name -q '.[].name' | grep -qx backlog || \
     gh label create backlog --description "Captured idea or deferred work, tracked via /claude-tweaks:capture and /claude-tweaks:tidy"

   CATEGORY_LABEL="backlog:category-${CATEGORY}"
   gh label list --search "$CATEGORY_LABEL" --json name -q '.[].name' | grep -qx "$CATEGORY_LABEL" || \
     gh label create "$CATEGORY_LABEL" --description "${CATEGORY}-category backlog item"
   ```

2. Build the payload and create the issue (`$TITLE`/`$RELATED`/`$CONTEXT`/`$SCOPE`/`$CATEGORY` are the same fields the Entry Format below has always asked for — only their destination changed):

   ```bash
   node -e "const {inboxIssuePayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
     const p=inboxIssuePayload({title:process.argv[1],related:process.argv[2],context:process.argv[3],scope:process.argv[4],category:process.argv[5]});
     require('fs').writeFileSync('/tmp/capture-payload.json', JSON.stringify(p))" "$TITLE" "$RELATED" "$CONTEXT" "$SCOPE" "$CATEGORY"

   gh issue create \
     --title "$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-payload.json','utf8')).title)")" \
     --body "$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-payload.json','utf8')).body)")" \
     --label backlog \
     --label "backlog:category-$CATEGORY"
   ```

3. **On failure** (GitHub unreachable, `gh` broken, transient API error): fall back to the local-files path below and tell the user issue creation failed and the entry landed in `specs/INBOX.md` instead. No special marker is needed — `/claude-tweaks:tidy`'s scan already treats any non-empty `specs/INBOX.md` content as unsynced once `backlog-backend: github-issues`, and offers a Sync to GitHub action to resolve it later.

**When `backlog-backend: local-files` (or the flag is missing):**

Append the entry to `specs/INBOX.md` per the Entry Format below — unchanged from today.

## Entry Format

**`backlog-backend: github-issues`** — issue title = short entry title; issue body:

```markdown
**Related:** {optional spec numbers or "none"}

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

Category is a label (`backlog:category-{product|technical|legal|infrastructure}`), not body prose.

**`backlog-backend: local-files`** — same fields, appended to `specs/INBOX.md`:

```markdown
## [Short Title]

**Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

### Hard cap: ~5 lines per entry

If it takes more than 5 lines to describe, it's past the inbox stage — run `/superpowers:brainstorming` on it instead. Applies to both backends.

## Adding an Entry

**`github-issues`:** run Backend Selection above; don't overthink — capture the essence.

**`local-files`:**
1. Open `specs/INBOX.md`
2. Append new entry at the bottom
3. Don't overthink — capture the essence
````

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Add route-execution-by-backend table after the Routing Prompt options**

Current text (immediately after the four `AskUserQuestion` options and their explanatory line, before "This ensures every captured idea has an explicit next step"):

```markdown
> **Option 4 visibility:** Only show option 4 when a spec name in `specs/` matches the topic keywords from the INBOX item. Without a candidate match, option 4 is omitted entirely — manual disambiguation against an unspecified spec number is worse than no option at all.

This ensures every captured idea has an explicit next step — either immediate action or a conscious decision to park it.
```

Replace with:

```markdown
> **Option 4 visibility:** Only show option 4 when a spec name in `specs/` matches the topic keywords from the INBOX item. Without a candidate match, option 4 is omitted entirely — manual disambiguation against an unspecified spec number is worse than no option at all.

### Route execution, by backend

| Route | `local-files` | `github-issues` |
|---|---|---|
| `challenge` / `brainstorm` | Opens the child skill with the INBOX entry text as input | Opens the child skill with the issue title + body as input (reference `#{issue-number}`) |
| `inbox` (keep) | No further action — entry stays in `specs/INBOX.md` | No further action — the issue is already open, `backlog`-labeled, with no `parked` label. That **is** the inbox state; there is nothing to add. |
| `merge:N` | Integrate into spec N's Deliverables/AC/Technical Approach, remove entry from `specs/INBOX.md` | Integrate into spec N the same way, then `gh issue close --reason "not planned"` and comment naming the target spec (`Merged into spec {N}.`) — mirrors `/claude-tweaks:tidy`'s Merge action |

This ensures every captured idea has an explicit next step — either immediate action or a conscious decision to park it.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Update Next Actions Option 3 wording**

Current:

```markdown
- Option 3 — `label`: `"Specify"`, `description`: `"/claude-tweaks:specify \"{title}\" — promote this idea straight to a spec (uses the entry's title — INBOX entries are addressed by title, not numeric index)"`
```

Replace with:

```markdown
- Option 3 — `label`: `"Specify"`, `description`: `"/claude-tweaks:specify {ref} — promote this idea straight to a spec ({ref} is '#{issue-number}' under backlog-backend: github-issues, or the entry's quoted title under local-files)"`
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 6: Verify against this repo's real GitHub backend**

This repo already has `backlog-backend: github-issues` set (Phase 1). Confirm the label-bootstrap commands are syntactically correct and idempotent:

```bash
CATEGORY=technical
gh label list --search backlog --json name -q '.[].name' | grep -qx backlog || \
  gh label create backlog --description "Captured idea or deferred work, tracked via /claude-tweaks:capture and /claude-tweaks:tidy"

CATEGORY_LABEL="backlog:category-${CATEGORY}"
gh label list --search "$CATEGORY_LABEL" --json name -q '.[].name' | grep -qx "$CATEGORY_LABEL" || \
  gh label create "$CATEGORY_LABEL" --description "${CATEGORY}-category backlog item"

gh label list --search backlog --json name,description
```

Expected: prints `backlog` and `backlog:category-technical`, each with a non-empty `description` — confirms both labels are created correctly. Do **not** run an actual `gh issue create` here — that would create real noise in this repo's issue tracker outside of a real capture; the label bootstrap is the verifiable side effect for this task.

- [ ] **Step 7: Commit**

```bash
git add skills/capture/SKILL.md
git commit -m "Make /claude-tweaks:capture backend-aware: create GitHub issues under backlog-backend: github-issues"
```

---

### Task 3: Scan side — fold backlog issues into `github-pr-scan.md`, make `/tidy` Steps 1/1.5 backend-aware

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/tidy/scan-procedures.md`
- Modify: `skills/tidy/SKILL.md` (Step table only)

**Interfaces:**
- Consumes: `classifyBacklogIssue` from `bin/lib/issues/backlog.js` (Task 1).
- Produces: `[inbox]` / `[deferred]` / `[unsynced]` rows in the same shape Step 6 of `tidy/SKILL.md` already renders — Task 4 updates what recommendations those rows can carry (Sync to GitHub), not the row format itself.

- [ ] **Step 1: Add the backlog-issues query to `github-pr-scan.md`'s `repo-wide` scope**

Current end of the `repo-wide` scope's numbered list (item 5, immediately before the "Findings and recommendations" table):

```markdown
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.

Findings and recommendations (tidy Action Vocabulary):
```

Replace with:

````markdown
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.
6. **Backlog issues** (only when the calling skill's `backlog-backend` is `github-issues` — the dispatcher passes this in) — `gh issue list --label backlog --state open --json number,title,body,labels,milestone,updatedAt,url`, then classify each issue:

   ```bash
   node -e "const {classifyBacklogIssue}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
     const issues=JSON.parse(require('fs').readFileSync(0,'utf8'));
     console.log(JSON.stringify(issues.map(classifyBacklogIssue)))" < /tmp/backlog-issues.json
   ```

   One query, split client-side by `stage` (`inbox` / `parked`) — not two separate queries.

Findings and recommendations (tidy Action Vocabulary):
````

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Add backlog-issue rows to the findings table**

Current end of the findings table (immediately before the closing `Emit `[pr]` and `[gh-issue]` rows per the Output Contract.` line):

```markdown
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:harness-health --target <name> --kind <skill\|rule\|claude-md>` to re-judge |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract.
```

Replace with:

```markdown
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:harness-health --target <name> --kind <skill\|rule\|claude-md>` to re-judge |
| Backlog issue, stage `inbox`, age per Staleness Thresholds | `< 2 weeks`: Keep. `2-4 weeks`: Keep (unless clearly stale). `> 4 weeks`: Delete or Promote — judgment call, same as `/tidy`'s file-based INBOX audit |
| Backlog issue, stage `parked`, milestone attached | Trigger met when the milestone is due/closed — Promote. Otherwise Keep. |
| Backlog issue, stage `parked`, `watchedPaths` present | Trigger met when `git log` shows recent commits touching any watched path — Promote. Otherwise Keep. |
| Backlog issue, stage `parked`, neither milestone nor `watchedPaths` | Prose-only `**Trigger:**` in the body, judged live each sweep — same as today's file-based DEFERRED audit |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract — **except** backlog-issue findings, which emit `[inbox]` / `[deferred]` rows instead (see Output Contract below), reusing `/tidy`'s existing file-scan prefixes so Step 6 renders them into the Actions table exactly like the rows they replace.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Update the Output Contract section**

Current:

```markdown
## Output Contract

Two collection prefixes, emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
```

Replace with:

```markdown
## Output Contract

Two collection prefixes for PR/code-health/harness-health findings, plus two conditional ones for backlog findings (`repo-wide` scope only, `backlog-backend: github-issues` only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[inbox]` — backlog issue, stage `inbox`: `[inbox] {title} — {age} — {recommendation}` (mirrors `/tidy` Step 1's file-based row shape exactly)
- `[deferred]` — backlog issue, stage `parked`: `[deferred] {title} — from issue #{n} — {recommendation}` (mirrors `/tidy` Step 1.5's file-based row shape; `#{n}` stands in for `spec {N}` since a parked issue has no originating spec)
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Make `scan-procedures.md` Step 1 backend-aware**

Current:

```markdown
## Step 1: Audit the INBOX

Read `specs/INBOX.md` and classify each entry:

| Age | Classification | Default Recommendation |
|-----|---------------|----------------------|
| < 2 weeks | Fresh | Keep |
| 2-4 weeks | Review | Keep (unless clearly stale) |
| > 4 weeks | Stale | Delete or Promote |

→ Collect each as: `[inbox] {title} — {age} — {recommendation}`
```

Replace with:

```markdown
## Step 1: Audit the INBOX

First, read the `backlog-backend` field from the project's CLAUDE.md (`## Backlog integration` section). A missing flag = `local-files`.

**`backlog-backend: local-files` (or missing):** unchanged — read `specs/INBOX.md` and classify each entry:

| Age | Classification | Default Recommendation |
|-----|---------------|----------------------|
| < 2 weeks | Fresh | Keep |
| 2-4 weeks | Review | Keep (unless clearly stale) |
| > 4 weeks | Stale | Delete or Promote |

→ Collect each as: `[inbox] {title} — {age} — {recommendation}`

**`backlog-backend: github-issues`:** the GitHub-side inbox scan runs inside Step 4.8's `repo-wide` backlog-issues query instead (one query shared with Step 1.5, split client-side by stage) — this step does not re-query GitHub. Instead, read `specs/INBOX.md` and flag any non-empty entry found there as unsynced — under this backend, a local-file entry existing at all means an issue-creation write failed or a migration was declined, per the Resilient local fallback design:

→ Collect each as: `[unsynced] {title} — local-only, not yet mirrored to GitHub — Sync to GitHub`

An empty `specs/INBOX.md` (only the `# Inbox` header, no entries) produces no findings.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Make `scan-procedures.md` Step 1.5 backend-aware**

Current:

```markdown
## Step 1.5: Audit Deferred Work

Read `specs/DEFERRED.md` and classify each entry:

| Trigger Status | Default Recommendation |
|---------------|----------------------|
| Trigger met (referenced spec complete) | Promote to spec or merge |
| Trigger not met, < 4 weeks | Keep |
| Trigger not met, > 4 weeks | Re-evaluate or delete |
| No clear trigger | Move to INBOX or delete |

→ Collect each as: `[deferred] {title} — from spec {N} — {recommendation}`
```

Replace with:

```markdown
## Step 1.5: Audit Deferred Work

**`backlog-backend: local-files` (or missing):** unchanged — read `specs/DEFERRED.md` and classify each entry:

| Trigger Status | Default Recommendation |
|---------------|----------------------|
| Trigger met (referenced spec complete) | Promote to spec or merge |
| Trigger not met, < 4 weeks | Keep |
| Trigger not met, > 4 weeks | Re-evaluate or delete |
| No clear trigger | Move to INBOX or delete |

→ Collect each as: `[deferred] {title} — from spec {N} — {recommendation}`

**`backlog-backend: github-issues`:** the GitHub-side parked scan runs inside Step 4.8, same as Step 1's equivalent note. Read `specs/DEFERRED.md` and flag any non-empty entry as unsynced, same rule as Step 1:

→ Collect each as: `[unsynced] {title} — local-only, not yet mirrored to GitHub — Sync to GitHub`

An empty `specs/DEFERRED.md` (only the `# Deferred Work` header, no entries) produces no findings.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 6: Add `[unsynced]` to the Collection routing table**

Current (bottom of `scan-procedures.md`):

```markdown
## Collection routing

| Collection prefix | Renders in Step 6 table | Notes |
|---|---|---|
| `[inbox]`, `[deferred]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]` | Actions table | Each row gets a pre-filled recommendation. |
| `[pattern]` | Cross-Spec Patterns table | Informational; presented separately. |
| `[health]` | Summary section | Project-level observations. |
```

Replace with:

```markdown
## Collection routing

| Collection prefix | Renders in Step 6 table | Notes |
|---|---|---|
| `[inbox]`, `[deferred]`, `[unsynced]`, `[spec]`, `[dependency]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[claim]`, `[pr]`, `[gh-issue]` | Actions table | Each row gets a pre-filled recommendation. |
| `[pattern]` | Cross-Spec Patterns table | Informational; presented separately. |
| `[health]` | Summary section | Project-level observations. |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 7: Update the Step/Data-source table in `tidy/SKILL.md`**

Current (first two data rows of the table):

```markdown
| 1 | `specs/INBOX.md` | `[inbox]` |
| 1.5 | `specs/DEFERRED.md` | `[deferred]` |
```

Replace with:

```markdown
| 1 | `specs/INBOX.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[inbox]` / `[unsynced]` |
| 1.5 | `specs/DEFERRED.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[deferred]` / `[unsynced]` |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 8: Verify**

Run the full suite to confirm Task 1's tests (consumed here) still pass and nothing else broke:

```bash
npm test 2>&1 | tail -10
```

Expected: same pass count as Task 1's Step 4 baseline plus no new failures (the known flaky `tests/statusline.test.js` timing assertion may still intermittently fail under load — not a regression from this task).

Sanity-check the new `node -e` snippet added to `github-pr-scan.md` against a synthetic payload (no real `gh` call — this only proves the snippet is syntactically correct and produces the expected shape):

```bash
echo '[{"number":1,"title":"t","body":"","labels":[{"name":"backlog"}],"milestone":null,"updatedAt":"2026-01-01T00:00:00Z","url":"https://x"}]' | \
  node -e "const {classifyBacklogIssue}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
    const issues=JSON.parse(require('fs').readFileSync(0,'utf8'));
    console.log(JSON.stringify(issues.map(classifyBacklogIssue)))"
```

Run with `CLAUDE_PLUGIN_ROOT` set to this repo's root, e.g.:

```bash
CLAUDE_PLUGIN_ROOT="$(pwd)" bash -c '
echo "[{\"number\":1,\"title\":\"t\",\"body\":\"\",\"labels\":[{\"name\":\"backlog\"}],\"milestone\":null,\"updatedAt\":\"2026-01-01T00:00:00Z\",\"url\":\"https://x\"}]" | \
  node -e "const {classifyBacklogIssue}=require(process.env.CLAUDE_PLUGIN_ROOT+\"/bin/lib/issues/backlog.js\");
    const issues=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"));
    console.log(JSON.stringify(issues.map(classifyBacklogIssue)))"
'
```

Expected: prints `[{"number":1,"title":"t","stage":"inbox","category":null,"priority":null,"milestone":null,"watchedPaths":null,"updatedAt":"2026-01-01T00:00:00Z","url":"https://x"}]`.

- [ ] **Step 9: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/tidy/scan-procedures.md skills/tidy/SKILL.md
git commit -m "Fold backlog issue scanning into github-pr-scan.md repo-wide scope; make /tidy Steps 1/1.5 backend-aware"
```

---

### Task 4: `/claude-tweaks:tidy` — backend-aware Action Vocabulary + Sync to GitHub

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: `inboxIssuePayload`, `parkedIssuePayload` from `bin/lib/issues/backlog.js` (Phase 1, unchanged); `[inbox]`/`[deferred]`/`[unsynced]` rows from Task 3.
- Produces: nothing new for later tasks in this phase. Task 5 documents parallel (not shared-code) logic for the migration procedure.

- [ ] **Step 1: Update the Input section**

Current:

```markdown
`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.
```

Replace with:

```markdown
`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Replace the Action Vocabulary table**

Current:

```markdown
| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | Remove entry from source file | Yes |
| **Defer** | Valid but not timely — park with a trigger condition | (1) Add to `specs/DEFERRED.md` with `**Deferred:** {date} \| **From:** {source} \| **Trigger:** {condition}`, (2) remove from source | Yes — moves to DEFERRED.md |
| **Merge** | Scope belongs in an existing spec | (1) Integrate scope into target spec's **Deliverables**, **Acceptance Criteria**, and **Technical Approach** — not as an appendix, as first-class spec content, (2) update target spec's `Last Updated`, (3) remove from source | Yes |
| **Promote** | Ready for the brainstorm → specify pipeline | Tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX | No — stays in INBOX with tag |
| **Keep** | No action needed | None | No |
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Add a structured entry to `specs/INBOX.md` referencing the PR/thread/issue URL | No — creates an INBOX entry |
```

Replace with:

```markdown
| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | `local-files`: remove entry from source file. `github-issues`: `gh issue close --reason "not planned"` + comment explaining why. | Yes (file) / issue closes (GitHub) |
| **Defer** | Valid but not timely — park with a trigger condition | `local-files`: (1) add to `specs/DEFERRED.md` with `**Deferred:** {date} \| **From:** {source} \| **Trigger:** {condition}`, (2) remove from source. `github-issues`: (1) build the parked body via `parkedIssuePayload` (origin = the inbox issue's own reference, context carried over, trigger + options considered supplied at triage), write it to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (same check-then-create pattern as `backlog`), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach, (5) if the trigger names specific files, pass them as `watchedPaths` to `parkedIssuePayload` in step (1) so the generated body already carries `**Watched paths:**` | Yes (file) / issue stays open, relabeled (GitHub) |
| **Merge** | Scope belongs in an existing spec | Both backends: (1) integrate scope into target spec's **Deliverables**, **Acceptance Criteria**, and **Technical Approach** — not as an appendix, as first-class spec content, (2) update target spec's `Last Updated`. `local-files`: (3) remove from source. `github-issues`: (3) `gh issue close --reason "not planned"` + comment naming the target spec (`Merged into spec {N}.`) | Yes (file) / issue closes (GitHub) |
| **Promote** | Ready for the brainstorm → specify pipeline | `local-files`: tag in INBOX as `**Promoted:** {date} — awaiting brainstorm`. Do NOT remove from INBOX. `github-issues`: no mutation — the open issue is already the durable pointer; recommend `/claude-tweaks:specify #{n}` directly (existing issue-ingestion path). Removing `parked` at promotion (and restoring it on decline) is Phase 3 scope — not yet implemented. | No (file, stays tagged) / No (issue, stays open) |
| **Keep** | No action needed | None | No |
| **Sync to GitHub** | A local `specs/INBOX.md`/`specs/DEFERRED.md` entry exists while `backlog-backend: github-issues` — mirror it to an issue now | INBOX entry: build via `inboxIssuePayload` (category parsed from the entry's `**Category:**` field), bootstrap labels, `gh issue create` with `backlog` + `backlog:category-<value>` labels. DEFERRED entry: judge trigger type live — names files → pass as `watchedPaths`; names a moment in time → build via `parkedIssuePayload` then attach/create a milestone; otherwise carry the prose `**Trigger:**` over unchanged — build via `parkedIssuePayload`, `gh issue create` with `backlog` + `parked` + category labels. Either way: remove the entry from the local file only after `gh issue create` confirms success. | Yes — moves to GitHub, removed from local file |
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Add a structured entry to `specs/INBOX.md` referencing the PR/thread/issue URL | No — creates an INBOX entry |

`Capture`, `Close (GitHub)`, and `Resolve thread` are unaffected by `backlog-backend` — they're not part of the backlog-issues design (`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`).
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 3: Add an atomicity anti-pattern for Sync to GitHub**

Current Anti-Patterns table row order (find this exact row):

```markdown
| Committing without running verification | Always verify every action landed (Step 7.5) before committing. Partial execution creates orphaned or lost items. |
```

Replace with:

```markdown
| Committing without running verification | Always verify every action landed (Step 7.5) before committing. Partial execution creates orphaned or lost items. |
| Clearing a local entry before `gh issue create` confirms success | Sync to GitHub and Defer (`github-issues` backend) both write to GitHub before touching the local file — if the local entry is removed first and the GitHub write fails, the item is lost entirely, not just unsynced. |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 4: Add "Defer" and "Sync to GitHub" rows to the Step 6 auto-mode aggressiveness table**

Current (find the `**Merge**` and `**Promote**` rows in the aggressiveness table):

```markdown
| **Merge** (INBOX item overlaps existing spec) | Stage | Auto-apply | Auto-apply |
| **Promote** (ready for brainstorm pipeline) | Stage | Stage | Auto-apply |
```

Replace with:

```markdown
| **Merge** (INBOX item overlaps existing spec) | Stage | Auto-apply | Auto-apply |
| **Promote** (ready for brainstorm pipeline) | Stage | Stage | Auto-apply |
| **Defer** (`local-files` — pure file move) | Stage | Auto-apply | Auto-apply |
| **Defer** (`github-issues` — label + possible milestone creation, outward-facing) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Sync to GitHub** (local entry exists under `backlog-backend: github-issues`) | Stage | Stage | Stage — creates GitHub-visible state; never auto-applied per the auto-mode contract's reversibility floor |
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 5: Update the interactive-mode report template's example rows**

Current (the example Actions table in the "Interactive mode (batch approval)" section, rows 5-6 plus the row immediately after row 13):

```markdown
| 5 | INBOX | "{title}" (valid, not timely) | Defer — trigger: {condition} |
| 6 | Deferred | "{title}" (trigger met) | Promote — move to INBOX for brainstorm |
```

Replace with:

```markdown
| 5 | INBOX | "{title}" (valid, not timely) | Defer — trigger: {condition} |
| 6 | Deferred | "{title}" (trigger met) | Promote — ready for brainstorm/specify |
```

Use the Edit tool with this exact old_string/new_string pair.

Then, current (the last row of the same table, row 13, immediately before the `### Cross-Spec Patterns` heading):

```markdown
| 13 | Branch | "build/{name}" (merged) | Delete |

### Cross-Spec Patterns (if any)
```

Replace with:

```markdown
| 13 | Branch | "build/{name}" (merged) | Delete |
| 14 | INBOX (unsynced) | "{title}" — local-only under `backlog-backend: github-issues` | Sync to GitHub |

### Cross-Spec Patterns (if any)
```

Use the Edit tool with this exact old_string/new_string pair. (The Cross-Spec Patterns table below already starts its own example numbering at 14/15 — leave it as-is; the report's real rendering numbers rows sequentially at runtime, these are illustrative placeholders only, matching the existing convention where this template's numbers are not literally continuous with a runtime report.)

- [ ] **Step 6: Add Sync-to-GitHub and Defer(github-issues) lines to the Step 7.5 verification checklist**

Current:

```markdown
- [x] Deferred: "{title}" — in DEFERRED.md (trigger: {condition}), removed from INBOX
```

Replace with:

```markdown
- [x] Deferred: "{title}" — in DEFERRED.md (trigger: {condition}), removed from INBOX (`local-files`)
- [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
- [x] Synced to GitHub: "{title}" — issue #{n} created ({backlog|backlog+parked} labels), removed from {INBOX.md|DEFERRED.md}
```

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 7: Verify**

Run:

```bash
npm test 2>&1 | tail -10
```

Expected: no regressions (this task only edits `skills/tidy/SKILL.md`, which has no unit tests — this run confirms Task 1/3's JS changes are still intact).

Grep-verify every new row landed:

```bash
grep -c "Sync to GitHub" skills/tidy/SKILL.md
```

Expected: `4` or more (Action Vocabulary row, aggressiveness table row, example Actions table row, Step 7.5 checklist line).

- [ ] **Step 8: Commit**

```bash
git add skills/tidy/SKILL.md
git commit -m "Add backend-aware Action Vocabulary execution + Sync to GitHub action to /claude-tweaks:tidy"
```

---

### Task 5: `/claude-tweaks:init` Step 15 — present-tense fix + existing-content migration

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Consumes: `inboxIssuePayload`, `parkedIssuePayload` from `bin/lib/issues/backlog.js` (Phase 1, unchanged).
- Produces: nothing new for later phases.

- [ ] **Step 1: Fix the future-tense claim and insert the migration procedure**

Current (Step 15's text, from the flag-value table through the start of "Re-run behavior"):

```markdown
Once implemented, `/claude-tweaks:capture` and `/claude-tweaks:tidy` will read this flag
to decide where a new entry lands — see the backlog-on-GitHub-issues design doc
(`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`) for Phase 2/3 of
that work. Missing flag is treated identically to `local-files` — the GitHub-backed path
only activates when explicitly enabled by `/init`, matching `design-integration`'s
missing-flag convention.

**Re-run behavior (Update-Mode drift).** When `/init` is re-run on a project where
```

Replace with:

````markdown
`/claude-tweaks:capture` and `/claude-tweaks:tidy` read this flag to decide where a new
entry lands and how backlog items are triaged — see the backlog-on-GitHub-issues design
doc (`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`) for the full
mechanics (Phase 3 still owes the `parked`/`status:in-progress` lifecycle-label wiring at
promotion and claim acquisition). Missing flag is treated identically to `local-files` —
the GitHub-backed path only activates when explicitly enabled by `/init`, matching
`design-integration`'s missing-flag convention.

**Existing-content migration.** Whenever this step newly sets `backlog-backend:
github-issues` (fresh init choosing option 1, first run on a pre-existing project, or the
upgrade path below) and `specs/INBOX.md` and/or `specs/DEFERRED.md` contain entries beyond
their header line, offer a one-time batch migration before finishing this step:

```
Found {X} INBOX item(s) and {Y} deferred item(s) in local files. Migrate them to GitHub
issues now?

1. Migrate all (Recommended) — creates {X+Y} issues, then clears the local files
2. Skip — leave the files as-is; /claude-tweaks:tidy will flag every entry as
   unsynced on its next run and offer the same migration per-item
```

On "Migrate all": for each `specs/INBOX.md` entry, build the payload via `inboxIssuePayload`
(category parsed from the entry's `**Category:**` field) and `gh issue create` with
`backlog` + `backlog:category-<value>` labels. For each `specs/DEFERRED.md` entry, judge
trigger type the same way `/claude-tweaks:tidy`'s Defer action would judge it live: names
specific files → pass as `watchedPaths` to `parkedIssuePayload`; names a moment in time →
build via `parkedIssuePayload` without `watchedPaths`, then attach/create a GitHub
Milestone (`gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence,
`gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create,
`gh issue edit {n} --milestone "{name}"` to attach); otherwise build via
`parkedIssuePayload` with the prose `**Trigger:**` carried over unchanged. Every
`parkedIssuePayload`-built issue gets `backlog` + `parked` + category labels. Bootstrap
the `backlog`, `parked`, and each used `backlog:category-<value>` label with a real
description first (check-then-create, same pattern as Step 9's `.github/ISSUE_TEMPLATE`
bootstrap). Present the batch as a table (entry → resulting issue number) before clearing
the source files — this is the same batch-table + apply-all/override interaction
`/claude-tweaks:tidy` Step 6 already uses, not a new UI pattern.

Clear `specs/INBOX.md`/`specs/DEFERRED.md` back to their bare header (`# Inbox` /
`# Deferred Work`, no entries) only after every migrated entry's `gh issue create` has
confirmed success — migration is all-or-nothing per file, matching the Action Vocabulary's
atomicity rule (`/claude-tweaks:tidy`'s "Sync to GitHub" action, which this migration is a
batch form of). If any single `gh issue create` fails mid-batch, leave the failed entries
(and only those) in the local file and report which ones — they'll be flagged unsynced by
`/claude-tweaks:tidy` and can be retried per-item via its Sync to GitHub action.

On "Skip": leave the files as-is. `/claude-tweaks:tidy`'s scan already treats any non-empty
local-file content as unsynced once `backlog-backend: github-issues`, offering the
identical Sync to GitHub action per-item on its next run — a declined migration behaves
exactly like a transient-failure fallback write from the scan's point of view.

**Re-run behavior (Update-Mode drift).** When `/init` is re-run on a project where
````

Use the Edit tool with this exact old_string/new_string pair.

- [ ] **Step 2: Verify**

Grep-verify the future-tense claim is gone and the migration section landed:

```bash
grep -n "will read this flag" skills/init/bootstrap-steps.md
```

Expected: no output (the phrase no longer exists).

```bash
grep -n "Existing-content migration" skills/init/bootstrap-steps.md
```

Expected: one match.

Confirm the section still flows correctly into "Re-run behavior" with no duplicated or orphaned text:

```bash
awk '/^### Step 15/,/^### Step 16|^## /' skills/init/bootstrap-steps.md | grep -c "^\*\*Re-run behavior"
```

Expected: `1` (exactly one "Re-run behavior" heading — confirms the insertion didn't duplicate or drop the following section).

- [ ] **Step 3: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Fix stale future-tense claim in /init Step 15; add existing-content migration procedure"
```
