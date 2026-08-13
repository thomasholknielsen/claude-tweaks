# Dispatch Step 5 — The Gate Between a Group's Two Task Calls

Referenced by `skills/dispatch/SKILL.md` Step 5. Each group is dispatched as two sequential `Task()` calls (the literal prompts live in `task-prompt.md` in this directory); this file owns what the **dispatching session** does *between* them — the run-directory handoff, the pass/fail gate, and where each terminal path ends.

## 1. Capture the first call's `MANIFEST:` path

The first call's report carries a `MANIFEST:` line — the path to that group's run-dir `manifest.yml`/`decisions.md`, or for a singleton the single-spec run dir path. Capture it verbatim from the report before doing anything else: it is the only handle the dispatching session gets on the run directory `/flow` created inside that call.

Derive the run directory from it — strip a trailing `/manifest.yml` or `/decisions.md` filename if present; the run dir is the containing directory. Call the result `{run-dir}`.

## 2. The gate

Dispatch the second call only if the first call's status line was `DONE` or `DONE_WITH_CONCERNS` **and** its `OUTCOME` was `build-test-ok`. Anything else — a `NEEDS_CONTEXT`/`BLOCKED` status, an `OUTCOME` of `build-test-failed`/`build-test-blocked`, or no parseable report at all — means the second call is never dispatched for that group this firing; go to section 5.

## 3. Hand the run directory to the second call

`/flow` **creates and owns a fresh run directory whenever it is not handed an existing one** (`flow/SKILL.md` Step 3 and its Component-Skill Contract; `_shared/auto-mode-contract.md`: "Each `/flow` invocation gets a unique, per-run directory"). Its one existing-directory branch is the adopt-if-set case this handoff exists to trigger — `PIPELINE_RUN_DIR` already set at invocation and naming a directory that exists (`flow/steps-and-gates.md`'s **Adopting an inherited run directory**) — and it never falls back to `_shared/pipeline-run-dir.md`'s step-2 spec-slug match, which is what *downstream component skills* consult when the env var is unset, not what `/flow` itself does.

Left alone, the second call would therefore start a **new, disconnected run**: the first call's `decisions.md` entries and `staged/` proposals would be orphaned, `/wrap-up`'s Review Console would consolidate none of build/test's auto-decisions (breaking the auto-mode contract's central promise), and the first run would never be `close-run`'d.

So the dispatching session hands the run over explicitly — `{run-dir}` is substituted into the second call's command line, inline beside the existing `CLAIM_RUN_ID`, in the literal prompt `task-prompt.md` inlines verbatim:

```
PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow {target} review,polish,wrap-up
```

**Inline in the command, not an env export in this session.** A dispatched Task agent is a clean room and inherits none of the dispatching session's environment (`_shared/subagent-output-contract.md`'s Input Discipline) — which is exactly why `CLAIM_RUN_ID` is already passed this way. Substituting `{run-dir}` is the same operation as substituting `{RUN_ID}` or the issue list.

`_shared/pipeline-run-dir.md`'s resolution order **step 1** — the `PIPELINE_RUN_DIR` env var, "use this when present (preferred path)" — is exactly the mechanism this relies on, and `flow/SKILL.md` Step 3's adopt-if-set branch is what acts on it. Nothing in `pipeline-run-dir.md` changes; dispatch simply uses the path it already documents.

**This does not violate the no-echo rule.** The second call's *prompt* still names only the record number(s) and `CLAIM_RUN_ID`, never a summary of what the first call did or found. A directory path is a resolution target, the same category as `CLAIM_RUN_ID` itself — not a finding. The second call still re-derives its own verdict from raw artifacts and treats every claim it reads inside that directory as unverified until checked against the artifact it claims to summarize (see `task-prompt.md`'s second-call template).

## 4. Fail loud when the run dir cannot be derived

If the first call's report is malformed, its `MANIFEST:` line is missing or unparseable, or the path it names does not resolve to an existing directory, **do not dispatch the second call anyway.** Silently starting a fresh, disconnected run is precisely the failure this handoff exists to prevent.

Treat it exactly as a first-call failure: report it as a dispatch-level failure for that group (reason `manifest-unresolvable`), write it to this firing's `decisions.md`, and take the failure path in section 5.

