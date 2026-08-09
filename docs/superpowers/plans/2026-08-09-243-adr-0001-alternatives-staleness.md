# Plan — #243: ADR 0001 Alternatives-considered staleness fix

Spec: `.claude-tweaks/pipelines/2026-08-09T092310-spec-242-243-115-180/spec-243/work/243-spec.md`

## Task 1: Replace the dead specs/INBOX.md pointer

**Files:** `docs/decisions/0001-deepen-standalone-and-flow-survey.md` (line 20)

Replace the exact line:

```
- **A `/review deepen` mode** — rejected *for now*, but the weakest point of this decision and explicitly revisitable. `/review` is a gate, not a refactoring tool, so the two-stage apply loop sits awkwardly there. If the skill count starts feeling heavy, collapsing `/deepen` into a `/review` mode is the fallback (tracked in `specs/INBOX.md`).
```

with:

```
- **A `/review deepen` mode** — rejected *for now*, but the weakest point of this decision and explicitly revisitable. `/review` is a gate, not a refactoring tool, so the two-stage apply loop sits awkwardly there. If the skill count starts feeling heavy, collapsing `/deepen` into a `/review` mode is the fallback — file it as a backlog work record via `/claude-tweaks:capture` if revisited (this project's backlog now lives in GitHub issues, not a `specs/INBOX.md` file).
```

Verification: `grep -c "INBOX" docs/decisions/0001-deepen-standalone-and-flow-survey.md` returns 0; the replacement line mentions `/claude-tweaks:capture`.
