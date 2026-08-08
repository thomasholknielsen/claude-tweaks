# Model Profile Strategy — Design

**Date:** 2026-08-08
**Status:** Approved (brainstorm 2026-08-08)
**Scope:** Full strategy — core abstraction, mechanism binding, Fable enablement, config surface, migration and housekeeping. Decomposed into work records by `/claude-tweaks:specify`.

## Context

The Claude 5 family changed two things the plugin's model-selection system was not built for:

1. **Four families, not three.** Fable 5 ($10/$50 per MTok, always-on thinking, minutes-long turns, strongest on long-horizon judgment) sits above Opus 5 ($5/$25). Sonnet 5 ($3/$15; intro $2/$10 ends 2026-08-31; new tokenizer emits ~30% more tokens than Sonnet 4.6) is near-Opus on coding. Haiku 4.5 ($1/$5) remains the floor but is structurally different: 200K context, 64K output, no effort parameter.
2. **Effort is a second axis.** Every 5-family model takes `effort: low|medium|high|xhigh|max`, and the harness exposes it mechanically: `effort:` frontmatter on agents and skills, `/effort` at session level. Opus 5 at `low`/`medium` frequently beats Sonnet at `xhigh` on cost-per-quality — effort tuning is now as large a cost lever as model choice.

The plugin's current system — `Fast | Standard | Capable` mapping to Haiku/Sonnet/Opus in `skills/_shared/subagent-output-contract.md` (`## Model Selection`) — has one dimension, no Fable slot, no effort vocabulary, and no mechanism: tiers are prompt tokens (`[Use: Standard model]`) that nothing resolves, enforces, or tests. The tier vocabulary is restated with family names inline at roughly two dozen dispatch sites (the migration sweep in this design is the enumerator; do not treat any count here as exact). Cloud Routine templates form a second, disconnected model system hardcoding `claude-sonnet-5`. The policy schema has zero model- or cost-related levers. `agents/qa-agent.md` declares no `model:`, so QA dispatches silently inherit the session model.

Claude Code facts this design relies on (verified against docs during the landscape research):

- Subagent `model:` frontmatter accepts `haiku|sonnet|opus|fable|<full-id>|inherit`; omitted means `inherit`.
- The Agent tool accepts a per-dispatch `model` parameter. **No per-dispatch `effort` parameter exists** — effort comes from agent/skill frontmatter, session setting, or `CLAUDE_CODE_EFFORT_LEVEL`.
- `CLAUDE_CODE_SUBAGENT_MODEL` (env) mechanically overrides everything the plugin says; the plugin defers to it visibly.
- No usage-budget query API exists (prior recon: Anthropic declined the analogous request), so degradation triggers keyed to "% of usage limit consumed" are upstream-blocked.

## Decisions (settled at brainstorm)

1. **Abstraction:** work profiles → (model, effort) pairs in one central table; dispatch sites name only the profile.
2. **Override chain:** CLI arg > pipeline run config > `.claude-tweaks/policy.yml` > central table default; harness env vars and session `/model`/`/effort` always win and are documented as doing so.
3. **Fable:** enabled three ways — a Frontier profile at enumerated singleton slots; session-inherit protection everywhere; a human-typed hardest-build opt-in.
4. **Degradation:** deterministic per-run caps and stance levers; harness usage warnings as best-effort signal; true usage-% triggers documented as blocked upstream.
5. **Mechanism:** a `bin/` resolver plus agent frontmatter plus tests — not prose alone.
6. **Naming:** the work-record facet `effort:` is renamed `size:`, leaving "effort" to mean reasoning depth exclusively.

## Section 1 — Profile system core

The contract's `## Model Selection` section is replaced by the canonical work-profile table:

| Profile | Resolves to | Kind of work |
|---|---|---|
| **Fast** | Haiku (no effort dial) | Mechanical: file location, pattern grep, structured extraction, single-file checks |
| **Standard** | Sonnet, effort `high` | Integration: multi-file analysis, cross-cutting findings, format-sensitive transforms |
| **Capable** | Opus, effort `high` | Judgment: synthesis, ambiguous calibration, plan-quality review |
| **Frontier** | Fable, effort `high` | Frontier judgment, singleton-only: verdict gates and compounding self-improvement artifacts. Never valid in a parallel fan-out. |

