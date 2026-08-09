'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectEntrypoints } = require('../candidates-dead-code');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-deadcode-'));
}

// ── detectEntrypoints ────────────────────────────────────────────────────────

test('detectEntrypoints: direct children of bin/ are entrypoints, nested bin/lib files are not', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'cli.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'helper.js'), 'module.exports = {};\n');
  const files = ['bin/cli.js', 'bin/lib/helper.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/cli.js'));
  assert.ok(!eps.has('bin/lib/helper.js'));
});

test('detectEntrypoints: files referenced inside hooks/hooks.json are entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" session-start' }] }],
      },
    }),
  );
  fs.writeFileSync(path.join(root, 'bin', 'hooks.js'), 'module.exports = {};\n');
  const files = ['bin/hooks.js', 'hooks/hooks.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/hooks.js'));
});

// The test above cannot fail if Rule 2 is deleted — bin/hooks.js is already an
// entrypoint via Rule 1 (direct child of bin/). This one puts the hooks.json
// reference outside bin/ so Rule 2 is the only thing that can find it, and
// keeps the "${VAR}/" prefix so the expansion strip is exercised too.
test('detectEntrypoints: a hooks.json reference outside bin/ is an entrypoint, "${VAR}/" prefix stripped', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        PostToolUse: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/notify.js" post-tool-use' }] }],
      },
    }),
  );
  fs.writeFileSync(path.join(root, 'scripts', 'notify.js'), 'module.exports = {};\n');
  const files = ['scripts/notify.js', 'hooks/hooks.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('scripts/notify.js'));
});

test('detectEntrypoints: files referenced inside .claude-plugin/plugin.json are entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'x', agents: ['./agents/qa-agent.js'] }),
  );
  fs.writeFileSync(path.join(root, 'agents', 'qa-agent.js'), 'module.exports = {};\n');
  const files = ['agents/qa-agent.js', '.claude-plugin/plugin.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('agents/qa-agent.js'));
});

test('detectEntrypoints: package.json bin/main/exports fields name entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(root, 'src', 'cli.js'), 'module.exports = {};\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ main: './src/index.js', bin: { mytool: './src/cli.js' } }),
  );
  const files = ['src/index.js', 'src/cli.js', 'package.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('src/index.js'));
  assert.ok(eps.has('src/cli.js'));
});

// The test above covers `main` and `bin` but not `exports`, which is the only
// field routed through collectStrings' recursive walk.
test('detectEntrypoints: a nested conditional-exports object names entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'esm.mjs'), 'export default {};\n');
  fs.writeFileSync(path.join(root, 'src', 'cjs.cjs'), 'module.exports = {};\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ exports: { '.': { import: './src/esm.mjs', require: './src/cjs.cjs' } } }),
  );
  const files = ['src/esm.mjs', 'src/cjs.cjs', 'package.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('src/esm.mjs'));
  assert.ok(eps.has('src/cjs.cjs'));
});

test('detectEntrypoints: bin/lib/hooks/*.js is an implicit entrypoint set when bin/hooks.js dynamically requires from it', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bin', 'hooks.js'),
    "function loadModule(event) { try { return require('./lib/hooks/' + event); } catch { return null; } }\nmodule.exports = { loadModule };\n",
  );
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'hooks', 'session-start.js'), 'function run() { return 1; }\nmodule.exports = { run };\n');
  const files = ['bin/hooks.js', 'bin/lib/hooks/session-start.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/lib/hooks/session-start.js'), 'dynamically-loaded hook module must be treated as an entrypoint');
});

test('detectEntrypoints: bin/lib/hooks/*.js is NOT an implicit entrypoint when bin/hooks.js does not use the dynamic-require pattern', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'hooks.js'), "const x = require('./lib/hooks/session-start');\nmodule.exports = { x };\n");
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'hooks', 'session-start.js'), 'module.exports = {};\n');
  const files = ['bin/hooks.js', 'bin/lib/hooks/session-start.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(!eps.has('bin/lib/hooks/session-start.js'), 'a literal (non-computed) require must not trigger the implicit-entrypoint carve-out');
});

const { extractModuleExports } = require('../candidates-dead-code');

// ── extractModuleExports ─────────────────────────────────────────────────────

test('extractModuleExports: single-line brace form', () => {
  const text = "function a() {}\nfunction b() {}\nmodule.exports = { a, b };\n";
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol).sort(), ['a', 'b']);
});

test('extractModuleExports: this repo\'s dominant multi-line brace shape', () => {
  const text = [
    'function usedFn() {}',
    'function deadFn() {}',
    'module.exports = {',
    '  usedFn,',
    '  deadFn,',
    '};',
    '',
  ].join('\n');
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol).sort(), ['deadFn', 'usedFn']);
  // The block spans the "module.exports = {" line through the closing "};" line.
  const usedFn = found.find((f) => f.symbol === 'usedFn');
  assert.strictEqual(usedFn.startLine, 3);
  assert.strictEqual(usedFn.endLine, 6);
});

test('extractModuleExports: no module.exports block yields an empty array, no crash', () => {
  assert.deepStrictEqual(extractModuleExports('const x = 1;\nexport default x;\n'), []);
});

test('extractModuleExports: aliased/computed keys are skipped, not crashed on (conservative)', () => {
  const text = 'function a() {}\nmodule.exports = { a, renamed: a, [computed()]: a };\n';
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol), ['a']);
});

test('extractModuleExports: a spread-based barrel re-export extracts no symbols and does not crash (AC2)', () => {
  const text = "module.exports = { ...require('./a'), ...require('./b') };\n";
  assert.deepStrictEqual(extractModuleExports(text), []);
});

test('extractModuleExports: an unterminated module.exports block is skipped, not crashed on', () => {
  const text = 'module.exports = { a, b\n// no closing brace in this file\n';
  assert.deepStrictEqual(extractModuleExports(text), []);
});

// None of the tests above contains a nested object value, so all of them still
// pass if the brace-depth scan is replaced by "stop at the first '}'". This one
// fails under that mutation: the naive scan would close the block on line 2 and
// extract nothing.
test('extractModuleExports: a nested object value does not prematurely end the block', () => {
  const text = [
    'module.exports = {',
    '  config: { a: 1 },',
    '  deadFn,',
    '};',
    '',
  ].join('\n');
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol), ['deadFn']);
  assert.strictEqual(found[0].startLine, 1);
  assert.strictEqual(found[0].endLine, 4);
});

// Likewise, every test above has exactly one export block, so they all pass if
// the scan stops after the first one. This one pins the loop *and* the per-block
// line range Task 3's `declRange` depends on.
test('extractModuleExports: a second module.exports block is scanned too, with its own line range', () => {
  const text = [
    'if (x) {',
    '  module.exports = { first };',
    '} else {',
    '  module.exports = { second };',
    '}',
    '',
  ].join('\n');
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol), ['first', 'second']);
  assert.deepStrictEqual(found.map((f) => f.startLine), [2, 4]);
  assert.deepStrictEqual(found.map((f) => f.endLine), [2, 4]);
});

// Pins `startRe.lastIndex = closeIdx`: without it the scan resumes one char
// past the opening brace and re-matches a "module.exports = {" that occurs
// *inside* the block it already consumed, emitting `fake` as an export that
// exists nowhere — i.e. a false dead-code report. No other test here fails if
// that line is deleted.
test('extractModuleExports: a "module.exports = {" inside a string value is not rescanned as a second block', () => {
  const text = "module.exports = { note: 'module.exports = { fake }', real };\n";
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol), ['real']);
});
