# Inbox

## Revisit /deepen — standalone skill vs /review mode

**Added:** 2026-06-14 | **Category:** technical | **Related:** docs/decisions/0001-deepen-standalone-and-flow-survey.md

Context: `/deepen` shipped as a standalone component skill (ADR 0001). The weakest point of that decision was skill-count adjacency with `/simplify` — two "clean up recent code" skills at different altitudes. The contract mismatch (auto-apply vs stage-only) made merging into `/simplify` wrong, but a `/review deepen` mode was a viable alternative deferred only because review is a gate, not a refactoring tool.

Scope: If the skill count grows or users find the simplify/deepen boundary confusing, evaluate collapsing `/deepen` into a `/review deepen` mode. The depth-analysis discipline (deletion test, leverage ranking, stage-don't-apply, two-stage interaction) must survive the move. No action unless the adjacency actually causes friction — this is a watch item, not a planned change.

## Reframe Subagent Contract docs — correctness vs token-saving

**Added:** 2026-06-13 | **Category:** technical | **Related:** none

Context: Removing the v4.2 bash-output filter exposed that CLAUDE.md's "token-saving infrastructure" label also covered the Subagent Contract, making the removal scope ambiguous. The contract's real load-bearing value is correctness (status protocol, working-directory discipline, output templates), not unmeasured token savings.

Scope: Reframe `skills/_shared/subagent-output-contract.md` and its CLAUDE.md references so the contract reads as dispatch-correctness discipline, not a cost optimization — keep the mechanism, drop the "saves tokens" framing. Doc-only.

## Load-tolerant statusline perf assertion

**Added:** 2026-07-04 | **Category:** technical | **Related:** tests/statusline.test.js

Context: `tests/statusline.test.js` "end-to-end: render under 500ms" flakes under parallel-agent load — observed 2290ms during a subagent-driven run with concurrent `npm test` suites; passes at ~125-310ms in isolation. Every future multi-agent session running the suite concurrently hits this noise.

Scope: Make the perf assertion load-tolerant — options: CPU-time instead of wall-clock, load-detection multiplier, retry-once-in-isolation before failing, or skip under agent-parallel env. Needs a small design decision, not just a threshold bump.

## Tidy check for missed agent:go label removal

**Added:** 2026-07-04 | **Category:** technical | **Related:** skills/flow/routine-template.yml, skills/_shared/issue-claims.md

Context: the flow dispatch routine (`agent:go`/`agent:eligible` lifecycle, Phase 4 of the issue-claims program) removes `agent:go` after a `merged:`/`pr-opened:` release. If that removal step is ever skipped (a bug, a manual override, a crashed run past the removal point), the failure signature is observable: an issue carrying `agent:go`, no active claim ref, and an open PR already referencing it.

Scope: Add a `/tidy` scan step that flags exactly this signature — open issue + `agent:go` label + no claim ref + a linked open/merged PR — as a likely missed removal, recommending the same `gh issue edit --remove-label agent:go` command the dispatcher itself would run. Surfaced by the Phase 4 final whole-branch review as a defense-in-depth recommendation, not a required fix.

## Reconsider ledger resolve-gate Phase 2 grouping-by-blocker exception

**Added:** 2026-07-08 | **Category:** technical | **Related:** skills/ledger/resolve-gate.md

Context: A friction audit of ledger processing confirmed Phase 2's no-default-bulk-button design is intentional (every remaining item is a genuine judgment call) and fixed a same-day discoverability regression in the user-initiated bulk-override escape hatch. Left open: whether Phase 2 could ever safely offer a grouping option when several items share an *identical stated blocker* (not disposition) — e.g., 5 items all blocked by "requires design decision not yet made." The user didn't take a position either way.

Scope: Explore whether blocker-identity (as opposed to disposition-identity) is a safe enough signal to justify a narrow, non-default grouping affordance in Phase 2 without reintroducing the "obvious bulk button" bias the current guardrail explicitly forbids. No action until this gets deliberate brainstorming — the current design leans toward "no," but it's a judgment call worth a real pass, not a code-level fix.

## Consolidate code-health's duplicated directory-skip logic

**Added:** 2026-07-09 | **Category:** technical | **Related:** bin/lib/code-health/scope.js, bin/lib/code-health/lenses/{oversized-file,dead-export,todo-comments,dependency-freshness}.js

Context: The worktree-directory-convention fix (`docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md`) needed to add `.claude`/`.worktrees` exclusions in two independent places: the 4 lens files' `SKIP_DIRS` sets, and `scope.js`'s own, separately-maintained `SKIP_DIRS` — the actual v2 run spine (lenses are demoted to optional-tool status in v2, per `lenses/index.js`). A whole-branch review had to catch that the first fix only touched the lens layer; `scope.js` was missed entirely because the design's own follow-up grep for `.worktrees` mentions couldn't find a file whose bug was that it *never* mentioned `.worktrees` at all. Five independently-maintained "skip these directories" lists for one concept is the root cause.

Scope: Extract one shared skip-list module (e.g. `bin/lib/code-health/skip-dirs.js`) that `scope.js` and all 4 lenses import, so a future addition (a new infra directory, a new harness convention) only needs to land in one place. Needs a small design pass first — the lenses and `scope.js` currently have slightly different sets (`scope.js` also skips `.next`/`.turbo`; the lenses don't), so consolidation must confirm no lens-specific exclusion actually matters before merging them into one list.
