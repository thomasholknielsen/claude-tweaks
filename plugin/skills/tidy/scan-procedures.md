# Tidy — Scan Procedures

Per-step scan rules for `/claude-tweaks:tidy`. Each scan reads a single data source and collects findings in the `[type] item — detail — recommendation` format. The parallel dispatcher inlines the relevant section into each agent's prompt so agents have everything they need (subagents cannot read sibling files). Step 1 is the one exception to "a section of this file": it lives in `step-1-records.md`, inlined whole, and only the stub below remains here.

Step numbering matches `SKILL.md`. The order below mirrors execution order. There is no Step 2 — Steps 1 and 2 merged into one record scan (now `step-1-records.md`); the rest of the numbering is unchanged so existing cross-references from other skills (`/claude-tweaks:dispatch`, `wrap-up/cleanup-procedures.md`) keep pointing at the right step.

---

## Step 1: Audit Work Records

**Extracted — read `step-1-records.md` in this skill's directory.** That file carries this
step's whole procedure: the `work-backend` resolution, the shared queue fetch, the unsynced-
fallback pull, the staleness clock, and every finding shape. Nothing of Step 1 remains here —
this heading survives so that an external reference naming "`scan-procedures.md` Step 1", or one
of its shapes, still resolves in one hop.

The dispatcher inlines `step-1-records.md` **whole** into the Work Records agent's prompt, the
same way it inlines a section of this file into every other scan agent's. `--scope=backlog` and
`--scope=specs` are the only scopes that select it (`SKILL.md`'s Scope Selection); no other step
reads Step 1's output except Step 5, which runs sequentially in the main thread afterwards.

## Step 3: Audit Design Docs

Scan `docs/superpowers/specs/*-design.md`.

**Design doc classification** — for each file in `docs/superpowers/specs/*-design.md`:

| Status | Recommendation |
|--------|---------------|
| Marked as specified, derived specs complete | Delete |
| No status, matches existing specs | Mark as specified |
| No status, no matching specs | Run `/claude-tweaks:specify` |
| Very old (4+ weeks), no specs | Delete |

**The "Mark as specified" stamp** is one line — `Status: specified — decomposed to {record refs}` — inserted directly below the doc's title heading (`# {title}`), matching the existing convention in `docs/superpowers/specs/` (e.g. the 2026-08-07 prior-art design doc's `Status: specified — …` line). One stamp per doc; a doc that already carries a `Status:` line is not a "no status" case and never reaches this recommendation.

→ Collect each as: `[doc] {filename} — {recommendation}`

## Step 4: Audit Execution Plans

