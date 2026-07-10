# Triage Skill + Unified Status Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract issue selection/authorization out of `/claude-tweaks:flow` into a new `/claude-tweaks:triage` skill, replace the `agent:eligible`/`agent:go`/`agent:fast` labels with a unified `status:*` tier lifecycle, and add a deterministic, layered auto-merge gate for a fast-track tier.

**Architecture:** Two new pure Node modules (`bin/lib/issues/tier.js`, `bin/lib/issues/retry.js`) carry the only genuinely mechanical logic (tier recommendation, retry-ceiling tracking) — everything else is skill-file prose, following this plugin's existing pattern of "deterministic helpers, LLM-judged workflow." `/claude-tweaks:flow` becomes a pure executor that accepts a spec number or an issue reference; `/claude-tweaks:triage` (bare invocation = interactive batch authorization, `dispatch` subcommand = headless routine mode) owns everything issue-selection related that `/flow`'s `--from-code-health`/`--from-label`/etc. used to do.

**Tech Stack:** Node.js (`node --test`), `gh` CLI, markdown skill files (Claude Code plugin convention).

## Global Constraints

- Every new/modified skill file follows this plugin's SKILL.md conventions: YAML frontmatter (`name`, `description`), the standard interaction-style directive, an Anti-Patterns table, a Relationship-to-Other-Skills table.
- Pure logic lives in `bin/lib/issues/*.js`, tested via `node --test` — never inline shell one-offs for anything with real branching logic.
- `agent:eligible`/`agent:go`/`agent:fast` are fully retired — no code path may reference them after this plan completes.
- Only the interactive (bare) invocation of `/claude-tweaks:triage` ever *grants* a `status:needs-review`/`status:approved`/`status:fast-track` label an issue didn't already have. The headless `dispatch` mode may only *downgrade or strip* a tier it reads (`fast-track`→`approved` on failure; removed + `status:blocked` at the retry ceiling) — it revokes trust, it never grants it. This is a hard security invariant, not a style preference.
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
2. Fetch existing comments and compute this attempt's number and whether it
   hits the ceiling (read `triage-retry-ceiling` from CLAUDE.md/`policy.yml`,
   default 3), in one pass — fetching comments *before* posting this attempt's
   comment is what makes the attempt number and ceiling check correct:

   ```bash
   gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100" > "/tmp/dispatch-comments-${ISSUE}.json"
   node -e "
     const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const comments = require(process.argv[1]);
     const attemptNumber = countFailedAttempts(comments) + 1;
     const ceiling = Number(process.argv[2] || 3);
     console.log(JSON.stringify({ attemptNumber, ceilingHit: attemptNumber >= ceiling }));
   " "/tmp/dispatch-comments-${ISSUE}.json" "$TRIAGE_RETRY_CEILING" > "/tmp/attempt-info-${ISSUE}.json"
   ```

3. Post the failure comment, using the `attemptNumber` just computed:

   ```bash
   node -e "
     const { attemptFailedCommentBody } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
     const { attemptNumber } = require(process.argv[1]);
     console.log(attemptFailedCommentBody({ attemptNumber, reason: process.argv[2] }));
   " "/tmp/attempt-info-${ISSUE}.json" "$REASON" > /tmp/attempt-comment.md
   gh issue comment "$ISSUE" --body-file /tmp/attempt-comment.md
   ```

4. **If `ceilingHit` was `true`:** strip whichever tier label the issue carries,
   add `status:blocked`, send a `PushNotification` ("Issue #{n} hit its retry
   ceiling — needs a look: {title}").
5. **If `false`:** leave the tier label in place — the next `dispatch` firing
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

Render only for the bare (interactive) invocation — there is no human present
to answer `AskUserQuestion` during a headless `dispatch` firing, so `dispatch`
mode never renders this block:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Run triage again (Recommended)"`, `description`: `"/claude-tweaks:triage — review any remaining untiered issues"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create triage — schedule triage dispatch as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see pending-authorization count and status:blocked issues"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| `dispatch` mode granting a tier an issue didn't already have (newly applying `status:needs-review`/`status:approved`/`status:fast-track`) | Only the interactive, human-confirmed bare invocation ever grants a tier — this is the security boundary (GitHub's own triage-permission model), not a discretionary nicety. `dispatch` mode may only downgrade or strip a tier it reads (`fast-track`→`approved` on failure, or removed + `status:blocked` at the retry ceiling) — it revokes trust, it never grants it. |
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
  skill's bare (interactive) invocation ever grants a status:needs-review/
  status:approved/status:fast-track label an issue didn't already have —
  dispatch mode may only downgrade or strip a tier it reads (fast-track to
  approved on failure, or removed plus status:blocked at the retry ceiling);
  it revokes trust, never grants it.
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

- [ ] **Step 3: Fix the "Issue closures" section heading**

Replace:

```
#### Issue closures (from-code-health runs — closes on YOUR merge/push, not by the pipeline)
```

with:

```
#### Issue closures (issue-derived specs — closes on YOUR merge/push, not by the pipeline)
```

Found during Task 6's own review — a whole-repo grep for `from-code-health`
scoped to `skills/flow/` turned up this heading alongside two files already
covered by Task 12 (`failure-cards.md`, `worktree-merge.md`); this file's own
occurrence wasn't caught by Steps 1-2 above since those only touch the
label-removal steps, not this heading.

- [ ] **Step 4: Remove a now-dead guard clause (both occurrences)**

