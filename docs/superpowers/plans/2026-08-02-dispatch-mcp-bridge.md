# Dispatch MCP Bridge Implementation Plan (Slice 1 of 2 — closes #61)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Tasks 1-2 are NOT normal subagent-dispatchable tasks.** They fire a real Claude Code cloud Routine and require waiting on a genuine async cloud job (minutes, not seconds) plus reading its real output — a dispatched subagent cannot fabricate or assume this result (see this project's own CLAUDE.md: "Never race... never fabricate or predict [background] results"). Whoever executes this plan (a human, or an agent session with real wall-clock patience) must run Tasks 1-2 directly, not via a fire-and-forget subagent dispatch.

**Goal:** Bridge every `gh`-CLI-only call site in `/claude-tweaks:dispatch`'s queue/claim/settle/merge path so it works in a Claude Code cloud Routine sandbox (no `gh` CLI, GitHub MCP tools only), without changing any existing `gh`-CLI-path behavior.

**Architecture:** Discover and confirm real GitHub MCP tool names/schemas first, via a live throwaway diagnostic Routine fired against `memenu-app` (Tasks 1-2) — never guess a tool name into shipped documentation. Only once every primitive is confirmed working does the plan write the actual bridge prose into `dispatch/SKILL.md`, `settle-and-merge.md`, `issue-claims.md`, and `_shared/github-write-transport.md` (Tasks 3-9), using the confirmed names. The `gh`-CLI path stays byte-for-byte unchanged everywhere. Preflight's hard gate on `gh` stays exactly as it is today throughout Tasks 3-9 — only the final task (Task 10) flips it, and only because Tasks 1-2 already proved the MCP path works for real.

**Tech Stack:** Markdown skill-file prose (this plugin has no runtime code for this slice — every call site here is skill-prose-driven `gh`/MCP-tool invocation, not a JS module). The `/schedule` built-in skill (one-time cloud-agent runs) for Tasks 1-2. `git` (worktree already created).

## Global Constraints

- Every `gh`-CLI-path line of prose, in every file, stays byte-for-byte unchanged. This is additive only (design doc's Decision section, ADR 0008).
- No MCP tool name may be written into any shipped skill file until Task 2 has confirmed it against a live cloud session. Do not proceed to Task 3 until Task 2's report explicitly lists every confirmed tool name.
- `npm test` must stay green after every task that touches this repo's files (Tasks 3-10; Tasks 1-2 touch no repo files).
- Work happens in the existing worktree at `.claude/worktrees/dispatch-tidy-mcp-bridge`, branch `worktree-dispatch-tidy-mcp-bridge` — do not create a new worktree. Commit after every task.
- If Task 2's diagnostic run reports ANY primitive as FAIL, stop immediately after Task 2b (file the finding) — do not execute Tasks 3-10. The gate stays exactly as it is today; nothing else in this plan applies.

---

### Task 1: Build and fire the throwaway diagnostic Routine

**Files:** None in this repo — this task operates entirely against `memenu-app`'s existing Claude Code Remote project via the `/schedule` built-in skill (not `/claude-tweaks:routine`, which is for versioned, plugin-shipped, project-agnostic templates — this is a one-off, exploratory run; `/schedule`'s own description names this exact use case: "one-time scheduled run").

**Interfaces:**
- Consumes: nothing from this plan.
- Produces: a fired cloud Routine run whose transcript Task 2 reads. No file, no code.

- [ ] **Step 1: Invoke `/schedule` targeting `memenu-app`, one-time, near-immediate**

Use the `/schedule` skill (already available in this session) to create and immediately run a one-time cloud agent against the `memenu-app` project's existing environment (it already runs `dispatch-weekdays`/`tidy-weekly`, so a dedicated environment already exists for this project — do not create a new one). Give it this exact prompt:

```
You are running in a Claude Code Remote (cloud) sandbox with no `gh` CLI on PATH — only GitHub MCP tools. This is a diagnostic probe for a claude-tweaks plugin design (closing GitHub issue #61 in thomasholknielsen/claude-tweaks) — it touches no real backlog state and cleans up everything it creates.

Repo for all operations below: memenu-io/memenu-app (this project's own repo).

First, list every GitHub-related MCP tool available to you in this session (tool names and their parameter schemas) — report this list verbatim before doing anything else, since it's needed to interpret the results below.

Then run these 9 steps in order, using whichever of your available MCP tools does the job (do not use `gh` even if somehow present — the point is to prove the MCP-only path):

1. Create a test issue titled "[diagnostic probe — safe to ignore/delete] claude-tweaks MCP bridge check" with body "Created by an automated diagnostic probe for claude-tweaks issue #61. Safe to close/delete." Report the issue number.
2. Get that single issue back by number. Confirm the title/body match what you just created.
3. List open issues filtered by a label that exists on this repo (pick any label visible on the issue you just created, or any label that exists in this repo) — confirm the call succeeds and returns a list (empty is fine, the point is the call succeeding).
4. List comments on the test issue — confirm it returns an empty list.
5. Add a comment "diagnostic probe — comment write test" to the test issue, then list comments again — confirm your new comment appears.
6. Add a label to the test issue (create a label named "diagnostic-probe-tmp" if needed), then remove it — confirm both operations succeed.
7. This is the most important step. Using whatever tool lets you create or update a file's content via the GitHub API against a specific branch (do not use `git push` — this must go through a GitHub API/MCP file-write tool): pick a scratch path like `claims/diagnostic-test.json` on a branch called `claims-registry-diagnostic-probe` (create the branch first if your tooling requires it to exist). (a) Write `{"probe":1}` to that path with no sha/etag precondition — confirm it succeeds. (b) Write `{"probe":2}` to the SAME path again with no sha/etag precondition — confirm this FAILS (this proves create-only/conditional-write semantics exist, which a claim lock's correctness depends on). (c) Read the file to get its current sha/etag, then write `{"probe":2}` WITH that sha/etag — confirm it succeeds.
8. Run `git remote show origin` as a plain shell command (not an MCP tool) and confirm it reports a default branch.
9. Close the test issue from step 1. Delete or leave the scratch branch/file from step 7 (note which you did).

Report back a clear PASS/FAIL line for each of the 9 steps above, and for each step that used an MCP tool, name the exact tool and parameters you used. If any step fails, report the exact error message verbatim — do not paraphrase it.
```

Confirm the routine was actually created and a run was initiated — the `/schedule` skill's own output will confirm this (trigger ID, claude.ai URL). Relay that URL; do not proceed to Task 2 until you have it.

- [ ] **Step 2: Wait for the run to complete**

This is a real cloud agent run — it will take real minutes, not seconds. Do not poll aggressively. Check back after a reasonable interval, or ask the user to notify you when it completes.

---

### Task 2: Read the real result and decide

**Files:** None yet — this task only reads the Task 1 run's transcript/output and decides whether to proceed.

**Interfaces:**
- Consumes: the fired run's transcript (via the claude.ai URL from Task 1, or the `/schedule`/`RemoteTrigger` `get` mechanism for that trigger).
- Produces: a confirmed list of exact MCP tool names + parameter shapes for: create issue, get single issue, list issues by label, list issue comments, add issue comment, add/remove label, and the file-write CAS primitive (create-only + conditional-update). Tasks 3-9 consume this list directly — do not let them proceed with a guessed name.

- [ ] **Step 1: Open and read the actual run transcript**

Read the real output — do not trust a summary that doesn't include the verbatim per-step PASS/FAIL lines and tool names the prompt explicitly asked for. If the transcript is ambiguous about which tool was used for a given step, that step counts as FAIL for this plan's purposes (an unconfirmed tool name is not usable in Task 3+).

- [ ] **Step 2: Branch on the result**

**All 9 steps PASS, with every MCP tool name confirmed:** record the confirmed tool names (write them down — the next tasks need exact names, not "an MCP tool"). Proceed to Task 3.

