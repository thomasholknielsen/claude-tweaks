'use strict';
const { execFileSync } = require('child_process');

// Durable cross-firing state for the health skills, backed by a dedicated
// git branch (never merged into main) instead of local gitignored disk —
// local disk doesn't survive a scheduled cloud-routine (CCR) container
// recycling between firings. Contract: skills/_shared/health-state.md.
//
// Impure (execFileSync git/gh calls), matching bin/lib/code-health/scope.js's
// existing precedent — not bin/lib/issues/claims.js's emit-only pattern,
// since reading/writing this branch is mechanical plumbing nobody inspects
// mid-flight, unlike issue claim/release which is a decision-laden,
// audit-visible action meant to be legible in the skill's own bash trail.
// The command runner is injectable so tests substitute a fake one instead
// of touching real network (git fetch/gh api can't run for real in a
// sandboxed unit test the way scope.js's local git log calls can).

const HEALTH_STATE_BRANCH = 'health-state';
const MAX_RUN_HISTORY = 90;
const ESCALATE_AFTER_ATTEMPTS = 3;
const MAX_CAS_ATTEMPTS = 3;
const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // git's well-known empty-tree sha

function statePath(skillName, file) {
  return `${skillName}/${file}`;
}

// Keep the newest maxCount records by runAt, dropping the oldest.
function pruneRuns(runs, maxCount = MAX_RUN_HISTORY) {
  const sorted = [...runs].sort((a, b) => (a.runAt < b.runAt ? -1 : a.runAt > b.runAt ? 1 : 0));
  return sorted.slice(Math.max(0, sorted.length - maxCount));
}

// Upsert by fingerprint: a repeat failure increments attempts and updates
// lastError without disturbing firstFailedAt; a brand-new fingerprint starts
// at attempts:1.
function enqueueRetry(queue, entry, { now = Date.now() } = {}) {
  const idx = queue.findIndex((e) => e.fingerprint === entry.fingerprint);
  if (idx === -1) {
    return [
      ...queue,
      {
        fingerprint: entry.fingerprint,
        payload: entry.payload,
        firstFailedAt: new Date(now).toISOString(),
        attempts: 1,
        lastError: entry.lastError || null,
      },
    ];
  }
  const next = [...queue];
  next[idx] = { ...next[idx], attempts: next[idx].attempts + 1, lastError: entry.lastError || next[idx].lastError };
  return next;
}

function dequeueRetry(queue, fingerprint) {
  return queue.filter((e) => e.fingerprint !== fingerprint);
}

function shouldEscalate(entry) {
  return !!entry && entry.attempts >= ESCALATE_AFTER_ATTEMPTS;
}

