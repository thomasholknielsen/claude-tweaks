# IL-45 rebase-merge correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct IL-45 so its verification check works under all three integration strategies — fast-forward, merge commit, and rebase/squash — instead of only the first two.

**Architecture:** Two prose edits, in the order CLAUDE.md's own "Adding one" rule prescribes: the incident-log entry first, then the compressed rule derived from it. No code, no new files.

**Tech Stack:** Markdown.

## Global Constraints

- **Scope keywords:** `IL-45`, `ExitWorktree`, `discard_changes`
- **No new test.** Nothing in `tests/` or `bin/lib/*/tests/` asserts on `docs/incident-log.md` or on CLAUDE.md's rule text — confirmed by grep. Adding one would be scope the record did not ask for, and a test asserting live CLAUDE.md prose is the `[IL-80]` hazard directly ("a test that reads live production content you intend to change is a scheduled failure timed to the migration"). Verification for this task is a documented content check, stated in the task's own steps.
- **Do not allocate a new `IL-nn`.** This is the same hazard with a wider trigger, so it extends IL-45. CLAUDE.md's Don'ts is explicit that gaps are fine and renumbering is forbidden — but silent on extend-vs-add, so this plan makes the call: extend.
- **Preserve the fork-point insight.** The existing entry's actual discovery — that the commit count is measured against the branch's original fork point, not `main`'s tip — is why the warning fires at all. It must survive.
- Keep CLAUDE.md's rule to the house shape: one imperative sentence plus one clause of why, ending in the `[IL-45]` tag. CLAUDE.md is paid for per dispatched agent, so length there is a real cost.
- Commit message says `refs #106`, never a closing keyword — this branch carries several records.

## Context the implementer needs

The current text, verified on the tree at plugin 6.61.0:

- `docs/incident-log.md:197-199` — the `## IL-45 — ExitWorktree's commit-count refusal` heading and its single paragraph, ending: *"Verify `git rev-parse HEAD` is identical on both the worktree branch and `main` before overriding with `discard_changes: true`."*
- `CLAUDE.md:248` — the compressed rule, ending: *"Verify `git rev-parse HEAD` matches on both before `discard_changes: true` `[IL-45]`"*

**The defect.** A SHA-identity check passes only when the branch was fast-forwarded or merged with a merge commit. Under `gh pr merge --rebase` (or `--squash`) the integration rewrites the commits: the branch and `main` hold byte-identical content under permanently different hashes. The check can then never pass, and a reader following it literally has two bad options — refuse to clean up (orphaned worktrees accumulate) or skip verification entirely (losing the protection IL-45 exists to provide). It fails in the dangerous direction.

**This is the common case in this repo, not an edge case.** The record was filed off PR #103, where `git log main..<branch>` reported 1 "unmerged" commit and the SHAs differed, while `git diff <branch> main -- <the four changed files>` returned nothing.

---

### Task 1: Extend IL-45 to a content check

**Files:**
- Modify: `docs/incident-log.md:197-199`
- Modify: `CLAUDE.md:248`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing downstream.

- [ ] **Step 1: Replace the IL-45 entry body in `docs/incident-log.md`**

Keep the `## IL-45 — ExitWorktree's commit-count refusal` heading exactly as it is. Replace the single paragraph beneath it with:

```markdown
Don't take `ExitWorktree`'s commit-count refusal ("N commits... discard permanently") at face value when the worktree branch was already integrated into `main` — the check counts commits against the branch's original fork point, not `main`'s current tip, so it warns even when nothing would actually be lost.

**Verify by content, not by SHA.** The obvious check — "is `git rev-parse HEAD` identical on both?" — only passes when the branch was fast-forwarded or merged with a merge commit. Under `gh pr merge --rebase` (or `--squash`), integration *rewrites* the commits: the branch and `main` hold byte-identical content under permanently different hashes, so a SHA-identity check can never pass, however cleanly the branch landed. That is the dangerous direction to fail in — a reader following it literally must either refuse to clean up (orphaned worktrees accumulate) or skip verification entirely, losing the protection this entry exists to provide. This repo's merge convention favors rebase, so it is the common case here, not an edge case.

Compare content instead: `git diff <branch> <default-branch>` returning no output means nothing would be lost, whichever strategy integrated it. `git rev-parse <branch>^{tree}` against `git rev-parse <default-branch>^{tree}` is the same check as a single comparison. Bit PR #103, where `git log main..<branch>` reported 1 "unmerged" commit and the SHAs differed, while `git diff <branch> main -- <the changed files>` returned nothing at all.
```

- [ ] **Step 2: Replace the compressed rule in `CLAUDE.md`**

Replace the `[IL-45]` bullet at `:248` with:

```markdown
- Don't take `ExitWorktree`'s commit-count refusal at face value when the branch already merged — it counts against the fork point, not `main`'s tip. Verify by **content** (`git diff <branch> <default-branch>` empty), never by SHA: a rebase- or squash-merge rewrites the commits, so a SHA check can never pass, and that is this repo's usual merge shape `[IL-45]`
```

- [ ] **Step 3: Verify the content check**

Run each as its own command and confirm the stated result:

```bash
grep -c "rev-parse HEAD" docs/incident-log.md
```
Expected: the IL-45 entry no longer prescribes it as *the* check. The phrase may still appear inside the new "the obvious check" sentence, which is deliberate — it names the wrong check in order to reject it. Read the surrounding sentence and confirm that is the only occurrence in the IL-45 entry.

```bash
grep -n "IL-45" CLAUDE.md
```
Expected: exactly one line, carrying `git diff` and the words `content` and `rebase`.

```bash
grep -cE "rebase|squash" docs/incident-log.md
```
Expected: at least one occurrence inside the IL-45 entry — confirm by reading, since other entries may also use the words.

```bash
grep -c "fork point" docs/incident-log.md
```
Expected: at least one — the fork-point insight survived.

- [ ] **Step 4: Confirm nothing else cites the old check**

```bash
grep -rn "rev-parse HEAD matches on both" .
```
Expected: no output. That was the old CLAUDE.md phrasing; if it appears anywhere else, that copy needs the same correction.

- [ ] **Step 5: Run the suite**

Run `npm test`, redirected to a file and grepped — the suite is long and a direct pipe can truncate the real failure. No test covers these two files, so this is a regression check only: expect the same count as before the change.

- [ ] **Step 6: Commit**

```bash
git add docs/incident-log.md CLAUDE.md
git commit -m "Extend IL-45 to a content check that survives a rebase-merge — refs #106"
```

---

## Acceptance criteria coverage

| AC (from the record) | How it is satisfied |
|---|---|
| The rule prescribes a **content** check rather than a SHA-identity check | Step 2's rule leads with `git diff <branch> <default-branch>` empty; Step 1's entry gives both the diff and the tree-hash forms |
| The rebase-merge case is named explicitly, so a reader hitting a differing SHA knows whether it is benign | Step 1's second paragraph names `gh pr merge --rebase` and `--squash` and states the SHAs differ permanently; Step 2's rule carries the short form |
| The existing fork-point insight is preserved — this extends IL-45, it does not replace it | Step 1's first paragraph is the original insight, unchanged in substance; Step 3 greps for `fork point` to confirm |
| (Technical Approach) Extend IL-45 rather than allocating a new `IL-nn` | No new number allocated; the heading is untouched |
