// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier) + closing-keyword check (warn tier) + design-doc capture nudge (warn tier) + plugin-version-bump marketplace-mirror nudge (warn tier).
'use strict';
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');
const { execGit } = require('./git-exec');
const { ISSUE_REF_SOURCE } = require('../issue-branch-tracking');

// Field/record separators for recentCommits' combined --format string below.
// ASCII 0x1f/0x1e (unit/record separator) — practically never appear in a
// real commit message, and even if one somehow did, the worst case is a
// misparsed WARN-tier message, not an enforcement gap.
const FIELD_SEP = '\x1f';
const REC_SEP = '\x1e';

// Reads back a dir's `count` most recent commits at HEAD — hash, committer
// timestamp, and full message — in ONE git spawn instead of one spawn per
// field per target. A single Bash invocation can chain multiple `git
// commit` statements against the SAME dir (e.g. `git commit -m a && git
// commit --allow-empty -m b`); querying "the commit at dir X" once per
// commit-action TARGET previously always read back the same current-HEAD
// commit for every one of them, so only the last of several real commits
// was ever actually evaluated. Returns newest-first (git log's own order),
// each entry `{ hash, ts, message }` (ts null if unparseable).
function recentCommits(dir, count) {
  if (count <= 0) return [];
  const out = execGit(['log', '-n', String(count), `--format=%h${FIELD_SEP}%ct${FIELD_SEP}%B${REC_SEP}`], dir);
  if (out === null) return [];
  return out
    .split(REC_SEP)
    // git inserts a newline after each formatted record; that newline lands
    // as a LEADING '\n' on every record after the first once split on
    // REC_SEP (the record's own content comes before its trailing '\n').
    .map((rec, i) => (i === 0 ? rec : rec.replace(/^\n/, '')))
    .filter((rec) => rec.length > 0)
    .map((rec) => {
      const firstSep = rec.indexOf(FIELD_SEP);
      const secondSep = rec.indexOf(FIELD_SEP, firstSep + 1);
      if (firstSep === -1 || secondSep === -1) return { hash: null, ts: null, message: rec };
      const hash = rec.slice(0, firstSep);
      const ts = Number(rec.slice(firstSep + 1, secondSep));
      const message = rec.slice(secondSep + 1);
      return { hash, ts: Number.isFinite(ts) ? ts : null, message };
    });
}

// How recent HEAD's commit timestamp must be for checkClosingKeyword to trust it
// as the outcome of the just-attempted commit, rather than a stale prior commit.
// Generous enough to absorb hook-dispatch latency and clock skew without letting a
// genuinely unrelated older commit through.
const COMMIT_FRESHNESS_WINDOW_SECONDS = 30;

// A recognized GitHub closing keyword immediately preceding a bare "#123" auto-closes
// that issue when the commit reaches the repository's default branch. Case-insensitive;
// covers every form GitHub recognizes (fix/fixes/fixed, close/closes/closed,
// resolve/resolves/resolved) — the same vocabulary bin/lib/issue-branch-tracking.js
// already exports as ISSUE_REF_SOURCE for the generated GitHub Actions workflow, reused
// here (composed with a trailing `$`) rather than hand-rolled a second time, so the two
// can never silently disagree about which keywords GitHub recognizes. The trailing `$`
// anchors this to the END of whatever substring it's tested against (see hasUnclosedRef
// below, which always tests a slice ending exactly at the current ref) — without it,
// "Fixes #100, #200" would wrongly read as closing #200 too, since "Fixes #100" sits
// inside the lookback window before #200 even though the keyword only ever applied to
// #100. GitHub requires the keyword immediately before EACH ref it closes ("Fixes #100,
// fixes #200"); a bare trailing ref after a comma is exactly the gotcha this check
// exists to catch. Deliberately no 'g' flag — this is reused across a `.test()` call per
// match below, and a global flag's stateful lastIndex would silently skip matches.
const CLOSING_KEYWORD_RE = new RegExp(ISSUE_REF_SOURCE + '$', 'i');
const BARE_ISSUE_REF_RE = /#\d+/g;

