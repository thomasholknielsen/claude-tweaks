# Tokens Per Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the per-phase Timing table (#1928) its second axis — tokens, procedure bytes loaded, and tool round-trips per phase from the session transcript's `usage` records — plus per-run guard-denial counts, degrading to blank columns with a note whenever no transcript is available.

**Architecture:** A new pure-ish module `bin/lib/timing/transcript.js` locates a session's transcript under `~/.claude/projects/{slug}/{sessionId}.jsonl` (the slug rule is pinned against a real path) and streams it line by line into usage rows. `derive.js` gains `joinTokens(phases, rows)` (innermost-phase attribution on `[start, end)`, `unattributed` bucket) and `countGuardEvents(events)`. `phase-timing.js` gains `--transcript` (repeatable), `--auto-transcript`, three markdown columns, a `Guard denials:` footer, and a `tokens: transcript not found (...)` note; `main` becomes async because the reader streams. Prose consumers add `--auto-transcript` after `--markdown` so #1928's conformance regexes keep matching.

**Tech Stack:** Node 18+ (`readline` over `fs.createReadStream`, no deps), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1929/work/1929-spec.md` (record #1929; prerequisite #1928 shipped earlier on this branch).

## Global Constraints

- Every `plugin/skills/**/*.md` ≤ 40,960 bytes. `plugin/skills/dispatch/SKILL.md` is at **40,875 bytes** (85 of headroom); the token clause on its timing line is 26 bytes — no trim needed, but `wc -c` is quoted after the edit.
- `tests/timing-prose-conformance.test.js` pins `bin/phase-timing.js" --run "$PIPELINE_RUN_DIR" --markdown` (and the `$MULTISPEC_PARENT_DIR` variant) as adjacent tokens — `--auto-transcript` is appended AFTER `--markdown`, never between.
- Transcripts can be tens of MB: stream with `readline`, never `readFileSync` whole. A line is malformed (skipped, never fatal) when it fails JSON parsing or lacks `timestamp` or `message.role`.
- The locator reads only the run's own recorded worktree (`run-state.json.worktree`) and session (`run-state.json.sessionId`); when both are absent it emits the note and stops. Never another user's home or another session's directory.
- Tokens are reported, never used to gate anything — no policy lever.
- `phase-timing.js`'s exit contract from #1928 is unchanged: exit 0 in every derivable case (a missing/unreadable transcript is a note line, exit 0), `--run ""` a no-op, exit 2 only on a malformed invocation.
- Commit subjects `{Verb} {what} — {detail} (refs #1929)`; `refs`, never `closes`.

## Design decisions locked here

1. **The slug rule, pinned empirically:** Claude Code derives the project directory from the cwd by replacing every character that is not `[A-Za-z0-9-]` with `-`. Fixture: this session's own transcript lives at `~/.claude/projects/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks--claude-worktrees-design-1904-pipeline-ceremony/a56d2ef5-0cc7-42a2-a556-b7fc47b4fe43.jsonl` for cwd `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony` — the space and the `.` both became `-` (hence `--claude`), the slash became `-`. The record's provisional "replace every `/`" would miss the space and the dot. `TRANSCRIPT_SLUG_RULE` states this and the test pins that exact pair.
2. **The transcript file is `{slug}/{sessionId}.jsonl`** — a session's main transcript sits directly in the slug directory, named by the session id (a sibling directory of the same id holds subagent transcripts; not read here). `locateTranscripts` returns that one path when both keys are known; with only `cwd` it returns every top-level `*.jsonl` in the slug dir (mtime-desc); with only `sessionId` it scans every project dir for `{sessionId}.jsonl`; with neither, `[]`.
3. **`--auto-transcript` picks the most-recently-modified candidate** and notes the discarded ones (`tokens: N other candidate(s) ignored: …`) — the spec's Gotcha.
4. **Procedure bytes count the installed plugin's skill files too.** The record says "`Read` results under `plugin/skills/**`", but a real session reads skills from the installed cache (`~/.claude/plugins/cache/…/claude-tweaks/{version}/skills/flow/materialize.md`, observed in this session's transcript) — a repo-relative rule would count zero bytes on every real run. Rule: after normalizing the `Read` input path relative to the run's recorded worktree when it starts with it, a path matches when it satisfies `/(^|\/)(plugin\/)?skills\/.+\.md$/` OR contains both `/.claude/plugins/` and `/skills/`. The synthetic fixture exercises both shapes plus a non-match.
5. **Row attribution is to the innermost containing phase** (smallest span, ties → later start) among rows whose `[start, end)` contains `ts` — the same rule #1928 uses for `verify` events — so a call's tokens are its exclusive-gap tokens and a nested phase's tokens are not double-counted in its container. Rows outside every phase go to `unattributed`.
6. **`readUsage` is async (streams)**, so `phase-timing.js`'s `main` becomes `async` and the `require.main` guard awaits it; the existing sync tests keep passing because they spawn the CLI.
7. **Timestamps:** a row's `ts` is the message's top-level `timestamp`; token fields come from `message.usage` on assistant rows only; `toolRoundTrip`/`procedureBytes` come from `tool_result` blocks on user rows only (the two groups are mutually exclusive per row).
8. **Four tasks:** the reader, the derivation, the CLI, the prose + docs + conformance — each its own review surface.

---

### Task 1: `bin/lib/timing/transcript.js` — locator + streaming usage reader

**Files:**
- Create: `plugin/bin/lib/timing/transcript.js`, `tests/fixtures/timing/transcript-small.jsonl`
- Test: `tests/bin-lib/timing/transcript.test.js`

