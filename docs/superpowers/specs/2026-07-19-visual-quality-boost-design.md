# Visual Quality Boost — Rename `design` → `design-wrapper`, Close the Blandness Gap — Design

## Goal

Fix two related problems with the plugin's Impeccable integration: (1) frontend output produced through claude-tweaks too often reads as bland/generic despite Impeccable being installed, and (2) there is no point in the pipeline where the user gets to compare a few different visual directions before one gets built. Also rename the `claude-tweaks:design` skill to `claude-tweaks:design-wrapper`, since its actual job (a thin dispatcher to the separately-installed Impeccable plugin) is no longer well described by "design" now that it's gaining more surface area.

## Motivation

Tracing the current pipeline for a frontend feature end to end shows why blandness is the default outcome, not an occasional miss:

- `/specify`'s shape pre-step calls Impeccable `shape`, which produces a **text-only** design brief. Shape's own Visual Direction Probe (2-4 mockup directions before writing the brief) is gated on native image generation, which this harness (Claude Code) does not have — so it always skips here.
- `/build` never invokes Impeccable `craft` at all (only `shape`); `command-map.md` already documents `craft` as "Never (in flow): manual standalone only," for good reason — craft's own multi-round interactive interview would break both `/flow`'s no-mid-flow-stops auto-mode contract and `/dispatch`'s unattended execution model. So the discipline craft embeds — land a visual direction, then browser-critique against an explicit AI-slop-test checklist — never happens anywhere in the claude-tweaks build path today.
- `bolder`/`delight`/`colorize`/`overdrive` only ever run when a spec explicitly declares `design-intent:` at `/specify` time, which defaults to `none`.
- `/visual-review`'s `survey` mode is advisory-only by explicit design (preserving creative-direction agency) — it renders a markdown table of suggestions the user has to notice and manually retype a command from. It never applies anything.
- Impeccable's own `audit` command already scores an "Anti-Patterns (CRITICAL)" dimension — explicitly the "does this look AI-generated" check — and already tags each finding with a `suggestion` field naming the best-fit remediation command (`bolder`, `colorize`, `delight`, etc.). But `design`'s `review` mode only persists **audit** findings to the cache `polish` mode reads (critique findings never reach it), and `polish` mode's issue-driven dispatch table (`command-map.md`) only has rows for typography/spacing/responsive/performance — there is no row for the Anti-Patterns category at all. The signal already exists in Impeccable's own output; claude-tweaks simply never wires it to anything.

Separately, Impeccable ships a genuinely capable non-image-gen variant tool — `/impeccable:impeccable live` — that lets a human pick an element in their own browser, generate three real HTML/CSS variants with live parameter tuning, and accept one into source. claude-tweaks never surfaces it anywhere.

## Architecture

### A. Rename `design` → `design-wrapper`

Rename `skills/design/` to `skills/design-wrapper/` and the skill's `name:` frontmatter from `claude-tweaks:design` to `claude-tweaks:design-wrapper`. This matches existing internal vocabulary rather than introducing a new term: the skill's own first sentence already calls itself a "Wrapper skill," and `_shared/design-wrapper-handling.md` already uses "design-wrapper" as the caller-side contract name.

Every reference to the old name must move — both the fully-qualified form (`/claude-tweaks:design <mode>` in step bodies and Next Actions blocks) and the bare form (`/design` in prose and Relationship-to-Other-Skills tables) — across every caller: `/test`, `/review`, `/build`, `/flow`, `/specify`, `/visual-review`, `/wrap-up`, `/tidy` (the `extract` cross-spec mention), `_shared/auto-mode-contract.md`, `_shared/design-wrapper-handling.md`'s own content (not its filename — that name is already correct), `help/reference-card.md`, `help/context-flow.md`, and root `CLAUDE.md`'s skill listings (Component category, "Skills with sub-files" table). This is a wide, easy-to-under-scope rename — see Testing below for the required verification sweep.

