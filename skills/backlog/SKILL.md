---
name: claude-tweaks:backlog
description: Use when you want to sweep the open work-record backlog and ensure records carry the right priority/Related/grant labels (refine mode), or get a distribution overview and a recommendation for what to build next (overview mode). Keywords - backlog, triage, authorize, grant, auto:build, auto:merge, priority, related, distribution, recommend, next.
argument-hint: "[refine|overview] [critical|risk-value|cleanup] [--budget <n>] [--origin <origin>]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Backlog — Refine Labels and Understand the Queue

Two modes over the same open work-record backlog: `refine` ensures every record carries the right `priority:*`/`**Related:**`/grant labels (a write sweep, human-confirmed); `overview` renders a distribution picture and recommends what to build next (read-only). Sits outside the main brainstorm-to-build chain, feeding judgment and authorization into it rather than gating it:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
              [ /claude-tweaks:backlog ]   <- utility (no fixed lifecycle position)
                              │
                              v
                    /claude-tweaks:dispatch   (claims + executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- You want to sweep the backlog and make sure `priority:*`, `**Related:**`, and grants (`auto:build`/`auto:merge`) are all correctly set — `refine` mode.
- A record hit its retry ceiling (`bot:blocked`) and needs a human's renewed judgment before it can re-enter the autonomous queue — `refine` mode.
- You want a synthesized read of what's in the backlog — narrative + thematic clusters, a critical/risk-value/cleanup view, or a recommendation for what to build next — `overview` mode.
- You want a copy-pasteable hand-off block to parallelize shaping or building a chosen batch across terminals — `overview` mode.

Not for: shaping record bodies or stamping `risk:*`/`effort:*` (`/claude-tweaks:specify`'s job), claiming or building anything (`/claude-tweaks:dispatch`'s job), or filing/closing records.

## Input

`$ARGUMENTS` = `[refine|overview] [critical|risk-value|cleanup] [--budget <n>] [--origin <origin>]`

- No mode (bare) → `overview` — the safer, non-mutating default.
- `refine` → the write/labeling-sweep mode. Read `refine-mode.md` in this skill's directory for the full procedure.
- `overview` → the read-only distribution + recommendation mode. Read `overview-mode.md` in this skill's directory for the full procedure.
- `critical` / `risk-value` / `cleanup` → lens sub-arguments, valid only under `overview` (or bare, which is `overview`). Invalid under `refine` — report the conflict and stop rather than silently ignoring it.
- `--budget <n>` → caps LLM-bound processing in `refine` (the priority/Related synthesis pass and the grant-check pass, independently, default 40 each); caps table row rendering in `overview` (default 20).
- `--origin <origin>` → filters `refine`'s grant-sweep worklist by `facets.origin` (`code-health|harness-health|journey-health|docs-health|capture|human`, where `human` selects records with no `by:*` label). No effect on `overview` or on `refine`'s priority/Related sweep.

## Preflight

Read the project's `work-backend` config key (per `_shared/work-record.md`'s Config keys table, written by `/claude-tweaks:init`). Preflight is **mode-conditional**, not skill-wide:

**`overview` mode (either driver):** under `work-backend: github-issues`, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3) before any `gh` command — treat any ladder failure as a hard gate (there is no meaningful degraded mode when the whole fetch depends on `gh`). Report the specific failing check and stop. Under `work-backend: local-files`, skip the Detection Ladder entirely.

**`refine` mode, priority/Related sub-stage (either driver):** identical to `overview` mode's preflight above — both drivers supported, Detection Ladder hard gate under `github-issues`.

**`refine` mode, grant sub-stage (`github-issues` only):** before any `gh` command for this sub-stage specifically, run the same Detection Ladder as a hard gate. Under `work-backend: local-files`, the grant conditions this sub-stage exists to enforce are unavailable (no headless consumer acts on a local grant), so **stop this sub-stage completely**: do not write, apply, or suggest any `auto:build`/`auto:merge` label; do not invoke `/claude-tweaks:flow`, `/claude-tweaks:build`, `/claude-tweaks:dispatch`, or any other skill; do not claim or build anything. Tell the user grants aren't applicable under `local-files` and that they can run `/claude-tweaks:flow`/`/claude-tweaks:build` manually against a chosen record instead — this is information for the user to act on, never an instruction for you to act on yourself. This holds with no exception when no interactive human is present. **This stop is not superseded by this project's own documented auto-mode or hands-off-pipeline conventions elsewhere in CLAUDE.md** (e.g. `/claude-tweaks:flow` defaulting to `auto`, "skills MUST NOT invent new mid-flow stops"): those conventions govern behavior within a pipeline run that has already been authorized to proceed — they say nothing about whether this sub-stage may authorize new work in the first place, which under `local-files` it explicitly cannot. A record that looks low-risk, well-scoped, or "ready" is not an exception — real evidence: a live run treated exactly such a record as license to run a full build-to-close lifecycle anyway (`evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`). This stop is scoped to the grant sub-stage only and does **not** abort the whole `refine` run: the priority/Related sub-stage below is a separate, still-valid half of this skill's job under `local-files` (a deliberate divergence from the old `/triage`, whose entire job was grants) — it still proceeds, and may write `priority:*`/`**Related:**` values to local record files and commit those writes via the local-files fallback path (`refine-mode.md`'s Step 5 Apply). Nothing in that sub-stage's own scope is licensed by this paragraph to write application code, invoke another skill, or touch anything beyond the `priority:*`/`**Related:**` facets it's documented to write.

