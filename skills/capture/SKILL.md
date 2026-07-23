---
name: claude-tweaks:capture
description: Use when capturing ideas that need specification later — brain dumps, half-formed features, things to not forget
argument-hint: '<idea text> [--route=challenge|brainstorm|keep|absorb:N] [--title="..."]'
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

> **Backlog vs parked:** Use `/claude-tweaks:capture` for new ideas and half-formed features — these land as fresh backlog records: no stage label under `work-backend: github-issues`, no `stage:` frontmatter under `work-backend: local-files`. Work deferred from an active build/review goes through `/claude-tweaks:tidy`'s Defer action instead — the existing record gains the `parked` label (`github-issues`) or `stage: parked` frontmatter (`local-files`) plus a trigger. Either way a deferred record carries origin context, file references, and a timing trigger that a fresh backlog record doesn't have. See `_shared/work-record.md` for the full stage vocabulary (backlog / parked / ready).

## Input

`$ARGUMENTS` is parsed as `<idea text> [--route=<value>]`:

| Argument | Behavior |
|----------|----------|
| Free-text idea | The body of the new backlog record (title is derived from the first phrase or supplied via `--title=`). |
| `--route=challenge` / `--route=brainstorm` / `--route=keep` / `--route=absorb:N` | Skip the post-capture routing prompt; apply the route directly. Legacy `--route` values are still accepted as aliases — see Immediate Routing. |
| `--title="..."` | Override the auto-derived title. |

When `$ARGUMENTS` is empty, prompt the user for the idea body.

## Workflow

| Step | What |
|------|------|
| 1 | Add the record — GitHub issue via `recordPayload`, or a `specs/{id}-{slug}.md` record via `local-store.js`, per Backend Selection below. |
| 2 | Route per `--route` arg, or via the Routing Prompt below. |
| 3 | Commit (when this is a standalone invocation; component-skill callers commit themselves). `work-backend: local-files` captures always have something to commit — the new record file, or, under route `absorb:N`, the edited/deleted target record file. `work-backend: github-issues` captures have nothing new to commit unless the failure fallback wrote a local `specs/{id}-{slug}.md` record — its `absorb:N` route edits the target issue via `gh` CLI only (see Route execution below), so no local file is touched. |

## Backend Selection

Read the `work-backend` field from the project's CLAUDE.md (under a `## Work records` section, written by `/claude-tweaks:init`). `backlog-backend` — the pre-migration flag name, under `## Backlog integration` — is accepted as a read-only legacy alias. A missing flag is treated as `local-files` — same missing-flag convention as `design-integration`.

`$TITLE`/`$BODY`/`$TYPE` below are the same fields Entry Format and Adding an Entry (further down) have always asked for: `$BODY` is the `**Related:**`/`Context:`/`Scope:` block assembled per Entry Format; `$TYPE` is the guessed-then-confirmed Type from Adding an Entry.

**When `work-backend: github-issues`:**

1. Bootstrap per `_shared/label-bootstrap.md`, `LABELS_JSON`:

   ```bash
   # Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
   # [["by:capture", "Origin: filed via /capture"]]
   ```

   When the project's `work-types` key reads `labels`, also bootstrap the guessed `type:{t}` label the same way — its pair lives in `record.js`'s `TYPE_LABELS` (e.g. `['type:bug', 'Type: a defect in existing behavior']` when the guess is `bug`).

2. Build the payload via `recordPayload` and create the issue:

   ```bash
   node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const p=recordPayload({title:process.argv[1], body:process.argv[2], type:process.argv[3], origin:'capture'});
     require('fs').writeFileSync('/tmp/capture-payload.json', JSON.stringify(p))" "$TITLE" "$BODY" "$TYPE"

   node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/capture-payload.json','utf8')).body)" > /tmp/capture-body.md
   ```

   **Type expression branch.** Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table; the key is written by `/init`). `work-types: native` applies `$TYPE` via GitHub's native Issue Type; `work-types: labels` adds the matching `type:$TYPE` label instead (the pairs live in `record.js`'s `TYPE_LABELS`):

   ```bash
   # work-types: native
   gh issue create \
     --title "$TITLE" \
     --body-file /tmp/capture-body.md \
     --type "$TYPE" \
     --label by:capture

   # work-types: labels
   gh issue create \
     --title "$TITLE" \
     --body-file /tmp/capture-body.md \
     --label by:capture \
     --label "type:$TYPE"
   ```

