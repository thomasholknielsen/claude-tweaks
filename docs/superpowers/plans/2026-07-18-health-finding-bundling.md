# Health Finding Bundling — Port to docs-health, harness-health, journey-health — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `code-health`'s existing `relatedAnchors` root-cause-bundling mechanism to `docs-health`, `harness-health` (`kind: "patch"` findings only), and `journey-health` (`category: "coverage"` findings only), so multiple findings sharing one root cause file as **one** GitHub issue instead of N near-duplicates.

**Architecture:** Each of the three skills gains an optional `relatedSections` array field on its Finding Shape (an array of non-empty strings — sibling occurrences of the same root cause), validated by that skill's `validate-finding.js` and rendered as an `Also affects: `x`, `y`` line prepended to the issue body's Current State block by that skill's `issue-payload.js`. Each skill's `SKILL.md` gains a bundling-rule paragraph (when to use the field) and an Anti-Patterns row, mirroring `code-health`'s existing prose. `harness-health`'s Finding Shape is defined in the shared `_shared/harness-health-analysis.md` fragment (not its own `SKILL.md`), so that file — not `harness-health/SKILL.md` — is where the field itself is declared; `harness-health/SKILL.md` still gets the bundling-rule paragraph and Anti-Patterns row, since bundling is this skill's own rotation-based judgment policy, not something the fragment's other two consumers (`/wrap-up`, `/init`) need to know about. `code-health` itself needs no changes — it is the unmodified reference implementation this design ports from.

**Tech Stack:** Node.js (`node --test`), Markdown skill files.

## Global Constraints