Scan `docs/superpowers/plans/` for execution plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`

Also glob `docs/plans/*-ledger.md` — the per-feature pipeline ledgers `/claude-tweaks:ledger` creates (`docs/plans/YYYY-MM-DD-{feature}-ledger.md`, `_shared/ledger-format.md`) and `/claude-tweaks:wrap-up`'s Phase 4 execution step deletes on successful completion. A pipeline that never reaches wrap-up leaves its ledger behind permanently; nothing else sweeps for it.

For each matched file, read its content — cheap, these files are a few KB — and classify:

| Status | Recommendation |
|--------|---------------|
| Any row's `Status` column reads `open` (`_shared/ledger-format.md`'s non-terminal status — "these items block pipeline completion") | Keep |
| No `open` row (every row is a terminal status per `_shared/ledger-format.md`, or the ledger has zero rows), AND a directory under `.claude-tweaks/pipelines/` (not `archive/`) still exists whose name contains the ledger's own record/spec number(s) — extract every `#{N}` token appearing anywhere in the ledger's first line (real headings vary: a colon-prefixed list, a trailing `(#N)`, or embedded mid-sentence — scan the whole line, don't anchor to one position), or the filename's `{feature}` slug when the first line carries no `#{N}` token at all | Keep |
| No `open` row AND no matching directory anywhere under `.claude-tweaks/pipelines/` (absent, or present only under `archive/`) | Delete (orphan) |

The `Status` column is authoritative — directory placement (live/archived/absent) only breaks ties when no `open` row exists. Never classify by directory alone: archival is a time-based sweep, decoupled from whether a ledger's items were ever resolved — `2026-08-16-spec-276-528-529-530-ledger.md` and `2026-08-20-record-827-ledger.md` both carry a genuine `open` row despite already-archived run directories, exactly the case this rule exists to catch.

Before recommending Delete, also sanity-check that no open work record's body references the ledger's filename or feature slug — a quick judgment read, not a scripted grep across every open record (Step 4 stays in the main thread precisely because its rule set is cheap).

→ Collect each as: `[ledger] {filename} — {recommendation}`

## Step 4.5: Audit Git Worktrees, Build Branches, and Artifact Residue

**Working-directory discipline:** every `git` command in this step (and in any dispatched parallel agent) MUST be anchored with `git -C "{REPO_ROOT}"` (or run after `cd "{REPO_ROOT}"`). `{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before any agent fires. See `_shared/git-discipline.md` and the Working Directory Discipline section in `_shared/subagent-output-contract.md`. CWD does not propagate reliably across parallel agents — without the anchor, branch deletions and worktree removals can land in the wrong checkout.

**Reconcile first:** before any probe below, run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile --json` — converges `{REPO_ROOT}` toward origin (`bin/lib/reconcile`, #407) so this step's worktree/branch audit reads already-current state instead of racing a stale mirror, the same placement `dispatch/SKILL.md` Step 2 uses for its own queue pull. `--json` is required here, not the plain `reconcile` default (#638's compact summary) — this step parses the result's `console.ready` array below. Log the JSON result to this run's `decisions.md`. A non-empty `console.ready` array names answered consoles this sweep is well-placed to close out — follow `_shared/console-execution.md` for each before continuing.

**Worktrees and merged remote branches — shared probe.** Run, anchored at `{REPO_ROOT}`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/residue.js" --base {merge-base} --scope repo --no-suite --json
```

`{merge-base}` resolves to `HEAD` for this step — /tidy has no single feature branch to diff, unlike `/wrap-up`'s own close-time invocation of this same CLI (`residue-sweep.md`), which passes its run's actual base; `--base` gates the whole invocation on a resolvable commit-ish but isn't otherwise read by the worktree/branch probes. `--no-suite` skips the CLI's own test-suite probe, which this step has no use for.

Each `kind: worktree` finding is one candidate — every worktree beyond the main working tree, `subject` the path, `evidence` reporting locked/unlocked state, branch, `dirty: true|false|unknown`, and reaper-domain membership. This replaces `git worktree list` as this step's worktree enumeration one-for-one. If the results block reports `ran: false` for this probe, treat worktrees as **`unknown`** for this run, not clean — an empty `findings` array under `ran: false` must never be read as "no worktrees."

Each `kind: branch` finding is a **remote-tracking** branch (of the integration branch's own remote — `origin` by default) already merged into the integration branch and not yet deleted. This does **not** replace the local `build/*` scan below — it is a narrower, differently-shaped catch: it never surfaces an unmerged branch (the probe filters to `--merged` only, so an unmerged `build/*` branch is invisible to it — exactly the case the "Unmerged changes" row needs), and it never surfaces a branch that was only ever merged locally, e.g. via `_shared/scratch-worktree.md` §5's `git push . <sha>:{integration-branch}` pattern, which is this repo's own dominant merge shape for worktree-derived branches and leaves no remote-tracking ref at all. Fold its findings in as an **additional** repo-wide check for stray already-merged remote branches (of any name, not just `build/*`), never as a substitute for the scan below.

Each `kind: artifact` finding is aged QA-artifact residue (an aged dir under `.claude-tweaks/artifacts/`, or a legacy pre-relocation `screenshots/`/`traces/` root) — collect as `[git] {subject} — {evidence} — Delete` when `remedy: auto`, or `— Delete (judgment)` when `remedy: record`.

Each `kind: pipeline-run` finding is an un-archived clean run directory (`run-state.json` status `clean`, not yet moved under `.claude-tweaks/pipelines/archive/`) — collect as `[git] {subject} — {evidence} — Archive` (`remedy` is always `auto` for this kind — the archival move documented in `wrap-up/cleanup-procedures.md` Section B).

This step's per-kind coverage above is not a fixed list — treat `bin/residue.js`'s probe directory (`bin/lib/residue/probes/`) as the authoritative kind set under `--scope repo`, and give any probe added there a paragraph here (or an explicit exclusion note) before relying on the assertion in `step-6-auto.md` that every Step 4.5 pass reads it. `kind: pr` is the one deliberate exception: Step 4.8 below fetches PRs directly instead of reading it from this CLI — see that step's own "Not re-pointed at `bin/residue.js`" paragraph for why.

**Build branches (local, any merge state):** Run `git -C "{REPO_ROOT}" branch --list "build/*"`. The CLI above has no equivalent for this — it can only ever report merged, remote-tracking branches, so a local-only or still-unmerged `build/*` branch (including one being actively worked on) is outside its domain entirely.

| Status | Recommendation |
|--------|---------------|
| Related spec complete + changes merged | Remove/delete |
| Related spec in progress | Keep |
| No related spec found | Remove/delete (orphan) |
| Unmerged changes | Keep (flag for attention) |

**PR-state override (`integration-model: pr-first` runs only — `_shared/integration-model.md`).** Before applying the table above
to a worktree/branch pair, check whether it belongs to a run that recorded a PR: run dirs are
anchored to `{REPO_ROOT}` regardless of which worktree they assigned
(`_shared/pipeline-run-dir.md`), so read every `.claude-tweaks/pipelines/*/run-state.json`
directly (no per-worktree access needed) and join by `state.worktree` matching this pair's
worktree path — the same join `bin/lib/hooks/context.js`'s `findRunByWorktreePath` performs
in-process. A match whose `run-state.json` carries a `pr` object overrides the table above:

```bash
gh pr view {pr-number} --repo {owner}/{repo} --json state,isDraft
```

| PR state | Row |
|---|---|
| `OPEN` (draft or not) | **in-flight** — keep, PR #{number} open (never reached by the table above's "Unmerged changes" row's ambiguity — this is a positive, not a default) |
| `MERGED` | Same as "Related spec complete + changes merged" — the reconciler (`bin/lib/reconcile`) should have already reaped this; a survivor here means the reconciler hasn't run recently, not a different disposition |
| `CLOSED` (unmerged) — check for the tombstone marker: `gh pr view {pr-number} --json comments --jq '.comments[] \| select(.body \| startswith("<!-- run-comment: failure -->"))'` | **Non-empty result → tombstoned.** Keep — same as `bin/lib/reconcile/reap-merged.js`'s own `pr-closed-unmerged` skip decision; this row states in prose what that module already enforces in code, never contradicting it. Recommendation: `Keep (tombstoned — retry via /claude-tweaks:dispatch or /claude-tweaks:flow, PR #{number})`. **Empty result → abandoned**, not tombstoned — a human closed the draft without the run ever reaching the failure path. Recommendation: `Keep (abandoned — closed PR #{number} carries no failure marker; manual review before removing worktree)`. Never auto-remove either case — `/tidy` never escalates a "manual review" row to a destructive delete on its own. |

Absent a `pr` object (`local-merge`, or a degraded `pr-first` run), or when the `gh` calls above
fail, fall back to the table above unchanged — this override only ever adds information, never
removes the pre-#410 classification's own coverage.

→ Collect each as: `[git] {worktree/branch} — {recommendation}`

Use `git -C "{REPO_ROOT}" branch -d {branch}` (safe delete). `-d` only proves containment in `HEAD`/the branch's own `@{upstream}` — it refuses identically whether the branch is genuinely unmerged or merged into a *different* long-lived base (a `dev` → `staging` → `main` promotion chain is the common shape). Treat a refusal as **ambiguous**, not as proof of unmerged work: before surfacing anything, resolve every other configured base to a **plain branch name** — the project's `integration-branch` policy value (when pinned) plus the repo's own default branch, resolved via `git -C "{REPO_ROOT}" symbolic-ref --quiet --short refs/remotes/origin/HEAD | sed 's@^origin/@@'` — per `_shared/integration-branch.md`'s canonical ladder, deduped when they're the same. **Never use the raw `origin/HEAD` form as `{base}` below** — substituting it into `origin/{base}` yields the malformed ref `origin/origin/HEAD`. For each resolved `{base}`, check `{branch}`'s membership **both** ways — this repo's own dominant merge shape for worktree-derived branches (`_shared/scratch-worktree.md` §5's `git push . <sha>:{integration-branch}` pattern) leaves no remote-tracking ref at all, so checking the remote-tracking form alone reproduces the exact false negative this fix exists to eliminate:

- `git -C "{REPO_ROOT}" branch --merged origin/{base}` (remote-tracking ref, when it exists)
- `git -C "{REPO_ROOT}" branch --merged {base}` (local branch, when it exists)

Before classifying a `-d` refusal by merge state at all, check whether `{branch}` is currently
checked out in another worktree (`git -C "{REPO_ROOT}" worktree list --porcelain`, scanning for
`branch refs/heads/{branch}`) — a checked-out branch refuses `-d`/`-D` alike regardless of merge
state, and since this step deliberately keeps locked worktrees (see below), that refusal reason is
otherwise indistinguishable from "needs -D" and would get the wrong remedy.

`{branch}` counts as merged into `{base}` if either form lists it. Four outcomes, never three:

| Outcome | Recommendation |
|---|---|
| `{branch}` is checked out in another worktree | **`checked out in {worktree-path} — remove worktree first, then re-run`**. `-D` would refuse for the same reason `-d` did; this is not a merge-state question |
| `-d` succeeds | Deleted — no further action |
| `-d` refuses, but `{branch}` is merged into some other configured `{other-base}` (either form above) | **`merged into {other-base} — needs -D, manual review required`**. Safe in principle (no unmerged work), but `-d` cannot delete it and `-D` is never invoked autonomously in /tidy — surface for manual approval, never auto-escalate |
| `-d` refuses, and `{branch}` is merged into no configured base (either form) | **`unmerged — manual review required`** — this is the only case that actually means unmerged work |

