# Skill Bloat Reduction — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the identifier-preservation checker Phase 2 depends on, then bank ~10.5 KB of zero-judgment `SKILL.md` reduction by compressing the interaction-style directive across all 32 skills and replacing the 10 mechanically-linear lifecycle diagrams with one-line position markers.

**Architecture:** Two independent deliverables. First, a new `bin/lib/skill-audit/` module exporting pure functions that extract distinctive identifiers (backticked spans, `Step N.M` references) from skill prose and report which ones vanished between a before-state and an after-corpus — this is the safety net for Phase 2's relocation work, built early so Phase 2 is never blocked on it. Second, a new all-32-skills convention test in `tests/` that asserts the compressed directive and the absence of the 10 linear diagrams, written to fail first, then satisfied by editing the 32 skill files.

**Tech Stack:** Node 18+, `node --test` (built-in), CommonJS under `bin/lib/` matching existing sibling modules.

## Global Constraints

- All sizes use KB = 1024 bytes.
- Baseline commit for every measurement in this plan: `fe393e30`.
- `bin/lib/` modules are **CommonJS** (`'use strict';`, `require`, `module.exports`) — match `bin/lib/health-core/`, not the ESM used in `evals/`.
- New `bin/lib/<name>/tests/` directories are **not** auto-discovered. `package.json`'s `test` script enumerates seven explicit paths; a new module requires adding its path there.
- Skill files must contain **no emojis** (CLAUDE.md `## Don'ts`). The existing `registerNoEmojiTest` enforces this for 5 skills.
- Every skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form.
- The interaction-style directive keeps its exact `> **Interaction style:**` prefix — five existing tests assert `read().includes('> **Interaction style:**')` and must continue to pass unchanged.
- Commit message style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End with the `Claude-Session:` trailer.
- Work happens in the existing worktree at `.claude/worktrees/skill-bloat-reduction-design` (policy `worktree.always`). Do **not** create a second worktree.
- Do not use issue-closing keywords in commits — write `refs #N`.

## Scope

This plan covers **Phase 0 and Phase 1 only**.

Phase 2 (Relationship triage) and Phase 3 (Anti-Pattern compression) require their own plans, written after Phase 2's classification stage produces its verdict table. Their per-skill edit tasks cannot be written now without placeholders — which task instructions to give for `skills/review/SKILL.md` depends on how its 23 Relationship rows classify, and that classification does not exist yet. Writing them speculatively would violate this plan format's "No Placeholders" rule.

## File Structure

| File | Responsibility |
|---|---|
| `bin/lib/skill-audit/identifiers.js` (create) | Pure functions: extract distinctive identifiers from markdown prose; diff a before-text's identifiers against an after-corpus. No I/O, no git. |
| `bin/lib/skill-audit/tests/identifiers.test.js` (create) | `node --test` suite for the above. |
| `package.json` (modify) | Add `bin/lib/skill-audit/tests/*.test.js` to the `test` script. |
| `tests/skill-conventions.test.js` (create) | All-32-skills convention sweep: canonical interaction directive present; the 10 named skills carry a `Lifecycle:` marker and no fenced block directly after their H1. |
| `skills/*/SKILL.md` (modify, 32 files) | Compressed directive; 10 of them also get the diagram replacement. |
| `CLAUDE.md` (modify) | Update the "Interaction style directive" section and structure convention item 4. |
| `CHANGELOG.md`, `.claude-plugin/plugin.json` (modify) | Version bump entry. |

---

### Task 1: Identifier-preservation checker

The Phase 2 safety net. When an operative Relationship row is relocated into a step body it gets **reworded**, so line-for-line comparison would report almost everything as missing. What must survive rewording is the distinctive payload: backticked identifiers (`PIPELINE_RUN_DIR`, `auto:merge`, `merge-check`) and step references (`Step 8.6`). This module reports which of those vanished.

