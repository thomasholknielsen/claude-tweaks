# Init GitHub Remote Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/claude-tweaks:init` Step 9 — Establish GitHub Remote — that, when no git remote exists at all, interactively gets the `gh` CLI installed and authenticated, then offers to create a GitHub repository (personal account or org, confirmed name, private/public) and link it as `origin` — so every downstream GitHub-gated step in the same bootstrap run (issue form template, cloud/Routine parity, non-default-branch issue tracking, work-record backend) gets the enriched path instead of silently falling back to local-only behavior.

**Architecture:** Pure prose change to markdown skill files — no JS module, no code (mirrors `/claude-tweaks:routine`'s own precedent: this plugin has no code governing bootstrap steps either). Insert as `Step 9`, renumbering the existing Steps 9-16 to 10-17 — the same kind of genuine ordering dependency that justified the earlier Step 13 (now 14) renumbering: several later steps gate on remote-reachability within the same bootstrap pass, so appending this new step at the end would run too late to help them.

**Tech Stack:** Markdown skill files, `AskUserQuestion` tool, standard Bash/Read/Write/Edit tools. No new dependencies.

## Global Constraints

- **Interactive-only, never auto mode:** creating a GitHub repository is a consequential, externally-visible, hard-to-reverse action. Step 9 never runs under `auto`/non-interactive mode — it no-ops entirely, and every downstream step falls through to its existing gate-fails behavior unchanged. This mirrors `_shared/browser-detection.md`'s existing bar on auto-installing `agent-browser`.
- **Trigger is "no remote at all," not "no GitHub remote":** any existing remote — GitHub or not — skips Step 9 entirely. The user has already chosen a host.
- **Never runs `sudo` from `/init`:** on Linux, print the install command/instructions (matching Step 8's existing rule) rather than running anything; only macOS (brew) and Windows (winget/scoop) installs run directly on confirmation.
- **`gh auth login` is always the interactive `--web` flow** — never a token-based non-interactive path.
- **Historical/frozen docs are never touched:** `docs/superpowers/plans/*` (all of them) are permanent historical record — do not edit them even though some mention "Step 9/13/16" in a now-stale sense.
- **CLAUDE.md's three Don'ts-section bullets naming "Step 13"** (about the *previous* renumbering project) are past-tense incident narrative, left untouched — same treatment as CHANGELOG.md entries.
- **Renumbering map used throughout this plan:** 9→10, 10→11, 11→12, 12→13, 13→14, 14→15, 15→16, 16→17. Sub-steps 16b/16c→17b/17c.
- Every renumbering edit below was cross-checked against the literal current file content read directly during plan-authoring (not estimated by hand) — see each task's Verify step for the exact greps used.

---

### Task 1: Renumber `skills/init/bootstrap-steps.md`

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Produces: every cross-reference in this file now pointing at post-renumbering step numbers, which Task 5 (new Step 9 detailed procedure) and Task 6 (verification) build on as already-current fact.
- Does NOT touch: the four "same two-tier check Step 9/10 uses" gate sentences' *wording* beyond the mechanical digit shift — Task 5 later simplifies these to point at the new canonical Step 9 note. Doing the digit shift here first (rather than skipping these lines) keeps this task purely mechanical and lets Task 5's own diff show only the semantic consolidation, not a mixed renumber+consolidation change.

- [ ] **Step 1: Rewrite the append-only policy paragraph (mechanical renumber + new second-exception mention)**

  Replace:

  ```
  Order-agnostic and append-only by default — most steps in this group are independent "detect condition → offer → write artifact → idempotent" companion integrations with no dependency on each other's order, so a new one is normally added at the end with no renumbering. Step 13 (Cloud/Routine Parity Setup) is the one deliberate exception: it must run before Step 14 (Routine Installation) — a Routine created before cloud/plugin parity is set up would silently fail its first cloud firing — so it was inserted with a full renumbering of Steps 13-15 → 14-16 rather than appended. Future additions default back to append-only unless they have the same kind of genuine ordering dependency on an earlier step. One further narrow exception: Step 9's native-Type mention reads a config key (`work-types`) that only Step 16 writes — see Step 9's own note for how it handles running before Step 16 on a fresh bootstrap.
  ```

  with:

  ```
  Order-agnostic and append-only by default — most steps in this group are independent "detect condition → offer → write artifact → idempotent" companion integrations with no dependency on each other's order, so a new one is normally added at the end with no renumbering. Two steps are deliberate exceptions to that default, both inserted via a full renumbering rather than appended: Step 9 (Establish GitHub Remote) must run before Steps 10/14/16/17 — it establishes the remote those steps each independently check for, so appending it at the end would run too late to help them within the same bootstrap pass — and was inserted with a full renumbering of the then-Steps 9-16 → 10-17. Step 14 (Cloud/Routine Parity Setup, itself renumbered from 13 by this same pass) must run before Step 15 (Routine Installation) — a Routine created before cloud/plugin parity is set up would silently fail its first cloud firing — originally inserted with a renumbering of Steps 13-15 → 14-16. Future additions default back to append-only unless they have the same kind of genuine ordering dependency on an earlier step. One further narrow exception: Step 10's native-Type mention reads a config key (`work-types`) that only Step 17 writes — see Step 10's own note for how it handles running before Step 17 on a fresh bootstrap.
  ```

- [ ] **Step 2: Step 9 header → Step 10**

  Replace: `### Step 9 — GitHub issue form template (agent-task)`
  With: `### Step 10 — GitHub issue form template (agent-task)`

- [ ] **Step 3: `work-types`/native-Type paragraph — renumber (Step 16→17, self-reference Step 9→10)**

  Replace:

  ```
  is only ever written by Step 16's capability probe, so on a fresh bootstrap run (where
  this step executes before Step 16 in the file's presented order) it is still unset when
  Step 9 runs — the template-install offer itself proceeds regardless (it doesn't depend on
  Type), but defer this specific mention: re-check `work-types` once Step 16 completes and
  ```

  with:

  ```
  is only ever written by Step 17's capability probe, so on a fresh bootstrap run (where
  this step executes before Step 17 in the file's presented order) it is still unset when
  Step 10 runs — the template-install offer itself proceeds regardless (it doesn't depend on
  Type), but defer this specific mention: re-check `work-types` once Step 17 completes and
  ```

- [ ] **Step 4: Impeccable Design Integration header → Step 11**

  Replace: `### Step 10 — Impeccable Design Integration (detailed procedure)`
  With: `### Step 11 — Impeccable Design Integration (detailed procedure)`

- [ ] **Step 5: Diagram Suggestions header → Step 12**

  Replace: `### Step 11 — Diagram Suggestions`
  With: `### Step 12 — Diagram Suggestions`

- [ ] **Step 6: shadcn Bootstrap header → Step 13, plus its two internal "Step 10" cross-references → Step 11**

  Replace:

  ```
  ### Step 12 — shadcn Bootstrap (detailed procedure)

  claude-tweaks integrates [shadcn/ui](https://ui.shadcn.com/) — a CLI-driven component
  system distributed as copy-paste source files rather than an npm package. As of CLI v4
  (~March 2026), shadcn ships three AI-agent-facing layers: the CLI itself (`init`/`add`),
  a first-party MCP server (search/browse/view/install/audit registry items), and an
  installable Skill (`skills add shadcn/ui`) that injects live project context into Claude Code
  so it stops guessing at component APIs. This step wires all three, mirroring Step 10's
  (Impeccable) install-and-flag pattern.

  **Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
  project root if Phase 0 is being run before Phase 2) — the same canonical sniff rules
  Step 10 above uses (`/claude-tweaks:design-wrapper`'s Layer 3 file-extension/path sniff;
  ```

  with:

  ```
  ### Step 13 — shadcn Bootstrap (detailed procedure)

  claude-tweaks integrates [shadcn/ui](https://ui.shadcn.com/) — a CLI-driven component
  system distributed as copy-paste source files rather than an npm package. As of CLI v4
  (~March 2026), shadcn ships three AI-agent-facing layers: the CLI itself (`init`/`add`),
  a first-party MCP server (search/browse/view/install/audit registry items), and an
  installable Skill (`skills add shadcn/ui`) that injects live project context into Claude Code
  so it stops guessing at component APIs. This step wires all three, mirroring Step 11's
  (Impeccable) install-and-flag pattern.

  **Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
  project root if Phase 0 is being run before Phase 2) — the same canonical sniff rules
  Step 11 above uses (`/claude-tweaks:design-wrapper`'s Layer 3 file-extension/path sniff;
  ```

- [ ] **Step 7: shadcn's "Steps 10 and 11" CLAUDE.md-section cross-reference → "Steps 11 and 12"**

  Replace: `same section Steps 10 and 11 write to:`
  With: `same section Steps 11 and 12 write to:`

- [ ] **Step 8: shadcn's "role design-integration plays for Step 10" → Step 11**

  Replace: `the same role \`design-integration\``, next line `plays for Step 10.`

  Full replace:

  ```
  it. The flag is reserved for a future consumer (e.g. `/design-wrapper`
  preferring shadcn components when it reads `enabled`), the same role `design-integration`
  plays for Step 10.
  ```

  with:

  ```
  it. The flag is reserved for a future consumer (e.g. `/design-wrapper`
  preferring shadcn components when it reads `enabled`), the same role `design-integration`
  plays for Step 11.
  ```

- [ ] **Step 9: Cloud/Routine Parity Setup header → Step 14, its Gate line's "Step 9 uses" → "Step 10 uses"**

  Replace:

  ```
  ### Step 13 — Cloud/Routine Parity Setup (detailed procedure)

  Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config — they only see plugins declared in the **project-level** `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under `extraKnownMarketplaces`). A project that never declares this has full local capability but silently loses claude-tweaks (and everything it depends on) the moment someone opens a cloud session or fires a scheduled Routine against it.

  **Gate:** run the same GHE-safe two-tier check Step 9 uses (`gh repo view --json owner,name` when `gh` is available and authenticated, else `git remote get-url origin` exits 0). No remote → skip this step silently.
  ```

  with:

  ```
  ### Step 14 — Cloud/Routine Parity Setup (detailed procedure)

  Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config — they only see plugins declared in the **project-level** `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under `extraKnownMarketplaces`). A project that never declares this has full local capability but silently loses claude-tweaks (and everything it depends on) the moment someone opens a cloud session or fires a scheduled Routine against it.

  **Gate:** run the same GHE-safe two-tier check Step 10 uses (`gh repo view --json owner,name` when `gh` is available and authenticated, else `git remote get-url origin` exits 0). No remote → skip this step silently.
  ```

- [ ] **Step 10: Generated script's literal comment line — "Step 13" → "Step 14"**

  Replace: `# Generated by claude-tweaks /init (Step 13 — Cloud/Routine Parity Setup).`
  With: `# Generated by claude-tweaks /init (Step 14 — Cloud/Routine Parity Setup).`

- [ ] **Step 11: Routine Installation header → Step 15**

  Replace: `### Step 14 — Routine Installation (detailed procedure)`
  With: `### Step 15 — Routine Installation (detailed procedure)`

- [ ] **Step 12: Non-default-branch issue tracking header → Step 16, its gate line's "Step 9 uses" → "Step 10 uses"**

  Replace:

  ```
  ### Step 15 — Non-default-branch issue tracking (companion workflow)

  Offer only when the project has a GitHub-flavored remote — same two-tier, GHE-safe gate
  Step 9 uses (`gh repo view` when available, remote-exists fallback otherwise). Check
  whether
  ```

  with:

  ```
  ### Step 16 — Non-default-branch issue tracking (companion workflow)

  Offer only when the project has a GitHub-flavored remote — same two-tier, GHE-safe gate
  Step 10 uses (`gh repo view` when available, remote-exists fallback otherwise). Check
  whether
  ```

- [ ] **Step 13: Work-Record Backend header → Step 17, its Gate line's "Step 9 uses" → "Step 10 uses"**

  Replace:

  ```
  ### Step 16 — Work-Record Backend (detailed procedure)
  ```

  with:

  ```
  ### Step 17 — Work-Record Backend (detailed procedure)
  ```

  Then, further down in the same section, replace:

  ```
  **Gate:** run the same GHE-safe two-tier check Step 9 uses.
  ```

  with:

  ```
  **Gate:** run the same GHE-safe two-tier check Step 10 uses.
  ```

- [ ] **Step 14: Sub-step 16b header + inline reference → 17b**

  Replace:

  ```
  **Sub-step 16b — Capability probe.** Runs immediately after Step 16 writes
  `work-backend` fresh (either branch above) — not on a re-run where the flag was
  already set; see "Re-run behavior" below.
  ```

  with:

  ```
  **Sub-step 17b — Capability probe.** Runs immediately after Step 17 writes
  `work-backend` fresh (either branch above) — not on a re-run where the flag was
  already set; see "Re-run behavior" below.
  ```

- [ ] **Step 15: Sub-step 16c header → 17c**

  Replace: `**Sub-step 16c — Label provisioning offer** (\`work-backend: github-issues\` only).`
  With: `**Sub-step 17c — Label provisioning offer** (\`work-backend: github-issues\` only).`

- [ ] **Step 16: "per Sub-step 16b's probe result" → 17b**

  Replace: `its canonical \`LABELS_JSON\`. When \`work-types: labels\` (per Sub-step 16b's probe`
  With: `its canonical \`LABELS_JSON\`. When \`work-types: labels\` (per Sub-step 17b's probe`

- [ ] **Step 17: Re-run behavior paragraph — "sub-steps 16b and 16c" / "16b/16c" (×3) → 17b/17c**

  Replace:

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

  with:

  ```
  **Re-run behavior (keyed to `work-backend`).** When `/init` is re-run on a project
  where `work-backend: github-issues` is already set, this step — including
  sub-steps 17b and 17c — is a no-op; ongoing capability re-probing on an
  already-provisioned project is Update-Mode's job (see `update-mode.md`'s
  Work-Record Backend Drift), not a repeat of this bootstrap step. When
  `work-backend: local-files` is set, re-run the Gate check — if a GitHub remote has
  since become available (the project was local-only at the last `/init` and has
  since been pushed), offer the upgrade path back to `github-issues`, running 17b/17c
  as part of that upgrade. When `work-backend` is **missing**, check for the legacy
  `backlog-backend` key first: if present, this is not a fresh-init project — leave
  it untouched and defer to Update-Mode's rename offer (see the Legacy alias note
  above), rather than silently provisioning a second, differently-named section
  beside it. Only when neither key is present does this count as a true fresh init:
  apply the same Gate-based handling described above — silently set `github-issues`
  (running 17b/17c) when the gate succeeds, present the gate-fails prompt otherwise.
  ```

- [ ] **Step 18: Verify**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -n "^### Step " skills/init/bootstrap-steps.md
  ```

  Expected output (headers in this exact order): `Step 10 — GitHub issue form template`, `Step 11 — Impeccable Design Integration`, `Step 12 — Diagram Suggestions`, `Step 13 — shadcn Bootstrap`, `Step 14 — Cloud/Routine Parity Setup`, `Step 15 — Routine Installation`, `Step 16 — Non-default-branch issue tracking`, `Step 17 — Work-Record Backend`.

  ```bash
  grep -n -i "step 9\b" skills/init/bootstrap-steps.md
  ```

  Expected: no output — every literal "Step 9" reference in this file was either a header (renumbered above) or a self-reference now correctly reading "Step 10".

  ```bash
  grep -n -i "\b16[bc]\b" skills/init/bootstrap-steps.md
  grep -c -i "\b17[bc]\b" skills/init/bootstrap-steps.md
  ```

  Expected: no output for the first (every `16b`/`16c` is now `17b`/`17c`); non-zero count for the second.

- [ ] **Step 19: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd && git rev-parse --show-toplevel
  git add skills/init/bootstrap-steps.md
  git status --short
  git commit -m "init: renumber bootstrap-steps.md Steps 9-16 to 10-17, make room for new Step 9"
  ```

  Confirm `pwd` and `git rev-parse --show-toplevel` both resolve to the worktree (not the main checkout) before committing, and that `git status --short` shows only this one file staged.

---

### Task 2: Renumber `skills/init/SKILL.md`

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: nothing from Task 1 (different file).
- Produces: every cross-reference in this file now pointing at post-renumbering step numbers, which Task 4 (new Step 9 content) and Task 6 (verification) build on.

- [ ] **Step 1: `--core-only` range — "(Steps 9-16)" → "(Steps 9-17)"**

  Replace: `` `--core-only` — within Phase 0, skip the Optional Enhancements (Steps 9-16) entirely, ``
  With: `` `--core-only` — within Phase 0, skip the Optional Enhancements (Steps 9-17) entirely, ``

- [ ] **Step 2: Enhancement filter tokens intro range — "(Steps 9-16)" → "(Steps 9-17)"**

  Replace: `narrow which of Phase 0's Optional Enhancements (Steps 9-16) get offered.`
  With: `narrow which of Phase 0's Optional Enhancements (Steps 9-17) get offered.`

- [ ] **Step 3: Enhancement filter token table — mechanical renumber (new `github-remote` row added later, by Task 4)**

  Replace:

  ```
  | Token | Runs |
  |---|---|
  | `issue-form` | Step 9 — GitHub issue form template |
  | `design-integration` | Step 10 — Impeccable design integration |
  | `diagram-suggestions` | Step 11 — Diagram suggestions |
  | `shadcn-integration` | Step 12 — shadcn bootstrap |
  | `cloud-parity` | Step 13 — Cloud/Routine parity setup, alone |
  | `routines` | Step 14 — Routine installation. Hard-depends on Step 13 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 13 first anyway, matching the unfiltered flow's existing 13-before-14 ordering |
  | `branch-tracking` | Step 15 — Non-default-branch issue tracking |
  | `work-backend` | Step 16 — Work-record backend |
  ```

  with:

  ```
  | Token | Runs |
  |---|---|
  | `issue-form` | Step 10 — GitHub issue form template |
  | `design-integration` | Step 11 — Impeccable design integration |
  | `diagram-suggestions` | Step 12 — Diagram suggestions |
  | `shadcn-integration` | Step 13 — shadcn bootstrap |
  | `cloud-parity` | Step 14 — Cloud/Routine parity setup, alone |
  | `routines` | Step 15 — Routine installation. Hard-depends on Step 14 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 14 first anyway, matching the unfiltered flow's existing 14-before-15 ordering |
  | `branch-tracking` | Step 16 — Non-default-branch issue tracking |
  | `work-backend` | Step 17 — Work-record backend |
  ```

- [ ] **Step 4: Examples paragraph — "Steps 13+14" (×2) → "Steps 14+15"; "Steps 12 and 15" → "Steps 13 and 16"**

  Replace:

  ```
  Examples (assuming Steps 1-8 actually run this time — see "Core Bootstrap Version Check" below for when they're skipped instead): `routines` alone runs Steps 1-8, then only Steps 13+14, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8, then only Steps 13+14, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8, then only Steps 12 and 15, then stops.
  ```

  with:

  ```
  Examples (assuming Steps 1-8 actually run this time — see "Core Bootstrap Version Check" below for when they're skipped instead): `routines` alone runs Steps 1-8, then only Steps 14+15, then stops (same "stop after Phase 0" behavior as `bootstrap`). `config routines` runs Steps 1-8, then only Steps 14+15, then Phases 2, 3, 5. `shadcn-integration branch-tracking` runs Steps 1-8, then only Steps 13 and 16, then stops.
  ```

- [ ] **Step 5: Optional Enhancements range (en-dash) — "(Steps 9–16)" → "(Steps 9–17)"**

  Replace: `**Optional Enhancements (Steps 9–16):** Skipped entirely when \`$ARGUMENTS\` contains \`--core-only\``
  With: `**Optional Enhancements (Steps 9–17):** Skipped entirely when \`$ARGUMENTS\` contains \`--core-only\``

- [ ] **Step 6: The 8 step-summary blocks (Steps 9-16 → 10-17), mechanical renumber of headers, internal `bootstrap-steps.md` pointers, and internal cross-references**

  Replace:

  ```
  ### Step 9: GitHub Issue Form Template (Optional)

  GitHub issue form template offer (agent-task.yml). Read `bootstrap-steps.md` (Step 9) for the full procedure.

  ### Step 10: Impeccable Design Integration (Optional)

  When Phase 2 detects frontend signals, present the three-option Impeccable setup prompt (Full / Plugin-only / Skip) and write the `design-integration` flag to CLAUDE.md — the `/claude-tweaks:design-wrapper` wrapper reads this as Layer 1 of its detection logic. Read `bootstrap-steps.md` (Step 10) for the full procedure (frontend-detection list, install sequence, flag-value table, re-run behavior, failure handling).

  ### Step 11: Diagram Suggestions

  Always offered (not frontend-gated). Present the two-option diagram-suggestions prompt (Enable / Skip) and write the `diagram-suggestions` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag to decide whether to suggest invoking `/claude-tweaks:visualize`. No install step — `/claude-tweaks:visualize` is a native skill. Read `bootstrap-steps.md` (Step 11) for the full procedure.

  ### Step 12: shadcn Bootstrap (Optional)

  When frontend signals are detected and `components.json` doesn't exist (or exists without full AI-agent wiring), present the shadcn/ui setup prompt (Full / CLI-only / Skip, or the narrower "wire remaining layers" offer when the CLI is already initialized) and write the `shadcn-integration` flag to CLAUDE.md. Currently write-only — no other skill reads the flag yet. Read `bootstrap-steps.md` (Step 12) for the full procedure (framework/package-manager detection, install sequence, MCP/skills wiring, flag-value table, re-run behavior, failure handling).

  ### Step 13: Cloud/Routine Parity Setup (Optional)

  Always offered when a GitHub-flavored remote is reachable (same GHE-safe two-tier check as Step 9) — warns live if the current branch differs from the repo's actual GitHub default branch (cloud sessions/Routines check out the default branch, so declarations made elsewhere don't take effect until merged there), declares `claude-tweaks` + `superpowers` in the project's `.claude/settings.json#enabledPlugins` (so cloud sessions and scheduled Routines get the same skills available locally, not just this machine's user-level config), batch-offers mirroring any other plugin the user has enabled locally, generates a committed `scripts/claude-cloud-setup.sh` that materializes them in a fresh cloud sandbox, and writes a `## Cloud parity` CLAUDE.md section documenting the manual Setup-script paste this doesn't automate plus two operational caveats (branch-checkout mismatch, first-exposure registration lag) and a report-only MCP-parity note. Runs before Step 14 (Routine Installation) deliberately — a Routine created before this step would silently fail its first cloud firing. Idempotent: re-running with nothing new to declare or mirror reports "already configured" instead of re-prompting — the branch check itself still runs every time. Read `bootstrap-steps.md` (Step 13) for the full procedure.

  ### Step 14: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 14) for the full procedure.

  ### Step 15: Non-Default-Branch Issue Tracking (Optional Companion)

  Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 15) for the full procedure.

  ### Step 16: Work-Record Backend (Optional)

  Decide whether the unified work record — used by `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:backlog`, `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills — is backed by GitHub issues or local record files, and write `work-backend` to CLAUDE.md under a `## Work records` section (gated on the same GHE-safe two-tier remote check Step 9 uses). Then probe GitHub-native capabilities once (`work-types`, `work-links`) and offer to provision the full core label set now — see `_shared/work-record.md`'s Label taxonomy table for the current per-family and total counts, rather than a count restated here. See `_shared/work-record.md` for the taxonomy these config keys govern. Read `bootstrap-steps.md` (Step 16) for the full procedure.
  ```

  with:

  ```
  ### Step 10: GitHub Issue Form Template (Optional)

  GitHub issue form template offer (agent-task.yml). Read `bootstrap-steps.md` (Step 10) for the full procedure.

  ### Step 11: Impeccable Design Integration (Optional)

  When Phase 2 detects frontend signals, present the three-option Impeccable setup prompt (Full / Plugin-only / Skip) and write the `design-integration` flag to CLAUDE.md — the `/claude-tweaks:design-wrapper` wrapper reads this as Layer 1 of its detection logic. Read `bootstrap-steps.md` (Step 11) for the full procedure (frontend-detection list, install sequence, flag-value table, re-run behavior, failure handling).

  ### Step 12: Diagram Suggestions

  Always offered (not frontend-gated). Present the two-option diagram-suggestions prompt (Enable / Skip) and write the `diagram-suggestions` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag to decide whether to suggest invoking `/claude-tweaks:visualize`. No install step — `/claude-tweaks:visualize` is a native skill. Read `bootstrap-steps.md` (Step 12) for the full procedure.

  ### Step 13: shadcn Bootstrap (Optional)

  When frontend signals are detected and `components.json` doesn't exist (or exists without full AI-agent wiring), present the shadcn/ui setup prompt (Full / CLI-only / Skip, or the narrower "wire remaining layers" offer when the CLI is already initialized) and write the `shadcn-integration` flag to CLAUDE.md. Currently write-only — no other skill reads the flag yet. Read `bootstrap-steps.md` (Step 13) for the full procedure (framework/package-manager detection, install sequence, MCP/skills wiring, flag-value table, re-run behavior, failure handling).

  ### Step 14: Cloud/Routine Parity Setup (Optional)

  Always offered when a GitHub-flavored remote is reachable (same GHE-safe two-tier check as Step 10) — warns live if the current branch differs from the repo's actual GitHub default branch (cloud sessions/Routines check out the default branch, so declarations made elsewhere don't take effect until merged there), declares `claude-tweaks` + `superpowers` in the project's `.claude/settings.json#enabledPlugins` (so cloud sessions and scheduled Routines get the same skills available locally, not just this machine's user-level config), batch-offers mirroring any other plugin the user has enabled locally, generates a committed `scripts/claude-cloud-setup.sh` that materializes them in a fresh cloud sandbox, and writes a `## Cloud parity` CLAUDE.md section documenting the manual Setup-script paste this doesn't automate plus two operational caveats (branch-checkout mismatch, first-exposure registration lag) and a report-only MCP-parity note. Runs before Step 15 (Routine Installation) deliberately — a Routine created before this step would silently fail its first cloud firing. Idempotent: re-running with nothing new to declare or mirror reports "already configured" instead of re-prompting — the branch check itself still runs every time. Read `bootstrap-steps.md` (Step 14) for the full procedure.

  ### Step 15: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 15) for the full procedure.

  ### Step 16: Non-Default-Branch Issue Tracking (Optional Companion)

  Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 16) for the full procedure.

  ### Step 17: Work-Record Backend (Optional)

  Decide whether the unified work record — used by `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:backlog`, `/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills — is backed by GitHub issues or local record files, and write `work-backend` to CLAUDE.md under a `## Work records` section (gated on the same GHE-safe two-tier remote check Step 10 uses). Then probe GitHub-native capabilities once (`work-types`, `work-links`) and offer to provision the full core label set now — see `_shared/work-record.md`'s Label taxonomy table for the current per-family and total counts, rather than a count restated here. See `_shared/work-record.md` for the taxonomy these config keys govern. Read `bootstrap-steps.md` (Step 17) for the full procedure.
  ```

  (Task 4 inserts the new `### Step 9: Establish GitHub Remote (Optional)` block immediately above this — do not add it here, this step is renumbering-only.)

