# Intake — the braindump gatekeeper

**Status:** Design — brainstormed 2026-08-29/30 from a maintainer request ("I often have a braindump I want to give Claude in relation to a repo, and what I want is for it to just find the right shelf"). No prior backlog record; a `gh` search on braindump / intake / curate / inbox / triage found nothing on this topic.

## Problem

Every entry point the plugin has today assumes **one item of one kind**:

| Shelf | Writer today | Takes a braindump? |
|---|---|---|
| Backlog record | `/claude-tweaks:capture` | One idea, under a ~400-char stub cap; longer text is bounced to `/superpowers:brainstorming`. `--batch` exists but wants a pre-split JSON file. |
| Absorb into an existing record | `/capture`'s routing (`absorb:N`) | Per idea, after filing |
| Design doc → spec | `/claude-tweaks:specify <topic>` | One topic |
| Upstream plugin issue | `/claude-tweaks:feedback` | One learning |
| Memory / CLAUDE.md rules / docs, ADRs, journeys | `_shared/learning-routing.md`'s D1–D5 classifier | **Retrospective learnings only** — exhaust from a build, consumed by `/reflect`, `/wrap-up`, `/review`, the health sweeps. |
| Digest | `_shared/materiality-floor.md` | Explicitly excludes human input ("intent, never exhaust"). |

A real braindump is **N items of mixed kinds**: work items, half-decisions, complaints about a tool, preferences about how the maintainer wants to work, observations that are already fixed, ideas that belong to a different repo, and noise. The maintainer's own sample was a saved-links queue — reels, an X post, a Reddit thread, each with a zero-to-two-word private label ("Marketing", "Design //", "Recipe map"). After the maintainer's user-config extraction skills turn those into text, the result is a set of candidate ideas that still needs sorting against *one repo's* shelves.

The missing capability is the sorter: **split → judge each fragment against this repo → dedup against what is already on the shelves → one batch table → hand the survivors to the writers that already exist.** Nothing today does the split or the cross-shelf, forward-looking classification.

## Scope and boundaries

