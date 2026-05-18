---
name: claude-tweaks:design
description: Use when a lifecycle skill (/test, /review, /build, /flow, /visual-review, /specify) needs to invoke Impeccable design-quality commands. Wrapper that encapsulates "when, how, and whether to invoke Impeccable" so caller skills don't have to know.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Design — Impeccable Integration Wrapper

Wrapper skill that encapsulates the Impeccable design-quality plugin behind a stable interface. Caller skills (`/test`, `/review`, `/build`, `/flow`, `/visual-review`, `/specify`) invoke a mode here; this wrapper handles detection, availability checks, dispatch, and graceful skips. Utility skill — no lifecycle position.

```
/claude-tweaks:capture → ... → /claude-tweaks:wrap-up
                  [ /claude-tweaks:design ] (utility, called by lifecycle skills)
                                ^^^^ YOU ARE HERE ^^^^
```

All six modes are active (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`) plus the `reset-recommendations` cache utility. The wrapper skips cleanly on non-frontend specs and missing dependencies. `polish` dispatches three categories — auto-fit, issue-driven, and intent-driven (the latter reads `design-intent:` frontmatter and dispatches creative commands per `command-map.md`). `survey` analyzes rendered UI or the full diff and produces ranked Creative Opportunities recommendations consumed by `/visual-review` and `/flow`'s pipeline summary.

**Three independent surfacing anchors** ensure creative commands cannot get buried:

1. **Polish-mode intent dispatch** — explicit `design-intent:` declarations auto-run the matching creative commands.
2. **`/visual-review` Creative Opportunities block** — `survey` recommendations rendered after the findings table from analyzed screenshots. Read-only.
3. **`/flow` pipeline summary Creative Opportunities block** — `survey` recommendations rendered before Next Actions from the full diff. Read-only. Decline tracking suppresses recommendations the user repeatedly ignored (2-decline threshold; reset via `/claude-tweaks:design reset-recommendations <spec>`).

## When to Use

- `/claude-tweaks:test` invokes `test` mode after the standard verification suite — runs `npx impeccable detect` as a frontend anti-pattern gate
- `/claude-tweaks:review` invokes `review` mode during code review — runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit` and surfaces findings advisorily
- `/claude-tweaks:build` invokes `pre-build` mode before implementation — lazy-loads design references into the build subagent's context
- `/claude-tweaks:specify` invokes `shape` mode before decomposition — runs `/impeccable:impeccable shape <topic>` and appends the output to the design doc
- `/claude-tweaks:flow` invokes `polish` mode after review passes — dispatches auto-fit + issue-driven + intent-driven Impeccable commands; modifies code
- `/claude-tweaks:visual-review` invokes `survey` mode after browser review — produces a Creative Opportunities recommendations block from the captured screenshots
- `/claude-tweaks:flow` invokes `survey` mode in the pipeline summary — produces a Creative Opportunities block from the full diff
- A user runs `/claude-tweaks:design <mode> <target>` directly to invoke a single mode without going through the lifecycle skill
- A user runs `/claude-tweaks:design reset-recommendations <spec>` to clear declined-recommendation tracking for a spec

## Input

`$ARGUMENTS` is parsed as `<mode> <target>`:

| Mode | Target | Behavior |
|------|--------|----------|
| `shape <topic>` | Topic name | Invokes `/impeccable:impeccable shape <topic>`; returns the output for the caller to append to the design doc |
| `pre-build <spec>` | Spec number or path | Lazy-loads relevant Impeccable reference files plus project's root `PRODUCT.md` + `DESIGN.md` (when present); returns the loaded file paths and an approximate context size |
| `test <files>` | Space-separated file list | Runs `npx impeccable detect --fast --json` on the files; returns pass/fail |
| `review <spec>` | Spec number or path | Invokes `/impeccable:impeccable critique` + `/impeccable:impeccable audit` on changed UI files; returns advisory findings; writes findings cache for `polish` mode to read |
| `polish <spec>` | Spec number or path | Dispatches auto-fit (`polish`/`clarify`/`harden`) + issue-driven (`typeset`/`layout`/`adapt`/`optimize`) + intent-driven (per `design-intent:` frontmatter) commands per `command-map.md`; modifies code |
| `survey <files>` | Space-separated file list, or `--screenshots <paths>` when invoked from `/visual-review` | Analyzes the diff (and screenshots when provided) and returns ranked Creative Opportunities recommendations; suppresses recommendations the user previously declined for the same spec; read-only |
| `reset-recommendations <spec>` | Spec number or path | Deletes the declined-recommendations cache for the spec; the next `survey` call surfaces all matching recommendations again |

When `<target>` is omitted for `test` mode, the wrapper resolves changed files via `git diff --name-only`. When omitted for `review` mode or `polish` mode, the wrapper falls back to the same git-diff resolution. `survey` defaults to the same git-diff resolution when called without files.

## Universal preconditions

Run these before dispatching to any active mode (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`).

**Mode-specific notes:**

- `shape` runs preconditions but skips Layer 2 — there is no spec yet (the caller is `/specify` working on a design doc, not a numbered spec). Layer 1 + availability still apply.
- `pre-build` runs all three detection layers and the LLM availability check — it touches Impeccable references but does not modify code.
- `polish` runs all three detection layers and the LLM availability check; on a successful precondition pass, it consumes audit findings written by `review` mode (see `modes/polish.md`).
- `survey` runs Layer 1 (kill-switch) and Layer 3 (file-extension sniff). Layer 2 applies only when a `<spec>` is resolvable from the file list (caller may pass it explicitly). Survey does not require Impeccable's LLM commands or CLI — it is a heuristic analysis local to the wrapper that *recommends* Impeccable commands. The availability check is informational only (an unavailable Impeccable surfaces in the recommendations as "install Impeccable to apply").
- `reset-recommendations` runs no preconditions — it is a cache-management utility, not a mode that invokes Impeccable.

### Step 1: Detection (3 layers, in order)

**Layer 1 — Kill-switch (CLAUDE.md flag):**

Read the project's CLAUDE.md and look for a `design-integration` field (typically under a `## Design integration` section). Values:

| Value | Behavior |
|-------|----------|
| `enabled` | Proceed to Layer 2 |
| `plugin-only` | Proceed to Layer 2 (LLM modes work; CLI mode falls through to availability check) |
| `disabled` | Return `{skipped: "design integration disabled"}` immediately |
| *(missing)* | Treat as `disabled` — return `{skipped: "design integration not configured (run /claude-tweaks:init to enable)"}` |

**Layer 2 — Spec frontmatter (if spec input present):**

When the mode received a spec number or path, read that spec's YAML frontmatter and look for a `surface:` field. Values:

| Value | Behavior |
|-------|----------|
| `frontend`, `mixed` | Proceed to Layer 3 (sniff still confirms changed files) |
| `backend`, `infra` | Return `{skipped: "non-frontend spec (surface declared)"}` |
| *(missing)* | Fall through to Layer 3 |

`/specify` writes `surface:` on every new spec. Pre-v4.5 specs lack the field; absent values are normal and gracefully fall through to Layer 3.

**Layer 3 — File-extension sniff (fallback):**

Inspect the files in the mode's target list (or the resolved `git diff` set). If any file matches a frontend trigger extension or path pattern, treat as frontend. If zero files match, return `{skipped: "non-frontend (sniff)"}`.

For the trigger extensions and path patterns, read `frontend-detection.md` in this skill's directory.

### Step 2: Availability check

For the dispatched mode, verify the dependency is available:

| Mode | Required | Verify by |
|------|----------|-----------|
| `test` | Impeccable CLI | Run `npx impeccable --version` via Bash. Exit 0 with version string → available. Non-zero or no output → unavailable. |
| `review` | Impeccable plugin (LLM commands) | Check whether `/impeccable:impeccable` skill resolves. Look for `/impeccable:impeccable*` in the available skills list provided by the harness. If none resolve, treat as unavailable. |
| `shape` | Impeccable plugin (LLM commands) | Same as `review` — checks for `/impeccable:impeccable*` skill resolution. |
| `pre-build` | Impeccable plugin (reference files) | Same as `review`. The reference files ship with the plugin; if the plugin resolves, the references are available. |
| `polish` | Impeccable plugin (LLM commands) | Same as `review` — `polish`/`clarify`/`harden` and the issue-driven commands all live in the plugin. |

On unavailable:

```
{
  "skipped": "Impeccable {CLI|plugin} not installed",
  "install_hint": "{install command + verify command}"
}
```

Install hints (use the appropriate one for the mode):

- **CLI:** `npm install -g impeccable` (verify with `npx impeccable --version`)
- **Plugin:** `/plugin install impeccable@<marketplace>` (verify by checking `/impeccable:impeccable` skill resolves)

**De-dupe:** Track availability-skip warnings via an in-memory marker for the session. If the same mode skips twice for the same reason in a session, surface only the first skip in the response and keep the rest silent. The marker is per-process (in-memory) — there is no on-disk state.

## Mode behaviors

Each mode's full procedure (steps, decision tables, output format) lives in its own sub-file. Read only the one you need.

### Mode: `test <files>` — Active

Runs `npx impeccable detect --fast --json` as a frontend anti-pattern gate. Errors fail the gate; warnings do not. Read `modes/test.md` in this skill's directory for the full procedure.

### Mode: `review <spec>` — Active

Invokes `/impeccable:impeccable critique` + `/impeccable:impeccable audit` and writes an audit cache for `polish` mode to consume. Returns advisory findings. Read `modes/review.md` in this skill's directory for the full procedure.

### Mode: `shape <topic>` — Active

Invokes `/impeccable:impeccable shape <topic>` and returns the output verbatim for `/specify` to append to the design doc. Read-only with respect to source code. Read `modes/shape.md` in this skill's directory for the full procedure.

### Mode: `pre-build <spec>` — Active

Lazy-loads Impeccable reference files plus the project's `PRODUCT.md` + `DESIGN.md` (when present) into the build subagent's context. Does not modify code — read-only enrichment. Read `modes/pre-build.md` in this skill's directory for the full procedure.

### Mode: `polish <spec>` — Active

Dispatches three categories: auto-fit (`polish`/`clarify`/`harden`), issue-driven (`typeset`/`layout`/`adapt`/`optimize`), and intent-driven (`bolder`/`quieter`/`distill`/`delight`+`animate`/`onboard`, dispatched per the spec's `design-intent:` frontmatter). **The only wrapper mode that modifies code** — callers must follow up with re-verification. See `command-map.md` in this skill's directory for the dispatch tables (auto-fit list, issue-driven category matching, intent-driven mapping). Read `modes/polish.md` in this skill's directory for the full procedure.

### Mode: `survey <files>` — Active

Read-only. Produces ranked Creative Opportunities recommendations from screenshots (`/visual-review`) or the full diff (`/flow`). Never invokes Impeccable commands — only suggests them. See `command-map.md` in this skill's directory for the "would help" criteria → command mapping. Read `modes/survey.md` in this skill's directory for the full procedure.

### Mode: `reset-recommendations <spec>` — Active utility

Cache-management utility. Deletes the declined-recommendations cache for a spec so the next `survey` call surfaces all matching recommendations again. The recommendations cache (`-recommendations.json`) is left in place — only the declined counter is cleared. Read `modes/reset-recommendations.md` in this skill's directory for the full procedure.

## Output contract

Every wrapper invocation returns one of two shapes:

| Shape | Trigger |
|-------|---------|
| `{mode, result, ...}` | Active mode dispatched and completed |
| `{mode, skipped, ...}` | Detection or availability check returned skip |

Callers must handle both. Skips are not failures — they are valid outcomes that mean "Impeccable doesn't apply here."

See `_shared/design-wrapper-handling.md` for the canonical caller-side contract — the full return-shape categories (`ok` / `pass` / `advisory` / `fail` / `skipped` / `deferred`) and the "why skips don't fail" rationale shared by every caller of this wrapper.

## Reference sub-files

Lazy-load these only when needed for the active mode:

- `modes/{name}.md` — One file per mode (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`), plus a procedure file for the `reset-recommendations` cache utility. Per-mode full procedure (steps, decision rules, output format).
- `command-map.md` — Single source of truth for dispatch tables: auto-fit / issue-driven / intent-driven categorization for all 23 Impeccable commands, plus the survey "would help" criteria → command mapping.
- `frontend-detection.md` — Trigger extensions and path patterns for Layer 3 sniff; pointer to the canonical `surface:` and `design-intent:` frontmatter spec (which lives in `skills/specify/spec-template.md`).
- `impeccable-cli.md` — Exact CLI invocation, JSON output schema, parsing rules.

## Next Actions

When invoked directly by a user (not from a lifecycle skill), look up the return shape in the table below, then surface the matching numbered options. When invoked from a caller skill, omit this block — callers consume the return value themselves.

| Return | Recommended follow-up |
|--------|----------------------|
| `test` pass / `review` advisory | `/claude-tweaks:review {spec}` (after test mode) or `/claude-tweaks:wrap-up {spec}` (after review) |
| `test` fail | Fix the flagged anti-patterns, re-run `/claude-tweaks:test` |
| `shape` ok | Append `output` to the design doc, continue `/claude-tweaks:specify` |
| `pre-build` ok | `/claude-tweaks:build {spec}` — references loaded |
| `polish` ok + `commands_invoked` non-empty | `/claude-tweaks:test skip-qa` — re-verify after polish |
| `polish` ok + `commands_invoked: []` | `/claude-tweaks:wrap-up {spec}` — no changes, proceed |
| `survey` ok + recommendations | Run any resonating command manually |
| `survey` ok + `recommendations: []` | No follow-up — caller omits the Creative Opportunities block |
| `reset-recommendations` ok | Re-run `/claude-tweaks:flow {spec}` or `/claude-tweaks:visual-review` — survey will re-surface |
| `{skipped: "Impeccable not installed"}` | `/claude-tweaks:init` to set up integration (Step 0.9) |
| `{skipped: "design integration disabled"}` | Re-run `/claude-tweaks:init` to re-enable |
| `{skipped: "non-frontend"}` | No action — the wrapper correctly skipped |

Standard numbered options to present (pick by return shape from the table above, mark one **(Recommended)**):

1. `/claude-tweaks:test {spec}` — re-verify (after `polish ok + commands_invoked` or `test fail`) **(Recommended after polish or test fail)**
2. `/claude-tweaks:review {spec}` — code review quality gate **(Recommended after `test pass` or `review advisory`)**
3. `/claude-tweaks:wrap-up {spec}` — close out the spec (after `review advisory` with nothing to fix, or `polish` no-op)
4. `/claude-tweaks:init` — configure or re-enable design integration (only when `{skipped: "Impeccable not installed"}` or `{skipped: "design integration disabled"}`)

## Component-Skill Contract

This skill is a **component skill** (utility wrapper) — invoked by `/claude-tweaks:test`, `/claude-tweaks:review`, `/claude-tweaks:build`, `/claude-tweaks:flow`, `/claude-tweaks:specify`, and `/claude-tweaks:visual-review`. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked from a caller skill, omit the `## Next Actions` block (callers consume the return shape themselves). When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render the Next Actions table above.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running CLI gate on backend specs | Wastes time scanning irrelevant files — detection layer must skip before invocation |
| Treating `/impeccable:impeccable critique` as authoritative | LLM critiques are opinionated — findings are advisory, surfaced for user judgment, never auto-applied |
| Hard-failing the test gate when the CLI is missing | Blocks users who haven't installed Impeccable — availability check returns skip, not fail |
| Running `polish` when the audit cache is absent | Issue-driven dispatch needs audit signal — degrade to auto-fit-only rather than guessing categories |
| Polish modifying logic that breaks tests | Re-verify gate (in `/flow`) catches this; one-cycle cap prevents oscillation. Polish must keep changes scoped to design system alignment, not behavior. |
| Auto-running intent-driven commands without explicit intent | Intent-driven commands dispatch ONLY when `design-intent:` declares a matching value. Inferring intent from file content or LLM judgment removes user agency over creative direction. |
| Auto-running survey recommendations | `survey` is read-only. It never invokes a command — only suggests. Auto-running survey output bypasses user agency the same way auto-inferring intent does. |
| Treating survey recommendations as authoritative or complete | Survey is heuristic, not LLM-perfect. It can miss opportunities the user would have wanted surfaced, and it can recommend commands that don't fit the actual context. The block clearly says "could enhance further" — never "design is complete" or "design is brilliant." |
| Surfacing recommendations the user already declined twice | Annoying noise — the declined-recommendations cache suppresses after 2 declines. Reset via `/claude-tweaks:design reset-recommendations <spec>`. |
| Caching availability check results across sessions on disk | Availability marker is in-memory per session — never written to `~/.claude-tweaks/` (runtime state owned by harness) |
| Writing audit / recommendations / declined caches to `~/.claude-tweaks/` | Per CLAUDE.md, that path is harness-owned. All three caches live alongside the ledger at `docs/plans/YYYY-MM-DD-{feature}-{audit\|recommendations\|declined}.json`. |
| Calling `/impeccable:impeccable` commands without first checking availability | If the plugin isn't installed, the Skill tool will error — always run the availability check first and skip cleanly |
| Treating the `surface:` field as required | `/specify` writes it on new specs, but legacy specs still have it absent — Layer 3 sniff handles them correctly. Demanding presence breaks every existing spec. |
| Reading `pre-build` context as a hard gate | Lazy-loaded references are *enrichment* for the build subagent. Skipping (no Impeccable installed, non-frontend) must not block the build. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:init` | Adds Impeccable setup phase (Phase 0.9 — install + teach + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. |
| `/claude-tweaks:test` | Invokes `test` mode after the standard verification suite. Errors fail the gate; warnings/skips do not. |
| `/claude-tweaks:review` | Invokes `review` mode during code review. Findings appear as a "Design Quality" section in the review summary — advisory, not blocking. The `review` mode also writes an audit cache (`docs/plans/...-audit.json`) consumed by `polish`. |
| `/claude-tweaks:build` | Invokes `pre-build` mode before implementation to lazy-load Impeccable references and project design context into the build subagent's context. |
| `/claude-tweaks:flow` | Invokes `polish` mode in the polish phase between review and wrap-up (auto-fit + issue-driven + intent-driven). The polish phase modifies code; flow's re-verify gate runs `/test skip-qa` afterward. Flow's pipeline summary also invokes `survey` mode against the full diff to render the Creative Opportunities block. Flow handles decline detection by comparing the recommendations cache from the previous run against the new diff. |
| `/claude-tweaks:specify` | Invokes `shape` mode as a pre-decomposition step on frontend design docs. Also asks the design-intent question and writes `surface:` + `design-intent:` frontmatter on every generated spec — the frontmatter `polish` mode reads for intent-driven dispatch. The full pre-step procedure lives in `specify/design-pre-steps.md`. |
| `/claude-tweaks:visual-review` | Invokes `survey` mode after browser review steps complete, passing screenshot paths via `--screenshots`. Renders the Creative Opportunities block in the visual review report. |
| `/claude-tweaks:wrap-up` | Cleans up the wrapper's audit / recommendations / declined caches alongside the ledger during artifact cleanup. |
| `/claude-tweaks:simplify` | Runs before `polish` mode in `/flow` (different phases — simplify is in build, polish is post-review) — `distill` is intent-only to avoid double-stripping with `/simplify`. /simplify reciprocally avoids the `distill` overlap by deferring distillation to /design polish when intent declares it. |
| `/claude-tweaks:ledger` | No direct interaction — the wrapper writes its own caches (audit, recommendations, declined) as separate files from the ledger. Polish-phase actions surface in `/flow`'s pipeline summary via the actions-performed table. /ledger reciprocally treats design-cache files as separate from the ledger lifecycle (cleanup is handled by /wrap-up Step 5, not by /ledger itself). |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The wrapper's mode-dispatch decisions follow the contract's reversibility/severity floors (polish modifies code → never auto-applied without explicit caller intent; survey is read-only by design). |
| `_shared/design-wrapper-handling.md` | Design wrapper return shape contract — consumed by /build, /test, /review, /flow, /specify, and /visual-review. Documents the universal `{result}` / `{skipped}` / `{deferred}` / `{fail}` shapes this wrapper produces. |
| superpowers `/superpowers:brainstorming` | Invoked by `/specify` when given a topic input — produces the design doc that `shape` mode then enriches. The wrapper does not invoke `/superpowers:brainstorming` directly. |
| Impeccable plugin | All wrapper modes (except `survey` and `reset-recommendations`) invoke commands or the CLI from this plugin. Availability checks gate every dispatching mode. |
