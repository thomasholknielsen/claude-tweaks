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

**Phase 2 status (v4.5.0-phase2):** Five modes are active (`test`, `review`, `shape`, `pre-build`, `polish`). One mode is a stub signature that returns `{deferred}` until Phase 3 activates it (`survey`). Phase 2 added the first code-modifying mode (`polish`); the wrapper still skips cleanly on non-frontend specs and missing dependencies. The `polish` mode in Phase 2 dispatches auto-fit + issue-driven commands only — intent-driven dispatch (per `design-intent:` frontmatter) ships in Phase 3.

## When to Use

- `/claude-tweaks:test` invokes `test` mode after the standard verification suite — runs `npx impeccable detect` as a frontend anti-pattern gate
- `/claude-tweaks:review` invokes `review` mode during code review — runs `/impeccable critique` + `/impeccable audit` and surfaces findings advisorily
- `/claude-tweaks:build` invokes `pre-build` mode before implementation — lazy-loads design references into the build subagent's context
- `/claude-tweaks:specify` invokes `shape` mode before decomposition — runs `/impeccable shape <topic>` and appends the output to the design doc
- `/claude-tweaks:flow` invokes `polish` mode after review passes — dispatches auto-fit + issue-driven Impeccable commands; modifies code
- A user runs `/claude-tweaks:design <mode> <target>` directly to invoke a single mode without going through the lifecycle skill
- A future-phase caller (`/visual-review`, `/flow` summary) invokes `survey` — returns `{deferred}` in Phase 2

## Input

`$ARGUMENTS` is parsed as `<mode> <target>`:

| Mode | Target | Phase 2 behavior |
|------|--------|------------------|
| `shape <topic>` | Topic name | **Active** — invokes `/impeccable shape <topic>`; returns the output for the caller to append to the design doc |
| `pre-build <spec>` | Spec number or path | **Active** — lazy-loads relevant Impeccable reference files plus project's `docs/design/PRODUCT.md` + `DESIGN.md` (when present); returns the loaded file paths and an approximate context size |
| `test <files>` | Space-separated file list | **Active** — runs `npx impeccable detect --fast --json` on the files; returns pass/fail |
| `review <spec>` | Spec number or path | **Active** — invokes `/impeccable critique` + `/impeccable audit` on changed UI files; returns advisory findings; writes findings cache for `polish` mode to read |
| `polish <spec>` | Spec number or path | **Active** — dispatches auto-fit (`polish`/`clarify`/`harden`) + issue-driven (`typeset`/`layout`/`adapt`/`optimize`) commands per `command-map.md`; modifies code. Intent-driven dispatch deferred to Phase 3. |
| `survey <files>` | Space-separated file list | Stub — returns `{deferred: "Phase 3"}` |

When `<target>` is omitted for `test` mode, the wrapper resolves changed files via `git diff --name-only`. When omitted for `review` mode or `polish` mode, the wrapper falls back to the same git-diff resolution.

## Universal preconditions

Run these before dispatching to any **active** mode (`test`, `review`, `shape`, `pre-build`, `polish`). Stub modes (`survey` in Phase 2) return their deferred result without running preconditions.

**Mode-specific notes:**

- `shape` runs preconditions but skips Layer 2 — there is no spec yet (the caller is `/specify` working on a design doc, not a numbered spec). Layer 1 + availability still apply.
- `pre-build` runs all three detection layers and the LLM availability check — it touches Impeccable references but does not modify code.
- `polish` runs all three detection layers and the LLM availability check; on a successful precondition pass, it consumes audit findings written by `review` mode (see `polish <spec>` mode reference).

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

Phase 1 does not write `surface:` — Phase 2 will. Absent fields are normal and gracefully fall through.

**Layer 3 — File-extension sniff (fallback):**

Inspect the files in the mode's target list (or the resolved `git diff` set). If any file matches a frontend trigger extension or path pattern, treat as frontend. If zero files match, return `{skipped: "non-frontend (sniff)"}`.

