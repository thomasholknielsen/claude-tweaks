---
record: 452
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: session-friction-reflect-lens:add-a-friction-reflect-lens-fed-by-hook-denial-and-askuserqu
surface: backend
---
# 452: Add a Friction reflect lens fed by hook-denial and AskUserQuestion events
Surface: backend
Parent: #451

## Overview

Add a "Friction" lens to `/claude-tweaks:reflect` (full and light modes) that judges whether a
session's hook denials and AskUserQuestion stops were avoidable, and feeds qualifying findings
into the existing D5 upstream-feedback pipeline via `/claude-tweaks:feedback`. Requires logging
AskUserQuestion calls to the run's `events.jsonl` (currently only hook denials are logged) so
the judgment survives `pr-first`'s session-to-session background convergence.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Logging or judging failed/errored mid-session tool calls (Bash/Edit failures) — a different
  signal, not currently logged anywhere, out of scope.
- A numeric AskUserQuestion count threshold or new `policy.yml` config key — volume is judged
  qualitatively by the lens itself, not against a hardcoded number.
- Running the Friction lens in hindsight mode (mid-pipeline, during `/review`) — full and light
  modes only, since hindsight runs before a run is complete.
- Changing `/feedback`'s Step 1/Step 5 draft template — its existing Repro-steps/
  Expected-vs-actual shape already fits; only the new lens's finding shape changes.
- Retrofitting already-archived pipeline runs' `events.jsonl` with `ask-user-question` entries.
- Adding new fields to the existing denial event types (`gate-denial`, `wd-deny`, etc.) — their
  current payloads (attempted action, expected/actual state, command) already carry enough
  context for an avoidability judgment; see Gotchas.

## Current State

- `bin/lib/hooks/post-tool-use.js` — `run(ctx)` dispatches on `ctx.input.tool_name` (`Skill`,
  `Bash`, `Write`, `EnterWorktree` branches exist today); no `AskUserQuestion` branch.
  `checkWorktreeStaleness`/`logWorktreeStalenessEvent` (~line 353-360) is the closest existing
  precedent for a log-tier event: gated on `ctx.ownedRun.dir`, wrapped in try/catch so a failure
  never breaks the session, calling `ctxLib.appendEvent(ownedRun.dir, type, data,
  ownedRun.attribution)`.
- `bin/lib/hooks/pre-tool-use.js` — already logs denial/violation events via the same
  `appendEvent` pattern: `gate-denial` (`{tool, path}`), `wd-deny` (`{expected, actual, session,
  command}`), `wd-push-mismatch` (`{expected, actual, command}`), `wd-ambiguous` (`{matched}`),
  `wd-foreign-teardown` (`{path}`). `wd-foreign-session` is logged too, but to `ctx.runDir` (the
  newest-non-terminal-run resolution), not `ctx.ownedRun.dir` — it fires when a *different*
  session than the run's owner attempts a wrong-checkout action, i.e. it's a warning about a
  bystander's behavior toward this run, not friction experienced by this run's own operator. See
  the Friction lens's event-filter membership rule in Deliverables below.
- `evals/NOTES.md` ("AskUserQuestion input/output shapes" section, confirmed against
  `@anthropic-ai/claude-agent-sdk`'s `sdk-tools.d.ts`) — the authoritative real shape:
  `AskUserQuestionInput` is `{ questions: [{ question, header, options: [{label, description,
  preview?}, ...2-4 items], multiSelect }, ...1-4 items] }`; `AskUserQuestionOutput` is
  `{ questions: [...same], answers: { [questionText]: answerString }, response?, annotations?,
  afkTimeoutMs? }` — `answers` is keyed by the literal `question` text, not by `header`, and
  multi-select answers arrive comma-separated in one string. A single `AskUserQuestion` call can
  therefore pose 1-4 questions at once, each independently answered.
- `skills/reflect/full-mode.md` — defines full mode's 4 lenses (Surprises, Approach,
  Near-misses, Fresh start) in a `| Lens | Question | Surfaces |` table under "Step 2: Run
  Lenses — Full Mode (4 lenses + tradeoff review)".
