// tests/impeccable-plugin-contract.test.js
//
// Contract probe for the Impeccable PLUGIN (a different artifact on a
// different version line from the Impeccable CLI — see
// tests/impeccable-cli-contract.test.js for that one). Proves the claims in
// skills/design-wrapper/impeccable-plugin.md against the plugin actually
// installed in the cache.
//
// Resolution is NOT reimplemented here. tools/upstream-drift/checks.js already
// owns the plugin-cache-glob resolver — glob the cache, read each candidate's
// own plugin.json `version`, select the one equal to the pin — and the pin
// itself lives once in tools/upstream-drift/manifest.yml. A second resolver
// beside it would be a second thing to keep correct, and two resolvers
// agreeing is exactly when a shared bug reads as the spec.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkVersion, checkAssertions } = require('../tools/upstream-drift/checks');
const { loadManifest } = require('../tools/upstream-drift/manifest');

const REPO_ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'impeccable-plugin');
const CONTRACT_DOC = path.join(REPO_ROOT, 'plugin', 'skills', 'design-wrapper', 'impeccable-plugin.md');
const DETECTION_DOC = path.join(REPO_ROOT, 'plugin', 'skills', 'design-wrapper', 'frontend-detection.md');
const SCRIPT_REL = path.join('skills', 'impeccable', 'scripts', 'context-signals.mjs');

const manifest = loadManifest(path.join(REPO_ROOT, 'tools', 'upstream-drift', 'manifest.yml'));
const ENTRY = manifest.dependencies.find((d) => d.name === 'impeccable-plugin');
const PINNED = ENTRY.pinned;

const versionCheck = checkVersion(ENTRY);

// Absent plugin skips; present-but-off-pin FAILS. A contract probe that
// silently declines to run reads exactly like one that passed — which is the
// defect this suite exists to catch, so it must not be this suite's own
// behaviour. Contributors without Impeccable installed are unaffected.
//
// Everything that replays a committed fixture runs unconditionally: fixtures
// need no installed plugin, and the Layer 3 assertion below is permanent.
const skip = versionCheck.status === 'absent' ? 'Impeccable plugin not installed' : false;

// ─── the pin ────────────────────────────────────────────────────────────────

test('impeccable-plugin.md pins the same version the drift manifest does', () => {
  const doc = fs.readFileSync(CONTRACT_DOC, 'utf8');
  const match = doc.match(/<!--\s*upstream-pin:\s*impeccable-plugin@([^\s]+)\s*-->/);
  assert.ok(match, 'impeccable-plugin.md must carry an <!-- upstream-pin: impeccable-plugin@X.Y.Z --> comment');
  assert.strictEqual(
    match[1],
    PINNED,
    `impeccable-plugin.md pins ${match[1]} but tools/upstream-drift/manifest.yml pins ${PINNED}. ` +
      'Two pins for one artifact is the drift this whole seam exists to prevent — move both together.'
  );
});

test('the installed plugin matches the pinned version', { skip }, () => {
  assert.strictEqual(
    versionCheck.status,
    'ok',
    `${versionCheck.detail}. Every assertion below describes ${PINNED}'s behaviour, so they prove ` +
      `nothing about the installed one — context-signals.mjs does not even exist at every version ` +
      `that satisfies the plugin's skill-resolution check. Install ${PINNED}, or re-pin deliberately ` +
      'by re-recording the fixtures against the new version.'
  );
});

// ─── degradation: the three conditions stay distinguishable ─────────────────
//
// Exercised through the resolver's search root pointed at a COMMITTED fixture
// cache tree. Never by mutating, hiding, or pointing at the developer's real
// ~/.claude/plugins/cache — which is the entire reason that search root is a
// parameter with a default rather than a constant.

function entryWithSearchRoot(searchRoot) {
  // Spread first, override after: the derived probe must win over the parsed
  // manifest's, never the reverse.
  return {
    ...ENTRY,
    'installed-probe': {
      type: 'plugin-cache-glob',
      glob: path.join(searchRoot, '*', 'impeccable', '*', '.claude-plugin', 'plugin.json'),
    },
  };
}

