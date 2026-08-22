# Specify Decomposition Collapse Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/specify`'s decomposition mode from creating parent records that do no tracking work — a decomposition yielding 1 work unit collapses entirely (no parent), 2 independent units collapse to two cross-linked records with no parent, 2 dependency-ordered units and every 3+-unit decomposition keep a parent unchanged.

**Architecture:** A new routing step inserted into `decomposition-mode.md` right after Step 2's Implicit Dependency Detection (which already computes the two signals the collapse test needs) and before Step 2.5. Everything downstream (record creation, linking, red-team, self-review, Step 7 deletion, Step 9 summary) already operates per-record — it needs only conditional prose wherever it references "the parent," never new machinery.

**Tech Stack:** Markdown skill files (`plugin/skills/specify/*.md`), `node --test` conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T084440-spec-1261-1262-1263-1264/spec-1263/work/1263-spec.md` (record #1263).

## Global Constraints

1. Do not touch the parent-record guard in `specify/SKILL.md` (Resolve-the-input case 1's tier-1/tier-2 detection) — it protects **existing** parents from an accidental re-decomposition and is explicitly out of scope; existing conformance tests pinning it must stay green, untouched.
2. `--granularity` never overrides collapse — the flag tunes Step 2's sizing targets only. State this explicitly wherever `--granularity` is defined (`SKILL.md`'s Input section), not only in the collapse step's own text.
3. The dependency-ordered test at 2 units reads exactly two existing signals from Step 2's Implicit Dependency Detection: a `Blocked by #N` flag, or an internal-conflict row (the Overlap-Type table's "grouped with another new work unit" case). It never reads the adjacent Ceiling-headroom flag (a byte-budget annotation from the same grouping pass, unrelated to dependency-ness), and it adds no new detection logic — cite the existing subsection, do not re-derive.
4. Ambiguity at 2 units (dependency-ness cannot be determined) resolves toward **keeping the parent** — never toward collapse.
5. The strangler-fig `early-production` two-sub-issue shape (flag-then-remove) is explicitly named as parent-keeping in the collapse step's own text — not merely implied by the dependency-ordered branch.
6. Fingerprint semantics: every produced record keeps its `{design-doc-slug}:{unit-slug}` fingerprint exactly as today. A collapsed run never mints a `{design-doc-slug}:parent` fingerprint. A crashed run's resume must re-derive the same collapse decision from the same unit list (Step 2 is deterministic given the same design doc and open-record set) and find already-created records by unit fingerprint alone — never by checking for a parent checkpoint.
7. Every touched file stays ≤ 40,960 bytes (`tests/bin-lib/skill-audit/context-cost.test.js`). `record-creation.md` starts at 38,357 bytes (~2.6KB headroom) — prefer editing existing sentences over adding parallel paragraphs, per the spec's own Gotchas; measure `wc -c` after every edit to this file.
8. The "Superseded by decomposition:" closing wording is preserved in every branch that actually closes an origin record (parent-kept, and 2-unit-collapse-with-origin) — only the 1-unit-collapse-with-origin branch does NOT close the origin (it shapes it in place instead).

---

### Task 1: `decomposition-mode.md` — the collapse-decision step

**Files:**
- Modify: `plugin/skills/specify/decomposition-mode.md` (insert a new step between the existing Step 2 content, which ends at the "Why this matters" blockquote right after the Implicit Dependency Detection subsection, and the existing `## Step 2.5: Design Pre-Steps (frontend specs only)` heading)

**Interfaces:**
- Consumes: nothing from a later task.
- Produces: the collapse verdict (`parent kept` / `2-unit collapse` / `1-unit collapse`) that Task 2 (Step 9's origin-closure and summary) and Task 3 (`record-creation.md`'s conditional Parent record section) both read as "the collapse decision made in Step 2's new collapse step" — do not redefine it differently in either later task.

- [ ] **Step 1: Measure current size**

```bash
wc -c plugin/skills/specify/decomposition-mode.md
```

- [ ] **Step 2: Locate the exact insertion point**

