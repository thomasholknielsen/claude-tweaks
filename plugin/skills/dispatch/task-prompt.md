# Dispatch Step 5 — Task() Prompt Template

Referenced by `skills/dispatch/SKILL.md` Step 5. Unlike `sequential-execution.md` and `deprecated-aliases.md` (background detail, read for understanding), **each of this file's two templates must be inlined verbatim into its own `Task()` tool call** when dispatching a group — they are the operative templates, not supplementary reading. Never inline both into one call. Copy each fenced block below exactly, substituting `{issue list}`, `{minted-run-dir}`, etc. as SKILL.md's Step 5 directs.

Each group is dispatched as **two sequential `Task()` calls**, not one (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

## First call — build,test

**No handoff to capture from this call's report.** Dispatch Step 4 already minted this group's run directory before either call — `{minted-run-dir}` below is that same directory, substituted literally, on both calls. There is nothing to parse out of this call's prose report to construct the second call's input; the gate between calls (`two-call-gate.md`) reduces to reading the status line and `OUTCOME`.

**Before substituting this template**, the dispatching session decides whether to add `DISPATCH_HEADLESS=1 ` immediately before `/claude-tweaks:flow` on the invocation line below — a decision made once, here, never left in the copy-pasted text for the dispatched agent to reason about. Add it only when the dispatching session's own firing was `next`-form; omit it entirely (no `{headless-marker}` placeholder, no trailing space) for bare/`#N`/explicit-list forms, which have a human present per `SKILL.md`'s Input table. When set, it tells this call's Settle procedure (`settle-and-merge.md`) that nobody is present to read a Step 2.8 claim-contest stop, so a contest there should self-report via `headless-self-report.md` instead of just failing silently to whoever isn't watching. This is exactly why the marker must not live inside the fenced block below: the block is copied verbatim into every dispatch regardless of firing form, and the dispatched agent itself has no way to know which form the dispatching session used — only the dispatching session can make this call, before substitution.

```
Task scope: Execute claude-tweaks build+test for this file-overlap group of
GitHub records: {issue list}. Singleton -> run
`PIPELINE_RUN_DIR="{minted-run-dir}" /claude-tweaks:flow #{issue} build,test`.
Bundle (2+ issues) -> run
`PIPELINE_RUN_DIR="{minted-run-dir}" /claude-tweaks:flow "#{n1},#{n2},..." build,test`
once, comma-joined. Stop after the test gate -- do not proceed to review, polish, or wrap-up;
a separate Task call handles those. If you reference any of these issue numbers in an
intermediate commit message, write "refs #N" -- never "closes #N" or "fixes #N".

If the build or test step hits a HARD-GATE, handle it per
skills/dispatch/settle-and-merge.md's Settle procedure (claim ownership check against
basename($PIPELINE_RUN_DIR), release, assess-agent-autonomy failure classification, retry
counting, failure comment) before finishing -- that procedure runs inside this agent, against
this group's own record(s), not in the dispatching session's thread, and this call's own
failure is exactly the failure it settles. Do not leave a failed record's claim or label
state unresolved. Do NOT tear the worktree down yourself, and do not run ExitWorktree or
`git worktree remove` -- worktree teardown is the dispatching session's, routed through
wrap-up's own cleanup.

Working directory: the dispatching session has ALREADY entered this group's worktree; you
inherit it. Do NOT create, enter, or switch worktrees, and do not invoke
/superpowers:using-git-worktrees. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to that inherited worktree; if they resolve to the main
checkout instead, STOP and report BLOCKED rather than committing.
If your first commit is denied by the working-directory hook even though `pwd` and
`git rev-parse --show-toplevel` both resolve to the worktree above, re-stamp the run's worktree
assignment once with `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "<RUN_DIR>" "<WORKTREE>"`
and retry the commit. If it is denied a second time, STOP and report BLOCKED.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {build-test-ok | build-test-failed | build-test-blocked}
MANIFEST: {absolute path to this group's run-dir manifest.yml/decisions.md -- a
  human-readable trace only; the dispatching session already holds this run's identity as
  {minted-run-dir} and derives nothing from this line}

One line per issue in this group that hit a HARD-GATE (omit if none):
ISSUE #{n}: failed:{gate}

