const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installWrapper, buildWrapperSource } = require('../bin/install-statusline-wrapper.js');

test('installWrapper writes the wrapper script under the injected homedir, not the real home', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-install-sl-'));

  const targetPath = installWrapper(tmpHome);

  const expectedPath = path.join(tmpHome, '.claude-tweaks', 'bin', 'statusline.js');
  assert.strictEqual(targetPath, expectedPath);
  assert.ok(fs.existsSync(expectedPath), 'wrapper file should exist under the temp homedir');

  const contents = fs.readFileSync(expectedPath, 'utf8');
  assert.strictEqual(contents, buildWrapperSource());
  assert.match(contents, /^#!\/usr\/bin\/env node/);
  assert.match(contents, /claude-tweaks statusline wrapper/);

  const stat = fs.statSync(expectedPath);
  assert.strictEqual(stat.mode & 0o777, 0o755);

  fs.rmSync(tmpHome, { recursive: true, force: true });
});

test('installWrapper creates the target directory recursively when it does not exist', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-install-sl-'));
  const binDir = path.join(tmpHome, '.claude-tweaks', 'bin');

  assert.ok(!fs.existsSync(binDir), 'bin dir should not exist before install');

  installWrapper(tmpHome);

  assert.ok(fs.existsSync(binDir));
  assert.ok(fs.statSync(binDir).isDirectory());

  fs.rmSync(tmpHome, { recursive: true, force: true });
});
