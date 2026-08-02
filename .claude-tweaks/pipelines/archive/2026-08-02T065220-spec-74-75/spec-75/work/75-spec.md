---
record: 75
origin: human
risk: low
effort: medium
ceremony: standard
grants: []
surface: infra
---
# 75: init Step 14: generated claude-cloud-setup.sh template does not handle agent-browser Chrome install failures in cloud sandboxes

Surface: infra

## Current State

`/claude-tweaks:init`'s Step 14 (Cloud/Routine Parity Setup) generates `scripts/claude-cloud-setup.sh` from a template embedded in `skills/init/bootstrap-steps.md`, which includes an agent-browser + Chrome install step for browser-automation-dependent skills. In a real claude.ai/code cloud sandbox this step hits four distinct, real failure modes, none of which the template accounts for:

1. `agent-browser install --with-deps` hardcodes a `sudo apt-get ...` call for Chrome's Linux runtime libraries; cloud sandbox containers commonly run as root with no `sudo` binary at all, so the call fails silently (tolerated as a warning) and Chrome's binary downloads but can't launch (missing shared libs).
2. Even after installing the libraries directly (no sudo), `agent-browser install`'s own binary-download step fails with `invalid peer certificate: UnknownIssuer` fetching its Chrome version manifest — its bundled Rust/rustls HTTP client doesn't trust the sandbox's system CA store (a TLS-inspecting-proxy signature), and `agent-browser`'s only cert-bypass flag (`--ignore-https-errors`) is scoped to `agent-browser open`, not `install` — no workaround via agent-browser itself.
3. The sandbox's Debian base has undergone the 64-bit `time_t` transition, renaming a subset of Chrome runtime library package names with a `t64` suffix (e.g. `libasound2` -> `libasound2t64`) — a hardcoded package list drawn from an older Debian base fails with "no installation candidate."
4. A dynamic per-package installability check via `apt-cache policy <pkg> | grep -q ...` under `set -o pipefail` hits a SIGPIPE race: `grep -q` exits as soon as it finds a match, closing its stdin — if the upstream process is still writing, it gets SIGPIPE'd, and `pipefail` reports that (141) as the pipeline's exit status instead of grep's real success, producing a false negative even on a genuine match.

Each of these four required an independent live-sandbox (or Docker-based) reproduction cycle to diagnose.

## Deliverables

Update the agent-browser install step of the `scripts/claude-cloud-setup.sh` template embedded in `skills/init/bootstrap-steps.md` (Step 14) to:

1. Install Chrome's runtime libraries directly via `apt-get` (no `sudo` — already root in the sandbox), resolving each package name dynamically against `apt-cache policy` via a herestring (not a live pipe) to avoid the SIGPIPE/`pipefail` interaction, with a `t64` fallback for packages renamed by the 64-bit `time_t` transition.
2. Bypass `agent-browser install`'s own Chrome download entirely — fetch the version manifest and zip directly via `curl` and place the binary at the path `agent-browser doctor`/launch logic expects, sidestepping the TLS-trust failure in `agent-browser install`'s bundled HTTP client.

## Acceptance Criteria

- The generated script installs Chrome's runtime libraries as root, with no `sudo` call anywhere in the agent-browser install step.
- Package name resolution against `apt-cache policy` falls back to the `t64`-suffixed name when the base name has no installation candidate, and does not use a live pipe into `grep -q` under `pipefail` (a herestring or equivalent non-pipe check is used instead, avoiding the SIGPIPE false-negative).
- Chrome's binary is fetched via a direct `curl` call against the version manifest + zip, bypassing `agent-browser install`'s own download step entirely, and placed where `agent-browser doctor` / launch logic expects to find it.
- `agent-browser doctor` (or equivalent launch check) succeeds after the generated script runs on a fresh cloud sandbox, with no TLS/cert error and no missing-shared-library launch failure.
- Verified against the same repro conditions the issue describes (cloud sandbox, root user, TLS-inspecting proxy, `time_t`-transitioned Debian base), not just read for plausibility.

## Technical Approach

### Key Files
- skills/init/bootstrap-steps.md

Apply the fix already verified end-to-end on a live claude.ai/code sandbox in the issue's own Suggested fix section, to the template's generation logic (the literal bash this step embeds into the generated script):

- Resolve each required library package name via `apt-cache policy <pkg>` captured into a variable (herestring/direct capture, not `| grep -q` on a live pipe), falling back to `<pkg>t64` when the base name has no installation candidate, then `apt-get install -y` the resolved list directly (no `sudo` prefix).
- Replace the `agent-browser install`'s own Chrome download with a direct `curl` fetch of the Chrome version manifest and zip, placing the extracted binary at the path `agent-browser doctor`/launch logic expects — this sidesteps `agent-browser install`'s bundled rustls client's cert-trust failure entirely rather than trying to work around it via a flag (`--ignore-https-errors` doesn't apply to `install`).

