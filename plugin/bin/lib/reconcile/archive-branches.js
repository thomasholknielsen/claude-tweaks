// bin/lib/reconcile/archive-branches.js — convergence check: archive or
// delete abandoned plugin-owned LOCAL branches, and age out the archive/*
// tags the archival path creates. Pure decision functions with I/O at the
// edges, matching release-merged.js's pattern. All mutations are local to
// this checkout — never a pushed deletion, never a pushed tag; different
// checkouts converge independently. Origin-side cleanup belongs to PR
// merges, tidy's remote-ref pruning, and — for plugin-owned branches
// proven merged (MERGED PR + cherry-equivalence) — the sibling
// prune-remote.js check, the family's one pushed mutation.
//
// Tags created here are annotated local tags (`git tag -a -f`), aged from
// their own tagger date — the clock starts when the tag is created, not
// when the tagged commit was authored, since the tip commit can already be
// >90 days old at archival time (an aged branch is exactly what this check
// tags). A legacy lightweight tag (no tagger date) falls back to aging from
// its tagged commit's committer date.
//
// `git cherry {integration} {branch}` is the merged-in-substance evidence —
// it catches squash merges that ancestry checks and `git branch -d` both
// miss; that is why execution uses `-D` behind this decision table and
// never trusts `-d`'s verdict.
'use strict';

const { runGit } = require('../hooks/git-exec');
const { parseWorktreeList } = require('../hooks/worktree-reap');
const { resolvePrState } = require('./pr-state');

const BRANCH_AGE_DAYS = 14; // hardcoded by design — no policy lever
const TAG_AGE_DAYS = 90; // matches git's default reflog window: past it, the tag's marginal recovery value is zero

