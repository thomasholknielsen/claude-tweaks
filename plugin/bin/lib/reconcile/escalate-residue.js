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
// and `/backlog` grants route it to an autonomous build. No `by:reconcile`
// origin value, no scoring heuristic — closed #1216 is the recorded
// decision.
'use strict';
const { fingerprintFromBasis, normalizeText } = require('../health-core/fingerprint');
// #644 review fix — defaultRunner/errorText were a byte-for-byte duplicate
// of bin/lib/feedback/file-feedback.js's own (this module's header comment
// already says "same shape"); import rather than restate, so a future fix
// to either only has to land once. The dedup-then-file FLOW below still
// diverges deliberately (no readBack/verify round trip, `--body` inline
// rather than `--body-file`) — that's a real behavioral difference, not
// duplication, and stays local to this module.
const { defaultRunner, errorText } = require('../feedback/file-feedback');
// #1892: file-feedback.js's own findDuplicate requests only
// `number,title,body,createdAt` (pinned by that module's own test, and
// adequate for its plain dedup-then-file need) — this module additionally
// needs to tell an OPEN hit from a CLOSED one (dedup-hit vs. reopen), so it
// keeps its own copy of the list-then-findByMarker idiom with `state` added,
// rather than widening the shared function's JSON fields for every other
// caller.
const { findByMarker } = require('../issues/dedup-lookup');

function residueFingerprint(reason, targetPath) {
  return fingerprintFromBasis('reconcile-residue', [reason, normalizeText(targetPath)]);
}

// #1796: bounds how many porcelain lines a `removal-failed` escalation ever
// renders — a worktree with hundreds of stray files must not blow up the
// issue body (or, upstream of this, the cache entry a caller persists it
// into). Idempotent by construction: an array that already ends with a tail
// marker in this exact shape is left alone rather than re-sliced, so a
// caller that caps before persisting to cache (`reap-merged.js`, per this
// record's Technical Approach) and this module's own defensive cap at
// render time never compound into a doubly-truncated, mis-counted body.
const DIRTY_FILES_CAP = 50;
const DIRTY_FILES_TAIL_RE = /^… and \d+ more$/;

function capDirtyFiles(lines, cap = DIRTY_FILES_CAP) {
  if (!Array.isArray(lines)) return lines;
  if (lines.length <= cap) return lines;
  if (lines.length === cap + 1 && DIRTY_FILES_TAIL_RE.test(lines[lines.length - 1])) return lines;
  return [...lines.slice(0, cap), `… and ${lines.length - cap} more`];
}

// #1796 Deliverable 3 — the reaper never gains `--force`; this is advice for
// the human reading the escalation, not a behavior change to reap-merged.js.
function dirtyFilesDispositionHint(targetPath) {
  return `Only \`??\` (untracked) entries that are plainly disposable make \`git worktree remove --force ${targetPath}\` safe; any modified tracked entry means inspect first.`;
}

// #1796 Deliverable 2 — `dirtyFiles` is `null` when the porcelain read
// itself failed (never omit the block and let that look like a clean
// worktree), an array of raw `git status --porcelain` lines (verbatim —
// never split a rename's ` -> ` or trim a status prefix's leading space) on
// a successful read, or `undefined` for a caller that predates this field —
// treated the same as `null` (a check that was never run must not render as
// "nothing to report").
function dirtyFilesBlock(dirtyFiles, targetPath) {
  const header = '**Dirty files (`git status --porcelain` at the last failed pass):**';
  const evidence = dirtyFiles == null
    ? ['', 'could not read — git status failed']
    : ['```', ...capDirtyFiles(dirtyFiles), '```'];
  return [header, ...evidence, '', dirtyFilesDispositionHint(targetPath)];
}

// { repo, marker, runner } -> matching issue { number, title, body,
// createdAt, state } or null. Same plain list-then-filter idiom as
// file-feedback.js's findDuplicate (never `gh issue list --search` — rides
// GitHub's eventually-consistent Search API, root cause of #1016/#1079/
// #1089) — `--state all` so a closed duplicate is still found (Deliverable 4:
// dedup must consider open AND closed records).
function findResidueDuplicate({ repo, marker, runner = defaultRunner }) {
  const out = runner(['issue', 'list', '--repo', repo, '--state', 'all', '--json', 'number,title,body,createdAt,state', '--limit', '10000']);
  const issues = JSON.parse(out);
  const result = findByMarker(Array.isArray(issues) ? issues : [], marker);
  return result ? result.canonical : null;
}

// #1796: the attribution line used to read `Filed automatically by
// \`bin/lib/reconcile\` — see #644.` — in a consumer project that reads as
// an in-repo path and a local issue number, neither of which exist there.
// This form always names the plugin and the fully-qualified upstream ref, so
// a downstream `/claude-tweaks:specify` shaping this record never scopes a
// fix to a `bin/lib/reconcile/` that doesn't exist in the consumer's own repo.
const ATTRIBUTION_LINE = 'Filed automatically by the claude-tweaks plugin\'s reconcile pass. The removal/move logic named above lives in `bin/lib/reconcile/` of `thomasholknielsen/claude-tweaks` — not a path in this repository — so a fix, if any, belongs upstream: see thomasholknielsen/claude-tweaks#644. This record is the human handoff for the path named above.';

