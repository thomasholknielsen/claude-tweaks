---
record: 610
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [608]
surface: backend
---
# 610: specify Step 4 linking helper: bin/link-records.js resolves databaseIds once and issues sub_issues + blocked_by writes

Surface: backend

## Current State

- `skills/specify/record-creation.md` Step 4 "Linking" (`work-backend: github-issues`, `work-links: native`) describes the parent ↔ sub-issue and blocked-by writes as per-edge `gh api` calls the model assembles itself. Measured on the #592 decomposition (6 sub-issues, 9 dependency edges): 22 main-thread tool calls — 2 GraphQL id lookups, 6 `sub_issues` POSTs, 11 `dependencies/blocked_by` POSTs, 1 shell loop the worktree-isolation guard refused, 2 discovery greps — before any red-team or self-review work began. #608 fixes the two documentation defects in those snippets (wrong identifier kind; unnamed endpoint) but leaves the per-edge assembly in place.
- The composition half of the same step is already a module layer: `bin/lib/issues/record.js` (`recordPayload`, `extractFingerprint`, `buildNativeDependencyQuery`), `bin/lib/issues/local-store.js` (`createRecord`, `deriveSlug`), `bin/lib/issues/grouping.js`. Linking has no equivalent — nothing in `bin/lib/issues/` resolves numbers → database IDs or issues the two writes.
- `bin/lib/issues/capabilities-probe.js` is the pattern to mirror: an injectable `runner(args)` invoked as `gh ${args}` (never the real `gh` in tests), one GraphQL call, independent try/catch per probe, fail-safe results. `bin/lib/issues/claims.js` shows the same runner-injection idiom for writes.
- `skills/_shared/github-write-transport.md` maps plain CRUD (`create`, `edit`, `comment`, `close`, `list`, `view`) to GitHub MCP tools for the `gh`-absent path. It has **no row** for the sub-issues or dependencies REST endpoints — they are `gh api` calls, not CRUD — and the GitHub MCP toolset offers no sub-issue/dependency write today.
- `skills/specify/red-team.md` "Synthesis path (record #220)": when the resolver returns `frontier`, the write-back is dispatched as one Frontier singleton handed "every persona's raw findings plus the current record body". It is not handed the brainstorm's decision history, so on a decomposition whose findings turn on design decisions not yet written into the record, the caller predictably declines the dispatch (this happened on #592 — the main thread ran the write-back). Instruction-efficacy gap: the text offers a dispatch its own input contract makes unattractive in exactly the case it targets.

## Deliverables