- `skills/reflect/light-mode.md` — defines light mode's 2 lenses (Near-misses, Fresh start), and
  describes itself in prose as a "narrowed subset of full."
- `skills/reflect/SKILL.md` — Modes table (~lines 32-37) lists lens names per mode.
- `skills/_shared/learning-routing.md` — the classifier every lens's findings already route
  through; rule 1 (defect) / rule 7 (gap) are the two outcomes a Friction finding can resolve
  to. No changes needed here — reused as-is. Rule 1 requires naming a specific
  `/claude-tweaks:*` skill, `skills/_shared/*` contract, or `bin/*.js` behavior — a Friction
  finding's event `type` (e.g. `wd-deny`, `gate-denial`) already names the specific hook module
  responsible, so a finding drafted for D5 should cite it by name (e.g. "the `worktree.always`
  gate in `bin/lib/hooks/pre-tool-use.js`") rather than describing the symptom generically.
- `docs/skill-graph.md` — `## reflect` section (~line 286) lists reflect's existing edges.

## Deliverables

- [ ] **Task 0 (blocking).** Capture a real `AskUserQuestion` `PostToolUse` hook payload
      (`ctx.input.tool_input` and `ctx.input.tool_response`) before writing the handler or its
      test — `evals/NOTES.md`'s SDK-derived shape (Current State above) describes the documented
      contract, not necessarily every field `ctx.input` carries at this specific hook boundary.
      Cover every initiator path that could reach this hook: (a) a person answering a question
      Claude posed in an interactive session; (b) the model invoking `AskUserQuestion` as part of
      its own reasoning; (c) confirm whether a Task-dispatched subagent can invoke
      `AskUserQuestion` at all (if the harness disallows it for subagents, state that explicitly
      — a no-event path, not an untested one); (d) confirm whether a headless/non-interactive run
      (`claude -p`, a scheduled Routine) can trigger `AskUserQuestion` at all, and if not, state
      that explicitly rather than assuming coverage. Record findings inline in this record's
      Gotchas before starting Deliverable 1.
- [ ] `bin/lib/hooks/post-tool-use.js`: new `logAskUserQuestion(ctx)` handler + a `run(ctx)`
      branch `if (ctx.input.tool_name === 'AskUserQuestion') return logAskUserQuestion(ctx);`,
      following `checkWorktreeStaleness`'s gating/fail-open shape. Appends one `ask-user-question`
      event per tool call (see Data / API Surface for the schema — one event holds every question
      posed in that call, not one event per question).
- [ ] `tests/hooks-post-tool-use-ask-user-question.test.js`: new test file (mirrors
      `tests/hooks-post-tool-use-worktree-staleness.test.js`'s structure), built from Task 0's
      captured real payload(s), covering: fires only on `tool_name === 'AskUserQuestion'`; no-ops
      (no `appendEvent` call) when `ctx.ownedRun.dir` is unset; correctly maps each posed
      question's `answers[question]` lookup, including the multiSelect comma-separated case;
      never throws on malformed `tool_input`/`tool_response`.
- [ ] `skills/reflect/full-mode.md`: new "Friction" lens, appended as the table's last row.
      Input: the run's `events.jsonl`, filtered to `wd-deny`, `gate-denial`, `wd-push-mismatch`,
      `wd-ambiguous`, `wd-foreign-teardown`, `contract-violation` (from `pre-tool-use.js`), and the
      new `ask-user-question` type (from `post-tool-use.js`) — **membership rule:** an event
      qualifies when it describes friction experienced by the run's own operator (a denied
      action, a forced stop); it does not qualify when it describes a *different* session's
      behavior toward this run (`wd-foreign-session` is excluded on this basis — see Current
      State). No run dir / no `events.jsonl` → the lens reports nothing. Judges, per qualifying
      event, **avoidability** (was this specific denial or stop necessary, or does it indicate a
      claude-tweaks defect — a gate that shouldn't have fired — or gap — a decision the plugin
      should have had a default for) — worked examples to ground the call: *avoidable* — a
      `gate-denial` firing on an action the gate's own stated policy condition doesn't actually
      match (a false positive); an `ask-user-question` whose header and options were fully
      answerable from CLAUDE.md content already in context. *Not avoidable* — a `wd-deny` firing
      exactly as `worktree.always` documents it should (a provable wrong-checkout commit); an
      `ask-user-question` posing a genuine judgment call with no stated project preference either
      way. Also judges **aggregate volume** independent of any single event's verdict — whether
      this run's total stop count looks disproportionate to its own scope, weighed against the
      record's own `Estimated tasks`/Deliverables count as a rough proportionality anchor (e.g. a
      2-task record with 8 stops reads differently than an 8-task record with 8 stops) rather than
      an absolute number. A finding from either judgment routes through Step 3's existing
      `_shared/learning-routing.md` classification exactly like every other lens's output — no
      new routing table.
