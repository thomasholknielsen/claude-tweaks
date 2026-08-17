// bin/lib/claim-targets/claim-targets.js
// The group-claim loop as one command — `skills/flow/claim-targets.md`'s
// Step 2.8 read-classify-write loop, mirrored here so a headless run can
// shell out to one process instead of a chain of `node -e` snippets. Logic
// lives in `run(argv, deps)`; every side effect (`ghApi`, `gh`, `now`,
// `stdout`, `stderr`, `hostname`, `sessionId`) goes through `deps` so tests
// never touch real `gh`. See `skills/_shared/issue-claims.md` ("The lock"
// steps 1-6, "Group claiming") for the protocol this implements, and
// `.claude/skills/gh-api-module-pattern/SKILL.md` for the injectable-runner
// convention this file follows.
//
// `deps.ghApi` is the claim-store contract: `ghApi(args)` never throws,
// returns `{stdout, failure, status}` (same shape `bin/lib/issues/claim-store.js`
// already uses for the contents-API reads/writes this module delegates to it).
// `deps.gh` is the generic-runner contract: `gh(args)` is invoked as if
// `gh ${args.join(' ')}`, returns stdout, and *throws* on failure — used for
// every non-contents-API call (`repo view`, `label list/create`,
// `issue edit --add-label/--remove-label`, `issue comment`). Every `deps.gh`
// call that can throw is wrapped so a failure never escapes uncaught.
'use strict';

const claimStore = require('../issues/claim-store');
const { classifyClaimBlob, claimPayload, releasePayload } = require('../issues/claims');
const { ensureLabelPayload } = require('../issues/labels');

const BOT_IN_PROGRESS = 'bot:in-progress';
const BOT_IN_PROGRESS_DESC = 'Bot state: an agent currently holds the claim on this record';
const ABORT_REASON = 'never-started: file-overlap group partial claim';

const USAGE = 'usage: claim-targets.js --run-id <id> --targets <n,n,...> [--keep-going] [--help]\n'
  + '  exit 0 = all claimed (or, with --keep-going, partial)\n'
  + '  exit 2 = malformed invocation or missing dependency\n'
  + '  exit 3 = contested (holder JSON on stdout)\n'
  + '  exit 4 = transient gh failure\n';

function errText(e) {
  return String((e && e.message) || e);
}

function parseArgs(argv) {
  const opts = {
    runId: null, targetsRaw: null, keepGoing: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--run-id') opts.runId = next();
    else if (a === '--targets') opts.targetsRaw = next();
    else if (a === '--keep-going') opts.keepGoing = true;
    else return { error: `unknown argument: ${a}` };
  }
  return opts;
}

// Explicit positive-integer validation per part — never `Number(s)`, whose
// `Number('') === 0` would let a trailing comma or blank slip past
// `Number.isInteger` (gh-api-module-pattern skill's documented hazard).
function parseTargets(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const parts = raw.split(',').map((s) => s.trim());
  const targets = [];
  for (const p of parts) {
    if (!/^[1-9]\d*$/.test(p)) return null;
    targets.push(Number(p));
  }
  return targets.length ? targets : null;
}

function repoSlugOf(gh) {
  const out = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  const slug = String(out || '').trim();
  return slug || null;
}

