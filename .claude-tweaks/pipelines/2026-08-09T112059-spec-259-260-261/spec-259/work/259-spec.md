---
record: 259
origin: human
risk: medium
effort: low
ceremony: standard
grants: []
fingerprint: routine-plugin-delivery:field-line
surface: infra
---
# 259: Canonical cloud-setup Setup-script line: cwd-robust, logging, self-upgrading

Surface: infra

## Overview

Replace the canonical environment Setup-script field line with a cwd-robust, logging, still-non-blocking form, everywhere the plugin states it, and teach the Ensure-setup-script procedure to upgrade the old form when it finds one. The old line — `bash scripts/claude-cloud-setup.sh 2>/dev/null || true` — cannot resolve from a workspace-root cwd (the script's own header documents the field cwd as a workspace root containing the repo as a subdirectory), and its `2>/dev/null || true` leaves no evidence when it dies, which is exactly what made the 2026-08-09 Routine-sandbox failure undiagnosable from the outside.

The canonical line becomes:

```bash
{ bash scripts/claude-cloud-setup.sh || bash */scripts/claude-cloud-setup.sh; } > "$HOME/claude-cloud-setup.log" 2>&1 || true
```

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No **behavioral** change to `scripts/claude-cloud-setup.sh` — measured working when run in-sandbox from the repo checkout. Its header *comment* (which restates the paste instruction) is in scope, because it is generated from step-14's embedded template and must stay in sync with it.
- No routine-preamble changes (#260).
- No limitation-prose additions to cloud-parity claims (#261 — that leaf adds sentences; this leaf only swaps the invocation string wherever it is stated).

## Current State

Exact edit sites, enumerated by inspection at decomposition time (line numbers are anchors, not contracts — re-locate by content at build time):

1. `skills/routine/guided-environment-creation.md` Create step 5 (~line 93) — the field content written at environment creation. Clean single occurrence of the old line.
2. `skills/routine/guided-environment-creation.md` Ensure-setup-script step 4 (~line 161) — the string typed into an empty field, plus the branch logic this leaf extends. Clean single occurrence.
3. `skills/init/bootstrap/step-14-cloud-routine-parity.md` — **two** in-scope occurrences of the short-form paste phrase `bash scripts/claude-cloud-setup.sh` (no `2>/dev/null` suffix): (a) ~line 50, the header comment *inside the embedded script template* (the text that becomes `scripts/claude-cloud-setup.sh`'s own header — a comment-only change to the generated script); (b) ~line 240, the Setup-script bullet inside the generated `## Cloud parity` CLAUDE.md-section template. The paragraph titled "Offer to apply the Setup script" (~line 221) contains no invocation string today and needs none added.
4. `scripts/claude-cloud-setup.sh` header comment (~line 7) — regenerated to match site 3(a); comment text only.
5. `CLAUDE.md` (this repo's own Cloud parity section) — the paste phrase in the Setup-script bullet; string swap only (its surrounding limitation prose is #261's).

- `scripts/claude-cloud-setup.sh` already defends against the workspace-root cwd *internally* (`.git`-marker search + `cd`, per its header), but that defense only runs after bash has found the file; the field's relative-path invocation is the unprotected link. If the script's internal cwd-detection ever changes, this field line's fallback assumption must be re-verified — the two are coupled and nothing else records that.
- No test pins any of these strings (verified at decomposition time by repo-wide search) — cross-site consistency is caught by this leaf's own AC sweep and manual review only.

## Deliverables

- [ ] All sites enumerated in Current State state the new canonical line (sites 1, 2) or the new short-form paste phrase where the old short form appears in prose/bullets (sites 3-5: the phrase becomes "paste the canonical Setup-script line (see `scripts/claude-cloud-setup.sh`'s header)" or carries the full new line — implementer's choice, but the old bare `bash scripts/claude-cloud-setup.sh` paste instruction must not survive as the stated field content anywhere).
- [ ] Ensure-setup-script step 4 becomes four explicit, mutually exclusive branches with a stated match rule:
  - **canonical/current** — the field contains a `claude-cloud-setup.sh` invocation that redirects into a `claude-cloud-setup.log` file → Cancel, report success (this is also what the live `claude-tweaks: claude-tweaks` environment must classify as after its 2026-08-09 operational edit — verify by reading the live field, not by trusting this record).
  - **old form** — the field contains a `claude-cloud-setup.sh` invocation with **no** `claude-cloud-setup.log` redirect (with or without `2>/dev/null`) → replace that line with the canonical line.
  - **empty** → type the canonical line.
  - **unrelated content** — no `claude-cloud-setup.sh` invocation at all → append the canonical line on its own new line (existing rule, new string).
- [ ] The upgrade decision keys on the presence/absence of the substring `claude-cloud-setup.log` in the invocation line — an exact, checkable rule, not a resemblance judgment.

## Acceptance Criteria

1. **Positive:** each site enumerated in Current State contains its new text; sites 1 and 2 contain the canonical line byte-identically.
2. **Negative:** a repo-wide grep for the old literal `bash scripts/claude-cloud-setup.sh 2>/dev/null || true` (excluding `docs/` — frozen history: the incident log and shipped design-doc archives legitimately quote it) finds zero occurrences; a repo-wide grep for the bare paste phrase finds no site presenting it as the field content to paste.
3. Ensure-setup-script step 4 reads as the four branches above with the `claude-cloud-setup.log`-substring match rule stated.
4. The canonical line parses under `bash -n` (verify via bash, not zsh — IL-22).

## Technical Approach

The brace group runs the fallback path whenever the primary fails — including a genuine script error, which is accepted: the script is idempotent by design (its own header says so), and the log captures both attempts' output, so a double-run is evidence, not corruption. The `*/scripts/` glob assumes the workspace root contains the cloned repo as its only matching subdirectory (the documented sandbox layout); zero matches leave bash's own no-such-file error in the log, which is precisely the diagnostic the old line withheld. The single redirect captures stdout+stderr of whichever branch ran; the trailing `|| true` preserves the never-block-session-start guarantee. The string is stated per site — no shared include exists, and guided-environment-creation's deliberate-restatement note governs the duplication.

### Key Files

- `skills/routine/guided-environment-creation.md` — Create step 5 + Ensure-setup-script step 4 (four-branch rewrite)
- `skills/init/bootstrap/step-14-cloud-routine-parity.md` — embedded script template header + generated CLAUDE.md-section template bullet
- `scripts/claude-cloud-setup.sh` — header comment only (regenerated from the template)
- `CLAUDE.md` — Cloud parity Setup-script bullet, string swap only

## Gotchas

- `$HOME` stays inside double quotes in the canonical line; the line contains no backticks, so it pastes safely into the web UI field.
- The live environment's field state is **unverified at build time** — the 2026-08-09 operational edit is asserted history, not a repo fact. The Ensure-setup-script canonical/current branch must classify by reading the actual field, never by assuming this record's claim.
- Verify every stated grep/AC command against the after-state under `bash -c`, not the interactive shell (IL-22, IL-105).
- step-14's ~line 50 site is *inside* the embedded script template — editing it changes what future `/init` runs write to `scripts/claude-cloud-setup.sh`; keep the checked-in script's header identical to the template's, or the next `/init` produces a spurious diff.
- See the parent record (#258) Decision Rationale for why the log-bearing form was chosen and what its first firing discharges.

<!-- work-fingerprint: routine-plugin-delivery:field-line -->

