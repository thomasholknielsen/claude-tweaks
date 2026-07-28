# GitHub Write Transport — gh CLI locally, GitHub MCP tools in cloud Routines

Single source of truth for choosing between `gh` CLI and GitHub MCP tools for a plain
CRUD GitHub write (list-by-label, create, edit/label, comment, close). The two hard
compare-and-set cases (dispatch's claim lock, health-state's cursor writes) don't use this
mapping directly — see `_shared/issue-claims.md` and `_shared/health-state.md` respectively,
both built on the same conditional-write pattern documented at the bottom of this file.

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

**Never use `search_issues` (or `gh issue list --search`) for a find-by-marker/dedup lookup.**
Both ride an eventually-consistent search index — this caused three real duplicate-digest
production incidents when `tidy`'s Rolling digest briefly used `gh issue list --search`
(#1016, #1079, #1089). Always use the plain list-then-filter approach (`list_issues`/
`gh issue list`, no `--search`, then `findByMarker` in-process), on both transports.

## The conditional-write pattern (for the two CAS consumers)

Both dispatch's claim lock and health-state's cursor writes need "write this, but only if
nothing else wrote first." `gh`'s ref-level compare-and-set (atomic create, fast-forward-only
update) has no MCP equivalent — but `create_or_update_file` carries the identical guarantee
one level down, at the file-blob level: omit its `sha` parameter and the write fails if the
file already exists; supply a stale `sha` and it fails on mismatch. Both consumers use this
same primitive against a dedicated branch, gated on the same detection check above — see
`_shared/issue-claims.md` (claim lock) and `_shared/health-state.md` (cursor CAS) for each
consumer's specific procedure.
