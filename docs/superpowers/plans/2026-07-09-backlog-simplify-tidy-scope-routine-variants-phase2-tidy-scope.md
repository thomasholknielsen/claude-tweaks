# /tidy --scope Implementation Plan — Phase 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:tidy` an optional `--scope=<name>[,<name>...]` argument that narrows a run to a subset of its 11 scan steps, while an unscoped run keeps behaving exactly as it does today.

**Architecture:** One task, one file (`skills/tidy/SKILL.md`) — this is dispatcher-level step selection, not a change to any individual step's scanning logic, so `skills/tidy/scan-procedures.md` (which documents each step's own classification rules) needs no edit at all: a step either gets dispatched in full or doesn't run, there's no partial-step behavior to describe there.

**Tech Stack:** Markdown (skill prose) only. No JS, no new dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-09-backlog-simplify-tidy-scope-routine-variants-design.md`, Section B.
- Scope taxonomy is fixed at 9 names (`inbox`, `specs`, `docs`, `plans`, `git`, `registry`, `claims`, `github`, `patterns`) covering all 11 step-labels (1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, 4.8, 5, 5.5) with no gaps — do not add, rename, or split any of these in this phase (per the design's rejected-alternative note on per-issue-type sub-scopes).
- `github` scope stays coarse — all of Step 4.8 (PRs + code-health + harness-health + backlog issues) as one unit. Do not split it.
- No flag = full sweep, byte-for-byte the same behavior as before this phase. This is the single most important regression to avoid — verify it explicitly (Task 1 Step 6).
- `patterns` always implies `specs` (Step 5.5 depends on Step 2's results) — this is the only inter-scope dependency; every other scope is independent.
- Scoped and unscoped runs share the identical Step 6/7/7.5 pipeline — only the input findings differ.

---

### Task 1: Add `--scope` parsing, dispatch filtering, and commit-message scoping to `/tidy`

**Files:**
- Modify: `skills/tidy/SKILL.md` (six edits across the file — Input section, new Scope Selection section, When to Use, Parallel execution note, Step 7.5 commit-message note, Anti-Patterns table)

**Interfaces:**
- Consumes: nothing from other tasks (this phase's only task; Phase 1 and Phase 3 touch disjoint files).
- Produces (for Phase 3): the `--scope=github` value that Phase 3's new `skills/tidy/routine-template-github-triage.yml` template's `prompt` field (`"/claude-tweaks:tidy --scope=github"`) depends on being a real, working argument. Phase 3 has no code dependency on this task — it's a soft dependency (a template string referencing a flag that must actually work), not a shared interface.

- [ ] **Step 1: Confirm current exact text before editing**

Read `skills/tidy/SKILL.md`. Confirm the `## Input` section (currently lines 27-29) reads exactly:

```markdown
## Input

`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.
```

If the text differs (another session edited this file concurrently), stop and re-read the current file in full before proceeding — do not blindly apply the edits below against stale line numbers or content.

- [ ] **Step 2: Replace the `## Input` section**

Use the Edit tool on `skills/tidy/SKILL.md` with this exact `old_string`:

```
## Input

`$ARGUMENTS` is not used by /tidy. The skill scans `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations; an aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments.
```

and this exact `new_string`:

```
## Input

`$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]]`. With no `--scope` argument, /tidy scans everything — `specs/INBOX.md`, `specs/DEFERRED.md` (or `backlog`-labeled GitHub issues, per `backlog-backend` — see `scan-procedures.md` Steps 1/1.5 and 4.8), `specs/`, design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope`.
```

- [ ] **Step 3: Insert the new "Scope Selection" section**

Use the Edit tool on `skills/tidy/SKILL.md` with this exact `old_string` (the line immediately following the just-edited Input section, currently line 31):

```
## Steps 1-4.8: Scan Everything
```

and this exact `new_string`:

```
## Scope Selection

By default (no `--scope` argument) /tidy runs every scan step below — the full sweep, unchanged from before this feature existed. `--scope=<name>[,<name>...]` (comma-separated, no spaces) narrows a run to just the named step groups:

| Scope | Steps covered |
|---|---|
| `inbox` | 1, 1.5 |
| `specs` | 2, 5 |
| `docs` | 3 |
| `plans` | 4 |
| `git` | 4.5 |
| `registry` | 4.6 |
| `claims` | 4.7 |
| `github` | 4.8 |
| `patterns` | 5.5 |

Rules:

- **Unknown scope name** — stop before dispatching anything and report the invalid name(s) alongside this table. Do not partially run a request that mixes one valid and one invalid name.
- **`patterns` implies `specs`.** Step 5.5 reads Step 2's results (see the Steps 1-4.8 table's dependency note below), so `--scope=patterns` silently also runs `specs` even though it wasn't named — this matches the full sweep's existing sequential ordering, where Steps 5 and 5.5 already run after Step 2 for the same reason. No other scope pulls in another.
- **Scoped runs use the identical Step 6 report/approval, Step 7 execution, and Step 7.5 verification** as a full sweep — only the set of findings feeding them is narrower. The Step 7 commit message names the scope explicitly (see Step 7.5 below); an unscoped full run's commit message is unchanged.

## Steps 1-4.8: Scan Everything
```

- [ ] **Step 4: Update the "When to Use" section**

Read the current `## When to Use` section (currently lines 19-25) to confirm it reads:

```markdown
## When to Use

- INBOX is getting long (10+ items)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues
```

Use the Edit tool with this exact `old_string`:

```
## When to Use

- INBOX is getting long (10+ items)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues
```

and this exact `new_string`:

```
## When to Use

- INBOX is getting long (10+ items)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues
- Just want a narrower check (e.g. `/claude-tweaks:tidy --scope=github` for GitHub issue triage only, skipping specs/docs/plans/worktrees/registry) — see "Scope Selection" below
```

- [ ] **Step 5: Update the Parallel execution dispatch note**

Use the Edit tool on `skills/tidy/SKILL.md` with this exact `old_string`:

```
> **Parallel execution:** Dispatch Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After parallel scans complete, run Step 5 and Step 5.5 sequentially — they depend on Step 2's spec scan results. Assemble all findings into the Step 6 report.
```

and this exact `new_string`:

```
> **Parallel execution:** Dispatch every step selected by the active scope (all of Steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, and 4.8 for an unscoped/full run; a `--scope`-filtered subset otherwise, per "Scope Selection" above) as parallel Task agents — each scan is independent (INBOX, Deferred, Specs, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After the selected parallel scans complete, run Step 5 and/or Step 5.5 sequentially when either is in scope — they depend on Step 2's spec scan results, which is why `patterns` alone still pulls in `specs` (per "Scope Selection" above). Assemble all findings into the Step 6 report.
```

- [ ] **Step 6: Verify Steps 1-5 all landed correctly, and that unscoped behavior is provably unchanged**

Run:

```bash
grep -n "^## Scope Selection" skills/tidy/SKILL.md
grep -n "\`\`\` is parsed as \`\[--scope=" skills/tidy/SKILL.md || grep -n "is parsed as \`\[--scope=" skills/tidy/SKILL.md
grep -n "Just want a narrower check" skills/tidy/SKILL.md
grep -n "Dispatch every step selected by the active scope" skills/tidy/SKILL.md
grep -c "^\`\$ARGUMENTS\` is not used by /tidy\." skills/tidy/SKILL.md
```

Expected: the first four greps each match exactly once; the last prints `0` (the old "not used" claim is fully gone, replaced by the new parsing description). Then re-read the full `## Scope Selection` table and confirm it has exactly 9 rows mapping to steps 1, 1.5, 2, 3, 4, 4.5, 4.6, 4.7, 4.8, 5, 5.5 with none missing and none duplicated — count them against this list by hand.

- [ ] **Step 7: Update the Step 7.5 commit-message note**

Read the current text around Step 7.5 to confirm it still reads:

```
If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up.
```

Use the Edit tool with this exact `old_string`:

```
If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up.
```

and this exact `new_string`:

```
If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up. For a scoped run (`--scope` was passed), prefix the message with the scope, e.g. `Tidy (scope: github): closed 2 stale issues, promoted #142` — see "Scope Selection" above. An unscoped full run's commit message is unchanged (no scope prefix).
```

- [ ] **Step 8: Add an Anti-Patterns row for the `patterns`/`specs` dependency**

Read the current Anti-Patterns table's last row to confirm it still reads:

```
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |
```

Use the Edit tool with this exact `old_string`:

```
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |
```

and this exact `new_string`:

```
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |
| Running `--scope=patterns` and assuming Step 2 didn't run | Step 5.5 depends on Step 2's spec-scan results — `patterns` silently pulls in `specs` too, even though it wasn't named. See "Scope Selection." |
```

- [ ] **Step 9: Verify Steps 7-8 landed correctly**

Run:

```bash
grep -n "prefix the message with the scope" skills/tidy/SKILL.md
grep -n "Running \`--scope=patterns\` and assuming Step 2 didn't run" skills/tidy/SKILL.md
```

Expected: both match exactly once.

- [ ] **Step 10: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (this task touches only markdown prose, so no test file exercises it directly — this run just confirms nothing else broke).

- [ ] **Step 11: Commit**

```bash
git add skills/tidy/SKILL.md
git commit -m "Add --scope argument to /claude-tweaks:tidy for partial-sweep runs"
```

---

## Self-Review Notes

- **Spec coverage:** Every rule in the design doc's Section B has a corresponding edit: the taxonomy table (Step 3), comma-separated combination (Step 3's "Rules" prose, "no spaces" is explicit since the design's examples are consistently comma-only with no whitespace), unknown-scope error behavior (Step 3's first rule), the `patterns`→`specs` auto-include (Step 3's second rule, Step 5's dispatch-note update, and the new Anti-Patterns row), identical downstream pipeline (Step 3's third rule), and the scoped commit-message convention (Step 7).
- **No placeholders:** every step has an exact old_string/new_string pair or an exact grep command with an exact expected count/result.
- **Type consistency:** the scope name set (`inbox`, `specs`, `docs`, `plans`, `git`, `registry`, `claims`, `github`, `patterns`) is identical everywhere it appears in this task — the new section's table, the design doc it was copied from, and Phase 3's planned `--scope=github` template string all agree on the literal name `github`.
- **Out of scope, confirmed absent from this plan:** `skills/tidy/scan-procedures.md` needed no edit (see Architecture above) — this was double-checked against the file's actual content before writing this plan, not assumed. Phase 1 (backend simplification) and Phase 3 (`/routine` variants) are separate plan files.
