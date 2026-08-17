---
record: 702
origin: capture
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 702: specify: argument-hint documents single-ref grammar but a session asserted comma-list batch support without verifying
Surface: backend

## Current State

`/claude-tweaks:specify`'s argument grammar is single-ref: `skills/specify/SKILL.md`'s frontmatter `argument-hint` reads `<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface ...] [--granularity ...] [--chained]`, its `## Input` section documents "the first argument is a work record reference (`#N`, an issue URL, or a bare local record id)", and Resolve-the-input case 1 fetches exactly one record (`gh issue view {n}` / `readRecord(path)`) before entering shaping mode (`skills/specify/shaping-mode.md`). Nothing in either file names a comma-list form, so `/claude-tweaks:specify #701,#702` is undefined behavior: the leading `#701,#702` token matches neither `#N` nor a path nor a topic cleanly, and the skill fails ambiguously rather than either batching or rejecting.

By contrast `/claude-tweaks:flow` explicitly documents `<#n>[,#m,#o]` in its `argument-hint`, its `## Input` resolution ("comma-joined, no spaces"), and `skills/flow/multi-spec.md`; `skills/flow/materialize.md`'s Resolution section resolves each ref independently and in parallel and gates every record before acting on any of them. A session, asked for a runnable `/specify` command over several records, handed the user a comma-list invocation and asserted "it takes multiple refs" without reading either file — the same session that filed this record.

The direction was decided by comment on this record (2026-08-16): add comma-list batch support to `/specify` mirroring `/flow`'s form, rather than making `/specify` reject a comma list.

Two things are missing today:

1. `/specify` has no multi-record shaping path — no grammar for it, no resolution branch, no per-record write loop, no Next Actions row for "several records shaped".
2. No project rule requires that a runnable command handed to the user be checked against the target skill's `argument-hint` before it is reported. `docs/skill-authoring.md`'s Skill handoffs convention governs what a skill's own `## Next Actions` renders; nothing governs a session composing a command ad hoc in conversation.

## Deliverables

