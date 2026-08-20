# QA Artifact Retention — Design

**Origin:** #884 ("test/tidy: QA run artifacts (screenshots, traces) have no retention story", filed `needs:definition`).

## Problem

Five browser-facing skills — `/test qa`, `/browse`, `/visual-review`, `/stories`, `/journey-health` — mint point-in-time evidence artifacts (screenshots, failure traces) into a consumer project's working tree: `screenshots/qa/{YYYYMMDD}_{HHMMSS}_{hex}/`, `screenshots/browse/<session>/`, `traces/<id>/<ts>.zip`. Their value decays to zero within days, but nothing ever deletes, archives, or counts them. They are gitignored (screenshots at least), so git hygiene never sees them either.

This is a lifecycle-completeness hole, not a disk emergency: every other transient thing the plugin creates has a full create → use → dispose story (pipeline run dirs archived, worktrees reaped, branches pruned, claims released — the residue/reconcile subsystem enforces it). QA artifacts are the one class the plugin mints and then orphans. Two distinct defects compound it:

1. **Wrong home.** `screenshots/` and `traces/` sit at the *project root* — top-level litter in the user's project for the plugin's transient state. Plugin state belongs under `.claude-tweaks/`.
2. **No death.** No retention: nothing bounds accumulation.

Decision (approved in brainstorming): fix both. Relocate first, then retain against the final paths.

## Design

### 1. New home: `.claude-tweaks/artifacts/`

Artifacts move under the plugin's own directory, a sibling of `pipelines/`, `research/`, etc. The internal shape is preserved with a prefix, not redesigned:

- `.claude-tweaks/artifacts/screenshots/qa/{run}/…`
- `.claude-tweaks/artifacts/screenshots/browse/<session>/…`
- `.claude-tweaks/artifacts/traces/<id>/<ts>.zip`

Prefix-only keeps the writer migration mechanical: `/test qa`'s `SCREENSHOTS_BASE`/`TRACES_BASE` defaults change value; `/browse`, `/visual-review`, `/stories`, `/journey-health` path conventions get the same prefix; naming and sub-structure are unchanged. Rejected alternative: per-run homes under `.claude-tweaks/pipelines/{run-id}/` — artifacts are minted standalone (ad-hoc `/browse`, standalone `/stories`) where no run dir exists, and run-dir `work/` is committed audit trail; binary zips and PNGs must never ride it.

### 2. Gitignore parity

`/init`'s suggested block (`bootstrap/step-04-gitignore-suggestions.md`) gains `.claude-tweaks/artifacts/` (a per-subdir line, consistent with the documented no-blanket-`.claude-tweaks/` rule). The legacy `screenshots/` line stays in the migration story, and `traces/` joins the legacy set so old trees are fully covered while they still exist.

### 3. Retention probe: `bin/lib/residue/probes/artifacts.js`

Follows the probe contract of `pipeline-runs.js` exactly (`{ran, reason, findings[]}`, `makeFinding`, ENOENT = clean state, other read errors = `ran: false` with reason). Two finding classes:

- **Aged artifact dir** — a first-level entry under `.claude-tweaks/artifacts/screenshots/qa/`, `.claude-tweaks/artifacts/screenshots/browse/`, or `.claude-tweaks/artifacts/traces/` whose **newest contained file** is older than 30 days (newest-file mtime, not dir mtime, so a dir still receiving files is never flagged). `kind: 'artifact'`, `remedy: 'auto'`, evidence names the age and newest file. Threshold hardcoded at 30 days, matching `/tidy`'s existing staleness clock — no policy key (YAGNI).
- **Legacy root residue** — a root-level `screenshots/` or `traces/` dir (the pre-relocation convention) is flagged *regardless of age* as relocation residue recommending deletion. Transient evidence isn't worth a move-and-preserve; anything valued is rescued by hand.

Consumers change minimally: `/tidy` Step 4.5 and `/wrap-up`'s residue sweep already read every probe. The one prose edit: `/tidy`'s Step 6 routing tables (`step-6-auto.md`, `step-6-interactive.md`) name the `artifact` finding in the existing auto-apply Delete row ("stale temp files" class — auto at every aggressiveness tier), so its disposition is documented rather than inferred.

### 4. Tests

`tests/bin-lib/residue/` additions for the probe: aged dir flagged, fresh dir kept, newest-file-vs-dir-mtime discrimination (the case that catches the naive implementation), empty root clean, ENOENT clean, unreadable root `ran: false`, legacy-root detection. Picked up by `npm test`'s recursive glob.

## Sequencing

Two work units:

- **A — Relocation:** writer-skill prose (5 skills + any path references in `/help` context docs) + `/init` gitignore block. No code.
- **B — Retention:** probe + tests + `/tidy` routing-row prose. Depends on A (probe targets final paths; carries the legacy-root finding that cleans up after A in existing projects).

## Accepted residual

A project that never runs `/tidy` or `/wrap-up` still accumulates unboundedly — same property as every other residue class. Writer-side rotation was rejected: five-skill churn for a hypothetical. Reference-aware retention (does an open issue cite this trace?) rejected as fragile; a >30-day trace still needed as evidence is the rare case a human rescues at report time.
