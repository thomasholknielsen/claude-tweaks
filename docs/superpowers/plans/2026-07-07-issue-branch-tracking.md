# Non-Default-Branch Issue Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give claude-tweaks a companion GitHub Actions workflow that tracks `Fixes #N`/`Closes #N` references on non-default branches (label + comment) and cleans up once the fix reaches the default branch and GitHub closes the issue natively — plus a new `/init` bootstrap step that offers to install it.

**Architecture:** A single pure Node module (`bin/lib/issue-branch-tracking.js`) owns both the tested keyword-extraction regex and the generator that renders the full workflow YAML from it (single source of truth — no hand-copied duplicate). `/init` Step 0.97 calls the generator via `node -e` and writes its output to `.github/workflows/track-issue-fixes.yml`, gated on a GitHub remote and idempotent on file existence. Two small doc cross-references (`/flow`'s close-via-merge section, `README.md`) point at the new capability. No CLAUDE.md flag — the workflow file's presence on disk is the on/off switch.

**Tech Stack:** Node.js (`node:test`, `node:assert`, CommonJS, zero runtime deps), GitHub Actions YAML (`ubuntu-latest`, `gh` CLI, `jq`, GNU `grep -P`), Markdown (skill files).

## Global Constraints

- Plugin ships **zero YAML dependencies** — verify generated YAML structurally (substring/line checks), never by parsing it with a YAML library.
- Module style mirrors `bin/lib/issues/ingest.js`: `'use strict'`, `node:test`/`node:assert`, one `module.exports = {...}` at the bottom, relative `require` paths.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no `feat:`/`fix:` conventional-commit prefixes).
- Never call `gh issue close` from generated automation — the default-branch merge is the only closing action (`_shared/auto-mode-contract.md`, "Never-reversible"). The cleanup job only removes labels.
- No CLAUDE.md flag for this feature — the presence of `.github/workflows/track-issue-fixes.yml` on disk is the entire on/off state; nothing else in the plugin reads a runtime switch for it.
- Version bump lives only in `.claude-plugin/plugin.json` (`version` field) — this is a feature addition, so it's a minor bump.

---

### Task 1: Pure module — keyword extraction + workflow YAML generator

**Files:**
- Create: `bin/lib/issue-branch-tracking.js`
- Test: `tests/issue-branch-tracking.test.js`

**Interfaces:**
- Produces (consumed by Task 2): `require('../bin/lib/issue-branch-tracking')` exports `{ ISSUE_REF_SOURCE: string, extractIssueNumbers(commitMessages: string[]): number[], generateWorkflowYaml(): string }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/issue-branch-tracking.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  ISSUE_REF_SOURCE,
  extractIssueNumbers,
  generateWorkflowYaml,
} = require('../bin/lib/issue-branch-tracking');

test('extractIssueNumbers matches GitHub closing keywords, case-insensitive', () => {
  const messages = [
    'Fixes #12: correct the off-by-one',
    'closes #34',
    'Fixed #56 and resolved #78',
  ];
  assert.deepStrictEqual(extractIssueNumbers(messages), [12, 34, 56, 78]);
});

test('extractIssueNumbers ignores bare issue references without a closing keyword', () => {
  const messages = ['See #99 for context', 'Related to #100 but not fixing it'];
  assert.deepStrictEqual(extractIssueNumbers(messages), []);
});

test('extractIssueNumbers de-dupes and sorts when the same issue repeats', () => {
  const messages = ['Fixes #5', 'fix #5', 'Closes #2'];
  assert.deepStrictEqual(extractIssueNumbers(messages), [2, 5]);
});

test('extractIssueNumbers handles multiple references in one commit message', () => {
  const messages = ['Fixes #1 and Closes #2'];
  assert.deepStrictEqual(extractIssueNumbers(messages), [1, 2]);
});

test('extractIssueNumbers returns [] for empty or missing input', () => {
  assert.deepStrictEqual(extractIssueNumbers([]), []);
  assert.deepStrictEqual(extractIssueNumbers(undefined), []);
});

test('generateWorkflowYaml embeds both jobs and the default-branch comparison', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(yaml.includes('label-fix-branch:'));
  assert.ok(yaml.includes('cleanup-fix-labels:'));
  assert.ok(yaml.includes(
    "if: github.ref != format('refs/heads/{0}', github.event.repository.default_branch)"
  ));
  assert.ok(yaml.includes(
    "if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
  ));
});

test('generateWorkflowYaml embeds the exact tested regex pattern (single source of truth)', () => {
  const yaml = generateWorkflowYaml();
  const needle = `PATTERN='${ISSUE_REF_SOURCE}'`;
  const occurrences = yaml.split(needle).length - 1;
  assert.strictEqual(occurrences, 2);
});

test('generateWorkflowYaml output has no tab characters and starts with the workflow name', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(yaml.startsWith('name: Track issue fixes across branches'));
  assert.ok(!yaml.includes('\t'), 'YAML must not contain tab characters');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/issue-branch-tracking.test.js`
