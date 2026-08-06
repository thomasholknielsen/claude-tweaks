# Integration Branch Lever Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four independent "which branch is this project's current state" lookups with one `integration-branch` policy lever resolved through a single shared fragment.

**Architecture:** A new `skills/_shared/integration-branch.md` owns the resolution ladder; five consumers cite it instead of deriving their own answer. A conformance test acts as a migration ratchet — every file naming the GitHub default branch must either cite the fragment or sit in an allowlist with a stated reason, and each migration task removes one allowlist entry before making it pass.

**Tech Stack:** Markdown skill files; Node 18+ `node --test`; `bin/lib/policy-schema.js` (plain CommonJS, no deps).

**Source spec:** `docs/superpowers/specs/2026-08-06-integration-branch-policy-design.md` (Design A only — Design B, the policy.yml consolidation, is a separate plan).

## Global Constraints

- **Work inside the existing worktree.** This project sets `worktree.always: true`; the session is already in `.claude/worktrees/fix-132-routine-branch` on branch `worktree-fix-132-routine-branch`. Do not create a second worktree. Verify with `pwd` and `git rev-parse --show-toplevel` before the first commit.
- **Do not bump the version.** `.claude-plugin/plugin.json` is already at `6.39.0` (unshipped, commit `cd4e325a`). This plan ships inside that same release.
- **Do not bump any `template_version`.** No `skills/*/routine-template.yml` changes in this plan — the *template* field `branch:` and the *record* field `branch:` both keep their names. Only the **policy key** is renamed.
- **No emojis in skill files.** Use `**(Recommended)**` for emphasis.
- **Fully-qualified skill references** (`/claude-tweaks:{skill}`) in any actionable instruction text; bare `/{skill}` only in descriptive prose.
- **40 KB soft ceiling** per SKILL.md and per sub-file.
- **Commit message style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End each with `Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej`.
- **Verify the staged set before every commit** with `git diff --cached --name-only` — `git commit` with no pathspec takes the entire index.

## File Structure

| File | Responsibility |
|---|---|
| `skills/_shared/integration-branch.md` | **New.** Owns the resolution ladder and the per-consumer fallback table. Single source cited by all five consumers. |
| `bin/lib/policy-schema.js` | Key rename `routine.branch` → `integration-branch`. |
| `tests/policy-schema.test.js` | Key rename in assertions. |
| `tests/integration-branch-conformance.test.js` | **New.** The migration ratchet. |
| `skills/_shared/policy-schema.md` | Lever table row rename + home correction. |
| `skills/routine/create-and-update.md` | Step 5.5 collapses to a citation. |
| `skills/dispatch/settle-and-merge.md` | Merge target + push. |
| `skills/wrap-up/review-console.md` | Fast-lane merge target + push. |
| `skills/assess-agent-autonomy/SKILL.md` | Diff baseline for blast radius. |
| `skills/build/worktree-setup.md`, `skills/flow/validation.md` | Fork-point expectation. |
| `skills/init/bootstrap/step-06-worktree-configuration.md` | `baseRef: head` becomes required when the lever is set. |
| `skills/init/SKILL.md`, `skills/init/bootstrap/step-14-*.md`, `step-15-*.md`, `skills/_shared/routine-template-schema.md`, `docs/skill-graph.md`, `CHANGELOG.md` | Key-name references. |

---

### Task 1: Rename the policy key to `integration-branch`

The key shipped in `cd4e325a` but 6.39.0 is unpushed, so this is a rename with no compatibility path — no alias, no deprecation window.

**Files:**
- Modify: `bin/lib/policy-schema.js:14`
- Modify: `tests/policy-schema.test.js:26-46`
- Modify: `skills/_shared/policy-schema.md:22`
- Modify: `skills/routine/create-and-update.md` (lines 62, 65, 81, 124, 171, 179)
- Modify: `skills/routine/SKILL.md:39`
- Modify: `skills/_shared/routine-template-schema.md:101`
- Modify: `skills/init/SKILL.md:149`
- Modify: `skills/init/bootstrap/step-14-cloud-routine-parity.md` (lines 11, 170)
- Modify: `skills/init/bootstrap/step-15-routine-installation.md:40`
- Modify: `docs/skill-graph.md` (lines 260, 263)
- Modify: `CHANGELOG.md:22` — the 6.39.0 entry names the key in prose. One word here; Task 7 rewrites the entry wholesale, but leaving a renamed-away key in the changelog through five intervening tasks would make Step 6's verification grep fail for a reason unrelated to the task

