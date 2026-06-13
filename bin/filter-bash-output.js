#!/usr/bin/env node
const fs = require('fs');
const paths = require('./lib/paths');
const jsonl = require('./lib/jsonl');

const TOOL_FILTER_THRESHOLD = 16000;
const SUMMARY_HEAD_LINES = 30;
const SUMMARY_TAIL_LINES = 40;
const MAX_FAILURE_LINES = 80;
const DISPLAY_FAILURE_LINES = 60;

// Grouping kicks in only when a clear majority of lines share the expected
// shape — otherwise we fall back to dedupe + head/tail clip.
const GROUP_MIN_LINES = 8;
const GROUP_MAX_BUCKETS_SHOWN = 25;
const PATH_GROUP_RATIO = 0.6;
const RULE_GROUP_RATIO = 0.5;
const TEST_SUMMARY_DISPLAY = 12;

const NOISY_COMMAND_RE =
  /\b(test|pytest|vitest|jest|mocha|rspec|cargo\s+test|go\s+test|npm\s+test|pnpm\s+test|yarn\s+test|build|tsc|eslint|ruff|mypy|grep|rg|find|ls|cat|tail|docker|kubectl|journalctl|playwright)\b/i;

const FAILURE_RE =
  /(error|failed|failure|exception|traceback|panic|assert|expected|received|FAIL|FAILED|✕|×|[\w./-]+:\d+(?::\d+)?)/i;

// Aggregate test-runner summary lines (cargo / jest / vitest / pytest / mocha …).
// These are the "262 passed; 0 failed" lines — far more useful to an AI than the
// individual per-test "ok" noise, which dedupe/clip collapses away.
const TEST_SUMMARY_RE = new RegExp(
  [
    'test result:', // cargo
    'tests?:\\s+\\d', // jest "Tests: 1 failed, 5 passed"
    'test suites?:\\s+\\d', // jest "Test Suites: 1 failed"
    '\\d+\\s+pass(?:ed|ing)\\b', // "12 passed", "5 passing"
    '\\d+\\s+fail(?:ed|ing|ures?)\\b', // "1 failed", "1 failing", "2 failures"
    '\\d+\\s+(?:passed|failed|skipped|ignored)\\b.*\\b(?:in|total)\\b', // pytest line
  ].join('|'),
  'i',
);

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

function clipLines(lines, head, tail) {
  if (lines.length <= head + tail) return lines;
  const clipped = lines.length - head - tail;
  return [...lines.slice(0, head), `... clipped ${clipped} lines ...`, ...lines.slice(-tail)];
}

// Collapse runs of identical adjacent lines into "<line>  (×N)". Blank-line runs
// collapse to a single blank without an annotation.
function dedupeLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; ) {
    let n = 1;
    while (i + n < lines.length && lines[i + n] === lines[i]) n += 1;
    if (lines[i].trim() === '') out.push(lines[i]);
    else out.push(n > 1 ? `${lines[i]}  (×${n})` : lines[i]);
    i += n;
  }
  return out;
}

