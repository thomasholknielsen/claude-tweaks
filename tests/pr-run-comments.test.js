'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #410: PR as run surface — verdict/brief/failure comments on the PR, the
// failure tombstone, and PR-state reads in /help and /tidy. Prose-as-
// implementation, same convention as pr-early-run-lifecycle.test.js — pin
// the key claims against the actual file text so the doc can't silently
// drift from what it promises.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const COMMENTS = read('plugin', 'skills', '_shared', 'pr-run-comments.md');
const LIFECYCLE = read('plugin', 'skills', '_shared', 'pr-early-run-lifecycle.md');
const SETTLE = read('plugin', 'skills', 'dispatch', 'settle-and-merge.md');
const BRIEF = read('plugin', 'skills', 'wrap-up', 'verification-brief.md');
const WRAP_EXEC = read('plugin', 'skills', 'wrap-up', 'execution-and-verification.md');
// /review's Step 7 (verdict comment) lives in the code-mode-steps.md sub-file since the
// #887 dispatcher split — concatenate so this asserts against the documented text wherever
// it currently lives, same pattern as multi-agent-coordination.test.js's REVIEW_SKILL.
const REVIEW_SKILL =
  read('plugin', 'skills', 'review', 'SKILL.md') +
  '\n' +
  read('plugin', 'skills', 'review', 'code-mode-steps.md');
const STATUS_SCAN = read('plugin', 'skills', 'help', 'status-scan.md');
const SCAN_PROCEDURES = read('plugin', 'skills', 'tidy', 'scan-procedures.md');
const SESSION_START = read('plugin', 'bin', 'lib', 'hooks', 'session-start.js');

test('the pr-first gate is one condition, stated once, in pr-run-comments.md', () => {
  assert.match(COMMENTS, /run-state\.json.*carries a `pr` object/);
  assert.match(COMMENTS, /retryable failure.*never conflated with "no PR"/);
});

test('all three comment kinds carry a distinct marker as the first line', () => {
  for (const marker of ['<!-- run-comment: verdict -->', '<!-- run-comment: brief -->', '<!-- run-comment: failure -->']) {
    assert.ok(COMMENTS.includes(marker), `pr-run-comments.md missing kind marker: ${marker}`);
  }
});

test('the post-or-update procedure finds by marker via GraphQL node id, never a REST numeric id', () => {
  assert.match(COMMENTS, /gh pr view \{pr-number\} --repo \{owner\}\/\{repo\} --json comments/);
  assert.match(COMMENTS, /updateIssueComment\(input:\{id:\$id,body:\$body\}\)/);
  assert.match(
    COMMENTS,
    /not a REST numeric ID/,
    'this is the reason the update step is a GraphQL mutation instead of a REST PATCH to issues/comments/{id}',
  );
});

test('one comment per kind per run — re-runs edit in place, never append a duplicate', () => {
  assert.match(COMMENTS, /One comment per kind per run/);
  assert.match(COMMENTS, /it never appends a duplicate/);
});

test('retry-ceiling counting is called out as reading from the PR, not the issue, under the gate', () => {
  assert.match(
    COMMENTS,
    /Retry-ceiling \*\*counting\*\*.*reads from the \*\*PR's\*\* comments under this gate, not the issue's/s,
  );
});

test('pr-early-run-lifecycle.md reopens a closed-unmerged PR on retry before falling back to recreate', () => {
  assert.match(LIFECYCLE, /gh pr reopen \{number\} --repo \{owner\}\/\{repo\}/);
  assert.match(LIFECYCLE, /Reopen fails.*fall through to creation below/s);
  assert.match(
    LIFECYCLE,
    /A match with `state: MERGED`.*Treat\s*\n?\s*as no match and fall through to creation/s,
  );
});

test('settle-and-merge.md routes the retry-ceiling comment fetch to the PR when run-state carries one', () => {
  assert.match(SETTLE, /Comment source routes on the pr-first gate/);
  assert.match(SETTLE, /repos\/\{owner\}\/\{repo\}\/issues\/\{pr-number\}\/comments/);
});

test('settle-and-merge.md posts the failure tombstone to the PR and closes it, content unchanged', () => {
  assert.match(SETTLE, /this is the failure tombstone/);
  assert.match(SETTLE, /gh pr close \{pr-number\} --repo \{owner\}\/\{repo\}/);
  assert.match(SETTLE, /Leave\s*\n?\s*the branch and worktree in place/);
});

test('settle-and-merge.md posts the trust-negative-evidence marker to the issue separately via extractNegativeEvidenceMarker', () => {
  assert.match(SETTLE, /extractNegativeEvidenceMarker/);
  assert.match(SETTLE, /bin\/lib\/issues\/trust\.js.*reads only the record\s*\n?\s*issue's comments and is not modified/s);
});

test('verification-brief.md routes the full brief to the PR and leaves a one-line pointer on the issue', () => {
  assert.match(BRIEF, /the full brief moves to the PR; the issue keeps a one-line pointer/);
  assert.match(BRIEF, /Verification Brief posted to PR #\{pr-number\}: \{pr-url\}/);
  assert.match(
    BRIEF,
    /Acceptance labeling\s*\nstays on the issue either way/,
    'demo:pending must still land on the issue regardless of where the brief content lives',
  );
});

test('wrap-up execution-and-verification.md verifies the pointer-plus-PR-brief shape under pr-first, not just the issue-only shape', () => {
  assert.match(WRAP_EXEC, /the issue's last comment is the one-line PR pointer/);
  assert.match(WRAP_EXEC, /run-comment: brief/);
});

test('review/SKILL.md posts a verdict comment reusing the findings-table shape, gated on the pr object', () => {
  assert.match(REVIEW_SKILL, /run-comment: verdict/);
  assert.match(REVIEW_SKILL, /top findings by severity \(max 5\)/);
  assert.match(REVIEW_SKILL, /Category \| Finding \| Severity \| Action/);
});

test("help/status-scan.md's PR-state join never uses the search index, only a plain bounded list", () => {
  const section = STATUS_SCAN.split('### PR-state join')[1].split('### Conflict detection')[0];
  assert.match(section, /gh pr list --repo \{owner\}\/\{repo\} --state all --limit 100/);
  const fencedCommands = [...section.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(
    fencedCommands,
    /--search/,
    'the PR-state join section\'s actual commands (not its explanatory prose) must never issue a real --search invocation',
  );
});

test("help/status-scan.md distinguishes a closed run from open/merged and flags it in Needs Attention", () => {
  assert.match(STATUS_SCAN, /state: CLOSED.*unmerged/);
  assert.match(STATUS_SCAN, /likely tombstoned/);
});

test("tidy/scan-procedures.md's PR-state override distinguishes tombstoned from abandoned by the failure marker", () => {
  assert.match(SCAN_PROCEDURES, /Non-empty result → tombstoned/);
  assert.match(SCAN_PROCEDURES, /Empty result → abandoned/);
  assert.match(
    SCAN_PROCEDURES,
    /Never auto-remove either case/,
    '/tidy must never escalate a manual-review row to a destructive delete on its own',
  );
});

test("tidy's tombstone row explicitly agrees with the reconciler's own never-reap rule instead of contradicting it", () => {
  assert.match(SCAN_PROCEDURES, /same as `bin\/lib\/reconcile\/reap-merged\.js`'s own `pr-closed-unmerged` skip decision/);
});

test('session-start.js appends the recorded PR URL to a stale-run line only when run-state carries one', () => {
  assert.match(SESSION_START, /state && state\.pr && state\.pr\.url/);
  assert.match(SESSION_START, /\$\{prSuffix\}/);
});
