# Multi-Spec Consolidated Review Console

For multi-spec `/flow` runs in `auto` or `hybrid` mode, the per-spec Wrap-Up Review Consoles (`/wrap-up`'s Phase 4) are **deferred** so the user is not interrupted between specs. After the final spec's wrap-up completes, `/flow` runs **one consolidated Review Console** that aggregates decisions and staged items from every spec in the run.

This preserves the bookend architecture (Manifesto at start, one Review Console at end) even when N > 1 specs run sequentially.

**Scope:** this console belongs to a single `/flow` invocation and never aggregates across multiple invocations. `/claude-tweaks:dispatch` does not consolidate through here across firings or groups — each firing reports its one claimed group's outcome directly (see `dispatch/SKILL.md`'s Reporting section). A dispatched bundle's own `/flow "#A,#B"` call still lands here exactly like any other multi-spec run — this file's job doesn't change, only who aggregates across separate runs does (nobody, now).

## Run directory layout (multi-spec)

For the canonical run-directory layout, `manifest.yml` schema, and the environment variables `/flow` exports to each per-spec invocation (`PIPELINE_RUN_DIR`, `MULTISPEC_REVIEW_DEFER`, `MULTISPEC_PARENT_DIR`, `MULTISPEC_KEEP_GOING`), see `multi-spec.md`.

The single-spec path is unchanged: `PIPELINE_RUN_DIR` points to a top-level run dir, `MULTISPEC_REVIEW_DEFER` is unset.

## When to run the consolidated console

After every spec's pipeline reaches `/wrap-up`'s Phase 4 execution step (or stops at a HARD-GATE failure) AND the multi-spec run is in `auto` or `hybrid` mode:

