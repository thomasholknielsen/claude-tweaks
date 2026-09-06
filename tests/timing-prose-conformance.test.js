// tests/timing-prose-conformance.test.js — #1928 prose pins.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('#1928: multi-spec.md cites the run-dir layout sub-file and stays under its read budget', () => {
  const ms = read('plugin/skills/flow/multi-spec.md');
  assert.match(ms, /multispec-run-dir-layout\.md/);
  assert.ok(Buffer.byteLength(ms, 'utf8') < 20480, `multi-spec.md is ${Buffer.byteLength(ms, 'utf8')} B`);
  assert.match(ms, /\$RUN_ROOT\/\.claude-tweaks\/pipelines\/\{ISO-timestamp\}-spec-\{N1\}-\{N2\}-\{N3\}\//, 'the anchoring diagram stays in multi-spec.md');
});

test('#1928: the layout sub-file documents manifest.yml phases[] and the latest phase', () => {
  const sub = read('plugin/skills/flow/multispec-run-dir-layout.md');
  assert.match(sub, /phases:\s*\n\s+- phase: /, 'the YAML example shows the phases[] list');
  assert.match(sub, /`phases\[\]`[^.]*append-only|append-only[^.]*`phases\[\]`/i);
  assert.match(sub, /spec-status/);
});
