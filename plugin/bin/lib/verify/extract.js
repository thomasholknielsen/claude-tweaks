// plugin/bin/lib/verify/extract.js — content-sniffed output-family detection,
// bounded failing-region extraction, and suite-count parsing (#892, AC5).
// Family is sniffed from output CONTENT, never from the check's name. Counts
// fail toward absence: anything ambiguous returns null — a wrong count would
// poison #881's future drop-detection.
'use strict';

const MAX_REGION_LINES = 100;
const GENERIC_TAIL_LINES = 30;
const MAX_SUMMARY_CHARS = 200;
const MAX_LINE_CHARS = 500;

const TAP_MARKERS = [/^not ok\b/m, /^ok \d/m, /^# tests\b/m];
const SUMMARY_MARKERS = [/^FAIL /m, /^PASS /m, /^Tests:.*failed/m, /^=+ .*(passed|failed).*=+$/m];

function sniffFamily(text) {
  if (TAP_MARKERS.some((re) => re.test(text))) return 'tap';
  if (SUMMARY_MARKERS.some((re) => re.test(text))) return 'summary';
  return 'generic';
}

function cap(lines) {
  return lines.slice(0, MAX_REGION_LINES)
    .map((line) => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line))
    .join('\n');
}

function extractFailingRegion(text, family) {
  const lines = text.split('\n');
  if (family === 'tap') {
    // Each `not ok` line plus its trailing diagnostic block (node --test emits
    // the diagnostics AFTER the failure line — same reason verification.md's
    // old recipe used grep -A).
    const out = [];
    let inFailure = false;
    for (const line of lines) {
      if (/^not ok\b/.test(line)) { inFailure = true; out.push(line); continue; }
      if (/^(ok \d|# )/.test(line)) { inFailure = false; continue; }
      if (inFailure) out.push(line);
    }
    return cap(out);
  }
  if (family === 'summary') {
    // FAIL/Error regions (2 before, 20 after each anchor) plus the trailing
    // summary block, deduplicated by line index and kept in file order.
    const keep = new Set();
    lines.forEach((line, i) => {
      if (/^FAIL |^Error:/.test(line)) {
        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 20); j++) keep.add(j);
      }
      if (/^Tests:|^=+ .*(passed|failed).*=+$/.test(line)) keep.add(i);
    });
    return cap([...keep].sort((a, b) => a - b).map((i) => lines[i]));
  }
  return cap(lines.slice(-GENERIC_TAIL_LINES));
}

function num(match) {
  return match === null ? null : Number(match[1]);
}

function parseCounts(text, family) {
  if (family === 'tap') {
    const tests = num(text.match(/^# tests (\d+)/m));
    const pass = num(text.match(/^# pass (\d+)/m));
    const fail = num(text.match(/^# fail (\d+)/m));
    if (tests === null || pass === null || fail === null) return null;
    return { tests, pass, fail };
  }
  if (family === 'summary') {
    const lineMatch = text.match(/^Tests:.*$/m) || text.match(/^=+ .*(?:passed|failed).*=+$/m);
    if (lineMatch === null) return null;
    const line = lineMatch[0];
    let failed = num(line.match(/(\d+) failed/));
    let passed = num(line.match(/(\d+) passed/));
    const total = num(line.match(/(\d+) total/));
    if (failed === null && passed === null) return null;
    if (total !== null) {
      const KNOWN_CATEGORIES = ['failed', 'passed', 'skipped', 'pending', 'todo'];
      const pairs = [...line.matchAll(/(\d+) ([a-z]+)/gi)]
        .filter((m) => m[2].toLowerCase() !== 'total');
      const hasUnknownCategory = pairs.some((m) => !KNOWN_CATEGORIES.includes(m[2].toLowerCase()));
      if (!hasUnknownCategory) {
        const accounted = pairs.reduce((s, m) => s + Number(m[1]), 0);
        const missing = total - accounted;
        if (missing >= 0) {
          if (failed === null) failed = missing;
          else if (passed === null) passed = missing;
        }
      }
    }
    if (failed === null || passed === null) return null;
    return { tests: total === null ? passed + failed : total, pass: passed, fail: failed };
  }
  return null;
}

// One bounded line for the report table: the counts line when one parses,
// else the last non-empty line, truncated.
function summaryLine(text, family) {
  const counts = parseCounts(text, family);
  if (counts !== null) return `tests ${counts.tests}, pass ${counts.pass}, fail ${counts.fail}`;
  const lastLine = text.split('\n').filter((l) => l.trim() !== '').pop() || '';
  return lastLine.slice(0, MAX_SUMMARY_CHARS);
}

module.exports = {
  sniffFamily, extractFailingRegion, parseCounts, summaryLine,
  MAX_REGION_LINES, GENERIC_TAIL_LINES, MAX_LINE_CHARS,
};
