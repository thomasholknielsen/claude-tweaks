# Init Cloud/Routine Parity Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/claude-tweaks:init` Step 13 — Cloud/Routine Parity Setup — that declares `claude-tweaks` + `superpowers` (and any locally-enabled plugins the user chooses to mirror) in a project's `.claude/settings.json#enabledPlugins`, generates a committed `scripts/claude-cloud-setup.sh` to materialize them in a fresh cloud sandbox, and documents the operational caveats (manual Setup-script paste, branch-checkout mismatch, first-exposure registration lag, MCP report-only note) in a new `## Cloud parity` CLAUDE.md section — closing the gap where cloud sessions/Routines silently lack plugins that work fine locally.

**Architecture:** Pure prose change to markdown skill files — no JS module, no code, matching `/claude-tweaks:routine`'s own precedent (this plugin has no code governing routine creation either). Insert as `Step 13`, renumbering the existing Steps 13/14/15 to 14/15/16 (a one-time, deliberate exception to `bootstrap-steps.md`'s documented append-only policy for this step group, since this new step has a genuine ordering dependency the others don't: a Routine created before cloud parity is set up fails its first cloud firing).

**Tech Stack:** Markdown skill files, `AskUserQuestion` tool, standard Bash/Read/Write/Edit tools. No new dependencies.

## Global Constraints

- **Historical/frozen docs are never touched:** `docs/superpowers/plans/*` (all of them) and `specs/22-init-work-backend.md` (`status: complete`) are permanent historical record per this repo's own convention — do not edit them even though some mention "Step 13/14/15" in a now-stale sense.
- **`/init` never runs `claude plugin install` itself** — matches Step 10's existing, explicit constraint ("claude-tweaks does not programmatically install plugins"). The new step only *writes text* (the generated script's content); the actual install happens later, when the cloud environment runs the pasted script.
- **MCP server configs are never auto-copied** between `~/.claude.json` and the project's `.mcp.json` — they can carry credentials. The MCP-parity check is report-only.
- **`scripts/claude-cloud-setup.sh` is always regenerated in full**, never hand-edited — its entire content is derived from `.claude/settings.json` state.
- Every renumbering edit below was cross-checked with a case-insensitive, word-bounded sweep (`grep -n -i "step 1[3-5]\b"` and `grep -n -i "\b1[3-5][abc]\b"`) across all 5 live files — the case-sensitive `Step 1[3-5]` grep used during design missed the lowercase "Sub-step 15b"/"15c" references; this plan's Task 1 covers the corrected, complete list.

---

### Task 1: Renumber existing Steps 13/14/15 → 14/15/16 (mechanical + one stale-reference fix)

**Files:**
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/init/SKILL.md`
- Modify: `skills/init/update-mode.md`
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Produces: every live cross-reference now pointing at the post-renumbering step numbers, which Tasks 2-4 build on directly (they reference "Step 14 (Routine Installation)", "Step 16 (Work-Record Backend)", etc. as already-current facts, not things they themselves renumber).
- Does NOT touch: `CLAUDE.md`'s line 45 (the `init` row in the Skills-with-sub-files table) — that line's "Step 15" needs renumbering AND a new Step 13 mention in the same edit, so it's handled once, atomically, in Task 4 (touching it here too would create a two-edit race on the same line).

**Renumbering is done in descending order (15→16 first, then 14→15, then 13→14) to avoid a value colliding with an already-renumbered one.**

- [ ] **Step 1: `bootstrap-steps.md` — rewrite the append-only policy paragraph**

  Replace:

  ```
  Order-agnostic and append-only — each step below is an independent "detect condition → offer → write artifact → idempotent" companion integration. New enhancements are added at the end of this group; no renumbering is needed for future additions. One narrow exception: Step 9's native-Type mention reads a config key (`work-types`) that only Step 15 writes — see Step 9's own note for how it handles running before Step 15 on a fresh bootstrap.
  ```

  with:

  ```
  Order-agnostic and append-only by default — most steps in this group are independent "detect condition → offer → write artifact → idempotent" companion integrations with no dependency on each other's order, so a new one is normally added at the end with no renumbering. Step 13 (Cloud/Routine Parity Setup) is the one deliberate exception: it must run before Step 14 (Routine Installation) — a Routine created before cloud/plugin parity is set up would silently fail its first cloud firing — so it was inserted with a full renumbering of Steps 13-15 → 14-16 rather than appended. Future additions default back to append-only unless they have the same kind of genuine ordering dependency on an earlier step. One further narrow exception: Step 9's native-Type mention reads a config key (`work-types`) that only Step 16 writes — see Step 9's own note for how it handles running before Step 16 on a fresh bootstrap.
  ```

- [ ] **Step 2: `bootstrap-steps.md` — Step 9's three forward-references to the work-record step**

  Replace:

  ```
  is only ever written by Step 15's capability probe, so on a fresh bootstrap run (where
  this step executes before Step 15 in the file's presented order) it is still unset when
  Step 9 runs — the template-install offer itself proceeds regardless (it doesn't depend on
  Type), but defer this specific mention: re-check `work-types` once Step 15 completes and
  ```

  with:

  ```
  is only ever written by Step 16's capability probe, so on a fresh bootstrap run (where
  this step executes before Step 16 in the file's presented order) it is still unset when
  Step 9 runs — the template-install offer itself proceeds regardless (it doesn't depend on
  Type), but defer this specific mention: re-check `work-types` once Step 16 completes and
  ```

- [ ] **Step 3: `bootstrap-steps.md` — Routine Installation header (13 → 14)**

  Replace: `### Step 13 — Routine Installation (detailed procedure)`
  With: `### Step 14 — Routine Installation (detailed procedure)`

