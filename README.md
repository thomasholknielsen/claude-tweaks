# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Installation

```
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace
/plugin install claude-tweaks@claude-tweaks-marketplace
/plugin install superpowers@claude-plugins-official
/claude-tweaks:init
```

## How it works

```
  SKILL                      ARTIFACT                 SUPERPOWERS USED
  ─────                      ────────                 ────────────────

  capture ──────────────►  Backlog record
     │
  challenge ────────────►  Brief
     │
     │                     Design Doc          ◄───  brainstorm
     │                     (specify can invoke brainstorm directly on topic input)
     │
  specify ──────────────►  Ready record(s)    (writes surface: + design-intent: body metadata)
     │  calls: design shape (frontend only — appends Impeccable shape output to design doc)
     │  calls: visualize (diagram suggestion, all surfaces)
     │                     (deletes Brief + Design Doc)
     │
  ┈┈ /claude-tweaks:backlog refine grants, /claude-tweaks:dispatch claims (utility skills, no fixed position) ┈┈
     │
  ┈┈ /claude-tweaks:flow automates below (worktree mode default) ┈┈
     │
  build ────────────────►  Code + Journeys    ◄───  subagent-driven-development
     │  calls: design pre-build (lazy-load Impeccable references)
     │         simplify,                             executing-plans
     │         journeys                              using-git-worktrees ⚙
     │           calls: visualize (diagram suggestion)
     ┊  (if UI changed)
  stories ──────────────►  Story YAML
     │
  test ─────────────────►  TEST_PASSED
     │  calls: design test (Impeccable detect — deterministic CLI gate)
     │
  review ───────────────►  Review Summary     ◄───  dispatching-parallel-agents
     │  calls: design review (Impeccable critique + audit — advisory)
     │         visualize (diagram gap finding — Lens 3i-diagram),
     │         reflect,
     │         simplify,
     │         visual-review (calls: design survey — Creative Opportunities)
     │
  polish ───────────────►  Polished Code      (frontend specs only)
     │  calls: design polish (auto-fit + issue-driven + intent-driven)
     │         test skip-qa  (re-verify gate, 1-cycle cap)
     │
  flow summary ─────────►  Pipeline report    (Creative Opportunities block)
     │  calls: design survey (full diff; decline tracking)
     │
  wrap-up ──────────────►  Done               ◄───  finishing-a-dev-branch ⚙
     │  calls: reflect
     │         (full)
                           (deletes plans, ledger, design caches; legacy spec file
                            deleted too — a record-mode build's materialized file
                            stays on the branch as committed audit trail instead;
                            applies demo:pending + posts a Verification Brief on
                            the record — record mode only)
     │
  ┈┈ /claude-tweaks:demo resolves demo:pending → approved/changes-requested (utility skill, no fixed position — run anytime, resolves one item per invocation: a specific #N, or this session's own unrecorded work via session-recall) ┈┈
```

