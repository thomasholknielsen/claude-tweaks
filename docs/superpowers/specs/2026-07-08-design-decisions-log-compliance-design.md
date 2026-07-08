# Decisions-Log Compliance for the Design Wrapper's Polish Phase

**Date:** 2026-07-08
**Status:** Approved (brainstorm 2026-07-08)
**Origin:** A user question about whether Impeccable is being "activated at the right frequency" led to auditing what instrumentation exists to answer that. None does — and the specific reason why surfaced a standing compliance gap against `_shared/auto-mode-contract.md`, this project's own mandatory audit-trail contract for every auto-resolved decision anywhere in the pipeline.

## Problem

`_shared/auto-mode-contract.md` requires, non-negotiably: "Every auto-resolution is logged. This is non-negotiable — silent automation without an audit trail is forbidden." Its Anti-Patterns table lists "Skipping the auto-decision log entry" as a contract violation on its own.

`skills/design/`'s `polish` mode — the only mode of the six that modifies code, dispatching Impeccable commands unconditionally (auto-fit: `polish`/`clarify`/`harden`), on detected signal (issue-driven: `typeset`/`layout`/`adapt`/`optimize`), and on pre-declared user intent (intent-driven: `bolder`/`quieter`/`distill`/`delight`+`animate`/`onboard`) — never writes to `decisions.md`. A grep across every file in `skills/design/` for `decisions.md` or "auto-decision" returns zero hits.

This is two separate gaps, not one:

1. **No logging.** Every polish-phase dispatch is a genuine auto-resolution (code-modifying, no per-invocation user confirmation) and should produce an `AUTO` entry per the contract.
2. **No registry entry.** The contract's own master index — the "What `auto` silences" table, which is supposed to enumerate every mid-flow auto-decision point in the pipeline — has rows for `/specify`'s Impeccable *shape* step and *design-intent* selection, but no row at all for the polish-phase dispatch itself. It was never registered, independent of whether it logs.

A practical consequence: because nothing is logged, there is currently no way to answer "how often does this actually fire, on what, and how much did it change" without adding instrumentation first — which is what this fixes, as a side effect of becoming compliant.

## Scope

Only `polish` mode. The wrapper's other five modes don't need this: `test` is a deterministic pass/fail gate (nothing decided on the user's behalf); `review` and `survey` are explicitly advisory/read-only (`review`'s findings are "never auto-applied"; `survey` "never invokes commands directly"); `shape` and `pre-build` are read-only context operations. None of these apply, propose, or auto-select anything — `polish` is the only one that does.

## Decision

**Approach: `/design` reports what to log; `/flow` writes it.** Not `/design` logging directly.

`/design`'s own Component-Skill Contract already establishes the precedent this follows: when invoked inside a pipeline, `/design` omits its own `Next Actions` block because "the parent owns the handoff" — pipeline-facing bookkeeping is the caller's job, not the component skill's. The same logic applies to the audit trail: `/design polish` doesn't reliably know whether it's running inside an active `/flow` pipeline (with a `decisions.md` to write to) or standalone (per its own SKILL.md: "A user runs `/claude-tweaks:design <mode> <target>` directly"). `/flow` always knows — it created the run directory. So `/design polish` reports *what happened and why* (data only it has: which commands ran, under which category, triggered by what), and `/flow` — which already loops over `commands_invoked` once per polish-phase run for an unrelated purpose (see below) — is the one that formats and appends the `decisions.md` entry.

This also matches the two skills' existing division of labor: `/design`'s stated purpose is "encapsulates *when, how, whether* to invoke Impeccable so caller skills don't have to know." The inverse holds too — `/design` shouldn't need to know `decisions.md`'s location or format any more than its callers need to know Impeccable's invocation details.

## Changes

### 1. `skills/design/modes/polish.md` — add `decision_summary` to the output contract

