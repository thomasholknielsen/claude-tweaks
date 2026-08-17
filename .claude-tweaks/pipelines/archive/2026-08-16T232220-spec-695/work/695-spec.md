---
record: 695
origin: capture
risk: low
size: medium
ceremony: standard
grants: []
surface: terminal
---
# 695: specify + demo: accept a #N,#M batch argument so tidy's Yours groups collapse to one paste line

Surface: terminal

## Current State

`/claude-tweaks:specify` and `/claude-tweaks:demo` each take exactly one record reference per invocation:

- `skills/specify/SKILL.md` — `argument-hint: "<#N|record-id|design-doc-path|topic|backlog-title> [phase-N] [--surface <…>] [--granularity <…>] [--chained]"`. Resolve-the-input case 1 fetches one `#N` / URL / bare local id and enters shaping mode (`shaping-mode.md`) for that single record. `## Next Actions` has a "Shaping mode — one record shaped in place" row and no multi-record shaping row (the multi-record rows all describe decomposition output).
- `skills/demo/SKILL.md` — `argument-hint: "[#N]"`. `## Input` documents *(none)* → session-recall and `#N` → single-record lookup; Step 1 is literally titled "Resolve the one item" and `entry-paths.md` has two branches (no-arguments, `#N` given). Step 2 walks one Verification Brief; Step 3 applies one verdict.

Both are consumers of `/claude-tweaks:tidy`'s Yours section. Under #685 (in flight, PR #699), Yours groups records by the command the human runs and renders one batch invocation at the group head **only where the target skill's `argument-hint` accepts multiple refs** — `/claude-tweaks:flow #n,#m` and `/claude-tweaks:dispatch #N,#M` do; `/specify` and `/demo` do not, so their groups fall back to a consecutive paste block, one command per record. Observed 2026-08-16: 3 of the 4 largest Yours groups (wake-parked ×7 → `specify`, re-shape stubs ×5 → `specify`, acceptance-gap ×10 → `demo`) targeted a single-ref skill — 22 paste lines that would be 3 with a batch form.

Two pinning tests bound the change: `tests/argument-hint-input.test.js` requires every `|`-leaf of each `[...]` group in a skill's `argument-hint` to appear literally in its `## Input` section, and `tests/reference-card-argument-hint.test.js` requires `skills/help/reference-card.md`'s Takes column to be byte-identical to the skill's `argument-hint` (allowlist deliberately empty). `skills/specify/SKILL.md` is ~20.5 KB and `skills/demo/SKILL.md` ~27.8 KB against the 40 KB ceiling — room to add without slimming.

## Deliverables

**A — `/claude-tweaks:specify` accepts `#N,#M[,...]` (shaping mode only)** — `skills/specify/SKILL.md` (frontmatter, `## Input`, Resolve-the-input case 1, `## Next Actions`), `skills/specify/shaping-mode.md` (Actions Performed):

