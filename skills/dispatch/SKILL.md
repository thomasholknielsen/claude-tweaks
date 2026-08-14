---
name: dispatch
description: Use when you want to claim and build already-authorized GitHub work records — the queue consumer between the human gate and the executor. Bare picklist, next for the headless routine unit, or #N direct; claims the whole file-overlap group, hands off to /flow, and settles the result. Keywords - dispatch, queue, claim, auto:build, auto:merge, bot:in-progress, bot:blocked, autonomous build, routine.
argument-hint: "[next|#N[,#M...]] [--claim-only] [--batch-size <n>] [--priority high|medium|low]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

# Dispatch — the Queue Consumer

The thin protocol wrapper between the authorization gate and the executor: select → claim group → invoke /flow → settle. Sits outside the main brainstorm-to-build chain, downstream of the gate:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
                  /claude-tweaks:backlog refine   (grants auto:build / auto:merge)
                              │
                              v
              [ /claude-tweaks:dispatch ]   <- utility (no fixed lifecycle position)
                              │
                              v
          /claude-tweaks:flow #{n}[,#{m}...]   (claims whole group, executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- Something is already authorized (`auto:build`, optionally `+ auto:merge`) and you want to build it now — run bare `/dispatch` to pick from the queue, or `/dispatch #N` for a specific record.
- A scheduled Routine needs a single, deterministic unit of headless work to fire on a cadence — that's `/dispatch next`.
- A prior dispatched build failed and you want the retry/ceiling bookkeeping to run — this happens automatically inside the Settle step (Step 6), not as a separate invocation.