**Interfaces:**
- Produces: policy key string `'integration-branch'` in `POLICY_KEYS`; every later task's grep snippets use `^integration-branch:`.

- [ ] **Step 1: Update the tests to expect the new key**

In `tests/policy-schema.test.js`, replace the two `routine.branch` tests with:

```js
test('integration-branch is a recognized string key with no default', () => {
  const branch = POLICY_KEYS.find((k) => k.key === 'integration-branch');
  assert.ok(branch, 'integration-branch missing from POLICY_KEYS');
  assert.strictEqual(branch.type, 'string');
  assert.strictEqual(branch.default, undefined, 'unset must mean "resolve the default branch per firing"');
});

test('routine.branch is gone — renamed before it ever shipped, with no alias', () => {
  assert.strictEqual(
    POLICY_KEYS.find((k) => k.key === 'routine.branch'),
    undefined,
    'routine.branch was renamed in 6.39.0 pre-release; an alias would be a compatibility path with no expiry'
  );
});

test('integration-branch accepts a branch name and flags a whitespace-bearing one', () => {
  const ok = tmpRepo();
  writePolicy(ok, 'integration-branch: dev\n');
  assert.deepStrictEqual(auditPolicy(ok).invalidValues, []);
  assert.deepStrictEqual(auditPolicy(ok).unrecognizedKeys, []);

  const bad = tmpRepo();
  writePolicy(bad, 'integration-branch: dev branch\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, 'a name git itself would reject must be flagged, like every other typed key');
  assert.strictEqual(result.invalidValues[0].key, 'integration-branch');
  assert.strictEqual(result.invalidValues[0].source, 'policy.yml');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/policy-schema.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: FAIL — `integration-branch missing from POLICY_KEYS`, and the unrecognized-key assertion fails because `integration-branch` is not yet a known key.

- [ ] **Step 3: Rename the key in the schema module**

In `bin/lib/policy-schema.js`, change line 14 from `{ key: 'routine.branch', type: 'string' },` to:

```js
  { key: 'integration-branch', type: 'string' },
```

Leave the `case 'string':` validator untouched — it is shared, not key-specific.

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/policy-schema.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS, 17 tests. The `POLICY_KEYS.length` assertion still expects 32 — the count is unchanged by a rename.

- [ ] **Step 5: Rename every prose reference**

Replace the `skills/_shared/policy-schema.md:22` row wholesale (the home changes too — Design B removes CLAUDE.md as a config store, so this key never claims a CLAUDE.md path):

```markdown
| `integration-branch` | `policy.yml` only | `/claude-tweaks:routine`, `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, `/claude-tweaks:build`, `/claude-tweaks:flow`, `/claude-tweaks:assess-agent-autonomy` — all via `_shared/integration-branch.md` | unset (each consumer keeps its own GitHub-default fallback) | The branch where finished work lands and new work starts. Set it on any repo whose active development branch isn't its GitHub default — a `dev` → `staging` → `main` model — where the default is the one branch nothing should be measured against |
```

Then replace the literal `routine.branch` with `integration-branch` in the remaining sites. In `skills/routine/create-and-update.md:65`, the grep becomes:

```bash
INTEGRATION_BRANCH=$(grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//')
```

Note the dropped `CLAUDE.md` argument and the dropped `\.` escape — `integration-branch` contains no regex metacharacter.

- [ ] **Step 6: Verify no occurrence survives**

```bash
grep -rn "routine\.branch" skills/ bin/ tests/ docs/skill-graph.md CHANGELOG.md
```

Expected: **zero lines**. Measured before this task, the same grep returns 23 lines across 10 files. `docs/superpowers/` is deliberately outside the searched paths — the design doc and this plan both record the old name as history and must keep it.

- [ ] **Step 7: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Rename routine.branch to integration-branch — refs #132

The key shipped in cd4e325a but 6.39.0 is unpushed, so it is renamed
before release rather than aliased. Four sites resolve this same fact;
a routine-scoped name would have been wrong for three of them.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 2: Extract the shared resolution fragment

**Files:**
- Create: `skills/_shared/integration-branch.md`
- Modify: `skills/routine/create-and-update.md` (Step 5.5, lines ~58-83)
- Modify: `docs/skill-graph.md` (routine section row for `_shared/policy-schema.md`)

**Interfaces:**
- Produces: `skills/_shared/integration-branch.md` with an H2 `## Resolution ladder` and an H2 `## Per-consumer fallback`. Tasks 4-6 cite this exact path. The resolved value is referred to as `INTEGRATION_BRANCH` in every consumer's shell snippet.

- [ ] **Step 1: Create the fragment**

