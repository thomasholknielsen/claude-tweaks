// bin/lib/init/release-bootstrap.js — the code twin of /claude-tweaks:init's
// Step 21 (bootstrap/step-21-release.md, #2253): release-process detection,
// the stack → release-type table, semver-aware manifest seeding, and the
// renderers for the three release-please files plus the two commented
// policy rows. bin/release-bootstrap.js is the CLI the prose step calls;
// this module is what the tests pin. Pure functions over a root path —
// the only I/O is reading the root directory and the files it names.
//
// Detection is deliberately a self-contained presence check, not
// _shared/existing-convention-detection.md's genre-grammar procedure: that
// file's ≥3-file floor and grammar parse answer "which naming convention do
// many files agree on", while this step asks "does exactly one of these
// markers exist". Only the plugin/project/conflict vocabulary is shared,
// and even that is narrowed to fresh / already-bootstrapped / conflict.
// `v*` tags are never conflict evidence — a repo that tags releases by
// hand is the common onboarding case, not a competing engine.
'use strict';

const fs = require('fs');
const path = require('path');
const { compareVersions } = require('../changelog');

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const V_TAG_RE = /^v(\d+\.\d+\.\d+)$/;

// Canonical prose copy: bootstrap/step-21-release.md's stack table (pinned
// by tests/init-release-bootstrap-conformance.test.js). Exactly one
// matching row selects its release-type; zero or two-plus fall through to
// `simple` — a multi-stack repo is out of #2253's scope by design.
const RELEASE_STACK_TABLE = [
  { releaseType: 'node', markers: ['package.json'] },
  { releaseType: 'python', markers: ['pyproject.toml', 'setup.py'] },
  { releaseType: 'rust', markers: ['Cargo.toml'] },
  { releaseType: 'go', markers: ['go.mod'] },
  { releaseType: 'java', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  { releaseType: 'ruby', markers: ['Gemfile', '*.gemspec'] },
  { releaseType: 'php', markers: ['composer.json'] },
  { releaseType: 'dotnet', markers: ['*.csproj', '*.sln'] },
];

const CONFLICT_MARKERS = [
  { tool: 'semantic-release', test: (name, isDir) => !isDir && /^\.releaserc(\..+)?$/.test(name) },
  { tool: 'semantic-release', test: (name, isDir) => !isDir && /^release\.config\..+$/.test(name) },
  { tool: 'changesets', test: (name, isDir) => isDir && name === '.changeset' },
  { tool: 'goreleaser', test: (name, isDir) => !isDir && /^\.goreleaser\..+$/.test(name) },
];

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';
const WORKFLOW_FILE = '.github/workflows/release-please.yml';
const CONFIG_SCHEMA = 'https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json';

function rootEntries(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return [];
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined; // missing or unparseable — callers decide what that means
  }
}

function isBootstrapShaped(parsed) {
  return Boolean(parsed && typeof parsed === 'object' && parsed.packages && typeof parsed.packages === 'object'
    && parsed.packages['.'] && typeof parsed.packages['.'] === 'object'
    && typeof parsed.packages['.']['release-type'] === 'string');
}

function detectReleaseProcess(root) {
  const entries = rootEntries(root);
  for (const { name, isDir } of entries) {
    for (const marker of CONFLICT_MARKERS) {
      if (marker.test(name, isDir)) return { verdict: 'conflict', tool: marker.tool, evidence: isDir ? `${name}/` : name };
    }
  }
  if (entries.some((e) => !e.isDir && e.name === CONFIG_FILE)) {
    const parsed = readJson(path.join(root, CONFIG_FILE));
    if (!isBootstrapShaped(parsed)) return { verdict: 'conflict', tool: 'release-please (foreign config)', evidence: CONFIG_FILE };
    return { verdict: 'already-bootstrapped' };
  }
  return { verdict: 'fresh' };
}

function markerMatches(marker, entries) {
  if (marker.startsWith('*.')) {
    const suffix = marker.slice(1);
    return entries.some((e) => !e.isDir && e.name.endsWith(suffix));
  }
  return entries.some((e) => e.name === marker);
}

