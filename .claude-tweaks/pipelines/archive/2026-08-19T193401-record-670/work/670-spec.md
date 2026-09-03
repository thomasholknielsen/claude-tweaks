---
record: 670
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 670: Reconcile resolve-profile.js invocation form — Subagent Contract says repo-local, skill-authoring.md says ${CLAUDE_PLUGIN_ROOT}; ~10 dispatch sites use the non-portable form

Surface: backend

## Current State

`skills/_shared/subagent-output-contract.md`'s §Model Selection documents the dispatch resolver call as `node bin/resolve-profile.js {profile}` "from the checkout root", with a parenthetical justifying that repo-local form by citing #170 ("`${CLAUDE_PLUGIN_ROOT}` is not reliably set in Bash tool calls ... the repo-local invocation above is the documented form"). `docs/skill-authoring.md`'s "Plugin-root references (`CLAUDE_PLUGIN_ROOT`)" section states the opposite convention for every `skills/**/*.md` file: write `node "${CLAUDE_PLUGIN_ROOT}/bin/{cli}.js" …` as a model-resolved placeholder — never a shell-evaluated env var, and never a repo-relative path — because the executing agent substitutes the absolute plugin root itself (from the Skill tool's "Base directory for this skill:" line), not the shell.

A grep sweep of the current tree (2026-08-17) confirms both forms are live in `skills/**/*.md`: three sites already use the placeholder form (`skills/design-wrapper/modes/review.md:189`, `skills/feedback/SKILL.md:254`, `skills/feedback/session-evaluation.md:40`), while roughly 20 call sites across `skills/_shared/subagent-output-contract.md` itself and its dispatch consumers (`skills/browse`, `skills/init` ×3, `skills/review` ×5, `skills/tidy`, `skills/test/qa-prompts.md`, `skills/specify/red-team.md` ×3, `skills/simplify/SKILL.md`, `skills/dispatch/task-prompt.md` ×2, `skills/build/SKILL.md`, `skills/wrap-up/curation-engine.md`, `skills/reflect/SKILL.md`, `skills/help/status-scan.md`, `skills/visual-review` ×2, `skills/research/source-registry.md`) still use the repo-local `node bin/resolve-profile.js {profile}` form the contract's own parenthetical documents as correct. A consuming project (this plugin installed into someone else's checkout) has no `bin/resolve-profile.js` at its cwd, so every repo-local-form dispatch site fails to resolve a profile there — only this repo's own dogfooding cwd happens to make it work. No conformance test today pins that the two files' invocation forms agree with each other; nothing currently prevents them drifting apart again after this fix lands.

## Deliverables

