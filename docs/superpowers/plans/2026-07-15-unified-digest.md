# Unified Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the triage → dispatch → digest human-facing surface into fewer touchpoints: one motion to grant-and-build, and a digest that surfaces everything waiting on a human instead of only stale items.

**Architecture:** Two independent task groups, sharing no files. Group A (Tasks 1-3) adds an explicit-issue-list invocation form to `/claude-tweaks:dispatch` and wires triage's Next Actions to call it with just-granted record numbers. Group B (Tasks 4-5) adds a new PR finding shape and enumerated (not just counted) queue metrics to the existing `/claude-tweaks:tidy --scope=github` rolling digest.

**Tech Stack:** Node.js (`node:test`/`node:assert`, matching this repo's existing `bin/lib/issues/` convention), Markdown skill-file prose. No new dependencies, no new files beyond one test file extension.

## Global Constraints

- No new npm dependencies, no new skill files, no new `bin/lib/issues/` modules — extend `grouping.js` only (per the design doc's Known Touch Points and Non-Goals).
- `/claude-tweaks:triage`'s Step 3 grant-confirm `AskUserQuestion` is not modified — it remains the sole human confirmation for every `auto:build`/`auto:merge` grant.
- `dispatch-pick-max-concurrent`'s meaning, the Auto-merge gate, and the Settle step are unchanged — the new explicit-list form is subject to the exact same concurrency cap and claim mechanics as bare/`next`/`#N`.
- The digest stays read-only/notice-only — no comment-to-grant, no embedded actionable buttons.
- The new PR finding's age condition is "not yet `Stale`" (< 4 weeks since `updatedAt`, spanning both the `Fresh` and `Review` staleness bands) — not just "< 2 weeks."
- The new PR finding's severity is `info`, distinct from the existing `medium` "stale open PR" row.
- No cap on enumerated `Pending authorization`/`Blocked`/`Backlog` list length — render all matching records, omitting only empty buckets entirely (summary line and sub-list both).
- `assess-agent-autonomy`'s assistive rationale is explicitly out of scope for this plan (deferred per the design doc's Non-Goals).

---

## Task 1: Explicit-list parsing and group selection (`grouping.js`)

**Files:**
- Modify: `bin/lib/issues/grouping.js`
- Test: `bin/lib/issues/tests/grouping.test.js`

**Interfaces:**
- Produces: `parseExplicitIssueList(argString: string): number[]` — parses a comma-joined, optionally `#`-prefixed issue-number argument (e.g. `"#123, #124,#130"`) into `[123, 124, 130]`, silently dropping non-numeric entries.
- Produces: `selectGroupsForExplicitList(requestedNumbers: number[], groups: Array<Array<{number: number, [key: string]: any}>>): {selectedGroups: Array<Array<object>>, notFound: number[]}` — given dispatch Step 2's already-computed `groups` (arrays of full issue objects, matching `/tmp/dispatch-groups.json`'s shape), returns the deduplicated set of groups containing at least one requested number, plus any requested numbers found in none of them.
- Both are consumed by Task 2's changes to `skills/dispatch/SKILL.md`.

- [ ] **Step 1: Write the failing tests**

First, update the existing require line at the top of `bin/lib/issues/tests/grouping.test.js` (line 5) from:

```js
const { groupByFileOverlap, extractKeyFiles } = require('../grouping');
```

to:

```js
const { groupByFileOverlap, extractKeyFiles, parseExplicitIssueList, selectGroupsForExplicitList } = require('../grouping');
```

Then append the following to the same file (after the existing `extractKeyFiles` tests, before the final closing of the file) — do not add a second `require` line, the one at the top now covers both new functions:

