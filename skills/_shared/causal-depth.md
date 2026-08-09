# Causal-Depth Contract

Referenced from `_shared/reproduce-first-discipline.md` (step 3, the hot path — a behavioral bug's confirmed cause) and `skills/reflect/full-mode.md`'s Near-misses lens (the cold path — a recorded near-miss surfaced at wrap-up). Canonical statement of the domain-jumping why-chain: the step that asks not just "what caused this" but "why was this possible" — turning a fixed bug into a dead bug class, the same move behind every `[IL-nn]` rule in this project's CLAUDE.md.

## Input

Two entry points, two evidentiary bars:

- **Debugging path** — a proximate cause confirmed by a green repro (`_shared/reproduce-first-discipline.md` step 2 just passed). This is the strong bar: the cause is verified, not inferred.
- **Near-miss path** — a recorded near-miss's own trigger (`reflect/full-mode.md`'s Near-misses lens, "what broke or almost broke"). This is a weaker bar by design — a near-miss is retrospective, not a green-repro-verified cause. When no proximate cause is identifiable from the near-miss description, render `terminal` directly with rationale "chain exhausted at input" — do not force a chain onto a symptom with no traceable origin.

## The chain

Starting from the input's proximate cause, ask **"why was this possible?"** up to **3 times**. Each answer may jump domains — code → convention → process → tooling — that domain jump is the point: a code-level fix stops at the code, but the *reason the code was wrong* is often a convention with no enforcement, a missing gate, or a process step nobody codified.

Stop before the third why, or before starting a why at all, when either is true:

- **The next answer would leave what this project can change** — a language runtime quirk, an upstream dependency's documented behavior, a one-off human error with no recurring mechanism. There's nothing to bind a rule to past that point.
- **The next answer would be speculation, not evidence** — you're guessing at organizational intent or a process nobody can confirm, rather than reading it off the code, the commit history, or the convention that's actually in the repo.

**Worked example:**

- Bug: a grep-based verification check returned zero matches for text that was visibly present.
- Why 1: the file had a stray NUL byte partway through it. *(keep going — this is a fact about the file, not yet about why the harness let it in)*
- Why 2: nothing in the write path validates encoding before a tool writes to a tracked file. *(keep going — this names a missing gate, which is exactly the domain jump the chain exists to find)*
- Why 3: no convention in this project states "verify text tools can read what git tools wrote" as an invariant. *(stop here — a rule now exists to state; a why 4 would ask why no such convention existed project-wide, which is either "no one hit this before" — unfalsifiable — or scope creep into general documentation culture)*
- Verdict: `systemic` — the fix (strip the NUL byte) closes this instance; the chain surfaced a class (encoding validation) worth a rule.

Contrast: a bug traced to a typo in a comparison operator, fixed, re-verified green. Why 1: the developer wrote `<` where `<=` was needed. Why 2 would ask why the developer made that specific keystroke error — that's psychological speculation, not a repo-level cause. **Stop at why 1.** Verdict: `terminal`.

## Verdict

Render, no preamble beyond what's above:

```
CAUSAL: terminal | systemic
RATIONALE: {one paragraph stating the chain actually walked, including where it stopped and why}
```

`terminal` — the chain stopped at (or before) a why that left the project's own control, or the input itself carried no traceable cause. Fixing the proximate cause is where fixing ends.

`systemic` — the chain surfaced something above the proximate cause: a convention with no enforcement, a fixture or API shape that invites misuse, a missing gate, a process step nobody codified.

**Ambiguity resolves to `terminal`.** This is deliberately the opposite direction from most verdict-rendering conventions in this project (which resolve toward caution/flagging) — here, more caution would mean manufacturing a `systemic` finding for a chain that didn't actually surface one. A missed `systemic` costs a rule that doesn't get written; a false `systemic` trains the reader to stop trusting the column, which is worse, because it erodes every future verdict along with this one.

## Executor

The agent that performed the fix (debugging path) or ran the reflect pass (near-miss path) is the one that walks the chain, in the same context that holds the trace — the causal chain lives in that agent's own working memory of what it just traced or read, and a handoff to a fresh agent with no access to that trace can't reconstruct it. This is what keeps the chain hot: no re-derivation, no re-reading of logs a different agent already has open.

## Logging and routing

No new file, store, or destination. Write behavior:

- **When a pipeline run dir exists** (`$PIPELINE_RUN_DIR` resolved, per `_shared/pipeline-run-dir.md`): every invocation writes exactly one line to that run's `decisions.md`, per `_shared/auto-decision-log.md`'s schema — `SCANNED {time} — causal-depth: terminal — {one-line rationale}` for a `terminal` verdict, `STAGED {time} — causal-depth: systemic — {one-line rationale}` for a `systemic` one (the `STAGED` tag reflects that routing, below, defers the finding rather than acting on it directly).
- **When no run dir resolves** (a standalone debugging session, an ad hoc reflect pass with no active pipeline): the finding surfaces inline in the conversation instead. It is not logged, and does not count toward the removal condition below.
- **On `systemic`**, route the finding through `_shared/learning-routing.md`'s classifier by name — that file decides the destination (D1–D5); this contract introduces no new one.

## Removal condition

If the archived pipeline runs of a full release cycle (`.claude-tweaks/pipelines/archive/`) contain **20 or more** `decisions.md` lines tagged `causal-depth` with zero `systemic` verdicts surviving routing, propose removing the debugging-path binding (the `reproduce-first-discipline.md` step 3 citation) via `/claude-tweaks:harness-health`'s rule-expiry check. Standalone, no-run-dir invocations are uncounted by construction (they write nothing) — the count reflects logged pipeline runs only, and the contract states that explicitly so the figure is never inflated by assuming coverage it doesn't have.
