'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// #667: no test executes markdown-embedded `node -e` snippets in skills/**/*.md
// (e.g. `skills/capture/SKILL.md`'s born-ready block) — #647's snippet migration was
// verified only by a reviewer's manual read. This is a live-corpus conformance sweep:
// extract every bash-fenced `node -e "..."` / `node -e '...'` block under
// plugin/skills/**/*.md and syntax-check the embedded JS, pinning zero syntax errors.
//
// Reuses tests/sweep-backstop.test.js's extraction idea (regex-match `node -e "..."`,
// unescape the shell-double-quoted body, `node --check` the result) generalized to the
// whole skills corpus: both quote styles, single-line and multi-line forms, scoped to
// ```bash fences only (every occurrence in the corpus lives in one — see the live sweep
// below, which would fail loudly if that ever stopped being true).

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');

function findMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findMarkdownFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Un-escape a bash double-quoted string's own escape set: \\, \$, \`, \" each collapse
// to the literal character; any other backslash is left untouched (bash's own rule for
// what it strips inside "..."). Single quotes need no unescaping — bash allows no
// escapes inside '...' at all, so their body is already the literal JS source text.
function unescapeDoubleQuoted(s) {
  return s.replace(/\\([\\$`"])/g, '$1');
}

// Extract every `node -e "..."` / `node -e '...'` invocation from within ```bash fences.
// Handles both quote styles and both single-line and multi-line forms with one regex
// per style (character classes match newlines by default, so no /s flag is needed).
function extractNodeEScripts(markdown) {
  const scripts = [];
  const fenceRe = /```bash\n([\s\S]*?)```/g;
  let fence;
  while ((fence = fenceRe.exec(markdown)) !== null) {
    const block = fence[1];
    const doubleQuoted = /node -e "((?:\\.|[^"\\])*)"/g;
    let m;
    while ((m = doubleQuoted.exec(block)) !== null) scripts.push(unescapeDoubleQuoted(m[1]));
    const singleQuoted = /node -e '([^']*)'/g;
    while ((m = singleQuoted.exec(block)) !== null) scripts.push(m[1]);
  }
  return scripts;
}

// A handful of these snippets embed bash-side substitution the surrounding skill's own
// shell context resolves before node ever sees the text — a JSON blob spliced in via
// `${LABELS_JSON}`, a `$(...)` command substitution, or (rarely) a bare `/* elided */;`
// documentation placeholder standing in for a value spelled out elsewhere in the same
// skill file. None of these are runtime concerns for a syntax-only check (`node --check`
// never executes the body), but the *literal* text isn't valid JS on its own — swap in a
// syntactically inert placeholder so the check still proves the surrounding JS structure
// is well-formed. This mirrors the Gotchas' `process.argv` placeholder-substitution
// guidance, generalized to the other elision idioms actually present in the corpus.
// Deliberately narrow: `${IDENTIFIER}` only matches simple bare bash variable names
// (letters/digits/underscore, no `.`/`[`), so it never touches a genuine JS
// template-literal expression like `${process.argv[1]}` — those already parse as valid
// JS and need no substitution.
function substituteShellPlaceholders(script) {
  let out = script;
  out = out.replace(/=\s*\/\*[\s\S]*?\*\/\s*;/g, '= null;');
  out = out.replace(/\$\([^()]*\)/g, 'null');
  out = out.replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, 'null');
  return out;
}