For the trigger extensions and path patterns, read `frontend-detection.md` in this skill's directory.

### Step 2: Availability check

For the dispatched mode, verify the dependency is available:

| Mode | Required | Verify by |
|------|----------|-----------|
| `test` | Impeccable CLI | Run `npx impeccable --version` via Bash. Exit 0 with version string → available. Non-zero or no output → unavailable. |
| `review` | Impeccable plugin (LLM commands) | Check whether `/impeccable` skill resolves. Look for `/impeccable*` in the available skills list provided by the harness. If none resolve, treat as unavailable. |
| `shape` | Impeccable plugin (LLM commands) | Same as `review` — checks for `/impeccable*` skill resolution. |
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
- **Plugin:** `/plugin install impeccable@<marketplace>` (verify by checking `/impeccable` skill resolves)

**De-dupe:** Track availability-skip warnings via an in-memory marker for the session. If the same mode skips twice for the same reason in a session, surface only the first skip in the response and keep the rest silent. The marker is per-process (in-memory) — there is no on-disk state.

## Mode behaviors

### `test <files>` — Active

1. Run preconditions (detection + availability). On any skip, return the skip object.
2. Resolve target files. If `<files>` was passed, use that list. Otherwise run `git diff --name-only` to collect uncommitted changes (staged + unstaged).
3. Filter to files that match frontend trigger extensions/paths (use the same rules as Layer 3 detection).
4. If zero files remain after filtering, return `{skipped: "no frontend files in scope"}`.
5. Invoke the CLI exactly as documented in `impeccable-cli.md` in this skill's directory: `npx impeccable detect --fast --json <files>`.
6. Parse the JSON output per `impeccable-cli.md`'s schema rules.
7. Compute pass/fail:
   - **pass** — zero findings, or all findings are `severity: warning`
   - **fail** — any finding with `severity: error`
8. Return:

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [ { "file": "...", "rule": "...", "severity": "...", "line": <int>, "message": "..." }, ... ]
}
```

Warnings are included in the findings list but do not cause `result: fail`. Callers may surface warnings informationally.

### `review <spec>` — Active

1. Run preconditions (detection + availability). On any skip, return the skip object.
2. Resolve the changed UI files. If `<spec>` was passed and the spec lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths (Layer 3 rules).
3. If zero files remain after filtering, return `{skipped: "no UI files changed"}`.
4. Invoke the Impeccable LLM commands via the Skill tool:
   - `/impeccable critique <files>` — qualitative critique
   - `/impeccable audit <files>` — heuristic audit pass
5. Collect both outputs. Parse each into a normalized findings list:

```json
{
  "source": "critique" | "audit",
  "file": "...",
  "category": "...",
  "severity": "info" | "warning" | "error",
  "message": "...",
  "suggestion": "..."  // when present in source output
}
```

6. **Write findings cache for `polish` mode (Phase 2 addition):** Persist the audit findings (only — not critique) to a JSON file alongside the ledger: `docs/plans/YYYY-MM-DD-{feature}-audit.json`. The matching ledger filename is `docs/plans/YYYY-MM-DD-{feature}-ledger.md`; the audit cache uses the same date and feature slug with `-audit.json` suffix. This keeps the cache co-located with other pipeline state (the ledger is already in `docs/plans/`) and avoids writing to `~/.claude-tweaks/` (harness-owned runtime state per CLAUDE.md).

   ```json
   {
     "spec": "<spec id or path>",
     "written_at": "<ISO timestamp>",
     "findings": [ { "source": "audit", "file": "...", "category": "...", "severity": "...", "message": "...", "suggestion": "..." }, ... ]
   }
   ```

   When the ledger does not exist (review invoked outside a flow context), derive the cache path from the spec slug: `docs/plans/audit-{spec-slug}.json`. Cache entries are stale after one flow run; they get overwritten on the next `review` invocation for the same spec. The cache file should be added to `.gitignore` patterns by `/init` (Phase 3 follow-up; for Phase 2, treat as a transient artifact that wrap-up can clean up).

   **TODO (Phase 1 carry-over):** The cache write was specified in Phase 1's design but not implemented in Phase 1's wrapper code (Phase 1 only collected findings into the return value). Phase 2 adds this side effect. If the cache write fails (disk full, permission denied), surface the failure as a one-time skip and continue — `polish` mode degrades to auto-fit-only when the cache is absent.

7. Return:

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": <int>,
  "findings": [ ... combined critique + audit findings ... ]
}
```

