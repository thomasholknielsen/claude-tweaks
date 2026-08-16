# Prior-art detection for documentation genres

Design doc. Written 2026-08-07. Supersedes and absorbs
`2026-08-07-adr-convention-precedence-design.md`, which becomes Phase 1 (#187).

Status: specified — Phase 1 shipped (#187, v6.62.0); later phases unscheduled.

> **Naming note (6.64.3).** This document, and the plan it feeds, call the contract
> `_shared/prior-art-detection.md` and use "prior art" for the concept. Both were renamed
> shortly after shipping — the file is `_shared/existing-convention-detection.md`, and the
> concept is "the repo's existing convention". The term was patent-law jargon that did not
> survive first contact with a reader. The text below is left as written, as a dated design
> doc should be; only this pointer is current.

## The gap

claude-tweaks has a coherent documentation posture already — verified, not assumed:

| Role | Skills | Contract |
|---|---|---|
| Detectors | `/code-health`, `/docs-health`, `/harness-health`, `/journey-health` | All four state "never edits"; every finding files as a GitHub issue |
| Assessor | `/init` | Creates `docs/REGISTRY.md` only — "existing docs only — missing docs are not added until they're created". Everything else backlogs a work record |
| Writers | `/wrap-up`, `/journeys`, `/visualize` | `/wrap-up` is the general one: ADRs, missing-doc scaffolding from `diataxis-genre-templates.md`, REGISTRY rows, CLAUDE.md, rules — all gated by the Review Console |

Detect in many places, write in one, after approval. That separation is deliberate and
this design does not disturb it.

What the system has no representation of is **"this repo already has its own standard for
this genre."** Not in the genre templates, not in the missing-doc detectors, not in any
write path. ADRs are where it surfaced first, and predictably: decision records are the one
genre with decades of prior art, so they are the one where a repo is likeliest to have a
convention before claude-tweaks arrives.

### The surface already exists; the comparison does not

`/wrap-up` already routes every proposed doc path through the Review Console —
`[adr] docs/decisions/NNNN-{slug}.md — {title}` from Step 6.2, and
`[doc] {new-file-path} — Create: {rationale}` from D2. So "propose rather than write, and
show the filename" is **already implemented**, and it still did not catch the conflict in
`memenu-app`.

It failed because the row shows a proposal with nothing to compare it against. A human
skimming a batch table sees `docs/decisions/0017-foo.md` and has no reason to doubt it
unless they happen to remember the repo's other sixteen files are named `ADR-016-...`.

**The missing piece is the delta, not the surface.** That makes this change smaller than it
first appears: no new approval mechanism, no new config file, no new user-facing step. One
comparison, rendered into rows that already exist.

### Two things checked and found already handled

Both were candidate problems that turned out not to be, and are recorded so a later reader
does not re-open them:

- **Duplicate-doc creation.** D2's bar is already "zero existing doc coverage **anywhere**
  in the project — not merely a small change that doesn't match a registry Auto-detect
  pattern." It will not scaffold `docs/architecture.md` over an existing
  `docs/design/system-overview.md`.
- **`/docs-health` enforcing the plugin's ADR shape.** `criteria-docs-diataxis.md` judges
  ADRs by content shape and states that a `decisions/` directory name is "a hint that
  raises attention, never a verdict." It would not file findings against a project's own
  correctly-formatted ADRs.

## Evidence

Measured against `memenu-app` (16 ADRs, its own committed `architecture-decision` skill),
because the issue's version of both claims was inference:

**Drift is already in progress, and not where the report expected.** All 16 filenames follow
the project's form, so the plugin has never written a file there. But `ADR-011` and `ADR-012`
carry the plugin's exact three-field bulleted metadata block, including a `- **Context:**`
line the project's own template does not have. The gate governs the write; it does not
govern the read. A human consults the template and hand-authors the file, and the template's
influence arrives with them.

Filename drift is self-correcting for an unrelated reason: saving a file into a directory
shows you its siblings. Section structure has no visible neighbours at authoring time.

**Corpus consistency differs sharply by dimension**, which constrains what may be inferred:

| Dimension | Consistency across the 16 |
|---|---|
| Filename grammar | 16 / 16 |
| `## Context` | 16 / 16 |
| `## Decision` | 15 / 16 |
| `Alternatives` heading casing | 9 title-case, 5 lowercase, 2 absent |
| `Revisit this decision if:` clause | 5 / 16 |

Inference is reliable for filenames and unreliable for sections. Any mechanism treating both
the same way is confidently wrong on exactly the dimension already drifting.

## The decision

**The plugin stays opinionated.** Its genre conventions are the standard, stated
confidently. Prior-art detection does not weaken that — it decides whether the standard
lands as a new file or as a migration, and prevents the one outcome nobody wants: two
standards in one directory, with `REGISTRY.md` indexing both.

Writing `0017-foo.md` beside sixteen `ADR-016-...md` files does not make the repo match the
plugin's convention. It makes it match neither. **The failure mode is mixing, not
deference.**

### Rejected

- **Assert and write anyway.** Cheapest, most opinionated reading. It is the reported bug.
- **Defer wherever a project has a convention.** An earlier draft. A plugin that defers on
  every artifact it did not invent has no opinions left.
- **Silent inference.** Works for filenames, fails for sections, and gives the user no
  moment to notice.
- **A `policy.yml` grammar knob.** `policy.yml` parses flat `key: value` lines only;
  `review-diff-heuristic-thresholds` is already presence-only validated because its nested
  value has no flat encoding. The key this design adds records *which source wins*, not a
  grammar, so it stays flat.
- **Migrating by default.** A 16-file rename breaks `REGISTRY.md` rows, cross-doc references
  and docs-portal URLs. Available as an explicit choice; wrong as a default.
- **`/init` scaffolding `docs/decisions/`.** Contradicts a thrice-stated invariant
  (`decision-records.md:3`, `:41`, `docs-structure.md:122`) that `/init` creates only
  `docs/REGISTRY.md`. `/init` is an assessor, not a writer. Its role here is audit only.

## The contract

New shared file `skills/_shared/prior-art-detection.md`. Any path about to create a doc
resolves the genre's **effective convention** first.

### Inputs

Genre, intended directory, the plugin's default grammar for that genre.

### Procedure

1. **Glob** the intended directory plus that genre's known aliases (for ADR:
   `docs/decisions/`, `docs/adr/`, `docs/rfcs/`).
2. **Under 3 files → no prior art.** Use the plugin's form, emit nothing. An empty or
   near-empty directory cannot establish a convention, and a 1-file sample is exactly where
   inference misleads.
3. **Parse** filenames for a grammar: prefix, separator, numbering, zero-pad width. If at
   least 3 agree *and* the result differs from the plugin's → **conflict**.
4. **Look for a project skill** covering the genre, via the frontmatter-`description` scan
   `harness-health/library-shape-analysis.md` already specifies (glob
   `.claude/skills/*/SKILL.md`, read descriptions only). Its stated template is the
   project's declared convention for **shape**.
5. **Emit a conflict record:** genre, plugin form, found form, a sample filename, the file
   count, and the project-skill path if one was found.

### Resolving "project form"

Split by evidence quality, not convenience:

| Aspect | Source | Why |
|---|---|---|
| Filename, location, numbering | The corpus | 16/16 consistent; a grammar is mechanically parseable |
| Section and metadata shape | The project skill, else the plugin skeleton | Corpus consistency is 31–56%; inference would be wrong |

### Hard rules

- A computed path that already exists **stops the write**. No overwrite, ever.
- Migration runs only as an approved, itemized batch: `git mv`, then `REGISTRY.md` rows,
  then a repo-wide sweep of inbound links to the old basenames.
- Nothing is renamed or renumbered outside an approved migration.
- Sections are never inferred from a corpus — only from a project skill.

## Genre declarations

`diataxis-genre-templates.md` gains a per-genre declaration, so a consumer reads what a
genre claims rather than special-casing:

| Genre | Plugin owns filename | Detection | What detection answers |
|---|---|---|---|
| Tutorial | no | yes | Where do docs of this genre actually live, and what are they called |
| How-To | no | yes | same |
| Reference | no | yes | same |
| Explanation | no | yes | same |
| Journey | `docs/journeys/{name}.md` | yes | grammar + location |
| ADR | `docs/decisions/NNNN-{kebab-slug}.md` | yes | grammar + location + shape |

For the four Diátaxis genres the plugin prescribes content, not filenames, so detection
answers a weaker but still useful question: D2 infers a path such as
`docs/guides/deploying-to-staging.md`, and prior art says whether this repo files how-tos
under `docs/guides/` or `docs/how-to/`, and whether its files are named
`deploy-staging.md` or `NN-deploy-staging.md`.

## The record

Flat kebab-case enum keys, matching `harness-health-scoped-rule-budget` and the naming
convention in `skills/_shared/policy-key-naming.md` (no dots) and the
`execution.always` precedent for an enum with **no default** — unset is a meaningful third
state:

```js
{ key: 'doc-convention-adr', type: 'enum', values: ['plugin', 'project'] },
{ key: 'doc-convention-journey', type: 'enum', values: ['plugin', 'project'] },
{ key: 'doc-convention-howto', type: 'enum', values: ['plugin', 'project'] },
{ key: 'doc-convention-reference', type: 'enum', values: ['plugin', 'project'] },
{ key: 'doc-convention-explanation', type: 'enum', values: ['plugin', 'project'] },
{ key: 'doc-convention-tutorial', type: 'enum', values: ['plugin', 'project'] },
```

| Value | Meaning |
|---|---|
| unset | Never asked. Detect and surface on conflict. |
| `plugin` | Conform forward: house form for new files; stop asking. |
| `project` | Resolve form from the project per the table above; stop asking. |

Written *by* the plugin after one answer. Never something a project must fill in up front.

## The Console row

Rendered into the sections that already exist — Configuration updates for ADR,
Documentation updates for D2 — as an enriched row, not a new section:

```
[adr] docs/decisions/ — convention conflict
  plugin form : 0017-slack-transport.md
  found (16)  : ADR-016-slack-integration-strategy.md
  project skill: .claude/skills/architecture-decision/SKILL.md

  1  Conform forward   — new files use plugin form        → doc-convention-adr: plugin
  2  Migrate           — rename all 16 + fix REGISTRY refs
  3  Keep project form — record exception, stop asking    → doc-convention-adr: project
```

Nothing is written until answered.

## Phasing

Two phases, each independently shippable and testable.

**Phase 1 — the contract and its first consumer (closes #187).**
`_shared/prior-art-detection.md`, the genre declarations, `doc-convention-adr`, wrap-up
Step 6.2 detection, the Console row, the migration procedure, and de-asserting
`decision-records.md`. Ships a working conflict mechanism for the genre where the problem is
live.

**Phase 2 — the remaining consumers.**
D2 missing-doc scaffolding (the other five genres), `/journeys` Step 2, and `/init --update`'s
read-only repo-wide audit reporting which genres have prior art the plugin would collide
with. Depends on Phase 1's contract existing; nothing in Phase 1 depends on it.

## Files

**Phase 1**

| File | Change |
|---|---|
| `_shared/prior-art-detection.md` | New — the contract |
| `_shared/diataxis-genre-templates.md` | Genre declarations; ADR skeleton becomes sole owner of the literal form |
| `_shared/decision-records.md` | `## Location and filename` → house convention + cite the contract; drop the duplicated status/supersede prose that drifted from the skeleton |
| `wrap-up/config-updates.md` | 6.2 runs detection; row carries resolved path *and* source |
| `wrap-up/execution-and-verification.md` | Write the resolved path; migration procedure |
| `wrap-up/review-console.md` | Conflict-row rendering |
| `wrap-up/SKILL.md` | Step 6 gate line |
| `_shared/policy-schema.md`, `bin/lib/policy-schema.js` | `doc-convention-*` |
| `tests/policy-schema.test.js` | Key coverage |
| `docs/skill-graph.md` | Edges for the new `_shared` contract |
| `docs/decisions/0013-*.md` | This decision, in our own form |

**Phase 2**

| File | Change |
|---|---|
| `wrap-up/docs-health-integration.md` | D2 runs detection before proposing a path |
| `journeys/SKILL.md` | Step 2 runs detection before creating |
| `init/docs-structure.md` | Phase 8.5 audit (read-only); de-assert the ADR example |

### Consumers verified unaffected

`decision-records.md` has **three** consumers, checked individually:

- `/deepen` — tags `[ADR-candidate]` at Step 4, never writes.
- `/init` — Phase 1 does not touch it; Phase 2 adds a read-only audit.
- `/wrap-up` — the only writer; carries the substance.

**Not four.** The issue and this design's first draft both said four, counting
`/claude-tweaks:challenge`. It was removed as a consumer upstream while this spec was being
written: `challenge/SKILL.md` no longer mentions `[ADR-candidate]` at all, and
`decision-records.md`'s own header and who-reads-who-writes table dropped its rows. Anything
downstream still assuming a `/challenge`-tagged ADR candidate reaches Step 6.2 is assuming a
producer that no longer exists.

## Not doing

- **Reconciling multiple ADR series.** `memenu-app` has `docs/decisions/` and
  `docs/infrastructure/decisions/` with independently incrementing numbers, so `ADR-004`
  through `ADR-006` each exist twice. Real, but the plugin targets one directory and should
  not guess which series a decision belongs to.
- **Normalizing the two already-drifted files** (`ADR-011`, `ADR-012`). The project's to fix.
- **Changing `/init` into a writer.** It audits and reports; the invariant stands.
- **Splitting Step 9's standalone summary template.** Already declared out of scope by
  `docs-health-integration.md`'s own closing Gotcha; unchanged here.
