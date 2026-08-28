---
record: 844
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
---
# 844: backlog refine's paste-ready lane blocks render one gh command per record — no batch-dispatch mechanism for large batches

Origin: session observation during a /claude-tweaks:backlog refine run (self-reference routed the finding to local records)

Defer-reason: tangential

## Current State

`skills/backlog/refine-lanes.md`'s Grant/Flag-back/Priority lane templates each render an "Accepted defaults, paste-ready" bash block with one `# Terminal — #N` / `gh issue edit N --add-label ...` pair per record — mechanically correct (a single bash fence executes every line in sequence) but shaped for eyeballing/editing a handful of records, not for a large batch. Observed live in this session: a single `/claude-tweaks:backlog refine` run selected 76 records across the Grant/Flag-back/Priority lanes, producing three paste-ready blocks totaling ~75 individual `gh issue edit`/`gh issue comment` lines. The user's own reaction: "we got a lot terminal commands here - we are really looking for terminal commands that allow us to dispatch a lot of work at once and not 1 by 1 as in this example." There is no batch-shaped alternative today — no CLI verb that accepts a list of record numbers (or a `--run <dir>` pointer to a table this skill already computed) and applies the whole set's label changes in one dispatched call, the way `bin/hooks.js record-worktree`/`close-run` are single verbs for their own state changes.

## Deliverables

- [x] Decide the shape: either (a) a new `bin/hooks.js` verb (e.g. `apply-refine-labels --run <dir>`) that reads a structured intermediate and applies every row's label changes in one dispatched call, logging one `decisions.md` line per action; or (b) a compact `for`-loop paste form in the report itself (`for n in 553 554 ...; do gh issue edit "$n" --add-label auto:build; done`) that collapses N paste-ready lines into 1-3 loop-shaped ones, grouped by identical action. Record the decision. — **Decided (a)**: `plugin/bin/apply-refine-labels.js`, a standalone CLI (not a `bin/hooks.js` verb — it shells to `gh`, matching `materialize.js`/`claim-targets.js`'s pattern rather than `hooks.js`'s state-only verbs) that reads a JSON actions array and applies the whole lane via `gh issue edit`/`gh issue comment`, logging one AUTO `decisions.md` line per successfully-applied action under `--run`.
- [x] Whichever shape is chosen, update `skills/backlog/refine-lanes.md`'s "Accepted defaults, paste-ready" templates (Re-authorize/Grant/Flag-back/Priority/Dependency-repair) to render the batch-dispatch form instead of (or alongside) today's one-line-per-record form. — Done for Re-authorize/Grant/Flag-back/Priority (one `apply-refine-labels.js` call per lane). Dependency-repair's `work-links: body-text` mechanic is a body *rewrite*, a `gh` shape the CLI doesn't cover — left as its existing per-record form, noted inline.
- [x] Audit other lane-rendering skills for the same one-line-per-record paste-block pattern (`_shared/upstream-feedback-batch.md`, wrap-up's Review Console, `_shared/console-execution.md`) and apply the same fix if the pattern repeats there — confirm before assuming, don't extend blindly. — Audited; see "Audit: other lane-rendering skills" below. None repeat the pattern.

## Acceptance Criteria

1. A `/claude-tweaks:backlog refine` run with 20+ records across the Grant/Priority lanes produces a report a human can dispatch with meaningfully fewer than one paste per record — either one CLI call or a small number of loop-shaped paste blocks.
2. The chosen mechanism preserves per-record auditability — a human (or the audit log) can still tell which record got which action, not just an aggregate "N labels applied."
3. `npm test` passes; any new CLI verb gets unit test coverage matching this repo's existing `bin/hooks.js` verb test pattern.

_Filed by `capture` via specShapedBody._

## Audit: other lane-rendering skills

Per Deliverable 3, audited the three named files for the same one-`gh`-command-per-record
paste-ready terminal block pattern `refine-lanes.md` had. None repeat it — each already batches
through a different mechanism:

- `_shared/upstream-feedback-batch.md` — batches via chunked `multiSelect: true`
  `AskUserQuestion` calls (groups of up to 4 items), not paste-ready `gh` commands. Filing itself
  is still one `/claude-tweaks:feedback --pre-confirmed` call per checked item, but the human-facing
  approval step is already batched — not the one-paste-per-record shape #844 targets.
- `wrap-up/review-console.md` (and `review-console-interactive.md`) — no `gh issue edit`/paste-ready
  blocks at all; approval is `AskUserQuestion`-driven (Approve all / Override), and execution routes
  through `_shared/console-execution.md`.
- `_shared/console-execution.md` — no paste-ready blocks; approval and execution both happen via
  PR-comment checkbox ticks (`_shared/console-on-pr.md`), a structurally different, already-batched
  surface.

No fix needed in these three files — confirmed, not assumed, per the deliverable's own instruction
not to extend blindly.
