---
files:
  - plugin/bin/release.js
  - plugin/bin/lib/release/status.js
  - plugin/skills/_shared/pr-first-merge.md
  - plugin/skills/_shared/pr-run-comments.md
  - plugin/skills/flow/summary-template.md
  - docs/releasing.md
---

# Learn Which Release Carried a Merge

**Persona:** claude-tweaks maintainer (or the Claude session that just merged a pr-first run) whose PR landed on `main` minutes before — or minutes after — a sibling session's version bump, and who needs to know whether the work already shipped under a number that never wrote it up.
**Goal:** Get a one-line, mechanically-derived answer to "where did this merge land relative to the version history?" — and, when a shipped version's CHANGELOG entry doesn't name the merged records, have the `### also carried in this build` backfill drafted and parked where the next session will find it, without anyone editing `CHANGELOG.md` inline.
**Entry point:** A confirmed pr-first merge (`gh pr view --json mergeCommit`), inside `_shared/pr-first-merge.md` Step 4 — or a terminal at the repo root, running the subcommand by hand against any merge sha.
**Success state:** The closing report shows a `**Release status:**` line quoting one of the fixed forms verbatim; on the backfill form a `**Backfill:**` line points at the staged file and the PR's `release-status` comment; `CHANGELOG.md` is untouched by the pipeline. The maintainer knows in one glance whether a bump is still pending or a backfill PR is owed.

## Steps

### 1. Ask the subcommand — terminal or Step 4.1
- **URL:** `node plugin/bin/release.js status --merge <merge-sha> --records <n>[,<m>...] --ref origin/main --json` (Step 4.1 runs the plugin-root form, `node "${CLAUDE_PLUGIN_ROOT}/bin/release.js" status …` — `CLAUDE_PLUGIN_ROOT` already points at the payload, so it carries no `plugin/` segment — after `git fetch origin main`)
- **Action:** Pass the merge commit and the record numbers the merge carried (from the materialized header's `record:` or the PR body's `Fixes #{n}` lines — never guessed). The subcommand walks the version-bump commits reachable from `--ref` (commits that changed the manifest's `#version`), newest → oldest with `--topo-order`, and keeps the *oldest* bump that still has the merge as an ancestor — the release that first carried it — then checks which `#N` tokens (ranges like `#620-#625` count) that version's CHANGELOG entry names. The walk spans BOTH manifest spellings, because #418's payload cutover moved it: history after the cutover carries `plugin/.claude-plugin/plugin.json`, history before it carries `.claude-plugin/plugin.json`, and a walk pinned to one spelling would report every commit on the other side as never having shipped a version.
- **Should feel:** Instant and unambiguous — one JSON object or one sentence, exit 0, no `gh`, no network beyond the fetch the caller already did.
- **Should understand:** `{"shipped": false}` means the merge is newer than every bump — a bump is pending. `{"shipped": true, "version": "X", …, "missing": [...]}` names the carrying version and exactly which records its entry misses (`missing: []` when every record is named; `entryFound: false` when the version has no entry at all).
- **Red flags:** A reassuring "not yet in a release" for a sha that doesn't exist (the guard is `git rev-parse --verify --quiet <sha>^{commit}` — a bad sha exits 1, never 0); a "backfill needed" for a record the entry names inside a range; any answer at all for a ref carrying neither manifest spelling — `plugin/.claude-plugin/plugin.json` nor `.claude-plugin/plugin.json` (exit 1: `no plugin manifest at {ref}`).

### 2. Read the human line in the closing report — flow summary / PR
- **URL:** `/claude-tweaks:flow`'s Pipeline Summary (`**Release status:**` line) — or the PR's `release-status` comment (`<!-- run-comment: release-status -->`)
- **Action:** Read the one line: `not yet in a release — bump pending` / `already carried by vX.Y.Z — every record named in CHANGELOG` / `already carried by vX.Y.Z — CHANGELOG backfill needed: #A, #B` / `already carried by vX.Y.Z — CHANGELOG has no vX.Y.Z entry; backfill needed: #A, #B` / `n/a — no plugin manifest at {ref}` / `release status unavailable — {reason}` / `n/a — not merged in this run (outcome: {armed | pending-review})`.
- **Should feel:** Like a status light, not a paragraph — the same words every time, so a glance suffices and a grep works.
- **Should understand:** Only the two backfill forms owe anyone work; "bump pending" means the next `node plugin/bin/release.js <minor|patch>` will write the records up normally.
- **Red flags:** A paraphrased line (the vocabulary is fixed — the report quotes it verbatim); a `**Backfill:**` line with no staged path or PR comment behind it.

### 3. Apply a backfill — scratch worktree PR
- **URL:** `{run-dir}/staged/release-backfill-vX.Y.Z.md` (archived with the run dir after reconcile) or the PR's `release-status` comment, both carrying the `--backfill` output (`### also carried in this build …`)
- **Action:** In a scratch worktree, append the section to `CHANGELOG.md`'s `## vX.Y.Z` entry before the next `## v` heading (create the entry first on the `no vX.Y.Z entry` form), run `node --test tests/changelog-coverage.test.js`, open a PR, merge — the ordinary pr-first path (`docs/releasing.md`, "After the merge"). Never edit `CHANGELOG.md` in the main checkout: Step 4's no-commit rule holds for the backfill too.
- **Should feel:** Pre-drafted — the paragraph naming the records and the merge sha is already written; the maintainer adds the per-record substance and ships a one-file PR.
- **Should understand:** The pipeline detected the gap and drafted the fix; it deliberately did not write the changelog for you — the run's Review Console had already closed by merge time, so the staged file is the audit artifact and the PR comment is the durable pointer.
- **Red flags:** Two `### also carried in this build` headings under one version (the `--backfill` output supplies its own heading — don't add another); a backfill applied inline in the main checkout.

## Origin
- Created during build of #678 (run 2026-08-16T225409-spec-678-680-681-682-683-679)
- Steps 1-3 built in this session
- Related specs: #680 (Next Actions release-row premise check consumes step 2's line); the staged release-time gate companion (prevention, `leftover-release-time-changelog-gate.md`)
