# resolve-blockers.js: per-blocker open state Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `fetchNativeDependencies` (and therefore `bin/resolve-blockers.js`'s CLI output) with an additive `openBlockerIds: number[]` field so `plugin/skills/dispatch/queue-pull-script.md`'s native-mode blocked-by branch can drop its hand-rolled `gh api graphql` call in favor of `bin/resolve-blockers.js`, matching #1174's existing pattern for `wrap-up/unblocked-records.md`.

**Architecture:** One additive field on an already-shared function (`fetchNativeDependencies` in `plugin/bin/lib/issues/native-dependencies.js`), computed with the exact same per-blocker `state === 'OPEN'` filter `partitionByOpenNativeBlockers` (`plugin/bin/lib/issues/record.js`) already applies to the same raw node list — no new GraphQL fields, no new query. `bin/resolve-blockers.js` needs no code change (it already passes the Map value through verbatim); only its output-shape doc comment changes. `queue-pull-script.md`'s native branch is rewritten to call the CLI (which resolves owner/repo itself) instead of hand-building a query and calling `gh api graphql` directly, then reconstructs the eligible/excluded partition inline from the CLI's `openBlockerIds` field instead of calling `partitionByOpenNativeBlockers` against a raw GraphQL response shape.

**Tech Stack:** Node.js (`node --test`), no new npm dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-28T152144-record-1309/work/1309-spec.md` (materialized from GitHub issue #1309)

## Global Constraints

- Additive-only: the existing `{blockedBy: number[], openBlocker: boolean}` fields on `fetchNativeDependencies`'s Map values must stay unchanged in both shape and computation.
- `bin/resolve-blockers.js` must keep its existing single-aliased-call-per-invocation guarantee — no second GraphQL call introduced anywhere in this change.
- `queue-pull-script.md`'s native branch must end up containing no hand-rolled `gh api graphql -f query=...` instruction.
- Dispatch's Blocked-exclusion report must still name the specific open blocker id(s) for each excluded candidate, unchanged from today's behavior.

---

### Task 1: Add `openBlockerIds` to `fetchNativeDependencies` and update its pinned-shape tests

**Files:**
- Modify: `plugin/bin/lib/issues/native-dependencies.js:1-54` (header comment, function doc comment, and the `result.set(n, ...)` call inside `fetchNativeDependencies`)
- Modify: `plugin/bin/lib/preflight-records/preflight-records.js:53-54` (doc comment only — this module re-exports the same function, no logic here)
- Modify: `plugin/bin/resolve-blockers.js:22-24` (doc comment only — the CLI already passes the Map value through verbatim, no logic change)
- Modify: `docs/plugin-structure.md:41` (one-line per-file description, doc only)
- Test: `tests/bin-lib/preflight-records/preflight-records.test.js:48-78`
- Test: `tests/resolve-blockers-cli.test.js:150-198`

**Interfaces:**
- Consumes: nothing new — reuses `nodes` (the already-computed `(node.blockedBy && node.blockedBy.nodes) || []` array) already in scope inside `fetchNativeDependencies`'s per-number loop.
- Produces: `fetchNativeDependencies(...)` Map values become `{blockedBy: number[], openBlocker: boolean, openBlockerIds: number[]}` — `openBlockerIds` is every `blockedBy` node whose `state === 'OPEN'`, in the same order `nodes` returns them. `bin/resolve-blockers.js`'s CLI JSON output gains the same field per requested number, since it returns the Map value unmodified.

- [ ] **Step 1: Update the two pinned-shape tests in `tests/bin-lib/preflight-records/preflight-records.test.js` to expect `openBlockerIds`**

Change (around line 68-69):

```javascript
  assert.deepEqual(deps.get(720), { blockedBy: [700], openBlocker: true });
  assert.deepEqual(deps.get(721), { blockedBy: [], openBlocker: false });