**Files:**
- Create: `bin/lib/skill-audit/identifiers.js`
- Create: `bin/lib/skill-audit/tests/identifiers.test.js`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Produces:
  - `extractIdentifiers(text: string) => string[]` — deduped, lexicographically sorted (so uppercase precedes lowercase). Collects backticked spans (`` `foo` ``) and step references (`Step 3`, `Step 8.6`). Drops spans shorter than 4 characters, and drops any span starting with `/` — skill references and paths are edge labels, not payload, and keeping them would make every relocated Relationship row report a false loss on its own name.
  - `findLostIdentifiers(beforeText: string, afterCorpus: string) => string[]` — identifiers present in `beforeText` and absent from `afterCorpus`, compared on whitespace-normalized text.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/skill-audit/tests/identifiers.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractIdentifiers, findLostIdentifiers } = require('../identifiers.js');

test('extractIdentifiers: collects backticked spans', () => {
  // Sorted lexicographically, so uppercase precedes lowercase.
  const out = extractIdentifiers('Set `PIPELINE_RUN_DIR` before calling `merge-check`.');
  assert.deepStrictEqual(out, ['PIPELINE_RUN_DIR', 'merge-check']);
});

test('extractIdentifiers: drops skill references and paths', () => {
  const out = extractIdentifiers('`/claude-tweaks:flow` passes `PIPELINE_RUN_DIR`');
  assert.deepStrictEqual(out, ['PIPELINE_RUN_DIR']);
});

test('extractIdentifiers: collects step references', () => {
  const out = extractIdentifiers('Step 8.6 hands off to Step 3.');
  assert.deepStrictEqual(out, ['Step 3', 'Step 8.6']);
});

test('extractIdentifiers: drops spans shorter than 4 chars', () => {
  assert.deepStrictEqual(extractIdentifiers('use `gh` and `auto:merge`'), ['auto:merge']);
});

test('extractIdentifiers: dedupes repeats', () => {
  assert.deepStrictEqual(extractIdentifiers('`ready` then `ready`'), ['ready']);
});

test('extractIdentifiers: returns empty array for prose with no identifiers', () => {
  assert.deepStrictEqual(extractIdentifiers('Just ordinary prose here.'), []);
});

test('findLostIdentifiers: reports an identifier absent from the after-corpus', () => {
  const before = 'flow passes `PIPELINE_RUN_DIR` and constrains `subagent` execution.';
  const after = 'flow constrains `subagent` execution.';
  assert.deepStrictEqual(findLostIdentifiers(before, after), ['PIPELINE_RUN_DIR']);
});

test('findLostIdentifiers: survives rewording when the identifier is retained', () => {
  const before = '| `/flow` | Invoked BY /flow; passes `PIPELINE_RUN_DIR` so auto-mode resolves. |';
  const after = 'Step 4 reads `PIPELINE_RUN_DIR` from the invoking pipeline.';
  assert.deepStrictEqual(findLostIdentifiers(before, after), []);
});

test('findLostIdentifiers: matches across a line wrap in the after-corpus', () => {
  const before = 'see `merge-sensitive-paths` for detail';
  const after = 'reads the\n`merge-sensitive-paths`\nkey';
  assert.deepStrictEqual(findLostIdentifiers(before, after), []);
});

