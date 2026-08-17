---
record: 677
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 677: Rename framing:baked → solution:unjustified

Surface: backend

## Current State

`framing:baked` is the presence-only label `/claude-tweaks:specify` stamps (via `/claude-tweaks:challenge`'s `framing-check`) on a record whose named solution was never traded off. #471 (closed, `demo:approved`) decided to rename it `solution:unjustified` — the old name caused confusion during #471's own brainstorm, and the new one names the actual defect (missing justification) rather than a vague "framing". #475 was the rename sub-issue: it shipped in `a271206c`, was reverted wholesale in `e1d6e124` (a session that recovered unauthored uncommitted state and chose removal), and PR #505's full restore was closed unmerged. Everything else from that decomposition has since re-landed on its own — `needs:definition` in v6.85.0, `/backlog attention` gave way to the overview funnel's needs-you lane. The rename is the one piece `main` still awaits.

Concretely, on `main` today:

- `bin/lib/issues/record.js` — `LABELS.FRAMING_BAKED = 'framing:baked'`; `recordPayload({ framing })` emits it between `ceremony:*` and `ready`; `parseRecordFacets` sets `facets.framing = true` on it.
- `bin/lib/issues/facet-shape.js` — `sharedFacetDefaults()` carries `framing: false`.
- `bin/lib/issues/local-store.js` — `parseFrontmatterLines` reads `framing: true|false`; `serializeFrontmatter` writes `framing: true`.
- `bin/lib/issues/backlog.js` `funnelBuckets` — already reads `f.solutionUnjustified === true` for the needs-you overlay's `kind: 'unjustified'`, on the *expected* post-rename key, with a comment block (~lines 205-215) and #471-citing tests (`tests/bin-lib/issues/backlog.test.js` ~398-425) as the reconciliation tripwire. No driver ever sets that key, so that half of the lane is dormant.
- `skills/backlog/overview-mode.md` — line ~250 describes the batch-emitter's `# ⚠ #{N} solution:unjustified — one-line evidence call pending` annotation as dormant "pending #471's `framing:baked` → `solution:unjustified` rename"; line ~354 carries the same interim caveat for the needs-you lane's `kind: 'unjustified'` launcher, whose planned form `/claude-tweaks:challenge #{N}` is not an input `skills/challenge/SKILL.md` accepts (it takes only `framing-check` or `--lens=<n> <target>`).
- `skills/_shared/label-bootstrap.md` — `LABELS_JSON` carries `["framing:baked", "Framing: this record names a solution that was never traded off"]`; `LABEL_BOOTSTRAP_VERSION` is `2`.
- `skills/_shared/work-record.md` — Label taxonomy row `Framing (1) | framing:baked | …` and the `/specify` permission-matrix row.
- Skill prose naming the label or `facets.framing`: `skills/specify/shaping-mode.md`, `skills/specify/record-creation.md`, `skills/backlog/refine-mode.md` (Framing column), `skills/help/status-scan.md`, `skills/help/context-flow.md`, `skills/capture/SKILL.md`, `skills/feedback/SKILL.md`. Docs: `docs/getting-started.md`, `docs/skill-graph.md`.
- Tests pinning the old spelling: `tests/bin-lib/issues/labels.test.js`, `record.test.js`, `local-store.test.js`, and `backlog.test.js` fixtures.
- Live repo state: the `framing:baked` label exists on this repo and is carried by two open issues (#397, #210); the repo's bootstrap marker is `claude-tweaks:bootstrapped-v1` (already behind the documented `2`).

## Deliverables

- [ ] `bin/lib/issues/record.js`: add `LABELS.SOLUTION_UNJUSTIFIED = 'solution:unjustified'`; `recordPayload` takes `solutionUnjustified` (not `framing`) and emits the new label in the same emission slot; `parseRecordFacets` sets `facets.solutionUnjustified = true` on `solution:unjustified` **and** — permanent read-side fallback with an `[IL-85]`-style comment — on `framing:baked`. `LABELS.FRAMING_BAKED` stays exported only as the legacy read-side constant (commented as such); no emit path writes it again. *(Built, Beneficial deviation applied at architecture alignment: `recordPayload` also rejects a pre-rename `framing` parameter with an error naming the field — mirroring the existing `effort` rejection — so an inline caller composing from pre-rename facets fails loud instead of silently dropping the label; the final whole-branch review found the gap.)*
- [ ] `bin/lib/issues/facet-shape.js`: `framing: false` → `solutionUnjustified: false`.
- [ ] `bin/lib/issues/local-store.js`: read `solution-unjustified: true|false`; permanent read-side fallback for a legacy `framing: true|false` line with held-aside precedence (an explicit `solution-unjustified:` line of either value wins; the legacy value applies only when no new line was seen — the same idiom as the `effort:` fallback); write `solution-unjustified: true` only.
- [ ] `bin/lib/issues/backlog.js`: retire the "solutionUnjustified is still the EXPECTED post-#471 name … dormant" comment block — the key is now live on both drivers; the read itself is unchanged.
- [ ] `skills/_shared/label-bootstrap.md`: `LABELS_JSON` entry becomes `["solution:unjustified", "<description ≤ 100 chars>"]` and `framing:baked` leaves the array; bump `LABEL_BOOTSTRAP_VERSION` `2` → `3` in both the prose "current value" and the literal.
- [ ] `skills/_shared/work-record.md`: taxonomy row `Framing (1) | framing:baked` → `Justification (1) | solution:unjustified | …` (axis name is the builder's call; the label spelling is not), the `/specify` permission-matrix row, and any other mention.
- [ ] Skill prose — every instruction that names the label or the facet key: `skills/specify/shaping-mode.md` (Framing bullet, both `gh issue edit` flag paragraphs, the local-files `facets.framing` sentences), `skills/specify/record-creation.md`, `skills/backlog/refine-mode.md` (Framing column reads `solution:unjustified` / `facets.solutionUnjustified === true`), `skills/help/status-scan.md`, `skills/help/context-flow.md`, `skills/capture/SKILL.md`, `skills/feedback/SKILL.md`.
- [ ] `skills/backlog/overview-mode.md`: (a) ~line 250 — un-dormant the annotation line: it renders whenever a `solutionUnjustified` record appears in a paste block; the "today that is every repo … pending #471's rename" clause goes, and the citation becomes #677 (this record) as the landing. (b) ~line 354 and the launcher bullet at ~347 — with the facet live, the `kind: 'unjustified'` row now renders, so its command MUST be one `/challenge` accepts today: change the launcher to `/claude-tweaks:challenge --lens=1 #{N}` (Lens 1, Surface Hidden Assumptions — the human's evidence pass; that mode's own Next Actions route to `/claude-tweaks:specify #{N}`, which re-runs `framing-check` and clears the label on an `open` verdict), with the `#`-comment `# solution:unjustified — one-line evidence-or-accept-risk call; re-run /claude-tweaks:specify #{N} to clear`. Drop the "dormant until #471's facet exists" caveat. Update any doc line that describes the launcher's bare form (`docs/getting-started.md`) to match.
- [ ] Docs: `docs/getting-started.md`, `docs/skill-graph.md` — every `framing:baked` mention → `solution:unjustified`. `docs/incident-log.md`, `CHANGELOG.md`, archived pipeline `work/*.md`, and `docs/superpowers/plans/*` are history and keep the old spelling.
- [ ] Tests: `tests/bin-lib/issues/labels.test.js` (new label bootstrappable within the cap; `LABELS.SOLUTION_UNJUSTIFIED` exported; `LABELS.FRAMING_BAKED` still exported as legacy), `record.test.js` (emit new label; parse new label; parse legacy `framing:baked` → `solutionUnjustified: true`; emission-order array; default false), `local-store.test.js` (round-trip `solution-unjustified: true`; legacy `framing: true` reads back as `solutionUnjustified: true`; explicit new line beats a legacy line; `false` writes no line), `backlog.test.js` (test names and comments no longer say "expected #471 key"; every fixture default `framing:` → `solutionUnjustified:`).
- [ ] Live-repo migration on this repo via `gh` (last step, after the code is committed): ensure `solution:unjustified` exists, add it to #397 and #210, then delete the `framing:baked` label from the repo. Other repos' records are covered by the read-side fallbacks, never by migration. *(Built, Beneficial deviation applied at architecture alignment: `solution:unjustified` already existed on the repo with an older description — aligned to the canonical row via `gh label create --force`; a third carrier, #691, shaped the same day by the installed build, was migrated alongside #397/#210 rather than losing its marker on the delete.)*

## Acceptance Criteria

1. `git grep -n -i -E 'framing:baked|facets\.framing|framing: (true|false)|FRAMING_BAKED' -- bin skills docs/getting-started.md docs/skill-graph.md tests` returns only the explicitly-commented read-side fallback lines in `record.js` and `local-store.js` and the tests that exercise them — no emit path, no skill instruction, no doc description names the old spelling.
2. `parseRecordFacets(['solution:unjustified']).solutionUnjustified === true` **and** `parseRecordFacets(['framing:baked']).solutionUnjustified === true`; `sharedFacetDefaults()` has `solutionUnjustified: false` and no `framing` key.
3. `recordPayload({ …, ceremony: 'standard', solutionUnjustified: true, ready: true, priority: 'high' })` emits `[…, 'ceremony:standard', 'solution:unjustified', 'ready', 'priority:high']`; `framing:baked` is never emitted by any code path.
4. local-files: `writeRecord` with `solutionUnjustified: true` writes a `solution-unjustified: true` line and nothing spelled `framing:`; a file carrying only a legacy `framing: true` line reads back `solutionUnjustified: true`; a file with `framing: true` and `solution-unjustified: false` reads back `false`.
5. `funnelBuckets`' unjustified-overlay tests pass with unchanged behavior; the `backlog.js` dormancy comment and the "expected #471 key" test wording are gone.
6. `label-bootstrap.md`'s `LABELS_JSON` lists `solution:unjustified` and not `framing:baked`, its description is ≤ 100 chars (`labels.test.js` enforces via `canonicalLabelsFromBootstrapDoc`), and `LABEL_BOOTSTRAP_VERSION` reads `3` in both places.
7. `overview-mode.md` no longer describes the annotation line or the unjustified launcher as dormant, and the launcher command it emits is an input form `skills/challenge/SKILL.md` accepts.
8. On this repo: `gh label list --search "solution:unjustified"` shows the label; #397 and #210 carry it; `gh label list --search "framing:baked"` returns nothing.
9. `npm test` is green.

## Technical Approach

The rename portion of the reverted commit `a271206c` (`git show a271206c -- bin/lib/issues/record.js bin/lib/issues/local-store.js bin/lib/issues/facet-shape.js`) is a working reference for the driver mechanics: the `solutionUnjustified` key, the OR-parse in `record.js`, the held-aside legacy precedence in `local-store.js`. Re-derive against current `main` rather than cherry-picking — the tests have since moved to `tests/bin-lib/issues/`, `needs:definition` now sits beside the framing branches in both drivers, and `a271206c` also carried out-of-scope work (bounded evidence search, `/backlog attention`, `needs:definition` producers).

Order: drivers + `facet-shape.js` + their tests first (`node --test tests/bin-lib/issues/`), then the two `_shared` contract files, then skill prose and docs, then `overview-mode.md`'s un-dormanting, and the live-repo label migration last — it is the only step outside the tree, and it should follow the commit that teaches the readers the new label.

## Gotchas

- Expand-contract on a shipped contract: the label is read from other repos' records. Both read-side fallbacks (`framing:baked` label, `framing:` frontmatter line) are permanent, `[IL-85]`-style — never removed by this record. The emit side is new-spelling-only.
- `[IL-102]`/`[IL-103]` (`docs/incident-log.md`): this flag's common case is absence. Keep shaping-mode's `gh issue edit` block showing the call *without* the flag and documenting when to add it; do not re-import the tiered-facet "show it, document when to omit" idiom while renaming.
- Out of scope, deliberately (from #471/#475): the bounded in-process evidence search before stamping, and any change to *when* the label fires — `framing-check`'s judgment is untouched. This is a rename plus the un-dormanting it mechanically unlocks.
- The needs-you launcher change is a judgment call made here, not by #471: `/challenge` has no bare-`#N` mode, so shipping `/claude-tweaks:challenge #{N}` would emit a command that fails at invocation. `--lens=1 #{N}` is the closest form that exists today. If a dedicated evidence-or-accept-risk mode for `/challenge` is wanted, that is a separate record; this one keeps every emitted line runnable.
- Migration order on the live repo: add `solution:unjustified` to #397 and #210 *before* deleting `framing:baked` — deleting first strips the signal from both issues with nothing replacing it. Bootstrap only creates labels; the delete is a manual `gh label delete`.
- The repo's live marker is `bootstrapped-v1` while the doc says `2`; after the bump to `3` the next consumer's preflight re-runs the full create loop, which is how `solution:unjustified` normally arrives on a repo — but on this repo the migration step above should not wait for that.

## Original request

Rename framing:baked → solution:unjustified

**Related:** #471, #505

Context: PR #505's full restore was superseded — needs:definition re-landed in v6.85.0 and /backlog attention gave way to the overview funnel's needs-you lane; this rename is the one piece main still awaits (overview-mode.md:250 keeps solutionUnjustified dormant pending #471's rename).

Scope: rename the label and facet key across bin/lib, skills, docs, and tests; bump LABEL_BOOTSTRAP_VERSION; un-dormant overview-mode's solution:unjustified annotation line and update its #471 citation.