- [ ] `skills/reflect/light-mode.md`: same Friction lens definition added to light mode's lens
      set; update the mode's "narrowed subset of full" framing prose to reflect the third shared
      lens (light now shares 3 of full's lenses, not 2).
- [ ] `skills/reflect/SKILL.md`: Modes table updated — Friction added to full mode's and light
      mode's lens lists; hindsight mode's row unchanged.
- [ ] `docs/skill-graph.md`: new edge under `## reflect` — the Friction lens reads events logged
      by both `bin/lib/hooks/pre-tool-use.js` (existing denial events) and
      `bin/lib/hooks/post-tool-use.js` (the new `ask-user-question` event) as its input source.

## Acceptance Criteria

1. `node --test tests/hooks-post-tool-use-ask-user-question.test.js` passes, using Task 0's
   captured real payload shape(s) as fixtures, and covers every case in that deliverable.
2. `AskUserQuestion` invoked inside an owned pipeline run appends exactly one
   `ask-user-question`-typed line to that run's `events.jsonl` per tool call, containing a
   `questions` array with one entry per posed question (`header`, `options` as an array of
   option labels, `answer` resolved from the output's `answers` map keyed by that question's
   literal text, or `null` when no matching key exists).
3. `AskUserQuestion` invoked with no owned run dir (`ctx.ownedRun.dir` unset) writes nothing to
   any `events.jsonl` and does not throw.
4. `skills/reflect/full-mode.md` and `skills/reflect/light-mode.md` each define the Friction lens
   with: its input (`events.jsonl`, filtered event types, and the operator-vs-bystander
   membership rule), the two judgments it makes (per-event avoidability with worked examples,
   aggregate volume with a proportionality anchor), and that a finding routes through Step 3's
   existing `_shared/learning-routing.md` classification exactly like every other lens's output.
5. `skills/reflect/SKILL.md`'s Modes table lists "Friction" under both the full and light mode
   rows; the hindsight row is unchanged.
6. `docs/skill-graph.md` gains one new edge row documenting the Friction lens's read dependency
   on both hook files' logged events.
7. `npm test` passes with no new failures.

## Technical Approach

Reuses the entire D5 filing pipeline unchanged — `/claude-tweaks:feedback`'s
classify/self-reference/dedup/draft/scrub/confirm steps, and `wrap-up`'s Upstream feedback
curation row / Review Console `U#` staging — since every reflect lens's output already flows
through `_shared/learning-routing.md`'s classifier into that pipeline. The two additions are: (1)
one new hooks-logged event type carrying AskUserQuestion stops into `events.jsonl`, matching the
durability the existing denial events already have; (2) one new reflect lens that reads that data
and judges it, exactly like the site's other lenses judge code.

No new dispatch site: component-invoked reflect (the wrap-up path) already runs every lens inline
in the main thread; standalone reflect already dispatches one Frontier singleton covering every
lens in a single pass (`reflect/SKILL.md` Step 2's "Standalone-only `[Use: Frontier]` singleton").
Friction folds into that existing bundle.

### Data / API Surface

New `events.jsonl` event type, written via the existing `ctxLib.appendEvent(runDir, type, data,
attribution)` helper (`bin/lib/hooks/context.js`), one event per `AskUserQuestion` tool call
(not per question):

```
type: 'ask-user-question'
data: {
  questions: [
    {
      header: string,     // question.header, as posed
      options: string[],  // question.options[].label only — description/preview dropped
      answer: string | null, // answers[question.question], or null if no matching key
    },
    ... one entry per posed question (1-4 items, per AskUserQuestionInput)
  ],
}
```

Sourced from `ctx.input.tool_input.questions` (the posed questions, per `AskUserQuestionInput`)
and `ctx.input.tool_response.answers` (the `{questionText: answerString}` map, per
`AskUserQuestionOutput` — comma-separated already for a `multiSelect` question) — see Current
State's citation of `evals/NOTES.md`. Confirm both field paths against Task 0's captured real
payload before implementing; the SDK type declarations describe the documented contract, not a
guarantee about every field this specific hook receives.

### Key Files

- `bin/lib/hooks/post-tool-use.js` — new `logAskUserQuestion` handler + `run(ctx)` branch
- `tests/hooks-post-tool-use-ask-user-question.test.js` — new test file
- `skills/reflect/full-mode.md` — new Friction lens definition, appended as the lens table's last
  row
- `skills/reflect/light-mode.md` — new Friction lens definition + updated framing prose
- `skills/reflect/SKILL.md` — Modes table update (~lines 32-37)
- `docs/skill-graph.md` — new `## reflect` edge

### Package Dependencies

None — reuses only `bin/lib/hooks/context.js`'s existing `appendEvent`, already a dependency of
`post-tool-use.js`.

## Gotchas

- **The original schema assumption in this record's first draft was wrong, and was caught by
  this decomposition's own red-team pass** — a flat `{header, options: string[], answer: string}`
  shape, when the real `AskUserQuestionInput`/`AskUserQuestionOutput` (confirmed via
  `@anthropic-ai/claude-agent-sdk`'s `sdk-tools.d.ts`, documented in `evals/NOTES.md`) supports
  1-4 questions per call, object-shaped options, and an `answers` map keyed by literal question
  text rather than by header. The corrected schema above is already fixed; Task 0 exists to catch
  anything `evals/NOTES.md`'s type-level description still doesn't capture about the live hook
  payload.
- `ctx.input.tool_response`'s shape varies across the plugin's hook consumers generally (see
  `post-tool-use.js`'s own comment above `extractToolResponseText`, ~line 308) — for
  `AskUserQuestion` specifically, Task 0's captured sample is the reference, not that general
  comment.
- Every log-tier event in `post-tool-use.js` is gated on `ctx.ownedRun.dir` and wrapped so a
  failure never breaks the session (`checkWorktreeStaleness`'s try/catch, ~line 411-413) —
  `logAskUserQuestion` must follow the same shape; a hook that throws breaks the whole session
  per CLAUDE.md's Hooks section ("Never break a session").
- `_shared/learning-routing.md`'s classifier is read, not restated — the Friction lens routes
  findings through it exactly like every other lens; do not invent a parallel routing table for
  friction findings.
- This project runs `integration-model: pr-first` — a run's wrap-up can execute in a different
  session than the one that hit the friction (background convergence). This is *why* the event
  must be logged via the hooks dispatcher rather than inferred from the reflect lens's own
  conversation transcript — do not "simplify" by reading AskUserQuestion calls from context
  instead.
- The Friction lens judges avoidability from an event's own logged fields (header/question text,
  options, answer) alone — there is no separate "why was this asked" rationale field, and this is
  a deliberate scope limit (mirroring the no-numeric-threshold decision in Non-Goals), not an
  oversight. Do not add a rationale field speculatively; if judgment quality proves insufficient
  in practice, that is future work, not part of this record.

## Manual Steps

None — no dashboard-only action, human judgment call, or out-of-band signoff is involved.


<!-- work-fingerprint: session-friction-reflect-lens:add-a-friction-reflect-lens-fed-by-hook-denial-and-askuserqu -->
