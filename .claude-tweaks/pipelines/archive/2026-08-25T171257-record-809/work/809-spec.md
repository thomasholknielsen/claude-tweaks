---
record: 809
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 809: init/harness-health: a generated CLAUDE.md pipeline override (forbidding a named skill) is advisory-only and silently bypassed

Surface: backend

## Current State

A project's `/claude-tweaks:init`-generated CLAUDE.md can declare an explicit pipeline override (e.g. "brainstorming output routes to `/claude-tweaks:specify`, never `superpowers:writing-plans`") that is pure prose with no enforcement, and no health sweep checks whether it was actually followed. Reproduced: in a project with such a declared override, doing work that would normally reach for the forbidden skill resulted in the forbidden skill being invoked directly, with the CLAUDE.md override never referenced or re-checked, and a separately-run `/claude-tweaks:harness-health` not flagging the bypass — the override was silently violated three times in one session across roughly 24 hours, with the declared substitute skill never invoked at all.

## Deliverables

- Choose and implement at least one enforcement/detection mechanism for a declared CLAUDE.md pipeline override:
  1. **Enforcement** — a hook (PreToolUse or Skill-invocation gate) that refuses or warns when the forbidden skill is invoked in a project whose CLAUDE.md declares it overridden, naming the required substitute.
  2. **Detection** — a `/claude-tweaks:harness-health` check comparing which skills actually ran (from session/transcript evidence) against a project's declared overrides, flagging a bypass after the fact.
- Document which mechanism(s) were chosen and why, so a future reader knows whether overrides in this repo are enforced live or only audited retrospectively.

## Acceptance Criteria

- A project with a declared CLAUDE.md pipeline override either blocks/warns on the forbidden skill's invocation (enforcement path), or a `/claude-tweaks:harness-health` run flags a session that bypassed the override (detection path) — at least one of the two holds.
- The chosen mechanism correctly identifies the declared override and its named substitute from CLAUDE.md's existing prose convention, without requiring a new declaration format if the current one is already machine-parseable enough.
- `npm test` green, including new coverage for whichever mechanism is chosen.

## Technical Approach

Two independent mechanisms are on the table (Deliverables above); implement at least one, and document the choice rather than building both speculatively. Enforcement (hook-based) is the stronger guarantee but requires reliably parsing CLAUDE.md's pipeline-override prose into a machine-checkable rule at PreToolUse/Skill-invocation time — check whether `/claude-tweaks:init`'s generated CLAUDE.md sections already follow a consistent enough structure (e.g. this repo's own "Superpowers overrides" convention) to parse without a new declaration format. Detection (harness-health-based) is lighter-weight and matches this plugin's existing "audit, never edit" posture for health sweeps: compare the session's actual skill-invocation history against declared overrides and file a finding when a forbidden skill ran without its declared substitute appearing first. Given the observed incident (bypassed silently three times with zero self-correction), a detection-only fix that merely reports after the fact may not be sufficient on its own — weigh whether enforcement is warranted for at least the highest-severity override class before settling on detection alone.

### Key Files

- `plugin/skills/init/` — generated CLAUDE.md pipeline-override section; the declaration format enforcement/detection would parse
- `plugin/skills/harness-health/` — candidate location for the detection-path check
- `plugin/bin/lib/hooks/` — candidate location for the enforcement-path hook, if chosen
- `tests/` — new coverage for whichever mechanism is chosen

## Gotchas

- This defect is itself an instance of the class it describes at a meta level: this very repo's own CLAUDE.md carries a "Superpowers overrides" section (`/superpowers:brainstorming` routes to `/claude-tweaks:specify`, never `/superpowers:writing-plans`) — the fix chosen here should be validated against this repo's own override as a real test case, not just a synthetic one.
- Enforcement (mechanism 1) risks false positives if the override-parsing logic misreads a legitimate exception or a differently-worded override — start conservative (warn, not hard-block) unless the parsing proves reliable across multiple real CLAUDE.md examples.
- Detection (mechanism 2) depends on session/transcript evidence being available to `/claude-tweaks:harness-health` at audit time — confirm that evidence source exists and is reliable before committing to this path alone.
- Plugin version at filing: 6.87.0.

## Original request

init/harness-health: a generated CLAUDE.md pipeline override (forbidding a named skill) is advisory-only and silently bypassed

**Summary:** A project's `/claude-tweaks:init`-generated CLAUDE.md can declare an explicit pipeline override (e.g. "brainstorming output routes to `/claude-tweaks:specify`, never `superpowers:writing-plans`") that is pure prose with no enforcement, and no health sweep checks whether it was actually followed — it was silently violated three times in one session with no acknowledgment.

**Kind:** Defect

**Affected component:** `/claude-tweaks:init` (generated CLAUDE.md pipeline section); `/claude-tweaks:harness-health`

**Objective:** Instruction efficacy

**Repro steps:**
1. In a project whose `/claude-tweaks:init`-generated CLAUDE.md states a pipeline override — a named skill is forbidden, with a required substitute named instead.
2. Do work that would normally reach for the forbidden skill.
3. Observe the forbidden skill get invoked directly, with the CLAUDE.md override never referenced or re-checked, and `/claude-tweaks:harness-health` (run separately) not flagging the bypass.

**Expected vs. actual:**
Expected: a declared pipeline override is either enforced (a hook/refusal) or at minimum detectable after the fact (a harness-health check comparing which skills actually ran against the declared override).
Actual: the override is prose the model must re-notice on its own every time; in this session it was bypassed on all three uses of the forbidden skill across roughly 24 hours, with the substitute skill never invoked at all.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-1169e47b -->

