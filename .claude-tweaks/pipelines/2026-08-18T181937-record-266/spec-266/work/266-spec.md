---
record: 266
origin: human
risk: medium
size: high
ceremony: standard
grants: [build]
surface: infra
---
# 266: Skill snippets hardcode unscoped shared /tmp paths — class fix: session-scoped temp-root convention (specify, dispatch, backlog)

Surface: infra

## Current State

`/claude-tweaks:specify`'s decomposition procedure (and related skills) hardcode shared temp paths with no session or record scoping. Confirmed instances, by grep against the live `skills/**` tree (2026-08-17):

- `skills/specify/decomposition-mode.md` (Step 1) and `skills/specify/record-creation.md` (Steps 3-4) — `/tmp/specify-all-issues.json`, `/tmp/specify-existing-fingerprints.json`, `/tmp/specify-key-files.json`, `/tmp/specify-parent-body.md`, `/tmp/specify-parent-payload.json`, `/tmp/specify-sub-issue-body.md`, `/tmp/specify-sub-issue-payload.json`.
- `skills/dispatch/queue-pull-script.md`, `skills/dispatch/headless-self-report.md`, `skills/dispatch/settle-and-merge.md`, `skills/dispatch/SKILL.md` — `/tmp/dispatch-*.json` queue-pull and self-report paths.
- `skills/backlog/overview-mode.md`, `skills/backlog/refine-mode.md`, `skills/backlog/refine-lanes.md`, `skills/backlog/grant-mode.md` — `/tmp/backlog-overview-*`, `/tmp/backlog-refine-*`, `/tmp/backlog-grant-*`.
- `skills/assess-agent-autonomy/grant-check.md` — `/tmp/assess-grant-${N}.json`, record-suffixed but not session-scoped (narrows the race, does not eliminate it).

