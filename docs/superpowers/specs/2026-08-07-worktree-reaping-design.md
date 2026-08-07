# Worktree reaping — make removal safe, then make it automatic

Date: 2026-08-07
Status: approved design, not yet planned

Supersedes the deliverables of #185, which was filed before the owning PID was known to
be recoverable from the worktree lock. Its central open question — what happens to a
locked worktree owned by a dead session — is answered here rather than left open.

## Problem

A worktree whose lane merged via `gh pr merge` is never torn down, and the documented
backstop cannot reap it.

`skills/wrap-up/cleanup-procedures.md` Section C removes the worktree as cleanup item 4.
It runs only when `/claude-tweaks:wrap-up` runs. Parallel multi-terminal dispatch — the
normal shape of work in this repo — ends at PR merge and never reaches it. That is a
first-class terminal state, not a gap in how lanes end, so teardown needs an owner that
is not `wrap-up`.

`skills/tidy/scan-procedures.md` Step 4.5 audits `git worktree list` and Step 7 removes
cleanly-merged worktrees, but three things stop it being the answer:

1. It is human-invoked. Nothing schedules it.
2. Its removal command (`git worktree remove`) is forbidden by CLAUDE.md's `[IL-58]` for
   exactly the directory these live in.
3. `ExitWorktree`, the alternative `[IL-58]` prescribes, only operates on a worktree
   created by `EnterWorktree` **in the current session**. It structurally cannot reap
   another session's.

## Evidence

Measured 2026-08-07 in this repo.

**Accumulation.** `docs/plans/2026-07-08-worktree-directory-convention-brief.md` recorded
4 worktrees under `.claude/worktrees/` on 2026-07-08 and asked, as its Open Question 2,
whether that was evidence nothing closes them. On 2026-08-07 there were 21. The brief's
suspicion was correct and the problem compounded roughly 5x in a month.

**The orphans were real and the live ones were correctly kept.** Of 13 worktrees examined:
the 8 from the Impeccable program's dispatch waves were all unlocked, clean, and fully
merged — genuine orphans. The 5 locked ones held 15, 6, 5 and 6 unmerged commits
respectively. Step 4.5's `Unmerged changes -> Keep` is the right verdict for those. The
sweep is not too timid; it simply never runs.

