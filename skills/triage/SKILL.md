---
name: claude-tweaks:triage
description: Use when you want to authorize GitHub work records for autonomous building — the interactive human gate over the ready queue. Grants auto:build / auto:merge; flags unshaped records back. Keywords - triage, authorize, grant, auto:build, auto:merge, ready queue, gate.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Triage — Authorize the Ready Queue

The interactive human gate over the `ready` queue: grants `auto:build` (optionally + `auto:merge`) on records safe to build autonomously, or flags unshaped ones back for re-shaping. Sits outside the main brainstorm-to-build chain, between shaping and execution:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
          [ /claude-tweaks:triage grants ]   <- utility (no fixed lifecycle position)
                              │
                              v
              /claude-tweaks:dispatch   (claims + executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- You want to review the `ready` queue and decide which records get authorized for autonomous building, and with how much trust (`auto:build` alone, or `auto:build` + `auto:merge`).
- A record hit its retry ceiling (`bot:blocked`) and needs a human's renewed judgment before it can re-enter the autonomous queue.
- A `ready`-labeled record turns out not to actually be spec-shaped — this gate catches that and flags it back instead of granting.

Not for: building anything yourself, claiming or dispatching authorized work (that's `/claude-tweaks:dispatch`'s job), or filing/closing records. Triage only ever grants, strips, or flags — it never derives a spec or writes application code.

## Input

This skill takes no arguments. `/claude-tweaks:triage` always runs the same interactive batch-authorization workflow against the current `ready` queue — there is no headless or argument-driven mode. (Headless, unattended consumption of what this gate authorizes is `/claude-tweaks:dispatch`'s separate job — see Relationship below.)

## Preflight

Read the project's `work-backend` config key (per `_shared/work-record.md`'s Config keys table, written by `/claude-tweaks:init`). **`work-backend: local-files`** — report that grants are not applicable here and stop: the local driver records grants as frontmatter for isomorphism only, with no headless consumer that acts on them (headless dispatch is github-issues only). Point the user at running `/claude-tweaks:flow` manually against a chosen record instead. Only `work-backend: github-issues` proceeds.

**Missing key vs. deliberate `local-files` choice.** Before treating an absent `work-backend` line as an intentional `local-files` project, check whether CLAUDE.md's `## Backlog integration` section already carries a `backlog-backend:` line (the pre-6.0 legacy key, per `_shared/work-record.md`'s "Legacy alias exception"):

```bash
grep -q '^work-backend:' CLAUDE.md && echo "OK" || { grep -qE '^backlog-backend:[[:space:]]*\S' CLAUDE.md && echo "MIGRATION_GAP" || echo "GENUINE_LOCAL_FILES"; }
```

`MIGRATION_GAP` means this is very likely an incomplete migration, not a deliberate `local-files` choice — report exactly this message (substituting the actual `backlog-backend` value for `{value}`) and stop, instead of the generic local-files redirect above:

> CLAUDE.md has backlog-backend but no work-backend: line — add work-backend: {value} (the same value as backlog-backend) to CLAUDE.md's Backlog integration section to fix this.

`GENUINE_LOCAL_FILES` (neither key present, or `work-backend` present) proceeds through the normal branch above unchanged.

Before any `gh` command, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3: GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Unlike `/tidy`/`/help`'s use of this ladder, which fails open into a skipped scan, `/claude-tweaks:triage` treats any ladder failure as a hard gate — this skill's entire purpose is writing GitHub state, so there is no meaningful degraded mode to fall back into. Report the specific failing check and stop.

## Workflow

### Step 1: Pull the ready queue (origin-agnostic)

```bash
gh issue list --label ready --state open --json number,title,labels,updatedAt --limit 100 > /tmp/triage-ready.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/triage-ready.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  console.log(JSON.stringify({ fresh, blocked }));
" > /tmp/triage-worklist.json
```

The filter is simply "no `auto:*` grant present" — a record currently mid-build keeps `auto:build` set for the length of the run (the grant persists until successful wrap-up), so it's already excluded without a separate in-progress check. Survivors split into two groups: **fresh** (no bot-state label — never touched by machinery) and **blocked** (`bot:blocked` — hit its retry ceiling, now a re-authorization candidate; Step 4 strips the label when granting one). There is no `by:*` filtering anywhere in this step — health-filed, captured, and human-filed records all enter the same worklist regardless of origin.