Create `skills/_shared/integration-branch.md`:

```markdown
# Integration Branch — Canonical Resolution

The branch where finished work lands and new work starts. Canonical for every consumer that needs to know which branch represents this project's current state — read it, start from it, add to it, or compare against it.

## Why this exists

GitHub's default-branch pointer is a *display* fact: which branch the repo opens on, and where issue auto-closing works. On a `dev` → `staging` → `main` model it is not where development happens. Four sites in this plugin used to resolve that pointer independently, and each failed differently — one aborted, one silently measured a change against a tree that diverged 102 commits ago (#132, #61). Stating the branch once, here, is what keeps them from drifting apart again.

## Resolution ladder

Take the **first** source that yields a branch name; once one does, the rest are not consulted.

1. **An explicit argument** — `/claude-tweaks:routine`'s `--branch <name>`, or `/claude-tweaks:assess-agent-autonomy`'s `--base <ref>`. Non-empty is the only check.
2. **`skills/{skill}/routine-template.yml`'s `branch:` field** — routine instantiation only; no other consumer has a template. Normally unset (see `_shared/routine-template-schema.md`).
3. **A flat `integration-branch:` line in `.claude-tweaks/policy.yml`:**

   ```bash
   INTEGRATION_BRANCH=$(grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//')
   ```

   The trailing `s/[[:space:]]*#.*$//` strips an inline comment — this value is pasted into checkout and merge-base commands, where a trailing `# note` would become part of the branch name.
4. **A branching model stated unambiguously in CLAUDE.md prose** — "development happens on `dev`", "branch from `dev`, PR into `dev`". A section that merely *names* several branches, or describes a release train without saying where work lands, resolves nothing: fall through to 5 rather than guessing which name is the one. (This reads project *documentation*, not configuration — it is not a config-key lookup and is unaffected by policy.yml being the sole config home.)
5. **Git — the current branch, checked against the GitHub default:**

   ```bash
   git rev-parse --git-dir --git-common-dir
   git branch --show-current
   gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || git remote show origin | sed -n '/HEAD branch/s/.*: //p'
   ```

   - **Discard the current branch when it isn't a real one.** If the two `git rev-parse` paths differ, this session is inside a linked worktree, so `git branch --show-current` is a throwaway isolation branch that will not exist later — never propose it. Fall through to the GitHub default alone and say so wherever the choice is surfaced. Same worktree detection `[IL-61]` requires, for the same reason: under `worktree.always` the obvious git question answers about the worktree, not the project.
   - Both resolve and **match** → use it.
   - Both resolve and **differ** → do not assume silently. Propose the **current** branch where a human will see it, keeping both values in hand; where no human will (`--defaults`, a headless firing), fall back to the **GitHub default** and print the mismatch without stopping. Never silently pin a branch nobody confirmed.
   - Only one resolves → use that one.
6. **Nothing resolved** → the consumer's own fallback below.

Record which source won — consumers that surface a preview name it.

## Per-consumer fallback

Rank 6 is deliberately per-consumer, because they degrade differently. In every case the unresolved path reproduces the behavior that consumer had before this fragment existed, so a project that sets nothing sees no change.

| Consumer | Uses it for | Fallback when nothing resolved |
|---|---|---|
| `/claude-tweaks:routine` | Substituting `{{TARGET_BRANCH}}` into a routine's prompt | Prose telling the cloud agent to resolve the branch itself at firing time |
| `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up` | Merge target and push target | `git remote show origin` / `gh api default_branch`, as today |
| `/claude-tweaks:assess-agent-autonomy` | `merge-base` for blast radius | `gh api default_branch`, as today; an unresolvable value is already the documented `needs-human` inconclusive-read case |
| `/claude-tweaks:build`, `/claude-tweaks:flow` | Expected fork point | Upstream of the current branch, else `origin/HEAD`, as today |

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Resolving the GitHub default branch inline instead of citing this file | That is exactly how four sites came to answer one question four different ways, with nothing objecting. `tests/integration-branch-conformance.test.js` fails on a new un-cited resolver |
| Using the branch the main checkout currently has checked out | A concurrent session switches it underfoot — the reason `/claude-tweaks:dispatch`'s merge guard exists at all |
| Pinning the current branch inside a linked worktree | It is a throwaway isolation branch; it will not exist when a routine fires or a later run merges |
| Treating rank 4's CLAUDE.md read as a config-key lookup | It reads prose describing a branching model, not a `key: value` line. Design B's policy.yml consolidation does not remove it |
```

- [ ] **Step 2: Collapse Step 5.5 to a citation**

In `skills/routine/create-and-update.md`, replace the whole of Step 5.5 (the numbered ladder, lines ~58-83) with:

```markdown
**Step 5.5 — Resolve the target branch.** The template's `prompt` carries one placeholder, `{{TARGET_BRANCH}}`, which Step 6 substitutes before any `RemoteTrigger` call ever sees it. Resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md`'s Resolution ladder — its rank 2 (`template.branch`) and the `--branch` argument at rank 1 are this skill's own inputs, and its Per-consumer fallback table gives this skill's rank-6 behavior. Do not restate the ladder here.

Keep track of which source won: Step 7's preview names it, and Step 9 writes the resolved value into the instantiated record.
```

- [ ] **Step 3: Verify the ladder is stated once**

```bash
grep -c "Discard the current branch when it isn't a real one" skills/_shared/integration-branch.md skills/routine/create-and-update.md
```

Expected: `skills/_shared/integration-branch.md:1` and `skills/routine/create-and-update.md:0`.

- [ ] **Step 4: Run the routine test suites**

```bash
node --test tests/routine-template-schema.test.js tests/routine-template-parser.test.js tests/skill-conventions.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS, 0 fail. The templates are untouched by this task; this confirms the prose edit broke no conformance rule.

- [ ] **Step 5: Add the skill-graph edge**

In `docs/skill-graph.md`, under `## routine`, replace the `skills/_shared/policy-schema.md` row with:

```markdown
| `skills/_shared/integration-branch.md` | Canonical resolution ladder for the branch this skill substitutes into `{{TARGET_BRANCH}}`. Shared with `/dispatch`, `/wrap-up`, `/build`, `/flow`, and `/assess-agent-autonomy` — this skill contributes ranks 1-2 (its `--branch` argument and the template's own `branch:` pin) and consumes the rest. Owns the `integration-branch` policy key, indexed in `_shared/policy-schema.md`. |
```

- [ ] **Step 6: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Extract the integration-branch resolution ladder to _shared — refs #132

Five consumers need this answer; stating it once is what stops them
answering it five ways. /routine now cites the fragment instead of
restating it.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 3: Build the conformance ratchet

Added before the migrations so tasks 4-6 each get a genuine failing test. Starts with every current resolver allowlisted, so it passes on arrival; each later task removes its own entry first.

**Files:**
- Create: `tests/integration-branch-conformance.test.js`

**Interfaces:**
- Produces: `ALLOWLIST`, a `Map` from skills-relative path to justification string. Tasks 4-6 each delete one or two entries.

- [ ] **Step 1: Write the test**

Create `tests/integration-branch-conformance.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const FRAGMENT = '_shared/integration-branch.md';

// Any file naming the GitHub default branch is answering "which branch is this
// project's current state" — unless it is on this list, which states why not.
// This is the migration ratchet: an entry is removed as its site is migrated,
// and the remainder are the genuinely exempt cases.
const ALLOWLIST = new Map([
  ['_shared/issue-claims.md', 'claim refs need any always-present base SHA; the default branch is arbitrary but reliable, not a statement about where work lands'],
  ['_shared/routine-template-schema.md', 'quotes the unresolved fallback wording verbatim as documentation of what gets substituted'],
  ['dispatch/SKILL.md', 'same claim-ref base SHA as _shared/issue-claims.md'],
  ['init/bootstrap/step-14-cloud-routine-parity.md', 'genuinely about the GitHub default branch — cloud sessions check out the environment branch, which is a different fact'],
  ['assess-agent-autonomy/SKILL.md', 'PENDING MIGRATION — Task 5'],
  ['dispatch/settle-and-merge.md', 'PENDING MIGRATION — Task 4'],
  ['routine/create-and-update.md', 'PENDING MIGRATION — Task 2 left the fallback reference; re-checked in Task 4'],
  ['wrap-up/review-console.md', 'PENDING MIGRATION — Task 4'],
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

test('every file resolving the GitHub default branch cites the shared fragment or is allowlisted', () => {
  const offenders = [];
  for (const file of walk(SKILLS_DIR)) {
    const rel = path.relative(SKILLS_DIR, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!/default_branch|remote show origin/.test(text)) continue;
    if (ALLOWLIST.has(rel)) continue;
    if (text.includes(FRAGMENT)) continue;
    offenders.push(rel);
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these files resolve the GitHub default branch without citing ${FRAGMENT}: ${offenders.join(', ')}`
  );
});

