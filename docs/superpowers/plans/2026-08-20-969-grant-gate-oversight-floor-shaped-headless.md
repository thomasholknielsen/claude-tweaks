# Grant gate: oversight-floor rule for shaped:headless records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the headless grant gate deny auto-granting a `shaped:headless` record whose risk or size is `medium`+, surfacing the denial through `/backlog attention` instead of blocking today's human-shaped grant path.

**Architecture:** Expand-only addition to `grant-gate.js`'s existing gate 5 — one more `exceedsOversightFloor` call with fixed `medium` floors, gated on `facets.shapedHeadless`, after the existing configured-floor check so the existing `'oversight-floor'` key keeps winning when both would deny. Three documentation updates (gate-chain description, human-owed surface, autonomy-check judgment) follow the code change.

**Tech Stack:** Node.js (`plugin/bin/lib/issues/`), `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044958-spec-967-968-969-970/spec-969/work/969-spec.md`

## Global Constraints

- Restrictive-only invariant: the new branch may only ever narrow auto-granting, never widen it. Any path where it could short-circuit a later deny into a pass is a bug.
- No change to interactive/human grants — a human granting a `shaped:headless` record is always allowed; the label is provenance, not a block.
- No new policy levers — `fleet-daily-grant-cap`, autonomy tiers, blast-radius caps, and the configured `riskFloor`/`sizeFloor` are unchanged; the `medium` cap for provenance-carrying records is fixed in code, not configurable in v1.
- No `merge-check`/`auto:merge` changes — this gates the grant, not the merge.
- No change to `grant-mode.md`'s silent-skip convention — no comments posted on denied records from the grant unit; the log stays `decisions.md` only, no per-verdict branching.
- Deny reasons in `grant-gate.js` are free text by the file's own convention — no closed-vocabulary lookup applies to gate deny strings.
- Every pre-existing `grant-gate.test.js` case must pass unmodified.
- `npm test` passes; the new tests must fail when the gate-5 change is reverted (verify once during development).

---

### Task 1: Grant gate — fixed medium floor for shaped:headless records

**Files:**
- Modify: `plugin/bin/lib/issues/grant-gate.js:118-121` (gate 5, immediately after the existing `'oversight-floor'` deny)
- Test: `tests/bin-lib/issues/grant-gate.test.js` (append after the existing oversight-floor tests, around line 207-208)

