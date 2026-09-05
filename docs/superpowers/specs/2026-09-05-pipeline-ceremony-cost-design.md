# Pipeline Ceremony Cost — Scoped Verification, Runner-Owned Stamps, and a Fast Lane That Sheds Cost

**Status:** Design — brainstormed from GitHub issue [#1904](https://github.com/thomasholknielsen/claude-tweaks/issues/1904). Subsumes [#1801](https://github.com/thomasholknielsen/claude-tweaks/issues/1801) (bookkeeping commits invalidate the pass stamp) and [#1836](https://github.com/thomasholknielsen/claude-tweaks/issues/1836) (QA runs every story with no affected-story scoping) — both become slices of Phase 2 below rather than separate fixes. Route to `/claude-tweaks:specify`, never to `/superpowers:writing-plans` directly.

## Problem

A dispatched file-overlap group costs 78–105 minutes of agent wall-clock across its two Task calls (measured on plugin 6.114.1, `autonomy: unattended`, `integration-model: pr-first`, `merge-verification: merge-when-green`). Half to two-thirds of that is verification and review the pipeline repeats **by shape, not by need**:

| Repeated cost | Group A (code, 5 tasks, standard) | Group B (docs-only, fast-lane) |
|---|---|---|
| Full test suite runs (~6 min each) | 3 runs: SDD's whole-branch reviewer, build Common Step 5 (with one overlapping attempt invalidated), the second call's auto-inserted `test` | 4 runs: the above plus one flaky suite retried as a full run three times |
| Whole-branch review + fix wave + re-review inside the build call | ~13 min | ~13 min — unchanged by `fast-lane` |
| Second-call lenses, simplify, design review | ~12 min | ~12 min |
| Sequential SDD task loop | ~26 min (5 tasks) | small |
| Groups per session | 1 | 1 |

`ceremony:fast-lane` today trims spec-compliance, cross-spec promise, hindsight, architecture alignment, plan audit, and reflect depth — none of which is where the minutes go.

A second measurement, on this repo (record #1535, a `size:low` single-module CLI fix, dispatched 2026-09-05, from its `events.jsonl` and `decisions.md`), shows the fixed-cost tail dominating once verification is discounted:

| Segment | Min |
|---|---|
| Call 1: plan, 5-task loop, whole-branch review (Opus), test | 25 |
| Call 2: run-dir adoption, freshness probe, Manifesto render, auto-inserted suite run, change analysis — before review's first judgment | 24 |
| Review, including a second full suite run after simplify | 8 |
| Reflect, full mode | 12 |
| Wrap-up: residue sweep, unblocked search, merge-check, oversight floor, size probe, PR refresh, merge, console, ledger, cleanup — ten deterministic probes, each its own model turn | 15 |

Wrap-up plus reflect (27 min) exceeds every verification run combined. Phases 1–4 address the verification half; Phase 7 addresses this tail.

### Where the repeated cost actually comes from (root causes, not symptoms)

1. **The second call re-runs the suite because of a context-carrying rule, not an isolation rule.** `flow/steps-and-gates.md`'s "Auto-insert `test`" puts a `/claude-tweaks:test` step in front of `review`; that step's only skip signal is `VERIFICATION_PASSED`/`VERIFICATION_SHA`, which live in the *first* call's conversation and never cross the two-call boundary by design (`dispatch/task-prompt.md`: "This call's prompt names ONLY the record number(s) and the `PIPELINE_RUN_DIR` path"). The durable pass stamp (`claude-tweaks-verify-pass`) is read only by `/review` Step 1.5's *standalone* branch, which the in-pipeline branch never reaches. What #296 actually asked of the second call is to **re-derive its verdict from raw artifacts** ("the actual diff, the actual test-output log in the run directory") — `bin/lib/dispatch/artifact-verdict.js` is the structural half of that guarantee and it *reads a file*; it does not re-execute anything.
2. **The build call runs the suite twice on its own.** superpowers' `subagent-driven-development` (SDD) final whole-branch reviewer "runs the full suite unconditionally by contract" (`[IL-120]`), and build's Common Step 5 then runs it again as the producer of `VERIFICATION_PASSED`. Overlapping background/foreground verify attempts add a third partial run.
3. **The stamp is a SHA-equality test, not a diff test.** Any commit — a ledger row, a `work/*-spec.md` materialization — invalidates it (#1801). The rule inherits `[IL-120]`'s lesson (a markdown edit tripped a size-ceiling test in an unrelated suite), which is *correct for this repo* because `plugin/skills/**/*.md` is under test — and wrong for a project whose docs no suite reads. No file-type heuristic can tell those apart; only the project can.
4. **A flake costs a full run.** `test/verification.md`'s flake adjudication re-runs the failed file in isolation, but the stamp may be written "only when the runner exits 0 for the full resolved check set" — so an adjudicated flake cannot stamp and the agent runs the whole suite again. The adjudication is also agent-performed, not runner-performed.
5. **Nothing records phase durations.** `events.jsonl` has `skill_invoked` and `commit` events with timestamps but no verify event, no step boundary, no PR event; `spec-status --phase` accepts a phase and drops it (`bin/lib/flow/manifest.js` uses it only for the banner string).

## Non-Goals

- Changing what `/review` Step 3 (the lens-based code-quality read) does or when it runs. It is "the safety-relevant judgment this whole scheme protects" (`review/code-mode-steps.md`) and stays effort-tiered, never ceremony-skipped.
- Collapsing the two Task calls into one. Evaluated and rejected in Phase 4's "Decision: keep two calls" — the property lost is exactly the one fast-lane needs most.
- Parallel SDD implementers. Evaluated and deferred in "Deferred: parallel SDD implementers" — the mechanism the issue assumes exists does not, and three incident classes plus this repo's own Frontier-singleton rule depend on SDD staying sequential.
- Moving the ledger out of the repo tree (#1801's option b). A contract change touching every ledger consumer, made unnecessary by Phase 2's bookkeeping classification.
- Making `verify.js` read `.claude-tweaks/policy.yml` or CLAUDE.md. Its Option A boundary stands: command resolution stays caller-side. Phase 2's declaration file is an explicit input the caller names on the command line, not policy the runner discovers.

## Classification of the three repeated costs (question 1)

| Mechanism | Introduced to prevent | Load-bearing? | Cheaper mechanism with the same guarantee |
|---|---|---|---|
| **(a) Second call's independent re-run of types/lint/full suite** | Nothing — no incident introduced it. The two-call split (#296, `_shared/subagent-output-contract.md` § "A dispatch you cannot reproduce is a dispatch you cannot trust") prevents *echo*: an agent handed the builder's conversation confirms the builder's conclusions (`[IL-07]`: a fork echoed the parent's status message as its result; `[IL-130]`: a fork silently self-substituted for the pipeline's separate skill invocations). The re-run is a side effect of `/flow`'s auto-insert rule meeting a context boundary. | **Accidental.** The guarantee is "the verdict comes from the artifact, not the claim." A runner-written, SHA-bound, scope-labelled stamp plus `report.json` *is* the artifact. | Phase 1: `verify.js` writes the stamp itself (also closing #1784); `/test`'s Skip-if-recent and `/review` Step 1.5 read that stamp in the pipeline branch too. Under `pr-first` + `merge-when-green`, hosted CI is the truly independent execution before merge — the local second run never was. |
| **(b) SDD whole-branch review + fix wave + re-review inside build, before the second call's lens review** | A recurring class: cross-task invariants that task-scoped review cannot see by construction — producer/consumer shape mismatches (`[IL-04]`), orphaned files after renames (`[IL-10]`), promise/executor pairs across files (`[IL-02]`), a Critical that shipped as v6.48.1 because the review ran after the bump (`[IL-97]`), prose-vs-module disagreement (`[IL-101]`), plus `[IL-15]`, `[IL-17]`, `[IL-18]`, `[IL-24]`, `[IL-56]`, `[IL-60]`, `[IL-65]`, `[IL-118]`, `[IL-126]`, `[IL-132]`, `[IL-136]`, `[IL-143]`. | **Load-bearing for multi-task plans.** For a single-task plan it is provably redundant: the task review's diff *is* the whole branch. Its own full-suite run is redundant with build Common Step 5 in every case (`[IL-108]`: keep slow shared-resource work in the controller). | Phase 1: instruct the reviewer not to run the suite (build already owns that via `dispatch.md`'s invocation instruction, the same seam that pins its model). Phase 4: under `fast-lane` with a single-task plan, skip the whole-branch review; multi-task plans keep it at every tier. |
| **(c) "Stamp invalidated by any new commit"** | No incident. Shipped in v6.97.0 to replace commit archaeology in `/review` Step 1.5. Its fail-closed posture inherits `[IL-120]` ("any edit that grows a file's size, changes its cross-referenced content, or touches a shared fixture can trip an assertion that lives nowhere near the file the spec discusses") and `[IL-140]` (two specs' insertions jointly breaching a size ceiling, invisible to each spec's own scoped checks). | **Load-bearing as the default; accidental in its refusal to consult the diff.** Fail-closed on unknown paths is right. Treating a ledger append identically to a source edit is not a guarantee — it is the absence of a rule. | Phase 2: the stamp becomes a SHA-anchored assertion consulted *with* `git diff --name-only {stamped-sha}..HEAD` classified against a project-declared scope map. Bookkeeping paths are just the class the project maps to "no suite reads this." Unmatched paths stay full — the default is unchanged; only declared paths get cheaper. |

Guarantee statement for the whole design, checked in every phase below: **a merge never happens without a full-set pass on the merged tree by an execution the merging agent did not narrate.** Under `pr-first` + `merge-when-green`/`wait` that execution is hosted CI; under `local-merge` or `merge-verification: off` it is build Common Step 5's full run, which no phase here scopes.

## Data / API surface shared by the phases

### `.claude-tweaks/verify-scope.json` (new, project-declared, tracked)

JSON rather than YAML because `.claude-tweaks/policy.yml` is read by a flat-line parser that cannot express a map, and adding a YAML dependency for one file is not worth it. `/claude-tweaks:init` generates a starter (Phase 2), the project edits it. Example for a pnpm workspace:

```json
{
  "checks": {
    "types": "pnpm typecheck",
    "lint": "pnpm lint",
    "tests": {
      "api": "pnpm --filter api test",
      "web": "pnpm --filter web test"
    }
  },
  "retry": { "api": "pnpm --filter api test -- {file}", "web": "pnpm --filter web test -- {file}" },
  "rules": [
    { "match": "apps/api/**",         "suites": ["api"],   "static": true  },
    { "match": "apps/web/**",         "suites": ["web"],   "static": true  },
    { "match": "packages/shared/**",  "suites": "*",       "static": true  },
    { "match": "docs/**/*.md",        "suites": [],        "static": false },
    { "match": "docs/plans/*-ledger.md", "suites": [],     "static": false },
    { "match": ".claude-tweaks/pipelines/**", "suites": [], "static": false }
  ],
  "flaky": { "files": ["apps/api/test/mailer.test.ts"], "maxRetries": 1 }
}
```

- `checks.tests` may be a single string (single-package repo: `"tests": "npm test"`) or a map of named suites.
- `rules` are evaluated per changed file; the run's check set is the **union** over all changed files. `"suites": "*"` means every suite; `[]` means no suite reads this path; an unmatched file resolves to `"*"` with `static: true` (fail-closed, `[IL-120]`).
- `static` gates types + lint; they run when any changed file has `static: true` or is unmatched.
- Monorepos may delegate dependency-graph scoping to the workspace tool instead of path rules: `"tests": "pnpm --filter \"...[{base}]\" test"` with `{base}` substituted by the runner. The stamp records `mode: tool-scoped` and the base in that case.
- Starter for this repo: `plugin/skills/**/*.md → "*"` (prose is under test), `docs/plans/*-ledger.md → []`, `.claude-tweaks/pipelines/** → []`. Nothing else declared, so everything else stays full.

### Runner-written pass stamp (replaces the bare-SHA `claude-tweaks-verify-pass`)

`$(git rev-parse --git-dir)/claude-tweaks-verify-pass.json`, written only by `verify.js`, only on a passing run:

```json
{
  "sha": "abc123",
  "dirty": false,
  "scope": "full" | "scoped" | "static-only" | "none",
  "fullSha": "abc123",
  "base": null,
  "changedFiles": [],
  "suitesRun": ["api", "web"],
  "flakyRetried": [],
  "reportPath": ".git/worktrees/x/claude-tweaks-verify/report.json",
  "at": "2026-09-05T14:07:09Z"
}
```

- `scope: full` ⇒ `fullSha == sha`. `scope: scoped`/`static-only` ⇒ `fullSha` is the SHA of the last **full** pass this scoped run built on, and `base == fullSha`.
- **Anchoring invariant:** scope selection for any later run always diffs against `fullSha`, never against the last scoped `sha`. Scoped runs therefore never chain into unbounded drift; the set "verified only by scoped runs" is always exactly `fullSha..HEAD`, and it is what a consumer sees when it decides.
- **Expand-contract:** for one minor release the runner writes both the old bare-SHA file and the JSON; consumers read JSON first, fall back to the bare file only when the JSON is absent; the bare file is removed the release after, recorded in `_shared/policy-deprecations.md`'s style.

### Shared changed-file set

`bin/lib/verify/changed-files.js` — one function returning `{base, files}` for the run: `git diff --name-only {base}..HEAD` unioned with the working tree (`git status --porcelain`), where `{base}` is the stamp's `fullSha` when present, else the run's merge-base against the integration branch (`_shared/integration-branch.md`'s ladder, the same base `blast-radius-cli.js` resolves). Consumed by `verify.js` scope selection, `/test`'s QA story filter (#1836), and `/test affected`. `ceremony-derive.js`'s `computeDiffFacts` keeps its own `git diff --numstat` input but reads the same base.

## Phase 1 — Trust the runner's artifact: no re-execution when the tree is unchanged

**Cost shed per group:** Group A ≈ 20 min (second-call re-run ~10, SDD reviewer's suite ~6, one invalidated overlapping attempt ~4–6); Group B ≈ 16 min. **Risk:** low — every change is mechanical and fail-closed; nothing is skipped on a tree the runner has not seen.

### Deliverables

1. **`verify.js` writes the stamp** (`bin/lib/verify/stamp.js`): on exit 0 for the full resolved set, write the JSON stamp above with `scope: full`; also write the legacy bare-SHA file this release. Agents never write either file again — `test/verification.md` Step 2.5 becomes "the runner stamps; a targeted run never stamps" (closes #1784).
2. **`verify.js` resolves its own log and stamp paths**: `--log-dir` and `--count-stamp` default to `{git-dir}/claude-tweaks-verify` and `{git-dir}/claude-tweaks-test-count.json`, resolved inside the runner. The canonical invocation in `verification.md` Step 2 drops both `$(git rev-parse --git-dir)` substitutions — the worktree Bash guard refuses two independent `$(...)` in one command (`_shared/scratch-worktree.md` § 7), which is why "checks run as separate commands" today. The `--cmd` values were never the trigger.
3. **`/test` Skip-if-recent reads the stamp when the conversation signal is absent.** New rule in `verification.md`: if `VERIFICATION_PASSED` is unset, read the JSON stamp; if `sha == HEAD`, `dirty == false`, and `scope == full` → skip with `Verification skipped — runner stamp {sha} (full) matches HEAD; report: {reportPath}`; log an `AUTO` decision. Any other state → run (full in this phase; per Phase 2's scoping rule once it ships). Same read added to `/review` Step 1.5's pipeline branch as a belt-and-braces check (the standalone branch already reads it).
4. **`dispatch/task-prompt.md` second call** gains one sentence: "A runner-written pass stamp matching HEAD is the raw artifact `artifact-verdict.js` describes — read it and its `report.json`; re-execute only when it does not match." The "re-derive from raw artifacts" CRITICAL paragraph is unchanged.
5. **SDD's whole-branch reviewer does not run the suite.** `build/dispatch.md`'s invocation instruction (the seam that already pins the reviewer's model) adds: the reviewer reviews the diff and may run the focused tests it names, but must not run the full suite — Common Step 5 runs it once, after the review's fix wave, and is the producer of the stamp. `[IL-120]`'s guarantee moves one step later in the same call; it does not weaken.
   **Pin the upstream step this instruction targets.** `tools/upstream-drift/manifest.yml` pins four SDD literals but not the final whole-branch review dispatch — the one step this deliverable and Phase 4 both instruct. Add an assertion on SDD's `SKILL.md` for that step's literal, so an upstream rename fails a drift check instead of silently turning both instructions into no-ops (the manifest's own motivating failure shape).
6. **Foreground verification, stated once.** `verification.md` Step 2: "Run the runner in the foreground of the calling agent; never `run_in_background`, never start a second attempt while one is running." Folds in #1904's "first call stalled waiting on a background verify child's notification" — `[IL-108]`'s family, where a wait placed before an obligation hands the agent a stopping point that is not done.

### Guarantee preserved / weakened

- Preserved: the second call's verdict derives from a runner-written artifact bound to the exact SHA it reviews; any commit or dirty tree still forces a run. Under `pr-first` + `merge-when-green`, hosted CI remains the independent execution before merge.
- Weakened: none. Accepted boundary, stated for the record: an agent that can write files can fabricate a stamp, exactly as it could fabricate the TAP file `artifact-verdict.js` reads today. The contract's threat model is echo and contamination, not an adversarial builder; CI is the control for the latter.

### Measurement

Per group, from `timing.json` (Phase 6) or reconstructed from `events.jsonl` as #1904 did: **full-suite runs per group = 1** for a clean standard run (was 3), and the second call's `test` step logs the skip decision. Group A target ≤ 85 min.

### Key Files

`plugin/bin/verify.js`, `plugin/bin/lib/verify/args.js`, `plugin/bin/lib/verify/stamp.js` (new), `plugin/skills/test/verification.md`, `plugin/skills/test/SKILL.md`, `plugin/skills/review/code-mode-steps.md`, `plugin/skills/dispatch/task-prompt.md`, `plugin/skills/build/dispatch.md`, `plugin/skills/build/SKILL.md` (Common Step 5 note), `tools/upstream-drift/manifest.yml`, `tests/bin-lib/verify/`, `docs/skill-graph.md`.

## Phase 2 — Diff-aware verification scoping (subsumes #1801 and #1836)

**Cost shed per group:** Group B: every re-verification after the one full Common Step 5 run becomes static-only (~5 min each; B had two beyond Phase 1's savings); multi-spec runs save ~5 min per spec boundary (#1801); infra records with a story library save the whole QA walk (#1836, 0–9 min). Group A: polish and review-fix re-verifies drop from full to the touched packages' suites in a monorepo (~4 min). **Risk:** medium — a wrong declaration under-verifies. Mitigations: unmatched paths are full; the first pass of every run is full; scoped runs anchor to `fullSha`; the stamp names its scope so nothing downstream can mistake scoped for full.

### The mechanical rule (`bin/lib/verify/scope.js`, pure, unit-tested)

Input: the declaration, the changed-file set, the current stamp. Output: `{mode, suites, static, base, unmatched}`.

1. If no `verify-scope.json` exists → `mode: full` (today's behavior, byte-for-byte).
2. Compute `{base, files}` per the shared changed-file set (base = stamp `fullSha` if present, else merge-base).
3. Classify each file by the first matching rule (minimatch semantics, repo-relative). Unmatched → `{suites: "*", static: true}` and is listed in `unmatched` so the report can say so.
4. `suites` = union; any `"*"` ⇒ every suite. `static` = any file with `static: true` or unmatched.
5. `mode` = `full` if every suite is selected and static is true; `static-only` if `suites` is empty and static is true; `none` if `suites` is empty and static is false; else `scoped`.
6. **`none` runs nothing but still stamps** — `scope: none`, `suitesRun: []`, `fullSha` unchanged — so the decision is on record and a later consumer can see that only bookkeeping moved since the last full pass. The decisions log line names every changed path and the rule it matched.

**Where scoping applies and where it never does:**

| Verification site | Mode |
|---|---|
| Build Common Step 5 (first pass of the run, producer of the stamp) | **Always full.** `[IL-120]`'s contract is unchanged; this is the one local execution the merge guarantee rests on under `local-merge`/`off`. |
| Second call's auto-inserted `test` (after Phase 1, only when HEAD moved) | scoped against `fullSha` |
| Polish re-verify (`/test skip-qa`) | scoped |
| Review-fix re-verify (`/review` Step 3 Routing's fix-now commits) | scoped |
| Multi-spec per-spec test gate (#1801's case) | scoped — a ledger-only delta resolves to `none`, logged as `still-verified: bookkeeping-only delta ({paths})` |
| Standalone `/claude-tweaks:test` with no arguments | full (a human asked for the suite) |
| `/claude-tweaks:test affected` | redefined to the shared changed-file set (`base..HEAD` ∪ working tree), not bare `git diff --name-only` — today's definition is empty for every committed pipeline diff |

**QA story scoping (#1836):** in pipeline context, `/test` filters stories whose `source_files` intersect the shared changed-file set (exact path match, as today's `qa affected`). Zero matches + a non-frontend `surface:` header or zero UI trigger files (`design-wrapper/frontend-detection.md` Layer 2/3) → `QA: skipped — no affected stories` with `TEST_PASSED=true`, the same shape as the visual-review and design-gate skips. Zero matches on a frontend surface → still run the full story set (a new UI story may not have `source_files` yet). Never silently: the skip is a logged `AUTO` decision naming the changed files and story count considered.

**`/claude-tweaks:init` generates the starter declaration**: from `pnpm-workspace.yaml`/`workspaces` (one rule per package → its own suite, shared packages → `"*"`), from `package.json` scripts for single-package repos, and always the bookkeeping rules. `init --update` reports drift between the declaration and the workspace list.

### Guarantee preserved / weakened

- Preserved: no path a project has not explicitly classified is ever verified by less than the full set; the run's first pass is always full; a scoped stamp can never be read as a full one; under `pr-first` CI still runs everything before merge.
- Weakened: for the re-verification sites, a wrong `[]` or wrong suite mapping under-verifies the delta between `fullSha` and merge — bounded by (a) the declaration being reviewed like code (tracked, generated, drift-reported), (b) CI under `merge-when-green`/`wait`. Under `local-merge` with `merge-verification: off` the project accepts that exposure by declaring the map; the starter never maps a source path to `[]`.

### Measurement

Group B: full-suite runs per group = 1, every later verify event `mode: static-only` or `none`; target ≤ 45 min before Phase 3/4. #1801's reproduction (two-record docs-only bundle): verify events per run drop from 3 full to 1 full + 2 `none`. #1836's reproduction: `QA: skipped — no affected stories` with zero browser sessions opened.

### Key Files

`plugin/bin/lib/verify/scope.js` (new), `plugin/bin/lib/verify/changed-files.js` (new), `plugin/bin/verify.js`, `plugin/skills/test/verification.md`, `plugin/skills/test/SKILL.md` (Pipeline behavior table, `affected`, QA affected filtering), `plugin/skills/flow/multi-spec.md`, `plugin/skills/flow/steps-and-gates.md` (re-verify row), `plugin/skills/init/` (detection + generated file), `plugin/skills/_shared/policy-schema.md` (documents the file's existence next to `policy.yml`), `docs/plugin-structure.md`, this repo's own `.claude-tweaks/verify-scope.json`.

## Phase 3 — Runner-owned flaky retry allowlist

**Cost shed per group:** Group B ≈ 18 min (three full reruns → three single-file reruns of ~10 s each); any group on a project with an intermittent suite saves one full run plus the agent's deliberation per flake. **Risk:** low–medium — the allowlist is file-path-exact and the runner enforces every rule below mechanically.

### Mechanism (`bin/lib/verify/flaky.js`)

Declared in `verify-scope.json`'s `flaky` section: `files` (repo-relative test file paths, exact), `maxRetries` (default 1, ceiling 2). `retry` maps each suite name (or the single `tests` check) to a per-file command template with `{file}`.

On a `tests` check failure the runner:

1. Extracts the failing test **file paths** from the log (`extract.js` already sniffs the runner family; node `--test` and vitest both print paths). No parse → no retry, ordinary failure.
2. If **every** failing file is in `flaky.files` → re-run only those files with the `retry` template, once each (up to `maxRetries`). All pass → the check is `pass (flaky-retried: [files])`; `report.json` and the stamp carry `flakyRetried`; a `CAVEAT:` line renders under the table exactly like the count-regression caveat; the decisions log gets an `AUTO` entry naming the files.
3. If **any** failing file is not allowlisted → fail, no retry at all. A real regression in an unlisted file can never hide behind a listed one, and a listed file that fails its retry fails the run.
4. `types`/`lint` are never retried (deterministic).

**Keeping the list honest:** the count-stamp file gains `flakyHits: {file: n}`; when a file's hit count reaches 5 the CAVEAT line escalates to `flaky-allowlist: {file} retried 5 times — file a fix or remove it from the allowlist`, which wrap-up's Phase 3 leftover routing turns into a backlog record via the normal materiality floor. No policy lever; the numbers are stated constants.

**Replaces** `verification.md`'s agent-performed "Flake adjudication" section: the runner does the isolated rerun; the agent reports what the runner recorded. A failure in a file that is *not* allowlisted still gets the existing "isolate by file path, not keyword grep" diagnosis, but no automatic retry — the agent proposes adding the file to the allowlist as a staged patch if the isolated rerun passes, never adds it silently.

### Guarantee preserved / weakened

- Preserved: a failing file outside the list fails the run; the stamp records every retry; the retried file re-ran the same command family in isolation, which is the adjudication the skill already prescribes.
- Weakened: a listed file's genuine regression is masked once per run if it happens to pass on retry. Bounded by exact-path listing, the hit counter, and the CAVEAT that renders on every retry.

### Measurement

Group B target: 1 full run + N single-file reruns; wall-clock ≤ 30 min after Phases 1–3. `flakyRetried` non-empty on every run that previously showed 2+ full runs with identical SHAs.

### Key Files

`plugin/bin/lib/verify/flaky.js` (new), `plugin/bin/lib/verify/extract.js` (failing-file extraction per family), `plugin/bin/lib/verify/count-stamp.js`, `plugin/bin/verify.js`, `plugin/skills/test/verification.md`, `plugin/skills/wrap-up/SKILL.md` (Phase 3 leftover row), `tests/bin-lib/verify/`.

## Phase 4 — A fast lane that sheds cost

**Cost shed per group (fast-lane records only):** Group B ≈ 13 min (whole-branch review + fix wave, single-task plan) + 0–5 min (polish). **Risk:** medium — `[IL-145]` is the one recorded case where a fast-lane skip (Step 1 Spec Compliance) let a defect through; every new skip below is either provably equivalent to a check that still runs or has an escape hatch.

### What fast-lane skips (new), and why each is safe

| Skip | Condition | Why the guarantee holds |
|---|---|---|
| SDD's final whole-branch review (and its fix wave / re-review) | `ceremony-profile: fast-lane` **and** the plan has exactly one task (or one batched dispatch) | The task review's diff is the whole branch; every cross-task incident in the (b) cluster needs ≥2 tasks. Multi-task fast-lane plans keep the review. Instructed via `build/dispatch.md`'s invocation seam, logged as a `SKIP` decision. |
| `polish` step | `ceremony-profile: fast-lane` | Polish is refinement (Impeccable polish/clarify/harden), not correctness; on a fast-lane record it can modify code and trigger a re-verify. `/test`'s deterministic Design CLI gate still runs. `/review` Step 6.5 (design quality, read-only) still runs, so a design finding still reaches the escape hatch. |
| Second-call re-verification | already gone for every tier after Phase 1 | — |

### What fast-lane must never skip (roster, stated once)

`/review` Steps 2, 3, 5 and Step 6's rendered-UI check on a UI surface (CLAUDE.md's merge precondition is surface-driven, not ceremony-driven); build Common Step 5's full run; reflect's Near-misses/Fresh-start/Friction lenses; the ceremony escape hatch; `[IL-116]`'s cleanup floor; every HARD-GATE. New in this phase: `_shared/ceremony-profile.md` becomes the single roster of every skip each profile makes and every step no profile may skip — today that table is reconstructed from `review/code-mode-steps.md`, `build/architecture-alignment.md`, `build/SKILL.md`, `wrap-up/SKILL.md`, and `wrap-up/ceremony-derivation.md`. Each consumer cites the roster; `tests/` pins that every skip named in a skill appears in the roster.

### Header / policy expression

No new header field and no new label: `ceremony:` on the record and `ceremony-profile` in `config.yml` already carry the tier. The only new lever is the roster file. The escape hatch's downgrade path is unchanged and now covers the new skips: a review finding at any severity or a reflect safety finding sets `standard` for the rest of the run — which, because polish and the whole-branch review already ran or were skipped by then, is documented as "the next run of this record runs standard," exactly as `wrap-up/SKILL.md` already states for build-side skips.

### Decision: keep two calls

Collapsing the two Task calls for fast-lane records would save only the second call's preflight (~5 min of Group B's ~15 min pipeline overhead — the rest is first-call materialize/claim/PR-early work that a single call still does). What it would lose is the clean-room review: the same agent that built the change would review it with its own framing intact, the `[IL-07]`/`[IL-130]` echo shape. Fast-lane records are where the spec-compliance and hindsight checks are already off, so the independent lens review is the *last* judgment standing; it is the wrong place to remove independence. The adversarial property lost by collapsing is exactly "N agents are independent evidence rather than N echoes" (`_shared/subagent-output-contract.md`) — and it is lost for the records with the fewest other checks.

### Measurement

Group B target ≤ 25 min end-to-end after Phases 1–4 (from 78). Standard-tier groups unchanged by this phase.

### Key Files

`plugin/skills/_shared/ceremony-profile.md` (new roster), `plugin/skills/build/dispatch.md`, `plugin/skills/flow/steps-and-gates.md` (polish row), `plugin/skills/flow/SKILL.md`, `plugin/skills/review/code-mode-steps.md`, `plugin/skills/wrap-up/SKILL.md`, `plugin/skills/wrap-up/ceremony-derivation.md`, `docs/skill-graph.md`, `docs/decisions/0006-ceremony-tiering-owned-by-specify.md` (amend, not rewrite).

## Phase 5 — Multi-session drain (throughput, not per-group cost)

**Cost shed:** none per group; throughput scales with the number of top-level sessions (2 sessions → a 15-group drain in roughly half the wall-clock). **Risk:** medium — machine load, not correctness.

### Recommendation: N top-level sessions, each running `/claude-tweaks:dispatch #N` (or a bare drain)

This is the shape every existing invariant already assumes — one session, one worktree, one run — so nothing structural changes. What already prevents collision, verified against the code:

- **Double builds:** claims (`_shared/issue-claims.md`, CAS on `claims-registry`) plus the sibling-session check (`dispatch/sibling-session-check.md`, `[IL-107]`) — unpushed live work in another worktree is visible via the worktree lock's pid.
- **Worktree reaping:** `bin/lib/hooks/worktree-reap.js` fails closed on a locked worktree or a live pid; a sibling session's worktree is never reaped from under it.
- **Dev-server ports:** `port-services` (#1791/#1792) leases a distinct 10-port block per checkout and writes it to `.env.local` — already solved.
- **Rate limits:** `_shared/github-rate-limit.md` classifies and backs off per call; N sessions multiply calls linearly, and the queue-order cache design (#1546) removes most of a firing's pull cost.
- **Reconcile:** each session's SessionStart sweep is idempotent and every write-side check (`release`, `archive`, `reap`) already tolerates a concurrent twin.

What does not exist yet and is this phase's only deliverable beyond documentation:

1. **Shared test-database isolation hook-point.** The ports registry exports one more managed variable, `CLAUDE_TWEAKS_LEASE` (the block's base port, e.g. `43120`), so a project can key its test database/schema name on it (`DATABASE_URL=...test_${CLAUDE_TWEAKS_LEASE}`) the same way it keys ports. The plugin does not create databases; it gives the project a stable per-checkout token. Documented in `_shared/policy-schema.md`'s `port-services` row and the init-generated CLAUDE.md verification section.
2. **`dispatch/sequential-execution.md` gains a "Running more than one session" section** stating the above, the load caveat (CLAUDE.md's "failure count that varies run-to-run tracks machine load" — Phase 3's allowlist is the mitigation), and the one thing a human must not do: run two sessions from the *same* worktree.

### Why the single-session `cd {worktree} &&` shape (the #447 mechanism) is worse

- It breaks the one-session-one-worktree binding three hook gates depend on: `record-worktree` stamps `{worktree, sessionId}` per run; `checkWorktreeRequired`/`wd-deny` resolve the target from the session's tracked cwd, not the command's `cd` (the research agent for this design hit exactly that refusal); SubagentStop and every `events.jsonl` append attribute to the session's single `ownedRun`, so N concurrent runs' events collapse into one log with `attribution: fallback`.
- The worktree Bash-shape guard refuses most compound commands; prefixing every command with `cd X &&` turns each of the pipeline's already-marginal two-command chains into a refused three-part one.
- It puts N groups' outcomes into one orchestrator's context — the `[IL-130]` shape where the orchestrator quietly substitutes itself — and the harness's lagging background-agent notifications make "waiting on 2N Task calls" a stall surface #1904 already reports once for a single call.
- #447's own scope is a *cwd-pinned* dispatching session running groups **sequentially**; it was never a concurrency mechanism, and it was confirmed only on the failure path.

### Measurement

Wall-clock for a fixed 6-group drain with 2 sessions vs 1; zero `wd-deny`/`wd-foreign-session` events attributable to the other session; flake rate per Phase 3's `flakyRetried` stays under 1 per group.

### Key Files

`plugin/skills/dispatch/sequential-execution.md`, `plugin/bin/lib/ports/env-file.js`, `plugin/bin/lib/ports/ensure.js`, `plugin/skills/_shared/policy-schema.md`, `plugin/skills/init/` (generated verification section), `tests/bin-lib/ports/`.

## Phase 6 — Per-phase timing telemetry (and the events.jsonl noise fix)

**Cost shed per group:** none by construction. **Risk:** low. Ranked last by the ordering rule; it has no dependency on Phases 1–5 and is the cheapest slice, so a maintainer who wants measurement before savings can ship it first — every phase above names it as its measurement source.

### Phase boundaries from events that already exist, plus two mechanical additions

| Phase | Start boundary | End boundary |
|---|---|---|
| `call-1` / `call-2` | 1st / 2nd `skill_invoked` `claude-tweaks:flow` in the run | next call's start, or `session-end` / `close-run` |
| `build` | `skill_invoked` `claude-tweaks:build` | next top-level `claude-tweaks:*` skill event |
| `plan` (within build) | `skill_invoked` `superpowers:writing-plans` | `skill_invoked` `superpowers:subagent-driven-development` |
| `tasks` (within build) | SDD start | first `verify` event of the call (Common Step 5) |
| `test`, `review`, `wrap-up` | `skill_invoked` for `claude-tweaks:test` / `review` / `wrap-up` | next top-level `claude-tweaks:*` skill event; nested skills (`simplify`, `reflect`, `visual-review`, `capture`, `design-wrapper`) attribute to the enclosing phase via a fixed parent map |
| `polish` | the last `skill_invoked` `claude-tweaks:design-wrapper` between `review`'s start and `wrap-up`'s start (review's own Step 6.5 invocation precedes polish's, so the last one is polish's; no such event after review's ⇒ polish skipped, 0 min) | `skill_invoked` `claude-tweaks:wrap-up` |
| `verify` (sub-rows) | **new `verify` event** written by `verify.js` when `--run` is passed: `{mode, suitesRun, durationMs, pass, sha, flakyRetried}` | — |
| `merge` | `commit` event with `action: push` after wrap-up start | `run-state.json` `pr` resolution / `close-run` |

Two mechanical additions: (1) `verify.js --run <dir>` appends the `verify` event through `context.js`'s `appendEvent` — the runner is the only component that knows scope and duration; (2) `spec-status --phase` persists `phase` and a `phases[]` array with timestamps in `manifest.yml` instead of dropping it (multi-spec runs get per-spec phase rows for free).

Limitation stated in the output: `skill_invoked` records model-initiated Skill calls only, so a human-typed `/claude-tweaks:build` is invisible and its phase shows as `unattributed`. Dispatch's two calls are always model-initiated, so dispatched groups — the case #1904 measures — are fully attributed.

### Outputs

- `bin/phase-timing.js --run <dir>` (pure derivation over `events.jsonl` + `manifest.yml`, unit-tested on a frozen fixture) writes `{run-dir}/timing.json` and prints a markdown table.
- `/flow` Step 5's Pipeline Summary and `/wrap-up`'s summary gain a `## Timing` table (phase, minutes, verify rows with mode); under `pr-first` the same table goes into the run's PR comment (`_shared/pr-run-comments.md`).
- The dispatch Reporting section prints one timing line per group.

### Tokens per phase (the second axis)

Minutes and tokens do not move together: the wrap-up tail is model latency over tiny tool results, while procedure loading is tokens that cost money and context headroom but little wall-clock. So the timing report carries both. The session transcript (`~/.claude/projects/{slug}/*.jsonl`) records `usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) on every assistant message with a timestamp; `bin/lib/transcript-judge/` already locates and reads transcripts but does not parse usage. `bin/phase-timing.js` gains `--transcript <path>` (resolved the way `transcript-judge` resolves it; dispatch's two calls have their own agent transcripts): join each message's timestamp to the phase table above and sum per phase into `timing.json`'s `tokens` block, plus two derived columns — **procedure bytes loaded** (sum of `Read` results under `plugin/skills/**` per phase, from the transcript's tool results) and **tool round-trips** per phase. The markdown table gets three extra columns; a missing or unreadable transcript leaves them blank with a one-line note, never fails the summary. Also counted per run: `gate-denial`, `wd-ambiguous`, and `wd-deny` events — each is a wasted turn, and the four filed guard false-positive records (#1785, #1867, #1876, #1894) can then be prioritized by measured cost rather than by anecdote.

### `contract-violation` noise

`bin/lib/hooks/subagent-stop.js` falls back to the parent session's `transcript_path` when `agent_transcript_path` is absent, so it grades the orchestrator's own narration ("waiting on task N", `### Strengths`, `ack`) as a subagent reply. Fix: no fallback — absent `agent_transcript_path` returns `{}`. Measurement: `contract-violation` events per dispatched group drop from ~4 to the true violation count (corpus: 2,471 events, most of this shape).

### Key Files

`plugin/bin/phase-timing.js` (new), `plugin/bin/lib/verify/` (event append), `plugin/bin/lib/flow/manifest.js`, `plugin/bin/lib/hooks/subagent-stop.js`, `plugin/bin/lib/hooks/context.js` (no change — reuse `appendEvent`), `plugin/bin/lib/transcript-judge/` (usage parsing, shared), `plugin/skills/flow/summary-template.md`, `plugin/skills/wrap-up/SKILL.md`, `plugin/skills/dispatch/SKILL.md` (Reporting), `plugin/skills/_shared/pr-run-comments.md`, `docs/hooks.md`, `tests/bin-lib/`.

## Phase 7 — Deterministic-first: fact packs for the fixed-cost tail

**Cost shed per group:** 15–24 min on this repo's runs (wrap-up ten-probe sequence ~8, second-call preflight ~5, reflect full-mode on a small diff ~6, console auto-resolution ~3); on #1904's Group A the corresponding "pipeline overhead" and "polish + wrap-up" rows (~30 min combined) shrink by roughly half. **Risk:** low — every item composes CLIs that already exist and changes no judgment; the model still decides, it just decides once over one JSON instead of ten times over ten tool results.

### Principle

Where a step is a sequence of git/gh/fs reads followed by a judgment, the reads are one CLI invocation returning one JSON document, and the judgment is one model turn. Today each read is its own tool call with a reasoning turn between — a minute of model latency per probe, and every probe's raw output left in context for the rest of the call. This is the same boundary `verify.js` (#892) drew for verification and `build-review-context.js` drew for review: the runner owns execution and bounding, the skill owns judgment.

### Deliverables

1. **`bin/wrap-up-facts.js --run <dir>`** — runs, concurrently, the deterministic inputs wrap-up's Phase 3 and Phase 4 consume today one at a time: `residue.js --scope blast-radius`, the newly-unblocked issue search, `blast-radius-cli.js` (merge-check inputs and the oversight-floor comparison), `merge-size-probe.js`, PR state (`gh pr view --json state,isDraft,mergeStateStatus,statusCheckRollup`), release status, claim-blob state, and the ledger's open-item count. Emits one JSON with a per-probe `{ok, value | error}` envelope — a probe failure degrades that field, never the pack (the `verify.js` fail-safe-per-check pattern). `wrap-up/SKILL.md` Phases 3–4 read the pack once; the `assess-agent-autonomy merge-check` LLM call keeps its own dispatch but takes its inputs from the pack. Every existing decision-log line still gets written, from the pack's values.
2. **`bin/flow-preflight.js --run <dir> --steps <list>`** — the second call's pre-review facts in one call: run-dir adoption case (1–5 from `steps-and-gates.md`), `check-resume-freshness`, `check-staged-inventory`, `config.yml` levers for the FYI table, `work/{n}-spec.md` presence, PR record and checklist state, current stamp (Phase 1), and the shared changed-file set (Phase 2). `/flow` Step 3 renders the Manifesto FYI from the pack and proceeds; the adoption-case note lines are unchanged in wording.
3. **Reflect depth from diff facts on every `auto`-mode firing.** `wrap-up/ceremony-derivation.md`'s gate — skip unless `DISPATCH_HEADLESS=1` — exists because a present human "could adjust the Manifesto's `ceremony-profile` lever." In `auto` mode the Manifesto is an FYI table and nobody adjusts it. New condition: apply the derivation whenever the run's `auto-mode` is `auto` (headless or human-present), skip only under `confirm`/`hybrid` where the lever was actually a question. The derivation's own rules (never upgrades; escape hatch still runs after) are unchanged.
4. **Batch console auto-resolution.** At `autonomy: unattended` with `consoleAutoResolve`, the Review Console resolves each staged item in its own turn (render, log, write). New: `bin/stage-item.js resolve-all --run <dir> --policy console-auto` applies the contract's stance to every staged item in one process, writes one decisions block with one line per item, and prints the table the console would have rendered. The console then renders that table once. `supervised`/`trusted` are unchanged — a human still answers.

### Guarantee preserved / weakened

- Preserved: identical decision-log entries, identical judgments, identical gates; a probe that fails is reported as failed in the pack rather than silently absent (each pack field carries its own `ok`).
- Weakened: none. The accepted trade is that a pack runs probes the model might have skipped after an early finding (a residue sweep on a run whose merge-check already said no) — seconds of CLI time against minutes of turns.

### Measurement

From Phase 6's `timing.json`: `wrap-up` tool round-trips per run drop from ~25 to under 10; `wrap-up` + `reflect` minutes on a `size:low` record drop from 27 to under 12; second-call time-to-first-review-judgment drops from 24 to under 10 min (with Phase 1's suite skip). Token column: wrap-up input tokens drop by the probe outputs no longer resident across turns.

### Key Files

`plugin/bin/wrap-up-facts.js` (new), `plugin/bin/flow-preflight.js` (new), `plugin/bin/lib/wrap-up/`, `plugin/bin/lib/residue/`, `plugin/bin/lib/blast-radius-cli.js`, `plugin/bin/lib/merge-size-probe.js`, `plugin/bin/lib/stage-item/`, `plugin/bin/lib/hooks/resume-freshness.js`, `plugin/bin/lib/hooks/staged-inventory.js`, `plugin/skills/wrap-up/SKILL.md`, `plugin/skills/wrap-up/review-console.md`, `plugin/skills/wrap-up/ceremony-derivation.md`, `plugin/skills/flow/SKILL.md`, `plugin/skills/flow/steps-and-gates.md`, `plugin/skills/flow/manifesto.md`, `tests/bin-lib/wrap-up/`, `tests/bin-lib/flow/`.

## Filed separately (not phases of this doc)

Evaluated in the same brainstorm and worth their own evidence before earning a slot; each is a backlog record rather than a phase because its return is unmeasured or its risk is judgment-shaped:

- **Instruction-prose diet** (#1909) — operative skill text states the rule and the IL tag; provenance narrative moves to the incident log and decision records; a per-pipeline-step loaded-bytes budget joins the context-cost test. Tokens, not minutes. Companion to #1765 (fast-lane digest).
- **Fast-lane bundling** (#1910) — dispatch packs up to three non-overlapping fast-lane records into one multi-spec run to share one preflight and wrap-up; bounded by `[IL-109]`.
- **Micro-plan for single-file fast-lane records** (#1911) — build composes a one-task brief instead of invoking `writing-plans` and plan audit.
- **Model tier by diff facts** (#1912) — a diff-size ceiling in `resolve-profile.js` so a 20-line diff's whole-branch review does not resolve to Capable by label alone.

## Deferred: parallel SDD implementers

The issue assumes "the overlap check that already exists in subagent-driven-development" can gate parallel implementers. It cannot: SDD's pre-execution scan ("one row for every pair of tasks that share a file or an interface") produces *rulings for sequential execution*, and the skill states "Never dispatch multiple implementation subagents in parallel (conflicts)." Three things depend on that staying true:

- `[IL-43]`: file-disjoint parallel implementers still race on the worktree's single git index; `[IL-51]`'s cure is edit-only agents with every git operation run centrally — a different implementer contract than SDD's (implement, test, commit, self-review).
- `[IL-108]`: keep slow shared-resource work in the controller; parallel implementers each running focused tests multiply exactly the load that makes flakes unattributable.
- This repo's own Frontier-singleton rule (`_shared/subagent-output-contract.md`; `build/dispatch.md`'s `profile=frontier` precondition) is satisfied *only because* SDD is sequential.

The measured gain is bounded: ~26 → ~14 min on a 5-task plan, and only when tasks are truly file-disjoint *and* later tasks do not read earlier tasks' outputs — uncommon in this repo's plans. Decision: do not override a third-party skill's explicit rule from an invocation instruction. File the idea upstream to superpowers (`/claude-tweaks:feedback`'s upstream-feedback batch) as "edit-only parallel implementers for declared-disjoint tasks, controller commits per task", and revisit after Phase 6 shows the task loop as the dominant remaining cost.

## Alternatives considered

- **Skip the second call's `test` by threading `VERIFICATION_PASSED` through the context pack.** Rejected: #1542 bounds the pack to "environment facts and tool signatures only — never a prior call's conclusions (test results, verdicts)". A runner-written stamp is an artifact; a pass flag in the prompt is a claim.
- **Downgrade to typecheck + lint whenever no "source" file changed, by file extension.** Rejected: `[IL-120]` and `[IL-140]` are both markdown-triggered failures in this repo. Only the project can say which paths no suite reads (Phase 2's declaration, fail-closed).
- **Scope build Common Step 5 (the first pass) too, when CI is authoritative.** Deferred: a `verify-first-pass: full|scoped` lever would save one more full run on docs-only diffs under `merge-when-green`, at the cost of the one local full execution the `local-merge`/`off` guarantee rests on. Revisit with Phase 6 numbers; the lever is a one-line addition to `scope.js` if wanted.
- **Flaky retry by test-name regex.** Rejected: file paths are what every runner family prints and what the isolation rerun already keys on; a regex invites listing a whole suite.
- **A `phase` event skills must emit at every step boundary.** Rejected: agent-invoked bookkeeping is forgotten under load; the two mechanical sources (skill events, runner event) plus one persisted field already bound every phase.

## Open questions for `/specify`

- Whether `verify-scope.json`'s `rules[].match` should use the same glob library as the tidy/residue probes or a minimal `**`/`*` matcher of its own — decide at plan time by what `plugin/bin/lib` already depends on.
- Whether Phase 4's single-task condition should read the plan file's task count or SDD's own progress ledger — the plan file is authoritative and already parsed by `build/plan-audit.md`.