```js
// ── parseExplicitIssueList ───────────────────────────────────────────────────

test('parses a single bare number with a leading #', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123'), [123]);
});

test('parses a comma-joined list, trimming whitespace around entries', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123, #124,#130'), [123, 124, 130]);
});

test('accepts entries without a leading #', () => {
  assert.deepStrictEqual(parseExplicitIssueList('123,124'), [123, 124]);
});

test('filters out non-numeric entries rather than throwing', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123,notanumber,#130'), [123, 130]);
});

test('empty string returns an empty array', () => {
  assert.deepStrictEqual(parseExplicitIssueList(''), []);
});

// ── selectGroupsForExplicitList ──────────────────────────────────────────────

test('selects the single group containing a requested number', () => {
  const groups = [[{ number: 123 }, { number: 124 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123], groups);
  assert.deepStrictEqual(result.selectedGroups, [[{ number: 123 }, { number: 124 }]]);
  assert.deepStrictEqual(result.notFound, []);
});

test('two requested numbers in the same group produce one selected group, not two', () => {
  const groups = [[{ number: 123 }, { number: 124 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123, 124], groups);
  assert.strictEqual(result.selectedGroups.length, 1);
  assert.deepStrictEqual(result.notFound, []);
});

test('two requested numbers in different groups produce two selected groups', () => {
  const groups = [[{ number: 123 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123, 130], groups);
  assert.strictEqual(result.selectedGroups.length, 2);
});

test('a requested number not present in any group is reported in notFound, not thrown', () => {
  const groups = [[{ number: 123 }]];
  const result = selectGroupsForExplicitList([123, 999], groups);
  assert.deepStrictEqual(result.selectedGroups, [[{ number: 123 }]]);
  assert.deepStrictEqual(result.notFound, [999]);
});

test('requesting nothing returns no selected groups and no notFound', () => {
  const groups = [[{ number: 123 }]];
  const result = selectGroupsForExplicitList([], groups);
  assert.deepStrictEqual(result.selectedGroups, []);
  assert.deepStrictEqual(result.notFound, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design" && node --test bin/lib/issues/tests/grouping.test.js`
Expected: FAIL — `TypeError: parseExplicitIssueList is not a function` (or similar), since neither function exists yet in `grouping.js`.

- [ ] **Step 3: Write the minimal implementation**

In `bin/lib/issues/grouping.js`, add these two functions after `extractKeyFiles` (before the closing `module.exports` line):

```js
// Parses a comma-joined, optionally "#"-prefixed issue-number argument (the
// explicit-list dispatch form, e.g. "#123, #124,#130") into an array of
// issue numbers. Non-numeric entries are dropped, not thrown — a malformed
// entry in an otherwise-valid list shouldn't abort the whole parse.
function parseExplicitIssueList(argString) {
  return (argString || '')
    .split(',')
    .map((s) => s.trim().replace(/^#/, ''))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

// Given a set of requested issue numbers and dispatch Step 2's already-
// computed groups (arrays of full issue objects), returns the deduplicated
// groups containing at least one requested number, plus any requested
// numbers found in none of them (not currently eligible — already claimed,
// grant stripped, or never existed).
function selectGroupsForExplicitList(requestedNumbers, groups) {
  const requested = new Set(requestedNumbers);
  const selectedGroups = [];
  const foundNumbers = new Set();
  for (const group of groups) {
    const groupNumbers = group.map((issue) => issue.number);
    if (groupNumbers.some((n) => requested.has(n))) {
      selectedGroups.push(group);
      groupNumbers.forEach((n) => foundNumbers.add(n));
    }
  }
  const notFound = requestedNumbers.filter((n) => !foundNumbers.has(n));
  return { selectedGroups, notFound };
}
```

Update the `module.exports` line at the end of the file:

```js
module.exports = { groupByFileOverlap, extractKeyFiles, parseExplicitIssueList, selectGroupsForExplicitList };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design" && node --test bin/lib/issues/tests/grouping.test.js`
Expected: PASS — `# pass 28` (18 pre-existing + 10 new: 5 for `parseExplicitIssueList`, 5 for `selectGroupsForExplicitList`), `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design"
git add bin/lib/issues/grouping.js bin/lib/issues/tests/grouping.test.js
git commit -m "Add explicit-list parsing and group selection to grouping.js"
```

---

## Task 2: Wire the explicit-list form into dispatch's Step 3

**Files:**
- Modify: `skills/dispatch/SKILL.md`

**Interfaces:**
- Consumes: `parseExplicitIssueList`, `selectGroupsForExplicitList` (Task 1, `bin/lib/issues/grouping.js`).
- Produces: the invocation syntax `/claude-tweaks:dispatch #N[,#M,#O...]`, which Task 3 wires triage's Next Actions to call.

- [ ] **Step 1: Add the new row to the `$ARGUMENTS` table**

