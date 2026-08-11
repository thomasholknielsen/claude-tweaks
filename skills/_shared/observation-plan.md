# Observation Plan — Schema and Authoring Rules

Canonical definition of the `### Observation plan` section of a Verification Brief. The
producer (`skills/wrap-up/verification-brief.md` Step 2) authors one per record at wrap-up
time; `/claude-tweaks:demo` Step 2 executes it show-first; demo's session-recall path
composes one directly from recall. Both cite this file — the schema and per-kind semantics
are stated once, here.

## Schema

```markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run, or the diff range for `diff`}
- Prepare: {one command per `-` sub-bullet, or `none`}
- Inspect: {one pointer per `-` sub-bullet — what to open/run and what to look for;
  a flow pointer may carry one indented `Regenerate: {command}` continuation line}
```

## Grammar rules

- One Prepare command per `-` sub-bullet; `Prepare: none` when nothing needs running first.
- One Inspect pointer per `-` sub-bullet.
- `Regenerate:` attaches to its Inspect pointer as an indented continuation line, at most
  one per pointer.

## Per-kind semantics

- `rendered-page` — Entry point is the changed page's deep link, never the site root.
- `app-route` — Entry point is the affected route; state-seeding commands go in Prepare.
- `cli` — Entry point is the invocation; Prepare is usually `none`; the command's output is
  the outcome to observe.
- `flow` — Entry point is the flow's own invocation or first artifact; Prepare usually
  `none`; one Inspect pointer per verdict-relevant intermediate, ordered by stage.
- `diff` — the floor: Entry point is the diff range; Prepare `none`; Inspect optional.

## Choosing the kind (authoring rules + precedence)

The builder picks the kind by judgment from what the run actually did — not from a path
classifier. Precedence rule: when any changed path is UI, route, or rendered-content code,
`app-route`/`rendered-page` take precedence — choosing `cli`/`flow`/`diff` anyway requires
a one-line justification written into the plan's own text.
