'use strict';

// Pins the two native-linking write snippets in skills/specify/record-creation.md
// Step 4 (work-backend: github-issues, work-links: native). Both were wrong or
// missing once (#608): the sub_issues endpoint takes the sub-issue's database ID,
// not its number, and the blocked_by dependency endpoint was described but never
// named. This test discriminates on the identifier kind, so a future edit cannot
// quietly reintroduce the number.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'skills', 'specify', 'record-creation.md');
const text = fs.readFileSync(FILE, 'utf8');

test('sub_issues write sends the database ID, never the issue number', () => {
  assert.doesNotMatch(
    text,
    /sub_issue_id=\$SUB_ISSUE_NUM\b/,
    'record-creation.md still passes $SUB_ISSUE_NUM to sub_issues — the endpoint takes the database ID',
  );
  assert.match(
    text,
    /sub_issue_id=\$SUB_ISSUE_DB_ID\b/,
    'record-creation.md must show the sub_issues write with sub_issue_id=$SUB_ISSUE_DB_ID',
  );
});

test('blocked_by dependency endpoint is named, with a database-ID identifier', () => {
  assert.match(
    text,
    /dependencies\/blocked_by/,
    'record-creation.md must name the POST issues/{n}/dependencies/blocked_by endpoint',
  );
  assert.match(
    text,
    /-F issue_id=\$BLOCKER_DB_ID\b/,
    'the blocked_by write must send -F issue_id=$BLOCKER_DB_ID',
  );
});

test('a databaseId resolution precedes both write calls', () => {
  const idx = text.indexOf('gh api graphql');
  const subIdx = text.indexOf('sub_issue_id=$SUB_ISSUE_DB_ID');
  const depIdx = text.indexOf('dependencies/blocked_by');
  assert.ok(
    idx > -1,
    'record-creation.md must resolve databaseId via a gh api graphql lookup before linking',
  );
  assert.ok(subIdx > idx, 'the databaseId lookup must appear before the sub_issues write');
  assert.ok(depIdx > idx, 'the databaseId lookup must appear before the blocked_by write');
});

test('the databaseId lookup passes {owner}/{repo} with -F, never -f', () => {
  assert.match(
    text,
    /-F owner=\{owner\} -F repo=\{repo\}/,
    'the graphql lookup must use -F for {owner}/{repo} — -f sends the literal braces',
  );
  assert.doesNotMatch(
    text,
    /-f owner=\{owner\}/,
    'record-creation.md must not pass {owner} with -f (static string, no substitution)',
  );
});
