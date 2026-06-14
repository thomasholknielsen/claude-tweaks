---
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. Mechanical lenses only in Phase 1 — oversized files, dead exports, TODO/FIXME, loose dependency ranges, project lint/typecheck. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Recon — Proactive, Report-Only Repo-Improvement Finder

A recurring watchman doing rounds: applies mechanical improvement lenses to a repo, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing as deduplicated GitHub issues. It never edits code.

```
                  [ /claude-tweaks:recon ] ← utility (no fixed lifecycle position)
                               │  surfaces the work worth making
                               ▼
 findings → file GitHub issue (label: recon) → /claude-tweaks:specify → /claude-tweaks:build / /claude-tweaks:flow
          └ fuzzy / not-yet → /claude-tweaks:capture (INBOX)
```

The plugin reacts to changes you make; `/recon` surfaces the changes worth making.

## When to Use

- You want a periodic, hands-off pass that keeps technical debt visible without driving each scan yourself.
- You want machine-found improvements filed as GitHub issues that drop into `/specify` with near-zero translation.
- You want to dedup against work already tracked — never re-flood the tracker.

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing INBOX/specs (recon owns no backlog — it routes findings into the stores that already exist).

## Input

`$ARGUMENTS` may contain:

- `--area <path>` — scope the run to one area (default: all detected areas).
- `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
- `--root <dir>` — scan a project elsewhere (default: current directory).

## Workflow

**Step 1 — Smoke (dry-run).** Confirm the engine runs and see what it would do, writing nothing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --dry-run
```

Read the JSON plan printed to stdout. If it errors, stop and report — do not proceed to a real run.

**Step 2 — Gather open issues for dedup.** Read the fingerprints of existing `recon`-labelled issues so the engine can skip/reopen correctly:

```bash
gh issue list --label recon --state all --json number,state,labels,body --limit 500 > /tmp/recon-issues.json
```

Transform each issue into `{number, state, labels, fingerprint}` by extracting the `<!-- recon-fingerprint: recon-XXXXXXXX -->` marker from its body, and write the array to a file (e.g. `/tmp/recon-open.json`). If `gh` is unavailable or the repo has no recon issues yet, skip this step — the run dedups against the local cache only.

**Step 3 — Run.** Produce the plan and update the dedup cache:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --issues /tmp/recon-open.json
```

The engine emits a JSON object: `{ runId, areas, plan:[{fingerprint, action, severity, title, payload?}], summary:{file, remember, reopen, skip, suppress} }`.

**Step 4 — File / reopen issues yourself.** For each plan entry, act per its `action` — `recon.js` only emits payloads; it never calls the network:

- `file` → `gh issue create --title "<payload.title>" --body "<payload.body>" --label recon --label "recon:<severity>"`
- `reopen` → `gh issue reopen <entry.issue>` and add a comment noting the regression.
- `skip` / `remember` → do nothing (already tracked, or below threshold and remembered in the cache).
- `suppress` → do nothing (a `wontfix`-labelled issue — a standing decision already recorded).

**Step 5 — Summarize.** Report the counts (`filed`, `reopened`, `skipped`, `remembered`) and list any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to *file issue / INBOX (`/capture`) / `/specify` directly / dismiss*.

## Judgment Lens Dispatch

Runs after the mechanical lenses, only when judgment lenses are enabled in config (default: `architecture-depth,simplification,review-quality`) and the scoring step selected at least one area. Each judgment lens is an LLM subagent reading the area's source against a shared Phase 0 criteria fragment — `recon.js` itself never calls a model; it emits work orders and ingests results.

> **Parallel execution:** Dispatch the work orders as parallel Task agents — each runs independently against one (area, lens) pair and returns findings in Template A's JSON-block form. Assemble all responses into one results file after every agent completes.
> **Contract:** Each agent follows the Subagent Contract (`skills/_shared/subagent-output-contract.md`) — minimal input (the work order's `prompt` field, nothing else), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line, then the fenced JSON block the prompt specifies. Use the work order's `modelTier` (`haiku` or `sonnet`). The prompt already embeds the criteria, the Finding JSON shape, and the status-line requirement — pass it verbatim, add nothing.

### Step J1 — Emit work orders

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" plan-judgment \
  --root . \
  --run-id "${RUN_ID}" \
  --areas "${SELECTED_AREAS}" \
  --lenses "${ENABLED_JUDGMENT_LENSES:-architecture-depth,simplification,review-quality}" \
  --max-subagents "${MAX_SUBAGENTS:-6}"
```

This writes `.claude-tweaks/recon/runs/${RUN_ID}-work-orders.json` (gitignored) and prints the same JSON. Each order is `{ lensId, area, modelTier, prompt }`. The list is already truncated to `MAX_SUBAGENTS` — the dispatch loop below iterates at most that many times.

### Step J2 — Dispatch one subagent per work order (capped)

For each work order in the array (no more than `MAX_SUBAGENTS`):
- Dispatch one Task agent at the order's `modelTier`.
- The agent prompt is the order's `prompt` field, used **verbatim** — it already contains the criteria fragment, the required Finding JSON shape, and the status-line instruction.
- Capture the agent's reply. Parse the fenced ```json block into a `findings` array (empty array if the agent reported none).
- Collect one entry per order: `{ "lensId": <order.lensId>, "area": <order.area>, "findings": [ ... ] }`.