In `skills/dispatch/SKILL.md`, find the Input table (currently 3 rows: *(none)*, `next`, `#N`). Add a fourth row immediately after the `#N` row:

```markdown
| `#N,#M,...` | Explicit list — claim + dispatch each named record's whole file-overlap group, deduplicated; skips interactive selection since the set is already named |
```

- [ ] **Step 2: Add the new selection form to Step 3**

Find the paragraph beginning `**\`#N\`** — direct.` inside `### Step 3: Select`. Immediately after that paragraph (before the `### Step 4: Claim the selected group` heading), insert:

```markdown
**`#N[,#M,#O...]`** — explicit list. Parse the argument via `parseExplicitIssueList` (`bin/lib/issues/grouping.js`) into an array of issue numbers. Call `selectGroupsForExplicitList(requestedNumbers, groups)` (same file) against Step 2's already-computed `groups` array. Report every entry in the returned `notFound` list with why it's excluded — no `auto:build` grant, already claimed, or `bot:blocked` (re-check against Step 2's live queue, the same re-verification the singular `#N` form already does) — but do not abort the rest of the named set over one excluded entry. Every group in the returned `selectedGroups` proceeds to Step 4 exactly as a bare-mode pick would, still bound by `dispatch-pick-max-concurrent` (extra groups queue for a freed slot, same as bare mode's "more selections than the cap" case). Skip Step 3's `AskUserQuestion` entirely — the selection is already explicit; there is nothing to pick.
```

- [ ] **Step 3: Update the Next Actions render/suppress rule**

Find the Next Actions section's opening sentence: `Render only when a human is present to answer — the bare form is definitionally interactive (its own Step 3 pick already required one answer); \`next\` / \`#N\` render this block when a human typed the command directly, never when this firing came from a scheduled Routine...`

Replace it with:

```markdown
Render only when a human is present to answer — the bare form is definitionally interactive (its own Step 3 pick already required one answer); `next` / `#N` / `#N,#M,...` render this block when a human typed the command directly or a prior skill (e.g. triage's Next Actions) invoked it on a human's behalf, never when this firing came from a scheduled Routine (nobody is present to answer, and an unanswered question at the very end of a headless run is just noise):
```

- [ ] **Step 4: Verify against the current live queue (read-only dry run)**

Run: `gh issue list --label auto:build --state open --json number,title,labels,createdAt --limit 100`

If any records are returned, trace Step 2's grouping script against them (read-only — do not proceed past this) and confirm the shape matches what `selectGroupsForExplicitList` expects (`Array<Array<{number, ...}>>`). If the queue is empty, this step is satisfied by Task 1's unit tests alone — note in the task report that no live records were available to cross-check against.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design"
git add skills/dispatch/SKILL.md
git commit -m "Add explicit-list invocation form to dispatch Step 3"
```

---

## Task 3: Wire triage's Next Actions to the explicit-list form

**Files:**
- Modify: `skills/triage/SKILL.md`

**Interfaces:**
- Consumes: the `/claude-tweaks:dispatch #N,#M,...` invocation syntax (Task 2).

- [ ] **Step 1: Reword and rewire Next Actions Option 1**

In `skills/triage/SKILL.md`'s `## Next Actions` section, find:

```markdown
- Option 1 — `label`: `"Dispatch what's authorized (Recommended)"`, `description`: `"/claude-tweaks:dispatch — pick from everything now carrying auto:build and hand it to /flow"`
```

Replace with:

```markdown
- Option 1 — `label`: `"Dispatch what I just granted (Recommended)"`, `description`: `"/claude-tweaks:dispatch {comma-joined numbers of every record Step 4 just granted this session} — skips re-selection, claims and builds them directly"`
```

Immediately below the Next Actions option list, add a short implementation note (this is prose the triage-running agent reads, not a separate skill file):

```markdown
Option 1 invokes the new explicit-list form (`skills/dispatch/SKILL.md` Step 3) with exactly the record numbers Step 4 applied a grant to this session — not the full historical authorized queue. A human who wants the broader queue (including older, previously-granted-but-undispatched records) runs plain `/claude-tweaks:dispatch` themselves; that path is unchanged and does not need its own slot here.
```

- [ ] **Step 2: Trace a worked example**

