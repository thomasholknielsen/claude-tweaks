# Plan: sanctioned scratch-worktree teardown check, pre-creation reconcile, remote-branch cleanup (#683)

## Problem

`worktree-setup.md`'s unconditional post-creation catch-up (`git fetch origin
{integration-branch}` + `git merge`) puts every upstream commit onto a brand-new
scratch worktree branch when the local integration branch was stale at creation
time. `ExitWorktree`'s data-loss guard then counts those commits as "will discard
this work permanently" (measured: 64 reported, 1 genuinely the session's, already
merged, 0 unmerged) — `scratch-worktree.md` §6 offers no sanctioned way to prove
it's safe, so the operator improvises an ancestry check under time pressure.
Separately, no pr-first merge shape deletes the remote branch afterward — 11 stale
`worktree-*` heads sit on origin today.

## Reference: existing state (read before writing anything)

- `skills/_shared/scratch-worktree.md` §2 "Creating it", §3 "First action inside:
  catch up" (already correctly cites `worktree-setup.md`'s Post-creation catch-up —
  do not duplicate it), §6 "Tearing down" (currently just "use ExitWorktree, never
  raw `git worktree remove`" — no sanctioned safety check).
- `skills/_shared/worktree-setup.md` — 4 sections: Resolving `{integration-branch}`,
  Post-creation catch-up, Pre-flight divergence check, Anti-patterns. The Post-creation
  catch-up section explicitly says it "cites, rather than duplicates" `bin/lib/reconcile`'s
  mirror-ff, and separately warns most call paths already ran `reconcile()` earlier in
  the session — but nothing *guarantees* it ran immediately before this specific worktree
  was cut.
- `skills/_shared/pr-first-merge.md` — Step 4 is `## Step 4: Post-merge reconcile
  (outcome merged only)`, split into `### Step 4.1: Which release carried this?` and
  `### Step 4.2: Reconcile`. Step 4.2 runs `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js"
  reconcile` and explicitly states "No `git merge`, `git commit`, or `git push` runs
  in the main checkout anywhere in this procedure."
- `skills/wrap-up/cleanup-procedures.md` Section C "Git Worktree" — step 4 removes the
  worktree via `ExitWorktree`, step 5 is `If the branch was merged (not kept for PR),
  delete it: git branch -d {branch}` — **local** delete only, nothing remote.
- `skills/_shared/github-write-transport.md` — the CRUD mapping table covers issue
  operations only (list/create/edit/comment/close); it has no row for a git-ref delete.
  Check whether a GitHub MCP ref-delete tool actually exists before writing the new
  Deliverable 3 prose's gh-absent fallback — do not assume one exists or doesn't.
- `bin/hooks.js reconcile` (line ~196) is a thin CLI wrapper over
  `bin/lib/reconcile`'s `reconcile()` — same call `session-start.js` makes in-process.
  `bin/lib/hooks/worktree-reap.js` and `bin/lib/reconcile` — read both per the record's
  own Gotchas note: confirm neither's merged-detection logic depends on the remote
  branch still existing, since Deliverable 3 deletes it.

## Task 1 — `scratch-worktree.md` §6 (sanctioned teardown check) + §2 (pre-creation reconcile) + `worktree-setup.md` (new pre-creation section)

**§6 "Tearing down"** — before the existing "use ExitWorktree, never raw `git worktree
remove`" paragraph, or immediately after it, add the sanctioned pre-teardown check:

```bash
git fetch origin {integration-branch}
git merge-base --is-ancestor HEAD origin/{integration-branch}
```

- **Exit 0** — every commit on this worktree's branch is already upstream; call
  `ExitWorktree` with `discard_changes: true` and state the one-line reason (e.g. "HEAD
  is an ancestor of origin/{integration-branch} — nothing to lose"). Never invoke the
  override without running this check first.
- **Non-zero** — **stop and surface**: run `git log origin/{integration-branch}..HEAD
  --oneline` and show the listing. Never override the guard on a non-zero result — the
  commits it lists are genuinely at risk.

State plainly: this is what makes `discard_changes: true` a proven claim instead of an
improvised one. Cross-reference `pr-first-merge.md`'s new remote-branch-delete step
(Task 2 of this plan — cite it by the exact heading Task 2 creates: `## Step 5: Delete
the remote branch (outcome merged, after worktree teardown)`) as the next action once
`ExitWorktree` succeeds and the branch was actually merged (not just abandoned) — this
file's §6 is about *whether it's safe to discard the worktree*, not about remote branch
cleanup, which stays canonically stated in `pr-first-merge.md` per the state-once rule.

**§2 "Creating it"** — before the `EnterWorktree` call, add: fast-forward the local
integration branch to origin's tip first —

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile
```

