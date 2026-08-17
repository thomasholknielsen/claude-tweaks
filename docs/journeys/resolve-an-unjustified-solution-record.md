---
files:
  - plugin/skills/challenge/SKILL.md
  - plugin/skills/backlog/overview-mode.md
---

# Resolve an Unjustified-Solution Record in One Call

**Persona:** A claude-tweaks maintainer working the backlog funnel who has a record flagged `solution:unjustified` — `/specify`'s framing-check judged that the record names a solution its own Current State never traded off — and who holds the context to settle it (they know whether the evidence exists, or whether the risk is acceptable).
**Goal:** See each flagged assumption next to whatever in-repo evidence exists for it, then make the one-line call — supply the evidence, accept the risk, or leave the flag — without re-shaping the record or re-reading the whole repo by hand.
**Entry point:** The Needs-you lane of `/claude-tweaks:backlog overview` (or `/claude-tweaks:backlog refine`'s Needs-you section, or `/help`'s Needs Attention row), which composes the launcher line `/claude-tweaks:challenge #{N}` with a `#`-comment naming the pending evidence call.
**Success state:** The label is gone (or deliberately kept), the decision is durable on the record itself — evidence bullets or an acceptance trace under `## Gotchas`, plus a comment under `github-issues` — and the maintainer knows re-shaping would re-derive the verdict from the body, so nothing they just decided is silently undone.

## Steps

### 1. Spot the flagged record — funnel report
- **URL:** `/claude-tweaks:backlog overview`
- **Action:** Read the Needs-you lane; the `kind: 'unjustified'` row carries the paste-ready launcher (`/claude-tweaks:challenge #{N}`) and a `#`-comment naming the one-line evidence call.
- **Should feel:** Like the report handing over the one move only a human can make — no digging for which records are flagged or why.
- **Should understand:** `solution:unjustified` is non-gating (#471): the record can still be built with the label on. This lane is a decision queue, not a blocklist.
- **Red flags:** A launcher still reading `--lens=1` (the retired proxy form); a flagged record missing from the lane.

### 2. Run the evidence call
- **URL:** `/claude-tweaks:challenge #726` (any flagged record number)
- **Action:** Invoke the bare-`#N` form. The mode reads the record's `## Gotchas` assumption bullets (the claims framing-check wrote, each with its validation status) and runs a capped in-repo evidence search — at most 3 searches and 2 file reads per assumption, 12 operations total.
- **Should feel:** Fast and bounded — a screening pass that ends, not an investigation that sprawls.
- **Should understand:** `supported` / `contradicted` classifications cite `file:line`; `no evidence found (cap reached)` is a normal outcome, not a failure. A record carrying neither `solution:unjustified` nor the pre-rename `framing:baked` stops here with a pointer toward `--lens` instead — this mode only settles flagged records.
- **Red flags:** The mode dispatching subagents; searches continuing past the stated caps; a run against an unflagged record proceeding to the decision step anyway.

### 3. Make the call — one question, three doors
- **URL:** the AskUserQuestion the mode renders after its findings table
- **Action:** Choose one: **supply evidence** (findings appended under `## Gotchas`, label cleared), **accept the risk** (acceptance recorded, label cleared), or **leave it** (no writes).
- **Should feel:** Like signing a decision, not filing paperwork — one click and the record carries the outcome.
- **Should understand:** Under `github-issues`, clearing removes the label (both spellings) and accepting also posts a comment; under `local-files` there are no comments — the acceptance bullets land in the record body and the `solutionUnjustified` facet flips false, all in one record-file write.
- **Red flags:** A resolving choice that leaves the label in place; an acceptance with no durable trace on the record; the label cleared under only one of the two spellings.

### 4. Know what re-shaping does afterwards
- **URL:** the mode's `## Next Actions` block
- **Action:** Read the handoff before pasting `/claude-tweaks:specify #{N}`.
- **Should feel:** Honestly informed — the handoff states its own limits instead of promising a confirmation it can't deliver.
- **Should understand:** `framing-check` re-derives its verdict from the body's problem statement — not from `## Gotchas`, not from comments — so re-shaping an unchanged framing re-applies the label even after an accept. Re-run `/claude-tweaks:specify` only when the framing itself changed.
- **Red flags:** A handoff line claiming re-shaping "confirms the clean state"; a maintainer surprised by the label returning after an accept-then-reshape.

## Origin

- Created during build of #726 (bare-`#N` evidence-or-accept-risk mode)
- Related specs: #677 (shipped the retired `--lens=1 #N` launcher proxy this replaces)