// Deliberately NOT gated on ctx.runDir, unlike the breadcrumb logic below — the
// motivating case is exactly a commit made outside any pipeline run (ad hoc fix
// work that references an issue number without going through /specify -> /build
// -> /wrap-up, where the closing-keyword carrier-commit mechanism already exists).
// Harness-wide, not code-health-specific: fires for any bare issue reference,
// including harness-health-labelled or human-filed issues.
//
// Takes `recentByDir` (dir -> that dir's own recentCommits() results, built
// once in run() and shared with the breadcrumb loop) rather than the raw
// target list, so each of possibly several commit-action targets sharing one
// dir is checked against its OWN commit instead of every target re-reading
// back the same current-HEAD commit.
function checkClosingKeyword(recentByDir) {
  for (const commits of recentByDir.values()) {
    for (const commit of commits) {
      // Guard against a `git commit` that never actually landed — see
      // recentCommits()'s comment. If this commit isn't fresh, skip it
      // entirely rather than judging an unrelated prior commit.
      if (commit.ts === null || Math.abs(Date.now() / 1000 - commit.ts) > COMMIT_FRESHNESS_WINDOW_SECONDS) continue;
      const message = commit.message;
      if (!message) continue;
      // Group occurrences by issue number rather than testing each occurrence in
      // isolation: the same issue can legitimately appear twice in one message
      // (once bare for context, once with a proper closing keyword), and it only
      // takes ONE closing occurrence to auto-close it. Each match's own `.index`
      // (not `message.indexOf(ref)`, which always resolves to the FIRST
      // occurrence of a repeated ref) keeps repeated identical refs from all
      // being tested against the same "before" slice.
      const matches = [...message.matchAll(BARE_ISSUE_REF_RE)];
      if (matches.length === 0) continue;
      const closedRefs = new Set();
      const seenRefs = new Set();
      for (const match of matches) {
        const ref = match[0];
        seenRefs.add(ref);
        const idx = match.index;
        // Slice from the START of the message, not a fixed lookback window —
        // a fixed window (previously 20 chars) can slice off part of a longer
        // word immediately before the ref (e.g. the "un" in "unresolved"), and
        // JS regex's \b treats the truncated slice's own start as a boundary
        // even though none exists in the real message. CLOSING_KEYWORD_RE's
        // trailing `$` anchors the match to the ref at the end of this slice
        // regardless of how much leading text precedes it, so slicing from 0
        // costs nothing in correctness and removes the truncation risk
        // entirely.
        const before = message.slice(0, idx + ref.length);
        if (CLOSING_KEYWORD_RE.test(before)) closedRefs.add(ref);
      }
      const hasUnclosedRef = [...seenRefs].some((ref) => !closedRefs.has(ref));
      if (hasUnclosedRef) {
        return {
          json: {
            systemMessage:
              'claude-tweaks: this commit references an issue number without a recognized GitHub ' +
              'closing keyword (Fixes/Closes/Resolves) immediately before it — it will not auto-close ' +
              'that issue when merged. If this commit fully resolves the issue, consider rewording ' +
              '(e.g. "Fixes #123").',
          },
        };
      }
    }
  }
  return null;
}

// Deferred-subproject capture nudge (warn tier). superpowers:brainstorming
// identifies oversized requests and defers all but the first sub-project to
// "later" with no durable tracking — they live only in conversation memory
// and are lost on /clear. This fires whenever a brainstorming design doc is
// written, unconditionally: it does not try to parse whether decomposition
// actually happened (unreliable prose classification), same "cheap false
// positive, no smart detection" precedent checkClosingKeyword sets above.
// Matching on the Write call itself (not "new file only") also means this
// re-fires if Step 7's self-review later revises the same design doc.
const DESIGN_DOC_PATH_RE = /(^|\/)docs\/superpowers\/specs\/[^/]+-design\.md$/;

function checkDesignDocWrite(ctx) {
  if (ctx.input.tool_name !== 'Write') return null;
  const filePath = ctx.input.tool_input && ctx.input.tool_input.file_path;
  if (typeof filePath !== 'string' || !DESIGN_DOC_PATH_RE.test(filePath)) return null;
  return {
    json: {
      systemMessage:
        'claude-tweaks: a design doc was just written under docs/superpowers/specs/. If ' +
        'brainstorming identified other independent sub-projects and deferred them to focus ' +
        'on this one, capture each deferred sub-project now via /claude-tweaks:capture — they ' +
        "aren't tracked anywhere else, and will be lost once this conversation clears.",
    },
  };
}

// Marketplace-mirror nudge (warn tier). This repo's own release convention
// (CLAUDE.md's "Releasing (two repos)") requires mirroring a plugin.json
// version bump into the separate claude-tweaks-marketplace repo's
// marketplace.json — a step with no code-level enforcement, missed twice in
// practice before this check existed. Fires unconditionally whenever a
// commit touches `.claude-plugin/plugin.json` at all, without trying to
// parse whether the change was actually a version bump (same "cheap false
// positive, no smart detection" precedent checkClosingKeyword and
// checkDesignDocWrite set above) — plugin.json changes for any other reason
// are rare enough that a false-positive reminder costs nothing.
//
// Scoped to this specific project via the committed file's own `name` field
// rather than the path alone: `.claude-plugin/plugin.json` is the standard
// manifest path for ANY Claude Code plugin repo, so an unscoped check would
// misfire with an irrelevant marketplace-mirror reminder in a completely
// unrelated plugin repo that happens to have this plugin active.
const PLUGIN_MANIFEST_PATH = '.claude-plugin/plugin.json';

