# Design Decisions-Log Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the compliance gap where `/design polish` mode — the design wrapper's only code-modifying mode — never writes to the mandatory auto-decision log (`decisions.md`), and register polish-phase dispatch in the auto-mode contract's own decision index, which currently has no row for it at all.

**Architecture:** Prose-only change to three existing skill markdown files, following the approach already approved in the design doc: `/design polish` (`skills/design/modes/polish.md`) reports *what* to log via a new `decision_summary` output field, built from data it already has; `/flow` (`skills/flow/SKILL.md`) — which already loops over `commands_invoked` once per polish-phase run for the pipeline ledger — is extended to also append the `decisions.md` entry using that field. `skills/_shared/auto-mode-contract.md` gets one new registry row.

**Tech Stack:** Markdown skill files (Claude Code plugin content). No code, no build step. Verification is grep-based consistency checking, not `node --test`.

## Global Constraints

- **`decision_summary`'s construction rule lives in exactly one place:** `skills/design/modes/polish.md` Step 7. `skills/flow/SKILL.md` consumes the field by name; it does not re-derive or duplicate the formatting rule.
- **`decisions.md`'s entry schema lives in `_shared/auto-decision-log.md`** (pre-existing, not modified by this plan) — the new entry this plan adds must match that schema's format (`- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.`), not invent a new one.
- **Scope boundary:** only `polish` mode gets `decision_summary` — the design doc's Scope section confirms the other five `/design` modes (`test`, `review`, `shape`, `pre-build`, `survey`) are deterministic, advisory, or read-only and don't apply/select anything on the user's behalf.
- **No test suite applies:** `npm test` (this repo's `node --test` suite) covers `bin/` JS and hook logic, not skill markdown prose. Do not add or modify any `.test.js` file for this plan.

---

### Task 1: Add `decision_summary` to `/design polish`'s output contract

**Files:**
- Modify: `skills/design/modes/polish.md:66-97` (insert a new `### Step 7` between the existing Step 6's last paragraph and the `## Output to caller` heading; add a `decision_summary` key to the non-empty example JSON; add one clarifying sentence to the empty-case JSON's surrounding prose)

**Interfaces:**
- Consumes: nothing from other tasks — this task defines the field.
- Produces: the field name `decision_summary` (string) and its exact construction rule, for Task 2 to consume by reference (not re-derive). Shape: present only when `commands_invoked` is non-empty; a single sentence: `"Dispatched {N} Impeccable commands on {M} files — {category list}."`

- [ ] **Step 1: Insert Step 7 and update the output JSON**

In `skills/design/modes/polish.md`, find this exact existing text (currently lines 66–97):

```markdown
**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations. Do not auto-dispatch them from `polish`.

**No declined-recommendation suppression in polish.** Declined-recommendation tracking applies to `survey` mode only — `polish` always honors the explicit `design-intent:` declaration. The user changes intent dispatch behavior by editing the spec frontmatter, not by declining recommendations.

## Output to caller

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
  ],
  "files_modified": [ "<path>", ... ]
}
```

Or, when no commands ran (skip from preconditions, or zero files in scope, or no findings + no auto-fit applicable):

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [],
  "files_modified": [],
  "note": "Auto-fit ran with zero net changes" | "No frontend files in scope"
}
```

`polish` is the **first wrapper mode that modifies code.** Callers (`/flow` polish phase) must follow up with re-verification (types/lint/tests) when `files_modified` is non-empty.
```

Replace it with:

```markdown
**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations. Do not auto-dispatch them from `polish`.

**No declined-recommendation suppression in polish.** Declined-recommendation tracking applies to `survey` mode only — `polish` always honors the explicit `design-intent:` declaration. The user changes intent dispatch behavior by editing the spec frontmatter, not by declining recommendations.

### Step 7: Build `decision_summary`

When `commands_invoked` is non-empty, build a single-sentence summary for the caller to log to the auto-decision log: `"Dispatched {N} Impeccable commands on {M} files — {category list}."` where `N` is the total count of entries in `commands_invoked`, `M` is the count of unique files across all invoked commands, and `{category list}` is built by grouping `commands_invoked` entries by their `category` field, semicolon-separated, in the order auto-fit, issue-driven, intent-driven — skip any category with zero entries:

- **auto-fit** clause: `auto-fit: {comma-separated command names}` (no trigger — auto-fit never has one)
- **issue-driven** clause: `issue-driven: {command} ({trigger})` per distinct command, comma-separated within the clause when more than one dispatched
- **intent-driven** clause: same shape as issue-driven — `intent-driven: {command} ({trigger})`, comma-separated within the clause when more than one dispatched

Worked example — 3 auto-fit commands (`polish`, `clarify`, `harden`), 1 issue-driven (`typeset`, triggered by `audit:typography`), 1 intent-driven (`bolder`, triggered by `intent:bold`), across 3 files:

```
Dispatched 5 Impeccable commands on 3 files — auto-fit: polish, clarify, harden; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold).
```

When `commands_invoked` is empty, do not build `decision_summary` — omit the field entirely from the output.

## Output to caller

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
  ],
  "files_modified": [ "<path>", ... ],
  "decision_summary": "Dispatched 5 Impeccable commands on 3 files — auto-fit: polish; issue-driven: typeset (audit:typography); intent-driven: bolder (intent:bold), delight (intent:delightful), animate (intent:delightful)."
}
```