test('the allowlist has no stale entries', () => {
  const stale = [];
  for (const rel of ALLOWLIST.keys()) {
    const full = path.join(SKILLS_DIR, rel);
    if (!fs.existsSync(full)) {
      stale.push(`${rel} (file no longer exists)`);
      continue;
    }
    if (!/default_branch|remote show origin/.test(fs.readFileSync(full, 'utf8'))) {
      stale.push(`${rel} (no longer resolves a default branch — drop the entry)`);
    }
  }
  assert.deepStrictEqual(stale, [], `stale allowlist entries: ${stale.join(', ')}`);
});

test('every allowlist entry carries a justification', () => {
  for (const [rel, why] of ALLOWLIST) {
    assert.ok(why && why.length > 20, `${rel} needs a real justification, got: ${JSON.stringify(why)}`);
  }
});
```

- [ ] **Step 2: Run it and verify it passes**

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS, 3 tests. If the first test fails, a resolver exists that this plan did not enumerate — add it to `ALLOWLIST` with `PENDING MIGRATION` and report it, do not silently migrate it.

- [ ] **Step 3: Verify the test discriminates**

Temporarily delete the `dispatch/settle-and-merge.md` allowlist entry and re-run:

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: FAIL, naming `dispatch/settle-and-merge.md`. Restore the entry and confirm PASS again. A ratchet that cannot fail is not a ratchet.

- [ ] **Step 4: Commit**

```bash
git add tests/integration-branch-conformance.test.js
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Add the integration-branch conformance ratchet — refs #132