function versionOfJson(file) {
  const parsed = readJson(file);
  const v = parsed && typeof parsed === 'object' ? parsed.version : undefined;
  return typeof v === 'string' && SEMVER_RE.test(v) ? v : null;
}

function findSimpleExtraFile(root, entries) {
  const candidates = ['.claude-plugin/plugin.json', 'plugin/.claude-plugin/plugin.json',
    ...entries.filter((e) => !e.isDir && e.name.endsWith('.json')).map((e) => e.name).sort()];
  for (const rel of candidates) {
    if (versionOfJson(path.join(root, rel)) !== null) return [{ type: 'json', path: rel, jsonpath: '$.version' }];
  }
  return [];
}

function resolveReleaseType(root) {
  const entries = rootEntries(root);
  const matched = RELEASE_STACK_TABLE.filter((row) => row.markers.some((m) => markerMatches(m, entries)));
  if (matched.length === 1) return { releaseType: matched[0].releaseType, extraFiles: [] };
  return { releaseType: 'simple', extraFiles: findSimpleExtraFile(root, entries) };
}

function versionOfToml(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = /^\s*version\s*=\s*"(\d+\.\d+\.\d+)"/m.exec(text);
  return m ? m[1] : null;
}

function readStackManifestVersion(root, releaseType) {
  switch (releaseType) {
    case 'node': return versionOfJson(path.join(root, 'package.json'));
    case 'php': return versionOfJson(path.join(root, 'composer.json'));
    case 'python': return versionOfToml(path.join(root, 'pyproject.toml'));
    case 'rust': return versionOfToml(path.join(root, 'Cargo.toml'));
    default: return null;
  }
}

// Newest v* tag wins by semver precedence (compareVersions, never a string
// sort — `v1.9.0` must lose to `v1.10.0`); non-semver tags are ignored.
function seedManifestVersion({ tags, manifestVersion } = {}) {
  const versions = (Array.isArray(tags) ? tags : [])
    .map((t) => { const m = V_TAG_RE.exec(String(t).trim()); return m ? m[1] : null; })
    .filter(Boolean);
  if (versions.length > 0) return versions.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best));
  if (typeof manifestVersion === 'string' && SEMVER_RE.test(manifestVersion)) return manifestVersion;
  return '0.1.0';
}

function renderWorkflowYaml({ branch } = {}) {
  const b = branch || 'main';
  return [
    'name: release-please',
    '',
    'on:',
    '  push:',
    '    branches:',
    `      - ${b}`,
    '',
    'permissions:',
    '  contents: write',
    '  pull-requests: write',
    '',
    'jobs:',
    '  release-please:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: googleapis/release-please-action@v4',
    '        with:',
    '          config-file: release-please-config.json',
    '          manifest-file: .release-please-manifest.json',
    '',
  ].join('\n');
}

function renderConfig({ releaseType, extraFiles } = {}) {
  const pkg = { 'release-type': releaseType, 'bump-minor-pre-major': false, 'include-component-in-tag': false };
  if (Array.isArray(extraFiles) && extraFiles.length > 0) pkg['extra-files'] = extraFiles;
  return `${JSON.stringify({ $schema: CONFIG_SCHEMA, packages: { '.': pkg } }, null, 2)}\n`;
}

function renderManifest(version) {
  return `${JSON.stringify({ '.': version }, null, 2)}\n`;
}

function renderPolicyRows() {
  return [
    '# release-hook: <command run after the local engine tags a release — local-merge only; under pr-first the release: published workflow is the hook>',
    '# release-train: false',
  ];
}

module.exports = {
  RELEASE_STACK_TABLE, CONFLICT_MARKERS, CONFIG_FILE, MANIFEST_FILE, WORKFLOW_FILE,
  isBootstrapShaped, detectReleaseProcess, resolveReleaseType, readStackManifestVersion, seedManifestVersion,
  renderWorkflowYaml, renderConfig, renderManifest, renderPolicyRows,
};
