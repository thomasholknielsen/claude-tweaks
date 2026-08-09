# Wrap-Up Review Console — Phase 4 (CLOSE)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **Every mode — `auto`, `hybrid`, interactive, standalone** — run whenever a pipeline run directory exists for this work, which is every run from Phase 1 onward (`SKILL.md`'s "Establish the run directory (unconditional)"). Mode is not a condition on this console; the run directory is.
- **`MULTISPEC_REVIEW_DEFER=1`** — the one exception: **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory, and the Multi-spec defer protocol below.

In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion`, same per-item `Q#`/`M#`/`U#` drills. `summary-template.md` now renders only the record of what was decided here, never a second decision point.

**Hard gate.** Check the response you are about to send: does it already contain the numbered console tables as literal rendered markdown, with a row for every item? If not, render them now, in this response, before the tool call.

## Dry-run mode (`--dry-run`)

When `--dry-run` was passed to this wrap-up invocation (see `SKILL.md`'s Phase 1 Flags subsection), run every analysis step normally — Phases 1-3, and the Auto-merge short-circuit's content-judgment verdict below — but treat everything from this point forward as preview-only:

- Skip the Auto-merge short-circuit's actual `git merge --no-ff` / `git push` even when both layers pass — log the verdict and what would have merged, then fall through to rendering the console below as a normal (non-merging) run.
- Skip that same branch's acceptance labeling — no `demo:pending` label write and no Verification Brief comment. Compose the brief and print it as a preview line instead. It is a network write to a live record, so it is preview-only for the same reason the merge is; the bullet above names only the two git commands because they were the only writes on that path when it was written.
- Present the console tables exactly as usual, but every action under "On approval" and "On override" becomes a printed preview line instead of an executed one — no `git apply`, no `git revert`, no `git commit`, no `gh issue create` / `local-store.js` write, no cleanup deletion, no skill-file write.
- Queue writes (`Q#` items), Memory updates (`M#` items), and Upstream feedback (`U#` items) still render for visibility, but the per-item `AskUserQuestion` drill is skipped — each renders as "would create: {content}" instead; under `--dry-run` no memory file is ever written and `/claude-tweaks:feedback` is never invoked.
- Log to `decisions.md`: `AUTO {time} — Dry-run: {N} items would have been applied; 0 applied (--dry-run).`
- After presenting, stop — do not proceed to the phase-trace report or Phase 4's real execution step; report the preview as the run's final output.

## Auto-merge short-circuit

When this run's spec has a materialized header (`record:` field present in
`${RUN_DIR}/work/*-spec.md` — see `skills/flow/materialize.md`) AND the issue's **live** labels
carry `auto:merge` (re-fetch via `gh issue view --json labels` — the header's `grants:` field is
a snapshot for audit only; `materialize.md`'s reader table requires this check to re-read live
state, never the projection), check the two-layer gate below — the same concept
`skills/dispatch/SKILL.md`'s own group-scoped "Auto-merge gate" applies for a dispatched
bundle; this is the single-record version wrap-up itself runs, whether or not
`/claude-tweaks:dispatch` was involved:

1. **Authorization** — `auto:merge` is present on the live-fetched labels (true by construction once this branch is reached)
2. **Content judgment** — invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`), which weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary holistically, replacing the old three independent mechanical checks (scoring eligibility, runtime cleanliness, blast radius) that stood in for one real question — see `docs/superpowers/specs/2026-08-03-mechanical-vs-substantive-merge-judgment-design.md`. The verdict must be `auto-merge` to proceed.

**Both layers pass — acceptance labeling runs first, before the merge.** This branch bypasses
Phase 4's execution step, which is where acceptance labeling normally happens, so this branch must
perform it itself. Run `verification-brief.md` now, starting from its **Routing** section, exactly as
execution would. This short-circuit closes exactly one record, so pass that record's own number as
`$CLOSING_LEAVES` — the one-element closing-leaf set that file's **Self-inclusion rule** reads
(`/claude-tweaks:dispatch`'s group gate is the one caller whose set holds more than one). That
file owns the routing: a record with a resolvable parent goes to its
Family-Gate Procedure (the family's parent gets the one gate; this leaf gets none), and
everything else goes through its Steps 1-4 — bootstrap, testability, the Step 2.5 safety-net
gate, sourcing, posting, then `demo:pending`. Do not apply `demo:pending` to this record
independently of that routing: an `auto:merge`'d leaf is exactly the population
`_shared/github-pr-scan.md`'s `family-gate` backstop scope exists to catch, so gating it here
would defeat the family gate.

Order is load-bearing: the merge below carries the `Fixes #{issue}` closing keyword, so once it
lands the record is closed and this branch has moved on. Labeling before the merge is what keeps
the record's acceptance state correct on a path where no human ever sees the console.

