# Init GitHub Remote Bootstrap — Design

## Problem

Every place `/claude-tweaks:init` currently checks for a GitHub remote (Steps 9, 13, 15, 16 in
`bootstrap-steps.md`, prior to renumbering) treats "no remote" purely as a skip/degrade
signal — none of them ever offer to *create* one. A project with no GitHub remote silently
loses the issue-form-template offer (Step 9), cloud/Routine parity setup (Step 13),
non-default-branch issue tracking (Step 15), and gets defaulted straight to
`work-backend: local-files` (Step 16) — even when the user would happily have used GitHub
issues if `/init` had simply offered to set one up.

This design adds a new, interactive-only bootstrap step that detects the no-remote-at-all
case, offers to create a GitHub repository (installing/authenticating the `gh` CLI along the
way if needed), and links it as `origin` — so every downstream GitHub-gated step in the same
bootstrap run gets the richer path instead of the fallback.

## Scope

**In scope:**
- Detecting "no git remote configured at all" (any existing remote, GitHub or not, is left
  untouched — the user has already chosen a host).
- Ensuring the `gh` CLI is installed and authenticated, with the user's explicit
  confirmation at each step (install command run directly on confirm; `gh auth login --web`
  for authentication, since device-flow auth is inherently interactive).
- Offering to create a GitHub repository: choosing personal account vs. an org, confirming a
  repo name (defaulted to the sanitized project folder name), choosing visibility
  (private/public), one final consolidated confirmation, then executing via `gh repo create`.
- Renumbering the existing Steps 9–16 to 10–17 to accommodate the new Step 9, since this has
  the same genuine ordering dependency that justified the earlier Step 13 (now 14)
  renumbering: several later steps gate on remote-reachability within the same bootstrap pass.

**Out of scope:**
- Any behavior when a non-GitHub remote already exists (GitLab, Bitbucket, etc.) — untouched,
  per the "only when no remote exists at all" decision.
- Auto/non-interactive mode support — creating a repo is a consequential, externally-visible,
  hard-to-reverse action and this step is interactive-only, full stop. Auto mode continues
  today's fallback behavior (e.g. Step 17 defaulting to `local-files`) unchanged.
- Enumerating an unbounded number of orgs in the `AskUserQuestion` UI — capped at what fits
  (personal account + up to 3 orgs), with the built-in `Other` free-text field as the escape
  hatch for anything not listed.
- Non-interactive/token-based `gh auth login` flows — always uses `--web`.
- Migrating an existing non-GitHub remote to GitHub, or adding a second remote alongside an
  existing one.

## Placement: renumbering, following precedent

New step: **`Step 9 — Establish GitHub Remote (Optional)`**, inserted between the current
Step 8 (Statusline & Dependencies) and today's Step 9 (GitHub Issue Form Template).

This repo's `bootstrap-steps.md` already states the governing policy for this step group:
append-only by default, *except* when a new step has a genuine ordering dependency on running
before an existing one — the precedent being Step 13 (Cloud/Routine Parity Setup), inserted
via a full renumbering rather than appended, because a Routine created before cloud parity is
set up would silently fail its first cloud firing. This new step has the identical shape: it
must run before Steps 9/13/15/16 (old numbers) within the same bootstrap pass, or they'll
already have taken their degraded path by the time a remote could exist. Renumbering is
therefore the correct choice here too, not fractional insertion.

**Renumbering map:** 9→10, 10→11, 11→12, 12→13, 13→14, 14→15, 15→16, 16→17.

**Two-tier check consolidation:** the new Step 9 already has to run the two-tier
remote-existence check (`gh repo view --json owner,name` when `gh` is available and
authenticated, else `git remote get-url origin` exits 0) as its own gate. Step 9 becomes the
canonical home of that check's description; Steps 10/14/16/17 (old 9/13/15/16) simplify their
own gate text to "same check Step 9 establishes" instead of each re-describing it.

**Files touched:**