0. If `MULTISPEC_CURATION_DEFER=1`, run the batch pass first — `multispec-batch-curation.md`. It writes to the parent's `decisions.md`/`staged/`/`engine-state.json`, covered by steps 2-3.
1. Read `manifest.yml` to enumerate per-spec subdirectories, in spec execution order.
2. For each `spec-{N}/`: read `decisions.md` + `staged/` contents (including any `staged/leftover-*.md` queue-write proposals — see Queue writes below) for the prose-aggregated sections (Auto-applied, Pending review, Low-confidence findings, Contested findings, Cleanup actions, Issue closures, Translated briefs, Queue writes, Memory updates, Upstream feedback). This read is unconditional: a spec with no `engine-state.json` (its wrap-up never reached Phase 2 — e.g. it failed before that point) still contributes every prose-aggregated row and a Not run/Failed footer row; it simply contributes nothing to the engine call in step 3 below. ALSO read the parent run dir's own `decisions.md` + `staged/` (Manifesto-created — holds run-level items such as freeform-issue translations and any parent-level leftover proposals).
3. Invoke the engine for the five engine-rendered sections — Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs — using one repeated `--spec-state` flag per spec with an `engine-state.json` present, in the spec execution order from step 1:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" render --section console \
     --spec-state {id1}={path1} --spec-state {id2}={path2} [...] \
     --spec-state batch={parent}/engine-state.json \
     --start-at {n} [--strict]
   ```

   `{id}` is each spec's own id (`157`, `159`, …); `{path}` is that spec's `engine-state.json` path (`spec-{N}/engine-state.json`). `--spec-state batch=...` is present only when step 0's pass ran — `batch` is a reserved id. `{n}` is the next number in this console's global row sequence — see "Numbering rules" below. Insert the command's stdout verbatim into the console response — do not hand-expand it, exactly as `wrap-up/review-console.md` instructs for its own single-spec call.

   Skip this engine call entirely when no spec has an `engine-state.json` AND no batch pass ran — the five sections are then simply absent, and `{n}`'s only consumer becomes the first prose-aggregated section that follows.

   **If the call exits non-zero for any other reason** (a present-but-malformed `engine-state.json` for one spec aborts the whole invocation before producing any stdout, per `wrap-up-engine.js`'s own fail-loud contract — passing every spec's state in one call means one bad file blocks every spec's engine-rendered sections, not just the bad one's): do not silently omit the five engine-fed sections for the run. Drop only the offending spec's `--spec-state` flag and re-run the call with the remaining specs' flags — the same "engine failure is never permission to skip a row" principle `curation-engine.md` states for the single-spec engine path, applied per-spec here. Note the dropped spec in the console's Not run/Failed footer with the CLI's own error text as the reason.
4. Render the consolidated console (template below): the prose-aggregated sections from step 2's reads, then the engine's verbatim output from step 3 in its own position (see the template), then the remaining prose-aggregated sections in the order "Numbering rules" below states.
5. Apply the user's approval/override
6. Archive the parent run dir to `.claude-tweaks/pipelines/archive/`

In `interactive` mode (auto opted out), the per-spec consoles ran inline as usual — no consolidation step. Skip this entirely. (Default `auto`, `confirm`, and `hybrid` all consolidate.)

If the multi-spec run aborted early (one spec hit a HARD-GATE), still render the consolidated console with whatever was accumulated up to the failure point. Specs that didn't run appear as a row in the "Not run" footer.

## Locating the parent run directory

1. Resolve via `MULTISPEC_PARENT_DIR` env var if set by `/flow`
2. Else find the most recent directory in `.claude-tweaks/pipelines/` whose `spec-slug` is dash-joined with a single `spec-` prefix (e.g., `spec-157-159-160`)
3. Else fall back to interactive single-spec behavior (no consolidation)

## Numbering rules

**Canonical render order.** This is the one place this order is stated — every other reference to it (step 4 above, the template below) points here rather than restating the list: Auto-applied, Pending review, Low-confidence findings, Contested findings, then the five engine-rendered sections in their own position, then Cleanup actions, Issue closures, Translated briefs, Queue writes, Refused — no defer reason (`wrap-up/refused-proposals.md`), Memory updates, Upstream feedback.

Rows across Auto-applied through Translated briefs use a single global sequence starting at #1 (mirrors `wrap-up/review-console.md`). Three sections sit outside that global sequence and are never counted among the named batch sections, exactly as `wrap-up/review-console.md`'s own three non-batch sections (its Hard requirements explains why): **Queue writes** use a separate `Q`-prefixed sequence (`Q1`, `Q2`, …), one `AskUserQuestion` call per item — aggregated across every spec's staged record-proposal files (`staged/leftover-*.md`, `staged/ledger-record-*.md`, or any staged file carrying a `Title:`/`Type:`/`Labels:` header) plus the parent run dir's own. **Memory updates** use a separate `M`-prefixed sequence (`M1`, `M2`, …), one `AskUserQuestion` call per item — aggregated across every spec's `staged/wrap-up-memory-*.md` files plus the parent run dir's own. **Upstream feedback** uses a separate `U`-prefixed sequence (`U1`, `U2`, …), approved via `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` calls instead of one call per item — aggregated across every spec's `staged/wrap-up-upstream-*.md` files plus the parent run dir's own. Do not restart any of the four sequences per spec or per section.

## Pending-review branch durability

No longer a separate step. Under `pr-first`, `_shared/pr-early-run-lifecycle.md` opens each spec's draft PR at run start, and every phase-exit push (`_shared/git-discipline.md`) keeps it current — a bundle parking at `pending-review` already has live PRs with nothing left to push.

<!-- local-merge-fallback --> `local-merge` never populated this either — the old procedure required a dispatch-only run-identity variable and a forge. A `local-merge` bundle that parks just stays resident in its session.

## Auto-resolution short-circuit (`consoleAutoResolve`)

Same mechanism as `wrap-up/review-console.md`'s own Auto-resolution short-circuit, aggregated across every spec — the path a dispatched bundle group reaches when `/claude-tweaks:dispatch` invokes `/flow "#A,#B"` under an `unattended` ceiling (`dispatch/SKILL.md` Step 5); without it this console would hang a headless firing the same way the single-spec console's tier split exists to prevent. Resolve the ceiling once and check `bookkeepingPermissions(ceiling).consoleAutoResolve` (`bin/lib/issues/autonomy.js`; `_shared/autonomy-ceiling.md`) — not granted → skip to "Present the consolidated console" below, unchanged. `--dry-run` still takes precedence when both apply.

When granted: render every section below as an informational report (nothing dropped), rows stamped `AUTO-RESOLVED`; resolve every item per its stated default with **zero** `AskUserQuestion` calls — batch sections and `Q#`/`M#` as if Approve all had been chosen; `U#` resolves to **filed**, the one exception to its default (same rule as the single-spec short-circuit). Execute via "On approval" below; log one `AUTO {time} — Review Console: auto-resolved {item}. Reversibility: {…}.` line per item to the originating spec's `decisions.md` (or the parent's, for a parent-level item) instead of a user answer, retain every `staged/` file as a revert artifact rather than consuming it, and send **one** consolidated `PushNotification` for the whole run, not per spec/item, at the same point the single-spec short-circuit sends its FYI. Then proceed straight to Cleanup actions execution (Shared teardown below) and archive the parent run dir — skip only the `AskUserQuestion` prompt; already rendered above.

