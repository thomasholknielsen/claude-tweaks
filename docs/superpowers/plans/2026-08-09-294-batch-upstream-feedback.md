# 294 — Batch upstream-feedback (U#) filing into one multiSelect decision, collapse /feedback's double-ask

**Spec:** `.claude-tweaks/pipelines/2026-08-09T204209-spec-294/work/294-spec.md`

**Plan-time scope-creep finding (add-to-plan, per `.claude-tweaks/policy.yml`'s `auto-mode: default-on` → `scope-creep: add-to-plan` default):** the spec's Key Files list does not include `skills/flow/multispec-review-console.md`, but that file restates `wrap-up/review-console.md`'s exact per-item `Q#`/`M#`/`U#` pattern verbatim for multi-spec `/flow` runs (own Numbering rules, its own Upstream feedback section, its own "On approval"/"On override"/Hard requirements/Anti-Patterns rows — grep-confirmed identical shape). Leaving it untouched would mean a multi-spec `/flow` run still pays N `AskUserQuestion` calls for upstream feedback, defeating this leaf's purpose for that path and reproducing exactly the drift CLAUDE.md's `[IL-02]`/`[IL-17]` warn about (a cross-file promise with no matching consumer update; the same fact restated elsewhere, missed by a narrow grep). Task 5 below mirrors Tasks 1-3's edits into this file. Logged to this run's `decisions.md` as an `AUTO` scope-creep entry.

**Note on `_shared/auto-mode-card.md` vs `_shared/auto-mode-contract.md`:** both files exist and are both legitimate — `auto-mode-card.md` is the short "child skill" excerpt, `auto-mode-contract.md` is the full canonical source. `feedback/SKILL.md` and `wrap-up/review-console.md` already cite `auto-mode-card.md` for the not-silenced list; `docs/skill-graph.md` cites the full `auto-mode-contract.md`. Preserve each file's existing citation choice — do not swap one for the other.

---

## Task 1: Create the shared batch contract

**Files:** Create `skills/_shared/upstream-feedback-batch.md`

Write this file verbatim:

```markdown
# Upstream Feedback Batch Contract

The shared render + chunked-`multiSelect` + drift-fallback contract for filing upstream
feedback (`U#` items) in bulk. Cited by every call site — `skills/feedback/SKILL.md`'s Step 7
(1..N items via direct or `--queue` invocation), `skills/wrap-up/review-console.md`'s, and
`skills/flow/multispec-review-console.md`'s Upstream feedback sections — none of which restates
these rules inline (CLAUDE.md's cross-reference rule: every relationship stated once).

## Rendering

Render every candidate's full scrubbed draft as literal markdown text immediately above the
`AskUserQuestion` call — `multiSelect: true` does not support the tool's `preview` field
(single-select only), so the option `description` alone is too short to carry a filing decision.

## Chunking

Split the batch into groups of at most 4 items — `AskUserQuestion`'s own per-question option cap
(2-4 items; confirmed against the tool's own current schema at call time, not assumed from this
file). Issue one `multiSelect: true` `AskUserQuestion` call per chunk, sequentially — never in
parallel, so each chunk's answer is known before the next renders. Each chunk's options: `label`
= the item's title, `description` = a one-line summary plus any dedup flag (literal format
`⚠ possible duplicate: #{N}` when a dedup search found a match — never rendered as a separate
`AskUserQuestion` call). All options are pre-checked by default.

A batch of 6 renders as 2 calls (4, then 2); a batch of 4 or fewer renders as exactly 1 call. A
batch of exactly 1 item is the degenerate single-chunk case — functionally unchanged from a
direct single-item `/claude-tweaks:feedback` invocation.

## Question text

State explicitly that a checked item **will be filed**, not shortlisted, and restate the escape
hatch plainly (CLAUDE.md's `[IL-13]`: the tool's `Other` field is otherwise undocumented in the
rendered UI). Append this fixed sentence to every batch question's text:

> To edit an item instead of filing or skipping it as-is, describe the change and which item it
> applies to (by title) in your next message.

## Declining an item

An unchecked item is logged as declined, never silently dropped:

- **`/feedback --queue` (direct invocation):** post a comment on that item's local
  `upstream-candidate` issue — `"Declined via /claude-tweaks:feedback batch review, {date}"` —
  and leave the issue open. Visible context for a future run.
- **Wrap-up / multi-spec console path:** log the decline to the originating run's `decisions.md`
  with the user's stated reason, or `"declined, no reason given"` when none was offered — the
  same convention the console's `Q#`/`M#` sections already use.

## Editing an item

Editing content instead of a flat include/exclude is a free-text message in the next reply,
naming the target item by the title shown in its rendered draft — the same free-text-in-next-
message channel `review-console.md`'s top-level "Approve all / Override specific items" already
uses, generalized to name a single item rather than a global choice. This is the **only** override
mechanism either caller needs — neither defines a separate one.

## Caller responsibilities

The contract handles rendering, chunking, question text, and override/decline logging. Each
caller is responsible for:

- Gathering and scrubbing every candidate's draft **before** calling into this contract (the
  contract never gathers or scrubs on its own)
- Filing each checked item after the chunk's answer comes back — `/feedback`'s own Step 8 for a
  direct invocation, or `/claude-tweaks:feedback --pre-confirmed` once per checked item for the
  wrap-up / multi-spec console path (see `skills/feedback/SKILL.md`'s Component-Skill Contract for
  who may pass that flag)
