# Impeccable Integration — Phase 2: Polish Phase + Polymorphic Specify

**Status:** Draft
**Target version:** claude-tweaks v4.5.0 (Phase 2 of 3)
**Date:** 2026-05-03
**Parent design:** [2026-05-03-impeccable-integration-design.md](2026-05-03-impeccable-integration-design.md)
**Depends on:** [Phase 1](2026-05-03-impeccable-phase1-foundation-design.md) (must be merged first)

## Background

Phase 2 of the Impeccable integration. Phase 1 shipped the wrapper skeleton and read-only integration. Phase 2 activates the code-modifying parts: a new `polish` phase in `/flow` (with re-verify gate), the `pre-build` mode (lazy-loads design context), and `/specify` polymorphic input with shape pre-step + intent question. After this phase, `/flow` produces shipping-ready design quality on frontend specs autonomously.

Read the parent design for full context. This phase doc only specifies what Phase 2 ships.

## Goals

- Activate `pre-build` mode in `/build` to lazy-load Impeccable references + project design context.
- Add new `polish` phase to `/flow` between review and wrap-up.
- Add re-verify gate after polish (types/lint/tests, skip QA, one-cycle cap).
- Add new `skip-qa` flag to `/test` (used by re-verify and available standalone).
- Add `no-polish` argument to `/flow` (escape hatch for fast iterations or backend specs).
- Make `/specify` polymorphic: accept topic name (invokes superpowers `/brainstorm`) or design doc path.
- Add shape pre-step to `/specify` (invokes `/claude-tweaks:design shape`).
- Add design-intent question to `/specify`; write `surface:` and `design-intent:` frontmatter on every generated spec.
- Activate `polish` mode dispatch: auto-fit (`polish`, `clarify`, `harden`) + issue-driven (`typeset`, `layout`, `adapt`, `optimize`).

## Non-goals (deferred to Phase 3)

- Intent-driven creative command dispatch in polish (`bolder`, `quieter`, `delight`, etc. from frontmatter)
- `/visual-review` Creative Opportunities block
- `/flow` pipeline summary Creative Opportunities block
- `survey` mode active behavior (still no-op stub)

## Files touched (Phase 2)

| File | Action |
|------|--------|
| `skills/design/SKILL.md` | Modify — activate `shape`, `pre-build`, `polish` modes |
| `skills/design/command-map.md` | Modify — add issue-driven dispatch logic |
| `skills/build/SKILL.md` | Modify — invoke `/claude-tweaks:design pre-build` |
| `skills/test/SKILL.md` | Modify — add `skip-qa` argument |
| `skills/flow/SKILL.md` | Modify — add polish phase + re-verify + `no-polish` arg |
| `skills/specify/SKILL.md` | Modify — polymorphic input + shape pre-step + intent question |
| `skills/specify/spec-template.md` | Modify — add `surface:` and `design-intent:` frontmatter fields |
| `.claude-plugin/plugin.json` | Modify — bump version to v4.5.0-phase2 |
| `README.md` | Modify — document polish phase + polymorphic specify |

