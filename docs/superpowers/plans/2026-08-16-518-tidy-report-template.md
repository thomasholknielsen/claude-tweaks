# Tidy Report Template (Applied/Approve/Yours/Clean) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both of tidy's report surfaces with one literal verb-grouped template — Applied / Approve / Yours / Clean — with a stated bucket-mapping rule, shared Report rules, hard gates on both surfaces, and a Yours-driven Next Actions block.

**Architecture:** Prose-only skill edit. The template and all binding rules live once in `step-6-auto.md`; `step-6-interactive.md` keeps its decision mechanics (Apply-all/Override) but renders the same template and cross-references the rules; `SKILL.md`'s Next Actions derives from the Yours section.

**Tech Stack:** Markdown skill prose. Verification = greps, no tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T010137-spec-517-518-519/spec-518/work/518-spec.md`

## Global Constraints

- Prose-only: no `bin/` changes, no routing-table (tier column) changes — the routing table in `step-6-auto.md` lines 8-37 is untouched (sibling #519 owns it).
- The four literal section headers, exactly: `**Applied automatically**`, `**Approve ({N})**`, `**Yours ({N})**`, `**Clean:**`.
- Every binding rule stated ONCE, in `step-6-auto.md`'s `### Report rules`; the interactive file cross-references by heading name and restates nothing.
- Skill references inside actionable text use the fully-qualified `/claude-tweaks:{skill}` form.
- No box-drawing characters (`┌`, `│`, `└`) mandated or exemplified anywhere in `skills/tidy/`.
- No cross-skill edge restatements (edges live in `docs/skill-graph.md` — and no edges change here).
- Commit style `{Verb} {what} — {detail}` ending `refs #518`, never a closing keyword.
- Work only in the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-517-518-519`; verify `pwd` + `git rev-parse --show-toplevel` before commits.

## Verified current state

- `skills/tidy/step-6-auto.md:47` — the "Standalone auto:" paragraph ends with: `Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).` ← the one-clause instruction this plan replaces.
- `skills/tidy/step-6-interactive.md:8-55` — the `## Tidy Report` fenced template (artifact-type-grouped table + Cross-Spec Patterns + Design Record Drift + Summary). Lines 57-63: the `AskUserQuestion` (Apply all / Override) and the "Hard gate" paragraph whose text names "Actions, and Cross-Spec Patterns / Design Record Drift when non-empty". Line 65: Override follow-up rule. Line 67: Keep/no-mutation visibility note.
- `skills/tidy/SKILL.md:225-233` — `## Next Actions` fixed four-option menu (Help dashboard / Build {N} / Specify {topic} / Refine the queue).

---

### Task 1: `step-6-auto.md` — template, Report rules, bucket mapping, hard gate

**Files:**
- Modify: `skills/tidy/step-6-auto.md`

