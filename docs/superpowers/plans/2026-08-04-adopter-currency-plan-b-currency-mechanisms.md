# Plan B — CLAUDE.md Currency Mechanisms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/claude-tweaks:init`'s four hand-maintained contract-version greps with a deterministic conformance check against the live template, and give `/claude-tweaks:wrap-up` a gated CLAUDE.md audit so a convention change is caught when it happens rather than weeks later by rotation.

**Architecture:** A new pure Node module derives the plugin-authored section list from the template itself rather than hardcoding it — a template section whose body is entirely a `{...}` placeholder is project-authored; one with a literal body is plugin-authored. `## Philosophy` is the single documented exception (placeholder in the template, real content in `## Generating Philosophy`). `/init` consumes the module; `/wrap-up` reuses the existing `_shared/harness-health-analysis.md` procedure behind an applicability gate copied from the pattern `47fa4aae` established.

**Tech Stack:** Node 18+ CommonJS under `bin/lib/`; `node --test`; markdown skill files.

## Global Constraints

- **Depends on Plan A.** Do not start until Plan A's Task 4 has landed — the module compares against the restructured template, and running it against the pre-restructure template will report every deleted block as drift.
- Work in the existing worktree at `.claude/worktrees/adopter-currency-contract` on branch `worktree-adopter-currency-contract`. `worktree.always: true` — do NOT create a second worktree.
- Design doc: `docs/superpowers/specs/2026-08-04-adopter-currency-contract-design.md` (commit `7078840b`).
- `bin/lib/init/` does not exist yet. Create it as a flat sibling under `bin/lib/`, per `CLAUDE.md`'s structure convention — NOT nested under a `_shared/` wrapper, which is specific to `skills/_shared/`.
- Every `docs/superpowers/` grep exclusion is written `^docs/superpowers/`, never `^./docs/superpowers/` — `grep -rn PATTERN .` here emits paths with no leading `./`, so a `^./` anchor silently matches nothing (`[IL-39]`).
- Any skill file edited must use the **current** interaction-style directive text and lifecycle-marker convention from `CLAUDE.md`. Both were revised recently — read `CLAUDE.md` fresh rather than copying an older skill's wording.
- Commit style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End every commit body with `Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `bin/lib/init/claude-md-conformance.js` | Parse template + project CLAUDE.md, report conformance | Create |
| `bin/lib/init/tests/claude-md-conformance.test.js` | Unit + discrimination coverage | Create |
| `skills/init/update-mode.md` | Update Mode procedures | Phase 1u.5 marker table replaced |
| `skills/wrap-up/SKILL.md` | Wrap-up workflow | New gated Step 7.9 |
| `skills/_shared/harness-health-analysis.md` | Shared judging procedure | Scope note at line 11 corrected |
| `CHANGELOG.md`, `.claude-plugin/plugin.json` | Release record | Minor bump + entry |

---

### Task 1: Section extraction from the template

The module needs to read the Initial Mode Template out of `claude-md-template.md` — the template lives inside a fenced ```markdown block, so a naive heading scan would also pick up the file's own documentation headings.

**Files:**
- Create: `bin/lib/init/claude-md-conformance.js`
- Create: `bin/lib/init/tests/claude-md-conformance.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `extractTemplateBody(templateSource) -> string` and `splitSections(markdown) -> Map<string, string>`, both used by Task 2

- [ ] **Step 1: Write the failing test**

Create `bin/lib/init/tests/claude-md-conformance.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const {
  extractTemplateBody,
  splitSections,
} = require('../claude-md-conformance');

const FIXTURE = [
  '# Phase 5: CLAUDE.md Template and Guidelines',
  '',
  '## Initial Mode Template',
  '',
  'Produce CLAUDE.md from scratch following this template:',
  '',
  '```markdown',
  '# {project name}',
  '',
  '## Stack',
  '',
  '{table}',
  '',
  '## Working Approach',
  '',
  '- **Think before coding.** State assumptions.',
  '',
  "## Don'ts",
  '',
  '{anti-patterns}',
  '```',
  '',
  '## Update Mode',
  '',
  'Produce a patch.',
].join('\n');

test('extractTemplateBody returns only the fenced Initial Mode Template', () => {
  const body = extractTemplateBody(FIXTURE);
  assert.ok(body.includes('# {project name}'));
  assert.ok(body.includes('## Working Approach'));
  assert.ok(!body.includes('## Update Mode'), 'must not leak the file\'s own headings');
  assert.ok(!body.includes('```'), 'fence markers must be stripped');
});

