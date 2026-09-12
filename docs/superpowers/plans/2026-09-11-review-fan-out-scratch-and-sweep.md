# Review Fan-Out Scratch Rule + Post-Fan-Out Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `/claude-tweaks:review` dispatch template that grants an agent write access a mandated scratch location (`{ctx-dir}/agent-scratch/{agent-id}`), state the rule once in the Subagent Contract, and add a post-fan-out untracked-file sweep that reports (never deletes) anything a dispatched agent left outside that scratch area.

**Architecture:** Pure prose/doc changes across four skill files, no runtime code. One new paragraph in the shared contract (`subagent-output-contract.md`) states the rule; three dispatch templates (step3-lens-dispatch.md's outer prompt, step3-debate-and-refutation.md's refutation and gap-sweep templates — never the debate-judge template, which writes nothing) each gain a `SCRATCH:` line citing it. A new sweep procedure lives in `step3-lens-dispatch.md` and runs exactly once per review: at the end of that file's own Step 3 for `low`/`medium` tier (the only fan-out those tiers run), or — via a closing pointer added to `step3-debate-and-refutation.md` — after Step 3.5/3.6 for `high`+ tiers. `step3-routing.md`'s existing post-dispatch diff audit gains one sentence naming the sweep as its sibling.

**Tech Stack:** Markdown skill prose, `node --test` prose-conformance tests (regex/substring assertions against live file content — no fixtures).