**Any step FAILS, or a tool name is ambiguous/unconfirmed:** do Task 2b below instead of Task 3, then stop this plan entirely.

- [ ] **Task 2b (failure path only): File the finding and stop**

```bash
gh issue create \
  --repo thomasholknielsen/claude-tweaks \
  --title "gh-CLI/MCP bridge diagnostic failed: {which step(s) failed}" \
  --body "Diagnostic Routine run against memenu-app for issue #61's bridge (per docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md, Tasks 1-2) found: {exact failing step(s), exact error message(s) verbatim, and which MCP tool — if any — was attempted}.

This plan stops here per its own Global Constraints — the gh hard gate stays exactly as it is today. Re-attempting this bridge is future work informed by this specific failure, not a retry of the same approach." \
  --label by:dispatch
```

Do not execute Task 3 or any task after it. This plan's work is done for now — report the filed issue number to the user and stop.

---

### Task 3: Add two new CRUD mapping rows to `github-write-transport.md`

**Files:**
- Modify: `skills/_shared/github-write-transport.md`

**Interfaces:**
- Consumes: Task 2's confirmed tool names for "get single issue" and "list issue comments."
- Produces: two new rows in the CRUD mapping table that Tasks 4 and 6 reference by name.

- [ ] **Step 1: Add the two rows**

In the `## CRUD mapping` table, after the existing "Close" row, add:

```markdown
| Get a single issue by number | `gh issue view {n} --json state,...` | `{confirmed tool name from Task 2}` |
| List an issue's comments | `gh api repos/{owner}/{repo}/issues/{n}/comments?per_page=100` | `{confirmed tool name from Task 2}` |
```

Substitute the literal confirmed names/parameter shapes from Task 2 — not a placeholder.

- [ ] **Step 2: Read the whole table back**

Confirm the new rows match the existing rows' formatting exactly (same column widths not required, but same tone/specificity — each MCP-tool cell should read like the existing ones, e.g. `list_issues` (filtered by label, state)).

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/github-write-transport.md
git commit -m "Add get-single-issue and list-issue-comments to the GitHub CRUD mapping (refs #61)"
```

---

### Task 4: Wire Step 2's queue pull and per-dependency check to branch on `gh` presence

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Step 2, the `gh issue list --label auto:build` block and the per-`DEP` `gh issue view` loop)

**Interfaces:**
- Consumes: Task 3's confirmed CRUD mapping.
- Produces: dormant MCP-path prose in Step 2 (Preflight still hard-gates before this is reachable — this task does not change Preflight).

- [ ] **Step 1: Add the MCP branch after the existing queue-pull code block**

Immediately after the existing ```` ```bash ... ``` ```` block that ends with `> /tmp/dispatch-groups.json`, add:

```markdown
**MCP path** (`gh` unavailable — not reachable in practice today, Preflight hard-gates before this point; documented as groundwork per `_shared/github-write-transport.md`'s CRUD mapping): the queue pull uses the confirmed "list issues by label" mapping; the per-dependency open-state check (the `gh issue view "$DEP" --json state` loop) uses the confirmed "get single issue by number" mapping, checking the returned state field for `OPEN`. Both replace their `gh`-CLI equivalent one-for-one — no change to the surrounding `node -e` eligibility/dependency logic, which only consumes the fetched JSON shape, not how it was fetched.
```

- [ ] **Step 2: Read Step 2 back in full**

Confirm the new paragraph doesn't contradict the existing "The MCP-path claim block above (Step 4) is not reachable in practice today" framing elsewhere in the file — both should say the same thing (dormant, Preflight-gated) consistently.

- [ ] **Step 3: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Document Step 2's MCP path for queue pull + dependency check, still Preflight-gated (refs #61)"
```

---

### Task 5: Extend the native `work-links` GraphQL fallback to also trigger on `gh` absent

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Step 2, the `work-links: native` GraphQL block)