```

to:

```javascript
  assert.deepEqual(deps.get(720), { blockedBy: [700], openBlocker: true, openBlockerIds: [700] });
  assert.deepEqual(deps.get(721), { blockedBy: [], openBlocker: false, openBlockerIds: [] });
```

And change (around line 77 — the closed-only-blocker test, where `openBlockerIds` must be empty since the one blocker is CLOSED):

```javascript
  assert.deepEqual(deps.get(720), { blockedBy: [700], openBlocker: false });
```

to:

```javascript
  assert.deepEqual(deps.get(720), { blockedBy: [700], openBlocker: false, openBlockerIds: [] });
```

- [ ] **Step 2: Run the test file to verify it now fails (red) against current code**

Run: `node --test tests/bin-lib/preflight-records/preflight-records.test.js`
Expected: FAIL — the two tests touched in Step 1 fail because `deps.get(720)`/`deps.get(721)` don't yet carry `openBlockerIds` (current code returns only `{blockedBy, openBlocker}`, and `assert.deepEqual` rejects a missing expected property).

- [ ] **Step 3: Update the three pinned-shape assertions in `tests/resolve-blockers-cli.test.js`**

Change (around line 157):

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { 720: { blockedBy: [700], openBlocker: true } });
```

to:

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { 720: { blockedBy: [700], openBlocker: true, openBlockerIds: [700] } });
```

Change (around line 175 — the no-open-blockers test):

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { 720: { blockedBy: [], openBlocker: false } });
```

to:

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { 720: { blockedBy: [], openBlocker: false, openBlockerIds: [] } });
```

Change (around line 194-197 — the comma-list test):

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), {
    720: { blockedBy: [700], openBlocker: true },
    730: { blockedBy: [], openBlocker: false },
  });
```

to:

```javascript
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), {
    720: { blockedBy: [700], openBlocker: true, openBlockerIds: [700] },
    730: { blockedBy: [], openBlocker: false, openBlockerIds: [] },
  });
```

Also update the file's own top-of-file comment (line 7 — "Covers argument parsing and the number-keyed {blockedBy, openBlocker} output shape") to "Covers argument parsing and the number-keyed {blockedBy, openBlocker, openBlockerIds} output shape".

- [ ] **Step 4: Run `tests/resolve-blockers-cli.test.js` to verify it now fails (red) against current code**

Run: `node --test tests/resolve-blockers-cli.test.js`
Expected: FAIL — the three tests touched in Step 3 fail for the same missing-field reason as Step 2.

- [ ] **Step 5: Implement the `openBlockerIds` field in `fetchNativeDependencies`**

In `plugin/bin/lib/issues/native-dependencies.js`, change the loop body (currently):

```javascript
  for (const n of numbers) {
    const node = repository[`i${n}`];
    const nodes = (node.blockedBy && node.blockedBy.nodes) || [];
    result.set(n, {
      blockedBy: nodes.map((b) => b && b.number).filter((v) => v !== undefined),
      openBlocker: hasOpenNativeBlocker(node),
    });
  }
```

to:

```javascript
  for (const n of numbers) {
    const node = repository[`i${n}`];
    const nodes = (node.blockedBy && node.blockedBy.nodes) || [];
    result.set(n, {
      blockedBy: nodes.map((b) => b && b.number).filter((v) => v !== undefined),
      openBlocker: hasOpenNativeBlocker(node),
      // The identical per-blocker OPEN-state filter partitionByOpenNativeBlockers
      // (bin/lib/issues/record.js) already applies to this same `nodes` array —
      // additive alongside blockedBy/openBlocker, #1309.
      openBlockerIds: nodes.filter((b) => b && b.state === 'OPEN').map((b) => b.number),
    });
  }
```

Update the file's two shape-describing comments to match:

- Header comment (lines 4-5): `// {blockedBy: number[], openBlocker: boolean} shape every caller expects.` becomes `// {blockedBy: number[], openBlocker: boolean, openBlockerIds: number[]} shape every caller expects.`
- Function doc comment (line 16): `// { numbers, owner, repo, runner } -> Map<number, {blockedBy: number[], openBlocker: boolean}>.` becomes `// { numbers, owner, repo, runner } -> Map<number, {blockedBy: number[], openBlocker: boolean, openBlockerIds: number[]}>.`

- [ ] **Step 6: Run both test files to verify they now pass (green)**

Run: `node --test tests/bin-lib/preflight-records/preflight-records.test.js tests/resolve-blockers-cli.test.js`
Expected: PASS — every test in both files, including the ones touched above.

- [ ] **Step 7: Update the doc-only comments in `preflight-records.js`, `resolve-blockers.js`, and `docs/plugin-structure.md`**

In `plugin/bin/lib/preflight-records/preflight-records.js`, change (line 54):

```javascript
// {blockedBy: number[], openBlocker: boolean}>. Executes the batched,
```

to:

```javascript
// {blockedBy: number[], openBlocker: boolean, openBlockerIds: number[]}>. Executes the batched,
```

In `plugin/bin/resolve-blockers.js`, change (lines 22-24):

```javascript
// Output: one JSON line, an object keyed by each requested number (as a
// string, JSON's own key convention) to its {"blockedBy":[...],
// "openBlocker":bool} — the same per-record shape fetchNativeDependencies'
```

to:

```javascript
// Output: one JSON line, an object keyed by each requested number (as a
// string, JSON's own key convention) to its {"blockedBy":[...],
// "openBlocker":bool,"openBlockerIds":[...]} — the same per-record shape fetchNativeDependencies'
```

In `docs/plugin-structure.md` line 41, change:

```
parses the response into `{blockedBy: number[], openBlocker: boolean}` per number,
```

to:

```
parses the response into `{blockedBy: number[], openBlocker: boolean, openBlockerIds: number[]}` per number,
```

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/lib/issues/native-dependencies.js plugin/bin/lib/preflight-records/preflight-records.js plugin/bin/resolve-blockers.js docs/plugin-structure.md tests/bin-lib/preflight-records/preflight-records.test.js tests/resolve-blockers-cli.test.js
git commit -m "resolve-blockers.js: add openBlockerIds to fetchNativeDependencies output

refs #1309"
```

---

### Task 2: Rewrite `queue-pull-script.md`'s native branch to call `bin/resolve-blockers.js`

**Files:**
- Modify: `plugin/skills/dispatch/queue-pull-script.md:1-2` (summary paragraph), `:70-108` (the native-mode block and the final partition/groups `node -e` block), `:113` (Queue-pull notes pointer sentence)
- Modify: `plugin/skills/dispatch/queue-pull-notes.md:3` (intro sentence), `:11` (the `work-links: native` support paragraph)

**Interfaces:**
- Consumes: `bin/resolve-blockers.js`'s CLI output from Task 1 — `{"<n>": {"blockedBy": [...], "openBlocker": bool, "openBlockerIds": [...]}}` (a plain JSON object keyed by requested number, one key per requested candidate).
- Produces: `$DISPATCH_GROUPS` (unchanged shape — `groupByFileOverlap` output) and `$DISPATCH_BLOCKED_EXCLUDED` (unchanged shape — `[{number, blockedBy: [ids]}]`, still populated from native exclusions the same way, just computed from `openBlockerIds` directly instead of via `partitionByOpenNativeBlockers`).

- [ ] **Step 1: Pre-check — confirm the current hand-rolled block is exactly what this task replaces**

Run: `grep -n "gh api graphql\|DISPATCH_NATIVE_QUERY\|partitionByOpenNativeBlockers" plugin/skills/dispatch/queue-pull-script.md`
Expected: matches on lines 70-108 (the block this task rewrites) — confirms no other occurrence exists in the file that this task would miss.

- [ ] **Step 2: Remove `DISPATCH_NATIVE_QUERY` from the files map (it becomes unused)**

In `plugin/skills/dispatch/queue-pull-script.md`, in the `files` object near the top of the script, delete this line:

```javascript
    DISPATCH_NATIVE_QUERY: 'dispatch-native-query.graphql',
