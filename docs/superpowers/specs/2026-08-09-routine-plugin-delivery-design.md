# Routine Plugin Delivery — Design

**Date:** 2026-08-09
**Work record:** #256 (related: #209 probe evidence, #137, IL-113)
**Status:** Approved (interactive brainstorm, this date)

## Problem

Scheduled Routine sandboxes come up with no plugins installed even when the cloud
environment's Setup script field is configured, so every `claude-tweaks-*` routine firing
either no-ops or must improvise. The Setup script field being populated was assumed
sufficient (`[IL-113]`'s fix); that assumption was measured false for Routines.

## Evidence (all measured live, 2026-08-09)

- Environment `claude-tweaks: claude-tweaks` (`env_0183WGpFui8D1nfQXPqfRQKB`) had
  `bash scripts/claude-cloud-setup.sh 2>/dev/null || true` in its Setup script field
  (written at guided environment creation, 2026-08-08). Confirmed by direct read of the
  Update-cloud-environment dialog.
- A re-fired harness-health container (session `cse_01LH42bzavfTCTtJTp7kzNYP`, 07:57 UTC)
  still started with no `~/.claude/plugins/cache/`, no `claude-tweaks-marketplace`
  registration — the field's effects were entirely absent.
- The same session then ran `scripts/claude-cloud-setup.sh` in-session: both plugins
  installed cleanly (claude-tweaks 6.73.0, superpowers 6.2.0). The script is not the
  problem; the field→script delivery is.
- The Skill tool's catalog is frozen at session start: after the successful mid-session
  install, `/claude-tweaks:harness-health` still returned "Unknown skill". The scheduled
  docs-health firing (session `session_011MV6RP3u4BdXBD5nFBURwM`, 06:01 UTC) hit the same
  wall and improvised: it read the installed skill's SKILL.md and executed it manually,
  filing a correct finding (#245). The scheduled harness-health firing (07:08) declined to
  improvise and no-oped.
- Trigger-level delivery is unavailable: `RemoteTrigger update` with
  `enabled_plugins`/`extra_marketplaces` is either 400-rejected (strings containing `/`)
  or 200-accepted-and-ignored (read-back stays `[]`). Full probe transcript: #209 comment.
- Undischarged ambiguity: whether the platform never executes the field for Routine
  sandboxes, or the invocation line dies pre-script (the field cwd is a workspace root per
  the script's own header, where the relative path `scripts/claude-cloud-setup.sh` cannot
  resolve). `2>/dev/null || true` made the two indistinguishable. The hardened field line
  below turns every future failure into evidence.

## Decision — Approach A: harden the delivery line and complete the self-heal

Rejected alternatives: preamble-only (loses the diagnosability that would let the field
failure be root-caused and, if platform-level, filed upstream); field-line-only (if the
platform never runs the field for Routines, changes nothing for them and leaves no log).

### 1. Canonical Setup-script field line

The string every procedure writes becomes:

```bash
{ bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
```

`*/scripts/...` covers the workspace-root cwd; the log captures stdout+stderr either way;
`|| true` still guarantees session start is never blocked. Three edit sites (the two
guided-procedure restatements are deliberate per that file's own note):

- `skills/init/bootstrap/step-14-cloud-routine-parity.md` — the paste instruction and the
  Offer-to-apply text.
- `skills/routine/guided-environment-creation.md` Create step 5 — the field content
  written when a `claude-tweaks: <slug>` environment is created.
- `skills/routine/guided-environment-creation.md` Ensure-setup-script step 4 — the string
  it types into an empty field, **plus one new clause**: when the field contains the old
  un-logging form (`claude-cloud-setup.sh` invocation with `2>/dev/null`), upgrade it to
  the canonical line instead of reporting success unchanged. The unrelated-content append
  rule is unchanged.

This project's live environment was already upgraded to this line operationally
(2026-08-09) — the plugin change makes it what every future environment gets.

### 2. Canonical preamble changes

Edited once in `_shared/routine-template-schema.md`'s standard preamble, fanned out
byte-identically to all six routine templates. Every template's `template_version` is
bumped — explicitly: code-health 6→7, dispatch 6→7, docs-health 6→7, harness-health 6→7,
journey-health 7→8, tidy 7→8 (versions verified against `skills/*/routine-template.yml`
at design time; re-verify against the tree at implementation, since concurrent sessions
ship) — because the schema test enforces byte-parity but not version increment (its own
documented anti-pattern).

**(a) Log-read clause.** When the four resolution rungs come up `unresolved`, read
`$HOME/claude-cloud-setup.log` before self-healing and include its tail in the report:

- Log absent while the environment's field is configured → the field never executed for
  this container (platform gap; report it as such).
- Log present → the script ran and failed; the reason is in the log.

**(b) Self-heal completion.** After a successful mid-session `scripts/claude-cloud-setup.sh`
run and a successful re-resolution of the plugin build, if the Skill tool still cannot
invoke the kickoff skill (frozen catalog), read the installed skill's `SKILL.md` from the
resolved cache path and execute its instructions directly — the docs-health improvisation,
made the documented standard. One self-applying carve-out sentence stays inside the shared
preamble so all six templates remain byte-identical:

> If the kickoff below is `/claude-tweaks:dispatch`, do not execute it manually — report
> the degraded sandbox and stop. (Dispatch has write access and consumes the authorized
> build queue; a missed daily consume is cheaper than a full pipeline run in a container
> whose setup already failed once.)

### 3. Prose corrections

The claim "paste the Setup script and Routines get plugins" was true when written and is
now measured false — sweep it wherever it is stated (`[IL-93]` discipline):

- Step 14's Setup-script paragraph: field confirmed effective for interactive cloud
  sessions; confirmed **not reaching** Routine sandboxes (2026-08-09); the preamble
  fallback, not the field, is what guarantees a routine firing executes its skill.
- The `## Cloud parity` CLAUDE.md section template Step 14 generates for consuming
  projects: same correction, compactly.
- This repo's own CLAUDE.md Cloud-parity bullet: same correction.
- New incident-log entry (next free IL number at merge time) written first, then
  compressed to one Don't in CLAUDE.md, per the Don'ts convention.

### 4. Sync surfaces

- `scripts/claude-cloud-setup.sh` itself is **unchanged** (measured working in-sandbox).
- Whatever test pins Step 14's embedded templates (script body / CLAUDE.md section) is
  updated alongside the prose edits — locate it at implementation time and update both
  sides in the same task.
- `tests/routine-template-schema.test.js`'s canonical-preamble expectations regenerate
  with the new preamble text.

### 5. Post-release operations (not part of the plugin change)

After release: `/claude-tweaks:routine update <skill>` for each of the five instantiated
routines pushes the new preamble into the live triggers (same re-sync executed
2026-08-09 for the v6/v7 templates). The environment field needs no further action. The
next scheduled firings then deliver the mechanism verdict; if the log turns out absent
with the field configured, file the platform bug upstream with that evidence.

## Out of scope

- #209's create-path probe (update-path evidence recorded on the issue; create-path
  untestable without minting an undeletable routine).
- Notification wiring (#210).
- Any behavioral change to `scripts/claude-cloud-setup.sh`.
