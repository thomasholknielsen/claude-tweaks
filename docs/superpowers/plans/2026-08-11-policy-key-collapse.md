# Collapse policy keys: execution merge, branch-divergence-check rename, retirements (#331)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-11T195542-spec-329-330-331/spec-331/work/331-spec.md` (record #331)

**Fresh consumer lists (2026-08-11/12, post-#330 tree — the record's line claims are superseded):**
- `execution.always`: `bin/lib/policy-schema.js:13`, `tests/policy-schema.test.js:119-121` (pins two-key distinctness — rewrite to pin the one-key model), `tests/resolve-policy-lib.test.js:150-152` (uses it as a no-default example — swap the example key), `skills/_shared/git-discipline.md:19`, `skills/_shared/policy-schema.md:48-49`, `skills/build/build-options.md:18,31,56`, `skills/build/SKILL.md:42`, plus any flow/SKILL.md execution-axis mention.
- `merge-check` (lever sense): `bin/lib/policy-schema.js:51`, `skills/_shared/worktree-setup.md:96-97,134`, `skills/build/worktree-setup.md:31`, `skills/flow/validation.md:13,16,21`, `skills/flow/SKILL.md:165` (+ Syntax-table mention if any), `skills/_shared/auto-mode-contract.md:152` (silences-table row). Verdict-sense lines that must SURVIVE the AC 3 sweep mechanically: `skills/dispatch/SKILL.md:318`, `skills/_shared/work-record-config.md:25`, `skills/_shared/policy-schema.md:102,104`, `bin/lib/issues/blast-radius.js:3-10`, `docs/skill-graph.md:30,32`, `bin/lib/skill-audit/tests/identifiers.test.js:11-12` (incidental token — adjust the fixture string, it is not a policy citation).
- `review-diff-heuristic-thresholds`: `bin/lib/policy-schema.js:30`, `skills/review/review-effort-derivation.md:42` (post-#330 resolver JSON call — becomes stated constants), `skills/_shared/policy-schema.md:112`, `tests/policy-schema.test.js:262-264` (presence-only pin — becomes a retirement pin).
- `promise-register-min-leaves`: `bin/lib/policy-schema.js:48`, `skills/wrap-up/verification-brief.md:246`, `skills/_shared/work-record.md:283`, `skills/specify/record-creation.md:252`, `skills/_shared/work-record-config.md:28` (row removed same change), `skills/_shared/policy-schema.md:175`.
- `section-confirmation`: `bin/lib/policy-schema.js:50`, `skills/deepen/SKILL.md:112`, `skills/_shared/policy-schema.md:177`, `docs/skill-authoring.md:48` (the Adaptive-section-batching paragraph names the setting and its overrides — rewrite to unconditional adaptive).
- `research-mode`: `skills/_shared/policy-schema.md` row (~:164) — delete only the false `/flow`-precedence sentence; the key and `/claude-tweaks:research`'s read stay.
- This repo's `.claude-tweaks/policy.yml` sets `execution.always: subagent` and none of the three retired keys — self-migration is the one live-value carry.

## Task 1 (code): schema + audit + tests

**Files:** `bin/lib/policy-schema.js`, `tests/policy-schema.test.js`, `tests/resolve-policy-lib.test.js`, `tests/resolve-policy-cli.test.js` (only if a fixture needs it)

1. `POLICY_KEYS`: widen `execution-strategy` values to `['subagent','batched','subagent-only','batched-only']`; REMOVE rows `execution.always`, `merge-check`, `review-diff-heuristic-thresholds`, `promise-register-min-leaves`, `section-confirmation`; ADD `{ key: 'branch-divergence-check', type: 'boolean', default: true }` (default-parity with the removed `merge-check`). Net count 45 → 41.
2. `RENAMED_KEYS` additions, each with a comment pointing at `skills/_shared/policy-deprecations.md` (Task P2 creates it):
   - `{ key: 'execution.always', replacedBy: 'execution-strategy', migrate: v => v === 'subagent' ? 'subagent-only' : v === 'batched' ? 'batched-only' : null }` — malformed values null-migrate to the schema default (`subagent`, unlocked), never minting a malformed `-only` value.
   - `{ key: 'merge-check', replacedBy: 'branch-divergence-check', migrate: v => v }`.
   - Three retirement entries with `replacedBy: null` and `migrate: () => null`: `review-diff-heuristic-thresholds`, `promise-register-min-leaves`, `section-confirmation`.
3. `RENAMED_KEYS` entry shape gains `replacedBy: null` semantics; `auditPolicy` reports such keys under `renamedKeys` as deliberate retirements (carry `replacedBy: null` through; never under `unrecognizedKeys`), suggesting deletion. Resolver behavior for a *retired* old key falls out of the existing null-migrate path (contributes nothing; requesting a retired name → the alias maps to `replacedBy` null → treat as unknown-key error, since there is no replacement to resolve — pin this).
4. Tests: count pin 45→41 with the change logged in the pin's own comment convention; rewrite the two-key distinctness test to pin the one-key lock model (`-only` = lock; AC 1's four migrate cases: `subagent`→`subagent-only`+renamed-from, `batched`→`batched-only`+renamed-from, malformed (`yes`)→default `subagent`+renamed-from+source default, `merge-check: false` → `branch-divergence-check` false + renamed-from); rewrite the presence-only thresholds test as a retirement-audit test (AC 2: fixture holding all three retired keys → each under `renamedKeys` with `replacedBy: null`, none under `unrecognizedKeys`); swap `tests/resolve-policy-lib.test.js`'s no-default example from `execution.always` to `review-effort-floor` (still unset-no-default).

**Verify:** the four policy suites green.

## Task P1 (prose, sequential after Task 1 lands): lock-model + rename consumers

**Files:** `skills/build/SKILL.md`, `skills/build/build-options.md`, `skills/_shared/git-discipline.md`, `skills/flow/SKILL.md`, `skills/build/worktree-setup.md`, `skills/_shared/worktree-setup.md`, `skills/flow/validation.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/policy-schema.md` (rows 46-49 region + `merge-check` row + collision note ONLY — retirement rows are Task P2's)

1. One-key execution model everywhere: `execution-strategy: subagent-only|batched-only` keeps `execution.always`'s full lock behavior (beats an explicit CLI argument, substituted with the inline notice per build-options step 0); plain `subagent`/`batched` stay overridable defaults. Update the lever-lock paragraphs (build/SKILL.md:42, build-options:18/31/56, git-discipline:19, any flow/SKILL.md execution mention) and MERGE the two policy-schema.md rows into one `execution-strategy` row documenting both value classes; add the `execution.always → execution-strategy` alias note to the row.
2. Rename `merge-check` → `branch-divergence-check` (boolean semantics unchanged) at the four consumer sites' resolver calls and their surrounding prose, including the AUTO log-line templates ("pre-flight branch-divergence-check") and flow/SKILL.md:165's memo prose; policy-schema.md's lever row renamed with alias note; the schema doc's collision note becomes one "resolved by rename in #331" line; auto-mode-contract.md:152's silences-row renamed.
3. AC 3 sweep survivability: every remaining `merge-check` occurrence must either live under `skills/assess-agent-autonomy/**` or co-occur on its line with `verdict`, `grant-check`, `failure-check`, or `ceremony-check`. Adjust the verdict-sense lines listed in the fresh consumer list (add the word `verdict` where it is not already present — e.g. "merge-check verdict mode") WITHOUT changing their meaning; the skill-audit identifiers-test fixture string swaps `merge-check` for another hyphenated token (it is an arbitrary example).

## Task P2 (prose, sequential after P1): retirements + deprecations register + init renderer

**Files:** `skills/review/review-effort-derivation.md`, `skills/specify/record-creation.md`, `skills/wrap-up/verification-brief.md`, `skills/_shared/work-record.md`, `skills/_shared/work-record-config.md`, `skills/deepen/SKILL.md`, `docs/skill-authoring.md`, `skills/_shared/policy-schema.md` (retired rows + research-mode sentence ONLY), `skills/_shared/policy-deprecations.md` (new), `skills/init/update-mode.md`

1. `review-effort-derivation.md`: thresholds become stated constants (10/300 files/lines high, 3/50 medium) with a one-line comment that they were the `review-diff-heuristic-thresholds` lever until #331 (removal-condition trail, not a bare number).
2. Hardcode `4` at the three `promise-register-min-leaves` read sites with the same one-line former-lever note; remove `work-record-config.md`'s row in the same change (that file wins on disagreement — never one side first).
3. `deepen/SKILL.md`: adaptive batching unconditional, no policy read; `docs/skill-authoring.md`'s Adaptive-section-batching paragraph loses the setting and its `per-section`/`batch` overrides (adaptive is THE behavior).
4. `policy-schema.md`: remove the three retired rows; delete `research-mode`'s false `/flow`-precedence sentence (key + read stay); the Manifesto/other tables mention none of the retired keys (verify by grep, `manifesto.md` lever list included).
5. NEW `skills/_shared/policy-deprecations.md`: the five aliases/retirements from this leaf, each with a re-checkable removal condition (a grep/predicate runnable against live state — mutually consistent in form; model on `skills/dispatch/deprecated-aliases.md`, which keeps its own two entries — do not move them).
6. `skills/init/update-mode.md` (Config Home Drift / Renamed-key drift region ~:202-251): render `replacedBy: null` entries as deliberate retirements — warn-tier report + delete offer, informational only, never blocking; declining leaves the stray line untouched.

## Central (after P2): self-migration + sweeps + suite

1. `.claude-tweaks/policy.yml`: `execution.always: subagent` → `execution-strategy: subagent-only` (AC 6 — this repo's live lock preserved).
2. AC 3 sweep with planted-line negative control: case-insensitive repo-wide for the five collapsed/retired names — hits allowed only in `RENAMED_KEYS`, `policy-deprecations.md`, incident-log/CHANGELOG/shipped plans history, and (for `merge-check`) the mechanical verdict-sense exclusions.
3. Full `npm test`; both index tables + reference-card checked for stale key names.
