# Fix Full-Plugin Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 147 verified findings from the max-effort full-plugin code review (2026-07-20), across `bin/` runtime JS, all test suites, and all 33 `skills/` directories, without regressing the existing 1282-test baseline.

**Architecture:** Findings are pre-diagnosed and empirically verified (each has a `summary` + concrete `failure_scenario`) -- no design work is needed, only precise fixes. Work is organized into 5 sequential waves ordered by risk/value (runtime correctness first, then test-quality, then doc correctness/consistency, then runtime quality cleanup, then doc quality cleanup), each wave split into file-disjoint batches (tasks) that can be dispatched in parallel within the wave. Waves run sequentially -- each wave is committed and tested before the next starts, since a few files recur across waves (a correctness fix and a separate quality fix to the same file, assigned to different waves to keep each task's diff reviewable).

**Tech Stack:** Node 18+ (`node --test`), markdown skill files (no build step).

## Global Constraints

- Work happens in the worktree at `.claude/worktrees/fix-review-findings` on branch `worktree-fix-review-findings` -- already created and verified (baseline: 1282/1282 tests passing before this plan started).
- Full finding detail (category, line, summary, failure_scenario) for every file is in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` at the repo root, keyed by file path -- read the entries for your assigned files from there; the task blocks below give the summary only for orientation.
- Every task's scope is EXACTLY the findings listed for it. Do not fix findings assigned to a different task/wave even if you notice them in the same file -- they are handled by a separate task to keep diffs reviewable and avoid merge overlap.
- Do not scope-creep: no refactors, renames, or "while I am here" cleanups beyond what a finding's summary/failure_scenario describes.
- Fix behavior, not just symptoms: read the enclosing function, understand why the bug occurs, and fix the root cause (e.g. add the missing null-guard using the same pattern as the sibling helper the finding names, not a local special-case).
- Where a finding is itself about a test (fake assertion, coverage gap, setup/teardown asymmetry), fix the test so it actually exercises the behavior it claims to -- do not just delete or weaken the assertion.
- Where a finding is about production code with no existing regression test for that exact bug, add one alongside the fix if the file already has a test suite (most bin/lib/**/*.js files do -- check for a sibling tests/ directory).
- After each task's edits: run the relevant test file(s) with `node --test <path>`, or the full suite with `npm test` if the change could have wider blast radius (e.g. a shared health-core module). All tests must stay green -- 0 new failures.
- Commit each task separately with message `Fix review finding(s): <short description>` (imperative, no conventional-commit prefix, per this repo's CLAUDE.md commit-message convention). Use `refs #<n>` only if a work-record number applies -- none does here, this is direct review remediation, so omit issue references.
- Anchor every git/test command to the worktree: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings" && pwd && git rev-parse --show-toplevel` before editing or committing, to guard against wrong-checkout commits.

---

## Wave 1 -- bin/ runtime correctness bugs

### Task 1: .claude-plugin/plugin.json, bin/claude-tweaks-statusline.js, +4 more

**Files:**
- Modify: `.claude-plugin/plugin.json` (1 finding)
- Modify: `bin/claude-tweaks-statusline.js` (1 finding)
- Modify: `bin/code-health.js` (2 findings)
- Modify: `bin/docs-health.js` (1 finding)
- Modify: `bin/harness-health.js` (1 finding)
- Modify: `bin/hooks.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`.claude-plugin/plugin.json`:
- **[cross-file]** .claude-plugin/plugin.json:4 -- plugin.json declares version 6.11.1 while the project's own CLAUDE.md still describes the plugin as 'v5.7.0' in its opening line, a stale cross-file version reference.

`bin/claude-tweaks-statusline.js`:
- **[language-pitfall]** bin/claude-tweaks-statusline.js:14 -- readStdin()'s 50ms timeout resolves the read without ever detaching stdin's data/end/error listeners or pausing/destroying the stream, so if the harness doesn't close the write end of piped stdin promptly, the statusline process writes its output correctly but then never exits.

`bin/code-health.js`:
- **[cross-file]** bin/code-health.js:89 -- cmdStatus (lines 89 and 91) and cmdChurnReport (line 115) read `args.root` bare, without the `args.root || process.cwd()` fallback every other command in this file and all three sibling health CLIs use, so a malformed --root (e.g. a trailing flag with no value, which parseArgs turns into `undefined`) silently makes both commands report empty state instead of erroring or falling back to cwd.
- **[language-pitfall]** bin/code-health.js:199 -- The --min-risk (line 199) and --min-severity (line 152) validation guards use `!(value in RISK_RANK)` against the plain object literal `{ high: 0, medium: 1, low: 2 }`, so any Object.prototype property name (constructor, toString, hasOwnProperty, ...) passes validation as if it were a real risk tier.

`bin/docs-health.js`:
- **[line-by-line]** bin/docs-health.js:254 -- cmdFindRefs checks `fs.existsSync(targetPath)` using the raw, unresolved targetPath instead of resolving it against `root` the way the very next line's `deriveDocId(targetPath, root)` correctly does; cmdCheckFreshness (line 272, `fs.readFileSync(targetPath, 'utf8')`) has the identical defect.

`bin/harness-health.js`:
- **[cross-file]** bin/harness-health.js:144 -- cmdValidateFindings in harness-health.js, docs-health.js, and journey-health.js has no hard-gate requiring --target (or --slice) on a non-dry-run invocation, unlike code-health.js which explicitly exits with an error in this situation.

`bin/hooks.js`:
- **[removed-behavior]** bin/hooks.js:45 -- record-worktree's if/else-if chain has no branch for "a run dir was resolved but no worktree argument was given," and close-run's analogous chain (line 78) has no branch for "no run dir could be resolved and --run wasn't invalid" — both cases print nothing and exit 0, indistinguishable from success.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add ".claude-plugin/plugin.json" "bin/claude-tweaks-statusline.js" "bin/code-health.js" "bin/docs-health.js" "bin/harness-health.js" "bin/hooks.js"
git commit -m "Fix review finding(s): .claude-plugin/plugin.json, bin/claude-tweaks-statusline.js, bin/code-health.js..."
```

### Task 2: bin/journey-health.js, bin/lib/code-health/scope.js, +4 more

**Files:**
- Modify: `bin/journey-health.js` (1 finding)
- Modify: `bin/lib/code-health/scope.js` (1 finding)
- Modify: `bin/lib/coordination.js` (1 finding)
- Modify: `bin/lib/docs-health/findability.js` (1 finding)
- Modify: `bin/lib/hooks/post-tool-use.js` (1 finding)
- Modify: `bin/lib/hooks/pre-tool-use.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/journey-health.js`:
- **[cross-file]** bin/journey-health.js:82 -- cmdNextTarget calls readDurableState(root) twice per invocation (lines 71 and 82) instead of once, and no test in bin/lib/journey-health/tests/cli-next-target.test.js catches it — unlike its harness-health sibling, which was fixed for this exact bug and has a regression test for it.

`bin/lib/code-health/scope.js`:
- **[line-by-line]** bin/lib/code-health/scope.js:45 -- sourceFiles()'s SKIP_DIRS exclusion pattern `${absDir}/${dir}/*` only matches a skip-directory when it is a direct child of the scanned slice root, not when it appears deeper in the subtree, so nested node_modules/dist/build/coverage directories are hashed and counted as source.

`bin/lib/coordination.js`:
- **[line-by-line]** bin/lib/coordination.js:81 -- normalizeFinding's early return when a combined path:line string fails to parse leaves findingsMatch's path/severity comparison to operate on the original (still path-less, line-less) finding, reopening the exact spurious-match hole the function's own header comment claims it closes.

`bin/lib/docs-health/findability.js`:
- **[line-by-line]** bin/lib/docs-health/findability.js:45 -- computeInboundReferences matches an inbound reference by a bare-filename substring check (content.includes(basename)) instead of a path-qualified match, so two docs sharing a filename in different directories produce false-positive reference counts.

`bin/lib/hooks/post-tool-use.js`:
- **[line-by-line]** bin/lib/hooks/post-tool-use.js:94 -- checkClosingKeyword's fixed 20-character lookback window can slice off part of a longer word immediately before a bare issue ref, and JS regex's \b treats the resulting slice's start as a boundary even though none exists in the real message — so a word that merely ends in a closing-keyword suffix can be misread as a genuine closing keyword and suppress the warning.

`bin/lib/hooks/pre-tool-use.js`:
- **[removed-behavior]** bin/lib/hooks/pre-tool-use.js:66 -- checkWorktreeRequired's Bash-command target detection only recognizes 'git commit' (gitTargets(...).find(t => t.action === 'commit')), never 'git push', so the worktree.always policy gate silently allows a bare push from a non-isolated checkout even though the very deny message it emits (lines 100-105) and CLAUDE.md's Hooks section both state the policy covers 'git commit/push'.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/journey-health.js" "bin/lib/code-health/scope.js" "bin/lib/coordination.js" "bin/lib/docs-health/findability.js" "bin/lib/hooks/post-tool-use.js" "bin/lib/hooks/pre-tool-use.js"
git commit -m "Fix review finding(s): bin/journey-health.js, bin/lib/code-health/scope.js, bin/lib/coordination.js..."
```

### Task 3: bin/lib/issues/record.js, bin/lib/issues/retry.js, +3 more

**Files:**
- Modify: `bin/lib/issues/record.js` (1 finding)
- Modify: `bin/lib/issues/retry.js` (1 finding)
- Modify: `bin/lib/issues/unattended-tier.js` (1 finding)
- Modify: `bin/lib/journey-health/qa-evidence.js` (1 finding)
- Modify: `bin/lib/routine-template-parser.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/issues/record.js`:
- **[line-by-line]** bin/lib/issues/record.js:127 -- normalizeLabelNames's `l.name` branch has no null-guard, unlike the two near-identical sibling label-normalization helpers in the same module family (grouping.js's labelNames uses `l && l.name`; metrics.js's labelName uses `(label && label.name) || ''`).

`bin/lib/issues/retry.js`:
- **[cross-file]** bin/lib/issues/retry.js:22 -- hasHitRetryCeiling(comments, ceiling) counts only already-posted failure comments, so it is off by one relative to what its name promises for the attempt about to run; the repo's only live caller (skills/dispatch/SKILL.md) already knows this and inlines `attemptNumber >= ceiling` instead of calling it, but the caveat is never written into retry.js itself.

`bin/lib/issues/unattended-tier.js`:
- **[line-by-line]** bin/lib/issues/unattended-tier.js:23 -- The scope-expansion pattern /breaks? (more than )?\d+ unrelated tests/i matches any digit count, not just the '>10 unrelated tests' threshold that ledger/resolve-gate.md's Phase 1 (the spec this module's own docstring says it encodes 1:1) actually requires before a fix may legitimately be skipped.

`bin/lib/journey-health/qa-evidence.js`:
- **[cross-file]** bin/lib/journey-health/qa-evidence.js:51 -- findingsByStoryId is built as a Map keyed by story_id, so when a story has more than one entry in report.findings[] only the last one survives, silently discarding the rest before the regression check runs.

`bin/lib/routine-template-parser.js`:
- **[removed-behavior]** bin/lib/routine-template-parser.js:65 -- In parseRoutineTemplate's nested-map branch, `sawNested` is set to true for any non-blank indented line regardless of whether it actually matches the `key: value` shape the loop parses, so a YAML block list (`- item`) nested under a top-level key silently resolves to an empty object {} instead of an array or a visible parse failure.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/issues/record.js" "bin/lib/issues/retry.js" "bin/lib/issues/unattended-tier.js" "bin/lib/journey-health/qa-evidence.js" "bin/lib/routine-template-parser.js"
git commit -m "Fix review finding(s): bin/lib/issues/record.js, bin/lib/issues/retry.js, bin/lib/issues/unattended-tier.js..."
```

---

## Wave 2 -- test-quality defects (fake/weak assertions, coverage gaps)

### Task 4: bin/lib/code-health/tests/cli-validate-findings.test.js, bin/lib/code-health/tests/durable-integration.test.js, +4 more

**Files:**
- Modify: `bin/lib/code-health/tests/cli-validate-findings.test.js` (1 finding)
- Modify: `bin/lib/code-health/tests/durable-integration.test.js` (1 finding)
- Modify: `bin/lib/code-health/tests/fingerprint.test.js` (1 finding)
- Modify: `bin/lib/code-health/tests/scope.test.js` (1 finding)
- Modify: `bin/lib/code-health/tests/skill-md.test.js` (1 finding)
- Modify: `bin/lib/code-health/tests/status-v2.test.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/code-health/tests/cli-validate-findings.test.js`:
- **[altitude]** bin/lib/code-health/tests/cli-validate-findings.test.js:225 -- applyConfidenceFloor and deriveDocId are pure business-logic functions defined inside their skill's CLI entrypoint script (bin/code-health.js, bin/docs-health.js) rather than in the bin/lib/{skill}/ module directory where every sibling pure function lives, forcing their tests to reach outside lib/ to import them.

`bin/lib/code-health/tests/durable-integration.test.js`:
- **[cross-file]** bin/lib/code-health/tests/durable-integration.test.js:17 -- This file only exercises `retry-queue drain` end-to-end through the real code-health.js CLI; unlike its docs-health sibling (bin/lib/docs-health/tests/durable-integration.test.js, which also tests `retry-queue update <results.json>`), there is no equivalent CLI-level test here for `retry-queue update`, so bin/code-health.js's own main() dispatch line `retryQueueCommands.update({ ...args, _: args._.slice(1) })` is never exercised through the real argv parser.

`bin/lib/code-health/tests/fingerprint.test.js`:
- **[simplification]** bin/lib/code-health/tests/fingerprint.test.js:61 -- Five v2 tests in fingerprint.test.js locally re-require `{ fingerprint }` from '../fingerprint' even though it is already destructured once at module scope on line 3.

`bin/lib/code-health/tests/scope.test.js`:
- **[cross-file]** bin/lib/code-health/tests/scope.test.js:8 -- MAX_STALE_DAYS is hardcoded to 30 locally with a comment saying it "mirrors score.js constant" instead of being imported from ../score, unlike the equivalent docs-health test file (bin/lib/docs-health/tests/scope.test.js, which imports the real STALE_DAYS value directly via `const { STALE_DAYS } = require('../score');`).

`bin/lib/code-health/tests/skill-md.test.js`:
- **[removed-behavior]** bin/lib/code-health/tests/skill-md.test.js:38 -- The house-section-ordering test's idx() helper uses body.indexOf(), which resolves '## Next Actions' to the first of three occurrences of that substring — a mention inside the boilerplate '> **Interaction style:**' directive near the top of the file — not the real '## Next Actions' section heading, so the ordering assertions never actually check the real heading's position.

`bin/lib/code-health/tests/status-v2.test.js`:
- **[reuse]** bin/lib/code-health/tests/status-v2.test.js:31 -- seedDurableCursors, seedDurableRuns, and seedDurableRemembered are the same ~15-line git-fixture-seeding helper copy-pasted three times across code-health/tests, differing only in the JSON filename written.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/code-health/tests/cli-validate-findings.test.js" "bin/lib/code-health/tests/durable-integration.test.js" "bin/lib/code-health/tests/fingerprint.test.js" "bin/lib/code-health/tests/scope.test.js" "bin/lib/code-health/tests/skill-md.test.js" "bin/lib/code-health/tests/status-v2.test.js"
git commit -m "Fix review finding(s): bin/lib/code-health/tests/cli-validate-findings.test.js, bin/lib/code-health/tests/durable-integration.test.js, bin/lib/code-health/tests/fingerprint.test.js..."
```

### Task 5: bin/lib/docs-health/tests/skill-md.test.js, bin/lib/harness-health/tests/cli-next-target.test.js, +4 more

**Files:**
- Modify: `bin/lib/docs-health/tests/skill-md.test.js` (2 findings)
- Modify: `bin/lib/harness-health/tests/cli-next-target.test.js` (1 finding)
- Modify: `bin/lib/harness-health/tests/dedup.test.js` (1 finding)
- Modify: `bin/lib/harness-health/tests/scope.test.js` (1 finding)
- Modify: `bin/lib/health-core/tests/durable-state.test.js` (1 finding)
- Modify: `bin/lib/health-core/tests/retry-cli.test.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/docs-health/tests/skill-md.test.js`:
- **[cross-file]** bin/lib/docs-health/tests/skill-md.test.js:41 -- The house-section-ordering test's idx() helper resolves '## Next Actions' to its first occurrence — the boilerplate '> **Interaction style:**' directive's backticked mention near line 5 — not the real '## Next Actions' heading further down, so the ordering assertions never actually check the real heading's position; this identical bug (already flagged for bin/lib/code-health/tests/skill-md.test.js) independently recurs, unflagged, in this file and in bin/lib/harness-health/tests/skill-md.test.js:42 and bin/lib/journey-health/tests/skill-md.test.js:42.
- **[reuse]** bin/lib/docs-health/tests/skill-md.test.js:33 -- docs-health/tests/skill-md.test.js duplicates the majority of code-health/tests/skill-md.test.js's assertion bodies verbatim instead of sharing one parameterized SKILL.md house-structure checker.

`bin/lib/harness-health/tests/cli-next-target.test.js`:
- **[simplification]** bin/lib/harness-health/tests/cli-next-target.test.js:26 -- The bare-git-repo health-state-branch seeding helper (seedDurableCursors/seedDurableRuns) is hand-duplicated in 3 files within this scope, each one's own comment naming the others as precedent instead of the group extracting a shared helper.

`bin/lib/harness-health/tests/dedup.test.js`:
- **[reuse]** bin/lib/harness-health/tests/dedup.test.js:3 -- dedup.test.js in both harness-health and journey-health fully re-tests decide(), which their local dedup.js files define as nothing but `module.exports = require('../health-core/dedup')` — already covered (with a superset of cases) by bin/lib/health-core/tests/dedup.test.js.

`bin/lib/harness-health/tests/scope.test.js`:
- **[simplification]** bin/lib/harness-health/tests/scope.test.js:15 -- 13 near-identical tmp() helpers across harness-health/tests and journey-health/tests mkdtempSync a fresh directory per test with no cleanup, while the sibling bin/lib/issues/tests/local-store.test.js's own tmp(t) registers t.after() cleanup — an unexplained divergence in an otherwise copy-pasted one-liner.

`bin/lib/health-core/tests/durable-state.test.js`:
- **[simplification]** bin/lib/health-core/tests/durable-state.test.js:218 -- Six writeState tests each re-declare the same ~7-rule fakeRunner matcher script almost verbatim, varying only the final ref-update rule's behavior.

`bin/lib/health-core/tests/retry-cli.test.js`:
- **[wrapper-proxy]** bin/lib/health-core/tests/retry-cli.test.js:95 -- The only test exercising the ok:true (success) branch of retry-queue update ('fresh') uses a fingerprint that was never present in the initial retryQueue, so it never actually proves dequeueRetry removes a real queued entry on success — every other test in the file only ever supplies ok:false results.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/docs-health/tests/skill-md.test.js" "bin/lib/harness-health/tests/cli-next-target.test.js" "bin/lib/harness-health/tests/dedup.test.js" "bin/lib/harness-health/tests/scope.test.js" "bin/lib/health-core/tests/durable-state.test.js" "bin/lib/health-core/tests/retry-cli.test.js"
git commit -m "Fix review finding(s): bin/lib/docs-health/tests/skill-md.test.js, bin/lib/harness-health/tests/cli-next-target.test.js, bin/lib/harness-health/tests/dedup.test.js..."
```

### Task 6: bin/lib/issues/tests/claims.test.js, bin/lib/issues/tests/labels.test.js, +3 more

**Files:**
- Modify: `bin/lib/issues/tests/claims.test.js` (1 finding)
- Modify: `bin/lib/issues/tests/labels.test.js` (2 findings)
- Modify: `tests/hooks-dispatcher.test.js` (1 finding)
- Modify: `tests/hooks-pre-tool-use.test.js` (2 findings)
- Modify: `tests/hooks-session-start.test.js` (2 findings)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/issues/tests/claims.test.js`:
- **[removed-behavior]** bin/lib/issues/tests/claims.test.js:70 -- The '[1,2]' and '"just a string"' entries in parseClaimMarker's 'never throws and returns null on garbage' test never reach claims.js's Array.isArray(fields)/typeof-object rejection guard, since CLAIM_RE requires a literal '{' immediately after the marker prefix and rejects both inputs by regex mismatch alone.

`bin/lib/issues/tests/labels.test.js`:
- **[cross-file]** bin/lib/issues/tests/labels.test.js:38 -- REAL_LABEL_DESCRIPTIONS still cap-checks six retired code-health:risk-*/code-health:effort-* label names that no code anywhere in the repo emits anymore, while the live risk:*/effort:*/by:* labels that replaced them carry zero 100-char-cap regression coverage.
- **[reuse]** bin/lib/issues/tests/labels.test.js:48 -- REAL_LABEL_DESCRIPTIONS hand-copies 7 of its 18 entries verbatim from skills/_shared/label-bootstrap.md's own canonical LABELS_JSON instead of reading that file, so the two can silently drift apart.

`tests/hooks-dispatcher.test.js`:
- **[reuse]** tests/hooks-dispatcher.test.js:54 -- The file hand-rolls `JSON.parse(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'))` ten separate times (lines 54, 58, 84, 89, 92, 102, 147, 155, 158, 166) instead of importing `readRunState(runDir)`, which `bin/lib/hooks/context.js` already exports for exactly this read.

`tests/hooks-pre-tool-use.test.js`:
- **[setup-teardown-asymmetry]** tests/hooks-pre-tool-use.test.js:207 -- The CLAUDE_PLUGIN_ROOT test unconditionally deletes the real environment variable without capturing or restoring any pre-existing value, unlike the careful save/restore pattern this same suite uses for NO_COLOR elsewhere.
- **[simplification]** tests/hooks-pre-tool-use.test.js:57 -- Line 57 duplicates the exact regex-escaping expression already extracted as the `esc()` helper at line 41, instead of calling `esc(wt)` like every later test in the file does.

`tests/hooks-session-start.test.js`:
- **[line-by-line]** tests/hooks-session-start.test.js:48 -- The 'close-run hint substitutes CLAUDE_PLUGIN_ROOT' test unconditionally deletes process.env.CLAUDE_PLUGIN_ROOT (line 48) without capturing/restoring any pre-existing value first, the same unsafe shape as tests/hooks-pre-tool-use.test.js's separate, already-known instance of this bug — this is an independent second occurrence in a different file, not the same defect location.
- **[test-coverage-gap]** tests/hooks-session-start.test.js:30 -- The test titled "capped at 3, newest first" only ever creates 2 non-clean run directories, so the MAX_REPORTED=3 truncation logic named in its own title is never exercised.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/issues/tests/claims.test.js" "bin/lib/issues/tests/labels.test.js" "tests/hooks-dispatcher.test.js" "tests/hooks-pre-tool-use.test.js" "tests/hooks-session-start.test.js"
git commit -m "Fix review finding(s): bin/lib/issues/tests/claims.test.js, bin/lib/issues/tests/labels.test.js, tests/hooks-dispatcher.test.js..."
```

### Task 7: tests/hooks-worktree-detect.test.js, tests/multi-agent-coordination.test.js, +1 more

**Files:**
- Modify: `tests/hooks-worktree-detect.test.js` (1 finding)
- Modify: `tests/multi-agent-coordination.test.js` (2 findings)
- Modify: `tests/statusline.test.js` (3 findings)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`tests/hooks-worktree-detect.test.js`:
- **[simplification]** tests/hooks-worktree-detect.test.js:17 -- `linkedWorktreeOf()` here (lines 17-22) is byte-for-byte identical to `linkedWorktreeOf()` in tests/hooks-pre-tool-use.test.js (lines 228-233), differing only in the mkdtemp prefix string, and the same copy-paste pattern recurs for `gitRepo()`/`withPolicy()`/`tmpProject()` across tests/hooks-dispatcher.test.js, tests/hooks-session-start.test.js, and tests/policy.test.js — no shared tests/ fixture module exists.

`tests/multi-agent-coordination.test.js`:
- **[assertions-cannot-fail]** tests/multi-agent-coordination.test.js:58 -- Multiple tests hand-construct the exact decision-log-entry string they then assert against with a self-authored regex, without ever calling a coordination.js (or any other) function that actually produces that string, so the assertion can never fail regardless of real behavior.
- **[simplification]** tests/multi-agent-coordination.test.js:515 -- A second, independently-written local `applyRedTeamFindings` function (lines 515-523) duplicates the first one (lines 457-478), even though its only call site (line 524, `applyRedTeamFindings(draftSpec, [])`) exercises exactly the empty-findings path the first definition already handles correctly.

`tests/statusline.test.js`:
- **[efficiency]** tests/statusline.test.js:15 -- `runStatusline()` creates a fresh temp HOME directory via `fs.mkdtempSync` on every call (line 15) but never removes it, unlike the file's other three fixture helpers (`withLedgers`, `withSpecs`, and the `renderGit` test's `repoDir`), which all clean up in a `finally` block.
- **[setup-teardown-asymmetry]** tests/statusline.test.js:15 -- The runStatusline() helper creates a fresh temp HOME directory via fs.mkdtempSync on every call and never removes it, unlike every other temp-directory helper in the same file.
- **[simplification]** tests/statusline.test.js:213 -- `withLedgers` (213-225) and `withSpecs` (287-299) are structurally identical temp-directory fixture scaffolding — mkdtemp, mkdir a fixture subdir, write files, run `fn(cwd)`, clean up in `finally` — differing only in the mkdtemp prefix and the `docs/plans` vs `specs` subpath.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "tests/hooks-worktree-detect.test.js" "tests/multi-agent-coordination.test.js" "tests/statusline.test.js"
git commit -m "Fix review finding(s): tests/hooks-worktree-detect.test.js, tests/multi-agent-coordination.test.js, tests/statusline.test.js"
```

---

## Wave 3 -- skills/ markdown correctness & cross-file consistency

### Task 8: CLAUDE.md, agents/qa-agent.md, +1 more

**Files:**
- Modify: `CLAUDE.md` (2 findings)
- Modify: `agents/qa-agent.md` (5 findings)
- Modify: `skills/_shared/auto-mode-contract.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`CLAUDE.md`:
- **[cross-file-promise]** CLAUDE.md:5 -- CLAUDE.md's own opening line states the plugin is "v5.7.0" while the actual version in `.claude-plugin/plugin.json` (the documented single source of truth per the Versioning section) is 6.11.1.
- **[cross-file-promise]** CLAUDE.md:23 -- CLAUDE.md's Dependencies line lists label-bootstrap.md's consumers as "capture/specify/triage/dispatch/tidy/wrap-up/init/code-health/harness-health/journey-health/docs-health/flow," omitting /demo and /review-backlog, both of which genuinely bootstrap labels through `_shared/label-bootstrap.md` (demo's `demo:changes-requested` check-then-create loop at demo/SKILL.md:155; review-backlog's `priority:*` bootstrap with its own explicit Relationship-table row citing the file as canonical at review-backlog/SKILL.md:274).

`agents/qa-agent.md`:
- **[language-pitfall]** agents/qa-agent.md:113 -- Story-supplied locator/value strings (name, text, value) are interpolated directly inside double-quoted agent-browser shell invocations with no escaping guidance.
- **[line-by-line]** agents/qa-agent.md:225 -- The Legacy Format workflow closes the agent-browser session twice on a failing step — once inside the FAIL branch and again in the unconditional step that follows it.
- **[line-by-line]** agents/qa-agent.md:181 -- The Fill-steps instruction specifies a locator-field priority order (testid > label > placeholder > role+name) that presumes multiple locator strategies can be present on one step, but Section 4 Step 1's locator mapping (and the story schema seen in skills/stories/story-examples.md) only ever populates a single-key locator object, leaving the priority rule with no defined algorithm to apply it against.
- **[removed-behavior]** agents/qa-agent.md:185 -- Teardown (Section 5) and Failure Handling (Section 6) give contradictory instructions for what happens after a step fails: Section 4 says failure triggers Section 6's trace-then-close immediately, but Section 5 says Teardown 'runs regardless of pass/fail status' after the step loop.
- **[removed-behavior]** agents/qa-agent.md:193 -- The failure trace is written to `{TRACES_BASE}/<story-id>/<timestamp>.zip` with no step anywhere creating that per-story subdirectory first, unlike the screenshot directory which Setup explicitly `mkdir -p`s.

`skills/_shared/auto-mode-contract.md`:
- **[cross-file]** skills/_shared/auto-mode-contract.md:29 -- The Bookend Architecture's "Begin stop" policy-lever list omits `ceremony-profile` (lever #10), even though this same file's own "Adding a new policy lever" checklist later in the file names it as an already-added lever and instructs updating this exact list.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "CLAUDE.md" "agents/qa-agent.md" "skills/_shared/auto-mode-contract.md"
git commit -m "Fix review finding(s): CLAUDE.md, agents/qa-agent.md, skills/_shared/auto-mode-contract.md"
```

### Task 9: skills/_shared/decision-records.md, skills/_shared/design-wrapper-handling.md, +4 more

**Files:**
- Modify: `skills/_shared/decision-records.md` (1 finding)
- Modify: `skills/_shared/design-wrapper-handling.md` (1 finding)
- Modify: `skills/_shared/subagent-output-contract.md` (1 finding)
- Modify: `skills/_shared/work-record.md` (1 finding)
- Modify: `skills/assess-agent-autonomy/SKILL.md` (1 finding)
- Modify: `skills/capture/SKILL.md` (3 findings)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/_shared/decision-records.md`:
- **[factual-claim]** skills/_shared/decision-records.md:3 -- Claims `/claude-tweaks:init` Phase 8.5 creates the `docs/decisions/` folder taxonomy, but Phase 8.5's actual documented procedure only ever creates `docs/REGISTRY.md` and backlogs a pointer to a missing doc rather than creating the doc or folder itself.

`skills/_shared/design-wrapper-handling.md`:
- **[cross-file]** skills/_shared/design-wrapper-handling.md:14 -- Asserts survey mode returns a `{deferred: {reason: ...}}` shape ("currently: only `survey` mode is ever deferred"), but `design-wrapper/modes/survey.md`'s own complete "Output to caller" contract never documents or returns any `deferred` shape anywhere.

`skills/_shared/subagent-output-contract.md`:
- **[cross-file]** skills/_shared/subagent-output-contract.md:106 -- The canonical "Used by" list for Template A (a markdown-table findings format) claims /challenge's per-lens proposers use Template A, but challenge/SKILL.md's actual dispatch template (Process Step 3) specifies a completely different output shape — "free-form 2-4 paragraphs," no severity/path/line/finding/evidence table, no "No findings." sentinel.

`skills/_shared/work-record.md`:
- **[cross-file-promise]** skills/_shared/work-record.md:261 -- CLAUDE.md's Backlog-integration note points to "work-record.md's Config keys table" as documenting that every consumer skill reads the legacy `backlog-backend` flag as a read-only alias of `work-backend`, but that table never mentions `backlog-backend` and instead states "per-skill aliases and env-var renames are forbidden"; in practice only capture, challenge, and tidy implement the alias fallback — dispatch, triage, demo, specify, flow, wrap-up, review, ledger, and review-backlog all read `work-backend` directly with no alias mention.

`skills/assess-agent-autonomy/SKILL.md`:
- **[factual-claim]** skills/assess-agent-autonomy/SKILL.md:39 -- The Input section states `#{n}` is "used to fetch the record body for `grant-check`/`ceremony-check`" and "used for reference/logging in `merge-check`/`failure-check`'s rendered output" — but this grouping is backwards for two of the four modes: `ceremony-check`'s own Step 1 (lines ~265-268) explicitly says "no fetch at all" for its primary call path (reuses data already held by the caller), while `failure-check`'s own Step 1 (line 211) runs a genuine `gh api ".../issues/${N}/comments..."` fetch keyed on `${N}`, not mere reference/logging.

`skills/capture/SKILL.md`:
- **[cross-file]** skills/capture/SKILL.md:111 -- capture/SKILL.md (and specify/SKILL.md's parent/leaf creation) instruct creating brand-new local-files records via allocateId() + writeRecord(), the exact pattern bin/lib/issues/local-store.js's own header comments say is 'NOT safe for concurrent record creation' and that the newer createRecord() (added in commit bc82643, 'Fix cross-slug issue id collision race in local-store.js') exists specifically to replace for callers creating brand-new records.
- **[line-by-line]** skills/capture/SKILL.md:272 -- The Relationship-to-Other-Skills table claims /claude-tweaks:visual-review files UI ideas as new backlog records "via /capture," directly contradicting this same file's Component-Skill Contract section (line 238), which explicitly lists /claude-tweaks:visual-review among the skills that "file a new backlog record directly without going through this skill, so they are NOT capture parents."
- **[structural-contract]** skills/capture/SKILL.md:257 -- capture's Relationship-to-Other-Skills table has no row for /claude-tweaks:triage, even though triage/SKILL.md lists capture as an upstream feeder — a one-directional cross-reference.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/_shared/decision-records.md" "skills/_shared/design-wrapper-handling.md" "skills/_shared/subagent-output-contract.md" "skills/_shared/work-record.md" "skills/assess-agent-autonomy/SKILL.md" "skills/capture/SKILL.md"
git commit -m "Fix review finding(s): skills/_shared/decision-records.md, skills/_shared/design-wrapper-handling.md, skills/_shared/subagent-output-contract.md..."
```

### Task 10: skills/challenge/SKILL.md, skills/code-health/SKILL.md, +4 more

**Files:**
- Modify: `skills/challenge/SKILL.md` (2 findings)
- Modify: `skills/code-health/SKILL.md` (1 finding)
- Modify: `skills/deepen/SKILL.md` (1 finding)
- Modify: `skills/demo/SKILL.md` (1 finding)
- Modify: `skills/design-wrapper/frontend-detection.md` (1 finding)
- Modify: `skills/design-wrapper/impeccable-cli.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/challenge/SKILL.md`:
- **[delegation]** skills/challenge/SKILL.md:184 -- Step 4 claims to 'Inline the verbatim Mode 4 aggregator instruction template' from _shared/multi-agent-coordination.md, but the inlined text reads 'candidate debiasing perspectives' instead of the primitive's canonical 'candidate responses' — a paraphrase the primitive's own Anti-Patterns table explicitly forbids.
- **[line-by-line]** skills/challenge/SKILL.md:67 -- The 'Work Record Output Handling' section states /challenge posts its debiasing findings as GitHub issue comments (or appends to the local record file) when the input is a work record reference, but no step in the actual Process (Steps 1-5) ever performs a gh issue comment / record-append call.

`skills/code-health/SKILL.md`:
- **[factual-claim]** skills/code-health/SKILL.md:402 -- The Anti-Patterns table claims the confidence floor for noisy criteria is 'enforced by the skill judgment, not the engine,' but the engine (bin/code-health.js's validate-findings command) actually enforces it mechanically.

`skills/deepen/SKILL.md`:
- **[structural-contract]** skills/deepen/SKILL.md:172 -- deepen's Relationship-to-Other-Skills table has no row for /claude-tweaks:ledger, even though ledger/SKILL.md documents deepen as a consumer — a one-directional cross-reference in violation of CLAUDE.md's bidirectional-table rule.

`skills/demo/SKILL.md`:
- **[line-by-line]** skills/demo/SKILL.md:115 -- Step 2's Suggested-verdict pre-fill rule requires checking whether a record's 'changed-file list' touches any merge-sensitive-paths glob, but no step in this skill ever fetches a changed-file list for a label-backed record.

`skills/design-wrapper/frontend-detection.md`:
- **[factual-claim]** skills/design-wrapper/frontend-detection.md:3 -- The file's opening sentence claims `/specify` ("Phase 1") does not yet write the record's `Surface:` body-metadata line and that writing it is a future "Phase 2" — directly contradicted by this same file's own "Layer 2" section 65 lines later and by design-wrapper/SKILL.md, both of which state `/specify` already writes `Surface:` (and `Design-intent:`) on every new leaf record today.

`skills/design-wrapper/impeccable-cli.md`:
- **[factual-claim]** skills/design-wrapper/impeccable-cli.md:75 -- The field-reference table asserts the CLI's `detect --json` output has exactly "9 specific rule ids" with `advisory` severity, enumerating them by name — but the currently published Impeccable CLI (verified by downloading and inspecting the real npm packages for 3.2.0, the exact version this doc claims to be "last verified against", and the newer 3.2.1) has a 10th advisory rule, `design-system-font-size`, that is absent from this list. It does not exist in 3.2.0's registry (confirming the doc's count was correct on its stated verification date) but is present as `severity: 'advisory'` in 3.2.1, i.e. a patch release introduced the drift.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/challenge/SKILL.md" "skills/code-health/SKILL.md" "skills/deepen/SKILL.md" "skills/demo/SKILL.md" "skills/design-wrapper/frontend-detection.md" "skills/design-wrapper/impeccable-cli.md"
git commit -m "Fix review finding(s): skills/challenge/SKILL.md, skills/code-health/SKILL.md, skills/deepen/SKILL.md..."
```

### Task 11: skills/docs-health/SKILL.md, skills/flow/SKILL.md, +3 more

**Files:**
- Modify: `skills/docs-health/SKILL.md` (1 finding)
- Modify: `skills/flow/SKILL.md` (1 finding)
- Modify: `skills/harness-health/SKILL.md` (1 finding)
- Modify: `skills/help/SKILL.md` (4 findings)
- Modify: `skills/help/status-scan.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/docs-health/SKILL.md`:
- **[structural-contract]** skills/docs-health/SKILL.md:3 -- docs-health omits `allowed-tools` even though it never calls Write/Edit/Task/WebFetch and is documented as sharing code-health's exact pipeline shape and 'never edits' contract.

`skills/flow/SKILL.md`:
- **[line-by-line]** skills/flow/SKILL.md:28 -- The 'When NOT to Use' bullet states unconditionally that a plan with tangled cross-task dependencies means 'flow's shape gate (Step 2.6) will hard-fail anyway,' but the skill's own Arguments table (line 52) states that `auto` mode — flow's default — 'Silences merge-check (Step 2.5), shape-check (Step 2.6)...', and `flow/validation.md`'s Step 2.6 procedure confirms that under `auto` a hard-fail signal is auto-resolved to 'proceed anyway and accept tangled-task risk' (option 2) rather than actually stopping the pipeline.

`skills/harness-health/SKILL.md`:
- **[structural-contract]** skills/harness-health/SKILL.md:3 -- harness-health omits `allowed-tools` even though its tool usage and 'never edits' promise are functionally identical to code-health/SKILL.md, which explicitly restricts to Read/Grep/Glob/Bash/AskUserQuestion.

`skills/help/SKILL.md`:
- **[cross-file]** skills/help/SKILL.md:54 -- SKILL.md Section 2 summarizes status-scan.md as covering 'sub-stages 4.5 and 4.6,' omitting Stage 4.7 (Acceptance Queue), which status-scan.md's own header (line 5) and body fully define.
- **[cross-file-promise]** skills/help/SKILL.md:141 -- /help's and /claude-tweaks:ledger's Relationship tables both claim "/help ... scans for active ledgers with open items and surfaces them in the status dashboard," but /help's actual Stage 1-7 scan procedure (skills/help/status-scan.md) never reads any ledger file and the Present Dashboard template has no ledger row.
- **[line-by-line]** skills/help/SKILL.md:34 -- The Input table says the `status` argument produces 'Pipeline status scan only,' but Section 3 (Recommendation)'s own skip condition ('Always included unless `$ARGUMENTS` = `commands`') means Section 3 renders for `status` too, contradicting the table.
- **[line-by-line]** skills/help/SKILL.md:36 -- The Input table promises 'Targeted status for that specific spec/topic' when `$ARGUMENTS` is a spec number or topic, but no section-skip condition or stage in status-scan.md implements any spec/topic filtering — the argument falls through to the same full, generic rendering as no argument at all.

`skills/help/status-scan.md`:
- **[factual-claim]** skills/help/status-scan.md:30 -- status-scan.md cites the Grant-queue-counts snippet as 'item-7' in `_shared/github-pr-scan.md`, but that snippet is numbered item 8 there.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/docs-health/SKILL.md" "skills/flow/SKILL.md" "skills/harness-health/SKILL.md" "skills/help/SKILL.md" "skills/help/status-scan.md"
git commit -m "Fix review finding(s): skills/docs-health/SKILL.md, skills/flow/SKILL.md, skills/harness-health/SKILL.md..."
```

### Task 12: skills/init/SKILL.md, skills/init/bootstrap-steps.md, +4 more

**Files:**
- Modify: `skills/init/SKILL.md` (2 findings)
- Modify: `skills/init/bootstrap-steps.md` (1 finding)
- Modify: `skills/journey-health/SKILL.md` (2 findings)
- Modify: `skills/ledger/SKILL.md` (1 finding)
- Modify: `skills/research/SKILL.md` (1 finding)
- Modify: `skills/specify/SKILL.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/init/SKILL.md`:
- **[factual-claim]** skills/init/SKILL.md:152 -- The Scope Selection Gate, which fires immediately after Phase 0 (before Phase 2 reconnaissance has run), parenthetically claims the referenced 'Phases at a Glance' table auto-marks Phase 8 'Skip — no UI detected,' but that table (lines 52-64) contains no such annotation anywhere, and the condition (recon findings) doesn't exist yet at this point in the run.
- **[line-by-line]** skills/init/SKILL.md:162 -- Option 2 (Interactive)'s per-phase gate template computes the next two phases via literal {N+1}/{N+2} integer arithmetic, but the real phase sequence has a non-integer step (…7, 8, 8.5, 9…), so the substituted text is wrong at that boundary.

`skills/init/bootstrap-steps.md`:
- **[cross-file]** skills/init/bootstrap-steps.md:91 -- The suggested .gitignore block only lists `.claude-tweaks/code-health/` for the health skills' local cache, omitting the equivalent `.claude-tweaks/harness-health/`, `.claude-tweaks/journey-health/`, and `.claude-tweaks/docs-health/` directories that also hold a per-skill local `cache.json` per `_shared/health-state.md`.

`skills/journey-health/SKILL.md`:
- **[cross-file]** skills/journey-health/SKILL.md:313 -- journey-health's Relationship-table row for harness-health claims 'this skill's own Step 3.6 mirrors harness-health's Step 5,' but harness-health's actual Step 5 is 'GATHER OPEN ISSUES for dedup' (fetching existing issues for dedup), not a verify-gate step — harness-health has no separate numbered VERIFY GATE step at all (its verify gate is embedded inside Step 3's application of the shared harness-health-analysis.md procedure, per that skill's own Anti-Patterns table).
- **[structural-contract]** skills/journey-health/SKILL.md:3 -- journey-health omits `allowed-tools` even though it never calls Write/Edit/Task and is documented as sharing code-health's exact pipeline shape and 'never edits' contract.

`skills/ledger/SKILL.md`:
- **[line-by-line]** skills/ledger/SKILL.md:251 -- The Relationship-to-Other-Skills row for /claude-tweaks:wrap-up states 'deletes the ledger (Step 5),' directly contradicting this same file's own 'Delete' section three paragraphs earlier (line 185: 'Called by /claude-tweaks:wrap-up Step 10 (planned in Step 5)') and wrap-up/SKILL.md's own text, which explicitly separates planning cleanup at Step 5 from executing it at Step 10.

`skills/research/SKILL.md`:
- **[structural-contract]** skills/research/SKILL.md:111 -- research's '## Component-Skill Contract' section is placed after '## Anti-Patterns' (line 101) instead of immediately before it, violating CLAUDE.md's explicit CSC placement rule.

`skills/specify/SKILL.md`:
- **[structural-contract]** skills/specify/SKILL.md:728 -- specify's Relationship-to-Other-Skills table has no row for /claude-tweaks:triage, even though triage/SKILL.md names specify as 'the shaper' that gates entry to its worklist — a one-directional cross-reference.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/init/SKILL.md" "skills/init/bootstrap-steps.md" "skills/journey-health/SKILL.md" "skills/ledger/SKILL.md" "skills/research/SKILL.md" "skills/specify/SKILL.md"
git commit -m "Fix review finding(s): skills/init/SKILL.md, skills/init/bootstrap-steps.md, skills/journey-health/SKILL.md..."
```

### Task 13: skills/test/SKILL.md, skills/tidy/SKILL.md, +2 more

**Files:**
- Modify: `skills/test/SKILL.md` (1 finding)
- Modify: `skills/tidy/SKILL.md` (2 findings)
- Modify: `skills/triage/SKILL.md` (1 finding)
- Modify: `skills/wrap-up/SKILL.md` (3 findings)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/test/SKILL.md`:
- **[line-by-line]** skills/test/SKILL.md:166 -- Step 1.5's "Reporting" subsection enumerates only two branches for surfacing Design CLI findings ("Standard mode / All mode" and "Pipeline mode," naming the two `report-templates.md` pipeline templates) and never covers `skip-qa` mode's own report format, even though the Anti-Patterns table requires the Design CLI Gate to still run under `skip-qa`.

`skills/tidy/SKILL.md`:
- **[line-by-line]** skills/tidy/SKILL.md:182 -- The Evidence tier is declared '(`--scope=github` routine firings only)' and gated on 'Step 4.8 ran', yet two of its four auto-apply finding shapes ('Parked record, `milestoneDueOn`...' and 'Parked record, a `watchedPaths` entry...') are Step 1 findings that a `--scope=github` firing never produces, since the Scope Selection table maps `github` to Step 4.8 only.
- **[line-by-line]** skills/tidy/SKILL.md:148 -- Step 6's aggressiveness-routing table has matching `local-files`/`github-issues` rows for Absorb on a backlog record, but only a `github-issues` row for Delete on a backlog record — no row covers Delete of a stale backlog record under `work-backend: local-files`.

`skills/triage/SKILL.md`:
- **[cross-file]** skills/triage/SKILL.md:236 -- The Relationship-to-Other-Skills table lists `bin/lib/issues/record.js` as two separate, differently-worded rows (lines 236 and 237) instead of one consolidated entry.

`skills/wrap-up/SKILL.md`:
- **[cross-file]** skills/wrap-up/SKILL.md:207 -- Step 8's `work-backend: github-issues` "newly unblocked records" check finds dependents solely via `parseDependencies(r.body)` (matches only literal `Blocked by #N` body-text lines) with no branch for `work-links: native`, even though `bin/lib/issues/record.js` ships `buildNativeDependencyQuery`/`hasOpenNativeBlocker` specifically for that mode.
- **[cross-file]** skills/wrap-up/SKILL.md:185 -- Step 7's summary sentence says skill-curation.md's 7.3 substep is a "6-dimension analysis," but skill-curation.md's own 7.3-7.5 section (and CLAUDE.md's Structure table) both describe it as applying `_shared/harness-health-analysis.md`'s documented "8-dimension check."
- **[factual-claim]** skills/wrap-up/SKILL.md:117 -- Step 6's fast-lane pre-check says to feed `git diff --name-only` output into `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles(files, sensitivePaths)`, but that function reads `f.path` off each element of `files` — bare filename strings have no `.path`, so every entry silently classifies as `isSensitive: false` regardless of content.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/test/SKILL.md" "skills/tidy/SKILL.md" "skills/triage/SKILL.md" "skills/wrap-up/SKILL.md"
git commit -m "Fix review finding(s): skills/test/SKILL.md, skills/tidy/SKILL.md, skills/triage/SKILL.md..."
```

### Task 14: skills/wrap-up/review-console.md

**Files:**
- Modify: `skills/wrap-up/review-console.md` (4 findings)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/wrap-up/review-console.md`:
- **[cross-file]** skills/wrap-up/review-console.md:258 -- "On approval"/"On override" (and the Empty-console fast path) instruct proceeding to "Step 10 (Consolidated Summary)", but per wrap-up/SKILL.md's actual headings Step 9 is "Present Consolidated Summary" and Step 10 is "Execute Approved Actions" — the parenthetical names the wrong step.
- **[cross-file-promise]** skills/wrap-up/review-console.md:112 -- The Review Console's "Numbering rules" state "Sections 1–6 (Auto-applied through Cleanup)" share one global row sequence and label Queue writes as "Section 7," but the actual template lists 7 named batch sections before Queue writes (Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Configuration updates, Cleanup actions), making Queue writes really the 8th section — contradicting wrap-up/SKILL.md line 303's own correct "up to seven sections" description of the same console.
- **[delegation]** skills/wrap-up/review-console.md:275 -- The canonical "Empty-console fast path" here requires 5 conditions (adds "no cleanup actions apply" and "no queue writes are pending" to the base three), but wrap-up/SKILL.md's own inline restatement of the same rule (line 307) lists only 3 conditions — a duplicated rule drifted from the source it summarizes.
- **[line-by-line]** skills/wrap-up/review-console.md:112 -- "Numbering rules" states sections 1–6 span "Auto-applied through Cleanup," but the worked example immediately below uses one continuous 1–15 sequence across seven named sections (Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Configuration updates, Cleanup actions) before Queue writes starts its own Q-prefixed count.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/wrap-up/review-console.md"
git commit -m "Fix review finding(s): skills/wrap-up/review-console.md"
```

---

## Wave 4 -- bin/ runtime quality (reuse, simplification, efficiency, altitude, conventions)

### Task 15: .claude-plugin/plugin.json, bin/claude-tweaks-statusline.js, +4 more

**Files:**
- Modify: `.claude-plugin/plugin.json` (1 finding)
- Modify: `bin/claude-tweaks-statusline.js` (1 finding)
- Modify: `bin/code-health.js` (1 finding)
- Modify: `bin/harness-health.js` (1 finding)
- Modify: `bin/hooks.js` (1 finding)
- Modify: `bin/install-statusline-wrapper.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`.claude-plugin/plugin.json`:
- **[conventions]** .claude-plugin/plugin.json:4 -- The plugin's version (6.11.1) has drifted out of sync with CLAUDE.md's own hardcoded restatement of it in prose ('A Claude Code plugin (v5.7.0) containing markdown skill files...', CLAUDE.md line 5), even though CLAUDE.md's own Versioning section states '- Version lives in `.claude-plugin/plugin.json`' (CLAUDE.md line 133) as the single source of truth.

`bin/claude-tweaks-statusline.js`:
- **[simplification]** bin/claude-tweaks-statusline.js:124 -- findActiveSpec's candidates array + for loop is vestigial now that commit 2c8660f (this session) removed the only other entry (specs/INBOX), leaving a loop/try-catch wrapper around what is now a single directory lookup.

`bin/code-health.js`:
- **[altitude]** bin/code-health.js:316 -- The "pick up to --budget distinct targets, simulating post-audit cursor state in-memory between picks" loop is hand-rolled separately in cmdNextSlice and all three sibling cmdNextTargets, instead of being generalized into bin/lib/health-core/ the way the adjacent single-pick selection logic already was.

`bin/harness-health.js`:
- **[reuse]** bin/harness-health.js:41 -- loadIssueIndex, cmdChurnReport, and cmdMark are each duplicated near-verbatim (differing only in a bracketed tool-name/filename string) across 3-4 of the four health-suite CLI files, none relocated to bin/lib/health-core/ alongside the computeChurn/retry-queue helpers these same files already import from there.

`bin/hooks.js`:
- **[simplification]** bin/hooks.js:25 -- record-worktree (lines 25-43) and close-run (lines 65-77) both re-implement the same "resolve --run <path>, validate it's a real directory via a try/catch IIFE, else fall back to ctxLib.resolveRunDir" block.

`bin/install-statusline-wrapper.js`:
- **[simplification]** bin/install-statusline-wrapper.js:6 -- The entire generated wrapper script — including a hand-escaped /^\d+\.\d+\.\d+$/ version regex — lives as one un-lintable, un-typechecked template literal, and its only test asserts the written bytes equal buildWrapperSource()'s own return value rather than that the generated script is valid, runnable JS.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add ".claude-plugin/plugin.json" "bin/claude-tweaks-statusline.js" "bin/code-health.js" "bin/harness-health.js" "bin/hooks.js" "bin/install-statusline-wrapper.js"
git commit -m "Fix review finding(s): .claude-plugin/plugin.json, bin/claude-tweaks-statusline.js, bin/code-health.js..."
```

### Task 16: bin/journey-health.js, bin/lib/code-health/cache.js, +4 more

**Files:**
- Modify: `bin/journey-health.js` (1 finding)
- Modify: `bin/lib/code-health/cache.js` (1 finding)
- Modify: `bin/lib/code-health/scope.js` (1 finding)
- Modify: `bin/lib/docs-health/findability.js` (1 finding)
- Modify: `bin/lib/docs-health/issue-payload.js` (1 finding)
- Modify: `bin/lib/harness-health/scope.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/journey-health.js`:
- **[efficiency]** bin/journey-health.js:71 -- cmdNextTarget calls readDurableState(root) twice per invocation instead of once, and each call performs a real `git fetch origin health-state` network round-trip.

`bin/lib/code-health/cache.js`:
- **[simplification]** bin/lib/code-health/cache.js:21 -- code-health/cache.js's computeChurn duplicates health-core/runs.js's computeChurn wholesale just to add one derivable extra field (`stayed`), rather than computing `stayed` in the shared version and letting the other three engines ignore the extra return key.

`bin/lib/code-health/scope.js`:
- **[efficiency]** bin/lib/code-health/scope.js:95 -- contentHash() (line 62) and sliceLoc() (line 95) each independently call sourceFiles(absDir) and then fully re-read every file it returns, so selectSlice's Phase-2 scoring does two `find` subprocess spawns and two full read-passes over every source file in a slice instead of one.

`bin/lib/docs-health/findability.js`:
- **[reuse]** bin/lib/docs-health/findability.js:9 -- findability.js's walkMarkdownFiles hand-rolls the same recursive docs/**.md directory walk that scope.js's listDocs already performs in the same skill, as a separately-configured private copy instead of building on the existing listDocs helper.

`bin/lib/docs-health/issue-payload.js`:
- **[reuse]** bin/lib/docs-health/issue-payload.js:33 -- fenceFor/fencedBlock (a GitHub-fence-safe code-block wrapper) and the CLASSIFICATION_SCORING risk/effort map are copy-pasted verbatim into both docs-health/issue-payload.js and harness-health/issue-payload.js instead of living once in bin/lib/issues/record.js, which both files already import for recordPayload/specShapedBody.

`bin/lib/harness-health/scope.js`:
- **[conventions]** bin/lib/harness-health/scope.js:30 -- parseRulePaths (harness-health/scope.js), parseFilesField (docs-health/freshness.js), and parseJourneyFiles (journey-health/scope.js) are three independently hand-written ~15-line functions that all parse a YAML-style bullet list under a named frontmatter key, an unextracted N>=2 near-identical-consumer duplication.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/journey-health.js" "bin/lib/code-health/cache.js" "bin/lib/code-health/scope.js" "bin/lib/docs-health/findability.js" "bin/lib/docs-health/issue-payload.js" "bin/lib/harness-health/scope.js"
git commit -m "Fix review finding(s): bin/journey-health.js, bin/lib/code-health/cache.js, bin/lib/code-health/scope.js..."
```

### Task 17: bin/lib/hooks/git-command.js, bin/lib/hooks/post-tool-use.js, +4 more

**Files:**
- Modify: `bin/lib/hooks/git-command.js` (1 finding)
- Modify: `bin/lib/hooks/post-tool-use.js` (1 finding)
- Modify: `bin/lib/issue-branch-tracking.js` (1 finding)
- Modify: `bin/lib/issues/grouping.js` (1 finding)
- Modify: `bin/lib/issues/metrics.js` (1 finding)
- Modify: `bin/lib/issues/record.js` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/hooks/git-command.js`:
- **[simplification]** bin/lib/hooks/git-command.js:180 -- fileWriteTargets's cd-token handling (lines 180-188) duplicates gitTargets's cd-token handling (lines 104-116) verbatim in logic and variable names, just reformatted.

`bin/lib/hooks/post-tool-use.js`:
- **[reuse]** bin/lib/hooks/post-tool-use.js:60 -- CLOSING_KEYWORD_RE re-encodes the same GitHub closing-keyword vocabulary (fix/close/resolve + inflections) that bin/lib/issue-branch-tracking.js already exports as ISSUE_REF_SOURCE, as an independently hand-written regex.

`bin/lib/issue-branch-tracking.js`:
- **[simplification]** bin/lib/issue-branch-tracking.js:90 -- generateWorkflowYaml's 'Extract referenced issues' step (env block + 4-line shell script) is duplicated verbatim between the label-fix-branch and cleanup-fix-labels job arrays.

`bin/lib/issues/grouping.js`:
- **[simplification]** bin/lib/issues/grouping.js:91 -- extractKeyFiles's journey-health and docs-health branches are byte-for-byte identical two-line bodies (and match harness-health's core logic too), collapsible into one shared branch.

`bin/lib/issues/metrics.js`:
- **[reuse]** bin/lib/issues/metrics.js:14 -- labelName re-implements the exact GitHub label-normalization logic that record.js's normalizeLabelNames and grouping.js's labelNames already provide, as this file's own comment admits.

`bin/lib/issues/record.js`:
- **[conventions]** bin/lib/issues/record.js:280 -- The specShapedBody comment claims 'the three health builders' share this skeleton, but grep confirms four issue-payload builders (code-health, harness-health, journey-health, docs-health) call it, violating CLAUDE.md's rule against restating a list's cardinality as a literal number in prose.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/hooks/git-command.js" "bin/lib/hooks/post-tool-use.js" "bin/lib/issue-branch-tracking.js" "bin/lib/issues/grouping.js" "bin/lib/issues/metrics.js" "bin/lib/issues/record.js"
git commit -m "Fix review finding(s): bin/lib/hooks/git-command.js, bin/lib/hooks/post-tool-use.js, bin/lib/issue-branch-tracking.js..."
```

### Task 18: bin/lib/journey-health/fingerprint.js, hooks/hooks.json

**Files:**
- Modify: `bin/lib/journey-health/fingerprint.js` (1 finding)
- Modify: `hooks/hooks.json` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`bin/lib/journey-health/fingerprint.js`:
- **[altitude]** bin/lib/journey-health/fingerprint.js:8 -- The per-skill fingerprint wrapper (normalizeDescription + fingerprint(prefix, basis)) is reimplemented byte-for-byte in docs-health/fingerprint.js, harness-health/fingerprint.js, and journey-health/fingerprint.js instead of being one parametrized factory in health-core/fingerprint.js, unlike the sibling createCache(skillName)/createDurableState(skillName, opts) factories already established in the same per-skill cache.js files.

`hooks/hooks.json`:
- **[simplification]** hooks/hooks.json:26 -- PreToolUse and PostToolUse register 9 separate `{"matcher": "Bash", "hooks": [...]}` blocks (6 in PreToolUse for git commit / git push / git -C / cp / mv / tee, 3 more in PostToolUse) that differ only in the `if` string, even though the schema already supports multiple hook objects inside one matcher's `hooks` array (as every other event in this same file demonstrates with a single-item array).

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "bin/lib/journey-health/fingerprint.js" "hooks/hooks.json"
git commit -m "Fix review finding(s): bin/lib/journey-health/fingerprint.js, hooks/hooks.json"
```

---

## Wave 5 -- skills/ markdown quality (reuse, simplification, efficiency, altitude, conventions)

### Task 19: agents/qa-agent.md, skills/_shared/dev-url-detection.md, +4 more

**Files:**
- Modify: `agents/qa-agent.md` (1 finding)
- Modify: `skills/_shared/dev-url-detection.md` (1 finding)
- Modify: `skills/_shared/github-pr-scan.md` (2 findings)
- Modify: `skills/_shared/harness-health-analysis.md` (1 finding)
- Modify: `skills/_shared/health-filing-mechanics.md` (1 finding)
- Modify: `skills/_shared/label-bootstrap.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`agents/qa-agent.md`:
- **[simplification]** agents/qa-agent.md:255 -- The REPORT_JSON envelope — including the full nested `page_inventories` shape (interactive_elements/forms/navigation/accessibility/layout) — is spelled out in full here and, byte-for-byte on the nested part, again in skills/test/qa-prompts.md's dispatch prompt template (line 114), with neither file referencing the other as the source of truth for the schema.

`skills/_shared/dev-url-detection.md`:
- **[reuse]** skills/_shared/dev-url-detection.md:72 -- Step 2.7's `git rev-parse --git-dir` vs `--git-common-dir` check reimplements in raw bash the same linked-worktree heuristic `bin/lib/hooks/worktree-detect.js`'s `repoInfo()` already provides, without that helper's submodule guard or symlink-safe path resolution.

`skills/_shared/github-pr-scan.md`:
- **[efficiency]** skills/_shared/github-pr-scan.md:52 -- The `repo-wide` scope's 8 steps — open PRs, a per-open-PR GraphQL loop, four separate health-issue-label queries, a merged-PR check, and a grant-queue count — are independent gh/bash calls with no `> **Parallel execution:**` directive, unlike the pattern this same shared-file corpus uses elsewhere (dev-url-detection.md Step 1, journey-coverage-check.md).
- **[simplification]** skills/_shared/github-pr-scan.md:125 -- The "Findings and recommendations" table repeats an identical stale/still-valid row-pair four times — once each for code-health, harness-health, journey-health, docs-health — with only the skill name substituted, instead of one row generalized over the by:{skill} label family.

`skills/_shared/harness-health-analysis.md`:
- **[efficiency]** skills/_shared/harness-health-analysis.md:63 -- Step 1's 8 Evidence Pre-Checks (stale-example ls, convention-drift grep, glob-resolution find, line-budget wc, unscoped-rule sed, self-referential grep, narrative-density grep+wc, bare-invocation grep) are independent read-only checks against the same target with no `> **Parallel execution:**` directive, unlike the convention this shared-file corpus establishes elsewhere.

`skills/_shared/health-filing-mechanics.md`:
- **[reuse]** skills/_shared/health-filing-mechanics.md:15 -- The retry-queue-drain section instructs consumers to file `gh issue create` 'exactly as the Type-expression-branch below describes,' but this shared file has no Type-expression-branch section anywhere in it.

`skills/_shared/label-bootstrap.md`:
- **[conventions]** skills/_shared/label-bootstrap.md:32 -- The work-record label count is hand-typed here as "23 core + 3 optional" (and again as "26" two lines later), even though CLAUDE.md's own Structure table documents work-record.md's taxonomy as something every consumer "cites rather than restates."

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "agents/qa-agent.md" "skills/_shared/dev-url-detection.md" "skills/_shared/github-pr-scan.md" "skills/_shared/harness-health-analysis.md" "skills/_shared/health-filing-mechanics.md" "skills/_shared/label-bootstrap.md"
git commit -m "Fix review finding(s): agents/qa-agent.md, skills/_shared/dev-url-detection.md, skills/_shared/github-pr-scan.md..."
```

### Task 20: skills/browse/SKILL.md, skills/build/SKILL.md, +4 more

**Files:**
- Modify: `skills/browse/SKILL.md` (1 finding)
- Modify: `skills/build/SKILL.md` (1 finding)
- Modify: `skills/build/failure-recovery.md` (1 finding)
- Modify: `skills/build/worktree-setup.md` (1 finding)
- Modify: `skills/capture/SKILL.md` (1 finding)
- Modify: `skills/code-health/SKILL.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/browse/SKILL.md`:
- **[simplification]** skills/browse/SKILL.md:92 -- SKILL.md's "Operation Mapping" table (lines 96-109) re-states 10 of the 13 rows in agent-browser-reference.md's canonical Operation vocabulary table almost verbatim, despite the file twice pointing readers to that sub-file as the source of truth.

`skills/build/SKILL.md`:
- **[efficiency]** skills/build/SKILL.md:95 -- Spec Step 2.5's per-Manual-Steps-item CLI/credential probing (`which {tool}`, then `{tool} auth status`) carries no "Parallel execution" directive, unlike the structurally identical probe-then-classify procedure in `operational-checklist.md` (same skill directory, Common Step 5.5) which explicitly calls out parallel tool calls for its probes.

`skills/build/failure-recovery.md`:
- **[altitude]** skills/build/failure-recovery.md:19 -- The "reproduce a behavioral bug before fixing it" discipline is a cross-cutting concern independently restated with drifting wording in at least four places (build/SKILL.md:235, build/failure-recovery.md:19, test/SKILL.md:225, review/SKILL.md:508) rather than centralized in one `_shared/*.md` fragment, unlike other repeated cross-cutting concerns in this codebase (Working Directory Discipline, git rules, auto-mode routing) which do have a canonical shared home.

`skills/build/worktree-setup.md`:
- **[conventions]** skills/build/worktree-setup.md:53 -- The worktree base-mismatch warning template embeds a literal ⚠ emoji character, violating CLAUDE.md's explicit "Don't use emojis in skill files — use **(Recommended)** bold text for emphasis instead."

`skills/capture/SKILL.md`:
- **[altitude]** skills/capture/SKILL.md:121 -- Slug derivation (lowercase, collapse non-alphanumeric runs, trim, truncate to 60 chars, dedupe with a numeric suffix) is spelled out as a natural-language algorithm for the model to hand-execute, instead of being a small function in bin/lib/issues/local-store.js alongside the allocateId/createRecord helpers it is always used together with.

`skills/code-health/SKILL.md`:
- **[simplification]** skills/code-health/SKILL.md:103 -- The universal criteria list for an unknown area (`types: []`) is hardcoded as a 15-item prose enumeration, immediately followed by a live command that already computes the same list from `criteria.js`.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/browse/SKILL.md" "skills/build/SKILL.md" "skills/build/failure-recovery.md" "skills/build/worktree-setup.md" "skills/capture/SKILL.md" "skills/code-health/SKILL.md"
git commit -m "Fix review finding(s): skills/browse/SKILL.md, skills/build/SKILL.md, skills/build/failure-recovery.md..."
```

### Task 21: skills/demo/SKILL.md, skills/design-wrapper/modes/pre-build.md, +4 more

**Files:**
- Modify: `skills/demo/SKILL.md` (1 finding)
- Modify: `skills/design-wrapper/modes/pre-build.md` (1 finding)
- Modify: `skills/design-wrapper/modes/survey.md` (1 finding)
- Modify: `skills/flow/multispec-review-console.md` (1 finding)
- Modify: `skills/help/status-scan.md` (2 findings)
- Modify: `skills/init/SKILL.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/demo/SKILL.md`:
- **[efficiency]** skills/demo/SKILL.md:63 -- Verification Briefs are fetched one `gh issue view {n} --json comments` call per `demo:pending` record in an implicit sequential loop, with no parallel-execution directive, unlike this codebase's own Form A convention for independent read-only Bash operations.

`skills/design-wrapper/modes/pre-build.md`:
- **[efficiency]** skills/design-wrapper/modes/pre-build.md:27 -- Steps 3-4 describe up to 8 independent file reads (up to 6 Impeccable reference docs plus PRODUCT.md/DESIGN.md or their fallback globs) with no `> **Parallel execution:**` directive, unlike every other multi-independent-file gather step in this same review scope.

`skills/design-wrapper/modes/survey.md`:
- **[simplification]** skills/design-wrapper/modes/survey.md:53 -- Step 4 spends a sentence describing how `decline_count` gets "incremented in-place" before immediately disclaiming that this mode never actually performs it -- the same fact (increment ownership belongs entirely to /flow) is then stated a second time, unambiguously, in the "Ownership" paragraph 29 lines later (line 82).

`skills/flow/multispec-review-console.md`:
- **[simplification]** skills/flow/multispec-review-console.md:158 -- "On approval" (steps 6-10) and "On override" (steps 5-9) duplicate five full cleanup steps almost verbatim instead of extracting them into a shared subsection, the way "Per-issue label cleanup" already is in the same file.

`skills/help/status-scan.md`:
- **[efficiency]** skills/help/status-scan.md:37 -- Stage 1 issues two separate `gh issue list --state open` calls (line 37 and line 94) against overlapping data instead of one call whose --json field list covers both the count computation and the conflict-detection body extraction.
- **[simplification]** skills/help/status-scan.md:44 -- Stage 1's github-issues and local-files node scripts duplicate the same six-bucket filter chain (blocked/building/authorized/ready/parked/backlog) almost verbatim instead of computing it once against a common faceted-record shape.

`skills/init/SKILL.md`:
- **[simplification]** skills/init/SKILL.md:415 -- The Next Actions signal-resolution table's 'Everything is clean' row (line 414) and its 'Fallback (no row above matches)' row (line 415) recommend the identical action with identical description text, so the 5-row table only has 4 distinct outcomes.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/demo/SKILL.md" "skills/design-wrapper/modes/pre-build.md" "skills/design-wrapper/modes/survey.md" "skills/flow/multispec-review-console.md" "skills/help/status-scan.md" "skills/init/SKILL.md"
git commit -m "Fix review finding(s): skills/demo/SKILL.md, skills/design-wrapper/modes/pre-build.md, skills/design-wrapper/modes/survey.md..."
```

### Task 22: skills/init/bootstrap-steps.md, skills/reflect/hindsight-mode.md, +4 more

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (2 findings)
- Modify: `skills/reflect/hindsight-mode.md` (1 finding)
- Modify: `skills/research/reference/methodology.md` (1 finding)
- Modify: `skills/review-backlog/SKILL.md` (1 finding)
- Modify: `skills/review/SKILL.md` (1 finding)
- Modify: `skills/specify/SKILL.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/init/bootstrap-steps.md`:
- **[conventions]** skills/init/bootstrap-steps.md:395 -- Several /init decision prompts (Step 11 here; also Step 10 ~lines 306-317, Step 12 ~451-463, Step 14 ~638-648, Step 15's gate-fails case at 717, and Phase 8 in skills/init/SKILL.md lines 320-328) render a single decision as a plain markdown numbered list inside a 'Present:' block with no accompanying AskUserQuestion call.
- **[reuse]** skills/init/bootstrap-steps.md:304 -- Step 10 and Step 12 each hardcode the same abbreviated frontend-signal detection list inline instead of referencing the existing canonical skills/design-wrapper/frontend-detection.md, which skills/specify/design-pre-steps.md (line 15, same review scope) already cites correctly for the identical question.

`skills/reflect/hindsight-mode.md`:
- **[simplification]** skills/reflect/hindsight-mode.md:44 -- hindsight-mode.md's Interactive-mode `AskUserQuestion` block (lines 44-48) is a near-verbatim copy of full-mode.md's block (lines 51-55) -- identical question shape and both options, differing only in the word "findings"/"insights" -- even though light-mode.md in the same directory already establishes the pattern of pointing at full-mode.md's block ("Same table/AskUserQuestion mechanics as full mode") instead of restating it.

`skills/research/reference/methodology.md`:
- **[conventions]** skills/research/reference/methodology.md:51 -- Step 4's parallel-subagent dispatch names "Template C" by reference instead of inlining its literal 4-line output format, violating CLAUDE.md's explicit rule that dispatched output templates must be inlined verbatim in the agent prompt.

`skills/review-backlog/SKILL.md`:
- **[reuse]** skills/review-backlog/SKILL.md:82 -- The git-log-based `createdAt` derivation script (execSync per record, fallback to `new Date().toISOString()`) is duplicated verbatim in two places in the same file (unsynced-record fold-in and local-files fetch) instead of living once in `bin/lib/issues/review-backlog.js`, which already houses this skill's other pure filter/sort/split/merge helpers.

`skills/review/SKILL.md`:
- **[simplification]** skills/review/SKILL.md:464 -- Step 6.6 (Design Findings Routing) and Step 3-ter (Visual Findings Routing, line 474) are near-verbatim copy-paste of the same three-step routing procedure, differing only in the category label and upstream source skill name.

`skills/specify/SKILL.md`:
- **[efficiency]** skills/specify/SKILL.md:198 -- Decomposition mode fetches the full issue list twice within one run — Step 1's Landscape read (--state open --json number,title,labels,body, line 198) and Step 3's Idempotency map (--state all --json number,body, line 390) — with no note that Step 3 could reuse or extend Step 1's already-fetched data.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/init/bootstrap-steps.md" "skills/reflect/hindsight-mode.md" "skills/research/reference/methodology.md" "skills/review-backlog/SKILL.md" "skills/review/SKILL.md" "skills/specify/SKILL.md"
git commit -m "Fix review finding(s): skills/init/bootstrap-steps.md, skills/reflect/hindsight-mode.md, skills/research/reference/methodology.md..."
```

### Task 23: skills/stories/coverage-report.md, skills/test/qa-prompts.md, +3 more

**Files:**
- Modify: `skills/stories/coverage-report.md` (1 finding)
- Modify: `skills/test/qa-prompts.md` (1 finding)
- Modify: `skills/tidy/SKILL.md` (1 finding)
- Modify: `skills/triage/SKILL.md` (1 finding)
- Modify: `skills/visual-review/SKILL.md` (1 finding)

**Findings to fix (full detail in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json`):**

`skills/stories/coverage-report.md`:
- **[reuse]** skills/stories/coverage-report.md:5 -- `/claude-tweaks:stories` Step 6 reimplements journey↔story coverage and orphan-detection logic instead of using the canonical `_shared/journey-coverage-check.md` computation that `/claude-tweaks:review` (lens 3g-cov) and `/claude-tweaks:journey-health` both explicitly reuse.

`skills/test/qa-prompts.md`:
- **[conventions]** skills/test/qa-prompts.md:152 -- The 'Legacy format prompt' template — which the file's own header (line 7) requires to be 'inline[d] ... verbatim per agent (no references to sibling files)' — tells the dispatched agent to emit REPORT_JSON 'with the same shape documented in the structured-format prompt above,' a reference the agent never actually receives.

`skills/tidy/SKILL.md`:
- **[efficiency]** skills/tidy/SKILL.md:58 -- Step 5.5 is documented as having no data dependency on the parallel scan batch ("git-log only... not a data dependency") yet still runs sequentially after it purely for report-assembly ordering.

`skills/triage/SKILL.md`:
- **[simplification]** skills/triage/SKILL.md:236 -- The Relationship-to-Other-Skills table has two separate rows for the same file, `bin/lib/issues/record.js`, instead of one consolidated row.

`skills/visual-review/SKILL.md`:
- **[simplification]** skills/visual-review/SKILL.md:178 -- Step 4's "Applying a recommendation" apply-gate and Step 5's "Fix flagged issues" apply-gate hand-roll the identical three-branch procedure (AskUserQuestion apply-all/choose-individually/none -> per-item direct Skill-tool invocation -> /claude-tweaks:test skip-qa re-verify -> "report, don't auto-revert" framing) as two separately-written blocks instead of one referenced sub-procedure; line 221 explicitly concedes it is "the same... approach as Step 4's apply-gate" without factoring it out.

- [ ] **Step 1: Read each target file and the matching entries in `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` for this task's files, to get the full `failure_scenario` for each finding.**

- [ ] **Step 2: Apply each fix listed above, one at a time, addressing the root cause described in the failure_scenario.**

- [ ] **Step 3: For any finding describing a production-code logic bug with an existing test suite for that module, add or extend a regression test proving the fix (input/state from the failure_scenario -> correct output). For findings that ARE about a test file, fix the test itself so its assertion can actually fail on a real regression.**

- [ ] **Step 4: Run tests for the affected area.**

Run (from the worktree root): `npm test` (full suite -- required for any `bin/` or `bin/lib/**` change; for markdown-only tasks, `npm test` still applies since nothing here should break it).
Expected: all tests pass, 0 failures, no drop from the 1282-test baseline.

- [ ] **Step 5: Commit.**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/fix-review-findings"
git add "skills/stories/coverage-report.md" "skills/test/qa-prompts.md" "skills/tidy/SKILL.md" "skills/triage/SKILL.md" "skills/visual-review/SKILL.md"
git commit -m "Fix review finding(s): skills/stories/coverage-report.md, skills/test/qa-prompts.md, skills/tidy/SKILL.md..."
```

---

## Final verification

- [ ] **Run the full suite one more time after all 23 tasks are committed.**

Run: `npm test`
Expected: all tests pass, 0 failures.

- [ ] **Spot-check that no task silently skipped a finding**: grep the plan file for `- [ ]` remaining unchecked; every task must be fully checked off.