This file's "On approval" step 7 and "On override" step 6 (identical wording,
two occurrences) each end with "Skip briefs already released at console
decline." That guard existed for the old `--from-code-health` batch mode,
which let a user decline an issue-derived brief *before it was even built* —
releasing its claim at that point. That whole pre-build decline checkpoint no
longer exists: `/claude-tweaks:triage` authorizes issues up front via labels,
and `/flow`'s issue-mode is single-issue, claimed by `triage dispatch` before
`/flow` ever runs. The clause now guards against a state that can never occur
in the current design — remove it rather than pointing it at a mechanism that
isn't there. (`recon-issue:`-carrying specs can still appear in an ordinary
human-run multi-spec batch — e.g. someone manually running `/specify #123`
then including the resulting spec in `/flow 42,50,48` — this step's actual
release logic, unrelated to the removed clause, still applies to that case
unchanged.)

Replace (both occurrences — identical text each time):

```
Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Skip briefs already released at console decline. Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
```

with:

```
Release each issue claim this run holds (specs with `recon-issue:` frontmatter): use the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
```

(The only change is dropping the "Skip briefs already released at console
decline." sentence — everything else in both occurrences stays identical.)

- [ ] **Step 5: Verify no stray references remain**

Run: `grep -n "agent:go\|agent:eligible\|from-code-health\|console decline" skills/flow/multispec-review-console.md`
Expected: no output

- [ ] **Step 6: Commit**

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

### Task 11: Fix the canonical `agent:go` removal in `wrap-up/cleanup-procedures.md` Section E

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md`

This is the file `flow/multispec-review-console.md` (Task 8) points to as the
canonical source ("per `wrap-up/cleanup-procedures.md` Section E") — Task 8
only fixed the duplicate description, not the original.

- [ ] **Step 1: Update the `recon-issue:` provenance note**

Replace:

```
If the spec's frontmatter carries `recon-issue: <n>` (stamped by `/flow --from-code-health` spec
derivation), the pipeline holds `refs/claims/issue-<n>` per `_shared/issue-claims.md`.
```

with:

```
If the spec's frontmatter carries `recon-issue: <n>` (stamped by `/specify`'s issue-ingestion
path — either invoked directly on an issue reference, or via `/claude-tweaks:flow #{issue}`'s
hand-off, which itself calls `/specify #{issue}`), the pipeline holds `refs/claims/issue-<n>`
per `_shared/issue-claims.md`.
```

- [ ] **Step 2: Update step 6's tier-label removal**

Replace:

```
6. **Remove the dispatch label** when the outcome was `merged:` or `pr-opened:` and the issue
   carries `agent:go`: `gh issue edit "$ISSUE" --remove-label agent:go` (reversible; log to
   `decisions.md`). Leave the label on `abandoned:` — it is the standing retry request. Skip
   silently when the label is absent.
```

with:

```
6. **Remove the tier label** when the outcome was `merged:` or `pr-opened:` and the issue
   carries `status:approved` or `status:fast-track`: `gh issue edit "$ISSUE" --remove-label status:approved`
   (or `status:fast-track`, whichever is present) (reversible; log to `decisions.md`). Leave
   the label on `abandoned:` — it is the standing retry request. Skip silently when no tier
   label is present.
```

- [ ] **Step 3: Verify no stray references remain**

Run: `grep -n "agent:go\|agent:eligible\|from-code-health" skills/wrap-up/cleanup-procedures.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md
git commit -m "Fix the canonical status:* tier-label removal in cleanup-procedures.md Section E"
```

---

### Task 12: Cross-reference sweep — retire remaining stale mentions of `--from-code-health` / `agent:go` / `from-code-health.md`

**Files:**
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/flow/failure-cards.md`
- Modify: `skills/flow/worktree-merge.md`
- Modify: `skills/help/context-flow.md`
- Modify: `skills/help/reference-card.md`
- Modify: `skills/code-health/SKILL.md`
- Modify: `skills/tidy/SKILL.md`
- Modify: `skills/tidy/scan-procedures.md`
- Modify: `skills/review/SKILL.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/specify/spec-template.md`
- Modify: `skills/routine/SKILL.md`

Found via a whole-repo grep during pre-flight review — these files reference
the retired flag/file but were outside Tasks 1-11's scope. `skills/routine/SKILL.md`
was found later, during Task 4's own review (its Relationship-to-Other-Skills
table still names `/claude-tweaks:flow` as the consumer of the now-moved
routine template).

- [ ] **Step 1: `skills/init/bootstrap-steps.md` — two citations**

Replace:

```
Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via the translation step (`from-code-health.md` Step 2.6); the
form just removes the translation judgment.
```

with:

```
Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via `/specify`'s own issue-ingestion path (`SKILL.md`
"Resolve the input" case 1 already handles a freeform body with "more editorializing," per
that section); the form just removes the translation judgment.
```

Replace:

```
No `gh issue close` call anywhere in the workflow — the default-branch merge remains
the sole closing action, consistent with claude-tweaks' own close-via-merge rule (see
`_shared/issue-claims.md` and `flow/from-code-health.md` Step 5).
```

with:

```
No `gh issue close` call anywhere in the workflow — the default-branch merge remains
the sole closing action, consistent with claude-tweaks' own close-via-merge rule (see
"Close-via-merge" in `_shared/issue-claims.md`).
```

- [ ] **Step 2: `skills/flow/failure-cards.md`**

Replace:

```
**Claims held by `--from-code-health` runs:** when the stopped run holds issue claims
(`refs/claims/issue-{issue}`, per `_shared/issue-claims.md`), the card must OFFER release —
never auto-release. Resuming is the recommended next action, and a resumed run needs its
claims intact; an unreleased claim ages out via TTL anyway.
```