test('findLostIdentifiers: returns empty when before has no identifiers', () => {
  assert.deepStrictEqual(findLostIdentifiers('plain prose', 'anything'), []);
});
```

- [ ] **Step 2: Add the new test directory to the suite**

`package.json`'s `test` script enumerates paths explicitly — a new directory is invisible until added. Append `bin/lib/skill-audit/tests/*.test.js` to the end of the existing `node --test ...` list.

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: FAIL — `Cannot find module '../identifiers.js'`

- [ ] **Step 4: Write the implementation**

Create `bin/lib/skill-audit/identifiers.js`:

```js
'use strict';

// Distinctive-payload extraction for skill prose.
//
// Phase 2 of the bloat-reduction work relocates operative Relationship rows into
// the step bodies that implement them, rewording them in the process. Line-level
// comparison therefore reports nearly everything as missing and is useless as a
// safety net. What must survive a rewording is the payload a reader acts on:
// backticked identifiers and step references. This module reports which of those
// disappeared, so a human can adjudicate a short list instead of a whole diff.

const BACKTICKED = /`([^`\n]+)`/g;
const STEP_REF = /\bStep \d+(?:\.\d+)?\b/g;
const MIN_LENGTH = 4;

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function extractIdentifiers(text) {
  const source = String(text);
  const found = new Set();

  for (const m of source.matchAll(BACKTICKED)) {
    const token = m[1].trim();
    if (token.length < MIN_LENGTH) continue;
    // Skill references (`/claude-tweaks:flow`) and paths are edge labels, not payload.
    // A Relationship row's first cell is always a skill name, and it legitimately does
    // not reappear when the row is relocated into a step body — keeping these would
    // make every single relocated row report a false loss.
    if (token.startsWith('/')) continue;
    found.add(token);
  }
  for (const m of source.matchAll(STEP_REF)) {
    found.add(m[0]);
  }

  return [...found].sort();
}

function findLostIdentifiers(beforeText, afterCorpus) {
  const haystack = normalize(afterCorpus);
  return extractIdentifiers(beforeText).filter((id) => !haystack.includes(normalize(id)));
}

module.exports = { extractIdentifiers, findLostIdentifiers };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 6: Verify the test actually discriminates**

Do not trust that the test reads correctly. Temporarily change `MIN_LENGTH` from `4` to `1` in `identifiers.js`, re-run, and confirm the "drops spans shorter than 4 chars" test now **fails**. Restore `4` and confirm it passes again.

Run: `node --test bin/lib/skill-audit/tests/identifiers.test.js`
Expected: FAIL with `MIN_LENGTH = 1`, PASS after restoring.

- [ ] **Step 7: Run the full suite**

Run: `npm test > /tmp/phase0-task1.log 2>&1; echo "exit=$?" >> /tmp/phase0-task1.log`
Then: `grep -E "^# (tests|pass|fail)|^exit=" /tmp/phase0-task1.log`
Expected: `# fail 0` and `exit=0`. Redirect rather than piping directly — a long run piped to `grep` can truncate and hide the real failure.

- [ ] **Step 8: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pwd && git rev-parse --show-toplevel
git add bin/lib/skill-audit/identifiers.js bin/lib/skill-audit/tests/identifiers.test.js package.json
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Add the identifier-preservation checker Phase 2's relocation work depends on

Operative Relationship rows get reworded when they move into a step body, so
line-level comparison reports nearly everything as missing. This compares the
payload instead: backticked identifiers and Step N.M references.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

### Task 2: Capture the eval cost/quality baseline

Establishes the before-state the Phase 1 and Phase 2 comparisons are measured against. This task spends real money.

**Files:**
- Create: `evals/results/` entries (gitignored) and one committed summary at `docs/superpowers/specs/2026-08-04-eval-baseline.md`

**Interfaces:**
- Produces: a committed table of per-scenario `costUsd`, `cache_creation_input_tokens`, and assertion pass/fail, referenced by Phase 1's and Phase 2's acceptance criteria.

- [ ] **Step 1: Confirm prerequisites**

Run: `cd evals && npm install && node -e "console.log(!!process.env.ANTHROPIC_API_KEY)"`
Expected: `true`. Without the key every scenario errors.

- [ ] **Step 2: Run the five skill scenarios**

`actor-escape-attempt` is a harness self-test, not a skill, and is excluded.

```bash
cd evals
for s in review-catches-planted-bugs simplify-fixes-planted-complexity \
         code-health-seeded-findings dispatch-local-files-preflight-stop \
         backlog-refine-permission-matrix-compliance; do
  node runner.js run "$s"
done
```

Expected: five JSON files under `evals/results/`. **Budget warning:** `evals/README.md` states $0.44–$5 per run, but `history.jsonl` records a `backlog-refine-permission-matrix-compliance` run at $17.47 and 32 minutes. Total plausibly $25–50 for this pass alone.

- [ ] **Step 3: Write the baseline summary**

Create `docs/superpowers/specs/2026-08-04-eval-baseline.md` with one row per scenario: scenario name, `costUsd`, `tokens.cache_creation_input_tokens`, assertions passed / total, and the commit the run was taken at. Read the values out of the `evals/results/` JSON files — do not retype them from the terminal.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pwd
git add docs/superpowers/specs/2026-08-04-eval-baseline.md
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Record the pre-cleanup eval baseline — five scenarios, cost and assertion state

Baseline for the Phase 1 and Phase 2 comparisons. results/ stays gitignored;
only the summary table is committed.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

### Task 3: Compress the interaction-style directive across all 32 skills

**Files:**
- Create: `tests/skill-conventions.test.js`
- Modify: all 32 `skills/*/SKILL.md`
- Modify: `CLAUDE.md` (the "Interaction style directive" section)

**Interfaces:**
- Consumes: nothing.
- Produces: `CANONICAL_DIRECTIVE`, exported from `tests/skill-conventions.test.js`, is the single source of truth for the directive string. Task 4 extends this same file.

The current directive is 570 B and identical in all 32 files. The replacement is 327 B and preserves all four of its rules: single decisions use one `AskUserQuestion` call with a Recommended option; multi-item decisions use a batch table plus one call for apply-all/override; never more than one call per decision; end with `## Next Actions` rendered via `AskUserQuestion` rather than a navigation menu.