## Console-on-PR (`integration-model: pr-first` only)

Bundle analog of `wrap-up/review-console.md`'s Console-on-PR section (rationale there). Past the short-circuit: `local-merge` (`_shared/integration-model.md`) → "Present the consolidated console" below.

`pr-first` + `pr` on the parent `run-state.json` (one bundle PR — `_shared/pr-early-run-lifecycle.md`): read `_shared/console-on-pr.md`, compose the content below would, post, write `console.json` to the parent run dir. Live: also ask `AskUserQuestion` (`_shared/console-execution.md`). Headless: report `pending-review` + URL. Never both. No `pr` yet: fall through below.

## Present the consolidated console

```markdown
### Multi-Spec Wrap-Up Review Console

Pipeline complete for specs 157, 159, 160. The pipeline auto-resolved {N} decisions and staged {M} items across all 3 specs. One batch decision below resolves everything.

#### Auto-applied (already in commits — override = revert)

| # | Spec | Skill | What | Where | Status |
|---|---|---|---|---|---|
| 1 | 157 | /review | Applied 3 severity:low formatting fixes | commit `def5678` | Applied |
| 2 | 157 | /test | Auto-fixed 4 lint failures | commit `ghi9012` | Applied |
| 3 | 159 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` | Applied |
| 4 | 159 | /review | Applied 2 severity:low naming consistency fixes | commit `jkl4567` | Applied |
| 5 | 160 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml | Applied |

A `SCANNED` entry (skill-curation's scan-summary log line — see `_shared/auto-decision-log.md`) also renders in this section, tagged with its originating spec, but with `Status` = `Informational` and `Where` = the step/location it ran at (no commit ref, since nothing was applied) — there is nothing to revert for these rows.

#### Pending review (staged — apply, skip, or modify per item)

| # | Spec | Skill | What | Detail | Patch |
|---|---|---|---|---|---|
| 6 | 157 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `spec-157/staged/review-2.patch`, `spec-157/staged/review-3.patch` |
| 7 | 159 | /wrap-up | Skill restructure proposed | Split `auth/SKILL.md` into `auth/` + `session-management/` | `spec-159/staged/wrap-up-skill-restructure.md` |

#### Low-confidence findings (not reproduced)

Render this section only when `decisions.md` contains STAGED entries with the unconfirmed-finding rationale (single-source per-lens findings, or findings downgraded by cross-lens debate). Aggregated across every spec in the run, `Spec`-tagged. Omit the section entirely when empty for every spec.

| # | Spec | Path:Line | Finding | Severity | Lens |
|---|---|---|---|---|---|
| 8 | 157 | src/auth.ts:42 | Possible null check missing | medium | error-handling |
| 9 | 157 | src/api.ts:180 | Race condition on token refresh | high | security |

> These findings were surfaced by exactly one reviewer agent (or downgraded by a debate that converged negative). The signal is real but unreplicated; the user decides whether to apply, ignore, or escalate.

#### Contested findings (debate inconclusive)

Render this section only when `decisions.md` contains STAGED entries from cross-lens debate with mixed/partial verdicts. Aggregated across every spec in the run, `Spec`-tagged. Omit the section entirely when empty for every spec.

| # | Spec | Path:Line | Lens A verdict | Lens B verdict |
|---|---|---|---|---|
| 10 | 159 | src/auth.ts:42 | agree (security) | partial (architecture) |

> Two reviewer lenses disagreed on this region and one debate round did not converge. Both verdicts are staged at `spec-{N}/staged/review-contested-{M}.md` with reasoning side-by-side. Pick one — or accept both as informational — from the action prompt below.

Generate the next five sections — Skill updates, Documentation updates, Journey updates, Configuration updates, and Reference repairs, in that order, matching `engine-render.js`'s `SECTION_SPECS` emission order — via the `--spec-state` engine call in "When to run the consolidated console" step 3 above. `renderConsoleSectionsMulti` emits a bare `#### {title}` heading per section plus one uniform `| # | Spec | Target | Change | Disposition |` table (integer `#`, the contributing spec's id, `finding.targetPath`, `finding.summary`, and `applied ({commit})` / `staged ({stagePath})`) — the same five columns for all five sections. The richer per-section shapes below illustrate what those rows mean; they are not a second render shape. On an engine run, insert `render`'s output verbatim into the response; do not hand-expand it into a different table shape.

