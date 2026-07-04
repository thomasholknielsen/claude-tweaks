# Issue Claims Phase 2 (Close the Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merged specs close their GitHub issues through the user's own merge action (`Fixes #N` keywords), agents leave blocked/work-ready breadcrumbs on issues, and Phase 1's hardening items land (ownership-checked releases, placeholder disambiguation, `/tmp` alignment, takeover mechanics, kind-precedence doc).

**Architecture:** No new modules. `bin/lib/issues/claims.js` gains two optional params (`note` on claimPayload for takeover lines, `link` on releasePayload for work-ready evidence). Everything else is markdown procedure edits: the contract, from-recon, failure-cards, cleanup Section C/E, the multi-spec console, and worktree-merge. The agent never runs `gh issue close` — closing keywords ride the user's merge artifacts.

**Tech Stack:** Node 18+ (CommonJS), `node --test`, GitHub CLI, markdown skill files.

**Spec:** `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md` — "Phase 2 — Close the loop" section AND the "Phase 2 addendum" (5 hardening items).

## Global Constraints

- `bin/lib/` modules never call the network; time-dependent functions take `now` (epoch ms); no `Date.now()` in module logic.
- No emojis in skill files.
- The agent NEVER runs `gh issue close`. Closing keywords (`Fixes #<issue>`) go in user-merged artifacts only: PR bodies and merge commit messages. Direct close commands surface only for issues resolved *without* a merge (wontfix/duplicate), as user actions.
- Checkpoint comments (blocked / work-ready) are reversible network writes: allowed in `auto`, every post logs to `decisions.md`.
- Placeholder vocabulary after this phase: `${ISSUE}` (bash issue number), `#{issue}` (issue number in prose/log templates), `{spec}` (spec number in prose/reason templates), `{next}` (list index in failure cards). Reason strings become `merged: spec {spec}` / `pr-opened: spec {spec}` / `abandoned: spec {spec}` — renamed IN SYNC across contract, Section E, and console (Tasks 2, 5, 6).
- Ownership rule: a this-run release deletes `refs/claims/issue-<n>` only after `claimStatus().claim.runId` matches this run's `$RUN_ID`; mismatch → skip + log. `/tidy`'s sweep is exempt (deliberate, batch-approved breaking).
- Snippet paths must be absolute: `/tmp/...` (never a bare `$TMP`) — `require()` inside `node -e` fails on relative paths.
- Run `npm test` from the repo root; must pass at every commit. Known load flake: `tests/statusline.test.js` "render under 500ms" — if it alone fails, re-run that file in isolation and report both results.
- Version bump: `.claude-plugin/plugin.json` `5.3.0` → `5.4.0` (Task 7 only; also update CLAUDE.md's intro `(v5.3.0)` → `(v5.4.0)`).
- Commit style: `{Verb} {what} — {detail}`.

---

### Task 1: Module — `note` and `link` params + kind-precedence doc comment

**Files:**
- Modify: `bin/lib/issues/claims.js`
- Test: `bin/lib/issues/tests/claims.test.js`

**Interfaces:**
- Consumes: existing exports (`claimPayload`, `releasePayload`, `parseClaimMarker`, `DEFAULT_TTL_HOURS`).
- Produces (later tasks' snippets rely on these):
  - `claimPayload({..., note?})` — when `note` is a non-empty string, `commentBody` gains a third line containing it verbatim; the marker line is untouched.
  - `releasePayload({..., link?})` — when `link` is a non-empty string, the release marker JSON gains a `link` field and the human line ends `Released by run {runId}: {reason}. See {link}.`

- [ ] **Step 1: Write the failing tests**

Append to `bin/lib/issues/tests/claims.test.js`:

```js
test('claimPayload note appends a third line without touching the marker', () => {
  const p = claimPayload({ issueNumber: 5, sha: 'x', runId: 'run-2', sessionId: 's', now: T0, note: 'Broke stale claim from run run-1.' });
  const lines = p.commentBody.split('\n');
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[2], 'Broke stale claim from run run-1.');
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'claim');
  assert.strictEqual(m.runId, 'run-2');
  assert.strictEqual('note' in m, false);
});

test('claimPayload without note keeps the two-line body', () => {
  const p = claimPayload({ issueNumber: 5, sha: 'x', runId: 'r', sessionId: 's', now: T0 });
  assert.strictEqual(p.commentBody.split('\n').length, 2);
});

test('releasePayload link lands in the marker JSON and the human line', () => {
  const p = releasePayload({ issueNumber: 5, runId: 'r', reason: 'merged: spec 12', link: 'https://github.com/o/r/commit/abc123', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual(m.kind, 'release');
  assert.strictEqual(m.link, 'https://github.com/o/r/commit/abc123');
  assert.ok(p.commentBody.endsWith('See https://github.com/o/r/commit/abc123.'));
});

test('releasePayload without link has no link key and an unchanged human line', () => {
  const p = releasePayload({ issueNumber: 5, runId: 'r', reason: 'merged: spec 12', now: T0 });
  const m = parseClaimMarker(p.commentBody);
  assert.strictEqual('link' in m, false);
  assert.ok(p.commentBody.endsWith('merged: spec 12.'));
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test bin/lib/issues/tests/claims.test.js`
Expected: FAIL — the 4 new tests (note produces 2 lines, no `link` field); the 18 existing tests pass.

- [ ] **Step 3: Implement**

In `bin/lib/issues/claims.js`:

Replace the `claimPayload` function body's return with (adding `note` to the destructured params):

```js
function claimPayload({ issueNumber, sha, runId, sessionId, ttlHours = DEFAULT_TTL_HOURS, host = '', owner = '{owner}', repo = '{repo}', note, now }) {
  const claimedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, sessionId, claimedAt, ttlHours, host };
  const humanLines = [`Claimed by claude-tweaks run ${runId} at ${claimedAt} (TTL ${ttlHours}h).`];
  if (note) humanLines.push(note);
  return {
    ref,
    refArgs: [`repos/${owner}/${repo}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${sha}`],
    commentBody: `<!-- agent-claim: ${JSON.stringify(marker)} -->\n${humanLines.join('\n')}`,
  };
}
```

Replace `releasePayload` with (adding `link`):

```js
function releasePayload({ issueNumber, runId, reason, link, owner = '{owner}', repo = '{repo}', now }) {
  const releasedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = link ? { runId, reason, releasedAt, link } : { runId, reason, releasedAt };
  const human = `Released by run ${runId}: ${reason}.` + (link ? ` See ${link}.` : '');
  return {
    ref,
    refDeleteArgs: ['-X', 'DELETE', `repos/${owner}/${repo}/git/${ref}`],
    commentBody: `<!-- agent-claim-release: ${JSON.stringify(marker)} -->\n${human}`,
  };
}
```

Above `parseClaimMarker`, extend the doc comment's first line to:

```js
// Never throws. Returns { kind: 'claim'|'release', ...markerFields } or null.
// The derived kind (from which marker prefix matched) always wins over any
// "kind" key inside the marker JSON — fields spread first, kind last.
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (22 tests in the claims file; full suite green).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/claims.js bin/lib/issues/tests/claims.test.js
git commit -m "Add note/link params to claim payloads — takeover lines and work-ready evidence"
```

---

### Task 2: Contract updates — `skills/_shared/issue-claims.md`

**Files:**
- Modify: `skills/_shared/issue-claims.md`

**Interfaces:**
- Consumes: Task 1's `note`/`link` params.
- Produces: section names Tasks 3-6 cite — "Close-via-merge" (new), the ownership rule under "Release triggers", the new failure-posture row.

- [ ] **Step 1: Rename `${N}` → `${ISSUE}` throughout**

Every bash snippet in the file uses `${N}` / `$N` for the issue number. Replace all with `${ISSUE}` (and `claim-$N.md` → `claim-${ISSUE}.md`, `comments-$N.json` → `comments-${ISSUE}.json`, `"$N"` argv → `"$ISSUE"`). After the edit, `grep -n '\$N\b\|{N}' skills/_shared/issue-claims.md` must return no bash-context hits (prose `issue-<n>` stays).

- [ ] **Step 2: Replace `$TMP` with `/tmp` + absolute-path note**

In "The mirror" and "Reading claim state" snippets, replace `"$TMP/claim-$N.md"` → `/tmp/claim-${ISSUE}.md` and `"$TMP/comments-$N.json"` → `/tmp/comments-${ISSUE}.json` (all `$TMP` occurrences). Immediately after the "Reading claim state" snippet, add:

```markdown
Paths in these snippets must be absolute (`/tmp/...` or a run-dir path) — `require()` inside
`node -e` resolves relative paths against the eval context, not the working directory.
```

- [ ] **Step 3: Specify takeover mechanics in "TTL and staleness"**

After the sentence "post a new claim comment noting the takeover and the prior run id.", add:

```markdown
Generate the takeover comment with `claimPayload`'s `note` param (e.g.
`note: "Broke stale claim from run {priorRunId} (expired {expiry})."`) — the note becomes a
third human-readable line. Never hand-edit or append to the marker line itself.
```

- [ ] **Step 4: Add the ownership rule + reason rename in "Release triggers"**

Rename the reason strings in the table: `merged: spec {N}` → `merged: spec {spec}`, `pr-opened: spec {N}` → `pr-opened: spec {spec}`, `abandoned: spec {N}` → `abandoned: spec {spec}`.

After the Release triggers table (before the "Every claim, skip, break…" logging sentence), add:

```markdown
**Ownership rule.** Before a this-run release deletes the ref, fold the issue's comments
through `claimStatus` and confirm `claim.runId` equals this run's `$RUN_ID`. A mismatch means
a successor broke the stale claim and now holds the lock — skip the delete, log, and post
nothing. `/tidy`'s sweep is exempt: it releases *other* runs' stale claims by design, after
batch approval.

**Work-ready evidence.** Pass `releasePayload` a `link` (merge commit URL/sha or PR URL) when
one exists — it lands in the release marker and human line, making the issue's comment trail
point at the shipped change.
```

- [ ] **Step 5: Add the "Close-via-merge" section**

After the "Release triggers" section and before "Failure posture", insert:

```markdown
## Close-via-merge

The agent never runs `gh issue close` (non-reversible network write — see
`_shared/auto-mode-contract.md`). Issues close through the user's own merge action instead:

- **PR path:** `Fixes #{issue}` lines in the PR body — GitHub closes the issues when the
  human merges to the default branch.
- **Local-merge path:** the same `Fixes #{issue}` lines in the merge commit message — GitHub
  closes the issues when the user pushes that commit to the default branch.

One line per issue. Direct `gh issue close` commands surface only for issues resolved
*without* a merge (wontfix, duplicate), and the user runs them.
```

- [ ] **Step 6: Add the ownership failure-posture row**

In the Failure posture table, after the "Release fails" row, add:

```markdown
| Release attempted but claim's `runId` is not this run's | Skip the delete, log — a successor holds the lock (ownership rule) |
```

- [ ] **Step 7: Verify and commit**

Run: `grep -c "Close-via-merge\|ownership" skills/_shared/issue-claims.md` — Expected ≥ 3.
Run: `npm test` — Expected: PASS (no code touched).

```bash
git add skills/_shared/issue-claims.md
git commit -m "Harden the issue-claims contract — ownership rule, close-via-merge, takeover mechanics, /tmp alignment"
```

---

### Task 3: from-recon — close-the-loop rewrite + placeholder rename

**Files:**
- Modify: `skills/flow/from-recon.md`

**Interfaces:**
- Consumes: contract sections from Task 2 ("Close-via-merge", ownership rule).
- Produces: the Step 5 mapping-table presentation Task 6's console template mirrors.

- [ ] **Step 1: Rename placeholders in Step 2.5**

In Step 2.5's snippets and log templates: `${N}` → `${ISSUE}` (bash), `#{N}` → `#{issue}` and `issue-{N}` → `issue-{issue}` (log templates). The takeover sentence "then post a takeover claim comment naming the prior run id" gains: "— generate it with `claimPayload`'s `note` param per 'TTL and staleness' in `_shared/issue-claims.md`".

- [ ] **Step 2: Rewrite Step 5 (close-the-loop)**

Replace Step 5's first paragraph and the `gh issue close` code block (everything from "5. **Close-the-loop note (Review Console).**" through the sentence ending "'Never-reversible').") with:

```markdown
5. **Close-the-loop (Review Console).** The consolidated Review Console presents an issue-
   closure mapping instead of close commands — issues close through the user's merge action
   (see "Close-via-merge" in `_shared/issue-claims.md`):

   | Spec | Issue | Closes via |
   |------|-------|-----------|
   | {spec} | #{issue} | `Fixes #{issue}` in the merge commit (worktree mode) or PR body — fires when the user pushes/merges to the default branch |

   The merge artifacts carry the closing keywords: `worktree-merge.md`'s reconciliation puts
   `Fixes #{issue}` lines in the merge commit message; the single-spec PR path puts them in
   the PR body (see `wrap-up/cleanup-procedures.md` Section C). Direct
   `gh issue close #{issue} --comment "..."` commands surface ONLY for issues resolved
   without a merge (wontfix, duplicate) — the user runs them; the pipeline never closes
   issues autonomously (see `_shared/auto-mode-contract.md`, "Never-reversible").
```

Keep the existing claims-held paragraph (starting "The console also lists the claims…") unchanged after it.

- [ ] **Step 3: Rewrite the auto-close anti-pattern row**

Replace the row `| Auto-closing the issue when its spec merges | Closing is a non-reversible network write — `auto` never silences it. Surface the `gh issue close` command; the user runs it. |` with:

```markdown
| Running `gh issue close` from the pipeline | Direct closes are non-reversible network writes the agent never performs. Closing keywords in merge artifacts (`Fixes #{issue}` in the PR body or merge commit message) are sanctioned — the user's merge/push is the closing action. |
```

- [ ] **Step 4: Verify and commit**

Run: `grep -n "gh issue close" skills/flow/from-recon.md` — Expected: only the wontfix/duplicate surface in Step 5 and the anti-pattern row's "gh issue close" mention.
Run: `grep -c "Fixes #{issue}" skills/flow/from-recon.md` — Expected ≥ 2.

```bash
git add skills/flow/from-recon.md
git commit -m "Close recon issues via merge keywords — mapping table replaces close commands"
```

---

### Task 4: failure-cards — blocked checkpoint comment + placeholder fix

**Files:**
- Modify: `skills/flow/failure-cards.md`

**Interfaces:**
- Consumes: Global Constraints' checkpoint-comment rule (reversible, logged).
- Produces: the blocked-comment convention Task 7's docs describe.

- [ ] **Step 1: Extend the claims-held paragraph**

The file has a paragraph starting `**Claims held by \`--from-recon\` runs:**` (added in Phase 1). Insert before its "Add this option…" sentence:

```markdown
When the stop occurs, post a *blocked* checkpoint comment to each claimed issue so a stalled
issue carries a resumable breadcrumb (plain text, no marker — `claimStatus` ignores it):

```bash
gh issue comment "$ISSUE" --body "Blocked at {gate}: {one-line reason}. Run {runId}; claim active until claimedAt+ttlHours unless released."
```

Posting is automatic (a reversible network write) and each post logs to `decisions.md`.
Release remains offered-only — see below.
```

- [ ] **Step 2: Disambiguate placeholders**

In the same block's Next Actions template: `{N+1}.` → `{next}.` and both `issue-{N}` → `issue-{issue}`, `"repos/{owner}/{repo}/git/refs/claims/issue-{N}"` → `.../issue-{issue}"`.

- [ ] **Step 3: Verify and commit**

Run: `grep -c "Blocked at\|{issue}" skills/flow/failure-cards.md` — Expected ≥ 3. Confirm no `{N}` remains in the claims block: `grep -n "issue-{N}\|{N+1}" skills/flow/failure-cards.md` — Expected: no matches.

```bash
git add skills/flow/failure-cards.md
git commit -m "Post blocked checkpoint comments on gate failures — resumable breadcrumbs on claimed issues"
```

---

### Task 5: cleanup-procedures — ownership check, link, Fixes lines, renames

**Files:**
- Modify: `skills/wrap-up/cleanup-procedures.md` (Sections C and E)

**Interfaces:**
- Consumes: Task 1's `link` param, Task 2's ownership rule.
- Produces: the Section E step numbering Task 6's console steps reference (unchanged reference: "Section E").

- [ ] **Step 1: Add Fixes lines to Section C (Git Worktree)**

In Section C, after step 2 (the finishing-a-development-branch invocation), add:

```markdown
   When any spec on the branch carries `recon-issue:` frontmatter, the merge artifact must
   carry the closing keywords (see "Close-via-merge" in `_shared/issue-claims.md`): pass
   `Fixes #{issue}` lines — one per issue — in the PR body (PR option) or the merge commit
   message (merge option). The user's merge/push closes the issues; the agent never runs
   `gh issue close`.
```

- [ ] **Step 2: Section E — ownership check + link + renames**

In Section E:
1. Rename `$N` → `$ISSUE` in the bash snippet (including `"$N"` argv and `release-${N}.md` → `release-${ISSUE}.md`), and `{N}` → `{spec}` in the reason mapping prose (`merged: spec {spec}` etc.).
2. Insert a new step between the current step 2 (outcome mapping) and step 3 (release execution) — renumber the following steps:

```markdown
3. **Ownership check (per `_shared/issue-claims.md`, "Release triggers").** Fetch the issue's
   comments and fold through `claimStatus`. If `claim.runId` is not this run's `$RUN_ID`, a
   successor holds the lock — skip the delete AND the comment, log
   `AUTO — skipped release of issue #{issue}: claim held by run {claim.runId}`, and continue.
```

3. In the release-execution step, extend the `releasePayload` call with the link: the `node -e` snippet gains a fourth argv (`"$LINK"` — the merge commit sha/URL or PR URL when known, empty string otherwise) and the JS becomes `reason:process.argv[3],link:process.argv[4]||undefined`.

- [ ] **Step 3: Verify and commit**

Run: `grep -c "Ownership check\|Fixes #{issue}\|{spec}" skills/wrap-up/cleanup-procedures.md` — Expected ≥ 4. Confirm Section E steps are sequentially numbered after the insertion.
Run: `npm test` — Expected: PASS.

```bash
git add skills/wrap-up/cleanup-procedures.md
git commit -m "Ownership-checked claim releases with work-ready links — Fixes lines ride the merge artifact"
```

---

### Task 6: Console + worktree-merge — closure mapping, link, reason rename

**Files:**
- Modify: `skills/flow/multispec-review-console.md`
- Modify: `skills/flow/worktree-merge.md`

**Interfaces:**
- Consumes: Task 3's mapping-table shape, Task 5's Section E changes, Task 2's reason strings.
- Produces: nothing downstream — Task 7 documents it.

- [ ] **Step 1: Add the issue-closures section to the console template**

In `multispec-review-console.md`'s console template (inside the ```markdown block), after the "#### Configuration updates" table and before "#### Not run / Failed", insert:

```markdown
#### Issue closures (from-recon runs — closes on YOUR merge/push, not by the pipeline)

| # | Spec | Issue | Closes via |
|---|---|---|---|
| 13 | 157 | #84 | `Fixes #84` in the reconciliation merge commit — fires on push to the default branch |

Issues resolved without a merge (wontfix/duplicate) list a manual `gh issue close` command
instead — a user action. Omit this section entirely for runs without `recon-issue:` specs.
```

- [ ] **Step 2: Update both release steps (On approval step 6, On override step 5)**

In both numbered lists, the existing claim-release step's reason text `(merged → \`merged: spec {N}\`, PR → \`pr-opened: spec {N}\`, discarded → \`abandoned: spec {N}\`)` becomes `(merged → \`merged: spec {spec}\`, PR → \`pr-opened: spec {spec}\`, discarded → \`abandoned: spec {spec}\`)`, and each step gains this sentence at the end:

```markdown
Include the work-ready `link` (the reconciliation merge commit sha, or the PR URL) via `releasePayload`'s `link` param, and honor the ownership check in Section E — a successor's claim is never deleted.
```

- [ ] **Step 3: Put Fixes lines in the reconciliation merge commit**

In `worktree-merge.md`'s "Merge Procedure", replace step 1 (`1. \`git merge {branch}\` into the base branch`) with:

```markdown
1. Merge into the base branch. For from-recon runs (any spec on the branch has `recon-issue:`
   frontmatter), the merge commit message must carry the closing keywords — one line per issue
   (see "Close-via-merge" in `_shared/issue-claims.md`):

   ```bash
   git merge --no-ff {branch} -m "Merge {branch} — specs {list}

   Fixes #{issue}
   Fixes #{issue2}"
   ```

   Otherwise a plain `git merge {branch}` is fine. The issues close when the user pushes the
   base branch to the default remote branch.
```

- [ ] **Step 4: Verify and commit**

Run: `grep -c "Issue closures\|Fixes #" skills/flow/multispec-review-console.md skills/flow/worktree-merge.md` — Expected ≥ 2 per file. Confirm `grep -n "spec {N}" skills/flow/multispec-review-console.md` returns no matches.

```bash
git add skills/flow/multispec-review-console.md skills/flow/worktree-merge.md
git commit -m "Surface issue-closure mapping at the console — Fixes lines in the reconciliation merge"
```

---

### Task 7: Docs ripple + version 5.4.0

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.claude-plugin/plugin.json`
- Modify: `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md`

**Interfaces:**
- Consumes: everything landed in Tasks 1-6.
- Produces: nothing — closes the phase.

- [ ] **Step 1: CLAUDE.md**

1. Intro line `(v5.3.0)` → `(v5.4.0)`.
2. Skills-with-sub-files table, `flow` row: extend the from-recon clause with `; close-via-merge mapping (issues close on the user's merge, never `gh issue close`)`.
3. Skills-with-sub-files table, `wrap-up` row: extend the cleanup-procedures clause's `issue-claim release (item 8)` with ` with ownership check`.

- [ ] **Step 2: README.md**

Extend the recon paragraph's claims sentence (added in Phase 1, ends "swept by `/tidy`.") with:

```markdown
Merged specs close their issues through your own merge action — `Fixes #N` lines ride the merge commit or PR body; the pipeline never closes issues directly.
```

- [ ] **Step 3: Design doc status notes**

In `docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md`:
1. Under the `## Phase 2 — Close the loop` heading, add the line: `**Status: implemented in v5.4.0** (plus the addendum's five hardening items).`
2. Under `### Phase 2 addendum`, add after the intro sentence: `**All five items implemented in v5.4.0.**`

- [ ] **Step 4: Version bump**

`.claude-plugin/plugin.json`: `"version": "5.3.0"` → `"version": "5.4.0"`. Validate: `node -e "require('./.claude-plugin/plugin.json')"`.

- [ ] **Step 5: Full verification and commit**

Run: `npm test` — Expected: PASS.
Run: `grep -rn "spec {N}\`" skills/ | grep -v "issue-{" ` — Expected: no reason-string stragglers.

```bash
git add CLAUDE.md README.md .claude-plugin/plugin.json docs/superpowers/specs/2026-07-04-github-issue-agent-coordination-design.md
git commit -m "Document close-via-merge across consumers — bump to 5.4.0"
```

---

## Post-plan notes

- **Marketplace release**: mirror `5.4.0` in the marketplace repo after this lands — user-driven.
- **Phase 3 (generic ingestion)** and **Phase 4 (dispatch)** remain in the design doc, untouched by this plan.
- Deliberately NOT done: ownership check in `/tidy`'s sweep (exempt by design — it breaks others' stale claims after batch approval); `{n}` renames in `tidy/scan-procedures.md` (no spec/issue ambiguity exists in that file's context).
