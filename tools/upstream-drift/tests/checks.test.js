'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { checkVersion, checkAssertions, replayFixtures } = require('../checks');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-drift-checks-'));
}

function writeFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// Builds a plugin-cache-glob-shaped temp tree:
//   <root>/<slot>/impeccable/<dirVersion>/.claude-plugin/plugin.json
// with the given `fileVersion` written INSIDE plugin.json — deliberately
// separate from `dirVersion` so tests can prove the file content, not the
// directory name, is what gets read.
function writePluginCacheCandidate(root, slot, dirVersion, fileVersion) {
  writeFile(
    root,
    path.join(slot, 'impeccable', dirVersion, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: fileVersion }),
  );
}

function globFor(root) {
  return path.join(root, '*', 'impeccable', '*', '.claude-plugin', 'plugin.json');
}

// ─── checkVersion ────────────────────────────────────────────────────────

test('checkVersion: ok when the command probe reports the pinned version', () => {
  const entry = {
    name: 'impeccable-cli',
    pinned: '3.5.0',
    'installed-probe': { type: 'command', run: 'irrelevant --version' },
  };
  const result = checkVersion(entry, { runCommand: () => '3.5.0' });
  assert.strictEqual(result.check, 'version');
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual(result.installed, ['3.5.0']);
});

test('checkVersion: breach names BOTH the installed and pinned version when they disagree', () => {
  const entry = {
    name: 'impeccable-cli',
    pinned: '3.5.0',
    'installed-probe': { type: 'command', run: 'irrelevant --version' },
  };
  const result = checkVersion(entry, { runCommand: () => '2.1.8' });
  assert.strictEqual(result.status, 'breach');
  assert.deepStrictEqual(result.installed, ['2.1.8']);
  assert.strictEqual(result.pinned, '3.5.0');
  assert.ok(result.detail.includes('2.1.8'), 'detail must name the installed version');
  assert.ok(result.detail.includes('3.5.0'), 'detail must name the pinned version');
});

test('checkVersion: absent (not breach) when the probe command does not exist', () => {
  const entry = {
    name: 'impeccable-cli',
    pinned: '3.5.0',
    'installed-probe': { type: 'command', run: 'this-command-truly-does-not-exist-xyz-98765 --version' },
  };
  const result = checkVersion(entry); // no override — exercises the real spawnSync path
  assert.strictEqual(result.status, 'absent');
  assert.notStrictEqual(result.status, 'breach');
  assert.deepStrictEqual(result.installed, []);
});

test('checkVersion: absent when the command probe exits non-zero with output', () => {
  const entry = {
    name: 'x',
    pinned: '1.0.0',
    'installed-probe': { type: 'command', run: 'node -e "console.log(1); process.exit(1)"' },
  };
  const result = checkVersion(entry);
  assert.strictEqual(result.status, 'absent');
});

test('checkVersion: plugin-cache-glob resolving multiple installed versions reports ok when one matches pinned', () => {
  const root = tmpDir();
  writePluginCacheCandidate(root, 'slotA', '2.1.8', '2.1.8');
  writePluginCacheCandidate(root, 'slotB', '3.5.0', '3.5.0');
  const entry = {
    name: 'impeccable-plugin',
    pinned: '3.5.0',
    'installed-probe': { type: 'plugin-cache-glob', glob: globFor(root) },
  };
  const result = checkVersion(entry);
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual([...result.installed].sort(), ['2.1.8', '3.5.0']);
});