— so a freshly cut scratch branch starts at origin's tip and the (still-unconditional,
still-required — its own rationale in `worktree-setup.md` is unchanged) Post-creation
catch-up merge in §3 becomes a no-op in the common case. State explicitly: never
`git checkout` or `git pull` in the shared checkout to accomplish this — `reconcile`'s
mirror-ff is the sanctioned, worktree-safe mechanism (it never merges, strict
`--ff-only`, no worktree guard needed). Cite `worktree-setup.md`'s new section (below)
rather than restating the rationale.

**`worktree-setup.md`** — add a new section, `## Pre-creation reconcile`, placed
immediately before `## Post-creation catch-up` (creation-order placement: reconcile
happens first, catch-up happens second). Content: fast-forward the *main checkout's*
local `{integration-branch}` to origin's tip via `node
"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile` before any worktree-creation call
(`EnterWorktree` or `git worktree add`) — this is the *first* of the two
staleness-protection procedures this file now documents (the second is the existing
Post-creation catch-up). Explain why this doesn't replace the post-creation catch-up
(reconcile only advances the main checkout's own ref; a worktree already cut before
reconcile ran, or cut concurrently by a sibling session, can still start stale — the
catch-up is the unconditional backstop, this is the cheap common-case optimization).
Update this file's own intro paragraph (which currently says "Canonical home for the
two staleness-protection procedures...") to say **three** if a third section count is
now accurate, or fold pre-creation reconcile as a lead-in to the existing "two" if it
reads more naturally as scene-setting rather than a third independent procedure — use
judgment, but make sure the intro's own count language matches however many `##`
procedure sections the file ends up with.

Do not touch `## Pre-flight divergence check` or `## Anti-patterns` — out of scope.

## Task 2 — `pr-first-merge.md`: canonical remote-branch-delete step + `cleanup-procedures.md` citation + `github-write-transport.md` MCP row

**`pr-first-merge.md`** — add a new step after `### Step 4.2: Reconcile`, heading
exactly:

```
## Step 5: Delete the remote branch (outcome merged, after worktree teardown)
```

