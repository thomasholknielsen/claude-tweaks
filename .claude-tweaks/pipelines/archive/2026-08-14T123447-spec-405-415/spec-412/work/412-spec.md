---
record: 412
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [409]
surface: backend
---
# 412: Console-on-PR: render the Review Console as a PR comment with a checkbox answer protocol

Surface: backend

## Overview

Render the wrap-up Review Console as one PR comment with a GitHub-native answer protocol, so any later session — not just the one that built the run — can read the human's answers. The comment is a task-list carrying everything `staged/` and `decisions.md` hold today (memory writes, queue writes, upstream filings, ledger residue, staged proposals), one stable HTML-comment ID per item (`<!-- console-item: mem-1 -->`). The human ticks the items they approve, then ticks a final "Resolve console" checkbox — one mechanism, so a half-ticked list is never misread as an answer; unticked items at resolve time are declined. Resolve-box semantics across re-renders: a resolved console (resolved marker present) is never re-rendered; an unresolved re-render preserves every tick including Resolve — except when the item set changed, in which case the renderer un-ticks Resolve and appends a visible note ("items changed since your Resolve tick — re-tick to confirm"): approval always refers to the list as currently rendered. The merge decision needs no checkbox: marking the PR ready and merging is "merge," closing the PR is "discard," doing nothing is "keep parked." Headless-parked-forever ceases to be a resting state: a headless firing renders the comment and ends cleanly.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No execution of answers — the console-execution sub-issue (reconciler reads the ticks and acts).
- No change to what the console *contains* — sections, staged-item classification, and per-item semantics stay as `wrap-up/console-template.md` defines them.
- `AskUserQuestion` in live sessions is not removed here — the accelerator behavior is the console-execution sub-issue's scope.
- `local-merge` runs keep the session-only console.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| pr-early-lifecycle | PR-early run lifecycle | ready |

## Current State

- `skills/wrap-up/review-console.md` + `skills/wrap-up/console-template.md` — console composition: batch table, per-item sections (`M#` memory, `Q#` queue, `U#` upstream), staged/ classification rules.
- `skills/flow/multispec-review-console.md` — the consolidated bundle console (same protocol must apply; one console comment on the bundle's one PR).
- `staged/` files carry `Title:`/`Type:`/`Labels:` headers (queue-write classification).
- The PR exists from run start with its number in `run-state.json`.
- `skills/_shared/auto-mode-contract.md` — what the console must never silence; unchanged by this sub-issue.

## Deliverables

- [ ] Comment renderer in `wrap-up/review-console.md`: compose the console as one PR comment — every section rendered as GitHub task-list items with stable IDs (`<!-- console-item: {kind}-{n} -->`), plus the final `<!-- console-item: resolve -->` "Resolve console" checkbox, plus a plain-language answering legend.
- [ ] The same renderer wired into `flow/multispec-review-console.md` for bundles (one comment on the bundle PR, sections per spec as that console already groups them).
- [ ] Answer semantics documented in the comment itself: ticked = approved, unticked at resolve = declined, merge/close/do-nothing meanings for the PR itself.
- [ ] Console state marker in the run dir (`console.json`: comment id, item ids, rendered-at) — what the executor will use for idempotence.
- [ ] Headless behavior: after posting the comment, the run ends cleanly with outcome `pending-review` and the PR URL in its report — no blocking wait.
- [ ] Edit-idempotence: re-rendering (a resumed run) edits the existing console comment in place (keyed on the marker), preserving any ticks already made — never posts a second console.

## Acceptance Criteria

1. A pr-first run reaching the console posts exactly one comment containing every staged item as a task-list row with a unique stable ID, verifiable via `gh pr view --comments`.
2. Re-running wrap-up against the same run edits that comment (same comment id) and preserves a manually-ticked box.
3. A headless invocation terminates after posting (no AskUserQuestion in the transcript) with the PR URL in its final report.
4. The comment's legend states all three PR-level meanings (merge/close/nothing) and the unticked-at-resolve = declined rule verbatim.
5. `npm test` passes.

## Technical Approach

Composition is mechanical from the same inputs the console already gathers; this sub-issue is a rendering/persistence change, not a decision-model change. The intended trust boundary is repo write access — approximately merge-equivalent — but verify GitHub's actual comment-edit permission model (write vs triage; editing another user's comment) as an implementation task and state the verified surface in the rendered legend; if it turns out broader than merge rights, surface that on the parent record rather than silently accepting it. Preserve-ticks-on-edit is read-modify-write: fetch, merge tick states by item ID (matching ids keep their tick; removed ids drop; new ids arrive unticked), re-fetch immediately before the write and re-merge if the body changed underneath, then write once — the residual fetch-to-write race window is accepted and documented.

### Data / API Surface

- Comment marker: `<!-- claude-tweaks-console: {run-id} -->` first line; items `<!-- console-item: {id} -->`; task-list rows `- [ ] {label}`. Bundle consoles qualify item ids per spec — `{spec-slug}-{kind}-{n}` — so ids are unique across the whole comment set.
- `{run-dir}/console.json`: `{ commentIds: [primary, ...overflow], prNumber, items: [{id, kind, summary, stagedHash}], renderedAt }` — the Resolve checkbox lives only in the primary comment and covers overflow items; idempotent re-render edits every listed comment; a stale or deleted comment id ⇒ recreate the comment and update console.json. `stagedHash` records each staged file's content hash at render time for the executor's drift check.

### Key Files

- `skills/wrap-up/review-console.md`, `skills/wrap-up/console-template.md` — renderer + protocol.
- `skills/flow/multispec-review-console.md` — bundle wiring.
- `docs/skill-graph.md` — edges.

## Gotchas

- #347 (autonomy-tiered console resolution) composes with this: it decides which items may auto-resolve; this decides where answers live. Do not implement its `consoleAutoResolve` semantics here — Related, not merged scope.
- `staged/` classification ("any file with Title:/Type:/Labels: header is a queue write") is load-bearing for rendering — reuse the existing classifier, don't re-derive.
- GitHub renders task-lists only in top-level comment/issue bodies from `- [ ]` markdown — keep IDs in HTML comments adjacent to rows, never inside the checkbox text (editing ticks must not disturb IDs).
- Comment bodies cap at 65,536 characters — a console exceeding it must split overflow into a follow-up comment linked from the main one, with items never split mid-row.
- The auto-mode contract's "never silenced" list is unchanged: rendering on the PR is not silencing — every item still requires its tick.
- Merging the PR with an unresolved console is legal (the merge decision is independent); the console stays pending and the executor still acts on later ticks — which is why run-dir archival requires merged AND console-resolved (the reconciler states the same rule from its side).
- "Resolve time" is defined by the executor's read (the console-execution sub-issue), not by anything rendered here — this comment states the rule; that sub-issue enforces it.
- `console.json` is a cross-issue contract with no consumer until the executor lands — add a schema fixture test here as the placeholder consumer so a silent schema break is caught.
