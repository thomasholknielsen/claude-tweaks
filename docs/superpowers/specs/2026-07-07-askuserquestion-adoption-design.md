# Design: Adopting `AskUserQuestion` for plugin interaction points

## Context

The plugin currently implements all user-facing decisions — inline workflow choices, multi-item batch tables, and end-of-skill Next Actions handoffs — as plain-text numbered lists that ask the user to "reply with just a number." Claude Code's native `AskUserQuestion` tool renders structured, clickable choices instead. The plugin currently makes zero use of it anywhere (verified: no match for `AskUserQuestion`/`ask_user`/`AskUser`, case-insensitive, across `skills/`, `agents/`, or shared fragments).

Motivation: better UX. Typing a bare digit back is more error-prone and less discoverable than a native rendered choice.

## Scope

Three existing interaction categories are in scope:

1. Inline workflow decisions (single-shot, 2-4 options, mid-skill)
2. Multi-item batch tables ("apply all / override" decisions over N findings)
3. Next Actions handoff blocks (end-of-skill, 2-4 pre-filled commands)

`docs/superpowers/specs/` (historical brainstorming design docs) is explicitly out of scope — those are past-tense artifacts, not live skill behavior.

## Pattern A — Inline workflow decisions

Direct 1:1 replacement. No structural change to branching logic — only the input mechanism changes.

**Before** (`_shared/browser-detection.md`):
```
1. Install agent-browser globally — `npm install -g agent-browser` **(Recommended)**
2. Skip — visual review, story generation, and QA validation will be unavailable
```

**After:** one `AskUserQuestion` call, e.g. `header: "Browser tool"`, two options carrying the same labels/descriptions, first suffixed `(Recommended)`. Downstream branching (choice 1 → install + verify; choice 2 → return SKIPPED) is unchanged.

## Pattern B — Batch tables (hybrid)

The table itself stays as markdown — it is the only practical way to show N rows of `# | Finding | Severity | Category | Affected | Recommended` at a glance. `AskUserQuestion` caps at 4 options per question / 4 questions per call, so it cannot replace dense multi-row display.