Not for: granting authorization (`/claude-tweaks:backlog refine`'s job), deriving a spec, or building anything yourself. Dispatch only ever claims, hands off to `/claude-tweaks:flow`, and settles the result.

**Why no `drain` mode.** No mode shepherds every authorized group to completion in one session — context rot; throughput comes from routine cadence × single-group firings. The old multi-group Review Console dies with it (see Reporting below). Read `design-notes.md` in this skill's directory.

## Input

`$ARGUMENTS`:

| Argument | Behavior |
|---|---|
| *(none)* | Bare — interactive batch pick over the authorized queue, grouped by file overlap; up to `dispatch-batch-size` groups per firing |
| `next` | Headless-safe — claim + dispatch exactly one group, chosen by priority-then-age ordering; the unit a scheduled Routine fires |
| `#N` | Direct — claim + dispatch record `#N`'s whole file-overlap group |
| `#N,#M,...` | Explicit list — claim + dispatch each named record's whole file-overlap group, deduplicated; skips interactive selection since the set is already named |
| `--claim-only` (modifier) | Suffix any of the four forms above — run through Step 4's claim and stop before Step 5's Task-agent dispatch. Diagnostic/testing use: exercises the real claim mechanism (atomic blob write, `bot:in-progress`, claim comment) without spending build time. The claim is left held afterward — release manually (Step 4's stop-point output prints the exact commands) or let it expire via the standard 72h TTL. |
| `--batch-size <n>` (modifier) | Suffix bare or `#N,#M,...` — per-firing override of `dispatch-batch-size` (Configuration below) for this invocation only; does not edit `.claude-tweaks/policy.yml`. Highest-precedence per `_shared/auto-mode-card.md`'s CLI-arg-first ordering. No effect on `next`/`#N`, which always dispatch exactly one group regardless of the cap. See Step 3 (bare-mode question wording) and Step 5 (sequential dispatch order). |
| `--concurrent <n>` (deprecated alias) | Deprecated alias for `--batch-size <n>` — same effect, logs one warn-tier notice per invocation. Removal condition: read `deprecated-aliases.md` in this skill's directory. |
| `--priority <high\|medium\|low>` (modifier) | Suffix `next` only — restrict this firing's candidate pool to groups whose representative member (Step 3's `next`-ranking definition) carries that priority band before ranking/selection runs. Lets multiple differently-scheduled Routines each own a distinct slice of the queue (e.g. a fast-cadence `--priority high` routine alongside a slower one covering everything else). No effect on bare or `#N`/`#N,#M,...`, which select by human pick or explicit name, not the `next` ranking. |

## Preflight

> The local-files stop paragraph below follows the canonical pattern in `_shared/local-files-preflight-stop.md` — do not weaken its enumeration, no-exception clause, or auto-mode disclaimer when editing.

Read the project's `work-backend` config key (per `_shared/work-record-config.md`, the key table's canonical home). **`work-backend: local-files`** — report that headless dispatch is github-issues only (GitHub's RBAC + atomic content writes are the mechanism this protocol depends on, not a policy choice) and **stop this turn completely**: do not invoke `/claude-tweaks:flow`, `/claude-tweaks:build`, or any other skill; do not claim, write, edit, or create any file; do not run any build, test, or git-committing command. Tell the user they can run `/claude-tweaks:flow` or `/claude-tweaks:build` manually against a chosen record if they want that work done — this is information for the user to act on, never an instruction for you to act on yourself. This holds with no exception when no interactive human is present to receive it, including the `next` form's headless/Routine firing (see Input table above): the absence of a human to hand this off to is not license to do the work in their place — it means the claim mechanism this protocol depends on is unavailable, so the correct behavior is to stop, not proceed. **This stop is also not superseded by this project's own documented auto-mode or hands-off-pipeline conventions elsewhere in CLAUDE.md** (e.g. `/claude-tweaks:flow` defaulting to `auto`, "skills MUST NOT invent new mid-flow stops"): those conventions govern behavior within a pipeline run that has already been authorized to proceed — they say nothing about whether this Preflight may authorize new work in the first place, which under `local-files` it explicitly cannot. A record that looks low-risk, well-scoped, or "ready" is not an exception. Only `work-backend: github-issues` proceeds past this point.

**Headless self-report (`next` form only).** The `next` form fires unattended — the unit a scheduled Routine fires with nobody present to read a stop message (see the Input table above). Before stopping on any Preflight failure (the `work-backend` checks above, or the Detection Ladder below), a `next`-form firing files a durable GitHub trace instead: read `headless-self-report.md` in this skill's directory and follow it, then stop. It never softens the stop — it only leaves a record of it, deduplicated against any existing open report so repeated firings don't re-file.

Skip this entirely for the bare / `#N` / `#N,#M,...` forms — those always run with a human present (per the Input table above), so they just report the failing check and stop; self-filing is `next`-only.

Before any `gh`/MCP command, run the Detection Ladder from `_shared/forge-detection.md` (checks 1-3:
GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Check 1 (GitHub
remote exists) and check 3 (authenticated + reachable, evaluated against whichever transport
check 2 selects) stay hard gates — there is no meaningful degraded mode for a skill whose entire
purpose is writing GitHub state. Check 2 (`gh` CLI installed) no longer gates on its own: `gh`
present → proceed exactly as always; `gh` absent → proceed via the GitHub MCP path documented in
`mcp-transport.md` in this skill's directory (and, for Settle and the Auto-merge gate, in
`settle-and-merge.md`) — verified end-to-end against a live cloud Routine run, see
`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`. Report the specific failing check and
stop for any real failure (headless self-report above still applies for the `next` form).

**MCP transport details.** When `gh` is absent, read `mcp-transport.md` in this skill's directory
before any GitHub call: it carries check 3's own MCP equivalent (a bounded `list_issues` probe, since
check 3 stays a hard gate on either transport) and the MCP form of every `gh` call site in this
file. It also records why check 2 no longer gates on its own, including the reverted first attempt
at this bridge that shipped the gate change before the read path was finished.

## Workflow

### Step 1: Resolve this firing's run id

Resolve this firing's `$RUN_ID` once, before Step 2, via the standalone-auto run-dir resolution in `_shared/pipeline-run-dir.md` (dispatch is on the allowlist) — `$RUN_ID` is that run directory's basename (e.g. `2026-07-14T140322-dispatch-standalone`). Every claim this firing makes in Step 4 embeds this same value as `claimPayload`'s `runId`, and every Task call Step 5 dispatches for a group — both of them — receives it explicitly as `CLAIM_RUN_ID` (Task agents don't inherit shell variables — per `_shared/subagent-output-contract.md`'s Input Discipline, a dispatched agent is a clean room), so Step 6's ownership check (`claim.runId === $RUN_ID`) — performed inside whichever of that group's two Task calls handles its terminal outcome (the first call on a `build,test` failure, the second on every path that reaches wrap-up), never in this thread — compares against the firing that actually claimed the record.