test('splitSections maps each h2 to its body', () => {
  const sections = splitSections(extractTemplateBody(FIXTURE));
  assert.deepStrictEqual([...sections.keys()], ['Stack', 'Working Approach', "Don'ts"]);
  assert.strictEqual(sections.get('Stack').trim(), '{table}');
  assert.strictEqual(
    sections.get('Working Approach').trim(),
    '- **Think before coding.** State assumptions.',
  );
});

test('extractTemplateBody throws when the fence is unbalanced', () => {
  const broken = FIXTURE.replace("```\n\n## Update Mode", '\n## Update Mode');
  assert.throws(() => extractTemplateBody(broken), /unterminated|stopped early/i);
});

test('extractTemplateBody throws when a nested fence truncates the template', () => {
  // A same-length inner fence is indistinguishable from the outer closing
  // fence, so extraction stops early and Don'ts never appears. This is exactly
  // the shape the template had before the Project Defaults block was removed.
  const nested = FIXTURE.replace(
    '- **Think before coding.** State assumptions.',
    '- **Think before coding.** State assumptions.\n\n## Project Defaults\n\n```\nfoo: bar\n```',
  );
  assert.throws(() => extractTemplateBody(nested), /stopped early/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: FAIL — `Cannot find module '../claude-md-conformance'`.

- [ ] **Step 3: Write the minimal implementation**

Create `bin/lib/init/claude-md-conformance.js`:

```javascript
// bin/lib/init/claude-md-conformance.js — deterministic conformance check for an
// adopting project's CLAUDE.md against the plugin's current template. Replaces
// init Phase 1u.5's hand-maintained contract-version marker greps: the markers
// went stale as the template changed, and never covered Working Approach or
// Philosophy at all.
'use strict';

// The Initial Mode Template lives inside a fenced ```markdown block so that the
// template's own h2 headings do not collide with the documentation headings of
// the file that carries it. Return the fence's contents, fences stripped.
function extractTemplateBody(templateSource) {
  const lines = templateSource.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Initial Mode Template');
  if (start === -1) throw new Error('claude-md-template.md has no "## Initial Mode Template" section');

  let open = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) { open = i; break; }
  }
  if (open === -1) throw new Error('unterminated: no opening fence after "## Initial Mode Template"');

  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === '```') { close = i; break; }
  }
  if (close === -1) throw new Error('unterminated fence in the Initial Mode Template');

  const body = lines.slice(open + 1, close).join('\n');

  // Fail loudly on an ambiguous fence rather than returning a truncated
  // template. The outer fence and any same-length inner fence are
  // indistinguishable to this scan — per CommonMark the outer block would
  // terminate at the inner one — so a nested ``` block silently cuts the
  // template short and every section past it reads as missing. Plan A's removal
  // of the Project Defaults block is what makes this file unambiguous; this
  // assertion is what stops that dependency from being a silent assumption.
  if (!/^## Don'ts$/m.test(body)) {
    throw new Error(
      'Initial Mode Template extraction stopped early — expected the template to end with '
      + "a \"## Don'ts\" section. A nested ``` fence inside the template will do this.",
    );
  }

  return body;
}

