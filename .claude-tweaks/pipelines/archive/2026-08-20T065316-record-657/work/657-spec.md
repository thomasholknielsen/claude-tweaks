---
record: 657
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 657: design-wrapper + flow manifesto: 58 KB of skill text loaded for zero decisions on backend-only auto runs

Surface: backend

## Current State

`/claude-tweaks:test` Step 1.5 (`skills/test/design-gate.md`) unconditionally invokes
`/claude-tweaks:design-wrapper test <changed-files>` for every run that isn't `qa`-mode or a
single-check-type run — regardless of whether the record(s) being tested are frontend-surfaced.
The wrapper's own `SKILL.md` (~40KB) is loaded in full before its Layer 1 kill-switch
(`design-integration:` field in this project's CLAUDE.md — absent here, so the wrapper resolves to
a project-wide no-op) or Layer 2 (the record's own `Surface:` body-metadata line) ever run. Both
checks are cheap greps that the wrapper already documents (`skills/design-wrapper/SKILL.md`'s
"Layer 1 — Kill-switch" and "Layer 2 — Body-metadata lines" sections) — but they run *inside* the
wrapper, after its file is already loaded, not before the caller decides whether to invoke it.

Separately, `/claude-tweaks:flow`'s `manifesto.md` (`skills/flow/manifesto.md`, ~20KB) is read in
full every run to render the Pipeline Config Manifesto, even under `mode: auto` where every lever
resolves to `default`/`computed` and the file's larger sections — Override semantics, Approval
flow, Rendering rules for the preview (interactive elicitation/override/approval-flow prose) — never
execute; only the lever-computation table and the FYI-render contract are actually read.

Observed impact, from a real 4-record backend-only `/flow` run
(`.claude-tweaks/pipelines/archive/2026-08-16T091924-spec-563-564-565-566`): 58,276 chars of
skill text loaded — the `design-wrapper` load plus the full `manifesto.md` read — produced zero
decisions. Session totals for scale: 301 tool results / 446,126 chars total; 7 `Skill` loads =
184,147 chars, roughly 79K tokens of skill text for the session as a whole. Filed via
`/claude-tweaks:feedback`'s session evaluation (Context overhead lens).

## Deliverables

1. In `skills/test/design-gate.md` (Step 1.5's invocation logic, referenced from `skills/test/SKILL.md`):
   add the two-grep pre-check — the record's own `Surface:` body-metadata line, and whether this
   project's CLAUDE.md carries a `design-integration:` field at all — inline in the caller, before
   invoking `/claude-tweaks:design-wrapper`. When the pre-check already determines Layer 1 (kill-switch
   absent/disabled) or Layer 2 (`Surface:` resolves to `backend`/`infra`) will no-op, skip the
   `Skill(claude-tweaks:design-wrapper)` call entirely and report the skip the same way the wrapper's
   own skip return does today (`{skipped: ...}` handling in the result-handling table).
2. In `skills/flow/manifesto.md`: add a compact auto-mode fast-path section near the top of the file
   containing only the lever-computation table (`## Compute recommendations` /
   `## Compute per-spec preview` / `## Determine lever suppressions`) and the FYI-render contract
   (the `#### Pipeline preview` / `#### Policy levers` shape under `## Present the Manifesto`) — the
   parts an `auto`-mode run actually reads. Gate the larger elicitation/override/approval-flow body
   (`#### Override semantics`, `## Approval flow`, `### Rendering rules for the preview`) so it's
   read only when mode is `confirm` or `hybrid`.
3. Grep `skills/_shared/design-wrapper-handling.md` for every other caller of
   `/claude-tweaks:design-wrapper` and confirm none of them has the same unconditional-load pattern
   before the wrapper's own Layer 1/2 checks; apply the same short-circuit if one does.

## Acceptance Criteria

- A synthetic backend-only `/claude-tweaks:test` run (every input record's `Surface:` line is
  `backend` or `infra`, and this project's CLAUDE.md carries no `design-integration:` field) no
  longer issues a `Skill(claude-tweaks:design-wrapper)` call — verified by tracing the pre-check
  logic added in `design-gate.md` against that scenario (a live trace or an equivalent scripted
  check).
- A frontend-surfaced record (`Surface: web`/`mobile`/`desktop`) or a project with
  `design-integration: enabled`/`plugin-only` still triggers the wrapper's full Layer 1-3
  resolution unchanged — the short-circuit only suppresses the call when the pre-check's own
  logic proves the wrapper would no-op, never as a broader heuristic.
- Under `mode: auto`, `/flow`'s Manifesto render reads only the new compact fast-path section of
  `manifesto.md` — verified by confirming the rendered FYI table matches today's output and that
  the Override semantics/Approval flow/Rendering-rules sections are unreached in that path.
- `confirm`/`hybrid`-mode `/flow` runs still render the full interactive Manifesto (preview,
  policy-lever table, override semantics, approval flow) exactly as before — unchanged.
- `npm test` passes, including any `node --test` prose-conformance suites over
  `skills/test/SKILL.md`, `skills/test/design-gate.md`, and `skills/flow/manifesto.md`.

## Technical Approach

- The two-grep pre-check mirrors `design-wrapper`'s own Layer 1 (CLAUDE.md `design-integration`
  field) and Layer 2 (record's `Surface:` body-metadata line) resolution logic, already documented
  in `skills/design-wrapper/SKILL.md`'s "Layer 1 — Kill-switch" and "Layer 2 — Body-metadata lines"
  sections. This deliverable relocates that decision from inside the wrapper (after its `SKILL.md`
  is already loaded) to the caller, before `Skill()` is invoked — it must reproduce the same
  enabled/plugin-only/disabled/absent value handling, not approximate it.
- For `manifesto.md`, split the file (or reorder its sections) so the auto-mode-relevant table and
  render contract are read first/alone under `mode: auto`; the elicitation/override/approval
  sections can stay in the same file behind a mode check, or move to a lazily-loaded sub-file —
  whichever keeps `confirm`/`hybrid` behavior byte-identical to today.
- Cross-check `skills/_shared/auto-mode-contract.md` and `skills/_shared/design-wrapper-handling.md`
  to confirm the short-circuit doesn't skip any HARD-GATE case or anything the auto-mode contract
  says `auto` never silences.

## Gotchas

- The pre-check must reproduce `design-wrapper`'s own Layer 1/2 semantics exactly (`enabled` /
  `plugin-only` / `disabled` / absent-field handling, and `Surface:` values beyond plain
  `backend`/`infra` — e.g. `terminal`) — a caller-side approximation that disagrees with the
  wrapper's own logic would silently change behavior for edge cases like
  `design-integration: plugin-only`.
- This is a context-budget optimization, not an intended behavior change — most of the Acceptance
  Criteria exist to prove behavior is unchanged for every case the short-circuit doesn't apply to,
  not just that the backend-only case got cheaper.
- Origin run directory (evidence for the Current State's numbers):
  `.claude-tweaks/pipelines/archive/2026-08-16T091924-spec-563-564-565-566` — worth checking its
  `decisions.md` for any additional detail before implementing.

## Original request

design-wrapper + flow manifesto: 58 KB of skill text loaded for zero decisions on backend-only auto runs

## Overview

In a 4-record backend-only `/flow` run, 58,276 chars of loaded skill text produced zero decisions:

- `Skill(claude-tweaks:design-wrapper)` loaded 38,190 chars, then resolved to a project-wide no-op — this project's CLAUDE.md has no `design-integration:` field (Layer 1 kill-switch, missing = disabled), which two cheap greps (`Surface:` value on the record + `design-integration` in CLAUDE.md) fully determine before any load. The caller (`/test` Step 1.5) had also already established every spec was `surface: backend`.
- `flow/manifesto.md` (20,086 chars) was read in full to render a 7-row FYI table in which every lever resolved to `default` (one `computed`), ending `→ proceeding (no approval needed)` — the interactive elicitation procedure, override semantics, and approval-flow branches were all dead weight for the `auto` path.

Session totals for scale: 301 tool results / 446,126 chars; 7 Skill loads = 184,147 chars + ~130,000 chars of plugin sub-file Reads ≈ 79K tokens of skill text.

## Suggested shape

- `/test`'s Step 1.5 (and other design-wrapper callers): state the two-grep pre-check (record `Surface:` + CLAUDE.md `design-integration:` presence) inline in the caller so the wrapper is only loaded when it can possibly dispatch. The wrapper's Layer 1/2 logic already defines these checks — the change is running them *before* the load, not after.
- `manifesto.md`: an auto-mode fast path — when mode is `auto`, a compact section near the top carrying just the lever-computation table and FYI render contract, so the elicitation/override/approval body is only read under `confirm`/`hybrid`.

**Origin:** `/claude-tweaks:feedback` session evaluation (Context overhead lens), run 2026-08-16T091924-spec-563-564-565-566.

**Files:** skills/design-wrapper/SKILL.md, skills/flow/manifesto.md, skills/test/SKILL.md

