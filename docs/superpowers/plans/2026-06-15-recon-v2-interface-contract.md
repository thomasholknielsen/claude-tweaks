# Recon v2 — Canonical Cross-Phase Interface Contract

**Single source of truth for every API surface shared across the four v2 phase plans.**
Where a phase plan's inline signature disagrees with this file, **this file wins**.

Design: `docs/superpowers/specs/2026-06-15-recon-v2-llm-judge-design.md`.
Read order: P1 → P2 → P3 → P4. v2 is **greenfield but reuses v1 plumbing in place** on the
`recon-v2` branch. Each entry below says **reuse / extend / new / rewrite** relative to the
shipped v1 code in `bin/lib/recon/` and `skills/recon/`.

---

## The core data shape — Finding (LLM judge output)

```js
// One finding the LLM judge emits (as a JSON array entry). Validated by validate-finding.js.
{
  criterion,          // enumerated lens id, e.g. 'architecture-depth' | 'security-logic' | 'a11y'
  areaId,             // the slice id = directory path relative to root, e.g. 'src/api'
  anchor,             // STABLE locator: "<relfile>#<nearest-named-symbol>" — NO line numbers, NO prose
  severity,           // 'low' | 'medium' | 'high' | 'critical'
  confidence,         // 'high' | 'med' | 'low'
  title,              // short summary
  evidence,           // what was observed (cites file + symbol; no line numbers)
  suggestedApproach,  // the described fix in prose — NO code. Becomes issue "Deliverables"
  acceptance          // acceptance criteria. Becomes issue "Acceptance Criteria"
}
```

`anchor` is the crux of dedup: the LLM must emit a canonical locator the engine can hash. The
contract format is `relative/file/path#NearestNamedSymbol` (function/class/const/section name).
No line numbers, no surrounding prose. The engine normalizes (lowercase path, strip any trailing
`:line(:col)`, collapse whitespace) before hashing.

## `bin/lib/recon/fingerprint.js`  *(extend v1)*

```js
fingerprint({ criterion, areaId, anchor }) -> "recon-<8hex>"   // v2 form
normalizeAnchor(anchor) -> string
```
v1's `fingerprint({lens, areaId, signature, file})` stays for any retained mechanical check; v2
adds the `criterion + areaId + anchor` form. Stability test required: same finding with a moved
line / reworded prose → same id.

## `bin/lib/recon/validate-finding.js`  *(extend v1)*

```js
validateFinding(obj) -> { ok: boolean, errors: string[] }
```
Validates the v2 Finding shape: `criterion` is a known catalog id, `severity`/`confidence` in
their enums, required fields present and non-empty (incl. `anchor`, `suggestedApproach`,
`acceptance`). Malformed → dropped with a logged reason.

## `bin/lib/recon/criteria.js`  *(new)*

```js
// The catalog. Each criterion:
{ id, appliesTo, fragment?, confidenceFloor }
//   appliesTo: 'universal' | string[]  (area types it applies to)
//   fragment:  path under skills/_shared/ when one exists (reuse criteria-*.md)
//   confidenceFloor: minimum confidence to FILE (noisy criteria => 'high')

CRITERIA                          // the full registry (universal core + domain)
criteriaForArea(areaTypes) -> Criterion[]   // universal + matching-domain
getCriterion(id) -> Criterion | undefined
```
Universal core: `architecture-depth`, `simplification`, `review-quality` (reuse the three
`_shared/criteria-*.md` fragments), `scalability`, `security-logic`, `bad-practice`,
`doc-freshness`, `dead-code`, `test-quality`, `resilience`, `observability`, `config-secrets`,
`dependency-health`, `input-validation`, `naming-clarity`.
Domain: `a11y`→frontend, `i18n`→frontend/user-facing, `api-stability`→library/backend,
`migration-safety`→data, `iac-security`→infra, `privacy-pii`→(user-data areas),
`concurrency`→(async/shared-state areas).

## `bin/lib/recon/area-type.js`  *(new)*

```js
classifyArea(absDir, root) -> { types: string[] }   // [] => universal-only
```
Signal-file based: deps (`react`/`vue`/… → frontend; server frameworks → backend), `*.tf` /
`Dockerfile` / k8s → infra, a `migrations/` dir / `.sql` / ORM schema → data,
`exports`/`publishConfig`/`main`+`types` → library, `bin` field / shebang → cli, mostly-`.md` →
docs. Additive (an area can have multiple types). Best-effort; unknown → `[]`.

## `bin/lib/recon/scope.js`  *(new; may absorb v1 areas.js/score.js logic)*

```js
listSlices(root) -> Slice[]                 // directory-level slices; Slice = { id, path }
contentHash(absDir) -> string               // hash of source-file contents under the dir
selectSlice(root, cursors, opts) -> Slice | null
//   next slice to judge: rotation order by hotspot priority (churn × complexity),
//   SKIP a slice whose contentHash === cursors[id].lastHash UNLESS past re-judge staleness,
//   force-pick any slice unjudged past MAX_STALE_DAYS (eventually-complete floor).
```

## `bin/lib/recon/cache.js`  *(reuse + extend v1)*