**Interfaces:**
- Consumes: nothing new.
- Produces: a precondition change to existing fallback logic — no new MCP mapping.

- [ ] **Step 1: Edit the native-dependency paragraph**

Find the paragraph beginning "**`work-links: native` support.**" and its sentence ending "...it logs a warning and falls back to no native filtering for that run rather than crashing Step 2's queue-build entirely." Add immediately after that sentence:

```markdown
The same fallback also triggers when `gh` itself is absent — there is no GraphQL passthrough on the MCP path, so a `work-links: native` project running headless without `gh` degrades to no native filtering for that run, identically to any other query failure. This is not a new code path — it's the existing on-error fallback reached via a capability check instead of a failed call.
```

- [ ] **Step 2: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Extend native work-links GraphQL fallback to trigger on gh-absent, not just query failure (refs #61)"
```

---

### Task 6: Wire Step 4's claim/release and contested-claim check

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Step 4)
- Modify: `skills/_shared/issue-claims.md` (the "Reachability, per consumer" note under "The lock")

**Interfaces:**
- Consumes: Task 3's "list issue comments" mapping.
- Produces: Step 4's claim block loses its "not reachable in practice today" framing (still Preflight-gated overall via Task 4/5's same dormant framing — this task only removes the now-inaccurate "not reachable... groundwork for the follow-up" language, since the follow-up is this same plan).

- [ ] **Step 1: Update `dispatch/SKILL.md` Step 4's MCP-path claim block intro**

Find: `**MCP path** (`gh` unavailable): **not reachable in practice today** — Preflight hard-gates on `gh` being installed (check 2), so dispatch never reaches this step without it. It is documented here as groundwork for the follow-up that bridges the rest of dispatch's read path (Step 2's queue pull, the dependency checks, the contested-claim comment fetch, `settle-and-merge.md`), after which the gate can drop. Read it as future scope, not live behavior.`

Replace with: `**MCP path** (`gh` unavailable): fully documented below and wired into every other read-path call site in this file (Step 2, Settle, the Auto-merge gate) as of this plan — still Preflight-gated (check 2 stays a hard gate) until Task 10 of `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md` verifies the whole chain against a live cloud run and flips it.`

- [ ] **Step 2: Update Step 4's contested-claim comment-fetch line**

Find the ```` ```bash ... ``` ```` block under "**On 422 (contested):**" that runs `gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100"`. Immediately after that code block, add:

```markdown
**MCP path** (`gh` unavailable, same dormant status as above): use the confirmed "list issue comments" mapping from `_shared/github-write-transport.md`, then fold the result through `claimStatus` exactly as the `gh` path does — `claimStatus` accepts either raw `gh` comment objects or the MCP tool's comment objects, since it only reads a `.body` string field off each.
```

- [ ] **Step 3: Update `issue-claims.md`'s Reachability note**

Find: `*Reachability, per consumer:* `/claude-tweaks:dispatch` itself cannot currently reach this path — its Preflight hard-gates on `gh` being installed, because its read path (queue pull, dependency checks, settle/merge) is still `gh`-only. `/tidy`'s Step 4.7 claims-audit sweep is a separate consumer of this same protocol and is not affected by that gate.`