Assemble all entries into `.claude-tweaks/recon/runs/${RUN_ID}-results.json` as a JSON array. **Never pass an individual agent's raw text to `ingest-judgment`** — ingest reads the assembled results file so the dedup pass sees the whole run at once.

**Budget rule:** `MAX_SUBAGENTS` defaults to `6` (K=2 areas x 3 lenses). `plan-judgment` enforces the cap by truncating the work-order list; the dispatch loop must not exceed `orders.length`. Never dispatch a lens/area pair that is not in the work-order list.

### Step J3 — Ingest results

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" ingest-judgment \
  ".claude-tweaks/recon/runs/${RUN_ID}-results.json" \
  --root . \
  --run-id "${RUN_ID}"
```

This validates each finding (dropping malformed ones with a logged reason on stderr), fingerprints survivors, deduplicates against the cache and open `recon`-labelled issues, and prints `gh`-ready issue payloads on stdout for the survivors. Hand those payloads to `gh issue create` exactly as in the mechanical-lens triage step (Phase 1) — judgment findings flow through the same filing path.

## Next Actions

1. `/claude-tweaks:specify <issue-url-or-title>` — promote a filed recon issue into an agent-sized spec. **(Recommended when high-severity issues were filed.)**
2. `/claude-tweaks:capture <finding>` — park a fuzzy or below-threshold finding in INBOX for later triage.
3. `node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --area <path>` — re-run scoped to a single area to dig deeper.
4. `/claude-tweaks:tidy` — fold the new issues into a backlog-hygiene pass alongside INBOX and deferred items.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:recon` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Routine Configuration

`/recon` is designed to run unattended on a schedule via a Claude Code Routine
(`/schedule` or `claude.ai/code/routines`). Design for **small predictable sips**: a tight
per-run budget so a scheduled run is cheap and a skipped run is harmless (the round-robin
coverage floor means any starved area is force-picked on the next window).

```
Name:      recon-daily
Schedule:  daily at 03:00 (off-peak)
Prompt:    /claude-tweaks:recon
K-budget:  1–3 areas per run (cfg.K)
Fan-out:   capped subagent count for judgment lenses (--max-subagents)
```

A headless Routine run does: discover → score (top-K) → run lenses → fingerprint → dedup against
open `recon` issues → file issues for findings ≥ threshold → record the run-log. Triage happens
later, in GitHub, by a human (close / `wontfix` / pick one up via `/flow --from-recon`).

> **Billing note:** Routines run inside the subscription (no separate API key); verify any
> automation-credit specifics against the live account.

## Regression and Critical Gating

`status` reads the dedup cache + run-logs and prints one summary line; it gates a scheduled
Routine on regressions or open criticals (exit 1 stops the Routine for a human to look):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status
# open:N regressed:N closed:N wontfix:N

node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on regressed
# exits 1 when any finding has reappeared after being closed

node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on critical
# exits 1 when any open finding is severity critical
```

## Regression Reopen

When dedup returns `{action:'reopen', issue, note}` (a finding matching a **closed,
non-`wontfix`** issue has reappeared — design §9), reopen the issue and comment, through the
`gh` CLI:

```bash
gh issue reopen <issue>
gh issue comment <issue> --body "Regressed: this finding reappeared on run <runId>. <note>"
```

A `{action:'suppress'}` decision (the issue carries the `wontfix` label) files nothing — the
standing decision is respected. The engine never calls `gh`; it returns the decision and the
SKILL.md hands the reopen+comment to the tool.

## Fingerprint Churn

Each persisted run records its fingerprint set under `.claude-tweaks/recon/runs/` (gitignored).
`churn-report` compares consecutive runs and prints a per-run churn table. A ratio near 0 means
fingerprints are stable; a ratio near 1 means most IDs changed run-to-run, pointing at normalizer
instability (cosmetic edits minting new IDs — design §16's top risk).

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report --fail-on-high-churn 0.5
# exits 1 when any run-to-run churn ratio >= 0.5
```

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a recon run | Recon is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec. |
| Filing every finding regardless of severity | Floods the tracker. Below-threshold findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always dedup against open `recon` issues (Step 2) before filing. |
| Calling the network from `recon.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Using a skill-directory environment variable to invoke the CLI | No such variable is set by Claude Code. Always use `${CLAUDE_PLUGIN_ROOT}/bin/recon.js`. |
| Dispatching more subagents than `MAX_SUBAGENTS` in one run | Cost is bounded by K and the cap. `plan-judgment` truncates the work-order list; iterate at most `orders.length` and never invent extra lens/area pairs. |
| Passing a single agent's raw reply to `ingest-judgment` | Ingest reads the assembled `results.json` so dedup sees the whole run atomically. Collect every reply into the results file first, then ingest once. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Recon findings are pre-specs — a filed `recon` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to INBOX via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it can fold into a hygiene pass. |
| `/claude-tweaks:flow` | `/flow --from-recon` pulls the `recon`-labelled issues this skill files and runs them as a multi-spec batch (derive specs via `/specify` → build/test/review/polish/wrap-up). `/recon` files and reopens issues; `/flow` consumes them. See `flow/from-recon.md`. |