```

**Commit:** `Add the upstream-feedback-batch shared contract, refs #294`

---

## Task 2: Rewrite `skills/feedback/SKILL.md` — Step 0, Step 7, Input table, carve-out

**Files:** Modify `skills/feedback/SKILL.md`

**2a. Frontmatter `argument-hint` (line 4).** Replace:

```
argument-hint: "[<learning text>] [--kind=defect|gap] [--dry-run] [--queue]"
```

with:

```
argument-hint: "[<learning text>] [--kind=defect|gap] [--dry-run] [--queue] [--pre-confirmed]"
```

**2b. Input table (lines 32-42).** Replace the whole block:

```
`$ARGUMENTS` is parsed as `[<learning text>] [--kind=<value>] [--dry-run] [--queue]`:

| Argument | Behavior |
|----------|----------|
| Free-text learning | The substance of the report. When absent, gather it from the conversation or ask. |
| `--kind=defect` | The plugin does something wrong. Skips Step 2's inference. |
| `--kind=gap` | The plugin has no opinion where it should. Skips Step 2's inference. |
| `--dry-run` | Run Steps 1-7 (classification, self-reference, dedup, drafting, scrub, and the confirm gate's dry-run branch), then render the draft and **stop** — Step 8 (label resolution and `gh issue create`) never runs. Step 4's dedup search is a real, read-only `gh issue list` call; no `gh` call ever creates, labels, or files anything. |
| `--queue` | Explicit bare-invocation mode (see Step 0) even when free-text is also present — process this project's own `upstream-candidate` backlog instead of (or in addition to) the free-text learning. |
```

with:

```
`$ARGUMENTS` is parsed as `[<learning text>] [--kind=<value>] [--dry-run] [--queue] [--pre-confirmed]`:

| Argument | Behavior |
|----------|----------|
| Free-text learning | The substance of the report. When absent, gather it from the conversation or ask. |
| `--kind=defect` | The plugin does something wrong. Skips Step 2's inference. |
| `--kind=gap` | The plugin has no opinion where it should. Skips Step 2's inference. |
| `--dry-run` | Run Steps 1-7 (classification, self-reference, dedup, drafting, scrub, and the confirm gate's dry-run branch), then render the draft and **stop** — Step 8 (label resolution and `gh issue create`) never runs. Step 4's dedup search is a real, read-only `gh issue list` call; no `gh` call ever creates, labels, or files anything. When `--pre-confirmed` is also passed, `--dry-run` wins — see Step 7. |
| `--queue` | Explicit bare-invocation mode (see Step 0) even when free-text is also present — process this project's own `upstream-candidate` backlog instead of (or in addition to) the free-text learning. |
| `--pre-confirmed` | Boolean, presence-only (same shape as `--dry-run`). Skip Step 7's `AskUserQuestion` for this item — Step 6's scrub still reruns unconditionally as a drift check; on drift, falls back to a normal per-item confirm (see Step 7). Legitimate only from `/claude-tweaks:wrap-up`'s Review Console or `/claude-tweaks:flow`'s consolidated multi-spec console (see Component-Skill Contract). |
```

**2c. Step 0 (lines 46-57).** Replace the whole section body (keep the `### Step 0: Local upstream-candidate queue (bare invocation)` heading and the first paragraph through the `gh issue list` command unchanged) — replace everything from the `- **None found:**` bullet through the end of the section with:

```
- **None found:** proceed to Step 1 as usual (gather from the conversation, or ask).
- **One or more found:** run Steps 1-6 (gather from the issue's own body — component and symptom
  are already in it — classify, confirm self-reference doesn't apply, dedup search, draft, scrub)
  non-interactively for each candidate, then call `_shared/upstream-feedback-batch.md`'s shared
  batch contract once — chunked per that file's own rule — instead of looping Step 7 individually
  per candidate. On a checked item filing successfully (Step 8), close the local
  `upstream-candidate` issue with a comment linking the new upstream issue. An unchecked item is
  handled per the shared contract's decline rule (comment + leave the local issue open).

This is what resolves `upstream-candidate`'s dead-write state (#239): the label's own consumer
was always meant to be a human eyeball plus a manual `/claude-tweaks:feedback` invocation
(`_shared/learning-routing.md`'s Headless-runs paragraph says exactly this), and this step is what
makes that eyeball's job a single command instead of a `gh issue list` a human has to remember to
run.
```

Also bump the `--limit 50` in the Step 0 `gh issue list` command to `--limit 100`, and append this parenthetical directly after that command block:

```
(matching the label's expected low cardinality — a handful of headless-filed candidates, not the
full backlog — while still bounding the read per `[IL-67]`; if the count returned equals the
limit, state this in the summary rather than silently treating it as complete.)
```

**2d. Step 7 (lines 166-180).** Replace the whole section:

```
### Step 7: Confirm — HARD GATE

Show the full scrubbed draft and call `AskUserQuestion`:

- `question`: `"File this upstream against thomasholknielsen/claude-tweaks?"`,
  `header`: `"File upstream"`, `multiSelect`: `false`
- Option 1 — `label`: `"File it (Recommended)"`, `description`: `"Create the issue as drafted"`
- Option 2 — `label`: `"Edit first"`, `description`: `"Tell me what to change before filing"`
- Option 3 — `label`: `"Don't file"`, `description`: `"Discard — the learning stays local"`

Never file without this confirmation, in any mode. Publishing to a public
repository is outward-facing and effectively irreversible.

When `--dry-run` was passed, render the draft, state the classified destination
and kind, and **stop here** — do not call `AskUserQuestion` and do not file.
```