One new field in the existing "Output to caller" JSON shape, present only when `commands_invoked` is non-empty (when polish had nothing to do, there is no decision to log — matches the contract's existing rule against logging non-candidates: *"Logging KEPT-PROMPT for decisions that were never auto candidates... don't log — they're not auto-decisions"*).

Format: `"Dispatched {N} Impeccable commands on {M} files — {category list}."` where `{category list}` is semicolon-separated, one clause per non-empty category, each clause naming its commands and — for issue-driven and intent-driven only — the trigger in parentheses:

- `auto-fit: polish, clarify, harden` (no trigger — always runs)
- `issue-driven: typeset (audit:typography)`
- `intent-driven: bolder (intent:bold)`

Example full string: `"Dispatched 5 Impeccable commands on 3 files — auto-fit: polish, clarify, harden; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold)."`

Build this from the `commands_invoked` array already assembled in Steps 4–6 of `polish.md`'s procedure — no new data collection, purely a formatting step added after Step 6, before the "Output to caller" section.

### 2. `skills/flow/SKILL.md`, "Polish + re-verify execution" — append the decisions.md entry

This section already contains, at `skills/flow/SKILL.md:183`: *"Append a ledger entry per command invoked (phase: `design`, status: `fixed` for auto-fit successes, `observation` for reported issues)."* — a per-command-invocation step that already exists for a different purpose (the pipeline ledger, not the auto-decision log). Add one sentence to that exact line, not a new step: alongside the existing ledger append, also append one `decisions.md` entry (not one per command — one per polish-phase dispatch, matching the log's own convention of collapsing related actions into a single line, e.g. the existing `/stories` example entry covers two files in one line) under a `## /flow` heading (created if absent, per the log's append protocol):

```
- AUTO {HH:MM:SS} — Polish phase: {decision_summary}. Files: {files_modified, comma-joined}. Reversibility: high (worktree file edits, revertible via git).
```

`{decision_summary}` and `{files_modified}` come directly from `/design polish`'s response — no re-derivation. Reversibility is fixed at `high` for this decision type (justified by the contract's own "Always-reversible (auto-OK): File edits in worktree (`git revert`)" entry) — not something `/design` needs to report per-invocation.

**Note on commit refs:** the auto-decision-log's entry schema shows a commit ref as commonly present but not universal — its own example log includes an entry with no commit ref at all (the `/stories` entry: *"Files: stories/login.yml, stories/logout.yml"*, no ref). This design does not assume a commit exists for polish's changes at the point this entry is written — I found no documented point in `/flow`'s Step 4 or the polish-phase decision tree in `steps-and-gates.md` where polish's file changes get committed before re-verify runs. **The implementer should verify current behavior against the actual code** (does anything commit polish's changes, and if so, exactly where) before finalizing whether a commit ref can be included — this design deliberately doesn't assume one, so the entry is correct either way, but a plan review might reasonably decide to enrich the entry template if verification finds a commit does happen at a knowable point in this exact step.

### 3. `skills/_shared/auto-mode-contract.md` — new row in "What `auto` silences"

| Prompt / decision | Default behavior | Behavior under `auto` |
|---|---|---|
| Design polish-phase dispatch (`/flow` polish phase, via `/claude-tweaks:design polish`) | N/A — auto-fit and issue-driven have no interactive equivalent (they're always-run and signal-triggered respectively); intent-driven was already pre-selected at `/specify` Step 2.5c | Auto-fit: always dispatched when frontend. Issue-driven: dispatched per audit-flagged category. Intent-driven: dispatched per pre-declared `design-intent:`. All `AUTO` — logged by `/flow` using `/design polish`'s `decision_summary` field. |

Insert this row immediately after `skills/_shared/auto-mode-contract.md:147` (the "Design intent (`/specify` Step 2.5c)" row, itself directly below "Impeccable shape (`/specify` Step 2.5b)" at line 146), so the three Impeccable-related auto-decision points in the table read together in pipeline order (shape → intent selection → polish-phase dispatch).

## Testing

Prose/documentation content — no code test suite covers it (this repo's `npm test` exercises `bin/` JS and hooks, not skill markdown). Verification:

- **Consistency check (do now):** the `decision_summary` field name is identical everywhere it's referenced — defined once in `polish.md`, consumed once in `flow/SKILL.md`. No second file re-derives or duplicates its construction logic.
- **Manual smoke test (deferred, documented not run):** this repo has no frontend fixture to trigger a real `/flow` run with a frontend spec and `design-intent:` set. First real verification happens on the next such run in a downstream project — confirm a `decisions.md` entry actually appears under `## /flow` after the polish phase runs, with a well-formed `decision_summary` string.

## Risks

1. **Commit-ref uncertainty (see Change 2's note).** If verification during implementation finds polish's changes are in fact committed at a specific, knowable point before this logging step, the entry template should be enriched to include that ref — this design's fallback (no ref, file list only) remains correct regardless, so this is an enhancement opportunity to check for, not a blocker.
2. **`decision_summary` string growth.** With many simultaneous intents declared (e.g. `design-intent: bold, delightful, onboarding` dispatching 4+ intent-driven commands on top of the 3 always-run auto-fit commands), the summary string could run long. The log format's own guidance ("the entry is a one-liner... long rationale belongs in the staged file") suggests capping category-clause verbosity if this proves unwieldy in practice, but no cap is specified here since the realistic case (1–2 declared intents) stays well within a reasonable line length.
