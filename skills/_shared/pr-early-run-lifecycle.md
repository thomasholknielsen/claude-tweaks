# PR-Early Run Lifecycle — draft PR at run start, phase-checklist updates

Canonical procedure for making a `pr-first` (`_shared/integration-model.md`) pipeline run
**born public**: a draft PR opens immediately after the worktree exists and the materialize
commit lands, before any implementation work — not only when a run happens to reach
`pending-review` (`docs/incident-log.md`'s `[IL-128]` records the narrower, dispatch-only
procedure this generalizes and replaces). Every later phase exit pushes
(`_shared/git-discipline.md`'s Phase-exit push section) and updates the PR's phase checklist, so
the PR always reflects live progress rather than only the state as of run start or only the state
as of `pending-review`.

`local-merge` runs (`_shared/integration-model.md`) skip this file entirely — today's no-PR
lifecycle, unchanged.

## Callers

| Caller | Invokes from |
|---|---|
| `build/worktree-setup.md` Step 6 | Once per run, immediately after `build/SKILL.md` Spec Step 1's materialize commit, before Spec Step 2 |
| Each phase's skill file (build, test, review, polish, wrap-up) | At its own phase exit — see "Phase-checklist update" below |

## Run start: push, then open (or reuse) the draft PR

### Step 1: Resolve identity and check for an existing PR

Resolve `{owner}/{repo}` once: `gh repo view --json nameWithOwner -q .nameWithOwner`. Then check
`run-state.json`'s own `pr` field first (a resumed run already recorded one) — if present, skip
straight to "Resume: reconcile a recorded PR" below instead of re-deriving from scratch.

No recorded `pr` field: check GitHub directly before creating anything, so a resumed or retried
run against the same branch never duplicates:

```bash
gh pr list --repo {owner}/{repo} --head {branch} --state all --json number,url,state,isDraft
```

- **A match with `state: OPEN`** (draft or not): reuse it. Record via `record-pr` (below) and
  skip PR creation. **Never flip an already-non-draft open PR back to draft** — log the reuse and
  move on.
- **A match with `state: CLOSED`**: this is a retry — by construction, nothing else in this
  design closes a run's PR except `_shared/pr-run-comments.md`'s failure tombstone (a prior
  attempt's HARD-GATE failure). Reopen it rather than starting fresh, so the new attempt's
  comments land in the same thread as the prior failure(s):

  ```bash
  gh pr reopen {number} --repo {owner}/{repo}
  ```

  **Reopen succeeds:** record via `record-pr` and skip creation, same as the OPEN branch above.
  Log: `AUTO {time} — PR-early run lifecycle: reopened PR #{number} for retry. Reversibility: high.`

  **Reopen fails** (the branch was force-pushed out from under it, or some other state GitHub
  rejects): fall through to creation below. The fresh PR reuses the same title/body template;
  its new number/url overwrites the stale one via `record-pr` (Step 4), and — only if a pointer
  comment already exists on the issue from an earlier attempt that reached far enough to post one
  (Verification Brief routing, `_shared/pr-run-comments.md`) — update that pointer comment to the
  new PR via the same find-and-update-by-marker shape, since it would otherwise link to a closed,
  now-orphaned PR. A failed HARD-GATE run never reaches the brief, so this update is usually a
  no-op — stated for the rare case a later phase's own failure follows an earlier phase's partial
  progress.
- **A match with `state: MERGED`**: this branch's PR already merged — the record is done. Treat
  as no match and fall through to creation; a fresh run against an already-merged branch is an
  unexpected precondition this file does not need to specially handle beyond not erroring.
- **No match**: fall through to creation.

### Step 2: Push the branch

```bash
git -C "{worktree-path}" push origin {branch}
```

Its own Bash call — never chained (the `worktree-always` gate denies a compound command whole,
same as every other push in this plugin).

**On failure** (network, auth, no `origin` remote, rejected non-fast-forward): stop here. Log to
`decisions.md`:

`AUTO {time} — PR-early run lifecycle: push of {branch} to origin FAILED ({reason}); run proceeds local-only, no PR opened. Reversibility: n/a.`

The run continues exactly as a `local-merge` run would — this is a degrade, never a block. The
next phase's own phase-exit push (`_shared/git-discipline.md`) naturally retries.

### Step 3: Compose the body and create the draft PR

Skipped when Step 1 found a reusable open PR. Otherwise, compose:

```markdown
<!-- claude-tweaks-run: {run-id} -->

### Spec summary

{one-paragraph summary from the materialized spec's Overview section}

### Phases

<!-- phases-start -->
- [ ] build
- [ ] test
- [ ] review
- [ ] polish
- [ ] wrap-up
<!-- phases-end -->

### Resume

`PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" {next-step}`

Fixes #{n}
```

The `<!-- claude-tweaks-run: {run-id} -->` marker is the **first line**, unconditionally — it is
the GitHub-side signal the sweep (`sweep-backstop` sub-issue) and the reconciler
(`bin/lib/reconcile`) key on to recognize a plugin-created PR without a local run-dir join. Never
omit it, even when composing by hand.

**Phase checklist rows are delimited by `<!-- phases-start -->`/`<!-- phases-end -->` HTML
comments** so the phase-checklist update procedure below can re-compose reliably (read body,
replace only the content between the markers, write back) instead of parsing prose. Start every
row unchecked — `- [ ] {phase}` — even for steps this run's step-list argument will skip (e.g.
`no-polish`); a skipped phase's row is removed at that phase's own would-be exit rather than
predicted at creation, since Step 1's own step-list resolution can still change before then in
`interactive`/`hybrid` mode.

Omit a `polish` row when the record's `surface:` is `backend` (polish never runs) — the same
frontend/backend split `flow/steps-and-gates.md`'s own polish decision tree already makes; don't
duplicate that logic, just skip the row when it will never happen.

**One `Fixes #{n}` line per record.** A single-record run gets one line. A dispatch bundle
(`dispatch/SKILL.md`'s file-overlap grouping) enumerates every record from the parent
`manifest.yml`'s `specs[].id` list and lists one `Fixes #{m}` line per record. Unlike the retired
dispatch-only durability procedure this file replaced (`docs/incident-log.md`'s `[IL-128]`),
whose PR opened only when a run already reached `pending-review` (i.e. after `review`'s gate
already passed) and used `Refs`, this PR opens **before any gate has run**, and it stays in
draft the whole time gates are still pending — GitHub blocks merging a draft by default, so
`Fixes` sitting inert in a draft body is safe. It only becomes live once the merge-path sub-issue
marks the PR ready after gates pass. A human force-merging a draft mid-run is accepting ungated
work; that risk is stated once here, not re-litigated at every call site.

`{target}` and `{next-step}` in the Resume line: `{target}` is the same record reference(s) this
run was invoked with (`#{n}` or the bundle's comma-joined list). `{next-step}` is the step this
run is *about* to execute — `build` at run start, since this procedure runs before any phase.

Write the body to `/tmp/pr-early-body-{n}.md`, then:

```bash
gh pr create --repo {owner}/{repo} --draft --base {integration-branch} --head {branch} \
  --title "{record title} (#{n})" --body-file /tmp/pr-early-body-{n}.md
```

`{record title}` — the lowest-numbered record's title for a bundle; `{n}` likewise the
lowest-numbered record.

**If creation fails, retry once.** If the retry also fails: log and continue local-only, same
message shape as the push-failure log above (`reason` naming the `gh pr create` failure). The
branch is already on origin from Step 2 either way.

### Step 4: Record the PR

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-pr {number} {url}
```

Writes `run-state.json`'s `pr: { number, url }` field through the sanctioned write path — the
same `record-worktree`/`close-run` precedent (CLAUDE.md's Hooks section: run-state is written
only through `hooks.js` verbs). Resolves the target run dir the same way `record-worktree` does
(`--run "$RUN_DIR"` explicit, or the fallback resolver) — pass `--run` explicitly here too, for
the same reason `build/worktree-setup.md` Step 4.5 already states: a stale never-closed run
elsewhere in the project can otherwise win the fallback resolution.

## Resume: reconcile a recorded PR

A resumed run (`run-state.json.pr` already set from an earlier phase of the same run) re-verifies
before trusting the recorded value — the PR could have been closed or the branch force-pushed
out from under it since:

```bash
gh pr view {recorded-number} --repo {owner}/{repo} --json state,isDraft,url
```

- **Still open**: nothing to do — proceed to whichever phase this resume targets.
- **Closed or gone** (404): the recorded PR is stale. Fall through to Step 1's `gh pr list --head`
  check above — reuse a different open PR for the branch if one exists, otherwise create a fresh
  one (Step 3) and re-`record-pr` (Step 4) to overwrite the stale value. Log:

  `AUTO {time} — PR-early run lifecycle: recorded PR #{old} no longer open; {reused #{new} | created #{new}}. Reversibility: high.`

## Phase-checklist update (every phase exit)

At each phase's own exit (build, test, review, polish, wrap-up — after that phase's own
phase-exit push, `_shared/git-discipline.md`), check `run-state.json`'s `pr` field:

- **Not set** (push at run start failed, or this is a `local-merge` run): skip entirely — no PR
  to update.
- **Set**: read the current body, flip that phase's checklist row from `- [ ] {phase}` to
  `- [x] {phase}` between the `<!-- phases-start -->`/`<!-- phases-end -->` markers only, leaving
  everything else in the body untouched, then:

  ```bash
  gh pr edit {number} --repo {owner}/{repo} --body-file /tmp/pr-checklist-{n}.md
  ```

  Compose-then-write-once — read, patch the checklist section in memory, write the whole body
  back in one call. Never a partial/streaming edit.

**Best-effort, like the phase-exit push it follows.** A failed `gh pr edit` logs a warning to
`decisions.md` and the phase continues — the next phase's own checklist update naturally
re-flips every row still unchecked from prior phases, since it reads the live body fresh each
time rather than tracking a local diff.

## Skip / degrade behavior

| Condition | Behavior |
|---|---|
| `integration-model: local-merge` | Skip this entire file — today's no-PR lifecycle. |
| Push at run start fails | Local-only run, logged warning (Step 2 above), continue. Every later phase-exit push retries naturally. |
| `gh pr create` fails twice | Local-only run (branch already pushed), logged warning, continue. |
| `gh` absent | Same degrade as a push/create failure, distinguished reason: `_shared/github-write-transport.md`'s CRUD mapping carries no pull-request row, so there is no MCP fallback to attempt for PR creation (unlike issue operations, which do have one). Log `reason: gh-absent — no MCP fallback for pull requests`. |
| `gh` absent at merge time (`_shared/pr-first-merge.md` Step 2.5) | The `merge-verification` lever is unenforceable without `gh` — proceed as `off` and disclose it at **warn** tier in the run summary (a visible line, not a silent log entry): `merge-verification: {resolved} unenforceable — gh absent; proceeded as off`. Same no-MCP-fallback reason as the row above. |
| Offline / no `origin` remote | Same degrade path as any push failure — `_shared/forge-detection.md` would already have resolved `local-merge` for a no-remote project, so this case is specifically "remote configured but unreachable right now." |

None of these ever block the pipeline — a pr-first project whose GitHub connectivity is degraded
for one run behaves exactly like a `local-merge` run for that run, with the degradation logged
rather than silent.
