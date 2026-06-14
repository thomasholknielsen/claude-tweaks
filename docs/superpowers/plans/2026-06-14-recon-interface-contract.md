# `/recon` — Canonical Cross-Phase Interface Contract

**This file is the single source of truth for every API surface shared across the
four `/recon` phase plans.** Where a phase plan's inline signature disagrees with
this file, **this file wins** — adjust the call site to match. The four plans were
drafted in parallel and drifted on a few names; the "Known discrepancies to
reconcile" table at the bottom lists every one, so an executor fixes them
deterministically instead of guessing.

Read order for execution: Phase 0 → Phase 1 → Phase 2 → Phase 3. By the time a
later phase runs, the modules below already exist; conform to these signatures.

---

## Module surface

### `bin/lib/recon/fingerprint.js` (Phase 1 owns)

```js
fingerprint({ lens, areaId, signature, file }) -> "recon-<8hex>"
normalizeSignature(signature, file?) -> string
```

- `file` is **optional but expected** for file-anchored lenses. When present, the
  trailing `:line(:col)` is stripped and whitespace/volatile identifiers
  normalized **before** hashing (PORT.md bug #1 — cosmetic line moves must NOT
  mint a new id). Callers SHOULD pass `file: (finding.files && finding.files[0])`.
- Field name is `areaId` (NOT `area`). When fingerprinting a Finding, pass
  `areaId: finding.area`.

### `bin/lib/recon/cache.js` (Phase 1 owns; Phase 3 extends)

```js
readCache(root)  -> { "<fingerprint>": CacheEntry }      // {} when absent
writeCache(root, cache) -> void                           // creates the dir
cachePath(root) -> "<root>/.claude-tweaks/recon/cache.json"

// Phase 3 adds:
recordRun(root, runId, { fingerprints, areasSwept }) -> void   // writes runs/<runId>.json + bumps per-area cursors
readRuns(root) -> [RunLog]
computeChurn(currentFps, priorRun) -> number                    // denominator = |prior ∪ current|
```

- **Canonical names are `readCache` / `writeCache`.** Not `loadCache` / `saveCache`.
- **Canonical dir is `<root>/.claude-tweaks/recon/`** — `cache.json` for the dedup
  cache, `runs/` for per-run logs and judgment work-orders/results. All gitignored.
- `CacheEntry` = `{ status, issue, area?, lastSweptMs?, severity? }` where
  `status ∈ 'open' | 'wontfix' | 'closed' | 'remembered' | 'regressed'`.
  Phase 1 writes `{ status, issue }`; Phase 3 enriches with `area`, `lastSweptMs`,
  `severity` via `recordRun` for scoring.

### `bin/lib/recon/dedup.js` (Phase 1 owns; Phase 3 completes `reopen`)

```js
decide(finding, issueIndex, cache) -> { action, issue? }
// action ∈ 'file' | 'skip' | 'suppress' | 'reopen' | 'remember'
```

- `issueIndex`: a precomputed map `{ "<fingerprint>": { number, state, labels } }`
  built from `gh issue list` output (the skill builds it; the engine never calls
  the network). `state ∈ 'open' | 'closed'`.
- Decision logic: fingerprint matches an **open** `recon` issue → `skip`; matches a
  **closed** non-wontfix issue → `reopen` (regression); matches a `wontfix` issue →
  `suppress`; new & severity ≥ threshold → `file`; new & below threshold →
  `remember` (cache only, no issue).
- Phase 1 ships `file`/`skip`/`suppress`/`remember`; **Phase 3 completes `reopen`.**

### `bin/lib/recon/issue-payload.js` (Phase 1 owns)

```js
toIssuePayload(finding) -> { title, body, labels }
```

- `body` embeds the marker `<!-- recon-fingerprint: <finding.id> -->` and
  `/specify`-shaped sections: **Current State** ← `files` + `evidence`,
  **Deliverables** ← `suggestion`, **Acceptance Criteria** ← `acceptance`.
- `labels = ['recon', 'recon:' + finding.severity]`.

### `bin/lib/recon/areas.js` (Phase 1 owns; Phase 3 rewires `selectAreas`)

```js
detectAreas(root) -> [{ id, globs, flags }]
selectAreas(areas, opts) -> areas
```

- Phase 1 `selectAreas`: simple `--area` filter / pass-through.
- Phase 3 `selectAreas`: delegates to `scoreAreas` and returns top-K.

