// bin/lib/residue/probes/release.js — this repo's release triple.
//
// Guarded by manifest.name, exactly as bin/lib/hooks/post-tool-use.js guards
// its own release reminder: the triple is a claude-tweaks convention, and
// nagging an adopter about a CHANGELOG heading shape they never adopted is
// noise. The marketplace mirror is deliberately not checked — it lives in a
// separate repository this probe cannot read.
'use strict';

const { makeFinding } = require('../finding');

function probeRelease({ scope, manifest, run } = {}) {
  if (!scope || !scope.ran) {
    return { ran: false, reason: (scope && scope.reason) || 'scope unresolved', findings: [] };
  }
  if (!manifest || manifest.name !== 'claude-tweaks') {
    return { ran: false, reason: 'not applicable — release triple is a claude-tweaks convention', findings: [] };
  }
  const version = typeof manifest.version === 'string' ? manifest.version : null;
  if (!version) return { ran: false, reason: 'manifest carries no version string', findings: [] };

  const changelog = run(['git', 'show', 'HEAD:CHANGELOG.md']);
  const record = run(['git', 'show', 'HEAD:docs/shipped-versions.tsv']);
  if (changelog === null || record === null) {
    return { ran: false, reason: 'could not read CHANGELOG.md or docs/shipped-versions.tsv at HEAD', findings: [] };
  }

  const findings = [];
  if (!changelog.includes(`## v${version} — `)) {
    findings.push(makeFinding({
      kind: 'release', scope: 'blast-radius', subject: `CHANGELOG entry for v${version}`, remedy: 'auto',
      evidence: `CHANGELOG.md at HEAD has no "## v${version} — {summary}" heading`,
    }));
  }
  if (!new RegExp(`^${version.replace(/\./g, '\\.')}\t`, 'm').test(record)) {
    findings.push(makeFinding({
      kind: 'release', scope: 'blast-radius', subject: `shipped-versions line for ${version}`, remedy: 'auto',
      evidence: `docs/shipped-versions.tsv at HEAD has no "${version}\t{date}\trelease" line`,
    }));
  }
  return { ran: true, reason: null, findings };
}

module.exports = { probeRelease };