test('version mismatch is a breach, and the reason names EVERY version found', () => {
  const result = checkVersion(entryWithSearchRoot(path.join(FIXTURES, 'cache')));

  assert.strictEqual(result.status, 'breach', 'candidates exist but none is at the pin — that is a breach, not an absence');
  assert.deepStrictEqual(
    [...result.installed].sort(),
    ['3.0.6', '4.0.4'],
    'both fixture candidates must be reported — a resolver that stops at the first one would pass a single-candidate fixture'
  );
  for (const found of ['3.0.6', '4.0.4']) {
    assert.ok(
      result.detail.includes(found),
      `the mismatch reason must name every version found; ${found} is missing from: ${result.detail}`
    );
  }
  assert.ok(result.detail.includes(PINNED), `the mismatch reason must also name the pin ${PINNED}: ${result.detail}`);
});

test('an empty search root is absent, not a breach', () => {
  const result = checkVersion(entryWithSearchRoot(path.join(FIXTURES, 'no-such-cache')));

  assert.strictEqual(result.status, 'absent');
  assert.deepStrictEqual(result.installed, []);
  assert.ok(
    !/breach|does not match/i.test(result.detail),
    `"not installed" must not be reported as a version mismatch: ${result.detail}`
  );
});

// ─── the installed artifact ─────────────────────────────────────────────────

// Resolves the pinned plugin root as a by-product of checking the manifest's
// own assertions about it — the same resolver the version check above used.
function pinnedPluginRoot() {
  const result = checkAssertions(ENTRY);
  assert.notStrictEqual(result.status, 'skipped', 'could not resolve an installed root at the pin');
  const roots = result.results.flatMap((r) => r.roots.map((x) => x.root));
  assert.ok(roots.length > 0, 'the manifest entry must carry at least one assertion to resolve a root from');
  return roots[0];
}

test('the manifest\'s assertions about the pinned plugin still hold', { skip }, () => {
  const result = checkAssertions(ENTRY);
  const failing = result.results.filter((r) => r.status !== 'ok');
  assert.deepStrictEqual(
    failing.map((r) => `${r.claims}: ${r.detail}`),
    [],
    'impeccable-plugin.md claims something upstream no longer says'
  );
});

test('gatherSignals() executes cleanly and returns the documented shape', { skip }, async () => {
  const script = path.join(pinnedPluginRoot(), SCRIPT_REL);
  assert.ok(fs.existsSync(script), `${script} does not exist — impeccable-plugin.md's resolved script path is stale`);

  const { gatherSignals } = await import(`file://${script}`);
  const signals = await gatherSignals(REPO_ROOT);

  assert.deepStrictEqual(
    Object.keys(signals).sort(),
    ['critique', 'devServer', 'git', 'scan', 'setup'],
    'impeccable-plugin.md documents exactly these five top-level keys'
  );

  // Keys and types only — never values. Every value here is a fact about
  // whatever happens to be checked out and listening right now, so asserting
  // one would be a scheduled failure with no contract behind it.
  const shape = {
    'setup.hasProduct': ['boolean'],
    'setup.productPath': ['string', 'null'],
    'setup.hasDesign': ['boolean'],
    'setup.designPath': ['string', 'null'],
    'setup.hasCode': ['boolean'],
    'setup.platform': ['string', 'null'],
    'critique.latest': ['object', 'null'],
    'git.isRepo': ['boolean'],
    'git.branch': ['string', 'null'],
    'git.base': ['string', 'null'],
    'git.changedFiles': ['array'],
    'git.changedCount': ['number'],
    'devServer.running': ['boolean'],
    'devServer.ports': ['array'],
    'scan.targets': ['array'],
    'scan.via': ['string', 'null'],
  };
  for (const [dotted, allowed] of Object.entries(shape)) {
    const [group, key] = dotted.split('.');
    const value = signals[group][key];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    assert.ok(
      allowed.includes(actual),
      `${dotted} is ${actual}, but impeccable-plugin.md's field reference documents ${allowed.join(' | ')}`
    );
  }

  if (signals.scan.via !== null) {
    assert.ok(
      ['git-changes', 'source-dir', 'html', 'root'].includes(signals.scan.via),
      `scan.via reported an undocumented branch: ${signals.scan.via}`
    );
  }
  assert.ok(
    signals.git.changedCount >= signals.git.changedFiles.length,
    'changedCount is the uncapped total, so it can never be below the capped list'
  );
});