### `bin/lib/recon/score.js` (Phase 3 owns)

```js
scoreAreas(areas, signals) -> rankedAreas
// signals: { [areaId]: { lastSweptMs, churn, loc, priorFindings, fanIn } }
```

- Weighted sum (staleness, change-recency/churn, blast-radius/fanIn, loc,
  priorFindings) + **round-robin floor**: `lastSweptMs == null` is treated as
  maximally stale (jumps the queue). This makes the per-area-cursor gap
  **self-healing** — areas never swept score highest, get swept, then `recordRun`
  populates their `lastSweptMs`. No Phase 1 change required.
- `MAX_STALE_DAYS` is the floor threshold.

### `bin/lib/recon/pull-issues.js` (Phase 3 owns)

```js
pullReconIssues({ label, minSeverity }, ghOutput) -> [{ number, title, body, fingerprint, severity }]
```

- Pure: parses `gh issue list` JSON passed in; no network. Maps each issue body's
  `/specify`-shaped sections back into a brief for `/flow --from-recon`.

### `bin/lib/recon/judgment.js` + `validate-finding.js` (Phase 2 owns)

```js
buildWorkOrders({ areas, lenses, maxSubagents }) -> [{ lensId, area, modelTier, prompt }]
validateFinding(obj) -> { ok, errors }
```

- `modelTier ∈ 'haiku' | 'sonnet'`. Each `prompt` embeds the matching
  `skills/_shared/criteria-*.md` text + the Finding JSON shape + the
  subagent-output-contract status line. List capped to `maxSubagents` (default 6).
- Lens→fragment map: `architecture-depth` → `criteria-architecture-depth.md`,
  `simplification` → `criteria-simplification.md`, `review-quality` →
  `criteria-review-quality.md`. **Note (Phase 0 concern):** confidence/reversibility
  vocab lives in `skills/_shared/auto-mode-contract.md`, not in
  `criteria-review-quality.md` — a judgment prompt that needs that vocab must embed
  `auto-mode-contract.md` too.

### `bin/recon.js` (CLI; grown across phases)

```
run [--area <path>] [--dry-run] [--root <dir>] [--issues <file>]   # Phase 1
plan-judgment --areas <a,b> --lenses <...> [--max-subagents N] [--run-id <id>]   # Phase 2
ingest-judgment <results.json> [--run-id <id>]                     # Phase 2
status [--fail-on regressed|critical]                             # Phase 3
churn-report [--fail-on-high-churn <ratio>]                       # Phase 3
```

- `--issues <file>` (Phase 1 addition) feeds `gh issue list` output into the engine
  so it stays emit-only / zero-network. The skill builds that file.

## Shared types

```js
// Finding
{ id, title, lens, category, severity, confidence, area, files, evidence, suggestion, acceptance }
// severity ∈ 'low'|'medium'|'high'|'critical'   confidence ∈ 'high'|'med'|'low'
// category ∈ Architecture|Security|Convention|Performance|Error handling|Test quality|Coverage|UX|Docs
```

## Constants

- Issue label: `recon`; severity labels `recon:<severity>`.
- Fingerprint marker (issue body): `<!-- recon-fingerprint: recon-xxxxxxxx -->`.
- State dir: `<root>/.claude-tweaks/recon/` (cache.json, runs/) — all gitignored.

---

## Known discrepancies to reconcile (inline plan text vs this contract)

| # | Where | Plan says | Use instead |
|---|-------|-----------|-------------|
| 1 | Phase 2 & 3 | `loadCache` / `saveCache` | `readCache` / `writeCache` |
| 2 | Phase 1 | cache path `.claude-tweaks/recon-cache.json` | `.claude-tweaks/recon/cache.json` |
| 3 | Phase 2 ingest | `fingerprint({lens, areaId, signature})` | add `file: finding.files && finding.files[0]` |
| 4 | Phase 2 | `decide({ fingerprint, cache, openIssues })` | `decide(finding, issueIndex, cache)` |
| 5 | Phase 3 | `decide(finding, issueIndex)` | `decide(finding, issueIndex, cache)` (add `cache`) |
| 6 | Phase 2/3 dep tables | fingerprint without `file` | document the optional `file` param |

These are naming/shape drifts only — the data flow each plan describes
(validate → fingerprint → dedup → payload; score → select → run lenses) is
consistent across all four. Fixing the call sites to the signatures above is
mechanical.
