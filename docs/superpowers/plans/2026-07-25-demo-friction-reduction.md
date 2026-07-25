# /demo Friction Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-07-25-demo-friction-reduction-design.md` — `/demo`
stops sweeping the `demo:pending` backlog and instead resolves exactly one item per invocation
(this session's own recall-detected work, or one explicit `#N`), gains a pre-flight
self-verification step before ever handing a human a live walkthrough or manual instructions, and
`/help` becomes the sole discovery surface for what's outstanding across the backlog.

**Architecture:** Every change is skill/shared-procedure prose — no backing code exists for
`/demo` (`bin/` has no `demo.js`), so there are no unit tests to write. Each task edits specific,
verbatim-quoted sections of markdown files, verifies via targeted `grep` (confirming new text
landed and — where the Edit tool's own uniqueness requirement doesn't already prove it — that
stale text is gone), runs `npm test` to confirm zero regression to the existing 1593-test suite,
and commits.

**Tech Stack:** Markdown skill files (YAML frontmatter + prose), no code.

## Global Constraints

- No code changes anywhere in this plan — every task edits `.md` files only.
- `npm test` must report `# pass 1593` / `# fail 0` after every task (same baseline confirmed
  before this plan started) — any deviation is a regression, not an expected change.
- Every `Edit` call's `old_string` must be the exact, complete, currently-verbatim text quoted in
  this plan — if a task's `old_string` fails to match (file drifted since this plan was written),
  stop and re-read the live file before proceeding; do not improvise a fuzzy match.
- Work from this worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/demo-skill-single-item-scope`. Confirm with `pwd && git rev-parse --show-toplevel` before every commit — both must resolve to this worktree path, not the main checkout.
- Commit after each task individually (small, reviewable diffs) — never bundle two tasks into one commit.
- Do not edit anything under `docs/superpowers/plans/` or `docs/superpowers/specs/` other than this plan file and its paired design doc — those are historical/target-state records, not implementation surface.

---

### Task 1: `/help` becomes the acceptance-queue discovery surface

**Files:**
- Modify: `skills/_shared/github-pr-scan.md` (the `acceptance-queue` scope section)
- Modify: `skills/help/status-scan.md` (Stage 4.7)
- Modify: `skills/help/SKILL.md` (the `/claude-tweaks:demo` relationship row)

**Interfaces:**
- Produces: the exact new render-format sentence (`Awaiting sign-off: **{N} records** — #1123,
  #1124, ... (run /demo #N on any of these)`) and the phrase `sole discovery surface for the
  acceptance queue` — Task 3's `/demo` Relationship-table row (Section 6 of the design) quotes
  this same framing, so keep the wording below verbatim.

- [ ] **Step 1: Rewrite the `acceptance-queue` scope in `github-pr-scan.md`**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/demo-skill-single-item-scope" && pwd && git rev-parse --show-toplevel
```

Edit `skills/_shared/github-pr-scan.md`:

old_string:
```
## Scope: `acceptance-queue` (consumed by /help Stage 4.7)

One cheap count for the dashboard's Acceptance Queue section — deliberately `--state all`,
unlike every other count in this file, since `demo:pending` persists independent of open/closed
state (an `auto:merge`'d record's issue can already be closed while still awaiting sign-off).

```bash
gh issue list --label demo:pending --state all --json number --limit 200 -q 'length'
```

Render as one line: `Awaiting sign-off: **{N} records built and ready for your review**` —
omit entirely when the count is 0.
```

new_string:
```
## Scope: `acceptance-queue` (consumed by /help Stage 4.7)

One cheap list for the dashboard's Acceptance Queue section — deliberately `--state all`, unlike
every other count in this file, since `demo:pending` persists independent of open/closed state
(an `auto:merge`'d record's issue can already be closed while still awaiting sign-off). `/demo`
no longer sweeps this backlog itself (it resolves one item per invocation), so this is the sole
place the outstanding set is enumerated.

```bash
gh issue list --label demo:pending --state all --json number,title --limit 200
```

Render as one line listing every matching record: `Awaiting sign-off: **{N} records** — #{n1}
({title1}), #{n2} ({title2}), ... — run /demo #N on any of these` — omit entirely when the count
is 0.
```

- [ ] **Step 2: Rewrite Stage 4.7 in `help/status-scan.md`**

Edit `skills/help/status-scan.md`:

old_string:
```
## Stage 4.7: Acceptance Queue (GitHub)

Cheap count only — the walkthrough stays `/claude-tweaks:demo`'s job, not `/help`'s. Skip
silently (same fail-open detection ladder as Stage 4.5/4.6) when `gh` is unavailable,
unauthenticated, or the repo has no GitHub remote.
```

new_string:
```
## Stage 4.7: Acceptance Queue (GitHub)

Cheap list only — the walkthrough stays `/claude-tweaks:demo`'s job, not `/help`'s. `/demo` no
longer sweeps the `demo:pending` backlog itself (it resolves a single item per invocation — this
session's own recall-detected work, or one explicit `#N`), so this stage is the sole discovery
surface for which records are outstanding. Skip silently (same fail-open detection ladder as
Stage 4.5/4.6) when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.
```

- [ ] **Step 3: Update the `/demo` relationship row in `help/SKILL.md`**

Edit `skills/help/SKILL.md`:

old_string:
```
| `/claude-tweaks:demo` | Surfaces the `demo:pending` count on the dashboard (Stage 4.7, `acceptance-queue` scope) — the reciprocal of `demo/SKILL.md`'s own `/claude-tweaks:help` row. |
```

new_string:
```
| `/claude-tweaks:demo` | `/help` is the sole discovery surface for the acceptance queue — lists every outstanding `#N` (Stage 4.7, `acceptance-queue` scope), not just a count; `/demo #N` executes the walkthrough for one — the reciprocal of `demo/SKILL.md`'s own `/claude-tweaks:help` row. |
```

- [ ] **Step 4: Verify the edits landed**

```bash
grep -n "number,title" skills/_shared/github-pr-scan.md
grep -n "sole discovery surface" skills/_shared/github-pr-scan.md skills/help/status-scan.md skills/help/SKILL.md
grep -n "Cheap list only" skills/help/status-scan.md
```

Expected: the first command matches inside the `acceptance-queue` scope section; the second
matches in `github-pr-scan.md` (new scope prose) and `help/SKILL.md`'s updated row (`status-
scan.md` does not need to contain this exact phrase — its own wording is "sole discovery
surface for which records are outstanding," a superset match); the third matches Stage 4.7's new
first line.

- [ ] **Step 5: Run the test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 1593`, `# fail 0` (no code touched by this task).

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/help/status-scan.md skills/help/SKILL.md
git commit -m "$(cat <<'EOF'
Make /help the sole discovery surface for the acceptance queue

Stage 4.7 now lists every outstanding #N instead of a bare count, since
/demo (next task) stops sweeping the demo:pending backlog itself.
EOF
)"
```

---

### Task 2: `/demo` — rewrite discovery (Step 1), remove the batch sweep (old Step 2)

**Files:**
- Modify: `skills/demo/SKILL.md` (frontmatter, intro, When to Use, Input, Step 1, deletion of old
  Step 2, Next Actions)

**Interfaces:**
- Consumes: Task 1's finished `/help` acceptance-queue wording (referenced in the new "When to
  Use" bullet below).
- Produces: the renumbered step sequence — after this task, `## Step 1` is the (rewritten)
  discovery step, and the file's next heading is `## Step 3: Per-item walkthrough` (old numbering,
  untouched by this task — Task 3 renumbers it to `## Step 2` and rewrites its body). Task 3
  depends on this task landing first so there is no longer a `## Step 2: Present the batch`
  heading to collide with the rename.

