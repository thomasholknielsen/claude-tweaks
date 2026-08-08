# Curation Engine — the Phase 2 mechanism

Loaded by `/claude-tweaks:wrap-up` Phase 2 (ROUTE). Owns the plan/record/render invocation sequence, the judgment-payload contract, the parallel-dispatch rule, the vocabulary rule, and the prose fallback. Together with SKILL.md's registry table, this file is the **only** prose copy of the mechanism — a judge file never restates a gate, a scope cap, or a `SCANNED` format, and nothing here re-states a judgment criterion that belongs to a judge.

## 1. What the engine owns vs. what the model owns

| Owned by the engine (`bin/wrap-up-engine.js` + `bin/lib/wrap-up/`) | Owned by the model |
|---|---|
| Gate evaluation — which registry rows are open, and the plain-language reason each is open or closed | Reading the candidate files the worklist row points at |
| Scope selection — the cap, the fast-lane narrowing, the `--skill-budget` / `--doc-budget` override, the journey frontmatter overlap, the renamed/deleted target set | Judging those candidates against the row's judge file |
| Row ordering — registry order, always all eight rows, always in the same sequence | Deciding, per finding, whether it is applied or staged (within the precondition in section 3) |
| The `SCANNED` audit line for every row, open and closed alike | Applying an approved edit and committing it |
| Outcome telemetry (`.claude-tweaks/wrap-up-outcomes.tsv`) | Emitting exactly one `record` payload per open row |
| The Phase 2 phase-trace table and the Review Console's engine-fed sections | Nothing about formatting — the model never composes a trace row or a `SCANNED` line by hand |

A closed row needs no model involvement at all: `plan` pre-resolves it to `n/a`, writes its `SCANNED` line, and its telemetry entry, before the model reads anything. The model records **only** open rows.

## 2. Invocation sequence

**Step 1 — `plan`, once, at Phase 2 entry.** Signals come from Phase 1's reflection and ledger outputs; no program can compute them, so the model supplies them.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" plan \
  --run-dir "$PIPELINE_RUN_DIR" \
  --base "$BASE_SHA" \
  --ceremony "$CEREMONY_PROFILE" \
  --signals '{"dontCandidate":false,"contradictedConvention":false,"incidentRecorded":false,"adrCandidateCount":0,"d4Count":0,"d5Count":0}'
```

`--run-dir` and `--base` are required; `--ceremony` defaults to `standard` (`fast-lane` narrows the domain-overlap caps). `--skill-budget n` and `--doc-budget n` override those caps outright. `--dry-run` suppresses the telemetry append. `plan` prints the worklist JSON on stdout and writes `engine-state.json` into the run dir.

Signal keys, all optional (absent reads as zero/false):

| Key | Type | Meaning |
|---|---|---|
| `dontCandidate` | boolean | Reflection or the ledger produced a don't-repeat candidate |
| `contradictedConvention` | boolean | This work's diff contradicts a convention CLAUDE.md asserts |
| `incidentRecorded` | boolean | An incident account was recorded for this work |
| `adrCandidateCount` | number | Decision candidates gathered for the ADR gate |
| `d4Count` | number | Learnings `_shared/learning-routing.md` resolved to D4 |
| `d5Count` | number | Learnings it resolved to D5 |

**Step 2 — per OPEN row, in worklist order.** For each row where `gate` is `open`: read the row's `judge` file from this skill's directory, apply it to the row's `scope`, then pipe exactly one payload JSON into `record`.

```bash
printf '%s' "$PAYLOAD" | node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" record --run-dir "$PIPELINE_RUN_DIR"
```

`record` reads one payload JSON from stdin, validates it, appends the row's `SCANNED` line to `decisions.md` and one telemetry line, updates `engine-state.json`, and echoes the `SCANNED` line it wrote. `--dry-run` suppresses the telemetry append only. A row may be recorded once; a second payload for the same `rowId` is rejected.

**Ordering is not advisory.** `Memory` and `Upstream feedback` are judged **last**, after every earlier row has been recorded — including `Broken references`, which sits before them in registry order. Their input is the set of learnings *no earlier row claimed*, so judging them early routes a learning to memory that CLAUDE.md, a decision record, or a skill update was about to absorb.

**Step 3 — `render`, once, at the end.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-engine.js" render --run-dir "$PIPELINE_RUN_DIR" --section trace --strict
```

