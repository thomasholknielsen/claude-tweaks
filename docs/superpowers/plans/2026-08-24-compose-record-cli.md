# bin/compose-record.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `plugin/bin/compose-record.js`, a CLI that takes a JSON payload file and emits a validated, escaping-safe work-record body file — replacing the hand-rolled `node -e ... recordPayload ... writeFileSync` two-step dance repeated at capture and specify's record-creation sites.

**Architecture:** A pure module (`plugin/bin/lib/compose-record/compose.js`) exposes `composeBody(payload)` (thin wrapper over the existing `recordPayload` from `bin/lib/issues/record.js`) and `validateShaped(body)` (a reusable implementation of `_shared/work-record.md`'s spec-shaped-body structural check — the check today only exists as manual prose in `specify/shaping-mode.md`'s Read-back verification and `capture/SKILL.md`'s Shaped-body branch). A thin CLI (`plugin/bin/compose-record.js`), shaped exactly like `bin/log-decision.js` (#686's precedent — injectable `stdout`/`stderr` deps, direct `fs` calls, `run(argv, deps)` exported alongside the `require.main` guard), reads the JSON payload file, composes, optionally validates, and writes the body to `--out`.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `work/800-spec.md` (materialized from GitHub issue #800) in this worktree.

## Global Constraints

- Match #686's (`bin/log-decision.js`) CLI conventions exactly: `run(argv, deps)` + `parseArgs(argv)` exported, `require.main === module` guard, a `USAGE` string constant, `--help`/`-h` prints usage and exits 0, unknown flags are a usage error.
- The payload travels as a **file path argument**, never as CLI flags for field values — this is what buys escaping-safety for multi-line/quote/backtick/`$()`-bearing body text (the whole point of the record).
- Validation logic must literally reuse `_shared/work-record.md`'s spec-shaped-body definition: sections `## Current State`, `## Deliverables`, `## Acceptance Criteria` present and non-empty; no unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) anywhere in the body.
- `--require-shaped` is opt-in, not default-on: the parent-record body (`specify/record-creation.md`) is a design summary with none of those three sections by design, and a `needs:definition` body (`capture/SKILL.md`'s Judging-Definition-first branch) legitimately omits `## Acceptance Criteria`. Forcing the check unconditionally would break both existing, legitimate shapes.

---

### Task 1: `compose.js` — composition + shape-validation module

**Files:**
- Create: `plugin/bin/lib/compose-record/compose.js`
- Test: `tests/bin-lib/compose-record/compose.test.js`

**Interfaces:**
- Consumes: `recordPayload` from `plugin/bin/lib/issues/record.js` — signature `recordPayload({ title, body, type, origin, risk, size, ceremony, solutionUnjustified, ready, parked, priority, fingerprint, deferReason })` → `{ title, body, labels, type }` (throws `Error` on invalid field values — already-existing behavior, read at `plugin/bin/lib/issues/record.js:159-231`).
- Produces (consumed by Task 2): `composeBody(payload)` → `{ title, body, labels, type }` (same shape as `recordPayload`, may throw the same errors). `validateShaped(body)` → `{ ok: boolean, gaps: string[] }` — `gaps` is empty iff `ok`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/bin-lib/compose-record/compose.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { composeBody, validateShaped, splitSections } = require('../../../plugin/bin/lib/compose-record/compose');

const SHAPED = [
  '## Current State',
  '',
  'Some current state text.',
  '',
  '## Deliverables',
  '',
  '- [ ] Do the thing.',
  '',
  '## Acceptance Criteria',
  '',
  '1. The thing is done.',
].join('\n');

test('composeBody wraps recordPayload — fingerprint marker appended', () => {
  const result = composeBody({ title: 'x', body: 'body text', type: 'feature', fingerprint: 'design:unit' });
  assert.equal(result.title, 'x');
  assert.equal(result.type, 'feature');
  assert.match(result.body, /body text\n\n<!-- work-fingerprint: design:unit -->$/);
});

test('composeBody propagates recordPayload validation errors', () => {
  assert.throws(() => composeBody({ title: 'x', body: 'b', type: 'not-a-real-type' }), /type/);
  assert.throws(() => composeBody({ title: '', body: 'b', type: 'feature' }), /title/);
});

test('validateShaped: ok on a well-formed spec-shaped body', () => {
  const result = validateShaped(SHAPED);
  assert.deepEqual(result, { ok: true, gaps: [] });
});

test('validateShaped: flags a missing section', () => {
  const body = SHAPED.replace('## Acceptance Criteria\n\n1. The thing is done.', '');
  const result = validateShaped(body);
  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((g) => /missing section: ## Acceptance Criteria/.test(g)));
});

test('validateShaped: flags an empty (whitespace-only) section', () => {
  const body = SHAPED.replace('- [ ] Do the thing.', '');
  const result = validateShaped(body);
  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((g) => /empty section: ## Deliverables/.test(g)));
});

test('validateShaped: flags TBD/TODO/<!-- ambiguity: anywhere in the body, not only inside the three sections', () => {
  assert.equal(validateShaped(SHAPED + '\n\n## Gotchas\n\nTBD').ok, false);
  assert.equal(validateShaped(SHAPED + '\n\n## Gotchas\n\nTODO: fill in').ok, false);
  assert.equal(validateShaped(SHAPED + '\n\n## Gotchas\n\n<!-- ambiguity: which flag -->').ok, false);
});

test('validateShaped: multiple gaps are all reported at once, not just the first', () => {
  const result = validateShaped('## Deliverables\n\nTBD');
  assert.equal(result.ok, false);
  assert.ok(result.gaps.length >= 3, `expected >=3 gaps, got ${JSON.stringify(result.gaps)}`);
});

test('splitSections: line-anchored ## headings only — a mid-line "## " is not a heading', () => {
  const sections = splitSections('## Current State\n\ntext with ## not a heading inline\n\n## Deliverables\n\nmore');
  assert.equal(Object.keys(sections).length, 2);
  assert.match(sections['Current State'], /## not a heading inline/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/compose-record/compose.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/compose-record/compose'`

- [ ] **Step 3: Write the implementation**

```js
// plugin/bin/lib/compose-record/compose.js
// Composition + spec-shaped-body validation for bin/compose-record.js. Reuses the existing
// recordPayload composer (bin/lib/issues/record.js) for body assembly (fingerprint marker,
// Defer-reason prefix, label derivation) and adds the one check that composer does not make:
// _shared/work-record.md's spec-shaped-body structural check, today only ever applied by
// hand — specify/shaping-mode.md's Read-back verification and capture/SKILL.md's Shaped-body
// branch both restate this same three-section-plus-placeholder-marker check in prose.
'use strict';

const { recordPayload } = require('../issues/record');

const REQUIRED_SECTIONS = ['Current State', 'Deliverables', 'Acceptance Criteria'];
const PLACEHOLDER_MARKERS = ['TBD', 'TODO', '<!-- ambiguity:'];

// body -> { [headingText]: contentString } — content is every line between one line-anchored
// "## {Heading}" line and the next (or end of string), trimmed. A "## " appearing mid-line
// (not at the start of a line) is never treated as a heading.
function splitSections(body) {
  const lines = String(body || '').split('\n');
  const raw = {};
  let current = null;
  for (const line of lines) {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      current = m[1].trim();
      if (!(current in raw)) raw[current] = [];
      continue;
    }
    if (current !== null) raw[current].push(line);
  }
  const out = {};
  for (const [heading, contentLines] of Object.entries(raw)) out[heading] = contentLines.join('\n').trim();
  return out;
}

// body -> { ok, gaps: string[] } — gaps names every failing check at once (never just the
// first), matching materialize.md's Materialization hard gate's own all-at-once reporting
// convention. Reused verbatim from _shared/work-record.md's Spec-shaped body section.
function validateShaped(body) {
  const text = String(body || '');
  const sections = splitSections(text);
  const gaps = [];
  for (const name of REQUIRED_SECTIONS) {
    if (!(name in sections)) gaps.push(`missing section: ## ${name}`);
    else if (!sections[name]) gaps.push(`empty section: ## ${name}`);
  }
  for (const marker of PLACEHOLDER_MARKERS) {
    if (text.includes(marker)) gaps.push(`unresolved placeholder marker: ${marker}`);
  }
  return { ok: gaps.length === 0, gaps };
}

// payload -> { title, body, labels, type } — thin wrapper; recordPayload's own validation
// errors (bad title/type/tier/deferReason, conflicting ready+parked) propagate unchanged.
function composeBody(payload) {
  return recordPayload(payload || {});
}

module.exports = { composeBody, validateShaped, splitSections, REQUIRED_SECTIONS, PLACEHOLDER_MARKERS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/compose-record/compose.test.js`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/compose-record/compose.js tests/bin-lib/compose-record/compose.test.js
git commit -m "Add compose-record composition + shape-validation module (refs #800)"
```

---

### Task 2: `compose-record.js` — the CLI

**Files:**
- Create: `plugin/bin/compose-record.js`
- Test: `tests/bin-lib/compose-record/cli.test.js`

**Interfaces:**
- Consumes: `composeBody`, `validateShaped` from Task 1's `plugin/bin/lib/compose-record/compose.js`.
- Produces: `node bin/compose-record.js <payload-file> --out <body-file> [--require-shaped] [--help]`. Exit codes: `0` success (prints `{"title","type","labels","out"}` JSON to stdout); `2` malformed invocation (bad args, unreadable/unparsable payload file, missing `--out`); `3` payload validation error (a `recordPayload` rejection); `4` shape validation failed (`--require-shaped` only — gaps printed to stderr, one per line); `5` could not write `--out`. `run(argv, deps)` and `parseArgs(argv)` are exported for the test file (`deps = { stdout, stderr }`, defaulting to real `process.stdout`/`process.stderr` writes — mirrors `bin/log-decision.js`'s own `realDeps` shape, dropping the `now`/`cwd`/`mainRoot` fields that file needs only for its run-dir anchoring check, which this CLI has no equivalent of).

- [ ] **Step 1: Write the failing tests**

```js
// tests/bin-lib/compose-record/cli.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../plugin/bin/compose-record');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'compose-record-'));
}

function deps(out) {
  return { stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) };
}

const streamOf = (out, kind) => out.filter((o) => o[0] === kind).map((o) => o[1]).join('');

const SHAPED_PAYLOAD = {
  title: 'A title',
  body: '## Current State\n\ntext\n\n## Deliverables\n\n- [ ] thing\n\n## Acceptance Criteria\n\n1. done',
  type: 'feature',
  fingerprint: 'design-x:unit-y',
};

test('composes and writes the body; prints the envelope', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  const outFile = path.join(dir, 'body.md');
  fs.writeFileSync(payloadFile, JSON.stringify(SHAPED_PAYLOAD));
  const out = [];
  const code = run([payloadFile, '--out', outFile], deps(out));
  assert.equal(code, 0);
  const written = fs.readFileSync(outFile, 'utf8');
  assert.match(written, /## Current State/);
  assert.match(written, /<!-- work-fingerprint: design-x:unit-y -->$/);
  const envelope = JSON.parse(streamOf(out, 'out'));
  assert.equal(envelope.title, 'A title');
  assert.equal(envelope.type, 'feature');
  assert.equal(envelope.out, outFile);
});

test('escaping-safety: quotes, backticks, newlines, and $() in title/body survive verbatim', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  const outFile = path.join(dir, 'body.md');
  const tricky = {
    title: `A "quoted" title with \`backticks\` and $(rm -rf /)`,
    body: '## Current State\n\nline one\nline two with `code` and "quotes" and $(danger)\n\n## Deliverables\n\n- [ ] x\n\n## Acceptance Criteria\n\n1. y',
    type: 'bug',
  };
  fs.writeFileSync(payloadFile, JSON.stringify(tricky));
  const code = run([payloadFile, '--out', outFile], deps([]));
  assert.equal(code, 0);
  const written = fs.readFileSync(outFile, 'utf8');
  assert.match(written, /line two with `code` and "quotes" and \$\(danger\)/);
});

test('--require-shaped: passes a well-shaped body', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  const outFile = path.join(dir, 'body.md');
  fs.writeFileSync(payloadFile, JSON.stringify(SHAPED_PAYLOAD));
  const code = run([payloadFile, '--out', outFile, '--require-shaped'], deps([]));
  assert.equal(code, 0);
});

test('--require-shaped: fails (exit 4) and lists gaps for an unshaped body', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  const outFile = path.join(dir, 'body.md');
  fs.writeFileSync(payloadFile, JSON.stringify({ title: 't', body: '## Current State\n\nTODO', type: 'feature' }));
  const out = [];
  const code = run([payloadFile, '--out', outFile, '--require-shaped'], deps(out));
  assert.equal(code, 4);
  const err = streamOf(out, 'err');
  assert.match(err, /missing section: ## Deliverables/);
  assert.match(err, /unresolved placeholder marker: TODO/);
  assert.equal(fs.existsSync(outFile), false, 'nothing written on a shape-validation failure');
});

test('without --require-shaped, an unshaped (e.g. parent-record) body still composes and writes', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  const outFile = path.join(dir, 'body.md');
  fs.writeFileSync(payloadFile, JSON.stringify({ title: 'Parent', body: 'Design summary, no sections at all.', type: 'feature' }));
  const code = run([payloadFile, '--out', outFile], deps([]));
  assert.equal(code, 0);
  assert.match(fs.readFileSync(outFile, 'utf8'), /Design summary/);
});

test('malformed invocations exit 2', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  fs.writeFileSync(payloadFile, JSON.stringify(SHAPED_PAYLOAD));
  assert.equal(run([], deps([])), 2, 'missing payload-file arg');
  assert.equal(run([payloadFile], deps([])), 2, 'missing --out');
  assert.equal(run([path.join(dir, 'missing.json'), '--out', path.join(dir, 'o.md')], deps([])), 2, 'unreadable payload file');
  const badJsonFile = path.join(dir, 'bad.json');
  fs.writeFileSync(badJsonFile, '{not json');
  assert.equal(run([badJsonFile, '--out', path.join(dir, 'o.md')], deps([])), 2, 'invalid JSON');
  assert.equal(run([payloadFile, '--bogus'], deps([])), 2, 'unknown flag');
});

test('a recordPayload rejection exits 3', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  fs.writeFileSync(payloadFile, JSON.stringify({ title: 't', body: 'b', type: 'not-a-real-type' }));
  const out = [];
  const code = run([payloadFile, '--out', path.join(dir, 'o.md')], deps(out));
  assert.equal(code, 3);
  assert.match(streamOf(out, 'err'), /type/);
});

