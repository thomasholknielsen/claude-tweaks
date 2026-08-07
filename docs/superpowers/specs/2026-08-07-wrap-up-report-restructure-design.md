# Wrap-Up Report Restructure — State / Actions / Decisions / Evidence

Date: 2026-08-07
Status: design approved, plan pending

## Problem

A standalone `/claude-tweaks:wrap-up` run produced a report that was hard to act on: internal
route codes (`D1`–`D5`) as the primary table axis, five lines of scan telemetry at equal visual
weight to the one scan that found something, decisions mixed with already-decided cleanup, a
history-rewriting `git rebase` disclosed only inside a table cell's "Why" column, and the single
most consequential fact — that the commit had not left the machine — arriving as a postscript
correction below the table.

### Root cause

`SKILL.md:56-59` declares two modes:

| Type | Characteristics |
|------|----------------|
| Record-based | A materialized header exists at `${RUN_DIR}/work/*-spec.md` |
| Conversation-based | No record, just work discussed |

`summary-template.md` renders exactly one shape, keyed to the first: `## Wrap-Up: Record #{n} — {title}`.
Every mode branch in `SKILL.md` tells a conversation-based run what to **skip** (record cleanup,
unblocked-records, ledger gate, Review Console) and none tells it what its **summary** looks like.
With no applicable template, the model composed a report from the steps it had just executed —
which is why the output reads as a step log.

Three of the observed defects are therefore non-compliance with rules that already exist:

- **Scan telemetry** — `summary-template.md:41` already specifies a one-line roll-up in the summary
  and *"See `decisions.md` for the full `SCANNED` summary line."*
- **Route codes** — `_shared/learning-routing.md:15-19` defines `D1`–`D5` as internal classifier
  vocabulary. The template's own `Q#` rows already use a plain-language `Destination` column
  (`summary-template.md:87`).
- **Actions Performed** — the table exists at `summary-template.md:43`.

### Two defects are real and independent of mode

1. **Actions Performed is structurally blind to history operations.** Its `Generate from:` sources
   (`summary-template.md:54`) are cleanup actions in Step 10, config/skill updates applied, ledger
   items resolved in Step 8.5, and `events.jsonl` commit breadcrumbs. A rebase is none of those. A
   fully compliant *record-mode* run would have missed it identically.

2. **No State block exists in either mode.** Nothing asks "what is true now" — branch, pushed or
   not, worktree, scope boundary. That is why "it landed" could be wrong and only correctable as a
   postscript.

## Decisions taken

| Question | Decision |
|---|---|
| Scope | One shape for both modes — restructure the shared template, conversation mode is that shape minus record-keyed sections |
| Enforcement | Mechanism, not prose — a deterministic helper backs the State block |
| Git-op source | `git reflog`, not a new hook — no new storage, no `hooks.json` matcher changes, catches ops a matcher would miss |
| Reflog boundary | `--since <base>` supplied from the scope wrap-up already computes for Step 3, printed back in the State block so a wrong base is visible |

### Why reflog rather than a hook

The enforcement decision initially pointed at widening `gitTargets` (`bin/lib/hooks/git-command.js:200-201`,
where the subcommand is already parsed) plus new `hooks.json` matchers. A rebase is unrecorded today by
either of two routes: a bare `git rebase …` matches none of the PostToolUse `if:` entries (`git commit`,
`git push`, `git -C`, `git -c`, `git --exec-path=`, `git --namespace=`) so no hook process spawns at all;
a `git -C <path> rebase …` does spawn one, but `gitTargets` drops it because the parsed subcommand is
neither `commit` nor `push`. That path needs somewhere for events to land when no run directory resolves, which is exactly
the standalone case that produced this report, and the only storage-free option (a SessionStart stamp)
turned out not to exist: `session-start.js` returns `additionalContext` and writes nothing persistent.

`git reflog` records the same operations with timestamps, retroactively, with no storage and no hook.
Verified against this repo:

```
e4405303 HEAD@{2026-08-07 15:46:42 +0200}: merge origin/main: Fast-forward
7346175d refs/remotes/origin/main@{2026-08-07 17:33:10 +0200}: update by push
a6de5ec5 refs/remotes/origin/main@{2026-08-07 17:16:48 +0200}: fetch origin --quiet: fast-forward
```