```

- [ ] **Step 3: Replace the native-mode block and the default fallback**

Replace (currently lines 70-89):

```bash
echo '{"data":{"repository":{}}}' > "$DISPATCH_NATIVE_DEPS"
if [ "$WORK_LINKS" = "native" ]; then
  rm -f "$DISPATCH_NATIVE_QUERY"
  node -e "
    const { buildNativeDependencyQuery } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
    const eligible = require(process.argv[1]);
    const query = buildNativeDependencyQuery(eligible.map((i) => i.number));
    if (query) require('fs').writeFileSync(process.argv[2], query);
  " "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_QUERY"
  if [ -s "$DISPATCH_NATIVE_QUERY" ]; then
    OWNER_REPO=$(gh repo view --json owner,name -q '.owner.login + " " + .name')
    if gh api graphql -f query="$(cat "$DISPATCH_NATIVE_QUERY")" \
      -f owner="$(echo "$OWNER_REPO" | cut -d' ' -f1)" -f repo="$(echo "$OWNER_REPO" | cut -d' ' -f2)" \
      > "$DISPATCH_NATIVE_DEPS_TMP" 2>"$DISPATCH_NATIVE_DEPS_ERR"; then
      mv "$DISPATCH_NATIVE_DEPS_TMP" "$DISPATCH_NATIVE_DEPS"
    else
      echo "Warning: native dependency query failed — falling back to no native filtering this run: $(cat "$DISPATCH_NATIVE_DEPS_ERR")" >&2
    fi
  fi
fi
```

with:

```bash
echo '{}' > "$DISPATCH_NATIVE_DEPS"
if [ "$WORK_LINKS" = "native" ]; then
  NATIVE_NUMS=$(node -e "console.log(require(process.argv[1]).map((i) => i.number).join(','))" "$DISPATCH_ELIGIBLE")
  if [ -n "$NATIVE_NUMS" ]; then
    if node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-blockers.js" "$NATIVE_NUMS" \
      > "$DISPATCH_NATIVE_DEPS_TMP" 2>"$DISPATCH_NATIVE_DEPS_ERR"; then
      mv "$DISPATCH_NATIVE_DEPS_TMP" "$DISPATCH_NATIVE_DEPS"
    else
      echo "Warning: native dependency query failed — falling back to no native filtering this run: $(cat "$DISPATCH_NATIVE_DEPS_ERR")" >&2
    fi
  fi