`--section` is `trace` (the Phase 2 table, default) or `console` (the Review Console's engine-fed sections); `--start-at n` seeds the console's global row numbering. `--strict` prints the table **first**, then exits 2 if any worklist row has no recorded result — the hole is visible *and* fatal. Insert the output verbatim; never compose it by hand.

**Exit codes.** `0` success. `1` the invocation was fine but the payload was not — a `record` payload that fails validation or does not parse, with the reason on stderr; fix the payload and re-pipe it, do not re-read usage. `2` a malformed invocation — missing or unknown flags, an unknown verb, unparseable `--signals`, or a run dir with no `engine-state.json` (meaning `plan` never ran) — plus the one deliberate exception above, `render --strict` with missing rows.

## 3. The payload contract

One payload per open row, on stdin:

```json
{
  "version": 1,
  "rowId": "skills",
  "result": "findings",
  "read": [
    { "path": "skills/upstream-drift/SKILL.md", "mode": "full" },
    { "path": "skills/browse/SKILL.md", "mode": "bounded" }
  ],
  "findings": [
    {
      "kind": "patch",
      "summary": "Record the fetch-first rule in the Gotchas table",
      "targetPath": "skills/upstream-drift/SKILL.md",
      "action": "applied",
      "stagePath": null,
      "commit": "a1b2c3d"
    }
  ],
  "gapDetection": "run",
  "detail": "Read 2: upstream-drift, browse"
}
```

| Field | Required | Contract |
|---|---|---|
| `version` | yes | Always `1`. The engine stores named fields into a fresh object and never spreads the payload `[IL-01]`, so an unknown key is dropped, not honored. |
| `rowId` | yes | Non-empty string matching an **open**, not-yet-recorded worklist row. |
| `result` | yes | `clean` or `findings`. Nothing else validates. `n/a` is the engine's word for a closed row and is never sent by a judge. |
| `read` | no | Array of `{ path, mode }`, `mode` being `full` or `bounded`. Omitted reads as `[]` and renders as `read 0 (none)`. Send it even when the row found nothing — it is the evidence that the row was actually looked at. |
| `findings` | when `result` is `findings` | Non-empty array. Every entry is validated: `action` is `applied` or `staged`, `kind` is a non-empty string, `summary` is a non-empty string. |
| `findings[].targetPath` | in practice | The file the finding is about. Not validated, but rendered into the console table — omit it and the cell prints `undefined`. |
| `findings[].stagePath` | staged findings | Path of the `staged/` file holding the proposal. Same rendering caveat. |
| `findings[].commit` | applied findings | Short hash of the finding's own commit. Same rendering caveat. |
| `gapDetection` | yes | `run` or `not-run` — did this row run its missing-artifact detection, as opposed to only judging what already exists. |
| `detail` | no | One short reader-facing phrase for the trace's Detail column. Subject to section 5. |

**The `applied` precondition.** A finding may carry `"action": "applied"` only when **all** of these hold:

1. The row's `disposition` is `apply-or-stage` (`Skills`, `Docs`, `Journeys`, `Broken references`).
2. The finding is **additive** — new examples, new anti-patterns, a new section appended. Anything **restructural** — changing existing wording, moving content, renaming sections, splitting or merging files — stages.
3. `reversibility: high`.
4. `confidence: high`.

Fail any one and the finding stages. An applied finding is committed on its own, which is what the `SCANNED` line's `Reversibility: high (separate commit)` asserts; its hash goes in `commit`.

**These four are necessary, not sufficient.** A judge file may impose stricter conditions of its own, and clearing this precondition never overrides them — the standing example is `reference-sweep.md`, whose repairs additionally bind to the `autonomy` ceiling and the `_shared/initiative-budget.md` floor rule. When a judge's own conditions and this precondition disagree, the finding stages.

**Stage-only and stage rows.** `CLAUDE.md & rules` (`stage-only`), `Decision records`, `Memory`, and `Upstream feedback` (`stage`) emit **every** finding with `"action": "staged"`. The engine does not enforce this — it will record an `applied` finding on any row — so the constraint is the judge's to honor, and each of those judge files restates it in its own header.

**The `SCANNED` line.** The engine writes it, one per row, to `decisions.md`. Reproduced here only so the prose fallback (section 6) can write it by hand:

```
SCANNED {ISO-time} — {target}: gate {open|closed} ({gateReason}); read {N} ({paths or 'none'}); gap detection: {run|not run}. Result: {clean | n/a | {A} applied, {S} staged}. Reversibility: {high (separate commit)|N/A}.
```

## 4. Parallel dispatch

> **Parallel execution (conditional):** When the worklist has 3+ open fact-gated rows, dispatch each row's judgment as a parallel Task agent per skills/_shared/subagent-output-contract.md — the dispatch prompt inlines the row's worklist entry, the judge file's full text, and the literal payload JSON template; the agent returns the payload as its Template output. Signal-gated rows (Memory, Upstream feedback) always run after the fan-out completes, in the main thread. Otherwise run sequentially in the main thread.

The `record` calls stay in the main thread regardless — agents return payloads, they do not pipe them. That keeps the ordering rule in section 2 intact and keeps one writer on `engine-state.json`.

## 5. Vocabulary rule

Internal identifiers never reach rendered output. The routing codes `D0`–`D5`, the scan-mechanism names (`domain-overlap`, `gap detection`), the retired `Step 7.x` numbers, and `[route: …]` tags are engine and classifier vocabulary — a reader of the report has no way to resolve them. `renderTrace` and `renderConsoleSections` post-check their own output against exactly that list and **throw** on a match, so a payload that smuggles one into `summary`, `detail`, or `targetPath` fails the render rather than shipping jargon.

Write those fields as a reader would say them: the target's name, what changes, why. Full detail — the routing code, the scan scope, the candidates considered and rejected, the reason a gate opened — goes to `decisions.md`, which is the audit trail and is deliberately exempt from the guard (its own `SCANNED` format contains `gap detection:` by design).

## 6. Prose fallback

**When the engine fails for any reason, execute this same mechanism manually.** This is unconditional and takes no diagnosis `[IL-14]`: enumerate the failure modes and the enumeration will be missing one.

1. Walk SKILL.md's registry table top to bottom, in the order printed there.
2. Evaluate each row's gate by the condition stated in that table. A closed row resolves to `n/a` with the stated reason.
3. For each open row, apply its judge file to its scope — using the table's own cap where one is stated, narrowed under `fast-lane`.
4. Write the row's `SCANNED` line by hand in the section 3 format, into `decisions.md`.
5. Compose the phase-trace row by hand: `| {target} | {n/a | Clean | {n} applied | {n} staged | {a} applied, {s} staged} | {detail} |`.
6. Honor sections 3 and 5 unchanged — the `applied` precondition, the stage-only rows, and the vocabulary rule are contracts, not engine features.

**The report MUST state `(engine unavailable — prose fallback ran)` in the Phase 2 table caption.** A hand-composed trace that looks engine-produced is worse than no trace: the trace's whole value is that it is mechanical, and a reader cannot tell the two apart from the table alone.

Engine failure is never permission to skip a row. The silent skip is the failure this architecture exists to prevent; a fallback that quietly curates less than the engine would has reintroduced it.
