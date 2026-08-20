// tests/hooks-context.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ctx = require('../plugin/bin/lib/hooks/context');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hooks-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRun(project, name, state) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

test('parseInput returns {} on garbage and non-objects', () => {
  assert.deepStrictEqual(ctx.parseInput('not json'), {});
  assert.deepStrictEqual(ctx.parseInput('42'), {});
  assert.deepStrictEqual(ctx.parseInput(''), {});
  assert.deepStrictEqual(ctx.parseInput('[1,2,3]'), {});
  assert.deepStrictEqual(ctx.parseInput('{"a":1}'), { a: 1 });
});

test('resolveRunDir prefers PIPELINE_RUN_DIR when it exists on disk', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' });
  assert.strictEqual(ctx.resolveRunDir(project, { PIPELINE_RUN_DIR: run }), run);
  assert.strictEqual(ctx.resolveRunDir(project, { PIPELINE_RUN_DIR: '/nope' }), run);
});

test('resolveRunDir picks newest non-terminal, skips clean runs', () => {
  const project = tmpProject();
  const oldRun = mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' });
  const cleanRun = mkRun(project, '2026-07-02T090000-spec-2', { status: 'clean' });
  assert.strictEqual(ctx.resolveRunDir(project, {}), oldRun);
  assert.ok(cleanRun); // silences unused warning; clean run must NOT be returned
});

test('resolveRunDir returns null with no pipelines dir', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  assert.strictEqual(ctx.resolveRunDir(bare, {}), null);
});

test('resolveRunDir falls through to the scan when PIPELINE_RUN_DIR points at a file, not a directory', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' });
  const notADir = path.join(project, 'not-a-dir.txt');
  fs.writeFileSync(notADir, 'x');
  assert.strictEqual(ctx.resolveRunDir(project, { PIPELINE_RUN_DIR: notADir }), run);
});

test('listRunDirs returns non-terminal newest first', () => {
  const project = tmpProject();
  const a = mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const b = mkRun(project, '2026-07-02T090000-spec-2');
  mkRun(project, '2026-07-03T090000-spec-3', { status: 'clean' });
  assert.deepStrictEqual(ctx.listRunDirs(project), [b, a]);
});

test('listRunDirs excludes the archive/ sibling (and other non-run-id-shaped dirs); resolveRunDir never resolves it', () => {
  const project = tmpProject();
  const live = mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' });
  mkRun(project, 'archive'); // wrap-up archival destination; sorts AFTER ISO names lexically
  assert.deepStrictEqual(ctx.listRunDirs(project), [live]);
  assert.strictEqual(ctx.resolveRunDir(project, {}), live);
});

test('listRunDirs and resolveRunDir return empty/null when only archive/ exists', () => {
  const project = tmpProject();
  mkRun(project, 'archive');
  assert.deepStrictEqual(ctx.listRunDirs(project), []);
  assert.strictEqual(ctx.resolveRunDir(project, {}), null);
});

// #848: a dash-less mint (`date -u +%Y%m%dT%H%M%S` instead of the canonical
// `+%Y-%m-%dT%H%M%S`) is invisible to RUN_ID_RE — findNonCanonicalRunDirs is
// the surfacing half, so a caller (reconcile) can report it instead of
// silently omitting the run from every enumeration forever.
test('findNonCanonicalRunDirs finds a dash-less run-dir name', () => {
  const project = tmpProject();
  mkRun(project, '20260817T173343-spec-764');
  assert.deepStrictEqual(ctx.findNonCanonicalRunDirs(project), ['20260817T173343-spec-764']);
});

test('findNonCanonicalRunDirs ignores canonical run-dirs, archive/, and unrelated directories', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' });
  mkRun(project, 'archive');
  fs.mkdirSync(path.join(project, '.claude-tweaks', 'pipelines', 'not-a-run-dir'), { recursive: true });
  assert.deepStrictEqual(ctx.findNonCanonicalRunDirs(project), []);
});

test('findNonCanonicalRunDirs returns [] when the pipelines dir does not exist', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  assert.deepStrictEqual(ctx.findNonCanonicalRunDirs(bare), []);
});

