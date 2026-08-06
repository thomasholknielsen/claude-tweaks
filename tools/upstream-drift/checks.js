'use strict';

// Three deterministic checks against the upstream-drift manifest
// (tools/upstream-drift/manifest.yml): is the artifact installed at the
// pinned version, do this repo's cited assertions about upstream source
// still hold, and do the recorded fixture replays still behave as recorded.
//
// EVERY FUNCTION HERE RETURNS STRUCTURED DATA AND NEVER PRINTS. Rendering
// and issue-filing are a later, separate module's job — mixing them in here
// would make this module untestable without capturing stdout, and would
// couple a pure "what is true" question to a presentation decision.
//
// Version resolution always reads the artifact itself (a binary's own
// `--version` output, or a candidate's own plugin.json `version` field) —
// never install metadata, a catalog, or gitCommitSha ([IL-89]).

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

// ─── default probe primitives (overridable via options) ────────────────────

// Runs a shell command string (as a human would type it — the manifest's
// `run`/`root` fields are full command lines, e.g. "npx --no-install
// impeccable --version") and returns trimmed stdout, or null for any of:
// the shell itself failing to spawn, a non-zero exit, or empty output. Never
// throws — an absent binary is an ordinary, expected outcome for this repo's
// dependencies (agent-browser, the Impeccable CLI, etc. are all optional).
function defaultRunCommand(cmd) {
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (result.error) return null;
  if (result.status !== 0) return null;
  const out = (result.stdout || '').trim();
  return out || null;
}

function defaultReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Node 18 has no stable built-in glob, and this repo takes no new
// dependency to get one. The only shape ever needed here is a literal path
// with `*` standing in for exactly one path segment (see manifest.yml's
// `~/.claude/plugins/cache/*/impeccable/*/.claude-plugin/plugin.json`), so a
// small readdirSync recursion covers it without pulling in a glob library.
function expandGlobSegments(baseDir, segments) {
  if (segments.length === 0) return [baseDir];
  const [seg, ...rest] = segments;
  if (seg === '*') {
    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => expandGlobSegments(path.join(baseDir, entry.name), rest));
  }
  const candidate = path.join(baseDir, seg);
  if (!fs.existsSync(candidate)) return [];
  return rest.length === 0 ? [candidate] : expandGlobSegments(candidate, rest);
}

function expandGlob(globPattern) {
  const pattern = globPattern.startsWith('~') ? path.join(os.homedir(), globPattern.slice(1)) : globPattern;
  const baseDir = path.isAbsolute(pattern) ? path.parse(pattern).root : '.';
  return expandGlobSegments(baseDir, pattern.split('/').filter(Boolean));
}

// Every plugin-cache-glob candidate paired with the version its OWN
// plugin.json reports — never the directory name a candidate happens to sit
// under. Directory names are not a reliable source of the version; only the
// file's own `version` field is (a stale or mislabeled cache directory is
// exactly the kind of drift this tool exists to catch, not reproduce).
function resolveGlobCandidates(entry, options) {
  const probe = entry['installed-probe'] || {};
  if (probe.type !== 'plugin-cache-glob' || !probe.glob) return [];
  const readJson = options.readJson || defaultReadJson;
  const candidates = [];
  for (const candidatePath of expandGlob(probe.glob)) {
    const parsed = readJson(candidatePath);
    if (parsed && typeof parsed.version === 'string' && parsed.version) {
      candidates.push({ path: candidatePath, version: parsed.version });
    }
  }
  return candidates;
}

// Where checkAssertions should look for contract-paths / upstream-path
// values. `options.root` always wins (tests use this to bypass real probes
// entirely). Otherwise derived from the same probe the version check uses:
// a `command` probe joins `root`'s own output with `root-suffix`; a
// `plugin-cache-glob` probe resolves to the directory that CONTAINS the
// `.claude-plugin` directory of whichever candidate's version equals
// `pinned` — i.e. the plugin's own source root, two path segments up from
// its plugin.json.
function resolveRoot(entry, options) {
  if (options.root) return options.root;
  const probe = entry['installed-probe'] || {};
  const runCommand = options.runCommand || defaultRunCommand;
  if (probe.type === 'command') {
    if (!probe.root) return null;
    const rootOut = runCommand(probe.root);
    if (!rootOut) return null;
    const suffix = probe['root-suffix'] || '';
    return suffix ? path.join(rootOut, suffix) : rootOut;
  }
  if (probe.type === 'plugin-cache-glob') {
    const match = resolveGlobCandidates(entry, options).find((c) => c.version === entry.pinned);
    return match ? path.dirname(path.dirname(match.path)) : null;
  }
  return null;
}

// ─── checkVersion ───────────────────────────────────────────────────────────

// `installed` is always an array: a plugin-cache-glob probe can legitimately
// resolve several installed versions side by side (two cached copies on one
// machine is a real, observed state), so this never collapses to a single
// value. `absent` (no artifact found at all) and `breach` (an artifact IS
// present, but none of its version(s) equal `pinned`) are kept distinct on
// purpose — absent is not this repo's problem, a wrong-version install is a
// contract breach, and collapsing the two would misreport which is which.
function checkVersion(entry, options = {}) {
  const { name, pinned } = entry;
  const probe = entry['installed-probe'] || {};
  const runCommand = options.runCommand || defaultRunCommand;

  let installed = [];
  if (probe.type === 'command' && probe.run) {
    const version = runCommand(probe.run);
    if (version) installed = [version];
  } else if (probe.type === 'plugin-cache-glob') {
    installed = resolveGlobCandidates(entry, options).map((c) => c.version);
  }

  const base = { check: 'version', name, installed, pinned };
  if (installed.length === 0) {
    return { ...base, status: 'absent', detail: `${name}: not installed — probe found no artifact` };
  }
  const found = `installed version(s) [${installed.join(', ')}]`;
  if (installed.includes(pinned)) {
    return { ...base, status: 'ok', detail: `${name}: ${found} include pinned ${pinned}` };
  }
  return { ...base, status: 'breach', detail: `${name}: ${found} do not include pinned ${pinned}` };
}