- **Extraction is out of scope.** Video/URL → text is the maintainer's user-config skills' job (`video-extract` and friends). Intake never touches a URL; a fragment that is only a URL is a `nudge` ("what's in this?"), never an extraction attempt.
- **One repo per run.** Intake runs in the cwd project and judges against *that* project. Cross-repo routing is not a routing problem for intake — the maintainer dumps in the repo they mean; fragments for another repo come back as a paste-ready carry-over block.
- **Strict gate, one nudge.** Only "actionable in this repo" survives to a record. Everything else is a visible row with a stated reason. A relevant-but-vague fragment gets exactly one question, once; there is no tiered "inspiration" shelf (the graveyard `/capture`'s anti-patterns table already warns about).
- **Human gatekeeper, by definition.** No `auto` mode, never invoked inside `/flow`, no headless form. Recorded as a decision below so it is not "added later".

## Non-Goals

- A new `_shared/*.md` contract. The relevance judgment has one consumer; per `docs/skill-authoring.md`'s "Inline `_shared` contract vs a new component skill" rule it stays inside the skill until a second consumer holding the same context appears.
- New labels, policy keys, hooks, or `bin/` code. Provenance rides in the record body's `Context:` line; `by:capture` stays the origin label because `/capture` does the filing.
- Changing how `/capture` files, absorbs, judges type, or judges definition. Intake composes stub entries and delegates; every existing `/capture` branch runs unchanged.
- A persistent inbox or an integration with the maintainer's saved-links source (Reminders, etc.). Input is text — pasted or a file.

## Design

### Name

`/claude-tweaks:intake`. `curate` (the maintainer's first word for it) collides with vocabulary the plugin already uses — `/wrap-up`'s skill/docs/CLAUDE.md curation rows and `curation-engine.md` — and `/triage` is a retired skill name (#69). `intake` is the gatekeeper term and the most discoverable. Cosmetic to the design; rename at plan time if the maintainer prefers `sift`.

### Lifecycle position

`dump → /claude-tweaks:intake → /claude-tweaks:capture → /claude-tweaks:specify`. Intake sits *before* `/capture` — it is the only skill that runs before any record exists on the chosen fragments' behalf. `docs/skill-graph.md` records the edges; the SKILL.md carries only the one-line `Lifecycle:` marker.

### Input

`/claude-tweaks:intake [<dump text>] [--file <path>]`

| Argument | Behavior |
|---|---|
| Free text | The dump. Multi-line is expected; a single line is a legal one-fragment dump. |
| `--file <path>` | Read the dump from a file instead. Mutually exclusive with free text — both supplied is a hard error, not a merge. |
| (empty) | Prompt for a paste. |

No mode flags. No `auto`, `confirm`, or `--yes`.

### Context, read once

Before any judgment, the same sources the plugin already reads elsewhere — no new probes:

1. `CLAUDE.md` (What-this-is / Stack / Structure / Philosophy sections) and the README head — what the repo *is*, so relevance has a referent.
2. The session-scoped open-record snapshot (`_shared/record-queue-fetch.md`) — titles and bodies, for dedup and absorb candidates.
3. Recent merged commits on the integration branch — `_shared/integration-branch.md` for the branch, `_shared/health-recent-commit-check.md` for the window and the matching discipline — for "already shipped".
4. `work-backend` / `work-types` from CLAUDE.md's `## Work records` — so the writers get the right flags.

### Fragmenting

The dump is split into numbered fragments F1…Fn, one idea each:

- Bullets, numbered lines, and blank-line paragraphs are boundaries; consecutive lines continuing one thought are merged. This is a judgment, not a regex — the skill states the rule and the model applies it.
- Each fragment keeps its **verbatim source text**.
- A leading label is captured as the fragment's **hint**: `Marketing //`, `Design //`, or a bare leading word before a URL or sentence (`Recipe map https://…`). The hint is the maintainer's prior on the shelf. A verdict may overrule it, but the rationale must say so.
- Within-dump duplicates: the later fragment is a `drop` citing the earlier one.

### Verdict vocabulary

Every fragment gets exactly one verdict from a closed set, evaluated **in this order — first match wins**, the same discipline as `learning-routing.md`'s classifier:

| # | Verdict | Fires when | Writer |
|---|---|---|---|
| 1 | `drop` | No idea in it (pure noise), or a within-dump duplicate | none — visible row with the reason |
| 2 | `shipped` | Already delivered: a recent merge or a closed record covers it | none — row cites `#N` or the commit |
| 3 | `absorb:#N` | Same topic as an **open** record. Topic-level judgment against titles/bodies — deliberately *not* `/capture`'s two-criteria bar (shared file path + matching type), which a reel-derived idea can never meet. `/capture`'s absorb exclusions still apply: never a closed record, a `parent-issue` carrier, or a `bot:in-progress` carrier. | `/claude-tweaks:capture "<text>" --route=absorb:N --source intake`, one call per fragment |
| 4 | `upstream` | A learning about the plugin itself that would hold in any repo — `learning-routing.md` rule 1. Collapses in the claude-tweaks repo itself per that file's self-reference rule (re-run from rule 4 → an ordinary `file`/`absorb`). | `/claude-tweaks:feedback "<text>"` |
| 5 | `remember` | About the maintainer, or a tooling/environment fact with no owning artifact — `learning-routing.md` rules 2–3 | `learning-routing.md`'s "Memory write procedure (D4)", inline |
| 6 | `file` | Relevant to this repo, actionable, new | `/claude-tweaks:capture --batch` entry |
| 7 | `nudge` | Relevant to this repo but too vague to file — one concrete question | Re-judged after the answer into 3 / 6 / 8; unanswered → `drop — unanswered` |
| 8 | `not-here` | An idea, but for another repo or process | Carry-over block in the report |

**Relevance** — the gate between 6–7 and 8 — is: *does the fragment name or imply a change to something this repo owns* (code, skills, docs, process) per the context read above. Not "loosely related". The hint counts as evidence; so does the repo's own vocabulary appearing in the fragment.

**Why this ordering.** `drop` and `shipped` first so dedup never files. `absorb` before `upstream`/`remember` so an existing record on the topic wins over a new store. `upstream` before `remember` mirrors learning-routing's own load-bearing "D5 before D4" rule. `file` before `nudge` so a clear fragment is never asked about. `not-here` last: it is the residual for anything that is an idea but has no owner here.

**Guardrails on the judge.**

- The CLAUDE.md "no implicit deferrals" rule governs *work being deferred*, not ideas. Intake is never obligated to file — `drop` and `not-here` with a stated reason are first-class outcomes, and human input never routes to the digest (`_shared/materiality-floor.md`'s override).
- A `file` entry is always a **stub**: `/capture`'s Entry Format (`**Related:**` / `Context:` / `Scope:`), under its ~400-char cap. `Context:` carries `From intake {YYYY-MM-DD}` plus the hint when there is one. Intake never composes a spec-shaped body; a fragment that would need one is a `nudge` toward `/superpowers:brainstorming` — exactly the split `/capture`'s hard-cap section already makes.
- `/capture`'s own type guess and definition judgment still run per entry; intake does not pass `--type=` or `--needs-definition` unless the fragment states it outright.

### The table and the nudge round

One rendered batch table, recommendations pre-filled — the plugin's multi-item pattern (`docs/skill-authoring.md`):

```
| F | Hint       | Fragment (first ~80 chars)            | Verdict     | Why / target                                 |
|---|------------|----------------------------------------|-------------|----------------------------------------------|
| 1 | Design //  | "hover states should fade not snap…"   | absorb:#573 | same topic — design-wrapper extension point   |
| 2 | —          | "hate that specify asks twice about…"  | upstream    | plugin behavior, holds in any repo            |
| 3 | Speed //   | "the reel about batching…"             | nudge       | Q: batching what — dispatch groups, or tests? |
| 4 | Recipe map | "…"                                    | not-here    | no owner in this repo                         |
| 5 | —          | "sweep-shadow silent exit"             | shipped     | #1171                                         |
```

Then exactly one `AskUserQuestion` — **Apply all (Recommended)** / **Override rows**. Override takes free text (`F1 file, F4 drop`), re-renders only the changed rows, and asks no second question.

If any `nudge` rows exist, one free-text prompt follows listing their questions. The maintainer answers the ones they want and skips the rest. Answered nudges are re-judged into `file` / `absorb` / `not-here`; skipped ones become `drop — unanswered`. **One nudge round, never a loop** — the cap that keeps intake a gatekeeper rather than a conversation.

### Execution

Executed by the existing writers, never by intake itself:

| Verdict | Mechanism |
|---|---|
| `file` | One JSON entry file (`{title, body}` per entry, `/capture`'s batch-mode shape) written to the session tmp root (`_shared/session-tmp-root.md`), then `Skill(skill: "claude-tweaks:capture", args: "--batch <path> --route=keep --source intake")`. `--route=keep` because intake already made the routing decision. |
| `absorb:#N` | `Skill(skill: "claude-tweaks:capture", args: "<text> --route=absorb:N --source intake")` per fragment — batch mode deliberately does not offer absorb, so each is a single invocation. |
| `upstream` | `Skill(skill: "claude-tweaks:feedback", args: "<text>")`. `/feedback`'s own scrub and confirm gate stay in force: filing on a public repo is an outward-facing action, and the intake table approved the *routing*, not the scrubbed text. `--pre-confirmed` is not used — its contract requires a staged-file path and an approved snapshot body (the wrap-up console's mechanism), which intake has no reason to construct. |
| `remember` | `learning-routing.md`'s "Memory write procedure (D4)", inline. |
| `shipped`, `drop`, `not-here` | Nothing written. |

Commit is `/capture`'s concern (it commits on `local-files`; nothing to commit on `github-issues`). Per-entry failures come back from `/capture`'s Batch Summary and are re-rendered as failed rows in intake's report — never swallowed.

### One expand-only change to `/capture`

Today *any* `--source` value marks a filing as a deferral and hard-requires `--defer-reason=` (SKILL.md's Shaped-body branch, precedence item 2: "the rule keys on 'any `--source`', not named producers"). Intake input is human intent, not exhaust, so:

- `--source intake` becomes a **named parent signal that is exempt from the deferral check**. It still suppresses `/capture`'s `## Next Actions` (Component-Skill Contract) and still fires the headless absorb bar's *trigger* — but the bar's file-path criterion cannot match a stub that names no file, so in practice it files fresh, which is what intake wants.
- Intake is added to `/capture`'s parent list in its Component-Skill Contract.
- Nothing is removed; every other `--source` value keeps today's deferral semantics. This is the expand step of expand-contract; there is no contract step because nothing is deprecated.

Without this, intake would either have to invent a `Defer-reason:` (a lie) or let `/capture` render a Next Actions block mid-report.

### Report

In order:

1. `### Actions Performed` — `| Action | Detail | Ref |` rows: `Filed #N`, `Absorbed into #N`, `Upstream #N`, `Remembered <file>`, `Failed — {error}`.
2. **Dropped** — every `drop`, `shipped`, and unanswered-nudge row with its reason. Nothing silent.
3. **Carry-over** — the verbatim source text of every `not-here` fragment as one paste-ready block, so the next repo's dump is a paste, not a re-extraction.
4. `## Next Actions` — plain markdown, fully-qualified: **`/claude-tweaks:specify #N[,#M…]`** for the filed set (recommended, bold), `/claude-tweaks:backlog overview`, `/claude-tweaks:tidy`.

### Registration

- `plugin/skills/intake/SKILL.md` — frontmatter (`name`, `description`, `argument-hint`), the interaction-style directive, H1, the `Lifecycle:` line, When to Use, Input, numbered steps (Context → Fragment → Judge → Table → Nudge → Execute → Report), Anti-Patterns. The verdict table and its ordering live in SKILL.md; only if the file nears the 40 KB soft ceiling does the nudge/report prose move to a cited sub-file.
- `docs/skill-graph.md` — intake's section: edges to `/capture` (parent), `/feedback`, `/specify` (Next Actions), `_shared/learning-routing.md`, `_shared/record-queue-fetch.md`, `_shared/health-recent-commit-check.md`, `_shared/integration-branch.md`, `_shared/session-tmp-root.md`. `/capture`'s section gains the parent edge.
- `plugin/skills/help/reference-card.md` (Lifecycle table, before `/capture`), `/help`'s lifecycle diagram and the README's artifact-lifecycle diagram (must stay in sync and list all skills), `docs/plugin-structure.md`'s skill table.
- Version: minor, via `release.js` at ship — never hand-bumped in the PR.

### Testing

`tests/` conformance suites, `node --test`, each written red-first by reverting the asserted text (`docs/skill-authoring.md`; the `skill-prose-conformance-tests` skill):

- The verdict set is closed and appears in the designed order, with `drop` and `shipped` before `absorb`, `upstream` before `remember`, `file` before `nudge`, `not-here` last.
- The "no `auto` mode / never inside `/flow`" decision is stated in the SKILL.md.
- `/capture`'s `--source intake` deferral exemption is present and names intake in the parent list.
- Every skill reference in actionable text is fully-qualified (`/claude-tweaks:…`), frontmatter shape, interaction-style directive byte-identical to the other skills.
- The existing skill-catalog conformance tests (reference card, skill-graph, lifecycle diagrams) pass with the new skill listed.

No `bin/` code, so no unit tests beyond the conformance suites. A fixture dump under `tests/fixtures/` (the maintainer's sample, extracted to text) is the dogfood input for a manual first run.

### Rollout

Additive: one new skill directory, one exemption clause in `/capture`, catalog and graph entries. No installed-build compatibility concern — the only contract touched (`--source intake`) is new, and an older installed `/capture` fed `--source intake` fails loud on the missing `--defer-reason=` rather than misfiling.

## Alternatives Considered

**Dump mode on `/capture`** (`--dump`, or auto-detect multi-line input). Rejected: `/capture` is a *record producer* — its shaped-body branch, born-ready chain, and headless bar all assume one item in — and a splitter plus a relevance gate plus `drop`/`not-here` semantics inverts that purpose. It is also at 376 lines near its size ceiling, so the addition would force an extraction anyway: approach A with a worse name.

**`/tidy` scope.** Rejected: tidy is hygiene on records that exist; intake happens before any record exists.

**A `_shared/intake-routing.md` contract generalizing `learning-routing.md`.** Deferred, not rejected: one consumer today. The verdict table cites learning-routing's rules by number where they apply (4, 5) rather than restating them, so a later extraction has a clean seam.

**Tiered gate with an inspiration/reference shelf.** Rejected by the maintainer in favor of strict-plus-one-nudge: a third shelf for "relevant but not actionable" becomes the graveyard `/capture`'s anti-patterns already warn about.

**Reusing `/capture`'s absorb bar for dedup.** Rejected: it requires a shared file path plus matching type, which reel-derived and process-level ideas never satisfy; intake needs topic-level similarity, and hands the candidate it finds to `/capture --route=absorb:N`, which then applies its own mechanics.

## Open Questions for Implementation

- Whether `/capture`'s batch mode's own `AskUserQuestion` ("route the batch as a set") is suppressed by `--route=keep` in the parent-invoked case — the design assumes yes (the `--route` fast path says "no further prompt"); the plan verifies against `capture/batch-mode.md`.
- The exact within-turn sequencing when a run has both `file` entries and several `absorb:#N` calls — one `--batch` invocation followed by N single invocations, or absorbs first. Cosmetic; the plan picks one and the conformance test pins nothing about it.
- Whether the fixture dump lives under `tests/fixtures/` or `evals/` — it is dogfood input, not an assertion.

## Decisions recorded

- **No `auto` mode, ever.** Intake is the human gatekeeper; a headless intake would file on the maintainer's behalf from unreviewed text. Revisit only if a scheduled producer of pre-extracted ideas appears *and* the trust ledger has a class for it.
- **Strict gate, one nudge round.** Chosen by the maintainer over a tiered gate.
- **Extraction stays in user config.** claude-tweaks never fetches URLs on intake's behalf.
- **`--source intake` is exempt from `/capture`'s deferral check.** Human intent is not exhaust; the exemption is named, not a loosening of the "any `--source`" rule for other producers.