**Interfaces:**
- Produces: the `### Report rules` heading (cross-referenced by Task 2's file, by exact name) and the four literal section headers (grepped by Task 4).

- [ ] **Step 1: Replace the one-clause instruction**

In the "Standalone auto:" paragraph, replace the final sentence

```
Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).
```

with

```
Render the report per the template below (this is the bookend-end for the standalone run; no separate Review Console).
```

- [ ] **Step 2: Append the template + rules + mapping + gate sections**

Insert the following immediately after the "Standalone auto:" paragraph (before the `#### Archival compaction` section), verbatim:

````markdown
#### The report template (standalone auto)

Four verb-grouped sections, these exact literal headers, in this order — what tidy **did**, what it **will do on a click**, what **only the human can do**, and what came back clean:

```markdown
## Tidy Report — {date}

**Applied automatically**
- {what was done}: #{N} "{title}" — {one-line outcome} ({reversibility: commit {hash} | reconcile-converged})
- …

**Approve ({N})**
- [{tag}] #{N} "{title}" — {staged action, one line} → approve applies: `{the exact command or mutation}`
- …

**Yours ({N})**
- #{N} "{title}" — {why it needs the human} → `{paste-ready command}`
- …

**Clean:** {comma list of scans with nothing to report, each with its count — e.g. "parked (3 checked), worktrees (2), doc registry"}
```

Empty-state rule: **Applied automatically**, **Approve ({N})**, and **Yours ({N})** are each omitted entirely when empty. **Clean:** always renders — as the comma list above, or as `**Clean:** nothing — every scan surfaced findings`.

#### Bucket mapping (which section a finding lands in)

A finding's section is a function of its routing outcome from the table above — never per-run judgment:

| Routing outcome | Section |
|---|---|
| Auto-applied (executed this run) or reconcile-converged | **Applied automatically** |
| Staged with an executable action (awaiting approval) | **Approve ({N})** |
| Auto (no-op, always surfaced) — a finding recommending a command the human runs (needs-scoring, re-triage, acceptance gaps, parked triggers, unsettled runs, ungranted PRs, patterns, drift) | **Yours ({N})** |
| Keep / nothing-to-report scans | **Clean:** (counted in the comma list, never itemized) |

No finding may be presented information-only: anything actionable carries its paste-ready command in **Yours** or lands in **Approve**.

#### Report rules

Binding rules for every rendering of this template, on both surfaces (`step-6-interactive.md` cross-references this heading rather than restating):

- No box-drawing tables anywhere in the report — sections are markdown lists and plain tables only.
- Every actionable line carries a paste-ready command (fully-qualified `/claude-tweaks:{skill}` form for skill invocations) or lands in **Approve ({N})**.
- Records render as `#{N} "{title}"` — titles come from the scan agents' Template-A findings, which already carry them (the dispatch prompts require item titles in the Finding column); never from a fresh per-row `gh issue view`.
- `{run-dir}/decisions.md` is referenced by path exactly once, in the report footer, and never replayed into chat.

#### Hard gate (report before question)

Check the response you are about to send: does it already contain the report above as literal rendered markdown — every non-empty section of **Applied automatically**, **Approve ({N})**, **Yours ({N})**, and the **Clean:** line? If not, render it now, in this response, before any `AskUserQuestion` call. `AskUserQuestion` cannot carry the report itself (`docs/skill-authoring.md`'s Multi-item decisions convention), so a response with a question but no report above it has asked for a decision with nothing to decide on.
````

- [ ] **Step 3: Verify**

Run: `grep -c 'Applied automatically' skills/tidy/step-6-auto.md` (≥1), `grep -c 'Approve ({N})' skills/tidy/step-6-auto.md` (≥1), `grep -c '### Report rules' skills/tidy/step-6-auto.md` (=1), and confirm the routing table (lines 8-37) is byte-identical (`git diff` shows no hunk touching it).

- [ ] **Step 4: Commit**

```bash
git add skills/tidy/step-6-auto.md
git commit -m "Add Applied/Approve/Yours/Clean template to tidy's standalone-auto bookend — bucket mapping, Report rules, hard gate, refs #518"
```

---

### Task 2: `step-6-interactive.md` — same template, retained mechanics

**Files:**
- Modify: `skills/tidy/step-6-interactive.md`

**Interfaces:**
- Consumes: Task 1's `### Report rules` heading name (cross-reference only).

- [ ] **Step 1: Replace the `## Tidy Report` fenced template (lines 8-55)**

Replace the entire fenced ```markdown template block (the artifact-type-grouped `### Actions` table through the `### Summary` block) with:

````markdown
```markdown
## Tidy Report — {date}

**Applied automatically**
- {what was done}: #{N} "{title}" — {one-line outcome} ({reversibility: commit {hash} | reconcile-converged})
- …

**Approve ({N})**
- [{tag}] #{N} "{title}" — {recommended action, one line} → apply-all executes: `{the exact command or mutation}`
- …

**Yours ({N})**
- #{N} "{title}" — {why it needs the human} → `{paste-ready command}`
- …

**Clean:** {comma list of scans with nothing to report, each with its count} — or `nothing — every scan surfaced findings`
```

Section semantics follow `step-6-auto.md`'s Bucket mapping and are bound by its "Report rules" section (stated once there — not restated here): in interactive mode, **Applied automatically** carries only what already executed without a decision (reconcile-converged outcomes and `--dry-run`-exempt no-ops); every active recommendation from the scans (delete, defer, absorb, promote, sync, fix, close, resolve, capture, open parent gate — every mutating entry in `SKILL.md`'s Action Vocabulary table) renders as a numbered line in **Approve ({N})**, which is the set "Apply all" applies; findings that only a human can act on (needs-scoring, re-triage, acceptance gaps, trigger-met parked records, unsettled runs, ungranted PRs, cross-spec patterns, design-record drift) render in **Yours ({N})** with their paste-ready command; Keep rows and clean scans are counted in **Clean:** — kept visible as counts, never itemized rows.
````

- [ ] **Step 2: Update the `AskUserQuestion` options**

Replace the two option lines (currently `"Apply all (Recommended)"` / `"Apply all recommendations shown above"` and `"Override specific items"` / `"Tell me which #s to change"`) with:

```
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply every item in the Approve ({N}) section above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which Approve #s to change"`
```

(Options reference the Approve section by name and count — they never enumerate rows; `AskUserQuestion` cannot carry tables.)

- [ ] **Step 3: Update the hard gate's section names**

Replace the hard-gate paragraph's parenthetical `with a row for every finding (Actions, and Cross-Spec Patterns / Design Record Drift when non-empty)` so the full sentence reads:

```
**Hard gate.** Check the response you are about to send: does it already contain the `## Tidy Report` block above as literal rendered markdown, with every non-empty section — **Applied automatically**, **Approve ({N})**, **Yours ({N})** — and the **Clean:** line? If not, this is not "the report was presented earlier" or "the user can infer the items from the summary" — render it now, in this response, before the tool call. `AskUserQuestion` cannot carry the report itself (`docs/skill-authoring.md`'s Multi-item decisions convention), so a response with the tool call but no report above it has shown the user "Apply all" with nothing to apply it to.
```

- [ ] **Step 4: Reconcile the trailing visibility note**

Replace the final paragraph (line 67, "Items recommended as Keep … not a fixed subset of it.") with:

```
Only items in **Approve ({N})** are executed — every mutating entry in `SKILL.md`'s Action Vocabulary table, not a fixed subset of it. **Yours ({N})** and **Clean:** items require no mutation and are never touched by "Apply all".
```

- [ ] **Step 5: Verify**

`grep -c '### Report rules' skills/tidy/step-6-interactive.md` = 0 (heading lives only in the auto file); `grep -c 'Report rules' skills/tidy/step-6-interactive.md` ≥ 1 (the cross-reference); all four literal headers present; no `┌`/`│`/`└` anywhere in `skills/tidy/`.

- [ ] **Step 6: Commit**

```bash
git add skills/tidy/step-6-interactive.md
git commit -m "Render tidy's interactive report in the Applied/Approve/Yours/Clean template — Approve-scoped apply-all, updated hard gate, refs #518"
```

---

### Task 3: `SKILL.md` — Yours-driven Next Actions

**Files:**
- Modify: `skills/tidy/SKILL.md` (the `## Next Actions` block only, lines 225-233)

- [ ] **Step 1: Replace the block**

Replace the current fixed four-option `## Next Actions` content with:

```markdown
## Next Actions

Derive the options from the report's **Yours ({N})** section: take up to three Yours items, in report order, one option each — `label` naming the item's action (≤5 words), `description` carrying the item's own paste-ready command verbatim (fully-qualified `/claude-tweaks:{skill}` form). The final option is always the help dashboard. When **Yours** is empty, render the fixed menu below unchanged.

Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Options 1-3 (when Yours items exist) — one per Yours item as derived above, first option suffixed `(Recommended)`
- Final option (always) — `label`: `"Help dashboard"` (suffixed `(Recommended)` when Yours is empty), `description`: `"/claude-tweaks:help — full pipeline status with refreshed counts after the cleanup"`

Empty-Yours fallback (the fixed menu, unchanged from before this derivation rule existed):

- Option 1 — `label`: `"Help dashboard (Recommended)"`, `description`: `"/claude-tweaks:help — full pipeline status with refreshed counts after the cleanup"`
- Option 2 — `label`: `"Build {N}"`, `description`: `"/claude-tweaks:build {N} — build the highest-priority ready spec surfaced by the tidy report"`
- Option 3 — `label`: `"Specify {topic}"`, `description`: `"/claude-tweaks:specify {topic} — specify an unspecified design doc surfaced by the audit"`
- Option 4 — `label`: `"Refine the queue"`, `description`: `"/claude-tweaks:backlog refine — authorize any ready-but-unscored or bot:blocked records the audit surfaced"`
```

- [ ] **Step 2: Verify**

`grep -c 'Yours' skills/tidy/SKILL.md` ≥ 2 (derivation rule + empty-fallback mention); the Component-Skill Contract and Anti-Patterns sections below the block are untouched.

- [ ] **Step 3: Commit**

```bash
git add skills/tidy/SKILL.md
git commit -m "Derive tidy Next Actions from the report's Yours section — cap of three plus dashboard, empty-Yours fallback, refs #518"
```

---

### Task 4: Acceptance-criteria verification sweep

**Files:** none — verification only; leaves the tree clean.

- [ ] **Step 1: Run every AC grep**

```bash
grep -l 'Applied automatically' skills/tidy/step-6-auto.md skills/tidy/step-6-interactive.md   # AC1: both files
grep -l 'Approve (' skills/tidy/step-6-auto.md skills/tidy/step-6-interactive.md                # AC1: both files
grep -l 'Yours (' skills/tidy/step-6-auto.md skills/tidy/step-6-interactive.md                  # AC1: both files
grep -l 'Clean:' skills/tidy/step-6-auto.md skills/tidy/step-6-interactive.md                   # AC1: both files
grep -c '### Report rules' skills/tidy/step-6-auto.md                                            # AC2: exactly 1
grep -c '### Report rules' skills/tidy/step-6-interactive.md                                     # AC2: exactly 0 (cross-ref only)
grep -rn 'Hard gate' skills/tidy/step-6-auto.md                                                  # AC3: present, names new sections
grep -n 'Yours' skills/tidy/SKILL.md                                                             # AC4: derivation + fallback
grep -rn $'┌\|│\|└' skills/tidy/ ; echo "exit=$?"                                 # AC5: no matches (exit 1)
```

AC6 is a read-check: confirm the bucket-mapping table names a section for Auto-applied, Staged-executable, no-op-surfaced, and Keep outcomes.

- [ ] **Step 2: Full suite sanity**

Run `npm test` redirected to a file and read the tail — prose-only change, but `tests/` includes skill-structure conformance suites that may assert on skill files. Expect 0 failures.