`--since` filters correctly with full ISO 8601 datetimes. Pushes are visible and distinguishable in
the remote-tracking reflog. It also catches operations a matcher would miss entirely — a rebase inside
a compound command, or one run by a subagent.

Trade-off accepted: reflog records *what* happened, not *why*, and surfaces the user's own manual
operations alongside the agent's. Judged a feature — the report's job is to state what is true of the
repository, not only what the agent chose to remember doing.

## Architecture

### Constraint

`skills/wrap-up/SKILL.md` is 40,762 bytes against the project's 40 KB (40,960 byte) soft ceiling.
Step 9's pointer text must not grow. All new template content lands in `summary-template.md`
(currently 10,197 bytes).

### Piece 1 — `bin/wrap-up-state.js` + `bin/lib/wrap-up/`

```
node bin/wrap-up-state.js --since <base-sha|iso> [--json]
```

Flat sibling module directory per the project's `bin/lib/{name}/` convention (not a nested
`_shared/` wrapper, which is specific to `skills/_shared/`).

| Module | Responsibility |
|---|---|
| `state.js` | branch, commit count, ahead/behind upstream, pushed vs. unpushed, linked-worktree detection |
| `reflog.js` | parse `git reflog --date=iso --since=`, classify report-worthy vs. routine |
| `render.js` | emit the State block text |

Git-only. No `gh` dependency — the open-record count is deliberately excluded: it was noise in the
observed report, record-mode sections already carry record status, and excluding it keeps the helper
fast and free of an optional dependency.

### Piece 2 — `summary-template.md` restructured

One mode-parameterized shape. Existing sections are re-homed, not deleted:

| New part | Absorbs |
|---|---|
| **State** | *(new — rendered from the helper)* |
| **Actions Performed** | existing table; gains reflog as a source and a `History` action type |
| **Decisions** | Cleanup Actions, Configuration Updates, Manual Steps, the conditional batch table, `Q#`/`M#`/`U#` |
| **Evidence** | Reflection Insights, Skill Updates roll-up — below the decisions; full `SCANNED` lines stay in `decisions.md` |

Conversation mode is this shape minus the record-keyed sections.

### Piece 3 — one new action type

`CLAUDE.md`'s Actions Performed convention currently allows `Implemented / Bug fix / Simplified /
Operational / Journey / Ledger fix`. History operations get their own type: `Operational` already
means cleanup, and filing a rebase under it repeats the original failure. Adding an allowed type does
not force changes on the other seven Actions Performed consumers (`/test`, `/review`, `/build`,
`/stories`, `/specify`, `/flow`, `/init`) — only wrap-up emits history operations.

## Report shape

```
## Wrap-Up: {Record #{n} — {title} | {topic}}

### State
Branch    {name} — {n} commits, {pushed to {remote} | UNPUSHED}
Worktree  {path | main checkout}
Scope     since {sha} ({date})
Record    #{n} — {closes via merge | closed | open}      <- record mode only
Ledger    {n} items, {n} open | none

### Actions Performed
| Action | Detail | Ref |

### Decisions
**Needs your call ({n})**
| # | Destination | What |

**Will do ({n})** — {one line}

### Evidence
Reflection — {near-misses, tradeoffs; rows already surfaced above are not restated}
Scans — {one-line roll-up}. Full lines in decisions.md.
```

### Rule 1 — destinations are named, never coded

| Internal | Rendered |
|---|---|
| D1 | `CLAUDE.md Don'ts` or the specific `.claude/rules/` file |
| D2 | the actual path — `docs/x.md`, `skills/y/SKILL.md` |
| D3 | `Backlog record` |
| D4 | `Memory` |
| D5 | `Upstream issue` |

### Rule 2 — reflog is classified, not dumped

The observed repository's reflog is roughly 80% `merge origin/main: Fast-forward`. A raw dump would
rebury the rebase in exactly the noise this design removes.

| Report-worthy | Routine (dropped) |
|---|---|
| `rebase (finish)` — one row per rebase, not per replayed commit | `merge …: Fast-forward` |
| `reset: moving to …` — all of them | `checkout: moving from …` |
| `cherry-pick`, `revert` | `pull`, `fetch` |
| `merge …` **not** Fast-forward | `commit`, `commit (initial)` |
| `commit (amend)` | `clone` |
| `update by push` (remote-tracking ref) | `fetch …: fast-forward` |

