# Triage Skill + Unified Status Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract issue selection/authorization out of `/claude-tweaks:flow` into a new `/claude-tweaks:triage` skill, replace the `agent:eligible`/`agent:go`/`agent:fast` labels with a unified `status:*` tier lifecycle, and add a deterministic, layered auto-merge gate for a fast-track tier.

**Architecture:** Two new pure Node modules (`bin/lib/issues/tier.js`, `bin/lib/issues/retry.js`) carry the only genuinely mechanical logic (tier recommendation, retry-ceiling tracking) — everything else is skill-file prose, following this plugin's existing pattern of "deterministic helpers, LLM-judged workflow." `/claude-tweaks:flow` becomes a pure executor that accepts a spec number or an issue reference; `/claude-tweaks:triage` (bare invocation = interactive batch authorization, `dispatch` subcommand = headless routine mode) owns everything issue-selection related that `/flow`'s `--from-code-health`/`--from-label`/etc. used to do.

**Tech Stack:** Node.js (`node --test`), `gh` CLI, markdown skill files (Claude Code plugin convention).

## Global Constraints

- Every new/modified skill file follows this plugin's SKILL.md conventions: YAML frontmatter (`name`, `description`), the standard interaction-style directive, an Anti-Patterns table, a Relationship-to-Other-Skills table.
- Pure logic lives in `bin/lib/issues/*.js`, tested via `node --test` — never inline shell one-offs for anything with real branching logic.
- `agent:eligible`/`agent:go`/`agent:fast` are fully retired — no code path may reference them after this plan completes.
- Only the interactive (bare) invocation of `/claude-tweaks:triage` ever writes a `status:needs-review`/`status:approved`/`status:fast-track` label. The headless `dispatch` mode only ever reads them. This is a hard security invariant, not a style preference.
- Every `gh` label bootstrap follows the existing check-then-create pattern used throughout this codebase (`gh label list --search <name> --json name -q '.[].name' | grep -qx <name> || gh label create <name> --description "..."`).
- Design source of truth: `docs/superpowers/specs/2026-07-10-triage-status-lifecycle-design.md`.

---

### Task 1: `bin/lib/issues/tier.js` — the mechanical Tier Rule

**Files:**
- Create: `bin/lib/issues/tier.js`
- Test: `bin/lib/issues/tests/tier.test.js`

**Interfaces:**
- Produces: `extractRiskEffort(labels: (string | {name: string})[]) -> { riskTier?: 'low'|'medium'|'high', effortTier?: 'low'|'medium'|'high' }`
- Produces: `recommendTier({ riskTier, effortTier }) -> 'fast-track' | 'approved'`

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/issues/tests/tier.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRiskEffort, recommendTier } = require('../tier');

test('extractRiskEffort reads risk and effort tiers from string labels', () => {
  const labels = ['code-health', 'code-health:risk-low', 'code-health:effort-low'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('extractRiskEffort reads risk and effort tiers from {name} label objects', () => {
  const labels = [{ name: 'code-health:risk-high' }, { name: 'code-health:effort-medium' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'medium' });
});

test('extractRiskEffort returns undefined fields when labels are absent', () => {
  assert.deepStrictEqual(extractRiskEffort([]), { riskTier: undefined, effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(undefined), { riskTier: undefined, effortTier: undefined });
});

test('recommendTier returns fast-track only for risk:low AND effort:low', () => {
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: 'low' }), 'fast-track');
});

test('recommendTier returns approved for any other risk/effort combination', () => {
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: 'medium' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'high', effortTier: 'low' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'high', effortTier: 'high' }), 'approved');
});

test('recommendTier returns approved when either tier is missing', () => {
  assert.strictEqual(recommendTier({ riskTier: undefined, effortTier: 'low' }), 'approved');
  assert.strictEqual(recommendTier({ riskTier: 'low', effortTier: undefined }), 'approved');
  assert.strictEqual(recommendTier({}), 'approved');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/tier.test.js`
Expected: FAIL — `Cannot find module '../tier'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/issues/tier.js
// Pure: the mechanical Tier Rule for /claude-tweaks:triage's bare (interactive)
// invocation. Given an issue's own risk/effort labels, decides which status:*
// tier to recommend. No discretionary judgment here — the recommendation is
// always subject to an explicit human batch-confirm before any label is written.
'use strict';

const RISK_RE = /^code-health:risk-(low|medium|high)$/;
const EFFORT_RE = /^code-health:effort-(low|medium|high)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => EFFORT_RE.exec(n)).find(Boolean);
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

function recommendTier({ riskTier, effortTier }) {
  if (riskTier === 'low' && effortTier === 'low') return 'fast-track';
  return 'approved';
}

module.exports = { extractRiskEffort, recommendTier };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/tier.test.js`
Expected: PASS — 5 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/tier.js bin/lib/issues/tests/tier.test.js
git commit -m "Add the mechanical Tier Rule for triage's fast-track recommendation"
```

---

### Task 2: `bin/lib/issues/retry.js` — retry-ceiling comment tracking

**Files:**
- Create: `bin/lib/issues/retry.js`
- Test: `bin/lib/issues/tests/retry.test.js`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `attemptFailedCommentBody({ attemptNumber: number, reason: string }) -> string`
- Produces: `countFailedAttempts(comments: {body: string}[]) -> number`
- Produces: `hasHitRetryCeiling(comments: {body: string}[], ceiling?: number) -> boolean` (default ceiling: 3)

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/issues/tests/retry.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling } = require('../retry');

test('attemptFailedCommentBody formats the human-readable retry comment', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 2, reason: 'test gate failed (3 type errors)' });
  assert.strictEqual(body, 'Attempt 2 failed: test gate failed (3 type errors). Claim released, will retry.');
});