**Dirty-worktree override** (before `Remove/delete`): merge state says nothing about
working-tree state (#1424). `dirty: true|unknown` routes to `dirty — manual review required`
with the changed files (`git -C {path} status --porcelain`) — never `Remove/delete`, never a
bare `--force` suggestion.

Use `git -C "{REPO_ROOT}" worktree remove {path}` for worktrees.

A **locked** worktree will refuse to remove. Do not force it: a live lock means a session
is using it. Surface it as `locked — manual review required`.

`SessionStart`'s reaper (`bin/lib/hooks/worktree-reap.js`) collects *some* of these
unattended, but its reach is deliberately narrower than this step's, so do not read a
still-locked worktree as one the reaper has already judged. It only considers worktrees
under `{REPO_ROOT}/.claude/worktrees/` (ADR-0004's harness-owned domain — `.worktrees/`
belongs to superpowers' `finishing-a-development-branch`), it unlocks only when the lock's
owning pid is provably dead **and** nothing in the worktree has been modified for 24h, and
it reaps nothing at all on a repo where its own integration-branch resolution comes up empty
(`_shared/integration-branch.md` — the reaper's row in the per-consumer fallback table; it
may consult only the `integration-branch:` policy key and `origin/HEAD`, never the checked-out
branch). Anything still locked at `/tidy` time is therefore in use, unrecognized, recently
active, out of the reaper's domain, or on a repo where the reaper is inert.

## Step 4.6: Audit Doc Registry

Scan `docs/REGISTRY.md` for health issues. Skip if the file doesn't exist.

| Issue | Recommendation |
|-------|---------------|
| Registry entry points to non-existent file | Delete entry |
| Doc file exists in `docs/` but not in registry | Add entry (with Auto-detect patterns) |
| Auto-detect pattern references non-existent directory | Update pattern |
| Registry tier doesn't match project complexity | Update tier (suggest `/claude-tweaks:init update`) — apply tier-detection signals from `detection-tables.md` in `/claude-tweaks:init` skill's directory |

→ Collect each as: `[registry] {issue} — {recommendation}`

## Step 4.7: Audit Issue Claims

**Working-directory discipline:** every command in this step (and in any dispatched parallel agent) MUST be anchored, but the three commands below do not all take the *same* anchor:

- The claim-ref listing and the `gh issue list` backstop take `{REPO_ROOT}` — `git rev-parse --show-toplevel`, the same resolution Step 4.5 documents. `gh` infers the target repo from the cwd's git remote, and either checkout has the same remote.
- **Both backstops that run `find .claude-tweaks/pipelines` take `{RUN_ROOT}` instead** — the **main checkout** root, resolved as `RUN_ROOT=$(node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --root-only)` (`_shared/pipeline-run-dir.md`'s Anchoring section). Run directories are anchored to the main checkout at creation, so from inside a linked worktree `--show-toplevel` names the worktree — which holds no `.claude-tweaks/pipelines/` at all — and the `find` returns zero. Resolved from the main checkout the two are the same path, so this only ever matters when `/tidy` runs from a worktree.

Anchor with `cd "{REPO_ROOT}" &&` / `cd "{RUN_ROOT}" &&` at the start of each command. CWD does not propagate reliably to dispatched Task agents (see `_shared/subagent-output-contract.md`'s Working Directory Discipline section) — an un-anchored (or wrongly-anchored) `find .claude-tweaks/pipelines/...` doesn't error, it silently returns zero matches, which reads identically to "no missed restorations found," the opposite of the loud failure this anchor is meant to guarantee. A wrong cwd can also point `gh issue list`/`gh api` at an unrelated repo entirely, not just fail to find files.

Skip silently when the repo has no GitHub remote (pre-check, before any listing attempt) —
`gh` being unavailable alone no longer skips this step, per `_shared/github-write-transport.md`;
use the MCP path instead. If the listing call itself fails mid-scan after passing that
pre-check — recognized and classified per `_shared/github-rate-limit.md` for a rate limit,
or any other transient API error — skip the rest of this step and note it in the report —
per `_shared/issue-claims.md`'s Failure posture table ("Blob listing fails in /tidy → skip
the sweep step, note it in the report"), not silently. See `_shared/issue-claims.md` for the
full protocol.

**Primary: list the `claims/` blob keyspace** (`_shared/issue-claims.md`'s "The lock" — "List
all claims"). For each entry, read the blob and classify with `classifyClaimBlob`:

```bash
gh api "repos/{owner}/{repo}/contents/claims?ref=claims-registry" -q '.[].name'
# for each claims/issue-<n>.json:
gh issue view <n> --json state -q .state
gh api "repos/{owner}/{repo}/contents/claims/issue-<n>.json?ref=claims-registry" -q '.content' | base64 -d > /tmp/tidy-claim-<n>.json
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  const content = require('fs').readFileSync(process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" /tmp/tidy-claim-<n>.json
```

(gh path shown above; use `_shared/issue-claims.md`'s MCP-path "List all claims" / read-file
call when `gh` is unavailable — the same `claims/` directory on `claims-registry`, MCP tools
instead of `gh api`.)

| Status | Recommendation |
|--------|---------------|
| Issue closed (any claim state) | Release (orphan — the work is done or dismissed) |
| Blob classified `'stale'` | Release (crashed or abandoned run) |
| Blob classified `'unreadable'` | Manual review (never break a claim you cannot read) |
| Live claim (`'live'`), but its `claimedAt` fails to parse as a date | Manual review (per `bin/lib/issues/claims.js`'s `isStale` fail-closed contract — a corrupted-but-JSON-valid claim is never automatically stale; flag it explicitly rather than keeping it silently forever) |
| Blob classified `'live'`, issue open | Keep |

Releasing = the current-blob conditional overwrite with the tombstone content
`releasePayload` generates (reason `swept: stale claim` or `swept: issue closed`). Releases
execute only after Step 6 batch approval — breaking a lock is never autonomous in /tidy.

→ Collect each as: `[claim] claims/issue-{n}.json — {status} — {recommendation}`

### Backstops: issue-claim audit-trail integrity checks

**Extracted — read `issue-claims-backstops.md` in this skill's directory.** That file carries all
four Step 4.7 backstop scans in full: missed `parked` restoration, missed `bot:in-progress`
removal, empty `decisions.md` on a completed standalone run, and preserved-but-unfiled upstream
feedback drafts — each one's find/gh command, per-match fields, and collection line. Nothing of
their procedures remains here — these headings survive so an external reference naming any of the
four by name still resolves in one hop. The `[unfiled]` collection tag from the fourth backstop
still routes via this file's own Collection routing table below.

The dispatcher inlines `issue-claims-backstops.md` **whole** into the Issue Claims agent's
prompt, **after** this file's own Step 4.7 section above (the primary claim listing, "Backstops"
heading included, ending here) — the same order the two files stood in before the split, which is
what keeps `issue-claims-backstops.md`'s own "this step's own claim listing above" references
literally true in the assembled prompt.

## Step 4.8: Audit GitHub PRs and Issues

**Not re-pointed at `bin/residue.js`.** That CLI's `kind: pr` probe (`probeForge`) is a raw
`gh pr list --state open --json number,title,headRefName` with no staleness/CI/review-thread
classification and no issue scanning at all — no `by:code-health`/`by:harness-health`/
`by:journey-health`/`by:docs-health` labels, no `acceptance-gap`, no `parent-gate`. Its fields
aren't even sufficient to redo item 1's classification below (no `updatedAt`, `isDraft`,
`reviewDecision`, or `url`), so this step still fetches PRs itself and keeps its full procedure
below unchanged.

Scan per `_shared/github-pr-scan.md`, **`repo-wide`** scope, plus `_shared/github-pr-scan-acceptance.md`'s **`acceptance-gap`** and **`parent-gate`** scopes (extracted from the first file — #204). The dispatcher inlines all three scope sections (the `repo-wide` findings table, the `acceptance-gap` procedure, and the `parent-gate` procedure), `github-pr-scan.md`'s Output Contract, and `_shared/forge-detection.md`'s Detection Ladder into this agent's prompt. Each scope section goes in **whole** — the `acceptance-gap` and `parent-gate` sections' `work-links` resolution and fetch-limit sub-sections are part of the procedure, not preamble around it. Both of those scopes branch on `work-links: body-text` vs `native`, and an agent given only the branches and no way to resolve the key silently takes the first-listed one: on a `native` repo that returns zero sub-issues from every parent, so every sub-issue re-enters `acceptance-gap` as a false row and `parent-gate` emits nothing at all. The detection ladder makes this fail-open — skip with a single info row when the repo has no GitHub remote or `gh` is unauthenticated/the repo is unreachable (checks 1 and 3, hard gates on either transport). `gh` being unavailable alone (check 2) no longer skips this step's `repo-wide` scope wholesale — per `_shared/github-pr-scan.md`'s Transport section, its issue-backed items (3, 5, 6, 7, 8) route through MCP and its PR-backed items (1, 2, 4, 9, and item 10's PR cross-check) degrade individually. The `acceptance-gap` and `parent-gate` scopes below are unaffected by this change (out of scope for #172 — both are entirely issue-backed, per that same Transport section) and still hard-skip on `gh`-absence via check 2.

The `repo-wide` findings table maps each finding to a recommendation from the Action Vocabulary: stale/superseded open PRs → Close (GitHub); threads addressed by later commits → Resolve thread; unaddressed threads → Capture or a suggested local command; still-valid vs. superseded code-health, harness-health, journey-health, and docs-health issues → Close (GitHub) when the flagged code is demonstrably gone (Shape 6 above) or a suggested `/claude-tweaks:backlog refine` run when still valid; merged PRs with surviving local branches → corroborates Step 4.5 `[git]` rows (the dispatcher merges overlapping recommendations at assembly). Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy — Shapes 1, 2, 3, 4, 5, and 5.5 of `step-1-records.md`) are Step 1's job now, not this step's — `repo-wide` no longer queries the `backlog` label (see `_shared/github-pr-scan.md`).

The `acceptance-gap` scope finds closed records with no acceptance label at all — a different gap than the `acceptance-queue` scope `/help` Stage 4.7 uses, which only sees records already flagged `demo:pending`. Its recommendation is always "run `/claude-tweaks:demo #{n}`" — never one of the Action Vocabulary's atomic actions, since disposing a closed record is a judgment call for a human, not this step. It covers `work-backend: github-issues` only; under `local-files` the same finding comes from Step 1's **Shape 8** (`step-1-records.md`), exactly as `parent-gate` comes from Shape 7 there.

The `parent-gate` scope finds decomposition parents whose every sub-issue has closed but which carry no acceptance disposition — the backstop for a parent that missed `/claude-tweaks:wrap-up`'s eager gate (a sub-issue closed via `auto:merge`, by hand, or by a dispatch run that ended early never reaches that eager path). Unlike `acceptance-gap`, its recommendation **is** one of the Action Vocabulary's atomic actions — `Open parent gate` — which composes and posts the parent's Verification Brief and applies `demo:pending`, reusing `wrap-up/verification-brief.md`'s Parent-Gate Procedure rather than a second copy of that logic (`tidy/actions-github-issues.md`'s `## Open parent gate`). It never applies `demo:approved`/`demo:changes-requested` — that verdict stays exclusively `/claude-tweaks:demo`'s job, so the finding still ends with "then run `/claude-tweaks:demo #{n}`" even once approved.

GitHub mutations recommended here (Close (GitHub), Resolve thread), `acceptance-gap` findings, and `parent-gate`'s `Open parent gate` action all execute only after Step 6 batch approval and are staged at every aggressiveness level in auto mode — outward-facing actions are never autonomous in /tidy. See `_shared/github-pr-scan-acceptance.md`'s `acceptance-gap` scope for why. `Open parent gate` posts a comment and adds a label, an outward-facing GitHub API write that fails the auto-mode contract's reversibility floor regardless of how mechanical or precondition-only the write is — see `_shared/github-pr-scan-acceptance.md`'s `parent-gate` scope and `tidy/step-6-auto.md`'s Open parent gate row for the full reasoning. Staging governs the write itself here, not just the disposition it precedes; the disposition (`demo:approved`/`demo:changes-requested`) stays exclusively `/claude-tweaks:demo`'s job either way.

→ Collect each as: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
→ Collect each as: `[acceptance-gap] #{n}: {title} — closed with no acceptance disposition — recommend /claude-tweaks:demo #{n}`
→ Collect each as: `[parent-gate] #{n}: {title} — parent complete, no acceptance disposition — Open parent gate, then /claude-tweaks:demo #{n}`

## Step 4.9: Audit Impeccable Design Record

Main thread, parallel with the agent batch — like Steps 4 and 4.6, this is one Skill-tool call that shells out to a JSON-emitting script, and dispatching it as an agent would pay the full inherited `CLAUDE.md` cost to run it.

Invoke `/claude-tweaks:design-wrapper doctor --source tidy` via the Skill tool. It takes **no target**: `doctor` audits the project's own Impeccable artifacts (`PRODUCT.md`, `DESIGN.md` + sidecar, `.impeccable/config.json`, surface briefs, the design hook), not a diff. `--source tidy` is unconditional — /tidy is standalone-only and never has a `$PIPELINE_RUN_DIR` to forward (see `design-wrapper/SKILL.md`'s Component-Skill Contract).

### Degrade silently

**On `{skipped: ...}`, collect nothing and render nothing.** No row, no "unavailable" note, no info line in the Summary. /tidy runs on every project and most have no Impeccable context at all — a scan step that reports its own absence every run trains users to skim past the report. This is the one step whose skip is invisible; every other step's fail-open surfaces an info row.

### The finding schema

`skills/design-wrapper/modes/doctor.md` **owns** the schema — its `## Finding schema` section is the single source of truth for the six fields, their types, and the three severity values. Read it there; do not restate it here. Two properties matter for the mapping below and are easy to get wrong:

- `path` is **nullable**, and when present may be a **comma-joined list** of paths rather than one path.
- `artifact` is always present but is a human label, not always a filename (`hook manifest`, `live state`, `surface brief`).

### Mapping to the report table

Each finding becomes one Template A row, read through this skill's own column semantics (`SKILL.md`'s "Tidy-specific column semantics"):

| Column | Value |
|---|---|
| `Severity` | Tidy's own urgency scale, mapped from `severity` per the table below |
| `Path:Line` | The finding's `path`; when `path` is `null`, fall back to `artifact` — never render an empty cell |
| `Finding` | `[doctor] {id} ({severity}) — {summary}` |
| `Evidence` | The finding's `fix` text, verbatim |

Upstream's `route`/`mention`/`auto` is preserved **verbatim inside the `Finding` cell**. That is deliberate: upstream's `--fix` boundary is defined in terms of those exact strings, so the tidy-severity value is a display convenience and never the authority.

| `severity` | Tidy severity | Why |
|---|---|---|
| `route` | `medium` | Needs a real Impeccable command to resolve — the same urgency tier as Promote/Absorb/Defer. |
| `auto` | `low` | A mechanical migration with no judgment in it — "routine cleanup" exactly. |
| `mention` | `info` | Worth saying; no action strictly required. |

This ordering puts `auto` above `mention`, inverting upstream's `route`/`mention`/`auto` display order. That order is a reading order for upstream's own text renderer, not a ranking: an `auto` finding is a concrete, safe, ready-to-apply fix being deliberately withheld, which is more actionable than an informational `mention`. Both keep their upstream word in the `Finding` cell, so nothing is lost either way.

### Nothing here is ever applied

These rows are **surface-or-suppress**, not apply-or-skip. This step edits no project file under any condition: `route` and `mention` findings have no mechanical fix by construction, and `auto` findings are staged proposals carrying their own `fix` text — applying them means `doctor.mjs --fix`, which rewrites `PRODUCT.md` and is the user's call, per `_shared/auto-mode-contract.md`'s staging model. The Step 6 decision is only whether the row is worth showing.

That is why `[doctor]` routes to **Yours ({N})** and **never** **Approve ({N})**: every entry in Approve carries a recommendation from the Action Vocabulary, and every one of those mutates something.

→ Collect each as: `[doctor] {id} ({severity}) — {summary} — {fix}`

## Step 4.95: Calibration Read-Out

Main thread, parallel with the agent batch — report-only, no action drill, matching `[doctor]`'s surface-or-suppress posture.

Invoke `node "${CLAUDE_PLUGIN_ROOT}/bin/calibration-report.js"` and render its output verbatim under **Yours ({N})** — no action drill, no mutations.

→ Collect as: `[calibration] {rendered report text}`

## Step 5: Record Sizing Review

For `ready` records not yet claimed — `facets.bot.inProgress === false` (from Step 1's already-fetched facets under `work-backend: github-issues`; every `ready` local record qualifies, since the local driver carries no bot state) — fetch each body and check sizing:

- **Too large** (10+ tasks implied by Deliverables/Acceptance Criteria): recommend splitting
- **Too small** (1-2 trivial tasks): recommend absorbing into a related record
- **Too vague** (no concrete deliverables or acceptance criteria): recommend re-running `/claude-tweaks:specify {ref}` to re-shape it

→ Collect each as: `[sizing] {ref}: {title} — {issue} — {recommendation}`

## Step 5.5: Cross-Spec Pattern Detection

Scan recent git history for recurring findings across review summaries and wrap-up reflections. Patterns that appear in 2+ specs signal systemic issues worth addressing at the project level rather than per-spec. This step is self-contained via git log — it does not depend on Step 1's record scan.

### How to scan

1. Search recent commits for review and wrap-up artifacts:
   - `git log --all --oneline --grep="review" --grep="wrap-up" --since="4 weeks ago"` (or check `docs/plans/*-review-summary*` and recent wrap-up commits)
2. **Cap the read** — order the artifacts found in item 1 by commit date, most recent first, and read at most the **5 most recent**. Where the artifact is a review summary, read only its `### Code Review Findings` and `### Design Quality` sections (`skills/review/review-summary-template.md`'s headings — the exact sections item 3 below extracts from), not the whole file: review summaries average ~25 KB, and a category-recurrence signal doesn't need the rest (Spec Compliance, Verification, Tradeoffs Accepted, Next Actions). For any other referenced artifact (e.g. a wrap-up reflection embedded directly in a commit message rather than a standalone file), the 5-item cap alone bounds it. If 5 artifacts turn up too few data points for a signal (e.g. only 1-2 exist in the window), that's a legitimate "not enough history yet" result — widen `--since` or the 5-item cap deliberately for a one-off deeper sweep rather than reading past-cap files by default.
3. Extract findings by category (Security, Convention, Performance, Error Handling, Architecture, Test Quality) from the Code Review Findings section. Also read each review summary's Design Quality section (present when `/claude-tweaks:review` Step 6.5 ran and Impeccable returned findings) and extract those findings by their own `category` field — a separate vocabulary (Impeccable's categories: typography, spacing, color, component, and others), not the Code Review Findings taxonomy above.

### What to look for

| Signal | Example | Recommendation |
|--------|---------|---------------|
| Same finding category in 3+ reviews | "Convention: import from shared package" in specs 41, 43, 45 | Add rule to CLAUDE.md or `.claude/rules/` |
| Same file flagged across specs | `src/utils/validate.ts` modified and reviewed in 4 specs | Refactor — this file may be a responsibility magnet |
| Same gotcha rediscovered | "Use upsert not delete+insert" in 3 spec Gotchas | Add to CLAUDE.md as a project convention |
| Recurring deferred items with similar themes | "Add error boundary" deferred in 3 specs | Promote to its own record — it's not going away |
| Same Design Quality category recurring in 3+ reviews | "component" findings in specs 41, 44, 47's Design Quality sections (a card/button/layout pattern reimplemented each time) | Run `/impeccable:impeccable extract` — this pattern is being reimplemented, not reused |

→ Collect each as: `[pattern] {description} — seen in {spec list} — {recommendation}`

### Project Health Summary

When 3+ specs have shipped (`git log --all --oneline --grep="wrap-up" --since="8 weeks ago"`, or the same commit window this step's own scan above already searched), include a brief project health summary in the tidy report:

1. **Velocity** — count shipped (git log for wrap-up/merge commits) vs. `ready`-or-building vs.
   `backlog`/`parked`. The shipped count is this step's own git-log scan (self-contained, per this
   step's opening line); the other three are Step 1's facet counts, an opportunistic enrichment
   included only when Step 1 already ran in this same tidy invocation (`patterns` scope run alone
   never triggers Step 1 to satisfy this — `#205`: this bullet is additive to Step 5.5's
   self-containment, not evidence against it)
2. **Recurring themes** — conventions worth codifying if they appear in 3+ specs' wrap-up reflections
3. **Convention candidates** — suggest: "This pattern shows up in {N} specs — consider adding to CLAUDE.md: `{pattern}`"

→ Collect each as: `[health] {observation} — {recommendation}`

Patterns and health observations are informational — they surface systemic issues the user may want to address. They render in **Yours ({N})**, each with its own follow-up command; informational never means silently dropped.

---

## Collection routing

| Collection prefix | Renders in Step 6 report | Notes |
|---|---|---|
| `[backlog]`, `[parked]`, `[unsynced]`, `[doc]`, `[plan]`, `[git]`, `[registry]`, `[pr]`, `[gh-issue]`, `[parent-gate]`, `[claim]` | **Approve ({N})** (or **Applied automatically** when the tier auto-applied it) | Each row gets a pre-filled recommendation carrying its exact executable action. Some of these tags also emit non-mutating outcomes on individual findings — `[backlog]`/`[parked]`/`[plan]` Keep rows land in **Clean:** instead; `[backlog]`/`[parked]` Promote and `[doc]`'s "Run `/claude-tweaks:specify`" outcome land in **Yours ({N})**; `[pr]` awaiting-review and unarmed-ungranted outcomes land in **Yours ({N})**; `[claim]` Release and both missed-restoration backstops (`parked` / `bot:in-progress`) are staged, executable actions here, but `[claim]` Manual review outcomes (unreadable/unparseable blobs, empty-`decisions.md` backstop) land in **Yours ({N})** and Keep (live claim, issue open) lands in **Clean:** — the destination follows the actual routing outcome (`step-6-auto.md`'s Bucket mapping), never the tag alone. |
| `[scoring]`, `[blocked]`, `[legacy]` (`step-1-records.md`'s Shape 5.5), `[acceptance-gap]`, `[sizing]`, `[unfiled]` | **Yours ({N})** | Auto (no-op, always surfaced) at every aggressiveness tier — no mutation exists to stage; each finding carries its own paste-ready command. |
| `[pattern]` | **Yours ({N})** | Informational; presented as items in Yours. |
| `[doctor]` | **Yours ({N})** | Surface-or-suppress, never apply — this step mutates nothing. Deliberately **not** **Approve ({N})**, whose every row carries a mutating Action Vocabulary recommendation. Section omitted entirely when the scan skipped or found nothing. |
| `[calibration]` | **Yours ({N})** | Report-only, surface-or-suppress, never applied — matches `[doctor]`'s semantics. No action drill. |
| `[health]` | **Yours ({N})** — each line carries the finding's own follow-up command (e.g. the matching `/claude-tweaks:*-health` skill or the file to review) | Project-level observations. |
| Keep / nothing-to-report scans (any tag above) | **Clean:** (counted) | Never itemized rows. |
