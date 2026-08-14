# design-wrapper explore mode — identity scope (genesis worlds tournament) (#377)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-14T065616-spec-377-378-379/spec-377/work/377-spec.md` (record #377)

**Goal:** create the `explore` mode in `/claude-tweaks:design-wrapper` and implement its `identity` scope: at genesis (`PRODUCT.md` present, no coherent `DESIGN.md`), deal competing visual identities via upstream's `concept-seed.mjs`, render presented directions as CSS skins over one shared HTML scaffold, let the user compare in the browser, and lock the pick via upstream `document --seed`. The wrapper never writes `DESIGN.md`.

**Verified current state (2026-08-14, this worktree):**
- `skills/design-wrapper/modes/` holds `doctor.md`, `live.md`, `polish.md`, `pre-build.md`, `reset-recommendations.md`, `review.md`, `shape.md`, `survey.md`, `test.md` — no `explore.md`.
- `skills/design-wrapper/SKILL.md` line 4 `argument-hint`: `"<shape|pre-build|test|review|polish|survey|doctor|reset-recommendations|live> [target] [--screenshots <paths>] [--source <parent-skill>] [--description <text>] [--dry-run] [--limit <n>]"`. Input table (one row per mode) in `## Input`; availability-check table in `### Step 2: Availability check` with three artifact classes; `## When to Use` bullet list; `## Anti-Patterns` table at end.
- `skills/design-wrapper/impeccable-plugin.md` "Script paths per consumer" table has exactly two rows: Layer 0 → `context-signals.mjs`, `doctor` mode → `doctor.mjs`. Layer 0 signal contract includes `setup.hasDesign` / `setup.designPath`.
- `tools/upstream-drift/manifest.yml` `impeccable-plugin` entry: `pinned: "4.0.2"`, assertions list ends with the three `design-contract.md` rows, then `fixtures: []`. `contract-paths` does NOT yet include `skills/impeccable/reference/document.md` or `scripts/concept-seed.mjs`.
- Upstream installed at 4.0.2 (`~/.claude/plugins/cache/impeccable/impeccable/4.0.2/`), verified by reading the source this session:
  - `scripts/concept-seed.mjs`: `SEED_MODES = {persuade, operate, read, experience}`; `--mode` optional (omitted = staging rolls from the full approved pool); `--scope` must be `direction` or `surface`; `--candidate-count` integer 5–7, default 7; `--reroll` non-negative integer; `--from <key>` carries the base key (env `IMPECCABLE_CONCEPT_SEED` equivalent); `--chosen <id>` sends the anonymous choice ping. Usage header carries `--scope direction --mode persuade` and the reroll/chosen forms verbatim.
  - `reference/new-work.md` line 47: presentation rule — "offer the one or two fused challengers that survived the weighing"; line 49: "Re-roll eliminates every direction already shown", "after two consecutive re-rolls, ask what quality is missing", the standing exit "It is the user's door, never yours".
  - `reference/document.md` line 360: "If new-work already completed the workshop in this session, use its chosen direction directly. Do not ask again."
  - All three of the spec's `must-match` strings grep exactly once (or more) in their target files at 4.0.2.
- `tests/` glob covers `tools/upstream-drift/tests/` via `npm test`.

## Pinned semantics (from the spec — implementers do not re-litigate)

