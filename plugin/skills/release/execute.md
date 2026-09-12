# Execute and Verify — Steps 5–6

Read by `/claude-tweaks:release` Steps 5 and 6. Every branch below routes on the `engine` value the preflight fact pack carries (`{run-dir}/release-preflight.json`, read once at Step 1) — `pr-first` dispatches to release-please's open PR, `local-merge` dispatches to `bin/release-local.js`. `_shared/integration-model.md` is canonical for that resolution and its Consumer table lists this file's Step 5/Step 6 dispatch; the value is **never** re-detected here, because a second probe mid-run can split one release across two engines.

Execution and verification live in one file because they are engine-specific in exactly the same way: what Step 5 ran decides what evidence Step 6 can look for.

## Inputs

- The pack's `engine`, `releasePr`, `branch`, `hook` and `lastTag` fields, plus the run directory resolved at Step 0.
- **The effective version** `{version}` — the `--as` value when one was given, otherwise `proposedVersion.value.version`. Every command, poll and summary line below uses it; nothing here re-derives a version.
- The arguments `--dry-run` and `--as {version}`, and Step 4's verdict that no HARD-GATE fired (a gated run never reaches this file).

## Step 5: Execute

### `--dry-run` — no-op, always taken first

Nothing is merged, nothing is tagged, no `Release-As:` commit is pushed, and the local engine is not invoked even with its own `--dry-run` (the console already rendered everything an engine dry run would print). Log the line below, skip Steps 6 and 7, and go to Step 8 with the outcome `dry-run`:

```
AUTO {HH:MM:SS} — Step 5: dry-run — no merge, no tag. Effective version v{version} would ship via {engine}. Reversibility: n/a.
```

### pr-first

**Precondition — the release PR.** `releasePr.value` must be a PR object. When it is the string `none`, stop before touching anything and report:

```
no open release PR — release-please has not rendered one; check the workflow
```

**Transport.** `command -v gh` absent: `_shared/github-write-transport.md`'s CRUD mapping covers issue operations only and has no merge row — there is no MCP equivalent for merging a PR. Do not improvise one. Stop at the console and print the merge as a paste-ready command, the same posture the Review Console takes for an unrunnable action:

```
gh pr merge {releasePr.value.number} --squash
```

**`--as {version}` — push the override, then wait for the re-render.** release-please derives the PR from the commits it sees, so the override must reach the integration branch and be re-read before the PR is merged:

```bash
git commit --allow-empty -m "chore: release {version}" -m "Release-As: {version}"
git push origin {branch}
```

`{branch}` is the pack's own `branch` field. Then poll for the re-render — `gh pr view {n} --json title,headRefOid` every 20 seconds, at most 15 attempts (5 minutes). Re-rendered means the PR **title** carries `{version}`; `headRefOid` is read in the same call so a moved head is visible rather than inferred:

```bash
gh pr view {releasePr.value.number} --json title,headRefOid
```

Past the bound, **do not merge** — the open PR still renders the version the commits alone derived, and merging it would ship the wrong number. Log the line, report the named state, and stop:

```
partial: override pushed, PR not re-rendered — release-please has not re-rendered PR #{n}; recover: wait for the release-please run, then re-run /claude-tweaks:release
```

The summary's outcome slot reads `failed`, not `PARTIAL`: `PARTIAL` asserts a release exists, and none does here. The `Release-As:` commit **is** on the integration branch, which is why the state is named rather than reported as a clean no-op — a second run must not push a second override commit.

**Merge.** One call, the immediate `--squash` form of `_shared/pr-first-merge.md`'s Step 3:

```bash
gh pr merge {releasePr.value.number} --squash
```

No `-t`/`-b`: the release PR's subject is release-please's own `chore(main): release X.Y.Z`, and `bin/compose-subject.js` is not involved — this is the one pr-first merge site whose subject the engine owns. No `--auto` either: Step 4's console already rendered the CI state on the tip and evaluated both HARD-GATEs, so this step merges the PR the console named rather than re-running `_shared/pr-first-merge.md`'s merge-verification gate.

Classify the result:

| Result | Meaning |
|---|---|
| exit `0` | Merged → Step 6. |
| exit `0`, stderr `! Pull request … was already merged` | A no-op on an already-merged PR, not an error → Step 6 (the tag and Release checks are the real evidence either way). |
| non-zero exit | Nothing merged, nothing tagged. Report `gh`'s stderr **verbatim** and stop; the summary outcome is `failed`. Never retry blind — a failure whose cause is unread can be a protected branch, a red required check, or a moved head, and each wants a different fix. |

### local-merge

**`--as` is refused here.** `bin/release-local.js` derives the version from the conventional history and has no override flag; the skill must not fabricate one by editing a manifest ahead of the engine. Refuse, log, and stop before invoking anything:

```
--as is pr-first only (release-local.js derives the version from history); use a breaking commit or a manual tag
```

```
REFUSED {HH:MM:SS} — Step 5: --as {version} refused under local-merge — release-local.js has no version override. Reversibility: n/a.
```

(A `--release-as` flag on the local engine is a known gap, recorded as a follow-up rather than worked around here.)