### Step 2: Pull the authorized queue and group by file overlap

First action, before the pool is read: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile` — converges the main checkout toward origin (`bin/lib/reconcile`, #407) so the queue pull below reads already-current state instead of racing a stale mirror. Dispatch runs from a worktree under `worktree.always`; the verb still converges the *main checkout's* mirror regardless (`mainCheckoutRoot` resolution), the same as `session-start.js`'s own in-process call. Log the JSON result to this firing's `decisions.md`. When the result's `console.ready` array is non-empty, follow `_shared/console-execution.md` for each entry before continuing to the queue pull — an answered console is real, actionable work this firing is well-positioned to pick up.

Common to all four selection forms — group membership must be computed over the full current pool *before* anything is claimed (per `_shared/issue-claims.md`'s group-claim rule: group membership is computed over **unclaimed** records only, so two racing firings converge on the same winner instead of splitting a group between them).

The queue: **open + `auto:build` + no `bot:*` + no open `Blocked by #N` dependency + unclaimed**. Dispatch never adds `auto:build`, `auto:merge`, or `ready` — see Anti-Patterns.

Read `queue-pull-script.md` in this skill's directory and run its script verbatim — it produces `/tmp/dispatch-groups.json`, which every selection form below reads. That file also carries the MCP-path substitution and the queue-pull-notes pointer.

The `bot:*` filter here is the cheap label-based pre-filter — labels are projection, not truth (`_shared/work-record.md`). The authoritative unclaimed check is Step 4's atomic 201/422 claim attempt; a record can pass this pre-filter and still turn out contested by the time it's actually claimed. A group of size 1 is a **singleton**; size 2+ is a **bundle** — both dispatch the same way in Step 5, with a different `/flow` invocation shape only.

### Step 3: Select

**Zero eligible groups (all forms).** Step 2's `groups` array can legitimately be empty — the common steady state right after a dispatch drain, or after an `auto:build` queue with nothing new authorized since the last firing. This is not an error: report "nothing eligible this firing" and stop before Step 4 — do not render a zero-option `AskUserQuestion` (bare mode) or proceed with a `null` pick (`next`, whose ranking script below writes `null` to `/tmp/dispatch-next-pick.json` exactly for this case). A headless (`next`) firing with no eligible groups is a cheap no-op, per `routine-template.yml`'s own notes — report nothing and exit cleanly, no self-report, no `PushNotification`.

**Bare** `/dispatch` — render a batch table, one row per group from Step 2 (skip this and the rest of Step 3 entirely if the zero-groups case above applies):

```markdown
### Dispatch — {N} groups in the authorized queue

| # | Group | Records | Priority | Auto-merge? |
|---|---|---|---|---|
| 1 | bundle (2) | #123, #124 | high | no |
| 2 | singleton | #130 | — | yes |
```

Resolve `{batch-size}` first — `--batch-size <n>` if present on this invocation (or its deprecated `--concurrent <n>` alias, which also emits the one-time warn-tier notice), else `dispatch-batch-size` from Configuration below — or, when only its deprecated `dispatch-pick-max-concurrent` policy key is set, that key's value, which likewise emits the one-time warn-tier notice. CLI arg beats project policy, per `_shared/auto-mode-card.md`'s precedence order. Then one `AskUserQuestion`:

- `question`: `"Which groups should this firing dispatch? (up to {batch-size}, processed one after another)"`, `header`: `"Dispatch pick"`, `multiSelect`: `true`
- One option per group — `label`: the group's record numbers (e.g. `"#123, #124"`), `description`: titles + priority + whether it carries `auto:merge`. Pre-mark the top `{batch-size}` groups, ranked by the `next` ordering below, as `(Recommended)`.

Selecting more groups than `{batch-size}` is not an error — the extra selections stay claimed for a later firing to process (Step 5 no longer runs them this firing at all, since there are no concurrent slots to free), same posture overlapping `next` firings already have across routine windows.