function checkPluginVersionBump(recentByDir) {
  for (const [dir, commits] of recentByDir) {
    for (const commit of commits) {
      // Same freshness guard as checkClosingKeyword — don't judge a stale
      // HEAD left over from a `git commit` that never actually landed.
      if (commit.ts === null || Math.abs(Date.now() / 1000 - commit.ts) > COMMIT_FRESHNESS_WINDOW_SECONDS) continue;
      if (!commit.hash) continue;
      const changedFiles = execGit(['diff-tree', '--no-commit-id', '--name-only', '-r', commit.hash], dir);
      if (changedFiles === null || !changedFiles.split('\n').includes(PLUGIN_MANIFEST_PATH)) continue;
      const manifestAtCommit = execGit(['show', `${commit.hash}:${PLUGIN_MANIFEST_PATH}`], dir);
      if (manifestAtCommit === null) continue;
      let manifest;
      try {
        manifest = JSON.parse(manifestAtCommit);
      } catch {
        continue;
      }
      if (manifest.name !== 'claude-tweaks') continue;
      return {
        json: {
          systemMessage:
            'claude-tweaks: this commit touched .claude-plugin/plugin.json (likely a version bump). ' +
            "Remember to mirror the new version into the claude-tweaks-marketplace repo's " +
            'marketplace.json (plugins[].version) and push both repos — see CLAUDE.md\'s ' +
            '"Releasing (two repos)" section.',
        },
      };
    }
  }
  return null;
}

function run(ctx) {
  const command = ctx.input.tool_name === 'Bash' ? (ctx.input.tool_input && ctx.input.tool_input.command) : null;
  const hasCommand = typeof command === 'string' && !!command;
  // Computed once and shared below — the breadcrumb loop and the
  // closing-keyword check both need the same command/cwd's git targets.
  const targets = hasCommand ? gitTargets(command, ctx.cwd) : [];

  // Fetch each dir's own N most recent commits ONCE per dir (a single git
  // spawn returns hash + timestamp + message together), shared by both the
  // breadcrumb loop and the closing-keyword check below. N = how many
  // commit-action targets this command has for that dir, so a compound
  // command chaining multiple `git commit` statements against the same dir
  // gets each of its own real commits back, not the same current-HEAD
  // commit read N times. Oldest-first, to line up with `targets`' own
  // left-to-right command order (git log itself returns newest-first).
  const commitCountByDir = new Map();
  for (const t of targets) {
    if (t.action !== 'commit') continue;
    commitCountByDir.set(t.dir, (commitCountByDir.get(t.dir) || 0) + 1);
  }
  const recentByDir = new Map();
  for (const [dir, count] of commitCountByDir) recentByDir.set(dir, recentCommits(dir, count).reverse());
  const dirCursor = new Map();
  function nextCommitFor(dir) {
    const list = recentByDir.get(dir) || [];
    const idx = dirCursor.get(dir) || 0;
    dirCursor.set(dir, idx + 1);
    return idx < list.length ? list[idx] : null;
  }

  // E2: commit breadcrumbs (log tier) — gated on a resolved pipeline run, unchanged.
  if (ctx.runDir && hasCommand) {
    for (const target of targets) {
      const commit = target.action === 'commit' ? nextCommitFor(target.dir) : null;
      ctxLib.appendEvent(ctx.runDir, 'commit', {
        action: target.action,
        dir: target.dir,
        hash: commit ? commit.hash : undefined,
      });
    }
  }

  // Closing-keyword check (warn tier) — deliberately NOT gated on ctx.runDir.
  if (hasCommand) {
    const warning = checkClosingKeyword(recentByDir);
    if (warning) return warning;
  }

  // Deferred-subproject capture nudge (warn tier) — deliberately NOT gated on ctx.runDir.
  const designDocNudge = checkDesignDocWrite(ctx);
  if (designDocNudge) return designDocNudge;

  // Plugin-version-bump marketplace-mirror nudge (warn tier) — deliberately NOT gated on ctx.runDir.
  if (hasCommand) {
    const versionBumpNudge = checkPluginVersionBump(recentByDir);
    if (versionBumpNudge) return versionBumpNudge;
  }

  return {};
}

module.exports = { run };
