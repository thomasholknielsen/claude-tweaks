'use strict';
// bin/lib/release-local/manifest.js — byte-preserving version edits for the
// local release engine (#2254). The stack → manifest mapping cites
// skills/init/bootstrap/step-21-release.md's table (code twin
// RELEASE_STACK_TABLE in bin/lib/init/release-bootstrap.js); the engine reads
// the bootstrap-written release-please-config.json rather than re-detecting.
// Every edit is a raw string splice of the version token — never
// JSON.parse+stringify, never a TOML re-emit — so a release diff shows one
// token per file (spec: byte-preserving AC).

// Only genuine path absence reads as "no version here". A bad ref (`invalid
// object name`) is a git error and propagates — unlike manifest-path.js's
// NOT_FOUND_ERROR_RE, which folds both because its callers key on the
// distinction downstream. (Plan ruling 8: Task 3's implementer caught the
// brief's original NOT_FOUND_ERROR_RE reuse contradicting its own test.)
const PATH_ABSENT_RE = /does not exist|exists on disk, but not in/i;

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';
const SEMVER = '\\d+\\.\\d+\\.\\d+';
// Stack manifests by release-type (step-21-release.md's table). go has no
// manifest (tag only); java/ruby/dotnet need per-project version files the
// local engine does not model — point them at `simple` + extra-files.
const STACK_TARGETS = {
  node: [{ path: 'package.json', kind: 'json' }, { path: 'package-lock.json', kind: 'json-lock', optional: true }],
  php: [{ path: 'composer.json', kind: 'json' }],
  python: [{ path: 'pyproject.toml', kind: 'toml', sections: ['project', 'tool.poetry'] }],
  rust: [{ path: 'Cargo.toml', kind: 'toml', sections: ['package'] }],
  go: [],
  simple: [{ path: 'version.txt', kind: 'text', create: true }],
};
const UNSUPPORTED = new Set(['java', 'ruby', 'dotnet']);

class ManifestError extends Error {}

function readConfig(readFile) {
  const text = readFile(CONFIG_FILE);
  if (text === null || text === undefined) return null;
  let cfg;
  try { cfg = JSON.parse(text); } catch (e) { throw new ManifestError(`${CONFIG_FILE} is not valid JSON: ${e.message}`); }
  const pkg = (cfg.packages && cfg.packages['.']) || {};
  const releaseType = pkg['release-type'] || cfg['release-type'] || null;
  const extraFiles = pkg['extra-files'] || cfg['extra-files'] || [];
  if (!releaseType) throw new ManifestError(`${CONFIG_FILE} names no release-type for package "."`);
  return { releaseType, extraFiles };
}

function extraFileTarget(entry) {
  if (typeof entry === 'string') return { path: entry, kind: 'generic' };
  if (entry && entry.type === 'json') {
    if (entry.jsonpath !== '$.version') throw new ManifestError(`extra-files jsonpath ${entry.jsonpath} is unsupported — the local engine splices $.version only`);
    return { path: entry.path, kind: 'json' };
  }
  throw new ManifestError(`extra-files entry of type ${entry && entry.type} is unsupported by the local engine (json or a generic x-release-please-version path)`);
}

function resolveTargets({ releaseType, extraFiles = [] }) {
  if (UNSUPPORTED.has(releaseType)) {
    throw new ManifestError(`release-type ${releaseType} manifest edits are unsupported by the local engine — use release-type simple with extra-files naming the version-bearing file`);
  }
  const stack = STACK_TARGETS[releaseType];
  if (!stack) throw new ManifestError(`unknown release-type ${releaseType}`);
  return [{ path: MANIFEST_FILE, kind: 'manifest', optional: true }, ...stack, ...extraFiles.map(extraFileTarget)];
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function spliceMatch(text, re, to, group) {
  const m = re.exec(text);
  if (!m) return { text, found: false, previous: null };
  const start = m.index + m[0].indexOf(m[group], m[1].length);
  return { text: text.slice(0, start) + to + text.slice(start + m[group].length), found: true, previous: m[group] };
}

// Structural, not first-occurrence: a `"version"` nested in an earlier object
// (`{"publishConfig": {"version": "9.9.9"}, "version": "1.2.0"}`) is a different
// key, and a regex that takes the first hit bumps the wrong token. Walk the text
// tracking string state (with escapes) and brace/bracket depth, and accept the
// key only as a string token at object depth `depth` — 1 for a whole file's root
// object, 0 for the packages[""] slice spliceJsonLock hands over (its text
// already begins inside that object).
const JSON_VERSION_VALUE_RE = new RegExp(`^\\s*:\\s*"(${SEMVER})"`);

function spliceJsonKey(text, key, to, { depth = 1 } = {}) {
  let level = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const open = i;
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      const token = text.slice(open + 1, i);
      i += 1;
      if (level !== depth || token !== key) continue;
      const m = JSON_VERSION_VALUE_RE.exec(text.slice(i));
      if (!m) continue;
      const at = i + m[0].length - 1 - m[1].length;
      return { text: text.slice(0, at) + to + text.slice(at + m[1].length), found: true, previous: m[1] };
    }
    if (ch === '{' || ch === '[') level += 1;
    else if (ch === '}' || ch === ']') level -= 1;
    i += 1;
  }
  return { text, found: false, previous: null };
}

