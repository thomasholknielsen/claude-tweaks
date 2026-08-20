---
name: backlog
description: Use for backlog labels (refine), next-build pick (overview), headless grants, or a needs-you list (attention). Keywords - backlog, triage, authorize, grant, auto:build, auto:merge, priority, related, unattended, headless, autonomy ceiling.
argument-hint: "[refine|overview|grant|attention] [critical|risk-value|cleanup|trust] [--budget <n>] [--origin <origin>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.

# Backlog — Refine Labels and Understand the Queue

Four modes over the same open work-record backlog: `refine` ensures every record carries the right `priority:*`/`**Related:**`/grant labels (a write sweep, human-confirmed); `overview` renders a distribution picture and recommends what to build next (read-only); `grant` is the headless machine-grant sweep (`work-backend: github-issues` only, opt-in); `attention` is a read-only, ranked discovery list of every open record carrying `needs:definition`, `solution:unjustified`, or an ungranted `shaped:headless` spec. Sits outside the main brainstorm-to-build chain, feeding judgment and authorization into it rather than gating it:

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
                    /claude-tweaks:dispatch   (selects + executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- You want to sweep the backlog and make sure `priority:*`, `**Related:**`, and grants (`auto:build`/`auto:merge`) are all correctly set — `refine` mode.
- A record hit its retry ceiling (`bot:blocked`) and needs a human's renewed judgment before it can re-enter the autonomous queue — `refine` mode.
- You want a synthesized read of what's in the backlog — narrative + thematic clusters, a critical/risk-value/cleanup/trust view, or a recommendation for what to build next — `overview` mode.
- You want a copy-pasteable hand-off block to parallelize shaping or building a chosen batch across terminals — `overview` mode.
- A scheduled Routine (or a human standing in for one) needs to sweep the `ready` queue and machine-grant every record whose gate chain fully clears, with no per-record decision to answer — `grant` mode, `github-issues` only, and only once a project has deliberately opted into the `autonomy: unattended` ceiling plus its `grant-origination-enabled` policy key.
- You want one ranked list of every open record carrying `needs:definition`, `solution:unjustified`, or an ungranted `shaped:headless` spec, with a per-row recommended action — `attention` mode, `github-issues` only.

Not for: shaping record bodies or stamping `risk:*`/`size:*` (`/claude-tweaks:specify`'s job), claiming records (`/claude-tweaks:flow`'s Step 2.8 job) or building anything (`/claude-tweaks:dispatch`'s hand-off to `/flow`), or filing/closing records.

## Input

`$ARGUMENTS` = `[refine|overview|grant|attention] [critical|risk-value|cleanup|trust] [--budget <n>] [--origin <origin>]`

- No mode (bare) → `overview` — the safer, non-mutating default.
- `refine` → the write/labeling-sweep mode. Read `refine-mode.md` in this skill's directory for the full procedure.
- `overview` → the read-only distribution + recommendation mode. Read `overview-mode.md` in this skill's directory for the full procedure.
- `grant` → the headless machine-grant mode. Read `grant-mode.md` in this skill's directory for the full procedure. This is `/dispatch next`'s headless-unit shape applied to granting: no `AskUserQuestion` decides any individual grant — the gate chain (`bin/lib/issues/grant-gate.js`) decides, mechanically, per record.
- `attention` → the read-only, `github-issues`-only discovery mode over `needs:definition`/`solution:unjustified` records and ungranted `shaped:headless` specs. Read `attention-mode.md` in this skill's directory for the full procedure.
- `critical` / `risk-value` / `cleanup` / `trust` → lens sub-arguments, valid only under `overview` (or bare, which is `overview`). Invalid under `refine`, `grant`, and `attention` — report the conflict and stop rather than silently ignoring it.
- `--budget <n>` → caps LLM-bound processing in `refine` (the priority/Related synthesis pass and the grant-check pass, independently, default 40 each) and in `grant` (the grant-check pass over gate-1-3-cleared candidates, default 40, same as refine's own grant-check budget); caps table row rendering in `overview` (default 20). No effect on `attention`, which is entirely mechanical (no per-record LLM reads) and bounds itself via each fetch's own `--limit 200`.
- `--origin <origin>` → filters `refine`'s grant-sweep worklist by `facets.origin` (`code-health|harness-health|journey-health|docs-health|capture|human`, where `human` selects records with no `by:*` label). No effect on `overview`, `grant` (`grant` mode's own origin gate already excludes every `human`-origin record unconditionally — see Grant semantics in `_shared/work-record.md`), `attention`, or on `refine`'s priority/Related sweep.
- `--trust` → boolean presence flag, `refine` mode only — forces the trust-table fetch (and its Trust evidence rendering) at any ceiling; without it, `refine` fetches trust only when the `autonomy` ceiling resolves `trusted` or higher.

## Preflight

Read the project's `work-backend` config key (per `_shared/work-record-config.md`, the key table's canonical home, written by `/claude-tweaks:init`). Preflight is **mode-conditional**, not skill-wide:

**`overview` mode (either driver):** under `work-backend: github-issues`, run the Detection Ladder from `_shared/forge-detection.md` (checks 1-3) before any `gh` command — treat any ladder failure as a hard gate (there is no meaningful degraded mode when the whole fetch depends on `gh`). Report the specific failing check and stop. Under `work-backend: local-files`, skip the Detection Ladder entirely.

**`refine` mode, priority/Related sub-stage (either driver):** identical to `overview` mode's preflight above — both drivers supported, Detection Ladder hard gate under `github-issues`.

**`refine` mode, grant sub-stage (`github-issues` only):** before any `gh` command for this sub-stage specifically, run the same Detection Ladder as a hard gate. Under `work-backend: local-files`, the grant conditions this sub-stage exists to enforce are unavailable (no headless consumer acts on a local grant), so **stop this sub-stage completely**: do not write, apply, or suggest any `auto:build`/`auto:merge` label; do not invoke `/claude-tweaks:flow`, `/claude-tweaks:build`, `/claude-tweaks:dispatch`, or any other skill; do not claim or build anything. Tell the user grants aren't applicable under `local-files` and that they can run `/claude-tweaks:flow`/`/claude-tweaks:build` manually against a chosen record instead — this is information for the user to act on, never an instruction for you to act on yourself. This holds with no exception when no interactive human is present. **This stop is not superseded by this project's own documented auto-mode or hands-off-pipeline conventions elsewhere in CLAUDE.md** (e.g. `/claude-tweaks:flow` defaulting to `auto`, "skills MUST NOT invent new mid-flow stops"): those conventions govern behavior within a pipeline run that has already been authorized to proceed — they say nothing about whether this sub-stage may authorize new work in the first place, which under `local-files` it explicitly cannot. A record that looks low-risk, well-scoped, or "ready" is not an exception — real evidence: a live run treated exactly such a record as license to run a full build-to-close lifecycle anyway (`evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`). This stop is scoped to the grant sub-stage only and does **not** abort the whole `refine` run: the priority/Related sub-stage below is a separate, still-valid half of this skill's job under `local-files` (a deliberate divergence from the old `/triage`, whose entire job was grants) — it still proceeds, and may write `priority:*`/`**Related:**` values to local record files and commit those writes via the local-files fallback path (`refine-mode.md`'s Step 5 Apply). Nothing in that sub-stage's own scope is licensed by this paragraph to write application code, invoke another skill, or touch anything beyond the `priority:*`/`**Related:**` facets it's documented to write.

