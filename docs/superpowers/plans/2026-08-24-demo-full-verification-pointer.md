# Demo Full-Verification Pointer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:demo`'s Observation plan an optional `Full verification:` block that, on a parent-linked sub-issue, points forward to the parent's eventual end-to-end check and names which siblings still gate it.

**Architecture:** One new query-builder function in `bin/lib/issues/record.js`; one schema extension in `_shared/observation-plan.md`; one new sub-procedure in `demo/entry-paths.md`'s `#N` branch, cited from both of its fallback composers; a one-line render instruction plus one Anti-Patterns row in `demo/SKILL.md`; a prose-conformance test suite; two doc updates.

**Tech Stack:** Markdown skill prose (the shipped payload) + one Node.js helper function + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T154818-spec-1194/work/1194-spec.md` (record #1194) — this plan implements it in full; both travel together.

## Global Constraints

- `Then:` is always exactly one line — never a walkthrough. The parent brief's own inline walkthrough (`verification-brief-parent-gate.md`'s Compose part 2) stays the only place a full end-to-end walkthrough is authored.
- The block names the record's **immediate** parent only — never walks up to a grandparent.
- `Pending:` always excludes the record in hand.
- `gh api graphql` value mechanics (verified against `gh-api-module-pattern` skill and existing codebase precedent in `plugin/skills/dispatch/queue-pull-script.md`): `owner`/`repo` passed to `gh api graphql` are `String!` GraphQL variables, so they take `-f`, not `-F` — `-F` only substitutes literal `{owner}`/`{repo}` placeholders in a REST **path**, which does not apply here. The spec's own Data/API Surface illustration says `-F owner -F repo`; that is the exact over-generalization the `gh-api-module-pattern` skill calls out as a shipped bug (#610) — this plan uses the verified-correct `-f owner=… -f repo=…` form instead. No acceptance criterion pins the literal flag, so this is a deliberate, documented correction, not a deviation from anything tested.
- No changes to `verificationSurface` (`bin/lib/issues/acceptance.js`), `wrap-up/verification-brief.md`'s Routing, `verification-brief-parent-gate.md`'s Compose step, or `/demo`'s one-item-at-a-time contract.
- Byte budget: `demo/SKILL.md` is 31,379 bytes against the 40,960-byte (40 KB) ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) — 9,581 bytes headroom. Keep its addition to a render instruction + one Anti-Patterns row (well under 1 KB). `demo/entry-paths.md` is 11,864 bytes against the same ceiling — ample headroom for the new sub-procedure.
- Prose-conformance assertions are proved red via `git show {pre-change-sha}:{file} | grep -c` against `01ec5033ad10b5d1cc89b9d5c7777e70fef02bc8` — the `origin/main` merge-base commit this branch was built on, which stays reachable from `main`'s history regardless of squash-vs-merge (per `skill-prose-conformance-tests`'s "Proving discrimination without editing the tree" section) — never by reverting and re-running in the working tree.

---

### Task 1: `buildNativeParentQuery` helper + tests

**Files:**
- Modify: `plugin/bin/lib/issues/record.js:428-434` (insert after `buildNativeSubIssuesQuery`, before `hasOpenNativeBlocker` at line 436) and `record.js:579-585` (`module.exports`)
- Test: `tests/bin-lib/issues/record.test.js:517-528` (insert after the existing `buildNativeSubIssuesQuery` test block)

**Interfaces:**
- Produces: `buildNativeParentQuery(numbers: number[]) => string | null` — same aliased-batch GraphQL shape as `buildNativeSubIssuesQuery`, requesting each issue's native `parent{ number title state }`. `null` on empty array or non-array input. Exported from `bin/lib/issues/record.js`. Consumed by Task 3's sub-procedure.

- [ ] **Step 1: Write the failing tests**

Open `tests/bin-lib/issues/record.test.js`. The top-of-file destructure (line 5-9) currently reads:

```js
const {
  recordPayload, TYPE_LABELS, CLASSIFICATION_SCORING, LABELS, DEFER_REASONS,
  extractFingerprint, extractVerifiedAsOf, parseRecordFacets, parseDependencies, parseDependencyAssumptions, specShapedBody,
  buildNativeDependencyQuery, hasOpenNativeBlocker, parseSubIssues, buildNativeSubIssuesQuery,
  partitionByOpenBodyBlockers, partitionByOpenNativeBlockers,
} = require('../../../plugin/bin/lib/issues/record');
```

Add `buildNativeParentQuery` to that destructure list (append after `buildNativeSubIssuesQuery,`):

```js
  buildNativeDependencyQuery, hasOpenNativeBlocker, parseSubIssues, buildNativeSubIssuesQuery,
  buildNativeParentQuery,
  partitionByOpenBodyBlockers, partitionByOpenNativeBlockers,