test('countFailedAttempts counts only matching comments', () => {
  const comments = [
    { body: 'Attempt 1 failed: build error. Claim released, will retry.' },
    { body: 'Some unrelated comment' },
    { body: 'Attempt 2 failed: test gate failed. Claim released, will retry.' },
  ];
  assert.strictEqual(countFailedAttempts(comments), 2);
});

test('countFailedAttempts returns 0 for no comments or no matches', () => {
  assert.strictEqual(countFailedAttempts([]), 0);
  assert.strictEqual(countFailedAttempts(undefined), 0);
  assert.strictEqual(countFailedAttempts([{ body: 'unrelated' }]), 0);
});

test('hasHitRetryCeiling is false below the ceiling and true at/above it', () => {
  const twoFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
  ];
  assert.strictEqual(hasHitRetryCeiling(twoFailures, 3), false);
  const threeFailures = [...twoFailures, { body: 'Attempt 3 failed: c. Claim released, will retry.' }];
  assert.strictEqual(hasHitRetryCeiling(threeFailures, 3), true);
});

test('hasHitRetryCeiling defaults the ceiling to 3', () => {
  const threeFailures = [
    { body: 'Attempt 1 failed: a. Claim released, will retry.' },
    { body: 'Attempt 2 failed: b. Claim released, will retry.' },
    { body: 'Attempt 3 failed: c. Claim released, will retry.' },
  ];
  assert.strictEqual(hasHitRetryCeiling(threeFailures), true);
});

