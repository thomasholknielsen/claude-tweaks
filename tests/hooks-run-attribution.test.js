'use strict';

// Run-dir attribution under concurrent sessions (#62).
//
// resolveRunDir's fallback — "the newest non-terminal run under cwd" — is only
// correct when exactly one pipeline run is in flight system-wide. The moment two
// sessions each have one, any hook invocation without PIPELINE_RUN_DIR attributes
// its event to whichever run sorts newest. Two consequences were observed in
// production: a run's events.jsonl accumulating commits from three unrelated
// worktrees, and a run whose issue had been closed hours earlier stamped
// `interrupted` forever by a bystander session's session-end.
//
// The second is self-perpetuating, which is why it never cleared: the
// `interrupted` stamp is itself what keeps the run non-terminal, so it keeps
// winning the same fallback for every session that follows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ctxLib = require('../plugin/bin/lib/hooks/context.js');
const sessionEnd = require('../plugin/bin/lib/hooks/session-end.js');
const preCompact = require('../plugin/bin/lib/hooks/pre-compact.js');

function project() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-attr-')));
}

// `id` doubles as the run-dir name's sort key — runs are selected newest-first
// by lexical name, so a later id is the one the old fallback would pick.
function mkRun(cwd, id, state) {
  const dir = path.join(cwd, '.claude-tweaks', 'pipelines', id);
  fs.mkdirSync(dir, { recursive: true });
  if (state) fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  return dir;
}

const readEvents = (dir) => {
  const f = path.join(dir, 'events.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
};
const readState = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'run-state.json'), 'utf8'));

// ─── resolveRun ────────────────────────────────────────────────────────────

test('a run owned by this session wins over a newer run owned by another', () => {
  const cwd = project();
  const mine = mkRun(cwd, '2026-07-01T090000-mine', { status: 'active', sessionId: 'me' });
  mkRun(cwd, '2026-07-02T090000-theirs', { status: 'active', sessionId: 'them' });

  // Newest-first ordering would pick "theirs" — ownership overrides recency.
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: mine, attribution: 'session' });
});

test('a run owned by another session is never resolved for this one', () => {
  const cwd = project();
  mkRun(cwd, '2026-07-01T090000-theirs', { status: 'active', sessionId: 'them' });

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: null, attribution: null });
});

test('an unowned run is still resolved, tagged as a guess', () => {
  const cwd = project();
  // Ownership is only stamped by `record-worktree`, so a run that never
  // provisioned a worktree has none — it may well be ours.
  const run = mkRun(cwd, '2026-07-01T090000-unowned', { status: 'active' });

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: run, attribution: 'fallback' });
});

test('an unowned run is preferred over a foreign-owned newer one', () => {
  const cwd = project();
  const unowned = mkRun(cwd, '2026-07-01T090000-unowned', { status: 'active' });
  mkRun(cwd, '2026-07-02T090000-theirs', { status: 'active', sessionId: 'them' });

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: unowned, attribution: 'fallback' });
});

test('an unknown caller keeps the pre-#62 behavior exactly', () => {
  const cwd = project();
  mkRun(cwd, '2026-07-01T090000-a', { status: 'active', sessionId: 'them' });
  const newest = mkRun(cwd, '2026-07-02T090000-b', { status: 'active', sessionId: 'also-them' });

  // record-worktree and close-run deliberately resolve runs they do NOT own so
  // they can report that fact — filtering by an owner we cannot compare against
  // would break them.
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, null), { dir: newest, attribution: 'fallback' });
  assert.strictEqual(ctxLib.resolveRunDir(cwd, {}), newest);
});

test('PIPELINE_RUN_DIR still wins over everything and is never a guess', () => {
  const cwd = project();
  const pinned = mkRun(cwd, '2026-07-01T090000-pinned', { status: 'active', sessionId: 'them' });
  mkRun(cwd, '2026-07-02T090000-mine', { status: 'active', sessionId: 'me' });

  assert.deepStrictEqual(
    ctxLib.resolveRun(cwd, { PIPELINE_RUN_DIR: pinned }, 'me'),
    { dir: pinned, attribution: 'env' },
  );
});

test('a clean run is terminal and never resolved, even for its owner', () => {
  const cwd = project();
  mkRun(cwd, '2026-07-01T090000-done', { status: 'clean', sessionId: 'me' });

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: null, attribution: null });
});

// ─── the two reported symptoms ─────────────────────────────────────────────

test("a bystander session's session-end cannot stamp interrupted on another session's run", () => {
  const cwd = project();
  const theirs = mkRun(cwd, '2026-07-01T090000-theirs', { status: 'active', sessionId: 'them' });

  const owned = ctxLib.resolveRun(cwd, {}, 'bystander');
  sessionEnd.run({ input: { reason: 'exit', session_id: 'bystander' }, ownedRun: owned, cwd });

  assert.strictEqual(readState(theirs).status, 'active', 'a finished run must not be flagged by a passer-by');
  assert.deepStrictEqual(readEvents(theirs), [], "and must not receive the bystander's events");
});