// Best-effort bootstrap-then-add for `bot:in-progress`, per
// `_shared/label-bootstrap.md`'s check-then-create convention. Throws are the
// caller's problem to catch (per contract, this never aborts a claim).
function ensureAndAddLabel(gh, issue) {
  const payload = ensureLabelPayload(BOT_IN_PROGRESS, BOT_IN_PROGRESS_DESC);
  const existing = String(gh(['label', 'list', '--search', payload.name, '--json', 'name', '-q', '.[].name']) || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (!existing.includes(payload.name)) {
    gh(['label', 'create', payload.name, '--description', payload.description]);
  }
  gh(['issue', 'edit', String(issue), '--add-label', payload.name]);
}

function removeLabelBestEffort(gh, issue) {
  try { gh(['issue', 'edit', String(issue), '--remove-label', BOT_IN_PROGRESS]); } catch { /* best-effort, per issue-claims.md */ }
}

// All-or-abort release of every target this invocation claimed, before a
// contest or transient failure aborts the run (`issue-claims.md`'s "Group
// claiming" — a partial group claim must not leave a member built alone).
// Best-effort throughout: a release-write failure here is logged by the
// caller via the returned list omitting that issue, never a second abort.
function releaseClaimedThisRun(deps, repoSlug, runId, issues) {
  const released = [];
  for (const issue of issues) {
    const fresh = claimStore.readClaimBlob(deps.ghApi, repoSlug, issue);
    if (fresh.failure || fresh.absent) continue; // nothing we can safely overwrite
    const payload = releasePayload({
      issueNumber: issue, runId, reason: ABORT_REASON, now: deps.now(),
    });
    const w = claimStore.writeClaimBlob(deps.ghApi, repoSlug, issue, {
      content: payload.tombstoneContent, sha: fresh.sha, message: `Release issue #${issue} — ${ABORT_REASON}`,
    });
    if (w.ok) released.push(issue);
    removeLabelBestEffort(deps.gh, issue);
  }
  return released;
}

// argv -> exit code. All I/O through deps so tests never touch gh.
function run(argv, deps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(opts.error + '\n' + USAGE); return 2; }
  if (opts.help) { deps.stdout(USAGE); return 0; }

  if (!opts.runId || opts.runId.trim() === '') { deps.stderr(USAGE); return 2; }
  const targets = parseTargets(opts.targetsRaw);
  if (!targets) { deps.stderr(USAGE); return 2; }

  let repoSlug;
  try {
    repoSlug = repoSlugOf(deps.gh);
  } catch (e) {
    deps.stderr(`claim-targets: could not resolve repo slug — ${errText(e)}\n${USAGE}`);
    return 2;
  }
  if (!repoSlug) { deps.stderr(`claim-targets: could not resolve repo slug (empty)\n${USAGE}`); return 2; }

  const claimedThisRun = [];
  const alreadyOwned = [];
  const skipped = [];
  const labelFailures = [];

  for (const issue of targets) {
    const read = claimStore.readClaimBlob(deps.ghApi, repoSlug, issue);
    if (read.failure) {
      if (opts.keepGoing) { skipped.push({ issue, reason: 'transient', error: read.failure }); continue; }
      const released = releaseClaimedThisRun(deps, repoSlug, opts.runId, claimedThisRun);
      deps.stdout(JSON.stringify({ transient: [{ issue, error: read.failure }], released }));
      return 4;
    }

    const content = read.absent ? null : read.content;
    const classified = classifyClaimBlob(content, deps.now());

    let identity = null;
    if (classified.state === 'live' || classified.state === 'stale' || classified.state === 'tombstone') {
      try { identity = JSON.parse(content); } catch { identity = null; }
    }

    if ((classified.state === 'live' || classified.state === 'stale') && identity && identity.runId === opts.runId) {
      alreadyOwned.push(issue);
      continue;
    }

    if (classified.state === 'live' || classified.state === 'unreadable') {
      const holder = classified.state === 'live' ? identity : null;
      if (opts.keepGoing) { skipped.push({ issue, reason: 'contested', holder }); continue; }
      const released = releaseClaimedThisRun(deps, repoSlug, opts.runId, claimedThisRun);
      deps.stdout(JSON.stringify({ contested: [{ issue, holder }], released }));
      return 3;
    }

    // Reclaimable: 'absent' (create-only) or 'tombstone'/'stale' not self-owned
    // (conditional write, sha from this same read — issue-claims.md steps 3-4).
    const payload = claimPayload({
      issueNumber: issue, runId: opts.runId, sessionId: deps.sessionId, host: deps.hostname, now: deps.now(),
    });
    const writeOpts = { content: payload.fileContent, message: `Claim issue #${issue}` };
    if (classified.state !== 'absent') writeOpts.sha = read.sha;
    const write = claimStore.writeClaimBlob(deps.ghApi, repoSlug, issue, writeOpts);

    if (write.failure) {
      if (opts.keepGoing) { skipped.push({ issue, reason: 'transient', error: write.failure }); continue; }
      const released = releaseClaimedThisRun(deps, repoSlug, opts.runId, claimedThisRun);
      deps.stdout(JSON.stringify({ transient: [{ issue, error: write.failure }], released }));
      return 4;
    }
    if (!write.ok) {
      // Rejected (race lost between this read and this write) — contested,
      // not a retry, per issue-claims.md step 3's "A rejection on either
      // transport is contested." Holder identity is unknown without a fresh
      // read; report the rejection itself rather than guessing.
      if (opts.keepGoing) { skipped.push({ issue, reason: 'contested', holder: null }); continue; }
      const released = releaseClaimedThisRun(deps, repoSlug, opts.runId, claimedThisRun);
      deps.stdout(JSON.stringify({ contested: [{ issue, holder: null }], released }));
      return 3;
    }

    claimedThisRun.push(issue);

    try {
      ensureAndAddLabel(deps.gh, issue);
    } catch (e) {
      labelFailures.push({ issue, error: errText(e) });
    }

    try {
      deps.gh(['issue', 'comment', String(issue), '--body', payload.commentBody]);
    } catch {
      try {
        deps.gh(['issue', 'comment', String(issue), '--body', payload.commentBody]);
      } catch (e2) {
        deps.stderr(`claim-targets: claim comment failed for #${issue} (claim stands) — ${errText(e2)}\n`);
      }
    }
  }

  deps.stdout(JSON.stringify({
    claimed: claimedThisRun, alreadyOwned, skipped, labelFailures,
  }));
  return 0;
}

module.exports = {
  run, parseArgs, parseTargets, USAGE, BOT_IN_PROGRESS, ABORT_REASON,
};
