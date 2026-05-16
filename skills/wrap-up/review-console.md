# Step 9.6 — Wrap-Up Review Console

The Review Console is the **second bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One consolidated batch table surfaces everything that was auto-decided or staged during the pipeline, plus skill update proposals and leftover-work routing — all the friction that used to live mid-flow now lands here.

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
   AUTO {time} — Step 9.6: Review Console deferred to multi-spec consolidated console. Per-spec staged items: {count}. Auto-decisions: {count}. Parent run dir: {MULTISPEC_PARENT_DIR}.
   ```
4. Proceed to Step 10 (Consolidated Summary) — the per-spec summary still renders, but its "Review Console" row reads `deferred — see multi-spec consolidated console`
5. Skip the run-directory archival in Step 5 — the parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated console completes

This is the *only* condition under which `/wrap-up` skips Step 9.6 when a run directory exists. Single-spec auto/hybrid always runs the per-spec console.

## Locate the pipeline run directory

1. Resolve via `PIPELINE_RUN_DIR` env var if set by `/flow`
2. Else find the most recent directory in `.claude-tweaks/pipelines/` whose `spec-slug` matches the current spec
3. Else skip the console (standalone wrap-up, or pre-v4.6 pipeline)

## Read inputs

1. `decisions.md` — auto-decision log
2. `staged/` directory — patches and proposals awaiting decisions
3. `config.yml` — the Manifesto answers (for context)

## Present the console

```markdown
### Wrap-Up Review Console

The pipeline auto-resolved {N} decisions and staged {M} items for your review. One batch decision below resolves everything.

#### Auto-applied (already in commits — override = revert)

| # | Skill | What | Where | Status |
|---|---|---|---|---|
| 1 | /review | Applied 3 severity:low formatting fixes | commit `def5678` | Applied |
| 2 | /test | Auto-fixed 4 lint failures | commit `ghi9012` | Applied |
| 3 | /build | Scope-creep: added src/utils/cache.ts to plan | commit `abc1234` | Applied |
| 4 | /stories | Applied 2 journey link suggestions | stories/login.yml, stories/logout.yml | Applied |
| 5 | /wrap-up | Routed 2 unfinished sections to DEFERRED queue | (pending — Step 4) | Proposed |

#### Pending review (staged — apply, skip, or modify per item)

| # | Skill | What | Detail | Patch |
|---|---|---|---|---|
| 6 | /review | 2 severity:medium findings | Unhandled rejection in src/api.ts:180; missing null check in src/auth/session.ts:42 | `staged/review-2.patch`, `staged/review-3.patch` |
| 7 | /stories | Legacy v1 stories detected (3 files) | stories/checkout.yml, stories/profile.yml, stories/settings.yml | Migration command: `/claude-tweaks:stories migrate` |
| 8 | /wrap-up | Skill restructure proposed | Split `auth/SKILL.md` into `auth/` + `session-management/` | `staged/wrap-up-skill-restructure.md` |

#### Skill updates (from Step 7.5)

| # | Skill | Section | Change |
|---|---|---|---|
| 9 | auth | Anti-Patterns | Add: "Don't share session tokens via querystring" |
| 10 | NEW | session-management | Create new skill for session lifecycle patterns |

#### Configuration updates (from Steps 6 + 8)

| # | Type | Target | Change |
|---|---|---|---|
| 11 | doc | docs/api.md | Document new /auth/refresh endpoint |
| 12 | claude.md | Commands | Add `npm run lint:fix` to test workflow |

---

1. **Approve all** — apply pending items 6-8, accept auto-applied 1-5, apply skill + config updates 9-12 **(Recommended)**
2. **Override specific items** — reply with #s to skip/modify (e.g., "skip 6, modify 8, revert 2")
3. **Stop and re-engage** — pause the pipeline; I'll resume after manual review

Below each table, show the full patch / diff for each pending item so the user can see exactly what will change.
```

## On approval (option 1)

1. Apply all staged patches in `staged/` (run `git apply` or equivalent for each)
2. Apply skill updates and create new skills (from Step 7.5)
3. Apply config updates (docs, CLAUDE.md, rules)
4. Commit with a wrap-up message
5. Proceed to Step 10 (Consolidated Summary)

## On override (option 2)

1. Parse the user's overrides
2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)
3. Auto-applied items the user wants reverted: `git revert {commit}` (one revert commit per item, to keep history clean)
4. Commit, then proceed to Step 10

## On stop (option 3)

Halt before applying. Leave the run directory intact. User resumes with `/claude-tweaks:wrap-up resume` (re-reads the same run directory and re-presents the console).

## Empty-console fast path

If `decisions.md` has zero entries AND `staged/` is empty AND there are no skill or config updates, skip the console entirely. Log "Review Console: nothing to review" and proceed to Step 10.

## Hard requirements

- The console MUST present every entry from `decisions.md` (auto-applied + staged + kept-prompt) and every file in `staged/`. Silently dropping any item is forbidden.
- **Sort order within each section:** reversibility:low first (highest-stakes revert), then reversibility:med, then reversibility:high. Within the same reversibility, severity:high first.