Confirm the new wording is unambiguous by tracing this scenario: triage's Step 4 this session granted `auto:build` to #201 and #202 (no `auto:merge`), and #205 (with `auto:merge`). Choosing Option 1 should invoke `/claude-tweaks:dispatch #201,#202,#205` — not bare `/claude-tweaks:dispatch`, and not three separate `#N` invocations.

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design"
git add skills/triage/SKILL.md
git commit -m "Wire triage's Next Actions to dispatch's explicit-list form"
```

---

## Task 4: New "awaiting review" PR finding shape

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Produces: a new `[pr]` finding row (Output Contract format, `info` severity) and a new Step 6 aggressiveness-routing table row (`tidy/SKILL.md`) it maps to.
- Consumes: nothing from Tasks 1-3 (fully independent).

- [ ] **Step 1: Add the finding condition to the `repo-wide` scope's Open PRs item**

In `skills/_shared/github-pr-scan.md`, find item 1 of the `repo-wide` scope:

```markdown
1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
```

Replace with:

```markdown
1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds. A PR that is simultaneously not draft, not yet `Stale` (< 4 weeks since `updatedAt` — spans both the `Fresh` and `Review` bands, since neither currently has its own finding for a PR with nothing wrong), has zero unresolved review threads (item 2 below), and has no failing/pending CI (`gh pr checks`) gets its own finding: `[pr] PR #{n}: {title} — awaiting review — last updated {age} ago, CI {status}, 0 unresolved threads`. This is informational only — see the Severity mapping and `tidy/SKILL.md`'s Step 6 routing below.
```

- [ ] **Step 2: Add the new severity row**

In the same file's Severity mapping table, add a new row immediately before the closing `| Fresh draft PR / no PR / scan skipped | info |` row:

```markdown
| Open PR awaiting review (not draft, not yet `Stale`, 0 unresolved threads, CI clean) | info |
```

- [ ] **Step 3: Add the new Step 6 routing table row in tidy/SKILL.md**

In `skills/tidy/SKILL.md`'s Step 6 aggressiveness-routing table, add a new row immediately after the existing `**Re-triage**` row:

```markdown
| **Awaiting review** (a fresh/clean, non-stale open PR surfaced by `github-pr-scan.md`'s `repo-wide` scope; no mutation, informational only) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
```

- [ ] **Step 4: Trace a worked example**

Confirm the new finding fires correctly by tracing this scenario: PR #145 was opened 6 hours ago (well within `Fresh`), is not a draft, has 0 unresolved review threads, and `gh pr checks` shows all green. It should produce `[pr] PR #145: {title} — awaiting review — last updated 6h ago, CI passing, 0 unresolved threads` at `info` severity, routed as "Auto (no-op, always surfaced)" regardless of `tidy-aggressiveness`. Separately confirm PR #146, opened 25 days ago (in the `Review` band) but otherwise identical, produces the *same* finding shape — not silence, and not the existing `Stale` finding (which only fires past 4 weeks).

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design"
git add skills/_shared/github-pr-scan.md skills/tidy/SKILL.md
git commit -m "Add awaiting-review PR finding shape for non-stale, clean open PRs"
```

---

## Task 5: Enumerated queue metrics in the digest

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: nothing from Tasks 1-4 (fully independent; touches the same two files as Task 4 but different sections).
- Produces: enumerated `Pending authorization`/`Blocked`/`Backlog` bullet lists in the rolling digest, keyed for the digest's existing dedup mechanism exactly like any other finding.

- [ ] **Step 1: Extend the grant-queue-counts script to return record lists**

In `skills/_shared/github-pr-scan.md`, find item 7's full script (`repo-wide` scope, "Grant-queue counts"):

```bash
gh issue list --state open --json number,labels --limit 200 > /tmp/pr-scan-records.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/pr-scan-records.json');
  const faceted = issues.map((i) => parseRecordFacets(i.labels));
  const pending = faceted.filter((f) => f.stage === 'ready' && !f.grants.build && !f.grants.merge && !f.bot.inProgress && !f.bot.blocked).length;
  const blocked = faceted.filter((f) => f.bot.blocked).length;
  const backlog = faceted.filter((f) => f.stage === 'backlog').length;
  console.log(JSON.stringify({ pending, blocked, backlog }));
"
```

Replace with (note the `--json` fields gain `title` — the original query never fetched it, since only counts were needed before; `faceted` is reused by index rather than recomputed, since `.map` preserves order against `issues`):

```bash
gh issue list --state open --json number,title,labels --limit 200 > /tmp/pr-scan-records.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/pr-scan-records.json');
  const faceted = issues.map((i) => parseRecordFacets(i.labels));
  const withFacets = issues.map((i, idx) => ({ number: i.number, title: i.title, facets: faceted[idx] }));
  const pendingList = withFacets.filter((i) => i.facets.stage === 'ready' && !i.facets.grants.build && !i.facets.grants.merge && !i.facets.bot.inProgress && !i.facets.bot.blocked);
  const blockedList = withFacets.filter((i) => i.facets.bot.blocked);
  const backlogList = withFacets.filter((i) => i.facets.stage === 'backlog');
  const strip = (list) => list.map(({ number, title }) => ({ number, title }));
  console.log(JSON.stringify({
    pending: pendingList.length, blocked: blockedList.length, backlog: backlogList.length,
    pendingList: strip(pendingList), blockedList: strip(blockedList), backlogList: strip(backlogList),
  }));
"
```

- [ ] **Step 2: Update the surfacing instruction**

Immediately below the script, find:

```markdown
Surface all three in the digest's "Still needs your review" section (see `tidy/SKILL.md`'s digest section): `**Pending authorization:** {N} records awaiting a grant`, `**Blocked:** {N} records hit their retry ceiling`, `**Backlog:** {N} records with no stage label` — omit any line whose count is 0.
```

Replace with:

```markdown
Surface all three in the digest's "Still needs your review" section (see `tidy/SKILL.md`'s digest section) as a summary line plus an enumerated bullet per record: `**Pending authorization:** {N} records awaiting a grant` followed by one `- #{number}: {title}` line per entry in `pendingList` (same pattern for `**Blocked:**`/`blockedList` and `**Backlog:**`/`backlogList`) — omit both the summary line and its bullet list when a bucket's count is 0. No cap on list length.
```

- [ ] **Step 3: Update the digest template in tidy/SKILL.md**

In `skills/tidy/SKILL.md`'s rolling-digest markdown template, find:

```markdown
**Pending authorization:** {N} records awaiting a grant
**Blocked:** {N} records hit their retry ceiling
**Backlog:** {N} records with no stage label
```

Replace with:

```markdown
**Pending authorization:** {N} records awaiting a grant
- #{number}: {title}

