# Non-default-branch issue tracking workflow — Design

## Problem

GitHub's native `Fixes #N` / `Closes #N` keyword parsing only fires when the
referencing commit lands on the repository's **default branch**. Projects
whose workflow lands fixes on an integration branch first (`dev`, `staging`,
a feature branch) before they reach the default branch get no signal from
GitHub at all — the issue sits open, with nothing recording that it has
already been fixed somewhere. There is no repo setting to extend
keyword-parsing to other branches, and changing the default branch itself
would be a disproportionate fix (it also drives new-PR base, branch
protection defaults, and GitHub Pages source).

A true auto-close on non-default branches would also be semantically wrong
for teams that read issue-closed as "shipped to production" — closing the
moment something lands on `dev` breaks that signal.

## Solution

Ship a GitHub Actions workflow that **labels and comments** on non-default
branches (making the fix visible and trackable) and **cleans up** once the
fix reaches the default branch and GitHub closes the issue natively. The
plugin's `gh issue close` is never called directly — the default branch
merge remains the sole closing action, consistent with claude-tweaks'
existing "close-via-merge" rule (`_shared/issue-claims.md`,
`_shared/auto-mode-contract.md` "Never-reversible").

### Workflow: `.github/workflows/track-issue-fixes.yml`

Two jobs, both triggered on `push`, differentiated by comparing
`github.ref` against `github.event.repository.default_branch` using the
standard `format()` idiom (GitHub Actions expressions have no string
concatenation operator) — no hardcoded branch name, works regardless of
what the default branch is called:

```yaml
if: github.ref != format('refs/heads/{0}', github.event.repository.default_branch)
```

**Job 1 — `label-fix-branch`** (`if:` the expression above, unnegated form
below for Job 2)

1. Scan the pushed commits' messages (`github.event.commits[*].message`)
   for GitHub's own closing-keyword grammar: `close(s|d)`, `fix(es|ed)`,
   `resolve(s|d)` (case-insensitive) followed by `#<N>`.
2. For each matched issue number:
   - Sanitize the branch name for label use (`/` → `-`, lowercased).
   - `gh label create "fix-on-<branch>" --color FBCA04 --description
     "Fixed on <branch>, not yet on the default branch" || true` — idempotent,
     tolerates "already exists". Color matches GitHub's own default
     yellow-ish "in progress / pending" tone, distinct from red (bug) or
     green (done) labels already common in most repos.
   - `gh issue edit <N> --add-label "fix-on-<branch>"`.
   - `gh issue comment <N> --body "Fixed by <sha> on \`<branch>\`. Will
     close automatically once this reaches the default branch."`
3. A failure on one issue (bad reference, deleted issue, etc.) must not
   fail the whole job — wrap each issue's handling so remaining issues in
   the same push still process.

**Job 2 — `cleanup-fix-labels`**
(`if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)`)

1. Same keyword scan against the pushed commits.
2. For each matched issue number, fetch its current labels and remove every
   label matching `fix-on-*` (there may be more than one, if the fix landed
   on multiple integration branches before reaching default). No explicit
   close call — GitHub's native parser closes the issue on this same push.

### `/init` integration — Step 0.97

Placed after Step 0.96 (Routine Installation), same shape as Step 0.45's
`agent-task.yml` offer:

- **Gate:** project has a GitHub remote (`git remote get-url origin`
  matches `github.com`) — same check Step 0.45 already uses.
- **Idempotency:** check whether `.github/workflows/track-issue-fixes.yml`
  already exists; if so, skip the offer silently (no re-prompt on re-run).
- **Prompt:** explain the gap in plain terms (GitHub only closes on
  default branch; fixes landed elsewhere lose the signal) and offer to
  write the workflow file.
  ```
  1. Yes — write .github/workflows/track-issue-fixes.yml (Recommended)
  2. Skip — I'll handle issue tracking manually
  ```
- **No CLAUDE.md flag.** Unlike `design-integration`/`diagram-integration`,
  nothing else in the plugin needs to check a runtime switch for this
  feature — the workflow runs entirely inside GitHub Actions, independent
  of any Claude Code session. The file's presence on disk is the on/off
  state, checked directly by the idempotency step above.
- **Failure handling:** if writing the file fails (e.g. permissions),
  surface the failure and continue `/init` — never abort on this step.

### Doc touch-up

Add a one-line cross-reference in `skills/flow/from-code-health.md`'s
existing "Close-via-merge" section (Step 5), pointing to this companion
workflow, so a reader of the close-via-merge mapping is aware the
non-default-branch gap has a fix available via `/init`.

## Out of scope (YAGNI)

- Cross-repo issue references (`owner/repo#N`).
- Full-URL issue references (`https://github.com/.../issues/N`).
- Squash-merge commit-message edge cases — this workflow scans commit
  messages exactly the way GitHub's own keyword parser does, so it
  inherits whatever GitHub already does or doesn't handle for squashed
  merges. Not a new limitation introduced here.
- Per-project configuration of which branches are "tracked" — every
  non-default branch is in scope, per the trigger-scope decision below.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Pattern | Label-on-push, close-on-main (not true cross-branch auto-close) |
| Placement | New `/init` bootstrap step (not a `/flow` extension, not a standalone skill) |
| Trigger scope | Any non-default branch (not a single named branch, not commit-author-scoped) |
| Label/comment | Per-branch label (`fix-on-<branch>`) + a commit-linking comment |
| Cleanup | Strip `fix-on-*` labels when the issue closes via default-branch push |

## Testing / verification approach

GitHub Actions workflows can't run under `node --test`. Verification is:

1. A unit test (Node, no network) for the pure keyword-extraction function
   (given a list of commit messages, return matched issue numbers) —
   extracted into a small `bin/lib/` helper so the regex logic is testable
   without hitting the GitHub API, mirroring how `bin/lib/issues/ingest.js`
   already isolates pure logic from `gh` calls elsewhere in the plugin.
2. YAML validity of the generated workflow file (parse-check, not a live
   Actions run).
3. Manual note in the PR description: this cannot be exercised end-to-end
   without pushing to a real GitHub repo with Actions enabled — call this
   out explicitly rather than claiming full verification.