function defaultRun(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function createDurableState(skillName, { run = defaultRun, includeRemembered = false } = {}) {
  function showFile(root, relPath, fallback) {
    try {
      const out = run('git', ['-C', root, 'show', `origin/${HEALTH_STATE_BRANCH}:${relPath}`]);
      return JSON.parse(out);
    } catch {
      return fallback;
    }
  }

  function currentCommitSha(root) {
    try {
      return run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}`]).trim();
    } catch {
      return null;
    }
  }

  function currentTreeSha(root) {
    try {
      return run('git', ['-C', root, 'rev-parse', `origin/${HEALTH_STATE_BRANCH}^{tree}`]).trim();
    } catch {
      return null;
    }
  }

  // Reads never throw: a missing branch/file degrades to the empty default,
  // matching cache.js's existing "corrupt/missing JSON -> {}" convention.
  // `remembered` is only ever present when this skill opted in via
  // includeRemembered — a skill that didn't must never see the key at all,
  // so harness-health/journey-health can't accidentally pick up a spurious
  // remembered.json (see buildFiles below, which gates on the same flag).
  function readState(root) {
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
    } catch {
      return includeRemembered
        ? { cursors: {}, remembered: {}, retryQueue: [], runs: [] }
        : { cursors: {}, retryQueue: [], runs: [] };
    }
    const state = {
      cursors: showFile(root, statePath(skillName, 'cursors.json'), {}),
      retryQueue: showFile(root, statePath(skillName, 'retry-queue.json'), []),
      runs: showFile(root, statePath(skillName, 'runs.json'), []),
    };
    if (includeRemembered) state.remembered = showFile(root, statePath(skillName, 'remembered.json'), {});
    return state;
  }

  function createBlob(root, content) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/blobs', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ content, encoding: 'utf-8' }),
    }).trim();
  }

  function createTree(root, baseTreeSha, entries) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/trees', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    }).trim();
  }

  function createCommit(root, treeSha, parentSha, message) {
    return run('gh', ['api', 'repos/{owner}/{repo}/git/commits', '--input', '-', '-q', '.sha'], {
      cwd: root,
      input: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] }),
    }).trim();
  }

  // Non-force PATCH — GitHub enforces fast-forward-only, which IS the
  // compare-and-swap: rejected (throws) if the branch moved since parentSha
  // was read.
  function updateRef(root, commitSha) {
    run('gh', ['api', '-X', 'PATCH', `repos/{owner}/{repo}/git/refs/heads/${HEALTH_STATE_BRANCH}`, '--input', '-'], {
      cwd: root,
      input: JSON.stringify({ sha: commitSha, force: false }),
    });
  }

  function createRef(root, commitSha) {
    try {
      run('gh', ['api', 'repos/{owner}/{repo}/git/refs', '--input', '-'], {
        cwd: root,
        input: JSON.stringify({ ref: `refs/heads/${HEALTH_STATE_BRANCH}`, sha: commitSha }),
      });
    } catch (err) {
      if (!/422/.test(String(err.message))) throw err; // 422 = a concurrent firing already created it
    }
  }

  function ensureBranch(root) {
    try {
      run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
      if (currentCommitSha(root)) return; // already exists
    } catch {
      // fetch failing at all (not just "ref not found") also means: try to bootstrap
    }
    const commitSha = createCommit(root, EMPTY_TREE_SHA, null, 'health-state: bootstrap');
    createRef(root, commitSha);
  }

  function buildFiles(next) {
    const files = [
      { path: statePath(skillName, 'cursors.json'), content: JSON.stringify(next.cursors, null, 2) },
      { path: statePath(skillName, 'retry-queue.json'), content: JSON.stringify(next.retryQueue, null, 2) },
      { path: statePath(skillName, 'runs.json'), content: JSON.stringify(pruneRuns(next.runs), null, 2) },
    ];
    // Gated on the skill-level includeRemembered flag, NOT on truthiness of
    // next.remembered — an empty {} is truthy, so inferring from data shape
    // would write a spurious remembered.json for every skill (harness-health,
    // journey-health included) the first time any mutator merely spreads
    // ...current without deleting the key. includeRemembered is decided once,
    // at createDurableState call time, precisely to rule that out.
    if (includeRemembered) {
      files.push({ path: statePath(skillName, 'remembered.json'), content: JSON.stringify(next.remembered || {}, null, 2) });
    }
    return files;
  }

  function writeState(root, mutatorFn) {
    ensureBranch(root);
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      try {
        run('git', ['-C', root, 'fetch', 'origin', HEALTH_STATE_BRANCH]);
        const parentSha = currentCommitSha(root);
        const baseTreeSha = currentTreeSha(root);
        const current = readState(root);
        const next = mutatorFn(current);
        const files = buildFiles(next);
        const entries = files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          sha: createBlob(root, f.content),
        }));
        const treeSha = createTree(root, baseTreeSha, entries);
        const commitSha = createCommit(root, treeSha, parentSha, `health-state: ${skillName} update`);
        updateRef(root, commitSha);
        return { ok: true };
      } catch (err) {
        lastError = err;
      }
    }
    return { ok: false, error: lastError && lastError.message };
  }

  return { readState, writeState };
}

module.exports = {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
  createDurableState,
};
