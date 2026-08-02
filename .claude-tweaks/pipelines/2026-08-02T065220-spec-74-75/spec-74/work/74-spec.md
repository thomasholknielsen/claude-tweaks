---
record: 74
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: infra
---
# 74: init Step 14: claude-cloud-setup.sh template assumes repo-root cwd and pre-registered claude-plugins-official — both false on a fresh sandbox

Surface: infra

## Current State

`/claude-tweaks:init`'s Step 14 (Cloud/Routine Parity Setup) generates `scripts/claude-cloud-setup.sh` from a template embedded in `skills/init/bootstrap-steps.md`. On a real claude.ai/code cloud sandbox this template fails in two independent, sequential ways before it ever reaches "Start Claude Code":

1. The Setup Script step's cwd is a workspace root (e.g. `/home/user`) containing the cloned repo as a single subdirectory — not the repo root itself. Every relative-path reference in the script, including the file-based `bash scripts/claude-cloud-setup.sh` invocation the generated CLAUDE.md instructs the user to paste, fails with `bash: scripts/claude-cloud-setup.sh: No such file or directory` (exit 127). `$HOME` is not a reliable substitute for the real cwd either (tried and failed identically).
2. Once past that (tested by pasting the script's contents directly instead), the first `@claude-plugins-official`-scoped plugin in the install loop fails: `Plugin "code-review" not found in marketplace "claude-plugins-official"`. The template's own comment assumes this marketplace "ships pre-registered with Claude Code" and deliberately skips an explicit `claude plugin marketplace add` call for it (unlike the other two marketplaces referenced, which do get one) — false on a fresh sandbox. `claude plugin marketplace update` on a marketplace that was never `add`ed is a silent no-op (fully swallowed by the script's own `>/dev/null 2>&1 || true` guard), so every plugin sourced from it fails to resolve.

Net effect observed on the reporting project: all 6 scheduled claude-tweaks Routines silently died at environment bootstrap, for an unknown period before diagnosis.

## Deliverables

Update the `scripts/claude-cloud-setup.sh` template embedded in `skills/init/bootstrap-steps.md` (Step 14) to:

1. Locate the cloned repo by its `.git` marker (directory or file, to also cover gitdir-file clone forms) via `find`, searching from `$(pwd)` rather than assuming cwd or `$HOME`, and `cd` into it before anything else in the script runs.
2. Explicitly `claude plugin marketplace add anthropics/claude-plugins-official` before attempting `claude plugin marketplace update claude-plugins-official`, mirroring the treatment the template already gives the other two referenced marketplaces.

## Acceptance Criteria

- A newly generated `scripts/claude-cloud-setup.sh`, run with cwd at a workspace root containing the cloned repo as a single subdirectory, locates and `cd`s into the repo directory via the `.git`-marker `find` logic instead of failing with `No such file or directory` (exit 127).
- The generated script explicitly registers `claude-plugins-official` via `claude plugin marketplace add` before calling `claude plugin marketplace update`, so plugins sourced from that marketplace (e.g. `code-review`) resolve successfully on a fresh sandbox with no prior marketplace registration.
- Existing treatment of the other two marketplaces (already given an explicit `add` call) is unchanged.
- The fix is verified against the same repro steps the issue describes (Setup Script step on a real or simulated fresh sandbox), not just read for plausibility.

## Technical Approach

### Key Files
- skills/init/bootstrap-steps.md

Apply the two fixes already verified end-to-end on a live claude.ai/code sandbox in the issue's own Suggested fix section, to the template's generation logic (the literal bash this step embeds into the generated script):

```bash
SEARCH_ROOT="$(pwd)"
REPO_DIR=$(find "$SEARCH_ROOT" -maxdepth 2 \( -type d -o -type f \) -name .git 2>/dev/null | head -1 | xargs -I{} dirname {})
[ -n "$REPO_DIR" ] && cd "$REPO_DIR"
```

```bash
claude plugin marketplace add anthropics/claude-plugins-official 2>/dev/null || true
claude plugin marketplace update claude-plugins-official >/dev/null 2>&1 || true
```

## Gotchas

- #75 (open, related) covers a distinct failure mode later in the same generated script (the agent-browser/Chrome install chain) — this record's fix needs to land first for #75's fix to ever actually execute in a real cloud run, since #75's failure surfaces only after the script gets past this issue's cwd/marketplace steps.
- This is a template-generation fix (`skills/init/bootstrap-steps.md`), not a fix to any already-generated script sitting in a downstream project — existing projects that already ran `/init` won't pick this up until they re-run `/init update` or manually patch their own `scripts/claude-cloud-setup.sh`.
- Don't duplicate or diverge the existing `add`-then-`update` handling already present for the other two marketplaces while fixing this one's missing `add` call.

## Original request

init Step 14: claude-cloud-setup.sh template assumes repo-root cwd and pre-registered claude-plugins-official — both false on a fresh sandbox

**Summary:** The Step 14 (Cloud/Routine Parity Setup)-generated `scripts/claude-cloud-setup.sh`
template makes two false assumptions about a fresh claude.ai/code sandbox — that the Setup
Script step's cwd is the cloned repo root, and that the `claude-plugins-official` marketplace
is pre-registered by default — both broke cloud parity entirely on a real project.

**Type:** Bug

**Affected component:** `/claude-tweaks:init` Step 14 (`skills/init/bootstrap-steps.md`'s
embedded `scripts/claude-cloud-setup.sh` template)

**Repro steps:**
1. Run `/init` (or `/init cloud-parity`) on a project with a GitHub remote — Step 14 writes
   `scripts/claude-cloud-setup.sh` per the current template.
2. Paste `bash scripts/claude-cloud-setup.sh` into a claude.ai/code environment's Setup Script
   field, exactly as the Step's own generated CLAUDE.md "Cloud parity" section instructs.
3. Start a session or fire a scheduled Routine against that environment.

**Expected vs. actual:**
Expected: the Setup Script step runs cleanly, installs the declared plugins, and the
environment proceeds to "Start Claude Code."

Actual: two independent, sequential failures, both confirmed live on a real sandbox:

1. `bash: scripts/claude-cloud-setup.sh: No such file or directory` (exit 127). The sandbox's
   Setup Script step starts with cwd at a workspace root (confirmed via a diagnostic dump:
   `pwd` -> `/home/user`, containing a single subdirectory named after the repo), not at the
   repo root itself. Every relative-path reference in the script -- including the file-based
   `bash scripts/claude-cloud-setup.sh` invocation itself -- fails to resolve. `$HOME` is also
   not a reliable substitute for the real cwd (tried and failed identically before switching
   to `$(pwd)`).
2. Once past (1) -- by pasting the script's contents directly into the Setup Script field
   instead of referencing the file, to keep testing -- the very first `@claude-plugins-official`
   -scoped plugin in the install loop fails: `Plugin "code-review" not found in marketplace
   "claude-plugins-official". Your local copy may be out of date -- try claude plugin
   marketplace update claude-plugins-official.` The template's own comment claims this
   marketplace "ships pre-registered with Claude Code" and deliberately skips an explicit
   `claude plugin marketplace add` call for it (unlike the other two marketplaces referenced,
   which do get one) -- this is false on a fresh sandbox. It only appears pre-registered on a
   dev machine because of prior, unrelated manual marketplace setup there. `claude plugin
   marketplace update` on a marketplace name that was never `add`ed is a silent no-op (fully
   swallowed by the script's own `>/dev/null 2>&1 || true` guard), so every plugin sourced
   from it then fails to resolve.

Net effect on the reporting project: every scheduled claude-tweaks Routine (6 of them)
silently died at environment bootstrap -- none ever reached "Start Claude Code," so none of
their actual skill logic ever ran, for an unknown period before this was diagnosed.

**Suggested fix** (both changes verified working end-to-end on a live claude.ai/code sandbox
-- full bootstrap through to real skill execution):

1. Locate the repo by its `.git` marker (directory or file, to also cover gitdir-file clone
   forms) via `find`, searching from `$(pwd)` rather than `$HOME`, and `cd` into it before
   anything else runs.
2. Explicitly `add` the `claude-plugins-official` marketplace before attempting to `update`
   it, sourced from the repo the generated `.claude/settings.json#extraKnownMarketplaces`
   already declares (`anthropics/claude-plugins-official`), mirroring the treatment already
   given to the other two marketplaces.

**Environment:**
- Reported from project: a private project using claude-tweaks v6.23.6

---
Filed via repo-feedback (lab-holknielsen/claude-user-config).