```

Immediately after the existing block ending at line 528 (`assert.strictEqual(buildNativeSubIssuesQuery('42'), null);\n});`), insert:

```js
test('buildNativeParentQuery aliases each number and requests parent number/title/state', () => {
  const q = buildNativeParentQuery([42, 731]);
  assert.match(q, /i42: issue\(number:42\)\{ number parent\{ number title state \} \}/);
  assert.match(q, /i731: issue\(number:731\)/);
  assert.match(q, /query\(\$owner:String!,\$repo:String!\)/);
});

test('buildNativeParentQuery returns null for empty or non-array input', () => {
  assert.strictEqual(buildNativeParentQuery([]), null);
  assert.strictEqual(buildNativeParentQuery(null), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/record.test.js`
Expected: FAIL — `buildNativeParentQuery is not a function` (it's `undefined` from the destructure).

- [ ] **Step 3: Implement `buildNativeParentQuery`**

In `plugin/bin/lib/issues/record.js`, insert immediately after `buildNativeSubIssuesQuery`'s closing `}` (currently line 434) and before the `hasOpenNativeBlocker` comment (currently line 436):

```js

// candidate sub-issue numbers -> one batched, aliased GraphQL query requesting each
// issue's native parent (work-links: native), read from the sub-issue's own side.
// Probed live on this repo 2026-08-24: issue(number:$n){ parent{ number title state } }
// returns { number, parent: { number, title, state } } for a sub-issue, and
// parent: null for a parentless record. Same alias/null conventions as
// buildNativeSubIssuesQuery above. Callers: review/cross-spec-promise-check.md,
// demo/entry-paths.md's Full verification pointer sub-procedure.
function buildNativeParentQuery(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const fields = numbers
    .map((n) => `i${n}: issue(number:${n}){ number parent{ number title state } }`)
    .join('\n      ');
  return `query($owner:String!,$repo:String!){\n  repository(owner:$owner,name:$repo){\n      ${fields}\n  }\n}`;
}
```

Then update `module.exports` (currently lines 579-585) to add `buildNativeParentQuery` next to `buildNativeSubIssuesQuery` — do not reorder any other export (the plan's Gotchas note two other open records also touch this file):

```js
module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, DEFER_REASONS, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, extractVerifiedAsOf, normalizeLabelNames, parseRecordFacets,
  parseDependencies, parseDependencyAssumptions, buildNativeDependencyQuery,
  hasOpenNativeBlocker, CLASSIFICATION_SCORING, fenceFor, fencedBlock, parseSubIssues,
  buildNativeSubIssuesQuery, buildNativeParentQuery, partitionByOpenBodyBlockers, partitionByOpenNativeBlockers,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/record.test.js`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/record.js tests/bin-lib/issues/record.test.js
git commit -m "Add buildNativeParentQuery helper for the demo full-verification pointer (refs #1194)"
```

---

### Task 2: Extend the Observation plan schema

**Files:**
- Modify: `plugin/skills/_shared/observation-plan.md` (full file — see below)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: the `Full verification:` schema block, its grammar rules, and the producer statement — read by Task 3 (composer) and Task 4 (renderer). The literal grammar string `none — every sibling closed; parent gate` is load-bearing — Task 3's fallback text must reproduce it exactly.

- [ ] **Step 1: Extend the Schema fenced block**

The file's `## Schema` section currently reads:

```markdown
## Schema

\`\`\`markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run, or the diff range for `diff`}
- Prepare: {one command per `-` sub-bullet, or `none`}
- Inspect: {one pointer per `-` sub-bullet — what to open/run and what to look for;
  a flow pointer may carry one indented `Regenerate: {command}` continuation line}
\`\`\`
```

Replace it with (adding four lines before the closing fence):

```markdown
## Schema

\`\`\`markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run, or the diff range for `diff`}
- Prepare: {one command per `-` sub-bullet, or `none`}
- Inspect: {one pointer per `-` sub-bullet — what to open/run and what to look for;
  a flow pointer may carry one indented `Regenerate: {command}` continuation line}
- Full verification: {present only on a parent-linked sub-issue}
  - Parent: #P {parent title}
  - Pending: #X {title} (open), #Y {title} (open)
  - Then: {one line — what a human triggers and observes once every sibling ships}
\`\`\`
```

- [ ] **Step 2: Add the Grammar rules**

The `## Grammar rules` section currently reads:

```markdown
## Grammar rules

- One Prepare command per `-` sub-bullet; `Prepare: none` when nothing needs running first.
- One Inspect pointer per `-` sub-bullet.
- `Regenerate:` attaches to its Inspect pointer as an indented continuation line, at most
  one per pointer.
```

Append three new bullets:

```markdown
- `Full verification:` is optional. It is present only when the record has a resolvable
  parent, and never on a parentless record. A Parent-Gate parent brief omits the Observation
  plan section entirely, so it never carries this block either.
- `Pending:` lists every still-open sibling as `#N {title} (open)`, comma-separated, in
  ascending number order, excluding the record in hand. When no sibling is open, `Pending:`
  instead reads `none — every sibling closed; parent gate {due|gated|resolved}`, using
  `parentGateState`'s vocabulary (`bin/lib/issues/acceptance.js`).
- `Then:` is exactly one line naming the trigger and the observable outcome of the whole
  feature — never a test command. When the parent body carries no design summary to draw a
  trigger from, `Then:` reads `verify "{parent title}" end-to-end once the parent gate opens —
  the parent record carries no design summary to draw a trigger from`.
```

- [ ] **Step 3: Add the naming note and the producer statement**

At the end of the file, after the existing `## Choosing the kind (authoring rules + precedence)` section, append two new sections:

```markdown

## Why not `Blocked-by:`

`Blocked by #N` is already parsed dependency-edge vocabulary (`record.js`'s `DEP_RE`,
`_shared/work-record.md`'s Decomposition rules) — the same words inside an Observation plan
would read as a dependency edge rather than a verification pointer. The block is named
`Full verification` instead.

## Producer

Composed only by `/claude-tweaks:demo`'s `#N`-branch composers (`demo/entry-paths.md`'s Full
verification pointer sub-procedure), from live parent/sibling state at demo time — sibling
open/closed state is fresher there than anything wrap-up could have written at build time.
`wrap-up/verification-brief.md` Step 2 never composes this block: its Routing sends every
parent-linked sub-issue to the Parent-Gate Procedure in place of Steps 1-4, and that
procedure omits the Observation plan section entirely.
```

- [ ] **Step 4: Verify the additions read correctly**

Run: `grep -n 'Full verification:' plugin/skills/_shared/observation-plan.md`
Expected: one match, inside the `## Schema` fenced block (between the ` ```markdown ` opener and the closing fence).

Run: `grep -n 'none — every sibling closed; parent gate' plugin/skills/_shared/observation-plan.md`
Expected: one match, inside `## Grammar rules`.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/observation-plan.md
git commit -m "Extend Observation plan schema with the optional Full verification block (refs #1194)"
```

---

### Task 3: New sub-procedure in `demo/entry-paths.md`

**Files:**
- Modify: `plugin/skills/demo/entry-paths.md` (the `#N` given: single-record lookup section, lines 47-166)

**Interfaces:**
- Consumes: `buildNativeParentQuery` (Task 1); the Observation plan schema and its `Full verification:` grammar (Task 2).
- Produces: the "Full verification pointer (parent-linked records)" sub-procedure, cited from both fallback composers in this same file. Task 4 renders whatever this sub-procedure composes; nothing else consumes it directly.

- [ ] **Step 1: Insert the new sub-procedure**

The closing-commit reconstruction's Observation plan bullet currently ends (lines 143-153):

```markdown
- **Observation plan** — run the commit's changed-path list through `verificationSurface`
  (`bin/lib/issues/acceptance.js`) as the floor classification, then compose the `### Observation
  plan` section per `../_shared/observation-plan.md`'s schema from what it returns: `interactive`
  → compose a best-effort `app-route` plan, resolving the entry point via
  `skills/_shared/dev-url-detection.md`. `non-interactive` → compose the manual steps exactly as
  before — concrete commands, file paths, or behavior the commit's own message or path list
  evidences — presented as a `cli` plan when those steps name a runnable command, else a `diff`
  plan (Entry point: `{sha}^..{sha}`). That changed-path list is a real `git` result here, so the
  "recall can't produce a path list" omission case does not arise.

Go to Step 2 with it.
```

Replace the final two lines (`plan (Entry point: ...` through `Go to Step 2 with it.`) with:

```markdown
  plan (Entry point: `{sha}^..{sha}`). That changed-path list is a real `git` result here, so the
  "recall can't produce a path list" omission case does not arise. **Parent-linked records:** also
  run the Full verification pointer sub-procedure below, and append its block to the composed plan
  when it resolves one.

Go to Step 2 with it.
```

Immediately after that (still inside the `## \`#N\` given: single-record lookup` section, before the `**Not found**` paragraph that currently follows), insert the new sub-procedure as its own `###` subsection:

```markdown

### Full verification pointer (parent-linked records)

Cited by both the closing-commit reconstruction's Observation plan step above and the
`#N`-scoped session-recall fallback below — stated once, run from either.

1. **Resolve the parent** — the same resolution `review/cross-spec-promise-check.md` uses:
   `work-backend: local-files` → `facets.parent`; `github-issues` + `work-links: body-text` →
   this record's own `Parent: #N` body line; `github-issues` + `work-links: native` → one
   `buildNativeParentQuery([n])` call (`bin/lib/issues/record.js`), run via
   `gh api graphql -f owner="{owner}" -f repo="{repo}" -f query="$(node -e "…buildNativeParentQuery([n])…")"`
   — `-f` for `owner`/`repo` here, not `-F`: both are `String!` GraphQL variables, and `-F`
   only substitutes a literal `{owner}`/`{repo}` placeholder in a REST **path**, which does not
   apply to a GraphQL variable (`gh-api-module-pattern` skill). **No parent resolvable** — omit
   the block entirely; nothing renders.
2. **Enumerate siblings and their state**, from the parent side — reusing
   `wrap-up/verification-brief-parent-gate.md`'s "Enumerate the parent's sub-issues"
   enumeration: `native` — `gh api "repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues"`, whose
   response already carries every sibling's `number`, `title`, and `state`, so no per-sibling
   fetch is needed here (normalize its lowercase `open`/`closed` to `OPEN`/`CLOSED` —
   `_shared/github-pr-scan-acceptance.md`); `body-text` — one `gh issue view {n} --json
   state,title` per `parseSubIssues` number; `local-files` — the `queryRecords` result already
   carries `facets.closed` and the title. Exclude the record in hand from the sibling list. Also
   fetch the parent's labels (`gh issue view $PARENT_NUM --json labels`, or the parent record's
   `facets.acceptance`) — the input `parentGateState` (`bin/lib/issues/acceptance.js`) needs for
   the `Pending: none` alternative form. Bounded by decomposition size — `/specify`'s sizing
   keeps a parent to a handful of sub-issues, so nothing here paginates or fans out.
