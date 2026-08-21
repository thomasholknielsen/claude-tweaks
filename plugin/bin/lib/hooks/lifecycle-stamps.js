// bin/lib/hooks/lifecycle-stamps.js — [IL-131] second recurrence (#991):
// mechanical HARD-GATE that Common Step 1's two non-skippable sub-steps
// (build/worktree-setup.md Step 4.5's `record-worktree` stamp, and — under
// `integration-model: pr-first` — Step 6's PR-early lifecycle
// `_shared/pr-early-run-lifecycle.md`) actually ran for this run, instead of
// relying on a build agent reading and obeying bolded instructional prose
// under a competing "nothing to implement" judgment. Both #118 (the IL-131
// original) and #893 (this recurrence) hit the identical trigger — an
// "already satisfied by prior work" build outcome that made zero further
// commits — so a check keyed on commit activity would never fire for the
// exact case this guards against; this is invoked instead as its own
// `/claude-tweaks:test` HARD-GATE step (Step 1.6), which every build run
// reaches regardless of whether it committed anything beyond the materialize
// commit.
'use strict';
const ctxLib = require('./context');

// `runDir` — the resolved pipeline run dir, or null for a standalone (no
// pipeline) invocation, which has nothing to enforce. `gitStrategy` —
// 'worktree' | 'current-branch' (resolve-policy.js's `git-strategy` key);
// only 'worktree' runs create a worktree for record-worktree to stamp.
// `integrationModel` — 'pr-first' | 'local-merge' (resolve-policy.js's
// `integration-model` key); only 'pr-first' runs open a PR at all.
//
// Never throws — an unreadable/missing run-state.json reads as "no stamps",
// which fails closed for a worktree/pr-first run (CLAUDE.md's "fail loud"
// directive: a genuinely-skipped Common Step 1 is exactly the bug this
// exists to catch, so ambiguity here must not read as success).
function checkLifecycleStamps({ runDir, gitStrategy, integrationModel }) {
  if (!runDir) return { ok: true, problems: [] };
  const state = ctxLib.readRunState(runDir) || {};
  const problems = [];

  if (gitStrategy === 'worktree' && !state.worktree) {
    problems.push(
      'record-worktree was never called for this run (build/worktree-setup.md Common Step 1 ' +
      'Step 4.5) — run `node bin/hooks.js record-worktree --run "$RUN_DIR" "$WORKTREE"` now. ' +
      '[IL-131]',
    );
  }

  if (integrationModel === 'pr-first' && !state.pr && !state.prDegraded) {
    problems.push(
      'the PR-early lifecycle (build/worktree-setup.md Common Step 1 Step 6, ' +
      '_shared/pr-early-run-lifecycle.md) never ran and no degrade was recorded — open the ' +
      'draft PR now, or, if push/PR-create genuinely failed, record the documented degrade via ' +
      '`node bin/hooks.js record-pr --run "$RUN_DIR" --degraded "<reason>"`. [IL-131]',
    );
  }

  return { ok: problems.length === 0, problems };
}

module.exports = { checkLifecycleStamps };
