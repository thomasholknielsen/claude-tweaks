# Step 8.6 — Wrap-Up Review Console

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **`auto` or `hybrid` mode** — run if a pipeline run directory exists for this work AND `MULTISPEC_REVIEW_DEFER` is unset
- **`auto` or `hybrid` mode with `MULTISPEC_REVIEW_DEFER=1`** — **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory.
- **`interactive` mode** — skip; decisions were resolved in-flow

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
2. **Content judgment** — invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode (`Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`), which weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary holistically, replacing the old three independent mechanical checks (scoring eligibility, runtime cleanliness, blast radius) that stood in for one real question — see `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`. The verdict must be `auto-merge` to proceed.

**Both layers pass:** skip the blocking wait and merge directly — bypass the
interactive `/superpowers:finishing-a-development-branch` handoff entirely,
since no human is present to answer its merge/PR/discard prompt during a
headless `dispatch` run. Before merging, clear this run's worktree
assignment the same way `flow/worktree-merge.md`'s reconciliation does
(`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"`) so
the merge itself, landing in the main checkout, isn't denied as a
wrong-checkout commit. Then, from the main checkout:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$DEFAULT_BRANCH" ]; then
  echo "Main checkout is on '$CURRENT', not '$DEFAULT_BRANCH' — a concurrent session switched it. Abort, do not merge." >&2
  exit 1
fi
git merge --no-ff "$BRANCH" -m "[fast-lane] {one-line summary}

Fixes #{issue}"
git push
```

The explicit `--no-ff` guarantees a real merge commit exists even when the
branch would otherwise fast-forward — this is what the `[fast-lane]` tag
lands on, and the same commit message carries the `Fixes #{issue}` closing
keyword per "Close-via-merge" in `_shared/issue-claims.md`. Still generate
this console's full content (Auto-applied / Skill updates / Configuration
updates sections, per "Present the console" below) and attach it to a
`PushNotification` as a non-blocking FYI. Nothing this console would have
shown is discarded — only the wait for a live approval is skipped.

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
   AUTO {time} — Step 8.6: Review Console deferred to multi-spec consolidated console. Per-spec staged items: {count}. Auto-decisions: {count}. Parent run dir: {MULTISPEC_PARENT_DIR}.
   ```
4. Proceed to Step 10 (Consolidated Summary) — the per-spec summary still renders, but its "Review Console" row reads `deferred — see multi-spec consolidated console`
5. Skip the run-directory archival in Step 5 — the parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated console completes

This is the *only* condition under which `/wrap-up` skips Step 8.6 when a run directory exists. Single-spec auto/hybrid always runs the per-spec console.

## Locate the pipeline run directory

See `_shared/pipeline-run-dir.md` for the resolution order and bash snippet. If resolution returns empty (no env var, no matching directory), skip the console entirely (standalone wrap-up, or pre-v4.6 pipeline).

## Read inputs

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)
4. `events.jsonl` — hook-recorded typed events; surface `wd-deny`, `wd-push-mismatch`, and `contract-violation` events

## Numbering rules

- Sections 1–6 (Auto-applied through Cleanup) use a **single global sequence** starting at #1. Each row across all six sections has a unique number.
- Section 7 (Queue writes) uses a **separate `Q`-prefixed sequence** (`Q1`, `Q2`, …) because those items require per-item approval and are NOT part of the global "Approve all" choice.
- This applies to both the example below and any real Console output. Do not restart numbering within a section.

## Present the console

```markdown
### Wrap-Up Review Console

The pipeline auto-resolved {N} decisions and staged {M} items for your review. Sections 1–6 resolve via one batch choice; queue writes (Section 7) require per-item approval because `_shared/auto-mode-contract.md` lists work-record creation as not-silenced by `auto`.

#### Auto-applied (already in commits — override = revert)

