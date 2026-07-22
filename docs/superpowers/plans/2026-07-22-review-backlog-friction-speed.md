# review-backlog Friction & Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `/claude-tweaks:review-backlog`'s bare-mode round-trip friction and Step 3 fetch latency: merge the priority and `**Related:**` batch confirms into one front-door `AskUserQuestion` (with an opt-in Customize fallback), and eliminate Step 3's N sequential `gh issue view --json body` calls by folding `body` into Step 1's existing `gh issue list` call.

**Architecture:** Both changes live entirely in `skills/review-backlog/SKILL.md` prose/bash-block edits — no JS/executable code changes, since `bin/lib/issues/review-backlog.js`'s pure helpers don't special-case which fields a record carries. Step 1's github fetch becomes mode-conditional (widens its `--json` field list only in bare mode); Step 3 drops its per-record body fetch and reads `.body` off the already-merged record; Step 4's two sequential `AskUserQuestion` calls become one, with "Customize" as the granular-override escape hatch.

**Tech Stack:** Markdown skill files (`skills/**/*.md`), read directly by an LLM session — no build step, no runtime.

**Design doc:** `docs/superpowers/specs/2026-07-22-review-backlog-friction-speed-design.md`

## Global Constraints

- No unit tests are added or changed — these are prose-only edits to `skills/review-backlog/SKILL.md`. The full `node --test` suite must report the same pass/fail counts before and after (1548 passed / 0 failed, confirmed at worktree baseline).
- Commit after each task, never batch multiple tasks into one commit. Work happens on the current worktree branch (`worktree-review-backlog-friction-speed`) — every `git` command in this plan assumes the working directory is already that worktree.
- Task 2 deliberately reverses SKILL.md's own prior "never combine the two confirms" rule. That reversal is documented inline in the new Step 4 text itself (per the design doc's Decision log) — this is intentional, not a regression to flag.
- No version bump in this plan — this repo bumps `.claude-plugin/plugin.json` at release time across a batch of changes, not per-plan (no prior plan in `docs/superpowers/plans/` bundles a version bump with a single-skill prose fix).

---

### Task 1: Batch the Step 3 body fetch into Step 1

**Files:**
- Modify: `skills/review-backlog/SKILL.md`

**Interfaces:**
- Consumes: none (self-contained SKILL.md edit).
- Produces: none — no downstream code reads these bash blocks; they're read and executed live by the assistant running the skill.

- [ ] **Step 1: Widen Step 1's github fetch to include `body`, mode-conditionally**

Find this exact text:

```bash
# work-backend: github-issues
gh issue list --state open --json number,title,labels,createdAt,updatedAt --limit 500 > /tmp/review-backlog-open.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/review-backlog-open.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
" > /tmp/review-backlog-github.json
```
```

Replace with this exact text (adds a mode-conditional `JSON_FIELDS` variable, defaulting to `bare` the same way Step 3's existing `${BUDGET:-40}` defaults, and adds one explanatory sentence after the block):

```bash
# work-backend: github-issues
JSON_FIELDS="number,title,labels,createdAt,updatedAt"
if [ "${MODE:-bare}" = "bare" ]; then JSON_FIELDS="number,title,body,labels,createdAt,updatedAt"; fi
gh issue list --state open --json "$JSON_FIELDS" --limit 500 > /tmp/review-backlog-open.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/review-backlog-open.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
" > /tmp/review-backlog-github.json
```

Bare mode fetches each record's `body` in this same call — Step 3's synthesis pass below reads it directly with zero additional `gh` calls. Named modes (`critical`/`risk-value`/`cleanup`) never read bodies, so they keep the lean 5-field list.
```

- [ ] **Step 2: Remove Step 3's per-record body fetch**

