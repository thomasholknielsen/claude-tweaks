#!/usr/bin/env node
const fs = require('fs');
const paths = require('./lib/paths');
const jsonl = require('./lib/jsonl');

const TOOL_FILTER_THRESHOLD = 16000;
const SUMMARY_HEAD_LINES = 30;
const SUMMARY_TAIL_LINES = 40;
const MAX_FAILURE_LINES = 80;
const DISPLAY_FAILURE_LINES = 60;

const NOISY_COMMAND_RE =
  /\b(test|pytest|vitest|jest|mocha|rspec|cargo\s+test|go\s+test|npm\s+test|pnpm\s+test|yarn\s+test|build|tsc|eslint|ruff|mypy|grep|rg|find|ls|cat|tail|docker|kubectl|journalctl|playwright)\b/i;

const FAILURE_RE =
  /(error|failed|failure|exception|traceback|panic|assert|expected|received|FAIL|FAILED|✕|×|[\w./-]+:\d+(?::\d+)?)/i;

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function clipLines(text, head, tail) {
  const lines = text.split('\n');
  if (lines.length <= head + tail) return lines;
  const clipped = lines.length - head - tail;
  return [...lines.slice(0, head), `... clipped ${clipped} lines ...`, ...lines.slice(-tail)];
}

function summarize(command, stdout, stderr, exitCode) {
  const combined = [];
  if (stdout) combined.push(['stdout', stdout]);
  if (stderr) combined.push(['stderr', stderr]);

  const errorLines = [];
  let totalFailures = 0;
  for (const [label, text] of combined) {
    for (const line of text.split('\n')) {
      if (FAILURE_RE.test(line)) {
        totalFailures += 1;
        if (errorLines.length < MAX_FAILURE_LINES) {
          errorLines.push(`${label}: ${line}`);
        }
      }
    }
  }

  const out = [
    'claude-tweaks compacted noisy Bash output.',
    `Command: \`${command}\``,
    `Exit code: ${exitCode}`,
    `Failure/error lines detected: ${totalFailures}`,
    '',
  ];

  if (errorLines.length > 0) {
    out.push('Relevant failure/error lines:');
    for (const line of errorLines.slice(0, DISPLAY_FAILURE_LINES)) {
      out.push(`- ${line}`);
    }
    out.push('');
  }

  if (stdout) {
    out.push('Stdout excerpt:');
    out.push(...clipLines(stdout, SUMMARY_HEAD_LINES, SUMMARY_TAIL_LINES));
    out.push('');
  }
  if (stderr) {
    out.push('Stderr excerpt:');
    out.push(...clipLines(stderr, SUMMARY_HEAD_LINES, SUMMARY_TAIL_LINES));
  }

  return out.join('\n').trim();
}

function decide(rawChars, noisy, failed) {
  if (rawChars < TOOL_FILTER_THRESHOLD) return false;
  if (noisy && failed) return true;
  if (noisy && rawChars >= TOOL_FILTER_THRESHOLD * 2) return true;
  if (rawChars >= TOOL_FILTER_THRESHOLD * 4) return true;
  return false;
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.stdout.write('{}');
    return 0;
  }

  const toolInput = payload.tool_input || {};
  const response = payload.tool_response || {};
  const command = String(toolInput.command || toolInput.cmd || '');
  const stdout = String(response.stdout || response.output || '');
  const stderr = String(response.stderr || '');
  const exitCode = response.exit_code !== undefined ? response.exit_code : response.status !== undefined ? response.status : 'unknown';
  const sessionId = payload.session_id || '';

  const rawChars = stdout.length + stderr.length;
  const rawTokens = estimateTokens(stdout + stderr);
  const exitFailure = !['0', 'success', 'true', 'none'].includes(String(exitCode).toLowerCase());
  const noisy = NOISY_COMMAND_RE.test(command);
  const shouldFilter = decide(rawChars, noisy, exitFailure);

  const ts = Date.now();
  let logPath = null;
  if (rawChars > 0) {
    logPath = paths.bashLogPath(ts);
    try {
      fs.writeFileSync(logPath, `$ ${command}\n--- exit ${exitCode} ---\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`);
    } catch (err) {
      process.stderr.write(`claude-tweaks: failed to write raw log: ${err.message}\n`);
      logPath = null;
    }
  }

  const event = {
    ts,
    session_id: sessionId,
    command,
    raw_tokens: rawTokens,
    summary_tokens: rawTokens,
    blocked: 0,
    exit_code: exitCode,
    filtered: shouldFilter,
  };

  if (!shouldFilter) {
    jsonl.appendEvent(paths.filterEventsPath(), event);
    process.stdout.write('{}');
    return 0;
  }

  let summary = summarize(command, stdout, stderr, exitCode);
  if (logPath) summary += `\n\n[full output: ${logPath}]`;

  const summaryTokens = estimateTokens(summary);
  event.summary_tokens = summaryTokens;
  event.blocked = Math.max(0, rawTokens - summaryTokens);
  jsonl.appendEvent(paths.filterEventsPath(), event);

  const out = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: summary,
    },
  };
  process.stdout.write(JSON.stringify(out));
  return 0;
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`claude-tweaks filter error: ${err.message}\n`);
    process.stdout.write('{}');
    process.exit(0);
  });
}

module.exports = { decide, summarize, estimateTokens, NOISY_COMMAND_RE, FAILURE_RE, TOOL_FILTER_THRESHOLD };