Replace with: `*Reachability, per consumer:* `/claude-tweaks:dispatch`'s Preflight still hard-gates on `gh` being installed today — its full read path (queue pull, dependency checks, settle/merge) is fully documented on both transports as of `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`, but the gate itself only drops once that plan's live diagnostic verification passes (its Task 10). `/tidy`'s Step 4.7 claims-audit sweep is a separate consumer of this same protocol and is not affected by that gate.`

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/SKILL.md skills/_shared/issue-claims.md
git commit -m "Wire Step 4's claim/release + contested-claim MCP path, update reachability note (refs #61)"
```

---

### Task 7: Wire Settle's retry-ceiling comment fetch

**Files:**
- Modify: `skills/dispatch/settle-and-merge.md` (Step 6 item 4)

**Interfaces:**
- Consumes: Task 3's "list issue comments" mapping.
- Produces: dormant MCP-path documentation for the one remaining `gh api .../comments` call site in this file.

- [ ] **Step 1: Add the MCP path after item 4's code block**

Find item 4's ```` ```bash ... ``` ```` block (the one computing `DISPATCH_RETRY_CEILING` and calling `gh api "repos/{owner}/{repo}/issues/${ISSUE}/comments?per_page=100"`). Immediately after it, add:

```markdown
**MCP path** (`gh` unavailable, same dormant status as `dispatch/SKILL.md`'s Step 4): use the confirmed "list issue comments" mapping from `_shared/github-write-transport.md` in place of the `gh api` call above — `countFailedAttempts` and the rest of this step's logic consume the same comment-body-string shape regardless of transport.
```

- [ ] **Step 2: Commit**

```bash
git add skills/dispatch/settle-and-merge.md
git commit -m "Wire Settle's retry-ceiling comment fetch MCP path (refs #61)"
```

---

### Task 8: Replace the Auto-merge gate's default-branch `gh api` lookup with plain `git`

**Files:**
- Modify: `skills/dispatch/settle-and-merge.md` (Auto-merge gate section)

**Interfaces:**
- Consumes: nothing new — this removes a dependency, it doesn't add an MCP mapping.
- Produces: one fewer `gh`-only call site in this file (this line now works identically on both transports, unconditionally, no branching needed at all).

- [ ] **Step 1: Replace the default-branch resolution line**

Find, in the Auto-merge gate section:

```bash
DEFAULT_BRANCH=$(gh api "repos/{owner}/{repo}" -q .default_branch)
```

Replace with:

```bash
DEFAULT_BRANCH=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
```

- [ ] **Step 2: Add a one-line note explaining why this isn't in the CRUD mapping table**

Immediately before the replaced line's surrounding paragraph (the one starting "Then, from the main checkout:"), add:

```markdown
Resolved via plain `git`, not `gh`/MCP — this is local repository metadata (the remote's `HEAD` pointer), not GitHub-hosted state, so it works identically regardless of transport with no branching needed at all.
```

- [ ] **Step 3: Run this exact command locally to confirm the parse works**

```bash
git remote show origin | sed -n '/HEAD branch/s/.*: //p'
```

Expected: prints `main` (or whatever this repo's actual default branch is) with no other output.

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/settle-and-merge.md
git commit -m "Replace auto-merge gate's gh-only default-branch lookup with plain git (refs #61)"
```

---

### Task 9: Run the full test suite

**Files:** None modified — verification only.

- [ ] **Step 1: Run `npm test`**

```bash
npm test
```

Expected: all tests pass (this slice touches only markdown skill files, so no test should be affected — a failure here means something unrelated broke, or a prior task's edit landed somewhere unexpected; investigate via `git diff --stat` against the base commit before proceeding).

- [ ] **Step 2: Diff-review every file this plan touched**

```bash
git diff 6dda8b8 --stat
```

Expected: exactly `skills/dispatch/SKILL.md`, `skills/dispatch/settle-and-merge.md`, `skills/_shared/issue-claims.md`, `skills/_shared/github-write-transport.md` — no other file. If anything else appears, investigate before proceeding to Task 10.

---

### Task 10: Flip the gate (only if Task 2 passed clean)

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Preflight section, Detection Ladder check 2, and the Relationship-to-Other-Skills table's restatement of the same rule)

**Interfaces:**
- Consumes: Task 2's confirmed-clean result. Do not execute this task at all if Task 2b (the failure path) ran instead.
- Produces: the actual behavior change this whole plan exists for.

- [ ] **Step 1: Find and edit the Preflight paragraph**

Find, in the `## Preflight` section: `Before any `gh` command, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3: GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Unlike `/tidy`/`/help`'s use of this ladder, which fails open into a skipped scan, `/claude-tweaks:dispatch` treats any ladder failure as a hard gate — this skill's entire purpose is writing GitHub state (claims, labels, merges), so there is no meaningful degraded mode to fall back into. Report the specific failing check and stop (headless self-report above still applies for the `next` form).`

Replace with: `Before any `gh`/MCP command, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3: GitHub remote exists, `gh` CLI installed, `gh` authenticated + repo reachable). Check 1 (GitHub remote exists) and check 3 (authenticated + reachable, evaluated against whichever transport check 2 selects) stay hard gates — there is no meaningful degraded mode for a skill whose entire purpose is writing GitHub state. Check 2 (`gh` CLI installed) no longer gates on its own: `gh` present → proceed exactly as always; `gh` absent → proceed via the GitHub MCP path documented at every call site in this file and in `settle-and-merge.md` (verified end-to-end against a live cloud Routine run, see `docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`). Report the specific failing check and stop for any real failure (headless self-report above still applies for the `next` form).`

- [ ] **Step 2: Find and edit the paragraph immediately after (the "Check 2... stays a hard gate" explanation)**

Find: `Check 2 (`gh` CLI installed) stays a hard gate even though `_shared/github-write-transport.md` now defines an MCP path for this skill's *writes*: dispatch's read path is still `gh`-only end to end (Step 2's `gh issue list` queue pull, the dependency-check `gh issue view` / `gh api graphql` calls, the contested-claim `gh api .../comments` fetch, and all of `settle-and-merge.md`), so proceeding without `gh` would only trade a clean Preflight stop for an unstructured `gh: command not found` deep inside Step 2. Bridging that read path is real future work; until it lands, `gh` absent stops here.`

Replace with: `Check 2 no longer gates on its own as of this plan's Task 10 — every call site that used to be `gh`-only end to end (Step 2's queue pull and dependency checks, the contested-claim comment fetch, all of `settle-and-merge.md`) now has a confirmed, live-verified MCP path (`docs/superpowers/plans/2026-08-02-dispatch-mcp-bridge.md`, Tasks 1-2's diagnostic Routine). A prior attempt at this same bridge (`274e30e`, reverted the next day as `d4bdfb9`) shipped this exact gate change without finishing the read-path bridge first, producing an unstructured `gh: command not found` crash instead of a clean stop — this version does not repeat that mistake, since every call site was bridged and verified before this line changed.`

- [ ] **Step 3: Find the Relationship-to-Other-Skills table row restating this rule, and update it to match**

Search the file for any other sentence describing check 2 as a hard gate (the design doc's audit found this restated in more than one place in a prior version of this same change — confirm there isn't a second stale restatement here before considering this task done, per this project's own CLAUDE.md caution about exactly this failure mode: "the same relationship can recur in a second, non-adjacent location"). Update it to match Step 1/2's new framing if found.

- [ ] **Step 4: Run `npm test` one more time**

```bash
npm test
```

Expected: still all passing.

- [ ] **Step 5: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Drop dispatch's hard gh-CLI gate — verified against a live cloud Routine run (closes #61)"
```

- [ ] **Step 6: Clean up the diagnostic Routine**

`/schedule`/`RemoteTrigger` has no delete action (confirmed: `skills/routine/SKILL.md`'s own Anti-Patterns table: *"`RemoteTrigger create` has no delete counterpart — a mistaken routine runs on a live schedule until manually removed at claude.ai/code/routines."*). Tell the user directly: the diagnostic Routine created in Task 1 needs manual deletion at claude.ai/code/routines (relay the trigger ID/URL from Task 1) — do not attempt to automate this away, and do not leave it silently running.

- [ ] **Step 7: Merge and report**

Follow this project's normal `superpowers:finishing-a-development-branch` flow to merge `worktree-dispatch-tidy-mcp-bridge` — the carrier commit for closing #61 should read `Fixes #61` per `_shared/issue-claims.md`'s close-via-merge convention. Report to the user: #61 closed, and that Slice 2 (#60, tidy's PR scan) is a separate plan, written only after this one has actually merged.
