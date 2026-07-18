# Health Filing-Gate Ordering Fix + Menu Symmetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the interactive filing-gate ordering bug shared by `code-health`, `harness-health`, and `docs-health` (the "how do you want to handle these findings" decision currently sits in each skill's SUMMARIZE step, after FILE has already run unconditionally — dead text), by centralizing the correct rule in a new shared fragment all four health skills (including the already-correct `journey-health`) reference, and harmonize the per-finding disposition menu to the same four options (File issue / Capture / `/specify` directly / Dismiss) everywhere.

**Architecture:** One new markdown fragment (`skills/_shared/health-filing-gate.md`) documents the applicability/scope/placement rule and the canonical menu shape. Each of the four health skills' SKILL.md gets its interactive gate block relocated into its own FILE step (before any `gh issue create` call for new findings) and its per-finding menu expanded to four options, then references the new fragment plus gets an Anti-Patterns row and a Relationship table row. `CLAUDE.md`'s Structure section gains one line documenting the new fragment. Every change is a markdown edit — no executable code changes, no new tests (per the design doc's own Testing section); verification is grep-based structural checks plus an unmodified `node --test` pass.

**Tech Stack:** Markdown skill files (`skills/**/*.md`), read directly by an LLM session — no build step, no runtime.

**Design doc:** `docs/superpowers/specs/2026-07-18-health-filing-gate-design.md`

## Global Constraints

- Every skill/shared-fragment convention from CLAUDE.md applies verbatim: Anti-Patterns rows use `| Pattern | Why It Fails |`; Relationship rows use `| Skill | Relationship |`. `_shared/*.md` fragments don't carry their own Relationship table (matching `_shared/label-bootstrap.md` and `_shared/health-state.md` precedent) — only the four consuming SKILL.md files get new Relationship rows, not the fragment itself.
- No unit tests are added or changed — these are prose-only edits. The full `node --test` suite must report the same pass/fail counts before and after (1170 passed / 1 pre-existing unrelated failure in `tests/statusline.test.js` — a timing-sensitive perf assertion, confirmed unrelated at worktree baseline).
- Commit after each task, never batch multiple tasks into one commit. Work happens on the current worktree branch (`worktree-health-filing-gate-fix`) — every `git` command in this plan assumes the working directory is already that worktree.
- `code-health`'s "Dismiss" option keeps the description `"Drop this finding"` (not `"Run mark declined so it doesn't reappear"`) in every task below — `code-health.js` has no `mark` subcommand, confirmed against the actual CLI and CLAUDE.md's Commands table. Do not "fix" this to match the other three; it's a deliberate, documented asymmetry (see the design doc's Non-Goals).

---

### Task 1: Create the shared filing-gate fragment

**Files:**
- Create: `skills/_shared/health-filing-gate.md`

**Interfaces:**
- Produces: the canonical applicability/scope/placement rule and menu shape that Tasks 2-5 each reference by name (`_shared/health-filing-gate.md`) from their own skill's FILE step, Anti-Patterns table, and Relationship table.

- [ ] **Step 1: Write the fragment file**

Create `skills/_shared/health-filing-gate.md` with this exact content:

```markdown
# Health Filing Gate — Canonical Ask-Before-File Rule

`code-health`, `harness-health`, `journey-health`, and `docs-health` each end their SELECT → JUDGE → VALIDATE/DEDUP → FILE pipeline with an interactive decision over which surviving findings actually become GitHub issues. This file is the one place that decision's *applicability*, *scope*, and *placement* are defined — consumers still write out their own batch-table columns and `AskUserQuestion` option blocks in full inline (a skill file must be self-contained for whichever session reads it), matching the canonical menu shape below.

## Applicability

Interactive (standalone) mode only. A headless Routine firing has no human present to ask — it skips this gate entirely and files every surviving finding automatically, per each skill's own Routine Configuration section.

## Scope

The gate applies only to *this firing's own brand-new findings* — the payloads surviving the verify gate and dedup that are about to be created for the first time. It does **not** re-prompt for:

- **Retry-queue drains** — a prior firing's filing that failed and is now being retried. It was already approved in that earlier firing; retrying a transient `gh` failure isn't a new proposal.
- **Regressed reopens** — an existing issue whose finding has reappeared. Reopening isn't creating anything new.

Both categories file/reopen unconditionally, before this gate ever runs.

## Placement

The gate MUST execute **inside the calling skill's own FILE step** — after retry-queue-drain and regressed-reopen handling, and before the action that turns a surviving new finding into a `gh issue create` call. It must never live in a SUMMARIZE/reporting step: that step runs after filing, by definition, so a gate placed there can't gate anything. (This is the exact bug this file exists to prevent: `code-health`, `harness-health`, and `docs-health` all originally placed the equivalent block in SUMMARIZE; `journey-health` is the one skill that placed it correctly, inside FILE, from the start.)

## Canonical menu shape

Every consumer renders its own batch table (columns matching its own Finding Shape, plus a `Recommended` column) and then calls `AskUserQuestion`:

- `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
  - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" is chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`:

- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:{skill} issue"`
- Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
- Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
- Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

Each consumer's own Recommended-column pre-fill rule uses whatever fields its own Finding Shape already computes. `code-health` keeps its existing `--min-risk`-driven severity×confidence rule (with a third fallback tier held in its `remembered` cache). `docs-health`, `harness-health`, and `journey-health` all use the same rule instead of inventing separate ones: pre-fill `"File issue"` when `confidence` is `high` or `med`, `"Capture"` when `confidence` is `low`.

"Dismiss" always runs the consumer's own `mark <id> declined` CLI command so the same proposal doesn't reappear on a future firing — except `code-health`, whose CLI has no `mark` subcommand; its "Dismiss" description stays `"Drop this finding"` since it has no persistent decline cache to write to.
```

- [ ] **Step 2: Verify the file's structure**

Run:
```bash
grep -c "^## " skills/_shared/health-filing-gate.md
```
Expected output: `4`

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/health-filing-gate.md
git commit -m "Add health-filing-gate shared fragment

Canonical applicability/scope/placement rule and menu shape for the
interactive file-all/route-individually decision all four health
skills (code-health, harness-health, journey-health, docs-health)
render before filing new findings."
```

---

### Task 2: Fix docs-health/SKILL.md

**Files:**
- Modify: `skills/docs-health/SKILL.md`

**Interfaces:**
- Consumes: `_shared/health-filing-gate.md` (Task 1) — referenced by name in prose, not executed.

- [ ] **Step 1: Relocate and expand the interactive gate**

In `skills/docs-health/SKILL.md`, find this exact text:

```
In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 7 — SUMMARIZE.**

Report: which target(s) were audited, how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Misleads | Classification | Confidence |
   |---|-------|----------|----------|-----------------|------------|
   | 1 | {title} | {category} | {misleads} | {classification} | {confidence} |
   ```

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.
```

Replace it with this exact text (moves the gate into Step 6, expands the menu, adds the Recommended column, trims Step 7 to pure reporting):

```
In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Misleads | Classification | Confidence | Recommended |
   |---|-------|----------|----------|-----------------|------------|-------------|
   | 1 | {title} | {category} | {misleads} | {classification} | {confidence} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

**Step 7 — SUMMARIZE.**

Report: which target(s) were audited, how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.
```

- [ ] **Step 2: Add the Anti-Patterns row**

Find this exact text:

```
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |

## Relationship to Other Skills
```

Replace with:

```
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills
```

- [ ] **Step 3: Add the Relationship table row**

Find this exact text:

```
| `_shared/work-record.md` | Canonical taxonomy docs-health files against — origin `by:docs-health`, scoring, `ready` stage, born-ready rule. |
```

Replace with:

```
| `_shared/work-record.md` | Canonical taxonomy docs-health files against — origin `by:docs-health`, scoring, `ready` stage, born-ready rule. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 6 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/harness-health`, and `/journey-health`. |
```

- [ ] **Step 4: Verify**

```bash
awk '/\*\*Step 7 — SUMMARIZE\.\*\*/{found=1} found && /^## /{exit} found' skills/docs-health/SKILL.md | grep -c "AskUserQuestion"
```
Expected output: `0`

```bash
grep -c "_shared/health-filing-gate.md" skills/docs-health/SKILL.md
```
Expected output: `3` (Step 6 reference, Anti-Patterns row, Relationship row)

```bash
grep -c '"File all (Recommended)"' skills/docs-health/SKILL.md
```
Expected output: `0`

- [ ] **Step 5: Commit**

```bash
git add skills/docs-health/SKILL.md
git commit -m "Fix docs-health filing-gate ordering, harmonize menu

The interactive File-all/Route-individually decision was textually
placed in SUMMARIZE, after FILE already ran unconditionally, making
it dead text. Relocates it into Step 6 (FILE), before gh issue
create, per the new _shared/health-filing-gate.md contract. Expands
the per-finding menu to match code-health's 4-option shape (adds
Capture, /specify directly)."
```

---

### Task 3: Fix code-health/SKILL.md

**Files:**
- Modify: `skills/code-health/SKILL.md`

**Interfaces:**
- Consumes: `_shared/health-filing-gate.md` (Task 1).

- [ ] **Step 1: Insert the gate before the unconditional filing loop, and condition that loop on it**

Find this exact text:

```
There is no per-criterion label anymore — the criterion is already in the issue body's header line (`**Criterion:** ...`), and nothing reads it back off a label; this was also the label class that hit GitHub's 100-char cap (see `bin/lib/code-health/issue-payload.js`).

For each payload in `/tmp/code-health-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill.

**Type expression branch.**
```

Replace with this exact text (inserts the gate, moved verbatim from its current Step 10 location; rewords the filing-loop sentence to be conditioned on the gate's outcome):

```
There is no per-criterion label anymore — the criterion is already in the issue body's header line (`**Criterion:** ...`), and nothing reads it back off a label; this was also the label class that hit GitHub's 100-char cap (see `bin/lib/code-health/issue-payload.js`).

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or reopen decisions below, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Criterion | Severity | Confidence | Recommended |
   |---|-------|-----------|----------|------------|-------------|
   | 1 | {title} | {criterion} | {severity} | {confidence} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: high severity + high confidence → `"File issue"`; below `--min-risk` or low confidence → `"Capture"`; everything else (e.g. medium severity + high confidence) → `"File issue"` — file issue is the safe default whenever a finding clears the confidence bar but isn't low-risk enough for `Capture`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub code-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Drop this finding"`

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-chosen ones otherwise), call `gh issue create`. The engine is emit-only; filing is always done by the skill.