test('hasHitRetryCeiling respects a custom ceiling', () => {
  const oneFailure = [{ body: 'Attempt 1 failed: a. Claim released, will retry.' }];
  assert.strictEqual(hasHitRetryCeiling(oneFailure, 1), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/retry.test.js`
Expected: FAIL — `Cannot find module '../retry'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/issues/retry.js
// Pure: retry-ceiling tracking for /claude-tweaks:triage's dispatch mode.
// Each failed build attempt posts a human-readable comment (never a hidden
// marker) so a maintainer can see exactly what happened on every attempt.
// This module generates that comment body and counts prior attempts from
// an issue's existing comments.
'use strict';

const ATTEMPT_RE = /^Attempt (\d+) failed: /;

function attemptFailedCommentBody({ attemptNumber, reason }) {
  return `Attempt ${attemptNumber} failed: ${reason}. Claim released, will retry.`;
}

function countFailedAttempts(comments) {
  return (comments || []).filter((c) => ATTEMPT_RE.test((c && c.body) || '')).length;
}

function hasHitRetryCeiling(comments, ceiling = 3) {
  return countFailedAttempts(comments) >= ceiling;
}

module.exports = { attemptFailedCommentBody, countFailedAttempts, hasHitRetryCeiling };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/retry.test.js`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/retry.js bin/lib/issues/tests/retry.test.js
git commit -m "Add retry-ceiling comment tracking for triage's dispatch mode"
```

---

### Task 3: Create `skills/triage/SKILL.md`

**Files:**
- Create: `skills/triage/SKILL.md`

**Interfaces:**
- Consumes: `bin/lib/issues/tier.js`'s `extractRiskEffort`/`recommendTier` (Task 1), `bin/lib/issues/retry.js`'s `attemptFailedCommentBody`/`hasHitRetryCeiling` (Task 2), `_shared/issue-claims.md`'s claim protocol (rewritten in Task 7)
- Produces: the `status:needs-review`/`status:approved`/`status:fast-track` labels that Task 5 (`/flow`), Task 7 (`_shared/issue-claims.md`), Task 8 (`multispec-review-console.md`), and Task 9 (`/help`) all reference

- [ ] **Step 1: Write the file**

```markdown
---
name: claude-tweaks:triage
description: Use when you want to authorize GitHub issues for autonomous building, or when a scheduled routine needs to pick up already-authorized issues and hand them to /flow. Bare invocation is interactive batch authorization (needs-review / approved / fast-track); `triage dispatch` is the headless mode a routine fires. Keywords - triage, authorize, dispatch, status:approved, status:fast-track, autonomous issue building.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Triage — Issue Authorization & Headless Dispatch

Decides which GitHub issues are safe to build autonomously, at what tier, and
hands authorized work off to `/flow` for pure execution.

```
code-health / harness-health (file issues)
              |
              v
   [ /claude-tweaks:triage ] <- utility (no fixed lifecycle position)
              |
   bare invocation: human tiers issues (needs-review / approved / fast-track)
   `triage dispatch`: headless — pulls tiered issues, claims, hands off
              |
              v
   /claude-tweaks:flow #{issue}  (pure executor: /specify -> build -> test -> review -> wrap-up)
```

## When to Use

- You want to review a batch of code-health/harness-health issues and decide
  which get authorized for autonomous building, and at what tier — run the
  bare invocation.
- A scheduled routine needs to pick up already-tiered issues and hand them to
  `/flow` headlessly, with no human present — that's `triage dispatch`.

Not for: building anything yourself. Triage only ever labels issues and hands
off — it never derives a spec or writes application code.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| *(none)* | Bare invocation — interactive batch triage |
| `dispatch` | Headless mode — pulls tiered issues, claims each, hands off to `/flow` |

## Workflow — Bare invocation (interactive triage)

### Step 1: Pull untiered issues

```bash
gh issue list --label code-health --state open --json number,title,body,labels --limit 100 > /tmp/triage-code-health.json
gh issue list --label harness-health --state open --json number,title,body,labels --limit 100 > /tmp/triage-harness-health.json
node -e "console.log(JSON.stringify([...require('/tmp/triage-code-health.json'), ...require('/tmp/triage-harness-health.json')]))" > /tmp/triage-all.json
```

Filter out any issue already carrying `status:needs-review`, `status:approved`,
or `status:fast-track` — those have already been tiered by a prior triage run.

### Step 2: Compute the recommended tier

```bash
node -e "
  const { extractRiskEffort, recommendTier } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/tier.js');
  const issues = require('/tmp/triage-all.json');
  const rows = issues.map(i => {
    const { riskTier, effortTier } = extractRiskEffort(i.labels);
    return { number: i.number, title: i.title, riskTier, effortTier, recommended: recommendTier({ riskTier, effortTier }) };
  });
  console.log(JSON.stringify(rows));
" > /tmp/triage-rows.json
```

### Step 3: Present the batch table

```markdown
### Triage — {N} issues awaiting authorization

| # | Issue | Risk | Effort | Recommended |
|---|---|---|---|---|
| 1 | #123: {title} | low | low | Fast-track |
| 2 | #124: {title} | medium | high | Approved |
```

Then one `AskUserQuestion`:

- `question`: `"Apply the recommended tier to all, or override specific issues?"`, `header`: `"Triage batch"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Write status:approved / status:fast-track per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Flag some for review instead"`, `description`: `"Mark specific issues status:needs-review rather than authorizing them"`

Overrides are ordinary free-text in the user's next message, not the `Other`
field (which answers this one batch question, not a per-item list).

### Step 4: Apply

```bash
gh label list --search "status:approved" --json name -q '.[].name' | grep -qx status:approved || \
  gh label create status:approved --description "Triage authorized this for building - human approves the merge"
gh label list --search "status:fast-track" --json name -q '.[].name' | grep -qx status:fast-track || \
  gh label create status:fast-track --description "Triage authorized this for building - auto-merges if the run comes back clean"
gh label list --search "status:needs-review" --json name -q '.[].name' | grep -qx status:needs-review || \
  gh label create status:needs-review --description "Triage flagged this - needs a closer human look before authorizing"
gh issue edit "$ISSUE" --add-label "status:{tier}"
```

Log each to `decisions.md` (this run's standalone-auto run dir per
`_shared/pipeline-run-dir.md` — triage has no parent pipeline):
`AUTO {time} — Triage: applied status:{tier} to issue #{n} (risk:{riskTier}, effort:{effortTier}).`

## Workflow — `dispatch` (headless)

### Step 1: Pull tiered, unclaimed issues

```bash
gh issue list --label status:approved --state open --json number,title,labels --limit 100 > /tmp/dispatch-approved.json
gh issue list --label status:fast-track --state open --json number,title,labels --limit 100 > /tmp/dispatch-fast-track.json
node -e "console.log(JSON.stringify([...require('/tmp/dispatch-approved.json'), ...require('/tmp/dispatch-fast-track.json')]))" > /tmp/dispatch-all.json
```

Skip any issue already carrying `status:in-progress` (claimed by an
overlapping firing) or `status:blocked` (hit its retry ceiling — needs a
human, never auto-retried).

### Step 2: Claim each (per `_shared/issue-claims.md`)

Resolve the sha once per run, then for each issue attempt the atomic ref
creation exactly as `_shared/issue-claims.md`'s "The lock" section describes.
On success: bootstrap-then-add `status:in-progress`, post the claim comment
(`claimPayload`). On 422 (contested): fold through `claimStatus` — live claim
→ skip; stale claim → break and take over. Any other failure → skip, log,
continue.

### Step 3: Hand off to `/flow`

For each successfully claimed issue, invoke `/claude-tweaks:flow #{issue}`
(the pure-executor issue-reference form — see `flow/SKILL.md`). `/flow`
derives a spec via `/claude-tweaks:specify #{issue}` (the existing
issue-ingestion path) and runs the standard pipeline.

### Step 4: On pipeline failure — retry ceiling

When a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):

1. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s
   Release triggers table).
2. Post a failure comment:

   ```bash
   node -e "
     const { attemptFailedCommentBody } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     console.log(attemptFailedCommentBody({ attemptNumber: process.argv[1], reason: process.argv[2] }));
   " "$ATTEMPT_NUMBER" "$REASON" > /tmp/attempt-comment.md
   gh issue comment "$ISSUE" --body-file /tmp/attempt-comment.md
   ```

3. Check the ceiling (read `triage-retry-ceiling` from CLAUDE.md/`policy.yml`, default 3):

   ```bash
   gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-comments-${ISSUE}.json"
   node -e "
     const { hasHitRetryCeiling } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const comments = require(process.argv[1]);
     console.log(hasHitRetryCeiling(comments, Number(process.argv[2] || 3)));
   " "/tmp/dispatch-comments-${ISSUE}.json" "$TRIAGE_RETRY_CEILING"
   ```

4. **If the ceiling was hit:** strip whichever tier label the issue carries,
   add `status:blocked`, send a `PushNotification` ("Issue #{n} hit its retry
   ceiling — needs a look: {title}").
5. **If not:** leave the tier label in place — the next `dispatch` firing
   pulls it again naturally (the claim was already released).

**Failure-downgrade rule:** whenever a `status:fast-track` issue's run fails
for *any* reason, downgrade it to `status:approved` before the next retry —
remove `status:fast-track`, add `status:approved`. A retry that didn't come
back clean the first time never gets another unsupervised shot at auto-merge.

## Auto-merge gate (fast-track only)

When a `status:fast-track` issue's `/flow` run reaches `/wrap-up`'s Review
Console, check all four layers before presenting it for approval:

1. **Authorization** — `status:fast-track` was present when dispatched
   (true by construction).
2. **Pre-scored eligibility** — true by construction (the Tier Rule only
   ever recommends `fast-track` for `risk:low`+`effort:low`).
3. **Runtime cleanliness** — `/review`'s Step 3 Routing produced nothing at
   Medium severity or above for this spec.
4. **Blast radius** — the diff touches only files the original issue's
   fingerprint/anchor pointed at, and stays under `triage-fast-track-max-lines`
   (default 40) changed lines across `triage-fast-track-max-files` (default 2)
   files.

**All four pass:** merge without waiting for a live approval. Tag the merge
commit `[fast-lane]`. Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever Auto-applied /
Skill updates / Configuration updates sections wrap-up already produced) to a
`PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped,
only the wait for a click is skipped.

**Any layer fails:** proceed exactly as `status:approved` would — present the
normal Review Console, wait for a human.

## Configuration

Read from CLAUDE.md or `.claude-tweaks/policy.yml`:

| Flag | Default | Meaning |
|---|---|---|
| `triage-retry-ceiling` | `3` | Consecutive failures before a dispatched issue gets `status:blocked` and stops auto-retrying. |
| `triage-fast-track-max-lines` | `40` | Blast-radius cap on changed lines for a fast-track auto-merge. |
| `triage-fast-track-max-files` | `2` | Blast-radius cap on changed files for a fast-track auto-merge. |

## Next Actions

When invoked by a parent skill, omit this block. When invoked directly:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Run triage again (Recommended)"`, `description`: `"/claude-tweaks:triage — review any remaining untiered issues"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create triage — schedule triage dispatch as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see pending-authorization count and status:blocked issues"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Applying `status:approved`/`status:fast-track`/`status:needs-review` from inside `dispatch` mode | Only the interactive, human-confirmed bare invocation ever writes a tier label — this is the security boundary (GitHub's own triage-permission model), not a discretionary nicety. `dispatch` mode only ever reads tier labels. |
| Deriving the recommended tier from anything other than `risk-<tier>`/`effort-<tier>` | The Tier Rule is deliberately narrow and mechanical — no LLM judgment re-enters at the gate itself. |
| Skipping the batch-confirm because the recommendation "looks obviously right" | The human action, however trivial, is the load-bearing security signature — never skip it, even for an all-"Fast-track" batch. |
| Letting a fast-track issue auto-merge on a retry after a prior failure | The failure-downgrade rule exists specifically to prevent this — any failure permanently downgrades that issue's current authorization to `approved`. |
| Auto-merging when the diff exceeds the blast-radius cap, even with zero review findings | Tests and review can't catch everything a human glance would — the cap is an independent check, not redundant with cleanliness. |
| Retrying a failed issue indefinitely with no ceiling | Wastes routine cycles on something fundamentally stuck and never surfaces it to a human — the retry ceiling exists to force a checkpoint. |
| Filing or closing issues from inside triage | Triage is a *consumer* of code-health/harness-health's issues — filing belongs to those skills; closing is a user decision at Review Console. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:flow` | `triage dispatch` claims issues and hands each to `/flow #{issue}` for pure execution — `/flow` never selects, filters, or sorts issues itself. `/flow`'s own routine template was retired; `/claude-tweaks:routine create triage` is the scheduled headless entry point now. |
| `/claude-tweaks:code-health` | Triage's bare invocation is the primary consumer of code-health's `risk-<tier>`/`effort-<tier>` labels — the Tier Rule reads them directly. Triage never files or closes code-health issues. |
| `/claude-tweaks:specify` | `/flow`'s issue-reference form derives a spec via `/claude-tweaks:specify #{issue}` (the existing issue-ingestion path) before running the normal pipeline. |
| `_shared/issue-claims.md` | `dispatch` mode claims each issue it pulls before handing off, per this shared protocol; releases follow the same triggers table. |
| `/claude-tweaks:tidy` | Step 4.8 surfaces `status:blocked` counts and the pending-authorization queue size (issues with no tier label yet) as maintenance signals; `/tidy` never applies a tier label itself. |
| `/claude-tweaks:wrap-up` | The auto-merge gate checks run against `/wrap-up`'s own Review Console output before it renders — a clean fast-track run merges without the console's blocking wait, but the console's other sections (skill updates, config updates) still generate and attach to the notification. |
| `/claude-tweaks:help` | Surfaces pending-authorization count, `status:blocked` count, and a rolling auto-merge count on the dashboard. |
| `/claude-tweaks:routine` | `/routine create triage` instantiates `skills/triage/routine-template.yml` as a scheduled headless dispatcher (`prompt: /claude-tweaks:triage dispatch`). |
```

- [ ] **Step 2: Verify the frontmatter and structure match plugin conventions**

Run: `grep -c '^## ' skills/triage/SKILL.md`
Expected: at least 8 (When to Use, Input, two Workflow sections, Auto-merge gate, Configuration, Next Actions, Anti-Patterns, Relationship to Other Skills)

- [ ] **Step 3: Commit**

```bash
git add skills/triage/SKILL.md
git commit -m "Add the /claude-tweaks:triage skill (bare = interactive authorization, dispatch = headless)"
```

---

### Task 4: Move the routine template from `flow` to `triage`

**Files:**
- Create: `skills/triage/routine-template.yml`
- Delete: `skills/flow/routine-template.yml`

**Interfaces:**
- Consumes: nothing new
- Produces: the routine `/claude-tweaks:routine create triage` instantiates

- [ ] **Step 1: Create the new template**

```yaml
template_version: 1
routine_name: triage-dispatch
prompt: "/claude-tweaks:triage dispatch"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Edit, Write, Grep, Glob, Task]
mcp_connections: []
default_schedule:
  cron_expression: "0 4 * * 1-5"
  description: "weekday off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Headless issue dispatcher: each firing pulls status:approved/status:fast-track
  issues, claims them, and hands each to /claude-tweaks:flow #{issue} for pure
  execution. The claim ref makes overlapping firings harmless (a second firing
  skips claimed issues), and a failed run retries at a later firing once its
  claim ages out (TTL) — up to the triage-retry-ceiling policy flag, after which
  the issue is relabeled status:blocked and stops auto-retrying. Only this
  skill's bare (interactive) invocation ever writes a status:needs-review/
  status:approved/status:fast-track label — dispatch mode only ever reads them.
  A fast-track issue whose run comes back clean (per the four-layer auto-merge
  gate) merges without waiting at the Review Console; anything less than clean
  falls back to a normal wait. Each firing that dispatches work ends at its
  consolidated Review Console (for status:approved issues, or any status:fast-track
  issue that didn't come back clean) awaiting the user's answer in the cloud
  session; an unanswered console's claims age out via TTL and a later firing
  supersedes the run. A firing with no eligible issues is a cheap no-op.
  Subagent execution requires the Task tool (in allowed_tools) and the
  superpowers plugin in the cloud environment.
```

- [ ] **Step 2: Delete the old template**

```bash
git rm skills/flow/routine-template.yml
```

- [ ] **Step 3: Verify no other file still references the old path**

Run: `grep -rn "flow/routine-template.yml" skills/ | grep -v "skills/triage/routine-template.yml"`
Expected: no output (Task 5 removes the remaining references from `flow/SKILL.md`)

- [ ] **Step 4: Commit**

```bash
git add skills/triage/routine-template.yml
git commit -m "Move the scheduled headless routine from /flow to /claude-tweaks:triage"
```

---

### Task 5: `/claude-tweaks:flow` becomes a pure executor

**Files:**
- Modify: `skills/flow/SKILL.md`

**Interfaces:**
- Consumes: an issue reference (e.g. `#123`) handed off by `/claude-tweaks:triage dispatch` (Task 3)

- [ ] **Step 1: Remove the issue-selector argument rows**

In the `### Arguments` table, delete these five rows entirely (they currently
sit between the `<spec>` row and the `worktree` row):

```
| `--from-code-health` | No | **Alternative spec source.** Alias for `--from-label code-health` — pull open `code-health`-labelled GitHub issues, turn each into a `/claude-tweaks:specify` brief, and run the derived specs through the multi-spec batch. Pair with `--min-severity <sev>` to filter. Needs the `gh` CLI (hard gate if absent). See `from-code-health.md`. |
| `--from-label <label>` | No | **Alternative spec source.** Pull ALL open issues carrying `<label>` and run them as an issue-sourced batch (claim → brief → `/specify` → multi-spec). Form-shaped bodies (Current State / Deliverables / Acceptance Criteria) convert with zero translation; freeform bodies get an LLM translation surfaced at the Review Console. Needs `gh`. See `from-code-health.md`. |
| `--from-issues <n,...>` | No | **Alternative spec source.** Pull specific open issues by number (comma-separated) regardless of labels, and run them as an issue-sourced batch. Same claim/translation behavior as `--from-label`. Needs `gh`. See `from-code-health.md`. |
| `--from-milestone <m>` | No | **Alternative spec source.** Pull all open issues in milestone `<m>` and run them as an issue-sourced batch. Same claim/translation behavior as `--from-label`. Needs `gh`. See `from-code-health.md`. |
| `--require-eligible` | No | **Issue-sourced batches only.** Keep only issues carrying the `agent:eligible` label — the authorization gate autonomous runs MUST pass (see "Dispatch authorization" in `_shared/issue-claims.md`). Interactive runs may pass it to preview what a dispatcher would build. |
| `--min-severity <sev>` | No | **Issue-sourced batches only.** Filter pulled issues by the `code-health:<sev>` label (`critical`/`high`/`medium`/`low`). Issues without a `code-health:<sev>` label rank as `info` and are excluded by any higher floor. Default: no floor. |
| `--quick-wins` | No | **Issue-sourced batches only.** Narrow the pulled batch to `risk:high AND effort:low` — a deliberate "just the easy high-value stuff" run. Issues without both a `code-health:risk-<tier>` and a `code-health:effort-<tier>` label never match (this is a no-op filter for non-code-health issue sources). Combines with `--min-severity`/`--require-eligible` as an additional AND condition, not a replacement. See `from-code-health.md`. |
```

Replace with one new row, directly after the `<spec>` row:

```
| `#<issue>` | No | **Alternative input, handed off by `/claude-tweaks:triage dispatch`.** An issue reference (e.g. `#123`). Flow derives a spec via `/claude-tweaks:specify #{issue}` (the existing issue-ingestion path), carries `recon-issue`/`recon-fingerprint` frontmatter forward, then runs the standard single-spec pipeline. `/flow` never selects, filters, or claims issues itself — see `/claude-tweaks:triage` for authorization and selection. |
```

Also update the `<spec>` row's "Required" note (currently: `*Not required when an
issue-selector flag (--from-code-health, --from-label, --from-issues, or
--from-milestone) is set.`) to: `*Not required when an issue reference (#<n>) is passed instead.`

- [ ] **Step 2: Update Input resolution**

Delete list item 5 (the `--from-code-health` / `--from-label` / etc. row) from
`### Input resolution` entirely. Add a new item 5 in its place:

```
5. **Issue reference** (e.g. `#123`) → **Issue mode** — derive a spec via `/claude-tweaks:specify #{issue}`, then run the standard single-spec pipeline. This is the only `/flow` entry point that does not take a spec number directly; the spec is *derived* from the issue at the start of the run. `/claude-tweaks:triage dispatch` is the only intended caller of this form — it has already claimed the issue before invoking `/flow`.
```

- [ ] **Step 3: Remove the "Routine Configuration" section**

Delete this section entirely (it currently sits between "Parallel Development
with Worktrees" and the final "Next Actions" section):

```
## Routine Configuration

`/flow` ships a routine template (`skills/flow/routine-template.yml`) — a scheduled headless issue dispatcher. Instantiate with `/claude-tweaks:routine create flow` (add `--dry-run` to inspect first); the label lifecycle and full dispatch procedure live in `from-code-health.md`'s "Dispatch Configuration" section.

**Unattended execution:** each firing that finds eligible `agent:go` issues runs the pipeline hands-off and ends at its consolidated Review Console, awaiting your answer in the cloud session — approval there triggers branch finish, claim release, and dispatch-label removal. A never-answered console is not fatal: the run's claims age out after the TTL (72h default) and a later firing supersedes it by breaking the stale claims. A firing with no eligible issues is a cheap no-op.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.
```

`/flow` no longer ships its own routine — see Task 4.

- [ ] **Step 4: Update the Relationship to Other Skills table**

Replace this row:

```
| `/claude-tweaks:code-health` | `/flow --from-code-health` pulls the `code-health`-labelled GitHub issues `/code-health` files, derives specs via `/specify`, and runs them as a multi-spec batch. `/flow` consumes code-health's output; it never files or closes code-health issues (filing is code-health's job; closing is a user action at the Review Console). See `from-code-health.md`. |
```

with:

```
| `/claude-tweaks:triage` | `triage dispatch` claims an authorized issue and invokes `/claude-tweaks:flow #{issue}` — `/flow` never selects, filters, sorts, or claims issues itself anymore; that logic lives entirely in `/claude-tweaks:triage`. |
```

Replace this row:

```
| `_shared/issue-claims.md` | `--from-code-health` Step 2.5 claims each pulled issue (`refs/claims/issue-{issue}`) before spec derivation; the console releases declined briefs; failure cards offer release on abandon. |
```

with:

```
| `_shared/issue-claims.md` | `/flow` no longer claims issues itself — `/claude-tweaks:triage dispatch` claims before handing off. `/flow`'s own release/decline handling (console declines, failure-card offers) still applies to any issue-mode run per this shared protocol. |
```

Replace this row:

```
| `/claude-tweaks:routine` | `/routine create flow` instantiates `skills/flow/routine-template.yml` — the scheduled issue dispatcher (agent:go + agent:eligible → headless issue-sourced batch). |
```

with:

```
| `/claude-tweaks:routine` | `/flow` no longer ships its own routine template — `/routine create triage` instantiates the scheduled headless dispatcher instead (see `/claude-tweaks:triage`). |
```

- [ ] **Step 5: Verify no stray references remain**

Run: `grep -n "from-code-health\|agent:eligible\|agent:go\|quick-wins\|require-eligible\|min-severity" skills/flow/SKILL.md`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add skills/flow/SKILL.md
git commit -m "Make /claude-tweaks:flow a pure executor — remove issue selection/authorization"
```

---

### Task 6: Remove `from-code-health.md` and the issue-sourced spec source from `steps-and-gates.md`

**Files:**
- Delete: `skills/flow/from-code-health.md`
- Modify: `skills/flow/steps-and-gates.md`

- [ ] **Step 1: Delete the file**

Its content has already been absorbed into `skills/triage/SKILL.md` (Task 3) —
issue pulling, claiming, brief translation, and the label lifecycle are all
covered there instead.

```bash
git rm skills/flow/from-code-health.md
```

- [ ] **Step 2: Remove the "Issue-sourced spec source" subsection from `steps-and-gates.md`**

Delete this entire subsection (currently between "`no-polish` argument
behavior" and "## Gate Behavior"):

```
### Issue-sourced spec source (`--from-code-health` / `--from-label` / `--from-issues` / `--from-milestone`)

These are not steps — they are alternative *spec sources* resolved before Step 1.
`--from-label <label>` pulls any open, labelled issue set (via `gh`); `--from-issues <n,...>`
pulls specific issue numbers; `--from-milestone <m>` pulls a milestone's open issues;
`--from-code-health` is a preserved alias for `--from-label code-health`.
Each pulled issue maps to a `/claude-tweaks:specify` brief via `issuesToBriefs`
(`bin/lib/issues/ingest.js`), derives specs, then runs the normal step pipeline
(`build,test,review,polish,wrap-up`) as a multi-spec batch. `--min-severity <sev>` floors on
the `code-health:<sev>` label (unlabeled issues rank `info`). `--quick-wins` narrows the pulled
batch to `risk:high AND effort:low` (a no-op filter for issues without code-health's own
`code-health:risk-<tier>`/`code-health:effort-<tier>` labels). `--require-eligible` restricts any
selector to `agent:eligible`-labelled issues — mandatory for autonomous dispatch. The full
procedure lives in `from-code-health.md`; the step pipeline and gates are unchanged. A
missing/unauthenticated `gh` CLI is a hard gate (`auto` does not silence a missing dependency).
See `from-code-health.md` for the full procedure.
```

Replace it with a short pointer:

```
### Issue-reference input (`#<issue>`)

Not a step — an alternative *spec source*, resolved before Step 1, used only
by `/claude-tweaks:triage dispatch`'s hand-off. `/flow` derives a spec via
`/claude-tweaks:specify #{issue}` (the existing issue-ingestion path), then
runs the normal step pipeline (`build,test,review,polish,wrap-up`) as a
single-spec run — the step pipeline and gates are unchanged. `/flow` performs
no selection, filtering, or claiming of its own; see `/claude-tweaks:triage`
for that logic.
```

- [ ] **Step 3: Verify no stray references remain**

Run: `grep -rn "from-code-health" skills/flow/`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add -A skills/flow/from-code-health.md skills/flow/steps-and-gates.md
git commit -m "Remove issue-sourced-batch mode from /flow — absorbed into /claude-tweaks:triage"
```

---

### Task 7: Rewrite `_shared/issue-claims.md`'s Dispatch authorization for `status:*`

**Files:**
- Modify: `skills/_shared/issue-claims.md`

- [ ] **Step 1: Replace the "Dispatch authorization" section**

Replace this entire section:

```
## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue
body is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**:

- `agent:eligible` — authorization. Autonomous (headless/routine) runs only build issues
  carrying it; they pass `--require-eligible` so ingestion filters on it (`requireLabels` in
  `bin/lib/issues/ingest.js`). Interactive runs are unrestricted — the user is present to
  judge each issue.
- `agent:go` — the standing dispatch request a scheduled dispatcher selects on
  (`--from-label agent:go`). Label = standing request, claim = in flight: the claim ref
  prevents double-dispatch across firings, and the label persists until *successful*
  wrap-up — a failed run retries at a later firing once its claim ages out. Removing
  `agent:go` on success is a reversible write, logged to `decisions.md`.

The agent never applies either label itself — that would forge the signature. The shipped
dispatcher template (`skills/flow/routine-template.yml`) always passes `--require-eligible`;
a project relaxes the gate only by editing its instantiated routine's prompt.
```

with:

```
## Dispatch authorization

Headless agents building arbitrary issue content is a prompt-injection surface: an issue
body is untrusted input, and a drive-by issue must not be able to opt itself into autonomous
execution. The gate is GitHub's own permission model — **applying a label requires triage
permission, so a label is a maintainer's signature**. Authorization is one of three
mutually-exclusive `status:*` tier labels, all written exclusively by `/claude-tweaks:triage`'s
interactive (bare) invocation — never by `dispatch` mode, never by the agent itself:

- `status:needs-review` — the triager flagged this issue as warranting a closer human look.
  It never reaches `/flow` — no autonomous run selects on this label.
- `status:approved` — authorized to build. `/claude-tweaks:triage dispatch` selects on this
  (alongside `status:fast-track`, below), claims the issue, and hands it to `/flow #{issue}`.
  Label = standing request, claim = in flight: the claim ref prevents double-dispatch across
  firings, and the label persists until *successful* wrap-up — a failed run retries at a
  later firing once its claim ages out, up to the `triage-retry-ceiling` policy flag.
- `status:fast-track` — authorized to build *and* to auto-merge without waiting for a live
  Review Console approval, but only if the run comes back completely clean (see the
  four-layer auto-merge gate in `skills/triage/SKILL.md`). Any run failure downgrades this
  to `status:approved` before the next retry — a retry that wasn't clean the first time
  never gets another unsupervised shot at auto-merge.

Removing a tier label on success (or downgrading `fast-track` → `approved` on failure) is a
reversible write, logged to `decisions.md`. `/claude-tweaks:triage dispatch` never applies
`status:needs-review`/`status:approved`/`status:fast-track` — only reads them.
```

- [ ] **Step 2: Update the "The status label" section's cross-references**

Change:

```
- **Added** alongside claim acquisition — bootstrap-then-add, the same check-then-create
  pattern every label in this codebase uses (see `flow/from-code-health.md` Step 2.5, the one
  claim-acquiring consumer today).
```

to:

```
- **Added** alongside claim acquisition — bootstrap-then-add, the same check-then-create
  pattern every label in this codebase uses (see `skills/triage/SKILL.md`'s `dispatch` mode
  Step 2, the one claim-acquiring consumer today).
```

Change:

```
- **Removed** alongside claim release — every release removes it, regardless of outcome
  (`wrap-up/cleanup-procedures.md` Section E, its duplicate in
  `flow/multispec-review-console.md`, and the declined-at-console release in
  `flow/from-code-health.md`).
```

to:

```
- **Removed** alongside claim release — every release removes it, regardless of outcome
  (`wrap-up/cleanup-procedures.md` Section E, its duplicate in
  `flow/multispec-review-console.md`, and the declined-at-console release in
  `/claude-tweaks:flow`'s own issue-mode handling).
```

- [ ] **Step 3: Update the Consumers table**

Replace this row:

```
| `/claude-tweaks:flow` (`from-code-health.md` Step 2.5) | Claims each pulled issue before spec derivation; releases on console decline; failure cards offer release |
```

with:

```
| `/claude-tweaks:triage` (`SKILL.md`'s `dispatch` mode Step 2) | Claims each pulled `status:approved`/`status:fast-track` issue before handing off to `/flow`; releases on failure (per the retry-ceiling procedure) |
| `/claude-tweaks:flow` (issue-reference mode) | Releases on console decline; failure cards offer release. Never claims — `/claude-tweaks:triage dispatch` always claims before invoking `/flow #{issue}`. |
```

- [ ] **Step 4: Update the Release triggers table**

Replace this row:

```
| `agent:go` removal after a `merged:`/`pr-opened:` release | Console dispatch-label step (multi-spec) / `/wrap-up` Section E step 6 (single-spec) | — (label edit, not a claim release) |
```

with:

```
| Tier-label removal (`status:approved`/`status:fast-track`) after a `merged:`/`pr-opened:` release | Console dispatch-label step (multi-spec) / `/wrap-up` Section E step 6 (single-spec) | — (label edit, not a claim release) |
```

- [ ] **Step 5: Verify no stray references remain**

Run: `grep -n "agent:eligible\|agent:go" skills/_shared/issue-claims.md`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/issue-claims.md
git commit -m "Rewrite Dispatch authorization for the unified status:* tier lifecycle"
```

---

### Task 8: Update `flow/multispec-review-console.md`'s label-removal steps

**Files:**
- Modify: `skills/flow/multispec-review-console.md`

- [ ] **Step 1: Update step 8 in "On approval"**

Replace:

```
8. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
```

with:

```
8. **Remove the tier label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `status:approved` or `status:fast-track`: `gh issue edit "$ISSUE" --remove-label status:approved` (or `status:fast-track`, whichever is present) — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without a tier label. See "Dispatch authorization" in `_shared/issue-claims.md`.
```

- [ ] **Step 2: Update step 7 in "On override" (identical wording, separate occurrence)**

Replace:

```
7. **Remove the dispatch label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without the label. See "Dispatch authorization" in `_shared/issue-claims.md`.
```

with:

```
7. **Remove the tier label** for each issue released with a `merged:` or `pr-opened:` outcome that carries `status:approved` or `status:fast-track`: `gh issue edit "$ISSUE" --remove-label status:approved` (or `status:fast-track`, whichever is present) — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the label is the retry request) and issues without a tier label. See "Dispatch authorization" in `_shared/issue-claims.md`.
```

- [ ] **Step 3: Verify no stray references remain**

Run: `grep -n "agent:go\|agent:eligible" skills/flow/multispec-review-console.md`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add skills/flow/multispec-review-console.md
git commit -m "Update Review Console label removal for status:* tier labels"
```

---

### Task 9: `/help` dashboard additions

**Files:**
- Modify: `skills/help/status-scan.md`
- Modify: `skills/help/SKILL.md`

**Interfaces:**
- Consumes: `status:needs-review`/`status:approved`/`status:fast-track`/`status:blocked` label counts (Task 3)

- [ ] **Step 1: Add a new stage to `status-scan.md`**

Add this new stage (place it directly after the existing Stage 4.5 "Current
PR (GitHub)" section, as Stage 4.6 — renumber only if a Stage 4.6 already
exists under a different name):

```markdown
## Stage 4.6: Triage Queue (GitHub)

Cheap counts only — detail stays `/claude-tweaks:triage`'s and `/tidy`'s job,
not `/help`'s. Skip silently (same fail-open detection ladder as Stage 4.5)
when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

```bash
gh issue list --label code-health --state open --json number,labels --limit 200 > /tmp/help-triage-ch.json
gh issue list --label harness-health --state open --json number,labels --limit 200 > /tmp/help-triage-hh.json
node -e "
  const all = [...require('/tmp/help-triage-ch.json'), ...require('/tmp/help-triage-hh.json')];
  const names = i => (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));
  const untiered = all.filter(i => !names(i).some(n => n === 'status:needs-review' || n === 'status:approved' || n === 'status:fast-track')).length;
  console.log(untiered);
"
gh issue list --label status:blocked --state open --json number --limit 200 -q 'length'
```

Render as three lines on the dashboard:

- Pending authorization: **N issues awaiting your decision** — run `/claude-tweaks:triage` (omit this line when N is 0)
- Blocked: **N issues hit their retry ceiling** — run `/claude-tweaks:triage` to review (omit this line when N is 0)
- Auto-merged this week: **N fast-lane merges** (count `[fast-lane]`-tagged commits on the default branch in the last 7 days via `git log --oneline --since="7 days ago" --grep="\[fast-lane\]"`; omit this line when N is 0)
```

- [ ] **Step 2: Reference the new stage from `SKILL.md`**

In the sentence describing the parallel-dispatch procedure (currently: "Read
`status-scan.md` in this skill's directory for the full parallel-dispatch
procedure (Stages 1-7, incl. Stage 4.5 current-PR scan; dispatch contract,
agent template, and dashboard rendering)."), update the parenthetical to:

```
(Stages 1-7, incl. Stage 4.5 current-PR scan and Stage 4.6 triage-queue counts; dispatch contract, agent template, and dashboard rendering)
```

- [ ] **Step 3: Commit**

```bash
git add skills/help/status-scan.md skills/help/SKILL.md
git commit -m "Add pending-authorization/blocked/auto-merged counts to /help's dashboard"
```

---

### Task 10: `/wrap-up` Review Console — fast-track non-blocking summary

**Files:**
- Modify: `skills/wrap-up/review-console.md`

- [ ] **Step 1: Insert a new "Fast-track short-circuit" section**

Insert a new section immediately after `## When to run` (whose last line
today is `- **interactive mode** — skip; decisions were resolved in-flow`)
and before `## Multi-spec defer protocol`:

```markdown
## Fast-track short-circuit

When this run's spec carries `recon-issue:` frontmatter for an issue tagged
`status:fast-track` (see `skills/triage/SKILL.md`'s auto-merge gate), check
the four-layer gate before presenting this console:

1. **Authorization** — `status:fast-track` was present when dispatched (true by construction)
2. **Pre-scored eligibility** — true by construction (the Tier Rule only recommends `fast-track` for `risk:low`+`effort:low`)
3. **Runtime cleanliness** — `/review`'s Step 3 Routing produced nothing at Medium severity or above
4. **Blast radius** — the diff stays within `triage-fast-track-max-lines`/`triage-fast-track-max-files` (CLAUDE.md/`policy.yml` flags, defaults 40/2) and touches only files the original issue's fingerprint/anchor pointed at

**All four pass:** skip the blocking wait — merge immediately (tag the merge
commit `[fast-lane]`) — but still generate this console's full content
(Auto-applied / Skill updates / Configuration updates sections, per "Present
the console" below) and attach it to a `PushNotification` as a non-blocking
FYI. Nothing this console would have shown is discarded — only the wait for
a live approval is skipped. Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Reversibility: high (git revert).`

**Any layer fails:** proceed to render the console normally, exactly as a
`status:approved` issue would — no different from any other pipeline run.

This check does not apply to `MULTISPEC_REVIEW_DEFER=1` runs — the
consolidated multi-spec console (`flow/multispec-review-console.md`) performs
its own equivalent check across all specs in the batch.
```

- [ ] **Step 2: Verify the section landed in the right place**

Run: `grep -n "^## " skills/wrap-up/review-console.md`
Expected: `## Fast-track short-circuit` appears directly between `## When to
run` and `## Multi-spec defer protocol`.

- [ ] **Step 3: Commit**

```bash
git add skills/wrap-up/review-console.md
git commit -m "Add the fast-track auto-merge short-circuit to the Review Console"
```

---

## Final verification

- [ ] Run the full test suite and confirm no regressions beyond the
  pre-existing flaky `statusline.test.js` timing test:

  Run: `npm test 2>&1 | tail -15`
  Expected: all `bin/lib/issues/tests/*` pass, including the two new files
  from Tasks 1-2.

- [ ] Confirm no file in the repository still references the retired labels:

  Run: `grep -rln "agent:eligible\|agent:go\b" skills/ bin/ 2>/dev/null`
  Expected: no output.

- [ ] Confirm `skills/flow/from-code-health.md` and
  `skills/flow/routine-template.yml` no longer exist and
  `skills/triage/SKILL.md` / `skills/triage/routine-template.yml` do:

  Run: `ls skills/flow/from-code-health.md skills/flow/routine-template.yml 2>&1; ls skills/triage/`
  Expected: the first `ls` reports both paths as missing; the second lists
  `SKILL.md` and `routine-template.yml`.