// Plugin-owned branch namespaces. No canonical source elsewhere in the repo —
// maintained manually here; a future plugin-owned prefix must be added by
// hand or its branches silently never age out.
const SCOPE_PATTERNS = [/^build\//, /^worktree-/, /^demo\//];

// Scope guard — runs BEFORE decideArchive is ever called. `worktrees` is
// parseWorktreeList output (bin/lib/hooks/worktree-reap.js), reused not
// reimplemented; a branch attached to any live worktree is never touched.
function inScope(branch, worktrees) {
  if (!SCOPE_PATTERNS.some((re) => re.test(branch))) return false;
  return !worktrees.some((w) => w.branch === branch);
}

// One branch's evidence -> what to do. Pure — no I/O.
//   { action: 'delete' | 'tag-and-delete' | 'skip', reason }
function decideArchive({ branch, tipAgeDays, cherryEquivalent, prState }) {
  if (prState === 'gh-absent' || prState === 'network-failure') {
    return { action: 'skip', reason: prState }; // evidence unknown — fail closed
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // an open PR means work may be landing
  }
  if (cherryEquivalent) {
    return { action: 'delete', reason: 'cherry-equivalent' }; // merged in substance — no tag needed
  }
  // No PR at all, or a PR closed without merging: nothing landed, so age alone decides.
  const nothingLanded = prState === null || (prState && prState.state === 'CLOSED');
  if (nothingLanded) {
    if (tipAgeDays > BRANCH_AGE_DAYS) {
      return { action: 'tag-and-delete', reason: `unmerged-aged: ${Math.floor(tipAgeDays)}d > ${BRANCH_AGE_DAYS}d` };
    }
    return { action: 'skip', reason: 'too-young' };
  }
  // Exhaustive: only a MERGED PR reaches here (gh-absent/network-failure, OPEN,
  // and the no-PR/closed-unmerged pair all returned above), and its commits are
  // not patch-equivalent to the integration branch.
  return { action: 'skip', reason: 'merged-pr-without-cherry-equivalence' }; // rebased remnant — human territory
}

// Tag aging: pure threshold check against a single ISO date. The call site
// selects which date (tagger, falling back to committer) to pass in.
// Unparseable/empty dates fail closed (kept).
function shouldAgeTag(dateIso, nowMs) {
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return false;
  return nowMs - t > TAG_AGE_DAYS * 24 * 60 * 60 * 1000;
}

// branch name -> a flat (no '/'), injective tag suffix. Reversible
// path-flattening: escape every literal '-' as '--' first, then replace
// every remaining single '/' with a single '-'. A naive `/`->`-`
// substitution alone is not injective (`build/foo-bar` and `build/foo/bar`
// both become `build-foo-bar`), which — combined with the tag-creation call
// site's `-f` force flag — would silently overwrite one branch's archive tag
// with another's. Escaping `-` first structurally rules that out: two
// distinct branch names can never encode to the same suffix. Never returns a
// string containing '/'. See #548.
function encodeArchiveTagSuffix(branch) {
  return branch.replace(/-/g, '--').replace(/\//g, '-');
}

// Cherry equivalence: every commit on the branch is patch-equivalent to one
// already on the integration branch (`git cherry` lines all start with '-';
// empty output = no unique commits at all). A cherry failure fails closed.
function isCherryEquivalent(root, integration, branch) {
  const r = runGit(['cherry', integration, branch], root);
  if (r.failure || r.stdout === null) return null; // unknown — fail closed at the call site
  const lines = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.every((l) => l.startsWith('-'));
}

function archiveBranches({ cwd, integration, dryRun, now, resolvePr } = {}) {
  const root = cwd || process.cwd();
  const nowMs = now || Date.now();
  const resolve = resolvePr || resolvePrState;
  const entries = [];

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  if (wtList.failure) return { entries, failure: 'git-failure' };
  const worktrees = parseWorktreeList(wtList.stdout);

  const refs = runGit(['for-each-ref', '--format=%(refname:short)\t%(committerdate:iso8601-strict)\t%(objectname)', 'refs/heads'], root);
  if (refs.failure) return { entries, failure: 'git-failure' };

  for (const line of refs.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
    const [branch, committerDate, tip] = line.split('\t');
    if (!inScope(branch, worktrees)) continue; // scope guard: namespace + worktree attachment — never reaches the decision fn
    const tipAgeDays = (nowMs - Date.parse(committerDate)) / (24 * 60 * 60 * 1000);
    const cherryEquivalent = isCherryEquivalent(root, integration, branch);
    if (cherryEquivalent === null) {
      entries.push({ name: branch, kind: 'branch', action: 'skip', reason: 'cherry-failed' });
      continue;
    }
    const prState = resolve(root, branch);
    const decision = decideArchive({ branch, tipAgeDays, cherryEquivalent, prState });
    if (decision.action === 'skip' || dryRun) {
      entries.push({ name: branch, kind: 'branch', action: decision.action, reason: decision.reason });
      continue;
    }
    if (decision.action === 'tag-and-delete') {
      // Annotated + force-created: -f also fixes the retry dead-end where a
      // pre-existing archive/{encoded-branch} tag from an earlier failed
      // pass would permanently block archival — the tag is simply recreated
      // at the same tip.
      const tag = runGit(['tag', '-a', '-f', '-m', `archive of ${branch}`, `archive/${encodeArchiveTagSuffix(branch)}`, tip], root);
      if (tag.failure) {
        entries.push({ name: branch, kind: 'branch', action: 'skip', reason: 'tag-failed' }); // fail closed: never delete untagged
        continue;
      }
    }
    const del = runGit(['branch', '-D', branch], root); // -D behind the decision table's evidence — -d's verdict is explicitly not trusted
    entries.push(del.failure
      ? { name: branch, kind: 'branch', action: 'skip', reason: 'delete-failed' }
      : { name: branch, kind: 'branch', action: decision.action, reason: decision.reason });
  }

  // Tag aging — archive/* tags whose age (from tagger date for annotated
  // tags this check creates, falling back to committer date for legacy
  // lightweight tags) exceeds TAG_AGE_DAYS.
  const tags = runGit(['for-each-ref', '--format=%(refname:short)\t%(taggerdate:iso8601-strict)\t%(committerdate:iso8601-strict)', 'refs/tags/archive'], root);
  if (!tags.failure) {
    for (const line of tags.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const [tag, taggerDate, committerDate] = line.split('\t');
      const ageDate = taggerDate || committerDate;
      if (!shouldAgeTag(ageDate, nowMs)) continue;
      if (dryRun) { entries.push({ name: tag, kind: 'tag', action: 'aged-out', reason: 'dry-run' }); continue; }
      const del = runGit(['tag', '-d', tag], root);
      entries.push(del.failure
        ? { name: tag, kind: 'tag', action: 'skip', reason: 'delete-failed' }
        : { name: tag, kind: 'tag', action: 'aged-out', reason: `> ${TAG_AGE_DAYS}d` });
    }
  }

  return { entries, failure: null };
}

module.exports = { decideArchive, inScope, shouldAgeTag, archiveBranches, BRANCH_AGE_DAYS, TAG_AGE_DAYS, isCherryEquivalent, encodeArchiveTagSuffix };