3. **Compose the block** per `_shared/observation-plan.md`'s schema and grammar rules.
4. **Extend `### Confirmed`** with one sentence — end-to-end behavior was not observable at this
   slice; see the plan's Full verification block — in whichever composer produced this brief:
   the reconstruction's opening reconstruction sentence above, or the session-recall entry's
   "what wasn't checked" clause below.

**Fail open, visibly.** Any `gh` failure in steps 1-2 above omits the block and states so in one
plain line above the verdict, naming which lookup failed — never a silent omission. `/demo` has
no run directory and no `decisions.md`, so this one line is the only trace.
```

Then, in the `**Not found**` paragraph — the `#N`-scoped session-recall fallback, currently reading:

```markdown
**Not found** — fall back to session-recall for this specific `#N`: does this conversation have
memory of building and/or verifying it? If yes, compose a Verification Brief exactly as the
no-arguments path does above, scoped to this one record, and go straight to Step 2. If this
session has no memory of it either, report plainly: "`#N` has no Verification Brief, no closing
commit in git history, and no memory in this session — nothing to show." and stop.
```

Change the second sentence to also cite the sub-procedure:

```markdown
**Not found** — fall back to session-recall for this specific `#N`: does this conversation have
memory of building and/or verifying it? If yes, compose a Verification Brief exactly as the
no-arguments path does above, scoped to this one record — also running the Full verification
pointer sub-procedure above and appending its block when it resolves one — and go straight to
Step 2. If this session has no memory of it either, report plainly: "`#N` has no Verification
Brief, no closing commit in git history, and no memory in this session — nothing to show." and
stop.
```

- [ ] **Step 2: Verify the citations landed**

Run: `grep -n 'buildNativeParentQuery' plugin/skills/demo/entry-paths.md`
Expected: one match, inside the new sub-procedure's step 1.

Run: `grep -n 'cross-spec-promise-check' plugin/skills/demo/entry-paths.md`
Expected: one match.

Run: `grep -n 'one plain line above the verdict' plugin/skills/demo/entry-paths.md`
Expected: one match, in the fail-open paragraph.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/demo/entry-paths.md
git commit -m "Add Full verification pointer sub-procedure to demo's #N entry paths (refs #1194)"
```