What changes is the **terminal decision only**. The real site in `review/step3-routing.md` already collapses every batch table to a small fixed-option decision:
```
1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```
This maps directly onto one `AskUserQuestion` call with those two options. If the user picks "Override specific items," the follow-up (which #s, what to change them to) remains ordinary free-text conversation — no nested structured widget.

**This pattern applies cleanly wherever the terminal decision is already ≤4 fixed options** — verified against two more real sites:

- `wrap-up/review-console.md` — 3 options (Approve all / Override specific items / Stop and re-engage), plus a *separate* per-item queue-write loop (`Apply? yes / no / edit`) for `specs/DEFERRED.md` / `specs/INBOX.md` writes, which explicitly forbids bulk approval. Both fit Pattern B directly: one `AskUserQuestion` call for the 3-option terminal decision, one small `AskUserQuestion` call per queue-write item.
- `ledger/resolve-gate.md` Phase 2 does **not** fit Pattern B as-is. It's a 6-option mutually-exclusive vocabulary (Fix anyway / Defer / INBOX / Accept / Acknowledge / Drop) applied **per unresolved item**, with no default bulk-apply offered (bulk routing must be user-initiated, never the presented default) — 6 options exceeds `AskUserQuestion`'s 4-option-per-question cap outright, and the "every item gets an explicit per-item response" requirement doesn't compress into one call for N items. This site needs its own bespoke treatment (e.g., a two-step drill: broad category first, sub-choice second) and is called out as open design work for Spec 7, not something inherited for free from this pattern.
- No verified claim is made about `tidy/scan-procedures.md` — the numbered lists found there by the initial grep are procedural steps (search commits, extract findings), not a user-facing batch decision; Spec 7 should check whether tidy has a real batch-table site at all before assuming this pattern applies to it.

## Pattern C — Next Actions

Also a clean 1:1 mapping. `build/SKILL.md`'s rendering is already "2-4 numbered options, full command pre-filled, one marked Recommended":
```
1. /claude-tweaks:review 42 full — code + visual review **(Recommended)**
2. /claude-tweaks:test qa — validate 7 QA stories before review
3. /superpowers:finishing-a-development-branch — merge, PR, or discard the feature branch
```

**After:** one `AskUserQuestion` call. Short skill/command name as `label`, the full pre-filled command + one-liner as `description`. `Other` (always available on `AskUserQuestion`) covers "none of these, I'll type something else" — the same behavior a user gets today by ignoring the list.

## Boundary conditions

- **Auto mode is untouched.** `AskUserQuestion` is inherently blocking/interactive; it has no place in `auto`, which must never stop mid-flow except at the Manifesto/Review-Console bookends. `_shared/auto-mode-contract.md`'s "Skill integration pattern" template splits `**Interactive mode:**` from `**Auto mode:**` already — only the interactive branch's wording changes. The auto branch (read pipeline config → project policy → skill default → log) is unchanged.
- **Subagents are untouched.** Dispatched Task agents follow the Subagent Output Contract (`DONE`/`DONE_WITH_CONCERNS`/`NEEDS_CONTEXT`/`BLOCKED` + a literal output template) and report to the orchestrating skill — they never interactively prompt the end user. This change applies only to main-thread skill execution talking to a live user.
- **"One decision per message" still holds.** `AskUserQuestion` supports up to 4 questions per call; that licenses one decision's sub-parts, not bundling unrelated decisions together. Rule: one `AskUserQuestion` call per logical decision point, same as today's "one batch table per message."
- **Escape hatch preserved.** Every `AskUserQuestion` call gets `Other` for free — "type something not listed" continues to work exactly as it does today when a user ignores the presented list.

## Documentation changes (mechanics)

- **CLAUDE.md's Interaction style directive** — the identical blockquote duplicated across every skill's frontmatter area — gets new canonical wording along these lines:
  > Present single decisions via the `AskUserQuestion` tool (options + one marked Recommended). For multi-item decisions, render a batch table with recommendations pre-filled, then capture the apply-all/override decision via `AskUserQuestion`. One `AskUserQuestion` call per logical decision — resolve before showing the next. Render Next Actions via `AskUserQuestion` (context-specific options, one recommended).

  Exact wording is finalized in Spec 0; specs 1-8 each perform the mechanical find-replace in their own files.
- **CLAUDE.md's "Interaction patterns" section** — prose describing the convention gets rewritten to match (batch-table display + `AskUserQuestion` terminal capture, Next Actions via `AskUserQuestion`).
- **`_shared/auto-mode-contract.md`'s "Skill integration pattern" template** — `**Interactive mode:** present numbered options and wait.` → `**Interactive mode:** call AskUserQuestion with {N} options and wait.`

## Rollout — decomposition into specs

Migration surface (excluding `docs/superpowers/`): ~20 skill directories plus `CLAUDE.md` and two `_shared` fragments. Too large for one implementation plan — decomposes along the plugin's existing skill families:

| Spec | Files | Why grouped |
|---|---|---|
| **0 — Foundation (prerequisite)** | `CLAUDE.md` (directive + Interaction patterns section), `_shared/auto-mode-contract.md` (integration-pattern template), `_shared/browser-detection.md`, `_shared/decision-records.md` | Establishes canonical wording everything else copies; must land first |
| **1 — build family** | `build/SKILL.md` + worktree-setup, operational-checklist, architecture-alignment, plan-audit, failure-recovery | Shares one Next Actions block + several inline decisions |
| **2 — review family** | `review/SKILL.md`, step3-routing, ux-analysis, review-summary-template | Batch-table pattern's grounding example lives here |
| **3 — flow family** | `flow/SKILL.md` + manifesto, steps-and-gates, worktree-merge, failure-cards, multi-spec, multispec-review-console, survey, validation, from-code-health | Largest sub-file cluster |
| **4 — visual-review family** | `visual-review/SKILL.md` + browser-review, reconnaissance, journey-mode, discover-mode, qa-accelerated | |
| **5 — stories family** | `stories/SKILL.md` + 8 sub-files | |
| **6 — init family** | `init/SKILL.md` + relevant sub-files | |
| **7 — ledger + wrap-up + tidy** | resolve-gate, review-console, cleanup-procedures, scan-procedures | Share Review Console / resolve-gate batch-decision machinery. **Note:** review-console's 3-option decision + per-item queue-write loop fit Pattern B directly; resolve-gate's 6-option per-item vocabulary does not and needs its own bespoke design (see Pattern B section) — this spec's plan must budget for that as real design work, not a mechanical port; verify whether tidy has a genuine batch-table site before assuming it does |
| **8 — remaining single-decision skills** | capture, challenge, specify, simplify, journeys, help, harness-health, design, deepen, code-health, research, routine, test, version, browse, reflect | Mostly boilerplate directive line + at most one inline decision each — mechanical, batchable |

Each of specs 1-8 depends on Spec 0 landing first (they copy its canonical wording). Specs 1-8 have no dependencies on each other and can proceed in any order or in parallel.

Each spec (1-8, all feature-shaped changes) needs an explicit version-bump step in its own plan per this repo's own convention (CLAUDE.md Don'ts: version bumps must not depend on being remembered).

## Open point (not resolved by this design)

Brainstorming's own terminal-step convention is to invoke `/superpowers:writing-plans` next. But this design document is about the plugin's *own* conventions, and the plugin's documented tool for decomposing a design doc into exactly this kind of multi-spec breakdown is `/claude-tweaks:specify`. Which pipeline to use for turning this design into executable work is deferred to the user at design-approval time, not decided here.

## Out of scope

- Use of `AskUserQuestion`'s `preview` field for visual mockups/diffs — no current decision site needs it; can be revisited per-skill if one emerges (e.g. `/design`, `/visual-review`).
- Any change to subagent/Task-dispatch prompting.
- Any change to `auto` mode's decision logic or the auto-decision log format.