function testSummaryLines(text) {
  const seen = new Set();
  const out = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (t && TEST_SUMMARY_RE.test(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// Extract a file path from a line, stripping common VCS/status prefixes
// (" M ", "?? ", "A  ", "modified: "). Returns null when the line is not a
// single path token with a directory component.
function pathFromLine(line) {
  let t = line.trim();
  t = t.replace(/^(modified:|new file:|deleted:|renamed:|copied:)\s+/i, '');
  t = t.replace(/^[?AMDRUC!]{1,2}\s+/, '');
  if (!t || /\s/.test(t)) return null;
  if (!t.includes('/')) return null;
  if (!/^[\w.@~+/-]+$/.test(t)) return null;
  return t;
}

function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i + 1) : './';
}

function histogram(label, entries) {
  const sorted = [...entries.entries()].sort((a, b) => b[1] - a[1]);
  const out = [label];
  for (const [key, n] of sorted.slice(0, GROUP_MAX_BUCKETS_SHOWN)) out.push(`- ${key} — ${n}`);
  if (sorted.length > GROUP_MAX_BUCKETS_SHOWN) {
    out.push(`- … ${sorted.length - GROUP_MAX_BUCKETS_SHOWN} more`);
  }
  return out;
}

// Group file-listing output (git status, ls, find) by directory.
function groupByDirectory(lines) {
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const paths = [];
  for (const l of lines) {
    const p = pathFromLine(l);
    if (p) paths.push(p);
  }
  if (paths.length < GROUP_MIN_LINES || !nonEmpty || paths.length / nonEmpty < PATH_GROUP_RATIO) {
    return null;
  }
  const buckets = new Map();
  for (const p of paths) buckets.set(dirOf(p), (buckets.get(dirOf(p)) || 0) + 1);
  return histogram(`Files by directory (${paths.length} paths, ${buckets.size} dirs):`, buckets);
}

function ruleFromLine(line) {
  const t = line.trim();
  // ruff / flake8 / pylint / clippy style code: E501, F401, W0612, C0114…
  const code = t.match(/\b([A-Z]{1,4}\d{2,4})\b/);
  if (code) return code[1];
  // eslint stylish: "12:5  error  message text  rule-id"
  const es = t.match(/^\d+:\d+\s+(?:error|warning)\s+.+?\s+(\S+)$/i);
  if (es) return es[1];
  return null;
}

// Consolidate lint findings by rule id.
function groupByRule(lines) {
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const rules = [];
  for (const l of lines) {
    const r = ruleFromLine(l);
    if (r) rules.push(r);
  }
  if (rules.length < GROUP_MIN_LINES || !nonEmpty || rules.length / nonEmpty < RULE_GROUP_RATIO) {
    return null;
  }
  const buckets = new Map();
  for (const r of rules) buckets.set(r, (buckets.get(r) || 0) + 1);
  return histogram(`Lint findings by rule (${rules.length} findings, ${buckets.size} rules):`, buckets);
}

// Compact one output stream: prefer grouping when the shape is recognizable,
// otherwise dedupe identical runs and clip head/tail.
function compactExcerpt(text) {
  const lines = text.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return (
    groupByRule(lines) ||
    groupByDirectory(lines) ||
    clipLines(dedupeLines(lines), SUMMARY_HEAD_LINES, SUMMARY_TAIL_LINES)
  );
}

function summarize(command, stdout, stderr, exitCode) {
  const combined = [];
  if (stdout) combined.push(['stdout', stdout]);
  if (stderr) combined.push(['stderr', stderr]);

  const testSummary = testSummaryLines(`${stdout}\n${stderr}`);

  let errorLines = [];
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
  errorLines = dedupeLines(errorLines);

  const out = [
    'claude-tweaks compacted noisy Bash output.',
    `Command: \`${command}\``,
    `Exit code: ${exitCode}`,
    `Failure/error lines detected: ${totalFailures}`,
    '',
  ];

  if (testSummary.length > 0) {
    out.push('Test summary:');
    for (const line of testSummary.slice(0, TEST_SUMMARY_DISPLAY)) {
      out.push(`- ${line}`);
    }
    out.push('');
  }

  if (errorLines.length > 0) {
    out.push('Relevant failure/error lines:');
    for (const line of errorLines.slice(0, DISPLAY_FAILURE_LINES)) {
      out.push(`- ${line}`);
    }
    out.push('');
  }

  if (stdout) {
    out.push('Stdout excerpt:');
    out.push(...compactExcerpt(stdout));
    out.push('');
  }
  if (stderr) {
    out.push('Stderr excerpt:');
    out.push(...compactExcerpt(stderr));
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

module.exports = {
  decide,
  summarize,
  estimateTokens,
  dedupeLines,
  testSummaryLines,
  groupByDirectory,
  groupByRule,
  NOISY_COMMAND_RE,
  FAILURE_RE,
  TEST_SUMMARY_RE,
  TOOL_FILTER_THRESHOLD,
};