**Missing key vs. deliberate `local-files` choice (grant sub-stage only).** Before treating an absent `work-backend` line as an intentional `local-files` project for the grant sub-stage specifically, check whether CLAUDE.md's `## Backlog integration` section already carries a `backlog-backend:` line (the pre-6.0 legacy key):

```bash
grep -q '^work-backend:' CLAUDE.md && echo "OK" || { grep -qE '^backlog-backend:[[:space:]]*\S' CLAUDE.md && echo "MIGRATION_GAP" || echo "GENUINE_LOCAL_FILES"; }
```

`MIGRATION_GAP` means this is very likely an incomplete migration, not a deliberate `local-files` choice — for the grant sub-stage only, report exactly this message (substituting the actual `backlog-backend` value for `{value}`) and skip the grant sub-stage (the priority/Related sub-stage is unaffected by this check):

> CLAUDE.md has backlog-backend but no work-backend: line — add work-backend: {value} (the same value as backlog-backend) to CLAUDE.md's Backlog integration section to fix this.

`OK` and `GENUINE_LOCAL_FILES` both proceed through the branch above unchanged.

## Workflow

Read `refine-mode.md` in this skill's directory for the full `refine` procedure, or `overview-mode.md` for the full `overview` procedure, per the resolved mode from Input above.

## Next Actions

