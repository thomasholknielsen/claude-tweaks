# /demo Session-Recall Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/claude-tweaks:demo` surface and walk through ad hoc, conversation-based work
that has no backing GitHub issue or local record — closing the gap where a session that just
built and manually verified something real leaves `/demo` reporting "Nothing awaiting sign-off."

**Architecture:** `/demo`'s Step 1 becomes dual-source: the existing `demo:pending` label query
(Source A, unchanged) runs alongside a new session-recall scan (Source B) that looks, within the
current conversation only, for units of work with no `#N` reference. Both feed one worklist.
Recall entries render through the same Verification Brief heading shape but are composed
directly from conversation memory, and carry no backing label — Approve/Skip write nothing;
Request changes reuses the exact existing follow-up-filing mechanism.

**Tech Stack:** Markdown skill files (prose procedures), `gh` CLI, `git`, no new `bin/` code.

## Global Constraints

- The four Verification Brief headings — `### The ask`, `### What shipped`, `### Confirmed`,
  `### See it yourself` — are used verbatim and identically for both entry kinds. They already
  exist in `verification-brief.md`'s template; this plan does not rename or add to them.
- Session-recall entries **never** persist a label, comment, or file write on Approve or Skip.
  The only write path for a recall entry is Request changes, and it reuses the *existing*
  follow-up-record mechanism (`recordPayload` / `allocateId`, no `/capture` invocation) — this
  plan does not introduce a new persistence mechanism anywhere.
- Recall detection in Step 1 is scoped **per unit of work**, cross-referenced against any `#N`
  already visible in the conversation or in Source A's results — never a blanket "is the whole
  conversation record-free" check. A session that touched one real record and did one unrelated
  ad hoc tweak must yield exactly one Source A entry and exactly one Source B entry, never two
  entries for the same work.
- Recall entries use `(session)` as their `{ref}` placeholder everywhere a label-backed entry
  would show `#N` (batch table, any cross-reference) — no record number exists for them.
- No `bin/` code changes anywhere in this plan. `npm test` must stay green throughout (verify
  after every task regardless).