test('a write failure to --out exits 5', () => {
  const dir = tmpDir();
  const payloadFile = path.join(dir, 'payload.json');
  fs.writeFileSync(payloadFile, JSON.stringify(SHAPED_PAYLOAD));
  const outAsDir = path.join(dir, 'body-as-dir.md');
  fs.mkdirSync(outAsDir);
  const out = [];
  const code = run([payloadFile, '--out', outAsDir], deps(out));
  assert.equal(code, 5);
  assert.match(streamOf(out, 'err'), /could not write --out/);
});

test('--help prints usage and exits 0', () => {
  const out = [];
  assert.equal(run(['--help'], deps(out)), 0);
  assert.match(streamOf(out, 'out'), /usage: compose-record\.js/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/compose-record/cli.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/compose-record'`

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// bin/compose-record.js — compose + validate a work-record body from a JSON payload file.
//   node bin/compose-record.js <payload-file> --out <body-file> [--require-shaped] [--help]
// Exit 0 = composed and written (prints {title,type,labels,out} JSON to stdout);
// 2 = malformed invocation (bad args, missing/unreadable/unparsable payload file, missing --out);
// 3 = payload validation error (recordPayload rejected a field — see stderr);
// 4 = shape validation failed (--require-shaped only — gaps on stderr, one per line);
// 5 = could not write --out.
// Consolidates the "compose a payload, write it to a temp JSON file, then read the JSON back
// out to extract just its .body field" node -e pattern repeated across capture/SKILL.md and
// specify/record-creation.md (#800) into one canonical, tested CLI — #686's release-claim.js /
// log-decision.js precedent for shape (injectable stdout/stderr deps, run(argv, deps) exported
// alongside the require.main guard, direct fs calls with no injection needed for them).
'use strict';

const fs = require('fs');
const { composeBody, validateShaped } = require('./lib/compose-record/compose');

const USAGE = 'usage: compose-record.js <payload-file> --out <body-file> [--require-shaped] [--help]\n';

function parseArgs(argv) {
  const o = { payloadFile: null, out: null, requireShaped: false, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--out') o.out = next();
    else if (a === '--require-shaped') o.requireShaped = true;
    else if (a.startsWith('--')) return { error: `unknown argument: ${a}` };
    else positional.push(a);
  }
  if (positional.length > 1) return { error: `unexpected argument: ${positional[1]}` };
  o.payloadFile = positional[0] || null;
  return o;
}

const realDeps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`compose-record.js: ${message}\n` + USAGE); return 2; };
  if (o.error) return usageError(o.error);
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.payloadFile) return usageError('<payload-file> is required');
  if (!o.out) return usageError('--out <body-file> is required');

  let raw;
  try { raw = fs.readFileSync(o.payloadFile, 'utf8'); } catch (err) {
    return usageError(`could not read payload file: ${o.payloadFile} (${err && err.message})`);
  }
  let payload;
  try { payload = JSON.parse(raw); } catch (err) {
    return usageError(`payload file is not valid JSON: ${o.payloadFile} (${err && err.message})`);
  }

  let result;
  try { result = composeBody(payload); } catch (err) {
    deps.stderr(`compose-record.js: payload rejected: ${err && err.message}\n`);
    return 3;
  }

  if (o.requireShaped) {
    const shaped = validateShaped(result.body);
    if (!shaped.ok) {
      deps.stderr(`compose-record.js: body is not spec-shaped:\n${shaped.gaps.map((g) => `  - ${g}`).join('\n')}\n`);
      return 4;
    }
  }

  try { fs.writeFileSync(o.out, result.body); } catch (err) {
    deps.stderr(`compose-record.js: could not write --out file: ${o.out} (${err && err.message})\n`);
    return 5;
  }

  deps.stdout(JSON.stringify({ title: result.title, type: result.type, labels: result.labels, out: o.out }) + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/compose-record/cli.test.js`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Make it executable and commit**

```bash
chmod +x plugin/bin/compose-record.js
git add plugin/bin/compose-record.js tests/bin-lib/compose-record/cli.test.js
git commit -m "Add compose-record.js CLI (refs #800)"
```

---

### Task 3: Cite the CLI from `capture/SKILL.md`

**Files:**
- Modify: `plugin/skills/capture/SKILL.md:178-184`

**Interfaces:**
- Consumes: `plugin/bin/compose-record.js` (Task 2) — invoked exactly as `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" <payload-file> --out <body-file>`.

- [ ] **Step 1: Replace the two-step compose-then-extract script**

In `plugin/skills/capture/SKILL.md`, the block currently reads (lines 178-184):

````markdown
2. Build the payload via `recordPayload` and create the issue. Both temp files below key off `$CLAUDE_CODE_SESSION_ID` (the same session identity `_shared/issue-claims.md` stamps on a claim) rather than a fixed name — a concurrent `/capture` invocation against the same checkout gets its own path, never this session's:

   ```bash
   node -e "const {recordPayload}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
     const p=recordPayload({title:process.argv[1], body:process.argv[2], type:process.argv[3], origin:'capture'});
     require('fs').writeFileSync('/tmp/capture-' + (process.env.CLAUDE_CODE_SESSION_ID||'') + '-payload.json', JSON.stringify(p))" "$TITLE" "$BODY" "$TYPE"

   node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-' + (process.env.CLAUDE_CODE_SESSION_ID||'') + '-payload.json','utf8')).body)" > "/tmp/capture-${CLAUDE_CODE_SESSION_ID}-body.md"
   ```
````

Replace it with:

````markdown
2. Build the payload and write the body file via `bin/compose-record.js` (#686/#800's CLI precedent — replaces the hand-rolled compose-then-extract `node -e` pair). The temp payload path keys off `$CLAUDE_CODE_SESSION_ID` (the same session identity `_shared/issue-claims.md` stamps on a claim) rather than a fixed name — a concurrent `/capture` invocation against the same checkout gets its own path, never this session's:

   ```bash
   node -e "require('fs').writeFileSync('/tmp/capture-' + (process.env.CLAUDE_CODE_SESSION_ID||'') + '-payload.json', JSON.stringify({title:process.argv[1], body:process.argv[2], type:process.argv[3], origin:'capture'}))" "$TITLE" "$BODY" "$TYPE"

   node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" "/tmp/capture-${CLAUDE_CODE_SESSION_ID}-payload.json" --out "/tmp/capture-${CLAUDE_CODE_SESSION_ID}-body.md"
   ```
````

Use `Edit` with `old_string` matching the fenced block above (including its leading numbered-list sentence) and `new_string` the replacement.

- [ ] **Step 2: Verify by hand-tracing the replaced flow**

Confirm the new two-line block still writes `"/tmp/capture-${CLAUDE_CODE_SESSION_ID}-body.md"` (the exact path the very next step, `gh issue create --body-file`, already reads at line 192/199 — unchanged, not part of this edit) — the CLI's `--out` argument is that same literal path, so nothing downstream of this block needs to change. Confirm the payload JSON's field names (`title`, `body`, `type`, `origin`) match `recordPayload`'s parameter names exactly (`plugin/bin/lib/issues/record.js:159`), since `compose-record.js` passes the parsed JSON straight through to `composeBody` (Task 1) with no renaming.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/capture/SKILL.md
git commit -m "capture: cite bin/compose-record.js instead of inlining a compose script (refs #800)"
```

---

### Task 4: Cite the CLI from `specify/record-creation.md` (parent + sub-issue)

**Files:**
- Modify: `plugin/skills/specify/record-creation.md:63-77` (parent), `plugin/skills/specify/record-creation.md:193-211` (sub-issue)

**Interfaces:**
- Consumes: `plugin/bin/compose-record.js` (Task 2), same invocation shape as Task 3.

- [ ] **Step 1: Replace the parent-record compose-then-extract block**

The block currently reads (lines 63-77):

````markdown
```bash
SPECIFY_PARENT_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-payload.json') || require('path').join(require('os').tmpdir(), 'specify-parent-payload.json'))
")
SPECIFY_PARENT_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-body.md') || require('path').join(require('os').tmpdir(), 'specify-parent-body.md'))
")

node -e "const {recordPayload}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const p=recordPayload({title:process.argv[1], body:process.argv[2], type:'feature', fingerprint:process.argv[3]});
  require('fs').writeFileSync('$SPECIFY_PARENT_PAYLOAD', JSON.stringify(p))" "$PARENT_TITLE" "$PARENT_BODY" "${DESIGN_DOC_SLUG}:parent"

node -e "console.log(JSON.parse(require('fs').readFileSync('$SPECIFY_PARENT_PAYLOAD','utf8')).body)" > "$SPECIFY_PARENT_BODY"
```
````

Replace with:

````markdown
```bash
SPECIFY_PARENT_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-payload.json') || require('path').join(require('os').tmpdir(), 'specify-parent-payload.json'))
")
SPECIFY_PARENT_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-parent-body.md') || require('path').join(require('os').tmpdir(), 'specify-parent-body.md'))
")

node -e "require('fs').writeFileSync('$SPECIFY_PARENT_PAYLOAD', JSON.stringify({title:process.argv[1], body:process.argv[2], type:'feature', fingerprint:process.argv[3]}))" \
  "$PARENT_TITLE" "$PARENT_BODY" "${DESIGN_DOC_SLUG}:parent"

# Parent bodies are a design summary, not spec-shaped — no --require-shaped (bin/compose-record.js's Global Constraints).
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" "$SPECIFY_PARENT_PAYLOAD" --out "$SPECIFY_PARENT_BODY"
```
````

- [ ] **Step 2: Replace the sub-issue compose-then-extract block**

The block currently reads (lines 193-211):

````markdown
```bash
SPECIFY_SUB_ISSUE_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-payload.json') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-payload.json'))
")
SPECIFY_SUB_ISSUE_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-body.md') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-body.md'))
")