- [ ] **Step 7: Worktree Policy Finalization paragraph — "Steps 7-16" → "Steps 7-17", "immediately after Step 16" → "immediately after Step 17"**

  Replace:

  ```
  Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-16, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 16 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)
  ```

  with:

  ```
  Write this AFTER every write in the Actions Performed table above has completed — it must be the very last filesystem action of the entire `/init` invocation. If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now: this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-17, Phases 1-8.5, and this same Phase 9's own confirmed generated-file writes (the Actions Performed table above) were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 17 — the last Optional Companion step Phase 0 runs through — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)
  ```

- [ ] **Step 8: Actions Performed table rows — renumber**

  Replace:

  ```
  | Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 10 |
  | shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 12 |
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 16 |
  | Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 13 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 14 |
  ```

  with:

  ```
  | Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 11 |
  | shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 13 |
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 17 |
  | Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 14 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 15 |
  ```

  (Task 4 adds the new "GitHub remote created" row here too — do not add it in this step.)

- [ ] **Step 9: Anti-Patterns table — "Step 13's MCP-parity check" → "Step 14's MCP-parity check"**

  Replace: `Step 13's MCP-parity check is report-only by design;`
  With: `Step 14's MCP-parity check is report-only by design;`

- [ ] **Step 10: Relationship table — renumber the design-wrapper, visualize, shadcn/ui, routine, and work-record rows**

  Replace:

  ```
  | `/claude-tweaks:design-wrapper` | Step 10 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
  | `/claude-tweaks:visualize` | Step 11 offers to enable diagram suggestions and writes the `diagram-suggestions` flag to CLAUDE.md — no install step, this skill is native. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read the flag to decide whether to suggest invoking it. |
  | `shadcn/ui` (companion) | Step 12 offers to bootstrap the shadcn CLI, wire its official MCP server into `.mcp.json`, and install shadcn's official Skill (`skills add shadcn/ui`) for live Claude Code project context. Writes the `shadcn-integration` flag to CLAUDE.md — currently write-only, no other skill reads it yet. |
  ```

  with:

  ```
  | `/claude-tweaks:design-wrapper` | Step 11 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
  | `/claude-tweaks:visualize` | Step 12 offers to enable diagram suggestions and writes the `diagram-suggestions` flag to CLAUDE.md — no install step, this skill is native. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read the flag to decide whether to suggest invoking it. |
  | `shadcn/ui` (companion) | Step 13 offers to bootstrap the shadcn CLI, wire its official MCP server into `.mcp.json`, and install shadcn's official Skill (`skills add shadcn/ui`) for live Claude Code project context. Writes the `shadcn-integration` flag to CLAUDE.md — currently write-only, no other skill reads it yet. |
  ```

  Then, further down, replace:

  ```
  | `/claude-tweaks:routine` | Step 14 discovers claude-tweaks skills shipping a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. |
  ```

  with:

  ```
  | `/claude-tweaks:routine` | Step 15 discovers claude-tweaks skills shipping a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) with no existing instantiated record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated. |
  ```

  Then, further down, replace:

  ```
  | `_shared/work-record.md` | Step 16 provisions the `work-backend` / `work-types` / `work-links` config keys this file documents as the record taxonomy's driver and capability contract. The label-provisioning offer (Step 16c) runs `_shared/label-bootstrap.md`'s canonical label list, which this file names as the taxonomy home. |
  ```

  with:

  ```
  | `_shared/work-record.md` | Step 17 provisions the `work-backend` / `work-types` / `work-links` config keys this file documents as the record taxonomy's driver and capability contract. The label-provisioning offer (Step 17c) runs `_shared/label-bootstrap.md`'s canonical label list, which this file names as the taxonomy home. |
  ```

