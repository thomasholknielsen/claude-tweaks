# Open Items — reconcile: red-tip detection on the integration branch (#561)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Security: unsanitized CI check-run names flow into SessionStart's `additionalContext` (prompt-injection-adjacent) — `bin/lib/reconcile/red-tip.js` `decideRedTip` → `bin/lib/hooks/session-start.js:145` | open | Staged: `staged/review-1.patch` in pipeline run dir 2026-08-16T091748-record-561 |
| 2 | review | Error-Handling: `fetchCheckRuns`/`redTipCheck` collapse every non-ENOENT `gh` failure reason to indistinguishable-from-green `null`, unlike sibling reconcile modules — `bin/lib/reconcile/red-tip.js` | open | Staged: `staged/review-2.patch` in pipeline run dir 2026-08-16T091748-record-561 |
| 3 | review | Docs: `docs/hooks.md` covers changed area (`bin/lib/hooks/**`, matched via `bin/lib/hooks/session-start.js`) but wasn't updated in this work's commits. review/hindsight eval 5 adds: this is the first place session-start.js reflects third-party/CI-controlled string content into agent-visible `additionalContext` — worth documenting as a convention when the doc is updated. | observation | Informational — surfaced for wrap-up, does not block |
