---
name: tidy
description: Use when the backlog needs hygiene — review stale backlog records, parked-trigger wakes, unsynced local records, and orphaned plans/worktrees
argument-hint: "[--scope=<name>[,<name>...]] [--dry-run]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Tidy

Periodic backlog hygiene to keep the spec system healthy. Run when the backlog feels cluttered, before a brainstorming session, or on a regular cadence.

```
/claude-tweaks:capture → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                               ↑
                    [ /claude-tweaks:tidy ] (maintenance loop)
                 ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- The backlog is getting long (10+ records)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues
- Just want a narrower check (e.g. `/claude-tweaks:tidy --scope=github` for GitHub issue triage only, skipping everything except Step 4.8) — see "Scope Selection" below

## Input

`$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]] [--dry-run]`. With no `--scope` argument, /tidy scans everything — the open work-record queue (per `work-backend` — see `step-1-records.md`), design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. `--dry-run` forces every finding to Stage regardless of mode or aggressiveness tier, and skips Step 7 execution entirely — see Step 6's `--dry-run` override for the full behavior. The two flags compose freely (e.g. `--scope=github --dry-run` previews just the GitHub-triage scope's would-be mutations). An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope` or `--dry-run`.

## Scope Selection

By default (no `--scope` argument) /tidy runs every scan step below — the full sweep, unchanged from before this feature existed. `--scope=<name>[,<name>...]` (comma-separated, no spaces) narrows a run to just the named step groups:

| Scope | Steps covered |
|---|---|
| `backlog` | 1 |
| `specs` | 1, 5 |
| `docs` | 3 |
| `plans` | 4 |
| `git` | 4.5 |
| `registry` | 4.6 |
| `claims` | 4.7 |
| `github` | 4.8 |
| `design` | 4.9 |
| `patterns` | 5.5 |

Rules:

- **Unknown scope name** — stop before dispatching anything and report the invalid name(s) alongside this table. Do not partially run a request that mixes one valid and one invalid name.
- **`backlog` and `specs` both draw from Step 1's single record-scan query** (the former Steps 1 and 2 merged into one record scan — see "Scan steps" below) — `specs` additionally pulls in Step 5's sizing review over `ready` records, mirroring the pre-merge `specs` scope's Step 2+5 grouping. No other scope pulls in another — Step 5.5 (`patterns`) is self-contained (git-log only) and no longer depends on Step 1's output, so it doesn't imply `specs`.
- **The two acceptance backstops — `[parent-gate]` and `[acceptance-gap]` — sit in a different scope on each driver.** Both come from Step 4.8 (`github`) under `work-backend: github-issues` and from Step 1 (`backlog`, and `specs` through it) under `work-backend: local-files`, since the local sweeps read the record store rather than the GitHub API. `--scope=github` surfaces neither on the local driver, and `--scope=backlog` surfaces neither on the GitHub one; an unscoped run covers both regardless.
- **Scoped runs use the identical Step 6 report/approval, Step 7 execution, and Step 7.5 verification** as a full sweep — only the set of findings feeding them is narrower. The Step 7 commit message names the scope explicitly (see Step 7.5 below); an unscoped full run's commit message is unchanged.

## Steps 1-4.95 and 5.5: Scan Everything

> **No decisions during scanning.** Steps 1-4.95 and 5.5 silently collect all findings. Everything is presented as one batch in Step 6 for approval. This replaces the previous per-item decision model.

Steps split by cost, the same way `skills/help/status-scan.md`'s Execution model does. A step whose scan rules are substantial enough to inline, or that does real `gh` work, earns a Task agent. Steps 4, 4.6, 4.9, and 4.95 are none of those — their entire rule set is a four-row table over a `Glob` of the plan directories, a single `Read` of `docs/REGISTRY.md`, and one Skill-tool call that shells out to a JSON-emitting script (twice — the design-wrapper doctor check and the calibration read-out), respectively — so dispatching them as agents would pay the full inherited `CLAUDE.md` cost to run one `Glob`. They run in the main thread instead.