#### Skill updates (from each spec's Skills curation row)

| # | Spec | Skill | Section | Change |
|---|---|---|---|---|
| 11 | 157 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 12 | 159 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Documentation updates (from each spec's Docs curation row)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 13 | 157 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Journey updates (from each spec's Journeys curation row)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| — | — | — | — | (none in this example) |

#### Configuration updates (from each spec's CLAUDE.md & rules and Decision records curation rows)

| # | Spec | Type | Target | Change |
|---|---|---|---|---|
| 14 | 159 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

An `[adr-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below — the row's mechanics are unchanged from the single-spec console (`wrap-up/review-console.md`'s Configuration updates section), only its aggregation is per-spec here, the same way Queue writes already aggregates.

#### Reference repairs (from each spec's Broken references curation row)

Render this section whenever any spec's broken-reference sweep found a surviving reference, in either of two states — **applied** (already happened in that spec's own `Initiative-Fix:` commit) or **staged** (an ordinary approval row). Omit the section entirely when every spec's sweep found nothing.

| # | Spec | State | Target | Repair | Broken by | Why |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | (none in this example) |

#### Cleanup actions (executed after approval, per row — branch-finish gates the per-spec rows below it)

Render 2 run-level rows (no `Spec` value, rendered as `—`) plus 3 rows per spec with a populated `Spec` column, drawn from `wrap-up/cleanup-procedures.md`'s Section D (ephemeral dev server) and Section E (issue claim release, grant removal, per-issue label cleanup) — the same steps "Shared teardown" below performs, made visible and individually overridable before they execute.

**Branch-finish is a hard prerequisite for every per-spec row below it.** Claim release needs branch-finish's outcome ($LINK — merge commit sha or PR URL) to release each issue correctly; grant removal and label cleanup key off the same outcome. Dev-server teardown has no such dependency and may be skipped independently of every other row.

| # | Spec | Action | Details |
|---|---|---|---|
| 15 | — | Tear down shared ephemeral dev server | `{parent-run-dir}/ephemeral-server.txt`, if one was started |
| 16 | — | Finish the shared branch | `/superpowers:finishing-a-development-branch` — merge / PR / discard; every row below depends on this outcome |
| 17 | 157 | Release issue claim | `claims/issue-157.json` on `claims-registry` |
| 18 | 157 | Remove grants | `auto:build`/`auto:merge`, if present |
| 19 | 157 | Per-issue label cleanup | Remove `bot:in-progress`; restore `parked` if applicable |
| 20 | 159 | Release issue claim | `claims/issue-159.json` on `claims-registry` |
| 21 | 159 | Remove grants | `auto:build`/`auto:merge`, if present |
| 22 | 159 | Per-issue label cleanup | Remove `bot:in-progress`; restore `parked` if applicable |

#### Issue closures (issue-derived specs — closes on YOUR merge/push, not by the pipeline)

| # | Spec | Issue | Closes via |
|---|---|---|---|
| 23 | 157 | #84 | `Fixes #84` in the reconciliation merge commit (worktree) or the spec's wrap-up commit (current-branch) — fires on push to the default branch |

Issues resolved without a merge (wontfix/duplicate) list a manual `gh issue close` command
instead — a user action. Omit this section entirely for runs without any record-derived
specs in the batch (no materialized header present).

#### Translated briefs (freeform issues — what the model inferred)

| # | Issue | Translation |
|---|---|---|
| 24 | #85 | `staged/translation-85.md` — original prose → three-section brief |

Omit when the run had no freeform issues.

#### Queue writes (Approve all applies the default; Override drills each item)