1. **`skills/specify/SKILL.md` — comma-list grammar.** `argument-hint` becomes `<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <web|mobile|desktop|backend|infra|terminal>] [--granularity <fine|standard|coarse>] [--chained]`. `## Input` documents the batch form: comma-joined, no spaces, mirroring `/flow`'s convention; every element must be a record reference (`#N`, or a bare id under `work-backend: local-files`) — a comma list containing a path or topic is rejected with a one-line error naming the offending element (a comma list is shaping-mode-only; decomposition and topic resolution stay single-input). Resolve-the-input case 1 gains the batch branch: split on `,`, resolve every element independently (parallel fetches, as `flow/materialize.md`'s Resolution does), report every unresolvable element in one message before shaping any of them, then enter shaping mode with the full set. `phase-N` and `--granularity` are ignored on a comma list exactly as they already are for a single record reference; `--surface` applies to every record in the batch (already the documented semantics of "every record this run produces"); `--chained` on a comma list is rejected — the flag is ignored with a one-line notice (the flag bullet's existing posture for every unsupported input shape) and the batch still shapes and renders Next Actions; `/claude-tweaks:capture`'s born-ready chain shapes exactly one record per invocation and that contract does not change here. The examples block gains one comma-list line.

2. **`skills/specify/shaping-mode.md` — per-record loop.** The procedure states, once, how it iterates: resolve all → shape each record independently (its own five sections + `## Original request`, its own metadata block, its own scoring/ceremony/framing/type stamps, its own compose-then-write-once call). Interactive decisions raised per record — Step 2.5c's design-intent question when a record sniffs frontend — collapse into one batch table with recommendations pre-filled followed by one `AskUserQuestion` for apply-all/override, per the Interaction style directive, never one call per record — every record's surface is sniffed before the loop starts so that single question resolves once, up front. The Actions Performed table renders one row per record. A failure shaping record k does not roll back records 1..k-1 (each write already landed via the API / on disk); the failure is reported per record and the remaining records still shape.

3. **`skills/specify/SKILL.md` — Next Actions row.** The Situation table gains "Shaping mode — multiple records shaped in place" → `/claude-tweaks:flow #{N1},#{N2},...` sequential pipeline **(Recommended)**, `/claude-tweaks:flow #{N1}` pipeline just the first, `/claude-tweaks:help`. Rendered as plain markdown per the existing terminal convention; under `work-backend: local-files` drop the `#` as the existing note already says.

4. **`skills/help/reference-card.md`** — the `/claude-tweaks:specify` row's Takes cell updated to the new `argument-hint`, byte-identical (`tests/reference-card-argument-hint.test.js` pins this).

5. **`docs/donts.md` — one new untagged rule** in the convention block near the top (alongside "Don't add 'What's Next?' navigation menus…"): "Don't hand the user a runnable `/claude-tweaks:{skill}` command whose argument form you haven't checked against that skill's `argument-hint` (or its `## Input` section) in the same turn — a confidently-worded invocation in an unsupported grammar fails at the user's prompt, after they've pasted it". No `[IL-nn]` tag and no incident-log entry: this is a session-conduct convention like the untagged rules it sits with, not a build post-mortem.

6. **Tests.** `tests/argument-hint-input.test.js` and `tests/reference-card-argument-hint.test.js` already pin hint↔Input and hint↔card sync and must stay green with the new grammar. Add one assertion (in `tests/skill-conventions.test.js` or a new `tests/specify-batch-input.test.js`) that `skills/specify/SKILL.md`'s `## Input` section documents the comma-list form (contains the literal `#N[,#M...]` leaf and the phrase "comma-joined") and that `shaping-mode.md` names the per-record loop (contains "one row per record") — a prose-pin so a later slimming pass cannot silently drop the batch path.

## Acceptance Criteria

- `grep -n "argument-hint" skills/specify/SKILL.md` shows `<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title>` as the first bracket group.
- `skills/specify/SKILL.md`'s `## Input` section contains the phrase "comma-joined" and states that a comma list is shaping-mode-only, that a non-record element is rejected, and that `--chained` on a comma list is rejected.
- `skills/specify/SKILL.md`'s Resolve-the-input case 1 describes independent, parallel per-element resolution with all-at-once reporting of unresolvable elements.
- `skills/specify/shaping-mode.md` states the per-record loop, the batched design-intent decision (one table + one `AskUserQuestion`), one Actions Performed row per record, and no rollback on partial failure.
- `skills/specify/SKILL.md`'s Next Actions Situation table has a "multiple records shaped in place" row whose recommended command is `/claude-tweaks:flow #{N1},#{N2},...`.
- `skills/help/reference-card.md`'s `/claude-tweaks:specify` Takes cell equals the new `argument-hint` verbatim.
- `docs/donts.md` contains one new untagged rule beginning "Don't hand the user a runnable" that names `argument-hint`.
- `node --test tests/argument-hint-input.test.js tests/reference-card-argument-hint.test.js tests/skill-conventions.test.js` passes, plus the new prose-pin assertion; `npm test` is green.
- `wc -c skills/specify/SKILL.md` and `skills/specify/shaping-mode.md` each stay under the 40 KB soft ceiling (currently ~20.5 KB and ~12.2 KB).
- No literal placeholder tokens are introduced anywhere in the touched skill files.

## Technical Approach

Mirror `/flow`, don't invent: reuse `flow/materialize.md`'s Resolution wording for "resolve independently, in parallel, report every failure in one message" and `/flow`'s "comma-joined, no spaces" grammar phrasing so the two skills read the same to a user. Keep the batch branch as an extension of case 1 (record reference), not a sixth resolution case — the input is still a record reference, there are just several. In `shaping-mode.md`, add the loop as a short framing paragraph at the top plus one sentence at each per-record decision point rather than duplicating the procedure; the write step already says "compose-then-write-once" per record, so only the iteration and the batched-decision rule are new text. `docs/skill-graph.md` needs no new edge between skills — but its three existing `/specify` rows, the skill's own opening line, `docs/plugin-structure.md`, `docs/getting-started.md`, and `record-creation.md` still described shaping mode as "a single record"; those are reworded to one-or-more / per-shaped-record (wording only). Version bump is release-time (`node bin/release.js minor`), not part of this build.

## Gotchas

- `tests/reference-card-argument-hint.test.js` has an empty allowlist by design (refs #564) — the reference-card cell must be byte-identical to the hint, pipes escaped as `\|` inside the table cell exactly as the current row does.
- `tests/argument-hint-input.test.js` checks every `|`-leaf of each top-level bracket group appears literally in `## Input`; the new leaf `#N[,#M...]` (with its nested brackets) must appear as that exact substring in the `## Input` prose, not paraphrased.
- Placeholder-token hygiene: `_shared/work-record.md`'s spec-shaped-body check greps for placeholder tokens with no context sensitivity — do not mention them by name in the new prose.
- Under `work-backend: local-files` each shaped record is a tracked file — the batch path commits once per record (or one commit for the batch; either is acceptable, state which in shaping-mode.md), never leaves some records written and uncommitted.
- Do not extend `--chained` to batches — `/claude-tweaks:capture`'s born-ready chain is single-record by contract and `_shared/autonomy-ceiling.md` describes it that way.
- The record's original scope named a second option (reject comma lists with a pointer to one-per-invocation); the comment on the record chose batch support. Do not implement both.

## Original request

specify: argument-hint documents single-ref grammar but a session asserted comma-list batch support without verifying

**Related:** none

Context: Asked for a runnable /claude-tweaks:specify command, a session handed the user a comma-list invocation and asserted "it takes multiple refs" without any Read/Grep verification -- specify's own argument-hint documents a single-ref grammar with no comma-list form (unlike /flow, which explicitly documents "#42,#45,#48").

Scope: Definition needed -- two open directions: (a) add comma-list batch support to specify's Input resolution and argument-hint, mirroring flow/multi-spec.md, or (b) make specify reject a comma list with an explicit "one record per invocation; use --chained" error instead of failing ambiguously. Separately, add a rule requiring any handed-to-the-user runnable command's argument form be checked against that skill's argument-hint in the same turn before being reported.