- [ ] **Step 1: Write the failing test**

Create `tests/skill-conventions.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const CANONICAL_DIRECTIVE =
  '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked ' +
  'Recommended. Multi-item → batch table with recommendations pre-filled, then one ' +
  '`AskUserQuestion` for apply-all/override. Never more than one call per decision. End with ' +
  '`## Next Actions` via `AskUserQuestion`, not a navigation menu.';

function skillNames() {
  return fs
    .readdirSync(SKILLS_DIR)
    .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')))
    .sort();
}

const read = (name) => fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

test('every skill directory with a SKILL.md is discovered', () => {
  assert.strictEqual(skillNames().length, 32);
});

test('every skill carries the canonical compressed interaction directive', () => {
  for (const name of skillNames()) {
    assert.ok(read(name).includes(CANONICAL_DIRECTIVE), `${name} missing canonical directive`);
  }
});

test('no skill retains the superseded long-form directive', () => {
  for (const name of skillNames()) {
    assert.ok(
      !read(name).includes('Present single decisions via the `AskUserQuestion` tool'),
      `${name} still carries the long-form directive`
    );
  }
});

test('the directive keeps the prefix five existing tests assert on', () => {
  assert.ok(CANONICAL_DIRECTIVE.startsWith('> **Interaction style:**'));
  for (const name of skillNames()) {
    assert.ok(read(name).includes('> **Interaction style:**'), `${name} lost the prefix`);
  }
});

module.exports = { CANONICAL_DIRECTIVE, skillNames, read, SKILLS_DIR };
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/skill-conventions.test.js`
Expected: FAIL — "missing canonical directive" for all 32, and "still carries the long-form directive" for all 32. The count test and prefix test should PASS.

- [ ] **Step 3: Apply the replacement to all 32 files**

Read from an immutable source and write once — never point the transform at a file it has already rewritten.

```bash
node -e '
const fs=require("fs"),path=require("path");
const {CANONICAL_DIRECTIVE}=require("./tests/skill-conventions.test.js");
const OLD_PREFIX="> **Interaction style:** Present single decisions via the `AskUserQuestion` tool";
let n=0;
for(const d of fs.readdirSync("skills")){
  const p=path.join("skills",d,"SKILL.md");
  if(!fs.existsSync(p))continue;
  const lines=fs.readFileSync(p,"utf8").split("\n");
  const i=lines.findIndex(l=>l.startsWith(OLD_PREFIX));
  if(i<0){console.log("SKIP (no match):",d);continue}
  lines[i]=CANONICAL_DIRECTIVE;
  fs.writeFileSync(p,lines.join("\n"));n++;
}
console.log("rewrote",n,"files");
'
```

Expected: `rewrote 32 files`, no `SKIP` lines. If any file is skipped, stop and inspect it — the directive was not byte-identical there after all.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Verify the rendered result, not just the diff**

For three files (`skills/review/SKILL.md`, `skills/version/SKILL.md`, `skills/dispatch/SKILL.md`), read the 6 lines surrounding the directive and confirm the replacement is its own paragraph — not absorbed into an adjacent fenced block or spliced into a neighbouring sentence.

Run: `for f in review version dispatch; do echo "--- $f ---"; grep -n -B3 -A3 'Interaction style' "skills/$f/SKILL.md"; done`
Expected: in each, the directive stands alone with a blank line above and below.

- [ ] **Step 6: Update CLAUDE.md's directive section**

In `CLAUDE.md`, under `### Interaction style directive`, replace the quoted block with the new 327 B text so the documented convention and the shipped files agree. Leave the surrounding sentence ("All skills use this identical directive after the frontmatter") unchanged — it is still true.