function checkSyntax(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-node-e-syntax-'));
  const file = path.join(dir, 'snippet.js');
  fs.writeFileSync(file, substituteShellPlaceholders(script));
  try {
    execFileSync('node', ['--check', file], { stdio: 'pipe' });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.stderr ? err.stderr.toString() : String(err) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- Proof the check can go red (synthetic fixtures, per skill-prose-conformance-tests'
// go-red guidance — a check that can never fail proves nothing) ---

test('extractNodeEScripts: finds a double-quoted multi-line node -e block inside a bash fence', () => {
  const md = [
    '```bash',
    'node -e "',
    '  console.log(1)',
    '"',
    '```',
  ].join('\n');
  const scripts = extractNodeEScripts(md);
  assert.strictEqual(scripts.length, 1);
  assert.match(scripts[0], /console\.log\(1\)/);
});

test('extractNodeEScripts: finds a single-quoted single-line node -e block', () => {
  const md = '```bash\nVERDICT=$(node -e \'console.log("hi")\')\n```';
  const scripts = extractNodeEScripts(md);
  assert.strictEqual(scripts.length, 1);
  assert.match(scripts[0], /console\.log\("hi"\)/);
});

test('extractNodeEScripts: ignores node -e text outside a ```bash fence', () => {
  const md = 'Some prose mentioning `node -e "console.log(1)"` inline, not fenced.';
  assert.deepStrictEqual(extractNodeEScripts(md), []);
});

test('unescapeDoubleQuoted: collapses \\", \\$, \\\\, and \\` but leaves other backslashes untouched', () => {
  assert.strictEqual(unescapeDoubleQuoted('say \\"hi\\"'), 'say "hi"');
  assert.strictEqual(unescapeDoubleQuoted('\\${process.argv[1]}'), '${process.argv[1]}');
  assert.strictEqual(unescapeDoubleQuoted('a\\\\b'), 'a\\b');
  assert.strictEqual(unescapeDoubleQuoted('\\n'), '\\n');
});

test('checkSyntax: a syntactically invalid snippet is caught (planted fixture)', () => {
  const result = checkSyntax('const x = ;');
  assert.strictEqual(result.ok, false);
  assert.match(result.message, /SyntaxError/);
});

test('checkSyntax: negative control — the same shape with a valid expression passes', () => {
  const result = checkSyntax('const x = 1;');
  assert.strictEqual(result.ok, true);
});

test('checkSyntax: a valid snippet using process.argv (no substitution needed) passes', () => {
  const result = checkSyntax('console.log(process.argv[1]);');
  assert.strictEqual(result.ok, true);
});

test('substituteShellPlaceholders: neutralizes a bash ${VAR} splice into a valid placeholder', () => {
  const result = checkSyntax('const labels = ${LABELS_JSON};');
  assert.strictEqual(result.ok, true);
});

test('substituteShellPlaceholders: neutralizes a $(...) command substitution', () => {
  const result = checkSyntax('const enabled = $(echo true);');
  assert.strictEqual(result.ok, true);
});

test('substituteShellPlaceholders: neutralizes an elided-value doc comment used as an expression', () => {
  const result = checkSyntax('const keyFiles = /* parsed elsewhere */;');
  assert.strictEqual(result.ok, true);
});

test('substituteShellPlaceholders: never touches a JS template-literal expression', () => {
  const result = checkSyntax('console.log(`id: ${process.argv[1]}`);');
  assert.strictEqual(result.ok, true);
});

// --- Live-corpus sweep ---

test('every node -e script embedded in a plugin/skills/**/*.md bash fence is syntactically valid', () => {
  const files = findMarkdownFiles(SKILLS_DIR);
  assert.ok(files.length > 0, 'sanity: the skills sweep must find files to check');

  let scriptCount = 0;
  const failures = [];
  for (const file of files) {
    const markdown = fs.readFileSync(file, 'utf8');
    const scripts = extractNodeEScripts(markdown);
    scriptCount += scripts.length;
    for (const [index, script] of scripts.entries()) {
      const result = checkSyntax(script);
      if (!result.ok) {
        failures.push(`${path.relative(ROOT, file)} (snippet #${index}): ${result.message.split('\n')[0]}`);
      }
    }
  }

  assert.ok(scriptCount > 0, 'sanity: the skills sweep must find at least one node -e snippet');
  assert.deepStrictEqual(failures, [], `node -e syntax error(s):\n${failures.join('\n')}`);
});
