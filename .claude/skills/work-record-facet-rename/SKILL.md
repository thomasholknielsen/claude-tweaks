---
name: work-record-facet-rename
description: Use when renaming a work-record facet or its GitHub label in this repo — the emit/read split, the permanent legacy fallbacks, the label-bootstrap version bump, the emit-side rejection guard, the live-repo migration, and the repo-wide vocabulary sweep. Keywords - facet rename, label rename, LABELS, parseRecordFacets, parseFrontmatterLines, sharedFacetDefaults, LABELS_JSON, LABEL_BOOTSTRAP_VERSION, IL-85, migrate-then-delete.
---

# Work-record facet rename

How this repo renames a work-record facet and the GitHub label / frontmatter line that carries it. Three shipped instances define the recipe: `effort:*` → `size:*` (#217), `family:parent` → `parent-issue`, and `framing:baked` → `solution:unjustified` (#677). Each left a permanent read-side fallback behind; a fourth rename should follow the same layers in the same order.

## The layers, in commit order

1. **Drivers + shared shape (one commit, TDD).** `plugin/bin/lib/issues/facet-shape.js` `sharedFacetDefaults()` is the single place the facet key is renamed — both drivers inherit it, so a missed reader surfaces as an `undefined` facet, never a silent `false`. `plugin/bin/lib/issues/record.js`: add the new `LABELS` constant, keep the retired constant commented read-side-only, emit only the new label in `recordPayload`, and let `parseRecordFacets` accept either spelling through one OR branch into the single new key. `plugin/bin/lib/issues/local-store.js`: read the new frontmatter line into the facet and set a `sawNew` flag; the legacy line only fills a fallback variable applied after the loop and only when no new line was seen; `serializeFrontmatter` writes the new line only. Update `tests/bin-lib/issues/{record,local-store,backlog}.test.js` fixtures and add: both spellings parse; emit is new-only; frontmatter precedence in BOTH line orders; migrate-on-write drops the legacy line; the facets object has no old key.
2. **Label set + bootstrap version (one commit).** Swap the row in `plugin/skills/_shared/label-bootstrap.md`'s `LABELS_JSON` fence (description ≤ 100 chars — `tests/bin-lib/issues/labels.test.js` reads the fence and enforces the cap) and bump `LABEL_BOOTSTRAP_VERSION` in the same edit — without the bump, existing repos keep the stale marker and never re-provision the new label.
3. **Contract + producer/reader prose.** `plugin/skills/_shared/work-record.md` (taxonomy row, permission matrix, the `Retired names:` line), then every skill instruction that names the label or facet key (`plugin/skills/specify/*`, `plugin/skills/help/*`, `plugin/skills/backlog/*`, `plugin/skills/capture`, `plugin/skills/feedback`, …), then `docs/getting-started.md` and `docs/skill-graph.md`. Keep a deliberate "or its pre-rename spelling `X`" clause wherever a reader must still recognise old records.
4. **Journeys and launcher commands** — table column headings, `# ⚠` annotation lines and paste-ready `/claude-tweaks:*` commands each carry the vocabulary separately.
5. **Live-repo migration, last.** Re-read the label's live carriers and the label's own existence right before writing (a spec's carrier list is a hypothesis in a multi-session repo), add the new label to every carrier, verify, then delete the old label. Never delete first. Adopter repos are covered by the read-side fallbacks, never by migration.

## Project conventions

- **Emit one spelling, read two — forever.** Read-side fallbacks are PERMANENT cross-project support, commented `[IL-85]`-style ("removable only at a major version that drops pre-rename repo support"). `record.js` and `local-store.js` each carry all three today.
- **Held-aside precedence, not OR, in the frontmatter driver.** An explicit new line of either value must beat a legacy line whichever comes first; the OR form loses `new: false` + `legacy: true`.
- **The emit side rejects the retired parameter name.** `recordPayload` throws on `effort` and on `framing`, naming the field and the replacement, so a caller composing a payload from pre-rename facets fails loud instead of silently dropping the label. Add the guard for the newly retired name in the same commit as the rename.
- **Presence-only flags keep the "show the call without the flag" idiom** in `shaping-mode.md`'s `gh issue edit` block (`[IL-103]`) — document when to add the flag, never default it present.
- **Historical files keep the old spelling:** `CHANGELOG.md`, `docs/incident-log.md`, archived pipeline `work/*.md`, `docs/superpowers/plans/*`.

## Gotchas

- **The emit-side rejection guard is the step plans forget.** #677's plan carried every read fallback and no `framing` throw; the whole-branch review caught it.
- **Re-run the vocabulary sweep after every upstream merge.** Mid-run, merging `origin/main` brought in a brand-new file (`plugin/skills/backlog/refine-lanes.md`, from #655) carrying the retired spelling — a file no plan's file list could have named. The sweep grep: `grep -rn -i -E 'old:label|facets\.oldKey|oldline: (true|false)|OLD_CONST' plugin/bin plugin/skills docs/getting-started.md docs/skill-graph.md docs/journeys tests .claude/skills` — every hit must be a commented fallback, a test of one, or a named "pre-rename spelling" clause.
- **A dormant forward reference may already name the future spelling.** `backlog.js`'s `funnelBuckets` read `solutionUnjustified` behind a "pending #471" comment for weeks; the rename must un-dormant such consumers (retire the comment, update the prose that called them dormant), not merely swap strings.
- **The live label may already exist** (from a reverted build) with a stale description — `gh label create --force` aligns it to the canonical row; the bootstrap loop only creates and never updates.
- **Launcher commands must be runnable.** If a rename un-dormants a paste-line launcher, check the target skill accepts the form (`/claude-tweaks:challenge #N` did not exist; `--lens=1 #N` did).

## Evidence

- #677: commits `45716d42` (drivers), `dc5e90f6` (label set + bootstrap 2→3), `d74f1d51` (taxonomy + producer/reader skills), `5426d41e` (backlog overview/refine + docs), `7aab94c1` (`recordPayload` framing rejection + migrate-on-write coverage); merge `d65b3375` landed `refine-lanes.md` mid-run.
- Earlier instances: `record.js`'s `effort:*` (#217) and `family:parent` fallbacks.
