# ADR convention precedence — the plugin stays opinionated, and notices when reality disagrees

Design doc for #187. Written 2026-08-07.

## The report, and what verification changed about it

`_shared/decision-records.md:26` states `docs/decisions/NNNN-{kebab-slug}.md` as a fact.
A consuming repo (`memenu-app`) has sixteen ADRs named `ADR-{n}-{kebab-title}.md` and its
own committed `architecture-decision` project skill. The first time `/wrap-up` Step 6.2's
gate passes there, the directory gets a seventeenth file in a grammar matching neither the
other sixteen nor `docs/REGISTRY.md`'s index of them.

The issue offered five options and deliberately no recommendation. It also carried two
claims that were inferences rather than measurements. Both were checked against
`memenu-app` directly, and both were wrong in ways that changed the design.

### Claim 1 — "the gate's rarity is why this stayed hidden"

True for filenames, false as a general statement.

All 16 filenames follow the project's form, so the plugin has indeed never written a file
there. But `ADR-011` and `ADR-012` carry the plugin's *exact* metadata block — a
three-field bulleted list including `- **Context:**`, which the project skill's template
does not have at all:

| | Plugin (`diataxis-genre-templates.md`) | `memenu-app` skill | ADR-011 / ADR-012 |
|---|---|---|---|
| Metadata | `- **Status:** accepted`, `- **Date:**`, `- **Context:**` | `**Status:** Accepted`, `**Date:**` | **plugin form** |

So the plugin's template already reached that repo twice, without the gate ever firing.
The gate governs the *write*; it does not govern the *read*. A human or agent consults the
template and hand-authors the file, and the template's influence arrives with them.

Filename drift is self-correcting for a different reason entirely: when you save a file
into a directory you see its siblings, so the path gets fixed by eye. Section structure has
no visible neighbours at authoring time. **This is drift already in progress at 2/16, not
a latent hazard** — which raises urgency on the content dimension and lowers it on the
filename dimension, the reverse of the issue's framing.

### Claim 2 — "the same drift class may apply to section structure"

True, but not in the dimension named. `## Alternatives considered` casing *matches* — both
the plugin template and the project skill use lowercase. The real divergences are the H1
form (`# {NNNN}. {Title}` vs `# ADR-{n}: {Title}`), the metadata block, the `Status` value
casing, the supersede string (`superseded by NNNN` vs `Superseded by ADR-{N}`), and a
required trailing `Revisit this decision if:` clause the plugin only describes in prose.

The finding that actually constrains the design is about the *corpus*, not the templates:

| Dimension | Consistency across the 16 ADRs |
|---|---|
| Filename grammar | 16 / 16 |
| `## Context` | 16 / 16 |
| `## Decision` | 15 / 16 |
| `Alternatives` heading casing | 9 title-case, 5 lowercase, 2 absent |
| `Revisit this decision if:` clause | 5 / 16 |

**Corpus inference is reliable for filenames and unreliable for sections.** Any mechanism
that infers both the same way is confidently wrong on exactly the dimension already
drifting.

## The decision

The plugin stays opinionated. `docs/decisions/NNNN-{kebab-slug}.md` remains the house
convention, stated confidently, and `/init` starts scaffolding it rather than only
backlogging a pointer to it. Every project has decision records; the plugin should assume
that and enable it.

What being opinionated does *not* license is writing `0017-foo.md` into a directory holding
sixteen `ADR-016-...md` files. That does not make the repo match the plugin's convention —
it makes it match neither, with `REGISTRY.md` indexing two grammars. **The failure mode is
mixing, not deference.** So the plugin asserts its convention, notices when the target
directory disagrees, and makes the user resolve it once. That ends with the repo
consistent, which quietly conforming would not.

### Rejected alternatives

