// bin/lib/reconcile/escalate-residue.js — files (or dedup-finds) a backlog
// issue for one path stuck at `move-failed`/`removal-failed` past
// cache.js's RESIDUE_ESCALATE_THRESHOLD (#644 Deliverable 2). Same shape as
// bin/lib/feedback/file-feedback.js: an injectable runner so no test ever
// touches real `gh`, a fingerprint-marker dedup search before filing so a
// still-failing path across repeated escalating calls never files twice, and
// every failure degrades to a returned status rather than a thrown error —
// reconcile never breaks a session (index.js's header comment) and this is
// reachable from the same non-interactive, no-LLM contexts (session-start.js
// in-process, `bin/hooks.js reconcile` CLI) that have no gh-vs-MCP transport
// choice to make, unlike the LLM-orchestrated health-sweep skills'
// `_shared/github-write-transport.md` path — gh-absent here is a normal,
// best-effort miss, not a hard failure, and the next `/tidy` sweep or a
// human reading `reconcile`'s JSON is the backstop.
//
// Label posture (#1216, decided 2026-08-29): filing with `--label bug` only
// is a deliberate choice, not a gap — never add `by:*`/`type:*`/`risk:*`/
// `size:*`/`ready` here. Risk/size are content judgments, and this module
// runs in the no-LLM contexts named above, which cannot score them; a
// mechanical always-low default fails independently (`ready` requires a
// spec-shaped body, which reconcile's terse auto-report is not). Enrichment
// belongs to the downstream path that demonstrably picks these issues up: a
// plain open issue IS a backlog-stage record, the scheduled bare `/specify`
// drain (its deprecated `next` alias, historically) shapes it headlessly,
// and `/backlog` grants route it to an
// autonomous build. No `by:reconcile` origin value, no scoring heuristic —
// closed #1216 is the recorded decision.
'use strict';
const { fingerprintFromBasis, normalizeText } = require('../health-core/fingerprint');
// #644 review fix — defaultRunner/errorText were a byte-for-byte duplicate
// of bin/lib/feedback/file-feedback.js's own (this module's header comment
// already says "same shape"); import rather than restate, so a future fix
// to either only has to land once. The dedup-then-file FLOW below still
// diverges deliberately (no readBack/verify round trip, `--body` inline
// rather than `--body-file`) — that's a real behavioral difference, not
// duplication, and stays local to this module.
const { defaultRunner, errorText, findDuplicate } = require('../feedback/file-feedback');

function residueFingerprint(reason, targetPath) {
  return fingerprintFromBasis('reconcile-residue', [reason, normalizeText(targetPath)]);
}

function residueBody({ reason, targetPath, count, firstFailedAt, lastError }) {
  const marker = `<!-- fingerprint: ${residueFingerprint(reason, targetPath)} -->`;
  const lines = [
    `Reconcile has failed \`${reason}\` on this path for ${count} consecutive passes` +
      (firstFailedAt ? ` (first observed ${new Date(firstFailedAt).toISOString()})` : '') + '.',
    '',
    `**Path:** \`${targetPath}\``,
    `**Reason:** \`${reason}\``,
    lastError ? `**Last error:** ${lastError}` : null,
    '',
    'Filed automatically by `bin/lib/reconcile` — see #644.',
    '',
    marker,
  ].filter((l) => l !== null);
  return { body: lines.join('\n'), marker };
}

// { repo, reason, targetPath, count, firstFailedAt, lastError, runner } ->
// { status: 'filed'|'dedup-hit', number } | { status: 'escalation-failed', reason }
// Never throws — every branch below is try/caught, mirroring every other
// best-effort write in this module family (logReapEvent in reap-merged.js,
// writeCache here).
function escalateResidue({ repo, reason, targetPath, count, firstFailedAt, lastError, runner = defaultRunner }) {
  if (!repo) return { status: 'escalation-failed', reason: 'no-repo-slug' };
  const { body, marker } = residueBody({ reason, targetPath, count, firstFailedAt, lastError });
  const title = `reconcile: ${reason} stuck on ${targetPath}`;

  try {
    const hit = findDuplicate({ repo, marker, runner });
    if (hit) return { status: 'dedup-hit', number: hit.number };
  } catch (err) {
    return { status: 'escalation-failed', reason: errorText(err) };
  }

  try {
    const out = runner(['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', 'bug']);
    const m = /\/issues\/(\d+)/.exec(String(out));
    return { status: 'filed', number: m ? Number(m[1]) : null };
  } catch (err) {
    return { status: 'escalation-failed', reason: errorText(err) };
  }
}

module.exports = { escalateResidue, residueFingerprint, residueBody, defaultRunner, errorText };
