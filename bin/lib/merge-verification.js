// bin/lib/merge-verification.js — derived default for the `merge-verification`
// policy key (#559): how much CI verification a merge into the integration
// branch requires. The four-branch ladder is stated in prose exactly once, in
// skills/_shared/policy-schema.md's merge-verification coverage block; this
// file is its code twin, the same way bin/lib/policy-schema.js's
// detectIntegrationModel twins skills/_shared/forge-detection.md.
//
// A flat sibling of policy-schema.js rather than part of it: branch (3)/(4)
// reuses bin/lib/hooks/worktree-reap.js's resolveIntegrationBranch — the shared
// code resolver for skills/_shared/integration-branch.md's rank 3 (policy.yml)
// + rank-5 GitHub-default half — and worktree-reap.js -> bin/lib/policy.js ->
// policy-schema.js would make that a require cycle. Never hand-roll branch
// detection here; cite the fragment.
//
// Every branch fails toward 'off' (the permissive default), never toward the
// stricter value. Zero runtime npm deps: no YAML library — the on: trigger
// detector below is line-based and deliberately shallow.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolvePolicyKeys, resolveIntegrationModel } = require('./policy-schema');
const { resolveIntegrationBranch } = require('./hooks/worktree-reap');

const PR_TRIGGERS = new Set(['pull_request', 'pull_request_target']);

function stripQuotes(s) {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

function stripComment(s) {
  const idx = s.indexOf(' #');
  return (idx === -1 ? s : s.slice(0, idx)).trim();
}

// True iff the workflow's top-level `on:` (col 0; `on`, 'on', or "on") names
// pull_request or pull_request_target — as a bare scalar, inside a flow array
// [a, b], as a flow-mapping key { pull_request: … }, as a block-list item
// (`  - pull_request`), or as a block-mapping key at the trigger indent
// (`  pull_request:`). Keys nested deeper than the trigger level (e.g. a
// `branches:` under push:) never count. Trigger PRESENCE is the proxy for "CI
// verification is requested" — enforcement (branch protection) is out of scope.
function workflowHasPullRequestTrigger(text) {
  if (typeof text !== 'string' || !text) return false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:on|'on'|"on")\s*:(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = stripComment(m[1]);
    if (rest) {
      if (rest.startsWith('[')) {
        return rest.replace(/^\[|\]$/g, '').split(',').map(stripQuotes).some((k) => PR_TRIGGERS.has(k));
      }
      if (rest.startsWith('{')) {
        return [...rest.matchAll(/(['"]?)([A-Za-z_]+)\1\s*:/g)].some((x) => PR_TRIGGERS.has(x[2]));
      }
      return PR_TRIGGERS.has(stripQuotes(rest));
    }
    // Block form: the trigger level is the indent of the first non-blank,
    // non-comment line after `on:`; only lines at exactly that indent count.
    let triggerIndent = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = /^(\s*)/.exec(line)[1].length;
      if (indent === 0) break; // next top-level key — end of the on: block
      if (triggerIndent === null) triggerIndent = indent;
      if (indent !== triggerIndent) continue;
      const item = /^\s*-\s*(['"]?[A-Za-z_]+['"]?)\s*(?:#.*)?$/.exec(line);
      if (item && PR_TRIGGERS.has(stripQuotes(item[1]))) return true;
      const key = /^\s*(['"]?[A-Za-z_]+['"]?)\s*:/.exec(line);
      if (key && PR_TRIGGERS.has(stripQuotes(key[1]))) return true;
    }
    return false;
  }
  return false;
}

// Reads every *.yml / *.yaml directly under {root}/.github/workflows. An
// absent directory is the ordinary "no CI" case and returns []; any other fs
// error throws so hasPullRequestCi can degrade uniformly.
function readWorkflowFiles(repoRoot) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((n) => /\.ya?ml$/i.test(n))
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

// Detection is GitHub Actions-only by intent (spec Non-Goals): a repo on
// another CI system reads as "no PR CI" and opts in with an explicit value.
// Never throws — a read/parse failure resolves toward `off` in the ladder.
function hasPullRequestCi(repoRoot, { readWorkflows = readWorkflowFiles } = {}) {
  try {
    return readWorkflows(repoRoot).some((f) => workflowHasPullRequestTrigger(f && f.text));
  } catch {
    return false;
  }
}

module.exports = { workflowHasPullRequestTrigger, readWorkflowFiles, hasPullRequestCi };
