# Flow — Issue-sourced batches (`--from-code-health` / `--from-label` / `--from-issues`)

`/claude-tweaks:flow` can assemble its spec list from GitHub issues instead of spec numbers:
`--from-code-health` (alias for `--from-label code-health`) pulls the issues `/claude-tweaks:code-health` filed;
`--from-label <label>` pulls any labelled set; `--from-issues <n,...>` pulls specific issue
numbers; `--from-milestone <m>` pulls a milestone's open issues. Each pulled issue is claimed
(Step 2.5), turned into a `/claude-tweaks:specify` brief, and run through the existing
multi-spec batch pipeline + consolidated Review Console. These are the only `/flow` entry
points that do not take spec numbers up front — the specs are *derived* from issues at the
start of the run.

## Syntax

```
/claude-tweaks:flow --from-code-health  [--min-severity high] [--require-eligible] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
/claude-tweaks:flow --from-label <label> [--min-severity high] [--require-eligible] [...same]
/claude-tweaks:flow --from-issues <n,...>       [--min-severity high] [--require-eligible] [...same]
/claude-tweaks:flow --from-milestone <m>          [--min-severity high] [--require-eligible] [...same]
```

`--min-severity` floors on the `code-health:<sev>` label (unlabeled issues rank `info`). All other
`/flow` arguments behave as normal — the selectors only change how the spec list is assembled.
Note: `--min-severity` with a non-code-health label set is empty by construction unless those issues
also carry `code-health:<sev>` labels.

## Procedure

1. **Pull issues (through-tool).** Run the GitHub CLI for the active selector:

   ```bash
   # --from-code-health (alias) and --from-label <label>:
   gh issue list --label "<label>" --state open \
     --json number,title,body,labels --limit 100

   # --from-issues <n,...> — one gh call per number; skip non-open issues with a log entry:
   gh issue view "${ISSUE}" --json number,title,body,labels,state

   # --from-milestone <m>:
   gh issue list --milestone "<m>" --state open \
     --json number,title,body,labels --limit 100
   ```

   Assemble the per-issue objects into ONE JSON array at `/tmp/flow-issues.json` (e.g.
   `jq -s '.'` over the collected outputs) — Step 2 requires an array.

   If `gh` is unavailable or unauthenticated, STOP with: "GitHub CLI not available —
   issue-sourced `/flow` runs need `gh` to read issues. Install/authenticate `gh`, or run
   `/claude-tweaks:flow <spec-numbers>` directly." (Hard gate — `auto` does not silence a missing
   dependency.)

2. **Parse to briefs (pure).** Pass the parsed JSON array to `issuesToBriefs`:

   ```bash
   node -e "const i=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/ingest.js');
     const issues=require(process.argv[1]);
     console.log(JSON.stringify(i.issuesToBriefs({issuesJson:issues,
       label:process.argv[2]||undefined,
       numbers:process.argv[3]?process.argv[3].split(',').map(Number):undefined,
       minSeverity:process.argv[4]||undefined,
       requireLabels:process.argv[5]?process.argv[5].split(','):undefined})))" \
     /tmp/flow-issues.json "<label-or-empty>" "<numbers-or-empty>" "<min-severity-or-empty>" "<require-labels-csv-or-empty>"
   ```

   Call signature: `issuesToBriefs({ issuesJson, label?, numbers?, minSeverity?, requireLabels? })`. For
   `--from-code-health`, `label` is `code-health` (the `bin/code-health.js pull-issues` CLI remains equivalent
   absent `--require-eligible`, which it does not pass through).
   With `--require-eligible`, pass `agent:eligible` as the fifth argument — autonomous dispatch
   always does (see "Dispatch authorization" in `_shared/issue-claims.md`).
   Each brief is `{ number, title, body, fingerprint, severity, shape }` — `shape` is `form`
   when the body carries the three sections (at `##` or `###` level — GitHub issue forms
   render `###`), else `freeform`.

   **Labels (code-health-filed issues).** Each code-health issue carries three label types — this applies
   to `--from-code-health`; other selectors may pull issues with no code-health labels at all:
   - `code-health` — presence filter; `pullReconIssues` includes only issues that have this label.
   - `code-health:<severity>` — e.g. `code-health:high`; severity is extracted from this label and stored
     in the brief's `severity` field. If absent, defaults to `info`.
   - `code-health:<criterion>` — e.g. `code-health:architecture`; informational only. `pullReconIssues`
     does not filter on it — it is passed through in the brief's `body`.
   (`issuesToBriefs` performs the same label/severity filtering `pullReconIssues` applied — the
   code-health CLI path and the generic path are equivalent for `--from-code-health`.)

