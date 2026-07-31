# Guided Environment Creation

Referenced by `/claude-tweaks:routine`'s CREATE Step 4 (when no environment exists yet for the
current project) and by `/claude-tweaks:init`'s Update Mode Routine Environment Dedication check
(`skills/init/update-mode.md`). Not invoked directly by a human — always reached from one of those
two call sites, which supply the project-slug and the resolved repo URL this file needs.

No tool available to this plugin can create, list, or configure a cloud environment object
directly (`RemoteTrigger` is scoped to `/v1/code/triggers` only) — this is always a human-browser,
web-UI action. `agent-browser` (this plugin's default `/browse` backend) has no authenticated
claude.ai session, so every procedure below drives `/claude-tweaks:browse backend=chrome`
specifically — this repo's existing documented exception for human-invoked, non-Routine browser
automation. Both procedures below are interactive-only: if claude-in-chrome is unavailable (no
extension connected, or the user declines when `/browse` offers it), fall back immediately to
printing the exact values below for the user to enter manually, and return `{environment_id: null,
environment_name: null}` to the caller — never block the calling step's own flow waiting on a
browser that isn't there.

## Naming convention

An environment dedicated to a project's claude-tweaks routines is named:

```
claude-tweaks: <project-slug>
```

`<project-slug>` is the same `REPO_SLUG` value `/claude-tweaks:routine`'s CREATE Step 2 already
derives (lowercase repo name, runs of non-`[a-z0-9]` characters collapsed to a single `-`, leading/
trailing `-` trimmed) — reuse the caller's already-resolved value; never re-derive it here.

## Create procedure

Takes: `project_slug`, `repo_url` (already resolved by the caller).

1. Dispatch `/claude-tweaks:browse backend=chrome` with the instruction: navigate to
   `claude.ai/code`, open the Routines sidebar entry, then click the "+ New routine" button —
   confirmed live as the correct entry point (not a generic "New" sidebar affordance) — leading to
   a new-routine form that exposes the same Environment combobox the edit-routine dialog does.
2. In that form, select any repository first (the "Select a repository" control near the bottom of
   the form) — confirmed live that the Environment combobox does not open at all until a repository
   is selected. With a repository selected, locate the "Environment" combobox (a `find` query for
   "Environment selector combobox" locates it reliably — confirmed live against both the new-routine
   form and the edit-routine dialog's identical component) and click it.
3. **Timing note, confirmed empirically during design:** the dropdown's contents do not reliably
   appear in the very next screenshot or accessibility-tree read after the click — insert an
   explicit 1-2 second `wait` action between the click and whatever comes next, every time this
   combobox is opened. Reading or clicking immediately after the open-click, with no wait, was
   observed to silently miss the open state during design verification.
4. Click "+ Add environment" (the last item in the dropdown, below any existing environments).
5. In the resulting "New cloud environment" dialog: set Name to `claude-tweaks: <project_slug>`,
   leave Network access at its default (`Trusted`), leave Environment variables empty, and set
   Setup script to exactly:
   ```
   bash scripts/claude-cloud-setup.sh 2>/dev/null || true
   ```
   (repo-agnostic by construction — a safe no-op on any repo that hasn't run `/claude-tweaks:init`
   yet). Click "Create environment".
6. Continue the same browser flow to actually create a routine using this environment (any minimal
   routine is fine — the caller supplies the real one it wants via its own subsequent
   `/claude-tweaks:routine create` call; this step's only job is to get the environment's ID
   discoverable). Complete the routine creation.
7. Read the newly-created trigger's ID directly from the post-creation page URL
   (`claude.ai/code/routines/<trigger_id>`) — confirmed live that web-UI-created routines do not
   populate `session_context.sources[].git_repository.url`, so filtering `RemoteTrigger {action:
   "list"}` by `repo_url` does not work for this case. With the trigger ID in hand, call
   `RemoteTrigger {action: "get", trigger_id: <that id>}` and read `job_config.ccr.environment_id`
   off it — this is the new environment's ID. Report `{environment_id: <that id>, environment_name:
   "claude-tweaks: <project_slug>"}` back to the caller (the name is already known — it was just
   typed in step 5).

## Audit procedure

Takes: `trigger_id` (an existing routine's own ID, from a prior `RemoteTrigger list` call).

Used only to *read* a routine's currently-configured environment name — never writes anything.

1. Dispatch `/claude-tweaks:browse backend=chrome`: navigate to
   `claude.ai/code/routines/<trigger_id>`, click the routine's Edit (pencil) affordance (a `find`
   query for "Edit button" locates it reliably), then locate and click the "Environment" combobox
   exactly as in Create steps 2-3 above (same 1-2 second wait requirement applies; the repository is
   already selected for an existing routine, so Create step 2's repository-selection sub-step does
   not apply here).
2. Read the combobox's currently-selected value (its displayed text, e.g. `"Default"` or
   `"claude-tweaks: memenu-app"`) — do not open the dropdown itself for a read-only audit, the
   collapsed combobox already shows the current selection.
3. Close the dialog via Cancel (never Save) — an audit must never leave a routine's own name/
   instructions/schedule fields modified, even if nothing in this procedure intentionally touched
   them.
4. Report `{environment_name: <the read value>}` back to the caller.

## Re-point procedure

Takes: `trigger_id`, `target_environment_name`.

1. Dispatch `/claude-tweaks:browse backend=chrome`: navigate to
   `claude.ai/code/routines/<trigger_id>`, click Edit, open the Environment combobox (steps 2-3 of
   Create, same wait requirement).
2. Click the option matching `target_environment_name` in the now-open dropdown.
3. Click "Save" on the routine-edit dialog (not the environment sub-dialog — this step only
   changes which environment the routine references, it never edits the environment's own Setup
   script or other fields).
4. Report success/failure back to the caller. On failure (option not found, save rejected), leave
   the routine untouched and report the failure — never leave a routine in a partially-edited
   state.
