---
files:
  - skills/dispatch/SKILL.md
  - skills/wrap-up/SKILL.md
  - skills/_shared/pr-first-merge.md
---

# Resume a Parked Dispatch Run

**Persona:** claude-tweaks user who has a dispatched `/flow` run parked at `pending-review` (its Review Console is waiting for a human, or the session that hit it has exited) and wants the agent to pick it back up — including by simply saying "merge!" or "resume it" in chat, rather than typing the documented `PIPELINE_RUN_DIR=... /claude-tweaks:flow "{target}" wrap-up` command themselves.
**Goal:** Get a clear, evidence-backed confirmation of what is about to happen before the agent re-enters the run's Review Console and any merge proceeds — never have the agent silently re-invoke the resume command off a casual remark.
**Entry point:** The user asks the agent (in chat, not via the literal command) to resume/merge a run they know is parked — e.g. after seeing a stale PR or being told a build finished with `pending-review`.
**Success state:** The user sees PR number, CI status, and files changed before anything runs, explicitly confirms or declines, and — only on confirmation — the agent re-enters the same run directory's Review Console exactly as if the documented command had been typed directly.

## Steps

### 1. Ask to resume conversationally — chat
- **URL:** no command — free-text chat, e.g. "resume the run for #531" or "merge it"
- **Action:** The user names or implies the parked run without typing the resume command itself.
- **Should feel:** As safe as typing the command directly — a casual phrasing must not skip any safeguard a literal invocation would have gone through.
- **Should understand:** The agent will not silently act on this — it first surfaces what it's about to do. This holds whether the resume happens through dispatch's documented command or through `skills/wrap-up/SKILL.md`'s own `/claude-tweaks:wrap-up #{n}` re-entry form — both point at the same confirmation gate.
- **Red flags:** The agent immediately re-invokes `/claude-tweaks:flow "{target}" wrap-up` (or the `wrap-up`-direct re-entry form) with no confirmation step in between.

### 2. Read the confirmation — `AskUserQuestion`
- **URL:** no page — an `AskUserQuestion` rendered by the agent per `skills/dispatch/SKILL.md`'s "Confirm before resuming": header `Resume run`, question opening `Resume {target} toward merge? PR #{number} …`, and exactly two options — `Resume (Recommended)` and `Cancel`.
- **Action:** Read the question, which names the target, PR number and URL (or, under `integration-model: local-merge`, the branch/worktree), CI status, and files changed.
- **Should feel:** Grounded in live evidence, not a rubber-stamp — the values are sourced fresh (`gh pr view`/`gh pr checks`/`gh pr diff`; falling back to `run-state.json`'s `pr` field for the PR reference and `unavailable — gh absent` for CI status/files-changed when `gh` isn't installed), never a stale cached report.
- **Should understand:** Declining stops here — nothing below runs and the run stays parked exactly as it was; this is the one path where "resuming" doesn't proceed toward the console at all. The CI status shown is also *decided on*, once, per `skills/_shared/pr-first-merge.md`'s Step 2.5 (Merge-verification gate) resume rule: green → resume proceeds; red → the confirmation says so and the run stays parked; pending → `--auto` is armed only when the state read shows `mergeStateStatus: BLOCKED` (the forge holds the merge), otherwise this same confirmation carries the choice — because on a repository without required checks, arming *is* an immediate merge of a still-pending PR. Resume never runs the gate's 15-minute watch.
- **Red flags:** CI status or files-changed silently absent with no `unavailable — gh absent` label when `gh` isn't installed; the question naming a PR number that doesn't match the actual parked run; a "Resume" click merging a PR whose checks the question just showed as pending or red.

### 3. Confirm and re-enter the Review Console — `AskUserQuestion` (Review Console)
- **URL:** only reached after choosing "Resume" in Step 2 — the agent re-adopts the run's own `PIPELINE_RUN_DIR` and re-invokes `/claude-tweaks:flow "{target}" wrap-up`, landing in the same Review Console a direct command invocation would reach.
- **Action:** Proceed through the Review Console's own Approve all / Override / Stop decision exactly as documented elsewhere — this journey's own scope ends at the handoff into that console.
- **Should feel:** Continuous with Step 2 — the same run, the same worktree, no re-derivation of state.
- **Should understand:** Its own teardown (claim release, label removal) runs as one step with the console, per `wrap-up/cleanup-procedures.md` Section E — never hand-chained from `/claude-tweaks:demo`.
- **Red flags:** A second, unrelated worktree or run directory getting created instead of the parked run's own.

## Origin
- Created during build of #531 ("Resuming a parked/pending-review merge outside the Review Console has no AskUserQuestion confirmation gate") — the resume-outside-the-console path existed before this build (documented in `dispatch/SKILL.md`'s "Resuming a parked run" section) but had no confirmation gate and no journey coverage; #531 added Step 2's gate and this journey documents it as current behavior.
- Updated during build of #560 (merge-verification: merge-site consumers gate on CI) — Step 2's confirmation now applies the `merge-verification` lever one-shot (green/red/pending rule above), so a resume can no longer merge a pending PR on an unprotected repository.
- Related specs: #531, #560
