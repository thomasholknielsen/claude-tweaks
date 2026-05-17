# Design Mode — review

Invoked via `/claude-tweaks:design review <spec>`. Returns `{mode, result: "advisory", files_scanned, findings}` or `{mode, skipped, ...}` to caller. Also writes an audit cache that `polish` mode consumes.

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

Cache entries are stale after one flow run; they get overwritten on the next `review` invocation for the same spec. Cleanup is handled by `/wrap-up` Step 5 alongside the ledger.

If the cache write fails (disk full, permission denied), surface the failure as a one-time skip and continue — `polish` mode degrades to auto-fit-only when the cache is absent.

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
