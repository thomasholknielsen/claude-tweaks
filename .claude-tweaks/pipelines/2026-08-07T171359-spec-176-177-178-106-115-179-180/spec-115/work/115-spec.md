---
record: 115
origin: human
risk: low
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 115: assess-agent-autonomy has no eval coverage for any of its four judgments

Surface: backend

## Current State

`evals/` is a separate Node project (`evals/package.json`, `"test": "node --test tests/"`) with its own `node_modules`, deliberately outside the plugin's own `npm test`. It carries no scenario covering `/claude-tweaks:assess-agent-autonomy` — `grep -rl "assess-agent-autonomy\|merge-check\|grant-check\|ceremony-check\|failure-check" evals/ --exclude-dir=node_modules` matches only fixture `CLAUDE.md` bodies, never a scenario. All four judgments (grant-check, merge-check, failure-check, ceremony-check) ship verified only by reading the prose.

#78 (v6.31.0) made merge-check's criterion materially more permissive: the instruction-file floor resolves by role rather than by path glob, its escape is a refutation attempt that can clear a diff for auto-merge, and the blast-radius guideline binds only on diffs judged to carry behavior change. That raises what a regression costs — a wrong `auto-merge` verdict puts changed agent instructions in front of every future agent, compounding, with low detectability. #78's whole-branch review was explicit that this is the one thing it could not verify: whether the refutation framing actually changes model behavior at runtime.

**What the harness can already do.** This record was parked on "#157 and #158 land, or the evals harness otherwise gains fixture-repo git seeding"; both are now closed and the capability is present:

- `evals/fixtures/git-fixtures.js` — `freshRepo()`, `seedFiles()`, `applyPatch()`, `seedGitRemote()`, `seedLocalWorkRecord()`, `walkFiles()`.
- `evals/runner.js` `buildFixture()` (`:48`) — dispatches `fixture.seed` steps `apply-patch`, `local-record`, and `git-remote`.
- `evals/runner.js` `expandMatrix()` (`:120`) with `substituteMatrix()` (`:95`) — the matrix construct from #158: `matrix: {corpus, entries, exclude}` plus `{{matrix.<dotted.path>}}` substitution, where a whole-string placeholder preserves the source value's type.
- `evals/scenarios/learning-routing-corpus-matrix.yaml` with `evals/tests/learning-routing-coverage.test.js` — the working precedent: one frozen JSON corpus, one agent run per entry, and a test enforcing that the exclude list and the dedicated scenario files partition the corpus exactly.
- `evals/assertions/index.js` — the `ASSERTIONS` registry. Each fn is `(context, params) -> {pass, message}`, with context `{repoDir, resultText, toolCalls, escapeTargetPath, toolInputs, scenarioName, tokens, history}`. `routing-destination-matches.js` is the closest model: it parses a verdict out of `resultText`.

**What the harness cannot do yet.** Two concrete gaps block the acceptance criteria below:

1. **No branch support anywhere.** `git-fixtures.js` exposes no branch or checkout helper, and `runner.js` has no matching seed step — `grep -n "branch\|checkout\|merge-base"` across both returns a single unrelated comment line. merge-check Step 1 opens with `MERGE_BASE=$(git merge-base {integration-branch} HEAD)`, so a linear fixture history yields it no diff to judge at all.
2. **`merge-sensitive-paths` defaults to empty.** This repo's `.claude-tweaks/policy.yml` carries only `worktree.always: true` and `execution.always: subagent`. merge-check reads `merge-sensitive-paths` from the repo under test and defaults it to `[]` when absent, so the sensitive-path hard floor cannot fire in a fixture that does not seed its own policy file.

