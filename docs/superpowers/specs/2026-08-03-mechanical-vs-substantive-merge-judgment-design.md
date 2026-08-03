# Mechanical vs. substantive merge judgment

**Record:** #78
**Date:** 2026-08-03
**Status:** design approved, plan pending

## Problem

`/claude-tweaks:backlog refine` recommends `RECOMMEND_MERGE: false` for every record that touches a
skill file, without distinguishing a factual correction from new instructional guidance. Reported
from a memenu-app refine run where 12 of 19 ready records were harness-health drift fixes; on a
closer read about half carried no new judgment content at all.

The consequence is not the wasted clicks. It is that a caution which fires on everything stops
carrying information, and gets rubber-stamped away on the records that actually needed it.

### What the reported cause gets wrong

The record states the rule is unconditional. It is not — `grant-check`'s Step 2 already reads
"creating or **substantially** editing a file under `skills/**/*.md`". The qualifier is present.

The Anti-Patterns row cancels it:

> Recommending `RECOMMEND_MERGE: true` for a new-or-**changed** `skills/**/*.md` or
> `agents/**/*.md` file — this is a hard `needs-human`/`false` case regardless of how clean or
> small the change looks.

"new-or-changed" drops "substantially", and the absolute phrasing is what a judging agent obeys.
The file contradicts itself, and the contradiction is the defect. This matters for the fix: an
edit that only adds nuance to Step 2 leaves the row still overriding it.

### Two gates, not one

`merge-check` independently hardcodes the same rule against the real diff at dispatch's auto-merge
gate: "A new or substantially-edited `skills/**/*.md` or `agents/**/*.md` file is `needs-human`,
regardless of size." Relaxing `grant-check` alone produces a grant that never cashes — the human
grants `auto:merge`, the build runs, and the merge still stops. The human click moves rather than
disappears.

### The rule is not portable

Every other part of the plugin names the consuming-project harness layout — `.claude/skills/*.md`,
`.claude/rules/*.md`, `CLAUDE.md` (harness-health, `_shared/harness-health-analysis.md`,
`_shared/criteria-docs-diataxis.md`). `assess-agent-autonomy` alone names this repository's own
layout. In any repo where the plugin is the harness, `skills/**/*.md` does not match
`.claude/skills/`, `agents/**/*.md` misses `.claude/agents/`, and `.claude/rules/` was never
covered at all. The reporter wrote `.claude/skills/**` in the issue title because the model
stretched the rule charitably; the text did not earn it.

This also inverts the intended protection. `CLAUDE.md` is the highest-leverage instruction file in
a project — loaded every session and paid again per dispatched agent — and today it hits no floor,
while an individual `SKILL.md` does. A harness-health `claude-md` drift record can be granted
`auto:merge` and land unreviewed. This repository's own `.claude-tweaks/policy.yml` sets no
`merge-sensitive-paths`, so nothing else covers it.

### General code is conservative on the wrong axis

`merge-check` leans `needs-human` when a diff runs "well past" `automerge-max-lines` /
`automerge-max-files`. That is a size proxy: a large uniform rename leans human, a small change to
a branch condition does not. The size lean penalizes the diffs that are safest, and it applies to
every repository the plugin runs in, not just this one.

## Thesis

**`merge-check` judges behavior delta, not size and not file class.**

One question, asked in two contexts:

| Context | The question | If yes |
|---|---|---|
| Agent-instruction files | Does this change what agents are *told* to do? | `needs-human` |
| Everything else | Does this change what the program *does*? | weigh normally |

For code, "mechanical" means **behavior-preserving**: a rename, a corrected constant, a call site
updated uniformly, dead code removed. Judgeable from the diff without a taxonomy — *is every hunk
an instance of the same behavior-preserving transformation?* A single non-conforming hunk drops the
whole diff to substantive.

Size then stops being a lean on its own. A large diff that is uniformly one transformation with a
clean review is safer than a small one that changes a condition. This is what "one input, not a
cutoff" already claimed and the current wording does not deliver.

## Design

### `merge-check`

**1. The instruction-file floor stops naming paths.** It covers any file this project's harness
loads as instruction rather than as subject matter, resolved per project the way harness-health
already resolves its own audit scope. Role, not glob. This fixes the portability defect and the
`CLAUDE.md` gap in the same edit.

