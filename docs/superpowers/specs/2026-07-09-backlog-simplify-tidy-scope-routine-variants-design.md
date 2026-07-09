# Backlog backend simplification + /tidy scoping + /routine variants — Design

## Problem

The backlog-on-GitHub-issues feature (`docs/superpowers/specs/2026-07-08-backlog-github-issues-design.md`) shipped in full (Phases 1-3, v5.21.0). Using it surfaced three follow-on gaps:

1. **`backlog-backend` still presents `local-files` as a peer choice even when a GitHub remote exists.** `/claude-tweaks:init` Step 15 asks a neutral A/B question every time, and `/claude-tweaks:capture`/`/claude-tweaks:tidy` carry a fully duplicated local-files/github-issues code path for every action (see `capture/SKILL.md`'s Backend Selection section and `tidy/SKILL.md`'s Action Vocabulary table). Now that github-issues is the proven, richer path — filterable, visible outside the repo, works with `/flow --from-label`/`--from-milestone` — asking the question at all, for repos that already have the better option available, is unnecessary friction and an unnecessary permanent-looking config choice.

2. **`/tidy` has no way to run a subset of its sweep.** `SKILL.md` states plainly: "`$ARGUMENTS` is not used by /tidy." Every invocation runs all 10 scan steps (INBOX/DEFERRED, specs, design docs, plans, worktrees, doc registry, issue claims, GitHub PRs/issues, spec sizing, cross-spec patterns) whether or not the caller wants all of it. A common real want — "just check on GitHub issue triage" — currently means paying for a full sweep every time.

3. **`/claude-tweaks:routine` supports exactly one instantiated routine per project+skill.** `create <skill>` explicitly routes to `update` if a record already exists ("never create a second routine for the same project+skill" — CREATE Step 3), and the anti-pattern table calls a second routine for the same skill a bug ("duplicate routines double-run the same work"). Once `/tidy` can run scoped, there's a real want this blocks: a frequent, cheap "GitHub issue triage every few hours" routine running *alongside* — not instead of — a heavier weekly full sweep. The one-routine-per-skill constraint has no escape hatch today.

## Solution

### A. Backend simplification — `local-files` becomes fallback-only when a GitHub remote exists

`/claude-tweaks:init` Step 15's gate (the same GHE-safe two-tier check Step 9 already uses — `gh repo view` when available, remote-exists fallback otherwise) still runs, but its *outcome* changes:

- **GitHub remote detected:** set `backlog-backend: github-issues` in CLAUDE.md silently — no prompt, no interruption to the bootstrap flow. This mirrors how `design-integration` and other CLAUDE.md flags already default without a mandatory question when the answer is unambiguous.
- **No GitHub remote:** unchanged — `local-files` is the only option, set the same way as today (no behavior change for these repos).
- **Manual override still works.** A user can hand-edit CLAUDE.md to `backlog-backend: local-files` even with a remote present (e.g. a public repo where a team doesn't want backlog items GitHub-visible). `/capture` and `/tidy` keep honoring whatever the flag says — no code path is removed, no capability is dropped. This section is entirely about who gets asked the question, not about what's possible.
- **Update-Mode nuance.** An existing repo that already has `backlog-backend: local-files` in CLAUDE.md is ambiguous — deliberate choice, or just what `/init` defaulted someone into before this change? Resolution: treat it as deliberate and leave it alone. Update-Mode's drift pass keeps its existing behavior exactly — it re-offers the upgrade only when a GitHub remote *newly* became available (was absent at last `/init`), and does not get more aggressive about nudging pre-existing `local-files` configs just because the default recommendation changed. Silently reinterpreting a prior explicit-looking choice would be worse than leaving a few repos on the old path.

**Alternative considered and rejected:** fully removing `local-files` support. Rejected — it's still required for repos with no GitHub remote at all, and it's the load-bearing fallback for transient GitHub failures (capture's Step 1 failure path, `/tidy`'s Sync to GitHub action); there is no way to drop it without breaking those two real, still-current cases.

### B. `/claude-tweaks:tidy --scope=<name>[,<name>...]`

New optional argument. No flag preserves today's behavior exactly (full sweep, all 10 steps) — fully backward compatible.

Scope taxonomy, one name per step group:

| Scope | Steps covered |
|---|---|
| `inbox` | 1, 1.5 (INBOX/DEFERRED, or the unsynced-check under `backlog-backend: github-issues`) |
| `specs` | 2, 5 (spec audit + sizing — sizing is sequential-after-2, bundled together) |
| `docs` | 3 (design docs/briefs) |
| `plans` | 4 (execution plans) |
| `git` | 4.5 (worktrees/branches) |
| `registry` | 4.6 (doc registry) |
| `claims` | 4.7 (issue claims) |
| `github` | 4.8 (PRs + code-health issues + harness-health issues + backlog issues — one coarse scope, matching Step 4.8's existing single shared procedure) |
| `patterns` | 5.5 (cross-spec patterns) |

Rules:

- **Comma-separated combination is supported**: `--scope=github,git` runs just those two step groups.
- **`patterns` has a hard dependency on `specs`** (Step 5.5 reads Step 2's results) — requesting `--scope=patterns` alone silently pulls in `specs` too, matching today's sequential ordering (Steps 5/5.5 already run after the parallel batch specifically because they need Step 2's output). Every other scope is independent and needs no auto-inclusion.
- **Unknown scope name** → error listing the valid names above; nothing runs.
- **Downstream is unchanged.** Same Step 6 batch report + `AskUserQuestion` approval, same Step 7 execution, same Step 7.5 verification — just fed by whichever scopes ran. The commit message notes the scope explicitly (e.g. `Tidy (scope: github): closed 2 stale issues, promoted #142`) so git history stays honest about what was actually swept versus a full pass, and a reader six months later isn't misled into thinking a scoped run touched specs/docs/plans it never looked at.

**Alternative considered and rejected:** per-issue-type granularity within `github` (separate `backlog-issues`/`prs`/`code-health`/`harness-health` scopes). Rejected — Step 4.8 is already one shared procedure (`_shared/github-pr-scan.md`'s `repo-wide` scope) consumed as a unit; splitting it adds real implementation cost (the procedure would need internal sub-scoping) for a distinction not currently needed.

### C. `/claude-tweaks:routine` — multiple named template variants per skill

**Template file convention (additive, no breaking changes to any existing consumer):**

- `skills/{skill}/routine-template.yml` stays the default/primary template. Zero changes required for code-health, flow, or harness-health.
- Additional named variants live as sibling files: `skills/{skill}/routine-template-<variant>.yml` (e.g. `skills/tidy/routine-template-github-triage.yml`).
- Each variant template already requires its own `routine_name` field (existing schema, unchanged). Since `PREFIXED_NAME` (`{repo-slug}-{routine_name}`) already derives from that field, distinct variants naturally produce distinct instantiated-record filenames and distinct live routine names — **no schema change is needed to the instantiated record** (`skills/_shared/routine-template-schema.md`'s "Instantiated record" table is untouched).

**`/claude-tweaks:routine` argument change:**

- New optional `--variant=<name>` on `create`/`update`/`status`.
- No `--variant` → loads `routine-template.yml` exactly as today (fully backward compatible for every existing consumer).
- `--variant=<name>` → loads `routine-template-<name>.yml` instead. If that file doesn't exist, stop with a clear error naming the skill and variant.
- **The existing idempotency check (CREATE Step 3) already works correctly per-variant with no change**, because it keys on `PREFIXED_NAME`, which is now variant-specific: creating `tidy --variant=github-triage` while `tidy-weekly`'s record already exists is a legitimate second instance, not a duplicate. The existing anti-pattern row ("creating a second routine when an instantiated record already exists") gets a one-line addendum clarifying this, so it isn't misread as "one routine per skill, full stop" by a future reader or a future skill author adding their own variant.
- `status <skill>` with no `--variant`: when multiple instantiated records exist for that skill (detected by globbing `.claude-tweaks/routines/{repo-slug}-*.yml` and matching against every `routine_name` the skill's template files declare), list all of them rather than assuming exactly one. `--variant=<name>` narrows to a single instance's status, exactly as today.
- `/init` Step 13's discovery glob extends from matching only `routine-template.yml` to also matching `routine-template-*.yml`, offering each variant as its own selectable item (own name, own notes) rather than collapsing every variant under one skill-level checkbox.

**Tidy's new variant — `skills/tidy/routine-template-github-triage.yml`:**

- `routine_name: tidy-github-triage`
- `prompt: "/claude-tweaks:tidy --scope=github"`
- A tighter default cron (every few hours, still respecting `RemoteTrigger`'s 1-hour minimum interval) than the existing weekly full sweep in `routine-template.yml` (`routine_name: tidy-weekly`).
- `notes` reiterates the same `auto-mode: default-on` prerequisite the existing template documents, plus a line explaining the intended split: this variant is for frequent, cheap GitHub-issue triage; the base template remains the periodic full-backlog hygiene pass. Both can be instantiated in the same project simultaneously.

**Alternative considered and rejected:** moving every skill's template(s) into a `routine-templates/` subdirectory (e.g. `skills/tidy/routine-templates/weekly.yml`). Rejected as needless churn — it would force a rename in code-health, flow, and harness-health, none of which have any variant need today, purely to serve tidy's new use case. The additive sibling-file convention (`routine-template-<variant>.yml`) achieves the identical outcome with zero forced changes to any existing template.

## Out of scope (YAGNI)

- **Per-issue-type sub-scopes inside `github`** (see Solution B's rejected alternative above) — no evidence yet that anyone wants PR-only or code-health-only triage separately from the rest of Step 4.8.
- **A `routine-templates/` directory restructure** (see Solution C's rejected alternative above) — the sibling-file convention is strictly less disruptive for the same capability.
- **Automatic migration of an existing `backlog-backend: local-files` config to `github-issues`.** Explicitly rejected under Solution A — an existing explicit-looking choice is left alone, never silently reinterpreted.
- **A general "N routines per skill, arbitrary count" UI beyond named variants.** Two variants (base + one alternate) is the concrete, motivated case; nothing in this design assumes more than "however many `routine-template-*.yml` files a skill's author chooses to ship," but no batch-management UI (e.g. "list every variant across every skill") is being built — `status <skill>` (scoped to one skill) is sufficient for the motivating use case.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Doc scoping | One combined design doc covering all three topics, despite them being conceptually distinct — user's explicit choice, twice reaffirmed when offered the option to split |
| `local-files` role (GitHub remote present) | Fallback-only — not offered as a selectable `/init` choice, but still fully functional via manual CLAUDE.md override and automatic write-failure fallback |
| Update-Mode handling of pre-existing `local-files` configs | Left alone — never silently reinterpreted or force-upgraded |
| `/tidy --scope` granularity for GitHub | Coarse — one `github` scope covers all of Step 4.8 (PRs + code-health + harness-health + backlog issues) |
| `/tidy --scope` combination | Comma-separated list supported (`--scope=a,b`), not restricted to one scope per invocation |
| Scoped-run downstream UX | Identical to a full run (same report/approval/execution/verification pipeline) — only the input findings are narrower; commit message notes the scope |
| Routine scoping mechanism | Extend `/claude-tweaks:routine` to support multiple named template variants per skill, rather than parameterizing a single routine's scope at instantiation time or dropping routine scoping from this pass |
| Variant file convention | Sibling files (`routine-template-<variant>.yml`) alongside the existing `routine-template.yml`, not a subdirectory restructure |
| Instantiated-record schema | Unchanged — variant disambiguation already falls out of the existing `routine_name` → `PREFIXED_NAME` derivation |

## Testing / verification approach

1. **Backend simplification.** Exercise `/claude-tweaks:init` against this repo (has a real, authenticated GitHub remote) — confirm no local-files prompt appears and `backlog-backend: github-issues` is set silently. Exercise Update-Mode against a CLAUDE.md with `backlog-backend: local-files` already set — confirm it is left unchanged (not force-upgraded), matching the "leave deliberate-looking choices alone" rule.
2. **`/tidy --scope`.** Run `/claude-tweaks:tidy --scope=github` for real against this repo's live GitHub backend — confirm the resulting report contains only `[pr]`/`[gh-issue]`/backlog-issue rows and nothing from INBOX/specs/docs/plans/git/registry/claims. Run with an invalid scope name and confirm the error lists valid names. Run `--scope=git,registry` and confirm exactly those two step groups execute. Run `--scope=patterns` alone and confirm `specs` is silently included (Step 2 must have run for Step 5.5 to produce anything).
3. **`/routine` variants.** `/claude-tweaks:routine create tidy --variant=github-triage --dry-run` against this repo — confirm the assembled body carries `tidy-github-triage`'s name/prompt/schedule, and that no live infrastructure is created (dry-run). Confirm `/claude-tweaks:routine status tidy` (no `--variant`) lists both `tidy-weekly` and `tidy-github-triage` once both instantiated records exist under `.claude-tweaks/routines/`. Confirm creating `tidy --variant=github-triage` while `tidy-weekly`'s record already exists does **not** trigger the idempotency-check's route-to-update behavior (they're different `PREFIXED_NAME`s).
