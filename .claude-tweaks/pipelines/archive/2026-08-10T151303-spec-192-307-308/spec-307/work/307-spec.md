---
record: 307
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: worktree-concurrency-hardening:posttooluse-backstop
blocked-by: [192]
surface: backend
---
# 307: Add EnterWorktree staleness backstop + plugin.json hand-edit guardrail to post-tool-use.js

Surface: backend

## Overview

Add a warn-tier mechanical backstop so a future worktree-creation call site that forgets to
cite `skills/_shared/worktree-setup.md`'s catch-up procedure (leaf #192) still gets caught
instead of silently reopening today's gap. Extend the existing `checkPluginVersionBump`
handler in the same file with a second, unrelated but same-trigger check: flag when a commit
touching `.claude-plugin/plugin.json`'s version doesn't match `bin/release.js`'s own commit
shape — `bin/release.js`'s version-bump race handling is otherwise already correct (verified:
`bin/lib/release/run.js` lines 43-50 re-fetches `origin/main` and asserts ancestry immediately
before push), so a hand-edit bypassing the script entirely is the one residual hole.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Auto-merging origin into a worktree from this hook. It only warns — the catch-up itself
  stays agent/skill-driven, per #192's own procedure.
- Denying (hard-blocking) either check. Both are warn-tier only, matching this file's existing
  nudges — no new autonomous-mutation or block-tier category.