**Extracted — read `scan-execution.md` in this skill's directory.** That file carries the dispatch
contract, model profile, output template, and column semantics for the agent-backed steps, plus
the main-thread Step 4/4.6/4.9/4.95 execution note — everything below this paragraph through the
`--scope`-selectable rule. Nothing of that mechanics remains here; this section survives so an
external reference to it still resolves in one hop.

### Scan steps (data sources + collection format)

Read `scan-procedures.md` in this skill's directory for the full classification tables, age thresholds, and per-step rules. The dispatcher inlines the relevant section into each agent's prompt so subagents have everything they need. Main-thread Steps 4 and 4.6 read their own sections from that file directly — nothing to inline, since there is no agent boundary to cross.

**Step 1 is a separate file.** Its rules live in `step-1-records.md`, not in `scan-procedures.md` (which keeps only a stub under that heading). Read `step-1-records.md` and inline it **whole** into the Work Records agent's prompt; read it only when the active scope selects Step 1 (`backlog` or `specs`, or an unscoped run), so a scoped run that never touches records never pays for it. The two files are read independently — neither is a prerequisite for the other.

**Step 4.7's four backstop scans are likewise a separate file.** Their rules live in `issue-claims-backstops.md`, not in `scan-procedures.md` (which keeps only a stub under each `### Backstop:` heading). Read `issue-claims-backstops.md` and inline it **whole** into the Issue Claims agent's prompt, directly after `scan-procedures.md`'s own Step 4.7 section — see that file's own header for why the ordering matters.

| Step | Data source | Output prefix |
|------|-------------|--------------|
| 1 (rules in `step-1-records.md`) | Open work records — `gh issue list` facet-parsed by `record.js`'s `parseRecordFacets` (`github-issues`), or `local-store.js`'s `queryRecords('specs', {})` (`local-files`); those two plus `writeRecord` are the whole record driver in `bin/lib/issues/{record,local-store}.js`. Under `local-files` only, Shapes 7 and 8 each run their own `queryRecords` pass, since the shared fetch above returns open records only: Shape 7 pairs an open-parent query (`{ isParentIssue: true }`) with an open+closed sub-issue merge per parent, and Shape 8 queries closed records directly (`{ closed: true }`) and keeps every one that is not a decomposed sub-issue — a closed parent surfaces there, only sub-issues are suppressed | `[backlog]` / `[parked]` / `[unsynced]` / `[scoring]` / `[blocked]` / `[legacy]` (Shape 5.5 — retired-label hygiene, `github-issues` only) / `[parent-gate]` / `[acceptance-gap]` (those last two `local-files` only — Step 4.8 emits both on the other driver) |
| 3 | `docs/superpowers/specs/*-design.md` | `[doc]` |
| 4 (main thread, parallel with the agent batch) | `docs/superpowers/plans/`, `~/.claude/plans/` | `[plan]` |
| 4.5 | `bin/residue.js` (`kind: worktree` — all worktrees; `kind: branch` — merged remote-tracking branches, supplementary; `kind: artifact` — aged QA artifact dirs + legacy artifact roots), `git branch --list "build/*"` (local branches, any merge state — the CLI has no equivalent) | `[git]` |
| 4.6 (main thread, parallel with the agent batch) | `docs/REGISTRY.md` | `[registry]` |
| 4.7 | `gh api contents/claims` on `claims-registry` | `[claim]` |
| 4.8 | `gh pr list` / `gh issue list --label by:code-health` / `--label by:harness-health` / `--label by:journey-health` / `--label by:docs-health` per `_shared/github-pr-scan.md` (`repo-wide` scope), plus closed records with no acceptance disposition per `_shared/github-pr-scan-acceptance.md`'s `acceptance-gap` scope, plus decomposition parents complete but ungated per that same file's `parent-gate` scope | `[pr]`, `[gh-issue]`, `[acceptance-gap]`, `[parent-gate]` |
| 4.9 (main thread, parallel with the agent batch) | `/claude-tweaks:design-wrapper doctor --source tidy` — the project's own Impeccable artifacts | `[doctor]` |
| 4.95 (main thread, parallel with the agent batch) | `plugin/bin/calibration-report.js` — report-only, no scope tag of its own | `[calibration]` |
| 5 (sequential, after Step 1) | `ready` records not yet claimed | `[sizing]` |
| 5.5 (parallel, independent of every other step) | Recent git history of review/wrap-up commits | `[pattern]`, `[health]` |