**Type expression branch.**
```

- [ ] **Step 2: Remove the now-dead gate block from Step 10**

Find this exact text:

```
**Step 10 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs.

In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Criterion | Severity | Confidence | Recommended |
   |---|-------|-----------|----------|------------|-------------|
   | 1 | {title} | {criterion} | {severity} | {confidence} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: high severity + high confidence → `"File issue"`; below `--min-risk` or low confidence → `"Capture"`; everything else (e.g. medium severity + high confidence) → `"File issue"` — file issue is the safe default whenever a finding clears the confidence bar but isn't low-risk enough for `Capture`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub code-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Drop this finding"`
```

Replace with:

```
**Step 10 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs.
```

- [ ] **Step 3: Add the Anti-Patterns row**

Find this exact text:

```
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied at N call sites. Use `relatedAnchors` to cover every occurrence in a single finding instead. |

## Relationship to Other Skills
```

Replace with:

```
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied at N call sites. Use `relatedAnchors` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills
```

- [ ] **Step 4: Add the Relationship table row**

Find this exact text:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY → FINGERPRINT/DEDUP → FILE pipeline and shared `_shared/health-state.md` persistence, but scoped to `docs/**` for Diátaxis genre-drift + depth-mismatch + findability + staleness instead of code quality. Both file born-`ready` findings on the unified work-record contract. |
```

Replace with:

```
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY → FINGERPRINT/DEDUP → FILE pipeline and shared `_shared/health-state.md` persistence, but scoped to `docs/**` for Diátaxis genre-drift + depth-mismatch + findability + staleness instead of code quality. Both file born-`ready` findings on the unified work-record contract. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 9 applies before calling `gh issue create` on new findings — shared with `/harness-health`, `/journey-health`, and `/docs-health`. |
```

- [ ] **Step 5: Verify**

```bash
awk '/\*\*Step 10 — SUMMARIZE\.\*\*/{found=1} found && /^## /{exit} found' skills/code-health/SKILL.md | grep -c "AskUserQuestion"
```
Expected output: `0`

```bash
grep -c '"Apply all recommended (Recommended)"' skills/code-health/SKILL.md
```
Expected output: `1` (confirms the gate wasn't left duplicated in both Step 9 and Step 10)

```bash
grep -c "_shared/health-filing-gate.md" skills/code-health/SKILL.md
```
Expected output: `3`

- [ ] **Step 6: Commit**

```bash
git add skills/code-health/SKILL.md
git commit -m "Fix code-health filing-gate ordering

