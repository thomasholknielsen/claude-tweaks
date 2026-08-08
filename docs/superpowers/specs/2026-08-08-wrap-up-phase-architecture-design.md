# Wrap-Up Phase Architecture — Design

**Date:** 2026-08-08
**Status:** Approved for planning
**Scope:** `skills/wrap-up/` restructure, new `bin/wrap-up-engine.js` + `bin/lib/wrapup/`, report contract rewrite

## Problem

`/claude-tweaks:wrap-up` has accreted 17 numbered steps and 16 sub-files (~2,800 lines; SKILL.md at 40.9 KB, past the 40 KB soft ceiling). Two measured failures motivate this redesign:

1. **Report drift.** Steps 6–7.12 each carry their own mandatory `SCANNED` line template — seven bespoke formats. A real run (v6.70.0's wrap-up) rendered seven full `SCANNED` paragraphs inline in seven different shapes, leaking internal vocabulary (`D0`, `domain-overlap`, `gap detection: run`, `2-of-3 criteria`) that `summary-template.md`'s own rules say must never reach the reader. The template asked for one compressed Evidence line; the model produced seven paragraphs. One prose template per step is too many templates to hold.
2. **Structural duplication.** Steps 6–7.12 are one mechanism written out seven-plus times: gate → scope selection → judgment → disposition → audit line. Each instance hand-writes its own gate prose, staging semantics, and null-result handling, and the copies drift independently (6.1 and 7.9 both answer "does CLAUDE.md need updating?" with different trigger lists).

The user's report requirements: the summary must read as a **per-step log in execution order**, where a step that found nothing is still present as a line; output rendered as friendly markdown tables; internal vocabulary never surfaces.

## Design summary

Four named phases replace the 17-step numbering. Phase 2's seven-plus curation steps collapse into **one engine + a declarative registry**. The engine's mechanical parts — gates, scope selection, ordering, audit lines, report rendering — move into **tested Node code** (`bin/wrap-up-engine.js`); the model supplies only judgment, as structured findings per registry row. The report becomes the engine-rendered trace of the run: it cannot drift because the model never formats it.

```
Phase 1: ESTABLISH — what happened here?
Phase 2: ROUTE     — where does each learning/update belong? (engine + registry)
Phase 3: SETTLE    — is anything left dangling?
Phase 4: CLOSE     — one decision point, execute, verify, hand off
```

## Phase 1 — Establish

Merges current Steps 1+2 (context identification + work summary — both cheap context-establishment), then reflect (Step 3, delegation to `/claude-tweaks:reflect` unchanged, light/full mode selection unchanged), then the ceremony escape hatch (Step 3.5) as a mechanical footnote.

**New: run-dir everywhere.** Phase 1 creates a pipeline run directory unconditionally — standalone or pipeline, record or conversation mode. `.claude-tweaks/pipelines/{ISO-timestamp}-{slug}/` with `config.yml`, `decisions.md`, `staged/`. Consequences:

- One code path for staging and the console in every mode (the standalone/pipeline bifurcation is what produced today's fragmented standalone experience).
- `resume` works for standalone runs.
- The audit trail survives the session.
- Hook compatibility: the run is created `status: active` and closed through the normal archival path (cleanup item 8), so E1 enforcement and the interrupted-run reaper see nothing unusual. The plan must include a verification task for this (hooks key off run-dir existence; a conversation-mode wrap-up creating one is new state).

Phase 1 outputs: work identity (record vs. conversation), shipped state (verbatim from `bin/wrap-up-state.js`), the reflection insight set, the effective ceremony profile, and the run dir path.

Input resolution (`$ARGUMENTS`: `#N` / context / `resume` / flags `--dry-run`, `--skill-budget`, `--doc-budget`) is unchanged in semantics; `resume` now also recovers standalone runs.

## Phase 2 — Route (engine + registry)

### The registry

A table in SKILL.md — the single declaration of what wrap-up curates. Row fields:

| Field | Meaning |
|-------|---------|
| Target | Knowledge asset, reader-facing name (this exact string appears in the report) |
| Gate | Cheap deterministic signal deciding whether the judge file is read |
| Scope | Candidate selection when the gate opens (diff overlap, domain ranking + budget, classifier output) |
| Judge | Sub-file holding the judgment procedure |
| Disposition | `apply` (reversible, in-budget) / `stage` (console) / `stage-only` (never auto-applies) |

The nine rows, in order (ordering is load-bearing — Memory and Upstream are learning-routing's fallback destinations and can only classify what earlier rows didn't claim):

| Target | Gate | Scope | Judge | Disposition |
|--------|------|-------|-------|-------------|
| Skills | `.claude/skills/` exists OR cohesive multi-file diff pattern | Seeds + domain-overlap top-5 (fast-lane: 2; `--skill-budget`) | `skill-curation.md` | apply/stage |
| Docs | `docs/` non-empty | Touched + domain-overlap top-3 (fast-lane: 1; `--doc-budget`) | `docs-health-integration.md` | apply/stage |
| Journeys | Any `docs/journeys/*.md` exists | `files:` frontmatter ∩ diff (deterministic, no budget) | `journey-curation.md` | apply/stage |
| CLAUDE.md & rules | Union of 6.1's convention triggers + 7.9's audit triggers (Don't candidate, renamed command, contradicted convention, incident recorded) | CLAUDE.md + `.claude/rules/` | `claude-md-curation.md` (new; merges 6.1 + 7.9) | **stage-only** (standing CLAUDE.md exception) |
| Decision records | Three-factor ADR gate (unchanged) | Decisions surfaced this run | `adr-curation.md` (new; from 6.2) | stage |
| Memory | Any insight classifies D4 after earlier rows claimed theirs | Unrouted insights | `memory-curation.md` | stage |
| Upstream feedback | Any learning classifies D5 | D5 learnings; self-reference collapse intact | `upstream-feedback.md` | stage |
| Broken references | `git diff --diff-filter=RD` non-empty OR renamed headings | Repo-wide survivors of renamed/deleted targets | `reference-sweep.md` | apply/stage (initiative budget) |

(Eight structural rows; "nine" in conversation counted 6.1 and 6.2 separately — the merged CLAUDE.md row absorbs 6.1, and ADRs are their own row. The registry table above is authoritative.)

### The engine: `bin/wrap-up-engine.js`

Three verbs. All mechanical; no judgment.

- **`plan`** — input: diff base, registry (shipped as data in `bin/lib/wrapup/registry.js`, mirroring SKILL.md's table), flags, ceremony profile. Computes every gate and scope deterministically. Output: JSON worklist — per row: open/closed, gate reason, candidate file list, applied budget. Gates become tested code (precedent: `bin/wrap-up-state.js`, `bin/lib/issues/blast-radius.js`).
- **`record`** — input: one row's structured findings from the model (JSON). Validates shape (IL-01: parsed external JSON never spread after derived fields), writes the row's `SCANNED` audit line to `decisions.md` itself, appends the telemetry line, accumulates state in the run dir. A row that never called `record` is a detectable hole at `render` time — the silent-skip prevention becomes an assertion, not a prose request.
- **`render`** — emits the phase-trace report tables (markdown) and the console section data from accumulated state. The model never formats the report. Rendering is unit-testable against fixture runs — the first time any part of wrap-up's output is testable at all.

Degradation: engine absent or erroring → fall back to the prose path. The fallback is `curation-engine.md`'s **generic** per-row contract (gate → scope → judge → disposition → report row) executed manually against the SKILL.md registry table — one prose copy of the mechanism, not a per-judge copy; the judge files carry only judgment procedure in both modes. The report must state which path ran. This keeps exactly two copies of the mechanism (one code, one generic prose), pinned against each other per Risk 2 — never the seven-plus copies the current design has.

### Judgment dispatch

Judges receive engine-built clean-room prompts: scope + candidate paths + the literal output JSON schema, mechanically inlined by `plan`'s output (satisfying the Subagent Contract's "references don't reach agents" rule by construction).

> **Parallel execution (conditional):** When `plan` reports 3+ open gates, dispatch judges as parallel Task agents per the Subagent Contract (status line, Template-style structured output, model tier per row — Fast for deterministic-scope rows like Journeys/References, Standard for Skills/Docs). Otherwise run sequentially in the main thread. Memory and Upstream always run after the others complete (ordering dependency).

### Telemetry

`record` appends one line per row per run to a durable outcomes file (pattern: `docs/shipped-versions.tsv`): `{date}\t{run-id}\t{target}\t{gate: open|closed}\t{findings}\t{disposition}`. Location: `.claude-tweaks/wrap-up-outcomes.tsv` (project-local state, gitignored parent already handled — verify against IL-06's explicit-subdirectory rule during planning). Consumers: `/claude-tweaks:harness-health` gains a data source for proposing registry-row demotion (rule-expiry pattern: a row with zero findings across N runs is a demotion candidate, on positive evidence).

### Vocabulary rule (engine-level)

Internal identifiers — D0–D5, "gap detection", "domain-overlap scan", step numbers, route codes — never reach the rendered report. `render` owns this: it maps internals to reader-facing names (generalizing `summary-template.md`'s existing D1–D5 → named-destination table). Full audit detail (scope counts, budgets, gate reasoning) goes to `decisions.md` only.

## Phase 3 — Settle

Unchanged in substance, renumbered:

- Leftover-work routing (current Step 4; record mode; `leftover-routing.md` unchanged).
- Residue sweep + ledger resolve gate (current 8.5; `residue-sweep.md`, `nothing-left-behind.md`, `ledger/resolve-gate.md` unchanged). Ledger Phase 2's mandatory per-item input stays **outside** the console, per the auto-mode contract's never-silenced list.
- Unblocked-records lookup (current Step 8): demoted from a numbered step to an informational input feeding Phase 4's Next Actions. `unblocked-records.md` unchanged.

## Phase 4 — Close

### One console, every mode

The Review Console runs in every mode, reading the run dir Phase 1 guaranteed. Pipeline `auto`/`hybrid`: unchanged. Standalone/interactive: the console replaces current Step 9's batch decision AND the three per-item Q#/M#/U# ask sequences — queue writes, memory updates, and upstream feedback become console sections, itemized and visible, decided by the single Approve-all/Override/Stop call. This satisfies the contract's never-silenced list: silence means acting without surfacing; the console surfaces each item explicitly and Override preserves per-item control.

`MULTISPEC_REVIEW_DEFER=1` semantics unchanged (skip per-spec console; `/flow`'s consolidated console owns approvals).

**Empty-console fast path adjustment:** with run-dir archival (cleanup item 8) now unconditional, the fast path's "no cleanup actions apply" condition would never hold. Fix: the emptiness test ignores unconditional bookkeeping rows (run-dir archival). Archival still executes; it is not decision-worthy.

The Auto-merge short-circuit stays in the console file, with its existing belt-and-braces gate.

### Plan + execute

Current Steps 5 and 10 stay a pair with unchanged semantics — cleanup is planned, approved at the console, then executed; nothing is deleted before approval. Note the ordering change from today: cleanup *planning* moves from before the curation steps to Phase 4. Safe because Step 5 never executed anything.

`--dry-run` semantics unchanged: full analysis, engine runs `plan`/`record` normally, `render` marks the report as a preview, no commits/deletions/`gh` writes/pushes.

### Report: the phase-trace

Rendered by the engine. Structure, in order:

1. **Header** — `## Wrap-Up: {title}`, one-line Verdict, State block (verbatim `wrap-up-state.js` output; base-resolution rules unchanged).
2. **Phase 1 table** — mode, record identity, ceremony profile, reflection outcome.
3. **Phase 2 table** — the registry trace: `| Target | Result | Detail |`, all rows always present, registry order. Result ∈ `n/a` / `clean` / `{n} applied` / `{n} staged`; Detail in plain language ("Read 1: upstream-drift", "Amendment notes: ADR-0008, ADR-0009").
4. **Phase 3 table** — `| Check | Result | Detail |` for leftover routing, residue sweep, ledger gate, unblocked records.
5. **Phase 4** — console outcome; **Actions Performed table** per the CLAUDE.md convention (`| Action | Detail | Ref |`; History never folded into Operational); closure line; Next Actions.

What dies: the category-bucketed top-level sections (Decisions / Outstanding / Routed / Evidence). Their content survives in place: needs-your-call items ARE the console, routed learnings ARE Phase 2 rows, outstanding items ARE Phase 3 rows with dispositions. Information appears where it happened.

Conversation-mode variant: same shape, record-keyed pieces dropped (as today's template does).

### Next Actions + Component-Skill Contract

Unchanged: `$PIPELINE_RUN_DIR` set by a parent orchestrator → omit Next Actions. Note the signal now needs care — wrap-up itself creates a run dir in Phase 1. The CSC signal becomes: run dir **inherited from the environment at invocation** (parent set `$PIPELINE_RUN_DIR` before invoking) vs. **created by this wrap-up run**. The engine records which case applies in `run-state.json` at creation time so the distinction is stateful, not inferred.

## File structure changes

| File | Change |
|------|--------|
| `SKILL.md` | Rewritten: phases + registry table + engine invocations. Target well under 40 KB |
| `curation-engine.md` (new) | Engine contract: verbs, JSON shapes, vocabulary rule, degradation path. Read once at Phase 2 entry |
| `bin/wrap-up-engine.js` + `bin/lib/wrapup/` (new) | plan/record/render + registry data + tests (`bin/lib/wrapup/tests/` — remember the package.json glob, IL-84) |
| `skill-curation.md`, `docs-health-integration.md`, `journey-curation.md`, `memory-curation.md`, `upstream-feedback.md`, `reference-sweep.md` | Slimmed to pure judge procedure; gate/SCANNED/staging boilerplate removed (now engine-owned) |
| `claude-md-curation.md` (new) | Merged judge: 6.1's convention/size-budget/incident-discipline content + 7.9's audit triggers |
| `adr-curation.md` (new) | 6.2's content (three-factor gate, existing-convention detection) |
| `config-updates.md` | Deleted (content split into the two new judges) |
| `summary-template.md` | Rewritten as the phase-trace template (engine-rendered; file documents the shape and the conversation-mode variant) |
| `review-console.md` | Console kept; standalone/pipeline bifurcation removed; fast-path emptiness test adjusted |
| `cleanup-procedures.md`, `residue-sweep.md`, `nothing-left-behind.md`, `leftover-routing.md`, `unblocked-records.md`, `verification-brief.md`, `execution-and-verification.md` | Unchanged |
| `docs/skill-graph.md` | Edges updated |
| `docs/plugin-structure.md` | Sub-file table updated |

External contract (arguments, lifecycle position, `/flow` integration, hooks) unchanged — README and `/help` need no changes beyond routine verification.

## Risks

1. **Substance loss during slimming.** No test reads skill prose. The plan must include an explicit diff-audit task: every substantive line of the old sub-files survives somewhere in the new set (the CLAUDE.md extraction rule).
2. **Prose/code double maintenance.** The registry exists in SKILL.md (human-readable) and `bin/lib/wrapup/registry.js` (executable). A pinning test (pattern: `tests/hooks-gate-coverage.test.js` pinning prose to `GATE_COVERAGE`) must fail when the two drift.
3. **`/flow` console drift.** Flow's consolidated multi-spec console is a parallel implementation, out of scope here. Follow-up record: align it to the trace contract.
4. **Run-dir-everywhere hook interactions.** Verified-in-plan task, not a redesign: `status: active` → archival path is the normal lifecycle; confirm the reaper and E1 treat conversation-mode run dirs correctly.
5. **JSON contract versioning.** `record`'s input schema is a producer/consumer boundary between prose (judge output instructions) and code (validator). Version it; validator rejects unknown shapes loudly (IL-50: new validators must fail in the same direction as siblings).
6. **Engine fallback ambiguity.** "Engine absent → prose path" must be a stated unconditional rule in SKILL.md (IL-14: no enumerated termination paths), and the report must say which path ran.

## Decisions log (from brainstorming)

- Direction: engine + registry over report-contract-only or scope-cull-first. All scope dispositions applied as recommended: merge Steps 1+2, merge 6.1+7.9, unify console across modes, rewrite summary as phase-trace; no step killed outright.
- Output rendered as markdown tables (house batch-table style), not monospace blocks.
- Run dir created by every wrap-up run (standalone included).
- Engine tier: full — code engine + telemetry + conditional parallel judge dispatch.
- Ships as a minor version bump.
