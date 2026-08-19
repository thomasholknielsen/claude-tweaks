# GitHub Write Transport — gh CLI locally, GitHub MCP tools in cloud Routines

Single source of truth for choosing between `gh` CLI and GitHub MCP tools for a plain
CRUD GitHub write (list-by-label, create, edit/label, comment, close). Flow's claim lock
(the one remaining hard compare-and-set case using this mapping) doesn't use it directly —
see `_shared/issue-claims.md`, built on the conditional-write pattern documented at the
bottom of this file. Health-state's cursor writes (`_shared/health-state.md`) no longer use
this file at all — they're plain Git Data API primitives (blob/tree/commit/ref) with no
GitHub-specific semantics, so they use `git` directly (fetch/hash-object/mktree/commit-tree/
push) rather than choosing between `gh` and MCP.

## Detection

`gh` present (`command -v gh` exits 0) → use it exactly as documented at each call site,
unchanged. `gh` absent → use the MCP tool from the mapping below. This is a capability
probe, not an environment classification — it holds regardless of *why* `gh` is missing.

## CRUD mapping

| Operation | gh CLI | GitHub MCP tool |
|---|---|---|
| List open issues by label | `gh issue list --label {label} --state open --json ...` | `list_issues` (filtered by label, state) — never `search_issues` for a find-by-marker/dedup lookup (see below) |
| Create an issue | `gh issue create --title ... --body ...` | `issue_write` (create mode) |
| Edit labels / body | `gh issue edit {n} --add-label/--remove-label/--body-file` | `issue_write` (update mode) |
| Comment | `gh issue comment {n} --body-file` | `add_issue_comment` |
| Close | `gh issue close {n} --reason ...` | `issue_write` (update mode, state change) |
| Get a single issue by number | `gh issue view {n} --json state,...` | `issue_read` (get mode) |
| List an issue's comments | `gh api repos/{owner}/{repo}/issues/{n}/comments?per_page=100` | `issue_read` (get_comments mode) |

**Never use `search_issues` (or `gh issue list --search`) for a find-by-marker/dedup lookup.**
Both ride an eventually-consistent search index — this caused three real duplicate-digest
production incidents when `tidy`'s Rolling digest briefly used `gh issue list --search`
(#1016, #1079, #1089). Always use the plain list-then-filter approach (`list_issues`/
`gh issue list`, no `--search`, then `findByMarker` in-process), on both transports.

**Snapshot invalidation.** Every write in the Create / Edit labels / Close rows above changes
what a `gh issue list --state all` pull would return, so it stales the session-scoped record
snapshot (`_shared/record-queue-fetch.md`) if one exists for this session. Immediately after any
such write succeeds, on either transport, call
`require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-snapshot.js').invalidateSnapshot(process.env.CLAUDE_CODE_SESSION_ID)`
so the next consumer re-fetches instead of reading stale state. A no-op when no snapshot exists
for this session (nothing to invalidate) or when `$CLAUDE_CODE_SESSION_ID` is unset (a
snapshot-less caller was never caching in the first place).

## The conditional-write pattern (flow's claim lock)

Flow's claim lock (Step 2.8, `flow/claim-targets.md` — reached whether `/claude-tweaks:dispatch`
handed off the run or a human invoked `/flow` directly) needs "write this, but only if nothing
else wrote first." `gh`'s
ref-level compare-and-set (atomic create, fast-forward-only update) has no MCP equivalent —
but `create_or_update_file` carries the identical guarantee one level down, at the file-blob
level: omit its `sha` parameter and the write fails if the file already exists; supply a
stale `sha` and it fails on mismatch. The claim lock uses this primitive against a dedicated
branch, gated on the same detection check above — see `_shared/issue-claims.md` for the full
procedure. Health-state's cursor CAS is *not* this pattern (it is a plain non-force `git
push`) — see the note at the top of this file before adding it back here.

**Pull requests are deliberately not in this mapping.** This CRUD mapping covers issues only — no `list_pull_requests`/`get_pull_request` row exists, and none is planned. A `gh pr *` caller (`_shared/github-pr-scan.md`'s PR-based scan items) has no MCP fallback and degrades per-item on `gh`-absence instead — see that file's own "`gh`-absent handling" section for the scoped alternative that was chosen over widening this mapping (#172).

## Pacing scripted mutation sequences

Any scripted sequence of mutative calls through either transport follows
`_shared/github-rate-limit.md`'s burst-shape authoring rules. That file also owns recognizing
and classifying a rate-limit failure encountered on either transport — this file's CRUD
mapping and conditional-write pattern above are unaffected.