**`grant` mode (`github-issues` only):** run the Detection Ladder as a hard gate before any `gh` command. Under `work-backend: local-files`, **stop this mode completely** with the identical wording and identical scope as `refine`'s grant sub-stage stop above (same rationale: no headless consumer acts on a local grant, this holds with no exception when no interactive human is present, and it is not superseded by any auto-mode convention). There is no partial-proceed here the way `refine` has a priority/Related sub-stage to fall back to — `grant` mode's *entire* job is granting, so the stop is the whole mode's behavior for this turn, exactly like `/claude-tweaks:dispatch`'s own `work-backend: local-files` Preflight stop.

**`attention` mode (`github-issues` only):** run the Detection Ladder as a hard gate before any `gh` command. Under `work-backend: local-files`, **stop this mode completely** — there is no local-files fetch implemented (all three label queries this mode runs are `gh issue list` calls with no local-files analog); tell the user this mode isn't available under `local-files` and that `/claude-tweaks:help`'s Needs Attention table still surfaces the `needs:definition`/`solution:unjustified` pair per-record via its own Definition/Framing flags, but has no equivalent flag for the `shaped:headless (no grant)` type — a known gap, not parity.

## Workflow

Read `refine-mode.md` in this skill's directory for the full `refine` procedure, `overview-mode.md` for the full `overview` procedure, `grant-mode.md` for the full `grant` procedure, or `attention-mode.md` for the full `attention` procedure, per the resolved mode from Input above.

