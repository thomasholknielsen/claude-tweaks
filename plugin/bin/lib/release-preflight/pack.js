'use strict';
// bin/lib/release-preflight/pack.js — the /claude-tweaks:release Step 1 fact
// pack (#2255): engine, last tag, unreleased commits, proposed version, open
// release PR, CI on the tip, a human-edited release PR, hook presence — one
// {ok, value | error} envelope per field, gathered concurrently, each
// degrading only itself (run-directory-fact-packs). Read-only. Every fs, git
// and gh call goes through `deps`. Reuses bin/lib/release-local's commit
// parser and bump precedence by reference — never a second copy.
const fs = require('fs');
const path = require('path');
const { execFile: execFileCb, execFileSync } = require('child_process');
const { promisify } = require('util');
const { conventionalHistory } = require('../release-local/commits.js');
const { bumpPart } = require('../release-local/bump.js');
const { nextVersion } = require('../release/compose.js');
const { resolvePolicyKeys } = require('../policy-schema.js');
const { wrapProbe, withTimeout } = require('../wrap-up/pack.js');

const PROBE_NAMES = ['engine', 'lastTag', 'unreleased', 'proposedVersion', 'releasePr', 'ciTip', 'openReleasePrConflict', 'hook'];
const PROBE_TIMEOUT_MS = 60000;
const EXEC_OPTS = { maxBuffer: 32 * 1024 * 1024, timeout: 30000 };
const ENGINES = new Set(['pr-first', 'local-merge']);
const HOOK_DISABLED = new Set(['false', 'off', 'none', 'null']);
const RELEASE_TRIGGER_RE = /^\s*release:\s*$/m;
const PUBLISHED_RE = /\bpublished\b/;

function defaultDeps(cwd) {
  const execFileAsync = promisify(execFileCb);
  return {
    git: (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    execFileAsync: async (cmd, args, opts = {}) => (await execFileAsync(cmd, args, { cwd, encoding: 'utf8', ...EXEC_OPTS, ...opts })).stdout,
    readFile: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; } },
    readdir: (p) => { try { return fs.readdirSync(p); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []; throw e; } },
    now: () => Date.now(),
  };
}

// Ruling 5: a bot is any author identity GitHub renders with a [bot] suffix.
function isBotAuthor(a) {
  if (!a) return false;
  return /\[bot\]$/.test(String(a.login || '')) || /\[bot\]$/.test(String(a.name || '')) || /\[bot\]@users\.noreply\.github\.com$/.test(String(a.email || ''));
}

// Ruling 4: release-please's own branch prefix, or its PR title shape — a
// version number after "release " distinguishes it from an unrelated
// "chore: release notes"-style commit message.
function isReleasePr(pr) {
  return /^release-please--/.test(String(pr.headRefName || '')) || /^chore(\([^)]*\))?: release \d/.test(String(pr.title || ''));
}

