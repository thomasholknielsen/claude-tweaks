# Pending-Review Branch Durability — push + draft PR

Canonical procedure for making a **dispatch-originated** run's branch survive the session that
built it. A `pending-review` outcome parks: the Review Console renders, nobody answers it, and in
a headless firing the container holding the branch is eventually recycled. Observed live
2026-08-09 — bundle #264,#223,#221,#220,#179 built cleanly, landed `pending-review`, and
`git ls-remote` found no branch on origin, recoverable only by resuming that exact session. This
procedure replaces "resume that exact session" with an ordinary GitHub review surface: the branch
on origin, plus one open draft PR carrying the run's Verification Brief.

Two callers, both invoking it immediately **before** their console renders:

| Caller | Invokes from |
|---|---|
| `/claude-tweaks:wrap-up`'s Review Console (`wrap-up/review-console.md`) | a single-record run — just before its `## Present the console` |
| `/claude-tweaks:flow`'s consolidated multi-spec console (`flow/multispec-review-console.md`) | a dispatched **bundle**'s run, whose per-spec consoles deferred — just before its `## Present the consolidated console` |

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
2. **This run resolved to `pending-review`** — the console is about to render for a human. A
   `failed` or `blocked` outcome never reaches a console at all (`/claude-tweaks:flow` stops at the
   HARD-GATE, and `dispatch/settle-and-merge.md`'s Settle procedure handles it there), and the
   auto-merge short-circuit's merge path returns before this point, so an `auto:merge`'d group
   never lands here either. Never push or open a PR for a `failed` or `blocked` outcome — an
   incomplete or broken branch on origin is noise, not signal.
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

`{n}` is the record number, read from the materialized header's `record:` field
(`${RUN_DIR}/work/{n}-spec.md`); `{record title}` comes from `gh issue view {n} --json title -q .title`.

**A bundle's run holds more than one record and still gets exactly one PR** — one branch, one push,
one review surface. Use the **lowest-numbered** record for both `{n}` and `{record title}`, and list
every record in the body as one `Refs #{m}` line each. Never `Fixes`/`Closes` there: the branch
already carries its own closing-keyword carrier commit (`wrap-up/cleanup-procedures.md` Section C
step 2), and a closing keyword in a PR body would close records on the merge of a PR nobody has
reviewed.

**Leave the PR unassigned.** No convention for who reviews dispatch-originated PRs exists in this
repo; inventing one here would be a guess with a person's name on it.

**If `gh pr create` fails, retry it once.** If the retry also fails, stop — the branch is already on
origin, so the durability goal is met. Record the failure per Step 5, log, and continue to the
console:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR creation FAILED twice ({reason}); open one by hand. Reversibility: high.`

On success:

`AUTO {time} — Pending-review durability: pushed {branch} to origin; draft PR {url} opened against {integration-branch} for #{n}. Reversibility: high (close the PR; the branch on origin is additive).`

## Step 5: Record the outcome where the Verification Brief will find it

Every branch above — success, existing PR, skipped PR, push failure, PR failure — writes one file at
the run directory's **root**:

```
{run-dir}/pending-review-durability.md
```

**Root, never `staged/`.** Both consoles classify any file in `staged/` carrying a
`Title:`/`Type:`/`Labels:` header as a queue write (`Q#`) needing its own per-item approval; a
status note is neither a proposal nor a work record.

The file is exactly these three lines, with no heading:

```
push: ok | failed — {reason}
pr: {url} | existing {url} | failed — {reason} | skipped — {reason}
branch: {branch} -> {integration-branch}
```

`wrap-up/verification-brief.md`'s Step 4 reads this file and renders a `### Branch` section from it,
so a push or PR-open failure reaches the human in the same comment that carries the brief — never
only in a log nobody opens.
