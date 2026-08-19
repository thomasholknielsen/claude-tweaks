// bin/lib/residue/probes/forge.js — open pull requests at residue-sweep
// time. Every open PR is a finding: this run's own head branch is
// `blast-radius` (this session's own open work, still worth surfacing —
// e.g. a forgotten draft PR from an earlier phase of the same run), and
// every other open PR is `observed` (another lane's in-flight work — never
// this run's concern to act on, only to make visible). `gh pr list`'s
// implicit default page size is 30 and truncates silently past it; this
// probe passes an explicit `--limit 100` for the same reason
// `_shared/github-pr-scan.md` documents it as this repo's convention for
// every other `gh pr list --state open` call site.
'use strict';

const { makeFinding } = require('../finding');

function probeForge({ scope, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  // `gh`'s implicit default is 30 and truncates silently — `_shared/github-pr-scan.md`'s
  // documented convention, matched here with the same `--limit 100` this repo's other
  // `gh pr list --state open` call sites use.
  const argv = ['gh', 'pr', 'list', '--state', 'open', '--json', 'number,title,headRefName', '--limit', '100'];
  const out = run(argv);
  if (out === null) return { ran: false, reason: 'gh unavailable or not authenticated', findings: [] };

  let prs;
  try {
    prs = JSON.parse(out);
  } catch {
    return { ran: false, reason: 'could not parse gh pr list output', findings: [] };
  }
  if (!Array.isArray(prs)) return { ran: false, reason: 'could not parse gh pr list output', findings: [] };

  const findings = prs.map((pr) => {
    const mine = scope.headBranch && pr.headRefName === scope.headBranch;
    return makeFinding({
      kind: 'pr',
      scope: mine ? 'blast-radius' : 'observed',
      subject: `PR #${pr.number}`,
      remedy: 'record',
      evidence: `${argv.join(' ')} — open, head ${pr.headRefName}${mine ? ' (this work)' : ' (another lane)'}`,
    });
  });
  return { ran: true, reason: null, findings };
}

module.exports = { probeForge };