`result: advisory` signals to the caller that findings inform the review verdict but do not auto-modify code. The `polish` mode (Phase 2, invoked separately by `/flow`) is the code-modifying counterpart that consumes the cached audit findings to drive issue-driven dispatch.

### `shape <topic>` — Active

1. Run preconditions, **skipping Layer 2** (no spec exists yet — the caller is `/specify` working from a design doc, not a numbered spec). Layer 1 (kill-switch) and the availability check still apply. Layer 3 sniff is optional — `/specify` already determined frontend before invoking; the wrapper trusts that determination here.
2. On any skip, return the skip object — the caller continues without the shape pre-step.
3. Invoke the Impeccable LLM command via the Skill tool: `/impeccable shape <topic>`.
4. Capture the full output text. Do not parse — the caller (`/specify`) will append it verbatim to the design doc.
5. Return:

```json
{
  "mode": "shape",
  "result": "ok",
  "output": "<full text from /impeccable shape>"
}
```

Shape mode is read-only with respect to source code (it produces planning text, not code changes).

### `pre-build <spec>` — Active

1. Run preconditions (detection + availability). On any skip, return the skip object — `/build` proceeds without lazy-loaded references (skip is informational, not a gate failure).
2. Read the spec file (when `<spec>` is a number, resolve via `specs/{N}-*.md`; when a path, read directly). Inspect the spec's contents to choose which Impeccable reference files to load:
   - **Always load** when frontend: `typography.md`, `color-and-contrast.md`, `spatial-design.md`
   - **Add `motion-design.md`** when the spec mentions animations, transitions, micro-interactions, motion, or hover effects
   - **Add `responsive-design.md`** when the spec mentions breakpoints, mobile, tablet, responsive, or viewport
   - **Add `interaction-design.md`** when the spec mentions hover/focus states, keyboard navigation, or interactive controls
   - **Add `ux-writing.md`** when the spec mentions copy, microcopy, error messages, empty states, or labels
