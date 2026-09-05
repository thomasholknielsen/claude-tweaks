// tests/hooks-subagent-stop.test.js
//
// E3's SubagentStop status-line detector (#1596): a third-party agent (one
// whose `agent_type` carries a plugin-namespace prefix other than this
// plugin's own "claude-tweaks") is exempt from the Subagent Contract
// entirely (subagent-output-contract.md's Exemption section) — it was never
// given the status-line format, so a malformed-looking reply from it is not
// evidence of anything. This module previously had no exemption check at
// all: every malformed reply was logged as a `contract-violation` event
// regardless of which agent produced it, which is exactly the false-positive
// gap the contract's own prose ("A logged contract-violation is evidence to
// read, not a confirmed violation") tells a human reader to triage around by
// hand. This suite pins the exemption at the detector itself.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const subagentStop = require('../plugin/bin/lib/hooks/subagent-stop');

function tmpRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-subagent-stop-test-'));
}

function writeTranscript(dir, lastAssistantText) {
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const line = JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: lastAssistantText }] } });
  fs.writeFileSync(transcriptPath, line + '\n');
  return transcriptPath;
}

test('isExemptAgentType: true for a third-party plugin-namespaced agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('code-simplifier:code-simplifier'), true);
  assert.strictEqual(subagentStop.isExemptAgentType('impeccable:impeccable-finish-reviewer'), true);
});

test('isExemptAgentType: false for this plugin\'s own namespaced agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('claude-tweaks:qa-agent'), false);
});

test('isExemptAgentType: false for a bare harness built-in type (no namespace)', () => {
  assert.strictEqual(subagentStop.isExemptAgentType('general-purpose'), false);
  assert.strictEqual(subagentStop.isExemptAgentType('Explore'), false);
});

test('isExemptAgentType: false for a missing/non-string agent_type', () => {
  assert.strictEqual(subagentStop.isExemptAgentType(undefined), false);
  assert.strictEqual(subagentStop.isExemptAgentType(null), false);
});

test('run: does not log a contract-violation for an exempt third-party agent_type, even with malformed text', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'Based on my review, the file looks fine.');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'code-simplifier:code-simplifier' },
  };
  const out = subagentStop.run(ctx);
  assert.deepStrictEqual(out, {});
  assert.ok(!fs.existsSync(path.join(runDir, 'events.jsonl')), 'expected no events.jsonl to be written for an exempt agent');
});

test('run: still logs a contract-violation for a non-exempt agent_type with malformed text', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'Based on my review, DONE');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'general-purpose' },
  };
  const out = subagentStop.run(ctx);
  assert.ok(out.json && typeof out.json.systemMessage === 'string');
  const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8');
  assert.match(events, /contract-violation/);
});

test('run: no-op for a well-formed status line, regardless of agent_type', () => {
  const runDir = tmpRunDir();
  const transcriptPath = writeTranscript(runDir, 'DONE\nNo findings.');
  const ctx = {
    ownedRun: { dir: runDir, attribution: 'session' },
    input: { agent_transcript_path: transcriptPath, agent_type: 'general-purpose' },
  };
  const out = subagentStop.run(ctx);
  assert.deepStrictEqual(out, {});
});

test('run: unaffected by exemption logic when there is no owned run (existing no-op path)', () => {
  const ctx = { ownedRun: {}, input: { agent_type: 'code-simplifier:code-simplifier' } };
  assert.deepStrictEqual(subagentStop.run(ctx), {});
});