Total: 9 files (under `/flow`'s 10-file scope-check threshold).

## Components (Phase 2)

### `pre-build` mode activation

Wrapper's `pre-build <spec>` mode (stub in Phase 1) becomes:

1. Run universal preconditions (detection + availability).
2. If proceeding: lazy-load Impeccable's reference files relevant to the spec's surface area. Default load: `typography.md`, `color-and-contrast.md`, `spatial-design.md`. Add `motion-design.md` if spec involves animations; add `responsive-design.md` if spec involves layout breakpoints.
3. Also load project's `docs/design/PRODUCT.md` and `docs/design/DESIGN.md` if present (created by `/impeccable teach` via `/init`).
4. Return `{loaded: [paths], context_size: tokens}`.

`/build`'s SKILL.md gains a step before the implementation phase: invoke `/claude-tweaks:design pre-build <spec>`. The build subagent receives the loaded references as context for the implementation.

### `polish` mode activation

Wrapper's `polish <spec>` mode becomes:

1. Run universal preconditions.
2. Read the most recent `audit` findings from the prior review phase.
3. **Auto-fit dispatch** (always invoked when frontend):
   - `/impeccable polish <changed-files>` — final design system alignment
   - `/impeccable clarify <changed-files>` — UX copy improvement
   - `/impeccable harden <changed-files>` — error handling, i18n, edge cases
4. **Issue-driven dispatch** (only when audit flagged matching category):
   - Audit flagged "typography hierarchy weak" → `/impeccable typeset <files>`
   - Audit flagged "spacing inconsistent" → `/impeccable layout <files>`
   - Audit flagged "responsive issues" → `/impeccable adapt <files>`
   - Audit flagged "performance regressions" → `/impeccable optimize <files>`
5. Return `{commands_invoked: [...], files_modified: [...]}`.

### New `polish` phase in `/flow`

`/flow`'s SKILL.md updates:

**Default pipeline:** `build → test → review → polish → re-verify → wrap-up` (was `build → test → review → wrap-up`).

**Polish phase logic:**
1. Pipeline reaches polish step after review verdict is PASS.
2. Invoke `/claude-tweaks:design polish <spec>`.
3. If wrapper returns `{skipped: ...}` → note skip, proceed to wrap-up (no re-verify needed).
4. If wrapper modified code → proceed to re-verify.
5. If wrapper returned no commands invoked (no audit findings, no auto-fit applicable) → proceed to wrap-up (no re-verify needed).

**Re-verify gate:**
1. Invoke `/test skip-qa` (types/lint/tests only).
2. Cap: one re-verify cycle per flow run (tracked via in-memory marker).
3. Pass → proceed to wrap-up.
4. Fail → stop pipeline. Present "Polish broke verification" failure card with the specific failure. User resolves; can resume with `/flow {spec} polish`.

**New `/flow` argument:** `no-polish` — skips polish + re-verify phases entirely.

**Step list updates:**
- Default: `build,test,review,polish,wrap-up` (re-verify bundled with polish).
- Auto-insert: if `polish` in step list and `re-verify` not, treat as bundled.
- Allowed steps table updates to include `polish`.

### `skip-qa` flag on `/test`

`/test`'s SKILL.md gains a new argument:

| Arg | Effect |
|-----|--------|
| `skip-qa` | Run types/lint/tests only. Skip QA story validation even when stories exist. |

Used by `/flow`'s re-verify gate. Available standalone for users who want a faster check.

### `/specify` polymorphic input

`/specify`'s SKILL.md updates input resolution:

**Input types:**

| Input | Behavior |
|-------|---------|
| **Topic name** (new — string without `.md` extension or `/` separator) | Invoke superpowers `/brainstorm` via Skill tool. Multi-turn conversation produces design doc at `docs/superpowers/specs/...`. Continue into shape + intent + decompose. |
| **Design doc path** (current — string ending `.md` with `/` separator) | Skip brainstorm. Continue into shape + intent + decompose. |

**Pre-steps before decomposition:**

1. **Shape pre-step:**
   - Detect frontend (sniff design doc contents using same rules as wrapper).
   - If frontend, prompt: "Run `/impeccable shape` to plan UX/UI before decomposition? (Recommended: yes)"
   - On yes: invoke `/claude-tweaks:design shape <topic>`. Output appended to design doc.

2. **Intent question:**
   - Only ask when frontend detected.
   - Prompt:
     ```
     Design vibe for this spec? (sets design-intent frontmatter)
     1. Bold — eye-catching, confident
     2. Quiet — restrained, refined
     3. Minimal — strip to essence
     4. Delightful — personality, micro-interactions
     5. Onboarding — first-run flows, empty states
     6. None — no specific creative direction
     ```
   - User can answer with multiple numbers (e.g., `1,4` for bold + delightful).

3. **Decompose** as today, now writing `surface:` and `design-intent:` frontmatter on every spec.

### `shape` mode activation

Wrapper's `shape <topic>` mode becomes:

1. Run universal preconditions (skip detection layer 2 — no spec yet; rely on caller's frontend determination).
2. Invoke `/impeccable shape <topic>`.
3. Return `{output: "..."}` for the caller to append to the design doc.

### Spec frontmatter additions

`skills/specify/spec-template.md` updates to include:

```yaml
surface: frontend          # frontend | backend | infra | mixed
design-intent: delightful  # bold | quiet | minimal | delightful | onboarding | none (or comma-separated)
```

`/specify` populates these based on detection (sniff for `surface:`) and the intent question (`design-intent:`).

## Open items

- **`/specify` topic vs design-doc detection** — distinguishing a topic ("meal planning") from a path (`docs/.../design.md`) by string inspection is fragile. Build step must implement robust heuristic: contains `/` or ends in `.md` → path; otherwise → topic. Edge cases (e.g., topic with slash) need explicit error: "Ambiguous input — use `--topic` or `--design-doc` to disambiguate."
- **Impeccable LLM command file-target convention** — `polish`/`clarify`/`harden`/`typeset`/`layout`/`adapt`/`optimize` accept "Target file/page" per Impeccable docs. Build step must verify whether passing a list of changed files works or whether each command needs a single target. If single-target, dispatch logic loops per file.
- **Audit findings parsing** — wrapper's `polish` mode reads "audit findings from prior review phase". Build step must define the storage location (ledger entry? temp file?) and parsing format. Recommended: JSON file at `~/.claude-tweaks/cache/audit-{spec}.json` written by `review` mode in Phase 1's spec.

## Anti-patterns

| Pattern | Why It Fails |
|---------|--------------|
| Polish modifying logic, breaking tests | Forces re-verify loop that may oscillate | One-cycle cap; second failure stops pipeline |
| Polish silently overriding `/simplify` | Two skills fighting over the same code | Polish runs after simplify; `distill` is intent-only (Phase 3) |
| Hard-failing pipeline when `pre-build` skips | Skip is normal for non-frontend specs | Skip is informational, not a gate failure |
| Asking intent question on backend spec | Annoying, irrelevant | Question only fires when frontend detected |
| Running re-verify without `skip-qa` | Wastes time re-running browser QA after stylistic changes | `skip-qa` is mandatory for re-verify |

## Acceptance gates (for `/flow` to declare PASS)

- All 9 files in the file table modified.
- `node --test tests/` passes (new tests for `skip-qa` flag, polymorphic input detection, polish dispatch).
- `/specify` invoked with a topic successfully calls `/brainstorm` and produces a design doc.
- `/specify` invoked with a design doc path runs shape + intent question and writes spec frontmatter.
- `/flow` on a frontend spec runs polish phase, modifies code, runs re-verify, completes successfully.
- `/flow no-polish` on a frontend spec skips polish phase entirely.
- `/flow` on a backend spec skips polish (wrapper detection layer 2).
- Re-verify failure stops pipeline cleanly with a "polish broke verification" card.
- README and CLAUDE.md updated to reflect new `/flow` default pipeline.
- Plugin version bumped.

## Relationship to other skills (Phase 2)

| Skill | Relationship |
|-------|--------------|
| `/build` | Invokes `pre-build` mode for context loading |
| `/test` | Gains `skip-qa` flag |
| `/review` | Audit findings now consumed by polish phase (spec writes JSON to cache) |
| `/specify` | Polymorphic input; shape + intent pre-steps; writes new frontmatter |
| `/flow` | New polish + re-verify phases; `no-polish` flag |
| `/wrap-up` | Receives polish-phase ledger entries |
| `/simplify` | Runs before polish; coordination is timing-based (different phases) |
| superpowers `/brainstorm` | Invoked by `/specify` for topic-input brainstorming |
| Impeccable plugin | All wrapper modes invoke commands from this plugin |