merge-check's judged surface, for reference while authoring cases (`skills/assess-agent-autonomy/SKILL.md`, Mode: merge-check): Step 2 carries two hard floors — a `merge-sensitive-paths` hit, and any `/claude-tweaks:review` finding at Medium or above — plus the agent-instruction-file floor with its refutation escape, and the `automerge-max-lines`/`automerge-max-files` guideline that binds only once the diff is judged behavior-carrying. Its Calibration table (`:302-310`) states each boundary case as a shape. Step 3 renders `VERDICT: auto-merge | needs-human` followed by a `RATIONALE:` line.

## Deliverables

- [ ] A branch seed step for the eval harness: a helper in `evals/fixtures/git-fixtures.js` creating a feature branch that diverges from an integration branch, plus its dispatch arm in `runner.js`'s `buildFixture()`, following the existing `apply-patch` / `git-remote` step shape.
- [ ] A fixture base under `evals/fixtures/` carrying its own `.claude-tweaks/policy.yml` with a non-empty `merge-sensitive-paths`, so the sensitive-path floor is reachable.
- [ ] A frozen case corpus (JSON, under `evals/fixtures/`) whose entries span merge-check's Calibration table shapes, each entry naming its planted diff and its expected verdict.
- [ ] A matrix scenario under `evals/scenarios/` running one merge-check invocation per corpus entry, using `learning-routing-corpus-matrix.yaml`'s selection-by-exclusion rather than an allowlist.
- [ ] A verdict assertion registered in `evals/assertions/index.js` that parses merge-check's `VERDICT:` line out of `resultText` and compares it against the corpus's expected value — modelled on `routing-destination-matches.js`.
- [ ] A coverage test under `evals/tests/` enforcing that every corpus entry is exercised, mirroring `learning-routing-coverage.test.js`.

## Acceptance Criteria

1. The evals harness exercises merge-check against at least one behavior-preserving diff expected to render `auto-merge`.
2. It exercises at least one behavior-carrying diff expected to render `needs-human`.
3. It exercises at least one diff that both matches a mechanical shape and touches a `merge-sensitive-paths` file, expected to render `needs-human` — confirming the Calibration table cannot be pattern-matched past a hard floor. That case's fixture seeds a `.claude-tweaks/policy.yml` whose `merge-sensitive-paths` actually matches the touched file; a case relying on the empty default does not satisfy this criterion.
4. The fixture repo has a feature branch diverging from an integration branch, such that merge-check's `git merge-base` call resolves and its `git diff --numstat` returns a non-empty diff.
5. Every corpus entry's expected verdict is authored from merge-check's stated criterion, never recorded from an observed run.
6. `node --test evals/tests/` passes, and the new coverage test fails when a corpus entry is added without being exercised.
7. The plugin's own `npm test` is unchanged — no eval joins the plugin runtime suite.

## Technical Approach

Reuse the matrix construct rather than writing one scenario file per Calibration row. The precedent is exact: `learning-routing-corpus-matrix.yaml` runs a frozen JSON corpus one agent run per entry, and `learning-routing-coverage.test.js` enforces that the exclude list plus the dedicated scenario files partition that corpus. That pairing is what stops a corpus entry from being recorded and integrity-checked while exercised by nothing — which is the exact failure this record exists to prevent, one layer up.

The verdict assertion parses `resultText` for the `VERDICT:` line rather than asserting on tool calls. merge-check's contract is its rendered verdict; asserting against the intermediate `blast-radius.js` invocation would couple the eval to Step 1's current shell plumbing, which is implementation, not contract.

### Key Files

- `evals/fixtures/git-fixtures.js` — modify: branch helper
- `evals/runner.js` — modify: `buildFixture()` seed-step arm for the branch step
- `evals/fixtures/{merge-check-repo}/` — new: fixture base, including its own `.claude-tweaks/policy.yml`
- `evals/fixtures/{merge-check-cases}.json` — new: frozen case corpus
- `evals/scenarios/{assess-merge-check-matrix}.yaml` — new: matrix scenario
- `evals/assertions/verdict-matches.js` — new: verdict assertion
- `evals/assertions/index.js` — modify: registry entry for the above
- `evals/tests/` — new: corpus coverage test

