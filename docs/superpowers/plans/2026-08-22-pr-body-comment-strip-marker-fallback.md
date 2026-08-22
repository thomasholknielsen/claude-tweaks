# PR Body HTML-Comment-Strip Marker Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the confirmed root cause of #929 (the GitHub MCP server's `pull_request_read` sanitizes PR bodies on the *read* path only, stripping HTML comments — the actual stored body from `create_pull_request`/`update_pull_request` is untouched) and ship a dual-marker scheme (HTML comment + plain-text companion) that survives that sanitization, so `pr-early-run-lifecycle.md`'s marker-based recognition and phase-checklist-update work correctly on a `gh`-absent (MCP-transport) run.

**Architecture:** Pure documentation change to two `_shared/*.md` skill-prose files plus their pinning tests. No new code — the marker recognition procedure is prose-driven (grepped: no `bin/lib/` module implements it). Emit both the existing HTML-comment markers (unchanged, for the common `gh`-present path where reads go through `gh`/REST and are never sanitized) and a new plain-text companion line/pair (no `<`/`>` characters, so bluemonday's `isHTMLInert` fast path in the MCP server's `pkg/sanitize` never touches it) for the `gh`-absent MCP path. `github-write-transport.md` gains a documented Pull Request create/update row (previously explicitly absent), replacing the stale "no MCP fallback for pull requests" claim.

**Tech Stack:** Markdown skill-prose files (`plugin/skills/_shared/*.md`), `node --test` prose-conformance suites.

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-929/.claude-tweaks/pipelines/2026-08-22T052223-record-929/work/929-spec.md`

## Global Constraints

- Never remove a phrase a pinning test currently asserts is present (`tests/pr-early-run-lifecycle.test.js`, `tests/pr-early-run-lifecycle-degrade-warning-conformance.test.js`) unless that test is updated in the same task to assert the new, deliberately-changed behavior.
- The `<!-- claude-tweaks-run: {run-id} -->` line stays the literal, unconditional first line of the PR body — only append after it, never replace it.
- `github-pr-scan.md`'s mechanical regex (`const RUN_MARKER = /<!-- claude-tweaks-run: [^\s]+ -->/;`) and every other existing `gh`-present consumer of the HTML-comment markers must keep working unchanged — this plan only *adds* a companion form, it never removes the HTML-comment form.
- Root cause is sourced from `github/github-mcp-server`'s own code (fetched live via `gh api repos/github/github-mcp-server/contents/...`): `pkg/github/minimal_types.go`'s `convertToMinimalPullRequest` calls `sanitize.Sanitize(pr.GetBody())` (read path only); `pkg/github/pullrequests.go`'s `CreatePullRequest`/`UpdatePullRequest` set `newPR.Body`/`update.Body` from the raw param with no sanitize call (write path, unsanitized). `pkg/sanitize/sanitize.go`'s `getPolicy()` builds a `bluemonday.StrictPolicy()` with an explicit `AllowElements(...)` allowlist that never includes comments and never calls `AllowComments()`, so `FilterHTMLTags` strips every `<!-- ... -->` span. State this citation verbatim in the doc edit — don't paraphrase the file/function names.

---

### Task 1: Document root cause + ship dual-marker scheme in `_shared/pr-early-run-lifecycle.md` and `_shared/github-write-transport.md`, update pinning tests

**Files:**
- Modify: `plugin/skills/_shared/pr-early-run-lifecycle.md`
- Modify: `plugin/skills/_shared/github-write-transport.md`
- Modify: `tests/pr-early-run-lifecycle.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (single task).
- Produces: nothing consumed elsewhere in this plan — this is the whole deliverable.

