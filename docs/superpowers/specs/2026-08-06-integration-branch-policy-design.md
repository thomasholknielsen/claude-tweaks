# Integration branch as a policy lever, and policy.yml as the single config home

**Date:** 2026-08-06
**Status:** Approved, pending plans
**Origin:** Follow-up to #132 (routine templates audit the GitHub default branch). Generalizes that fix; absorbs a config-consolidation pass requested during design.

## Problem

Four independent places in this plugin resolve "which branch represents this project's current
state," each by a different mechanism, and all four collapse onto GitHub's default-branch
pointer. On a repo whose active development branch is not its GitHub default — a
`dev` → `staging` → `main` model — every one of them is wrong, and each fails differently:

| Concept | Site | Resolution today | Failure mode |
|---|---|---|---|
| **Audit** — which tree gets judged | `skills/*/routine-template.yml` preamble | `git remote show origin` | Fixed in #132 via `routine.branch` |
| **Fork point** — what a task branches from | `worktree.baseRef` (harness), verified in `build/worktree-setup.md`, `flow/validation.md` | `fresh` = `origin/<default>` | Silently forks from the wrong branch; `/build` Step 0 catches it and offers a fix |
| **Merge target** — where finished work lands | `dispatch/settle-and-merge.md`, `wrap-up/review-console.md` | `git remote show origin` / `gh api default_branch` | Guard aborts. **Fails safe** — never merges, never auto-merges |
| **Diff baseline** — what blast radius is measured against | `assess-agent-autonomy` merge-check | `git merge-base "$DEFAULT_BRANCH" HEAD` | **Fails unsafe** |

The diff-baseline row is the one nobody reported. `merge-check` sizes a record's change by
diffing against the merge base with the default branch. When that branch diverged long ago, the
merge base is ancient and the diff contains every commit on the active branch since the fork —
not the record's own change. Blast radius returns enormous, the verdict is `needs-human`, and the
stated reason is "too many files changed." Auto-merge can never fire, and the log looks like the
gate working correctly. Same shape as #132: not an error, a confident answer about the wrong tree.

GitHub's "default branch" is a *display* fact — which branch the repo opens on, and where issue
auto-closing works. Nothing ever told the plugin that a project's integration branch might differ.

## Decisions

### It is one fact, not four

All four sites ask the same question with different verbs: read it, start from it, add to it,
compare against it. One key covers all four.

**Rejected — separate audit and integration branches.** Considered "routines audit `main` because
that's production; agents land on `dev`." It does not hold for this plugin: the health sweeps file
issues *to be fixed*, and fixes land on the integration branch. Auditing a different branch files
issues describing code nobody will edit, against a tree the fix cannot be verified on. That is
#132 restated, not a valid alternate configuration.

**Rejected — derive it, don't configure it.** "Merge back to wherever you forked from" needs no
key and is elegant. Two things kill it. First, the setting controlling where a task starts
(`worktree.baseRef`) *defaults to the GitHub default branch*, so under the default you fork from
the wrong branch and dutifully merge back to it — the bug relocates to where it is harder to see.
Second, the plugin **cannot set that setting**; it lives in the harness's `settings.json` and
`/init` can only ask the user to edit it. Unattended auto-merge must not depend on a value the
plugin cannot guarantee. The other derivation — "whatever branch the main checkout is on" — is
worse, because that branch changes underfoot when a concurrent session switches it, which is
precisely why the abort guard exists.

**Rejected — four keys.** Four chances to set inconsistently, for a distinction with no
demonstrated use.

### Naming

`integration-branch`, flat rather than dotted. Dotted names in this repo group a namespace
(`worktree.always`, `harness-health.*`); this is a standalone fact, matching `git-strategy` and
`work-links`. Defined everywhere it appears as: *the branch where finished work lands and new work
starts.*

`active-branch` / `project-branch` were considered and rejected — both read as "the branch I am on
right now," which is the wrong idea and names the volatile thing the design deliberately avoids.

### Rename before ship, do not alias

`routine.branch` shipped in commit `cd4e325a` but **6.39.0 is unpushed**. It is renamed to
`integration-branch` before release, so no key ever ships under a name we would immediately
deprecate. This avoids a compatibility path, which CLAUDE.md's `[IL-85]` requires an expiry for.

The *instantiated record* field stays `branch:` — it records what was substituted into one
routine's prompt, not the project-level policy, and the two should not share a name.

### policy.yml is the only config home

Requested during design, accepted. `.claude-tweaks/policy.yml` becomes the single source for every
policy lever; CLAUDE.md stops being read.

**Silently dropping support is not acceptable** — a project with keys in CLAUDE.md would see them
stop applying with no error, defaults silently taking over. That is the same failure shape as
#132. So the consolidation ships with detection and an offered migration.

## Design A — the `integration-branch` lever

### The key

