# Focus Mode — candidate-driven scoping

Referenced from `skills/code-health/SKILL.md`'s "Focus Mode" section. This file owns the full procedure for `focus=<vertical>` runs — the candidate-driven alternative to `next-slice` directory rotation. SKILL.md Step 2 (gather open issues) and Steps 5 (JUDGE) onward are unmodified and apply exactly as written once this procedure hands off a criterion and a set of already-read candidate files.

## Known values

The generator registry is the single source of truth for which `focus=` values are recognized — never hand-maintain a separate list here or in SKILL.md, since a list restated in two places drifts (IL-40):

```bash
node -e "const {FOCUS_GENERATORS}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js'); console.log(Object.keys(FOCUS_GENERATORS).join(', '))"
```

If `$ARGUMENTS` names a `focus=` value not in that list, fail loud and stop — report the unrecognized value and the known values printed above. Do not guess or silently fall back to the generalist mode.

`focus=` and `--area` are mutually exclusive. If `$ARGUMENTS` carries both, fail loud and stop the same way — do not pick one and proceed, since the two name incompatible scoping strategies and either choice silently discards half of what was asked for.

## Coverage

Every generator is a heuristic pre-filter, never an inventory. Its candidate set is deliberately partial in ways its own module header enumerates — for `dead-code`, the Coverage block at the top of `bin/lib/code-health/candidates-dead-code.js` (JS/TS only, the CommonJS `module.exports = { ... }` shorthand-brace shape only, identifier-bounded bare-symbol reference search, specifier-name-based orphan detection, dynamic patterns out of scope by construction). Read that block before reporting anything about the run's reach, and state the boundary rather than implying totality: "the generator found N candidates under its stated coverage," never "the repo has N dead exports" (IL-110). An empty candidate set is evidence about the generator's coverage, not a clean bill of health for the repo.

## Criterion pinning

Each focus pins exactly one criterion — no `classify`/`criteriaForArea` call, since focus-mode candidates are scattered across the whole repo rather than confined to one classified area:

| Focus | Criterion id | Fragment |
|---|---|---|
| `dead-code` | `dead-code` | none (`fragment: null` in `criteria.js` — judge from SKILL.md Step 5's guidance alone, same as any other `fragment: null` criterion) |

This table is per-vertical data, not a second copy of the registry's key list: a generator carries no criterion field, so the mapping has to live somewhere and this is its only home. It must gain a row whenever `FOCUS_GENERATORS` gains a key. A `focus=` value the registry recognizes but this table has no row for is the same fail-loud stop as an unrecognized value — report the gap and stop rather than falling back to `criteriaForArea`.

Look the pinned criterion up via `getCriterion` (`bin/lib/code-health/criteria.js`) rather than hand-copying its fields, exactly as SKILL.md Step 4 already does for the generalist path:

```bash
node -e "const {getCriterion}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/criteria.js'); console.log(JSON.stringify(getCriterion('dead-code')))"
```

## F1 — Run the generator

```bash
node -e "
const { FOCUS_GENERATORS } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js');
const gen = FOCUS_GENERATORS['${FOCUS}'];
console.log(JSON.stringify(gen('${ROOT:-$PWD}')));
" > /tmp/code-health-focus-scan.json
```

Read `/tmp/code-health-focus-scan.json`. It is `{ candidates, scannedFiles, skippedFiles }` — always the rich shape, never the bare `candidatesDeadCode(rootDir, opts) → [...]` array (that narrower signature exists too, for direct unit testing, but this wiring always goes through the registry's richer generator function so scan coverage is always reportable, per the zero-candidates contract below). `scannedFiles` is a count of every tracked source file the scan considered; `skippedFiles` is an array of `{ file, reason }` naming the subset it then skipped, so `scannedFiles - skippedFiles.length` is what was actually examined. Each candidate is `{ file, kind, evidence }` plus a `symbol` on the `unreferenced-export` kind.

## F2 — Zero candidates is a clean no-op, not an error

If `candidates` is an empty array, this firing is done. Do not treat it as a failure and do not retry. Report exactly:

```
focus=<vertical>: no candidates this firing (scanned: <scannedFiles> files, skipped: <skippedFiles.length>)
```

Write the run record via the same convention the generalist run already uses (Step 8's `validate-findings` with an empty findings array, `--slice "focus:<vertical>"`, so the run-log entry exists) and stop. Reporting both counts is what makes a genuinely clean tree distinguishable from a silent total skip (IL-115) — a `scannedFiles: 0` line is a signal something is wrong (non-git root, `git` unavailable), not evidence of a clean repo.

Both counts are reported the same way on a **non-empty** firing too — they are the focus-mode substitute for the slice-coverage line SKILL.md Step 10 asks for. This section only fixes their wording; they always come from F1's output.

## F3 — Read candidate files

Stamp the freshness marker first, exactly as SKILL.md Step 3 does for the generalist path — Step 7.5 is unmodified under focus mode and reads this marker, and a missing marker makes its `find -newer` check silently pass every finding:

```bash
touch /tmp/code-health-read-marker
```

Then, for every distinct `file` named across `candidates`, read it in full under SKILL.md Step 3's existing 60 KB read-budget discipline — the byte-tracking, the bounded-read fallback past budget, and the "never silently skip, report deferred" rule all apply unchanged. A focus-mode candidate set is typically far smaller than a directory slice, so hitting the budget here is the exception, not the rule — but the same discipline applies exactly the same way if it happens.

## F4 — Judge

Hand the judge: the criterion pinned above (with its fragment, if any, embedded per SKILL.md Step 4's existing convention), and the candidate list itself as the material to judge — each candidate's `file`, `symbol` (if present), `kind`, and `evidence` field is a starting pointer, not a finding. The judge still applies the criterion holistically (SKILL.md Step 5) and may reject a candidate outright — a candidate the judge rejects files nothing. Continue at SKILL.md Step 6 (EMIT FINDINGS) exactly as written; `areaId` for a focus-mode finding is the candidate's own `file` path (there is no directory-shaped area).

## F5 — Everything from Step 7 onward is unmodified

VERIFY GATE, FRESHNESS RE-CHECK, VALIDATE/FINGERPRINT/DEDUP, FILE/REOPEN, and SUMMARIZE all run exactly as SKILL.md documents them. Use `--slice "focus:<vertical>"` as the `SLICE_ID` for Step 8's `validate-findings` call — a stable, non-colliding cursor key distinct from every directory-shaped generalist slice id.

## Cursor neutrality

A focus firing never touches `next-slice`'s rotation cursor or content-hash state — those belong to the generalist path and are keyed by directory-shaped slice ids, never by `focus:<vertical>`. Nothing in this procedure calls `next-slice`, so there is nothing to accidentally advance. `validate-findings` does record a cursor entry under the `focus:<vertical>` key itself, which is the point: that key names no real directory, so `next-slice`'s rotation — which only ever considers ids returned by `listSlices` — never sees it and never has its own ordering perturbed by it.

## Routine framing

A focus-mode routine sweeps the generator's whole repo-wide candidate set on every firing, rather than one directory slice per firing. Two consequences a generalist routine does not have:

- **Cost does not self-limit.** There is no `--budget` knob holding a firing to one slice (SKILL.md's `## Input`: `--budget` has no consumer under focus mode, since Step 1 is skipped). What bounds a firing is the generator's own candidate count and F3's 60 KB read budget — so a focus routine's cost tracks the repo, not a fixed sip.
- **Nothing goes stale-then-due.** There is no rotation to fall behind, so a skipped firing costs nothing but a delay: the next one re-derives the same candidate set from scratch. Dedup against open `by:code-health` issues (SKILL.md Step 2) is what keeps a repeatedly-derived candidate from re-filing.

No shipped routine template sets a `focus` field today — see `skills/_shared/routine-template-schema.md`.
