# Code-Health — Focus Mode

Cited from `skills/code-health/SKILL.md`'s Workflow section. Read this file when `$ARGUMENTS` contains `focus=<value>` — it replaces Steps 1-4's scoping and criterion selection; Step 5 onward (JUDGE, EMIT FINDINGS, VERIFY GATE, FRESHNESS RE-CHECK, VALIDATE/FINGERPRINT/DEDUP, FILE, SUMMARIZE) runs completely unchanged, reading the same `/tmp/code-health-findings.json` contract either way.

## What focus mode changes

`focus=` swaps the sweep's **scoping strategy only**: deterministic repo-wide candidate generation feeding the judge, instead of `next-slice` directory rotation, and a **pinned** criterion (instead of `criteriaForArea`'s multi-criterion area-type selection). Everything downstream of "the judge has candidates and a criterion" is identical to a generalist run.

A focus firing is **cursor-neutral** — it never touches `next-slice`'s rotation cursor or content-hash state (`bin/lib/code-health/scope.js`). That state belongs to the generalist rotation; a focus run reads none of it and writes none of it. If a generator's own bookkeeping is added in a future leaf, it must live in its own state, never the generalist cursor.

## Grammar

`focus=<value>` — one of the values `knownFocusValues()` returns (currently just `dead-code`; see `bin/lib/code-health/candidates.js`'s `FOCUS_GENERATORS` registry, the single source of truth SKILL.md never hand-copies). Combine with the skill's other `$ARGUMENTS` normally — `--root`, `--dry-run`, `--min-risk` all apply exactly as documented in the top-level Input section. `--area` and `focus=` are mutually exclusive: `--area` is the manual generalist override (Step 1), `focus=` replaces the scoping strategy entirely — if both are present, treat it as a usage error and report it rather than guessing which one wins.

An unrecognized `focus=` value **fails loud**, naming the known values read live from the registry — never a hand-maintained list that drifts as verticals are added:

```bash
node -e "const {knownFocusValues}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates.js'); console.log(knownFocusValues().join(', '))"
```

Report: `Unrecognized focus=<value> — known values: {list from the command above}` and stop. Do not proceed with a best-guess vertical.

## Wiring point (v1: SKILL.md-prose-driven)

Focus mode is invoked directly from skill prose — the same `node -e` require call pattern Step 4 already uses for `criteriaForArea`. `bin/code-health.js`'s CLI arg parser is untouched in v1: no `--focus` flag exists on the binary, and this is a deliberate scope line, not an oversight — a future leaf may wire it into the CLI once more than one vertical exists and the fleet-provisioning question (routine cadence per vertical) is actually being answered.

**Step F1 — SCOPE (replaces Step 1): run the generator.**

```bash
node -e "
const { getFocusGenerator } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates.js');
const entry = getFocusGenerator('${FOCUS}');
console.log(JSON.stringify(entry.generator(process.env.ROOT || process.cwd())));
" > /tmp/code-health-candidates.json
```

Also capture scan coverage counters, via the sibling `scanStats` export — this is what lets Step F1's "zero candidates" report distinguish a genuinely clean tree from a broken invocation (see below):

```bash
node -e "
const { getFocusGenerator } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates.js');
const { scanStats } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js');
console.log(JSON.stringify(scanStats(process.env.ROOT || process.cwd())));
" > /tmp/code-health-scan-stats.json
```

Read `/tmp/code-health-candidates.json`: an array of `{file, symbol?, kind, evidence}` records (the generator's documented return shape — see the generator module's own header for its coverage statement and out-of-scope cases).

**Zero candidates is a clean no-op, not an error.** If the array is empty, report `no candidates this firing` **together with the scan-stats counters** — `scannedFiles`, `entrypointFiles`, `binarySkipped` from `/tmp/code-health-scan-stats.json` — so a silent total skip (e.g. `scannedFiles: 0` because the resolved root was wrong, or `git ls-files` failed and the fallback walk also found nothing) reads differently from a genuinely clean tree (`scannedFiles: 340, binarySkipped: 2`, zero candidates). Write the run record via the same convention a generalist zero-finding run already uses (Step 10's summary shape), and exit — do not treat an empty candidate array as a failure.

**Step F2 — READ candidate files (replaces Step 3).**

For each candidate, read its `file` under the existing 60 KB read-budget discipline (Step 3's own rule — reapply it here verbatim, scoped to the candidate set instead of a directory slice): full-read while under budget, switch to bounded reads on reaching it, and list any deferred file with its size in the Step 10 report exactly as a generalist run would. Candidates are typically a small, scattered set of individual files rather than one contiguous directory, so the budget is much less likely to bind in practice — but the rule is unconditional, not a "usually fine" shortcut.

**Step F3 — CLASSIFY (replaces Step 4): pinned criterion, no area-type detection.**

Skip `classify` and `criteriaForArea` entirely. The registry's `criterion` field for this focus **is** the selected criterion — for `dead-code`, that's the `dead-code` criterion already in `bin/lib/code-health/criteria.js`'s catalog (untouched by this framework — see that file's own header). Load its fragment file exactly as Step 4 would for any selected criterion (`dead-code`'s catalog entry carries `fragment: null`, so there is no fragment file to load — judge from the catalog's inline guidance, same as a generalist run would for any other `fragment: null` criterion).

## Step 10 (SUMMARIZE) under focus mode

Step 10's generalist wording ("the slice's read coverage... whether it was read recursively or own-files-only") assumes a directory-shaped scope, which a focus run does not have — the scope is a scattered candidate set, not a slice. Report the equivalent facts in the shapes that actually apply: which `focus=<value>` ran, the candidate count from Step F1, the scan-stats counters (`scannedFiles`, `entrypointFiles`, `binarySkipped`), and any files deferred at Step F2's read budget with their sizes (`Deferred (read budget)`, same heading Step 10 already uses). Everything else in Step 10 — findings emitted, survived dedup, filed/skipped/remembered, the throttle line — applies unchanged, since it describes the judge/dedup/filing pipeline, not the scoping strategy that fed it.

## Candidates are input to judgment, never findings

A candidate from Step F1 is material for Step 5 (JUDGE), not a pre-approved finding. The judge still applies the pinned criterion holistically to each candidate's file content — read in Step F2 — exactly as it would apply any criterion to a generalist slice. The verify gate (Step 7) still runs against every finding the judge emits from that judgment. A candidate the judge rejects (the file turns out not to actually exhibit the criterion once read in context — an "unreferenced" export that's actually a public library entry point re-exported by a barrel the generator's v1 scope doesn't resolve, say) simply produces no finding and is never filed. The generator's job is narrowing what the judge looks at, not deciding what gets filed.

## Anti-Patterns (focus mode)

| Pattern | Why It Fails |
|---------|--------------|
| Filing a candidate directly without judging it | The generator is a deterministic heuristic with stated false-negative bias, not a certified finding — Step 5 and the verify gate still apply |
| Treating zero candidates as a run failure | It's the expected outcome on a clean tree — report it with scan-stats counters and exit cleanly |
| Advancing or reading `next-slice`'s rotation cursor during a focus run | Focus mode is cursor-neutral by design — that state belongs to the generalist rotation |
| Hand-listing known `focus=` values in an error message | Drifts the moment a new vertical is registered — read `knownFocusValues()` live |
| Passing both `--area` and `focus=` and picking one silently | Ambiguous input — report it as a usage error instead of guessing |
| Wiring `focus=` into `bin/code-health.js`'s CLI parser in this leaf | Explicit v1 scope line — SKILL.md-prose-driven only, until a later leaf answers the fleet-provisioning question |