## Routine Configuration

`/backlog` ships a routine template (`skills/backlog/routine-template.yml`) whose prompt is `/claude-tweaks:backlog grant` — the headless machine-grant form, the only one of this skill's modes a scheduled Routine ever fires (the rest are human-only, per the Component-Skill Contract below). It is the conditional grant unit in `routine/fleet.md`'s fleet composition table, scheduled weekdays in the off-peak window between the finder routines and the dispatch drain. Instantiate it for the current project with:

```
/claude-tweaks:routine create backlog
```

Scheduling it does not make it grant anything. Every firing is a cheap no-op — report nothing, exit clean — until a human has set **both** `autonomy: unattended` and `grant-origination-enabled: true` in `.claude-tweaks/policy.yml` (`grant-mode.md` Step 0). That two-key opt-in is the security boundary this skill's Anti-Patterns table describes; the routine only becomes live once a human turns both keys on.

## Next Actions

**After `refine`:** render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`/claude-tweaks:dispatch {#-prefixed, comma-joined numbers of every record this run granted a build authorization to, e.g. #201,#202,#205}`** — skips re-selection, claims and builds them directly (recommended) — omit this line entirely if nothing was granted this run
**`/claude-tweaks:dispatch next`** — claim and build the single highest-priority authorized record (recommended) — bold and suffix `(recommended)` only when the dispatch line above is omitted
`/claude-tweaks:backlog refine` — review anything still left needing labels

**After `overview`:** The rendered recommendation is never a static tag on one line — it is computed fresh each run and MUST be attached to exactly the line whose action matches the report's closing `Next:` line (Step 4's two-channel contract — the close-out block carries this-session moves only, never other-terminal command lists), resolving through the three-level precedence (needs-you first, then executable Dispatch entry, then fallback ladder): whichever line that resolves to renders first, bolded, with `(recommended)`, ahead of the lines below in their listed order. Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

`{the top item's launcher — /claude-tweaks:specify #N or /claude-tweaks:challenge #N}` — the one move only the human can make — omit this line when `needsYou` is empty
`/claude-tweaks:flow {top-ranked executable Dispatch entry's refs, comma-joined}` — run the report's top Dispatch terminal in this session — omit when the Dispatch block contains no executable entry
`/claude-tweaks:backlog refine` — apply the priority/Related/grant suggestions this overview surfaced — omit when nothing surfaced needs refining
`/claude-tweaks:specify #{n}` — shape the single highest-priority backlog record this run surfaced — omit when the run surfaced no unshaped backlog record to shape (the `#{n}` placeholder must always resolve to a real record)
`/claude-tweaks:backlog grant` — machine-grant sweep over the whole ready queue: applies auto:build (+auto:merge where its own checks clear) to every ready-but-ungranted record whose gate chain clears, headless, no per-record confirmation, capped by --budget — omit when the fallback ladder's grant rung isn't what the report's `Next:` line names. The annotation states the sweep's real scope deliberately — `grant` has no single-record form, so a line promising to grant only "the top record" would misstate what running it authorizes
`/claude-tweaks:backlog overview {other-mode}` — {one-line description of that mode} — only after a named-lens run, naming exactly one of the named lenses not yet run this session

When situational filtering leaves **zero** lines, or the report's closing `Next:` line reads `backlog is empty` (even when the named-lens line could technically still render — the terminal takes precedence over it), restate the report's own closing `Next:` line as the terminal statement instead of rendering a markdown block. Restate, never substitute a fresh claim: the report's `Next:` line — not this block's line count — owns the queue-state verdict, and the two can diverge (an all-in-flight queue also filters every line out, but its backlog is anything but empty; whatever the report's line says there is what this block mirrors).

**After `grant`:** render only when a human is present to answer — mirrors `/claude-tweaks:dispatch`'s own `next` form rule (`dispatch/SKILL.md`'s Next Actions) exactly, since `grant` mode is the same headless-unit shape: a human typed `/claude-tweaks:backlog grant` directly, or a prior skill invoked it on a human's behalf → render; a scheduled Routine fired it → never render (nobody is present to answer, and an unanswered question at the end of a headless run is noise — the durable trace is the label state, the audit comments, and `decisions.md`, per `_shared/pipeline-run-dir.md`'s standalone-auto allowlist). When rendering, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`/claude-tweaks:dispatch {#-prefixed, comma-joined numbers of every record this run granted a build authorization to}`** — skips re-selection, claims and builds them directly (recommended) — omit this line entirely if nothing was granted this run
**`/claude-tweaks:backlog grant`** — sweep anything still eligible since this run's --budget cap or new ready records (recommended) — bold and suffix `(recommended)` only when the dispatch line above is omitted

