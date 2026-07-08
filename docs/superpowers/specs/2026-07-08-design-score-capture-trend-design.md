# Impeccable Score Capture + Trend — Design

**Status:** Approved
**Author:** Claude (session-driven design), approved by Thomas Holk Nielsen

## Problem

`skills/design/modes/review.md` (invoked by `/claude-tweaks:review` Step 6.5) already runs `/impeccable:impeccable critique <files>` and `/impeccable:impeccable audit <files>` on every review with changed UI files. Both commands produce a numeric health score as part of their structured markdown report:

- **Critique** → **Design Health Score**, `??/40` (Nielsen's 10 heuristics × 4 points each), with a rating band (Excellent/Good/Acceptable/Poor/Critical).
- **Audit** → **Audit Health Score**, `??/20` (5 technical dimensions: Accessibility, Performance, Theming, Responsive Design, Anti-Patterns), with its own rating band.

Both commands' own prompts end with an explicit invitation: *"Re-run `/impeccable {critique|audit}` after fixes to see your score improve."* Nothing on our side answers that invitation. `review.md` Step 4 ("Normalize findings") parses the findings list out of each report but discards the Total score entirely — it is read once and thrown away. There is no persisted history, so no trend is possible, and the score never appears anywhere the user looks (the review summary's "Design Quality" section shows findings only).

## Goal

Capture both scores on every `/design review` invocation, persist them across runs, and surface a trend (current score vs. the last captured score, with delta) in the same review summary section the user already reads. No new command surface, no new interactive decision point.

## Non-Goals

- No dedicated on-demand trend view/report (e.g., a `/design trend` mode). If this capture proves valuable and the log grows, a dedicated view is a natural follow-up, but is out of scope here — YAGNI until the log itself has enough history to be worth a dedicated report.
- No moving averages, charts, or multi-point trend analysis. Only "current vs. immediately-previous captured value" per score type.
- No change to `/design test` mode or `impeccable-cli.md` — those cover the deterministic CLI (`npx impeccable detect`), which has no health score concept. This design is scoped entirely to `review` mode's two LLM commands.
- No `decisions.md` / auto-mode-contract.md changes. Score capture is passive instrumentation, not a decision `auto` mode would ever need to silence or log — it has no interactive equivalent to preserve and nothing is being resolved on the user's behalf.

## Changes

### 1. `skills/design/modes/review.md` — Step 4 (extend) + new Step 4.5 + Output contract

**Step 4 (Normalize findings), extended:** After the existing findings-normalization work, also look for each command's Total row in its raw report text:

- Critique: `| **Total** | | **??/40** | **[Rating band]** |` — extract the numeric fraction from the `??/40` cell via a defensive regex (e.g. matching `(\d+)\s*/\s*40`).
- Audit: `| **Total** | | **??/20** | **[Rating band]** |` — same approach against `/20`.

If a command's output has no matching Total row (malformed report, drifted format, missing table), treat that score as **absent** for this run — this does not affect findings normalization, which proceeds independently. This mirrors the existing defensive-parsing stance in `impeccable-cli.md` ("Unknown/missing fields → ignore, do not fail").

**New Step 4.5 (Capture score + compute trend), inserted after Step 4 and before Step 5 (write audit findings cache):**

1. Resolve the history file path: `.claude-tweaks/design/score-history.jsonl` (relative to project root). Create the `.claude-tweaks/design/` directory if absent.
2. Before appending anything, read the existing file (if present) to find:
   - The most recent line containing a `critique_score` field → becomes `score_trend.critique.previous`.
   - Independently, the most recent line containing an `audit_score` field → becomes `score_trend.audit.previous`.
   (Each score type tracks its own most-recent value independently, since either can be absent on any given prior run — the last audit-bearing line is not necessarily the last critique-bearing line.)
3. Compute `delta = current - previous` per score type where both current and a previous value exist. If no prior line carries that score type's field, `previous` and `delta` are `null` and the trend is reported as "first captured score."
4. Append one new line to the history file:
   ```json
   {"timestamp": "<ISO 8601 timestamp>", "spec": "<spec id or path, same value used by Step 5's audit cache>", "critique_score": 32, "critique_max": 40, "audit_score": 16, "audit_max": 20, "files_scanned": 3}
   ```
   Omit `critique_score`/`critique_max` (or `audit_score`/`audit_max`) entirely from the line — not `null` — when that score wasn't parseable this run. A partial capture (one score present, one absent) still writes a partial line rather than being dropped.
5. If the write fails (disk full, permission denied), surface as a one-time skip and continue — exactly the same recovery rule Step 5 already uses for the audit findings cache. A history-write failure never blocks the review gate; scores are informational only.