- Models are **family aliases**, never versioned IDs — the property that let the old table survive the 4.x→5 shift, kept deliberately.
- **Stances shift effort, not model:** `economy` = one effort notch down and Frontier resolves as Capable; `default` = the table; `max-rigor` = one notch up, capped at `max`. Fast is stance-invariant.
- Dispatch grammar becomes `[Use: {Profile}]`. Sites never restate family names.
- Selection rule unchanged: default to the cheapest profile that fits the work. Upgrade path unchanged: an agent returning `BLOCKED` for reasoning reasons (not context reasons) upgrades one profile. Capable→Frontier upgrades are valid only at the enumerated singleton slots (Section 3).
- The contract's existing rationale stance stands: profile selection is dispatch correctness first; cost is the welcome side effect. The inherited-CLAUDE.md fan-out sizing rule is unchanged and gains one sentence noting the Sonnet 5 tokenizer makes the inherited payload ~30% more expensive in tokens.

## Section 2 — Resolver and mechanism binding

**New module `bin/lib/model-profiles/`** (flat sibling directory, per convention):

- Exports the canonical profile data (the same rows as the markdown table) and `resolve(profile, {policy, stance, cliOverride})` → `{model, effort, source}`, merging in the decision-precedence order. `source` names which layer decided (table default / policy row / run stance / CLI), enabling audit-log lines.
- A thin CLI, `bin/resolve-profile.js`, reads `.claude-tweaks/policy.yml` and the active run's config and prints the resolution as JSON. Dispatching skills call it and copy `model` into the Agent tool's `model` parameter.
- **Fail loudly:** unknown profile, malformed policy, or an unresolvable override errors — never a silent default. A visible wrong-model error is cheap; a silent one is not.
- Frontier accounting lives here too (Section 3): resolving Frontier appends a tally line to the active run dir and enforces the cap before returning.

**Table pinning:** a test asserts the markdown table in `subagent-output-contract.md` matches the exported data — the `GATE_COVERAGE` precedent. Per IL-105, the test must be built by negating each claim and confirming the assertion fails, and the new `bin/lib/model-profiles/tests/` glob must be added to `package.json`'s test script (IL-84).

**Effort binding is honest about its limits.** Model binds mechanically (Agent tool `model` param). Effort binds mechanically only where we own the agent definition: `agents/qa-agent.md` gains `model: sonnet` and `effort:` frontmatter (closing the live inherit leak). For generic Task dispatches, the resolver emits a standard effort-instruction line for the dispatch prompt — an upgrade from the current self-disclaimed nudge in `review/step3-lens-dispatch.md`, but documented as best-effort. **Upstream watch item:** a per-dispatch effort parameter on the Agent tool; adopt it the release it exists.

**Session-inherit protection (contract rule):** no dispatch omits `model`. Inheriting the session model is only ever an explicit, stated choice ("[Use: inherit — reason]"), never the silent default. This is what makes running a session on Fable or Opus safe: fan-outs cannot silently bill at the session model's price.

## Section 3 — Frontier enablement, caps, degradation

**Eligible slots** (enumerated in the contract; nothing else may resolve Frontier):

- *Verdict gates:* `/review` gap-sweep (single-source by design), `/review` debate arbitration, `/specify` red-team synthesis (the aggregator, not the persona fan-out), `/challenge` framing verdicts.
- *Compounding self-improvement:* `/wrap-up` learning capture and skill updates, `/reflect` synthesis, `/feedback` scrub judgment, `/init` harness generation (interactive runs only). These steps become dispatched Frontier singletons whose input is run artifacts — git log, ledger, `decisions.md`, `events.jsonl` — assembled by the main thread per the contract's input discipline. Never a conversation-inheriting fork (IL-07).

**Resolution preconditions**, all enforced by the resolver:

1. Interactive session — unattended contexts (Routines, `/dispatch next`, any headless run) always resolve Frontier as Capable.
2. Stance at `default` or above (`economy` resolves Frontier as Capable).
3. Per-run cap not exhausted: default **3 Frontier dispatches per pipeline run**, tallied in the run dir; standalone skill invocations without a run dir get a cap of **1 per invocation**.

Any precondition miss degrades Frontier→Capable (one step only, never further) and writes one `AUTO` line to the auto-decision log with the reason. A harness usage-limit warning observed mid-session degrades the remainder of the run — best-effort, not load-bearing. Usage-percentage triggers are **blocked upstream** (no budget query API); revisit if Anthropic ships one.

**Hardest-build opt-in:** `/build`'s existing `tier=` grammar gains `frontier`. Per-task implementer dispatches run on Fable; this stays within the no-fan-out rule because SDD implementer dispatches are sequential (IL-43). Deliberately human-typed only: the `size:`→profile bridge tops out at Capable, and no label or policy value can auto-select Frontier for a build.

## Section 4 — Config surface

**New policy keys**, registered in both `skills/_shared/policy-schema.md` and `bin/lib/policy-schema.js`:

| Key | Type / values | Default | Effect |
|---|---|---|---|
| `model-profiles` | map: profile → `{model, effort}` | unset | Overrides table rows ("my Standard is Opus low") |
| `model-stance` | `economy \| default \| max-rigor` | `default` | Project-default stance |
| `model-ceiling` | profile name | unset | Clamps every resolution at that profile ("never Capable", "no Fable ever") |
| `frontier-run-cap` | integer ≥ 0 | 3 | Frontier dispatches per pipeline run (0 disables Frontier) |

The **Pipeline Config Manifesto** gains one stance lever inside its existing single block — no new stops, honoring the auto-mode contract. The chosen stance is recorded in the run's `config.yml`; every resolution that deviates from the table default (policy row, stance shift, ceiling clamp, cap degradation, CLI override) writes to `decisions.md`. While touching the schema, the orphaned `research-mode` key referenced by `skills/research/SKILL.md` is registered (pre-existing gap).

**Routines:** all six `routine-template.yml` files stay `model: claude-sonnet-5`. Grounds: the sweeps are Standard-kind judgment work, and Haiku's 200K context and missing effort dial argue against downgrade. The decision rests on work-kind, not the intro pricing window, and no pricing prose is added to templates. Two changes: `model` joins `SIGNIFICANT_FIELDS` in `bin/lib/routine-template-parser.js` (so model drift surfaces at record level, matching the API-level check `skills/routine/status.md` already does), and `/claude-tweaks:routine` documents the existing `session_context.model` override instead of growing a new flag.

## Section 5 — Migration, housekeeping, boundaries

**`size:` facet rename.** `gh label edit` renames the three `effort:*` labels in place (label rename propagates to all existing records). Prose sweep — case-insensitive, per IL-21 — across `skills/_shared/work-record.md`, `skills/flow/materialize.md` (build-header field and its consumer note), `skills/build/SKILL.md` (the bridge becomes `size:` low→Fast / medium→Standard / high→Capable; the `tier=` argument grammar is unchanged except for gaining `frontier`), and backlog/autonomy references. The `argument-hint` of any skill whose `## Input` mentions the facet is updated in the same change (frontmatter convention).

**Restatement sweep.** Every dispatch site drops family parentheticals to bare profiles (`[Use: Standard]`). The sweep task enumerates sites by grepping for the old forms; the unresolved `{Standard | Capable}` placeholder in `skills/_shared/multi-agent-coordination.md` resolves to Standard, matching `bin/lib/coordination.js`'s default.

**Contradiction and gap fixes.**

- Contract examples corrected: red-team *personas* are Standard (matching `skills/specify/red-team.md` and `multi-agent-coordination.md`); red-team *synthesis* is Capable and Frontier-eligible.
- `/journeys` and `/stories` gain explicit Fast declarations at their dispatch sites (they are named as Fast exemplars in the contract but declare nothing today).
- `tests/statusline.test.js` fixtures move off `claude-sonnet-4-6` to current family names (display inputs only; behavior unchanged).

