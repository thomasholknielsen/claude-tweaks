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

**Phase 1 status (v4.5.0-phase1):** Two modes are active (`test`, `review`). Four modes are stub signatures that return `{deferred}` until later phases activate them (`shape`, `pre-build`, `polish` — Phase 2; `survey` — Phase 3). The mode signatures exist now so callers can wire against them once and pick up new behavior automatically when later phases ship.

## When to Use

- `/claude-tweaks:test` invokes `test` mode after the standard verification suite — runs `npx impeccable detect` as a frontend anti-pattern gate
- `/claude-tweaks:review` invokes `review` mode during code review — runs `/impeccable critique` + `/impeccable audit` and surfaces findings advisorily
- A user runs `/claude-tweaks:design test <files>` or `/claude-tweaks:design review <spec>` directly to invoke a single mode without going through the lifecycle skill
- A future-phase caller (`/build`, `/flow`, `/visual-review`, `/specify`) invokes `pre-build`, `polish`, `survey`, or `shape` — all return `{deferred}` in Phase 1

## Input

`$ARGUMENTS` is parsed as `<mode> <target>`:

| Mode | Target | Phase 1 behavior |
|------|--------|------------------|
| `shape <topic>` | Topic name | Stub — returns `{deferred: "Phase 2"}` |
| `pre-build <spec>` | Spec number or path | Stub — returns `{deferred: "Phase 2"}` |
| `test <files>` | Space-separated file list | **Active** — runs `npx impeccable detect --fast --json` on the files; returns pass/fail |
| `review <spec>` | Spec number or path | **Active** — invokes `/impeccable critique` + `/impeccable audit` on changed UI files; returns advisory findings |
| `polish <spec>` | Spec number or path | Stub — returns `{deferred: "Phase 2"}` |
| `survey <files>` | Space-separated file list | Stub — returns `{deferred: "Phase 3"}` |

When `<target>` is omitted for `test` mode, the wrapper resolves changed files via `git diff --name-only`. When omitted for `review` mode, the wrapper falls back to the same git-diff resolution.

## Universal preconditions

Run these before dispatching to any **active** mode (`test`, `review`). Stub modes return their deferred result without running preconditions.

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

6. Return:

```json
{
  "mode": "review",
  "result": "advisory",
  "files_scanned": <int>,
  "findings": [ ... combined critique + audit findings ... ]
}
```

`result: advisory` signals to the caller that findings inform the review verdict but do not auto-modify code in Phase 1.

### `shape <topic>`, `pre-build <spec>`, `polish <spec>`, `survey <files>` — Stubs

Each returns immediately without running preconditions:

```json
{
  "mode": "<mode>",
  "deferred": "Phase <N>",
  "note": "This mode is a Phase 1 stub. Active behavior ships in Phase <N>."
}
```

Phase activations:

| Mode | Active in |
|------|-----------|
| `shape` | Phase 2 (called from `/specify` shape pre-step) |
| `pre-build` | Phase 2 (called from `/build` to lazy-load design references) |
| `polish` | Phase 2 (called from new `/flow` polish phase — first wrapper mode that modifies code) |
| `survey` | Phase 3 (called from `/visual-review` and `/flow` summary for "Creative Opportunities" blocks) |

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

- `command-map.md` — Auto-fit / Issue-driven / Intent-driven / Never categorization for all 23 Impeccable commands. Phase 1 only uses `critique`, `audit`, and the `detect` CLI; the rest are documented for forward-compat.
- `frontend-detection.md` — Trigger extensions and path patterns for Layer 3 sniff; spec for the future `surface:` and `design-intent:` frontmatter fields (Phase 2 will write them).
- `impeccable-cli.md` — Exact CLI invocation, JSON output schema, parsing rules.

## Next Actions

When invoked directly by a user (rather than by a lifecycle skill), surface 1-3 context-relevant follow-ups based on what the wrapper returned:

**On `result: pass` (test mode) or `result: advisory` (review mode):**

1. `/claude-tweaks:review {spec}` — review the changes including this design pass **(Recommended when called from `test` mode)**
2. `/claude-tweaks:wrap-up {spec}` — finish up if review already passed

**On `result: fail` (test mode):**

1. Inspect the findings and fix the flagged anti-patterns, then re-run `/claude-tweaks:test` **(Recommended)**
2. Run `npx impeccable detect <file>` directly on the failing file for more detail

**On `{skipped}`:**

1. If `Impeccable not installed` — `/claude-tweaks:init` to set up integration via Step 0.9 **(Recommended)**
2. If `design integration disabled` — re-run `/claude-tweaks:init` to re-enable
3. If `non-frontend` — no action needed, the wrapper correctly skipped

**On `{deferred}`:**

No follow-up — the mode is a Phase 1 stub. The caller should treat the result as a no-op and proceed with its own next step.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running CLI gate on backend specs | Wastes time scanning irrelevant files — detection layer must skip before invocation |
| Treating `/impeccable critique` as authoritative | LLM critiques are opinionated — findings are advisory, surfaced for user judgment, never auto-applied |
| Hard-failing the test gate when the CLI is missing | Blocks users who haven't installed Impeccable — availability check returns skip, not fail |
| Modifying code in any wrapper mode in Phase 1 | Phase 1 is read-only — `polish` is a stub returning `{deferred}` and ships in Phase 2 |
| Re-running detection inside stub modes | Stubs return immediately — no point in detection or availability checks for a deferred no-op |
| Caching availability check results across sessions on disk | Availability marker is in-memory per session — never written to `~/.claude-tweaks/` (runtime state owned by harness) |
| Calling `/impeccable` commands without first checking availability | If the plugin isn't installed, the Skill tool will error — always run the availability check first and skip cleanly |
| Treating the `surface:` field as required | Phase 1 does not write it — absent fields fall through to Layer 3 sniff. Demanding presence breaks every existing spec. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:init` | Adds Impeccable setup phase (Phase 0.9 — install + teach + `design-integration` flag). Writes the kill-switch flag this wrapper reads in Layer 1. |
| `/claude-tweaks:test` | Invokes `test` mode after the standard verification suite. Errors fail the gate; warnings/skips do not. |
| `/claude-tweaks:review` | Invokes `review` mode during code review. Findings appear as a "Design Quality" section in the review summary — advisory, not blocking. |
| `/claude-tweaks:build` | No invocation in Phase 1. Phase 2 will add `pre-build` mode for lazy-loading design references. |
| `/claude-tweaks:flow` | No invocation in Phase 1. Phase 2 will add a polish phase invoking `polish` mode. Phase 3 adds a Creative Opportunities block via `survey` mode. |
| `/claude-tweaks:specify` | No invocation in Phase 1. Phase 2 will add a shape pre-step (`shape` mode) and intent question writing the `design-intent:` frontmatter. |
| `/claude-tweaks:visual-review` | No invocation in Phase 1. Phase 3 will add a Creative Opportunities block via `survey` mode. |
| `/claude-tweaks:simplify` | Runs before any future `polish` mode (different phases) — `distill` is intent-only to avoid double-stripping. No interaction in Phase 1. |
| `/claude-tweaks:ledger` | No direct interaction in Phase 1. Future polish-phase ledger entries (Phase 2) will use phase `design/polish`. |
| Impeccable plugin | All wrapper modes invoke commands or the CLI from this plugin. Availability checks gate every active mode. |
