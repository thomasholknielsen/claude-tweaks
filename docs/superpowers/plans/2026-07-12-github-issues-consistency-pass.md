# GitHub Issues Workflow — Consistency Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the 13 open + 2 partial findings remaining from `docs/github-issues-integration-review.md` and fix three duplication patterns found while scoping the fix (a verbatim-duplicated release paragraph, a 4x-copy-pasted label bootstrap loop, and `triage/SKILL.md` Step 4 hand-restating `wrap-up`'s release mechanics instead of referencing them).

**Architecture:** Two categories of change. (1) `bin/lib/**` pure JS modules + their `bin/*.js` CLI consumers, each with `node --test` unit/integration coverage. (2) Markdown skill-prose files (`skills/**/*.md`) with no automated test coverage — verified by self-review grep checks against the design intent, plus the full JS suite to catch any incidental breakage. Task order respects one real dependency: Task 9 (de-duplicating `multispec-review-console.md`'s two release paragraphs) must land before Task 13 (the new shared label-bootstrap snippet), so Task 13 only has to update the resulting single site, not two.

**Tech Stack:** Node 18+, `node --test`, `gh` CLI (invoked from skill prose, never from `bin/lib/**`).

## Global Constraints

- `bin/lib/**` modules are pure — no network, no `gh` calls. Only `bin/*.js` CLI entry points and skill-prose `bash` blocks call `gh`. (Source: every existing module's own header comment, e.g. `bin/lib/issues/claims.js:1-5`.)
- Every skill-prose edit must be read back against the actual current file content before editing — the codebase's own CLAUDE.md Don'ts warn against asserting behavior without grepping the literal text first.
- Full suite (`npm test`) must pass after every task, not just the task's own new tests.
- Never use `git commit --amend`; always a fresh commit per step.
- Work from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-consistency-pass` (this plan's worktree) — verify with `pwd` and `git rev-parse --show-toplevel` before every commit.

---

### Task 1: `tier.js` — harness-health tiering via a kind-adapter chain

**Files:**
- Modify: `bin/lib/issues/tier.js`
- Test: `bin/lib/issues/tests/tier.test.js`

**Interfaces:**
- Consumes: nothing new — reads label arrays exactly as today.
- Produces: `extractRiskEffort(labels)` and `recommendTier({riskTier, effortTier})`, same public signatures as today (no consumer elsewhere needs to change — `triage/SKILL.md:65-66` calls `extractRiskEffort(i.labels)` and picks up the new behavior automatically).

- [ ] **Step 1: Write the failing tests**

Add to the end of `bin/lib/issues/tests/tier.test.js`:

```js
test('extractRiskEffort maps harness-health:additive to riskTier low, effortTier low', () => {
  const labels = ['harness-health', 'harness-health:additive'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('extractRiskEffort maps harness-health:restructural to riskTier high, effortTier high', () => {
  const labels = ['harness-health', 'harness-health:restructural'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'high' });
});

test('extractRiskEffort leaves harness-health:new-skill unmatched (new-skill proposals never fast-track)', () => {
  const labels = ['harness-health', 'harness-health:new-skill'];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: undefined, effortTier: undefined });
});

test('extractRiskEffort works with {name} label objects for harness-health too', () => {
  const labels = [{ name: 'harness-health:additive' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'low', effortTier: 'low' });
});

test('recommendTier: harness-health additive mapping reaches fast-track', () => {
  const { riskTier, effortTier } = extractRiskEffort(['harness-health:additive']);
  assert.strictEqual(recommendTier({ riskTier, effortTier }), 'fast-track');
});

test('recommendTier: harness-health restructural mapping stays approved', () => {
  const { riskTier, effortTier } = extractRiskEffort(['harness-health:restructural']);
  assert.strictEqual(recommendTier({ riskTier, effortTier }), 'approved');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/tier.test.js`
Expected: the 6 new tests FAIL (harness-health labels currently produce `{riskTier: undefined, effortTier: undefined}` for everything), all pre-existing tests still PASS.

- [ ] **Step 3: Implement the kind-adapter chain**

Replace the full contents of `bin/lib/issues/tier.js` with:

```js
// Pure: the mechanical Tier Rule for /claude-tweaks:triage's bare (interactive)
// invocation. Given an issue's own labels, decides which status:* tier to
// recommend. No discretionary judgment here — the recommendation is always
// subject to an explicit human batch-confirm before any label is written.
'use strict';

const RISK_RE = /^code-health:risk-(low|medium|high)$/;
const EFFORT_RE = /^code-health:effort-(low|medium|high)$/;
const HARNESS_HEALTH_CLASSIFICATION_RE = /^harness-health:(additive|restructural)$/;

function extractCodeHealthRiskEffort(names) {
  const risk = names.map((n) => RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => EFFORT_RE.exec(n)).find(Boolean);
  if (!risk && !effort) return null;
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

// harness-health has no independent risk/effort dimensions — additive/restructural
// is a single classification label. additive (safe, mechanical patch) maps both
// tiers to 'low' so it satisfies recommendTier's fast-track condition;
// restructural (needs human review) maps both to 'high' so it never does.
// harness-health:new-skill findings carry neither label and intentionally fall
// through unmatched — new-skill proposals should never be fast-track-eligible.
function extractHarnessHealthRiskEffort(names) {
  const match = names.map((n) => HARNESS_HEALTH_CLASSIFICATION_RE.exec(n)).find(Boolean);
  if (!match) return null;
  return match[1] === 'additive'
    ? { riskTier: 'low', effortTier: 'low' }
    : { riskTier: 'high', effortTier: 'high' };
}

const KIND_ADAPTERS = [extractCodeHealthRiskEffort, extractHarnessHealthRiskEffort];

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  for (const adapter of KIND_ADAPTERS) {
    const result = adapter(names);
    if (result) return result;
  }
  return { riskTier: undefined, effortTier: undefined };
}

function recommendTier({ riskTier, effortTier }) {
  if (riskTier === 'low' && effortTier === 'low') return 'fast-track';
  return 'approved';
}

module.exports = { extractRiskEffort, recommendTier };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/tier.test.js`
Expected: all tests PASS (pre-existing + 6 new).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass (858 + 6 new = 864).

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/lib/issues/tier.js bin/lib/issues/tests/tier.test.js
git commit -m "$(cat <<'EOF'
Add harness-health tiering to tier.js via a kind-adapter chain

harness-health:additive/restructural now map to the same {riskTier,
effortTier} shape code-health's risk/effort labels already produce,
so /triage's batch table recommends fast-track for safe mechanical
patches instead of always defaulting to approved. new-skill findings
intentionally stay unmatched (never fast-track-eligible).
EOF
)"
```

---

### Task 2: `watchman-core/dedup.js` — add the `reopen` branch

**Files:**
- Modify: `bin/lib/watchman-core/dedup.js`
- Test: `bin/lib/watchman-core/tests/dedup.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `decide(finding, issueIndex, cache)` now also returns `{action: 'reopen', issue, note}` for a closed non-wontfix match — Task 3 consumes this new return shape.

- [ ] **Step 1: Write the failing test**

Add to the end of `bin/lib/watchman-core/tests/dedup.test.js`:

```js
test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: [] } };
  const result = decide({ id: 'x-abc' }, issueIndex, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 5);
  assert.ok(typeof result.note === 'string' && result.note.length > 0);
});

