# Design Mode — review

Invoked via `/claude-tweaks:design-wrapper review <spec>`. Returns `{mode, result: "advisory", files_scanned, findings, score_trend}` or `{mode, skipped, ...}` to caller. Also writes an audit cache that `polish` mode consumes, and appends to a persistent design-score history log.

## When this runs

Called by `/claude-tweaks:review` during code review. Runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit` on changed UI files. Findings appear in the review summary as advisory (never auto-applied).

## Preconditions

Run the universal preconditions from `../SKILL.md` (Layers 1+2+3 and availability for the Impeccable plugin — verified by `/impeccable:impeccable*` skill resolution).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object.

### Step 2: Resolve changed UI files

If `<spec>` was passed and the spec lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths (Layer 3 rules).

If zero files remain after filtering, return `{skipped: "no UI files changed"}`.

### Step 3: Invoke Impeccable LLM commands

Invoke via the Skill tool:

- `/impeccable:impeccable critique <files>` — qualitative critique
- `/impeccable:impeccable audit <files>` — heuristic audit pass

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

### Step 5: Write audit findings cache for polish mode

Persist the **audit findings only** (not critique) to a JSON file alongside the ledger:

- **Primary path:** `docs/plans/YYYY-MM-DD-{feature}-audit.json` (matches the ledger filename `docs/plans/YYYY-MM-DD-{feature}-ledger.md`).
- **Fallback (review invoked outside a flow context):** derive from the spec slug — `docs/plans/audit-{spec-slug}.json`.

Cache shape:

```json
{
  "spec": "<spec id or path>",
  "written_at": "<ISO timestamp>",
  "findings": [ { "source": "audit", "file": "...", "category": "...", "severity": "...", "message": "...", "suggestion": "..." }, ... ]
}
```

Cache entries are stale after one flow run; they get overwritten on the next `review` invocation for the same spec. Cleanup is handled by `/claude-tweaks:wrap-up` Step 5 alongside the ledger.

If the cache write fails (disk full, permission denied), surface the failure as a one-time skip and continue — `polish` mode degrades to auto-fit-only when the cache is absent.

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
