// tests/github-pr-scan-graphql-owner-repo-flag.test.js
//
// #626: `gh api -f` sends its value as a static string, so `-f owner='{owner}'` /
// `-f repo='{repo}'` never trigger gh's own `{owner}`/`{repo}` current-repo expansion — that
// expansion is `-F`-only. Verified live during #608 (the identical defect in
// record-creation.md's databaseId lookup: `-f` produced "Could not resolve to a Repository
// with the name '{owner}/{repo}'", `-F` resolved correctly). This suite generalizes #608's
// single-file pin into a repo-wide sweep over every fenced `gh api graphql` invocation under
// `plugin/skills/**/*.md`.
//
// Live-corpus scan, deliberately not a frozen fixture — per skill-prose-conformance-tests'
// Decision Framework, this is the "documented convention this project wants enforced against
// every future addition" case: the whole point is to catch a *future* `gh api graphql` snippet
// that repeats the flag mistake, so freezing the input would defeat the suite's purpose.
//
// Scope: fenced (```) code blocks only, not inline `` ` `` spans — per
// skill-prose-conformance-tests' "Sweep code regions, not the whole file, when prose may say
// what commands may not". A fenced block is a "run exactly" copy-paste snippet (the actual risk
// surface both #608 and #626 were caught in); an inline span is a descriptive prose mention of
// what a command looks like (e.g. `demo/entry-paths.md`'s "run via `gh api graphql -f
// owner="{owner}" ...`" — explanatory text embedded in a sentence, not a snippet meant to be
// copy-pasted verbatim). Narrowing to fences is also the literal Gotchas instruction on this
// record: "not every -f usage in the corpus, or it will false-positive on legitimate
// static-string -f flags elsewhere."
//
// Field-scoped, not "every -f usage": the pattern below only matches `-f owner=`/`-f repo=`
// whose value is the literal `{owner}`/`{repo}` brace token — a `gh api graphql` line's own
// `-f query='...{...}...'` GraphQL query body is wall-to-wall curly braces and would false-
// positive under any broader "-f flag near a brace" scan.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');

// A `-f owner=`/`-f repo=` flag whose value is the literal, unsubstituted `{owner}`/`{repo}`
// brace token — quoted (single or double) or bare. Only `-F` triggers gh's own current-repo
// expansion for that literal string; `-f` sends it through as static text.
const DEFECT_PATTERN = /-f\s+(?:owner|repo)=(['"]?)\{(?:owner|repo)\}\1/;

// Every ```-fenced code block in a markdown file, verbatim (fence markers included).
function codeFences(text) {
  return text.match(/```[\s\S]*?```/g) ?? [];
}

function findAllMdFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findAllMdFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// text -> [{ lineNumber, line }] for every fenced line that both invokes `gh api graphql` and
// carries the defect pattern. Single-line scoped (matches both known real instances, #608 and
// #626); a defect split across a backslash line-continuation is not caught by this sweep.
function findGraphqlOwnerRepoDefects(text) {
  const hits = [];
  for (const fence of codeFences(text)) {
    const fenceStartLine = text.slice(0, text.indexOf(fence)).split('\n').length;
    const lines = fence.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('gh api graphql') && DEFECT_PATTERN.test(line)) {
        hits.push({ lineNumber: fenceStartLine + i, line });
      }
    }
  }
  return hits;
}

// --- Proof the check can go red (synthetic fixtures, per skill-prose-conformance-tests'
// go-red guidance) ---

test('findGraphqlOwnerRepoDefects: flags the pre-fix github-pr-scan.md shape (single-quoted)', () => {
  const text =
    "```bash\n" +
    "gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){...}' " +
    "-f owner='{owner}' -f repo='{repo}' -F pr={number}\n" +
    '```';
  const hits = findGraphqlOwnerRepoDefects(text);
  assert.strictEqual(hits.length, 1, 'must go red on the pre-fix single-quoted -f owner/-f repo shape');
});

test('findGraphqlOwnerRepoDefects: flags the #608 double-quoted shape too', () => {
  const text =
    '```bash\n' +
    'gh api graphql -f query=\'query{ databaseId }\' -f owner="{owner}" -f repo="{repo}"\n' +
    '```';
  const hits = findGraphqlOwnerRepoDefects(text);
  assert.strictEqual(hits.length, 1, 'must go red on the double-quoted -f owner/-f repo shape');
});

test('findGraphqlOwnerRepoDefects: passes on the fixed -F owner/-F repo shape', () => {
  const text =
    "```bash\n" +
    "gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){...}' " +
    "-F owner={owner} -F repo={repo} -F pr={number}\n" +
    '```';
  assert.deepStrictEqual(findGraphqlOwnerRepoDefects(text), []);
});

test('findGraphqlOwnerRepoDefects: passes on an already-resolved -f owner/-f repo value (no brace)', () => {
  const text =
    '```bash\n' +
    'gh api graphql -f query=\'...\' \\\n' +
    '  -f owner="$(echo "$OWNER_REPO" | cut -d\' \' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d\' \' -f2)"\n' +
    '```';
  assert.deepStrictEqual(findGraphqlOwnerRepoDefects(text), []);
});

test('findGraphqlOwnerRepoDefects: ignores the defect shape outside a fenced code block (inline prose mention)', () => {
  // Mirrors the shape of a descriptive inline mention — e.g. "run via `gh api graphql -f
  // owner="{owner}" -f repo="{repo}" ...`" inside a numbered-list sentence, not a fenced
  // "run exactly" snippet. Constructed synthetically per skill-prose-conformance-tests'
  // guidance against retyping a live file's pinned literal from memory.
  const text =
    '1. Resolve the parent — run via `gh api graphql -f owner="{owner}" -f repo="{repo}" ' +
    "-f query=\"...\"` — `-f` for owner/repo here, not `-F` (see rationale).\n";
  assert.deepStrictEqual(findGraphqlOwnerRepoDefects(text), []);
});

test('findGraphqlOwnerRepoDefects: ignores a non-graphql -f owner/-f repo line', () => {
  const text = "```bash\ngh api repos/x -f owner='{owner}' -f repo='{repo}'\n```";
  assert.deepStrictEqual(findGraphqlOwnerRepoDefects(text), []);
});

// --- Live-corpus sweep ---

test('no fenced `gh api graphql` line under plugin/skills/**/*.md passes -f owner=/-f repo= with an unsubstituted brace placeholder', () => {
  const files = findAllMdFiles(SKILLS_DIR);
  const failures = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const hit of findGraphqlOwnerRepoDefects(text)) {
      failures.push(`${path.relative(ROOT, file)}:${hit.lineNumber}`);
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    '`gh api graphql` invocation(s) passing -f owner=/-f repo= with an unsubstituted brace ' +
      `placeholder instead of -F (see _shared/gh-api-module-pattern skill's -f/-F table): ${failures.join(', ')}`,
  );
});
