# The learning-routing contract

Where a lesson goes when the pipeline learns something, why two uncoordinated
capture systems are currently competing for that decision, and what it takes to
give claude-tweaks a single classifier plus the two writers it is missing.

## Problem

The pipeline captures learnings prolifically. It has no router. The result is
not a shortage of destinations — it is five destinations, two writers, and
nothing deciding between them.

### 1. The memory store has become an undeclared second capture system

The auto-memory directory for this project holds 31 memory files (plus the
`MEMORY.md` index). Classified by what each lesson is actually *about* — not by
its declared `metadata.type`:

| Subject of the lesson | Count |
|---|---|
| claude-tweaks' own machinery — plan authoring, subagent dispatch, worktree discipline, verification | 20 |
| Environment facts (zsh parameter modifiers, NUL bytes, `node_modules` permissions, `claude plugin update`) | 4 |
| Project state (shared-checkout branch volatility, local `main` ahead of `origin`) | 4 |
| Genuine user preference — what the memory system is nominally *for* | 3 |

Typed `feedback`: 24. Typed `user`: 0.

Twenty of thirty-one are craft lessons about this plugin's own skills and
contracts, sitting in a private per-project store under
`~/.claude/projects/<slug>/memory/`. They are reachable by one person, in one
project.

### 2. The same lesson lands in two stores, in different words

`CLAUDE.md` carries 111 `Don't` bullets across 51 KB; `docs/incident-log.md`
carries 90 entries across 101 KB. Several memory files restate an entry that
already exists there:

| Memory file | Existing record |
|---|---|
| `claude-tweaks-nul-byte-breaks-grep` | `[IL-74]` |
| `claude-plugin-update-is-version-string-only` | `[IL-89]` |
| `version-claimed-at-ship-not-reserved` | CLAUDE.md "Releasing" step 1 |
| `shared-checkout-branch-volatility` | `[IL-05]` |

Two subsystems wrote the same lesson twice because neither can see the other.

### 3. Lessons that would help every adopter never leave the private store

These appear in memory and nowhere in `CLAUDE.md` or `docs/incident-log.md`:

- `workflow-agent-fabricated-fix-reports` — *Workflow-dispatched fix agents can
  report detailed, convincing success (specific test-pass counts, before/after
  verification) while making zero actual file changes.*
- `subagent-stray-writes-to-main-checkout`
- `verify-test-discrimination-by-reverting`
- `shared-fixture-consolidation-plan-risk`
- `zsh-colon-in-quoted-var-mangles-git-refs`
- `background-task-exit-code-not-command-exit-code`

The first is a load-bearing fact about subagent dispatch. Its correct home is
`skills/_shared/subagent-output-contract.md`, where it would protect every user
of the plugin.

### 4. Root cause: memory is the only cross-project store that exists

`skills/reflect/full-mode.md:65-66` routes insights to "Memory file" and
`full-mode.md:16` names "memory files" as a destination for lens 4. No procedure
anywhere in `skills/reflect/` or `skills/wrap-up/` says how to write one.
Meanwhile `/claude-tweaks:harness-health --kind memory` ships a full audit suite
for those files (`skills/_shared/harness-health-memory-checks.md`).

The plugin has a reader for a writer it does not have. When a lesson is
transferable — true beyond this codebase — the only store that can hold it is
one claude-tweaks never writes to. So the harness's own auto-memory catches it
instead, from conversational correction, and it stops there.

There is no upstream destination at all. `grep -rn "thomasholknielsen/claude-tweaks" skills/`
returns three hits: two marketplace URLs in `skills/init/bootstrap/step-14-cloud-routine-parity.md`
and one informational line in `skills/version/SKILL.md:56`. None is a filing target.

## Scope

**In scope.** A single classifier, the two missing writers (memory, upstream),
and the hook points that route producers into them.

**Out of scope, deliberately.**

- *Backfilling the existing stores.* The existing memories and `Don't` bullets stay
  where they are for now. Reclassifying them is a follow-up spec, run once the
  classifier has proven itself on live traffic — tuning a classifier against a
  backlog it has never seen is the wrong order.
- *Upstream targets other than `thomasholknielsen/claude-tweaks`.* Superpowers
  is a third party; auto-filing against someone else's repository from inside a
  private codebase carries different consent requirements. `claude-user-config`
  is already covered by the user's personal `repo-feedback` skill. A learning
  classified "upstream, but not claude-tweaks" is reported and stopped, leaving
  `repo-feedback` as the manual path.
- *Eval coverage for the classifier.* Tracked as a known follow-up. See
  "Deferred" below.

## Destinations

Routing resolves on an **audience × durability** axis:

