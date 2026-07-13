# Drop Artifact-Tool Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the plugin's only call site for the `Artifact` tool (`/claude-tweaks:visualize`'s optional Step 6 "publish as a shareable link") with no replacement, and add a CLAUDE.md guardrail preventing the dependency from returning.

**Architecture:** No code paths are touched — this is a skill-content/documentation-only change. Delete the dedicated adapter sub-file, remove the offering Step and its cross-references from `/visualize`'s own files and its shared core file, then scrub the doc mentions in CLAUDE.md and README.md. A step-renumbering ripple (deleting a numbered Step shifts every later Step in that file, and any file that cross-references a shifted Step number by number must be updated too) is the main correctness risk — each task's steps verify this explicitly with `grep`.

**Tech Stack:** Markdown only. No `bin/` JS code touches the `Artifact` tool, so `npm test` is a regression baseline, not a target — it's expected to be unaffected by every task in this plan.

## Global Constraints

- Every edit removes only `Artifact`-tool references — no other content in a touched file changes.
- Files using "artifact" as the generic English word (produced file/output) are left untouched: `skills/help/context-flow.md`, `skills/help/reference-card.md`, `skills/specify/SKILL.md`, `skills/init/claude-md-template.md`, `bin/lib/harness-health/scope.js` and its tests.
- The two historical plan/spec docs from when `/visualize` was originally built (`docs/superpowers/plans/2026-07-11-visualize-diagram-generation.md`, `docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md`) and this change's own design doc (`docs/superpowers/specs/2026-07-12-drop-artifact-tool-dependency-design.md`) are frozen records — never edited by this plan.
- Version bump convention (CLAUDE.md): `.claude-plugin/plugin.json`'s `version` field, semver, minor bump for a feature-shaped change.
- This plan executes entirely inside the current worktree branch (`worktree-drop-artifact-tool-dependency`). It does **not** push to `origin main` or touch the separate `claude-tweaks-marketplace` repo — those are release actions that happen after this branch merges into `main`, handled via `superpowers:finishing-a-development-branch` plus a manual marketplace-mirror step, outside this plan's scope.

---

### Task 1: Remove the Artifact offer from `/claude-tweaks:visualize`'s own files

**Files:**
- Delete: `skills/visualize/artifact-publish.md`
- Modify: `skills/visualize/SKILL.md`
- Modify: `skills/visualize/d2-enhanced-path.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `/claude-tweaks:visualize` with no Step 6 Artifact offer; Step numbering `1→ 2 → 3 → 4 → 5 → 6 (Registry update)`. Task 2 depends on this renumbering being in place before it fixes the cross-reference at `SKILL.md`'s placement table (currently line 78, referencing `visual-html-output.md` Step 7).

- [ ] **Step 1: Baseline check — confirm the references exist before editing**

Run:
```bash
grep -cn '`Artifact`' skills/visualize/SKILL.md
grep -cn 'Artifact offer' skills/visualize/d2-enhanced-path.md
```
Expected: `3` for `SKILL.md`, `1` for `d2-enhanced-path.md`.

- [ ] **Step 2: Delete the adapter sub-file**

```bash
git rm skills/visualize/artifact-publish.md
```

- [ ] **Step 3: Edit `skills/visualize/SKILL.md` — description line**

Before:
```
Generates a self-contained HTML+SVG diagram, themed from the project's own design tokens, embeddable in project docs and optionally publishable via the `Artifact` tool.
```
After:
```
Generates a self-contained HTML+SVG diagram, themed from the project's own design tokens, embeddable in project docs.
```

- [ ] **Step 4: Edit `skills/visualize/SKILL.md` — delete Step 6, renumber old Step 7 to Step 6**

Before:
```
### Step 6: Offer to publish via Artifact

