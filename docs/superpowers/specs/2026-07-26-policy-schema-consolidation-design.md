# Policy Schema & Auto-Mode-Policy Consolidation — Design

## Origin

External feedback (generated against v6.17.0) flagged three gaps: project maturity never
becoming machine-readable, `.claude-tweaks/policy.yml` having no schema, and a cloud/Routine
parity script pattern worth upstreaming. Verifying the first claim against the current codebase
found it partially stale — `project.maturity` has been a real `policy.yml` key since v6.16.3,
read directly by `/claude-tweaks:build` and `/claude-tweaks:specify` — but a full audit of every
`policy.yml`-eligible key confirmed the narrower, still-true point underneath it: none of the
other 21 levers scale with maturity, and no schema/index exists for any of them. This spec covers
the schema gap. Maturity-linked defaults are a separate follow-on spec. The cloud/Routine parity
rewrite is a third, independent spec.

## Problem

An exhaustive audit of every `.claude-tweaks/policy.yml`-eligible key across `skills/**`,
`bin/**`, and `tests/**` found 22 distinct project-config levers with three compounding problems:

1. **No schema.** No file indexes all 22 keys the way `_shared/work-record.md`'s Config Keys
   table indexes the work-record system's keys. Each lever is documented only inside its own
   consumer skill's file, so there's no single place to see what exists, what it defaults to, or
   who owns it.
2. **A stale general rule.** The auto-mode-contract states generically that "project policy lives
   in CLAUDE.md or `.claude-tweaks/policy.yml`," and `flow/manifesto.md` (the resolution point for
   8 of these levers when running inside a `/flow` pipeline) already implements that dual-read.
   But a handful of skills that read these same levers **standalone**, outside any pipeline run,
   read CLAUDE.md only and never check `policy.yml` — e.g. `tidy/SKILL.md:173`
   (`tidy-aggressiveness`) and `build/plan-audit.md:30` (`scope-creep`). The documented contract
   and the standalone-read behavior disagree.
3. **Template bloat contradicting its own stated principle.** `skills/init/claude-md-template.md`
   unconditionally writes an ~13-line `## Auto-mode policy` block into every generated CLAUDE.md,
   with every one of 8 levers spelled out at its default value — even though the section eleven
   lines above it states the opposite principle verbatim: *"Override skill-level defaults here.
   Omit any setting to use its default."* Every claude-tweaks-initialized project pays this
   context-window cost on every session, for values that are, by definition, never customized.

## Goals

- One canonical schema doc covering all 22 levers: name, canonical home, owner skill(s), default,
  meaning.
- `policy.yml` becomes the canonical home for all 22 levers (CLAUDE.md remains a legacy fallback
  for values already written there — no breaking change for existing projects).
- `/init` stops writing default-valued lever lines into new CLAUDE.md files.
- Existing projects (including this repo's own CLAUDE.md) get an opt-in migration path via
  `/init` Update Mode.
- A small deterministic function, shared by `/init` and `/harness-health`, flags unrecognized keys
  and malformed values — never "should this be set," which is judgment, not validation.

## Non-goals

- Deciding which levers *should* scale with `project.maturity`, or what those recommended values
  would be — that's the maturity-linked-defaults follow-on spec.
- The cloud/Routine parity Step 13 rewrite — fully independent subsystem, separate spec.
- Migrating `worktree.always` — it's already `policy.yml`-exclusive (`bin/lib/policy.js` never
  reads CLAUDE.md), no change needed.
- Extending dual-read to `merge-check` / `scope-keywords-required` / `work-backend` / `work-types`
  / `promise-register-min-leaves` — confirmed CLAUDE.md-only by design (work-record system and
  general skill defaults), not part of the 22-lever audit scope.

## Architecture

Two new files follow this repo's existing "prose twin" pattern (`work-record.md` ↔
`bin/lib/issues/record.js` — "if the two disagree, one of them has a bug, fix don't fork"):

- **`skills/_shared/policy-schema.md`** — canonical human-readable reference. One table, all 22
  levers, columns `Key | Canonical home | Owner skill(s) | Default | Meaning`. Static reference,
  no per-project state, same nature as `work-record.md`'s Config Keys table.
- **`bin/lib/policy-schema.js`** — the same 22 keys as a small data array (name, expected
  type/enum, default), plus `auditPolicy(repoRoot)`, a deterministic function with no LLM
  judgment. Reads the project's `.claude-tweaks/policy.yml` and CLAUDE.md and returns:
  ```js
  {
    unrecognizedKeys: [],      // keys present in policy.yml not in the schema (typo/stale)
    invalidValues: [],         // recognized keys whose value fails its documented type/enum
    legacyClaudeMdLevers: [],  // known lever lines found in CLAUDE.md, each tagged
                               // { key, value, matchesDefault: bool }
  }
  ```

`legacyClaudeMdLevers` is deliberately the only judgment-adjacent field, and even it's mechanical:
"does this line's value string-match the schema's documented default" is a lookup, not an opinion.

### Consumers

