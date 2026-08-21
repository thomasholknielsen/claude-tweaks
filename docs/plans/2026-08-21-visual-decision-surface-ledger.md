# Open Items — visual-decision-surface (#1202, #1203, #1204)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Identity-scope live mode set iframe `src` to the raw skin CSS path instead of an assembled page — live comparison was entirely broken for the primary identity-scope use case | fixed | `seed-compare.mjs` now assembles a per-variant page (shared markup + skin) and writes it next to `--out` — `79b53567` |
| 2 | review | The server's own state dir, nested inside the served dir, made every `/events` POST trigger its own SSE reload, wiping the "recorded" confirmation | fixed | `watchSignature` excludes the state dir; watch loop also skips entirely when no SSE client is connected — `79b53567` |
| 3 | review | `runDaemon`'s `--idle-minutes 0` was silently replaced by the 240min default (`Number(...) \|\| DEFAULT`, `0` is falsy) | fixed | Presence check instead of truthiness — `79b53567` |
| 4 | review | `cmdStop`'s `process.kill` had a TOCTOU race against its own `pidAlive` check — an ESRCH between the two crashed the command instead of reporting "already stopped" | fixed | Wrapped in try/catch — `79b53567` |
| 5 | review | `explore.md` only wired `visual-decide.js stop` into the on-pick and exit-without-pick branches — no note covering a generic mid-round error/abort path | fixed | Added the general teardown obligation to Compare — `79b53567` |
| 6 | review | `template.html`'s `postEvent()` had no `.catch()` — a failed `/events` POST was a silent unhandled rejection, leaving the user believing their verdict was recorded | fixed | Inline error banner, clears on retry — `79b53567` |
| 7 | review | `resetIdle()` ran before the auth check — unauthenticated traffic could defeat the idle-timeout backstop | fixed | Moved after the auth check succeeds — `79b53567` |
| 8 | review | `watchSignature`'s synchronous recursive walk ran every 500ms regardless of whether any SSE client was connected | fixed | Skipped entirely when `sseClients.size === 0` — `79b53567` |
| 9 | review | `findFreePortFrom` had no upper bound — an exhausted port range would spin forever with no error | fixed | Bounded at 1000 attempts, throws a clear error past that — `79b53567` |
