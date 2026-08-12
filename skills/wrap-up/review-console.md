# Wrap-Up Review Console — Phase 4 (CLOSE)

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **Every mode — `auto`, `hybrid`, interactive, standalone** — run whenever a pipeline run directory exists for this work, which is every run from Phase 1 onward (`SKILL.md`'s "Establish the run directory (unconditional)"). Mode is not a condition on this console; the run directory is.
- **`MULTISPEC_REVIEW_DEFER=1`** — the one exception: **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory, and the Multi-spec defer protocol below.

In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion`, same per-item `Q#`/`M#` drills and the same batched `U#` review (`_shared/upstream-feedback-batch.md`). `summary-template.md` now renders only the record of what was decided here, never a second decision point.

**Hard gate.** Check the response you are about to send: does it already contain the numbered console tables as literal rendered markdown, with a row for every item? If not, render them now, in this response, before the tool call.

## Dry-run mode (`--dry-run`)

When `--dry-run` was passed to this wrap-up invocation (see `SKILL.md`'s Phase 1 Flags subsection), run every analysis step normally — Phases 1-3, and the Auto-merge short-circuit's content-judgment verdict below — but treat everything from this point forward as preview-only:

- Skip the Auto-merge short-circuit's actual `git merge --no-ff` / `git push` even when both layers pass — log the verdict and what would have merged, then fall through to rendering the console below as a normal (non-merging) run.
- Skip that same branch's acceptance labeling — no `demo:pending` label write and no Verification Brief comment. Compose the brief and print it as a preview line instead. It is a network write to a live record, so it is preview-only for the same reason the merge is; the bullet above names only the two git commands because they were the only writes on that path when it was written.
- Skip the pending-review durability push and draft-PR creation (see the section of that name below) — print what would have been pushed and which PR would have been opened as preview lines instead. Both are writes to origin and to a live PR surface, preview-only for the same reason the merge is.
- Present the console tables exactly as usual, but every action under "On approval" and "On override" becomes a printed preview line instead of an executed one — no `git apply`, no `git revert`, no `git commit`, no `gh issue create` / `local-store.js` write, no cleanup deletion, no skill-file write.
- Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`, via `_shared/upstream-feedback-batch.md`'s chunked presentation) all still render for visibility, but their `AskUserQuestion` call(s) are skipped — each item renders as "would create: {content}" instead. Under `--dry-run`, no memory file is ever written and `/claude-tweaks:feedback --pre-confirmed` is never invoked.
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

**`CLAIM_RUN_ID` branch — check this before merging anything.** `CLAIM_RUN_ID` is set only by
`dispatch/task-prompt.md`'s two Task-call templates; an interactive, human-run `/flow` never sets
it. When it **is** set, this call is running inside one of dispatch's own Task() calls — cwd-pinned
to the worktree it inherited at launch, with no path to the main checkout
(`dispatch/SKILL.md` Step 5's sequential-execution note). Do not run the merge procedure below.
Stop here instead: report `OUTCOME: ready-to-merge` exactly as `task-prompt.md`'s second-call
template directs — `dispatch/settle-and-merge.md`'s Dispatching-session merge execution section is
what actually merges, in dispatch's own thread. This is the same split that section documents for
a dispatched bundle; a dispatched singleton takes it too, through this branch. Everything from here
through "Release-reason mapping" below applies only when `CLAIM_RUN_ID` is **unset** — a genuine
top-level, human-run session, with the same ordinary main-checkout access it has for anything else
it does.

Skip the blocking wait and merge directly — bypass the
interactive `/superpowers:finishing-a-development-branch` handoff entirely, since a verdict already
exists and there is no useful human-in-the-loop step to route through. Before merging, clear this run's worktree
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
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-branch
gh api "repos/{owner}/{repo}" -q .default_branch # only when the line above came back empty
```

The third and fourth commands together resolve `{integration-branch}` — the branch
this project integrates work into, which is not always the GitHub default (see
`skills/_shared/integration-branch.md` for the full precedence, including the CLAUDE.md
and explicit-argument ranks this two-command shorthand collapses — and its git-inference
rank, deliberately skipped here, which would consider whatever branch the main checkout
currently has checked out; a concurrent session switching that is precisely what the guard
below catches). Take the resolver's
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
record that ends up inside a human-run multi-spec batch still gets the normal, fully-blocking
consolidated Review Console, same as any other spec in the batch. No `CLAIM_RUN_ID` branch or
equivalent auto-merge gate exists for the multi-spec console today — it is exclusively a
human-run-batch surface, never a dispatch one (`dispatch/SKILL.md` Step 5 dispatches groups one at
a time; there is no dispatch path that produces a multi-spec batch for this console to defer).
`skills/dispatch/SKILL.md`'s own "Auto-merge gate" is the mechanism a dispatched group — singleton
or bundle — actually uses, via the `CLAIM_RUN_ID` branch above; this file's own direct-merge
procedure is reachable only by an interactive, human-run single-record `/flow`.

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
- Three sections use their own prefixed sequence instead of the global one — **Queue writes** (`Q1`, `Q2`, …), **Memory updates** (`M1`, `M2`, …), and **Upstream feedback** (`U1`, `U2`, …) — and are never counted into the batch sections above (Hard requirements below explains why).
- **One row type is per-item without being its own section:** an `[adr-convention]` row (from the Decision records curation row, `adr-curation.md`) renders inside Configuration updates and keeps its global number, but carries a three-way choice rather than approve/reject, so "Approve all" leaves it unanswered. It is the one exception to the otherwise-clean split between batch sections and per-item sections — see the Configuration updates section below for its render shape and for what it blocks while unanswered.
- This applies to both the example below and any real Console output. Do not restart numbering within the global sequence.

## Ledger narrowing auto-file (runs before rendering)

Read `ledger-narrowing-auto-file.md` in this skill's directory and follow it before building any of the tables below — when `_shared/autonomy-ceiling.md`'s `queueWriteAutoFile` capability is unlocked, a staged queue-write proposal is created directly and logged as `AUTO` (listed under **Auto-applied**) instead of waiting for the Queue writes section's per-item approval.

## Pending-review branch durability (dispatch-originated runs)

Run this before rendering the console below, never after — the console ends in a blocking `AskUserQuestion` that a headless firing never returns from, so a step scheduled after it does not run on the very path it exists to protect.

**Gate the read.** Read `_shared/pending-review-durability.md` — the scope guard, the worktree-safe push, the existing-open-PR check, the draft-PR creation, and the push/PR failure fallbacks — only when `CLAIM_RUN_ID` is set and non-empty (dispatch-originated; an interactive human-run `/flow` never sets it), **and** this run used a worktree strategy, **and** this `/flow` invocation's step list contained `review` and that step passed (a `wrap-up`-only invocation is `dispatch/two-call-gate.md` section 5's failure-path teardown call, reaching this console with `CLAIM_RUN_ID` set on a genuinely `failed` run — so the outcome condition is enforced here, not merely asserted inside the file). Otherwise skip this section entirely and do not read the file.

That file owns the whole procedure and the reasons behind it, including why it never calls `close-run` and never clears the run's worktree assignment: this run stays `active`, exactly as an un-pushed `pending-review` outcome does today, and only gains a branch on origin plus one open draft PR.

## Present the console

Read `console-template.md` in this skill's directory and render that exact shape — every section's column layout, the engine-vs-prose-fallback distinction (engine output is plainer: one uniform four-column table per section, not the richer per-section shapes shown there), and the `[adr-convention]` row's three-way prompt. The worked example rows there are fictional; substitute this run's own `decisions.md`/`staged/` content.

**Hard gate (restated):** the tables must be literal rendered markdown in THIS response, above this tool call — see the top-of-file gate.

Immediately after presenting the console tables above, call `AskUserQuestion` with:

- `question`: `"How do you want to handle the Review Console items?"`, `header`: `"Review Console"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items 1-{N})"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Reply with #s to skip/modify (e.g., \"skip 5, modify 7, revert 1\")"`
- Option 3 — `label`: `"Stop and re-engage"`, `description`: `"Pause the pipeline; resume after manual review"`

If "Override specific items" is chosen, the skip/modify list is ordinary free-text chat in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's `Other` field.

Queue writes (Q1, Q2) are handled separately below — they are never part of this terminal decision, regardless of which option is chosen.

After the user selects option 1 or 2, resolve `Q#` and `M#` items via `_shared/batched-item-drill.md`'s multiSelect chunking (genuinely binary: Apply vs. Skip) — one `multiSelect: true` `AskUserQuestion` call per chunk of ≤4 items **within the same section** (a `Q#` and an `M#` never share a call — different destinations, different staged-file shapes — chunking is within a section, never across sections). All items pre-checked to `Apply` (the recommended default — most staged proposals are fine as-drafted); unchecking an item means `Skip`. Editing content is the free-text override path (shared contract), naming the target item by its rendered title (e.g. `"Q1: shorten the trigger condition"`).

- `question` for a `Q#` chunk: `"Queue writes — which should be created? (checked = Apply, uncheck to Skip)"`, `header`: `"Queue writes"`, each checkbox option's label the item's own short title (e.g. `"Q1: Add OAuth refresh edge case"`)
- `question` for an `M#` chunk: `"Memory updates — which should be written? (checked = Apply, uncheck to Skip)"`, `header`: `"Memory updates"`, same per-item checkbox convention

Applied to this example's two queue writes (one chunk, both pre-checked):
- `question`: `"Queue writes — which should be created? (checked = Apply, uncheck to Skip)"`, `header`: `"Queue writes"`
- Checkbox 1 — `"Q1: Add OAuth refresh edge case"` (pre-checked) — blocked on /auth provider docs, parked with trigger '/auth provider docs land'
- Checkbox 2 — `"Q2: Investigate token rotation strategy"` (pre-checked) — surfaced by /reflect Step 3

**Upstream feedback** uses its own multiSelect chunking mechanism — `_shared/upstream-feedback-batch.md`, not `batched-item-drill.md` — since every option renders **unchecked** by default (checking is the explicit per-item approval act, per `[IL-114]`), the inverse of `Q#`/`M#`'s pre-checked convention: filing publishes outward-facing, irreversible content. Call into that contract with this run's `U#` rows: render each item's scrubbed draft (from `staged/wrap-up-upstream-*.md`), then issue the contract's chunked `multiSelect` call(s). Checking and submitting **authorizes filing now**, not shortlisting for later confirmation.

## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from the Skills curation row)
3. Apply documentation updates (item 13, from the Docs curation row) — including any approved missing-doc scaffolding (D2) and restructural docs-health filings (D1)
4. Apply journey updates (item 14, from the Journeys curation row) — including any approved missing-journey scaffolding (J2) and self-review fixes (J1)
5. Apply config updates (item 15: CLAUDE.md, rules, ADRs) — including any CLAUDE.md findings staged by the CLAUDE.md & rules curation row, which are always offered, never auto-applied
6. Execute cleanup actions (items 18 onward — one per row in `cleanup-procedures.md`'s canonical list, which is what sets the last number) — Phase 4's execution step picks these up
7. For each `Q#` queue write, resolve Apply/Skip via the multiSelect chunk above (or the free-text Edit override). On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
8. For each `M#` memory update, resolve Apply/Skip via the multiSelect chunk above (or the free-text Edit override). On Apply (or Edit, after the modification): write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s "Memory write procedure (D4)", reading the proposed file and index line from the item's staged file (`staged/wrap-up-memory-{N}.md`). The memory directory comes from the invoking assistant's own system prompt — never derived or guessed. This write lands outside the repository, so it is not part of the wrap-up commit below. Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
9. For the `U#` upstream feedback rows, present them via `_shared/upstream-feedback-batch.md`'s shared batch contract (chunked `multiSelect` calls, see above) — the body rendered in that table (read from `staged/wrap-up-upstream-{N}.md` when the table was built) **is** the approved snapshot. For each item checked in the resulting chunk(s): invoke `/claude-tweaks:feedback --pre-confirmed`, passing both the staged-file path and that approved snapshot for its drift check; its Step 6 scrub always reruns as a separate safety net regardless of the drift result; on drift it falls back to its own normal `AskUserQuestion` confirm for that one item. An item left unchecked is declined per the shared contract's decline rule — log to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
10. Commit with a wrap-up message
11. Proceed to the phase-trace report

## On override (option 2)

1. Parse the user's overrides across every numbered item in the console
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Cleanup items the user skipped: leave the target intact (spec/plan/worktree stays)
5. Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`) still resolve via their own multiSelect chunking (`_shared/batched-item-drill.md` for `Q#`/`M#`; `_shared/upstream-feedback-batch.md` for `U#`) even under override — no per-item gate can be bulk-resolved by a shared toggle (Hard requirements below)
6. Commit, then proceed to the phase-trace report

## On stop (option 3)

Halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes, memory updates, or upstream feedback proposals are pending, skip the console entirely. Log "Review Console: nothing to review" and proceed to the phase-trace report.

Cleanup rows that are unconditional bookkeeping — run-dir archival, `cleanup-procedures.md` item 8 — do **not** count as cleanup actions for this test; archival executes regardless, undisplayed, as bookkeeping. Without that carve-out the fast path could never fire, since item 8's condition now holds on every run.

## Hard requirements

- The console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt + scanned), every file in `staged/`, every cleanup action that would otherwise run at Phase 4's execution step, and every queue-write, memory-update, and upstream-feedback proposal. Silently dropping any item is forbidden.
- **Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.
- **Queue writes, Memory updates, and Upstream feedback each require an explicit per-item decision.** Never group any of them under "Approve all." `Q#`/`M#` resolve via `_shared/batched-item-drill.md`'s multiSelect chunking (a checkbox per item, pre-checked to `Apply` — the checked/unchecked state *is* that item's individual choice, never a shared bulk toggle answered once for the chunk); `U#` resolves via `_shared/upstream-feedback-batch.md`'s own multiSelect chunking (unchecked by default, per `[IL-114]` — the inverse default, since filing publishes outward-facing, irreversible content). Neither mechanism may fold two items' choices into one shared answer. This enforces `_shared/auto-mode-card.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing. **A different table's approval never satisfies this gate** — not the Reflection Insights batch, not the Skill Updates batch, not any other — even when that answer was "Apply all." A batch table's "Apply all" approves what its own rows list; routing an insight to Memory is one such row, and the write is a separate decision this section's own `M#` prompt makes.
- **An `[adr-convention]` row is also per-item**, despite sitting inside Configuration updates. Never fold it into "Approve all" and never pick one of its three options as a default — an unanswered row blocks the `[adr]` rows from the same run rather than resolving them, because their paths depend on the answer.
