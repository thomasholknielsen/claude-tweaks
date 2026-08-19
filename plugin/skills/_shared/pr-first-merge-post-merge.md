# PR-First Merge — post-merge steps (outcome `merged` only)

Read this file only once `pr-first-merge.md`'s Step 3 has confirmed outcome `merged` (a `pending-review`
or `armed` outcome never reaches this file — the reconciler completes those later, convergently,
per Step 3's own account). This holds Step 4 (post-merge reconcile) and Step 5 (delete the remote
branch) — the two steps that exist only on the confirmed-merged path, never read on the far more
common `armed`/`pending-review` outcomes a merge attempt actually produces on this repo (Task 0's
own capture: an unprotected repo's `--auto` call usually merges immediately or arms, but every
parked/red/conflict/permission branch in Step 3 never reaches here at all).

## Step 4: Post-merge reconcile

### Step 4.1: Which release carried this? (before reconcile)

A merge can land minutes before a sibling session's version bump and be swept into it with no
CHANGELOG line of its own — three records shipped that way under v6.87.1 (#603, the incident
behind #678). Reconcile says nothing about *where* the merge landed relative to the version
history, so ask, once, before it runs.

This check applies only when the ref carries a plugin manifest and a changelog — `pr-first-merge.md`
is canonical for every pr-first project, but the check is only meaningful for a plugin repo whose
version of record is a `.claude-plugin/plugin.json`. Probe BOTH spellings of that manifest path:
a payload-cutover repo carries it under `plugin/`, pre-cutover history carries it at the repo
root, and probing only one spelling silently reports "no plugin manifest" for the other:

```bash
(git cat-file -e origin/{integration-branch}:plugin/.claude-plugin/plugin.json || git cat-file -e origin/{integration-branch}:.claude-plugin/plugin.json) && git cat-file -e origin/{integration-branch}:CHANGELOG.md
```

When either is absent, log `AUTO {time} — pr-first-merge Step 4.1: release status — n/a — no
plugin manifest at origin/{integration-branch}. Reversibility: n/a.` and carry `n/a — no plugin
manifest at {ref}` into the closing report; skip the rest of this step.

```bash
git fetch origin {integration-branch}
node "${CLAUDE_PLUGIN_ROOT}/bin/release.js" status --merge {merge-sha} --records {n}[,{m}...] --ref origin/{integration-branch} --json
```

`{merge-sha}` is the merge commit `gh pr view --json mergeCommit` reported for the confirmed
merge; `{n},{m}` are the record numbers this run carried — the materialized header's `record:`
(one per `spec-{N}/work/{N}-spec.md` for a bundle) or, identically, the PR body's `Fixes #{n}`
lines. Pass them explicitly — the subcommand never guesses record numbers, and never calls `gh`
(the same invocation applies under `local-merge` with the local merge commit and `--ref
{integration-branch}`). Read the bump commit **after** the merge is confirmed and after the
fetch above — the bump can land in a sibling session while this PR is being merged.

Branch on the JSON:

- `{"shipped": false}` — log `AUTO {time} — pr-first-merge Step 4.1: release status — not yet in
  a release — bump pending. Reversibility: n/a.` and carry that human line into the closing
  report (`flow/summary-template.md`'s `**Release status:**` line).
- `{"shipped": true, "missing": []}` — every record is already named under `v{version}`; log
  `AUTO {time} — pr-first-merge Step 4.1: release status — already carried by v{version} — every
  record named in CHANGELOG. Reversibility: n/a.` Stage nothing.
- `{"shipped": true, "entryFound": false}` — the version has no CHANGELOG entry at all (a
  release-process defect `tests/changelog-coverage.test.js` already fails the suite on); human
  line `already carried by v{version} — CHANGELOG has no v{version} entry; backfill needed:
  #{a}, #{b}`; stage the same file as the backfill case below, its Apply note prefixed `Create
  the \`## v{version} — {summary}\` entry first (changelog-coverage enforces it), then append …`.
- `{"shipped": true, "missing": [...]}` — the backfill case. Generate the subsection text with
  `node "${CLAUDE_PLUGIN_ROOT}/bin/release.js" status --merge {merge-sha} --records {n},{m} --ref origin/{integration-branch} --backfill`
  and **stage** it at `{run-dir}/staged/release-backfill-v{version}.md`. This run's own Review
  Console has already closed by merge time (this step runs after the merge is confirmed), so the
  staged file is this run's audit + revert artifact, not a live console row — Step 4.2's reconcile
  archives it with the run dir. The surfaces that actually reach a human are (i) the closing
  report's release-status line (`flow/summary-template.md`), and (ii) under pr-first, a
  `release-status` PR comment posted per `_shared/pr-run-comments.md`'s post-or-update procedure
  (kind `release-status`, marker `<!-- run-comment: release-status -->` as the first line, body =
  the human line, then the `--backfill` section, then one line `Apply via a scratch-worktree PR —
  see docs/releasing.md "After the merge".`) — posted on this outcome only, never the other two.
  Failure to post follows `pr-run-comments.md`'s own retryable-failure posture. Under
  `local-merge` (no PR), the staged file and the closing line are the only surfaces. This step
  never edits `CHANGELOG.md` itself — the no-`git merge`/`git commit`/`git push`-in-the-main-checkout
  rule stated at the top of `pr-first-merge.md` stands, so the staged row is applied later by a
  worktree-based PR (`docs/releasing.md`'s "After the merge" section), never here. The staged file:

  ```markdown
  Apply: append the section below to CHANGELOG.md's `## v{version}` entry (before the next `## v` heading), through the ordinary pr-first path — scratch worktree, `tests/changelog-coverage.test.js` green, PR, merge. Never inline in the main checkout.
  Merge: {merge-sha}
  Records: #{a}, #{b}

  {the --backfill output, verbatim — it starts with its own `### also carried in this build` heading}
  ```

  Log `STAGED {time} — pr-first-merge Step 4.1: release status — already carried by v{version} —
  CHANGELOG backfill needed: #{a}, #{b}. Reversibility: high; stage path:
  staged/release-backfill-v{version}.md.` under the invoking merge site's own decisions.md heading
  (`## /dispatch`, `## /wrap-up`, or `## /flow` — whichever skill entered this procedure) — and
  carry the human line into the closing report.

Like reconcile, this is convergent bookkeeping, not owed: a `git fetch` failure or a non-zero
exit from the subcommand is logged (`AUTO {time} — pr-first-merge Step 4.1: release status
unavailable ({reason}). Reversibility: n/a.`) and the closing report's line reads `release status
unavailable — {reason}`; it is never a reason to report anything other than `merged`.

### Step 4.2: Reconcile

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile
```

Fast-forwards the mirror (the local integration branch — "mirror" and "local main" name the same
object; this file uses "mirror" throughout since that is `bin/lib/reconcile`'s own term),
releases the claim, and archives the run dir. This is convergent cleanup, not owed — a failure
here (network, `gh` blip) is logged and left for the next trigger point, never retried inline and
never a reason to report anything other than `merged`. **No `git merge`, `git commit`, or
`git push` runs in the main checkout anywhere in this procedure** — the reconciler's own
`mirrorFastForward` is a strict `--ff-only`, never a merge that could conflict, so it needs no
worktree, no branch guard, and no close-run relief.

## Step 5: Delete the remote branch (after worktree teardown)

Applies only after outcome `merged` (never `armed`/`pending-review`), and only **after** the
worktree has actually been removed. This step's trigger point is downstream of `pr-first-merge.md`'s
own procedure — it is cited from `wrap-up/cleanup-procedures-execution.md` Section C, which is
where worktree removal actually happens; Step 4 above never tears down a worktree itself, so
nothing in this file calls this step inline.

```bash
gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch}"
```

Never `git push origin --delete {branch}` — the no-`git push`-in-the-main-checkout rule stated at
the top of `pr-first-merge.md` stands, and the worktree-always gate denies the push there anyway.
Never `gh pr merge --delete-branch` either: by the time this step runs the worktree is already
gone, but the dedicated ref-delete call keeps this step decoupled from whichever merge command
Step 3 actually ran — simpler to reason about than retrofitting `--delete-branch` onto Step 3's
several merge-command variants.

Guard: never delete `{integration-branch}` itself — assert the branch name differs before
calling; a match here is a caller bug, not a runtime condition to branch on. Tolerate "reference
does not exist" (already deleted — e.g. by GitHub's own branch-protection auto-delete setting,
or a re-run of this step) as success, not a failure to report.

`gh`-absent transport: no GitHub MCP tool for a ref/branch delete is confirmed to exist —
`github-write-transport.md`'s CRUD mapping covers issue operations only, and the GitHub MCP
server's own branch tools stop at `create_branch`/`list_branches`. Under `gh`-absent, skip the
delete: the branch accumulates as a stale head for a future `/claude-tweaks:tidy` sweep to
catch, rather than inventing a tool call that doesn't exist.
