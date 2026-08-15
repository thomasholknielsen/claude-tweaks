# Policy Comprehension & Update — Design

**Date:** 2026-08-16
**Status:** Approved in brainstorming; ready for `/claude-tweaks:specify` decomposition
**Related:** #328 (read-path family — shipped foundation this builds on), #332 (parked rename program — untouched), #388 (init policy review — the render this design absorbs), #159 (parked work-record key home — untouched)

## Problem

The policy schema has grown to 48 levers, and every human-facing surface is developer-facing or buried:

- `_shared/policy-schema.md` is a contract doc for skill authors — canonical, but dense with implementation caveats, not readable as "what is this project configured to do."
- `/claude-tweaks:init --update`'s Policy Configuration Review (#388) is audit + optional detail render, met only when re-running init, and read-only.
- The `/flow` Manifesto shows ~9 pipeline levers out of 48, at ship time, not tune time.
- Updating policy means hand-editing YAML with no feedback until a later audit reveals a value was silently coerced to its default.

The 2026-08-11 investigation (#328) correctly concluded the *skills'* sprawl lived in the read architecture, not the names — but user comprehension is a different axis, unaddressed by the read-path fix.

**Target scenarios (ranked by the user):** (1) onboarding — "new project, what should I set?"; (3) periodic review/tuning — "show me my config, what's drifted, which defaults should I reconsider"; (2, secondary) behavior→lever lookup — handled push-style at decision surfaces, no dedicated lookup surface. The write path is a byproduct: conversational, validated edits — not a `set` subcommand.

## Design

### Phase 1 — Human-facing metadata in `POLICY_KEYS` (foundation)

Each row in `bin/lib/policy-schema.js` gains three required fields:

- `summary` — ≤ ~120 chars, plain language, phrased as *what changes when you move this lever*, not what the key stores.
- `category` — one of a small fixed set derived from `_shared/policy-schema.md`'s existing section headers (working list: `autonomy-trust`, `pipeline-behavior`, `merge-safety`, `health-sweeps`, `models`, `housekeeping`; finalize against the actual sections during implementation).
- `tier` — `core` | `advanced`. Core = the handful of levers with real behavioral consequences a project owner should consciously decide; advanced = tuning knobs.

A completeness test (same pinning pattern as `tests/hooks-gate-coverage.test.js`) asserts every `POLICY_KEYS` row carries all three fields, so a future lever cannot ship metadata-less.

**Deliberate non-duplication:** `summary` does not replace the .md table's Meaning column. They are different altitudes — one-liner for renderers vs. full contract semantics for skill authors. `_shared/policy-schema.md` documents the metadata contract (fields, allowed categories, the completeness pin) without restating the summaries.

**Deliberately NOT included:** a hard-coded recommendation matrix (per-classification recommended values as data). Recommendations are LLM judgment against live project signals (Phase 2), guided by category/tier. A recommendation table would drift; judgment reads the project as it is.

**CLI addition:** `bin/resolve-policy.js --all` — emits every key's `{value, source}` envelope plus its metadata (`summary`, `category`, `tier`, `type`, `default`) in one JSON object, so renderers don't enumerate 48 keys by hand. Composes with `--run` for the overlay. `model-profiles` keeps its existing carve-out semantics within the `--all` output.

### Phase 2 — `/help policy` mode

New mode file `skills/help/policy.md`; `skills/help/SKILL.md`'s argument table and `argument-hint` gain a `policy` row. Like `commands`, the mode skips the status scan and cheat sheet.

Render, driven by one `--all` call plus `auditPolicy()`:

1. **Set levers** — grouped by category: value, source, and the default each diverged from.
2. **Issues** — invalid values, unrecognized keys, CLAUDE.md-stranded (`migratableKeys`) — inline, not deferred to init.
3. **Notable defaults** — core-tier levers still on schema defaults where project signals argue otherwise (examples: `autonomy: supervised` on a repo with standing `auto:merge` grants; no `integration-model` resolution recorded on a forge-backed repo). LLM judgment, each with a one-line why. Bounded: only core tier is judged; advanced levers are never "notable."
4. **Advanced tier** — collapsed to a count, expandable on request.

The mode ends with /help's standard `## Next Actions` `AskUserQuestion`: the top recommended edits as selectable options (each labeled with lever, proposed value, one-line why), plus "expand advanced" and "no changes." A chosen edit is validated through `resolveValue` **before** writing — a rejected enum value never reaches the file — and confirmed by re-running `auditPolicy()` after the write (fail loud on any new issue). Every recommendation row is directly applicable, never information-only.

The mode's render contract is the single renderer — Phase 4 makes init cite it.

### Phase 3 — Push attribution at decision surfaces

`_shared/auto-decision-log.md`'s line format gains an **optional** trailing field: when a decision was governed by a policy/config lever, the line names it with value and source — e.g. `[lever: automerge-max-lines=40 (default)]`. The Review Console's row template carries the field through when present.

Expand-only contract change: existing logs stay valid; the auto-mode contract states the convention once; skills adopt it as their decision-logging prose is touched (no big-bang sweep of every logging site in this phase — the contract change plus the console renderer plus the highest-traffic sites: dispatch's auto-merge gate and flow's policy-driven decisions).

### Phase 4 — Init delegation

`skills/init/policy-review.md`'s "Show details" render stops owning its own presentation and cites `skills/help/policy.md`'s render contract (one renderer, two entrances). The one-line-count-never-skipped behavior and the low-friction skip stay exactly as #388 shipped them.

Bootstrap's existing policy questions (steps 06/18/20) are untouched — init still owns onboarding — but init's final summary gains one line pointing at `/claude-tweaks:help policy` as the standing review surface, and init's question prose may cite Phase 1 summaries instead of restating lever semantics.

### Phase 5 — `worktree.always` exemption for `policy.yml` (separate release)

Under `worktree.always`, Phase 2's apply step is gate-denied in a main checkout: the only current exemption is `.claude-tweaks/pipelines/`. Extend the gate:

- **Edit/Write/NotebookEdit** to `.claude-tweaks/policy.yml` are exempt (plugin-owned config; a one-line config change should not require worktree ceremony).
- **`git commit`** is exempt when the staged set is a subset of `{.claude-tweaks/policy.yml}` — so the applied edit doesn't strand as main-checkout dirt (a known incident pattern). A commit staging policy.yml *plus anything else* stays gated.

This widens the test-pinned `GATE_COVERAGE` contract: the canonical coverage block in `_shared/policy-schema.md`, the exported constant in `bin/lib/hooks/pre-tool-use.js`, and `tests/hooks-gate-coverage.test.js` move together — the exact discipline the #138 pin exists to enforce. Push remains gated; ambiguity (cannot determine the staged set) resolves to the existing deny posture for commits, matching the gate's provability rule in the deny direction because the exemption — not the deny — is the new claim requiring proof.

**Rejected fallback:** the mode handing the user a paste-ready command instead of applying the edit. Kept as the degraded path only if the gate change is reverted.

## Docs & cross-reference obligations

- `docs/plugin-structure.md` — sub-file table gains `skills/help/policy.md`.
- `docs/skill-graph.md` — help↔init delegation edge (init policy review cites help's render contract).
- `_shared/policy-schema.md` — metadata contract (Phase 1) and the widened coverage block (Phase 5).
- `_shared/auto-decision-log.md` + review-console prose — lever attribution field (Phase 3).
- `/help` reference-card and argument docs — the new mode.

## Release shape

- **Minor release A:** Phases 1–4 (foundation + surfaces; self-contained, no enforcement change).
- **Minor release B:** Phase 5 (gate widening, isolated so it can be judged and reverted independently).

## Decision rationale (rejected alternatives)

- **Top-level `/claude-tweaks:policy` skill** — rejected for command sprawl; /help already has an argument-dispatched mode system and is the plugin's orientation front door. The only real loss was a `set` subcommand, which was the weakest part of the idea anyway: in a conversational harness, "set autonomy to trusted" *is* the write path, provided validation happens at the boundary.
- **No new surface (upgrade init + /help prose only)** — rejected: scenario 3's natural trigger is "how is this project configured?", and "run `/init --update` and sit through its other drift checks" fails that user.
- **Posture profiles** (named opinionated value bundles; policy.yml records posture + divergences) — deferred, not rejected. Most leverage on comprehension, but a new abstraction the schema must maintain, with marketplace-migration and #332 interactions. Phase 2's notable-defaults judgment is the cheap form; profiles remain a possible later layer if that machinery proves itself.
- **Recommendation matrix as schema data** — rejected in favor of judgment; see Phase 1.
- **Pull-based behavior→lever lookup surface** — rejected per user direction; push attribution (Phase 3) covers the scenario at lower cost.