**Blocked:** {N} records hit their retry ceiling
- #{number}: {title}

**Backlog:** {N} records with no stage label
- #{number}: {title}
```

Immediately below the template, add a note (this repo's existing convention for template-adjacent caveats, matching how the Dedup/Notification subsections are already written as prose immediately after the template):

```markdown
Each bucket's bullet list is one `- #{number}: {title}` line per entry in that bucket's list (`pendingList`/`blockedList`/`backlogList` from `github-pr-scan.md` item 7) — omit both the summary line and the bullet list together when a bucket's count is 0. No cap on list length: if a bucket holds 40 records, all 40 render.
```

- [ ] **Step 4: Confirm dedup needs no change**

Read `tidy/SKILL.md`'s existing Dedup subsection (the paragraph beginning "Dedup (applies to 'Still needs your review' only...)"). Confirm its key scheme (`{PR or issue number}:{finding-type}`) already covers these enumerated rows without modification — a `Pending authorization` bullet for #142 would key as `142:pending-authorization`, distinct from any PR finding on the same number. No edit needed here; this step is a verification-only checkpoint, not a code change.

- [ ] **Step 5: Trace a worked example**

Confirm the new rendering by tracing this scenario: 3 records are `ready` with no grants/bot-state (#142, #156, #161), 1 record is `bot:blocked` (#118), 0 records are bare `backlog`. The rendered digest section should show the `Pending authorization` and `Blocked` summary lines each followed by their bullets, and omit the `Backlog` line and any bullet under it entirely (count is 0).

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/unified-digest-design"
git add skills/_shared/github-pr-scan.md skills/tidy/SKILL.md
git commit -m "Enumerate Pending authorization/Blocked/Backlog records in the digest"
```
