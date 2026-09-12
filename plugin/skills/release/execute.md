# Execute and Verify — Steps 5–6

Read by `/claude-tweaks:release` Steps 5 and 6. Every branch below routes on the `engine` value the preflight fact pack carries (`{run-dir}/release-preflight.json`, read once at Step 1) — `pr-first` dispatches to release-please's open PR, `local-merge` dispatches to `bin/release-local.js`. `_shared/integration-model.md` is canonical for that resolution and its Consumer table lists this file's Step 5/Step 6 dispatch; the value is **never** re-detected here, because a second probe mid-run can split one release across two engines.

Execution and verification live in one file because they are engine-specific in exactly the same way: what Step 5 ran decides what evidence Step 6 can look for.

## Inputs

- The pack's `engine`, `releasePr`, `branch`, `hook` and `lastTag` fields; the run directory resolved at Step 0; `$RUN_ROOT` (the main checkout, per `_shared/pipeline-run-dir.md`'s Anchoring section — never the worktree cwd).
- The arguments `--dry-run` and `--as {version}`, and Step 4's verdict that no HARD-GATE fired (a gated run never reaches this file).

### Two versions

**The gating version** is `--as` when given, otherwise `proposedVersion.value.version`. It is what Step 4 rendered and what the major-bump HARD-GATE measured. Nothing after Step 5 verifies it.

**The shipped version** is the engine's own, read back from the engine after it returns:

| Engine | Where the shipped version is read |
|---|---|
| `local-merge` | The `released v{version}` line on the engine's **stdout** (exit `0`). On exit `5` the same number is in the stderr line's `partial: v{version} is committed, tagged…` prefix. |
| `pr-first` | The `X.Y.Z` in the merged release PR's `chore(main): release X.Y.Z` title — re-read after the merge with `gh pr view {releasePr.value.number} --json title`, never carried over from Step 1's pack. |

The pack **proposes**; the engine **decides**. A sibling release landing between Step 1 and Step 5, or a `release-please-config.json` setting the pack does not read, can move the number.

**Reconcile the two once, immediately after the engine returns** (before Step 6 runs a single probe):

- Equal → silent, no log line.
- Different, and `--as` was **not** given → log it, and the **shipped** version wins for Steps 6, 7 and 8. Step 8's summary names both.

  ```
  AUTO {HH:MM:SS} — Step 5: gating version v{gating} ≠ shipped version v{shipped} — the engine decided; v{shipped} is verified and booked. Reversibility: n/a.
  ```

- Different, and `--as` **was** given → the override did not take. Stop before Step 6; the outcome is `failed`, and nothing is booked:

  ```
  --as {gating} did not take — the engine shipped v{shipped}; recover: check the Release-As: commit reached {branch}, then re-run /claude-tweaks:release
  ```

Every `{version}` in Step 6, Step 7 and Step 8 below is the **shipped** version.

## Step 5: Execute

### `--dry-run`

**pr-first — a no-op.** Nothing is merged, nothing is tagged, no `Release-As:` commit is pushed. Log the line below, skip Steps 6 and 7, and go to Step 8 with the outcome `dry-run`:

```
AUTO {HH:MM:SS} — Step 5: dry-run — no merge, no tag. Effective version v{gating} would ship via pr-first. Reversibility: n/a.
```

