# Open Items — tidy worktree scan: reclaim net-empty branches (#613)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | High-severity lens 3c (Error Handling) finding: `plugin/skills/tidy/step-6-auto.md:48`'s net-empty override text groups `dirty: unknown` with `dirty: true` as blocking the `-D` delete, but the general "Dirty-worktree override" it cites (`scan-procedures.md:146-150`, pre-existing #1424 text) explicitly states `dirty: unknown` does NOT block. Ambiguous precedence on a destructive git operation. | open | Staged — `staged/review-1.patch` |
| 2 | review | Medium-severity lens 3c finding: net-empty collect-line string mismatch between `scan-procedures.md` and `step-6-auto.md`. | fixed | Auto-applied — commit 8fb95ba25 |
| 3 | review | Low-severity lens 3c finding: net-empty check's merge-base/diff-error failure mode left unnamed. | fixed | Auto-applied — commit 8fb95ba25 |
| 4 | wrap-up | Reflect (light, Near-misses): implicit citation of a general rule while applying a stricter one, on a destructive git operation. | deferred | Staged — `staged/reflect-1.md` |
| 5 | wrap-up | Reflect (light, Fresh start): dirty-state precedence rule duplicated across two skill files with no structural cross-reference. | deferred | Staged — `staged/reflect-2.md` |
| 6 | wrap-up | Reflect (light, Friction): `hooks.js log-decision` silently no-ops instead of erroring on unrecognized subcommand. Self-reference check collapsed D5 (this project IS claude-tweaks) — re-classified as an in-project tangential backlog candidate. | deferred | Staged — `staged/reflect-3.md` (queue-write candidate) |
| 7 | wrap-up | Skills row (high): `tidy/SKILL.md`'s Anti-Patterns row + Step 7 housekeeping line still forbid autonomous `-D` / name only `-d`, contradicting #613's net-empty auto-delete. | open | Staged — `staged/wrap-up-skill-1.md` |
| 8 | wrap-up | Skills row (medium): `scan-procedures.md:142`'s "`-D` is never invoked autonomously in /tidy" claim contradicts line 143's net-empty row two rows below it. | open | Staged — `staged/wrap-up-skill-2.md` |
| 9 | wrap-up | Residue sweep: PR #1585 (this run's own draft PR, head `worktree-dispatch-record-613`) still open. | accepted | Intentional — pr-first run, no `auto:merge` grant on #613, `merge-authorization: ask`. PR correctly stays open as this run's terminal parked-pending-review state; owned by Phase 4's own Auto-merge short-circuit / merge-gate outcome, not by ledger routing. |
| 10 | wrap-up | Residue sweep: full test-suite probe not re-run (`--no-suite` — already run 3x earlier this wrap-up, all green modulo the documented pr-state.test.js flake). | observation | `--no-suite`: prior runs this session all green (6550/6551, documented flake) |