- [ ] **Step 1: Rewrite the frontmatter `description`**

Edit `skills/demo/SKILL.md`:

old_string:
```
name: claude-tweaks:demo
description: Use when you want to sweep every built-but-unsigned-off work record — or recap and sign off on ad hoc work from this same conversation that has no work record at all — and give each one a human verdict, approve or request changes. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review). Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall.
argument-hint: "[#N]"
```

new_string:
```
name: claude-tweaks:demo
description: Use when you want a human verdict — approve or request changes — on one built thing: this same conversation's own unrecorded work, or a specific `#N` record already marked demo:pending. The durable acceptance gate distinct from tests passing (/test) and code-quality review (/review); discovery of what's outstanding across the backlog is /help's job (Stage 4.7), not this skill's. Keywords - acceptance, sign-off, demo, verification brief, human verdict, demo:pending, session-recall.
argument-hint: "[#N]"
```

- [ ] **Step 2: Rewrite the H1 intro paragraph and diagram caption**

Edit `skills/demo/SKILL.md`:

old_string:
```
# Demo — Human Acceptance Sign-Off

Aggregates every record `/claude-tweaks:wrap-up` has finished building (`demo:pending`) — whether merged already or still open, whether built autonomously or by hand — plus any work this same conversation did with no backing record at all, and gives each one a real human verdict. Sits after wrap-up when a record exists; independent of it entirely for conversation-based work with no record to wait on:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, across every in-flight thread)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

A second, independent path exists for conversation-based work with no record at all — see Step
1's session-recall source below.
```

new_string:
```
# Demo — Human Acceptance Sign-Off

Gives one built thing a real human verdict — approve or request changes: either this
conversation's own unrecorded work, or a specific `#N` record. Sits after wrap-up when a record
exists; independent of it entirely for conversation-based work with no record to wait on. This
skill resolves one item per invocation — it never discovers or lists what's outstanding across
the backlog; `/claude-tweaks:help`'s dashboard (Stage 4.7) is where that list lives:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                              │
                                                                              v
                                                              [ /claude-tweaks:demo ]   <- utility (no fixed lifecycle position — run anytime, on one item at a time)
                                                                              │
                                                       ┌──────────────────────┴──────────────────────┐
                                                       v                                              v
                                              demo:approved                          demo:changes-requested → follow-up record (backlog)
```

A second, independent path exists for conversation-based work with no record at all — see Step
1's session-recall source below.
```

- [ ] **Step 3: Rewrite "When to Use"**

Edit `skills/demo/SKILL.md`:

old_string:
```
## When to Use

- You're running several parallel threads (`/dispatch`-driven or your own `/flow`/`/build` sessions) and want one place that shows everything built and waiting on your judgment.
- An autonomously `auto:merge`'d record already closed — you want to look at it after the fact and mark it approved, or flag a gap.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.
- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.

Not for: merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis.
```

new_string:
```
## When to Use

- You just finished ad hoc work in this same conversation — no `/capture`, no work record — and want a clean recap plus an explicit sign-off gate before moving on; `/demo`'s session-recall source (Step 1) picks this up automatically, no filing required.
- `/claude-tweaks:help`'s dashboard told you a specific `#N` is awaiting sign-off (Stage 4.7) — including an autonomously `auto:merge`'d record already closed — and you want to walk through that one record now.
- You keep having to ask "how do I test this" days after a build finished — this skill surfaces the brief `/wrap-up` already wrote at build time, so you never re-derive it.
- Some of what you're reviewing has no interactive surface at all (docs, config, a backend refactor) — this skill still gives it a lightweight human look, just not a click-through.

Not for: discovering what's outstanding across the backlog (`/claude-tweaks:help`'s job — Stage 4.7 lists every `#N`), merging or opening PRs (`/superpowers:finishing-a-development-branch`'s job), re-running mechanical checks (`/test`'s job), or code-quality judgment (`/review`'s job). `/demo` only ever resolves the Acceptance axis, one item at a time.
```

- [ ] **Step 4: Rewrite "Input"**

Edit `skills/demo/SKILL.md`:

old_string:
```
## Input

`$ARGUMENTS` — *(none)* sweeps every `demo:pending` record plus this session's own unrecorded work (Step 1's two sources); `#N` scopes to a single label-backed record and skips the session-recall source entirely — a specific record number has nothing to do with recall.
```

new_string:
```
## Input

`$ARGUMENTS` — *(none)* resolves this session's own unrecorded work via session-recall (Step 1);
`#N` resolves that single record's Verification Brief, falling back to session-recall scoped to
that `#N` when no `demo:pending` label exists on it (Step 1). Never sweeps the backlog —
`/claude-tweaks:help` (Stage 4.7) is where the full outstanding list lives.
```

- [ ] **Step 5: Rewrite Step 1 and delete old Step 2 in one edit**

This replaces the entire span from `## Step 1: Discover pending work` through the end of the old
batch-table section, up to (but not including) `## Step 3: Per-item walkthrough`.

Edit `skills/demo/SKILL.md`:

old_string:
```
## Step 1: Discover pending work

Two independent sources feed the same worklist, every run — not a fallback chain. Gather both,
then merge before Step 2.

### Source A: label-backed records

**`work-backend: github-issues`:**

```bash
gh issue list --state all --label demo:pending --json number,title,labels,url --limit 500 > /tmp/demo-pending.json
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

> **Parallel execution:** Use parallel tool calls aggressively — under `work-backend: github-issues`, each matching record's `gh issue view {n} --json comments` Verification Brief fetch is independent of every other record's and should run concurrently, not one at a time.

For each matching record, fetch its Verification Brief: the last issue comment containing
`## Verification Brief` (`gh issue view {n} --json comments -q '.comments[-1].body'` if only one
build/demo cycle occurred; otherwise search all comments for the last one containing that
heading).

