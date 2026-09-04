# Open Items — #1710 (hoist release-claim.js's run-dir anchoring check before the destructive write)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Simplify pass (code-simplifier) flagged: `plugin/bin/release-claim.js` lines 114-142 and `plugin/bin/repair-claim.js` lines 101-123 are now near-verbatim duplicates (the `.`/`..` repo guard, `runDir`/`runId`/`reason` derivation, and the whole hoisted `resolveTarget` + two-branch stderr warning), differing only in the CLI name in each message. Collapsing into a shared `plugin/bin/lib/` helper was out of this record's single-file scope. | observation | Noted for a future dedicated dedup pass; not actioned here — outside #1710's scope (parity hoist for release-claim.js only). |
