# Flow — Allowed Steps, Step Arguments, and Gate Behavior

This file is the canonical reference for which steps `/flow` allows in its pipeline, how step arguments resolve (resume vs explicit subset), and what each step's gate enforces. SKILL.md points here rather than duplicating these tables.

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies. Always uses `subagent` execution. Passes `worktree` through if specified. |
| `stories` | `/claude-tweaks:stories` | Autonomous — browses app, generates YAML stories. Auto-triggered when build produces UI file changes (unless `no-stories`). |
| `test` | `/claude-tweaks:test` | Mechanical pass/fail gate — types, lint, tests, QA story validation. Sets `TEST_PASSED=true` on pass. |
| `review` | `/claude-tweaks:review` | Code review, simplification, visual browser review with idea generation (when browser available) — produces a verdict. Gates on `TEST_PASSED`. |
| `polish` | `/claude-tweaks:design polish <spec>` | **(Phase 2)** Invokes Impeccable polish + clarify + harden (auto-fit) plus issue-driven commands when audit findings exist. Modifies code. Always followed by re-verify (`/test skip-qa`). Gates on review verdict PASS. Skipped on non-frontend specs (wrapper detection). |
| `wrap-up` | `/claude-tweaks:wrap-up` | Reflection, cleanup, knowledge routing — produces actionable summary |

**Not allowed in flow:** `capture`, `challenge`, `specify`, `init`, `tidy`, `help`, `browse` — these require interactive decision-making or are utility skills.

`re-verify` is **bundled** with `polish` — it is not a separately addressable step. When `polish` runs and modifies code, the re-verify gate runs automatically afterward (`/test skip-qa`, one-cycle cap). Including `re-verify` in a step list is a no-op; treat it as already implied by `polish`.

## Step Arguments

Steps must follow lifecycle order. Invalid orderings are rejected.

| Form | Meaning | Example |
|------|---------|---------|
| No steps | Full pipeline | `/flow 42` → build, test, review, polish, wrap-up |
| Single step | Resume from that step onward | `/flow 42 review` → review, polish, wrap-up |
| Multiple steps (comma-separated) | Run exactly those steps | `/flow 42 review,wrap-up` → review, wrap-up only (skips polish) |

**Resume mode** (single step argument, no comma) assumes all prior steps completed successfully. The pipeline reads existing context (ledger, `TEST_PASSED`, etc.) from files rather than generating it. If prior context is missing (e.g., no ledger file when resuming from review), the pipeline creates fresh context as needed and notes: "No existing ledger found — creating fresh."

**Explicit subset** (comma-separated steps) runs only the listed steps. Context from skipped prior steps is read from files if available.

**Valid examples:**
- `build,test,review,polish,wrap-up` — valid (default; stories auto-inserted if UI changed)
- `build,stories,test,review,polish,wrap-up` — valid (stories always runs regardless of UI changes)
- `build,test,review,wrap-up` — valid (skips polish — equivalent to `no-polish`)
- `build,test,review` — valid
- `build,test` — valid
- `test,review,polish,wrap-up` — valid (assumes build is already done)
- `review,polish,wrap-up` — valid (assumes build and test are done)
- `polish,wrap-up` — valid (assumes build, test, and review are done — useful when iterating on polish manually)
- `wrap-up` — valid (assumes build, test, review, and polish are done)
- `review,build` — **invalid** (out of order)
- `wrap-up,review` — **invalid** (out of order)

**Auto-insert `test`:** If `review` is in the step list but `test` is not, auto-insert `test` before `review` and note: "Auto-inserted `test` before `review` — review gates on test passing." This ensures backward compatibility.

**Polish bundled with re-verify:** If `polish` is in the step list, the re-verify gate runs automatically when polish modifies code. Users do not need to add a separate `re-verify` step. If a user includes the literal `re-verify` in the step list, treat it as a no-op (already bundled with polish) and note: "`re-verify` is bundled with `polish` — no separate step needed."