## Gotchas

- Verify the eval actually discriminates: change merge-check's prose to something wrong and confirm a case flips. A case set that reads correctly but passes either way proves nothing (`[IL-78]`) — and since this record's entire deliverable is coverage, a check that would pass on any input is the one failure mode that defeats it completely.
- Author each expected verdict from merge-check's stated criterion, never by running it and recording what it said. An expectation computed the way the implementation computes it cannot distinguish "correct" from "matches current behavior" (`[IL-62]`).
- `evals/` has its own `package.json` and `node_modules` — a new directory there is not picked up by the plugin's test globs, and the reverse holds too (`[IL-84]`). If a new `evals/tests/` subdirectory is added, confirm `evals/package.json`'s own test script covers it.
- Do not anchor a calibration case to an issue reference. The table states its rows as shapes deliberately: "an issue closes and its defect gets fixed, and calibration anchored to one then describes a state that no longer exists" (`skills/assess-agent-autonomy/SKILL.md:299-300`).
- `merge-sensitive-paths` absent defaults to `[]`, not to a built-in list. A sensitive-path case that does not seed the fixture's own policy file silently tests something else — it renders whatever the content judgment alone produces, and then passes or fails for an unrelated reason.
- The eval sandbox blocks outbound network (`runner.js:207`, `managedSettings.sandbox.network.allowedDomains: []`). merge-check Step 1 is local git plus a `blast-radius.js` require, so it is unaffected — but any case tempted to reach `gh` for review findings is not.
- Related to #180 (eval coverage for the consequence filter), which is blocked by this record for harness shape only. Whatever corpus / matrix / assertion convention lands here is the one #180 follows; if it needs a shared module, extract rather than duplicate (`[IL-32]`).
- **Scope note.** The title names all four judgments; the Deliverables and Acceptance Criteria above cover merge-check only. That narrowing is deliberate and inherited from the original filing — #78 raised merge-check's regression cost specifically. grant-check, failure-check, and ceremony-check remain uncovered when this record closes, and need their own records.

## Original request

assess-agent-autonomy has no eval coverage for any of its four judgments

**Trigger:** #157 and #158 land, or the evals harness otherwise gains fixture-repo git seeding. This records deliverable needs a fixture repository with git history, which the harness cannot build today.

**Parked:** 2026-08-07, during a backlog park sweep. Nothing about the underlying problem changed — this record was on hold in substance and is now labelled that way.

---

**Current State:** `evals/` has no `assess-agent-autonomy` case and no fixture carrying a diff, so none of grant-check, merge-check, failure-check, or ceremony-check has automated coverage. Every change to these judgments ships verified only by reading the prose.

#78 (v6.31.0) made merge-check's criterion materially more permissive: the instruction-file floor now resolves by role rather than by path glob, its escape is a refutation attempt that can clear a diff for auto-merge, and the blast-radius guideline binds only on diffs judged to carry behavior change. That raises what a regression costs — a wrong `auto-merge` verdict puts changed agent instructions in front of every future agent, compounding, with low detectability.

The whole-branch review of #78 was explicit that this is the one thing it could not verify: whether the refutation framing actually changes model behavior at runtime.

**Deliverables:** A fixture repository under `evals/fixtures/` with a git history and planted diffs spanning the boundary cases in merge-check's Calibration table (`skills/assess-agent-autonomy/SKILL.md`, Mode: merge-check, Step 2), plus eval cases asserting the verdict for each.

**Acceptance Criteria:** the evals harness exercises merge-check against at least one behavior-preserving diff expected to clear, one behavior-carrying diff expected to render `needs-human`, and one diff that both matches a mechanical shape and touches a `merge-sensitive-paths` file — the last confirming the calibration table cannot be pattern-matched past a hard floor.

Filed from #78's design, which scoped this out deliberately rather than folding a fixture build into a markdown-only change.