- [ ] **Step 11: Verify**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -n "^### Step " skills/init/SKILL.md
  ```

  Expected: headers in order `Step 10: GitHub Issue Form Template`, `Step 11: Impeccable Design Integration`, `Step 12: Diagram Suggestions`, `Step 13: shadcn Bootstrap`, `Step 14: Cloud/Routine Parity Setup`, `Step 15: Routine Installation`, `Step 16: Non-Default-Branch Issue Tracking`, `Step 17: Work-Record Backend`.

  ```bash
  grep -n -i "step 9\b" skills/init/SKILL.md
  ```

  Expected: no output.

  ```bash
  grep -c "Steps 9-17\|Steps 9–17\|Steps 7-17" skills/init/SKILL.md
  ```

  Expected: `4` (the two hyphen ranges at Steps 1/2, the en-dash range at Step 5, and the Worktree Policy Finalization "Steps 7-17" from Step 7 — confirms the renumbered range text actually landed, not just that the old pattern is gone).

- [ ] **Step 12: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/init/SKILL.md
  git status --short
  git commit -m "init: renumber SKILL.md Steps 9-16 to 10-17"
  ```

---

### Task 3: Renumber the 9 peripheral cross-referencing files

**Files:**
- Modify: `skills/routine/SKILL.md`
- Modify: `skills/design-wrapper/SKILL.md`
- Modify: `skills/visualize/SKILL.md`
- Modify: `skills/review/SKILL.md`
- Modify: `skills/journeys/SKILL.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/build/worktree-setup.md`
- Modify: `skills/help/reference-card.md`
- Modify: `docs/getting-started.md`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (disjoint files).
- Produces: every remaining live cross-reference to `/init`'s bootstrap steps now current, closing out the renumbering before Tasks 4-6 add new content or verify.

