# Impeccable Score Capture + Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the numeric health scores Impeccable's `critique` (Design Health Score, `??/40`) and `audit` (Audit Health Score, `??/20`) commands already produce on every `/design review` run, persist them across runs, and surface a trend (current vs. last captured score, with delta) in the review summary the user already reads — without adding a new command surface.

**Architecture:** Prose-only change to four existing skill markdown files, following the approved design doc. `skills/design/modes/review.md` gains score parsing (extended Step 4), a new persistence + delta-computation step (new Step 4.5), and a `score_trend` field on its output contract. `skills/review/review-summary-template.md`'s existing "Design Quality" section renders that field as a trend line. `skills/review/SKILL.md` Step 6.5 gets one updated table row documenting the field passes through. `skills/wrap-up/cleanup-procedures.md` gets one clarifying paragraph so the new persistent history file is never mistaken for the ephemeral per-spec caches it cleans up.

**Tech Stack:** Markdown skill files (Claude Code plugin content). No code, no build step. Verification is grep-based consistency checking, not `node --test` — matching the two prior plans in this series (`2026-07-08-animate-frequency-gate.md`, `2026-07-08-design-decisions-log-compliance.md`).

## Global Constraints

- **`score_trend`'s construction rule lives in exactly one place:** `skills/design/modes/review.md` Step 4 (parsing) + Step 4.5 (persistence + delta). `skills/review/review-summary-template.md` and `skills/review/SKILL.md` consume the field by name; neither re-derives or duplicates the parsing/delta logic.
- **The history file's schema (`.claude-tweaks/design/score-history.jsonl`) is defined exactly once**, in `review.md` Step 4.5. No other file in this plan restates its field names independently — they reference `score_trend`'s already-derived shape instead.
- **The history file is committed to git, not gitignored** — per the approved design doc. Do not add any `.gitignore` entry for `.claude-tweaks/design/` in this plan. Verify no existing rule already covers it (it doesn't, as of 2026-07-08 — confirmed against the current `.gitignore`, which only ignores `.claude-tweaks/pipelines/`, `.claude-tweaks/research/`, `.claude-tweaks/recon/`, and `.claude-tweaks/routine-environment-cache.yml`).
- **`skills/_shared/design-wrapper-handling.md` is intentionally NOT modified by this plan.** It documents `{result: "advisory", findings: [...]}` only in the context of routing findings into the Code Review Findings table (fix/defer/accept mechanics) — `score_trend` is a numeric metric with no fix/defer/accept semantics, so it has nothing to route and does not belong in that file.
- **Scope boundary:** only `review` mode's two LLM commands (`critique`, `audit`) produce a health score. `/design test` mode (the deterministic CLI, documented in `impeccable-cli.md`) has no score concept and is out of scope — do not touch `impeccable-cli.md` in this plan.
- **No test suite applies:** `npm test` (this repo's `node --test` suite) covers `bin/` JS and hook logic, not skill markdown prose. Do not add or modify any `.test.js` file for this plan. Task 3 runs the existing suite only to confirm this plan's edits caused no unrelated breakage.

---

### Task 1: Capture scores and compute trend in `/design review` mode

**Files:**
- Modify: `skills/design/modes/review.md` (header line 3; the Step 4 → EOF block, currently lines 32–79)

**Interfaces:**
- Consumes: nothing from other tasks — this task defines the field.
- Produces: the `score_trend` field (object, keys `critique`/`audit`, each `{current, max, previous, delta}` — `previous`/`delta` are `null` on first capture, and the whole key is absent if that command's Total row didn't parse), for Task 2 to consume by reference. Also produces the `.claude-tweaks/design/score-history.jsonl` file format for future runs to read.

- [ ] **Step 1: Update the header summary line**

In `skills/design/modes/review.md`, find this exact existing text (currently line 3):

```markdown
Invoked via `/claude-tweaks:design review <spec>`. Returns `{mode, result: "advisory", files_scanned, findings}` or `{mode, skipped, ...}` to caller. Also writes an audit cache that `polish` mode consumes.
```

Replace it with:

```markdown
Invoked via `/claude-tweaks:design review <spec>`. Returns `{mode, result: "advisory", files_scanned, findings, score_trend}` or `{mode, skipped, ...}` to caller. Also writes an audit cache that `polish` mode consumes, and appends to a persistent design-score history log.
```

- [ ] **Step 2: Extend Step 4 with score parsing, insert new Step 4.5**

In `skills/design/modes/review.md`, find this exact existing text:

```markdown
### Step 4: Normalize findings

Parse each output into a normalized findings list:

```json
{
  "source": "critique" | "audit",
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."
}
```
```

Replace it with:

```markdown
### Step 4: Normalize findings

Parse each output into a normalized findings list:

```json
{
  "source": "critique" | "audit",
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."
}
```

Also extract each command's Total score from its report text, independently of findings parsing:

- **Critique** report ends with a `| **Total** | | **??/40** | **[Rating band]** |` row ("Design Health Score"). Extract the numeric fraction from the `??/40` cell.
- **Audit** report ends with a `| **Total** | | **??/20** | **[Rating band]** |` row ("Audit Health Score"). Extract the numeric fraction from the `??/20` cell.

If a command's output has no matching Total row (malformed report, drifted format, missing table), treat that score as **absent** for this run — this does not affect findings normalization above, which always proceeds independently of score parsing.

### Step 4.5: Capture score + compute trend

1. Resolve the history file path: `.claude-tweaks/design/score-history.jsonl` (relative to project root). Create the `.claude-tweaks/design/` directory if it does not exist.
2. Before appending anything, read the existing file (if present) to find:
   - The most recent line containing a `critique_score` field → this becomes `score_trend.critique.previous`.
   - Independently, the most recent line containing an `audit_score` field → this becomes `score_trend.audit.previous`.

   Each score type tracks its own most-recent value independently — the last line carrying `audit_score` is not necessarily the same line as the last one carrying `critique_score`, since either can be absent on any given prior run. Skip any line that fails to parse as JSON while scanning; do not fail the whole read over one malformed line.
3. For each score type where both a current value (from Step 4) and a previous value (from the scan above) exist, compute `delta = current - previous`. If no prior line carries that score type's field, set `previous: null` and `delta: null` for it — first-ever capture reports as "first captured score" downstream.
4. Append one new line to the history file (create the file if it does not exist):

   ```json
   {"timestamp": "<ISO 8601 timestamp>", "spec": "<spec id or path, same value Step 5 uses for the audit cache>", "critique_score": 32, "critique_max": 40, "audit_score": 16, "audit_max": 20, "files_scanned": 3}
   ```

   Omit `critique_score`/`critique_max` (or `audit_score`/`audit_max`) entirely from the line — not `null` — when that score wasn't parseable this run (Step 4). A partial capture (one score present, one absent) still writes a partial line rather than being dropped entirely.
5. If the append fails (disk full, permission denied), surface as a one-time skip and continue — same recovery rule as Step 5's cache-write failure below. A history-write failure never blocks the review gate; scores are informational only.
```

- [ ] **Step 3: Extend the Output to caller contract**

In `skills/design/modes/review.md`, find this exact existing text:

```markdown
## Output to caller

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": <int>,
  "findings": [ ... combined critique + audit findings ... ]
}
```

`result: advisory` signals the findings inform the review verdict but do not auto-modify code. The `polish` mode (invoked separately by `/flow`) is the code-modifying counterpart that consumes the cached audit findings to drive issue-driven dispatch.
```

Replace it with:

```markdown
## Output to caller

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": <int>,
  "findings": [ ... combined critique + audit findings ... ],
  "score_trend": {
    "critique": { "current": 32, "max": 40, "previous": 28, "delta": 4 },
    "audit": { "current": 16, "max": 20, "previous": null, "delta": null }
  }
}
```

`score_trend` is built from Step 4.5. A score type's key (`critique` or `audit`) is omitted entirely from `score_trend` if that command's Total row didn't parse this run (Step 4). If **neither** score parsed, omit `score_trend` entirely from the output — same pattern as other inapplicable fields elsewhere in this contract.

`result: advisory` signals the findings inform the review verdict but do not auto-modify code. The `polish` mode (invoked separately by `/flow`) is the code-modifying counterpart that consumes the cached audit findings to drive issue-driven dispatch.
```

- [ ] **Step 4: Verify the edits landed correctly**

Run each separately (avoid `grep -E`/`\|` alternation — not portable to BSD grep on macOS):

```bash
grep -n "score_trend" skills/design/modes/review.md
```

Expected: exactly 5 matches — the header line, two mentions inside Step 4.5 (`score_trend.critique.previous`, `score_trend.audit.previous`), the `"score_trend":` key in the Output-to-caller JSON, and one mention in the prose sentence immediately below that JSON block.

```bash
grep -n "^### Step 4.5" skills/design/modes/review.md
```

Expected: exactly one match, appearing after `### Step 4: Normalize findings` and before `### Step 5: Write audit findings cache for polish mode`.

```bash
grep -n "critique_score" skills/design/modes/review.md
grep -n "audit_score" skills/design/modes/review.md
```

Expected: exactly 4 matches each (both appear together in Step 4.5's bullet list, Step 4.5's numbered Step 4 sub-item, and the JSON example line inside Step 4.5).

- [ ] **Step 5: Commit**

```bash
git add skills/design/modes/review.md
git commit -m "Capture Impeccable critique/audit scores and compute trend in design review mode"
```

---

### Task 2: Wire `score_trend` into the review summary

**Files:**
- Modify: `skills/review/review-summary-template.md:59-69` (the "Design Quality" section)
- Modify: `skills/review/SKILL.md:381-387` (Step 6.5's "Result handling" table)

**Interfaces:**
- Consumes: `score_trend` from Task 1's output contract (`skills/design/modes/review.md` Step 4.5 / "Output to caller"). Field names and shape must match exactly what Task 1 produces — do not invent alternate field names.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the trend line to the Design Quality section template**

In `skills/review/review-summary-template.md`, find this exact existing text (currently lines 59–69):

```markdown
### Design Quality (from /claude-tweaks:design review)

{Include when the design wrapper returned `result: advisory` with findings. Omit when the wrapper skipped (non-frontend, no Impeccable, kill-switch disabled).}

| File | Source | Severity | Category | Finding | Suggestion |
|------|--------|----------|----------|---------|------------|
| {file} | {critique/audit} | {info/warning/error} | {category} | {message} | {suggestion if present} |

> Findings are advisory — they inform the verdict but were not auto-applied. To action them inline, route through Step 3 Routing's resolution flow with category `Design Quality`. The Phase 1 design wrapper is read-only by design — code-modifying behavior ships in Phase 2's polish phase.

(or, when skipped: "Design Quality skipped — {skip reason from wrapper}.")
```

Replace it with:

```markdown
### Design Quality (from /claude-tweaks:design review)

{Include when the design wrapper returned `result: advisory` with findings. Omit when the wrapper skipped (non-frontend, no Impeccable, kill-switch disabled).}

{If the wrapper returned `score_trend`: render one line above the findings table — **Design Health:** {critique.current}/{critique.max} ({arrow}{delta} from {previous}/{max}, or "first captured score" when `previous` is null) · **Audit Health:** {audit.current}/{audit.max} ({same format}), where `{arrow}` is `↑` for a positive delta, `↓` for a negative delta (render the absolute value), or `→` for zero change. Omit either clause when that score type's key is absent from `score_trend`. Omit this line entirely when `score_trend` is absent from the wrapper's return.}

| File | Source | Severity | Category | Finding | Suggestion |
|------|--------|----------|----------|---------|------------|
| {file} | {critique/audit} | {info/warning/error} | {category} | {message} | {suggestion if present} |

> Findings are advisory — they inform the verdict but were not auto-applied. To action them inline, route through Step 3 Routing's resolution flow with category `Design Quality`. The Phase 1 design wrapper is read-only by design — code-modifying behavior ships in Phase 2's polish phase.

(or, when skipped: "Design Quality skipped — {skip reason from wrapper}.")
```

- [ ] **Step 2: Update Step 6.5's Result handling table**

In `skills/review/SKILL.md`, find this exact existing text (currently lines 381–387):

```markdown
**Result handling:**

| Wrapper return | Review behavior |
|----------------|-----------------|
| `{result: "advisory", findings: [...]}` | Include findings in the summary as a "Design Quality" section (see Step 7's template). Findings are advisory — they inform the verdict, but no auto-fixes. |
| `{skipped: ...}` | Omit the "Design Quality" section from the summary. Note the skip reason in the summary footer. |
| `{deferred: ...}` (should not happen for `review` mode) | Treat as skip and omit the section. |
```

Replace it with:

```markdown
**Result handling:**

| Wrapper return | Review behavior |
|----------------|-----------------|
| `{result: "advisory", findings: [...], score_trend?: {...}}` | Include findings in the summary as a "Design Quality" section (see Step 7's template). When `score_trend` is present, the section also renders a Design/Audit Health trend line above the findings table (current score vs. the last captured score, per `review-summary-template.md`). Findings are advisory — they inform the verdict, but no auto-fixes. |
| `{skipped: ...}` | Omit the "Design Quality" section from the summary. Note the skip reason in the summary footer. |
| `{deferred: ...}` (should not happen for `review` mode) | Treat as skip and omit the section. |
```

- [ ] **Step 3: Verify the edits landed correctly**

Run each separately:

```bash
grep -n "score_trend" skills/review/review-summary-template.md
```

Expected: exactly 1 matching line (the new paragraph is a single block of prose on one line in the source file).

```bash
grep -n "score_trend" skills/review/SKILL.md
```

Expected: exactly 1 matching line (both mentions — `score_trend?: {...}` and "When `score_trend` is present" — land on the same table-row line).

Run this pipe-count check on the modified table row (a stray unescaped `|` in the new prose would break the table):

```bash
grep "^| \`{result: \"advisory\"" skills/review/SKILL.md | grep -o '|' | wc -l
```

Expected: `3` (2 columns = 3 pipe characters: leading, one separator, trailing). A higher count means a literal `|` leaked into the new prose and needs escaping or rewording.

- [ ] **Step 4: Commit**

```bash
git add skills/review/review-summary-template.md skills/review/SKILL.md
git commit -m "Surface Impeccable score trend in the review summary's Design Quality section"
```

---

### Task 3: Protect the persistent score log from wrap-up cleanup, final verification

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md:36-46` (Section A, "Design wrapper caches")

**Interfaces:**
- Consumes: the file path `.claude-tweaks/design/score-history.jsonl`, established in Task 1 Step 2.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Add the protective note to Section A**

In `skills/wrap-up/cleanup-procedures.md`, find this exact existing text (currently lines 36–46):

```markdown
## A. Design wrapper caches (v4.5.0)

Delete the per-spec caches written by `/claude-tweaks:design` alongside the ledger:

- `docs/plans/YYYY-MM-DD-{feature}-audit.json` — written by `review` mode; consumed by `polish`. Stale after the spec ships.
- `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` — written by `survey` mode (via `/flow` pipeline summary). Used to detect declines on re-runs; obsolete once the spec is wrapped up.
- `docs/plans/YYYY-MM-DD-{feature}-declined.json` — written by `/flow` decline detection. Obsolete once the spec is wrapped up.

Resolve each path using the same date+feature prefix as the ledger filename. Glob `docs/plans/*-audit.json`, `*-recommendations.json`, and `*-declined.json` matching the spec slug as a fallback when the ledger filename is unavailable. Missing files are not errors — they mean the spec did not exercise the corresponding mode.

Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.
```

Replace it with:

```markdown
## A. Design wrapper caches (v4.5.0)

Delete the per-spec caches written by `/claude-tweaks:design` alongside the ledger:

- `docs/plans/YYYY-MM-DD-{feature}-audit.json` — written by `review` mode; consumed by `polish`. Stale after the spec ships.
- `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` — written by `survey` mode (via `/flow` pipeline summary). Used to detect declines on re-runs; obsolete once the spec is wrapped up.
- `docs/plans/YYYY-MM-DD-{feature}-declined.json` — written by `/flow` decline detection. Obsolete once the spec is wrapped up.

Resolve each path using the same date+feature prefix as the ledger filename. Glob `docs/plans/*-audit.json`, `*-recommendations.json`, and `*-declined.json` matching the spec slug as a fallback when the ledger filename is unavailable. Missing files are not errors — they mean the spec did not exercise the corresponding mode.

Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.

**Not included in this cleanup:** `.claude-tweaks/design/score-history.jsonl` — the persistent, cross-run design-score history log written by `/claude-tweaks:design review`'s score capture (`skills/design/modes/review.md` Step 4.5). Unlike the per-spec caches above, it is committed to git and accumulates across every spec's review run by design. Never delete, truncate, or reset it as part of wrap-up cleanup or any other skill's cleanup procedure — doing so destroys the trend this log exists to provide.
```

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "score-history.jsonl" skills/wrap-up/cleanup-procedures.md
```

Expected: exactly 1 match, inside the new "Not included in this cleanup" paragraph.

- [ ] **Step 3: Full-repo consistency check across all four modified files**

```bash
grep -rln "score_trend" skills/
```

Expected: exactly three files — `skills/design/modes/review.md`, `skills/review/review-summary-template.md`, and `skills/review/SKILL.md`. No other file in `skills/` should reference `score_trend`.

```bash
grep -rln "score-history.jsonl" skills/
```

Expected: exactly two files — `skills/design/modes/review.md` (Task 1) and `skills/wrap-up/cleanup-procedures.md` (this task). No other file should reference the history file path.

```bash
git status --short .gitignore
```

Expected: no output — `.gitignore` must be untouched by this plan.

- [ ] **Step 4: Run the existing test suite to confirm no unrelated breakage**

```bash
npm test 2>&1 | tail -15
```

Expected: `# fail 1` with the failure being `end-to-end: render under 500ms` in `tests/statusline.test.js` (a pre-existing, documented flake — see `specs/DEFERRED.md`, unrelated to this change) — or `# fail 0` if the flake doesn't reproduce this run. Any other failing test means something in this plan's edits broke — investigate before proceeding, since this plan should not touch any file `npm test` exercises.

- [ ] **Step 5: Commit**

```bash
git add skills/wrap-up/cleanup-procedures.md
git commit -m "Protect persistent design-score history from wrap-up cache cleanup"
```

---

## Self-Review Notes

- **Spec coverage:** Design doc's four "Changes" items map 1:1 — item 1 (`review.md` score parsing + Step 4.5 + output contract) → Task 1; item 2 (`review-summary-template.md` trend rendering) → Task 2 Step 1; item 3 (`SKILL.md` Step 6.5 brief mention) → Task 2 Step 2; item 4 (`cleanup-procedures.md` protective note) → Task 3. Design doc's "Testing" section (grep-verified field consistency, valid-JSON spot check, `.gitignore` untouched) → Task 3 Steps 2–3.
- **Placeholder scan:** No TBD/TODO; every step shows exact before/after text or an exact command with expected output. Template placeholders like `{critique.current}`, `{arrow}`, `{HH:MM:SS}`-style tokens inside the target files' own template prose are intentional — that's the existing notation style of `review-summary-template.md` and `review.md`'s own JSON examples (`<int>`, `"..."`), not incomplete-plan placeholders.
- **Type consistency:** N/A — no code, no function signatures across tasks. The cross-task interface is the field name `score_trend` (and its nested `critique`/`audit` sub-objects with `current`/`max`/`previous`/`delta` keys), used identically in Task 1 (produces) and Task 2 (consumes) — verified spelled identically in both tasks' exact text above, and grep counts in each task's verification step were checked against the actual drafted text before this plan was written, not estimated by hand.