### Step 2: Recommend

For every record in `fresh` (from Step 1's worklist), invoke `/claude-tweaks:assess-agent-autonomy` in `grant-check` mode, once per record, every triage session — never pre-filtered to "borderline" records:

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Each invocation returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE` (see
`skills/assess-agent-autonomy/SKILL.md`'s `grant-check` mode). Derive the batch table's
Recommended column directly from this output, and carry `RATIONALE` through to the table's own
Rationale column (Step 3) and the `decisions.md` log line (Step 4) — a content-aware judgment the
human is about to act on must stay visible at decision time and stay in the audit trail
afterward, not be computed and then silently discarded. `blocked` rows (below) have no
`assess-agent-autonomy` call to draw a rationale from — their Rationale column reads a fixed
string instead, per Step 3.

- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also
  `true`).
- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as
  a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/
  `effort:*` labels alongside the grant (Step 4).

For every record in `blocked` (Step 1's worklist), skip `grant-check` and recommend
**`re-authorize (bot:blocked)`** directly, regardless of content — a prior failure means the
human's renewed judgment is the point, not a mechanical (or judgment-driven) replay: applying this
row grants `auto:build` only, never bundling `auto:merge` automatically. Restoring `auto:merge` too
requires an explicit override.

For the batch table and logging, compute display tiers from labels for all records (fresh and blocked):

```bash
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/tmp/triage-worklist.json', 'utf8'));
  const all = [...(data.fresh || []), ...(data.blocked || [])];
  const withTiers = all.map((record) => {
    const { risk, effort } = parseRecordFacets(record.labels || []);
    return { ...record, riskTier: risk, effortTier: effort };
  });
  console.log(JSON.stringify(withTiers));
" > /tmp/triage-with-tiers.json
```

### Step 3: Batch table

```markdown
### Triage — {N} records awaiting authorization

| # | Record | Origin | Risk | Effort | Recommended | Rationale |
|---|---|---|---|---|---|---|
| 1 | #123: {title} | by:code-health | low | low | auto:build + auto:merge | {grant-check's RATIONALE} |
| 2 | #124: {title} | by:capture | medium | high | auto:build | {grant-check's RATIONALE} |
| 3 | #125: {title} | (human-filed) | — | — | flag back (needs scoring) | {grant-check's RATIONALE} |
| 4 | #118: {title} | by:harness-health | low | low | re-authorize (bot:blocked) | Prior failure — human judgment required, not a mechanical replay |
```

`Origin` reads `facets.origin` from Step 1's output (`by:{origin}`, or `(human-filed)` when absent). `Risk` and `Effort` are derived from the record's current `risk:*` and `effort:*` labels via `bin/lib/issues/record.js`'s `parseRecordFacets` function — for records scored by `/specify`, these display `low`/`medium`/`high`; for unscored records, they display `—` (dash, a placeholder allowing inline scoring override in the next step). `Rationale` is `grant-check`'s own `RATIONALE` output verbatim (truncate to roughly one line if it runs long — the full text is still preserved in `decisions.md`'s log line, Step 4) for every `fresh` row; `blocked` rows carry the fixed re-authorization rationale shown above instead, since they skip `grant-check` entirely. For 10 or more records, lead with a one-line count summary before the table (e.g. "14 records: 9 auto:build-eligible, 2 auto:build+auto:merge-eligible, 2 need scoring, 1 re-authorization candidate") so the human sees the batch's shape before the row detail.

Then one `AskUserQuestion`:

- `question`: `"Apply the recommended grant to all, or override specific records?"`, `header`: `"Triage batch"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Grant / re-authorize / flag back exactly per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Flag some back instead"`, `description`: `"Mark specific records for re-shaping rather than granting them"`
- Option 4 — `label`: `"Grant auto:build only, hold merge"`, `description`: `"Apply auto:build/re-authorize to every row Step 2 recommended granting, but withhold auto:merge session-wide — even rows recommended for it. Useful for a first supervised run of the autonomous pipeline."`

Overrides (including inline scoring for an unscored row) are ordinary free-text in the user's next message, not the `Other` field, which answers this one batch question, not a per-item list. Option 4 needs no further input — it's a session-wide modifier on Step 4's Apply, not a per-item override.

### Step 3.5: Body-shape re-verification (before granting)

For every row the decision just resolved to **grant** — not flag-back rows, which don't need it — fetch the body and re-verify spec shape before writing any label. Labels are projection, not truth: a `ready` label only got the record into this worklist; it never authorizes the grant by itself (`_shared/work-record.md`).

```bash
gh issue view "$ISSUE" --json body -q .body > /tmp/triage-body-${ISSUE}.md
```

Check per `_shared/work-record.md`'s spec-shaped body definition: the sections `## Current State`, `## Deliverables`, and `## Acceptance Criteria` are present and each non-empty, and no unresolved placeholder marker (`TBD`, `TODO`, `<!-- ambiguity:`) remains anywhere in the body. This is structural-plus-minimal — whether the deliverables are the *right* ones stays human judgment (the batch table just confirmed), not this check.

A failing row auto-downgrades to flag-back, using Step 4's flag-back mechanics with this exact comment (substitute the missing/empty section list and issue number):

```
Flagged back by /triage: body is not spec-shaped — missing/empty: {list}. Run /claude-tweaks:specify #{n} to shape it, then re-add 'ready'.
```

```bash
node -e "console.log(\`Flagged back by /triage: body is not spec-shaped — missing/empty: \${process.argv[1]}. Run /claude-tweaks:specify #\${process.argv[2]} to shape it, then re-add 'ready'.\`)" "$MISSING_LIST" "$ISSUE" > /tmp/triage-flagback-${ISSUE}.md
```

Report every downgrade to the user before proceeding — a silent downgrade would look like the grant simply never happened.

### Step 4: Apply

**Option 4 modifier (hold merge).** When Step 3 resolved to `"Grant auto:build only, hold merge"`, skip every `auto:merge` grant below for the remainder of this session — apply `auto:build`/re-authorize exactly as the table recommended, but never the `gh issue edit "$ISSUE" --add-label auto:merge` line, regardless of what the row's own Recommended column said. This is a session-wide override, not a per-row judgment call — it doesn't change what Step 2 recommended or what the batch table displayed, only what Step 4 writes.

For every row still marked for granting after Step 3.5:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['auto:build', 'Grant: agents may build this record autonomously (human-granted; machinery only removes)'],
#  ['auto:merge', 'Grant: a clean autonomous run may merge unreviewed (stacks on auto:build; alone inert)']]
# — add the matching risk:low|medium|high / effort:low|medium|high pair too, only for a row where
# the human supplied scoring inline during the override step (Step 3).

if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx bot:blocked; then
  gh issue edit "$ISSUE" --remove-label bot:blocked --add-label auto:build
else
  gh issue edit "$ISSUE" --add-label auto:build
fi
# Row also grants auto:merge:
gh issue edit "$ISSUE" --add-label auto:merge
# Row's scoring came from an inline override in Step 3 (an unscored "—" row the human supplied
# risk:$RISK_TIER / effort:$EFFORT_TIER for directly, rather than flagging back or accepting the
# default "needs scoring" recommendation) — persist the human-supplied scoring as labels too,
# not just the grant, so the record doesn't re-enter later batch views (e.g.
# /claude-tweaks:review-backlog's risk-value table) still showing as unscored:
gh issue edit "$ISSUE" --add-label "risk:$RISK_TIER" --add-label "effort:$EFFORT_TIER"
```

Stripping `bot:blocked` in the same edit as the grant matters: without it, the record carries both `bot:blocked` and a fresh `auto:build`, and `/claude-tweaks:dispatch`'s skip rule ignores anything `bot:blocked` forever regardless of the new grant.

For every row flagged back — Step 3.5's auto-downgrade, an unscored row accepted as recommended, or a human override in Step 3 — remove `ready` and post a comment. Step 3.5's downgrade always uses its exact wording above; every other flag-back uses a shorter comment: `Flagged back by /triage: {reason}. Re-add 'ready' once addressed.`, where `{reason}` is `needs scoring` for the recommended case or the human's own free-text reason for an explicit override.

```bash
gh issue edit "$ISSUE" --remove-label ready
gh issue comment "$ISSUE" --body-file /tmp/triage-flagback-${ISSUE}.md
```

Log every action to this run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md` — `/claude-tweaks:triage` is on the allowlist):