test('the CLI entrypoint accepts no flags', { skip }, () => {
  const script = path.join(pinnedPluginRoot(), SCRIPT_REL);
  // impeccable-plugin.md states the entrypoint never reads process.argv. Prove
  // it behaviourally: flags that would be meaningful to any other CLI must be
  // inert here — neither honoured nor rejected.
  const run = (args) => spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

  const bare = run([]);
  const flagged = run(['--json', '--target', 'src/', '--nonsense']);

  assert.strictEqual(bare.status, 0, `bare invocation must exit 0; stderr: ${bare.stderr}`);
  assert.strictEqual(bare.stderr, '', 'nothing may go to stderr on the happy path');
  assert.strictEqual(flagged.status, 0, `flags must not cause a non-zero exit; stderr: ${flagged.stderr}`);
  assert.strictEqual(flagged.stderr, '', 'flags must not provoke a usage error on stderr');

  const parsed = JSON.parse(flagged.stdout);
  assert.deepStrictEqual(
    Object.keys(parsed).sort(),
    ['critique', 'devServer', 'git', 'scan', 'setup'],
    'stdout must carry the same five-key object regardless of arguments'
  );

  // The direct form of the claim, and the only one that holds regardless of what
  // the working tree is doing: had the entrypoint read argv, `--target src/`
  // would be the scan target.
  assert.notDeepStrictEqual(
    parsed.scan.targets,
    ['src/'],
    '--target was honoured — the no-injection-point claim in impeccable-plugin.md would be false'
  );

  // The full-object comparison is strictly stronger — it would catch an argv
  // effect that happened not to look like `['src/']` — but it is only meaningful
  // when the two runs observed the same repository, and that is not something
  // this test can assume. `resolveScan` returns
  // `{ targets: changed.slice(0, 50), via: 'git-changes' }` whenever the tree is
  // dirty, so any write under REPO_ROOT between the two spawns changes the
  // answer. This repo's normal working mode is several parallel worktree
  // sessions, so that happens, and it surfaced as this very assertion's message
  // — blaming argv handling for concurrent git churn.
  //
  // Gating on `via === 'git-changes'` for both runs is NOT sufficient: a dirty
  // tree gives both runs that same `via` while their target lists differ, which
  // is precisely the observed failure. Only `via: 'root'` is a basis that cannot
  // vary between two spawns, so the comparison runs there and is skipped
  // otherwise. The deterministic `--target` assertion above carries the claim in
  // either case; this is an additional net, never the only one.
  const bareScan = JSON.parse(bare.stdout).scan;
  if (bareScan.via === 'root' && parsed.scan.via === 'root') {
    assert.deepStrictEqual(
      bareScan,
      parsed.scan,
      'a --target flag changed scan — the no-injection-point claim in impeccable-plugin.md would be false'
    );
  }
});

// ─── Layer 3 is not redundant with scan.targets (PERMANENT) ─────────────────
//
// Replays a frozen fixture, never live git state: an assertion that this repo
// currently produces N targets is a scheduled failure timed to the next commit
// ([IL-80]), and this leaf's own diff moves that number. See the fixture's
// README for how it was recorded.

const FROZEN = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'signals-backend-repo.json'), 'utf8'));

// Layer 3's predicate, per skills/design-wrapper/frontend-detection.md. The
// sync guard below pins these two sets to that file's tables so this copy
// cannot drift away from the rules it claims to implement.
const TRIGGER_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte', '.html', '.css', '.scss', '.sass', '.less', '.astro', '.mdx',
]);
const TRIGGER_PATH_SEGMENTS = ['/components/', '/pages/', '/app/', '/routes/', '/views/', '/ui/'];

