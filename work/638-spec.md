---
record: 638
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 638: hooks.js reconcile: default output is a ~13 KB one-line census — compact by default, `--json` for the full report

Surface: backend

## Current State

`bin/hooks.js reconcile` (a thin CLI wrapper over `bin/lib/reconcile/index.js`'s one exported `reconcile()`, `bin/hooks.js:296-309`) unconditionally prints one `JSON.stringify(out) + '\n'` line to stdout — there is no `--json` flag; JSON is the only output mode today.

Measured on a live session: one reconcile call enumerated 14 worktrees, 23 claims, 45 run dirs, and 45 console entries in a single ~13 KB line — the largest single tool result of that session by an order of magnitude after the session's own intended-large diffs, and unsplittable by `| tail -N` since it's one line.

`reconcile()`'s return shape (`{ mirror, redTip, worktrees, claims, runs, branches, remoteBranches, console, skipped }`) is consumed two ways:
- **In-process**, reading `result.*` fields directly — `bin/hooks.js`'s `session-start` hook, `/tidy`'s scan procedures (`docs/skill-graph.md`'s `bin/lib/reconcile/` row: the report's "Applied automatically" section renders `result.claims`/`result.worktrees`/`result.branches`/`result.remoteBranches`). Unaffected by any CLI stdout-format change.
- **Via this CLI's stdout**, logged or reported verbatim as "the JSON result": `skills/routine-kickoff/SKILL.md` Step 3 ("report its one-line JSON result"), `skills/dispatch/SKILL.md`'s pre-queue-pull call ("Log the JSON result to this firing's `decisions.md`"), and `skills/tidy/scan-procedures.md`'s Step 4.5 pre-probe call ("Log the JSON result to this run's `decisions.md`"). All three also read the returned `console.ready` array off that same output to decide whether to follow `_shared/console-execution.md`.
- **Via this CLI's stdout, fire-and-forget** (output discarded, called only for the fast-forward/convergence side effect): `skills/_shared/pr-first-merge.md` Step 4.2, `skills/_shared/worktree-setup.md`'s pre-creation reconcile, `skills/_shared/scratch-worktree.md`'s creation step, `skills/routine/record-freshness.md` Step F2. These do not depend on output format and need no change.

`tests/reconcile.test.js` asserts on the CLI today by parsing `JSON.parse(r.stdout)` directly against plain `reconcile` invocations (two assertions, around the no-repo and `--dry-run` fixtures) — it has no `--json` flag to pass because JSON is currently the only format.

## Deliverables

1. Add a `--json` flag to `bin/hooks.js`'s `reconcile` command block (`bin/hooks.js:296-309`), parsed out of `args` alongside the existing `--dry-run`. When `--json` is passed, preserve today's exact behavior byte-for-byte: `process.stdout.write(JSON.stringify(out) + '\n')` — unchanged shape, so `bin/lib/reconcile`'s existing JSON consumers (the CLI's own `--json` callers and anything else that might parse it) don't move.
2. When `--json` is absent (the new default), print a compact summary instead: one line per action-category actually taken (drawn from the non-null/non-empty `mirror`, `redTip`, `worktrees`, `claims`, `runs`, `branches`, `remoteBranches`, `console` fields — e.g. `archived: 1 run dir`, `released: 3 claims`, `reaped: 1 worktree`), plus a single aggregated line for `result.skipped`, grouped by `reason` (and `check` where that disambiguates), matching the issue's own example format: `skipped: 44 run dirs (no-worktree 24, move-failed 15, pr-open 5)`. Degrade paths that already produce an all-null/all-skipped result (e.g. `no-repo`, `no-remote`, the `reconcile-threw` catch at `bin/hooks.js:307`) must still render clearly in the compact default, not just under `--json` — no silent success-looking output on a real failure.
3. Update `skills/routine-kickoff/SKILL.md` Step 3, `skills/dispatch/SKILL.md`'s pre-queue-pull reconcile paragraph, and `skills/tidy/scan-procedures.md`'s Step 4.5 pre-probe paragraph — the three prose sites that currently say "report"/"log the JSON result" — to either pass `--json` explicitly (if that call site needs to keep parsing/logging the full structured result, e.g. to read `console.ready`) or describe the new compact default (if a human-readable summary is what that call site actually wants logged). Judge per call site: `dispatch` and `tidy` both read `console.ready` off the result today, so they most likely need `--json` kept; `routine-kickoff`'s "report its one-line JSON result" is closer to the operator-facing use case the issue itself names, and may be the one call site that should switch to the compact default and drop `--json`.
4. Update `tests/reconcile.test.js`'s two stdout-parsing assertions to add `--json` so they keep parsing `JSON.parse(r.stdout)` against the unchanged shape; add at least one new assertion covering the compact default's output on a fixture that produces a mix of actions-taken and skips.

