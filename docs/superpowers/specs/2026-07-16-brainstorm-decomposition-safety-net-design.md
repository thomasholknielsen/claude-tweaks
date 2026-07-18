# Brainstorming Decomposition Safety Net

## Context

`/superpowers:brainstorming` explicitly instructs decomposing an oversized request into
independent sub-projects and brainstorming only the first one: "If the project is too
large for a single spec, help the user decompose into sub-projects... Then brainstorm the
first sub-project through the normal design flow. Each sub-project gets its own spec →
plan → implementation cycle." A second, near-identical trigger exists later, in the spec
self-review checklist ("Scope check: Is this focused enough for a single implementation
plan, or does it need decomposition?").

Neither trigger specifies what happens to the deferred sub-projects beyond "brainstorm
the first one." No file, queue, or TODO list is written for the rest — they exist only as
prose in that turn's conversation. The standard claude-tweaks cycle
(`/superpowers:brainstorming` → `/claude-tweaks:specify` → `/clear` → `/claude-tweaks:flow
#specid`) requires a `/clear` between specifying one sub-project and building it, which
destroys any conversation-only memory of the sub-projects that were never brainstormed.
This was confirmed by direct audit of the installed skill files — see the "the
literal trigger" quotes above, sourced from
`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/brainstorming/SKILL.md`.

`/claude-tweaks:specify` already has a mechanism for splitting a *single* design doc into
multiple leaf work records (its decomposition mode). That's a different problem: those
leaves all originate from one brainstormed design. The gap here is one level earlier —
sub-projects that superpowers identifies but never even reaches a design doc for, because
brainstorming's own instructions say to defer them before writing one.

superpowers is an external, marketplace-installed dependency and is treated as fixed —
no file under its installed directory may be edited. Every fix in this design lives
entirely on the claude-tweaks side.

A second, related friction point surfaced while designing the above: brainstorming's
Step 8 ("ask the user to review the written spec before proceeding... wait for the
user's response") re-confirms content already approved section-by-section during Step 5's
design presentation. In the common case — no substantive change during Step 7's
self-review — this is a redundant round-trip.

## Goals

- Durably capture every sub-project superpowers identifies but defers during brainstorming
  (at either trigger point above), before it can be lost to `/clear`, without editing any
  superpowers file.
- Reduce the redundant Step 8 approval round-trip when nothing substantive changed
  between Step 5's approval and the committed spec file, reusing the existing adaptive
  section-batching mechanism rather than inventing a new one.

## Non-goals

- Modifying any file under the installed superpowers plugin directory.
- Mirroring the capture hook (Component A) at the `writing-plans` → plan-file boundary.
  `writing-plans/SKILL.md` has its own late decomposition backstop ("If the spec covers
  multiple independent subsystems... suggest breaking this into separate plans") with the
  same unhandled-gap shape — considered, but explicitly cut for this pass. See
  "Considered and cut" below.
- Changing brainstorming's Step 5 section-by-section approval flow itself — already
  covered by the existing "Adaptive section batching" convention in CLAUDE.md.

## Design — Component A: deferred-subproject capture hook

A new `PostToolUse` hook check, sibling to the existing `checkClosingKeyword` in
`bin/lib/hooks/post-tool-use.js`.

**Trigger:** `ctx.input.tool_name === 'Write'` and `ctx.input.tool_input.file_path`
matches `docs/superpowers/specs/*-design.md` — the path convention
`/superpowers:brainstorming` itself uses when it writes a design doc (Step 6 of that
skill). This requires a new `PostToolUse` / `Write` matcher entry in `hooks/hooks.json` —
today `PostToolUse` only matches `Bash` (`git commit` / `git push` / `git -C`).

**Detection strategy — unconditional, not content-aware.** The check does not attempt to
parse the doc's text to decide whether decomposition actually happened; that's unreliable
prose classification. It fires on every matching write, the same "cheap false positive,
no smart detection" precedent `checkClosingKeyword` already sets for this codebase.
Because it matches on the `Write` tool call itself rather than "new file only," it also
naturally re-fires if Step 7's self-review triggers a later revision to the same design
doc — no separate handling needed for that case.

**Output — warn tier, non-blocking:**

```
claude-tweaks: a design doc was just written under docs/superpowers/specs/. If
brainstorming identified other independent sub-projects and deferred them to focus on
this one, capture each deferred sub-project now via /claude-tweaks:capture — they aren't
tracked anywhere else, and will be lost once this conversation clears.
```

Returned as `{ json: { systemMessage: '...' } }`, matching the existing warn-tier shape
exactly. This surfaces back into the assistant's context immediately after the `Write`
call completes — while it still holds full conversational memory of whichever
sub-projects it identified and deferred earlier in the same session, before any `/clear`
has happened. The hook cannot invoke `/claude-tweaks:capture` itself (hooks are
deterministic, not model-driven); it only prompts the assistant to do so as its own next
action.

**Error handling.** Path-match only, no filesystem reads inside the check itself — it
cannot throw. Falls through to `{}` (no-op) on any non-match, consistent with every other
check in this module and with the project's "never break a session" hook discipline.

## Design — Component B: adaptive Step 8 skip

Pure documentation change — a new CLAUDE.md bullet, no code. Step 8 is model-executed
conversational behavior (present text, wait for a reply); there is no tool-call boundary
a hook could intercept to suppress or auto-answer it. The only reachable lever is a
project-level instruction, which — per this project's own stated precedence
(CLAUDE.md overrides default behavior) — the assistant applies when executing
`/superpowers:brainstorming` without needing the skill file itself to change.

**Condition to skip the blocking wait**, added to CLAUDE.md's existing "Adaptive section
batching" entry, under the same `Brainstorm / section-confirmation: adaptive` setting:

- Step 5's design presentation was approved cleanly (no revisions requested in any
  section), **and**
- Step 7's self-review made no substantive change relative to what was approved —
  "substantive" meaning: an ambiguity resolved by a judgment call, a scope/decomposition
  shift, or a contradiction resolved by picking an interpretation. Placeholder, typo, and
  pure-consistency fixes are not substantive.

When both hold, skip Step 8's blocking wait: state the committed file path and proceed
directly to `/superpowers:writing-plans`. When self-review *did* make a substantive
change, still stop — but surface only that specific delta, not a full re-review of the
whole document, and wait for approval on it.

This does not disable Step 8 outright; it collapses the round-trip only when there is
genuinely nothing new for the user to approve that they haven't already approved once.

## Considered and cut

**Mirroring Component A at the `writing-plans` → plan-file boundary.** The audit found a
second, near-identical unhandled decomposition trigger inside `writing-plans/SKILL.md`
("if the spec covers multiple independent subsystems... suggest breaking this into
separate plans"), which would suggest a parallel hook on `Write` to
`docs/superpowers/plans/*.md`. Explicitly not built in this pass — flagging here so it's
traceable as a considered option rather than a silently dropped one, in case it becomes a
follow-up later.

## Implementation notes

- `hooks/hooks.json` — add a `PostToolUse` entry with matcher `Write`, routed to the
  existing `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" post-tool-use` dispatcher.
- `bin/lib/hooks/post-tool-use.js` — add the new check function; wire it into `run(ctx)`
  alongside the existing commit-breadcrumb and closing-keyword logic. Deliberately not
  gated on `ctx.runDir` (the motivating case is exactly a brainstorming session that has
  no pipeline run directory yet).
- CLAUDE.md's "Hooks" section (Conventions) lists which modules exist and their tier —
  update its description of `post-tool-use.js` to mention the new warn-tier check, and
  confirm the "Referenced by" list for `_shared/git-discipline.md` /
  `_shared/pipeline-run-dir.md` doesn't need a new entry (this check has no run-dir
  interaction, so it likely doesn't reference either shared file).
- CLAUDE.md's "Adaptive section batching" bullet (Interaction patterns) — add the new
  condition described in Component B directly to that bullet, not as a separate one, to
  keep the single `Brainstorm / section-confirmation: adaptive` setting governing both
  behaviors.

## Testing / verification

- Component A: a new unit test in `tests/` asserting the new check fires a `systemMessage`
  on a `Write` to a matching `docs/superpowers/specs/*-design.md` path, stays silent
  (`{}`) on a non-matching path, and passes the mandatory garbage-stdin invariant test
  every hook module requires (`tests/hooks-dispatcher.test.js`).
- Component B: no automated test — it's a prose instruction interpreted by the model, not
  executable code. Verified by tracing a live brainstorm end-to-end: confirm Step 8 is
  skipped when both conditions hold, and confirm it still stops and surfaces the delta
  when self-review makes a substantive change.
