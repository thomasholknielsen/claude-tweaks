# Bookkeeping — Step 7

Read by `/claude-tweaks:release` Step 7. For each record in the shipped set, comments `Shipped in v{version}` and closes it (or, on a local-files record, sets the `shipped:` facet) — through whichever work-record driver the project uses. Every write here is idempotent: a record whose comment already reads `Shipped in v{version}` is skipped, and a record already closed is commented but never closed a second time.

## When this step runs

**Never under `--dry-run`.** SKILL.md's Step 7 already says so: nothing shipped, so there is nothing to book.

**Never when nothing landed.** execute.md's `failed` outcome (Step 5 landed nothing) and the tag-missing `PARTIAL` state (Step 6's first probe found no tag on origin) both mean the shipped set never actually shipped — this step does not run for either.

**Never when the tag has not reached origin.** The local-merge engine's exit `1` `partial:` state (execute.md's exit-code table — the commit and tag landed locally but the push did not) skips this step too. Step 6 never ran for that state, so nothing verified the tag anywhere a reader can see it; the recovery push named in the engine's own stderr comes first, and the records are booked by the re-run that follows it. Booking `Shipped in v{version}` against a tag that exists only in one working copy would publish a claim the forge cannot corroborate.

**Runs whenever the tag landed** — on origin, or locally under local-merge in a repository with no `origin` remote at all (execute.md's local-merge tag probe keys that choice on `git -C "$RUN_ROOT" remote get-url origin` failing) — even when Step 6 otherwise reported `PARTIAL` — a missing/draft GitHub Release, a missing/still-running/failed `release: published` hook (pr-first), or a `release-hook` exit `5` (local-merge, hook failed after the tag was final). The tag existing is what makes the shipped set's work actually released; Step 8's summary names the partial state alongside the bookkeeping result, never in place of it.

**Never reached under `HELD`.** A HARD-GATE fires at Step 4, before Step 5 ever runs — in any mode, not only under `--train` — so there is no Step 6 or Step 7 to reach.

## Inputs

- The shipped set — one entry per distinct `(#N)` suffix in `unreleased.value.commits[].subject` (`plugin/bin/lib/release-preflight/pack.js`), the same join Step 4's console row rendered, deduplicated across repeated suffixes. A commit subject carrying no `(#N)` suffix contributes no record here — it stayed in the console's nested `Unattributed commits` line, listed in Step 8's summary, never booked against a record that doesn't exist.
- The **shipped** version `{version}` — the engine's own number, reconciled at the end of Step 5 (`execute.md`'s "Two versions" section; SKILL.md's Step 5 "Two versions, reconciled once" paragraph defines the pair). Never the gating version the console rendered: when the two differ the engine's is what was tagged, and booking the other would stamp records with a version no tag carries.
- The Release URL: Step 6's GitHub Release `url` field under pr-first; `none` under local-merge, which has no forge Release to link.
- `work-backend` — read from the project's CLAUDE.md `## Work records` section (a missing flag is treated as `local-files`, the same convention `/claude-tweaks:capture`'s Backend Selection uses). This is the axis this step branches on, independently of the `pr-first`/`local-merge` release engine — a `local-merge` project can still carry `work-backend: github-issues`, and vice versa.

## `work-backend: github-issues`

Through `_shared/github-write-transport.md`'s CRUD mapping, so an MCP-only sandbox books the same set without `gh`:

1. **Read state** — needed to skip an already-posted comment and to skip closing an already-closed record. Two calls, per `_shared/github-write-transport.md`'s CRUD table: `gh issue view N --json state` (or `issue_read` get mode) for open/closed, and `gh api repos/{owner}/{repo}/issues/N/comments?per_page=100` (or `issue_read` get_comments mode) to check for an existing `Shipped in v{version}` comment.
2. **Comment**, unless a comment already reads the exact text below — `gh issue comment N --body-file {file}` (or `add_issue_comment`), body:
   ```
   Shipped in v{version} — {release url}
   ```
   The ` — {release url}` clause appears only when a Release URL exists (pr-first, Step 6's `url` field). Under local-merge the Release URL is `none` and the body is exactly `Shipped in v{version}`, with **no** ` — none` suffix — a literal `none` in a shipped-record comment reads as a broken link rather than as "this project has no forge Release". The idempotency read at step 1 looks for whichever of the two forms this run would write.
3. **Close**, only when the issue is still open — `gh issue close N --reason completed` (or `issue_write` (update mode, state change)). An already-closed record is commented at step 2 but never re-closed here.

A record already carrying the exact comment and already closed is skipped entirely: no write, no per-record log line beyond the summary's count.

## `work-backend: local-files`

No `gh`/MCP call; the fact lives on the record file itself, via `bin/lib/issues/local-store.js`'s `shipped:` facet (serializes right after `closed-at:` in the frontmatter fence). The record file is the same one Step 4 already resolved to render the console row's title/type — a `specs/{n}-*.md` glob read via `readRecord(path)` — never re-derived here.

- **Record still open** (`facets.closed` is `false`) — close and mark shipped in one write (Task 2's API):
  ```bash
  node -e "require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js').closeRecord(process.argv[1], { shipped: process.argv[2] })" {record file} v{version}
  ```
- **Record already closed** — `closeRecord` would re-stamp `closed-at:` for no reason; `markShipped` sets only the `shipped:` facet, leaving `closed`/`closed-at` untouched:
  ```bash
  node -e "require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/local-store.js').markShipped(process.argv[1], process.argv[2])" {record file} v{version}
  ```
- **Record already carries `shipped: v{version}`** (a re-run against the same release) — skipped entirely, the same idempotency as the github-issues branch.

## Failures never abort the loop

A single record's write failing — a transient `gh`/MCP error, a locked or unwritable record file — is logged and the loop continues to the next record. One bad record never stops the rest of the shipped set from being booked. `FAILED` is not one of `bin/log-decision.js`'s enumerated statuses (`plugin/bin/lib/log-decision/append.js`'s `STATUSES` — `AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`/`REFUSED`/`SKIP` — rejects it on purpose), so this one line is hand-composed rather than written through the canonical writer, the same precedent `plugin/bin/apply-refine-labels.js`'s `logFailed` already establishes for the identical reason:

```
FAILED {HH:MM:SS} — Step 7: #N — {comment|close|shipped} failed: {message}. Reversibility: n/a (write did not land).
```

## Log lines

One line per record that actually wrote something, plus one summary line for the step, through the canonical writer named in SKILL.md's Step 0 (`bin/log-decision.js --run "{run-dir}" --section "/release" --step "Step 7"`). A record skipped entirely as already-idempotent — already commented and closed (github-issues), or already carrying `shipped: v{version}` (local-files) — gets no per-record line, only the summary's count:

```
AUTO {HH:MM:SS} — Step 7: #N — commented Shipped in v{version}{, closed}. Reversibility: high.
AUTO {HH:MM:SS} — Step 7: bookkeeping: {n} records commented, {m} closed, {k} failed. Reversibility: n/a.
```

`{, closed}` appears only when this record's close actually ran this turn (github-issues: it was open and got closed; local-files: `closeRecord` ran) — an already-closed record, or the local-files `markShipped`-only path, omits it. The summary's `{n}`/`{m}`/`{k}` are this step's own counts across the shipped set (comments written including idempotent skips counted as commented, closes that actually ran, and failures) — a distinct tally from Step 8's `records: {n} {shipped | would ship}{, m unattributed commits}` line, which reads its `{n}` from the shipped-set size and its `{m}` from Step 4's unattributed-commits count, never from this step's counters.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Re-closing an already-closed record | `gh issue close` on a closed issue and `closeRecord` on a closed file both re-stamp state (a closed-event/`closed-at:` rewrite) for no reason — the idempotency check above exists precisely to skip this |
| Aborting the loop on one record's write failure | A single transient error would leave every later record in the shipped set unbooked; each failure is named and the loop continues |
| Re-deriving the shipped set here instead of reusing Step 4's | The console already resolved `(#N)` suffixes to records and separated out unattributed commits — a second derivation risks disagreeing with what was rendered |