- `argument-hint` becomes `"<#N[,#M...]|record-id[,id...]|design-doc-path|topic|backlog-title> [phase-N] [--surface <…>] [--granularity <…>] [--chained]"` (flags unchanged).
- `## Input` states the batch rule: a comma-separated list of record references (`#N,#M`, or bare local ids `12,14`; no spaces — a space after a comma is tolerated and trimmed) resolves every element through case 1 and runs shaping mode once per record, **in list order, sequentially** — each record gets the full single-record procedure (compose, ceremony-check, framing-check, one design-intent question when a frontend sniff fires, one compose-then-write-once call). No cross-record merging, no shared body, no batched label calls.
- Batch applies to record references only. A list containing a design-doc path, topic, or backlog title element (anything case 1 rejects) is a hard input error: stop before touching any record and report the offending element — never partially shape the valid prefix. `phase-N`/`--granularity` are ignored for a ref list exactly as for a single ref; `--surface` applies to every record in the list; `--chained` is accepted on a list (capture's born-ready chain only ever passes one ref, so this is documented as permitted-but-unused, not a new caller).
- Per-record failure isolation: a ref that fails to fetch (closed/missing/404) is reported in the run summary and skipped; the remaining refs still shape. The Actions Performed table renders one row per attempted ref with outcome (`shaped` / `already shaped, no-op` / `skipped: {reason}`).
- `## Next Actions` gains a row **"Shaping mode — multiple records shaped in place"**: 1. `/claude-tweaks:flow #{N1},#{N2},...` sequential pipeline for every shaped record **(Recommended)**; 2. `/claude-tweaks:flow #{N1}` first record only; 3. `/claude-tweaks:help`. Skipped refs never appear in the recommended command.

**B — `/claude-tweaks:demo` accepts `#N[,#M...]`** — `skills/demo/SKILL.md` (frontmatter, `## Input`, Step 1, Step 3, `## Next Actions`), `skills/demo/entry-paths.md` (`#N` branch intro):

- `argument-hint` becomes `"[#N[,#M...]]"`.
- `## Input` and Step 1 state: a comma-separated ref list is an explicit human-supplied list, iterated in order — for each ref, run the `#N` entry path (Step 1) → Step 2 walkthrough → Step 3 verdict application **to completion before starting the next ref**, so a batch aborted mid-way has already applied every verdict given so far and lost nothing. One Verdict `AskUserQuestion` per item, never a combined verdict — stated with an explicit precedence clause over the byte-pinned Interaction-style directive's "Multi-item → batch table" line (a verdict is the judgment being collected, not a recommendation to confirm); the same clause appears in `/specify`'s batch paragraph for its per-element design-intent question. The scope-fork checkpoint (Step 2) stops once per item, not once per session — a batch resets it for each ref.
- The "never a sweep" invariant is restated in the same breath: a batch is the human's list, `/demo` still never scans the backlog for what to include — discovery stays `/claude-tweaks:help` Stage 4.7's job. The no-argument session-recall path is unchanged and cannot be combined with refs.
- `## Next Actions` renders once at the end of the batch; its conditional lines (`backlog refine` when any item filed a changes-requested follow-up; `help` when any item remains `demo:pending` after Skip) key on the batch as a whole.

**C — Reference card + help text** — `skills/help/reference-card.md` Takes column for both rows updated byte-identical to the new hints; the `/demo` "What it does" cell reworded from "one built thing per invocation" to "one built thing per ref" (or equivalent) so it does not contradict the batch form. `README.md` line ~76's `/demo` blurb ("resolves one item per invocation") reworded the same way. The sweep is vocabulary-wide, not file-list-wide: `/demo`'s own frontmatter `description` (kept ≤ 260 chars — prose trimmed, Keywords intact), `skills/_shared/github-pr-scan-acceptance.md`'s and `skills/help/status-scan.md`'s "one item per invocation" justification clauses, and `/specify`'s intro / When-to-Use / Granularity-Contract singular wording are reworded too, so no live sentence in the repo still asserts single-ref cardinality for either skill.

**D — `/tidy` Yours group heads emit the batch form** — after #685 lands: verify `skills/tidy/step-6-auto.md`'s batch-vs-paste-block rule reads the target skill's `argument-hint` (as #685's Gotchas promise) rather than naming `specify`/`demo` as single-ref literals. If it reads the hint, no tidy edit is needed and this deliverable is a one-line verification note in the PR; if it names them literally, update those literals (and `docs/journeys/tidy-standalone-auto-report.md` if it pins the example) so the `specify` and `demo` group heads render `/claude-tweaks:specify #a,#b,…` / `/claude-tweaks:demo #a,#b,…`.

**Tests** — extend `tests/argument-hint-input.test.js`'s corpus run (it picks the new hints up automatically — no edit unless a leaf fails), keep `tests/reference-card-argument-hint.test.js` green, and add literal-text pins (a sibling `tests/batch-ref-argument.test.js`, or rows in an existing skill-prose pin suite) for: specify's Input stating batch is record-refs-only and sequential; demo's Input stating per-item verdict-before-next and "never a sweep"; the new specify Next Actions row heading. `npm test` passes.

## Acceptance Criteria

- [ ] `skills/specify/SKILL.md` frontmatter `argument-hint` accepts `#N[,#M...]` and `record-id[,id...]`; `## Input` documents the comma-list form, that it applies to record references only, that elements run sequentially through shaping mode one at a time, and that a mixed list (path/topic element) stops before any write.
- [ ] `skills/specify/SKILL.md` `## Next Actions` has a "Shaping mode — multiple records shaped in place" row recommending `/claude-tweaks:flow #{N1},#{N2},...` and excluding skipped refs.
- [ ] `skills/specify/shaping-mode.md`'s Actions Performed table documents one row per attempted ref with a `shaped` / no-op / `skipped: {reason}` outcome.
- [ ] `skills/demo/SKILL.md` frontmatter `argument-hint` is `"[#N[,#M...]]"`; `## Input` and Step 1 document per-item Step 1→2→3 completion before the next ref, one verdict question per item, and restate that a batch is an explicit list, never a sweep; the no-argument path is unchanged.
- [ ] `skills/demo/entry-paths.md`'s `#N` branch reads correctly when entered once per ref (no wording that assumes a single invocation-wide item).
- [ ] `skills/help/reference-card.md` Takes cells for `/claude-tweaks:specify` and `/claude-tweaks:demo` are byte-identical to the new hints and `tests/reference-card-argument-hint.test.js` passes with its allowlist still empty; the `/demo` description cell and `README.md`'s `/demo` blurb no longer say "one item per invocation".
- [ ] `tests/argument-hint-input.test.js` passes for both skills (every hint leaf present in `## Input`).
- [ ] `/tidy`'s batch-vs-paste-block rule either reads the target's `argument-hint` (verified and stated in the PR) or its `specify`/`demo` single-ref literals are updated so those Yours group heads emit the batch form.
- [ ] A `node --test` pin fails if the sequential/record-refs-only rule leaves specify's Input, or the per-item-verdict / never-a-sweep rule leaves demo's Input, or the new Next Actions row heading is removed.
- [ ] `npm test` passes; `wc -c` of both SKILL.md files stays ≤ 40960.
- [ ] `docs/skill-graph.md` needs no new edge (no new inter-skill relationship is introduced) — confirmed in the PR, not assumed.

## Technical Approach

1. Read `skills/specify/SKILL.md` (`## Input`, Resolve-the-input, `## Next Actions`, Component-Skill Contract), `skills/specify/shaping-mode.md`, `skills/demo/SKILL.md` (`## Input`, Steps 1–3, `## Next Actions`), `skills/demo/entry-paths.md`, both pinning tests, and `docs/skill-authoring.md`'s `argument-hint` bullet (hint derives from `## Input`; bracket/pipe convention).
2. Specify: edit the hint; add a "Batch of record references" paragraph to `## Input` (list grammar, refs-only, sequential, mixed-list hard error, flag applicability); add one sentence to case 1 ("a comma-separated list runs this case per element"); add the new Next Actions row; add the per-ref outcome row to shaping-mode's Actions Performed. Keep the `--chained` contract text accurate (capture passes one ref).
3. Demo: edit the hint; extend `## Input` and Step 1 with the iteration rule and the never-a-sweep restatement; add one sentence to Step 3 that verdicts apply per item before the next item begins; make `## Next Actions`' conditional lines batch-aware; touch `entry-paths.md`'s `#N` branch intro only if its wording assumes one item per invocation.
4. Update `reference-card.md` (both Takes cells, `/demo` description) and `README.md`'s `/demo` blurb.
5. Tidy check (D): grep `skills/tidy/step-6-auto.md` for `specify`/`demo` in the batch-vs-paste-block rule on the post-#685 main; edit only if literals are found. If #685 has not merged when this builds, rebase on it first — D depends on its rule text.
6. Add the pin test; run `npm test` (full suite — repo-wide prose-conformance tests, not just filename-matched files).

## Gotchas

- **Depends on #685 for D only.** A–C are independent of #685 and can build first; D reads #685's shipped grouping rule. If #685 merges after this record's build starts, re-run step 5 against merged main before wrap-up.
- `tests/reference-card-argument-hint.test.js` demands byte-identity and its allowlist is intentionally empty (refs #564) — copy the hint string, don't retype it. Escape `|` as `\|` inside the table cell exactly as the existing rows do.
- `tests/argument-hint-input.test.js` checks each `|`-leaf inside a top-level `[...]` group appears in `## Input`; a leaf like `#M...` must survive as a literal substring — write the grammar into `## Input` verbatim rather than paraphrasing it.
- Sequential, not parallel: shaping mode raises interactive questions (design-intent when a frontend sniff fires) and demo raises one verdict per item — a batch is a loop over the single-item procedure, never a fan-out. Do not introduce Task dispatch or the subagent contract here.
- `/demo`'s no-argument path (session-recall) and the ref-list path stay mutually exclusive; do not invent a "refs plus session-recall" hybrid.
- `/specify` batch is shaping-mode-only. A comma inside a topic string ("auth, login flow") is not a batch — the batch grammar requires every element to parse as a record reference; otherwise the whole argument is free text and resolves via cases 3–5 as today. State this so a topic containing a comma does not silently become a hard error.
- The capture born-ready chain (`Skill(skill: "claude-tweaks:specify", args: "#{n} --chained")`) is unchanged; nothing in `skills/capture/` needs an edit.
- `Surface: terminal` — slash-command argument grammar and per-item terminal interaction; declared-only, takes the design pipeline's terminal track, no Impeccable steps.
- Under `worktree-always`, all edits happen in the build worktree; the record's files are skill prose, one reference card, README, and one test — no `bin/` changes.

## Original request

specify + demo: accept a #N,#M batch argument so tidy's Yours groups collapse to one paste line

**Related:** #685 (tidy report redesign — the consumer that wants this; named there as a deliberate non-bundled follow-on)

Context: `/tidy`'s Yours section groups records by the command the human runs and prefers one batch invocation per group. Only `/flow` (`#n,#m`) and `/dispatch` (`#N,#M`) accept multiple refs today; `/specify` and `/demo` are single-ref, so a group of 7 trigger-met parked records or 10 acceptance-gap records still renders as 7 or 10 separate paste lines. Observed 2026-08-16: 3 of the 4 largest Yours groups (wake-parked ×7, re-shape stubs ×5, acceptance-gap ×10) all target a single-ref skill.

Scope: Extend `/specify` and `/demo` argument-hints to accept `#N,#M[,...]` and iterate — each ref runs the skill's existing single-item procedure in sequence, one Verdict/Shaping interaction per item, same per-item outputs, no cross-item merging. `/demo` stays one-item-per-verdict (never a sweep — discovery remains `/help`'s job; a batch is an explicit human-supplied list, not a backlog scan). `/specify` batch applies to record refs only (Shaping mode), not design-doc paths or topics. Update `argument-hint` frontmatter, the Input parsing tables, `skills/help/reference-card.md`'s argument column (pinned by test), and `/tidy`'s Yours group-head rendering (#685) to emit the batch form once these accept it. Origin: /claude-tweaks:tidy 2026-08-16 sweep + #685 discussion.