3. Reference files live inside the Impeccable plugin's skill directory. The wrapper does not bundle them — it lazy-loads them into the build subagent's context via the Skill tool's read of `/impeccable` (the plugin exposes them; consult the Impeccable plugin's own SKILL.md for the canonical paths). When a reference cannot be located, note the miss and continue with what was loaded.
4. **Project design context (lazy-load when present):**
   - **Assumed paths (per Phase 1's `/init` Step 0.9 documentation):** `docs/design/PRODUCT.md` and `docs/design/DESIGN.md`. These are produced by `/impeccable teach`.
   - **Fallback discovery (TODO — verify against actual `/impeccable teach` output):** Glob `docs/design/*.md` to catch alternative locations. The Phase 1 implementation report flagged that the `teach` output paths could not be verified against a running Impeccable installation; the assumed paths are documented but the wrapper falls back to glob discovery so a path mismatch does not silently break `pre-build`.
   - Read each discovered file and include it in the loaded set. Missing project files are not errors — they mean `/impeccable teach` was not run or wrote elsewhere.
5. Return the loaded paths and an approximate context size:

```json
{
  "mode": "pre-build",
  "result": "ok",
  "loaded": [ "<path1>", "<path2>", ... ],
  "context_size": <approx tokens, sum of file sizes / 4>,
  "missed": [ "<path that was expected but not found>" ]
}
```

The `context_size` is a rough estimate (`bytes / 4`) — used by `/build` to decide whether to summarize the references before injecting into the subagent prompt versus passing them whole.

`pre-build` does not modify code. The loaded references are read-only context for the implementer subagent.

### `polish <spec>` — Active

> **Phase 2 scope:** Auto-fit + issue-driven dispatch only. Intent-driven dispatch (per `design-intent:` frontmatter values like `bold`, `delightful`, `onboarding`) ships in Phase 3.

1. Run preconditions (detection + availability). On any skip, return the skip object — `/flow` notes the skip and proceeds to wrap-up without invoking re-verify.
2. Resolve changed files. If `<spec>` was passed and lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths.
3. If zero files remain after filtering, return `{skipped: "no UI files changed"}`.
4. **Read prior audit findings.** The `review` mode (Phase 2 addition) writes findings to a per-spec cache alongside the ledger: `docs/plans/YYYY-MM-DD-{feature}-audit.json` (or `docs/plans/audit-{spec-slug}.json` when invoked outside a flow context). Resolve the cache path:
   - If a ledger file exists for this spec, derive the date+feature prefix from the ledger filename and use the matching `-audit.json` sibling.
   - Otherwise, glob `docs/plans/*-audit.json` and `docs/plans/audit-*.json`, pick the most recently modified file matching the spec slug.
   - If no cache file is found, proceed without issue-driven dispatch — only auto-fit commands run.
   - If the cache exists but is older than the most recent commit on the spec's branch, treat as stale and skip issue-driven dispatch (the audit no longer reflects current code).
5. **Auto-fit dispatch (always invoked when frontend):** Invoke each via the Skill tool, in order:
   - `/impeccable polish <files>` — final design system alignment
   - `/impeccable clarify <files>` — UX copy improvement
   - `/impeccable harden <files>` — error handling, i18n, edge cases
   - **File-target convention (TODO):** The Phase 1 implementation report flagged uncertainty about whether these commands accept a list of files or require a single target. The wrapper passes the file list as a single space-separated argument; if a command rejects multi-file input, the wrapper falls back to looping per file (record this once per session in the in-memory marker; do not surface the looping as a finding).
6. **Issue-driven dispatch (only when audit flagged matching category):** Read the audit findings from Step 4. For each category match, invoke the corresponding command per `command-map.md`:
   - "typography hierarchy weak" / typography-flagged findings → `/impeccable typeset <files>`
   - "spacing inconsistent" / spatial-flagged findings → `/impeccable layout <files>`
   - "responsive issues" / responsive-flagged findings → `/impeccable adapt <files>`
   - "performance regressions" / performance-flagged findings → `/impeccable optimize <files>`
   - Match by checking the audit finding's `category` or `rule` field (case-insensitive substring match against the category keywords). When the audit produces multiple matches for the same category, dispatch the command once with the union of affected files.
7. **Intent-driven dispatch (Phase 3 — DEFERRED):** Phase 3 will read `design-intent:` from spec frontmatter and dispatch creative commands (`bolder`, `quieter`, `delight`, etc.) here. Phase 2 leaves a marker comment indicating this slot is intentional:

   ```
   # PHASE 3 SLOT: intent-driven dispatch reads spec.frontmatter.design-intent and
   # invokes bolder/quieter/distill/delight/animate/colorize/overdrive/extract/onboard
   # per the matching values listed in command-map.md (Intent-driven category).
   ```

   Phase 2 does not implement this slot. Skipping it is intentional, not a bug.
8. Return:

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" }
  ],
  "files_modified": [ "<path>", ... ]
}
```

Or, when no commands ran (skip from preconditions, or zero files in scope, or no findings + no auto-fit applicable):

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [],
  "files_modified": [],
  "note": "Auto-fit ran with zero net changes" | "No frontend files in scope"
}
```

