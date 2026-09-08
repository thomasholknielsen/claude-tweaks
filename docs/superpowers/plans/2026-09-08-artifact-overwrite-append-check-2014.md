# Artifact-overwrite append-vs-overwrite check (#2014) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `flow/multispec-artifact-namespacing.md`'s (#786) artifact-overwrite completion check
walks `git log --name-status --diff-filter=AM` and HARD-GATEs on any `A`-then-`M` path, unable to
distinguish a spec's legitimate append to a shared journey from a real overwrite — the #1988-#1997
run tripped it on pure appends and needed a manual `git log --numstat` ruling. Mechanize the
distinction so the gate fires only on a genuine overwrite.

**Architecture:** `plugin/bin/lib/flow/artifact-overwrite-check.js` exports
`checkArtifactOverwrite({base, head, paths, cwd, git})`: re-runs the A-then-M walk, and for every
later modifying commit with nonzero deletions on that path, judges each diff hunk safe (extension)
via either of two independent tests — (1) same-spec self-edit: every deleted line's `git blame`
origin (on the commit's parent revision) carries the same `refs #{N}` trailer as the deleting
commit itself; (2) list reflow: every deleted line in the hunk is a `- ` list entry and the hunk
replaces it with at least as many list entries (the shared frontmatter `files:` list, or a running
"Related specs: …" bookkeeping bullet, both of which every spec's commit legitimately reflows).
Only a hunk failing both tests is a real overwrite. `plugin/bin/check-artifact-overwrite.js` is the
CLI wrapper (`run(argv, deps)` seam, exit 0/1/2/3). `flow/multispec-artifact-namespacing.md` gains
an "Append vs. overwrite (#2014)" section describing the two tests and citing the #1988-#1997 run
as the worked example, replacing the old unconditional HARD-GATE-on-any-A-then-M-path text.

**Tech Stack:** Node 18+ (`child_process.execFileSync` shelling to `git log`/`git diff`/`git
blame`), `node --test`, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-08T065408-record-2014/work/2014-spec.md` (record #2014)

## Global Constraints

- Read-only: the check never writes to the repo it walks; it only shells out to `git log`,
  `git diff --no-color -U0`, `git blame --line-porcelain`, all read commands.
- Fails closed: an unattributable deletion (no blame line, unreadable numstat, no `refs #{N}`
  trailer on the deleting commit) is treated as an overwrite, never silently passed.
- General, not journeys-format-specific: neither test parses step headings or section names, so
  the same two rules apply unchanged to a `stories/*.yaml` file's own shared list.
- The existing `tests/multispec-artifact-namespacing-conformance.test.js` prose-conformance test
  (pins the raw `git log --name-status --diff-filter=AM` command and the `HARD-GATE: stop before
  rendering the console` line) must keep passing unmodified — both stay in the doc.
- AC1 must be proven against the real history, not only synthetic fixtures: `base=4c6e76733`,
  `head=b247a02d3`, `path=docs/journeys/compose-a-per-run-context-bundle-1988.md` must report
  `clean: true` in this checkout.
- Commit subjects use `refs #2014` (never `closes`/`fixes`, per the dispatching group's
  intermediate-commit convention); last line `Claude-Session:
  https://claude.ai/code/session_01C9bWBqvU686Pb4QrkHarR6`.
- Worktree: `C:/repos/claude-tweaks/.claude/worktrees/record-2014` (confirm with
  `git rev-parse --show-toplevel`).

**Design decisions locked here (deviations from the record body's literal wording, discovered
while implementing):**

- The record's Deliverables describe the same-spec identification as "the refs #N trailer matching
  the step's Origin line." Replaying the real #1988-#1997 history against a strict same-commit
  blame match alone left two false positives: (a) `refs #N` in real commit subjects is often
  written inline in parens at the end of the subject line (`"... (refs #1991)"`), not as its own
  trailer line — fixed by making `extractRefs` scan the whole message rather than anchoring to
  line start; (b) even after that fix, one deletion remained — spec #1989's commit reflowing the
  journey's trailing "Related specs: …" bookkeeping bullet, originally written by spec #1988's own
  commit. This is the real-world instance of the record's own Current State clause "edits that
  spec's own step **or the frontmatter file list**" — a second, independent exemption for
  shared-collection edits, not covered by same-spec blame matching alone. Added as the "list
  reflow" test.
- No CLI existed for this check before (it was pure agent-executed prose). Added
  `bin/check-artifact-overwrite.js` as a "properly done" mechanization consistent with this repo's
  convention of pairing a `bin/lib/` algorithm with a thin `bin/*.js` CLI (per CLAUDE.md's
  "do it properly" — an LLM agent hand-running multi-step blame analysis is exactly the
  error-prone shape a mechanized check exists to remove) rather than leaving the extended rule as
  agent-executed prose only. Exit-code vocabulary documented in the CLI's own header comment and
  `docs/plugin-structure.md`'s bin-CLI registry line.

---

### Task 1: `artifact-overwrite-check.js` — the algorithm

**Files:**
- Create: `plugin/bin/lib/flow/artifact-overwrite-check.js`
- Test: `tests/bin-lib/flow/artifact-overwrite-check.test.js` (new)

**Interfaces:**
- `checkArtifactOverwrite({base, head='HEAD', paths=['docs/journeys/','stories/'], cwd, git}) →
  {clean: boolean, overwrites: [{path, commit, reason}]}`
- `extractRefs(message) → Set<number>`, `parseNameStatusLog(output)`, `parseNumstatDeletions(output)`,
  `parseHunks(diffOutput)`, `isListReflow(hunk)`, `defaultGit(args, cwd)` — all exported for direct
  unit testing.

- [x] **Step 1: Write the algorithm and its unit + synthetic-repo tests** — implemented and
  verified: 13/13 tests pass (`node --test tests/bin-lib/flow/artifact-overwrite-check.test.js`),
  covering `extractRefs`'s two trailer shapes, `parseHunks`/`isListReflow`'s three cases, four
  synthetic-repo scenarios (add-then-append, same-spec self-correction, shared list reflow,
  cross-spec overwrite), a modify-only-no-add path (ignored), and a live replay of the real
  #1988-#1997 range in this checkout (AC1, `clean: true`).

### Task 2: `check-artifact-overwrite.js` — the CLI wrapper

**Files:**
- Create: `plugin/bin/check-artifact-overwrite.js`
- Test: `tests/bin-lib/flow/check-artifact-overwrite-cli.test.js` (new)

- [x] **Step 1: Write the CLI and its tests** — `run(argv, deps)` seam (`stdout`/`stderr`/`check`
  injectable), exit 0 clean / 1 overwrite / 2 malformed invocation / 3 walk failure. 8/8 tests pass
  (`node --test tests/bin-lib/flow/check-artifact-overwrite-cli.test.js`), including one real
  spawn of the compiled CLI against a fresh synthetic repo.

### Task 3: Doc + registry updates

**Files:**
- Modify: `plugin/skills/flow/multispec-artifact-namespacing.md`
- Modify: `docs/plugin-structure.md`

- [x] **Step 1: Extend the check's prose** — added the "Append vs. overwrite (#2014)" section
  citing the two tests and the #1988-#1997 run as the worked example, immediately after the
  existing raw-walk paragraph (kept verbatim for the conformance test). Verified
  `tests/multispec-artifact-namespacing-conformance.test.js` still passes (7/7) with no edits to
  that test.
- [x] **Step 2: Register the new CLI** — added one line to `docs/plugin-structure.md`'s bin-CLI
  registry (same format as `merge-size-probe.js`'s neighboring line). Verified
  `tests/flow-subfile-table-completeness.test.js`, `tests/skill-catalog-completeness.test.js`,
  `tests/skill-graph-table-structure.test.js` (18/18) still pass.

### Task 4: Final verification

- [ ] **Step 1: Full shared verification procedure** — run `skills/test/verification.md`'s
  type/lint/test procedure (Common Step 5 of `/claude-tweaks:build`) before handoff, per the
  Windows-baseline comparison convention (`docs/incident-log.md`'s Windows baseline note) rather
  than a raw `npm test`.
