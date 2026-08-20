# Existing-Convention Detection for Documentation Genres

Canonical contract for the question no doc-creating path used to ask: **does this repo already have its own convention for the genre I am about to write?**

Read by `/claude-tweaks:wrap-up`'s Decision records curation row (`wrap-up/adr-curation.md`) before it proposes an ADR path, `/claude-tweaks:wrap-up`'s Docs curation row (`wrap-up/docs-health-integration.md` D2) before it proposes a path for one of the four core Diátaxis genres, and `/claude-tweaks:journeys` Step 2 before it writes a new journey file. The per-genre declarations it keys off live in `_shared/diataxis-genre-templates.md`.

## Why this exists

The plugin is opinionated about documentation, and should be — its genre conventions are the standard. What it cannot know from outside is whether a repo already had one.

Writing `0017-foo.md` into a directory holding sixteen `ADR-016-...md` files does not make that repo match the plugin's convention. It makes it match neither, with `docs/REGISTRY.md` indexing two grammars. **The failure mode is mixing, not deference.**

Detection does not weaken the opinion. It decides whether the standard lands as a new file or as a migration, and makes the one bad outcome visible before it happens rather than after.

## When this runs

Before a doc-creating path proposes or writes a file in a genre whose declaration in `_shared/diataxis-genre-templates.md` marks detection **active**.

Skip entirely when that genre's answer is already recorded in `.claude-tweaks/policy.yml` — the question was asked and answered, and re-raising it is exactly the mid-flow stop `_shared/auto-mode-contract.md` forbids.

## Procedure

1. **Glob** the intended directory plus the genre's declared aliases.
2. **Fewer than 3 files — no existing convention.** Use the plugin's form and emit nothing. An empty or near-empty directory cannot establish a convention, and a one-file sample is exactly where inference misleads.
3. **Parse** the filenames for a grammar via `bin/lib/doc-conventions/parse-grammar.js`'s `parseGrammar(filenames)` — prefix, separator, numbering, zero-pad width, and how many files agree on it. It returns `null` below the 3-file floor or when nothing in the corpus carries parseable numbering; otherwise a `{ prefix, separator, padWidth, agreeing, total }` struct. The module reports the split — it does not decide what the split means. A conflict requires **at least 3 files agreeing** on a grammar that differs from the plugin's. Fewer agreeing, or no parseable grammar, is not a conflict — proceed with the plugin's form.
4. **Look for a project skill** covering the genre: glob `.claude/skills/*/SKILL.md` and read only each file's frontmatter `description` — the same cheap pass `harness-health/library-shape-analysis.md` specifies, not a full-body read. A description matching the genre's declared keywords means that skill states the project's convention for **shape**.
5. **Emit a conflict record** carrying: genre, the plugin's form, the found form, one sample filename, the file count, and the project-skill path when one was found.

Outcomes are `plugin` (no existing convention, or one that agrees), `project` (a recorded answer says defer), or `conflict` (the repo's existing convention disagrees and nothing is recorded yet).

## Resolving "project form"

Split by evidence quality, not convenience. These two dimensions do not have comparable support and must not be inferred the same way.

| Aspect | Source | Why |
|---|---|---|
| Filename, location, numbering | The existing corpus | A grammar is mechanically parseable, and a corpus that has one is near-uniform by nature |
| Section and metadata shape | The project skill; the plugin's skeleton when there is none | Section structure drifts within a corpus far faster than filenames do — never infer it from files |

The measured case behind that split: a 16-ADR corpus was 16/16 consistent on filename grammar and 9/5/2 on one heading's casing, with only 5 of 16 carrying a clause its own project skill requires. The same read that gets filenames right gets sections confidently wrong.

## Hard rules

- A computed path that **already exists stops the write**. Never overwrite, and never silently pick the next free name.
- Migration runs only as an **approved, itemized batch**: `git mv` each file, rewrite `docs/REGISTRY.md` rows, then sweep the repo for inbound links to the old basenames.
- Nothing is renamed or renumbered outside an approved migration.
- Section shape is never inferred from a corpus.
- Detection **reads only**. It never writes a file, and never writes the policy key — the approval surface does that.

## Recording the answer

One flat enum key per genre in `.claude-tweaks/policy.yml`, written by the plugin after the user answers once. Never something a project fills in up front. See `_shared/policy-schema.md`'s Documentation section for the key list.

| Value | Meaning |
|---|---|
| unset | Never asked — run detection. |
| `plugin` | Conform forward: the plugin's form for new files. Stop asking. |
| `project` | Resolve form from the project per the table above. Stop asking. |

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Inferring a convention from one or two files | A one-file sample is not a convention — the grammar extracted from it is as likely to be that file's accident |
| Inferring section shape from the corpus | Measured at 31-56% self-consistency where filenames were 100%; the same read produces a confident wrong answer |
| Writing the file and noting the conflict afterward | The point is to be asked before the directory holds two grammars, not after |
| Renaming existing files to match the plugin outside an approved migration | Inbound links, registry rows and portal URLs break silently |
| Re-raising a genre whose answer is already recorded | A set key means the user decided; re-asking every wrap-up is a forbidden mid-flow stop |
| Treating "the plugin has an opinion" as "detection is unnecessary" | The opinion is the default either way; detection only decides how it lands |