`polish` is the **first wrapper mode that modifies code.** Callers (`/flow` polish phase) must follow up with re-verification (types/lint/tests) when `files_modified` is non-empty.

### `survey <files>` — Stub (Phase 3)

Returns immediately without running preconditions:

```json
{
  "mode": "survey",
  "deferred": "Phase 3",
  "note": "This mode is a Phase 2 stub. Active behavior ships in Phase 3 (Creative Opportunities surfacing for /visual-review and /flow summary)."
}
```

Stub returns intentionally do not run detection or availability checks — there's nothing to dispatch. Callers should treat `{deferred}` as "no-op for now" and proceed.

## Output contract

Every wrapper invocation returns one of three shapes:

| Shape | Trigger |
|-------|---------|
| `{mode, result, ...}` | Active mode dispatched and completed |
| `{mode, skipped, ...}` | Detection or availability check returned skip |
| `{mode, deferred, note}` | Stub mode (not active in current phase) |

Callers must handle all three. Skips are not failures — they are valid outcomes that mean "Impeccable doesn't apply here." Deferred is also not a failure — the mode signature exists but its behavior ships later.

## Reference sub-files

Lazy-load these only when needed for the active mode:

- `command-map.md` — Auto-fit / Issue-driven / Intent-driven / Never categorization for all 23 Impeccable commands. Phase 2 uses auto-fit (review + polish + pre-spec) and issue-driven categories plus the `detect` CLI; intent-driven is documented for Phase 3 forward-compat.
- `frontend-detection.md` — Trigger extensions and path patterns for Layer 3 sniff; pointer to the canonical `surface:` and `design-intent:` frontmatter spec (which lives in `skills/specify/spec-template.md` — Phase 2 writes both fields on every new spec).
- `impeccable-cli.md` — Exact CLI invocation, JSON output schema, parsing rules.

## Next Actions

When invoked directly by a user (rather than by a lifecycle skill), surface 1-3 context-relevant follow-ups based on what the wrapper returned:

**On `result: pass` (test mode) or `result: advisory` (review mode):**

1. `/claude-tweaks:review {spec}` — review the changes including this design pass **(Recommended when called from `test` mode)**
2. `/claude-tweaks:wrap-up {spec}` — finish up if review already passed

**On `result: fail` (test mode):**

1. Inspect the findings and fix the flagged anti-patterns, then re-run `/claude-tweaks:test` **(Recommended)**
2. Run `npx impeccable detect <file>` directly on the failing file for more detail

**On `result: ok` (shape mode):**

1. Append the returned `output` to the design doc and continue with `/claude-tweaks:specify` decomposition **(Recommended)**

**On `result: ok` (pre-build mode):**

1. Continue with `/claude-tweaks:build {spec}` — references are loaded into context **(Recommended)**

**On `result: ok` with `commands_invoked` non-empty (polish mode):**

1. `/claude-tweaks:test skip-qa` — re-verify types/lint/tests after polish modifications **(Recommended)**
2. `git diff` — inspect the polish changes before committing

**On `result: ok` with `commands_invoked: []` (polish mode):**

1. `/claude-tweaks:wrap-up {spec}` — no polish changes; proceed to wrap-up **(Recommended)**

**On `{skipped}`:**

1. If `Impeccable not installed` — `/claude-tweaks:init` to set up integration via Step 0.9 **(Recommended)**
2. If `design integration disabled` — re-run `/claude-tweaks:init` to re-enable
3. If `non-frontend` — no action needed, the wrapper correctly skipped

**On `{deferred}`:**