// ─── checkAssertions ────────────────────────────────────────────────────────

// One result per manifest assertion, matched by LITERAL substring
// (String.prototype.includes) — never a regex. A cited literal such as
// Impeccable's own `polish [target]` help text contains regex metacharacters;
// treating it as a pattern would either match the wrong thing or throw.
function checkAssertions(entry, options = {}) {
  const { name } = entry;
  const assertions = entry.assertions || [];
  const root = resolveRoot(entry, options);

  if (root === null) {
    // An unresolvable root means the artifact is absent, not that its
    // assertions failed. Reporting these as failures would manufacture a
    // finding this repo has no evidence for — checkVersion already owns
    // reporting "absent".
    return {
      check: 'assertions',
      name,
      status: 'skipped',
      results: [],
      detail: `${name}: could not resolve an installed root — skipping assertion checks`,
    };
  }

  const results = assertions.map((assertion) => {
    const upstreamPath = assertion['upstream-path'];
    const mustMatch = assertion['must-match'];
    const fullPath = path.join(root, upstreamPath);
    const base = { file: assertion.file, claims: assertion.claims, upstreamPath };

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      const reason = err.code === 'ENOENT' ? 'does not exist' : `could not be read: ${err.message}`;
      return { ...base, status: 'missing-file', detail: `${fullPath} ${reason}` };
    }

    if (!content.includes(mustMatch)) {
      return { ...base, status: 'unmatched', detail: `${fullPath} no longer contains "${mustMatch}"` };
    }
    return { ...base, status: 'ok', detail: `${fullPath} still contains "${mustMatch}"` };
  });

  const status = results.every((r) => r.status === 'ok') ? 'ok' : 'drift';
  return { check: 'assertions', name, status, results };
}

// ─── replayFixtures ─────────────────────────────────────────────────────────

function defaultRunFixture(cmd, cwd) {
  return spawnSync(cmd, { shell: true, cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function checkOneFixture(fixture, cwd, runFixture) {
  const expect = fixture.expect || {};
  const result = runFixture(fixture.run, cwd);
  // The two streams are kept as separate keys and are never concatenated —
  // a payload that moved between them is the drift this replay exists to
  // catch, and merging them would reproduce exactly that blindness.
  const streams = { stdout: result.stdout || '', stderr: result.stderr || '' };
  const observed = { exit: result.status, stdoutLen: streams.stdout.length, stderrLen: streams.stderr.length };

  function mismatch(detail) {
    return { run: fixture.run, status: 'mismatch', detail, observed };
  }

  if (result.status !== expect.exit) {
    return mismatch(`expected exit ${expect.exit}, observed exit ${result.status}`);
  }

  const wanted = expect.stream === 'stderr' ? 'stderr' : 'stdout';
  const other = wanted === 'stderr' ? 'stdout' : 'stderr';

  const parsed = tryParseJson(streams[wanted].trim());
  if (!parsed.ok) {
    // The single most important case this function exists to catch: the
    // payload silently moved to the other stream (stdout <-> stderr). A
    // plain "didn't parse" detail would hide that — name where it actually
    // landed instead.
    if (tryParseJson(streams[other].trim()).ok) {
      return mismatch(`expected the JSON payload on ${wanted}, but it appeared on ${other} instead`);
    }
    return mismatch(`${wanted} did not parse as JSON`);
  }

  const keys = expect.keys || [];
  if (keys.length > 0) {
    const first = Array.isArray(parsed.value) ? parsed.value[0] : parsed.value;
    if (!first || typeof first !== 'object') {
      return mismatch(`expected an object with key(s) [${keys.join(', ')}], but ${wanted}'s payload had no first element`);
    }
    const missing = keys.filter((k) => !(k in first));
    if (missing.length > 0) {
      return mismatch(`missing expected key(s) [${missing.join(', ')}] in ${wanted}'s first payload object`);
    }
  }

  return { run: fixture.run, status: 'ok', detail: 'observed output matched expect', observed };
}

// Replays every manifest fixture command and compares observed exit code /
// output stream / payload shape against `expect`. Captures stdout and
// stderr SEPARATELY (spawnSync does this natively) — never merged via
// `2>&1` or a shell pipe, and never merged in code afterward. A merge is
// exactly what let a stdout->stderr regression pass unnoticed through two
// prior verification passes on the real dependency this tool audits; a
// check that re-merges the streams would reproduce that same blindness.
function replayFixtures(entry, options = {}) {
  const { name } = entry;
  const fixtures = entry.fixtures || [];
  const cwd = options.cwd || path.resolve(__dirname, '..', '..');
  const runFixture = options.runFixture || defaultRunFixture;

  const results = fixtures.map((fixture) => checkOneFixture(fixture, cwd, runFixture));
  const status = results.every((r) => r.status === 'ok') ? 'ok' : 'mismatch';
  return { check: 'fixtures', name, status, results };
}

module.exports = { checkVersion, checkAssertions, replayFixtures };
