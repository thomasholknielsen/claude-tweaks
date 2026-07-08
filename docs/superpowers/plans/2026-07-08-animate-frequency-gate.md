# Animate Frequency Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed "Frequency Gate" guardrail to every `animate` dispatch in claude-tweaks' Impeccable wrapper, so motion presence (not just style) is gated by how often the user triggers the interaction — the one idea from `kylezantos/design-motion-principles` not already covered by Impeccable's own `animate`/`motion-design` references.

**Architecture:** Prose-only change to two existing skill markdown files. `skills/design/command-map.md` becomes the single source of truth for the guardrail's exact text, added to its existing "Intent-driven" dispatch section (Step 3) and its "Survey mode" recommendation table. `skills/design/modes/polish.md` gets a one-line pointer to `command-map.md` — it must not duplicate the guardrail string.

**Tech Stack:** Markdown skill files (Claude Code plugin content). No code, no build step, no runtime test suite covers this content — verification is grep-based consistency checking, not `node --test`.

## Global Constraints

- **Single source of truth:** the exact Frequency Gate guardrail string is defined in exactly one place (`skills/design/command-map.md`). Every other file that references it points at `command-map.md` rather than re-quoting the string. This mirrors how this repo already treats `impeccable-cli.md` and `frontend-detection.md` as single-owner references (see `docs/superpowers/specs/2026-07-08-animate-frequency-gate-design.md`, "Changes" section).
- **Scope boundary:** the guardrail applies to `animate` only, never `delight`. Do not add it to `delight`'s dispatch anywhere.
- **No test suite applies:** `npm test` (this repo's `node --test` suite) covers `bin/` JS and hook logic, not skill markdown prose. Do not add or modify any `.test.js` file for this plan.

---

### Task 1: Document the Frequency Gate guardrail in `command-map.md`

**Files:**
- Modify: `skills/design/command-map.md:105-107` (insert new paragraph between the existing "Multi-intent ordering" paragraph and the "Manual-only commands" paragraph, inside the `### Step 3 — Intent-driven` section)
- Modify: `skills/design/command-map.md:127` (extend the `animate` row's rationale snippet in the "Survey 'would help' criteria → command mapping" table)

**Interfaces:**
- Consumes: nothing from other tasks — this task defines the canonical guardrail text.
- Produces: the canonical guardrail string, verbatim, for Task 2 to point at (not duplicate). The exact string, delimited by the blockquote markers below, is:

> "Apply a frequency gate before animating: keyboard-initiated actions and actions triggered 100+ times per day get no animation (instant state change only); daily/occasional actions get subtle, fast motion; rare (monthly-or-less) actions may receive expressive motion. Decide whether to animate first, using this gate — then apply your own duration/easing rules."

- [ ] **Step 1: Insert the Frequency Gate guardrail paragraph**

In `skills/design/command-map.md`, find this exact existing text (currently lines 105–107):

```markdown
**Multi-intent ordering.** When multiple intents dispatch, run them in the order declared by the user. The pairing for `delightful` (`delight` first, then `animate`) is fixed — `delight` adds personality content (empty states, microcopy), `animate` adds motion to the interactions; reversing them risks animating placeholder content. The intent dispatches share the polish phase's single re-verify cap (one re-verify cycle per `/flow` run regardless of how many intent commands ran).

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven. They remain manual-only and are surfaced as `survey`-mode recommendations when their "would help" criteria match. This keeps the auto-dispatch surface conservative — the three excluded commands produce the most aggressive creative drift (overdrive especially), so they require explicit user invocation rather than frontmatter consent.
```

Replace it with (inserting one new paragraph between the two, leaving both existing paragraphs unchanged):

```markdown
**Multi-intent ordering.** When multiple intents dispatch, run them in the order declared by the user. The pairing for `delightful` (`delight` first, then `animate`) is fixed — `delight` adds personality content (empty states, microcopy), `animate` adds motion to the interactions; reversing them risks animating placeholder content. The intent dispatches share the polish phase's single re-verify cap (one re-verify cycle per `/flow` run regardless of how many intent commands ran).

**Frequency Gate guardrail (`animate` only).** Every `animate` dispatch — currently the `design-intent: delightful` path, and any future auto-fit or issue-driven dispatch of `animate` should this wrapper ever add one — appends a fixed guidance suffix to the target argument, after the file list:

> "Apply a frequency gate before animating: keyboard-initiated actions and actions triggered 100+ times per day get no animation (instant state change only); daily/occasional actions get subtle, fast motion; rare (monthly-or-less) actions may receive expressive motion. Decide whether to animate first, using this gate — then apply your own duration/easing rules."

This is a fixed guardrail, not creative drift — same category as Impeccable's own mandatory `prefers-reduced-motion` rule baked into every `animate` call. It does not depend on audit signal or `design-intent` value to apply; append it every time this wrapper dispatches `animate`. `delight` does not carry this suffix: `delight` covers content and personality (copy, illustration, celebratory moments) with its own restraint framework, and a trigger-frequency gate keyed to "keyboard-initiated → never" would conflict with moments `delight` deliberately wants to celebrate (e.g. a first-time keyboard-shortcut reveal).

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven. They remain manual-only and are surfaced as `survey`-mode recommendations when their "would help" criteria match. This keeps the auto-dispatch surface conservative — the three excluded commands produce the most aggressive creative drift (overdrive especially), so they require explicit user invocation rather than frontmatter consent.
```

- [ ] **Step 2: Extend the Survey mode `animate` row**

In the same file, find this exact existing table row (currently line 127):

```markdown
| Page has interactive controls (toggles, hovers) but no transitions | `animate` | Static interactions feel unpolished |
```

Replace it with:

```markdown
| Page has interactive controls (toggles, hovers) but no transitions | `animate` | Static interactions feel unpolished — but skip if the control is keyboard-initiated or fires 100+ times/day |
```

- [ ] **Step 3: Verify the edits landed correctly**

Run:

```bash
grep -n "Frequency Gate" skills/design/command-map.md
```

Expected output: two matches — the `**Frequency Gate guardrail (\`animate\` only).**` heading line and the blockquote line starting `> "Apply a frequency gate before animating:`.

Run:

```bash
grep -n "100+ times/day" skills/design/command-map.md
```

Expected output: exactly one match — the Survey mode table row edited in Step 2. (The auto-dispatch guardrail text uses "100+ times per day" with "per day" spelled out, not "100+ times/day" — this is deliberate: the two are different sentences serving different readers, not a duplicate that needs to match verbatim. This grep is checking the Survey row landed, not checking for unwanted duplication.)

Run:

```bash
markdown_table_row=$(grep -n "^| Page has interactive controls" skills/design/command-map.md)
echo "$markdown_table_row"
```

Expected: the row prints with 3 pipe-delimited cells intact (no stray `|` introduced by the added clause that would break the table into a 4th column). Visually confirm the row still has exactly 4 `|` characters (3 columns + trailing).

- [ ] **Step 4: Commit**

```bash
git add skills/design/command-map.md
git commit -m "Add Frequency Gate guardrail to animate dispatch and survey rationale"
```

---

### Task 2: Point `polish.md` at the guardrail, verify no duplication

**Files:**
- Modify: `skills/design/modes/polish.md:62-64` (insert a pointer paragraph between the existing "Multi-intent ordering" and "Manual-only commands" paragraphs, inside `### Step 6: Intent-driven dispatch`)

**Interfaces:**
- Consumes: the canonical guardrail string location from Task 1 (`skills/design/command-map.md`, `### Step 3 — Intent-driven` section) — this task references that location, it does not re-quote the string.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Insert the pointer paragraph**

In `skills/design/modes/polish.md`, find this exact existing text (currently lines 62–64):

```markdown
**Multi-intent ordering.** When the user declared comma-separated intents (e.g., `design-intent: bold, delightful`), invoke commands in the order declared. The fixed `delight` → `animate` pairing for `delightful` is preserved even when interleaved with other intents — treat `delightful` as a single dispatch unit that produces two commands. The wrapper does not run a re-verify cycle between intent commands; the polish phase as a whole shares a single re-verify cycle (capped by `/flow`'s polish phase, see flow's polish-phase decision tree).

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations. Do not auto-dispatch them from `polish`.
```

Replace it with (inserting one new paragraph between the two, leaving both existing paragraphs unchanged):

```markdown
**Multi-intent ordering.** When the user declared comma-separated intents (e.g., `design-intent: bold, delightful`), invoke commands in the order declared. The fixed `delight` → `animate` pairing for `delightful` is preserved even when interleaved with other intents — treat `delightful` as a single dispatch unit that produces two commands. The wrapper does not run a re-verify cycle between intent commands; the polish phase as a whole shares a single re-verify cycle (capped by `/flow`'s polish phase, see flow's polish-phase decision tree).

**Frequency Gate guardrail.** The `animate` command's target argument always carries a fixed Frequency Gate guardrail suffix, appended after the file list — see `../command-map.md`'s `### Step 3 — Intent-driven` section for the exact text and rationale. Do not treat `animate`'s target as a bare file list when reasoning about this dispatch; the suffix is not optional and is not gated by audit findings or `design-intent` value.

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations. Do not auto-dispatch them from `polish`.
```

- [ ] **Step 2: Verify the pointer landed and does not duplicate the guardrail string**

Run:

```bash
grep -n "Frequency Gate" skills/design/modes/polish.md
```

Expected output: exactly one match — the `**Frequency Gate guardrail.**` heading line.

Run:

```bash
grep -c "Apply a frequency gate before animating" skills/design/command-map.md skills/design/modes/polish.md
```

Expected output:

```
skills/design/command-map.md:1
skills/design/modes/polish.md:0
```

If `polish.md` shows a count greater than 0, the guardrail string was duplicated instead of pointed at — undo and re-apply Step 1 using the pointer text exactly as given above, not a copy of the quoted guardrail.

- [ ] **Step 3: Full-repo consistency check**

Run:

```bash
grep -rn "Frequency Gate" skills/
```

Expected output: exactly two files listed — `skills/design/command-map.md` (2 matches, from Task 1) and `skills/design/modes/polish.md` (1 match, from this task's Step 1). No other file in `skills/` should mention it (confirms the change stayed scoped to the two files this plan targets).

- [ ] **Step 4: Run the existing test suite to confirm no unrelated breakage**

```bash
npm test 2>&1 | tail -15
```

Expected: `# fail 1` with the failure being `end-to-end: render under 500ms` in `tests/statusline.test.js` (a pre-existing, documented flake — see `specs/DEFERRED.md`, unrelated to this change) — or `# fail 0` if the flake doesn't reproduce this run. Any other failing test means something in this plan's edits broke — investigate before proceeding, since this plan should not touch any file `npm test` exercises.

- [ ] **Step 5: Commit**

```bash
git add skills/design/modes/polish.md
git commit -m "Point polish.md's intent-driven dispatch at the animate Frequency Gate guardrail"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc's three numbered "Changes" items map 1:1 — item 1 (command-map.md Intent-driven section) → Task 1 Step 1; item 2 (command-map.md Survey table) → Task 1 Step 2; item 3 (polish.md pointer) → Task 2 Step 1. Design doc's "Testing" section (consistency check + deferred manual smoke test) → Task 2 Steps 2–3 (consistency) with the manual smoke test correctly left undone here, matching the design doc's own "deferred, documented not run" call.
- **Placeholder scan:** No TBD/TODO; every step shows exact before/after text or an exact command with expected output.
- **Type consistency:** N/A — no code, no function signatures across tasks.