3. **On failure** (GitHub unreachable, `gh` broken, transient API error): fall back to the local driver — write the record via `local-store.js`'s `createRecord` (atomic id allocation; see the local-files branch below for why `allocateId`+`writeRecord` is unsafe for creating a brand-new record), using the same `deriveSlug` call as the local-files branch below:

   ```bash
   node -e "const fs=require('fs');
     const {createRecord, deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
     const dir='specs';
     const existingSlugs=fs.existsSync(dir)
       ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
       : [];
     const slug=deriveSlug(process.argv[1], existingSlugs);
     const record = createRecord(dir, {
       slug,
       title: process.argv[1],
       body: process.argv[2],
       facets: { type: process.argv[3], origin: 'capture', unsynced: true }
     });
     console.log(record.path)" "$TITLE" "$BODY" "$TYPE"
   ```

   Tell the user issue creation failed and the record landed locally instead (path printed above), `unsynced: true`. No further marker is needed beyond that facet — `/claude-tweaks:tidy`'s record scan surfaces `unsynced` local records as Sync findings, reconciling them onto GitHub on a later pass.

**When `work-backend: local-files` (or the flag is missing):**

Write the record via `local-store.js`'s `createRecord` — no `unsynced` facet (there is no GitHub side to reconcile against). Use `createRecord`, not `allocateId`+`writeRecord`: two near-simultaneous `/capture` (or `/specify` decomposition) invocations calling `allocateId`+`writeRecord` separately can both read the same directory listing, both compute the same next id, and both succeed under different slugs — two records silently sharing one numeric id, corrupting any later `facets.parent`/`facets.blockedBy` reference that assumes id uniqueness. `createRecord` closes that race by allocating the id and writing the file as one atomic step (see `bin/lib/issues/local-store.js`'s header comments on `allocateId` and `createRecord`):

```bash
node -e "const fs=require('fs');
  const {createRecord, deriveSlug}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
  const dir='specs';
  const existingSlugs=fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n)=>/^\d+-(.+)\.md$/.exec(n)).filter(Boolean).map((m)=>m[1])
    : [];
  const slug=deriveSlug(process.argv[1], existingSlugs);
  const record = createRecord(dir, {
    slug,
    title: process.argv[1],
    body: process.argv[2],
    facets: { type: process.argv[3], origin: 'capture' }
  });
  console.log(record.path)" "$TITLE" "$BODY" "$TYPE"
```

`{slug}` is derived from the title by `local-store.js`'s `deriveSlug(title, existingSlugs)` — lowercase, collapse runs of non-alphanumeric characters to a single `-`, trim leading/trailing `-`, truncate to 60 characters, dedupe against `existingSlugs` with a numeric suffix (`-2`, `-3`, ...). One deterministic implementation, not a hand-executed algorithm — see `bin/lib/issues/local-store.js` and its tests in `bin/lib/issues/tests/local-store.test.js`. `createRecord('specs', { slug, ... })` allocates the numeric `{id}` prefix atomically as part of the same call — do not call `allocateId` separately when creating a brand-new record.

## Entry Format

Both drivers share the same body shape — this is `$BODY` in Backend Selection above:

```markdown
**Related:** {optional related record numbers, or "none"}

Context: 1-2 sentences on why this came up or what triggered it

Scope: Rough sense of what it might involve (can be vague)
```

**`work-backend: github-issues`** — this becomes the issue body; the issue title (`$TITLE`) is the short entry title.

**`work-backend: local-files`** — this becomes the record body under the frontmatter; `local-store.js`'s `writeRecord` composes the `# {title}` heading above it automatically.

### Hard cap: ~5 lines per entry

If it takes more than 5 lines to describe, it's past the raw-capture stage — run `/superpowers:brainstorming` on it instead. Applies to both drivers.

## Adding an Entry

Both drivers run Backend Selection above; don't overthink — capture the essence.

### Guessing the Type

Type is guessed from the idea's title/body text — advisory only:

| Title/body contains | Guessed Type |
|---|---|
| `fix`, `broken`, `crash`, `error`, `bug`, `regression`, `wrong`, `fails` | `bug` |
| `add`, `support`, `enable`, `new`, `allow`, `feature` | `feature` |
| none of the above | `task` |

The guess rides in the existing "Added: '{title}' (Type: {t})" presentation (see Immediate Routing below) — no new question is added. The user overrides via free text in the next message.

## Immediate Routing

After adding the record, route the item per the `--route` arg or by asking.

### Routing via `--route` arg (front-loaded)

`/claude-tweaks:capture` accepts `--route={challenge|brainstorm|keep|absorb:N}` to skip the post-capture prompt:

| `--route` value | Action |
|---|---|
| `challenge` | Open `/claude-tweaks:challenge` with the new backlog record as input |
| `brainstorm` | Open `/superpowers:brainstorming` with the new backlog record as input |
| `keep` | Record stays in backlog state — explicitly, no label asserts this; no further routing |
| `absorb:42` | Absorb the record into record `#42`; close the new record as not-planned |

