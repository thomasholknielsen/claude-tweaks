# Harness Health v2 — Self-Declared Budgets, Unscoped-Rule Detection, and Local-Only Memory Health

**Date:** 2026-07-09
**Status:** Approved (brainstorm 2026-07-09)
**Origin:** A session in another project running claude-tweaks surfaced real harness-drift evidence: an unscoped `.claude/rules/dont-list.md` grown to 76 items against a hand-maintained "≤60" budget that had itself gone stale (claimed "47, pruned from 72" — no longer true); a second unscoped rule (`turborepo-boundaries.md`) loading in full every session; harness-health's own CLAUDE.md line-budget check hardcoded against the generic 150-line default instead of the project's own explicitly-raised 250; and — outside harness-health's scope entirely — a 29-entry memory directory where 100% of index lines exceeded the format budget, two entries stated facts that were actively wrong (a fix described as "pending" that had shipped; a Routine trigger ID that 404s), and several memories duplicated checked-in skill/rule content. This design closes three gaps the transcript exposed.

## Problem

Three distinct gaps, one root cause (nothing mechanically enforces a budget or structure once documentation exists — humans and the LLM judge both drift):

1. **No project-declared budget plumbing.** Harness-health's CLAUDE.md line-budget check (`_shared/harness-health-analysis.md` Step 1, check 4) is hardcoded to 150 lines. A project that legitimately needs more (and says so) gets checked against the wrong number. Worse, when a project invents its own governance doc to declare a budget (as the other project did with `claude-configuration.md`), that doc's own self-reported counts ("currently 47, pruned from 72") drift the moment reality changes, because nothing recomputes them.
2. **The highest-leverage bloat class has no mechanical check.** A `.claude/rules/*.md` file with no `paths:` frontmatter loads in full every session, identically to CLAUDE.md — but unlike CLAUDE.md it has no budget check at all, and its missing `paths:` key is itself an undetected violation of `rules-template.md`'s own contract ("Only create rules for conventions that are path-specific").
3. **Memory is architecturally excluded, but rots identically.** `docs/superpowers/specs/2026-07-06-harness-health-design.md` deferred memory audit for sound reasons (outside the repo, no git churn signal, not reachable from a cloud Routine's execution environment). Those constraints are still real — but the transcript shows memory decaying exactly like everything already in scope: format-budget violations, actively-wrong facts sitting in an always-loaded index, duplication with checked-in docs. It needs a design that respects the original constraints (never expected to run headless) while still closing the gap for interactive, local use.

## Scope

**In scope:**
- Generalize `.claude-tweaks/policy.yml` reading from a single-purpose parser to a flat-key reader; add two new harness-health budget keys.
- New Step 1 mechanical evidence checks in `_shared/harness-health-analysis.md`: tiered line-budget (by load-frequency, not file kind), unscoped-rule structural check, self-referential count/date anti-pattern check, narrative-density heuristic.
- New `--kind memory` for `/claude-tweaks:harness-health`, reachable only via explicit invocation (structurally excluded from the unified rotation pool `listTargets` builds, and therefore never reachable through a bare Routine firing) — with its own lister, its own reduced evidence-check set, and its own apply-or-file posture.

**Explicitly deferred:**
- A promotion pipeline that auto-drafts a checked-in `docs/` runbook from a flagged memory file — this pass only flags the candidate in the finding's `reason` field; the human does the actual move.
- A single canonical "all policy.yml keys" reference doc — worth doing eventually (keys are currently documented ad hoc next to their own consumers), but out of scope here; the two new keys follow the existing ad hoc-but-consistent convention.
- General two-sided duplication detection between two checked-in files (rule vs. skill, skill vs. skill) — the memory-vs-checked-in-content check (Part 3) is narrower and tractable because memory is the only side that needs correcting; a symmetric detector is a harder, separate problem.
- Any change to `design-artifact` handling — unaffected by this design.

## Part 1 — Policy plumbing

`bin/lib/policy.js` currently exports one single-purpose function, `isWorktreeAlwaysOn(repoRoot)`, matching one exact regex line. Generalize to a flat-key reader:

```js
function readPolicy(repoRoot) {
  const raw = readPolicyFile(repoRoot);
  if (!raw) return {};
  const result = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([\w.-]+):\s*(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

function getPolicyValue(repoRoot, key, defaultValue) {
  const policy = readPolicy(repoRoot);
  return Object.prototype.hasOwnProperty.call(policy, key) ? policy[key] : defaultValue;
}

function getPolicyNumber(repoRoot, key, defaultValue) {
  const raw = getPolicyValue(repoRoot, key, null);
  if (raw === null) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function isWorktreeAlwaysOn(repoRoot) {
  return getPolicyValue(repoRoot, 'worktree.always', 'false') === 'true';
}
```

`isWorktreeAlwaysOn`'s existing three call sites (`bin/lib/hooks/pre-tool-use.js`, `bin/lib/hooks/worktree-detect.js`, `bin/lib/hooks/session-start.js`) are unchanged — same function name, same signature, reimplemented on top of the generic primitive. Not a compatibility shim; it's the natural reuse of a more general function.

New keys, read via `getPolicyNumber`:
- `harness-health.always-loaded-budget: <n>` — default `150` (preserves today's hardcoded behavior when the key is absent).
- `harness-health.scoped-rule-budget: <n>` — default `30`.

Documented alongside the checks that read them (Step 1 of `_shared/harness-health-analysis.md`), matching how `worktree.always`/`execution.always` are already documented next to their own consumers rather than in one central registry.

## Part 2 — Tiered budget & structural checks (`_shared/harness-health-analysis.md` Step 1)

**Core reframe:** budget scales with how unconditionally a file loads, not with what kind of file it is. Two tiers:
- **Always-loaded tier** — CLAUDE.md, and any `.claude/rules/*.md` file whose `paths:` frontmatter is absent or empty. `bin/lib/harness-health/scope.js`'s existing `parseRulePaths` already returns `[]` for exactly this case — the signal already exists, it is simply never checked against a budget today. Budget: `harness-health.always-loaded-budget` (default 150).
- **Scoped tier** — any rule with a non-empty `paths:` list. Budget: `harness-health.scoped-rule-budget` (default 30 — a starting point this design introduces, not a figure `rules-template.md` already states; tune from real findings the same way the narrative-density threshold below does).

This collapses three separate concerns from the transcript (CLAUDE.md's line budget, a generic rule line budget, and `dont-list.md`'s own separate *item*-count budget) into one mechanical check: a well-formed terse list and a narrative-bloated one differ mainly in lines-per-item, so a line-count budget catches both without a separate item-counter.

New/modified Step 1 checks:

1. **Tiered line-budget check** (replaces today's CLAUDE.md-only check 4): `wc -l` the target, classify its tier per the rule above, compare against the resolved budget. Over budget → mechanical, high-confidence `template-conformance` finding.
2. **Unscoped-rule structural check** (new, cheap — frontmatter-only, no full-body read needed): any rule where `parseRulePaths(content).length === 0` is a mechanical, always-high-confidence `template-conformance` finding on its own, independent of line count, citing `rules-template.md`'s "path-specific only; project-wide belongs in CLAUDE.md" contract. A 10-line unscoped rule still gets flagged — it is a structural violation regardless of size, just a cheap one to fix.
3. **Self-referential count/date check** (new, regex, any kind): patterns like `as of \d{4}-\d{2}-\d{2}`, `currently \d+ (items?|entries|rules)`, `pruned from \d+` are mechanical evidence for a `best-practice` finding — a hand-typed count/date claim will drift by construction; recommend removing it or replacing it with a pointer to a live check (`/claude-tweaks:harness-health --target <name>`) instead of a hardcoded number.
4. **Narrative-density heuristic** (new, approximate — feeds the *existing* qualitative dimension 8 judgment, not a new hard gate): for a file or section whose stated shape is a terse list (a rule file's body; a `## Don'ts`-style section), compute average words-per-bullet-line. Above a threshold (start at 40 words/bullet, tune from real findings) is evidence pointing the judge at specific bullets worth tightening — an anchor, per the file's existing "Anchor Requirement" principle, not a verdict on its own.

All four are new *evidence*, consumed by the existing Step 2 (8-dimension check) and Step 5 (Verify Gate) unchanged — dimensions 7/8 already cover template-conformance and best-practice, so no new judgment machinery is needed.

**`rules-template.md` and `claude-md-template.md` updates:** state the tiered-budget model explicitly, and note both budgets are project-configurable via `.claude-tweaks/policy.yml`, replacing today's flat "under 150 lines" language.

## Part 3 — Local-only memory health (`--kind memory`)

**Structural guarantee, not a documented convention.** `bin/lib/harness-health/scope.js`'s `listTargets(root)` aggregates `listSkills` + `listRules` + `listClaudeMd` + `listDesignArtifacts` — the pool a bare `next-target` call (no `--kind`) rotates over, which is exactly what `routine-template.yml`'s headless firing issues (`prompt: "/claude-tweaks:harness-health"`, no arguments at all). A new `listMemory(root)` function is added but **never merged into `listTargets`'s aggregate.** The CLI only calls it via a separate branch, taken exclusively when `--kind memory` is explicitly the requested kind. This means a bare Routine firing cannot select a memory target by construction, regardless of whether the Routine's execution sandbox could even reach `~/.claude/projects/{slug}/memory/` — the exclusion holds even if that filesystem constraint ever changed. This fulfills the "still support memory tweaks when running locally" requirement: `/claude-tweaks:harness-health --kind memory` (optionally with `--target <name>`) is the explicit, human-typed, interactive-only entry point.

**Memory root resolution.** `~/.claude/projects/{slug}/memory/`'s slug is derived from the *main checkout's* absolute path, not from whatever directory harness-health happens to run in. Since this project runs under `worktree.always`, every real invocation happens from inside a worktree — resolving the slug from `root` directly (a worktree's own path) would compute a distinct, nonexistent slug and silently find nothing. `listMemory` must resolve the project directory via `git rev-parse --git-common-dir`'s parent (the main checkout), not `git rev-parse --show-toplevel` (the current worktree) — confirmed by direct comparison: from inside a worktree of this repo, `--show-toplevel` yields the worktree path, while `--git-common-dir`'s parent yields the main checkout path, and only the latter matches the slug this session's own memory directory actually uses.

**Selection.** `listMemory(root)` enumerates `MEMORY.md`'s entries for the current project's memory directory (resolved per the rule above) as target candidates (`{ kind: 'memory', id, path }`). A parallel `selectMemoryTarget` runs only Phase 1 of `selectTarget`'s existing algorithm (force-pick anything unaudited past `STALE_DAYS`) — no Phase 2 hotspot/churn scoring, since memory has no git signal, matching the original design doc's own reasoning. `why` is therefore always `stale` or `manual`, never `hotspot`.

**Step 1 evidence checks for `kind: memory`** — new, but reusing existing primitives pointed at memory content rather than inventing new mechanics:
1. **Index line-length check** — each `MEMORY.md` bullet against a fixed 150-char budget, matching the memory system's own already-documented convention verbatim. Not project-configurable via `.claude-tweaks/policy.yml` like Part 2's budgets — this convention is a cross-project harness constant set by the memory system itself, not a per-project stylistic choice.
2. **Fact-currency check** — extract concrete, checkable claims from the memory file body (referenced paths, specific IDs, status words like "pending"/"shipped"/"scheduled", dated claims) and verify against git log / filesystem / the referenced resource. Where the claim is a referenced path, this *is* Step 1's existing stale-example check, unmodified — just pointed at a memory file's body instead of a skill's. Where a claim genuinely cannot be checked mechanically, skip it — the same "opportunistic assist" caveat Step 1 already states for checks 1–2.
3. **Duplication-with-checked-in-content check** — grep the memory file's distinctive phrases (named files, functions, specific facts) against skill/rule content; overlap above a threshold is evidence for a `drift`-category finding recommending the memory entry shrink to a pointer/reference.
4. **Runbook-shape heuristic** (informational only, per the "detect + fix in place" scope decision) — count fenced code blocks / shell-command-looking lines; above a threshold, the finding's `reason` field notes "reads like an operational runbook, consider promoting to `docs/`" — no automated doc creation this pass.

**Apply-or-file posture.** Additive+high-confidence+high-reversibility findings (trim an index line to budget, correct a fact the fact-currency check demonstrably contradicts) apply directly via `Edit` — no `git commit` step, since a memory file is not part of this repo's git tree at all. Restructural findings (delete, merge two overlapping memories, "consider promoting") always surface to the human for a decision — the same posture CLAUDE.md findings already get, for a related but distinct reason: an always-loaded index is high-reach either way, but memory's reach is persistence across sessions rather than governing every future session's behavior.

**Cursor/cache.** `recordAudit`/`readCursors` are unchanged — a memory target's cursor key is namespaced `memory:<id>`, written to this repo's own `.claude-tweaks/harness-health/cursors.json`, exactly like every other kind. "When was this last audited" is a per-project concern regardless of where the audited file physically lives; no new storage location is needed.

**`harness-health/SKILL.md` updates:** add `--kind memory` to Input; replace the current "Not for auditing memory... out of scope" line with: "Memory (`~/.claude/projects/{slug}/memory/`) is reachable only via explicit `--kind memory` — never through the automatic rotation a scheduled Routine uses, since memory lives outside the repo with no git churn signal and is not expected to be reachable from a Routine's execution environment." Add an Anti-Patterns row: "Folding memory into `listTargets`'s default pool" → "A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate code branch), not a documented convention alone."

## Testing approach

- `tests/policy.test.js`: extend for `readPolicy`/`getPolicyValue`/`getPolicyNumber` (missing file, missing key, non-numeric value, present override), plus a regression test that `isWorktreeAlwaysOn`'s behavior is unchanged.
- `bin/lib/harness-health/tests/scope.test.js`: tiered-budget classification (a rule with empty `paths:` → always-loaded tier; a rule with globs → scoped tier), and a new `listMemory`/`selectMemoryTarget` suite covering stale-only selection (no hotspot phase) — and, critically, a test asserting `listTargets(root)`'s output never includes a `kind: 'memory'` entry, so the "never auto-selected" guarantee has a regression test, not just a design intent.
- `bin/lib/harness-health/tests/validate-finding.test.js`: extend `assetType` enum validation to accept `memory`; extend fingerprinting tests for the new asset type.
- The four new Step 1 checks (tiered budget, unscoped-rule, self-referential count, narrative-density) are prose-level judge instructions, not unit-testable code — verified via `--dry-run` runs during development, the same convention the rest of `_shared/harness-health-analysis.md` already established.

## Explicitly out of scope
- Memory-to-docs promotion pipeline (flagging only, this pass).
- A single canonical "all policy.yml keys" reference doc.
- General two-sided duplication detection between two checked-in files (rule vs. skill, skill vs. skill).
- Any change to `design-artifact` handling.