Every file naming the GitHub default branch must cite the shared
fragment or state why it is exempt. Starts fully allowlisted; each
migration task removes its own entry first, so the migration has a
real failing test rather than a prose diff.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 4: Migrate the merge target

**Files:**
- Modify: `tests/integration-branch-conformance.test.js` (remove 3 allowlist entries)
- Modify: `skills/dispatch/settle-and-merge.md:90-107`
- Modify: `skills/wrap-up/review-console.md:44-55`
- Modify: `skills/routine/create-and-update.md` (add the fragment citation to its fallback mention)

**Interfaces:**
- Consumes: `skills/_shared/integration-branch.md` (Task 2), `ALLOWLIST` (Task 3).

- [ ] **Step 1: Remove the three allowlist entries**

In `tests/integration-branch-conformance.test.js`, delete these lines from `ALLOWLIST`:

```js
  ['dispatch/settle-and-merge.md', 'PENDING MIGRATION — Task 4'],
  ['routine/create-and-update.md', 'PENDING MIGRATION — Task 2 left the fallback reference; re-checked in Task 4'],
  ['wrap-up/review-console.md', 'PENDING MIGRATION — Task 4'],
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: FAIL, listing `dispatch/settle-and-merge.md`, `routine/create-and-update.md`, `wrap-up/review-console.md`.

- [ ] **Step 3: Migrate `dispatch/settle-and-merge.md`**

Replace the paragraph and code block at lines 88-107. The old prose justifying plain `git` over `gh` is dropped — the fragment owns that choice now.

```markdown
Then, from the main checkout. Resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md` — its Per-consumer fallback table gives this skill's rank-6 behavior (`git remote show origin`, local repository metadata that works regardless of transport):

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$INTEGRATION_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$INTEGRATION_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"
```

The guard stays, retargeted. Its job is catching a concurrent session switching the shared checkout out from under this merge — unchanged and still necessary. What changes is that on a repo whose integration branch isn't the GitHub default, it no longer aborts every single time on a mismatch that was never real.

Then, back inside `$GROUP_WORKTREE` — not the main checkout, which the `worktree.always` gate denies a push from even after `close-run` (both checkouts share the same underlying `.git`, so pushing the just-merged `$INTEGRATION_BRANCH` ref from the worktree pushes exactly what the main checkout just merged):

```bash
git -C "$GROUP_WORKTREE" push origin "$INTEGRATION_BRANCH"
```
```

- [ ] **Step 4: Migrate `wrap-up/review-console.md`**

Replace its `DEFAULT_BRANCH` block the same way:

```markdown
Resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md`, then from the main checkout:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$INTEGRATION_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$INTEGRATION_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[fast-lane] {one-line summary}

Fixes #{issue}"
git push
```
```

- [ ] **Step 5: Add the citation to `routine/create-and-update.md`**

Its Step 6 substitution table still quotes `git remote show origin` as the unresolved fallback text. Task 2 replaced the ladder but left that quote, so add the citation to the sentence introducing the table:

```markdown
`RESOLVED_PROMPT` is `template.prompt` with its single `{{TARGET_BRANCH}}` placeholder replaced, using Step 5.5's result (see `skills/_shared/integration-branch.md`'s Per-consumer fallback table for why the unresolved row reads as it does):
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Resolve the merge target from integration-branch — refs #132

