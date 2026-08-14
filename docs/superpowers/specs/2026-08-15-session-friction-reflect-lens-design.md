# Session friction as a reflect lens

Design doc. Written 2026-08-15.

## The gap

Prompted by a live question at wrap-up time: when a session hits hook denials or gets
stopped for user input, should that experience itself become feedback to the claude-tweaks
maintainer — and is that already handled?

Verified, not assumed, before drafting this:

| Piece | State |
|---|---|
| `/feedback`'s D5 filing pipeline (classify → self-reference check → dedup → draft → scrub gate → confirm gate) | Shipped, mature, reusable as-is |
| `/reflect` → `/feedback` wiring | Shipped. Every lens's output already routes through `_shared/learning-routing.md`'s classifier; a D5 verdict stages as a `U#` row at the Wrap-Up Review Console and files via `/feedback --pre-confirmed` on approval (zero-click at `unattended` under `consoleAutoResolve`) |
| Hook/gate denial events (`wd-deny`, `gate-denial`, `wd-push-mismatch`, …) | Shipped — logged to the run's `events.jsonl` by `bin/lib/hooks/pre-tool-use.js`, and already displayed raw in the Review Console's "Read inputs" step |
| AskUserQuestion stop volume as a policy concern | Partially shipped, different concept — #288/#290 already batch interactive drills under the autonomy ceiling to *reduce* stop volume at `trusted`/`unattended`. That's friction-reduction-by-policy, not friction-detection-as-a-learning-source. |

**What's missing:** nobody judges *why* a denial fired, or whether a run's stop volume was
avoidable. Every lens across `reflect`'s three modes — full mode's Surprises/Approach/
Near-misses/Fresh start, hindsight mode's five Approach-family evaluations — evaluates the code
that got built. None of them evaluate the pipeline's own behavior toward the operator during the
session. Today that judgment only happens if a human eyeballs the console's raw event list and
manually invokes `/feedback`.

The fix is narrow because the hard parts — classification, staging, scrubbing, filing — already
exist and are reused unchanged. This design adds one new **source** (a reflect lens) and one new
**input** to that source (an AskUserQuestion event, which currently isn't logged anywhere
durable).

## The decision

**A new reflect lens, "Friction."** It reads the run's `events.jsonl` for denial/violation
events and AskUserQuestion stops, judges each for avoidability, and additionally judges the
run's total stop volume even when every individual stop looked justified. Candidate insights
feed into the same Step 2 → Step 3 pipeline every other lens already uses — no new routing rule,
no new filing mechanism.

### Why events.jsonl, not the conversation transcript

