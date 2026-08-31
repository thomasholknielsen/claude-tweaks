// tests/gh-graphql-owner-repo-placeholder-pin.test.js
// Repo-wide pin for #626: a `gh api graphql` invocation that passes an
// unsubstituted `{owner}`/`{repo}` brace placeholder via `-f owner=`/`-f repo=`
// silently sends the literal braces as a static string — `gh api -f` never
// substitutes them, so the query's `owner`/`repo` GraphQL variables resolve to
// the literal text `{owner}`/`{repo}` and the query returns `repository: null`
// instead of erroring (verified live during #608, generalized here from that
// single-file assertion into a repo-wide sweep across every skill file).
//
// Scoped narrowly to `gh api graphql` lines carrying a brace placeholder
// after `-f owner=`/`-f repo=` — never every `-f` usage in the corpus, which
// would false-positive on legitimate static-string `-f` flags elsewhere
// (e.g. `-f query=...`, `-f state=open`).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'plugin', 'skills');

// Any `gh api graphql` line carrying `-f owner=`/`-f repo=` immediately
// followed by a brace placeholder — quoted (`'{owner}'`, `"{owner}"`) or bare
// (`{owner}`). `-F owner={owner}`/`-F repo={repo}` (the fix) never matches,
// since the flag character itself differs.
const OFFENDING_PATTERN = /gh api graphql.*-f (owner|repo)=['"]?\{(owner|repo)\}/;

function walkMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdownFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function findOffendingLines(content) {
  const offenders = [];
  content.split('\n').forEach((line, idx) => {
    if (OFFENDING_PATTERN.test(line)) offenders.push({ line: idx + 1, text: line.trim() });
  });
  return offenders;
}

test('no plugin/skills/**/*.md line passes an unsubstituted {owner}/{repo} placeholder to `gh api graphql` via -f', () => {
  const offenders = [];
  for (const file of walkMarkdownFiles(SKILLS_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const hit of findOffendingLines(content)) {
      offenders.push(`${path.relative(REPO_ROOT, file)}:${hit.line}: ${hit.text}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('sanity: the offending pattern actually matches the pre-fix shape', () => {
  assert.match(
    "gh api graphql -f query='...' -f owner='{owner}' -f repo='{repo}' -F pr={number}",
    OFFENDING_PATTERN,
  );
});

test('sanity: the fixed -F shape does not match', () => {
  assert.doesNotMatch(
    'gh api graphql -f query=\'...\' -F owner={owner} -F repo={repo} -F pr={number}',
    OFFENDING_PATTERN,
  );
});

test('github-pr-scan.md line 38 uses -F owner={owner} -F repo={repo} (no quotes)', () => {
  const content = fs.readFileSync(
    path.join(SKILLS_DIR, '_shared', 'github-pr-scan.md'),
    'utf8',
  );
  assert.ok(content.includes('-F owner={owner} -F repo={repo} -F pr={number}'), content);
});
