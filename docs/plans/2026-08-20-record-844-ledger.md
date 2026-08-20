# Open Items — backlog refine batch-dispatch CLI (record #844)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `apply-refine-labels.js`: empty/value-less `--run` silently treated as omitted — no anchoring guard, no audit log, no diagnostic | open | — |
| 2 | review | `apply-refine-labels.js`: failed batch actions never logged to `decisions.md` — `refine-mode.md`'s documented `FAILED` template can't be emitted (not a valid `append.js` status) | open | — |
| 3 | review | `apply-refine-labels.js`: label edit + comment share one try/catch — a comment failure after a successful edit reports the whole action as failed with no record of the edit landing | open | — |
| 4 | wrap-up | Pattern observation: `append.js` `STATUSES` enum vs `refine-mode.md`'s documented `FAILED` template (staged: `staged/reflect-1.md`) | observation | — |
| 5 | wrap-up | Pattern observation (systemic): `events.jsonl` `contract-violation` entries carry no owner attribution, unlike `wd-*` events (staged: `staged/reflect-2.md`) | observation | — |
