# Dispatch native Blocked-by dependency check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/claude-tweaks:dispatch`'s Step 2 eligibility filter so that, under `work-links: native`, a record whose blocker is expressed via GitHub's native sub-issue/dependency relationship is excluded from the dispatchable queue the same way an open `Blocked by #N` body-text line already excludes a record today.

**Architecture:** Add two small, independently-tested pure functions to `bin/lib/issues/record.js` — `buildNativeDependencyQuery` (composes one batched, aliased GraphQL query across all eligible candidates) and `hasOpenNativeBlocker` (judges one candidate's parsed `blockedBy` connection) — mirroring the existing `parseDependencies` pattern for the body-text case. Then wire them into `skills/dispatch/SKILL.md` Step 2 behind a `work-links: native` branch, and update the file's own gap-callout paragraph and reference-table row that currently describe this as unimplemented.

**Tech Stack:** Node.js (`node --test`, no external deps), `gh api graphql`.

## Global Constraints

- Test runner: `node --test` — no external test framework (CLAUDE.md).
- New functions live in `bin/lib/issues/record.js`, exported alongside `parseDependencies` — do not create a new module for two small functions in the same domain.
- `work-links: body-text` and `work-backend: local-files` behavior must be byte-for-byte unchanged — this is additive only under `work-links: native`.

---

### Task 1: Native dependency query + filter helpers

**Files:**
- Modify: `bin/lib/issues/record.js` (add two exported functions near `parseDependencies`, ~line 225)
- Test: `bin/lib/issues/tests/record.test.js` (add tests near the existing `parseDependencies` tests, ~line 235)

**Interfaces:**
- Produces: `buildNativeDependencyQuery(numbers: number[]): string | null` — composes a batched GraphQL query string aliasing each number as `i{n}: issue(number:{n}){ number blockedBy(first:25){ nodes{ number state } } }`, wrapped in a `repository(owner:$owner,name:$repo){...}` selection. Returns `null` for an empty or non-array input (nothing to query).
- Produces: `hasOpenNativeBlocker(issueNode: {blockedBy: {nodes: Array<{number, state}>}} | null | undefined): boolean` — `true` when `issueNode.blockedBy.nodes` contains at least one entry with `state === 'OPEN'`; `false` for null/undefined input, a missing/malformed `blockedBy.nodes`, or when every node is `CLOSED`.

- [ ] **Step 1: Write the failing tests**

Add to `bin/lib/issues/tests/record.test.js`, after the existing `parseDependencies`-ignores-mid-line-occurrences test (around line 235):

```javascript
test('hasOpenNativeBlocker returns true when any blockedBy node is OPEN', () => {
  assert.strictEqual(
    hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [{ number: 14, state: 'OPEN' }] } }),
    true
  );
});

test('hasOpenNativeBlocker returns false when all blockedBy nodes are CLOSED', () => {
  assert.strictEqual(
    hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [{ number: 14, state: 'CLOSED' }] } }),
    false
  );
});

test('hasOpenNativeBlocker returns false when blockedBy has no nodes', () => {
  assert.strictEqual(hasOpenNativeBlocker({ number: 39, blockedBy: { nodes: [] } }), false);
});

test('hasOpenNativeBlocker returns false for null or undefined input', () => {
  assert.strictEqual(hasOpenNativeBlocker(null), false);
  assert.strictEqual(hasOpenNativeBlocker(undefined), false);
});

test('hasOpenNativeBlocker returns false when blockedBy is missing entirely', () => {
  assert.strictEqual(hasOpenNativeBlocker({ number: 39 }), false);
});

test('buildNativeDependencyQuery aliases each number and requests blockedBy state', () => {
  const q = buildNativeDependencyQuery([39, 37]);
  assert.match(q, /i39: issue\(number:39\)/);
  assert.match(q, /i37: issue\(number:37\)/);
  assert.match(q, /blockedBy\(first:25\)/);
  assert.match(q, /state/);
  assert.match(q, /repository\(owner:\$owner,name:\$repo\)/);
});

test('buildNativeDependencyQuery returns null for an empty array', () => {
  assert.strictEqual(buildNativeDependencyQuery([]), null);
});

test('buildNativeDependencyQuery returns null for non-array input', () => {
  assert.strictEqual(buildNativeDependencyQuery(undefined), null);
});
```

Also update the destructuring import at the top of the test file (line 4-7) to include the two new names:

```javascript
const {
  recordPayload, TYPE_LABELS,
  extractFingerprint, parseRecordFacets, parseDependencies, parseDependencyAssumptions, specShapedBody,
  buildNativeDependencyQuery, hasOpenNativeBlocker,
} = require('../record');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "$WORKTREE" && node --test bin/lib/issues/tests/record.test.js`
Expected: FAIL — `TypeError: hasOpenNativeBlocker is not a function` / `TypeError: buildNativeDependencyQuery is not a function` (destructuring an absent export yields `undefined`; the error surfaces when the test calls it, not at import time).

- [ ] **Step 3: Implement the two functions**

In `bin/lib/issues/record.js`, add immediately after `parseDependencies` (after its closing brace, before the `parseDependencyAssumptions` comment block, ~line 226):

```javascript
// candidate issue numbers -> one batched, aliased GraphQL query requesting each
// candidate's native blockedBy connection (work-links: native). GraphQL aliases
// can't start with a digit, hence the 'i' prefix. Returns null for an empty or
// non-array input — nothing to query, and an empty repository{} selection set
// would be invalid GraphQL.
function buildNativeDependencyQuery(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const fields = numbers
    .map((n) => `i${n}: issue(number:${n}){ number blockedBy(first:25){ nodes{ number state } } }`)
    .join('\n      ');
  return `query($owner:String!,$repo:String!){\n  repository(owner:$owner,name:$repo){\n      ${fields}\n  }\n}`;
}

// one candidate's parsed aliased response value (the { number, blockedBy: { nodes } }
// shape buildNativeDependencyQuery's query produces per alias) -> true when at least
// one blockedBy node is still OPEN. Mirrors parseDependencies' role for the
// work-links: body-text case, but judges a single already-parsed node instead of
// scanning body text for every candidate at once.
function hasOpenNativeBlocker(issueNode) {
  const nodes = issueNode && issueNode.blockedBy && issueNode.blockedBy.nodes;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n) => n && n.state === 'OPEN');
}
```

Update the `module.exports` block at the end of the file to include both:

```javascript
module.exports = {
  ORIGINS, TYPES, TIERS, PRIORITIES, LABELS, TYPE_LABELS, recordPayload, specShapedBody,
  FP_RE_WORK, FP_RE_LEGACY, extractFingerprint, parseRecordFacets, parseDependencies,
  parseDependencyAssumptions, buildNativeDependencyQuery, hasOpenNativeBlocker,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "$WORKTREE" && node --test bin/lib/issues/tests/record.test.js`
Expected: PASS — all tests including the 8 new ones.

- [ ] **Step 5: Commit**

```bash
cd "$WORKTREE" && git add bin/lib/issues/record.js bin/lib/issues/tests/record.test.js
git commit -m "Add native blockedBy query/filter helpers to record.js"
```

---

### Task 2: Wire the native branch into dispatch's Step 2

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Step 2's code block and gap-callout paragraph, ~line 63-88; the `bin/lib/issues/{claims,retry,grouping,record}.js` reference-table row, ~line 409)

**Interfaces:**
- Consumes: `buildNativeDependencyQuery(numbers)` / `hasOpenNativeBlocker(issueNode)` from Task 1 (`bin/lib/issues/record.js`).

- [ ] **Step 1: Read `work-links` and branch after computing `eligible`**

In `skills/dispatch/SKILL.md`, locate Step 2's existing code block (the one building `eligible`/`groups` and writing `/tmp/dispatch-groups.json`). Replace it with:

````markdown
```bash
gh issue list --label auto:build --state open --json number,title,body,labels,createdAt --limit 100 > /tmp/dispatch-queue-raw.json
gh issue list --state open --json number --limit 200 > /tmp/dispatch-open-numbers.json
WORK_LINKS=$(grep -E "^work-links:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//')
node -e "
  const { parseRecordFacets, parseDependencies } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const issues = require('/tmp/dispatch-queue-raw.json');
  const openNumbers = new Set(require('/tmp/dispatch-open-numbers.json').map((i) => i.number));
  const eligible = issues
    .map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))
    .filter((i) => i.facets.grants.build && !i.facets.bot.inProgress && !i.facets.bot.blocked)
    .filter((i) => !parseDependencies(i.body).some((dep) => openNumbers.has(dep)));
  require('fs').writeFileSync('/tmp/dispatch-eligible.json', JSON.stringify(eligible));
"
if [ "$WORK_LINKS" = "native" ]; then
  node -e "
    const { buildNativeDependencyQuery } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
    const eligible = require('/tmp/dispatch-eligible.json');
    const query = buildNativeDependencyQuery(eligible.map((i) => i.number));
    if (query) require('fs').writeFileSync('/tmp/dispatch-native-query.graphql', query);
  "
  if [ -s /tmp/dispatch-native-query.graphql ]; then
    OWNER_REPO=$(gh repo view --json owner,name -q '.owner.login + " " + .name')
    gh api graphql -f query="$(cat /tmp/dispatch-native-query.graphql)" \
      -f owner="$(echo "$OWNER_REPO" | cut -d' ' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d' ' -f2)" \
      > /tmp/dispatch-native-deps.json
  else
    echo '{"data":{"repository":{}}}' > /tmp/dispatch-native-deps.json
  fi
else
  echo '{"data":{"repository":{}}}' > /tmp/dispatch-native-deps.json
fi
node -e "
  const { hasOpenNativeBlocker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const eligible = require('/tmp/dispatch-eligible.json');
  const repoData = require('/tmp/dispatch-native-deps.json').data.repository;
  const finalEligible = eligible.filter((i) => !hasOpenNativeBlocker(repoData['i' + i.number]));
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
" > /tmp/dispatch-groups.json
```
````

- [ ] **Step 2: Replace the gap-callout paragraph**

Immediately below that code block, replace:

```markdown
**`work-links: native` gap.** `parseDependencies` reads only `Blocked by #N` body-text lines — a record whose blocker is expressed via GitHub's native sub-issue/dependency relationship (`work-links: native`) is not filtered by this check. Widening this to also query the native relationship is a follow-up, not covered here.
```

with:

```markdown
**`work-links: native` support.** Under `work-links: native`, one additional batched `gh api graphql` call (`buildNativeDependencyQuery`/`hasOpenNativeBlocker`, `bin/lib/issues/record.js`) queries every eligible candidate's native `blockedBy` connection in a single aliased request and drops any candidate with an `OPEN` native blocker — the same outcome `parseDependencies` already produces for an open `Blocked by #N` body-text line under `work-links: body-text`. The two modes are mutually exclusive per record, mirroring `flow/materialize.md`'s existing `blocked-by` driver/work-links branching — a project mid-migration with stale body-text lines under `native` is out of scope.
```

- [ ] **Step 3: Update the reference-table row**

Near the end of `skills/dispatch/SKILL.md`, in the Relationship-to-Other-Skills-style reference table, find the row for `bin/lib/issues/{claims,retry,grouping,record}.js` (currently: "The pure helpers behind claim/release payloads, retry-ceiling math, file-overlap grouping, and grant/bot-state facet parsing — dispatch calls all four, unchanged. Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue."). Replace the second sentence with:

```markdown
Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue under `work-links: body-text`, and `buildNativeDependencyQuery`/`hasOpenNativeBlocker` to do the same against GitHub's native dependency relationship under `work-links: native`.
```

- [ ] **Step 4: Commit**

```bash
cd "$WORKTREE" && git add skills/dispatch/SKILL.md
git commit -m "Wire native work-links dependency check into dispatch Step 2"
```