test('listRunDirsWithState returns each non-terminal dir paired with its already-read state', () => {
  const project = tmpProject();
  const a = mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted', worktree: '/wt/a' });
  const b = mkRun(project, '2026-07-02T090000-spec-2'); // no run-state.json at all
  mkRun(project, '2026-07-03T090000-spec-3', { status: 'clean' });
  assert.deepStrictEqual(ctx.listRunDirsWithState(project), [
    { dir: b, state: null },
    { dir: a, state: { status: 'interrupted', worktree: '/wt/a' } },
  ]);
});

// #593: defense in depth — a stray top-level dir whose archive twin already
// carries a terminal run-state.json (a filesystem-only, non-git-aware
// archival move, or a tracked work/ file resurrected by `git checkout`) must
// not be reported as unfinished/`status: unknown` forever. Checked at the
// shared iterator so every caller (resolveRun's fallback scan, session-
// start's report, the reconciler) benefits, not just session-start.js.
test('iterRunDirsWithState: stray dir with no local run-state.json is skipped when its archive/{name}/ twin is terminal', () => {
  const project = tmpProject();
  const runId = '2026-07-01T090000-spec-1';
  const stray = mkRun(project, runId); // no run-state.json — readRunState returns null
  const archiveTwin = mkRun(project, path.join('archive', runId), { status: 'clean' });
  assert.deepStrictEqual(ctx.listRunDirs(project), []);
  assert.strictEqual(ctx.resolveRunDir(project, {}), null);
  assert.ok(fs.existsSync(stray));
  assert.ok(fs.existsSync(archiveTwin));
});

test('iterRunDirsWithState: stray dir with a stale non-terminal run-state.json is still skipped when its archive twin is terminal', () => {
  const project = tmpProject();
  const runId = '2026-07-01T090000-spec-1';
  mkRun(project, runId, { status: 'active' }); // resurrected/stale local state
  mkRun(project, path.join('archive', runId), { status: 'clean' });
  assert.deepStrictEqual(ctx.listRunDirs(project), []);
});

test('iterRunDirsWithState: stray dir is still yielded when it has no archive twin at all', () => {
  const project = tmpProject();
  const genuinelyOpen = mkRun(project, '2026-07-01T090000-spec-1', { status: 'active' }); // no archive twin at all
  assert.deepStrictEqual(ctx.listRunDirs(project), [genuinelyOpen]);
});

// #208: archived is terminal regardless of the archive twin's own run-state —
// existence of archive/{run-id}/ alone is authoritative, since that twin's
// status field is exactly the untrustworthy resurrected data #208 fixes
// (a later hook write can corrupt or resurrect it after the real archival).
// Supersedes the pre-#208 assumption that a non-terminal archive twin meant
// the archival hadn't "really" finished — AC3 states this explicitly.
test('iterRunDirsWithState: #208 — a run-id present under archive/ is skipped even when that twin\'s own state is non-terminal', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-02T090000-spec-2'); // stray active-side dir, no local run-state.json
  mkRun(project, path.join('archive', '2026-07-02T090000-spec-2'), { status: 'active' }); // resurrected/corrupted twin state
  assert.deepStrictEqual(ctx.listRunDirs(project), []);
});

test('listRunDirs is derived from listRunDirsWithState (same dirs, same order)', () => {
  const project = tmpProject();
  const a = mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const b = mkRun(project, '2026-07-02T090000-spec-2');
  assert.deepStrictEqual(ctx.listRunDirs(project), ctx.listRunDirsWithState(project).map((r) => r.dir));
  assert.deepStrictEqual(ctx.listRunDirs(project), [b, a]);
});

test('findRunsByWorktreePath returns every non-terminal run assigned to the worktree, newest first', () => {
  const project = tmpProject();
  const older = mkRun(project, '2026-07-01T090000-record-500-adhoc-standalone', { status: 'active', worktree: '/tmp/wt-a' });
  const newer = mkRun(project, '2026-07-02T090000-record-500-adhoc-standalone', { status: 'active', worktree: '/tmp/wt-a' });
  mkRun(project, '2026-07-03T090000-other-adhoc-standalone', { status: 'active', worktree: '/tmp/wt-b' });
  const result = ctx.findRunsByWorktreePath(project, '/tmp/wt-a');
  assert.deepStrictEqual(result.map((r) => r.runDir), [newer, older]);
});