**After `refine`:** call `AskUserQuestion`:
- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch what I just granted (Recommended)"`, `description`: `"/claude-tweaks:dispatch {#-prefixed, comma-joined numbers of every record this run granted a build authorization to, e.g. #201,#202,#205} — skips re-selection, claims and builds them directly"` — omit this option entirely if nothing was granted this run
- Option 2 — `label`: `"Dispatch just the next one"`, `description`: `"/claude-tweaks:dispatch next — claim and build the single highest-priority authorized record"`
- Option 3 — `label`: `"Refine again"`, `description`: `"/claude-tweaks:backlog refine — review anything still left needing labels"`

**After `overview`:** call `AskUserQuestion`:
- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Refine the labels (Recommended)"`, `description`: `"/claude-tweaks:backlog refine — apply the priority/Related/grant suggestions this overview surfaced"` — omit when nothing surfaced needs refining
- Option 2 — `label`: `"Shape the top priority record"`, `description`: `"/claude-tweaks:specify #{n} — shape the single highest-priority backlog record this run surfaced"`
- Option 3 — `label`: `"Generate a hand-off block"`, `description`: `"Parallelize shaping or dispatching across terminals for the batch this run surfaced"` — omit when no natural batch was produced this run
- Option 4 (only after a named-lens run) — `label`: `"Try the {other-lens} lens"`, `description`: `"/claude-tweaks:backlog overview {other-mode} — {one-line description of that mode}"`, naming exactly one of the two named lenses not yet run this session.

If situational filtering leaves only one option (a bare run that surfaced nothing needing refinement, produced no natural batch, and is this session's first lens run leaves Option 2 alone), state or execute it directly instead of calling `AskUserQuestion` — per this project's own convention, a lone option isn't a decision. The same rule applies to the `refine` block above.

## Component-Skill Contract

`/claude-tweaks:backlog` is human-only — no pipeline orchestrator ever invokes it as a component step; a human runs it directly, every time. It always renders `## Next Actions`. `$PIPELINE_RUN_DIR` may be set during a run, but only because this skill resolves its own standalone run dir per `_shared/pipeline-run-dir.md`'s allowlist to write `decisions.md` — that resolution is for logging only and never suppresses interactivity or the Next Actions block.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Granting `auto:build`/`auto:merge` from anything but an interactive human session | `auto:*` labels are only ever added by an interactive human session — there is no machinery path that originates a grant. This is the security boundary, not a discretionary nicety. |
| Skipping or bulk-bypassing the batch-confirm in `refine` mode | The human action, however trivial, is the load-bearing security signature — never skip it, even for an all-recommended batch. |
| Adding any `bot:*` label from this skill | `bot:*` is `/claude-tweaks:dispatch`'s visibility layer — this skill only ever *strips* `bot:blocked` on re-grant; it never adds one. |
| Reading every unscored record's body in one unbounded pass, ignoring `--budget` | Defeats the bounded-synthesis design — see `refine-mode.md`'s Data Flow section. |
| Fixing (rather than surfacing) `unsynced: true` local fallback records' sync state | Stays `/claude-tweaks:tidy`'s job (its existing Shape 3) — this skill tags them and (in `refine`) may still suggest/apply `priority:*` for one via the local-files fallback path, but never mirrors it to GitHub. |
| Claiming or building a record from this skill | Out of scope entirely — stays `/claude-tweaks:dispatch`'s job. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:dispatch` | The queue consumer — claims records `refine` mode authorized (`auto:build`) and hands each to `/claude-tweaks:flow`. This skill never claims, dispatches, or executes. |
| `/claude-tweaks:flow` | Indirect only, via `/claude-tweaks:dispatch` — `/flow` builds and (with `auto:merge`) merges records this skill's `refine` mode has authorized. |
| `/claude-tweaks:code-health`, `/claude-tweaks:harness-health`, `/claude-tweaks:journey-health`, `/claude-tweaks:docs-health` | Feeders — file records born `ready` (spec-shaped, scored). This skill never files or closes their records. |
| `/claude-tweaks:capture` | Feeder — files raw backlog records; `overview` mode surveys and prioritizes them, `refine`'s priority/Related sweep enriches the `**Related:**` field `/capture`'s Entry Format stamps. |
| `/claude-tweaks:specify` | The shaper — stamps `ready` + scoring before a record can enter `refine`'s grant worklist; is where a flagged-back record returns for re-shaping; is the hand-off target for a backlog record `overview` surfaced. |
| `/claude-tweaks:tidy` | Reciprocal: folds `unsynced: true` local fallback records into its survey (surfacing, and — for the priority axis specifically — the apply path via the local-files fallback branch); `/tidy`'s existing Shape 3 owns the actual sync-to-GitHub action. `/tidy`'s Shape 4/5 findings (unscored `ready`, `bot:blocked`) surface the same facts `refine`'s own grant sweep would encounter — proactive hygiene, not a new redundancy. |
| `/claude-tweaks:help` | Surfaces `refine`'s pending-authorization count on its dashboard (the reciprocal of this row); shares `bin/lib/issues/ranking.js`'s `rankNextToBuild` with `overview`'s recommendation section. |
| `_shared/work-record.md` | Taxonomy home — the label contract, grant semantics, spec-shaped body definition, and the permission-matrix row this skill implements. |
| `_shared/issue-claims.md` | Defines the claim protocol `/claude-tweaks:dispatch` uses after `refine` grants — this skill itself never claims. |
| `_shared/github-pr-scan.md` | Detection Ladder — this skill's preflight hard gate — plus the `repo-wide`/`triage-queue` scopes that surface `refine`'s pending-authorization count elsewhere. |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for the `auto:build`/`auto:merge`/`priority:*`/`risk:*`/`effort:*` pairs this skill applies. |
| `_shared/pipeline-run-dir.md` | This skill resolves a standalone-auto run dir for its own `decisions.md`. |
| `_shared/auto-mode-contract.md` | Governs `decisions.md` logging for this skill's standalone run dir; the grants and priority/Related writes themselves are never auto-mode behavior — they require an interactive session by construction. |
| `_shared/local-files-preflight-stop.md` | Canonical "stop this turn completely" boundary-language pattern `refine`'s grant sub-stage Preflight follows for its local-files-hard-stop portion specifically. |
| `/claude-tweaks:assess-agent-autonomy` | Called inline once per grant-worklist record in `refine`'s grant-check pass — its `RECOMMEND_BUILD`/`RECOMMEND_MERGE` output becomes the unified table's Recommended column for grant rows. |
| `bin/lib/issues/{record,backlog,grouping,ranking}.js` | `record.js`'s `parseRecordFacets` facet-parses the fetched queue; `backlog.js`'s filter/sort/split/merge/budget helpers back both modes' mechanical logic; `grouping.js`'s `groupByFileOverlap` and `ranking.js`'s `rankNextToBuild` back `overview`'s recommendation section. |