(Use `##` — the same level as `## Step 4`, not `###`, since this is a new top-level
step in the same file's numbering, not a Step 4 sub-step.) Content:

- Applies only to outcome `merged` (never `armed`/`pending-review`), and only **after**
  the worktree has actually been removed — this step is *cited from*
  `cleanup-procedures.md` Section C (Task 2's own second half, below), which is where
  worktree removal actually happens; this file's own Step 4 never tears down a
  worktree itself, so state plainly that this step's trigger point is downstream of
  this file's own procedure, not a step this file executes inline.
- Command: `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/{branch}"` — never
  `git push origin --delete {branch}` (this file's own Step 4 rule stands: no `git
  push` in the main checkout, and the worktree-always gate denies it there anyway) and
  never `gh pr merge --delete-branch` (documented project memory: it errors against a
  still-live worktree — by the time this step runs the worktree is already gone, but
  using the dedicated ref-delete call here keeps this step decoupled from whichever
  merge command ran earlier in Step 3, which is simpler to reason about than retrofitting
  `--delete-branch` onto Step 3's several merge-command variants).
- Guard: never delete `{integration-branch}` itself (a caller bug, not a runtime
  condition — assert the branch name differs before calling). Tolerate "reference does
  not exist" (already deleted, e.g. by GitHub's own branch-protection auto-delete
  setting, or a re-run) as success, not a failure to report.
- `gh`-absent transport: check `github-write-transport.md`'s existing CRUD mapping and
  the real GitHub MCP tool set for a ref-delete equivalent before writing this
  sentence — if one exists, name it (add a row to that file's table, Task 2's own last
  deliverable below); if none exists, state plainly that the delete is skipped under
  `gh`-absent and the branch accumulates as a stale head for a future `/claude-tweaks:tidy`
  sweep to catch — do not invent an MCP tool name that doesn't exist.

**`skills/_shared/github-write-transport.md`** — only if a real MCP ref-delete
equivalent exists (see above): add one row to the CRUD mapping table, matching its
existing row shape (`| Operation | gh CLI | GitHub MCP tool |`). If none exists, do not
add a row — state the gap in your final report instead of inventing a placeholder.

**`skills/wrap-up/cleanup-procedures.md` Section C** — add a new step 6, after the
existing step 5 (`If the branch was merged (not kept for PR), delete it: git branch -d
{branch}`):

```
6. If the branch was merged (the same condition step 5 just checked), also delete the
   remote branch — run `_shared/pr-first-merge.md`'s `## Step 5: Delete the remote
   branch` against `{branch}`. Skip silently if the branch was kept for an open PR
   (step 5's own condition) or if no remote tracking ref exists for it.
```

Word this as a citation (state-once rule — `pr-first-merge.md` is canonical), not a
restatement of the `gh api` command itself.

**`scratch-worktree.md` §5 "Returning to the integration branch"** — read this section;
if it has its own branch-cleanup language (grep for "delete" inside it), add the same
one-line citation to `pr-first-merge.md`'s new Step 5, worded consistently with the
`cleanup-procedures.md` citation above. If §5 has nothing about branch deletion at all
(it may only be about *returning to* the integration branch, not deleting anything),
skip this file — the record's own Deliverables list names §6 (not §5) as the file
`pr-first-merge.md`'s new step should be cited from for scratch-worktree teardown; only
touch §5 if you find it's actually the relevant section after reading it, and say so in
your report either way.

## Task 3 — Gotchas verification + conformance tests

**First, verify the Gotchas note** (do this before writing tests, it may change what
you test): read `bin/lib/hooks/worktree-reap.js` and `bin/lib/reconcile`'s source.
Confirm neither's merged-branch detection depends on the *remote* branch still
existing (as opposed to the local worktree, or the local branch ref, or the merge
commit itself being reachable from the integration branch). Report what you find,
even if it's "confirmed, no dependency" — this is a stated precondition of the
feature, not busywork.

**Conformance tests** — new or extended test file(s) under `tests/` pinning the
literal prose additions from Tasks 1 and 2 (grep-based assertions, matching this
repo's `read(...).match(/.../ )` convention — see `tests/pr-first-merge.test.js` for
the exact style to follow):

1. `scratch-worktree.md` §6 contains the `merge-base --is-ancestor` check and both
   outcomes (discard-with-reason / stop-and-surface with `git log`).
2. `scratch-worktree.md` §2 and `worktree-setup.md` both mention the pre-creation
   `bin/hooks.js reconcile` call, and `worktree-setup.md` states never `git checkout`/
   `git pull` in the shared checkout.
3. `pr-first-merge.md` contains exactly one `gh api -X DELETE` / ref-delete statement
   (assert the count, not just presence — this is the "exactly one canonical
   statement" AC), and it names both the "never `gh pr merge --delete-branch`" and
   "never delete the integration branch" guards.
4. `cleanup-procedures.md` Section C's new step 6 cites `pr-first-merge.md`'s Step 5
   rather than containing its own `gh api` command (assert the citation text is
   present AND that `cleanup-procedures.md` itself does NOT contain the literal
   string `git/refs/heads` — proving it cites rather than duplicates).
5. If Task 2 added a `github-write-transport.md` row: pin it exists. If Task 2
   determined no MCP equivalent exists: no test needed for that half — do not invent
   one.

If any code (not expected, but the record allows for it: "unit tests with the fake
runner if any code (reconcile / wrap-up cleanup) gains the remote delete") — this plan
deliberately keeps the remote delete as a documented `gh api` command inside a skill
file, not new `bin/lib/` code, so no fake-runner unit tests are needed; note in your
report if you disagree after reading the actual files, rather than silently adding
code this plan didn't ask for.

Run `npm test` at the end — must be 100% green.

## AC4 — Manual verification (explicitly NOT executed by this plan)

The materialized spec's AC4 asks for a live create-scratch-worktree /
commit / PR / merge / teardown cycle on this actual repo to prove `ExitWorktree` needs
no override and `git ls-remote --heads origin <branch>` ends up empty. This is a real,
side-effecting, hard-to-reverse sequence (a live PR against the real repo, a real merge,
a real branch delete) running concurrently with five other in-flight records sharing
this same multi-spec run's branch/PR state — deliberately NOT executed as part of this
automated build. Report it as a **Manual Step** in the eventual Pipeline Summary
("### Manual Steps Required" table, `flow/summary-template.md`'s existing convention)
for a human to run after this branch merges, rather than attempting it inline.

## Acceptance mapping (materialized spec's 5 ACs)

1. Task 1 (§6).
2. Task 1 (§2 + `worktree-setup.md`).
3. Task 2 (`pr-first-merge.md` Step 5 + the two citing files).
4. Explicitly deferred to a Manual Step — see the section above, not silently dropped.
5. Task 3's conformance tests + `npm test`.

## Non-goals

- Do not touch the 11 existing stale `worktree-*` heads on origin — the record's own
  Gotchas explicitly rules this out as a separate `/claude-tweaks:tidy` sweep.
- Do not change `ExitWorktree`'s guard semantics — the record's own Gotchas states
  this is the harness's, not ours to change; this record fixes what feeds it (the
  branch's start point) and gives the sanctioned override proof, nothing else.
- Do not widen scope to `git worktree add` fallback-path-specific reconcile timing
  beyond what `worktree-setup.md`'s existing "regardless of which creation path was
  used" language already covers.
