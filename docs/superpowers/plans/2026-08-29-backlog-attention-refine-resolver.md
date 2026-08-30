# Backlog Attention + Refine #N Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:backlog attention` the one human list over every `needs:*` marker (+ breaker banner, tidy row, `bot:blocked`), and give it a resolver: `/claude-tweaks:backlog refine #N` plus a standalone `--reset-breaker` entry point.

**Architecture:** Prose engineering on the backlog skill. `attention-mode.md` (11,122 B, ample headroom) absorbs the fetch/merge/render changes. **`refine-mode.md` is at 40,902/40,960 bytes (58 B headroom) — it gets ZERO edits**: the new `#N`/`--reset-breaker` forms route from `SKILL.md`'s Input table directly to a NEW sub-file `plugin/skills/backlog/refine-record.md` (the up-front split the size-headroom rule requires), which reuses `refine-lanes.md`'s batch-confirm shape and cites `merge-lane-reset.md`'s existing procedure. Conformance tests pin the new rows.

**Tech Stack:** Markdown skill files + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1489/work/1489-spec.md`

## Global Constraints

- `#1488`'s shapes are live and binding (verified): label `needs:decision`; comment template `<!-- needs-decision: {unit} -->` + `## Decision needed` + `**Proposed:**`/`**Why:**`/`**Command:**` lines (`_shared/work-record.md` "Decision-comment template"); resolution rule = prepend `**Resolved:** {choice} — {date}`, remove the label only when zero unresolved `needs-decision:*` comments remain. Cite that template — never restate it.
- `refine-mode.md` must not grow (58 B headroom). Any edit to it is a plan violation — STOP and report if an edit there seems required.
- Fetches for `needs:*` and `bot:blocked` go through the session-scoped record snapshot (`_shared/record-queue-fetch.md`; `bin/lib/issues/record-snapshot.js`'s `snapshotPath`), filtered node-side in Step 2's merge — never new `gh issue list --label` calls. The existing `solution:unjustified` and `ready`+`shaped:headless` direct fetches stay byte-identical (the spec says keep them unchanged; the third's AND rationale is load-bearing).
- The breaker banner fails open (omit on read failure/degraded shape), mirroring `merge-lane-reset.md`'s posture verbatim.
- All new/changed rendered launchers are fully-qualified `/claude-tweaks:...` commands.
- Ledger row 7 carry (spec #1492): `backlog/SKILL.md:46`'s "/dispatch next's headless-unit shape" descriptor is reworded in Task 2's SKILL.md edit (Routine-fired bare drain; `next` = deprecated alias). `grant-mode.md:3` is NOT touched (spec #1490 owns it).
- Commit style: imperative, "refs #1489" (never closes/fixes), Claude-Session trailer.

---

### Task 1: `attention-mode.md` — snapshot fetch, four row types, banner + tidy rows

**Files:**
- Modify: `plugin/skills/backlog/attention-mode.md`

**Interfaces:**
- Consumes: `_shared/record-queue-fetch.md`'s session-scoped snapshot (`snapshotPath($CLAUDE_CODE_SESSION_ID)`, `UNION_FIELDS`, freshness TTL); `readBreakerState(cwd)` from `bin/lib/issues/merge-lane-breaker.js` (no signature change); `_shared/pipeline-run-dir.md`'s Anchoring for the tidy-row glob root.
- Produces: the row-type vocabulary Task 3's tests pin: types `needs:definition`, `needs:decision` (and catch-all `needs:*`), `solution:unjustified`, `shaped:headless (no grant)`, `bot:blocked`; launchers `specify #{n}` / `challenge #{n}` / `backlog refine #{n}`; the breaker-banner and tidy-row lines.

- [ ] **Step 1: Read the file in full, then edit:**

1. **Header paragraph** — the mode now unifies every open record carrying any `needs:*` label, `solution:unjustified`, `ready`+`shaped:headless` (no `auto:build`), or `bot:blocked`, plus two non-record rows (breaker banner, tidy residue). Keep the read-only framing.
2. **Step 1 (Fetch)** — replace the `needs:definition` `gh issue list` call: the `needs:*` family and `bot:blocked` are read from the session-scoped record snapshot (`_shared/record-queue-fetch.md` — resolve `snapshotPath`, fall through to one plain `gh issue list --state open --json {UNION_FIELDS} --limit 200` refresh when stale/absent per that contract), filtered in Step 2's node merge to open records whose labels include any name starting with `needs:` (one set) or equal to `bot:blocked` (second set). Keep the `solution:unjustified` and `ready`+`shaped:headless` direct fetches and their AND/OR rationale paragraph byte-identical. Update the `eval`/tmp-file block: drop `ST_BACKLOG_ATTENTION_NEEDS_DEFINITION`, add `ST_BACKLOG_ATTENTION_SNAPSHOT_FILTERED` (holding the node-filtered `{needsRecords, botBlockedRecords}` output).
3. **Step 2 (Merge)** — extend the merge script: seed the map from the snapshot-filtered `needs:*` records (each row's type = the actual matched label name(s), e.g. `needs:definition`, `needs:decision`); then `solution:unjustified`; then `shaped:headless (no grant)`; then `bot:blocked` — one row per number, `types` concatenated ` + ` in that fetch order (extend the existing multi-match convention and the "can in principle carry several" paragraph to the wider family). For each record whose types include `needs:decision`, extract the `Proposed:` line: from the snapshot's `comments` (or a `gh issue view {n} --comments` fallback for the plain-fetch path), take the NEWEST comment matching `<!-- needs-decision:` with no `**Resolved:**` line anywhere in its body, and capture its `**Proposed:** {text}` line for Step 4.
4. **Step 4 (Render)** — collapse recommended actions to exactly three launchers: `needs:definition` → `run /claude-tweaks:specify #{n} to route through brainstorming`; `solution:unjustified` → keep the existing grant-or-evidence text (already names `backlog refine #{n}`); **every other `needs:*` value** (starting with `needs:decision`), `shaped:headless (no grant)`, and `bot:blocked` → `run /claude-tweaks:backlog refine #{n} ...` (per-type clause: decision rows append `— proposed: "{Proposed line, verbatim}"`; shaped:headless keeps its no-human-reviewed clause; `bot:blocked` says `to re-authorize after the failure`). State in prose that the `refine #{n}` catch-all is the **permanent default** for any future `needs:*` marker — a new marker gets a dedicated launcher only by a later record's explicit decision. Update the example table rows and the multi-type example accordingly.
5. **Two rows above the ranked table**, in order, each with its own short subsection before "Step 4: Render"'s table (call it "Step 3.5: Non-record rows"):
   - **Breaker banner:** `readBreakerState(process.cwd())` via `node -e` (same snippet shape as `merge-lane-reset.md`); when the read succeeds AND `tripped: true` AND the state is not the degraded fail-closed shape (mirror `merge-lane-reset.md`'s "read failure degrades to skip" posture — a read failure or degraded shape omits the banner, never renders a false positive), render: `⚠ Merge-lane circuit breaker tripped {trippedAt} by #{trippedBy.record}: {trippedBy.reason} — run /claude-tweaks:backlog refine --reset-breaker`. Otherwise omit entirely.
   - **Tidy row:** glob `{$RUN_ROOT}/.claude-tweaks/pipelines/*-tidy-standalone*/staged/` with `$RUN_ROOT` resolved per `_shared/pipeline-run-dir.md`'s Anchoring section (never a bare relative path, `[IL-127]`); take the newest matching run dir by ISO-timestamp prefix; when its `staged/` holds ≥1 file, render `{count} tidy proposal(s) staged awaiting approval — run /claude-tweaks:tidy --approve`; omit when absent/empty. Note the accepted single-newest limitation verbatim from the spec (older non-empty `staged/` surfaces only after the newer resolves).
6. **Empty state** — update the message to name the wider family: `Nothing needs attention — no open record carries a needs:* marker, solution:unjustified, an ungranted shaped:headless spec, or bot:blocked.` (banner/tidy rows render independently of the table's emptiness).
7. **Anti-Patterns** — update the first row (the AND-call warning) if its label examples read stale; add one row: `Rendering the breaker banner from a failed/degraded read | merge-lane-reset.md's fail-open posture — omit, never a false-positive tripped state`.

- [ ] **Step 2: Verify**

Run: `wc -c plugin/skills/backlog/attention-mode.md` — Expected: well under 40960 (report the number).
Run: `grep -c "refine #{n}\|refine #\${n}\|backlog refine" plugin/skills/backlog/attention-mode.md` — Expected: ≥ 4.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/backlog/attention-mode.md
git commit -m "Widen backlog attention to the needs:* family — snapshot fetch, bot:blocked row, breaker banner, tidy-residue row (refs #1489)"
```

---

### Task 2: `refine #N` + `--reset-breaker` — new sub-file, SKILL.md routing

**Files:**
- Create: `plugin/skills/backlog/refine-record.md`
- Modify: `plugin/skills/backlog/SKILL.md` (Input table, argument-hint, Component-Skill Contract/Anti-Patterns notes, the line-46 descriptor reword)
- Verify-only (zero edits): `plugin/skills/backlog/refine-mode.md`, `plugin/skills/backlog/merge-lane-reset.md`, `plugin/skills/backlog/refine-lanes.md`

**Interfaces:**
- Consumes: `_shared/work-record.md`'s Decision-comment template + Resolution rule (cite, never restate); `refine-lanes.md`'s batch-table + apply-all-vs-override `AskUserQuestion` shape (reuse by citation); `merge-lane-reset.md`'s question-and-write procedure (cite — "Do not duplicate the question text").
- Produces: `refine-record.md` with two entry points Task 3 pins; `SKILL.md` Input rows for `#N[,#M...]` and `--reset-breaker`.

- [ ] **Step 1: Write `plugin/skills/backlog/refine-record.md`** with this structure (match the backlog sub-files' voice; target ≤ 12 KB):

1. Header: loaded by `SKILL.md`'s Input routing for `refine #N[,#M...]` and `refine --reset-breaker` — both human-present-only forms; `refine-mode.md`'s whole-queue sweep never loads this file, and this file never runs the sweep.
2. **`--reset-breaker` (standalone):** resolves before any worklist fetch; runs exactly `merge-lane-reset.md`'s existing question-and-write procedure (cite the file; no duplicated question text); exits without touching any record — no sweep, no batch table. Run-dir: `/claude-tweaks:backlog` is on `_shared/pipeline-run-dir.md`'s standalone-auto allowlist, so this resolves the standard `{ISO}-backlog-standalone` run dir and the reset's one AUTO log line lands in its `decisions.md` (cite `merge-lane-reset.md`'s existing log-line format).
3. **`#N[,#M...]` (per-record resolver):** fetch the named record(s) by number (`gh issue view {n} --json number,title,labels,body,comments`) — targeted-by-number, so records carrying the old comment-only marker but no label are still reachable. For each record collect: (a) every unresolved decision comment — a comment matching `^<!-- needs-decision: (\S+) -->` with no `**Resolved:**` line in its body, newest-per-unit is the live proposal (cite `_shared/work-record.md`'s template + resolution rule); (b) **compatibility shim, with removal condition:** a comment matching `^<!-- backlog-refine-human-only -->` (PR #1440's pre-generalization marker) with no `**Resolved:**` line is treated as an unmigrated `needs:decision` proposal with `{unit}` = the literal `backlog-refine`. Removal condition: delete this shim once no open record carries the old marker (one-off `gh search issues` audit at the next minor release after #1489 ships). (c) whether the record carries `bot:blocked`.
4. **Batch table:** one row per record per unresolved comment (a record with two unresolved comments gets two rows), rendered in one table for the whole `#N,#M` list; choices per row: **grant anyway** (adds `auto:build`; resolution-rule label clearing), **build it myself**, **keep**, **park**, **close**, plus **re-authorize** appended to any row whose record carries `bot:blocked` (strips `bot:blocked`, mirroring the whole-queue Re-authorize lane's mechanics — cite `refine-lanes.md`; independent of the decision choice: resolving `needs:decision` never touches a co-occurring `bot:blocked` and vice versa). State verbatim: "build it myself" and "keep" are deliberately identical in write effect (both clear `needs:decision` with no other label change) — they exist so the `**Resolved:**` text names the human's actual reason (a scheduled future build vs a considered no-op), for record-history readers, not for any downstream mechanism.
5. **One `AskUserQuestion` for the whole batch** — apply-all-vs-override, citing `refine-lanes.md`'s existing batch-confirm shape; never one question per comment.
6. **Apply:** for each resolved row, prepend `**Resolved:** {choice} — {date}` to that comment's body (`gh issue comment --edit-last`-style edit per the template's rule — use `gh api` comment update by id), apply the choice's label writes in the same pass, and remove `needs:decision` only when zero unresolved `needs-decision:*` comments remain on that record (cite the resolution rule). `park`/`close` apply the standard label/state writes the whole-queue lanes use (cite `refine-lanes.md`). Log one `decisions.md` line per record (standalone-auto run dir), naming record, choice(s), and writes.
7. **Anti-Patterns table** (small): restating the decision-comment template instead of citing `_shared/work-record.md`; resolving one unit's comment and removing the label while another unit's comment is unresolved; running the whole-queue sweep from this file; a Routine firing either form (human-present only).

- [ ] **Step 2: Edit `plugin/skills/backlog/SKILL.md`:**

1. `argument-hint` → `"[refine|overview|grant|attention] [#N[,#M...]] [critical|risk-value|cleanup|trust] [--budget <n>] [--origin <origin>] [--reset-breaker]"`.
2. Input table (the `## Input` section): add two rows — `refine #N[,#M...]` → per-record decision resolver, human-present only, reads `refine-record.md` (never the whole-queue sweep); `refine --reset-breaker` → standalone breaker reset, human-present only, reads `refine-record.md`.
3. Component-Skill Contract + Anti-Patterns: one sentence each noting `#N` and `--reset-breaker` are human-present-only (same posture as bare `refine`; never Routine-fired).
4. **Line ~46 descriptor reword (ledger row 7 carry, refs #1492):** the sentence citing "`/claude-tweaks:dispatch`'s `next` form" / "`/dispatch next`'s headless-unit shape" as grant-mode's mirror → reword to "the Routine-fired bare drain (`/claude-tweaks:dispatch --budget 1`; `next` is its deprecated alias)". Touch only that clause. (Check line ~100 and ~116's "mirrors the `next` form rule" phrasing — update only if the same sentence-level staleness applies; the *rule* they cite still exists.)

- [ ] **Step 3: Verify**

Run: `wc -c plugin/skills/backlog/refine-mode.md` — Expected: **exactly 40902** (untouched).
Run: `wc -c plugin/skills/backlog/SKILL.md plugin/skills/backlog/refine-record.md` — both under 40960.
Run: `grep -n "refine-record.md" plugin/skills/backlog/SKILL.md` — Expected: ≥ 2 hits (both Input rows).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/backlog/refine-record.md plugin/skills/backlog/SKILL.md
git commit -m "Add refine #N decision resolver and standalone --reset-breaker via new refine-record.md — refine-mode.md untouched at its ceiling (refs #1489)"
```

---

### Task 3: Conformance tests

**Files:**
- Create: `tests/backlog-attention-rows.test.js`
- Verify: `tests/backlog-overview-foldin-no-truncation.test.js`, `tests/backlog-refine-foldin-no-truncation.test.js` (sibling shapes — read first, reuse their read/flatten helpers' style)

**Interfaces:**
- Consumes: Tasks 1-2's literal prose.

- [ ] **Step 1: Read the two sibling suites**, then write `tests/backlog-attention-rows.test.js` with tests (exact strings pinned against the real files after reading them — the intents below, each discriminating):

1. attention-mode fetches `needs:*` through the session-scoped snapshot: matches `record-queue-fetch.md` citation and does NOT match a `gh issue list --state open --label needs:definition` call line.
2. The `solution:unjustified` and `ready`+`shaped:headless` direct fetches survive byte-level (pin the two `gh issue list` lines).
3. Render collapses to the three launchers: `needs:decision` rows quote `**Proposed:**`; catch-all-`needs:*`→`refine #{n}` stated as permanent default; `bot:blocked` row present with the refine launcher.
4. Breaker banner: matches the fail-open omission sentence AND the `--reset-breaker` launcher; tidy row: matches the anchored glob (`[IL-127]` citation or `Anchoring` reference) and the `tidy --approve` launcher.
5. `refine-record.md` exists; cites `_shared/work-record.md`'s template (matches `Decision-comment template` or `<!-- needs-decision:`), cites `merge-lane-reset.md` for `--reset-breaker` (and does NOT contain the breaker question text "Reset it?" — the no-duplication rule); carries the `backlog-refine-human-only` shim with a removal condition (matches `removal condition`, case-insensitive).
6. `refine-mode.md` byte size is exactly the pre-task value is NOT pinned (would be brittle) — instead assert `refine-mode.md` does not mention `refine-record.md` and `SKILL.md` does (routing lives in SKILL.md).
7. backlog `SKILL.md` argument-hint includes `#N[,#M...]` and `--reset-breaker`; no backtick-quoted `` `/claude-tweaks:dispatch next` `` remains (row-7 carry pin).

- [ ] **Step 2: Run**

Run: `node --test tests/backlog-attention-rows.test.js tests/backlog-overview-foldin-no-truncation.test.js tests/backlog-refine-foldin-no-truncation.test.js tests/grant-mode-inprogress-pin.test.js`
Expected: PASS (all). If a pin disagrees with the prose, fix whichever is wrong, favoring this plan's stated text.

- [ ] **Step 3: Commit**

```bash
git add tests/backlog-attention-rows.test.js
git commit -m "Pin backlog attention's widened rows and the refine-record resolver contract (refs #1489)"
```

---

## Verification (whole plan)

- The three task suites green; `npm test` full suite green (central, after last commit).
- AC trace: AC1 → T1 items 3-4 (Proposed quote + refine launcher) pinned by T3.3; AC2 → T2 items 4/6 (build-it-myself semantics + resolution rule); AC3 → T1 item 5 banner-first + T2 item 2 (`--reset-breaker` single question + one log line); AC4 → T1 item 5 tidy row (count + launcher, omit-when-empty); AC5 → T1 item 6 empty state + T3 suite (sibling convention).
- Non-goals honored: no grant-mode/refine-mode edits (grant fold is #1490; sweep untouched); overview-mode untouched.
