# Pending-Review Branch Durability — push + draft PR

Canonical procedure for making a **dispatch-originated** run's branch survive the session that
built it. A `pending-review` outcome parks: the Review Console renders, nobody answers it, and in
a headless firing the container holding the branch is eventually recycled. Observed live
2026-08-09 — bundle #264,#223,#221,#220,#179 built cleanly, landed `pending-review`, and
`git ls-remote` found no branch on origin, recoverable only by resuming that exact session. This
procedure replaces "resume that exact session" with an ordinary GitHub review surface: the branch
on origin, plus one open draft PR carrying the run's Verification Brief.

Three callers. The first two invoke it immediately **before** their console renders; the third is a genuine exception to that shape — see its own row:

| Caller | Invokes from |
|---|---|
| `/claude-tweaks:wrap-up`'s Review Console (`wrap-up/review-console.md`) | a single-record run — just before its `## Present the console` |
| `/claude-tweaks:flow`'s consolidated multi-spec console (`flow/multispec-review-console.md`) | a dispatched **bundle**'s run, whose per-spec consoles deferred — just before its `## Present the consolidated console` |
| `dispatch/settle-and-merge.md`'s Dispatching-session merge execution | the Auto-merge gate's own conflict fallback — its direct `git merge` failed or aborted, *after* both gate layers already passed and acceptance labeling already ran. No console renders on this path at all; see the Scope guard below for how this caller clears condition 2 differently from the other two. |

**Before, not after, is the whole point.** Both consoles end in a blocking `AskUserQuestion`, and a
headless firing never returns from it — `dispatch/SKILL.md`'s Reporting section calls that the
expected resting state, not an error. Anything scheduled after the console, `/claude-tweaks:wrap-up`
Phase 4's execution step included, does not run on the path this procedure exists to protect.

## Scope guard

Run this only when **all** of the following hold. Otherwise skip it entirely, log the skip line
below, and continue to the console unchanged — never an error.

1. **`CLAIM_RUN_ID` is set and non-empty.** Exactly one site in this codebase sets it — both of
   `dispatch/task-prompt.md`'s two Task-call templates, inline on the `/claude-tweaks:flow` command
   line — and no interactive, human-run `/flow` invocation ever does. A human already has the
   branch in their own terminal; there is nothing to protect.
2. **This run resolved to `pending-review`, positively established — not inferred from "a failure
   could not have got here."** It could. Both checks below must hold; if either is unmet, or you
   cannot establish it from this invocation's own state, **skip**. Ambiguity resolves to skip, never
   to push — a skip is never an error, and an unwanted PR is not retractable by the agent that
   opened it.

   a. **This `/claude-tweaks:flow` invocation's resolved step list contains `review`.** A dispatched
      group reaches `pending-review` only through the second Task call's `review,polish,wrap-up`
      list (`dispatch/two-call-gate.md` section 3). A `wrap-up`-only list is the **failure-path
      teardown call** that same file's section 5 issues after a first-call (`build,test`)
      HARD-GATE — issued *because* `wrap-up`'s own gate always passes, so it arrives here with
      `CLAIM_RUN_ID` set, from inside the group's worktree, on a genuinely `failed` run. It is the
      only dispatch-issued invocation that omits `review`, and that omission is the discriminator.
   b. **That `review` step actually ran in this invocation and its gate passed.**
      `flow/steps-and-gates.md`'s Gate Behavior table gives `review` a **STOP** on any non-PASS
      verdict, so arriving at this console *through* a `review` step in the same invocation is
      itself the evidence that it passed. A run that reached the console without one — resumed
      directly at `wrap-up`, or entered by the teardown call above — supplies no such evidence and
      fails this check.

   **A `failed` outcome does reach this console.** It once could not; `wrap-up/review-console.md`'s
   "run whenever a run directory exists, in every mode" plus the teardown call above made it
   reachable, which is why the checks above are positive tests rather than an argument from
   impossibility. The ordinary auto-merge short-circuit still never reaches here — its merge path
   returns before this point, so a group that never left the Auto-merge gate does not land in this
   procedure via the two consoles above.

   **The third caller (table above) is the one exception, and it doesn't run checks 2a/2b at all.**
   It is not itself a `/claude-tweaks:flow` invocation with a step list to inspect — it is the
   dispatching session's own thread, invoked only after `settle-and-merge.md`'s Auto-merge gate
   already established both layers passed (which requires `review` to have run and passed, the
   exact fact 2a/2b exist to establish) and a merge attempt was actually made and failed. That
   sequence is this caller's own precondition, checked by the caller before it ever gets here — not
   something this procedure re-derives from a step list that, from this thread, does not exist to
   inspect.

   Never push or open a PR for a `failed` or `blocked` outcome — an incomplete or broken branch on
   origin is noise, not signal.
