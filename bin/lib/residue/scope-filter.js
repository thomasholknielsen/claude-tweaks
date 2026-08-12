// bin/lib/residue/scope-filter.js — CLI --scope filtering, applied after
// probes run and before rendering.
//
// `--scope repo` (the default) renders every finding untouched. `--scope
// blast-radius` narrows to findings whose own `scope` field is
// 'blast-radius', dropping `observed` findings (a sibling worktree, another
// lane's PR). This never reinterprets `ran` — a probe that could not run stays
// `unknown` under either CLI scope; only a `ran: true` result's `findings`
// array is ever filtered, and filtering an empty array is a no-op, so an
// unrun probe's shape passes through unchanged either way.
'use strict';

function filterResultsByScope(results, cliScope) {
  if (cliScope !== 'blast-radius') return results;
  return results.map((r) => ({ ...r, findings: r.findings.filter((f) => f.scope === 'blast-radius') }));
}

module.exports = { filterResultsByScope };
