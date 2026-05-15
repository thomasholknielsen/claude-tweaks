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

**Status (v4.5.0):** All six modes are active (`test`, `review`, `shape`, `pre-build`, `polish`, `survey`), plus the `reset-recommendations` cache utility. The wrapper still skips cleanly on non-frontend specs and missing dependencies. `polish` dispatches three categories — auto-fit, issue-driven, and intent-driven (the latter reads `design-intent:` frontmatter and dispatches creative commands per `command-map.md`). `survey` analyzes rendered UI or the full diff and produces ranked Creative Opportunities recommendations consumed by `/visual-review` and `/flow`'s pipeline summary.

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
- `polish` runs all three detection layers and the LLM availability check; on a successful precondition pass, it consumes audit findings written by `review` mode (see `polish <spec>` mode reference).
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
   - `/impeccable:impeccable critique <files>` — qualitative critique
   - `/impeccable:impeccable audit <files>` — heuristic audit pass
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

   When the ledger does not exist (review invoked outside a flow context), derive the cache path from the spec slug: `docs/plans/audit-{spec-slug}.json`. Cache entries are stale after one flow run; they get overwritten on the next `review` invocation for the same spec. The cache file (along with the `*-recommendations.json` and `*-declined.json` siblings written by `survey` and `/flow`) is cleaned up by `/wrap-up` Step 5 alongside the ledger — see `/claude-tweaks:wrap-up`.

   If the cache write fails (disk full, permission denied), surface the failure as a one-time skip and continue — `polish` mode degrades to auto-fit-only when the cache is absent.

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
3. Invoke the Impeccable LLM command via the Skill tool: `/impeccable:impeccable shape <topic>`.
4. Capture the full output text. Do not parse — the caller (`/specify`) will append it verbatim to the design doc.
5. Return:

```json
{
  "mode": "shape",
  "result": "ok",
  "output": "<full text from /impeccable:impeccable shape>"
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
3. Reference files live inside the Impeccable plugin's skill directory. The wrapper does not bundle them — it lazy-loads them into the build subagent's context via the Skill tool's read of `/impeccable:impeccable` (the plugin exposes them; consult the Impeccable plugin's own SKILL.md for the canonical paths). When a reference cannot be located, note the miss and continue with what was loaded.
4. **Project design context (lazy-load when present):**
   - **Canonical paths:** `PRODUCT.md` and `DESIGN.md` at the project root. These are written by `/impeccable:impeccable teach` (PRODUCT) and `/impeccable:impeccable document` (DESIGN). Confirmed against Impeccable's official documentation (https://impeccable.style/).
   - **Fallback discovery:** If neither file is present at root, glob `docs/design/*.md` and `docs/PRODUCT.md`, `docs/DESIGN.md` as a defensive secondary location. Missing files are not errors — they mean `/impeccable:impeccable teach` and `document` have not been run yet.
   - Read each discovered file and include it in the loaded set.
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

> **Scope (v4.5.0):** Auto-fit + issue-driven + intent-driven dispatch. Intent-driven reads the spec's `design-intent:` frontmatter and dispatches matching creative commands per `command-map.md`'s Intent-driven category.

1. Run preconditions (detection + availability). On any skip, return the skip object — `/flow` notes the skip and proceeds to wrap-up without invoking re-verify.
2. Resolve changed files. If `<spec>` was passed and lists scoped files, intersect with `git diff --name-only`. Otherwise use the full diff filtered to frontend extensions/paths.
3. If zero files remain after filtering, return `{skipped: "no UI files changed"}`.
4. **Read prior audit findings.** The `review` mode (Phase 2 addition) writes findings to a per-spec cache alongside the ledger: `docs/plans/YYYY-MM-DD-{feature}-audit.json` (or `docs/plans/audit-{spec-slug}.json` when invoked outside a flow context). Resolve the cache path:
   - If a ledger file exists for this spec, derive the date+feature prefix from the ledger filename and use the matching `-audit.json` sibling.
   - Otherwise, glob `docs/plans/*-audit.json` and `docs/plans/audit-*.json`, pick the most recently modified file matching the spec slug.
   - If no cache file is found, proceed without issue-driven dispatch — only auto-fit commands run.
   - If the cache exists but is older than the most recent commit on the spec's branch, treat as stale and skip issue-driven dispatch (the audit no longer reflects current code).
5. **Auto-fit dispatch (always invoked when frontend):** Invoke each via the Skill tool, in order:
   - `/impeccable:impeccable polish <files>` — final design system alignment
   - `/impeccable:impeccable clarify <files>` — UX copy improvement
   - `/impeccable:impeccable harden <files>` — error handling, i18n, edge cases
   - **File-target convention (TODO):** The Phase 1 implementation report flagged uncertainty about whether these commands accept a list of files or require a single target. The wrapper passes the file list as a single space-separated argument; if a command rejects multi-file input, the wrapper falls back to looping per file (record this once per session in the in-memory marker; do not surface the looping as a finding).
6. **Issue-driven dispatch (only when audit flagged matching category):** Read the audit findings from Step 4. For each category match, invoke the corresponding command per `command-map.md`:
   - "typography hierarchy weak" / typography-flagged findings → `/impeccable:impeccable typeset <files>`
   - "spacing inconsistent" / spatial-flagged findings → `/impeccable:impeccable layout <files>`
   - "responsive issues" / responsive-flagged findings → `/impeccable:impeccable adapt <files>`
   - "performance regressions" / performance-flagged findings → `/impeccable:impeccable optimize <files>`
   - Match by checking the audit finding's `category` or `rule` field (case-insensitive substring match against the category keywords). When the audit produces multiple matches for the same category, dispatch the command once with the union of affected files.
7. **Intent-driven dispatch (active):** Read the spec's `design-intent:` frontmatter (the canonical field definition lives in `skills/specify/spec-template.md`; the dispatch table is in `command-map.md` Step 3). For each declared intent value, invoke the matching command via the Skill tool on the same scoped file list used by Steps 5–6:
   - `bold` → `/impeccable:impeccable bolder <files>`
   - `quiet` → `/impeccable:impeccable quieter <files>`
   - `minimal` → `/impeccable:impeccable distill <files>` (intent-only — never auto-runs from `/simplify`)
   - `delightful` → `/impeccable:impeccable delight <files>` then `/impeccable:impeccable animate <files>` (in that fixed order — `delight` adds personality content, `animate` adds motion to existing interactions; reversing them risks animating placeholder content)
   - `onboarding` → `/impeccable:impeccable onboard <files>`
   - `none` (or missing field) → skip intent-driven dispatch entirely

   **Multi-intent ordering.** When the user declared comma-separated intents (e.g., `design-intent: bold, delightful`), invoke commands in the order declared. The fixed `delight` → `animate` pairing for `delightful` is preserved even when interleaved with other intents — treat `delightful` as a single dispatch unit that produces two commands. The wrapper does not run a re-verify cycle between intent commands; the polish phase as a whole shares a single re-verify cycle (capped by `/flow`'s polish phase, see flow's polish-phase decision tree).

   **Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They surface only via `survey` mode recommendations (see `command-map.md`). Do not auto-dispatch them from `polish`.

   **No declined-recommendation suppression in polish.** Declined-recommendation tracking applies to `survey` mode only — `polish` always honors the explicit `design-intent:` declaration. The user changes intent dispatch behavior by editing the spec frontmatter, not by declining recommendations.
8. Return:

```json
{
  "mode": "polish",
  "result": "ok",
  "commands_invoked": [
    { "command": "/impeccable:impeccable polish", "files": ["..."], "category": "auto-fit" },
    { "command": "/impeccable:impeccable typeset", "files": ["..."], "category": "issue-driven", "trigger": "audit:typography" },
    { "command": "/impeccable:impeccable bolder", "files": ["..."], "category": "intent-driven", "trigger": "intent:bold" },
    { "command": "/impeccable:impeccable delight", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" },
    { "command": "/impeccable:impeccable animate", "files": ["..."], "category": "intent-driven", "trigger": "intent:delightful" }
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

### `survey <files>` — Active

Survey produces ranked Creative Opportunities recommendations — read-only. It never invokes Impeccable commands; it only suggests them. Callers (`/visual-review`, `/flow`) render the recommendations in their respective output blocks.

1. Run preconditions (Layer 1 + Layer 3; Layer 2 only when a spec is resolvable from the file list). On any skip, return the skip object — the caller omits the Creative Opportunities block.
2. **Resolve invocation context.** The caller signals which surface produced the call:
   - **From `/visual-review`** — caller passes `--screenshots <paths>` plus the file list. Survey analyzes each screenshot for opportunities matching creative-command "would help" criteria (per the criteria table below). Per-screenshot analysis is an LLM-grade observation, not a heuristic.
   - **From `/flow` pipeline summary** — caller passes the full diff file list (no screenshots). Survey applies heuristic per-file checks (e.g., file with motion-related imports but zero `transition`/`animate` references → animate could help; page component with no error/empty-state JSX → delight could help).
   - **From a user invocation directly** — same as the `/flow` path (heuristic, no screenshots) unless `--screenshots` is provided.
3. **Apply the "would help" criteria** to produce raw observations. Each observation maps to one creative command:

   | Observation | Suggested command | Rationale snippet |
   |-------------|-------------------|-------------------|
   | Page reads as generic — pure black on white, no visual personality | `bolder` | Typography/color hierarchy lacks confidence |
   | Visual weight imbalanced — multiple competing high-contrast elements | `quieter` | Reduce noise so the primary action wins |
   | Component clutter — many small UI elements doing redundant work | `distill` | Strip to essence; intent-only avoids `/simplify` overlap |
   | Empty state shows only "No items" or similar bare text | `delight` | Empty states are personality opportunities |
   | Page has interactive controls (toggles, hovers) but no transitions | `animate` | Static interactions feel unpolished |
   | Heavy monochrome — no strategic accent color | `colorize` | Strategic color anchors attention |
   | First-run flow with no guidance or progressive disclosure | `onboard` | First-run UX is a teaching surface |
   | Long-form content with weak hierarchy — wall of text, no pull-quotes | `extract` | Surface key content from prose |
   | Existing strong design that could push further (intentional polish) | `overdrive` | Aggressive creative push — user-discretion |

4. **Suppress declined recommendations.** Read the per-spec declined-recommendations cache from `docs/plans/YYYY-MM-DD-{feature}-declined.json` (path resolution mirrors the audit cache from `review` mode — see Step 4 of `polish` mode). The cache shape:

   ```json
   {
     "spec": "<spec id or path>",
     "declined": [
       { "command": "/impeccable:impeccable bolder", "page": "/pricing", "decline_count": 2, "first_surfaced": "<ISO>", "last_surfaced": "<ISO>" }
     ]
   }
   ```

   Suppress any observation whose `(command, page)` pair has `decline_count >= 2`. Increment in-place when a previously-recommended `(command, page)` from the recommendations cache (see Step 6) is being re-surfaced for the same spec — but DO NOT increment within a single survey call (the increment happens at the next `/flow` run when comparing prior recommendations to the new diff).

5. **Rank** the surviving observations by signal strength: per-screenshot LLM-graded observations rank above heuristic ones; among heuristics, file-pattern matches with multiple supporting signals (e.g., motion-imports AND zero transitions) rank above single-signal matches. Cap output at 5 recommendations to avoid noise.

6. **Write the recommendations cache** at `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` (mirrors the audit cache co-location — keeps survey state out of `~/.claude-tweaks/` per CLAUDE.md). Shape:

   ```json
   {
     "spec": "<spec id or path>",
     "written_at": "<ISO timestamp>",
     "recommendations": [
       { "command": "/impeccable:impeccable bolder", "page": "/pricing", "rationale": "..." }
     ]
   }
   ```

   The next `/flow` run on the same spec compares the new diff against this cache to detect declines (a recommended command was not invoked → its expected file changes do not appear in the new diff → increment `decline_count` in the declined cache). Decline-detection logic lives in `/flow`'s pipeline summary execution (it has the diff context to compare).

7. Return:

   ```json
   {
     "mode": "survey",
     "result": "ok",
     "context": "visual-review" | "flow-summary" | "manual",
     "recommendations": [
       { "page": "/pricing", "observation": "Hero feels generic — pure black on white", "command": "/impeccable:impeccable bolder pricing", "rationale": "..." }
     ],
     "suppressed": <int>
   }
   ```

   `suppressed` is the count of observations dropped due to the declined cache — surfaced informationally so callers can mention "N suggestions hidden (previously declined)" if useful. When `recommendations` is empty, the caller omits the Creative Opportunities block entirely.

#### `reset-recommendations <spec>` — Active utility

Deletes the declined-recommendations cache for the given spec so the next `survey` call surfaces all matching recommendations again. Operates on `docs/plans/YYYY-MM-DD-{feature}-declined.json` (resolved the same way as the audit cache).

1. Resolve the cache path from the spec input. If the file does not exist, return `{result: "ok", note: "No declined recommendations to reset"}`.
2. Delete the file.
3. Return:

   ```json
   { "mode": "reset-recommendations", "result": "ok", "deleted": "docs/plans/YYYY-MM-DD-{feature}-declined.json" }
   ```

This is the user escape hatch when survey suppresses something they want to see again. The recommendations cache (`-recommendations.json`) is left in place — only the declined counter is cleared.

## Output contract

Every wrapper invocation returns one of two shapes:

| Shape | Trigger |
|-------|---------|
| `{mode, result, ...}` | Active mode dispatched and completed |
| `{mode, skipped, ...}` | Detection or availability check returned skip |

Callers must handle both. Skips are not failures — they are valid outcomes that mean "Impeccable doesn't apply here."

## Reference sub-files

Lazy-load these only when needed for the active mode:

- `command-map.md` — Auto-fit / Issue-driven / Intent-driven / Never categorization for all 23 Impeccable commands, including the active intent-driven and survey-recommendation dispatch tables.
- `frontend-detection.md` — Trigger extensions and path patterns for Layer 3 sniff; pointer to the canonical `surface:` and `design-intent:` frontmatter spec (which lives in `skills/specify/spec-template.md`).
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

**On `result: ok` with `recommendations` non-empty (survey mode):**

1. Run any of the recommended commands manually if the suggestion resonates **(Recommended)**
2. `/claude-tweaks:design reset-recommendations {spec}` — clear declined-recommendation tracking if previously suppressed suggestions should re-appear

**On `result: ok` with `recommendations: []` (survey mode):**

No follow-up — the diff did not match any creative-opportunity criteria. The caller (typically `/visual-review` or `/flow`) omits the Creative Opportunities block.

**On `result: ok` (reset-recommendations):**

1. Re-run `/claude-tweaks:flow {spec}` or `/claude-tweaks:visual-review` — survey will surface previously-declined recommendations again **(Recommended)**

**On `{skipped}`:**

1. If `Impeccable not installed` — `/claude-tweaks:init` to set up integration via Step 0.9 **(Recommended)**
2. If `design integration disabled` — re-run `/claude-tweaks:init` to re-enable
3. If `non-frontend` — no action needed, the wrapper correctly skipped

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
| `/claude-tweaks:specify` | Invokes `shape` mode as a pre-decomposition step on frontend design docs. Also asks the design-intent question and writes `surface:` + `design-intent:` frontmatter on every generated spec — the frontmatter `polish` mode reads for intent-driven dispatch. |
| `/claude-tweaks:visual-review` | Invokes `survey` mode after browser review steps complete, passing screenshot paths via `--screenshots`. Renders the Creative Opportunities block in the visual review report. |
| `/claude-tweaks:wrap-up` | Cleans up the wrapper's audit / recommendations / declined caches alongside the ledger during artifact cleanup. |
| `/claude-tweaks:simplify` | Runs before `polish` mode in `/flow` (different phases — simplify is in build, polish is post-review) — `distill` is intent-only to avoid double-stripping with `/simplify`. |
| `/claude-tweaks:ledger` | No direct interaction — the wrapper writes its own caches (audit, recommendations, declined) as separate files from the ledger. Polish-phase actions surface in `/flow`'s pipeline summary via the actions-performed table. |
| superpowers `/superpowers:brainstorming` | Invoked by `/specify` when given a topic input — produces the design doc that `shape` mode then enriches. The wrapper does not invoke `/superpowers:brainstorming` directly. |
| Impeccable plugin | All wrapper modes (except `survey` and `reset-recommendations`) invoke commands or the CLI from this plugin. Availability checks gate every dispatching mode. |