- [ ] **Step 4: `bootstrap-steps.md` — Non-default-branch issue tracking header (14 → 15)**

  Replace: `### Step 14 — Non-default-branch issue tracking (companion workflow)`
  With: `### Step 15 — Non-default-branch issue tracking (companion workflow)`

- [ ] **Step 5: `bootstrap-steps.md` — Work-Record Backend header (15 → 16)**

  Replace: `### Step 15 — Work-Record Backend (detailed procedure)`
  With: `### Step 16 — Work-Record Backend (detailed procedure)`

- [ ] **Step 6: `bootstrap-steps.md` — Sub-step 15b header + inline reference**

  Replace:

  ```
  **Sub-step 15b — Capability probe.** Runs immediately after Step 15 writes
  ```

  with:

  ```
  **Sub-step 16b — Capability probe.** Runs immediately after Step 16 writes
  ```

- [ ] **Step 7: `bootstrap-steps.md` — Sub-step 15c header**

  Replace: `**Sub-step 15c — Label provisioning offer** (\`work-backend: github-issues\` only).`
  With: `**Sub-step 16c — Label provisioning offer** (\`work-backend: github-issues\` only).`

- [ ] **Step 8: `bootstrap-steps.md` — "per Sub-step 15b's probe" cross-reference**

  Replace: `its canonical \`LABELS_JSON\`. When \`work-types: labels\` (per Sub-step 15b's probe`
  With: `its canonical \`LABELS_JSON\`. When \`work-types: labels\` (per Sub-step 16b's probe`

- [ ] **Step 9: `bootstrap-steps.md` — "sub-steps 15b and 15c" (re-run behavior)**

  Replace:

  ```
  **Re-run behavior (keyed to `work-backend`).** When `/init` is re-run on a project
  where `work-backend: github-issues` is already set, this step — including
  sub-steps 15b and 15c — is a no-op; ongoing capability re-probing on an
  already-provisioned project is Update-Mode's job (see `update-mode.md`'s
  Work-Record Backend Drift), not a repeat of this bootstrap step. When
  `work-backend: local-files` is set, re-run the Gate check — if a GitHub remote has
  since become available (the project was local-only at the last `/init` and has
  since been pushed), offer the upgrade path back to `github-issues`, running 15b/15c
  as part of that upgrade. When `work-backend` is **missing**, check for the legacy
  `backlog-backend` key first: if present, this is not a fresh-init project — leave
  it untouched and defer to Update-Mode's rename offer (see the Legacy alias note
  above), rather than silently provisioning a second, differently-named section
  beside it. Only when neither key is present does this count as a true fresh init:
  apply the same Gate-based handling described above — silently set `github-issues`
  (running 15b/15c) when the gate succeeds, present the gate-fails prompt otherwise.
  ```

  with:

  ```
  **Re-run behavior (keyed to `work-backend`).** When `/init` is re-run on a project
  where `work-backend: github-issues` is already set, this step — including
  sub-steps 16b and 16c — is a no-op; ongoing capability re-probing on an
  already-provisioned project is Update-Mode's job (see `update-mode.md`'s
  Work-Record Backend Drift), not a repeat of this bootstrap step. When
  `work-backend: local-files` is set, re-run the Gate check — if a GitHub remote has
  since become available (the project was local-only at the last `/init` and has
  since been pushed), offer the upgrade path back to `github-issues`, running 16b/16c
  as part of that upgrade. When `work-backend` is **missing**, check for the legacy
  `backlog-backend` key first: if present, this is not a fresh-init project — leave
  it untouched and defer to Update-Mode's rename offer (see the Legacy alias note
  above), rather than silently provisioning a second, differently-named section
  beside it. Only when neither key is present does this count as a true fresh init:
  apply the same Gate-based handling described above — silently set `github-issues`
  (running 16b/16c) when the gate succeeds, present the gate-fails prompt otherwise.
  ```

- [ ] **Step 10: `update-mode.md` — the one "bootstrap Step 15b" cross-reference**

  Replace: `as bootstrap Step 15b.`
  With: `as bootstrap Step 16b.`

