---
record: 301
origin: harness-health
risk: low
size: low
ceremony: fast-lane
grants: []
surface: skills
---
# 301: Skill best-practice: upstream-drift — Anti-Patterns

Surface: skills

## Current State

The context-cost bloat scan flagged the Anti-Patterns row at `.claude/skills/upstream-drift/SKILL.md:123` as 614 bytes against a corpus median of 158 bytes (flag threshold 316 bytes) — more than 2x. The row has absorbed the reason it was added (Anthropic's documented claim, the specific live-sandbox test, the `~/.claude/plugins/` absence) rather than stating the anti-pattern concisely and pointing to the incident account. That full narrative already lives canonically in `docs/incident-log.md`'s `## IL-113` section (line 785), so restating it here pays context cost on every invocation of this skill without adding guardrail value beyond the pointer.

## Deliverables

Replace the row's second column in `.claude/skills/upstream-drift/SKILL.md`'s Anti-Patterns table:

**Current:**
```
| Treating an upstream's documented *runtime behavior* as an assertion this repo can rely on | A doc describes intent, not what the environment does. Anthropic's own docs state that plugins declared in a repo's `.claude/settings.json` are "installed at session start"; measured in a live cloud sandbox with every stated precondition satisfied, `~/.claude/plugins/` did not exist at all (`[IL-113]`). A behavioral claim is only a contract once a fixture executes it in the target environment — until then it is an upstream assertion this repo has adopted, which is precisely the drift class this skill exists to catch |
```

**Proposed:**
```
| Treating an upstream's documented *runtime behavior* as an assertion this repo can rely on | A doc describes intent, not what the environment does — a behavioral claim is only a contract once a fixture executes it in the target environment; until then it is an upstream assertion this repo has adopted, precisely the drift class this skill exists to catch. See `[IL-113]` for the sandbox measurement that surfaced this |
```

## Acceptance Criteria

- The Anti-Patterns row about treating upstream's documented runtime behavior as a contract points to `[IL-113]` instead of re-narrating the full incident inline.
- The row's core claim ("a behavioral claim is only a contract once a fixture executes it in the target environment") is preserved — only the inline incident narrative is trimmed to a pointer.
- `[IL-113]` still exists in `docs/incident-log.md` and its content still matches what the pointer implies (verified before editing).
- No other content in `.claude/skills/upstream-drift/SKILL.md` changes.

## Technical Approach

Single-row edit. Verify `[IL-113]` in `docs/incident-log.md` still describes the plugin-install/sandbox-absence finding referenced by the current row, then replace the row's second column with the proposed text above.

### Key Files

- `.claude/skills/upstream-drift/SKILL.md` — line 123, the Anti-Patterns row to trim

## Original request

**Skill:** upstream-drift | **Section:** Anti-Patterns | **Category:** best-practice | **Classification:** additive | **Confidence:** high

The context-cost bloat scan flagged this row at 614 bytes against a corpus median of 158 bytes (flag threshold 316 bytes) — more than 2x. The row has absorbed the reason it was added (Anthropic's documented claim, the specific live-sandbox test, the `~/.claude/plugins/` absence) rather than stating the anti-pattern concisely and pointing to the incident account. That full narrative already lives canonically in docs/incident-log.md's own `## IL-113` section (line 785), so restating it here pays context cost on every invocation of this skill without adding guardrail value beyond the pointer.

Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding.