- [ ] **Step 1: Add the root-cause note to `pr-early-run-lifecycle.md`**

  Insert a new section immediately after the file's opening two paragraphs (after the `local-merge runs ... skip this file entirely` paragraph, before `## Callers`):

  ```markdown
  ## Root cause: MCP PR-body sanitization strips HTML comments on read, not write (#929)

  Confirmed against `github/github-mcp-server`'s own source (`gh api repos/github/github-mcp-server/contents/...`), 2026-08-22:

  - **Write path is unsanitized.** `pkg/github/pullrequests.go`'s `CreatePullRequest` and
    `UpdatePullRequest` set the PR body straight from the raw tool-call parameter
    (`newPR.Body = github.Ptr(body)` / `update.Body = github.Ptr(body)`) — no sanitize call.
    A PR created or edited via `mcp__github__create_pull_request`/`update_pull_request`
    stores the body on GitHub byte-for-byte, HTML comments included.
  - **Read path is sanitized.** `pkg/github/minimal_types.go`'s `convertToMinimalPullRequest`
    calls `Body: sanitize.Sanitize(pr.GetBody())` before returning a PR to the calling LLM
    (`GetPullRequest`, the tool behind `pull_request_read get`). `pkg/sanitize/sanitize.go`'s
    `getPolicy()` builds a `bluemonday.StrictPolicy()` with an explicit `AllowElements(...)`
    list that never includes comments and never calls `AllowComments()` — `FilterHTMLTags`
    therefore strips every `<!-- ... -->` span. This is a prompt-injection defense (hidden
    HTML comments are a classic vector for smuggling instructions into content an LLM later
    reads back), not a GitHub API/storage behavior.

  **Consequence:** a PR opened via MCP on a `gh`-absent sandbox genuinely carries the
  `<!-- claude-tweaks-run: -->` / `<!-- phases-start -->` / `<!-- phases-end -->` markers on
  GitHub's stored body — but any later read of that same PR *through the MCP transport*
  (`pull_request_read`, or the implicit re-fetch inside `update_pull_request`) returns a body
  with those markers invisibly gone, even though a `gh pr view`/REST read of the identical PR
  would show them intact. A gh-absent phase-checklist-update or reconciler pass that reads via
  MCP therefore has nothing to find-and-replace between, even though the markers are really
  there. The fix is not "make the MCP server stop sanitizing" (the sanitization is a
  deliberate, reasonable defense) — it's to also carry a plain-text companion form that never
  looks like an HTML tag to the sanitizer in the first place, so it survives the MCP read path
  unchanged. See "Dual-marker scheme" in Step 3 below.
  ```

- [ ] **Step 2: Add the Pull Request row to `github-write-transport.md`'s CRUD mapping section**

  In `plugin/skills/_shared/github-write-transport.md`, immediately after the existing
  paragraph that begins `**Pull requests are not covered by this mapping.**` (the one ending
  `...a documented per-item degrade) rather than leaving it implicit.`), insert:

  ```markdown
  **Exception: PR create/update (#929).** Create and update *are* covered, just not by a table
  row — `gh pr create --body-file`/`gh pr edit --body-file` locally,
  `mcp__github__create_pull_request`/`mcp__github__update_pull_request` when `gh` is absent.
  Unlike every read-side gap named above, this is a write, and the MCP server's PR-body
  sanitization (`_shared/pr-early-run-lifecycle.md`'s "Root cause" section) only ever touches
  what a *read* returns to the LLM — `create_pull_request`/`update_pull_request` write the
  `body` parameter straight through, unsanitized. A caller composing a PR body with
  `_shared/pr-early-run-lifecycle.md`'s dual-marker scheme (HTML comment + plain-text
  companion) can use either transport interchangeably for creation/update; only a *later read*
  of that body needs to pick its marker form per-transport (same file, Phase-checklist update
  section).
  ```

