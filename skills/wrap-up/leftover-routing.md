# Step 4 — Analyze Leftover Work

Spec-based only. Same fix-exhaust-first discipline as the resolve gate (Step 8.5): attempt to complete unfinished spec sections in this pipeline before proposing routing. Only sections that genuinely cannot be completed in the current work context get presented for routing.

## Fix-exhaust first

A section qualifies for "finish now" if **all** of these hold:
- Localized changes (typically ≤5 files)
- No dependency on functionality not yet built in this pipeline
- No required user product/design decisions
- No required external state

Finish qualifying sections silently, commit, then present only the residue.

## Auto mode (policy lookup)

When the pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `leftover-default` from `config.yml`. Per the Manifesto default (`defer`), each residue section:

1. **Auto-stage** a routing proposal to `staged/wrap-up-leftover-{N}.md` describing the section, the recommended destination (per policy), and the trigger context
2. **Log entry** to `decisions.md`:
   ```
   STAGED 15:02:18 — Step 4: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {destination}. Stage path: staged/wrap-up-leftover-{N}.md.
   ```
3. Do NOT write to `specs/backlog/` autonomously — those writes happen at the Wrap-Up Review Console (Step 8.6) after explicit user approval

The Review Console surfaces each staged leftover as a row in the "Pending review" table. User approval there triggers the actual file writes.

## Interactive mode (per-item user input)

For each unfinished section that genuinely cannot be finished, present a numbered table and **wait for explicit per-item user input**:

```
| # | Section | Status | Why not finish now | Choices |
|---|---------|--------|--------------------|---------| 
| 1 | {section} | partial | {specific blocker} | 1: merge to spec X / 2: parked (specs/backlog/) / 3: inbox (specs/backlog/) / 4: drop / 5: finish now |
```

### Routing options

1. **Merge into an existing spec** — work fits naturally into another spec's scope
2. **Create a `specs/backlog/{slug}.md` entry with `**Stage:** parked`** — work needs its own context (include origin spec, files, trigger)
3. **Create a `specs/backlog/{slug}.md` entry with `**Stage:** inbox`** — genuinely new idea discovered during implementation, not part of this spec's planned scope
4. **Drop entirely** — no longer relevant
5. **Finish now** — agent attempts completion in this pipeline (returns to fix-exhaust)

Wait for per-item response. Do not bulk-route. Both `**Stage:** parked` and `**Stage:** inbox` are valid destinations within `specs/backlog/` and the user picks per item — but no entry is written without explicit per-item confirmation. Rough guidance: `**Stage:** parked` fits sections with a clear trigger; `**Stage:** inbox` fits captured ideas without a specific trigger yet.