| | Destination | Audience | Context cost | Writer today |
|---|---|---|---|---|
| **D1** | `CLAUDE.md` Don'ts / `.claude/rules/` | this project | highest — every dispatched agent | wrap-up Step 6.1 |
| **D2** | Project skill / doc / ADR / journey | this project | medium — lazy-loaded | wrap-up Steps 6.2, 7, 7.7, 7.8 |
| **D3** | Backlog work record | this project, deferred | none until claimed | `_shared/work-record.md` |
| **D4** | Memory file | this user, **all** projects | high — every session | **none** |
| **D5** | Upstream issue → `claude-tweaks` | everyone using the plugin | none locally | **none** |

D1–D3 have working, tested writers. The delta is D4 and D5 plus the classifier.

## Architecture

Three pieces. No new router skill; no new durable state.

### `skills/_shared/learning-routing.md` (new)

The destination table, the classifier, and the D4 write procedure. Cited by
consumers rather than restated in each, per CLAUDE.md's `_shared/` convention:
*"cross-skill contracts, criteria, and canonical procedures cited by skills
rather than restated."*

### `skills/feedback/SKILL.md` (new)

The D5 writer, as a component skill. Owns drafting, scrubbing, dedup, filing,
and reporting for upstream feedback only.

### Reuse, not new code

`bin/lib/health-core/` already exports what D5's dedup needs:
`fingerprint.js` (`createFingerprint`, `normalizeText`, `fingerprintFromBasis`),
`dedup.js`, and `issue-index.js`. The retry-queue and regressed-reopen shapes are
canonical in `skills/_shared/health-filing-mechanics.md`. No new `bin/lib/`
module is introduced unless implementation proves one necessary.

## The classifier

An ordered decision procedure. First match wins.

1. **Names a `/claude-tweaks:*` skill, a `skills/_shared/*` contract, or a
   `bin/*.js` behavior, and would hold in any project using the plugin**
   → **D5 upstream**
2. **No project file, no plugin file, and no repo-specific fact appears in the
   statement of the lesson** → **D4 memory**
3. **A rule about this codebase that must always be loaded** → **D1**
4. **Procedure knowledge for a bounded domain** → **D2**
5. **Work to do, not knowledge to keep** → **D3**
6. Otherwise → do not capture, with a stated reason (existing rule,
   `skills/reflect/full-mode.md:75`)

**Ordering is the fix.** D5 is evaluated before D4. Today D4 is the only
cross-project store in existence, so every transferable lesson defaults into it
— the mechanism that produced Problem §1. Ranking upstream above memory routes
`workflow-agent-fabricated-fix-reports` to `subagent-output-contract.md` rather
than to a private directory.

Rule 2's test is deliberately harsh. Applied to the current 31 memories it keeps
three: `brainstorming-interaction-style`, `design-feedback-style`,
`claude-md-conciseness`. Memory should be small, and about the user.

**One lesson, one destination.** First match wins and routing stops. This is a
deliberate change from the current behavior: `skills/reflect/full-mode.md:65`
routes "A fundamentally better approach exists" to *"Skill update + Memory
file"* — two stores for one lesson. That row is the duplication mechanism of
Problem §2 written down as a rule, and it does not survive. A lesson that
genuinely serves two audiences is two lessons, stated separately, each routed on
its own.

**Self-reference.** When `git remote get-url origin` resolves to the
claude-tweaks repository itself, D5 collapses into D1/D2/D3 — the lesson becomes
an ordinary record or `Don't`. The plugin never files issues against itself
through this path.

## Dedup

Every destination is checked before a write. Each tier uses an artifact that
already exists; no index is introduced.

| Store | Mechanism | Cost |
|---|---|---|
| **D1/D2** | `CLAUDE.md` is loaded into every session as project instructions — every `Don't` bullet is already in context | zero |
| **D4** | `MEMORY.md` is the harness-maintained index: one line per memory, ~32 lines | one `Read` |
| **D5** | content fingerprint + `gh issue list --search`, via `health-core/fingerprint.js` | one `gh` call |

This satisfies `[IL-17]` rather than violating it. That rule states a keyword
grep "narrows the search but doesn't replace reading the whole file" — so the
primary mechanism is not a grep. For D1/D2 the whole file is already resident.

`docs/incident-log.md` (101 KB) is **not** read wholesale. It receives a targeted
grep only when the CLAUDE.md check is ambiguous. This is sound because every live
`Don't` carries its `[IL-nn]` tag: an incident-log entry with no surviving bullet
is exactly the case where re-proposing the rule may be correct, since CLAUDE.md
states *"The incident-log entry stays even when its rule goes."*

## The two writers

### D4 — memory writer

Lives as a procedure in `_shared/learning-routing.md`.

**Path resolution.** The memory directory comes from the invoking assistant's own
system prompt, **never derived or guessed** — the same rule
`skills/harness-health/SKILL.md:35` already applies to `--memory-dir`.