**Output to caller, extended:** Add a `score_trend` field to the existing output JSON:

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": 3,
  "findings": [ ... ],
  "score_trend": {
    "critique": { "current": 32, "max": 40, "previous": 28, "delta": 4 },
    "audit": { "current": 16, "max": 20, "previous": null, "delta": null }
  }
}
```

A score type's key (`critique` or `audit`) is omitted entirely from `score_trend` if that command's Total row didn't parse this run. If **neither** score parsed, omit `score_trend` entirely (matches the existing pattern of omitting empty/inapplicable fields elsewhere in this wrapper's contract).

### 2. `skills/review/review-summary-template.md` — "Design Quality" section

Add a trend line immediately above the findings table, populated from `score_trend` when present:

```markdown
### Design Quality (from /claude-tweaks:design review)

{Include when the design wrapper returned `result: advisory` with findings. Omit when the wrapper skipped (non-frontend, no Impeccable, kill-switch disabled).}

{If `score_trend` present: **Design Health:** {critique.current}/{critique.max} ({↑/↓}{delta} from {previous}/{max}, or "first captured score" if previous is null) · **Audit Health:** {audit.current}/{audit.max} ({same format}). Omit either clause if that score type is absent from `score_trend`. Omit the whole line if `score_trend` is absent.}

| File | Source | Severity | Category | Finding | Suggestion |
|------|--------|----------|----------|---------|------------|
| {file} | {critique/audit} | {info/warning/error} | {category} | {message} | {suggestion if present} |
```

Example rendering: `**Design Health:** 32/40 (↑4 from 28/40) · **Audit Health:** 16/20 (first captured score)`

### 3. `skills/review/SKILL.md` — Step 6.5 (brief mention)

Add one sentence noting the wrapper's output now includes `score_trend` when parseable, and that the review summary's Design Quality section renders it per `review-summary-template.md`. This keeps Step 6.5's description of the wrapper's output contract accurate without restating the full mechanism (which lives in `review.md`).

### 4. `skills/wrap-up/cleanup-procedures.md` — clarify what is NOT cleaned up

Add one clarifying line distinguishing the two design-wrapper artifacts that now exist:

- The **ephemeral audit findings cache** (`docs/plans/YYYY-MM-DD-{feature}-audit.json`) — per-spec, stale after one flow run, cleaned up by wrap-up alongside the ledger (existing behavior, unchanged).
- The **persistent score history** (`.claude-tweaks/design/score-history.jsonl`) — cross-run, append-only, committed to git, and must **never** be cleaned up or reset by wrap-up or any other skill. Deleting or truncating it destroys the trend this feature exists to provide.

This guards against a documented recurring failure mode in this repo: a cleanup procedure or blanket ignore rule silently eating committed state that lives alongside ephemeral run artifacts (see CLAUDE.md's "routines/{name}.yml" incident).

## Data Flow

```
/claude-tweaks:review Step 6.5
  → /claude-tweaks:design review <spec>
    → review.md Step 3: invoke /impeccable:impeccable critique + audit
    → review.md Step 4: parse findings (existing) + parse Total scores (new)
    → review.md Step 4.5 (new): read prior scores → compute delta → append history line
    → review.md Step 5: write audit findings cache (existing, unchanged)
    → return { ..., score_trend } to /review
  → review-summary-template.md "Design Quality" section renders score_trend as a trend line
```

## Error Handling

Every failure mode in this design degrades gracefully and never blocks the review gate — consistent with this wrapper's existing advisory-only philosophy:

| Failure | Behavior |
|---|---|
| Critique or audit report has no parseable Total row | That score type is absent from `score_trend` this run; findings normalization is unaffected |
| Both reports unparseable | `score_trend` omitted entirely; findings-only output, same as today |
| History file write fails (disk full, permission denied) | One-time skip, review proceeds; no `score_trend` for this run beyond what could be computed before the failed write |
| History file missing or empty (first-ever run) | Both score types report `previous: null`, `delta: null` — "first captured score" |
| History file contains malformed JSON lines | Skip malformed lines when scanning for the most recent prior value per score type; do not fail the whole read |

## Testing

Same nature as the two prior threads in this series (animate-frequency-gate, design-decisions-log-compliance): this is prose skill-markdown content, not executable code. Verification is manual consistency checking during implementation:

- Grep-verified: the new `score_trend` field name and shape are identical across `review.md`'s Step 4.5 and Output-to-caller sections, `review-summary-template.md`'s rendering rule, and `skills/review/SKILL.md`'s Step 6.5 mention.
- Every JSON example in the modified files is valid JSON (spot-checked by eye — no JSON schema validator in this repo's toolchain for skill-content examples).
- `.gitignore` is NOT modified — `.claude-tweaks/design/` is not currently ignored by any existing rule (verified: only `.claude-tweaks/pipelines/`, `.claude-tweaks/research/`, `.claude-tweaks/recon/`, and `.claude-tweaks/routine-environment-cache.yml` are ignored today), so no new ignore rule is needed and none should be added.
- No new Node test files — nothing here is executable Node/JS logic.

## Open Items

None — both design forks (surfacing approach, git-tracked vs. gitignored history) were resolved during brainstorming. No unresolved questions carried into the implementation plan.
