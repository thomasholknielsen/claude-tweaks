---
record: 222
origin: human
risk: medium
size: high
ceremony: standard
grants: [build]
blocked-by: [216]
surface: skills
fingerprint: 2026-08-08-model-profile-strategy:dispatch-site-profile-sweep-and-session-inherit-protection
---
# 222: Dispatch-site profile sweep and session-inherit protection

Surface: skills
Parent: #215

Blocked by #216: assumes the contract's [Use: {Profile}] grammar and session-inherit protection rule exist for sites to conform to

## Overview

The conformance sweep: every dispatch site drops the old family-annotated tier vocabulary (`Standard (Sonnet)`, `[Use: Standard model]`) for the bare profile grammar (`[Use: Standard]`), and the session-inherit protection lands mechanically — `agents/qa-agent.md` gains `model`/`effort` frontmatter (closing the live leak where QA dispatches silently inherit a possibly-Fable session model), and `/journeys`/`/stories` get the explicit Fast declarations the contract already attributes to them. `bin/lib/coordination.js`'s interpolated strings update to the same grammar, with its `tier` parameter renamed `profile`. **"Profile" replaces "tier" as the vocabulary repo-wide for this axis** — same concept, new name; the sweep renames the word wherever it means this axis (`review-effort` tiers and record `size:` bands are different axes and keep their words).

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- `skills/_shared/multi-agent-coordination.md` and `skills/specify/red-team.md` — owned by #220; excluded here.
- `skills/build/SKILL.md` / `build-options.md` — owned by #217/#223.
- The contract file and CLAUDE.md (#216).
- Changing any site's *profile choice* — vocabulary + mechanism conformance only; every site keeps its pre-sweep tier, verified by diffing against the build's merge-base commit (the frozen baseline).

## Current State

**Site classification rule** (apply to every site the grep finds, including ones beyond this index): a site that issues Task/Agent dispatches is a **dispatch instruction** — it gets the grammar plus one resolver citation; a site that only names the profile for a reader (a table row, an upgrade note) is **declaration-only** — vocabulary swap alone.

Dispatch instructions: `skills/review/step3-lens-dispatch.md` (~61), `skills/review/step3-routing.md` (~140), `skills/review/ux-analysis.md` (~62), `skills/tidy/SKILL.md` (~65, 67), `skills/help/status-scan.md` (~13), `skills/browse/SKILL.md` (~111), `skills/visual-review/page-mode.md` (~35), `skills/visual-review/discover-mode.md` (~89), `skills/simplify/SKILL.md` (~67), `skills/test/qa-prompts.md` (~7), `skills/docs-health/SKILL.md` (~71), `skills/harness-health/SKILL.md` (~56), `skills/harness-health/judge-procedure.md` (~218), `skills/dispatch/SKILL.md` (~322), `skills/init/SKILL.md` (~265, 291), `skills/research/source-registry.md` (~143-145), and the `/journeys`/`/stories` dispatch blocks (locate by their `> **Parallel execution` markers — no line anchors recorded; `journeys/SKILL.md` references the contract near ~148).

Declaration-only: `skills/review/SKILL.md` (~249 table row); the tidy/browse/visual-review "upgrade to Capable when…" notes.

Code: `bin/lib/coordination.js` (~202/214/230 — `tier` param + prompt strings) and its tests. Agents: `agents/qa-agent.md` frontmatter has no `model:` key.

## Deliverables

- [ ] **First tasks: re-read #216's landed contract** (pull the exact grammar and resolver-citation form — the example below is provisional until then), and **re-verify open records #81/#155's live state** (`gh issue view` + `_shared/issue-claims.md` lock check) — the "none started" claim below is point-in-time.
- [ ] Every dispatch-instruction site: `[Use: {Profile}]` plus one resolver citation of the form `Resolve via node bin/resolve-profile.js {profile} (contract § Model Selection)` — exact wording from #216's landed text.
- [ ] Every declaration-only site: vocabulary swap; upgrade notes reworded to e.g. `Upgrade one profile on BLOCKED-for-reasoning (contract § Model Selection).`
- [ ] `agents/qa-agent.md` frontmatter gains `model: sonnet` and `effort: medium` — its caller is **`/test`** (`skills/test/qa-prompts.md`, which designates Standard); `effort: medium` is a stated per-agent judgment (browser-driven step execution, not deep analysis), since agent frontmatter effort is chosen per agent — profiles carry canonical efforts for *dispatches*, and an agent definition may set its own. The contract's inherit-protection rule (#216) is the general requirement this applies; **every future `agents/*.md` must carry `model:`** — omission is a defect, per that rule.
- [ ] `/journeys` and `/stories` dispatch blocks declare `[Use: Fast]`.
- [ ] `bin/lib/coordination.js`: param renamed `tier` → `profile`, prompt strings emit `[Use: ${profile}]`; tests updated.
- [ ] Acceptance greps (below) run and recorded.

## Acceptance Criteria

1. Sweep grep, run literally as (first demonstrated red on the pre-sweep tree, per IL-105):
   `find skills agents bin -type f \( -name '*.md' -o -name '*.js' \) -not -path 'skills/_shared/subagent-output-contract.md' -print0 | xargs -0 grep -niE '\((haiku|sonnet|opus|fable)\)|\[Use: (Fast|Standard|Capable|Frontier) model\]'`
   returns zero matches. (Path-anchored exclusion of exactly the contract file, per IL-34/IL-39; scope includes `agents/` and `bin/`, not just `skills/`.)
2. `agents/qa-agent.md` frontmatter parses with the new keys; a QA dispatch resolves sonnet regardless of session model.
3. `coordination.js` tests assert the new prompt-string shape and the renamed param.
4. Zero behavioral profile changes: the diff against the build's merge-base shows every site's profile word equal to its pre-sweep tier.
5. `npm test` green.

## Technical Approach

### Key Files

(the Current State index — ~17 skill files as a starting index with the grep as the enumerator, one agent definition, `bin/lib/coordination.js` + tests)

## Gotchas

- IL-52: if this sweep is dispatched as parallel implementers, they can't see each other's edits — the AC1 grep run centrally is the closing mechanism.
- Open records with file overlap: #81 (`skills/help/status-scan.md`), #155 (`skills/dispatch/SKILL.md`) — line-level disjoint from this sweep's edits, but re-verify at build start per the first task.
- Sites found by the grep beyond the index are classified by the stated rule, not skipped (IL-110: the index is a starting point, the grep is the enumerator).


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:dispatch-site-profile-sweep-and-session-inherit-protection -->