## Acceptance Criteria

- `node bin/hooks.js reconcile` (no `--json`) on a fixture with at least one action taken across multiple categories and a mix of skip reasons prints a compact summary materially shorter than today's `JSON.stringify(out)` output on the same fixture — one line per non-empty action category plus one aggregated skipped-by-reason line, not the full per-item census.
- `node bin/hooks.js reconcile --json` on the same fixture prints output byte-identical to today's unconditional `JSON.stringify(out) + '\n'` format.
- A degrade path (`no-repo`, `no-remote`, or the `reconcile-threw` catch) still produces a clearly failure-legible compact-default line, not output that reads as a clean no-op.
- `tests/reconcile.test.js` passes with `--json` added to both existing stdout-JSON-parsing assertions, plus new coverage for the compact default's format.
- The three prose call sites identified in Deliverable 3 (`routine-kickoff`, `dispatch`, `tidy/scan-procedures.md`) are updated to match the CLI's actual new default behavior — no skill still describes plain `reconcile` as printing "the JSON result" once the default has changed.
- `npm test` passes in full.
- No change to `bin/lib/reconcile/index.js`'s `reconcile()` return shape or to any in-process caller (`session-start.js`, `/tidy`'s scan procedures reading `result.*` directly) — this is a CLI-output-formatting-only change.

## Technical Approach

- Touch `bin/hooks.js`'s `if (cmd === 'reconcile')` block only for the flag-parsing and output-branching; factor the compact-summary formatter into a small new module (e.g. `bin/lib/reconcile/format-summary.js`) rather than inlining it in `bin/hooks.js`, matching the existing one-module-per-concern layout under `bin/lib/reconcile/`.
- The formatter takes exactly the object `reconcile()` already returns (`{ mirror, redTip, worktrees, claims, runs, branches, remoteBranches, console, skipped }`) — no changes needed to `bin/lib/reconcile/index.js` or any of its per-check modules (`archive-merged.js`, `release-merged.js`, `reap-merged.js`, `mirror-ff.js`, `red-tip.js`, `archive-branches.js`, `prune-remote.js`, `console-execute.js`); they already return the granular per-item data the formatter reads. This is purely a presentation layer over the existing return shape.
- `result.skipped` entries are `{ check, reason }` or `{ check, reason, count }` (the `count` form used at least once already, `bin/lib/reconcile/index.js`'s `deferred` skip) — the formatter's grouping logic needs to handle both shapes when aggregating.

## Gotchas

- `tests/reconcile.test.js` currently exercises the CLI's default (only) output format directly by parsing `JSON.parse(r.stdout)` on plain `reconcile`/`reconcile --dry-run` calls — this PR breaks that assumption unless both call sites gain `--json`; grep the file for `JSON.parse(r.stdout)` to find every one, don't rely on the two spot-checked above being the only occurrences.
- Judgment call in Deliverable 3, item-by-item, rather than a blanket "add --json everywhere": `dispatch` and `tidy` currently read `console.ready` off the parsed result to decide whether to run `_shared/console-execution.md` — if the compact default's summary doesn't also surface console-readiness in a parseable way, those two call sites need `--json` kept, not dropped. `routine-kickoff`'s use ("report its one-line JSON result" to a human/log, not machine-parsed downstream) is the one most likely to prefer the new compact default outright.
- Keep the `--json` output byte-for-byte identical to today's format, not just semantically equivalent — anything depending on the old default's exact bytes (a future consumer, a cached fixture) should be unaffected by this change as long as `--json` reproduces it exactly.

## Original request

hooks.js reconcile: default output is a ~13 KB one-line census — compact by default, `--json` for the full report

**Summary:** `node bin/hooks.js reconcile` prints one ~13 KB JSON line enumerating every worktree, claim, run dir, and console it considered; a caller wanting to confirm three claim releases pays the whole census in context, and `| tail -15` cannot trim a single line.

**Kind:** Gap

**Affected component:** `bin/hooks.js reconcile` (`bin/lib/reconcile`)

**Objective:** Context overhead

**Measurement:** one reconcile call → 14 worktrees, 23 claims, 45 run dirs, 45 console entries in a single line; largest single tool result of the session by an order of magnitude after the intended-large diffs.

**Use case:** The post-merge reconcile is called at the end of every pr-first run; the operator/model needs "what did you do" (1 archived, 3 released, 1 reaped) — not the skip census.

**Proposed fix:** Compact default: one line per action taken plus `skipped` counts aggregated by reason (`skipped: 44 run dirs (no-worktree 24, move-failed 15, pr-open 5)`); `--json` opt-in returns today's full object. Keep the JSON shape unchanged under `--json` so `bin/lib/reconcile`'s existing consumers don't move.

**Definition:** Clear

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-084a7ec4 -->

