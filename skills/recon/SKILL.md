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

## Next Actions

1. `/claude-tweaks:specify <issue-url-or-title>` — promote a filed recon issue into an agent-sized spec. **(Recommended when high-severity issues were filed.)**
2. `/claude-tweaks:capture <finding>` — park a fuzzy or below-threshold finding in INBOX for later triage.
3. `node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" run --area <path>` — re-run scoped to a single area to dig deeper.
4. `/claude-tweaks:tidy` — fold the new issues into a backlog-hygiene pass alongside INBOX and deferred items.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:recon` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a recon run | Recon is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec. |
| Filing every finding regardless of severity | Floods the tracker. Below-threshold findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always dedup against open `recon` issues (Step 2) before filing. |
| Calling the network from `recon.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Using a skill-directory environment variable to invoke the CLI | No such variable is set by Claude Code. Always use `${CLAUDE_PLUGIN_ROOT}/bin/recon.js`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Recon findings are pre-specs — a filed `recon` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to INBOX via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it can fold into a hygiene pass. |
| `/claude-tweaks:flow` | Phase 3 adds a `/flow` affordance to pull a batch of open `recon`-labelled issues, route each through `/specify`, and execute the pipeline. Until then, promote issues to specs manually. |