function residueBody({ reason, targetPath, count, firstFailedAt, lastError, dirtyFiles }) {
  const marker = `<!-- fingerprint: ${residueFingerprint(reason, targetPath)} -->`;
  const lines = [
    `Reconcile has failed \`${reason}\` on this path for ${count} consecutive passes` +
      (firstFailedAt ? ` (first observed ${new Date(firstFailedAt).toISOString()})` : '') + '.',
    '',
    `**Path:** \`${targetPath}\``,
    `**Reason:** \`${reason}\``,
    lastError ? `**Last error:** ${lastError}` : null,
  ];
  // #1796 Deliverable 2 — only `removal-failed` ever carries a dirty-file
  // list; `structurally-stuck`/`move-failed` never call this with
  // `dirtyFiles` set, and must render no block at all.
  if (reason === 'removal-failed') {
    lines.push('', ...dirtyFilesBlock(dirtyFiles, targetPath));
  }
  lines.push('', ATTRIBUTION_LINE, '', marker);
  return { body: lines.filter((l) => l !== null).join('\n'), marker };
}

// { repo, reason, targetPath, count, firstFailedAt, lastError, runner } ->
// { status: 'filed'|'dedup-hit'|'reopened', number } | { status: 'escalation-failed', reason }
// Never throws — every branch below is try/caught, mirroring every other
// best-effort write in this module family (logReapEvent in reap-merged.js,
// writeCache here).
//
// #1892 Deliverable 4: a marker match that is already CLOSED means this same
// path escalated before, got resolved, and is now failing again. Reopen the
// existing record instead of filing a fresh duplicate — a deliberate choice
// to keep one issue per path across its whole open/closed/reopened lifetime,
// not one per escalation streak. (`--state all` above mirrors the shared
// `findDuplicate`'s own already-`--state all` behavior, not a widening from
// an open-only search bug — see #2334.)
function escalateResidue({ repo, reason, targetPath, count, firstFailedAt, lastError, dirtyFiles, runner = defaultRunner }) {
  if (!repo) return { status: 'escalation-failed', reason: 'no-repo-slug' };
  const { body, marker } = residueBody({ reason, targetPath, count, firstFailedAt, lastError, dirtyFiles });
  const title = `reconcile: ${reason} stuck on ${targetPath}`;

  let hit;
  try {
    hit = findResidueDuplicate({ repo, marker, runner });
  } catch (err) {
    return { status: 'escalation-failed', reason: errorText(err) };
  }
  if (hit) {
    if (hit.state !== 'CLOSED') return { status: 'dedup-hit', number: hit.number };
    try {
      runner(['issue', 'comment', String(hit.number), '--repo', repo, '--body',
        `Reconcile is seeing this path fail \`${reason}\` again (${count} consecutive passes since it was ` +
        'last resolved) — reopening rather than filing a duplicate.']);
      runner(['issue', 'reopen', String(hit.number), '--repo', repo]);
      return { status: 'reopened', number: hit.number };
    } catch (err) {
      return { status: 'escalation-failed', reason: errorText(err), number: hit.number };
    }
  }

  try {
    const out = runner(['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', 'bug']);
    const m = /\/issues\/(\d+)/.exec(String(out));
    return { status: 'filed', number: m ? Number(m[1]) : null };
  } catch (err) {
    return { status: 'escalation-failed', reason: errorText(err) };
  }
}

// #1892 Deliverable 3: the cache-pruning half of the same marker-lookup
// idiom — a residueFailures entry whose live path is gone (archived, reaped,
// or resolved by some other means entirely) and was already escalated has an
// open backlog record naming a path that no longer needs it. Comment (why)
// then close — best-effort, mirrors escalateResidue's own never-throw
// posture; cache.js drops the cache entry regardless of whether this
// resolution succeeds (the path itself is gone either way, so it can never
// fail or succeed again — see that call site's own comment).
// -> { status: 'closed'|'already-closed'|'not-found', number? } |
//    { status: 'resolution-failed', reason, number? }
function resolveResidue({ repo, reason, targetPath, runner = defaultRunner }) {
  if (!repo) return { status: 'resolution-failed', reason: 'no-repo-slug' };
  const marker = `<!-- fingerprint: ${residueFingerprint(reason, targetPath)} -->`;
  let hit;
  try {
    hit = findResidueDuplicate({ repo, marker, runner });
  } catch (err) {
    return { status: 'resolution-failed', reason: errorText(err) };
  }
  if (!hit) return { status: 'not-found' };
  if (hit.state === 'CLOSED') return { status: 'already-closed', number: hit.number };
  try {
    runner(['issue', 'comment', String(hit.number), '--repo', repo, '--body',
      `This path no longer exists on disk — resolved by other means. Closing.`]);
    runner(['issue', 'close', String(hit.number), '--repo', repo]);
    return { status: 'closed', number: hit.number };
  } catch (err) {
    return { status: 'resolution-failed', reason: errorText(err), number: hit.number };
  }
}

module.exports = {
  escalateResidue, resolveResidue, residueFingerprint, residueBody, findResidueDuplicate,
  defaultRunner, errorText, capDirtyFiles, DIRTY_FILES_CAP,
};