**Invoke the engine.** One call, no flags the CLI does not define — its own are `--dry-run`, `--root <dir>` and `--branch <name>`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/release-local.js"
```

Map its exit code, which is the whole verdict — do not re-derive state from the repository:

| Exit | State | Action |
|---|---|---|
| `0` | Released: the manifest bump, the CHANGELOG section, the `chore(release): v{version}` commit, the annotated tag, the push (when `origin` exists) and the `release-hook` all landed. | → Step 6. |
| `1` | Either nothing was written, or a **named partial state** — the engine's stderr says which, and carries the recovery command (`partial: … Do NOT re-run release-local … Recover: …`). | Quote the stderr line **verbatim** into the summary as `PARTIAL` and **stop**. Step 6 does not run: the tag may not exist, and the stderr line already names what to do. |
| `2` | Usage, a missing `release-please-config.json` (the project was never bootstrapped), or a malformed/unsupported config. Nothing was written. | Report the stderr line verbatim and stop; outcome `failed`. |
| `3` | Nothing to release. Step 2 should have caught this from the pack. | Report the engine's stdout line verbatim and stop; outcome `failed`, with the reason named: the pack and the engine disagree about the unreleased set. |
| `4` | Version collision (a sibling worktree or a plan claim holds `v{version}`). | Report the engine's stderr **verbatim** — it names each conflicting claim and a suggested renumber — and stop; outcome `failed`. Never pick a different version here. |
| `5` | The `release-hook` failed **after** the tag (and its push) fully landed. The tag is final. | Quote the stderr line verbatim into the summary as `PARTIAL` and continue to **Step 6** — the release exists, so Step 7's bookkeeping still applies. |

### Logging

Log every subprocess this step ran, one line each, through the writer `/claude-tweaks:release` Step 0 names (`bin/log-decision.js --section "/release"`) — never hand-appended:

```
AUTO {HH:MM:SS} — Step 5: {command} → exit {code}. Reversibility: low (a merged release PR / a pushed tag is not undone by re-running).
```

## Step 6: Verify

Runs only after Step 5 landed: a pr-first merge, or a local-merge engine exit `0` or `5`. Three probes, each bounded at **15 attempts × 20 seconds** (5 minutes). A probe that does not land is a **named partial state with a recovery command** — never folded into a clean release, and never left as silence. Missing, still-running past the bound, and present-but-concluded-failed are three different misses and each says which it was.

The outcome is `released` only when all three probes that apply to this engine land; any miss makes it `PARTIAL`.

### pr-first

**1. Tag on origin.** release-please tags on the merge, so this is a poll, not a single read:

```bash
git ls-remote --tags origin "v{version}"
```

Non-empty output → `tag found`. Empty after the bound:

```
PARTIAL: PR #{n} merged but v{version} is not on origin after 5 min — release-please has not tagged the merge; recover: git ls-remote --tags origin v{version}
```

**2. GitHub Release.** Polled on the same bound, because release-please creates the Release from the tag:

```bash
gh release view "v{version}" --json url,isDraft
```

A non-zero exit (no such release) past the bound, or `isDraft: true`, is a miss — a draft Release is not published, so it is not a completed one:

```
PARTIAL: v{version} is tagged but no GitHub Release exists; recover: gh release create v{version} --generate-notes
PARTIAL: the GitHub Release for v{version} is a draft; recover: gh release edit v{version} --draft=false
```

**3. The `release: published` hook.** Skip only when the pack's `hook.value` is `false` — there is no hook wired up, so there is nothing to verify and the row reads `hook n/a`. When `hook.value` is `true` **or** the field is degraded, run the probe: a hook whose presence could not be determined is not a hook that can be assumed absent.

```bash
gh run list --event release --json databaseId,status,conclusion,name,url,headSha --limit 20
```

`databaseId` is in the field list because the recovery command below needs the run id to be runnable. Keep the runs whose `headSha` is the tag's commit (`git rev-list -n 1 "v{version}"`) — the precise form of "created after the merge", and the only filter that cannot pick up an older release's run. Poll on the same bound and classify:

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

**Transport.** `gh` absent makes probes 2 and 3 unrunnable — `_shared/github-write-transport.md` has no Release or workflow-run row, and states plainly that PR- and run-backed reads degrade per item rather than being skipped wholesale. Probe 1 still runs (`git ls-remote` needs no forge CLI). Report probes 2 and 3 as `unverified (gh absent)` — a named partial state, not a pass.

### local-merge

The engine's own exit code is the verdict for the hook; the tag is still checked against the repository rather than assumed from the exit:

- **Tag.** Immediate, not polled — the engine committed, tagged and pushed synchronously before returning: `git ls-remote --tags origin "v{version}"`. When the engine reported no origin (its stdout says the branch is not on origin), check locally instead: `git tag --list "v{version}"`. Empty either way is a miss, and is reported as `PARTIAL: the engine exited 0 but v{version} is not present; recover: git tag --list v{version}` — an exit that claims more than the repository shows is the one case worth catching here.
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

`HELD` is never produced here. It belongs to a `--train` HARD-GATE that fires **before** Step 5, and asserts that nothing was merged or tagged — applying it to anything this file did would be a false statement about the repository and would recommend re-running the train against a tag that already exists. Once Step 5 has landed, the only two outcomes are `released` and `PARTIAL`; when Step 5 did not land, the outcome is `failed`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Merging the release PR after the `Release-As:` poll times out | The open PR still renders the commit-derived version — merging it ships a number the operator explicitly overrode |
| Re-running `bin/release-local.js` after exit `1` or `5` | Both exits mean something already landed on disk or in git; a second run bumps again. The stderr line names the exact recovery, and it is never "re-run" |
| Reporting a missing hook run as success | Absence is not a passing result. `missing`, `still running` and `concluded failed` are three named states, each with its own recovery |
| Reading `integration-model` afresh instead of the pack's `engine` field | `_shared/integration-model.md` resolves it once per run; a second probe can split one release across two engines mid-run |
| Passing `--as` through to `bin/release-local.js` | The flag does not exist there; the engine would exit `2` on an unknown argument and the operator would read a usage error instead of the real refusal |
| Composing a merge subject for the release PR | release-please owns `chore(main): release X.Y.Z`; a composed subject would desynchronize the merge commit from the changelog the engine generated |
