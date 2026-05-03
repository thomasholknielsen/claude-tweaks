# Impeccable Integration — Phase 1: Foundation & Read-Only Integration

**Status:** Draft
**Target version:** claude-tweaks v4.5.0 (Phase 1 of 3)
**Date:** 2026-05-03
**Parent design:** [2026-05-03-impeccable-integration-design.md](2026-05-03-impeccable-integration-design.md)

## Background

Phase 1 of the Impeccable integration. This phase ships the wrapper skill skeleton with read-only modes (no code-modifying behavior in `/flow`), the `/init` setup phase, and integration into `/test` (CLI gate) and `/review` (critique + audit). Phases 2 and 3 build on this foundation — Phase 2 adds the polish phase + polymorphic specify, Phase 3 adds creative surfacing.

Read the parent design for full context. This phase doc only specifies what Phase 1 ships.

## Goals

- Ship the `/claude-tweaks:design` wrapper skill with all 6 mode signatures (some no-op until Phase 2/3).
- Add `/init` Impeccable setup phase (install + `/impeccable teach` + CLAUDE.md flag).
- Integrate `npx impeccable detect` (deterministic CLI) into `/test` as a hard gate for frontend specs.
- Integrate `/impeccable critique` + `/impeccable audit` into `/review` as advisory findings (no code modification).
- Implement 3-layer detection (kill-switch / frontmatter / file-sniff) so non-frontend specs skip cleanly.
- Implement availability checks so missing Impeccable plugin/CLI never blocks the pipeline.

## Non-goals (deferred to later phases)

- Polish phase in `/flow` (Phase 2)
- `/specify` polymorphic input + shape pre-step + intent question (Phase 2)
- New `skip-qa` flag on `/test` (Phase 2)
- `surface:` and `design-intent:` frontmatter fields on specs (Phase 2)
- Intent-driven creative command dispatch (Phase 3)
- `/visual-review` Creative Opportunities block (Phase 3)
- `/flow` pipeline summary Creative Opportunities block (Phase 3)
- Code-modifying behavior in any wrapper mode

## Files touched (Phase 1)

| File | Action |
|------|--------|
| `skills/design/SKILL.md` | Create — wrapper skill with 6 mode signatures |
| `skills/design/command-map.md` | Create — auto-fit/issue-driven/intent-driven/never categorization |
| `skills/design/frontend-detection.md` | Create — sniff rules + frontmatter spec |
| `skills/design/impeccable-cli.md` | Create — CLI invocation + JSON parsing |
| `skills/init/SKILL.md` | Modify — add Impeccable setup phase |
| `skills/test/SKILL.md` | Modify — invoke `/claude-tweaks:design test` |
| `skills/review/SKILL.md` | Modify — invoke `/claude-tweaks:design review` |
| `.claude-plugin/plugin.json` | Modify — bump version to v4.5.0-phase1 |
| `README.md` | Modify — document new wrapper skill in skill list |

