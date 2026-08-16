// tests/merge-verification.test.js — schema shape, PR-CI detection, the
// four-branch derivation ladder, and CLI wiring for the merge-verification
// policy key (#559). Inline/temp fixtures only — never reads this repo's live
// .claude-tweaks/policy.yml (IL-80). Fixture repos are built under os.tmpdir()
// so `git rev-parse --show-toplevel` never resolves THIS repo.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { POLICY_KEYS, resolvePolicyKeys } = require('../bin/lib/policy-schema');

const CLI = path.join(__dirname, '..', 'bin', 'resolve-policy.js');
const REPO_ROOT = path.join(__dirname, '..');
const VALUES = ['merge-when-green', 'wait', 'off'];

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// --- Schema shape ---

test('merge-verification is registered as an enum with the three values and no static default', () => {
  const entry = POLICY_KEYS.find((e) => e.key === 'merge-verification');
  assert.ok(entry, 'merge-verification must be registered in POLICY_KEYS');
  assert.equal(entry.type, 'enum');
  assert.deepEqual(entry.values, VALUES);
  assert.equal(entry.default, undefined, 'a static default would bypass the derivation ladder entirely');
  assert.equal(entry.category, 'merge-safety');
});

test('resolvePolicyKeys stays pure for merge-verification — unset resolves to null/default, explicit value verbatim', () => {
  const unset = resolvePolicyKeys(['merge-verification'], { policyRaw: null, runConfigRaw: null });
  assert.deepEqual(unset['merge-verification'], { value: null, source: 'default' });
  const set = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: wait\n', runConfigRaw: null });
  assert.deepEqual(set['merge-verification'], { value: 'wait', source: 'policy' });
  const bad = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: sideways\n', runConfigRaw: null });
  assert.deepEqual(bad['merge-verification'], { value: null, source: 'default', invalid: true });
});

// --- PR-CI detection ---

const mv = require('../bin/lib/merge-verification');

test('workflowHasPullRequestTrigger: every legal on: shape that names pull_request(_target)', () => {
  const yes = [
    'name: a\non: pull_request\njobs: {}\n',
    'name: a\non: pull_request_target\n',
    "name: a\n'on': pull_request\n",
    'name: a\n"on": [push, pull_request]\n',
    'name: a\non: [push, pull_request]\n',
    'name: a\non: [ push , "pull_request" ]\n',
    'name: a\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs: {}\n',
    'name: a\non:\n  pull_request:\n    types: [opened]\n',
    'name: a\non:\n  - push\n  - pull_request\n',
    'name: a\non: { pull_request: { branches: [main] } }\n',
    'name: a\n\n# comment\non:\n  # leading comment inside the block\n  pull_request_target:\n',
  ];
  for (const text of yes) assert.equal(mv.workflowHasPullRequestTrigger(text), true, JSON.stringify(text));
});

test('workflowHasPullRequestTrigger: push-only, nested-only, and no on: block do not count', () => {
  const no = [
    'name: a\non: push\n',
    'name: a\non: [push, workflow_dispatch]\n',
    'name: a\non:\n  push:\n    branches: [main]\n  schedule:\n    - cron: "0 0 * * *"\n',
    // pull_request appearing only as a NESTED key (deeper than the trigger level) is not a trigger
    'name: a\non:\n  push:\n    pull_request: nonsense\n',
    // a job step mentioning pull_request is not a trigger
    'name: a\non: push\njobs:\n  x:\n    steps:\n      - run: echo pull_request\n',
    'name: a\njobs: {}\n',
    '',
  ];
  for (const text of no) assert.equal(mv.workflowHasPullRequestTrigger(text), false, JSON.stringify(text));
});

test('hasPullRequestCi: injected reader — any workflow with a PR trigger counts; none, empty dir, or a throwing reader do not', () => {
  const two = () => [{ name: 'a.yml', text: 'on: push\n' }, { name: 'b.yaml', text: 'on: [push, pull_request]\n' }];
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: two }), true);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => [{ name: 'a.yml', text: 'on: push\n' }] }), false);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => [] }), false);
  assert.equal(mv.hasPullRequestCi('/nonexistent', { readWorkflows: () => { throw new Error('EACCES'); } }), false, 'read failure resolves toward off');
});

test('readWorkflowFiles: reads .yml and .yaml under .github/workflows, [] when the dir is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mv-wf-'));
  tempDirs.push(dir);
  assert.deepEqual(mv.readWorkflowFiles(dir), []);
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'a.yml'), 'on: push\n');
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'b.yaml'), 'on: pull_request\n');
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'README.md'), 'not a workflow\n');
  const files = mv.readWorkflowFiles(dir).map((f) => f.name).sort();
  assert.deepEqual(files, ['a.yml', 'b.yaml']);
  assert.equal(mv.hasPullRequestCi(dir), true);
});
