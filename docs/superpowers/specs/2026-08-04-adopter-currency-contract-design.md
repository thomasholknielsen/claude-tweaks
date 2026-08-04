# The adopter currency contract

How claude-tweaks decides what it writes into an adopting project's CLAUDE.md,
how that content stays current as the plugin changes, and why the accumulated
backward-compatibility surface can now be deleted rather than maintained.

## Problem

Three symptoms, one root cause.

**1. An adopting project reliably gets the plumbing and unreliably gets the guidance.**

`/claude-tweaks:init` Update Mode's Phase 1u.5 contract-drift check greps for
exactly four markers (`skills/init/update-mode.md:50-53`):

| Marker | Contract version |
|---|---|
| `^## claude-tweaks Pipeline` | v4.0+ |
| `auto-mode:` | v4.5+ |
| `Bookend architecture` | v4.6+ |
| `pipelines/{run-id}` | v4.6+ |

The strings `Working Approach` and `Philosophy` appear **zero times** in
`update-mode.md`. Neither section is ever checked on update. Yet
`skills/init/claude-md-template.md` calls Working Approach "the one **standard,
non-adaptive** section in the template — include it verbatim in every generated
CLAUDE.md", and states its purpose is covering "**ad-hoc work outside the
pipeline** — where no skill gate fires."

So a project that adopts the plugin with a pre-existing CLAUDE.md gets the
pipeline wiring offered as patches, and never gets the two sections that shape
how the model actually behaves.

**2. The highest-signal moment for a CLAUDE.md update is discarded.**

`skills/_shared/harness-health-analysis.md:11` states it plainly:

> `/claude-tweaks:wrap-up` and `/claude-tweaks:init` currently only invoke it
> against skills (their own scope-selection logic hasn't been extended to pass
> rule/CLAUDE.md files in) — extending them is a separate, smaller follow-on.

The end of a piece of work is when a convention just changed, a command just got
renamed, or an incident just happened. `/wrap-up` Step 7 never looks at
CLAUDE.md, so that signal is dropped and the project waits for a
`/claude-tweaks:harness-health` rotation to rediscover it cold from git churn.

**3. Roughly half of what the plugin writes is duplication that goes stale.**

Measured against the Initial Mode Template:

| Block | Bytes | Varies by project? |
|---|---|---|
| `## Working Approach` | 1,561 | no — verbatim |
| `## claude-tweaks Pipeline` | 2,468 | no — verbatim |
| `## Project Defaults` | 1,287 | no — defaults written out literally |
| `## Philosophy` universal bullets | 784 | no — verbatim |
| `## Philosophy` maturity paragraph | 457 | one of three fixed blocks |
| `## Work records` | 45 | value only |
| **Total plugin-authored** | *see rows above* | |

That block is byte-identical in every adopting project. It is inherited by
every dispatched subagent (the same arithmetic that drove #95/#102 in this
repo), it competes against the 150-line `harness-health.always-loaded-budget`
before the project contributes a word, and when the plugin changes it, every
adopting project's copy is stale until someone re-runs `/init --update`.

**The root cause.** The plugin has no stated contract about what it may write
into an adopting project, what keeps that content current, or what happens to
content that stops being needed. Absent that contract, three things accumulate:
sections nobody checks, duplication nobody reconciles, and compatibility paths
nobody retires.

The accumulation is measurable. `grep -rn -i legacy skills/ --include="*.md"`
returns **195 matches** across nine distinct families, and
`grep -rn -i "deprecation policy\|breaking change\|support window\|sunset"`
across `README.md`, `CLAUDE.md`, and `docs/` returns **zero**. Every
compatibility path was added ad hoc; none has a documented end date.

One family has already crossed from cost into wrong behavior.
`README.md:164` documents it: a project with only `backlog-backend:` set and no
`work-backend:` line gets `/capture`, `/challenge`, and `/tidy` reading the alias
correctly while **every other consumer skill silently defaults to
`local-files`**. Partial aliasing is worse than either full aliasing or none.
This repository works around it by setting both flags to the same value
(`CLAUDE.md:166-167`).

## Thesis

One invariant governs all three symptoms:

> **Plugin-authored content in an adopting project's CLAUDE.md is limited to
> what must reach the model on a turn where no skill was invoked. Everything
> else lives in the plugin, once.**

The invariant is testable. For any line the plugin writes into a project: *if
the model never invokes a claude-tweaks skill this turn, does this line still
need to be true?* Working Approach passes — it governs ad-hoc work. The
superpowers routing overrides pass — they fire before any skill is chosen.
Bookend-architecture mechanics fail — by the time they matter, `/flow` is
running and already carries them.

It has a corollary:

> **Anything the plugin writes into a project must name a consumer that reads
> it.**

`markdown-mode` violates the corollary today. It appears in exactly one file in
the entire repository — `skills/init/claude-md-template.md:106`, the template
that writes it. No skill reads it. `/init` has been writing a dead config key
into every adopting project, and nothing detected it because nothing was
looking.

`directory` (the worktree-directory lever) appears to be a second instance: no
reader of a `directory:` config line was found, and
`skills/init/bootstrap/step-06-worktree-configuration.md:5` states that anything
needing to detect a worktree "should run `git worktree list` or check
`GIT_DIR != GIT_COMMON` ... rather than assume a fixed directory name" — the two
worktree paths are fixed conventions, not configuration. This is a negative
result from a keyword search and must be confirmed structurally before deletion
(`[IL-15]`); the plan carries that as an explicit check rather than an
assumption.

**Why backward compatibility can simply be deleted.** The marketplace
`source` is an unpinned git URL, so every install tracks `main` HEAD — there are
no pinned versions in the wild. The plugin's only consumer is its author, across
projects they control and can inspect. The `v4.0+`/`v4.5+`/`v4.6+` contract
gates exist to negotiate with old installs that do not exist. Legacy support
here is a tax paid to oneself.

## Design

Three plans. Plan B depends on Plan A (the conformance check must know the new
template shape). Plan C is independent.

### Plan A — Template restructure

Bring `claude-md-template.md` into compliance with the invariant.

| Block | Now | After | Rationale |
|---|---|---|---|
| `## Philosophy` | 1,241 | 1,241 | Governs every code change; fires with no skill invoked |
| `## Working Approach` | 1,561 | 1,561 | Its stated job is ad-hoc work where no skill gate fires |
| `## claude-tweaks Pipeline` | 2,468 | 847 | Routing survives; mechanics are duplication |
| `## Project Defaults` | 1,287 | 0 | Deleted — see below |
| `## Work records` | 45 | 45 | Value is project-specific |
| **Total** (whole template body) | **6,462** | **3,554** | **-45%** |

**Pipeline section — what survives.** Four routing paragraphs, because each
fires *before* a skill is chosen and therefore fails the invariant's test if
removed:

1. The artifact chain (design doc -> spec -> `/flow`; no phase-plan files; skip
   `/superpowers:writing-plans`)
2. The entry point (`/claude-tweaks:specify` accepts topic, design-doc path, or
   record ref)
3. `/flow` accepts specs and rejects design docs
4. The superpowers overrides (brainstorming stops after the design doc; SDD and
   executing-plans do not auto-invoke finishing-a-development-branch)

**What is deleted.** The bookend-architecture paragraph, the
`config.yml`/`decisions.md` run-dir mechanics, the `auto-mode` flag explanation,
and the "project policy defaults live in policy.yml" meta-pointer. Each is
consulted only once `/flow` is already running, and `/flow` carries them via
`skills/flow/SKILL.md`, `_shared/auto-mode-contract.md`, and
`_shared/auto-decision-log.md`.

**`## Project Defaults` — deleted, not rehomed.** Key by key:

- `markdown-mode` -> **delete outright.** No consumer.
- `directory` -> **delete, pending the structural confirmation described in
  Thesis.** If a reader is found after all, it moves with the group below
  instead.
- `execution-strategy`, `git-strategy`, `section-confirmation`,
  `merge-check`, `scope-keywords-required` -> **give each a documented
  `policy.yml` path in `_shared/policy-schema.md`**, then remove from the
  template. Three of these (`section-confirmation`, `merge-check`,
  `scope-keywords-required`) already appear in that file's
  `## CLAUDE.md-only levers` section as having "no `policy.yml` path documented
  today" — this closes that gap rather than routing around it. The other three
  appear in no section of the schema at all.
- `auto-mode` -> already dual-homed per the schema, and ships commented out.
  Drop from the template; keep the `policy.yml` path.

