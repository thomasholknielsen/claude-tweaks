# policy.yml Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.claude-tweaks/policy.yml` the single home for every lever `_shared/policy-schema.md` indexes, and ship the detector plus offered migration that keeps a project with keys in CLAUDE.md from silently losing them.

**Architecture:** Three moving parts. (1) `auditPolicy()` inverts how it treats CLAUDE.md — recognized keys there stop being *validated* and start being *flagged for migration*, in a new `migratableKeys` return field. (2) Five executable dual-read grep lines and the prose describing them drop CLAUDE.md, and the four levers with no `policy.yml` path documented get one. (3) `/claude-tweaks:init` Phase 1u.5 gains a Config Home Drift check that reads `migratableKeys` and offers to move the keys, behind a shown diff and a confirm.

**Tech Stack:** Markdown skill files; one dependency-free Node module (`bin/lib/policy-schema.js`); `node --test`.

## Scope decision made at plan time

The design doc left one open question — whether all four CLAUDE.md-only levers deserve a `policy.yml` path or should be retired. **Resolved: all four get one, none retired.** `depth-survey`, `creative-survey`, `backlog-fetch-limit`, and `promise-register-min-leaves` each have live consumers in shipping skills (`/flow`, `_shared/record-queue-fetch.md`, `/specify`), and all four are already in `POLICY_KEYS`, so `auditPolicy()` already validates them. Retiring any is a behavior removal nobody requested.

A second question the design doc did **not** raise, discovered while measuring: `_shared/work-record-config.md` owns three keys that are real config, written by `/claude-tweaks:init` into CLAUDE.md, and **absent from `POLICY_KEYS` entirely** — `work-backend`, `work-types`, `record-staleness-weeks`. The detector cannot see them. This repo's own CLAUDE.md carries `work-backend: github-issues`, so shipping the design as written leaves a config key in CLAUDE.md on day one, in the very repo that ships the consolidation.

**Resolved: those three stay in CLAUDE.md for now, deliberately and documented, not silently.** Three reasons:

1. They are not the reported problem. The complaint was **dual support** — one key readable from two places. All three are single-home already. This plan eliminates every dual-read; what remains is two single-home namespaces, which is a lesser and defensible thing *provided it is stated*.
2. `work-backend` is a hard-gate input to two "stop this turn completely" paths (`/claude-tweaks:dispatch` Preflight, `/claude-tweaks:backlog refine`'s grant sub-stage). Moving its home is a different risk class from moving `depth-survey`.
3. CLAUDE.md is ambient — always in context — while `policy.yml` requires an explicit read. That difference deserves its own decision, not a fold-in at the end of a consolidation plan.

Task 3 writes this boundary into `_shared/work-record-config.md` as an explicit statement with its reason. Task 5 files it as a follow-up record. **An implementer must not widen scope to those three keys.**

## Global Constraints

- Every skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form. Bare `/{skill}` is for descriptive prose only.
- No emojis in skill files. Use `**(Recommended)**` for emphasis.
- Never run `npm test` as a background command — it hangs subagents. Run it in the foreground, redirected to a file, then grep the file.
- **The suite has a known-red baseline of exactly 2 failures, and they are not yours.** Measured on this branch immediately after merging `origin/main` at `3bf55c68`: `# tests 2053`, `# pass 2051`, `# fail 2`. Both are in `tests/changelog-coverage.test.js`: `1 version(s) shipped on origin/main with no CHANGELOG entry: 6.39.0`, and `CHANGELOG entries name versions that never reached the release branch` (orphans `6.41.0 6.40.0 6.39.4 6.39.3 6.39.2 6.38.3`). Both reproduce against `origin/main`'s own CHANGELOG — verified by running `findCoverageGaps` on `git show origin/main:CHANGELOG.md` — so they are upstream, pre-existing, and a sibling worktree (`worktree-impeccable-upstream-contract`) is already fixing them. **Do not fix them, do not renumber anything to satisfy them, and do not report your task green while hiding them.** The passing bar for every task is: `# fail 2`, and both failures are those two. A third failure, or a different one, is yours.
- All work happens in the existing worktree at `.claude/worktrees/fix-132-routine-branch`. Before any commit, verify `pwd` and `git rev-parse --show-toplevel` both point there.
- Commit messages reference issues as `refs #N`, never `closes #N`.
- The four migrating levers keep their exact current defaults: `depth-survey` unset, `creative-survey` unset, `backlog-fetch-limit` `1000`, `promise-register-min-leaves` `4`.
- `auditPolicy()` must never throw, on any input, including unreadable or binary files.
- If any task adds or removes a `| Pattern | Why It Fails |` row in any SKILL.md, update the total at `bin/lib/skill-audit/tests/anti-patterns.test.js:157` (currently `347`) and add a dated comment line above it explaining the delta, matching the existing comment style at lines 141-148.
- `POLICY_KEYS.length` is asserted twice at `tests/policy-schema.test.js:22-23` (currently `32`). This plan adds no keys, so both assertions stay `32` — if a task changes the array length, it changed something out of scope.

---

## Task 1: `auditPolicy()` flags CLAUDE.md keys instead of validating them

The producer, its one consumer, and its tests move together — a producer gaining a field whose consumer lands in a later task is exactly the cross-boundary gap task-scoped review cannot catch (`[IL-04]`).

**Files:**
- Modify: `bin/lib/policy-schema.js:89-109` (`auditPolicy`)
- Modify: `tests/policy-schema.test.js`
- Modify: `skills/harness-health/SKILL.md:66` (the Policy schema check paragraph)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `auditPolicy(repoRoot)` returns `{ unrecognizedKeys: string[], invalidValues: Array<{key, value, expected}>, migratableKeys: Array<{key, value, alsoInPolicy: boolean}> }`. Task 4 reads `migratableKeys`. Note `invalidValues` entries **no longer carry `source`**.

- [ ] **Step 1: Write the failing tests**

Add these to `tests/policy-schema.test.js`. Do not touch the existing tests yet — Step 3 handles all five that this change affects (two rewritten, three losing a single assertion line each).

```js
test('a recognized key in CLAUDE.md is flagged for migration, not validated', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: moderate\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [
    { key: 'tidy-aggressiveness', value: 'moderate', alsoInPolicy: false },
  ]);
  assert.deepStrictEqual(result.invalidValues, [], 'CLAUDE.md values are no longer validated — the fix is to move the key, not to correct a value that has no effect');
});

test('a recognized key in CLAUDE.md with an INVALID value is still only a migration, never an invalidValues entry', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.migratableKeys.length, 1);
  assert.strictEqual(result.migratableKeys[0].value, 'extreme');
  assert.deepStrictEqual(result.invalidValues, [], 'once CLAUDE.md is not read, its values cannot be wrong — only misplaced');
});

test('the same key in policy.yml is not flagged for migration', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: moderate\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, []);
});

test('a key in BOTH resolves to policy.yml and still flags the CLAUDE.md copy, marked alsoInPolicy', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: aggressive\n');
  writeClaudeMd(repo, 'tidy-aggressiveness: conservative\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [
    { key: 'tidy-aggressiveness', value: 'conservative', alsoInPolicy: true },
  ]);
  assert.deepStrictEqual(result.invalidValues, [], 'both values are individually valid; policy.yml is the one that applies');
});

test('an UNrecognized key in CLAUDE.md is not flagged — CLAUDE.md prose is full of key-shaped lines', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'Lifecycle: capture -> specify -> build\nStatus: Approved\nwork-backend: github-issues\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [], 'only keys in POLICY_KEYS are migratable; work-backend is deliberately out of scope, and ordinary prose must never be touched');
  assert.deepStrictEqual(result.unrecognizedKeys, [], 'unrecognizedKeys is policy.yml-derived only');
});

test('invalidValues entries no longer carry a source field', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const [entry] = auditPolicy(repo).invalidValues;
  assert.strictEqual(entry.source, undefined, 'every entry is policy.yml-derived now — a field that can hold exactly one value reads as a live branch and is not one');
  assert.deepStrictEqual(Object.keys(entry).sort(), ['expected', 'key', 'value']);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL. The `migratableKeys` assertions fail with `undefined`; the `source` assertion fails because the field is still present.

- [ ] **Step 3: Fix the two existing tests this change invalidates**

`tests/policy-schema.test.js:77-80` asserts exact object equality and must gain the new field:

```js
test('missing policy.yml and missing CLAUDE.md -> all-empty result', () => {
  const result = auditPolicy(tmpRepo());
  assert.deepStrictEqual(result, { unrecognizedKeys: [], invalidValues: [], migratableKeys: [] });
});
```

`tests/policy-schema.test.js:139-147` asserts the now-removed behavior. Replace the whole test with:

```js
test('a CLAUDE.md key is reported under migratableKeys, never invalidValues', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
  assert.strictEqual(result.migratableKeys.length, 1);
  assert.strictEqual(result.migratableKeys[0].key, 'tidy-aggressiveness');
});
```

`tests/policy-schema.test.js:129-137` (`invalid value in policy.yml is flagged with source: policy.yml`) asserts `source === 'policy.yml'` on its last line. Delete only that one assertion line; keep the rest of the test.

`tests/policy-schema.test.js:157-166` (`mixed policy.yml + CLAUDE.md content...`) asserts the CLAUDE.md entry appears in `invalidValues`. Replace its last three lines with:

```js
  const migrated = result.migratableKeys.find((e) => e.key === 'tidy-aggressiveness');
  assert.ok(migrated, 'expected the CLAUDE.md key to be reported as migratable');
  assert.strictEqual(migrated.alsoInPolicy, false);