The record-mode precondition is satisfied by construction — this short-circuit already requires a
materialized header with a `record:` field, which is the same condition the execution step's
acceptance bullet gates on. `auto:merge` governs merge timing only and has no bearing on whether the record
gets `demo:pending`; `_shared/work-record.md` states that an `auto:merge`'d record still gets it
on its now-closed issue, enabling retrospective sign-off, and this branch is the only place that
can honor it.

Then skip the blocking wait and merge directly — bypass the
interactive `/superpowers:finishing-a-development-branch` handoff entirely,
since no human is present to answer its merge/PR/discard prompt during a
headless `dispatch` run. Before merging, clear this run's worktree
assignment the same way `flow/worktree-merge.md`'s reconciliation does
(`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`) so
the merge itself, landing in the main checkout, isn't denied as a
wrong-checkout commit.

`close-run` satisfies E1 only. Under `worktree.always: true` the separate,
run-independent policy gate still applies, and it covers `git push` as well as
`git commit` — so the push below **cannot** run from the main checkout, and
**must not** be chained onto the merge (the gate inspects the whole command
string up front, so one compound call is denied entirely and the merge never
runs either). `git merge` itself is not covered, so it runs in the main
checkout normally. This is the same two-call shape `dispatch/settle-and-merge.md`
already uses; see the `worktree.always` coverage block in
`_shared/policy-schema.md` for what the gate does and does not intercept.

**Shell state does not survive between the two calls** — each Bash invocation
gets a fresh shell, so a variable assigned in the first is empty in the second.
Read the values you need first and substitute them **literally** into the
second call; do not carry them in shell variables.

```bash
git -C "$RUN_DIR" rev-parse --show-toplevel      # -> {worktree-path}
git -C "$RUN_DIR" branch --show-current          # -> {branch}
grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//'
gh api "repos/{owner}/{repo}" -q .default_branch # only when the line above came back empty
```

The third and fourth commands together resolve `{integration-branch}` — the branch
this project integrates work into, which is not always the GitHub default (see
`skills/_shared/integration-branch.md` for the full precedence, including the CLAUDE.md
and explicit-argument ranks this two-command shorthand collapses — and its git-inference
rank, deliberately skipped here, which would consider whatever branch the main checkout
currently has checked out; a concurrent session switching that is precisely what the guard
below catches). Take the `grep`'s
output when it is non-empty; otherwise fall back to `gh api`. Substituting the wrong one
here merges into a branch nobody develops on (#132).

**First call — merge, from the main checkout.** `{integration-branch}` is the value
just resolved:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "{integration-branch}" ]; then
  echo "Main checkout is on '$CURRENT', not '{integration-branch}' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff {branch} -m "[fast-lane] {one-line summary}

Fixes #{issue}"
```

**Second call — push, from inside the worktree.** Both placeholders are the
literal values read above:

```bash
git -C "{worktree-path}" push origin {integration-branch}
```

Naming the branch explicitly is required, not stylistic: a bare `git push` from
the worktree would push the *feature* branch, since that is what is checked out
there. The refs themselves are shared across worktrees, so pushing the integration
branch from inside one publishes the merge the first call just made. It must be the
same branch the first call merged into — pushing a different one publishes nothing
and leaves the merge stranded in the local checkout.

The explicit `--no-ff` guarantees a real merge commit exists even when the
branch would otherwise fast-forward — this is what the `[fast-lane]` tag
lands on, and the same commit message carries the `Fixes #{issue}` closing
keyword per "Close-via-merge" in `_shared/issue-claims.md`. Still generate
this console's full content (Auto-applied / Skill updates / Configuration
updates sections, per "Present the console" below) and attach it to a
`PushNotification` as a non-blocking FYI. Nothing this console would have
shown is discarded — only the wait for a live approval is skipped.