function policyString(entry) {
  const v = entry && entry.value;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function memo(fn) {
  let p;
  return () => { if (p === undefined) p = Promise.resolve().then(fn); return p; };
}

async function gatherReleasePreflight({ cwd = process.cwd(), only = null, deps: overrides = {} } = {}) {
  const deps = { ...defaultDeps(cwd), ...overrides };
  const limit = Number.isFinite(deps.probeTimeoutMs) ? deps.probeTimeoutMs : PROBE_TIMEOUT_MS;
  const t0 = deps.now();
  const root = deps.git(['rev-parse', '--show-toplevel']).trim();
  const policyRaw = deps.readFile(path.join(root, '.claude-tweaks', 'policy.yml'));
  const policy = resolvePolicyKeys(['integration-model', 'integration-branch', 'release-hook'], { policyRaw, runConfigRaw: null });
  const branch = policyString(policy['integration-branch']) || 'main';
  let tipRef = `refs/heads/${branch}`;
  try { deps.git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]); tipRef = `origin/${branch}`; } catch { /* no remote-tracking ref: read the local branch */ }

  // Ruling 2: the explicit policy value only — a guessed engine is exactly what AC 6 forbids.
  const engineEntry = policy['integration-model'];
  const engine = engineEntry && engineEntry.source === 'policy' && ENGINES.has(engineEntry.value) ? engineEntry.value : null;
  const needEngine = () => { if (!engine) throw new Error('engine unresolved'); return engine; };

  const history = memo(() => conventionalHistory(deps.git, tipRef));
  const releasePr = memo(async () => {
    if (needEngine() === 'local-merge') return 'none';
    const prs = JSON.parse(await deps.execFileAsync('gh', ['pr', 'list', '--state', 'open', '--limit', '50', '--json', 'number,state,mergeable,headRefName,title']));
    const pr = prs.find(isReleasePr);
    return pr ? { number: pr.number, state: pr.state, mergeable: pr.mergeable, headRefName: pr.headRefName, title: pr.title } : 'none';
  });

  const probes = {
    engine: () => { if (!engine) throw new Error('integration-model unresolved'); return engine; },
    lastTag: async () => {
      const { lastTag } = await history();
      if (!lastTag) throw new Error(`no v* tag reachable from ${tipRef}`);
      return { tag: lastTag, version: lastTag.replace(/^v/, ''), tipRef };
    },
    unreleased: async () => {
      const { lastTag, commits } = await history();
      return { since: lastTag, tipRef, commits: commits.map((c) => ({ sha: c.sha, type: c.type, scope: c.scope, breaking: c.breaking, subject: c.subject, description: c.description, unconventional: c.unconventional })) };
    },
    proposedVersion: async () => {
      const { lastTag, commits } = await history();
      const part = bumpPart(commits);
      if (part === 'none') throw new Error(`nothing to release: ${commits.length} commit(s) since ${lastTag || 'the first commit'}, none feat/fix/breaking`);
      let base = lastTag ? lastTag.replace(/^v/, '') : null;
      if (!base) {
        // Ruling 7: the first release computes from the bootstrap-seeded manifest, else 0.0.0.
        const manifest = deps.readFile(path.join(root, '.release-please-manifest.json'));
        const m = manifest && /"\.":\s*"(\d+\.\d+\.\d+)"/.exec(manifest);
        base = m ? m[1] : '0.0.0';
      }
      return { version: nextVersion(base, part), part, base, tipRef };
    },
    releasePr,
    ciTip: async () => {
      if (needEngine() === 'local-merge') return 'n/a';
      const sha = deps.git(['rev-parse', tipRef]).trim();
      const { nameWithOwner } = JSON.parse(await deps.execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner']));
      const runs = JSON.parse(await deps.execFileAsync('gh', ['api', `repos/${nameWithOwner}/commits/${sha}/check-runs`]));
      const counts = { total: runs.total_count || 0, success: 0, failure: 0, pending: 0 };
      for (const r of runs.check_runs || []) {
        if (r.status !== 'completed') counts.pending += 1;
        else if (r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral') counts.success += 1;
        else counts.failure += 1;
      }
      const state = counts.total === 0 ? 'none' : counts.failure ? 'failure' : counts.pending ? 'pending' : 'success';
      return { sha, tipRef, state, ...counts };
    },
    openReleasePrConflict: async () => {
      const pr = await releasePr();
      if (pr === 'none') return false;
      const { commits } = JSON.parse(await deps.execFileAsync('gh', ['pr', 'view', String(pr.number), '--json', 'commits']));
      const last = commits && commits.length ? commits[commits.length - 1] : null;
      if (!last || !last.authors || !last.authors.length) return true;
      return !last.authors.every(isBotAuthor);
    },
    hook: () => {
      if (needEngine() === 'local-merge') {
        const v = policyString(policy['release-hook']);
        return v !== null && !HOOK_DISABLED.has(v.toLowerCase());
      }
      const dir = path.join(root, '.github', 'workflows');
      return deps.readdir(dir).filter((f) => /\.ya?ml$/.test(f)).some((f) => {
        const text = deps.readFile(path.join(dir, f)) || '';
        return RELEASE_TRIGGER_RE.test(text) && PUBLISHED_RE.test(text);
      });
    },
  };

  const names = PROBE_NAMES.filter((n) => !only || only.includes(n));
  const pack = { generatedAt: new Date(t0).toISOString(), branch, tipRef };
  const results = await Promise.all(names.map((n) => wrapProbe(n, withTimeout(probes[n], limit), deps.now)));
  names.forEach((n, i) => { pack[n] = results[i]; });
  pack.durationMs = deps.now() - t0;
  return pack;
}

module.exports = { PROBE_NAMES, defaultDeps, isBotAuthor, isReleasePr, gatherReleasePreflight };
