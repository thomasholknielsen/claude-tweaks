---
name: claude-tweaks:capture
description: Use when capturing ideas that need specification later — brain dumps, half-formed features, things to not forget
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Capture — Quickly note an idea for later specification

Quick capture for ideas that aren't ready for full specification. Part of the workflow lifecycle:

```
/claude-tweaks:init → [ /claude-tweaks:capture ] → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                        ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- User mentions something that should be a feature but isn't specified
- Discovery during implementation reveals something that needs its own spec
- "We should probably..." or "Don't forget to..." moments
- Anything that would otherwise be lost or forgotten

> **INBOX vs DEFERRED:** Use `/claude-tweaks:capture` for new ideas and half-formed features. Work deferred from an active build/review goes through `/claude-tweaks:tidy`'s Defer action instead — `specs/DEFERRED.md` under `backlog-backend: local-files`, or the `parked` label under `backlog-backend: github-issues`. Either way it carries origin context, file references, and timing triggers that INBOX entries don't have.

## Input

`$ARGUMENTS` is parsed as `<idea text> [--route=<value>]`:

| Argument | Behavior |
|----------|----------|
| Free-text idea | The body of the INBOX entry (title is derived from the first phrase or supplied via `--title=`). |
| `--route=challenge` / `--route=brainstorm` / `--route=inbox` / `--route=merge:N` | Skip the post-capture routing prompt; apply the route directly. |
| `--title="..."` | Override the auto-derived title. |

When `$ARGUMENTS` is empty, prompt the user for the idea body.

## Workflow

| Step | What |
|------|------|
| 1 | Add the entry — GitHub issue or `specs/INBOX.md` append, per Backend Selection below. |
| 2 | Route per `--route` arg, or via the Routing Prompt below. |
| 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). Issue-backend captures have nothing new to commit unless the fallback path wrote to `specs/INBOX.md`, or the route was `merge:N` (which edits the target spec locally regardless of backend). |

## Backend Selection

Read the `backlog-backend` field from the project's CLAUDE.md (under a `## Backlog integration` section, written by `/claude-tweaks:init` Step 15). A missing flag is treated as `local-files` — same missing-flag convention as `design-integration`.

**When `backlog-backend: github-issues`:**

1. Bootstrap the `backlog` label and the specific `backlog:category-<value>` label about to be used (not all four category labels up front):

   ```bash
   gh label list --search backlog --json name -q '.[].name' | grep -qx backlog || \
     gh label create backlog --description "Captured idea or deferred work, tracked via /claude-tweaks:capture and /claude-tweaks:tidy"

   CATEGORY_LABEL="backlog:category-${CATEGORY}"
   gh label list --search "$CATEGORY_LABEL" --json name -q '.[].name' | grep -qx "$CATEGORY_LABEL" || \
     gh label create "$CATEGORY_LABEL" --description "${CATEGORY}-category backlog item"
   ```

2. Build the payload and create the issue (`$TITLE`/`$RELATED`/`$CONTEXT`/`$SCOPE`/`$CATEGORY` are the same fields the Entry Format below has always asked for — only their destination changed):

   ```bash
   node -e "const {inboxIssuePayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
     const p=inboxIssuePayload({title:process.argv[1],related:process.argv[2],context:process.argv[3],scope:process.argv[4],category:process.argv[5]});
     require('fs').writeFileSync('/tmp/capture-payload.json', JSON.stringify(p))" "$TITLE" "$RELATED" "$CONTEXT" "$SCOPE" "$CATEGORY"

   gh issue create \
     --title "$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-payload.json','utf8')).title)")" \
     --body "$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-payload.json','utf8')).body)")" \
     --label backlog \
     --label "backlog:category-$CATEGORY"
   ```

3. **On failure** (GitHub unreachable, `gh` broken, transient API error): fall back to the local-files path below and tell the user issue creation failed and the entry landed in `specs/INBOX.md` instead. No special marker is needed — `/claude-tweaks:tidy`'s scan already treats any non-empty `specs/INBOX.md` content as unsynced once `backlog-backend: github-issues`, and offers a Sync to GitHub action to resolve it later.

**When `backlog-backend: local-files` (or the flag is missing):**

Append the entry to `specs/INBOX.md` per the Entry Format below — unchanged from today.

## Entry Format

**`backlog-backend: github-issues`** — issue title = short entry title; issue body:

```markdown
**Related:** {optional spec numbers or "none"}

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

Category is a label (`backlog:category-{product|technical|legal|infrastructure}`), not body prose.

**`backlog-backend: local-files`** — same fields, appended to `specs/INBOX.md`:

```markdown
## [Short Title]

**Added:** YYYY-MM-DD | **Category:** {product | technical | legal | infrastructure} | **Related:** (optional spec numbers or "none")

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

### Hard cap: ~5 lines per entry

If it takes more than 5 lines to describe, it's past the inbox stage — run `/superpowers:brainstorming` on it instead. Applies to both backends.

## Adding an Entry

**`github-issues`:** run Backend Selection above; don't overthink — capture the essence.

**`local-files`:**
1. Open `specs/INBOX.md`
2. Append new entry at the bottom
3. Don't overthink — capture the essence

## Immediate Routing

After adding the entry, route the item per the `--route` arg or by asking.

### Routing via `--route` arg (front-loaded)

`/claude-tweaks:capture` accepts `--route={challenge|brainstorm|inbox|merge:N}` to skip the post-capture prompt:

| `--route` value | Action |
|---|---|
| `challenge` | Open `/claude-tweaks:challenge` with the new INBOX item as input |
| `brainstorm` | Open `/superpowers:brainstorming` with the new INBOX item as input |
| `inbox` | Keep in INBOX; no further routing |
| `merge:42` | Merge the entry into spec 42; remove from INBOX |

When `--route` is provided, log:
```
AUTO {time} — Routing: applied --route={value} for INBOX entry "{title}".
```
No further prompt. Proceed directly to the routed skill or commit.

### Routing prompt (when `--route` not provided)