node -e "const {recordPayload}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const p=recordPayload({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  });
  require('fs').writeFileSync('$SPECIFY_SUB_ISSUE_PAYLOAD', JSON.stringify(p))" \
  "$SUB_ISSUE_TITLE" "$SUB_ISSUE_BODY" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"

node -e "console.log(JSON.parse(require('fs').readFileSync('$SPECIFY_SUB_ISSUE_PAYLOAD','utf8')).body)" > "$SPECIFY_SUB_ISSUE_BODY"
```
````

Replace with:

````markdown
```bash
SPECIFY_SUB_ISSUE_PAYLOAD=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-payload.json') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-payload.json'))
")
SPECIFY_SUB_ISSUE_BODY=$(node -e "
  const { sessionTmpPath } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/session-tmp.js');
  console.log(sessionTmpPath(process.env.CLAUDE_CODE_SESSION_ID, 'specify-sub-issue-body.md') || require('path').join(require('os').tmpdir(), 'specify-sub-issue-body.md'))
")

node -e "require('fs').writeFileSync('$SPECIFY_SUB_ISSUE_PAYLOAD', JSON.stringify({
    title: process.argv[1], body: process.argv[2], type: process.argv[3],
    risk: process.argv[4], size: process.argv[5], ceremony: process.argv[6], ready: true,
    fingerprint: process.argv[7]
  }))" \
  "$SUB_ISSUE_TITLE" "$SUB_ISSUE_BODY" "$SUB_ISSUE_TYPE" "$SUB_ISSUE_RISK" "$SUB_ISSUE_SIZE" "$SUB_ISSUE_CEREMONY" "${DESIGN_DOC_SLUG}:${UNIT_SLUG}"

