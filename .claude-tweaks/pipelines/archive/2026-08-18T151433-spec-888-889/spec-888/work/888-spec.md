---
record: 888
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: infra
---
# 888: assess-agent-autonomy merge-check: blast-radius gather is prose-guarded — replace with a hard-failing bin CLI

## Current State

`skills/assess-agent-autonomy/merge-check.md` Step 1 derives `$MERGE_BASE` and the numstat diff as shell choreography: ~20 lines of prose mandate issuing both commands in ONE Bash call, because in a split call `MERGE_BASE` is empty in the second shell and `git diff --numstat ""..HEAD` returns zero lines with exit 0 — a 0-file blast radius that clears every `auto-merge-max-*` threshold and verdicts `auto-merge`.

The guard is prose, not structure:

- Even inside the single mandated call, nothing aborts between the two commands. A failed `git merge-base` (exit 128) still leaves the var empty, the diff still runs, and the node pipe still writes `[]` to `/tmp/assess-merge-files-${N}.json`. The only protection is the agent noticing the fatal stderr in the combined output.
- Worktree-isolated sessions can refuse compound/multi-line Bash by text shape, and merge-check runs precisely inside worktree pipelines (dispatch's per-group Task calls running `/flow`). The mandated one-call shape may be refused in the very sessions that call it, pushing the agent onto the forbidden split path — the exact hazard the prose exists to prevent.
- The choreography (three bash blocks, `/tmp` intermediate files, positional-arg passing into `node -e`) costs ~45 lines of sub-file prose that exists only to work around shell-state loss between Bash calls.

## Deliverables

- A new CLI at `plugin/bin/blast-radius.js` that does the whole gather in one node process: resolve the merge base (from `--base <ref>` when supplied, else `--integration-branch <name>` via `git merge-base`), run the numstat diff, read `merge-sensitive-paths`/`auto-merge-max-lines`/`auto-merge-max-files` via the existing policy resolver (or accept them as flags), classify via the existing `bin/lib/issues/blast-radius.js` (`classifyDiffFiles` + `blastRadiusSummary` — no duplicate classification logic), and print one summary JSON to stdout.
- **Hard-fail semantics:** an unresolvable or failed merge-base resolution exits non-zero with a stderr message naming the failure and prints no summary — a zero-radius result from a resolution failure becomes structurally impossible, instead of prose-discouraged.
- Rewrite `merge-check.md` Step 1 to invoke the CLI as a single plain command (no compound Bash, no shell variable carried across commands, worktree-Bash-shape-safe), deleting the one-call mandate, the empty-var hazard exposition, and the manual `node -e` blocks. Keep the #132 rationale (measure from the integration branch, and why) as a short note, and keep the existing `--base <ref>` short-circuit and integration-branch-resolution-failure -> `needs-human` handling.
- Tests under `tests/bin-lib/` covering: happy path against a real fixture repo/diff, `--base` pass-through, unresolvable-base hard-fail (non-zero exit, no stdout summary), genuinely-empty-diff vs failed-base distinction, and sensitive-path classification pass-through. Update any conformance tests that pin the current merge-check.md prose.

## Acceptance Criteria

- No code path in the CLI can emit a zero-file/zero-line summary as the result of a merge-base resolution failure; that case exits non-zero with a named error.
- `merge-check.md` Step 1's gather is one plain-command CLI invocation; the sub-file no longer contains the multi-command single-call mandate or the empty-`MERGE_BASE` hazard exposition it existed to mitigate.
- `classifyDiffFiles`/`blastRadiusSummary` remain the single classification implementation, consumed by the CLI — not reimplemented.
- `npm test` passes, including the new suite and updated prose-conformance pins.

_Filed by `capture` via specShapedBody._
