# Record #724 — Pre-flight Read Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Step 2.8 from loading `manifesto.md` (spec-slug rule cited from `_shared/pipeline-run-dir.md` instead; `flow/SKILL.md` Step 3 says read `manifesto.md` only after Step 2.8 passes), and bring `manifesto.md` + `multi-spec.md` each under 20,480 bytes so a two-file read fits the tool-output cap.

**Architecture:** Prose-only. The spec-slug/ISO-timestamp canonical home already exists in `_shared/pipeline-run-dir.md` (SPEC_SLUG conventions + #721's ISO-timestamp rule) — the remaining work is the `claim-targets.md` citation flip, the read-ordering sentence, and two size trims by extraction: manifesto's Override-semantics table → new `skills/flow/manifesto-overrides.md` (loaded only under `confirm`/`hybrid`), multi-spec's Multi-Spec Summary template → new `skills/flow/multispec-summary.md` (loaded at summary-render time), with pointer lines left behind and `flow/SKILL.md`'s sub-file listing updated.

**Tech Stack:** Markdown skill files; `node --test` conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044553-spec-720-721-722-723-724/spec-724/work/724-spec.md`

## Global Constraints

- **Measured facts (re-measure before editing):** `manifesto.md` = 23,360 bytes (must end < 20,480 → trim ≥ 2,880); `multi-spec.md` = 21,916 (trim ≥ 1,436); `flow/SKILL.md` = 37,979 against the 40,960 per-invocation ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) — its edits must stay net-small.
- **Pins that must survive** (run `node --test tests/flow-run-dir-anchoring.test.js tests/merge-verification-gate-conformance.test.js tests/run-dir-timestamp-utc.test.js tests/flow-claim-preflight.test.js` before and after):
  - manifesto.md: the `Run directory: \`$RUN_ROOT/...{ISO-timestamp}-{spec-slug}/\`` line, the "`/claude-tweaks:dispatch` Step 5 enters a group's worktree *before* dispatching this Manifesto step" sentence, the `write the chosen values to \`$RUN_ROOT/...config.yml\`` line, and its "ISO-timestamp rule" citation (#721) — all in sections that stay.
  - multi-spec.md: the `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-spec-{N1}-{N2}-{N3}/` template and the `bin/preflight-records.js` citation.
  - `merge-when-green` rule: `flow/manifesto.md` is an allowed lever file; the NEW `manifesto-overrides.md` is NOT — since its Merge-verification rows name `merge-when-green`, the new file MUST contain the literal string `pr-first-merge.md` (cite the gate file in its intro line) to pass `tests/merge-verification-gate-conformance.test.js`.
- Preserve the `spec-` prefix convention prose wherever the slug rule is cited (find-disambiguation depends on it).
- The extractions are moves, not rewrites — content lands byte-identical apart from the surrounding intro line; the source files keep one-line pointers.
- Work from the run worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-720-721-722-723-724`.
- Commits reference `refs #724` — never closes/fixes.

---

### Task 1: Citation flip + read-ordering sentence + two extractions, pinned by conformance tests

**Files:**
- Modify: `skills/flow/claim-targets.md` (mint step's `{spec-slug}` sentence)
- Modify: `skills/flow/SKILL.md` (Step 3's manifesto pointer + the sub-file mentions for the two extractions)
- Modify: `skills/flow/manifesto.md` (extract Override-semantics; pointer line)
- Create: `skills/flow/manifesto-overrides.md`
- Modify: `skills/flow/multi-spec.md` (extract the Multi-Spec Summary template; pointer line)
- Create: `skills/flow/multispec-summary.md`
- Test: `tests/run-dir-timestamp-utc.test.js` (append the #724 conformance tests)

**Interfaces:** none beyond the files above (single-task plan).

- [ ] **Step 1: Write the failing conformance tests** — append to `tests/run-dir-timestamp-utc.test.js`:

```js
test('claim-targets spec-slug rule cites pipeline-run-dir.md, not manifesto.md (#724)', () => {
  const content = read('skills/flow/claim-targets.md');
  const slugLines = content.split('\n').filter((l) => l.includes('{spec-slug}') && l.includes('follows'));
  assert.ok(slugLines.length > 0, 'the mint step must still state where the spec-slug rule lives');
  for (const l of slugLines) {
    assert.match(l, /pipeline-run-dir\.md/);
    assert.doesNotMatch(l, /manifesto\.md/);
  }
});

test('flow SKILL.md defers the manifesto.md read until Step 2.8 passes (#724)', () => {
  assert.match(read('skills/flow/SKILL.md'), /read `manifesto\.md`[^.]*after Step 2\.8 passes|after Step 2\.8 passes[^.]*read `manifesto\.md`/i);
});

test('manifesto.md and multi-spec.md each fit the ~20KB read budget (#724)', () => {
  for (const p of ['skills/flow/manifesto.md', 'skills/flow/multi-spec.md']) {
    const bytes = fs.statSync(path.join(REPO_ROOT, p)).size;
    assert.ok(bytes < 20480, `${p} is ${bytes} bytes — must stay under 20480`);
  }
});

test('extracted override table and summary template live in their sub-files (#724)', () => {
  assert.match(read('skills/flow/manifesto-overrides.md'), /Override semantics/);
  assert.match(read('skills/flow/manifesto-overrides.md'), /pr-first-merge\.md/);
  assert.match(read('skills/flow/multispec-summary.md'), /Multi-Spec Pipeline Complete/);
  assert.match(read('skills/flow/manifesto.md'), /manifesto-overrides\.md/);
  assert.match(read('skills/flow/multi-spec.md'), /multispec-summary\.md/);
});
```

- [ ] **Step 2: Run to verify the new tests fail** — `node --test tests/run-dir-timestamp-utc.test.js` (the four #724 tests fail; every earlier test passes).

- [ ] **Step 3: The citation flip.** In `skills/flow/claim-targets.md`'s mint bullet, replace the sentence ``  `{spec-slug}` follows `manifesto.md`'s Path conventions (`spec-{N}` single, dash-joined multi, or a topic slug).`` with ``  `{spec-slug}` follows `_shared/pipeline-run-dir.md`'s SPEC_SLUG conventions (`spec-{N}` single, dash-joined multi with the load-bearing `spec-` prefix, or a topic slug).`` — locate by content; the following ISO-timestamp sentence (#721's) stays.

- [ ] **Step 4: The read-ordering sentence.** In `skills/flow/SKILL.md` Step 3, the pointer paragraph ends "…read `manifesto.md` in this skill's directory." Append one sentence: `Read `manifesto.md` only after Step 2.8 passes — a run stopped at pre-flight never consumes it (#724).`

- [ ] **Step 5: Extract manifesto.md's Override-semantics table.** Move the entire `#### Override semantics (read before overriding)` block (heading + table, through the final `| Design critique | \`off\` | …` row) into new `skills/flow/manifesto-overrides.md`, with a two-line intro: `# Manifesto — Override Semantics` + one sentence stating it is loaded only when the Manifesto runs as an approval gate (`confirm`/`hybrid`) and the user picks Override, and that Merge-verification values are the `_shared/pr-first-merge.md` gate's vocabulary (this citation is load-bearing for the merge-when-green conformance rule). In `manifesto.md`, leave a pointer where the block was: `#### Override semantics` + one line `Read \`manifesto-overrides.md\` in this skill's directory — loaded only under \`confirm\`/\`hybrid\` when the user picks Override; the FYI path never needs it.` Keep the template's fenced block boundaries valid (the extracted table sits INSIDE the big presentation fence — verify: if the Override-semantics block is inside the ```markdown fence, extract it from the fence and adjust the fence content so the remaining template stays coherent; the AskUserQuestion Option 2 description's "see Override semantics below" wording becomes "see Override semantics (manifesto-overrides.md)").

- [ ] **Step 6: Extract multi-spec.md's Multi-Spec Summary template.** Move the `## Multi-Spec Summary` section's fenced template block (from `After all specs complete (or one fails), present a consolidated summary:` through the closing fence and the trailing outcome-column bullet list) into new `skills/flow/multispec-summary.md` with a one-line intro (`# Multi-Spec Summary Template` + loaded at summary-render time by `/flow`'s consolidated close-out). Leave in multi-spec.md: the `## Multi-Spec Summary` heading + one pointer line `Read \`multispec-summary.md\` in this skill's directory when rendering — the template and outcome-column vocabulary live there.`

- [ ] **Step 7: Update `flow/SKILL.md`'s sub-file mention.** Its Multi-Spec section says "…and consolidated Multi-Spec Summary template, read `multi-spec.md` in this skill's directory." — reword to "…and `keep-going` semantics, read `multi-spec.md`; the consolidated Multi-Spec Summary template lives in `multispec-summary.md`." (net bytes ≈ 0; re-measure `wc -c skills/flow/SKILL.md` stays < 40960).

- [ ] **Step 8: Measure and finish the trims.** `wc -c skills/flow/manifesto.md skills/flow/multi-spec.md` — if either is still ≥ 20,480 after the extractions, trim further by tightening (not deleting) the most redundant prose in the same file (e.g. manifesto.md's Recommendation-defaults table rows that restate lever descriptions; multi-spec.md's keep-going example duplication) — never touching the pinned lines in Global Constraints. Record before/after byte counts in your report.

- [ ] **Step 9: Run the full pin set** — `node --test tests/run-dir-timestamp-utc.test.js tests/flow-run-dir-anchoring.test.js tests/merge-verification-gate-conformance.test.js tests/flow-claim-preflight.test.js tests/dispatch-flow-rundir-handoff.test.js` → all green.

- [ ] **Step 10: Commit** —
```bash
git add skills/flow/claim-targets.md skills/flow/SKILL.md skills/flow/manifesto.md skills/flow/manifesto-overrides.md skills/flow/multi-spec.md skills/flow/multispec-summary.md tests/run-dir-timestamp-utc.test.js
git commit -m "Defer manifesto read past Step 2.8; extract override + summary templates under the 20KB read budget — refs #724"
```