```

`tests/policy-schema.test.js:41-53` (`integration-branch accepts a branch name...`) asserts `source === 'policy.yml'` at line 52. Delete that one assertion line.

- [ ] **Step 4: Write the implementation**

Replace `auditPolicy` in `bin/lib/policy-schema.js` entirely:

```js
function auditPolicy(repoRoot) {
  const policyRaw = readFileSafe(path.join(repoRoot, '.claude-tweaks', 'policy.yml'));
  const claudeMdRaw = readFileSafe(path.join(repoRoot, 'CLAUDE.md'));
  const policyEntries = parseFlatLines(policyRaw);
  const claudeMdEntries = parseFlatLines(claudeMdRaw);
  const schemaByKey = new Map(POLICY_KEYS.map((entry) => [entry.key, entry]));

  const unrecognizedKeys = Object.keys(policyEntries).filter((key) => !schemaByKey.has(key));

  // policy.yml is the only config home, so it is the only thing worth validating.
  const invalidValues = [];
  for (const [key, value] of Object.entries(policyEntries)) {
    const schemaEntry = schemaByKey.get(key);
    if (schemaEntry && !isValidValue(schemaEntry, value)) {
      invalidValues.push({ key, value, expected: schemaEntry });
    }
  }

  // A recognized key still sitting in CLAUDE.md no longer applies to anything.
  // Its value is not audited — correcting a value nobody reads is not the fix;
  // moving the key is. `alsoInPolicy` separates the two remedies: false means
  // "move it," true means "delete the dead copy, policy.yml already wins."
  // Deliberately restricted to POLICY_KEYS: CLAUDE.md prose is full of
  // key-shaped lines ("Lifecycle:", "Status:"), and the /init migration this
  // feeds deletes lines from a file users hand-tune.
  const migratableKeys = [];
  for (const [key, value] of Object.entries(claudeMdEntries)) {
    if (!schemaByKey.has(key)) continue;
    migratableKeys.push({
      key,
      value,
      alsoInPolicy: Object.prototype.hasOwnProperty.call(policyEntries, key),
    });
  }

  return { unrecognizedKeys, invalidValues, migratableKeys };
}
```

- [ ] **Step 5: Run the full policy-schema suite**

Run: `node --test tests/policy-schema.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Update the one consumer**

`skills/harness-health/SKILL.md:66` currently branches the issue title on whether any `invalidValues` entry has `source: 'CLAUDE.md'`. That branch is now unreachable — every entry is policy.yml-derived — so it collapses, and a new migration finding takes its place.

Replace the sentence beginning "This is a deterministic validation check" through the end of the sentence ending "...from `expected`)." with:

```markdown
This is a deterministic validation check, not the judged dimension analysis `_shared/harness-health-analysis.md` performs — a malformed key or value is a mechanical fact, not a semantic judgment, so it doesn't produce a `patch`/`new-skill` finding through that shared file. If `unrecognizedKeys`, `invalidValues`, and `migratableKeys` are all empty, do nothing further for this check this firing. Otherwise, file one work-record issue (origin `by:harness-health`, `risk:low` + `effort:low` — this is always a same-shape mechanical fix) titled `"policy.yml has {N} unrecognized key(s) / invalid value(s)"` when only `unrecognizedKeys`/`invalidValues` are non-empty, `"CLAUDE.md has {M} policy key(s) that no longer apply"` when only `migratableKeys` is, and `"policy.yml has {N} problem(s); CLAUDE.md has {M} policy key(s) that no longer apply"` when both are. Body: each `unrecognizedKeys` entry (possible typo or a stale key removed from the schema — see `_shared/policy-schema.md`), each `invalidValues` entry (`key`, the actual `value`, and the expected type/enum from `expected` — all of these are `policy.yml`-derived, which is the only file read for config), and each `migratableKeys` entry as a migration line: `key`, its CLAUDE.md `value`, and the remedy, which `alsoInPolicy` picks — `false` means move the key into `.claude-tweaks/policy.yml`, `true` means delete the CLAUDE.md line because `policy.yml` already carries that key and is what applies. Recommend `/claude-tweaks:init --update`, whose Config Home Drift check performs the move behind a shown diff, rather than describing a hand-edit.
```

Leave the rest of the paragraph (the dedup and `--dry-run` sentences) exactly as it is.

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test > /tmp/plan-b-task-1.log 2>&1; echo "exit=$?"`
Then: `grep -E "^# (fail|pass)" /tmp/plan-b-task-1.log`
Expected: `exit=1`, `# fail 2` — and both failures are the two known-red changelog ones named in Global Constraints. `exit=1` is the correct result here, not a problem to solve. Any third failure is yours.

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js skills/harness-health/SKILL.md
git diff --cached --name-only
git commit -m "Flag CLAUDE.md policy keys for migration instead of validating them — refs #132"
```

---

## Task 2: The five dual-read sites read policy.yml alone

**Files:**
- Modify: `skills/wrap-up/unblocked-records.md:8`
- Modify: `skills/dispatch/settle-and-merge.md:25,28`
- Modify: `skills/dispatch/SKILL.md:52,101,344,353`
- Modify: `skills/assess-agent-autonomy/SKILL.md:225,226`
- Modify: `skills/flow/SKILL.md:111`
- Modify: `skills/flow/manifesto.md:20,144`
- Modify: `skills/_shared/unattended-tier.md:32`
- Modify: `skills/_shared/auto-mode-contract.md:41,44`
- Modify: `skills/_shared/pipeline-run-dir.md:10`
- Modify: `skills/visualize/record-graph.md:106`
- Modify: `skills/init/summary-templates.md:162`

**Out of scope in this task — do not change these.** Each names CLAUDE.md as the home of a key this plan deliberately leaves there (see the Scope decision above): `skills/_shared/record-queue-fetch.md:18` and `:91` (`work-backend`, `record-staleness-weeks`), `skills/capture/SKILL.md:47`, `skills/tidy/scan-procedures.md:11`, `skills/dispatch/SKILL.md:59`, `skills/challenge/SKILL.md:56`, `skills/init/SKILL.md:161`, `skills/init/bootstrap/step-17-work-record-backend.md:29`, `skills/help/context-flow.md:52`. Touching any of them widens the plan past its approved scope.

**Interfaces:**
- Consumes: nothing from Task 1 at runtime — these are skill prose, independent of the Node module.
- Produces: the single-read grep idiom every later task's prose refers to.

- [ ] **Step 1: Convert the executable grep lines**

Each of these currently passes two filenames to one `grep`. Drop `CLAUDE.md`, and add the inline-comment strip that `_shared/integration-branch.md` rank 3 already uses — these values are interpolated into commands, and a trailing `# note` would ride along.

`skills/wrap-up/unblocked-records.md:8`:

```bash
WORK_LINKS=$(grep -E "^work-links:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//; s/[[:space:]]*#.*$//')
```

`skills/dispatch/SKILL.md:101` — identical replacement, same line.

`skills/dispatch/settle-and-merge.md:28`:

```bash
DISPATCH_RETRY_CEILING=$(grep -E "^dispatch-retry-ceiling:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*dispatch-retry-ceiling:[[:space:]]*//; s/[[:space:]]*#.*$//')
```

`skills/assess-agent-autonomy/SKILL.md:225-226`:

```bash
grep -E "^merge-sensitive-paths:|^automerge-max-lines:|^automerge-max-files:" .claude-tweaks/policy.yml 2>/dev/null
MERGE_SENSITIVE_PATHS_CSV=$(grep -E "^merge-sensitive-paths:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//; s/[[:space:]]*#.*$//')
```

Note the `sed` on line 226 changes from `'s/^[^:]*: *//'` to the anchored form above. With two filenames, `grep` prefixed each hit with `filename:`, so `^[^:]*:` stripped the filename and a second `: ` stripped the key. With one filename there is no prefix, so the old pattern would strip only the key name — which happens to be correct — but `[[:space:]]*` and the comment strip are still the improvement. Verify the replacement against a real file before committing (Step 2).

- [ ] **Step 2: Verify each converted grep against a real fixture**

Do not approve these by reading them (`[IL-35]`). Create a fixture and run each one:

```bash
mkdir -p /tmp/plan-b-fixture/.claude-tweaks
printf 'work-links: native\ndispatch-retry-ceiling: 5  # raised for the migration\nmerge-sensitive-paths: src/auth/**,infra/**\n' > /tmp/plan-b-fixture/.claude-tweaks/policy.yml
cd /tmp/plan-b-fixture
grep -E "^work-links:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*work-links:[[:space:]]*//; s/[[:space:]]*#.*$//'
grep -E "^dispatch-retry-ceiling:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*dispatch-retry-ceiling:[[:space:]]*//; s/[[:space:]]*#.*$//'
grep -E "^merge-sensitive-paths:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//; s/[[:space:]]*#.*$//'
```

Expected, exactly three lines: `native`, `5`, `src/auth/**,infra/**`. The middle one proves the comment strip works. Then return to the worktree.

- [ ] **Step 3: Update the prose that describes the dual read**

These sentences claim CLAUDE.md is honored. Each becomes a `policy.yml`-only statement. Edit the phrase, not the surrounding sentence — several of these sit inside long paragraphs, and a rewrite risks orphaning a clause (`[IL-27]`).

