# Journey Health & Report-Only Health Routines

**Date:** 2026-07-11
**Status:** Approved (brainstorm 2026-07-11)
**Origin:** Started as "a routine to keep `docs/journeys/*.md` accurate for agent e2e testing." Scoping the judgment logic surfaced that `/harness-health` is the only "health" watchman that auto-applies patches directly (`/code-health` never touches code); the user asked to fix that inconsistency in the same design so all health routines share one mental model — judge, never touch, always file.

## Problem

`docs/journeys/*.md` files (persona, goal, steps, `files:` frontmatter) back both `/visual-review`'s experiential checks and the QA stories `/test` runs as actual agent-driven e2e checks. Nothing keeps them honest over time:

- `/claude-tweaks:journeys` only runs on invocation — after a `/build`, or manually. A journey nobody touches can drift silently (renamed components, changed routes, `files:` entries pointing at deleted files) indefinitely.
- `/claude-tweaks:review`'s `3g-cov` lens computes journey↔story coverage gaps, but only when `/review` runs.
- `/claude-tweaks:visual-review journey:{name}` can catch live drift (the journey no longer "feels" right, red flags now trigger), but only when someone manually re-walks that specific journey.

No mechanism rotates through existing journeys the way `/code-health` rotates through code or `/harness-health` rotates through skills/rules/CLAUDE.md — checking git churn + staleness since last audit, judging, and filing findings unattended.

Separately, `/harness-health` currently auto-applies additive+high-confidence+high-reversibility patches to skills/rules directly (`Edit` + commit), while `/code-health` never edits anything — it only ever files issues. That inconsistency is fixed here too, so "health routine" means the same thing everywhere: a pure judge that files GitHub issues and never touches the content it audits.

## Architecture: two parts, one doc

**Part A — `/harness-health` becomes report-only.** Drop its auto-apply path; every finding files as a `harness-health`-labelled issue, matching `/code-health`.

**Part B — new `/claude-tweaks:journey-health` skill.** A third watchman: rotates through `docs/journeys/*.md` via cursor+churn+staleness selection, judges via three reused/shared checks plus one live check, always files `journey-health`-labelled issues.

## Part A — harness-health changes

- **Step 7 ("APPLY or FILE") collapses to FILE-only.** Every payload files via `gh issue create --label harness-health`, regardless of `classification`/`confidence`/`reversibility` — those fields stay on the issue as triage metadata, they just stop branching behavior.
- **Drop the `mark applied` cursor state.** Nothing applies anymore, so nothing needs marking applied; dedup already happens via GitHub issue fingerprinting. `mark declined` stays (interactive dismiss still needs it).
- **Step 8 interactive routing drops "Apply now."** Two-tier gate becomes `"File all recommended"` / `"Route individually"`; per-finding options become `"File issue"` / `"Dismiss"` (was three options, now two).
- **Remove the `auto-mode: default-on` dependency paragraph** from Routine Configuration — it only existed to gate the now-deleted auto-apply path.
- **Anti-patterns table:** collapse "Auto-applying a CLAUDE.md patch" and "Auto-applying a restructural patch" into one row: "Applying any patch directly instead of filing an issue."
- **Resolution path unchanged:** filed issues flow through `/triage dispatch` → `/flow`, or manual pickup — the same path `code-health` issues already take.
- **Cross-reference sweep required:** grep the repo for other prose describing harness-health's auto-apply capability (`_shared/auto-mode-contract.md`, `/tidy`'s scan procedures, `/help`'s reference card) before calling this done — this is exactly the "state-replacing change leaves stale prose elsewhere" failure mode this project's CLAUDE.md already warns about.

## Part B — `/claude-tweaks:journey-health`

A new utility skill (no fixed lifecycle position, like `code-health`/`harness-health`). Judges journey documentation; never edits journey files, story YAMLs, or code — every finding either files as an issue or (for cursor/cache state) writes to its own persistent state, nothing else.

### Two tiers, two cadences

