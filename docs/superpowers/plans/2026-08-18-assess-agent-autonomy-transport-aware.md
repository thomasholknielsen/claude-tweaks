# Assess-Agent-Autonomy Transport-Aware Gathers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `grant-check`/`failure-check`'s Step 1 gathers transport-aware, so a `gh`-absent or failed-fetch run renders its conservative verdict with a RATIONALE naming the gather failure — never a rationale that reads as a content judgment.

**Architecture:** `SKILL.md`'s Error Handling section splits into two named cases (could-not-gather vs. gathered-but-inconclusive). `grant-check.md` and `failure-check.md`'s Step 1 each gain an MCP-transport alternative (citing the already-confirmed `issue_read` mappings in `_shared/github-write-transport.md`, the same citation style `dispatch/settle-and-merge.md` step 4 already uses) and a could-not-gather short-circuit that renders Step 3 directly, mirroring `merge-check.md` Step 1's existing resolution-failure pattern.

**Tech Stack:** Markdown skill prose (no runtime code changes); `node --test` prose-conformance pin test.

**Spec:** `.claude-tweaks/pipelines/2026-08-18T151433-spec-888-889/spec-889/work/889-spec.md`

## Global Constraints

- Never resolve ambiguity toward more autonomy or less ceremony (`SKILL.md`'s existing Error Handling framing — unchanged, only split into two cases).
- The MCP alternative must cite the exact mapping name already confirmed in `_shared/github-write-transport.md` (`issue_read`, get mode for a single issue / get_comments mode for comments) — do not invent a new mapping name.
- `merge-check.md` Step 1's existing resolution-failure pattern (render `VERDICT: needs-human` / `RATIONALE: {name the specific resolution failure}` directly, skip the rest of the mode) is the pattern being generalized — cite it, don't restate its own text.

---

### Task 1: SKILL.md — split Error Handling into could-not-gather vs. gathered-but-inconclusive

**Files:**
- Modify: `plugin/skills/assess-agent-autonomy/SKILL.md:73-81` (Error Handling section), `plugin/skills/assess-agent-autonomy/SKILL.md:96-105` (Anti-Patterns table)
- Test: `tests/assess-agent-autonomy-transport-pin.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: the two-case Error Handling section text that Task 2's `grant-check.md`/`failure-check.md` edits reference by name (`could-not-gather` / `gathered-but-inconclusive`) — Task 2's implementer must use these exact two words, not synonyms, since Task 1's pin test greps for them literally.

- [ ] **Step 1: Write the failing pin test**

Create `tests/assess-agent-autonomy-transport-pin.test.js`:

```js
'use strict';

// Conformance pin (#889): SKILL.md's Error Handling section must distinguish
// could-not-gather (transport/tooling failure) from gathered-but-inconclusive
// (a genuine content-ambiguity read) -- the two render different RATIONALE
// shapes. If SKILL.md's prose ever collapses this back into one case, this
// pin fails loudly instead of letting the distinction silently erode.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/SKILL.md');

test('SKILL.md Error Handling names both could-not-gather and gathered-but-inconclusive cases', () => {
  const source = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(source.includes('could-not-gather'), 'expected the literal case name "could-not-gather" in SKILL.md');
  assert.ok(
    source.includes('gathered-but-inconclusive'),
    'expected the literal case name "gathered-but-inconclusive" in SKILL.md'
  );
});

test('SKILL.md Anti-Patterns table pins the content-judgment-rationale rule', () => {
  const source = fs.readFileSync(SKILL_MD, 'utf8');
  assert.ok(
    source.includes('content-judgment'),
    'expected an Anti-Patterns row naming the content-judgment rationale hazard in SKILL.md'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/assess-agent-autonomy-transport-pin.test.js`
Expected: FAIL — `SKILL.md` does not yet contain `could-not-gather`, `gathered-but-inconclusive`, or `content-judgment`.

- [ ] **Step 3: Rewrite SKILL.md's Error Handling section**

Replace the existing `## Error Handling` section (currently `SKILL.md:73-81`) with:

```markdown
## Error Handling

Two distinct failure shapes render different rationale text — never collapse them:

**could-not-gather** — Step 1's gather itself failed: `gh` absent with no MCP transport
available either, a fetch error, a timeout, an unreachable repo. The mode still renders its
usual conservative outcome (per mode, below), but the RATIONALE names the specific gather
failure verbatim — e.g. "gh unavailable, no MCP transport resolved — could not fetch record
body; conservative default, not a content judgment." This never reads as a judgment about the
record/diff/failure content, because none was read. `merge-check.md` Step 1 already renders
this shape for its own resolution failures (`VERDICT: needs-human` / a RATIONALE naming the
specific resolution failure) — the pattern here generalizes that same shape to `grant-check`
and `failure-check`.

**gathered-but-inconclusive** — the gather succeeded (the body/labels/comments were fetched),
but the content itself doesn't clearly support a confident verdict (malformed input, an
inconclusive read). This is today's existing behavior, unchanged.

Both cases default to the same conservative outcome per mode: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`; `ceremony-check` → `CEREMONY: standard`. Never
resolve ambiguity toward more autonomy or less ceremony — a missed auto-merge or a fuller
wrap-up pass costs a human a click or a few extra minutes; a wrongly-granted shortcut could ship
something bad or under-reflect on real complexity. What differs between the two cases is only
the RATIONALE text: could-not-gather names the tooling/transport failure; gathered-but-inconclusive
explains the content ambiguity.
```

- [ ] **Step 4: Add the Anti-Patterns row**

In the existing Anti-Patterns table (currently `SKILL.md:96-105`), add one row after the existing three:

```markdown
| Rendering a conservative verdict with a content-judgment-style rationale when the gather itself failed | Misreports a tooling/transport gap as if the record/diff/failure content had been weighed and found wanting — indistinguishable from principled caution to anyone reading the log. Name the gather failure verbatim instead (could-not-gather, above). |
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/assess-agent-autonomy-transport-pin.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/assess-agent-autonomy/SKILL.md tests/assess-agent-autonomy-transport-pin.test.js
git commit -m "Split assess-agent-autonomy Error Handling: could-not-gather vs gathered-but-inconclusive"
```

---

### Task 2: grant-check.md and failure-check.md — transport-aware Step 1 gathers

**Files:**
- Modify: `plugin/skills/assess-agent-autonomy/grant-check.md:8-22` (Step 1), `plugin/skills/assess-agent-autonomy/failure-check.md:6-19` (Step 1)
- Test: `tests/assess-agent-autonomy-transport-pin.test.js` (extend from Task 1)

**Interfaces:**
- Consumes: the two case names `could-not-gather` / `gathered-but-inconclusive` from Task 1's `SKILL.md` (must match verbatim).
- Produces: nothing further consumed by later tasks (last task).

- [ ] **Step 1: Write the failing pin test additions**

Append to `tests/assess-agent-autonomy-transport-pin.test.js` (same file Task 1 created):

```js
const GRANT_CHECK_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/grant-check.md');
const FAILURE_CHECK_MD = path.join(__dirname, '..', 'plugin/skills/assess-agent-autonomy/failure-check.md');

test('grant-check.md Step 1 references the issue_read MCP mapping and the could-not-gather case', () => {
  const source = fs.readFileSync(GRANT_CHECK_MD, 'utf8');
  assert.ok(source.includes('issue_read'), 'expected grant-check.md to cite the issue_read MCP mapping');
  assert.ok(
    source.includes('could-not-gather'),
    'expected grant-check.md to reference the could-not-gather case by name'
  );
});

test('failure-check.md Step 1 references the issue_read MCP mapping and the could-not-gather case', () => {
  const source = fs.readFileSync(FAILURE_CHECK_MD, 'utf8');
  assert.ok(source.includes('issue_read'), 'expected failure-check.md to cite the issue_read MCP mapping');
  assert.ok(
    source.includes('could-not-gather'),
    'expected failure-check.md to reference the could-not-gather case by name'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/assess-agent-autonomy-transport-pin.test.js`
Expected: FAIL — the two new tests fail (`grant-check.md`/`failure-check.md` don't yet cite `issue_read` or `could-not-gather`); the two Task 1 tests still pass.

- [ ] **Step 3: Update grant-check.md Step 1**

Replace the existing `## Step 1: Gather` section (currently `grant-check.md:8-22`) with:

```markdown
## Step 1: Gather

```bash
gh issue view "$N" --json body,labels -q '{body: .body, labels: [.labels[].name]}' > /tmp/assess-grant-${N}.json
```

**MCP path** (`gh` unavailable, an MCP transport resolved per the caller's own transport
contract — e.g. `dispatch/mcp-transport.md`): use the confirmed `issue_read` (get mode) mapping
from `_shared/github-write-transport.md` in place of the `gh issue view` call above — the rest
of this step consumes the same `{body, labels}` shape regardless of transport.

**Neither available** (no `gh`, no MCP transport resolved): stop here — this is the
`could-not-gather` case (`SKILL.md`'s Error Handling). Render Step 3 directly:
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false` / `RATIONALE: {name the specific gather
failure verbatim, e.g. "gh unavailable, no MCP transport resolved — could not fetch record
body"}`, and skip the rest of this mode's procedure — the same short-circuit shape
`merge-check.md` Step 1 already uses for its own resolution failures.

Read the record's full body (Current State / Deliverables / Acceptance Criteria) from the fetched
JSON. Extract the current `risk:*`/`size:*`/`ceremony:*` labels, if present:

```bash
node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
  const d=require('/tmp/assess-grant-${N}.json');
  const {risk, size, ceremony}=parseRecordFacets(d.labels);
  console.log(JSON.stringify({risk, size, ceremony}))"
```
```

- [ ] **Step 4: Update failure-check.md Step 1**

Replace the existing `## Step 1: Gather` section (currently `failure-check.md:6-19`) with:

```markdown
## Step 1: Gather

```bash
gh api "repos/{owner}/{repo}/issues/${N}/comments?per_page=100" > /tmp/assess-failure-comments-${N}.json
node -e "
  const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
  const comments = require('/tmp/assess-failure-comments-${N}.json');
  console.log(JSON.stringify({ priorAttempts: countFailedAttempts(comments) }));
"
```

**MCP path** (`gh` unavailable, an MCP transport resolved per the caller's own transport
contract — e.g. `dispatch/mcp-transport.md`): use the confirmed `issue_read` (get_comments mode)
mapping from `_shared/github-write-transport.md` in place of the `gh api` call above — the same
mapping `dispatch/settle-and-merge.md` step 4 already cites for its own comment fetch. The rest
of this step consumes the same comment-body-string shape regardless of transport.

**Neither available** (no `gh`, no MCP transport resolved): stop here — this is the
`could-not-gather` case (`SKILL.md`'s Error Handling). Render Step 3 directly:
`CLASSIFICATION: correctness` / `NOTIFY_NOW: false` / `RATIONALE: {name the specific gather
failure verbatim, e.g. "gh unavailable, no MCP transport resolved — could not fetch prior
attempt comments"}`, and skip the rest of this mode's procedure.

Read the actual failure output from the gate that failed (test output, review findings, error
logs) — already in the calling agent's context from the run that just failed.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/assess-agent-autonomy-transport-pin.test.js`
Expected: PASS — all 5 tests (2 from Task 1, 2 new, plus any others) pass.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/assess-agent-autonomy/grant-check.md plugin/skills/assess-agent-autonomy/failure-check.md tests/assess-agent-autonomy-transport-pin.test.js
git commit -m "Make grant-check/failure-check Step 1 gathers transport-aware (#889)"
```