**Observed 2026-08-09:** a decomposition session composed its parent body to `/tmp/specify-parent-body.md`, created the parent (#263), and later re-read that file to append a decision — by then a concurrent `/specify` run had overwritten it with a different design's parent body. Only a failed string-anchor check prevented `gh issue edit` from replacing #263's body with the other session's content wholesale. The compose-then-create window has the same exposure: a clobber landing between compose and `gh issue create --body-file` silently files one design's record under another's title, with the wrong fingerprint.

**Confirmed under load:** under intentional concurrent dispatch (8 parallel firings, 2026-08-14), two sibling firings raced on the same literal `/tmp/dispatch-*.json` queue-pull filename and one read came back truncated mid-run (`Unexpected end of JSON input`), confirmed independently by 2 separate firings, each working around it by redirecting to session-unique scratch paths by hand.

A hand-scoped backlog session that rewrote its own paths to a scratch dir paid one error-and-recover cycle from a non-exported substitution variable (`Cannot find module 'undefined/backlog-overview-open.json'`) — evidence that no shared, tested convention exists yet to reach for instead of ad hoc rewriting.

**Existing partial seam:** `_shared/record-queue-fetch.md` already parameterizes its own paths (`{tmp-records-file}`, `{tmp-faceted-file}`), and its callers already resolve a session-scoped record snapshot at `/tmp/ct-records-{session-id}.json` — proof a session-id-keyed mechanism is reachable from skill-snippet execution today. What's missing is the general-purpose convention: a single canonical definition other skills' non-snapshot temp state (composed bodies, payload files, queue-pull results) can point at, instead of each restating a literal `/tmp/{skill}-{thing}.json` path.

## Deliverables

- [ ] Define a session-scoped temp-root convention once, in a new `skills/_shared/` file — a root derived from the session's scratchpad directory or an equivalent verified-real session-unique location (see Gotchas for the verification requirement) — with a per-file naming pattern every consuming skill fills in (e.g. `{root}/specify-parent-body.md`)
- [ ] Migrate **specify**: `skills/specify/decomposition-mode.md` Step 1 and `skills/specify/record-creation.md` Steps 3-4 (the 7 literal paths listed in Current State)
- [ ] Migrate **dispatch**: `skills/dispatch/queue-pull-script.md`, `skills/dispatch/headless-self-report.md`, `skills/dispatch/settle-and-merge.md`, `skills/dispatch/SKILL.md`
- [ ] Migrate **backlog**: `skills/backlog/overview-mode.md`, `skills/backlog/refine-mode.md`, `skills/backlog/refine-lanes.md`, `skills/backlog/grant-mode.md`
- [ ] Migrate **assess-agent-autonomy**: `skills/assess-agent-autonomy/grant-check.md`'s `/tmp/assess-grant-${N}.json` — combine the session root with the existing record-number suffix, don't drop either
- [ ] Sweep the rest of `skills/**` for the same literal-`/tmp/{skill}-*` pattern and migrate every hit that carries cross-write risk (two sessions of the same skill running concurrently could collide on the same filename)

## Acceptance Criteria

1. `grep -rn '/tmp/[a-z-]*-[a-z-]*\.\(json\|md\)' skills/` (excluding the new convention file's own documentation examples, and the session-snapshot path already scoped via `{session-id}`) returns zero matches for a literal, non-session-scoped path
2. A resumed decomposition in a fresh session still finds its own prior state where the procedure already documents a resume path (`record-creation.md`'s Idempotency section re-fetches rather than trusting a stale shared file) — migrating to a session-scoped root must not silently break that documented fallback
3. Two concurrent runs of the same skill derive disjoint temp paths by construction (a session-unique root segment), not by luck of non-overlapping filenames
4. The new `skills/_shared/` convention file is cited (not restated) by every migrated call site, matching the existing citation style `_shared/record-queue-fetch.md` already uses

## Technical Approach

The session-scoped record snapshot (`_shared/record-queue-fetch.md`) already proves a session-id-keyed path is reachable from skill-snippet execution (`/tmp/ct-records-{session-id}.json`) — reuse the same underlying session-identifying value for the new general-purpose root rather than deriving a second, possibly-inconsistent one. The new `_shared` file should document the root's derivation once, plus a simple per-file naming convention (skill name + purpose suffix), so each migrated snippet only supplies its own filename suffix rather than re-deriving the path logic.

### Key Files

- `skills/_shared/{new-file}` (new) — canonical session-scoped temp-root convention; exact filename is an implementation decision for the build step
- `skills/specify/decomposition-mode.md` — Step 1's landscape fetch (`/tmp/specify-all-issues.json`) and key-files write (`/tmp/specify-key-files.json`)
- `skills/specify/record-creation.md` — Steps 3-4's parent/sub-issue payload and body files
- `skills/dispatch/queue-pull-script.md`, `skills/dispatch/headless-self-report.md`, `skills/dispatch/settle-and-merge.md`, `skills/dispatch/SKILL.md`
- `skills/backlog/overview-mode.md`, `skills/backlog/refine-mode.md`, `skills/backlog/refine-lanes.md`, `skills/backlog/grant-mode.md`
- `skills/assess-agent-autonomy/grant-check.md`
- `skills/_shared/record-queue-fetch.md` — cite (don't restate) as the existing parameterization precedent

## Gotchas

- Verify the actual session-scoped mechanism empirically before encoding it in prose — do not assume a `CLAUDE_CODE_SESSION_ID` env var exists in the snippet execution environment; the harness scratchpad directory is the known-real candidate. Probe it in a live session first, then encode what was actually observed, not what seemed plausible.
- The compose-then-create window (compose a body to a temp file, then a later `gh issue create --body-file`) has the same exposure as the observed re-read clobber even under a session-scoped root, if two skills within the *same* session reuse the same filename for different purposes — the convention needs a per-purpose suffix, not just a per-session root.
- `assess-agent-autonomy`'s `/tmp/assess-grant-${N}.json` is already record-suffixed, which narrows but does not eliminate the same class (two different sessions building the same record concurrently still collide) — migrating it needs both the session root and the existing record-number suffix, neither replacing the other.
- This is a docs/prose-only change (skill markdown snippets, not application runtime code) — but the harness executes these snippets directly, so a wrong convention breaks real concurrent-session behavior, not just documentation accuracy.

## Original request

Skill snippets hardcode unscoped shared /tmp paths — class fix: session-scoped temp-root convention (specify, dispatch, backlog)

## Current State

`/claude-tweaks:specify`'s decomposition procedure hardcodes shared temp paths with no session or record scoping: `/tmp/specify-all-issues.json`, `/tmp/specify-existing-fingerprints.json`, `/tmp/specify-key-files.json`, `/tmp/specify-parent-body.md`, `/tmp/specify-parent-payload.json`, `/tmp/specify-leaf-body.md`, `/tmp/specify-leaf-payload.json` (see `skills/specify/decomposition-mode.md` Step 1 and `skills/specify/record-creation.md` Steps 3-4). Two concurrent /specify sessions race on every one of them.

**Observed 2026-08-09:** a decomposition session composed its parent body to `/tmp/specify-parent-body.md`, created the parent (#263), and later re-read that file to append a decision — by then a concurrent /specify run had overwritten it with a different design's parent body. Only a failed string-anchor check prevented `gh issue edit` from replacing #263's body with the other session's content wholesale. The compose-then-create window has the same exposure: a clobber landing between compose and `gh issue create --body-file` silently files one design's record under another's title, with the wrong fingerprint.

By contrast, `assess-agent-autonomy` already suffixes its temp files with the record number (`/tmp/assess-grant-${N}.json`), which narrows (though does not eliminate) the same class.

**Class scope (2026-08-17 review — this record is now the class fix):** three confirmed instances of the same class, previously tracked as separate records:

- **specify** (this record) — the observed near-corruption above.
- **dispatch Step 2** (#448, consolidated here) — hardcoded `/tmp/dispatch-*.json` queue-pull paths; under intentional concurrent dispatch (8 parallel firings, 2026-08-14) two sibling firings raced on the same literal filename and one read came back truncated mid-run (`Unexpected end of JSON input`), confirmed independently by 2 separate firings, each working around it by redirecting to session-unique scratch paths. Related there: #392, #394.
- **backlog overview/refine** (#740, consolidated here) — every fetch/compute snippet in `skills/backlog/overview-mode.md` (Steps 1-4) and `skills/backlog/refine-mode.md` (Steps 1-3) ships literal `/tmp/backlog-overview-*` / `/tmp/backlog-refine-*` paths; a session that hand-rewrote them to a scoped dir paid one observed error-and-recover cycle (a non-exported substitution variable → `Cannot find module 'undefined/backlog-overview-open.json'`).

**Existing seam:** `_shared/record-queue-fetch.md` already parameterizes its paths (`{tmp-records-file}`, `{tmp-faceted-file}`) — callers just fill the placeholders with literals. The convention below is the missing half: a canonical session-scoped value to fill them with.

## Deliverables

- [ ] Define a session-scoped temp-root convention **once** in `skills/_shared/` (a root derived from the session's scratchpad directory or an equivalent session-unique location), cited by every snippet-bearing skill instead of restated per skill
- [ ] Migrate **specify**: `skills/specify/decomposition-mode.md` Step 1 and `skills/specify/record-creation.md` Steps 3-4
- [ ] Migrate **dispatch**: Step 2 queue-pull paths (`/tmp/dispatch-*.json`) — from #448
- [ ] Migrate **backlog**: `overview-mode.md` Steps 1-4 and `refine-mode.md` Steps 1-3 (`/tmp/backlog-*`) — from #740
- [ ] Sweep remaining `skills/**` snippets for the same class and migrate those that carry cross-write risk (e.g. `assess-agent-autonomy`'s `/tmp/assess-grant-${N}.json` is record-suffixed but not session-scoped)

## Acceptance Criteria

1. No `skills/**` procedure writes record bodies or payload state to an unscoped fixed `/tmp` path
2. A resumed decomposition in a fresh session still finds its own prior state (the resume path in `record-creation.md`'s Idempotency section re-fetches rather than trusting a stale shared file)
3. Two concurrent runs of the same skill derive disjoint temp paths by construction (session-unique root), not by luck

**Constraint:** verify the actual session-scoped mechanism empirically before encoding it in prose — do not assume a `CLAUDE_CODE_SESSION_ID` env var exists in the snippet execution environment; the harness scratchpad directory is the known-real candidate. Probe it in a live session first (empirical premise-check before contract text).

**Related:** #392, #394 (from #448)