```
AUTO {time} — Triage: granted auto:build{ + auto:merge} to #{n} (risk:{riskTier}, effort:{effortTier}). Rationale: {grant-check's RATIONALE}.
AUTO {time} — Triage: re-authorized #{n} — stripped bot:blocked, granted auto:build{ + auto:merge}.
AUTO {time} — Triage: flagged back #{n} — {missing sections | needs scoring}.
```

The granted-row log line carries the full `RATIONALE` text (not truncated, unlike the batch table's own display) — this is the durable record of why a content-aware judge deemed the record safe to build (and merge) unsupervised, for anyone auditing `decisions.md` after the fact.

### Concurrency

Two humans running `/claude-tweaks:triage` at the same time is safe by construction — every label add is idempotent, so two overlapping grants on the same record just repeat the same write. The one sharp edge is a genuine race between a grant and a flag-back landing on the *same* record in the same window: last-writer-wins on GitHub's own label state. This is acceptable, not engineered around — it is a narrow, self-correcting window (the next `/claude-tweaks:triage` run reads whatever state won and proceeds from there), not worth a lock.

## Next Actions

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch what I just granted (Recommended)"`, `description`: `"/claude-tweaks:dispatch {#-prefixed, comma-joined numbers of every record Step 4 just granted this session, e.g. #201,#202,#205} — skips re-selection, claims and builds them directly"`
- Option 2 — `label`: `"Dispatch just the next one"`, `description`: `"/claude-tweaks:dispatch next — claim and build the single highest-priority authorized record"`
- Option 3 — `label`: `"Triage again"`, `description`: `"/claude-tweaks:triage — review anything still left in the ready queue"`

Option 1 invokes the new explicit-list form (`skills/dispatch/SKILL.md` Step 3) with exactly the record numbers Step 4 applied a grant to this session — not the full historical authorized queue. A human who wants the broader queue (including older, previously-granted-but-undispatched records) runs plain `/claude-tweaks:dispatch` themselves; that path is unchanged and does not need its own slot here.

If Step 4 granted nothing this session (every row was flagged back), omit Option 1 entirely — there is nothing to hand off — and present only Option 2 (`next`) and Option 3 (`Triage again`).

## Component-Skill Contract

`/claude-tweaks:triage` is human-only — no pipeline orchestrator ever invokes it as a component step; a human runs it directly, every time. It always renders `## Next Actions` (mirrors `/claude-tweaks:specify`'s stance, which is user-facing for the same reason). `$PIPELINE_RUN_DIR` may be set during a run, but only because this skill resolves its own standalone run dir per `_shared/pipeline-run-dir.md`'s allowlist (item 3) to write `decisions.md` — that resolution is for logging only and never suppresses interactivity or the Next Actions block.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Granting `auto:build`/`auto:merge` from anything but an interactive human session | `auto:*` labels are only ever added by an interactive human session — there is no machinery path that originates a grant (`_shared/work-record.md`'s grant semantics). This is the security boundary, not a discretionary nicety. |
| Granting on a `ready` label alone, skipping Step 3.5's body-shape re-verification | Labels are projection, not truth — a `ready` label only got the record into this worklist; an unshaped body must flag back, never grant. |
| Skipping the batch-confirm because the recommendation "looks obviously right" | The human action, however trivial, is the load-bearing security signature — never skip it, even for an all-`auto:build`-eligible batch. |
| Adding any `bot:*` label from this gate | `bot:*` is `/claude-tweaks:dispatch`'s visibility layer, mirroring its own claim ref — the permission matrix reserves it for machinery. This gate only ever *strips* `bot:blocked` (re-grant); it never adds one. |
| Bulk-granting without rendering the batch table / `AskUserQuestion` decision | Same load-bearing-signature reasoning — an unattended "grant everything" bypasses the one interactive checkpoint the whole authorization model depends on. |
| Auto-granting `auto:merge` on a `re-authorize (bot:blocked)` row | A prior failure means the recommendation alone isn't sufficient signal to re-extend unsupervised merge trust — the default grants `auto:build` only; restoring `auto:merge` needs an explicit override. |
| Filing or closing records from inside triage | Triage is a *consumer* of the `ready` queue — filing belongs to `/claude-tweaks:capture`/the health skills/`/claude-tweaks:specify`; closing happens at merge time (close-via-merge), a user decision. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:dispatch` | The queue consumer — claims records this gate authorized (`auto:build`) and hands each to `/claude-tweaks:flow`. Triage never claims, dispatches, or executes; it only grants, strips, or flags. |
| `/claude-tweaks:flow` | Indirect only, via `/claude-tweaks:dispatch` — `/flow` builds and (with `auto:merge`) merges records this gate has authorized. Triage never invokes `/flow` directly, and `/flow` never asks triage for authorization at execution time — that check already happened before `/dispatch` claimed the record. |
| `/claude-tweaks:code-health`, `/claude-tweaks:harness-health`, `/claude-tweaks:journey-health`, `/claude-tweaks:docs-health` | Feeders — file records born `ready` (spec-shaped, scored) per `_shared/work-record.md`'s born-ready rule. Triage never files or closes their records. |
| `/claude-tweaks:capture` | Feeder — files raw backlog records; they reach this gate's worklist only after `/claude-tweaks:specify` shapes them to `ready`. |
| `/claude-tweaks:specify` | The shaper — stamps `ready` + scoring before a record can enter this gate's worklist, and is where a flagged-back record returns for re-shaping. |
| `/claude-tweaks:tidy` | Surfaces `bot:blocked` records as re-authorization candidates alongside this gate's own worklist. Migration note: pre-6.0 records still carrying retired `tier:approved`/`tier:fast-track`/`tier:needs-review`/`status:blocked`/`status:in-progress` labels surface via `/tidy`'s legacy-taxonomy finding, not through this gate — triage only ever reads/writes the current seven-axis vocabulary. |
| `/claude-tweaks:review-backlog` | Reciprocal utility relationship over the same record set: review-backlog surveys content and suggests `priority:*`/`**Related:**` (human-confirmed); triage grants `auto:build`/`auto:merge` over the `ready` queue. Neither claims, builds, or shapes bodies. |
| `/claude-tweaks:help` | Surfaces this gate's pending-authorization count on its dashboard — the reciprocal of this row. |
| `_shared/work-record.md` | Taxonomy home — the seven-axis label contract, grant semantics, spec-shaped body definition, and the permission-matrix row this skill implements. |
| `_shared/issue-claims.md` | Defines the claim protocol `/claude-tweaks:dispatch` uses after this gate grants — triage itself never claims. |
| `_shared/github-pr-scan.md` | Detection Ladder — this skill's preflight hard gate — plus the `repo-wide`/`triage-queue` scopes that surface this gate's pending-authorization count elsewhere. |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for the `auto:build`/`auto:merge`/`risk:*`/`effort:*` pairs this gate applies. |
| `_shared/auto-mode-contract.md` | Governs `decisions.md` logging for this gate's standalone run dir; the grants themselves are never auto-mode behavior — they require an interactive session by construction. |
| `/claude-tweaks:assess-agent-autonomy` | Called inline (not a fresh Task dispatch) once per worklist record in Step 2, `grant-check` mode — its `RECOMMEND_BUILD`/`RECOMMEND_MERGE` output becomes the batch table's Recommended column directly. Triage's human batch-confirm is unchanged; only what generates the suggestion changed. |
| `bin/lib/issues/record.js` | `parseRecordFacets` — the facet parser Step 1 uses to filter the `ready` queue down to ungranted records; its `risk`/`effort` fields also supply this skill's own display-tier computation and `grant-check`'s current-label input (an input to assess-agent-autonomy's judgment now, not triage's own recommendation logic). `recommendGrants`/`recommendTier` are retired. |
