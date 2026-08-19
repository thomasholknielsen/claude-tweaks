# Dispatch — Accepted Design Positions

Referenced by `skills/dispatch/SKILL.md`'s "When to Use" section and its Concurrency note. Each entry answers the same shape of question — "why doesn't dispatch do X?" — where X looks like a gap but is a deliberate, accepted position. Neither is procedure: nothing here changes what a firing does, so a normal run never needs to load this file. Kept out of `SKILL.md` to stay under its size ceiling.

Step and section references below (`Step 4`, `Step 5`, "Reporting") resolve against this skill's `SKILL.md`, not against this file.

## Why no `drain` mode

There is no mode that shepherds every authorized group to completion in one session. A session babysitting N pipeline runs accumulates context until it rots; throughput comes from routine cadence × single-group firings (a Routine firing `next` on a schedule), not session breadth.

The old design's consolidated multi-group Review Console existed to aggregate a drain session's N outcomes into one table; a single-group firing has nothing to consolidate, so it dies with drain — see Reporting.

## Why the concurrent-Preflight read race is accepted

Two `/dispatch` firings running close together (e.g. two terminals, or a Routine firing overlapping a human-run session) each do their own single Preflight read of CLAUDE.md's `work-backend` key. That read is not synchronized against a concurrent CLAUDE.md edit by a third actor (a human hand-edit, or another firing's own out-of-band fix) — one firing's Preflight can see different content than another's, purely from wall-clock timing.

This is accepted, not engineered around, for the same reason `/claude-tweaks:backlog refine`'s own Concurrency section accepts its last-writer-wins label race: it's self-correcting (the next Preflight read picks up whatever state won) and never risks a double-build — Step 4's atomic claim write, not the Preflight read, is the actual correctness boundary, and it's completely unaffected by what any concurrent Preflight check decided. Worst case is a firing bailing on a Preflight check that would have passed a few seconds later (or vice versa), not a corrupted claim or a double-build.
