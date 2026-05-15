# Step 4 — Analyze Leftover Work

Spec-based only. Same fix-exhaust-first discipline as the resolve gate (Step 9.5): attempt to complete unfinished spec sections in this pipeline before proposing routing. Only sections that genuinely cannot be completed in the current work context get presented for routing.

## Fix-exhaust first

A section qualifies for "finish now" if **all** of these hold:
- Localized changes (typically ≤5 files)
- No dependency on functionality not yet built in this pipeline
- No required user product/design decisions
- No required external state

Finish qualifying sections silently, commit, then present only the residue.

## Auto mode (policy lookup)

When the pipeline run directory exists (`PIPELINE_RUN_DIR` env var or matching dir in `.claude-tweaks/pipelines/`), read `leftover-default` from `config.yml`. Per the Manifesto default (`defer`), each residue section:

1. **Auto-stage** a routing proposal to `staged/wrap-up-leftover-{N}.md` describing the section, the recommended destination (per policy), and the trigger context
2. **Log entry** to `decisions.md`:
   ```
   STAGED 15:02:18 — Step 4: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {destination}. Stage path: staged/wrap-up-leftover-{N}.md.
   ```
3. Do NOT write to `specs/DEFERRED.md` or `specs/INBOX.md` autonomously — those writes happen at the Wrap-Up Review Console (Step 9.6) after explicit user approval

The Review Console surfaces each staged leftover as a row in the "Pending review" table. User approval there triggers the actual file writes.

## Interactive mode (per-item user input)

For each unfinished section that genuinely cannot be finished, present a numbered table and **wait for explicit per-item user input**:

```
| # | Section | Status | Why not finish now | Choices |
|---|---------|--------|--------------------|---------| 
| 1 | {section} | partial | {specific blocker} | 1: merge to spec X / 2: DEFERRED.md / 3: INBOX / 4: drop / 5: finish now |
```

### Routing options

1. **Merge into an existing spec** — work fits naturally into another spec's scope
2. **Add to `specs/DEFERRED.md`** — work needs its own context (include origin spec, files, trigger)
3. **Create a new INBOX item** — genuinely new idea discovered during implementation, not part of this spec's planned scope
4. **Drop entirely** — no longer relevant
5. **Finish now** — agent attempts completion in this pipeline (returns to fix-exhaust)

Wait for per-item response. Do not bulk-route. Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid destinations and the user picks per item — but no entry is written to either file without explicit per-item confirmation. Rough guidance: DEFERRED.md fits sections with a clear trigger; INBOX.md fits captured ideas without a specific trigger yet.