- [ ] New `bin/lib/issues/link.js` exporting: `resolveDatabaseIds({owner, repo, numbers, runner})` → `Map<number, databaseId>` via **one** GraphQL query with per-number aliases (`i595: issue(number:595){databaseId}`), throwing on any missing number (never a silent partial map); `linkSubIssues({owner, repo, parent, subs, ids, runner})` → one `POST issues/{parent}/sub_issues` per sub with `sub_issue_id=<databaseId>`; `linkBlockedBy({owner, repo, edges, ids, runner})` → one `POST issues/{dependent}/dependencies/blocked_by` per edge with `issue_id=<blocker databaseId>`. Each write is independently try/caught and reported (`{ok: [...], failed: [{edge, error}]}`) — one failed edge never aborts the rest, matching Step 4's existing "a failed link gets noted and the pass continues" rule. Runner injectable exactly as in `capabilities-probe.js`; default runner is `execFileSync('gh', args)`.
- [ ] New CLI `bin/link-records.js`: `node bin/link-records.js --parent 592 --subs 595,597,598 --blocked-by "598:595,598:597,600:530"` (each edge `dependent:blocker`; blockers may be records outside the batch). Resolves owner/repo from `git remote get-url origin` (or `--repo owner/name`). Prints a JSON envelope `{ids: {...}, subIssues: {ok, failed}, blockedBy: {ok, failed}}` and exits non-zero only when the GraphQL id resolution itself fails (a partial write is exit 0 with `failed` populated — the caller reads it). Idempotent re-run: a `sub_issues` or `blocked_by` POST that returns 422 "already exists" is reported under `ok` with `already: true`, so resume after a partial run is safe.
- [ ] `gh`-absent posture, stated honestly: `link.js` requires `gh` — there is no MCP equivalent for these two endpoints. When `command -v gh` fails, `bin/link-records.js` exits 2 with a one-line message naming the fallback (`work-links: body-text` — Step 4's existing text-based linking, which needs only `issue_write`), and `record-creation.md` says so beside the command. Do **not** add a row to `_shared/github-write-transport.md` claiming an MCP path that does not exist.
- [ ] `skills/specify/record-creation.md` Step 4, `work-links: native` branch: replace the two `gh api` snippets (post-#608 form, or pre-#608 if this lands first) with the single `node "${CLAUDE_PLUGIN_ROOT}/bin/link-records.js" …` invocation, its argument shape, how to read `failed`, and the `gh`-absent fallback sentence. Body-text branch and local-files branch unchanged.
- [ ] `docs/plugin-structure.md`: add `bin/link-records.js` to the standalone-CLI list and `bin/lib/issues/link.js` to the module table; `docs/skill-graph.md` needs no edge (specify → its own bin helper is intra-plugin tooling, same as `record.js`).
- [ ] `skills/specify/red-team.md` "Synthesis path": one sentence added to the singleton's input list — "plus, when the run followed a brainstorm in this same session, the brainstorm's decision summary (the design doc's rationale section, or the parent record's `## Decision Rationale` once written)" — so the agent has what the caller has. Keep the degraded main-thread path unchanged.
- [ ] Tests `tests/bin-lib/issues/link.test.js`: fake runner asserting (a) exactly one GraphQL call for N numbers with N aliases; (b) missing-number throw; (c) `sub_issue_id` and `issue_id` carry the resolved databaseId, never the number; (d) one failed POST leaves siblings in `ok`; (e) 422 already-exists → `ok` with `already: true`. Plus a CLI smoke test invoking `bin/link-records.js --help`.

## Acceptance Criteria

1. `node bin/link-records.js --parent 592 --subs 595 --blocked-by "598:595" --repo thomasholknielsen/claude-tweaks` against a fake runner (test) issues 1 GraphQL call + 1 `sub_issues` POST + 1 `blocked_by` POST, with numeric databaseIds in both POST bodies — asserted by `tests/bin-lib/issues/link.test.js`.
2. `grep -n "link-records.js" skills/specify/record-creation.md` returns the native-branch invocation, and `grep -n 'sub_issue_id=' skills/specify/record-creation.md` returns nothing (the raw snippet is gone from Step 4).
3. `grep -n "requires gh\|no MCP equivalent\|work-links: body-text" skills/specify/record-creation.md` shows the `gh`-absent fallback sentence beside the command; `git diff -- skills/_shared/github-write-transport.md` is empty.
4. `grep -n "decision summary\|Decision Rationale" skills/specify/red-team.md` returns the added synthesis-input sentence.
5. `node bin/link-records.js` with `gh` unavailable (test: `PATH` without gh, or an injected failing `command -v`) exits 2 with the fallback message.
6. `npm test` passes; `node --test tests/bin-lib/issues/link.test.js` passes and fails when (c) is broken by passing numbers instead of ids (revert-check before committing).
7. `git diff --stat` touches only: `bin/link-records.js`, `bin/lib/issues/link.js`, `skills/specify/record-creation.md`, `skills/specify/red-team.md`, `docs/plugin-structure.md`, `tests/bin-lib/issues/link.test.js`.

## Technical Approach

Mirror `capabilities-probe.js` for structure (injectable runner, one GraphQL query, per-call try/catch, fail-safe reporting) and `record.js`'s `buildNativeDependencyQuery` for query-string assembly. The CLI is a thin arg parser over `link.js`. `record-creation.md` shrinks by two snippets and gains one command line. If #608 lands first, this replaces its corrected snippets and its prose-pin test is updated to pin the helper invocation instead (adjust `tests/specify-record-creation-linking.test.js` in the same change); if this lands first, #608 closes as absorbed.

### Data / API Surface

- `link.js`: `resolveDatabaseIds`, `linkSubIssues`, `linkBlockedBy` (signatures above); all accept `runner`.
- CLI flags: `--parent <n>`, `--subs <n,n,…>`, `--blocked-by "<dependent:blocker>,…"`, `--repo <owner/name>` (optional), `--help`.
- Exit codes: 0 success or partial-with-`failed`; 1 id-resolution failure; 2 `gh` unavailable.

### Key Files

- `bin/lib/issues/link.js` — new
- `bin/link-records.js` — new
- `skills/specify/record-creation.md` — Step 4 native branch
- `skills/specify/red-team.md` — synthesis-input sentence
- `docs/plugin-structure.md` — CLI + module rows
- `tests/bin-lib/issues/link.test.js` — new

### Package Dependencies

None — Node built-ins only, per `bin/` convention.

## Gotchas

- GraphQL `id` is the node ID (`I_kwDO…`); REST wants `databaseId`. Query `databaseId` explicitly.
- Use `-F` (typed) not `-f` (string) for the id fields so they are sent as integers.
- The worktree-isolation Bash guard refuses shell loops — which is why per-edge calls cost one tool call each today; the helper is one call regardless of N. Do not implement the CLI as a shell script that loops.
- Modules live flat under `bin/lib/issues/` — no nested `_shared/` wrapper (that convention is `skills/_shared/` only).
- Never claim an MCP path for these endpoints; the honest fallback is `work-links: body-text`.
- Blockers outside the batch (e.g. `600:530`) must be included in the id-resolution query — the CLI collects every number appearing anywhere in `--parent`, `--subs`, `--blocked-by` into one query.
- Related: #608 is the minimal doc-only fix for the same two snippets; whichever ships second adapts to the first (see Technical Approach).

## Original request

specify Step 4 linking helper: bin/link-records.js resolves databaseIds once and issues sub_issues + blocked_by writes

**Related:** #608 (the two endpoint defects this would absorb), #592 (the run that measured it)

Context: A six-sub-issue decomposition spent 22 main-thread gh api calls on linking (2 GraphQL id lookups, 6 sub_issues POSTs, 11 blocked_by POSTs, 1 loop the worktree guard refused, 2 discovery greps) — the composition half already has record.js/local-store.js, the linking half has nothing. Session-evaluation finding, Automation efficiency lens. Also fold in: red-team.md's Frontier synthesis singleton receives persona findings + record body but never the brainstorm's decision history, so a caller holding unwritten design decisions predictably declines the dispatch (Instruction efficacy lens) — either feed it that context or state main-thread is expected there.

Scope: bin/link-records.js backed by bin/lib/issues/link.js — --parent N --subs N,N --blocked-by "598:595,…" — one GraphQL databaseId batch, then the POSTs, gh-absent path via _shared/github-write-transport.md; record-creation.md Step 4 cites the one command; tests for id resolution.

