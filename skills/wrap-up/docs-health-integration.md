# Docs-Health Integration for /wrap-up Step 7.7

Loaded by `/claude-tweaks:wrap-up` Step 7.7 to judge the health of docs this work actually touched or is closely related to, and to detect documentation this work should have produced but didn't. Three checks — D0 broadens which existing docs get judged beyond the touched set via a domain-overlap scan, D1 applies the shared docs-health judgment to that combined scope, D2 judges the diff for missing coverage.

## D0: Domain-Overlap Scan

**Purpose:** rank existing docs by how much they cover the changed subsystem, so D1 also judges docs that weren't directly touched but are still relevant — the documentation equivalent of skill curation's independent domain-scoped scan (`skill-curation.md` 7.2).

1. Read `docs/REGISTRY.md`. **Explicit fallback:** if it doesn't exist, or exists with no Auto-detect patterns, skip this scan for the run entirely — do not fall back to scanning the whole `docs/` tree (that's `/claude-tweaks:docs-health`'s own rotation's job, not this leaf's). Note this in the mandatory summary below as `"registry absent/empty — domain-overlap scan skipped"`; this is not an error.
2. Otherwise, score each registry entry by how much its Auto-detect patterns intersect this work's `git diff --name-only` — reuse `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles` the same way `SKILL.md`'s Step 6 fast-lane pre-check does (map each bare filename to `{path: f}` first, since the function reads `f.path`), passing the registry's own Auto-detect patterns as the `sensitivePaths` argument. A result's `isSensitive: true` means a registry-pattern hit here.
3. Rank descending by overlap-hit count. Take the **top-N**, where N is `--doc-budget` if passed to the invoking `/claude-tweaks:wrap-up` call (see `wrap-up/SKILL.md`'s Flags), else **3** — or **1** when `config.yml`'s `ceremony-profile` is `fast-lane` (read fresh — see `wrap-up/SKILL.md` Step 3.5). Exclude any doc already in D1's touched-docs scope below — it's already covered, don't double-judge it.
4. If more docs than the applicable cap have a nonzero overlap score, **note the overflow explicitly** in the mandatory summary below (name the cap and how many were left unread) — never silently truncate. `/claude-tweaks:tidy` and future wrap-ups pick up the remainder.
5. Add the selected top-N docs to D1's scope below — they go through the identical JUDGE procedure (D1 Steps 1-3) as touched docs, with no special-casing.

## D1: Inline JUDGE application

**Scope:** every doc under `docs/**` that this work edited or newly created (`git diff --name-only` against the run's base, filtered to `docs/**/*.md`), **unioned with D0's domain-overlap top-N** above. Registry-matched-but-unedited docs outside D0's selected top-N are `/claude-tweaks:docs-health`'s own rotation's concern — don't re-scope this to include them.

For each doc in scope:

1. Read the doc in full.
2. Apply the full JUDGE procedure from `_shared/criteria-docs-diataxis.md` (genre-drift including placement-fit, depth-mismatch, findability, staleness including freshness-dependencies, dual-persona misleading-risk) — the identical procedure `/claude-tweaks:docs-health` Step 3 applies, reused inline here rather than invoking `/claude-tweaks:docs-health` as a nested skill call (same reuse pattern Step 7 already applies to `_shared/harness-health-analysis.md`).
3. Run the same verify gate `/claude-tweaks:docs-health` Step 3.5 applies: is each finding real, actionable, and correctly `misleads`-tagged? Drop any that fail.

Route surviving findings by `classification`:

- **`additive`** → collect as `[doc] {file} — {description}` rows, surfaced in the Wrap-Up Review Console's own "Documentation updates" section (Step 8.6) or, in interactive/standalone mode, folded into Step 9's generic Configuration Updates batch table (that lower-traffic template is intentionally not split further — see the Gotcha at the bottom of this file) — applied inline in Step 10 exactly like any other approved doc edit.
- **`restructural`** → file as a `by:docs-health` GitHub issue via the existing dedup/filing CLI machinery, scoped to exactly this run's touched-doc IDs instead of a `next-target` rotation pick:

  ```bash
  gh issue list --label by:docs-health --state all --json number,state,labels,body --limit 500 > /tmp/wrapup-docs-health-issues-raw.json
  ```

  Parse via `extractFingerprint` (`bin/lib/issues/record.js`) into `{ number, state, labels, fingerprint }` objects, same as `/claude-tweaks:docs-health` Step 4, and write to `/tmp/wrapup-docs-health-issues.json`. Write this check's `restructural` findings to `/tmp/wrapup-docs-health-findings.json` in the same finding shape `_shared/criteria-docs-diataxis.md`'s "Emitting a finding" section defines, then:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" validate-findings /tmp/wrapup-docs-health-findings.json \
    --root "${ROOT:-$PWD}" --issues /tmp/wrapup-docs-health-issues.json --dry-run \
    > /tmp/wrapup-docs-health-payloads.json
  ```

  `--dry-run` here — wrap-up's own approval gate (Step 8.6 Review Console / Step 9 batch decision) is the point of approval, not `validate-findings`'s own dedup-and-file path. After the user approves at that gate, re-run the identical command without `--dry-run` so the cursor/cache state actually persists. Before filing, bootstrap the label families this run applies — same canonical pairs `/claude-tweaks:docs-health` Step 6 bootstraps from `_shared/label-bootstrap.md`'s `LABELS_JSON`, since a project with no prior standalone `/docs-health` run won't have them yet. Then file each surviving payload with `gh issue create` exactly as `/claude-tweaks:docs-health` Step 6 does (same label set: `by:docs-health`, the scoring labels from that skill's classification table's `restructural` row, `ready`, `docs-health:restructural`).

## D2: Missing-documentation gap-detection

**Scope:** this work's full diff, not any existing doc — this check's input is code, so it never runs against the docs-health criteria fragment (which only ever takes a doc as input).

Ask: did this work introduce a new subsystem, skill, or architectural pattern with **zero existing doc coverage anywhere** in the project — not merely a small change that doesn't match a registry Auto-detect pattern, but something a future reader would have no doc to go to at all? This is a deliberately high bar. Examples that clear it: a new skill directory, a new top-level architectural pattern, a new user-facing capability with no existing doc even adjacent to it. Examples that don't: a new function in an already-documented module, a bug fix, a config tweak.

On a hit:

1. Infer the matching genre from what the new subsystem actually is (see `_shared/criteria-docs-diataxis.md` Dimension 1's "what it actually does" table) — a new skill's user-facing guide is typically How-To-shaped; a new architectural pattern is typically Explanation-shaped; a new API surface is typically Reference-shaped.
2. Propose a `[doc] {new-file-path} — Create: {one-line rationale}` row, folded into the same Documentation updates collection as D1's additive findings (see D1's routing above).
3. On approval, Step 10 scaffolds the new file from the matching section of `skills/_shared/diataxis-genre-templates.md`, then fills in real content from this work's own session context — unlike `/claude-tweaks:init` Phase 8.5's missing-doc detection (which only backlogs a pointer to the template, since it's scanning an unfamiliar codebase with no session context to fill anything in from), wrap-up has full context on what was just built and writes real content immediately.

Never propose more than one new doc per genuinely new subsystem — if the new subsystem spans multiple genres worth of content (e.g. both a How-To and a Reference), propose each as its own row rather than one doc trying to be two genres.

## Mandatory summary (always, regardless of outcome)

Emit exactly one summary line every Step 7.7 run, auto mode or interactive:

```
SCANNED {time} — Step 7.7 documentation curation summary: {T} docs touched, {D} domain-overlap docs read
(top-{cap}: {names}, or "registry absent/empty — domain-overlap scan skipped"), gap detection: {what was
examined, found/not found}.
Result: {N} applied, {M} staged, {K} restructural filed.
Reversibility: N/A.
```

`{T}` counts docs in D1's touched-docs sub-scope (`git diff` against `docs/**/*.md`). `{D}` counts D0's domain-overlap docs actually read — `0` when the registry is absent/empty, in which case render the parenthetical as the literal fallback text instead of `top-{cap}: {names}`. `{cap}` is D0's own default-3/fast-lane-1/`--doc-budget`-override value. When D0 noted an overflow (Step 3 above), append it to the summary: `; {V} additional domain-overlap doc(s) over cap, deferred to /claude-tweaks:tidy`. Auto mode appends this line to `decisions.md` under the `SCANNED` tag (see `_shared/auto-decision-log.md`); interactive mode prints the equivalent line inline instead of `decisions.md`.

Declare **"No documentation updates needed"** only when D0 finds no domain-overlap docs (or the registry is absent/empty), D1's full scope (touched + domain-overlap) produces no findings, and D2 finds no missing-doc gap — and even then, the mandatory summary line above is still emitted, naming the docs-touched count, domain-overlap docs read, and gap-detection outcome. A "no updates needed" outcome that skips the summary line is a Step 7.7 defect, not a valid completion.

## Gotcha: Step 9's standalone template is not split

`wrap-up/SKILL.md`'s Step 9 "Present Consolidated Summary" standalone template (the non-Review-Console path, used in interactive mode or standalone wrap-up) still folds doc items into one generic `### Configuration Updates (from Step 6)` table alongside CLAUDE.md/rule/ADR items. This is deliberate — Step 9 is a lower-traffic path (Step 8.6's Review Console already covers the console-driven flow with its own dedicated "Documentation updates" section), and splitting Step 9's template is out of scope for this change. Only Step 8.6 (`review-console.md`) gets the dedicated section.
