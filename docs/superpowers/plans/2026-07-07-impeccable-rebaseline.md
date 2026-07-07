# Impeccable Re-baseline and Hook Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring claude-tweaks' Impeccable integration docs in line with Impeccable's current behavior (skill 3.9.1, up from the 3.0.6 baseline they were written against), and add a documented, safe path to adopt Impeccable's new automatic design hook.

**Architecture:** Pure documentation changes to existing skill markdown files — no code, no new files except this plan and its source spec. Every edit is either (a) a mechanical correction of a stale fact, (b) new procedural content following this project's existing prompt/table conventions, or (c) a cross-reference note. Verification is grep-based and `npm test`, since there is no executable surface to unit-test.

**Tech Stack:** Markdown only. `npm test` (Node's built-in `node --test` runner) as the regression check. `npx impeccable` CLI for the one live fact-check in Task 4.

## Global Constraints

- No source code is touched — every task edits `.md` files only.
- Never blanket-ignore `.impeccable/` in any `.gitignore` suggestion — `.impeccable/config.json` is Impeccable's committed, shared config; only `config.local.json`, `hook.cache.json`, and `hook.pending.json` are per-developer local state.
- Every new user-facing prompt must follow this project's numbered-options + `**(Recommended)**` convention (see any existing Step 0.9-style prompt in `bootstrap-steps.md` for the exact style).
- `CHANGELOG.md` is a historical record — do not edit its past-tense mentions of `teach`, even though the command has been renamed. Historical entries describe what was true when that version shipped.
- The command is `/impeccable:impeccable init` going forward (deprecated alias: `/impeccable:impeccable teach`, still functional — mention it only where doing so adds value, not everywhere).
- No new CLAUDE.md flag is introduced for the hook toggle — Impeccable's own `.impeccable/config.local.json` is the on/off state, checked by Impeccable itself, not by this wrapper.

---

### Task 1: `.gitignore` suggestions — add Impeccable's local hook state

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (Step 0.4, lines ~100–111)

**Interfaces:**
- Consumes: N/A (first task, no dependencies)
- Produces: the three file paths (`.impeccable/config.local.json`, `.impeccable/hook.cache.json`, `.impeccable/hook.pending.json`) that Task 3 and Task 6 will reference by name — keep these exact strings consistent in later tasks.

- [ ] **Step 1: Confirm current content is unchanged**

Run: `grep -n "claude-tweaks: transient artifacts" -A 8 skills/init/bootstrap-steps.md`

Expected output (the gitignore block, verifying nothing has drifted since this plan was written):
```
101:# claude-tweaks: transient artifacts
102:screenshots/
103:.worktrees/
104:stories/auth.yml
105:.claude-tweaks/pipelines/
106:.claude-tweaks/research/
107:.claude-tweaks/code-health/
108:.claude-tweaks/routine-environment-cache.yml
109:```
110:
111:These entries ignore claude-tweaks' transient, project-local state
```

If line numbers differ, that's fine — just confirm the text content matches before editing.

- [ ] **Step 2: Edit the gitignore block and its explanatory paragraph**

Old string:
```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
stories/auth.yml
.claude-tweaks/pipelines/
.claude-tweaks/research/
.claude-tweaks/code-health/
.claude-tweaks/routine-environment-cache.yml
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, code-health's own cache/cursor state (`code-health/cache.json`, `code-health/cursors.json`, `code-health/runs/`, see `skills/code-health/SKILL.md` and `bin/lib/code-health/cache.js`), and the routine-environment-resolution cache (see `skills/routine/SKILL.md`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry.

New string:
```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
stories/auth.yml
.claude-tweaks/pipelines/
.claude-tweaks/research/
.claude-tweaks/code-health/
.claude-tweaks/routine-environment-cache.yml
.impeccable/config.local.json
.impeccable/hook.cache.json
.impeccable/hook.pending.json
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, code-health's own cache/cursor state (`code-health/cache.json`, `code-health/cursors.json`, `code-health/runs/`, see `skills/code-health/SKILL.md` and `bin/lib/code-health/cache.js`), and the routine-environment-resolution cache (see `skills/routine/SKILL.md`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry. The same rule applies to Impeccable's own config directory: `.impeccable/config.json` is Impeccable's committed, shared team config (colors, typography, brand voice); only the three per-developer files above — `config.local.json`, `hook.cache.json`, and `hook.pending.json`, all written by its optional automatic-detection hook — are local state. A blanket `.impeccable/` line would make `config.json` permanently uncommittable for the identical structural reason.

- [ ] **Step 3: Verify the edit**

Run: `grep -c "hook.pending.json\|hook.cache.json\|config.local.json" skills/init/bootstrap-steps.md`
Expected: `3` (one match per new gitignore line)

Run: `grep -n "^\.impeccable/$" skills/init/bootstrap-steps.md`
Expected: no output (confirms no blanket `.impeccable/` line was introduced)

- [ ] **Step 4: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Add Impeccable hook state to .gitignore suggestions"
```

---

### Task 2: Fix all stale `teach` → `init` references

Impeccable's `/impeccable:impeccable teach` command is now a deprecated alias for `/impeccable:impeccable init`. This task fixes every reference across the repo that recommends or describes the old name — found via `grep -rn "\bteach\b" --include="*.md" .` and manually triaged (excludes `CHANGELOG.md`'s historical entry and `spec-template.md`'s unrelated plain-English use of "teach the user the surface").

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (5 distinct locations)
- Modify: `skills/init/SKILL.md` (1 location)
- Modify: `skills/design/SKILL.md` (1 location)
- Modify: `skills/design/command-map.md` (2 locations)
- Modify: `skills/design/modes/pre-build.md` (2 locations)
- Modify: `skills/build/design-prebuild.md` (1 location)
- Modify: `README.md` (1 location)

**Interfaces:**
- Consumes: N/A
- Produces: every reference to Impeccable's setup command now reads `init` — Task 3 builds directly on top of this file's Step 0.9 content, so this task must land first.

- [ ] **Step 1: Fix `skills/init/bootstrap-steps.md` — option 1 description**

Old string:
```
1. Full integration **(Recommended)** — install plugin, run teach + document
```

New string:
```
1. Full integration **(Recommended)** — install plugin, run init + document
```

- [ ] **Step 2: Fix `skills/init/bootstrap-steps.md` — the install command sequence**

Old string:
```
**For option 1 only — generate design context files.** Run the teach interview (interactive, ~5 minutes) and then generate the spec-compliant design document:

```
/impeccable:impeccable teach
/impeccable:impeccable document
```
```

New string:
```
**For option 1 only — generate design context files.** Run the init interview (interactive, ~5 minutes) and then generate the spec-compliant design document:

```
/impeccable:impeccable init
/impeccable:impeccable document
```

(`/impeccable:impeccable teach` still works as a deprecated alias for `init`, in case older instructions elsewhere reference it.)
```

- [ ] **Step 3: Fix `skills/init/bootstrap-steps.md` — re-run behavior**

Old string:
```
**Re-run behavior:** When `/init` is re-run on a project where `design-integration: enabled`, offer to re-run `/impeccable:impeccable teach` + `document` to refresh `PRODUCT.md` / `DESIGN.md` (the codebase may have evolved since the last run). When the flag is `plugin-only` or `disabled`, offer the upgrade path back to full integration.
```

New string:
```
**Re-run behavior:** When `/init` is re-run on a project where `design-integration: enabled`, offer to re-run `/impeccable:impeccable init` + `document` to refresh `PRODUCT.md` / `DESIGN.md` (the codebase may have evolved since the last run). When the flag is `plugin-only` or `disabled`, offer the upgrade path back to full integration.
```

- [ ] **Step 4: Fix `skills/init/bootstrap-steps.md` — Step 0.95 diagram-design comparison (two spots)**

Old string:
```
The plugin is self-contained — no CLI, no Node/Python, no `teach` interview to run. It auto-triggers from its skill description when the conversation calls for a diagram.
```

New string:
```
The plugin is self-contained — no CLI, no Node/Python, no `init` interview to run. It auto-triggers from its skill description when the conversation calls for a diagram.
```

Old string:
```
**Re-run behavior:** When `/init` is re-run on a project where `diagram-integration: enabled`, this step is a no-op (there's no `teach` to refresh). When the flag is `disabled`, offer the upgrade path back to `enabled`. When the flag is **missing** (pre-v4.7 projects), present the first-run prompt — same as a fresh init.
```

New string:
```
**Re-run behavior:** When `/init` is re-run on a project where `diagram-integration: enabled`, this step is a no-op (there's no `init` to refresh). When the flag is `disabled`, offer the upgrade path back to `enabled`. When the flag is **missing** (pre-v4.7 projects), present the first-run prompt — same as a fresh init.
```

- [ ] **Step 5: Fix `skills/init/SKILL.md`**

Old string:
```
| `/claude-tweaks:design` | Phase 0.9 sets up Impeccable design integration (install plugin + CLI, optionally run `teach`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
```

New string:
```
| `/claude-tweaks:design` | Phase 0.9 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
```

- [ ] **Step 6: Fix `skills/design/SKILL.md`**

Old string:
```
| `/claude-tweaks:init` | Adds Impeccable setup phase (Phase 0.9 — install + teach + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. |
```

New string:
```
| `/claude-tweaks:init` | Adds Impeccable setup phase (Phase 0.9 — install + init + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. |
```

- [ ] **Step 7: Fix `skills/design/command-map.md` (two spots)**

Old string:
```
| `teach` | Never (in flow) | Runs once via `/init` Impeccable setup phase; never auto from `/flow` |
```

New string:
```
| `init` | Never (in flow) | Runs once via `/init` Impeccable setup phase (formerly `teach`, now a deprecated alias); never auto from `/flow` |
```

Old string:
```
- **Never (in flow)** commands either set up shared context once (`teach`) or are fundamentally manual (`craft`, `document`, `live`).
```

New string:
```
- **Never (in flow)** commands either set up shared context once (`init`) or are fundamentally manual (`craft`, `document`, `live`).
```

- [ ] **Step 8: Fix `skills/design/modes/pre-build.md` (two spots)**

Old string:
```
- **Canonical paths:** `PRODUCT.md` and `DESIGN.md` at the project root. These are written by `/impeccable:impeccable teach` (PRODUCT) and `/impeccable:impeccable document` (DESIGN). Confirmed against Impeccable's official documentation (https://impeccable.style/).
```

New string:
```
- **Canonical paths:** `PRODUCT.md` and `DESIGN.md` at the project root. These are written by `/impeccable:impeccable init` (PRODUCT) and `/impeccable:impeccable document` (DESIGN). Confirmed against Impeccable's official documentation (https://impeccable.style/).
```

Old string:
```
Missing files are not errors — they mean `/impeccable:impeccable teach` and `document` have not been run yet. Read each discovered file and include it in the loaded set.
```

New string:
```
Missing files are not errors — they mean `/impeccable:impeccable init` and `document` have not been run yet. Read each discovered file and include it in the loaded set.
```

- [ ] **Step 9: Fix `skills/build/design-prebuild.md`**

Old string:
```
Before dispatching implementation, invoke the design wrapper to lazy-load Impeccable's reference files plus any project-specific design context (root `PRODUCT.md` from `/impeccable:impeccable teach`, root `DESIGN.md` from `/impeccable:impeccable document`). The wrapper handles its own detection (non-frontend specs skip cleanly) and availability checks (no Impeccable installed → skip cleanly).
```

New string:
```
Before dispatching implementation, invoke the design wrapper to lazy-load Impeccable's reference files plus any project-specific design context (root `PRODUCT.md` from `/impeccable:impeccable init`, root `DESIGN.md` from `/impeccable:impeccable document`). The wrapper handles its own detection (non-frontend specs skip cleanly) and availability checks (no Impeccable installed → skip cleanly).
```

- [ ] **Step 10: Fix `README.md`**

Old string:
```
- **`pre-build`** — invoked by `/build` to lazy-load Impeccable references + project design context (`docs/design/PRODUCT.md`, `DESIGN.md` from `/impeccable teach`) into the implementer subagent
```

New string:
```
- **`pre-build`** — invoked by `/build` to lazy-load Impeccable references + project design context (`docs/design/PRODUCT.md`, `DESIGN.md` from `/impeccable init`) into the implementer subagent
```

- [ ] **Step 11: Verify all fixes landed and nothing was missed**

Run: `grep -rn "\bteach\b" --include="*.md" . | grep -v CHANGELOG.md | grep -v "wants to teach the user"`
Expected: exactly one remaining line — the intentional "deprecated alias" mention added in Step 2:
```
skills/init/bootstrap-steps.md:(`/impeccable:impeccable teach` still works as a deprecated alias for `init`, in case older instructions elsewhere reference it.)
```

- [ ] **Step 12: Commit**

```bash
git add skills/init/bootstrap-steps.md skills/init/SKILL.md skills/design/SKILL.md skills/design/command-map.md skills/design/modes/pre-build.md skills/build/design-prebuild.md README.md
git commit -m "Replace deprecated /impeccable teach references with /impeccable init"
```

---

### Task 3: Add the automatic design hook offer to `/init` Step 0.9

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (Step 0.9, after the existing install-sequence content, before the `---` separator preceding Step 0.95)

**Interfaces:**
- Consumes: the three gitignored file names from Task 1 (referenced in the new prose), the `init` naming from Task 2 (this step must run after Task 2 so it's written against the corrected command name from the start)
- Produces: the exact hook-offer prompt text and the command `/impeccable:impeccable hooks on` — Task 6 references this same command name and file path (`.impeccable/config.local.json`) by name, so keep them byte-identical.

- [ ] **Step 1: Confirm the anchor text is present**

Run: `grep -n "Failure handling.*plugin install fails" skills/init/bootstrap-steps.md`
Expected: one match inside Step 0.9, immediately before the `---` separator that precedes `## Step 0.95`.

- [ ] **Step 2: Insert the new hook-offer subsection**

Old string:
```
**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `design-integration: disabled` until the user resolves it. The wrapper's availability checks gracefully skip when dependencies are absent.

---

## Step 0.95 — Diagram Design (Recommended Companion)
```

New string:
```
**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `design-integration: disabled` until the user resolves it. The wrapper's availability checks gracefully skip when dependencies are absent.

**Automatic design hook (optional, separate offer).** After the install sequence completes for option 1 or 2 (Impeccable is installed either way), offer the automatic detection hook as its own follow-up. This is a materially different kind of decision from the context-file setup above — automatic runtime behavior during editing, not one-time context generation — so it gets its own prompt rather than a fourth item bolted onto the three-option choice above:

```
Enable Impeccable's automatic design hook? It runs the anti-pattern detector
after every UI edit and surfaces findings inline — no slash command needed.

Note: consent lives in the working tree, not .git/ — a fresh git worktree
(via /build worktree or /flow worktree) won't have this enabled until you
run /impeccable hooks on inside it again.

1. Yes — run /impeccable hooks on (Recommended)
2. Skip — enable later, or per-worktree, as needed
```

On option 1, run `/impeccable:impeccable hooks on` via the Skill tool. This writes hook consent into `.impeccable/config.local.json` in the current working tree only — it does not carry over to worktrees created later by `/build worktree` or `/flow worktree` (see `skills/build/worktree-setup.md` for the per-worktree note). No CLAUDE.md flag is needed for this choice — Impeccable's own `.impeccable/config.local.json` is the on/off state, checked directly by Impeccable, not by this wrapper.

Skip this offer entirely when Impeccable was not installed (option 3 was chosen above, or the install failed) — there is nothing to enable.

---

## Step 0.95 — Diagram Design (Recommended Companion)
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n "impeccable hooks on\|Automatic design hook" skills/init/bootstrap-steps.md`
Expected: at least 3 matches (the heading, the prompt option, and the follow-up sentence referencing the command).

Run: `grep -c "^## Step 0.95" skills/init/bootstrap-steps.md`
Expected: `1` (confirms the section boundary wasn't duplicated or broken)

- [ ] **Step 4: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Offer Impeccable's automatic design hook during /init Step 0.9"
```

---

### Task 4: Correct the `--fast` flag documentation and stamp the CLI version

**Files:**
- Modify: `skills/design/impeccable-cli.md`

**Interfaces:**
- Consumes: N/A
- Produces: the "last verified" version stamp other tasks/future re-baselines can grep for.

- [ ] **Step 1: Check whether the Impeccable CLI is available locally, for a live fact-check**

Run: `npx impeccable --version 2>&1 || echo "NOT_AVAILABLE"`

If a version prints: proceed to Step 2 for a live check. If `NOT_AVAILABLE`: skip to Step 3 and rely on the already-confirmed upstream commit (`f7f2bfc`, "`--fast` deprecated to a no-op") from this spec's research — note in the commit message that the live CLI check was skipped due to unavailability.

- [ ] **Step 2: (If CLI available) Confirm `--fast` is a no-op and the JSON schema is unchanged**

Create a throwaway test file:
```bash
mkdir -p /tmp/impeccable-schema-check
echo '<div style="background: linear-gradient(to right, purple, pink)">test</div>' > /tmp/impeccable-schema-check/test.html
```

Run: `npx impeccable detect --json /tmp/impeccable-schema-check/test.html` and separately `npx impeccable detect --fast --json /tmp/impeccable-schema-check/test.html`

Expected: both commands produce structurally identical output (same `files_scanned`, same `findings` array shape with `file`/`rule`/`severity`/`line`/`message` keys) — confirming `--fast` makes no observable difference, and the shape matches the "Expected JSON output schema" section already documented later in this same file (untouched by this task). If the live output differs from that existing schema section, note the discrepancy in the commit message instead of silently forcing a match — a real schema change would need its own follow-up task, not a silent edit here.

Clean up: `rm -rf /tmp/impeccable-schema-check`

- [ ] **Step 3: Edit the file — version stamp, flag table, and open-items note**

Old string:
```
# Impeccable CLI — Invocation + JSON Parsing

Reference for the wrapper's `test` mode dispatch. The Impeccable CLI is a deterministic Node binary that scans frontend files for design anti-patterns without LLM cost.
```

New string:
```
# Impeccable CLI — Invocation + JSON Parsing

*Last verified against Impeccable skill 3.9.1 / CLI 3.2.0 (2026-07-07).*

Reference for the wrapper's `test` mode dispatch. The Impeccable CLI is a deterministic Node binary that scans frontend files for design anti-patterns without LLM cost.
```

Old string:
```
| Flag | Why |
|------|-----|
| `detect` | Subcommand — runs the deterministic anti-pattern scanner |
| `--fast` | Skip slow heuristic passes (the wrapper's test mode is meant to gate quickly) |
| `--json` | Machine-readable output — required for parsing |
| `<files>` | Space-separated list of files to scan; passed positionally |
```

New string:
```
| Flag | Why |
|------|-----|
| `detect` | Subcommand — runs the deterministic anti-pattern scanner |
| `--fast` | No-op as of CLI 3.x — the detector always full-scans regardless of this flag. Kept in the invocation for now; harmless either way, and removing it is a separate, non-urgent cleanup. |
| `--json` | Machine-readable output — required for parsing |
| `<files>` | Space-separated list of files to scan; passed positionally |
```

Old string:
```
## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. Re-validate sample output after every Impeccable major version bump.
```

New string:
```
## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. Re-validate sample output after every Impeccable major version bump. Last re-validated 2026-07-07 against skill 3.9.1 / CLI 3.2.0 (see header note) — schema unchanged, defensive parsing still sufficient.
```

- [ ] **Step 4: Verify the edit**

Run: `grep -n "Last verified against Impeccable skill\|No-op as of CLI 3.x\|Last re-validated 2026-07-07" skills/design/impeccable-cli.md`
Expected: 3 matches, one per edited section.

- [ ] **Step 5: Commit**

```bash
git add skills/design/impeccable-cli.md
git commit -m "Correct --fast flag documentation and stamp CLI version verification"
```

---

### Task 5: Add the `/hooks` command to the command map

**Files:**
- Modify: `skills/design/command-map.md`

**Interfaces:**
- Consumes: the `/impeccable:impeccable hooks on` command name established in Task 3 — keep identical.
- Produces: N/A (reference table entry, nothing downstream depends on this specific row)

- [ ] **Step 1: Confirm the anchor row is present**

Run: `grep -n '| `live` | Never (in flow)' skills/design/command-map.md`
Expected: one match — the last row of the "Full command map" table.

- [ ] **Step 2: Add the new row**

Old string:
```
| `live` | Never (in flow) | Available only as standalone manual commands; never auto-invoked by the wrapper |
```

New string:
```
| `live` | Never (in flow) | Available only as standalone manual commands; never auto-invoked by the wrapper |
| `hooks` | Never (in flow) | Manual — one-time per-worktree consent toggle (`hooks on\|off\|status`); never auto-invoked. See `skills/build/worktree-setup.md` for the per-worktree consent note. |
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n '| `hooks`' skills/design/command-map.md`
Expected: one match, the new row.

- [ ] **Step 4: Commit**

```bash
git add skills/design/command-map.md
git commit -m "Add /impeccable hooks to the command map"
```

---

### Task 6: Document per-worktree hook consent in worktree setup

**Files:**
- Modify: `skills/build/worktree-setup.md`

**Interfaces:**
- Consumes: `/impeccable:impeccable hooks on` and `.impeccable/config.local.json` from Task 3 — must use identical names.
- Produces: N/A

- [ ] **Step 1: Confirm the anchor text is present**

Run: `grep -n "Branch already exists" skills/build/worktree-setup.md`
Expected: one match — the last row of the "If worktree creation fails" table, end of file.

- [ ] **Step 2: Append the new section**

Old string:
```
| **Branch already exists** | Offer: (1) Use existing worktree, (2) Remove and recreate, (3) Fall back to current-branch. |
```

New string:
```
| **Branch already exists** | Offer: (1) Use existing worktree, (2) Remove and recreate, (3) Fall back to current-branch. |

## Impeccable hook consent (per-worktree)

If Impeccable's automatic design hook is enabled (`/impeccable:impeccable hooks on` — see `skills/init/bootstrap-steps.md` Step 0.9), its consent lives in `.impeccable/config.local.json` in the **working tree**, not `.git/`. A freshly created worktree starts with the hook off even when the main checkout has it enabled — re-run `/impeccable:impeccable hooks on` inside the new worktree if you want it active there too.

This is informational only. claude-tweaks does not auto-propagate Impeccable's hook consent into new worktrees — doing so would create an ongoing dependency on Impeccable's internal config file shape for a one-time, low-cost manual step.
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n "Impeccable hook consent" skills/build/worktree-setup.md`
Expected: one match — the new section heading.

- [ ] **Step 4: Commit**

```bash
git add skills/build/worktree-setup.md
git commit -m "Document per-worktree Impeccable hook consent behavior"
```

---

### Task 7: Full verification pass

**Files:**
- None modified (read-only verification, unless a check below surfaces something to fix)

**Interfaces:**
- Consumes: the final state of every file touched in Tasks 1–6.
- Produces: N/A

- [ ] **Step 1: Confirm no unintended stale `teach` references remain**

Run: `grep -rn "\bteach\b" --include="*.md" . | grep -v CHANGELOG.md | grep -v "wants to teach the user"`
Expected: exactly the one intentional "deprecated alias" mention from Task 2 Step 2.

- [ ] **Step 2: Confirm no blanket `.impeccable/` gitignore line exists anywhere**

Run: `grep -rn "^\.impeccable/$" --include=".gitignore" --include="*.md" .`
Expected: no output.

- [ ] **Step 3: Confirm the three specific Impeccable local-state paths are documented**

Run: `grep -c "config.local.json\|hook.cache.json\|hook.pending.json" skills/init/bootstrap-steps.md`
Expected: `3` or more (at least the three gitignore-block mentions from Task 1; more if Task 3's prose references them too).

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run: `npm test 2>&1 | tail -15`
Expected: all tests pass. (This plan touches no source files, so the suite should be unaffected. If the same pre-existing flaky `tests/statusline.test.js` timing test fails under load, re-run it in isolation — `node --test tests/statusline.test.js` — to confirm it passes standalone before treating it as a regression.)

- [ ] **Step 5: Manually re-read the new hook-offer prompt for tone/format consistency**

Open `skills/init/bootstrap-steps.md` Step 0.9 and compare the new "Automatic design hook" prompt against the existing three-option Impeccable install prompt in the same step. Confirm: numbered options, `**(Recommended)**` marker on the option meant to be default, plain-language explanation before the prompt block, consistent voice. Fix inline if anything reads inconsistently.

- [ ] **Step 6: Final commit (only if Steps 1–5 surfaced a fix)**

```bash
git add -A
git commit -m "Fix issues found during Impeccable re-baseline verification pass"
```

If no issues were found, skip this step — there is nothing to commit.