**`next`** — no human decision. Pick exactly ONE group by this literal ordering: `priority:high` > `priority:medium` > `priority:low` > unprioritized, oldest-first within each band. **A group's rank = its highest-priority member** — find each group's highest-priority (then oldest) member as its representative, then sort groups by that representative's priority band and `createdAt`. When `--priority <band>` (Input table above) is present, filter to only groups whose representative's band matches before ranking — this lets multiple differently-scheduled Routines each own a distinct slice of the queue instead of competing for the same top-of-queue pick:

```bash
node -e "
  const RANK = { high: 0, medium: 1, low: 2 };
  const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
  const groups = require('/tmp/dispatch-groups.json');
  const representative = (g) => g.slice().sort((a, b) =>
    bandOf(a) - bandOf(b) || new Date(a.createdAt) - new Date(b.createdAt))[0];
  const priorityFilter = process.argv[1] || null; // '--priority' value, or unset
  let candidates = groups.map((g) => ({ group: g, rep: representative(g) }));
  if (priorityFilter) candidates = candidates.filter((c) => c.rep.facets.priority === priorityFilter);
  const ranked = candidates
    .sort((x, y) => bandOf(x.rep) - bandOf(y.rep) || new Date(x.rep.createdAt) - new Date(y.rep.createdAt));
  console.log(JSON.stringify(ranked.length ? ranked[0].group : null));
" "$PRIORITY_FILTER" > /tmp/dispatch-next-pick.json
```

A `null` result here (no eligible groups, or none matching `--priority`) is the zero-eligible-groups case documented at the top of this step — report nothing eligible and stop, do not proceed to Step 4.

`next` is the headless-safe unit — the only selection form a scheduled Routine ever fires (see Routine Configuration below), since it needs no `AskUserQuestion` answer to resolve.

