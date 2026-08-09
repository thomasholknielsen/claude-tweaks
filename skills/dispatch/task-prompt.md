# Dispatch Step 5 — Task() Prompt Template

Referenced by `skills/dispatch/SKILL.md` Step 5. Unlike `sequential-execution.md` and `deprecated-aliases.md` (background detail, read for understanding), **each of this file's two templates must be inlined verbatim into its own `Task()` tool call** when dispatching a group — they are the operative templates, not supplementary reading. Never inline both into one call. Copy each fenced block below exactly, substituting `{issue list}`, `{RUN_ID}`, etc. as SKILL.md's Step 5 directs.

Each group is dispatched as **two sequential `Task()` calls**, not one (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

## First call — build,test

**The dispatching session must capture this call's reported `MANIFEST:` path from its report.** That path is the only handle it gets on the run directory `/flow` created inside this call, and it is what becomes the second call's `PIPELINE_RUN_DIR` — without it the second call starts a fresh, disconnected run. The derivation, the fail-loud fallback when it is missing or unparseable, and the failure path are all in `two-call-gate.md` in this directory.

```
Task scope: Execute claude-tweaks build+test for this already-claimed file-overlap group of
GitHub records: {issue list}. This firing's run id, for the ownership check downstream, is:
{RUN_ID} -- the same value already embedded as runId in each of this group's claim markers by
Step 4. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue} build,test`.
Bundle (2+ issues) -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..." build,test`
once, comma-joined. Stop after the test gate -- do not proceed to review, polish, or wrap-up;
a separate Task call handles those. If you reference any of these issue numbers in an
intermediate commit message, write "refs #N" -- never "closes #N" or "fixes #N".

If the build or test step hits a HARD-GATE, handle it per
skills/dispatch/settle-and-merge.md's Settle procedure (claim ownership check, release,
assess-agent-autonomy failure classification, retry counting, failure comment) before
finishing -- that procedure runs inside this agent, against this group's own record(s), not
in the dispatching session's thread, and this call's own failure is exactly the failure it
settles. Do not leave a failed record's claim or label state unresolved. Do NOT tear the
worktree down yourself, and do not run ExitWorktree or `git worktree remove` -- worktree
teardown is the dispatching session's, routed through wrap-up's own cleanup.

Working directory: the dispatching session has ALREADY entered this group's worktree; you
inherit it. Do NOT create, enter, or switch worktrees, and do not invoke
/superpowers:using-git-worktrees. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to that inherited worktree; if they resolve to the main
checkout instead, STOP and report BLOCKED rather than committing.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {build-test-ok | build-test-failed | build-test-blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE (omit if none):
ISSUE #{n}: failed:{gate}

[Use: Standard model -- this dispatch wraps build+test execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

## Second call — review,polish,wrap-up (gated on the first call)

**Only dispatch this call if the first call's status line was DONE or DONE_WITH_CONCERNS AND its OUTCOME was `build-test-ok`.** A `NEEDS_CONTEXT`/`BLOCKED` status, an `OUTCOME` of `build-test-failed`/`build-test-blocked`, or no parseable report at all means this second call is never dispatched — the first call's own agent settles its own failure (its template above instructs it to), and the dispatching session takes the terminal path in `two-call-gate.md` section 5 (fail-loud reporting plus the `/claude-tweaks:flow {target} wrap-up` teardown call).

**Export `PIPELINE_RUN_DIR` on this call.** Derived from the first call's `MANIFEST:` path per `two-call-gate.md` sections 1 and 3, and non-negotiable: `/flow` always creates a fresh run directory of its own, so without it this call orphans everything the first call staged. If it cannot be derived, this call is not dispatched at all (section 4).

This call's prompt names ONLY the record number(s), `CLAIM_RUN_ID`, and the `PIPELINE_RUN_DIR` path above — never a summary of the first call's outcome. All three are resolution targets, not findings; that is what keeps the no-echo rule intact while the run itself is handed over. It is a fresh Task-tool dispatch with zero conversation history from the first call, and its own review step must re-derive its verdict from raw artifacts (the actual diff, the actual test-output artifact — via the same shape `bin/lib/dispatch/artifact-verdict.js`'s `deriveTestVerdict` pins as a testable invariant) rather than trusting any claim the first call made, including claims written to `decisions.md`, ledger entries, or staged proposals the first call produced. File-based state is readable across the two calls even though conversation history is not — the instruction below states this explicitly because that distinction is easy to lose.

```
Task scope: Execute claude-tweaks review+polish+wrap-up for this already-claimed file-overlap
group of GitHub records: {issue list}. This firing's run id is: {RUN_ID}. Singleton -> run
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue} review,polish,wrap-up`. Bundle -> run
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..." review,polish,wrap-up` once,
comma-joined. The dispatching session exports PIPELINE_RUN_DIR (derived from the first call's
MANIFEST: path) alongside CLAIM_RUN_ID before this call, so _shared/pipeline-run-dir.md's
resolution order step 1 -- the env var, its documented preferred path -- resumes the exact run
the first call created rather than starting a new one. You need no other input about what that
prior call did or found.

CRITICAL: your review step must re-derive its verdict from raw artifacts -- the actual diff,
the actual test-output log in the run directory -- never from a prior claim, whether that
claim lives in conversation (you have none from the first call) or in a file the first call
wrote (decisions.md, ledger entries, staged proposals). Treat every such file's claims as
unverified until checked against the artifact it claims to summarize.

Handle any HARD-GATE failure per skills/dispatch/settle-and-merge.md's Settle procedure
(retry ceiling / classification-driven auto:merge revocation) before finishing -- do not
leave a failed record's claim or label state unresolved. If you reference any of these issue
numbers in an intermediate commit message, write "refs #N" -- never "closes #N" or "fixes
#N". The real closing keyword is stamped once, at the end, by wrap-up's carrier commit or the
merge commit (close-via-merge, `_shared/issue-claims.md`).

Working directory: the dispatching session is still in this group's worktree (unchanged since
the first call) -- you inherit it. Do NOT create, enter, or switch worktrees, and do not invoke
/superpowers:using-git-worktrees. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to that inherited worktree; if they resolve to the main
checkout instead, STOP and report BLOCKED.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

[Use: Standard model -- this dispatch wraps review+polish+wrap-up execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes pipeline stages rather than returning findings/locations/a yes-no, so these are their own minimal templates, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.
