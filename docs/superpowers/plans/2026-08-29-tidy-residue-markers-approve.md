# Tidy Residue Markers + --approve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tidy's Stage-tier record findings additionally write the #1488 `needs:decision` marker (tracker-visible residue), a headless `pr-first` tidy commits its own run directory (audit survives sandbox discard), and `tidy --approve [run-dir]` re-enters a parked run's Approve flow.

**Architecture:** Two new sub-files carry the bulk (`tidy/decision-markers.md` — the marker write + repair rule; `tidy/approve-mode.md` — the re-entry procedure), because the inline homes are ceiling-bound: `step-6-auto.md` is at **40,801/40,960 (159 B)** — its pointer must be a byte-swap of existing preamble prose, not an addition — and `tidy/SKILL.md` is at 40,121/40,960 (839 B) for the input row + Step 7.5 extension. The gitignore currently blankets run dirs except `work/`; a narrowly-scoped carve-out for `*-tidy-standalone*` dirs' `decisions.md`/`report.md`/`staged/**` is entailed work (the spec's gotcha names it), as is reconciling `_shared/auto-decision-log.md`'s "never commit run dirs" anti-pattern row with this spec's deliberate, narrow reversal. Run-ledger row 10 is consumed here (attention's tidy-row launcher → `--approve`, targets-newest claim restored — deliverable 4 makes it true). AC2's #1489 dependency landed earlier this run, so AC2 is verifiable now.

**Tech Stack:** Markdown skill files + `plugin/bin/lib/hooks/session-start.js` (real JS) + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1493/work/1493-spec.md`

## Global Constraints

- Non-Goals: Action Vocabulary and tier dispositions untouched; no residue-container issue, no dismissal file; digest sweep untouched.
- Marker is ADDITIVE to `staged/` — both written for every Stage-tier record finding; Auto rows and the no-op rows (`[scoring]`, `[blocked]`, `[legacy]`, unarmed-PR) write nothing new.
- Write ordering: comment FIRST, then label (half-written-marker hazard); a label-without-comment state is inconsistent — re-derive/repair, never trust the label alone.
- Loop-safety comparison is `Proposed:`-text-aware over the `tidy`-tagged unresolved comments only (per #1488's multi-unit rule).
- `--approve` re-verifies every item fresh per `_shared/reverify-before-write.md` (cite, never restate); stale items reported, never applied.
- The session-start change references #803 in its commit (its designated consumer).
- Byte ceilings: quote `wc -c` for step-6-auto.md (≤ 40,960 — target byte-neutral), tidy/SKILL.md (≤ 40,960), every new/edited plugin file.
- Commit style: imperative, "refs #1493" (never closes/fixes; the session-start commit also carries "refs #803"), Claude-Session trailer.

---

### Task 1: Marker writes + loop safety

**Files:**
- Create: `plugin/skills/tidy/decision-markers.md`
- Modify: `plugin/skills/tidy/step-6-auto.md` (pointer via byte-swap ONLY — read the preamble's existing "a recurring staged item is a missing routing rule" prose and REWORD it to carry the pointer, net ≤ +159 B, ideally ≤ 0)
- Modify: `plugin/skills/tidy/step-1-records.md` (the skip check; 30,717 B, ample room)

- [ ] **Step 1: `decision-markers.md`** (read `_shared/work-record.md`'s Decision-comment template section + `step-6-auto.md`'s routing table first): the marker-write procedure for every record-scoped routing-table row that resolves to **Stage** at the active tier (derive applicability from the table's live disposition, never a hard-coded row list): compose the `<!-- needs-decision: tidy -->` comment per the canonical template (cite it) — `Proposed:` = the staged action's one-line description; `Why:` = the finding's reason; `Command:` = `` `/claude-tweaks:tidy --approve` `` — post the comment FIRST, then add the `needs:decision` label (state the ordering rationale: a failure between the two calls must not leave an unexplained label); the repair rule: a later tidy/attention pass finding the label with no matching unresolved `tidy` comment treats it as inconsistent and re-derives (re-post the comment or clear the label per what the fresh scan finds) rather than trusting either alone. Written alongside — never instead of — the `{run-dir}/staged/` file.
- [ ] **Step 2: `step-6-auto.md` pointer** — byte-swap: the preamble sentence about recurring staged items gains the citation ("Stage-tier record rows also write the tracker-visible `needs:decision` marker — procedure in `decision-markers.md` in this skill's directory"), funded by trimming adjacent redundancy in the SAME preamble. Quote before/after `wc -c`; STOP as DONE_WITH_CONCERNS naming the byte math if it can't fit under 40,960.
- [ ] **Step 3: `step-1-records.md` skip check** — one shared paragraph (cited by shapes 1-3, 4, 5, 7, 8 rather than 5 restatements, matching the file's idiom): skip collecting a finding whose proposed action's `Proposed:` text matches an existing UNRESOLVED `<!-- needs-decision: tidy -->` comment on that record (unresolved = no `**Resolved:**` line; only `tidy`-tagged comments consulted; a different proposed action still collects).
- [ ] **Step 4:** Verify `wc -c` all three; commit.

---

### Task 2: `--approve`, committed run dir, gitignore + contract carve-outs, ledger-row-10 re-point

**Files:**
- Create: `plugin/skills/tidy/approve-mode.md`
- Modify: `plugin/skills/tidy/SKILL.md` (input row + Step 7.5 commit scope — 839 B budget)
- Modify: `.gitignore` (narrow carve-out)
- Modify: `plugin/skills/_shared/auto-decision-log.md` (anti-pattern row carve-out clause)
- Modify: `plugin/skills/backlog/attention-mode.md` (tidy-row launcher re-point — run-ledger row 10)

- [ ] **Step 1: `approve-mode.md`**: `--approve [run-dir]` — default resolution = newest `.claude-tweaks/pipelines/*-tidy-standalone*/` dir (glob + ISO-prefix sort, `$RUN_ROOT`-anchored per `_shared/pipeline-run-dir.md`, `[IL-127]`) whose `staged/` is non-empty; explicit arg validated as an existing anchored run dir. Re-enters Step 6's existing Approve rendering over that run's `staged/`; before applying ANY item, re-verify its precondition fresh (cite `_shared/reverify-before-write.md`) — changed/closed/resolved targets report `stale`, skipped; on approval, Steps 7-7.5 run against the approved set; the run archives via the existing `close-run` mechanism. Human-present only (a Routine never fires it).
- [ ] **Step 2: `tidy/SKILL.md`**: argument-hint gains `[--approve [run-dir]]`; Input row pointing at `approve-mode.md` (compact); Step 7.5 `pr-first` branch: the `git add` extends to the run directory's own audit files (`decisions.md`, `report.md` when present, `staged/**`) in the same commit — one sentence noting the `.gitignore` carve-out makes them trackable and `local-merge` needs no change. Quote before/after `wc -c` (≤ 40,960).
- [ ] **Step 3: `.gitignore`** — following the file's existing per-level carve-out convention (read lines 9-25), add narrowly-scoped rules un-ignoring ONLY `*-tidy-standalone*` run dirs' `decisions.md`, `report.md`, and `staged/` (+`staged/**`), at the top-level pipelines depth (tidy standalone runs are never `spec-*/` nested). Verify with `git check-ignore -v` probes on a scratch path for BOTH a tidy-standalone file (not ignored) and a non-tidy run's decisions.md (still ignored) — quote raw output.
- [ ] **Step 4: `_shared/auto-decision-log.md`** — the Anti-Patterns row "Writing the log to docs/plans/ or any git-tracked path" gains a carve-out clause: `*-tidy-standalone*` runs commit their own run directory by design (#1493 — the pr-first residue-survival mechanism; the narrow `.gitignore` carve-out is the implementation), every other run's log remains uncommitted runtime state. Keep it one clause; quote `wc -c`.
- [ ] **Step 5: `attention-mode.md` tidy row** (run-ledger row 10): launcher → `run /claude-tweaks:tidy --approve` and restore the targets-newest claim — now true: state that `--approve`'s own no-arg default resolves the same newest-non-empty-staged directory as this row's selection rule (cite `approve-mode.md`). Update the Anti-Patterns/`--approve`-guard pin implications: `tests/backlog-attention-rows.test.js` currently asserts `doesNotMatch(/--approve/)` on attention-mode.md — RETARGET that pin in the same commit (its purpose was "don't advertise an unshipped flag"; the flag now ships — flip it to a positive pin on the new launcher line).
- [ ] **Step 6:** Verify: `node --test tests/backlog-attention-rows.test.js` (quote raw, pass); `wc -c` all edited files; commit (this commit consumes ledger row 10 — say so).

---

### Task 3: session-start.js unfinished-runs extension (+ test)

**Files:**
- Modify: `plugin/bin/lib/hooks/session-start.js`
- Modify: `tests/hooks-session-start.test.js` (the existing home — extend its fixture pattern)

- [ ] **Step 1:** Read `session-start.js`'s unfinished-runs notice + `_shared/pipeline-run-dir.md`'s run-state status enum (name the exact cleanly-finished value(s) from that file — never "anything other than interrupted"). Extend the notice: also enumerate standalone runs (`*-standalone` name match) whose `staged/` is non-empty AND whose `run-state.json` status is in that named cleanly-finished set — one line per run pointing at `/claude-tweaks:tidy --approve <dir>` (the interrupted lines keep their `close-run` pointer unchanged).
- [ ] **Step 2:** Extend `tests/hooks-session-start.test.js` per AC5: a fixture with one `interrupted` pipeline run + one cleanly-finished standalone run with non-empty `staged/` renders both lines (close-run for the first, tidy --approve for the second); plus a negative: a cleanly-finished standalone run with EMPTY `staged/` renders nothing new.
- [ ] **Step 3:** `node --check` the JS; run `node --test tests/hooks-session-start.test.js` (quote raw, pass). Commit with "refs #1493, refs #803" (the notice's designated consumer).

---

### Task 4: Conformance pins + AC2 verification + suites

**Files:**
- Create: `tests/tidy-residue-markers.test.js`

- [ ] **Step 1:** Pins (read the real files; discriminating; negatives spot-checked against this task's base): `decision-markers.md` exists, cites the canonical template, states comment-first ordering + the repair rule; `step-6-auto.md` cites `decision-markers.md` and stays ≤ 40,960 (byte-ceiling guard test); `step-1-records.md` carries the `Proposed:`-text-aware skip; `approve-mode.md` exists with the newest-default + reverify citation + stale reporting; `SKILL.md` hint has `--approve`; `.gitignore` carve-out present (pin the exact new rules) AND the non-tidy-run still-ignored property (a check-ignore-style assertion or a rule-shape pin); `auto-decision-log.md`'s carve-out clause; attention-mode's new launcher line.
- [ ] **Step 2 (AC2, now verifiable):** add a prose-coherence pin: `backlog/refine-record.md`'s "keep" choice prepends `**Resolved:**` (a comment edit — which bumps the record's `updatedAt` on GitHub), and `tidy/step-1-records.md`'s staleness shapes read the staleness clock from the snapshot's `updatedAt` (verify by reading both files; pin the two sentences that make AC2's chain hold). If either half is NOT actually stated in the live files, STOP and report which half — do not pin a wish.
- [ ] **Step 3:** Run: `node --test tests/tidy-residue-markers.test.js tests/backlog-attention-rows.test.js tests/hooks-session-start.test.js` + any suite that pins tidy prose (`ls tests/ | grep -i tidy`, run matches) — quote raw, all pass. Then FULL `npm test` (redirect; quote final counts) — 0 fail (one isolate-and-rerun per flake tolerance). Commit.

---

## Verification (whole plan)

- AC trace: AC1 → T1 (marker + staged both written; skip check prevents re-stage) pinned by T4; AC2 → T4 Step 2's coherence pin; AC3 → T2 Steps 2-3 (git add + carve-out, check-ignore proof); AC4 → T2 Step 1 + T4 pins; AC5 → T3 Step 2's fixture test.
- Gotchas honored: additive marker; content-aware comparison; comment-first ordering; gitignore verified with positive AND negative probes; ceilings quoted everywhere.