**local-merge — run the engine's own dry run and render it.** The engine prints what only it knows: which manifest paths it would splice, the `release-hook` command it would run, a `manifest-drift:` warning when the manifest and the last tag disagree, and the full CHANGELOG section it would prepend. None of that is on Step 4's console, and a dry run that withholds it tells the operator less than the real run would:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js" --root "$RUN_ROOT" --dry-run
```

Render its stdout verbatim below the console, then skip Steps 6 and 7 and go to Step 8 with the outcome `dry-run`. A non-zero exit here is classified by the same table as a live run (below), though only its `nothing written`, `2`, `3` and `4` rows are reachable — the engine returns before any write under `--dry-run` — and a dry run that cannot even plan is a real finding, not a formality.

### pr-first

**Precondition — the release PR.** `releasePr.value` must be a PR object. When it is the string `none`, stop before touching anything and report:

```
no open release PR — release-please has not rendered one; check the workflow
```

**Transport.** `command -v gh` absent: `_shared/github-write-transport.md`'s CRUD mapping covers issue operations only and has no merge row — there is no MCP equivalent for merging a PR. Do not improvise one. Stop at the console and print the merge as a paste-ready command, the same posture the Review Console takes for an unrunnable action:

```
gh pr merge {releasePr.value.number} --squash
```

**`--as {version}` — push the override, then wait for the re-render.** release-please derives the PR from the commits it sees, so the override must reach the integration branch and be re-read before the PR is merged. Every git call is anchored to `$RUN_ROOT` — a bare `git commit` from a worktree cwd would put the override on the worktree's branch, where release-please will never see it. Assert the anchor is on the integration branch first:

```bash
git -C "$RUN_ROOT" rev-parse --abbrev-ref HEAD    # must equal {branch}; anything else → failed, no commit
git -C "$RUN_ROOT" commit --allow-empty -m "chore: release {version}" -m "Release-As: {version}"
git -C "$RUN_ROOT" push origin {branch}
```

`{branch}` is the pack's own `branch` field. A **rejected push** (non-fast-forward, protected branch, permissions) is `failed`: report `git`'s stderr verbatim and stop with no poll — the override never reached origin, so there is nothing for release-please to re-render and waiting five minutes would only delay the same answer.

Once the push lands, poll for the re-render — `gh pr view {n} --json title,headRefOid` every 20 seconds, at most 15 attempts (5 minutes). Re-rendered means the PR **title** carries `{version}`; `headRefOid` is read in the same call so a moved head is visible rather than inferred:

```bash
gh pr view {releasePr.value.number} --json title,headRefOid
```

Past the bound, **do not merge** — the open PR still renders the version the commits alone derived, and merging it would ship the wrong number. Log the line, report the named state, and stop:

```
override pushed, PR not re-rendered — release-please has not re-rendered PR #{n}; recover: wait for the release-please run, then re-run /claude-tweaks:release
```

The summary's outcome slot reads `failed`, not `PARTIAL`: `PARTIAL` asserts a release exists, and none does here. The `Release-As:` commit **is** on the integration branch, which is why the state is named rather than reported as a clean no-op — a second run must not push a second override commit.

**The PR-check gate — read the PR's own state before merging.** The console's `CI on tip` row does **not** cover this: `ciTip` is the integration branch's tip, and the console *renders* CI, it does not gate on it. The checks that matter here are the release PR's own. Resolve the lever from this run's config overlay, then read the PR:

```bash
MERGE_VERIFICATION=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "{run-dir}" --values merge-verification)
gh pr view {releasePr.value.number} --json state,mergeStateStatus,statusCheckRollup
```

Classify per `_shared/pr-first-merge.md`'s Step 2.5, in this order:

| Read | Action |
|---|---|
| The command failed, or the output is not parseable JSON with those three fields | `failed`, reason `state-read-failed`. Never merge on a state this gate could not read — a read failure is not "no CI". |
| `state: MERGED` | The release PR is already merged (a resumed run, or a hand-run merge). Skip the merge, read the shipped version from its title, and go to Step 6 — the tag and Release probes are the real evidence either way. This is a deliberate narrowing of Step 2.5's blanket "never merge a non-`OPEN` PR": here it is a resumable state, not a stop. |
| `state: CLOSED` | `failed` — the release PR was closed unmerged; release-please must render a new one. |
| Any `statusCheckRollup[]` entry with `conclusion` in `FAILURE`, `TIMED_OUT`, `ERROR`, `STARTUP_FAILURE` | **Do not merge.** `failed`, naming the failing check(s) by name. Under `merge-verification: off` the read still runs and the red classification is logged — `off` skips the *wait*, not the read — and `off` merges anyway, today's behavior. |
| Any entry with `status` not `COMPLETED`, or an empty rollup under `merge-when-green`/`wait` | **Pending.** Wait on Step 2.5's bounded watch (15 minutes, fixed — poll `gh pr checks {n}` and key on its exit code: `0` green, `1` a check failed → the red row above, `8` still pending). Still pending at the bound → `failed`, reason `checks still pending`. |
| Empty rollup under `off` | No CI — green. |
| Every entry `SUCCESS`/`NEUTRAL`/`SKIPPED`, or lever `off` | Green → merge. |

**The release merge never arms `--auto`.** Step 2.5's `merge-when-green` arming path is deliberately not taken here: `--auto` returns before the merge happens, and Step 6 must verify the tag, the Release and the hook **inside this run**. A run that armed and returned would report on a release that had not occurred yet. Pending checks therefore wait or fail; they never arm.

**Merge.** One call, the immediate `--squash` form of `_shared/pr-first-merge.md`'s Step 3:

```bash
gh pr merge {releasePr.value.number} --squash
```

No `-t`/`-b`: the release PR's subject is release-please's own `chore(main): release X.Y.Z`, and `bin/compose-subject.js` is not involved — this is the one pr-first merge site whose subject the engine owns.

| Result | Meaning |
|---|---|
| exit `0` | Merged → read the shipped version from the PR title, reconcile per `## Inputs`, then Step 6. |
| exit `0`, stderr `! Pull request … was already merged` | A no-op on an already-merged PR, not an error → same path as above. |
| non-zero exit | Nothing merged, nothing tagged. Report `gh`'s stderr **verbatim** and stop; the summary outcome is `failed`. Never retry blind — a failure whose cause is unread can be a protected branch, a moved head, or an org-owned required check, and each wants a different fix. |

