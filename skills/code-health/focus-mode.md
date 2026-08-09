# Focus Mode — candidate-driven scoping

Referenced from `skills/code-health/SKILL.md`'s "Focus Mode" section. This file owns the full procedure for `focus=<vertical>` runs — the candidate-driven alternative to `next-slice` directory rotation. It replaces SKILL.md Steps 1, 3, and 4 only. SKILL.md Step 2 (gather open issues) is **run by this procedure**, at F0 below — not skipped — and Steps 5 (JUDGE) onward are unmodified and apply exactly as written once this procedure hands off a criterion and a set of already-read candidate files.

## Known values

The generator registry is the single source of truth for which `focus=` values are recognized — never hand-maintain a separate list here or in SKILL.md, since a list restated in two places drifts (IL-40):

```bash
node -e "const {FOCUS_GENERATORS}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js'); console.log(Object.keys(FOCUS_GENERATORS).join(', '))"
```

If `$ARGUMENTS` names a `focus=` value not in that list, fail loud and stop — report the unrecognized value and the known values printed above. Do not guess or silently fall back to the generalist mode.

`focus=` and `--area` are mutually exclusive. If `$ARGUMENTS` carries both, fail loud and stop the same way — do not pick one and proceed, since the two name incompatible scoping strategies and either choice silently discards half of what was asked for.

## Coverage

Every generator is a heuristic pre-filter, never an inventory. Its candidate set is deliberately partial in ways its own module header enumerates — for `dead-code`, the Coverage block at the top of `bin/lib/code-health/candidates-dead-code.js` (JS/TS only, the CommonJS `module.exports = { ... }` shorthand-brace shape only, identifier-bounded bare-symbol reference search, specifier-name-based orphan detection, dynamic patterns out of scope by construction). Read that block before reporting anything about the run's reach, and state the boundary rather than implying totality: "the generator found N candidates under its stated coverage," never "the repo has N dead exports" (IL-110). An empty candidate set is evidence about the generator's coverage, not a clean bill of health for the repo.

This section names one vertical's generator specifically, so it is per-vertical prose exactly like the Criterion-pinning table below, and carries the same must-update rule: every new `FOCUS_GENERATORS` key owes this section a pointer to its own generator's Coverage block, or that focus firing reports a reach it never had.

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

## F0 — Gather open issues (SKILL.md Step 2, unchanged)

Before anything below, run **SKILL.md Step 2 (GATHER OPEN ISSUES) exactly as written**, populating `ISSUES_FILE` (`/tmp/code-health-open.json`) — the `gh issue list` query, the `extractFingerprint` parse, the `_shared/health-issue-index.md` transport rules, and the digest-mode fold all apply verbatim. Focus mode replaces Steps 1, 3, and 4; it never replaces Step 2.

This is a sequencing requirement, not a formality. `ISSUES_FILE` is the only input to Step 8's `validate-findings --issues "$ISSUES_FILE"` dedup against GitHub. Leave it unset and dedup falls back to the local cache alone — which a Routine's fresh container recreates empty on every firing, so a focus routine re-files the same issues every single run.

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

Then, for every distinct `file` named across `candidates`, read it in full under SKILL.md Step 3's existing 60 KB read-budget discipline — the byte-tracking, the bounded-read fallback past budget, and the "never silently skip, report deferred" rule all apply unchanged.

**Expect to exhaust the budget, and say so.** A generator's candidate set is repo-wide, not slice-sized, so on any real repo it dwarfs the 60 KB budget rather than fitting inside it. Measured on this repo (2026-08): `focus=dead-code` returned 219 candidate files totalling ~1.6 MB — roughly five get a full read and the remaining ~213 are deferred to a bounded read. Because candidates arrive sorted file-then-symbol, the deferred tail is an *alphabetical* tail, not a low-value one: a run's one genuine finding can sort past the cutoff and never reach the judge at all.