## Gotchas

- Depends on #74 (open, related) landing first (or in the same change) — #74 fixes an earlier failure in the same generated script (cwd resolution + marketplace registration) that currently stops the script before it ever reaches this agent-browser/Chrome install step, so this fix can't be exercised end-to-end in a real cloud run until #74's fix is also in place.
- The SIGPIPE/`pipefail` interaction (failure mode 4) is subtle — a naive rewrite of the installability check that still pipes into `grep -q` will silently reintroduce the false-negative under `set -o pipefail`, even if it "looks" fixed. Verify with a real multi-line `apt-cache policy` output, not a single-line fixture that wouldn't trigger the race.
- The `t64` package rename is specific to the sandbox's current Debian base — a future base image change could rename packages differently again; the dynamic-resolution-with-fallback approach is meant to be more durable than a hardcoded list, but isn't proof against every possible future rename.
- This is a template-generation fix (`skills/init/bootstrap-steps.md`), not a fix to any already-generated script sitting in a downstream project — existing projects that already ran `/init` won't pick this up until they re-run `/init update` or manually patch their own `scripts/claude-cloud-setup.sh`.

## Original request

init Step 14: generated claude-cloud-setup.sh template does not handle agent-browser Chrome install failures in cloud sandboxes

**Summary:** The claude-cloud-setup.sh script generated by /claude-tweaks:init's Step 14 (Cloud/Routine Parity Setup) hits several distinct, real failure modes when installing agent-browser + Chrome in a claude.ai/code cloud sandbox -- none of which the template accounts for out of the box.

**Type:** Bug

**Affected component:** claude-tweaks:init Step 14 (Cloud/Routine Parity Setup) -- the generated scripts/claude-cloud-setup.sh template's agent-browser install step

**Repro steps:**
1. Run /claude-tweaks:init with cloud-parity + agent-browser install enabled in a project.
2. Configure the generated Setup Script in a claude.ai/code cloud environment and fire a session.
3. Observe the agent-browser Chrome install step fail -- investigation surfaces 4 separate real issues:
   a. `agent-browser install --with-deps` hardcodes a `sudo apt-get ...` call for Chrome's Linux runtime libraries; cloud sandbox containers commonly run as root with no `sudo` binary at all, so the call fails silently (tolerated as a warning) and Chrome's binary downloads but can't launch (missing shared libs).
   b. Even after installing the libraries directly (no sudo), `agent-browser install`'s own binary-download step fails with `invalid peer certificate: UnknownIssuer` fetching its Chrome version manifest -- its bundled Rust/rustls HTTP client doesn't trust the sandbox's system CA store (classic TLS-inspecting-proxy signature), and `agent-browser`'s only cert-bypass flag (`--ignore-https-errors`) is scoped to `agent-browser open`, not `install` -- no workaround via agent-browser itself.
   c. The sandbox's actual Debian base has undergone the 64-bit time_t transition, renaming a subset of Chrome runtime library package names with a `t64` suffix (e.g. `libasound2` -> `libasound2t64`) -- a hardcoded package list drawn from an older Debian base fails with "no installation candidate."
   d. A dynamic per-package installability check via `apt-cache policy <pkg> | grep -q ...` under `set -o pipefail` hits a subtle SIGPIPE gotcha: `grep -q` exits as soon as it finds a match, closing its stdin -- if the upstream process is still writing, it gets SIGPIPE'd, and pipefail reports that (141) as the pipeline's exit status instead of grep's real success, causing a false negative even on a genuine match.

**Expected vs. actual:**
Expected: the generated template's agent-browser install step works out of the box in a real cloud sandbox.
Actual: none of the above four issues are handled; each required a live cloud-sandbox reproduction + Docker-based verification cycle to diagnose and fix independently.

**Suggested fix:** update the Step 14 template to (1) install Chrome's runtime libraries directly via apt-get (no sudo, already root), resolving each package name dynamically against `apt-cache policy` (via a herestring, not a live pipe, to avoid the SIGPIPE/pipefail interaction) with a `t64` fallback; and (2) bypass `agent-browser install`'s own Chrome download entirely -- fetch the version manifest + zip via `curl` and place the binary directly at the path `agent-browser doctor`/launch logic expects.

**Related:** #74 (open) -- same general area (Step 14 template not handling real sandbox conditions), different specific failure mode (cwd/marketplace registration vs. this issue's agent-browser/Chrome install chain).

**Environment:**
- Reported from project: a private project

---
Filed via repo-feedback (lab-holknielsen/claude-user-config).