test('findRunsByWorktreePath excludes excludeDir (the caller\'s own primary run dir)', () => {
  const project = tmpProject();
  const primary = mkRun(project, '2026-07-01T090000-spec-500', { status: 'active', worktree: '/tmp/wt-a' });
  const adhoc = mkRun(project, '2026-07-02T060000-adhoc-standalone', { status: 'active', worktree: '/tmp/wt-a' });
  const result = ctx.findRunsByWorktreePath(project, '/tmp/wt-a', primary);
  assert.deepStrictEqual(result.map((r) => r.runDir), [adhoc]);
});

test('findRunsByWorktreePath returns [] when nothing matches or the path is empty', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-record-1-adhoc-standalone', { status: 'active', worktree: '/tmp/wt-a' });
  assert.deepStrictEqual(ctx.findRunsByWorktreePath(project, '/tmp/no-match'), []);
  assert.deepStrictEqual(ctx.findRunsByWorktreePath(project, ''), []);
  assert.deepStrictEqual(ctx.findRunsByWorktreePath(project, null), []);
});

test('writeRunState merges, stamps updatedAt; readRunState round-trips', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.writeRunState(run, { status: 'active', worktree: '/tmp/wt' });
  const next = ctx.writeRunState(run, { status: 'interrupted' });
  assert.strictEqual(next.status, 'interrupted');
  assert.strictEqual(next.worktree, '/tmp/wt');
  assert.ok(next.updatedAt);
  assert.strictEqual(ctx.readRunState(run).status, 'interrupted');
});

test('appendEvent writes one JSON line per call, never throws on bad dir', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.appendEvent(run, 'commit', { hash: 'abc123' });
  ctx.appendEvent(run, 'session-end', {});
  const lines = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.strictEqual(first.type, 'commit');
  assert.strictEqual(first.hash, 'abc123');
  assert.ok(first.ts);
  assert.doesNotThrow(() => ctx.appendEvent('/nonexistent/run', 'x', {}));
});

test('appendEvent: derived ts/type always win over same-named keys in caller-supplied data (finding regression)', () => {
  // CLAUDE.md: "Don't spread parsed external JSON after derived/trusted
  // fields" — spreading `data` AFTER `ts`/`type` would let a caller-supplied
  // object silently override this event's own classification/timestamp.
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.appendEvent(run, 'wd-deny', { type: 'spoofed-type', ts: 'spoofed-ts', reason: 'real-reason' });
  const line = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim();
  const entry = JSON.parse(line);
  assert.strictEqual(entry.type, 'wd-deny', 'the derived type must win over a same-named key in data');
  assert.notStrictEqual(entry.ts, 'spoofed-ts', 'the derived ts must win over a same-named key in data');
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/, 'ts must be a real ISO timestamp, not the spoofed value');
  assert.strictEqual(entry.reason, 'real-reason', 'non-colliding data fields are still preserved');
});

test('scanWrapupEvents: missing events.jsonl returns null', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090000-spec-1', { status: 'active' });
  assert.strictEqual(ctx.scanWrapupEvents(run), null);
});

test('scanWrapupEvents: unreadable dir returns null', () => {
  assert.strictEqual(ctx.scanWrapupEvents('/nonexistent/run'), null);
});

test('scanWrapupEvents: no skill_invoked events returns any:false, wrapup:false', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090001-spec-1', { status: 'active' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), JSON.stringify({ type: 'other', ts: '2026-08-01T09:00:00Z' }) + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: false, wrapup: false });
});

test('scanWrapupEvents: skill_invoked for a different skill returns any:true, wrapup:false', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090002-spec-1', { status: 'active' });
  const line = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:build', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), line + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: false });
});

test('scanWrapupEvents: skill_invoked for claude-tweaks:wrap-up returns any:true, wrapup:true', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090003-spec-1', { status: 'active' });
  const line = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:wrap-up', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), line + '\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: true });
});

test('scanWrapupEvents: malformed JSON lines are skipped, not fatal', () => {
  const project = tmpProject();
  const run = mkRun(project, '2026-08-20T090004-spec-1', { status: 'active' });
  const wrapupLine = JSON.stringify({ type: 'skill_invoked', skill: 'claude-tweaks:wrap-up', ts: '2026-08-01T09:00:00Z' });
  fs.writeFileSync(path.join(run, 'events.jsonl'), 'not json\n' + wrapupLine + '\n\n');
  assert.deepStrictEqual(ctx.scanWrapupEvents(run), { any: true, wrapup: true });
});