# Sub-issue bodies are spec-shaped by construction (spec-template.md) — validate before writing.
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-record.js" "$SPECIFY_SUB_ISSUE_PAYLOAD" --out "$SPECIFY_SUB_ISSUE_BODY" --require-shaped
```
````

- [ ] **Step 3: Verify by hand-tracing both replaced flows**

For each of the two blocks: confirm `$SPECIFY_PARENT_BODY` / `$SPECIFY_SUB_ISSUE_BODY` still end up holding the composed body text at the same path used by every later reference in this file (parent: lines 109/124's re-declarations and the `gh issue create --body-file "$SPECIFY_PARENT_BODY"` call at line 114/116; sub-issue: line 211's former extract target, read at lines 228/233/257 further down) — unchanged, not part of this edit, since `--out` writes to that exact same path. Confirm the sub-issue block's `--require-shaped` flag is a genuine behavior addition (the six-node-e version never validated shape) and not a regression risk: `record-creation.md:164` already states sub-issue bodies are "spec-shaped per `spec-template.md`'s record body template" by construction, so `--require-shaped` should pass on every correctly-authored sub-issue and only ever fires on an actual authoring bug — which is the point.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/specify/record-creation.md
git commit -m "specify: cite bin/compose-record.js for parent + sub-issue body composition (refs #800)"
```