Step 9 unconditionally called gh issue create for every payload
before Step 10's File-all/Route-individually decision could run,
making that decision dead text (and its own Capture/specify-directly
options non-functional). Moves the gate into Step 9, before the
filing loop, per the new _shared/health-filing-gate.md contract."
```

---

### Task 4: Fix harness-health/SKILL.md

**Files:**
- Modify: `skills/harness-health/SKILL.md`

**Interfaces:**
- Consumes: `_shared/health-filing-gate.md` (Task 1).

- [ ] **Step 1: Relocate and expand the interactive gate**

Find this exact text:

```
`<issue_number>` is that cache entry's `issue` field. In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility |
   |---|-------|----------|-----------------|------------|----------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} |
   ```

   `classification`/`confidence`/`reversibility` stay visible as triage metadata — every row files the same way, so there is no per-row recommendation column to pre-fill.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

## Routine Configuration
```

Replace with this exact text (moves the gate before Step 8's heading, drops the now-stale "no per-row recommendation" sentence since a Recommended column is being added, expands the menu, and keeps the "for dismiss" line attached to the moved block instead of stranding it after Step 8):

```
`<issue_number>` is that cache entry's `issue` field. In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility | Recommended |
   |---|-------|----------|-----------------|------------|----------------|-------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

## Routine Configuration
```

- [ ] **Step 2: Add the Anti-Patterns row**

Find this exact text:

```
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |

## Relationship to Other Skills
```

Replace with:

```
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills
```

- [ ] **Step 3: Add the Relationship table row**

Find this exact text:

```
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
```

Replace with:

```
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 7 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/journey-health`, and `/docs-health`. |
```

- [ ] **Step 4: Verify**

```bash
awk '/\*\*Step 8 — SUMMARIZE\.\*\*/{found=1} found && /^## /{exit} found' skills/harness-health/SKILL.md | grep -c "AskUserQuestion"
```
Expected output: `0`

```bash
grep -c "there is no per-row recommendation column to pre-fill" skills/harness-health/SKILL.md
```
Expected output: `0`

```bash
grep -c "_shared/health-filing-gate.md" skills/harness-health/SKILL.md
```
Expected output: `3`

- [ ] **Step 5: Commit**

```bash
git add skills/harness-health/SKILL.md
git commit -m "Fix harness-health filing-gate ordering, harmonize menu

The interactive File-all/Route-individually decision was textually
placed in SUMMARIZE, after FILE already ran unconditionally, making
it dead text. Relocates it into Step 7 (FILE), before gh issue
create, per the new _shared/health-filing-gate.md contract. Expands
the per-finding menu to match code-health's 4-option shape and adds
a Recommended column (dropping the now-stale 'no per-row
recommendation' rationale)."
```

---

### Task 5: Fix journey-health/SKILL.md

**Files:**
- Modify: `skills/journey-health/SKILL.md`

**Interfaces:**
- Consumes: `_shared/health-filing-gate.md` (Task 1).

- [ ] **Step 1: Reference the fragment, expand the menu, define the Recommended column**

`journey-health`'s gate is already correctly placed inside its FILE step (Step 6) — this task only replaces the inline duplicated ordering prose with a fragment reference, renames the existing (previously undefined) `Recommendation` column to `Recommended` with an actual pre-fill rule, and expands the per-finding menu.

Find this exact text:

```
In interactive mode, render surviving findings as a markdown batch table before filing:

```
| # | Journey | Category | Section | Severity | Confidence | Recommendation |
|---|---------|----------|---------|----------|------------|----------------|
| 1 | {journey} | {category} | {section} | {severity} | {confidence} | {recommendation} |
```

Then call `AskUserQuestion` with `question`: `"File these findings as GitHub issues?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a by:journey-health-labelled GitHub issue"`
- Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {journey}/{section}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:journey-health issue"`
- Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.
```

Replace with this exact text:

```
Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), render surviving findings as a markdown batch table:

```
| # | Journey | Category | Section | Severity | Confidence | Recommended |
|---|---------|----------|---------|----------|------------|-------------|
| 1 | {journey} | {category} | {section} | {severity} | {confidence} | {File issue|Capture} |
```

Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`.

Then call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
- Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {journey}/{section}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:journey-health issue"`
- Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
- Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
- Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.
```

- [ ] **Step 2: Add the Anti-Patterns row**

Find this exact text:

```
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |

## Relationship to Other Skills
```

Replace with:

```
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills
```

- [ ] **Step 3: Add the Relationship table row**

Find this exact text:

```
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5. |
```

Replace with:

```
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 6 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/harness-health`, and `/docs-health`. |
```

- [ ] **Step 4: Verify**

```bash
awk '/\*\*Step 7 — SUMMARIZE\.\*\*/{found=1} found && /^## /{exit} found' skills/journey-health/SKILL.md | grep -c "AskUserQuestion"
```
Expected output: `0`

```bash
grep -c '"File all (Recommended)"\|| Recommendation |' skills/journey-health/SKILL.md
```
Expected output: `0`

```bash
grep -c "_shared/health-filing-gate.md" skills/journey-health/SKILL.md
```
Expected output: `3`

- [ ] **Step 5: Commit**

```bash
git add skills/journey-health/SKILL.md
git commit -m "Reference shared filing-gate fragment, harmonize menu

journey-health already placed its interactive gate correctly (inside
FILE, before gh issue create) — this only de-duplicates the inline
ordering prose onto the new _shared/health-filing-gate.md fragment,
defines the pre-fill rule for the batch table's previously-undefined
Recommendation column (renamed Recommended), and expands the
per-finding menu to match code-health's 4-option shape."
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `_shared/health-filing-gate.md` (Task 1) — cited by filename only.

- [ ] **Step 1: Add the fragment to the `_shared/*.md` bullet list**

Find this exact text (a single long line under Structure's `skills/_shared/*.md` bullet):

```
label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by capture/specify/triage/dispatch/tidy/wrap-up/init/code-health/harness-health/journey-health/docs-health/flow))
```

Replace with:

```
label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by capture/specify/triage/dispatch/tidy/wrap-up/init/code-health/harness-health/journey-health/docs-health/flow), health-filing-gate (canonical applicability/scope/placement rule + harmonized menu shape for the interactive file-all/route-individually decision, referenced by code-health/harness-health/journey-health/docs-health's own FILE steps))
```

- [ ] **Step 2: Verify**

```bash
grep -c "health-filing-gate (canonical applicability" CLAUDE.md
```
Expected output: `1`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document health-filing-gate.md in CLAUDE.md's Structure section"
```

---

### Task 7: Final verification sweep

**Files:**
- None (read-only verification across all files touched by Tasks 1-6)

**Interfaces:**
- Consumes: the final state of all files modified in Tasks 1-6.

- [ ] **Step 1: Confirm every health skill references the fragment exactly three times**

```bash
for f in skills/docs-health/SKILL.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md; do
  echo "$f: $(grep -c '_shared/health-filing-gate.md' "$f")"
done
```
Expected output (each line): `<path>: 3`

- [ ] **Step 2: Confirm no SUMMARIZE step in any of the four skills contains a leftover AskUserQuestion gate**

```bash
awk '/\*\*Step 7 — SUMMARIZE\.\*\*/{f=1} f && /^## /{exit} f' skills/docs-health/SKILL.md | grep -c AskUserQuestion
awk '/\*\*Step 10 — SUMMARIZE\.\*\*/{f=1} f && /^## /{exit} f' skills/code-health/SKILL.md | grep -c AskUserQuestion
awk '/\*\*Step 8 — SUMMARIZE\.\*\*/{f=1} f && /^## /{exit} f' skills/harness-health/SKILL.md | grep -c AskUserQuestion
awk '/\*\*Step 7 — SUMMARIZE\.\*\*/{f=1} f && /^## /{exit} f' skills/journey-health/SKILL.md | grep -c AskUserQuestion
```
Expected output: `0` four times.

- [ ] **Step 3: Confirm no stale 2-option "File all (Recommended)" phrasing survives anywhere in the four skills**

```bash
grep -rn '"File all (Recommended)"' skills/docs-health/SKILL.md skills/code-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md
```
Expected output: empty (no matches).

- [ ] **Step 4: Confirm the full test suite is unaffected**

```bash
npm test 2>&1 | tail -15
```
Expected output: `# pass 1170` and `# fail 1` (the same pre-existing `tests/statusline.test.js` timing failure confirmed unrelated at worktree baseline — no new failures, no drop in pass count).

- [ ] **Step 5: Final commit-count sanity check**

```bash
git log --oneline worktree-health-filing-gate-fix -8
```
Expected output: 6 commits from Tasks 1-6 (fragment creation, docs-health, code-health, harness-health, journey-health, CLAUDE.md) plus the two design-doc commits from the brainstorming phase, in that order (newest first).

No commit needed for this task — it's read-only verification. If any check in Steps 1-4 fails, stop and fix the specific file before considering the plan complete.