/dispatch's auto-merge and /wrap-up's fast-lane both hard-coded the
GitHub default branch, so on a dev-model repo the concurrent-session
guard aborted every run on a mismatch that was never real. The guard
stays, retargeted.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 5: Migrate the diff baseline

The fails-unsafe fix. Blast radius is currently measured from the merge base with the GitHub default branch, so on a diverged repo the diff spans every commit since the fork and `merge-check` returns `needs-human` with "too many files changed" as a plausible, wrong reason.

**Files:**
- Modify: `tests/integration-branch-conformance.test.js` (remove 1 allowlist entry)
- Modify: `skills/assess-agent-autonomy/SKILL.md:172-190`

- [ ] **Step 1: Remove the allowlist entry**

Delete from `ALLOWLIST`:

```js
  ['assess-agent-autonomy/SKILL.md', 'PENDING MIGRATION — Task 5'],
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: FAIL, naming `assess-agent-autonomy/SKILL.md`.

- [ ] **Step 3: Migrate the resolution**

Replace the `DEFAULT_BRANCH` paragraph and its two code blocks with:

```markdown
  Resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md`. `--base <ref>` remains rank 1 of that ladder — a caller that already knows the merge base (dispatch's per-group Task agent, which set up the worktree itself) passes it and skips resolution entirely.

  If nothing resolves — no `origin` remote, no `gh` auth, an offline or detached runner — stop here. This is the "inconclusive read" case `## Error Handling` already covers, not a hard crash. Render Step 3 directly: `VERDICT: needs-human` / `RATIONALE: {name the specific resolution failure, e.g. "could not resolve this project's integration branch"}`, and skip the rest of this mode's procedure.