- Version bump (Task 2): read `.claude-plugin/plugin.json`'s current `version` at execution time
  and check `origin/main` for a concurrent bump first (CLAUDE.md's Releasing section) — do not
  hardcode a version number; it would already be stale by the time this task runs.

---

### Task 1: Rewrite `skills/demo/SKILL.md` for dual-source discovery

**Files:**
- Modify: `skills/demo/SKILL.md`

**Interfaces:**
- Produces: `### Source A: label-backed records` and `### Source B: session-recall scan` as the
  two named sub-procedures inside Step 1; `(session)` as the recall-entry `{ref}` placeholder;
  the "Session-recall entries" verdict-handling branch inside Step 4. No other task in this plan
  consumes these by name, but they are the vocabulary the design doc uses throughout.
- Consumes: nothing new — this task only edits `skills/demo/SKILL.md`, which already exists with
  the structure read below.

- [ ] **Step 1: Read the current file**

Read `skills/demo/SKILL.md` in full (167 lines as of this plan's authoring) to confirm exact line
content before each edit below — the file may have drifted slightly if other work landed on
`main` since. Every Find block below must match verbatim before replacing.

- [ ] **Step 2: Update the frontmatter `description:` line**

Find:

```markdown
description: Use when you want to sweep every built-but-unsigned-off work record and give each one a human verdict — approve, or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending.
```

Replace with:

```markdown
description: Use when you want to sweep every built-but-unsigned-off work record — or recap and sign off on ad hoc work from this same conversation that has no work record at all — and give each one a human verdict, approve or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall.
```

- [ ] **Step 3: Update the opening paragraph**

Find:

```markdown
Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — and gives each one a real human verdict. Sits after wrap-up, with no fixed position in any single pipeline run:
```

Replace with:

```markdown
Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — plus any work this same conversation did with no backing record at all, and gives each one a real human verdict. Sits after wrap-up when a record exists; independent of it entirely for conversation-based work with no record to wait on:
```

- [ ] **Step 4: Add a note after the lifecycle diagram**

Find:

```markdown
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

## When to Use
```

Replace with:

```markdown
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

A second, independent path exists for conversation-based work with no record at all — see Step
1's session-recall source below.

## When to Use
```

- [ ] **Step 5: Add a "When to Use" bullet**

Find:

```markdown
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.
```

Replace with:

```markdown
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.
- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.
```

- [ ] **Step 6: Update the Input section**

Find:

```markdown
`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record; `#N` scopes to a single record.
```

Replace with:

```markdown
`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record plus this session's own unrecorded work (Step 1's two sources); `#N` scopes to a single label-backed record and skips the session-recall source entirely — a specific record number has nothing to do with recall.
```

- [ ] **Step 7: Rewrite Step 1 (Discover pending records → Discover pending work)**

Find:

````markdown
## Step 1: Discover pending records

**`work-backend: github-issues`:**

```bash
gh issue list --state all --label demo:pending --json number,title,labels,url --limit 200 > /tmp/demo-pending.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/demo-pending.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
"
```

`--state all` is deliberate — `demo:pending` persists independent of open/closed state, which is
what makes retrospective sign-off on already-merged `auto:merge` work possible. When `#N` is
given, scope to that single record instead of the full list.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords(dir, { acceptance: 'pending' })`
(`bin/lib/issues/local-store.js`) — the Verification Brief is the record's own
`## Verification Brief` body section, not a separate fetch.

If no records match, report "Nothing awaiting sign-off." and stop — do not render an empty
batch table or call `AskUserQuestion`.
````

Replace with:

````markdown
## Step 1: Discover pending work

Two independent sources feed the same worklist, every run — not a fallback chain. Gather both,
then merge before Step 2.

### Source A: label-backed records

**`work-backend: github-issues`:**

```bash
gh issue list --state all --label demo:pending --json number,title,labels,url --limit 200 > /tmp/demo-pending.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/demo-pending.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
"
```

`--state all` is deliberate — `demo:pending` persists independent of open/closed state, which is
what makes retrospective sign-off on already-merged `auto:merge` work possible. When `#N` is
given, scope Source A to that single record instead of the full list, and skip Source B entirely
— session-recall entries have no record number to match against an explicit `#N`.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords(dir, { acceptance: 'pending' })`
(`bin/lib/issues/local-store.js`) — the Verification Brief is the record's own
`## Verification Brief` body section, not a separate fetch.

### Source B: session-recall scan

Only meaningful when `$ARGUMENTS` is empty (a full sweep) — skip entirely when `#N` was given.

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation or present in Source A's results. Work with no correlating `#N` is
a session-recall candidate — compose its Verification Brief content now, directly from recall,
into the same shape `verification-brief.md` renders (`### The ask` / `### What shipped` /
`### Confirmed` / `### See it yourself`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **See it yourself** — an entry point, only if one was actually exercised/known; omit the
  section entirely otherwise.

This source has no fetch step — there is no comment or record body to read from. A fresh `/demo`
session with no memory of the work in question naturally finds nothing here; that's expected,
not a bug (session-recall never discovers *other* sessions' unrecorded work).

### Merge and stop condition

Combine Source A and Source B into one worklist. Report "Nothing awaiting sign-off." and stop —
do not render an empty batch table or call `AskUserQuestion` — only when **both** sources are
empty.
````

- [ ] **Step 8: Verify Step 7's edit**

```bash
grep -c "^## Step" skills/demo/SKILL.md
```

Expected: `4` (Step 1, Step 2, Step 3, Step 4 — Source A/B and the merge note are `###`
subsections of Step 1, not new `##` steps, so this count is unchanged from before Step 7).

```bash
grep -n "Source A: label-backed records\|Source B: session-recall scan\|Merge and stop condition" skills/demo/SKILL.md
```

Expected: exactly 3 matches, one per heading.

- [ ] **Step 9: Rewrite Step 2 (Present the batch)**

Find:

```markdown
## Step 2: Present the batch

Lead with a scope line: `**{N} records awaiting sign-off** ({M} low-risk, {K} need a closer look)`.

Render a batch table:

| # | Title | Type | Risk/Effort | What changed | Suggested verdict |
|---|-------|------|--------------|---------------|--------------------|
| {ref} | {title} | {type} | {risk}/{effort} | {one-liner from the brief's "What changed"} | {Approve \| Needs a look} |

**Suggested verdict** is pre-filled **Approve** only when the record is both `risk:low` and
`effort:low` AND its changed-file list doesn't touch any `merge-sensitive-paths` glob
(`_shared/work-record.md`'s config key). Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping.

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`
```

Replace with:

```markdown
## Step 2: Present the batch

Skip straight to Step 3 when the merged worklist (Step 1) has exactly one item and it is a
session-recall entry — rendering a batch table for a single row is unnecessary ceremony.
Otherwise, lead with a scope line: `**{N} records awaiting sign-off** ({M} low-risk, {K} need a
closer look)`.

Render a batch table:

| # | Title | Type | Risk/Effort | What shipped | Suggested verdict |
|---|-------|------|--------------|---------------|--------------------|
| {ref} | {title} | {type} | {risk}/{effort} | {one-liner from the brief's "What shipped"} | {Approve \| Needs a look} |

**Suggested verdict** is pre-filled **Approve** only when the record is both `risk:low` and
`effort:low` AND its changed-file list doesn't touch any `merge-sensitive-paths` glob
(`_shared/work-record.md`'s config key). Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping. Session-recall entries never carry
`risk:*`/`effort:*` labels (there's no record to hold them), so they always render `{ref}` as
`(session)`, `{type}` as `ad hoc`, `{risk}/{effort}` as `—`, and always get **Needs a look**.

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`
```

(This edit also fixes a pre-existing terminology mismatch — the table drew from "What changed" while the actual brief template heading is `### What shipped`; both now say "What shipped".)

- [ ] **Step 10: Update Step 3's intro paragraph**

Find:

```markdown
## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (The ask / What
shipped / Confirmed / See it yourself, per `verification-brief.md`'s digest template — evidence
the human can judge, not a checklist to complete), then call `AskUserQuestion` with `question`:
`"Does {title} do what you asked for?"`, `header`: `"Verdict"`, `multiSelect`: `false`:
```

Replace with:

```markdown
## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (The ask / What
shipped / Confirmed / See it yourself — evidence the human can judge, not a checklist to
complete). Label-backed entries were fetched per `verification-brief.md`'s digest template in
Step 1's Source A; session-recall entries were composed directly from recall, also in Step 1
(Source B), into the same four-heading shape — both render identically here. Then call
`AskUserQuestion` with `question`: `"Does {title} do what you asked for?"`, `header`:
`"Verdict"`, `multiSelect`: `false`:
```

- [ ] **Step 11: Rewrite Step 4 (Apply verdicts) with the per-entry-kind fork**

Find:

```markdown
## Step 4: Apply verdicts

Bootstrap `demo:approved` and `demo:changes-requested` via the check-then-create loop from
`_shared/label-bootstrap.md` before the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
- **Request changes** — prompt for a short reason inline, then:
  1. **`work-backend: github-issues`:** `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`. **`work-backend: local-files`:** set `facets.acceptance = 'changes-requested'` via `writeRecord`.
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. `work-backend: github-issues`:
     use the same `recordPayload` composition `/claude-tweaks:capture` uses
     (`bin/lib/issues/record.js`), just without invoking `/claude-tweaks:capture` itself.
     `work-backend: local-files`: use `allocateId`/`writeRecord`
     from `bin/lib/issues/local-store.js` instead.
  3. Note the bidirectional link back on the original record. `work-backend: github-issues`:
     comment on the original issue with the new follow-up's issue number. `work-backend:
     local-files`: there is no comment mechanism (same constraint `verification-brief.md` and
     `_shared/work-record.md` already document) — append a short note with the follow-up's id to
     the original record's body instead, via the same `readRecord`/`writeRecord` round trip.
- **Skip for now** — no label change.
```

Replace with:

```markdown
## Step 4: Apply verdicts

**Label-backed entries** (Source A, Step 1): bootstrap `demo:approved` and
`demo:changes-requested` via the check-then-create loop from `_shared/label-bootstrap.md` before
the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
- **Request changes** — prompt for a short reason inline, then:
  1. **`work-backend: github-issues`:** `gh issue edit {n} --remove-label demo:pending --add-label demo:changes-requested`. **`work-backend: local-files`:** set `facets.acceptance = 'changes-requested'` via `writeRecord`.
  2. File a linked follow-up record: backlog stage (no `ready` — a one-line reason isn't
     spec-shaped), Type `bug` by default (override to `feature`/`task` when the reason clearly
     describes new scope, not a defect), no `by:*` label — instead a body line
     `Origin: demo changes-requested from #{n}` per `_shared/work-record.md`'s side-effect-record
     convention — plus the reason and a link back to the original. `work-backend: github-issues`:
     use the same `recordPayload` composition `/claude-tweaks:capture` uses
     (`bin/lib/issues/record.js`), just without invoking `/claude-tweaks:capture` itself.
     `work-backend: local-files`: use `allocateId`/`writeRecord`
     from `bin/lib/issues/local-store.js` instead.
  3. Note the bidirectional link back on the original record. `work-backend: github-issues`:
     comment on the original issue with the new follow-up's issue number. `work-backend:
     local-files`: there is no comment mechanism (same constraint `verification-brief.md` and
     `_shared/work-record.md` already document) — append a short note with the follow-up's id to
     the original record's body instead, via the same `readRecord`/`writeRecord` round trip.
- **Skip for now** — no label change.

**Session-recall entries** (Source B, Step 1) — no record exists, so nothing here ever
bootstraps a label or writes to GitHub/local-files for Approve or Skip:

- **Approve** — nothing written anywhere. The verdict lives in this conversation.
- **Skip for now** — nothing written anywhere. Unlike a label-backed record, this will not
  reappear in a future `/demo` run — a different session has no memory of this conversation to
  recall from. This is the accepted tradeoff of not persisting anything, not a bug.
- **Request changes** — the exact same follow-up-filing procedure as the label-backed path's
  Request changes above (steps 2-3), reusing `recordPayload`/`allocateId` directly — the only
  difference is there is no original record to relabel or comment a link back onto. The
  `Origin:` body line reads `Origin: demo changes-requested from session recall` instead of
  `from #{n}`.
```

**Correction note (added post-implementation):** the replace text above originally cited
"(steps 2-3)" for the reused procedure, but the label-backed path's step 3 is "comment a link
back on the original record" — which the very next clause here correctly says does NOT apply
(no original record to comment on). Only step 2 (file the linked follow-up record) actually
applies. Caught by Task 1's task reviewer, not by plan self-review. Fixed directly in
`skills/demo/SKILL.md` to read "(step 2)"; this plan file's Find/Replace text above is left as
originally authored, per this project's own convention of documenting the as-authored planning
mistake for the historical record rather than silently editing it away.

- [ ] **Step 12: Add an Anti-Patterns table row**

Find:

```markdown
| Leaving a "Show me live" session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
```

Replace with:

```markdown
| Leaving a "Show me live" session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
| Writing `demo:approved`/`demo:pending` for a session-recall entry | There's no record to hold it — the verdict lives in the conversation, not a label. Only a Request-changes verdict ever produces a real record for one of these. |
```

- [ ] **Step 13: Update the `/claude-tweaks:wrap-up` Relationship table row**

Find:

```markdown
| `/claude-tweaks:wrap-up` | Sole producer of `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`), gated on a clean visual-review pass — `/demo` is the sole consumer/resolver |
```

Replace with:

```markdown
| `/claude-tweaks:wrap-up` | Sole producer of *label-backed* `demo:pending` + the Verification Brief (Step 10, `verification-brief.md`), gated on a clean visual-review pass — `/demo` is the sole consumer/resolver for that path. `/demo`'s session-recall source (Step 1) surfaces conversation-based work independently of `/wrap-up` ever running. |
```

- [ ] **Step 14: Verify the full set of edits**

```bash
grep -n "Session-recall entries" skills/demo/SKILL.md
```

Expected: 2 matches — Step 2's "Session-recall entries never carry..." sentence (Step 9's edit)
and Step 4's "**Session-recall entries** (Source B, Step 1)" heading (Step 11's edit). Verified
by simulating this task's edits against a scratch copy during plan authoring — not a hand count.

```bash
grep -n "Writing \`demo:approved\`/\`demo:pending\` for a session-recall entry" skills/demo/SKILL.md
```

Expected: 1 match (the new Anti-Patterns row).

```bash
grep -n "session-recall source (Step 1) surfaces" skills/demo/SKILL.md
```

Expected: 1 match (the updated Relationship row).

```bash
grep -n "What changed" skills/demo/SKILL.md
```

Expected: no output — the stale table-header/source-note terminology is gone (Step 9's fix).

```bash
grep -c "(session)" skills/demo/SKILL.md
```

Expected: at least 1 (Step 9's table-row description).

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass — this task touches no test-covered code.

- [ ] **Step 15: Commit**

```bash
git add skills/demo/SKILL.md
git commit -m "Add session-recall fallback to /demo for conversation-based work with no record"
```

---

### Task 2: Update `README.md`, `skills/help/reference-card.md`, and bump the plugin version

**Files:**
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`
- Modify: `.claude-plugin/plugin.json`

**Interfaces:** None — final task, no downstream consumers within this plan.

- [ ] **Step 1: Resolve the current version**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
cat .claude-plugin/plugin.json | grep '"version"'
```

Per CLAUDE.md's Releasing section: if a concurrent bump landed on `origin/main` after this
worktree branched, renumber from that value instead of this branch's base. Determine the current
authoritative version `{CURRENT}` from whichever source is higher. (`{CURRENT}` was `6.8.0` as of
this plan's authoring — re-check live, do not trust that number.)

- [ ] **Step 2: Bump the minor version**

Edit `.claude-plugin/plugin.json`'s `version` field from `{CURRENT}` to the next minor version
(`{MAJOR}.{MINOR+1}.0`), per CLAUDE.md's "Bump minor version for feature additions" rule — this
adds new user-facing behavior (`/demo`'s session-recall source).

- [ ] **Step 3: Update `README.md`'s pipeline-diagram note**

Find:

```markdown
  ┈┈ /claude-tweaks:demo resolves demo:pending → approved/changes-requested (utility skill, no fixed position — run anytime, aggregates every in-flight thread) ┈┈
```

Replace with:

```markdown
  ┈┈ /claude-tweaks:demo resolves demo:pending → approved/changes-requested (utility skill, no fixed position — run anytime, aggregates every in-flight thread, plus this session's own unrecorded work via session-recall) ┈┈
```

- [ ] **Step 4: Update `README.md`'s `/claude-tweaks:demo` description paragraph**

Find:

```markdown
**`/claude-tweaks:demo`** — The durable, cross-thread acceptance gate: aggregates every record `/claude-tweaks:wrap-up` has labeled `demo:pending` (open or closed — covers already-merged `auto:merge` work too), replays the Verification Brief `/wrap-up` wrote at build time so you never re-derive "how do I test this," and captures a real human verdict distinct from tests passing (`/test`) or code-quality review (`/review`). Approve resolves to `demo:approved`; requesting changes resolves to `demo:changes-requested` and files a linked follow-up backlog record. Bare `/demo` sweeps everything pending; `/demo #N` scopes to one record.
```

Replace with:

```markdown
**`/claude-tweaks:demo`** — The durable, cross-thread acceptance gate: aggregates every record `/claude-tweaks:wrap-up` has labeled `demo:pending` (open or closed — covers already-merged `auto:merge` work too), plus any work the current conversation itself did with no backing record at all, replays or recomposes the Verification Brief so you never re-derive "how do I test this," and captures a real human verdict distinct from tests passing (`/test`) or code-quality review (`/review`). Approve resolves a label-backed record to `demo:approved`; for a session-recall entry, Approve/Skip write nothing anywhere — the verdict just lives in the conversation. Requesting changes always files a linked follow-up backlog record, label-backed or not. Bare `/demo` sweeps everything pending plus this session's own unrecorded work; `/demo #N` scopes to one label-backed record.
```

- [ ] **Step 5: Update `skills/help/reference-card.md`'s command catalog row**

Find:

```markdown
| `/claude-tweaks:demo` | Aggregates every `demo:pending` record (open or closed), briefs you on each, and captures a human verdict — approve or request changes | *(none)*, `#N` |
```

Replace with:

```markdown
| `/claude-tweaks:demo` | Aggregates every `demo:pending` record (open or closed) plus this session's own unrecorded work, briefs you on each, and captures a human verdict — approve or request changes | *(none)*, `#N` |
```

- [ ] **Step 6: Add a `README.md` changelog entry**

Read `README.md`'s existing changelog section to confirm the current latest entry's heading
format (`### What's new in v{X.Y.Z} — {title}`). Add a new entry above it, using Step 2's actual
resolved version for `{NEW_VERSION}`:

```markdown
### What's new in v{NEW_VERSION} — /demo session-recall fallback

`/claude-tweaks:demo` now aggregates a second, independent source alongside `demo:pending`
records: work done directly in the current conversation with no backing record at all. When
`/demo` finds nothing pending and the session itself did unrecorded implementation/verification
work, it recaps that work in the same Verification Brief shape (composed from recall, not a
diff) and asks for a verdict. Approve/Skip leave no trace — the verdict lives in the
conversation — while Request changes files a real follow-up record, same as it always has for
record-backed items.
```

- [ ] **Step 7: Verify**

```bash
node -e "console.log(require('./.claude-plugin/plugin.json').version)"
grep -c "^### What's new in v" README.md
```

Confirm the printed version matches Step 2's target, and the changelog count increased by 1 from
before this task.

```bash
grep -n "session-recall\|session's own unrecorded work" README.md skills/help/reference-card.md
```

Expected: at least 4 matches total across both files (diagram note, description paragraph,
changelog entry, reference-card row).

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass — this task touches no test-covered code.

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin/plugin.json README.md skills/help/reference-card.md
git commit -m "Bump version and update docs for /demo session-recall fallback"
```

---

## Self-Review

**Spec coverage:** Task 1 Steps 2-6 cover the design's Non-Goals-adjacent framing (frontmatter,
opening paragraph, diagram note, When to Use, Input). Task 1 Steps 7-8 cover Architecture #1
(dual-source Step 1). Task 1 Step 9 covers the batch-table single-item skip and recall-row
format (a plan-level detail the design doc left implicit). Task 1 Steps 10-11 cover Architecture
#2 (recall-entry brief composition) and #3 (verdict handling fork). Task 1 Steps 12-13 cover the
design's Known Touch Points (Anti-Patterns row, Relationship table caveat). Task 2 covers the
design's version-bump touch point, and corrects that touch point's actual location — the design
doc named "CLAUDE.md's one-line demo skill summary," but CLAUDE.md's Structure section has no
such per-skill summary for `demo` (only a directory-listing mention); the real homes are
`README.md`'s `/claude-tweaks:demo` description paragraph and `skills/help/reference-card.md`'s
command catalog row (CLAUDE.md's own "Don't forget to update README.md and /help" rule), both
covered in Task 2. No design section is uncovered.

**Placeholder scan:** No `TBD`/`TODO` in any task step. The two deliberately-deferred values
(exact version number, exact `{ref}` rendering for session-recall entries) are either a
live-git-state lookup (version) or a design decision already made and stated as a Global
Constraint (`(session)` placeholder) — neither is an unresolved placeholder.

**Type/name consistency:** `### The ask` / `### What shipped` / `### Confirmed` / `### See it
yourself` are referenced identically in Task 1 Steps 7, 9, and 10 — never renamed. `Source A:
label-backed records` and `Source B: session-recall scan` are defined in Step 7 and referenced by
the same names in Steps 9, 10, and 11. `(session)` as the recall `{ref}` is defined in Step 9 and
consistent with Step 11's verdict-handling text (which never needs `{ref}` directly, only
`{title}`, avoiding any risk of divergent naming). `Origin: demo changes-requested from #{n}`
(label-backed) vs. `Origin: demo changes-requested from session recall` (recall) are distinct and
both defined only in Step 11 — no other step restates either string.
