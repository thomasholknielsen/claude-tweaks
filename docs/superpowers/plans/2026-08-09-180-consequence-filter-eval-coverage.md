# Plan — #180: Eval coverage for the consequence filter

Spec: `.claude-tweaks/pipelines/2026-08-09T092310-spec-242-243-115-180/spec-180/work/180-spec.md`

Follows #115's harness shape exactly (same run of this pipeline): frozen JSON corpus + matrix scenario + resultText-parsing assertion + offline coverage test. Reuse, never duplicate (`[IL-32]`): the coverage-test pattern and any shared helper land once.

The judgment under eval: `skills/research/verify-mode.md`'s consequence filter — *"If the answer surprised me, would the design change?"* — binary keep/drop, convergence being the only drop reason, applied per candidate question. The eval invokes `/claude-tweaks:research verify <brief-path>` against a fixture brief and constrains the run to stop after the filter and report per-candidate keep/drop (the research phase itself is out of scope per the record's Non-Goals, and the sandbox blocks network anyway).

Expected outcomes are authored from the filter's design intent (convergence test), never from running it (`[IL-62]`).

Scope keywords: consequence-filter-cases, filter-outcome-matches

## Task 1: Frozen corpus `evals/fixtures/consequence-filter-cases.json`

`{ "cases": [...] }`, each `{ id, brief (markdown content for the fixture's brief file), candidates: [{token, question}], expected: { kept: [tokens], dropped: [tokens] }, rationale }`. Each candidate question carries a short unique token (e.g. `Q-TTL`) stated in the brief, so the assertion can anchor per-question outcomes in resultText without paraphrase-matching. Cases (per AC 1-3):

| id | Shape | Expected |
|---|---|---|
| `clear-keep` | Design chooses sync vs async pipeline; question: "does the upstream API support webhooks?" — answers lead to structurally different designs | keep |
| `clear-drop` | Module rebuilt per-run either way; question: "does the cache need a TTL?" (verify-mode.md's own worked example shape) | drop |
| `convergence-boundary` | Question whose branches converge only because a separate stated constraint already fixes the choice; brief states that constraint explicitly | drop |
| `looks-consequential-converges` | "Which of the two providers is cheaper?" where the brief records the provider was already chosen for compliance reasons — cost surprise changes nothing | drop |
| `looks-trivial-diverges` | "What is the library's default flush interval?" where the brief shows a surprising default forces a different buffering architecture | keep |
| `green-ground` | Brief on a no-priors topic, 3 candidates — filter self-calibrates: with no priors nearly everything diverges | all 3 kept |

## Task 2: Fixture brief seeding

Reuse the existing `seedFiles`-via-`fixture.base` path if a static base suffices; otherwise the corpus `brief` field is written through the matrix into a seed step. Prefer: scenario seed step `- files: {docs/brief.md: "{{matrix.brief}}"}` **only if** a `files` seed arm already exists after #115 — otherwise write the brief via the existing `local-record`/base mechanisms or add the minimal `files` arm following #115's `branch` arm precedent (same shape, `seedFiles(dir, step.files)`).

## Task 3: Assertion `evals/assertions/filter-outcome-matches.js` + registry entry

Modelled on #115's `verdict-matches.js`. Params `{ kept: [tokens], dropped: [tokens] }`; for each token in `kept`, resultText must state keep (token appears in a line/labelled section indicating kept/keep) and not dropped; inverse for `dropped`. Fail naming the first token whose stated outcome mismatches or is absent. Unit tests in `evals/tests/assertions.test.js`: all-match, one-mismatch, token-absent, negation check (`[IL-105]`).

## Task 4: Matrix scenario `evals/scenarios/research-consequence-filter-matrix.yaml`

Matrix over `consequence-filter-cases.json` (`entries: cases`, no exclude). Prompt (expectations never in the prompt):

```
/claude-tweaks:research verify docs/brief.md — stop after the consequence filter: report each candidate question's keep/drop outcome with its one-line rationale, then end the run without researching anything.
```

Assertions: `filter-outcome-matches` with `{{matrix.expected.kept}}` / `{{matrix.expected.dropped}}` (whole-placeholder substitution preserves arrays), plus `tool-count` ceiling.

## Task 5: Coverage test `evals/tests/consequence-filter-coverage.test.js` + baseline

- Coverage test mirrors #115's `merge-check-coverage.test.js` over this corpus (extract a shared helper if the two are near-identical — `[IL-32]`; otherwise keep parallel files matching the learning-routing precedent).
- **Baseline (AC 5):** run the scenario once for real (billed): `node runner.js run research-consequence-filter-matrix` from `evals/`, record on (history.jsonl), and commit `evals/results`-independent baseline note `evals/BASELINES.md` (or append to existing NOTES.md if a baselines section exists) stating date, plugin version measured against, and per-case pass/fail. If the environment cannot run billed scenarios (no API auth), record the gap as an ops ledger item instead of a fake baseline — fail loud, never fabricate.
- Discrimination check (`[IL-78]`): break coverage temporarily, confirm the test fails, restore.

## Task 6: Docs note

`docs/plugin-structure.md` — only if #115's Task 8 established a per-scenario list; follow it, else skip.
