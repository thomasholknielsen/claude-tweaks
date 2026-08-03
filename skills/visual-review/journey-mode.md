# Visual Review — Journey Mode

Loaded by `/claude-tweaks:visual-review` when the resolved mode is `journey:{name}`. Walks the full journey via a single `agent-browser batch` invocation, applies the creative framework at each step, then assesses the overall arc.

Requires the shared prerequisites from `browser-review.md` (session naming, screenshot path convention, QA data loading, Step 0 reconnaissance) — load this file only AFTER those have been processed.

## Load the journey

Read `docs/journeys/{name}.md`. Extract:
- **Persona** — primary persona for the entire review (additional personas from Step 3 can supplement)
- **Goal** — what "success" looks like
- **Entry point** — where the review starts
- **Success state** — how you know the journey worked
- **Steps** — each step has a URL, action, "should feel", "should understand", and "red flags"

## Assemble the batch invocation

Walk the journey via a single `agent-browser batch` invocation that owns the session lifecycle for that walk. Bundle every step's `open`, `snapshot -i -c`, annotated `screenshot`, and `vitals` capture into one invocation. The batch ends with `close` only if no further interactive ops are needed.

**Worked example — three-step checkout journey:**

```
agent-browser batch --session checkout-journey-review \
  "open https://app.example.com/cart" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/checkout-journey-review/01_cart.png" \
  "vitals" \
  "open https://app.example.com/checkout/shipping" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/checkout-journey-review/02_shipping.png" \
  "vitals" \
  "open https://app.example.com/checkout/payment" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/checkout-journey-review/03_payment.png" \
  "vitals" \
  "close"
```

The batch returns concatenated output: per-step snapshot trees (with element refs), screenshot file paths confirmed written, and Web Vitals values. Parse output by step boundary — each `open` starts a new step block.

**When per-step interactions are needed** (click, fill, type that depend on refs from a fresh snapshot): split the walk. Run a batch up through the page that needs interaction, perform the interactive ops outside the batch in the same session, then start a follow-on batch for the remaining steps. One `batch` invocation = one session lifecycle slice — never mix session names within a batch.

## Per-step review (against the batched output)

For each step's block in the batched output:

1. **Health check** — console errors, failed network requests, broken rendering visible in the snapshot. If the step is broken, capture a trace (see "Trace on failure" below) and continue to the next step.
2. **Should-feel test** — the journey says this step should feel like "{should_feel}." Does the snapshot + annotated screenshot support that? Be honest and specific about gaps. This is the key per-step test.
3. **Red-flag check** — does the step exhibit any of the journey's documented red flags?
4. **Vitals check** — compare the step's Web Vitals against the thresholds in `browser-review.md`'s Shared review contract, "Vitals interpretation (Step 1)" (LCP/CLS/INP/TTFB/FCP) — that table is canonical; this file doesn't restate the values. Vitals findings flow into the Step 6 table.

Note transition quality between steps (jarring? smooth? lost momentum?) as a one-word annotation for the arc assessment. Reference annotated overlay numbers when describing visual issues — "primary CTA at element [3] competes visually with the secondary link at [5]" beats "the button on the right looks heavier than the link."

Do not perform full persona rotation, structured analysis, or reimagining at the per-step level — those are more valuable at the arc level where patterns across steps are visible.

## Assess the overall arc

After walking all steps, step back and evaluate the journey as a whole. This is where deeper analysis happens — patterns across steps produce better signal than per-step checklists.

**Journey coherence:**
- **Momentum** — does the journey build toward the goal, or does it stall somewhere?
- **Coherence** — does it feel like one experience, or stitched-together features?
- **Payoff** — does the success state deliver on the promise of the entry point? Is the "aha moment" actually there?
- **Length** — too many steps? Too few? Are there steps that could be eliminated or combined?
- **Drop-off risk** — where in the journey would a user most likely give up? Why?

**Interaction and visual quality (across the arc):**
- **Consistency** — does the visual language, interaction speed, and feedback quality stay consistent across steps?
- **Worst step** — which step has the biggest gap between "should feel" and "actually feels"? This is the primary candidate for improvement.
- **Best step** — which step nails its "should feel"? What makes it work? Can that quality be replicated elsewhere?

## Journey mode report

The report follows the same structure as the standard Report & Route (`browser-review.md`'s Shared review contract, "Report & Route (Step 6)") but adds journey-specific sections before the findings table:

```markdown
### Journey Assessment: {journey name}
**Persona:** {persona}
**Goal:** {goal}

| Step | Should Feel | Actually Feels | Vitals (LCP/CLS/INP) | Transition | Verdict |
|------|------------|----------------|----------------------|------------|---------|
| {step name} | {from journey file} | {honest assessment} | {values} | {smooth/jarring/stalls} | {pass/gap/fail} |

### Journey Arc
- Momentum: {builds well / stalls at step N / loses steam}
- Coherence: {feels unified / disjointed between steps N and M}
- Payoff: {delivers / underwhelming / missing}
- Drop-off risk: {step N — because {reason}}
- Worst step: {step N — biggest should-feel gap}
- Best step: {step N — what makes it work}
```

Journey-level findings merge into the Step 6 findings table alongside per-step findings.

## Update the journey file

If the browser review revealed that "should feel" descriptions are inaccurate, red flags are missing, or steps need reordering, **update the journey file**. The journey is a living document — each browser review refines it.

## When a journey step fails — capture trace, attach path, close session

When a journey step fails — assertion mismatch, page error, navigation timeout, broken render, unrecoverable interaction error — capture a trace **before** closing the session. The trace lets you diagnose the failure offline without re-running the journey.

```
agent-browser --session <session> trace save traces/<session>/<timestamp>.zip
```

`<timestamp>` should be ISO-like and filename-safe (`20260501-143022`). Then close the session:

```
agent-browser --session <session> close
```

In the failure report, attach the trace path verbatim so the user can open it with `agent-browser trace view <path>`. Do not omit the trace — failure reports without a trace path are not actionable. There is no automatic retention policy; users manage cleanup.

If the failure is mid-batch, the batch invocation will return partial output up to the failure point. Run `trace save` and `close` as separate invocations after the batch returns; do not append them to the failed batch.