Render this section only when leftover routing, the ledger resolve gate (`staged/ledger-record-*.md`), or another step (e.g. a spec's `/reflect` tangential-idea routing) proposed a new work record in any spec's `staged/` — or the parent run dir's own — as a file carrying a `Title:`/`Type:`/`Labels:` header. Aggregated across every spec in the run — each row gets its own prompt; bulk approval is forbidden per `_shared/auto-mode-contract.md`'s work-record-creation row, exactly as `wrap-up/review-console.md`'s Queue writes section. The exact write mechanism (`gh issue create` / `local-store.js`, or — for a skill not yet migrated onto the unified record system — its own destination) lives in the producing spec's own staged file; this table only needs enough to render the prompt.

| Q# | Spec | Destination | What | Source |
|---|---|---|---|---|
| Q1 | 157 | record (parked — trigger: /auth provider docs land) | "Add OAuth refresh edge case" — blocked on /auth provider docs | `spec-157/staged/leftover-add-oauth-refresh-edge-case.md` |
| Q2 | 159 | record (backlog) | "Investigate token rotation strategy" — surfaced during spec 159's build | `spec-159/staged/leftover-investigate-token-rotation.md` |

Below each row, show the full staged file content for the item so the user can see exactly what will be filed. Omit the section entirely when no spec (and no parent-level proposal) staged a record proposal.

#### Memory updates (Approve all applies the default; Override drills each item)

Render this section only when any spec's Memory curation row (or the parent run dir's own) staged a memory-file proposal (`staged/wrap-up-memory-*.md`). Aggregated across every spec in the run — each row gets its own prompt; bulk approval is forbidden per `_shared/auto-mode-contract.md`'s memory-write row, exactly as `wrap-up/review-console.md`'s Memory updates section. A memory file is cross-project and always-loaded — a wrong one degrades every future session in every project.

| M# | Spec | Name | Type | Fact | Index line | Patch |
|---|---|---|---|---|---|---|
| M1 | 157 | dispatch-prompt-conventions | feedback | Restate convention-governed actions in the dispatch prompt | `- [Dispatch prompt conventions](dispatch-prompt-conventions.md) — restate the convention` | `spec-157/staged/wrap-up-memory-1.md` |

Below each row, show the full staged file content for the item so the user can see exactly what would be written. Omit the section entirely when no spec (and no parent-level proposal) staged a memory proposal.

#### Upstream feedback (Approve all declines by default; Override files per item)

Render this section only when any spec's Upstream feedback curation row (or the parent run dir's own) staged one or more upstream defect/gap reports (`staged/wrap-up-upstream-*.md`). Approve all resolves every row here to declined, same as `Q#`/`M#` resolve to their own default (see the terminal-decision note above; the `unattended`-only Auto-resolution short-circuit below is the one exception, where every row resolves to filed instead). Filing requires choosing Override, which aggregates across every spec in the run and runs through `_shared/upstream-feedback-batch.md`'s shared batch contract — one or more chunked `multiSelect` `AskUserQuestion` calls (chunked per that file's own rule, unchecked by default — checking is the explicit approval) instead of one call per item; no per-item gate can be bulk-resolved by a shared toggle even here, per `_shared/auto-mode-contract.md`'s upstream-filing row, exactly as `wrap-up/review-console.md`'s Upstream feedback section. Filing publishes privately-derived content to a public repository; the body shown is already scrubbed.

| U# | Spec | Kind | Component | Summary | Patch |
|---|---|---|---|---|---|
| U1 | 157 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree-always | `spec-157/staged/wrap-up-upstream-1.md` |

Below each row, show the full staged file content for the item so the user can see exactly what would be published. Filing happens after approval by invoking `/claude-tweaks:feedback --pre-confirmed` per checked row. Omit the section entirely when no spec (and no parent-level proposal) staged an upstream proposal.

#### Not run / Failed (if any spec didn't complete cleanly)

| Spec | Status | Reason | Worktree |
|---|---|---|---|
| 159 | failed | test gate (3 type errors) — see `spec-159/decisions.md` | shared `.worktrees/flow/spec-157-159-160` (commits up to 159) |
| 160 | not-run | previous spec failed (159); `keep-going` not set | — |

The run shares **one** worktree (see `multi-spec.md`, "Shared worktree"), so the Worktree column names the single shared path once on the first failed/blocked row — there is no per-spec worktree.

Status values:
- **failed** — spec hit a HARD-GATE but the run continued (only happens under `keep-going`). Worktree is preserved for inspection.
- **not-run** — spec was skipped because an earlier spec failed and `keep-going` was not set. No worktree was created.
- **running** (stuck) — spec started but the run never reached `/wrap-up`'s Phase 4 execution step or a HARD-GATE for it (rare; e.g., subagent crash). `manifest.yml`'s status schema (`multi-spec.md`) has no dedicated `incomplete` value and no procedure ever writes one — a crash simply leaves the entry at whatever status it last had, almost always `running`. Treat any spec whose manifest status is still `running` when the console renders as this case.

Populate this footer from `manifest.yml` — any spec with `status: failed`, `not-run`, or still `running` gets a row.