**Spec:** `.claude-tweaks/pipelines/2026-09-11T174318-record-2022/work/2022-spec.md` (materialized from GitHub issue #2022) — the spec travels with this plan; read both.

## Global Constraints

- The per-lens Calibration + Output template block in `step3-lens-dispatch.md` (the `CALIBRATION (required): ... If no, drop it.` span) must stay byte-identical to `_shared/criteria-review-quality.md`'s fenced Calibration block — no task below touches that span's text.
- `--untracked-files=all` (never bare `git status --porcelain`) for every sweep invocation — the default flag collapses a new directory to one line and would hide a probe script inside a freshly created folder.
- The sweep never deletes anything — report-only. Deletion is the controller's call, never automatic.
- Debate-judge dispatches (Step 3.5's Cross-Lens Debate template) get no `SCRATCH:` line — they write nothing, per the spec's own Deliverables.
- No change to `plugin/bin/build-review-context.js` — the spec's Key Files list it as read-only reference for `{ctx-dir}`'s shape; `resolveDir`'s `mkdir({ recursive: true })` already handles a nested `agent-scratch/{agent-id}` subdirectory with no code change needed.
- **Headroom:** `plugin/skills/_shared/subagent-output-contract.md` is at 40573 of the 40960-byte (40 KB) governed-corpus ceiling — only 387 bytes of headroom. Task 1's Scratch rule paragraph must stay well under that (302 bytes as written); no other task in this plan touches this file, so no split is needed as long as Task 1's addition alone clears the ceiling with margin.

## Fact-check note (read before executing)

The spec's Acceptance Criterion 1 and its Deliverables/Gotchas sections assert an *existing* byte-identical-block test ("its existing pin proves it") and describe Task 2 below as "keeps its byte-identical-block assertion unchanged." **Verified against the actual repo state (2026-09-11): no such test currently exists** — `tests/multi-agent-coordination.test.js` and `tests/subagent-contract-clauses.test.js` were both grepped for `CALIBRATION` and `criteria-review-quality`; zero matches in either. Task 2 below therefore *adds* this pin rather than preserving one — the spec's premise was stale, not a reason to skip writing the test AC1 actually needs.

---

### Task 1: Scratch rule in the Subagent Contract

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md` (Input Discipline section, after the "Do NOT pass" sentence, currently line 31, before the `subagent_type: "fork"` paragraph currently at line 33)
- Test: `tests/subagent-contract-clauses.test.js`

**Interfaces:** N/A — markdown prose only, no code.

- [ ] **Step 1: Write the failing test**

Add to `tests/subagent-contract-clauses.test.js`, after the existing `sectionRegion`/`exemptionRegion` helpers and before the `FILES` loop's first `for` block (or anywhere at top level after `FILES` is defined — place it directly after the last `for (const [name, text] of Object.entries(FILES))` loop's closing brace):

```javascript
test('subagent-output-contract.md states the Scratch rule inside Input Discipline (#2022)', () => {
  const contract = FILES['skills/_shared/subagent-output-contract.md'];
  const section = sectionRegion(contract, '## Input Discipline');
  assert.notStrictEqual(section, '', 'contract must keep its Input Discipline section');
  assert.match(
    section,
    /\*\*Scratch rule\.\*\*/,
    'Input Discipline must state the Scratch rule as a bold-led paragraph, matching the ' +
      'section\'s existing "**A file allowlist...**" / "**Inherited project context...**" style',
  );
  assert.match(
    section,
    /never under the repository tree/,
    'the Scratch rule must say an agent-created verification file never goes under the ' +
      'repository tree',
  );
  assert.match(
    section,
    /deletes what it created/,
    'the Scratch rule must require the agent to delete what it created before its status word',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

The new test's target text doesn't exist in the skill file yet, so probe the skill file directly rather than the full suite (running `node --test tests/subagent-contract-clauses.test.js` here would trivially pass — the new test's assertion isn't wired into the file's control flow until this exact test runs, but the *source text it checks* is what's actually missing; this probe checks that directly):

Run: `node -e "const t=require('fs').readFileSync('plugin/skills/_shared/subagent-output-contract.md','utf8'); process.exit(/\*\*Scratch rule\.\*\*/.test(t) ? 0 : 1)"`
Expected: FAIL — exits 1 (the `**Scratch rule.**` paragraph doesn't exist yet).

- [ ] **Step 3: Write the Scratch rule paragraph**

In `plugin/skills/_shared/subagent-output-contract.md`, insert this new paragraph immediately after the line `Do NOT pass: prior messages, the user's original phrasing, your own findings so far, or "background context for completeness." Each of those compounds across N agents.` and before the line beginning `**`subagent_type: "fork"` is prohibited...`:

```markdown
**Scratch rule.** A file an agent creates to verify its own work (probe script, benchmark, fixture) goes under the scratch directory the prompt names, never under the repository tree. The agent deletes what it created there before its status word; a dispatch granting write access must name that path.
```

Kept deliberately terse (see Global Constraints' headroom note) — this file has 387 bytes of headroom before the 40 KB governed-corpus ceiling; this paragraph is 302 bytes.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/subagent-contract-clauses.test.js`
Expected: PASS — all tests green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/subagent-output-contract.md tests/subagent-contract-clauses.test.js
git commit -m "Add Scratch rule to the Subagent Contract's Input Discipline section"
```

---

### Task 2: Pre-dispatch listing capture, SCRATCH line, and the sweep procedure in step3-lens-dispatch.md

**Files:**
- Modify: `plugin/skills/review/step3-lens-dispatch.md` (three insertion points — see Step 3 below)
- Test: `tests/multi-agent-coordination.test.js`

**Interfaces:** N/A — markdown prose only. `{ctx-dir}` is the existing scratch-dir token this file already threads through (`build-review-context.js build`'s printed `dir` field); this task adds no new script output, only new prose consuming that same token.

- [ ] **Step 1: Write the failing tests**

Add to `tests/multi-agent-coordination.test.js`, after the last existing `test(...)` block (end of file):

```javascript
test('the CALIBRATION filter is byte-identical between criteria-review-quality.md and step3-lens-dispatch.md (#2022 AC1)', () => {
  const CRITERIA = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'criteria-review-quality.md'),
    'utf8',
  );
  const START = 'Only flag issues where:';
  const END = 'If no, drop it.';
  function extract(text, label) {
    const start = text.indexOf(START);
    assert.notStrictEqual(start, -1, `${label} must contain "${START}"`);
    const endIdx = text.indexOf(END, start);
    assert.notStrictEqual(endIdx, -1, `${label} must contain "${END}" after "${START}"`);
    return text.slice(start, endIdx + END.length);
  }
  const canonical = extract(CRITERIA, 'criteria-review-quality.md');
  const dispatched = extract(REVIEW_SKILL, 'step3-lens-dispatch.md (via REVIEW_SKILL)');
  assert.strictEqual(
    dispatched,
    canonical,
    'the Calibration filter reproduced in step3-lens-dispatch.md\'s dispatch template must stay ' +
      'byte-identical to the canonical fragment in criteria-review-quality.md',
  );
});

test('step3-lens-dispatch.md gives each dispatched lens agent a scratch path (#2022)', () => {
  assert.match(
    REVIEW_SKILL,
    /SCRATCH: \{ctx-dir\}\/agent-scratch\/\{agent-id\}/,
    'step3-lens-dispatch.md must give each dispatched lens agent a ' +
      'SCRATCH: {ctx-dir}/agent-scratch/{agent-id} line, minted per dispatch',
  );
  const contractRef = REVIEW_SKILL.slice(
    REVIEW_SKILL.indexOf('SCRATCH: {ctx-dir}/agent-scratch/{agent-id}'),
  );
  assert.match(
    contractRef.slice(0, 400),
    /Scratch rule/,
    'the SCRATCH line must cite the Subagent Contract\'s Scratch rule by name',
  );
});

test('step3-lens-dispatch.md defines the post-fan-out untracked-file sweep (#2022)', () => {
  assert.match(
    REVIEW_SKILL,
    /## Post-fan-out untracked-file sweep/,
    'step3-lens-dispatch.md must define the post-fan-out untracked-file sweep section',
  );
  assert.match(
    REVIEW_SKILL,
    /git status --porcelain --untracked-files=all/,
    'the sweep must use --untracked-files=all, not bare --porcelain, so a freshly created ' +
      'directory\'s contents are not collapsed to one line',
  );
  assert.match(
    REVIEW_SKILL,
    decisionLogPattern(REVIEW_SKILL, ['Review fan-out left', 'untracked file']),
    'the sweep\'s STAGED log line must match the documented shape',
  );
});

test('step3-lens-dispatch.md captures a pre-dispatch listing before Step 3\'s first dispatch (#2022)', () => {
  const preDispatchIdx = REVIEW_SKILL.indexOf('pre-dispatch-status.txt');
  const firstDispatchIdx = REVIEW_SKILL.indexOf('Reproduction dispatch (Mode 1');
  assert.notStrictEqual(preDispatchIdx, -1, 'must capture a pre-dispatch listing file');
  assert.ok(
    preDispatchIdx < firstDispatchIdx,
    'the pre-dispatch listing must be captured before the first lens dispatch, not after',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Three of the four new tests check text that step3-lens-dispatch.md doesn't contain yet — probe the skill file directly (the full-suite run would trivially pass, since the new assertions aren't wired in until this exact test runs, but the source text they check is what's actually missing):

Run: `node -e "const t=require('fs').readFileSync('plugin/skills/review/step3-lens-dispatch.md','utf8'); const ok = /SCRATCH: \{ctx-dir\}\/agent-scratch\/\{agent-id\}/.test(t) && /## Post-fan-out untracked-file sweep/.test(t) && /pre-dispatch-status\.txt/.test(t); process.exit(ok ? 0 : 1)"`
Expected: FAIL — exits 1 (none of the three markers exist yet). The CALIBRATION byte-identity test is a regression pin on already-correct state (see the plan's Fact-check note) — it passes today and stays green throughout; confirm with `node --test tests/multi-agent-coordination.test.js` that the pre-existing 41 tests are still all green before continuing.

- [ ] **Step 3: Edit step3-lens-dispatch.md**

Three insertions, all inside the existing `> **Parallel execution — assemble the shared context on disk...` blockquote block (lines 38-51 currently) or immediately after it:

**3a. Pre-dispatch listing capture** — insert a new blockquote paragraph immediately after the paragraph ending `...the full diff sits at the top of the same bundle, so the agent still sees that file's change either way.` (currently the paragraph right after the `build-review-context.js` bash block) and before the `**`Path:Line` must be file-native...` paragraph:

```markdown
> **Pre-dispatch listing (scratch-sweep baseline).** Immediately after minting `{ctx-dir}` above and before dispatching any lens agent (reproduction pair or low-tier single read), capture `git status --porcelain --untracked-files=all > {ctx-dir}/pre-dispatch-status.txt`. This is the baseline the post-fan-out sweep (below) diffs against — capture it exactly once per review, here, regardless of tier.
```

**3b. SCRATCH line for the outer prompt** — insert a new blockquote paragraph immediately after the `**`Path:Line` must be file-native, never bundle-relative.**` paragraph and before the `Do **not** `Read` the changed files...` paragraph:

```markdown
> **Scratch path (per dispatch).** Alongside the scope and `Path:Line` instructions above, give each dispatched lens agent a `SCRATCH: {ctx-dir}/agent-scratch/{agent-id}` line — `{agent-id}` a short per-dispatch identifier (e.g. `3b-a`, `3b-b` for lens 3b's reproduction pair) so sibling agents in the same fan-out never collide — and cite `_shared/subagent-output-contract.md`'s Scratch rule: any probe script or fixture the agent creates to verify its own work goes there, never in the repository tree, and is deleted before the status word.
```

**3c. The sweep procedure** — insert a new `##` section immediately after the `## Per-lens Calibration + Output template (dispatch contract)` section's closing paragraph (`Pass diff scope, not diff text. ... would pull the full diff back into main-thread context to compose them.`) and before `## Lens definitions (3a-3f)`:

```markdown
## Post-fan-out untracked-file sweep

Run once per review, comparing against the pre-dispatch listing captured above (`{ctx-dir}/pre-dispatch-status.txt`) — never once per lens or per agent. At **`low`/`medium`** tier, this file's own Step 3 reproduction/single-read dispatch is the only fan-out this review runs (`step3-debate-and-refutation.md` never loads at these tiers) — run the sweep now, before returning to Step 3 Routing. At **`high` and above**, skip running it here — `step3-debate-and-refutation.md`'s own closing section runs it once, after Step 3.5/3.6, using this same pre-dispatch listing.

Procedure: `git status --porcelain --untracked-files=all`, diffed against the captured pre-dispatch listing. Any new untracked path outside `{ctx-dir}` is:
- reported by name in this step's summary,
- logged to `decisions.md`: `STAGED {HH:MM:SS} — Review fan-out left {n} untracked file(s): {paths}. Not deleted. Reversibility: n/a.`,
- excluded from evidence a reviewer trusts — a finding whose only supporting evidence is one of these paths is downgraded to `unconfirmed`, with that reason noted in its entry.

Never delete anything here — report only. A path under `{ctx-dir}` is a sibling agent's or the skill's own scratch output, not a leftover, and is excluded from the diff. A reviewer cannot distinguish its own dispatched agents' leftovers from a concurrent implementer's in-flight untracked work in the same worktree, so the controller — not this sweep — decides what happens to a reported file.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/multi-agent-coordination.test.js`
Expected: PASS — all tests green, including the four from Step 1.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/review/step3-lens-dispatch.md tests/multi-agent-coordination.test.js
git commit -m "Add pre-dispatch listing capture, scratch path, and post-fan-out sweep to step3-lens-dispatch"
```

---

### Task 3: SCRATCH lines in refutation and gap-sweep templates, and the high-tier sweep pointer in step3-debate-and-refutation.md

**Files:**
- Modify: `plugin/skills/review/step3-debate-and-refutation.md` (three insertion points — see Step 3 below)
- Test: `tests/multi-agent-coordination.test.js`

**Interfaces:** N/A — markdown prose only.

- [ ] **Step 1: Write the failing tests**

Append to `tests/multi-agent-coordination.test.js`:

```javascript
test('the refutation template gains a SCRATCH line, the debate template does not (#2022)', () => {
  const refutationStart = REVIEW_SKILL.indexOf('You are trying to FALSIFY this finding');
  assert.notStrictEqual(refutationStart, -1, 'refutation template must exist');
  const refutationEnd = REVIEW_SKILL.indexOf('[Use: Capable — refutation agent', refutationStart);
  const refutationBlock = REVIEW_SKILL.slice(refutationStart, refutationEnd);
  assert.match(
    refutationBlock,
    /SCRATCH: \{ctx-dir\}\/agent-scratch\//,
    'the refutation template must carry a SCRATCH: {ctx-dir}/agent-scratch/... line before its [Use: ...] tag',
  );

  const debateStart = REVIEW_SKILL.indexOf('Two lenses disagreed on this region');
  assert.notStrictEqual(debateStart, -1, 'debate template must exist');
  const debateEnd = REVIEW_SKILL.indexOf('[Use: Frontier — debate agent', debateStart);
  const debateBlock = REVIEW_SKILL.slice(debateStart, debateEnd);
  assert.doesNotMatch(
    debateBlock,
    /SCRATCH:/,
    'debate judges write nothing and must get no SCRATCH line (spec Deliverables)',
  );
});

test('the gap-sweep template gains a SCRATCH line (#2022)', () => {
  const gapSweepStart = REVIEW_SKILL.indexOf('You are a fresh-eyes reviewer');
  assert.notStrictEqual(gapSweepStart, -1, 'gap-sweep template must exist');
  const gapSweepEnd = REVIEW_SKILL.indexOf('[Use: Frontier — gap-sweep agent', gapSweepStart);
  const gapSweepBlock = REVIEW_SKILL.slice(gapSweepStart, gapSweepEnd);
  assert.match(
    gapSweepBlock,
    /SCRATCH: \{ctx-dir\}\/agent-scratch\//,
    'the gap-sweep template must carry a SCRATCH: {ctx-dir}/agent-scratch/... line before its [Use: ...] tag',
  );
});

test('step3-debate-and-refutation.md runs the post-fan-out sweep after Step 3.5/3.6 (#2022)', () => {
  const gapSweepSection = REVIEW_SKILL.slice(REVIEW_SKILL.indexOf('## Step 3.6: Gap-Sweep'));
  assert.match(
    gapSweepSection,
    /post-fan-out (untracked-file )?sweep/i,
    'step3-debate-and-refutation.md must point at step3-lens-dispatch.md\'s post-fan-out sweep ' +
      'as this run\'s closing step, after its own Step 3.5/3.6 dispatches',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Probe step3-debate-and-refutation.md directly (same reasoning as Task 2's Step 2 — the full-suite run would trivially pass until this test's own code lands in the file):

Run: `node -e "const t=require('fs').readFileSync('plugin/skills/review/step3-debate-and-refutation.md','utf8'); const ok = /SCRATCH: \{ctx-dir\}\/agent-scratch\//.test(t) && /post-fan-out (untracked-file )?sweep/i.test(t); process.exit(ok ? 0 : 1)"`
Expected: FAIL — exits 1 (no `SCRATCH:` line in either template yet, no sweep pointer at the end of the file).

- [ ] **Step 3: Edit step3-debate-and-refutation.md**

**3a. Refutation template** — insert a new line inside the fenced template block (the one starting `You are trying to FALSIFY this finding...`), between `Cached evidence: {evidence text}` and the blank line before `[Use: Capable — refutation agent...`:

```
Cached evidence: {evidence text}

SCRATCH: {ctx-dir}/agent-scratch/{agent-id} — any probe script or fixture you create to verify this finding goes there (never in the repository tree) and must be deleted before your status word (`_shared/subagent-output-contract.md`'s Scratch rule).

[Use: Capable — refutation agent. Independent run; fresh file read, not the
lens's original context. Resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" capable` (contract § Model Selection).]
```

**3b. Gap-sweep template** — insert a new line inside the fenced template block (the one starting `You are a fresh-eyes reviewer...`), between the `[... CALIBRATION + OUTPUT FORMAT block ...]` placeholder line and the blank line before `[Use: Frontier — gap-sweep agent...`:

```
[... CALIBRATION + OUTPUT FORMAT block, byte-identical to the per-lens dispatch contract
in step3-lens-dispatch.md ...]

SCRATCH: {ctx-dir}/agent-scratch/gap-sweep — any probe script or fixture you create to verify a finding goes there (never in the repository tree) and must be deleted before your status word (`_shared/subagent-output-contract.md`'s Scratch rule).

[Use: Frontier — gap-sweep agent. Independent run; single dispatch, not a
reproduction pair. Degrades per the resolver's preconditions (contract § Model Selection).]
```

**3c. Closing sweep pointer** — insert a new `##` section at the very end of the file, after the last paragraph of Step 3.6 (`...Only a genuine DONE/DONE_WITH_CONCERNS response with literal "No findings." text logs nothing further, per the existing per-lens convention — no decision-log entry is needed for an actually-completed zero-findings pass.`):

```markdown
## Post-fan-out sweep (this file's own closing step)

`step3-lens-dispatch.md` defines the post-fan-out untracked-file sweep procedure and captures the pre-dispatch baseline (`{ctx-dir}/pre-dispatch-status.txt`) before Step 3's first dispatch; that file's own sweep only runs itself at `low`/`medium` tier, since this file never loads there. At every tier that loads this file (`high` and above), run that sweep exactly once — here, after Cross-Lens Debate at `high` (this file's Step 3.5/3.6 refutation and gap-sweep never run at that tier), or after Gap-Sweep (Step 3.6) at `xhigh`/`max` — before proceeding to Step 3 Routing.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/multi-agent-coordination.test.js`
Expected: PASS — all tests green, including the three from Step 1 and the four from Task 2.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/review/step3-debate-and-refutation.md tests/multi-agent-coordination.test.js
git commit -m "Add SCRATCH lines to refutation/gap-sweep templates, point Step 3.6 at the post-fan-out sweep"
```

---

### Task 4: Sibling-sentence in step3-routing.md's post-dispatch diff audit

**Files:**
- Modify: `plugin/skills/review/step3-routing.md` (the "Post-dispatch diff audit (mandatory)" paragraph, currently line 127)
- Test: `tests/multi-agent-coordination.test.js`

**Interfaces:** N/A — markdown prose only.

- [ ] **Step 1: Write the failing test**

Append to `tests/multi-agent-coordination.test.js` (note: `step3-routing.md` is not part of `REVIEW_SKILL`'s concatenation — this test reads it directly, matching how `REVIEW_SKILL` itself is built at the top of the file):

```javascript
test('step3-routing.md\'s post-dispatch diff audit names the post-fan-out sweep as its sibling (#2022)', () => {
  const routing = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'review', 'step3-routing.md'),
    'utf8',
  );
  const auditStart = routing.indexOf('**Post-dispatch diff audit (mandatory).**');
  assert.notStrictEqual(auditStart, -1, 'step3-routing.md must keep its post-dispatch diff audit paragraph');
  const auditParagraph = routing.slice(auditStart, routing.indexOf('\n\n', auditStart));
  assert.match(
    auditParagraph,
    /post-fan-out (untracked-file )?sweep/i,
    'the post-dispatch diff audit paragraph must name the post-fan-out sweep ' +
      '(step3-lens-dispatch.md) as its sibling — one rule applied at two points',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Probe step3-routing.md directly (same reasoning as Tasks 2/3's Step 2):

Run: `node -e "const t=require('fs').readFileSync('plugin/skills/review/step3-routing.md','utf8'); const i=t.indexOf('**Post-dispatch diff audit (mandatory).**'); const p=t.slice(i, t.indexOf('\n\n', i)); process.exit(/post-fan-out (untracked-file )?sweep/i.test(p) ? 0 : 1)"`
Expected: FAIL — exits 1 (no mention of the sweep in that paragraph yet).

- [ ] **Step 3: Edit step3-routing.md**

Append this sentence to the end of the `**Post-dispatch diff audit (mandatory).**` paragraph (after `...its bullets for cross-file conflicts and re-run \`/claude-tweaks:test\`.`):

```markdown
This audit's sibling runs earlier in the same review — the post-fan-out untracked-file sweep (`step3-lens-dispatch.md`) checks the same class of leftover after the lens/refutation/gap-sweep fan-out, before this routing step ever loads; both apply one rule (report untracked leftovers, never silently trust them) at the two points in the pipeline where dispatched agents write files.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/multi-agent-coordination.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full targeted suite**

Run: `node --test tests/multi-agent-coordination.test.js tests/subagent-contract-clauses.test.js`
Expected: PASS — both files fully green (this plan's complete test surface).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/review/step3-routing.md tests/multi-agent-coordination.test.js
git commit -m "Point step3-routing's post-dispatch diff audit at the post-fan-out sweep as its sibling"
```

---

## Self-Review Notes (completed during planning)

1. **Spec coverage:** Deliverable 1 (Scratch rule) → Task 1. Deliverable 2 (three templates gain SCRATCH, debate gets none) → Tasks 2 (lens outer prompt) + 3 (refutation, gap-sweep, debate exclusion). Deliverable 3 (post-fan-out sweep + pre-dispatch listing) → Task 2 (procedure + low/medium invocation) + Task 3 (high+ invocation pointer). Deliverable 4 (step3-routing sibling sentence) → Task 4. Deliverable 5 (tests) → the test steps embedded in each task above; AC1's byte-identical-block pin → Task 2's first new test (see Fact-check note).
2. **Placeholder scan:** none — every step shows the actual markdown text to insert, not a description of it.
3. **Consistency check:** `{ctx-dir}/agent-scratch/{agent-id}` is the one scratch-path shape used everywhere (lens outer prompt, refutation, gap-sweep); `{agent-id}` is illustrated concretely (`3b-a`/`3b-b`) only in the lens-dispatch prose, where multiple same-lens agents could otherwise collide — refutation and gap-sweep are single-agent-per-candidate dispatches, so no collision-illustration is needed there. `STAGED {HH:MM:SS} — Review fan-out left {n} untracked file(s): {paths}. Not deleted. Reversibility: n/a.` is the exact line shape from the spec's own Deliverable 3, reused verbatim in Task 2's sweep procedure and pinned by Task 2's `decisionLogPattern` test.