with:

```
### Step 7: Confirm — HARD GATE

Show the full scrubbed draft(s) and call into `_shared/upstream-feedback-batch.md`'s shared batch
contract — one item (this invocation's single learning, or a single surviving `--queue` candidate)
is the contract's degenerate single-chunk case; N items under `--queue` chunk per that file's own
rule. Never file without the resulting per-item confirmation, in any mode. Publishing to a public
repository is outward-facing and effectively irreversible.

**`--pre-confirmed`:** when present, skip the `AskUserQuestion` call for that item — but this
step's scrub (Step 6) always reruns first, regardless of the flag, as a drift check against the
staged file it was pre-confirmed from. If the rerun scrub produces content that differs from the
staged, already-approved draft, `--pre-confirmed` does **not** apply for that one item: fall back
to the normal `AskUserQuestion` confirm, showing the diff between the approved and rerun-scrubbed
content, so the human re-approves the changed content specifically. This fallback is per-item — it
never aborts sibling items in the same batch.

**`--dry-run` takes precedence over `--pre-confirmed`** when both are passed: render every draft
and the classified destination/kind, then stop — no `AskUserQuestion` call of any kind, matching
`--dry-run`'s existing single-item contract, regardless of whether `--pre-confirmed` was also
passed.

When `--dry-run` was passed (and the precedence rule above does not apply), render the draft,
state the classified destination and kind, and **stop here** — do not call `AskUserQuestion` and
do not file.
```

**2e. Component-Skill Contract (lines 233-244).** Append this paragraph immediately after the existing "Being inside a pipeline never relaxes Steps 6 and 7..." paragraph (do not remove or reorder any existing text in this section):

```
**`--pre-confirmed` legitimacy is narrower than "inside a pipeline."** The only legitimate source
of `--pre-confirmed` is `/claude-tweaks:wrap-up`'s Review Console, or the consolidated multi-spec
console at `/claude-tweaks:flow`'s end-of-run, invoking this skill per checked `U#` item — not a
general condition any pipeline orchestrator may claim, and not inferred from `$PIPELINE_RUN_DIR`
or any other ambient signal. This is a prose-enforced, auditable contract — a named caller, not an
ambient signal — because skills are markdown instructions the model follows, not executable code;
nothing structurally prevents a future second caller from passing the flag. A future caller other
than those two consoles passing `--pre-confirmed` is a scope violation to flag at review time, not
a precedent to extend the carve-out to.
```

**Commit:** `Rewrite feedback/SKILL.md Step 0 and Step 7 for batch upstream filing, refs #294`

---

## Task 3: Rewrite `skills/wrap-up/review-console.md` — Upstream feedback, On approval, Hard requirements

**Files:** Modify `skills/wrap-up/review-console.md`

**3a. Line 10.** Replace:

```
In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion`, same per-item `Q#`/`M#`/`U#` drills. `summary-template.md` now renders only the record of what was decided here, never a second decision point.
```

with:

```
In interactive and standalone runs this console replaces the batch decision the report template used to present after it — same tables, same single terminal `AskUserQuestion`, same per-item `Q#`/`M#` drills and the same batched `U#` review (`_shared/upstream-feedback-batch.md`). `summary-template.md` now renders only the record of what was decided here, never a second decision point.
```

**3b. Console intro line (inside the "Present the console" template, immediately under `### Wrap-Up Review Console`).** Replace:

```
The pipeline auto-resolved {N} decisions and staged {M} items for your review. The named batch sections below resolve via one batch choice. The per-item sections that follow them — Queue writes, Memory updates, Upstream feedback — each require per-item approval, because `_shared/auto-mode-card.md` lists work-record creation, memory writes, and upstream filing as not silenced by `auto`.
```

with:

```
The pipeline auto-resolved {N} decisions and staged {M} items for your review. The named batch sections below resolve via one batch choice. The sections that follow them — Queue writes, Memory updates, Upstream feedback — each require approval outside that batch choice, because `_shared/auto-mode-card.md` lists work-record creation, memory writes, and upstream filing as not silenced by `auto`: Queue writes and Memory updates one `AskUserQuestion` call per item, Upstream feedback one or more chunked `multiSelect` calls (`_shared/upstream-feedback-batch.md`).
```

**3c. Upstream feedback section (the `#### Upstream feedback — REQUIRES PER-ITEM APPROVAL...` block inside the template, immediately following the Memory updates section).** Replace:

```
#### Upstream feedback — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when the Upstream feedback curation row staged an upstream defect/gap report (`staged/wrap-up-upstream-*.md`); omit it entirely otherwise.

| U# | Kind | Component | Summary | Patch |
|---|---|---|---|---|
| U1 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `staged/wrap-up-upstream-1.md` |

> Filing publishes privately-derived content to a public repository. The body shown is already scrubbed; approving files it via `/claude-tweaks:feedback`.
```

with:

```
#### Upstream feedback — REQUIRES APPROVAL, BATCHED (not covered by "Approve all")

Render this section only when the Upstream feedback curation row staged one or more upstream
defect/gap reports (`staged/wrap-up-upstream-*.md`); omit it entirely otherwise. Approval runs
through `_shared/upstream-feedback-batch.md`'s shared batch contract — one or more `multiSelect`
`AskUserQuestion` calls, chunked at 4 items per call, all pre-checked — instead of one call per
item; see below for where this fires relative to the terminal decision.

| U# | Kind | Component | Summary | Patch |
|---|---|---|---|---|
| U1 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `staged/wrap-up-upstream-1.md` |

> Filing publishes privately-derived content to a public repository. The body shown is already
> scrubbed; a checked item files it via `/claude-tweaks:feedback --pre-confirmed`.
```

**3d. Per-item drill procedure (immediately after the closing ``` ``` of the template, through the end of the worked Q1/Q2 example and its closing paragraph).** Replace the block that runs from `Queue writes (Q1, Q2) are handled separately below` through the final `"None of these three options carries..."` paragraph — i.e. everything currently between the console template and `## On approval (option 1)` — with:

```
Queue writes (Q1, Q2) are handled separately below — they are never part of this terminal decision, regardless of which option is chosen.

After the user selects option 1 or 2:

**Queue writes and Memory updates** — prompt each per-item row individually: one small `AskUserQuestion` call per `Q#`/`M#` item, issued separately (never batched into a single call's multiple questions, and never batched across sections). For each `Q#` or `M#` item, call `AskUserQuestion` with `question`: the item's own line (e.g. for a queue write, `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"` for a queue write or `"Memory update {M#}"` for a memory update, `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""` for a queue write, `"Write the memory file: \"{name}\""` for a memory update
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

Applied to this example's two queue writes:
- Q1 — `question`: `"Queue write Q1 → new record, parked (trigger: /auth provider docs land): \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`, `header`: `"Queue write Q1"`; Option 1 description: `"Create the record: \"Add OAuth refresh edge case\" — blocked on /auth provider docs, parked with trigger '/auth provider docs land'"`
- Q2 — `question`: `"Queue write Q2 → new record, backlog: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3."`, `header`: `"Queue write Q2"`; Option 1 description: `"Create the record: \"Investigate token rotation strategy\" — surfaced by /reflect Step 3\""`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, and these calls are never combined into a single multi-question `AskUserQuestion` call across multiple `Q#` or `M#` items, whether from the same section or different ones (that would functionally reintroduce bulk approval by letting the user answer several at once without individually attending to each).

**Upstream feedback** — call into `_shared/upstream-feedback-batch.md`'s shared batch contract with this run's `U#` rows: render each item's full scrubbed draft (already available from `staged/wrap-up-upstream-*.md`), then issue the contract's chunked `multiSelect` `AskUserQuestion` call(s) — 4 items per call, all pre-checked. This is the dedicated per-decision approval for every checked item (`[IL-114]`): checking and submitting **authorizes filing now**, not shortlisting for later confirmation.
```

**3e. "On approval (option 1)" item 9.** Replace:

```
9. For each `U#` upstream feedback item, prompt the user per item via its own `AskUserQuestion` call. On Apply (or Edit, after the modification): invoke `/claude-tweaks:feedback` with the staged, already-scrubbed body from the item's staged file (`staged/wrap-up-upstream-{N}.md`) — that skill re-runs its own scrub and confirm gates, since its Component-Skill Contract states a pipeline never relaxes them. Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
```

with:

```
9. For the `U#` upstream feedback rows, present them via `_shared/upstream-feedback-batch.md`'s shared batch contract (chunked `multiSelect` calls, see above). For each item checked in the resulting chunk(s): invoke `/claude-tweaks:feedback --pre-confirmed` with the staged, already-scrubbed body from the item's staged file (`staged/wrap-up-upstream-{N}.md`) — that skill's Step 6 (scrub) still reruns as a drift check before filing; on drift it falls back to its own normal `AskUserQuestion` confirm for that one item, per `feedback/SKILL.md`'s Step 7. An item left unchecked is declined per the shared contract's decline rule — log to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
```

**3f. "On override (option 2)" item 5.** Replace:

```
5. Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`): all still prompted per item even under override — the user can Skip or Edit them, but the per-item gate cannot be bulk-resolved
```

with:

```
5. Queue writes (`Q#`) and Memory updates (`M#`) are still prompted per item even under override; Upstream feedback (`U#`) is still presented via `_shared/upstream-feedback-batch.md`'s shared batch contract even under override — the user can Skip or Edit any of them, but none of the three can be bulk-resolved by this terminal choice
```

**3g. Hard requirements bullet.** Replace:

```
- **Queue writes, Memory updates, and Upstream feedback are per-item only.** Never group any of them under "Approve all," and never batch two items into one `AskUserQuestion` call — this enforces `_shared/auto-mode-card.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing. **A different table's approval never satisfies this gate** — not the Reflection Insights batch, not the Skill Updates batch, not any other — even when that answer was "Apply all." A batch table's "Apply all" approves what its own rows list; routing an insight to Memory is one such row, and the write is a separate decision this section's own `M#` prompt makes.
```

with:

```
- **Queue writes and Memory updates are per-item only** — one `AskUserQuestion` call each. **Upstream feedback requires the same never-silenced-by-`auto` approval, but via `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` calls** instead of one call per item. None of the three is ever covered by "Approve all," and none of Queue writes'/Memory updates' items is ever batched into one call together — this enforces `_shared/auto-mode-card.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing. **A different table's approval never satisfies this gate** — not the Reflection Insights batch, not the Skill Updates batch, not any other — even when that answer was "Apply all." A batch table's "Apply all" approves what its own rows list; routing an insight to Memory is one such row, and the write is a separate decision this section's own `M#` prompt makes. Upstream feedback's own chunked calls are that same dedicated decision for `U#` rows — checking an item in a chunk **is** the per-decision approval, not a stand-in for one.
```

**Commit:** `Rewrite wrap-up/review-console.md Upstream feedback section for batch filing, refs #294`

