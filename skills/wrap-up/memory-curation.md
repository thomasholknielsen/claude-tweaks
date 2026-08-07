# Memory Curation (D4) — /wrap-up Step 7.10

Stage-and-surface procedure for every learning `_shared/learning-routing.md` resolves to **D4** — a
fact worth persisting to the user's cross-project memory directory.

## Step 1: Classify, dedup, stage

Classify every reflection insight and ledger learning not already routed by Steps 6–7.9 through
`_shared/learning-routing.md`. For each that resolves to **D4**, dedup against `MEMORY.md` per the
contract, then stage — never write directly:

```
STAGED {time} — Step 7.10: memory file proposed "{name}" ({type}). Reversibility: high (stage path: staged/wrap-up-memory-{N}.md).
```

The stage file holds the complete proposed memory file **plus** its `MEMORY.md` index line, so the
Review Console (or, in interactive mode, `summary-template.md`'s Memory updates section) can show
exactly what would be written. A proposal missing the index line is incomplete: a memory file with
no index entry is never loaded, so staging one without the other stages something that would not
work.

Memory writes are never auto-resolved regardless of mode. `_shared/auto-mode-contract.md` lists
them among what `auto` does not silence — a memory file is cross-project and always-loaded, so a
wrong one silently degrades every future session in every project the user works in, the largest
blast radius of any routing destination. It is **not** exempt under `unattended-tier`.

## Step 2: Standalone wrap-up has no console to stage for

When no run directory resolves, no Review Console will ever read a staged file here — the same
reasoning `ledger/resolve-gate.md` applies to a standalone ledger item. Skip the `STAGED` line and
the `staged/` file entirely; present the proposal directly in `summary-template.md`'s Memory
updates section and write the memory file on approval there instead.

## Step 3: No memory directory available

D4 is unavailable when the invoking assistant's system prompt states no memory directory for this
project — but the lesson is **never dropped for that reason alone**. Re-run the classifier from
rule 4 *here* and act on the result in this step:

| Re-classified outcome | Where it goes |
|---|---|
| D1 / D2 | Stages as a configuration or skill update, alongside Steps 6/7's own output |
| D3 | Becomes a queue-write proposal, staged the way `ledger/resolve-gate.md` Phase 3 stages `Keep`/`Defer`, for the Review Console to create on approval |

## Mandatory summary

Emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.10 memory curation: {N} insights classified, {M} resolved D4, {K} deduped against MEMORY.md. Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag; interactive mode prints it
inline.
