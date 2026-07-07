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
// resolve/resolves/resolved).
const CLOSING_KEYWORD_RE = /\b(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#\d+/i;
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

  return {};
}

module.exports = { run };
