// bin/lib/hooks/post-tool-use.js — E2: commit breadcrumbs (log tier) + closing-keyword check (warn tier).
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
function checkClosingKeyword(command, cwd) {
  const commitTargets = gitTargets(command, cwd).filter((t) => t.action === 'commit');
  for (const target of commitTargets) {
    const message = commitMessage(target.dir);
    if (!message) continue;
    const refs = message.match(BARE_ISSUE_REF_RE);
    if (!refs) continue;
    const hasUnclosedRef = refs.some((ref) => {
      const idx = message.indexOf(ref);
      const before = message.slice(Math.max(0, idx - 20), idx + ref.length);
      return !CLOSING_KEYWORD_RE.test(before);
    });
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

  // E2: commit breadcrumbs (log tier) — gated on a resolved pipeline run, unchanged.
  if (ctx.runDir && hasCommand) {
    for (const target of gitTargets(command, ctx.cwd)) {
      ctxLib.appendEvent(ctx.runDir, 'commit', {
        action: target.action,
        dir: target.dir,
        hash: target.action === 'commit' ? shortHead(target.dir) : undefined,
      });
    }
  }

  // Closing-keyword check (warn tier) — deliberately NOT gated on ctx.runDir.
  if (hasCommand) {
    const warning = checkClosingKeyword(command, ctx.cwd);
    if (warning) return warning;
  }

  // Deferred-subproject capture nudge (warn tier) — deliberately NOT gated on ctx.runDir.
  const designDocNudge = checkDesignDocWrite(ctx);
  if (designDocNudge) return designDocNudge;

  return {};
}

module.exports = { run };