- [ ] **Step 1: `routine/SKILL.md` — Component-Skill Contract's `--source init` note (Step 14 → 15)**

  Replace: `When invoked with \`--source init\` (used by \`/claude-tweaks:init\`'s Step 14),`
  With: `When invoked with \`--source init\` (used by \`/claude-tweaks:init\`'s Step 15),`

- [ ] **Step 2: `routine/SKILL.md` — Relationship table, `/claude-tweaks:init` row (Step 13/14/14 → 14/15/15)**

  Replace:

  ```
  | `/claude-tweaks:init` | Step 13 (Cloud/Routine Parity Setup) runs immediately before Step 14 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 14 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 14 itself discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

  with:

  ```
  | `/claude-tweaks:init` | Step 14 (Cloud/Routine Parity Setup) runs immediately before Step 15 deliberately — it declares claude-tweaks + superpowers in the project's `.claude/settings.json#enabledPlugins` and generates `scripts/claude-cloud-setup.sh`, so a Routine Step 15 creates doesn't silently fail its first cloud firing for lack of a declared plugin. Step 15 itself discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them via one multiSelect `AskUserQuestion` call (grouped into ≤4-option questions when there are more than 4 candidates) with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

- [ ] **Step 3: `design-wrapper/SKILL.md` — Next Actions table cell (Step 10 → 11)**

  Replace: `` | `{skipped: "Impeccable not installed"}` | `/claude-tweaks:init` to set up integration (Step 10) | ``
  With: `` | `{skipped: "Impeccable not installed"}` | `/claude-tweaks:init` to set up integration (Step 11) | ``