2.5. **Claim each issue (per `_shared/issue-claims.md`).** Before any `/specify` invocation,
   claim every brief's issue so concurrent consumers (a scheduled routine, a second machine,
   another collaborator's agent) never double-build. Resolve the sha once per run:

   ```bash
   DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
   SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
   ```

   For each brief, attempt the atomic ref creation:

   ```bash
   gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${ISSUE}" -f "sha=${SHA}"
   ```

   - **201 (claimed):** post the claim comment (generate the body with `claimPayload` — see
     "The mirror" in `_shared/issue-claims.md`), keep the brief, and log:
     `AUTO — claimed issue #{issue} (refs/claims/issue-{issue}) — reversible (release deletes the ref)`.
     If the comment post fails twice, proceed anyway (the ref is the lock) and log a warning.
   - **422 (contested):** fetch the issue's comments and fold through `claimStatus` (see
     "Reading claim state"). Live claim → drop the brief; log
     `AUTO — skipped issue #{issue} — claimed by run {claim.runId}, stale after {claimedAt}+{ttlHours}h`.
     Stale claim → break it (delete ref, recreate — exactly one of two racing breakers gets
     201 — then post a takeover claim comment naming the prior run id — generate it with
     `claimPayload`'s `note` param per "TTL and staleness" in `_shared/issue-claims.md`) and
     keep the brief.
     A fold showing *released* while the ref still exists (a failed earlier ref delete) is
     treated the same way — break and keep the brief.
     Unreadable claim (no marker found) → treat as live: drop the brief, log; `/tidy` Step 4.7
     surfaces it.
   - **Any other failure:** drop the brief, log, continue — partial batch over hung batch.

   If every brief is dropped, stop and report: "All pulled code-health issues are claimed by other
   runs — nothing to build. Stale claims are recoverable via /claude-tweaks:tidy (Step 4.7)."

2.6. **Translate freeform briefs.** Briefs with `shape: freeform` (no Current State /
   Deliverables / Acceptance Criteria sections) are translated before spec derivation: write
   a three-section brief body from the issue's title + prose, citing the issue number. The
   original body is preserved in the issue itself; the translated body feeds `/specify`.

   Translation is a judgment call the user must be able to inspect. Hold the translations in
   memory through pre-flight; immediately after flow Step 3 creates the pipeline run
   directory, write each one to `{parent-run-dir}/staged/translation-{issue}.md` (original
   body, translated body, one-line rationale) and log `STAGED — translated freeform issue
   #{issue} to a three-section brief` to the parent `decisions.md`. The consolidated Review
   Console reads the parent-level `staged/` alongside the per-spec directories and surfaces
   these translations. In `interactive` mode (no run directory), present each translation
   in-flow for approval before its `/specify` invocation instead. Form-shaped briefs skip
   this step entirely.

3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number` and `fingerprint` forward as spec frontmatter (`recon-issue: <number>`,
   `recon-fingerprint: <fp>`) so wrap-up can close the issue on merge.

4. **Run the multi-spec batch.** Feed the derived spec numbers into the standard Multi-Spec
   Sequential Flow (see `multi-spec.md`) — dependency-aware ordering, shared worktree, deferred
   per-spec consoles, one consolidated Review Console at the end. Nothing about the batch pipeline
   changes; `--from-code-health` only sourced the spec list.

5. **Close-the-loop (Review Console).** The consolidated Review Console presents an issue-
   closure mapping instead of close commands — issues close through the user's merge action
   (see "Close-via-merge" in `_shared/issue-claims.md`):

   | Spec | Issue | Closes via |
   |------|-------|-----------|
   | {spec} | #{issue} | `Fixes #{issue}` in the merge commit (worktree mode) or PR body — fires when the user pushes/merges to the default branch |

   The merge artifacts carry the closing keywords: `worktree-merge.md`'s reconciliation puts
   `Fixes #{issue}` lines in the merge commit message; the single-spec PR path puts them in
   the PR body (see `wrap-up/cleanup-procedures.md` Section C).

   In `current-branch` mode there is no merge commit or PR — the carrier is the **final
   wrap-up commit message**: include one `Fixes #{issue}` line per resolved issue in the
   wrap-up commit; GitHub closes the issues when that commit reaches the default branch
   (immediately on push if the current branch IS the default branch, otherwise at the
   eventual merge).

   Direct `gh issue close #{issue} --comment "..."` commands surface ONLY for issues resolved
   without a merge (wontfix, duplicate) — the user runs them; the pipeline never closes
   issues autonomously (see `_shared/auto-mode-contract.md`, "Never-reversible").

   The console also lists the claims this run holds (`refs/claims/issue-{issue}` per brief).
   Completed specs release after the consolidated console's branch finish (see
   `multispec-review-console.md`), which then executes `/wrap-up` cleanup item 8's Section E
   procedure once per run; in the rare single-spec wrap-up path (no `MULTISPEC_REVIEW_DEFER`),
   item 8 runs in wrap-up Step 10 directly. For briefs the user **declines** at
   the console, release immediately after the ownership check (`_shared/issue-claims.md`,
   "Release triggers") (reason `declined at review console`): delete the ref and
   post the release comment generated by `releasePayload` — see "Release triggers" in
   `_shared/issue-claims.md`.

   For a DISPATCHED issue (it carries `agent:go`), also surface the follow-up as a user
   action alongside the decline: `gh issue edit "$ISSUE" --remove-label agent:go` —
   otherwise the standing request re-dispatches the declined issue at the next firing. The
   agent surfaces the command; the user runs it (rejecting a dispatch request is the
   maintainer's call, like wontfix closes).

## Dispatch Configuration

Instantiation and unattended-execution semantics live in flow SKILL.md's "Routine
Configuration" section; this section owns the label lifecycle.

`/flow` ships a routine template (`skills/flow/routine-template.yml`) that turns the issue
queue into a scheduled dispatcher: each firing runs
`/claude-tweaks:flow --from-label agent:go --require-eligible auto worktree` headless.
Instantiate it with:

```
/claude-tweaks:routine create flow
```

Add `--dry-run` to inspect the assembled configuration first (see `skills/routine/SKILL.md`).

**Label lifecycle (per "Dispatch authorization" in `_shared/issue-claims.md`):** a maintainer
applies `agent:eligible` (authorization) and `agent:go` (standing request). The dispatcher
claims what it builds — overlapping firings skip claimed issues — and after a spec's issue is
released with a `merged:`/`pr-opened:` outcome, remove the dispatch request:

```bash
gh issue edit "$ISSUE" --remove-label agent:go
```

Removal is reversible and logs to `decisions.md`. On failure, leave the label — the claim's
TTL is the retry pacing. The agent never ADDS either label.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics
> against the live account.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Filing or closing issues from inside `/flow` | `/flow --from-code-health` is a *consumer* of issues. Filing belongs to `/code-health`; closing is a user decision at the Review Console. |
| Deriving specs from pulled issues without claiming them (skipping Step 2.5) | Concurrent consumers — a scheduled routine, a second machine — pull the same open issues and double-build them. The claim ref (`_shared/issue-claims.md`) is the only arbiter. |
| Running `gh issue close` from the pipeline | Direct closes are non-reversible network writes the agent never performs. Closing keywords in merge artifacts (`Fixes #{issue}` in the PR body or merge commit message) are sanctioned — the user's merge/push is the closing action. |
| Pulling issues without `--state open` | Closed/`wontfix` issues are standing decisions — re-pulling them re-floods the batch with resolved work. |