```js
readCache(root) / writeCache(root, cache) / cachePath(root)   // .claude-tweaks/recon/cache.json
readCursors(root) / writeCursors(root, cursors)
//   cursors: { "<areaId>": { lastSweptMs, lastHash } }   <-- EXTEND v1 cursor with lastHash
recordRun(root, runId, { fingerprints, areasSwept, hashes }) -> void
readRuns(root) -> RunLog[]
computeChurn(currentFps, priorRun) -> { appeared, disappeared, stayed, ratio }  // |prior ∪ current|
```

## `bin/lib/recon/dedup.js`  *(reuse v1, unchanged)*

```js
decide(finding, issueIndex, cache) -> { action, issue?, note? }
// action ∈ 'file' | 'skip' | 'suppress' | 'reopen' | 'remember'
// issueIndex: { "<fingerprint>": { number, state, labels } } built from gh issue list
```

## `bin/lib/recon/issue-payload.js`  *(extend v1)*

```js
toIssuePayload(finding) -> { title, body, labels }
```
`body`: `## Current State` (evidence + anchor) · `## Deliverables` (suggestedApproach) ·
`## Acceptance Criteria` (acceptance) · the marker `<!-- recon-fingerprint: <finding.id> -->`.
`labels`: `['recon', 'recon:' + severity, 'recon:' + criterion]`.

## `bin/recon.js`  *(reuse/extend; stays emit-only, zero-network)*

```
classify --root <dir> [--area <dir>]            # P2: prints area types for a slice
next-slice --root <dir> [--dry-run]             # P3: prints the slice to judge this run
validate-findings <findings.json> --root <dir> [--issues <file>] [--run-id <id>]
                                                # P1: validate -> fingerprint -> dedup -> emit gh payloads
status [--fail-on regressed|critical]           # P4 (reuse v1)
churn-report [--fail-on-high-churn <r>]         # P4 (reuse v1)
```
**v2 has NO `plan-judgment`/`ingest-judgment` subagent dance** — the SKILL drives the judge
directly, assembles the judge's findings into a JSON array, and pipes it to `validate-findings`.

## `skills/recon/SKILL.md`  *(rewrite — the v2 spine)*

The SKILL drives Claude (the judge) through:
`SCOPE` (call `next-slice`) → `CLASSIFY` (call `classify`) → `JUDGE` (read the slice; apply
`criteriaForArea`'s criteria holistically, embedding each fragment; call tools as evidence; a
final "anything else worth flagging?" pass) → emit a findings JSON array → `validate-findings`
(fingerprint + dedup + confidence gate) → `gh issue create` per surviving payload (output #1).
Plus: Routine Configuration, Component-Skill Contract (`$PIPELINE_RUN_DIR`), Anti-Patterns,
bidirectional Relationship table, Next Actions.

## Criteria fragments  *(skills/_shared/)*

Reuse `criteria-architecture-depth.md`, `criteria-simplification.md`, `criteria-review-quality.md`.
Add new fragments for the added universal + domain criteria in P2 (one per criterion that needs
more than a one-line prompt).

## Guardrails

- **Confidence floor per criterion** (`criteria.js`): noisy criteria (`performance`,
  `privacy-pii`, `a11y`) file only at `confidence: 'high'`; below-floor findings are dropped.
- **Verify gate** (P2): before filing, a quick "is it real / actionable / does it reproduce?"
  check kills plausible-but-wrong findings.

## Constants

- Issue label `recon`; severity label `recon:<severity>`; criterion label `recon:<criterion>`.
- Fingerprint marker: `<!-- recon-fingerprint: recon-xxxxxxxx -->`.
- State dir `.claude-tweaks/recon/` (cache.json, cursors.json, runs/) — all gitignored (already
  covered by the v1 `.gitignore` entry `.claude-tweaks/recon/`).

## Greenfield migration (v2 replaces v1's spine)

- **Replace:** `skills/recon/SKILL.md` (rewrite), the `plan-judgment`/`ingest-judgment` commands,
  the mechanical-lens-as-spine model.
- **Demote:** `bin/lib/recon/lenses/*` — keep as optional cheap checks the LLM may call, not the
  run spine. (Do not delete in P1; revisit in P4.)
- **Reuse:** `fingerprint`, `validate-finding`, `dedup`, `cache`, `issue-payload`, `pull-issues`,
  `status`/`churn-report`, the three `_shared/criteria-*.md` fragments — extended per above.

## Cross-plan reconciliation notes (resolved)

The four plans were drafted in parallel against this contract; these three points are settled
here so execution doesn't have to guess:

1. **`criteria.js` exports `CRITERIA` (named)** alongside `criteriaForArea` and `getCriterion`.
   P1 creates the module with that export surface; P2 extends `CRITERIA` and tests against it.
2. **v2 findings carry `finding.id`** (the fingerprint). `dedup.js` already matches on
   `finding.fingerprint || finding.id`, so `id` is correct and needs no dedup change.
3. **P4 owns the single version bump → `5.0.0`** (recon's CLI/behaviour change is breaking).
   Intermediate phases (P1–P3) do NOT bump `plugin.json`; ignore any inline "version bump" step
   in the P3 plan — P4 is the only phase that touches the version and the marketplace mirror.
