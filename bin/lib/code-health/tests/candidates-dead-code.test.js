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

const { isReferenced } = require('../candidates-dead-code');

// ── isReferenced ──────────────────────────────────────────────────────────────

test('isReferenced: a symbol used elsewhere in another file is referenced', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'function usedFn() {}\nfunction deadFn() {}\nmodule.exports = { usedFn, deadFn };\n'],
    ['lib/caller.js', "const { usedFn } = require('./used');\nusedFn();\n"],
  ]);
  const allFiles = ['lib/used.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('usedFn', 'lib/used.js', { startLine: 3, endLine: 3 }, allFiles, contentsByFile), true);
});

test('isReferenced: a symbol with no use anywhere but its own export-block mention and definition line is NOT referenced', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'function usedFn() {}\nfunction deadFn() {}\nmodule.exports = { usedFn, deadFn };\n'],
    ['lib/caller.js', "const { usedFn } = require('./used');\nusedFn();\n"],
  ]);
  const allFiles = ['lib/used.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('deadFn', 'lib/used.js', { startLine: 3, endLine: 3 }, allFiles, contentsByFile), false);
});

test('isReferenced: a same-named identifier elsewhere in the tree is treated as a reference (accepted false-negative)', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function helper() {}\nmodule.exports = { helper };\n'],
    ['lib/unrelated.js', 'const helper = 42; // totally unrelated variable, same bare name\nconsole.log(helper);\n'],
  ]);
  const allFiles = ['lib/a.js', 'lib/unrelated.js'];
  // 'helper' is genuinely dead in lib/a.js's own sense, but the word-bounded
  // bare-symbol search cannot distinguish it from the unrelated identifier —
  // this is the spec's explicitly accepted false-negative policy.
  assert.strictEqual(isReferenced('helper', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), true);
});

test('isReferenced: the symbol\'s own function/const/class definition line is not itself counted as a use', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'const deadConst = 1;\nfunction deadFn() {}\nclass DeadClass {}\nmodule.exports = { deadConst, deadFn, DeadClass };\n'],
  ]);
  const allFiles = ['lib/a.js'];
  assert.strictEqual(isReferenced('deadConst', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
  assert.strictEqual(isReferenced('deadFn', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
  assert.strictEqual(isReferenced('DeadClass', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
});

// Every isReferenced test above still passes with the boundary assertions
// stripped from the search regex — none of them contains the symbol as a
// substring of a longer identifier. This one fails under that mutation:
// an unanchored search reads 'undead' and 'deadline' as uses of `dead`.
test('isReferenced: a bare substring inside a longer identifier is not a reference', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function dead() {}\nmodule.exports = { dead };\n'],
    ['lib/b.js', 'console.log(undead, deadline);\n'],
  ]);
  const allFiles = ['lib/a.js', 'lib/b.js'];
  assert.strictEqual(isReferenced('dead', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), false);
});

// `$` is legal in a JS identifier (IDENTIFIER_RE accepts it) and is also a
// regex metacharacter. Without escapeRegExp the pattern for `a$b` reads as
// "a, end-of-line, b" and matches nothing, so the live symbol reports dead.
test('isReferenced: a `$` inside the symbol name is matched literally, not as a regex anchor', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function a$b() {}\nmodule.exports = { a$b };\n'],
    ['lib/caller.js', "const { a$b } = require('./a');\na$b();\n"],
  ]);
  const allFiles = ['lib/a.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('a$b', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), true);
});

// The two tests below pin why the boundaries are identifier-class lookarounds
// rather than `\b`: to the regex engine `$` is a NON-word character, so `\b`
// is wrong in both directions around it.

// Direction 1 (the forbidden one — a live symbol reported dead): `\b\$fn\b`
// matches nothing anywhere, because no word boundary exists before a `$`.
test('isReferenced: a symbol whose name starts with `$` is still found where it is used', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function $fn() {}\nmodule.exports = { $fn };\n'],
    ['lib/caller.js', "const { $fn } = require('./a');\n$fn();\n"],
  ]);
  const allFiles = ['lib/a.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('$fn', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), true);
});

// Direction 2 (the accepted one, fixed for free): `\bdead\b` DOES match inside
// `$dead`, since the `$`-to-`d` transition is a word boundary — so a distinct
// `$dead` identifier would mask a genuinely dead `dead`.
test('isReferenced: an unrelated `$`-prefixed identifier is not a use of the bare symbol', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function dead() {}\nmodule.exports = { dead };\n'],
    ['lib/b.js', 'console.log($dead);\n'],
  ]);
  const allFiles = ['lib/a.js', 'lib/b.js'];
  assert.strictEqual(isReferenced('dead', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), false);
});

const { isFileOrphan, referencedFileSpecifiers } = require('../candidates-dead-code');

// ── isFileOrphan ──────────────────────────────────────────────────────────────

test('isFileOrphan: a file required by another file (relative path, any depth) is not orphan', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'module.exports = {};\n'],
    ['bin/main.js', "const used = require('../lib/used');\n"],
  ]);
  const allFiles = ['lib/used.js', 'bin/main.js'];
  assert.strictEqual(isFileOrphan('lib/used.js', allFiles, contentsByFile), false);
});

test('isFileOrphan: a file nothing requires is orphan', () => {
  const contentsByFile = new Map([
    ['orphan.js', 'module.exports = { orphanFn: () => 1 };\n'],
    ['other.js', 'module.exports = {};\n'],
  ]);
  const allFiles = ['orphan.js', 'other.js'];
  assert.strictEqual(isFileOrphan('orphan.js', allFiles, contentsByFile), true);
});

