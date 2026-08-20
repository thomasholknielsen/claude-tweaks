'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Guard against #859's hazard class: a stray non-UTF8/NUL byte in a payload file makes
// `git diff` render it as binary and plain `grep` silently skip it — every sweep then needs
// a special-cased `grep -a`. Live-corpus scan over `plugin/` (the shipped payload subtree,
// per CLAUDE.md's Structure section — "nothing else in this repo ships"), deliberately not a
// frozen fixture: the point is to catch a *future* stray byte, not to pin today's corpus.

const ROOT = path.join(__dirname, '..');
const PAYLOAD_DIR = path.join(ROOT, 'plugin');

function findPayloadFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findPayloadFiles(full));
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// A NUL byte is technically decodable as valid UTF-8 (U+0000), so a decode-only check would
// miss exactly the hazard this guard exists for — check for it explicitly, in addition to
// the general well-formedness decode.
function isValidUtf8NoNul(buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

// --- Proof the check can go red (synthetic fixture, per skill-prose-conformance-tests'
// go-red guidance) ---

test('isValidUtf8NoNul: flags a planted NUL byte', () => {
  const planted = Buffer.from('const x = 1;\n\x00\nmodule.exports = x;\n', 'binary');
  assert.strictEqual(isValidUtf8NoNul(planted), false);
});

test('isValidUtf8NoNul: flags a malformed UTF-8 byte sequence', () => {
  const malformed = Buffer.from([0x68, 0x69, 0xff, 0xfe, 0x0a]); // "hi" + invalid bytes
  assert.strictEqual(isValidUtf8NoNul(malformed), false);
});

test('isValidUtf8NoNul: passes plain UTF-8 text, including multi-byte characters', () => {
  const clean = Buffer.from('# Title\n\nSome prose with an emoji 🎉 and é.\n', 'utf8');
  assert.strictEqual(isValidUtf8NoNul(clean), true);
});

test('a planted NUL byte in a real payload file fails the live sweep', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-utf8-plant-'));
  try {
    const file = path.join(tmpDir, 'planted.js');
    fs.writeFileSync(file, Buffer.from("const x = 'a\x00b';\n", 'binary'));
    const buffer = fs.readFileSync(file);
    assert.strictEqual(isValidUtf8NoNul(buffer), false, 'planted NUL must be caught');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Live-corpus sweep ---

test('every plugin/**/*.js and plugin/**/*.md file is valid UTF-8 with no NUL byte', () => {
  const files = findPayloadFiles(PAYLOAD_DIR);
  assert.ok(files.length > 0, 'sanity: the payload sweep must find files to check');
  const failures = [];
  for (const file of files) {
    const buffer = fs.readFileSync(file);
    if (!isValidUtf8NoNul(buffer)) {
      failures.push(path.relative(ROOT, file));
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    `Payload file(s) with a stray NUL byte or invalid UTF-8 (see #859): ${failures.join(', ')}`,
  );
});