test('session-end does not stamp interrupted on a guessed run, but still records the event', () => {
  const cwd = project();
  const unowned = mkRun(cwd, '2026-07-01T090000-unowned', { status: 'active' });

  const owned = ctxLib.resolveRun(cwd, {}, 'someone');
  sessionEnd.run({ input: { reason: 'exit', session_id: 'someone' }, ownedRun: owned, cwd });

  // The stamp is the self-perpetuating part — withheld. The breadcrumb is not.
  assert.strictEqual(readState(unowned).status, 'active');
  const ev = readEvents(unowned);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].type, 'session-end');
  assert.strictEqual(ev[0].attribution, 'fallback', 'a guessed event must be filterable');
});

test('session-end DOES stamp interrupted on a run this session owns', () => {
  const cwd = project();
  const mine = mkRun(cwd, '2026-07-01T090000-mine', { status: 'active', sessionId: 'me' });

  const owned = ctxLib.resolveRun(cwd, {}, 'me');
  sessionEnd.run({ input: { reason: 'exit', session_id: 'me' }, ownedRun: owned, cwd });

  assert.strictEqual(readState(mine).status, 'interrupted', 'the warning must still fire for a real interruption');
  assert.strictEqual(readEvents(mine)[0].attribution, undefined, 'a known-owner event carries no guess tag');
});

test('pre-compact does not overwrite lastEvent on a guessed run', () => {
  const cwd = project();
  const unowned = mkRun(cwd, '2026-07-01T090000-unowned', { status: 'active', lastEvent: 'build-start' });

  const owned = ctxLib.resolveRun(cwd, {}, 'someone');
  preCompact.run({ input: { trigger: 'auto' }, ownedRun: owned, cwd });

  assert.strictEqual(readState(unowned).lastEvent, 'build-start');
  assert.strictEqual(readEvents(unowned)[0].attribution, 'fallback');
});

test('a run that already went interrupted is not re-stamped by its owner', () => {
  const cwd = project();
  const mine = mkRun(cwd, '2026-07-01T090000-mine', { status: 'interrupted', sessionId: 'me' });

  const owned = ctxLib.resolveRun(cwd, {}, 'me');
  sessionEnd.run({ input: { reason: 'exit', session_id: 'me' }, ownedRun: owned, cwd });

  assert.strictEqual(readState(mine).status, 'interrupted');
});

test('the attribution tag never displaces an event\'s own type or timestamp', () => {
  const cwd = project();
  const run = mkRun(cwd, '2026-07-01T090000-unowned', { status: 'active' });

  // Same invariant CLAUDE.md's spread rule protects: derived fields win.
  ctxLib.appendEvent(run, 'commit', { type: 'forged', ts: 'forged', attribution: 'forged' }, 'fallback');
  const ev = readEvents(run)[0];
  assert.strictEqual(ev.type, 'commit');
  assert.notStrictEqual(ev.ts, 'forged');
  assert.strictEqual(ev.attribution, 'fallback');
});

// ─── unadopted mints (#721) ────────────────────────────────────────────────

test('fallback never selects an unadopted mint (no run-state.json, no decisions.md)', () => {
  const cwd = project();
  const real = mkRun(cwd, '2026-07-01T090000-real', { status: 'active' });
  mkRun(cwd, '2026-07-02T090000-mint', null); // bare mkdir — sorts newest

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: real, attribution: 'fallback' });
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, null), { dir: real, attribution: 'fallback' });
});

test('a standalone run dir (decisions.md, no run-state.json) still wins fallback', () => {
  const cwd = project();
  const dir = mkRun(cwd, '2026-07-01T090000-tidy-standalone', null);
  fs.writeFileSync(path.join(dir, 'decisions.md'), '');

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir, attribution: 'fallback' });
});

test('only unadopted mints exist — resolves null rather than guessing into one', () => {
  const cwd = project();
  mkRun(cwd, '2026-07-02T090000-mint', null);

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir: null, attribution: null });
  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, null), { dir: null, attribution: null });
});

test('a run with a corrupt run-state.json and no decisions.md is still not a mint — presence, not parseability', () => {
  const cwd = project();
  const dir = mkRun(cwd, '2026-07-01T090000-corrupt', null);
  fs.writeFileSync(path.join(dir, 'run-state.json'), '{"status":"active", "worktree": "/trunc');

  assert.deepStrictEqual(ctxLib.resolveRun(cwd, {}, 'me'), { dir, attribution: 'fallback' });
});
