# Staged Patch — validate at staging, describe the invariant, fall back at the console

Canonical contract for every code-fix proposal that a pipeline phase stages under
`.claude-tweaks/pipelines/{run-id}/staged/` as a `.patch` for the Review Console to apply
later. Stated once here; the staging sites (`review/step3-routing.md`'s Auto-mode routing table,
`test/SKILL.md`'s Step 3 stage flow, `_shared/multi-agent-coordination.md`'s reproduction
staging) and the console apply steps (`wrap-up/review-console.md` "On approval",
`flow/multispec-review-console.md` "On approval") cite this file rather than restating it.

## Why

A patch is staged mid-pipeline, in a worktree whose HEAD advances several more times before the
console runs — `/simplify`, polish, `/test` fix waves, later specs in a multi-spec run. Staleness
is therefore structural, not an edge case: the literal diff bytes are the least durable part of
the proposal. Two things went wrong in run 2026-08-16T164927 that this contract closes: a staged
diff was malformed and nobody noticed until `git apply` failed at the console ("No valid patches
in input"), and a well-formed diff went stale because `/simplify` legitimately restructured the
target lines after staging. Both surfaced only at the console, where the one-line fix had to be
re-derived by hand.

## Artifact format

One file per proposal, `staged/{slug}-{n}.patch` (`review-{n}.patch`, `test-fix-{n}.patch`,
`review-unconfirmed-{n}.patch` — each site keeps its existing filename). The file is a unified
diff **preceded by a description preamble** — free text before the first `diff --git` header,
which `git apply` skips (the same tolerance that lets it apply `git format-patch` output):

```
Target: {repo-relative path of the file the fix edits — one line per file when the diff touches several}
Invariant: {one sentence — the property the edit establishes, stated so it can be re-derived without the diff; e.g. "the `rel` assignment normalizes separators to posix before comparison"}
Finding: {severity} {category} — {the finding text as logged}
Staged-at: {short sha of the worktree HEAD at staging time}

diff --git a/{path} b/{path}
--- a/{path}
+++ b/{path}
@@ ... @@
```

`Target:` and `Invariant:` are the durable intent — the console's fallback (below) re-derives the
edit from them alone. `Finding:` ties the artifact back to its `decisions.md` entry. `Staged-at:`
lets the console show what moved (`git diff --stat {Staged-at}..HEAD -- {Target}`) when a diff
has gone stale. The diff is the fast path, never the only path. A multi-spec console applies
patches "against the cumulative pipeline state," so `Target:` must be an explicit repo-relative
path — cumulative drift stays resolvable only when the fallback knows which file to open.

## Staging-time gate

Immediately after composing the file, and before logging it as staged, run — from the worktree,
the same tree the diff was composed against:

```bash
git apply --check "$STAGE_PATH"
```

- **Exit 0** — the artifact is well-formed and applies to the tree it was written against. Keep
  it; write the site's normal `STAGED {time} — … Stage path: staged/{slug}-{n}.patch.` entry.
- **Non-zero** — the diff is malformed (`patch with only garbage`, `No valid patches in input`,
  `corrupt patch`) or already doesn't apply to the tree it was just composed against. **Do not
  keep the `.patch`.** Recompose the diff once from the current tree and re-check. If it fails
  again, delete the `.patch`, write the description alone to `staged/{slug}-{n}.md` (the same
  `Target:`/`Invariant:`/`Finding:`/`Staged-at:` block, no diff), and log the composition error
  where it happened rather than at the console:

  `STAGED {time} — {step}: {finding} — patch failed \`git apply --check\` at staging ({first stderr line}); staged description-only at staged/{slug}-{n}.md. Reversibility: high.`

  The finding is not lost — the console applies a description-only stage through the same
  fallback it uses for a stale diff. Under `auto` this is a log line and a degraded artifact,
  never a mid-flow stop (`_shared/auto-mode-contract.md`).

## Console apply with description fallback

For each staged `.patch` (and each description-only `.md` written by the gate above), in the
order the console lists them:

1. **Fast path** — `git apply --check "$STAGE_PATH"`; on exit 0, `git apply "$STAGE_PATH"` and
   log `AUTO {time} — Review Console apply: staged/{slug}-{n}.patch applied. Reversibility: high (commit).`
2. **Stale diff (expected, not exceptional)** — on a non-zero check (`patch does not apply`,
   `patch failed`), read the preamble's `Target:` and `Invariant:`, open the target file in the
   *current* tree, and establish the invariant with a direct edit — the same Edit-based path the
   console already uses for `.md` proposals. Then re-read the target to confirm the invariant
   holds. Log `AUTO {time} — Review Console apply: staged/{slug}-{n}.patch stale ({first stderr line}; target moved since {Staged-at}: {git diff --stat summary}); re-derived from Invariant via direct edit. Reversibility: high (commit).`
   - If the invariant **already holds** in the current tree (a later phase fixed the same thing),
     make no edit and log `… already satisfied by {commit or phase}; dropped.`
3. **Description-only stage** — no diff to try; go straight to step 2's re-derivation.
4. **Cannot re-derive** — the `Target:` file no longer exists, or the `Invariant:` no longer
   names anything in it (the code the finding was about was removed). Do not guess and do not
   drop silently: leave the item's ledger entry `open`, render it in the console's "Not applied"
   footer with the reason, and log `KEPT-PROMPT {time} — Review Console apply: staged/{slug}-{n}.patch could not be re-derived ({reason}). Surfaced for human decision.`

`--dry-run` consoles (`wrap-up/review-console.md`) print each of these outcomes as a preview line
instead of executing the apply or the edit; the `--check` itself is read-only and still runs.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Staging a diff without `git apply --check` | A malformed diff is first discovered at the console, hours later, by a different reader — the composition error belongs to the phase that composed it |
| Staging only the diff, no `Invariant:` | Later phases legitimately move the target; with no description the console can only error out or hand-derive the fix from the finding text |
| Treating a stale diff as a failure | Staleness is the expected end state of a diff written mid-pipeline; the description is the durable intent, the diff bytes are a cache |
| Silently dropping an item that can't be re-derived | The finding was real when staged; a vanished target is a human decision, not a no-op |
| Restating this procedure at a staging site or console | The two consoles and three staging sites drifted apart once already — cite this file |