## 5. Terminal path when the first call fails (or its run dir is unresolvable)

Two things must happen, and neither is the other's job:

*(A third terminal path exists alongside this one: the second call succeeds and reports `OUTCOME: ready-to-merge`. That path is owned entirely by `settle-and-merge.md`'s **Dispatching-session merge execution** section, not this file — it needs the run-dir and worktree/branch values this file already resolves, but its own procedure (merge, push, then the cleanup this call deliberately deferred) is specified there.)*

1. **Settle runs inside the first call's own agent, not in this thread.** `settle-and-merge.md`'s Settle procedure states its own ownership: it "runs inside whichever of them handles the outcome being settled — the first call (`build,test`) when that call hits a HARD-GATE, the second (`review,polish,wrap-up`) on any path that reaches wrap-up — against that call's own record(s), never in dispatch's main thread." The first call's template in `task-prompt.md` instructs it accordingly, since a `build,test` HARD-GATE failure is that call's own failure to settle — claim release, `assess-agent-autonomy` failure classification, retry counting, `auto:merge` revocation, and the failure comment all happen there. The dispatching session does **not** run Settle itself; it only observes that the first call reported a failure. The one gap: a first call that produced no parseable report at all may never have run Settle, in which case that group's claims lapse via their TTL and a later firing re-pulls the records — the same resting state as any agent that died mid-run.

2. **Worktree teardown still routes through wrap-up.** `[IL-116]` forbids calling `ExitWorktree` / raw `git worktree remove` on a pipeline-run worktree: it skips `wrap-up/cleanup-procedures.md` Section C step 3.5's transitional guard and can permanently destroy a pre-anchoring run's `config.yml`/`decisions.md`/`staged/` with no git history to recover from. But wrap-up lives only in the second call, which on this path was never dispatched. So the dispatching session makes one further `/flow` call, from inside the group's worktree, purely to reach that cleanup route:

   ```
   PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow {target} wrap-up
   ```

   **`wrap-up` alone, not `review,wrap-up`.** `flow/steps-and-gates.md`'s Gate Behavior table gives `review` a **STOP** on any non-PASS verdict, so a step list leading with `review` after a failed build would stop before wrap-up and never reach cleanup at all. `wrap-up`'s own gate "always passes," which is what makes it usable as a cleanup-only invocation.

   When section 4 could not derive a `{run-dir}`, omit `PIPELINE_RUN_DIR` from that call — the teardown still runs through the sanctioned route, and the unresolvable run dir is named in the group's report rather than papered over.

   **Accepted, tracked risk on this path: that call hits the ledger's nothing-left-behind gate.** `wrap-up` *is* in its step list, which is exactly the condition `flow/SKILL.md` Step 5's gate fires on — so a headless `dispatch next` firing runs the resolve gate against a ledger full of build/test-failure items with nobody present to answer Phase 2's required per-item prompts. `auto` does not silence it (`_shared/auto-mode-contract.md`'s "what auto never silences" list names the ledger resolve gate explicitly), and `_shared/autonomy-ceiling.md`'s `ledgerNarrowing` bookkeeping capability does not close it either: it's unlocked only at the `trusted`/`unattended` ceiling, and even then only auto-routes an item whose blocker reason clears the floor rule, and only to `Route to a record -> Keep (backlog)` — every other disposition still needs a human, and at `trusted` so does every item whose reason misses the floor. (At `unattended`, the `ledgerRouteRemainder` bookkeeping capability extends that same restricted disposition to the remainder too — see `_shared/autonomy-ceiling.md`; the mechanics of that carve-out are out of scope here.) The failure-path teardown call can therefore still stall on that gate below `unattended`. This is accepted for now rather than papered over: the alternative is the `[IL-116]` hazard below. Tracked as backlog record #298 — the fix directions on the table are a wider `ledgerNarrowing` scope for this specific context and a cleanup-only `/flow` entry point that reaches wrap-up's cleanup without running the resolve gate at all.

   Settle has already released this group's claim and adjusted its labels by this point, so wrap-up's Section E release step may run against an already-released claim. That overlap is accepted and recorded here so a duplicate release comment is not later read as a defect — the alternative is the `[IL-116]` hazard above.

Only once that cleanup call returns does this session enter the next group's worktree.