test('decide still suppresses a closed match that carries wontfix (reopen never overrides a standing wontfix)', () => {
  const issueIndex = { 'x-abc': { number: 5, state: 'closed', labels: ['wontfix'] } };
  assert.deepStrictEqual(decide({ id: 'x-abc' }, issueIndex, {}), { action: 'suppress', issue: 5 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/watchman-core/tests/dedup.test.js`
Expected: the first new test FAILS (`decide skips when the matching issue is closed` — the pre-existing test at line ~20-23 — still passes today, since the old behavior IS skip; the new test asserting `action === 'reopen'` fails).

- [ ] **Step 3: Implement the reopen branch**

Replace the full contents of `bin/lib/watchman-core/dedup.js` with:

```js
'use strict';

// Decide what to do with a freshly-fingerprinted finding given the current
// issue index and local cache. Pure — no I/O, no network.
//
// issueIndex: precomputed map { "<fingerprint>": { number, state, labels } }
//   built by the calling skill from `gh issue list --label <skill>` output —
//   the engine never calls network.
//
// Decision logic:
//   open issue match           -> skip      (already filed, don't re-file)
//   wontfix-labelled issue     -> suppress  (standing decision — never re-propose)
//   closed non-wontfix match   -> reopen    (regressed)
//   'declined' in local cache  -> suppress  (user rejected this exact finding)
//   'staged' in local cache    -> skip      (already filed, unresolved)
//   otherwise                  -> file
function decide(finding, issueIndex, cache) {
  const fp = finding.id;
  const match = issueIndex && fp && issueIndex[fp];
  if (match) {
    if ((match.labels || []).includes('wontfix')) return { action: 'suppress', issue: match.number };
    if (match.state === 'closed') {
      return {
        action: 'reopen',
        issue: match.number,
        note: 'regressed — this finding was previously closed and has reappeared',
      };
    }
    return { action: 'skip', issue: match.number };
  }
  const cached = cache && fp && cache[fp];
  if (cached && cached.status === 'declined') return { action: 'suppress' };
  if (cached && cached.status === 'staged') return { action: 'skip' };
  return { action: 'file' };
}

module.exports = { decide };
```

Note: the pre-existing test `decide skips when the matching issue is closed` (`bin/lib/watchman-core/tests/dedup.test.js:20-23`) now needs updating — it asserted `{action: 'skip', issue: 5}` for a closed non-wontfix match, which is no longer correct. Update it in place:

```js
test('decide reopens when the matching issue is closed and not wontfix (regressed)', () => {
```

(This replaces the old `'decide skips when the matching issue is closed'` test — delete the old one, since the two new tests written in Step 1 already cover both the closed/non-wontfix and closed/wontfix cases. Do not leave both the old skip-assertion test and the new reopen-assertion test in the file — they contradict each other.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/watchman-core/tests/dedup.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/lib/watchman-core/dedup.js bin/lib/watchman-core/tests/dedup.test.js
git commit -m "$(cat <<'EOF'
Add reopen branch to watchman-core/dedup.js

Mirrors code-health/dedup.js's own independent reopen branch, without
risk-threshold gating (watchman-core's consumers have no risk field to
threshold against). Fixes the harness-health/journey-health finding
that a closed-then-regressed finding was silently discarded forever.
EOF
)"
```

---

### Task 3: Wire `harness-health.js` + `journey-health.js` consumers for `reopen`

**Files:**
- Modify: `bin/harness-health.js`
- Modify: `bin/journey-health.js`
- Modify: `skills/harness-health/SKILL.md`
- Modify: `skills/journey-health/SKILL.md`
- Test: `bin/lib/harness-health/tests/cli-validate-findings.test.js`
- Test: `bin/lib/journey-health/tests/cli-validate-findings.test.js`

**Interfaces:**
- Consumes: Task 2's `decide()` returning `{action: 'reopen', issue, note}`.
- Produces: both CLIs now emit a payload for a `reopen` decision (same shape as `file`) and write `cache[finding.id] = {status: 'regressed', issue, lastSeenMs}`. The skill prose gains a `reopen`-vs-`file` branch mirroring `code-health/SKILL.md:248-253`'s existing pattern — reads the freshly-written cache back to find each reopen-flavored payload's target issue number (matched via the fingerprint marker already embedded in the payload body).

- [ ] **Step 1: Write the failing integration tests**

Add to the end of `bin/lib/harness-health/tests/cli-validate-findings.test.js`:

```js
test('validate-findings: a finding matching a closed non-wontfix issue is reopened, not dropped', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  const first = runValidateFindings(root, findingsFile);
  const firstPayloads = JSON.parse(first.stdout);
  const fp = firstPayloads[0].body.match(/<!--\s*harness-health-fingerprint:\s*(harnesshealth-[0-9a-f]{8})\s*-->/)[1];

  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify([{ number: 9, state: 'closed', labels: ['harness-health'], fingerprint: fp }]));

  const second = runValidateFindings(root, findingsFile, ['--issues', issuesFile]);
  assert.strictEqual(second.status, 0, `stderr: ${second.stderr}`);
  const payloads = JSON.parse(second.stdout);
  assert.strictEqual(payloads.length, 1, 'a regressed finding must still emit a payload, not be silently dropped');

  const cache = JSON.parse(fs.readFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'cache.json'), 'utf8'));
  assert.strictEqual(cache[fp].status, 'regressed');
  assert.strictEqual(cache[fp].issue, 9);
});
```

Add the equivalent to the end of `bin/lib/journey-health/tests/cli-validate-findings.test.js` — read that file first to match its exact `validFinding()`/`runValidateFindings()` helper names and its cache path (`.claude-tweaks/journey-health/cache.json`) and fingerprint prefix (`journeyhealth-`) before writing the test, since journey-health's helper signatures may differ slightly from harness-health's.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/harness-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js`
Expected: both new tests FAIL — `payloads.length` is `0` today (the `reopen` decision is dropped, matching neither `skip`/`suppress` continue nor the `file`-only push).

- [ ] **Step 3: Wire `bin/harness-health.js`**

In `bin/harness-health.js`, find the loop inside `cmdValidateFindings` (currently):

```js
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
```

Replace with:

```js
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, lastSeenMs: Date.now() }
        : { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
```

- [ ] **Step 4: Wire `bin/journey-health.js`**

In `bin/journey-health.js`, find the identical loop shape inside its `cmdValidateFindings` (currently):

```js
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file') {
      cache[finding.id] = { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
```

Replace with the same pattern as Step 3:

```js
    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, lastSeenMs: Date.now() }
        : { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/harness-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js`
Expected: both new tests PASS; all pre-existing tests in both files still PASS.

- [ ] **Step 6: Update `skills/harness-health/SKILL.md` Step 7 — FILE prose**

Read `skills/harness-health/SKILL.md` around its "Step 7 — FILE" section (the `gh issue create` line, immediately after the label-bootstrap block) before editing, to match current line numbers exactly. Immediately after the existing:

```
For each payload, file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`. This applies uniformly — CLAUDE.md findings, design-artifact findings, additive skill/rule patches, restructural patches, and new-skill candidates all file the same way. `/harness-health` never edits anything directly; matching `/code-health`, it only ever judges and files.
```

Add a new paragraph (mirrors `code-health/SKILL.md:248-253`'s existing reopen prose):

```
For a payload whose fingerprint marker (`<!-- harness-health-fingerprint: {id} -->`, embedded in `payload.body`) matches a `status: "regressed"` entry in `.claude-tweaks/harness-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field. In `--dry-run` mode, print the payload and the `gh` commands that would run, but do not call `gh`.
```

- [ ] **Step 7: Update `skills/journey-health/SKILL.md` Step 6 — FILE prose**

Read `skills/journey-health/SKILL.md` around its "Step 6 — FILE" section before editing. Immediately after the existing:

```
For each payload in `/tmp/journey-health-payloads-light.json` and (when Step 3.5 ran) `/tmp/journey-health-payloads-deep.json`: `gh issue create --title "<payload.title>" --body "<payload.body>" --label journey-health --label "<payload.labels[1]>" --label "<payload.labels[2]>"`. `/journey-health` never edits journey files, stories, or code — every finding files, unconditionally.
```

Add the same shape of paragraph as Step 6 above, adapted for journey-health's cache path and fingerprint prefix:

```
For a payload whose fingerprint marker (`<!-- journey-health-fingerprint: {id} -->`, embedded in `payload.body`) matches a `status: "regressed"` entry in `.claude-tweaks/journey-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field. In `--dry-run` mode, print the payload and the `gh` commands that would run, but do not call `gh`.
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/harness-health.js bin/journey-health.js skills/harness-health/SKILL.md skills/journey-health/SKILL.md bin/lib/harness-health/tests/cli-validate-findings.test.js bin/lib/journey-health/tests/cli-validate-findings.test.js
git commit -m "$(cat <<'EOF'
Wire harness-health and journey-health consumers for the reopen decision

Both CLIs now emit a payload and cache a status:"regressed" entry for
a reopen decision instead of silently dropping it. Both skills' FILE
steps gain the same reopen-vs-file branch code-health/SKILL.md already
has, so a regressed finding gets `gh issue reopen` instead of being
filed as a duplicate.
EOF
)"
```

---

### Task 4: `triage/SKILL.md` Step 2 — literal claim-attempt code block

**Files:**
- Modify: `skills/triage/SKILL.md`

- [ ] **Step 1: Make the edit**

Read `skills/triage/SKILL.md`'s "### Step 2: Claim each" section before editing, to confirm current line numbers. Replace:

```
Resolve the sha once per run, then for each issue attempt the atomic ref creation exactly as
`_shared/issue-claims.md`'s "The lock" section describes (`gh api repos/{owner}/{repo}/git/refs
-f ref=refs/claims/issue-${ISSUE} -f sha=${SHA}`).
```

with:

```
Resolve the sha once per run, then for each issue attempt the atomic ref creation exactly as
`_shared/issue-claims.md`'s "The lock" section describes:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
```
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n 'DEFAULT_BRANCH=\$(gh api' skills/triage/SKILL.md`
Expected: at least two matches — the new one in Step 2, and the pre-existing one in Step 1 ("Pull tiered, unclaimed issues" doesn't have this pattern; the pre-existing sha-resolution code lives in `_shared/issue-claims.md`'s own "The lock" section, which this edit is now consistent with rather than duplicating differently).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass (markdown-only edit; suite unaffected — this step confirms no incidental breakage).

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/triage/SKILL.md
git commit -m "Give triage/SKILL.md Step 2 a literal bash block for the claim attempt, matching Steps 1 and 4"
```

---

### Task 5: `triage/SKILL.md` Step 4 — reference Section E instead of restating

**Files:**
- Modify: `skills/triage/SKILL.md`

- [ ] **Step 1: Make the edit**

Read `skills/triage/SKILL.md`'s "### Step 4: On pipeline failure — retry ceiling" item 2 before editing. Replace:

```
2. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s
   Release triggers table), then remove `status:in-progress`
   (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort — log a warning and
   continue on failure, the same as every other release site).
```

with:

```
2. Release the claim (reason: `failed: {gate}`, per `_shared/issue-claims.md`'s
   Release triggers table), then remove `status:in-progress` the same way
   `wrap-up/cleanup-procedures.md` Section E step 7 does
   (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort — log a warning and
   continue on failure). This is a cross-reference, not a restatement — if Section E's mechanics
   for this step ever change, this step must be re-verified against it rather than assumed
   still correct.
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n "Section E step 7 does" skills/triage/SKILL.md`
Expected: one match, inside Step 4 item 2.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/triage/SKILL.md
git commit -m "$(cat <<'EOF'
Have triage Step 4 reference wrap-up Section E instead of restating it

No behavior change — the mechanics were already correct after the
earlier review-fix round. This closes the structural drift path that
caused the original four-gap cluster (findings #8/#19/#20/#21/#23):
Step 4 hand-copied its own version of the release mechanics instead
of pointing at the canonical copy, so a future edit to Section E could
silently desync it again.
EOF
)"
```

---

### Task 6: Wire the gh-availability Detection Ladder into `/triage`, `/wrap-up`, `multispec-review-console.md`

**Files:**
- Modify: `skills/triage/SKILL.md`
- Modify: `skills/wrap-up/cleanup-procedures.md`
- Modify: `skills/flow/multispec-review-console.md`

- [ ] **Step 1: Add the gate to `triage/SKILL.md`**

Read the file's "## Input" section (just before "## Workflow — Bare invocation") before editing. Immediately after the "## Input" table and before "## Workflow — Bare invocation (interactive triage)", insert:

```
## Preflight

Before either workflow below runs any `gh` command, run the Detection Ladder from
`_shared/github-pr-scan.md` (checks 1-3: GitHub remote exists, `gh` CLI installed, `gh`
authenticated + repo reachable). Unlike `/tidy`/`/help`'s use of this ladder (which fail-open
into a skipped scan), `/triage` treats any ladder failure as a hard gate — this skill's entire
purpose is writing GitHub state, so there is no meaningful degraded mode to fall back into.
Report the specific failing check and stop.
```

- [ ] **Step 2: Add the gate to `wrap-up/cleanup-procedures.md`**

Read Section E's opening paragraph before editing. Immediately before Section E's numbered list (before "1. **Multi-spec defer check:**"), insert:

```
Before any step below runs a `gh` command, run the Detection Ladder from
`_shared/github-pr-scan.md` (checks 1-3). A ladder failure here is a hard gate, not a fail-open
skip — Section E exists specifically to write GitHub state (release claims, remove labels); if
`gh` is unavailable there is nothing safe to degrade to. Report the specific failing check and
stop before attempting any release.
```

- [ ] **Step 3: Add the gate to `flow/multispec-review-console.md`**

Read the file's "## On approval (option 1)" section opening before editing. Immediately before "## On approval (option 1)", insert:

```
## Preflight

Before "On approval" or "On override" below runs any `gh` command, run the Detection Ladder
from `_shared/github-pr-scan.md` (checks 1-3). A ladder failure is a hard gate here, matching
`wrap-up/cleanup-procedures.md` Section E's own posture — this console's entire approval path
writes GitHub state (releases, tier-label removal), so there is no fail-open degraded mode.
```

- [ ] **Step 4: Verify all three edits**

Run: `grep -n "Detection Ladder from" skills/triage/SKILL.md skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md`
Expected: exactly one match per file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/triage/SKILL.md skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md
git commit -m "$(cat <<'EOF'
Wire the gh-availability Detection Ladder into /triage, /wrap-up, multispec-review-console.md

These three consumers of _shared/issue-claims.md had no hard gate for
a missing/unauthenticated gh CLI — the Detection Ladder existed only
in /tidy and /help. Unlike those two (which fail-open into a skipped
scan), all three sites here treat a ladder failure as a hard gate,
since their entire job is writing GitHub state.
EOF
)"
```

---

### Task 7: `cleanup-procedures.md` Section C — carrier-commit exemption for the multi-terminal-parallel path

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md`

- [ ] **Step 1: Make the edit**

Read Section C step 2 before editing. Replace:

```
2. **Stamp the closing-keyword carrier commit.** When any spec on the branch carries
   `recon-issue:` frontmatter, and *before* handing off to
   `/superpowers:finishing-a-development-branch`, commit an empty carrier commit on the feature
   branch from inside the worktree:
```

with:

```
2. **Stamp the closing-keyword carrier commit — worktree strategy, single-terminal path only.**
   Skip this step entirely when this run is part of a multi-terminal-parallel dispatch destined
   for `flow/worktree-merge.md`'s reconciliation merge (the run was launched via
   `/claude-tweaks:flow {spec} worktree` alongside sibling terminals, not a solo worktree run) —
   that merge stamps its own `Fixes #{issue}` lines directly (`--no-ff`, per "Close-via-merge" in
   `_shared/issue-claims.md`), and a carrier commit here would double-stamp the closing
   reference. Otherwise, when any spec on the branch carries `recon-issue:` frontmatter, and
   *before* handing off to `/superpowers:finishing-a-development-branch`, commit an empty
   carrier commit on the feature branch from inside the worktree:
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n "single-terminal path only" skills/wrap-up/cleanup-procedures.md`
Expected: one match.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/wrap-up/cleanup-procedures.md
git commit -m "$(cat <<'EOF'
Exempt the multi-terminal-parallel path from wrap-up's carrier-commit step

worktree-merge.md's --no-ff reconciliation merge already stamps its
own Fixes #N lines; without this exemption a multi-terminal-parallel
run's carrier commit doubled the closing reference on the same issue.
EOF
)"
```

---

### Task 8: `review-console.md` — fast-track release-reason mapping

**Files:**
- Modify: `skills/wrap-up/review-console.md`

- [ ] **Step 1: Make the edit**

Read the "## Fast-track short-circuit" section's "**All four pass**" paragraph before editing. Immediately after:

```
Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, {lines} lines across {files} files, zero findings >= medium. Merge commit: {sha}. Reversibility: high (git revert).`
```

(the one under "## Fast-track short-circuit", not the later duplicate under "## Auto-merge gate (fast-track only)" in `triage/SKILL.md`) insert a new paragraph:

```
**Release-reason mapping.** This direct merge counts as the `merged:` outcome for Section E's
release-reason mapping (`skills/wrap-up/cleanup-procedures.md` Section E step 2) — the fast-lane
path never runs `/superpowers:finishing-a-development-branch`, so Section E's usual "map the
outcome from that skill" instruction has nothing to read here; treat a successful fast-lane
merge exactly as if that skill had reported `merged`, with `$LINK` set to this merge's commit
sha.
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n "Release-reason mapping" skills/wrap-up/review-console.md`
Expected: one match.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/wrap-up/review-console.md
git commit -m "State explicitly that fast-track's direct merge counts as the merged: outcome for Section E's release-reason mapping"
```

---

### Task 9: `multispec-review-console.md` — de-duplicate the two verbatim release-procedure paragraphs

**Files:**
- Modify: `skills/flow/multispec-review-console.md`

- [ ] **Step 1: Make the edit**

Read the full "## On approval (option 1)" and "## On override (option 2)" sections before editing (both currently contain the identical paragraph at what are lines ~124-126 and ~136-138 today — line numbers shift once Task 6 has already landed its own insertion in this file, so re-read rather than trust the original line numbers). Replace item 9 under "## On approval (option 1)":

```
9. **Remove `status:in-progress`; restore `parked` if applicable**, per `wrap-up/cleanup-procedures.md` Section E: always remove `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}` (not `merged:`/`pr-opened:`) AND `reconWasParked` was `true` in `spec-{spec}/claim-frontmatter-{issue}.json` (item 6's capture, written during that spec's own Step 10, before its spec file was deleted — never re-read the spec file itself here, it's already gone), restore `parked` (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, log and continue on failure either way. Log each removal/restoration to `decisions.md`.
```

with:

```
9. **Remove `status:in-progress`; restore `parked` if applicable** — see "Per-issue label cleanup" below.
```

Then replace item 8 under "## On override (option 2)":

```
8. **Remove `status:in-progress`; restore `parked` if applicable**, per `wrap-up/cleanup-procedures.md` Section E: always remove `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}` (not `merged:`/`pr-opened:`) AND `reconWasParked` was `true` in `spec-{spec}/claim-frontmatter-{issue}.json` (item 6's capture, written during that spec's own Step 10, before its spec file was deleted — never re-read the spec file itself here, it's already gone), restore `parked` (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, log and continue on failure either way. Log each removal/restoration to `decisions.md`.
```

with:

```
8. **Remove `status:in-progress`; restore `parked` if applicable** — see "Per-issue label cleanup" below.
```

Then, immediately after the "## On override (option 2)" section's numbered list (before "## On stop (option 3)"), insert the extracted shared subsection:

```
### Per-issue label cleanup

Applies identically from both "On approval" item 9 and "On override" item 8 — this is the same
per-issue procedure either way, only what triggered it differs. Per `wrap-up/cleanup-procedures.md`
Section E: always remove `status:in-progress` (`gh issue edit "$ISSUE" --remove-label
status:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}`
(not `merged:`/`pr-opened:`) AND `reconWasParked` was `true` in
`spec-{spec}/claim-frontmatter-{issue}.json` (item 6's capture, written during that spec's own
Step 10, before its spec file was deleted — never re-read the spec file itself here, it's already
gone), restore `parked` (bootstrap if missing, then `gh issue edit "$ISSUE" --add-label parked`)
— best-effort, log and continue on failure either way. Log each removal/restoration to
`decisions.md`.
```

- [ ] **Step 2: Verify the edit**

Run: `grep -c "restore .parked. if applicable" skills/flow/multispec-review-console.md`
Expected: `2` (the two short reference lines in items 9/8), not the old `2` full-paragraph duplicates. Run: `grep -c "never re-read the spec file itself here, it's already gone" skills/flow/multispec-review-console.md` — expected `1` (only in the new "Per-issue label cleanup" subsection, confirming the duplication is gone).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/flow/multispec-review-console.md
git commit -m "$(cat <<'EOF'
De-duplicate multispec-review-console.md's release-procedure paragraph

The "remove status:in-progress; restore parked" procedure was
verbatim-identical under both On approval and On override — extracted
into one "Per-issue label cleanup" subsection both branches reference.
Zero behavior change.
EOF
)"
```

---

### Task 10: `github-pr-scan.md` — exclude `status:blocked` from the `repo-wide` pending-authorization count

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`

- [ ] **Step 1: Make the edit**

Read Scope `repo-wide` item 8 before editing. Replace:

```bash
   jq -s '[.[0][], .[1][]] | map(select((.labels | map(.name) | any(. == "tier:needs-review" or . == "tier:approved" or . == "tier:fast-track")) | not)) | length' \
     <(echo "$CODE_HEALTH_ISSUES_JSON") \
     <(echo "$HARNESS_HEALTH_ISSUES_JSON")
```

with:

```bash
   jq -s '[.[0][], .[1][]] | map(select((.labels | map(.name) | any(. == "tier:needs-review" or . == "tier:approved" or . == "tier:fast-track" or . == "status:blocked")) | not)) | length' \
     <(echo "$CODE_HEALTH_ISSUES_JSON") \
     <(echo "$HARNESS_HEALTH_ISSUES_JSON")
```

Immediately after this code block, in the same item 8's prose (currently ending "...do not hardcode a stale list here)."), add a sentence:

```
The exclusion also covers `status:blocked` — an issue that already hit its retry ceiling has
had its decision made and failed out; it is not "pending your initial decision" (same fix
already applied to the `triage-queue` scope below, consumed by `/help`).
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n 'status:blocked' skills/_shared/github-pr-scan.md`
Expected: matches in both the `repo-wide` scope (new) and the `triage-queue` scope (pre-existing) — at least 2.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/_shared/github-pr-scan.md
git commit -m "Exclude status:blocked from the repo-wide pending-authorization count, matching the triage-queue scope's existing fix"
```

---

### Task 11: `help/SKILL.md` — add the missing `/claude-tweaks:triage` relationship row

**Files:**
- Modify: `skills/help/SKILL.md`

- [ ] **Step 1: Make the edit**

Read the "## Relationship to Other Skills" table before editing. Add a new row (alphabetically/thematically near `/claude-tweaks:tidy`'s row, matching the table's existing loose grouping by lifecycle-vs-utility):

```
| `/claude-tweaks:triage` | Surfaces pending-authorization count, `status:blocked` count, and rolling auto-merge count on the dashboard (Stage 4.6, `triage-queue` scope) — the reciprocal of `triage/SKILL.md`'s own `/claude-tweaks:help` row. |
```

Insert it immediately after the existing `| \`/claude-tweaks:tidy\` | ... |` row.

- [ ] **Step 2: Verify the edit**

Run: `grep -c '/claude-tweaks:triage' skills/help/SKILL.md`
Expected: at least 1 (the new row) plus any pre-existing prose mentions.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/help/SKILL.md
git commit -m "Add /claude-tweaks:triage row to help/SKILL.md's Relationship table (triage/SKILL.md already claims this relationship one-directionally)"
```

---

### Task 12: `worktree-merge.md` — hardcoded `main` → `{base-branch}`

**Files:**
- Modify: `skills/flow/worktree-merge.md`

- [ ] **Step 1: Make the edit**

Read the "### Merge Order" section before editing. Replace:

```
1. Sort completed branches by diff size (smallest first — run `git diff --stat main..{branch}` and read the summary line at the end of its output)
```

with:

```
1. Sort completed branches by diff size (smallest first — run `git diff --stat {base-branch}..{branch}` and read the summary line at the end of its output)
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n 'git diff --stat' skills/flow/worktree-merge.md`
Expected: one match, now using `{base-branch}` — confirms no lingering hardcoded `main`.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/flow/worktree-merge.md
git commit -m "Fix worktree-merge.md's hardcoded main to {base-branch}, matching every other reference in the file"
```

---

### Task 13: New `_shared/label-bootstrap.md` + wire all bootstrap sites

**Files:**
- Create: `skills/_shared/label-bootstrap.md`
- Modify: `skills/triage/SKILL.md` (3 sites: tier labels, `status:in-progress`, `status:blocked`)
- Modify: `skills/code-health/SKILL.md`
- Modify: `skills/harness-health/SKILL.md`
- Modify: `skills/tidy/SKILL.md` (2 sites: Defer, Sync to GitHub)
- Modify: `skills/wrap-up/cleanup-procedures.md` (Section E's `parked` restoration)
- Modify: `skills/flow/multispec-review-console.md` (the single "Per-issue label cleanup" site left after Task 9's dedup)

This task depends on Task 9 having already landed (so `multispec-review-console.md` has exactly one parked-restoration site to update, not two).

- [ ] **Step 1: Create the shared snippet**

Write `skills/_shared/label-bootstrap.md`:

```markdown
# Label Bootstrap — Shared Check-Then-Create Snippet

The canonical check-then-create loop every label-filing skill in this codebase uses. Referenced
by `triage/SKILL.md` (tier labels, `status:in-progress`, `status:blocked`), `code-health/SKILL.md`,
`harness-health/SKILL.md`, `tidy/SKILL.md` (`parked`/`backlog` bootstrap), and
`wrap-up/cleanup-procedures.md` Section E / `flow/multispec-review-console.md` (the shared
`parked` restoration step). Consumers reference this file; do not restate the loop inline.

Given a `LABELS` array of `[name, description]` pairs:

```bash
node -e "
  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');
  const labels = ${LABELS_JSON};
  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));
" > /tmp/label-bootstrap-payloads.json
node -e "const ls=require('/tmp/label-bootstrap-payloads.json'); ls.forEach(l => console.log(l.name + '\t' + l.description))" | while IFS=$'\t' read -r NAME DESCRIPTION; do
  gh label list --search "$NAME" --json name -q '.[].name' | grep -qx "$NAME" || \
    gh label create "$NAME" --description "$DESCRIPTION"
done
```

`ensureLabelPayload` throws at construction if a description exceeds GitHub's 100-char cap
(`bin/lib/issues/labels.js`) — a too-long description fails loudly here, not as a silent 422 on
`gh label create`. `${LABELS_JSON}` is a literal JS array-of-pairs, substituted inline by each
consumer with its own label list — for a single label, use a one-element array
(`[['status:blocked', '...']]`) rather than reaching for a separate single-label variant.
```

- [ ] **Step 2: Wire `triage/SKILL.md`'s three sites**

Read all three bootstrap blocks in `skills/triage/SKILL.md` before editing (Step 4's tier-label bootstrap, `status:in-progress`'s bootstrap, `status:blocked`'s bootstrap). Replace the tier-label block:

```bash
node -e "
  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');
  const labels = [
    ['tier:approved', 'Triage authorized this for building - human approves the merge'],
    ['tier:fast-track', 'Triage authorized this for building - auto-merges if the run comes back clean'],
    ['tier:needs-review', 'Triage flagged this - needs a closer human look before authorizing'],
  ];
  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));
" > /tmp/triage-tier-label-payloads.json
node -e "const ls=require('/tmp/triage-tier-label-payloads.json'); ls.forEach(l => console.log(l.name + '\t' + l.description))" | while IFS=$'\t' read -r NAME DESCRIPTION; do
  gh label list --search "$NAME" --json name -q '.[].name' | grep -qx "$NAME" || \
    gh label create "$NAME" --description "$DESCRIPTION"
done
```

with:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['tier:approved', 'Triage authorized this for building - human approves the merge'],
#  ['tier:fast-track', 'Triage authorized this for building - auto-merges if the run comes back clean'],
#  ['tier:needs-review', 'Triage flagged this - needs a closer human look before authorizing']]
```

Replace the `status:in-progress` bootstrap block:

```bash
DESCRIPTION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js').ensureLabelPayload('status:in-progress', 'Claimed and being built by an autonomous claude-tweaks run').description)")
gh label list --search "status:in-progress" --json name -q '.[].name' | grep -qx status:in-progress || \
  gh label create status:in-progress --description "$DESCRIPTION"
gh issue edit "$ISSUE" --add-label status:in-progress
```

with:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['status:in-progress', 'Claimed and being built by an autonomous claude-tweaks run']]
gh issue edit "$ISSUE" --add-label status:in-progress
```

Replace the `status:blocked` bootstrap block:

```bash
DESCRIPTION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js').ensureLabelPayload('status:blocked', 'Hit its retry ceiling under autonomous dispatch - needs a human look').description)")
gh label list --search "status:blocked" --json name -q '.[].name' | grep -qx status:blocked || \
  gh label create status:blocked --description "$DESCRIPTION"
```

with:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['status:blocked', 'Hit its retry ceiling under autonomous dispatch - needs a human look']]
```

At the top of each of the three sections (Step 3's "Apply", Step 2's claim-acquisition, Step 4 item 5), add a one-line pointer if not already implied by the comment: `See _shared/label-bootstrap.md for the check-then-create loop this comment abbreviates.` — only add this pointer once per file if the three comments alone don't make the reference obvious; skip it if redundant.

- [ ] **Step 3: Wire `code-health/SKILL.md`**

Read the Step 9 bootstrap block before editing. Replace the full `node -e "..." | while ...; done` block (the one building `/tmp/code-health-label-payloads.json`) with:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['code-health', 'Filed by the code-health engine - a systematic maintainability finding'],
#  ['code-health:risk-low', "Risk tier if this finding's suggested fix goes wrong"],
#  ['code-health:risk-medium', "Risk tier if this finding's suggested fix goes wrong"],
#  ['code-health:risk-high', "Risk tier if this finding's suggested fix goes wrong"],
#  ['code-health:effort-low', "Estimated effort to implement this finding's suggested fix"],
#  ['code-health:effort-medium', "Estimated effort to implement this finding's suggested fix"],
#  ['code-health:effort-high', "Estimated effort to implement this finding's suggested fix"]]
```

- [ ] **Step 4: Wire `harness-health/SKILL.md`**

Read the Step 7 bootstrap block before editing. Replace the full `node -e "..." | while ...; done` block with:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['harness-health', 'Filed by the harness-health engine - a plugin harness maintenance finding'],
#  ['harness-health:additive', 'Safe, mechanical patch - additive change with no removed behavior'],
#  ['harness-health:restructural', 'Structural change requiring human review before applying'],
#  ['harness-health:new-skill', 'Proposes a new skill candidate surfaced by harness-health']]
```

- [ ] **Step 5: Wire `tidy/SKILL.md`'s `parked` bootstrap sites**

Read the "Defer" and "Sync to GitHub" rows in the Action Vocabulary table before editing. In the "Defer" row, replace the phrase `bootstrap the \`parked\` label if missing (same check-then-create pattern as \`backlog\`)` with `bootstrap the \`parked\` label if missing (per _shared/label-bootstrap.md, LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a trigger condition']])`. In the "Sync to GitHub" row, wherever it says `bootstrap labels` (for the inbox-stage and parked-stage builds), replace with `bootstrap labels (per _shared/label-bootstrap.md; \`backlog\`: [['backlog', 'A captured backlog entry - product/technical/legal/infrastructure']], \`parked\`: [['parked', 'Deferred backlog entry, waiting on a trigger condition']], plus the relevant \`backlog:category-*\` pair)`.

- [ ] **Step 6: Wire `wrap-up/cleanup-procedures.md` Section E**

Read Section E step 7 before editing. Replace `restore \`parked\` — bootstrap the label if missing (same check-then-create pattern as \`backlog\`)` with `restore \`parked\` — bootstrap the label if missing (per _shared/label-bootstrap.md, LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a trigger condition']])`.

- [ ] **Step 7: Wire `flow/multispec-review-console.md`'s single remaining site**

Read the "Per-issue label cleanup" subsection created by Task 9 before editing. Replace `restore \`parked\` (bootstrap if missing, then` with `restore \`parked\` (bootstrap if missing per _shared/label-bootstrap.md, LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a trigger condition']], then`.

- [ ] **Step 8: Verify all edits**

Run: `grep -rc "_shared/label-bootstrap.md" skills/triage/SKILL.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/tidy/SKILL.md skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md`
Expected: every listed file shows a count ≥ 1.

Run: `grep -c "same check-then-create pattern as .backlog" skills/tidy/SKILL.md skills/wrap-up/cleanup-procedures.md`
Expected: `0` for both — confirms the old unreferenced phrasing is fully replaced.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all tests pass (markdown-only changes; confirms no incidental breakage of anything that might reference the old label-bootstrap text, e.g. a doc-hygiene test).

- [ ] **Step 10: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/_shared/label-bootstrap.md skills/triage/SKILL.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/tidy/SKILL.md skills/wrap-up/cleanup-procedures.md skills/flow/multispec-review-console.md
git commit -m "$(cat <<'EOF'
Extract the 4x-duplicated label bootstrap loop into _shared/label-bootstrap.md

triage/SKILL.md (x3), code-health/SKILL.md, and harness-health/SKILL.md
each embedded an identical copy of the check-then-create loop. tidy's
parked/backlog bootstrap sites, wrap-up's Section E, and
multispec-review-console.md's parked-restoration step never had a
real snippet to copy from at all — they now reference the same
canonical one and gain real description strings in the process.
EOF
)"
```

---

### Task 14: `harness-health.js` — try/catch around cache/cursor persistence

**Files:**
- Modify: `bin/harness-health.js`
- Test: `bin/lib/harness-health/tests/cli-validate-findings.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `cmdValidateFindings` no longer crashes the process on a `recordAudit`/`recordGapScan`/`recordRun` failure; `writeCache` stays unwrapped, matching `code-health.js`'s own choice to leave its main cache write unprotected while only guarding the run-log/cursor calls.

**Confirmed write path:** `bin/lib/harness-health/cache.js`'s `recordRun(root, runId, fingerprints)` calls `watchman-core/runs.js`'s `recordRun(runsDir, ...)` with `runsDir = <root>/.claude-tweaks/harness-health/runs`, which does `fs.mkdirSync(runsDir, {recursive: true})` then writes `<runsDir>/<runId>.json`. Pre-creating a regular *file* at that exact `runs` path makes `mkdirSync(..., {recursive: true})` throw (`ENOTDIR`/`EEXIST` depending on platform — either way, it throws), which is the failure this task needs to catch.

- [ ] **Step 1: Write the failing test**

Add to the end of `bin/lib/harness-health/tests/cli-validate-findings.test.js`:

```js
test('validate-findings: a recordRun failure is non-fatal — payloads still emit on stdout', () => {
  const root = tmp();
  const findingsFile = path.join(root, 'findings.json');
  fs.writeFileSync(findingsFile, JSON.stringify([validFinding()]));

  // Pre-create the runs directory's path as a regular file, so recordRun's own
  // fs.mkdirSync(runsDir, {recursive: true}) throws instead of succeeding.
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'harness-health'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'harness-health', 'runs'), 'blocks the runs directory');

  const result = runValidateFindings(root, findingsFile, ['--run-id', 'test-run-1']);
  assert.strictEqual(result.status, 0, `expected non-fatal exit, got stderr: ${result.stderr}`);
  const payloads = JSON.parse(result.stdout);
  assert.strictEqual(payloads.length, 1, 'payload must still emit despite the persistence failure');
  assert.ok(result.stderr.includes('non-fatal'), `expected a non-fatal warning in stderr, got: ${result.stderr}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/harness-health/tests/cli-validate-findings.test.js`
Expected: the new test FAILS — today's unwrapped `recordRun` call throws and crashes the process (`result.status !== 0`, no stdout payloads).

- [ ] **Step 3: Implement the try/catch**

In `bin/harness-health.js`, replace:

```js
  if (!args.dryRun) {
    writeCache(root, cache);
    if (args.target && args.kind) recordAudit(root, `${args.kind}:${args.target}`, {});
    if (args.gapScan) recordGapScan(root, {});
    recordRun(root, args.runId, [...seen]);
  }
```

with:

```js
  if (!args.dryRun) {
    writeCache(root, cache);
    // Cursor/audit-log persistence is a rebuildable optimization (GitHub issue state is the
    // source of truth), so a persistence failure must never block emitting the payloads —
    // mirrors the pattern already hardened in bin/code-health.js's own recordRun call.
    try {
      if (args.target && args.kind) recordAudit(root, `${args.kind}:${args.target}`, {});
      if (args.gapScan) recordGapScan(root, {});
      recordRun(root, args.runId, [...seen]);
    } catch (err) {
      process.stderr.write(
        `[harness-health] validate-findings: cursor/run-log persistence failed (non-fatal, payloads still emitted): ${err.message}\n`,
      );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/harness-health/tests/cli-validate-findings.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/harness-health.js bin/lib/harness-health/tests/cli-validate-findings.test.js
git commit -m "$(cat <<'EOF'
Harden harness-health.js's cursor/run-log persistence against transient fs failures

Mirrors bin/code-health.js's already-hardened recordRun call — a
persistence failure is non-fatal and payloads still emit, instead of
crashing the process and discarding an already-computed result.
EOF
)"
```

---

### Task 15: `backlog.js` — `classifyBacklogIssue` checks issue state + `backlog` label explicitly

**Files:**
- Modify: `bin/lib/issues/backlog.js`
- Test: `bin/lib/issues/tests/backlog.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `classifyBacklogIssue(issue)` gains a `state` parameter read from the issue object (already present in `gh issue list --json ...,state,...` output — the sole caller, `github-pr-scan.md`'s `repo-wide` scope item 7, already fetches `state` implicitly via `--json number,title,body,labels,milestone,updatedAt,url`... check whether `state` is actually in that field list before assuming it's free; add it to the `gh issue list` call in `github-pr-scan.md` if missing).

- [ ] **Step 1: Check whether `state` is already fetched**

Run: `grep -n "gh issue list --label backlog" skills/_shared/github-pr-scan.md`
Read the matched line's `--json` field list. If `state` is not present, this task also needs to add it there (see Step 5 below) — note this now before writing tests that assume its presence.

- [ ] **Step 2: Write the failing tests**

Add to the end of `bin/lib/issues/tests/backlog.test.js`:

```js
test('classifyBacklogIssue: a closed issue is never classified as inbox or parked stage — callers must filter it out, but the field says so explicitly', () => {
  const closedIssue = { ...OPEN_INBOX_ISSUE, state: 'closed' };
  assert.strictEqual(classifyBacklogIssue(closedIssue).state, 'closed');
});

test('classifyBacklogIssue: an issue without the backlog label still classifies but flags isBacklogLabeled: false', () => {
  const noBacklogLabel = { ...OPEN_INBOX_ISSUE, labels: [{ name: 'backlog:category-product' }] };
  assert.strictEqual(classifyBacklogIssue(noBacklogLabel).isBacklogLabeled, false);
});

test('classifyBacklogIssue: an issue with the backlog label flags isBacklogLabeled: true', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).isBacklogLabeled, true);
});

test('classifyBacklogIssue: state defaults to null when the field is absent (caller pre-gh-3 compatibility)', () => {
  const { state: _drop, ...withoutState } = OPEN_INBOX_ISSUE;
  assert.strictEqual(classifyBacklogIssue(withoutState).state, null);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: all 4 new tests FAIL (`classifyBacklogIssue`'s return object has no `state` or `isBacklogLabeled` fields today).

- [ ] **Step 4: Implement**

In `bin/lib/issues/backlog.js`, replace:

```js
// issue: { number, title, labels, body, milestone, updatedAt, url } — shaped like
// `gh issue list --json number,title,labels,body,milestone,updatedAt,url` output.
// Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
// milestoneDueOn, watchedPaths, updatedAt, url } — category/priority/milestone/
// milestoneDueOn/watchedPaths are null when absent.
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
    milestoneDueOn: milestone && milestone.dueOn ? milestone.dueOn : null,
    watchedPaths: extractWatchedPaths(body),
    updatedAt,
    url,
  };
}
```

with:

```js
// issue: { number, title, labels, body, milestone, updatedAt, url, state? } — shaped like
// `gh issue list --json number,title,labels,body,milestone,updatedAt,url,state` output.
// Returns { number, title, stage: 'inbox'|'parked', category, priority, milestone,
// milestoneDueOn, watchedPaths, updatedAt, url, state, isBacklogLabeled } —
// category/priority/milestone/milestoneDueOn/watchedPaths are null when absent; `state` is
// null when the caller didn't fetch it (pre-existing callers that omit the field from their
// own `--json` list still get a defined, non-throwing result). `isBacklogLabeled` lets a
// caller explicitly filter out an issue that reached this function without actually carrying
// the `backlog` label, instead of implicitly trusting that every caller pre-filters —
// previously this function assumed its sole caller always pre-filtered by `--label backlog`.
function classifyBacklogIssue({ number, title, labels, body, milestone, updatedAt, url, state }) {
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
    milestoneDueOn: milestone && milestone.dueOn ? milestone.dueOn : null,
    watchedPaths: extractWatchedPaths(body),
    updatedAt,
    url,
    state: state || null,
    isBacklogLabeled: names.includes('backlog'),
  };
}
```

- [ ] **Step 5: Add `state` to the `gh issue list` call if Step 1 found it missing**

If Step 1 found `state` absent from `github-pr-scan.md`'s `repo-wide` scope item 7 `gh issue list --label backlog ...` call, read that line and add `state` to its `--json` field list now. Also add one sentence directly after the existing `classifyBacklogIssue` invocation in that same file noting the new fields are available: `classifyBacklogIssue's result also carries state and isBacklogLabeled now — callers that want strict filtering can check both explicitly.` If `state` was already present, skip this step.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: all tests PASS (pre-existing + 4 new).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/lib/issues/backlog.js bin/lib/issues/tests/backlog.test.js skills/_shared/github-pr-scan.md
git commit -m "$(cat <<'EOF'
Harden classifyBacklogIssue against non-pre-filtered callers