function isFrontend(file) {
  const normalized = file.replace(/\\/g, '/');
  if (TRIGGER_EXTENSIONS.has(path.extname(normalized).toLowerCase())) return true;
  return TRIGGER_PATH_SEGMENTS.some((seg) => `/${normalized}/`.includes(seg));
}

test('scan.targets is NOT equivalent to Layer 3 — the frontend predicate survives', () => {
  const targets = FROZEN.scan.targets;
  assert.ok(targets.length > 0, 'the frozen fixture must carry targets, or this proves nothing');

  const layer3 = targets.filter(isFrontend);
  assert.deepStrictEqual(
    layer3,
    [],
    'Layer 3 rejects every target in this fixture — if that changed, either the trigger tables in ' +
      'frontend-detection.md moved or the fixture was re-recorded from a repo with UI in it'
  );

  // The whole point, stated as an assertion rather than a comment: the two
  // predicates disagree on real recorded input. Nothing upstream computes a
  // frontend predicate, so deleting or weakening Layer 3 in favour of
  // scan.targets would silently widen every mode onto backend diffs.
  assert.notDeepStrictEqual(
    targets,
    layer3,
    'scan.targets and Layer 3 agreed on this fixture — the non-equivalence this asserts has been lost'
  );

  // And it is scannability, not frontend-ness, that put them there: every
  // target is a .js file, which Layer 3 lists under negative cases.
  assert.ok(
    targets.every((t) => t.endsWith('.js')),
    'the recorded fixture is all-.js by construction; re-record it if that is no longer true'
  );
});

test('a non-scannable changed file is dropped from scan.targets', () => {
  // Recorded boundary: .md is outside Impeccable's SCANNABLE_EXT, so it
  // reaches changedFiles but not targets. Locks the two lists as genuinely
  // different sets rather than one being a rename of the other.
  const mdChanged = FROZEN.git.changedFiles.filter((f) => f.endsWith('.md'));
  assert.ok(mdChanged.length > 0, 'the fixture must include a non-scannable changed file');
  for (const f of mdChanged) {
    assert.ok(!FROZEN.scan.targets.includes(f), `${f} is not scannable and must not appear in scan.targets`);
  }
});

test('the Layer 3 rules replayed above still match frontend-detection.md', () => {
  const doc = fs.readFileSync(DETECTION_DOC, 'utf8');
  const section = (heading) => {
    const start = doc.indexOf(heading);
    assert.notStrictEqual(start, -1, `frontend-detection.md no longer has a "${heading}" section`);
    const next = doc.indexOf('\n### ', start + heading.length);
    return doc.slice(start, next === -1 ? doc.length : next);
  };

  // Table rows look like `| `.tsx` | React/Preact TypeScript components |`.
  const extensions = [...section('### Trigger extensions').matchAll(/^\|\s*`(\.[a-z]+)`\s*\|/gm)].map((m) => m[1]);
  const segments = [...section('### Trigger path patterns').matchAll(/^\|\s*`(\/[a-z]+\/)`\s*\|/gm)].map((m) => m[1]);

  assert.deepStrictEqual(
    extensions.sort(),
    [...TRIGGER_EXTENSIONS].sort(),
    'frontend-detection.md\'s trigger-extension table and this test\'s copy of Layer 3 have diverged'
  );
  assert.deepStrictEqual(
    segments.sort(),
    [...TRIGGER_PATH_SEGMENTS].sort(),
    'frontend-detection.md\'s trigger-path table and this test\'s copy of Layer 3 have diverged'
  );
  assert.ok(
    !extensions.includes('.js') && !extensions.includes('.ts'),
    'Layer 3 gained .js/.ts as trigger extensions — that is the change the non-equivalence assertion above guards, ' +
      'and it must be a deliberate decision recorded in impeccable-plugin.md, not a silent table edit'
  );
});
