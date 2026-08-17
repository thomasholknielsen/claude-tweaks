# Record #677 — Rename `framing:baked` → `solution:unjustified` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the presence-only `framing:baked` label and its `facets.framing` key to `solution:unjustified` / `facets.solutionUnjustified` everywhere the plugin emits, reads, documents, or tests it — with permanent read-side fallbacks for the old spellings — and un-dormant the `/backlog overview` consumer that already reads the new key.

**Architecture:** Emit side becomes new-spelling-only in both work-record drivers (`record.js` label emit/parse, `local-store.js` frontmatter parse/serialize) plus the shared facet default (`facet-shape.js`); each driver keeps a permanent `[IL-85]`-style read-side fallback for the old spelling. The `_shared` contract files (`label-bootstrap.md` canonical set + version bump, `work-record.md` taxonomy) change next; then every skill/doc instruction that names the label or key; then `overview-mode.md`'s dormancy caveats are retired (with the needs-you launcher switched to a form `/challenge` accepts today). The live-repo label migration is the last task and touches no tracked file.

**Tech Stack:** Node 18+ (`node --test`), markdown skill files, `gh` CLI (Task 6 only).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T223043-spec-677/work/677-spec.md`

## Global Constraints

- Read-side fallbacks for `framing:baked` (label) and `framing:` (frontmatter line) are **permanent** — commented `[IL-85]`-style, never scheduled for removal here.
- No emit path may write `framing:baked` or a `framing:` line after this plan.
- Never write the literal placeholder tokens (the three-letter T-B-D, T-O-D-O, or the `<!-- ambiguity:` marker) into any composed skill/doc prose.
- Historical files keep the old spelling: `CHANGELOG.md`, `docs/incident-log.md`, `.claude-tweaks/pipelines/**/work/*.md`, `docs/superpowers/plans/*` (other than this plan).
- Shaping-mode's `gh issue edit` block stays in "show the call without the flag, document when to add it" form (`[IL-103]`).
- Commit messages reference the record as `refs #677` (never a closing keyword — the PR body carries `Fixes #677`).
- Working directory: every command runs from the worktree root `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-677` (`git rev-parse --show-toplevel` must print that path). This session's shell refuses `&&` chains and heredocs — one plain command per Bash call; use the Edit tool for file changes.

---

### Task 1: Drivers — rename the facet key and label constant with read-side fallbacks

**Files:**
- Modify: `bin/lib/issues/facet-shape.js:24`
- Modify: `bin/lib/issues/record.js:24, 120, 128, 145, 164, 258-261`
- Modify: `bin/lib/issues/local-store.js:7, 100-104, 119, 143-146, 201`
- Modify: `bin/lib/issues/backlog.js:205-215`
- Test: `tests/bin-lib/issues/record.test.js`
- Test: `tests/bin-lib/issues/local-store.test.js`
- Test: `tests/bin-lib/issues/backlog.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `LABELS.SOLUTION_UNJUSTIFIED === 'solution:unjustified'` (new), `LABELS.FRAMING_BAKED` (kept, read-side legacy only); `recordPayload({ solutionUnjustified })` (parameter renamed from `framing`); `parseRecordFacets(labels).solutionUnjustified` (boolean; `framing` key gone); `sharedFacetDefaults().solutionUnjustified === false`; local-files frontmatter line `solution-unjustified: true` (write) and `solution-unjustified: true|false` + legacy `framing: true|false` (read).

- [ ] **Step 1: Update `tests/bin-lib/issues/record.test.js` — emit + parse tests**

Replace the three `recordPayload … framing` tests (currently at lines 129-145) with:

```js
test('recordPayload emits solution:unjustified when solutionUnjustified is truthy', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', risk: 'low', size: 'low', ceremony: 'standard', solutionUnjustified: true, ready: true });
  assert.ok(result.labels.includes('solution:unjustified'));
  assert.ok(!result.labels.includes('framing:baked'), 'emit side is new-spelling-only');
});

test('recordPayload emits no solution:unjustified label when solutionUnjustified is omitted', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', risk: 'low', size: 'low', ceremony: 'standard', ready: true });
  assert.ok(!result.labels.includes('solution:unjustified'));
  assert.ok(!result.labels.includes('framing:baked'));
});

test('recordPayload places solution:unjustified between ceremony:* and ready in the emitted array', () => {
  const result = recordPayload({
    title: 't', body: 'b', type: 'task', origin: 'capture',
    risk: 'low', size: 'low', ceremony: 'standard', solutionUnjustified: true, ready: true, priority: 'high',
  });
  assert.deepStrictEqual(result.labels, ['by:capture', 'risk:low', 'size:low', 'ceremony:standard', 'solution:unjustified', 'ready', 'priority:high']);
});
```

Replace the two `parseRecordFacets: framing…` tests (currently at lines 359-366, under the `// AC — framing axis` comment) with:

```js
// AC 2 (record #677) — solution:unjustified axis (challenge framing-check, presence-only label;
// renamed from framing:baked — the old label stays readable forever, [IL-85]-style)

test('parseRecordFacets: solution:unjustified sets facets.solutionUnjustified to true', () => {
  assert.strictEqual(parseRecordFacets(['solution:unjustified']).solutionUnjustified, true);
});

test('parseRecordFacets: legacy framing:baked label also sets facets.solutionUnjustified to true (permanent read-side fallback)', () => {
  assert.strictEqual(parseRecordFacets(['framing:baked']).solutionUnjustified, true);
});

test('parseRecordFacets: solutionUnjustified defaults to false and there is no framing key', () => {
  const facets = parseRecordFacets(['ready', 'risk:low']);
  assert.strictEqual(facets.solutionUnjustified, false);
  assert.strictEqual(parseRecordFacets([]).solutionUnjustified, false);
  assert.ok(!('framing' in facets), 'the pre-rename facets.framing key must be gone');
});
```

Then update the two full-shape fixture objects at lines ~211 and ~237 (`origin: 'capture', risk: null, … framing: false, needsDefinition: false, …` and `origin: null, … framing: false, …`): replace `framing: false` with `solutionUnjustified: false` in each.

- [ ] **Step 2: Update `tests/bin-lib/issues/local-store.test.js`**

Replace every `framing: false` and `framing: true` inside fixture objects (lines ~25, ~47, ~85, ~280 `baseFacets`) with `solutionUnjustified: false` / `solutionUnjustified: true`. Replace `assert.ok(!/^framing:/m.test(raw), 'must not write framing: false');` (line ~62) with `assert.ok(!/^solution-unjustified:/m.test(raw), 'must not write solution-unjustified: false');` and `assert.strictEqual(record.facets.framing, false);` (line ~73) with `assert.strictEqual(record.facets.solutionUnjustified, false);`. Update the comment at line ~78 (`// framing: true round-trip coverage above.`) to `// solutionUnjustified: true round-trip coverage above.`

Replace the round-trip test at lines ~360-377 (comment + `writeRecord writes framing: true …` test) with:

```js
// solution:unjustified (challenge framing-check) is presence-only for the local-files
// driver too, same convention as unsynced/closed: written only when true, and
// its absence on read is the false default from facet-shape.js's
// sharedFacetDefaults(), never a distinct "open" value. Renamed from framing:
// by record #677 — the legacy line stays readable forever ([IL-85]).
test('writeRecord writes solution-unjustified: true, readRecord reads it back, and a false value writes no line', (t) => {
  const dir = tmp(t);
  const withFlag = path.join(dir, '1-a.md');
  writeRecord(withFlag, { title: 'A', body: 'b', facets: baseFacets({ solutionUnjustified: true }) });
  const rawWith = fs.readFileSync(withFlag, 'utf8');
  assert.ok(/^solution-unjustified: true$/m.test(rawWith));
  assert.ok(!/^framing:/m.test(rawWith), 'emit side never writes the legacy framing: line');
  assert.strictEqual(readRecord(withFlag).facets.solutionUnjustified, true);

  const withoutFlag = path.join(dir, '2-b.md');
  writeRecord(withoutFlag, { title: 'B', body: 'b', facets: baseFacets() });
  const rawWithout = fs.readFileSync(withoutFlag, 'utf8');
  assert.ok(!/^solution-unjustified:/m.test(rawWithout));
  assert.strictEqual(readRecord(withoutFlag).facets.solutionUnjustified, false);
});

test('readRecord: legacy framing: true line reads as solutionUnjustified true (permanent read-side fallback)', (t) => {
  const dir = tmp(t);
  const legacy = path.join(dir, '3-legacy.md');
  fs.writeFileSync(legacy, '---\ntype: task\nframing: true\n---\n# Legacy\n\nb\n');
  assert.strictEqual(readRecord(legacy).facets.solutionUnjustified, true);
  assert.ok(!('framing' in readRecord(legacy).facets), 'no framing key on the read record');
});

test('readRecord: an explicit solution-unjustified: line wins over a legacy framing: line in either order', (t) => {
  const dir = tmp(t);
  const newFirst = path.join(dir, '4-new-first.md');
  fs.writeFileSync(newFirst, '---\ntype: task\nsolution-unjustified: false\nframing: true\n---\n# A\n\nb\n');
  assert.strictEqual(readRecord(newFirst).facets.solutionUnjustified, false);
  const legacyFirst = path.join(dir, '5-legacy-first.md');
  fs.writeFileSync(legacyFirst, '---\ntype: task\nframing: true\nsolution-unjustified: false\n---\n# B\n\nb\n');
  assert.strictEqual(readRecord(legacyFirst).facets.solutionUnjustified, false);
});
```

- [ ] **Step 3: Update `tests/bin-lib/issues/backlog.test.js`**

In the `rec()` fixture builder (line ~241) replace `framing: false,` with `solutionUnjustified: false,`. Rewrite its header comment (lines ~231-236) to:

```js
// Minimal faceted-record builder for funnelBuckets cases. Mirrors
// sharedFacetDefaults()'s shape — keys funnelBuckets reads are explicit;
// solutionUnjustified defaults false here exactly as the shared shape does
// (live since record #677's rename). needsDefinition is deliberately absent
// from these defaults: a fixture that wants it opts in via facetOverrides.
```

Rename the two `#471`-citing tests (lines ~398-411): replace the comment `// Reads the expected post-#471-rename key (solutionUnjustified) — reconciliation` / `// marker: if #471 ships a different key this test's fixture goes stale loudly.` with `// solutionUnjustified is the live facet key both drivers set (record #677 rename).` and the test name `'funnelBuckets: solutionUnjustified facet (expected #471 key) joins needsYou as kind unjustified'` with `'funnelBuckets: solutionUnjustified facet joins needsYou as kind unjustified'`. Leave the both-facets precedence test's name (`… (#471 precedence)`) as-is — #471 genuinely is where that precedence was decided.

- [ ] **Step 4: Run the three suites to verify they fail**

Run: `node --test tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — `solution:unjustified` not emitted, `solutionUnjustified` undefined, round-trip deepStrictEqual mismatch on the `framing` key.

- [ ] **Step 5: `bin/lib/issues/facet-shape.js`**

Replace line 24 `    framing: false,` with `    solutionUnjustified: false,`.

- [ ] **Step 6: `bin/lib/issues/record.js`**

Line 24: replace `  FRAMING_BAKED: 'framing:baked',` with:

```js
  SOLUTION_UNJUSTIFIED: 'solution:unjustified',
  // Read-side legacy fallback — PERMANENT cross-project support (other repos' records keep framing:baked labels, pre-rename); removable only at a major version that drops pre-rename repo support. [IL-85] Never emitted.
  FRAMING_BAKED: 'framing:baked',
```

Line 120 comment: `// { title, body, type, origin?, risk?, size?, ceremony?, framing?, ready?, parked?, priority?, fingerprint? }` → `// { title, body, type, origin?, risk?, size?, ceremony?, solutionUnjustified?, ready?, parked?, priority?, fingerprint? }`.

Line 128 signature: `ceremony, framing, ready,` → `ceremony, solutionUnjustified, ready,`.

Line 145 comment: `framing:baked, ready, parked, priority:*.` → `solution:unjustified, ready, parked, priority:*.`

Line 164: `  if (framing) labels.push(LABELS.FRAMING_BAKED);` → `  if (solutionUnjustified) labels.push(LABELS.SOLUTION_UNJUSTIFIED);`

Lines 258-261:
```js
    if (name === LABELS.FRAMING_BAKED) {
      facets.framing = true;
      continue;
    }
```
→
```js
    // solution:unjustified — or its pre-rename spelling framing:baked (permanent read-side fallback, [IL-85]).
    if (name === LABELS.SOLUTION_UNJUSTIFIED || name === LABELS.FRAMING_BAKED) {
      facets.solutionUnjustified = true;
      continue;
    }
```

- [ ] **Step 7: `bin/lib/issues/local-store.js`**

Line 7 header comment: `risk, size, ceremony, framing, priority,` → `risk, size, ceremony, solutionUnjustified, priority,`.

Lines 100-104 (`parseFrontmatterLines` locals): after `let legacyParentFallback = null;` add:
```js
  let sawNewUnjustifiedLine = false;
  let legacyFramingFallback = null;
```

Line 119: replace `    if ((m = /^framing:\s*(true|false)$/.exec(line))) { facets.framing = m[1] === 'true'; continue; }` with:
```js
    if ((m = /^solution-unjustified:\s*(true|false)$/.exec(line))) { facets.solutionUnjustified = m[1] === 'true'; sawNewUnjustifiedLine = true; continue; }
    // Read-side framing: fallback — PERMANENT cross-project support (pre-rename local records keep framing: lines); removable only at a major version that drops pre-rename repo support. [IL-85]
    // Precedence is held-aside, not OR: an explicit solution-unjustified: line (either value) must win over any legacy line, so the legacy value applies after the pass and only when no new line was seen.
    if ((m = /^framing:\s*(true|false)$/.exec(line))) { legacyFramingFallback = m[1] === 'true'; continue; }
```

Lines 143-146 (post-pass applies): after `if (!sawNewParentLine && legacyParentFallback !== null) facets.isParentIssue = legacyParentFallback;` add:
```js
  if (!sawNewUnjustifiedLine && legacyFramingFallback !== null) facets.solutionUnjustified = legacyFramingFallback;
```

Also extend the function's header comment (lines 93-99: "Two keys are not resolved by the plain last-matching-line-wins rule…") to name three keys — replace `Two keys are not resolved` with `Three keys are not resolved` and `and \`isParentIssue\` (an explicit \`is-parent-issue:\` line` with `\`isParentIssue\` (an explicit \`is-parent-issue:\` line`, then insert `, and \`solutionUnjustified\` (an explicit \`solution-unjustified:\` line always beats a pre-rename \`framing:\` line)` immediately before `, whichever order the two`; change `the two lines of each pair` to `the lines of each pair`.

Line 201: `  if (facets.framing) lines.push('framing: true');` → `  if (facets.solutionUnjustified) lines.push('solution-unjustified: true');`

- [ ] **Step 8: `bin/lib/issues/backlog.js` — retire the dormancy comment**

Replace the comment block at lines 205-215 (from `  // needsYou is an OVERLAY, never a ninth stage:` through `  // exclusion from the Shape paste block happens at RENDER, never here.`) with:

```js
  // needsYou is an OVERLAY, never a ninth stage: every record above keeps its
  // one primary bucket (exclusivity and sum-to-total invariants untouched).
  // Both needs-facets are LIVE on both drivers (record.js for github-issues,
  // local-store.js for local-files): needsDefinition since the needs:definition
  // taxonomy shipped, solutionUnjustified since record #677 renamed
  // framing:baked -> solution:unjustified. A record carrying both facets yields
  // one entry with kind 'definition' — the hard gate dominates. needs:definition
  // exclusion from the Shape paste block happens at RENDER, never here.
```

- [ ] **Step 9: Run the three suites to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/backlog.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add bin/lib/issues/facet-shape.js bin/lib/issues/record.js bin/lib/issues/local-store.js bin/lib/issues/backlog.js tests/bin-lib/issues/record.test.js tests/bin-lib/issues/local-store.test.js tests/bin-lib/issues/backlog.test.js
git commit -m "Rename facets.framing → facets.solutionUnjustified across both drivers, emit solution:unjustified with permanent read-side fallbacks — refs #677"
```

(One command per Bash call — the `git add` and the `git commit` are separate calls.)

---

### Task 2: Canonical label set — `label-bootstrap.md` + `labels.test.js`

**Files:**
- Modify: `skills/_shared/label-bootstrap.md:42, 107`
- Test: `tests/bin-lib/issues/labels.test.js:36-48`

**Interfaces:**
- Consumes: `LABELS.SOLUTION_UNJUSTIFIED` / `LABELS.FRAMING_BAKED` from Task 1.
- Produces: canonical `LABELS_JSON` row `["solution:unjustified", "Solution: named without being traded off against alternatives — add evidence or accept the risk"]` (95 chars); `LABEL_BOOTSTRAP_VERSION` = `3`.

- [ ] **Step 1: Update `tests/bin-lib/issues/labels.test.js`**

Replace the two tests at lines 36-48 with:

```js
test('solution:unjustified is bootstrappable with a description within the cap', () => {
  // Read the description from the canonical fence (see canonicalLabelsFromBootstrapDoc
  // below) instead of hand-copying it, so a future edit to that source that pushes the
  // description over the cap fails here rather than drifting silently.
  const row = canonicalLabelsFromBootstrapDoc().find(([name]) => name === 'solution:unjustified');
  assert.ok(row, 'label-bootstrap.md must carry solution:unjustified in LABELS_JSON');
  const [, description] = row;
  const payload = ensureLabelPayload('solution:unjustified', description);
  assert.strictEqual(payload.name, 'solution:unjustified');
  assert.ok(payload.description.length <= 100);
});

test('framing:baked is no longer in the canonical bootstrap set (record #677 rename)', () => {
  assert.ok(!canonicalLabelsFromBootstrapDoc().some(([name]) => name === 'framing:baked'));
});

test('solution:unjustified is exported as a LABELS constant; framing:baked stays as the read-side legacy constant', () => {
  assert.strictEqual(LABELS.SOLUTION_UNJUSTIFIED, 'solution:unjustified');
  assert.strictEqual(LABELS.FRAMING_BAKED, 'framing:baked');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bin-lib/issues/labels.test.js`
Expected: FAIL — `solution:unjustified` row missing from the fence.

- [ ] **Step 3: Edit `skills/_shared/label-bootstrap.md`**

Line 107: replace `  ["framing:baked",     "Framing: this record names a solution that was never traded off"],` with `  ["solution:unjustified", "Solution: named without being traded off against alternatives — add evidence or accept the risk"],`.

Line 42: replace `**current value: \`2\`**` with `**current value: \`3\`**`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/bin-lib/issues/labels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/label-bootstrap.md tests/bin-lib/issues/labels.test.js
git commit -m "Swap framing:baked for solution:unjustified in the canonical label set, bump LABEL_BOOTSTRAP_VERSION 2→3 — refs #677"
```

---

### Task 3: Contract + producer prose — `work-record.md`, specify, help, capture, feedback

**Files:**
- Modify: `skills/_shared/work-record.md:93, 138`
- Modify: `skills/specify/shaping-mode.md:62, 110, 112`
- Modify: `skills/specify/record-creation.md:137, 170, 172, 188, 204`
- Modify: `skills/help/status-scan.md:88, 170`
- Modify: `skills/help/context-flow.md:61, 62`
- Modify: `skills/capture/SKILL.md:256`
- Modify: `skills/feedback/SKILL.md:126`

**Interfaces:**
- Consumes: label spelling `solution:unjustified` and facet key `facets.solutionUnjustified` (Tasks 1-2).
- Produces: nothing mechanical — prose only.

- [ ] **Step 1: `skills/_shared/work-record.md`**

Line 93 — replace the whole row with:

```
| Justification (1) | `solution:unjustified` | Marks a record whose stated problem names a solution that was never traded off; stamped by `/specify` via `/claude-tweaks:challenge`'s `framing-check`, absent means the framing read clean. Non-gating: the remedy is a one-line human call — add evidence to the body (then re-run `/specify #N`, which clears it on an `open` verdict) or accept the risk at grant time. Pre-rename spelling `framing:baked` stays readable forever (`[IL-85]`), never emitted |
```

Line 138 — in the `/specify` (shaper) row, replace `` `framing:baked` (via `/claude-tweaks:challenge`'s `framing-check`) `` with `` `solution:unjustified` (via `/claude-tweaks:challenge`'s `framing-check`) ``.

- [ ] **Step 2: `skills/specify/shaping-mode.md`**

Line 62 — replace every `framing:baked` with `solution:unjustified` and `framing:open` with `solution:justified` (there is still no such counterpart — the sentence stays "there is no … counterpart to fall back to"). The resulting bullet reads:

```
- **Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against the now-shaped body **and** the `## Original request` block preserved above. On `FRAMING: solution-baked`, stamp the `solution:unjustified` label and fold the RATIONALE's named assumptions into the body's `## Gotchas` section as bullets, each carrying its validation status. On `FRAMING: open`, stamp nothing and add nothing — absence is the clean state. If the record already carries `solution:unjustified` (or its pre-rename spelling `framing:baked`) from an earlier shaping pass (a parked-then-re-promoted record whose framing has since been resolved), **remove** it — the same promotion-time cleanup shaping mode already applies to `parked`, below. Never stamp `solution:unjustified` on an `open` verdict, and there is no `solution:justified` counterpart to fall back to. Bootstrap `solution:unjustified` per `_shared/label-bootstrap.md` before the first write. Both the Gotchas bullets and the label add/remove ride the single compose-then-write-once pass below — never a second edit.
```

Line 110 — replace every `framing:baked` with `solution:unjustified` and `framing:open` with `solution:justified`; additionally, in the final sentence, change `add \`--remove-label "framing:baked"\` to the same call` to `add \`--remove-label "solution:unjustified"\` (and \`--remove-label "framing:baked"\` when the pre-rename spelling is what the record carries) to the same call`.

Line 112 — replace `facets.framing` with `facets.solutionUnjustified` (three occurrences) and `framing: true` with `solutionUnjustified: true`.

- [ ] **Step 3: `skills/specify/record-creation.md`**

Lines 137, 170, 172, 188: replace every `framing:baked` with `solution:unjustified`. Line 172: also replace `never passes \`framing\`` with `never passes \`solutionUnjustified\``. Line 204: replace `facets.framing: true` with `facets.solutionUnjustified: true` and `\`facets.framing\` is genuinely absent` with `\`facets.solutionUnjustified\` is genuinely absent`.

- [ ] **Step 4: `skills/help/status-scan.md`**

Line 88: replace `the \`framing:baked\` label` with `the \`solution:unjustified\` label (or its pre-rename spelling \`framing:baked\`)` and `facets.framing === true` with `facets.solutionUnjustified === true`. Line 170: replace `one row per \`framing:baked\` backlog record` with `one row per \`solution:unjustified\` backlog record`.

- [ ] **Step 5: `skills/help/context-flow.md`**

Lines 61 and 62: replace `framing:baked` with `solution:unjustified` (one occurrence each).

- [ ] **Step 6: `skills/capture/SKILL.md` + `skills/feedback/SKILL.md`**

capture line 256: `the same way \`framing:baked\`'s` → `the same way \`solution:unjustified\`'s`. feedback line 126: `(the same posture \`framing:baked\`'s judgment takes)` → `(the same posture \`solution:unjustified\`'s judgment takes)`.

- [ ] **Step 7: Verify the sweep on these files**

Run: `grep -n 'framing:baked\|facets\.framing' skills/_shared/work-record.md skills/specify/shaping-mode.md skills/specify/record-creation.md skills/help/status-scan.md skills/help/context-flow.md skills/capture/SKILL.md skills/feedback/SKILL.md`
Expected: only the deliberate legacy mentions — work-record.md:93 (`Pre-rename spelling \`framing:baked\``), shaping-mode.md:62 and :110 (the "or its pre-rename spelling" clauses), status-scan.md:88 (same). No `facets.framing` anywhere.

- [ ] **Step 8: Run the conformance suite**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task3-test.log 2>&1; echo "exit=$?"`
Then: `grep -E '^# (tests|pass|fail)|^not ok' /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task3-test.log`
Expected: `# fail 0` (skill-prose pins live in `tests/*.test.js`; the full run catches one this plan didn't foresee).

- [ ] **Step 9: Commit**

```bash
git add skills/_shared/work-record.md skills/specify/shaping-mode.md skills/specify/record-creation.md skills/help/status-scan.md skills/help/context-flow.md skills/capture/SKILL.md skills/feedback/SKILL.md
git commit -m "Rename framing:baked → solution:unjustified in the work-record taxonomy and every producer/reader skill instruction — refs #677"
```

---

### Task 4: `/backlog` consumer — refine column, overview un-dormanting, launcher form, docs

**Files:**
- Modify: `skills/backlog/refine-mode.md:266, 268, 313`
- Modify: `skills/backlog/overview-mode.md:250, 347, 354`
- Modify: `skills/backlog/SKILL.md:76`
- Modify: `docs/getting-started.md:13, 62`
- Modify: `docs/skill-graph.md:49, 99, 100, 368`

**Interfaces:**
- Consumes: `facets.solutionUnjustified` (Task 1) — now set by both drivers, so `funnelBuckets`' `needsYou` `kind: 'unjustified'` entries are live.
- Produces: the needs-you launcher form for `kind: 'unjustified'`: `/claude-tweaks:challenge --lens=1 #{N}`.

- [ ] **Step 1: `skills/backlog/refine-mode.md`**

Line 266: replace the column header `| Framing |` with `| Solution |`. Line 268: replace the cell `| baked |` with `| unjustified |`. Line 313: replace the paragraph with:

```
The `Solution` column reads the `solution:unjustified` verdict stamped by `/claude-tweaks:specify` (via `/claude-tweaks:challenge`'s `framing-check`) — under `work-backend: github-issues` the `solution:unjustified` label (or its pre-rename spelling `framing:baked`, still read), under `work-backend: local-files` `facets.solutionUnjustified === true`. Like `Suggested Tier` it is informational only — it rides along with the unified table, is never gated behind its own `AskUserQuestion`, and is never written by this skill. An `unjustified` row is not a reason to withhold a grant; it is a prompt to read the record's `## Gotchas` before approving one — approving is the "accept the risk" half of the label's one-line remedy.
```

- [ ] **Step 2: `skills/backlog/overview-mode.md` lines 237 + 250 — un-dormant the annotation**

Line 237: replace `it is not gated on the unjustified-annotation line below, which remains dormant on its own schedule (see below).` with `it is independent of the unjustified-annotation line below (both are live; see below).`

Line 250: replace the paragraph with:

```
The unjustified-annotation line is likewise one line per matching record, absent entirely when none match — `solutionUnjustified` is live on both drivers since #677 renamed `framing:baked` → `solution:unjustified` (the exclusion line above is independently live for `needs:definition`) — it attaches immediately above the command line it annotates, and applies in ANY paste block a matching record appears in (a `solutionUnjustified` record keeps its primary funnel bucket, so it can surface in Shape or Dispatch alike).
```

- [ ] **Step 3: `skills/backlog/overview-mode.md` line 347 — the launcher bullet**

Replace with:

```
- `kind: 'unjustified'` → `/claude-tweaks:challenge --lens=1 #{N}` (Lens 1, Surface Hidden Assumptions — the human's evidence pass; that mode's own Next Actions route to `/claude-tweaks:specify #{N}`, which re-runs `framing-check` and clears the label on an `open` verdict) with a `#`-comment naming the one-line call (e.g. `# solution:unjustified — one-line evidence-or-accept-risk call; re-run /claude-tweaks:specify #{N} to clear`)
```

- [ ] **Step 4: `skills/backlog/overview-mode.md` line 354 — retire the launcher caveat**

Replace the paragraph (`The same interim caveat covers the \`kind: 'unjustified'\` launcher: …`) with:

```
The `kind: 'unjustified'` launcher carries no interim caveat: `/challenge` has no bare-`#{N}` mode, so the lane emits the `--lens=1 #{N}` form it accepts today (an input `/claude-tweaks:challenge` already resolves the same way `/claude-tweaks:capture` resolves a `#{n}` reference) rather than a command that fails at invocation. A dedicated evidence-or-accept-risk mode for `/challenge`, if ever wanted, is a separate record and would swap the form here.
```

- [ ] **Step 5: `skills/backlog/SKILL.md` line 76**

Replace `/claude-tweaks:specify #N or /claude-tweaks:challenge #N` with `/claude-tweaks:specify #N or /claude-tweaks:challenge --lens=1 #N`.

- [ ] **Step 6: `docs/getting-started.md`**

Line 13: replace `stamps a presence-only \`framing:baked\` label` with `stamps a presence-only \`solution:unjustified\` label`. Line 62: same replacement.

- [ ] **Step 7: `docs/skill-graph.md`**

Line 49: replace `composes a bare-ref \`/claude-tweaks:challenge #{N}\` launcher as a paste line for \`kind: 'unjustified'\` records — dormant until #471 adds that form;` with `composes a \`/claude-tweaks:challenge --lens=1 #{N}\` launcher as a paste line for \`kind: 'unjustified'\` records (live since #677's rename; \`--lens\` is the human-invoked form \`/challenge\` accepts);`.

Line 99: replace `Taxonomy home for the \`framing:baked\` label` with `Taxonomy home for the \`solution:unjustified\` label`.

Line 100: replace `*composes* a bare-ref \`/claude-tweaks:challenge #{N}\` launcher as a paste line for \`kind: 'unjustified'\` records (dormant until #471 adds that form)` with `*composes* a \`/claude-tweaks:challenge --lens=1 #{N}\` launcher as a paste line for \`kind: 'unjustified'\` records (live since #677's rename)`.

Line 368: replace `stamps \`framing:baked\`` with `stamps \`solution:unjustified\``.

- [ ] **Step 8: Verify the sweep**

Run: `grep -n 'framing:baked\|facets\.framing\|dormant\|challenge #' skills/backlog/refine-mode.md skills/backlog/overview-mode.md skills/backlog/SKILL.md docs/getting-started.md docs/skill-graph.md`
Expected, and ONLY these: refine-mode.md:313 (the "or its pre-rename spelling" clause); overview-mode.md:250 (the "renamed `framing:baked` →" clause); overview-mode.md:113 (`dormant repos never render it` — an unrelated sentence about repos with no records, untouched); docs/getting-started.md:104 (`dormant-safe needs-you lane` — still accurate: the lane degrades to nothing when a facet is missing, untouched). No other `dormant`, and no bare `challenge #{N}` / `challenge #N` anywhere (every remaining `challenge` launcher reads `--lens=1 #`).

- [ ] **Step 9: Run the conformance suite**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task4-test.log 2>&1; echo "exit=$?"`
Then: `grep -E '^# (tests|pass|fail)|^not ok' /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task4-test.log`
Expected: `# fail 0`.

- [ ] **Step 10: Commit**

```bash
git add skills/backlog/refine-mode.md skills/backlog/overview-mode.md skills/backlog/SKILL.md docs/getting-started.md docs/skill-graph.md
git commit -m "Un-dormant /backlog overview's solution:unjustified annotation + needs-you launcher (--lens=1 form), rename the refine Solution column, update docs — refs #677"
```

---

### Task 5: Repo-wide acceptance sweep (AC 1)

**Files:**
- Read-only sweep over `bin/`, `skills/`, `docs/getting-started.md`, `docs/skill-graph.md`, `tests/`.

- [ ] **Step 1: Run the AC 1 grep**

Run: `grep -rn -i -E 'framing:baked|facets\.framing|framing: (true|false)|FRAMING_BAKED' bin skills docs/getting-started.md docs/skill-graph.md tests`
Expected hits, and ONLY these classes:
- `bin/lib/issues/record.js` — the `FRAMING_BAKED` constant + its `[IL-85]` comment, and the OR-parse line.
- `bin/lib/issues/local-store.js` — the legacy `framing:` regex line + its `[IL-85]` comment lines.
- `tests/bin-lib/issues/record.test.js`, `local-store.test.js`, `labels.test.js` — the tests exercising the fallbacks / the legacy constant.
- Skill prose "or its pre-rename spelling `framing:baked`" clauses (work-record.md:93, shaping-mode.md:62/110, status-scan.md:88, refine-mode.md:313, overview-mode.md:250).

Any other hit is a miss — fix it in place and re-run.

- [ ] **Step 2: Full suite**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task5-test.log 2>&1; echo "exit=$?"`
Then: `grep -E '^# (tests|pass|fail)' /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/687122f5-4388-4499-a50d-9a2d427bca13/scratchpad/task5-test.log`
Expected: `# fail 0`.

- [ ] **Step 3: Nothing to commit** — this task changes no file unless Step 1 found a miss (then commit that fix with `git commit -m "Sweep a missed framing:baked spelling in {file} — refs #677"`).

---

### Task 6: Live-repo label migration (this repo only, `gh`)

**Files:** none tracked. Outward-facing GitHub writes on `thomasholknielsen/claude-tweaks`. Log every command + outcome to `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-08-16T223043-spec-677/decisions.md` under `## /build`.

- [ ] **Step 1: Ensure the new label exists**

Run: `gh label create "solution:unjustified" --description "Solution: named without being traded off against alternatives — add evidence or accept the risk" --color 5319e7`
Expected: created (or "already exists" — both fine).

- [ ] **Step 2: Add it to the two live carriers**

Run: `gh issue edit 397 --add-label "solution:unjustified"`
Run: `gh issue edit 210 --add-label "solution:unjustified"`
Expected: each prints the issue URL.

- [ ] **Step 3: Verify both carry it BEFORE deleting anything**

Run: `gh issue list --label "solution:unjustified" --state all --json number -q '[.[].number] | sort'`
Expected: `[210,397]`.

- [ ] **Step 4: Delete the old label from the repo**

Run: `gh label delete "framing:baked" --yes`
Expected: deleted.

- [ ] **Step 5: Verify**

Run: `gh label list --search "framing:baked" --json name -q '.[].name'`
Expected: empty output.
Run: `gh label list --search "solution:unjustified" --json name,description -q '.[] | .name + " — " + .description'`
Expected: `solution:unjustified — Solution: named without being traded off against alternatives — add evidence or accept the risk`.

- [ ] **Step 6: Log**

Append one `AUTO {HH:MM:SS} — Task 6 live-repo migration: created solution:unjustified, added to #397 and #210, deleted framing:baked from thomasholknielsen/claude-tweaks. Reversibility: medium (re-create + re-add reverses it).` line under `## /build` in the run's `decisions.md` (single `printf '%s\n' "…" >> path` command).

---

## Self-Review

- **Spec coverage:** Deliverables 1-4 → Task 1; 5 → Task 2; 6-7 → Task 3; 8-9 → Task 4 (overview a/b, docs); 10 (tests) → Tasks 1-2; 11 (migration) → Task 6. AC 1 → Task 5; AC 2-5 → Task 1 tests; AC 6 → Task 2; AC 7 → Task 4; AC 8 → Task 6; AC 9 → Task 5. `docs/getting-started.md` line 104 already says `solution:unjustified` — no edit needed.
- **Placeholder scan:** none of the forbidden tokens appear in this plan's prose (the Global Constraints line spells them out letter-by-letter on purpose).
- **Type consistency:** the facet key is `solutionUnjustified` everywhere (Task 1 drivers/tests, Task 3-4 prose); the frontmatter line is `solution-unjustified:`; the label is `solution:unjustified`; the constants are `LABELS.SOLUTION_UNJUSTIFIED` (new) and `LABELS.FRAMING_BAKED` (kept, legacy). `recordPayload`'s parameter is `solutionUnjustified` (Task 1 Step 6 signature and Step 1 tests agree).