Below each table, show the full patch / diff for each pending item.
```

Immediately after presenting the console tables above, call `AskUserQuestion` with:

- `question`: `"How do you want to handle the Multi-Spec Review Console items?"`, `header`: `"Review Console"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items {N}-{M}); resolve every Q#/M# to Apply and every U# to declined — their own stated defaults, no further prompts."`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Reply with #s to skip/modify (e.g., \"skip 6, modify 8, revert 2\"); also the only path that drills Q#/M#/U# individually."`
- Option 3 — `label`: `"Stop and re-engage"`, `description`: `"Pause; resume after manual review."`

If "Override specific items" is chosen, the skip/modify list is ordinary free-text chat in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's `Other` field.

Queue writes (Q1, Q2, …), Memory updates (M1, M2, …), and Upstream feedback (U1, U2, …) all resolve as part of the terminal decision now, mirroring `wrap-up/review-console.md`'s single-spec stance exactly: choosing Approve all resolves every `Q#`/`M#` item to `Apply` and every `U#` item to declined — their own stated defaults — with no further prompt. Choosing Override is what still drills them individually, below.

After the user selects Override (option 2):

**Queue writes and Memory updates** — prompt each remaining per-item row individually: one small `AskUserQuestion` call per `Q#`/`M#` item, issued separately (never batched into a single call, and never batched across specs or across sections). For each `Q#` or `M#` item, call `AskUserQuestion` with `question`: the item's own line (e.g. for a queue write, `"Queue write Q1 → new record, parked (trigger: /auth provider docs land), spec 157: \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"` (or `"Memory update {M#}"`), `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""` for a queue write, `"Write the memory file: \"{name}\""` for a memory update
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, mirroring `wrap-up/review-console.md`'s Queue writes / Memory updates sections exactly (see that file for the full worked examples and the `Other`-field override note). Approve all (option 1) never reaches this drill — it already resolved every item to its default above.