Do **not** rename `design-integration` (the CLAUDE.md kill-switch flag), `design-intent` (the body-metadata line), `Design-intent:`, `design doc`, `DESIGN.md`, or `design-pre-steps.md` — none of these refer to the skill itself, and a rename sweep must not touch them.

### B. `/flow` auto-mode fix — dispatch the Anti-Pattern category

No new interactive surface. Two small, additive changes to existing, already-auto-approved machinery:

1. **`command-map.md`** gains a new issue-driven row: category keywords `anti-pattern`, `ai slop`, `ai-generated`, `generic` map to **"dispatch whichever command the finding's own `suggestion` field names"** rather than one fixed command — Impeccable's `audit` already picks the best-fit remediation (`bolder`, `colorize`, `delight`, `typeset`, or others) per finding; claude-tweaks should trust that judgment the same way it already trusts audit's typography/layout/responsive/performance categorization.
2. **`modes/polish.md` Step 5** (issue-driven dispatch) is extended: when a cached finding's `category` matches the new keywords, read its `suggestion` field, validate the named command is not one of the three manual-only commands (`colorize`, `extract`, `overdrive` — these stay off-limits for auto-dispatch per the existing rationale that they produce the most aggressive creative drift). If it passes, dispatch it like any other issue-driven command. If the suggested command **is** manual-only, do not dispatch — instead add it to the same STAGED-at-Review-Console path `survey` recommendations already use, so the user still sees it without the pipeline silently applying an aggressive creative change.

This closes the actual gap: `audit`'s Anti-Patterns dimension already flags blandness/genericness objectively (it's the same tier of check as the anti-pattern CLI detector already gating `/test` — not a subjective taste call), but nothing currently reads that signal. No change to reversibility/confidence/severity floors, no change to the auto-decision log format — this is a same-shape addition to a table that already dispatches unconditionally under `auto`.

### C. `/specify` shape-time — throwaway scaffold + `live` mode

After the shape brief is confirmed (existing Step 2.5b), add a front-door-confirm follow-up, offered once, interactive only (this step has no auto-mode branch — it requires a human in a browser by construction, same reason `live` mode itself is "non-interactive" is not a supported concept for it):

> "Want to compare a few real variants of \[primary surface] before I build it for real? I'll put together a quick throwaway version and let you pick a direction in the browser." — **(Recommended)** / Skip, go straight to `/build` from the text brief.

On accept:

1. Generate a minimal, disposable static HTML scaffold of the primary surface described in the brief — realistic placeholder content per the brief's Key States / Content Requirements sections, no real data wiring, no routing, no framework integration. This is throwaway: fast to produce, not the final implementation.
2. Serve it on an ephemeral port, reusing the existing ephemeral-server mechanism from `_shared/dev-url-detection.md`.
3. Hand off to `/impeccable:impeccable live` against the scaffold. The human picks elements, explores axis-based variants (hierarchy / layout topology / color strategy / density — live's own Phase C axes), tunes parameters, and accepts a direction.
4. The accepted, carbonized scaffold file is committed alongside the design doc, and a new body-metadata line — `Visual-reference: <path>` — is written onto the generated record(s), the same way `Surface:` and `Design-intent:` are today.
5. `design-wrapper`'s `pre-build` mode loads the referenced scaffold file (when present) alongside the text brief and Impeccable reference docs, so the build subagent has a concrete, already-selected direction to port into the real app's architecture — not just prose to interpret.

This is the "sampled and selected starting ground": the taste call (which direction) happens before the real build, on a cheap disposable artifact, not after a full build attempt.

**Open implementation detail, not resolved by this design doc:** `live` mode's `config.json` scopes which files it injects into, and first-time setup (CSP detection, file-glob config) is somewhat heavier machinery than a single throwaway pre-build scaffold wants. The exact mechanics — whether the scaffold gets added to an existing project's live config temporarily, or opened as a bare static file per `live.md`'s "OR a static HTML file open in the browser" allowance — need to be confirmed against `live.mjs`'s actual behavior during planning, not asserted here.

### D. Standalone `/visual-review` — opt-in boost

At the end of the existing report (after today's Step 6 / Creative Opportunities survey), when `/visual-review` is running standalone and interactive — no `$PIPELINE_RUN_DIR` set, the same signal the skill's Component-Skill Contract already uses to decide whether to render Next Actions — add a front-door-confirm gate:

> "Want me to go further?" — **Fix flagged issues (Recommended)** / Explore alternatives / Both / No thanks, just the report.

- **Fix flagged issues** — invoke `design-wrapper`'s `review` mode (currently `/review`-only) against the reviewed surface to run `critique` + `audit`. Render the resulting findings as the standard batch table with recommended fixes pre-filled, followed by the standard apply-all/override `AskUserQuestion` gate (per the project's existing multi-item-decision convention). Apply accepted fixes, then re-verify (mirrors `/flow` polish phase's re-verify obligation, scoped locally to this session rather than pipeline-wide).
- **Explore alternatives** — hand off to `/impeccable:impeccable live` against the already-running app, for open-ended variant generation and in-browser tuning.

This makes standalone `/visual-review` code-modifying in this specific, explicitly opted-into path — a documented exception to its current read-only contract (only `polish` mode modifies code today). The gate is opt-in and off by default in the sense that it always asks; it is never silent. When `/visual-review` is parent-invoked (`$PIPELINE_RUN_DIR` set — via `/review` or `/init`), this step does not apply; behavior there is unchanged.

### E. Cross-cutting — Creative Opportunities gets a real apply-gate

`survey` mode's recommendation block (rendered by `/visual-review` and `/flow`'s pipeline summary) currently ends as inert markdown — a house-style gap, since every other multi-item recommendation in this plugin ends in a batch apply-all/override gate. Fix, scoped by the same `$PIPELINE_RUN_DIR` signal used elsewhere:

- **Standalone, interactive** (no `$PIPELINE_RUN_DIR`): render the existing table, then the standard apply-all/override `AskUserQuestion`. Accepting an item invokes that one suggested command directly (deterministic single-command dispatch through `design-wrapper`, not variant generation), then re-verifies.
- **`$PIPELINE_RUN_DIR` set** (parent-invoked — `/flow` or another orchestrator): unchanged. Recommendations continue to flow into the Wrap-Up Review Console, per the existing bookend architecture.

## Code Changes

| File | Change |
|---|---|
| `skills/design/` → `skills/design-wrapper/` (directory rename) | Rename skill; update `name:` frontmatter in `SKILL.md` |
| `skills/design-wrapper/command-map.md` | Add Anti-Pattern/AI-slop/generic issue-driven row (dispatch = finding's own `suggestion`, filtered through the manual-only exclusion list) |
| `skills/design-wrapper/modes/polish.md` | Step 5: read `suggestion` field for Anti-Pattern-category findings; whitelist-check; stage instead of dispatch when the suggestion is manual-only |
| `skills/design-wrapper/modes/pre-build.md` | Load `Visual-reference:` scaffold file when present |
| `skills/design-wrapper/SKILL.md` | New `live` mode: thin availability-checked dispatcher to `/impeccable:impeccable live`, used by both Context C and Context D |
| `skills/specify/design-pre-steps.md` | Step 2.5b gains the throwaway-scaffold + `live`-mode follow-up (interactive only, front-door confirm); documents the new `Visual-reference:` body-metadata line |
| `skills/specify/spec-template.md` | Document `Visual-reference:` in the body-metadata block description |
| `skills/build/design-prebuild.md` | Note the scaffold-informed build path when `Visual-reference:` is present |
| `skills/visual-review/SKILL.md` / `browser-review.md` | New standalone-only "boost" gate after the existing report; Component-Skill Contract note on the code-modifying exception; Anti-Patterns table row updated to reflect the new explicit opt-in (superseding "auto-running suggestions is never allowed" as a blanket statement — it still holds for silent auto-application, not for this explicit consent path) |
| Every `/claude-tweaks:design` caller (`/test`, `/review`, `/build`, `/flow`, `/specify`, `/visual-review`, `/wrap-up`, `/tidy`) | Update fully-qualified and bare skill references to `design-wrapper` |
| `_shared/auto-mode-contract.md`, `_shared/design-wrapper-handling.md` | Update content references to the renamed skill |
| `help/reference-card.md`, `help/context-flow.md`, root `CLAUDE.md` | Update skill listings and command catalog for the rename |

This is markdown/skill-procedure content throughout — no new `bin/` code, no new CLI.

## Testing

No `bin/lib/*` unit tests apply (this is prose-procedure content, not executable code). Verification is read-through plus grep, following the same convention this repo already uses for markdown-only design changes:

- **Rename sweep:** grep the whole repo for `claude-tweaks:design` and bare `/design` in skill-name position (word-boundary, e.g. `` /design `` followed by a mode keyword or backtick/space, not `/design-` prefix matches), confirming zero hits outside the renamed directory and confirming `design-intent`, `design-integration`, `design doc`, `DESIGN.md`, and `design-pre-steps.md` are all untouched. Do this as its own explicit pass, not folded into the content edits — this repo's own CLAUDE.md documents this exact rename-completeness failure mode recurring multiple times.
- **Cross-reference check:** every caller skill's Relationship-to-Other-Skills table entry for the wrapper, on both sides (bidirectional, per this repo's own convention).
- **Manual walkthrough:** trace one frontend spec through `/specify` → `/build` → `/flow` by reading the edited files in sequence to confirm the new `Visual-reference:` line and the new issue-driven dispatch row actually connect end to end (this repo's CLAUDE.md separately documents several past incidents where a producer's output shape didn't match what the documented consumer actually read — worth an explicit trace here given three new touch points share the audit-cache and body-metadata contracts).

## Non-Goals (explicitly parked / out of scope)

- **Fixing craft's own image-gen-gated Visual Direction Probe.** Not touched — Context C substitutes a `live`-mode-driven throwaway scaffold instead of trying to make the image-gen path work in a harness that doesn't support it.
- **Any change to `critique.md`/`audit.md`/`live.md` themselves.** These are Impeccable's own files, outside this repo. This design only wires claude-tweaks to consume signals they already produce.
- **Auto-mode variant generation or auto-selection.** Explicitly ruled out — picking between creative directions is a taste call, and the existing contract already treats "creative direction is user-only when explicitly left open" as something `auto` does not silence. Context B and D's variant tooling only ever runs with a human present.
- **Retroactively improving already-built, already-shipped surfaces.** This design changes the pipeline going forward; it does not sweep existing code for blandness.
- **Decomposition into specific work records.** This design doc is expected to decompose into multiple leaf records at `/specify` time (at minimum: the rename, Context B/C's audit-dispatch wiring, Context C's shape-scaffold flow, Context D's visual-review boost, and the cross-cutting survey apply-gate) — this doc does not prescribe those boundaries.

## Known Touch Points

- `_shared/design-wrapper-handling.md` — the canonical caller-side return-shape contract; needs its `live` mode's return shape documented alongside the existing modes once Context C/D's dispatcher is designed at planning time.
- `_shared/dev-url-detection.md` — Context C's ephemeral-server reuse depends on this file's existing "Ephemeral server start" mechanism; read directly during planning rather than re-deriving it.
- `command-map.md`'s existing manual-only rationale ("the three excluded commands produce the most aggressive creative drift") — Context B's whitelist filter depends on this list staying exactly `colorize`/`extract`/`overdrive`; if that list ever changes, the filter needs to change with it.
- `skills/visual-review/SKILL.md`'s existing Anti-Patterns row, "Auto-running commands suggested by the Creative Opportunities block" — Context D and the cross-cutting fix both narrow this row's scope (explicit human consent is now allowed); the row needs rewording, not deletion, since silent auto-application is still forbidden.
