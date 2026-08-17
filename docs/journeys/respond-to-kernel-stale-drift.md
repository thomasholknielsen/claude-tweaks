---
files:
  - plugin/skills/routine/status.md
  - plugin/skills/routine/create-and-update.md
  - plugin/skills/_shared/routine-template-schema.md
---

# Respond to Kernel-Stale Drift

**Persona:** Repo maintainer whose project has instantiated routines from before the kernel-migration merge (record #529) — every existing routine record was written when templates still carried a frozen prompt of their own, with no `kernel_version` field at all.
**Goal:** Run `/claude-tweaks:routine status --all` right after the merge, recognize the resulting mass-drift as the intended lazy-migration signal rather than a regression, and clear it per skill with `/claude-tweaks:routine update <skill>`.

## Steps

1. **Invoke the fleet-wide status check** — Type `/claude-tweaks:routine status --all`.
   - **Action:** STATUS resolves every instantiated record under `.claude-tweaks/routines/`, reads the schema's current `kernel_version` once via `grep -m1 '^kernel_version:' "${CLAUDE_PLUGIN_ROOT}/skills/_shared/routine-template-schema.md"` (Step 1), then for each record that resolves a live template compares that single value against the record's own `kernel_version` via `kernelFreshness` (`bin/lib/routine-template-parser.js`, Step 3).
   - **Check:** Every routine record written before this migration carries no `kernel_version` field, and `kernelFreshness` returns `'kernel-stale'` whenever `recordKernelVersion` is `null`/`undefined` (`tests/routine-record-freshness.test.js`'s "missing kernel_version is kernel-stale" case). Every such record's Verdict column reads **Drifted** — on the very first `status --all` run after the merge, this is the entire pre-existing fleet, not a handful of rows.

2. **Read the kernel-stale detail** — Look at the Detail column of each Drifted row.
   - **Action:** Kernel-staleness renders inside the same **Drifted** verdict's Detail column as any template-field drift — never a sixth verdict; `status.md` Step 3 keeps the five-verdict set (In sync / Drifted / Orphaned / Stale / Malformed) closed.
   - **Check:** The Detail column carries the sentence from `status.md` Step 3: "kernel stale (recorded `kernel_version` N < current M — run `/claude-tweaks:routine update <skill>`)". A record with no `kernel_version` field at all reports kernel-stale by the same rule. If the same routine's `template_version` also lags, the template-field drift note appears in the same Detail cell alongside it, worded distinctly rather than merged into one message.

3. **Recognize this as expected, not a regression** — Before running anything, confirm the mass-drift is the intended signal.
   - **Action:** Per `skills/_shared/routine-template-schema.md`'s "Re-provisioning after a template change" section, a live routine holds a frozen prompt *copy* assembled at creation or last update; the kernel migration itself never reaches an already-running routine, so every pre-existing routine keeps firing its old, pre-migration prompt until it is explicitly updated.
   - **Check:** No routine failed or stopped firing because of the migration merging — the fleet keeps running exactly as it did before. The Drifted verdict is a reporting change (STATUS now checks `kernel_version` in addition to `template_version`), not a live-behavior change.

4. **Update one skill at a time** — For each skill named in a Drifted row, run `/claude-tweaks:routine update <skill>`.
   - **Action:** `create-and-update.md` UPDATE Step 2 compares both `template_version` and `kernel_version` against the record; since the record has no `kernel_version`, the "already in sync" short-circuit never fires and UPDATE proceeds to Step 4, which shows a diff between the recorded config and a freshly-assembled kernel + template body before anything is sent.
   - **Check:** The diff surfaces before any write. Confirming it calls `RemoteTrigger update` on the recorded `routine_id` — the routine keeps its ID, schedule, and console URL. Step 7 rewrites the instantiated record with a fresh `kernel_version` (read via the same grep) and the current `template_version`.

5. **Re-check status shows In sync** — Re-run `/claude-tweaks:routine status --all` after updating every Drifted skill.
   - **Action:** STATUS re-reads each updated record's `kernel_version`, now equal to the schema's current value, and re-runs the same `kernelFreshness` comparison.
   - **Check:** Every updated routine's Verdict column now reads **In sync**, with no kernel-stale or template-field text in its Detail column. A skill left un-updated still reports **Drifted** — the re-check reflects each routine's own record, not a fleet-wide assumption that everything was fixed at once.

## Outcome

The maintainer clears the fleet-wide Drifted signal one `/claude-tweaks:routine update <skill>` at a time, confirms each live routine's prompt is re-assembled from the current kernel rather than the frozen pre-migration text, and ends with `status --all` reporting **In sync** across the fleet — the lazy-migration path the kernel split was designed to produce, with no routine ever failing or losing its ID, schedule, or console URL along the way.
