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
   Each brief is `{ number, title, body, fingerprint, severity }`. The body is already
   `/specify`-shaped (Current State / Deliverables / Acceptance Criteria).

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

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Filing or closing `recon` issues from inside `/flow` | `/flow --from-recon` is a *consumer* of issues. Filing belongs to `/recon`; closing is a user decision at the Review Console. |
| Auto-closing the issue when its spec merges | Closing is a non-reversible network write — `auto` never silences it. Surface the `gh issue close` command; the user runs it. |
| Pulling issues without `--state open` | Closed/`wontfix` issues are standing decisions — re-pulling them re-floods the batch with resolved work. |