test('checkVersion: plugin-cache-glob reads each candidate\'s own version field, not the directory name', () => {
  const root = tmpDir();
  // Directory segment says "1.0.0"; the file itself says "3.5.0". If the
  // implementation regressed to trusting the directory name it would report
  // installed=['1.0.0'] and status 'breach' against pinned 3.5.0.
  writePluginCacheCandidate(root, 'slotA', '1.0.0', '3.5.0');
  const entry = {
    name: 'impeccable-plugin',
    pinned: '3.5.0',
    'installed-probe': { type: 'plugin-cache-glob', glob: globFor(root) },
  };
  const result = checkVersion(entry);
  assert.deepStrictEqual(result.installed, ['3.5.0']);
  assert.ok(!result.installed.includes('1.0.0'), 'must not report the directory-name version');
  assert.strictEqual(result.status, 'ok');
});

test('checkVersion: plugin-cache-glob is absent when the glob matches nothing', () => {
  const root = tmpDir();
  const entry = {
    name: 'impeccable-plugin',
    pinned: '3.5.0',
    'installed-probe': { type: 'plugin-cache-glob', glob: globFor(root) },
  };
  const result = checkVersion(entry);
  assert.strictEqual(result.status, 'absent');
  assert.deepStrictEqual(result.installed, []);
});

// ─── checkAssertions ─────────────────────────────────────────────────────

test('checkAssertions: ok when the literal is present in the resolved file', () => {
  const root = tmpDir();
  writeFile(root, 'cli/engine/cli/main.mjs', "before\nprocess.stdout.write(formatFindings(x))\nafter\n");
  const entry = {
    name: 'impeccable-cli',
    assertions: [
      { file: 'skills/design-wrapper/impeccable-cli.md', claims: 'writes findings to stdout', 'upstream-path': 'cli/engine/cli/main.mjs', 'must-match': 'process.stdout.write(formatFindings' },
    ],
  };
  const result = checkAssertions(entry, { root });
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.results.length, 1);
  assert.strictEqual(result.results[0].status, 'ok');
  assert.strictEqual(result.results[0].upstreamPath, 'cli/engine/cli/main.mjs');
});

test('checkAssertions: unmatched when the file exists but no longer contains the literal', () => {
  const root = tmpDir();
  writeFile(root, 'cli/engine/cli/main.mjs', "process.stdout.write(somethingElse)\n");
  const entry = {
    name: 'impeccable-cli',
    assertions: [
      { file: 'x.md', claims: 'y', 'upstream-path': 'cli/engine/cli/main.mjs', 'must-match': 'process.stdout.write(formatFindings' },
    ],
  };
  const result = checkAssertions(entry, { root });
  assert.strictEqual(result.status, 'drift');
  assert.strictEqual(result.results[0].status, 'unmatched');
});

test('checkAssertions: missing-file when the upstream-path does not exist under the resolved root', () => {
  const root = tmpDir();
  const entry = {
    name: 'impeccable-cli',
    assertions: [
      { file: 'x.md', claims: 'y', 'upstream-path': 'cli/does/not/exist.mjs', 'must-match': 'anything' },
    ],
  };
  const result = checkAssertions(entry, { root });
  assert.strictEqual(result.status, 'drift');
  assert.strictEqual(result.results[0].status, 'missing-file');
});

test('checkAssertions: missing-file and unmatched are NOT collapsed into one status', () => {
  const root = tmpDir();
  writeFile(root, 'present-but-stale.mjs', 'the old literal is gone now');
  const entry = {
    name: 'impeccable-cli',
    assertions: [
      { file: 'a.md', claims: 'a', 'upstream-path': 'present-but-stale.mjs', 'must-match': 'the new literal' },
      { file: 'b.md', claims: 'b', 'upstream-path': 'nowhere.mjs', 'must-match': 'anything' },
    ],
  };
  const result = checkAssertions(entry, { root });
  assert.strictEqual(result.results[0].status, 'unmatched');
  assert.strictEqual(result.results[1].status, 'missing-file');
  assert.notStrictEqual(result.results[0].status, result.results[1].status);
  assert.strictEqual(result.status, 'drift');
});