**Merge status is silent about data loss.** During the cleanup that produced this design,
7 worktrees were removed after checking `git status --porcelain` — tracked files only,
not `--ignored`. Only one of the eight wave records has a surviving run directory (#143,
whose lane committed `work/143-spec.md`, so it reached `main` via the branch merge). If
any of the other seven held a run directory inside its worktree, its gitignored half
(`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) is unrecoverable. Nothing
indicates a pending decision was destroyed — no `staged/` residue was reported and every
record closed cleanly — but it cannot be proven, and that is the point: the check that
was run cannot distinguish the two outcomes.

This is `[IL-46]`. Section C already knows it, which is why its step 4 copies `$RUN_DIR`'s
gitignored content out **before** its own removal step.

**The owning PID is recoverable.** `git worktree list --porcelain` reports the lock reason
verbatim:

```
locked claude session challenge-framing-gate (pid 29881 start Fri Aug  7 14:40:15 2026)
```

All 4 locked worktrees resolved to live `claude` processes; all 8 unlocked ones were
abandoned. Perfect discrimination across 12 cases. Liveness is directly decidable, not
inferred.

## Thesis

Removing a worktree is dangerous only because a worktree can hold the only copy of
something. Remove that precondition and reaping becomes safe anywhere, by anything —
at which point automating it is unremarkable rather than a risk to be managed.

The supporting observation is that this changes **when** state reaches the main checkout,
not **where** it ends up. Section C already copies the gitignored half out at cleanup, and
`work/{n}-spec.md` already arrives via the branch merge. Both halves converge on the main
checkout today; that is the designed end state. Doing the copy at cleanup time is exactly
why skipping cleanup loses it.

## Phase 1 — anchor the gitignored run-dir half to the main checkout

Resolve the run directory's gitignored half to the main checkout at creation:

```
runDirRoot = dirname(git rev-parse --git-common-dir)
```

In the main checkout `--git-common-dir` is `.git`, so this resolves to the repo root and
is byte-identical to current behavior. Inside a linked worktree it resolves to the main
checkout. Non-worktree usage is unaffected; worktree usage redirects. `[IL-61]` already
uses this exact pattern to fix the statusline's worktree-pivoted project name, so it is a
proven in-repo idiom rather than a new one.

**No new subprocess.** `bin/lib/hooks/worktree-detect.js:69` already spawns a single
`git rev-parse --show-toplevel --git-dir --git-common-dir --show-superproject-working-tree`
and is already imported by `session-start.js`. Phase 1 reads the common-dir value that
call returns rather than adding a spawn, so the anchoring change costs no additional git
invocation on any hook path — and Phase 2's reaper starts from a module that has already
resolved the repository's shape.

`work/{n}-spec.md` stays in the worktree. It must be committed onto the branch, and that
is how it reaches `main`.

**The policy gate already permits this.** `skills/_shared/policy-schema.md`'s single
exemption allows file writes under `.claude-tweaks/pipelines/` from anywhere, because that
directory is plugin-owned gitignored bookkeeping rather than the project work the gate
isolates. No policy change is required, and no new hole is opened: the exemption is
file-write-only (a `git commit` target is the command's working directory, so commits stay
gated) and fails closed on a relative or unresolvable path.

**Enforcement gets more accurate.** `bin/lib/hooks/context.js`'s `iterRunDirsWithState`
resolves `path.join(cwd, '.claude-tweaks', 'pipelines')` — cwd-relative. A run directory
created inside a worktree is therefore invisible from the main checkout, which is the
documented fail-open where "a commit issued from inside a worktree that contains no
`.claude-tweaks/` resolves no run dir and is allowed." Anchoring to one location means
every session resolves the same run set, which is what E1 wanted.

**Deletions.** `wrap-up/cleanup-procedures.md` loses Section C steps 4-5 and the ordering
rule protecting them, because there is no longer anything to copy out. This is a net
deletion, not a second implementation — the outcome `[IL-32]` asks for.

### Files

- `bin/lib/hooks/context.js` — run-dir root resolution
- `skills/_shared/pipeline-run-dir.md` — the resolution contract
- `skills/flow/materialize.md` — creation site
- `skills/wrap-up/cleanup-procedures.md` — delete Section C steps 4-5 and the ordering rule

### Risk

`context.js` drives the wrong-checkout gate. Anchoring it wrongly makes the gate silently
protect less, with no failing test unless one is written for it specifically. See Testing.

## Phase 2 — the SessionStart reaper

Depends on Phase 1. Unsafe before it.

**Placement.** `SessionStart`, after the existing run-state read. Two reasons: it always
fires, where `SessionEnd` does not on a crash or kill; and the dead-PID case is by
definition observable only from *another* session, since a session that died cannot report
itself. The reaper therefore belongs on a hook that runs in other sessions.

**Lock resolution.**

| Lock state | Meaning | Action |
|---|---|---|
| Unlocked | No session holds it | Eligible |
| Locked, PID alive | Genuinely in use | Never touch |
| Locked, PID dead | Session died without releasing | Eligible — `git worktree unlock`, then remove |
| Lock reason unparseable | Unknown | Surface, never act |

**Reap only when all five hold:**

1. It is a linked worktree, never the main checkout.
2. It is not this session's own working directory.
3. Lock resolution says no live owner, per the table above.
4. Its branch is **content-identical** to the resolved integration branch.
5. `git status --porcelain --ignored` is empty of anything not plugin-owned.

Criterion 4 is content identity, not ancestry. `git merge-base --is-ancestor` returns
false for a branch merged with `gh pr merge --rebase`, because rebasing rewrites the SHA
while the content is in `main` permanently under a different hash. This repo favors rebase
merges. Open record **#106** is this same defect in `[IL-45]`'s SHA-identity check; the fix
there and this predicate want the same helper, and should share one.

Criterion 5 is what was missed during the cleanup that produced this design. Phase 1
rescues claude-tweaks' own gitignored state, but `[IL-46]`'s actual incident was
superpowers' `.superpowers/sdd/beyond-scope-discoveries.md`, which Phase 1 does not touch.
The reaper must refuse and surface on unexpected ignored content rather than treat merge
status as covering it.

**Never:** act on ambiguity of any kind — unparseable lock, failed PID check, unresolvable
branch — and never escalate to `git worktree remove --force`.

**No kill switch.** Reaping is unconditional; there is no policy key to disable it. The
predicate is therefore the only safety mechanism, which raises rather than lowers the bar
on failing closed at every branch and on the tests in the Testing section.

**Reporting.** The existing `SessionStart` `additionalContext` banner gains a line naming
what was reaped and what was skipped with the reason, plus one `events.jsonl` entry per
action at the log tier of `_shared/auto-mode-contract.md`.

**Latency.** `git status --porcelain --ignored` is the expensive call and runs per
worktree. Gate it behind the cheap checks — lock and PID first, then content identity — so
it executes only on genuine candidates, typically zero.

### Files

- `bin/lib/hooks/session-start.js` — invocation and reporting
- `bin/lib/hooks/` — new module for lock parsing, PID liveness, and the reap predicate
- `skills/_shared/auto-mode-contract.md` — record reaping at the log tier

## Phase 3 — reconcile the documentation

No behavior depends on this phase.

- Narrow `[IL-58]` in CLAUDE.md and `docs/incident-log.md` to the **locked** case, with the
  counter-evidence recorded: 7 unlocked harness-created worktrees removed cleanly with the
  raw git form on the first attempt. The incident-log narrative stays; only the rule's
  reach changes.
- `skills/tidy/scan-procedures.md` Step 4.5 line 148 becomes correct as written for the
  common path once `[IL-58]` is narrowed. State the locked-worktree case explicitly rather
  than leaving the two files to disagree.
- Fold #106's merge-check into the shared content-identity helper from Phase 2.

## Testing

1. **Anchoring.** Resolution from *inside* a linked worktree returns the main checkout's
   run set — not merely that it returns something. A check that would pass on any input is
   not a weak check (`[IL-78]`).
2. **Lock parsing, frozen fixtures.** Alive-PID, dead-PID and unparseable lock strings as
   committed fixtures, never live `git worktree list` output. The lock-reason format is an
   unversioned implementation detail of a tool this plugin neither owns nor pins — the same
   hazard ADR-0004's Consequences name — so a test reading it live is a scheduled failure
   timed to whenever the harness changes it (`[IL-80]`).
3. **Garbage-stdin invariant.** The new module passes `tests/hooks-dispatcher.test.js`;
   no path sets a non-zero exit.
4. **Discrimination.** For the predicate tests, revert the predicate and confirm each test
   fails. A test that reads correctly but passes against the broken implementation proves
   nothing.

## Failure analysis

**PID reuse only ever under-reaps.** A recycled PID reads as alive, so the worktree is
skipped. There is no input on which a live session reads as dead. The failure direction is
structurally safe rather than incidentally so.

**Lock-format drift fails closed but goes inert.** An unparseable reason surfaces and never
acts, so nothing is destroyed — but reaping stops silently. Test 2 is what detects it.

**Concurrent reaps race benignly.** Two sessions starting together may target the same
worktree; removing an already-removed path errors and is caught.

**No worktrees, or no git.** No-op.

## Non-goals

- Changing where `work/{n}-spec.md` lives. It is committed onto the branch by design.
- Reaping branches. This design removes worktrees; branch deletion stays with `/tidy`
  Step 4.5 and `wrap-up` Section C.
- Touching `.worktrees/` (the git-fallback domain). ADR-0004 assigns that to superpowers'
  `finishing-a-development-branch`, and that division stands.
- Making `/tidy` Step 4.5 obsolete. It remains the human-invoked sweep and gains
  correctness from Phase 3; the reaper covers the unattended path.

## Open items to resolve during planning

- Whether the Phase 2 module belongs under `bin/lib/hooks/` or as a sibling `bin/lib/`
  module, given `/tidy` Step 7 and `wrap-up` Section C may want the same predicate. Three
  consumers is the threshold `[IL-32]` names.
- Whether "plugin-owned" in criterion 5 is an explicit allowlist or a prefix rule, and
  where that list lives so it does not drift from `.gitignore`.
- Whether Phase 1 needs a migration step for run directories currently sitting inside live
  worktrees, or whether letting them drain naturally is sufficient.
