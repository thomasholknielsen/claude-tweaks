# Step 8.6 — Wrap-Up Review Console

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals, leftover-work routing, queue writes, and end-of-pipeline cleanup — all the friction that used to live mid-flow now lands here.

## When to run

- **`auto` or `hybrid` mode** — run if a pipeline run directory exists for this work AND `MULTISPEC_REVIEW_DEFER` is unset
- **`auto` or `hybrid` mode with `MULTISPEC_REVIEW_DEFER=1`** — **skip**. The consolidated multi-spec Review Console at `/flow` end-of-run will read this spec's `decisions.md` + `staged/` and surface everything in one place. See `flow/multispec-review-console.md` in the `/claude-tweaks:flow` skill's directory.
- **`interactive` mode** — skip; decisions were resolved in-flow

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

The pipeline auto-resolved {N} decisions and staged {M} items for your review. Sections 1–6 resolve via one batch choice; queue writes (Section 7) require per-item approval because `_shared/auto-mode-contract.md` lists INBOX/DEFERRED writes as not-silenced by `auto`.

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

Render this section only when leftover routing or other steps have proposed writes to `specs/INBOX.md` or `specs/DEFERRED.md`. Each row gets its own prompt — bulk approval is forbidden per `_shared/auto-mode-contract.md`.

| Q# | Destination | What | Source |
|---|---|---|---|
| Q1 | DEFERRED | "Add OAuth refresh edge case" — blocked on /auth provider docs | Step 4 leftover routing, section "Edge cases" |
| Q2 | INBOX | "Investigate token rotation strategy" — surfaced by /reflect Step 3 | reflect insight stage file |

---

1. **Approve all** — apply pending items, accept auto-applied, apply skill + config updates, execute cleanup (items 1–21 in this example). Queue writes (Q1, Q2) are handled separately below. **(Recommended)**
2. **Override specific items** — reply with #s to skip/modify (e.g., "skip 5, modify 7, revert 1")
3. **Stop and re-engage** — pause the pipeline; I'll resume after manual review

Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

After the user selects option 1 or 2, prompt the queue writes individually:

```
Queue write Q1 → specs/DEFERRED.md: "Add OAuth refresh edge case" — blocked on /auth provider docs.
Apply? (yes / no / edit)

Queue write Q2 → specs/INBOX.md: "Investigate token rotation strategy" — surfaced by /reflect Step 3.
Apply? (yes / no / edit)
```

## On approval (option 1)

1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (items 11–12, from Step 7)
3. Apply config updates (items 13–14: docs, CLAUDE.md, rules)
4. Execute cleanup actions (items 15–21) — Step 10 picks these up
5. For each `Q#` queue write, prompt the user per item. Apply only on explicit `yes` or `edit`. `no` drops the proposal.
6. Commit with a wrap-up message
7. Proceed to Step 10 (Consolidated Summary)

## On override (option 2)

1. Parse the user's overrides for items 1–21
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Cleanup items the user skipped: leave the target intact (spec/plan/worktree stays)
5. Queue writes (`Q#`): still prompted per item even under override — the user can `no` them or `edit` them, but the per-item gate cannot be bulk-resolved
6. Commit, then proceed to Step 10

## On stop (option 3)

Halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill/config updates AND no cleanup actions apply AND no queue writes are pending, skip the console entirely. Log "Review Console: nothing to review" and proceed to Step 10.

## Hard requirements

- The console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt), every file in `staged/`, every cleanup action that would otherwise run in Step 10, and every queue-write proposal. Silently dropping any item is forbidden.
- **Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.
- **Queue writes are per-item only.** Never group them under "Approve all" — this enforces the contract's not-silenced rule for INBOX/DEFERRED writes.