**Upstream feedback**, under Override, calls into `_shared/upstream-feedback-batch.md`'s shared batch contract with this run's aggregated `U#` rows (across every spec plus the parent run dir): render each item's full scrubbed draft, then issue the contract's chunked `multiSelect` `AskUserQuestion` call(s) (unchecked by default; checking is the explicit approval, per that file's own rule), never batched across specs beyond the contract's own chunking. Approve all never reaches this drill — every `U#` row resolves to declined by default instead (the Auto-resolution short-circuit below is the one path where `U#` resolves to filed without it).

## Preflight

Before "On approval" or "On override" below runs any `gh` command, run the Detection Ladder
from `_shared/forge-detection.md` (checks 1-3). A ladder failure is a hard gate here, matching
`wrap-up/cleanup-procedures.md` Section E's own posture — this console's entire approval path
writes GitHub state (releases, grant removal), so there is no fail-open degraded mode.

## On approval (option 1)

1. For each `spec-{N}/staged/` patch: apply per `_shared/staged-patch.md` against the cumulative pipeline state — a stale diff (expected once later specs' phases have run) is re-derived from its `Target:`/`Invariant:` preamble
2. For each `Q#` queue write: Approve all resolves it to `Apply` directly, no prompt; Override prompts per item (above). On Apply/Edit: run `wrap-up/refused-proposals.md`'s check first (a refused item is never created), then create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file — same mechanism `wrap-up/review-console.md`'s create step uses. Skip (Override only) drops the proposal — log the decline to the originating spec's `decisions.md` (or the parent's, for a parent-level leftover) with the user's stated reason, or "declined, no reason given."
3. For each `M#` memory update: same Approve all / Override handling as `Q#`. On Apply/Edit: write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s D4 procedure, at batch approval or auto-resolution (the write lands outside the repo, not in this commit). Skip (Override only) drops the proposal — log the decline the same way as `Q#`.
4. For `U#` upstream feedback rows: Approve all resolves every row to declined directly, no prompt, nothing filed (the Auto-resolution short-circuit above is the one exception); Override presents them via `_shared/upstream-feedback-batch.md`'s shared batch contract (above) — the rendered draft **is** the approved snapshot. For each item checked: invoke `/claude-tweaks:feedback --pre-confirmed` with the staged-file path and that snapshot for its drift check (Step 6 scrub always reruns regardless; on drift it falls back to its own confirm). An item left unchecked (Override) or resolved by the Approve all default is declined per the shared contract's rule — log the decline the same way as `Q#`/`M#`.
5. Apply skill updates and create new skills (from each spec's Skills curation row)
6. Apply config updates (docs, CLAUDE.md, rules)
7. Commit with a multi-spec wrap-up message that lists which specs contributed which changes
8. Execute Cleanup actions rows in order — dev-server teardown (no dependency) may run any time; branch-finish (row 16 in this example) must complete before any per-spec claim-release/grant-removal/label-cleanup row runs, since those rows read branch-finish's outcome for the release reason and `$LINK`. This is "Shared teardown" below, gated on the visible rows above rather than running unconditionally.
9. Archive the parent run dir to `.claude-tweaks/pipelines/archive/{run-id}/` (subdirs included)

## On override (option 2)

1. Parse the user's overrides — `#`s map to consolidated table rows; resolve back to the originating spec's subdirectory for each
2. Apply (per step 1), skip, or modify per item
3. **If the branch-finish row (Cleanup actions) is skipped or reverted:** auto-skip every per-spec claim-release/grant-removal/label-cleanup row for this run — render each as "skipped — depends on branch-finish" rather than executing it against a branch-finish outcome that never happened, and rather than leaving it pending or orphaned. Log the auto-skip to the parent run dir's `decisions.md`. Dev-server teardown is unaffected — it has no dependency on branch-finish and executes (or is skipped) per the user's own choice for that row alone.
4. Queue writes (`Q#`) and Memory updates (`M#`) resolve via a per-item prompt under override — the one path where they resolve individually instead of by their Approve-all default; Upstream feedback (`U#`) resolves via the shared batch contract under override, the same way — see "Present the consolidated console" above; the user can Skip or Edit any of them, but none of the three can be bulk-resolved across specs either
5. For items the user wants reverted: `git revert {commit}` (one revert commit per item)
6. Execute the Cleanup actions rows the user did not skip, respecting the dependency order established in step 3 above. "Shared teardown" below documents these steps' mechanics.
7. Archive the parent run dir

### Shared teardown (dev server, branch finish, claim release, grants)

These steps appear as visible, numbered Cleanup actions rows in the console template above — that is what the user sees and approves/overrides, and it decides which rows actually run. This section documents only their mechanics, which apply identically after both "On approval" step 8 and "On override" step 6; only what triggered them differs:

1. **Tear down the shared ephemeral dev server** if one was started (`{parent-run-dir}/ephemeral-server.txt` — see `wrap-up/cleanup-procedures.md` Section D). It was kept up across all specs (per-spec wrap-ups deferred it under `MULTISPEC_REVIEW_DEFER=1`); kill it once here.
2. **Finish the shared branch** per `multi-spec.md` — complete it via `/superpowers:finishing-a-development-branch` (merge / PR / discard). The outcome decides each spec's release reason and `$LINK` (merge commit sha or PR URL) for the next step.
3. Release each issue claim this run holds — enumerate via `manifest.yml`'s `specs[].id` list (every record targeted by this run, regardless of status), not by globbing `spec-*/work/*-spec.md` alone — a record-mode spec whose build never started (e.g. `status: not-run` under default failure handling, per `multi-spec.md`) has no `work/` file to glob and would otherwise be silently left un-enumerated. For each `id` whose `spec-{id}/work/{id}-spec.md` exists (materialized from a record via `materialize.md`), read its header `record:` field to confirm the issue number. The materialized file is never deleted before this point — only archived once the run dir is archived — so it's read directly here; there is no separate pre-deletion capture. For an `id` with `status: not-run` and no `work/` file, the manifest's own `id` IS the record/issue number — release it directly with reason `never-started: spec {spec} not run` (the same `never-started:` reason vocabulary `dispatch/SKILL.md`'s partial-claim abort uses), since it never reached a mergeable/abandonable state. Every other status uses the outcome-mapped reason and procedure from `wrap-up/cleanup-procedures.md` Section E (merged → `merged: spec {spec}`, PR → `pr-opened: spec {spec}`, discarded → `abandoned: spec {spec}`). Log each release to `decisions.md`. Include the work-ready `link` (the branch-finish outcome's merge commit sha or PR URL (from the previous step)) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted. **`$RUN_ID` there is `basename($MULTISPEC_PARENT_DIR)`, never a per-spec `$PIPELINE_RUN_DIR`.**
4. **Remove grants** for each issue released with a `merged:` or `pr-opened:` outcome: remove `auto:build` and `auto:merge`, whichever are present (`gh issue edit "$ISSUE" --remove-label auto:build` / `--remove-label auto:merge`, best-effort per label) — reversible, log each removal to `decisions.md`. Skip issues released as `abandoned:` (the grant is the standing retry request) and issues carrying no `auto:*` label. See "Grant revocation" and the "Release triggers" table in `_shared/issue-claims.md`.
5. **Remove `bot:in-progress`; restore `parked` if applicable** — see "Per-issue label cleanup" below.

### Per-issue label cleanup

Applies identically from "Shared teardown" step 5 above, regardless of whether it ran after "On approval" or "On override" — only what triggered it differs. Per `wrap-up/cleanup-procedures.md` Section E: always remove `bot:in-progress` (`gh issue edit "$ISSUE" --remove-label bot:in-progress`, best-effort). Then, only when the release reason was `abandoned: spec {spec}` (not `merged:`/`pr-opened:`) AND that record's materialized header (`spec-{spec}/work/{issue}-spec.md` — read directly; per the release item above, the file is never deleted before this point) carries `parked-at-shaping: true` (`materialize.md`'s field for exactly this restore-on-abandon case), restore `parked` (bootstrap if missing per _shared/label-bootstrap.md, LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a trigger condition']], then `gh issue edit "$ISSUE" --add-label parked`) — best-effort, log and continue on failure either way. Log each removal/restoration to `decisions.md`.

## On stop (option 3)

Halt before applying. Leave the parent run dir intact. User resumes with `/claude-tweaks:flow {specs} review-console` (a dedicated resume step that re-reads the same parent dir and re-presents the console).

## Empty-console fast path

If every per-spec `decisions.md` has zero entries AND every per-spec `staged/` is empty AND the parent `staged/` is empty AND there are no skill or config updates across the run AND no cleanup actions apply across any spec AND no queue writes are pending across any spec, skip the console entirely. Log "Multi-spec Review Console: nothing to review" and archive silently.

## Sort order

Within each section: reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first. **Tiebreaker: spec ID ascending** — so the user sees consistent spec ordering across sections.

## Hard requirements

- The console MUST present every entry from every per-spec `decisions.md` AND the parent run dir's `decisions.md` (auto-applied + staged + kept-prompt + scanned), every file in every per-spec `staged/` directory and every file in the parent run dir's `staged/`, every Low-confidence and Contested finding surfaced by any spec's `/review`, and every Cleanup actions row that would otherwise run at teardown. Silently dropping any item is forbidden.
- The `Spec` column is mandatory in every table — the user must be able to trace any row to its originating spec for context.
- The `Not run` footer is mandatory when any spec was skipped due to a HARD-GATE earlier in the pipeline — those specs' contexts are explicit, not buried.
- **Queue writes, Memory updates, and Upstream feedback are covered by the terminal Approve all / Override / Stop decision**, mirroring `wrap-up/review-console.md`'s single-spec stance exactly (see that file's Hard requirements for the full rationale). Approve all resolves every `Q#`/`M#` item to `Apply` and every `U#` item to declined with zero additional `AskUserQuestion` calls; Override is what still drills per item — one call each for `Q#`/`M#` (never batched across specs or sections), `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` calls for `U#` (aggregated across specs). This enforces `_shared/auto-mode-contract.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing.

## Anti-Patterns

| Pattern | Why it fails |
|---|---|
| Running per-spec consoles inline AND a consolidated one at the end | Double approval. If `MULTISPEC_REVIEW_DEFER=1` is set, the per-spec console MUST skip — the consolidated one is the single approval point. |
| Aggregating across runs (e.g., yesterday's spec + today's spec in one console) | Each `/flow` invocation has its own parent run dir. The consolidated console is scoped to one `/flow` invocation only. |
| Omitting the `Spec` column to keep the table narrow | Spec attribution is the whole point of the consolidated view. Wide tables wrap; the column stays. |
| Replacing per-spec audit trails with a merged `decisions.md` | The per-spec subdirectories are the audit trail. Merging discards the spec attribution and makes archive review harder. The consolidated console *reads* multiple per-spec files; it does not *replace* them. |
| Treating a different table's "Apply all" as satisfying Q#/M#/U#'s own decision | Work-record creation, memory writes, and upstream filing are never silenced by `auto` (`_shared/auto-mode-contract.md`) — but they ARE covered by the terminal Approve all / Override / Stop decision now, resolving to their own stated default (Apply for Q#/M#, declined for U#) with zero extra prompts; only Override still drills them per item, the same contract `wrap-up/review-console.md`'s three sections enforce for a single-spec run. |