- [ ] **Step 4: `design-wrapper/SKILL.md` — Relationship table, `/claude-tweaks:init` row (Step 10 → 11)**

  Replace: `` | `/claude-tweaks:init` | Adds Impeccable setup phase (Step 10 — install + init + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. | ``
  With: `` | `/claude-tweaks:init` | Adds Impeccable setup phase (Step 11 — install + init + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. | ``

- [ ] **Step 5: `visualize/SKILL.md` — Relationship table, `/claude-tweaks:init` row (Step 11 → 12)**

  Replace: `` | `/claude-tweaks:init` | Step 11 offers to enable diagram suggestions (writes `diagram-suggestions: enabled/disabled` to CLAUDE.md — no install step, this skill is native). | ``
  With: `` | `/claude-tweaks:init` | Step 12 offers to enable diagram suggestions (writes `diagram-suggestions: enabled/disabled` to CLAUDE.md — no install step, this skill is native). | ``

- [ ] **Step 6: `review/SKILL.md` — two "written by `/init` Step 11" references (→ Step 12)**

  Replace: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). **Skip silently when** ``
  With: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 12). **Skip silently when** ``

  Then replace: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). | ``
  With: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 12). | ``

- [ ] **Step 7: `journeys/SKILL.md` — two "written by `/init` Step 11" references (→ Step 12)**

  Replace: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently. ``
  With: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 12). When the flag is `disabled` or missing, skip this step silently. ``

  Then replace: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). | ``
  With: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 12). | ``

- [ ] **Step 8: `specify/SKILL.md` — two "written by `/init` Step 11" references (→ Step 12)**

  Replace: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently. ``
  With: `` Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 12). When the flag is `disabled` or missing, skip this step silently. ``

  Then replace: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). | ``
  With: `` Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 12). | ``

- [ ] **Step 9: `build/worktree-setup.md` — "see `skills/init/bootstrap-steps.md` Step 10" (→ Step 11)**

  Replace: `` (`/impeccable:impeccable hooks on` — see `skills/init/bootstrap-steps.md` Step 10), ``
  With: `` (`/impeccable:impeccable hooks on` — see `skills/init/bootstrap-steps.md` Step 11), ``

