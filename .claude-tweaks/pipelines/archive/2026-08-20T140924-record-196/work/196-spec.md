---
record: 196
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 196: Prior-art detection's grammar parsing lives entirely in prose no test reads

Surface: backend

## Current State

`skills/_shared/prior-art-detection.md` specifies real decision logic in prose only: parse a filename corpus for prefix, separator, numbering and zero-pad width; require at least 3 files agreeing before calling anything a convention; decide `plugin` / `project` / `conflict`; refuse to infer section shape from files at all. Follow-up to #187 (shipped in 6.64.0). The only part of that change with automated coverage is the `doc-convention.adr` policy key — one test asserting an enum shape. No test reads or exercises the prose parsing rules themselves; the compensating control is a whole-branch review, which catches drift once, at authoring time, and never again.

## Deliverables

- New module `bin/lib/doc-conventions/parse-grammar.js` exporting `parseGrammar(filenames) -> { prefix, separator, padWidth, agreeing, total } | null` — a pure function (filename array in, grammar struct out), no filesystem I/O inside it
- Test suite under `bin/lib/doc-conventions/tests/` pinning the corpora already in hand (see Acceptance Criteria)
- `package.json`'s test globs updated to include the new `bin/lib/doc-conventions/tests/` directory — an enumerated glob list does not pick up a new directory on its own (`[IL-84]`)
- `skills/_shared/prior-art-detection.md` updated so its parsing step calls the new module, leaving the plugin/project/conflict judgment call in prose unchanged

## Acceptance Criteria

- [ ] `parseGrammar(filenames)` returns `{prefix: 'ADR-', separator: '-', padWidth: 3, agreeing: 16, total: 16}` for a 16-file `ADR-016-slug.md`-style corpus
- [ ] returns the equivalent shape (no prefix, pad 4, `agreeing: 13, total: 13`) for a 13-file `0007-slug.md`-style corpus
- [ ] returns `null` for a 2-file corpus (under the 3-file floor)
- [ ] returns a non-null result with `agreeing: 9, total: 14` for a mixed 9/5-split corpus — the parser reports the split, it does not decide what to do with it
- [ ] returns `null` when no parseable numbering exists (never guesses)
- [ ] `npm test` output names the new `bin/lib/doc-conventions/tests/` suite, confirming it's picked up by the test globs
- [ ] `skills/_shared/prior-art-detection.md`'s parsing step is confirmed to route through `parseGrammar` rather than a parallel hand-rolled parse

## Technical Approach

Extract the already-prose-specified parsing rules into a small, pure function: directory listing in, grammar struct out — trivially testable since it takes a filename array rather than touching the filesystem. Keep the module strictly to the deterministic half (filename grammar). Do not extend it to section-shape parsing (see Gotchas); the judgment half — is this repo's convention worth deferring to — stays in `prior-art-detection.md`'s prose, unchanged.

## Gotchas

- **Scope boundary is load-bearing, not incidental.** A 16-ADR corpus was 16/16 consistent on filename grammar but only 9/5/2 on one heading's casing — filenames are reliably parseable, section headings are not. A helper that parsed both would make the unreliable half look as trustworthy as the reliable half, which is the exact failure this split exists to prevent. Do not generalize `parseGrammar` to cover section shape.
- `package.json`'s test globs are an enumerated list, not a recursive discovery mechanism — the new `bin/lib/doc-conventions/tests/` directory must be added explicitly or it silently never runs (`IL-84`).
- This is a coverage-gap fix, not a defect fix — there is no observed failure to reproduce; correctness is judged against the prose rules `prior-art-detection.md` already specifies.

## Original request

Prior-art detection's grammar parsing lives entirely in prose no test reads

Follow-up to #187 / 6.64.0. Not a defect — a coverage gap named at ship time rather than discovered later.

## The gap

`skills/_shared/prior-art-detection.md` specifies real decision logic in prose:

- parse a filename corpus for prefix, separator, numbering and zero-pad width
- require **at least 3 files agreeing** before calling anything a convention
- decide `plugin` / `project` / `conflict`
- refuse to infer section shape from files at all

The only part of the 6.64.0 change with automated coverage is the `doc-convention.adr` policy key — one test asserting an enum shape. Every rule above is an instruction an agent may follow, misread, or approximate, and **no test reads skill prose**. The compensating control shipped as a whole-branch review, which catches drift once, at authoring time, and never again.

## Why it is worth extracting

The parsing half is genuinely deterministic — directory listing in, grammar out — so it is the rare piece of a prose plugin that *can* be tested:

```
bin/lib/doc-conventions/parse-grammar.js
  parseGrammar(filenames) -> { prefix, separator, padWidth, agreeing, total } | null
```

Cases worth pinning, all drawn from real corpora already in hand:

| Input | Expected |
|---|---|
| 16x `ADR-016-slug.md` | prefix `ADR-`, sep `-`, pad 3, agreeing 16 |
| 13x `0007-slug.md` | no prefix, pad 4, agreeing 13 |
| 2 files only | `null` — under the 3-file floor |
| mixed 9/5 split | agreeing 9 of 14 — caller decides |
| no parseable numbering | `null`, not a guess |

The judgment half (is this repo's convention worth deferring to?) stays in prose, correctly.

## Constraint carried from the design

**Do not extend this to section shape.** The measured reason is in the contract: a 16-ADR corpus was 16/16 consistent on filename grammar and 9/5/2 on one heading's casing. Filenames are parseable; sections are not. A helper that parsed both would make the unreliable half look as trustworthy as the reliable half — the exact failure the split exists to prevent.

## Also

Add `bin/lib/doc-conventions/tests/` to `package.json`'s test globs in the same change — an enumerated glob list does not pick up a new directory on its own (`[IL-84]`).