> **Left column:** `/claude-tweaks:{name}` — **Right column:** `/superpowers:{name}` ([Superpowers plugin](https://github.com/obra/superpowers))
> **⚙** = worktree mode only — **┊** = conditional step
> `/claude-tweaks:init` runs once per project, before entering the pipeline.

## Work Records

Every unit of work — a captured idea, a health-skill finding, or a human-filed issue — is the same thing underneath: a **work record**, tracked through one spine regardless of who filed it:

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch claims──► BUILDING ──user merges──► CLOSED
```

- **backlog** — the default state: no stage label. `/claude-tweaks:capture` files here; health-skill records skip straight to `ready` instead (the born-ready rule — their output is spec-shaped by construction).
- **ready** — spec-shaped and agent-sized. `/claude-tweaks:specify` gets a record here, either by shaping it in place or by decomposing a design doc into a parent record plus ready leaves.
- **authorized** — carries a human-granted `auto:build` (optionally `+ auto:merge`). `/claude-tweaks:backlog refine` is the interactive gate that grants this — machinery can only strip or downgrade a grant, never originate one.
- **building** — an agent holds the claim. `/claude-tweaks:dispatch` claims an authorized record's whole file-overlap group and hands it to `/claude-tweaks:flow`.
- **closed** — completed via your own merge (close-via-merge — the pipeline never runs `gh issue close`), or not-planned (wontfix, duplicate, absorbed into another record).

A record can also **park** at any pre-authorized stage (on hold, with a wake trigger — a date or a watched file path) via `/claude-tweaks:tidy`'s Defer action, and can close as not-planned at any point.

Two storage drivers back the same taxonomy, set once by `/claude-tweaks:init` and read identically by every consumer skill:

| Driver | Where a record lives | Notes |
|---|---|---|
| `work-backend: github-issues` | A GitHub issue | Labels express stage/scoring/grants/bot-state; native GitHub Issue Types or `type:*` labels express Type. Headless dispatch (`/claude-tweaks:dispatch`) requires this driver — GitHub's RBAC is the mechanism the authorization model depends on. |
| `work-backend: local-files` | `specs/{id}-{slug}.md`, one file per record | Frontmatter expresses the same facets for isomorphism. `/claude-tweaks:backlog refine`'s grants are recorded but have no headless consumer — run `/claude-tweaks:flow`/`/claude-tweaks:build` manually against a chosen record instead. |

See `skills/_shared/work-record.md` for the full seven-axis contract (Type, Origin, Scoring, Stage, Authorization, Bot state, Acceptance), the complete label taxonomy, and the permission matrix governing which skill may add or remove which label.

## Skills

claude-tweaks ships a full set of skills spanning the plan phase (capture, challenge, specify), the automated pipeline (build, test, review, wrap-up), standalone component skills (reflect, simplify, deepen, journeys, visual-review, visualize, assess-agent-autonomy), and utility skills (flow, help, tidy, demo, code-health, backlog, dispatch, and more). Each is invoked as `/claude-tweaks:{name}` and most work both standalone and as part of the automated `/claude-tweaks:flow` pipeline.

See [docs/getting-started.md](docs/getting-started.md) for the full skill reference.

## Common workflows

```
# New repo — bootstrap and start capturing ideas
/claude-tweaks:init
/claude-tweaks:help                    # verify setup, see what's next
/claude-tweaks:capture "first feature idea"

# Full pipeline — idea to clean slate
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/superpowers:brainstorming
/claude-tweaks:specify meal planning
/claude-tweaks:flow 73

# Fast — spec already exists
/claude-tweaks:flow 42

# Resume from a specific step
/claude-tweaks:flow 42 review

# Parallel specs in separate terminals (worktree mode)
/claude-tweaks:flow 42 worktree       # Terminal 1
/claude-tweaks:flow 45 worktree       # Terminal 2
/claude-tweaks:flow 48 worktree       # Terminal 3

# Check pipeline status (navigation hub)
/claude-tweaks:help                    # what's ready, what's blocked, what's next

# Visual QA
/claude-tweaks:review 42 full
/claude-tweaks:visual-review journey:checkout-flow
/claude-tweaks:visual-review discover
```

## Dependencies

| Plugin / Tool | Source | Required |
|---------------|--------|----------|
| [Superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers@claude-plugins-official` | Yes — brainstorming, planning, subagent execution, worktree management, systematic debugging |
| agent-browser | `npm install -g agent-browser` | Optional — browser automation for /stories, /visual-review, /review qa |
| Node 18+ | brew/winget/scoop install nodejs | Yes — statusline. `/claude-tweaks:init` Step 8 offers to install via your package manager. |
| git CLI | brew/winget/apt install git | Optional — required only for the git segment in the statusline; everything else degrades gracefully. |
| `gh` CLI | `brew/winget/apt install gh`, then `gh auth login` | Yes, for most `work-backend: github-issues` write paths — required, unauthenticated is a hard gate. Two write paths (the health skills' durable-state cursor writer, `/dispatch`'s issue-claim lock) fall back to GitHub MCP tools automatically when `gh` isn't on PATH — see `_shared/github-write-transport.md` — but `gh` is still required for every other GitHub-write path in the plugin. |

## Migrating from 5.x

Existing projects on claude-tweaks 5.x may carry pre-6.0 state: open GitHub issues (or `local-files` records) still stamped with the retired `tier:approved`/`tier:fast-track`/`tier:needs-review`/`status:blocked`/`status:in-progress` labels, `specs/backlog/*.md` entries from the earlier two-file backlog design, or a project CLAUDE.md with a `backlog-backend` flag that hasn't been renamed to `work-backend`. The old label set is read as read-only legacy aliases wherever `/claude-tweaks:tidy` scans for it (see `/claude-tweaks:tidy`'s legacy-taxonomy finding). The old flag name is narrower: only `/capture`, `/challenge`, and `/tidy` currently read `backlog-backend` as a read-only fallback (`_shared/work-record.md`'s Config keys section, "Legacy alias exception") — a project with only `backlog-backend:` set (no `work-backend:` line) will see every other consumer skill default to `local-files` instead. A dedicated migration pass — relabeling live records, folding `specs/backlog/` into the unified record store, extending (or retiring) the flag alias across every consumer, and renaming the CLAUDE.md flag — is planned as separate follow-on work; this section will point to it once it lands.

## Configuration

### Worktree base ref (important for worktree mode)

claude-tweaks branches each worktree from your **current local HEAD** — the branch you ran `/build` or `/flow` on, including any merged specs or in-progress integration commits. The native `EnterWorktree` tool has no base-ref parameter, so the base is decided by the harness setting `worktree.baseRef`:

```json
// settings.json
{ "worktree": { "baseRef": "head" } }
```

The harness **default is `fresh`**, which branches from `origin/<default-branch>`. On a project whose integration branch is local and ahead of the remote default (e.g. a long-lived `dev`), `fresh` silently branches from a **stale** commit, and your work lands on the wrong base. Set `baseRef: "head"`. As a safety net, `/build` Common Step 1 verifies the worktree's actual base immediately after creation and stops if it doesn't match your HEAD.

### Worktree sessions and `claude --resume`

Because `worktree.always` forces nearly every session to enter a worktree on its first edit, this is worth knowing up front: entering a worktree mid-session (via `EnterWorktree`, or `Agent` with `isolation: "worktree"`) pivots that session's own storage into a project bucket keyed by the worktree's path, not the parent project's. `claude --resume` run from the parent project directory no longer lists it.

This is a known, accepted limitation in Claude Code itself — not something claude-tweaks controls or can work around. Anthropic has closed it as duplicate/not-planned: [#30906](https://github.com/anthropics/claude-code/issues/30906) ("Worktree cwd is not restored on session resume"), [#42596](https://github.com/anthropics/claude-code/issues/42596) ("Worktree sessions are transient and cannot be resumed"), [#48835](https://github.com/anthropics/claude-code/issues/48835) (silent `--resume` failure). Related open feature requests: #28019, #58591, #61366.

If you need to resume a session after it entered a worktree, `cd` into the worktree directory first and resume from there, or look for it under that worktree's own encoded project bucket. If resumability matters more than in-session automation for a given task, create the worktree manually (`git worktree add`, then `cd` in and launch `claude`) instead of letting a skill enter one for you mid-session.

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
