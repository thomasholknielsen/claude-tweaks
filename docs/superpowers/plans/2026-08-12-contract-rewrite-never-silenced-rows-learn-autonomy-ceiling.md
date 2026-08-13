# Contract Rewrite: Never-Silenced Rows Learn the Autonomy Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `skills/_shared/auto-mode-contract.md`'s "What `auto` does NOT silence" rows (memory writes, work-record creation, upstream filing, ledger resolve gate Phase 2) to the ceiling-aware tiered stance — `supervised`/`trusted` fold `M#`/`Q#`/`U#` under the Review Console's batch "Approve all"; `unattended` auto-resolves them with zero prompts under `consoleAutoResolve`. State the stance once in the contract; propagate citations (never restatements) to `auto-mode-card.md`, `wrap-up/memory-curation.md`, and `CLAUDE.md`. Sweep the rest of the repo for stale restatements of the old "never exempt" posture.

**Architecture:** Pure contract-prose work. The contract file is the single source of truth; every other touched file either cites it or is updated to match its new stance — never a second copy of the mechanism. This sub-issue defines the stance only; #350 (console mechanics) and #351 (ledger route-remainder implementation, review-floor default) implement it.

**Tech Stack:** Markdown (skill/contract files), `grep` for the verification sweep, `node --test` for the project's test suite (no test currently pins this file's prose — Task 6 re-verifies).

## Global Constraints

