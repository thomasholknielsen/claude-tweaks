# 0014. A hook-read policy key rename ships with a transitional twin in this repo's own policy.yml

- **Status:** accepted
- **Date:** 2026-08-16
- **Context:** #602, applying #332's naming rule (`skills/_shared/policy-key-naming.md`) to `worktree.always`, the last dotted key

> **Resolved.** The transitional twin this decision installs has since been removed from this
> repo's `.claude-tweaks/policy.yml` — a fresh session detected a running build at or above the
> release that shipped #602 and deleted the old-spelling line, per the removal condition in the
> Decision section below. Only `worktree-always: true` remains; the Decision section describes
> the now-closed transitional window, not current file contents. Left unedited below on purpose,
> per `[ADR-0013]`'s superseded-rather-than-edited convention.

## Context

This plugin self-hosts: its own `.claude-tweaks/policy.yml` configures the same hooks it ships to everyone else. The code that reads that file during a session is the **marketplace-installed** build — 6.87.0 when this was decided — not the branch under development. `bin/lib/hooks/pre-tool-use.js` and `bin/lib/hooks/session-start.js` reach it through `bin/lib/policy.js`, which looked the key up by literal name.

For a consuming project the rename is safe by construction: #602 taught the resolver *and* the hook's own reader to consult `RENAMED_KEYS`, so a project whose `policy.yml` still says `worktree.always` keeps its gate, and a project that has migrated gets the new line winning in any file order.

For this repo it is not safe, because the file being renamed is read by a build that predates that alias. Renaming the line alone turns off worktree enforcement here — and the failure is silent. Nothing errors; edits and commits outside a linked worktree simply stop being denied, which is indistinguishable from a session that happens not to have tried one yet. The window lasts from the merge until a release ships and the machine actually upgrades, and no code in the branch can observe when that happens.

## Decision

This repo's `policy.yml` carries **both** spellings — `worktree-always: true` and `worktree.always: true`, the old line commented as a transitional twin — with its removal condition recorded in `skills/_shared/policy-deprecations.md`: delete it once the **running** build's `plugin.json` version (`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, not the install pointer `claude plugin update` moves) is at or above the release that shipped #602 — and only in a **fresh session** started on such a build, never mid-session after `claude plugin update`, since the running session keeps whatever build it started with regardless of where the install pointer moves. See `docs/incident-log.md` `[IL-133]`.

The general rule this sets: renaming a policy key that this plugin's own hooks read is a two-build change, not a one-commit change. A branch may not assume the build reading its configuration is itself.

## Alternatives considered

- **Rename the line and accept the dark window** — one clean line, no duplicate, no explaining. Rejected: it disables this repo's own worktree enforcement for an unbounded interval, and does so silently. A guard whose absence produces no signal is the worst thing to switch off by accident.
- **Exempt hook-read keys from the naming convention** — freeze `worktree.always` in its dotted spelling permanently, the way `auto-mode` was deliberately kept under the same record. Rejected: the `auto-mode` keep rests on that name being *right* (it names the contract it toggles, and the confusion it causes is conceptual rather than orthographic). Nothing recommends the dotted spelling here except the difficulty of changing it, and a convention that carves out precisely the keys hardest to change stops being a convention.
- **Two-release expand-contract — alias-aware reader in release N, rename this repo's key in release N+1** — the textbook sequence, and the one this decision follows in substance. Rejected in that literal form because the wait it depends on is unobservable: nothing in the branch can detect the upgrade, so "N+1" degrades to a human remembering. Folding the expand step into the file itself makes the same window survivable immediately, and turns the contract step into a checkable predicate instead of a memory.
- **Teach the hook to prefer the working tree's own `bin/lib/policy.js` when the repo is claude-tweaks** — self-detection would erase the two-build gap entirely. Rejected: it cannot help here (an already-installed build cannot be taught anything after the fact), it adds a special case exercised by exactly one repo, on the hot path of every tool call, and it would let a broken branch disable its own guard.

## Consequences

The naming convention now applies to every key, including the ones the hooks read, at the price of one duplicated line in this repo carrying a version-gated removal condition.

That line is the artifact most likely to be deleted by a well-meaning conformance pass — it looks exactly like the duplication #332 set out to remove. Two things defend it: the inline comment on the line itself, and the removal predicate in `policy-deprecations.md`, which had to switch to a fixed-string grep (`grep -nF "worktree.always:"`) because the previous regex form treated `.` as a wildcard and matched the dash-spelled replacement forever — meaning it could never have cleared.

The mirror case is inherent and unfixed: a *project* that migrates to `worktree-always` and then downgrades the plugin below the #602 release loses its gate, since that build reads the old literal only. No twin on our side helps there; it is a property of renaming any hook-read key.

Revisit if a future rename touches a hook-read key whose absence fails loudly rather than silently — the twin buys nothing when the breakage announces itself — or if hook-side reads of the running build's version (`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`) become cheap and routine enough that a build can decide for itself which spelling era it is in.
