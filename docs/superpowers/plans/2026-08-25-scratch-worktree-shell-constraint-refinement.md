# Scratch-Worktree Shell-Constraint Boundary Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #1108 reports the worktree-isolation Bash guard refusing benign heredoc/printf/`$VAR`
commands with "too complex to verify that it stays inside the worktree," and asks to "narrow the
guard's complexity heuristic." Independent verification (this build) confirms — consistent with
`docs/hooks.md`, `docs/skill-authoring.md`, and the prior resolutions of #174/#596/#658/#713 — that
this guard is the Claude Code CLI harness's own compound-Bash restriction, not code in
`plugin/bin/lib/hooks/pre-tool-use.js` or anywhere else in this plugin. There is no code path in
this repo that implements or can alter it, so #1108's literal Acceptance Criterion ("no longer trip
the guard") is not buildable here — the same conclusion #174 reached (retitled from a code-fix ask
to "Document Claude Code's worktree-session compound-Bash guard"). This plan re-scopes #1108 the
same way: correct and extend the canonical empirical boundary doc
(`plugin/skills/_shared/scratch-worktree.md` §7 "Shell constraint") with two new refusal shapes
independently reproduced live during this build, neither of which the current boundary text
predicts.

**Live-verified findings (reproduced in this worktree session, 2026-08-25):**
1. `${VAR:-default}` parameter-expansion-with-default is refused even as a single, otherwise-plain
   command (`echo "${HOME:-/nope}"` — refused; `echo "$HOME"` alone — passes). The current doc's
   "Pass: single plain commands" line has no carve-out for this.
2. A variable-assignment-then-use `&&` chain (`VAR=val && command "$VAR"`) is refused, even though
   it is a 2-command `&&` chain of otherwise-simple commands — the shape the doc currently lists as
   passing unconditionally. Isolated: a bare assignment alone (`TESTVAR=hello`) passes; a plain
   2-command chain with no assignment (`pwd && whoami`) passes; the assignment+use combination is
   what's refused.
3. A `for`/`while` loop is refused (reconfirms the doc's existing "any for/while loop" line — no
   doc change needed for this one, cited here only as corroborating evidence gathered live in this
   same session, per #1108's Current State).

**Not in scope:** the `auto-decision-log.md` line about heredoc/redirect writes to `decisions.md`
being refused describes a *different* guard (the Write-tool worktree-pinning guard on a
main-checkout-anchored path — reproduced live in this same session for `config.yml`/`decisions.md`
writes), not this file's harness-level shell-constraint boundary — no contradiction between the two
docs was found on inspection, so no reconciling edit is made there.

**Architecture:** Prose-only addition to one existing section (`scratch-worktree.md` §7); no code,
no schema, no test-suite-covered behavior changes. Verification is read-based (grep for the new
lines; confirm the file stays under any size ceiling that applies to `_shared/*.md`).

**Tech Stack:** Markdown only.

**Spec:** GitHub issue #1108 (materialized at
`work/1108-spec.md` in this run's worktree; run dir
`.claude-tweaks/pipelines/2026-08-25T052702-record-1108`)

## Global Constraints

- Do not touch `plugin/bin/lib/hooks/pre-tool-use.js` or any other code — the guard being
  documented is not implemented there, and #1108's own repo-side scope, once corrected, is
  documentation-only.
- Preserve the existing "last observed, not a guarantee" framing of §7 — the new findings are
  appended as further observations, not presented as a supplanting rewrite of the harness's
  actual (unowned, unversioned) behavior.
- `_shared/*.md` files carry a documented ~40KB ceiling elsewhere in this plugin (see CLAUDE.md's
  Hard-ceiling headroom note) — measure `wc -c` on `scratch-worktree.md` before and after to
  confirm the addition doesn't approach it.

---

### Task 1: Extend the empirically observed boundary in `scratch-worktree.md` §7

**Files:**
- Modify: `plugin/skills/_shared/scratch-worktree.md` (§7 "Shell constraint", lines ~219-229)

**Interfaces:** None — pure prose addition to an existing bulleted list.

- [x] **Step 1: Verify current state**

Run: `grep -n "Pass:\|Refused:" "plugin/skills/_shared/scratch-worktree.md"`
Expected: two lines (the existing "Pass:" and "Refused:" bullets), neither mentioning
`${VAR:-default}` parameter expansion or an assignment-then-use `&&` chain.

- [x] **Step 2: Add the two new observed refusal shapes**

Edit the existing "Refused:" bullet (currently: "two or more independent `$(...)` substitutions in
one command …, `;`-separated sequences of top-level commands, any `for`/`while` loop …") to append,
in the same sentence style, two more items:

- a single command using `${VAR:-default}` parameter-expansion-with-default syntax (a *single*
  plain command with no chain, pipe, or substitution otherwise — distinct from the already-listed
  `$(...)` substitution case)
- a `VAR=val && command "$VAR"` variable-assignment-then-use `&&` chain (distinct from an ordinary
  2-command `&&` chain of ready-made values, which still passes)

Add one new sentence immediately after the bulleted list, dated to this observation, following the
file's existing "last observed" convention (see the "Empirically observed boundary (2026-08-15 …)"
sentence immediately above the bullets): a 2026-08-25 addendum naming these two shapes as
independently reproduced in a live worktree session (this build, #1108), not superseding the
2026-08-15 observation — appended evidence, not a revision of it.

- [x] **Step 3: Verify the edit**

Run: `grep -n "VAR:-default\|assignment-then-use" "plugin/skills/_shared/scratch-worktree.md"`
Expected: PASS (non-empty) — the new text is present.

Run: `wc -c plugin/skills/_shared/scratch-worktree.md`
Expected: PASS — file size stays well under any ceiling noted elsewhere for `_shared/*.md` files
(no ceiling is stated in this file itself; this is a sanity check, not a hard gate).

## Verification

- `node --test tests/` — full suite pass (no code touched; this confirms the doc edit introduced
  no accidental syntax/encoding break any prose-conformance test might catch).
- Manual: re-read the edited §7 section in full to confirm it reads coherently with the new
  addendum in place.