```bash
MERGE_BASE=$(git merge-base "$INTEGRATION_BRANCH" HEAD)
```

  Measuring from the integration branch rather than the GitHub default is what makes blast radius mean the record's own change. Against a branch that diverged long ago, the merge base is ancient and the diff spans every commit since the fork — which reads as an enormous change and returns `needs-human` for a reason that looks legitimate and isn't (#132).
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/integration-branch-conformance.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Measure blast radius from the integration branch — refs #132

merge-check diffed against the merge base with the GitHub default
branch. On a diverged repo that base is ancient, so the diff spanned
every commit since the fork and auto-merge could never fire — with
"too many files changed" as a plausible, wrong reason. The one site
here that failed unsafe rather than aborting.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 6: Migrate the fork point, and require `baseRef: head`

Neither `build/worktree-setup.md` nor `flow/validation.md` matches the conformance grep — they derive from `origin/HEAD` via `git symbolic-ref`, not `default_branch`. They are migrated for correctness, and Step 5 widens the ratchet to cover the pattern they use.

**Files:**
- Modify: `skills/build/worktree-setup.md:24-30`
- Modify: `skills/flow/validation.md:14-20`
- Modify: `skills/init/bootstrap/step-06-worktree-configuration.md:11-14`
- Modify: `tests/integration-branch-conformance.test.js` (widen the pattern)

- [ ] **Step 1: Migrate both fork-point derivations**

In `skills/build/worktree-setup.md` and `skills/flow/validation.md`, replace the identical `UPSTREAM=` snippet in each with:

```bash
# Integration branch when set (skills/_shared/integration-branch.md), else the
# upstream of the current branch, else the remote default branch (origin/HEAD).
UPSTREAM="${INTEGRATION_BRANCH:+origin/$INTEGRATION_BRANCH}"
[ -n "$UPSTREAM" ] || UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
  || UPSTREAM="origin/$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
git fetch "${UPSTREAM%%/*}" "${UPSTREAM#*/}" 2>/dev/null
ahead=$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null)
```

In each file, add before the block: `Resolve `INTEGRATION_BRANCH` per `skills/_shared/integration-branch.md` first — when set it names the expected fork point directly, replacing the upstream-then-origin/HEAD guess.`

- [ ] **Step 2: Verify the snippet runs under bash**

```bash
bash -c 'INTEGRATION_BRANCH=dev; UPSTREAM="${INTEGRATION_BRANCH:+origin/$INTEGRATION_BRANCH}"; echo "set -> [$UPSTREAM]"'
bash -c 'INTEGRATION_BRANCH=""; UPSTREAM="${INTEGRATION_BRANCH:+origin/$INTEGRATION_BRANCH}"; [ -n "$UPSTREAM" ] || UPSTREAM="fellthrough"; echo "unset -> [$UPSTREAM]"'
```

Expected: `set -> [origin/dev]` and `unset -> [fellthrough]`. Verify under `bash -c` specifically, not the interactive zsh — `[IL-22]`.

- [ ] **Step 3: Make `baseRef: head` required when the lever is set**

In `skills/init/bootstrap/step-06-worktree-configuration.md`, replace item 4's prompt text with:

```markdown
4. **Base ref** — see `_shared/worktree-base-ref.md` for why this matters (shared with `build/worktree-setup.md`'s runtime verification of the same setting). Read `settings.json`; if `worktree.baseRef` is unset or `fresh`, surface:
   ```
   Worktree base ref is `{current value or 'unset (default: fresh)'}`. claude-tweaks branches from your current local HEAD — `fresh` can branch from a stale `origin/<default-branch>`. Set `worktree.baseRef: "head"`? (Y/n)
   ```
   **When `integration-branch` is set in `.claude-tweaks/policy.yml` and differs from the repo's GitHub default branch, this stops being a recommendation.** Under `fresh` every task forks from `origin/<GitHub default>` — the wrong branch by construction, on every single run. Say so explicitly rather than asking neutrally: `"This project's integration branch is '{integration}', but the GitHub default is '{default}'. With baseRef 'fresh', every worktree would branch from '{default}'. Setting it to 'head' is required for this project, not optional."` The plugin cannot set this itself — it lives in the harness's settings.json and `EnterWorktree` accepts no base-ref argument — so a declined offer leaves the hole open, with `/claude-tweaks:build`'s own base-ref verification as the only backstop.

   On yes, write `{ "worktree": { "baseRef": "head" } }` into `settings.json` (backup first, merge — don't clobber existing keys). In `auto` mode, set it without prompting and log the change.
```

- [ ] **Step 4: Widen the ratchet to cover the fork-point pattern**

In `tests/integration-branch-conformance.test.js`, change both occurrences of the pattern to include the `origin/HEAD` derivation, and add the two now-migrated files' sibling exemption:

```js
const RESOLVER = /default_branch|remote show origin|refs\/remotes\/origin\/HEAD/;
```

Replace both inline `/default_branch|remote show origin/.test(...)` calls with `RESOLVER.test(...)`.

- [ ] **Step 5: Run the full conformance and worktree-adjacent suites**

```bash
node --test tests/integration-branch-conformance.test.js tests/skill-conventions.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected: PASS. Measured while authoring this plan, exactly two files match `refs/remotes/origin/HEAD`: `build/worktree-setup.md` and `flow/validation.md` — the two Step 1 just edited. They still match after the edit, because the replacement snippet keeps `origin/HEAD` as its final fallback; they pass because Step 1 added the fragment citation. **This is why Step 1 must precede Step 4.** Widening first would fail on the very files this task migrates, producing a red test that says nothing. If a third file appears, add it to `ALLOWLIST` with a real justification and report it rather than migrating it unplanned.

- [ ] **Step 6: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Expect the fork point at the integration branch — refs #132

/build and /flow guessed the fork point from upstream-then-origin/HEAD.
When integration-branch is set it names that point directly, which turns
an ambiguous mis-fork warning into one naming both branches. /init now
states baseRef head as required, not recommended, when the two differ —
under fresh every task forks from the wrong branch by construction.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

### Task 7: Documentation and changelog

**Files:**
- Modify: `CHANGELOG.md` (the 6.39.0 entry)
- Modify: `docs/skill-graph.md` (edges for the new fragment's other consumers)
- Modify: `skills/_shared/policy-schema.md` (verify the Task 1 row is still accurate after all migrations)

- [ ] **Step 1: Rewrite the 6.39.0 changelog entry**

Replace the existing `## v6.39.0` heading and body. Keep the #132 narrative — it is still the origin — and add the generalization:

```markdown
## v6.39.0 — Routines and merges follow the branch you name, not the GitHub default (closes #132)

Four places independently resolved "which branch is this project's current state" — which tree a
routine audits, where a task forks from, where finished work merges, and what a change's blast
radius is measured against. All four asked GitHub for its default branch. On a `dev` → `staging` →
`main` model that is the one branch nobody develops on: on the reporting repo it was 102 commits
behind the active branch **and 51 ahead of it**, divergent rather than merely stale, because urgent
fixes are cherry-picked straight onto it.

They failed differently, and the worst one had never been reported. Auto-merge aborted, which is
visible. But `merge-check` sizes a record's change by diffing against the merge base with the
default branch — and against a branch that diverged long ago, that base is ancient, so the diff
spans every commit since the fork. Blast radius came back enormous, the verdict was `needs-human`,
and the stated reason was "too many files changed." Auto-merge could never fire on such a repo, and
the log looked like the gate working correctly.

One `integration-branch` key in `.claude-tweaks/policy.yml` now answers all four, resolved through
`skills/_shared/integration-branch.md`: an explicit argument, then the key, then a branching model
documented in CLAUDE.md prose, then git — where a current branch differing from the GitHub default
is surfaced rather than silently picked, and a linked worktree's throwaway branch is never proposed
at all. Unset reproduces the old behavior per consumer, so a project that sets nothing sees no
change. A conformance test now fails on any new site that resolves the default branch without
citing the fragment — the check that would have caught this originally.

Naming the branch was only half of it: the routine preamble previously told a container that
started on the wrong branch to fast-forward, never to switch. It now says to check the target
branch out.

Existing live routines hold a frozen copy of their creation-time prompt and do not pick this up on
their own. Every `template_version` is bumped, so `/claude-tweaks:routine status --all` reports
them as Drifted and `update <skill>` rewrites the live prompt in place;
`_shared/routine-template-schema.md` documents the case that recourse cannot reach — a routine
created outside this skill, with no record.
```

- [ ] **Step 2: Add skill-graph edges for the new consumers**

Add one row per new consumer, under each consumer skill's own section, naming `skills/_shared/integration-branch.md` as the target. Under `## dispatch`:

```markdown
| `skills/_shared/integration-branch.md` | Resolves the auto-merge target and push target. The concurrent-session guard compares the main checkout against this value, not the GitHub default. |
```

Under `## assess-agent-autonomy`:

```markdown
| `skills/_shared/integration-branch.md` | Resolves the `merge-base` blast radius is measured from in `merge-check`. `--base <ref>` is rank 1 of that ladder. |
```

Under `## build`:

```markdown
| `skills/_shared/integration-branch.md` | Names the expected fork point when set, replacing the upstream-then-`origin/HEAD` derivation in `worktree-setup.md`. Shared with `/flow`'s `validation.md`, which runs the identical check. |
```

- [ ] **Step 3: Run the full suite**

```bash
npm test > /tmp/plan-a-final.txt 2>&1; echo "exit=$?" >> /tmp/plan-a-final.txt
grep -E "^# (tests|pass|fail)|^exit=" /tmp/plan-a-final.txt | tail -5
```

Expected: 0 fail, `exit=0`. Before trusting the result, confirm no other `node --test` process was running concurrently (`ps aux | grep "[n]ode --test"`) — a competing suite makes failures untrustworthy.

- [ ] **Step 4: Verify the whole change set against the spec**

```bash
grep -rn "integration-branch" skills/_shared/policy-schema.md skills/_shared/integration-branch.md | head
grep -c "_shared/integration-branch.md" skills/dispatch/settle-and-merge.md skills/wrap-up/review-console.md skills/assess-agent-autonomy/SKILL.md skills/build/worktree-setup.md skills/flow/validation.md skills/routine/create-and-update.md
```

Expected: every file returns a count of at least 1. A zero means that consumer was never migrated.

- [ ] **Step 5: Commit**

```bash
git add -A
git diff --cached --name-only
git commit -m "$(cat <<'EOF'
Record the integration-branch lever in the changelog and skill graph — refs #132

Rewrites the 6.39.0 entry to cover the generalization rather than the
routine-only fix, and adds the fragment's edges for its four new
consumers.

Claude-Session: https://claude.ai/code/session_011Utj69GF9FjMPBHz1KCuej
EOF
)"
```

---

## Notes for the executing agent

- **Task 6 has no failing-test step for its two main edits** because `build/worktree-setup.md` and `flow/validation.md` do not match the ratchet's original pattern — they derive from `origin/HEAD` by a different route. Step 4 widens the pattern *after* the edits, which is deliberate: widening first would fail on files this plan migrates in the same task, giving a red test that says nothing useful. Verify Step 4's widened pattern does not surface unenumerated files.
- **Open question resolved by this plan:** the spec asked whether the ratchet's allowlist earns its maintenance. It does — it is the migration mechanism itself, and its surviving four entries document why those files legitimately name the default branch. Do not replace it with a bare "fail on any hit."
- **Open question NOT resolved:** whether all four CLAUDE.md-only levers deserve a `policy.yml` path belongs to Plan B, not this plan.
- **Do not touch** `skills/flow/worktree-merge.md` — it merges into whatever the main checkout is on and is already correct on a dev-model repo by not asking the question.
