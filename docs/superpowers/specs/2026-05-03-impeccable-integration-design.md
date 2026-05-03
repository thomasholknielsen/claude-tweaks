# Impeccable Integration — Design

**Status:** Draft
**Target version:** claude-tweaks v4.5.0
**Date:** 2026-05-03

## Background

[Impeccable](https://github.com/pbakaus/impeccable) is a frontend-design plugin built on Anthropic's `frontend-design` skill. It ships 23 commands (`shape`, `critique`, `audit`, `polish`, `bolder`, `delight`, etc.), 7 domain reference files (typography, color, spatial, motion, interaction, responsive, ux-writing), and a deterministic Node CLI that detects design anti-patterns without LLM cost.

Claude-tweaks owns the lifecycle (`/init` → `/specify` → `/flow` → wrap-up). It has no design-quality opinion. Impeccable owns design quality but no lifecycle. The two are complementary, not overlapping — but without integration, users have to manually invoke Impeccable commands at the right moments, and the most valuable creative commands (`bolder`/`delight`/`animate`) tend to get buried and never used.

This design adds a wrapper skill `/claude-tweaks:design` that encapsulates "when, how, and whether to invoke Impeccable" so lifecycle skills don't have to know. The wrapper is invoked at five touchpoints across `/init`, `/specify`, `/flow`'s phases, and `/visual-review`.

## Goals

- Enable `/flow` to produce shipping-ready design quality on frontend specs without user intervention.
- Skip Impeccable cleanly on non-frontend specs to avoid token waste.
- Surface Impeccable's creative commands (`bolder`, `delight`, etc.) at three independent anchor points so they cannot get buried.
- Capture design intent at spec-creation time so auto-runs in `/flow` reflect the user's creative direction.
- Make Impeccable installation a guided opt-in step in `/init`, not a hidden prerequisite.
- Run Impeccable's deterministic CLI as a hard test gate (no LLM cost, no API key, deterministic output).
- Preserve the test/review separation — `/review` stays read-only; code-modifying behavior lives in a new `polish` phase with its own re-verify gate.

## Non-goals

- Forking or replacing Impeccable's skill content. The wrapper invokes Impeccable; it does not duplicate or modify its reference files.
- Forking superpowers' `/brainstorm`. `/specify` calls into it via the Skill tool when given a topic input.
- Auto-running creative commands (`bolder`/`delight`/`overdrive`) without explicit intent. These remain user-directed via spec frontmatter or manual invocation.
- Per-spec design budget controls (e.g., "skip clarify on this spec"). Defer until requested.
- Visual-iteration tooling beyond what Impeccable already ships. We do not build our own.
- Replacing claude-tweaks' existing `/simplify`. `/impeccable distill` is intent-only to avoid double-stripping.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Wrapper skill /claude-tweaks:design (the integration point)   │
│                                                                         │
│  skills/design/SKILL.md                                                 │
│    ├─ 6 modes: shape, pre-build, test, review, polish, survey           │
│    ├─ 3-layer detection: kill-switch / frontmatter / file-sniff         │
│    ├─ Graceful skip when Impeccable absent or non-frontend              │
│    └─ Emits structured JSON results back to caller                      │
│                                                                         │
│  skills/design/command-map.md                                           │
│    ├─ Auto-fit / Issue-driven / Intent-driven / Never-run categories    │
│    └─ Command dispatch table per mode                                   │
│                                                                         │
│  skills/design/frontend-detection.md                                    │
│    ├─ Sniff rules (file extensions + path patterns)                     │
│    └─ Frontmatter spec (surface, design-intent)                         │
│                                                                         │
│  skills/design/impeccable-cli.md                                        │
│    ├─ npx impeccable invocation patterns                                │
│    └─ JSON output parsing                                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 2 — Lifecycle skill integration                                   │
│                                                                         │
│  /init                                                                  │
│    └─ Adds Impeccable setup phase (install + teach + flag)              │
│                                                                         │
│  /specify                                                               │
│    ├─ Polymorphic input: topic | design-doc                             │
│    ├─ Topic input → invoke superpowers /brainstorm via Skill tool       │
│    ├─ Pre-step: /claude-tweaks:design shape (if frontend)               │
│    └─ Pre-step: design-intent question → frontmatter on every spec      │
│                                                                         │
│  /flow                                                                  │
│    ├─ build → /claude-tweaks:design pre-build (lazy-load refs)          │
│    ├─ test → /claude-tweaks:design test (CLI detect)                    │
│    ├─ review → /claude-tweaks:design review (critique + audit)          │
│    ├─ NEW polish phase → /claude-tweaks:design polish (auto + intent)   │
│    ├─ NEW re-verify gate (types/lint/tests, skip QA, 1 cycle cap)       │
│    └─ Pipeline summary → /claude-tweaks:design survey (anchor 3)        │
│                                                                         │
│  /visual-review                                                         │
│    └─ Adds Creative Opportunities block (anchor 2)                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3 — Configuration & artifacts                                     │
│                                                                         │
│  CLAUDE.md                                                              │
│    └─ design-integration: enabled | plugin-only | disabled              │
│                                                                         │
│  Spec frontmatter (added by /specify)                                   │
│    ├─ surface: frontend | backend | infra | mixed                       │
│    └─ design-intent: bold | quiet | minimal | delightful | onboarding   │
│                       | none (or comma-separated list)                  │
│                                                                         │
│  /flow argument                                                         │
│    └─ no-polish (skip the new polish phase)                             │
│                                                                         │
│  Project artifacts (created by /impeccable teach via /init)             │
│    ├─ docs/design/PRODUCT.md (lazy-loaded by pre-build mode)            │
│    └─ docs/design/DESIGN.md  (lazy-loaded by pre-build & polish modes)  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### Wrapper skill: `/claude-tweaks:design`

Six modes. Each mode runs two universal preconditions before dispatching:

1. **Detection (3 layers, in order):**
   - CLAUDE.md `design-integration` flag — if `disabled` → return `{skipped: "design integration disabled"}`.
   - Spec frontmatter `surface:` — if `backend` or `infra` → return `{skipped: "non-frontend spec (surface declared)"}`.
   - File-extension sniff fallback — check changed files for `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, or paths containing `components/`, `pages/`, `app/`, `routes/`. No matches → return `{skipped: "non-frontend (sniff)"}`.

2. **Availability check:**
   - For LLM modes: verify `/impeccable` skill resolves. Missing → return `{skipped: "Impeccable plugin not installed", install_hint: "..."}`.
   - For CLI mode: verify `npx impeccable --version` resolves. Missing → return `{skipped: "Impeccable CLI not installed", install_hint: "..."}`.
   - Logged once per session (de-dupe via in-memory marker), not per call.

**Mode reference:**

| Mode | Caller | Behavior | Modifies code |
|------|--------|----------|---------------|
| `shape <topic>` | `/specify` or user | Invoke `/impeccable shape <topic>`. Append output to design doc. | No |
| `pre-build <spec>` | `/build` | Lazy-load relevant Impeccable references (typography/color/spatial/etc.) plus project's `docs/design/PRODUCT.md` + `DESIGN.md` if present. Inject into build context. | No |
| `test <files>` | `/test` | Run `npx impeccable detect --fast --json <files>`. Parse output. Return findings as test results. Failures = test gate failure. | No |
| `review <spec>` | `/review` | Invoke `/impeccable critique` + `/impeccable audit` on changed UI files. Findings feed into review verdict. | No |
| `polish <spec>` | `/flow` polish phase | Auto-fit: `polish`, `clarify`, `harden`. Issue-driven: `typeset`/`layout`/`adapt`/`optimize` if matching audit findings exist. Intent-driven: dispatch per `design-intent:` frontmatter. | **Yes** |
| `survey <files>` | `/visual-review` and `/flow` summary | Analyze rendered screenshots and changed files. Produce ranked "Creative Opportunities" report (which `bolder`/`delight`/`animate`/`colorize` would help). Read-only. | No |

### Command map (auto-fit / issue-driven / intent-driven / never)

Lives in `skills/design/command-map.md`. Drives `polish` mode dispatch.

| Impeccable command | Category | When wrapper invokes |
|--------------------|----------|---------------------|
| `shape` | Auto-fit (pre-spec) | `/specify` shape pre-step |
| `polish`, `clarify`, `harden` | Auto-fit (polish phase) | Always when frontend, in polish phase |
| `critique`, `audit` | Auto-fit (review phase) | Always when frontend, in review phase |
| `typeset`, `layout`, `adapt`, `optimize` | Issue-driven | Only when `audit` flagged matching issue |
| `bolder`, `quieter`, `distill`, `delight`, `animate`, `colorize`, `overdrive`, `extract`, `onboard` | Intent-driven | Only when `design-intent:` frontmatter declares matching intent |
| `craft`, `teach`, `document`, `live` | Never (in flow) | `teach` runs once via `/init`; others available standalone only |

### Frontend detection (3 layers)

Lives in `skills/design/frontend-detection.md`.

**Layer 1 — Kill-switch:** Read `design-integration` from CLAUDE.md. Values: `enabled` (default after `/init` opt-in), `plugin-only` (skip teach mode), `disabled` (universal skip).

**Layer 2 — Frontmatter:** Read `surface:` from spec file. Values: `frontend`, `backend`, `infra`, `mixed`. `frontend` and `mixed` proceed; others skip.

**Layer 3 — Sniff:** When no spec or `surface:` missing, inspect changed files. Trigger extensions: `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`, `.sass`, `.less`, `.astro`, `.mdx`. Trigger path patterns: `/components/`, `/pages/`, `/app/`, `/routes/`, `/views/`, `/ui/`. Any match → frontend.

### CLI integration (`/test` gate)

Lives in `skills/design/impeccable-cli.md`.

`/test` invokes `/claude-tweaks:design test <changed-files>`. The wrapper runs:

```bash
npx impeccable detect --fast --json <files>
```

Output format (JSON):
```json
{
  "files_scanned": 12,
  "findings": [
    { "file": "src/components/Hero.tsx", "rule": "purple-gradient", "severity": "error", "line": 47 },
    ...
  ]
}
```

Wrapper parses; returns:
- `pass` if zero findings or only `severity: warning`
- `fail` if any `severity: error`

`/test`'s gate is updated: deterministic Impeccable findings count as test failures (errors only). Warnings appear in test output but don't fail the gate.

### `/init` integration

After existing project analysis, if frontend detected:

```
Detected frontend project. Set up Impeccable design integration?

1. Full integration **(Recommended)** — install Impeccable plugin + CLI, run /impeccable teach
2. Plugin only — install plugin, skip teach (run later via /claude-tweaks:design teach)
3. Skip — design integration disabled (re-enable later by re-running /init)
```

For options 1 or 2:
1. Surface plugin install command (claude-tweaks does not programmatically install plugins; user runs the command). Verify by checking `/impeccable` skill resolves.
2. Offer `npm install -g impeccable` with `npx` fallback. Verify with `npx impeccable --version`.
3. For option 1: invoke `/impeccable teach` → produces `docs/design/PRODUCT.md` + `docs/design/DESIGN.md`.
4. Write CLAUDE.md flag: `design-integration: enabled` or `plugin-only`.

**Re-run behavior:** On `/init` re-run with integration enabled, offer to re-run `teach` to refresh `DESIGN.md`.

### `/specify` polymorphic input + pre-steps

`/specify` accepts two input types:

| Input | Behavior |
|-------|---------|
| **Topic name** (new) | Invoke superpowers `/brainstorm` via Skill tool. Multi-turn conversation produces design doc. Then continue into shape + intent + decompose. |
| **Design doc path** (current) | Skip brainstorm. Continue into shape + intent + decompose. |

After design doc is settled (either freshly produced or pre-existing), `/specify` runs:

1. **Shape pre-step:** Detect frontend (sniff design doc contents). If frontend, offer:
   ```
   Run /impeccable shape to plan UX/UI before decomposition? (Recommended: yes)
   ```
   On yes: invoke `/claude-tweaks:design shape <topic>` → output appended to design doc.

2. **Intent question:**
   ```
   Design vibe for this spec? (sets design-intent frontmatter)
   1. Bold — eye-catching, confident
   2. Quiet — restrained, refined
   3. Minimal — strip to essence
   4. Delightful — personality, micro-interactions
   5. Onboarding — first-run flows, empty states
   6. None — no specific creative direction
   ```

3. **Decompose** into specs as today, now writing `surface:` and `design-intent:` frontmatter on each generated spec.

### `/flow` polish phase + re-verify gate

New default pipeline: `build → test → review → polish → re-verify → wrap-up` (was `build → test → review → wrap-up`).

**Polish phase:**
1. Invoke `/claude-tweaks:design polish <spec>`.
2. Wrapper dispatches auto-fit + issue-driven + intent-driven commands per command map.
3. Polish modifies code.
4. Pipeline proceeds to re-verify.

**Re-verify gate:**
1. Run `/test` with `skip-qa` flag set (types/lint/tests only).
2. Cap: one re-verify cycle per flow run.
3. Pass → proceed to wrap-up.
4. Fail → stop pipeline with "polish broke something" failure card. User resolves; can resume.

**New `/flow` argument:**

| Arg | Effect |
|-----|--------|
| `no-polish` | Skip polish + re-verify phases entirely. |

**Step list updates:**
- Default: `build,test,review,polish,wrap-up` (with `re-verify` bundled with `polish`)
- Auto-insert: if `polish` in step list and `re-verify` not, treat as bundled.

### `/visual-review` Creative Opportunities block

After existing visual review captures screenshots, invoke `/claude-tweaks:design survey <files>`. Append result to visual review report:

```markdown
### Creative Opportunities (from /visual-review)

| Page | Observation | Suggested command |
|------|------------|-------------------|
| /pricing | Hero feels generic — pure black on white, no personality | `/impeccable bolder pricing` |
| /empty-cart | Empty state shows only "No items" text | `/impeccable delight empty-cart` |
```

Survey-mode never runs commands — pure recommendations.

### `/flow` pipeline summary Creative Opportunities block

Pipeline summary (Step 3 of `/flow`) gets a new block before Next Actions:

```markdown
### Creative Opportunities

The polish phase ran the auto-fit + issue-driven commands. These could enhance the result further:

| Command | Why it might help |
|---------|------------------|
| `/impeccable delight checkout` | Empty-state opportunities at 3 points in the flow |
| `/impeccable colorize dashboard` | Heavy monochrome — strategic accent color recommended |

Each is a one-shot manual command; flow does not run these automatically.
```

Sourced from a final `/claude-tweaks:design survey` run on the full diff.

## Implementation phases

Single batch of work, three internal phases. Each phase is independently testable; all ship in v4.5.0.

### Phase 1 — Foundation & read-only integration

**Ships:**
- `skills/design/SKILL.md` skeleton with all 6 modes (some no-op until later phases)
- `skills/design/command-map.md`, `frontend-detection.md`, `impeccable-cli.md`
- 3-layer detection logic
- Availability checks
- `/init` Impeccable setup phase (install + teach + flag)
- `/test` invokes `/claude-tweaks:design test` (CLI detect)
- `/review` invokes `/claude-tweaks:design review` (critique + audit, read-only)

**Validation:** Detection accuracy (no false positives on backend specs, no false negatives on frontend). CLI gate produces correct pass/fail. Critique + audit reports surface in review output.

### Phase 2 — Polish phase + polymorphic specify

**Ships:**
- `/specify` polymorphic input (topic + design-doc)
- `/specify` shape pre-step + intent question
- Spec frontmatter additions (`surface:`, `design-intent:`)
- `/flow` new polish phase + re-verify gate
- `no-polish` flag on `/flow`
- `polish` mode auto-fit + issue-driven dispatch

**Validation:** Polymorphic specify works for both inputs. Shape pre-step appends correctly. Polish phase modifies code; re-verify catches breakage; cycle cap prevents oscillation. `no-polish` flag works.

### Phase 3 — Creative surfacing system

**Ships:**
- Intent-driven dispatch in `polish` mode (frontmatter → command)
- `/visual-review` Creative Opportunities block (anchor 2)
- `/flow` pipeline summary Creative Opportunities block (anchor 3)

**Validation:** Intent commands dispatch correctly per frontmatter. Survey reports surface relevant recommendations. Anchors appear in correct outputs.

## Open items

- **Impeccable CLI evolves on its own** — output format may change between releases. Mitigation: pin CLI version in availability check; fall back gracefully if `--json` flag changes.
- **Superpowers brainstorming terminal state coupling** — `/specify` topic input depends on detecting when brainstorming finishes (currently terminal state is "invoke writing-plans"). Mitigation: detect design-doc-was-written file event rather than terminal state.
- **Token cost measurement** — no baseline yet for how much polish phase adds per typical UI spec. Recommend instrumentation in Phase 1 (log Impeccable invocations to `~/.claude-tweaks/logs/design.jsonl` mirroring filter telemetry).
- **`/init` plugin install UX** — Claude Code does not programmatically install plugins; user has to run a command. The flow surfaces the command but cannot guarantee completion. Verify-by-resolve is the correctness gate.
- **New `skip-qa` flag on `/test`** — required by re-verify gate but does not exist today. Implementation plan must add this flag to `/test` (types/lint/tests only when set; QA validation skipped). Document in `/test`'s SKILL.md alongside existing args.
- **`/impeccable teach` output path** — design assumes `docs/design/PRODUCT.md` and `docs/design/DESIGN.md`, but actual output path is determined by Impeccable. Implementation plan must verify path; if Impeccable writes elsewhere, wrapper's `pre-build` mode lazy-loads from the actual location (and the assumed path is updated throughout this spec).

## Anti-patterns

| Pattern | Why It Fails | Escape hatch |
|---------|--------------|--------------|
| Running `polish` on a backend-only diff | Wastes tokens analyzing irrelevant files | Detection layer skips before invocation |
| Auto-running `bolder`/`overdrive` on every flow | Non-deterministic creative drift across runs | Intent-fit only — never auto |
| Polish phase modifying logic, breaking tests | Forces re-verify loop that may oscillate | Single re-verify cycle cap; on second failure, stop and present |
| Polish silently overriding `/simplify`'s work | Two skills fighting over the same code | Polish runs *after* simplify (different phases); `distill` is intent-only |
| Forcing Impeccable install at `/init` | Users who don't want design integration get blocked | `design-integration: disabled` flag short-circuits everything |
| Surfacing creative recommendations user has already declined | Annoying noise | Track declined recommendations per spec; suppress in re-runs (Phase 3) |
| Treating `/impeccable critique` output as authoritative | LLM critiques are opinionated; user judgment still required | Critique findings are advisory; user decides which to action |

## Testing strategy

**Unit tests (Node, `tests/`):**
- Frontend detection: positive and negative cases for sniff rules and frontmatter
- CLI output parsing: well-formed and malformed JSON
- Availability check: present and absent cases for plugin and CLI

**Integration tests (manual checklist):**
- `/init` setup flow: full, plugin-only, skip
- `/specify` topic input → brainstorm → shape → intent → decompose
- `/specify` design-doc input → shape → intent → decompose
- `/flow` on frontend spec: full pipeline including polish + re-verify
- `/flow` on backend spec: skipped at every wrapper invocation
- `/flow no-polish`: polish phase skipped
- Re-verify failure: pipeline stops correctly
- Creative Opportunities: appears in visual-review and pipeline summary

## Relationship to other skills

| Skill | Relationship |
|-------|--------------|
| `/init` | Adds Impeccable setup phase; writes `design-integration` flag |
| `/specify` | Polymorphic input; shape + intent pre-steps; writes `surface:` + `design-intent:` frontmatter |
| `/build` | Invokes `pre-build` mode for context loading |
| `/test` | Invokes `test` mode (CLI detect) as part of test gate |
| `/review` | Invokes `review` mode (critique + audit) as part of review |
| `/visual-review` | Invokes `survey` mode for Creative Opportunities block |
| `/flow` | New polish + re-verify phases; pipeline summary survey |
| `/wrap-up` | Receives polish-phase ledger entries |
| `/simplify` | Runs before polish; `distill` deferred to intent-only to avoid conflict |
| superpowers `/brainstorm` | Invoked by `/specify` for topic-input brainstorming |
| Impeccable plugin | All wrapper modes invoke commands from this plugin |
