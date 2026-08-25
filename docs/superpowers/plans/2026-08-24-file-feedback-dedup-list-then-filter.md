# file-feedback.js findDuplicate: list-then-filter (#1094)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `plugin/bin/lib/feedback/file-feedback.js`'s `findDuplicate` uses `gh issue list --search
<marker>` for its authoritative fingerprint-marker dedup lookup — the exact anti-pattern
`plugin/skills/_shared/github-write-transport.md` prohibits ("Never use `search_issues` (or
`gh issue list --search`) for a find-by-marker/dedup lookup"), since `--search` rides GitHub's
eventually-consistent search index (root cause of #1016/#1079/#1089). Convert `findDuplicate` to
the mandated list-then-filter approach, reusing the already-existing
`plugin/bin/lib/issues/dedup-lookup.js`'s `findByMarker` primitive — the same idiom
`plugin/skills/_shared/headless-self-report.md` already documents and uses (plain `gh issue list`
with no `--search`, then in-process marker match).

**Architecture:** No new module. `findDuplicate({ repo, marker, runner })` changes its `runner`
call from `['issue', 'list', '--repo', repo, '--search', marker, '--state', 'all', '--json',
'number,title']` to `['issue', 'list', '--repo', repo, '--state', 'all', '--json',
'number,title,body,createdAt', '--limit', '500']`, parses the JSON array, and delegates the
in-process match to `findByMarker(issues, marker)` (imported from `../issues/dedup-lookup`),
returning `result ? result.canonical : null` — preserving the existing return shape (`{ number,
title, ... } | null`) so both call sites (`fileOne`'s pre-create dedup check,
`createWithDedupSafeRetry`'s post-transient-failure safety-net recheck) need no changes.

**Tech Stack:** Node.js (`node --test`), no new dependencies — `dedup-lookup.js` already exists
and is already tested (`tests/bin-lib/issues/dedup-lookup.test.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-24T183144-record-1094/work/1094-spec.md` (materialized
from GitHub issue #1094) in this worktree.

## Global Constraints

- Scope is narrowly `file-feedback.js`'s `findDuplicate` only — the spec's Deliverables name only
  this function; `/claude-tweaks:feedback`'s Step 4 advisory dedup search (a separate,
  intentionally coarse component-name search, already documented as non-authoritative in
  `skills/feedback/SKILL.md`) is explicitly out of scope.
- `github-write-transport.md` itself needs no edit — it already documents the mandated
  `findByMarker` idiom by name; the contradiction lives entirely in `file-feedback.js`'s
  non-compliant implementation.
- Preserve `findDuplicate`'s existing signature and return shape exactly — both call sites
  (`fileOne`, `createWithDedupSafeRetry`) read `hit.number` and treat `null` as "no match"; no
  caller-side changes should be needed.
- `--limit 500` (not `--limit 10` or unlimited): matches the precedent
  `headless-self-report.md` sets for the same idiom on a per-caller-scoped issue set. Feedback
  issues are filed one repo (`thomasholknielsen/claude-tweaks`) at a time by this one CLI, so
  500 is a generous ceiling for this dedup check's purpose (finding one prior filing by an exact
  8-hex fingerprint marker), not a pagination promise.

---

### Task 1: Convert `findDuplicate` to list-then-filter

**Files:**
- Modify: `plugin/bin/lib/feedback/file-feedback.js`
- Modify: `tests/bin-lib/feedback/file-feedback.test.js`

**Interfaces:**
- Consumes: `findByMarker(issues, markerPattern)` from `plugin/bin/lib/issues/dedup-lookup.js` —
  `issues: [{ number, body, createdAt, ... }]`, `markerPattern: string | RegExp` (exact substring
  match against `body`) → `{ canonical, duplicates } | null`.
- `findDuplicate({ repo, marker, runner })` return shape is unchanged: the matched issue object
  (now shaped `{ number, title, body, createdAt }` instead of `{ number, title }` — a superset,
  so `hit.number` at both call sites is unaffected) or `null`.

- [ ] **Step 1: Update the failing tests first**

  In `tests/bin-lib/feedback/file-feedback.test.js`, every fake `runner`'s `isList(args)` branch
  currently asserts `flagValue(args, '--search')` and returns bare `{ number, title }` objects,
  implicitly relying on server-side `--search` filtering. Update each to the new contract: no
  `--search` flag is ever sent; the fake instead returns the **full candidate list** (including
  non-matching issues, to prove the in-process filter — not the fake — does the matching), and
  matching entries carry a `body` field containing the literal marker string (the field
  `findByMarker` filters on).

  Specific edits:
  - `'fileOne: dedup hit skips filing entirely'` (line ~154): drop the
    `assert.equal(flagValue(args, '--search'), marker)` line (no `--search` flag exists anymore);
    change the returned array to `[{ number: 501, title: 'existing dup', body: \`some body\n${marker}\n\`, createdAt: '2026-01-01T00:00:00Z' }]`.
  - `'CLI: 2-draft batch with a dedup-hit and a clean file exits 0...'` (line ~234) and
    `'CLI --dry-run: zero create calls across a multi-draft batch...'` (line ~292): replace the
    `--search`-keyed branching (`flagValue(args, '--search')`) with a single `isList` branch that
    returns **one combined array** covering both drafts' fixtures — an entry whose `body` contains
    `markerA` (dedup hit) and no entry for `markerB` (dedup miss) — since the fake can no longer
    tell which draft's search this is (there is no more per-draft `--search` call to distinguish
    them; both drafts' dedup checks now hit the same plain list).
  - Add one new test proving the in-process filter actually filters (not just happens to pass
    because the fake pre-filtered): a `runner` returning a list where an issue's `body` contains
    an *unrelated* fingerprint marker, and assert `findDuplicate` returns `null` for a different
    marker — i.e. `findDuplicate` must not treat "the list is non-empty" as a hit.
  - Add one test asserting the exact `gh issue list` argv shape:
    `['issue', 'list', '--repo', repo, '--state', 'all', '--json', 'number,title,body,createdAt', '--limit', '500']`
    with no `--search` flag present anywhere in the args array (`assert.equal(args.includes('--search'), false)`).

  Run: `node --test tests/bin-lib/feedback/file-feedback.test.js`
  Expected: FAIL (implementation still sends `--search` and returns bare objects the updated fakes
  no longer shape that way)

- [ ] **Step 2: Implement**

  In `plugin/bin/lib/feedback/file-feedback.js`:
  1. Add `const { findByMarker } = require('../issues/dedup-lookup');` near the top (alongside the
     existing `fingerprint` require).
  2. Replace `findDuplicate`'s body and its doc comment:

  ```js
  // { repo, marker, runner } -> first matching issue { number, title, body,
  // createdAt } or null. Plain list-then-filter, per
  // `_shared/github-write-transport.md`'s prohibition on `gh issue list
  // --search`/`search_issues` for a find-by-marker/dedup lookup (both ride
  // GitHub's eventually-consistent search index — root cause of #1016/#1079/
  // #1089). Reuses the same findByMarker idiom `_shared/headless-self-report.md`
  // already documents. One call per draft: dedup is cheap and per-item
  // fail-safe matters more here than batching — unlike link.js's databaseId
  // resolution, there's no shared batch call to make.
  function findDuplicate({ repo, marker, runner = defaultRunner }) {
    const out = runner(['issue', 'list', '--repo', repo, '--state', 'all', '--json', 'number,title,body,createdAt', '--limit', '500']);
    const issues = JSON.parse(out);
    const result = findByMarker(Array.isArray(issues) ? issues : [], marker);
    return result ? result.canonical : null;
  }
  ```

  Run: `node --test tests/bin-lib/feedback/file-feedback.test.js`
  Expected: PASS

- [ ] **Step 3: Full verification**

  Run: `npm test`
  Expected: PASS (full suite green, or only the pre-existing accepted flake classes named in
  CLAUDE.md's Commands section — `tests/changelog-coverage.test.js` on a stale branch,
  `tests/bin-lib/reconcile/pr-state.test.js`'s event-loop flake under load)
