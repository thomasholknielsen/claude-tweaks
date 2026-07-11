# Backlog Entry Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-files backlog's two shared files (`specs/INBOX.md`, `specs/DEFERRED.md`) with one file per entry under `specs/backlog/{slug}.md` carrying a `**Stage:** inbox | parked` field that flips in place, upgrade local `Trigger` classification to the same live date/path/prose judgment the GitHub-issues backend already uses, and drop the one-time `code-health:remembered` / `/tidy` Step 4.8a backstop entirely.

**Architecture:** This is a pure documentation/prose change across 25 markdown skill files plus one code comment — no runtime code changes, since these skills are LLM-executed instructions, not compiled logic. Every file that names the literal paths `specs/INBOX.md` or `specs/DEFERRED.md` (or describes the two-file mechanism generically, e.g. "INBOX file, DEFERRED file") gets those references replaced with `specs/backlog/{slug}.md` plus the relevant `**Stage:**` value. Generic conceptual uses of the word "INBOX" (e.g. "Priority 2-3 → INBOX" in a routing table) that don't name a literal file path are left untouched — this plan changes the *storage shape*, not the plugin's vocabulary for "an idea awaiting triage."

**Tech Stack:** Markdown skill files (`skills/**/*.md`), one Node.js comment (`bin/lib/issues/backlog.js`), `node --test` for the existing (unaffected) JS test suite.

## Global Constraints

- **Entry format** (from the design doc, `docs/superpowers/specs/2026-07-10-backlog-entry-unification-design.md`), verbatim:

  ```markdown
  ## [Short Title]

  **Stage:** inbox | parked
  **Added:** YYYY-MM-DD | **Category:** {product|technical|legal|infrastructure} | **Related:** (spec numbers or "none")

  Context: 1-2 sentences on why this came up

  Scope: Rough sense of what it might involve

  <!-- parked-stage only, below -->
  **From:** {source spec, or "none"}
  **Trigger:** {a date, a comma-separated list of paths, or free prose}
  **Options considered:** {optional}
  ```

