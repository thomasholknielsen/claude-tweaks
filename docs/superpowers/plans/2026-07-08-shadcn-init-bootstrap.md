# shadcn/ui Init Bootstrap + Phase 0 Step Renumbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/init` Optional Enhancement step that bootstraps shadcn/ui (CLI + MCP server + shadcn/skills) on frontend projects, and fold in a renumbering of Phase 0's `Step 0.X` scheme into two clean sequential groups.

**Architecture:** Pure documentation change — no new `bin/*.js` code. A verified `sed` pass mechanically renumbers 13 files in one pass; two files (`bootstrap-steps.md`, `skills/init/SKILL.md`) then get structural edits (group headers, one section relocation, new Step 12 content); two more files (`README.md`, `skills/help/reference-card.md`) get new companion documentation; `plugin.json` gets a version bump.

**Tech Stack:** Markdown, `sed` (BSD/macOS, `-E` extended regex), `git`, `node --test`.

## Global Constraints

- No code changes — every task edits Markdown/JSON documentation only.
- `CHANGELOG.md` is **not** touched — confirmed stale since `v4.15.0` (last commit: `64bd0c7`), superseded in practice by `README.md`'s "What's new" section, which every task 6+ edit targets instead.
- `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` are **not** touched — historical records of past planning, not live documentation.
- Version bump is minor: `5.17.1` → `5.18.0` (feature addition, per `CLAUDE.md`'s Versioning convention). Re-check `git log --oneline -5 .claude-plugin/plugin.json` immediately before Task 7's bump in case a concurrent session already landed a bump.
- All file paths below are relative to the repo root (this worktree).
- Every `sed -i` invocation targets specific listed files only — never a repo-wide recursive substitution, to avoid touching the excluded historical files above.

---

### Task 1: Bulk-renumber `Step 0.X` / `Phase 0.X` across all live cross-reference files

**Files:**
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/init/SKILL.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`
- Modify: `skills/design/SKILL.md`
- Modify: `skills/build/worktree-setup.md`
- Modify: `skills/flow/from-code-health.md`
- Modify: `skills/_shared/diagram-integration-check.md`
- Modify: `skills/journeys/SKILL.md`
- Modify: `skills/review/SKILL.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Produces: every file above with `Step 0.1`–`Step 0.97` / `Phase 0.1`–`Phase 0.97` replaced by plain `Step 1`–`Step 14` (mapping table below), and — in `skills/init/bootstrap-steps.md` only — every `## Step N — ...` header demoted to `### Step N — ...`. Tasks 2–7 all assume this substitution has already run.

Mapping (old → new), sorted to avoid substring collisions (`0.4`⊂`0.45`, `0.9`⊂`0.95`/`0.96`/`0.97`):

| Old | New |
|---|---|
| `0.97` | `14` |
| `0.96` | `13` |
| `0.95` | `11` |
| `0.45` | `9` |
| `0.9` | `10` |
| `0.8` | `8` |
| `0.7` | `7` |
| `0.6` | `6` |
| `0.5` | `5` |
| `0.4` | `4` |
| `0.3` | `3` |
| `0.2` | `2` |
| `0.1` | `1` |

Both `Step 0.X` and `Phase 0.X` collapse to `Step N` — this also standardizes terminology (the same conceptual step was inconsistently called "Step" in some files and "Phase" in others; going forward, "Phase N" is reserved exclusively for `/init`'s top-level lifecycle phases 0–9).

- [ ] **Step 1: Run the verified sed pass**

This exact script was tested against scratch copies of all 13 files with zero unintended matches (verified: `grep -rn "Step 0\.\|Phase 0\.[0-9]" .` returned nothing after the pass, and headers demoted correctly). Run from the repo root:

```bash
FILES=(
  "skills/init/bootstrap-steps.md"
  "skills/init/SKILL.md"
  "CLAUDE.md"
  "README.md"
  "skills/help/reference-card.md"
  "skills/design/SKILL.md"
  "skills/build/worktree-setup.md"
  "skills/flow/from-code-health.md"
  "skills/_shared/diagram-integration-check.md"
  "skills/journeys/SKILL.md"
  "skills/review/SKILL.md"
  "skills/specify/SKILL.md"
  "skills/routine/SKILL.md"
)

for f in "${FILES[@]}"; do
  sed -i '' -E \
    -e 's/(Phase|Step) 0\.97/Step 14/g' \
    -e 's/(Phase|Step) 0\.96/Step 13/g' \
    -e 's/(Phase|Step) 0\.95/Step 11/g' \
    -e 's/(Phase|Step) 0\.45/Step 9/g' \
    -e 's/(Phase|Step) 0\.9([^0-9]|$)/Step 10\2/g' \
    -e 's/(Phase|Step) 0\.8/Step 8/g' \
    -e 's/(Phase|Step) 0\.7/Step 7/g' \
    -e 's/(Phase|Step) 0\.6/Step 6/g' \
    -e 's/(Phase|Step) 0\.5/Step 5/g' \
    -e 's/(Phase|Step) 0\.4([^0-9]|$)/Step 4\2/g' \
    -e 's/(Phase|Step) 0\.3/Step 3/g' \
    -e 's/(Phase|Step) 0\.2/Step 2/g' \
    -e 's/(Phase|Step) 0\.1/Step 1/g' \
    "$f"
done

# bootstrap-steps.md only: demote step headers from ## to ### now that numbers are fixed
sed -i '' -E 's/^## Step ([0-9]+) —/### Step \1 —/' skills/init/bootstrap-steps.md
```

- [ ] **Step 2: Verify no stray old-scheme references remain**

```bash
grep -rn "Step 0\.\|Phase 0\.[0-9]" \
  skills/init/bootstrap-steps.md skills/init/SKILL.md CLAUDE.md README.md \
  skills/help/reference-card.md skills/design/SKILL.md skills/build/worktree-setup.md \
  skills/flow/from-code-health.md skills/_shared/diagram-integration-check.md \
  skills/journeys/SKILL.md skills/review/SKILL.md skills/specify/SKILL.md \
  skills/routine/SKILL.md
```

Expected: no output (exit code 1, "no matches"). If anything prints, the sed pass missed a variant spelling — inspect and fix before proceeding.

- [ ] **Step 3: Verify header demotion in bootstrap-steps.md**

```bash
grep -n "^## Step\|^### Step" skills/init/bootstrap-steps.md
```

Expected: no `## Step` matches (all demoted to `### Step`). You should see 13 `### Step N —` lines with `N` running `1,2,3,4,9,5,6,7,8,10,11,13,14` in that document order (Step 9 has not been relocated yet — that's Task 2).

- [ ] **Step 4: Confirm nothing else broke**

```bash
npm test 2>&1 | tail -15
```

Expected: `630 pass, 1 fail` (the pre-existing `tests/statusline.test.js` "render under 500ms" timing flake — confirmed flaky by rerun before this plan was written; unrelated to this documentation-only change). Any *other* failure means investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add skills/init/bootstrap-steps.md skills/init/SKILL.md CLAUDE.md README.md \
  skills/help/reference-card.md skills/design/SKILL.md skills/build/worktree-setup.md \
  skills/flow/from-code-health.md skills/_shared/diagram-integration-check.md \
  skills/journeys/SKILL.md skills/review/SKILL.md skills/specify/SKILL.md \
  skills/routine/SKILL.md
git commit -m "Renumber /init Phase 0 steps from decimal (0.X) to sequential integers

Mechanical rename only — no structural or behavioral change. Standardizes
terminology (Step vs Phase) for Phase 0's internal items. Structural
regrouping (Core Bootstrap / Optional Enhancements headers, Step 9
relocation) follows in the next commit."
```

---

### Task 2: Restructure `skills/init/bootstrap-steps.md` — group headers + relocate Step 9

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Consumes: the renumbered, header-demoted file produced by Task 1.
- Produces: a file with two `##` group headers (`Core Bootstrap Steps`, `Optional Enhancement Steps`) and Step 9 physically relocated to immediately follow Step 8, ready for Task 4 to insert new Step 12 content between Step 11 and Step 13.

- [ ] **Step 1: Insert the "Core Bootstrap Steps" group header before Step 1**

Use the Edit tool on `skills/init/bootstrap-steps.md`:

old_string:
```
Loaded by `/init` Phase 0 when the corresponding tool/feature is being set up. Each step is independent — read only the section(s) needed for the step currently executing. In Update Mode most of these are no-ops (already configured); the SKILL.md decides whether to load this file at all.

### Step 1 — Check Plugin Dependencies (detailed procedure)
```

new_string:
```
Loaded by `/init` Phase 0 when the corresponding tool/feature is being set up. Each step is independent — read only the section(s) needed for the step currently executing. In Update Mode most of these are no-ops (already configured); the SKILL.md decides whether to load this file at all.

## Core Bootstrap Steps

Order-dependent — later steps may assume earlier ones completed. Steps 1-8 run unconditionally and idempotently (only act on missing state).

### Step 1 — Check Plugin Dependencies (detailed procedure)
```

- [ ] **Step 2: Remove Step 9 from its current position (between Step 4 and Step 5)**

old_string:
```
Do not modify `.gitignore` without asking — the user may have opinions about what to track.

---

### Step 9 — GitHub issue form template (agent-task)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`). Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
offer to install it. The form makes human-filed issues pipeline-ready at filing time: its
three sections match what `/claude-tweaks:flow`'s issue-sourced batches consume with zero
translation (`bin/lib/issues/ingest.js` `isFormShaped` — GitHub renders the labels as `###`
headings, which the detector accepts).

```yaml
name: Agent task
description: File a task an agent pipeline can build directly (claude-tweaks issue-sourced batch)
title: "[task] "
body:
  - type: textarea
    id: current-state
    attributes:
      label: Current State
      description: What exists today, and what is wrong or missing
    validations:
      required: true
  - type: textarea
    id: deliverables
    attributes:
      label: Deliverables
      description: What should exist when this is done
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How to verify it is done
    validations:
      required: true
```

Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via the translation step (`from-code-health.md` Step 2.6); the
form just removes the translation judgment.

---

### Step 5 — Verify Git (detailed procedure)
```

new_string:
```
Do not modify `.gitignore` without asking — the user may have opinions about what to track.

---

### Step 5 — Verify Git (detailed procedure)
```

- [ ] **Step 3: Insert the "Optional Enhancement Steps" group header + relocated Step 9, between Step 8 and (old) Step 10**

old_string:
```
**Set `NO_COLOR=1` to disable color** if requested — universal env var, no claude-tweaks-specific override.

---

### Step 10 — Impeccable Design Integration (detailed procedure)
```

new_string:
```
**Set `NO_COLOR=1` to disable color** if requested — universal env var, no claude-tweaks-specific override.

---

## Optional Enhancement Steps

Order-agnostic and append-only — each step below is an independent "detect condition → offer → write artifact → idempotent" companion integration. New enhancements are added at the end of this group; no renumbering is needed for future additions.

### Step 9 — GitHub issue form template (agent-task)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`). Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
offer to install it. The form makes human-filed issues pipeline-ready at filing time: its
three sections match what `/claude-tweaks:flow`'s issue-sourced batches consume with zero
translation (`bin/lib/issues/ingest.js` `isFormShaped` — GitHub renders the labels as `###`
headings, which the detector accepts).

```yaml
name: Agent task
description: File a task an agent pipeline can build directly (claude-tweaks issue-sourced batch)
title: "[task] "
body:
  - type: textarea
    id: current-state
    attributes:
      label: Current State
      description: What exists today, and what is wrong or missing
    validations:
      required: true
  - type: textarea
    id: deliverables
    attributes:
      label: Deliverables
      description: What should exist when this is done
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How to verify it is done
    validations:
      required: true
```

Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via the translation step (`from-code-health.md` Step 2.6); the
form just removes the translation judgment.

---

### Step 10 — Impeccable Design Integration (detailed procedure)
```

- [ ] **Step 4: Verify final structure**

```bash
grep -n "^## \|^### Step" skills/init/bootstrap-steps.md
```

Expected order: `## Core Bootstrap Steps`, then `### Step 1` through `### Step 8` (with the two embedded example-content headers `## Tier 1/2/3` from Step 3's INDEX.md template still appearing in between — those are sample file content, not real steps, leave them untouched), then `## Optional Enhancement Steps`, then `### Step 9`, `### Step 10`, `### Step 11`, `### Step 13`, `### Step 14` (gap at 12 is intentional — Task 4 fills it).

- [ ] **Step 5: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Restructure bootstrap-steps.md into Core Bootstrap / Optional Enhancement groups

Relocates Step 9 (GitHub issue form) next to its fellow order-agnostic
companion steps — it was previously numbered inside the order-dependent
core range purely as an artifact of decimal insertion history."
```

---

### Task 3: Restructure `skills/init/SKILL.md` — group dividers + relocate Step 9

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: the renumbered file produced by Task 1.
- Produces: the Phase 0 step-summary list with the same two-group structure as Task 2's `bootstrap-steps.md`, ready for Task 5 to insert the new Step 12 summary block.

- [ ] **Step 1: Insert "Core Bootstrap" divider before Step 1**

old_string:
```
Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

### Step 1: Check Plugin Dependencies
```

new_string:
```
Fast, idempotent structural setup. Creates directories, starter files, and verifies dependencies. Skips anything that already exists.

**Core Bootstrap (Steps 1–8):**

### Step 1: Check Plugin Dependencies
```

- [ ] **Step 2: Remove the Step 9 block from its current position (between Step 4 and Step 5)**

old_string:
```
Suggest entries for transient workflow artifacts; never modify `.gitignore` without asking. Read `bootstrap-steps.md` (Step 4) for the full suggested block and the stories-commit prompt.

### Step 9: GitHub Issue Form Template (Optional)

GitHub issue form template offer (agent-task.yml). Read `bootstrap-steps.md` (Step 9) for the full procedure.

### Step 5: Verify Git
```

new_string:
```
Suggest entries for transient workflow artifacts; never modify `.gitignore` without asking. Read `bootstrap-steps.md` (Step 4) for the full suggested block and the stories-commit prompt.

### Step 5: Verify Git
```

- [ ] **Step 3: Insert "Optional Enhancements" divider + relocated Step 9, before (old) Step 10**

old_string:
```
Detect Node (and optionally git), install the statusline wrapper at `~/.claude-tweaks/bin/statusline.js`, and prompt before wiring `statusLine.command` in `~/.claude/settings.json` — never overwrite a non-claude-tweaks command. Read `bootstrap-steps.md` (Step 8) for the full procedure (detection, package-manager prompts, settings.json migration matrix, NO_COLOR opt-out).

### Step 10: Impeccable Design Integration (Optional)
```

new_string:
```
Detect Node (and optionally git), install the statusline wrapper at `~/.claude-tweaks/bin/statusline.js`, and prompt before wiring `statusLine.command` in `~/.claude/settings.json` — never overwrite a non-claude-tweaks command. Read `bootstrap-steps.md` (Step 8) for the full procedure (detection, package-manager prompts, settings.json migration matrix, NO_COLOR opt-out).

**Optional Enhancements (Steps 9–14):**

### Step 9: GitHub Issue Form Template (Optional)

GitHub issue form template offer (agent-task.yml). Read `bootstrap-steps.md` (Step 9) for the full procedure.

### Step 10: Impeccable Design Integration (Optional)
```

- [ ] **Step 4: Verify final structure**

```bash
grep -n "^### Step\|Core Bootstrap (Steps\|Optional Enhancements (Steps" skills/init/SKILL.md
```

Expected order: the `Core Bootstrap` divider, `### Step 1` through `### Step 8`, the `Optional Enhancements` divider, `### Step 9`, `### Step 10`, `### Step 11`, `### Step 13`, `### Step 14` (gap at 12 intentional — Task 5 fills it).

- [ ] **Step 5: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "Mirror bootstrap-steps.md's Core Bootstrap / Optional Enhancement grouping in SKILL.md"
```

---

### Task 4: Write the new Step 12 — shadcn Bootstrap procedure into `bootstrap-steps.md`

**Files:**
- Modify: `skills/init/bootstrap-steps.md`

**Interfaces:**
- Consumes: the file as restructured by Task 2 (Step 11 immediately followed by Step 13).
- Produces: the full Step 12 detailed procedure, insertable target for Task 5's `SKILL.md` pointer.

- [ ] **Step 1: Insert the new Step 12 section between Step 11 and Step 13**

Use the Edit tool on `skills/init/bootstrap-steps.md`:

old_string:
```
**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `diagram-integration: disabled` until the user resolves it. The soft-hook nudges check the flag, not the plugin's presence, so a failed install just means the user sees no nudges (graceful degradation).

---

### Step 13 — Routine Installation (detailed procedure)
```

new_string:
```
**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `diagram-integration: disabled` until the user resolves it. The soft-hook nudges check the flag, not the plugin's presence, so a failed install just means the user sees no nudges (graceful degradation).

---

### Step 12 — shadcn Bootstrap (detailed procedure)

claude-tweaks integrates [shadcn/ui](https://ui.shadcn.com/) — a CLI-driven component
system distributed as copy-paste source files rather than an npm package. As of CLI v4
(~March 2026), shadcn ships three AI-agent-facing layers: the CLI itself (`init`/`add`),
a first-party MCP server (search/browse/view/install/audit registry items), and an
installable `shadcn/skills` package that injects live project context into Claude Code
so it stops guessing at component APIs. This step wires all three, mirroring Step 10's
(Impeccable) install-and-flag pattern.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
project root if Phase 0 is being run before Phase 2): look for any of `.tsx`, `.jsx`,
`.vue`, `.svelte`, `.html`, `.css` files, or directories `components/`, `pages/`, `app/`,
`routes/`, `views/`, `ui/`. If none are detected, skip this step entirely.

Then check whether `components.json` already exists at the project root.

**Case A — no `components.json`, frontend detected:**

Present:

```
Detected frontend project. Set up shadcn/ui integration?

shadcn/ui provides a CLI-driven component system plus first-party AI-agent
tooling: an MCP server (search/browse/install/audit registry items) and an
installable Skill that gives Claude Code live project context, so it
discovers and installs components correctly instead of guessing.

1. Full integration (Recommended) — CLI init, wire MCP server, install shadcn/skills
2. CLI only — CLI init, skip MCP/skills wiring
3. Skip — disable shadcn integration
```

**Options 1 and 2 both run:**

1. Detect the package manager from the lockfile present at the project root:

   | Lockfile | Prefix |
   |---|---|
   | `pnpm-lock.yaml` | `pnpm dlx` |
   | `yarn.lock` | `yarn dlx` |
   | `bun.lockb` | `bunx` |
   | `package-lock.json` or none | `npx` |

2. Detect the framework from `package.json` dependencies for the `-t` flag:

   | Dependency present | `-t` value |
   |---|---|
   | `next` | `next` |
   | `vite` | `vite` |
   | `astro` | `astro` |
   | `@remix-run/react` or `react-router` | `react-router` |
   | `@tanstack/react-start` | `tanstack-start` |
   | `laravel/framework` in `composer.json`, or an `artisan` file at root | `laravel` |
   | None matched | Omit `-t`; let the CLI prompt interactively |

3. Run `<prefix> shadcn@latest init -t <framework>` (omit `-t <framework>` if
   undetected). Let the CLI's own interactive prompts resolve style, base color, and
   CSS-variable choices — do not pre-answer them; claude-tweaks has no fixed preset to
   apply.

**Option 1 only, additionally:**

4. Wire the MCP server for Claude Code. Back up `.mcp.json` first if it exists
   (`cp .mcp.json .mcp.json.bak`), then run shadcn's own documented setup command, which
   handles the merge:

   ```bash
   <prefix> shadcn@latest mcp init --client claude
   ```

   This writes (or merges into an existing) `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "shadcn": {
         "command": "npx",
         "args": ["shadcn@latest", "mcp"]
       }
     }
   }
   ```

   If the `mcp init --client claude` command fails or is unavailable, fall back to
   merging the JSON block above into `.mcp.json` directly (never overwrite existing
   `mcpServers` entries from other tools).

5. Install the shadcn Skill, using the same package-manager prefix resolved in step 1:

   ```bash
   <prefix> skills add shadcn/ui
   ```

**Case B — `components.json` exists, MCP/skills not fully wired:**

Check `.mcp.json` for an existing `mcpServers.shadcn` entry, and check whether the
shadcn Skill is installed (its directory/marker file, per the `skills` CLI's own
convention). If either is missing, present:

```
shadcn/ui is already initialized in this project. Wire up the MCP server and
shadcn/skills for Claude Code?

1. Yes — wire remaining layers (Recommended)
2. Skip
```

Option 1 runs steps 4-5 above (skipping CLI init, already done). Option 2 skips both.

**Case C — fully configured already:**

`components.json` exists, `.mcp.json` has the `mcpServers.shadcn` entry, and the shadcn
Skill is installed. Silent no-op — no prompt, matching every other Optional Enhancement
step's idempotency contract.

**Write the CLAUDE.md flag.** Add (or update) the `## Design integration` section — the
same section Steps 10 and 11 write to:

```markdown
## Design integration

design-integration: enabled
diagram-integration: enabled
shadcn-integration: enabled
```

| Case / choice | Flag value |
|---|---|
| Case A, option 1 | `enabled` |
| Case A, option 2 | `cli-only` |
| Case A, option 3 (skip) | `disabled` |
| Case B, option 1 | `enabled` |
| Case B, option 2 (skip) | `cli-only` — the CLI portion is already done regardless of this offer's outcome, so `cli-only` reflects reality; `disabled` would be inaccurate |
| Case C | No write — the flag should already read `enabled` from a prior run; leave untouched |

**Scope note:** this flag is currently write-only — no other claude-tweaks skill reads
it yet. It exists so re-running `/init` is idempotent, the same role `design-integration`
plays for Step 10.

**Failure handling:** If any install command fails (network error, package-manager
error), surface the failure and continue Phase 0 with `shadcn-integration: disabled` (or
the honestly-reached partial state) rather than aborting the rest of bootstrap.

---

### Step 13 — Routine Installation (detailed procedure)
```

- [ ] **Step 2: Verify placement and internal consistency**

```bash
grep -n "^### Step" skills/init/bootstrap-steps.md
```

Expected: `### Step 1` … `### Step 8`, `### Step 9`, `### Step 10`, `### Step 11`, `### Step 12`, `### Step 13`, `### Step 14` — full unbroken sequence, no gaps.

```bash
grep -c "shadcn-integration" skills/init/bootstrap-steps.md
```

Expected: at least 4 (the flag block, the table's 6 rows don't repeat the string but the surrounding prose does — confirm the count is non-zero and the flag block is well-formed by eye).

- [ ] **Step 3: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Add /init Step 12 — shadcn Bootstrap (CLI init + MCP server + shadcn/skills)

Detects frontend projects without components.json, offers a 3-option
setup (Full / CLI-only / Skip), and wires shadcn's own official
MCP server + shadcn/skills package for live Claude Code project context.
Writes shadcn-integration to CLAUDE.md's Design integration section
(write-only for now — no other skill reads it yet)."
```

---

### Task 5: Add Step 12 to `skills/init/SKILL.md` — summary, Actions Performed, Relationship

**Files:**
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: the file as restructured by Task 3.
- Produces: a Phase 0 step list, Actions Performed table, and Relationship table that all reference Step 12, matching Task 4's content.

- [ ] **Step 1: Insert the Step 12 summary block between Step 11 and Step 13**

old_string:
```
Always offered (not frontend-gated). Present the two-option diagram-design setup prompt (Install / Skip) and write the `diagram-integration` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/specify`, `/build`, and `/review` read this flag to decide whether to surface "consider a diagram here" recommendations. Read `bootstrap-steps.md` (Step 11) for the full procedure.

### Step 13: Routine Installation (Optional Companion)
```

new_string:
```
Always offered (not frontend-gated). Present the two-option diagram-design setup prompt (Install / Skip) and write the `diagram-integration` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/specify`, `/build`, and `/review` read this flag to decide whether to surface "consider a diagram here" recommendations. Read `bootstrap-steps.md` (Step 11) for the full procedure.

### Step 12: shadcn Bootstrap (Optional)

When frontend signals are detected and `components.json` doesn't exist (or exists without full AI-agent wiring), present the shadcn/ui setup prompt (Full / CLI-only / Skip, or the narrower "wire remaining layers" offer when the CLI is already initialized) and write the `shadcn-integration` flag to CLAUDE.md. Currently write-only — no other skill reads the flag yet. Read `bootstrap-steps.md` (Step 12) for the full procedure (framework/package-manager detection, install sequence, MCP/skills wiring, flag-value table, re-run behavior, failure handling).

### Step 13: Routine Installation (Optional Companion)
```

- [ ] **Step 2: Add the Actions Performed table row**

old_string:
```
| Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 10 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
```

new_string:
```
| Design integration | Set `design-integration: {enabled/plugin-only/disabled}` in CLAUDE.md | Step 10 |
| shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 12 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
```

- [ ] **Step 3: Add the Relationship to Other Skills table row**

old_string:
```
| `/claude-tweaks:design` | Step 10 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
| `cathrynlavery/diagram-design` (companion) | Step 11 offers to install the external `diagram-design` plugin and writes the `diagram-integration` flag to CLAUDE.md. Soft-hook nudges in `/specify`, `/build`, and `/review` read the flag to decide whether to surface "consider a diagram here" recommendations. |
```

new_string:
```
| `/claude-tweaks:design` | Step 10 sets up Impeccable design integration (install plugin + CLI, optionally run `init`) and writes the `design-integration` kill-switch flag to CLAUDE.md that the wrapper reads as Layer 1 of its detection logic. |
| `cathrynlavery/diagram-design` (companion) | Step 11 offers to install the external `diagram-design` plugin and writes the `diagram-integration` flag to CLAUDE.md. Soft-hook nudges in `/specify`, `/build`, and `/review` read the flag to decide whether to surface "consider a diagram here" recommendations. |
| `shadcn/ui` (companion) | Step 12 offers to bootstrap the shadcn CLI, wire its official MCP server into `.mcp.json`, and install its official `shadcn/skills` package for live Claude Code project context. Writes the `shadcn-integration` flag to CLAUDE.md — currently write-only, no other skill reads it yet. |
```

- [ ] **Step 4: Verify**

```bash
grep -n "Step 12" skills/init/SKILL.md
```

Expected: 4 matches — the summary header, the Actions Performed row, the Relationship row, plus the summary block's own internal reference to `bootstrap-steps.md` (Step 12).

- [ ] **Step 5: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "Add Step 12 (shadcn Bootstrap) pointers to SKILL.md's step list, Actions Performed, and Relationship tables"
```

---

### Task 6: Document the shadcn companion in `README.md` and `skills/help/reference-card.md`

**Files:**
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`

**Interfaces:**
- Consumes: `README.md` and `reference-card.md` as renumbered by Task 1 (no structural changes were needed in either file beyond Task 1's mechanical pass).
- Produces: user-facing documentation of the new shadcn companion, matching the existing style used for Impeccable and diagram-design.

- [ ] **Step 1: Add a "What's new" section to README.md**

old_string:
```
Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

### What's new in v5.15.0 — code-health: risk-based triage + closing-keyword safety net
```

new_string:
```
Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

### What's new in v5.18.0 — shadcn/ui bootstrap + Phase 0 step renumbering

`/init` gains a new Optional Enhancement step: on a detected frontend project without `components.json`, it offers to bootstrap [shadcn/ui](https://ui.shadcn.com/) — CLI init, plus wiring shadcn's own first-party MCP server into `.mcp.json` and installing its official `shadcn/skills` package, both of which give Claude Code live project context so it stops guessing at component APIs. Writes a `shadcn-integration: enabled | cli-only | disabled` flag to CLAUDE.md's `## Design integration` section (currently write-only — no other skill reads it yet). See `/init` Step 12.

Also folded in: Phase 0's internal step numbering (previously `Step 0.1`–`Step 0.97`, an ad-hoc decimal scheme approaching its practical ceiling) is now two clean sequential groups — Core Bootstrap (Steps 1–8) and Optional Enhancements (Steps 9–14, order-agnostic and append-only). Every cross-reference in this README and the plugin's skill files has been updated to match.

### What's new in v5.15.0 — code-health: risk-based triage + closing-keyword safety net
```

- [ ] **Step 2: Retitle and extend the companion tools table in reference-card.md**

old_string:
```
## Recommended Companion Plugins

External Claude Code plugins claude-tweaks integrates with. `/claude-tweaks:init` Phase 0 offers to install these and writes a flag to CLAUDE.md that downstream skills read.

| Plugin | What it adds | Set up by |
|--------|-------------|-----------|
| [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Frontend design-quality LLM commands + deterministic CLI. Wired into `/test`, `/review`, `/build`, `/specify`, `/flow`, `/visual-review` via `/claude-tweaks:design`. Frontend projects only. | `/init` Step 10 (writes `design-integration:` flag) |
| [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) | 14 types of editorial HTML+SVG diagrams (architecture, flowchart, sequence, ER, state, …). Soft-hook nudges in `/specify`, `/build`, `/review` surface "consider a diagram here" recommendations. All projects. | `/init` Step 11 (writes `diagram-integration:` flag) |
```

new_string:
```
## Recommended Companion Tools

External tools claude-tweaks integrates with — Claude Code plugins and standalone CLIs alike. `/claude-tweaks:init`'s Optional Enhancement steps (9-14) offer to install these and write a flag to CLAUDE.md.

| Tool | What it adds | Set up by |
|--------|-------------|-----------|
| [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) | Frontend design-quality LLM commands + deterministic CLI. Wired into `/test`, `/review`, `/build`, `/specify`, `/flow`, `/visual-review` via `/claude-tweaks:design`. Frontend projects only. | `/init` Step 10 (writes `design-integration:` flag, read downstream) |
| [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) | 14 types of editorial HTML+SVG diagrams (architecture, flowchart, sequence, ER, state, …). Soft-hook nudges in `/specify`, `/build`, `/review` surface "consider a diagram here" recommendations. All projects. | `/init` Step 11 (writes `diagram-integration:` flag, read downstream) |
| [`shadcn/ui`](https://ui.shadcn.com/) | CLI-driven component system + its own official MCP server and Skill for AI-agent context. Frontend projects only. | `/init` Step 12 (writes `shadcn-integration:` flag — currently write-only, not yet read downstream) |
```

- [ ] **Step 3: Verify**

```bash
grep -n "shadcn" README.md skills/help/reference-card.md
```

Expected: multiple matches in both files (the new README section, the new reference-card row).

- [ ] **Step 4: Commit**

```bash
git add README.md skills/help/reference-card.md
git commit -m "Document the shadcn/ui companion integration in README and reference-card"
```

---

### Task 7: Version bump and final full-repo verification

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Re-check for a concurrent version bump**

```bash
git log --oneline -5 .claude-plugin/plugin.json
```

If a bump past `5.17.1` already landed from another session, use the next free minor version instead of `5.18.0` throughout this step.

- [ ] **Step 2: Bump the version**

old_string:
```
  "version": "5.17.1",
```

new_string:
```
  "version": "5.18.0",
```

- [ ] **Step 3: Re-run the Task 1 verification sweep as a regression guard**

Scoped to the same 13 files Task 1 renamed — **do not** widen this to a blind repo-wide
grep. `skills/visual-review/SKILL.md` has its own unrelated "Step 0.5" (that skill's own
internal step numbering, not a cross-reference to `/init`'s Phase 0) — a repo-wide sweep
would flag it as a false positive:

```bash
grep -rn "Step 0\.\|Phase 0\.[0-9]" \
  skills/init/bootstrap-steps.md skills/init/SKILL.md CLAUDE.md README.md \
  skills/help/reference-card.md skills/design/SKILL.md skills/build/worktree-setup.md \
  skills/flow/from-code-health.md skills/_shared/diagram-integration-check.md \
  skills/journeys/SKILL.md skills/review/SKILL.md skills/specify/SKILL.md \
  skills/routine/SKILL.md
```

Expected: no output. Confirms nothing regressed across Tasks 2-6, which re-touched some
of these same files.

```bash
grep -c "^### Step" skills/init/bootstrap-steps.md skills/init/SKILL.md
```

Expected: `14` for both files (Steps 1-14, no gaps, no duplicates).

```bash
npm test 2>&1 | tail -10
```

Expected: `630 pass, 1 fail` — same pre-existing statusline timing flake as Task 1 Step 4, nothing new.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version to 5.18.0 — shadcn/ui init bootstrap + Phase 0 step renumbering"
```
