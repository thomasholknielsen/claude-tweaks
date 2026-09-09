'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #1135: /superpowers:subagent-driven-development's own Finish step deletes the plan's SDD
// workspace (`.superpowers/sdd/{plan}/`), including `progress.md`, where SDD convention
// ledgers deferred-minor / parked review findings. claude-tweaks' /wrap-up reads only the run
// ledger (docs/plans/*-ledger.md), so any observation ledgered solely in the SDD workspace was
// structurally lost at that seam (run 2026-08-20T154419-spec-1076). This file pins the
// directive in build/dispatch.md's composed SDD invocation instruction that closes the gap —
// mirrors tests/dispatch-no-stash-conformance.test.js's own guard for the same file.

const ROOT = path.join(__dirname, '..');
const BUILD_DISPATCH = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'build', 'dispatch.md'), 'utf8');

test('build/dispatch.md: instructs subagent-driven-development to copy surviving SDD ledger lines into the run ledger before Finish deletes the workspace', () => {
  assert.match(
    BUILD_DISPATCH,
    /before it deletes `<workspace>`/,
    'build/dispatch.md must direct /superpowers:subagent-driven-development to act before its ' +
      'Finish step deletes the SDD workspace (#1135) — otherwise the copy happens too late, ' +
      'after the source lines are already gone.',
  );
  assert.match(
    BUILD_DISPATCH,
    /`minor \(deferred\)`.*`parked`/,
    'build/dispatch.md must name both progress.md line shapes SDD actually writes ' +
      '(`minor (deferred)` and `parked`) as the source of the copied lines.',
  );
  assert.match(
    BUILD_DISPATCH,
    /`build\/\*`/,
    'build/dispatch.md must name the destination ledger phase (`build/*`) the copied lines land under.',
  );
});