**`#N`** — direct. Fetch issue `#N`, confirm it currently carries `auto:build` and no `bot:*` label (re-verify against Step 2's live queue, not a cached table); if it doesn't qualify, report why (no grant, already claimed, or blocked) and stop. Otherwise pull its **whole file-overlap group** from Step 2's output — claiming a single member of a group alone is forbidden; every one of that record's overlap partners comes along, whether or not the user named them.

**`#N[,#M,#O...]`** — explicit list. Parse the argument via `parseExplicitIssueList` (`bin/lib/issues/grouping.js`) into an array of issue numbers. Call `selectGroupsForExplicitList(requestedNumbers, groups)` (same file) against Step 2's already-computed `groups` array. Report every entry in the returned `notFound` list with why it's excluded — no `auto:build` grant, already claimed, or `bot:blocked` (re-check against Step 2's live queue, the same re-verification the singular `#N` form already does) — but do not abort the rest of the named set over one excluded entry. Every group in the returned `selectedGroups` proceeds to Step 4 exactly as a bare-mode pick would, still bound by `dispatch-batch-size` (extra groups stay claimed for a later firing, same as bare mode's "more selections than the cap" case). Skip Step 3's `AskUserQuestion` entirely — the selection is already explicit; there is nothing to pick.

### Step 4: Claim the selected group (whole group, or none)

**Sibling-session check, before any write** — run `check-sibling-sessions --record` per group
member and branch on its output; read `sibling-session-check.md` in this skill's directory and
follow it. Additive to the existing branches/claims/labels check below, never a replacement.

Per `_shared/issue-claims.md`'s group-claim rule: claim **all members of the group before
starting any**. Resolve the detection check once per run, not per issue (per
`_shared/github-write-transport.md`).

**Both transports write the same `claims/issue-<n>.json` blob on `claims-registry`** — see
`_shared/issue-claims.md`'s "The lock" section for the full read-then-classify-then-write
procedure (`classifyClaimBlob`'s five states, and which write form — create-only vs
conditional-update — each one calls for). For each member of the selected group:

**gh CLI path** (`gh` on PATH):

```bash
for ISSUE in "${GROUP_MEMBERS[@]}"; do
  # 1. Read: gh api "repos/{owner}/{repo}/contents/claims/issue-${ISSUE}.json?ref=claims-registry"
  #    (404 = absent). 2. Classify with classifyClaimBlob. 3. Write per "The lock":
  #    absent -> create-only PUT (no sha); tombstone/stale -> conditional PUT (sha from the
  #    read); live/unreadable -> contested, no write. See _shared/issue-claims.md for the
  #    literal gh api commands at each step.
  : # ... branch on the result below, per member
done
```

**MCP path** (`gh` unavailable): read `mcp-transport.md` in this skill's directory — it carries
the per-member claim-payload generation and the same read-then-classify-then-write procedure
over the MCP tools. Branch on its outcome below, per member, exactly as the `gh` path branches.

**On success (claimed, either path):** bootstrap-then-add `bot:in-progress` (still a plain
label edit — `gh issue edit` or `issue_write` per the CRUD mapping in
`_shared/github-write-transport.md`), then post the claim comment (`claimPayload`'s
`commentBody`, unchanged regardless of which path claimed it — human-visibility mirror only,
per `_shared/issue-claims.md`'s "The mirror"):

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['bot:in-progress', 'Bot state: an agent currently holds the claim on this record']]
node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
  console.log(c.claimPayload({issueNumber:Number(process.argv[1]),
  runId:process.argv[2],sessionId:process.env.CLAUDE_CODE_SESSION_ID||'',
  host:require('os').hostname(),now:Date.now()}).commentBody)" "$ISSUE" "$RUN_ID" > /tmp/claim-${ISSUE}.md
gh issue edit "$ISSUE" --add-label bot:in-progress
gh issue comment "$ISSUE" --body-file /tmp/claim-${ISSUE}.md
# This gh-CLI block runs only when gh is present; the gh-absent claim path lives in
# mcp-transport.md in this skill's directory.
```

**Anything other than a clean claim on every member** — a rejected write, an unresolvable `gh`/MCP failure during claim, or a group only partly claimable — and the `--claim-only` modifier's stop point: read `claim-outcomes.md` in this skill's directory and follow it. It carries the `classifyClaimBlob` classification and the `_shared/issue-claims.md` failure-posture branch (skip / break-and-take-over / treat-as-live), the partial-claim release-and-move-on rule, and `--claim-only`'s report plus manual-release commands. A group claimed cleanly on every member, with no `--claim-only`, proceeds straight to Step 5.

### Concurrency note (Preflight reads, not claim correctness)

Two firings running close together each do their own unsynchronized Preflight read, so one can see different `work-backend` content than another purely from wall-clock timing. Accepted, not engineered around: it's self-correcting, and Step 4's atomic claim write — not the Preflight read — is the actual correctness boundary, so no concurrent Preflight check can cause a double-build. Read `design-notes.md` in this skill's directory.

### Step 5: Dispatch — one group at a time, sequentially

> **Sequential execution, not parallel.** A Task-tool subagent is always launched cwd-pinned to the dispatching session's own worktree, so two groups can never safely run concurrently (see #155) — the dispatching session itself switches worktrees between groups, one at a time. Read `sequential-execution.md` in this skill's directory for the full mechanism and the module a regression here should be checked against.

Work through the selected group(s) in the order Step 3's selection already established — bare / `#N,#M,...`: up to `{batch-size}` (Step 3's resolved `--batch-size` override, or `dispatch-batch-size` when absent) groups processed one after another this firing, remainder left claimed for a later firing to pick up; `next` / `#N`: exactly one, unaffected by batch size. For each group in turn, **this dispatching session** creates and enters that group's worktree (via `/superpowers:using-git-worktrees`, exactly as a normal `/flow` invocation would) *before* dispatching that group's first Task call — every Task call dispatched for this group inherits that one cwd and must never create a worktree of its own. This session enters the next group's worktree only once this group's own dispatch sequence has reached its terminal point *and* that worktree has been torn down — always through wrap-up's own cleanup, never a raw removal (`[IL-116]`), which on a first-call failure means one further explicit `/claude-tweaks:flow {target} wrap-up` call. A third terminal point exists under `integration-model: local-merge` only — `OUTCOME: ready-to-merge` — Step 6's job, via `settle-and-merge.md`'s Dispatching-session merge execution (local-merge fallback) section. Under `pr-first` (`_shared/integration-model.md`), the second Task call merges itself (`_shared/pr-first-merge.md`) and there is nothing further for this session to do on that path. Never share a worktree path across groups. There is no per-group timeout, same posture as existing parallel-Task dispatch sites (e.g. `/help`'s Stage 1-7). See `sequential-execution.md` for the wall-clock trade-off this implies.

Pass `CLAIM_RUN_ID="{RUN_ID}"` (this firing's run id — the same value already embedded in each member's claim marker by Step 4) inline on the `/claude-tweaks:flow` command line, as the templates already show: a dispatched Task agent inherits no shell environment from this session (see the clean-room note in the `$RUN_ID` paragraph above), so an export here would never reach it. `/flow` threads it through to `/wrap-up`'s release step (`cleanup-procedures.md` Section E) so the success-path ownership check compares against the run that actually made the claim, not `/flow`'s own (different) `PIPELINE_RUN_DIR` — see `_shared/issue-claims.md`'s Identity section.

**Two Task() calls per group, not one.** The agent's job is now split: a first call runs `/claude-tweaks:flow {target} build,test` and stops; only on a clean `build-test-ok` outcome does a second, entirely fresh Task() call run `/claude-tweaks:flow {target} review,polish,wrap-up`. This gives the reviewing agent genuine conversational isolation from the build — a live dispatch test found build/test/review running in one continuous context, defeating `/review`'s own adversarial multi-lens contract.

**Singleton group** `[123]` — first call: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 build,test`. Second call (gated): `PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 review,polish,wrap-up`.

**Bundle group** `[123, 456]` — a granted record is already spec-shaped (`ready` + spec-shaped body per `_shared/work-record.md`); there is no per-member `/specify` pre-step to run first. First call: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456" build,test`. Second call (gated): `PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456" review,polish,wrap-up`.

**The gate between calls — read `two-call-gate.md` in this skill's directory and follow it.** Not optional bookkeeping: `/flow` creates and owns a *fresh* run directory whenever it is not handed an existing one, so without that file's handoff the second call silently starts a disconnected run and orphans everything build/test staged. In outline — capture the first call's reported `MANIFEST:` path, derive `{run-dir}` from it, and substitute it into the second call's command line as the `PIPELINE_RUN_DIR="{run-dir}"` prefix beside `CLAIM_RUN_ID` (inline in the command string, never an env export in this session — a resolution target, not an echoed finding, so the no-echo rule holds); gate on status `DONE`/`DONE_WITH_CONCERNS` **and** `OUTCOME: build-test-ok`. Anything else, or an underivable `{run-dir}`, means the second call is never dispatched: fail loud rather than proceed, leave Settle to the first call's own agent (it runs there, not in this thread — `settle-and-merge.md`), and tear down via that file's section 5.

Each group's two `Task()` prompts are defined in `task-prompt.md` in this skill's directory — read it and inline each call's content verbatim into its own `Task()` tool call (per `_shared/subagent-output-contract.md`'s input discipline: minimal input, literal output template inlined, no conversation history). Do not paraphrase or summarize either template; the exact wording is load-bearing for the four-value status line and output format contracts downstream skills parse.