In auto mode, apply the silences-table row for /capture from `_shared/auto-mode-contract.md`: if `--route` was passed, honor it; otherwise default to `inbox` (the most conservative route — the item stays parked for periodic review at `/tidy`, no INBOX/DEFERRED write that wouldn't have happened anyway). Log:
```
AUTO {time} — Routing: defaulted to inbox (no --route provided). Reversibility: high (entry stays in INBOX; user can re-route via /tidy at any time).
```

In interactive mode (or when explicitly opted in), present "Added to INBOX: '{item title}'" and call `AskUserQuestion`:

- `question`: `"What should happen with this?"`, `header`: `"Route idea"`, `multiSelect`: `false`
- Option 1 — `label`: `"Challenge first"`, `description`: `"Run /claude-tweaks:challenge to stress-test assumptions, then /superpowers:brainstorming, then /claude-tweaks:specify"`
- Option 2 — `label`: `"Brainstorm directly"`, `description`: `"Run /superpowers:brainstorming to explore the idea now, then /claude-tweaks:specify"`
- Option 3 — `label`: `"Keep in INBOX"`, `description`: `"Not ready yet, will be reviewed during /claude-tweaks:tidy"`
- Option 4 (conditional) — `label`: `"Merge into spec {N}"`, `description`: `"This belongs in an existing spec"`

The call has 4 options only when Option 4 is visible; otherwise build it with the first 3 options only — never include Option 4 with a placeholder value.

> **Option 4 visibility:** Only show option 4 when a spec name in `specs/` matches the topic keywords from the INBOX item. Without a candidate match, option 4 is omitted entirely — manual disambiguation against an unspecified spec number is worse than no option at all.

### Route execution, by backend

| Route | `local-files` | `github-issues` |
|---|---|---|
| `challenge` / `brainstorm` | Opens the child skill with the INBOX entry text as input | Opens the child skill with the issue title + body as input (reference `#{issue-number}`) |
| `inbox` (keep) | No further action — entry stays in `specs/INBOX.md` | No further action — the issue is already open, `backlog`-labeled, with no `parked` label. That **is** the inbox state; there is nothing to add. |
| `merge:N` | Integrate into spec N's Deliverables/AC/Technical Approach, remove entry from `specs/INBOX.md` | Integrate into spec N the same way, then comment naming the target spec (`Merged into spec {N}.`), then `gh issue close {n} --reason "not planned"` — mirrors `/claude-tweaks:tidy`'s Merge action |

This ensures every captured idea has an explicit next step — either immediate action or a conscious decision to park it.

**Good entries:**

- "Voice command to add item to shopping list" — context explains the need
- "Recipe nutrition facts display" — scope hints at UI + data needs

**Bad entries:**

- Just "nutrition" — too vague to act on later
- Full spec with 20 tasks — that's a spec, not an inbox item
- Notes about an existing spec ("spec 50 needs review") — put that on the spec itself

## Review Workflow

Periodically (or when inbox gets long), use `/claude-tweaks:tidy` to batch-review all INBOX items with recommended actions.

## Next Actions

When invoked by a parent skill, omit this block — the parent owns the handoff. When invoked directly by a user, call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Capture another idea (Recommended)"`, `description`: `"/claude-tweaks:capture {next idea} — capture another idea while you're in brainstorming flow"`
- Option 2 — `label`: `"Tidy backlog"`, `description`: `"/claude-tweaks:tidy — review and triage INBOX (promote, merge, or drop stale items)"`
- Option 3 — `label`: `"Specify"`, `description`: `"/claude-tweaks:specify {ref} — promote this idea straight to a spec ({ref} is '#{issue-number}' under backlog-backend: github-issues, or the entry's quoted title under local-files)"`
- Option 4 — `label`: `"Challenge"`, `description`: `"/claude-tweaks:challenge \"{title}\" — debias and stress-test assumptions before specifying"`

## Component-Skill Contract

This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, and `/claude-tweaks:wrap-up` write to `specs/INBOX.md` directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.

Capture is also a parent of `/challenge` when `--route=challenge` is set — when invoking `/challenge`, capture sets `$PIPELINE_RUN_DIR` to a standalone run dir (per `_shared/pipeline-run-dir.md` step 3) if not already set, so the child's auto-mode and audit-log behavior resolves correctly.

Parent invocation of `/capture` is signaled by `$PIPELINE_RUN_DIR` being set in the environment (`/build` running inside `/flow`). When invoked from within a parent's workflow, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `PIPELINE_RUN_DIR`), render Next Actions as shown above.

**Side effect of `$PIPELINE_RUN_DIR`-based detection:** if a user invokes `/capture` directly while an active `/flow` pipeline is running, Next Actions are suppressed because the env var is set. This is intentional — pipeline-mid-flow handoff suggestions would conflict with the orchestrator's flow.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Using INBOX for ideas that already have a spec | Duplicates intent across two files — annotate the spec directly instead so the durable record stays the source of truth |
| Writing full specs in INBOX | INBOX is for half-formed ideas; a fully-formed spec belongs in `specs/` where `/build` and `/flow` can act on it |
| Never reviewing INBOX | Without periodic triage via `/claude-tweaks:tidy`, INBOX becomes a graveyard and captured ideas lose context over time |
| Adding implementation details to an INBOX entry | INBOX captures *what* and *why* — *how* is brainstorming + spec territory and changes faster than the idea itself |
| Skipping `/superpowers:brainstorming` and jumping straight to specs | Brainstorming surfaces assumptions and constraints that specs need; without it, specs encode unchallenged premises |
| Putting notes about existing specs in INBOX | Notes drift from the spec they describe — annotate the spec file directly so the note moves with the work |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:challenge` | Debiases INBOX items before `/superpowers:brainstorming` — /claude-tweaks:help flags candidates |
| `/superpowers:brainstorming` | Explores promoted INBOX items — produces design docs |
| `/claude-tweaks:specify` | Converts `/superpowers:brainstorming` output into specs |
| `/claude-tweaks:tidy` | Reviews INBOX for stale items — promotes, merges, or deletes |
| `/claude-tweaks:review` | May create INBOX items for new ideas discovered during review |
| `/claude-tweaks:wrap-up` | May create INBOX items for genuinely new ideas; leftover work goes to DEFERRED.md |
| `/claude-tweaks:build` | Calls /capture during Common Step 4 (design mode) to file blocked items and follow-up ideas before they slip |
| `/claude-tweaks:init` | After bootstrap, /init suggests /capture as the entry point for parking ideas that surface during setup but aren't ready to specify |
| `/claude-tweaks:reflect` | Surfaces tangential ideas at the Wrap-Up Review Console (writes direct to INBOX, not via /capture) |
| `/claude-tweaks:visual-review` | UI ideas surfaced during visual review (creative improvements, follow-ups) land in INBOX via /capture instead of inflating the current spec |
| `specs/DEFERRED.md` | Structured deferral for build/review work — carries origin, files, and triggers that INBOX doesn't |
| `/claude-tweaks:research` | Research findings can be captured as INBOX items; invoke `/research` when an INBOX idea needs evidence before specifying. |
| `/claude-tweaks:code-health` | `/code-health` routes fuzzy or below-threshold findings to INBOX via `/capture` instead of filing a GitHub issue, so they get human triage before promotion. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