3. **A worktree strategy was used** — there is a feature branch distinct from the integration
   branch to push. `current-branch` mode has none; skip.

Log a skip to `decisions.md` as:
`SCANNED {time} — Pending-review durability: skipped ({reason}).`

## What this deliberately does not do

It reuses `dispatch/settle-and-merge.md`'s Auto-merge gate **push mechanics only** — the
worktree-anchored `git push` and the branch / integration-branch resolution. It does not reuse that
gate's merge-adjacent state transitions:

- It **never calls `close-run`.** That call exists there so a merge landing in the *main checkout*
  isn't denied as a wrong-checkout commit (E1), by clearing the run's worktree assignment. This
  procedure's push runs from inside the worktree, where the `worktree.always` gate permits it, so
  there is nothing to relieve.
- It **never clears the run's worktree assignment.** The run stays `active` with its worktree still
  assigned, exactly as an ordinary un-pushed `pending-review` outcome does today. The only
  difference afterwards is that the branch also exists on origin, with an open draft PR.

It also opens no auto-merge path: this is an ordinary, human-reviewed, human-merged PR. Do not add
`auto:merge`, do not enable GitHub auto-merge, and do not treat #71 (`/claude-tweaks:tidy`'s own PRs
having no merge path) as related — different skill, different provenance, and these PRs are
deliberately meant to stay human-merged.

## Step 1: Read the three values, from inside the worktree