1. Amend `skills/_shared/subagent-output-contract.md` §Model Selection: replace the `node bin/resolve-profile.js {profile}` invocation and its `${CLAUDE_PLUGIN_ROOT}`-is-unreliable parenthetical with the `docs/skill-authoring.md`-conformant placeholder form — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" {profile}` — and either drop the #170 parenthetical or rephrase it to state the resolution mechanism `docs/skill-authoring.md` documents (the agent substitutes the absolute path from the Skill tool's "Base directory for this skill:" line; the harness does not set the env var in Bash tool calls, so a verbatim run needs that substitution regardless of which spelling is written).
2. Sweep every dispatch-site invocation of `bin/resolve-profile.js` under `skills/**/*.md` from the repo-local form (`node bin/resolve-profile.js {profile} ...`) to the placeholder form (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" {profile} ...`), preserving each call's existing flags (`--run-dir "$PIPELINE_RUN_DIR"`, `--unattended`, `--frontier-used N`) verbatim. Confirmed sites from the 2026-08-17 grep sweep: `skills/browse/SKILL.md`, `skills/init/SKILL.md` (×2), `skills/init/claude-md-template.md`, `skills/review/step3-routing.md`, `skills/review/step3-debate-and-refutation.md` (×3), `skills/review/step3-lens-dispatch.md`, `skills/review/ux-analysis.md`, `skills/tidy/SKILL.md`, `skills/test/qa-prompts.md`, `skills/specify/red-team.md` (×3), `skills/simplify/SKILL.md`, `skills/dispatch/task-prompt.md` (×2), `skills/build/SKILL.md` (the actual invocation at what is currently line 207 — not the descriptive, non-invocation mention at line 203, which names the file without instructing an invocation and needs no edit), `skills/wrap-up/curation-engine.md`, `skills/reflect/SKILL.md`, `skills/help/status-scan.md`, `skills/visual-review/discover-mode.md`, `skills/visual-review/page-mode.md`, `skills/research/source-registry.md`. Re-grep at implementation time rather than trusting this list as exhaustive — concurrent sessions may add or remove sites before this record is built. Leave the already-conformant sites (`skills/design-wrapper/modes/review.md`, `skills/feedback/SKILL.md`, `skills/feedback/session-evaluation.md`) untouched.
3. Add a `node --test` conformance test (new file under `tests/`, following the existing skill-prose-conformance-tests pattern) that greps `skills/**/*.md` for `resolve-profile.js` invocations and fails if any use the repo-local `bin/resolve-profile.js` spelling instead of the `"${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js"` placeholder — so the two conventions cannot silently diverge again.

## Acceptance Criteria

- `skills/_shared/subagent-output-contract.md` §Model Selection's dispatch instruction reads `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" {profile}` and no longer states or implies the repo-local form is "the documented form".
- `grep -rn 'node bin/resolve-profile\.js' skills/**/*.md` (or an equivalent recursive grep) returns zero matches — every prior repo-local-form site now uses the placeholder spelling.
- Every site listed in Deliverable 2, plus the three already-conformant sites, now (or still) uses the exact placeholder spelling `"${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js"`.
- The new conformance test fails when run against a fixture/string containing the repo-local form and passes against the corrected tree; `npm test` passes in full (all suites, no new failures) after the sweep.
- `skills/build/SKILL.md`'s descriptive (non-invocation) mention of `bin/resolve-profile.js` at its current line 203 is left as-is — the fix targets invocation instructions, not every textual mention of the filename.

## Technical Approach

Straightforward find-and-replace sweep across skill markdown files — no code/runtime changes, `bin/resolve-profile.js` itself is untouched; only the prose instructing an agent how to invoke it changes. Do the contract amendment (Deliverable 1) first since it's the canonical source the sweep aligns to, then the mechanical sweep (Deliverable 2), then the conformance test (Deliverable 3) last so it's written against the already-corrected tree and proven to fail on a synthetic bad-fixture before being trusted (per `skill-prose-conformance-tests`'s byte-pin / can-it-go-red discipline). Match `docs/skill-authoring.md`'s exact prescribed spelling — double-quoted `"${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js"` — verbatim, not a close paraphrase, since that's what the new conformance test pins.

## Gotchas

- Don't touch `skills/build/SKILL.md` line 203's descriptive mention ("enforced by `bin/resolve-profile.js` per dispatch") — only line 207's actual invocation needs the placeholder form; conflating the two over-broadens the sweep past what the finding describes.
- `skills/design-wrapper/modes/review.md`, `skills/feedback/SKILL.md`, and `skills/feedback/session-evaluation.md` are already correct — re-touching them risks diff-noise, or worse, reverting them back to the wrong form by a careless sweep script.
- The conformance test must prove it can actually go red (byte-pin / fixture-based per `skill-prose-conformance-tests`'s pattern) — a test that can never fail is not a pin.
- This issue's own body cites `#170` as the tracker for "`CLAUDE_PLUGIN_ROOT` unreliable in Bash tool calls" — that empirical fact is not being disputed or re-litigated here; only the prose *spelling convention* skills should use in light of it is being reconciled, per `docs/skill-authoring.md`'s already-decided resolution (agent-side substitution, not shell env reliance).
- The exact list of ~20 sites in Deliverable 2 was captured at shaping time (2026-08-17) — re-grep before editing since sibling sessions may have shipped changes to these files since.

## Original request

Reconcile resolve-profile.js invocation form — Subagent Contract says repo-local, skill-authoring.md says ${CLAUDE_PLUGIN_ROOT}; ~10 dispatch sites use the non-portable form

**Category:** tangential
**Severity:** med
**Reversibility:** high
**Source:** hindsight mode, `/claude-tweaks:review` of #598 (run `2026-08-16T160107-spec-597-595-598-599-601`)
**Files:** skills/_shared/subagent-output-contract.md, docs/skill-authoring.md, skills/browse/*, skills/init/*, skills/review/*, skills/tidy/*, skills/test/qa-prompts.md, skills/specify/*, skills/simplify/SKILL.md, skills/dispatch/*

## Finding

`skills/_shared/subagent-output-contract.md` §Model Selection tells dispatch sites to run `node bin/resolve-profile.js {profile}` "from the checkout root" and parenthesizes that `${CLAUDE_PLUGIN_ROOT}` is unreliable (#170). `docs/skill-authoring.md` §Plugin-root references — the mandated convention for every `skills/**/*.md` — says the opposite: keep the `${CLAUDE_PLUGIN_ROOT}` spelling as a model-resolved placeholder, never a repo-relative path. The repo-local form only works when the plugin source *is* the cwd (this repo dogfooding itself); a consuming project has no `bin/resolve-profile.js` in its checkout, so every dispatch site written that way (browse, init ×2, review ×4, tidy, test/qa-prompts, specify, simplify, dispatch — per the #598 whole-branch review's survey) fails to resolve a profile there. During #598 the two conventions produced opposite review findings on the same line (the whole-branch reviewer asked for repo-local; the 3a reproduction pair flagged it back).

## Suggested resolution

Amend the contract's §Model Selection parenthetical to the skill-authoring rule (placeholder, model-resolved), then sweep the dispatch sites to `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js"`; pin with a conformance grep so the two files cannot disagree again.