---

### Task 4: Render the block in `demo/SKILL.md`

**Files:**
- Modify: `plugin/skills/demo/SKILL.md` (Show-first walkthrough, lines 165-193; Anti-Patterns table, lines 325-343)

**Interfaces:**
- Consumes: the `Full verification:` block Task 3 may attach to a composed Observation plan.
- Produces: nothing new for other tasks — this is the walkthrough's terminal render step.

- [ ] **Step 1: Add the render instruction after the by-kind Show list**

The Show subsection currently reads (lines 165-181):

```markdown
**Show** — by Surface kind:

- `rendered-page`/`app-route` — ...
- `cli` — run the plan's Entry point command and show its output directly.
- `flow` — ...
- `diff` — ...

**Failure posture:** a Prepare or Validate failure is evidence for Request changes, ...
```

Insert a new paragraph between the by-kind bullet list and `**Failure posture:**`:

```markdown
**Full verification** — when this record's Observation plan carries a `Full verification:`
block (`_shared/observation-plan.md`), render it verbatim right after Show, before Failure
posture and the Verdict question. The block is a pointer to the parent's eventual end-to-end
check, not a substitute for it — the Verdict question below still asks only about this slice.

**Failure posture:** a Prepare or Validate failure is evidence for Request changes, ...
```