- Field name is exactly `relatedSections` in all three ports — never `relatedAnchors` (that name is code-health's own, tied to its `anchor` vocabulary; these three skills key on `section` instead).
- The field is optional. When present, `validate-finding.js` must require every entry to be a non-empty string; when absent, validation must still pass and the field must pass through as `undefined` (not coerced to `null` or `[]`).
- The rendered line is exactly `` Also affects: `x`, `y` `` — backtick-wrapped entries, comma-space joined — and is the first element prepended to the body's Current State content; omit the line entirely (do not render an empty "Also affects:" heading) when the field is absent or an empty array.
- `bin/lib/code-health/**` is never touched by this plan — it is the reference implementation, already shipped and tested.
- Every new test must reuse that skill's existing fixture helper function (e.g. `validFinding()`, `validPatch()`, `finding()`) via its `overrides` parameter — do not hand-roll a parallel fixture.
- After every task, `npm test` must stay green (all suites: root `tests/`, `bin/lib/code-health/tests/`, `bin/lib/docs-health/tests/`, `bin/lib/harness-health/tests/`, `bin/lib/journey-health/tests/`).
- `harness-health`'s `relatedSections` check in `validate-finding.js` applies unconditionally (not gated on `obj.kind === 'patch'`) — the field is simply never populated for `kind: "new-skill"` findings, matching how `section`/`oldString`/`newString` are already only conditionally *required*, never forbidden-if-absent, for `new-skill`.
- `journey-health`'s `section` is a fixed 4-value enum (`files-frontmatter` | `self-review` | `coverage` | `live-check`), so a bundled finding's `relatedSections` entries there are NOT literal `section` values (every coverage finding already has `section: "coverage"` — listing `"coverage"` repeatedly would carry no information). Instead, each entry is a short identifying label for the sibling occurrence (e.g. `"signup-flow: steps 2,3"`) — the SKILL.md bundling-rule paragraph for `journey-health` must say this explicitly, since it's the one skill where the field's per-skill convention diverges from "sibling section value."

---

### Task 1: docs-health — `relatedSections` bundling support

**Files:**
- Modify: `bin/lib/docs-health/validate-finding.js`
- Modify: `bin/lib/docs-health/issue-payload.js`
- Modify: `bin/lib/docs-health/tests/validate-finding.test.js`
- Modify: `bin/lib/docs-health/tests/issue-payload.test.js`
- Modify: `skills/docs-health/SKILL.md`

**Interfaces:**
- Produces: `relatedSections` field on the docs-health Finding Shape — optional array of non-empty strings. `toIssuePayload(finding)`'s returned object gains a passthrough `relatedSections` key. This exact field name and shape is mirrored (not shared code — each skill has its own copy) by Tasks 2 and 3.

- [ ] **Step 1: Write failing `validate-finding.js` tests**

Append to the end of `bin/lib/docs-health/tests/validate-finding.test.js` (after the existing `'validateFinding accepts category: findability'` test):

```javascript
// ── relatedSections (bundled findings) ───────────────────────────────────────

test('validateFinding: relatedSections is optional — absent is valid', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

test('validateFinding: relatedSections accepted when present as an array of non-empty strings', () => {
  const result = validateFinding(validFinding({
    relatedSections: ['Auto-detect Patterns', 'Research Directory'],
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedSections, ['Auto-detect Patterns', 'Research Directory']);
});

test('validateFinding: relatedSections fails when not an array', () => {
  const result = validateFinding(validFinding({ relatedSections: 'Auto-detect Patterns' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains an empty string', () => {
  const result = validateFinding(validFinding({ relatedSections: ['Overview', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains a non-string entry', () => {
  const result = validateFinding(validFinding({ relatedSections: ['Overview', 42] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: the 5 new tests FAIL (`relatedSections` is not yet recognized, so the "absent is valid" test actually passes today, but the "accepted when present" test fails because `result.value.relatedSections` won't roundtrip — the field is silently accepted since `validateFinding` spreads `{ ...obj }` already; confirm instead that the 3 rejection tests fail, since nothing currently rejects a malformed `relatedSections`).

- [ ] **Step 3: Implement the `validate-finding.js` change**

In `bin/lib/docs-health/validate-finding.js`, replace:

```javascript
  if (typeof obj.oldString !== 'string') {
    errors.push('oldString: required string (empty string allowed for pure additions)');
  }
  if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
    errors.push('newString: required non-empty string');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

with:

```javascript
  if (typeof obj.oldString !== 'string') {
    errors.push('oldString: required string (empty string allowed for pure additions)');
  }
  if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
    errors.push('newString: required non-empty string');
  }

  // relatedSections is optional: when present, every entry must be a non-empty
  // string (same shape as `section` — sibling occurrences of the same root cause).
  if (obj.relatedSections !== undefined) {
    const isValidArray = Array.isArray(obj.relatedSections) &&
      obj.relatedSections.every((s) => typeof s === 'string' && s.trim() !== '');
    if (!isValidArray) {
      errors.push(`relatedSections: when present, must be an array of non-empty strings (got ${JSON.stringify(obj.relatedSections)})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test bin/lib/docs-health/tests/validate-finding.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Write failing `issue-payload.js` tests**

Append to the end of `bin/lib/docs-health/tests/issue-payload.test.js` (after the existing `'toIssuePayload title reflects category and misleads'` test):

```javascript
// ── relatedSections rendering (bundled findings) ─────────────────────────────

test('toIssuePayload body includes an "Also affects" line when relatedSections is present', () => {
  const payload = toIssuePayload(finding({ relatedSections: ['Auto-detect Patterns', 'Research Directory'] }));
  assert.ok(payload.body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(payload.body.includes('`Auto-detect Patterns`'));
  assert.ok(payload.body.includes('`Research Directory`'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is absent', () => {
  const payload = toIssuePayload(finding());
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is an empty array', () => {
  const payload = toIssuePayload(finding({ relatedSections: [] }));
  assert.ok(!payload.body.includes('Also affects:'));
});
```

- [ ] **Step 6: Run tests, verify the new ones fail**

Run: `node --test bin/lib/docs-health/tests/issue-payload.test.js`
Expected: FAIL — the "includes an Also affects line" test fails (`toIssuePayload` doesn't render it yet).

- [ ] **Step 7: Implement the `issue-payload.js` change**

In `bin/lib/docs-health/issue-payload.js`, replace:

```javascript
  const kindLine = `**Doc:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Misleads:** ${misleadsLabel} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  const body = specShapedBody({
    header: kindLine,
    currentState: finding.reason,
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:docs-health',
  });
```

with:

```javascript
  const kindLine = `**Doc:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Misleads:** ${misleadsLabel} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  // Only ever populated when multiple findings in one doc audit share the same
  // root cause — see the "Bundling rule" in skills/docs-health/SKILL.md Step 3.
  const relatedBlocks = Array.isArray(finding.relatedSections) && finding.relatedSections.length > 0
    ? [`Also affects: ${finding.relatedSections.map((s) => `\`${s}\``).join(', ')}`]
    : [];

  const body = specShapedBody({
    header: kindLine,
    currentState: [...relatedBlocks, finding.reason],
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:docs-health',
  });
```

Then, further down in the same file, replace:

```javascript
  return {
    id: finding.id,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    misleads: finding.misleads,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

with:

```javascript
  return {
    id: finding.id,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    misleads: finding.misleads,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

- [ ] **Step 8: Run tests, verify all pass**

Run: `node --test bin/lib/docs-health/tests/issue-payload.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 9: Update `skills/docs-health/SKILL.md` — Finding Shape + bundling rule**

Replace:

```
```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "category": "genre-drift | depth-mismatch | findability | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

Write the array to `/tmp/docs-health-findings.json`.
```

with:

```
```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "relatedSections": "<optional array of sibling section names sharing this finding's root cause; omit if there's only one occurrence>",
  "category": "genre-drift | depth-mismatch | findability | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

**Bundling rule (recurring root causes):** when two or more findings within this doc audit share both the same `category` and the same root-cause explanation, file **one** finding, not one per section. Pick the clearest/most representative occurrence as the primary `section`; list every other occurrence in `relatedSections`; make `reason` state the shared root cause explaining all of them; make `description` (the acceptance criteria) require every listed section fixed, not just the primary one. Only bundle occurrences that share both `category` AND the root cause — never bundle unrelated findings just because they're in the same doc.

Write the array to `/tmp/docs-health-findings.json`.
```

- [ ] **Step 10: Update `skills/docs-health/SKILL.md` — Anti-Patterns row**

Replace:

```
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

with:

```
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

- [ ] **Step 11: Verify the SKILL.md edits landed correctly**

Run: `grep -n "relatedSections" skills/docs-health/SKILL.md`
Expected: 2 matches (the Finding Shape field line and the bundling-rule paragraph) plus the Anti-Patterns row's `relatedSections` mention — 3 total.

- [ ] **Step 12: Commit**

```bash
git add bin/lib/docs-health/validate-finding.js bin/lib/docs-health/issue-payload.js bin/lib/docs-health/tests/validate-finding.test.js bin/lib/docs-health/tests/issue-payload.test.js skills/docs-health/SKILL.md
git commit -m "Port relatedSections bundling to docs-health"
```

---

### Task 2: harness-health — `relatedSections` bundling support

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md` (Finding Shape field — this is where the shape is actually defined, not `harness-health/SKILL.md`)
- Modify: `skills/harness-health/SKILL.md` (bundling-rule paragraph + Anti-Patterns row — usage policy, not shape)
- Modify: `bin/lib/harness-health/validate-finding.js`
- Modify: `bin/lib/harness-health/issue-payload.js`
- Modify: `bin/lib/harness-health/tests/validate-finding.test.js`
- Modify: `bin/lib/harness-health/tests/issue-payload.test.js`

**Interfaces:**
- Produces: `relatedSections` field on the harness-health Finding Shape, but ONLY meaningful for `kind: "patch"` findings — `kind: "new-skill"` findings never carry it (no `section` field to bundle by). `toIssuePayload(finding)`'s returned object gains a passthrough `relatedSections` key (will be `undefined` for `new-skill` findings, same as `section`/`oldString`/`newString` already are).

- [ ] **Step 1: Write failing `validate-finding.js` tests**

Append to the end of `bin/lib/harness-health/tests/validate-finding.test.js` (after the existing `'validateFinding accepts assetType: memory'` test):

```javascript
// ── relatedSections (bundled findings) ───────────────────────────────────────

test('validateFinding: relatedSections is optional — absent is valid', () => {
  const result = validateFinding(validPatch());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

test('validateFinding: relatedSections accepted on a patch finding as an array of non-empty strings', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', 'Overview'] }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedSections, ['Key Patterns', 'Overview']);
});

test('validateFinding: relatedSections fails when not an array', () => {
  const result = validateFinding(validPatch({ relatedSections: 'Key Patterns' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains an empty string', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains a non-string entry', () => {
  const result = validateFinding(validPatch({ relatedSections: ['Key Patterns', 1] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: a new-skill finding remains valid and unaffected by relatedSections', () => {
  const result = validateFinding(validNewSkill());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `node --test bin/lib/harness-health/tests/validate-finding.test.js`
Expected: the 3 rejection tests FAIL (nothing currently rejects a malformed `relatedSections`).

- [ ] **Step 3: Implement the `validate-finding.js` change**

In `bin/lib/harness-health/validate-finding.js`, replace:

```javascript
  if (obj.kind === 'patch') {
    if (typeof obj.section !== 'string' || obj.section.trim() === '') {
      errors.push('section: required non-empty string when kind is "patch"');
    }
    if (typeof obj.oldString !== 'string') {
      errors.push('oldString: required string when kind is "patch" (empty string allowed for pure additions)');
    }
    if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
      errors.push('newString: required non-empty string when kind is "patch"');
    }
  }
  if (obj.kind === 'new-skill') {
    if (typeof obj.proposedBody !== 'string' || obj.proposedBody.trim() === '') {
      errors.push('proposedBody: required non-empty string when kind is "new-skill"');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

with:

```javascript
  if (obj.kind === 'patch') {
    if (typeof obj.section !== 'string' || obj.section.trim() === '') {
      errors.push('section: required non-empty string when kind is "patch"');
    }
    if (typeof obj.oldString !== 'string') {
      errors.push('oldString: required string when kind is "patch" (empty string allowed for pure additions)');
    }
    if (typeof obj.newString !== 'string' || obj.newString.trim() === '') {
      errors.push('newString: required non-empty string when kind is "patch"');
    }
  }
  if (obj.kind === 'new-skill') {
    if (typeof obj.proposedBody !== 'string' || obj.proposedBody.trim() === '') {
      errors.push('proposedBody: required non-empty string when kind is "new-skill"');
    }
  }

  // relatedSections is optional: when present, every entry must be a non-empty
  // string (same shape as `section` — sibling occurrences of the same root
  // cause). Only ever populated for kind: "patch" findings — "new-skill"
  // candidates have no section to bundle by — but validated unconditionally
  // here, same as the required-field blocks above.
  if (obj.relatedSections !== undefined) {
    const isValidArray = Array.isArray(obj.relatedSections) &&
      obj.relatedSections.every((s) => typeof s === 'string' && s.trim() !== '');
    if (!isValidArray) {
      errors.push(`relatedSections: when present, must be an array of non-empty strings (got ${JSON.stringify(obj.relatedSections)})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test bin/lib/harness-health/tests/validate-finding.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Write failing `issue-payload.js` tests**

Append to the end of `bin/lib/harness-health/tests/issue-payload.test.js` (after the existing `'toIssuePayload renders a Memory label for assetType: memory'` test):

```javascript
// ── relatedSections rendering (bundled findings) ─────────────────────────────

test('toIssuePayload body includes an "Also affects" line when relatedSections is present on a patch finding', () => {
  const payload = toIssuePayload(patchFinding({ relatedSections: ['Key Patterns', 'Overview'] }));
  assert.ok(payload.body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(payload.body.includes('`Key Patterns`'));
  assert.ok(payload.body.includes('`Overview`'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is absent', () => {
  const payload = toIssuePayload(patchFinding());
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is an empty array', () => {
  const payload = toIssuePayload(patchFinding({ relatedSections: [] }));
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload for a new-skill finding never renders "Also affects" (no section to bundle by)', () => {
  const payload = toIssuePayload(newSkillFinding());
  assert.ok(!payload.body.includes('Also affects:'));
});
```

- [ ] **Step 6: Run tests, verify the new ones fail**

Run: `node --test bin/lib/harness-health/tests/issue-payload.test.js`
Expected: FAIL — the "includes an Also affects line" test fails (`toIssuePayload` doesn't render it yet).

- [ ] **Step 7: Implement the `issue-payload.js` change**

In `bin/lib/harness-health/issue-payload.js`, replace:

```javascript
  const deliverables = isNewSkill
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  const body = specShapedBody({
    header: kindLine,
    currentState: finding.reason,
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:harness-health',
  });
```

with:

```javascript
  const deliverables = isNewSkill
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  // Only ever populated for kind: "patch" findings — new-skill candidates have
  // no section to bundle by, so finding.relatedSections is always absent there.
  const relatedBlocks = Array.isArray(finding.relatedSections) && finding.relatedSections.length > 0
    ? [`Also affects: ${finding.relatedSections.map((s) => `\`${s}\``).join(', ')}`]
    : [];

  const body = specShapedBody({
    header: kindLine,
    currentState: [...relatedBlocks, finding.reason],
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:harness-health',
  });
```

Then, further down in the same file, replace:

```javascript
  return {
    id: finding.id,
    kind: finding.kind,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

with:

```javascript
  return {
    id: finding.id,
    kind: finding.kind,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

- [ ] **Step 8: Run tests, verify all pass**

Run: `node --test bin/lib/harness-health/tests/issue-payload.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 9: Update `skills/_shared/harness-health-analysis.md` — Finding Shape field**

Replace:

```
```json
{
  "kind": "patch",
  "target": "auth",
  "assetType": "skill",
  "category": "drift",
  "section": "Key Patterns",
  "classification": "additive",
  "confidence": "high",
  "reversibility": "high",
  "description": "The referenced example at src/auth/login.js no longer exists",
  "oldString": "See `src/auth/login.js` for the canonical flow.",
  "newString": "See `src/auth/session.js` for the canonical flow.",
  "reason": "src/auth/login.js was renamed to src/auth/session.js in a prior refactor; the skill still points at the old path."
}
```
```

with:

```
```json
{
  "kind": "patch",
  "target": "auth",
  "assetType": "skill",
  "category": "drift",
  "section": "Key Patterns",
  "relatedSections": "<optional array of sibling section names sharing this finding's root cause; omit if there's only one occurrence — patch findings only, see /claude-tweaks:harness-health's bundling rule>",
  "classification": "additive",
  "confidence": "high",
  "reversibility": "high",
  "description": "The referenced example at src/auth/login.js no longer exists",
  "oldString": "See `src/auth/login.js` for the canonical flow.",
  "newString": "See `src/auth/session.js` for the canonical flow.",
  "reason": "src/auth/login.js was renamed to src/auth/session.js in a prior refactor; the skill still points at the old path."
}
```
```

- [ ] **Step 10: Update `skills/_shared/harness-health-analysis.md` — required-fields paragraph**

Replace:

```
Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, `"CLAUDE"` for CLAUDE.md, `"PRODUCT"`/`"DESIGN"` for a design artifact, or a memory entry's filename stem), `assetType` (`skill` | `rule` | `claude-md` | `design-artifact` | `memory`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`. `kind: "new-skill"` additionally requires `proposedBody`. **`new-skill` is the only artifact-creation kind** — rules and CLAUDE.md never get a `"new-rule"` or `"new-claude-md-section"` kind; a "missing pattern" finding against an existing rule or CLAUDE.md is always a `kind: "patch"` addition to that file's existing content (see Step 3).
```

with:

```
Required fields for every finding: `kind` (`patch` | `new-skill`), `target` (the artifact's id — a skill/rule filename stem, `"CLAUDE"` for CLAUDE.md, `"PRODUCT"`/`"DESIGN"` for a design artifact, or a memory entry's filename stem), `assetType` (`skill` | `rule` | `claude-md` | `design-artifact` | `memory`), `category` (`drift` | `template-conformance` | `best-practice`), `classification` (`additive` | `restructural`), `confidence` (`high` | `med` | `low`), `reversibility` (`high` | `med` | `low`), `description`, `reason`. `kind: "patch"` additionally requires `section`, `oldString` (empty string `""` allowed for a pure addition with nothing to replace), and `newString`, and may optionally carry `relatedSections` (an array of non-empty strings — sibling `section` values sharing this finding's root cause; see `/claude-tweaks:harness-health`'s bundling rule). `kind: "new-skill"` additionally requires `proposedBody` and never carries `relatedSections` — new-skill candidates have no `section` to bundle by. **`new-skill` is the only artifact-creation kind** — rules and CLAUDE.md never get a `"new-rule"` or `"new-claude-md-section"` kind; a "missing pattern" finding against an existing rule or CLAUDE.md is always a `kind: "patch"` addition to that file's existing content (see Step 3).
```

- [ ] **Step 11: Update `skills/harness-health/SKILL.md` — bundling rule**

Replace:

```
For every other `target.kind` (skill, rule, claude-md), apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.
```

with:

```
For every other `target.kind` (skill, rule, claude-md), apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.

**Bundling rule (recurring root causes):** when two or more `kind: "patch"` findings against this same target share both the same `category` and the same root-cause explanation, file **one** finding, not one per section. Pick the clearest/most representative occurrence as the primary `section`; list every other occurrence in `relatedSections` (`_shared/harness-health-analysis.md`'s Finding Shape); make `reason` state the shared root cause explaining all of them; make `description` (the acceptance criteria) require every listed section fixed, not just the primary one. Only bundle occurrences that share both `category` AND the root cause. `kind: "new-skill"` candidates never carry `relatedSections` — they have no `section` to bundle by.
```

- [ ] **Step 12: Update `skills/harness-health/SKILL.md` — Anti-Patterns row**

Replace:

```
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

with:

```
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

- [ ] **Step 13: Verify the doc edits landed correctly**

Run: `grep -n "relatedSections" skills/_shared/harness-health-analysis.md skills/harness-health/SKILL.md`
Expected: 3 matches in `harness-health-analysis.md` (Finding Shape field once, required-fields sentence twice — "may optionally carry" and "never carries") and 3 matches in `harness-health/SKILL.md` (bundling-rule paragraph mentions it twice, Anti-Patterns row once).

- [ ] **Step 14: Commit**

```bash
git add skills/_shared/harness-health-analysis.md skills/harness-health/SKILL.md bin/lib/harness-health/validate-finding.js bin/lib/harness-health/issue-payload.js bin/lib/harness-health/tests/validate-finding.test.js bin/lib/harness-health/tests/issue-payload.test.js
git commit -m "Port relatedSections bundling to harness-health"
```

---

### Task 3: journey-health — `relatedSections` bundling support (coverage findings only)

**Files:**
- Modify: `bin/lib/journey-health/validate-finding.js`
- Modify: `bin/lib/journey-health/issue-payload.js`
- Modify: `bin/lib/journey-health/tests/validate-finding.test.js`
- Modify: `bin/lib/journey-health/tests/issue-payload.test.js`
- Modify: `skills/journey-health/SKILL.md`

**Interfaces:**
- Produces: `relatedSections` field on the journey-health Finding Shape. Unlike Tasks 1-2, entries here are NOT literal `section` values (every `category: "coverage"` finding already has `section: "coverage"`, a fixed enum value that carries no distinguishing information) — each entry is instead a short identifying label for the sibling occurrence (e.g. `"signup-flow: steps 2,3"`). `toIssuePayload(finding)`'s returned object gains a passthrough `relatedSections` key.

- [ ] **Step 1: Write failing `validate-finding.js` tests**

Append to the end of `bin/lib/journey-health/tests/validate-finding.test.js` (after the existing `'validateFinding rejects an invalid severity'` test):

```javascript
// ── relatedSections (bundled coverage findings) ──────────────────────────────

test('validateFinding: relatedSections is optional — absent is valid', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage' }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.relatedSections, undefined);
});

test('validateFinding: relatedSections accepted on a coverage finding as an array of non-empty strings', () => {
  const result = validateFinding(validFinding({
    category: 'coverage', section: 'coverage',
    relatedSections: ['signup-flow: steps 2,3', 'login-flow: steps 4'],
  }));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.value.relatedSections, ['signup-flow: steps 2,3', 'login-flow: steps 4']);
});

test('validateFinding: relatedSections fails when not an array', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: 'signup-flow' }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains an empty string', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: ['signup-flow: steps 2,3', ''] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: relatedSections fails when it contains a non-string entry', () => {
  const result = validateFinding(validFinding({ category: 'coverage', section: 'coverage', relatedSections: ['signup-flow: steps 2,3', 7] }));
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.startsWith('relatedSections')), result.errors.join('; '));
});

test('validateFinding: a self-review (non-coverage) finding remains valid and unaffected by relatedSections', () => {
  const result = validateFinding(validFinding());
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `node --test bin/lib/journey-health/tests/validate-finding.test.js`
Expected: the 3 rejection tests FAIL (nothing currently rejects a malformed `relatedSections`).

- [ ] **Step 3: Implement the `validate-finding.js` change**

In `bin/lib/journey-health/validate-finding.js`, replace:

```javascript
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

with:

```javascript
  if (typeof obj.severity === 'string' && !SEVERITY_VALUES.has(obj.severity)) {
    errors.push(`severity: must be one of ${[...SEVERITY_VALUES].join('|')} (got "${obj.severity}")`);
  }

  // relatedSections is optional: when present, every entry must be a non-empty
  // string — sibling occurrences of the same root cause, scoped to
  // category: "coverage" findings only (see skills/journey-health/SKILL.md
  // Step 3's bundling rule). Validated unconditionally here, same as
  // harness-health's kind-agnostic check.
  if (obj.relatedSections !== undefined) {
    const isValidArray = Array.isArray(obj.relatedSections) &&
      obj.relatedSections.every((s) => typeof s === 'string' && s.trim() !== '');
    if (!isValidArray) {
      errors.push(`relatedSections: when present, must be an array of non-empty strings (got ${JSON.stringify(obj.relatedSections)})`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], value: { ...obj } };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `node --test bin/lib/journey-health/tests/validate-finding.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Write failing `issue-payload.js` tests**

Append to the end of `bin/lib/journey-health/tests/issue-payload.test.js` (after the existing `'toIssuePayload preserves top-level finding fields alongside the payload fields'` test):

```javascript
// ── relatedSections rendering (bundled coverage findings) ────────────────────

test('toIssuePayload body includes an "Also affects" line when relatedSections is present on a coverage finding', () => {
  const payload = toIssuePayload(finding({
    category: 'coverage', section: 'coverage',
    relatedSections: ['signup-flow: steps 2,3', 'login-flow: steps 4'],
  }));
  assert.ok(payload.body.includes('Also affects:'), 'missing Also affects block');
  assert.ok(payload.body.includes('`signup-flow: steps 2,3`'));
  assert.ok(payload.body.includes('`login-flow: steps 4`'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is absent', () => {
  const payload = toIssuePayload(finding({ category: 'coverage', section: 'coverage' }));
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload body omits "Also affects" when relatedSections is an empty array', () => {
  const payload = toIssuePayload(finding({ category: 'coverage', section: 'coverage', relatedSections: [] }));
  assert.ok(!payload.body.includes('Also affects:'));
});

test('toIssuePayload for a self-review (non-coverage) finding never renders "Also affects"', () => {
  const payload = toIssuePayload(finding());
  assert.ok(!payload.body.includes('Also affects:'));
});
```

- [ ] **Step 6: Run tests, verify the new ones fail**

Run: `node --test bin/lib/journey-health/tests/issue-payload.test.js`
Expected: FAIL — the "includes an Also affects line" test fails (`toIssuePayload` doesn't render it yet).

- [ ] **Step 7: Implement the `issue-payload.js` change**

In `bin/lib/journey-health/issue-payload.js`, replace:

```javascript
function toIssuePayload(finding) {
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const body = specShapedBody({
    header: `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence}`,
    currentState: [finding.description, finding.reason],
    deliverables: finding.recommendation,
    acceptanceCriteria: `The condition described above is resolved: a fresh \`/claude-tweaks:journey-health\` audit of journey '${finding.journey}' files no finding with this fingerprint.`,
    filedBy: '/claude-tweaks:journey-health',
  });
```

with:

```javascript
function toIssuePayload(finding) {
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  // Only ever populated for category: "coverage" findings — the other three
  // sections each emit at most one finding per violation and have nothing to bundle.
  const relatedBlocks = Array.isArray(finding.relatedSections) && finding.relatedSections.length > 0
    ? [`Also affects: ${finding.relatedSections.map((s) => `\`${s}\``).join(', ')}`]
    : [];

  const body = specShapedBody({
    header: `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence}`,
    currentState: [...relatedBlocks, finding.description, finding.reason],
    deliverables: finding.recommendation,
    acceptanceCriteria: `The condition described above is resolved: a fresh \`/claude-tweaks:journey-health\` audit of journey '${finding.journey}' files no finding with this fingerprint.`,
    filedBy: '/claude-tweaks:journey-health',
  });
```

Then, further down in the same file, replace:

```javascript
  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    severity: finding.severity,
    confidence: finding.confidence,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

with:

```javascript
  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    severity: finding.severity,
    confidence: finding.confidence,
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}
```

- [ ] **Step 8: Run tests, verify all pass**

Run: `node --test bin/lib/journey-health/tests/issue-payload.test.js`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 9: Update `skills/journey-health/SKILL.md` — bundling rule**

Replace:

```
Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. Severity scales with how much of the journey is uncovered: `"high"` when every documented step is uncovered (zero story coverage for this journey at all), `"low"` when exactly one step is uncovered, `"med"` for anything in between. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `{ journey: "<suggested journey>", category: "coverage", section: "coverage", description: "Story '{storyId}' matches journey '{journey}' but has no journey: field", reason: "story '{storyId}''s URL {url} matches a step in journey '{journey}', but the story has no journey: field linking them", confidence: "med", severity: "low", recommendation: "Add journey: {journey} to {storyFile}" }`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).

Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).
```

with:

```
Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. Severity scales with how much of the journey is uncovered: `"high"` when every documented step is uncovered (zero story coverage for this journey at all), `"low"` when exactly one step is uncovered, `"med"` for anything in between. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `{ journey: "<suggested journey>", category: "coverage", section: "coverage", description: "Story '{storyId}' matches journey '{journey}' but has no journey: field", reason: "story '{storyId}''s URL {url} matches a step in journey '{journey}', but the story has no journey: field linking them", confidence: "med", severity: "low", recommendation: "Add journey: {journey} to {storyFile}" }`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).

**Bundling rule (recurring root causes):** when two or more `category: "coverage"` findings emitted in this same coverage-scan firing share the same root cause (e.g., a single batch story deletion causing several coverage gaps at once), file **one** finding, not one per journey/story. Pick the clearest/most representative occurrence as the primary finding; list every other occurrence in `relatedSections` — since `section` is always `"coverage"` here and carries no distinguishing information, populate each entry with an identifying label for that sibling occurrence instead (e.g. `"signup-flow: steps 2,3"`, `"login-flow: steps 4"`), not the literal `section` value; make `reason` state the shared root cause explaining all of them; make `recommendation` cover every listed occurrence, not just the primary one. Only bundle occurrences that share both `category: "coverage"` AND the root cause — never bundle unrelated coverage gaps together. This never applies to Step 2's `files-frontmatter`/`self-review` findings or Step 3.5's `live-check` findings — each of those emits at most one finding per violation, so there's nothing to bundle.

Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).
```

- [ ] **Step 10: Update `skills/journey-health/SKILL.md` — Anti-Patterns row**

Replace:

```
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

with:

```
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
```

- [ ] **Step 11: Verify the SKILL.md edits landed correctly**

Run: `grep -n "relatedSections" skills/journey-health/SKILL.md`
Expected: 2 matches (the bundling-rule paragraph once, the Anti-Patterns row once).

- [ ] **Step 12: Commit**

```bash
git add bin/lib/journey-health/validate-finding.js bin/lib/journey-health/issue-payload.js bin/lib/journey-health/tests/validate-finding.test.js bin/lib/journey-health/tests/issue-payload.test.js skills/journey-health/SKILL.md
git commit -m "Port relatedSections bundling to journey-health (coverage findings only)"
```

---

### Task 4: Final verification sweep

**Files:**
- None modified — read-only verification.

**Interfaces:**
- Consumes: the combined output of Tasks 1-3.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites PASS (root `tests/`, `bin/lib/code-health/tests/`, `bin/lib/docs-health/tests/`, `bin/lib/harness-health/tests/`, `bin/lib/journey-health/tests/`). If a pre-existing unrelated flaky test fails (e.g. a statusline perf timing test), note it but do not treat it as a regression from this plan.

- [ ] **Step 2: Confirm `relatedSections` never appears in code-health**

Run: `grep -rn "relatedSections" bin/lib/code-health/ skills/code-health/SKILL.md`
Expected: no matches — code-health uses `relatedAnchors` exclusively and is untouched by this plan.

- [ ] **Step 3: Confirm the field name is consistent across all three ports**

Run: `grep -rln "relatedAnchors" bin/lib/docs-health/ bin/lib/harness-health/ bin/lib/journey-health/ skills/docs-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/_shared/harness-health-analysis.md`
Expected: no matches — none of the three ports accidentally used code-health's field name instead of `relatedSections`.

- [ ] **Step 4: Confirm every Anti-Patterns table gained exactly one new row**

Run: `grep -c "Splitting one recurring root cause into N near-duplicate issues instead of bundling" skills/docs-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md`
Expected: `1` for each of the three files.

- [ ] **Step 5: Read the final diff stat**

Run: `git diff --stat main`
Expected: exactly the 16 files this plan modifies (5 for docs-health, 6 for harness-health, 5 for journey-health — `harness-health-analysis.md` and `harness-health/SKILL.md` are both counted in harness-health's 6) — no stray files, no `bin/lib/code-health/**` entries.