- Covering the `git worktree add` fallback path (`scratch-worktree.md` Step 1a) — that path
  already carries its own unconditional catch-up (Section 3, cited from #192's new shared file)
  independent of this hook; this leaf's backstop targets the native `EnterWorktree` tool call
  specifically.
- Changing `bin/release.js`'s precheck/ancestry-check logic — already correct, not touched.
- Building this as a second, independent handler alongside `checkPluginVersionBump`. `run()`
  (`bin/lib/hooks/post-tool-use.js`) returns on the first non-null check result — a second
  competing handler on the same trigger (a commit touching `plugin.json`) would silently starve
  whichever one doesn't run first. The release-bypass check is an addition *inside*
  `checkPluginVersionBump`, not a new function.

## Current State

- `bin/lib/hooks/post-tool-use.js` — E2: commit breadcrumbs (log tier) + closing-keyword check
  (warn tier) + design-doc capture nudge (warn tier) + `checkPluginVersionBump` (warn tier,
  lines 192-243): fires unconditionally whenever a commit touches
  `.claude-plugin/plugin.json`, parses the manifest at that commit via `JSON.parse`, and warns
  about outstanding CHANGELOG/shipped-record/marketplace-mirror steps. This leaf adds the
  release-bypass check as one more `outstanding` line inside this existing function, and adds
  a wholly separate `EnterWorktree`-keyed handler for the staleness backstop.
- `bin/lib/hooks/worktree-reap.js` — already exports `resolveIntegrationBranch` (used by the
  `SessionStart` reaper). Its documented fallback ladder is scoped to that specific consumer —
  no explicit arg, no template reader, current-branch excluded (per
  `skills/_shared/integration-branch.md`'s per-consumer table). Reuse this function directly if
  its fallback profile fits an `EnterWorktree`-triggered hook (no explicit arg either, similar
  profile); if it doesn't fit exactly, write a narrow adaptation rather than a full
  reimplementation of the ladder in a third place.
- `skills/_shared/worktree-setup.md` — the canonical catch-up procedure this leaf's first check
  backstops (created by leaf #192; read its `## Post-creation catch-up` section for the exact
  fetch+merge shape this hook's own fetch+ahead-count logic should match, not drift from).
- `bin/lib/release/compose.js` — the only writer of `.claude-plugin/plugin.json`'s version
  field in code, reached only through `bin/lib/release/run.js`; a hand-edit via `Edit`/`Write`
  bypasses it entirely today with no signal.
- Existing test convention for this module: `tests/hooks-post-tool-use-closing-keyword.test.js`,
  `tests/hooks-post-tool-use-design-doc.test.js`, `tests/hooks-post-tool-use-plugin-version-bump.test.js`
  — flat files under top-level `tests/`, matched by `package.json`'s `node --test tests/` glob.
  There is no `bin/lib/hooks/tests/` directory for this module.

## Deliverables

- [ ] New handler in `bin/lib/hooks/post-tool-use.js` keyed on `tool_name === 'EnterWorktree'`:
      resolve the integration branch (reuse `worktree-reap.js`'s `resolveIntegrationBranch`, or
      a narrow adaptation if its fallback profile doesn't fit — see Current State),
      `git fetch origin {integration-branch}` with a 20s timeout (same `execFileSync` timeout
      pattern as `compareRoutineRecords` in `bin/lib/routine-template-parser.js`), then compare
      `git rev-list --count HEAD..origin/{integration-branch}` from the created worktree's
      path. If greater than 0, emit a warn-tier `systemMessage` naming the commit count and
      pointing at `skills/_shared/worktree-setup.md`. If the fetch fails or times out, log that
      distinctly (not silently identical to the N=0 case) and emit no warn message — a reader
      of `events.jsonl` should be able to tell "checked, clean" apart from "check didn't run."
- [ ] Resolve the `EnterWorktree` tool result's shape as the first task: if its result payload
      exposes the created worktree's path directly, use it. If not, diff
      `git worktree list --porcelain` immediately before and after the tool call and take the
      new entry — this is the stated fallback, not an open question to leave for
      implementation time.
- [ ] Extend `checkPluginVersionBump` (not a new function — see Non-Goals): after parsing the
      manifest at the commit, also compare the manifest's `version` field against the *parent*
      commit's manifest (`git show {commit}^:${PLUGIN_MANIFEST_PATH}`, JSON-parsed the same way
      the function already parses the current commit — not a textual/staged-hunk heuristic,
      and not index/staged state, since this handler runs `PostToolUse`, after the commit
      already landed). Skip commits with more than one parent (merge commits) — a legitimate
      merge carrying a concurrent release's version bump must not read as a bypass. When the
      version changed and the commit message doesn't match `^Release v[\d.]+ — `, append
      "`bin/release.js` appears to have been bypassed for this version change" to the existing
      `outstanding` list before rendering the `systemMessage`.
- [ ] Both the new `EnterWorktree` handler and the `checkPluginVersionBump` extension fail open
      on any error (fetch failure, unparseable tool result, unreadable diff) — log and continue
      via the log tier (`events.jsonl` when a run dir resolves; otherwise no durable trace, same
      as this file's other checks), never throw — matching this file's "never break a session"
      rule (every hook path exits 0).
- [ ] Unit tests: `tests/hooks-post-tool-use-worktree-staleness.test.js` (new handler) and an
      addition to `tests/hooks-post-tool-use-plugin-version-bump.test.js` (release-bypass
      extension) — both using mocked `git`/tool-result inputs, never live command output (see
      Gotchas).
- [ ] Confirm `tests/hooks-dispatcher.test.js`'s garbage-stdin invariant still passes for both
      changes, and that `tests/hooks-gate-coverage.test.js`'s `GATE_COVERAGE` assertion needs no
      change (neither is block-tier).

## Acceptance Criteria

1. Creating a worktree via `EnterWorktree` whose branch is behind the resolved integration
   branch's `origin/{branch}` by N > 0 commits produces a warn-tier `systemMessage` containing
   the commit count and a pointer to `skills/_shared/worktree-setup.md`; N = 0 produces no
   message; a fetch failure/timeout produces no warn message but a distinct log entry from the
   N = 0 case.
2. A commit that changes `.claude-plugin/plugin.json`'s `version` field (parent-vs-current
   JSON comparison, not textual matching) with a commit message not matching
   `^Release v[\d.]+ — ` adds the bypass line to `checkPluginVersionBump`'s existing
   `systemMessage`; a commit whose message does match adds nothing; a commit that touches the
   file without changing `version`, or that has more than one parent, triggers neither the
   existing outstanding-steps checks' version-dependent lines nor the new bypass line for that
   reason alone.
3. Neither handler ever sets a non-zero process exit or denies the triggering action —
   `tests/hooks-dispatcher.test.js`'s garbage-stdin invariant test passes unchanged.
4. `node --test tests/hooks-post-tool-use-worktree-staleness.test.js` and the extended
   `tests/hooks-post-tool-use-plugin-version-bump.test.js` pass, and reverting either predicate
   makes its own new test case fail — not just pass trivially either way (`[IL-105]`).

## Technical Approach

### Key Files

- `bin/lib/hooks/post-tool-use.js` — new `EnterWorktree` handler; extend
  `checkPluginVersionBump`
- `tests/hooks-post-tool-use-worktree-staleness.test.js` — new
- `tests/hooks-post-tool-use-plugin-version-bump.test.js` — extend with the bypass-check cases

## Gotchas

- The `git worktree list --porcelain` lock-reason format and any tool-result field names used
  here are unversioned implementation details this plugin doesn't own — write tests against
  frozen fixtures, never live command/tool output, the same hazard ADR-0004 names for a
  different case (`[IL-80]`).
- Every hook path must exit 0 regardless of outcome — `bin/hooks.js`'s dispatcher contract
  ("Never break a session"). A thrown error, a non-zero exit, or an unbounded hang (the fetch
  timeout exists specifically to prevent the last one) from either change is a regression even
  if the warn message itself would have been correct.
- `[IL-105]`: when writing the new tests, verify by reverting the predicate under test and
  confirming the test actually fails — a test that passes whether the code is right or wrong
  proves nothing.
- Don't reimplement `resolveIntegrationBranch`'s ladder a third time (`skills/_shared/
  integration-branch.md` prose, `worktree-reap.js`'s JS copy, and a hypothetical new one here)
  — reuse the existing function or a narrow, explicitly-scoped adaptation of it, never a fresh
  parallel implementation.


<!-- work-fingerprint: worktree-concurrency-hardening:posttooluse-backstop -->