---

## Self-Review Notes (for the implementer, not a separate task)

- **Spec coverage:** Deliverable 1 (CLI) → Tasks 1-2. Deliverable 2 (skill prose citing the CLI) → Tasks 3-4 (capture + both `specify` sites named in the spec: `shaping-mode.md` has no compose-then-extract pattern of its own to migrate — it composes via `specShapedBody`, a different, already-consolidated composer that this record's scope does not touch — so only `record-creation.md` needed edits there). Deliverable 3 (test suite) → Task 1 + Task 2's test files, both under `tests/bin-lib/compose-record/`. AC1 → Task 2's escaping-safety test. AC2 → Tasks 3-4. AC3 → the full `tests/bin-lib/compose-record/` suite, picked up automatically by `npm test`'s recursive glob (`package.json`'s `test` script).
- **Scope decision (recorded, not an omission):** the local-files `createRecord` call sites (`capture/SKILL.md`'s local-files branch, `record-creation.md`'s parent/sub-issue local-files branches) are **not** migrated — they never used the compose-then-extract `recordPayload` round-trip in the first place (no separate payload-JSON step, no fingerprint-marker composition via `recordPayload`); they pass `title`/`body` straight to `createRecord` via `process.argv`, which is a different, already escaping-safe pattern serving a different concern (atomic id allocation), not "record-body composition." Migrating them is out of scope for this record.
- **Placeholder scan:** no TBD/TODO/"add error handling"-style placeholders in any task above — every step shows real code.
- **Type consistency:** `composeBody`/`validateShaped`/`splitSections` signatures match between Task 1 (definition) and Task 2 (CLI's `require('./lib/compose-record/compose')` call) and their respective tests.
- **Plan-authoring checks (`plan-authoring-checks.md`):** none of the six checks apply — no existing function's return shape widens, no live-external-contract task got downgraded, no text reorder crossing deictic references, no verbatim external command dictated, no new degrade clause, no copied-config grants, no numbered-list renumbering.
- **Size-headroom check (`build/SKILL.md`'s "Size-headroom check"):** both edited files are already in the 90-100% ceiling warn band on the merge base — `plugin/skills/capture/SKILL.md` at 38446 B and `plugin/skills/specify/record-creation.md` at 38357 B, against the 40960 B (40 KB) ceiling `tests/bin-lib/skill-audit/context-cost.test.js` enforces. Measured the exact replacement text against the original for both: Task 3's edit is net **-160 B**, Task 4's two edits are net **-5 B** and **-17 B** — every edit in this plan shrinks its file (fewer lines: the second "extract `.body`" `node -e` call is replaced by one `compose-record.js` invocation), so no split is needed and no file crosses the ceiling.