### Step 6: Settle — on pipeline failure, and the Auto-merge gate

Two conditional branches that don't run on the common clean pending-review path — a `/flow` HARD-GATE failure (Settle), or an `auto:merge`-granted group reaching `/wrap-up`'s Review Console (Auto-merge gate). Read `settle-and-merge.md` in this skill's directory for the full procedure: Settle's ownership check, `assess-agent-autonomy` failure classification, retry-ceiling counting and `bot:blocked` escalation; the Auto-merge gate's two-layer check and acceptance labeling (both run inside the second Task call). Under `integration-model: pr-first` (`_shared/integration-model.md`), the second Task call also performs the merge itself, right there via `_shared/pr-first-merge.md` — `gh pr merge` needs no checkout, so there is no structural reason to split it out. Under `local-merge`, that split still applies: a Task-tool subagent cannot reach the main checkout (Step 5's sequential-execution note: cwd-pinned to its own worktree), so on `OUTCOME: ready-to-merge` this dispatching session runs the Dispatching-session merge execution (local-merge fallback) section itself, right here in Step 6, before entering the next group's worktree.

## Reporting

Per-firing output is one group's outcome (bare mode with M ≤ `dispatch-batch-size` groups: one report block per dispatched group) — there is **no consolidated multi-group console**. The old design's console existed to support `drain`; it dies with it (see When to Use above).