Or, when no commands ran (skip from preconditions, or zero files in scope, or no findings + no auto-fit applicable):

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [],
  "files_modified": [],
  "note": "Auto-fit ran with zero net changes" | "No frontend files in scope"
}
```

Note `decision_summary` is absent from the empty-`commands_invoked` case above — there is nothing to log.

`polish` is the **first wrapper mode that modifies code.** Callers (`/flow` polish phase) must follow up with re-verification (types/lint/tests) when `files_modified` is non-empty. When `decision_summary` is present, callers must also append it to the auto-decision log (see `_shared/auto-mode-contract.md`).
```

- [ ] **Step 2: Verify the edit landed correctly**

Run:

```bash
grep -n "decision_summary" skills/design/modes/polish.md
```

Expected: at least 3 matches — the `### Step 7: Build \`decision_summary\`` heading, the field's mention inside Step 7's explanatory sentence, and the `"decision_summary":` key in the non-empty JSON example. (Match count only needs to be "at least 3" — don't treat a higher count as a failure, e.g. if the closing paragraph's mention of "callers must also append it" phrase is also counted by a stricter grep pattern.)

Run:

```bash
grep -n "^### Step 7" skills/design/modes/polish.md
```

Expected: one match, appearing after `### Step 6: Intent-driven dispatch` and before `## Output to caller` in the file.

- [ ] **Step 3: Commit**

```bash
git add skills/design/modes/polish.md
git commit -m "Add decision_summary output field to design polish mode"
```

---

### Task 2: Log the auto-decision in `/flow`'s polish-phase execution

**Files:**
- Modify: `skills/flow/SKILL.md:183` (extend the existing ledger-append bullet with a new `decisions.md` append)

**Interfaces:**
- Consumes: `decision_summary` and `files_modified` from Task 1's output contract (`skills/design/modes/polish.md` Step 7 / "Output to caller").
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Verify no commit step exists for polish's changes before this logging point**

Before editing, confirm this repo doesn't already document a commit step for polish's file changes between "polish modifies files" and "re-verify runs" — if it does, the log entry template in Step 2 below needs a commit-ref clause added; if not, the no-ref fallback in Step 2 is correct as written.

Run:

```bash
grep -n -i "commit" skills/flow/SKILL.md skills/flow/steps-and-gates.md skills/design/modes/polish.md skills/design/command-map.md
```

Expected: no output describing a commit step for polish's own file changes (matches from unrelated content — e.g. "commitment," if any — don't count). As of 2026-07-08, this grep across all four files returns nothing describing such a step.

If the grep surfaces a commit step for polish's changes that contradicts this expectation, STOP and report NEEDS_CONTEXT — Step 2's entry template would need a commit-ref clause added, which requires knowing the exact variable the commit hash is available under at this point in `/flow`. Do not guess at a commit-ref format or invent a variable name.

If the grep confirms no commit step exists (matching the expected outcome above), proceed to Step 2.

- [ ] **Step 2: Extend the ledger-append bullet with a decisions.md append**

In `skills/flow/SKILL.md`, find this exact existing line (currently line 183):

```markdown
- Append a ledger entry per command invoked (phase: `design`, status: `fixed` for auto-fit successes, `observation` for reported issues). Ledger entries flow through to wrap-up's skill update analysis.
```

Replace it with:

```markdown
- Append a ledger entry per command invoked (phase: `design`, status: `fixed` for auto-fit successes, `observation` for reported issues). Ledger entries flow through to wrap-up's skill update analysis.
- When `/design polish` returns a non-empty `commands_invoked` (and therefore a `decision_summary` field — see `skills/design/modes/polish.md` Step 7), append one entry to the auto-decision log at `{run-dir}/decisions.md`, under a `## /flow` heading (create the heading if absent, per the append-only protocol in `_shared/auto-decision-log.md`):
  ```
  - AUTO {HH:MM:SS} — Polish phase: {decision_summary}. Files: {files_modified, comma-joined}. Reversibility: high (worktree file edits, revertible via git).
  ```
  This is one entry per polish-phase dispatch, not one per command — `decision_summary` already summarizes every command that ran. Skip this entirely when `commands_invoked` is empty (no `decision_summary` was returned, so there is nothing to log).
```

- [ ] **Step 3: Verify the edit landed correctly**

Run each separately (avoid `grep -E`/`\|` alternation — not portable to BSD grep on macOS):

```bash
grep -n "decision_summary" skills/flow/SKILL.md
grep -n "## /flow" skills/flow/SKILL.md
```

Expected: at least one match from each command — `decision_summary` inside the new bullet's first sentence, and `## /flow` inside the new bullet's second sentence (this file doesn't create the literal `## /flow` heading itself, it documents that the append step creates it at runtime — so the match is inside a code span/prose reference, not a real markdown heading in this file).