| File:line | Current phrase | Replacement |
|---|---|---|
| `skills/dispatch/settle-and-merge.md:25` | ``read `dispatch-retry-ceiling` from CLAUDE.md/`policy.yml`, default 3`` | ``read `dispatch-retry-ceiling` from `.claude-tweaks/policy.yml`, default 3`` |
| `skills/dispatch/SKILL.md:52` | ``does not edit CLAUDE.md/policy.yml`` | ``does not edit `.claude-tweaks/policy.yml``` |
| `skills/dispatch/SKILL.md:344` | ``Read from CLAUDE.md or `.claude-tweaks/policy.yml`:`` | ``Read from `.claude-tweaks/policy.yml`:`` |
| `skills/dispatch/SKILL.md:353` | ``neither writes back to CLAUDE.md/`policy.yml``` | ``neither writes back to `.claude-tweaks/policy.yml``` |
| `skills/flow/SKILL.md:111` | ``` `auto-mode:` setting (CLAUDE.md is also honored for this key)``` | ``` `auto-mode:` setting``` |
| `skills/flow/manifesto.md:20` | ``` `.claude-tweaks/policy.yml` (if exists) or CLAUDE.md `auto-mode:` keys``` | ``` `.claude-tweaks/policy.yml` (if exists) `auto-mode:` key``` |
| `skills/flow/manifesto.md:144` | ``From `.claude-tweaks/policy.yml` or CLAUDE.md `auto-mode:` keys`` | ``From `.claude-tweaks/policy.yml`'s `auto-mode:` key`` |
| `skills/_shared/unattended-tier.md:32` | ``CLAUDE.md / `.claude-tweaks/policy.yml` project default`` | ``` `.claude-tweaks/policy.yml` project default``` |
| `skills/_shared/auto-mode-contract.md:41` | ``or `auto-mode: default-on` in CLAUDE.md`` | ``or `auto-mode: default-on` in `.claude-tweaks/policy.yml``` |
| `skills/_shared/auto-mode-contract.md:44` | ``or `auto-mode: default-off` in CLAUDE.md`` | ``or `auto-mode: default-off` in `.claude-tweaks/policy.yml``` |
| `skills/_shared/auto-mode-contract.md:54` | ``**Project policy** — defaults in `CLAUDE.md` (e.g., `scope-creep: add-to-plan`)`` | ``**Project policy** — defaults in `.claude-tweaks/policy.yml` (e.g., `scope-creep: add-to-plan`)`` |
| `skills/_shared/pipeline-run-dir.md:10` | ``the skill auto-resolves per project policy in CLAUDE.md`` | ``the skill auto-resolves per project policy in `.claude-tweaks/policy.yml``` |
| `skills/visualize/record-graph.md:106` | ``read `work-links` from the project's CLAUDE.md`` | ``read `work-links` from the project's `.claude-tweaks/policy.yml``` |

One row needs splitting rather than replacing. `skills/init/summary-templates.md:162` reads ``Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap ...``. Only `work-links` moves; the other two are deliberately out of scope. Replace that fragment with:

```markdown
Set work-backend / work-types in CLAUDE.md and work-links in `.claude-tweaks/policy.yml`; offer core-label bootstrap
```

Leave the rest of that table cell — the parenthetical about the Label taxonomy table — byte-identical.

- [ ] **Step 4: Prove no dual-read site survives — two greps, not one**

The obvious grep ("lines naming both files") is **insufficient by construction** and missed four real sites while this plan was being written. A prose instruction like ``read `work-links` from the project's CLAUDE.md`` never mentions `policy.yml`, so it cannot appear in a grep keyed on both names — the defect is the absence of the word you are searching for (`[IL-15]`). Run both.

**Grep A — lines naming both files:**

```bash
grep -rn "CLAUDE\.md" --include="*.md" skills/ | grep "policy\.yml"
```

Expected survivors, and **only** these — each is about something other than reading a config key:

- `skills/init/SKILL.md:149` — `integration-branch`'s effect on routines
- `skills/init/update-mode.md:149` — states Routine Drift is *not* a CLAUDE.md/policy.yml marker
- `skills/init/phase-3-classification.md:66` — CLAUDE.md Philosophy prose vs. the `project.maturity` flag
- `skills/init/rules-template.md:20` — rule-file line budgets
- `skills/harness-health/judge-procedure.md:45`, `skills/_shared/harness-health-analysis.md:92` — always-loaded line budgets
- `skills/harness-health/SKILL.md:66` — Task 1's own new text
- `skills/tidy/SKILL.md:191` — `worktree.always` enforcement
- `skills/_shared/policy-schema.md` (many lines) — Task 3 rewrites these; Task 2 leaves them alone
- `skills/_shared/integration-branch.md:24,59` — rank 4 reads prose, not a key
- `skills/help/reference-card.md:163` — already says "not CLAUDE.md"

**Grep B — lines naming an in-scope key anywhere near CLAUDE.md:**

```bash
grep -rn "work-links\|dispatch-retry-ceiling\|automerge-max-lines\|automerge-max-files\|merge-sensitive-paths\|auto-mode\|unattended-tier\|scope-creep\|tidy-aggressiveness\|dispatch-pick-max-concurrent" --include="*.md" skills/ | grep "CLAUDE\.md"
```

Expected survivors after this task, and **only** these:

- `skills/_shared/policy-schema.md:41,50,52,53,55,77,78,84` — Task 3's job, untouched here
- `skills/init/summary-templates.md:162` — rewritten by this task, still names CLAUDE.md for `work-backend`/`work-types`
- `skills/init/SKILL.md:161`, `skills/dispatch/SKILL.md:59`, `skills/backlog/SKILL.md:56` — `work-backend`, out of scope
- `skills/init/update-mode.md:105`, `skills/tidy/step-6-auto.md:27` — the "CLAUDE.md is never edited autonomously" rule, which is about *editing*, not about where a key is read
- `skills/_shared/local-files-preflight-stop.md:70`, `skills/_shared/auto-mode-contract.md:180`, `skills/dispatch/SKILL.md` and `skills/backlog/SKILL.md` Preflight paragraphs — all say "conventions elsewhere in CLAUDE.md do not supersede this stop," which is about precedence of *instructions*, not config-key homes
- `skills/wrap-up/config-updates.md:18`, `skills/init/claude-md-template.md:181`, `skills/_shared/decision-records.md:48`, `skills/tidy/SKILL.md:205`, `skills/_shared/auto-mode-contract.md:46` — incidental co-occurrence, no home claim
- `skills/flow/**` and `skills/_shared/record-queue-fetch.md` `depth-survey`/`creative-survey`/`backlog-fetch-limit` lines — Task 3's job