- [ ] **Step 10: `help/reference-card.md` — stale range fix (9-14 → 9-17) + two step-number cells (Step 10 → 11, Step 12 → 13)**

  Replace: `` `/claude-tweaks:init`'s Optional Enhancement steps (9-14) offer to install these and write a flag to CLAUDE.md. ``
  With: `` `/claude-tweaks:init`'s Optional Enhancement steps (9-17) offer to install these and write a flag to CLAUDE.md. ``

  Then replace: `` | [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Frontend design-quality LLM commands + deterministic CLI. Wired into `/test`, `/review`, `/build`, `/specify`, `/flow`, `/visual-review` via `/claude-tweaks:design-wrapper`. Frontend projects only. | `/init` Step 10 (writes `design-integration:` flag, read downstream) | ``
  With: `` | [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Frontend design-quality LLM commands + deterministic CLI. Wired into `/test`, `/review`, `/build`, `/specify`, `/flow`, `/visual-review` via `/claude-tweaks:design-wrapper`. Frontend projects only. | `/init` Step 11 (writes `design-integration:` flag, read downstream) | ``

  Then replace: `` | [`shadcn/ui`](https://ui.shadcn.com/) | CLI-driven component system + its own official MCP server and Skill for AI-agent context. Frontend projects only. | `/init` Step 12 (writes `shadcn-integration:` flag — currently write-only, not yet read downstream) | ``
  With: `` | [`shadcn/ui`](https://ui.shadcn.com/) | CLI-driven component system + its own official MCP server and Skill for AI-agent context. Frontend projects only. | `/init` Step 13 (writes `shadcn-integration:` flag — currently write-only, not yet read downstream) | ``

- [ ] **Step 11: `docs/getting-started.md` — two step-number references (Step 11 → 12, Step 10 → 11)**

  Replace: `` gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 11. ``
  With: `` gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 12. ``

  Then replace: `` Set up by `/init` Step 10. ``
  With: `` Set up by `/init` Step 11. ``

- [ ] **Step 12: Verify**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -rn -i "step 9\b" skills/routine/SKILL.md skills/design-wrapper/SKILL.md skills/visualize/SKILL.md skills/review/SKILL.md skills/journeys/SKILL.md skills/specify/SKILL.md skills/build/worktree-setup.md skills/help/reference-card.md docs/getting-started.md
  ```

  Expected: no output.

  ```bash
  grep -n "Step 15" skills/routine/SKILL.md
  grep -n "Step 11" skills/design-wrapper/SKILL.md
  grep -n "Step 12" skills/visualize/SKILL.md skills/review/SKILL.md skills/journeys/SKILL.md skills/specify/SKILL.md
  grep -n "Step 11" skills/build/worktree-setup.md
  grep -n "9-17" skills/help/reference-card.md
  grep -n "Step 12" docs/getting-started.md
  ```

  Expected: at least one hit in each file (confirms the renumbered content actually landed, not just that the old pattern is gone).

- [ ] **Step 13: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/routine/SKILL.md skills/design-wrapper/SKILL.md skills/visualize/SKILL.md skills/review/SKILL.md skills/journeys/SKILL.md skills/specify/SKILL.md skills/build/worktree-setup.md skills/help/reference-card.md docs/getting-started.md
  git status --short
  git commit -m "init: renumber the 9 peripheral cross-referencing files for Steps 9-16 to 10-17"
  ```

---

### Task 4: `SKILL.md` — new Step 9 content

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: Task 2's renumbered Step 10 header (this task's new Step 9 block is inserted immediately above it) and Task 2's renumbered enhancement-filter-token table (this task adds a new row + hard-depends notes on top of it).
- Produces: the `### Step 9: Establish GitHub Remote (Optional)` summary paragraph that Task 5 refers back to as "read `bootstrap-steps.md` (Step 9) for the full procedure," and the `github-remote` enhancement filter token that a future invocation can pass.

- [ ] **Step 1: Frontmatter `argument-hint` — add `github-remote` token**

  Replace:

  ```
  argument-hint: "[<path>|<github-url>|<description>|--update|update|--full|--core-only|bootstrap|config|skills|journeys|docs|issue-form|design-integration|diagram-suggestions|shadcn-integration|cloud-parity|routines|branch-tracking|work-backend]"
  ```

  with:

  ```
  argument-hint: "[<path>|<github-url>|<description>|--update|update|--full|--core-only|bootstrap|config|skills|journeys|docs|github-remote|issue-form|design-integration|diagram-suggestions|shadcn-integration|cloud-parity|routines|branch-tracking|work-backend]"
  ```

- [ ] **Step 2: Enhancement filter token table — add `github-remote` row + hard-depends notes on the 4 remote-gated tokens**

  Replace:

  ```
  | Token | Runs |
  |---|---|
  | `issue-form` | Step 10 — GitHub issue form template |
  | `design-integration` | Step 11 — Impeccable design integration |
  | `diagram-suggestions` | Step 12 — Diagram suggestions |
  | `shadcn-integration` | Step 13 — shadcn bootstrap |
  | `cloud-parity` | Step 14 — Cloud/Routine parity setup, alone |
  | `routines` | Step 15 — Routine installation. Hard-depends on Step 14 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 14 first anyway, matching the unfiltered flow's existing 14-before-15 ordering |
  | `branch-tracking` | Step 16 — Non-default-branch issue tracking |
  | `work-backend` | Step 17 — Work-record backend |
  ```

  with:

  ```
  | Token | Runs |
  |---|---|
  | `github-remote` | Step 9 — Establish GitHub remote, alone |
  | `issue-form` | Step 10 — GitHub issue form template. Hard-depends on Step 9 having run — if `github-remote` wasn't also given (and no remote exists yet), `issue-form` silently runs Step 9 first anyway |
  | `design-integration` | Step 11 — Impeccable design integration |
  | `diagram-suggestions` | Step 12 — Diagram suggestions |
  | `shadcn-integration` | Step 13 — shadcn bootstrap |
  | `cloud-parity` | Step 14 — Cloud/Routine parity setup, alone. Hard-depends on Step 9 the same way `issue-form` does |
  | `routines` | Step 15 — Routine installation. Hard-depends on Step 14 having run — if `cloud-parity` wasn't also given (or already configured from an earlier run), `routines` silently runs Step 14 first anyway, matching the unfiltered flow's existing 14-before-15 ordering |
  | `branch-tracking` | Step 16 — Non-default-branch issue tracking. Hard-depends on Step 9 the same way `issue-form` does |
  | `work-backend` | Step 17 — Work-record backend. Hard-depends on Step 9 the same way `issue-form` does |
  ```

- [ ] **Step 3: Insert the new Step 9 summary immediately before the renumbered Step 10 header**

  Replace:

  ```
  ### Step 10: GitHub Issue Form Template (Optional)
  ```

  with:

  ```
  ### Step 9: Establish GitHub Remote (Optional)

  Interactive-only — never runs in `auto`/non-interactive mode. When no git remote is configured at all (any existing remote, GitHub or not, skips this step), offers to get the `gh` CLI installed and authenticated, then offers to create a GitHub repository (personal account or an org, confirmed name defaulting to the project folder, private/public) and link it as `origin`. Establishes the remote that Steps 10/14/16/17 below each independently check for — declining any offer here falls through to their existing behavior unchanged. Read `bootstrap-steps.md` (Step 9) for the full procedure.

  ### Step 10: GitHub Issue Form Template (Optional)
  ```

- [ ] **Step 4: Add the Actions Performed table row**

  Replace:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 17 |
  | Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 14 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 15 |
  ```

  with:

  ```
  | Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer core-label bootstrap (see `_shared/work-record.md`'s Label taxonomy table for current per-family and total counts) | Step 17 |
  | GitHub remote | Created `{owner}/{name}` ({visibility}) and set as `origin` (only if Step 9 ran and the user confirmed creation) | Step 9 |
  | Cloud parity | Declared {N} plugin(s) in .claude/settings.json#enabledPlugins; wrote scripts/claude-cloud-setup.sh; wrote CLAUDE.md's Cloud parity section | Step 14 |
  | Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 15 |
  ```

- [ ] **Step 5: Add one new Anti-Patterns row**

  Find the Anti-Patterns table's last row (`| Assuming \`/init\` can set the cloud environment's Setup-script field itself | ... |`) and the `## Relationship to Other Skills` heading that follows it.

  Replace:

  ```
  | Assuming `/init` can set the cloud environment's Setup-script field itself | No API or CLI sets it remotely — confirmed by inspecting `RemoteTrigger`'s own schema (scoped to `/v1/code/triggers` only). It's always a manual, one-time paste per environment, done in the claude.ai/code environment settings UI. |

  ## Relationship to Other Skills
  ```

  with:

  ```
  | Assuming `/init` can set the cloud environment's Setup-script field itself | No API or CLI sets it remotely — confirmed by inspecting `RemoteTrigger`'s own schema (scoped to `/v1/code/triggers` only). It's always a manual, one-time paste per environment, done in the claude.ai/code environment settings UI. |
  | Assuming Step 9 can authenticate `gh` non-interactively | `gh auth login --web` is a device-flow browser authorization — it always requires the user to complete a step in their own browser. There is no headless/token-based path this step uses instead. |

  ## Relationship to Other Skills
  ```

- [ ] **Step 6: Verify**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -n "github-remote" skills/init/SKILL.md
  grep -n "### Step 9: Establish GitHub Remote" skills/init/SKILL.md
  grep -n "GitHub remote | Created" skills/init/SKILL.md
  grep -c "Assuming Step 9 can authenticate \`gh\` non-interactively" skills/init/SKILL.md
  ```

  Expected: at least 3 hits for the first (frontmatter, table row, hard-depends notes), one hit each for the second and third, `1` for the fourth.

- [ ] **Step 7: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/init/SKILL.md
  git commit -m "init: add Step 9 (Establish GitHub Remote) summary, filter token, Actions Performed row, Anti-Patterns"
  ```

---

### Task 5: `bootstrap-steps.md` — new Step 9 detailed procedure + two-tier check consolidation

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Consumes: Task 1's renumbered Step 10 header (this task's new Step 9 block is inserted immediately above it); Step 8's existing package-manager detection table pattern (referenced, not duplicated, for the `gh`-install table below).
- Produces: the full mechanics (gate, gh install/auth, create-repo flow, error handling) that `SKILL.md`'s Step 9 summary (Task 4) points to via "Read `bootstrap-steps.md` (Step 9) for the full procedure"; and the corrected "same two-tier check Step 9 documents" cross-references that Steps 10/14/16/17 now use instead of restating the check inline.

**Note on the two-tier check:** Step 9's own gate (below) is a *simpler* check than the "GitHub-flavored remote reachable" two-tier check Steps 10/14/16/17 use — Step 9 fires on bare remote absence, while the others check specifically for a reachable GitHub remote (which will be true once Step 9 successfully creates one, or was already true if one pre-existed). Step 9's text documents both checks together since they're closely related, so Steps 10/14/16/17 can each point back to it with a short "documents" cross-reference instead of restating the two-tier mechanism inline every time.

- [ ] **Step 1: Insert the new Step 9 detailed procedure immediately before the renumbered Step 10 header**

  Replace:

  ```
  ### Step 10 — GitHub issue form template (agent-task)
  ```

  with:

  ````
  ### Step 9 — Establish GitHub Remote (detailed procedure)

  Interactive-only. This step never runs under `auto`/non-interactive mode — creating a GitHub repository is a consequential, externally-visible, hard-to-reverse action, the same class of action `_shared/browser-detection.md` already bars from unattended auto-install. In `auto` mode, skip this step entirely; every downstream step below falls through to its own existing gate-fails behavior unchanged.

  **Gate:** `git remote get-url origin` fails (no remote configured at all). Any existing remote — GitHub or not — skips this step silently; the user has already chosen a host.

  Steps 10/14/16/17 below independently check for a *reachable GitHub-flavored remote* specifically (not just any remote) via a related, richer two-tier check: `gh repo view --json owner,name` succeeding when `gh` is available and authenticated (works for GitHub Enterprise, not just github.com), else `git remote get-url origin` exits 0 as a fallback heuristic — a non-GitHub git host would simply see those steps' offers and decline them, which costs nothing. This step's own gate above is intentionally simpler and broader: it doesn't try to distinguish GitHub from other hosts, since creating a repo is only relevant when there is truly no remote configured yet.

  **1. Ensure `gh` is ready.**

  Check `gh --version`. If missing, detect the platform's package manager the same way Step 8 above does:

  | Platform | Detect | Install command |
  |---|---|---|
  | macOS | `brew --version` | `brew install gh` |
  | Windows | `winget --version` or `scoop --version` | `winget install --id GitHub.cli` or `scoop install gh` |
  | Linux | `apt --version` / `dnf --version` / `pacman --version` | Print GitHub's own official Linux install instructions (https://github.com/cli/cli/blob/trunk/docs/install_linux.md) rather than a single `apt install gh` line — most distros don't ship `gh` in default repos and require adding GitHub's own package repository first; `pacman -S github-cli` is the one exception that installs directly |

  Call `AskUserQuestion`:

  - `question`: `"gh CLI not found — needed to create a GitHub repository. Install it now?"`, `header`: `"Install gh CLI"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Install gh CLI (Recommended)"`, `description`: `"Runs {the detected install command} via Bash."`
  - Option 2 — `label`: `"Skip"`, `description`: `"Don't set up a GitHub remote this run."`

  On macOS/Windows (no `sudo` needed), run the install command directly via Bash on accept, then re-verify with `gh --version`. On Linux, print the official install instructions instead of running anything — matching Step 8's existing "we don't run sudo from init" rule — and wait for the user to confirm they've run it, then re-verify. If installation fails, or no package manager is detected on a platform other than Linux, abort this step gracefully: proceed to whatever this invocation runs next (Steps 10/14/16/17 below take their existing gate-fails paths).

  Check `gh auth status`. If not authenticated, explain that this requires a one-time browser step, then run `gh auth login --web` and wait for the user to complete the device-flow authorization in their browser. Re-verify with `gh auth status` afterward. A user who declines, or an auth flow that doesn't complete, aborts this step gracefully the same way.

  **2. Offer to create the repo.** Call `AskUserQuestion`:

  - `question`: `"No GitHub remote found for this project. Create one now?"`, `header`: `"Create GitHub repo"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Create a GitHub repo (Recommended)"`, `description`: `"Set up a new GitHub repository and link it as origin."`
  - Option 2 — `label`: `"Skip"`, `description`: `"Don't set up a GitHub remote this run."`

  Declining falls through to existing behavior unchanged — Steps 10/14/16/17 below each take their own gate-fails path.

  **3. Choose owner.** Resolve the personal account (`gh api user --jq .login`) and the user's orgs (`gh api user/orgs --jq '.[].login'`). Call `AskUserQuestion`:

  - `question`: `"Create the repo under your personal account or an organization?"`, `header`: `"Repo owner"`, `multiSelect`: `false`
  - Option 1 — `label`: `"{personal account} (Recommended)"`, `description`: `"Create under your personal account."`
  - Option 2..4 — one per org, up to 3, `label`: `"{org login}"`, `description`: `"Create under this organization."`

  With zero orgs, only Option 1 renders — an `AskUserQuestion` still needs at least 2 options, so in that case fold in a second option: `label`: `"Other"`, wait — `Other` is a built-in field on every `AskUserQuestion` call regardless of how many explicit options are listed, so a single explicit option (personal account) plus the built-in `Other` field satisfies the tool's requirements without a synthetic second option. The built-in `Other` free-text field covers typing any org beyond the first 3, or any org name at all when the user belongs to none of the listed ones.

  **4. Confirm name.** Default = the git top-level directory's basename (`git rev-parse --show-toplevel`), lowercased, with any run of characters outside `[a-z0-9-]` replaced by a single `-`, trimmed of leading/trailing `-` (GitHub repo naming rules). Present the default and let the user override it in the same exchange rather than a separate round-trip.

  **5. Choose visibility.** Call `AskUserQuestion`:

  - `question`: `"Repository visibility?"`, `header`: `"Visibility"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Private (Recommended)"`, `description`: `"Only you (and anyone you invite) can see it."`
  - Option 2 — `label`: `"Public"`, `description`: `"Anyone can see it."`

  **6. Final confirmation.** One explicit summary confirm before executing — covers the whole create+link+push action, not a re-ask of Steps 3-5:

  - `question`: `"Create github.com/{owner}/{name} ({visibility}) and set it as origin, pushing the current branch?"`, `header`: `"Confirm"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Yes — create it (Recommended)"`, `description`: `"Runs gh repo create with --source=. --remote=origin."`
  - Option 2 — `label`: `"Cancel"`, `description`: `"Don't create anything."`

  **7. Execute.**

  ```bash
  git rev-parse HEAD >/dev/null 2>&1 && PUSH_FLAG="--push" || PUSH_FLAG=""
  gh repo create "{owner}/{name}" --{private|public} --source=. --remote=origin $PUSH_FLAG
  ```

  `--push` is included only when the current branch already has at least one commit — an empty repo has nothing to push yet. On a name collision or permission error, report it and return to Step 4 (pick a different name) rather than aborting the whole step.

  **8. Downstream effect.** Once the remote exists, Steps 10/14/16/17 below see it via their own existing two-tier check (documented above) and take their already-documented enriched paths — no further action needed here.

  **Failure handling summary:**

  | Condition | Behavior |
  |---|---|
  | Not a git repo at all | This step doesn't run (nothing to attach a remote to) |
  | A remote already exists (any host) | This step doesn't run |
  | User declines install / auth / create | Clean fallback to existing behavior, nothing partially applied |
  | `gh` install fails / no package manager detected (non-Linux) | Abort gracefully, same fallback |
  | `gh auth login` doesn't complete | Abort gracefully, same fallback |
  | Repo name collision or permission error | Re-prompt for a different name (Step 4), not a hard failure |

  ---

  ````

  (Note: the closing `---` above is the section's own trailing divider, matching the convention every other step in this file ends with before the next `### Step N` header — the block wrapping this whole replacement uses a 4-backtick fence specifically because the replacement's own content contains 3-backtick-fenced `bash` blocks; a 4-backtick outer fence only closes on a matching-or-longer run of backticks alone on a line, so the nested 3-backtick fences don't prematurely close it. After applying this edit, verify the fence still closes exactly where intended — don't trust the diff on sight, actually re-read the resulting file section.)

- [ ] **Step 2: Consolidate Step 10's own two-tier check description into a pointer at Step 9**

  Replace:

  ```
  Offer only when the project has a GitHub-flavored remote — a two-tier check that stays
  GHE-safe without requiring `gh` as a hard new dependency for what is otherwise a pure
  file-write step: when `gh` is installed and authenticated, confirm via `gh repo view
  --json owner,name` succeeding (works for GitHub Enterprise, not just github.com); when
  `gh` isn't available, fall back to just checking a remote exists (`git remote get-url
  origin` exits 0) — a non-GitHub git host would simply see the offer and decline it, which
  costs nothing. Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
  ```

  with:

  ```
  Offer only when the project has a GitHub-flavored remote — same two-tier check Step 9
  documents. Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
  ```

- [ ] **Step 3: Consolidate Step 14's Gate line**

  Replace:

  ```
  **Gate:** run the same GHE-safe two-tier check Step 10 uses (`gh repo view --json owner,name` when `gh` is available and authenticated, else `git remote get-url origin` exits 0). No remote → skip this step silently.
  ```

  with:

  ```
  **Gate:** same two-tier check Step 9 documents. No remote → skip this step silently.
  ```

- [ ] **Step 4: Consolidate Step 16's opening gate description**

  Replace:

  ```
  Offer only when the project has a GitHub-flavored remote — same two-tier, GHE-safe gate
  Step 10 uses (`gh repo view` when available, remote-exists fallback otherwise). Check
  whether
  ```

  with:

  ```
  Offer only when the project has a GitHub-flavored remote — same two-tier check Step 9
  documents. Check whether
  ```

- [ ] **Step 5: Consolidate Step 17's Gate line**

  Replace:

  ```
  **Gate:** run the same GHE-safe two-tier check Step 10 uses.
  ```

  with:

  ```
  **Gate:** same two-tier check Step 9 documents.
  ```

- [ ] **Step 6: Verify**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -n "^### Step 9 — Establish GitHub Remote" skills/init/bootstrap-steps.md
  grep -n "^### Step 10 — GitHub issue form template" skills/init/bootstrap-steps.md
  grep -c "same two-tier check Step 9 documents" skills/init/bootstrap-steps.md
  grep -n "gh repo create" skills/init/bootstrap-steps.md
  ```

  Expected: one hit each for the first two, `4` for the third (Steps 10/14/16/17 each now point at Step 9), at least one hit for the fourth.

  ```bash
  node -e "require('fs').readFileSync('skills/init/bootstrap-steps.md','utf8')" && echo "file still parses as text, no encoding corruption"
  ```

  Then actually read the file section around the new Step 9 block directly (not just grep) to confirm the 4-backtick outer fence closed exactly where intended and no nested 3-backtick block leaked past it.

- [ ] **Step 7: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add skills/init/bootstrap-steps.md
  git commit -m "init: add Step 9 (Establish GitHub Remote) detailed procedure, consolidate two-tier check description"
  ```

---

### Task 6: `CLAUDE.md` combined edit + whole-repo verification + version bump

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude-plugin/plugin.json` (version bump)

**Interfaces:**
- Consumes: Tasks 1-5's fully renumbered and newly-added content as already-current fact.

- [ ] **Step 1: `CLAUDE.md` — combined renumber + new-step mention in the `init` row's sub-file description**

  Replace:

  ```
  | init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md, pain-point-routing.md, rules-template.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Core Bootstrap Version Check (bootstrap-state marker + version-gap changelog notice, runs before Step 1); Step 9 GitHub issue form offer (agent-task.yml); Step 13 cloud/Routine parity setup (`.claude/settings.json#enabledPlugins` declaration + `scripts/claude-cloud-setup.sh` generation + CLAUDE.md `## Cloud parity` section — runs before Step 14 so a newly-created Routine doesn't silently fail its first cloud firing); Step 16 work-record backend decision (`work-backend` flag + `work-types`/`work-links` capability probes + initial label bootstrap — see `_shared/work-record.md`); Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected; Phase 2f backlog work-record templates + Pain Points Routed summary; `.claude/rules/` frontmatter template + common rule candidates |
  ```

  with:

  ```
  | init | detection-tables.md, profile-templates.md, claude-md-template.md, skill-template.md, skill-categories.md, summary-templates.md, docs-structure.md, bootstrap-steps.md, phase-3-classification.md, phase-4-scoring.md, update-mode.md, pain-point-routing.md, rules-template.md | Lazy-loaded reference content per phase; doc registry format, tier detection, folder taxonomy; Phase 0 bootstrap procedures; Core Bootstrap Version Check (bootstrap-state marker + version-gap changelog notice, runs before Step 1); Step 9 GitHub remote bootstrap (interactive-only; gets `gh` installed/authenticated then offers to create a GitHub repo and link it as `origin` when no remote exists at all, so Steps 10/14/16/17 below get the enriched path in the same run); Step 10 GitHub issue form offer (agent-task.yml); Step 14 cloud/Routine parity setup (`.claude/settings.json#enabledPlugins` declaration + `scripts/claude-cloud-setup.sh` generation + CLAUDE.md `## Cloud parity` section — runs before Step 15 so a newly-created Routine doesn't silently fail its first cloud firing); Step 17 work-record backend decision (`work-backend` flag + `work-types`/`work-links` capability probes + initial label bootstrap — see `_shared/work-record.md`); Phase 3 auto/confirmation gate template; Phase 4 scoring procedure + manifest template; Update-Mode procedures (Phase 1u inventory, contract-drift, early-exit gate) loaded only when existing config is detected; Phase 2f backlog work-record templates + Pain Points Routed summary; `.claude/rules/` frontmatter template + common rule candidates |
  ```

- [ ] **Step 2: Verify the CLAUDE.md edit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -n "Step 9 GitHub remote bootstrap" CLAUDE.md
  grep -n "Step 10 GitHub issue form offer" CLAUDE.md
  grep -n "Step 14 cloud/Routine parity setup" CLAUDE.md
  grep -n "Step 17 work-record backend decision" CLAUDE.md
  grep -n "Step 13 cloud/Routine parity setup\|Step 16 work-record backend decision" CLAUDE.md
  ```

  Expected: one hit for each of the first four; no output for the fifth (confirms the stale "Step 13"/"Step 16" references are gone from this line).

- [ ] **Step 3: Confirm no orphaned old-numbering references remain anywhere live**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  grep -rn -i "step 9\b" --include="*.md" skills/ CLAUDE.md docs/getting-started.md | grep -v "^skills/init/skill-template.md"
  ```

  Every hit must describe the *new* Step 9 (Establish GitHub Remote) — none may describe the old Step 9 (GitHub issue form template). Manually confirm this by reading each hit's surrounding text, not just counting occurrences.

  ```bash
  grep -rn -i "step 1[3-6]\b" --include="*.md" skills/ CLAUDE.md docs/getting-started.md | grep -v "^skills/init/skill-template.md"
  ```

  For each hit, confirm the surrounding text's *topic* (shadcn / Cloud parity / Routine Installation / Non-Default-Branch Issue Tracking / Work-Record Backend) matches the number now used, per `skills/init/bootstrap-steps.md`'s own current step headers (`grep -n "^### Step " skills/init/bootstrap-steps.md` for the authoritative current mapping). Expected: every hit is topic-consistent; zero hits describe an old topic under an old number. The `skill-template.md` exclusion guards against a false-positive match inside that file's own generic "### Step N" placeholder prose — confirm by inspection whether the exclusion was actually needed; drop it from the command if `skill-template.md` has no such match.

  Note: unlike a pure grep-for-absence check, a bare `grep -i "step 1[3-6]"` sweep here cannot produce "no output" the way it could for a genuinely removed pattern — after this renumbering, "Step 13" through "Step 16" are all legitimate, current references (new Step 13 = shadcn Bootstrap, new Step 14 = Cloud/Routine Parity Setup, new Step 15 = Routine Installation, new Step 16 = Non-Default-Branch Issue Tracking). Topic-consistency is the only valid signal of staleness here.

- [ ] **Step 4: Confirm historical/frozen docs were NOT touched**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git diff --stat main -- docs/superpowers/plans/
  ```

  Expected: no output (zero changes to any historical plan).

- [ ] **Step 5: Confirm the new Step 9 content is internally consistent end-to-end**

  Read `skills/init/SKILL.md`'s Step 9 summary and `skills/init/bootstrap-steps.md`'s Step 9 detailed procedure side by side. Confirm: the summary's one-line description (gate, gh install/auth, create-repo offer, org/name/visibility, downstream effect) matches what the detailed procedure actually does, with no drift between the two. Confirm the enhancement filter token table (`SKILL.md`) and the Actions Performed row both use the exact literal string `github-remote` and `Step 9` consistently.

- [ ] **Step 6: Bump the plugin version**

  Read `.claude-plugin/plugin.json`, note the current `version`. Per this repo's own release convention (`CLAUDE.md`'s Versioning section): bump the **minor** version for this feature addition.

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git fetch origin main
  git log --oneline -5 origin/main -- .claude-plugin/plugin.json
  ```

  Confirm no other bump landed on `origin/main` since this worktree branched. Then edit `.claude-plugin/plugin.json`'s `version` field to the next minor version (confirm the actual current value first — a concurrent session may have bumped it since this plan was written; if so, use the next free minor version instead of assuming this plan's version number is still free).

- [ ] **Step 7: Run the full test suite**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  npm test 2>&1 | tail -15
  ```

  Expected: same pass count as this worktree's clean baseline (1704 tests, 0 failures) — this plan makes no code changes, only prose plus one version-string edit, so no new failures should appear.

- [ ] **Step 8: Commit**

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add CLAUDE.md .claude-plugin/plugin.json
  git status --short
  git commit -m "Bump to {new-version} for /init Step 9 (Establish GitHub Remote); cross-reference in CLAUDE.md"
  ```

- [ ] **Step 9: Final sweep commit (only if Step 3 found a straggler)**

  If Step 3 surfaced any remaining topic-inconsistent reference, fix it now, re-verify, then:

  ```bash
  cd "$(git rev-parse --show-toplevel)" && pwd
  git add -A
  git status --short
  git commit -m "Fix stragglers found by the init-github-remote-bootstrap whole-repo sweep"
  ```

  If nothing was found, skip this commit — Task 6 is verification-only beyond the CLAUDE.md edit and version bump.

## Self-Review Notes

- **Spec coverage:** every section of the design doc maps to a task — Scope's gh-readiness and create-repo-flow requirements are Task 5's new procedure content; Placement/renumbering is Tasks 1-3; the "two-tier check consolidation" refinement is Task 5 Steps 2-5; Integration touches (Actions Performed row, Anti-Patterns row, no new CLAUDE.md flag) are Task 4; Testing's "no JS coverage, manual dry-run + grep self-checks" approach is reflected in every task's own Verify step plus Task 6's whole-repo sweep.
- **A precision fix made during plan-authoring, not present verbatim in the design doc:** the design doc's "Two-tier check consolidation" section described Step 9 as using the *same* two-tier check Steps 10/14/16/17 use as its own gate. Re-deriving the actual mechanism during Task 5 drafting showed this isn't quite right — Step 9's own gate (per the design doc's own approved Interaction Flow section) is the simpler "no remote at all" check, not the two-tier "GitHub remote reachable" check. Task 5's Step 9 procedure documents both checks together and has the other steps point back to it with "same two-tier check Step 9 documents" — achieving the intended DRY consolidation without the inaccurate claim that Step 9 "uses" that exact check itself.
- **Type/reference consistency:** `github-remote` (the enhancement filter token), `Step 9` / `Step 10` / `Step 14` / `Step 16` / `Step 17` (the renumbered step identities), and `same two-tier check Step 9 documents` (the consolidated cross-reference phrase) are named identically everywhere they appear across Tasks 1-6 — no drift between `SKILL.md`'s summary/table and `bootstrap-steps.md`'s actual procedure.
- **No placeholders:** every task's before/after text is the literal current file content (read directly during plan-authoring, not estimated) or the design doc's already-drafted new-content templates — nothing deferred to "similar to Task N" or "add appropriate handling."