If the `Artifact` tool is not available in the current session (plan/org gating, Agent SDK, or any other reason it doesn't appear in the available tools), skip this step silently — do not mention Artifact publishing at all. Otherwise, call `AskUserQuestion`: `question`: `"Also publish this as a shareable Artifact link?"`, `header`: `"Artifact"`, options `"Yes"` / `"No"` — no default marked Recommended; this is a genuine toss-up, not a best-practice call. On `"Yes"`, read `artifact-publish.md` in this skill's directory.

### Step 7: Registry update (persisted diagrams only)

If Step 3 resolved to `docs/diagrams/{slug}.html` (the context-free fallback path) and no `REGISTRY.md` row for `docs/diagrams/` exists yet, add one: `| docs/diagrams/ | Generated visual diagrams | — |` (no Auto-detect — matches `architecture.md`/`decisions/*.md` treatment). Diagrams placed under `docs/journeys/` or `docs/plans/` need no new row — they ride along with that doc's existing registry entry.
```
After:
```
### Step 6: Registry update (persisted diagrams only)

If Step 3 resolved to `docs/diagrams/{slug}.html` (the context-free fallback path) and no `REGISTRY.md` row for `docs/diagrams/` exists yet, add one: `| docs/diagrams/ | Generated visual diagrams | — |` (no Auto-detect — matches `architecture.md`/`decisions/*.md` treatment). Diagrams placed under `docs/journeys/` or `docs/plans/` need no new row — they ride along with that doc's existing registry entry.
```

- [ ] **Step 5: Edit `skills/visualize/SKILL.md` — Next Actions intro**

Before:
```
After generating (and, if accepted, publishing), call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:
```
After:
```
After generating, call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:
```

- [ ] **Step 6: Edit `skills/visualize/SKILL.md` — reword the "drift apart" Anti-Pattern row**

Before:
```
| Regenerating the core fragment separately per wrapper | The standalone file, markdown embed, and Artifact-published version drift apart. Generate once (Step 4), wrap three ways (Step 5). |
```
After:
```
| Regenerating the core fragment separately per wrapper | The standalone file and markdown embed drift apart. Generate once (Step 4), wrap two ways (Step 5). |
```

- [ ] **Step 7: Edit `skills/visualize/SKILL.md` — delete the "Auto-invoking the Artifact tool" Anti-Pattern row**

Delete this entire table row (it sits between the "Forcing a baseline-only type..." row and the "Writing every diagram to a single central..." row):
```
| Auto-invoking the `Artifact` tool without asking | Publishing is always an explicit `AskUserQuestion` — never automatic, and silently skipped (not failed) if the tool isn't present in the session. |
```

- [ ] **Step 8: Edit `skills/visualize/d2-enhanced-path.md` — drop "the Artifact offer" clause**

Before:
```
Placement, wrapper generation, and the Artifact offer proceed identically to the baseline path from here.
```
After:
```
Placement and wrapper generation proceed identically to the baseline path from here.
```

- [ ] **Step 9: Verify — zero Artifact-tool references remain in this task's files**

Run:
```bash
grep -n '`Artifact`' skills/visualize/SKILL.md skills/visualize/d2-enhanced-path.md
test -f skills/visualize/artifact-publish.md && echo "STILL EXISTS" || echo "DELETED"
```
Expected: no output from the `grep` (both files clean), and `DELETED` from the `test`.

- [ ] **Step 10: Verify Step numbering is sequential in `SKILL.md`**

Run:
```bash
grep -n '^### Step' skills/visualize/SKILL.md
```
Expected: six headers, `Step 1` through `Step 6`, no gaps, no repeats, ending in `### Step 6: Registry update (persisted diagrams only)`.

- [ ] **Step 11: Commit**

```bash
git add skills/visualize/SKILL.md skills/visualize/d2-enhanced-path.md
git commit -m "Remove Artifact-tool offer from /visualize's own files"
```

---

### Task 2: Remove the Artifact adapter delegate from the shared core file, fix the resulting cross-reference

**Files:**
- Modify: `skills/_shared/visual-html-output.md`
- Modify: `skills/visualize/SKILL.md` (one line — a cross-reference this task's renumbering makes stale)

**Interfaces:**
- Consumes: Task 1's renumbered `SKILL.md` (this task edits the same file again, at a different, unrelated line).
- Produces: `visual-html-output.md` with no "Artifact publish (delegate)" Step; Step numbering `1 → 2 → 3 → 4 → 5 → 6 (Persist-vs-ephemeral)`.

- [ ] **Step 1: Baseline check**

Run:
```bash
grep -cn '`Artifact`' skills/_shared/visual-html-output.md
```
Expected: `4`.

- [ ] **Step 2: Edit `visual-html-output.md` — opening description**

Before:
```
Reusable procedure for producing themed, self-contained HTML+SVG visual output: token extraction from Impeccable's `DESIGN.md`, the core-fragment/wrapper-adapter pattern, MDX/Nextra docs-server compatibility, the `Artifact` publish adapter, and the persist-vs-ephemeral decision. Referenced by `/claude-tweaks:visualize` (diagrams). Any future skill producing themed HTML report output (e.g. a `/code-health`, `/harness-health`, `/journey-health`, or `/review` report mode) can invoke this file directly — it has no callable surface of its own, every step below is executed by the calling skill.
```
After:
```
Reusable procedure for producing themed, self-contained HTML+SVG visual output: token extraction from Impeccable's `DESIGN.md`, the core-fragment/wrapper-adapter pattern, MDX/Nextra docs-server compatibility, and the persist-vs-ephemeral decision. Referenced by `/claude-tweaks:visualize` (diagrams). Any future skill producing themed HTML report output (e.g. a `/code-health`, `/harness-health`, `/journey-health`, or `/review` report mode) can invoke this file directly — it has no callable surface of its own, every step below is executed by the calling skill.
```

- [ ] **Step 3: Edit `visual-html-output.md` — reword the "drift apart" line**

Before:
```
This SVG+style pair is the **core** — every wrapper below reuses it byte-for-byte. Never regenerate it per-wrapper; regenerating independently per consumer is exactly how the standalone file and the Artifact-published version would drift apart.
```
After:
```
This SVG+style pair is the **core** — every wrapper below reuses it byte-for-byte. Never regenerate it per-wrapper; regenerating independently per consumer is exactly how the standalone file and the markdown embed would drift apart.
```

- [ ] **Step 4: Edit `visual-html-output.md` — remove the "Artifact publish" row from the Step 4 wrapper table**

Before:
```
| Consumer | Wrapper |
|---|---|
| Standalone local file | `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{Diagram Title}</title></head><body>{core}{handshake script from Step 5}</body></html>` |
| Markdown embed | Bare `{core}` — no title, no handshake script, pasted directly into the doc |
| Artifact publish | `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`/`<html>`/`<head>`/`<body>`, per the `Artifact` tool's own contract (see `skills/visualize/artifact-publish.md`) |
```
After:
```
| Consumer | Wrapper |
|---|---|
| Standalone local file | `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{Diagram Title}</title></head><body>{core}{handshake script from Step 5}</body></html>` |
| Markdown embed | Bare `{core}` — no title, no handshake script, pasted directly into the doc |
```

- [ ] **Step 5: Edit `visual-html-output.md` — delete old Step 6, renumber old Step 7 to Step 6, reword its "Artifact" rationale**

Before:
```
## Step 6: Artifact publish (delegate)

Offering to publish via the `Artifact` tool is a distinct procedure — read `skills/visualize/artifact-publish.md` only when the user accepts the offer.

## Step 7: Persist-vs-ephemeral

| Context | Default | Still asks? |
|---|---|---|
| Invoked via a soft-hook caller already producing a doc (e.g. `/journeys`, `/specify`, `/review`) | Save as project doc | No |
| Invoked directly, ad-hoc, no calling context | — | Yes — `AskUserQuestion`: `"Save as a project doc"` / `"Just show me now (not saved)"` / `"Both"` |

"Just show me now" still writes the core fragment + standalone wrapper to a scratch path first — the `Artifact` tool needs a real file on disk regardless of whether the output is meant to be a durable project doc. It just never lands under a project's `docs/` tree, is never registered in `REGISTRY.md`, and the MDX-embed reference snippet from Step 5 is not offered (there's nothing to embed if it isn't staying in the project).
```
After:
```
## Step 6: Persist-vs-ephemeral

| Context | Default | Still asks? |
|---|---|---|
| Invoked via a soft-hook caller already producing a doc (e.g. `/journeys`, `/specify`, `/review`) | Save as project doc | No |
| Invoked directly, ad-hoc, no calling context | — | Yes — `AskUserQuestion`: `"Save as a project doc"` / `"Just show me now (not saved)"` / `"Both"` |

"Just show me now" still writes the core fragment + standalone wrapper to a scratch path first, so there's something the user can open locally regardless of whether the output is meant to be a durable project doc. It just never lands under a project's `docs/` tree, is never registered in `REGISTRY.md`, and the MDX-embed reference snippet from Step 5 is not offered (there's nothing to embed if it isn't staying in the project).
```

- [ ] **Step 6: Fix the now-stale cross-reference in `skills/visualize/SKILL.md`**

This file's Step 3 placement table (unrelated to Task 1's edits) references `visual-html-output.md` by Step number. Step 5 of this task shifted that target from Step 7 to Step 6.

Before:
```
| *(none — direct invocation)* | Run `visual-html-output.md` Step 7's `AskUserQuestion`; "Save as a project doc" resolves to `docs/diagrams/{slug}.html` |
```
After:
```
| *(none — direct invocation)* | Run `visual-html-output.md` Step 6's `AskUserQuestion`; "Save as a project doc" resolves to `docs/diagrams/{slug}.html` |
```

- [ ] **Step 7: Verify — zero Artifact-tool references remain, Step numbering sequential**

Run:
```bash
grep -n '`Artifact`' skills/_shared/visual-html-output.md
grep -n '^## Step' skills/_shared/visual-html-output.md
grep -n 'Step 7' skills/visualize/SKILL.md
```
Expected: first `grep` outputs nothing. Second `grep` shows six headers, `Step 1` through `Step 6`, ending in `## Step 6: Persist-vs-ephemeral`. Third `grep` outputs nothing (no remaining `Step 7` reference anywhere in `SKILL.md`).

- [ ] **Step 8: Commit**

```bash
git add skills/_shared/visual-html-output.md skills/visualize/SKILL.md
git commit -m "Remove Artifact-publish delegate from visual-html-output.md, fix stale Step cross-reference"
```

---

### Task 3: Update top-level docs and bump the version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (these are independent top-level files).
- Produces: the finished, mergeable state of this plan. This is the last task — its final step is a full-repo verification sweep confirming no task left a stray reference anywhere.

- [ ] **Step 1: Baseline check**

Run:
```bash
grep -cn 'artifact-publish' CLAUDE.md
grep -cn '`Artifact`' README.md
```
Expected: `1` for `CLAUDE.md`, `2` for `README.md`.

- [ ] **Step 2: Edit `CLAUDE.md` — structure table row for `visualize`'s sub-files**

Before:
```
| visualize | d2-enhanced-path.md, artifact-publish.md | D2 CLI invocation + re-theming procedure (loaded only when the `d2` binary is installed and the diagram type maps to it); Artifact-publish adapter with favicon table (loaded only when the user accepts the publish offer) |
```
After:
```
| visualize | d2-enhanced-path.md | D2 CLI invocation + re-theming procedure (loaded only when the `d2` binary is installed and the diagram type maps to it) |
```

- [ ] **Step 3: Edit `CLAUDE.md` — add the new Don'ts guardrail**

Insert immediately after this existing bullet (in the `## Don'ts` list):
```
- Don't call `mcp__claude-in-chrome__*` tools directly in plugin skills — `/browse` and its consumers (`/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`) use `agent-browser` exclusively, since it's the only backend that works in both interactive sessions and hosted Routines (claude-in-chrome has no headless/cloud mode). Exception: `/browse backend=chrome`, human-invoked only, never from auto mode or a Routine.
```
add this new bullet directly below it:
```
- Don't call the `Artifact` tool from plugin skills — it requires claude.ai-hosted availability that isn't guaranteed across environments (Agent SDK, headless/cloud Routines, some plans/orgs), and publishing pushes project content to a third-party hosted link even when opt-in. `/claude-tweaks:visualize` writes a self-contained standalone HTML file to disk instead — that's the durable, portable output.
```

- [ ] **Step 4: Edit `README.md` — changelog mention**

Before:
```
An optional D2-backed enhanced rendering path handles diagrams-as-code source generation for types with a native D2 construct, and an optional `Artifact`-publish channel offers a shareable link. The same three soft-hook call sites
```
After:
```
An optional D2-backed enhanced rendering path handles diagrams-as-code source generation for types with a native D2 construct. The same three soft-hook call sites
```

- [ ] **Step 5: Edit `README.md` — skill catalog mention**

Before:
```
themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up), with an optional D2-backed enhanced rendering path and an optional `Artifact`-publish channel. Soft-hook nudges
```
After:
```
themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up), with an optional D2-backed enhanced rendering path. Soft-hook nudges
```

- [ ] **Step 6: Bump the version**

Read `.claude-plugin/plugin.json`'s current `version` field first — confirm it is still `5.27.2` (i.e. no concurrent bump has landed on this branch's base since it was cut). If it's something other than `5.27.2`, stop and pick the correct next-minor value instead of blindly applying `5.28.0`.