`reset` reports unconditionally. The reflog message is `reset: moving to <target>` for both `--hard`
and `--soft`, so the destructive variant is indistinguishable and must not be the silent case.

A rebase emits one reflog entry per replayed commit; collapse on `rebase (finish)` so a 12-commit
rebase renders one row.

### Rule 3 — unknown is printed, not omitted

Detached HEAD, no upstream, unreadable reflog, or a non-repository cwd render the affected field as
`unknown`. A missing fact that looks like an absent fact is the mechanism behind the original
"it landed" error.

## Error handling

| Condition | Behavior |
|---|---|
| Not a git repository | State renders `unknown` for every git-derived field; helper exits 0 |
| Detached HEAD | `Branch: detached at {sha}` |
| No upstream configured | `UNPUSHED (no upstream)` |
| `--since` absent | Helper errors with a usage message; the template requires the argument |
| `--since` unparseable | Helper errors rather than silently defaulting — a silent default reproduces `[IL-47]` |
| Reflog empty in window | `Actions Performed` renders no `History` rows; not an error |

The helper never exits non-zero for a *degraded* read, only for a *malformed invocation*. Wrap-up must
be able to render a partial State block rather than lose the whole report.

## Testing

Suites live at `bin/lib/wrap-up/tests/*.test.js`. **`package.json`'s test script enumerates globs
explicitly and does not pick up new directories — the glob must be added in the same change (`[IL-84]`).**

Two traps govern the reflog tests:

- **`[IL-62]`** — deriving the expectation from the same `git reflog` call the implementation makes
  cannot distinguish "correct" from "matches current behavior".
- **`[IL-80]`** — a test reading this repository's live history is a scheduled failure, and is gone
  exactly when the code is riskiest.

Therefore reflog tests run against **frozen fixture output**, captured once and committed, never
against a live `git reflog` invocation.

Coverage:

| Case | Asserts |
|---|---|
| Classification | report-worthy vs. routine per the Rule 2 table |
| Rebase collapse | a 12-entry rebase fixture yields exactly one row |
| Reset | reported unconditionally, both `--hard` and `--soft` fixtures |
| `--since` boundary | full ISO 8601 accepted; no regression to `1970-01-01` (`[IL-47]`) |
| Degradation | detached HEAD / no upstream / non-repo render `unknown`, never omit |
| Pushed vs. unpushed | the fact that was wrong in the observed report |

Each classification test is verified by reverting the classifier and confirming the test fails —
reading correct is not the same as discriminating.

## Files touched

**New**

```
bin/wrap-up-state.js
bin/lib/wrap-up/state.js
bin/lib/wrap-up/reflog.js
bin/lib/wrap-up/render.js
bin/lib/wrap-up/tests/state.test.js
bin/lib/wrap-up/tests/reflog.test.js
bin/lib/wrap-up/tests/render.test.js
bin/lib/wrap-up/tests/fixtures/*.txt
```

**Modified**

| File | Change |
|---|---|
| `package.json` | add `bin/lib/wrap-up/tests/*.test.js` to the test glob (`[IL-84]`) |
| `skills/wrap-up/summary-template.md` | four-part restructure + conversation-mode variant |
| `skills/wrap-up/SKILL.md` | Step 9 pointer only; must not grow past ~200 bytes of headroom |
| `CLAUDE.md` | one new `History` action type in the Actions Performed convention |
| `docs/plugin-structure.md` | new bin module and its test invocation |

`docs/skill-graph.md` is unchanged — the helper is a bin module, not a skill, so no edges move.

## Out of scope

- The git-op PostToolUse hook and any widening of `gitTargets` — reflog replaced it.
- Any `.claude-tweaks/` storage location or `.gitignore` change.
- The other seven skills' Actions Performed tables and report shapes.
- The three unfinished pipeline runs under `.claude-tweaks/pipelines/` — unrelated pre-existing state.

## Risks

| Risk | Mitigation |
|---|---|
| `--since` base is model-supplied, so a wrong base yields a wrong window | The boundary is printed in the State block, making a wrong base visible rather than silent |
| Reflog surfaces the user's own manual operations | Accepted as a feature; the report states what is true of the repository |
| Reflog is expired or pruned (default 90 days) | Window is scoped to the current work; expiry is not reachable in practice, and an empty window renders no rows rather than erroring |
| Restructuring a template every record-mode run uses | Sections are re-homed rather than deleted; no existing content is dropped |
