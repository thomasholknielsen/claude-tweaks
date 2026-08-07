# Research — Verify Mode Source Registry

Loaded by `verify-mode.md` when a question is classified **falsifiable** and needs a verdict.
`verify-mode.md` owns the mode's procedure; this file owns the sources, and it is separate
precisely because it is the part that grows — adding a source is an edit here, and the mode
procedure should not have to be re-read to make one.

## The registry

Entries are keyed by **what a source can falsify**, not by which tool they use. Three entries below
mechanically run `grep`; they are separate because they answer different kinds of question, and
collapsing them by tool would lose exactly the distinction the routing rules depend on.

| Source | What it can falsify | Confidence | Read mechanism |
|---|---|---|---|
| `runtime` | "this command works", "this produces X" — any claim about observable behavior when actually run | high | Execute it, bounded. See Bounded execution below. |
| `codebase` | "this symbol / branch / behavior exists in the source" | high | `Grep` / `Read` over source files. Provenance is `file:line`. |
| `repo-prose` | "this project already documents, decides, or forbids X" | high | `Grep` / `Read` over `CLAUDE.md`, `docs/**`, `skills/**`. Provenance is `file:line`. |
| `tests` | "this behavior is covered", "this invariant is enforced" | high | Read the suite; run one focused test when reading leaves real doubt. |
| `history` | "we have tried this before", "this failed before", "this was deliberate" | high | `docs/incident-log.md`, `git log`, closed work records. |
| `telemetry` | "this actually happens in practice", "at this rate" | high | `.claude-tweaks/pipelines/*/events.jsonl` and each run's `decisions.md`. |
| `deps` | "the dependency does / does not support X at the version we pin" | medium | `tools/upstream-drift/`'s checks and `manifest.yml`. See Dependency reads below. |
| `web` | "the outside world does X", "the state of the art is Y" | medium | `WebSearch` / `WebFetch` — the same tools the bare-topic survey path uses. |
| `human` | Anything only the human knows — intent, priority, an unstated constraint | n/a — terminator | **Dispatches no agent.** See The human terminator below. |

Confidence is a property of the **source**, carried on each verdict — never a document-level
disclaimer. A single run routinely mixes `file:line` evidence with web evidence, and a flat list
renders them identically.

### Bounded execution (`runtime`)

Reuse the technique `skills/docs-health/judge-procedure.md` already established for executing
command blocks — do not invent a second one:

```bash
cmd > /tmp/rv-$$.out 2>&1; echo "exit=$?"
```

Inspect the exit status plus `tail -20` of the temp file. The check is whether the command behaves
as claimed, not what it prints; an unbounded capture of something like `npm test` runs to hundreds
of KB and none of it changes the verdict. Widen to the full file only when the command fails, or
when its tail contradicts the claim and the detail is needed to describe the contradiction.

### Dependency reads (`deps`)

`node_modules` reads are **structurally denied in this project**, even after a grant attempt — this
is a standing environment fact, not a transient permission prompt to retry. When a `deps` question
needs the installed source, fall back to context7 or the dependency's public documentation and
record the verdict at **medium** confidence, noting the fallback in its provenance. Do not report a
`deps` verdict at high confidence on the strength of documentation alone: docs describe intent,
installed source describes behavior.

### The human terminator

`human` **dispatches no agent.** Routing a question here means stop researching it and ask — there
is no source that can settle intent, and a research pass that guesses at it produces a confident
answer to a question nobody asked. A question routed to `human` yields no verdict; it yields a
question for the caller to put to the user.

## Routing

A question goes to **every source that could falsify it** — not to the single best one. Multiple
sources per question is the normal case, not an exception, and a question that reaches only one
source is usually a question that was scoped too narrowly.

Route by reading the "What it can falsify" column against the question, and take every row that
could return a contradicting answer. Two consequences follow:

- **Agreement across sources is itself evidence.** Three sources that independently fail to falsify
  a claim support it far more than one that fails to falsify it once.
- **Disagreement is the most valuable outcome.** When `repo-prose` says one thing and `codebase`
  says another, the design question is settled less by which is right than by the fact that the two
  have drifted — that is a finding in its own right, and it is reported as one rather than resolved
  silently in favor of whichever source is easier to trust.

`human` is the exception to the fan-out, and it is **exclusive**. A question only a human can
settle is by definition one no source can falsify, so it never appears in the same routing as a
falsifiable source (see The human terminator). If a question looks like it routes both to `human`
and to a falsifiable source, it is two questions wearing one sentence: split it, route each half on
its own terms, and let the falsifiable half's verdicts stand as context the human reads before
answering the other half.

### Absence is a finding

A source that returns nothing has answered. Report it — "no precedent exists" — never omit it. This
binds hardest on `history` and `telemetry`, where "we have never done this before" is frequently the
single most design-changing thing a run surfaces. A silently-absent result is indistinguishable from
a lookup that failed, and silence cannot be found by keyword search later.