| Field | Value |
|---|---|
| Key | `integration-branch` |
| Home | `.claude-tweaks/policy.yml` only |
| Type | string, non-empty, no internal whitespace (`policy-schema.js`'s `string` type, added in `cd4e325a`) |
| Default | unset — each consumer keeps its current GitHub-default behavior |
| Meaning | The branch where finished work lands and new work starts |

### Shared resolution fragment

The ladder currently sits inside `routine/create-and-update.md` as Step 5.5. With five consumers it
moves to **`skills/_shared/integration-branch.md`**, cited rather than restated — the existing
convention, and the thing that prevents the sites drifting apart again.

Resolution order, first match wins:

1. An explicit argument — `--branch`, or merge-check's existing `--base <ref>`
2. `integration-branch` in `.claude-tweaks/policy.yml`
3. A branching model stated unambiguously in CLAUDE.md prose ("development happens on `dev`").
   A section merely *naming* several branches resolves nothing — fall through rather than guess
4. Git: current branch checked against the GitHub default, **discarding the current branch when
   the session is inside a linked worktree** (`git rev-parse --git-dir` ≠ `--git-common-dir`),
   where it is a throwaway isolation branch that will not exist later
5. Nothing resolved → **per-consumer fallback**, since they degrade differently. A routine
   substitutes prose telling the cloud agent to resolve the branch itself; merge-check, the merge
   target, and the fork point each keep the exact GitHub-default lookup they use today. In every
   case the unresolved path reproduces current behavior, so a project that sets nothing sees no
   change from either plan

Two changes from the routine-only version: the template-level `branch:` pin stays a routine-only
rank (it is specific to routine templates), and rank 5 becomes per-consumer rather than a single
prose fallback.

Note that rank 3 remains a CLAUDE.md read. This does not contradict Design B: B removes CLAUDE.md
as a *config key* store; rank 3 reads project *prose*, which is documentation, not configuration.

### Consumers

| Site | Change |
|---|---|
| `routine/create-and-update.md` | Cites the shared fragment; key renamed. The `{{TARGET_BRANCH}}` preamble checkout is unchanged — see "Routines and branches" below for why it is the only available mechanism |
| `dispatch/settle-and-merge.md`, `wrap-up/review-console.md` | Resolve the integration branch for the merge target and the push. **Keep the existing guard, retargeted** — its real job is catching a concurrent session switching the shared checkout, which stays valuable; it simply stops firing spuriously on a dev-model repo |
| `assess-agent-autonomy` merge-check | `MERGE_BASE` computed against the integration branch. The fails-unsafe fix. `--base <ref>` stays highest precedence |
| `build/worktree-setup.md`, `flow/validation.md` | `EXPECTED_BASE` = integration branch when set, else today's derivation. Turns an ambiguous mis-fork warning into one naming both branches |
| `init/bootstrap/step-06-worktree-configuration.md` | When `integration-branch` is set and differs from the GitHub default, `worktree.baseRef: head` becomes **required**, not recommended — under `fresh`, every task forks from the wrong branch |

**Not changed:** `flow/worktree-merge.md` merges into whatever the main checkout is on and leaves
pushing to the user. It is interactive, a mismatch is visible, and it is already correct on a
dev-model repo by not asking the question. Adding a gate to the one correct path is not an
improvement.

### Routines and branches — verified against the live API

Checked by calling `RemoteTrigger {action: "list"}` against the real account:

- A trigger's git source accepts **only a URL**:
  `"sources": [{"git_repository": {"url": "https://github.com/memenu-io/memenu-app"}}]`.
  No branch, ref, or revision field appears on any live trigger. The container's *starting* branch
  comes from the **environment**, configured in the claude.ai UI, which no API reaches. The
  preamble checkout is therefore the only mechanism available, not a workaround chosen over a
  better option. (Absence across live triggers is not proof the API would reject such a field;
  it is proof nothing sets one today.)
- There *is* a branch anchor on the other end. Live health routines carry
  `"outcomes": [{"git_repository": {"git_info": {"branches": ["claude/stoic-babbage"], ...}}}]`
  alongside `autofix_on_pr_create: false` — an auto-generated output branch where a cloud
  session's work lands. Inert for the four report-only sweeps, which file issues rather than push
  code. Material for `/dispatch`, which merges and pushes — but unreachable today, since dispatch
  hard-gates on the `gh` CLI, absent from cloud sandboxes (#61). Recorded as a known unknown.
- `memenu-app-code-health-daily` and `memenu-app-harness-health-daily` are both live, enabled, and
  still carry the **pre-#132 preamble verbatim**. The frozen-copy problem in production, not in
  theory. They are the first re-provisioning targets.
- The response carried `has_more: true` with no way to request page 2 (`[IL-67]`), so the set of
  routines needing re-provisioning **cannot be enumerated**. Guidance must not claim completeness.

## Design B — policy.yml consolidation and migration

### Scope

The levers carrying a CLAUDE.md path today fall into three groups (measured against
`_shared/policy-schema.md` on 2026-08-06):

- **Dual-home, "CLAUDE.md also honored"**: `routine.branch` (added today, renamed by Design A),
  `dispatch-retry-ceiling`, `automerge-max-lines`, `automerge-max-files`, `work-links`,
  `unattended-tier`
- **Dual-home, other phrasing**: `auto-mode` ("policy.yml or CLAUDE.md"), `scope-creep` and
  `tidy-aggressiveness` ("CLAUDE.md legacy fallback")
- **CLAUDE.md-only, no policy.yml path documented**: `depth-survey`, `creative-survey`,
  `backlog-fetch-limit`, `promise-register-min-leaves` — each needs one

Six skill lines perform the dual `grep CLAUDE.md .claude-tweaks/policy.yml` read, across
`wrap-up/unblocked-records.md`, `dispatch/settle-and-merge.md`, `dispatch/SKILL.md`,
`routine/create-and-update.md`, and `assess-agent-autonomy/SKILL.md` (×2).

**The convention is already applied inconsistently**, which is independent evidence for
consolidating: `merge-sensitive-paths` is documented as `policy.yml`-only, yet
`assess-agent-autonomy` greps CLAUDE.md for it.

### Behavior

1. Every dual-read site reads `.claude-tweaks/policy.yml` alone.
2. The four CLAUDE.md-only levers get a documented policy.yml path. *(Open question: whether all
   four deserve one, or some should be retired instead — resolve at plan time.)*
3. `auditPolicy()` in `bin/lib/policy-schema.js` gains a third return field beside
   `unrecognizedKeys` and `invalidValues`: recognized policy keys found in CLAUDE.md, reported as
   needing migration. This inverts today's behavior — CLAUDE.md is currently *validated*; it
   becomes *flagged*.
4. `/claude-tweaks:init` offers to auto-migrate: move the flagged keys into `policy.yml` and strip
   them from CLAUDE.md, behind its own confirm.

**Auto-migration constraints.** CLAUDE.md is the file users hand-tune most. The migration removes
only exactly-matched key lines, never reflows or rewrites surrounding prose, and always shows a
diff before applying.

## Verification

Most of Design A is skill prose with nothing mechanical to assert. Three things are real:

1. **Policy key tests** — `integration-branch` recognized, typed, no default; rename from
   `routine.branch` reflected in `POLICY_KEYS` and its count assertion.
2. **Migration detector tests** — ordinary unit tests over `auditPolicy()`'s new return field:
   a key in CLAUDE.md is flagged; the same key in policy.yml is not; a key in both resolves to
   policy.yml and still flags the CLAUDE.md copy.
3. **No-new-resolvers tripwire** — a test grepping every `skills/**/*.md` for `default_branch` or
   `remote show origin`, requiring each hit to cite `_shared/integration-branch.md` or sit in an
   allowlist with a stated reason. This is what would have caught the original divergence: four
   sites answering one question four ways, with nothing objecting. Same shape as the existing
   anti-pattern row-count tripwire. *(Open question: whether the allowlist earns its maintenance,
   or whether failing loudly on every hit is better — resolve at plan time.)*

**Explicitly untested:** whether each consumer's prose correctly *uses* the resolved value. The
tripwire proves citation, not correct consumption.

## Sequencing

Two plans from this one document, sequenced, both in 6.39.0:

- **Plan A** — the `integration-branch` lever. Self-contained; works whether or not B lands.
- **Plan B** — policy.yml consolidation, detector, auto-migration.

Commits layer on top of `cd4e325a` rather than amending it, so history reads: fixed the reported
bug → generalized it → consolidated config. If B proves larger than estimated, dropping it still
leaves a shippable release.

**Version:** 6.39.0, unshipped, now a larger minor. Its CHANGELOG entry is rewritten to cover all
three pieces rather than #132 alone.

## Risks and known unknowns

1. **Dispatch-in-cloud output branches** — unreachable today (no `gh` in cloud sandboxes), so left
   unresolved rather than guessed at. Revisit whenever dispatch-in-cloud is solved.
2. **`worktree.baseRef` stays harness-owned.** The plugin can require `head` and detect a wrong
   fork, but cannot set it — `/init` can only ask. A project that declines still mis-forks every
   task, with `/build` Step 0's check as the only backstop. A real residual hole this design does
   not close.
3. **Auto-migration edits CLAUDE.md.** Mitigated by exact-line removal and a shown diff, but it
   remains the riskiest write in either plan.
4. **Routine re-provisioning cannot be enumerated** (`has_more`, no cursor). Per-project
   `.claude-tweaks/routines/*.yml` records are the reliable path; guidance must not imply
   completeness.

## Deliberately out of scope

- **Per-record branch override** (a hotfix landing somewhere other than the integration branch).
  Real in gitflow, not needed yet; the extension point is a `branch:` field on the work record.
- **`flow/worktree-merge.md`** — see Design A's "Not changed."
- **A GitHub-MCP fallback for dispatch** (#61's items 1-2) — a separate, larger problem.

## Open questions for plan time

1. Do all four CLAUDE.md-only levers deserve a policy.yml path, or should some be retired?
2. Does the tripwire's allowlist earn its maintenance, versus failing loudly on every hit?