---

## Task 4: Update `skills/wrap-up/execution-and-verification.md` Step 9 description

**Files:** Modify `skills/wrap-up/execution-and-verification.md`

Replace the "Upstream feedback" bullet:

```
- **Upstream feedback** — already filed when approved. The console executes, in every mode: for each approved `U#` item, `review-console.md`'s "On approval" step 9 invoked `/claude-tweaks:feedback` with the staged, already-scrubbed body at the moment of approval. This step does not invoke it again; it confirms the filing landed — see Verify execution below
```

with:

```
- **Upstream feedback** — already filed when approved. The console executes, in every mode: for each item checked via `_shared/upstream-feedback-batch.md`'s chunked batch calls, `review-console.md`'s "On approval" step 9 invoked `/claude-tweaks:feedback --pre-confirmed` with the staged, already-scrubbed body at the moment of approval — the console's own batch approval satisfies `/feedback`'s confirm gate for that item unless its Step 6 rerun detects drift, in which case `/feedback` falls back to its own per-item confirm (`feedback/SKILL.md`'s Step 7) and files only after that. This step does not invoke `/feedback` again; it confirms the filing landed — see Verify execution below
```

**Commit:** `Update execution-and-verification.md Step 9 for --pre-confirmed, refs #294`

---

## Task 5: Mirror Tasks 1-3 into `skills/flow/multispec-review-console.md` (scope-creep addition)

**Files:** Modify `skills/flow/multispec-review-console.md`

**5a. Numbering rules paragraph.** Replace:

```
Rows across Auto-applied through Translated briefs use a single global sequence starting at #1 (mirrors `wrap-up/review-console.md`). Three sections sit outside that global sequence because they require per-item approval and are not part of the global "Approve all" choice, exactly as `wrap-up/review-console.md`'s own three per-item sections (never counted among its named batch sections): **Queue writes** use a separate `Q`-prefixed sequence (`Q1`, `Q2`, …) — aggregated across every spec's staged record-proposal files (`staged/leftover-*.md`, `staged/ledger-record-*.md`, or any staged file carrying a `Title:`/`Type:`/`Labels:` header) plus the parent run dir's own. **Memory updates** use a separate `M`-prefixed sequence (`M1`, `M2`, …) — aggregated across every spec's `staged/wrap-up-memory-*.md` files plus the parent run dir's own. **Upstream feedback** uses a separate `U`-prefixed sequence (`U1`, `U2`, …) — aggregated across every spec's `staged/wrap-up-upstream-*.md` files plus the parent run dir's own. Do not restart any of the four sequences per spec or per section.
```

with:

```
Rows across Auto-applied through Translated briefs use a single global sequence starting at #1 (mirrors `wrap-up/review-console.md`). Three sections sit outside that global sequence because they require approval outside the global "Approve all" choice, exactly as `wrap-up/review-console.md`'s own three non-batch sections (never counted among its named batch sections): **Queue writes** use a separate `Q`-prefixed sequence (`Q1`, `Q2`, …), one `AskUserQuestion` call per item — aggregated across every spec's staged record-proposal files (`staged/leftover-*.md`, `staged/ledger-record-*.md`, or any staged file carrying a `Title:`/`Type:`/`Labels:` header) plus the parent run dir's own. **Memory updates** use a separate `M`-prefixed sequence (`M1`, `M2`, …), one `AskUserQuestion` call per item — aggregated across every spec's `staged/wrap-up-memory-*.md` files plus the parent run dir's own. **Upstream feedback** uses a separate `U`-prefixed sequence (`U1`, `U2`, …), approved via `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` calls instead of one call per item — aggregated across every spec's `staged/wrap-up-upstream-*.md` files plus the parent run dir's own. Do not restart any of the four sequences per spec or per section.
```

**5b. Upstream feedback section.** Replace:

```
#### Upstream feedback — REQUIRES PER-ITEM APPROVAL (not covered by "Approve all")

Render this section only when any spec's Upstream feedback curation row (or the parent run dir's own) staged an upstream defect/gap report (`staged/wrap-up-upstream-*.md`). Aggregated across every spec in the run — each row gets its own prompt; bulk approval is forbidden per `_shared/auto-mode-contract.md`'s upstream-filing row, exactly as `wrap-up/review-console.md`'s Upstream feedback section. Filing publishes privately-derived content to a public repository; the body shown is already scrubbed.

| U# | Spec | Kind | Component | Summary | Patch |
|---|---|---|---|---|---|
| U1 | 157 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `spec-157/staged/wrap-up-upstream-1.md` |

Below each row, show the full staged file content for the item so the user can see exactly what would be published. Filing happens after approval by invoking `/claude-tweaks:feedback` per approved row. Omit the section entirely when no spec (and no parent-level proposal) staged an upstream proposal.
```

with:

```
#### Upstream feedback — REQUIRES APPROVAL, BATCHED (not covered by "Approve all")

Render this section only when any spec's Upstream feedback curation row (or the parent run dir's own) staged one or more upstream defect/gap reports (`staged/wrap-up-upstream-*.md`). Aggregated across every spec in the run and approved through `_shared/upstream-feedback-batch.md`'s shared batch contract — one or more chunked `multiSelect` `AskUserQuestion` calls (4 items per call, all pre-checked) instead of one call per item; bulk-skipping the whole section is still forbidden per `_shared/auto-mode-contract.md`'s upstream-filing row, exactly as `wrap-up/review-console.md`'s Upstream feedback section. Filing publishes privately-derived content to a public repository; the body shown is already scrubbed.

| U# | Spec | Kind | Component | Summary | Patch |
|---|---|---|---|---|---|
| U1 | 157 | defect | /claude-tweaks:dispatch | Parallel dispatch leaves one agent without a worktree under worktree.always | `spec-157/staged/wrap-up-upstream-1.md` |

Below each row, show the full staged file content for the item so the user can see exactly what would be published. Filing happens after approval by invoking `/claude-tweaks:feedback --pre-confirmed` per checked row. Omit the section entirely when no spec (and no parent-level proposal) staged an upstream proposal.
```

**5c. Per-item drill procedure.** Replace:

```
Queue writes (Q1, Q2, …), Memory updates (M1, M2, …), and Upstream feedback (U1, U2, …) are all handled separately from the three terminal options above — none of them is ever part of that decision, regardless of which option is chosen. After the user selects option 1 or 2, prompt each per-item row individually — one small `AskUserQuestion` call per `Q#`/`M#`/`U#` item, issued separately (never batched into a single call, and never batched across specs or across sections).

For each `Q#`, `M#`, or `U#` item, call `AskUserQuestion` with `question`: the item's own line (e.g. for a queue write, `"Queue write Q1 → new record, parked (trigger: /auth provider docs land), spec 157: \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"` (or `"Memory update {M#}"` / `"Upstream feedback {U#}"`), `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""` for a queue write, `"Write the memory file: \"{name}\""` for a memory update, `"File the issue: \"{summary}\""` for upstream feedback
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, mirroring `wrap-up/review-console.md`'s three per-item sections exactly (see that file for the full worked examples and the `Other`-field override note).
```

with:

```
Queue writes (Q1, Q2, …), Memory updates (M1, M2, …), and Upstream feedback (U1, U2, …) are all handled separately from the three terminal options above — none of them is ever part of that decision, regardless of which option is chosen. After the user selects option 1 or 2:

**Queue writes and Memory updates** — prompt each per-item row individually: one small `AskUserQuestion` call per `Q#`/`M#` item, issued separately (never batched into a single call, and never batched across specs or across sections). For each `Q#` or `M#` item, call `AskUserQuestion` with `question`: the item's own line (e.g. for a queue write, `"Queue write Q1 → new record, parked (trigger: /auth provider docs land), spec 157: \"Add OAuth refresh edge case\" — blocked on /auth provider docs."`), `header`: `"Queue write {Q#}"` (or `"Memory update {M#}"`), `multiSelect`: `false`:
- Option 1 — `label`: `"Apply"`, `description`: `"Create the record: \"{content}\""` for a queue write, `"Write the memory file: \"{name}\""` for a memory update
- Option 2 — `label`: `"Skip"`, `description`: `"Drop this proposal"`
- Option 3 — `label`: `"Edit"`, `description`: `"Modify before creating"`

None of these three options carries `(Recommended)` — the source text requires explicit per-item attention, mirroring `wrap-up/review-console.md`'s Queue writes / Memory updates sections exactly (see that file for the full worked examples and the `Other`-field override note).

**Upstream feedback** — call into `_shared/upstream-feedback-batch.md`'s shared batch contract with this run's aggregated `U#` rows (across every spec plus the parent run dir): render each item's full scrubbed draft, then issue the contract's chunked `multiSelect` `AskUserQuestion` call(s) — 4 items per call, all pre-checked, never batched across specs beyond the contract's own 4-per-call chunking.
```

**5d. "On approval (option 1)" item 4.** Replace:

```
4. For each `U#` upstream feedback item, prompt the user per item via its own `AskUserQuestion` call (see "Present the consolidated console" above) — never batched, even across specs. On Apply (or Edit, after the modification): invoke `/claude-tweaks:feedback` with the staged, already-scrubbed body from the item's staged file (aggregated across every spec's `staged/wrap-up-upstream-*.md` files plus the parent run dir's own) — that skill re-runs its own scrub and confirm gates, since its Component-Skill Contract states a pipeline never relaxes them. Skip drops the proposal — log the decline to the originating spec's `decisions.md` (or the parent run dir's, for a parent-level item) with the user's stated reason, or "declined, no reason given" when none was offered.
```

with:

```
4. For the `U#` upstream feedback rows (aggregated across every spec's `staged/wrap-up-upstream-*.md` files plus the parent run dir's own), present them via `_shared/upstream-feedback-batch.md`'s shared batch contract (see "Present the consolidated console" above). For each item checked in the resulting chunk(s): invoke `/claude-tweaks:feedback --pre-confirmed` with the staged, already-scrubbed body from the item's staged file — that skill's Step 6 (scrub) still reruns as a drift check before filing; on drift it falls back to its own normal `AskUserQuestion` confirm for that one item, per `feedback/SKILL.md`'s Step 7. An item left unchecked is declined per the shared contract's decline rule — log to the originating spec's `decisions.md` (or the parent run dir's, for a parent-level item) with the user's stated reason, or "declined, no reason given" when none was offered.
```

**5e. "On override (option 2)" item 3.** Replace:

```
3. Queue writes (`Q#`), Memory updates (`M#`), and Upstream feedback (`U#`): all still prompted per item even under override — see "Present the consolidated console" above; the user can Skip or Edit them, but the per-item gate cannot be bulk-resolved across specs either
```

with:

```
3. Queue writes (`Q#`) and Memory updates (`M#`) are still prompted per item even under override; Upstream feedback (`U#`) is still presented via the shared batch contract even under override — see "Present the consolidated console" above; the user can Skip or Edit any of them, but none of the three can be bulk-resolved across specs either
```

**5f. Hard requirements bullet.** Replace:

```
- **Queue writes, Memory updates, and Upstream feedback are per-item only.** Never group any of them under "Approve all," and never batch two items from the same per-item section — `Q#`, `M#`, or `U#` — (even from different specs) into one `AskUserQuestion` call — this enforces `_shared/auto-mode-contract.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing, the same as `wrap-up/review-console.md`'s three per-item sections.
```

with:

```
- **Queue writes and Memory updates are per-item only** — one `AskUserQuestion` call each, never two items from the same section (even from different specs) batched into one call. **Upstream feedback requires the same never-silenced-by-`auto` approval, but via `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` calls** aggregated across specs — this enforces `_shared/auto-mode-contract.md`'s not-silenced rules for work-record creation, memory writes, and upstream filing, the same as `wrap-up/review-console.md`'s three non-batch sections. None of the three is ever covered by "Approve all" or "Override."
```

**5g. Anti-Patterns table row.** Replace:

```
| Bulk-approving queue writes, memory updates, or upstream feedback under "Approve all" or "Override" | Work-record creation, memory writes, and upstream filing are never silenced by `auto` (`_shared/auto-mode-contract.md`). Each `Q#`, `M#`, or `U#` item requires its own `AskUserQuestion` call, aggregated across specs but never grouped — the same contract `wrap-up/review-console.md`'s three per-item sections enforce for a single-spec run. |
```

with:

```
| Bulk-approving queue writes, memory updates, or upstream feedback under "Approve all" or "Override" | Work-record creation, memory writes, and upstream filing are never silenced by `auto` (`_shared/auto-mode-contract.md`). Each `Q#` or `M#` item requires its own `AskUserQuestion` call; upstream feedback requires the same approval via `_shared/upstream-feedback-batch.md`'s chunked calls — aggregated across specs but never grouped into "Approve all" — the same contract `wrap-up/review-console.md`'s three non-batch sections enforce for a single-spec run. |
```

**Commit:** `Mirror batch upstream filing into flow/multispec-review-console.md, refs #294`

---

## Task 6: Cross-reference updates

**Files:** Modify `docs/skill-graph.md`, `docs/plugin-structure.md`

**6a. `docs/skill-graph.md`, `## feedback` section, `/wrap-up` row.** Replace:

```
| `/wrap-up` | Wrap-up's Upstream feedback curation row stages one upstream proposal per D5 learning; the Review Console's `On approval` step invokes `/feedback` per approved row (Phase 4's execution step only confirms the filing landed). |
```

with:

```
| `/wrap-up` | Wrap-up's Upstream feedback curation row stages one upstream proposal per D5 learning; the Review Console presents staged `U#` rows via `_shared/upstream-feedback-batch.md`'s chunked batch contract and invokes `/feedback --pre-confirmed` per checked row on approval (Phase 4's execution step only confirms the filing landed). |
```

Add a new row directly below it, still inside the `## feedback` section's table:

```
| `_shared/upstream-feedback-batch.md` | Step 0 (`--queue`) and Step 7 call into this shared render + chunked-`multiSelect` + drift-fallback contract for 1..N upstream feedback items — see its own file for the full rule. |
```

**6b. `docs/skill-graph.md`, `## wrap-up` section, `/feedback` row.** Replace:

```
| `/feedback` | The Upstream feedback curation row stages one upstream proposal per D5 learning; the Review Console's `On approval` step invokes `/feedback` per approved row. |
```

with:

```
| `/feedback` | The Upstream feedback curation row stages one upstream proposal per D5 learning; the Review Console presents staged `U#` rows via `_shared/upstream-feedback-batch.md`'s chunked batch contract and invokes `/feedback --pre-confirmed` per checked row on approval. |
```

Add a new row directly below it, still inside the `## wrap-up` section's table:

```
| `_shared/upstream-feedback-batch.md` | The Upstream feedback curation row's Review Console presentation calls into this shared batch contract instead of restating the chunking/rendering rules inline. |
```

**6c. `docs/skill-graph.md`, `## flow` section.** Add a new row at the end of that section's table (after the `skills/_shared/integration-branch.md` row):

```
| `_shared/upstream-feedback-batch.md` | `flow/multispec-review-console.md`'s Upstream feedback section calls into this shared batch contract instead of restating the chunking/rendering rules inline — the same contract `wrap-up/review-console.md` uses for a single-spec run. |
```

**6d. `docs/plugin-structure.md`, line 55 (wrap-up sub-file description).** Within that one long cell, replace the substring:

```
review-console.md (the one terminal decision in every mode: its named batch sections, the per-item `Q#`/`M#`/`U#` sections, the auto-merge short-circuit, multi-spec defer, empty-console fast path)
```

with:

```
review-console.md (the one terminal decision in every mode: its named batch sections, the per-item `Q#`/`M#` sections and the batched `U#` section (`_shared/upstream-feedback-batch.md`), the auto-merge short-circuit, multi-spec defer, empty-console fast path)
```

**Commit:** `Update skill-graph and plugin-structure cross-references for batch upstream filing, refs #294`

---

## Task 7: Verification

Work through each acceptance criterion against the edited files (no code to run — this is a
skill-prose change; "testing" means confirming the rewritten text actually states the traced
behavior):

1. **AC1 (3 candidates, no dedup, one call):** trace `feedback/SKILL.md`'s new Step 0 → calls the
   shared contract once with 3 items, 1 chunk (≤4) → contract's Chunking section says exactly 1
   `multiSelect` call, all pre-checked, Question text section's edit-hint sentence appended.
   Unchecking one → Declining-an-item's `--queue` branch: comment + leave open; the other 2 file
   via Step 8.
2. **AC2 (6 candidates → 2 calls, 4 then 2):** contract's Chunking section states this exactly —
   confirm the literal "A batch of 6 renders as 2 calls (4, then 2)" sentence survived Task 1's
   file as written.
3. **AC3 (4 staged `U#`, wrap-up console, one multiSelect call, 4 `--pre-confirmed` invocations,
   none re-asks):** trace `review-console.md`'s rewritten Upstream feedback drill (3d) → contract
   → "On approval" item 9 (3e) → `--pre-confirmed` passed to each of the 4 checked items →
   `feedback/SKILL.md`'s Step 7 `--pre-confirmed` branch skips `AskUserQuestion` absent drift.
4. **AC4 (one staged file edited after staging, before approval):** trace Step 7's drift-fallback
   paragraph (2d) — scrub reruns, diff differs from staged → falls back to normal confirm for that
   one item; the other 3 in the same batch are unaffected (per-item fallback, not batch-wide).
5. **AC5 (Step 6 always reruns):** confirm Step 7's rewritten text (2d) states the scrub rerun is
   unconditional — "always reruns first, regardless of the flag."
6. **AC6 (Component-Skill Contract names the Review Console specifically, prose not code):**
   confirm 2e's added paragraph and grep the rewritten section for the literal string
   `--pre-confirmed` — every occurrence should sit inside that carve-out paragraph or Step 7,
   never a bare unqualified mention.
7. **AC7 (dedup match renders as the literal string, never a separate call):** confirm the
   Chunking section (Task 1) states the literal `⚠ possible duplicate: #{N}` format inside the
   option `description`, and that no other paragraph in Task 1-3's edits describes a separate
   `AskUserQuestion` call for a dedup match.
8. **AC8 (`--dry-run --pre-confirmed` together, 2 candidates, both drafts + destinations shown,
   no `AskUserQuestion`):** confirm Step 7's precedence paragraph (2d) is unconditional on
   `--pre-confirmed`'s presence, and the Input table's `--dry-run` row (2b) cross-references it.
9. **AC9 (skill-graph.md / plugin-structure.md no longer describe `U#` as per-item alongside
   `Q#`/`M#`):** run
   `grep -n '`Q#`/`M#`/`U#`' docs/skill-graph.md docs/plugin-structure.md`
   (backtick-delimited exactly as it appeared pre-edit) — expect zero matches after Task 6.
10. **AC10 (`tests/multi-agent-coordination.test.js` unmodified, still passes):** run
    `npm test -- tests/multi-agent-coordination.test.js` (or the project's full `npm test`) and
    confirm the file is untouched by `git status` / `git diff --stat`.

**Full-repo sweep (breadth check, not itself an AC):**
`grep -rln "staged/wrap-up-upstream\|pre-confirmed" skills/ docs/ bin/`
— confirm every hit is one of Tasks 1-6's edited files, or a file this spec's Non-Goals /
Key Files list explicitly leaves untouched (`bin/lib/wrap-up/registry.js`,
`bin/lib/wrap-up/tests/engine-render.test.js`, `skills/wrap-up/upstream-feedback.md`,
`skills/wrap-up/claude-md-curation.md`, `skills/wrap-up/skill-curation.md`,
`skills/wrap-up/curation-engine.md`, `skills/reflect/hindsight-mode.md`,
`skills/_shared/auto-mode-card.md`, `skills/_shared/auto-mode-contract.md`,
`skills/build/architecture-alignment.md`, `docs/superpowers/plans/*`, `docs/superpowers/specs/*`)
— none of those describe the per-item `U#` mechanics this leaf changes; they only mention
"upstream feedback" generically (the D5 destination name) or `--pre-confirmed`'s neighboring
`--dry-run` convention shape, not this leaf's specific behavior. If any of them turns out to
restate the old per-item `U#` shape on closer reading, add a Task 6 follow-up edit for it — do
not silently leave a stale restatement (`[IL-17]`).

**Commit:** none (verification only) — or fold the sweep's findings into Task 6's commit if any
follow-up edits were needed.
