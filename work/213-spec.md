# #213 — /routine has no pause action, and STATUS reports a paused routine as healthy

Surface: backend

## Current State

- `/claude-tweaks:routine` (`skills/routine/`) supports `create`, `update`, `status`, and `fleet on/status/off`.
- STATUS Step 3.5 (`status.md`) diffs `cron_expression`, `model`, `allowed_tools`, `sources[].git_repository.url`, and the prompt text — never `enabled`. A routine paused via the web UI reports as healthy.
- `fleet.md`'s Fleet off section was a no-op fallback citing this issue number as the reason.

## Deliverables

1. `pause <skill>` / `resume <skill>` actions on `/claude-tweaks:routine` — minimal `RemoteTrigger update` calls with a body touching only `enabled`, reusing CREATE/UPDATE's record-resolution steps.
2. STATUS Step 3.5 gains an `enabled` field-level check, folded into the existing **Drifted** verdict (no sixth verdict value).
3. `fleet off` calls the new `pause` action per fleet-marked routine instead of the no-op fallback; dangling `(#213)` citations removed.

## Acceptance Criteria

- `pause`/`resume` set `enabled` via a body touching only that field.
- Both documented in SKILL.md's Input table and `argument-hint`.
- `status <skill>` / `status --all` surface a web-UI pause as Drifted, not healthy.
- `fleet off` pauses every fleet-marked routine; `fleet.md` no longer cites `(#213)`.
- Existing CREATE/UPDATE/STATUS field checks unchanged (additive only).
- `tests/routine-*.test.js` pass, including new pause/resume and STATUS `enabled` coverage.

## Technical Approach

- PAUSE/RESUME reuse CREATE Step 1 / UPDATE Step 1's record resolution; no full body reassembly.
- STATUS's new check follows the same "field present on `get` response → diff it; absent → skip and note" pattern as the existing five comparisons.
- Fold a disabled routine into Drifted per `status.md`'s own five-verdict-set constraint.

## Gotchas

- Deletion still has no API — pause/resume never conflate with delete.
- The instantiated record schema has no `paused` field and none is added; STATUS reads `enabled` live off the `RemoteTrigger get` response.
- `fleet.md`'s Fleet off text named this issue as the reason it was a no-op; that citation is removed now that the verb has landed.

**Files:** `plugin/skills/routine/SKILL.md`, `plugin/skills/routine/create-and-update.md`, `plugin/skills/routine/status.md`, `plugin/skills/routine/fleet.md`, `plugin/skills/help/reference-card.md`, `tests/routine-pause-resume.test.js`, `tests/routine-status-enabled.test.js`, `tests/routine-fleet-status-off.test.js`, `docs/getting-started.md`, `docs/plugin-structure.md`, `docs/skill-graph.md`, `docs/journeys/routine-fleet-on.md`, `docs/journeys/routine-fleet-status-and-off.md`