[Use: Standard] -- this dispatch wraps build+test execution, not analysis; the pipeline's own
steps select their own models as usual. Resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" standard`
(contract § Model Selection).
```

## Second call — review,polish,wrap-up (gated on the first call)

**Only dispatch this call if the first call's status line was DONE or DONE_WITH_CONCERNS AND its OUTCOME was `build-test-ok`.** A `NEEDS_CONTEXT`/`BLOCKED` status, an `OUTCOME` of `build-test-failed`/`build-test-blocked`, or no parseable report at all means this second call is never dispatched — the first call's own agent settles its own failure (its template above instructs it to), and the dispatching session takes the terminal path in `two-call-gate.md` section 5 (fail-loud reporting plus the `/claude-tweaks:flow {target} wrap-up` teardown call).

**Substitute `{minted-run-dir}` into this call's command line**, exactly as `{issue list}` is substituted — not exported as a shell variable in the dispatching session, which would never reach the agent: a dispatched Task agent is a clean room that inherits no environment (`_shared/subagent-output-contract.md`'s Input Discipline). It is the same value substituted into the first call — dispatch Step 4 minted it once, before either call, so there is nothing to derive from the first call's report this time. `/flow` creates a fresh run directory of its own whenever it is not handed an existing one (`flow/SKILL.md` Step 3's adopt-if-set branch), so passing it remains non-negotiable — this call must still resume the exact directory the first call's `/flow` adopted, not start a new one.

This call's prompt names ONLY the record number(s) and the `PIPELINE_RUN_DIR` path above — never a summary of the first call's outcome. Both are resolution targets, not findings; that is what keeps the no-echo rule intact while the run itself is handed over. It is a fresh Task-tool dispatch with zero conversation history from the first call, and its own review step must re-derive its verdict from raw artifacts (the actual diff, the actual test-output artifact — via the same shape `bin/lib/dispatch/artifact-verdict.js`'s `deriveTestVerdict` pins as a testable invariant) rather than trusting any claim the first call made, including claims written to `decisions.md`, ledger entries, or staged proposals the first call produced. File-based state is readable across the two calls even though conversation history is not — the instruction below states this explicitly because that distinction is easy to lose.

```
Task scope: Execute claude-tweaks review+polish+wrap-up for this already-claimed file-overlap
group of GitHub records: {issue list}. Singleton -> run
`PIPELINE_RUN_DIR="{minted-run-dir}" /claude-tweaks:flow #{issue}
review,polish,wrap-up`. Bundle -> run `PIPELINE_RUN_DIR="{minted-run-dir}"
/claude-tweaks:flow "#{n1},#{n2},..." review,polish,wrap-up` once, comma-joined. The
{minted-run-dir} value substituted into those commands is the same run directory dispatch
minted before either call and the first call's own /flow invocation adopted; passing it on
the command line is what makes this call resume that exact run rather than start a new one --
_shared/pipeline-run-dir.md's resolution order step 1 (the env var, its documented preferred
path) feeding flow/SKILL.md Step 3's adopt-if-set branch. You need no other input about what
the prior call did or found.

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
If your first commit is denied by the working-directory hook even though `pwd` and
`git rev-parse --show-toplevel` both resolve to the worktree above, re-stamp the run's worktree
assignment once with `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "<RUN_DIR>" "<WORKTREE>"`
and retry the commit. If it is denied a second time, STOP and report BLOCKED.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | armed | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md -- a human-readable trace
  only; the dispatching session already holds this run's identity as {minted-run-dir} and
  derives nothing from this line}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

**`integration-model: pr-first`** (`_shared/integration-model.md`) — `merged` / `armed` /
`pending-review` are `_shared/pr-first-merge.md`'s own outcome vocabulary, reported verbatim: you
run the merge procedure yourself, in this same call, whichever file's Auto-merge gate you reach
(`dispatch/settle-and-merge.md` for a bundle, `wrap-up/review-console.md`'s dispatch-claim branch
for a singleton). `merged` means you also completed worktree removal, claim release, and run-dir
archival (that procedure's Step 4) — nothing is deferred to the dispatching session on this path.
`armed`/`pending-review` complete none of those three; the reconciler finishes them later, on
merged-PR evidence, whichever trigger point observes it first. There is no `ready-to-merge` value
under this model — the merge already happened, or didn't, by the time you report.

**`integration-model: local-merge`** — report `ready-to-merge` when the group's Auto-merge gate
passed both layers and you already applied acceptance labeling for every member -- never
`merged`. You do not merge yourself on this path: a Task-tool subagent cannot reach the main
checkout. Stop right after labeling -- do not run worktree removal, claim release, or run-dir
archival; the dispatching session completes all three after it merges, per
`settle-and-merge.md`'s Dispatching-session merge execution (local-merge fallback) section.

`pending-review` also covers what `pr-opened` used to name separately: under pr-first the PR
already exists from run start (`_shared/pr-early-run-lifecycle.md`), so there is no longer a
distinct "the branch reached its finish decision, a PR just opened" transition to report — a
run that reaches the Review Console with nobody answering it is `pending-review` regardless of
how long the PR has already existed.

[Use: Standard] -- this dispatch wraps review+polish+wrap-up execution, not analysis; the
pipeline's own steps select their own models as usual. Resolve via
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" standard` (contract § Model Selection).
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes pipeline stages rather than returning findings/locations/a yes-no, so these are their own minimal templates, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.