test('checkAssertions: skipped (assertions not marked failed) when the root cannot be resolved', () => {
  const entry = {
    name: 'impeccable-plugin',
    pinned: '3.5.0',
    'installed-probe': { type: 'plugin-cache-glob', glob: globFor(tmpDir()) }, // matches nothing
    assertions: [
      { file: 'a.md', claims: 'a', 'upstream-path': 'skills/impeccable/SKILL.md', 'must-match': 'polish [target]' },
    ],
  };
  const result = checkAssertions(entry);
  assert.strictEqual(result.status, 'skipped');
  assert.deepStrictEqual(result.results, []);
  assert.ok(result.detail && result.detail.length > 0);
});

test('checkAssertions: must-match containing regex metacharacters matches as a LITERAL substring', () => {
  const root = tmpDir();
  writeFile(root, 'skills/impeccable/SKILL.md', 'Commands include: polish [target] and shape [feature]\n');
  const entry = {
    name: 'impeccable-plugin',
    assertions: [
      { file: 'skills/design-wrapper/command-map.md', claims: 'exposes a polish command', 'upstream-path': 'skills/impeccable/SKILL.md', 'must-match': 'polish [target]' },
    ],
  };
  const result = checkAssertions(entry, { root });
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.results[0].status, 'ok');
});

// ─── replayFixtures ──────────────────────────────────────────────────────

test('replayFixtures: ok on a matching fixture', () => {
  const entry = {
    name: 'impeccable-cli',
    fixtures: [
      { run: 'node -e "process.stdout.write(JSON.stringify([{a:1,b:2}]))"', expect: { exit: 0, stream: 'stdout', keys: ['a', 'b'] } },
    ],
  };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.results[0].status, 'ok');
});

test('replayFixtures: mismatch when the JSON payload lands on stderr instead of the expected stdout, and the detail names stderr', () => {
  const entry = {
    name: 'impeccable-cli',
    fixtures: [
      { run: 'node -e "process.stderr.write(JSON.stringify([{a:1}]));process.exit(0)"', expect: { exit: 0, stream: 'stdout', keys: ['a'] } },
    ],
  };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'mismatch');
  assert.strictEqual(result.results[0].status, 'mismatch');
  assert.ok(result.results[0].detail.includes('stderr'), `detail must name stderr, got: ${result.results[0].detail}`);
});

test('replayFixtures: mismatch on a wrong exit code', () => {
  const entry = {
    name: 'impeccable-cli',
    fixtures: [
      { run: 'node -e "process.exit(3)"', expect: { exit: 0, stream: 'stdout', keys: [] } },
    ],
  };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'mismatch');
  assert.strictEqual(result.results[0].observed.exit, 3);
});

test('replayFixtures: mismatch on a missing key', () => {
  const entry = {
    name: 'impeccable-cli',
    fixtures: [
      { run: 'node -e "process.stdout.write(JSON.stringify([{a:1}]))"', expect: { exit: 0, stream: 'stdout', keys: ['a', 'b'] } },
    ],
  };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'mismatch');
  assert.ok(result.results[0].detail.includes('b'), `detail must name the missing key, got: ${result.results[0].detail}`);
});

test('replayFixtures: ok for keys: [] (shape not inspected)', () => {
  const entry = {
    name: 'impeccable-cli',
    fixtures: [
      { run: 'node -e "process.stdout.write(\'[]\')"', expect: { exit: 0, stream: 'stdout', keys: [] } },
    ],
  };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'ok');
});

test('replayFixtures: ok and empty results for fixtures: []', () => {
  const entry = { name: 'impeccable-plugin', fixtures: [] };
  const result = replayFixtures(entry);
  assert.strictEqual(result.status, 'ok');
  assert.deepStrictEqual(result.results, []);
});

// ─── never-prints guard ──────────────────────────────────────────────────

test('checks.js never calls console.* — rendering belongs to a later module', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'checks.js'), 'utf8');
  assert.ok(!/console\s*\./.test(source), 'checks.js must not call any console.* method');
});
