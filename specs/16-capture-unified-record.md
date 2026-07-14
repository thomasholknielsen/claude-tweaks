---
tier: 1
status: complete
progress: 100
blocked-by: [14]
surface: backend
---

# 16: /capture and /challenge on the unified record

## Overview

`/capture` becomes the manual filing mechanism for the unified record: title, ≤5-line body, an Issue Type (guessed from the idea text, user-confirmable), `by:capture` — nothing else. The `backlog` presence label and `backlog:category-*` family die (backlog is the absence of stage labels; Type covers the useful split). The routing prompt survives with the same choices (challenge / brainstorm / keep / absorb into `#M`). `/challenge` gains an explicit note that its debiasing output lands as comments on the record. Both drivers supported: `gh issue create` via `recordPayload`, or `local-store.js` writes for `local-files` repos, with the transient-failure fallback (`unsynced: true`).

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No `/tidy` changes (spec 21 owns Defer/parked lifecycle).
- No maturation/shaping features — capture files raw records; `/specify` (spec 17) shapes them.
- No category re-introduction under a new name.

## Current State

- `skills/capture/SKILL.md` — backend selection reads `backlog-backend`; builds payloads via `bin/lib/issues/backlog.js`'s `inboxIssuePayload`; bootstraps `backlog` + `backlog:category-*`; routing table (`challenge|brainstorm|inbox|merge:N`); Entry Format with `**Stage:** inbox`; `merge:N` closes the issue with a comment.
- `skills/challenge/SKILL.md` — debias pass; resolves backlog references from `specs/backlog/`.

## Deliverables

- [ ] Rewrite `/capture`'s filing steps on `recordPayload` (github driver) / `local-store.js` (local driver): labels = `by:capture` only; Type from a small guess table (bug-ish phrasing → Bug, else Feature/Task) confirmed in the existing capture prompt flow; no scoring, no stage labels.
- [ ] Backend selection reads `work-backend` with `backlog-backend` accepted as a legacy alias (read-only compat until migration).
- [ ] Routing table: `challenge` / `brainstorm` / `keep` (record stays in backlog state — explicitly "no label asserts this") / `absorb:N` (integrate into record `#N`'s body, comment `Absorbed into #N.`, close as not-planned). Route value `inbox` is retired; `keep` replaces it; `merge:N` accepted as a legacy alias for `absorb:N`.
- [ ] `/challenge`: state that when the input is a record reference, findings post as issue comments (github driver) or append to the record file (local driver); update its backlog-reference resolution to record queries.
- [ ] Update both skills' Anti-Patterns / Relationship tables and the ≤5-line cap prose to record vocabulary (bidirectional cross-references maintained).

## Acceptance Criteria

1. `grep -n "backlog:category\|inboxIssuePayload" skills/capture/SKILL.md` returns 0 matches.
2. `/capture`'s filing snippet applies exactly one label (`by:capture`) on the happy path, plus `type:*` only when the project's `work-types` key reads `labels`.
3. The words "inbox"/"INBOX" appear in `skills/capture/SKILL.md` and `skills/challenge/SKILL.md` 0 times as concept names (legacy file paths excepted).
4. The routing table documents `keep` and `absorb:N`, with `inbox`/`merge:N` listed only as accepted legacy aliases.
5. Failure fallback documented: `gh issue create` failure → `local-store.js` write with `unsynced: true` → `/tidy` Sync (cross-reference to spec 21's scan by name).
6. `_shared/work-record.md` cited by path in both SKILL.md files.

## Technical Approach

Smallest spec in the program — mostly deleting machinery. Keep capture's interaction flow (AskUserQuestion routing, --route args, 5-line cap) intact; only the storage/label layer changes. The Type guess is advisory: the routing AskUserQuestion gains no new question — Type confirmation rides in the existing "Added: '{title}'" presentation with an override via free text.

## Gotchas

- `/capture`'s Component-Skill Contract (parents: `/build`; `$PIPELINE_RUN_DIR` detection) is unrelated to this change — do not disturb it.
- `/tidy`'s scan (spec 21) must still recognize `unsynced` local records; keep frontmatter field name aligned with `local-store.js`.
- CLAUDE.md's `## Backlog integration` section is this repo's live config — do not edit it in this spec (migration later); the skill reads both flag names.

## Key Files

- `skills/capture/SKILL.md`
- `skills/challenge/SKILL.md`
