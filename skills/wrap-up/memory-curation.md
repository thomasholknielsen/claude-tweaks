# Memory Curation (D4) — judge file

Judge file for the `memory` registry row (`Memory`), loaded per that row when its gate opens. The gate, the scope, and the row's `SCANNED` line are **engine-owned** — see `curation-engine.md`; this file is judgment only. The row's disposition is `stage`: **every** finding it emits carries `"action": "staged"`.

Stage-and-surface procedure for every learning `_shared/learning-routing.md` resolves to **D4** — a
fact worth persisting to the user's cross-project memory directory.

## Step 1: Classify, dedup, stage

Classify every reflection insight and ledger learning not already routed by an earlier registry row through
`_shared/learning-routing.md`. For each that resolves to **D4**, dedup against `MEMORY.md` per the
contract, then stage — never write directly:

```
STAGED {time} — Memory row: memory file proposed "{name}" ({type}). Reversibility: high (stage path: staged/wrap-up-memory-{N}.md).
```

The stage file holds the complete proposed memory file **plus** its `MEMORY.md` index line, so the
Review Console (`review-console.md`'s Memory updates section, which runs in every mode) can show
exactly what would be written. A proposal missing the index line is incomplete: a memory file with
no index entry is never loaded, so staging one without the other stages something that would not
work.

Memory writes follow the tiered stance in `_shared/auto-mode-card.md` / `_shared/auto-mode-contract.md` — a
memory file is cross-project and always-loaded, so a wrong one silently degrades every future
session in every project the user works in, the largest blast radius of any routing destination.
At `supervised`/`trusted`, this row (`M#`) is covered by the Review Console's batch "Approve all".
At `unattended`, it auto-resolves with zero `AskUserQuestion` calls under `consoleAutoResolve`.
Per-item chunking (inspect each proposed file before approving) survives only inside the Override drill.

**A different table's approval never satisfies this gate.** Reflect's insights batch table
(`reflect/full-mode.md`) resolving an insight to D4 — even under "Apply all" — approves *routing*
it here, not writing it. The Skill Updates batch, the cleanup+configuration batch, and any other
`AskUserQuestion` in this run are likewise not this gate. The memory file is written only after this row's own batch decision (or auto-resolution) —
at `supervised`/`trusted`, the console's "Approve all" (or its own dedicated `M#` `AskUserQuestion`
at Override); at `unattended`, `consoleAutoResolve`. Writing a memory file before that batch
decision (or auto-resolution), or in response to a different table's approval, is the exact
contract violation this section exists to prevent.

## Step 2: No memory directory available

D4 is unavailable when the invoking assistant's system prompt states no memory directory for this
project — but the lesson is **never dropped for that reason alone**. Re-run the classifier from
rule 4 *here* and act on the result in this step:

| Re-classified outcome | Where it goes |
|---|---|
| D1 / D2 | Stages as a configuration or skill update, alongside the CLAUDE.md & rules and Skills rows' own output |
| D3 | Becomes a queue-write proposal, staged the way `_shared/ledger-format.md`'s Resolve Gate Phase 3 stages `Keep`/`Defer`, for the Review Console to create on approval |
