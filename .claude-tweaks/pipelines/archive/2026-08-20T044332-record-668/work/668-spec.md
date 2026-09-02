---
record: 668
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 668: Pin the Manifesto lever enumerations to manifesto.md's canonical numbering line with a conformance test

Surface: backend

## Current State

The set of 12 Manifesto policy levers is restated by hand across five prose files:

- `skills/flow/manifesto.md` — the "**Canonical lever numbering**" line (`1=Mode, 2=Scope-creep, ..., 12=Design critique.`), the illustrative Policy Levers table, and the `config.yml` example block. This file is the canonical source of truth.
- `skills/_shared/auto-mode-contract.md` — the Bookend Architecture section's "computed all policy levers" prose list.
- `skills/flow/SKILL.md` — Step 3's levers-computed sentence.
- `skills/help/reference-card.md` — the Pipeline Config Manifesto reference-card row.
- `skills/help/context-flow.md` — the `config.yml` consumer row.

Nothing keeps these five restatements in sync automatically. `_shared/auto-mode-contract.md`'s own "Adding a new policy lever" checklist documents a five-file update procedure, and it exists because it was needed: adding lever 12 (`design-critique`) missed all four non-canonical files until a whole-branch review caught it by reading, and lever 11's addition (#559) needed a dedicated "lever checklist" commit for the same reason. The checklist's own text says "a zero-hit file that should have one is the failure mode this checklist exists to prevent" — a prose rule doing a test's job.

This repo already has a house pattern for exactly this shape of drift: `tests/policy-schema-metadata.test.js` pins a prose enumeration in `skills/_shared/policy-schema.md` against a canonical source (there, a JS constant; here, a prose line). Several other `tests/*-conformance.test.js` files establish the same "read live skill prose, pin it against a canonical source" pattern (`tests/wrap-up-registry-pin.test.js`, `tests/hooks-gate-coverage.test.js`) — reading live prose is the correct choice specifically because updating the four target files IS the intended response when a lever changes (not a case that calls for a frozen fixture).

## Deliverables

- A new test file, `tests/manifesto-lever-conformance.test.js`, that:
  1. Reads `skills/flow/manifesto.md` and parses the "**Canonical lever numbering**" line into its ordered list of 12 `N=Name` pairs (e.g. `1=Mode`, ..., `12=Design critique`).
  2. Reads the same file's `config.yml` example block (inside the "On approval" section's fenced ```yaml``` snippet) and extracts the ordered list of lever config keys from it, stopping before the trailing non-lever bookkeeping keys `spec:` and `created:`.
  3. Asserts both ordered lists have length 12 (fails loud, with a clear message, if either count drifts — this is the test's own self-check that it is still reading the right anchors).
  4. Builds a `{leverName -> kebabConfigKey}` map by **positional zip** of the two ordered lists (lever N's name pairs with the Nth config key) — not by mechanically kebab-casing the lever name (see Gotchas for why that would be wrong).
  5. For each of the four target files (`skills/_shared/auto-mode-contract.md`, `skills/flow/SKILL.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`), asserts every one of the 12 kebab-case config keys appears as a literal substring in that file's text — one assertion per (file, key) pair, with a failure message naming both the file and the missing key.
- A header comment in the new test file citing the `[IL-80]` live-vs-fixture rationale from `skill-prose-conformance-tests` (read-live-prose is correct here because updating the four target files is the intended response to a lever change) and naming `tests/wrap-up-registry-pin.test.js` / `tests/hooks-gate-coverage.test.js` as the sibling instances of the same pattern.

## Acceptance Criteria

1. `node --test tests/manifesto-lever-conformance.test.js` passes as written against the current repo state — all five files already carry the full 12-lever set today, so this is a coverage addition, not a fix for existing drift.
2. The test is verified able to go red before being considered done: during implementation, temporarily remove one lever's key from one target file (e.g. delete `design-critique` from `skills/help/context-flow.md`'s `config.yml` consumer row), re-run the new test file in isolation, confirm it fails with a message naming that file and that key, then revert the temporary edit. This negative-control step is a verification action, not a permanent test artifact.
3. Full `npm test` passes, including the new file — `find tests tools/upstream-drift/tests -name '*.test.js'` auto-discovers it; no registration step is needed anywhere.
4. No content in any of the five prose files (`skills/flow/manifesto.md`, `skills/_shared/auto-mode-contract.md`, `skills/flow/SKILL.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`) is edited by this change — all five already enumerate all 12 levers correctly today; this record adds test coverage only.

## Technical Approach

- Parse the canonical numbering line via a regex anchored on the literal `**Canonical lever numbering**` token (per `skill-prose-conformance-tests`'s "anchor on a literal token the skill already uses" convention), splitting the `1=Mode, 2=Scope-creep, ..., 12=Design critique` sequence on `, `.
- Parse the `config.yml` example block by locating the fenced snippet in the "On approval" section (search for the literal token `mode: auto` as the fence's first content line, or scope by the fence markers themselves) and reading each `{key}:` line in file order, stopping at (excluding) the `spec:` line.
- Zip positionally, not by name transformation. Verify both ordered lists are length 12 with `assert.strictEqual` before zipping, so a future 13th lever added to only one of the two lists in `manifesto.md` itself fails loud immediately rather than silently zipping short or producing an off-by-one map.
- For the per-file substring checks, `fs.readFileSync` each of the four target files once, then loop the 12 keys against each file's content with `assert.ok(content.includes(key), '{file}: missing key "{key}"')` — one assertion per (file, key) pair so a failure pinpoints exactly what's missing where, rather than one aggregate assertion per file.
- Follow this repo's `tests/*-conformance.test.js` naming convention (`deferral-gate-conformance.test.js`, `integration-branch-conformance.test.js`, `merge-verification-gate-conformance.test.js`, `record-queue-fetch-conformance.test.js` are the existing siblings) for the new file's name.

## Gotchas

- **The lever-name-to-config-key mapping is not a mechanical kebab-case transform.** Lever 5's name in the numbering line is "Leftover routing," but its actual `config.yml` key is `leftover-default` (not `leftover-routing`) — visible directly in `manifesto.md`'s own example block (`leftover-default: defer`). A naive `name.toLowerCase().replace(/ /g, '-')` transform would produce `leftover-routing`, which appears nowhere in any of the four target files, and the test would either false-fail on a key nobody enumerates or (worse) silently check for the wrong string and never catch a real drift on that lever. The positional zip against the `config.yml` example's own key order sidesteps this entirely — implement it that way, not via name transformation, even though transformation works for the other 11 levers.
- `manifesto.md`'s `config.yml` example block carries two trailing keys, `spec:` and `created:`, that are NOT policy levers (they're per-run bookkeeping). The key-extraction step must stop before those two lines, or the "both lists are length 12" self-check will never pass and the test will fail on its own precondition rather than on real drift.
- Per `skill-prose-conformance-tests`, this test must read the five files live at test-run time — never freeze any of them as a fixture. The whole point of this record is catching drift the instant it's introduced when a future lever is added; a frozen fixture would defeat that purpose and pin the corpus at today's (already-correct) state forever.
- Do not use this record as an opportunity to "improve" or reformat any of the five prose files, even if something else looks slightly off while reading them closely — this is a coverage-only, test-file-only change. File any unrelated finding separately via `/claude-tweaks:capture`.

## Original request

Pin the Manifesto lever enumerations to manifesto.md's canonical numbering line with a conformance test

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** hindsight mode, `/claude-tweaks:review` of #595 (run `2026-08-16T160107-spec-597-595-598-599-601`)
**Files:** skills/flow/manifesto.md, skills/_shared/auto-mode-contract.md, skills/flow/SKILL.md, skills/help/reference-card.md, skills/help/context-flow.md

## Finding

The set of Manifesto levers is restated by hand in five prose files — `flow/manifesto.md`'s canonical numbering line plus the four enumerations `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist names (`auto-mode-contract.md`, `flow/SKILL.md`, `help/reference-card.md`, `help/context-flow.md`). Adding lever 12 (`design-critique`) missed all four until the whole-branch review caught it by reading; #559 (lever 11) needed a dedicated "lever checklist" commit for the same reason. The checklist itself says "a zero-hit file that should have one is the failure mode this checklist exists to prevent" — a prose rule doing a test's job.

## Suggested resolution

Add a `tests/` conformance test that parses the numbering line in `skills/flow/manifesto.md` (`N=Name` pairs) into the lever set, maps each to its kebab-case config key, and asserts every key appears in each of the four enumeration files (and that `manifesto.md`'s config.yml example carries a line for it). Same prose↔constant pin pattern as `tests/policy-schema-metadata.test.js`.