test('writeRunState serializes concurrent writers under an effectively-unbounded lock budget — no lost updates under real cross-process concurrency (finding regression)', async () => {
  // Reproduces the exact shape the finding describes: many real OS
  // processes racing a read-modify-write against the same run-state.json,
  // each patching its OWN field. Without a lock, a writer's stale-snapshot
  // write (taken before another writer's update landed) silently reverts
  // that other writer's field when it overwrites the whole file.
  //
  // Contract (#254): production's lock is best-effort/fail-open by design —
  // LOCK_WAIT_MS caps total wait, after which a writer proceeds unlocked
  // rather than hang a hook. That default budget can race under contention
  // (observed on a CI runner: a worker exhausted the 500ms budget and lost a
  // field). This test pins CLAUDE_TWEAKS_LOCK_WAIT_MS to a large ceiling to
  // remove that race and test the LOCK MECHANISM itself deterministically —
  // it is a ceiling on lock-wait, not a sleep, and no assertion below
  // depends on its value (IL-62). The production default's fail-open
  // behavior under contention is covered separately below.
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.writeRunState(run, { seed: true });

  const WORKERS = 8;
  const ITERATIONS = 40;
  const contextPath = path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'hooks', 'context.js');
  const workerScript = (i) => `
    const ctx = require(${JSON.stringify(contextPath)});
    for (let n = 0; n < ${ITERATIONS}; n++) {
      ctx.writeRunState(${JSON.stringify(run)}, { w${i}: n + 1 });
    }
  `;

  const procs = [];
  for (let i = 0; i < WORKERS; i++) {
    procs.push(new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['-e', workerScript(i)], {
        env: { ...process.env, CLAUDE_TWEAKS_LOCK_WAIT_MS: '60000' },
      });
      let stderr = '';
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}: ${stderr}`))));
      p.on('error', reject);
    }));
  }
  await Promise.all(procs);

  const final = ctx.readRunState(run);
  assert.strictEqual(final.seed, true, 'the pre-existing seed field must survive every concurrent writer');
  for (let i = 0; i < WORKERS; i++) {
    assert.strictEqual(final[`w${i}`], ITERATIONS,
      `worker ${i}'s field must reflect its LAST write, not be lost to a concurrent writer's stale snapshot`);
  }
});

test('writeRunState under the fail-open path (budget=0) — every worker still exits cleanly and the file never tears', async () => {
  // Contract (#254): production is best-effort/fail-open — a writer that
  // cannot acquire the lock in time proceeds unlocked rather than hang a
  // hook. Pinning CLAUDE_TWEAKS_LOCK_WAIT_MS to 0 forces every writer down
  // that unlocked path (deterministically, not by chance), reproducing the
  // documented posture. Under that posture, individual field updates CAN be
  // lost to a racing stale-snapshot write — that's the fail-open trade-off,
  // not a defect — so this test does NOT assert every field's final value
  // (nondeterministic). What the atomic temp-file + rename write in
  // writeRunState DOES guarantee even fully unlocked: no worker ever
  // crashes, and the file is never left torn/partially-written — a reader
  // can always parse it.
  const project = tmpProject();
  const run = mkRun(project, '2026-07-01T090000-spec-1');
  ctx.writeRunState(run, { seed: true });

  const WORKERS = 8;
  const ITERATIONS = 40;
  const contextPath = path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'hooks', 'context.js');
  const workerScript = (i) => `
    const ctx = require(${JSON.stringify(contextPath)});
    for (let n = 0; n < ${ITERATIONS}; n++) {
      ctx.writeRunState(${JSON.stringify(run)}, { w${i}: n + 1 });
    }
  `;

  const procs = [];
  for (let i = 0; i < WORKERS; i++) {
    procs.push(new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['-e', workerScript(i)], {
        env: { ...process.env, CLAUDE_TWEAKS_LOCK_WAIT_MS: '0' },
      });
      let stderr = '';
      p.stderr.on('data', (d) => { stderr += d; });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} exited ${code}: ${stderr}`))));
      p.on('error', reject);
    }));
  }
  await Promise.all(procs);

  const raw = fs.readFileSync(path.join(run, 'run-state.json'), 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw), 'run-state.json must always be valid JSON, even under a fully unlocked race');
});
