# Record-batch input grammar

Cited by `/claude-tweaks:flow`, `/claude-tweaks:dispatch`, `/claude-tweaks:specify`, and
`/claude-tweaks:demo` — the four skills whose first argument accepts a comma-separated list
of work-record references. States the grammar **only**: notation, tokenization, and element
classification. It deliberately does not state what happens after classification —
resolution-failure handling and execution shape (sequential loop / group-expansion fan-out /
pipeline) genuinely differ per consumer (`/dispatch`'s fan-out and `/demo`'s never-fan-out
loop cannot share one rule) — those stay in each consumer's own prose; see "Out of scope"
below.

## Notation

`#N[,#M...]` — one or more work-record references, comma-joined. `#701` (single) or
`#701,#702,#703` (batch). Under `work-backend: github-issues`, each element carries the `#`
sigil; under `work-backend: local-files`, the sigil is dropped and each element is a bare
record id (`701,702`). This is the literal form every consuming skill's `argument-hint` and
`## Input` grammar sentence uses — spell it exactly `#N[,#M...]`, never `<#n>[,#m,#o]`,
`#<n>[,#<m>...]`, or any other variant.

## Tokenization

Split the input on `,`. Trim surrounding whitespace from each resulting element — a space
after a comma is tolerated (`#41, #42` and `#41,#42` are equivalent); no spaces are required.

## Element classification

Classify the tokenized elements before attempting to resolve any of them:

- **Every element is a record reference** (matches the Notation form for the active
  `work-backend`) → the input is a **batch**.
- **No element is a record reference** → the input is **not a list at all** — it is ordinary
  free text (a topic, a design-doc path, or whatever else the consumer's own input grammar
  accepts), and falls through to that consumer's own non-batch handling. A bare string that
  happens to contain a comma (e.g. a topic like "auth, login flow") is neither a batch nor an
  error under this rule.
- **Some but not all elements are record references** → a **mixed list**, a hard input error.
  Name every offending element in the report; never silently drop it and continue past this
  classification step without reporting it. Two offense shapes get canonical names:
  - a non-record-reference element (`docs/x-design.md`, `meal planning`, `notanumber`) is
    named `'{element}' is not a record reference` — a consumer may append its own trailing
    clause naming what else is accepted standalone (e.g. "give a design doc or topic on its
    own");
  - an **empty element** — a trailing comma (`#41,`), a leading comma, or two commas in a row
    — is named `empty element after #{prev}` (or, when there is no preceding element, by the
    consumer's own equivalent wording for "nothing before the first comma").

## Out of scope (consumer-owned)

This contract stops at classification. Everything after it is each consumer's own
**execution semantics**, stated explicitly in that consumer's own `## Input`/`## Syntax`
prose — required, and never unified here:

- **What happens to a classification failure.** Whether a mixed list or empty element stops
  the whole invocation before anything runs (`/specify`, `/flow`), or is reported and the
  invocation proceeds with only the valid elements (`/dispatch`), is a per-consumer decision.
- **What happens to a syntactically-valid element that fails to resolve** — record not found,
  wrong repo, no grant, already claimed. This also varies: an all-or-nothing hard stop in
  `/specify`/`/flow`, versus a per-element report-and-continue in `/dispatch`/`/demo`. Each
  consumer's own "Record not found" / "Per-item failure isolation" prose is the source of
  truth for its own behavior; this file does not restate it.
- **Execution shape** — sequential loop (`/specify`, `/demo`), group-expansion fan-out
  (`/dispatch`), or pipeline (`/flow`).
- Selector verbs (`next` and similar) and any range/expansion form (`/specify`'s `#A-#B`) are
  per-skill grammar extensions outside this contract's scope; this file governs the
  comma-list form only.