test('isFileOrphan: a short basename is not falsely matched inside an unrelated longer name (no substring false-positive)', () => {
  const contentsByFile = new Map([
    ['a.js', "function fromA() {}\nmodule.exports = { fromA };\n"],
    ['barrel.js', "module.exports = { ...require('./a') };\n"],
    ['main.js', "const x = require('./barrel');\n"],
  ]);
  const allFiles = ['a.js', 'barrel.js', 'main.js'];
  // 'a' is a substring of 'barrel', 'main' etc. — must not count as a match
  // unless it is genuinely the last path segment of a require/import specifier.
  assert.strictEqual(isFileOrphan('a.js', allFiles, contentsByFile), false, 'a.js IS required (by barrel.js) — must not be orphan');
});

test('isFileOrphan: an ES-module `from` specifier also counts as a reference', () => {
  const contentsByFile = new Map([
    ['lib/util.js', 'export function helper() {}\n'],
    ['src/app.js', "import { helper } from '../lib/util.js';\n"],
  ]);
  const allFiles = ['lib/util.js', 'src/app.js'];
  assert.strictEqual(isFileOrphan('lib/util.js', allFiles, contentsByFile), false);
});

// The substring test above asserts `false` for a file that IS required, so it
// passes under a substring/`includes` comparison too — the very mutation its
// name describes. This is the discriminating half: 'a' is a substring of the
// only specifier in the tree ('./barrel'), and nothing requires a.js.
test('isFileOrphan: a file whose basename is merely a substring of another specifier is still orphan', () => {
  const contentsByFile = new Map([
    ['a.js', 'module.exports = { fromA: () => 1 };\n'],
    ['barrel.js', 'module.exports = {};\n'],
    ['main.js', "const x = require('./barrel');\n"],
  ]);
  const allFiles = ['a.js', 'barrel.js', 'main.js'];
  assert.strictEqual(isFileOrphan('a.js', allFiles, contentsByFile), true);
});

// Pins `if (other === relFile) continue;` — a file that names itself (a
// self-require, a commented-out import, a doc string) must not thereby prove
// its own liveness.
test('isFileOrphan: a file naming itself is not thereby referenced', () => {
  const contentsByFile = new Map([
    ['lib/self.js', "// historical: require('./self') was the old entry\nmodule.exports = {};\n"],
    ['lib/other.js', 'module.exports = {};\n'],
  ]);
  const allFiles = ['lib/self.js', 'lib/other.js'];
  assert.strictEqual(isFileOrphan('lib/self.js', allFiles, contentsByFile), true);
});

// A directory index is reached as `require('./lib')` — its own basename
// ('index') appears in no specifier anywhere. Matching on basename alone
// reports every such live file orphan, which is the forbidden direction.
test('isFileOrphan: a directory index reached as `require(\'./lib\')` is not orphan', () => {
  const contentsByFile = new Map([
    ['lib/index.js', 'module.exports = {};\n'],
    ['main.js', "const lib = require('./lib');\n"],
  ]);
  const allFiles = ['lib/index.js', 'main.js'];
  assert.strictEqual(isFileOrphan('lib/index.js', allFiles, contentsByFile), false);
});

// ...but the directory-name allowance is scoped to index files only: a
// non-index file must not be rescued by a specifier naming its directory.
test('isFileOrphan: a non-index file is not rescued by a specifier naming its directory', () => {
  const contentsByFile = new Map([
    ['lib/thing.js', 'module.exports = {};\n'],
    ['main.js', "const lib = require('./lib');\n"],
  ]);
  const allFiles = ['lib/thing.js', 'main.js'];
  assert.strictEqual(isFileOrphan('lib/thing.js', allFiles, contentsByFile), true);
});

// A side-effect-only static import has no `from` and no parenthesis, so the
// require/from/import( alternation alone misses it — again the forbidden
// direction (a live, imported file reported orphan).
test('isFileOrphan: a side-effect-only `import \'./x.js\'` counts as a reference', () => {
  const contentsByFile = new Map([
    ['polyfill.js', 'globalThis.x = 1;\n'],
    ['app.js', "import './polyfill.js';\n"],
  ]);
  const allFiles = ['polyfill.js', 'app.js'];
  assert.strictEqual(isFileOrphan('polyfill.js', allFiles, contentsByFile), false);
});

test('isFileOrphan: a file listed in allFiles but absent from contentsByFile is skipped, not crashed on', () => {
  const contentsByFile = new Map([['b.js', "const a = require('./a');\n"]]);
  const allFiles = ['a.js', 'b.js', 'unread.js'];
  assert.strictEqual(isFileOrphan('a.js', allFiles, contentsByFile), false);
});

// ── referencedFileSpecifiers ──────────────────────────────────────────────────

test('referencedFileSpecifiers: finds require, static import, side-effect import, dynamic import, and from specifiers', () => {
  const text = [
    "const a = require('./a');",
    "import { b } from '../b.js';",
    "import './side-effect.js';",
    "const c = await import(`./c.js`);",
    "export * from './d';",
    'const dynamic = require(dirName + suffix);',
  ].join('\n');
  assert.deepStrictEqual(referencedFileSpecifiers(text), ['./a', '../b.js', './side-effect.js', './c.js', './d']);
});