Before:
```json
  "version": "5.27.2",
```
After:
```json
  "version": "5.28.0",
```

- [ ] **Step 7: Verify — no stray references anywhere in the repo, version bumped correctly**

Run:
```bash
grep -rn '`Artifact`' --include="*.md" . \
  | grep -v node_modules \
  | grep -v 'docs/superpowers/plans/2026-07-11-visualize-diagram-generation.md' \
  | grep -v 'docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md' \
  | grep -v 'docs/superpowers/specs/2026-07-12-drop-artifact-tool-dependency-design.md' \
  | grep -v 'docs/superpowers/plans/2026-07-12-drop-artifact-tool-dependency.md'
grep -n '"version"' .claude-plugin/plugin.json
```
Expected: first `grep` outputs nothing (zero remaining live references outside the four excluded historical/design/plan docs). Second `grep` shows `"version": "5.28.0",`.

- [ ] **Step 8: Run the full test suite as a regression baseline**

Run: `npm test 2>&1 | tail -10`
Expected: `# fail 0` (this change touches no `bin/` code, so the suite should be unaffected — this step exists to catch anything unexpected, not because failures are anticipated).

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md README.md .claude-plugin/plugin.json
git commit -m "Update docs for Artifact-tool removal, add guardrail, bump version to 5.28.0"
```

---

## After This Plan

This plan's scope ends at Task 3's commit, on branch `worktree-drop-artifact-tool-dependency`. Getting the change live is a separate, subsequent step:

1. `superpowers:finishing-a-development-branch` to merge this branch into `main` and push.
2. A manual follow-up (not part of this plan) mirroring the version into `thomasholknielsen/claude-tweaks-marketplace`'s `.claude-plugin/marketplace.json` (`plugins[].version` → `5.28.0`), committed and pushed there — per CLAUDE.md's two-repo release process, and per the user's "Full release" choice during brainstorming.