fi
```

`bin/resolve-blockers.js` resolves owner/repo itself from the `origin` remote (same as every other caller — `wrap-up/unblocked-records.md` passes no `--repo` either), so the prior `gh repo view --json owner,name` call is dropped entirely, not just the `gh api graphql` line.

- [ ] **Step 4: Replace the final partition/groups block to consume `openBlockerIds` directly**

Replace (currently lines 90-108):

```bash
node -e "
  const fs = require('fs');
  const { partitionByOpenNativeBlockers } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js');
  const { extractKeyFiles, expectsKeyFilesSection, groupByFileOverlap } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grouping.js');
  const eligible = require(process.argv[1]);
  const repoData = require(process.argv[2]).data.repository;
  const { eligible: finalEligible, excluded: excludedNative } = partitionByOpenNativeBlockers(eligible, repoData);
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  for (const item of items) {
    if (item.keyFiles.length === 0 && expectsKeyFilesSection(byId.get(item.id))) {
      console.error('Warning: eligible record #' + item.id + ' has no ### Key Files subsection — overlap detection disabled for it.');
    }
  }
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
  const excludedBody = require(process.argv[3]);
  fs.writeFileSync(process.argv[4], JSON.stringify([...excludedBody, ...excludedNative]));
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" > "$DISPATCH_GROUPS"
```

with:

```bash
node -e "
  const fs = require('fs');
  const { extractKeyFiles, expectsKeyFilesSection, groupByFileOverlap } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/grouping.js');
  const eligible = require(process.argv[1]);
  const nativeDeps = require(process.argv[2]);
  const finalEligible = [];
  const excludedNative = [];
  for (const c of eligible) {
    const dep = nativeDeps[c.number];
    const openIds = dep && Array.isArray(dep.openBlockerIds) ? dep.openBlockerIds : [];
    if (openIds.length > 0) excludedNative.push({ number: c.number, blockedBy: openIds });
    else finalEligible.push(c);
  }
  const items = finalEligible.map((i) => ({ id: i.number, keyFiles: extractKeyFiles(i) }));
  const byId = new Map(finalEligible.map((i) => [i.number, i]));
  for (const item of items) {
    if (item.keyFiles.length === 0 && expectsKeyFilesSection(byId.get(item.id))) {
      console.error('Warning: eligible record #' + item.id + ' has no ### Key Files subsection — overlap detection disabled for it.');
    }
  }
  const groups = groupByFileOverlap(items).map((ids) => ids.map((id) => byId.get(id)));
  console.log(JSON.stringify(groups));
  const excludedBody = require(process.argv[3]);
  fs.writeFileSync(process.argv[4], JSON.stringify([...excludedBody, ...excludedNative]));
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" > "$DISPATCH_GROUPS"
```

This is the same OPEN-state filter `partitionByOpenNativeBlockers` applied (`nodes.filter(state === 'OPEN')`), just read from `openBlockerIds` (already computed by `bin/resolve-blockers.js` via Task 1) instead of re-deriving it from a raw GraphQL `repository` object — `partitionByOpenNativeBlockers` itself is untouched and still used elsewhere (record.js's own tests, and any other native-mode caller that still has a raw GraphQL response to partition).

- [ ] **Step 5: Update the file's summary paragraph and the Queue-pull notes pointer sentence**

In `plugin/skills/dispatch/queue-pull-script.md` line 2, change:

```
each entry naming the blocker id(s) that excluded it (`{number, blockedBy: [ids]}[]`) via `record.js`'s `partitionByOpenBodyBlockers`/`partitionByOpenNativeBlockers` — SKILL.md Step 2's Blocked-exclusion report reads this file so a shrinking pool is never silent.
```

to:

```
each entry naming the blocker id(s) that excluded it (`{number, blockedBy: [ids]}[]`) — via `record.js`'s `partitionByOpenBodyBlockers` for the body-text case, and via `bin/resolve-blockers.js`'s `openBlockerIds` field for the `work-links: native` case — SKILL.md Step 2's Blocked-exclusion report reads this file so a shrinking pool is never silent.
```

In line 113 (now shifted by the line removed in Step 2 — locate by content, not line number), change:

```
**Queue-pull notes.** Read `queue-pull-notes.md` in this skill's directory when this repo sets `work-links: native` (the `gh api graphql` branch above), or when either pull returns exactly its `--limit` cap
```

to:

```
**Queue-pull notes.** Read `queue-pull-notes.md` in this skill's directory when this repo sets `work-links: native` (the `bin/resolve-blockers.js` branch above), or when either pull returns exactly its `--limit` cap
```

- [ ] **Step 6: Update `queue-pull-notes.md`'s two stale references**

In `plugin/skills/dispatch/queue-pull-notes.md` line 3, change:

```
Read it when this repo sets `work-links: native` (the `gh api graphql` branch that script runs), when either pull returns exactly its `--limit` cap, or when diagnosing a record that should have been in the queue and wasn't.
```

to:

```
Read it when this repo sets `work-links: native` (the `bin/resolve-blockers.js` branch that script runs), when either pull returns exactly its `--limit` cap, or when diagnosing a record that should have been in the queue and wasn't.
```

Change paragraph 11 (the `work-links: native` support paragraph) from:

```
**`work-links: native` support.** Under `work-links: native`, one additional batched `gh api graphql` call (`buildNativeDependencyQuery`, `bin/lib/issues/record.js`) queries every eligible candidate's native `blockedBy` connection in a single aliased request, then `partitionByOpenNativeBlockers` (same file — the identical OPEN-state predicate `hasOpenNativeBlocker` itself applies) drops any candidate with an `OPEN` native blocker, naming the blocker id(s) for `SKILL.md` Step 2's Blocked-exclusion report — the same outcome `partitionByOpenBodyBlockers`/`parseDependencies` already produces for an open `Blocked by #N` body-text line under `work-links: body-text`. The two modes are mutually exclusive per record, mirroring `flow/materialize.md`'s existing `blocked-by` driver/work-links branching — a project mid-migration with stale body-text lines under `native` is out of scope. The GraphQL call fails safe: on any error (network, auth, or a schema mismatch — e.g. a GitHub Enterprise host exposing only `issueDependenciesSummary`, not `blockedBy`) it logs a warning and falls back to no native filtering for that run rather than crashing Step 2's queue-build entirely — a missed native-dependency check degrades to the pre-`work-links: native` behavior, not a hard failure of headless dispatch.
```

to:

```
**`work-links: native` support.** Under `work-links: native`, one call to `bin/resolve-blockers.js` (the single-invocation CLI wrapping `bin/lib/issues/native-dependencies.js`'s `fetchNativeDependencies` — the same underlying function `/claude-tweaks:dispatch` Step 2 and `flow/materialize.md` use for this mode, and `wrap-up/unblocked-records.md`'s equivalent native-mode check) resolves every eligible candidate's native `blockedBy` state in a single batched, aliased GraphQL request under the hood, keyed by number. The script then drops any candidate whose `openBlockerIds` array is non-empty — the identical OPEN-state predicate `hasOpenNativeBlocker`/`partitionByOpenNativeBlockers` (`bin/lib/issues/record.js`) apply, just read off the CLI's already-computed field instead of re-deriving it from a raw GraphQL response — naming the blocker id(s) for `SKILL.md` Step 2's Blocked-exclusion report, the same outcome `partitionByOpenBodyBlockers`/`parseDependencies` already produces for an open `Blocked by #N` body-text line under `work-links: body-text`. The two modes are mutually exclusive per record, mirroring `flow/materialize.md`'s existing `blocked-by` driver/work-links branching — a project mid-migration with stale body-text lines under `native` is out of scope. The call fails safe: on any error (network, auth, `gh` absent, or a schema mismatch — e.g. a GitHub Enterprise host exposing only `issueDependenciesSummary`, not `blockedBy`) the script logs a warning and falls back to no native filtering for that run rather than crashing Step 2's queue-build entirely — a missed native-dependency check degrades to the pre-`work-links: native` behavior, not a hard failure of headless dispatch.
```

- [ ] **Step 7: Grep-verify no hand-rolled `gh api graphql -f query=` instruction remains in the native branch**

Run: `grep -n "gh api graphql" plugin/skills/dispatch/queue-pull-script.md`
Expected: no output (exit 1 / no matches) — confirms the Acceptance Criteria's "no hand-rolled `gh api graphql -f query=...` instruction" is satisfied.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — every suite, including `tests/resolve-blockers-cli.test.js`, `tests/bin-lib/preflight-records/`, and any prose-conformance test over `plugin/skills/dispatch/queue-pull-script.md`/`queue-pull-notes.md` (e.g. a byte-pinned snippet test, if one exists for this file).

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/dispatch/queue-pull-script.md plugin/skills/dispatch/queue-pull-notes.md
git commit -m "dispatch: queue-pull-script.md native branch uses resolve-blockers.js, not hand-rolled gh api graphql

refs #1309"
```