- [ ] **Step 7: Run the full suite**

Run: `npm test > /tmp/phase1-task3.log 2>&1; echo "exit=$?" >> /tmp/phase1-task3.log`
Then: `grep -E "^# (tests|pass|fail)|^exit=" /tmp/phase1-task3.log`
Expected: `# fail 0`, `exit=0`. The five pre-existing `registerInteractionStyleTest` assertions still pass because the `> **Interaction style:**` prefix is unchanged.

- [ ] **Step 8: Measure and commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pwd
git diff --stat -- skills/ | tail -1
git add tests/skill-conventions.test.js skills/ CLAUDE.md
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Compress the interaction-style directive in all 32 skills — 570 B to 327 B

Same four rules, stated once each instead of discursively. Saves 7.6 KB of
per-invocation context. The directive stays inline rather than moving to
CLAUDE.md, which does not ship with the plugin.

Adds tests/skill-conventions.test.js as the first all-32-skills convention sweep.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

### Task 4: Replace the 10 linear lifecycle diagrams

**Files:**
- Modify: `tests/skill-conventions.test.js`
- Modify: 10 `skills/*/SKILL.md` — `version`, `design-wrapper`, `init`, `capture`, `challenge`, `specify`, `test`, `review`, `wrap-up`, `stories`
- Modify: `CLAUDE.md` (structure convention item 4)

**Interfaces:**
- Consumes: `skillNames`, `read`, `SKILLS_DIR` from `tests/skill-conventions.test.js` (Task 3).
- Produces: nothing consumed by later tasks in this plan.

Only these 10 of 32 diagrams are linear position chains. The other 22 document mechanism — `code-health`'s findings pipeline, `browse`'s consumer set, `help`'s cycle, `dispatch`'s 16-line flow — and are deliberately left untouched.

- [ ] **Step 1: Write the failing test**

Append to `tests/skill-conventions.test.js`, before the `module.exports` line:

```js
const LINEAR_DIAGRAM_SKILLS = [
  'capture', 'challenge', 'design-wrapper', 'init', 'review',
  'specify', 'stories', 'test', 'version', 'wrap-up',
];

test('the 10 linear-diagram skills carry a one-line Lifecycle marker', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.match(read(name), /^Lifecycle: .+$/m, `${name} missing Lifecycle marker`);
  }
});

test('the 10 linear-diagram skills no longer open with a fenced block', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    const lines = read(name).split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const fence = lines.findIndex((l, i) => i > h1 && /^```/.test(l));
    assert.ok(
      fence === -1 || fence > h1 + 15,
      `${name} still opens with a fenced block at line ${fence + 1}`
    );
  }
});

test('no YOU ARE HERE marker survives in the 10 rewritten skills', () => {
  for (const name of LINEAR_DIAGRAM_SKILLS) {
    assert.ok(!read(name).includes('YOU ARE HERE'), `${name} still has YOU ARE HERE`);
  }
});

