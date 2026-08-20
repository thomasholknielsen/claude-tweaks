# review-auto-apply-ceiling prose-exempt tier bump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `review-auto-apply-prose-exempt` policy dimension so a review finding whose entire fix touches only prose paths (`skills/**/*.md`, `docs/**/*.md`, `tests/**`) auto-applies one severity tier above the resolved `review-auto-apply-ceiling` (capped at `medium`), replacing the ad hoc carve-out every prior run re-invented for this exact case.

**Architecture:** One new boolean lever registered in the existing declarative `POLICY_KEYS` schema (`plugin/bin/lib/policy-schema.js`) — the generic `resolvePolicyKeys` precedence resolver (run-config > policy.yml > default) already covers it once registered, no new resolution code needed. `plugin/skills/review/step3-routing.md` (a prose skill file followed live by the reviewing agent, not executable code) gets a new resolution + bump-lookup rule and a distinguishing decision-log format. `plugin/bin/log-decision.js`'s existing free-text `--lever` flag already renders the required `[lever: ...; prose-exempt bump applied]` format with no code change.

**Tech Stack:** Node.js (`node --test`), plain-object policy schema, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T141304-record-660/work/660-spec.md` (materialized from GitHub issue #660)

## Global Constraints

- The bump never lets a `none`-ceiling run auto-apply above `low`, and never lets any ceiling reach `high`/`critical` via the bump — capped at `medium` (spec Gotchas).
- The exemption requires the finding's *entire* fix to stay within the exempt glob set — a fix spanning one exempt and one non-exempt path gets no bump (spec AC).
- `review-auto-apply-prose-exempt: off` must restore today's plain-ceiling behavior with no bump (spec AC).
- Every summary string added to `POLICY_KEYS` must be ≤140 chars and must not contain the key name verbatim (`tests/policy-schema-metadata.test.js`).

---

### Task 1: Register the `review-auto-apply-prose-exempt` policy key

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:83` (insert new `POLICY_KEYS` row immediately after the `review-auto-apply-ceiling` row)
- Modify: `plugin/skills/_shared/policy-schema.md:180` (insert new table row immediately after the `review-auto-apply-ceiling` row, same "Auto-mode levers" table)
- Test: `tests/resolve-policy-lib.test.js` (append new tests near the existing "boolean coercion" tests, ~line 153)

**Interfaces:**
- Consumes: `resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw })` — existing exported function, unchanged signature, from `plugin/bin/lib/policy-schema.js`. No new code path — registering the key in `POLICY_KEYS` is sufficient for this generic resolver, `bin/resolve-policy.js`'s CLI, and `bin/lib/policy-schema.js`'s own `POLICY_KEYS`-driven pin tests (`tests/policy-schema-metadata.test.js`, `tests/policy-key-naming.test.js`) to all pick it up automatically.
- Produces: policy key `review-auto-apply-prose-exempt` (type `boolean`, default `true`), resolvable via `resolvePolicyKeys(['review-auto-apply-prose-exempt'], {...})` and via `node bin/resolve-policy.js review-auto-apply-prose-exempt` / `--values review-auto-apply-prose-exempt`. Consumed by Task 2's `step3-routing.md` prose.

- [ ] **Step 1: Write the failing tests**

Append to `tests/resolve-policy-lib.test.js`, immediately after the two existing "boolean coercion" tests (after the test ending at line ~153):