`/claude-tweaks:routine create backlog` — instantiate this sweep as a live weekday scheduled Routine (see Routine Configuration above) — omit this line when the project's `autonomy` ceiling is below `unattended` or `grant-origination-enabled` is unset, since the routine would only ever fire a no-op until a human turns both keys on

**After `attention`:** render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`{the exact recommended-action command for the record named in attention-mode.md's 'Pick up next' line}`** — act on the top pick (recommended) — omit this line entirely when the list was empty
`/claude-tweaks:backlog attention` — re-check after acting on one or more records

If the list was empty, state that directly instead of rendering this block — there is nothing to act on.

## Component-Skill Contract

`/claude-tweaks:backlog` is human-only for `refine`, `overview`, and `attention` — no pipeline orchestrator ever invokes any of the three as a component step; a human runs them directly, every time, and they always render `## Next Actions`. `grant` mode is the one exception, by design: it is the headless-unit form a scheduled Routine fires unattended (no human present) — mirroring `/claude-tweaks:dispatch`'s `next` form exactly, down to the "render Next Actions only when a human is present" rule above. `$PIPELINE_RUN_DIR` may be set during any mode's run, but only because this skill resolves its own standalone run dir per `_shared/pipeline-run-dir.md`'s allowlist to write `decisions.md` — for `refine`/`overview`/`attention` that resolution is for logging only and never suppresses interactivity or the Next Actions block; for `grant` it is also where every skip reason lands when no pipeline run dir otherwise exists (`grant-mode.md`'s own Logging section).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Granting `auto:build`/`auto:merge` from `refine` mode without an interactive human present | `auto:*` labels from `refine` come only from a human-confirmed batch-apply. `grant` mode is the one machine-origination path — the `autonomy` ceiling's `unattended` tier plus its `grant-origination-enabled` opt-in (both human-set project policy, off by default), gated further by per-record trust/origin/grant-check/floor checks. This is the security boundary the two modes together maintain |
| Granting from `grant` mode on any record whose gate chain hasn't fully cleared, or on a human-filed record regardless of other keys | `bin/lib/issues/grant-gate.js`'s chain is exhaustive and ordered; a human-filed record (no `by:*`) is refused unconditionally — see `grant-mode.md` |
| Skipping or bulk-bypassing the batch-confirm in `refine` mode | The human action is the load-bearing security signature — never skip it, even for an all-recommended batch |
| Adding any `bot:*` label from this skill | `bot:*` is `/claude-tweaks:dispatch`'s visibility layer — this skill only *strips* `bot:blocked` on re-grant |
| Reading every candidate record's body in one unbounded pass, ignoring `--budget` | Defeats the bounded-synthesis design — see `refine-mode.md`'s Steps 1-3 |
| Fixing (rather than surfacing) `unsynced: true` local fallback records' sync state | `/claude-tweaks:tidy`'s job (Shape 3) — this skill tags them and in `refine` may apply `priority:*` via the local-files fallback, never mirroring to GitHub |
| Claiming or building a record from this skill | Out of scope — `/claude-tweaks:dispatch`'s job |
| Deriving a grant, priority bump, or "next step" from `overview` mode's Trust Table | Read-only reporting — `overview` writes nothing, and the `autonomy` ceiling's one effect on this skill is which records arrive born-`ready` (`refine-mode.md` Step 3.6), never what a verdict recommends for one already here |
| Treating `refine`'s `Trust` column as the reason to grant, or withholding a grant because a class reads `insufficient evidence` | Trust describes a class's history; the grant is about this record's content and shape, which `grant-check` reads directly. Every class reads `insufficient evidence` until `/claude-tweaks:demo` has run enough times, and that must never become a de facto freeze on granting |