test('the 22 untouched skills keep their diagrams', () => {
  const untouched = skillNames().filter((n) => !LINEAR_DIAGRAM_SKILLS.includes(n));
  assert.strictEqual(untouched.length, 22);
  for (const name of ['code-health', 'browse', 'help', 'dispatch']) {
    const lines = read(name).split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const fence = lines.findIndex((l, i) => i > h1 && /^```/.test(l));
    assert.ok(fence > h1 && fence <= h1 + 15, `${name} lost its diagram`);
  }
});
```

Also add `LINEAR_DIAGRAM_SKILLS` to the `module.exports` object.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/skill-conventions.test.js`
Expected: FAIL on the three new 10-skill tests. The "22 untouched skills" test should PASS already.

- [ ] **Step 3: Replace each of the 10 diagrams**

For each file, delete the fenced block that follows the H1 (including both ``` fences) and put this single line in its place. These are the exact replacement strings — do not paraphrase:

| Skill | Replacement line |
|---|---|
| `version` | ``Lifecycle: utility — callable from anywhere between `/claude-tweaks:capture` and `/claude-tweaks:wrap-up`.`` |
| `design-wrapper` | ``Lifecycle: utility — called by lifecycle skills anywhere between `/claude-tweaks:capture` and `/claude-tweaks:wrap-up`.`` |
| `init` | ``Lifecycle: **`/claude-tweaks:init`** → `/claude-tweaks:capture` — first step of the chain; the full chain is in `/claude-tweaks:help`.`` |
| `capture` | ``Lifecycle: `/claude-tweaks:init` → **`/claude-tweaks:capture`** → `/claude-tweaks:challenge``` |
| `challenge` | ``Lifecycle: `/claude-tweaks:capture` → **`/claude-tweaks:challenge`** → `/superpowers:brainstorming``` |
| `specify` | ``Lifecycle: `/superpowers:brainstorming` → **`/claude-tweaks:specify`** → `/claude-tweaks:build``` |
| `stories` | ``Lifecycle: `/claude-tweaks:build` → **`/claude-tweaks:stories`** → `/claude-tweaks:test` (conditional — only when UI files change).`` |
| `test` | ``Lifecycle: `/claude-tweaks:stories` → **`/claude-tweaks:test`** → `/claude-tweaks:review``` |
| `review` | ``Lifecycle: `/claude-tweaks:test` → **`/claude-tweaks:review`** → `/claude-tweaks:wrap-up``` |
| `wrap-up` | ``Lifecycle: `/claude-tweaks:review` → **`/claude-tweaks:wrap-up`** — last step of the chain; the full chain is in `/claude-tweaks:help`.`` |

`stories` keeps its "(conditional — only when UI files change)" caveat, which its original diagram carried on a third line. `version` and `design-wrapper` are utilities with no fixed chain position, which their originals stated explicitly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Verify the rendered result around every edit**

A fenced-block deletion is exactly where a stray line lands inside a surviving fence or splits a neighbouring sentence. For all 10 files, print lines 8–20 and confirm: H1, blank, description paragraph, blank, `Lifecycle:` line, blank, `## When to Use`.

Run: `for f in version design-wrapper init capture challenge specify stories test review wrap-up; do echo "===== $f ====="; sed -n '8,20p' "skills/$f/SKILL.md"; done`
Expected: no stray ``` fences, no `Lifecycle:` line glued to the preceding paragraph.

- [ ] **Step 6: Update CLAUDE.md structure convention item 4**

Item 4 currently reads "ASCII lifecycle position diagram". Replace with wording that reflects reality: a one-line `Lifecycle:` position marker for skills with a fixed chain position, or a diagram where the skill's shape is genuinely non-linear (utility consumer sets, mechanism flows, cycles). Note that the canonical full chain lives in `/claude-tweaks:help`.

- [ ] **Step 7: Run the full suite**

Run: `npm test > /tmp/phase1-task4.log 2>&1; echo "exit=$?" >> /tmp/phase1-task4.log`
Then: `grep -E "^# (tests|pass|fail)|^exit=" /tmp/phase1-task4.log`
Expected: `# fail 0`, `exit=0`.

- [ ] **Step 8: Measure the actual saving and commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pwd
node -e '
const {execSync}=require("child_process");
const s=["version","design-wrapper","init","capture","challenge","specify","test","review","wrap-up","stories"];
let before=0,after=0;
for(const n of s){
  before+=Buffer.byteLength(execSync(`git show HEAD:skills/${n}/SKILL.md`).toString());
  after+=Buffer.byteLength(require("fs").readFileSync(`skills/${n}/SKILL.md`).toString());
}
console.log("before",before,"after",after,"saved",((before-after)/1024).toFixed(1),"KB");
'
git add tests/skill-conventions.test.js skills/ CLAUDE.md
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Replace 10 linear lifecycle diagrams with one-line position markers

Only 10 of 32 leading diagrams are linear position chains. The other 22 document
mechanism that exists nowhere else in one place — code-health's findings pipeline,
browse's consumer set, help's cycle, dispatch's 16-line flow — and are untouched.

The marker keeps the neighbours and the YOU-ARE-HERE orientation; the full chain
already lives in /claude-tweaks:help.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

---

### Task 5: Version bump, changelog, and marketplace mirror

Phase 1 is a feature-level change to shipped skill content, so it takes a minor bump. The marketplace mirror is part of this same action, not a follow-up.

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`
- Modify (separate repo): `claude-tweaks-marketplace/.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: the measured savings from Task 3 Step 8 and Task 4 Step 8.
- Produces: nothing.

- [ ] **Step 1: Check for a concurrent bump before choosing a number**

Local history alone is blind to a bump landed upstream after the last fetch, including one bundled inside an unrelated PR.

Run: `git fetch origin main && git log --oneline -5 origin/main -- .claude-plugin/plugin.json`
Expected: confirm the newest version there. Current local version is `6.32.0`; if `origin/main` already carries `6.33.0`, take `6.34.0` instead.

- [ ] **Step 2: Bump and write the changelog entry**

Set `version` in `.claude-plugin/plugin.json` to the next free minor. Add a `CHANGELOG.md` entry naming both levers and the measured byte savings from Tasks 3 and 4 — real numbers, not the estimates in this plan.

- [ ] **Step 3: Run the full suite**

Run: `npm test > /tmp/phase1-task5.log 2>&1; echo "exit=$?" >> /tmp/phase1-task5.log`
Then: `grep -E "^# (tests|pass|fail)|^exit=" /tmp/phase1-task5.log`
Expected: `# fail 0`, `exit=0`. `tests/changelog.test.js` validates the entry shape.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)" && pwd
git add .claude-plugin/plugin.json CHANGELOG.md
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Bump to {VERSION} — Phase 1 skill-bloat reduction

Compressed interaction directive across 32 skills and replaced 10 linear
lifecycle diagrams with one-line position markers.

Claude-Session: https://claude.ai/code/session_01WV3gNDxbbTvRr6R38zEVKi
EOF
)"
```

Substitute the actual version chosen in Step 1 for `{VERSION}`.

- [ ] **Step 5: Mirror to the marketplace repo**

In `thomasholknielsen/claude-tweaks-marketplace`, edit `.claude-plugin/marketplace.json`: set `plugins[].version` to the same version, bump `metadata.version` on its own `2.x` scheme, and keep `plugins[].description` aligned with `plugin.json`. Commit and push `main` in both repos. This is one authorized action, not two — do not stop to ask between them.

---

## Self-Review

**Spec coverage.** The design's Phase 0 maps to Tasks 1–2, Phase 1 to Tasks 3–5. The design's Phase 2 and Phase 3 are explicitly deferred to their own plans, with the reason stated under `## Scope`. The design's "what ships" constraint is enforced by Task 3 keeping the directive inline. The design's diagram classification (10 linear / 5 art / 17 non-linear) is enforced by Task 4's "22 untouched skills" test.

**Placeholder scan.** One intentional substitution marker remains — `{VERSION}` in Task 5 Step 4 — because the value is chosen in Step 1 of that same task against upstream state that does not exist yet. Every other step carries literal content: all 10 diagram replacement strings, the full canonical directive, and complete runnable test bodies.

**Type consistency.** `extractIdentifiers` and `findLostIdentifiers` are named identically in Task 1's tests, implementation, and `module.exports`. `CANONICAL_DIRECTIVE`, `skillNames`, `read`, and `SKILLS_DIR` are defined in Task 3 and consumed by Task 4 through the same export object; Task 4 adds `LINEAR_DIAGRAM_SKILLS` to it. `LINEAR_DIAGRAM_SKILLS` lists the same 10 skills as Task 4 Step 3's replacement table — verified name by name.

**Known gap.** Task 1's checker is built here but has no consumer until Phase 2. That is deliberate: the design places it in Phase 0 so Phase 2 is never blocked on it, and Step 6 verifies it discriminates rather than leaving it unexercised.
