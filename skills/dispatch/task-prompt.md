# Dispatch Step 5 — Task() Prompt Template

Referenced by `skills/dispatch/SKILL.md` Step 5. Unlike `sequential-execution.md` and `deprecated-aliases.md` (background detail, read for understanding), **this file's content must be inlined verbatim into the actual `Task()` tool call** when dispatching a group — it is the operative template, not supplementary reading. Copy the fenced block(s) below exactly, substituting `{issue list}`, `{RUN_ID}`, etc. as SKILL.md's Step 5 directs.

Each group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):

```
Task scope: Execute claude-tweaks pipeline work for this already-claimed file-overlap group of
GitHub records: {issue list}. This firing's run id, for the ownership check in the Settle step,
is: {RUN_ID} -- the same value already embedded as runId in each of this group's claim markers
by Step 4. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue}`. Bundle (2+
issues) -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..."` once, comma-joined.
The CLAIM_RUN_ID export matters on the success path too, not just failures below -- /flow threads
it to /wrap-up's release step so its ownership check compares against the run that actually
claimed the record, not /flow's own later PIPELINE_RUN_DIR. Handle any HARD-GATE failure per
skills/dispatch/settle-and-merge.md's Settle procedure (retry ceiling / classification-driven
auto:merge revocation) before finishing -- do not leave a failed record's claim or label state
unresolved. That procedure's ownership check compares each record's claim.runId against the {RUN_ID} given above, not any run
id you generate yourself. If you reference any of these issue numbers in an intermediate commit
message during this run, write "refs #N" -- never "closes #N" or "fixes #N". The real closing
keyword is stamped once, at the end, by wrap-up's carrier commit or the merge commit
(close-via-merge, `_shared/issue-claims.md`) -- an early closing keyword on an intermediate commit
would close the record before the work is actually done.

Working directory: the dispatching session has ALREADY entered this group's worktree; you
inherit it. Do NOT create, enter, or switch worktrees, and do not invoke
/superpowers:using-git-worktrees. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to that inherited worktree; if they resolve to the main
checkout instead, STOP and report BLOCKED rather than committing.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

[Use: Standard model -- this dispatch wraps full pipeline execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes a full pipeline rather than returning findings/locations/a yes-no, so this is its own minimal template, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.
