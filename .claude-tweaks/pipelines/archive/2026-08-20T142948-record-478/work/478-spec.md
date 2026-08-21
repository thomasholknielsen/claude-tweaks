---
record: 478
origin: capture
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 478: Residual model-selection 'tier' vocabulary outside #222's sweep scope

Surface: backend

## Current State

Record #222 (closed) established the repo-wide vocabulary rename for the model-selection dispatch axis: "profile" replaces "tier" wherever a site names this axis, and the dispatch-prompt bracket grammar becomes the bare `[Use: {Profile}]` form (dropping the trailing literal word "model" and any in-bracket reason clause inconsistency). #222's own scan (`find skills agents bin`) explicitly excluded four groups of sites as Non-Goals, deferring them to sibling records: `skills/_shared/multi-agent-coordination.md` (owned by #220), `skills/build/SKILL.md`/`build-options.md` (owned by #217/#223), the contract file and CLAUDE.md (#216), and everything under `docs/` (outside the scan's directory list entirely). #216, #217, #220, and #223 are all now closed without ever touching this residue, so nothing currently tracks finishing it.

Re-verified directly against the current tree (this record's citations were filed several days ago and some line numbers have since drifted or the underlying content has already changed):

- **Confirmed still live** — `skills/_shared/multi-agent-coordination.md:66` and `:207` (drifted from the originally-filed `:205`) still carry the retired `[Use: Standard model — {reason}]` grammar (the literal word "model" inside the bracket, plus an in-bracket reason clause).
- **Confirmed still live** — `skills/build/SKILL.md` (lines 4, 28, 46, 207) and `skills/build/build-options.md` (lines 39, 41 heading + surrounding table) still expose the `tier=<fast|standard|capable|frontier>` CLI token, a "Model tier override" heading, and prose describing the record header's `size:` field as a "model-tier signal."
- **New site, not in the original filing** — `skills/help/reference-card.md:13` also echoes the same `tier=<fast|standard|capable|frontier>` token in its command-reference table row for `/claude-tweaks:build`.
- **Confirmed still live (Minor)** — `skills/review/step3-debate-and-refutation.md:98`'s Capable dispatch site uses the bare `[Use: Capable] — reason` form (reason clause outside the bracket) while the file's own Frontier sites (lines 37, 132) keep the reason inside the bracket (`[Use: Frontier — reason]`) — an intra-file grammar inconsistency.
- **Confirmed still live, flagged as defensible (Minor, optional)** — `skills/tidy/SKILL.md:65`'s citation phrasing (`[Use: Fast] (resolved as stated in the Model profile line below)`) is a one-off variance across ~20 otherwise-consistent sites; the originally-filed body itself characterizes this as defensible rather than broken.
- **Not reproducible — treat as already resolved** — the four `docs/` sites named in the original filing (`docs/skill-authoring.md:102`, `docs/skill-graph.md:302`/`403`, `docs/plugin-structure.md:51`, `docs/journeys/resolve-dispatch-model-profile.md:36`) no longer contain any retired-grammar or `tier=`/`model-tier` content at the cited lines or anywhere else in those files — a repo-wide grep of `docs/` for the retired patterns returns zero hits outside this topic's own historical ledger entry (`docs/plans/2026-08-15-spec-222-459-428-ledger.md`). These files have been edited by unrelated merges since the original filing; whatever content triggered the original citation is gone.

## Deliverables

1. `skills/_shared/multi-agent-coordination.md:66,207` — drop the retired `[Use: {Profile} model — {reason}]` grammar (literal "model" word + in-bracket reason) for the established bare `[Use: {Profile}]` + reason-outside-bracket form used elsewhere in the file (e.g. the pattern already correct in `skills/review/step3-lens-dispatch.md`).
2. `skills/build/SKILL.md` and `skills/build/build-options.md` — rename the `tier=<fast|standard|capable|frontier>` CLI token to `profile=<fast|standard|capable|frontier>` (argument-hint frontmatter, invocation-grammar prose, and the "Model tier override" heading → "Model profile override"), and reword the `size:` field description at `SKILL.md:207` from "model-tier signal" to "model-profile signal." Keep `tier=` accepted as a backward-compatible alias for `profile=` (parsed identically, resolves the same way) rather than a silent breaking rename, per this project's expand-contract discipline for shipped invocation grammar — document the alias explicitly in both files and record its removal condition (e.g. "drop the `tier=` alias at the next minor version once one full release cycle has passed with no reported use") rather than leaving it an indefinite, undocumented shim.
3. `skills/help/reference-card.md:13` — update the `/claude-tweaks:build` argument-hint column to match the renamed `profile=` token (with alias, same as Deliverable 2).
4. `skills/review/step3-debate-and-refutation.md:98` — move the reason clause inside the bracket to match the file's own Frontier-site grammar (`[Use: Capable — refutation agent. ...]`), removing the intra-file inconsistency.
5. `skills/tidy/SKILL.md:65` — optional: normalize the citation phrasing to match the ~20 other sites' standard form, if doing so doesn't lose the specific information that phrasing conveys; skip with a one-line note in the PR/commit if the standard form would actually lose precision here (the original filing already calls the current phrasing defensible).
6. Re-verify the four `docs/` sites named in the original filing are in fact clean (no retired grammar, no `tier=`/`model-tier` phrasing) before closing this record — if a build-time grep finds real content there after all (e.g. reintroduced by an intervening merge), fix it there too; otherwise no action needed on `docs/`.

## Acceptance Criteria

- [ ] A repo-wide grep for the retired bracket grammar — broadened beyond #222's own AC1 pattern (`\[Use: (Fast|Standard|Capable|Frontier) model\]`), which structurally misses the trailing-reason-before-bracket variant (`[Use: Standard model — reason]`) and any hyphenated `model-tier` form — returns zero hits in `skills/`, `agents/`, `bin/`, and `docs/`, except inside historical ledger/plan files that record past findings verbatim (those are records of history, not live vocabulary, and are out of scope for this record).
- [ ] `skills/_shared/multi-agent-coordination.md` has zero remaining bracket-annotation sites using the literal word "model" or an in-bracket-then-outside-bracket grammar mismatch.
- [ ] `/claude-tweaks:build`'s invocation grammar accepts `profile=<fast|standard|capable|frontier>` as the documented, canonical token in `skills/build/SKILL.md`, `skills/build/build-options.md`, and `skills/help/reference-card.md`, with `tier=<...>` still functioning identically as a documented alias carrying an explicit, recorded removal condition (not restated as a second independent code path — same resolution logic, two accepted spellings).
- [ ] `skills/review/step3-debate-and-refutation.md`'s Capable, Standard, and Frontier dispatch-site brackets all use the same in-bracket-reason grammar.
- [ ] The four originally-cited `docs/` sites are confirmed clean by a fresh grep at build time (or fixed, if the re-check finds real content after all) — this record does not close on an unverified assumption that they're already fine.
- [ ] `npm test` passes (prose-conformance suites over `skills/**/*.md` re-verify no stray retired-grammar tokens survived the edit).

## Technical Approach

Purely a text-editing task across markdown skill files plus one CLI-argument-parsing prose update (build's `$ARGUMENTS` grammar is itself markdown-authored instruction text, read and interpreted at invocation time — there is no compiled parser to change). No runtime code, hook, or schema changes. Work file-by-file per the Deliverables list; for each site, confirm the exact current line numbers with a fresh grep before editing (this record's own citations already drifted once between filing and shaping — don't trust the line numbers above without re-checking). For the `tier=`/`profile=` alias, keep the resolution logic identical for both spellings — this is a vocabulary/spelling change, not a behavior change, so the underlying `resolve-profile.js`/dispatch mechanics are untouched; only the accepted token spelling and the prose describing it change.

## Gotchas

- The acceptance grep must be broader than #222's own AC1 pattern from the start — that narrower pattern is what let three of #222's six tasks (plus its own closing sweep) discover trailing-reason-before-bracket and hyphenated-form residue only after the fact, live, rather than catching it in a single sweep. Don't repeat that mistake here.
- This record's own file/line citations had already drifted (or, in the four `docs/` sites' case, apparently resolved themselves via unrelated merges) between when it was filed and when it was shaped — re-verify every site fresh at build time rather than trusting the line numbers in this body.
- The `tier=` → `profile=` CLI token rename is a user-facing invocation-grammar change (something a human or an automation actually types), not an internal-only rename — treat it under this project's expand-contract discipline for shipped skill contracts: add `profile=`, keep `tier=` working as an alias with a stated removal condition, never a silent breaking rename that drops `tier=` outright in the same change.
- `skills/tidy/SKILL.md:65`'s bespoke phrasing was explicitly called "defensible" in the original filing — don't reflexively normalize it away if doing so loses real information; this is the one Deliverable in this record that's optional rather than a hard requirement.

## Original request

Residual model-selection 'tier' vocabulary outside #222's sweep scope

Related: #222, #216, #217, #220, #223

Context: #222's dispatch-site profile-vocabulary sweep replaced the retired `[Use: {Profile} model]` grammar with the bare `[Use: {Profile}]` form across skills/agents/bin, but couldn't touch files owned by other now-closed records (#217/#220/#223) or docs/ sites outside its `find skills agents bin` scan scope — #222's own final whole-branch review found real residue there and confirmed no other open record covers it.

Scope: skills/_shared/multi-agent-coordination.md:66,205 still carry the retired bracket grammar (owned by #220, closed); skills/build/SKILL.md + skills/build/build-options.md still expose the `tier=<fast|standard|capable|frontier>` CLI token and a "Model tier override" heading for this same axis (owned by #217/#223, both closed); four docs/ sites entirely outside #222's scan scope (docs/skill-authoring.md:102, docs/skill-graph.md:302/403, docs/plugin-structure.md:51, docs/journeys/resolve-dispatch-model-profile.md:36). Also fold in two related Minor findings: an intra-file grammar inconsistency in skills/review/step3-debate-and-refutation.md (line 98's Capable site uses bare `[Use: Capable] — reason` while lines 37/132's Frontier sites keep an in-bracket `[Use: Frontier — reason]` form), and a bespoke citation phrasing at skills/tidy/SKILL.md:65 (defensible, but a one-off variance across ~20 otherwise-consistent sites).

Gotcha: any successor sweep's acceptance grep must be broader than #222's own AC1 pattern (`\[Use: (Fast|Standard|Capable|Frontier) model\]`) from the start — that pattern structurally misses a trailing-reason-before-bracket variant (`[Use: Standard model — reason]`) and a hyphenated "model-tier" form, both of which #222 only caught live, after the fact, across three of its six tasks plus its closing sweep.