// package-lock.json: the root "version" plus, on lockfileVersion 2/3, the
// packages[""] entry's own "version" — never a dependency's. A v1 lockfile
// has no packages block, and a blind second occurrence there would be the
// first dependency's pin (ruling 9, Task 3 review). The packages[""] search
// is bounded by the first "node_modules/ key so an entry without a version
// cannot leak the match into a dependency either.
function spliceJsonLock(text, to) {
  const root = spliceJsonKey(text, 'version', to);
  const block = /"packages"\s*:\s*\{\s*""\s*:\s*\{/.exec(root.text);
  if (!block) return root;
  const at = block.index + block[0].length;
  const end = root.text.indexOf('"node_modules/', at);
  const scope = end === -1 ? root.text.slice(at) : root.text.slice(at, end);
  const inner = spliceJsonKey(scope, 'version', to, { depth: 0 });
  const rest = end === -1 ? '' : root.text.slice(end);
  return { text: root.text.slice(0, at) + inner.text + rest, found: root.found || inner.found, previous: root.previous };
}

function spliceToml(text, sections, to) {
  for (const section of sections) {
    const header = new RegExp(`^\\[${escapeRe(section)}\\][ \\t]*$`, 'm').exec(text);
    if (!header) continue;
    const bodyStart = header.index + header[0].length;
    const rest = text.slice(bodyStart);
    const next = /^\[/m.exec(rest);
    const body = next ? rest.slice(0, next.index) : rest;
    const vm = new RegExp(`^([ \\t]*version[ \\t]*=[ \\t]*")(${SEMVER})(")`, 'm').exec(body);
    if (!vm) continue;
    const start = bodyStart + vm.index + vm[1].length;
    return { text: text.slice(0, start) + to + text.slice(start + vm[2].length), found: true, previous: vm[2] };
  }
  return { text, found: false, previous: null };
}

function spliceVersion(kind, text, to, opts = {}) {
  switch (kind) {
    case 'json': return spliceJsonKey(text, 'version', to);
    case 'json-lock': return spliceJsonLock(text, to);
    case 'manifest': return spliceJsonKey(text, '.', to);
    case 'toml': return spliceToml(text, opts.sections || [], to);
    case 'text': {
      if (text === null || text === undefined) return { text: to, found: false, previous: null };
      return spliceMatch(text, new RegExp(`()(${SEMVER})`), to, 2);
    }
    case 'generic': {
      const lines = text.split('\n');
      let previous = null;
      const out = lines.map((line) => {
        if (previous !== null || !line.includes('x-release-please-version')) return line;
        const m = new RegExp(SEMVER).exec(line);
        if (!m) return line;
        previous = m[0];
        return line.slice(0, m.index) + to + line.slice(m.index + m[0].length);
      });
      return { text: out.join('\n'), found: previous !== null, previous };
    }
    default: throw new ManifestError(`unknown manifest kind ${kind}`);
  }
}

function versionOfText(target, text) {
  if (text === null || text === undefined) return null;
  const probe = spliceVersion(target.kind, text, '0.0.0', target);
  return probe.found ? probe.previous : null;
}

// First target whose file carries a version token: manifest file, then the
// stack manifest, then extra-files. Absent files read as null; anything else
// the reader throws propagates (a git error is never "no version").
function firstVersion(targets, read) {
  for (const target of targets) {
    if (target.kind === 'generic') continue;
    let text;
    try {
      text = read(target.path);
    } catch (err) {
      if (PATH_ABSENT_RE.test(String(err.message || err))) continue;
      throw err;
    }
    const v = versionOfText(target, text);
    if (v !== null) return v;
  }
  return null;
}

function currentVersion(targets, readFile) { return firstVersion(targets, readFile); }
function versionAtRef(targets, show) { return firstVersion(targets, show); }

function applyVersion(targets, from, to, readFile, writeFile) {
  const written = [];
  for (const target of targets) {
    const text = readFile(target.path);
    if ((text === null || text === undefined) && !target.create) {
      if (target.optional) continue;
      throw new ManifestError(`${target.path} is missing — the release-type names it as the manifest`);
    }
    const out = spliceVersion(target.kind, text, to, target);
    if (!out.found && !target.create) throw new ManifestError(`${target.path} carries no version token to bump`);
    if (out.text === text) continue;
    writeFile(target.path, out.text);
    written.push({ path: target.path, previous: out.previous });
  }
  return written;
}

module.exports = {
  CONFIG_FILE, MANIFEST_FILE, STACK_TARGETS, ManifestError,
  readConfig, resolveTargets, spliceVersion, currentVersion, versionAtRef, applyVersion,
};
