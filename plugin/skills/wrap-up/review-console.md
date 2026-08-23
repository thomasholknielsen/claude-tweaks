# Wrap-Up Review Console — Phase 4 (CLOSE)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **Every mode — `auto`, `hybrid`, interactive, standalone** — run whenever a pipeline run directory exists for this work, which is every run from Phase 1 onward (`SKILL.md`'s "Establish the run directory (unconditional)"). Mode is not a condition on this console; the run directory is.
- **`MULTISPEC_REVIEW_DEFER=1`** — the one exception: **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory, and the Multi-spec defer protocol below.

In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion` (Approve all / Override / Stop). Approve all now resolves `Q#`/`M#`/`U#` to their own stated defaults directly, with no further prompts; choosing Override is what still drills each item — `_shared/batched-item-drill.md` for `Q#`/`M#`, `_shared/upstream-feedback-batch.md` for `U#` (see `review-console-interactive.md`'s Hard requirements). `summary-template.md` now renders only the record of what was decided here, never a second decision point.

**Hard gate.** Check the response you are about to send: does it already contain the numbered console tables as literal rendered markdown, with a row for every item? If not, render them now, in this response, before the tool call.

## Dry-run mode (`--dry-run`)

When `--dry-run` was passed (see `SKILL.md`'s Phase 1 Flags subsection), run every analysis step normally — Phases 1-3, and the Auto-merge short-circuit's content-judgment verdict below — but treat everything from this point forward as preview-only:

- Skip the Auto-merge short-circuit's actual `git merge --no-ff` / `git push` even when both layers pass — log the verdict and what would have merged, then fall through to rendering the console below as a normal (non-merging) run.
- Skip that same branch's acceptance labeling — no `demo:pending` label write and no Verification Brief comment. Compose the brief and print it as a preview line instead. It is a network write to a live record, so it is preview-only for the same reason the merge is; the bullet above names only the two git commands because they were the only writes on that path when it was written.
- Present the console tables exactly as usual, but every action under "On approval" and "On override" becomes a printed preview line instead of an executed one — no `git apply`, no `git revert`, no `git commit`, no `gh issue create` / `local-store.js` write, no cleanup deletion, no skill-file write.
- Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`, via `_shared/upstream-feedback-batch.md`'s chunked presentation) all still render for visibility, but their `AskUserQuestion` call(s) are skipped — each item renders as "would create: {content}" instead. Under `--dry-run`, no memory file is ever written and `/claude-tweaks:feedback --pre-confirmed` is never invoked.
- Log to `decisions.md`: `AUTO {time} — Dry-run: {N} items would have been applied; 0 applied (--dry-run).`
- After presenting, stop — do not proceed to the phase-trace report or Phase 4's real execution step; report the preview as the run's final output.

## Auto-merge short-circuit

When this run's spec has a materialized header (`record:` field present in
`${RUN_DIR}/work/*-spec.md` — see `skills/flow/materialize.md`) AND EITHER the issue's **live**
labels carry `auto:merge` (re-fetch via `gh issue view --json labels` — the header's `grants:`
field is a snapshot for audit only) OR `manifesto-authorized-merge.md`'s applicability check
passes (the `merge-authorization` lever, #715), read `auto-merge-short-circuit.md` in this
skill's directory and follow it in full — the single-record version of
`skills/dispatch/SKILL.md`'s own group-scoped "Auto-merge gate," whether or not
`/claude-tweaks:dispatch` was involved. That file routes on `_shared/integration-model.md`'s
`pr-first`/`local-merge` split. Otherwise skip it entirely; do not read the file.

## Multi-spec defer protocol

When `MULTISPEC_REVIEW_DEFER=1` is set (by `/flow` multi-spec orchestration):

1. Do NOT present the console
2. Do NOT apply or revert any staged items — leave `staged/` and `decisions.md` untouched in the per-spec subdirectory
3. Append a final entry to this spec's `decisions.md`:
   ```
   AUTO {time} — Review Console deferred to multi-spec consolidated console. Per-spec staged items: {count}. Auto-decisions: {count}. Parent run dir: {MULTISPEC_PARENT_DIR}.
   ```
4. Write `verify-expectations.json` in this spec's own run directory: `{"version": 1, "memory": [], "upstream": [], "deferred": ["design-caches", "worktree", "ephemeral-server", "claim-release", "run-dir-archival"]}`. The five deferred cleanup items map 1:1 to `deferred`'s vocabulary (`cleanup-procedures.md`'s items 3/4/6/7/8). `memory`/`upstream` stay empty here — this spec's own M#/U# resolution never ran (deferred to the parent console); the parent's own consolidated run directory carries the real resolution once it completes, so a per-spec `verify` run against a `MULTISPEC_REVIEW_DEFER=1` spec will correctly render its `memory-updates`/`upstream-feedback` rows as `skip (nothing recorded)` rather than the more alarming `unknown (expectations file missing)` (a known, accepted limitation of per-spec verification under multi-spec defer, not a full resolution).
5. Proceed to the phase-trace report — the per-spec summary still renders, but its "Review Console" row reads `deferred — see multi-spec consolidated console`
6. Skip the run-directory archival in Phase 4's cleanup planning — the parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated console completes

This is the *only* condition under which `/wrap-up` skips the Review Console when a run directory exists. Every single-spec run — in any mode — always runs the per-spec console.

## Locate the pipeline run directory

See `_shared/pipeline-run-dir.md` for the resolution order and bash snippet. Resolution is unchanged; an empty result is **unreachable after Phase 1**, which creates a run directory on every run when none was inherited. If it happens anyway, do not skip the console — treat it as the prose-fallback case: present the same findings inline in this response, gathered from what this run itself produced rather than from `decisions.md` and `staged/`, and take the same terminal decision below.

## Read inputs

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)
4. `events.jsonl` — hook-recorded typed events; surface `wd-deny`, `wd-push-mismatch`, `contract-violation`, and `gate-denial` events
5. **Staged inventory reconciliation** — run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-staged-inventory --run "{run-dir}"` (`_shared/run-resume-freshness.md`'s companion check, #1269). When it reports `MISMATCH`, surface it as a visible warning line in the rendered console output (never a silent log entry) — a `STAGED` entry in `decisions.md` whose named `staged/` file does not exist means that proposal needs to be manually re-derived from `decisions.md`'s prose before it can be applied at this console.

## Ledger narrowing auto-file (runs before rendering)

Read `ledger-narrowing-auto-file.md` and follow it before building the tables below — when `_shared/autonomy-ceiling.md`'s `queueWriteAutoFile` capability is unlocked, a staged queue-write proposal is created directly and logged as `AUTO` (under **Auto-applied**) instead of waiting for Queue writes' per-item approval.

## Pending-review branch durability

No longer a separate step. Under `integration-model: pr-first`, `_shared/pr-early-run-lifecycle.md` opens this run's draft PR at run start, and every phase-exit push since (`_shared/git-discipline.md`) keeps it current — a run parking at `pending-review` already has a live, up-to-date PR with nothing left to push. The old dispatch-only durability procedure protected exactly these runs, which now get this for free, so nothing runs here.

<!-- local-merge-fallback --> Under `local-merge` this was never populated either — its scope guard required the dispatch-claim branch to match and dispatch requires a forge, which `local-merge` runs don't have. A `local-merge` run that parks stays resident in the session that built it, unchanged.

## Auto-resolution short-circuit (`consoleAutoResolve`)

This is the tier split for headless firings: `supervised`/`trusted` keep today's resting state — the console below renders as a blocking prompt that a headless run never answers, landing on `pending-review`. `unattended` is the only tier that completes without a human.

Resolve the ceiling once — `CEILING=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy)` — and check `bookkeepingPermissions(ceiling).consoleAutoResolve` (`bin/lib/issues/autonomy.js`, granted at `unattended` only — see `_shared/autonomy-ceiling.md`). When **not** granted, skip this section entirely and proceed to "Present a real stop" below — the ordinary `supervised`/`trusted`/interactive path, unchanged. When `--dry-run` was also passed, its preview-only behavior (above) takes precedence regardless of ceiling — nothing here executes a real write.

When granted, render the console as an **informational report**, not a prompt: every section below still appears (Auto-applied through Cleanup actions, `Q#`/`M#`/`U#`, Refused rows), each row stamped `AUTO-RESOLVED` — nothing dropped. Then resolve every item per its stated default, **zero** `AskUserQuestion` calls:

- Every batch-section item (Auto-applied through Cleanup actions) resolves as if "Approve all" had been chosen. **The merge half of that decision defaults to merge** (`integration-model: pr-first`'s "Approve all + merge" variant, never "leave PR open") — `unattended` authorizes full completion, not a park; `local-merge` proceeds to branch-finish the same way.
- Every `Q#`/`M#` item resolves to `Apply` — its pre-checked default in `_shared/batched-item-drill.md`. Refused rows are never auto-resolved (`refused-proposals.md`).
- Every `U#` item resolves to **filed**, not its usual unchecked/declined default. `consoleAutoResolve` means "apply the Approve-all default to everything," not "apply the Override-drill defaults" — and Thomas's explicit direction (#347's Decision Rationale) is that upstream feedback auto-files at `unattended` exactly like `M#`/`Q#`. This is the one point where `unattended`'s resolution diverges from what "Approve all" resolves at every other tier, where `U#` stays unchecked/declined by default (see `review-console-interactive.md`'s Hard requirements).

Execute each resolution via the normal "On approval" procedure below. Two differences from a human-driven "Approve all": log one `AUTO {time} — Review Console: auto-resolved {item}. Reversibility: {…}.` line per item to `decisions.md` instead of relying on a user answer to imply it, and **retain `staged/` files** rather than deleting/consuming them on apply — they stay as revert artifacts, the same way the auto-merge short-circuit's own commit is still revertible. Send one consolidated `PushNotification` summarizing the run, at the same point the auto-merge short-circuit sends its own FYI (`_shared/autonomy-ceiling.md`'s Notification section) — one notification for the whole run, never one per item. End with the absolute path to `decisions.md` and any retained `staged/*.md` files, so the operator has a concrete pointer even though nothing prompted at `unattended`.

After resolving, proceed directly to the phase-trace report — skip "Present the console" (`review-console-interactive.md`) and its `AskUserQuestion` call entirely.

## Present a real stop

Reached only when the Auto-resolution short-circuit above did not resolve and return, and
`--dry-run` did not already stop. Read `review-console-interactive.md` in this skill's directory
and follow it in full: Console-on-PR routing, the Numbering rules, "Present the console"'s table
render + terminal `AskUserQuestion`, "On override," "On stop," and the full Hard requirements.
That file's "On approval" branch invokes this file's own "On approval" section below — the two
files share that one procedure since the Auto-resolution short-circuit above also depends on it.

## On approval (option 1)

1. Apply all staged items in `staged/` for items 5–7 per `_shared/staged-patch.md`: `git apply` while the diff still fits; a stale diff — expected once `/simplify`, polish, or a fix wave moved the target — is re-derived from its `Target:`/`Invariant:` preamble, never dropped silently. Each outcome also writes back to the item's own row in the ledger file (`_shared/staged-patch.md`'s Write-back to the ledger) — the ledger's Status column is never left reporting `open` for a finding this step just applied
2. Apply skill updates and create new skills (items 11–12, from the Skills curation row)
3. Apply documentation updates (item 13, from the Docs curation row) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply journey updates (item 14, from the Journeys curation row) — including any approved missing-journey scaffolding (J2) and self-review fixes (J1)
5. Apply config updates (item 15: CLAUDE.md, rules, ADRs) — including any CLAUDE.md findings staged by the CLAUDE.md & rules curation row, which are always offered, never auto-applied
6. Execute cleanup actions (items 18 onward — one per row in `cleanup-procedures.md`'s canonical list, which is what sets the last number) — Phase 4's execution step picks these up. Under `pr-first`, the worktree/branch-finish row (`cleanup-procedures-execution.md` Section C) routes on which Approve-all variant was chosen: "Approve all + merge" runs `_shared/pr-first-merge.md`'s procedure (`tag: fast-lane`, no prompt — same procedure the Auto-merge short-circuit above uses); "Approve all, leave PR open" skips the merge attempt, landing on `pending-review` with the PR left ready. Under `local-merge`, cleanup runs unchanged (Section C's own `/superpowers:finishing-a-development-branch` handoff)
7. For each `Q#` queue write, choosing Approve all resolves it to its pre-checked `Apply` default directly — no separate prompt; choosing Override instead resolves it via the multiSelect chunk (or the free-text Edit override). On Apply (or Edit, after the modification): run `refused-proposals.md`'s check first (a refused item is never created), then create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip (Override only) drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
8. For each `M#` memory update, choosing Approve all resolves it to its pre-checked `Apply` default directly — no separate prompt; choosing Override instead resolves it via the multiSelect chunk (or the free-text Edit override). On Apply (or Edit, after the modification): write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s "Memory write procedure (D4)" at batch approval (or auto-resolution — see the Auto-resolution short-circuit above), reading the proposed file and index line from the item's staged file (`staged/wrap-up-memory-{N}.md`). The memory directory comes from the invoking assistant's own system prompt — never derived or guessed. This write lands outside the repository, so it is not part of the wrap-up commit below. Skip (Override only) drops the proposal — log the decline as in step 7.
9. For the `U#` upstream feedback rows, choosing Approve all resolves every row to its unchecked/declined default directly — no separate prompt, and nothing is filed (see `review-console-interactive.md`'s Hard requirements; the Auto-resolution short-circuit above is the one exception, where `unattended` files every `U#` row instead). Choosing Override instead presents them via `_shared/upstream-feedback-batch.md`'s shared batch contract (chunked `multiSelect` calls) — the body rendered in that table (read from `staged/wrap-up-upstream-{N}.md` when the table was built) **is** the approved snapshot. For each item checked in the resulting chunk(s): invoke `/claude-tweaks:feedback --pre-confirmed`, passing both the staged-file path and that approved snapshot for its drift check; its Step 6 scrub always reruns as a separate safety net regardless of the drift result; on drift it falls back to its own normal `AskUserQuestion` confirm for that one item. An item left unchecked (Override) or resolved by the Approve all default is declined per the shared contract's decline rule — log the decline as in step 7.
10. Write `verify-expectations.json` in `$PIPELINE_RUN_DIR`: `{"version": 1, "memory": [...], "upstream": [...]}` — `memory` holds one `{file, indexFile}` entry per `M#` item resolved to Apply in step 8 (the file/indexFile the staged item named), empty array when none resolved to Apply this run; `upstream` holds one `{url}` entry per `U#` item resolved to filed in step 9, empty array when none resolved to filed this run. Always write this file, even when both arrays are empty — an absent file and an empty one are DISTINCT states to the `verify` verb (`engine-verify.js`): absent means this write step itself didn't run, empty means it ran and found nothing to record. Skipped entirely under `--dry-run` — consistent with "no memory file is ever written" under `--dry-run` above.
11. Commit with a wrap-up message
12. Proceed to the phase-trace report

For "On override" and "On stop" (options 2 and 3 — reachable only from a real rendered stop), and
the full Hard requirements, see `review-console-interactive.md`.

## Empty-console fast path

If `decisions.md` holds no decision-bearing entries (`AUTO` / `STAGED` / `KEPT-PROMPT` / `REFUSED` — `SCANNED` audit lines are excluded, see below) AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely. Write an empty `verify-expectations.json` (`{"version": 1, "memory": [], "upstream": []}`) in `$PIPELINE_RUN_DIR` if it does not already exist — nothing was resolved this run, so `memory-updates`/`upstream-feedback` should read "nothing recorded," not "file missing." Log "Review Console: nothing to review" and proceed to the phase-trace report.

Two kinds of entry never count toward this test, alongside each other:

- **`SCANNED` audit lines** do not count as decision-bearing. The curation engine (`curation-engine.md`) writes one `SCANNED` line per registry row — open and closed rows alike — at `plan`/`record` time, so `decisions.md` always holds at least one by the time this test runs; `SCANNED` reports scan scope and outcome, never a decision (`_shared/auto-decision-log.md`'s Status vocabulary). An **open** row with a real finding still writes its own separate `AUTO`/`STAGED`/`KEPT-PROMPT` line alongside its `SCANNED` line — this exclusion only widens the skip to cover a `decisions.md` holding purely `SCANNED` lines (an all-clean run), never a run that also found something.
- **Cleanup rows that are unconditional bookkeeping** — run-dir archival, `cleanup-procedures.md` item 8 — do **not** count as cleanup actions for this test; archival executes regardless, undisplayed. Without that carve-out the fast path could never fire, since item 8's condition now holds on every run.
