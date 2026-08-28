// tests/session-tmp-root-migration.test.js
//
// Pins #266's migration: the 4 named skill families (specify, dispatch,
// backlog, assess-agent-autonomy) plus the two directly-chained backlog
// files (attention-mode.md, trust-signal.md) discovered by reference during
// the build, no longer hardcode an unscoped /tmp/{skill}-*.{json,md,txt}
// path -- every one resolves through bin/lib/session-tmp.js's
// sessionTmpPath, citing _shared/session-tmp-root.md. _shared/trust-table.md
// itself (#1386's follow-up migration) is also pinned here now, alongside the
// backlog/trust-signal.md consumer that reads its intermediate files.
//
// AC1's grep is repo-wide (`skills/`); this test scopes to the files each
// migration record actually touched. #923 closed the follow-up named above
// -- the four health-sweep skills, wrap-up/*, tidy/capture/help/init, and
// the remaining shared _shared/ scan-procedure files -- so their migrated
// files are pinned here too, alongside #266's original set.

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'plugin', 'skills');

const MIGRATED_FILES = [
  'specify/decomposition-mode.md',
  'specify/record-creation.md',
  'specify/shaping-mode.md',
  'dispatch/queue-pull-script.md',
  '_shared/headless-self-report.md',
  'dispatch/settle-and-merge.md',
  'dispatch/SKILL.md',
  'backlog/overview-mode.md',
  'backlog/refine-mode.md',
  'backlog/refine-lanes.md',
  'backlog/grant-mode.md',
  'backlog/attention-mode.md',
  'backlog/trust-signal.md',
  'assess-agent-autonomy/grant-check.md',
  '_shared/trust-table.md',
  // #923's remaining skills/** sweep:
  '_shared/github-pr-scan-acceptance.md',
  '_shared/github-pr-scan.md',
  '_shared/harness-health-analysis.md',
  '_shared/label-bootstrap.md',
  'capture/SKILL.md',
  'code-health/SKILL.md',
  'code-health/filing.md',
  'code-health/focus-mode.md',
  'docs-health/SKILL.md',
  'harness-health/SKILL.md',
  'harness-health/filing.md',
  'harness-health/judge-procedure.md',
  'help/status-scan.md',
  'init/bootstrap/step-14-cloud-routine-parity.md',
  'journey-health/SKILL.md',
  'specify/next-mode.md',
  'tidy/step-1-records.md',
  'wrap-up/SKILL.md',
  'wrap-up/docs-health-integration.md',
  'wrap-up/leftover-routing.md',
  'wrap-up/unblocked-records.md',
  'wrap-up/verification-brief-parent-gate.md',
];

// Matches a literal, unscoped /tmp/{prefix}-*.{ext} path -- the shape this
// record eliminates. Excludes the sanctioned os.tmpdir()-based degrade
// fallback (no literal '/tmp/' substring appears there at all) and the
// unrelated session-snapshot path (ct-records-{session-id}.json, already
// session-scoped by construction, not this record's concern).
const LITERAL_TMP_RE = /\/tmp\/(?!ct-)[a-z][a-z0-9-]*-[a-z0-9-]*\.(json|md|txt|graphql|err|jsonl)/;

test('every migrated file cites _shared/session-tmp-root.md', () => {
  for (const rel of MIGRATED_FILES) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(text, /session-tmp-root\.md/, `${rel} must cite _shared/session-tmp-root.md`);
  }
});

// backlog/trust-signal.md previously referenced two /tmp/trust-table-*.{json,txt} paths
// that _shared/trust-table.md's Fetch section itself owns and writes (shared across many
// consumers beyond backlog: /tidy, /visualize, /capture, ...). That follow-up (#1386) has
// since migrated trust-table.md's own Fetch section, and trust-signal.md along with it, so
// no exception is needed here any more -- both files resolve every intermediate path
// through the session scratchpad.

test('no migrated file retains a literal unscoped /tmp/{prefix}-*.{ext} path', () => {
  const offenders = [];
  for (const rel of MIGRATED_FILES) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const m = text.match(LITERAL_TMP_RE);
    if (m) offenders.push(`${rel}: ${m[0]}`);
  }
  assert.deepEqual(offenders, [], 'migrated files must carry zero literal unscoped /tmp paths');
});

test('_shared/session-tmp-root.md documents the degrade rule and the record-suffix composition rule', () => {
  const text = fs.readFileSync(path.join(ROOT, '_shared', 'session-tmp-root.md'), 'utf8');
  assert.match(text, /Degrade rule/, 'must document the no-session-id fallback');
  assert.match(text, /Record-suffixed callers keep both suffixes/, 'must document combining session root with an existing record suffix');
});

test('bin/lib/session-tmp.js is a pure module (no gh/MCP/network calls)', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'bin', 'lib', 'session-tmp.js'),
    'utf8',
  );
  assert.doesNotMatch(text, /execFileSync|execSync|spawn|fetch\(/, 'must stay pure filesystem helpers, no network/process calls');
});