- Return shape (identity ok): `{mode: "explore", result: "ok", scope: "identity", chosen_world: "<display name>", visual_reference: "<path>" | null, design_md: "seeded" | "declined"}`. `visual_reference: null` only when the pick succeeded but the artifact write failed — name that edge.
- Skip strings (literal): `design identity already locked — route identity replacement through upstream new-work explicitly` (prefix `design identity already locked` is the AC-1 grep target), `native surface — explore is web-only`, `layout scope not yet implemented — see #378`, `no PRODUCT.md — run /impeccable:impeccable init first`.
- Layers 2 and 3 structurally inapplicable (doctor-style, reasoning stated); Layer 1 + track resolution + exact-pin availability (`resolveImpeccablePlugin`, doctor-class) apply.
- Scope resolution: Layer 0 `hasDesign` (fallback: direct `DESIGN.md` existence check at project root); false → identity, true → layout route (stub skip until #378). Explicit `--scope` wins. `--scope identity` + coherent DESIGN.md → locked skip; coherence = palette + typography direction present; ambiguity resolves to coherent (toward the skip).
- Deal: `concept-seed.mjs --scope direction --mode <mode>`; `--candidate-count` left at script default. `<mode>` selection rule: map the primary surface's job — persuade (marketing/conversion), operate (tools/dashboards), read (content), experience (immersive); unclear → omit the flag (upstream rolls from the full pool). Render set = presented directions only (assigned + 1–2 surviving fused challengers), never the full candidate list. Record id ↔ display-name mapping; carry seed `key` + reroll counter for the session.
- One markup, N skins; skins may restyle, never restructure — stated as load-bearing. Scaffold under `docs/plans/YYYY-MM-DD-{feature}-explore/`, tokens via CSS custom properties only, per `skills/specify/design-pre-steps.md` Step 2.5b-ii conventions.
- Builders: one Task agent per presented direction, Standard profile (never Frontier in a fan-out), status line first, literal inline output template, clean-room input = synthesized card + shared markup path read-only. Degraded variant slot: BLOCKED/failed builder or DONE_WITH_CONCERNS-because-not-expressible-as-restyle → counted in "1 / N", names direction + failure, not pickable.
- Verdict: one reused `AskUserQuestion` call site — pick / reroll / steer / canon standing exit (listed last, never recommended). Reroll = `--reroll <n> --from <key>` (exclusion is upstream's). Steer = a reroll whose one-line steer text guides this mode's next fuse/weigh pass (no script flag). After two consecutive rerolls → upstream's "what quality is missing" one-off follow-up.
- Lock-in: `--chosen <id> --from <key>` then `/impeccable:impeccable document --seed` via the Skill tool — upstream writes DESIGN.md. Keep scaffold + winning skin (= `visual_reference`), delete losing skins. Exit-without-pick: delete explore dir, stop server, return skip.
- Restate-vs-pointer boundary stated in the mode file: restated semantics (exclusion arguments, two-reroll question, canon exit, seed-key carrying) are each pinned by a manifest assertion; everything else points into upstream references.
- Structure: `modes/doctor.md`'s section shape (When this runs / Preconditions / Procedure / Output to caller) + `modes/live.md`'s interactive-only framing. Every procedure step gets a **stable heading name** (#378 reuses by heading, never number). AC 7: fully-qualified `/claude-tweaks:{skill}` / `/impeccable:impeccable` forms in all actionable instruction text.

---

## Task 1: Create `skills/design-wrapper/modes/explore.md`

**Files:** `skills/design-wrapper/modes/explore.md` (new)

Author the complete mode file per the pinned semantics above: mode contract (optional `<surface-topic>` argument — consumed only by the layout scope, ignored here; `--scope identity|layout`; `--source <parent-skill>`), scope-dependent return shapes block, preconditions, scope-resolution table, the seven identity-procedure steps under stable headings (Deal and derive / Synthesize clean-room cards / One markup, N skins / Parallel skin builders / Compare / Verdict / Lock-in), same-markup constraint stated load-bearing, degraded-variant-slot spec, restate-vs-pointer boundary rule, reference to `_shared/subagent-output-contract.md` with a literal inline output template for skin builders (custom format — status line + `SKIN: {css-path}` + `DIRECTION: {display name}` + concerns lines; A/B/C don't fit a file-producing builder).

**Verify (case-insensitive greps, content-anchored):** `grep -c "design identity already locked" skills/design-wrapper/modes/explore.md` ≥ 1; same for `native surface — explore is web-only`, `see #378`, `interactive-only`, `subagent-output-contract`; `grep -c "## " skills/design-wrapper/modes/explore.md` shows the doctor-style section headings.

## Task 2: `skills/design-wrapper/SKILL.md` — six edits

**Files:** `skills/design-wrapper/SKILL.md`

1. `argument-hint`: add `explore` to the mode alternation and `[<surface-topic>]` to the bracketed args (mode list becomes `<shape|pre-build|test|review|polish|survey|doctor|reset-recommendations|live|explore>`; add `[<surface-topic>]` after `[target]`).
2. Input table: `explore [<surface-topic>]` row — target optional free text (layout scope only), behavior summary + `--scope identity|layout` flag, pointer to `modes/explore.md`.
3. Mode-specific precondition note (in the bulleted list under Universal preconditions): `explore` — Layers 2/3 structurally inapplicable (no spec, no file list — doctor-style), scope auto-resolution via Layer 0 `hasDesign`, native track skips web-only; details in the mode file.
4. Availability-check table: `explore` row in the exact-pin bundled-scripts class (`resolveImpeccablePlugin`, doctor-class; script `concept-seed.mjs`) — also add `explore` alongside doctor in the "Bundled scripts, at an exact pin" kind bullet.
5. When to Use: standalone-invocation bullet (a user runs `/claude-tweaks:design-wrapper explore` directly at genesis or for layout comparison).
6. Anti-patterns: two rows — invoking `explore` from auto mode or a `$PIPELINE_RUN_DIR`-set context (same reasoning as `live`); the wrapper writing DESIGN.md itself (upstream `document --seed` is the only writer).

Do NOT add caller-edge statements (edges live in `docs/skill-graph.md`, wired by #379). Do not restate the mode roster as a count.

**Verify:** `grep -in "explore" skills/design-wrapper/SKILL.md` shows argument-hint, Input row, precondition note, availability row, When to Use bullet, both anti-pattern rows — then read the diff to confirm each edit landed as intended (not by count).

## Task 3: `impeccable-plugin.md` row + manifest assertions

**Files:** `skills/design-wrapper/impeccable-plugin.md`, `tools/upstream-drift/manifest.yml`

1. `impeccable-plugin.md` "Script paths per consumer" table: add row `explore` mode (`modes/explore.md`) → `<root>/skills/impeccable/scripts/concept-seed.mjs`. Adjust the surrounding prose that says the resolver has two consumers only if it states a literal count (check first; the cardinality rule forbids literal counts — reference the table instead).
2. `manifest.yml`, under the `impeccable-plugin` entry's `assertions:` (append after the existing design-contract rows, before `fixtures: []`), three new assertions each with `file: "skills/design-wrapper/modes/explore.md"`:
   - claims "the seed path reuses a completed workshop choice without re-asking", `upstream-path: "skills/impeccable/reference/document.md"`, `must-match: "use its chosen direction directly"`
   - claims "reroll excludes already-shown directions", `upstream-path: "skills/impeccable/reference/new-work.md"`, `must-match: "Re-roll eliminates every direction already shown"`
   - claims "the direction-scope invocation exists", `upstream-path: "skills/impeccable/scripts/concept-seed.mjs"`, `must-match: "--scope direction"`
   Also add `skills/impeccable/reference/document.md` and `skills/impeccable/scripts/concept-seed.mjs` to the entry's `contract-paths` (both are now contract surface; `new-work.md` is already listed). Match the existing YAML row style exactly.

**Verify:** `grep -c "concept-seed" skills/design-wrapper/impeccable-plugin.md` ≥ 1 inside the table; `node --test tools/upstream-drift/tests/` green (schema accepts the three rows; each must-match verified against the installed 4.0.2 by the assertion checker).

## Final Verification (central, after all tasks)

1. Full suite: `npm test` — zero failures (never scope to the touched suites only).
2. AC walk: AC 1–2 by reading `modes/explore.md`; AC 3 grep on SKILL.md + diff read; AC 4 grep; AC 5 drift suite; AC 7 — `grep -nE "^[^|]*\\B/(build|specify|test|review|flow|wrap-up|design-wrapper|ledger)\\b" skills/design-wrapper/modes/explore.md` finds no bare skill reference in step bodies (manual read of hits; Relationship-table/prose mentions are allowed bare).
3. `git diff --stat` — only the four declared files changed.