**That sentence is about console content, and console content is not all of Phase 4's execution
step.** It was accurate when written and stayed accurate while going incomplete: acceptance
labeling is neither console content nor one of `cleanup-procedures.md`'s cleanup items, so no
completeness claim on this page covered it, and it was silently dropped on every auto-merge until
the labeling step above was added. When adding anything else that execution step performs, check
it against this branch explicitly — a claim that is true about one category is not evidence about another.

**If the merge conflicts:** conflict resolution requires judgment a headless
run can't supply — abort the merge (`git merge --abort`) and fall back to
rendering the console normally, exactly as an `auto:build`-only record would,
logging why the auto-merge path was abandoned.

Log to `decisions.md`:
`AUTO {time} — Fast-lane auto-merge: issue #{n}, assess-agent-autonomy verdict auto-merge (see RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).`

**Release-reason mapping.** This direct merge counts as the `merged:` outcome for Section E's
release-reason mapping (`skills/wrap-up/cleanup-procedures.md` Section E step 2) — the fast-lane
path never runs `/superpowers:finishing-a-development-branch`, so Section E's usual "map the
outcome from that skill" instruction has nothing to read here; treat a successful fast-lane
merge exactly as if that skill had reported `merged`, with `$LINK` set to this merge's commit
sha. Grant removal (Section E step 6) follows the same `merged:` outcome — `auto:build` and
`auto:merge` both come off once this merge lands.

**Any layer fails:** proceed to render the console normally, exactly as an
`auto:build`-only record would — no different from any other pipeline run.

This check does not apply to `MULTISPEC_REVIEW_DEFER=1` runs — an `auto:merge`-granted
record that ends up inside a human-run multi-spec batch (rather than dispatched
single-record by `/claude-tweaks:dispatch`, which is the only path this
design's auto-merge treatment targets) still gets the normal, fully-blocking
consolidated Review Console, same as any other spec in the batch. No
equivalent auto-merge gate exists for the multi-spec console today
(`skills/dispatch/SKILL.md`'s own "Auto-merge gate" is the group-scoped
analogue for a dispatched bundle, not a multispec-console feature).

## Multi-spec defer protocol

When `MULTISPEC_REVIEW_DEFER=1` is set (by `/flow` multi-spec orchestration):

1. Do NOT present the console
2. Do NOT apply or revert any staged items — leave `staged/` and `decisions.md` untouched in the per-spec subdirectory
3. Append a final entry to this spec's `decisions.md`:
   ```
   AUTO {time} — Review Console deferred to multi-spec consolidated console. Per-spec staged items: {count}. Auto-decisions: {count}. Parent run dir: {MULTISPEC_PARENT_DIR}.
   ```
4. Proceed to the phase-trace report — the per-spec summary still renders, but its "Review Console" row reads `deferred — see multi-spec consolidated console`
5. Skip the run-directory archival in Phase 4's cleanup planning — the parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated console completes

This is the *only* condition under which `/wrap-up` skips the Review Console when a run directory exists. Every single-spec run — in any mode — always runs the per-spec console.

## Locate the pipeline run directory

See `_shared/pipeline-run-dir.md` for the resolution order and bash snippet. Resolution is unchanged; an empty result is **unreachable after Phase 1**, which creates a run directory on every run when none was inherited. If it happens anyway, do not skip the console — treat it as the prose-fallback case: present the same findings inline in this response, gathered from what this run itself produced rather than from `decisions.md` and `staged/`, and take the same terminal decision below.

## Read inputs

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)
4. `events.jsonl` — hook-recorded typed events; surface `wd-deny`, `wd-push-mismatch`, `contract-violation`, and `gate-denial` events

## Numbering rules