| Consumer | Uses |
|---|---|
| `/claude-tweaks:init` Update Mode | Calls `auditPolicy()`; offers the CLAUDE.md → `policy.yml` migration (see below) using `legacyClaudeMdLevers`; surfaces `unrecognizedKeys`/`invalidValues` as a drift item |
| `/claude-tweaks:harness-health` | New standalone step (not part of the per-target rotation in `harness-health-analysis.md` — this isn't semantic drift, it's a validation check with no natural `assetType` slot in that finding shape). Calls `auditPolicy()`; files a low-severity issue only for non-empty `invalidValues`/`unrecognizedKeys`. Never files for `legacyClaudeMdLevers` alone — that's `/init`'s interactive migration to offer, not something to force through an unattended Routine's issue queue |

### Why this isn't shoehorned into `harness-health-analysis.md`'s finding shape

That shared judge produces `patch`/`new-skill` findings with `confidence`/`classification`/
`reversibility` for LLM-judged semantic drift in skill/rule/CLAUDE.md prose. A key being
unrecognized or a value failing its enum is a yes/no mechanical fact, not a judgment call, and
`policy.yml` isn't a natural fit for the existing `assetType` enum (`skill | rule | claude-md |
design-artifact | memory`). Keeping the audit as a plain function call sidesteps forcing a new
`assetType` into a contract three other consumers already depend on.

## The dual-read fix (8 levers)

`unattended-tier`, `scope-creep`, `overlap`, `design-intent`, `leftover-default`,
`auto-fix-threshold`, `review-severity-floor`, `tidy-aggressiveness` — the levers currently
generated into CLAUDE.md's "Auto-mode policy" block. `flow/manifesto.md` already resolves these
correctly (policy.yml-or-CLAUDE.md) for any pipeline run. The fix is scoped to each lever's
**standalone** direct-read site (a skill reading the value when invoked outside a `/flow`
pipeline) — update each to check `policy.yml` first, then CLAUDE.md, matching the Manifesto's
existing behavior. Enumerating every exact standalone read-site is implementation-plan work (grep
each lever name across `skills/**` and classify Manifesto-mediated vs. direct reads); this design
fixes the principle, not the line-by-line list.

## Generator fix (`claude-md-template.md`)

Delete the "Auto-mode policy" fenced sub-block (8 lines + header + explanatory comment, ~13 lines
total) from the generated CLAUDE.md template. New projects get nothing here — omitting a lever
already means "use the default." Leave the existing commented-out `# auto-mode: default-on` line
untouched (opt-in, zero cost, discoverable, and it isn't part of the 8-lever block this spec is
removing).

## Migration (`/init` Update Mode)

New step, using `auditPolicy()`'s `legacyClaudeMdLevers` output. For each lever line found in
CLAUDE.md:

- **Matches its documented default** → recommend **delete**. Pure cleanup, zero behavior change
  (dual-read already falls through to the same default either way).
- **Differs from default** → recommend **move to `policy.yml`**: append the line there, remove it
  from CLAUDE.md. Preserves the override.

Presented via this repo's standard batch-table convention: recommendations pre-filled, one
`AskUserQuestion` call with "Apply all recommended / Override specific items / Skip entirely."
Runs once per `/init` Update Mode invocation; a project with nothing to migrate sees no prompt
(same "don't render an empty decision" rule Step 13's cloud-parity gate already follows). Applies
equally to this repo's own CLAUDE.md, which carries the exact block being retired.

## Error handling

- **`review-diff-heuristic-thresholds` gets presence-only validation, not deep value checking.**
  Its documented shape (`{high: {files, lines}, medium: {files, lines}}`) is a nested object, but
  `bin/lib/policy.js`'s own header comment states `policy.yml` supports only flat `key: value`
  lines — and `review/SKILL.md:258` documents the shape without ever specifying a literal flat-line
  encoding for it. That's a pre-existing gap in the current codebase, not something introduced
  here, and inventing a nested-value encoding is a separate design decision outside this spec's
  scope. `auditPolicy()` therefore validates every other key's value against its documented
  type/enum, but for this one key only checks that the key name is recognized — `invalidValues`
  never fires for it.
- Malformed `.claude-tweaks/policy.yml` (fails the existing flat `key: value` line parse) →
  `auditPolicy()` returns `unrecognizedKeys: []`, `invalidValues: []`, treats the file as absent
  for schema-checking purposes rather than throwing. Matches `bin/lib/policy.js`'s existing
  fail-open behavior for `worktree.always`.
- A CLAUDE.md lever line with a value outside its documented enum (not just "differs from
  default," but genuinely invalid, e.g. `tidy-aggressiveness: extreme`) → surfaces in
  `invalidValues`, not `legacyClaudeMdLevers`'s matchesDefault path; `/init`'s migration prompt
  flags it distinctly ("this value isn't recognized — fix or remove it") rather than silently
  offering to move a broken value into `policy.yml`.

## Testing

- `bin/lib/policy-schema/tests/*.test.js` (new, mirrors `bin/lib/issues/tests/` layout): unit
  tests for `auditPolicy()` — recognized key with valid/invalid value, unrecognized key, absent
  file, malformed file, each of the 8 legacy levers at-default and overridden, mixed CLAUDE.md +
  `policy.yml` content.
- Existing `tests/policy.test.js` is untouched — `worktree.always` mechanics don't change.
- No new integration test for the `/init` migration step or `/harness-health`'s new step — both
  are LLM-executed skill prose consuming a well-unit-tested function, consistent with how this
  repo tests its other Node-helper/LLM-prose boundaries (e.g. `bin/code-health.js` has unit tests;
  the skill prose invoking it doesn't).