Expected: FAIL — `Cannot find module '../bin/lib/issue-branch-tracking'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issue-branch-tracking.js`:

```js
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
    "          ISSUES=$(grep -ioP \"$PATTERN\" /tmp/commit_messages.txt | grep -oP '[0-9]+' | sort -un | tr '\\n' ' ')",
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
    "          ISSUES=$(grep -ioP \"$PATTERN\" /tmp/commit_messages.txt | grep -oP '[0-9]+' | sort -un | tr '\\n' ' ')",
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/issue-branch-tracking.test.js`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issue-branch-tracking.js tests/issue-branch-tracking.test.js
git commit -m "$(cat <<'EOF'
Add issue-branch-tracking module — keyword extraction + workflow YAML generator

Pure Node module: extractIssueNumbers() is the tested single source of truth
for the closing-keyword regex, and generateWorkflowYaml() renders the full
GitHub Actions workflow from it, so the bash-embedded pattern can never drift
from the tested one.
EOF
)"
```

---

### Task 2: `/init` Step 0.97 — bootstrap integration

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (append after line 425, end of file)
- Modify: `skills/init/SKILL.md:114-118`

**Interfaces:**
- Consumes (from Task 1): `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issue-branch-tracking.js').generateWorkflowYaml()` — invoked via `node -e` exactly as `flow/from-code-health.md` Step 2 invokes `bin/lib/issues/ingest.js`.

- [ ] **Step 1: Add the full procedure to `bootstrap-steps.md`**

Append to the end of `skills/init/bootstrap-steps.md` (after the existing final line, `**Failure handling:** If a \`create\` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of \`/init\`.`):

```markdown

---

## Step 0.97 — Non-default-branch issue tracking (companion workflow)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`) — same gate Step 0.45 uses. Check whether
`.github/workflows/track-issue-fixes.yml` already exists; if present, skip this step
silently (idempotent — no re-prompt on `/init` re-run).

GitHub's native `Fixes #N`/`Closes #N` keyword parsing only fires when the referencing
commit lands on the repository's default branch. Projects whose workflow lands fixes on
an integration branch first (`dev`, `staging`, a feature branch) get no signal at all —
the issue just sits open with no record that it's already fixed somewhere.

**Present:**

```
claude-tweaks can wire up automatic issue tracking for non-default branches.
GitHub only auto-closes Fixes #N/Closes #N on the default branch — fixes
landed elsewhere lose that signal entirely and the issue looks untouched.

Set up the tracking workflow?
1. Yes — write .github/workflows/track-issue-fixes.yml (Recommended)
2. Skip — I'll handle issue tracking manually
```

**For option 1 — write the workflow file.** The full YAML is generated by
`bin/lib/issue-branch-tracking.js`'s `generateWorkflowYaml()` — do not hand-author the
file; the generator is the single source of truth (its embedded regex pattern is also
unit-tested). Run:

```bash
node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issue-branch-tracking.js').generateWorkflowYaml())" > .github/workflows/track-issue-fixes.yml
```

The generated workflow ships two jobs, both triggered on `push`:

- **`label-fix-branch`** (runs on any branch that is NOT the repo's default branch) —
  scans the pushed commits for GitHub's own closing keywords
  (`close(s|d)`/`fix(es|ed)`/`resolve(s|d)` + `#N`), and for each matched issue applies
  a `fix-on-<branch>` label (auto-created on first use) plus a comment linking the
  commit SHA.
- **`cleanup-fix-labels`** (runs only on pushes to the default branch) — same scan;
  strips every `fix-on-*` label from matched issues, since GitHub's native parser is
  closing them on this same push.

No `gh issue close` call anywhere in the workflow — the default-branch merge remains
the sole closing action, consistent with claude-tweaks' own close-via-merge rule (see
`_shared/issue-claims.md` and `flow/from-code-health.md` Step 5).

**Failure handling:** if writing the file fails (e.g. permissions), surface the
failure and continue `/init` — never abort the rest of bootstrap on this step.

**Re-run behavior:** the idempotency check above means this step is silent on repeat
`/init` runs once the workflow file exists. Declining is fine — it's offered again on
the next `/init` run.
```

- [ ] **Step 2: Add the summary blurb to `SKILL.md`**

In `skills/init/SKILL.md`, find:

```markdown
### Step 0.96: Routine Installation (Optional Companion)

Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, and offer to walk through `/claude-tweaks:routine create <skill> --source init` for each. Idempotent: skills with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 0.96) for the full procedure.

---
```

Replace with:

```markdown
### Step 0.96: Routine Installation (Optional Companion)

Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` without an existing instantiated record for this project, and offer to walk through `/claude-tweaks:routine create <skill> --source init` for each. Idempotent: skills with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 0.96) for the full procedure.

### Step 0.97: Non-Default-Branch Issue Tracking (Optional Companion)

Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 0.97) for the full procedure.

---
```

- [ ] **Step 3: Verify the cross-reference and generator invocation are both present**

Run:

```bash
grep -c "Step 0.97" skills/init/SKILL.md skills/init/bootstrap-steps.md
grep -n "generateWorkflowYaml" skills/init/bootstrap-steps.md
```

Expected: both files report at least one match for "Step 0.97"; `generateWorkflowYaml` appears once, in the `node -e` invocation line.

- [ ] **Step 4: Commit**

```bash
git add skills/init/bootstrap-steps.md skills/init/SKILL.md
git commit -m "$(cat <<'EOF'
Add /init Step 0.97 — non-default-branch issue tracking companion workflow

Gated on a GitHub remote, idempotent on the workflow file's existence.
Writes the file by invoking bin/lib/issue-branch-tracking.js's
generateWorkflowYaml() via node -e, same pattern flow/from-code-health.md
uses for bin/lib/issues/ingest.js.
EOF
)"
```

---

### Task 3: Cross-reference doc touches

**Files:**
- Modify: `skills/flow/from-code-health.md:159-161`
- Modify: `README.md:195`

**Interfaces:** None (prose-only; no code interfaces produced or consumed).

- [ ] **Step 1: Add the cross-reference to `from-code-health.md`**

In `skills/flow/from-code-health.md`, find:

```markdown
   In `current-branch` mode there is no merge commit or PR — the carrier is the **final
   wrap-up commit message**: include one `Fixes #{issue}` line per resolved issue in the
   wrap-up commit; GitHub closes the issues when that commit reaches the default branch
   (immediately on push if the current branch IS the default branch, otherwise at the
   eventual merge).

   Direct `gh issue close #{issue} --comment "..."` commands surface ONLY for issues resolved
