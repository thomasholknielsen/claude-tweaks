# Record #722 — Contest-Card Holder Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `flow/claim-targets.md`'s "Flow: Claim contested" card actionable by rendering holder liveness — sessionId, a same-host worktree match, transcript freshness — as one verdict line with three variants, each carrying its own next step. Still a stop, never a prompt.

**Architecture:** One prose edit in the single-target contest bullet (a liveness-evidence gathering procedure before the card, an extended card template with the verdict line), plus conformance tests appended to `tests/flow-claim-preflight.test.js`. No runtime code — the card is a prose procedure an agent follows; `bin/lib/hooks/worktree-detect.js` is not reused (it detects the *current* session's worktree from tool payloads, not another session's by slug — a plain `git worktree list` grep is the right primitive here, and the spec lists the helper only as "if reused").

**Tech Stack:** Markdown skill files; `node --test` conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044553-spec-720-721-722-723-724/spec-722/work/722-spec.md`

## Global Constraints

- The card remains a **stop** — no `AskUserQuestion` is added anywhere (spec Deliverable 2).
- Absence of a transcript or worktree is evidence, not an error — the card must render a verdict either way and never block on the lookup (spec Gotcha 2).
- The holder transcript path follows `feedback/session-evaluation.md`'s rule (`~/.claude/projects/<project-slug>/<sessionId>.jsonl`, slug = absolute cwd path with `/`, space, `.` → `-`); a session inside a linked worktree writes to a different slug directory, so both the main-checkout slug and worktree-derived slugs are searched before declaring no transcript (spec Gotcha 1).
- `hostname` comparison uses the claim blob's `host` field only — no network probing (spec Gotcha 3).
- The multi-target and transient-failure bullets are untouched (they cite the single-target bullet's mechanics; the transient card has no holder to report).
- Work from the run worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-720-721-722-723-724`.
- Commits reference `refs #722` — never closes/fixes.

---

### Task 1: Liveness evidence + verdict line in the contest card, pinned by conformance tests

**Files:**
- Modify: `skills/flow/claim-targets.md` (single-target contest bullet — the card template block and one new paragraph before it)
- Test: `tests/flow-claim-preflight.test.js` (append two tests)

**Interfaces:**
- Consumes: the claim blob identity fields (`runId`, `sessionId`, `claimedAt`, `ttlHours`, `host`) already exposed by `_shared/issue-claims.md`'s "Reading claim state".
- Produces: nothing later tasks consume (single-task plan).

- [ ] **Step 1: Write the failing conformance tests**

Append to `tests/flow-claim-preflight.test.js`:

```js
test('contest card renders holder liveness — three verdict variants, each with a next step (#722)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /Live sibling on this machine/);
  assert.match(content, /Remote holder/);
  assert.match(content, /Stale holder — no activity since/);
  assert.match(content, /sessionId/);
  assert.match(content, /git worktree list/);
  assert.match(content, /~\/\.claude\/projects\//);
});

test('contest liveness lookup is evidence-gathering, never a gate or a prompt (#722)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /never block on the lookup|evidence, not an error/);
  assert.match(content, /session-evaluation\.md/);
  // the card remains a stop: the section still forbids AskUserQuestion
  assert.match(content, /No `AskUserQuestion`/);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: both new tests FAIL (none of the verdict phrases exist in the file yet); all pre-existing tests still pass.

- [ ] **Step 3: Edit the single-target contest bullet in `skills/flow/claim-targets.md`**

Insert a new paragraph immediately before the existing ```markdown card fence (after the sentence ending "…Then stop the pipeline before Step 3 (no worktree, nothing else left behind):" — change that trailing colon context so the evidence paragraph flows; the exact splice below shows the result). Replace the region from that sentence through the end of the existing card fence with:

````markdown
  Then stop the pipeline before Step 3 (no worktree, nothing else left behind). Before
  rendering the card, gather holder-liveness evidence — read-only, best-effort, never more
  than a few seconds; absence of any artifact is evidence, not an error, and the card must
  render a verdict either way — never block on the lookup:

  1. The blob's identity fields (`runId`, `sessionId`, `claimedAt`, `ttlHours`, `host`) are
     already in hand from "Reading claim state."
  2. **Same host?** Compare the blob's `host` to `hostname` — string equality only, no
     network probing. Different → verdict is **Remote holder**; skip steps 3-4.
  3. **Worktree match:** derive the holder's worktree slug from its `runId` (strip the
     `{ISO-timestamp}-` prefix, prepend `flow-` — e.g. runId `…T210742-spec-686-687` →
     `flow-spec-686-687`) and grep `git worktree list` for it, locked or not.
  4. **Transcript freshness:** the holder's transcript lives at
     `~/.claude/projects/<project-slug>/<sessionId>.jsonl` (path rule per
     `feedback/session-evaluation.md` — slug is the session's absolute cwd with `/`, space,
     and `.` each replaced by `-`). A session inside a linked worktree writes under the
     *worktree's* slug, not the main checkout's — check the main-checkout slug AND the
     worktree-derived slug (from step 3's match, when one exists) before declaring no
     transcript. Take the file's mtime.
  5. **Verdict:** transcript mtime within the last 60 minutes (a judgment default, not a
     protocol constant) → **Live sibling**; same host but no transcript activity within that
     window (or no transcript found) → **Stale holder**; different host → **Remote holder**.

  ```markdown
  ## Flow: Claim contested

  #{target} is already claimed by run {holder-runId} (session {holder-sessionId}, host:
  {holder-host}, claimed {holder-claimedAt}, expires {holder-claimedAt + holder-ttlHours}).

  {one of:
    - Live sibling on this machine — {worktree-path-or-"no worktree found"}, last active
      {age}. Next: wait for it to finish or release; re-run afterward.
    - Remote holder ({holder-host}). Next: inspect that session on its own machine, or wait
      for the claim to expire.
    - Stale holder — no activity since {transcript-mtime-or-"unknown (no transcript found)"}.
      Next: `/claude-tweaks:tidy` to sweep and reclaim, or wait for the TTL to expire.}
  ```
````

  The paragraph after the card (`No AskUserQuestion — …`) stays exactly as-is — the card
  remains a stop.

- [ ] **Step 4: Run the tests to verify all pass**

Run: `node --test tests/flow-claim-preflight.test.js tests/run-dir-timestamp-utc.test.js`
Expected: PASS on both files (the second pins #721's contest-bullet phrases — "remove … immediately", "unset on entry" — which this edit must not disturb; the edited region starts after that sentence).

- [ ] **Step 5: Commit**

```bash
git add skills/flow/claim-targets.md tests/flow-claim-preflight.test.js
git commit -m "Render holder liveness verdict in the claim-contest card — refs #722"
```