**2. The floor gains an escape: a refutation judgment.** Not "is this mechanical?" — that phrasing
invites yes. The judge must attempt to name a concrete behavior an agent could take differently
after the edit. The diff clears only when a genuine attempt comes up empty; any named candidate
resolves to `needs-human`. This mirrors `/challenge`'s lenses and the adversarial-verify pattern
already used in this codebase, and stays a paragraph of prose with nothing to maintain per change
type.

**3. The blast-radius bullet weighs the behavior-carrying portion of the diff**, not its total.
`implLines`/`implFiles` stay inputs; they bind when the diff carries behavior change and not
otherwise. `testLines`/`testFiles` remain informational, unchanged.

### `grant-check`

The skill-file clause recommends on content and states plainly that `merge-check` re-judges the
real diff, so a grant cannot promise what the merge gate will refuse. The signal rides `RATIONALE`
— no new output field, following the ceremony-tier disclosure precedent that deliberately reused
existing plumbing.

**The Anti-Patterns row is rewritten.** It is the operative cause of the reported behavior, and
leaving it while softening Step 2 changes nothing.

### Calibration lives in the skill, not the design doc

The Relationship table cites `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` as
"the full design rationale, motivation (the #18/#19 evidence), and calibration examples this
skill's judgment procedures are anchored against". That file does not exist, nor does the fast-lane
design doc cited beside it. Both were pruned under ADR-0007.

A judgment mechanism whose calibration can be deleted by routine cleanup is not durable — that is
precisely how the current anchor went dangling. The commit that removed those docs
(`652a97c4`) described itself as fixing stale references and still left both citations standing,
which is the same failure one layer up. **Worked boundary cases go inline in the skill.** The
design doc carries rationale only. Both dangling Relationship rows are repointed here or removed.

Boundary cases are stated as **shapes, not issue references**. An issue closes and its defect gets
fixed; calibration anchored to one then describes a state that no longer exists. This was not
hypothetical while drafting — #98 was a candidate example until a check showed `code-health` had
already adopted the count-deferral idiom and the cited claim was gone.

- **A factually true correction that still shifts inference** — a skill claiming some state is
  independent, corrected to shared-singleton. True and verifiable, yet agents reason differently
  about concurrency afterward. **Substantive.** This case is why verifiability alone cannot stand
  in for safety.
- **A threshold or budget literal changed** — reads as a number correction, directly changes what
  agents do at the limit. **Substantive**, and the clearest case that "small and numeric" is not a
  safety signal.
- **A stale cross-reference repaired after a file split** — `above`/`below` pointers, a moved path,
  a renamed section anchor. Pointer repair; no agent behaves differently. **Mechanical.**
- **A behavior-preserving rename spanning many files** — the general-code boundary. Large, uniform,
  clears despite exceeding `automerge-max-lines`.

## Non-goals

- **No referent taxonomy, no `bin/lib/` verifier module, no per-change-type rules.** This skill
  exists to replace mechanical gates — its `merge-check` blast-radius bullet describes the
  threshold it replaced as "the old mechanical gate", and dispatch's layers 2-4 were deleted in
  favour of content judgment. Rebuilding one a layer down would defeat the point.
- **No new `grant-check` output field.**
- **`merge-sensitive-paths` stays never-overridden.** It is a project's explicit opt-in; weakening
  it would break a contract projects already rely on.
- **Review findings at Medium+ stay a hard `needs-human`.**
- **dispatch's layer-1 authorization gate is untouched.**

## Surface

`skills/assess-agent-autonomy/SKILL.md` only — both mode bodies, the Anti-Patterns row, the
Relationship table. No config schema change, no module, no producer-skill edits.

Two steps the plan states explicitly rather than leaving to recall:

- **Version bump** in `.claude-plugin/plugin.json` (minor — feature addition), preceded by
  `git fetch origin main` and a check of `git log --oneline -5 origin/main -- .claude-plugin/plugin.json`
  for a concurrent bump, then the marketplace-repo mirror as part of the same action.
- **Worktree first.** `worktree.always` is set on this project.

## Verification

This is a markdown-only judgment change with no automated surface. `evals/` has no
`assess-agent-autonomy` case and no `merge-check` fixture; building one would mean a new git
fixture repo with a planted diff. Deliberately out of scope here, and worth its own record — every
other judgment this skill makes is equally untested, so the gap is not specific to this change.

Verification is therefore: the inline calibration cases, and human review of the first
instruction-file merges after this lands.