A headless (Routine-fired) firing's report has nobody live to read it — the durable trace is the label state change, the claim-comment trail, and `decisions.md`, not a rendered console. Over time, a human sees the aggregate picture via `/claude-tweaks:tidy`'s own periodic sweep (`tidy/SKILL.md`) — it scans GitHub state independently on its own cadence and surfaces `bot:blocked` records and stale claims without dispatch having to push anything to it directly.

`pending-review` outcomes park the group's `/flow`-created run dir, not the branch — at `supervised`/`trusted`, an unanswered Review Console `AskUserQuestion` during a headless firing is not an error, it is the expected resting state until a human resumes that session or the branch directly, or the claim's TTL expires and a later firing supersedes it. (At `unattended`, `consoleAutoResolve` completes the console instead of resting on it — see `_shared/autonomy-ceiling.md` and `wrap-up/review-console.md`'s Auto-resolution short-circuit.) The branch itself no longer waits with it: before either console renders, `_shared/pending-review-durability.md` pushes it to origin and opens one draft PR carrying its Verification Brief, so the work outlives the container that built it.

**Resuming a parked run.** "Resumes that session" above is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads this report, and there is no way to re-attach to it. The actual resume mechanism is re-adopting the same run directory: `PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "{target}" wrap-up`, run from inside the group's still-assigned worktree (`{run-dir}`'s own worktree — `pending-review-durability.md` never clears the run's worktree assignment on this path, so it is still there). This re-enters the same Review Console live, and its own teardown is what invokes `/superpowers:finishing-a-development-branch` and `wrap-up/cleanup-procedures.md` Section E (claim release, `auto:build`/`bot:in-progress` label removal) as one step — never hand-chain `/claude-tweaks:demo` (acceptance only, never merges — see its own Anti-Patterns table) with `/superpowers:finishing-a-development-branch` and then reconstruct Section E's claim/label bookkeeping by hand; that skips the console and its automated cleanup entirely, doing by hand what resuming the console already does as a unit. `{run-dir}`, `{RUN_ID}`, and `{target}` are the same values named in this run's own `pending-review-durability.md` file at the run directory's root and in the draft PR's `### Branch` section.

`PushNotification` fires only at the retry ceiling and for auto-merge FYIs (Step 6's Settle procedure and Auto-merge gate, both in `settle-and-merge.md`) — never per-firing just because a firing happened, to avoid notification fatigue.

## Configuration

These rows mirror `_shared/work-record-config.md`'s canonical key table (which every filing/shaping/dispatching skill is meant to cite rather than restate) — kept spelled out here too since this is the skill that actually reads and branches on them; check that file when a default or meaning changes to keep this copy in sync. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" <key> [<key>…]` (`_shared/policy-schema.md`):

| Flag | Default | Meaning |
|---|---|---|
| `dispatch-retry-ceiling` | `3` | Consecutive failures before a dispatched record gets `bot:blocked` and stops auto-retrying. |
| `automerge-max-lines` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to the `merge-check` verdict, not a hard cutoff. |
| `automerge-max-files` | `2` | Auto-merge blast-radius guideline on changed files — same weighted-not-cutoff treatment. |
| `dispatch-batch-size` | `3` | Maximum groups (bundles or singleton records) one firing processes sequentially, in the order Step 3's selection establishes; remaining groups stay claimed for a later firing. |
| `dispatch-pick-max-concurrent` (deprecated alias) | — | Deprecated alias for `dispatch-batch-size` — the resolver applies its value and tags the envelope `"renamed-from"`; when present, surface one warn-tier notice per invocation (the resolver never writes stderr). Removal condition: read `deprecated-aliases.md` in this skill's directory. |

**Per-firing CLI overrides:** `--batch-size <n>` (or its deprecated `--concurrent <n>` alias, Input table above) overrides `dispatch-batch-size` for this invocation only, and `--priority <band>` filters the `next` form's candidate pool before ranking — neither writes back to `.claude-tweaks/policy.yml`. CLI arg beats project policy, per `_shared/auto-mode-card.md`'s precedence order (CLI arg > pipeline config > project policy > skill default).

## Routine Configuration

`/dispatch` ships a routine template (`skills/dispatch/routine-template.yml`) whose prompt is `/claude-tweaks:dispatch next` — the headless-safe selection form from Step 3. Instantiate it for the current project with:

```
/claude-tweaks:routine create dispatch
```

**Migration note.** A cloud Routine created from `/claude-tweaks:triage`'s old template still fires `triage dispatch` — that skill no longer exists; grants now live at `/claude-tweaks:backlog refine` (see Relationship below). This cannot be detected or fixed from inside a `/dispatch` run — a live routine referencing a retired prompt isn't visible here. If you have a routine scheduled before this skill existed, re-create it now via the command above; the old one keeps firing a prompt that no longer does anything until you replace or delete it.

## Next Actions

Render only when a human is present to answer — the bare form is definitionally interactive (its own Step 3 pick already required one answer); `next` / `#N` / `#N,#M,...` render this block when a human typed the command directly or a prior skill (e.g. `/claude-tweaks:backlog refine`'s Next Actions) invoked it on a human's behalf, never when this firing came from a scheduled Routine (nobody is present to answer, and an unanswered question at the very end of a headless run is just noise):

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch again (Recommended)"`, `description`: `"/claude-tweaks:dispatch — pick from what's left in the authorized queue"`
- Option 2 — `label`: `"Set up the dispatch routine"`, `description`: `"/claude-tweaks:routine create dispatch — schedule 'dispatch next' as a recurring headless routine"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — see the authorized-queue size and bot:blocked records"`

## Component-Skill Contract

`/claude-tweaks:dispatch` is never invoked as a pipeline component by another skill — a human runs one of its four forms directly, or a scheduled Routine fires `/claude-tweaks:dispatch next` headlessly (see Routine Configuration above). See Next Actions above for the render/suppress rule.

`$PIPELINE_RUN_DIR` is not this skill's own state. Dispatch resolves its own standalone-auto run dir (per `_shared/pipeline-run-dir.md`'s allowlist) purely to write its own `decisions.md` — the claim/release/downgrade audit trail for this firing. It is never the same directory as a dispatched group's `/flow` run dir, which is why Step 5 threads `CLAIM_RUN_ID` explicitly; read `design-notes.md` in this skill's directory.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Adding `auto:build`, `auto:merge`, or `ready` from inside dispatch | Machinery may only remove or downgrade grants, never add them — the permission matrix's hard line (`_shared/work-record.md`) |
| Claiming a single member of a file-overlap group without its partners | The branch and its overlap partners would race — `_shared/issue-claims.md`'s group-claim rule requires the whole group before starting any |
| Letting a group auto-merge on a retry after a prior `correctness`-classified failure | A `correctness` or `ambiguous` classification unconditionally revokes `auto:merge` before the next retry; only `transient` preserves it |
| Treating a clean review as sufficient for auto-merge on its own | `merge-check` weighs diff content, review findings, and blast radius as one judgment — a large or structurally sensitive diff can verdict `needs-human` with zero findings, never `auto-merge` |
| Retrying a failed record indefinitely with no ceiling | Burns routine cycles on something stuck and never surfaces it — the retry ceiling forces a checkpoint |
| Building a session that shepherds every authorized group to completion in one run | Context rot — throughput comes from routine cadence × single-group firings, not session breadth |
| Filing, closing, or granting authorization on records from inside dispatch | Dispatch only *consumes* grants — filing belongs to the health skills/`/claude-tweaks:capture`, granting to `/claude-tweaks:backlog refine` |
| Deriving a spec per bundle member before invoking `/flow` | A granted record is already spec-shaped (`ready` + spec-shaped body), so `/flow #A,#B` materializes directly — don't reintroduce the deleted per-member `/specify` pre-step |