```

Replace with:

```markdown
   In `current-branch` mode there is no merge commit or PR — the carrier is the **final
   wrap-up commit message**: include one `Fixes #{issue}` line per resolved issue in the
   wrap-up commit; GitHub closes the issues when that commit reaches the default branch
   (immediately on push if the current branch IS the default branch, otherwise at the
   eventual merge).

   **Non-default-branch note:** the mapping above assumes the merge/push lands directly
   on the default branch. If your project's workflow lands fixes on an integration branch
   first (`dev`, `staging`), that push produces no GitHub signal at all until it later
   reaches default — `/init` Step 0.97 offers a companion GitHub Actions workflow
   (`.github/workflows/track-issue-fixes.yml`) that labels + comments on those issues in
   the meantime, then cleans up once the default-branch merge actually closes them.

   Direct `gh issue close #{issue} --comment "..."` commands surface ONLY for issues resolved
```

- [ ] **Step 2: Add the sentence to `README.md`**

In `README.md`, find (within the `/claude-tweaks:code-health` paragraph):

```markdown
Any issues — not just code-health's — can feed the pipeline: `/flow --from-label <label>` or `--from-issues <n,...>` batch-build labelled or hand-picked issues, and `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready. Label an issue `agent:eligible` + `agent:go` and a scheduled dispatcher (`/routine create flow`) builds it hands-off — the labels are maintainer signatures, so drive-by issues can't dispatch themselves.
```

Replace with:

```markdown
Any issues — not just code-health's — can feed the pipeline: `/flow --from-label <label>` or `--from-issues <n,...>` batch-build labelled or hand-picked issues, and `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready. For projects that land fixes on an integration branch before the default branch, `/init` also offers a companion GitHub Actions workflow that labels and comments on the affected issues until the fix reaches default and GitHub's native close fires. Label an issue `agent:eligible` + `agent:go` and a scheduled dispatcher (`/routine create flow`) builds it hands-off — the labels are maintainer signatures, so drive-by issues can't dispatch themselves.
```

- [ ] **Step 3: Verify both edits landed**

Run:

```bash
grep -c "Step 0.97" skills/flow/from-code-health.md
grep -c "companion GitHub Actions workflow that labels and comments" README.md
```

Expected: both commands report `1`.

- [ ] **Step 4: Commit**

```bash
git add skills/flow/from-code-health.md README.md
git commit -m "$(cat <<'EOF'
Cross-reference the non-default-branch tracking workflow from close-via-merge + README

Readers of the close-via-merge mapping and the code-health README paragraph
now know the non-default-branch gap has a fix available via /init Step 0.97.
EOF
)"
```

---

### Task 4: Version bump + final verification

**Files:**
- Modify: `.claude-plugin/plugin.json:4`

**Interfaces:** None.

- [ ] **Step 1: Bump the plugin version**

In `.claude-plugin/plugin.json`, find:

```json
  "version": "5.13.0",
```

Replace with:

```json
  "version": "5.14.0",
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the 8 new tests from Task 1 (`tests/issue-branch-tracking.test.js`). The pre-existing `tests/statusline.test.js` "render under 500ms" timing test is flaky under load (confirmed independently reproducible/passing in isolation before this plan started) — if it's the *only* failure, re-run it alone (`node --test tests/statusline.test.js`) to confirm it's not a real regression before treating the suite as green.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "$(cat <<'EOF'
Bump version to 5.14.0 — non-default-branch issue tracking workflow
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** design's five key decisions are each implemented — label-on-push/close-on-main pattern (Task 1's `generateWorkflowYaml`), `/init` bootstrap placement (Task 2), any-non-default-branch trigger scope (the `if:` conditions in Task 1's generated YAML), per-branch label + comment (Task 1's `label-fix-branch` job), and label cleanup on close (Task 1's `cleanup-fix-labels` job). The doc cross-reference and out-of-scope items from the design are covered by Task 3 and the Global Constraints/module header comment, respectively.
- **Placeholder scan:** no TBD/TODO; every step ships complete, runnable code or exact markdown text.
- **Type consistency:** `ISSUE_REF_SOURCE`, `extractIssueNumbers`, `generateWorkflowYaml` names and shapes are identical between Task 1's implementation and Task 2's consumption (`node -e` invocation string).