- `skills/init/SKILL.md` — 8 step headers renumbered (10 through 17); the enhancement-filter
  token table gains a new `github-remote → Step 9` row; the 4 tokens whose steps gate on
  remote-reachability (`issue-form`, `cloud-parity`, `branch-tracking`, `work-backend`) get a
  note that they silently run Step 9 first if invoked standalone with no remote yet —
  mirroring the existing `routines`→Step 13(now 14) "hard-depends, runs prerequisite silently"
  pattern already documented there; the "Steps 9-16"/"Steps 7-16" range mentions become
  "Steps 9-17"/"Steps 7-17"; the Actions Performed table; the design-wrapper/visualize/
  routine/work-record Relationship-table cells citing specific step numbers.
- `skills/init/bootstrap-steps.md` — 8 step headers; the append-only policy paragraph itself
  (live governing policy, not history — updated to describe Step 9 as a second deliberate
  ordering exception, with its own internal step-number references fixed); the generated
  `scripts/claude-cloud-setup.sh` template's literal comment line (`Step 13` → `Step 14`);
  internal cross-references inside the old Step 12/13/16 (now 13/14/17) procedures.
- `skills/routine/SKILL.md` — one Component-Skill Contract line, one Relationship-table cell
  (Step 13→14, Step 14→15).
- Root `CLAUDE.md` — the init row's sub-file description (Step 9→10, 13→14, 16→17) plus a new
  clause describing Step 9 itself. The three Don'ts-section historical narrative bullets
  naming "Step 13" are past-tense incident records about the *previous* renumbering — left
  untouched, matching this repo's convention of not rewriting historical narrative (same
  treatment as CHANGELOG.md entries).
- `skills/design-wrapper/SKILL.md`, `skills/visualize/SKILL.md`, `skills/review/SKILL.md`,
  `skills/journeys/SKILL.md`, `skills/specify/SKILL.md`, `skills/build/worktree-setup.md`,
  `skills/help/reference-card.md`, `docs/getting-started.md` — each has 1-3 step-number
  citations that shift per the mapping above.
- **Opportunistic fix:** `skills/help/reference-card.md`'s "Optional Enhancement steps (9-14)"
  is already stale (the real range is 9-16 today, before this change). Since this exact line's
  numbers are already being touched, correct it to the accurate post-renumber range (9-17)
  rather than leave a second drift bug in place.
- **Explicitly not touched:** `docs/superpowers/plans/*`, `docs/superpowers/specs/*` (frozen
  historical record), `CHANGELOG.md`, `.claude-tweaks/pipelines/archive/**` — all describe the
  *prior* renumbering as it happened, not live cross-references.

## Interaction flow

**Gate:** `git remote get-url origin` fails (no remote at all). Any existing remote, GitHub or
not, skips this step entirely.

**1. Ensure `gh` is ready:**
- Check `gh --version`. If missing, reuse `bin/lib/deps.js`'s existing package-manager
  detection (brew/winget/scoop/apt/dnf/pacman) to build the platform-appropriate install
  command. Offer via `AskUserQuestion`: `Install gh CLI (Recommended)` / `Skip`. On accept,
  run the install command directly via Bash, then re-verify with `gh --version`. On failure or
  no package manager detected, fall back to `deps.js`'s existing manual-URL message and abort
  this step gracefully.
- Check `gh auth status`. If not authenticated, explain the one-time browser step, run
  `gh auth login --web`, wait for the user to complete the device-flow authorization, then
  re-verify with `gh auth status`.
- Declining either offer, or a failure at either step, aborts Step 9 cleanly — the rest of
  `/init` proceeds exactly as it does today (e.g. Step 17 presents its existing
  github-issues/local-files choice, defaulted to local-files).

**2. Offer to create the repo:** `AskUserQuestion` — "No GitHub remote found for this project.
Create one now?" `Create a GitHub repo (Recommended)` / `Skip`. Declining falls through to
existing behavior unchanged.