**`no-polish` argument behavior:** When `no-polish` is set, the polish phase (and its re-verify gate) is removed from the pipeline. The default pipeline becomes `build,test,review,wrap-up` (the pre-Phase-2 default). `no-polish` overrides any explicit `polish` in the step list — the user's explicit step request wins on the rest of the pipeline, but polish is unconditionally dropped.

## Gate Behavior

Each step has a gate that determines whether to proceed to the next step.

| Step | Gate condition | On pass | On failure |
|------|---------------|---------|-----------|
| `build` | Final verification passes (type check + lint + tests) | Check for UI changes → auto-trigger stories if applicable → proceed | **STOP** — present verification failures |
| `stories` (auto) | YAML files created + no parse errors | Proceed to test | **STOP** — present generation failures |
| `test` | All checks pass — types, lint, tests, QA (when stories exist). `PASS_WITH_CAVEATS` counts as passed (caveats are informational). Sets `TEST_PASSED=true`. | Proceed to review | **STOP** — present test/QA failures |
| `review` | Verdict is **PASS**. Gates on `TEST_PASSED=true`. Runs in full mode (code + visual) when browser available; falls back to code mode otherwise. | Proceed to polish (or wrap-up if `no-polish`) | **STOP** — present **BLOCKED** verdict with findings |
| `polish` (Phase 2) | Wrapper returns `{result: "ok"}`. Acceptable returns include `commands_invoked: []` (no auto-fit applicable, no audit findings — no work to do) and `{skipped: ...}` (non-frontend, no Impeccable, integration disabled). | See the polish-phase decision tree below. | **STOP** — wrapper returned an error (rare; usually means Impeccable plugin crashed mid-dispatch). Present the error. |
| `re-verify` (bundled with polish) | `/test skip-qa` passes (types + lint + tests). | Proceed to wrap-up | **STOP** — present "Polish broke verification" failure card. One-cycle cap — no automatic retry. |
| `wrap-up` | Always passes | Pipeline complete | — |

**Zero-test edge case:** If no test commands are configured in CLAUDE.md and no QA stories exist, the test gate passes vacuously — there is nothing to fail. Note in the pipeline output: "Test gate: no checks configured. Consider adding test commands to CLAUDE.md." This is a pass, not a skip.

### Polish-phase decision tree

This is the canonical rendering of the polish-phase branch logic. The gate-behavior row for `polish` (above) and the Step 4 polish-execution prose in SKILL.md both point here.

```
Polish phase entry (after review PASS, no-polish not set)
    │
    ▼
Invoke /claude-tweaks:design polish <spec>
    │
    ├─ {skipped: ...}                  → Note skip in summary, proceed to wrap-up (no re-verify)
    │
    ├─ {result: "ok", commands_invoked: []}
    │                                   → Note "polish: no work to do", proceed to wrap-up (no re-verify)
    │
    └─ {result: "ok", commands_invoked: [...], files_modified: [...]}
                                        → Run re-verify gate (`/test skip-qa`)
                                              │
                                              ├─ Pass  → Proceed to wrap-up
                                              └─ Fail  → STOP — "Polish broke verification" card
```

**Re-verify one-cycle cap:** The re-verify gate runs at most once per flow run. The pipeline tracks this with an in-memory marker (`re_verify_ran: true` in pipeline state — same in-memory marker pattern as `/claude-tweaks:design`'s availability skip de-dupe). If polish modifies code and re-verify fails, the pipeline stops; it does not retry polish. The user resolves the failure (typically by reverting the polish commit or fixing the underlying issue) and resumes with `/claude-tweaks:flow {spec} polish` to re-attempt polish + re-verify in a fresh flow run (which resets the marker).

**Why the cap exists:** Without it, polish could oscillate (polish modifies code → re-verify fails → user fixes → re-runs polish → polish modifies again → re-verify fails again). The single-cycle cap makes the failure mode predictable: one polish attempt, one re-verify attempt, success or stop.