```javascript
test('review-auto-apply-prose-exempt defaults to true (source: default) when unset', () => {
  const result = resolvePolicyKeys(['review-auto-apply-prose-exempt'], { policyRaw: null, runConfigRaw: null });
  assert.deepStrictEqual(result['review-auto-apply-prose-exempt'], { value: true, source: 'default' });
});

test('review-auto-apply-prose-exempt: off in policy.yml resolves to native boolean false', () => {
  const result = resolvePolicyKeys(['review-auto-apply-prose-exempt'], { policyRaw: 'review-auto-apply-prose-exempt: off\n' });
  assert.deepStrictEqual(result['review-auto-apply-prose-exempt'], { value: false, source: 'policy' });
});

test('review-auto-apply-prose-exempt: run-config (config.yml) wins over policy.yml, same precedence as review-auto-apply-ceiling', () => {
  const result = resolvePolicyKeys(['review-auto-apply-prose-exempt'], {
    policyRaw: 'review-auto-apply-prose-exempt: off\n',
    runConfigRaw: 'review-auto-apply-prose-exempt: on\n',
  });
  assert.deepStrictEqual(result['review-auto-apply-prose-exempt'], { value: true, source: 'run-config' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: FAIL — all three new tests fail with `result['review-auto-apply-prose-exempt']` deep-equal to `{ error: 'unknown-key' }` (key not yet registered in `POLICY_KEYS`).

- [ ] **Step 3: Register the key in `POLICY_KEYS`**

In `plugin/bin/lib/policy-schema.js`, immediately after line 83 (the `review-auto-apply-ceiling` row), insert:

```javascript
  { key: 'review-auto-apply-prose-exempt', type: 'boolean', default: true, summary: "Lets a prose-only fix auto-apply one severity tier above the ceiling instead of the plain ceiling — see step3-routing.md.", category: 'pipeline-behavior', tier: 'advanced' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Add the doc row to `policy-schema.md` and verify the metadata pin tests**

In `plugin/skills/_shared/policy-schema.md`, immediately after line 180 (the `review-auto-apply-ceiling` row in the "Auto-mode levers" table), insert:

```markdown
| `review-auto-apply-prose-exempt` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `on` | When `on`, a finding whose fix touches only `skills/**/*.md`/`docs/**/*.md`/`tests/**` auto-applies one severity tier above the resolved `review-auto-apply-ceiling`, capped at `medium` — see `skills/review/step3-routing.md` |
```

Run: `node --test tests/policy-schema-metadata.test.js tests/policy-key-naming.test.js`
Expected: PASS — the new row's summary (≤140 chars, doesn't contain the key verbatim), category, and tier all satisfy the metadata pin, the doc-row-presence pin finds `| \`review-auto-apply-prose-exempt\` |` in the md, and the 40 KB ceiling still holds (current `policy-schema.md` is ~31.2 KB, one row adds well under 1 KB).

- [ ] **Step 6: Run the full existing policy-schema suite to confirm no regression**

Run: `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js tests/policy-key-naming.test.js tests/resolve-policy-lib.test.js tests/resolve-policy-cli.test.js tests/policy-deprecations-pin.test.js`
Expected: PASS — every existing test (including the `review-severity-floor` -> `review-auto-apply-ceiling` migration test) still passes unmodified.

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/policy-schema.js plugin/skills/_shared/policy-schema.md tests/resolve-policy-lib.test.js
git commit -m "Register review-auto-apply-prose-exempt policy lever

refs #660"
```

---

### Task 2: Wire the prose-exempt bump into `step3-routing.md`'s auto-apply routing

**Files:**
- Modify: `plugin/skills/review/step3-routing.md` (insert a resolution paragraph after line 34's ceiling-resolution paragraph, and a bump-lookup + logging rule after the severity table, before line 48's "Ledger first, then the patch." paragraph)
- Test: `tests/step3-routing-prose-exempt-conformance.test.js` (new file)

**Interfaces:**
- Consumes: `review-auto-apply-prose-exempt` (Task 1's new lever), the `Target:` preamble lines from a staged patch (`_shared/staged-patch.md`'s existing format — "one line per file when the diff touches several" — already the changed-file list Task 2 reuses for diff-class detection, no new diff-parsing).
- Produces: prose rule text in `step3-routing.md` that a reviewing agent follows live during Step 3 Routing; no new exported function (this file has no corresponding executable module — routing is LLM-followed prose, so "tests" here are conformance tests pinning the required text is present and correctly worded, the same pattern `tests/deferral-gate-conformance.test.js` and `tests/staged-patch-contract.test.js` already use against this same file).

- [ ] **Step 1: Write the failing conformance test**

Create `tests/step3-routing-prose-exempt-conformance.test.js`:

```javascript
'use strict';
// tests/step3-routing-prose-exempt-conformance.test.js — pins that
// skills/review/step3-routing.md (#660) documents the
// review-auto-apply-prose-exempt bump: resolution, the exempt glob set, the
// one-tier-capped-at-medium bump rule, the all-paths-must-be-exempt
// requirement, and the distinguishing decision-log format.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'review', 'step3-routing.md');
const md = fs.readFileSync(MD_PATH, 'utf8');

test('resolves review-auto-apply-prose-exempt alongside review-auto-apply-ceiling', () => {
  assert.ok(md.includes('review-auto-apply-prose-exempt'), 'step3-routing.md must resolve review-auto-apply-prose-exempt');
});

test('names the exact exempt glob set', () => {
  for (const glob of ['skills/**/*.md', 'docs/**/*.md', 'tests/**']) {
    assert.ok(md.includes(glob), `step3-routing.md must name the exempt glob "${glob}"`);
  }
});

test('states the bump is one tier above the resolved ceiling, capped at medium', () => {
  assert.ok(/one severity tier above/.test(md), 'must state the bump direction (one tier above)');
  assert.ok(/capped/.test(md), 'must state the bump is capped');
  assert.ok(md.includes('never reaches `high`') || md.includes('never reach `high`') || md.includes("never reaches \`high\`"),
    'must state the bump never reaches high/critical');
});

test('a fix spanning an exempt and a non-exempt path gets no bump', () => {
  assert.ok(/not eligible for the bump|no bump|not.*eligible/i.test(md), 'must state a mixed-path fix does not receive the bump');
});

test('resolves off restores plain-ceiling behavior with no bump', () => {
  assert.ok(md.includes('resolves `off`'), 'must explicitly state the off case');
  assert.ok(/plain,? unbumped `review-auto-apply-ceiling`|routes on the plain ceiling/.test(md),
    'must state that off routes on the plain, unbumped ceiling');
});

test('the bumped AUTO log entry names the bump, distinguishing it from a plain ceiling-driven entry', () => {
  assert.ok(md.includes('prose-exempt bump applied'), 'must document the exact "prose-exempt bump applied" log suffix');
  assert.ok(md.includes('[lever: review-auto-apply-ceiling=low (default); prose-exempt bump applied]'),
    'must document the full bracketed log format from the spec');
});

test('Ledger-first citation and staged/review-{n}.patch pattern are still present (unmodified by #660)', () => {
  assert.ok(md.includes('staged/review-{n}.patch'), 'staged patch path pattern must survive the edit');
  assert.ok(/Ledger:/.test(md), 'Ledger: field citation must survive the edit');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/step3-routing-prose-exempt-conformance.test.js`
Expected: FAIL — every assertion referencing `review-auto-apply-prose-exempt`/the exempt globs/the bump language/the log format fails (none of that text exists in `step3-routing.md` yet); the last test (Ledger/staged-patch pattern) passes since that text already exists.

- [ ] **Step 3: Insert the resolution + bump-lookup rule**

In `plugin/skills/review/step3-routing.md`, immediately after line 34 (the paragraph ending "...`_shared/policy-schema.md`'s lever row: no standalone direct-read site exists).") and before line 35 (the blank line before line 36's "Per the `/review` Step 3 Routing row..."), insert a new paragraph:

```markdown
Also resolve `review-auto-apply-prose-exempt` the same way — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" review-auto-apply-prose-exempt` (boolean, default `on`). When it resolves `on` **and** every `Target:` path in the finding's staged-patch preamble (`_shared/staged-patch.md`) matches `skills/**/*.md`, `docs/**/*.md`, or `tests/**`, look up this finding's row in the table below using a **bumped ceiling** — one severity tier above the resolved `review-auto-apply-ceiling` (`none`→`low`, `low`→`medium`, `medium`→`medium` — capped: the bump never reaches `high` or `critical` at any ceiling value) — instead of the plain ceiling. A finding whose fix spans both an exempt and a non-exempt `Target:` path is not eligible for the bump; it routes on the plain ceiling like any other finding. **When `review-auto-apply-prose-exempt` resolves `off`**, this whole paragraph is inert — every finding routes on the plain, unbumped `review-auto-apply-ceiling` exactly as it did before this dimension existed.
```

- [ ] **Step 4: Insert the bump-logging rule after the severity table**

In the same file, immediately after the line "When `review-auto-apply-ceiling: none`: stage everything; never auto-apply." (currently line 46) and before the blank line preceding "**Ledger first, then the patch.**" (currently line 48), insert:

```markdown
**Logging a bumped auto-apply.** When the bump above is what moved a finding from Staged/Kept-prompt under the plain ceiling to Auto under the bumped ceiling, the `AUTO` log entry names the bump explicitly: pass `--lever "review-auto-apply-ceiling={ceiling} ({source}); prose-exempt bump applied"` to `log-decision.js`, rendering `[lever: review-auto-apply-ceiling=low (default); prose-exempt bump applied]` — distinguishing it from an ordinary ceiling-driven `AUTO` entry (no trailing clause). A finding that was already going to auto-apply under the plain ceiling (the bump wasn't load-bearing) logs the ordinary format with no bump suffix.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/step3-routing-prose-exempt-conformance.test.js`
Expected: PASS

- [ ] **Step 6: Run the full existing step3-routing-adjacent suite to confirm no regression**

Run: `node --test tests/deferral-gate-conformance.test.js tests/staged-patch-contract.test.js tests/code-health-misc/criteria-fragments.test.js tests/step3-routing-prose-exempt-conformance.test.js`
Expected: PASS — none of these pin the exact table text this task edits; they check citation/pattern presence that this edit preserves.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/review/step3-routing.md tests/step3-routing-prose-exempt-conformance.test.js
git commit -m "Wire prose-exempt tier bump into review Step 3 routing

refs #660"
```

---

### Task 3: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in any other suite (in particular `tests/policy-schema.test.js`'s `review-severity-floor` migration-alias test, and every other `POLICY_KEYS`-driven pin test, since Task 1 only appends a row).

- [ ] **Step 2: Commit (only if `npm test` surfaced and required any fix)**

If `npm test` is clean with no further changes, this step is a no-op — Tasks 1 and 2 already committed their own work.