Adds explicit state and isBacklogLabeled fields to the result instead
of relying on the sole caller to have pre-filtered by state/label —
previously safe only because that caller happened to pre-filter today.
EOF
)"
```

---

### Task 16: `claims.js` — test for malformed `ttlHours`

**Files:**
- Test: `bin/lib/issues/tests/claims.test.js`

No production code change — `isStale`'s existing guard (`typeof claim.ttlHours === 'number' ? claim.ttlHours : DEFAULT_TTL_HOURS`) already handles a non-number `ttlHours` correctly by falling back to the default; this task only closes the test-coverage gap the review flagged.

- [ ] **Step 1: Write the test**

Add to the end of `bin/lib/issues/tests/claims.test.js`:

```js
test('malformed (non-number, non-missing) ttlHours falls back to the 72h default', () => {
  const claimWithStringTtl = { runId: 'r1', claimedAt: new Date(T0).toISOString(), ttlHours: 'not-a-number' };
  assert.strictEqual(isStale(claimWithStringTtl, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claimWithStringTtl, T0 + 72 * H), true);

  const claimWithNullTtl = { runId: 'r1', claimedAt: new Date(T0).toISOString(), ttlHours: null };
  assert.strictEqual(isStale(claimWithNullTtl, T0 + 72 * H - 1), false);
  assert.strictEqual(isStale(claimWithNullTtl, T0 + 72 * H), true);
});
```

- [ ] **Step 2: Run the test**

Run: `node --test bin/lib/issues/tests/claims.test.js`
Expected: PASS immediately (this is a coverage-only addition — `isStale`'s existing `typeof` guard already produces the correct behavior; no implementation change needed).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/lib/issues/tests/claims.test.js
git commit -m "Add test coverage for isStale's malformed-ttlHours fallback branch (behavior already correct, coverage-only)"
```