- [ ] **Step 2: Add the Anti-Patterns row**

In the Anti-Patterns table (ends at line 343, just before EOF), add a new row after the existing
"Treating a record with no interactive surface as not needing sign-off" row:

```markdown
| Handing a sub-issue's `cli`/`diff` plan to a human as if the slice were the feature | The plan must say which siblings gate the real check and what that check is — render the Full verification block when the record carries one |
```

- [ ] **Step 3: Verify placement**

Run: `grep -n 'Full verification\|### Verdict' plugin/skills/demo/SKILL.md`
Expected: the `Full verification` line number is between the last by-kind Show bullet's line and the `### Verdict` line number.

Run: `grep -n 'as if the slice were the feature' plugin/skills/demo/SKILL.md`
Expected: one match, in the Anti-Patterns table.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/demo/SKILL.md
git commit -m "Render the Full verification block in demo's Show-first walkthrough (refs #1194)"
```

---

### Task 5: Prose-conformance test suite

**Files:**
- Test: `tests/demo-full-verification-pointer.test.js` (new)

**Interfaces:**
- Consumes: the shipped prose from Tasks 2-4 (`observation-plan.md`, `entry-paths.md`, `demo/SKILL.md`, `verification-brief.md`, `verification-brief-parent-gate.md`).
- Produces: nothing consumed elsewhere — this is the acceptance-criteria pin (AC 2, 3, 4, 5, 8).

- [ ] **Step 1: Write the suite**

Create `tests/demo-full-verification-pointer.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OBSERVATION_PLAN_PATH = 'plugin/skills/_shared/observation-plan.md';
const ENTRY_PATHS_PATH = 'plugin/skills/demo/entry-paths.md';
const DEMO_SKILL_PATH = 'plugin/skills/demo/SKILL.md';
const VERIFICATION_BRIEF_PATH = 'plugin/skills/wrap-up/verification-brief.md';
const PARENT_GATE_PATH = 'plugin/skills/wrap-up/verification-brief-parent-gate.md';

