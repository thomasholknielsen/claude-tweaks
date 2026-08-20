---
files:
  - plugin/skills/routine/fleet.md
  - plugin/skills/routine/SKILL.md
  - plugin/bin/lib/issues/fleet-counters.js
---

# Routine Fleet Status and Off

**Persona:** Repo maintainer operating the self-maintaining fleet (`fleet on` already ran) who wants to know what the fleet did to the codebase this week, and — separately — wants to shut it down temporarily without losing anything durable.
**Goal:** Run `/claude-tweaks:routine fleet status` to get one read-only screen answering "what did my codebase do to itself this week," then run `/claude-tweaks:routine fleet off` to actually pause every fleet-marked routine — reversible, and with zero durable state lost.

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

6. **Pause each fleet-marked routine** — The skill pauses every routine in the before-list.
   - **Action:** For each fleet-marked routine, calls the `pause` action's single-field `RemoteTrigger update {"enabled": false}` (`create-and-update.md`'s PAUSE section) — reusing its per-row record resolution rather than the batch collision-list `fleet on`'s provisioning loop builds. If a row's call fails because its `routine_id` no longer resolves (deleted out-of-band at claude.ai/code/routines), that row is reported stale — same recourse as STATUS/UPDATE — and the rest of the fleet still gets paused; one stale row never aborts the run.
   - **Check:** `RemoteTrigger` is never asked to delete anything — it has no delete API to call in the first place. Records, rotation cursors, wontfix suppressions, and trust history all survive on disk untouched.

7. **Verify scope** — The skill lists routines before and after.
   - **Action:** Compares the before-list (Step 5) against a fresh enumeration after pausing.
   - **Check:** Every fleet-marked routine shows `enabled: false` in the after-list; every non-fleet routine (a hand-created routine sharing a skill under a name outside the composition table) is byte-identical in state — untouched by construction.

8. **Round-trip note** — The report states how to resume.
   - **Action:** States that resuming happens **per routine**, via `/claude-tweaks:routine resume <skill>` — and explicitly that re-running `fleet on` alone does **not** resume a paused fleet, since its RECONCILE path only reassembles schedule/prompt/model/tools and never touches `enabled`.
   - **Check:** Running `/claude-tweaks:routine status <skill>` on a paused routine reports **Drifted** with the detail "routine is paused (`enabled: false`) in the live console" — the same check that also catches a routine paused by hand via the claude.ai/code web UI's Repeats toggle, not only one paused through this skill.

## Outcome

`fleet status` gives the maintainer one screen — routine health, trust classes, and five honestly-captioned weekly counters — without a single `gh` command typed by hand. `fleet off` actually pauses the fleet: every fleet-marked routine stops firing, every non-fleet routine is untouched, nothing is ever deleted, and the operator leaves knowing pausing is reversible per routine via `resume <skill>` (not by re-running `fleet on`).