with:

```
**Claims held by an issue-mode run:** when the stopped run holds issue claims
(`refs/claims/issue-{issue}`, claimed by `/claude-tweaks:triage dispatch` before hand-off, per
`_shared/issue-claims.md`), the card must OFFER release — never auto-release. Resuming is the
recommended next action, and a resumed run needs its claims intact; an unreleased claim ages
out via TTL anyway.
```

- [ ] **Step 3: `skills/flow/worktree-merge.md`**

Replace:

```
1. Merge into the base branch. For from-code-health runs (any spec on the branch has `recon-issue:`
   frontmatter), the merge commit message must carry the closing keywords — one line per issue
   (see "Close-via-merge" in `_shared/issue-claims.md`):
```

with:

```
1. Merge into the base branch. For issue-derived runs (any spec on the branch has `recon-issue:`
   frontmatter), the merge commit message must carry the closing keywords — one line per issue
   (see "Close-via-merge" in `_shared/issue-claims.md`):
```

- [ ] **Step 4: `skills/help/context-flow.md`**

Replace:

```
Codebase                     ──→ Findings cache               ──→ GitHub Issues (durable)         ──→ Build pipeline
.claude-tweaks/code-health/      .claude-tweaks/code-health/      gh issues (label: code-health)      /flow --from-code-health
  /code-health                   cache.json + runs/               ↓ (or)                              specs/NN-*.md via /specify
                                                                  INBOX / /specify                    /build
```

with:

```
Codebase                     ──→ Findings cache               ──→ GitHub Issues (durable)         ──→ Triage + Build pipeline
.claude-tweaks/code-health/      .claude-tweaks/code-health/      gh issues (label: code-health)      /claude-tweaks:triage → /flow #{issue}
  /code-health                   cache.json + runs/               ↓ (or)                              specs/NN-*.md via /specify
                                                                  INBOX / /specify                    /build
```

- [ ] **Step 5: `skills/help/reference-card.md`**

Replace:

```
| `/claude-tweaks:flow` | Automated pipeline: build → [stories →] test → review → polish → wrap-up (+ end-of-run depth survey); issue-sourced batches via `--from-code-health` / `--from-label <label>` / `--from-issues <n,...>` / `--from-milestone <m>` (+ `--require-eligible`) | spec #(s), doc path + `auto` `worktree`/`current-branch` `no-stories` `no-polish` `no-deepen` `keep-going` `[step]` (single = resume) |
```

with:

```
| `/claude-tweaks:flow` | Automated pipeline: build → [stories →] test → review → polish → wrap-up (+ end-of-run depth survey); pure executor — never selects issues itself | spec #(s), doc path, or `#<issue>` (handed off by `/claude-tweaks:triage dispatch`) + `auto` `worktree`/`current-branch` `no-stories` `no-polish` `no-deepen` `keep-going` `[step]` (single = resume) |
| `/claude-tweaks:triage` | Authorizes GitHub issues for autonomous building (bare = interactive batch tiering) and dispatches already-tiered issues to `/flow` headlessly (`dispatch` subcommand) | *(none)* or `dispatch` |
```

- [ ] **Step 6: `skills/code-health/SKILL.md` — two Relationship-table rows**

Replace:

```
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `code-health`-labelled issues in its hygiene pass — stale/superseded ones are closed (with comment) after batch approval; still-valid ones are suggested for `/flow --from-code-health` or captured to INBOX. |
| `/claude-tweaks:flow` | `/flow --from-code-health` pulls the `code-health`-labelled issues this skill files (via `--from-code-health`, now one of three issue-sourced selectors) and runs them as a multi-spec batch (derive specs via `/specify` -> build/test/review/polish/wrap-up). Batch consumers claim each issue per `_shared/issue-claims.md` before deriving specs, so concurrent runs never double-build. |
```

with:

```
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `code-health`-labelled issues in its hygiene pass — stale/superseded ones are closed (with comment) after batch approval; still-valid ones are suggested for `/claude-tweaks:triage` or captured to INBOX. |
| `/claude-tweaks:triage` | Triage's bare invocation is the primary consumer of code-health's `risk-<tier>`/`effort-<tier>` labels — the Tier Rule reads them directly to recommend an authorization tier. `triage dispatch` claims each authorized issue and hands it to `/claude-tweaks:flow #{issue}` for pure execution — `/flow` no longer selects or claims issues itself. |
```

- [ ] **Step 7: `skills/tidy/SKILL.md` — one Relationship-table row**

Replace:

```
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `code-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/flow --from-code-health` or captured to INBOX. |
```

with:

```
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `code-health`-labelled GitHub issues; `/tidy` Step 4.8 audits them — stale/superseded issues are closed (with comment) after batch approval, still-valid ones suggested for `/claude-tweaks:triage` or captured to INBOX. |
```

- [ ] **Step 8: `skills/tidy/scan-procedures.md`**

Replace:

```
Find specs still on disk that were promoted from a `parked` issue but never got the
restoration finished — a defense-in-depth flag for a mutation that silently failed at claim
release (Phase 3), same shape as the already-drafted `agent:go` missed-removal backstop in
`specs/INBOX.md`. Both checks below are flagged only — recommendations execute after Step 6
batch approval, same as every other Step 4.7 mutation.
```

with:

```
Find specs still on disk that were promoted from a `parked` issue but never got the
restoration finished — a defense-in-depth flag for a mutation that silently failed at claim
release (Phase 3), same shape as the already-drafted `status:in-progress` missed-removal
backstop above. Both checks below are flagged only — recommendations execute after Step 6
batch approval, same as every other Step 4.7 mutation.
```

- [ ] **Step 9: `skills/review/SKILL.md`**

Replace:

```
In a multi-spec batch (`/claude-tweaks:flow --from-code-health`, or any run where several specs share one worktree/branch), a later spec's review may be tempted to cite an earlier spec's already-completed whole-branch review instead of re-dispatching. Only reuse it when the scope is **byte-identical**: the exact same commit range this review would otherwise cover, with zero delta — nothing has landed on the branch since the cited review's `HEAD`.
```

with:

```
In a multi-spec batch (`/claude-tweaks:flow 42,45,48`, or any run where several specs share one worktree/branch), a later spec's review may be tempted to cite an earlier spec's already-completed whole-branch review instead of re-dispatching. Only reuse it when the scope is **byte-identical**: the exact same commit range this review would otherwise cover, with zero delta — nothing has landed on the branch since the cited review's `HEAD`.
```

- [ ] **Step 10: `skills/specify/SKILL.md` — two citations**

Replace the parenthetical at the end of the "GitHub issue reference" bullet:

```
(This is a distinct path from `/flow --from-code-health`, which pulls issues itself and passes `/specify` the already-extracted title + body text directly, then stamps this same frontmatter in `from-code-health.md` Step 3 — it never reaches this case.)
```

with:

```
(`/claude-tweaks:flow #{issue}` — the hand-off `/claude-tweaks:triage dispatch` uses — routes through this exact same case, calling `/claude-tweaks:specify #{issue}` directly rather than pre-extracting title/body itself; there is no longer a separate batch-derivation path.)
```

Replace:

```
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage for specs built directly from a single issue, not just via `/flow --from-code-health`'s batch path.
```

with:

```
- **Write issue-tracking frontmatter when the input resolved from a GitHub issue reference** (Resolve-the-input case 1) — write `recon-issue: <number>` on the generated spec, plus `recon-fingerprint: <fp>` when a fingerprint marker was found in the issue body, plus `code-health-effort: <tier>` when the issue carried a `code-health:effort-<tier>` label. This is what lets `/wrap-up`'s close-via-merge and issue-claim-release steps, and `/build`'s effort-based model-tier selection, engage — whether `/specify` was invoked directly on an issue reference or via `/claude-tweaks:flow #{issue}`'s hand-off.
```

- [ ] **Step 11: `skills/specify/spec-template.md` — two citations**

Replace:

```
Present only on specs derived from a GitHub issue — either directly (`/specify <issue-url>`, SKILL.md "Resolve the input" case 1) or via `/flow --from-code-health`'s batch path (`flow/from-code-health.md` Step 3, which stamps these itself rather than routing through case 1 — see that file).
```

with:

```
Present only on specs derived from a GitHub issue — via `/specify <issue-url>` directly, or via `/claude-tweaks:flow #{issue}`'s hand-off (which itself calls `/specify #{issue}`) — both routes stamp these fields through the same "Resolve the input" case 1 procedure in `SKILL.md`.
```

Replace this table row:

```
| `recon-was-parked:` | Whether the source issue carried the `parked` label at ingestion time (removed at promotion — see "Restore-on-promotion bookkeeping" in this skill's `SKILL.md` Step 3, and its batch-path equivalent in `flow/from-code-health.md` Step 3) | The claim-release restoration steps (`wrap-up/cleanup-procedures.md` Section E, its `flow/multispec-review-console.md` duplicate, and the declined-at-console release in `flow/from-code-health.md`) restore `parked` on the issue iff this is `true` and the release outcome is not `merged:`/`pr-opened:` |
```

with:

```
| `recon-was-parked:` | Whether the source issue carried the `parked` label at ingestion time (removed at promotion — see "Restore-on-promotion bookkeeping" in this skill's `SKILL.md` Step 3; the same procedure applies whether `/specify` was invoked directly or via `/claude-tweaks:flow`'s issue-mode hand-off) | The claim-release restoration steps (`wrap-up/cleanup-procedures.md` Section E, its `flow/multispec-review-console.md` duplicate, and `/claude-tweaks:flow`'s own declined-at-console release) restore `parked` on the issue iff this is `true` and the release outcome is not `merged:`/`pr-opened:` |
```

- [ ] **Step 12: `skills/routine/SKILL.md` — one Relationship-table row**

Replace:

```
| `/claude-tweaks:flow` | `skills/flow/routine-template.yml` is a consumer — a headless issue dispatcher; `/routine create flow` instantiates it. Unlike code-health's report-only template it carries write tools. |
```

with:

```
| `/claude-tweaks:triage` | `skills/triage/routine-template.yml` is a consumer — a headless issue dispatcher (`dispatch` subcommand); `/routine create triage` instantiates it. Unlike code-health's report-only template it carries write tools. |
```

- [ ] **Step 13: Verify no stray references remain across the whole repo**

Run: `grep -rln "agent:eligible\|agent:go\b\|agent:fast\b\|from-code-health\|--from-code-health" skills/ bin/ 2>/dev/null`
Expected: no output.

- [ ] **Step 14: Commit**

```bash
git add skills/init/bootstrap-steps.md skills/flow/failure-cards.md skills/flow/worktree-merge.md skills/help/context-flow.md skills/help/reference-card.md skills/code-health/SKILL.md skills/tidy/SKILL.md skills/tidy/scan-procedures.md skills/review/SKILL.md skills/specify/SKILL.md skills/specify/spec-template.md skills/routine/SKILL.md
git commit -m "Sweep remaining cross-references to the retired --from-code-health / agent:go"
```

---

### Task 13: Update `CLAUDE.md`'s own skill inventory

**Files:**
- Modify: `CLAUDE.md`

Found during Task 7's final re-review — the project's own root documentation
still lists the retired skill and flags. `CLAUDE.md` is checked into the
codebase and is the first thing a future reader (human or agent) consults;
leaving it stale here is exactly the kind of cross-file promise this project's
own conventions warn against breaking.

- [ ] **Step 1: Add `triage` to the skill directory list, bump the count**

Replace:

```
### Skill directories (25 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health
```

with:

```
### Skill directories (26 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, triage
```

`triage` fits the Utility category — no fixed lifecycle position, same as
`tidy`/`code-health`/`routine`.

- [ ] **Step 2: Fix the `flow` row in "Skills with sub-files"**

Replace:

```
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md, from-code-health.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails; issue-sourced batches (`--from-code-health`/`--from-label`/`--from-issues`) → claim → /specify briefs → multi-spec batch procedure, freeform-issue translation (Step 2.5 claims each issue per _shared/issue-claims.md before spec derivation); close-via-merge mapping (issues close on the user's merge, never `gh issue close`); --from-milestone + --require-eligible selectors; dispatch routine template (agent:go/agent:eligible lifecycle) |
```

with:

```
| flow | manifesto.md, multi-spec.md, multispec-review-console.md, steps-and-gates.md, survey.md, validation.md, worktree-merge.md, failure-cards.md | Pipeline Config Manifesto; multi-spec batching; consolidated multi-spec Review Console; Allowed Steps + Step Arguments + Gate Behavior + polish-phase decision tree (single canonical home); Creative Opportunities + Depth Opportunities survey ownership (end-of-run analysis-only surveys; Depth surfaces `/deepen` candidates without auto-refactoring); pre-flight validation; worktree-merge handoff; on-failure card templates (generic + polish-broke-verification) loaded only when a gate fails; close-via-merge mapping (issues close on the user's merge, never `gh issue close`); pure executor — accepts a spec number or an issue reference (`#<issue>`) handed off by `/claude-tweaks:triage dispatch`, never selects/filters/claims issues itself |
```

Note `from-code-health.md` is dropped from the sub-file list entirely (the
file no longer exists), and the whole issue-sourced-batch/`--from-milestone`/
`--require-eligible`/`agent:go`/`agent:eligible` clause is replaced — that
logic no longer lives in `/flow` at all.

- [ ] **Step 3: Verify no stray references remain**

Run: `grep -n "agent:go\|agent:eligible\|from-code-health\|require-eligible" CLAUDE.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md's skill inventory for /claude-tweaks:triage"
```

---

### Task 14: Second cross-reference sweep — `--from-label`/`--from-milestone` and a reintroduced stale claim

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/specify/spec-template.md`
- Modify: `bin/lib/issues/ingest.js`

Found during Task 12's own review. Task 12's final verification grep
(`agent:eligible|agent:go\b|agent:fast\b|from-code-health|--from-code-health`)
never covered `--from-label`/`--from-milestone`/`--require-eligible` — a real
gap in that grep's coverage, not a failure by Task 12 to do what it said. This
task also fixes a stale claim that Task 12's own Step 11 fix accidentally
reintroduced (see Step 3 below).

- [ ] **Step 1: `skills/_shared/github-pr-scan.md` — stale recommendation**

Replace:

```
| Code-health issue still valid | Suggest `/flow --from-code-health` or Capture to INBOX |
```

with:

```
| Code-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to INBOX |
```

- [ ] **Step 2: `skills/init/bootstrap-steps.md` — two `--from-label`/`--from-milestone` mentions**

Replace:

```
below entirely and go straight to "Write the flag to CLAUDE.md" with
`backlog-backend: github-issues`. GitHub issues is the richer, proven path
(filterable, visible outside the repo, works with `/flow --from-label` and
`--from-milestone`) — asking a neutral A/B question when the better option is
```

with:

```
below entirely and go straight to "Write the flag to CLAUDE.md" with
`backlog-backend: github-issues`. GitHub issues is the richer, proven path
(filterable, visible outside the repo, works with `/claude-tweaks:triage` for
authorization and headless dispatch) — asking a neutral A/B question when the
better option is
```

Replace:

```
1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /flow --from-label and --from-milestone
```

with:

```
1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /claude-tweaks:triage for authorization
   and headless dispatch
```

- [ ] **Step 3: `skills/specify/spec-template.md` — two remaining issues**

First, the `--from-label` mention. Replace:

```
Omit all four fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report pulled via `--from-label`) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment.
```

with:

```
Omit all four fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report resolved directly by issue reference) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment.
```

Second, a stale claim Task 12's own Step 11 fix reintroduced: the same
"console decline" mechanism thoroughly debunked and corrected across
`skills/_shared/issue-claims.md` (see that file's Consumers table and "The
status label" section) resurfaces here in different words. Replace:

```
| `recon-was-parked:` | Whether the source issue carried the `parked` label at ingestion time (removed at promotion — see "Restore-on-promotion bookkeeping" in this skill's `SKILL.md` Step 3; the same procedure applies whether `/specify` was invoked directly or via `/claude-tweaks:flow`'s issue-mode hand-off) | The claim-release restoration steps (`wrap-up/cleanup-procedures.md` Section E, its `flow/multispec-review-console.md` duplicate, and `/claude-tweaks:flow`'s own declined-at-console release) restore `parked` on the issue iff this is `true` and the release outcome is not `merged:`/`pr-opened:` |
```

with:

```
| `recon-was-parked:` | Whether the source issue carried the `parked` label at ingestion time (removed at promotion — see "Restore-on-promotion bookkeeping" in this skill's `SKILL.md` Step 3; the same procedure applies whether `/specify` was invoked directly or via `/claude-tweaks:flow`'s issue-mode hand-off) | The claim-release restoration steps (`wrap-up/cleanup-procedures.md` Section E — whose generic `abandoned:` path also covers a single-spec issue-mode run the user doesn't merge, per `_shared/issue-claims.md` — and its `flow/multispec-review-console.md` duplicate) restore `parked` on the issue iff this is `true` and the release outcome is not `merged:`/`pr-opened:` |
```

- [ ] **Step 4: `bin/lib/issues/ingest.js` — stale header comments**

Replace:

```
// pipeline briefs for any selector (--from-issues, --from-label, --from-code-health).
```

with:

```
// pipeline briefs for any selector (--from-issues, --from-label, or code-health's own label default).
```

Replace:

```
// Contract: skills/_shared/issue-claims.md; consumed by skills/flow/from-code-health.md.
```

with:

```
// Contract: skills/_shared/issue-claims.md; consumed by bin/lib/code-health/pull-issues.js.
```

Comment-only change — `issuesToBriefs` itself is unchanged and still generic;
verify this by reading `bin/lib/code-health/pull-issues.js` to confirm it's
the actual current consumer before committing.

- [ ] **Step 5: Verify no stray references remain**

Run: `grep -rln "agent:eligible\|agent:go\b\|agent:fast\b\|from-code-health\|--from-code-health\|--from-label\|--from-milestone\|--require-eligible" skills/ bin/ 2>/dev/null`

Expected: exactly two files, both legitimate (not retired-flag references) —
`bin/lib/issues/ingest.js` (this task's own Step 4 comment fix uses
`--from-label` generically, describing `issuesToBriefs`'s still-live,
still-generic label-selector parameter shape — not claiming `/flow` still has
this flag) and `bin/lib/issues/tests/ingest.test.js` (pre-existing test
fixtures using `agent:go`/`agent:eligible` as arbitrary example label
strings for that same generic function — assessed as a false alarm during
Task 12's review, not something this plan touches). Any *other* file appearing
in this grep's output is a real, unaddressed gap — investigate before
proceeding.

- [ ] **Step 6: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/init/bootstrap-steps.md skills/specify/spec-template.md bin/lib/issues/ingest.js
git commit -m "Second cross-reference sweep — retire remaining --from-label/--from-milestone mentions and a reintroduced stale claim"
```

---

### Task 15: Sweep `README.md` — the whole-branch review's most significant find

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

Found during the final whole-branch review. `README.md` was never in scope of
any of the first 14 tasks (none of them touched it), so it still describes
the retired `/flow --from-label`/`--from-issues`/`agent:eligible`/`agent:go`
mechanism as current, present-tense capability, and has no entry at all for
the new `/claude-tweaks:triage` skill — a real user-facing documentation gap
this project's own CLAUDE.md Don'ts explicitly warn about ("don't forget to
update README.md... when adding or changing skills").

- [ ] **Step 1: Rewrite the stale clause in `/claude-tweaks:code-health`'s README entry**

Replace:

```
Any issues — not just code-health's — can feed the pipeline: `/flow --from-label <label>` or `--from-issues <n,...>` batch-build labelled or hand-picked issues, and `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready. For projects that land fixes on an integration branch before the default branch, `/init` also offers a companion GitHub Actions workflow that labels and comments on the affected issues until the fix reaches default and GitHub's native close fires. Label an issue `agent:eligible` + `agent:go` and a scheduled dispatcher (`/routine create flow`) builds it hands-off — the labels are maintainer signatures, so drive-by issues can't dispatch themselves.
```

with:

```
Any issues code-health files feed into `/claude-tweaks:triage`, which authorizes and dispatches them for autonomous building (see below) — `/flow` itself never selects issues. `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready. For projects that land fixes on an integration branch before the default branch, `/init` also offers a companion GitHub Actions workflow that labels and comments on the affected issues until the fix reaches default and GitHub's native close fires.
```

(Leave the rest of this entry — the SCOPE → CLASSIFY → JUDGE workflow, claim
locking, stale-claim sweeping — untouched; only this one clause describes
retired behavior.)

- [ ] **Step 2: Add a `/claude-tweaks:triage` entry**

Insert this new entry immediately after the (now-corrected)
`/claude-tweaks:code-health` entry and before `/claude-tweaks:routine`:

```markdown

**`/claude-tweaks:triage`** — Authorizes GitHub issues for autonomous building and dispatches already-authorized ones to `/flow`. Bare invocation is interactive: pulls untiered `code-health`/`harness-health` issues, computes a mechanical recommendation (risk:low + effort:low → fast-track, else → approved) from code-health's own risk/effort labels, and applies one of three `status:*` tier labels (`needs-review`/`approved`/`fast-track`) after a single batch confirm — a human always executes the actual label write, even when the recommendation is accepted as-is. `triage dispatch` is the headless subcommand a scheduled Routine fires: it claims already-tiered issues (`refs/claims/issue-{N}`, same atomic lock as code-health) and hands each to `/claude-tweaks:flow #{issue}` for pure execution. A `fast-track` issue whose run comes back completely clean (zero hard-gate failures, zero review findings ≥ medium, diff within a small blast-radius cap) merges without waiting for a live approval; anything less than clean falls back to the normal wait. A failed build downgrades `fast-track` to `approved` (no repeat unsupervised attempts) and, after a configurable retry ceiling, strips the tier and flags `status:blocked` for a human to look at. Only the interactive invocation ever grants a tier — `dispatch` may only downgrade or strip one it reads, never originate authorization from nothing.
```

- [ ] **Step 3: Fix `CLAUDE.md`'s `/help` sub-file stage-count nit**

Replace:

```
| help | reference-card.md, context-flow.md, status-scan.md | Quick reference card (single source of truth for the command catalog); artifact flow documentation; pipeline status scan parallel-dispatch procedure (Stages 1-7, incl. Stage 4.5 current-PR scan) |
```

with:

```
| help | reference-card.md, context-flow.md, status-scan.md | Quick reference card (single source of truth for the command catalog); artifact flow documentation; pipeline status scan parallel-dispatch procedure (Stages 1-7 incl. sub-stages 1.5/4.5/4.6, current-PR scan, and triage-queue counts) |
```

- [ ] **Step 4: Verify no stray references remain in README.md**

Run: `grep -n "agent:eligible\|agent:go\b\|--from-label\|--from-issues\|--from-milestone\|/routine create flow" README.md`
Expected: no output. (Line 17's historical v5.15.0 changelog entry describing
these as what *shipped in that release* is out of scope — that's a record of
past behavior, not a claim about current capability, and this project's own
convention treats changelog entries as historical record, not live
documentation to be rewritten.)

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Sweep README.md for /claude-tweaks:triage — the whole-branch review's most significant find"
```

---

### Task 16: Fix the fast-track auto-merge's missing mechanical procedure

**Files:**
- Modify: `skills/triage/SKILL.md`
- Modify: `skills/wrap-up/review-console.md`
- Modify: `bin/lib/issues/retry.js`
- Modify: `bin/lib/issues/tests/retry.test.js`

Found during the final whole-branch review. The auto-merge gate's own text
says "merge immediately (tag the merge commit `[fast-lane]`)" but never
specifies *how* — the only existing merge machinery
(`/superpowers:finishing-a-development-branch`, invoked from
`wrap-up/cleanup-procedures.md` Section C) is interactive, presenting
merge/PR/discard options to a human who isn't there during a headless
`dispatch` run. Worse, that path's own "Merge locally" option is a bare
fast-forward `git merge` with **no merge commit at all** on the common case —
exactly why `cleanup-procedures.md` Section C uses an empty *carrier* commit
for the closing keyword rather than tagging the merge commit itself. On a
fast-forward, there is no commit for `[fast-lane]` to land on, and `/help`
Stage 4.6's "auto-merged this week" count (which greps the default branch for
`[fast-lane]`-tagged commits) would silently undercount.

The fix mirrors `flow/worktree-merge.md`'s already-established pattern for
another headless-adjacent case (parallel worktree reconciliation): an
explicit `git merge --no-ff` guarantees a real merge commit exists, which
both carries the `[fast-lane]` tag and the `Fixes #{issue}` closing keyword
in the same commit message — no separate carrier commit needed for this path.

- [ ] **Step 1: Read the current "Auto-merge gate" section in `skills/triage/SKILL.md`**

Find the paragraph beginning "**All four pass:**" (search for `[fast-lane]`)
to confirm its exact current wording before editing.

- [ ] **Step 2: Replace the vague "merge immediately" instruction with an explicit procedure**

Replace:

```
**All four pass:** merge without waiting for a live approval. Tag the merge
commit `[fast-lane]`. Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever Auto-applied /
Skill updates / Configuration updates sections wrap-up already produced) to a
`PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped,
only the wait for a click is skipped.
```

with:

```
**All four pass:** merge directly, bypassing the interactive
`/superpowers:finishing-a-development-branch` handoff entirely (there is no
human present to answer its merge/PR/discard prompt during a headless
`dispatch` run). Before merging, clear this run's worktree assignment the
same way `flow/worktree-merge.md`'s reconciliation does (`node
"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`) so the
merge itself, landing in the main checkout, isn't denied as a wrong-checkout
commit. Then, from the main checkout:

```bash
git merge --no-ff "$BRANCH" -m "[fast-lane] {one-line summary}

Fixes #{issue}"
git push
```

The explicit `--no-ff` guarantees a real merge commit exists even when the
branch would otherwise fast-forward — this is what the `[fast-lane]` tag
lands on, and the same commit message carries the `Fixes #{issue}` closing
keyword per "Close-via-merge" in `_shared/issue-claims.md`, so no separate
carrier commit is needed for this path. **If the merge conflicts:** conflict
resolution requires judgment a headless run can't supply — abort the merge
(`git merge --abort`) and fall back to Standard (present the normal Review
Console, wait for a human), logging why the fast-lane path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Merge commit: {sha}. Reversibility: high (git revert).`
Attach the full Review-Console-equivalent summary (whatever Auto-applied /
Skill updates / Configuration updates sections wrap-up already produced) to a
`PushNotification` as a non-blocking FYI — nothing wrap-up found is dropped,
only the wait for a click is skipped.
```

- [ ] **Step 3: Apply the same fix to `skills/wrap-up/review-console.md`'s "Fast-track short-circuit" section**

Find the equivalent "**All four pass:**" paragraph in this file (search for
`[fast-lane]`) and apply the same substantive fix — merge mechanics
(worktree-assignment clear, `git merge --no-ff` with the `Fixes #{issue}`
keyword, conflict fallback to Standard) — adjusted to fit this file's own
surrounding wording rather than a verbatim copy-paste of Step 2's text.

- [ ] **Step 4: Fix `retry.js`'s inaccurate terminal comment wording (Minor finding)**

The comment `attemptFailedCommentBody` generates always ends "Claim
released, will retry." — true for a comment posted below the retry ceiling,
false for the comment posted on the attempt that *hits* the ceiling (no
retry follows; the tier gets stripped and `status:blocked` set instead).

Update the function to accept whether this attempt hit the ceiling and vary
its closing clause accordingly:

```js
// bin/lib/issues/retry.js
function attemptFailedCommentBody({ attemptNumber, reason, ceilingHit }) {
  const closing = ceilingHit
    ? 'Retry ceiling reached — no further automatic retries.'
    : 'Claim released, will retry.';
  return `Attempt ${attemptNumber} failed: ${reason}. ${closing}`;
}
```

Update `bin/lib/issues/tests/retry.test.js`'s existing
`attemptFailedCommentBody` test to also cover the `ceilingHit: true` case
(add a new test rather than modifying the existing one, which should keep
asserting the default/`false` case):

```js
test('attemptFailedCommentBody varies its closing line when the ceiling was hit', () => {
  const body = attemptFailedCommentBody({ attemptNumber: 3, reason: 'test gate failed', ceilingHit: true });
  assert.strictEqual(body, 'Attempt 3 failed: test gate failed. Retry ceiling reached — no further automatic retries.');
});
```

Run `node --test bin/lib/issues/tests/retry.test.js` and confirm all tests
(the existing ones plus the new one) pass.

- [ ] **Step 5: Wire up (or remove) `hasHitRetryCeiling` — it's currently dead code with a latent off-by-one trap (Minor finding)**

`skills/triage/SKILL.md`'s dispatch Step 4 inlines its own ceiling check
(`attemptNumber >= ceiling`, where `attemptNumber` already accounts for the
current attempt) rather than calling `retry.js`'s own exported
`hasHitRetryCeiling(comments, ceiling)`, which compares an *already-posted*
comment count against the ceiling. These only agree if `hasHitRetryCeiling`
is called strictly *after* posting the current attempt's comment — call it
before, and it's off by one. Since nothing currently calls it, this is a
trap for a future caller, not a live bug — but leaving an untested-in-context
export around is worse than removing it.

Update `skills/triage/SKILL.md`'s dispatch Step 4 (the same JSON-emitting
`node -e` snippet from Step 2's `ceilingHit` computation) to call
`hasHitRetryCeiling` explicitly instead of reimplementing the comparison
inline, making the call-timing dependency visible in the one place that
matters:

```js
const { countFailedAttempts, hasHitRetryCeiling } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
const comments = require(process.argv[1]);
const attemptNumber = countFailedAttempts(comments) + 1;
const ceiling = Number(process.argv[2] || 3);
// hasHitRetryCeiling counts existing comments only — call it against attemptNumber's
// equivalent by treating "this attempt" as already-counted (attemptNumber IS that count).
const ceilingHit = attemptNumber >= ceiling; // equivalent to hasHitRetryCeiling if comments included this attempt's own (not-yet-posted) comment
console.log(JSON.stringify({ attemptNumber, ceilingHit }));
```

Read the current exact text of this snippet in `skills/triage/SKILL.md`
first (search for `countFailedAttempts`) — apply the substantive change
(explicitly reference `hasHitRetryCeiling` in the destructure and in a
one-line comment explaining the timing relationship, per above) to whatever
the actual current text is, rather than assuming it matches the snippet
above verbatim.

- [ ] **Step 6: Verify**

Run: `node --test bin/lib/issues/tests/retry.test.js`
Expected: all tests pass, including the new ceiling-hit wording test.

Run: `grep -n "merge immediately" skills/triage/SKILL.md skills/wrap-up/review-console.md`
Expected: no output (replaced by the explicit procedure in both files).

- [ ] **Step 7: Commit**

```bash
git add skills/triage/SKILL.md skills/wrap-up/review-console.md bin/lib/issues/retry.js bin/lib/issues/tests/retry.test.js
git commit -m "Specify the fast-track auto-merge's mechanical procedure and fix retry.js's minor findings"
```

---

## Final verification

- [ ] Run the full test suite and confirm no regressions beyond the
  pre-existing flaky `statusline.test.js` timing test:

  Run: `npm test 2>&1 | tail -15`
  Expected: all `bin/lib/issues/tests/*` pass, including the two new files
  from Tasks 1-2.

- [ ] Confirm no file in the repository still references the retired labels,
  the deleted `from-code-health.md`, or the retired `/flow` selector flags:

  Run: `grep -rln "agent:eligible\|agent:go\b\|agent:fast\b\|from-code-health\|--from-code-health\|--from-label\|--from-milestone\|--require-eligible" skills/ bin/ 2>/dev/null`
  Expected: exactly `bin/lib/issues/ingest.js` and
  `bin/lib/issues/tests/ingest.test.js` — both legitimate generic uses
  unrelated to `/flow`'s retired flags (see Task 14 Step 5 for why). Any
  other file appearing here is a real, unaddressed gap.

- [ ] Confirm `skills/flow/from-code-health.md` and
  `skills/flow/routine-template.yml` no longer exist and
  `skills/triage/SKILL.md` / `skills/triage/routine-template.yml` do:

  Run: `ls skills/flow/from-code-health.md skills/flow/routine-template.yml 2>&1; ls skills/triage/`
  Expected: the first `ls` reports both paths as missing; the second lists
  `SKILL.md` and `routine-template.yml`.
