# Staged Release proposal — 4 stale issue claims

**Source:** /claude-tweaks:tidy, 2026-08-12, Step 4.7

| Issue | Blob | claimedAt | TTL | State |
|---|---|---|---|---|
| #179 | claims/issue-179.json | 2026-08-09T15:22:50 | 72h (expired) | OPEN, bot:in-progress still set |
| #220 | claims/issue-220.json | 2026-08-09T15:22:50 | 72h (expired) | OPEN, bot:in-progress still set |
| #221 | claims/issue-221.json | 2026-08-09T15:22:50 | 72h (expired) | OPEN, bot:in-progress still set |
| #223 | claims/issue-223.json | 2026-08-09T15:22:50 | 72h (expired) | OPEN, bot:in-progress still set |

Same `claimedAt` across all 4 — likely one file-overlap group claimed together by a run that
never released (crashed or abandoned; no matching active pipeline run dir found for this
timestamp).

## Recommendation

**Release** all 4 (conditional blob overwrite with tombstone content, per
`_shared/issue-claims.md`'s "The lock" step 4) + remove `bot:in-progress` from all 4 issues.
Not auto-applied — breaking a lock is never autonomous in `/tidy`.