- [ ] **Step 4: Commit**

```bash
git add skills/flow/SKILL.md
git commit -m "Log polish-phase Impeccable dispatch to the auto-decision log"
```

---

### Task 3: Register polish-phase dispatch in the auto-mode contract, final verification

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md:146-147` (insert one new table row after the existing "Design intent" row)

**Interfaces:**
- Consumes: nothing new — this task's row text references `decision_summary` and `/design polish` by name, established in Tasks 1–2.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Insert the new table row**

In `skills/_shared/auto-mode-contract.md`, find this exact existing text (currently lines 146–148):

```markdown
| Impeccable shape (`/specify` Step 2.5b) | Run / skip | Auto-run for frontend specs; skip for others |
| Design intent (`/specify` Step 2.5c) | 6-way creative direction | Apply manifesto value (default `none` — no intent applied) |
| Code review findings (`/review` Step 3 Routing) | Apply all / override | Severity:low → `AUTO`; severity:medium → `STAGED`; severity:high → `STAGED`; severity:critical → `KEPT-PROMPT` (rare — security/correctness hard-fails the bookend) |
```

Replace it with (inserting one new row between the second and third lines, leaving all three existing rows unchanged):

```markdown
| Impeccable shape (`/specify` Step 2.5b) | Run / skip | Auto-run for frontend specs; skip for others |
| Design intent (`/specify` Step 2.5c) | 6-way creative direction | Apply manifesto value (default `none` — no intent applied) |
| Design polish-phase dispatch (`/flow` polish phase, via `/claude-tweaks:design polish`) | N/A — auto-fit and issue-driven have no interactive equivalent (they're always-run and signal-triggered respectively); intent-driven was already pre-selected at `/specify` Step 2.5c | Auto-fit: always dispatched when frontend. Issue-driven: dispatched per audit-flagged category. Intent-driven: dispatched per pre-declared `design-intent:`. All `AUTO` — logged by `/flow` using `/design polish`'s `decision_summary` field. |
| Code review findings (`/review` Step 3 Routing) | Apply all / override | Severity:low → `AUTO`; severity:medium → `STAGED`; severity:high → `STAGED`; severity:critical → `KEPT-PROMPT` (rare — security/correctness hard-fails the bookend) |
```

- [ ] **Step 2: Verify the new row and markdown table integrity**

Run:

```bash
grep -n "^| Design polish-phase dispatch" skills/_shared/auto-mode-contract.md
```

Expected: exactly one match.

Run:

```bash
grep "^| Design polish-phase dispatch" skills/_shared/auto-mode-contract.md | grep -o '|' | wc -l
```

Expected: `4` (3 columns = 4 pipe characters: leading, 2 internal separators, trailing). A different count means a stray `|` broke the table — check for an un-escaped pipe character inside the row's prose (there shouldn't be one; this row's text uses no literal `|`).

- [ ] **Step 3: Full-repo consistency check across all three files**

Run:

```bash
grep -rln "decision_summary" skills/
```

Expected: exactly two files — `skills/design/modes/polish.md` and `skills/flow/SKILL.md`. No other file in `skills/` should reference `decision_summary` (confirms the field name didn't leak into or get duplicated in an unrelated file).

Run:

```bash
grep -rln "Design polish-phase dispatch" skills/
```

Expected: exactly one file — `skills/_shared/auto-mode-contract.md`.

- [ ] **Step 4: Run the existing test suite to confirm no unrelated breakage**

```bash
npm test 2>&1 | tail -15
```

Expected: `# fail 1` with the failure being `end-to-end: render under 500ms` in `tests/statusline.test.js` (a pre-existing, documented flake — see `specs/DEFERRED.md`, unrelated to this change) — or `# fail 0` if the flake doesn't reproduce this run. Any other failing test means something in this plan's edits broke — investigate before proceeding, since this plan should not touch any file `npm test` exercises.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/auto-mode-contract.md
git commit -m "Register design polish-phase dispatch in the auto-mode contract's decision index"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc's three "Changes" items map 1:1 — item 1 (`polish.md` `decision_summary` field) → Task 1; item 2 (`flow/SKILL.md` decisions.md append) → Task 2, including the design doc's explicit call to verify commit-ref handling against real code (Task 2 Step 1); item 3 (`auto-mode-contract.md` new row) → Task 3. Design doc's "Testing" section (consistency check + deferred manual smoke test) → Task 3 Steps 2–3 (consistency) with the manual smoke test correctly left undone here, matching the design doc's own "deferred, documented not run" call.
- **Placeholder scan:** No TBD/TODO; every step shows exact before/after text or an exact command with expected output. Template placeholders like `{N}`, `{HH:MM:SS}`, `{decision_summary}` inside format-string documentation are intentional (matching this repo's existing `auto-decision-log.md` schema notation), not incomplete-plan placeholders.
- **Type consistency:** N/A — no code, no function signatures across tasks. The one cross-task "interface" is the string field name `decision_summary`, used identically in Task 1 (produces) and Task 2 (consumes) — verified spelled identically in both tasks' exact text above.