- State the tiered stance **once**, in `skills/_shared/auto-mode-contract.md`. Every other file cites it — never restates the mechanism.
- Do NOT touch `wrap-up/review-console.md`, `console-template.md`, `execution-and-verification.md`, `batched-item-drill.md`, `upstream-feedback-batch.md` (#350's scope — mechanics, not stance) or `ledger/resolve-gate.md`, `review/SKILL.md`, `dispatch/SKILL.md` (#351's scope).
- HARD-GATE, `BLOCKED`/`STOP`, merge-conflict resolution, and human-only `auto:*` granting rows are NOT weakened — do not edit them.
- Commit references to #288, #298, [IL-114], and #347 use "refs #N", never closing keywords.
- Read `docs/skill-authoring.md` before editing any `skills/**/*.md` file (every task below touches one).

---

### Task 1: Rewrite the four never-silenced rows in `skills/_shared/auto-mode-contract.md`

**Files:**
- Modify: `skills/_shared/auto-mode-contract.md` (the "What `auto` does NOT silence" table, ~lines 179-198 — specifically the ledger resolve gate Phase 2 row ~185, the work-record creation row ~186, the memory file writes row ~188, and the upstream feedback filing row ~189)

**Interfaces:**
- Consumes: nothing — pure prose.
- Produces: the canonical stance text every other task in this plan cites or matches. Tasks 2-4 quote this task's exact new row text where they need to summarize it — read this task's Step 3 output before starting Tasks 2-4.

- [ ] **Step 1: Read the current table in full**

Read `skills/_shared/auto-mode-contract.md` lines 179-199 (the full "What `auto` does NOT silence" table) to confirm the four target rows' exact current text matches what Step 3 below assumes. If it has drifted (line numbers or wording differ), adapt Step 3's replacements to the actual current text — match by row content (the leading `| Item |` cell text), not by line number.

- [ ] **Step 2: Read `docs/skill-authoring.md`**

Required before editing any `skills/**/*.md` file per this plan's Global Constraints.

- [ ] **Step 3: Replace the four rows**

Current text (the ledger resolve gate Phase 2 row):

```
| Ledger resolve gate Phase 2 (every open item, per-item) | Items represent unfinished work — silently dropping them is the bug `auto` is *not* allowed to introduce, unless the `autonomy` ceiling's `ledgerNarrowing` bookkeeping capability is unlocked (`trusted`+) — see `_shared/autonomy-ceiling.md` for the narrow, backlog-only carve-out |
```

Replace with:

```
| Ledger resolve gate Phase 2 (every open item, per-item) | Items represent unfinished work — silently dropping them is the bug `auto` is *not* allowed to introduce, unless the `autonomy` ceiling's bookkeeping capabilities are unlocked: `ledgerNarrowing` (`trusted`+) auto-routes an item whose blocker reason clears the four-category floor to `Route to a record → Keep (backlog)`; `ledgerRouteRemainder` (`unattended`) extends that same restricted disposition to the remainder — see `_shared/autonomy-ceiling.md` for the narrow, backlog-only carve-out |
```

Current text (the work-record creation row):

```
| Work-record creation (new backlog records) | Each record filed on the user's tracker needs explicit user approval — the record queue is the user's, not the model's. Scheduled health-skill filing is exempt — born-ready records are those skills' documented output (see `_shared/work-record.md`, born-ready rule). Queue-write proposals are also exempt when `queueWriteAutoFile` is unlocked (`trusted`+) — see `_shared/autonomy-ceiling.md`. |
```

Replace with:

```
| Work-record creation (new backlog records, `Q#` at the Review Console) | Each record filed on the user's tracker needs explicit approval — the record queue is the user's, not the model's. At `supervised`/`trusted`, covered by the Review Console's batch "Approve all" — `Q#` applies by default (the checked state), a reversal of the #288 family's per-item carve-out on explicit direction (refs #288, #347); `queueWriteAutoFile` (`trusted`+, `_shared/autonomy-ceiling.md`) additionally files directly without waiting for the console. At `unattended`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` (`_shared/autonomy-ceiling.md`). Scheduled health-skill filing is separately exempt at every tier — born-ready records are those skills' documented output (see `_shared/work-record.md`, born-ready rule). |
```

Current text (the memory file writes row):

```
| Memory file writes (`/wrap-up`'s Memory curation row, `_shared/learning-routing.md` D4) | A memory file is cross-project and always-loaded — a wrong one silently degrades every future session in every project the user works in, which is the largest blast radius of any routing destination. Always staged, never auto-applied. **Not** exempt under any `autonomy` tier. |
```

Replace with:

```
| Memory file writes (`/wrap-up`'s Memory curation row, `_shared/learning-routing.md` D4, `M#` at the Review Console) | A memory file is cross-project and always-loaded — a wrong one silently degrades every future session in every project the user works in, which is the largest blast radius of any routing destination. Always staged, never written outside its own approval. At `supervised`/`trusted`, covered by the Review Console's batch "Approve all" — `M#` applies by default (the checked state), a reversal of the #288 family's per-item carve-out on explicit direction (refs #288, #347). At `unattended`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` (`_shared/autonomy-ceiling.md`). Per-item chunking (inspect each file before approving) survives only inside the Override drill. |
```

Current text (the upstream feedback filing row):

```
| Upstream feedback filing (`/wrap-up`'s Upstream feedback curation row, `/claude-tweaks:feedback`) | Publishes privately-derived content to a public repository — outward-facing and effectively irreversible, the same category as work-record creation. The scrub and confirm gates run in every mode. **Not** exempt under any `autonomy` tier. |
```

Replace with:

```
| Upstream feedback filing (`/wrap-up`'s Upstream feedback curation row, `/claude-tweaks:feedback`, `U#` at the Review Console) | Publishes privately-derived content to a public repository — outward-facing and effectively irreversible, the same category as work-record creation. The scrub gate runs in every mode. At `supervised`/`trusted`, covered by the Review Console's batch "Approve all" — `U#` now applies/files by default (the checked state), a reversal of both the #288 family's per-item carve-out and of [IL-114]'s unchecked-by-default posture at the batch level (refs #288, [IL-114], #347); the unchecked-by-default described in `_shared/upstream-feedback-batch.md` survives only inside the Override drill's own per-item chunking, never as the Approve-all default. At `unattended`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` (`_shared/autonomy-ceiling.md`). |
```

- [ ] **Step 4: Verify the four rows landed correctly**

Run: `grep -n "Not exempt under any" skills/_shared/auto-mode-contract.md`
Expected: no output (zero matches).

Run: `grep -in "consoleautoresolve" skills/_shared/auto-mode-contract.md`
Expected: 3 matches (the work-record, memory, and upstream rows).

Run: `grep -in "ledgerrouteremainder" skills/_shared/auto-mode-contract.md`
Expected: 1 match (the ledger row).

Run: `grep -in "HARD-GATE" skills/_shared/auto-mode-contract.md`
Expected: still matches section 6's exemption list (unchanged — confirm no row you edited touched it).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/auto-mode-contract.md
git commit -m "$(cat <<'COMMIT_EOF'
Rewrite never-silenced rows to the ceiling-aware tiered stance

M#/Q#/U# (memory, work-record/queue, upstream) now fold under the
Review Console's batch Approve all at supervised/trusted, and
auto-resolve under consoleAutoResolve at unattended -- reversing the
#288 family's per-item carve-out and IL-114's unchecked-by-default
posture at the batch level, on explicit direction. The ledger resolve
Phase 2 row learns ledgerRouteRemainder alongside the pre-existing
ledgerNarrowing.

refs #349
COMMIT_EOF
)"
```

---

### Task 2: Align `skills/_shared/auto-mode-card.md`'s compact list

**Files:**
- Modify: `skills/_shared/auto-mode-card.md` (the "What `auto` does NOT silence (never-silenced list)" bullets, ~lines 29, 32-33)

**Interfaces:**
- Consumes: Task 1's rewritten rows (this task summarizes them, one line each, citing the contract — never restating the mechanism).
- Produces: nothing consumed by code.

- [ ] **Step 1: Read `docs/skill-authoring.md`** (if not already read this session).

- [ ] **Step 2: Replace the three bullets**

Current text:

```
- Ledger resolve gate Phase 2 (every open item, per-item) — except the narrow `autonomy` ceiling's `ledgerNarrowing` carve-out (`trusted`+)
- Work-record creation (new backlog records) — except born-ready health-skill filing and `queueWriteAutoFile`-gated queue writes (`trusted`+)
- Ops-acknowledgment, when ops items exist — except `opsAckAutoAcknowledge` (`unattended` only)
- Memory file writes (`/wrap-up`'s Memory curation row) — never exempt
- Upstream feedback filing (`/claude-tweaks:feedback`) — never exempt
```

Replace with:

```
- Ledger resolve gate Phase 2 (every open item, per-item) — except the narrow `autonomy` ceiling's `ledgerNarrowing` (`trusted`+) and `ledgerRouteRemainder` (`unattended`) carve-outs
- Work-record creation (new backlog records, `Q#`) — folded into the Review Console's "Approve all" at `supervised`/`trusted`, auto-resolved under `consoleAutoResolve` at `unattended` — see the contract's tiered stance
- Ops-acknowledgment, when ops items exist — except `opsAckAutoAcknowledge` (`unattended` only)
- Memory file writes (`/wrap-up`'s Memory curation row, `M#`) — folded into the Review Console's "Approve all" at `supervised`/`trusted`, auto-resolved under `consoleAutoResolve` at `unattended` — see the contract's tiered stance
- Upstream feedback filing (`/claude-tweaks:feedback`, `U#`) — folded into the Review Console's "Approve all" at `supervised`/`trusted`, auto-resolved under `consoleAutoResolve` at `unattended` — see the contract's tiered stance
```

(Leave the surrounding lines — Ops-acknowledgment and everything before/after this block — exactly as they are; only these three bullets change, and the Ops-acknowledgment bullet is reproduced above only to anchor the edit between the ledger and memory bullets, not because it changes.)

- [ ] **Step 3: Verify**

Run: `grep -in "never exempt" skills/_shared/auto-mode-card.md`
Expected: no output (zero matches).

Run: `grep -in "consoleAutoResolve" skills/_shared/auto-mode-card.md`
Expected: 3 matches (work-record, memory, upstream bullets).

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/auto-mode-card.md
git commit -m "$(cat <<'COMMIT_EOF'
Align auto-mode-card.md's compact list with the tiered stance

Same stance as auto-mode-contract.md, one line per row, citing the
contract rather than restating the mechanism.

refs #349
COMMIT_EOF
)"
```

---

### Task 3: Rewrite `skills/wrap-up/memory-curation.md` Step 1's stance

**Files:**
- Modify: `skills/wrap-up/memory-curation.md` (Step 1, ~lines 24-27 and ~lines 29-36)

**Interfaces:**
- Consumes: Task 1's rewritten memory row (this task's new prose must not contradict it).
- Produces: nothing consumed by code. Write-procedure mechanics (how/when the file actually gets written) stay out of this task — that is #350's scope (console mechanics).

- [ ] **Step 1: Read `docs/skill-authoring.md`** (if not already read this session).

- [ ] **Step 2: Replace the "never auto-resolved" paragraph**

Current text:

```
Memory writes are never auto-resolved regardless of mode. `_shared/auto-mode-card.md` lists
them among what `auto` does not silence — a memory file is cross-project and always-loaded, so a
wrong one silently degrades every future session in every project the user works in, the largest
blast radius of any routing destination. It is **not** exempt under any `autonomy` tier.
```

Replace with:

```
Memory writes follow the tiered stance in `_shared/auto-mode-card.md` / `_shared/auto-mode-contract.md` — a
memory file is cross-project and always-loaded, so a wrong one silently degrades every future
session in every project the user works in, the largest blast radius of any routing destination.
At `supervised`/`trusted`, this row (`M#`) is covered by the Review Console's batch "Approve all".
At `unattended`, it auto-resolves with zero `AskUserQuestion` calls under `consoleAutoResolve`.
Per-item chunking (inspect each proposed file before approving) survives only inside the Override drill.
```

- [ ] **Step 3: Retarget the same-turn-write prohibition**

Current text:

```
**This is a per-item gate, not folded into any other approval.** Reflect's insights batch table
(`reflect/full-mode.md`) resolving an insight to D4 — even under "Apply all" — approves *routing*
it here, not writing it. The Skill Updates batch, the cleanup+configuration batch, and any other
`AskUserQuestion` in this run are likewise not this gate. The memory file is written only after its
own dedicated `M#` `AskUserQuestion` (at the Review Console) resolves to Apply or
Edit. Writing a memory file in the same turn as a different table's approval, with no intervening
`M#` prompt naming that specific file, is the exact contract violation this section exists to
prevent.
```

Replace the last two sentences (starting "The memory file is written only after...") with:

```
The memory file is written only after this row's own batch decision (or auto-resolution) for this
run — at `supervised`/`trusted`, the console's "Approve all" (or its own dedicated `M#` `AskUserQuestion`
at Override); at `unattended`, `consoleAutoResolve`'s auto-resolution. Writing a memory file
before that batch decision (or auto-resolution) for this run, or in response to a different
table's approval, is the exact contract violation this section exists to prevent.
```

Keep the first three sentences of that paragraph (through "...likewise not this gate.") unchanged.

- [ ] **Step 4: Verify**

Run: `grep -in "never auto-resolved" skills/wrap-up/memory-curation.md`
Expected: no output (zero matches).

Run: `grep -in "per-item approval" skills/wrap-up/memory-curation.md`
Expected: no output (zero matches — confirm the retargeted sentence no longer says "per-item approval" as the write-gate trigger).

- [ ] **Step 5: Commit**

```bash
git add skills/wrap-up/memory-curation.md
git commit -m "$(cat <<'COMMIT_EOF'
Update memory-curation.md Step 1 to the tiered auto-resolve stance

refs #349
COMMIT_EOF
)"
```

---

### Task 4: Update CLAUDE.md's Auto-Mode Contract paragraph

**Files:**
- Modify: `CLAUDE.md` (the "Auto-Mode Contract + Bookend Architecture" section's "Single source of truth" paragraph)

**Interfaces:**
- Consumes: Task 1's rewritten stance (summarized here in one added clause, per CLAUDE.md's conciseness convention).
- Produces: nothing consumed by code.

- [ ] **Step 1: Locate the current paragraph**

Run: `grep -n "Single source of truth.*auto-mode-contract" CLAUDE.md`

Read the full paragraph at that line (it is one long sentence ending "...resolve without a click at \`trusted\`/\`unattended\`.").

- [ ] **Step 2: Append one clause**

Current text ends:

```
...except the narrow, explicit `autonomy` ceiling's bookkeeping capabilities (see `_shared/autonomy-ceiling.md`), which let floor-clearing ledger residue, queue writes, and ops-ack resolve without a click at `trusted`/`unattended`.
```

Replace with (same sentence, one clause appended before the final period):

```
...except the narrow, explicit `autonomy` ceiling's bookkeeping capabilities (see `_shared/autonomy-ceiling.md`), which let floor-clearing ledger residue, queue writes, and ops-ack resolve without a click at `trusted`/`unattended`, and — at `unattended` only — let the Review Console's memory, queue-write, and upstream-filing approvals resolve with zero clicks under `consoleAutoResolve`.
```

Leave every other word of the paragraph (and the rest of the section) unchanged — this is a one-clause addition, not a rewrite.

- [ ] **Step 3: Verify**

Run: `grep -n "consoleAutoResolve" CLAUDE.md`
Expected: 1 match, in the sentence just edited.

Run: `wc -l CLAUDE.md`
Expected: same line count as before the edit (the clause was appended within the existing paragraph's line, not as a new line) — confirm CLAUDE.md's documented 150-line budget for this section is not exceeded; if the paragraph now wraps to a new line in the rendered file, that is fine (Markdown paragraphs are not line-length-limited), but do not introduce an actual new blank line or heading.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'COMMIT_EOF'
Note the unattended-tier consoleAutoResolve carve-out in CLAUDE.md

One clause appended to the Auto-Mode Contract paragraph's existing
bookkeeping-carve-out sentence, per the CLAUDE.md-conciseness
convention.

refs #349
COMMIT_EOF
)"
```

---

### Task 5: Restatement sweep with visible output

**Files:**
- None modified directly by this task, unless the sweep finds a hit that is genuinely this sub-issue's own scope (see Step 3) — in that case, fix it in this task and note it in the commit.

**Interfaces:**
- Consumes: the state of the repo after Tasks 1-4.
- Produces: the classification list required by Acceptance Criterion 5, written into this task's commit message (or, if no commit is needed, appended as a note to the ledger — see Step 4).

- [ ] **Step 1: Run the sweep**

Run: `grep -rin "never silence\|not silence\|never exempt\|not exempt\|never auto-resolved\|per-item approval\|per-item human" skills/ docs/ CLAUDE.md`

Capture the full output — every matching line with its file:line.

- [ ] **Step 2: Classify every hit**

For each hit, classify as exactly one of:

- **(a) updated here** — a hit inside `skills/_shared/auto-mode-contract.md`, `skills/_shared/auto-mode-card.md`, `skills/wrap-up/memory-curation.md`, or `CLAUDE.md` that Tasks 1-4 already fixed (confirm by re-checking: does the grep pattern still match at that exact location after Tasks 1-4's edits? If yes, Tasks 1-4 missed it — fix it now as part of this task, additively, matching Tasks 1-4's own replacement style. If no — the grep hit list from Step 1 was captured before Tasks 1-4 landed, or matches a DIFFERENT nearby sentence Tasks 1-4 did not touch, e.g. section 6's own "does NOT silence" heading text or the HARD-GATE exemption list, which are correct as-is and not stale).
- **(b) owned by a sibling sub-issue** — a hit describing console mechanics (`wrap-up/review-console.md`, `console-template.md`, `execution-and-verification.md`, `batched-item-drill.md`, `upstream-feedback-batch.md` — #350's scope) or ledger/dispatch mechanics (`ledger/resolve-gate.md`, `review/SKILL.md`, `dispatch/SKILL.md` — #351's scope). Name the specific sibling sub-issue (#350 or #351) for each such hit. Do NOT edit these files.
- **(c) already consistent** — a hit that is accurate as-is and not about the M#/Q#/U# tiered stance at all (e.g., a HARD-GATE row, a `BLOCKED`/`STOP` condition, an unrelated "per-item" reference in a different context like the ledger drill's own Step 1 three-way choice, or `auto-mode-contract.md`'s own memory-writes-row prose *after* Task 1's fix, which now legitimately uses different wording than the swept patterns).

- [ ] **Step 3: Fix any genuine (a) misses found in Step 2**

If Step 2 found any hit that is genuinely this sub-issue's own scope and was missed by Tasks 1-4 (a stale restatement inside one of the four files this plan already owns, or a fifth file whose sole content is a restatement of the same never-silenced posture with no mechanics of its own), fix it now — matching the tiered-stance wording pattern Task 1 established. If Step 2 found no such misses, state that explicitly.

- [ ] **Step 4: Record the classification list**

Include the full classification list (every hit from Step 1, tagged a/b/c, with the sibling sub-issue named for every (b)) in this task's commit message if Step 3 made a fix, or — if Step 3 found nothing to fix — append the classification list as a `build/skill`-unrelated note to this run's open items ledger (`docs/plans/2026-08-12-spec-348-349-ledger.md`, phase `build`, status `observation`, since it is informational record-keeping the acceptance criteria requires, not a defect): `| N | build | Restatement sweep for #349: {M} hits, classified {a-count} updated / {b-count} sibling-owned / {c-count} already consistent (full list in decisions.md) | observation | — |`. Either way, the full itemized list must exist in the run's audit trail (`decisions.md` under the `## /build` heading is always acceptable as the durable copy regardless of which of the two paths above also applies).

- [ ] **Step 5: Commit (only if Step 3 made a fix)**

```bash
git add <files touched in Step 3, if any>
git commit -m "$(cat <<'COMMIT_EOF'
Restatement sweep: fix N stale never-silenced restatement(s)

Classification: {a-count} updated here, {b-count} owned by #350/#351,
{c-count} already consistent. Full list in this run's decisions.md.

refs #349
COMMIT_EOF
)"
```

If Step 3 found nothing to fix, no commit for this task — proceed to Task 6.

---

### Task 6: Final verification sweep

**Files:**
- None modified — this task only runs checks.

- [ ] **Step 1: Run the full project test suite**

Run: `npm test > /tmp/npm-test-349-output.txt 2>&1; tail -100 /tmp/npm-test-349-output.txt`
Expected: PASS. Redirect first (long runs truncate in the terminal).

- [ ] **Step 2: Confirm no test pins this contract's prose verbatim**

Run: `grep -rln "auto-mode-contract\|auto-mode-card" bin/ tests/`
Expected (per the spec's own note at authoring time): no matches. If a match IS found (meaning a test now pins this prose that didn't exist when the spec was written), read that test, fix its pinned string to match Task 1/2's new wording in the SAME commit as this verification task — never weaken the assertion to make it pass.

- [ ] **Step 3: Re-confirm all seven acceptance criteria**

Run each of these and confirm the expected result:

1. `grep -n "Not exempt under any" skills/_shared/auto-mode-contract.md` → zero matches.
2. `grep -in "consoleautoresolve" skills/_shared/auto-mode-contract.md` → matches all three rewritten rows; `grep -in "ledgerrouteremainder" skills/_shared/auto-mode-contract.md` → matches the ledger row.
3. `grep -in "never exempt" skills/_shared/auto-mode-card.md` → zero matches; the card's memory/queue/upstream lines reference the contract's tiered stance.
4. `grep -in "never auto-resolved" skills/wrap-up/memory-curation.md` → zero matches.
5. The sweep classification list exists in the run's ledger or commit message with every hit dispositioned — confirm Task 5's output is present in `decisions.md` or the ledger.
6. `npm test` passes (confirmed in Step 1); no verbatim-prose test found or, if found, fixed in the same commit (confirmed in Step 2).
7. `grep -in "HARD-GATE" skills/_shared/auto-mode-contract.md` → still matches section 6's exemption list.

No commit for this task — it is a verification gate only. If any check fails, return to the relevant task, fix, and re-commit there.
