// tests/issue-claims-pr-scan-composition.test.js — pins the citation-resolves fix (#1992)
// for plugin/skills/_shared/github-pr-scan.md and plugin/skills/_shared/issue-claims.md:
// every unconditional citation of a labeled item/step must find that label present in
// every resolved-`transport` composition, not just the one branch it was written next to.
// Composes through compose-context/compose.js's own `compose` so a fence that moves back
// (re-fencing a cited label) goes red here, the way flow-manifesto-composition.test.js does
// for the manifesto's mode markers.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compose, KEYS, VOCAB, UNRESOLVED } = require('../plugin/bin/lib/compose-context/compose');

const PR_SCAN_FILE = 'plugin/skills/_shared/github-pr-scan.md';
const CLAIMS_FILE = 'plugin/skills/_shared/issue-claims.md';
const prScanContent = fs.readFileSync(path.join(__dirname, '..', PR_SCAN_FILE), 'utf8');
const claimsContent = fs.readFileSync(path.join(__dirname, '..', CLAIMS_FILE), 'utf8');

// The file composed at `transport`, every other condition pinned to its first vocabulary
// value. `sourceContent` defaults to the real file; the discrimination tests pass a
// doctored copy through the same composition path.
function bundleFor(file, transport, sourceContent) {
  const conditions = Object.fromEntries(KEYS.map((key) => [key, key === 'transport' ? transport : VOCAB[key][0]]));
  return compose([{ path: file, content: sourceContent }], conditions);
}

function presence(bundle, strings) {
  return Object.fromEntries(strings.map((s) => [s, bundle.includes(s)]));
}

// -- github-pr-scan.md ------------------------------------------------------

const ITEM9_LABEL = '9. **Unarmed ready PR**';
const ITEM9_BODY_ONLY = 'PR_SCAN_UNARMED'; // occurs only inside item 9's fenced body — verified below
const TRIAGE_ITEM3 = '3. **Auto-merged this week**';
const ITEM4_LABEL = '4. **Merged/closed PRs with local remnants**';
const PR_BACKED_BULLET = '- **PR-backed items**';
const ITEM1_LABEL = '1. **PR lookup**';

test('github-pr-scan.md: ITEM9_BODY_ONLY occurs only inside item 9\'s fenced body in the raw file', () => {
  // grep -c PR_SCAN_UNARMED plugin/skills/_shared/github-pr-scan.md -> 12 matching lines, all
  // between the item-9 fence markers; this pins the fixture choice, not just asserts it once.
  const matchingLines = prScanContent.split('\n').filter((line) => line.includes(ITEM9_BODY_ONLY)).length;
  assert.equal(matchingLines, 12, 'fixture assumption: PR_SCAN_UNARMED matching-line count changed — pick a new item-9-only string');
});

test('github-pr-scan.md under mcp: item 9\'s label survives, its fenced body does not, and the other cited labels survive', () => {
  const bundle = bundleFor(PR_SCAN_FILE, 'mcp', prScanContent);
  assert.deepEqual(
    presence(bundle, [ITEM9_LABEL, ITEM9_BODY_ONLY, TRIAGE_ITEM3, ITEM4_LABEL, PR_BACKED_BULLET, ITEM1_LABEL]),
    {
      [ITEM9_LABEL]: true,
      [ITEM9_BODY_ONLY]: false,
      [TRIAGE_ITEM3]: false,
      [ITEM4_LABEL]: true,
      [PR_BACKED_BULLET]: true,
      [ITEM1_LABEL]: true,
    },
  );
});

test('github-pr-scan.md under gh and under unresolved transport: every cited label and item-9\'s body are present', () => {
  for (const transport of ['gh', UNRESOLVED]) {
    const bundle = bundleFor(PR_SCAN_FILE, transport, prScanContent);
    assert.deepEqual(
      presence(bundle, [ITEM9_LABEL, ITEM9_BODY_ONLY, TRIAGE_ITEM3, ITEM4_LABEL, PR_BACKED_BULLET, ITEM1_LABEL]),
      {
        [ITEM9_LABEL]: true,
        [ITEM9_BODY_ONLY]: true,
        [TRIAGE_ITEM3]: true,
        [ITEM4_LABEL]: true,
        [PR_BACKED_BULLET]: true,
        [ITEM1_LABEL]: true,
      },
      `mismatch under transport=${transport}`,
    );
  }
});

test('discrimination: re-fencing item 9\'s label under transport=gh goes red under mcp', () => {
  const doctored = prScanContent.replace(
    ITEM9_LABEL,
    `<!-- when: transport=gh -->\n${ITEM9_LABEL}`,
  ).replace(
    // close the fence right after the label's own paragraph, before its (still-fenced) body fence opens
    'no local run-dir join, so this check works from a fresh sandbox exactly like every other item here.',
    'no local run-dir join, so this check works from a fresh sandbox exactly like every other item here.\n<!-- /when -->',
  );
  const bundle = bundleFor(PR_SCAN_FILE, 'mcp', doctored);
  assert.equal(bundle.includes(ITEM9_LABEL), false, 'the fixture must actually strip item 9\'s label under mcp');
});

// -- issue-claims.md ----------------------------------------------------------

const GH_CLI_BULLET = '- **gh CLI:**';
const MCP_BULLET = '- **MCP:**';
const REPAIR_STEP1 = '1. Read the blob at';
const ISSUE_COMMENT_CMD = 'gh issue comment "$ISSUE"';

test('issue-claims.md: REPAIR_STEP1 and ISSUE_COMMENT_CMD literals exist in the raw file', () => {
  assert.ok(claimsContent.includes(REPAIR_STEP1), 'fixture assumption: "1. Read the blob at" not found verbatim');
  assert.ok(claimsContent.includes(ISSUE_COMMENT_CMD), 'fixture assumption: gh issue comment "$ISSUE" not found verbatim');
});

test('issue-claims.md under gh: gh-only bullets present, mcp-only bullets absent, repair step 1 and the comment command present', () => {
  const bundle = bundleFor(CLAIMS_FILE, 'gh', claimsContent);
  assert.deepEqual(
    presence(bundle, [GH_CLI_BULLET, MCP_BULLET, REPAIR_STEP1, ISSUE_COMMENT_CMD]),
    { [GH_CLI_BULLET]: true, [MCP_BULLET]: false, [REPAIR_STEP1]: true, [ISSUE_COMMENT_CMD]: true },
  );
});

test('issue-claims.md under mcp: mcp-only bullets present, gh-only bullets absent, repair step 1 and the comment command present', () => {
  const bundle = bundleFor(CLAIMS_FILE, 'mcp', claimsContent);
  assert.deepEqual(
    presence(bundle, [GH_CLI_BULLET, MCP_BULLET, REPAIR_STEP1, ISSUE_COMMENT_CMD]),
    { [GH_CLI_BULLET]: false, [MCP_BULLET]: true, [REPAIR_STEP1]: true, [ISSUE_COMMENT_CMD]: true },
  );
});

test('discrimination: re-fencing repair step 1 under transport=mcp goes red under gh', () => {
  const doctored = claimsContent.replace(
    REPAIR_STEP1,
    `<!-- when: transport=mcp -->\n${REPAIR_STEP1}`,
  ).replace(
    'This step never depends on the content parsing.',
    'This step never depends on the content parsing.\n<!-- /when -->',
  );
  const bundle = bundleFor(CLAIMS_FILE, 'gh', doctored);
  assert.equal(bundle.includes(REPAIR_STEP1), false, 'the fixture must actually strip repair step 1 under gh');
});