- The console's **named batch sections** are the ones headed below — Auto-applied, Pending review, Low-confidence findings, Contested findings, Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs, Cleanup actions (the two coordination-derived sections — Low-confidence findings, Contested findings — render only when non-empty, as does Reference repairs). Together they use a **single global sequence** starting at #1: every row across every present section has a unique number, with no restart between sections.
- Three sections sit outside the global sequence because they require per-item approval and are NOT part of the global "Approve all" choice: **Queue writes** (`Q1`, `Q2`, …), **Memory updates** (`M1`, `M2`, …), and **Upstream feedback** (`U1`, `U2`, …). Each uses its own prefixed sequence, and none is ever counted into the batch sections above.
- **One row type is per-item without being its own section:** an `[adr-convention]` row (from the Decision records curation row, `adr-curation.md`) renders inside Configuration updates and keeps its global number, but carries a three-way choice rather than approve/reject, so "Approve all" leaves it unanswered. It is the one exception to the otherwise-clean split between batch sections and per-item sections — see the Configuration updates section below for its render shape and for what it blocks while unanswered.
- This applies to both the example below and any real Console output. Do not restart numbering within the global sequence.

## Unattended-tier auto-file (runs before rendering)

If `unattended-tier: on` (see `_shared/unattended-tier.md`), before building any of the tables
below: for every queue-write proposal already staged (from ledger Phase 2's narrowing, leftover
routing's staging (Phase 3), or `/reflect`'s tangential-idea routing Step 3 — all three run earlier
in `/wrap-up`'s own phase order, before this console) create the record directly via the same `gh issue
create` / `local-store.js` path "On approval" step 5 below already uses, log it as `AUTO` instead
of `STAGED`, and list it under **Auto-applied** instead of **Queue writes**. On a fully-on run
with no ambiguous residue, the Queue writes section below therefore renders empty.

Do not sweep up reflect's non-queue-write staged findings (convention drift, pattern
observations, skill-update proposals) here — identify a queue write the same way this console
already distinguishes one: a `decisions.md` `STAGED or AUTO` entry phrased as a record proposal
("-- backlog candidate" / a `leftover-` or `ledger-record-` staged file), not a bare stage path.
(Ledger Phase 2's own narrowing step logs its entry as `AUTO`, not `STAGED` — the detection
heuristic must catch both kinds, not just `STAGED`.)

Note: auto-filing a narrowed item here therefore produces two `AUTO` log entries — the
narrowing step's own entry plus this step's own entry for the same item. This is expected,
not a bug; it is just undocumented elsewhere.

If record creation fails for one proposal, leave that one staged and let it render normally in
Queue writes below — do not drop it.

## Present the console

```markdown
### Wrap-Up Review Console

The pipeline auto-resolved {N} decisions and staged {M} items for your review. The named batch sections below resolve via one batch choice. The per-item sections that follow them — Queue writes, Memory updates, Upstream feedback — each require per-item approval, because `_shared/auto-mode-contract.md` lists work-record creation, memory writes, and upstream filing as not silenced by `auto`.

#### Auto-applied (already in commits — override = revert)

| # | Skill | What | Where | Status |
|---|---|---|---|---|
| 1 | /review | Applied 3 severity:low formatting fixes | commit `def5678` | Applied |
| 2 | /test | Auto-fixed 4 lint failures | commit `ghi9012` | Applied |
| 3 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` | Applied |
| 4 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml | Applied |

A `SCANNED` entry (the scan-summary log line the engine writes for any curation row — Skills, Docs, Journeys, CLAUDE.md & rules, and the rest — see `_shared/auto-decision-log.md`) also renders in this section, but with `Status` = `Informational` and `Where` = the registry row it ran for (no commit ref, since nothing was applied) — there is nothing to revert for these rows. The `What` cell paraphrases the `SCANNED` line into reader language (what ran, what it found) rather than quoting it — the raw line, with its internal fragments (`gap detection:`, the routing codes, and the rest of section 5's exempt vocabulary), stays in `decisions.md`, never in this table.

#### Pending review (staged — apply, skip, or modify per item)

| # | Skill | What | Detail | Patch |
|---|---|---|---|---|
| 5 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `staged/review-2.patch`, `staged/review-3.patch` |
| 7 | /wrap-up | Skill restructure proposed | Split `auth/SKILL.md` into `auth/` + `session-management/` | `staged/wrap-up-skill-restructure.md` |

#### Low-confidence findings (not reproduced)

Render this section only when `decisions.md` contains STAGED entries with the unconfirmed-finding rationale (single-source per-lens findings, or findings downgraded by cross-lens debate). Omit the section entirely when empty.

| # | Path:Line | Finding | Severity | Lens |
|---|---|---|---|---|
| 8 | src/auth.ts:42 | Possible null check missing | medium | error-handling |
| 9 | src/api.ts:180 | Race condition on token refresh | high | security |

> These findings were surfaced by exactly one reviewer agent (or downgraded by a debate that converged negative). The signal is real but unreplicated; the user decides whether to apply, ignore, or escalate.

#### Contested findings (debate inconclusive)

Render this section only when `decisions.md` contains STAGED entries from cross-lens debate with mixed/partial verdicts. Omit the section entirely when empty.

| # | Path:Line | Lens A verdict | Lens B verdict |
|---|---|---|---|
| 10 | src/auth.ts:42 | agree (security) | partial (architecture) |

> Two reviewer lenses disagreed on this region and one debate round did not converge. Both verdicts are staged at `staged/review-contested-{N}.md` with reasoning side-by-side. Pick one — or accept both as informational — from the action prompt below.

Generate the next five sections — Skill updates, Documentation updates, Journey updates, Configuration updates, and Reference repairs, in that order, matching `engine-render.js`'s `SECTION_SPECS` emission order — via `render --section console --start-at {n}` when the engine ran (`curation-engine.md` section 2, with `{n}` the next number in this console's global sequence).

The engine's real output shape is plainer than the per-section shapes below: `renderConsoleSections` emits a bare `#### {title}` heading per section plus one uniform `| # | Target | Change | Disposition |` table (integer `#`, `finding.targetPath`, `finding.summary`, and `applied ({commit})` / `staged ({stagePath})`) — the same four columns for all five sections, no six-column Reference repairs shape and no `17a`/`17b` sub-lettering. The richer per-section shapes below (`| # | Skill | Section | Change |`, the six-column Reference repairs table, etc.) are the **prose-fallback template**, used when the engine did not run. On an engine run, insert `render`'s output verbatim into this response — do not hand-expand it into these shapes.

#### Skill updates (from the Skills curation row)

| # | Skill | Section | Change |
|---|---|---|---|
| 11 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 12 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Documentation updates (from the Docs curation row)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |

#### Journey updates (from the Journeys curation row)

| # | Type | Target | Change |
|---|---|---|---|
| 14 | journey | docs/journeys/login-flow.md | Origin-coverage check failed: `src/auth/session.ts` in `files:` but not visited by any step |

#### Configuration updates (from the CLAUDE.md & rules and Decision records curation rows)

| # | Type | Target | Change |
|---|---|---|---|
| 15 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

An `[adr-convention]` row renders inside this section but carries its own three-way prompt, following the same not-covered-by-"Approve all" rule as Queue writes below. Render it as:

```
#16  adr-convention  docs/decisions/  — this repo's decision records disagree with the plugin's convention

     plugin form  : 0017-slack-transport.md
     found (16)   : ADR-016-slack-integration-strategy.md
     project skill: .claude/skills/architecture-decision/SKILL.md

     1  Conform forward   — new files use the plugin's form   -> doc-convention.adr: plugin
     2  Migrate           — rename all 16, fix REGISTRY rows and inbound links
     3  Keep project form — resolve from this repo             -> doc-convention.adr: project
```

Omit the `project skill` line when detection found none. "Approve all" leaves this row unanswered and blocks every `[adr]` row from the same run, since their resolved paths depend on the answer — state that explicitly rather than applying a default.

#### Reference repairs (from the Broken references curation row)

Render this section whenever the broken-reference sweep found a surviving reference, in either of
two states. **Applied** rows are reported, not re-approved — they already happened, in their own
`Initiative-Fix:` commit, under a `trusted`/`unattended` ceiling (`_shared/initiative-budget.md`).
**Staged** rows are ordinary approval rows like any other in this console.

| # | State | Target | Repair | Broken by | Why |
|---|-------|--------|--------|-----------|-----|
| 17a | applied | docs/plugin-structure.md | `build/setup.md` → `build/worktree-setup.md` | skills/build/setup.md | pointer repair 1/3, 2 lines |
| 17b | staged | tests/paths.test.js | `build/setup.md` → `build/worktree-setup.md` | skills/build/setup.md | test file — never auto-repaired |

The `Why` column carries `permittedInitiative`'s own reason string verbatim for both states, so a
run that tripped a cap reads differently from a run that found nothing — under the prose fallback
directly, and on an engine run via the finding's `summary` field (`reference-sweep.md`'s staging
guidance), which is what `engine-render.js`'s uniform Change column renders. **A sweep that found
surviving references but applied none must still render this section** — an empty Auto-applied
list plus a populated staged list is the signal that the ceiling is holding, and collapsing it to
silence hides exactly that.