// Map each `## Heading` to its body text. Nested headings inside a section
// (the template has none after the Project Defaults removal) are not split out.
function splitSections(markdown) {
  const sections = new Map();
  let current = null;
  let buffer = [];
  for (const line of markdown.split('\n')) {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      if (current !== null) sections.set(current, buffer.join('\n'));
      current = m[1].trim();
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  if (current !== null) sections.set(current, buffer.join('\n'));
  return sections;
}

module.exports = { extractTemplateBody, splitSections };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add bin/lib/init/claude-md-conformance.js bin/lib/init/tests/claude-md-conformance.test.js
git diff --cached --name-only
git commit -F - <<'EOF'
Add template section extraction for the CLAUDE.md conformance check

The Initial Mode Template sits inside a fenced markdown block so its h2
headings do not collide with the carrying file's own documentation headings.
Extraction is fence-aware and throws on an unbalanced fence rather than
silently returning a truncated template — a partial template would report
every section past the break as missing.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 2: Classify the template's sections

Two explicit lists, plus a completeness assertion that fails on any section
belonging to neither. The lists are what drift; the assertion is what makes the
drift loud.

**Why not derive the lists.** The obvious heuristic — "a body that is entirely a
`{...}` placeholder is project-authored" — was tried against the live template
during plan authoring and **misclassifies `## Stack`**, whose body is a literal
markdown table skeleton (`| Layer | Tech |` / `|---|---|` / `| ... | ... |`) with
no `{...}` anywhere. Deriving the list would have silently pulled a
project-authored section into the conformance check and reported every project as
drifted on it. Explicit lists with a guard beat a heuristic that is wrong on real
data.

**Files:**
- Modify: `bin/lib/init/claude-md-conformance.js`
- Modify: `bin/lib/init/tests/claude-md-conformance.test.js`

**Interfaces:**
- Consumes: `splitSections` from Task 1
- Produces: `classifySections(sections) -> {pluginAuthored: string[], projectAuthored: string[]}` and the exported constant `PHILOSOPHY_EXCEPTION`

- [ ] **Step 1: Write the failing test**

Append to `bin/lib/init/tests/claude-md-conformance.test.js`:

```javascript
const { classifySections, PHILOSOPHY_EXCEPTION } = require('../claude-md-conformance');

test('classifySections sorts known sections into the two lists', () => {
  const sections = new Map([
    ['Stack', '\n| Layer | Tech |\n|---|---|\n| ... | ... |\n'],
    ['Working Approach', '\n- **Think before coding.** State assumptions.\n'],
    ['Philosophy', '\n{Adaptive principles. See "Generating Philosophy" below.}\n'],
  ]);
  const { pluginAuthored, projectAuthored, unclassified } = classifySections(sections);
  assert.deepStrictEqual(pluginAuthored.sort(), ['Philosophy', 'Working Approach']);
  assert.deepStrictEqual(projectAuthored, ['Stack']);
  assert.deepStrictEqual(unclassified, []);
});

test('Stack is project-authored despite having no {...} placeholder', () => {
  // Regression guard for the rejected heuristic: Stack's body is a literal
  // table skeleton, so "placeholder body means project-authored" classifies it
  // plugin-authored and every project then reports drift on it.
  const sections = new Map([['Stack', '\n| Layer | Tech |\n|---|---|\n| ... | ... |\n']]);
  const { projectAuthored, pluginAuthored } = classifySections(sections);
  assert.deepStrictEqual(projectAuthored, ['Stack']);
  assert.deepStrictEqual(pluginAuthored, []);
});

test('an unknown section is reported unclassified, never silently dropped', () => {
  const sections = new Map([['Deployment', '\n{how to deploy}\n']]);
  const { pluginAuthored, projectAuthored, unclassified } = classifySections(sections);
  assert.deepStrictEqual(unclassified, ['Deployment']);
  assert.deepStrictEqual(pluginAuthored, []);
  assert.deepStrictEqual(projectAuthored, []);
});

test('PHILOSOPHY_EXCEPTION names the present/absent-only section', () => {
  assert.strictEqual(PHILOSOPHY_EXCEPTION, 'Philosophy');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: FAIL — `classifySections is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add to `bin/lib/init/claude-md-conformance.js`, before `module.exports`:

```javascript
// Sections the plugin authors and therefore owns the content of. Only these are
// compared against the template.
const PLUGIN_AUTHORED_SECTIONS = [
  'Philosophy',
  'Working Approach',
  'claude-tweaks Pipeline',
];

// Sections the adopting project fills in from its own codebase. Never compared —
// a project's Stack table differing from the template's skeleton is the whole
// point of the template.
const PROJECT_AUTHORED_SECTIONS = [
  'Stack',
  'Structure',
  'Commands',
  'Conventions',
  'Testing',
  'Environment',
  'Git',
  "Don'ts",
];

// `## Philosophy` is plugin-authored but not byte-comparable: the Initial Mode
// Template carries only a placeholder for it, and its real content lives in the
// file's own "## Generating Philosophy" section and varies across three maturity
// blocks. It is reported present/absent only.
const PHILOSOPHY_EXCEPTION = 'Philosophy';

// A section in neither list is `unclassified` rather than silently assigned.
// Callers treat a non-empty `unclassified` as a hard error — that is what stops
// a newly added template section from escaping the conformance check.
function classifySections(sections) {
  const pluginAuthored = [];
  const projectAuthored = [];
  const unclassified = [];
  for (const name of sections.keys()) {
    if (PLUGIN_AUTHORED_SECTIONS.includes(name)) pluginAuthored.push(name);
    else if (PROJECT_AUTHORED_SECTIONS.includes(name)) projectAuthored.push(name);
    else unclassified.push(name);
  }
  return { pluginAuthored, projectAuthored, unclassified };
}
```

Export them: change the final line to

```javascript
module.exports = {
  extractTemplateBody,
  splitSections,
  classifySections,
  PLUGIN_AUTHORED_SECTIONS,
  PROJECT_AUTHORED_SECTIONS,
  PHILOSOPHY_EXCEPTION,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Add the completeness guard against the real template**

This is the test the design calls "section-list completeness" — it fails if someone adds a plugin-authored section the check would otherwise skip. Append:

```javascript
const fs = require('fs');
const path = require('path');

const TEMPLATE = path.resolve(
  __dirname, '..', '..', '..', '..', 'skills', 'init', 'claude-md-template.md',
);

test('every section in the live template is classified', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const { unclassified } = classifySections(splitSections(extractTemplateBody(src)));
  assert.deepStrictEqual(
    unclassified, [],
    'A template section belongs to neither PLUGIN_AUTHORED_SECTIONS nor '
    + 'PROJECT_AUTHORED_SECTIONS. Add it to one deliberately — this assertion exists so a '
    + 'new section cannot silently escape the conformance check.',
  );
});

test('the live template yields exactly the expected plugin-authored set', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const { pluginAuthored } = classifySections(splitSections(extractTemplateBody(src)));
  assert.deepStrictEqual(
    pluginAuthored.sort(),
    ['Philosophy', 'Working Approach', 'claude-tweaks Pipeline'].sort(),
  );
});

test('the live template still ends with Don\'ts — the fence is unambiguous', () => {
  // Guards the Plan A dependency: while the Project Defaults block existed, its
  // same-length inner fence truncated extraction here and Don'ts never appeared.
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const names = [...splitSections(extractTemplateBody(src)).keys()];
  assert.strictEqual(names[names.length - 1], "Don'ts");
});
```

- [ ] **Step 6: Run it against the real template**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: PASS. If it FAILS listing `Project Defaults`, Plan A Task 4 has not landed — stop and land Plan A first.

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add bin/lib/init/claude-md-conformance.js bin/lib/init/tests/claude-md-conformance.test.js
git diff --cached --name-only
git commit -F - <<'EOF'
Classify the template's sections with an explicit list plus a guard

Deriving the list was tried and rejected: the obvious heuristic — a body that
is entirely a {...} placeholder means project-authored — misclassifies Stack,
whose body is a literal markdown table skeleton with no placeholder in it.
That would have pulled a project-authored section into the conformance check
and reported every project as drifted on it. Verified against the live
template during plan authoring, not reasoned about.

Two explicit lists instead, with any section in neither returned as
unclassified rather than silently assigned. A completeness assertion against
the live template fails while unclassified is non-empty, so a newly added
template section cannot escape the check — the same guarantee the derivation
was meant to give, without a rule that is wrong on real data.

Philosophy stays a named constant: plugin-authored but not byte-comparable,
since the template carries only a placeholder for it and its generated
content varies across three maturity blocks.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 3: The conformance comparison

**Files:**
- Modify: `bin/lib/init/claude-md-conformance.js`
- Modify: `bin/lib/init/tests/claude-md-conformance.test.js`

**Interfaces:**
- Consumes: `classifySections`, `splitSections`, `extractTemplateBody`
- Produces: `checkConformance({templateSource, projectClaudeMd}) -> {missing, drifted, conformant}` — consumed by `skills/init/update-mode.md` Phase 1u.5

- [ ] **Step 1: Write the failing test**

Append:

```javascript
const { checkConformance } = require('../claude-md-conformance');

const TPL = [
  '## Initial Mode Template',
  '',
  '```markdown',
  '# {project name}',
  '',
  '## Stack',
  '',
  '{table}',
  '',
  '## Working Approach',
  '',
  '- **Think before coding.** State assumptions.',
  '',
  '## claude-tweaks Pipeline',
  '',
  '**Artifacts:** design doc then spec.',
  '```',
].join('\n');

test('a conformant project reports no missing and no drifted sections', () => {
  const project = [
    '# acme',
    '',
    '## Stack',
    '',
    '| Layer | Tech |',
    '',
    '## Working Approach',
    '',
    '- **Think before coding.** State assumptions.',
    '',
    '## claude-tweaks Pipeline',
    '',
    '**Artifacts:** design doc then spec.',
  ].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.drifted, []);
  assert.deepStrictEqual(r.conformant.sort(), ['Working Approach', 'claude-tweaks Pipeline'].sort());
});