### local-merge

**`--as` back-stop.** `/claude-tweaks:release` Step 1 owns this check and stops the run there. Should a run nevertheless reach this step with `--as` under `local-merge`, refuse with the same message, log it as `SKIP`, and stop — never invoke the engine:

```
--as is pr-first only (release-local.js derives the version from history); use a breaking commit or a manual tag
```

```
SKIP {HH:MM:SS} — Step 5: --as {version} refused under local-merge (back-stop; Step 1 owns the check) — release-local.js has no version override. Reversibility: n/a.
```

A `--release-as` flag on the local engine is an open follow-up, recorded as ledger row 90 of `docs/plans/2026-09-11-release-skill-ledger.md`.

**Invoke the engine.** One call, no flags the CLI does not define — its own are `--dry-run`, `--root <dir>` and `--branch <name>`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js" --root "$RUN_ROOT"
```

Map its exit code, which is the whole verdict — do not re-derive state from the repository:

| Exit | State | Action |
|---|---|---|
| `0` | Released: the manifest bump, the CHANGELOG section, the `chore(release): v{version}` commit, the annotated tag, the push (when `origin` exists) and the `release-hook` all landed. | Read the shipped version from the `released v{version}` stdout line, reconcile per `## Inputs`, → Step 6. |
| `1` | **Two different states — the stderr prefix says which, and it is never inferred.** `release-local: … — nothing written` → nothing was written at all. `partial: …` → a named partial state (edits on disk uncommitted, or the commit/tag landed and the push did not), with its own recovery command. | `nothing written` → outcome `failed`, stderr quoted verbatim, Step 6 does not run. `partial:` → quote the stderr line **verbatim** into the summary as `PARTIAL` and stop; Step 6 does not run either, because the stderr line already names the exact state and what to do. |
| `2` | Usage, a missing `release-please-config.json` (the project was never bootstrapped), or a malformed/unsupported config. Nothing was written. | Report the stderr line verbatim and stop; outcome `failed`. |
| `3` | Nothing to release. Step 2 should have caught this from the pack. | Report the engine's stdout line verbatim and stop; outcome `failed`, with the reason named: the pack and the engine disagree about the unreleased set. |
| `4` | Version collision (a sibling worktree or a plan claim holds the candidate version). | Report the engine's stderr **verbatim** — it names each conflicting claim and a suggested renumber — and stop; outcome `failed`. Never pick a different version here. |
| `5` | The `release-hook` failed **after** the tag (and its push) fully landed. The tag is final. | Read the shipped version from the stderr line's `partial: v{version} is committed, tagged…` prefix, reconcile per `## Inputs`, quote the stderr line verbatim into the summary as `PARTIAL`, and continue to **Step 6** — the release exists, so Step 7's bookkeeping still applies. |

### Logging

Log every subprocess this step ran, one line each, through the writer `/claude-tweaks:release` Step 0 names (`bin/log-decision.js --section "/release"`) — never hand-appended:

```
AUTO {HH:MM:SS} — Step 5: {command} → exit {code}. Reversibility: low (a merged release PR / a pushed tag is not undone by re-running).
```

## Step 6: Verify