**Light tier** (frequent, cheap, no browser) — one journey per firing via `next-target` (churn on that journey's `files:` frontmatter paths, or staleness fallback, same shape as `code-health`'s `next-slice`/`harness-health`'s `next-target`):

1. **File-existence check** (new, mechanical) — do all `files:` frontmatter paths still exist on disk?
2. **Self-review criteria** (reused) — `/journeys` Step 3.5 already defines persona/step-shape/origin-coverage/outcome-clarity checks, applied at *write time*. Extract into `_shared/journey-self-review.md` so `/journeys` (write-time) and `journey-health` (audit-time) apply the identical criteria — closing the gap for journeys nobody has touched recently.
3. **Coverage gaps** (reused, decoupled cursor) — modeled on `harness-health`'s separate `gapScanCursor`: a whole-library scan (not tied to whichever single journey `next-target` picked that firing) that computes uncovered journey steps + orphaned stories via `_shared/journey-coverage-check.md`, extracted from `/review`'s `3g-cov` lens. `/review` keeps its fast inline informational table reading the same fragment; `journey-health` adds cursor-tracking + issue-filing on top.

**Deep tier** (infrequent, expensive, live app required) — for journeys the light tier didn't already flag as structurally broken (no dead `files:` entries):

- Stories exist for the journey → drive `/test journey={name}` (mechanical pass/fail — the actual "agent e2e" surface this whole design is protecting).
- No stories yet → fall back to `/visual-review journey:{name}` (experiential walk).
- On failure, the finding states which way the evidence points: **confirmed drift** (selectors/flow changed, journey text is stale — recommend `/claude-tweaks:journeys {name}`) vs **confirmed regression** (app behavior broke — filed as a plain bug, no claude-tweaks command recommended). Same "don't assume, show evidence" discipline `harness-health` already applies when a rule's low compliance ratio could mean either a stale rule or non-compliant code.

### Deep tier cloud-execution story

Both risky primitives the deep tier needs are already routine-compatible by existing convention, not new plumbing:

- **Browser access** — `/test`/`/visual-review` are already `agent-browser`-only by an existing hard rule (never `claude-in-chrome`/`backend=chrome`, specifically because `agent-browser` is the confirmed headless-Routine-compatible backend). `journey-health`'s deep tier delegates to them, inheriting this for free.
- **Running app** — `_shared/dev-url-detection.md` already auto-starts an ephemeral dev server with no prompt when a dev command is known and auto mode is active (a routine firing always is). `/test`/`/visual-review` already call this procedure.
- **Cleanup wrinkle:** that doc's cleanup rule has a "pipeline" branch (torn down by `/wrap-up`) and a "standalone" branch (the calling skill stops it itself). A routine firing has no `/wrap-up`, so it's the standalone branch — `journey-health`'s deep tier must explicitly kill the ephemeral server itself after `/test`/`/visual-review` returns.
- **Untested assumption:** nobody has confirmed a real cloud Routine firing can sustain a background dev server + reach it via `agent-browser` within the firing's time/resource limits. This repo has no UI to validate against.

**Fallback if the assumption fails:** the light tier's `routine-template.yml` ships unconditionally regardless of deep-tier feasibility. The deep tier always works interactively (`/claude-tweaks:journey-health --deep`, run by a human against their own running app). `routine-template-deep.yml` (scheduled/headless deep tier) only ships once a validation spike confirms the cloud sandbox can sustain it.

**Validation spike (implementation Task 1):** a minimal, throwaway one-off Routine firing — start a target project's dev server in the background, wait for it to respond, use `agent-browser` to navigate and screenshot, report success/failure, tear down the server. Tests only the two risky infrastructure primitives in isolation, against a real target project once one's available (not this repo). Gates whether `routine-template-deep.yml` gets written at all.

### Persistent state

`.claude-tweaks/journey-health/` — `cursors.json`: per-journey `{ lastLightAuditMs, lastLightHash, lastDeepAuditMs, lastDeepHash }` (light/deep tracked independently so the two cadences don't clobber each other), plus one global `coverageScanCursor` for the decoupled coverage scan. `cache.json`: fingerprint → `{ status: declined, lastSeenMs }` (no `applied` status — nothing auto-applies).

### Issue filing

Findings converge on the same mechanics as `code-health`/`harness-health`: fingerprint (`journey + category + section + normalizedDescription`) → dedup against open `journey-health`-labelled issues + local cache → `gh issue create --label journey-health --label <category>`.

| category | section | Recommended action in issue body |
|---|---|---|
| `drift` | `files-frontmatter` | `/claude-tweaks:journeys {name}` — prune the dead entry |
| `drift` | `self-review` | `/claude-tweaks:journeys {name}` — content needs updating |
| `drift` | `live-check` | `/claude-tweaks:journeys {name}` + evidence of what changed |
| `coverage` | `coverage` | `/claude-tweaks:stories journey={name}` — stories need generating |
| `regression-suspected` | `live-check` | No claude-tweaks command — product bug, filed with evidence |

Resolution flows through the existing pipeline (`/triage dispatch` → `/flow`, or manual) — same as `code-health`/`harness-health` today.

### `$ARGUMENTS`

- (none) — light tier, `next-target` rotation.
- `--deep` — deep tier. Interactive always; routine-schedulable only once the validation spike passes (see above).
- `--target <journey-name>` — manual override, bypasses rotation.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` journeys in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

### Error handling

No `docs/journeys/` yet → report "nothing to audit yet," not an error (mirrors `harness-health`'s equivalent case). No dev command / ephemeral server won't start → skip that journey's deep check, don't advance its `lastDeepAuditMs` (retry next firing), log the gap. `gh` unavailable → skip filing/dedup, degrade gracefully (same as `harness-health` today).

### `routine-template.yml` (light tier)

```yaml
template_version: 1
routine_name: journey-health-daily
prompt: "/claude-tweaks:journey-health"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob]
mcp_connections: []
default_schedule:
  cron_expression: "0 4 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Report-only, like code-health — no Edit in allowed_tools, nothing auto-applies. Light-tier
  checks only (file-existence, self-review, coverage scan); the deep tier is interactive-only
  (`--deep`) until a validation spike confirms cloud-Routine feasibility for a background dev
  server + agent-browser session. See journey-health/SKILL.md's deep-tier section.
```

`routine-template-deep.yml` (light-vs-deep variant pattern, mirroring `/tidy`'s `--variant=github-triage`) is deferred — not written until the spike passes. When it lands, its `allowed_tools` will need `Write` added (mandatory for `dev-url-detection.md`'s `servers.yml` persistence) and a looser, weekly-scale cron given the per-journey cost of booting a dev server and a real browser session.

## Cross-references requiring updates (bidirectional convention)

- `CLAUDE.md`: utility skill list (add `journey-health`), skill count.
- `README.md` and `/help`'s `reference-card.md`: add `/claude-tweaks:journey-health`.
- `/claude-tweaks:routine`'s Relationship table: add `journey-health` as a consumer.
- `/claude-tweaks:journeys` SKILL.md: Step 3.5 references `_shared/journey-self-review.md` instead of inline criteria; Relationship table gains a `journey-health` row.
- `/claude-tweaks:review` SKILL.md: `3g-cov` lens references `_shared/journey-coverage-check.md` instead of inline logic; Relationship table gains a `journey-health` row.
- `/claude-tweaks:test` and `/claude-tweaks:visual-review` Relationship tables: add `journey-health` as a caller.
- `/claude-tweaks:tidy`'s `_shared/github-pr-scan.md` sweep: add `journey-health`-labelled issues alongside `code-health`/`harness-health`.
- One-time repo setup: `gh label create journey-health` in any project adopting this (same as the existing `code-health`/`harness-health` labels).

## Testing approach

`bin/journey-health.js` (`next-target`, `validate-findings`, `mark`, `churn-report`) mirrors `code-health.js`/`harness-health.js`'s shape; `bin/lib/journey-health/*.js` gets `node --test` coverage for the deterministic parts (cursor/next-target selection, fingerprinting, dedup/decline-cache transitions), folded into the aggregate `npm test`. The LLM-judgment half (self-review, drift-vs-regression triage) isn't unit-testable — verified via `--dry-run` runs during development, same convention `code-health`/`harness-health` established. The deep tier's cloud-execution assumption is verified by the validation spike (Task 1), not a unit test.

## Explicitly out of scope

- **Auto-applying anything, ever** — `journey-health` never edits journey files, stories, or code; every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or by `/triage dispatch` → `/flow`, never by `journey-health` itself.
- **A cross-project journey-health rollup** — no mechanism to see status across every project it's instantiated in; `RemoteTrigger {action: "list"}` covers this ad hoc if ever needed, same deferred item as `routine`'s own design.
- **Owning regression triage** — a deep-tier `regression-suspected` finding is filed with evidence and left to normal bug-triage; `journey-health` doesn't become a QA/regression-tracking system.