Legacy route values `inbox` and `merge:N` are accepted as aliases for `keep` and `absorb:N`.

When `--route` is provided, log:
```
AUTO {time} — Routing: applied --route={value} for backlog record "{title}".
```
No further prompt. Proceed directly to the routed skill or commit.

### Routing prompt (when `--route` not provided)

In auto mode, apply the silences-table row for /capture from `_shared/auto-mode-contract.md`: if `--route` was passed, honor it; otherwise default to `keep` (the most conservative route — the record stays in backlog state for periodic review at `/tidy`, no further write that wouldn't have happened anyway). Log:
```
AUTO {time} — Routing: defaulted to keep (no --route provided). Reversibility: high (record stays in backlog state; user can re-route via /tidy at any time).
```

In interactive mode (or when explicitly opted in), present "Added: '{title}' (Type: {t})" and call `AskUserQuestion`:

- `question`: `"What should happen with this?"`, `header`: `"Route idea"`, `multiSelect`: `false`
- Option 1 — `label`: `"Challenge first"`, `description`: `"Run /claude-tweaks:challenge to stress-test assumptions, then /superpowers:brainstorming, then /claude-tweaks:specify"`
- Option 2 — `label`: `"Brainstorm directly"`, `description`: `"Run /superpowers:brainstorming to explore the idea now, then /claude-tweaks:specify"`
- Option 3 — `label`: `"Keep as backlog record"`, `description`: `"Not ready yet, will be reviewed during /claude-tweaks:tidy"`
- Option 4 (conditional) — `label`: `"Absorb into record {N}"`, `description`: `"This belongs in an existing record"`

The call has 4 options only when Option 4 is visible; otherwise build it with the first 3 options only — never include Option 4 with a placeholder value.

> **Option 4 visibility:** Search for a candidate match on the topic keywords from the new backlog record, per the active driver from Backend Selection. `local-files` — search `specs/` for a record matching the keywords. `github-issues` — search open issues: `gh issue list --search "{keywords}" --state open --json number,title --limit 5`. Only show option 4 when either search returns a candidate. Without a candidate match, option 4 is omitted entirely — manual disambiguation against an unspecified record number is worse than no option at all.

### Route execution, by backend

| Route | `local-files` | `github-issues` |
|---|---|---|
| `challenge` / `brainstorm` | Opens the child skill with the record's text as input | Opens the child skill with the issue title + body as input (reference `#{issue-number}`) |
| `keep` | No further action — the record stays as-is at `specs/{id}-{slug}.md`, no `stage:` frontmatter | No further action — the issue is already open, `by:capture`-labeled, with no stage label. That **is** the backlog state; there is nothing to add. |
| `absorb:N` | Integrate into record N's body (its Deliverables/AC/Technical Approach sections when shaped, otherwise its raw body), delete the absorbed record's file | Integrate into record `#N`'s body the same way, then comment `Absorbed into #N.`, then `gh issue close {n} --reason "not planned"` — mirrors `/claude-tweaks:tidy`'s Merge action |

This ensures every captured idea has an explicit next step — either immediate action or a conscious decision to keep it in backlog state.

**Good entries:**

- "Voice command to add item to shopping list" — context explains the need
- "Recipe nutrition facts display" — scope hints at UI + data needs

**Bad entries:**

- Just "nutrition" — too vague to act on later
- Full spec with 20 tasks — that's a spec, not a backlog record
- Notes about an existing spec ("spec 50 needs review") — put that on the spec itself

## Review Workflow

Periodically (or when the backlog gets long), use `/claude-tweaks:tidy` to batch-review all backlog records with recommended actions.

## Next Actions

When invoked by a parent skill, omit this block — the parent owns the handoff. When invoked directly by a user, call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Capture another idea (Recommended)"`, `description`: `"/claude-tweaks:capture {next idea} — capture another idea while you're in brainstorming flow"`
- Option 2 — `label`: `"Tidy backlog"`, `description`: `"/claude-tweaks:tidy — review and triage backlog records (promote, absorb, or drop stale items)"`
- Option 3 — `label`: `"Specify"`, `description`: `"/claude-tweaks:specify {ref} — promote this record straight to a spec ({ref} is '#{n}' under work-backend: github-issues, or the record id under work-backend: local-files)"`
- Option 4 — `label`: `"Challenge"`, `description`: `"/claude-tweaks:challenge \"{title}\" — debias and stress-test assumptions before specifying"`

## Component-Skill Contract

This skill is a **component skill** — directly invoked by `/claude-tweaks:build` (Common Step 4, design-mode follow-up capture). `/claude-tweaks:visual-review`, `/claude-tweaks:reflect`, `/claude-tweaks:wrap-up`, and `/claude-tweaks:demo` file a new backlog record directly without going through this skill, so they are NOT capture parents — they only recommend `/capture` in Next Actions for the user's next session.

Capture is also a parent of `/challenge` when `--route=challenge` is set — when invoking `/challenge`, capture sets `$PIPELINE_RUN_DIR` to a standalone run dir (per `_shared/pipeline-run-dir.md` step 4) if not already set, so the child's auto-mode and audit-log behavior resolves correctly.

Parent invocation of `/capture` is signaled by `$PIPELINE_RUN_DIR` being set in the environment (`/build` running inside `/flow`). When invoked from within a parent's workflow, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `PIPELINE_RUN_DIR`), render Next Actions as shown above.

**Side effect of `$PIPELINE_RUN_DIR`-based detection:** if a user invokes `/capture` directly while an active `/flow` pipeline is running, Next Actions are suppressed because the env var is set. This is intentional — pipeline-mid-flow handoff suggestions would conflict with the orchestrator's flow.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Capturing an idea that already has a spec | Duplicates intent across two files — annotate the spec directly instead so the durable record stays the source of truth |
| Writing a full spec as a backlog record | A backlog record is for half-formed ideas; a fully-formed spec belongs in `specs/` where `/build` and `/flow` can act on it |
| Never reviewing the backlog | Without periodic triage via `/claude-tweaks:tidy`, the backlog becomes a graveyard and captured ideas lose context over time |
| Adding implementation details to a backlog record | A backlog record captures *what* and *why* — *how* is brainstorming + spec territory and changes faster than the idea itself |
| Skipping `/superpowers:brainstorming` and jumping straight to specs | Brainstorming surfaces assumptions and constraints that specs need; without it, specs encode unchallenged premises |
| Putting notes about existing specs into a new backlog record | Notes drift from the spec they describe — annotate the spec file directly so the note moves with the work |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:challenge` | Debiases backlog records before `/superpowers:brainstorming` — /claude-tweaks:help flags candidates |
| `/superpowers:brainstorming` | Explores promoted backlog records — produces design docs |
| `/claude-tweaks:specify` | Shapes captured records to spec shape (adds `ready` + scoring) — the primary capture→specify path; also decomposes brainstormed design docs into ready leaf records |
| `/claude-tweaks:triage` | Records this skill files reach triage's worklist only after `/claude-tweaks:specify` shapes them to `ready` — the reciprocal of triage/SKILL.md's own Feeder row for `/claude-tweaks:capture` |
| `/claude-tweaks:review-backlog` | Consumes and enriches the `**Related:**` field this skill's Entry Format stamps — review-backlog is the only skill that suggests values for it, always human-confirmed. |
| `/claude-tweaks:tidy` | Reviews the backlog for stale records — promotes, absorbs, or deletes |
| `/claude-tweaks:review` | May file new backlog records for ideas discovered during review |
| `/claude-tweaks:wrap-up` | May file new backlog records for genuinely new ideas; leftover work becomes a `parked` record instead |
| `/claude-tweaks:demo` | May file a linked follow-up backlog record when a human requests changes during acceptance review — references the original via an `Origin: demo changes-requested from #N` body line instead of a `by:*` label |
| `/claude-tweaks:build` | Calls /capture during Common Step 4 (design mode) to file blocked items and follow-up ideas before they slip |
| `/claude-tweaks:init` | After bootstrap, /init suggests /capture as the entry point for capturing ideas that surface during setup but aren't ready to specify |
| `/claude-tweaks:reflect` | Surfaces tangential ideas at the Wrap-Up Review Console (files new backlog records directly, not via /capture) |
| `/claude-tweaks:visual-review` | Files UI ideas (creative improvements, follow-ups) as new backlog records directly, not via /capture — only recommends /capture to the user afterward, the same pattern as /claude-tweaks:reflect above |
| `/claude-tweaks:help` | Feeds items that /claude-tweaks:help surfaces in the status dashboard/queue counts. |
| `_shared/work-record.md` | Taxonomy home — stage vocabulary (backlog / parked / ready), the permission-matrix row for `/capture` (`by:capture` + Type only), and the seven-axis label contract this skill files against |
| `/claude-tweaks:research` | Research findings can be captured as backlog records; invoke `/research` when a backlog record needs evidence before specifying. |
| `/claude-tweaks:code-health` | `/code-health` routes fuzzy or below-threshold findings to the backlog via `/capture` instead of filing a GitHub issue, so they get human triage before promotion. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
