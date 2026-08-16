# Merge Verification — a policy lever for consulting CI before integrating

**Record:** #556 · **Date:** 2026-08-16 · **Status:** design approved in brainstorming, awaiting decomposition via `/claude-tweaks:specify`

## Problem

The plugin's integration sites — dispatch's auto-merge gate, flow's merge step, a session merging
its own PR — never consult the forge's verification signal before merging. PR #540 merged a red
conformance-test run into claude-tweaks's own `main` on 2026-08-16: the `test` workflow was
already running on the PR and already failing; the merge simply didn't wait 44 seconds for it.
Branch protection is one *enforcement mechanism*; the missing thing is a *policy vocabulary* for
"how much verification does a merge require, and who waits for it?"

Constraint that shapes the design: in a solo-owner fleet repo, most `main` writes are direct
pushes (fast-lane commits, run-dir bookkeeping, releases — measured ~76% over 4 days on
claude-tweaks itself), and every actor is one account. GitHub-side required checks would either
block those writes or be neutered by a self-bypass. So forge-side protection is something the
plugin **detects and cooperates with, never installs**.

## How target repos differ

| Dimension | Range the design must absorb |
|---|---|
| CI shape | none · fast PR CI (≈1 min) · slow PR CI (20+ min) · checks already **required** by org-owned protection |
| Actor model | solo-owner fleet (bypass semantics moot) · team repo (protection owned elsewhere; plugin complies) |
| Target-branch blast radius | default branch that deploys · default branch as distribution tip · non-default integration branch |
| Cadence | fast-lane many-merges-per-hour · human-paced |

## The lever

One scalar policy key in `.claude-tweaks/policy.yml`, Manifesto-overridable per run like every
other lever:

```yaml
merge-verification: merge-when-green | wait | off   # default: derived (see ladder)
```

No branch maps, no per-branch classes: the plugin's merge sites all target the single resolved
`{integration-branch}` (`_shared/integration-branch.md`), so there is exactly one merge target
per repo for this lever to govern. A repo whose long-lived integration branch is non-default
(e.g. `develop`) opts in with the one-line override. If a third archetype ever needs a map,
expand-contract the scalar then.

### Default derivation (when the key is unset)

Resolved in code (`bin/resolve-policy.js`), same pattern as `integration-model`'s forge-detection
ladder:

1. `integration-model` resolves to `local-merge` → **off** (no forge, no checks to consult; the
   plugin's own `/test` gate remains the only verification).
2. No PR-triggered CI detected (no workflow with a `pull_request` trigger; detection is
   best-effort and fails toward `off`) → **off**.
3. Integration branch **is** the repo's default branch → **merge-when-green**.
4. Integration branch is non-default → **off** (cadence wins; blast radius is scoped to that
   branch's own later runs; the detection tier below still reports a red tip).

## Mechanics per value

**merge-when-green** — at each merge site, attempt `gh pr merge --auto` first (forge-native
merge-when-green; requires the repo to allow auto-merge and have some protection rule). If arming
succeeds, the session walks away — the pr-first reconcile layer (`bin/lib/reconcile/`) already
converges merged-PR state (fast-forward, claim release, run-dir archive) from GitHub afterwards,
so no step depends on the arming session being alive. If arming fails (no protection rule, or
auto-merge disabled), degrade to **wait**.

**wait** — `gh pr checks {n} --watch` bounded at 15 minutes (hardcoded; not a policy key until a
real repo needs a different bound), then merge on green. Red → do not merge: park the run as
`bot:blocked` with the failing check named, log the decision per `_shared/auto-decision-log.md`.
Timeout with checks still pending → park the same way, reason `checks-pending-timeout`. Never
merge-anyway.

**off** — current behavior, unchanged.

**Forge cooperation (all values, including off):** when `gh pr merge` fails because org-owned
required checks are unsatisfied, that is the forge enforcing a stricter policy than ours — report
it as such and fall back to arming `--auto` (never retry-loop the merge, never suggest bypass).

**gh-absent degrade:** PR operations have no MCP fallback (`_shared/github-write-transport.md`
carries no pull-request row — established in `_shared/pr-early-run-lifecycle.md`'s degrade
table). Where `gh` is absent, `merge-verification` reads as unenforceable for that session:
proceed as `off` and say so in the run log. This mirrors the existing degrade posture rather than
inventing a new one.

## Detection tier (unconditional, not policy-gated)

Reconcile gains a red-tip check: at its existing shared-state read points and SessionStart, if
the integration branch's tip commit has a failing (not pending) combined check status, surface it
inform-tier ("CI is red on `{integration-branch}` tip at {sha} — {workflow}: {conclusion}").
This is the only coverage for direct pushes, which no merge gate can see. Inform only — it never
blocks anything, consistent with the hook tier vocabulary in `docs/hooks.md`. Where `gh` is
absent the check silently no-ops, matching reconcile's existing degrade posture.

## Out of scope

- Installing branch protection, rulesets, or merge queues in any repo.
- Per-branch policy maps (see The lever).
- Gating direct pushes (fast-lane, bookkeeping, releases) — detection tier only.
- A configurable watch timeout.

## Phase 1 — Policy key, derivation, and Manifesto lever

`merge-verification` added to the policy schema (`bin/lib/policy-schema.js`,
`skills/_shared/policy-schema.md`) with the derivation ladder implemented in
`bin/resolve-policy.js` (PR-CI detection best-effort, failing toward `off`). Manifesto lever-table
row in `skills/flow/manifesto.md` with the bolded-recommendation Options convention. Tests for
the ladder's four branches and the schema round-trip. No consumer behavior changes yet.

## Phase 2 — Merge-site consumers

One canonical statement of the merge-gate procedure in `_shared` (extending
`_shared/pr-early-run-lifecycle.md`, which already owns the PR lifecycle and its degrade table —
not a new file), cited by: dispatch's auto-merge gate (`skills/dispatch/SKILL.md`), flow's merge
step (`skills/flow/worktree-merge.md`), and the resume-to-merge confirmation path (which already
surfaces `gh pr checks` — #531 — and now acts on it under the lever). Red/timeout paths park as
`bot:blocked` + decision log. Skill-graph edges updated once in `docs/skill-graph.md`.

## Phase 3 — Red-tip detection in reconcile

New `bin/lib/reconcile/` check per the Detection tier section, wired into the existing reconcile
trigger points and SessionStart additionalContext, with tests. Closes #556 when it lands with
Phases 1–2.
