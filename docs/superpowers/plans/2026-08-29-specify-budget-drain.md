# Specify Budget Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:specify`'s bare invocation a headless drain (`--budget <n|all>`, default from new policy key `specify-budget` = 5), with `next` demoted to a deprecated alias, the loop implemented as `next-mode.md`'s existing per-record sequence re-driven, and `--budget`'s canonical definition landing in `_shared/record-batch-input.md` (#762's file), cross-cited from dispatch.

**Architecture:** Same shape as #1492's dispatch drain (landed earlier this run — reuse its vocabulary verbatim per run-ledger row 9). The canonical `--budget <n|all>` semantics move to `_shared/record-batch-input.md` (4,128 B, ample room); `specify/SKILL.md` (39,642/40,960 — the retired `next` Input row funds the new drain row's bytes) and `dispatch/SKILL.md` (40,896/40,960 — 64 B headroom; its cross-cite must be a byte-neutral-or-negative swap of duplicated semantics prose for the citation) both cite it. `next-mode.md` (13,699 B) hosts the loop restructuring.

**Tech Stack:** Markdown skill files + `bin/lib/policy-schema.js` + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1491/work/1491-spec.md`

## Global Constraints

- **Vocabulary identity (run-ledger row 9):** `n` = attempt count (a claimed record that is then shaped, routed, or fails — a Framing-Guard route consumes a unit; a LOST CLAIM RACE does not); `all` = drain until the eligible set — re-fetched fresh and re-ranked each iteration — is empty. These sentences must read identically wherever they appear; the canonical copy lives in `record-batch-input.md`, everything else cites.
- Non-Goals: explicit input forms unchanged; Framing Guard / parent-record guard / needs:definition redirect logic untouched (the loop calls the identical per-record procedure); no `/sweep`.
- `shaped:headless` stamping unchanged on every drain-shaped record.
- Preserve the upstream #1276/#1321 pins recently added to `tests/specify-next-mode.test.js` (boundary-merge verdict) — re-point only what the loop change requires.
- Byte ceilings: every edited `plugin/skills/**` file ≤ 40,960; quote `wc -c` for specify/SKILL.md and dispatch/SKILL.md after edits.
- Commit style: imperative, "refs #1491" (never closes/fixes), Claude-Session trailer.

---

### Task 1: Canonical `--budget` definition + `specify-budget` policy key

**Files:**
- Modify: `plugin/skills/_shared/record-batch-input.md` (new `## The --budget flag` section)
- Modify: `plugin/skills/_shared/policy-schema.md` (+ `specify-budget` row), `plugin/bin/lib/policy-schema.js` (`POLICY_KEYS` entry: integer, default 5, category `pipeline-behavior`, summary + tier per its metadata contract — read 2-3 neighbouring entries first and mirror)
- Modify: `plugin/skills/dispatch/SKILL.md` (byte-neutral cross-cite swap in its `--budget` Input row)
- Modify: `tests/policy-schema.test.js` (new-key coverage, mirroring an existing integer key's test shape)

**Interfaces:**
- Produces: `record-batch-input.md`'s canonical section — the two vocabulary sentences (Global Constraints above) plus: applies to bare-drain invocations only; per-skill default resolution is the caller's (`dispatch-batch-size` for dispatch; `specify-budget` for specify); consumed by `/dispatch` (bare drain, #1492) and `/specify` (bare drain, #1491).

- [ ] **Step 1:** Add the section to `record-batch-input.md`; add the policy key (schema file + JS + doc row); swap dispatch/SKILL.md's `--budget` row's duplicated semantics prose for "(canonical semantics: `_shared/record-batch-input.md`'s `--budget` section)" — net bytes ≤ 0 for that file (64 B headroom; quote before/after `wc -c`; if a neutral swap is impossible without losing normative dispatch-specific content — the reject-combinations rule stays local — report DONE_WITH_CONCERNS naming the byte math rather than trimming unrelated text).
- [ ] **Step 2:** Run: `node --test tests/policy-schema.test.js tests/resolve-policy-cli.test.js tests/resolve-policy-lib.test.js tests/dispatch-budget-drain.test.js` — quote RAW output, all pass (the dispatch suite pins its hint/row text — if the swap breaks a pin, retarget the pin's wording, preserving its purpose).
- [ ] **Step 3: Commit.**

---

### Task 2: `specify/SKILL.md` Input + aliases file + routine template

**Files:**
- Modify: `plugin/skills/specify/SKILL.md`
- Create: `plugin/skills/specify/deprecated-aliases.md`
- Modify: `plugin/skills/specify/routine-template.yml`

- [ ] **Step 1: `SKILL.md`** (read in full; the retired `next` row's prose funds the additions — target ≤ 40,960, quote `wc -c`):
1. `argument-hint`: drop `next`, add `[--budget <n|all>]` (keep `--priority` and the other existing tokens).
2. Input / Resolve-the-input: bare (empty `$ARGUMENTS`) → **drain mode**: repeat `next-mode.md`'s claim → framing-guard → shape-or-route → release loop over the ranked eligible backlog until `--budget <n|all>` attempts are spent or the eligible set is empty (cite `record-batch-input.md` for the flag's canonical semantics; default from `specify-budget`, policy key). No confirmation prompt, human present or not. `--priority <band>` composes (restricts the pool before ranking). Rejections, each a one-line notice: `--budget` with any explicit form (`#N`, `#N,#M,...`, `#A-#B`, path, topic); `--budget 0`/negative → hard input error `"'--budget {value}' is not valid — must be a positive integer or 'all'"` before any fetch; `phase-N`/`--surface`/`--granularity`/`--chained` with bare drain (same posture `next` documents today — carry that text over).
3. `next` row → deprecated alias for `--budget 1`, one warn-tier notice, removal condition in `deprecated-aliases.md`.
4. Sweep SKILL.md's own prose for "next mode"/"the `next` form" descriptions that now describe the drain (headless-safe unit wording, Routine references) — reword to bare-drain-primary with `next` as alias; do NOT touch the Framing Guard or shaping sections.
- [ ] **Step 2: `deprecated-aliases.md`** — mirror `dispatch/deprecated-aliases.md`'s shape: `## next (deprecated alias for --budget 1)`: identical observable behavior (one record claimed, shaped/routed, same zero-eligible no-op), one warn-tier notice; removal condition: once `.claude-tweaks/policy.yml`, `reference-card.md`'s argument grammar, and `specify/routine-template.yml` cite only bare-with-`--budget`, checked at the next minor release — and no earlier than the second minor release after #1491 ships (the migration-window floor #1490's review established for this alias class).
- [ ] **Step 3: `routine-template.yml`** — `kickoff: specify` (bare, no explicit `--budget` — adopts `specify-budget`'s default 5); bump `template_version`; `notes:` states the cadence change plainly: each firing now shapes/routes up to five records instead of one (the spec's explicit choice, not an oversight), and how to pin the old cadence (`specify --budget 1` or a project `specify-budget: 1`).
- [ ] **Step 4:** Verify: `wc -c` both edited skills files; `grep -n "next" plugin/skills/specify/SKILL.md | head` shows no primary-form `next` outside the alias row/deprecation text. Commit (message states the Routine cadence change).

---

### Task 3: `next-mode.md` loop restructuring

**Files:**
- Modify: `plugin/skills/specify/next-mode.md` (check whether `next-mode-shape.md` carries the Selection/close-out text — the file was split since the spec's drafting; edit whichever file owns each section, and say which)

- [ ] **Step 1** (read both files in full first): restructure the driver, not the per-record body:
1. Header/title framing: this file is the drain's loop body + driver ("bare drain, and its deprecated `next` alias (`--budget 1`)").
2. Selection: from "exactly one record by dispatch's ranking" to the ranked list — each iteration re-fetches the eligible set fresh and re-ranks (priority-band-then-age, full re-derivation, never a filter over a frozen list); a record shaped/routed/claimed-elsewhere mid-run is naturally absent; a newly-eligible record is naturally picked up; a `needs:definition`-routed record is excluded by the worklist rule via the same re-fetch (no special-case skip).
3. Budget accounting: an attempt = a record this firing successfully claimed (then shaped, routed, or failed); a lost claim race consumes nothing — immediate retry against the next-ranked candidate from a fresh fetch. Cite `record-batch-input.md` for the vocabulary; don't restate.
4. Close-out: `{shaped: N, routed: M, failed: K}` counts leading, each bucket's record refs listed beneath; `failed` = exactly one outcome — claimed but Shape/Release raised before completing (never a lost race, never a Framing-Guard route); remaining/not-attempted records named when budget exhausted before the set emptied (AC1's third-record line). Zero-eligible first iteration keeps the existing cheap no-op text. Keep the render-Next-Actions-only-when-human-present rule verbatim.
5. `shaped:headless` stamping text untouched.
- [ ] **Step 2:** Verify `wc -c` (≤ 40,960; expect ~15-17 KB), and `grep -c "budget" ` ≥ 4. Commit.

---

### Task 4: Tests

**Files:**
- Modify: `tests/specify-next-mode.test.js` (re-point single-pick pins to loop semantics — **preserve the #1276 challenge-prose tests and #1321 generator-grep pins untouched**; verify by `git diff` that those test blocks have zero changes)
- Create or extend: a close-out-shape pin + drain-form pins (in `tests/specify-next-mode.test.js` or a sibling — follow that file's structure)

- [ ] **Step 1:** Re-point/extend: (1) Selection text now pins the ranked-list + per-iteration re-fetch wording (retarget stale single-pick pins, preserving each pin's purpose); (2) new pins: SKILL.md hint has `--budget <n|all>` and no primary `next`; the `--budget 0`/negative hard-error string; `specify/deprecated-aliases.md` exists with the removal condition + migration floor; routine kickoff `specify` bare + cadence note; close-out `{shaped: N, routed: M, failed: K}` shape and the failed-definition sentence; lost-claim-race non-consumption sentence; `record-batch-input.md`'s canonical section cited from both specify and dispatch SKILL.md files. Every negative assertion spot-checked to have existed at base (`git show <base>:...`).
- [ ] **Step 2:** Run: `node --test tests/specify-next-mode.test.js tests/policy-schema.test.js tests/dispatch-budget-drain.test.js tests/batch-ref-argument.test.js` — quote RAW output, all pass. Do NOT run full `npm test` (central later).
- [ ] **Step 3: Commit.**

---

## Verification (whole plan)

- Targeted suites green; full `npm test` central after last commit.
- AC trace: AC1 → T3 items 3-4 (+T4 pins); AC2 → T2 alias + T4; AC3 → T1 canonical `all` + T3 re-fetch loop; AC4 → T4 Step 1; AC5 → T3 item 4's render rule (carried verbatim) + T4 pin.
- Gotchas: attempt≠success (T1 vocabulary + T3 accounting); re-query per iteration (T3); #762 resolution honored (canonical home = record-batch-input.md, additive).
