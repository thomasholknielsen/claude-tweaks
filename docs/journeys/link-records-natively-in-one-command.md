---
files:
  - plugin/bin/link-records.js
  - plugin/bin/lib/issues/link.js
  - plugin/skills/specify/record-creation.md
---

# Link a Decomposition's Records Natively in One Command

**Persona:** A `/claude-tweaks:specify` operator (a claude-tweaks maintainer, or an agent following Step 4 in a `work-backend: github-issues` + `work-links: native` project) who has just created a parent record and its sub-issues and needs GitHub's native sub-issue and blocked-by relationships wired without hand-assembling one `gh api` call per edge.
**Goal:** Resolve every needed integer database ID in one GraphQL call and land every sub-issue link and dependency edge with one CLI invocation, reading one JSON envelope for what succeeded, what already existed, and what failed.
**Entry point:** A terminal at the project checkout root, `gh` authenticated, the record numbers from Step 3 in hand.
**Success state:** One envelope on stdout whose `subIssues.ok` lists every sub-issue, `blockedBy.ok` lists every edge, both `failed` arrays are empty (or name exactly the edges to retry), and re-running the same command reports every edge as `already: true` with no error.

## Steps

### 1. Wire a full decomposition — terminal
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/link-records.js" --parent 592 --subs 595,597,598 --blocked-by "598:595,598:597"`
- **Action:** Run once with the parent, every sub-issue, and every `dependent:blocker` edge (blockers may be records outside the batch).
- **Should feel:** One command where there used to be a dozen — no per-edge assembly, no manual `databaseId` lookup.
- **Should understand:** Both native endpoints take the target's integer database ID in the body, never its issue number; the CLI resolves every number in one aliased GraphQL call (`resolveDatabaseIds`) and then POSTs each edge independently, so one failed edge never aborts the rest. The envelope's `ids` map shows the resolved IDs; `subIssues`/`blockedBy` each carry `{ok, failed}`.
- **Red flags:** Exit 1 (`missing databaseId for #N`) — a number that resolves to no issue; check the numbers, don't retry blindly. Exit 2 with usage — malformed flags (a negative/zero number, a `598:` pair with a missing side, `--repo` with no value).

### 2. Re-run safely — idempotency
- **URL:** the same command again
- **Action:** Re-run after a partial failure or an interrupted `/specify`.
- **Should feel:** Boring — nothing duplicates, nothing errors.
- **Should understand:** GitHub answers an already-linked edge with a 422 whose message says "already…"; the CLI folds that into `ok` with `already: true` rather than `failed`, so resume-after-partial is safe by construction.
- **Red flags:** An `already`-shaped 422 landing in `failed` (the heuristic missed GitHub's wording — report it; the write is still safe, only the label is wrong).

### 3. Wire a single dependency edge only — blocked-by-only
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/link-records.js" --blocked-by "610:608"`
- **Action:** Run with no `--parent`/`--subs` — the shape `/claude-tweaks:backlog refine`'s single-edge repair uses when it points at "the same dependency API `/specify`'s Step 4 linking uses".
- **Should feel:** The CLI accepts either link kind alone; only *neither* is a malformed invocation.
- **Should understand:** `subIssues` comes back `{ok: [], failed: []}` — nothing was asked of it — and `blockedBy.ok` names the one edge.
- **Red flags:** Exit 2 with "at least one of --parent+--subs or --blocked-by is required" when you did pass an edge — check the pair format (`dependent:blocker`, both positive integers).

### 4. Run where `gh` is absent — the honest fallback
- **URL:** the same command in a sandbox without `gh` on `PATH`
- **Action:** Invoke the CLI.
- **Should feel:** A clear stop with a named alternative, not a mystery failure.
- **Should understand:** Exit 2 with a message that these two endpoints have no GitHub MCP equivalent and that the fallback is `work-links: body-text` (`plugin/skills/specify/record-creation.md` Step 4's text-based linking, which needs only `issue_write`). `_shared/github-write-transport.md` deliberately carries no MCP row for them.
- **Red flags:** Any attempt to invent an MCP path for these endpoints; `--help` probing `gh` (it must not — `--help` exits 0 before the availability check).
