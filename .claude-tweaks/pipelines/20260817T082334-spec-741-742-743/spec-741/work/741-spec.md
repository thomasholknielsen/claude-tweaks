---
record: 741
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-25c1adb2
surface: backend
---
# 741: backlog refine: 48 label writes close with one sentence — no per-type tally, failure count, or run-dir pointer in the closing render

Surface: backend

## Current State

`skills/backlog/refine-mode.md` Step 5 (Apply) executes the batch of confirmed label/body writes and logs the itemized outcome only to `decisions.md` inside the run directory. The on-screen closure is a single sentence. The per-write `OK ...` lines land in tool results, which are shown to the model but not reliably to the user — so an operator who just approved ~48 writes cannot see at a glance what landed, what failed, or where the audit trail lives. A partial failure is invisible without opening a file the closing render never points at. Observed live: a user interrupt immediately after closure, consistent with wanting the run's output back on screen.

## Deliverables

1. Amend `skills/backlog/refine-mode.md` Step 5 (Apply) to require a closing summary block rendered as assistant text (never delegated to tool output) after the apply pass completes, containing:
   - a per-type tally line, one count per write type applied this run (e.g. `34 priority set · 2 Related updated · 7 granted · 5 flagged back · 0 failed`), with the failure count always present — `0 failed` is rendered explicitly, never omitted;
   - one line per failed write, naming the record ref and the error, each followed by a paste-ready retry command on its own line (per the repo's report-line convention);
   - the absolute run-directory path (where the `decisions.md` audit trail lives).
2. A conformance test pinning the new Step 5 closing-render prose, proven able to go red against the pre-change text.

## Acceptance Criteria

- `refine-mode.md` Step 5 specifies the closing summary block with all three elements above; the tally derives from the same per-write outcomes Step 5 already logs to `decisions.md` (no second bookkeeping channel).
- The failure-count element is unconditional: the prose explicitly requires `0 failed` on a fully clean run.
- The new conformance test fails when the closing-render requirement is removed and passes on the changed tree.
- `npm test` passes.

## Technical Approach

Single-file prose edit to `skills/backlog/refine-mode.md` Step 5, plus one test (new file or an extension of an existing backlog conformance suite) under `tests/`. Counts come from the apply loop's own outcome tracking — the same data Step 5 writes into `decisions.md` — so the closing render is a summary of state already held in memory, not a re-read.

## Gotchas

- Tool-result output is not reliably user-visible — the closing block must be emitted as assistant text; a shell print of the tally does not satisfy the deliverable.
- Render the run-dir path absolute, never relative — a bare relative pipelines path silently shadows the main-checkout copy when run from a worktree (IL-127 class).
- Check line/byte headroom of `refine-mode.md` before adding the block if any ceiling or conformance gate covers its size.

## Original request

backlog refine: 48 label writes close with one sentence — no per-type tally, failure count, or run-dir pointer in the closing render

**Summary:** After the batch-confirm, refine's apply step logs the itemized outcome only to `decisions.md` inside a run directory the operator never opens; the on-screen closure was a single sentence, so a partial failure would be invisible without reading tool results or a file — and the observed user interrupt immediately after closure is consistent with wanting the run's output back on screen.

**Kind:** Gap

**Affected component:** `skills/backlog/refine-mode.md` Step 5 (Apply)

**Objective:** Developer joy

**Use case:** An operator who just approved 48 writes needs to see, at a glance, what landed and what failed — e.g. `34 priority set · 2 Related updated · 7 granted · 5 flagged back · 0 failed` — plus the absolute run-dir path, before the Next Actions hand-off. Today the per-write `OK ...` lines land in tool results (shown to the model, not reliably to the user) and the audit trail is a file nothing points at prominently.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-25c1adb2 -->