- [ ] **Step 11: `SKILL.md` — Step 13/14/15 summary headers + their `bootstrap-steps.md` pointers**

  Replace:

  ```
  ### Step 13: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 13) for the full procedure.

  ### Step 14: Non-Default-Branch Issue Tracking (Optional Companion)

  Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 14) for the full procedure.

  ### Step 15: Work-Record Backend (Optional)

  Decide whether the unified work record — used by `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:triage`, `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills — is backed by GitHub issues or local record files, and write `work-backend` to CLAUDE.md under a `## Work records` section (gated on the same GHE-safe two-tier remote check Step 9 uses). Then probe GitHub-native capabilities once (`work-types`, `work-links`) and offer to provision the full core label set now — see `_shared/work-record.md`'s Label taxonomy table for the current per-family and total counts, rather than a count restated here. See `_shared/work-record.md` for the taxonomy these config keys govern. Read `bootstrap-steps.md` (Step 15) for the full procedure.
  ```

  with:

  ```
  ### Step 14: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 14) for the full procedure.

  ### Step 15: Non-Default-Branch Issue Tracking (Optional Companion)

  Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 15) for the full procedure.

  ### Step 16: Work-Record Backend (Optional)

  Decide whether the unified work record — used by `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:triage`, `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills — is backed by GitHub issues or local record files, and write `work-backend` to CLAUDE.md under a `## Work records` section (gated on the same GHE-safe two-tier remote check Step 9 uses). Then probe GitHub-native capabilities once (`work-types`, `work-links`) and offer to provision the full core label set now — see `_shared/work-record.md`'s Label taxonomy table for the current per-family and total counts, rather than a count restated here. See `_shared/work-record.md` for the taxonomy these config keys govern. Read `bootstrap-steps.md` (Step 16) for the full procedure.
  ```

  (Task 2 inserts the new `### Step 13: Cloud/Routine Parity Setup (Optional)` block immediately above this — do not add it here, this step is renumbering-only.)

- [ ] **Step 12: `SKILL.md` — Actions Performed table rows**

  Replace:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 15 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
  ```

  with:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 16 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 14 |
  ```

  (Task 2 adds the new "Cloud parity" row here too — do not add it in this step.)

- [ ] **Step 13: `SKILL.md` — Worktree Policy Finalization paragraph (renumber + fix a pre-existing stale reference)**

  This paragraph currently says the `bootstrap`-only scope wrote its worktree-policy decision "immediately after Step 14" — but `bootstrap` runs *all* of Phase 0, through the actual last Optional Companion step, which is Work-Record Backend (old Step 15, new Step 16), not Non-Default-Branch Issue Tracking (old Step 14). This looks like a stale reference left over from before Step 15 (Work-Record Backend) was added — this task corrects it to the true last step while renumbering, since the line is being touched regardless.

  Replace:

  ```
  Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-14, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 14 — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)
  ```

  with:

  ```
  Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-16, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 16 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)
  ```

- [ ] **Step 14: `SKILL.md` — Relationship table, `/claude-tweaks:routine` row**

  Replace:

  ```
  | `/claude-tweaks:routine` | Step 13 discovers claude-tweaks skills shipping a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. |
  ```

  with:

  ```
  | `/claude-tweaks:routine` | Step 14 discovers claude-tweaks skills shipping a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. |
  ```

- [ ] **Step 15: `SKILL.md` — Relationship table, `_shared/work-record.md` row**

  Replace:

  ```
  | `_shared/work-record.md` | Step 15 provisions the `work-backend` / `work-types` / `work-links` config keys this file documents as the record taxonomy's driver and capability contract. The label-provisioning offer (Step 15c) runs `_shared/label-bootstrap.md`'s canonical label list, which this file names as the taxonomy home. |
  ```

  with:

  ```
  | `_shared/work-record.md` | Step 16 provisions the `work-backend` / `work-types` / `work-links` config keys this file documents as the record taxonomy's driver and capability contract. The label-provisioning offer (Step 16c) runs `_shared/label-bootstrap.md`'s canonical label list, which this file names as the taxonomy home. |
  ```

