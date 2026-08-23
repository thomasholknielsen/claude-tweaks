# Open Items — Reconcile decisions.md STAGED lines against staged/'s actual file inventory on resume (#1269)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `checkStagedInventory` (`plugin/bin/lib/hooks/staged-inventory.js:46-47`) uses `fs.existsSync`-then-`fs.readFileSync` on `decisions.md` — a TOCTOU race: if the file is removed/moved between the two calls (e.g. a concurrent `archive-run` on this same run dir), `readFileSync` throws uncaught; `hooks.js`'s only top-level guard (`main(...).catch(() => process.exit(0))`) swallows it silently, exiting 0 without ever writing the documented stdout line — silently defeating the very MISMATCH detection this check exists to guarantee, at exactly the crash/race class it targets | open | — |