There is no Step 2 — it merged into Step 1 (see Scope Selection above). The rest of the numbering is unchanged from before this merge, including the decimal sub-steps under Step 4, so existing cross-references from other skills keep pointing at the right step.

---

## Action Vocabulary

Every recommendation in the tidy report uses one of these actions. Each action is atomic — either fully executed or not at all. Do not commit partial state (e.g., deleting a backlog record without creating the destination artifact).

**Label writes this skill is permitted.** Add or remove `parked` (Defer action, and the trigger-met wake), remove an orphaned `bot:in-progress` (Step 4.7's backstop), and add `demo:pending` (Open parent gate action — on `work-backend: local-files` the equivalent write is the parent record's `acceptance: pending` facet). Never `demo:approved`/`demo:changes-requested` (`/claude-tweaks:demo`'s job, human-verdict-gated) or `auto:*` (`/claude-tweaks:backlog refine`'s job). See `_shared/work-record.md`'s permission matrix.

**Backend probe.** Five actions read `work-backend` first (`_shared/work-record.md`'s Config keys table): four vary by driver (`Delete`, `Defer`, `Absorb`, `Open parent gate` — both `actions-*.md` files carry a matching section), one is `github-issues`-only with no `local-files` counterpart (`Sync to GitHub`). Read exactly one of `actions-github-issues.md` / `actions-local-files.md` for the procedures the Execution column defers to; the rest behave identically on both drivers and stay inline below.

| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | Per `work-backend` — see the resolved Action Execution file's `## Delete` | Yes (file) / issue closes (GitHub) |
| **Defer** | Valid but not timely — park with a trigger condition | Per `work-backend` — see the resolved Action Execution file's `## Defer` | No (file, same file updated in place) / issue stays open, relabeled (GitHub) |
| **Absorb** | Scope belongs in an existing record | Both backends: (1) integrate scope into the target record's Deliverables, Acceptance Criteria, and Technical Approach — not as an appendix, as first-class content. Steps (2)-(3) are per `work-backend` — see the resolved Action Execution file's `## Absorb` | Yes (file) / issue closes (GitHub) |
| **Promote** | Ready for `/claude-tweaks:specify` | No mutation on either backend — the record already exists and is the durable pointer; recommend `/claude-tweaks:specify {ref}` directly (`#{n}` under `github-issues`, the bare id under `local-files`). `/specify`'s Shaping mode removes `parked` (if present) and stamps `ready` on the record in place — see `_shared/work-record.md` and `specify/SKILL.md`'s Shaping mode; there is no separate entry to delete. | No — record unchanged, mutation deferred to `/specify` |
| **Keep** | No action needed | None | No |
| **Mark as specified** | An unstamped design doc whose scope already matches existing specs (Step 3's design-doc classification) | Stamp `Status: specified — decomposed to {record refs}` below the title — `scan-procedures.md` Step 3 | No — doc stays, stamped in place |
| **Sync to GitHub** | A local record carries `unsynced: true` while `work-backend: github-issues` — mirror it to an issue now | `work-backend: github-issues` only — see `actions-github-issues.md`'s `## Sync to GitHub`. Has no `local-files` counterpart | Yes — moves to GitHub, local file deleted |
| **Open parent gate** | A decomposition is complete (every sub-issue closed) but its parent issue carries no acceptance disposition yet — compose the parent's Verification Brief, then mark the parent `demo:pending` (`acceptance: pending` under `local-files`) | Per `work-backend` — see the resolved Action Execution file's `## Open parent gate`. Both reuse `wrap-up/verification-brief.md`'s Parent-Gate Procedure via its parent-side entry; only the scan that surfaces the finding differs (`_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope under `github-issues`, `step-1-records.md`'s Shape 7 under `local-files`) | No — comment + label (GitHub) / one record-file write (local); never closes the parent |
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Files a new backlog record (no stage label / no `stage:` facet) via `/claude-tweaks:capture`'s own write path, referencing the PR/thread/issue URL | No — creates a backlog record |
| **Arm ready PR** | A green, gate-passed, granted PR (`github-issues` only — housekeeping or record-linked) surfaced by `_shared/github-pr-scan.md`'s `repo-wide` scope item 9 with `--auto` never armed | `actions-github-issues.md`'s `## Arm ready PR` — re-verifies grant and gate status fresh, then runs `_shared/pr-first-merge.md`'s arm step | No — arms `--auto`; the merge itself lands later, once checks pass |

`Capture`, `Close (GitHub)`, and `Resolve thread` are unaffected by `work-backend` — they behave identically on both drivers. `Open parent gate` is the exception among these last four: it runs on both drivers but writes differently on each, so it is resolved through the Backend probe above rather than executed inline.

### Why "Promote" keeps the record in place

Lifecycle: backlog → brainstorm (optional) → `/claude-tweaks:specify` shapes to `ready`, editing the same record in place (stamps `ready`, removes `parked`) — the record is the only tracking artifact at every stage (`_shared/work-record.md`), so Promote deletes nothing.

### Absorb means integrate, not append

When absorbing a backlog record into an existing one, the absorbed content must be indistinguishable from original content — add to Deliverables/Acceptance Criteria/Technical Approach/Gotchas directly. Never an "Absorbed Scope" appendix — `/superpowers:writing-plans` may miss or mistreat it.

---

## Step 6: Present Tidy Report and Approve

**`--dry-run`:** when passed, every finding routes to Stage regardless of mode or aggressiveness tier — Step 7 never executes, whether the run is Auto mode (embedded-pipeline or Standalone) or Interactive. The Auto-mode routing table (in `step-6-auto.md`) is bypassed entirely. Interactive mode still renders the full report and its `AskUserQuestion` approval, but choosing "Approve ({N})" writes would-be log entries instead of executing Step 7. Write each finding's would-be action as `DRY-RUN {time} — {finding} — would: {action}. Reversibility: {tier}.` to `{run-dir}/decisions.md` — same file and format the Auto-mode Log entries use, prefixed `DRY-RUN` instead of `AUTO`/`STAGED`. If no pipeline run dir exists yet (an interactive or ad hoc `--dry-run` invocation), create a Standalone-auto run dir per `_shared/pipeline-run-dir.md`'s fallback first, so the preview has somewhere durable to land. This mirrors `/claude-tweaks:routine create --dry-run`'s "inspect before anything is created" pattern one level up (see "Routine Configuration" below), but for a live tidy firing's actual mutations instead of the routine's own setup.

These two branches are mutually exclusive — read exactly one file from this skill's directory.

### Auto mode (aggressiveness-based routing)

Applies when a pipeline run directory exists (embedded pipeline), or when `/claude-tweaks:tidy` runs standalone in `auto` mode. Read `step-6-auto.md` — aggressiveness routing, `decisions.md` log entries, Standalone-auto fallback, archival compaction. Its conservative/moderate/aggressive routing implements `_shared/auto-mode-contract.md`'s reversibility and confidence floors; apply the tier's row as written rather than widening it by judgment.

### Interactive mode (batch approval)

Applies otherwise. Read `step-6-interactive.md` — the batch Tidy Report template, its `AskUserQuestion` approval call, and the override follow-up rule.

---

## Step 7: Execute Approved Actions

Skipped entirely when `--dry-run` was passed (see Step 6's `--dry-run` override above) — no mutation happens, and Step 7.5's verification checklist and commit are skipped too, since there is nothing to verify or commit.

Execute each approved action per the Action Vocabulary table above, plus the Action Execution file its backend probe resolved (`actions-github-issues.md` or `actions-local-files.md` in this skill's directory) — together those are the canonical reference for per-action execution rules (delete the record / set `stage: parked` in place or add the `parked` label / integrate into the target record / recommend `/claude-tweaks:specify`). Every action must be atomic: complete all its execution steps or none.

Cross-action housekeeping (apply once per run after all actions execute):

- Remove worktrees with `git -C "{REPO_ROOT}" worktree remove {path}`; delete branches with `git -C "{REPO_ROOT}" branch -d {name}` (see Step 4.5 working-directory discipline).

## Step 7.5: Verify Execution

After all actions are applied, verify every decision was fully executed. Present a verification checklist:

```markdown
### Verification

- [x] Deleted: "{title}" — record removed (`specs/{id}-{slug}.md` deleted, or issue #{n} closed with comment)
- [x] Deferred: "{title}" — `specs/{id}-{slug}.md` now `stage: parked` (trigger: {condition}) (`local-files`)
- [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
- [x] Synced to GitHub: "{title}" — issue #{n} created (labels: {list}), `specs/{id}-{slug}.md` deleted
- [x] Absorbed: "{title}" → #{m} — integrated into Deliverables/AC, source removed/closed
- [x] Promoted: "{title}" — recommended `/claude-tweaks:specify {ref}`, record unchanged
- [x] Marked as specified: "{title}" — doc re-read and carries the `Status: specified` stamp below its title (`scan-procedures.md` Step 3)
- [x] Captured: "{title}" — new backlog record with source URL (PR/thread/issue link)
- [x] Closed (GitHub): PR #{n} / issue #{n} — explanatory comment posted, state re-queried as `CLOSED` (`gh pr view {n} --json state` / `gh issue view {n} --json state`)
- [x] Resolved thread: PR #{n} — thread re-queried as `isResolved: true`
- [x] Opened parent gate: "{title}" — parent #{n} carries a brief comment headed `## Verification Brief` (the template's own first line) and `demo:pending` in its labels, both re-queried (`gh issue view {n} --json labels,comments`); comment present before label, per the invariant (`github-issues`)
- [x] Opened parent gate: "{title}" — parent record `specs/{id}-{slug}.md` re-read (`readRecord`) and found to carry a `## Verification Brief` section in its body and `acceptance: pending` in its frontmatter. No ordering invariant to check here: the action writes both in one composed `writeRecord`, so a partially-applied gate is not a reachable state on this driver (`local-files`)
- [ ] FAILED: "{title}" — {what went wrong}
```

If any verification fails, fix it before committing. Do not commit partial state.

**Under `worktree-always: true`:** `/claude-tweaks:tidy` is standalone-only and never creates or enters a worktree via its own steps (see Component-Skill Contract below). If the target project has `worktree-always: true` set (`.claude-tweaks/policy.yml`), every mutation in Step 7 (record file deletes/edits, `docs/REGISTRY.md` Fix-now edits) and this commit are `Edit`/`Write`/`git commit` calls the PreToolUse gate denies outside a linked worktree — there is no standalone-auto exemption for these (`_shared/auto-decision-log.md`'s Bash-append workaround covers only the `decisions.md` audit-log write, not Step 7's substantive edits or this commit). Before executing Step 7, resolve the lever via the canonical read path — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values worktree-always` — and if it resolves `true`, provision a scratch worktree and run Steps 7 and 7.5 inside it, following `_shared/scratch-worktree.md`'s §1-4 unchanged (creation, catch-up, applying the commit as its own commit). How the result lands from there branches on `integration-model` (`_shared/integration-model.md`, resolved the same way — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-model`):

- **`local-merge`** (including an unresolved/undetectable model — fail toward the behavior that predates this branch): continue with `_shared/scratch-worktree.md`'s §5-6 exactly as before — merge back into the main checkout's integration branch, then tear down via `ExitWorktree`, never a raw `git worktree remove` — the scratch worktree is by definition the one this session just worked inside, so the harness holds a live lock and the raw command exits 128 (`[IL-58]`; this is exactly why "mirroring Step 4.5's own worktree cleanup" was wrong here — Step 4.5 removes worktrees it is *not* standing in).
- **`pr-first`**: skip §5-6's merge-back. Push the branch (`git -C "{worktree-path}" push origin {branch}`, its own Bash call — never chained, same as every other push under `worktree-always`) and open — or reuse/reopen on a resumed run — a PR, reusing `_shared/pr-early-run-lifecycle.md`'s Step 1 shape (check `gh pr list --repo {owner}/{repo} --head {branch} --state all` for a reusable `OPEN` or `CLOSED` match before creating one) and Step 3 shape (compose the body, `gh pr create --base {integration-branch} --head {branch} ...`) — **never `--draft` here**, unlike that file's own run-start PR: a build run's draft stays undraftable until `_shared/pr-first-merge.md`'s Step 2 runs, because its content-judgment layer (review) is still ahead of it at creation time. A tidy housekeeping PR opens *after* Step 6's approval (or auto-mode routing) and Step 7.5's own verification checklist already passed — the judgment layer is behind it, not ahead — so it opens ready immediately. This is also why `tidy/actions-github-issues.md`'s Arm ready PR action explicitly never touches Step 2 (Mark the PR ready): there is nothing left to undraft by the time that action runs. Stamp `<!-- tidy-housekeeping-pr -->` in the body at creation — that marker, not the run-marker `pr-early-run-lifecycle.md` itself stamps, is what lets `github-pr-scan.md`'s `repo-wide` item 9 recognize this PR as tidy-originated (see the paragraph below), and item 9's own filter skips any PR still in draft, so a draft tidy PR would never be found at all. This is a single-shot procedure with no phase checklist to carry — reuse only Step 1's existing-PR check and Step 3's compose-and-create shape, never Step 4's `record-pr`/phase-checklist machinery, which is build-run-specific (`run-state.json`'s `pr` field, phase rows) and has nothing to attach to here. **If the push or both create attempts fail** (`pr-early-run-lifecycle.md`'s own degrade path — network, auth, `gh` absent), don't strand the commit in a worktree nobody will return to: fall through to the `local-merge` branch above and merge back locally instead, logging the PR-open failure to `decisions.md` the same way that file's Step 2/Step 3 failure logging does. **Arm before `ExitWorktree`**: resolve `housekeeping-auto-merge` + `tidy-aggressiveness` fresh (`resolve-policy.js`, JSON mode, capturing `source` — wins over Step 6's earlier read) and route: `false` → no action; `true`∧`moderate`+ → arm now; `true`∧`conservative` → stage an arm proposal to `{run-dir}/staged/`. Arm now runs only `_shared/pr-first-merge.md` Step 3's initial `gh pr merge --auto` call, not its degrade chain — failure leaves it unarmed, reported: never an immediate merge (checks pending), never ready-and-comment (already open). Log the outcome (`armed`/`staged`/`skipped`/`arm-unsupported`/`arm-failed`) to `decisions.md` (`_shared/auto-decision-log.md`, lever-attributed `[lever: housekeeping-auto-merge={true|false} ({source})]`) and write any staged proposal — absolute main-checkout run-dir path — before `ExitWorktree`. Armed: `PR #{n} opened and armed --auto (housekeeping-auto-merge: derived from autonomy: {value})` (`source: default`) else `(...: explicit)`. Unarmed: `PR #{n} opened, NOT armed — {reason}`, then:
`gh pr merge {n} --auto`
`housekeeping-auto-merge: true` in `.claude-tweaks/policy.yml`

On success, tear the scratch worktree down via `ExitWorktree` the same way as the `local-merge` branch — its own local branch no longer needs merging back into the main checkout, since the PR now carries the commit.

Skip this entirely when `worktree-always` isn't set, or when `--dry-run` was passed (Step 7 never mutates or commits in that case).

Commit with a message summarizing the tidy-up. For a scoped run (`--scope` was passed), prefix the message with the scope, e.g. `Tidy (scope: github): closed 2 stale issues, promoted #142` — see "Scope Selection" above. An unscoped full run's commit message is unchanged (no scope prefix).

**The `housekeeping-auto-merge` grant and the `<!-- tidy-housekeeping-pr -->` marker** (`_shared/policy-schema.md`, `_shared/github-pr-scan.md`'s `repo-wide` item 9): under `integration-model: pr-first` **and** `worktree-always: true`, this run's commit is pushed as a PR by the `worktree-always` handling above, which stamps the PR body with `<!-- tidy-housekeeping-pr -->` at creation — that marker, not a label, is what lets the sweep identify a tidy-originated PR without a local run-dir join. With `housekeeping-auto-merge` set project-wide, creation-time arming (above) is primary; a still-unarmed, green, marker-stamped PR may arm via the `moderate`+ sweep backstop (`tidy/actions-github-issues.md`'s `## Arm ready PR`); unset, nothing arms at either point. **Under `local-merge`, or when `worktree-always` is off (no worktree ever provisioned, so no PR-opening path runs at all), Step 7 never opens a PR** — under `local-merge`'s `worktree-always: true` case, the commit merges back directly (`_shared/scratch-worktree.md`); with no `worktree-always`, it commits straight to the current branch. The marker has nothing to stamp in either of those cases, by design — it's a `pr-first`-only concept (`_shared/integration-model.md`'s consumer table).

## Routine Configuration

`/tidy` ships one routine template, `skills/tidy/routine-template.yml` — a weekly full-backlog hygiene sweep (including GitHub issue/PR triage as Step 4.8) — instantiate it with:

```
/claude-tweaks:routine create tidy
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to `/claude-tweaks:routine create` to inspect the assembled routine configuration before anything is created — distinct from `/claude-tweaks:tidy --dry-run` (Step 6 above), which previews what a specific tidy firing would mutate, not how the routine itself is configured. Before trusting a newly-changed `tidy-aggressiveness` policy value to an unattended scheduled firing, invoke `/claude-tweaks:tidy --dry-run` manually first (optionally with the same `--scope` the routine uses, e.g. `--scope=github --dry-run`) and review the `DRY-RUN` log entries before letting the routine run for real.

**Unattended execution:** a scheduled firing runs Steps 1-7.5 exactly as an interactive invocation would, except Step 6's Standalone auto fallback takes over in place of the interactive batch-approval prompt — but only when the target project's own `.claude-tweaks/policy.yml` already sets `auto-mode: default-on` (project policy, not a routine-specific mechanism — see `_shared/auto-mode-contract.md`). A bare scheduled firing (`/claude-tweaks:tidy`, no arguments, no conversation history) has no other way to supply an `auto` mode signal; if the project hasn't configured `auto-mode: default-on`, the routine falls back to interactive and blocks on a batch-approval prompt that will never be answered. When auto-mode is enabled project-wide, safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply — and per the `moderate` aggressiveness default, so do the reversible git-tracked judgment cleanups (`local-files` deletes/absorbs/defers); outward-facing GitHub writes still stage, and everything requiring judgment is staged to that run's `decisions.md` rather than blocking on input. Nothing is invented here for routines specifically — this is the same Standalone auto path `/tidy` already uses whenever it runs outside a parent pipeline. If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1, 3, 4.5, 4.7, 4.8, and 5.5 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized. Steps 4, 4.6, 4.9, and 4.95 already run in the main thread and are unaffected.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Derive the lines from the report's **Approve ({N})** and **Yours ({N})** sections: when **Approve ({N})** is non-empty, put an "Approve ({N})" line first, bolded, suffixed `(recommended)` — not a slash command; it instructs executing Step 7 over the {N} staged items in the report's Approve ({N}) section, resolved directly in this session. Then take Yours **groups** (`step-6-auto.md`'s Yours grouping), in report order, one line each — the annotation names the group's command (≤5 words), the line itself carrying the group's batch command verbatim, or a paste-block group's first line verbatim, or its ref-less line (the report holds the rest; fully-qualified `/claude-tweaks:{skill}` form): up to three when the Approve line is absent, capped at two when it is present, keeping the handoff to at most four lines. The first Yours line is bolded and suffixed `(recommended)` only when the Approve line is absent. The final line is always the help dashboard. When both **Approve** and **Yours** are empty, render the fixed block below unchanged.

Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**Execute Step 7 over the {N} staged items in the report's Approve ({N}) section** (recommended) — not a slash command; resolve directly in this session — render only when Approve ({N}) is non-empty
`{Yours group's batch command, first paste line, or ref-less line}` — {group's command, ≤5 words} — bold this line and suffix `(recommended)` only when the Approve line above is absent, and only on the first Yours line
`/claude-tweaks:help` — full pipeline status with refreshed counts after the cleanup

Empty fallback — Approve and Yours both empty (the fixed block, unchanged from before this derivation rule existed):

**`/claude-tweaks:help`** — full pipeline status with refreshed counts after the cleanup (recommended)
`/claude-tweaks:build {N}` — build the highest-priority ready spec surfaced by the tidy report
`/claude-tweaks:specify {topic}` — specify an unspecified design doc surfaced by the audit
`/claude-tweaks:backlog refine` — authorize any ready-but-unscored or bot:blocked records the audit surfaced

## Component-Skill Contract

`/claude-tweaks:tidy` is a **standalone-only** maintenance skill — it is not invoked by any parent skill in the workflow. There is no `PIPELINE_RUN_DIR` signal expected as a caller-side argument (the run dir is only resolved internally for the auto-mode aggressiveness routing in Step 6). The `## Next Actions` block always renders. If a future parent skill ever wraps `/tidy` (e.g., a scheduled hygiene pass inside `/flow`), the parent must update this contract; until then, treat parent invocation as not applicable.

One exception to "never creates or enters a worktree": under `worktree-always: true`, Step 7.5 sets up a scratch worktree solely to satisfy the PreToolUse gate for Step 7's mutations and the tidy-up commit, then merges back and tears it down before this skill's own Next Actions render — see Step 7.5's `worktree-always` handling above. This is bookkeeping internal to Steps 7-7.5, not a parent-skill relationship, and doesn't change anything about this contract's `PIPELINE_RUN_DIR`/Next Actions guidance.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deleting specs without checking if they're implemented | Scan the codebase first — the spec may be partly or fully built |
| Promoting backlog records directly to specs without brainstorming | Brainstorming catches assumptions that jump to implementation |
| Keeping everything "just in case" | Stale items create noise and slow `/claude-tweaks:help` down |
| Presenting items one-at-a-time for individual decisions | Scales badly. Scan silently, then one batch report: approve all or override specific items. |
| Deleting backlog records marked as "Promote" | The record is the tracking artifact until `/claude-tweaks:specify` shapes it; deleting drops the item. |
| Appending an "Absorbed Scope" section to a record | Integrate it into the existing Deliverables, Acceptance Criteria, and Technical Approach — appendices are second-class content `/superpowers:writing-plans` may miss. |
| Committing without running verification | Verify every action landed (Step 7.5) first — partial execution orphans or loses items. |
| Clearing a local record before `gh issue create` confirms success | Sync writes GitHub-first; clearing early turns a failed write into a lost item, not an unsynced one. |
| Treating Defer (`github-issues` backend) as a single atomic step | A multi-step GitHub-side sequence (body edit → label add → possible milestone attach), no local file — a late failure leaves the record partially updated. Report which step failed. |
| Auto-running downstream skills like `/review`, `/build`, or `/specify` | /tidy only stages recommendations; the user judges timing and scope. |
| Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing only means "not contained in HEAD/upstream" — check every configured base before concluding merged-elsewhere vs. genuinely unmerged. Manual `-D` stays forbidden without `git cherry` patch-equivalence evidence; reconcile's `archive-branches` check (`pr-first`-only, `bin/lib/reconcile/archive-branches.js`) is the sole exception, via cherry-proof or an archive-tag-then-delete path. |
| Closing a PR/issue without a comment | Silent closes destroy the audit trail — the comment is the record of why. |
| Resolving review threads without commit evidence | The concern disappears unfixed, worse than leaving it open. Evidence is a commit touching the flagged lines. |
| Treating an unscored `ready` record as automatically triage-eligible | Labels are projection, not truth — a `ready` label doesn't mean scoring happened. Shape 4 catches it before `/claude-tweaks:backlog refine` flags it back. |
