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