test('an absent plugin-authored section is reported missing with its expected body', () => {
  const project = ['# acme', '', '## Stack', '', '| Layer | Tech |'].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing.map((m) => m.section).sort(), ['Working Approach', 'claude-tweaks Pipeline'].sort());
  const wa = r.missing.find((m) => m.section === 'Working Approach');
  assert.match(wa.expected, /Think before coding/);
});

test('an edited plugin-authored section is reported drifted, not missing', () => {
  const project = [
    '# acme',
    '',
    '## Working Approach',
    '',
    '- **Think before coding.** But ship fast.',
    '',
    '## claude-tweaks Pipeline',
    '',
    '**Artifacts:** design doc then spec.',
  ].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.drifted.map((d) => d.section), ['Working Approach']);
  assert.match(r.drifted[0].actual, /ship fast/);
  assert.match(r.drifted[0].expected, /State assumptions/);
});

test('project-authored sections are never reported', () => {
  const project = ['# acme', '', '## Working Approach', '', '- **Think before coding.** State assumptions.',
    '', '## claude-tweaks Pipeline', '', '**Artifacts:** design doc then spec.'].join('\n');
  const r = checkConformance({ templateSource: TPL, projectClaudeMd: project });
  const named = [...r.missing.map((m) => m.section), ...r.drifted.map((d) => d.section), ...r.conformant];
  assert.ok(!named.includes('Stack'), 'Stack is project-authored and must never be reported');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: FAIL — `checkConformance is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add before `module.exports`, and add `checkConformance` to the export object:

```javascript
// Philosophy's expected body is not comparable byte-for-byte: the template
// carries a placeholder, and the generated content varies by the project's
// maturity classification. It is reported present/absent only.
function checkConformance({ templateSource, projectClaudeMd }) {
  const templateSections = splitSections(extractTemplateBody(templateSource));
  const { pluginAuthored, unclassified } = classifySections(templateSections);
  if (unclassified.length) {
    throw new Error(
      `Unclassified template section(s): ${unclassified.join(', ')}. Add each to `
      + 'PLUGIN_AUTHORED_SECTIONS or PROJECT_AUTHORED_SECTIONS. Refusing to run a '
      + 'conformance check that would silently ignore them.',
    );
  }
  const projectSections = splitSections(projectClaudeMd);

  const missing = [];
  const drifted = [];
  const conformant = [];

  for (const section of pluginAuthored) {
    const expected = (templateSections.get(section) || '').trim();
    if (!projectSections.has(section)) {
      missing.push({ section, expected });
      continue;
    }
    if (section === PHILOSOPHY_EXCEPTION) {
      conformant.push(section);
      continue;
    }
    const actual = projectSections.get(section).trim();
    if (actual === expected) conformant.push(section);
    else drifted.push({ section, expected, actual });
  }

  return { missing, drifted, conformant };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test bin/lib/init/tests/claude-md-conformance.test.js
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Verify the check discriminates by reverting**

Reading a test is not evidence it fails when it should. Prove it:

```bash
cd "$(git rev-parse --show-toplevel)"
node -e "
const {checkConformance} = require('./bin/lib/init/claude-md-conformance');
const fs = require('fs');
const tpl = fs.readFileSync('skills/init/claude-md-template.md','utf8');
const {extractTemplateBody, splitSections} = require('./bin/lib/init/claude-md-conformance');
const body = extractTemplateBody(tpl);
// Build a project CLAUDE.md that is the template with Working Approach deleted.
const stripped = body.replace(/## Working Approach[\s\S]*?(?=\n## )/, '');
const r = checkConformance({templateSource: tpl, projectClaudeMd: stripped});
console.log('missing:', r.missing.map(m=>m.section));
if (!r.missing.some(m=>m.section==='Working Approach')) {
  throw new Error('DISCRIMINATION FAILURE: deleting Working Approach was not detected');
}
console.log('OK — deletion detected');
"
```

Expected: prints `missing: [ 'Working Approach' ]` then `OK — deletion detected`. If it prints `OK` without listing the section, the check is not discriminating and must be fixed before proceeding.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add bin/lib/init/claude-md-conformance.js bin/lib/init/tests/claude-md-conformance.test.js
git diff --cached --name-only
git commit -F - <<'EOF'
Add the CLAUDE.md conformance comparison

checkConformance returns missing, drifted, and conformant sets over the
plugin-authored sections only — a project's own Stack, Commands, and Don'ts
are never reported.

Philosophy is present/absent only: its template body is a placeholder and its
generated content varies by maturity classification, so a byte comparison
would report every project as drifted.

Discrimination verified by deleting Working Approach from a copy of the real
template and confirming the check reports it, rather than trusting that the
test reads correctly.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 4: Replace Phase 1u.5's marker table

**Files:**
- Modify: `skills/init/update-mode.md:42-57`

**Interfaces:**
- Consumes: `checkConformance` from Task 3
- Produces: Contract Drift entries feeding the Phase 3 Drift Report, unchanged in shape

- [ ] **Step 1: Replace the section body**

Replace `skills/init/update-mode.md` lines 42 through 57 inclusive — from `## Phase 1u.5: claude-tweaks Contract Drift` through `If all markers are present, record "Contract: up to date (v4.6+)" in the inventory and skip ahead.` — with:

````markdown
## Phase 1u.5: claude-tweaks Contract Drift

An existing CLAUDE.md may not match the plugin's current template — because it
predates a template change, or because someone edited a plugin-authored section
in place. Detect both so Update Mode can offer pre-filled patches.

This check is deterministic and compares against the template **live**, so a
future template change is picked up with no edit here. Run:

```bash
node -e "
const {checkConformance} = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/init/claude-md-conformance');
const fs = require('fs');
const tpl = fs.readFileSync(process.env.CLAUDE_PLUGIN_ROOT + '/skills/init/claude-md-template.md','utf8');
const project = fs.readFileSync('CLAUDE.md','utf8');
console.log(JSON.stringify(checkConformance({templateSource: tpl, projectClaudeMd: project}), null, 2));
"
```

Read the result:

- **`missing`** — the section is absent entirely. Record a **Contract Drift**
  entry whose suggested patch inserts the entry's `expected` body verbatim. No
  creative writing required.
- **`drifted`** — the section exists but its body differs from the template's.
  Record a **Contract Drift** entry offering a re-sync, showing `actual` and
  `expected`. A deliberate local edit is a legitimate answer here — the entry is
  an offer, never an automatic overwrite.
- **`conformant`** — no entry.

Carry every entry forward into the Drift Report (Phase 3) under a dedicated
"Contract Drift" section so the user can approve them as a batch alongside other
CLAUDE.md patches.

`## Philosophy` is reported present/absent only, never drifted — its content
varies by the project's maturity classification, so a byte comparison would flag
every project. Its *content* freshness is `/claude-tweaks:harness-health`'s
"Philosophy matches current maturity" check, not this one.

If `missing` and `drifted` are both empty, record "Contract: conformant with the
installed template" in the inventory and skip ahead.
````

- [ ] **Step 2: Verify no stale marker vocabulary survives**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n "Bookend architecture\|pipelines/{run-id}\|v4\.6+\|v4\.5+\|v4\.0+" skills/init/update-mode.md
```

Expected: no output. These were the four contract-version markers and their version gates.

- [ ] **Step 3: Confirm Plan A's dangling reference is now resolved**

Plan A Task 4 Step 5 recorded a hit at `update-mode.md:51` citing the deleted Project Defaults block. That row is gone with the table:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "Project Defaults" --include="*.md" skills/init/
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/init/update-mode.md
git diff --cached --name-only
git commit -F - <<'EOF'
Replace Phase 1u.5's contract markers with a live conformance check

The four greps detected version drift against a hand-maintained marker list
and covered neither Working Approach nor Philosophy — both appeared zero
times in this file, so a project adopting the plugin with an existing
CLAUDE.md got the pipeline wiring offered as patches and never the two
sections that shape model behavior.

The replacement compares against the template live, so a future template
change needs no edit here, and reports drift as well as absence — an edited
plugin-authored section was previously invisible.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 5: Add wrap-up's gated CLAUDE.md audit

**Files:**
- Modify: `skills/wrap-up/SKILL.md` (new Step 7.9, after Step 7.8)

**Interfaces:**
- Consumes: `_shared/harness-health-analysis.md` (existing procedure)
- Produces: staged CLAUDE.md findings surfacing at the Review Console (Step 8.6)

- [ ] **Step 1: Read the current conventions fresh**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n -A4 "Interaction style directive" CLAUDE.md | head -12
sed -n '179,202p' skills/wrap-up/SKILL.md
```

The gate wording below copies Step 7's structure deliberately — same "Gate the read" framing, same mandatory-summary-when-closed rule.

- [ ] **Step 2: Insert Step 7.9 after Step 7.8**

Insert immediately before the section that follows `## Step 7.8: Journey Curation`:

````markdown
## Step 7.9: CLAUDE.md Curation

The end of a piece of work is when a convention changed, a command was renamed,
or an incident happened — the moment CLAUDE.md is most likely to have gone
stale, and the moment the context explaining why is still available. Rotation
finds the same drift weeks later, cold.

**Gate the read.** Run the audit when **any** of these holds:

- `/claude-tweaks:reflect` or the ledger produced a Don't candidate (a `[claude-md: …]`-tagged
  ledger entry, or a reflection insight naming a pattern that should not be repeated)
- A command listed in CLAUDE.md's `## Commands` section was renamed or removed in
  this work's diff
- A convention asserted in CLAUDE.md's `## Conventions` section is contradicted by
  this work's diff
- An incident account was recorded for this work

When one holds, read `_shared/harness-health-analysis.md` and apply it with
`assetType: claude-md` against the project's `CLAUDE.md` — the same procedure
Step 7 applies to skills. Findings **stage**; they never auto-apply, per that
file's standing CLAUDE.md exception.

When **none** holds, skip the read and emit the mandatory summary line directly:

```
SCANNED {time} — Step 7.9 CLAUDE.md curation summary: audit not run (no CLAUDE.md-relevant signal in this work — no Don't candidate, no renamed command, no contradicted convention, no recorded incident).
Result: 0 staged.
Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag
(`_shared/auto-decision-log.md`); interactive mode prints it inline. **`audit not
run` is deliberate and must never be rendered as `no findings`** — a gate that
never opened is indistinguishable from a clean CLAUDE.md unless the summary says
which one happened. When the gate did open, the summary instead names the signal
that opened it and the finding count, so the two cases are never confusable.
````

- [ ] **Step 3: Verify the summary distinguishes the two cases**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n "audit not run" skills/wrap-up/SKILL.md
grep -c "no findings" skills/wrap-up/SKILL.md
```

Expected: the first returns the Step 7.9 line. The second must not have increased — confirm by comparing against `git show HEAD:skills/wrap-up/SKILL.md | grep -c "no findings"`.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/wrap-up/SKILL.md
git diff --cached --name-only
git commit -F - <<'EOF'
Add wrap-up Step 7.9 — gated CLAUDE.md curation

Step 7 audits skills at the end of every run; CLAUDE.md was never audited
anywhere in the pipeline, so a convention change discovered during the work
waited for a harness-health rotation to rediscover it from git churn without
the context that produced it.

The gate copies the applicability pattern 47fa4aae established for Step 7's
nine sub-file reads, so a run with no relevant signal pays nothing. The
closed-gate summary says "audit not run" rather than "no findings" — a gate
that never opened is otherwise indistinguishable from a clean CLAUDE.md.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

### Task 6: Correct the Scope note and bump

**Files:**
- Modify: `skills/_shared/harness-health-analysis.md:11`
- Modify: `.claude-plugin/plugin.json`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 5's Step 7.9
- Produces: the release record

- [ ] **Step 1: Correct the Scope note**

`skills/_shared/harness-health-analysis.md:11` currently reads:

```
**Scope note:** all three consumers can read every section of this procedure. `/claude-tweaks:wrap-up` and `/claude-tweaks:init` currently only invoke it against skills (their own scope-selection logic hasn't been extended to pass rule/CLAUDE.md files in) — extending them is a separate, smaller follow-on, not required by the harness-health design. `/claude-tweaks:harness-health` is the only consumer that exercises the rule/claude-md paths today.
```

Replace with:

```
**Scope note:** all three consumers can read every section of this procedure. `/claude-tweaks:wrap-up` invokes it against skills (Step 7) and, behind an applicability gate, against CLAUDE.md (Step 7.9). `/claude-tweaks:init` Phase 6 invokes it against skills only; its CLAUDE.md path is Phase 1u.5's deterministic conformance check (`bin/lib/init/claude-md-conformance.js`), which detects structural drift rather than judging content, so the two are complementary rather than redundant. `/claude-tweaks:harness-health` remains the only consumer that exercises the `rule` path.
```

- [ ] **Step 2: Verify the consumer table above it still agrees**

The Scope note sits directly below a Consumer/Supplies table. A note contradicting the table it annotates is worse than a stale note (`[IL-77]`):

```bash
cd "$(git rev-parse --show-toplevel)"
sed -n '1,14p' skills/_shared/harness-health-analysis.md
```

Confirm the `/claude-tweaks:wrap-up` row's "Supplies" cell does not claim skill-only scope. If it says "skill-only this phase", update it to name both Step 7 (skills) and Step 7.9 (CLAUDE.md).

- [ ] **Step 3: Check for a concurrent bump, then bump**

```bash
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
git show origin/main:.claude-plugin/plugin.json | grep '"version"'
```

Set `version` to the next free minor above both `origin/main` and Plan A's bump.

- [ ] **Step 4: Add the CHANGELOG entry**

```markdown
## v6.34.0 — CLAUDE.md conformance replaces version markers; wrap-up gains a gated audit

`/claude-tweaks:init` Update Mode detected CLAUDE.md drift with four hand-maintained
greps for contract-version markers. `Working Approach` and `Philosophy` appeared
zero times in `update-mode.md`, so a project adopting the plugin with an existing
CLAUDE.md reliably got the pipeline plumbing offered as patches and never the two
sections that shape how the model behaves.

The replacement is deterministic and reads the template live, so a future template
change needs no edit. It derives the plugin-authored section list from the template
rather than hardcoding it — a section whose body is entirely a `{...}` placeholder is
project-authored, one with a literal body is plugin-authored, with `## Philosophy` the
single documented exception. A completeness assertion fails if a section changes
classification, so a newly added plugin-authored section cannot silently escape the
check. It also reports *drift*, not just absence: an edited plugin-authored section
was previously invisible.

`/claude-tweaks:wrap-up` gains Step 7.9, a CLAUDE.md audit behind the same
applicability gate `47fa4aae` established for Step 7's sub-file reads. It opens on a
Don't candidate, a renamed command, a contradicted convention, or a recorded incident,
and reuses `_shared/harness-health-analysis.md` — the procedure Step 7 already applies
to skills. The closed-gate summary reports "audit not run" rather than "no findings",
since a gate that never opened is otherwise indistinguishable from a clean CLAUDE.md.
```

- [ ] **Step 5: Run the full suite**

```bash
cd "$(git rev-parse --show-toplevel)"
npm test 2>&1 | tail -25
```

Expected: all suites pass, including the new `bin/lib/init/tests/`.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add skills/_shared/harness-health-analysis.md .claude-plugin/plugin.json CHANGELOG.md
git diff --cached --name-only
git commit -F - <<'EOF'
Correct the Scope note, bump to 6.34.0, add the CHANGELOG entry

The Scope note said wrap-up and init invoke the shared procedure against
skills only and called extending them a pending follow-on. Step 7.9 makes
that false for wrap-up; init's CLAUDE.md path is the deterministic
conformance check rather than this procedure, which the note now states so
the two are not read as redundant.

Claude-Session: https://claude.ai/code/session_01YTkaGS58t7rDkPwkFPjPyY
EOF
```

---

## Self-Review

**Spec coverage.** Design's Plan B scope: the conformance module reading the template live (Tasks 1-3); replacing Phase 1u.5's marker greps (Task 4); wrap-up's gated audit (Task 5); the Scope note correction (Task 6). All covered.

**Three things running the code corrected, none of which the unit-test fixtures would have caught.**

1. **`## Philosophy` is not byte-comparable.** It is a `{...}` placeholder in the Initial Mode Template, its real content lives in the separate `## Generating Philosophy` section, and its generated form varies across three maturity blocks. Byte-comparing it reports every project as drifted. Task 3 reports it present/absent only and routes content freshness to harness-health's existing "Philosophy matches current maturity" check.

2. **The derivation heuristic was wrong.** An earlier draft derived the plugin-authored list from the template — "a body that is entirely a `{...}` placeholder is project-authored." Run against the live template it classified `## Stack` as **plugin-authored**, because Stack's body is a literal table skeleton (`| Layer | Tech |` / `| ... | ... |`) with no placeholder. Every adopting project would then have reported drift on its own Stack table. Replaced with explicit lists plus an `unclassified` guard, which preserves the "a new section can't escape the check" property without a rule that is wrong on real data.

3. **The template's fencing is ambiguous until Plan A lands.** The outer ```` ``` ```` and the Project Defaults block's inner ```` ``` ```` are the same length, so per CommonMark the outer block terminates at the inner one — extraction stops early and `## Don'ts` never appears. Confirmed by running extraction against the current file (11 sections expected, 11 returned only after simulating Plan A's deletion). `extractTemplateBody` now asserts the body ends with `## Don'ts` and throws otherwise, so the Plan A dependency is enforced rather than assumed, with a dedicated test for the nested-fence shape.

**Step-count note.** The "Expected: PASS, N tests" figures in Tasks 1-3 are approximate — count what the runner reports rather than matching the number.

**Placeholder scan.** No TBD/TODO. Every code step carries runnable code. Task 5's gate conditions are enumerated literally, not described as a rule.

**Type consistency.** `checkConformance` returns `{missing: [{section, expected}], drifted: [{section, expected, actual}], conformant: [string]}` — the same shape asserted in Task 3's tests and consumed by Task 4's skill prose. `extractTemplateBody`/`splitSections`/`classifySections`/`PHILOSOPHY_EXCEPTION` are exported under the names Tasks 2 and 3 import.

**Cross-plan note.** Task 2 Step 6 fails loudly if Plan A has not landed, rather than silently comparing against the old template.