- [ ] **Step 3: Ship the dual-marker scheme — update Step 3's body template**

  Replace the Step 3 body template in `pr-early-run-lifecycle.md`:

  ```markdown
  ```markdown
  <!-- claude-tweaks-run: {run-id} -->

  ### Spec summary

  {one-paragraph summary from the materialized spec's Overview section}

  ### Phases

  <!-- phases-start -->
  - [ ] build
  - [ ] test
  - [ ] review
  - [ ] polish
  - [ ] wrap-up
  <!-- phases-end -->

  ### Resume

  `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" {next-step}`

  Fixes #{n}
  ```
  ```

  with:

  ```markdown
  ```markdown
  <!-- claude-tweaks-run: {run-id} -->
  claude-tweaks-run: {run-id}

  ### Spec summary

  {one-paragraph summary from the materialized spec's Overview section}

  ### Phases

  <!-- phases-start -->
  [claude-tweaks-phases-start]
  - [ ] build
  - [ ] test
  - [ ] review
  - [ ] polish
  - [ ] wrap-up
  [claude-tweaks-phases-end]
  <!-- phases-end -->

  ### Resume

  `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" {next-step}`

  Fixes #{n}
  ```
  ```

  Then update the paragraph right after the template (the one starting `The <!-- claude-tweaks-run: {run-id} --> marker is the **first line**...`):

  ```markdown
  The `<!-- claude-tweaks-run: {run-id} -->` marker is the **first line**, unconditionally,
  immediately followed by a plain-text companion line (`claude-tweaks-run: {run-id}`, no
  comment syntax) — it is the GitHub-side signal the sweep (`sweep-backstop` sub-issue) and the
  reconciler (`bin/lib/reconcile`) key on to recognize a plugin-created PR without a local
  run-dir join. Never omit either line, even when composing by hand.

  **Dual-marker scheme (#929).** Every marker below is written in two forms, always both,
  regardless of transport — the write path never sanitizes either form, so writing both costs
  nothing and there is no transport-detection to get wrong at write time:

  | Purpose | HTML-comment form (unchanged) | Plain-text companion (new) |
  |---|---|---|
  | Run-id marker | `<!-- claude-tweaks-run: {run-id} -->` | `claude-tweaks-run: {run-id}` |
  | Phase-checklist start | `<!-- phases-start -->` | `[claude-tweaks-phases-start]` |
  | Phase-checklist end | `<!-- phases-end -->` | `[claude-tweaks-phases-end]` |

  **Which form a *reader* uses depends on transport, per "Root cause" above:** a `gh`-present
  read (`gh pr view`, `gh api`, or any REST/GraphQL read) sees the real stored body and can key
  on either form — use the HTML-comment form for compatibility with every existing consumer
  (`_shared/github-pr-scan.md`'s `RUN_MARKER` regex, the reconciler, the sweep). A `gh`-absent
  read going through `pull_request_read` (or `update_pull_request`'s own re-fetch) has every
  `<!-- ... -->` span stripped from what it returns — key on the plain-text companion form
  instead. Neither form is ever removed once written, so a run that starts `gh`-absent and
  later gains `gh` (or vice versa) never loses recognition.
  ```

  **Phase checklist rows are delimited by...** paragraph (the one right after): append one
  sentence: "Both delimiter pairs bracket the same checklist rows — the HTML-comment pair
  outermost, the plain-text pair immediately inside it (see the template above) — so either
  reader finds an unambiguous, non-overlapping span to replace."

- [ ] **Step 4: Update the Phase-checklist update procedure to be transport-aware**

  In the `## Phase-checklist update (every phase exit)` section, replace the bullet:

  ```markdown
  - **Set**: read the current body, flip that phase's checklist row from `- [ ] {phase}` to
    `- [x] {phase}` between the `<!-- phases-start -->`/`<!-- phases-end -->` markers only, leaving
    everything else in the body untouched, then:
  ```

  with:

  ```markdown
  - **Set**: read the current body — `gh pr view {number} --json body` when `gh` is present,
    `mcp__github__pull_request_read` (`get` method) when it is absent (`_shared/github-write-transport.md`'s
    Detection rule). Locate the checklist span using whichever delimiter pair this read
    actually returned: the `<!-- phases-start -->`/`<!-- phases-end -->` pair on a `gh`-present
    read (the real body, unsanitized); the `[claude-tweaks-phases-start]`/`[claude-tweaks-phases-end]`
    pair on a `gh`-absent MCP read (the HTML-comment pair is invisibly stripped from what this
    read returns, per "Root cause" above, even though it still exists in the stored body). Flip
    that phase's checklist row from `- [ ] {phase}` to `- [x] {phase}` inside whichever span was
    found, leaving everything else — including the *other* delimiter pair, which this read may
    not even show — untouched, then write back through the same transport that did the read:
  ```

  And change the `gh pr edit` write command's surrounding sentence to note the MCP alternative:
  add, right after the existing `gh pr edit {number} --repo {owner}/{repo} --body-file
  /tmp/pr-checklist-{n}.md` code block: "`gh`-absent: `mcp__github__update_pull_request` with
  the same composed body — this write is unsanitized (Root cause above), so it carries both
  delimiter pairs through untouched regardless of which one was used to locate the span."

- [ ] **Step 5: Update the Skip/degrade behavior table's `gh` absent row**

  Replace the table row:

  ```markdown
  | `gh` absent | Same degrade as a push/create failure, distinguished reason: `_shared/github-write-transport.md`'s CRUD mapping carries no pull-request row, so there is no MCP fallback to attempt for PR creation (unlike issue operations, which do have one). Log `reason: gh-absent — no MCP fallback for pull requests`. |
  ```

  with:

  ```markdown
  | `gh` absent | No longer a degrade (#929) — `mcp__github__create_pull_request`/`update_pull_request` is the documented fallback (`_shared/github-write-transport.md`'s Pull Request create/update exception), using the same dual-marker template as the `gh`-present path. Only a genuine MCP write failure degrades, logged the same as any other Step 2/Step 3 failure above (`reason: gh-absent — mcp__github__create_pull_request failed: {error}`). |
  ```

- [ ] **Step 6: Update the pinning tests in `tests/pr-early-run-lifecycle.test.js`**

  Replace:

  ```javascript
  test('the run marker is the unconditional first line of the PR body', () => {
    assert.match(
      LIFECYCLE,
      /<!-- claude-tweaks-run: \{run-id\} -->\n\n### Spec summary/,
      'the sweep and reconciler key on this marker to recognize a plugin-created PR without a local run-dir join — it must never be conditional or buried',
    );
  });
  ```

  with:

  ```javascript
  test('the run marker is the unconditional first line of the PR body, with its plain-text companion immediately after', () => {
    assert.match(
      LIFECYCLE,
      /<!-- claude-tweaks-run: \{run-id\} -->\nclaude-tweaks-run: \{run-id\}\n\n### Spec summary/,
      'the sweep and reconciler key on the HTML-comment marker for a gh-present recognition; the plain-text companion (#929) is what a gh-absent MCP read sees instead, since the HTML-comment form is invisibly stripped from that read path',
    );
  });

  test('the phase checklist carries a plain-text delimiter pair alongside the HTML-comment pair (#929)', () => {
    assert.match(LIFECYCLE, /\[claude-tweaks-phases-start\]/);
    assert.match(LIFECYCLE, /\[claude-tweaks-phases-end\]/);
  });
  ```

  Replace:

  ```javascript
  test('gh-absent is distinguished from a plain failure by the absence of an MCP fallback for pull requests', () => {
    assert.match(
      LIFECYCLE,
      /no pull-request row.*no MCP fallback|no MCP fallback.*pull requests/s,
      '_shared/github-write-transport.md carries no pull-request row — unlike issue operations, there is no fallback transport to attempt',
    );
  });
  ```

  with:

  ```javascript
  test('gh-absent now has a documented MCP fallback for PR create/update, using the dual-marker scheme (#929)', () => {
    assert.match(
      LIFECYCLE,
      /mcp__github__create_pull_request.*update_pull_request.*documented fallback|documented fallback.*mcp__github__create_pull_request/s,
      '_shared/github-write-transport.md now documents a PR create/update exception — #929 replaced the stale "no MCP fallback" claim once the dual-marker scheme made a gh-absent PR recognizable',
    );
  });
  ```

- [ ] **Step 7: Run the affected suites**

  Run: `node --test tests/pr-early-run-lifecycle.test.js tests/pr-early-run-lifecycle-degrade-warning-conformance.test.js tests/github-rate-limit-conformance.test.js`
  Expected: all PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add plugin/skills/_shared/pr-early-run-lifecycle.md plugin/skills/_shared/github-write-transport.md tests/pr-early-run-lifecycle.test.js
  git commit -m "Document PR-body HTML-comment MCP strip root cause + ship dual-marker fallback (refs #929)"
  ```