Any hit outside both lists is a site this task missed. Read it before deciding it is benign.

- [ ] **Step 5: Commit**

```bash
git add skills/wrap-up/unblocked-records.md skills/dispatch/settle-and-merge.md skills/dispatch/SKILL.md skills/assess-agent-autonomy/SKILL.md skills/flow/SKILL.md skills/flow/manifesto.md skills/_shared/unattended-tier.md
git diff --cached --name-only
git commit -m "Read every dual-homed policy key from policy.yml alone — refs #132"
```

---

## Task 3: The four CLAUDE.md-only levers get a policy.yml home

**Files:**
- Modify: `skills/_shared/policy-schema.md:5,88,92-95`
- Modify: `skills/flow/SKILL.md:51,52,181`
- Modify: `skills/flow/survey.md:12,18,48,63`
- Modify: `skills/_shared/record-queue-fetch.md:25,37`
- Modify: `skills/backlog/refine-mode.md:45`
- Modify: `skills/_shared/work-record-config.md` (the boundary statement)

**Interfaces:**
- Consumes: Task 2's single-read idiom, restated for `backlog-fetch-limit`.
- Produces: `_shared/policy-schema.md`'s claim that `policy.yml` is the only home, which Task 4's `/init` check and Task 5's CHANGELOG both rest on.

- [ ] **Step 1: Rewrite `_shared/policy-schema.md`'s two framing sentences**

Line 5 currently ends with a sentence saying most Additional levers have no `policy.yml` path. Replace the whole of line 5 with:

```markdown
`.claude-tweaks/policy.yml` is the canonical **and only** home for every lever below — no key in this table is read from CLAUDE.md. `worktree.always` is additionally enforced mechanically by `bin/lib/hooks/pre-tool-use.js`, which reads `policy.yml` directly. A recognized key still sitting in a project's CLAUDE.md no longer applies to anything; `auditPolicy()` reports it under `migratableKeys` and `/claude-tweaks:init --update`'s Config Home Drift check offers to move it.
```

Replace the whole of line 88 (the `## Additional levers` preamble) with:

```markdown
These levers resolve from `.claude-tweaks/policy.yml`, like every other lever in this file. `/claude-tweaks:init`'s CLAUDE.md template generates none of them — omitting a lever means its default. `backlog-fetch-limit` and `promise-register-min-leaves` also appear in `_shared/work-record-config.md`'s table — if the two disagree, that file wins for those two keys, per the same rule the "Dispatch & merge" section states.
```

- [ ] **Step 2: Rewrite the four table rows' Canonical home column**

In `skills/_shared/policy-schema.md`, rows 92-95. Change only the second column of each; leave every other column byte-identical.

| Key | New second column |
|---|---|
| `depth-survey` | `` `policy.yml` `` |
| `creative-survey` | `` `policy.yml` `` |
| `backlog-fetch-limit` | `` `policy.yml` `` |
| `promise-register-min-leaves` | `` `policy.yml` `` |

Then remove the now-false "Three exceptions" framing if any trace of it survives Step 1, and check rows 50-55 and 77-84 for the parenthetical `(CLAUDE.md also honored)` / `(CLAUDE.md legacy fallback)` phrases — every one of those must become plain `` `policy.yml` `` too, since Task 2 removed the fallback they describe. Affected rows, verified present today: `dispatch-retry-ceiling` (50), `automerge-max-lines` (52), `automerge-max-files` (53), `work-links` (55), `unattended-tier` (77), `scope-creep` (78), `tidy-aggressiveness` (84), and `auto-mode` (41, currently `` `policy.yml` or CLAUDE.md``).

For `unattended-tier`, keep the second half of its parenthetical — it names a different file as the concept's canonical home, which is still true: `` `policy.yml` (canonical home is `_shared/unattended-tier.md`) ``.

- [ ] **Step 3: Update the seven prose reads of `depth-survey` / `creative-survey`**

Every one is the same phrase in a different sentence. Change `in CLAUDE.md` to ``in `.claude-tweaks/policy.yml``` at:

- `skills/flow/SKILL.md:51` — ``with `depth-survey: off` in CLAUDE.md``
- `skills/flow/SKILL.md:52` — ``with `creative-survey: off` in CLAUDE.md``
- `skills/flow/SKILL.md:181` — ``(nor `creative-survey: off` in CLAUDE.md)``
- `skills/flow/survey.md:12` — ``(or `creative-survey: off` in CLAUDE.md)``
- `skills/flow/survey.md:18` — ``(nor `creative-survey: off` in CLAUDE.md)``
- `skills/flow/survey.md:48` — ``(or `depth-survey: off` in CLAUDE.md)``
- `skills/flow/survey.md:63` — ``or `depth-survey: off` in CLAUDE.md.``

Seven occurrences across two files — `flow/SKILL.md` carries three, `flow/survey.md` four.

- [ ] **Step 4: Update `backlog-fetch-limit`'s read instruction and its two warning strings**

`skills/_shared/record-queue-fetch.md:25` — replace ``read `backlog-fetch-limit` from the project's CLAUDE.md`` with ``read `backlog-fetch-limit` from the project's `.claude-tweaks/policy.yml```.

`skills/_shared/record-queue-fetch.md:37` — the warning string says "Consider raising backlog-fetch-limit in CLAUDE.md". Replace `in CLAUDE.md` with `in .claude-tweaks/policy.yml`. This string is inside a JS single-quoted literal inside a bash heredoc-style fenced block — do not introduce an apostrophe.

`skills/backlog/refine-mode.md:45` — the warning ends `See CLAUDE.md.`. Replace with `See .claude-tweaks/policy.yml.` Same quoting constraint.

- [ ] **Step 5: State the work-record-config boundary explicitly**

