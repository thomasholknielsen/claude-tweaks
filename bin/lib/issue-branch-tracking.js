'use strict';

// bin/lib/issue-branch-tracking.js
// Pure: extract GitHub closing-keyword issue references from commit messages,
// and generate the companion GitHub Actions workflow
// (.github/workflows/track-issue-fixes.yml) that tracks those references on
// non-default branches (label + comment) and cleans up once the fix reaches
// the default branch (GitHub's native keyword-close fires there). No network
// here — /init writes the generated YAML; the workflow itself runs `gh`
// inside GitHub Actions, independent of claude-tweaks at runtime.
// Note: GitHub's push webhook payload caps at 20 commits, so a push with
// more than that will miss references in the truncated commits — the same
// limitation GitHub's own native keyword parsing already has.

const ISSUE_REF_SOURCE = '\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#([0-9]+)';

function extractIssueNumbers(commitMessages) {
  const found = new Set();
  const re = new RegExp(ISSUE_REF_SOURCE, 'gi');
  for (const message of commitMessages || []) {
    if (typeof message !== 'string') continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(message)) !== null) {
      found.add(Number(match[1]));
    }
  }
  return Array.from(found).sort((a, b) => a - b);
}

function generateWorkflowYaml() {
  const lines = [
    'name: Track issue fixes across branches',
    '',
    'on:',
    '  push:',
    '    branches:',
    "      - '**'",
    '',
    'permissions:',
    '  contents: read',
    '  issues: write',
    '',
    'jobs:',
    '  label-fix-branch:',
    "    if: github.ref != format('refs/heads/{0}', github.event.repository.default_branch)",
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Extract referenced issues',
    '        id: extract',
    '        env:',
    '          COMMITS_JSON: ${{ toJson(github.event.commits) }}',
    '        run: |',
    `          PATTERN='${ISSUE_REF_SOURCE}'`,
    '          echo "$COMMITS_JSON" | jq -r \'.[].message\' > /tmp/commit_messages.txt',
    "          ISSUES=$(grep -ioP \"$PATTERN\" /tmp/commit_messages.txt | grep -oP '[0-9]+' | sort -un | tr '\\n' ' ' || true)",
    '          echo "issues=$ISSUES" >> "$GITHUB_OUTPUT"',
    '      - name: Label and comment on each referenced issue',
    "        if: steps.extract.outputs.issues != ''",
    '        env:',
    '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '          REPO: ${{ github.repository }}',
    '          BRANCH_RAW: ${{ github.ref_name }}',
    '          SHA: ${{ github.sha }}',
    '          ISSUES: ${{ steps.extract.outputs.issues }}',
    '        run: |',
    '          BRANCH=$(echo "$BRANCH_RAW" | tr \'[:upper:]\' \'[:lower:]\' | tr \'/\' \'-\')',
    '          LABEL="fix-on-${BRANCH}"',
    '          gh label create "$LABEL" --color FBCA04 \\',
    '            --description "Fixed on ${BRANCH}, not yet on the default branch" \\',
    '            --repo "$REPO" || true',
    '          for ISSUE in $ISSUES; do',
    '            gh issue edit "$ISSUE" --add-label "$LABEL" --repo "$REPO" || true',
    '            gh issue comment "$ISSUE" --repo "$REPO" \\',
    '              --body "Fixed by ${SHA} on \\`${BRANCH}\\`. Will close automatically once this reaches the default branch." || true',
    '          done',
    '',
    '  cleanup-fix-labels:',
    "    if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Extract referenced issues',
    '        id: extract',
    '        env:',
    '          COMMITS_JSON: ${{ toJson(github.event.commits) }}',
    '        run: |',
    `          PATTERN='${ISSUE_REF_SOURCE}'`,
    '          echo "$COMMITS_JSON" | jq -r \'.[].message\' > /tmp/commit_messages.txt',
    "          ISSUES=$(grep -ioP \"$PATTERN\" /tmp/commit_messages.txt | grep -oP '[0-9]+' | sort -un | tr '\\n' ' ' || true)",
    '          echo "issues=$ISSUES" >> "$GITHUB_OUTPUT"',
    '      - name: Strip fix-on-* labels from closed issues',
    "        if: steps.extract.outputs.issues != ''",
    '        env:',
    '          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    '          REPO: ${{ github.repository }}',
    '          ISSUES: ${{ steps.extract.outputs.issues }}',
    '        run: |',
    '          for ISSUE in $ISSUES; do',
    '            LABELS=$(gh issue view "$ISSUE" --repo "$REPO" --json labels -q \'.labels[].name\' | grep \'^fix-on-\' || true)',
    '            for LABEL in $LABELS; do',
    '              gh issue edit "$ISSUE" --remove-label "$LABEL" --repo "$REPO" || true',
    '            done',
    '          done',
    '',
  ];
  return lines.join('\n');
}

module.exports = { ISSUE_REF_SOURCE, extractIssueNumbers, generateWorkflowYaml };
