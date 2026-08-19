---
name: build
description: Use when implementing a work record or design doc end-to-end. Accepts a record reference (#N) for full lifecycle tracking, or a design doc path to skip /claude-tweaks:specify and build directly from brainstorming output.
argument-hint: "[#<n>|<design-doc-path>|<topic>] [subagent|batched] [auto] [worktree|current-branch] [tier=<fast|standard|capable|frontier>] [ops=confirm]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Build — Implement a spec end-to-end with worktree, plan audit, and lifecycle tracking

Implement a spec or design doc end-to-end: plan it, build it, simplify it, verify it, and capture the journeys it enables. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /superpowers:brainstorming → /claude-tweaks:specify → [ /claude-tweaks:build ] → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                            ↑                                          ^^^^ YOU ARE HERE ^^^^   ↑
                                                            └── or skip directly ──────────────────────────────────────────────┘
```

## When to Use

- A spec is ready to build (prerequisites met, plan exists or will be created)
- A design doc is ready for direct implementation (skipping /claude-tweaks:specify)
- /claude-tweaks:help recommends building a specific spec
- Resuming a partially-completed build

## Input

`$ARGUMENTS` is parsed as `[#<n>|<design-doc-path>|<topic>] [subagent|batched] [auto] [worktree|current-branch] [tier=<fast|standard|capable|frontier>] [ops=confirm]` — see Build Options and Git Strategy below for what each token resolves to.

## Build Options (summary)

The axes below are orthogonal and combine freely. Default is `subagent` + `worktree`.

| Axis | Options | Default |
|------|---------|---------|
| **Execution** | `subagent` (automated review chain) / `batched` (3-task human-reviewed batches) | `subagent` |
| **Git** | `worktree` (isolated branch) / `current-branch` (direct commits) | `worktree` |
| **Auto** | `auto` keyword — applies `.claude-tweaks/policy.yml` / fallback defaults, skips confirmation prompts, routes deviations per `_shared/auto-mode-contract.md` | off |

When `.claude-tweaks/policy.yml` sets `worktree-always: true`, the Git axis has only one value: `current-branch` is not offered and is rejected if passed explicitly — the mechanical PreToolUse gate would deny any edit outside a worktree regardless (see `_shared/git-discipline.md`).

When `.claude-tweaks/policy.yml` sets `execution-strategy: subagent-only` (or `batched-only`), the Execution axis has only one value — the `-only` suffix is the lock: the other strategy is not offered and is rejected if passed explicitly. Plain `subagent`/`batched` set an overridable default, not a lock. Unlike the Git axis, there is no mechanical backstop for the lock (see `_shared/git-discipline.md`).

("Rejected" means: substitute the locked value and surface a one-line inline notice, never a hard error or an `AskUserQuestion` prompt — see `build-options.md`'s "Default resolution" step 0 for the exact wording.)

Read `build-options.md` in this skill's directory for the full options matrix, invocation grammar (six combinations), default-resolution order, the build-options prompt template, the record-vs-design mode table, and the input-resolution rules. `$ARGUMENTS` = record reference (`#N`, primary) / design doc path / topic name, optionally followed by execution strategy, git strategy, `auto`, and/or the standalone tokens `tier=<fast|standard|capable|frontier>` (Common Step 2 model-tier override, see that step) and `ops=confirm` (Step 2.5 auto-executable-command confirmation, see that step). Tokens are matched by keyword, not position — any order is accepted.

## Workflow

```
Resolve input
    ↓
Spec/record mode? ──yes──→ [Spec Steps 1, 2, 2.5 (Manual Steps classification), 3]
    │                       ↓
    no (design mode)        │
    ↓                       │
[Design Steps 1-3]         │
    ↓                       │
    └───────────────────────┘
                ↓
        [Common Steps 1-7]
```

---

## Spec Mode

### Spec Step 1: Resolve, Materialize, and Assess

Materialize the record into a spec-shaped build file via `skills/flow/materialize.md`: resolve the record, run the materialization hard gate (an unshaped body stops the build with "run `/claude-tweaks:specify #{n}` first"), compose the pinned header, and write + commit `{run-dir}/work/{n}-spec.md`. **Ordering — worktree first:** in `worktree` mode, run Common Step 1 to create the worktree from current HEAD, then perform this resolve/materialize/commit as the branch's first commit inside it, before proceeding to Spec Step 2. In `current-branch` mode there is no worktree, so write and commit on the current branch directly. Do not materialize on the pre-worktree branch and then branch from it — that order is denied outright under `worktree-always: true` and buys nothing under any other policy. See materialize.md's "When this runs" for the rationale; this step does not restate it. When a parent `/claude-tweaks:flow` already materialized the file for this run (`$PIPELINE_RUN_DIR` set and `{run-dir}/work/{n}-spec.md` already exists), read it in place instead of re-fetching or re-composing — see materialize.md's "When this runs." **Immediately after the materialize commit, in `worktree` mode only:** run `build/worktree-setup.md` Step 6 — opens the run's draft PR under `integration-model: pr-first` (`_shared/integration-model.md`, procedure in `_shared/pr-early-run-lifecycle.md`); a no-op under `local-merge`. **Non-skippable, regardless of what Spec Step 2's implementation assessment turns out to find:** Common Step 1's worktree-assignment stamping (`worktree-setup.md` Step 4.5, `record-worktree`) and this Step 6 draft-PR call both run before any judgment about whether further code changes are needed — never treat "the acceptance criteria already look satisfied" as license to jump past either. A record found already-satisfied still needs its own PR and its own worktree stamp: the reconciler's automatic worktree-reap and run-dir archival (`bin/hooks.js reconcile`) key off that stamp, and skipping it silently strands the run's cleanup on whoever dispatched it (`docs/incident-log.md`'s `[IL-131]`). Once materialized (and the draft PR opened, when applicable), read the file in full and proceed to Spec Step 2; the shape gate already replaces the prerequisite check this step used to run.

### Spec Step 2: Check for Existing Plan

Search `docs/superpowers/plans/` for a plan matching this spec (by number, topic, or date) — this is where `/superpowers:writing-plans` actually writes execution plans (see Spec Step 3 below); `docs/plans/` holds claude-tweaks pipeline state (ledger, audit caches), not plans.

#### If a plan exists:

- Read it and compare against the spec — has the spec evolved since the plan was written?
- Check what's already implemented (search codebase for files, routes, tests referenced in the plan)
- If the plan is still valid and work remains, skip to Common Step 2
- If the plan is stale (spec changed, codebase diverged), proceed to Spec Step 3

#### If no plan exists:

Proceed to Spec Step 3.

### Spec Step 2.5: Classify and Seed Manual Steps

If the spec has a "Manual Steps" section, classify each item before deciding what to do with it. "Outside the codebase" is not the same as "human-only" — many such tasks have CLIs and should be executed inline rather than dumped to the ledger.

> **Parallel execution:** Use parallel tool calls — the CLI/credential probes for each Manual Steps item are independent Bash operations and should run concurrently, the same shape `operational-checklist.md`'s Common Step 5.5 already parallelizes for its own probes.

For each item, probe in this order:

1. **CLI/API check** — infer the relevant tool from the item text, then probe: `which terraform`, `which vercel`, `which gh`, `which fly`, `which wrangler`, `which stripe`, `which ldcli`, `which aws`, `which gcloud`, etc.
2. **Credential check** — if a tool exists, are creds present? Use `{tool} auth status` (or equivalent: `gh auth status`, `vercel whoami`, `fly auth whoami`, expected env var, config file at the documented path).
3. **Triage:**
   - **Auto-executable** (tool + creds present) — execute now via Bash. In `auto` mode, log command, exit code, and one-line outcome to `decisions.md`. In interactive mode, surface the command and result inline. Do NOT seed the ledger. **`ops=confirm` token:** when present in `$ARGUMENTS`, do not execute automatically even here — call `AskUserQuestion` with the exact command and a one-line description of its effect, options "Run it (Recommended)" and "Skip — seed to ledger instead," before running (or, if skipped, seed as `ops` with `(reason-not-auto: user-declined)`). This applies in both interactive and `auto` mode — `ops=confirm` is a stronger, explicit opt-in for operational/secret-mutating commands specifically, so it is not silenced by `auto`.
   - **Auth-gap** (tool present, creds missing) — in interactive mode, surface the one-time `{tool} login` command and wait; on success, fall through to auto-execute. In `auto` mode, seed as `ops` with `(reason-not-auto: auth-not-configured)` so the user can resolve at the wrap-up Review Console.
   - **Truly manual** (no CLI, requires human judgment, requires signoff) — seed as `ops` with the matching `(reason-not-auto: …)` qualifier from `_shared/ledger-format.md`'s Required-for-ops section.

If the ledger doesn't exist, create it using the ledger skill's create operation.

**Anti-pattern:** Seeding the entire Manual Steps section verbatim into `ops` without probing. The spec writer cannot know which CLIs are installed on the executing machine — that classification must happen here, at execution time, where probes can actually run.

### Spec Step 3: Create the Plan

Invoke the `/superpowers:writing-plans` skill. After it saves the plan file, **stop the skill and return here** — do not let it present an execution choice or invoke an execution skill. `/build` controls execution strategy.

Context to provide to `/superpowers:writing-plans`:
- The full spec content (including Current State, Gotchas, and acceptance criteria)
- Any existing progress identified in Spec Step 2

The plan will be written to `docs/superpowers/plans/YYYY-MM-DD-{feature}.md`.

**Plan header artifact:** Every plan written by `/superpowers:writing-plans` starts with a "For agentic workers" block that advertises `subagent-driven-development` (recommended) or `executing-plans` as the next step. **Ignore it.** `/build` controls execution strategy — the header is boilerplate from writing-plans's general-purpose handoff. Do not treat it as guidance for this build. (Same rule applies in Design Step 3 below.)

**Plan-authoring check:** when the plan's tasks grow an existing function's return shape — or widen a shared data structure's row/entry shape — grep the repo for tests asserting against that return value — `notDeepEqual`-style discrimination checks, hard-coded object-literal comparisons — and for prose citing a literal count derived from it. A widened return shape can silently defang the assertion and leave the count stale. Flag any hits before finalizing the plan. (Same check applies in Design Step 3 below.)

**Blocking-verification-downgrade check:** when a plan task exists specifically to verify a live/external contract (a real API response, a real hook payload, a real third-party behavior) before implementing against it, and that task gets scoped down during authoring to something that doesn't touch live data (a re-read of documentation, a type declaration, a spec citation) — flag it explicitly rather than letting the downgrade pass silently. The two are not equivalent: a task-level review that only compares the plan text against the implemented code has nothing to catch here, since both sides agree with the (possibly wrong) documented contract. Name the downgrade in the plan or the ledger so it reads as a stated risk, not an invisible one. (Same check applies in Design Step 3 below.)

**Deictic-reference re-resolution check:** when a plan task instructs a text reorder — moving a paragraph relative to other text that cross-references it — re-resolve every deictic reference ("above", "below", "the following", "the preceding") in both the moved text and the text it moves past, and write the task's `replacing:`/`with:` blocks with the post-move direction already applied. A self-contradictory pair (one clause saying "above" and another "below" about the same paragraph) reads as correct inside each task's own diff, so a task-level review comparing plan text against implemented code has nothing to catch — only a whole-file read resolves the direction. Re-check the deictics as part of the reorder edit itself; a later fix round that corrects the ordering will not correct them, because the reorder is right in isolation. (Same check applies in Design Step 3 below.)

**Verbatim-command run-once check:** when a plan task's replacement text dictates a runnable command verbatim (`gh api`, a GraphQL query, `jq`, `curl`), run that command once against the live target in a read-only form before dispatching, and record the output in the plan; a command with no safe read-only form is flagged in the plan as unverified. Transcription plus a task review cannot catch a command that cannot execute — both sides agree with the (possibly wrong) authored text — and when the same plan also dictates the test, TDD is circular: red→green proves agreement with the plan, not with reality. Two shipped `gh api` flag defects in one session (#608's `-f` placeholder fix inverted into #610's `-F` coercion bug, pinned by its own plan-authored test) are the incident behind this check. (Same check applies in Design Step 3 below.)

**Degrade-clause convention check:** before a plan task writes a new "when X is unavailable, do Y" clause into a skill or `_shared/` contract, grep `plugin/skills/_shared/` for the same unavailability condition (`gh absent`, `no MCP fallback`, `MCP transport`, and the like) and cite whatever established convention already covers it, inline, rather than restating the behaviour uncited. An uncited degrade clause reads to a reviewer as a fresh, unsupported exception to the file's general transport policy, and the review cycle spent adjudicating that is pure waste — the convention already existed. (Same check applies in Design Step 3 below.)

Proceed to **Common Step 2**.

---

## Design Mode

### Design Step 1: Read the Design Doc

- Read the full design doc
- Scan the codebase for existing files, schemas, APIs, and patterns relevant to the design

### Design Step 2: Check for Existing Plan

Search `docs/superpowers/plans/` for an execution plan matching this design doc (by topic or date). Follow the same evaluation procedure as Spec Step 2 above, substituting the design doc for the spec as the comparison artifact: read the plan and compare it against the design doc (has the design evolved since?), check what's already implemented, and decide stale vs. valid.

- If a plan exists and is still valid → skip to Common Step 2
- If no plan or plan is stale → proceed to Design Step 3

### Design Step 3: Create the Plan

Invoke the `/superpowers:writing-plans` skill. After it saves the plan file, **stop the skill and return here** — do not let it present an execution choice or invoke an execution skill. `/build` controls execution strategy.

Context to provide to `/superpowers:writing-plans`:
- The full design doc content
- Relevant codebase context (existing files, patterns, schemas)

<IMPORTANT>
Design mode has no spec with structured acceptance criteria. When providing context to `/superpowers:writing-plans`, extract testable outcomes from the design doc's decisions and recommendations. If the design doc lacks clear success criteria, ask the user to confirm what "done" looks like before proceeding.
</IMPORTANT>

The plan will be written to `docs/superpowers/plans/YYYY-MM-DD-{feature}.md`. Same plan-header artifact rule and plan-authoring check as Spec Step 3 apply (ignore the "For agentic workers" boilerplate).

Proceed to **Common Step 2**.

---

## Common Steps (both modes)

### Common Step 1: Set Up Worktree (worktree strategy only)

If the user specified `worktree`, set up the isolated workspace via `/superpowers:using-git-worktrees` after a pre-flight branch-divergence check and (when in auto mode) pre-authorizing the consent prompt.

For the full procedure (pre-flight branch-divergence check with auto-mode behavior, consent prompt handling, and worktree-creation failure recovery table), read `worktree-setup.md` in this skill's directory.

If the user did not specify `worktree`, skip this step.

### Common Step 1.5: Plan Audit

Audit the plan against the actual repo before dispatching execution. Two checks:
- **Check A (always):** verify every path in the plan's Files: sections exists (or its parent directory exists for Create).
- **Check B (conditional):** when the plan declares `Scope keywords:`, grep the repo for each keyword and list any matched files not in the plan.

**Auto mode** (including a standalone `auto` invocation with no pipeline run dir): apply the `scope-creep` policy, resolved per the standard precedence (default `add-to-plan`). **Interactive mode:** call `AskUserQuestion` with three options: "Add to plan and continue" (Recommended), "Continue without", "Stop".

**Skip this step entirely when** the plan has fewer than 3 file references (trivial plans don't benefit from audit) AND no `Scope keywords:` field is present, **or** when `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh from the run directory) — a `ceremony-check` verdict of `fast-lane` is itself a judgment that this record's plan doesn't need auditing against scope creep. Standalone `/build` (no `config.yml`) always falls back to the size-based condition alone. This is the full gate — deciding skip-vs-run never requires loading `plan-audit.md` itself.

> **Project setting:** When `.claude-tweaks/policy.yml` declares `scope-keywords-required: true`, plans without a `Scope keywords:` field are treated as failed audits (require the field, not just optional). See `plan-audit.md` for the policy table.

For the full procedure (Check A failure handling, Check B scope-keyword sweep command, `scope-keywords-required` setting, auto-mode policy table, interactive prompt), read `plan-audit.md` in this skill's directory.

### Common Step 1.7: Design Pre-Build (frontend specs)

For frontend specs — `surface` ∈ `web | mobile | desktop`, read from the materialized header's `surface:` field (lifted from the record body's `Surface:` metadata line per `skills/flow/materialize.md`) — invoke `/claude-tweaks:design-wrapper pre-build <spec>` to lazy-load relevant design references into the implementer subagent's context. For the full skip conditions, invocation rules, result handling, and where loaded references go, see `design-prebuild.md` in this skill's directory.

### Common Step 2: Execute the Plan

Execution depends on the chosen execution strategy (see Build Options).

**`tier=frontier` guard (canonical — cited by `build-options.md`, not restated).** `tier=frontier` is the human-typed hardest-build opt-in: it is reachable **only** by the literal `tier=frontier` token present in the human's own invocation text. No `size:` facet, no policy value, no model stance, and no Pipeline Config Manifesto option ever selects Frontier for a build — the `size:` → profile bridge in the paragraph below tops out at Capable, full stop. A `/flow` run that forwards the user's own typed token is compliant; a Manifesto question offering `frontier` as a choice is not, and none exists.

**Strategy precondition (numbered step, checked before any dispatch).** When `tier=frontier` is present in `$ARGUMENTS`:
1. Resolve the execution strategy that would otherwise apply (see Build Options' default-resolution order).
2. If the resolved strategy is not `subagent` (i.e. it is `batched`), refuse the token at options-resolution time — before invoking either execution skill — with: `"tier=frontier requires the subagent execution strategy (sequential SDD implementer dispatches satisfy the Subagent Contract's no-parallel-fan-out rule for Frontier; batched execution has no such guarantee). Re-run with the subagent strategy, or drop tier=frontier."`
3. If the resolved strategy is `subagent`, proceed — `tier=frontier` binds only inside the **subagent** branch below.

This sequential-dispatch precondition is a *distinct* bound from the actual **cost** bound: the per-run cap is `frontier-run-cap` (`.claude-tweaks/policy.yml`, default 3 — `_shared/subagent-output-contract.md`'s Model Selection section), enforced by `bin/resolve-profile.js` per dispatch, independent of this strategy check.

> **Working Directory Discipline:** Before any commit (and before dispatching subagents that run `git` or `node --test`), anchor the working directory explicitly — `pwd` + `git rev-parse --show-toplevel` must match the worktree path (or the project root in `current-branch` strategy). When dispatching subagents, require them to use `cd "$WORKTREE" && …` or `git -C "$WORKTREE" …`. See the Working Directory Discipline section of `_shared/subagent-output-contract.md` for the full pattern.

**subagent** (default): Check the materialized header's `size:` field (`skills/flow/materialize.md`'s reader table — the header's model-tier signal; a pre-rename header carries `effort:` instead, read as `size` when no `size:` line is present, per that file's "Reading a pre-rename header"). If present, invoke `/superpowers:subagent-driven-development` with an explicit instruction to default every per-task implementer dispatch in this spec to the corresponding model tier — `low` → Fast, `medium` → Standard, `high` → Capable — overriding that skill's own per-task complexity heuristic for this spec's tasks specifically (a spec whose originating finding was already judged cheap or expensive to fix doesn't need re-deriving that signal from file-count heuristics). When the header carries no `size:` field, invoke `/superpowers:subagent-driven-development` with no tier override. **Forward the spec's Acceptance Criteria to per-task review:** in the same invocation instruction, also direct `/superpowers:subagent-driven-development` to include the relevant excerpt of this spec's own `## Acceptance Criteria` section — read from the materialized spec at `{run-dir}/work/{n}-spec.md`, never re-fetched from the live GitHub issue or re-derived from the task brief — alongside the diff and the task's own brief in every per-task review dispatch, so a per-task review can catch a task brief that misstates a spec criterion instead of relying solely on the final whole-branch review. **`tier=<fast|standard|capable|frontier>` token:** when present in `$ARGUMENTS`, it always wins over the `size:`-derived tier (or the no-override default) for this run only — a one-off way to force extra rigor (or cut cost) on a specific build without re-triaging or re-specifying the record. **`tier=frontier` specifically** (guard above; strategy precondition already confirmed `subagent`): instruct `/superpowers:subagent-driven-development` to resolve each sequential per-task implementer dispatch via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier --run-dir "$PIPELINE_RUN_DIR"` (`_shared/subagent-output-contract.md`'s Model Selection dispatch procedure) rather than hardcoding Fable — degradation to Capable (cap exhausted, non-interactive context, or stance below `default`) is handled entirely by that resolver call and logged in its `source`; this step never re-enumerates the degrade preconditions locally. **Whole-branch review model.** In the same invocation instruction, also direct `/superpowers:subagent-driven-development` to resolve its own final whole-branch review dispatch via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" capable --run-dir "$PIPELINE_RUN_DIR"` and pass the resolved `model` explicitly on that one dispatch — this review is a third-party dispatch, not one of `_shared/subagent-output-contract.md`'s enumerated Frontier singleton slots, so Capable is the ceiling here regardless of `tier=frontier`. An explicit per-invocation `model` overrides the session's own `/model`/effort (that file's Overrides section, probed 2026-08-17) — this is what keeps a session-level model change from silently downgrading the review. Log the resolution: `AUTO {time} — Whole-branch review dispatched on {model} (resolve-profile.js capable). Reversibility: n/a (dispatch-time model selection, not a code mutation).` After the final code review completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps (simplification, alignment, verification) before any branch finishing.

**batched**: Invoke `/superpowers:executing-plans`. After the last batch completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps before any branch finishing.

**Maturity-scaled test discipline (both strategies, all modes):** resolve `project-maturity` once per build — `MATURITY=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values project-maturity)`. The resolver's schema default is `greenfield`, and a value outside the four-item enum also resolves to `greenfield` — either way, add nothing. Fold one additional instruction into whichever execution skill was invoked above:

| Maturity | Added instruction |
|---|---|
| `greenfield` / `pre-launch` (or missing) | None |
| `early-production` | "For any task modifying pre-existing behavior, write a quick smoke test capturing current behavior before changing it." |
| `established` | "For any task modifying pre-existing behavior, write a full characterization test covering edge cases before changing it — published or external consumers may depend on them." |

"Pre-existing behavior" is judged by the implementer subagent itself, per task, using the same judgment it already applies deciding what to test under normal TDD — this does not introduce new mechanical file-existence or lexical-verb detection to make that call for it.

#### Superpowers Failure Handling

If the execution skill (or `/superpowers:writing-plans` in Step 3) fails, read `failure-recovery.md` in this skill's directory for the full recovery table (not-installed, timeout/partial output, malformed plan, subagent failures, batch rejection) and the project-specific context CLAUDE.md should document for implementer subagents.

### Common Steps 3 + 4.5: Simplification and Alignment

Common Step 3 (Code Simplification) and Common Step 4.5 (Architecture Alignment Check) operate on independent concerns, but both can independently commit (Step 3's simplifier changes; Step 4.5's Beneficial-classification spec updates) — running them concurrently risks the same shared-worktree git-index race CLAUDE.md's own Don'ts section warns against (a `git add`/`git commit` from one step sweeping in the other's concurrently-staged files). Run them sequentially instead: complete Common Step 3 (including its own commit, if any) before starting Common Step 4.5. Common Step 5 (Final Verification) gates after both are done.

### Common Step 3: Code Simplification

After all implementation tasks are complete, run `/claude-tweaks:simplify` on the recently modified code (files changed during this build session).

The simplify skill handles scope resolution, running the code-simplifier subagent, and re-verification after changes. See `/claude-tweaks:simplify` for details.

If the simplifier makes changes, commit them separately.

### Common Step 4: Handle Blocked Work

If any part of the plan is blocked (missing infrastructure, unresolved dependencies, pending external work):

1. Document blocked items:
   - **Record mode:** add to the materialized spec file under a "Blocked / Future Work" section
   - **Design mode:** file a backlog work record via `/claude-tweaks:capture`
2. Note what unblocks them
3. Append blocked items to the open items ledger (see `/claude-tweaks:ledger`) with phase `build/*` and status `open`
4. These are resolved by the ledger resolve gate (`/claude-tweaks:ledger resolve`), run by `/claude-tweaks:wrap-up`'s Phase 3 ledger gate or `/claude-tweaks:flow` Step 5 — not by `/claude-tweaks:help`, which does not scan ledger files

**Follow-up ideas (independent of blocking).** If, while implementing, you notice an opportunistic improvement or idea outside the current spec/design's scope — not blocking the current work, just observed in passing — file it via `/claude-tweaks:capture` as a fresh backlog work record before it's lost, rather than inflating this build's scope. This applies in both spec and design mode, and runs regardless of whether any part of the plan is actually blocked.

### Common Step 4.5: Architecture Alignment Check

Compare what was actually built to what the spec or design doc said. For the full diff procedure, mismatch categorization (Beneficial / Fix now / Update the spec), the batch decision table format (interactive vs. auto-mode handling), and the Skill Observation sub-step, read `architecture-alignment.md` in this skill's directory.

Architecture-alignment learnings that outlive this project route via `skills/_shared/learning-routing.md` rather than defaulting to a ledger entry.

**Skip this step if:** design mode with no formal spec, the plan was trivial (< 3 tasks, single-file changes), or `config.yml`'s `ceremony-profile` is `fast-lane` — see `architecture-alignment.md`'s own Skip section for the full rationale (why fast-lane skip is deliberate, not an oversight, and what the safety net is).

When a mismatch is an architectural deviation at module level — a boundary in the wrong place, an interface nearly as complex as what it wraps — route it to `/claude-tweaks:deepen` for a dedicated module-depth pass rather than to Common Step 3's `/claude-tweaks:simplify`, whose scope is line-level cleanup.

### Common Step 5: Final Verification

After code simplification, run the shared verification procedure (`skills/test/verification.md`). This runs type checking, linting, and tests using the project's commands from CLAUDE.md.

**Note:** `/build` always runs verification (it is the *producer* of `VERIFICATION_PASSED`). The skip-if-recent rule in `test/verification.md` applies only to `/test` callers — never to this step. On a pass, also capture `VERIFICATION_SHA=$(git rev-parse HEAD)` — passed forward alongside `VERIFICATION_PASSED=true` so `/test`'s skip-if-recent check can detect a tree change between this step and its own invocation (see `verification.md`'s "Skip-if-recent" section) instead of trusting a bare boolean.

If anything fails, fix it and commit the fix. **When a failure is a behavioral bug — not a mechanical type/lint error — follow the reproduce-first discipline in `_shared/reproduce-first-discipline.md` before changing code** (reproduce on command, fix the confirmed cause, escalate rather than guess if it can't be reproduced; once green, walk the causal-depth chain per the discipline's step 3) — see `failure-recovery.md` for the fuller recovery table this step falls back to.

### Common Step 5.5: Operational Checklist

After verification passes, check for operational tasks that are easy to forget — deployment and environment concerns that slip through code review (schema/migration files, env access patterns, IaC, CI/CD, container configs).

If your build's diff matches schema/env/IaC/CI/platform-config files, read `operational-checklist.md` in this skill's directory for the full Category A/B trigger lists, check tables, probe-then-classify procedure, and ledger format. Otherwise skip this step entirely.

> **Parallel execution:** Use parallel tool calls — all checks are independent Grep/Glob operations.

### Common Step 6: User Journey Capture

After verification passes, run `/claude-tweaks:journeys`. Pass:
- **Changed files** — files modified during this build session
- **Spec or design doc context** — what was built and why

The journeys skill handles scanning existing journeys, creating new journey files, updating existing ones, and committing. See `/claude-tweaks:journeys` for details.

This is not optional and does not require user input — if you built a feature that any persona interacts with (end user, admin, developer, internal tooling user), the journeys skill documents it.

### Common Step 6.5: Documentation Sync

If `docs/REGISTRY.md` exists, read `docs-sync.md` in this skill's directory for the full procedure (read registry, match changed files against registered patterns, update inline or defer to wrap-up per doc type). If `docs/REGISTRY.md` does not exist, skip this step entirely.

### Common Step 7: Handoff

After successful build, read `handoff-template.md` in this skill's directory and render the handoff using that template. The template covers verification status, what was built, simplification summary, journeys, documentation changes, blocked items, manual steps, and the Actions Performed table.

**Phase exit (`worktree` mode, `integration-model: pr-first` — `_shared/integration-model.md`):** push the branch and flip this phase's PR checklist row — `_shared/git-discipline.md`'s Phase-exit push section and `_shared/pr-early-run-lifecycle.md`'s Phase-checklist update section. A no-op under `local-merge` or `current-branch` mode.

## Git Strategy

**worktree** (default): Before any work begins, `/superpowers:using-git-worktrees` creates an isolated workspace on a feature branch. All commits land in the worktree. At handoff, `/superpowers:finishing-a-development-branch` handles merge, PR, or discard — do NOT auto-merge or auto-PR.

**current-branch**: Commit directly on the current branch. No isolation. Unavailable when `.claude-tweaks/policy.yml` sets `worktree-always: true` — the mechanical PreToolUse gate denies edits outside a worktree regardless of what this lever says.

## Git Rules

These rules apply in ALL modes. See `_shared/git-discipline.md` for the canonical Git Rules table (never reset, never force push, stage specific files only, verify commits landed, etc.) and the merge conflict resolution procedure. After resolving a merge conflict, run verification (Common Step 5) to confirm the resolution didn't break anything.

## Autonomy Rules

These apply in **subagent** execution strategy. In **batched** strategy, autonomy rules apply within each batch but execution pauses between batches for human review.

- **Do not ask for feedback** during execution. Make reasonable decisions and keep moving.
- **Do not ask "should I proceed?"** — yes, you should. Always.
- **Do not present options** — pick the best one and implement it.
- **If ambiguous**, choose the simpler approach and note the alternative in a code comment.

## Next Actions

Generate 2-4 lines based on context. The signal-to-option lookup table below stays as-is — it's the assistant's own logic for picking which lines apply to the current build's signals, never itself shown to the user:

| Signal | Option |
|--------|--------|
| UI changed + browser available | `/claude-tweaks:review {N} full` — code + visual review **(Recommended)** |
| No browser or no UI | `/claude-tweaks:review {N}` — code review **(Recommended)** |
| QA stories exist (`stories/*.yaml` or `stories/*.yml`) | `/claude-tweaks:test qa` — validate {X} QA stories before review |
| Worktree mode | `/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch **(Recommended in worktree mode)** |

Once the signals are resolved, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention), one line per applicable signal, bolding whichever line is recommended and suffixing it `(recommended)` — normally the review line, chosen per the browser-availability signal above (do not collapse the two branches into always-`full`: UI changed AND a browser is available → the full-review line; otherwise → the plain-review line); in worktree mode, the finish-branch line takes the recommended slot instead:

`/claude-tweaks:review {N} full` — code + visual review (when UI changed and a browser is available)
`/claude-tweaks:review {N}` — code review (when no UI change or no browser)
`/claude-tweaks:test qa` — validate {X} QA stories before review (when QA stories exist)
`/superpowers:finishing-a-development-branch` — merge, PR, or discard the feature branch (when in worktree mode)

## Component-Skill Contract

`/claude-tweaks:build` is invoked by `/claude-tweaks:flow` as the implementation stage of the pipeline. Parent invocation is signaled by the `$PIPELINE_RUN_DIR` env var (set by `/flow` when it spawns this skill — also resolvable via the most-recent matching run under `.claude-tweaks/pipelines/`). When `$PIPELINE_RUN_DIR` is set, omit the `## Next Actions` block at the end of Step 7 — the parent `/flow` owns the handoff and renders its own Pipeline Summary + Next Actions. When invoked directly by a user (no `PIPELINE_RUN_DIR`), render Next Actions as documented in Step 7. The Manual Steps section likewise defers its rendering to the parent's summary when invoked under `/flow` (see Step 7's `handoff-template.md`).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Building without a spec or design doc | No clear scope — scope creep and unverifiable results |
| Asking for feedback during subagent execution | Subagent strategy is fully automated — make reasonable decisions and keep moving |
| Using `git reset` or `git checkout .` | Other processes may be committing concurrently — destroys their work |
| Skipping code simplification | Iterative implementation accumulates complexity across tasks |
| Building a spec with unmet prerequisites | Downstream specs depend on upstream work — check the dependency graph first |
| Skipping journey capture for features with an interaction surface | Journeys give visual review a path to walk and feed `/stories` for QA generation — every persona: end users, admins, developers, internal tooling. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Asking the user whether to create a journey | Journey capture is automatic — the user didn't know they needed the spec either. |
| Ignoring architectural deviations from the spec | Drift becomes tech debt — catch it in Step 4.5 and explicitly classify every deviation. |
| Guessing at fixes for behavioral bugs without reproducing them | Edit-and-pray turns a 30-minute bug into a 3-hour one — reproduce on command via `/superpowers:systematic-debugging`, then fix the confirmed cause (Common Step 5). |
| Using `batched` execution within `/flow` | `batched` pauses for review every 3 tasks, contradicting flow's hands-off design — use `subagent` with `/flow`. |
| Rewriting docs from scratch during build | Build doc updates are incremental — change what the build touched; full rewrites belong in /wrap-up or /init. |
