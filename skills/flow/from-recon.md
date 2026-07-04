# Flow — `--from-recon` mode

`/claude-tweaks:flow --from-recon` pulls open GitHub issues labelled `recon` (filed by
`/claude-tweaks:recon`), turns each into a `/claude-tweaks:specify` brief, and runs the
resulting specs through the existing multi-spec batch pipeline + consolidated Review Console.
This is the only `/flow` entry point that does not take spec numbers up front — the specs are
*derived* from issues at the start of the run.

## Syntax

```
/claude-tweaks:flow --from-recon [--min-severity high] [worktree | current-branch] [keep-going] [auto | confirm | hybrid]
```

`--min-severity` (default: none — all open `recon` issues) filters by the `recon:<sev>` label.
All other `/flow` arguments behave as normal — `--from-recon` only changes how the spec list is
assembled.

## Procedure

1. **Pull issues (through-tool).** Run the GitHub CLI to list open `recon` issues as JSON:

   ```bash
   gh issue list --label recon --state open \
     --json number,title,body,labels --limit 100
   ```

   If `gh` is unavailable or unauthenticated, STOP with: "GitHub CLI not available — `/flow
   --from-recon` needs `gh` to read `recon` issues. Install/authenticate `gh`, or run
   `/claude-tweaks:flow <spec-numbers>` directly." (Hard gate — `auto` does not silence a missing
   dependency.)

2. **Parse to briefs (pure).** Pass the parsed JSON array to `pullReconIssues`:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" pull-issues \
     --label recon [--min-severity high] --issues <path-to-gh-output.json>
   ```

   (or call `bin/lib/recon/pull-issues.js`'s `pullReconIssues` directly with the parsed array).
   Call signature: `pullReconIssues({ label, minSeverity, issuesJson })`.

   **v2 label set.** Each recon issue carries three label types:
   - `recon` — presence filter; `pullReconIssues` includes only issues that have this label.
   - `recon:<severity>` — e.g. `recon:high`; severity is extracted from this label and stored
     in the brief's `severity` field. If absent, defaults to `info`.
   - `recon:<criterion>` — e.g. `recon:architecture`; informational only. `pullReconIssues`
     does not filter on it — it is passed through in the brief's `body`.

   Each brief is `{ number, title, body, fingerprint, severity }`. The body is already
   `/specify`-shaped with three sections: `## Current State`, `## Deliverables`,
   `## Acceptance Criteria`.

2.5. **Claim each issue (per `_shared/issue-claims.md`).** Before any `/specify` invocation,
   claim every brief's issue so concurrent consumers (a scheduled routine, a second machine,
   another collaborator's agent) never double-build. Resolve the sha once per run:

   ```bash
   DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
   SHA=$(gh api "repos/{owner}/{repo}/commits/${DEFAULT_BRANCH}" -q .sha)
   ```

   For each brief, attempt the atomic ref creation:

   ```bash
   gh api "repos/{owner}/{repo}/git/refs" -f "ref=refs/claims/issue-${N}" -f "sha=${SHA}"
   ```

   - **201 (claimed):** post the claim comment (generate the body with `claimPayload` — see
     "The mirror" in `_shared/issue-claims.md`), keep the brief, and log:
     `AUTO — claimed issue #{N} (refs/claims/issue-{N}) — reversible (release deletes the ref)`.
     If the comment post fails twice, proceed anyway (the ref is the lock) and log a warning.
   - **422 (contested):** fetch the issue's comments and fold through `claimStatus` (see
     "Reading claim state"). Live claim → drop the brief; log
     `AUTO — skipped issue #{N} — claimed by run {claim.runId}, stale after {claimedAt}+{ttlHours}h`.
     Stale claim → break it (delete ref, recreate — exactly one of two racing breakers gets
     201 — then post a takeover claim comment naming the prior run id) and keep the brief.
     Unreadable claim (no marker found) → treat as live: drop the brief, log; `/tidy` Step 4.7
     surfaces it.
   - **Any other failure:** drop the brief, log, continue — partial batch over hung batch.

   If every brief is dropped, stop and report: "All pulled recon issues are claimed by other
   runs — nothing to build. Stale claims are recoverable via /claude-tweaks:tidy (Step 4.7)."

3. **Derive specs via `/specify`.** For each brief, invoke `/claude-tweaks:specify` with the
   brief's title + body as the design input. `/specify` produces a numbered spec under `specs/`.
   Carry the issue `number` and `fingerprint` forward as spec frontmatter (`recon-issue: <number>`,
   `recon-fingerprint: <fp>`) so wrap-up can close the issue on merge.

4. **Run the multi-spec batch.** Feed the derived spec numbers into the standard Multi-Spec
   Sequential Flow (see `multi-spec.md`) — dependency-aware ordering, shared worktree, deferred
   per-spec consoles, one consolidated Review Console at the end. Nothing about the batch pipeline
   changes; `--from-recon` only sourced the spec list.

5. **Close-the-loop note (Review Console).** Surface, in the consolidated Review Console, which
   `recon` issues each merged spec resolves, with the `gh` command to close them:

   ```bash
   gh issue close <number> --comment "Resolved by spec <N> (flow --from-recon)"
   ```

   Closing is a user action at the console — the pipeline never closes issues autonomously
   (closing a GitHub issue is a non-reversible network write; see `_shared/auto-mode-contract.md`,
   "Never-reversible").

   The console also lists the claims this run holds (`refs/claims/issue-{N}` per brief).
   Completed specs release via `/wrap-up` cleanup item 8. For briefs the user **declines** at
   the console, release immediately (reason `declined at review console`): delete the ref and
   post the release comment generated by `releasePayload` — see "Release triggers" in
   `_shared/issue-claims.md`.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Filing or closing `recon` issues from inside `/flow` | `/flow --from-recon` is a *consumer* of issues. Filing belongs to `/recon`; closing is a user decision at the Review Console. |
| Deriving specs from pulled issues without claiming them (skipping Step 2.5) | Concurrent consumers — a scheduled routine, a second machine — pull the same open issues and double-build them. The claim ref (`_shared/issue-claims.md`) is the only arbiter. |
| Auto-closing the issue when its spec merges | Closing is a non-reversible network write — `auto` never silences it. Surface the `gh issue close` command; the user runs it. |
| Pulling issues without `--state open` | Closed/`wontfix` issues are standing decisions — re-pulling them re-floods the batch with resolved work. |