const observationPlan = fs.readFileSync(path.join(ROOT, OBSERVATION_PLAN_PATH), 'utf8');
const entryPaths = fs.readFileSync(path.join(ROOT, ENTRY_PATHS_PATH), 'utf8');
const demoSkill = fs.readFileSync(path.join(ROOT, DEMO_SKILL_PATH), 'utf8');

// Merge-base with origin/main this record's changes were built on top of — already part of
// main's own history, so it stays reachable after this branch merges (squash or not). None
// of the literals pinned below existed in these files at this commit, which is how each
// assertion below is proved capable of going red — per skill-prose-conformance-tests'
// "Proving discrimination without editing the tree" (no working-tree mutation needed).
const PRE_CHANGE_SHA = '01ec5033ad10b5d1cc89b9d5c7777e70fef02bc8';

function countAtPreChange(relPath, literal) {
  const out = execFileSync('git', ['show', `${PRE_CHANGE_SHA}:${relPath}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split(literal).length - 1;
}

test('observation-plan.md declares Full verification with Parent/Pending/Then, inside the Schema fence', () => {
  const schemaFence = observationPlan.match(/## Schema\n\n```markdown([\s\S]*?)```/);
  assert.ok(schemaFence, 'Schema fenced block not found');
  assert.match(schemaFence[1], /- Full verification:/);
  assert.match(schemaFence[1], /- Parent: #P/);
  assert.match(schemaFence[1], /- Pending: #X/);
  assert.match(schemaFence[1], /- Then:/);
  assert.strictEqual(
    countAtPreChange(OBSERVATION_PLAN_PATH, 'Full verification:'), 0,
    'Full verification: must not have existed pre-change (proves this assertion can go red)',
  );
});

test('observation-plan.md Grammar rules name Parent:/Pending:/Then: and the closed-siblings literal', () => {
  assert.match(observationPlan, /`Parent:`/);
  assert.match(observationPlan, /`Pending:`/);
  assert.match(observationPlan, /`Then:`/);
  assert.match(observationPlan, /none — every sibling closed; parent gate/);
  assert.strictEqual(
    countAtPreChange(OBSERVATION_PLAN_PATH, 'none — every sibling closed; parent gate'), 0,
    'closed-siblings literal must not have existed pre-change',
  );
});

test('entry-paths.md cites buildNativeParentQuery, cross-spec-promise-check.md, and the fail-open line', () => {
  assert.match(entryPaths, /buildNativeParentQuery/);
  assert.match(entryPaths, /cross-spec-promise-check\.md/);
  assert.match(entryPaths, /one plain line above the verdict/);
  assert.strictEqual(
    countAtPreChange(ENTRY_PATHS_PATH, 'buildNativeParentQuery'), 0,
    'buildNativeParentQuery must not have existed pre-change',
  );
});

test('demo/SKILL.md renders Full verification between Show and Verdict, and has the Anti-Patterns row', () => {
  const showIdx = demoSkill.indexOf('**Show** — by Surface kind:');
  const verdictIdx = demoSkill.indexOf('### Verdict');
  assert.ok(showIdx > -1, 'Show subsection not found');
  assert.ok(verdictIdx > showIdx, '### Verdict must come after Show');
  const between = demoSkill.slice(showIdx, verdictIdx);
  assert.match(between, /Full verification/);
  assert.match(demoSkill, /as if the slice were the feature/);
  assert.strictEqual(
    countAtPreChange(DEMO_SKILL_PATH, 'as if the slice were the feature'), 0,
    'Anti-Patterns row must not have existed pre-change',
  );
});

test('wrap-up verification-brief files never compose the Full verification block (AC 8)', () => {
  const brief = fs.readFileSync(path.join(ROOT, VERIFICATION_BRIEF_PATH), 'utf8');
  const parentGate = fs.readFileSync(path.join(ROOT, PARENT_GATE_PATH), 'utf8');
  assert.doesNotMatch(brief, /Full verification/);
  assert.doesNotMatch(parentGate, /Full verification/);
});
```

- [ ] **Step 2: Run the suite**

Run: `node --test tests/demo-full-verification-pointer.test.js`
Expected: PASS — all five tests, including the four `countAtPreChange` go-red proofs.

- [ ] **Step 3: Commit**

```bash
git add tests/demo-full-verification-pointer.test.js
git commit -m "Add prose-conformance suite for the demo full-verification pointer (refs #1194)

Red run recorded: before Tasks 2-4 landed, plugin/skills/_shared/observation-plan.md,
plugin/skills/demo/entry-paths.md, and plugin/skills/demo/SKILL.md carried none of the
pinned literals — proved via git show 01ec5033ad10b5d1cc89b9d5c7777e70fef02bc8, not by
reverting the working tree."
```

---

### Task 6: Doc updates + full verification

**Files:**
- Modify: `docs/skill-graph.md` (the `## demo` section, ends at line ~161 before `## design-wrapper`; the wrap-up→demo row, currently starting `| \`/demo\` |` inside the `## wrap-up` section)
- Modify: `docs/journeys/accept-built-work-via-demo.md` (Step 1's "Should understand" line)

**Interfaces:**
- Consumes: everything from Tasks 1-5 — this task only documents and verifies, it adds no new code or schema.

- [ ] **Step 1: Add a new row to `## demo`**

The `## demo` table's last row currently ends with the `bin/lib/issues/trust.js` row, immediately
before the `## design-wrapper` heading. Insert a new row after it (still inside the `## demo`
table, before the blank line and `## design-wrapper`):

```markdown
| `wrap-up/verification-brief-parent-gate.md` | `/demo`'s Full verification pointer (`demo/entry-paths.md`) reads the same parent/sibling state this file's Parent-Gate Procedure reads — parent resolution, "Enumerate the parent's sub-issues", `parentGateState` — but from the sub-issue side rather than the parent side, to compose the optional `Full verification:` block on a parent-linked sub-issue's own Observation plan (`_shared/observation-plan.md`). Wrap-up never composes this block: its Routing sends every parent-linked sub-issue to this file's Parent-Gate Procedure instead of `verification-brief.md`'s Steps 1-4, which is the only place the block is ever produced. |
```

- [ ] **Step 2: Extend the wrap-up→demo row**

Find the `## wrap-up` section's row for `/demo` (its Relationship cell currently ends "...files a
linked follow-up record."). Append one sentence to that cell, immediately before the closing `|`:

```
A parent-linked sub-issue's own Observation plan may additionally carry an optional `Full
verification:` block pointing at the parent gate — composed by `/demo` itself at demo time
(see the `## demo` section's `verification-brief-parent-gate.md` row), never by this wrap-up
step.
```

- [ ] **Step 3: Update the journeys doc**

In `docs/journeys/accept-built-work-via-demo.md`, Step 1's "Should understand" line currently
reads:

```markdown
- **Should understand:** The `### Observation plan` section is builder-authored at wrap-up time (kinds: `rendered-page | app-route | cli | flow | diff` — schema in `plugin/skills/_shared/observation-plan.md`); demo executes it mechanically rather than classifying paths itself.
```

Replace it with:

```markdown
- **Should understand:** The `### Observation plan` section is builder-authored at wrap-up time (kinds: `rendered-page | app-route | cli | flow | diff` — schema in `plugin/skills/_shared/observation-plan.md`); demo executes it mechanically rather than classifying paths itself. A parent-linked sub-issue's own plan may additionally carry an optional `Full verification:` block — composed by `/demo` itself, not wrap-up, pointing at the parent's eventual end-to-end check and naming which siblings still gate it.
```

- [ ] **Step 4: Verify the doc updates**

Run: `grep -n 'Full verification' docs/skill-graph.md`
Expected: at least two matches — one inside the `## demo` section, one inside the `## wrap-up` section's `/demo` row.

Run: `grep -n 'Full verification' docs/journeys/accept-built-work-via-demo.md`
Expected: one match, inside Step 1's "Should understand" line.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS in full — in particular, no existing prose-conformance suite pinning
`observation-plan.md`, `entry-paths.md`, or `demo/SKILL.md` text goes red, and
`tests/bin-lib/issues/acceptance.test.js` stays green unchanged (AC 7).

- [ ] **Step 6: Commit**

```bash
git add docs/skill-graph.md docs/journeys/accept-built-work-via-demo.md
git commit -m "Document the Full verification pointer in skill-graph and the demo journey (refs #1194)"
```

---

## Self-Review

**Spec coverage:** every Deliverables bullet maps to a task — `record.js` (Task 1), `observation-plan.md` (Task 2), `entry-paths.md` (Task 3), `demo/SKILL.md` (Task 4), `record.test.js` (Task 1), `demo-full-verification-pointer.test.js` (Task 5), `docs/skill-graph.md` + journeys doc (Task 6). All 8 Acceptance Criteria are exercised: AC1 → Task 1 Step 4; AC2 → Task 2 Step 4; AC3 → Task 3 Step 2; AC4 → Task 4 Step 3; AC5 → Task 5 Step 2 (the suite's own go-red proofs, recorded in the Task 5 commit message); AC6 → Task 6 Step 4; AC7 → Task 6 Step 5; AC8 → Task 5's dedicated test.

**Placeholder scan:** no TBD/TODO; every code and prose block above is the literal content to write, not a description of it.

**Type consistency:** `buildNativeParentQuery(numbers)` signature and return shape (`string | null`) are identical between Task 1's implementation and Task 3's citation of it. The grammar literal `none — every sibling closed; parent gate {due|gated|resolved}` (Task 2) is reproduced verbatim in Task 3's sub-procedure design and pinned verbatim (short form) in Task 5's test.
