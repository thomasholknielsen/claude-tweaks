'use strict';
const fs = require('fs');

// --issues <file> is an array of { number, state, labels, fingerprint }
// objects (the shape gh issue list + fingerprint extraction produces).
// decide() expects a map { "<fingerprint>": { number, state, labels } }.
// Shared by all four health-suite CLIs' validate-findings — previously
// duplicated near-verbatim in each (code-health.js, harness-health.js,
// journey-health.js, docs-health.js), differing only in the bracketed
// [toolName] prefix on its stderr diagnostics.
function loadIssueIndex(file, toolName) {
  if (!file) return {};
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`[${toolName}] validate-findings: could not read or parse --issues file: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  if (!Array.isArray(arr)) {
    process.stderr.write(`[${toolName}] validate-findings: --issues file must contain a JSON array: ${file} — dedup falls back to the local cache only\n`);
    return {};
  }
  const index = {};
  for (const issue of arr) {
    if (!issue || typeof issue !== 'object') {
      process.stderr.write(`[${toolName}] loadIssueIndex: skipping malformed issue entry\n`);
      continue;
    }
    if (issue.fingerprint) {
      index[issue.fingerprint] = { number: issue.number, state: issue.state, labels: issue.labels || [] };
    }
  }
  return index;
}

module.exports = { loadIssueIndex };
