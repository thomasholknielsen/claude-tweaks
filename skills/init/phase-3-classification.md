# Phase 3: Project Classification Gate

Loaded by `/init` Phase 3 after presenting the Stack Profile (Initial Mode) or Drift Report (Update Mode). Contains the unified Project Classification gate, confidence-gated auto-confirm logic, and the interactive confirmation template.

## Determine doc tier

Use the heuristics from `docs-structure.md` in this skill's directory, combining Phase 2 reconnaissance findings with the detected maturity.

## Compute detection confidence

For each dimension (maturity, doc-tier), rate the signal strength:

| Confidence | Criteria |
|-----------|----------|
| `high` | ≥3 strong consistent signals |
| `med` | 1-2 consistent signals, no contradictions |
| `low` | contradictory or sparse signals |

## Auto mode (confidence-gated)

When `auto` mode is set AND both dimensions classify with confidence `high` AND signals are internally consistent:

1. Auto-confirm the detected classification
2. Log to the active pipeline's `decisions.md` **only when one exists**:
   ```
   AUTO {time} — Phase 3: classification auto-confirmed. Maturity: {value} (confidence: high). Doc tier: {value} (confidence: high). Proceed to Phase 4.
   ```
   `/init` is the project bootstrap and typically runs without an upstream `/flow`. If `PIPELINE_RUN_DIR` is unset and no recent run matches, suppress the log entry (the decision is still made, just not externally journaled) — `/init` does not bootstrap a run directory of its own. The one-line summary in step 3 below stands in for the audit trail.
3. Print a one-line summary (not a prompt): "Classified as {maturity}, doc tier {N}. Proceeding."
4. Skip to Phase 4

Auto-confirm is **forbidden** when either dimension is `med` or `low` confidence, OR when signals contradict (e.g., greenfield code + production-grade infra). In those cases, fall through to the confirmation gate (KEPT-PROMPT).

## Confirmation gate (interactive mode OR auto with low confidence)

**Present for confirmation:**

```
### Project Classification

Based on codebase analysis:

| Dimension | Detected | Confidence | Rationale |
|-----------|----------|-----------|-----------|
| Maturity | {greenfield/pre-launch/early-production/established} | {high/med/low} | {key signals: age, infra, users, migrations} |
| Doc tier | {1/2/3} | {high/med/low} | {key signals: project size, API surfaces, team size} |

### Philosophy (derived from maturity)
- Change philosophy: {e.g., "Move fast, refactor freely" / "Expand-contract, safe migrations"}
- Schema management: {e.g., "Push directly" / "Migrations with rollback plans"}
- Backward compatibility: {e.g., "Not required" / "Required for published interfaces"}
- Dependencies: {e.g., "Latest versions, update aggressively" / "Pin versions, upgrade deliberately"}

### Doc Structure (derived from tier)
- {list of docs that will be proposed in Phase 8.5, based on tier + what exists}

1. Confirm **(Recommended)**
2. Override maturity (changes philosophy)
3. Override doc tier (changes structure)
4. Override both
```

Wait for confirmation. The user may know things the code doesn't reveal (e.g., "this is 6 months old but we haven't launched yet — treat it as pre-launch"). Carry the confirmed maturity and doc tier forward to Phase 5 (CLAUDE.md Philosophy) and Phase 8.5 (Doc Registry).
