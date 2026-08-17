'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #857: reflect's standalone Frontier singleton reads the transcript via the
// shared transcript-judge harness (skills/_shared/transcript-judge.md, #856).
// Pins the dispatch-prompt additions, the watermark write timing/payload,
// the degradation binding, and the component-invoked path staying
// unaffected. Sibling #858 extends this same file with the finding-shape
// (Evidence:/Cost this session:) pins.
//
// Read live, not frozen fixtures — same posture as
// tests/transcript-judge-prose.test.js: just-shipped prose expected to keep
// evolving in place, not content scheduled for deletion.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SKILL = read('plugin', 'skills', 'reflect', 'SKILL.md');

// --- 1. Step 2 cites _shared/transcript-judge.md with consumer key reflect ---

test('reflect SKILL.md Step 2 cites _shared/transcript-judge.md', () => {
  assert.match(SKILL, /_shared\/transcript-judge\.md/);
});

test('reflect SKILL.md Step 2 names the reflect watermark consumer key', () => {
  assert.match(SKILL, /consumer key `reflect`/);
});

// --- 2. Dispatch prompt gains the transcript path, cross-session scope statement, and offset clause ---

test('reflect SKILL.md documents the transcript path immediately followed by the cross-session coverage-limit scope statement', () => {
  assert.match(
    SKILL,
    /the resolved transcript path, immediately followed by the shared contract's cross-session coverage-limit scope statement/,
  );
});

test('reflect SKILL.md documents the conditional watermark offset clause via readWatermark with consumer: reflect', () => {
  assert.match(SKILL, /`readWatermark\(path, \{ consumer: 'reflect' \}\)` returns non-null/);
});

// --- 3. Watermark write timing: captured before dispatch, written after Step 3, gated on status ---

test('reflect SKILL.md documents bytesAtDispatch captured before dispatch and write after Step 3 routing', () => {
  assert.match(SKILL, /Capture `bytesAtDispatch` before dispatch and the judge's return status at return time/);
  assert.match(SKILL, /The write itself executes \*\*after\*\* Step 3 routing completes/);
});

test('reflect SKILL.md documents the watermark write is gated on DONE\\/DONE_WITH_CONCERNS only', () => {
  assert.match(SKILL, /gated on that captured status being `DONE`\/`DONE_WITH_CONCERNS`/);
});

test('reflect SKILL.md documents the reflect-specific filedRecords payload (routed-insight summaries)', () => {
  assert.match(
    SKILL,
    /filedRecords` holds one short summary per insight that Step 3 resolved to a \*\*durable routed outcome\*\*/,
  );
});

// --- 4. Degradation binding names the shared self-assessment path ---

test('reflect SKILL.md documents the degradation binding to the shared self-assessment path', () => {
  assert.match(SKILL, /A transcript-resolution failure or a terminal dispatch failure resolves to the existing inline lens procedure/);
  assert.match(SKILL, /\(self-assessment\)` header tags on each block and the `record-failure` clause/);
});

// Degradation equivalence (AC6): the degradation binding and the
// component-invoked path both resolve to the SAME inline lens procedure —
// pin that both paths' surrounding sentences name "the existing inline lens
// procedure" / "the inline lens procedure a parent skill's ... signal
// selects", not two different procedures under two different names.
test('reflect SKILL.md: degradation fallback and component-invoked path both name the same inline lens procedure (equivalence pinned, not assumed)', () => {
  assert.match(SKILL, /resolves to the existing inline lens procedure — named, per `_shared\/transcript-judge\.md`'s self-assessment path/);
  assert.match(
    SKILL,
    /the transcript-judge integration is exclusively a property of the standalone singleton dispatch, never of the inline lens procedure a parent skill's `\$PIPELINE_RUN_DIR`\/`--source` signal selects/,
  );
});

// --- 5. Component-invoked branch carries no transcript/watermark instruction ---

test('reflect SKILL.md: component-invoked path is stated as unaffected — no dispatch, no transcript read, no watermark', () => {
  assert.match(SKILL, /\*\*Component-invoked path is unaffected\.\*\* No dispatch, no transcript read, no watermark read or write/);
});

// The transcript-judge integration paragraphs must sit strictly between the
// standalone singleton dispatch sentence and Step 3 — never inside the
// Component-Skill Contract's component-invoked branch description, which
// would wrongly imply the component-invoked path also reads a transcript.
test('reflect SKILL.md: transcript-judge integration paragraphs are scoped to the standalone singleton, not the component-invoked branch', () => {
  const singleton = SKILL.indexOf('**Standalone-only `[Use: Frontier]` singleton');
  const integration = SKILL.indexOf('**Transcript-judge integration (record #857).**');
  const step3 = SKILL.indexOf('## Step 3: Route Findings');
  assert.ok(singleton > 0, 'standalone singleton paragraph must exist');
  assert.ok(integration > singleton, 'transcript-judge integration must come after the singleton paragraph');
  assert.ok(step3 > integration, 'transcript-judge integration must come before Step 3');
});
