# 0003. Roll out `worktree.always` via `/init`'s bootstrap opt-in, not a global default

> Note (2026-08-16, #602): the key discussed here was renamed `worktree.always` → `worktree-always`; the resolver and the hook accept both spellings via a `RENAMED_KEYS` alias (removal condition in `skills/_shared/policy-deprecations.md`). Body text below is preserved as written.

- **Status:** accepted
- **Date:** 2026-07-08
- **Context:** Follow-up to the always-worktree-enforcement design (2026-07-06, `docs/superpowers/specs/2026-07-06-always-worktree-enforcement-design.md`), which shipped the mechanical PreToolUse hook as a per-project opt-in but left "how other projects adopt it" unresolved — this repo was the sole hand-configured adopter until this decision.

## Context

The `worktree.always` mechanical hook (`bin/lib/policy.js`, `bin/lib/hooks/pre-tool-use.js`, `bin/lib/hooks/session-start.js`) ships with every install of the claude-tweaks plugin, but only activates when a project's `.claude-tweaks/policy.yml` sets the flag — and nothing wrote that file automatically. Every project besides this one had the enforcement code installed but dormant, since nothing ever prompted them to opt in.

## Decision

Ask during `/init` Phase 0 Step 6, with "Yes — enforce `worktree.always`" as the recommended option; the project can still decline (and is re-offered on a later `/init` re-run if it does). The actual policy-file write is deferred to the true last filesystem action of the `/init` invocation — writing it mid-run would deny the invocation's own remaining edits via the very policy it just turned on (see `docs/superpowers/specs/2026-07-08-init-worktree-always-opt-in-design.md` for the write-timing design).

## Alternatives considered

- **Global default-on** — flip `isWorktreeAlwaysOn()` to return `true` whenever no policy file exists, opt-out via an explicit `worktree.always: false`. Rejected: silently changes behavior for every existing installed project the next time its hooks fire, with no prompt and no migration step — too high a blast radius for a plugin installed across many different projects with different workflows.
- **Silent write during bootstrap, no question asked** — `/init` always writes `worktree.always: true` for new projects with no prompt. Rejected: enabling worktree isolation is a workflow-wide commitment (denies every `Edit`/`Write`/`git commit` outside a linked worktree from the first prompt of every future session) — the user should see and approve it, the same way the Impeccable/diagram-design/shadcn integrations always ask rather than silently enabling.

## Consequences

Adoption is opt-in and gradual — new or re-init'd projects get the recommended default, but existing projects that never re-run `/init` stay dark until they do; there is no separate out-of-band nudge mechanism. This keeps the global-default-on alternative available later as a stronger fallback if adoption stays low over time, without having foreclosed it by assuming it upfront. The re-offer-on-decline behavior (matching the Impeccable/diagram-design/shadcn convention) only fires on the next `/init` re-run, not proactively.