Runs only after Step 5 landed: a pr-first merge, or a local-merge engine exit `0` or `5`. Three probes, each bounded at **15 attempts × 20 seconds** (5 minutes). A probe that does not land is a **named partial state with a recovery command** — never folded into a clean release, and never left as silence. Missing, still-running past the bound, and present-but-concluded-failed are three different misses and each says which it was.

The outcome is `released` only when all three probes that apply to this engine land; any miss makes it `PARTIAL`. `{version}` throughout is the **shipped** version reconciled at the end of Step 5.

### pr-first

**1. Tag on origin.** release-please tags on the merge, so this is a poll, not a single read:

```bash
git ls-remote --tags origin "v{version}*"
```

Keep only the lines whose ref is exactly `refs/tags/v{version}` or `refs/tags/v{version}^{}` — the glob also matches `v{version}0`-style neighbours, which are not this tag. A surviving line → `tag found`. **Keep the output** — probe 3 reads the commit sha from it: the `*` glob is what makes an annotated tag print two lines (an exact pattern suppresses the peeled ref), so an annotated tag prints two lines, and the sha probe 3 needs is the one on the peeled `refs/tags/v{version}^{}` line (the plain `refs/tags/v{version}` line names the tag object, not the commit); a lightweight tag prints only the plain line and that sha is the commit. Do not reach for `git rev-list -n 1 "v{version}"` here — under pr-first the tag was created on origin and no local tag exists unless `git fetch --tags origin` has been run.

Empty after the bound:

```
PARTIAL: PR #{n} merged but v{version} is not on origin after 5 min — release-please has not tagged the merge; recover: git ls-remote --tags origin v{version}
```

**2. GitHub Release.** Polled on the same bound, because release-please creates the Release from the tag:

```bash
gh release view "v{version}" --json url,isDraft
```

A non-zero exit (no such release) past the bound is a miss. `isDraft: true` is a miss reported on the **first** read that returns it — a draft Release is not published, and polling a draft only waits for a human to press a button:

```
PARTIAL: v{version} is tagged but no GitHub Release exists; recover: gh release create v{version} --generate-notes
PARTIAL: the GitHub Release for v{version} is a draft; recover: gh release edit v{version} --draft=false
```

**3. The `release: published` hook.** Skip only when the pack's `hook.value` is `false` — there is no hook wired up, so there is nothing to verify and the row reads `hook n/a`. When `hook.value` is `true` **or** the field is degraded, run the probe: a hook whose presence could not be determined is not a hook that can be assumed absent.

```bash
gh run list --event release --json databaseId,status,conclusion,name,url,headSha --limit 20
```

`databaseId` is in the field list because the recovery command below needs the run id to be runnable. Keep the runs whose `headSha` is the tag's commit — the sha probe 1 already read out of `git ls-remote`. That is the precise form of "created after the merge", and the only filter that cannot pick up an older release's run. Poll on the same bound and classify:

| Evidence | Verdict |
|---|---|
| A matching run with `conclusion: success` | `hook: ok ({name}, {url})` |
| A matching run concluded anything else (`failure`, `cancelled`, `timed_out`, `action_required`) | `hook: failed ({name}, {url})` |
| A matching run still `queued`/`in_progress` past the bound | `hook: still running after 5 min ({name}, {url})` |
| No matching run within the bound | `hook: missing after 5 min` |

The last three are partial states:

```
PARTIAL: v{version} is tagged and released but the release: published hook failed; recover: gh run rerun {databaseId}
PARTIAL: v{version} is tagged and released but the release: published hook is still running; recover: gh run watch {databaseId}
PARTIAL: v{version} is tagged and released but the release: published hook did not run; recover: check the workflow's release: published trigger, then gh run list --event release --limit 20
```

**Transport.** Step 5's `gh`-absent branch stops before merging, so this step is normally unreachable without `gh`. It is reachable in one case: a resumed run whose merge was performed by hand. There, probes 2 and 3 are unrunnable — `_shared/github-write-transport.md` has no Release or workflow-run row, and states plainly that PR- and run-backed reads degrade per item rather than being skipped wholesale. Probe 1 still runs (`git ls-remote` needs no forge CLI). Report probes 2 and 3 as `unverified (gh absent)` — a named partial state, not a pass.

### local-merge

The engine's own exit code is the verdict for the hook; the tag is still checked against the repository rather than assumed from the exit:

- **Tag.** Immediate, not polled — the engine committed, tagged and pushed synchronously before returning. Probe origin when there is a remote, and locally when there is not; key the choice on `git -C "$RUN_ROOT" remote get-url origin` failing, not on the engine's stdout (the engine prints its no-origin line only when a remote exists but the branch is not on it yet, so a repository with no remote at all prints nothing to read):

  ```bash
  git -C "$RUN_ROOT" remote get-url origin   # succeeds → git ls-remote --tags origin "v{version}*"
                                             # fails    → git -C "$RUN_ROOT" tag --list "v{version}"
  ```

  Empty either way is a miss: `PARTIAL: the engine exited 0 but v{version} is not present; recover: git tag --list v{version}` — an exit that claims more than the repository shows is the one case worth catching here.
- **GitHub Release.** `release n/a` — a `local-merge` project has no forge to publish one to.
- **Hook.** Exit `0` means the `release-hook` (if one is configured) ran and exited `0`; exit `5` **is** the hook failure, and its stderr already carries the recovery command (`re-run the hook alone: {hook}`). Quote it verbatim as the partial state; never re-run the engine to "retry" a hook, because the tag is final and a second run would bump again.

### Logging

```
AUTO {HH:MM:SS} — Step 6: tag {found|missing}, release {url|n/a}, hook {ok|failed|missing|n/a}. Reversibility: n/a (verification only).
```

## Summary lines

Step 8 renders the block; these are the values this file produces for it.

```
release: {version} — PARTIAL
engine:  {pr-first | local-merge}
records: {n} shipped{, m unattributed commits}
{the named partial state, verbatim}
{the recovery command, on its own line, paste-ready}
```

```
release: {version} — failed
engine:  {pr-first | local-merge}
records: 0 shipped
{the engine's or gh's own line, verbatim}
{the recovery command, when the failure named one}
```

When the shipped version differed from the gating version, the `release:` line names both — `release: {shipped} — {outcome} (gating version was {gating})` — so a reader never has to reconcile the console's number against the tag by hand.

`HELD` is never produced here. It belongs to a `--train` HARD-GATE that fires **before** Step 5, and asserts that nothing was merged or tagged — applying it to anything this file did would be a false statement about the repository and would recommend re-running the train against a tag that already exists. Once Step 5 has landed, the only two outcomes are `released` and `PARTIAL`; when Step 5 did not land, the outcome is `failed`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Verifying or booking the gating version instead of the engine's own | The pack proposes and the engine decides; a sibling release or a config the pack does not read can move the number, and Step 6 would then poll for a tag nobody created |
| Merging the release PR after the `Release-As:` poll times out | The open PR still renders the commit-derived version — merging it ships a number the operator explicitly overrode |
| Merging the release PR on the console's `CI on tip` row | `ciTip` is the integration branch's tip, not the PR, and the console renders CI rather than gating on it. The PR's own `statusCheckRollup` is the only read that answers "are this merge's checks green" |
| Arming `gh pr merge --auto` for the release PR | `--auto` returns before the merge happens, so Step 6 would verify a release that has not occurred — the release path waits or fails instead |
| Inferring which exit `1` it was instead of reading the stderr prefix | `release-local: … — nothing written` and `partial: …` are opposite states with opposite recoveries; treating both as "something landed" would leave a clean tree looking un-recoverable, and treating both as "nothing landed" would invite a second bump |
| Re-running `bin/release-local.js` after a `partial:` exit `1`, or after exit `5` | Both mean something already landed on disk or in git; a second run bumps again. The stderr line names the exact recovery, and it is never "re-run" |
| Reporting a missing hook run as success | Absence is not a passing result. `missing`, `still running` and `concluded failed` are three named states, each with its own recovery |
| Reading `integration-model` afresh instead of the pack's `engine` field | `_shared/integration-model.md` resolves it once per run; a second probe can split one release across two engines mid-run |
| Passing `--as` through to `bin/release-local.js` | The flag does not exist there; the engine would exit `2` on an unknown argument and the operator would read a usage error instead of the real refusal |
| Composing a merge subject for the release PR | release-please owns `chore(main): release X.Y.Z`; a composed subject would desynchronize the merge commit from the changelog the engine generated |
| Running the `Release-As:` commit from the worktree cwd | `$RUN_ROOT` is the integration checkout; an unanchored commit lands the override on the worktree's branch, where release-please will never see it |