- **Assert and write anyway (issue option 1's inverse).** The most opinionated reading, and
  the cheapest. Rejected because it is the reported bug: the two-grammar directory still
  happens on the first passing gate.
- **Defer to the project whenever it has a convention (issue option 5).** The original
  draft of this design. Rejected on the maintainer's steer: a plugin that defers on every
  artifact it did not invent has no opinions left, and the native-vs-adopted split it
  rested on was the wrong axis.
- **Infer the convention silently (issue option 1).** Works for filenames (16/16), fails for
  sections (31–56%). Silent inference also gives the user no moment to notice.
- **A `policy.yml` grammar knob (issue option 2).** `policy.yml` parses flat `key: value`
  lines only — `review-diff-heuristic-thresholds` is already presence-only validated because
  its nested value has no flat encoding. A filename grammar plus a section shape lands in
  the same hole. (The key this design *does* add escapes that objection: it records which
  source wins, not the grammar.)
- **Migrate the corpus to the house form by default.** Guarantees one convention, but a
  16-file rename breaks `REGISTRY.md` rows, cross-doc references and docs-portal URLs.
  Available as an explicit choice; wrong as a default.

## Mechanism

### Detection runs off the rare path

The durable lesson from Claim 1 is not "the gate is rare" — it is that detection was welded
to the rarest write path in the plugin. Detection therefore runs in two places:

- **`/init --update`**, alongside its existing Config Home Drift check. Cheap, routine, and
  where drift checks already live. This is where the conflict should normally surface.
- **`/wrap-up` Step 6.2**, at write time, as the backstop for repos that never re-run init.

Either surface can record the answer. Wrap-up only asks if init never did.

### Trigger

`adr-convention` is unset **and** the target directory holds files whose grammar disagrees
with the plugin's. An empty or absent directory is not a conflict — the plugin writes its
own form and says nothing.

### The Console row

```
[adr] docs/decisions/ — convention conflict
  plugin form : 0017-slack-transport.md
  found (16)  : ADR-016-slack-integration-strategy.md

  1  Conform forward   — new files use plugin form        → adr-convention: plugin
  2  Migrate           — rename all 16 + fix REGISTRY refs
  3  Keep project form — record exception, stop asking    → adr-convention: project
```

Nothing is written until this is answered.

### Resolving "project form" at write time

Split by evidence quality, not by convenience:

| Aspect | Source | Why |
|---|---|---|
| Filename grammar, numbering | The corpus | 16/16 consistent; parse prefix, separator, zero-pad width |
| Section + metadata shape | The project skill, else the plugin skeleton | Corpus consistency is 31–56%; inference would be wrong |

Detecting the project skill reuses the frontmatter-description scan
`harness-health/library-shape-analysis.md` already specifies (glob `.claude/skills/*/SKILL.md`,
read `description` only), rather than inventing a lookup.

Corpus parsing requires **at least 3 files agreeing** on a grammar. Fewer, or a disagreement,
means stop and surface — a 1-file sample is exactly the case where inference misleads.

### Hard rules

- A computed path that already exists **stops the write**. No overwrite, ever.
- Migration runs only as an approved, itemized batch: `git mv`, then `REGISTRY.md` rows,
  then a repo-wide sweep of inbound links to the old basenames.
- The plugin never renames or renumbers anything outside an approved migration.

### The record

One new `policy.yml` key, matching the existing enum-with-no-default shape that
`execution.always` and `review-effort-floor` already use — unset is a meaningful third
state:

```js
{ key: 'adr-convention', type: 'enum', values: ['plugin', 'project'] }
```

| Value | Meaning |
|---|---|
| unset | Never asked. Detect and ask on conflict. |
| `plugin` | Conform forward. House form for new files; stop asking. |
| `project` | Resolve form from the project, per the table above; stop asking. |

The key is written *by* the plugin after one answer. It is never something a project must
fill in up front, which is the criticism that sank issue option 2.

## Files

| File | Change |
|---|---|
| `_shared/decision-records.md` | `## Location and filename` → house convention + resolution procedure; drop the duplicated status/supersede prose that drifted from the skeleton |
| `_shared/diataxis-genre-templates.md` | Sole owner of the literal form; point at `decision-records.md` for resolution |
| `wrap-up/config-updates.md` 6.2 | Detection + Console row; proposals carry resolved path *and* its source |
| `wrap-up/execution-and-verification.md` | Write the resolved path; migration execution procedure |
| `wrap-up/SKILL.md` Step 6 gate | Proposal-shape line |
| `init/docs-structure.md` | Scaffold `docs/decisions/`; detection hook; de-assert the ADR example |
| `_shared/policy-schema.md`, `bin/lib/policy-schema.js` | `adr-convention` |
| `tests/policy-schema.test.js` | Key coverage |
| `docs/decisions/0013-*.md` | This decision, in our own form |

### Consumers verified unaffected

`decision-records.md` has four consumers. Checked individually rather than assumed:

- `/challenge` — tags `[ADR-candidate]` in the brief, never writes. Unaffected.
- `/deepen` — tags `[ADR-candidate]` at Step 4, never writes. Unaffected.
- `/init` — flags the folder as a missing doc; changes here are additive (scaffolding).
- `/wrap-up` — the only writer. Carries the substance of this change.

`/docs-health` is a fifth reader worth naming because it looked like an enforcement risk and
is not: `criteria-docs-diataxis.md` judges ADRs by content shape and states that a
`decisions/` directory name is "a hint that raises attention, never a verdict." It would not
file a finding against a project's own correctly-formatted ADRs. No change needed.

## Not doing

- **Reconciling multiple ADR series.** `memenu-app` has `docs/decisions/` and
  `docs/infrastructure/decisions/` with independently incrementing numbers, so `ADR-004`
  through `ADR-006` each exist twice on different topics. Real, but the plugin targets one
  directory and should not guess which series a decision belongs to.
- **Inferring section structure from a corpus.** Measured at 31–56%; the evidence forbids it.
- **Normalizing the two already-drifted files** (`ADR-011`, `ADR-012`). They are the
  project's to fix; renaming or rewriting them is outside what this change is allowed to do.
- **A knob projects must configure.** `adr-convention` is written by the plugin, not required
  from the user.

## Why this is itself an ADR

Hard to reverse (it sets the precedent for every artifact the plugin writes into a repo it
did not create), surprising without context (the obvious reading of "be opinionated" is
"assert and write"), and a real trade-off (opinion versus not leaving a repo in a state
worse than either convention alone). Recorded as `docs/decisions/0013-*`.