**Interfaces:**
- Produces: `TRANSCRIPT_SLUG_RULE` (string), `slugForCwd(cwd) → string`, `locateTranscripts({cwd, sessionId, homeDir, fsImpl}) → [{path, mtimeMs}]` (mtime-desc), `readUsage(path, {fsImpl, worktree}) → Promise<[{ts, role, inputTokens, outputTokens, cacheRead, cacheCreate, toolRoundTrip, procedureBytes}]>`, `isProcedurePath(filePath, worktree) → boolean`. Task 2 consumes rows; Task 3 consumes the locator.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/timing/transcript-small.jsonl` — exactly these lines (synthetic; ids and paths invented; the third `Read` is deliberately outside any skills directory):

```
{"type":"assistant","timestamp":"2026-09-05T13:50:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01","name":"Read","input":{"file_path":"/repo/plugin/skills/review/SKILL.md"}}],"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":300,"cache_creation_input_tokens":40}}}
{"type":"user","timestamp":"2026-09-05T13:50:05.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"0123456789"}]}}
{"type":"assistant","timestamp":"2026-09-05T13:50:10.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_02","name":"Read","input":{"file_path":"/Users/x/.claude/plugins/cache/m/claude-tweaks/6.0.0/skills/flow/multi-spec.md"}}],"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":3,"cache_creation_input_tokens":4}}}
{"type":"user","timestamp":"2026-09-05T13:50:15.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_02","content":[{"type":"text","text":"abcde"},{"type":"text","text":"fgh"}]}]}}
{"type":"assistant","timestamp":"2026-09-05T13:50:20.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_03","name":"Read","input":{"file_path":"/repo/docs/hooks.md"}}],"usage":{"input_tokens":5,"output_tokens":6,"cache_read_input_tokens":7,"cache_creation_input_tokens":8}}}
{"type":"user","timestamp":"2026-09-05T13:50:25.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_03","content":"this is not a procedure file"}]}}
not json at all
{"type":"user","timestamp":"2026-09-05T13:50:30.000Z","message":{"content":[{"type":"text","text":"missing role"}]}}
{"type":"assistant","timestamp":"2026-09-05T13:50:35.000Z","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}
```

Expected rows: 7 (two malformed lines skipped): assistant rows carry tokens; the three user rows have `toolRoundTrip: true`; `procedureBytes` is 10 on the first result, 8 on the second (5 + 3), 0 on the third; the last assistant row has 100/200.

- [ ] **Step 2: Write the failing test**

`tests/bin-lib/timing/transcript.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { slugForCwd, locateTranscripts, readUsage, isProcedurePath, TRANSCRIPT_SLUG_RULE } = require('../../../plugin/bin/lib/timing/transcript');

const FIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'transcript-small.jsonl');

// #1929 AC1 — the rule is pinned against a real observed pair, not a guess:
// this session's own transcript directory for the worktree cwd below.
const REAL_CWD = '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony';
const REAL_SLUG = '-Users-thomasholknielsen-Code-Workspaces-claude-tweaks--claude-worktrees-design-1904-pipeline-ceremony';

test('#1929 AC1: slugForCwd reproduces the observed project-directory name (space and dot become hyphens too)', () => {
  assert.equal(slugForCwd(REAL_CWD), REAL_SLUG);
  assert.equal(slugForCwd('/Users/x/Code/repo/.claude/worktrees/wt'), '-Users-x-Code-repo--claude-worktrees-wt');
  assert.match(TRANSCRIPT_SLUG_RULE, /\[A-Za-z0-9-\]/);
});

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-transcript-home-'));
  const slugDir = path.join(home, '.claude', 'projects', slugForCwd('/Users/x/Code/repo/.claude/worktrees/wt'));
  fs.mkdirSync(slugDir, { recursive: true });
  fs.writeFileSync(path.join(slugDir, 'sess-1.jsonl'), '{}\n');
  fs.writeFileSync(path.join(slugDir, 'sess-2.jsonl'), '{}\n');
  fs.mkdirSync(path.join(slugDir, 'sess-1'), { recursive: true }); // subagent dir — never a candidate
  const other = path.join(home, '.claude', 'projects', '-Users-x-elsewhere');
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(other, 'sess-3.jsonl'), '{}\n');
  return { home, slugDir, other };
}

test('#1929 AC1: locateTranscripts looks under the worktree slug and keys on the session id', () => {
  const { home, slugDir } = fakeHome();
  const both = locateTranscripts({ cwd: '/Users/x/Code/repo/.claude/worktrees/wt', sessionId: 'sess-2', homeDir: home });
  assert.deepEqual(both.map((c) => c.path), [path.join(slugDir, 'sess-2.jsonl')]);
  const cwdOnly = locateTranscripts({ cwd: '/Users/x/Code/repo/.claude/worktrees/wt', homeDir: home });
  assert.deepEqual(cwdOnly.map((c) => path.basename(c.path)).sort(), ['sess-1.jsonl', 'sess-2.jsonl']);
  const sessionOnly = locateTranscripts({ sessionId: 'sess-3', homeDir: home });
  assert.equal(sessionOnly.length, 1);
  assert.ok(sessionOnly[0].path.endsWith(path.join('-Users-x-elsewhere', 'sess-3.jsonl')));
  assert.deepEqual(locateTranscripts({ homeDir: home }), []);
  assert.deepEqual(locateTranscripts({ cwd: '/nope', sessionId: 'x', homeDir: home }), []);
});

test('#1929: isProcedurePath matches repo skills, installed-plugin skills, and nothing else', () => {
  assert.equal(isProcedurePath('/repo/plugin/skills/review/SKILL.md', '/repo'), true);
  assert.equal(isProcedurePath('plugin/skills/_shared/x.md', '/repo'), true);
  assert.equal(isProcedurePath('/Users/x/.claude/plugins/cache/m/claude-tweaks/6.0.0/skills/flow/multi-spec.md', '/repo'), true);
  assert.equal(isProcedurePath('/repo/docs/hooks.md', '/repo'), false);
  assert.equal(isProcedurePath('/repo/plugin/bin/hooks.js', '/repo'), false);
  assert.equal(isProcedurePath('/elsewhere/skills/notes.txt', '/repo'), false);
});

test('#1929 AC2: readUsage streams rows, sums procedure bytes for skills Reads only, flags tool round-trips', async () => {
  const rows = await readUsage(FIX, { worktree: '/repo' });
  assert.equal(rows.length, 7);
  const users = rows.filter((r) => r.role === 'user');
  assert.deepEqual(users.map((r) => r.toolRoundTrip), [true, true, true]);
  assert.deepEqual(users.map((r) => r.procedureBytes), [10, 8, 0]);
  assert.equal(rows.reduce((s, r) => s + r.procedureBytes, 0), 18);
  const assistants = rows.filter((r) => r.role === 'assistant');
  assert.deepEqual(assistants.map((r) => r.toolRoundTrip), [false, false, false, false]);
  assert.deepEqual(assistants[0], { ts: '2026-09-05T13:50:00.000Z', role: 'assistant', inputTokens: 10, outputTokens: 20, cacheRead: 300, cacheCreate: 40, toolRoundTrip: false, procedureBytes: 0 });
  assert.equal(assistants[3].inputTokens, 100);
  assert.equal(users[0].inputTokens, 0);
});