No follow-up — the mode is a Phase 2 stub (only `survey` remains stubbed in Phase 2). The caller should treat the result as a no-op and proceed with its own next step.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running CLI gate on backend specs | Wastes time scanning irrelevant files — detection layer must skip before invocation |
| Treating `/impeccable critique` as authoritative | LLM critiques are opinionated — findings are advisory, surfaced for user judgment, never auto-applied |
| Hard-failing the test gate when the CLI is missing | Blocks users who haven't installed Impeccable — availability check returns skip, not fail |
| Running `polish` when the audit cache is absent | Issue-driven dispatch needs audit signal — degrade to auto-fit-only rather than guessing categories |
| Polish modifying logic that breaks tests | Re-verify gate (in `/flow`) catches this; one-cycle cap prevents oscillation. Polish must keep changes scoped to design system alignment, not behavior. |
| Auto-running intent-driven commands in Phase 2 | `bolder`/`delight`/`overdrive` etc. produce non-deterministic creative drift across runs. Phase 2's `polish` mode dispatches auto-fit + issue-driven only — intent dispatch is Phase 3. |
| Re-running detection inside stub modes | Stubs return immediately — no point in detection or availability checks for a deferred no-op |
| Caching availability check results across sessions on disk | Availability marker is in-memory per session — never written to `~/.claude-tweaks/` (runtime state owned by harness) |
| Writing audit cache to `~/.claude-tweaks/` | Per CLAUDE.md, that path is harness-owned. Write the cache to `docs/plans/...-audit.json` alongside the ledger. |
| Calling `/impeccable` commands without first checking availability | If the plugin isn't installed, the Skill tool will error — always run the availability check first and skip cleanly |
| Treating the `surface:` field as required | Phase 2's `/specify` writes it on new specs, but legacy specs (pre-Phase 2) still have it absent — Layer 3 sniff handles them correctly. Demanding presence breaks every existing spec. |
| Reading `pre-build` context as a hard gate | Lazy-loaded references are *enrichment* for the build subagent. Skipping (no Impeccable installed, non-frontend) must not block the build. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:init` | Adds Impeccable setup phase (Phase 0.9 — install + teach + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. |
| `/claude-tweaks:test` | Invokes `test` mode after the standard verification suite. Errors fail the gate; warnings/skips do not. |
| `/claude-tweaks:review` | Invokes `review` mode during code review. Findings appear as a "Design Quality" section in the review summary — advisory, not blocking. The `review` mode also writes an audit cache (`docs/plans/...-audit.json`) consumed by `polish` in Phase 2. |
| `/claude-tweaks:build` | Invokes `pre-build` mode (Phase 2) before implementation to lazy-load Impeccable references and project design context into the build subagent's context. |
| `/claude-tweaks:flow` | Invokes `polish` mode (Phase 2) in the new polish phase between review and wrap-up. The polish phase modifies code; flow's re-verify gate runs `/test skip-qa` afterward. Phase 3 adds a Creative Opportunities block via `survey` mode. |
| `/claude-tweaks:specify` | Invokes `shape` mode (Phase 2) as a pre-decomposition step on frontend design docs. Also asks the design-intent question and writes `surface:` + `design-intent:` frontmatter on every generated spec. |
| `/claude-tweaks:visual-review` | No invocation in Phase 2. Phase 3 will add a Creative Opportunities block via `survey` mode. |
| `/claude-tweaks:simplify` | Runs before `polish` mode in `/flow` (different phases — simplify is in build, polish is post-review) — `distill` is intent-only (Phase 3) to avoid double-stripping with `/simplify`. |
| `/claude-tweaks:ledger` | No direct interaction in Phase 2 — the wrapper writes its own audit cache (separate file from the ledger). Polish-phase actions surface in `/flow`'s pipeline summary via the actions-performed table. |
| superpowers `/brainstorm` | Invoked by `/specify` (Phase 2) when given a topic input — produces the design doc that `shape` mode then enriches. The wrapper does not invoke `/brainstorm` directly. |
| Impeccable plugin | All wrapper modes invoke commands or the CLI from this plugin. Availability checks gate every active mode. |