**`work-backend: local-files`:** `queryRecords` filters on `closed` only when the caller
explicitly passes that key, so a bare `{ acceptance: 'pending' }` call silently drops every
closed record — mirror the `--state all` behavior above with two calls, merged:
`queryRecords(dir, { acceptance: 'pending' })` (open) plus
`queryRecords(dir, { acceptance: 'pending', closed: true })` (closed)
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
`effort:low`. Every other record gets **Needs a look**, no pre-fill —
this skill exists for real judgment, not rubber-stamping. (This rule does not check
`merge-sensitive-paths` (`_shared/work-record.md`'s config key): Source A's fetch is labels +
Verification Brief only, with no changed-file list, and most `demo:pending` records merged via
`/dispatch`'s auto-merge gate — a direct `git merge`, never a GitHub PR — so there is no
reliable `gh`-only source for a record's changed files here. `merge-sensitive-paths` is already
enforced as a hard floor earlier, inside that auto-merge gate's `merge-check` call to
`/claude-tweaks:assess-agent-autonomy`.) Session-recall entries never carry
`risk:*`/`effort:*` labels (there's no record to hold them), so they always render `{ref}` as
`(session)`, `{type}` as `ad hoc`, `{risk}/{effort}` as `—`, and always get **Needs a look**. When overriding specific items, refer to a session-recall row as "the session item" (not a `#`).

Call `AskUserQuestion` with `question`: `"How do you want to work through these?"`,
`header`: `"Sign-off"`, `multiSelect`: `false`:

- Option 1 (when any row is pre-filled Approve) — `label`: `"Approve the low-risk batch, walk through the rest (Recommended)"`, `description`: `"Bulk-approve every row suggested Approve; walk through the remaining rows one at a time"`
- Option 2 — `label`: `"Walk through every item individually"`, `description`: `"No bulk approval — review every record's full brief"`
- Option 3 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

## Step 3: Per-item walkthrough
```

new_string:
```
## Step 1: Resolve the one item

`/demo` resolves exactly one unit of work per invocation — never a sweep. `$ARGUMENTS` selects
which path runs.

### No arguments: session-recall

Recall this conversation's own history. For each distinct unit of implementation and/or
verification work done in this session, check whether it already correlates to a `#N` mentioned
anywhere in this conversation. Work with no correlating `#N` is a session-recall candidate —
compose its Verification Brief content now, directly from recall, into the same shape
`verification-brief.md` renders (`### The ask` / `### What shipped` / `### Confirmed` / `### See
it yourself`):

- **The ask** — what was actually requested in this conversation, for this unit of work.
- **What shipped** — what was actually implemented, from recall.
- **Confirmed** — whatever was actually verified this session (a live browser walk, test runs,
  manual checks), described plainly, including what wasn't checked — not a checklist pretending
  completeness.
- **See it yourself** — an entry point, only if one was actually exercised/known; omit the
  section entirely otherwise.

This path has no fetch step — there is no comment or record body to read from. A fresh `/demo`
session with no memory of any unrecorded work naturally finds nothing here; that's expected, not
a bug (session-recall never discovers *other* sessions' unrecorded work). Report "Nothing
awaiting sign-off." and stop — do not call `AskUserQuestion` — when recall finds nothing.

Almost always this yields exactly one candidate — skip straight to Step 2 with it. On the rare
occasion this session did 2+ genuinely distinct, uncorrelated units of work, walk each through
Step 2 in sequence — no batch table, no bulk-decision question; session-recall entries never
carry `risk:*`/`effort:*` data to pre-fill a bulk-approve option against.

### `#N` given: single-record lookup

**`work-backend: github-issues`:**

```bash
gh issue view {n} --json number,title,labels,url,state
```

If the result carries the `demo:pending` label, fetch its Verification Brief: the last issue
comment containing `## Verification Brief` (`gh issue view {n} --json comments -q
'.comments[-1].body'` if only one build/demo cycle occurred; otherwise search all comments for
the last one containing that heading). Go straight to Step 2 with it.

If the result does **not** carry `demo:pending` (e.g. it was built via a path that skipped
`/wrap-up`'s Step 10), fall back to session-recall for this specific `#N`: does this conversation
have memory of building and/or verifying it? If yes, compose a Verification Brief exactly as the
no-arguments path does above, scoped to this one record, and go straight to Step 2. If this
session has no memory of it either, report plainly: "`#N` has no Verification Brief and this
session has no memory of it — nothing to show." and stop.

**`work-backend: local-files`:** `readRecord(filePath)` for the single record
(`bin/lib/issues/local-store.js`); the Verification Brief is the record's own `## Verification
Brief` body section. Same `demo:pending`-then-session-recall fallback order as above, keyed on
`facets.acceptance === 'pending'` instead of the label.

## Step 3: Per-item walkthrough
```

- [ ] **Step 6: Rewrite the "Run demo again later" Next Action**

Edit `skills/demo/SKILL.md`:

old_string:
```
- Option 3 (when records remain `demo:pending` after Skip) — `label`: `"Run demo again later"`, `description`: `"{N} records still awaiting sign-off — /claude-tweaks:demo picks them back up next run"`
```

new_string:
```
- Option 3 (when this record remains `demo:pending` after Skip) — `label`: `"Check what else is outstanding"`, `description`: `"/claude-tweaks:help — lists every #N still awaiting sign-off (Stage 4.7)"`
```

- [ ] **Step 7: Verify**

```bash
grep -n "^## Step" skills/demo/SKILL.md
grep -n "sweep\|Source A\|Source B\|batch table\|bulk-approve\|How do you want to work through these" skills/demo/SKILL.md
```

Expected: the first command lists exactly `## Step 1: Resolve the one item`, `## Step 3:
Per-item walkthrough`, `## Step 4: Apply verdicts` (Step 2's heading is gone; Steps 3 and 4 are
renumbered by Task 3, not this one — seeing them still numbered 3/4 here is correct and
expected). The second command should match nothing inside Steps 1-4 (a stray match inside a
later section — Anti-Patterns, Relationship table — is expected and gets fixed by Task 3, not
this one; only confirm no match between the `## Step 1` and `## Step 3` headings, e.g. via `sed
-n '/^## Step 1/,/^## Step 3/p' skills/demo/SKILL.md | grep -n "sweep\|Source A\|Source B\|batch table\|bulk-approve"` which should print nothing).

- [ ] **Step 8: Run the test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 1593`, `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add skills/demo/SKILL.md
git commit -m "$(cat <<'EOF'
Narrow /demo to single-item scope, remove the backlog sweep

/demo no longer sweeps the demo:pending queue or renders a batch table.
It resolves exactly one item per invocation: this session's own
recall-detected work, or one explicit #N (with a session-recall fallback
for records a build path skipped labeling). Discovery of what's
outstanding moved to /help (previous task).
EOF
)"
```

---

### Task 3: `/demo` — pre-flight self-verification, quality contract, scope-fork, task-anchor

**Files:**
- Modify: `skills/demo/SKILL.md` (rewrite the per-item walkthrough step, renumber the two
  remaining steps, fix internal cross-references, rewrite Anti-Patterns and the Relationship
  table's `/browse`/`/visual-review`/`/help` rows)

**Interfaces:**
- Consumes: Task 2's Step 1 (referenced by name — "Step 1's `#N` lookup" / "Step 1's
  no-arguments path" — in the rewritten Step 3's opening sentence below) and Task 1's `/help`
  wording (quoted in the Relationship-table row below).
- Produces: the final step numbering (`## Step 1` discovery, `## Step 2` per-item walkthrough,
  `## Step 3` apply verdicts) and the option names `"See it yourself"` / `"Show me live"` /
  `"Give me the steps"` — Task 4's cross-file fixes in `browse/SKILL.md` and
  `visual-review/SKILL.md` reference these exact names and step numbers.

- [ ] **Step 1: Renumber `## Step 3: Per-item walkthrough` to `## Step 2` and rewrite its body**

Edit `skills/demo/SKILL.md`:

old_string:
```
## Step 3: Per-item walkthrough

For every record not bulk-approved in Step 2, render its full Verification Brief (The ask / What
shipped / Confirmed / See it yourself — evidence the human can judge, not a checklist to
complete). Label-backed entries were fetched per `verification-brief.md`'s digest template in
Step 1's Source A; session-recall entries were composed directly from recall, also in Step 1
(Source B), into the same four-heading shape — both render identically here. Then call
`AskUserQuestion` with `question`: `"Does {title} do what you asked for?"`, `header`:
`"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 (only when the brief's "See it yourself" entry point resolved) — `label`: `"Show me live"`, `description`: `"Open {entry point} in a live browser session before deciding"`
- Option 3 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 4 — for a label-backed entry: `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`. For a session-recall entry: `label`: `"Skip for now"`, `description`: `"Nothing is written — unlike a label-backed record, this won't resurface in a later session"`

**"Show me live"**: open an `agent-browser` session at the brief's resolved entry point, following
`/claude-tweaks:browse`'s conventions (session naming, lifecycle) directly — the same relationship
`/claude-tweaks:visual-review` already has with `/claude-tweaks:browse`, not a workflow-step
invocation of `/claude-tweaks:browse` itself. After the human finishes looking, close the session
(leaked sessions consume resources — same discipline `/claude-tweaks:browse`'s own Anti-Patterns
table requires), then re-render the same
`AskUserQuestion` for this record with only Approve / Request changes / Skip for now (the live
look already happened — don't offer it twice for the same record).
```

new_string:
```
## Step 2: Per-item walkthrough

Render this record's full Verification Brief (The ask / What shipped / Confirmed / See it
yourself — evidence the human can judge, not a checklist to complete). Label-backed entries were
fetched per `verification-brief.md`'s digest template in Step 1's `#N` lookup; session-recall
entries were composed directly from recall, also in Step 1's no-arguments path — both render
identically here. Then call `AskUserQuestion` with `question`: `"Does {title} do what you asked
for?"`, `header`: `"Verdict"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Approve"`, `description`: `"This does what was asked"`
- Option 2 (only when the brief's "See it yourself" entry point resolved) — `label`: `"See it yourself"`, `description`: `"Check this before deciding"`
- Option 3 — `label`: `"Request changes"`, `description`: `"There's a gap — I'll describe it"`
- Option 4 — for a label-backed entry: `label`: `"Skip for now"`, `description`: `"Leave demo:pending — I'll come back to this"`. For a session-recall entry: `label`: `"Skip for now"`, `description`: `"Nothing is written — unlike a label-backed record, this won't resurface in a later session"`

### "See it yourself": pre-flight, then live or manual

Picking this option never hands over untested instructions. First, run a pre-flight check:

1. Resolve a working dev server via `dev-url-detection.md`'s existing procedure — already
   project-agnostic (port probing, `CLAUDE.md`/`package.json` command detection, worktree
   awareness) and already auto-starts an ephemeral server on a free port when nothing is running.
2. Open a quick `agent-browser` session at the resolved entry point (following
   `/claude-tweaks:browse`'s conventions directly — the same relationship
   `/claude-tweaks:visual-review` already has with `/claude-tweaks:browse`) and confirm the target
   page actually renders, not just an HTTP 200. If the page requires auth and credentials are
   already resolvable (Auth Vault / `stories/auth.yml`, the same source `/stories` uses), attempt
   login too. No configured credentials → skip the login check; reachability/render alone is
   still worth confirming.
3. Close the session.

Runs once per record per `/demo` session and is reused for the rest of that record's walkthrough.

**Pre-flight succeeds:** ask one short follow-up — `question`: `"Open a live session and show
you, or give you the steps to check it yourself?"`, `header`: `"How to check"`, `multiSelect`:
`false`:

- Option 1 — `label`: `"Show me live"`, `description`: `"Open a live browser session now"`
- Option 2 — `label`: `"Give me the steps"`, `description`: `"I'll run it myself"`

**"Show me live" (sub-choice):** open a fresh `agent-browser` session at the already-verified
entry point (or reuse the pre-flight's own session if still open). After the human finishes
looking, close the session (leaked sessions consume resources — same discipline
`/claude-tweaks:browse`'s own Anti-Patterns table requires), then re-render this record's
`AskUserQuestion` with only Approve / Request changes / Skip for now (the live look already
happened — don't offer "See it yourself" twice for the same record).

**"Give me the steps" (sub-choice):** compose manual instructions from the pre-flight's own
verified URL/port/credentials — never a guessed default — following this checklist:

- **Self-contained** — every command block includes its own `cd` to the right checkout/worktree;
  never assume an inherited working directory.
- **Copy-paste-clean** — no inline commentary inside a block meant to be pasted as-is;
  explanation goes in prose before/after the block, never inside it.
- **Proactively explain surprising-but-correct state** the pre-flight itself observed while
  rendering (e.g. an empty dashboard on first load) — inline, before the human has to ask.

After presenting the steps, re-render this record's `AskUserQuestion` with only Approve / Request
changes / Skip for now, same as the live sub-choice above.

**Pre-flight fails:** this is evidence, not a side quest to chase mid-conversation. Capture what
broke (screenshot, console error) and fold it directly into this record's brief as grounds for
**Request changes** — skip the live-vs-manual follow-up question entirely, a broken environment
is broken either way. `/demo` never debugs or fixes the underlying application code itself — that
stays out of scope the same way code-quality judgment already does (`/review`'s job).

**Browser tools unavailable:** same fallback `verification-brief.md` already documents — skip
without blocking, note visual verification wasn't available in this environment, proceed with
Approve / Request changes / Skip for now only (no "See it yourself" option at all in this case).

### Scope-fork checkpoint

If, anywhere in this walkthrough, the human asks for something beyond confirming this record's
existing behavior — a new feature, a change beyond what pre-flight needed to make the environment
checkable — stop once (the first time this happens in this `/demo` session) before doing it:

> "That's new scope beyond what's being demoed here. Want me to capture it as a backlog item now
> and come back to your sign-off decision, or build it now as its own thing outside `/demo`?"

Route "capture it" through the same follow-up-record mechanism Step 3's Request-changes branch
already uses. If the human says "keep going," don't re-ask for further closely-related work in
this same session.

### Task-anchor discipline

This record's verdict — not yet Approved/Request-changes/Skipped — must never be silently
dropped because the conversation moves on, whether from a pre-flight failure that grows its own
back-and-forth or a scope-fork detour above. Once any such detour concludes, before shifting to a
new unrelated topic, restate that this record's decision is still outstanding and offer to
resume. Never end a `/demo` run with a record left mid-decision and unmentioned.
```

- [ ] **Step 2: Renumber `## Step 4: Apply verdicts` to `## Step 3` and fix its Source A/B labels**

Edit `skills/demo/SKILL.md`:

old_string:
```
## Step 4: Apply verdicts

**Label-backed entries** (Source A, Step 1): bootstrap `demo:approved` and
`demo:changes-requested` via the check-then-create loop from `_shared/label-bootstrap.md` before
the first swap this run.

- **Approve** (bulk or individual) — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
```

new_string:
```
## Step 3: Apply verdicts

**Label-backed entries** (Step 1's `#N` lookup): bootstrap `demo:approved` and
`demo:changes-requested` via the check-then-create loop from `_shared/label-bootstrap.md` before
the first swap this run.

- **Approve** — `gh issue edit {n} --remove-label demo:pending --add-label demo:approved` (`local-files`: set `facets.acceptance = 'approved'` via `writeRecord`).
```

- [ ] **Step 3: Fix the session-recall label in the same step**

Edit `skills/demo/SKILL.md`:

old_string:
```
**Session-recall entries** (Source B, Step 1) — no record exists, so nothing here ever
bootstraps a label or writes to GitHub/local-files for Approve or Skip:
```

new_string:
```
**Session-recall entries** (Step 1's no-arguments path) — no record exists, so nothing here ever
bootstraps a label or writes to GitHub/local-files for Approve or Skip:
```

- [ ] **Step 4: Rewrite the Anti-Patterns table**

Edit `skills/demo/SKILL.md`:

old_string:
```
## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Bulk-approving everything regardless of risk tier | This skill exists for real human judgment — only the `risk:low`+`effort:low` tier gets a pre-filled Approve suggestion, and it's still a choice, not a default |
| Re-deriving "how do I test this" from the diff | The Verification Brief already has it — `/wrap-up` wrote it at build time with full context; read the brief, don't reconstruct it |
| Merging or opening a PR from within this skill | Merge/PR decisions belong to `/superpowers:finishing-a-development-branch` — `/demo` only ever resolves the Acceptance axis |
| Silently dropping a `demo:pending` record with no verdict | Every record gets Approve / Request changes / Skip — Skip is explicit and leaves `demo:pending` for next run, it never disappears from the worklist unrecorded |
| Treating a record with no interactive surface as not needing sign-off | Non-testable work still gets a lightweight human look — the brief just reframes the ask as "review the diff/rationale" instead of "click through this" |
| Scanning only open issues | `demo:pending` persists on closed issues too (auto-merged autonomous work) — always query `--state all` |
| Leaving a "Show me live" session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
| Writing `demo:approved`/`demo:pending` for a session-recall entry | There's no record to hold it — the verdict lives in the conversation, not a label. Only a Request-changes verdict ever produces a real record for one of these. |
```

new_string:
```
## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Handing over "Give me the steps" instructions without running the pre-flight first | The human becomes the integration test, discovering port collisions and broken auth one round-trip at a time instead of Claude catching them in a 30-second automated check |
| Re-deriving "how do I test this" from the diff | The Verification Brief already has it — `/wrap-up` wrote it at build time with full context; read the brief, don't reconstruct it |
| Merging or opening a PR from within this skill | Merge/PR decisions belong to `/superpowers:finishing-a-development-branch` — `/demo` only ever resolves the Acceptance axis |
| Silently dropping a record mid-decision because the conversation moved on | A pending verdict must be explicitly restated before shifting to a new topic — see the Task-anchor discipline in Step 2 |
| Treating a record with no interactive surface as not needing sign-off | Non-testable work still gets a lightweight human look — the brief just reframes the ask as "review the diff/rationale" instead of "click through this" |
| Debugging or fixing an application bug a pre-flight check uncovers | That's out of scope the same way code-quality judgment already is — capture it as a Request-changes candidate, don't chase it mid-conversation |
| Leaving a "See it yourself" live session open after the verdict is captured | Leaked sessions consume resources — close it the same way `/browse`'s own Anti-Patterns table requires, immediately after the human finishes looking, before re-rendering the verdict question |
| Writing `demo:approved`/`demo:pending` for a session-recall entry | There's no record to hold it — the verdict lives in the conversation, not a label. Only a Request-changes verdict ever produces a real record for one of these. |
| Sweeping the `demo:pending` backlog from within this skill | Discovery is `/claude-tweaks:help`'s job (Stage 4.7, which lists every outstanding `#N`) — `/demo` resolves one item per invocation, never a sweep |
```

- [ ] **Step 5: Update the Relationship table's `/browse`, `/visual-review`, and `/help` rows**

Edit `skills/demo/SKILL.md`:

old_string:
```
| `/claude-tweaks:browse` | `/demo`'s "Show me live" option (Step 3) consumes /browse's conventions directly (session naming, lifecycle) for an on-demand live look — the same relationship /claude-tweaks:visual-review has with /browse, not a workflow-step invocation |
| `/claude-tweaks:visual-review` | `/demo`'s Verification Brief digest (Step 3) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. |
| `/claude-tweaks:help` | `/help`'s dashboard surfaces a `demo:pending` count as a lightweight signal; `/demo` is where the actual walkthrough happens |
```

new_string:
```
| `/claude-tweaks:browse` | `/demo`'s "See it yourself" option (Step 2) consumes /browse's conventions directly (session naming, lifecycle) for an on-demand live look — the same relationship /claude-tweaks:visual-review has with /browse, not a workflow-step invocation |
| `/claude-tweaks:visual-review` | `/demo`'s Verification Brief digest (Step 2) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. |
| `/claude-tweaks:help` | `/help` is the sole discovery surface for the acceptance queue — lists every outstanding `#N` (Stage 4.7, `acceptance-queue` scope), not just a count; `/demo #N` executes the walkthrough for one |
```

- [ ] **Step 6: Verify**

```bash
grep -n "^## Step" skills/demo/SKILL.md
grep -n "Show me live\|Source A\|Source B\|bulk-approv\|Step 3\|Step 4" skills/demo/SKILL.md
```

Expected: the first command now lists exactly `## Step 1: Resolve the one item`, `## Step 2:
Per-item walkthrough`, `## Step 3: Apply verdicts`. The second command's only acceptable matches
are: the sub-choice option `"Show me live"` inside the new "See it yourself" pre-flight prose
(this is a deliberate sub-option name, not a stale top-level option — confirm by checking it
appears under `### "See it yourself": pre-flight, then live or manual`), and the Relationship
table's `Verification Brief (Step 2)`/`(Step 2)` references (which are correct, not "Step 3/4").
No `Source A`, `Source B`, or `bulk-approv` match should remain anywhere in the file.

- [ ] **Step 7: Run the test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 1593`, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add skills/demo/SKILL.md
git commit -m "$(cat <<'EOF'
Add pre-flight self-verification to /demo's per-item walkthrough

"Show me live" is renamed "See it yourself" and gains a pre-flight
check (resolve + render + login via dev-url-detection.md and
agent-browser) before ever handing over a live session or manual
instructions. Adds a manual-instructions quality contract, a
once-per-session scope-fork checkpoint, and task-anchor discipline so a
pending verdict is never silently dropped.
EOF
)"
```

---

### Task 4: Fix reciprocal cross-file references in `browse` and `visual-review`

**Files:**
- Modify: `skills/browse/SKILL.md` (two spots: a "When to Use" bullet, and the Relationship-table
  `/demo` row)
- Modify: `skills/visual-review/SKILL.md` (the Relationship-table `/demo` row)

**Interfaces:**
- Consumes: Task 3's option name (`"See it yourself"`) and step number (`Step 2`) — this task
  only updates *other* files' descriptions of `/demo`; it makes no changes to `/demo` itself.

- [ ] **Step 1: Fix the "When to Use" bullet in `browse/SKILL.md`**

Edit `skills/browse/SKILL.md`:

old_string:
```
- `/claude-tweaks:demo` opens an on-demand live look at a record's resolved entry point ("Show me live")
```

new_string:
```
- `/claude-tweaks:demo` opens an on-demand live look at a record's resolved entry point ("See it yourself")
```

- [ ] **Step 2: Fix the Relationship-table row in `browse/SKILL.md`**

Edit `skills/browse/SKILL.md`:

old_string:
```
| `/claude-tweaks:demo` | `/demo`'s "Show me live" option (Step 3) opens an on-demand `agent-browser` session at a record's resolved entry point, following /browse's session-naming and lifecycle conventions directly — not a workflow-step invocation, the same relationship `/visual-review` has with `/browse`. |
```

new_string:
```
| `/claude-tweaks:demo` | `/demo`'s "See it yourself" option (Step 2) opens an on-demand `agent-browser` session at a record's resolved entry point, following /browse's session-naming and lifecycle conventions directly — not a workflow-step invocation, the same relationship `/visual-review` has with `/browse`. |
```

- [ ] **Step 3: Fix the Relationship-table row in `visual-review/SKILL.md`**

Edit `skills/visual-review/SKILL.md`:

old_string:
```
| `/claude-tweaks:demo` | `/demo`'s Verification Brief digest (Step 3) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. `/demo`'s optional "Show me live" escape hatch consumes /browse's conventions directly (the same relationship /visual-review itself has with /browse), not a re-invocation of /visual-review. |
```

new_string:
```
| `/claude-tweaks:demo` | `/demo`'s Verification Brief digest (Step 2) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. `/demo`'s optional "See it yourself" escape hatch consumes /browse's conventions directly (the same relationship /visual-review itself has with /browse), not a re-invocation of /visual-review. |
```

- [ ] **Step 4: Verify no stale references remain anywhere in the repo**

```bash
grep -rn "Show me live" skills/ CLAUDE.md 2>/dev/null
```

Expected: no output. (This intentionally excludes `docs/superpowers/plans/` and
`docs/superpowers/specs/` — historical records correctly still describe the old name; do not
edit them.)

- [ ] **Step 5: Run the test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 1593`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add skills/browse/SKILL.md skills/visual-review/SKILL.md
git commit -m "$(cat <<'EOF'
Sync browse and visual-review's stale /demo references

/demo's live-look option was renamed "Show me live" -> "See it
yourself" and renumbered Step 3 -> Step 2 in the prior task; these are
the two reciprocal relationship-table rows describing it from the
other side.
EOF
)"
```

---

### Task 5: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing from earlier tasks except that they're all committed.

- [ ] **Step 1: Check for a concurrent bump on origin/main**

```bash
git fetch origin main --quiet
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

Expected: the newest entry is still `5db6070 Bump to 6.16.1 for Step 13's live branch-mismatch
warning` (confirmed at plan-writing time). If a newer bump appears, read its target version and
use the next free minor version above it instead of 6.17.0 below.

- [ ] **Step 2: Bump the version**

Edit `.claude-plugin/plugin.json`:

old_string:
```
  "version": "6.16.1",
```

new_string:
```
  "version": "6.17.0",
```

- [ ] **Step 3: Verify**

```bash
grep -n '"version"' .claude-plugin/plugin.json
```

Expected: `"version": "6.17.0",`

- [ ] **Step 4: Run the full test suite one final time**

```bash
npm test 2>&1 | tail -10
```

Expected: `# pass 1593`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
Bump to 6.17.0 for /demo single-item scope + pre-flight verification
EOF
)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** Design Section 1 (pre-flight) -> Task 3 Step 1. Section 2 (quality contract)
  -> Task 3 Step 1 (the "Give me the steps" sub-choice checklist). Section 3 (scope-fork) -> Task
  3 Step 1. Section 4 (task-anchor) -> Task 3 Step 1. Section 5 (single-item scope) -> Task 2
  (discovery rewrite) + Task 3 Steps 1-3 (renumbering, per-item walkthrough, apply-verdicts
  labels). Section 6 (/help discovery) -> Task 1. The design's Non-Goals list nothing this plan
  should additionally implement.
- **Placeholder scan:** no TBD/TODO; every edit above is the literal before/after text, not a
  description of one.
- **Type/name consistency:** option names (`"See it yourself"`, `"Show me live"`, `"Give me the
  steps"`, `"Approve"`, `"Request changes"`, `"Skip for now"`) and step numbers (`Step 1`/`Step
  2`/`Step 3`) are used identically across Tasks 2, 3, and 4 — cross-checked via the `grep -n
  "^## Step"` verification in Tasks 2 and 3, and the repo-wide `grep -rn "Show me live"` sweep in
  Task 4.
- **Known gap this plan deliberately does not close:** the design's own Non-Goals — no local-
  verification runbook persistence, no `/flow`-invokes-`/wrap-up` fix, no `/triage`/`/review-
  backlog` widening. Do not add tasks for these.