**Testing.** New suites: table pinning (contract ↔ exported data), override-chain resolution, ceiling clamping, Frontier cap enforcement and tally, degradation logging. All authored with the IL-105 discipline (negate each claim, confirm the red) and IL-80 discipline (fixtures, not live prose, wherever a test would otherwise read content this design also changes).

**Deliberately out of scope (YAGNI):**

- Fast mode — a session-level user call (Opus-only, first-enable re-bills context); one documentation line at most, no machinery.
- OTEL cost accounting — a pointer in docs; no plugin machinery.
- Auto-routing classifiers (complexity scorers picking models per request) — the profile table plus human override is the deliberate opinion.
- Statusline changes — it already renders model and effort.

## Cross-cutting conventions owed at implementation

- `docs/skill-graph.md` gains edges for any new component invocation (e.g., wrap-up/reflect dispatching Frontier singletons).
- `/help` and `README.md` sync if any user-facing grammar changes (`tier=frontier`).
- CLAUDE.md's Subagent Contract paragraph updates its tier sentence to profile vocabulary — one place, since the canonical definition lives in the contract.
- Version bump, CHANGELOG entry, `shipped-versions.tsv`, and marketplace mirror per the Releasing convention at ship time.

## File-touch list (for /specify cross-check, per IL-56)

| Area | Files |
|---|---|
| Contract + table | `skills/_shared/subagent-output-contract.md` |
| Resolver + tests | `bin/lib/model-profiles/` (new), `bin/resolve-profile.js` (new), `package.json` (test glob), `bin/lib/model-profiles/tests/` (new) |
| Policy | `skills/_shared/policy-schema.md`, `bin/lib/policy-schema.js` |
| Manifesto / auto-mode | `skills/_shared/auto-mode-contract.md`, `skills/_shared/auto-decision-log.md` (entry-type example) |
| Frontier slots | `skills/review/step3-debate-and-refutation.md`, `skills/review/step3-lens-dispatch.md`, `skills/specify/red-team.md`, `skills/challenge/SKILL.md`, `skills/wrap-up/SKILL.md`, `skills/reflect/SKILL.md`, `skills/feedback/SKILL.md`, `skills/init/SKILL.md` |
| Build bridge | `skills/build/SKILL.md` (incl. `argument-hint` for `tier=frontier`), `skills/build/build-options.md` (the options matrix restates the `tier=` grammar), `skills/flow/materialize.md` |
| Inherit protection | `agents/qa-agent.md`, contract rule |
| Restatement sweep | dispatch sites in `skills/review/`, `skills/tidy/`, `skills/help/`, `skills/browse/`, `skills/visual-review/`, `skills/simplify/`, `skills/test/`, `skills/docs-health/`, `skills/harness-health/`, `skills/dispatch/`, `skills/init/`, `skills/research/`, `skills/_shared/multi-agent-coordination.md`, `bin/lib/coordination.js` |
| Routines | `bin/lib/routine-template-parser.js`, `tests/routine-template-parser.test.js`, `skills/routine/SKILL.md` (doc note) |
| `size:` rename | GitHub labels (gh label edit), `skills/_shared/work-record.md`, `skills/flow/materialize.md`, `skills/build/SKILL.md`, backlog/autonomy references |
| Fixtures | `tests/statusline.test.js` |
| Docs | `docs/skill-graph.md`, `README.md`, `skills/help/` (if grammar changes), `CLAUDE.md` (contract paragraph) |

## Success criteria

1. Every dispatch site names a profile only; a grep for `(Haiku)`, `(Sonnet)`, `(Opus)` alongside tier names in `skills/` returns nothing outside the contract.
2. `resolve()` honors the full precedence chain under test, and the contract's table cannot drift from the resolver's data without a red suite.
3. A session running on Fable dispatches nothing at Fable prices unless a Frontier slot, the cap, and the stance all permit it — and every such resolution is visible in `decisions.md`.
4. A project can express "my Standard is Opus low", "never above Standard", and "no Fable" in `policy.yml` without editing any skill.
5. The word "effort" in plugin prose refers only to reasoning depth; records carry `size:`.
