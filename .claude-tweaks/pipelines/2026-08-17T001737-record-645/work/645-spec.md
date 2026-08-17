---
record: 645
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
---
# 645: record-queue-fetch: session-scoped record snapshot — one issue-list pull per session, shared by backlog/capture/specify/trust-table

**Related:** #574, #238

Origin: /claude-tweaks:feedback session evaluation (Automation efficiency lens), 2026-08-16 session

## Current State

One continuous session pulled the whole issue set four times with no shared cache: `/claude-tweaks:backlog overview` (`gh issue list --state open --limit 1000` → `/tmp/backlog-overview-open.json`, then the trust table&#39;s `--state all … --limit 1000` → `/tmp/trust-table-records.json`, 474 records), `/claude-tweaks:capture`&#39;s born-ready check (the byte-identical `--state all` command → `/tmp/capture-trust-records.json`, 4m33s later, one issue created in between), and `/claude-tweaks:specify` Step 1 (`--state all --json number,title,labels,body,state` → `/tmp/specify-all-issues.json`). Two of those were paired with a full `git log` dump to recompute the same `trustRows` table twice. `_shared/record-queue-fetch.md` is the shared fetch procedure but defines per-consumer temp files, not a shared snapshot; #238 (closed) cached per-run record *body reads* and label bootstrap, not the list fetch across skills.

## Deliverables

- [ ] `_shared/record-queue-fetch.md`: define a session-scoped record snapshot — one canonical path keyed on `$CLAUDE_CODE_SESSION_ID` (e.g. `/tmp/ct-records-{session-id}.json`) carrying the union field set the consumers need (`number,title,labels,body,state,stateReason,closedAt,comments,updatedAt,milestone`), a freshness rule (mtime younger than a `record-snapshot-ttl-seconds` policy key, default 300 s), and an invalidation rule (any `gh issue create`/`edit`/`close` by a plugin skill deletes the snapshot).
- [ ] Consumers read the snapshot when present and fresh, else fetch and write it: `backlog` (overview/refine/grant), `capture` (born-ready check), `specify` (Step 1 + Idempotency map), `_shared/trust-table.md`&#39;s Fetch section, `help` Stage 1, `tidy` Step 1, `visualize record-graph`. Each consumer&#39;s per-consumer temp path becomes a filtered view derived from the snapshot, not a second round-trip.
- [ ] `_shared/trust-table.md`: the `git log` dump follows the same rule (`/tmp/ct-gitlog-{session-id}.txt`, same TTL).
- [ ] Policy schema: `record-snapshot-ttl-seconds` added per `_shared/policy-schema.md`&#39;s conventions; `resolve-policy.js` serves it.
- [ ] Conformance test: every consumer file names the snapshot path or cites the shared section; no consumer restates a bare `gh issue list --limit` fetch outside `_shared/record-queue-fetch.md`.

## Acceptance Criteria

1. Running `/claude-tweaks:backlog overview` followed by `/claude-tweaks:capture ` within the TTL issues exactly one `gh issue list --state all` call in total (verified by transcript grep).
2. A `gh issue create` from `/capture` invalidates the snapshot: the next consumer re-fetches (verified by mtime/absence).
3. `npm test` passes; the conformance test fails when a consumer regains a bare `--limit 1000` fetch.
