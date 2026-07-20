// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier) + closing-keyword check (warn tier) + design-doc capture nudge (warn tier).
'use strict';
const { execFileSync } = require('child_process');
const { gitTargets } = require('./git-command');
const ctxLib = require('./context');

// Hash reflects HEAD at hook time — PostToolUse has no success signal, so a failed commit logs the previous HEAD.
function shortHead(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
  } catch { return null; }
}

// Reads back the just-made commit's full message (subject + body) — avoids parsing
// the message out of the raw Bash command text, which this repo's own HEREDOC-based
// commit convention (`git commit -m "$(cat <<'EOF' ... EOF)"`) makes brittle. Same
// "ask git, don't reparse the shell" approach shortHead() already uses.
function commitMessage(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%B'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    });
  } catch { return null; }
}

// HEAD's committer timestamp (unix seconds), used by checkClosingKeyword to tell
// a genuinely fresh commit apart from an unrelated prior one still sitting at HEAD
// because the just-attempted `git commit` didn't actually land (pre-commit hook
// rejection, "nothing to commit", merge conflict, etc.) — PostToolUse fires
// regardless of exit code, so without this, reading HEAD back could silently judge
// a completely different, older commit instead of the (nonexistent) new one.
function commitTimestamp(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%ct'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    }).trim();
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// How recent HEAD's commit timestamp must be for checkClosingKeyword to trust it
// as the outcome of the just-attempted commit, rather than a stale prior commit.
// Generous enough to absorb hook-dispatch latency and clock skew without letting a
// genuinely unrelated older commit through.
const COMMIT_FRESHNESS_WINDOW_SECONDS = 30;

// A recognized GitHub closing keyword immediately preceding a bare "#123" auto-closes
// that issue when the commit reaches the repository's default branch. Case-insensitive;
// covers every form GitHub recognizes (fix/fixes/fixed, close/closes/closed,
// resolve/resolves/resolved). The trailing `$` anchors this to the END of whatever
// substring it's tested against (see hasUnclosedRef below, which always tests a slice
// ending exactly at the current ref) — without it, "Fixes #100, #200" would wrongly
// read as closing #200 too, since "Fixes #100" sits inside the lookback window before
// #200 even though the keyword only ever applied to #100. GitHub requires the keyword
// immediately before EACH ref it closes ("Fixes #100, fixes #200"); a bare trailing
// ref after a comma is exactly the gotcha this check exists to catch.
const CLOSING_KEYWORD_RE = /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#\d+$/i;
const BARE_ISSUE_REF_RE = /#\d+/g;

// Deliberately NOT gated on ctx.runDir, unlike the breadcrumb logic below — the
// motivating case is exactly a commit made outside any pipeline run (ad hoc fix
// work that references an issue number without going through /specify -> /build
// -> /wrap-up, where the closing-keyword carrier-commit mechanism already exists).
// Harness-wide, not code-health-specific: fires for any bare issue reference,
// including harness-health-labelled or human-filed issues.
function checkClosingKeyword(targets) {
  const commitTargets = targets.filter((t) => t.action === 'commit');
  for (const target of commitTargets) {
    // Guard against a `git commit` that never actually landed — see
    // commitTimestamp()'s comment. If HEAD isn't fresh, skip this target
    // entirely rather than judging an unrelated prior commit.
    const ts = commitTimestamp(target.dir);
    if (ts === null || Math.abs(Date.now() / 1000 - ts) > COMMIT_FRESHNESS_WINDOW_SECONDS) continue;
    const message = commitMessage(target.dir);
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

function run(ctx) {
  const command = ctx.input.tool_name === 'Bash' ? (ctx.input.tool_input && ctx.input.tool_input.command) : null;
  const hasCommand = typeof command === 'string' && !!command;
  // Computed once and shared below — the breadcrumb loop and the
  // closing-keyword check both need the same command/cwd's git targets.
  const targets = hasCommand ? gitTargets(command, ctx.cwd) : [];

  // E2: commit breadcrumbs (log tier) — gated on a resolved pipeline run, unchanged.
  if (ctx.runDir && hasCommand) {
    for (const target of targets) {
      ctxLib.appendEvent(ctx.runDir, 'commit', {
        action: target.action,
        dir: target.dir,
        hash: target.action === 'commit' ? shortHead(target.dir) : undefined,
      });
    }
  }

  // Closing-keyword check (warn tier) — deliberately NOT gated on ctx.runDir.
  if (hasCommand) {
    const warning = checkClosingKeyword(targets);
    if (warning) return warning;
  }

  // Deferred-subproject capture nudge (warn tier) — deliberately NOT gated on ctx.runDir.
  const designDocNudge = checkDesignDocWrite(ctx);
  if (designDocNudge) return designDocNudge;

  return {};
}

module.exports = { run };