**Open decision the plan must resolve, not this design.** `policy.yml` already
carries `execution.always` ("Locks `/claude-tweaks:build`'s execution-strategy
axis to `subagent` only, when set"), while CLAUDE.md carries
`execution-strategy: subagent | batched`. One constrains the axis, the other
sets the value. Moving the latter into `policy.yml` places them adjacent; the
plan must decide explicitly whether they remain two keys or merge into one.

**Live read sites that must be edited.** `skills/flow/SKILL.md:119` names
"CLAUDE.md `git-strategy` setting" by name; `:122` names both CLAUDE.md and
`.claude-tweaks/policy.yml` as sources for execution strategy. `[IL-68]`
applies — any bypass flag whose "skip these sources" list names sources by
identity must be audited when a source moves.

### Plan B — Currency mechanisms

**B1. `/init` Phase 1u.5: conformance check replaces marker greps.**

Because plugin-authored sections are byte-identical by definition, this is a
deterministic string comparison, not an LLM judgment. New module
`bin/lib/init/claude-md-conformance.js`:

- Holds the list of plugin-authored section names
- Reads `skills/init/claude-md-template.md` **live** on each call — the same
  discipline `_shared/harness-health-analysis.md` dimensions 7 and 8 already
  apply, so a future template change propagates without editing the module
- Compares against the project's CLAUDE.md
- Returns `{missing, drifted, conformant}`

Missing section -> offer the verbatim block. Drifted section -> offer a re-sync
patch. Both batch into the Phase 3 Drift Report exactly as contract-drift
entries do today, preserving the existing single-approval flow.

This catches the Working Approach and Philosophy gap by construction, rather
than by adding two rows to a hand-maintained marker list that would drift again.

Secondary benefit: `_shared/harness-health-analysis.md` dimension 7 currently
asks a model whether the target "still match[es] the structure its own generator
established." This module supplies mechanical evidence in the same shape as the
Step 1 pre-checks that dimension already consumes.

**B2. `/wrap-up` Step 7: gated full audit.**

The gate opens when the run produced CLAUDE.md-relevant signal:

- A new Don't candidate surfaced by `/claude-tweaks:reflect` or the ledger
- A command listed in CLAUDE.md's `## Commands` renamed or removed in this diff
- A claim in CLAUDE.md's `## Conventions` contradicted by this diff
- A recorded incident

When open, pass CLAUDE.md into `_shared/harness-health-analysis.md` — the
procedure Step 7 already invokes for skills. Findings stage to the Review
Console; CLAUDE.md findings never auto-apply, per that file's existing
exception.

This uses the applicability-gating pattern established by `47fa4aae` (#86), so a
run with no relevant signal pays nothing.

`harness-health-analysis.md:11`'s Scope note is updated in the same change — it
currently states wrap-up invokes the procedure against skills only, which this
plan makes false.

**B3. `/harness-health`: unchanged.** Its daily rotation
(`skills/harness-health/routine-template.yml`, cron `0 5 * * *`, budget 1)
remains the periodic backstop.

### Plan C — Legacy purge

One sweep. No migration machinery: the projects that carry old state are the
author's own and are migrated once, by hand, before the readers are deleted.

**Tier 1 — verified dead, pure deletion.**

- The legacy spec-file alias (bare `42` -> `specs/{N}-*.md`, parallel to `#N`
  record references). Dominant family in `skills/flow/`, `skills/wrap-up/`,
  `skills/build/`, `skills/specify/`, `skills/tidy/`. Verified dead in this
  repository: `specs/` holds only `DEFERRED.md`, `INBOX.md`, and `INDEX.md` with
  no numbered spec files; the last commit touching `specs/` (`652a97c4`,
  2026-07-26) was itself a legacy cleanup; `work-backend: github-issues` is set
  and 19 of the last 30 commits use `refs #N` / `closes #N`.
- `specs/INDEX.md` and the `specs/` tracking files.
- The nine `v4.0+` / `v4.5+` / `v4.6+` contract gates.
- The retired `## Auto-mode policy` migration block in
  `skills/init/update-mode.md`.
- The four `triage-*` legacy dispatch aliases in `_shared/policy-schema.md`.

**Tier 2 — verify before cutting.**

- `backlog-backend` alias: delete it, set `work-backend` explicitly in each
  project, and remove this repository's own doubled flag at `CLAUDE.md:166-167`.
- Legacy taxonomy labels: **resolve `status:in-progress` first.**
  `README.md:164` lists it as retired vocabulary, but `gh label list` shows it
  defined with the description "Claimed and being built by an autonomous
  claude-tweaks run — see `_shared/issue-claims.md`" — i.e. live, for the claim
  system. Purge by provenance, never by name. No `tier:*` or `status:*` labels
  are currently applied to any open issue, and no `specs/backlog/` residue
  exists.
- Legacy `auth.yml` and v1 stories format in `skills/stories/` and
  `skills/test/`: check for live story files using them before deleting.

**Tier 3 — documentation.**

- Delete `README.md`'s "Migrating from 5.x" section.
- Rename `## Backlog integration` to `## Work records` in `CLAUDE.md` and drop
  its legacy-alias note.

**One new Don't**, because 195 mentions is what "no end date" produces:

> Don't add a compatibility path without recording the condition under which it
> gets removed — legacy support with no named removal condition accumulates
> silently, and no sweep finds it because nothing is looking.

## Non-goals

- **This repository's own CLAUDE.md is out of scope.** It is the harness for
  maintaining the plugin, not an instance of what the plugin produces: it runs
  well over the 150-line budget, omits most of the template's sections, and
  carries several the template does not model at all. Applying the adopter
  template to it is a category error. The conformance check must not be pointed at it. Whether the
  plugin should model that distinction explicitly is separate work.
- **No deprecation window, migration tooling, or version negotiation.** Justified
  solely by the unpinned-git-URL distribution and single-consumer facts above.
  If either changes, this decision must be revisited.
- **No change to `/harness-health`'s rotation, selection, or filing.**
- **No re-mining of any project's `## Don'ts`.** Plan B detects structural
  conformance and drift, not content quality.

## Surface

**New files** — `bin/lib/init/` does not exist yet; it is created as a flat
sibling under `bin/lib/`, per `CLAUDE.md`'s structure convention (not nested
under a `_shared/` wrapper, which is specific to `skills/_shared/`).

- `bin/lib/init/claude-md-conformance.js`
- `bin/lib/init/tests/claude-md-conformance.test.js`

**Modified**

- `skills/init/claude-md-template.md` — Initial Mode Template restructure
- `skills/init/update-mode.md` — Phase 1u.5 marker table replaced by the
  conformance check; retired `## Auto-mode policy` block removed
- `skills/_shared/policy-schema.md` — `policy.yml` paths for six keys;
  `execution.always` reconciliation; four `triage-*` aliases removed
- `skills/_shared/harness-health-analysis.md` — Scope note at line 11 corrected
- `skills/wrap-up/SKILL.md` — Step 7 gated CLAUDE.md audit
- `skills/flow/SKILL.md` — `git-strategy` and `execution-strategy` resolution
  chains repointed
- `skills/flow/`, `skills/wrap-up/`, `skills/build/`, `skills/specify/`,
  `skills/tidy/` — spec-file alias removal
- `skills/stories/`, `skills/test/` — `auth.yml` and v1 stories removal
- `README.md`, `CLAUDE.md` — Tier 3 documentation

**Deleted**

- `specs/INDEX.md` and the `specs/` tracking files

## Verification

- **Conformance module unit tests**: missing section, drifted section,
  conformant, and **section-list completeness** — a new plugin-authored section
  added to the template must not silently escape the check.
- **Discrimination check**: delete `## Working Approach` from a fixture, re-run,
  and confirm the check fails. Reading correctly is not evidence it discriminates.
- **Orphaned-key test**: every config key the template writes must have a
  consumer elsewhere in the repository. This is the corollary made executable,
  and is the test that would have caught both `markdown-mode` and `directory`.
  It must assert against a structural signal (a resolution site reading the key),
  not merely the key name appearing somewhere — a name-only check passes on the
  template's own line (`[IL-15]`).
- **Purge-completeness greps**: anchored to path position, never a bare content
  substring (`[IL-34]`, `[IL-39]`), and excluding this design document, which
  necessarily quotes every retired pattern verbatim (`[IL-28]`).
- **Byte measurement after restructure**: measure what each resolved path
  actually loads, not what moved out of the template (`[IL-76]`).
- `npm test` green.

## Risks

1. **The invariant is a judgment call at the margin.** The `/flow` paragraph
   mixes routing and mechanics. Mitigation: the plan enumerates each surviving
   and deleted paragraph literally rather than stating a rule and leaving the
   implementer to apply it (`[IL-38]`).
2. **Moving `git-strategy` / `execution-strategy` touches live resolution
   chains.** `[IL-68]`: audit every bypass flag naming sources by identity.
3. **Purging by name is unsafe.** `status:in-progress` proves at least one
   retired name was reused for something live. Purge by provenance, verified per
   family.
4. **The spec-file alias sweep is wide and mechanical**, spanning five skills.
   `[IL-51]` / `[IL-43]`: dispatch edit-only agents and run every git operation
   centrally. `[IL-52]`: grep centrally afterwards, since each agent leaves
   cross-references claiming the others did not fix it.
5. **`/wrap-up`'s gate fails silently in one direction.** A gate that never opens
   is indistinguishable from a clean CLAUDE.md. The SCANNED summary must
   distinguish "gate closed, not run" from "audited, no findings" — the same rule
   `47fa4aae` established for the nine gated sub-file reads.
6. **Reduced always-loaded content could remove something genuinely needed.**
   The deleted pipeline mechanics are only reachable when `/flow` runs, but this
   is an argument, not a proof. Mitigation: the byte measurement in Verification
   is per resolved path, and the four surviving routing paragraphs are chosen for
   firing before skill selection, which is where a wrong deletion would show up.
