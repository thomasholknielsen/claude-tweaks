# 0013. Plugin doc conventions detect prior art before writing

- **Status:** accepted
- **Date:** 2026-08-07
- **Context:** #187 — an ADR filename convention conflicting silently with a consuming repo's own

> **Naming note (6.68.1).** This record's title and filename say "prior art"; the contract it
> decided is now `_shared/existing-convention-detection.md`, and the concept is "the repo's
> existing convention". Both are unchanged here on purpose — an accepted decision record is
> dated evidence of what was decided and in what words, superseded rather than edited. The
> decision itself is untouched by the rename.

> **Naming note (6.108.0).** The Decision section below records the answer key as
> `doc-convention.{genre}`. That dotted spelling was renamed to `doc-convention-{genre}`
> (dash, matching this schema's flat kebab-case keys) in the naming-convention rename program;
> `doc-convention.adr` now resolves only via the legacy alias in `bin/lib/policy-schema.js`'s
> `RENAMED_KEYS` (removal condition: `_shared/policy-deprecations.md`). Unchanged here for the
> same reason as the note above — read `doc-convention-{genre}` as current.

## Context

`_shared/decision-records.md` stated `docs/decisions/NNNN-{kebab-slug}.md` as a fact. A consuming repo had sixteen ADRs named `ADR-{n}-{kebab-title}.md`, its own committed `architecture-decision` skill, and a `docs/REGISTRY.md` indexing them. The first passing ADR gate there would have produced a seventeenth file in a grammar matching neither the other sixteen nor the registry.

Two things were measured rather than assumed. The gate's rarity protected only the filename dimension: two of the sixteen files already carry the plugin's exact metadata block, so the template reaches a repo through humans reading it, not only through the write path. And corpus consistency differs sharply by dimension — 16/16 on filename grammar against 9/5/2 on one heading's casing — so a mechanism inferring both the same way is confidently wrong on the dimension already drifting.

The plugin had no representation anywhere of "this repo already has its own standard for this genre." ADRs surfaced it first because decision records are the genre with the most prior art.

## Decision

The plugin stays opinionated: its genre conventions remain the default, stated confidently. Before a doc-creating path writes into a genre that declares detection, it compares its intended form against what the repo already does, and surfaces any conflict once at the Review Console — conform forward, migrate, or keep the project's form — recording the answer in `doc-convention.{genre}`.

## Alternatives considered

- **Assert and write anyway** — the most opinionated reading and the cheapest, but it is the reported bug: the two-grammar directory still happens on the first passing gate.
- **Defer wherever a project has a convention** — a plugin that defers on every artifact it did not invent has no opinions left, and the native-versus-adopted axis it rested on described where conflicts are *possible*, not who should win.
- **Infer the convention silently** — works for filenames, fails for sections, and gives the user no moment to notice.
- **A `policy.yml` grammar knob** — `policy.yml` parses flat lines only; a grammar plus a section shape has no flat encoding, the same hole `review-diff-heuristic-thresholds` already sits in. The key that shipped records which source wins, not a form, which is what keeps it flat.
- **Migrate by default** — guarantees one convention, but a sixteen-file rename breaks registry rows, cross-doc references and portal URLs. Kept as an explicit choice, rejected as a default.
- **Have `/init` scaffold the directory** — contradicts a thrice-stated invariant that `/init` creates only `docs/REGISTRY.md`. `/init` is an assessor, not a writer.

## Consequences

The plugin's conventions stay the default and get stated more confidently than before, because they no longer have to double as a guess about the repo. A repo with no decision records, or one already matching, never sees a prompt. A repo that disagrees is asked once, and the answer persists.

The cost is one comparison on a rare path, and a genre declaration table that must stay honest: a row claiming detection without a consumer is a promise nothing keeps, so wiring a genre means adding its consumer and its policy key in the same change. The Review Console also gains its first per-item row that lives inside a batch section, which its numbering and Approve-all rules had to be amended to cover.

Revisit this decision if: a second genre needs detection and the corpus-versus-project-skill split proves wrong for it; if the three-way Console choice turns out to be answered inconsistently across repos; or if `policy.yml` gains nested values, at which point recording a form directly becomes possible and the which-source-wins indirection may no longer earn its keep.