`_shared/work-record-config.md`'s table now spans two homes: `work-links`, `dispatch-retry-ceiling`, `automerge-max-lines`, `automerge-max-files`, `dispatch-pick-max-concurrent`, `merge-sensitive-paths`, `backlog-fetch-limit`, and `promise-register-min-leaves` resolve from `policy.yml`; `work-backend`, `work-types`, and `record-staleness-weeks` still resolve from CLAUDE.md. Unstated, that is exactly the silent inconsistency this plan exists to remove.

Insert this immediately after the table (after line 28's row, before the `**No aliases.**` paragraph):

```markdown
**Where these live.** Every key above that `_shared/policy-schema.md` also indexes resolves from
`.claude-tweaks/policy.yml`, the single home for project config. Three do not: `work-backend`,
`work-types`, and `record-staleness-weeks` are still read from CLAUDE.md, and are absent from
`policy-schema.js`'s `POLICY_KEYS` — so `auditPolicy()` cannot see them and `/claude-tweaks:init`'s
Config Home Drift check never offers to move them. This is deliberate, not an oversight: CLAUDE.md
is ambient in every session while `policy.yml` requires an explicit read, and `work-backend` gates
two "stop this turn completely" paths (`/claude-tweaks:dispatch` Preflight,
`/claude-tweaks:backlog refine`'s grant sub-stage) where a key that silently reads as absent would
stop real work. Moving them is tracked separately.
```

- [ ] **Step 6: Prove no lever still claims CLAUDE.md as its home**

The obvious alternation is not enough: `_shared/policy-schema.md`'s two framing sentences say "CLAUDE.md is their only current home" and "CLAUDE.md remains their only home," which no `only —`-style pattern matches. Both greps are required.

```bash
grep -rn "CLAUDE\.md only\|CLAUDE\.md also honored\|CLAUDE\.md legacy fallback\|or CLAUDE\.md\|only current home\|remains their only home\|their only home" --include="*.md" skills/
```

Expected: zero output.

```bash
grep -rn "survey: off\` in CLAUDE\|limit\` from the project's CLAUDE\|backlog-fetch-limit in CLAUDE" --include="*.md" skills/
```

Expected: zero output.

Then confirm the four rows actually changed, rather than trusting that they did:

```bash
grep -n "depth-survey\|creative-survey\|backlog-fetch-limit\|promise-register-min-leaves" skills/_shared/policy-schema.md
```

Expected: four table rows, each with `` `policy.yml` `` as its second column, plus the `backlog-fetch-limit`/`promise-register-min-leaves` mention in the rewritten line-88 paragraph.

- [ ] **Step 7: Run the suite and commit**

Run: `npm test > /tmp/plan-b-task-3.log 2>&1; echo "exit=$?"`
Then: `grep -E "^# (fail|pass)" /tmp/plan-b-task-3.log`
Expected: `exit=1`, `# fail 2` — and both failures are the two known-red changelog ones named in Global Constraints. `exit=1` is the correct result here, not a problem to solve. Any third failure is yours.

```bash
git add skills/_shared/policy-schema.md skills/_shared/work-record-config.md skills/_shared/record-queue-fetch.md skills/flow/SKILL.md skills/flow/survey.md skills/backlog/refine-mode.md
git diff --cached --name-only
git commit -m "Give every remaining lever a policy.yml home and state the work-record boundary — refs #132"
```

---

## Task 4: `/claude-tweaks:init` detects and offers to migrate

**Files:**
- Modify: `skills/init/update-mode.md:5-9` (sub-phases list), `:27-28` (policy.yml inventory), `:97-116` (`### Work-Record Backend Drift`, whose `work-links` handling Task 2 invalidated), and a new `### Config Home Drift` section before `### Maturity Drift` (line 117)

**Interfaces:**
- Consumes: `auditPolicy(repoRoot).migratableKeys` from Task 1 — `Array<{key, value, alsoInPolicy}>`.
- Produces: nothing later tasks read.

**Binding constraint — CLAUDE.md is never edited autonomously.** `skills/tidy/step-6-auto.md:27` states this rule and `skills/init/update-mode.md:105` cites it as the auto-mode contract's. The neighbouring `### Work-Record Backend Drift` section obeys it by making all three of its rows **staged offers**. The migration this task adds *deletes lines from CLAUDE.md*, so it is squarely covered: it is an offer the user accepts, never something `--defaults` or `auto` mode applies on its own. An implementer who makes this auto-apply has broken a contract, not taken a shortcut.

- [ ] **Step 1: Extend the Phase 1u policy.yml inventory**

`skills/init/update-mode.md:27-28` lists only `project.maturity`. Replace the `### policy.yml` block with:

```markdown
### policy.yml
- `project.maturity`: {value, or "not set" if the key is absent}
- Recognized keys present: {count}
- Recognized keys still in CLAUDE.md: {migratableKeys count from the Config Home Drift check below, or "none"}
```

- [ ] **Step 2: Add the sub-phase summary line**

`skills/init/update-mode.md:8` describes Phase 1u.5. Append to that bullet, after the existing text:

```markdown
; and detect policy keys still living in CLAUDE.md, which no longer apply, offering to move them
```

- [ ] **Step 2.5: Fix what Task 2 invalidated in Work-Record Backend Drift**

`skills/init/update-mode.md:97-116` treats `work-backend`, `work-types`, and `work-links` as one CLAUDE.md-resident group. After Task 2, `work-links` resolves from `.claude-tweaks/policy.yml` and the other two do not — so the section's first sentence and its first table row now describe a write to the wrong file.

In the opening paragraph, replace ``(`work-backend` / `work-types` / `work-links`)`` with:

```markdown
(`work-backend` and `work-types` in CLAUDE.md, `work-links` in `.claude-tweaks/policy.yml`)
```

In the first table row's Offer cell, replace ``offer to write the missing key(s)`` with:

```markdown
offer to write the missing key(s) — `work-types` into CLAUDE.md, `work-links` into `.claude-tweaks/policy.yml`
```

Leave the "staged offers / never a silent CLAUDE.md edit" sentence exactly as it is. It is the rule this task's own new section inherits.

- [ ] **Step 3: Write the Config Home Drift section**

Insert immediately before `### Maturity Drift`:

````markdown
### Config Home Drift

`.claude-tweaks/policy.yml` is the only file claude-tweaks reads for config keys
(`_shared/policy-schema.md`). A project configured before that consolidation may still carry
recognized keys in CLAUDE.md, where they no longer apply — the failure is silent, because a key
that is not read looks exactly like a key that was never set, and the lever's default takes over
with nothing objecting.

Detect by calling the same module `/claude-tweaks:harness-health` uses:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd()).migratableKeys))"
```

An empty array means nothing to do — omit this check from the Drift Report entirely rather than
reporting a clean result. Otherwise each entry carries `key`, its CLAUDE.md `value`, and
`alsoInPolicy`, which picks the remedy:

| `alsoInPolicy` | What happened | Recommended action |
|---|---|---|
| `false` | The key applies nowhere — the lever has been running on its default | **Move** — add `{key}: {value}` to `.claude-tweaks/policy.yml`, remove the CLAUDE.md line |
| `true` | `policy.yml` already carries this key and is what applies; the CLAUDE.md line is a dead duplicate that may state a *different* value | **Remove** — delete the CLAUDE.md line only, leaving `policy.yml` untouched |

Present a batch table (Key | CLAUDE.md value | policy.yml value or "not set" | Recommended action),
and for any `alsoInPolicy: true` row whose two values differ, say so in the row — that is a project
whose intended setting has not been in effect, and the user may want the CLAUDE.md value promoted
rather than dropped.

**Show the diff before asking.** Render the exact `policy.yml` additions and the exact CLAUDE.md
lines to be deleted, with their line numbers. CLAUDE.md is the file users hand-tune most, and the
detector matches key-shaped lines wherever they sit — including inside fenced code blocks, which is
deliberate, since that is how the legacy form was often written, but it also means a CLAUDE.md that
*documents* claude-tweaks levers can produce rows that must not be applied. The diff is what lets
the user see that before it happens.

Then call `AskUserQuestion`:

- `question`: `"{N} policy key(s) in CLAUDE.md no longer apply. Move them into policy.yml?"`,
  `header`: `"Config home"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Move {M} key(s)
  into .claude-tweaks/policy.yml and delete {N} line(s) from CLAUDE.md, exactly as shown in the
  diff above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-key what happens
  to each of the {N} entries"`
- Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave both files as-is — the keys in
  CLAUDE.md will continue to have no effect"`

On "Override specific items," the user's per-key corrections arrive as ordinary free-text in the
next message, per CLAUDE.md's Multi-item Decisions convention — not the tool's `Other` field.

**Applying.** This is a **staged offer, never an autonomous edit** — the same rule the
Work-Record Backend Drift section above states, and for the same reason: CLAUDE.md is never
edited without the user accepting the specific change. Under `--defaults`, or any invocation with
no interactive human, present the diff in the report and apply nothing. Remove **only**
exactly-matched whole lines from CLAUDE.md — never reflow a paragraph, never rewrite a heading,
never delete a surrounding fenced block even when removing its only line leaves it empty. Append
to `.claude-tweaks/policy.yml` in `{key}: {value}` form, creating the file if absent. On any
outcome except "Skip entirely," record the result in Phase 9's Actions Performed table as an
`Operational` row.
````

- [ ] **Step 4: Verify the section renders as intended**

Do not check this by reading the diff (`[IL-27]`). The block above contains a nested fenced code
block, so it is written with a four-backtick outer fence; confirm the inserted region parses by
rendering the file's fences:

Naive parity counting is wrong here — it would treat the nested three-backtick `bash` block as
closing the four-backtick outer fence and still report "balanced." Use the nesting-aware form,
which only lets a fence of at least the opener's width and no info string close a block:

```bash
node -e "
const t=require('fs').readFileSync('skills/init/update-mode.md','utf8').split('\n');
let open=null, blocks=0, bad=[];
t.forEach((l,i)=>{
  const m=l.match(/^(\s*)(\`{3,})(.*)$/);
  if(!m) return;
  const ticks=m[2].length, info=m[3].trim();
  if(open===null){ open={line:i+1,ticks}; return; }
  if(ticks>=open.ticks && info===''){ blocks++; open=null; }
});
if(open) bad.push('UNCLOSED fence opened at line '+open.line);
console.log(blocks+' blocks, '+(bad.length?bad.join('; '):'BALANCED'));
"
```

Expected: `BALANCED`, with the block count one higher than before the insertion — the nested
`bash` block does not count separately, because it is content inside the four-backtick block.

This exact script was run against this plan document while it was being written; it is the check
that would have caught Plan A's four broken fenced blocks, one of which silently swallowed 39 of
57 lines.

- [ ] **Step 5: Run the suite and commit**

Run: `npm test > /tmp/plan-b-task-4.log 2>&1; echo "exit=$?"`
Then: `grep -E "^# (fail|pass)" /tmp/plan-b-task-4.log`
Expected: `exit=1`, `# fail 2` — and both failures are the two known-red changelog ones named in Global Constraints. `exit=1` is the correct result here, not a problem to solve. Any third failure is yours.

```bash
git add skills/init/update-mode.md
git diff --cached --name-only
git commit -m "Offer to migrate CLAUDE.md policy keys during /init update — refs #132"
```

---

## Task 5: Graph edges, dogfood check, release

**Files:**
- Modify: `docs/skill-graph.md` (if `/claude-tweaks:init` → `_shared/policy-schema.md` is not already an edge)
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the shipped release.

- [ ] **Step 1: Add the graph edge if missing**

```bash
grep -n "policy-schema" docs/skill-graph.md
```

`/claude-tweaks:init`'s update mode now calls `bin/lib/policy-schema.js`, which it did not before. If `docs/skill-graph.md` records module-level edges of that kind, add it. If it records only skill-to-skill edges, add nothing — do not invent a new edge category.

- [ ] **Step 2: Dogfood — confirm this repo needs no migration**

```bash
node -e "const {auditPolicy}=require('./bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd()),null,2))"
```

Expected: `migratableKeys` is `[]`. This repo's CLAUDE.md carries `work-backend: github-issues`, which is deliberately **not** in `POLICY_KEYS` (Task 3 Step 5), so it must not appear. If anything else appears, migrate it here and commit that as part of this task — shipping a consolidation whose own repo fails it is not shippable.

If `unrecognizedKeys` or `invalidValues` are non-empty, that is a pre-existing problem in
`.claude-tweaks/policy.yml`; report it rather than silently fixing it.

- [ ] **Step 3: Claim a version number — check every source, in this order**

