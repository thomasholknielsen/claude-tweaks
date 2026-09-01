# Dispatch — Accepted Design Positions

Referenced by `skills/dispatch/SKILL.md`'s "When to Use" section and its Concurrency note, and by `skills/backlog/dependency-mismatch-detection.md`'s #418/#419 worked example. Each entry answers the same shape of question — "why doesn't dispatch do X?" — where X looks like a gap but is a deliberate, accepted position. Neither is procedure: nothing here changes what a firing does, so a normal run never needs to load this file. Kept out of `SKILL.md` to stay under its size ceiling.

Step and section references below (`Step 4`, `Step 5`, "Reporting") resolve against this skill's `SKILL.md`, not against this file.

## Why no console-shepherding drain mode

The rejected idea was a mode that shepherded every authorized group to completion in one session, aggregating outcomes into a consolidated multi-group Review Console. A session babysitting N pipeline runs accumulates context until it rots, and a single-group firing has nothing to consolidate — so that console died with the idea.

#1492's `--budget` drain is not that: it repeats the single-group select-and-dispatch loop (the same one a Routine fired via `next` on a schedule) up to `--budget` times in one invocation, with per-group reporting and no consolidated console — throughput still comes from routine cadence × per-group firings, not from session breadth or aggregated reporting.

## Why the concurrent-Preflight read race is accepted

Two `/dispatch` firings running close together (e.g. two terminals, or a Routine firing overlapping a human-run session) each do their own single Preflight read of CLAUDE.md's `work-backend` key. That read is not synchronized against a concurrent CLAUDE.md edit by a third actor (a human hand-edit, or another firing's own out-of-band fix) — one firing's Preflight can see different content than another's, purely from wall-clock timing.

This is accepted, not engineered around, for the same reason `/claude-tweaks:backlog refine`'s own Concurrency section accepts its last-writer-wins label race: it's self-correcting (the next Preflight read picks up whatever state won) and never risks a double-build — Step 4's atomic claim write, not the Preflight read, is the actual correctness boundary, and it's completely unaffected by what any concurrent Preflight check decided. Worst case is a firing bailing on a Preflight check that would have passed a few seconds later (or vice versa), not a corrupted claim or a double-build.

## Why no chain-aware tie-break

Step 3's `next`-form ranking (this skill's `SKILL.md`) sorts by priority-band then `createdAt` only — no transitive-unblocks-count, no dependency-chain order. As of #1226, this is a deliberate, permanent decision, not a gap awaiting a follow-up: priority-then-age ordering is accepted as sufficient post-#1101 for `/dispatch`'s own pick order.

Pre-#1101, the old batch emitter's `buildChains` (`ranking.js`, deleted — no successor) linearized a dependency chain by dropping every member but its top-ranked one, a per-*record* mechanism. It was never viable to port into this ranking as-is: dispatch's atomicity invariant (Step 5) claims and dispatches a file-overlap/dependency group as a whole, never a subset — there is no "drop the rest of the chain" move available at this ranker's granularity. No evidence has emerged that priority-then-age ordering causes practical dispatch-ordering problems in practice.

`skills/backlog/dependency-mismatch-detection.md`'s #418/#419 worked example traces the residual same-priority, transitively-blocked tie this accepts — a tie like that can surface out of order wherever it's ranked; that's the accepted trade-off.