This is a known, unfixed limitation of focus mode at this repo's size or larger — do not minimize it. Report every deferred file per Step 3's rule and per Step 10, and never present a focus firing's findings as coverage of the candidate set: the judge saw the files that were actually read, not the ones the generator named.

## F4 — Judge

Hand the judge: the criterion pinned above (with its fragment, if any, embedded per SKILL.md Step 4's existing convention), and the candidate list itself as the material to judge — each candidate's `file`, `symbol` (if present), `kind`, and `evidence` field is a starting pointer, not a finding. The judge still applies the criterion holistically (SKILL.md Step 5) and may reject a candidate outright — a candidate the judge rejects files nothing. Continue at SKILL.md Step 6 (EMIT FINDINGS) exactly as written — including its `areaId` definition, which focus mode does **not** override.

**`areaId` is the candidate file's directory, never the file itself.** Emit `path.dirname(file)` relative to root — `bin/lib` for `bin/lib/color.js`, `.` for a root-level file. That is exactly what the generalist path emits for the same file: `classify`'s `areaId` is the directory-shaped slice id (`bin`, `bin/lib`, `bin/lib/issues` — see `bin/lib/code-health/scope.js`'s `splitOversized`), and SKILL.md Step 6 already specifies `areaId` as "directory path relative to root".

Getting this wrong forks dedup. `areaId` is one of the three fingerprint inputs (`criterion + areaId + normalizeAnchor(anchor)` — `bin/lib/code-health/fingerprint.js`), so a file-shaped `areaId` gives one real finding two different fingerprints depending on which mode found it: `dead-code` at `bin/lib/color.js#dim` files twice, and a `wontfix` suppression recorded under one mode's fingerprint is invisible to the other.

## F5 — Everything from Step 7 onward is unmodified

VERIFY GATE, FRESHNESS RE-CHECK, VALIDATE/FINGERPRINT/DEDUP, FILE/REOPEN, and SUMMARIZE all run exactly as SKILL.md documents them. Use `--slice "focus:<vertical>"` as the `SLICE_ID` for Step 8's `validate-findings` call — a stable, non-colliding cursor key distinct from every directory-shaped generalist slice id.

`SLICE_ID` and `areaId` are two different identities and must not be reconciled. `SLICE_ID` is a **cursor key only**: it names this firing's scope, is never hashed, and never reaches a finding. `areaId` is per-finding, travels into the fingerprint, and must match what the generalist path would emit for the same file (F4). Do not substitute `focus:<vertical>` for `areaId`, and do not substitute a directory for `SLICE_ID`.

## Cursor neutrality

A focus firing never touches `next-slice`'s rotation cursor or content-hash state — those belong to the generalist path and are keyed by directory-shaped slice ids, never by `focus:<vertical>`. Nothing in this procedure calls `next-slice`, so there is nothing to accidentally advance. `validate-findings` does record a cursor entry under the `focus:<vertical>` key itself, which is the point: that key names no real directory, so `next-slice`'s rotation — which only ever considers ids returned by `listSlices` — never sees it and never has its own ordering perturbed by it.

## Routine framing

A focus-mode routine sweeps the generator's whole repo-wide candidate set on every firing, rather than one directory slice per firing. Two consequences a generalist routine does not have:

- **Cost does not self-limit.** There is no `--budget` knob holding a firing to one slice (SKILL.md's `## Input`: `--budget` has no consumer under focus mode, since Step 1 is skipped). What bounds a firing is the generator's own candidate count and F3's 60 KB read budget — so a focus routine's cost tracks the repo, not a fixed sip.
- **Nothing goes stale-then-due.** There is no rotation to fall behind, so a skipped firing costs nothing but a delay: the next one re-derives the same candidate set from scratch. Dedup against open `by:code-health` issues (F0, running SKILL.md Step 2) is what keeps a repeatedly-derived candidate from re-filing — which is exactly why F0 is not optional on a routine firing.

No shipped routine template sets a `focus` field today — see `skills/_shared/routine-template-schema.md`.