**3. Choose owner:** Enumerate the personal account (`gh api user --jq .login`) plus the
user's orgs (`gh api user/orgs --jq '.[].login'`). Present as `AskUserQuestion` — personal
account marked `(Recommended)`, up to 3 orgs listed individually (an `AskUserQuestion` caps at
4 options); the built-in `Other` free-text field covers typing any org beyond that.

**4. Confirm name:** Default = sanitized basename of the git top-level directory (lowercased,
spaces/invalid characters replaced with hyphens per GitHub repo naming rules). Presented with
the default pre-filled, allowing an override in the same exchange.

**5. Choose visibility:** `AskUserQuestion` — `Private (Recommended)` / `Public`.

**6. Final confirmation:** one explicit summary confirm before executing — "Create
`github.com/<owner>/<name>` (private) and set it as `origin`, pushing the current branch?" —
covering the whole create+link+push action in a single consequential-action confirmation, not
a re-ask of steps 3-5.

**7. Execute:** `gh repo create <owner>/<name> --private|--public --source=. --remote=origin`,
adding `--push` only when `git rev-parse HEAD` succeeds (an empty repo with no commits yet has
nothing to push). On a name collision or permission error, report it and loop back to step 4
(pick a different name) rather than aborting the whole step.

**8. Downstream effect:** once the remote exists, Steps 10/14/16/17 (old 9/13/15/16) see it via
their own existing two-tier check and take their already-documented enriched paths — no logic
changes needed there beyond the gate-text consolidation noted above.

## Auto mode

Step 9 is interactive-only. In auto/non-interactive mode it does not run at all — no
install/auth/create offer, no autonomous repo creation. This mirrors
`_shared/browser-detection.md`'s existing bar on auto-installing `agent-browser`, and matches
this plugin's broader stance that consequential, externally-visible, hard-to-reverse actions
are never silently automated.

## Error handling summary

- Not a git repo at all → Step 9 doesn't run.
- A remote already exists (any host) → Step 9 doesn't run.
- User declines any offer (install gh / auth / create) → clean fallback to existing behavior.
- `gh` install fails / no package manager detected → abort gracefully, same fallback.
- `gh auth login` doesn't complete → abort gracefully, same fallback.
- Repo name collision or permission error on creation → re-prompt for a different name.

## Testing

This is a prose/skill-file change (`SKILL.md` + `bootstrap-steps.md` + the cross-referencing
files listed above), not application code — no `node --test` coverage applies. Verification is
a manual dry-run: a scratch directory with a fresh `git init` (no remote), walking through
Step 9's decision points by hand against the written procedure, and confirming the decline
paths at each stage leave `/init` in exactly today's existing state. Renumbering correctness is
verified the same way the Cloud/Routine Parity precedent verified its own renumbering: grep
each touched file's step-number references against the mapping table above during the
implementation plan's own task-level verification steps, executed against the literal
before/after text rather than estimated by hand.

## Integration touches

- `skills/init/SKILL.md`'s Actions Performed table gets a new row when this step actually
  creates a repo (`| GitHub remote created | <owner>/<name> | Step 9 |`).
- New Anti-Patterns row in `skills/init/SKILL.md`: assuming Step 9 can authenticate `gh`
  non-interactively — device-flow auth always requires the user to complete a browser step.
- No new CLAUDE.md config flag is written by this step — unlike Steps 10-17's persistent
  `enabled`/`disabled` flags, Step 9's effect (a git remote existing) is already fully
  observable at runtime via `git remote get-url origin`, so no separate state needs recording.

## Non-goals

- Does not support creating repos under GitHub Enterprise or non-github.com hosts.
- Does not attempt fully unbounded org enumeration in the interactive UI — bounded by
  `AskUserQuestion`'s 4-option cap, with `Other` as the escape hatch.
- Does not add auto-mode support of any kind for repo creation.
- Does not handle migrating an existing non-GitHub remote, or attaching a second remote.