#### Cleanup actions (executed at Phase 4's execution step after approval)

Render the cleanup rows from the canonical list in `cleanup-procedures.md`, filtered by Condition (e.g., omit the worktree row when no worktree strategy was used). Each row gets a globally-unique # in the shared batch-section sequence (see Numbering rules above). Example:

| # | Type | Action | Details |
|---|---|---|---|
| 18 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |

#### Queue writes — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when leftover routing or another step (e.g. `/reflect`'s
tangential-idea routing) has proposed a new work record **and it wasn't already auto-filed by the
Unattended-tier auto-file step above**. Each remaining row gets its own prompt — bulk
approval is forbidden per `_shared/auto-mode-contract.md`'s work-record-creation row. The exact
write mechanism (`gh issue create` / `local-store.js`, or — for a skill not yet migrated onto
the unified record system — its own destination) lives in the producing skill's own staged
file; this table only needs enough to render the prompt.

**Where the `Q#` rows come from.** Every file in `{run-dir}/staged/` carrying a
`Title:`/`Type:`/`Labels:` header is a queue write — `ledger-record-*.md`
(`ledger/resolve-gate.md` Phase 3's `Defer` / `Keep` / `Acknowledge` dispositions, including the
ones `nothing-left-behind.md`'s Ops acknowledgment stages), `leftover-*.md`, and any other
producer's staged proposal. Identify them by that header, not by filename, so a new producer is
picked up without editing this file.

| Q# | Destination | What | Source |
|---|---|---|---|
| Q1 | record (parked — trigger: /auth provider docs land) | "Add OAuth refresh edge case" — blocked on /auth provider docs | Phase 3 leftover routing, `staged/leftover-add-oauth-refresh-edge-case.md` |
| Q2 | record (backlog) | "Investigate token rotation strategy" — surfaced by /reflect Step 3 | reflect insight stage file |

#### Memory updates — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when the Memory curation row staged a memory-file proposal (`staged/wrap-up-memory-*.md`); omit it entirely otherwise.

| M# | Name | Type | Fact | Index line | Patch |
|---|---|---|---|---|---|
| M1 | dispatch-prompt-conventions | feedback | Restate convention-governed actions in the dispatch prompt | `- [Dispatch prompt conventions](dispatch-prompt-conventions.md) — restate the convention` | `staged/wrap-up-memory-1.md` |

> A memory file is cross-project and always-loaded — a wrong one degrades every future session in every project. `_shared/auto-mode-contract.md` lists it as not silenced by `auto`.

#### Upstream feedback — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when the Upstream feedback curation row staged an upstream defect/gap report (`staged/wrap-up-upstream-*.md`); omit it entirely otherwise.

| U# | Kind | Component | Summary | Patch |
|---|---|---|---|---|
| U1 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `staged/wrap-up-upstream-1.md` |

> Filing publishes privately-derived content to a public repository. The body shown is already scrubbed; approving files it via `/claude-tweaks:feedback`.

Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

**Hard gate (restated):** the tables must be literal rendered markdown in THIS response, above this tool call — see the top-of-file gate.

Immediately after presenting the console tables above, call `AskUserQuestion` with:

- `question`: `"How do you want to handle the Review Console items?"`, `header`: `"Review Console"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items 1-{N})"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Reply with #s to skip/modify (e.g., \"skip 5, modify 7, revert 1\")"`
- Option 3 — `label`: `"Stop and re-engage"`, `description`: `"Pause the pipeline; resume after manual review"`

If "Override specific items" is chosen, the skip/modify list is ordinary free-text chat in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's `Other` field.

Queue writes (Q1, Q2) are handled separately below — they are never part of this terminal decision, regardless of which option is chosen.

After the user selects option 1 or 2, prompt each per-item row individually — one small `AskUserQuestion` call per `Q#`/`M#`/`U#` item, issued separately (never batched into a single call's multiple questions, and never batched across sections).

For each `Q#`, `M#`, or `U#` item, call `AskUserQuestion` with `question`: the item's own line (e.g. for a queue write, `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"` for a queue write, `"Memory update {M#}"` for a memory update, or `"Upstream feedback {U#}"` for upstream feedback, `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""` for a queue write, `"Write the memory file: \"{name}\""` for a memory update, `"File the issue: \"{summary}\""` for upstream feedback
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

Applied to this example's two queue writes:
- Q1 — `question`: `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`, `header`: `"Queue write Q1"`; Option 1 description: `"Create the record: \"Add OAuth refresh edge case\" — blocked on /auth provider docs, parked with trigger '/auth provider docs land'"`
- Q2 — `question`: `"Queue write Q2 → new record, backlog: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3."`, `header`: `"Queue write Q2"`; Option 1 description: `"Create the record: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3\""`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, and these calls are never combined into a single multi-question `AskUserQuestion` call across multiple `Q#`, `M#`, or `U#` items, whether from the same section or different ones (that would functionally reintroduce bulk approval by letting the user answer several at once without individually attending to each).

## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from the Skills curation row)
3. Apply documentation updates (item 13, from the Docs curation row) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply journey updates (item 14, from the Journeys curation row) — including any approved missing-journey scaffolding (J2) and self-review fixes (J1)
5. Apply config updates (item 15: CLAUDE.md, rules, ADRs) — including any CLAUDE.md findings staged by the CLAUDE.md & rules curation row, which are always offered, never auto-applied
6. Execute cleanup actions (items 18 onward — one per row in `cleanup-procedures.md`'s canonical list, which is what sets the last number) — Phase 4's execution step picks these up
7. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
8. For each `M#` memory update, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s "Memory write procedure (D4)", reading the proposed file and index line from the item's staged file (`staged/wrap-up-memory-{N}.md`). The memory directory comes from the invoking assistant's own system prompt — never derived or guessed. This write lands outside the repository, so it is not part of the wrap-up commit below. Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
9. For each `U#` upstream feedback item, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): invoke `/claude-tweaks:feedback` with the staged, already-scrubbed body from the item's staged file (`staged/wrap-up-upstream-{N}.md`) — that skill re-runs its own scrub and confirm gates, since its Component-Skill Contract states a pipeline never relaxes them. Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
10. Commit with a wrap-up message
11. Proceed to the phase-trace report

## On override (option 2)

1. Parse the user's overrides across every numbered item in the console
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Cleanup items the user skipped: leave the target intact (spec/plan/worktree stays)
5. Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`): all still prompted per item even under override — the user can Skip or Edit them, but the per-item gate cannot be bulk-resolved
6. Commit, then proceed to the phase-trace report

## On stop (option 3)

Halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely. Log "Review Console: nothing to review" and proceed to the phase-trace report.

Cleanup rows that are unconditional bookkeeping — run-dir archival, `cleanup-procedures.md` item 8 — do **not** count as cleanup actions for this test; archival executes regardless, undisplayed, as bookkeeping. Without that carve-out the fast path could never fire, since item 8's condition now holds on every run.

## Hard requirements

- The console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt + scanned), every file in `staged/`, every cleanup action that would otherwise run at Phase 4's execution step, and every queue-write, memory-update, and upstream-feedback proposal. Silently dropping any item is forbidden.
- **Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.
- **Queue writes, Memory updates, and Upstream feedback are per-item only.** Never group any of them under "Approve all," and never batch two items into one `AskUserQuestion` call — this enforces `_shared/auto-mode-contract.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing. **A different table's approval never satisfies this gate** — not the Reflection Insights batch, not the Skill Updates batch, not any other — even when that answer was "Apply all." A batch table's "Apply all" approves what its own rows list; routing an insight to Memory is one such row, and the write is a separate decision this section's own `M#` prompt makes.
- **An `[adr-convention]` row is also per-item**, despite sitting inside Configuration updates. Never fold it into "Approve all" and never pick one of its three options as a default — an unanswered row blocks the `[adr]` rows from the same run rather than resolving them, because their paths depend on the answer.