**Interfaces:**
- Consumes: `exceedsOversightFloor(facets, { riskFloor, sizeFloor })` from `plugin/bin/lib/issues/oversight-floor.js` (already imported in `grant-gate.js`; returns `{ exceeds: boolean, reason: 'risk' | 'size' | 'unscored' | null }`). `facets.shapedHeadless` (boolean) from `parseRecordFacets` (#968, already shipped on this branch).
- Produces: a new possible `failedKey: 'shaped-headless-floor'` on `evaluateGrantGate`'s return value. Result shape otherwise unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/issues/grant-gate.test.js`, immediately after the existing test ending at line 218 (`'#366: riskFloor/sizeFloor default to 'high' when policy omits them (medium tier still grants)'`):

```javascript
test('#969 AC1: shaped:headless + risk:medium denies with shaped-headless-floor', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:medium', 'size:low', 'shaped:headless'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'shaped-headless-floor');
});

test('#969 AC1: shaped:headless + size:medium denies with shaped-headless-floor', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:medium', 'shaped:headless'] }),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'shaped-headless-floor');
});

test('#969 AC2: shaped:headless + risk:low + size:low is not denied by this rule (later gates still apply)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:low', 'size:low', 'shaped:headless'] }),
    policy: basePolicy(),
    trustVerdicts: cleanVerdict,
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
  assert.equal(result.failedKey, null);
});

test('#969 AC3: no shaped:headless, same facets as the medium-risk case above, still grants (human-shaped path byte-identical)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:medium', 'size:low'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, true);
  assert.equal(result.failedKey, null);
});

test('#969 AC4: shaped:headless + risk:high denies with oversight-floor, not shaped-headless-floor (existing key wins deny-fast)', () => {
  const result = evaluateGrantGate({
    record: baseRecord({ labels: ['by:code-health', 'ready', 'risk:high', 'size:low', 'shaped:headless'] }),
    policy: basePolicy(),
    trustVerdicts: new Map([['producer:code-health|elevated', { verdict: 'clean', kind: 'producer' }]]),
    grantCheck: clearGrantCheck,
  });
  assert.equal(result.grant, false);
  assert.equal(result.failedKey, 'oversight-floor');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/grant-gate.test.js`
Expected: the 5 new tests FAIL (`shaped-headless-floor` never returned; the AC1/AC2 cases currently grant or deny via the wrong key since `facets.shapedHeadless` is not yet consulted).

- [ ] **Step 3: Implement the gate-5 branch**

In `plugin/bin/lib/issues/grant-gate.js`, immediately after the existing block (current lines 118-121):

```javascript
  const floorResult = exceedsOversightFloor(facets, { riskFloor: pol.riskFloor, sizeFloor: pol.sizeFloor });
  if (floorResult.exceeds) {
    return deny('oversight-floor', `record exceeds the oversight floor (reason: ${floorResult.reason}) — a human review is required`, { classKey, verdict });
  }
```

insert:

```javascript
  // Provenance-aware floor (#969): a record no human reviewed (shaped:headless,
  // #968) is additionally evaluated against a fixed medium floor on both axes —
  // stricter than the configured floor above, never looser. This branch may only
  // ever narrow auto-granting, never widen it: it runs after the configured-floor
  // deny (so that key keeps winning when both would fire, #969 AC4) and never
  // short-circuits a later deny into a pass. Human-shaped records (no
  // shapedHeadless facet) are untouched by this branch.
  if (facets.shapedHeadless === true) {
    const provenanceFloor = exceedsOversightFloor(facets, { riskFloor: 'medium', sizeFloor: 'medium' });
    if (provenanceFloor.exceeds) {
      return deny('shaped-headless-floor', `record was shaped headlessly (no human review) and exceeds the fixed medium provenance floor (reason: ${provenanceFloor.reason}) — run /claude-tweaks:backlog refine to grant it`, { classKey, verdict });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/grant-gate.test.js`
Expected: PASS, all tests including the 5 new ones and every pre-existing case.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures (2× CHANGELOG version-coverage, 1× manifesto/multi-spec.md byte-budget) — no new failures.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/grant-gate.js tests/bin-lib/issues/grant-gate.test.js
git commit -m "Grant gate: deny shaped:headless records above a fixed medium oversight floor (#969)"
```

---

### Task 2: Document the new deny key in grant-mode.md's gate-chain description

**Files:**
- Modify: `plugin/skills/backlog/grant-mode.md:31`

**Interfaces:**
- Consumes: Task 1's `'shaped-headless-floor'` deny key (documented, not re-implemented — this file has no executable gate logic of its own; `evaluateGrantGate` is invoked via `node -e` at Step 2 of this same file).
- Produces: no new interface — prose only.

- [ ] **Step 1: Add the sentence**

In `plugin/skills/backlog/grant-mode.md`, line 31 currently reads:

```
`RISK_FLOOR`/`SIZE_FLOOR` are whole-run values, resolved once here — like `CEILING`/`OPT_IN`, they feed both Phase A's and Phase C's `policy` object below (gate 5's oversight floor is not per-record configuration).
```

Append one sentence to the same paragraph:

```
`RISK_FLOOR`/`SIZE_FLOOR` are whole-run values, resolved once here — like `CEILING`/`OPT_IN`, they feed both Phase A's and Phase C's `policy` object below (gate 5's oversight floor is not per-record configuration). A `shaped:headless` record (#968 — no human reviewed the spec body) is additionally checked against a fixed `medium` floor on both axes, denying with `failedKey: 'shaped-headless-floor'` when it exceeds that floor — this second check is not configurable and is not part of `RISK_FLOOR`/`SIZE_FLOOR` above; it runs only after the configured floor already cleared, so the existing `'oversight-floor'` key keeps winning when both would deny.
```

- [ ] **Step 2: Verify no other file needs the same edit**

Run: `grep -n "oversight-floor" plugin/skills/backlog/grant-mode.md plugin/skills/_shared/*.md`
Expected: only this file's gate-chain description and its own Step 2/4 mentions of `failedKey` generically (no other file enumerates individual `failedKey` values — the skip-logging convention at Step 4 already treats `failedKey` opaquely, so no other prose needs the new key name).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures — a prose-only change touches no test.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/backlog/grant-mode.md
git commit -m "grant-mode.md: document the shaped-headless-floor deny key (#969)"
```

---

### Task 3: attention-mode.md — new classification for ungr­anted shaped:headless records

**Files:**
- Modify: `plugin/skills/backlog/attention-mode.md` (Step 1 Fetch, Step 2 Merge and dedupe, Step 4 Render)

**Interfaces:**
- Consumes: nothing from Task 1/2 directly (this is a read-only discovery surface, not a caller of `evaluateGrantGate`) — it independently queries GitHub for the label combination `ready` + `shaped:headless` minus `auto:build`.
- Produces: a third row type in the rendered table, following this file's existing two-type merge/render pattern.

- [ ] **Step 1: Extend Step 1's Fetch**

In `plugin/skills/backlog/attention-mode.md`, after the existing two `gh issue list` calls (current lines 16-17), add a third:

```bash
gh issue list --state open --label needs:definition --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-needs-definition.json
gh issue list --state open --label solution:unjustified --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-solution-unjustified.json
gh issue list --state open --label ready --label shaped:headless --json number,title,createdAt,labels --limit 200 > /tmp/backlog-attention-shaped-headless.json
```

Note in the surrounding prose (same paragraph as the existing "may be more, here's the count" note): the `shaped-headless` fetch additionally needs `auto:build` excluded, done in Step 2's merge script (below) rather than via a `gh` query flag — `gh issue list --label` only ANDs, it has no exclusion flag, matching this file's own established idiom of doing set logic in the `node -e` merge step rather than the `gh` query.

- [ ] **Step 2: Extend Step 2's merge/dedupe script**

Replace the existing `node -e` script (current lines 34-45) with a version that also folds in the third fetch, filtering out any record that already carries `auto:build`:

```javascript
node -e "
  const needsDefinition = require('/tmp/backlog-attention-needs-definition.json');
  const solutionUnjustified = require('/tmp/backlog-attention-solution-unjustified.json');
  const shapedHeadless = require('/tmp/backlog-attention-shaped-headless.json')
    .filter((r) => !r.labels.some((l) => l.name === 'auto:build'));
  const byNumber = new Map();
  for (const r of needsDefinition) byNumber.set(r.number, { ...r, types: ['needs:definition'] });
  for (const r of solutionUnjustified) {
    const existing = byNumber.get(r.number);
    if (existing) existing.types.push('solution:unjustified');
    else byNumber.set(r.number, { ...r, types: ['solution:unjustified'] });
  }
  for (const r of shapedHeadless) {
    const existing = byNumber.get(r.number);
    if (existing) existing.types.push('shaped:headless (no grant)');
    else byNumber.set(r.number, { ...r, types: ['shaped:headless (no grant)'] });
  }
  console.log(JSON.stringify([...byNumber.values()]));
" > /tmp/backlog-attention-merged.json
```

Add one sentence after the existing dedupe-rationale paragraph (after "...semicolon-separated)."): a record can in principle carry all three — e.g. `needs:definition` + `shaped:headless` (a headlessly-shaped record whose own guard routed it to `needs:definition` — #968's Framing Guard) — the same one-row-per-number, concatenated-action convention applies; `types` is always rendered in fetch order (`needs:definition`, `solution:unjustified`, `shaped:headless (no grant)`) for a deterministic Type column.

- [ ] **Step 3: Extend Step 3's Rank script's type-agnostic behavior**

No change needed — Step 3's ranking script (current lines 56-69) operates on `records` generically via `priority`/`createdAt`, independent of `types` content. Confirm this by reading the script: it does not reference `.types` anywhere, so the new third type flows through unchanged.

- [ ] **Step 4: Extend Step 4's Render**

In the example table (current lines 79-83), add a fourth example row and update the recommended-action prose paragraph (current lines 88-94):

```markdown
| Record | Type | Filed | Recommended action |
|--------|------|-------|---------------------|
| #{n} | needs:definition | {createdAt, relative} | run /claude-tweaks:specify #{n} to route through brainstorming |
| #{n} | solution:unjustified | {createdAt, relative} | run /claude-tweaks:backlog refine #{n} to grant despite the flag (accept risk), or add evidence to Current State and re-run /claude-tweaks:specify #{n} first |
| #{n} | shaped:headless (no grant) | {createdAt, relative} | run /claude-tweaks:backlog refine #{n} to grant (spec was headlessly shaped — no human has reviewed it) |
| #{n} | needs:definition + solution:unjustified | {createdAt, relative} | run /claude-tweaks:specify #{n} to route through brainstorming; run /claude-tweaks:backlog refine #{n} to grant despite the flag (accept risk), or add evidence to Current State and re-run /claude-tweaks:specify #{n} first |
```

Add one sentence to the prose immediately after the existing `solution:unjustified` recommendation sentence: `shaped:headless (no grant)` rows recommend `run /claude-tweaks:backlog refine #{n} to grant (spec was headlessly shaped — no human has reviewed it)` — naming `/backlog refine` explicitly, same as the `solution:unjustified` row, since this mode itself performs no grant.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures — a prose-only change touches no test.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/backlog/attention-mode.md
git commit -m "attention-mode.md: add shaped:headless (no grant) classification row (#969)"
```

---

### Task 4: grant-check.md — provenance-aware judgment paragraph

**Files:**
- Modify: `plugin/skills/assess-agent-autonomy/grant-check.md` (Step 2 Judge, after the existing bulleted list)

**Interfaces:**
- Consumes: nothing programmatic — this is LLM-judgment prose, informing `RECOMMEND_BUILD`/`RECOMMEND_MERGE` output, not a hard gate (Task 1's gate-5 branch is the hard rule; this is advisory judgment upstream of it, per the spec's Deliverable text: "without duplicating the gate's hard rule").
- Produces: no new interface — prose only.

- [ ] **Step 1: Add the paragraph**

In `plugin/skills/assess-agent-autonomy/grant-check.md`, in Step 2's bulleted list (after the last bullet, current line 69, before the blank line preceding "## Step 3: Render"), add:

```markdown
- Does the record carry `shaped:headless` (#968 — no human reviewed the spec body, only `/specify`'s headless `next` unit)? Content-derived confidence is inherently weaker here than on a human-shaped record, since nobody has validated the spec text itself against the actual codebase. Weigh ambiguity toward `RECOMMEND_BUILD: false` in this case — this is a judgment nudge, not a hard rule: `evaluateGrantGate`'s own gate 5 (`grant-gate.js`) already hard-denies a `shaped:headless` record whose risk or size is `medium`+ regardless of what this step recommends, so this paragraph only affects the narrower population that clears that gate (risk and size both `low`) but still carries some content-level ambiguity this step can weigh.
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS except the 3 known pre-existing baseline failures — a prose-only change touches no test.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/assess-agent-autonomy/grant-check.md
git commit -m "grant-check.md: weigh shaped:headless provenance toward conservative judgment (#969)"
```