| # | Skill | What | Where | Status |
|---|---|---|---|---|
| 1 | /review | Applied 3 severity:low formatting fixes | commit `def5678` | Applied |
| 2 | /test | Auto-fixed 4 lint failures | commit `ghi9012` | Applied |
| 3 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` | Applied |
| 4 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml | Applied |

#### Pending review (staged — apply, skip, or modify per item)

| # | Skill | What | Detail | Patch |
|---|---|---|---|---|
| 5 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `staged/review-2.patch`, `staged/review-3.patch` |
| 6 | /stories | Legacy v1 stories detected (3 files) | stories/checkout.yml, stories/profile.yml, stories/settings.yml | Migration command: `/claude-tweaks:stories migrate` |
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

#### Skill updates (from Step 7)

| # | Skill | Section | Change |
|---|---|---|---|
| 11 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 12 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Configuration updates (from Step 6)

| # | Type | Target | Change |
|---|---|---|---|
| 13 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 14 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

#### Cleanup actions (executed in Step 10 after approval)

Render the cleanup rows from the canonical list in `cleanup-procedures.md`, filtered by Condition (e.g., omit the worktree row when no worktree strategy was used). Each row gets a globally-unique # in the Section 1–6 sequence. Example:

| # | Type | Action | Details |
|---|---|---|---|
| 15 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |

#### Queue writes — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when leftover routing or another step (e.g. `/reflect`'s
tangential-idea routing) has proposed a new work record. Each row gets its own prompt — bulk
approval is forbidden per `_shared/auto-mode-contract.md`'s work-record-creation row. The exact
write mechanism (`gh issue create` / `local-store.js`, or — for a skill not yet migrated onto
the unified record system — its own destination) lives in the producing skill's own staged
file; this table only needs enough to render the prompt.

| Q# | Destination | What | Source |
|---|---|---|---|
| Q1 | record (parked — trigger: /auth provider docs land) | "Add OAuth refresh edge case" — blocked on /auth provider docs | Step 4 leftover routing, `staged/leftover-add-oauth-refresh-edge-case.md` |
| Q2 | record (backlog) | "Investigate token rotation strategy" — surfaced by /reflect Step 3 | reflect insight stage file |

Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

Immediately after presenting the console tables above, call `AskUserQuestion` with:

- `question`: `"How do you want to handle the Review Console items?"`, `header`: `"Review Console"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items 1-{N})"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Reply with #s to skip/modify (e.g., \"skip 5, modify 7, revert 1\")"`
- Option 3 — `label`: `"Stop and re-engage"`, `description`: `"Pause the pipeline; resume after manual review"`

If "Override specific items" is chosen, the skip/modify list is ordinary free-text chat in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's `Other` field.

Queue writes (Q1, Q2) are handled separately below — they are never part of this terminal decision, regardless of which option is chosen.

After the user selects option 1 or 2, prompt the queue writes individually — one small `AskUserQuestion` call per `Q#` item, issued separately (never batched into a single call's multiple questions).

For each `Q#` item, call `AskUserQuestion` with `question`: the queue-write line (e.g. `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"`, `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""`
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

Applied to this example's two queue writes:
- Q1 — `question`: `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`, `header`: `"Queue write Q1"`; Option 1 description: `"Create the record: \"Add OAuth refresh edge case\" — blocked on /auth provider docs, parked with trigger '/auth provider docs land'"`
- Q2 — `question`: `"Queue write Q2 → new record, backlog: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3."`, `header`: `"Queue write Q2"`; Option 1 description: `"Create the record: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3\""`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, and these calls are never combined into a single multi-question `AskUserQuestion` call across multiple `Q#` items (that would functionally reintroduce bulk approval by letting the user answer several at once without individually attending to each).

## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply config updates (items 13–14: docs, CLAUDE.md, rules)
4. Execute cleanup actions (items 15–21) — Step 10 picks these up
5. For each `Q#` queue write, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): create the record — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file (`staged/leftover-{slug}.md` for leftover-routed items; other sources use their own staged-file shape). Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
6. Commit with a wrap-up message
7. Proceed to Step 10 (Consolidated Summary)

## On override (option 2)

1. Parse the user's overrides for items 1–21
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Cleanup items the user skipped: leave the target intact (spec/plan/worktree stays)
5. Queue writes (`Q#`): still prompted per item even under override — the user can Skip or Edit them, but the per-item gate cannot be bulk-resolved
6. Commit, then proceed to Step 10

## On stop (option 3)

Halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes are pending, skip the console entirely. Log "Review Console: nothing to review" and proceed to Step 10.

## Hard requirements

- The console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt), every file in `staged/`, every cleanup action that would otherwise run in Step 10, and every queue-write proposal. Silently dropping any item is forbidden.
- **Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.
- **Queue writes are per-item only.** Never group them under "Approve all" — this enforces the contract's not-silenced rule for work-record creation.
