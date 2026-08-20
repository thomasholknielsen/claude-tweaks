---
files:
  - plugin/skills/routine/fleet.md
  - plugin/skills/routine/SKILL.md
  - plugin/bin/lib/issues/fleet-counters.js
---

# Routine Fleet Status and Off

**Persona:** Repo maintainer operating the self-maintaining fleet (`fleet on` already ran) who wants to know what the fleet did to the codebase this week, and — separately — wants to shut it down temporarily without losing anything durable.
**Goal:** Run `/claude-tweaks:routine fleet status` to get one read-only screen answering "what did my codebase do to itself this week," then run `/claude-tweaks:routine fleet off` and get every fleet-marked routine paused — no destructive action, all durable state intact.

## Steps

### Fleet status

1. **Invoke status** — Type `/claude-tweaks:routine fleet status`.
   - **Action:** The skill computes every composition-table row's `PREFIXED_NAME` and intersects it with the project's instantiated routine records (`record-freshness.md`'s `records[]`) to resolve fleet membership, then runs `status.md` Steps 2-3.5 (parallel `RemoteTrigger get`) per fleet-marked record.
   - **Check:** The Routine table renders `Routine | Schedule | Last firing | Health`, Health drawn only from the five-verdict set (In sync / Drifted / Orphaned / Stale / Malformed). A hand-created routine sharing a skill under a name outside the composition table does not appear in the table at all — it is invisible by construction, not flagged as an error.

2. **Trust table** — The skill renders the per-class trust table.
   - **Action:** Runs `_shared/trust-table.md`'s Fetch and Render sections verbatim — the same shared path `/claude-tweaks:backlog overview` and `/claude-tweaks:help` already use.
   - **Check:** The rendered table is byte-identical in shape to the one `/claude-tweaks:backlog overview` Step 1.5 renders for the same project — never a third, independently-coded rendering of trust classes.

3. **Weekly counters — posture first** — Before deriving any counter, the skill determines the fleet's posture.
   - **Action:** Computes `fleetPosture` (`plugin/bin/lib/issues/fleet-counters.js`) from whether `{REPO_SLUG}-backlog-grant-weekdays.yml` is fleet-marked present, plus `autonomy` / `grant-origination-enabled` read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values autonomy grant-origination-enabled`.
   - **Check:** A supervised project (no grant unit provisioned, or the two unattended keys unset) renders no numeric grant counters and states literally: "supervised fleet — no grant unit provisioned (or unattended keys unset); grant counters not applicable." An unattended project with the grant unit provisioned instead shows a numeric `Grants issued` row split machine/human.

4. **Read the counters honestly** — The skill derives and renders the five weekly counters.
   - **Action:** Calls `deriveFleetCounters(input, Date.now())` over a rolling 7×24h window ending at render time, with the window boundaries printed in the header line `Week of {startIso} → {endIso}`.
   - **Check:** Every counter row (Firings, Findings filed, Grants issued, Merges, Revocations) renders its own Source and Blind spot text inline in the same row — e.g. the Firings row states "only the *last* firing is visible — a routine that fired 7× counts once." No counter ever renders as a bare total with no caveat.

### Fleet off

5. **Invoke off** — Type `/claude-tweaks:routine fleet off`.
   - **Action:** The skill enumerates fleet-marked routines using the exact same membership resolution as `fleet status` (composition-table `PREFIXED_NAME`s ∩ instantiated records) and captures the before-list.
   - **Check:** A project with zero fleet-marked routines gets the report "no fleet-marked routines in this project; nothing to pause" and stops there — reported as a normal outcome, not an error.

6. **Pause each fleet-marked routine** — The skill calls the routine skill's `pause` action per fleet-marked routine.
   - **Action:** One `RemoteTrigger update` call per routine, body `{"enabled": false}`, using each row's already-resolved `record.routine_id` — no other field is reassembled or changed. A routine whose record is stale (deleted out-of-band) is reported and skipped; the rest of the fleet still pauses.
   - **Check:** Every fleet-marked routine's live `enabled` field is now `false`. Makes zero delete calls — `RemoteTrigger` has no delete API to call in the first place.

7. **Verify scope** — Nothing outside the fleet moved.
   - **Action:** Lists routines before and after the pause loop.
   - **Check:** Running `/claude-tweaks:routine fleet status` immediately after `fleet off` shows every fleet-marked routine's schedule and record unchanged (only `enabled` flipped), and every non-fleet routine byte-identical in state — a hand-created routine sharing a skill under a name outside the composition table is untouched by construction.

8. **Round-trip note** — The report states how the fleet resumes.
   - **Action:** States that a paused fleet is resumed by re-running `fleet on` — Step 4's idempotent reconcile detects the existing records and resumes rather than duplicating — or, per-routine, via `resume <skill>` directly, using the same composition-table `PREFIXED_NAME` marker both verbs already consume.
   - **Check:** Reading the report, the operator understands that "temporarily shutting down" the fleet now means exactly one reversible action — `fleet off` / `fleet on` (or `resume`) — with no manual step at claude.ai/code/routines required, and no billed infrastructure destroyed or re-created either way.

## Outcome

`fleet status` gives the maintainer one screen — routine health, trust classes, and five honestly-captioned weekly counters — without a single `gh` command typed by hand. `fleet off` gives the same maintainer a genuine, reversible shutdown: every fleet-marked routine's live `enabled` flag flips to `false`, nothing is deleted, nothing outside the fleet is touched, and `fleet on` (or `resume <skill>`) brings it straight back.
