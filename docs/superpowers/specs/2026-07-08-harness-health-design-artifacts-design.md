# Harness-Health: Design Artifact Staleness Detection — Design

**Status:** Approved
**Author:** Claude (session-driven design), approved by Thomas Holk Nielsen

## Problem

`/impeccable:impeccable init` and `/impeccable:impeccable document` write `PRODUCT.md` (strategic context: audience, brand voice, anti-references) and `DESIGN.md` (visual system: colors, typography, components) at the project root, during `/init`'s design-integration bootstrap (`skills/init/bootstrap-steps.md` lines 300-370). These files are not one-off scaffolding — `/design pre-build` mode (`skills/design/modes/pre-build.md`) reads them into the build subagent's context on every frontend spec, so they are load-bearing project state that actively shapes how code gets written.

Nothing currently notices when they've gone stale. The only refresh path is a human manually re-running `/init` in Update Mode, at which point `bootstrap-steps.md:363` "offers" to re-run `init` + `document` — purely reactive, and only if someone decides to re-run `/init` at all. A project can drift its component library, color system, or brand positioning for months while `PRODUCT.md`/`DESIGN.md` silently keep informing every build with outdated context, and nothing surfaces this.

`/harness-health` already solves exactly this class of problem for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — a churn/staleness-based rotation (`bin/lib/harness-health/scope.js`'s `selectTarget`) that picks the next target to audit, judges it, and either auto-applies a safe patch or files a GitHub issue. This design extends that same rotation to `PRODUCT.md`/`DESIGN.md`.

## Goal

Add `PRODUCT.md`/`DESIGN.md` as a new target kind in harness-health's existing rotation, reusing its churn/staleness engine, cursor/dedup cache, and issue-filing pipeline — with the smallest schema footprint that fits.

## Non-Goals

- **No "file was never generated" detection.** If `design-integration: enabled` but `PRODUCT.md`/`DESIGN.md` don't exist at any canonical or fallback path, `listDesignArtifacts` simply omits that candidate — it never surfaces as a target. That gap belongs to `/init`'s bootstrap step (the thing that should have generated the file in the first place), not to a staleness-detection feature whose job is auditing files that exist.
- **No per-kind `STALE_DAYS` override.** `PRODUCT.md` (brand/audience content, changes slowly) and `DESIGN.md` (visual system, tracks code churn) both use the existing global `STALE_DAYS = 90` for v1. There's no usage evidence yet that brand content needs a longer cadence — introducing a config knob on a guess is premature.
- **No auto-regeneration**, even for `DESIGN.md`, despite it being more mechanically derivable (a codebase scan) than `PRODUCT.md` (an interactive interview). Both `assetType: 'design-artifact'` findings always file as a GitHub issue, mirroring the existing CLAUDE.md carve-out — regeneration should get human eyes before landing, regardless of how automatable the underlying command is.
- **No new finding `kind`.** Design-artifact staleness reuses the existing `kind: "patch"` shape (see Architecture Decision below) rather than inventing a new one.

## Architecture Decision: Reuse `kind: "patch"`, Don't Invent a New Kind

A design-artifact staleness finding fits the existing `patch` shape without distortion:
- `oldString` — the staleness evidence (days since last audit, or churn count + domain paths touched).
- `newString` — the fix (the literal command to run: `/impeccable:impeccable init` or `/impeccable:impeccable document`).
- `section` — a fixed value, `"Freshness"`, for every design-artifact finding (there's no real document section being patched; this keeps the field populated and consistent).

This means `bin/lib/harness-health/issue-payload.js`'s existing Current/Proposed rendering (`kindLine`, `deliverables`, `title` — all built from `finding.kind !== 'new-skill'`'s existing branch) works completely unchanged. The only schema change is adding `'design-artifact'` to `ASSET_TYPE_VALUES` (`validate-finding.js`) and `ASSET_TYPE_LABELS` (`issue-payload.js`). No new `KIND_VALUES` entry, no new required-field branch in `validate-finding.js`.

`category: "drift"` — no new category value needed; "the artifact has drifted from what it should reflect" is semantically accurate and reuses existing vocabulary. `classification`/`confidence`/`reversibility` are populated for schema validity and issue labeling but don't gate behavior here, since design-artifact findings always file regardless of their values (see Step 7 change below) — convention: `classification: "restructural"` (not a safe additive text patch), `reversibility: "high"` (old content survives in git history; re-running the command is easily undone).

## Changes

### 1. `bin/lib/harness-health/scope.js` — new `listDesignArtifacts(root)`

Near-copy of the existing `listClaudeMd` pattern (a single-item-per-artifact list, existence-gated):

1. Read `<root>/CLAUDE.md`. There is no existing Node utility for this in `bin/` — the design wrapper's own flag read (`skills/design/SKILL.md:70`) is pure LLM prose, not code. Parse with a small dedicated regex, in the same spirit as this file's existing `parseRulePaths` (a targeted line-scan, not full markdown parsing): match `/^design-integration:\s*(\S+)/m` anywhere in the file content. If CLAUDE.md doesn't exist, is unreadable, or the regex doesn't match, treat as `disabled` (matches the wrapper's own documented "missing flag = disabled" rule at `skills/design/SKILL.md:70`). If the captured value is not exactly `enabled`, return `[]` immediately — `plugin-only` and `disabled` both skip.
2. For each of `PRODUCT.md`/`DESIGN.md`, resolve its path via the same canonical-then-fallback order `skills/design/modes/pre-build.md` already documents: project root first, then `docs/design/*.md` / `docs/PRODUCT.md` / `docs/DESIGN.md` as fallback. A file absent at both locations is simply omitted from the returned list (not an error, not a separate "missing" finding — see Non-Goals).
3. Return `{ kind: 'design-artifact', id: 'PRODUCT' | 'DESIGN', path, pathGlobs }` — reusing the exact field name `rule` candidates already carry (`pathGlobs`), not a new parallel field, for reasons below:
   - `id: 'PRODUCT'` → `pathGlobs: []` (no churn proxy — see Architecture rationale in Problem section; Phase 2 of `selectTarget` already skips any candidate with zero churn, so this candidate is only ever picked via Phase 1's flat staleness timer).
   - `id: 'DESIGN'` → `pathGlobs` = the same frontend-signal git pathspecs `/init`'s bootstrap already uses for frontend detection (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `components/`, `pages/`, `app/`, `routes/`, `views/`, `ui/`) — reuses `domainChurn()`'s existing glob-pathspec support unchanged (the function comment already documents it accepts "exact file paths... or glob pathspecs").

Add `...listDesignArtifacts(root)` to `listTargets()`'s aggregation (alongside the existing `listSkills`/`listRules`/`listClaudeMd` spread). `next-target`, `churn-report`, and `mark` (`bin/harness-health.js`) all consume `listTargets()`/`selectTarget()` generically already — zero changes needed in those code paths for this new kind to participate in rotation, dedup, and cursor tracking.

**Required companion fix — `selectTarget`'s Phase 2 domain-path branch.** `selectTarget` currently decides which path list to churn-check with `candidate.kind === 'rule' && candidate.pathGlobs.length > 0 ? candidate.pathGlobs : extractDomainPaths(content)` — a hardcoded `kind === 'rule'` check. Without widening this to `(candidate.kind === 'rule' || candidate.kind === 'design-artifact')`, a `design-artifact` candidate's curated `pathGlobs` would be silently ignored in favor of `extractDomainPaths(content)` scraping backtick-quoted references out of `PRODUCT.md`/`DESIGN.md`'s own prose — coincidentally near-functional at best, broken at worst, and never what this design intends. This is why the field is named `pathGlobs`, matching `rule`'s existing field exactly, rather than a new `domainPaths` name: one shared field, one shared branch, widened by one `||` clause.

### 2. `bin/lib/harness-health/scope.js` — `selectTarget` returns two new fields

`selectTarget`'s Phase 1 (stale) and Phase 2 (hotspot) branches already compute `daysSince` and `churn` internally but only use them for comparison — they aren't part of the returned object. Add both to the return value for every kind (not design-artifact-specific — a small, generically useful enrichment):
- Phase 1 (`why: 'stale'`) return: add `daysSinceLastAudit: daysSince` (rounded to an integer).
- Phase 2 (`why: 'hotspot'`) return: add `churnCount: scored[0].churn`.

Skill/rule/claude-md findings continue to ignore these fields (their JUDGE procedure doesn't need them — the 8-dimension check reasons about file content, not about why the rotation picked the target). Design-artifact findings use them directly to construct `oldString` without shelling out to `git log` themselves.

### 3. `bin/lib/harness-health/validate-finding.js` — extend `ASSET_TYPE_VALUES`

```js
const ASSET_TYPE_VALUES = new Set(['skill', 'rule', 'claude-md', 'design-artifact']);
```

No other change to this file — `kind: "patch"`'s existing required-field branch (`section`, `oldString`, `newString`) already covers design-artifact findings correctly.

### 4. `bin/lib/harness-health/issue-payload.js` — extend `ASSET_TYPE_LABELS`

```js
const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context' };
```

No other change to this file — the existing `kind !== 'new-skill'` rendering branch (title, `kindLine`, Current/Proposed `deliverables`) already produces a correct issue for this asset type once the label resolves.

### 5. `skills/harness-health/SKILL.md` — new lightweight JUDGE branch (Step 3)

Add a `target.kind === 'design-artifact'` branch to Step 3, as an alternative to "Apply the full procedure in `_shared/harness-health-analysis.md`." This branch is **not** added to `_shared/harness-health-analysis.md` itself — that file is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target (they only ever judge skills from their own scoped read sets), so a design-artifact-specific procedure doesn't belong in the shared judge.

The branch is near-mechanical (no deep content judgment needed — unlike skill/rule/claude-md drift, "is this stale" is already fully decided by the rotation's `why` + numeric fields):

1. Map `target.id` to its regenerate command: `PRODUCT` → `/impeccable:impeccable init`, `DESIGN` → `/impeccable:impeccable document`.
2. Build `oldString` from `target.why`: `"Unaudited for {daysSinceLastAudit} days"` (stale) or `"{churnCount} commits touching {pathGlobs joined}, since last audit"` (hotspot).
3. Emit one `kind: "patch"` finding: `assetType: "design-artifact"`, `target: target.id`, `category: "drift"`, `section: "Freshness"`, `oldString` (from step 2), `newString: "Run {regenerate command}"`, `classification: "restructural"`, `confidence: "high"` (the staleness evidence is mechanical, not inferred), `reversibility: "high"`, `reason` (one sentence restating the staleness evidence), `description` (one sentence: re-run the command, confirm the regenerated content still matches the project's actual state, close the issue).

### 6. `skills/harness-health/SKILL.md` — Step 7 gets one new bullet

Mirroring the existing CLAUDE.md carve-out:

> If `payload.assetType === 'design-artifact'` — **always file it, regardless of classification/confidence/reversibility.** Regenerating means re-running an interactive interview (`init`) or a full codebase scan (`document`), not a safe mechanical text patch — human review belongs before either lands.

### 7. `skills/harness-health/SKILL.md` — Input section

Extend the `--kind <skill|rule|claude-md>` documentation to `--kind <skill|rule|claude-md|design-artifact>`.

## Data Flow

```
next-target (bin/harness-health.js)
  → selectTarget (scope.js) — candidates now include listDesignArtifacts() output
  → { kind: 'design-artifact', id, path, why: 'stale'|'hotspot', daysSinceLastAudit?, churnCount? }

SKILL.md Step 3 (JUDGE)
  → target.kind === 'design-artifact' branch (new, lightweight, SKILL.md-local)
  → one kind:"patch" finding, assetType:"design-artifact"

validate-findings (existing CLI, unchanged logic — just a widened ASSET_TYPE_VALUES)
  → fingerprint, dedup, cursor record (existing generic cursor keying: `${kind}:${id}`)

Step 7 (APPLY or FILE)
  → assetType === 'design-artifact' → always file (new bullet)
  → gh issue create (existing payload rendering, unchanged — just a widened ASSET_TYPE_LABELS)
```

## Error Handling

| Failure | Behavior |
|---|---|
| `design-integration` flag missing or not `enabled` | `listDesignArtifacts` returns `[]` — no rotation impact, matches every other Impeccable integration point's Layer-1 gate |
| CLAUDE.md unreadable | Same as above — treat as `disabled` (matches the wrapper's own "missing flag = disabled" rule) |
| `PRODUCT.md`/`DESIGN.md` absent at all canonical + fallback paths | That candidate is simply omitted — not an error, not a finding (see Non-Goals) |
| Neither file present but `design-integration: enabled` | Both candidates omitted; rotation proceeds normally over remaining skill/rule/claude-md targets |
| Domain-path churn computation fails (git unavailable) | `domainChurn` already returns `0` on any failure (pre-existing behavior, unchanged) — the candidate simply won't win via hotspot, may still win via the flat staleness timer |

## Testing

Unlike the two prior threads in this series (prose-only skill markdown), this touches real Node code — real `node --test` coverage is required:

- `bin/lib/harness-health/tests/scope.test.js` — new cases for `listDesignArtifacts`: flag-gated (missing/disabled/plugin-only/enabled), canonical-path resolution, fallback-path resolution, `PRODUCT` gets empty `pathGlobs`, `DESIGN` gets the frontend-signal glob list, both feed into `listTargets()`'s aggregation, and the Phase 2 companion fix (`design-artifact`'s `pathGlobs` actually drives churn, not content-scraping).
- `bin/lib/harness-health/tests/scope.test.js` — new cases for `selectTarget`'s new `daysSinceLastAudit`/`churnCount` return fields, for both the stale and hotspot branches, across existing kinds (not design-artifact-specific, since the field addition applies uniformly).
- `bin/lib/harness-health/tests/validate-finding.test.js` — a `design-artifact` assetType is accepted; existing three values remain accepted (regression coverage).
- `bin/lib/harness-health/tests/issue-payload.test.js` — a `design-artifact` finding renders with the `"Design Context"` label in `kindLine`/`title`.
- `bin/lib/harness-health/tests/cli-next-target.test.js` — an end-to-end case: a project with `design-integration: enabled` and a stale `PRODUCT.md` surfaces it via `next-target --kind design-artifact`.

`npm test` must stay green (630/631 or 631/631 — the pre-existing `tests/statusline.test.js` timing flake is unrelated, documented in `specs/DEFERRED.md`).

## Open Items

None — the architecture decision (reuse `patch`, not a new `kind`) and all Non-Goals were resolved during brainstorming. No unresolved questions carried into the implementation plan.
