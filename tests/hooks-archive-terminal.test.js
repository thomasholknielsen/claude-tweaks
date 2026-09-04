// tests/hooks-archive-terminal.test.js — #208: "archived is terminal" invariant. Once a run-id
// exists under archive/{run-id}/, resolve() (the writer) must never create or reuse a live copy
// of it. #1103's fix-wave-1 narrowed the reader-side half: iterRunDirsWithState (the SessionStart
// reader) no longer treats mere existence of archive/{run-id}/ as proof of a completed archive —
// that existence-only check stranded any INCOMPLETE archive attempt as permanently "done" (see
// tests/hooks-context.test.js). It now hides a run only when the archive twin's OWN
// run-state.json genuinely reads status: 'clean'.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { gitRepo } = require('./helpers/git-fixtures');
const { resolve } = require('../plugin/bin/lib/hooks/run-dir-resolve');
const { iterRunDirsWithState } = require('../plugin/bin/lib/hooks/context');

function mkDir(main, ...segments) {
  const dir = path.join(main, '.claude-tweaks', 'pipelines', ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const FIXED_NOW = new Date(Date.UTC(2026, 6, 19, 10, 32, 47)); // -> 2026-07-19T103247
const RUN_ID = '2026-07-19T103247-spec-38';

test('AC1/AC2: --create refuses to recreate a run-id that already exists under archive/', () => {
  const main = gitRepo();
  mkDir(main, 'archive', RUN_ID); // already archived
  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-38', create: true, now: FIXED_NOW });

  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'archived-run-id');
  assert.strictEqual(
    fs.existsSync(path.join(main, '.claude-tweaks', 'pipelines', RUN_ID)),
    false,
    'no active directory may reappear under .claude-tweaks/pipelines/',
  );
});

test('AC1: the standalone-fallback create branch carries the same guard', () => {
  const main = gitRepo();
  const standaloneRunId = `${require('../plugin/bin/lib/hooks/run-dir-resolve').formatTimestamp(FIXED_NOW)}-record-9-standalone`;
  mkDir(main, 'archive', standaloneRunId);
  const out = resolve({ cwd: main, env: {}, standalone: 'record-9', create: true, now: FIXED_NOW });

  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'archived-run-id');
  assert.strictEqual(fs.existsSync(path.join(main, '.claude-tweaks', 'pipelines', standaloneRunId)), false);
});

test('a resurrected env-var target (archived, but a live copy exists again at the same path) is never adopted', () => {
  const main = gitRepo();
  mkDir(main, 'archive', RUN_ID);
  const resurrected = mkDir(main, RUN_ID); // a live copy has reappeared at the archived run-id
  const out = resolve({ cwd: main, env: { PIPELINE_RUN_DIR: resurrected }, now: FIXED_NOW });

  // No specSlug/create given, so once the env var is correctly refused there is nothing left to
  // fall through to — the important assertion is that it was NOT simply handed back.
  assert.notStrictEqual(out.path, resurrected);
});

test('a resurrected newestMatch hit (archived, but a live copy exists again) is never reused', () => {
  const main = gitRepo();
  mkDir(main, 'archive', RUN_ID);
  mkDir(main, RUN_ID); // resurrected live copy, matches specSlug 'spec-38'
  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-38', now: FIXED_NOW });

  assert.notStrictEqual(out.path, path.join(main, '.claude-tweaks', 'pipelines', RUN_ID));
});

test('AC4: an unreadable archive/ (not ENOENT) fails OPEN — the writer still creates the directory', () => {
  const main = gitRepo();
  // A plain FILE named `archive` (not a directory) forces fs.statSync('archive/<run-id>') to
  // throw ENOTDIR rather than ENOENT — simulating "archive/ cannot be read" without relying on
  // real filesystem permissions (unreliable across CI/sandboxed environments).
  fs.mkdirSync(path.join(main, '.claude-tweaks', 'pipelines'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude-tweaks', 'pipelines', 'archive'), 'not a directory');

  const out = resolve({ cwd: main, env: {}, specSlug: 'spec-38', create: true, now: FIXED_NOW });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.created, true);
  assert.strictEqual(fs.existsSync(out.path), true);
});

test('AC3 (superseded by #1103 fix-wave-1): iterRunDirsWithState now yields a resurrected run-id whose archive twin has no run-state.json of its own — an incomplete/failed archive, not a completed one', () => {
  const main = gitRepo();
  mkDir(main, 'archive', RUN_ID); // no run-state.json of its own — an incomplete archive, not a completed one
  const resurrected = mkDir(main, RUN_ID);
  fs.writeFileSync(path.join(resurrected, 'run-state.json'), JSON.stringify({ status: 'active' }));
  const other = mkDir(main, '2026-08-01T090000-spec-99');
  fs.writeFileSync(path.join(other, 'run-state.json'), JSON.stringify({ status: 'active' }));

  const dirs = [...iterRunDirsWithState(main)].map((e) => e.dir);
  assert.ok(dirs.includes(resurrected), 'an archive twin with no run-state.json of its own must not permanently hide the live run dir (#1103)');
  assert.ok(dirs.includes(other), 'an unrelated genuinely-active run must still be reported');
});

test('AC3: iterRunDirsWithState still never yields a run-id whose archive twin genuinely reads status: clean', () => {
  const main = gitRepo();
  const archiveTwin = mkDir(main, 'archive', RUN_ID);
  fs.writeFileSync(path.join(archiveTwin, 'run-state.json'), JSON.stringify({ status: 'clean' }));
  const resurrected = mkDir(main, RUN_ID);
  fs.writeFileSync(path.join(resurrected, 'run-state.json'), JSON.stringify({ status: 'active' }));
  const other = mkDir(main, '2026-08-01T090000-spec-99');
  fs.writeFileSync(path.join(other, 'run-state.json'), JSON.stringify({ status: 'active' }));

  const dirs = [...iterRunDirsWithState(main)].map((e) => e.dir);
  assert.ok(!dirs.includes(resurrected), 'a genuinely clean archive twin must still hide the live run dir');
  assert.ok(dirs.includes(other), 'an unrelated genuinely-active run must still be reported');
});

test('AC4 (reader side): an unreadable archive/ fails OPEN — the archived-looking run-id is still reported', () => {
  const main = gitRepo();
  fs.mkdirSync(path.join(main, '.claude-tweaks', 'pipelines'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude-tweaks', 'pipelines', 'archive'), 'not a directory');
  const resurrected = mkDir(main, RUN_ID);
  fs.writeFileSync(path.join(resurrected, 'run-state.json'), JSON.stringify({ status: 'active' }));

  const dirs = [...iterRunDirsWithState(main)].map((e) => e.dir);
  assert.ok(dirs.includes(resurrected), 'an unreadable archive/ must never silently suppress a genuinely reportable run');
});
