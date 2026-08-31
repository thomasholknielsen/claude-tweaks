'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Live-corpus scan (not a frozen fixture): #626 fixed one instance of this defect
// (`plugin/skills/_shared/github-pr-scan.md` line 29) and this test generalizes #608's
// single-file pin (the identical defect in `record-creation.md`'s databaseId lookup) into
// a repo-wide sweep over every skill file. `gh api -f` sends its value as a static string —
// a brace placeholder like `{owner}` used with `-f` is passed through literally instead of
// being substituted, and the query silently resolves `repository: null`. `-F` is the
// already-resolved-value mechanism and is what every `gh api graphql` call must use for a
// brace-placeholder field value.
//
// Scoped narrowly to `gh api graphql` lines carrying `-f owner=`/`-f repo=` followed by an
// unsubstituted `{owner}`/`{repo}` placeholder — not every `-f` usage in the corpus, since a
// legitimate static-string `-f` (e.g. a literal, already-resolved value) is not this defect.

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');

// Matches `-f owner='{owner}'`, `-f owner={owner}`, `-f repo='{repo}'`, `-f repo={repo}` —
// quoted or unquoted, as long as the value is the literal unsubstituted placeholder.
const BAD_FLAG_PATTERN = /-f\s+(owner|repo)=(['"]?)\{\1\}\2/;

function findAllMdFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findAllMdFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// Returns line numbers where a `gh api graphql` invocation carries a bad `-f owner=`/
// `-f repo=` placeholder flag. Only lines that also mention `gh api graphql` are checked,
// so this never flags an unrelated `-f owner=`/`-f repo=` usage elsewhere in the corpus.
function findBadPlaceholderFlagLines(text) {
  const lines = text.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('gh api graphql')) continue;
    if (BAD_FLAG_PATTERN.test(line)) hits.push(i + 1);
  }
  return hits;
}

// --- Proof the check can go red (synthetic fixtures) ---

test('findBadPlaceholderFlagLines: flags -f owner=\'{owner}\' -f repo=\'{repo}\' on a gh api graphql line', () => {
  const bad = [
    '```bash',
    "gh api graphql -f query='...' -f owner='{owner}' -f repo='{repo}' -F pr={number}",
    '```',
  ].join('\n');
  assert.deepStrictEqual(findBadPlaceholderFlagLines(bad), [2]);
});

test('findBadPlaceholderFlagLines: flags an unquoted -f owner={owner}', () => {
  const bad = "gh api graphql -f query='...' -f owner={owner} -F repo={repo}";
  assert.deepStrictEqual(findBadPlaceholderFlagLines(bad), [1]);
});

test('findBadPlaceholderFlagLines: passes when the line uses -F owner={owner} -F repo={repo}', () => {
  const good = "gh api graphql -f query='...' -F owner={owner} -F repo={repo} -F pr={number}";
  assert.deepStrictEqual(findBadPlaceholderFlagLines(good), []);
});

test('findBadPlaceholderFlagLines: ignores -f owner=/-f repo= on a line with no gh api graphql', () => {
  const notGraphql = "some other command -f owner='{owner}' -f repo='{repo}'";
  assert.deepStrictEqual(findBadPlaceholderFlagLines(notGraphql), []);
});

test('findBadPlaceholderFlagLines: ignores an already-resolved static -f value', () => {
  const resolved = "gh api graphql -f query='...' -f owner=acme -f repo=widgets";
  assert.deepStrictEqual(findBadPlaceholderFlagLines(resolved), []);
});

// --- Live-corpus sweep ---

test('no gh api graphql line under plugin/skills/**/*.md passes -f owner=/-f repo= with an unsubstituted brace placeholder', () => {
  const files = findAllMdFiles(SKILLS_DIR);
  const failures = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const lineNumber of findBadPlaceholderFlagLines(text)) {
      failures.push(`${path.relative(ROOT, file)}:${lineNumber}`);
    }
  }
  assert.deepStrictEqual(
    failures,
    [],
    '`gh api graphql` line(s) using -f owner=/-f repo= with a brace placeholder instead of ' +
      `-F (see #626, #608): ${failures.join(', ')}`,
  );
});
