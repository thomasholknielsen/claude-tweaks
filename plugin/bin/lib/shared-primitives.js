// bin/lib/shared-primitives.js
// Two small, previously-duplicated primitives, consolidated per #977:
//
//   - GH_TIMEOUT_MS: the `gh` subprocess timeout (ms) shared by every direct
//     `execFileSync('gh', ...)` / `execFileAsync('gh', ...)` call in the
//     claim machinery. Before this extraction it was defined identically in
//     `plugin/bin/claim-targets.js`, `plugin/bin/lib/issues/claim-store.js`,
//     and `plugin/bin/lib/reconcile/release-merged.js` — a 4th copy lived in
//     `claim-engine.js` until that file was retired (#787), which is why
//     #977 originally counted 4. NOT the hook-teardown timeout —
//     `plugin/bin/lib/hooks/teardown-run.js` deliberately uses a different,
//     longer value and stays out of scope here.
//   - escapeRegExp: a one-line "escape regex metacharacters" helper, also
//     defined identically in `plugin/bin/lib/skill-audit/skill-catalog.js`
//     and `plugin/bin/lib/code-health/candidates-dead-code.js` before this
//     extraction. Unrelated in purpose to GH_TIMEOUT_MS, but consolidated
//     into this same file per #977's single-shared-module deliverable
//     rather than a second one-export file.
'use strict';

const GH_TIMEOUT_MS = 5000;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { GH_TIMEOUT_MS, escapeRegExp };