**Format.** Already documented for reading in
`_shared/harness-health-memory-checks.md`: frontmatter `name` / `description` /
`metadata.type`; `**Why:**` and `**How to apply:**` body lines for the `feedback`
type; `[[name]]` links; and a `MEMORY.md` index line within the 150-character
budget that file already enforces. The plugin gains a writer for a schema it
already knows how to read and audit.

**Precedent for touching harness-owned state.** CLAUDE.md forbids writing to
`~/.claude-tweaks/` because it is harness-owned runtime state, and
`~/.claude/projects/<slug>/memory/` is the same category. The `--memory-dir`
convention is the established safe pattern: the path is supplied, not computed.

### D5 — `/claude-tweaks:feedback`

Gather → self-reference check → dedup → draft → **scrub** → confirm → file →
report.

The scrub is non-negotiable and is the reason this destination can never be
silent: the lesson is derived from a private codebase and the target repository
is public. Filing reuses the health sweeps' retry queue so a `gh` failure
escalates to a `feedback:filing-failed` issue rather than dropping the lesson.

The skill carries a Component-Skill Contract keyed on `$PIPELINE_RUN_DIR`, per
CLAUDE.md's canonical template, and omits `## Next Actions` when a parent owns
the handoff.

## Hook points

| File | Change |
|---|---|
| `skills/_shared/learning-routing.md` | new — destination table, classifier, D4 procedure |
| `skills/feedback/SKILL.md` | new — D5 writer |
| `skills/reflect/{full,light,hindsight}-mode.md` | routing guide cites the contract instead of restating it; D4/D5 rows added |
| `skills/wrap-up/SKILL.md` Steps 6, 7 | classification consults the contract; existing writers unchanged |
| `skills/wrap-up/review-console.md` | two new sections — Memory updates, Upstream feedback |
| `skills/{code,harness,journey,docs}-health` | a finding whose subject is a claude-tweaks skill routes to D5, not a project issue — applies only where the plugin is a dependency, not the project |
| `skills/build/SKILL.md` Step 4.5, `skills/review/SKILL.md` lens 3a | producers; cite the contract |
| `docs/skill-graph.md` | edges for `/feedback` |
| `README.md`, `skills/help/` | command reference and workflow diagram |

## Auto-mode posture

**D4 and D5 are never auto.** Both stage to `staged/` and surface at the
Wrap-Up Review Console. Neither is eligible for the `unattended-tier` opt-in.

Rows are added to `_shared/auto-mode-contract.md`'s "What `auto` does NOT
silence" table (line 137), following that file's own change checklist at line
215. The two rationales differ and both belong in the contract:

- **D5** publishes privately-derived content to a public repository. Outward-facing
  and effectively irreversible — the same category as work-record creation.
- **D4** is cross-project *and* always-loaded. A wrong memory silently degrades
  every future session in every project the user works in. That is the largest
  blast radius of the five destinations, larger than D1.

## Testing

- **Classifier fixtures.** Freeze a representative sample of real memory
  descriptions as a test fixture and assert the D5-vs-D4 split. Frozen, not read
  live: `[IL-80]` — a test that reads production content you intend to change is
  a scheduled failure timed to the migration.
- **Self-reference detector.** Given a remote URL, does D5 collapse to D1/D2/D3?
- **Dedup.** Rides on existing `bin/lib/health-core/tests/`. No new suite unless
  new code appears — and if a `bin/lib/<name>/tests/` directory is added, its glob
  must be added to `package.json`'s test script (`[IL-84]`).

## Deferred

| Item | Why deferred |
|---|---|
| Backfilling the existing memories and Don'ts | Classifier should prove itself on live traffic first |
| Eval coverage for the classifier | Issue #115 records `assess-agent-autonomy` shipping four judgments with no eval coverage. This spec would repeat that pattern one release later; flagged explicitly rather than silently omitted |
| Retirement/demotion loop — finding the same lesson in two stores, expiring rules that stopped earning their cost | `harness-health`'s rule-expiry check covers Don'ts only. Extending it across all five destinations is the natural next spec |

## Release

Feature addition — minor version bump in `.claude-plugin/plugin.json`, mirrored
in the marketplace repository per CLAUDE.md's "Releasing (two repos)" section.

Per that section and `[IL-12]`, the version number is claimed by whatever ships
first. Before bumping: `git fetch origin main`, check
`git log --oneline -5 origin/main -- .claude-plugin/plugin.json`, grep unexecuted
plans under `docs/superpowers/plans/` for version literals, and check every
sibling worktree branch — three were live at the time of writing
(`fix-132-routine-branch`, `fix-134-gitexec-timeout`, `plan-c-task2`). Re-check
after any long pause; parallel sessions ship mid-run.