Total: 9 files (under `/flow`'s 10-file scope-check threshold).

## Components (Phase 1)

### Wrapper skill: `/claude-tweaks:design` (skeleton)

`skills/design/SKILL.md` follows claude-tweaks SKILL.md conventions (frontmatter, interaction style directive, when-to-use, anti-patterns table, relationship table — see CLAUDE.md).

**Six mode signatures, two behaviors active in Phase 1:**

| Mode | Phase 1 behavior |
|------|------------------|
| `shape <topic>` | No-op stub: returns `{deferred: "Phase 2"}` |
| `pre-build <spec>` | No-op stub: returns `{deferred: "Phase 2"}` |
| `test <files>` | **Active:** runs `npx impeccable detect --fast --json <files>`, parses output, returns pass/fail |
| `review <spec>` | **Active:** invokes `/impeccable critique` + `/impeccable audit` on changed UI files, returns findings |
| `polish <spec>` | No-op stub: returns `{deferred: "Phase 2"}` |
| `survey <files>` | No-op stub: returns `{deferred: "Phase 3"}` |

**Universal preconditions (run before every active mode):**

1. **Detection (3 layers):**
   - Read CLAUDE.md `design-integration` flag. If `disabled` → return `{skipped: "design integration disabled"}`.
   - Read spec frontmatter `surface:` field if spec input present. `backend` or `infra` → return `{skipped: "non-frontend spec"}`. (Phase 2 will write this field; in Phase 1 it's read-only — absent fields fall through to layer 3.)
   - File-extension sniff fallback. Inspect changed files for trigger extensions or path patterns (see `frontend-detection.md`). No matches → return `{skipped: "non-frontend (sniff)"}`.

2. **Availability check:**
   - For LLM modes (`review`): verify `/impeccable` skill resolves. Missing → return `{skipped: "Impeccable plugin not installed", install_hint: "..."}`.
   - For CLI mode (`test`): verify `npx impeccable --version` resolves. Missing → return `{skipped: "Impeccable CLI not installed", install_hint: "..."}`.
   - De-dupe via in-memory marker (one warning per session).

### Sub-files

**`skills/design/command-map.md`** — Reference table mapping Impeccable commands to categories. Phase 1 only uses `critique`, `audit`, and the CLI; the rest are documented for future phases.

**`skills/design/frontend-detection.md`** — Sniff rules: trigger extensions (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`, `.sass`, `.less`, `.astro`, `.mdx`) and path patterns (`/components/`, `/pages/`, `/app/`, `/routes/`, `/views/`, `/ui/`). Documents the `surface:` and `design-intent:` frontmatter spec for forward compatibility (Phase 2 will write them).

**`skills/design/impeccable-cli.md`** — Exact `npx impeccable detect --fast --json <files>` invocation, expected JSON output schema, parsing rules (errors fail the gate; warnings are informational).

### `/init` Impeccable setup phase

After existing project analysis, when frontend is detected (init already does this for stack detection), present:

```
Detected frontend project. Set up Impeccable design integration?

1. Full integration **(Recommended)** — install Impeccable plugin + CLI, run /impeccable teach
2. Plugin only — install plugin, skip teach (run later via /claude-tweaks:design teach)
3. Skip — design integration disabled (re-enable later by re-running /init)
```

For options 1 or 2:
1. Surface plugin install command. Verify `/impeccable` skill resolves.
2. Offer `npm install -g impeccable` with `npx` fallback. Verify `npx impeccable --version`.
3. For option 1 only: invoke `/impeccable teach`.
4. Write CLAUDE.md flag: `design-integration: enabled` (option 1) or `plugin-only` (option 2). Write `disabled` for option 3.

**Re-run behavior:** On `/init` re-run with integration enabled, offer to re-run `teach` to refresh design context files.

### `/test` integration

`/test`'s SKILL.md gains a new step in its verification flow: after types/lint/tests pass, invoke `/claude-tweaks:design test <changed-files>`. The wrapper runs `npx impeccable detect --fast --json` and returns:
- `pass` (zero findings or only warnings) → `/test` proceeds
- `fail` (any error severity) → `/test` gate fails with the findings list

If wrapper returns `{skipped: ...}` (non-frontend, no Impeccable, etc.), `/test` notes the skip and proceeds. Skip is not a failure.

### `/review` integration

`/review`'s SKILL.md gains a new step: after existing code review steps, invoke `/claude-tweaks:design review <spec>`. The wrapper runs `/impeccable critique` + `/impeccable audit` on changed UI files. Findings appear in the review summary as a new "Design Quality" section. Findings are advisory in Phase 1 — they inform the verdict but don't auto-modify code.

If wrapper returns `{skipped: ...}`, the section is omitted.

## Configuration & artifacts

**CLAUDE.md additions (written by `/init`):**
```markdown
## Design integration
design-integration: enabled  # enabled | plugin-only | disabled
```

**Project artifacts (created by `/impeccable teach` if invoked):**
- Whatever paths Impeccable's `teach` command writes (path verification is an open item — see Open Items).

## Open items

- **`/impeccable teach` output paths** — design assumes `docs/design/PRODUCT.md` and `docs/design/DESIGN.md`. Build step must verify by running `teach` once on a test project and inspecting outputs. If different, update `pre-build` mode (Phase 2) and document actual paths in `/init`'s setup flow.
- **CLI JSON output schema stability** — `npx impeccable detect --fast --json` schema may evolve. Build step must capture sample output and pin parsing logic to current shape; document version compatibility in `impeccable-cli.md`.

## Anti-patterns

| Pattern | Why It Fails |
|---------|--------------|
| Running CLI gate on backend specs | Wastes time scanning irrelevant files | Detection layer skips before invocation |
| Treating `/impeccable critique` as authoritative | LLM critiques are opinionated; user judgment required | Findings are advisory, not auto-fixed |
| Hard-failing the test gate when CLI is missing | Blocks users who haven't installed Impeccable | Availability check returns skip, not fail |
| Modifying code in any wrapper mode in Phase 1 | Phase 1 is read-only; code modification is Phase 2 | Polish mode is a stub returning `{deferred}` |

## Acceptance gates (for `/flow` to declare PASS)

- All 9 files in the file table created or modified.
- `node --test tests/` passes (any new tests for detection logic and CLI parsing).
- `/init` re-run on a test frontend project successfully writes `design-integration` flag.
- `/test` invoked on a test frontend project with a known anti-pattern fails the gate.
- `/test` invoked on a backend project skips Impeccable cleanly (no errors, no false failures).
- `/review` invoked on a frontend spec produces a "Design Quality" section.
- `README.md` lists `/claude-tweaks:design` in the skill table.
- Plugin version bumped in `.claude-plugin/plugin.json`.

## Relationship to other skills (Phase 1)

| Skill | Relationship |
|-------|--------------|
| `/init` | Adds Impeccable setup phase; writes `design-integration` flag |
| `/test` | Invokes `test` mode (CLI detect) as part of test gate |
| `/review` | Invokes `review` mode (critique + audit) as advisory findings |
| `/build` | No changes in Phase 1 (Phase 2 adds `pre-build` invocation) |
| `/flow` | No changes in Phase 1 (Phase 2 adds polish phase) |
| `/specify` | No changes in Phase 1 (Phase 2 adds polymorphic input + pre-steps) |
| Impeccable plugin | `/test` and `/review` invoke commands from this plugin |
