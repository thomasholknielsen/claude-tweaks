# Design Mode — shape

Invoked via `/claude-tweaks:design-wrapper shape <topic>`. Returns `{mode, result: "ok", output}` or `{mode, skipped, ...}` to caller.

## When this runs

Called by `/claude-tweaks:specify` as a pre-decomposition step on frontend design docs. The output is appended verbatim to the design doc before decomposition into specs.

## Preconditions

Run the universal preconditions from `../SKILL.md`, **skipping Layer 2** — no spec exists yet (the caller is `/specify` working from a design doc, not a numbered spec).

- **Layer 1 (kill-switch)** still applies.
- **Layer 3 sniff** is optional — `/specify` already determined frontend before invoking; the wrapper trusts that determination here.
- **Availability check** still applies — `/impeccable:impeccable*` skill must resolve.

## Procedure

### Step 1: Run preconditions (Layer 1 + availability)

On any skip, return the skip object — the caller continues without the shape pre-step.

### Step 2: Invoke shape command

Invoke via the Skill tool:

```
/impeccable:impeccable shape <topic>
```

### Step 3: Capture output verbatim

Do not parse — the caller (`/specify`) will append the full output text to the design doc.

## Output to caller

```json
{
  "mode": "shape",
  "result": "ok",
  "output": "<full text from /impeccable:impeccable shape>"
}
```

Shape mode is read-only with respect to source code (it produces planning text, not code changes).