---

### Task 17: `code-health/dedup.js` — test for `finding.fingerprint` fallback

**Files:**
- Test: `bin/lib/code-health/tests/dedup.test.js`

No production code change — `decide`'s existing `finding.fingerprint || finding.id` already handles both shapes correctly; this task only closes the test-coverage gap the review flagged.

- [ ] **Step 1: Write the test**

Add to the end of `bin/lib/code-health/tests/dedup.test.js`:

```js
test('decide uses finding.fingerprint over finding.id when both are present', () => {
  const finding = { id: 'wrong-key', fingerprint: 'recon-hhh', risk: 'high' };
  const index = { 'recon-hhh': { number: 11, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide(finding, index, {}), { action: 'skip', issue: 11 });
});

test('decide falls back to finding.id when finding.fingerprint is absent', () => {
  const finding = { id: 'recon-iii', risk: 'high' };
  const index = { 'recon-iii': { number: 12, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide(finding, index, {}), { action: 'skip', issue: 12 });
});
```

- [ ] **Step 2: Run the test**

Run: `node --test bin/lib/code-health/tests/dedup.test.js`
Expected: PASS immediately (coverage-only — `finding.fingerprint || finding.id` already handles both cases).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add bin/lib/code-health/tests/dedup.test.js
git commit -m "Add test coverage for decide's finding.fingerprint fallback branch (behavior already correct, coverage-only)"
```

---

### Task 18: `tidy/scan-procedures.md` Step 4.7 — backstop row for corrupted `claimedAt`

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

- [ ] **Step 1: Make the edit**

Read the Step 4.7 backstop table before editing. Replace:

```
| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Claim stale (`stale: true`) | Release (crashed or abandoned run) |
| Ref exists, `claimed: false, everReleased: true`, issue open | Release (orphaned ref — a prior release's comment posted but the ref-delete failed; safe to break, per `_shared/issue-claims.md`'s Failure posture table) |
| Ref exists, `claimed: false, everReleased: false`, issue open | Manual review (never break a claim you cannot read) |
| Claim live, issue open | Keep |
```

with:

```
| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Claim stale (`stale: true`) | Release (crashed or abandoned run) |
| Ref exists, `claimed: false, everReleased: true`, issue open | Release (orphaned ref — a prior release's comment posted but the ref-delete failed; safe to break, per `_shared/issue-claims.md`'s Failure posture table) |
| Ref exists, `claimed: false, everReleased: false`, issue open | Manual review (never break a claim you cannot read) |
| Ref exists, `claimed: true, stale: false`, but `claim.claimedAt` fails to parse as a date | Manual review (per `bin/lib/issues/claims.js`'s `isStale` fail-closed contract — a corrupted-but-JSON-valid claim is never automatically stale; flag it explicitly rather than keeping it silently forever) |
| Claim live, issue open | Keep |
```

- [ ] **Step 2: Verify the edit**

Run: `grep -n "fails to parse as a date" skills/tidy/scan-procedures.md`
Expected: one match, the new backstop row.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/tidy/scan-procedures.md
git commit -m "$(cat <<'EOF'
Add a Step 4.7 backstop row for a corrupted-but-JSON-valid claimedAt

claims.js:70's isStale contract already promises "/tidy surfaces it"
for this case, but the Step 4.7 table had no matching row — such a
claim silently folded into "claim live, issue open -> keep" forever.
EOF
)"
```

---

## Plan Self-Review Notes

**Spec coverage:** All 18 items from `docs/superpowers/specs/2026-07-12-github-issues-consistency-pass-design.md`'s Groups A-F map onto Tasks 1-3 (Group A), 4-6 (Group B), 7-9 (Group C), 10-13 (Group D), 14-15 (Group E behavior), 16-17 (Group E tests), 18 (Group F). Every design bullet has a task.

**Real-world verification during planning:** while researching exact current file content, found that fixing Group A's `reopen` decision correctly requires updating `harness-health/SKILL.md` and `journey-health/SKILL.md`'s FILE-step prose (Task 3, Steps 6-7) — the design doc's Group A bullets only mentioned the `bin/*.js` CLI wiring, but without the matching skill-prose update, a reopened finding would get `gh issue create`d as a duplicate instead of `gh issue reopen`d. This is folded into Task 3 rather than treated as scope creep, since it's necessary for the design's own stated goal ("regressed findings get reopened, not silently dropped") to actually hold end-to-end.

**Placeholder scan:** an earlier draft of Task 14 Step 1 deferred the exact fs-failure-forcing mechanism to implementation time ("the exact way ... depends on ..."). Fixed by reading `bin/lib/harness-health/cache.js` and `bin/lib/watchman-core/runs.js` directly during planning and writing the concrete test against the confirmed write path (`<root>/.claude-tweaks/harness-health/runs`) — no deferred steps remain in the plan.

**Type consistency:** `decision.issue` (Task 2's `decide()` return, Task 3's cache write), `cache[finding.id].issue` (Task 3), and the `<issue_number>` read back from that cache field in the two SKILL.md prose updates (Task 3, Steps 6-7) all refer to the same GitHub issue number end-to-end. `extractRiskEffort`/`recommendTier`'s signatures (Task 1) are unchanged from their pre-existing call site in `triage/SKILL.md:65-66` — verified no other file needs updating for that call.