```bash
grep -n "^## Step 2.5: Design Pre-Steps" plugin/skills/specify/decomposition-mode.md
```

Confirm the line immediately before it is the blockquote ending "...leads to merge conflicts and duplicated work during concurrent builds." (the end of the Implicit Dependency Detection subsection's "Why this matters" note).

- [ ] **Step 3: Insert the new collapse step**

Insert this new step, as its own `##`-level heading, immediately before `## Step 2.5: Design Pre-Steps (frontend specs only)` (after a blank line following the existing "Why this matters" blockquote):

```markdown
## Step 2.6: Collapse Decision

With Step 2's work-unit list final and Implicit Dependency Detection's overlap/dependency signals computed, decide whether this decomposition needs a parent record at all. `--granularity` never overrides this decision — that flag tunes Step 2's sizing targets only (see `SKILL.md`'s Input section).

**1 work unit — always collapses.** No parent is created. The single unit becomes a standalone ready record (or, when `$ORIGIN_RECORD_NUM` is set, the origin record is shaped in place — see Step 9).

**2 work units — collapses only when independent.** Read Implicit Dependency Detection's own outputs for these two units (never re-derive dependency-ness from prose, and never read the adjacent Ceiling-headroom flag, which is a byte-budget annotation from the same grouping pass, not a dependency signal):

- A `Blocked by #N` flag between the two units (from Overlap Analysis or the Implicit Dependency Detection table) → **dependency-ordered — keep the parent.**
- An internal-conflict row (Overlap-Type table: "grouped with another new work unit from this decomposition") between the two units → **dependency-ordered — keep the parent.**
- The strangler-fig `early-production` two-sub-issue shape (Decomposition Heuristics table: implement-behind-a-flag, then remove-the-old-path) → **always parent-keeping** — the parent tracks the flag-then-remove sequence; this shape never collapses regardless of the two signals above.
- Neither signal present, and not the strangler-fig shape → **independent — collapses.** No parent is created; the two units become two ordinary ready records, cross-linked via a `Related: #N` body line on each (see `record-creation.md`'s Linking section for the exact format).
- **Ambiguous** (a signal exists but this step cannot confidently classify it as dependency-ordering the two units) → **keep the parent.** Ambiguity resolves toward tracking, never toward collapse.

**3+ work units — never collapses.** Unchanged: a parent is always created, exactly as today. The strangler-fig `established` three-sub-issue shape is one instance of this — it is 3+ units by construction and was never in scope for collapse.

Carry this decision forward as this run's collapse verdict — `parent kept` / `2-unit collapse` / `1-unit collapse` — for Step 3's record creation (`record-creation.md`), Step 9's origin-closure and summary (below), and every other step that references "the parent."
```

- [ ] **Step 4: Verify the ceiling**

```bash
wc -c plugin/skills/specify/decomposition-mode.md
```

Confirm ≤ 40,960.

- [ ] **Step 5: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

(This task's own new conformance tests are written in Task 6 — do not write tests here.)

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/decomposition-mode.md
git commit -m "Add the collapse-decision step to /specify's decomposition mode (Step 2.6)"
```

---

### Task 2: `decomposition-mode.md` — Step 9 origin-closure rewrite and summary outcome line

**Files:**
- Modify: `plugin/skills/specify/decomposition-mode.md` (Step 9's `needs:definition` origin closure paragraph; Step 9's summary template; Step 3's opening "parent-first" sentence)

**Interfaces:**
- Consumes: Task 1's collapse verdict (`parent kept` / `2-unit collapse` / `1-unit collapse`).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current size**

```bash
wc -c plugin/skills/specify/decomposition-mode.md
```

- [ ] **Step 2: Locate Step 9's origin-closure paragraph**

```bash
grep -n "unconditionally produces exactly one parent record every run" plugin/skills/specify/decomposition-mode.md
```

This is inside the paragraph beginning "**`needs:definition` origin closure.**"

- [ ] **Step 3: Rewrite the origin-closure paragraph — all three branches**

Replace the full paragraph (from "**`needs:definition` origin closure.**" through "...so there is never a produced-sub-issues-with-no-parent case this needs to special-case.") with:

```markdown
**`needs:definition` origin closure.** When `$ORIGIN_RECORD_NUM` is set (this run was reached via the `needs:definition` redirect — `specify/SKILL.md`'s Resolve-the-input case 1), what happens to the origin record depends on this run's collapse decision (Step 2.6):

- **Parent kept, or 2-unit collapse** — every unit this run produced is a record distinct from the origin. Close the origin now, using the same number list the Work Units Created table above already assembled: post a comment on `$ORIGIN_RECORD_NUM` in that table's own list format, "Superseded by decomposition: #{ref1}, #{ref2}, ..." (`work-backend: github-issues`: `gh issue comment "$ORIGIN_RECORD_NUM" --body "..."` then `gh issue close "$ORIGIN_RECORD_NUM"`; `local-files`: append the note to the record body and mark it closed via `local-store.js`). This is unchanged from before collapse existed, for the parent-kept case; the 2-unit-collapse case closes the origin the identical way, just naming two ordinary records instead of a parent plus one leaf.
- **1-unit collapse** — the single work unit and the origin are the same thing: there is no second record to point the origin at. Shape the origin record in place instead of closing it: write the unit's spec-shaped body onto `$ORIGIN_RECORD_NUM` (the same body composition Step 3 would otherwise use for a fresh sub-issue) and stamp its `{design-doc-slug}:{unit-slug}` fingerprint into it. The origin is never closed in this branch — it lives on, now shaped. A crashed-and-resumed run finds this fingerprint on `$ORIGIN_RECORD_NUM` itself via the ordinary Idempotency map lookup (`record-creation.md`), exactly as it would find any other unit's fingerprint on a fresh record.

When `$ORIGIN_RECORD_NUM` is unset (every other entry path — cases 2-5), this whole paragraph is a no-op, unchanged from before.
```

- [ ] **Step 4: Add the outcome-naming line to the Step 9 summary template**

Locate the summary template (the fenced ` ```markdown ` block starting `## Specification: {design doc topic}`). Immediately after the `### Work Units Created` table and before `### Existing Records Modified`, add:

```markdown
**Collapse outcome:** {parent kept | collapsed: 2 units, independent | collapsed: 1 unit} — {one-line reason, e.g. "no `Blocked by` or internal-conflict signal between the two units" / "single work unit, no parent needed"}
```

State in the surrounding prose (just above the template) that this line renders in every decomposition run, collapse taken or not — not only when a parent was skipped.

- [ ] **Step 5: Update Step 3's opening "parent-first" sentence to be collapse-aware**

```bash
grep -n "Records are created \*\*parent-first\*\*" plugin/skills/specify/decomposition-mode.md
```

Replace "Records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it, using deterministic fingerprints for idempotent resume across partial or concurrent runs." with: "When Step 2.6 kept the parent, records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it. Under collapse (Step 2.6), there is no parent — every produced record is created independently, using deterministic fingerprints for idempotent resume across partial or concurrent runs exactly as today."

- [ ] **Step 6: Verify the ceiling**

```bash
wc -c plugin/skills/specify/decomposition-mode.md
```

- [ ] **Step 7: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/specify/decomposition-mode.md
git commit -m "Rewrite Step 9's origin-closure and summary for collapse; make Step 3's parent-first opening conditional"
```

---

### Task 3: `record-creation.md` — conditional Parent record section, Sub-issue Parent line, and cross-link format

**Files:**
- Modify: `plugin/skills/specify/record-creation.md` (Step 3's opening sentence; the `### Parent record` section header/opening; the Sub-issues section's `Parent: #$PARENT_NUM` body-prefix sentence; the Idempotency section's parent-fingerprint note; Step 4's Linking section — new `Related:` cross-link format)

**Interfaces:**
- Consumes: Task 1's collapse verdict.
- Produces: nothing consumed by a later task.

**Ceiling-critical file (~2.6KB headroom at plan-authoring time) — prefer editing existing sentences over adding parallel paragraphs, per the spec's own Gotchas.**

- [ ] **Step 1: Measure current size**

```bash
wc -c plugin/skills/specify/record-creation.md
```

- [ ] **Step 2: Make Step 3's opening sentence collapse-aware**

```bash
grep -n "Records are created \*\*parent-first\*\*: the parent's number has to exist" plugin/skills/specify/record-creation.md
```

Replace "Records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it. Every body is composed fully in memory before any write call — compose-then-write-once, the same discipline Shaping mode uses." with: "When `decomposition-mode.md`'s Step 2.6 kept the parent, records are created **parent-first**: the parent's number has to exist before any sub-issue can link to it. Under collapse, there is no parent — every produced record is created independently, in any order. Every body is composed fully in memory before any write call — compose-then-write-once, the same discipline Shaping mode uses."

- [ ] **Step 3: Make the `### Parent record` section's opening sentence conditional**

```bash
grep -n "^### Parent record" plugin/skills/specify/record-creation.md
```

Replace "One parent per decomposition run (or per `phase-N`, when scoped — see Step 7's phase table)." with: "Skip this whole section entirely when Step 2.6 (`decomposition-mode.md`) decided to collapse — no parent record, no `{design-doc-slug}:parent` fingerprint is ever minted, and Step 3 proceeds straight to Sub-issues below with no `$PARENT_NUM`/`$PARENT_ID` for them to link to. Otherwise, exactly one parent per decomposition run (or per `phase-N`, when scoped — see Step 7's phase table), unchanged from before collapse existed."

- [ ] **Step 4: Make the Sub-issues section's `Parent:` body-prefix line conditional**

```bash
grep -n "also prefix \`Parent: #\\\$PARENT_NUM\`" plugin/skills/specify/record-creation.md
```

In the Sub-issues section's Body paragraph, replace "Under `work-backend: github-issues` + `work-links: body-text`, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a sub-issue's own parent (`spec-template.md`)." with: "Under `work-backend: github-issues` + `work-links: body-text`, and only when Step 2.6 kept the parent, also prefix `Parent: #$PARENT_NUM` — already known at this point (Parent record, above, runs first) and the only combination where nothing else records a sub-issue's own parent (`spec-template.md`). Under collapse, omit this line entirely — there is no `$PARENT_NUM` to reference."

- [ ] **Step 5: Add the no-parent-fingerprint note to the Idempotency section**

```bash
grep -n "A unit slug must never be the literal string \`parent\`" plugin/skills/specify/record-creation.md
```

Append to that same sentence (still inside the Idempotency subsection's opening paragraph): " Under collapse (`decomposition-mode.md` Step 2.6), no `{design-doc-slug}:parent` fingerprint is ever minted — a resumed collapsed run's fingerprint→number map has only unit fingerprints to match against, and finds every already-created record that way; it never checks for a parent checkpoint."

- [ ] **Step 6: Add the `Related:` cross-link format to Step 4's Linking section**

```bash
grep -n "^### Linking" plugin/skills/specify/record-creation.md
```

Immediately after the `### Linking` heading's own opening sentence (before its existing driver-branch content), insert:

```markdown
**Independent 2-unit collapse (Step 2.6, `decomposition-mode.md`) — `Related:` cross-links, not parent/child.** When Step 2.6 collapsed two independent units, there is no parent to link either sub-issue to. Instead, each of the two records gets a line-anchored, greppable `Related: #N` body line pointing at the other — `work-backend: github-issues`, both `work-links` values (GitHub's own automatic `#N`-mention timeline cross-reference exists but is not greppable record-body text, which is why this explicit line is written even under `work-links: native`); `work-backend: local-files`, the identical `Related: {id}` body line, no new frontmatter facet. Write this via the same compose-then-write-once discipline as every other body edit in this skill — append the line to each record's already-composed body before its create call, not as a separate edit afterward.
```

- [ ] **Step 7: Verify the ceiling — hard gate**

```bash
wc -c plugin/skills/specify/record-creation.md
```

If it exceeds 40,960: per the spec's own Gotchas, prefer trimming an existing sentence over cutting new content — grep `tests/` for any sentence before cutting it, since whole-file conformance tests may pin prose repo-wide.

- [ ] **Step 8: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/specify/record-creation.md
git commit -m "Make record-creation.md's Parent record section and Parent: line conditional on the collapse decision; add the Related: cross-link format"
```

---

### Task 4: `SKILL.md` — `--granularity` never-overrides note

**Files:**
- Modify: `plugin/skills/specify/SKILL.md` (the `--granularity` flag's own definition line in the Input section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current size**

```bash
wc -c plugin/skills/specify/SKILL.md
```

- [ ] **Step 2: Locate the flag definition**

```bash
grep -n -- "--granularity <fine|standard|coarse>. — tunes Step 2's Sizing Guidelines" plugin/skills/specify/SKILL.md
```

- [ ] **Step 3: Append the never-overrides clause**

Append to the end of that same bullet (after "...shaping mode has nothing to decompose, so this flag is ignored there."): " This flag never overrides the collapse decision (`decomposition-mode.md` Step 2.6) — a `fine` run yielding 1 work unit still collapses to no parent; the flag tunes sizing targets, not ceremony."

- [ ] **Step 4: Verify the ceiling**

```bash
wc -c plugin/skills/specify/SKILL.md
```

- [ ] **Step 5: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/SKILL.md
git commit -m "State --granularity never overrides the collapse decision"
```

---

### Task 5: Consumer check — does anything assume every sub-issue set has a labeled parent?

**Files:**
- No file modification expected unless the grep below finds a genuine assumption to fix — in that case, modify the offending file directly (report which, if any, in the commit message).

**Interfaces:**
- Consumes: nothing.
- Produces: a finding, recorded in this task's report, that Task 6's test suite may need to reference, and that the eventual PR description must state (per the spec's own Deliverable: "confirm in the PR description that none assumes every set of related sub-issues traces to a labeled parent").

- [ ] **Step 1: Grep for `parent-issue` consumers repo-wide**

```bash
grep -rln "parent-issue" plugin/ tests/ docs/
```

- [ ] **Step 2: Read each hit and classify**

For each file returned, read the surrounding context and classify: does it (a) merely create/bootstrap the `parent-issue` label (no assumption — out of scope, e.g. `record-creation.md` itself, `_shared/label-bootstrap.md`), (b) operate ON existing parent-labeled issues without assuming every related-record-set has one (safe — e.g. `/tidy`'s parent-gate scan, which only acts on issues that DO carry the label; `/demo`'s Approve step, which only checks `isParentIssue` on a record it already has in hand), or (c) genuinely assumes every set of related/cross-linked sub-issues traces back to a labeled parent (a real gap this spec's collapse rules create — a `Related:`-linked pair now has no parent for such logic to find).

- [ ] **Step 2: Check specifically for backlog-grouping assumptions**

```bash
grep -n "groupByFileOverlap\|parent-issue\|isParentIssue" plugin/bin/lib/issues/grouping.js plugin/skills/backlog/*.md 2>/dev/null
```

Confirm `/claude-tweaks:backlog`'s grouping logic (if it groups by parent) does not assume a group always has a parent — a collapsed independent pair groups by `Related:` cross-link, not parent/child.

- [ ] **Step 3: Report findings**

Write a short report (in your final reply to the coordinator, not a separate file) listing: every file that references `parent-issue`/`isParentIssue`, and for each, whether it's (a) label-bootstrap-only, (b) safe (operates only on records that already carry the label), or (c) a genuine gap. If any genuine gap is found, fix it in this same task (localized, ≤5 files, no external dependency — fix-now per this repo's own deferral-gate criteria) and note the fix in your commit message. If none is found, state that explicitly — this is the expected outcome per the spec's own framing ("a collapsed pair simply presents as two ordinary ready records with `Related:` lines" — nothing downstream should have assumed otherwise, since `/review`'s Step 1.6 Cross-Spec Promises and `/help`'s dashboard already key off `Blocked by`/labels per-record, not off parent existence).

- [ ] **Step 4: If a fix was needed, verify the ceiling on the touched file and run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 5: Commit (only if a fix was applied)**

```bash
git add {fixed file(s)}
git commit -m "Fix {consumer} to not assume every related-record set traces to a labeled parent"
```

If no fix was needed, skip this step — nothing to commit for this task.

---

### Task 6: `tests/specify-decomposition-collapse.test.js` — conformance suite, and full `npm test`

This task runs **last** — it verifies the citations/rewrites Tasks 1-5 made, and its own tests read the actual current prose of files those tasks touched.

**Files:**
- Create: `tests/specify-decomposition-collapse.test.js`

**Interfaces:**
- Consumes: every edit from Tasks 1-5.
- Produces: nothing — this is the plan's final task.

- [ ] **Step 1: Read the existing conformance-test style**

```bash
ls tests/*.test.js | xargs grep -l "REPO_ROOT" | head -3
```

Read one of the returned files (e.g. `tests/deferral-gate-conformance.test.js` or `tests/materiality-floor-conformance.test.js`) to match this repo's established `read(rel)`-helper, `assert.match`/`assert.doesNotMatch` style exactly.

- [ ] **Step 2: Write the test file**

Create `tests/specify-decomposition-collapse.test.js` with the standard header (`node:test`, `node:assert/strict`, `fs`, `path`, `REPO_ROOT`, a `read(rel)` helper reading `path.join(REPO_ROOT, rel)`), then these tests, pinning:

```javascript
test('decomposition-mode.md states the 1-unit-always-collapses rule', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /1 work unit.*always collapses/i);
});

test('decomposition-mode.md states the 2-unit dependency-ordered branch (Blocked by / internal-conflict)', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /Blocked by #N.*flag between the two units/i);
  assert.match(text, /internal-conflict row/i);
});

test('decomposition-mode.md states the 2-unit independent-collapse branch', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /independent.*collapses/i);
});

test('decomposition-mode.md states ambiguity keeps the parent', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /[Aa]mbiguous.*keep the parent/);
});

test('decomposition-mode.md names the strangler-fig early-production shape as parent-keeping', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /early-production.*always parent-keeping/i);
});

test('decomposition-mode.md states 3+ units never collapse', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /3\+ work units.*never collapses/i);
});

test('the collapse-decision step cites Implicit Dependency Detection, not the ceiling-headroom flag, as its data source', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /never read the adjacent Ceiling-headroom flag/);
});

test('decomposition-mode.md Step 9 covers all three origin-closure branches', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /Parent kept, or 2-unit collapse/);
  assert.match(text, /1-unit collapse.*shape the origin record in place/is);
});

test('the "exactly one parent every run" sentence is gone from specify', () => {
  const files = ['decomposition-mode.md', 'record-creation.md', 'SKILL.md'].map(
    (f) => read(`plugin/skills/specify/${f}`),
  );
  for (const text of files) {
    assert.doesNotMatch(text, /exactly one parent/i);
  }
});

test('Step 9 summary template names the collapse outcome', () => {
  const text = read('plugin/skills/specify/decomposition-mode.md');
  assert.match(text, /Collapse outcome:/);
});

test('record-creation.md\'s "one parent per decomposition run" sentence is rewritten, not merely qualified in place', () => {
  const text = read('plugin/skills/specify/record-creation.md');
  assert.doesNotMatch(text, /^One parent per decomposition run/m);
});

test('record-creation.md\'s Parent record section is conditional on the collapse decision', () => {
  const text = read('plugin/skills/specify/record-creation.md');
  assert.match(text, /[Ss]kip this whole section entirely when Step 2\.6/);
});

test('record-creation.md\'s sub-issue Parent: line is conditional', () => {
  const text = read('plugin/skills/specify/record-creation.md');
  assert.match(text, /only when Step 2\.6 kept the parent, also prefix `Parent: #\$PARENT_NUM`/);
});

test('record-creation.md defines the uniform Related: cross-link format for independent 2-unit collapse', () => {
  const text = read('plugin/skills/specify/record-creation.md');
  assert.match(text, /Related: #N/);
  assert.match(text, /Related: \{id\}/);
});

test('record-creation.md states no parent fingerprint is minted under collapse', () => {
  const text = read('plugin/skills/specify/record-creation.md');
  assert.match(text, /no `\{design-doc-slug\}:parent` fingerprint is ever minted/);
});

test('SKILL.md states --granularity never overrides collapse', () => {
  const text = read('plugin/skills/specify/SKILL.md');
  assert.match(text, /never overrides the collapse decision/);
});

test('the parent-record guard in SKILL.md is untouched by this change', () => {
  const text = read('plugin/skills/specify/SKILL.md');
  assert.match(text, /Parent-record guard \(before the `needs:definition` check\)/);
});

test('every touched specify file remains within the context-cost ceiling', () => {
  for (const f of ['decomposition-mode.md', 'record-creation.md', 'SKILL.md']) {
    const bytes = fs.statSync(path.join(REPO_ROOT, `plugin/skills/specify/${f}`)).size;
    assert.ok(bytes <= 40960, `${f} is ${bytes} bytes, over the 40960 ceiling`);
  }
});
```

Adjust any regex whose exact wording drifted slightly from Tasks 1-4's actual committed text — the intent each test pins (the rule stated, the sentence rewritten not qualified, the conditional present) is what matters, not this plan's exact phrasing guess.

- [ ] **Step 3: Verify discrimination — the 1-unit rule test must go red without it**

Temporarily comment out (do not delete) the "1 work unit — always collapses" sentence in `decomposition-mode.md`, save, run:

```bash
node --test tests/specify-decomposition-collapse.test.js
```

Expected: the 1-unit test FAILS. Then restore the sentence (uncomment) and re-run to confirm green again.

- [ ] **Step 4: Run the new suite and the ceiling suite**

```bash
node --test tests/specify-decomposition-collapse.test.js
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

This repo's specify skill files carry extensive byte-pinned prose tests — run the full suite, not just the new file, per the spec's own Gotchas. A single unrelated flake (per this repo's own documented tolerance) should be re-run in isolation before treating it as real.

- [ ] **Step 6: Commit**

```bash
git add tests/specify-decomposition-collapse.test.js
git commit -m "Add conformance suite pinning the decomposition collapse rules"
```

---

## Self-Review Notes (for the plan author, not the implementer)

1. **Spec coverage:** Deliverable 1 (collapse step, all branches + ambiguity default) → Task 1. Deliverable 2 (`Related:` cross-link format) → Task 3 Step 6. Deliverable 3 (conditional Parent record section) → Task 3 Steps 2-5. Deliverable 4 ($ORIGIN_RECORD_NUM, all three branches) → Task 2 Step 3. Deliverable 5 (Step 9 drops the "exactly one parent" premise, names the outcome) → Task 2 Steps 3-4. Deliverable 6 (fingerprint semantics under collapse) → Task 3 Step 5. Deliverable 7 (consumer check) → Task 5. Deliverable 8 (`--granularity` interaction) → Task 4. Deliverable 9 (conformance suite) → Task 6.
2. **Placeholder scan:** every inserted sentence above is the literal text to write, not a description. Task 5 is the one task whose outcome is genuinely unknown at plan-authoring time (a grep result) — its steps are framed as an investigation with a conditional fix, which is the honest shape of that deliverable, not a placeholder.
3. **Type/name consistency:** "Step 2.6" is used consistently as the collapse step's own name across Tasks 1, 2, 3, 4, and 6's tests. "`decomposition-mode.md` Step 2.6" is the one canonical way every other file refers back to it.
4. **Renumbering-completeness check:** Task 2 renames "exactly one parent record every run" — grepped across all three specify files (decomposition-mode.md, record-creation.md, SKILL.md) in Task 6's own test, not just the one file it was found in, in case the phrase (or a paraphrase) recurs elsewhere.