Find this exact text (a single sentence, currently the first line of prose after Step 3's `node -e` block):

```
Fetch bodies only for `selected` (github: `gh issue view {n} --json body`, one per record; local-files: bodies are already present from Step 1's `queryRecords`). Read every selected body in one pass and produce:
```

Replace with this exact text:

```
Bodies for `selected` are already present in the merged record objects from Step 1 — github: Step 1's bare-mode fetch now includes `body` in its field list; local-files: bodies are already present from Step 1's `queryRecords`. No additional per-record `gh` call is needed. Read every selected body in one pass and produce:
```

- [ ] **Step 3: Verify**

```bash
grep -c "JSON_FIELDS" skills/review-backlog/SKILL.md
```
Expected output: `3` (declaration, conditional reassignment, usage in the `gh issue list` call)

```bash
grep -c "number,title,body,labels,createdAt,updatedAt" skills/review-backlog/SKILL.md
```
Expected output: `1`

```bash
grep -c "gh issue view {n} --json body" skills/review-backlog/SKILL.md
```
Expected output: `0`

- [ ] **Step 4: Commit**

```bash
git add skills/review-backlog/SKILL.md
git commit -m "$(cat <<'EOF'
Batch review-backlog's Step 3 body fetch into Step 1

Step 3's bare-mode synthesis pass fetched each budget-selected
record's body with its own gh issue view call -- up to --budget
(default 40) sequential API round-trips. Folds body into Step 1's
existing gh issue list call instead (bare mode only; named modes
keep the lean field list since they never read bodies), so Step 3
reads .body off the already-merged record with zero additional gh
calls.
EOF
)"
```

---

### Task 2: Merge the priority and Related confirms into one front-door AskUserQuestion

**Files:**
- Modify: `skills/review-backlog/SKILL.md`

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Replace Step 4 in full**

Find this exact text:

```
### Step 4 (bare mode only): Batch-confirm suggestions

Render the priority suggestions as a batch table, mirroring `/claude-tweaks:triage`'s own Step 3 pattern, with an added `Suggested tier` column:

```markdown
### Review Backlog — {N} priority suggestions

| # | Record | Current | Suggested | Suggested tier | Rationale |
|---|---|---|---|---|---|
| 1 | #123: {title} | (none) | priority:high | quick? (guess) | {one-line rationale} |
```

Render the two sources distinguishably — a real `ceremony:*` label (already-scored records, per
Step 1's mechanical display) plainly (`fast-lane`/`standard`); this step's own LLM guess suffixed
(`quick? (guess)`/`full? (guess)`) — so a human scanning the batch never mistakes an unscored
guess for `/specify`'s authoritative verdict. The `Suggested tier` column is informational only —
it rides along with the priority batch-confirm below, never gated behind its own
`AskUserQuestion`, and is never itself written anywhere.

Then one `AskUserQuestion`:

- `question`: `"Apply the suggested priority to all, or override specific records?"`, `header`: `"Priority batch"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all suggested (Recommended)"`, `description`: `"Set priority:* exactly per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Skip priority suggestions"`, `description`: `"Leave every record unprioritized for now"`

Then, separately, render the `**Related:**` suggestions as their own batch table and a second, separate `AskUserQuestion` (same three-option shape, `header`: `"Related batch"`, question text `"Apply the suggested **Related:** updates to all, or override specific records?"`) — never combined into the priority call, per this repo's one-decision-per-`AskUserQuestion` convention.
```

Replace with this exact text:

```
### Step 4 (bare mode only): Batch-confirm suggestions

Render the priority suggestions as a batch table, mirroring `/claude-tweaks:triage`'s own Step 3 pattern, with an added `Suggested tier` column:

```markdown
### Review Backlog — {N} priority suggestions

| # | Record | Current | Suggested | Suggested tier | Rationale |
|---|---|---|---|---|---|
| 1 | #123: {title} | (none) | priority:high | quick? (guess) | {one-line rationale} |
```

Render the two sources distinguishably — a real `ceremony:*` label (already-scored records, per
Step 1's mechanical display) plainly (`fast-lane`/`standard`); this step's own LLM guess suffixed
(`quick? (guess)`/`full? (guess)`) — so a human scanning the batch never mistakes an unscored
guess for `/specify`'s authoritative verdict. The `Suggested tier` column is informational only —
it rides along with the priority table, never gated behind its own `AskUserQuestion`, and is
never itself written anywhere.

If any `**Related:**` suggestions exist, render them as a second batch table under its own
heading, directly beneath the priority table:

```markdown
### Related suggestions

| # | Record | Current **Related:** | Suggested addition | Rationale |
|---|---|---|---|---|
| 1 | #16: {title} | (none) | Add **Related:** #23 | {one-line rationale} |
```

If a run produces only one suggestion type, render only that table and its heading — never a
forced empty table for the other.

Then one `AskUserQuestion` confirms both tables at once:

- `question`: `"Apply all suggested updates, or customize?"`, `header`: `"Confirm suggestions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all suggested (Recommended)"`, `description`: `"Set priority:* and update **Related:** exactly per the tables above"`
- Option 2 — `label`: `"Customize"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Skip all suggestions"`, `description`: `"Leave every record untouched for now"`

If "Customize" was chosen, the user's next message gives free-text #-by-# corrections covering
either or both suggestion types (e.g. "apply priority on all except #16, skip the related
suggestion") — the same override convention this repo already uses for batch tables generally,
just spanning both suggestion types in one reply instead of two separate ones.

This merges what were previously two separate confirms (priority, then Related) into one
front-door confirm — CLAUDE.md's "Front-door confirm + opt-in Customize" pattern collapses
sequential inputs before one consequential action into a single gate. Applying priority and
Related suggestions together is, in substance, one decision ("apply the backlog housekeeping this
run suggested"), not two unrelated ones crammed into a single call — the one-decision-per-call
convention this reverses was never meant to forbid that.
```

- [ ] **Step 2: Verify**

```bash
grep -c '"Confirm suggestions"' skills/review-backlog/SKILL.md
```
Expected output: `1`

```bash
grep -c '"Priority batch"' skills/review-backlog/SKILL.md
```
Expected output: `0`

```bash
grep -c '"Related batch"' skills/review-backlog/SKILL.md
```
Expected output: `0`

```bash
grep -c "never combined into the priority call, per this repo's one-decision-per" skills/review-backlog/SKILL.md
```
Expected output: `0`

```bash
grep -c '"Customize"' skills/review-backlog/SKILL.md
```
Expected output: `1`

- [ ] **Step 3: Commit**

```bash
git add skills/review-backlog/SKILL.md
git commit -m "$(cat <<'EOF'
Merge review-backlog's priority and Related confirms into one

Step 4 previously required two sequential AskUserQuestion stops --
priority batch, then Related batch -- even when every answer was
"apply the recommendation as shown." Replaces both with one
front-door confirm rendering both tables together, with a
"Customize" option falling back to the existing #-by-# free-text
override convention. Drops bare mode from 3 required AskUserQuestion
stops to 2 (confirm, then Next Actions) in the common case.
EOF
)"
```

---

### Task 3: Final verification sweep

**Files:**
- None (read-only verification across the file touched by Tasks 1-2)

**Interfaces:**
- Consumes: the final state of `skills/review-backlog/SKILL.md` after Tasks 1-2.

- [ ] **Step 1: Re-run every structural check together**

```bash
grep -c "JSON_FIELDS" skills/review-backlog/SKILL.md
grep -c "gh issue view {n} --json body" skills/review-backlog/SKILL.md
grep -c '"Confirm suggestions"' skills/review-backlog/SKILL.md
grep -c '"Priority batch"\|"Related batch"' skills/review-backlog/SKILL.md
```
Expected output, in order: `3`, `0`, `1`, `0`

- [ ] **Step 2: Confirm the full test suite is unaffected**

```bash
npm test 2>&1 | tail -10
```
Expected output: `# pass 1548` and `# fail 0` (unchanged from worktree baseline — no JS logic was touched).

- [ ] **Step 3: Commit-count sanity check**

```bash
git log --oneline worktree-review-backlog-friction-speed -6
```
Expected output: 2 commits from Tasks 1-2 (batched fetch, merged confirm) plus the design-doc commit from the brainstorming phase, in that order (newest first).

No commit needed for this task — it's read-only verification. If any check in Steps 1-2 fails, stop and fix the specific block before considering the plan complete.

**Note for whoever picks this up next:** the actual behavioral verification — confirming the merged confirm and batched fetch work correctly end-to-end — requires a live run of `/claude-tweaks:review-backlog` bare mode against a real backlog with both suggestion types present. That can't be scripted into this plan (it needs an interactive LLM session, not a bash assertion); do it as a follow-up dry run once this plan lands.