- **`**Category:**` is always present**, regardless of stage — it lives in the shared header block, not the parked-only block. This resolves the one open design question the pre-planning investigation flagged (`bootstrap-steps.md:776`, `tidy/SKILL.md:117`): there is **no "judge category live from content" step for local-files entries** anymore. That live-judgment logic only ever existed because today's `DEFERRED.md` lacks a `**Category:**` field — once every entry uses the unified header, every local entry has a Category set at capture time, matching the GitHub-issues backend's `backlog:category-<value>` label being set at creation too. Delete this logic wherever it appears; do not port it forward.
- **`**Trigger:**` still stays free-form text** — but classification of it is upgraded to the live judgment `/tidy`'s "Sync to GitHub" action already applies on the GitHub side: parse as a date first (compare to today), then check whether it names file paths (checked against `git log`), otherwise treat as prose.
- **Filename (slug) derivation** — the stable local handle, mirroring a GitHub issue number: lowercase the title, replace every run of non-alphanumeric characters with a single `-`, trim leading/trailing `-`, truncate to 60 characters. On a collision with an existing file in `specs/backlog/`, append `-2`, `-3`, etc. (first free suffix). Example: title `"Voice command to add item to shopping list"` → `voice-command-to-add-item-to-shopping-list.md`.
- **Directory:** `specs/backlog/`, flat — no `inbox/`/`parked/` subdirectories. No index file (a directory glob is sufficient given entries' short lifecycle — explicit design decision, do not add one).
- **No auto-migration.** Existing `specs/INBOX.md`/`specs/DEFERRED.md` content in any project is left exactly as-is by every task in this plan. A separate, throwaway, non-shipped migration script is an explicitly out-of-scope follow-up (design doc Solution D) — do not write one as part of this plan.
- **Drop `code-health:remembered` / `/tidy` Step 4.8a entirely.** This is unrelated to code-health's own internal `remembered` cache status (`bin/lib/code-health/cache.js`, `bin/code-health.js` — a below-`--min-risk`-threshold finding that was never filed as an issue at all). Do **not** touch any `bin/code-health.js`, `bin/lib/code-health/**`, or `skills/code-health/**` file — those are a different, currently-active mechanism that happens to share the word "remembered." Only `skills/tidy/scan-procedures.md`'s Step 4.8a section (the `code-health:remembered` **GitHub label** backstop) is affected.
- **Backend-selection logic is unchanged.** `backlog-backend: github-issues` vs. `local-files` — which is active when, and the manual-override path — is untouched. Every edit in this plan is scoped to the `local-files` branch of existing conditionals; do not alter `github-issues`-branch logic.
- Every task's edits are prose substitutions in markdown skill files. There is no compiler or type system to catch mistakes — verification in every task is a targeted `grep` proving the old text is gone and the new text is present, run from the repo root of this worktree.

---

### Task 1: `/init` — entry-format foundation (bootstrap, starter files, migration, CLAUDE.md boilerplate)

**Files:**
- Modify: `skills/init/bootstrap-steps.md:35` (Step 2 directory table)
- Modify: `skills/init/bootstrap-steps.md:46-70` (Step 3 starter files)
- Modify: `skills/init/bootstrap-steps.md:690-797` (Step 15 backend + migration procedure)
- Modify: `skills/init/SKILL.md:84` (Step 3 one-liner)
- Modify: `skills/init/SKILL.md:378` (Actions Performed table row)
- Modify: `skills/init/SKILL.md:430` (Anti-pattern row)
- Modify: `skills/init/summary-templates.md:34-36` (Initial Mode bootstrap table)
- Modify: `skills/init/docs-structure.md:225-232` (Step 8 INBOX-item capture instruction)
- Modify: `skills/init/claude-md-template.md:195` (Don't boilerplate baked into generated projects' CLAUDE.md)

**Interfaces:**
- Produces: the canonical `specs/backlog/{slug}.md` entry-format description and directory-creation behavior every later task's prose refers back to (Task 2's `/capture` write path, Task 4's `/tidy` scan).

- [ ] **Step 1: Fix the Step 2 directory-structure table entry**

  In `skills/init/bootstrap-steps.md`, replace:

  ```
  specs/                      → Spec files and INBOX
  ```

  with:

  ```
  specs/                      → Spec files and backlog entries (specs/backlog/)
  ```

- [ ] **Step 2: Rewrite Step 3 (Starter files) to create an empty `specs/backlog/` directory instead of `INBOX.md`/`DEFERRED.md`**

  Replace the entire block from `### Step 3 — Starter files (detailed content)` through the `specs/INDEX.md` code fence (the `**`specs/INBOX.md`:**` and `**`specs/DEFERRED.md`:**` subsections) with:

  ````markdown
  ### Step 3 — Starter files (detailed content)

  Create these **only if missing** — never overwrite existing content. Idempotent and safe to skip on Update Mode runs.

  **`specs/backlog/`:** create the empty directory (`mkdir -p specs/backlog`) if it doesn't already exist. No starter file inside it — entries are one file per idea or deferral, written by `/claude-tweaks:capture` and `/claude-tweaks:tidy`'s Defer action; an empty directory needs no header content the way a shared file did.

  **`specs/INDEX.md`:**

  ```markdown
  # Spec Index

  Tiered roadmap of work units. Use `/claude-tweaks:specify` to add specs, `/claude-tweaks:help` to see what's ready to build.

  ## Tier 1 — Critical Path

  | Spec | Title | Status | Blocked By |
  |------|-------|--------|------------|
  | — | — | — | — |

  ## Tier 2 — High Value

  | Spec | Title | Status | Blocked By |
  |------|-------|--------|------------|
  | — | — | — | — |

  ## Tier 3 — Differentiators

  | Spec | Title | Status | Blocked By |
  |------|-------|--------|------------|
  | — | — | — | — |
  ```

  ---
  ````

  (The `specs/INDEX.md` content itself is unchanged — only the `INBOX.md`/`DEFERRED.md` subsections above it are removed.)

- [ ] **Step 3: Rewrite Step 15's intro paragraph and the gate-fails prompt's local-files option text**

  Replace:

  ```
  `/claude-tweaks:capture` and `/claude-tweaks:tidy` back the INBOX/DEFERRED backlog with
  either GitHub issues or the classic local markdown files
  (`specs/INBOX.md`/`specs/DEFERRED.md`). Decide the backend once here so every future
  capture/defer/tidy run is consistent — no split-brain between issue-backed and
  file-backed entries for the same repo.
  ```

  with:

  ```
  `/claude-tweaks:capture` and `/claude-tweaks:tidy` back the backlog with either GitHub
  issues or one local markdown file per entry (`specs/backlog/{slug}.md`). Decide the
  backend once here so every future capture/defer/tidy run is consistent — no split-brain
  between issue-backed and file-backed entries for the same repo.
  ```

  Replace:

  ```
  2. Local markdown files (specs/INBOX.md, specs/DEFERRED.md) — no GitHub dependency
  ```

  with:

  ```
  2. Local markdown files (specs/backlog/*.md, one file per entry) — no GitHub dependency
  ```

- [ ] **Step 4: Rewrite the "Existing-content migration" subsection to read from `specs/backlog/*.md`, and remove the now-obsolete "no structured category field" logic**

  Replace the entire block starting at `**Existing-content migration.**` through the paragraph ending `...exactly like a transient-failure fallback write from the scan's point of view.` with:

  ````markdown
  **Existing-content migration.** Whenever this step newly sets `backlog-backend:
  github-issues` (a fresh init resolving to `github-issues` — whether via the silent
  gate-succeeds default or an explicit choice in the gate-fails prompt — a first run on a
  pre-existing project, or the upgrade path below) and `specs/backlog/` contains one or
  more entry files, offer a one-time batch migration before finishing this step:

  ```
  Found {X} inbox-stage and {Y} parked-stage entries in specs/backlog/. Migrate them to
  GitHub issues now?

  1. Migrate all (Recommended) — creates {X+Y} issues, then deletes the migrated files
  2. Skip — leave the files as-is; /claude-tweaks:tidy will flag every entry as
     unsynced on its next run and offer the same migration per-item
  ```

  On "Migrate all": for each entry with `**Stage:** inbox`, build the payload via
  `inboxIssuePayload` (category from the entry's `**Category:**` field, which every entry
  carries regardless of stage) and `gh issue create` with `backlog` +
  `backlog:category-<value>` labels. For each entry with `**Stage:** parked`, judge trigger
  type the same way `/claude-tweaks:tidy`'s Sync to GitHub action would judge it live
  (reading the entry's existing `**Trigger:**` prose, not deciding one fresh — that's what
  makes this a Sync to GitHub case, not a Defer case): names specific files → pass as
  `watchedPaths` to `parkedIssuePayload`; names a moment in time → build via
  `parkedIssuePayload` without `watchedPaths`, then attach/create a GitHub Milestone
  (`gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence,
  `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create,
  `gh issue edit {n} --milestone "{name}"` to attach); otherwise build via
  `parkedIssuePayload` with the prose `**Trigger:**` carried over unchanged. Every entry —
  inbox or parked — already carries a `**Category:**` field set at capture time, so there is
  no live category judgment needed here (unlike the old two-file design, where
  `DEFERRED.md` entries had no structured category field). Every `parkedIssuePayload`-built
  issue gets `backlog` + `parked` + category labels. Bootstrap the `backlog`, `parked`, and
  each used `backlog:category-<value>` label with a real description first
  (check-then-create, same pattern as Step 9's `.github/ISSUE_TEMPLATE` bootstrap). Present
  the batch as a table (entry file → resulting issue number) before deleting the migrated
  files — this is the same batch-table + apply-all/override interaction
  `/claude-tweaks:tidy` Step 6 already uses, not a new UI pattern.

  Delete each migrated entry's `specs/backlog/{slug}.md` file only after its own
  `gh issue create` has confirmed success — migration is atomic per entry, matching the
  Action Vocabulary's atomicity rule (`/claude-tweaks:tidy`'s "Sync to GitHub" action, which
  this migration is a batch form of). If any single `gh issue create` fails mid-batch, leave
  the failed entries' files in place (and only those) and report which ones — they'll be
  flagged unsynced by `/claude-tweaks:tidy` and can be retried per-item via its Sync to
  GitHub action.

  On "Skip": leave the files as-is. `/claude-tweaks:tidy`'s scan already treats any entry
  found in `specs/backlog/` as unsynced once `backlog-backend: github-issues`, offering the
  identical Sync to GitHub action per-item on its next run — a declined migration behaves
  exactly like a transient-failure fallback write from the scan's point of view.
  ````

- [ ] **Step 4: Update `/init` SKILL.md's Step 3 one-liner, Actions Performed row, and Anti-Patterns row**

  In `skills/init/SKILL.md`, replace:

  ```
  Create `specs/INBOX.md`, `specs/DEFERRED.md`, and `specs/INDEX.md` — only if missing, never overwrite.
  ```

  with:

  ```
  Create `specs/backlog/` (empty directory) and `specs/INDEX.md` — only if missing, never overwrite.
  ```

  Replace:

  ```
  | Starter files | Wrote `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/INDEX.md` (only if missing) | Step 3 |
  ```

  with:

  ```
  | Starter files | Wrote `specs/backlog/`, `specs/INDEX.md` (only if missing) | Step 3 |
  ```

  Replace:

  ```
  | Modifying existing INBOX.md or INDEX.md content | Phase 0 is additive — it creates missing files but must not overwrite user content |
  ```

  with:

  ```
  | Modifying existing backlog entries (`specs/backlog/*.md`) or INDEX.md content | Phase 0 is additive — it creates missing files but must not overwrite user content |
  ```

- [ ] **Step 5: Update `summary-templates.md`'s Initial Mode bootstrap table**

  In `skills/init/summary-templates.md`, replace:

  ```
  | `specs/INBOX.md` | {created/exists} |
  | `specs/DEFERRED.md` | {created/exists} |
  ```

  with:

  ```
  | `specs/backlog/` | {created/exists} |
  ```

- [ ] **Step 6: Update `docs-structure.md`'s Step 8 INBOX-item capture instruction**

  In `skills/init/docs-structure.md`, replace:

  ```
  8. **Capture doc work as INBOX items** — For each finding from the assessment (stale, thin, misplaced, missing), create an INBOX entry in `specs/INBOX.md` with the Phase 2 context baked in:
  ```

  with:

  ```
  8. **Capture doc work as backlog entries** — For each finding from the assessment (stale, thin, misplaced, missing), create a `specs/backlog/{slug}.md` entry (`**Stage:** inbox`) with the Phase 2 context baked in:
  ```

- [ ] **Step 7: Update the generated-CLAUDE.md Don't boilerplate**

  In `skills/init/claude-md-template.md`, replace:

  ```
  **No implicit deferrals.** When something needs doing, either do it now or explicitly add it to specs/INBOX.md with scope and context. Never silently skip work or leave TODO comments without a corresponding INBOX entry.
  ```

  with:

  ```
  **No implicit deferrals.** When something needs doing, either do it now or explicitly add a backlog entry (`specs/backlog/{slug}.md`, `**Stage:** inbox`) with scope and context. Never silently skip work or leave TODO comments without a corresponding backlog entry.
  ```

- [ ] **Step 8: Verify**

  From this worktree's root, run:

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md" skills/init/bootstrap-steps.md skills/init/SKILL.md skills/init/summary-templates.md skills/init/docs-structure.md skills/init/claude-md-template.md
  ```

  Expected: no output (exit code 1).

  ```bash
  grep -n "specs/backlog" skills/init/bootstrap-steps.md skills/init/SKILL.md skills/init/summary-templates.md skills/init/docs-structure.md skills/init/claude-md-template.md | wc -l
  ```

  Expected: a number ≥ 8 (one hit per edited location above; exact count isn't load-bearing, just confirms the new path landed in every file).

- [ ] **Step 9: Commit**

  ```bash
  git add skills/init/bootstrap-steps.md skills/init/SKILL.md skills/init/summary-templates.md skills/init/docs-structure.md skills/init/claude-md-template.md
  git commit -m "init: bootstrap specs/backlog/ instead of INBOX.md/DEFERRED.md"
  ```

---

### Task 2: `/capture` — rewrite the local-files write path

**Files:**
- Modify: `skills/capture/SKILL.md` (lines 24, 42, 44, 77, 81, 97, 118, 167, 168, 199, 232 — every local-files-path reference)

**Interfaces:**
- Consumes: the entry format and slug-derivation rule from Task 1's Global Constraints.
- Produces: the `specs/backlog/{slug}.md` write path every downstream skill's "Capture" action (Tasks 4-11) refers to.

- [ ] **Step 1: Rewrite the INBOX-vs-DEFERRED explainer callout**

  Replace:

  ```
  > **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes through `/claude-tweaks:tidy`'s Defer action instead — `specs/DEFERRED.md` under `backlog-backend: local-files`, or the `parked` label under `backlog-backend: github-issues`. Either way it carries origin context, file references, and timing triggers that INBOX entries don't have.
  ```

  with:

  ```
  > **Inbox vs parked:** Use `/claude-tweaks:capture` for new ideas and half-formed features — these land as `**Stage:** inbox`. Work deferred from an active build/review goes through `/claude-tweaks:tidy`'s Defer action instead — the same `specs/backlog/{slug}.md` entry flips to `**Stage:** parked` under `backlog-backend: local-files`, or the `parked` label is added under `backlog-backend: github-issues`. Either way it carries origin context, file references, and timing triggers that a fresh inbox-stage entry doesn't have.
  ```

- [ ] **Step 2: Update the Workflow table's Step 1 and Step 3 rows**

  Replace:

  ```
  | 1 | Add the entry — GitHub issue or `specs/INBOX.md` append, per Backend Selection below. |
  ```

  with:

  ```
  | 1 | Add the entry — GitHub issue or a new `specs/backlog/{slug}.md` file (`**Stage:** inbox`), per Backend Selection below. |
  ```

  Replace:

  ```
  | 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). Issue-backend captures have nothing new to commit unless the fallback path wrote to `specs/INBOX.md`, or the route was `merge:N` (which edits the target spec locally regardless of backend). |
  ```

  with:

  ```
  | 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). Issue-backend captures have nothing new to commit unless the fallback path wrote a `specs/backlog/{slug}.md` file, or the route was `merge:N` (which edits the target spec locally regardless of backend). |
  ```

- [ ] **Step 3: Update the GitHub-issues fallback note (Backend Selection, item 3)**

  Replace:

  ```
  3. **On failure** (GitHub unreachable, `gh` broken, transient API error): fall back to the local-files path below and tell the user issue creation failed and the entry landed in `specs/INBOX.md` instead. No special marker is needed — `/claude-tweaks:tidy`'s scan already treats any non-empty `specs/INBOX.md` content as unsynced once `backlog-backend: github-issues`, and offers a Sync to GitHub action to resolve it later.
  ```

  with:

  ```
  3. **On failure** (GitHub unreachable, `gh` broken, transient API error): fall back to the local-files path below and tell the user issue creation failed and the entry landed in a new `specs/backlog/{slug}.md` file (`**Stage:** inbox`) instead. No special marker is needed — `/claude-tweaks:tidy`'s scan already treats any entry found in `specs/backlog/` as unsynced once `backlog-backend: github-issues`, and offers a Sync to GitHub action to resolve it later.
  ```

- [ ] **Step 4: Rewrite the local-files backend line and Entry Format section**

  Replace:

  ````
  **When `backlog-backend: local-files` (or the flag is missing):**

  Append the entry to `specs/INBOX.md` per the Entry Format below — unchanged from today.

  ## Entry Format

  **`backlog-backend: github-issues`** — issue title = short entry title; issue body:

  ```markdown
  **Related:** {optional spec numbers or "none"}

  Context: 1-2 sentences on why this came up or what triggered it

  Scope: Rough sense of what it might involve (can be vague)
  ```

  Category is a label (`backlog:category-{product|technical|legal|infrastructure}`), not body prose.

  **`backlog-backend: local-files`** — same fields, appended to `specs/INBOX.md`:

  ```markdown
  ## [Short Title]

  **Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

  Context: 1-2 sentences on why this came up or what triggered it

  Scope: Rough sense of what it might involve (can be vague)
  ```
  ````

  with:

  ````
  **When `backlog-backend: local-files` (or the flag is missing):**

  Create a new `specs/backlog/{slug}.md` file per the Entry Format below. Derive `{slug}` from the title: lowercase, replace runs of non-alphanumeric characters with a single `-`, trim leading/trailing `-`, truncate to 60 characters; on a collision with an existing file, append `-2`, `-3`, etc.

  ## Entry Format

  **`backlog-backend: github-issues`** — issue title = short entry title; issue body:

  ```markdown
  **Related:** {optional spec numbers or "none"}

  Context: 1-2 sentences on why this came up or what triggered it

  Scope: Rough sense of what it might involve (can be vague)
  ```

  Category is a label (`backlog:category-{product|technical|legal|infrastructure}`), not body prose.

  **`backlog-backend: local-files`** — same fields, written to a new `specs/backlog/{slug}.md`:

  ```markdown
  ## [Short Title]

  **Stage:** inbox
  **Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

  Context: 1-2 sentences on why this came up or what triggered it

  Scope: Rough sense of what it might involve (can be vague)
  ```
  ````

- [ ] **Step 5: Update "Adding an Entry" local-files steps**

  Replace:

  ```
  **`local-files`:**
  1. Open `specs/INBOX.md`
  2. Append new entry at the bottom
  3. Don't overthink — capture the essence
  ```

  with:

  ```
  **`local-files`:**
  1. Derive the slug from the title (see Entry Format above) and create `specs/backlog/{slug}.md`
  2. Write the entry per the Entry Format above, with `**Stage:** inbox`
  3. Don't overthink — capture the essence
  ```

- [ ] **Step 6: Update the Route execution table (`inbox` and `merge:N` rows)**

  Replace:

  ```
  | `inbox` (keep) | No further action — entry stays in `specs/INBOX.md` | No further action — the issue is already open, `backlog`-labeled, with no `parked` label. That **is** the inbox state; there is nothing to add. |
  | `merge:N` | Integrate into spec N's Deliverables/AC/Technical Approach, remove entry from `specs/INBOX.md` | Integrate into spec N the same way, then comment naming the target spec (`Merged into spec {N}.`), then `gh issue close {n} --reason "not planned"` — mirrors `/claude-tweaks:tidy`'s Merge action |
  ```

  with:

  ```
  | `inbox` (keep) | No further action — entry stays as-is in `specs/backlog/{slug}.md` (`**Stage:** inbox`) | No further action — the issue is already open, `backlog`-labeled, with no `parked` label. That **is** the inbox state; there is nothing to add. |
  | `merge:N` | Integrate into spec N's Deliverables/AC/Technical Approach, delete `specs/backlog/{slug}.md` | Integrate into spec N the same way, then comment naming the target spec (`Merged into spec {N}.`), then `gh issue close {n} --reason "not planned"` — mirrors `/claude-tweaks:tidy`'s Merge action |
  ```

- [ ] **Step 7: Update the Component-Skill Contract paragraph**

  Replace:

  ```
  This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, and `/claude-tweaks:wrap-up` write to `specs/INBOX.md` directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.
  ```

  with:

  ```
  This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, and `/claude-tweaks:wrap-up` write a new `specs/backlog/{slug}.md` (`**Stage:** inbox`) directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.
  ```

- [ ] **Step 8: Update the Relationship-to-Other-Skills table's DEFERRED.md row**

  Replace:

  ```
  | `specs/DEFERRED.md` | Structured deferral for build/review work — carries origin, files, and triggers that INBOX doesn't |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | Structured deferral for build/review work — carries origin, files, and triggers that a fresh inbox-stage entry doesn't |
  ```

- [ ] **Step 9: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md" skills/capture/SKILL.md
  ```

  Expected: no output.

  ```bash
  grep -c "specs/backlog" skills/capture/SKILL.md
  ```

  Expected: a number ≥ 10.

- [ ] **Step 10: Commit**

  ```bash
  git add skills/capture/SKILL.md
  git commit -m "capture: write specs/backlog/{slug}.md entries instead of INBOX.md"
  ```

---

### Task 3: `/tidy` `scan-procedures.md` — collapse Steps 1+1.5, upgrade trigger judgment, drop Step 4.8a

**Files:**
- Modify: `skills/tidy/scan-procedures.md`

**Interfaces:**
- Consumes: the entry format from Task 1, the `/capture` write path from Task 2.
- Produces: the merged "Step 1" scan every reference in Task 4 (`tidy/SKILL.md`) must match (step numbering, collection prefixes `[inbox]`/`[deferred]`/`[unsynced]` are unchanged).

- [ ] **Step 1: Replace old Step 1 + Step 1.5 with one merged Step 1**

  Replace the entire block from `## Step 1: Audit the INBOX` through the line `An empty `specs/DEFERRED.md` (only the `# Deferred Work` header, no entries) produces no findings.` (i.e., delete the `## Step 1.5: Audit Deferred Work` header and everything under it, merging its content into a single Step 1) with:

  ```markdown
  ## Step 1: Audit the Backlog

  First, read the `backlog-backend` field from the project's CLAUDE.md (`## Backlog integration` section). A missing flag = `local-files`.

  **`backlog-backend: local-files` (or missing):** read every `specs/backlog/*.md` file once, and split entries by their `**Stage:**` field client-side — the same "one query, split by stage" pattern Step 4.8's `repo-wide` scan already uses for GitHub backlog issues.

  For entries with `**Stage:** inbox`, classify by age (`**Added:**` date):

  | Age | Classification | Default Recommendation |
  |-----|---------------|----------------------|
  | < 2 weeks | Fresh | Keep |
  | 2-4 weeks | Review | Keep (unless clearly stale) |
  | > 4 weeks | Stale | Delete or Promote |

  → Collect each as: `[inbox] {title} — {age} — {recommendation}`

  For entries with `**Stage:** parked`, judge the `**Trigger:**` field live — the same judgment `/claude-tweaks:tidy`'s "Sync to GitHub" action already applies on the GitHub side: parse as a date first (compare to today's date); if that fails, check whether it names file paths (checked against `git log`, same as "Sync to GitHub"'s `watchedPaths` handling); otherwise treat as free prose. Classify:

  | Trigger Status | Default Recommendation |
  |---------------|----------------------|
  | Date-shaped trigger, date has passed | Promote to spec or merge |
  | Path-shaped trigger, a named path has changed since `**Deferred:**` (per `git log`) | Promote to spec or merge |
  | Trigger not met (future date, or named paths unchanged), < 4 weeks since `**Deferred:**` | Keep |
  | Trigger not met, > 4 weeks | Re-evaluate or delete |
  | Prose trigger, no clear date/path condition | Move to inbox stage or delete |

  → Collect each as: `[deferred] {title} — from spec {N} — {recommendation}`

  **`backlog-backend: github-issues`:** the GitHub-side inbox and parked scans run inside Step 4.8's `repo-wide` backlog-issues query instead (one query shared across both stages, split client-side) — this step does not re-query GitHub. Instead, read every `specs/backlog/*.md` file and flag any found as unsynced — under this backend, a local backlog entry existing at all means an issue-creation write failed or a migration was declined, per the Resilient local fallback design:

  → Collect each as: `[unsynced] {title} — local-only, not yet mirrored to GitHub — Sync to GitHub`

  No entries in `specs/backlog/` (missing or empty directory) produces no findings.
  ```

  Do **not** include a trailing `## Step 2: Audit Existing Specs` line in the replacement — that header already exists in the file immediately after the old Step 1.5 block's last line, and is left untouched by this edit (the old_string for this replacement ends at "...produces no findings." for Step 1.5; the pre-existing Step 2 header right after it is outside the edited range). Adding it again in the new text would duplicate the header.

- [ ] **Step 2: Delete Step 4.8a entirely**

  Delete the whole subsection, from `### Step 4.8a: Code-health severity-policy reconciliation (one-time)` through the line ending `→ Collect each as: \`[gh-issue] #{n}: {title} — code-health:remembered backfill — Relabel + comment (severity-policy reconciliation)\`` (i.e., everything between the end of Step 4.8's main content and the `## Step 5: Spec Sizing Review` header). The file should read directly from Step 4.8's last paragraph into `## Step 5: Spec Sizing Review` with no Step 4.8a in between.

- [ ] **Step 3: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md\|Step 1.5\|4\.8a\|code-health:remembered" skills/tidy/scan-procedures.md
  ```

  Expected: no output.

  ```bash
  grep -n "^## Step" skills/tidy/scan-procedures.md
  ```

  Expected: `Step 1: Audit the Backlog`, `Step 2: Audit Existing Specs`, `Step 3: Audit Design Docs and Briefs`, `Step 4: Audit Execution Plans` — no `Step 1.5` line, no `Step 4.8a` line (Steps 4.5-5.5 use `###`/`##` headers already in the file and are untouched by this task).

- [ ] **Step 4: Commit**

  ```bash
  git add skills/tidy/scan-procedures.md
  git commit -m "tidy: merge Steps 1+1.5 into one backlog scan, upgrade trigger judgment, drop Step 4.8a"
  ```

---

### Task 4: `/tidy` `SKILL.md` — scope table, dispatch table, action vocabulary, aggressiveness table, verification checklist, relationship table

**Files:**
- Modify: `skills/tidy/SKILL.md`

**Interfaces:**
- Consumes: Task 3's merged Step 1 (this task's "Steps 1-4.8" table and "Scope Selection" table must describe that same merged step, not the old Step 1+1.5 pair).

- [ ] **Step 1: Update the Input section's default-scan description**

  Replace:

  ```
  `$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]]`. With no `--scope` argument, /tidy scans everything — `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope`.
  ```

  with:

  ```
  `$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]]`. With no `--scope` argument, /tidy scans everything — `specs/backlog/` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Step 1 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope`.
  ```

- [ ] **Step 2: Update the Scope Selection table's `inbox` row**

  Replace:

  ```
  | `inbox` | 1, 1.5 |
  ```

  with:

  ```
  | `inbox` | 1 |
  ```

- [ ] **Step 3: Update the parallel-dispatch blockquote's step list**

  Replace:

  ```
  > **Parallel execution:** Dispatch every step selected by the active scope (all of Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 for an unscoped/full run; a `--scope`-filtered subset otherwise, per "Scope Selection" above) as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After the selected parallel scans complete, run Step 5 and/or Step 5.5 sequentially when either is in scope — they depend on Step 2's spec scan results, which is why `patterns` alone still pulls in `specs` (per "Scope Selection" above). Assemble all findings into the Step 6 report.
  ```

  with:

  ```
  > **Parallel execution:** Dispatch every step selected by the active scope (all of Steps 1, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 for an unscoped/full run; a `--scope`-filtered subset otherwise, per "Scope Selection" above) as parallel Task agents — each scan is independent (Backlog, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After the selected parallel scans complete, run Step 5 and/or Step 5.5 sequentially when either is in scope — they depend on Step 2's spec scan results, which is why `patterns` alone still pulls in `specs` (per "Scope Selection" above). Assemble all findings into the Step 6 report.
  ```

- [ ] **Step 4: Update the Model tier blockquote's data-source list**

  Replace:

  ```
  > **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (INBOX file, DEFERRED file, spec directory, design-doc directory, plan directory, `git worktree list` + branches, REGISTRY, issue-claim refs + comments, gh PR/issue queries). No cross-cutting analysis at the per-scan level; Step 5/5.5 do the synthesis sequentially in the main thread.
  ```

  with:

  ```
  > **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (the `specs/backlog/` directory, spec directory, design-doc directory, plan directory, `git worktree list` + branches, REGISTRY, issue-claim refs + comments, gh PR/issue queries). No cross-cutting analysis at the per-scan level; Step 5/5.5 do the synthesis sequentially in the main thread.
  ```

- [ ] **Step 5: Update the tidy-specific column-semantics example**

  Replace:

  ```
  Path:Line = the artifact (`specs/INBOX.md:42`, `specs/DEFERRED.md`, `docs/REGISTRY.md`, worktree path);
  ```

  with:

  ```
  Path:Line = the artifact (`specs/backlog/{slug}.md`, `docs/REGISTRY.md`, worktree path);
  ```

- [ ] **Step 6: Update the Scan steps table's Step 1 row and delete the Step 1.5 row**

  Replace:

  ```
  | 1 | `specs/INBOX.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[inbox]` / `[unsynced]` |
  | 1.5 | `specs/DEFERRED.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[deferred]` / `[unsynced]` |
  ```

  with:

  ```
  | 1 | `specs/backlog/*.md` (`local-files`) or unsynced-check only (`github-issues` — see Step 4.8) | `[inbox]` / `[deferred]` / `[unsynced]` |
  ```

- [ ] **Step 7: Update the Action Vocabulary table's Defer, Sync to GitHub, and Capture rows**

  Replace:

  ```
  | **Defer** | Valid but not timely — park with a trigger condition | `local-files`: (1) add to `specs/DEFERRED.md` with `**Deferred:** {date} \| **From:** {source} \| **Trigger:** {condition}`, (2) remove from source. `github-issues`: (1) build the parked body via `parkedIssuePayload` (origin = the inbox issue's own reference, context carried over, trigger + options considered supplied at triage), write it to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (same check-then-create pattern as `backlog`), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach, (5) if the trigger names specific files, pass them as `watchedPaths` to `parkedIssuePayload` in step (1) so the generated body already carries `**Watched paths:**` | Yes (file) / issue stays open, relabeled (GitHub) |
  ```

  with:

  ```
  | **Defer** | Valid but not timely — park with a trigger condition | `local-files`: set `**Stage:** parked` and add `**From:** {source} \| **Trigger:** {condition}` fields (plus a `**Deferred:** {date}` line) to the existing `specs/backlog/{slug}.md` in place — no file removal, same file, updated. `github-issues`: (1) build the parked body via `parkedIssuePayload` (origin = the inbox issue's own reference, context carried over, trigger + options considered supplied at triage), write it to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (same check-then-create pattern as `backlog`), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach, (5) if the trigger names specific files, pass them as `watchedPaths` to `parkedIssuePayload` in step (1) so the generated body already carries `**Watched paths:**` | No (file, same file updated in place) / issue stays open, relabeled (GitHub) |
  ```

  Replace:

  ```
  | **Sync to GitHub** | A local `specs/INBOX.md`/`specs/DEFERRED.md` entry exists while `backlog-backend: github-issues` — mirror it to an issue now | INBOX entry: build via `inboxIssuePayload` (category parsed from the entry's `**Category:**` field), bootstrap labels, `gh issue create` with `backlog` + `backlog:category-<value>` labels. DEFERRED entry: judge trigger type live — names files → pass as `watchedPaths`; names a moment in time → build via `parkedIssuePayload` then attach/create a milestone; otherwise carry the prose `**Trigger:**` over unchanged. `specs/DEFERRED.md` carries no structured category field (unlike INBOX.md's `**Category:**` line) — judge category live from the entry's content, same four-value taxonomy — build via `parkedIssuePayload`, `gh issue create` with `backlog` + `parked` + category labels. Either way: remove the entry from the local file only after `gh issue create` confirms success. | Yes — moves to GitHub, removed from local file |
  ```

  with:

  ```
  | **Sync to GitHub** | A local `specs/backlog/{slug}.md` entry exists while `backlog-backend: github-issues` — mirror it to an issue now | Inbox-stage entry: build via `inboxIssuePayload` (category from the entry's `**Category:**` field), bootstrap labels, `gh issue create` with `backlog` + `backlog:category-<value>` labels. Parked-stage entry: judge trigger type live — names files → pass as `watchedPaths`; names a moment in time → build via `parkedIssuePayload` then attach/create a milestone; otherwise carry the prose `**Trigger:**` over unchanged — build via `parkedIssuePayload` (category from the entry's own `**Category:**` field, which every entry carries regardless of stage), `gh issue create` with `backlog` + `parked` + category labels. Either way: delete `specs/backlog/{slug}.md` only after `gh issue create` confirms success. | Yes — moves to GitHub, entry file deleted |
  ```

  Replace:

  ```
  | **Capture** | PR feedback or GitHub issue needs local follow-up | Add a structured entry to `specs/INBOX.md` referencing the PR/thread/issue URL | No — creates an INBOX entry |
  ```

  with:

  ```
  | **Capture** | PR feedback or GitHub issue needs local follow-up | Create a `specs/backlog/{slug}.md` entry (`**Stage:** inbox`) referencing the PR/thread/issue URL | No — creates a backlog entry |
  ```

- [ ] **Step 8: Update the verification-checklist example lines (Step 7.5)**

  Replace:

  ```
  - [x] Deleted: "{title}" — removed from INBOX
  - [x] Deferred: "{title}" — in DEFERRED.md (trigger: {condition}), removed from INBOX (`local-files`)
  - [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
  - [x] Synced to GitHub: "{title}" — issue #{n} created ({backlog|backlog+parked} labels), removed from {INBOX.md|DEFERRED.md}
  - [x] Merged: "{title}" → Spec {N} — integrated into Deliverables/AC, removed from INBOX
  - [x] Promoted: "{title}" — tagged in INBOX, still present
  - [x] Captured: "{title}" — added to INBOX with source URL (PR/thread/issue link)
  ```

  with:

  ```
  - [x] Deleted: "{title}" — `specs/backlog/{slug}.md` removed
  - [x] Deferred: "{title}" — `specs/backlog/{slug}.md` now `**Stage:** parked` (trigger: {condition}) (`local-files`)
  - [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
  - [x] Synced to GitHub: "{title}" — issue #{n} created ({backlog|backlog+parked} labels), `specs/backlog/{slug}.md` deleted
  - [x] Merged: "{title}" → Spec {N} — integrated into Deliverables/AC, `specs/backlog/{slug}.md` removed
  - [x] Promoted: "{title}" — tagged in `specs/backlog/{slug}.md`, still present
  - [x] Captured: "{title}" — new `specs/backlog/{slug}.md` with source URL (PR/thread/issue link)
  ```

- [ ] **Step 9: Update the Relationship-to-Other-Skills table's DEFERRED.md row**

  Replace:

  ```
  | `specs/DEFERRED.md` | /claude-tweaks:tidy audits deferred items — promotes, merges, moves to INBOX, or deletes |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | /claude-tweaks:tidy audits deferred items — promotes, merges, moves back to inbox stage, or deletes |
  ```

- [ ] **Step 10: Update the auto-mode-contract's Capture row rationale text (aggressiveness table)**

  Replace:

  ```
  | **Capture** (PR/issue → INBOX entry) | Stage | Stage | Stage — INBOX writes are on the auto-mode contract's never-silenced list |
  ```

  with:

  ```
  | **Capture** (PR/issue → backlog entry) | Stage | Stage | Stage — backlog inbox-entry writes are on the auto-mode contract's never-silenced list |
  ```

- [ ] **Step 11: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md\|Step 1\.5\|, 1\.5," skills/tidy/SKILL.md
  ```

  Expected: no output.

  ```bash
  grep -c "specs/backlog" skills/tidy/SKILL.md
  ```

  Expected: a number ≥ 8.

- [ ] **Step 12: Commit**

  ```bash
  git add skills/tidy/SKILL.md
  git commit -m "tidy: update SKILL.md scope/dispatch/action-vocabulary tables for specs/backlog/"
  ```

---

### Task 5: `/wrap-up` cluster — `SKILL.md`, `review-console.md`, `leftover-routing.md`

**Files:**
- Modify: `skills/wrap-up/SKILL.md:400`
- Modify: `skills/wrap-up/review-console.md:173, 196, 202-203`
- Modify: `skills/wrap-up/leftover-routing.md:24, 35, 41, 46`

- [ ] **Step 1: Update `wrap-up/SKILL.md`'s relationship-table row**

  Replace:

  ```
  | `specs/DEFERRED.md` | /claude-tweaks:wrap-up routes leftover work here (with origin spec, files, trigger) |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | /claude-tweaks:wrap-up routes leftover work here (with origin spec, files, trigger) |
  ```

- [ ] **Step 2: Update `review-console.md`'s Queue-writes section header and example strings**

  Replace:

  ```
  Render this section only when leftover routing or other steps have proposed writes to `specs/INBOX.md` or `specs/DEFERRED.md`. Each row gets its own prompt — bulk approval is forbidden per `_shared/auto-mode-contract.md`.

  | Q# | Destination | What | Source |
  |---|---|---|---|
  | Q1 | DEFERRED | "Add OAuth refresh edge case" — blocked on /auth provider docs | Step 4 leftover routing, section "Edge cases" |
  | Q2 | INBOX | "Investigate token rotation strategy" — surfaced by /reflect Step 3 | reflect insight stage file |
  ```

  with:

  ```
  Render this section only when leftover routing or other steps have proposed writes to `specs/backlog/` (new-file creates or `**Stage:**` changes). Each row gets its own prompt — bulk approval is forbidden per `_shared/auto-mode-contract.md`.

  | Q# | Destination | What | Source |
  |---|---|---|---|
  | Q1 | backlog (parked) | "Add OAuth refresh edge case" — blocked on /auth provider docs | Step 4 leftover routing, section "Edge cases" |
  | Q2 | backlog (inbox) | "Investigate token rotation strategy" — surfaced by /reflect Step 3 | reflect insight stage file |
  ```

- [ ] **Step 3: Update the per-`Q#` prompt template and its two example instantiations**

  Replace:

  ```
  For each `Q#` item, call `AskUserQuestion` with `question`: the queue-write line (e.g. `"Queue write Q1 → specs/DEFERRED.md: \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"`, `multiSelect`: `false`:
  - Option 1 — `label`: `"Apply"`, `description`: `"Write to {destination}: \"{content}\""`
  - Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
  - Option 3 — `label`: `"Edit"`, `description`: `"Modify before writing"`

  Applied to this example's two queue writes:
  - Q1 — `question`: `"Queue write Q1 → specs/DEFERRED.md: \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`, `header`: `"Queue write Q1"`; Option 1 description: `"Write to specs/DEFERRED.md: \"Add OAuth refresh edge case\" — blocked on /auth provider docs"`
  - Q2 — `question`: `"Queue write Q2 → specs/INBOX.md: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3."`, `header`: `"Queue write Q2"`; Option 1 description: `"Write to specs/INBOX.md: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3"`
  ```

  with:

  ```
  For each `Q#` item, call `AskUserQuestion` with `question`: the queue-write line (e.g. `"Queue write Q1 → specs/backlog/add-oauth-refresh-edge-case.md (Stage: parked): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"`, `multiSelect`: `false`:
  - Option 1 — `label`: `"Apply"`, `description`: `"Write to {destination}: \"{content}\""`
  - Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
  - Option 3 — `label`: `"Edit"`, `description`: `"Modify before writing"`

  Applied to this example's two queue writes:
  - Q1 — `question`: `"Queue write Q1 → specs/backlog/add-oauth-refresh-edge-case.md (Stage: parked): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`, `header`: `"Queue write Q1"`; Option 1 description: `"Write to specs/backlog/add-oauth-refresh-edge-case.md (Stage: parked): \"Add OAuth refresh edge case\" — blocked on /auth provider docs"`
  - Q2 — `question`: `"Queue write Q2 → specs/backlog/investigate-token-rotation-strategy.md (Stage: inbox): \"Investigate token rotation strategy\" — surfaced by /reflect Step 3."`, `header`: `"Queue write Q2"`; Option 1 description: `"Write to specs/backlog/investigate-token-rotation-strategy.md (Stage: inbox): \"Investigate token rotation strategy\" — surfaced by /reflect Step 3"`
  ```

- [ ] **Step 4: Update `leftover-routing.md`'s auto-mode-policy line, the per-item option-labels line, routing option 2, and the rough-guidance sentence**

  Replace:

  ```
  3. Do NOT write to `specs/DEFERRED.md` or `specs/INBOX.md` autonomously — those writes happen at the Wrap-Up Review Console (Step 8.6) after explicit user approval
  ```

  with:

  ```
  3. Do NOT write to `specs/backlog/` autonomously — those writes happen at the Wrap-Up Review Console (Step 8.6) after explicit user approval
  ```

  Replace:

  ```
  | 1 | {section} | partial | {specific blocker} | 1: merge to spec X / 2: DEFERRED.md / 3: INBOX / 4: drop / 5: finish now |
  ```

  with:

  ```
  | 1 | {section} | partial | {specific blocker} | 1: merge to spec X / 2: parked (specs/backlog/) / 3: inbox (specs/backlog/) / 4: drop / 5: finish now |
  ```

  Replace:

  ```
  2. **Add to `specs/DEFERRED.md`** — work needs its own context (include origin spec, files, trigger)
  3. **Create a new INBOX item** — genuinely new idea discovered during implementation, not part of this spec's planned scope
  ```

  with:

  ```
  2. **Create a `specs/backlog/{slug}.md` entry with `**Stage:** parked`** — work needs its own context (include origin spec, files, trigger)
  3. **Create a `specs/backlog/{slug}.md` entry with `**Stage:** inbox`** — genuinely new idea discovered during implementation, not part of this spec's planned scope
  ```

  Replace:

  ```
  Wait for per-item response. Do not bulk-route. Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid destinations and the user picks per item — but no entry is written to either file without explicit per-item confirmation. Rough guidance: DEFERRED.md fits sections with a clear trigger; INBOX.md fits captured ideas without a specific trigger yet.
  ```

  with:

  ```
  Wait for per-item response. Do not bulk-route. Both `**Stage:** parked` and `**Stage:** inbox` are valid destinations within `specs/backlog/` and the user picks per item — but no entry is written without explicit per-item confirmation. Rough guidance: `**Stage:** parked` fits sections with a clear trigger; `**Stage:** inbox` fits captured ideas without a specific trigger yet.
  ```

- [ ] **Step 5: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md" skills/wrap-up/SKILL.md skills/wrap-up/review-console.md skills/wrap-up/leftover-routing.md
  ```

  Expected: no output.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/wrap-up/SKILL.md skills/wrap-up/review-console.md skills/wrap-up/leftover-routing.md
  git commit -m "wrap-up: route leftover work to specs/backlog/ instead of INBOX.md/DEFERRED.md"
  ```

---

### Task 6: `/ledger` cluster — `SKILL.md`, `resolve-gate.md`

**Files:**
- Modify: `skills/ledger/SKILL.md:68`
- Modify: `skills/ledger/resolve-gate.md:52-53, 62, 69-70, 89-90`

- [ ] **Step 1: Update `ledger/SKILL.md`'s status-lifecycle line**

  Replace:

  ```
  open → deferred      (routed to DEFERRED.md with origin, files, and trigger)
  ```

  with:

  ```
  open → deferred      (routed to a specs/backlog/{slug}.md entry with Stage: parked, origin, files, and trigger)
  ```

- [ ] **Step 2: Update `resolve-gate.md`'s Phase 2 rough-guidance bullets**

  Replace:

  ```
  - **DEFERRED.md** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
  - **INBOX.md** when the item is a captured idea without a specific trigger yet — to be triaged later
  ```

  with:

  ```
  - **`**Stage:** parked`** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
  - **`**Stage:** inbox`** when the item is a captured idea without a specific trigger yet — to be triaged later
  ```

- [ ] **Step 3: Update the Step 1 drill's "Route to a doc" option description**

  Replace:

  ```
  - Option 2 — `label`: `"Route to a doc"`, `description`: `"Defer to specs/DEFERRED.md or capture to specs/INBOX.md"`
  ```

  with:

  ```
  - Option 2 — `label`: `"Route to a doc"`, `description`: `"Defer (specs/backlog/, Stage: parked) or capture (specs/backlog/, Stage: inbox)"`
  ```

- [ ] **Step 4: Update the Step 2a drill's two option descriptions**

  Replace:

  ```
  - Option 1 — `label`: `"Defer"`, `description`: `"To specs/DEFERRED.md — has a trigger condition for when to revisit"`
  - Option 2 — `label`: `"Send to INBOX"`, `description`: `"To specs/INBOX.md — captured for later evaluation, no specific trigger yet"`
  ```

  with:

  ```
  - Option 1 — `label`: `"Defer"`, `description`: `"To specs/backlog/{slug}.md (Stage: parked) — has a trigger condition for when to revisit"`
  - Option 2 — `label`: `"Send to Inbox"`, `description`: `"To specs/backlog/{slug}.md (Stage: inbox) — captured for later evaluation, no specific trigger yet"`
  ```

- [ ] **Step 5: Update Phase 3's apply-decision bullets**

  Replace:

  ```
  - `Defer to DEFERRED.md` → append entry with origin (this pipeline), affected files, and the user-stated trigger. Update ledger status to `deferred`
  - `Send to INBOX.md` → append entry with origin (this pipeline) and short context. Update ledger status to `deferred` (with note `→ INBOX.md` in Resolution column)
  ```

  with:

  ```
  - `Defer` → create `specs/backlog/{slug}.md` with `**Stage:** parked`, origin (this pipeline), affected files, and the user-stated trigger. Update ledger status to `deferred`
  - `Send to Inbox` → create `specs/backlog/{slug}.md` with `**Stage:** inbox`, origin (this pipeline), and short context. Update ledger status to `deferred` (with note `→ backlog (inbox)` in Resolution column)
  ```

- [ ] **Step 6: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md\|DEFERRED\.md\b\|INBOX\.md\b" skills/ledger/SKILL.md skills/ledger/resolve-gate.md
  ```

  Expected: no output.

- [ ] **Step 7: Commit**

  ```bash
  git add skills/ledger/SKILL.md skills/ledger/resolve-gate.md
  git commit -m "ledger: route resolve-gate defer/inbox writes to specs/backlog/"
  ```

---

### Task 7: `/reflect` cluster — `SKILL.md`, `hindsight-mode.md`, `full-mode.md`

**Files:**
- Modify: `skills/reflect/hindsight-mode.md:52`
- Modify: `skills/reflect/full-mode.md:71`
- Modify: `skills/reflect/SKILL.md:183`

- [ ] **Step 1: Update `hindsight-mode.md`'s Defer bullet**

  Replace:

  ```
  - **Defer** (DEFERRED.md) — the improvement is understood but it's bigger and not relevant to the current work. Include origin, files, trigger.
  ```

  with:

  ```
  - **Defer** (`specs/backlog/`, `**Stage:** parked`) — the improvement is understood but it's bigger and not relevant to the current work. Include origin, files, trigger.
  ```

- [ ] **Step 2: Update `full-mode.md`'s Defer bullet**

  Replace:

  ```
  - **Defer** (DEFERRED.md) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Include origin, context, trigger.
  ```

  with:

  ```
  - **Defer** (`specs/backlog/`, `**Stage:** parked`) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Include origin, context, trigger.
  ```

- [ ] **Step 3: Update `SKILL.md`'s relationship-table row**

  Replace:

  ```
  | `specs/DEFERRED.md` | /reflect routes deferred improvements here (with origin, files, trigger) |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | /reflect routes deferred improvements here (with origin, files, trigger) |
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "DEFERRED\.md" skills/reflect/hindsight-mode.md skills/reflect/full-mode.md skills/reflect/SKILL.md
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/reflect/hindsight-mode.md skills/reflect/full-mode.md skills/reflect/SKILL.md
  git commit -m "reflect: route Defer to specs/backlog/ (Stage: parked)"
  ```

---

### Task 8: `/review` cluster — `SKILL.md`, `step3-routing.md`

**Files:**
- Modify: `skills/review/step3-routing.md:103, 135`
- Modify: `skills/review/SKILL.md:468`

- [ ] **Step 1: Update `step3-routing.md`'s Defer bullet**

  Replace:

  ```
  - **Defer** (DEFERRED.md) — the fix is understood but it's bigger and not relevant to the current work. Include origin spec, affected files, and trigger for when to revisit.
  ```

  with:

  ```
  - **Defer** (`specs/backlog/`, `**Stage:** parked`) — the fix is understood but it's bigger and not relevant to the current work. Include origin spec, affected files, and trigger for when to revisit.
  ```

- [ ] **Step 2: Update the ledger-status-mapping sentence**

  Replace:

  ```
  ...Status: `open` for "Fix now" items, `deferred` for DEFERRED.md routes, `accepted` for "Don't fix" items...
  ```

  with:

  ```
  ...Status: `open` for "Fix now" items, `deferred` for `**Stage:** parked` routes, `accepted` for "Don't fix" items...
  ```

- [ ] **Step 3: Update `SKILL.md`'s relationship-table row**

  Replace:

  ```
  | `specs/DEFERRED.md` | /claude-tweaks:review routes implementation-related deferrals here (with origin, files, trigger) |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | /claude-tweaks:review routes implementation-related deferrals here (with origin, files, trigger) |
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "DEFERRED\.md" skills/review/step3-routing.md skills/review/SKILL.md
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/review/step3-routing.md skills/review/SKILL.md
  git commit -m "review: route Defer to specs/backlog/ (Stage: parked)"
  ```

---

### Task 9: `/challenge` + `/specify`

**Files:**
- Modify: `skills/challenge/SKILL.md:38`
- Modify: `skills/specify/SKILL.md:62, 345`

- [ ] **Step 1: Update `challenge/SKILL.md`'s input-resolution case 1**

  Replace:

  ```
  1. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md` and use it as the problem statement
  ```

  with:

  ```
  1. **Backlog reference** (e.g., `"Voice shopping list"`) — find the matching `specs/backlog/{slug}.md` file (`**Stage:** inbox`) and use its body as the problem statement
  ```

- [ ] **Step 2: Update `specify/SKILL.md`'s input-resolution case 5**

  Replace:

  ```
  5. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md`, then check if a design doc exists for it. If found, read it. If not found, treat as a topic name (case 4 — invoke `/superpowers:brainstorming`).
  ```

  with:

  ```
  5. **Backlog reference** (e.g., `"Voice shopping list"`) — find the matching `specs/backlog/{slug}.md` entry (`**Stage:** inbox`), then check if a design doc exists for it. If found, read it. If not found, treat as a topic name (case 4 — invoke `/superpowers:brainstorming`).
  ```

- [ ] **Step 3: Update `specify/SKILL.md` Step 8 (Clean Up INBOX)**

  Replace:

  ```
  ## Step 8: Clean Up INBOX

  If the work originated from an INBOX item:

  - Remove the entry from `specs/INBOX.md`
  - It has been promoted — the specs are the durable artifact now
  ```

  with:

  ```
  ## Step 8: Clean Up the Backlog Entry

  If the work originated from a `specs/backlog/` entry:

  - Delete the `specs/backlog/{slug}.md` file
  - It has been promoted — the specs are the durable artifact now
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "specs/INBOX\.md" skills/challenge/SKILL.md skills/specify/SKILL.md
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/challenge/SKILL.md skills/specify/SKILL.md
  git commit -m "challenge, specify: resolve backlog references from specs/backlog/"
  ```

---

### Task 10: `/help` cluster — `SKILL.md`, `reference-card.md`, `status-scan.md`, `context-flow.md`

**Files:**
- Modify: `skills/help/SKILL.md:134`
- Modify: `skills/help/reference-card.md:159-162`
- Modify: `skills/help/status-scan.md:19, 26, 28, 36`
- Modify: `skills/help/context-flow.md:25, 29, 47, 48, 49, 65`

- [ ] **Step 1: Update `help/SKILL.md`'s relationship-table row**

  Replace:

  ```
  | `specs/DEFERRED.md` | /claude-tweaks:help scans deferred items and flags those with met triggers |
  ```

  with:

  ```
  | `specs/backlog/*.md` (`**Stage:** parked`) | /claude-tweaks:help scans deferred items and flags those with met triggers |
  ```

- [ ] **Step 2: Update `reference-card.md`'s doctrine-preserved bullet**

  Replace:

  ```
  **Doctrine preserved (still per-item user input, even in auto):**
  - Ledger resolve gate Phase 2 (open items)
  - `specs/INBOX.md` / `specs/DEFERRED.md` writes
  - `/challenge` lenses
  - `/init` Phase 4 / 8 / 9 governance gates
  - All HARD-GATE / BLOCKED / STOP conditions
  ```

  with:

  ```
  **Doctrine preserved (still per-item user input, even in auto):**
  - Ledger resolve gate Phase 2 (open items)
  - `specs/backlog/` writes (inbox or parked stage)
  - `/challenge` lenses
  - `/init` Phase 4 / 8 / 9 governance gates
  - All HARD-GATE / BLOCKED / STOP conditions
  ```

- [ ] **Step 3: Update `status-scan.md`'s example row and two stage headers**

  Replace:

  ```
  > | medium | specs/INBOX.md | 14 items, 3 stale | lines 12, 28, 41 are 4+ weeks old |
  ```

  with:

  ```
  > | medium | specs/backlog/ | 14 items, 3 stale | 3 entries' `**Added:**` dates are 4+ weeks old |
  ```

  Replace:

  ```
  **Dispatcher column mapping (status-scan use):** Severity = recommendation urgency (`info` for nothing-to-do, `low` for routine, `medium` for needs-attention, `high` for blocking). Path:Line = the artifact (`specs/INBOX.md:42`, `docs/journeys/checkout.md`, etc.). Finding = the count or flag (`14 items, 3 stale`). Evidence = the specific items or signals.

  ## Stage 1: INBOX (`specs/INBOX.md`)
  ```

  with:

  ```
  **Dispatcher column mapping (status-scan use):** Severity = recommendation urgency (`info` for nothing-to-do, `low` for routine, `medium` for needs-attention, `high` for blocking). Path:Line = the artifact (`specs/backlog/{slug}.md`, `docs/journeys/checkout.md`, etc.). Finding = the count or flag (`14 items, 3 stale`). Evidence = the specific items or signals.

  ## Stage 1: INBOX (`specs/backlog/*.md`, `**Stage:** inbox`)
  ```

  Replace:

  ```
  ## Stage 1.5: Deferred Work (`specs/DEFERRED.md`)
  ```

  with:

  ```
  ## Stage 1.5: Deferred Work (`specs/backlog/*.md`, `**Stage:** parked`)
  ```

- [ ] **Step 4: Update `context-flow.md`'s ASCII diagram, `/init`/`/capture`/`/challenge` Reads/Writes rows, and `/wrap-up`'s Writes column**

  Replace:

  ```
  Codebase                     ──→ Findings cache               ──→ GitHub Issues (durable)         ──→ Triage + Build pipeline
  .claude-tweaks/code-health/      .claude-tweaks/code-health/      gh issues (label: code-health)      /claude-tweaks:triage → /flow #{issue}
    /code-health                   cache.json + runs/               ↓ (or)                              specs/NN-*.md via /specify
                                                                    INBOX / /specify                    /build
  ```
  ```

  with:

  ```
  Codebase                     ──→ Findings cache               ──→ GitHub Issues (durable)         ──→ Triage + Build pipeline
  .claude-tweaks/code-health/      .claude-tweaks/code-health/      gh issues (label: code-health)      /claude-tweaks:triage → /flow #{issue}
    /code-health                   cache.json + runs/               ↓ (or)                              specs/NN-*.md via /specify
                                                                    specs/backlog/ / /specify           /build
  ```
  ```

  Replace:

  ```
  INBOX item          ──→ Brief               ──→ Design Doc          ──→ Spec              ──→ Code + Journey
  specs/INBOX.md         docs/plans/*-brief.md   docs/superpowers/specs/*-design.md  specs/NN-*.md         src/ + docs/journeys/
    /capture               /challenge              /superpowers:brainstorming            /specify              /build
                                                                           ↓                     ↓
                                                                     (deletes brief           Deferred items
                                                                      + design doc)           specs/DEFERRED.md
  ```
  ```

  with:

  ```
  Backlog entry (inbox)  ──→ Brief               ──→ Design Doc          ──→ Spec              ──→ Code + Journey
  specs/backlog/*.md        docs/plans/*-brief.md   docs/superpowers/specs/*-design.md  specs/NN-*.md         src/ + docs/journeys/
    /capture               /challenge              /superpowers:brainstorming            /specify              /build
                                                                           ↓                     ↓
                                                                     (deletes brief           Deferred items
                                                                      + design doc)           specs/backlog/ (Stage: parked)
  ```
  ```

  Replace:

  ```
  | `/init` | `~/.claude/plugins/`, entire codebase, CLAUDE.md, config files, git state | `specs/`, `docs/plans/`, `docs/journeys/`, `specs/INBOX.md`, `specs/DEFERRED.md`, `specs/INDEX.md`, CLAUDE.md, `.claude/skills/*.md`, `.claude/rules/`, `docs/journeys/*.md` | — |
  | `/capture` | — | `specs/INBOX.md` (append) | — |
  | `/challenge` | `specs/INBOX.md` | `docs/plans/*-brief.md` | — |
  ```

  with:

  ```
  | `/init` | `~/.claude/plugins/`, entire codebase, CLAUDE.md, config files, git state | `specs/`, `docs/plans/`, `docs/journeys/`, `specs/backlog/`, `specs/INDEX.md`, CLAUDE.md, `.claude/skills/*.md`, `.claude/rules/`, `docs/journeys/*.md` | — |
  | `/capture` | — | `specs/backlog/{slug}.md` (create, `**Stage:** inbox`) | — |
  | `/challenge` | `specs/backlog/*.md` | `docs/plans/*-brief.md` | — |
  ```

  Replace:

  ```
  | `/wrap-up` | `specs/NN-*.md`, review output, plan files, ledger, `.claude/skills/*.md` (relevant skills from ledger entries) | CLAUDE.md updates, skill updates, `DEFERRED.md`, `docs/decisions/*.md` (ADRs, Step 6.3). Invokes `/reflect` (full mode). | Spec file, plan files, ledger |
  ```

  with:

  ```
  | `/wrap-up` | `specs/NN-*.md`, review output, plan files, ledger, `.claude/skills/*.md` (relevant skills from ledger entries) | CLAUDE.md updates, skill updates, `specs/backlog/{slug}.md` (create/update, `**Stage:** parked`), `docs/decisions/*.md` (ADRs, Step 6.3). Invokes `/reflect` (full mode). | Spec file, plan files, ledger |
  ```

- [ ] **Step 5: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md" skills/help/SKILL.md skills/help/reference-card.md skills/help/status-scan.md skills/help/context-flow.md
  ```

  Expected: no output.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/help/SKILL.md skills/help/reference-card.md skills/help/status-scan.md skills/help/context-flow.md
  git commit -m "help: update pipeline-status references to specs/backlog/"
  ```

---

### Task 11: `/visual-review`, `/flow` cluster, `_shared/auto-mode-contract.md`

**Files:**
- Modify: `skills/visual-review/browser-review.md:430, 436`
- Modify: `skills/flow/manifesto.md:93, 113`
- Modify: `skills/flow/SKILL.md:322`
- Modify: `skills/_shared/auto-mode-contract.md:132, 174-175`

- [ ] **Step 1: Update `browser-review.md`'s two Defer bullets**

  Replace:

  ```
  - **Defer** (DEFERRED.md) — the fix is understood but bigger and not relevant to the current work. Include origin, affected files, trigger.
  ```

  with:

  ```
  - **Defer** (`specs/backlog/`, `**Stage:** parked`) — the fix is understood but bigger and not relevant to the current work. Include origin, affected files, trigger.
  ```

  Replace:

  ```
  - **Defer** (DEFERRED.md) — the idea is clear but bigger and not relevant to the current work.
  ```

  with:

  ```
  - **Defer** (`specs/backlog/`, `**Stage:** parked`) — the idea is clear but bigger and not relevant to the current work.
  ```

- [ ] **Step 2: Update `manifesto.md`'s Leftover-routing lever row and override-semantics row**

  Replace:

  ```
  | 5 | Leftover routing | **defer** | **defer** / inbox / drop | Unfinished sections → DEFERRED.md (reversible at Review Console) |
  ```

  with:

  ```
  | 5 | Leftover routing | **defer** | **defer** / inbox / drop | Unfinished sections → specs/backlog/ (Stage: parked), reversible at Review Console |
  ```

  Replace:

  ```
  | Leftover routing | `inbox` | Unfinished sections route to `specs/INBOX.md` instead of DEFERRED.md |
  ```

  with:

  ```
  | Leftover routing | `inbox` | Unfinished sections route to `specs/backlog/` (Stage: inbox) instead of Stage: parked |
  ```

- [ ] **Step 3: Update `flow/SKILL.md`'s anti-pattern row**

  Replace:

  ```
  | Writing to `specs/INBOX.md` or `specs/DEFERRED.md` from inside flow without explicit per-item user approval | Both files are valid destinations, but each entry requires the user's explicit choice on that specific item. Pipeline phases never write to either file autonomously, even when an item looks like an obvious candidate |
  ```

  with:

  ```
  | Writing to `specs/backlog/` from inside flow without explicit per-item user approval | Both inbox and parked stages are valid destinations, but each entry requires the user's explicit choice on that specific item. Pipeline phases never write to the backlog autonomously, even when an item looks like an obvious candidate |
  ```

- [ ] **Step 4: Update `_shared/auto-mode-contract.md`'s Never-reversible list and What-auto-does-NOT-silence table**

  Replace:

  ```
  - Writing to `specs/DEFERRED.md` or `specs/INBOX.md`
  ```

  with:

  ```
  - Writing to `specs/backlog/`
  ```

  Replace:

  ```
  | `specs/INBOX.md` writes | Each entry needs explicit user approval — INBOX is the user's queue, not the model's |
  | `specs/DEFERRED.md` writes | Same — deferral is a user decision |
  ```

  with:

  ```
  | `specs/backlog/` writes (inbox stage) | Each entry needs explicit user approval — the backlog is the user's queue, not the model's |
  | `specs/backlog/` writes (parked stage) | Same — deferral is a user decision |
  ```

- [ ] **Step 5: Verify**

  ```bash
  grep -n "specs/INBOX\.md\|specs/DEFERRED\.md\|DEFERRED\.md" skills/visual-review/browser-review.md skills/flow/manifesto.md skills/flow/SKILL.md skills/_shared/auto-mode-contract.md
  ```

  Expected: no output.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/visual-review/browser-review.md skills/flow/manifesto.md skills/flow/SKILL.md skills/_shared/auto-mode-contract.md
  git commit -m "visual-review, flow, auto-mode-contract: route Defer/leftover writes to specs/backlog/"
  ```

---

### Task 12: `bin/lib/issues/backlog.js` comment + `README.md`

**Files:**
- Modify: `bin/lib/issues/backlog.js:32` (comment only — no logic change)
- Modify: `README.md:120`

**Interfaces:**
- Consumes: nothing new — `inboxIssuePayload`/`parkedIssuePayload` function signatures are unchanged; this task touches only a comment.

- [ ] **Step 1: Update the `parkedIssuePayload` doc-comment's illustrative example**

  In `bin/lib/issues/backlog.js`, replace:

  ```
  // Returns { title, body, labels } for a fresh parked issue (e.g. DEFERRED.md migration).
  ```

  with:

  ```
  // Returns { title, body, labels } for a fresh parked issue (e.g. migrating a
  // specs/backlog/{slug}.md entry with Stage: parked).
  ```

- [ ] **Step 2: Update `README.md`'s `/capture` description**

  Replace:

  ```
  **`/claude-tweaks:capture`** — Brain-dump an idea into `specs/INBOX.md`. Accepts free-text — no structure needed. Ideas are triaged later by `/claude-tweaks:tidy` or pulled into the pipeline by `/claude-tweaks:challenge`.
  ```

  with:

  ```
  **`/claude-tweaks:capture`** — Brain-dump an idea into `specs/backlog/` (creates a new entry with `**Stage:** inbox`). Accepts free-text — no structure needed. Ideas are triaged later by `/claude-tweaks:tidy` or pulled into the pipeline by `/claude-tweaks:challenge`.
  ```

- [ ] **Step 3: Run the existing `backlog.js` test suite to confirm the comment-only change didn't break anything**

  Run: `node --test bin/lib/issues/tests/backlog.test.js`

  Expected: all tests pass (this is a comment-only change; the test suite should be unaffected — this step is a regression check, not new-behavior verification).

- [ ] **Step 4: Verify the doc changes**

  ```bash
  grep -n "DEFERRED\.md\|specs/INBOX\.md" bin/lib/issues/backlog.js README.md
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add bin/lib/issues/backlog.js README.md
  git commit -m "backlog.js, README: update comment/doc examples to specs/backlog/"
  ```

---

### Task 13: Whole-repo verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Re-run the original broad grep that scoped this plan**

  ```bash
  grep -rl "INBOX\.md\|DEFERRED\.md" skills/ bin/ CLAUDE.md README.md
  ```

  Expected: no output (every one of the 27 originally-flagged files has been updated by Tasks 1-12; the original grep pattern should now return zero files).

- [ ] **Step 2: Re-run the broader non-`.md`-anchored sweep to catch any remaining literal two-file mechanism references**

  ```bash
  grep -rn "specs/ *INBOX\b\|specs/ *DEFERRED\b" skills/ bin/ CLAUDE.md README.md
  ```

  Expected: no output.

- [ ] **Step 3: Confirm the new format is referenced across every touched skill**

  ```bash
  grep -rl "specs/backlog" skills/ bin/ README.md | sort
  ```

  Expected: at least these files appear (one line each): `skills/init/bootstrap-steps.md`, `skills/init/SKILL.md`, `skills/init/summary-templates.md`, `skills/init/docs-structure.md`, `skills/init/claude-md-template.md`, `skills/capture/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/tidy/SKILL.md`, `skills/wrap-up/SKILL.md`, `skills/wrap-up/review-console.md`, `skills/wrap-up/leftover-routing.md`, `skills/ledger/SKILL.md`, `skills/ledger/resolve-gate.md`, `skills/reflect/hindsight-mode.md`, `skills/reflect/full-mode.md`, `skills/reflect/SKILL.md`, `skills/review/step3-routing.md`, `skills/review/SKILL.md`, `skills/challenge/SKILL.md`, `skills/specify/SKILL.md`, `skills/help/SKILL.md`, `skills/help/reference-card.md`, `skills/help/status-scan.md`, `skills/help/context-flow.md`, `skills/visual-review/browser-review.md`, `skills/flow/manifesto.md`, `skills/flow/SKILL.md`, `skills/_shared/auto-mode-contract.md`, `bin/lib/issues/backlog.js`, `README.md`.

- [ ] **Step 4: Confirm `code-health`'s unrelated `remembered` cache mechanism is untouched**

  ```bash
  git diff --stat main -- bin/code-health.js bin/lib/code-health/ skills/code-health/
  ```

  Expected: no output (zero changes to any code-health file — this plan never touches that subsystem).

- [ ] **Step 5: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: same baseline as this worktree's own starting point (713/714 passing, with the one pre-existing, unrelated `statusline.test.js` timing flake as the sole failure) — no new failures introduced by this plan's doc-only + one-comment changes.

- [ ] **Step 6: Final commit (if Step 1-5 surfaced any straggler fix)**

  If verification in Steps 1-4 found any remaining reference requiring a fix, make the fix now, re-run Steps 1-4, then:

  ```bash
  git add -A
  git commit -m "backlog-entry-unification: fix straggler INBOX.md/DEFERRED.md references found by whole-repo sweep"
  ```

  If Steps 1-4 found nothing, skip this commit — Task 13 is verification-only and may close with no new commit.

## Self-Review Notes

- **Spec coverage:** Solution A (entry format + directory) → Tasks 1, 2. Solution B (`/tidy` Steps 1+1.5 collapse) → Task 3. Solution C (drop `code-health:remembered`/Step 4.8a) → Task 3, Step 2. Solution D (no auto-migration) → explicitly called out in Global Constraints; no task writes a migration script. All four Testing/verification scenarios from the design doc are covered: capture-creates-inbox-entry (Task 2), defer-flips-stage-in-place (Task 4, Action Vocabulary Defer row), tidy-reads-one-glob-with-live-trigger-judgment (Task 3), and code-health:remembered-no-longer-runs (Task 3 Step 2 + Task 13 Step 4).
- **No placeholders:** every edit above is a literal before/after text block copied from (or precisely derived from) the actual current file content read during pre-planning; no task defers detail to "similar to Task N" or "add appropriate handling."
- **Type/name consistency:** `specs/backlog/{slug}.md`, `**Stage:** inbox | parked`, `**Category:**` (always present), and the slug-derivation rule are used identically across all 13 tasks — cross-checked against the Global Constraints block.
- **Bucket C resolution:** both ambiguities the pre-planning investigation flagged (`bootstrap-steps.md:776`'s and `tidy/SKILL.md:117`'s "judge category live from content" logic) are resolved by deletion, not by porting forward — Category is always set at capture time per the design doc's own entry format, so no live-judgment step is needed. This is called out explicitly in Global Constraints and in Task 1 Step 4 / Task 4 Step 7.
- **Scope discipline:** the broader non-`.md`-anchored grep run during planning (catching `bootstrap-steps.md:35`'s "Spec files and INBOX" and `tidy/SKILL.md:62`'s "INBOX file, DEFERRED file") found two genuine misses beyond the original 27-file list, both folded into Tasks 1 and 4. Generic conceptual uses of "INBOX" as a noun (e.g. `init/SKILL.md`'s "Priority 2-3 → INBOX" routing-table cells, `code-health/SKILL.md`'s unrelated INBOX-vs-file-issue routing) were deliberately left untouched — rewriting the plugin's entire vocabulary for "an idea awaiting triage" is out of scope for a storage-shape change, and `code-health`'s own `remembered` cache status is a distinct, currently-active mechanism this design does not touch.