This project runs `integration-model: pr-first`: a run's wrap-up can execute in a different
session than the one that hit the friction, because state converges from GitHub rather than
session continuity (`bin/lib/reconcile/`, CLAUDE.md's Background convergence note). A lens that
inferred "how many questions did I ask" from its own conversation would silently miss everything
from an earlier session. `events.jsonl` doesn't have that gap — it's written by the hooks
dispatcher, a separate process from any Claude session, and already survives this exact scenario
for denial events. AskUserQuestion needs the same treatment.

### Why the LLM judges avoidability, not deterministic rules

The distinction that matters — "this block was the gate doing its job" vs. "this block was a
false positive" vs. "this question should have been answerable from CLAUDE.md" — is exactly the
kind of qualitative call reflect's other lenses already make about the code. Hardcoding it
(`gate-denial always means X`) would need a code change for every new denial type and lose
nuance a maintainer needs to act on the report. No numeric threshold for "too many questions" is
introduced for the same reason — the lens judges volume qualitatively, the way it judges
everything else, rather than adding a new config knob for a magic number nobody could tune
correctly in advance.

### Rejected

- **Fold into the existing Near-misses lens.** Near-misses is about the code almost breaking;
  this is about the pipeline being annoying to operate. Different audiences (code owner vs.
  plugin maintainer) — conflating them muddies both.
- **Deterministic pre-filter that skips the LLM call on a clean run.** Cheaper, but the lens
  already has to read a (usually short) `events.jsonl`; the marginal cost of one more lens in an
  already-dispatched single pass is small, and "always run, let it decide" is simpler to reason
  about than a second code path with its own edge cases.
- **Read the conversation transcript instead of adding hook logging.** Fails silently under
  `pr-first` background convergence, per above. Rejected outright, not just as a cost tradeoff.
- **A numeric AskUserQuestion threshold in `policy.yml`.** Adds a config surface for a number no
  one can pick correctly ahead of time; the LLM judgment already generalizes better.
- **Run in hindsight mode too.** Hindsight runs mid-pipeline, during `/review`, before the run is
  complete — later phases could still add denials or stops, so a hindsight-time friction verdict
  would be judging a partial, possibly misleading picture. Friction is a wrap-up-time concern by
  nature (full and light modes only, both `/wrap-up`-invoked).

## The contract

### 1. New event: `ask-user-question`

`bin/lib/hooks/post-tool-use.js` gains a new branch in `run(ctx)`, alongside the existing
`Skill`/`Bash`/`Write`/`EnterWorktree` branches:

```js
if (ctx.input.tool_name === 'AskUserQuestion') return logAskUserQuestion(ctx);
```

`logAskUserQuestion` follows the same shape as `checkWorktreeStaleness`/
`logWorktreeStalenessEvent`: gated on `ctx.ownedRun.dir` (no run dir owned → no-op, consistent
with every other log-tier event in this file), wrapped so a failure here never breaks the
session, and calling:

```js
ctxLib.appendEvent(ownedRun.dir, 'ask-user-question', {
  header: <question header>,
  options: <option labels offered>,
  answer: <label picked, or "custom text", or "skipped">,
}, ownedRun.attribution);
```

Sourced from `ctx.input.tool_input` (the question/header/options as posed) and
`ctx.input.tool_response` (what was actually answered) — both already available to every other
`PostToolUse` handler in this file.

This is the only genuinely new mechanism in the whole design. Everything below reuses existing
plumbing.

### 2. New lens: Friction

Added to `reflect/full-mode.md` and `reflect/light-mode.md`, alongside the lenses those files
already define. Input: the run's `events.jsonl`, filtered to denial/violation event types
(`wd-deny`, `gate-denial`, `wd-push-mismatch`, `wd-ambiguous`, `wd-foreign-teardown`,
`contract-violation`) plus the new `ask-user-question` type. No run dir / no `events.jsonl` →
the lens reports nothing, the same fail-open posture the hooks system already uses throughout.

For each qualifying event, the lens judges:

- **Per-event avoidability** — was this specific denial or stop necessary, or does it indicate a
  claude-tweaks defect (a gate that shouldn't have fired) or gap (a decision the plugin should
  have had a default for)?
- **Aggregate volume** — independent of any single event's verdict, does this run's total stop
  count look unusually high for what the work required?

A finding from either judgment is an ordinary reflect insight from here on — it enters Step 3
exactly like a Surprises or Near-misses finding, gets classified through `_shared/learning-routing.md`
(false-positive denial → defect, rule 1; recurring missing default → gap, rule 7), and stages as
a `U#` Review Console row the same way.

**No new dispatch site.** Component-invoked reflect (the normal wrap-up path) already runs all
lenses inline in the main thread with zero Task-tool dispatches; standalone reflect already
dispatches one Frontier singleton covering every lens in a single pass. Friction is one more
lens folded into that existing bundle, not a new dispatch decision.

**Modes:** full and light only (both `/wrap-up`-invoked). Not hindsight — see Rejected above.

### 3. Maintainer-actionable content — a contract on what the lens hands off, not a new step

`/feedback`'s Step 1 (Gather) and Step 5 (Draft) already have the right shape — repro steps,
expected-vs-actual, use case — and don't need to change. What was missing is upstream of that:
a friction-sourced insight must state the *general triggering condition* (which gate/policy
fired, under what condition, drawn from the event's own logged fields) rather than "felt like
friction" or a literal replay of this session's commands. That's a requirement on the Friction
lens's finding shape, not a new field in the feedback template — the same event data
(`gate-denial`'s `tool`/`path`, `wd-deny`'s `expected`/`actual`/`command`, the new
`ask-user-question`'s `header`/`options`) that already flows into these events is exactly what
makes a reproduction generic and scrub-survivable: project-agnostic by construction, the same
discipline the hooks system already holds itself to.

## Phasing

Single phase — the pieces are small and none is independently useful without the others (a
Friction lens with no `ask-user-question` events to read is half-blind; the event alone with no
lens to judge it is just more raw console noise).

## Files

| File | Change |
|---|---|
| `bin/lib/hooks/post-tool-use.js` | New `logAskUserQuestion` branch + handler, per the contract above |
| `tests/hooks-post-tool-use-ask-user-question.test.js` (new — matches the existing per-feature convention: `hooks-post-tool-use-worktree-staleness.test.js`, `-closing-keyword.test.js`, `-design-doc.test.js`) | Coverage for the new branch: fires only on `tool_name === 'AskUserQuestion'`, no-ops with no owned run dir, never throws |
| `reflect/full-mode.md` | New Friction lens definition |
| `reflect/light-mode.md` | New Friction lens definition (same lens, light mode's existing narrowed-subset framing gains a third lens) |
| `reflect/SKILL.md` | Modes table: Friction added to full and light lens lists |
| `docs/skill-graph.md` | New edge: `/reflect`'s Friction lens reads `bin/lib/hooks/post-tool-use.js`-logged events as an input source |

## Not doing

- **Failed/errored mid-session tool calls as a friction signal.** Explicitly scoped out — not
  currently logged anywhere structurally, and a different problem (tool reliability, not
  operator-experience friction) from what this design addresses.
- **A numeric AskUserQuestion threshold.** See Rejected.
- **Hindsight-mode coverage.** See Rejected.
- **Retrofitting past runs.** The lens only ever sees events logged from this change forward;
  `events.jsonl` for already-archived runs has no `ask-user-question` entries and isn't
  backfilled.
- **Changing `/feedback`'s draft template.** The existing Repro-steps/Expected-vs-actual shape
  already fits; only the upstream producer's discipline changes.