- [ ] **Step 16: `routine/SKILL.md` — Component-Skill Contract's `--source init` note**

  Replace:

  ```
  When invoked with `--source init` (used by `/claude-tweaks:init`'s Step 13), `/claude-tweaks:routine` is running as a component of `/init`'s bootstrap flow — omit the `## Next Actions` block, since `/init` owns the overall handoff. `/init` does not set `$PIPELINE_RUN_DIR` (it is not a `/flow`-style pipeline orchestrator), so `--source init` is the sole signal for this caller, not merely a fallback for a rare ambiguity — unlike most component-skill contracts in this plugin, `$PIPELINE_RUN_DIR` is not the primary signal here.
  ```

  with:

  ```
  When invoked with `--source init` (used by `/claude-tweaks:init`'s Step 14), `/claude-tweaks:routine` is running as a component of `/init`'s bootstrap flow — omit the `## Next Actions` block, since `/init` owns the overall handoff. `/init` does not set `$PIPELINE_RUN_DIR` (it is not a `/flow`-style pipeline orchestrator), so `--source init` is the sole signal for this caller, not merely a fallback for a rare ambiguity — unlike most component-skill contracts in this plugin, `$PIPELINE_RUN_DIR` is not the primary signal here.
  ```

- [ ] **Step 17: `routine/SKILL.md` — Relationship table, `/claude-tweaks:init` row (renumber only; Task 4 adds the addendum sentence)**

  Replace:

  ```
  | `/claude-tweaks:init` | Step 13 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

  with:

  ```
  | `/claude-tweaks:init` | Step 14 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

- [ ] **Step 18: Verify**

  ```bash
  grep -n -i "step 1[3-5]\b" skills/init/SKILL.md skills/init/bootstrap-steps.md skills/init/update-mode.md skills/routine/SKILL.md
  ```

  Expected: no output (every old Step 13/14/15 reference in these 4 files is now Step 14/15/16).

  ```bash
  grep -n -i "\b1[3-5][abc]\b" skills/init/bootstrap-steps.md skills/init/update-mode.md
  ```

  Expected: no output (every `15b`/`15c` is now `16b`/`16c`).

  ```bash
  grep -c -i "step 1[4-6]\b" skills/init/SKILL.md skills/init/bootstrap-steps.md
  ```

  Expected: non-zero counts in both files (confirms the renumbered content actually landed, not just that the old pattern is gone).

- [ ] **Step 19: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd && git rev-parse --show-toplevel
  git add skills/init/bootstrap-steps.md skills/init/SKILL.md skills/init/update-mode.md skills/routine/SKILL.md
  git status --short
  git commit -m "init: renumber Steps 13-15 to 14-16, make room for new Step 13"
  ```

  Confirm `pwd` and `git rev-parse --show-toplevel` both resolve to the worktree (not the main checkout) before committing, and that `git status --short` shows only these 4 files staged.

---

### Task 2: SKILL.md — new Step 13 summary, Actions Performed row, Anti-Patterns rows

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: the renumbered Step 14 header from Task 1 Step 11 (this task's new Step 13 block is inserted immediately above it).
- Produces: the `### Step 13: Cloud/Routine Parity Setup (Optional)` summary paragraph that Task 3 refers back to as "read `bootstrap-steps.md` (Step 13) for the full procedure."

- [ ] **Step 1: Insert the new Step 13 summary immediately before the renumbered Step 14 header**

  Replace:

  ```
  ### Step 14: Routine Installation (Optional Companion)
  ```

  with:

  ```
  ### Step 13: Cloud/Routine Parity Setup (Optional)

  Always offered when a GitHub-flavored remote is reachable (same GHE-safe two-tier check as Step 9) — declares `claude-tweaks` + `superpowers` in the project's `.claude/settings.json#enabledPlugins` (so cloud sessions and scheduled Routines get the same skills available locally, not just this machine's user-level config), batch-offers mirroring any other plugin the user has enabled locally, generates a committed `scripts/claude-cloud-setup.sh` that materializes them in a fresh cloud sandbox, and writes a `## Cloud parity` CLAUDE.md section documenting the manual Setup-script paste this doesn't automate plus two operational caveats (branch-checkout mismatch, first-exposure registration lag) and a report-only MCP-parity note. Runs before Step 14 (Routine Installation) deliberately — a Routine created before this step would silently fail its first cloud firing. Idempotent: re-running with nothing new to declare or mirror reports "already configured" instead of re-prompting. Read `bootstrap-steps.md` (Step 13) for the full procedure.

  ### Step 14: Routine Installation (Optional Companion)
  ```

- [ ] **Step 2: Add the Actions Performed table row**

  Replace:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 16 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 14 |
  ```

  with:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 16 |
  | Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 13 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 14 |
  ```

- [ ] **Step 3: Add three new Anti-Patterns rows**

  Find the Anti-Patterns table's last row (`| Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |`) and the `## Relationship to Other Skills` heading that follows it.

  Replace:

  ```
  | Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |

  ## Relationship to Other Skills
  ```

  with:

  ```
  | Writing journey "should feel" without actually using the app | Codebase-only skeletons are a starting point but the "should feel" is weaker — mark them as skeletons |
  | Auto-copying local MCP server configs (`~/.claude.json`) into the project's committed `.mcp.json` | MCP server configs can carry embedded credentials (API keys, tokens) — copying them into a committed file leaks secrets. Step 13's MCP-parity check is report-only by design; the user reviews and adds any that matter, manually. |
  | Hand-editing `scripts/claude-cloud-setup.sh` | Regenerated in full on every `/init` run from `.claude/settings.json` state — manual edits are silently overwritten. Customize by changing `enabledPlugins`/`extraKnownMarketplaces` instead, then re-run `/init`. |
  | Assuming `/init` can set the cloud environment's Setup-script field itself | No API or CLI sets it remotely — confirmed by inspecting `RemoteTrigger`'s own schema (scoped to `/v1/code/triggers` only). It's always a manual, one-time paste per environment, done in the claude.ai/code environment settings UI. |

  ## Relationship to Other Skills
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "### Step 13: Cloud/Routine Parity Setup" skills/init/SKILL.md
  grep -n "Cloud parity | Declared" skills/init/SKILL.md
  grep -c "Auto-copying local MCP server configs\|Hand-editing \`scripts/claude-cloud-setup.sh\`\|Assuming \`/init\` can set the cloud environment" skills/init/SKILL.md
  ```

  Expected: one hit each for the first two, `3` for the third.

- [ ] **Step 5: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/init/SKILL.md
  git commit -m "init: add Step 13 (Cloud/Routine Parity Setup) summary, Actions Performed row, Anti-Patterns"
  ```

---

### Task 3: bootstrap-steps.md — new Step 13 detailed procedure

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Consumes: Step 9's GHE-safe two-tier remote-check procedure (referenced, not restated); Step 8's "merge JSON, never overwrite existing keys" precedent (referenced as the pattern this step follows for the project-level file); the exact `agent-browser` install command (`npm install -g agent-browser`) from `_shared/browser-detection.md`.
- Produces: the full mechanics (gating, detection, batch table, script/CLAUDE.md templates, idempotency, error handling) that `SKILL.md`'s Step 13 summary (Task 2) points to via "Read `bootstrap-steps.md` (Step 13) for the full procedure."

- [ ] **Step 1: Insert the new Step 13 detailed procedure immediately before the renumbered Step 14 header**

  Replace:

  ```
  ### Step 14 — Routine Installation (detailed procedure)
  ```

  with:

  ````
  ### Step 13 — Cloud/Routine Parity Setup (detailed procedure)

  Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config — they only see plugins declared in the **project-level** `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under `extraKnownMarketplaces`). A project that never declares this has full local capability but silently loses claude-tweaks (and everything it depends on) the moment someone opens a cloud session or fires a scheduled Routine against it.

  **Gate:** run the same GHE-safe two-tier check Step 9 uses (`gh repo view --json owner,name` when `gh` is available and authenticated, else `git remote get-url origin` exits 0). No remote → skip this step silently.

  **Detect.** Read the current project's `.claude/settings.json` (treat as `{}` if the file doesn't exist yet) — get `enabledPlugins` and `extraKnownMarketplaces`, each defaulting to `{}` if absent. Read `~/.claude/settings.json` (user-level) the same way. `claude-tweaks@claude-tweaks-marketplace` and `superpowers@claude-plugins-official` are this step's two hard requirements — always candidates for declaration, regardless of whether they appear in the user-level file (this session is running *as* claude-tweaks, so its own identity and its hard dependency are always known). Any other key present in the user-level `enabledPlugins` that is **not** already a key in the project-level `enabledPlugins` is a mirror candidate — read straight from the JSON keys (already fully-qualified `name@marketplace` strings), no CLI-output parsing needed.

  **Present.** Call `AskUserQuestion` with a batch table, per this repo's Multi-item Decisions convention:

  - `question`: `"Declare these plugins for cloud sessions and Routines? Cloud sandboxes only see what's declared in this project's own .claude/settings.json — not your local machine's config."`, `header`: `"Cloud parity"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Declare claude-tweaks + superpowers, plus mirror {N} other locally-enabled plugin(s): {list}."` (omit the "plus mirror..." clause entirely when there are no mirror candidates — just "Declare claude-tweaks + superpowers.")
  - Option 2 — `label`: `"Override specific items"`, `description`: `"Choose which of the {N} candidates above to declare — claude-tweaks and superpowers are always included."`
  - Option 3 — `label`: `"Skip entirely"`, `description`: `"Don't touch .claude/settings.json — I'll configure cloud parity myself later."`

  When there are zero mirror candidates, this still renders (never silently auto-applied — matches Step 8's "always prompt before wiring a settings file" precedent), with Option 1's description reduced to the two hard deps only. On "Override specific items," follow up with the two candidates that are always-included stated plainly, then a `multiSelect: true` `AskUserQuestion` listing only the mirror candidates for the user to pick from.

  **Apply.** On any outcome except "Skip entirely": merge the project's `.claude/settings.json` — preserve every existing key untouched (same non-destructive merge Step 8 uses for `~/.claude/settings.json`'s `statusLine` key), add `claude-tweaks@claude-tweaks-marketplace: true` and `superpowers@claude-plugins-official: true` under `enabledPlugins`, plus one `true` entry per selected mirror candidate. For `extraKnownMarketplaces`: always ensure a `claude-tweaks-marketplace` entry —

  ```json
  "claude-tweaks-marketplace": {
    "source": {
      "source": "github",
      "repo": "thomasholknielsen/claude-tweaks-marketplace"
    }
  }
  ```

  — and for each mirrored plugin whose marketplace isn't `claude-plugins-official` (Anthropic's own official marketplace needs no explicit registration), copy that marketplace's source definition from the user-level `~/.claude/settings.json#extraKnownMarketplaces` into the project-level file, keyed the same way.

  **Generate `scripts/claude-cloud-setup.sh`** — always regenerated in full (never appended to or hand-merged):

  ```bash
  #!/usr/bin/env bash
  # Generated by claude-tweaks /init (Step 13 — Cloud/Routine Parity Setup).
  # Regenerated in full on every /init run from .claude/settings.json — do not hand-edit;
  # customize by changing enabledPlugins/extraKnownMarketplaces instead, then re-run /init.
  #
  # Paste `bash scripts/claude-cloud-setup.sh` into this project's claude.ai/code environment
  # Setup script field (environment settings, web UI only — no API sets this remotely) so
  # cloud sessions and scheduled Routines get the same plugins available locally.
  # See CLAUDE.md's "Cloud parity" section for why this exists and what it doesn't cover.
  set -euo pipefail

  # Marketplaces referenced below that Claude Code doesn't already know by name.
  claude plugin marketplace add thomasholknielsen/claude-tweaks-marketplace 2>/dev/null || true
  # (one additional `claude plugin marketplace add <org>/<repo> 2>/dev/null || true` line
  # per mirrored plugin's marketplace, sourced from that marketplace's `source.repo` field
  # in extraKnownMarketplaces — omit for `claude-plugins-official`, which needs no add call)

  # Plugins declared in .claude/settings.json#enabledPlugins.
  claude plugin install claude-tweaks@claude-tweaks-marketplace --scope project
  claude plugin install superpowers@claude-plugins-official --scope project
  # (one additional `claude plugin install <name>@<marketplace> --scope project` line per
  # mirrored plugin, in the same order enabledPlugins lists them)

  # agent-browser — required in the cloud sandbox for /browse-dependent skills
  # (/stories, /visual-review, /review, qa-agent, /flow) to work in cloud sessions.
  npm install -g agent-browser
  ```

  Write this to `scripts/claude-cloud-setup.sh` in the project root, creating the `scripts/` directory if it doesn't exist. `2>/dev/null || true` on the marketplace-add lines only — a duplicate-add is the expected no-op case on a re-run; the `plugin install`/`npm install` lines are left unguarded so a real failure surfaces loudly within the Setup script's own ~5-minute budget, rather than being silently swallowed.

  **Write/update the `## Cloud parity` CLAUDE.md section** — add near the other project-level config sections (same "add or update a section" idiom Step 10 uses for `## Design integration`):

  ```markdown
  ## Cloud parity

  Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no
  access to this machine's local ~/.claude config — they only see plugins declared in this
  project's own .claude/settings.json#enabledPlugins (paired with any custom marketplace
  under extraKnownMarketplaces).

  - **Setup script:** paste `bash scripts/claude-cloud-setup.sh` into this project's cloud
    environment's Setup script field (claude.ai/code environment settings, web UI only — no
    API/CLI can set this remotely). Installs every declared plugin/marketplace plus
    `agent-browser`. Regenerated by `/claude-tweaks:init`; don't hand-edit it.
  - **Branch:** cloud sessions check out the environment's configured branch (typically this
    repo's actual GitHub default branch) — confirm it's the branch these plugin declarations
    actually landed on, especially if your team develops primarily on a non-default branch.
  - **First exposure:** a plugin newly declared for cloud can show as installed
    (`claude plugin list --json`) while its skills/MCP tools are still uninvocable in that
    very first cloud session — observed to self-heal one session later, no config fix needed.
  - **MCP servers:** this project's committed .mcp.json is what cloud sessions see. Any MCP
    server configured only in your local ~/.claude.json won't reach cloud — review those
    individually if cloud parity matters for them (server configs can carry credentials, so
    this is never auto-copied).
  ```

  **MCP-parity note (report-only, no write).** Read the current project's `.mcp.json` if it exists (top-level `mcpServers` object — the same key Claude Code's own project-MCP convention uses; verify this against the actual file content before relying on it, since it may vary). Read `~/.claude.json`'s own `mcpServers` object the same way, verifying its actual shape directly rather than assuming — this file's structure hasn't been previously confirmed by this plugin. For every server name present in the local file but absent from the project's `.mcp.json`, print one line: `"{N} MCP server(s) configured locally aren't available to cloud sessions: {names}. If any should be, add them to .mcp.json yourself — server configs can contain credentials, so this is never done automatically."` Print nothing when there's no local-only server, or when `~/.claude.json` has no `mcpServers` key at all.

  **Idempotency / re-run behavior.** On a re-run where the project's `.claude/settings.json` already declares both hard deps and there are no new local-only mirror candidates: skip the `AskUserQuestion` prompt, report "Cloud parity: already configured" under Phase 9's Verified & Consistent section, and still regenerate `scripts/claude-cloud-setup.sh` silently (its content is fully derived, so silent regeneration can't lose anything) — but only re-render the CLAUDE.md section if it's missing or doesn't already contain the four bullet labels above (Setup script / Branch / First exposure / MCP servers), to avoid a spurious rewrite on every run.

  **Failure handling.** Malformed `.claude/settings.json` (fails to parse as JSON) → report it and skip this step entirely rather than risk corrupting it with a merge. A write failure on either generated file → surface the failure and continue the rest of `/init` (same "don't abort on this step's failure" precedent as Step 10's plugin-install failure handling).

  ---

  ````

  (Note: the closing `---` above is the section's own trailing divider, matching the convention every other step in this file ends with before the next `### Step N` header — the block wrapping this whole replacement uses a 4-backtick fence specifically because the replacement's own content contains 3-backtick-fenced `json`/`bash`/`markdown` blocks; a 4-backtick outer fence only closes on a matching-or-longer run of backticks alone on a line, so the nested 3-backtick fences don't prematurely close it. After applying this edit, verify the fence still closes exactly where intended — don't trust the diff on sight.)

- [ ] **Step 2: Verify**

  ```bash
  grep -n "^### Step 13 — Cloud/Routine Parity Setup" skills/init/bootstrap-steps.md
  grep -n "^### Step 14 — Routine Installation" skills/init/bootstrap-steps.md
  grep -c "claude plugin install claude-tweaks@claude-tweaks-marketplace --scope project" skills/init/bootstrap-steps.md
  grep -c "## Cloud parity" skills/init/bootstrap-steps.md
  ```

  Expected: one hit for each of the first two, `1` for the third and fourth (the CLAUDE.md template is embedded once, inside this new section).

  ```bash
  node -e "require('fs').readFileSync('skills/init/bootstrap-steps.md','utf8')" && echo "file still parses as text, no encoding corruption"
  ```

- [ ] **Step 3: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/init/bootstrap-steps.md
  git commit -m "init: add Step 13 (Cloud/Routine Parity Setup) detailed procedure"
  ```

---

### Task 4: Cross-file touches — routine/SKILL.md addendum, CLAUDE.md combined edit

**Files:**
- Modify: `skills/routine/SKILL.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1's renumbering (Step 14 = Routine Installation is already-current fact by the time this task runs) and Task 3's new Step 13 content (this task references what it does, doesn't redefine it).

- [ ] **Step 1: `routine/SKILL.md` — add the Step 13 addendum to the `/claude-tweaks:init` relationship row**

  Replace:

  ```
  | `/claude-tweaks:init` | Step 14 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

  with:

  ```
  | `/claude-tweaks:init` | Step 13 (Cloud/Routine Parity Setup) runs immediately before Step 14 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 14 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 14 itself discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

- [ ] **Step 2: `CLAUDE.md` — combined renumber + new-step mention in the `init` row's sub-file description**

  Replace:

  ```
  | init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md, pain-point-routing.md, rules-template.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Step 9 GitHub issue form offer (agent-task.yml); Step 15 work-record backend decision (`work-backend` flag + `work-types`/`work-links` capability probes + initial label bootstrap — see `_shared/work-record.md`); Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected; Phase 2f backlog work-record templates + Pain Points Routed summary; `.claude/rules/` frontmatter template + common rule candidates |
  ```

  with:

  ```
  | init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md, pain-point-routing.md, rules-template.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Step 9 GitHub issue form offer (agent-task.yml); Step 13 cloud/Routine parity setup (`.claude/settings.json#enabledPlugins` declaration + `scripts/claude-cloud-setup.sh` generation + CLAUDE.md `## Cloud parity` section — runs before Step 14 so a newly-created Routine doesn't silently fail its first cloud firing); Step 16 work-record backend decision (`work-backend` flag + `work-types`/`work-links` capability probes + initial label bootstrap — see `_shared/work-record.md`); Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected; Phase 2f backlog work-record templates + Pain Points Routed summary; `.claude/rules/` frontmatter template + common rule candidates |
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "Step 13 (Cloud/Routine Parity Setup) runs immediately before Step 14" skills/routine/SKILL.md
  grep -n "Step 13 cloud/Routine parity setup" CLAUDE.md
  grep -n "Step 15 work-record backend decision" CLAUDE.md
  ```

  Expected: one hit for each of the first two; no output for the third (confirms the stale "Step 15" reference in CLAUDE.md is gone).

- [ ] **Step 4: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/routine/SKILL.md CLAUDE.md
  git commit -m "routine, CLAUDE.md: cross-reference the new Step 13 (Cloud/Routine Parity Setup)"
  ```

---

### Task 5: Whole-repo verification sweep, version bump, test suite

**Files:**
- Modify: `.claude-plugin/plugin.json` (version bump)
- No other files modified — verification only otherwise.

- [ ] **Step 1: Confirm no orphaned old-numbering references remain anywhere live**

  ```bash
  grep -rn -i "step 1[3-5]\b" --include="*.md" skills/ | grep -v "^skills/init/skill-template.md"
  grep -rn -i "\b1[3-5][abc]\b" --include="*.md" skills/
  ```

  Expected: no output from either (the `skill-template.md` exclusion guards against a false-positive match inside that file's own generic "### Step N" placeholder prose, if any — confirm by inspection whether the exclusion was actually needed; drop it from the command if `skill-template.md` has no such match).

- [ ] **Step 2: Confirm historical/frozen docs were NOT touched**

  ```bash
  git diff --stat main -- docs/superpowers/plans/ specs/22-init-work-backend.md
  ```

  Expected: no output (zero changes to any historical plan or the completed spec).

- [ ] **Step 3: Confirm the new Step 13 content is internally consistent end-to-end**

  Read `skills/init/SKILL.md`'s Step 13 summary and `skills/init/bootstrap-steps.md`'s Step 13 detailed procedure side by side. Confirm: the summary's one-line description matches what the detailed procedure actually does (gate, hard deps, mirror offer, script + CLAUDE.md section, MCP report, idempotency) with no drift between the two.

- [ ] **Step 4: Bump the plugin version**

  Read `.claude-plugin/plugin.json`, note the current `version`. Per this repo's own release convention (`CLAUDE.md`'s Versioning section): bump the **minor** version for this feature addition (e.g. `6.15.0` → `6.16.0` — confirm the actual current value first, since a concurrent session may have bumped it since this plan was written; if so, use the next free minor version instead of a hardcoded guess).

  ```bash
  git fetch origin main
  git log --oneline -5 origin/main -- .claude-plugin/plugin.json
  ```

  Confirm no other bump landed on `origin/main` since this worktree branched. Then edit `.claude-plugin/plugin.json`'s `version` field to the next minor version.

- [ ] **Step 5: Run the full test suite**

  ```bash
  npm test 2>&1 | tail -15
  ```

  Expected: same pass count as this worktree's clean baseline (1593 tests, 0 failures) — this plan makes no code changes, only prose plus one version-string edit, so no new failures should appear.

- [ ] **Step 6: Commit the version bump**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add .claude-plugin/plugin.json
  git commit -m "Bump to {new-version} for /init Step 13 (Cloud/Routine Parity Setup)"
  ```

- [ ] **Step 7: Final sweep commit (only if Steps 1-3 found a straggler)**

  If Step 1, 2, or 3 surfaced any remaining gap, fix it now, re-verify, then:

  ```bash
  git add -A
  git commit -m "init-cloud-routine-parity: fix stragglers found by whole-repo sweep"
  ```

  If nothing was found, skip this commit — Task 5 is verification-only beyond the version bump.

## Self-Review Notes

- **Spec coverage:** every section of the design doc maps to a task — Platform facts and Scope inform Task 3's procedure content directly (no separate task needed, they're not independently actionable); Placement/renumbering is Task 1; Generated artifacts (script + CLAUDE.md section) are inside Task 3; Interaction flow is inside Task 3; Integration touches are Tasks 2 and 4; Testing's "no JS coverage, grep-based self-checks" approach is reflected in every task's own Verify step plus Task 5's sweep.
- **The design doc's one open risk** — MCP server config key-path assumptions (`~/.claude.json`'s `mcpServers` shape) not being independently confirmed by this plugin before — is carried into Task 3's own procedure text as an explicit "verify this against the actual file content before relying on it" instruction, rather than silently assumed as fact.
- **The stale "Step 14" reference** found in `SKILL.md`'s Worktree Policy Finalization paragraph during Task 1 drafting (it should have said "Step 15"/new "Step 16" — the true last Optional Companion step — even before this plan's renumbering) is called out explicitly in Task 1 Step 13 with the reasoning for fixing it now rather than leaving it stale, since the exact line already needs touching for renumbering regardless.
- **Type/reference consistency:** `enabledPlugins`, `extraKnownMarketplaces`, `scripts/claude-cloud-setup.sh`, and the four CLAUDE.md bullet labels (Setup script / Branch / First exposure / MCP servers) are named identically everywhere they appear across Tasks 2-4 — no drift between the SKILL.md summary's description and the bootstrap-steps.md procedure's actual field/file names.
- **No placeholders:** every task's before/after text is the literal content to write, copied from either the actual current file content (renumbering) or the design doc's already-drafted templates (new content) — nothing deferred to "similar to Task N" or "add appropriate handling."