**Shell state does not survive between Bash calls** — each invocation gets a fresh shell, so a
variable assigned in one is empty in the next. Read these first and substitute them **literally**
into every command below; never carry them in shell variables. (Same rule and same reason as
`dispatch/settle-and-merge.md`'s Auto-merge gate.)

```bash
git rev-parse --show-toplevel                       # -> {worktree-path}
git branch --show-current                           # -> {branch}
grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//'
git remote show origin | sed -n '/HEAD branch/s/.*: //p'   # only when the line above came back empty
```

The last two together resolve `{integration-branch}` — take the `grep`'s output when non-empty,
otherwise the `git remote show origin` fallback. That is this family's rank-3-then-rank-6 behavior
per `skills/_shared/integration-branch.md`; see that file for the full precedence, including the
explicit-argument and CLAUDE.md ranks this two-command shorthand collapses. It deliberately skips
that ladder's git-inference rank, which would consider whatever branch the main checkout currently
has checked out — a concurrent session switches that underfoot.

**Resolve the worktree with a bare `git rev-parse`, never `git -C "$RUN_DIR"`.** Run directories are
anchored to the **main checkout** (`_shared/pipeline-run-dir.md`'s Anchoring section), so a
run-dir-relative resolution returns the main checkout — and a push from there is exactly what the
`worktree.always` gate denies. `/claude-tweaks:wrap-up` runs inside the worktree, so its own `pwd`
is already the right answer.

## Step 2: Push the branch — its own Bash call, from inside the worktree

```bash
git -C "{worktree-path}" push origin {branch}
```

Never chain this onto anything else. The `worktree.always` policy gate inspects the whole command
string up front, so a compound invocation is denied entirely and neither half runs (CLAUDE.md's
Don'ts, `[IL-33]`).

**If the push fails** — any non-zero exit: network, auth, a rejected non-fast-forward, no `origin`
remote — stop here and do not attempt the PR. Fall back to today's behavior exactly: the branch
stays local, the console renders unchanged, and this run's acceptance labeling still applies
`demo:pending` and posts its Verification Brief whenever it runs. Record the failure per Step 5 so
it is never silently indistinguishable from success, log, and continue to the console:

`AUTO {time} — Pending-review durability: push of {branch} to origin FAILED ({reason}); branch stays local, no PR opened. Reversibility: n/a.`

## Step 3: Skip if an open PR already exists for this branch

A retried run reaching `pending-review` a second time for the same branch must not error and must
not open a duplicate. Resolve `{owner}/{repo}` once with
`gh repo view --json nameWithOwner -q .nameWithOwner`, then:

```bash
gh pr list --repo {owner}/{repo} --head {branch} --state open --json number,url
```

A non-empty result: the PR already exists. Skip creation entirely, record it per Step 5 as an
existing PR (not a failure), log, and continue to the console:

`AUTO {time} — Pending-review durability: pushed {branch}; open PR {url} already exists for it, creation skipped. Reversibility: high.`

**No forge transport available** — `_shared/forge-detection.md`'s check 1 or check 3 fails, or `gh`
is absent and `_shared/github-write-transport.md`'s CRUD mapping has no pull-request row, so there
is no MCP fallback for this operation. The push already succeeded and the durability goal is met:
skip the PR, record it per Step 5 as `pr: skipped — no forge transport`, and continue.

## Step 4: Open the draft PR

Compose the body first. It is this run's **Verification Brief**, rendered from
`wrap-up/verification-brief.md`'s Step 4 template using that file's Step 3
**"Non-testable, or testable-with-browser-unavailable"** sourcing branch — the
`/claude-tweaks:review` spec-compliance verdict and key quality notes, plus
`git diff --stat {base}...HEAD`. Composition only: do **not** run that file's Step 2.5
visual-review safety-net gate, do not post any comment, and do not apply `demo:pending`. Those
belong to acceptance labeling, which this procedure neither performs nor replaces — a draft PR is a
review surface, not a sign-off. Append this section to the composed body:

```markdown
### Branch

`{branch}` — pushed to origin and opened as a draft against `{integration-branch}` by
`/claude-tweaks:dispatch` so this work outlives the session that built it. Acceptance is still
resolved on the record with `/claude-tweaks:demo`, never here.
```

Write it to `/tmp/pending-review-pr-body-{n}.md`, then:

```bash
gh pr create --repo {owner}/{repo} --draft --base {integration-branch} --head {branch} \
  --title "{record title} (#{n})" --body-file /tmp/pending-review-pr-body-{n}.md
```

`{n}` is the record number, read from the materialized header's `record:` field —
`{run-dir}/work/{n}-spec.md` on the single-record path; `{record title}` comes from
`gh issue view {n} --json title -q .title`.

**A bundle's run holds more than one record and still gets exactly one PR** — one branch, one push,
one review surface. Enumerate its records from the **parent** `manifest.yml`'s `specs[].id` list — the run-level record
set, and the same enumeration `flow/multispec-review-console.md`'s claim release uses — not by
globbing `spec-{N}/work/`. Use the **lowest-numbered** record for both `{n}` and `{record title}`, and list every record in the
body as one `Refs #{m}` line each. Never `Fixes`/`Closes` there. The branch's
own closing-keyword carrier commit is stamped later — at `/claude-tweaks:wrap-up` Phase 4's
execution step, via `wrap-up/cleanup-procedures.md` Section C step 2 — which is after the console
is answered, so on this path it has not run and the branch carries no closing keyword at all yet.
That makes the omission more important, not less: a `Fixes` line here would be the only closing
keyword in play, and it would close every listed record the moment someone merged a PR nobody had
reviewed.

**Leave the PR unassigned.** No convention for who reviews dispatch-originated PRs exists in this
repo; inventing one here would be a guess with a person's name on it.

**If `gh pr create` fails, retry it once.** If the retry also fails, stop — the branch is already on
origin, so the durability goal is met. Record the failure per Step 5, log, and continue to the
console:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR creation FAILED twice ({reason}); open one by hand. Reversibility: high.`

On success:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR {url} opened against {integration-branch} for #{n}. Reversibility: high (close the PR; the branch on origin is additive).`

## Step 5: Record the outcome, and make sure it reaches a human

Every branch above — success, existing PR, skipped PR, push failure, PR failure — writes one file at
the run directory's **root**:

```
{run-dir}/pending-review-durability.md
```

`{run-dir}` is the run directory owned by the console that invoked this procedure: the single-record
run dir on the `wrap-up/review-console.md` path, and the **parent** run dir on the
`flow/multispec-review-console.md` path — never a `spec-{N}/` subdirectory. One bundle gets one push,
one PR, and one outcome record; copying it into every `spec-{N}/` would give one fact N homes to
drift between and still would not reach those specs' briefs, for the ordering reason below.

**Root, never `staged/`.** Both consoles classify any file in `staged/` carrying a
`Title:`/`Type:`/`Labels:` header as a queue write (`Q#`) needing its own per-item approval; a
status note is neither a proposal nor a work record.

The file is exactly these three lines, with no heading:

```
push: ok | failed — {reason}
pr: {url} | existing {url} | failed — {reason} | skipped — {reason}
branch: {branch} -> {integration-branch}
```

### Who reads it — and it is a different reader on each path

**Single-record path (`wrap-up/review-console.md`).** `{run-dir}` here is the same
`$PIPELINE_RUN_DIR` that `/claude-tweaks:wrap-up` Phase 4's execution step runs under, and that step
— which is where acceptance labeling posts the brief — is still ahead of this console. So
`wrap-up/verification-brief.md`'s Step 4 reads this file and renders a `### Branch` section from it:
a push or PR-open failure reaches the human in the same comment that carries the brief, never only
in a log nobody opens.

**Bundle path (`flow/multispec-review-console.md`) — the brief cannot carry it, so something else
must.** Every spec in a dispatched bundle has already reached `/claude-tweaks:wrap-up` Phase 4's
execution step by the time this consolidated console runs (that file's "When to run"), and
acceptance labeling is **not** among the items `wrap-up/execution-and-verification.md`'s
`MULTISPEC_REVIEW_DEFER` branch defers — so every per-spec Verification Brief was already posted
*before* this push happened. No choice of location for this file changes that ordering. Two things
carry the outcome on this path instead:

- **On success** — the draft PR's own `Refs #{m}` line for each record puts a cross-reference on that
  record's own timeline, which is where a human holding any of the bundle's records finds the branch
  and the PR.
- **On any failure** — push failed, or PR creation failed twice — post one comment to **each** record
  in the bundle (enumerate via the parent `manifest.yml`'s `specs[].id` list, the same enumeration
  that console's claim release uses), before rendering the console:

  ```bash
  gh issue comment {m} --body "Branch durability: {the push:/pr:/branch: lines above, verbatim}"
  ```

  This is what keeps a failure on this path out of a log nobody opens. It fires only on a failure
  branch, so a clean bundle posts nothing extra. It is a comment on an existing record, not a
  work-record creation — the same category of write as the Verification Brief comment itself — so
  `_shared/auto-mode-contract.md`'s per-item approval rule does not reach it. Best-effort per record:
  log a comment failure to `decisions.md` and continue; it never blocks the console.

  Two accepted residuals on this path, parked rather than fixed here: the `gh issue comment` call
  above has no `_shared/github-write-transport.md` MCP fallback the way Step 3's PR creation does —
  in a `gh`-absent environment a bundle push failure degrades to the `decisions.md` log only, same
  as any other no-forge-transport case in this file. And nothing dedupes the comment itself, so a
  retried bundle whose push fails again posts a second identical one per record — failure-path-only
  noise, not silent data loss.

## Residual: the PR can go stale once a human resumes

This procedure pushes the branch as it stands **before** the console renders, and nothing here
watches it afterwards. When a human later answers the console, `/claude-tweaks:wrap-up` Phase 4's
execution step commits the approved wrap-up actions and — on the worktree path — the closing-keyword
carrier commit lands on the reconciliation merge (`wrap-up/cleanup-procedures.md` Section C step 2).
Neither is pushed to the branch this procedure published, so the draft PR shows the pre-console state
of the work.

That is not a defect to route around here: whoever resumes has the branch, the worktree, and the
console in front of them, and the ordinary finish path (`/superpowers:finishing-a-development-branch`,
via the console's teardown) is what publishes the final state. Adding a second push after the console
would mean scheduling work *after* the blocking `AskUserQuestion` this whole procedure exists because
nothing survives. Stated here so a resumed run's stale PR reads as expected, not as a bug.
