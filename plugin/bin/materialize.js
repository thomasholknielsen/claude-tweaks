#!/usr/bin/env node
// bin/materialize.js — record-to-build-time-file materialization in one command.
//   node bin/materialize.js <n> --run-dir <dir> [--repo owner/name] [--ceremony fast-lane|standard] [--multi-record-slug <n>] [--help]
// Implements skills/flow/materialize.md's Resolution + Materialization hard
// gate + header composition + write, for `work-backend: github-issues`
// records — the CLI both `/flow` and `/build` invoke instead of hand-
// composing the header inline every run. `work-backend: local-files` is not
// yet wired into this CLI (its own read path differs enough — local-store.js
// vs. `gh issue view` — to warrant its own follow-up rather than a half-done
// branch here); that driver still uses the skill's own inline read.
// Prints one JSON envelope on success. Exit 0 on success; 1 when the
// record's own body fails the shape gate (points at /claude-tweaks:specify,
// same as the skill does); 2 on a malformed invocation, an unanchored
// --run-dir (#790/[IL-127] — a worktree-relative shadow, or a path with no
// determinable git repository root), an unresolved record, or when `gh` is
// absent.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseRecordFacets, extractFingerprint, parseDependencies } = require('./lib/issues/record');
const { shapeGate, liftMetadata, composeHeader, composeFile } = require('./lib/issues/materialize-format');
const wtDetect = require('./lib/hooks/worktree-detect');

const USAGE = 'usage: materialize.js <n> --run-dir <dir> [--repo owner/name] [--ceremony fast-lane|standard] [--multi-record-slug <n>] [--help]\n';

const isPos = (n) => Number.isInteger(n) && n > 0;

function parseArgs(argv) {
  const opts = { n: null, runDir: null, repo: null, ceremony: null, multiRecordSlug: null, help: false };
  if (argv[0] === '--help' || argv[0] === '-h') { opts.help = true; return opts; }
  if (argv[0] === undefined || argv[0].startsWith('--')) return { error: 'missing <n> argument' };
  opts.n = Number(argv[0]);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--run-dir') opts.runDir = next();
    else if (a === '--repo') opts.repo = next();
    else if (a === '--ceremony') opts.ceremony = next();
    else if (a === '--multi-record-slug') opts.multiRecordSlug = next();
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function parseRepo(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

const realDeps = {
  ghView: (owner, repo, n) => execFileSync('gh', ['issue', 'view', String(n), '--repo', `${owner}/${repo}`, '--json', 'number,title,body,labels,url'], { encoding: 'utf8' }),
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
  remoteUrl: () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }),
  cwd: () => process.cwd(),
  mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
  isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
  mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
  writeFile: (file, content) => fs.writeFileSync(file, content),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// argv -> exit code. All I/O through deps so tests never touch gh, git, or the filesystem.
function run(argv, deps = realDeps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }
  if (!isPos(opts.n)) { deps.stderr('malformed <n> — must be a positive integer\n' + USAGE); return 2; }
  if (!opts.runDir) { deps.stderr('missing required --run-dir\n' + USAGE); return 2; }
  {
    // #790/[IL-127]: reject an unanchored --run-dir before any gh/git/fs
    // work. cwd/mainRoot are read through deps (not process.cwd()/wtDetect
    // directly) so this guard honors the "all I/O through deps" seam this
    // file's own header comment promises.
    const cwd = deps.cwd();
    const mainRoot = deps.mainRoot(cwd);
    if (!mainRoot) {
      // Distinct from the anchoring-rejection case below: no git repo could
      // be determined at all (not a repo, an unreadable ancestor, an
      // unparseable .git file) — misdiagnosing this as a worktree-shadow
      // rejection would send a reader hunting for the wrong problem.
      deps.stderr(`materialize.js: ${wtDetect.unanchoredRunDirNoRepoMessage(cwd)}\n`);
      return 2;
    }
    if (!deps.isAnchored(path.resolve(cwd, opts.runDir), mainRoot)) {
      deps.stderr(`materialize.js: ${wtDetect.unanchoredRunDirShadowMessage(opts.runDir, mainRoot)}\n`);
      return 2;
    }
  }
  if (opts.ceremony && opts.ceremony !== 'fast-lane' && opts.ceremony !== 'standard') { deps.stderr('--ceremony must be fast-lane or standard\n' + USAGE); return 2; }
  if (!deps.ghAvailable()) { deps.stderr('materialize.js: `gh` is required (work-backend: github-issues)\n'); return 2; }

  let remote = null;
  if (!opts.repo) { try { remote = deps.remoteUrl(); } catch { remote = null; } }
  const repoSpec = opts.repo ? parseRepo(`github.com/${opts.repo}`) : parseRepo(remote);
  if (!repoSpec) { deps.stderr('materialize.js: could not resolve owner/repo — pass --repo owner/name\n'); return 2; }
  const { owner, repo } = repoSpec;

  let record;
  try {
    record = JSON.parse(deps.ghView(owner, repo, opts.n));
  } catch (err) {
    deps.stderr(`materialize.js: Record #${opts.n} could not be resolved (\`gh issue view ${opts.n}\` failed — check the issue exists in this repo). ${err && err.message ? err.message : ''}\n`);
    return 2;
  }

  const gate = shapeGate(record.body);
  if (!gate.ok) {
    deps.stderr(`materialize.js: Record #${opts.n} is not spec-shaped (${gate.missing.join(', ')}) — run \`/claude-tweaks:specify #${opts.n}\` first.\n`);
    return 1;
  }

  const facets = parseRecordFacets(record.labels);
  const labelNames = (record.labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
  const ceremony = facets.ceremony || opts.ceremony;
  if (!ceremony) {
    deps.stderr(`materialize.js: Record #${opts.n} carries no ceremony:* label — pass --ceremony fast-lane|standard (the caller resolves this via assess-agent-autonomy ceremony-check first).\n`);
    return 2;
  }
  const meta = liftMetadata(record.body);
  const header = composeHeader({
    record: opts.n,
    origin: facets.origin || 'human',
    risk: facets.risk,
    size: facets.size,
    ceremony,
    grants: facets.grants,
    fingerprint: extractFingerprint(record.body),
    blockedBy: parseDependencies(record.body),
    surface: meta.surface,
    designIntent: meta.designIntent,
    designSeed: meta.designSeed,
    parkedAtShaping: labelNames.includes('parked'),
  });
  const fileContent = composeFile({ header, n: opts.n, title: record.title, body: record.body });

  const workDir = opts.multiRecordSlug
    ? path.join(opts.runDir, `spec-${opts.multiRecordSlug}`, 'work')
    : path.join(opts.runDir, 'work');
  const outFile = path.join(workDir, `${opts.n}-spec.md`);
  deps.mkdirp(workDir);
  deps.writeFile(outFile, fileContent);

  deps.stdout(JSON.stringify({ record: opts.n, file: outFile, ceremonySource: facets.ceremony ? 'label' : 'override', surface: meta.surface || null }, null, 2) + '\n');
  return 0;
}

module.exports = { run, parseArgs, parseRepo };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
