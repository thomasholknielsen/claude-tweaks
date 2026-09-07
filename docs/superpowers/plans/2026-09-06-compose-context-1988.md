# compose-context.js — per-run skill-context composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `plugin/bin/compose-context.js` and its `plugin/bin/lib/compose-context/` module — resolve a run's six-key condition set, strip the `<!-- when: key=value -->` branches the run didn't take, concatenate sources in argv order, and write one bundle at `{run}/context/{step}.md`.

**Architecture:** Three flat sibling files under `plugin/bin/lib/compose-context/` (`compose.js` pure marker grammar + strip/concatenate; `resolve-conditions.js` the six-key resolver over `policy-schema.js`; `index.js` the orchestration `composeContext()` that reads sources, resolves, composes, and atomically writes) plus a thin `run(argv, deps)` CLI wrapper following `build-review-context.js`'s seam and `log-decision.js`'s exit-code discipline. Every side effect is injectable; every marker in every source is validated before a single byte is written.

**Tech Stack:** Node 18+ (no deps), `node --test`, `node:assert/strict`.

**Spec:** `.claude-tweaks/pipelines/2026-09-06T110420-spec-1988-1989-1990-1991-1992-1993-1994-1995-1996-1997/spec-1988/work/1988-spec.md` (materialized record #1988)

## Global Constraints

- CLI invocation: `node bin/compose-context.js --run <run-dir> --step <name> <source-file>...`
- stdout on success: exactly one JSON line `{path, bytes, sources, unresolved}` (`path` string, `bytes` number, `sources` string[] as typed on argv, `unresolved` string[]).
- Exit codes: `0` success; `2` malformed invocation (usage on stderr) OR malformed marker (offending `file:line` on stderr) OR a `--run` dir that is missing or resolves inside a checkout other than the main one; `1` filesystem failure (unreadable source, unwritable output). **No `3`, no other code.** On every exit-2 case nothing is written and a prior bundle at the output path is byte-unchanged.
- Six condition keys, in this fixed canonical order everywhere they are enumerated: `integration-model` (`pr-first`|`local-merge`), `mode` (`auto`|`confirm`|`interactive`|`hybrid`), `attendance` (`headless`|`attended`), `transport` (`gh`|`mcp`), `worktree-policy` (`always`|`optional`), `work-backend` (`github-issues`|`local-files`). The vocabulary lives in `compose.js`; no caller supplies a key list.
- Marker grammar: `<!-- when: {key}={value} -->` … `<!-- /when -->`, each marker on its own line; exactly one `key=value` per marker; nesting depth at most 1 (an inner block is kept only when its own condition AND its enclosing block's hold — AND semantics; an inner block inside a stripped outer block is stripped with it, but its markers are still validated); a pair opens and closes in the same source file. Malformed = unclosed, unknown key, unknown value, nesting > 1, close-without-open, or a line that starts like a marker but does not match the grammar.
- Unresolvable key → keep BOTH branches for that key, list the key in `unresolved` (header and JSON). Never drop a branch on a guess.
- Output file: first line `<!-- resolved: integration-model=... mode=... attendance=... transport=... worktree-policy=... work-backend=... -->` (canonical order, `unresolved` literal for unresolved keys), then sources in argv order with untaken blocks removed and marker lines stripped. Regenerated on every call; never cached.
- `stripMarkers(text)` and `compose(sources, conditions)` are pure exported functions with no CLI-only state; `sources` is `[{path, content}]` (already-read content), `stripMarkers` takes one content string.
- `resolve-conditions.js`'s `gh --version` probe is the module's **only** shell-out and it is injected via `deps.execFileSync` (`gh-api-module-pattern` skill). `compose.js` and `index.js` shell out to nothing.
- Repo conventions: `run(argv, deps)` seam + `require.main === module` guard setting `process.exitCode` (never `process.exit`); `--help` short-circuits first; `bin/lib/run-dir-guard.js`'s `anchoredOrOutsideMessage` is the run-dir guard ([IL-127]); atomic write via `bin/lib/atomic-write.js`'s `writeFileAtomic`; imperative commit messages, no conventional-commit prefixes; commit messages reference the record as `refs #1988` (never `closes`/`fixes`); end every commit message with the line `Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj`.
- Worktree discipline: all work happens in `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design` on branch `worktree-skill-context-composer-design`. Every git command is `git -C "<that path>" …`; every other path-sensitive command takes absolute paths. One plain command per Bash call — no `&&`, `;`, pipes into git, heredocs, or shell variables (the harness worktree guard refuses them); use the Write/Edit tools for files.
- Scope discipline (project CLAUDE.md, quoted): "Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch. Touch only what the task requires — a pre-existing bug you notice is a follow-up to report, not a fix to fold in, unless the task cannot work without it. Don't reformat or "improve" adjacent code; edit in place rather than rewrite when the result is the same."
- Pre-existing baseline failures (do NOT fix, do NOT count as regressions): `tests/bin-lib/reconcile/reap-merged.test.js` fails 3/15 on the unmodified base (`/private/var` vs `/var` realpath, ledger #1); `tests/statusline.test.js` is load-sensitive (ledger #2). Every other suite is green on the base.

## Plan-authoring rulings (recorded per `build/plan-authoring-checks.md`)

- **Ruling — `stripMarkers` validates.** The record says `stripMarkers` "removes marker lines only, keeps every branch". It also states "ALL markers in a source are validated before any stripping occurs". One grammar, one validator: `stripMarkers` runs the same parse and throws `MarkerError` on malformed input rather than silently stripping a broken file. Cost if wrong: U3 (#1990) wraps its measurement call in a try/catch.
- **Ruling — `compose` returns the full bundle string** (header line + concatenated bodies). The `unresolved` list is derived from `conditions` by `unresolvedKeys(conditions)`, also exported. Cost if wrong: a one-line adapter in `index.js`.
- **Ruling — `integration-model` honors the run pin first.** The record names `resolveIntegrationModel(repoRoot)`; `_shared/integration-model.md`'s "Run-scoped stability" section (the binding shared contract) says a run pins the value into its `config.yml` and every later read must take the pin, never a fresh detection. So: `resolvePolicyKeys(['integration-model'], {policyRaw, runConfigRaw})` first (run-config, then policy), and `resolveIntegrationModel(repoRoot)` only when that resolves `source: 'default'`. `integration-model` is therefore always resolved (detection always returns a value) and never appears in `unresolved`.
- **Ruling — `source: 'default'` means unresolved** for `attendance` and `worktree-policy`. The record: "no policy file present" → unresolved, and `attendance` "never independently defaults to `attended`". `resolvePolicyKeys` reports `source: 'default'` exactly when neither `config.yml` nor `policy.yml` set the key (or set it to an invalid value) — that is the unresolved case.
- **Ruling — `sources[]` in the JSON envelope echoes the argv strings verbatim**, and a `MarkerError`'s `file` names that same argv string; the CLI resolves each against cwd only to read it. `path` is absolute.
- **Ruling — `docs/skill-authoring.md` insertion point.** The record says "immediately after the `**Size:**` paragraph (line 21)". Lines 23 and 25 are two further size-guidance paragraphs (the tighter-pin note and the extraction note) that belong to the same guidance; a new `##` heading between 21 and 23 would swallow them. Insert the new `## Conditional blocks and the composer` section after line 25's paragraph and before `## Inline `_shared` contract vs a new component skill` — still inside the size guidance's scope, structurally sound. Cost if wrong: moving one section.
- **Ruling — run-dir rejection exit code is 2.** The record's vocabulary has no code for an unanchored `--run`; the pipeline-owned-binaries rule (`_shared/pipeline-run-dir.md`) uses 2 for that refusal. A missing `--run` directory is also 2 (malformed invocation), distinct from an unwritable output path (1).
- Verbatim-command run-once check: no `gh api`/GraphQL/curl commands are dictated. Degrade-clause check: the fallback sentence cites the record's own wording. Gate-over-producers / return-shape widening / renumbering checks: not applicable (new module, no existing return shape widened, no numbered list edited).

---

### Task 1: `compose.js` — marker grammar, `stripMarkers`, `compose`

**Files:**
- Create: `plugin/bin/lib/compose-context/compose.js`
- Test: `tests/bin-lib/compose-context/compose.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `module.exports = { KEYS, VOCAB, UNRESOLVED, MarkerError, parseMarkers, stripMarkers, compose, unresolvedKeys, renderResolvedHeader }` where
  - `KEYS: string[]` — the six keys in canonical order;
  - `VOCAB: {[key]: string[]}`;
  - `UNRESOLVED === 'unresolved'`;
  - `class MarkerError extends Error { name: 'MarkerError', file: string|null, line: number }` (1-based line);
  - `parseMarkers(text, file=null) -> Array<{type:'open'|'close'|'text', key?, value?, line}>` (validates the whole text first; throws `MarkerError`);
  - `stripMarkers(text) -> string` (marker lines removed, every branch kept; throws `MarkerError`);
  - `compose(sources, conditions) -> string` (`sources: [{path, content}]`, `conditions: {[key]: value|'unresolved'}` with all six keys; throws `MarkerError` with `.file = source.path`, or `TypeError` on a bad `conditions` object);
  - `unresolvedKeys(conditions) -> string[]` (canonical order);
  - `renderResolvedHeader(conditions) -> string` (the `<!-- resolved: … -->` line, no trailing newline).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/compose-context/compose.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  KEYS, VOCAB, UNRESOLVED, MarkerError, stripMarkers, compose, unresolvedKeys, renderResolvedHeader,
} = require('../../../plugin/bin/lib/compose-context/compose');

const ALL = {
  'integration-model': 'pr-first', mode: 'auto', attendance: 'attended',
  transport: 'gh', 'worktree-policy': 'always', 'work-backend': 'github-issues',
};
const HEADER = '<!-- resolved: integration-model=pr-first mode=auto attendance=attended transport=gh worktree-policy=always work-backend=github-issues -->';

test('KEYS is the six-key canonical order and VOCAB covers exactly those keys', () => {
  assert.deepEqual(KEYS, ['integration-model', 'mode', 'attendance', 'transport', 'worktree-policy', 'work-backend']);
  assert.deepEqual(Object.keys(VOCAB), KEYS);
  assert.deepEqual(VOCAB.mode, ['auto', 'confirm', 'interactive', 'hybrid']);
  assert.equal(UNRESOLVED, 'unresolved');
});

test('a branch is stripped when its condition does not match', () => {
  const src = { path: 'a.md', content: 'keep\n<!-- when: integration-model=local-merge -->\ndrop me\n<!-- /when -->\nafter\n' };
  assert.equal(compose([src], ALL), `${HEADER}\nkeep\nafter\n`);
});

test('a branch is kept when its condition matches, with its marker lines removed', () => {
  const src = { path: 'a.md', content: '<!-- when: integration-model=pr-first -->\nkept\n<!-- /when -->\n' };
  assert.equal(compose([src], ALL), `${HEADER}\nkept\n`);
});

test('nested markers (depth 1) resolve with AND semantics', () => {
  const src = { path: 'a.md', content: [
    '<!-- when: integration-model=pr-first -->',
    'outer',
    '<!-- when: mode=auto -->',
    'inner-match',
    '<!-- /when -->',
    '<!-- when: mode=confirm -->',
    'inner-miss',
    '<!-- /when -->',
    '<!-- /when -->',
    '',
  ].join('\n') };
  assert.equal(compose([src], ALL), `${HEADER}\nouter\ninner-match\n`);
  // inner match inside a stripped outer block is stripped with it
  const src2 = { path: 'b.md', content: '<!-- when: integration-model=local-merge -->\nouter\n<!-- when: mode=auto -->\ninner\n<!-- /when -->\n<!-- /when -->\n' };
  assert.equal(compose([src2], ALL), `${HEADER}\n`);
});

test('an unresolved key keeps both branches and appears in unresolvedKeys and the header', () => {
  const conditions = { ...ALL, mode: UNRESOLVED, 'work-backend': UNRESOLVED };
  const src = { path: 'a.md', content: '<!-- when: mode=auto -->\nA\n<!-- /when -->\n<!-- when: mode=confirm -->\nB\n<!-- /when -->\n' };
  const out = compose([src], conditions);
  assert.equal(out.split('\n')[0], '<!-- resolved: integration-model=pr-first mode=unresolved attendance=attended transport=gh worktree-policy=always work-backend=unresolved -->');
  assert.equal(out, `${out.split('\n')[0]}\nA\nB\n`);
  assert.deepEqual(unresolvedKeys(conditions), ['mode', 'work-backend']);
  assert.equal(renderResolvedHeader(ALL), HEADER);
});

test('sources concatenate in argv order, each body newline-terminated', () => {
  const a = { path: 'a.md', content: 'first' };
  const b = { path: 'b.md', content: 'second\n' };
  assert.equal(compose([b, a], ALL), `${HEADER}\nsecond\nfirst\n`);
});

const MALFORMED = [
  ['unclosed marker', '<!-- when: mode=auto -->\nx\n', 1, /unclosed/],
  ['unknown key', '<!-- when: colour=red -->\nx\n<!-- /when -->\n', 1, /unknown key/],
  ['unknown value', '<!-- when: mode=turbo -->\nx\n<!-- /when -->\n', 1, /unknown value/],
  ['nesting deeper than 1', '<!-- when: mode=auto -->\n<!-- when: transport=gh -->\n<!-- when: attendance=attended -->\nx\n<!-- /when -->\n<!-- /when -->\n<!-- /when -->\n', 3, /nesting/],
  ['close without open', 'x\n<!-- /when -->\n', 2, /without/],
  ['two pairs on one marker', '<!-- when: mode=auto transport=gh -->\nx\n<!-- /when -->\n', 1, /malformed marker/],
  ['a marker-shaped comment with no key=value', '<!-- when: -->\nx\n<!-- /when -->\n', 1, /malformed marker/],
];

test('an ordinary HTML comment that merely starts with the word "when" is content, not a marker', () => {
  const src = { path: 'a.md', content: '<!-- whenever this runs, note it -->\nbody\n' };
  assert.equal(compose([src], ALL), `${HEADER}\n<!-- whenever this runs, note it -->\nbody\n`);
});
for (const [label, content, line, re] of MALFORMED) {
  test(`malformed marker (${label}) throws MarkerError naming file and line ${line}`, () => {
    const src = { path: 'bad.md', content };
    assert.throws(() => compose([src], ALL), (err) => err instanceof MarkerError && err.name === 'MarkerError' && err.file === 'bad.md' && err.line === line && re.test(err.message));
    assert.throws(() => stripMarkers(content), (err) => err instanceof MarkerError && err.line === line);
  });
}

test('every marker in every source is validated before any branch is decided', () => {
  // the second source is malformed even though the first would compose cleanly
  const good = { path: 'good.md', content: 'ok\n' };
  const bad = { path: 'bad.md', content: '<!-- when: mode=auto -->\nx\n' };
  assert.throws(() => compose([good, bad], ALL), (err) => err.file === 'bad.md' && err.line === 1);
});

test('stripMarkers removes marker lines only and keeps every branch', () => {
  const content = 'a\n<!-- when: mode=auto -->\nb\n<!-- when: transport=gh -->\nc\n<!-- /when -->\n<!-- /when -->\nd\n';
  assert.equal(stripMarkers(content), 'a\nb\nc\nd\n');
  assert.equal(stripMarkers('no markers'), 'no markers');
});

test('a conditions object missing a key or carrying an off-vocabulary value is a TypeError, not a silent default', () => {
  const { mode, ...missing } = ALL;
  assert.throws(() => compose([{ path: 'a.md', content: 'x\n' }], missing), TypeError);
  assert.throws(() => compose([{ path: 'a.md', content: 'x\n' }], { ...ALL, transport: 'carrier-pigeon' }), TypeError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/compose.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/compose-context/compose'`.

- [ ] **Step 3: Write the implementation**

Create `plugin/bin/lib/compose-context/compose.js`:

```js
// bin/lib/compose-context/compose.js — marker grammar, strip, and concatenate
// for the per-run skill-context composer (#1988). Pure: no fs, no shell, no
// CLI state — bin/lib/skill-audit/context-cost.js (#1990) and later phases
// import stripMarkers/compose directly.
//
// Grammar (line-anchored, one marker per line):
//   <!-- when: {key}={value} -->   opens a block
//   <!-- /when -->                 closes the innermost open block
// Exactly one key=value per marker; nesting depth at most 1 (an outer block
// may hold inner blocks, never deeper); a pair opens and closes in the same
// source. Every marker in a source is validated before any branch is decided,
// so a malformed marker inside a branch this run would strip is still an error.
'use strict';

const KEYS = ['integration-model', 'mode', 'attendance', 'transport', 'worktree-policy', 'work-backend'];
const VOCAB = {
  'integration-model': ['pr-first', 'local-merge'],
  mode: ['auto', 'confirm', 'interactive', 'hybrid'],
  attendance: ['headless', 'attended'],
  transport: ['gh', 'mcp'],
  'worktree-policy': ['always', 'optional'],
  'work-backend': ['github-issues', 'local-files'],
};
const UNRESOLVED = 'unresolved';
const MAX_DEPTH = 2; // outer + one nested level

// A line that starts like a marker is either a valid open/close or a malformed
// marker — never content. Anchored so ordinary prose mentioning "when:" is
// untouched; only an HTML comment opening with when/ /when counts.
const CANDIDATE_RE = /^\s*<!--\s*(?:when:|\/when\b)/;
const OPEN_RE = /^\s*<!--\s*when:\s*([A-Za-z0-9-]+)=([A-Za-z0-9-]+)\s*-->\s*$/;
const CLOSE_RE = /^\s*<!--\s*\/when\s*-->\s*$/;

class MarkerError extends Error {
  constructor(message, { file = null, line }) {
    super(message);
    this.name = 'MarkerError';
    this.file = file;
    this.line = line;
  }
}

// text -> tokens; throws MarkerError on the first malformed marker (by line).
function parseMarkers(text, file = null) {
  const lines = String(text).split('\n');
  const tokens = [];
  const stack = [];
  const fail = (message, line) => { throw new MarkerError(message, { file, line }); };
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!CANDIDATE_RE.test(raw)) {
      tokens.push({ type: 'text', line });
      return;
    }
    const open = raw.match(OPEN_RE);
    if (open) {
      const [, key, value] = open;
      if (!Object.prototype.hasOwnProperty.call(VOCAB, key)) fail(`unknown key "${key}" (expected one of ${KEYS.join(', ')})`, line);
      if (!VOCAB[key].includes(value)) fail(`unknown value "${value}" for ${key} (expected one of ${VOCAB[key].join(', ')})`, line);
      if (stack.length >= MAX_DEPTH) fail('nesting depth > 1 (a block may hold inner blocks, never deeper)', line);
      stack.push(line);
      tokens.push({ type: 'open', key, value, line });
      return;
    }
    if (CLOSE_RE.test(raw)) {
      if (stack.length === 0) fail('close without open (<!-- /when --> with no open block)', line);
      stack.pop();
      tokens.push({ type: 'close', line });
      return;
    }
    fail('malformed marker (expected exactly `<!-- when: key=value -->` or `<!-- /when -->`)', line);
  });
  if (stack.length) fail(`unclosed marker (opened at line ${stack[stack.length - 1]})`, stack[stack.length - 1]);
  return tokens;
}

function stripMarkers(text) {
  const lines = String(text).split('\n');
  const tokens = parseMarkers(text);
  return lines.filter((_, i) => tokens[i].type === 'text').join('\n');
}

function assertConditions(conditions) {
  if (!conditions || typeof conditions !== 'object') throw new TypeError('conditions must be an object keyed by the six condition keys');
  for (const key of KEYS) {
    const value = conditions[key];
    if (value !== UNRESOLVED && !VOCAB[key].includes(value)) {
      throw new TypeError(`conditions.${key} must be one of ${VOCAB[key].join(', ')} or "${UNRESOLVED}" (got ${JSON.stringify(value)})`);
    }
  }
}

function unresolvedKeys(conditions) {
  return KEYS.filter((key) => conditions[key] === UNRESOLVED);
}

function renderResolvedHeader(conditions) {
  return `<!-- resolved: ${KEYS.map((key) => `${key}=${conditions[key]}`).join(' ')} -->`;
}

// [{path, content}], conditions -> the composed bundle: resolved header line,
// then each source's kept lines in argv order, every body newline-terminated.
function compose(sources, conditions) {
  assertConditions(conditions);
  if (!Array.isArray(sources)) throw new TypeError('sources must be an array of {path, content}');
  // Validate everything first — a malformed marker anywhere is an error before
  // any branch of any source is decided.
  const parsed = sources.map((source) => ({ source, tokens: parseMarkers(source.content, source.path) }));
  const bodies = parsed.map(({ source, tokens }) => {
    const lines = String(source.content).split('\n');
    const keepStack = [];
    const kept = [];
    tokens.forEach((token, i) => {
      if (token.type === 'open') {
        const cond = conditions[token.key];
        keepStack.push(cond === UNRESOLVED || cond === token.value);
      } else if (token.type === 'close') {
        keepStack.pop();
      } else if (keepStack.every(Boolean)) {
        kept.push(lines[i]);
      }
    });
    let body = kept.join('\n');
    // A source whose every line was stripped contributes nothing — not a blank line.
    if (body !== '' && !body.endsWith('\n')) body += '\n';
    return body;
  });
  return `${renderResolvedHeader(conditions)}\n${bodies.join('')}`;
}

module.exports = {
  KEYS, VOCAB, UNRESOLVED, MarkerError, parseMarkers, stripMarkers, compose, unresolvedKeys, renderResolvedHeader,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/compose.test.js`
Expected: PASS, all tests (note: the "sources concatenate" test expects a bare `first` body to gain a trailing newline; the "unresolved" test expects `A\nB\n`).

- [ ] **Step 5: Mutation probe (test-authoring discipline)**

Temporarily change `keepStack.push(cond === UNRESOLVED || cond === token.value)` to `keepStack.push(true)` and re-run the file: the "stripped when its condition does not match" and nested tests must go red. Restore the line byte-identical, re-run green. Report mutants tried vs caught in the status line.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" add plugin/bin/lib/compose-context/compose.js tests/bin-lib/compose-context/compose.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" commit -m "Add compose-context marker grammar — stripMarkers and compose over the six-key condition set (refs #1988)

Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj"
```

---

### Task 2: `resolve-conditions.js` — the six-key resolver

**Files:**
- Create: `plugin/bin/lib/compose-context/resolve-conditions.js`
- Test: `tests/bin-lib/compose-context/resolve-conditions.test.js`
- Read only: `plugin/bin/lib/policy-schema.js` (`parseFlatLines`, `resolvePolicyKeys`, `resolveIntegrationModel` — all exported at the bottom of that file)

**Interfaces:**
- Consumes: `KEYS`, `VOCAB`, `UNRESOLVED` from Task 1's `compose.js`; `parseFlatLines(raw) -> {key: string}`, `resolvePolicyKeys(keys, {policyRaw, runConfigRaw}) -> {[key]: {value, source: 'run-config'|'policy'|'default', invalid?}}` (booleans arrive as real `true`/`false` via `resolveValue`), `resolveIntegrationModel(repoRoot) -> 'pr-first'|'local-merge'` from `policy-schema.js`.
- Produces: `module.exports = { resolveConditions, realDeps }` where `resolveConditions({ runDir, repoRoot }, deps = realDeps) -> { conditions, unresolved }`; `deps = { readFile(path, 'utf8'), execFileSync(cmd, args, opts), resolveIntegrationModel(repoRoot) }` — partial deps objects are merged over `realDeps`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/compose-context/resolve-conditions.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveConditions } = require('../../../plugin/bin/lib/compose-context/resolve-conditions');

// Fixture: a fake main checkout (repoRoot) and a run dir under it. Files are
// written only when the test needs them, so "absent" cases are real absences.
function fixture({ policy, config, claudeMd } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-rc-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-spec-1');
  fs.mkdirSync(runDir, { recursive: true });
  if (policy != null) fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), policy);
  if (config != null) fs.writeFileSync(path.join(runDir, 'config.yml'), config);
  if (claudeMd != null) fs.writeFileSync(path.join(root, 'CLAUDE.md'), claudeMd);
  return { root, runDir };
}

const ghPresent = () => 'gh version 2.0.0\n';
const ghAbsent = () => { const e = new Error('spawnSync gh ENOENT'); e.code = 'ENOENT'; throw e; };
const neverDetect = () => { throw new Error('detection must not run when the run pins integration-model'); };

test('fully-resolved run: every key resolves from config.yml/policy.yml/CLAUDE.md and gh presence; unresolved is empty', () => {
  const { root, runDir } = fixture({
    policy: 'autonomy: unattended\nworktree-always: true\n',
    config: 'mode: auto\nintegration-model: pr-first\n',
    claudeMd: '# x\n\nwork-backend: github-issues\nwork-types: labels\n',
  });
  const calls = [];
  const { conditions, unresolved } = resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: (cmd, args) => { calls.push([cmd, ...args]); return ghPresent(); },
    resolveIntegrationModel: neverDetect,
  });
  assert.deepEqual(conditions, {
    'integration-model': 'pr-first', mode: 'auto', attendance: 'headless',
    transport: 'gh', 'worktree-policy': 'always', 'work-backend': 'github-issues',
  });
  assert.deepEqual(unresolved, []);
  assert.deepEqual(calls, [['gh', '--version']]);
});

test('standalone run with no config.yml and no policy.yml: mode/attendance/worktree-policy/work-backend are unresolved, integration-model falls back to detection, transport still resolves', () => {
  const { root, runDir } = fixture();
  const { conditions, unresolved } = resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: ghAbsent,
    resolveIntegrationModel: (repoRoot) => { assert.equal(repoRoot, root); return 'local-merge'; },
  });
  assert.deepEqual(conditions, {
    'integration-model': 'local-merge', mode: 'unresolved', attendance: 'unresolved',
    transport: 'mcp', 'worktree-policy': 'unresolved', 'work-backend': 'unresolved',
  });
  assert.deepEqual(unresolved, ['mode', 'attendance', 'worktree-policy', 'work-backend']);
});

test('config.yml present but with no mode: line resolves mode unresolved; an off-vocabulary mode also resolves unresolved', () => {
  const a = fixture({ config: 'scope-creep: add-to-plan\n' });
  assert.equal(resolveConditions({ runDir: a.runDir, repoRoot: a.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.mode, 'unresolved');
  const b = fixture({ config: 'mode: turbo\n' });
  assert.equal(resolveConditions({ runDir: b.runDir, repoRoot: b.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.mode, 'unresolved');
});

test('attendance: autonomy supervised/trusted -> attended, unattended -> headless; policy.yml sets it, config.yml overrides it', () => {
  const p = fixture({ policy: 'autonomy: trusted\n' });
  assert.equal(resolveConditions({ runDir: p.runDir, repoRoot: p.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.attendance, 'attended');
  const o = fixture({ policy: 'autonomy: trusted\n', config: 'autonomy: unattended\n' });
  assert.equal(resolveConditions({ runDir: o.runDir, repoRoot: o.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions.attendance, 'headless');
});

test('worktree-policy: worktree-always true -> always, false -> optional, unset -> unresolved', () => {
  const t = fixture({ policy: 'worktree-always: true\n' });
  assert.equal(resolveConditions({ runDir: t.runDir, repoRoot: t.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['worktree-policy'], 'always');
  const f = fixture({ policy: 'worktree-always: false\n' });
  assert.equal(resolveConditions({ runDir: f.runDir, repoRoot: f.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['worktree-policy'], 'optional');
});

test('integration-model: policy.yml pin wins over detection; detection only when neither config nor policy set it', () => {
  const pinned = fixture({ policy: 'integration-model: local-merge\n' });
  assert.equal(resolveConditions({ runDir: pinned.runDir, repoRoot: pinned.root }, { execFileSync: ghPresent, resolveIntegrationModel: neverDetect }).conditions['integration-model'], 'local-merge');
});

test('work-backend reads the CLAUDE.md line at repoRoot (never the run dir), and a missing or off-vocabulary line is unresolved', () => {
  const ok = fixture({ claudeMd: 'work-backend: local-files\n' });
  assert.equal(resolveConditions({ runDir: ok.runDir, repoRoot: ok.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['work-backend'], 'local-files');
  const bad = fixture({ claudeMd: 'work-backend: postgres\n' });
  assert.equal(resolveConditions({ runDir: bad.runDir, repoRoot: bad.root }, { execFileSync: ghPresent, resolveIntegrationModel: () => 'pr-first' }).conditions['work-backend'], 'unresolved');
});

test('transport is the only shell-out and it is the injected execFileSync — no other command is spawned', () => {
  const { root, runDir } = fixture({ policy: 'autonomy: supervised\nworktree-always: false\n', config: 'mode: hybrid\nintegration-model: pr-first\n', claudeMd: 'work-backend: github-issues\n' });
  const calls = [];
  resolveConditions({ runDir, repoRoot: root }, {
    execFileSync: (cmd, args) => { calls.push(cmd); if (cmd !== 'gh') throw new Error('unexpected ' + cmd); return 'gh version 2\n'; },
    resolveIntegrationModel: neverDetect,
  });
  assert.deepEqual(calls, ['gh']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/resolve-conditions.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/lib/compose-context/resolve-conditions'`.

- [ ] **Step 3: Write the implementation**

Create `plugin/bin/lib/compose-context/resolve-conditions.js`:

```js
// bin/lib/compose-context/resolve-conditions.js — resolve the six-key condition
// set a run already knows (#1988). Reads policy.yml + the run's config.yml
// through policy-schema.js's own resolver (never a bespoke parse), CLAUDE.md's
// work-backend: line from $RUN_ROOT (the main checkout — never a worktree's cwd,
// [IL-127]), and probes `gh --version` for transport. That probe is this
// module's ONLY shell-out, injected via deps.execFileSync so tests never spawn
// (gh-api-module-pattern's injectable-runner seam).
//
// A key nobody set resolves to 'unresolved' — never a guessed default — so the
// composer keeps both branches for it (the record's unresolvable-key rule).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync: realExecFileSync } = require('child_process');
const { parseFlatLines, resolvePolicyKeys, resolveIntegrationModel } = require('../policy-schema');
const { KEYS, VOCAB, UNRESOLVED } = require('./compose');

const GH_TIMEOUT_MS = 5000; // remote-contacting seam convention; --version is local, but the bound is free
const WORK_BACKEND_RE = /^work-backend:[ \t]*(github-issues|local-files)[ \t]*$/m;

const realDeps = {
  readFile: (p, enc) => fs.readFileSync(p, enc),
  execFileSync: realExecFileSync,
  resolveIntegrationModel,
};

function readFileSafe(p, readFile) {
  try { return readFile(p, 'utf8'); } catch { return null; }
}

// { runDir, repoRoot } -> { conditions, unresolved }
function resolveConditions({ runDir, repoRoot }, deps = {}) {
  const d = { ...realDeps, ...deps };
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'), d.readFile);
  const runConfigRaw = readFileSafe(path.join(runDir, 'config.yml'), d.readFile);
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'), d.readFile);
  const policy = resolvePolicyKeys(['integration-model', 'autonomy', 'worktree-always'], { policyRaw, runConfigRaw });
  const isSet = (entry) => entry && !entry.error && entry.source !== 'default';

  const conditions = {};
  // The run's own pin (config.yml) or policy.yml wins; detection is the fallback
  // (_shared/integration-model.md, "Run-scoped stability").
  conditions['integration-model'] = isSet(policy['integration-model'])
    ? policy['integration-model'].value
    : d.resolveIntegrationModel(repoRoot);

  const mode = parseFlatLines(runConfigRaw).mode;
  conditions.mode = VOCAB.mode.includes(mode) ? mode : UNRESOLVED;

  conditions.attendance = isSet(policy.autonomy)
    ? (policy.autonomy.value === 'unattended' ? 'headless' : 'attended')
    : UNRESOLVED;

  let transport;
  try {
    d.execFileSync('gh', ['--version'], { encoding: 'utf8', stdio: 'pipe', timeout: GH_TIMEOUT_MS });
    transport = 'gh';
  } catch {
    transport = 'mcp';
  }
  conditions.transport = transport;

  conditions['worktree-policy'] = isSet(policy['worktree-always'])
    ? (policy['worktree-always'].value === true ? 'always' : 'optional')
    : UNRESOLVED;

  const wb = claudeMdRaw ? claudeMdRaw.match(WORK_BACKEND_RE) : null;
  conditions['work-backend'] = wb ? wb[1] : UNRESOLVED;

  return { conditions, unresolved: KEYS.filter((key) => conditions[key] === UNRESOLVED) };
}

module.exports = { resolveConditions, realDeps };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/resolve-conditions.test.js`
Expected: PASS, all tests. Also re-run Task 1's file to confirm it still passes.

- [ ] **Step 5: Mutation probe**

Temporarily change `isSet` to `(entry) => Boolean(entry)` and re-run: the standalone-run test (attendance/worktree-policy must be `unresolved`) must go red. Restore byte-identical, re-run green. Report in the status line.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" add plugin/bin/lib/compose-context/resolve-conditions.js tests/bin-lib/compose-context/resolve-conditions.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" commit -m "Add compose-context condition resolver — six keys from the run's config, policy, CLAUDE.md, and gh presence (refs #1988)

Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj"
```

---

### Task 3: `index.js` orchestration + `compose-context.js` CLI

**Files:**
- Create: `plugin/bin/lib/compose-context/index.js`
- Create: `plugin/bin/compose-context.js`
- Test: `tests/bin-lib/compose-context/cli.test.js`
- Read only: `plugin/bin/build-review-context.js` (seam shape), `plugin/bin/lib/run-dir-guard.js` (`anchoredOrOutsideMessage(runDir, cwd, flag) -> string|null`), `plugin/bin/lib/atomic-write.js` (`writeFileAtomic(filePath, content)`), `plugin/bin/lib/hooks/worktree-detect.js` (`mainCheckoutRoot(p) -> string|null`)

**Interfaces:**
- Consumes: Task 1's `compose`, `MarkerError`, `unresolvedKeys`; Task 2's `resolveConditions`.
- Produces:
  - `index.js`: `module.exports = { composeContext, SourceReadError, compose, stripMarkers, resolveConditions, MarkerError, KEYS, VOCAB, UNRESOLVED }`; `composeContext({ runDir, step, sources, repoRoot }, deps = {}) -> { path, bytes, sources, unresolved }` where `sources` is `[{ label, file }]` (`label` = argv string echoed back, `file` = absolute path to read); `deps` accepts `readFile`, `execFileSync`, `resolveIntegrationModel`, `mkdir(dir)`, `writeFileAtomic(path, text)`; throws `MarkerError` (malformed marker, `.file` = label), `SourceReadError` (`name: 'SourceReadError'`, unreadable source), or the write's own fs error. **Nothing is written until every source has been read and every marker validated.**
  - `compose-context.js`: `module.exports = { run, parseArgs }`; `run(argv, deps) -> exit code`; `deps = { cwd(), mainRoot(p), isDirectory(p), anchoredOrOutsideMessage(runDir, cwd, flag), composeContext(args, deps), stdout(s), stderr(s) }` merged over real defaults.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/compose-context/cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const { run } = require('../../../plugin/bin/compose-context');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'compose-context.js');

// Fixture mirrors tests/bin-lib/log-decision/cli.test.js: a fake main checkout
// with a `.git` DIRECTORY, an anchored run dir under it, and a worktree-local
// shadow of that run dir (a `.git` FILE) for the anchoring rejection.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-cli-'));
  const main = path.join(root, 'main');
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', '2026-09-06T000000-spec-1');
  const shadow = path.join(main, '.claude', 'worktrees', 'flow-spec-1', '.claude-tweaks', 'pipelines', '2026-09-06T000000-spec-1');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude', 'worktrees', 'flow-spec-1', '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-1\n');
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'mode: auto\nintegration-model: pr-first\n');
  fs.writeFileSync(path.join(main, '.claude-tweaks', 'policy.yml'), 'autonomy: unattended\nworktree-always: true\n');
  fs.writeFileSync(path.join(main, 'CLAUDE.md'), 'work-backend: github-issues\n');
  const src = path.join(main, 'plugin', 'skills', '_shared');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'a.md'), '# A\n<!-- when: integration-model=pr-first -->\npr-first only\n<!-- /when -->\n<!-- when: integration-model=local-merge -->\nlocal only\n<!-- /when -->\n');
  fs.writeFileSync(path.join(src, 'b.md'), '# B\nalways\n');
  fs.writeFileSync(path.join(src, 'bad.md'), '# bad\n<!-- when: mode=auto -->\nnever closed\n');
  return { main, runDir, shadow, a: path.join(src, 'a.md'), b: path.join(src, 'b.md'), bad: path.join(src, 'bad.md') };
}

function deps(main, out, extra = {}) {
  return {
    cwd: () => main,
    mainRoot: () => main,
    execFileSync: () => 'gh version 2\n',
    resolveIntegrationModel: () => { throw new Error('pinned — detection must not run'); },
    stdout: (s) => out.push(['out', s]),
    stderr: (s) => out.push(['err', s]),
    ...extra,
  };
}
const streamOf = (out, kind) => out.filter((o) => o[0] === kind).map((o) => o[1]).join('');

test('success: exit 0, one JSON line {path, bytes, sources, unresolved}, bundle written with resolved header and untaken block removed', () => {
  const f = fixture();
  const out = [];
  const code = run(['--run', f.runDir, '--step', 'merge', f.a, 'plugin/skills/_shared/b.md'], deps(f.main, out));
  assert.equal(code, 0);
  const lines = streamOf(out, 'out').split('\n');
  assert.equal(lines.length, 2, 'exactly one line plus trailing newline');
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.path, path.join(f.runDir, 'context', 'merge.md'));
  assert.deepEqual(parsed.sources, [f.a, 'plugin/skills/_shared/b.md']);
  assert.deepEqual(parsed.unresolved, []);
  const text = fs.readFileSync(parsed.path, 'utf8');
  assert.equal(parsed.bytes, Buffer.byteLength(text, 'utf8'));
  assert.equal(text, '<!-- resolved: integration-model=pr-first mode=auto attendance=headless transport=gh worktree-policy=always work-backend=github-issues -->\n# A\npr-first only\n# B\nalways\n');
  assert.equal(streamOf(out, 'err'), '');
});

test('unresolved keys are listed in the JSON line and the header, and both branches are kept', () => {
  const f = fixture();
  fs.unlinkSync(path.join(f.runDir, 'config.yml'));
  const out = [];
  const code = run(['--run', f.runDir, '--step', 'x', f.a], deps(f.main, out, { resolveIntegrationModel: () => 'pr-first' }));
  assert.equal(code, 0);
  const parsed = JSON.parse(streamOf(out, 'out'));
  assert.deepEqual(parsed.unresolved, ['mode']);
  assert.match(fs.readFileSync(parsed.path, 'utf8'), /mode=unresolved/);
});

test('the bundle is regenerated on every call (a second call with changed conditions overwrites, never reuses)', () => {
  const f = fixture();
  assert.equal(run(['--run', f.runDir, '--step', 'x', f.a], deps(f.main, [])), 0);
  fs.writeFileSync(path.join(f.runDir, 'config.yml'), 'mode: auto\nintegration-model: local-merge\n');
  assert.equal(run(['--run', f.runDir, '--step', 'x', f.a], deps(f.main, [])), 0);
  assert.match(fs.readFileSync(path.join(f.runDir, 'context', 'x.md'), 'utf8'), /^<!-- resolved: integration-model=local-merge/);
  assert.doesNotMatch(fs.readFileSync(path.join(f.runDir, 'context', 'x.md'), 'utf8'), /pr-first only/);
});

test('exit 2 on a malformed marker: file:line on stderr, nothing written, a prior bundle byte-unchanged', () => {
  const f = fixture();
  assert.equal(run(['--run', f.runDir, '--step', 'x', f.b], deps(f.main, [])), 0);
  const before = fs.readFileSync(path.join(f.runDir, 'context', 'x.md'), 'utf8');
  const out = [];
  const code = run(['--run', f.runDir, '--step', 'x', f.b, f.bad], deps(f.main, out));
  assert.equal(code, 2);
  assert.match(streamOf(out, 'err'), new RegExp(`${f.bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:2: .*unclosed`));
  assert.equal(streamOf(out, 'out'), '');
  assert.equal(fs.readFileSync(path.join(f.runDir, 'context', 'x.md'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(f.runDir, 'context')), ['x.md'], 'no tmp file left behind');
});

test('exit 2 on malformed invocation: usage on stderr, nothing written', () => {
  const f = fixture();
  for (const argv of [[], ['--run', f.runDir], ['--run', f.runDir, '--step', 'x'], ['--step', 'x', f.a], ['--run', f.runDir, '--step', '../evil', f.a], ['--run', f.runDir, '--step', 'x', '--bogus', f.a]]) {
    const out = [];
    assert.equal(run(argv, deps(f.main, out)), 2, JSON.stringify(argv));
    assert.match(streamOf(out, 'err'), /usage: compose-context\.js/);
    assert.equal(streamOf(out, 'out'), '');
  }
  assert.ok(!fs.existsSync(path.join(f.runDir, 'context')));
});

test('exit 2 on a --run dir that is missing or a worktree-local shadow (not anchored under the main checkout)', () => {
  const f = fixture();
  const missing = [];
  assert.equal(run(['--run', path.join(f.main, 'nope'), '--step', 'x', f.a], deps(f.main, missing)), 2);
  assert.match(streamOf(missing, 'err'), /not a directory/);
  const shadow = [];
  assert.equal(run(['--run', f.shadow, '--step', 'x', f.a], deps(f.main, shadow)), 2);
  assert.match(streamOf(shadow, 'err'), /main checkout/);
  assert.ok(!fs.existsSync(path.join(f.shadow, 'context')), 'shadow untouched');
});

test('exit 1 on an unreadable source and on an unwritable output path; no JSON on stdout', () => {
  const f = fixture();
  const unreadable = [];
  assert.equal(run(['--run', f.runDir, '--step', 'x', path.join(f.main, 'missing.md')], deps(f.main, unreadable)), 1);
  assert.match(streamOf(unreadable, 'err'), /cannot read source/);
  assert.equal(streamOf(unreadable, 'out'), '');
  const unwritable = [];
  const code = run(['--run', f.runDir, '--step', 'x', f.a], deps(f.main, unwritable, {
    composeContext: (args, d) => require('../../../plugin/bin/lib/compose-context').composeContext(args, { ...d, writeFileAtomic: () => { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; } }),
  }));
  assert.equal(code, 1);
  assert.match(streamOf(unwritable, 'err'), /EACCES/);
  assert.equal(streamOf(unwritable, 'out'), '');
});

test('--help exits 0 with usage and probes nothing (real binary)', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /usage: compose-context\.js --run <run-dir> --step <name> <source-file>\.\.\./);
});

test('real binary: a --run dir outside any checkout is accepted (anchored-or-outside), exit 0 and a JSON line', () => {
  const f = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-outside-'));
  fs.writeFileSync(path.join(outside, 'config.yml'), 'mode: interactive\nintegration-model: local-merge\n');
  const result = spawnSync(process.execPath, [CLI, '--run', outside, '--step', 'step-1', f.b], { encoding: 'utf8', cwd: outside });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.path, path.join(outside, 'context', 'step-1.md'));
  assert.ok(Array.isArray(parsed.unresolved));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/cli.test.js`
Expected: FAIL — `Cannot find module '../../../plugin/bin/compose-context'`.

- [ ] **Step 3: Write `index.js`**

Create `plugin/bin/lib/compose-context/index.js`:

```js
// bin/lib/compose-context/index.js — module entrypoint for the per-run
// skill-context composer (#1988): read the sources, resolve the run's
// conditions, compose, and atomically write {run}/context/{step}.md. Every
// source is read and every marker validated BEFORE anything touches disk, so a
// failing call is a no-op on disk (a prior bundle is never partially
// overwritten or deleted). Shells out to nothing of its own — the one shell-out
// lives in resolve-conditions.js behind deps.execFileSync.
'use strict';
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../atomic-write');
const {
  compose, stripMarkers, unresolvedKeys, MarkerError, KEYS, VOCAB, UNRESOLVED,
} = require('./compose');
const { resolveConditions } = require('./resolve-conditions');

class SourceReadError extends Error {
  constructor(file, cause) {
    super(`cannot read source ${file}: ${cause && cause.message}`);
    this.name = 'SourceReadError';
    this.file = file;
    this.cause = cause;
  }
}

const realDeps = {
  readFile: (p, enc) => fs.readFileSync(p, enc),
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeFileAtomic,
};

// { runDir, step, sources: [{label, file}], repoRoot } -> { path, bytes, sources, unresolved }
function composeContext({ runDir, step, sources, repoRoot }, deps = {}) {
  const d = { ...realDeps, ...deps };
  const read = sources.map(({ label, file }) => {
    let content;
    try { content = d.readFile(file, 'utf8'); } catch (err) { throw new SourceReadError(label, err); }
    return { path: label, content };
  });
  const { conditions } = resolveConditions({ runDir, repoRoot }, d);
  const text = compose(read, conditions); // validates every marker of every source first
  const outDir = path.join(runDir, 'context');
  const outPath = path.join(outDir, `${step}.md`);
  d.mkdir(outDir);
  d.writeFileAtomic(outPath, text);
  return {
    path: outPath,
    bytes: Buffer.byteLength(text, 'utf8'),
    sources: sources.map((s) => s.label),
    unresolved: unresolvedKeys(conditions),
  };
}

module.exports = {
  composeContext, SourceReadError, compose, stripMarkers, resolveConditions, MarkerError, KEYS, VOCAB, UNRESOLVED,
};
```

- [ ] **Step 4: Write the CLI**

Create `plugin/bin/compose-context.js`:

```js
#!/usr/bin/env node
// bin/compose-context.js — per-run skill-context composer (#1988).
//   node bin/compose-context.js --run <run-dir> --step <name> <source-file>...
// Resolves the run's six-key condition set, strips the `<!-- when: key=value -->`
// branches the run didn't take, concatenates the sources in argv order, and
// writes one bundle at {run}/context/{step}.md a skill step reads once.
// stdout: exactly one JSON line {path, bytes, sources, unresolved}.
// Exit 0 success; 2 malformed invocation (usage on stderr) OR malformed marker
// (offending file:line on stderr) OR a --run dir that is missing or resolves
// inside a checkout other than the main one (bin/lib/run-dir-guard.js's
// anchored-or-outside rule, #1065/[IL-127] — a path outside any checkout is
// accepted, a worktree-local shadow is refused) — on every exit-2 case nothing
// is written and a prior bundle at the output path is left untouched; 1
// filesystem failure (unreadable source, unwritable output). Same
// run(argv, deps) seam and require.main guard as bin/build-review-context.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { anchoredOrOutsideMessage } = require('./lib/run-dir-guard');
const wtDetect = require('./lib/hooks/worktree-detect');
const { composeContext } = require('./lib/compose-context');

const USAGE = 'usage: compose-context.js --run <run-dir> --step <name> <source-file>... [--help]\n';
const STEP_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/; // one path segment — never a traversal

function parseArgs(argv) {
  const o = { run: null, step: null, sources: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--step') o.step = next();
    else if (a.startsWith('--')) return { error: `unknown argument: ${a}` };
    else o.sources.push(a);
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  mainRoot: (p) => wtDetect.mainCheckoutRoot(p),
  isDirectory: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  anchoredOrOutsideMessage,
  composeContext,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = {}) {
  const d = { ...realDeps, ...deps };
  const usageError = (message) => { d.stderr(`compose-context.js: ${message}\n${USAGE}`); return 2; };
  const o = parseArgs(argv);
  if (o.error) return usageError(o.error);
  if (o.help) { d.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');
  if (!o.step || !STEP_RE.test(o.step)) return usageError('--step <name> is required and must be one plain path segment (letters, digits, . _ -)');
  if (o.sources.length === 0) return usageError('at least one <source-file> is required');

  let cwd;
  try { cwd = d.cwd(); } catch (err) { d.stderr(`compose-context.js: ${err && err.message}\n`); return 2; }
  const runDir = path.resolve(cwd, o.run);
  if (!d.isDirectory(runDir)) { d.stderr(`compose-context.js: --run ${o.run} is not a directory\n`); return 2; }
  let rejection;
  try { rejection = d.anchoredOrOutsideMessage(runDir, cwd, '--run'); } catch (err) { d.stderr(`compose-context.js: ${err && err.message}\n`); return 2; }
  if (rejection) { d.stderr(`compose-context.js: ${rejection}\n`); return 2; }

  let repoRoot;
  try { repoRoot = d.mainRoot(cwd) || cwd; } catch { repoRoot = cwd; }
  const sources = o.sources.map((label) => ({ label, file: path.resolve(cwd, label) }));

  let result;
  try {
    result = d.composeContext({ runDir, step: o.step, sources, repoRoot }, d);
  } catch (err) {
    if (err && err.name === 'MarkerError') {
      d.stderr(`compose-context.js: ${err.file}:${err.line}: ${err.message}\n`);
      return 2;
    }
    d.stderr(`compose-context.js: ${err && err.message}\n`);
    return 1; // SourceReadError, or the write's own fs error
  }
  d.stdout(JSON.stringify(result) + '\n');
  return 0;
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}

module.exports = { run, parseArgs };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/cli.test.js`
Expected: PASS, all tests. Then run all three suite files together: `node --test /Users/thomasholknielsen/Code\ Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/` — Expected: PASS.

- [ ] **Step 6: Mutation probe**

Temporarily move `d.mkdir(outDir); d.writeFileAtomic(outPath, text);` in `index.js` to *before* `const text = compose(...)` (writing an empty string first): the "prior bundle byte-unchanged" test must go red. Restore byte-identical, re-run green. Report in the status line.

- [ ] **Step 7: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" add plugin/bin/compose-context.js plugin/bin/lib/compose-context/index.js tests/bin-lib/compose-context/cli.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" commit -m "Add compose-context.js CLI — anchored run dir, atomic bundle write, 0/2/1 exit vocabulary (refs #1988)

Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj"
```

---

### Task 4: Register the CLI in `docs/plugin-structure.md` and document the marker contract in `docs/skill-authoring.md`

**Files:**
- Modify: `docs/plugin-structure.md` (three additive edits: the `plugin/bin/` standalone-CLI list on line 18, the `plugin/bin/lib/` module listing after the `plugin/bin/lib/review-context/` line, and the Commands block — add one test-suite line and one CLI line next to the `build-review-context.js` entry)
- Modify: `docs/skill-authoring.md` (one new `##` section after the "Extracting to a sub-file under budget pressure." paragraph and before `## Inline `_shared` contract vs a new component skill`)

**Interfaces:**
- Consumes: the shipped CLI/module from Tasks 1-3 (names, exit codes, output shape — copy them verbatim from the file headers).
- Produces: documentation only. No test file (the repo's doc-completeness tests run in `npm test`; run the full suite before committing).

- [ ] **Step 1: Edit `docs/plugin-structure.md`**

(a) In the `plugin/bin/` line's parenthesised list of standalone CLIs, insert `compose-context` immediately after `build-review-context`.

(b) Immediately after the line beginning `plugin/bin/lib/review-context/    →`, add:

```
plugin/bin/lib/compose-context/   → compose.js (marker grammar: `<!-- when: key=value -->`…`<!-- /when -->`, six-key vocabulary, stripMarkers + compose as pure functions), resolve-conditions.js (the six-key resolver over policy-schema.js — run pin/policy first, detection last for integration-model; `gh --version` is the module's only shell-out, injected via deps.execFileSync), index.js (composeContext: read every source and validate every marker BEFORE the atomic write to {run}/context/{step}.md). Consumed by plugin/bin/compose-context.js (#1988)
```

(c) In the Commands block, immediately after the `node plugin/bin/build-review-context.js mint|build …` line, add these two lines:

```
node --test tests/bin-lib/compose-context/*.test.js   # Compose-context unit + CLI suites only
node plugin/bin/compose-context.js --run <run-dir> --step <name> <source-file>...   # Compose-context CLI (#1988) — resolves the run's six-key condition set (integration-model, mode, attendance, transport, worktree-policy, work-backend), strips the `<!-- when: key=value -->` branches the run didn't take, concatenates the sources in argv order, and writes one bundle at `{run}/context/{step}.md` opening with a `<!-- resolved: … -->` line (an unresolvable key keeps BOTH branches and is listed as `unresolved`; the bundle is regenerated on every call, never cached); prints one JSON line `{path, bytes, sources, unresolved}`; exit 0 success, 2 malformed invocation (usage on stderr) or malformed marker (file:line on stderr) or a `--run` dir missing/resolving inside a checkout other than the main one — nothing written on any exit 2, a prior bundle left untouched — 1 filesystem failure (unreadable source, unwritable output) (`plugin/bin/lib/compose-context/`, tests in `tests/bin-lib/compose-context/`)
```

- [ ] **Step 2: Edit `docs/skill-authoring.md`**

Insert, after the paragraph beginning `**Extracting to a sub-file under budget pressure.**` and before the `## Inline `_shared` contract vs a new component skill` heading, exactly this section (blank line before and after):

````markdown
## Conditional blocks and the composer

A `plugin/skills/_shared/*.md` contract or a skill sub-file may fence a passage that applies only under one resolved run condition, so a step reads one composed bundle instead of every branch of every file:

```markdown
<!-- when: integration-model=pr-first -->
… the pr-first branch …
<!-- /when -->
```

**Marker grammar.** `<!-- when: {key}={value} -->` opens a block and `<!-- /when -->` closes it, each on its own line; exactly one `key=value` per marker; a pair opens and closes in the same file; nesting depth at most 1 — an inner block is kept only when both its own condition and the enclosing block's hold. Six keys, in this canonical order: `integration-model` (`pr-first`|`local-merge`), `mode` (`auto`|`confirm`|`interactive`|`hybrid`), `attendance` (`headless`|`attended`), `transport` (`gh`|`mcp`), `worktree-policy` (`always`|`optional`), `work-backend` (`github-issues`|`local-files`). A malformed marker (unclosed, unknown key or value, nesting deeper than 1, a close with no open) is a compose error — the composer exits 2 naming the file and line and writes nothing; it never silently keeps or drops a branch.

**Call-site form.** A step that reads several fenced sources composes them once per step:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step {step} {files}
```

then reads `{run}/context/{step}.md` — the sources in argv order, untaken blocks removed, marker lines stripped, opening with a `<!-- resolved: … -->` line naming every key's value. A key the run cannot resolve (no `config.yml` on a standalone run, no policy file) keeps **both** branches and is listed as `unresolved` in that line and in the CLI's JSON output — a branch is never dropped on a guess. The bundle is regenerated on every call, never cached, since the Manifesto can re-answer a lever mid-run.

**Every call site carries this fallback sentence verbatim:** *if the compose command is unavailable or exits non-zero, read the named source files directly.*

**A fenced block never holds the only copy of a heading, Step label, or anchor another file cites** — every citation must resolve in every composition, so headings and anchors stay outside the fences and only the condition-specific prose goes inside.

**Composition over fragmentation.** When a file nears its ceiling, the standing response is to fence the condition-specific passages and let the composer trim them per run — not to split the file again. Per-file byte ceilings measure what a run *could* load; composed bytes per step measure what it *does*.
````

- [ ] **Step 3: Verify the edits are additive and the suite is green**

Run: `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" diff --stat`
Expected: exactly `docs/plugin-structure.md` and `docs/skill-authoring.md`, insertions only (no deletions except none).

Run: `npm test` (from the worktree root, plain command, redirect nothing) — read the trailing `# pass` / `# fail` lines.
Expected: `# fail 3` at most, and every failure inside `tests/bin-lib/reconcile/reap-merged.test.js` (the pre-existing baseline, Global Constraints) or, if it flaked, `tests/statusline.test.js`; any failure in any other file is a regression to fix before committing. Quote the raw `# tests`/`# pass`/`# fail` lines and every `not ok` line in the report file.

- [ ] **Step 4: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" add docs/plugin-structure.md docs/skill-authoring.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" commit -m "Document compose-context.js — Commands entry, module listing, and the conditional-blocks marker contract for skill authors (refs #1988)

Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj"
```

---

## Self-review

- **Spec coverage:** Deliverables → Task 3 (CLI), Task 1 (`compose.js`, `stripMarkers`/`compose`, marker grammar, unresolvable handling, output header), Task 2 (`resolve-conditions.js`, all six keys with the stated sources and the `gh` probe as the only shell-out), Task 3 (`index.js`, stdout contract, exit vocabulary, no-partial-write, regenerate-every-call), Task 4 (`docs/plugin-structure.md` entry, `docs/skill-authoring.md` section with syntax, vocabulary, call-site form, fallback sentence, no-only-copy rule, composition-over-fragmentation). AC1 ↔ Task 1+2 tests; AC2 ↔ each task's Step 2 RED run (evidence required in the report); AC3 ↔ Task 3 tests (JSON shape, every exit code: 0/2/1); AC4 ↔ Task 4 Step 3; AC5 ↔ Task 4.
- **Placeholder scan:** none.
- **Type consistency:** `compose(sources: [{path, content}], conditions) -> string` (Task 1) is what `index.js` calls with `{path: label, content}` (Task 3); `resolveConditions({runDir, repoRoot}, deps) -> {conditions, unresolved}` (Task 2) is what `index.js` destructures; `composeContext` takes `sources: [{label, file}]` and the CLI builds exactly that; `MarkerError.file`/`.line` are what the CLI prints as `file:line`.