test('#1929: readUsage on a missing file rejects with a code the CLI can name', async () => {
  await assert.rejects(readUsage(path.join(os.tmpdir(), 'ct-no-such-transcript.jsonl'), {}), (err) => err.code === 'ENOENT');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/bin-lib/timing/transcript.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/lib/timing/transcript'`.

- [ ] **Step 4: Implement `plugin/bin/lib/timing/transcript.js`**

```js
// bin/lib/timing/transcript.js — locate a session's transcript and stream
// its usage rows (#1929).
//
// TRANSCRIPT_SLUG_RULE (empirical, pinned by tests/bin-lib/timing/
// transcript.test.js): Claude Code names a project's transcript directory
// by replacing every character of the cwd that is not [A-Za-z0-9-] with
// '-'. Observed pair: cwd
//   /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony
// → ~/.claude/projects/
//   -Users-thomasholknielsen-Code-Workspaces-claude-tweaks--claude-worktrees-design-1904-pipeline-ceremony/
// (the space and the '.' both became '-', so a worktree cwd yields '--').
// The session's main transcript is {slug}/{sessionId}.jsonl; a sibling
// directory named {sessionId}/ holds subagent transcripts and is not read
// here. If the pinned test ever goes red, Claude Code changed the scheme —
// re-derive the rule from a fresh observation, do not loosen the test.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const TRANSCRIPT_SLUG_RULE = 'replace every character not in [A-Za-z0-9-] with "-" (observed: "/", " ", and "." all become "-")';

function slugForCwd(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9-]/g, '-');
}

function statOrNull(fsImpl, p) { try { return fsImpl.statSync(p); } catch { return null; } }

// { cwd?, sessionId?, homeDir?, fsImpl? } -> [{ path, mtimeMs }] newest first.
// Both keys absent -> []. Only the run's own keys are ever consulted.
function locateTranscripts({ cwd, sessionId, homeDir = os.homedir(), fsImpl = fs } = {}) {
  if (!cwd && !sessionId) return [];
  const projects = path.join(homeDir, '.claude', 'projects');
  const out = [];
  const push = (p) => { const st = statOrNull(fsImpl, p); if (st && st.isFile()) out.push({ path: p, mtimeMs: st.mtimeMs }); };
  if (cwd && sessionId) {
    push(path.join(projects, slugForCwd(cwd), `${sessionId}.jsonl`));
  } else if (cwd) {
    const dir = path.join(projects, slugForCwd(cwd));
    let names = [];
    try { names = fsImpl.readdirSync(dir); } catch { names = []; }
    for (const n of names) if (n.endsWith('.jsonl')) push(path.join(dir, n));
  } else {
    let dirs = [];
    try { dirs = fsImpl.readdirSync(projects); } catch { dirs = []; }
    for (const d of dirs) push(path.join(projects, d, `${sessionId}.jsonl`));
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// A Read counts as procedure loading when it targets a skill file — the
// repo's plugin/skills/** or the installed plugin cache's skills/ (a real
// session reads skills from ~/.claude/plugins/cache/…/skills/, so a
// repo-only rule would count zero bytes on every real run).
function isProcedurePath(filePath, worktree) {
  if (typeof filePath !== 'string' || !filePath) return false;
  let p = filePath;
  if (worktree && p.startsWith(worktree)) p = p.slice(worktree.length).replace(/^\/+/, '');
  if (/(^|\/)(plugin\/)?skills\/.+\.md$/.test(p)) return true;
  return p.includes('/.claude/plugins/') && p.includes('/skills/') && p.endsWith('.md');
}

function resultBytes(content) {
  if (typeof content === 'string') return Buffer.byteLength(content, 'utf8');
  if (Array.isArray(content)) {
    return content.reduce((s, b) => s + (b && typeof b.text === 'string' ? Buffer.byteLength(b.text, 'utf8') : 0), 0);
  }
  return 0;
}

// path, { fsImpl?, worktree? } -> Promise<rows>. Streams line by line;
// malformed lines (bad JSON, no timestamp, no message.role) are skipped.
// Rejects only when the file cannot be opened (err.code carries ENOENT/EACCES).
async function readUsage(filePath, { fsImpl = fs, worktree = null } = {}) {
  await new Promise((resolve, reject) => {
    const st = statOrNull(fsImpl, filePath);
    if (!st) { const e = new Error(`transcript not readable: ${filePath}`); e.code = 'ENOENT'; reject(e); return; }
    resolve();
  });
  const rows = [];
  const procedureReads = new Set(); // tool_use ids of Reads on procedure files
  const stream = fsImpl.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let entry;
      try { entry = JSON.parse(line); } catch { return; }
      const msg = entry && entry.message;
      if (!entry || typeof entry.timestamp !== 'string' || !msg || typeof msg.role !== 'string') return;
      const content = Array.isArray(msg.content) ? msg.content : [];
      const row = { ts: entry.timestamp, role: msg.role, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreate: 0, toolRoundTrip: false, procedureBytes: 0 };
      if (msg.role === 'assistant') {
        const u = msg.usage || {};
        row.inputTokens = Number(u.input_tokens) || 0;
        row.outputTokens = Number(u.output_tokens) || 0;
        row.cacheRead = Number(u.cache_read_input_tokens) || 0;
        row.cacheCreate = Number(u.cache_creation_input_tokens) || 0;
        for (const b of content) {
          if (b && b.type === 'tool_use' && b.name === 'Read' && b.input && isProcedurePath(b.input.file_path, worktree)) procedureReads.add(b.id);
        }
      } else {
        for (const b of content) {
          if (!b || b.type !== 'tool_result') continue;
          row.toolRoundTrip = true;
          if (procedureReads.has(b.tool_use_id)) row.procedureBytes += resultBytes(b.content);
        }
      }
      rows.push(row);
    });
    rl.on('close', resolve);
  });
  return rows;
}

module.exports = { TRANSCRIPT_SLUG_RULE, slugForCwd, locateTranscripts, readUsage, isProcedurePath };
```

- [ ] **Step 5: Run the test**

Run: `node --test tests/bin-lib/timing/transcript.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/timing/transcript.js tests/bin-lib/timing/transcript.test.js tests/fixtures/timing/transcript-small.jsonl
git commit -m "Add the transcript locator and streaming usage reader — slug rule pinned against a real path (refs #1929)"
```

---

### Task 2: `derive.js` — `joinTokens` and `countGuardEvents`

**Files:**
- Modify: `plugin/bin/lib/timing/derive.js` (append two exported functions; `derivePhases` untouched)
- Test: `tests/bin-lib/timing/derive.test.js` (extend)

**Interfaces:**
- Consumes: `derivePhases(...).phases` rows (`start`/`end` ISO strings, `source`) and Task 1's usage rows.
- Produces: `joinTokens(phases, rows) → { phases: [...rows with tokens, procedureBytes, toolRoundTrips], unattributed: {tokens, procedureBytes, toolRoundTrips, rows}, totals: {tokens, procedureBytes, toolRoundTrips} }` where `tokens = {input, output, cacheRead, cacheCreate}`; `countGuardEvents(events) → {gateDenial, wdAmbiguous, wdDeny}`. Task 3 writes these into `timing.json`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/timing/derive.test.js` (it already imports `derivePhases`, `PHASES`, `NESTED_PARENT`, the fixture helpers and `byName`; add `joinTokens, countGuardEvents` to the destructured require):

```js
function usageRow(ts, extra = {}) {
  return { ts, role: 'assistant', inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreate: 0, toolRoundTrip: false, procedureBytes: 0, ...extra };
}

test('#1929 AC3: joinTokens sums rows into the innermost containing phase on [start, end)', () => {
  const out = derivePhases({ events: fixtureEvents(), manifest: fixtureManifest(), now: new Date('2026-09-05T14:13:00.000Z') });
  const rows = [
    usageRow('2026-09-05T12:59:00.000Z', { inputTokens: 1, outputTokens: 1 }),            // before call-1 → unattributed
    usageRow('2026-09-05T13:50:00.000Z', { inputTokens: 100, outputTokens: 10, cacheRead: 1000 }), // review
    usageRow('2026-09-05T13:56:00.000Z', { role: 'user', toolRoundTrip: true, procedureBytes: 500 }), // review
    usageRow('2026-09-05T13:57:00.000Z', { inputTokens: 7 }),                                  // exactly wrap-up's start → wrap-up, not review
    usageRow('2026-09-05T14:00:00.000Z', { inputTokens: 200, outputTokens: 20, cacheCreate: 50 }), // wrap-up
    usageRow('2026-09-05T13:30:00.000Z', { inputTokens: 3 }),                                  // call-2 preflight gap → call-2
    usageRow('2026-09-05T13:10:00.000Z', { inputTokens: 5, outputTokens: 5 }),                  // inside tasks (innermost), not build/call-1
  ];
  const joined = joinTokens(out.phases, rows);
  const p = Object.fromEntries(joined.phases.map((x) => [x.phase, x]));
  assert.deepEqual(p.review.tokens, { input: 100, output: 10, cacheRead: 1000, cacheCreate: 0 });
  assert.equal(p.review.procedureBytes, 500);
  assert.equal(p.review.toolRoundTrips, 1);
  assert.deepEqual(p['wrap-up'].tokens, { input: 207, output: 20, cacheRead: 0, cacheCreate: 50 });
  assert.equal(p['call-2'].tokens.input, 3);
  assert.equal(p.tasks.tokens.input, 5);
  assert.equal(p.build.tokens.input, 0);
  assert.equal(p['call-1'].tokens.input, 0);
  assert.deepEqual(joined.unattributed.tokens, { input: 1, output: 1, cacheRead: 0, cacheCreate: 0 });
  assert.equal(joined.unattributed.rows, 1);
  assert.deepEqual(joined.totals.tokens, { input: 316, output: 36, cacheRead: 1000, cacheCreate: 50 });
  assert.equal(joined.totals.procedureBytes, 500);
  assert.equal(joined.totals.toolRoundTrips, 1);
});

test('#1929: joinTokens with no rows leaves zeroed columns and never throws on unattributed phases', () => {
  const out = derivePhases({ events: [{ ts: '2026-09-05T14:13:00.000Z', type: 'session-end' }] });
  const joined = joinTokens(out.phases, []);
  assert.equal(joined.phases.length, PHASES.length);
  for (const x of joined.phases) assert.deepEqual(x.tokens, { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
  assert.equal(joined.totals.toolRoundTrips, 0);
});

test('#1929: countGuardEvents counts the three guard event types and ignores the rest', () => {
  const events = [
    { ts: 't', type: 'gate-denial' }, { ts: 't', type: 'gate-denial' },
    { ts: 't', type: 'wd-ambiguous' }, { ts: 't', type: 'wd-deny' }, { ts: 't', type: 'wd-deny' }, { ts: 't', type: 'wd-deny' },
    { ts: 't', type: 'wd-foreign-session' }, { ts: 't', type: 'commit', action: 'push' },
  ];
  assert.deepEqual(countGuardEvents(events), { gateDenial: 2, wdAmbiguous: 1, wdDeny: 3 });
  assert.deepEqual(countGuardEvents([]), { gateDenial: 0, wdAmbiguous: 0, wdDeny: 0 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const d=require("./plugin/bin/lib/timing/derive"); process.exit(typeof d.joinTokens === "function" && typeof d.countGuardEvents === "function" ? 0 : 1)'`
Expected: FAIL — exit code 1 (neither export exists). Then `node --test tests/bin-lib/timing/derive.test.js` shows the three new tests red.

- [ ] **Step 3: Implement**

Append to `plugin/bin/lib/timing/derive.js` before `module.exports`:

```js
const ZERO_TOKENS = () => ({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });

// (phases, usageRows) -> { phases, unattributed, totals } (#1929). Each row
// joins the innermost phase whose [start, end) contains its ts — the same
// rule verify events use — so a container's tokens are its exclusive-gap
// tokens. Rows outside every phase land in `unattributed`. Token fields
// come from assistant rows, round-trips/procedure bytes from user rows;
// the reader keeps the groups exclusive per row, so sums never double.
function joinTokens(phases, usageRows) {
  const rows = Array.isArray(usageRows) ? usageRows : [];
  const spans = (Array.isArray(phases) ? phases : []).map((p) => ({
    phase: p.phase, start: ms(p.start), end: ms(p.end), source: p.source,
  }));
  const acc = new Map();
  const bucket = () => ({ tokens: ZERO_TOKENS(), procedureBytes: 0, toolRoundTrips: 0, rows: 0 });
  for (const s of spans) acc.set(s.phase, bucket());
  const unattributed = bucket();
  const add = (b, r) => {
    b.tokens.input += Number(r.inputTokens) || 0;
    b.tokens.output += Number(r.outputTokens) || 0;
    b.tokens.cacheRead += Number(r.cacheRead) || 0;
    b.tokens.cacheCreate += Number(r.cacheCreate) || 0;
    b.procedureBytes += Number(r.procedureBytes) || 0;
    if (r.toolRoundTrip) b.toolRoundTrips += 1;
    b.rows += 1;
  };
  for (const r of rows) {
    const t = ms(r && r.ts);
    if (t === null) continue;
    let best = null;
    for (const s of spans) {
      if (s.start === null || s.end === null || s.source === 'unattributed') continue;
      if (!(t >= s.start && t < s.end)) continue;
      if (!best || (s.end - s.start) < (best.end - best.start) || ((s.end - s.start) === (best.end - best.start) && s.start > best.start)) best = s;
    }
    add(best ? acc.get(best.phase) : unattributed, r);
  }
  const outPhases = (Array.isArray(phases) ? phases : []).map((p) => {
    const b = acc.get(p.phase);
    return { ...p, tokens: b.tokens, procedureBytes: b.procedureBytes, toolRoundTrips: b.toolRoundTrips };
  });
  const totals = bucket();
  for (const r of rows) if (ms(r && r.ts) !== null) add(totals, r);
  delete totals.rows;
  return { phases: outPhases, unattributed, totals };
}

const GUARD_TYPES = { 'gate-denial': 'gateDenial', 'wd-ambiguous': 'wdAmbiguous', 'wd-deny': 'wdDeny' };

// (events) -> { gateDenial, wdAmbiguous, wdDeny } (#1929): the per-run cost
// of the worktree/gate guards, so filed false-positive records can be
// prioritized by measurement.
function countGuardEvents(events) {
  const out = { gateDenial: 0, wdAmbiguous: 0, wdDeny: 0 };
  for (const e of Array.isArray(events) ? events : []) {
    const key = e && GUARD_TYPES[e.type];
    if (key) out[key] += 1;
  }
  return out;
}
```

And extend the export: `module.exports = { derivePhases, PHASES, NESTED_PARENT, joinTokens, countGuardEvents };`

Note: `ms(...)` is the file's existing ISO-to-millis helper; `polish` on the fixture is `unattributed` with `start === end`, which the `source === 'unattributed'` skip and the `[start, end)` test both exclude.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/timing/derive.test.js`
Expected: PASS (all prior tests plus the three new ones).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/timing/derive.js tests/bin-lib/timing/derive.test.js
git commit -m "Join transcript usage rows to phases and count guard denials — innermost-phase attribution, unattributed bucket (refs #1929)"
```

---

### Task 3: `phase-timing.js` — `--transcript`, `--auto-transcript`, columns, footer, note

**Files:**
- Modify: `plugin/bin/phase-timing.js` (whole file — `main` becomes async)
- Test: `tests/bin-lib/timing/cli.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's `locateTranscripts`/`readUsage`, Task 2's `joinTokens`/`countGuardEvents`.
- Produces: `timing.json` additions per phase `tokens`, `procedureBytes`, `toolRoundTrips`; `unattributed`; `totals.tokens`, `totals.procedureBytes`, `totals.toolRoundTrips`, `totals.guard`; `transcripts: [{path, rows, note?}]`; `notes: [string]`. Markdown header `| Phase | Minutes | Verify | Tokens (in/out) | Proc. KB | Tool RTs |`, footer `Guard denials: {n} gate · {n} wd-ambiguous · {n} wd-deny`, note line `tokens: transcript not found ({reason})`. Task 4 cites `--auto-transcript`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/timing/cli.test.js` (reuse `run`, `tmpRun`, `FIX`):

```js
const TFIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'transcript-small.jsonl');

test('#1929 AC4: --transcript twice sums both, prints the three columns and the Guard footer, writes totals.guard', () => {
  const dir = tmpRun(true);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"ts":"2026-09-05T13:05:00.000Z","type":"gate-denial"}\n{"ts":"2026-09-05T13:06:00.000Z","type":"wd-deny"}\n{"ts":"2026-09-05T13:07:00.000Z","type":"wd-deny"}\n');
  const r = run(['--run', dir, '--transcript', TFIX, '--transcript', TFIX, '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], '| Phase | Minutes | Verify | Tokens (in/out) | Proc. KB | Tool RTs |');
  // every fixture transcript row sits in 13:50-13:51 → review; two transcripts double it
  assert.match(r.stdout, /^\| review \| 8 \| — \| 232\/456 \| 0\.0 \| 6 \|$/m);
  assert.match(r.stdout, /^Guard denials: 1 gate · 0 wd-ambiguous · 2 wd-deny$/m);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
  assert.deepEqual(json.totals.guard, { gateDenial: 1, wdAmbiguous: 0, wdDeny: 2 });
  assert.deepEqual(json.totals.tokens, { input: 232, output: 456, cacheRead: 620, cacheCreate: 104 });
  assert.equal(json.totals.procedureBytes, 36);
  assert.equal(json.totals.toolRoundTrips, 6);
  assert.equal(json.transcripts.length, 2);
  assert.equal(json.transcripts[0].rows, 7);
});

test('#1929 AC4: a nonexistent --transcript prints the not-found note, blank columns, exit 0', () => {
  const dir = tmpRun(true);
  const r = run(['--run', dir, '--transcript', path.join(os.tmpdir(), 'ct-missing-transcript.jsonl'), '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^tokens: transcript not found \(ENOENT/m);
  assert.match(r.stdout, /^\| review \| 8 \| — \| — \| — \| — \|$/m);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
  assert.equal(json.transcripts[0].rows, 0);
  assert.match(json.transcripts[0].note, /ENOENT/);
});

test('#1929: without any --transcript the table keeps its #1928 three-column shape', () => {
  const dir = tmpRun(true);
  const r = run(['--run', dir, '--markdown']);
  assert.equal(r.stdout.split('\n')[0], '| Phase | Minutes | Verify |');
  assert.doesNotMatch(r.stdout, /Guard denials/);
});

test('#1929 AC4: --auto-transcript locates the run session transcript from run-state.json under a fixture home', () => {
  const dir = tmpRun(true);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-timing-home-'));
  const worktree = '/Users/x/Code/repo/.claude/worktrees/wt';
  const slugDir = path.join(home, '.claude', 'projects', '-Users-x-Code-repo--claude-worktrees-wt');
  fs.mkdirSync(slugDir, { recursive: true });
  fs.copyFileSync(TFIX, path.join(slugDir, 'sess-9.jsonl'));
  fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({ worktree, sessionId: 'sess-9', status: 'active' }));
  const r = spawnSync(process.execPath, [CLI, '--run', dir, '--markdown', '--auto-transcript'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^\| review \| 8 \| — \| 116\/228 \| 0\.0 \| 3 \|$/m);
  const none = tmpRun(true);
  fs.writeFileSync(path.join(none, 'run-state.json'), JSON.stringify({ status: 'active' }));
  const r2 = spawnSync(process.execPath, [CLI, '--run', none, '--markdown', '--auto-transcript'], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /^tokens: transcript not found \(no worktree or sessionId in run-state\.json\)$/m);
});
```

`os.homedir()` honours `HOME` on macOS/Linux, which is what the locator's default `homeDir` reads.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const s=require("fs").readFileSync("plugin/bin/phase-timing.js","utf8"); process.exit(s.includes("--auto-transcript") ? 0 : 1)'`
Expected: FAIL — exit 1. Then `node --test tests/bin-lib/timing/cli.test.js` shows the four new tests red (`--transcript` is an unknown flag → exit 2).

- [ ] **Step 3: Implement**

Rewrite `plugin/bin/phase-timing.js` as follows (the #1928 behaviour is preserved verbatim where not extended):

```js
#!/usr/bin/env node
// bin/phase-timing.js — render a run's per-phase timing (#1928) and, given
// a transcript, its per-phase tokens (#1929).
//
//   node bin/phase-timing.js --run <dir> [--json] [--markdown]
//        [--transcript <path> ...] [--auto-transcript]
//
// Reads {run-dir}/events.jsonl (per-line JSON; a malformed line is skipped,
// a missing file is an empty run), {run-dir}/manifest.yml (optional) and
// {run-dir}/run-state.json (optional: pr.mergedAt; worktree + sessionId for
// --auto-transcript), writes {run-dir}/timing.json, and prints the markdown
// table (--markdown) or the JSON object (--json); with neither it prints the
// path it wrote. Exit 0 in every derivable case — missing events degrade per
// row to `unattributed`; a missing or unreadable transcript degrades to
// blank token columns plus one `tokens: transcript not found (...)` line.
// `--run ""` (present but empty — the canonical skill snippet's unset-
// $PIPELINE_RUN_DIR idiom, matching verify.js's own treatment of it) prints
// "no run directory" to stderr, writes nothing, and returns 0. Exit 2 only
// on a genuinely malformed invocation: a MISSING --run flag, a --run that
// is not a directory, an events.jsonl that exists but cannot be read, or a
// --transcript flag with no value.
//
// --transcript is repeatable (dispatch's two Task calls have two agent
// transcripts; the orchestrator passes both). --auto-transcript is the
// single-session case: it locates {home}/.claude/projects/{slug}/{sessionId}
// .jsonl from run-state.json's worktree + sessionId (bin/lib/timing/
// transcript.js), picks the newest candidate, and notes any it ignored.
'use strict';
const fs = require('fs');
const path = require('path');
const { derivePhases, joinTokens, countGuardEvents } = require('./lib/timing/derive');
const { locateTranscripts, readUsage } = require('./lib/timing/transcript');
const { readManifest } = require('./lib/flow/manifest');

const USAGE = 'usage: phase-timing.js --run <dir> [--json] [--markdown] [--transcript <path> ...] [--auto-transcript]\n';

function parseArgs(argv) {
  const o = { run: null, json: false, markdown: false, transcripts: [], autoTranscript: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run') { o.run = argv[i + 1]; i++; if (o.run === undefined) return null; continue; }
    if (a === '--transcript') { const v = argv[i + 1]; i++; if (v === undefined) return null; o.transcripts.push(v); continue; }
    if (a === '--auto-transcript') { o.autoTranscript = true; continue; }
    if (a === '--json') { o.json = true; continue; }
    if (a === '--markdown') { o.markdown = true; continue; }
    return null;
  }
  if (o.run === null) return null; // flag never supplied — malformed
  return o;
}

function readEvents(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, events: [] };
    return { ok: false, error: err.message };
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* per-row skip, never fatal */ }
  }
  return { ok: true, events };
}

function readJsonOrNull(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function verifyCell(verify) {
  if (!verify.length) return '—';
  const counts = new Map();
  for (const v of verify) counts.set(v.mode || 'unknown', (counts.get(v.mode || 'unknown') || 0) + 1);
  return [...counts].map(([m, n]) => `${m} ×${n}`).join(', ');
}

function kb(bytes) { return (bytes / 1024).toFixed(1); }

// out: derivePhases result; tokens: joinTokens result or null (no transcript
// requested); notes: lines printed before the table.
function renderMarkdown(out, tokens = null, guard = null, notes = []) {
  const withTokens = tokens !== null;
  const lines = [];
  for (const n of notes) lines.push(n);
  lines.push(withTokens ? '| Phase | Minutes | Verify | Tokens (in/out) | Proc. KB | Tool RTs |' : '| Phase | Minutes | Verify |');
  lines.push(withTokens ? '|---|---|---|---|---|---|' : '|---|---|---|');
  const rows = withTokens ? tokens.phases : out.phases;
  const blank = withTokens && tokens.totals.rows === 0;
  for (const p of rows) {
    const minutes = p.ownMinutes !== p.minutes ? `${p.minutes} (own ${p.ownMinutes})` : String(p.minutes);
    const verify = p.source === 'unattributed' ? 'unattributed' : verifyCell(p.verify);
    const extra = !withTokens ? '' : blank
      ? ' — | — | — |'
      : ` ${p.tokens.input}/${p.tokens.output} | ${kb(p.procedureBytes)} | ${p.toolRoundTrips} |`;
    lines.push(`| ${p.phase} | ${minutes} | ${verify} |${extra}`);
  }
  if (out.totals.minutes > 0 || out.totals.verifyRuns > 0) {
    const verifyTot = `${out.totals.verifyRuns} run(s)${out.totals.verifyModes.length ? ` (${out.totals.verifyModes.join(', ')})` : ''}`;
    const extra = !withTokens ? '' : blank
      ? ' — | — | — |'
      : ` ${tokens.totals.tokens.input}/${tokens.totals.tokens.output} | ${kb(tokens.totals.procedureBytes)} | ${tokens.totals.toolRoundTrips} |`;
    lines.push(`| total | ${out.totals.minutes} | ${verifyTot} |${extra}`);
  }
  if (guard) lines.push('', `Guard denials: ${guard.gateDenial} gate · ${guard.wdAmbiguous} wd-ambiguous · ${guard.wdDeny} wd-deny`);
  return lines.join('\n') + '\n';
}

// Resolve the transcript list: explicit --transcript paths, plus the
// auto-located one. Returns { paths, notes }.
function resolveTranscripts(o, runState) {
  const paths = [...o.transcripts];
  const notes = [];
  if (o.autoTranscript) {
    const worktree = runState && typeof runState.worktree === 'string' ? runState.worktree : null;
    const sessionId = runState && typeof runState.sessionId === 'string' ? runState.sessionId : null;
    if (!worktree && !sessionId) {
      notes.push('tokens: transcript not found (no worktree or sessionId in run-state.json)');
    } else {
      const found = locateTranscripts({ cwd: worktree, sessionId });
      if (!found.length) notes.push(`tokens: transcript not found (no ${sessionId ? `${sessionId}.jsonl` : '*.jsonl'} under the ${worktree ? 'worktree slug' : 'projects'} directory)`);
      else {
        paths.push(found[0].path);
        if (found.length > 1) notes.push(`tokens: ${found.length - 1} other candidate(s) ignored: ${found.slice(1).map((c) => c.path).join(', ')}`);
      }
    }
  }
  return { paths, notes };
}

async function main(argv) {
  const o = parseArgs(argv);
  if (!o) { process.stderr.write(USAGE); return 2; }
  if (o.run === '') {
    process.stderr.write('timing: no run directory (PIPELINE_RUN_DIR unset)\n');
    return 0;
  }
  const runDir = path.resolve(o.run);
  let stat = null;
  try { stat = fs.statSync(runDir); } catch { /* not a directory, handled below */ }
  if (!stat || !stat.isDirectory()) { process.stderr.write(`phase-timing.js: --run ${o.run} is not a directory\n${USAGE}`); return 2; }
  const events = readEvents(path.join(runDir, 'events.jsonl'));
  if (!events.ok) { process.stderr.write(`phase-timing.js: events.jsonl unreadable (${events.error})\n`); return 2; }
  const runState = readJsonOrNull(path.join(runDir, 'run-state.json'));
  const out = derivePhases({ events: events.events, manifest: readManifest(runDir), runState });

  const wantTokens = o.transcripts.length > 0 || o.autoTranscript;
  const { paths, notes } = wantTokens ? resolveTranscripts(o, runState) : { paths: [], notes: [] };
  const transcripts = [];
  let rows = [];
  for (const p of paths) {
    try {
      const r = await readUsage(p, { worktree: runState && runState.worktree ? runState.worktree : null });
      transcripts.push({ path: p, rows: r.length });
      rows = rows.concat(r);
    } catch (err) {
      const reason = `${err && err.code ? err.code : 'unreadable'}: ${p}`;
      transcripts.push({ path: p, rows: 0, note: `transcript not found (${reason})` });
      notes.push(`tokens: transcript not found (${reason})`);
    }
  }
  const tokens = wantTokens ? joinTokens(out.phases, rows) : null;
  if (tokens) tokens.totals.rows = rows.length;
  const guard = wantTokens ? countGuardEvents(events.events) : null;

  const timing = { runDir, generatedAt: new Date().toISOString(), phases: tokens ? tokens.phases : out.phases, totals: { ...out.totals } };
  if (tokens) {
    timing.unattributed = tokens.unattributed;
    timing.totals.tokens = tokens.totals.tokens;
    timing.totals.procedureBytes = tokens.totals.procedureBytes;
    timing.totals.toolRoundTrips = tokens.totals.toolRoundTrips;
    timing.totals.guard = guard;
    timing.transcripts = transcripts;
    if (notes.length) timing.notes = notes;
  }
  const timingPath = path.join(runDir, 'timing.json');
  fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');
  if (o.markdown) process.stdout.write(renderMarkdown(out, tokens, guard, notes));
  else if (o.json) process.stdout.write(JSON.stringify(timing, null, 2) + '\n');
  else process.stdout.write(`timing: wrote ${timingPath}\n`);
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
module.exports = { main, parseArgs, renderMarkdown };
```

Arithmetic the tests pin, from the fixture transcript: per pass, assistant rows sum input 116 (10 + 1 + 5 + 100), output 228 (20 + 2 + 6 + 200), cacheRead 310, cacheCreate 52; procedureBytes 18; toolRoundTrips 3; every row's `ts` (13:50:00-13:50:35) falls in `review` (13:49→13:57). Two passes double each: 232/456, cacheRead 620, cacheCreate 104, bytes 36 (0.0 KB), RTs 6.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/timing/*.test.js`
Expected: PASS — every #1928 test unchanged (the three-column shape without transcripts, the exit codes) plus the four new ones.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/phase-timing.js tests/bin-lib/timing/cli.test.js
git commit -m "Add token columns, the Guard denials footer, and --transcript/--auto-transcript to phase-timing.js — blank columns with a note when no transcript (refs #1929)"
```

---

### Task 4: Prose consumers, docs, conformance test

**Files:**
- Modify: `plugin/skills/flow/summary-template.md` (the `### Timing` block), `plugin/skills/wrap-up/summary-template.md` (same), `plugin/skills/flow/multispec-summary.md` (same, parent-level), `plugin/skills/wrap-up/verification-brief.md` (the `timing` PR-comment command), `plugin/skills/dispatch/SKILL.md` (the Reporting timing line), `docs/plugin-structure.md` (the `bin/lib/timing/` row and the `phase-timing.js` CLI line), `docs/hooks.md` (line 9)
- Test: `tests/timing-prose-conformance.test.js` (extend)

**Interfaces:** consumes Task 3's flags and note line.

- [ ] **Step 1: Write the failing tests**

Append to `tests/timing-prose-conformance.test.js`:

```js
test('#1929 AC5: the three summary Timing blocks and the PR timing command pass --auto-transcript after --markdown', () => {
  for (const f of ['plugin/skills/flow/summary-template.md', 'plugin/skills/wrap-up/summary-template.md', 'plugin/skills/flow/multispec-summary.md', 'plugin/skills/wrap-up/verification-brief.md']) {
    const t = read(f);
    assert.match(t, /bin\/phase-timing\.js" --run "(\$PIPELINE_RUN_DIR|\$MULTISPEC_PARENT_DIR)" --markdown --auto-transcript/, f);
    assert.match(t, /tokens: transcript not found/, `${f} must say the note line renders verbatim`);
  }
});

test('#1929 AC5: dispatch/SKILL.md carries the token clause on its timing line and stays under the ceiling', () => {
  const t = read('plugin/skills/dispatch/SKILL.md');
  assert.match(t, /`timing: call-1 \{m\}m · call-2 \{m\}m · verify \{n\} run\(s\) \(\{modes\}\) · \{k\} tokens in \/ \{m\} out`/);
  assert.match(t, /--transcript/, 'dispatch passes both agent transcripts explicitly');
  assert.ok(Buffer.byteLength(t, 'utf8') <= CEILING, `dispatch/SKILL.md is ${Buffer.byteLength(t, 'utf8')} B`);
});

test('#1929: docs name the transcript reader, the new flags, and the guard counts', () => {
  const ps = read('docs/plugin-structure.md');
  assert.match(ps, /^plugin\/bin\/lib\/timing\/ [^\n]*transcript\.js/m);
  assert.match(ps, /^node plugin\/bin\/phase-timing\.js --run <dir> \[--json\] \[--markdown\] \[--transcript <path> \.\.\.\] \[--auto-transcript\]/m);
  assert.match(read('docs/hooks.md'), /timing\.json[^\n]*(gate-denial|guard)/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const s=require("fs").readFileSync("plugin/skills/flow/summary-template.md","utf8"); process.exit(s.includes("--auto-transcript") ? 0 : 1)'`
Expected: FAIL — exit code 1 (no consumer carries `--auto-transcript` yet). Then `node --test tests/timing-prose-conformance.test.js` shows the three new tests red (no `--auto-transcript`, no token clause, no docs rows).

- [ ] **Step 3: Summary templates and the PR command**

In each of `plugin/skills/flow/summary-template.md`, `plugin/skills/wrap-up/summary-template.md`, and `plugin/skills/flow/multispec-summary.md`, change the Timing block's command from `… --markdown` to `… --markdown --auto-transcript` (keep the run-dir variable each file already uses), replace the table skeleton with the six-column shape:

```markdown
| Phase | Minutes | Verify | Tokens (in/out) | Proc. KB | Tool RTs |
|---|---|---|---|---|---|
| {phase} | {minutes} | {mode ×n | — | unattributed} | {in/out | —} | {kb | —} | {n | —} |
| total | {totals.minutes} | {verifyRuns} run(s) ({modes}) | {in/out} | {kb} | {n} |

Guard denials: {n} gate · {n} wd-ambiguous · {n} wd-deny
```

and add one sentence after the "never composed by hand" sentence: "When the CLI prints a `tokens: transcript not found (...)` line, render it verbatim above the table — blank token columns are a fact about the run, not a formatting error (#1929)."

In `plugin/skills/wrap-up/verification-brief.md`, the `timing` PR-comment command gains ` --auto-transcript` after `--markdown`, and the sentence introducing it gains: "; a `tokens: transcript not found (...)` line, when present, is posted verbatim with the table".

- [ ] **Step 4: `dispatch/SKILL.md`**

In the Reporting section's timing sentence, change the literal to `` `timing: call-1 {m}m · call-2 {m}m · verify {n} run(s) ({modes}) · {k} tokens in / {m} out` `` and append to that sentence: " — the token clause comes from running the CLI with both Task calls' agent transcripts passed explicitly (`--transcript <call-1 transcript> --transcript <call-2 transcript>`; `--auto-transcript` is for the single-session case and never discovers them), and is omitted when the CLI printed a `tokens: transcript not found` note". Then `wc -c plugin/skills/dispatch/SKILL.md` — it must print ≤ 40,960; the current value is 40,875 and the addition is ~330 bytes, so a trim IS needed here after all: in the same Reporting section, shorten the sentence beginning "A headless (Routine-fired) firing's report has nobody live to read it" by deleting its trailing clause " — it scans GitHub state independently on its own cadence and surfaces `bot:blocked` records and stale claims without dispatch having to push anything to it directly" (first `grep -rn "scans GitHub state independently" tests/` to confirm no pin; it returned nothing at plan time). Quote the final byte count.

- [ ] **Step 5: Docs**

`docs/plugin-structure.md`: extend the `plugin/bin/lib/timing/` row (line ~38) with "; transcript.js — the session-transcript locator (`TRANSCRIPT_SLUG_RULE`, pinned empirically) and the streaming usage reader that feeds `joinTokens` (#1929)"; replace the `phase-timing.js` CLI line (~121) with:

```
node plugin/bin/phase-timing.js --run <dir> [--json] [--markdown] [--transcript <path> ...] [--auto-transcript]   # Per-phase timing (#1928) and tokens (#1929) — writes {run-dir}/timing.json, prints the Timing table; a missing transcript is a note line, never a failure; exit 0 whenever derivable, 2 on a malformed invocation
```

`docs/hooks.md` line 9: after the `verify` event clause add "; `gate-denial`, `wd-ambiguous`, and `wd-deny` are counted per run into `timing.json`'s `totals.guard` by `bin/phase-timing.js` (#1929)".

- [ ] **Step 6: Run the tests**

Run: `node --test tests/timing-prose-conformance.test.js tests/bin-lib/verify/snippet-conformance.test.js tests/skill-catalog-completeness.test.js tests/flow-subfile-table-completeness.test.js tests/dispatch-worktree-anchoring.test.js tests/dispatch-flow-rundir-handoff.test.js tests/dispatch-budget-drain.test.js tests/batch-ref-argument.test.js tests/pr-run-comments.test.js` (skip any file that does not exist)
Expected: PASS. Quote `wc -c` for every `plugin/skills/**/*.md` touched.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/flow/summary-template.md plugin/skills/wrap-up/summary-template.md plugin/skills/flow/multispec-summary.md plugin/skills/wrap-up/verification-brief.md plugin/skills/dispatch/SKILL.md docs/plugin-structure.md docs/hooks.md tests/timing-prose-conformance.test.js
git commit -m "Render token columns in every Timing consumer — --auto-transcript for sessions, explicit transcripts for dispatch (refs #1929)"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 (`transcript.js`) → Task 1; Deliverable 2 (`joinTokens`, `countGuardEvents`) → Task 2; Deliverable 3 (CLI flags, columns, footer, note) → Task 3; Deliverable 4 (templates, dispatch line) → Task 4; Deliverable 5 (tests) → each task; Deliverable 6 (docs) → Task 4. AC1 → Task 1 (the observed pair pinned); AC2 → Task 1; AC3 → Task 2 (review/wrap-up sums, the exact-`end` row, the unattributed row); AC4 → Task 3; AC5 → Task 4; AC6 → the build's suite step.
- **Placeholder scan:** none.
- **Type consistency:** rows `{ts, role, inputTokens, outputTokens, cacheRead, cacheCreate, toolRoundTrip, procedureBytes}` (Tasks 1-3); `joinTokens → {phases, unattributed, totals}` with `tokens: {input, output, cacheRead, cacheCreate}` (Tasks 2-3); `countGuardEvents → {gateDenial, wdAmbiguous, wdDeny}` (Tasks 2-3, docs in Task 4).
- **Plan-authoring checks:** Real-input probe — decision 1's slug pair and decision 4's installed-cache path both come from this session's real transcript, and Task 3's implementer is told to run the CLI with `--auto-transcript` against this run's own parent directory before reporting. Sole-site — every consumer of the Timing command (four files) is edited in Task 4 and pinned by one regex. Byte-pin — `dispatch/SKILL.md` 40,875 B with a named trim; the summary templates and brief are far under. Return-shape widening — `renderMarkdown`'s three-column shape is preserved when no transcript is requested (pinned by a new test) so #1928's tests stay green. Gate-over-producers — the conformance regex requires `--auto-transcript` after `--markdown` in all four consumers, matching #1928's adjacency pin. Consumer-timing — `--auto-transcript` reads `run-state.json` from the run dir the command already points at (archived or live), so the archived-run-dir sentence from #1928 still covers it.
