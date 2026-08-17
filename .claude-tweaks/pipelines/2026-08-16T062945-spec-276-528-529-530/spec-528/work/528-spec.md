---
record: 528
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-kickoff-wrapper-skill-plugin-served-firing-lifecycle
surface: backend
---
# 528: routine-kickoff wrapper skill — plugin-served firing-lifecycle home

Surface: backend

## Overview

Create `skills/routine-kickoff/SKILL.md` — the plugin-served wrapper every routine kernel will invoke as `Then: /claude-tweaks:routine-kickoff {skill} [args]`. Its charter is the **firing-lifecycle home**: everything a cloud-Routine firing does before/around its target skill lives here and updates with each plugin release, instead of being frozen into every live routine's prompt at creation time. This sub-issue ships the skill inert — nothing references it until the kernel migration wires the templates to it — which is what makes it independently landable.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No changes to `_shared/routine-template-schema.md`, any `routine-template.yml`, or `/routine`'s assembly steps — that is the kernel-migration sub-issue (#529).
- No `docs/skill-graph.md` edges, /help listing, or `docs/plugin-structure.md` row — the docs sub-issue (#530) owns all cross-reference surfaces (deliberate deferral of the "add edges when adding a skill" rule to keep this unit inert; #530 is chained behind #529 in the same decomposition).
- No heartbeat (#68) or notification (#210) behavior — future residents, not now.
- No automated enforcement that future work-claiming skills join the exclusion list — the list is maintained by hand, gated only by this unit's text-pinning test for the two current names; the drift risk is accepted and stated in the skill body itself (see Deliverables), mirroring the IL-93 caution about hand-maintained lists.

## Prerequisites

None — this is the first unit of decomposition #524 (the sibling units #529 and #530 are blocked on it via native blocked-by links, which don't appear in body text).

## Current State

- The behavior this skill absorbs currently lives in `_shared/routine-template-schema.md`'s "Standard prompt preamble" block (lines ~29–125): stale-docs guard, `claude plugin list --json` dump, frozen-catalog manual-execution fallback with the dispatch/tidy exclusion, reconcile step. Reuse that block's exact wording wherever a phrase is load-bearing (e.g. the degraded-sandbox report is the preamble's own "report the degraded sandbox and stop" phrasing, verbatim).
- Skill authoring conventions: `docs/skill-authoring.md` (read before writing any `skills/**/*.md`).
- Every skill invocation receives its own location as a "Base directory for this skill:" line — this is what makes plugin-root self-derivation possible (see Technical Approach).
- Tests: `tests/` uses `node --test`; see `tests/hooks-dispatcher.test.js` style for plain fs-reading assertions.

## Deliverables

- [ ] `skills/routine-kickoff/SKILL.md` — frontmatter per `docs/skill-authoring.md`; description states it is machine-invoked by routine kernels, not user-facing. Argument grammar (a shipped contract — see Gotchas): whitespace-delimited tokens; the first token is the target skill name (bare, e.g. `code-health`, matching the skill's directory under `skills/`); all remaining tokens (e.g. `focus=dead-code`, `--min-confidence high`, `next`, `grant`) pass through to the target invocation verbatim, joined by single spaces.
- [ ] Skill body carrying, in order:
  1. Stale-docs guard — project docs describing the target skill's past behavior are historical context, never procedure (moved from the preamble).
  2. Plugin-list dump — run `claude plugin list --json` and print its output verbatim; if that command errors (non-zero exit or command not found — an empty-but-valid JSON result is NOT an error, print it as-is), fall back to `ls -la ~/.claude/plugins/cache/*/*/ 2>&1`. Diagnostic only; this output is never used to derive the plugin root.
  3. Reconcile — `node "<plugin-root>/bin/hooks.js" reconcile`, report the one-line JSON, best-effort, never a gate. Behavior differs by integration model (`pr-first`: full convergence; `local-merge`: worktree reap only) — keep that distinction.
  4. Target invocation — compose `/claude-tweaks:{first-token}` plus the passthrough args and invoke it via the Skill tool. If (and only if) that call fails with an error indicating the skill name is not in the session's catalog (the harness's unknown-/unrecognized-skill error, e.g. a message containing "Unknown skill" — any *other* failure means the skill was found and errored, which is reported, never fallen back from), read `<plugin-root>/skills/{first-token}/SKILL.md` and execute its instructions directly as written — **except** when the target is `dispatch` or `tidy` (or any future skill that claims work or writes beyond report-only surfaces): report the degraded sandbox (preamble phrasing, verbatim) and stop. Keep the exclusion's principle sentence from the current preamble ("dispatch claims queue records and triggers builds and merges, and tidy's standalone-auto mode applies deletions … and any future routine whose skill claims work or writes beyond report-only surfaces gets the same exclusion") plus one maintenance sentence: the list is hand-maintained — a new work-claiming skill must be added here, and the pinning test covers only the current names.
- [ ] Two standing constraints stated in the skill's opening section: (a) **blast radius** — edits to this file reach every project's next routine firing with no per-routine pin; the only rollback is a fix release; the argument grammar above is a shipped contract under expand-contract discipline (additive changes fine, breaking changes need kernel migration), while body behavior is otherwise free to evolve; (b) **standalone followability** — the kernel's frozen-catalog fallback reads this file as raw prose, outside the Skill tool's frontmatter mechanics (allowed-tools scoping, arg substitution do not apply on that path — it is deliberately a degraded, unconstrained path), so the body must remain executable as written by a model with no Skill-tool support.
- [ ] `tests/routine-kickoff.test.js` — pins that the SKILL.md text contains the dispatch and tidy exclusion (both names), the blast-radius note, and the standalone-followability note, so none can be silently dropped. It must NOT assert that the repo contains zero references to `routine-kickoff` (acceptance criterion 4 below is a landing-time check only — #529 wires references in immediately after).

## Acceptance Criteria

1. `node --test tests/routine-kickoff.test.js` passes; `npm test` stays green (no existing test references the new directory).
2. `skills/routine-kickoff/SKILL.md` exists with valid frontmatter (name, description) matching `docs/skill-authoring.md`'s conventions, and every skill reference inside its actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md cross-reference rule).
3. The skill file names `dispatch` and `tidy` as manual-execution exclusions, states the exclusion's principle (claims work / writes beyond report-only), and states the hand-maintenance rule.
4. Landing-time inertness check (not a standing test): `grep -rn "routine-kickoff" skills/ bin/ docs/` (excluding `skills/routine-kickoff/` itself) returns zero matches.

## Technical Approach

Move semantics, not invent: the body items are today's preamble paragraphs relocated, minus what stays in the kernel (branch sync, resolution ladder, resolved-build line, self-heal — all #529's territory).

**Plugin-root derivation (one mechanism, self-contained):** the wrapper derives the plugin root from its own loaded location — the "Base directory for this skill:" line every Skill invocation receives names `<plugin-root>/skills/routine-kickoff`, so the plugin root is that path's grandparent (the directory containing `.claude-plugin/`). It never parses the kernel's earlier output (no cross-invocation handoff exists) and never assumes `${CLAUDE_PLUGIN_ROOT}` is set. Fallback when even the base-directory line is unavailable (the kernel's manual-read path, where there is no Skill invocation): the file's own on-disk location, known to whoever just read it. State this derivation in the skill body.

### Key Files

- `skills/routine-kickoff/SKILL.md` — new; the wrapper skill.
- `tests/routine-kickoff.test.js` — new; text-pinning assertions.
- `skills/_shared/routine-template-schema.md` — read-only source for the moved text (edited by #529, not this unit).

## Gotchas

- The reconcile step's integration-model distinction (`pr-first` vs `local-merge`) is load-bearing for no-forge projects — keep it when moving the text.
- Do not restate the kernel's contents (branch sync, ladder, self-heal) in the wrapper — one home per fact; the kernel is the schema file's territory.
- The argument grammar's args are whitespace tokens — values containing spaces are unsupported, the same constraint the existing `focus=<vertical>` grammar already carries. Don't invent quoting.
- `npm test` failure counts that vary run-to-run on identical code track machine load, not regressions — re-run the affected file in isolation before concluding breakage (CLAUDE.md Commands note).

## Decision Rationale

See parent #524's Decision Rationale — wrapper-skill indirection (Approach A) chosen over per-template inline kernels and file-only indirection; always-latest propagation accepted deliberately.


<!-- work-fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-kickoff-wrapper-skill-plugin-served-firing-lifecycle -->