This is the step that collided twice during Plan A. `origin/main` moved three times mid-session. Do not skip a source, and do not reuse a number checked before a long-running command.

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
grep -rn "6\.4[0-9]\.[0-9]" docs/superpowers/plans/ || echo "no version literal in any plan"
git worktree list
```

For each worktree branch that is not this one: `git log --oneline main..<branch> -- .claude-plugin/plugin.json`.

Take the next free **minor** (this is a feature addition). At the time of writing, `origin/main` is `6.43.0` — it shipped `6.42.0` **and then** `6.43.0` during this plan's authoring, which is why the number below is a hypothesis and not a fact: `6.44.0`. The commands above are the answer.

`6.43.0` was already claimed by an unrelated release (`sed -i` worktree-gate coverage, `3bf55c68`) that this branch has merged. If a fourth session ships `6.44.0` while these tasks run, renumber rather than arguing — the number belongs to whatever ships first.

- [ ] **Step 4: Bump and write the CHANGELOG entry in one commit**

Edit `.claude-plugin/plugin.json`'s `version`. Add to `CHANGELOG.md`, directly under the `# Changelog` header, in exactly this heading shape — `bin/lib/changelog.js`'s parser requires the strict `X.Y.Z` and the em-dash, and `tests/changelog-coverage.test.js` fails the suite without it:

```markdown
## v{version} — policy.yml is the single home for project config

`.claude-tweaks/policy.yml` is now the only file claude-tweaks reads for config keys. Previously
eight levers were readable from either CLAUDE.md or `policy.yml`, four more were documented as
CLAUDE.md-only, and one — `merge-sensitive-paths` — was documented as `policy.yml`-only while the
skill that reads it grepped CLAUDE.md anyway.

- Every lever in `_shared/policy-schema.md` resolves from `.claude-tweaks/policy.yml`. The five
  remaining dual-read greps now name one file, and pick up the inline-comment strip the rest of the
  codebase already used.
- `depth-survey`, `creative-survey`, `backlog-fetch-limit`, and `promise-register-min-leaves` gain
  the `policy.yml` path they never had.
- `auditPolicy()` stops validating CLAUDE.md values and starts reporting recognized keys found
  there under a new `migratableKeys` field. A value in a file nobody reads cannot be wrong, only
  misplaced.
- `/claude-tweaks:init --update` gains a **Config Home Drift** check that shows a diff and offers
  to move those keys, removing only exactly-matched lines.
- `/claude-tweaks:harness-health`'s policy check reports migrations alongside unrecognized keys and
  invalid values.

**If your project sets levers in CLAUDE.md, run `/claude-tweaks:init --update`.** Those keys stop
applying in this release; the check finds them and offers the move. The work-record keys
`work-backend`, `work-types`, and `record-staleness-weeks` are unaffected and stay in CLAUDE.md —
`_shared/work-record-config.md` states why.
```

```bash
git add .claude-plugin/plugin.json CHANGELOG.md docs/skill-graph.md
git diff --cached --name-only
git commit -m "Release {version} — policy.yml as the single config home, refs #132"
```

- [ ] **Step 5: Full suite, then re-verify the version one last time**

Run: `npm test > /tmp/plan-b-final.log 2>&1; echo "exit=$?"`
Then: `grep -E "^# (fail|pass)" /tmp/plan-b-final.log`
Expected: `exit=1`, `# fail 2` — and both failures are the two known-red changelog ones named in Global Constraints. `exit=1` is the correct result here, not a problem to solve. Any third failure is yours.

The suite takes minutes, and a parallel session can ship inside that window — which is exactly what happened twice during Plan A. Re-run Step 3's first two commands now. If the number was taken, renumber the bump, the CHANGELOG heading, and re-commit before pushing.

- [ ] **Step 6: Push both repos**

CLAUDE.md's Releasing section authorizes both pushes as one action (`[IL-59]`) — do not stop between them.

```bash
git push origin HEAD:main
```

Then in `/Users/thomasholknielsen/Code Workspaces/claude-tweaks-marketplace`, edit
`.claude-plugin/marketplace.json`: set `plugins[].version` to the shipped version, bump
`metadata.version`'s minor (its own independent `2.x` scheme — currently `2.28.0`), verify the file
is still valid JSON, then commit and push `main`.

- [ ] **Step 7: File the deferred work-record-keys follow-up**

One record, so the boundary Task 3 Step 5 documented is tracked rather than merely explained:

> **Title:** Decide whether `work-backend` / `work-types` / `record-staleness-weeks` move to policy.yml
>
> **Body:** The v{version} consolidation made `.claude-tweaks/policy.yml` the only home for every lever `_shared/policy-schema.md` indexes. Three work-record config keys stayed in CLAUDE.md and are absent from `POLICY_KEYS`, so `auditPolicy()` cannot see them — the reasoning is in `_shared/work-record-config.md`'s "Where these live" paragraph. The open question is whether ambient availability in CLAUDE.md is worth one config namespace remaining split, given `work-backend` gates two hard stops. Roughly ten read sites name CLAUDE.md as its home; the other ~158 references are conditional prose that does not care where the key lives.

---

## Verification summary

| Claim | How it is checked | Where |
|---|---|---|
| CLAUDE.md keys are flagged, not validated | Unit tests over `auditPolicy()` | Task 1 Steps 1-5 |
| `invalidValues` carries no dead `source` field | Explicit key-set assertion | Task 1 Step 1 |
| The producer's one consumer was updated | Same task as the producer | Task 1 Step 6 |
| Each rewritten grep actually returns the value | Executed against a fixture | Task 2 Step 2 |
| No dual-read site survives | Repo-wide grep with an enumerated survivor list | Task 2 Step 4 |
| No lever still claims CLAUDE.md as home | Repo-wide grep expecting zero | Task 3 Step 6 |
| The new `/init` section renders correctly | Fence-balance parse, not diff reading | Task 4 Step 4 |
| This repo passes its own consolidation | `auditPolicy()` against the repo root | Task 5 Step 2 |
| The version is free at push time | Re-checked after the suite, not before | Task 5 Step 5 |

**Deliberately unverified:** whether each consumer's prose correctly *uses* the value it now reads from `policy.yml`. Nothing executes skill prose, so this rests on task review. The same limit applied to Plan A and is stated in the design doc.
