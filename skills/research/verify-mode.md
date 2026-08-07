# Research — Verify Mode

Loaded by `/claude-tweaks:research` when `$ARGUMENTS` opens with the positional token `verify`.
The bare-topic path (`/claude-tweaks:research <topic>`) never reads this file.

`verify` mode grounds a design *before* it is written. It is a different job from the bare-topic
web survey, not a fifth depth tier — which is why it is a leading positional mode token rather
than another `--mode=` value. Overloading `--mode=` would make `--mode=verify --mode=deep`
unexpressible.

## Lifecycle position

```
/claude-tweaks:challenge → [ /claude-tweaks:research verify ] → /superpowers:brainstorming
```

`/claude-tweaks:challenge` opens a loop: it surfaces assumptions and open questions, and then
nothing checks them. Verify mode closes it — the questions get answered against real sources
before brainstorming commits to a design.

### Not reachable from `/claude-tweaks:flow`

`/flow` consumes ready leaf records, which are post-design by construction. Grounding a design
there is structurally too late to change it, so `verify` is deliberately **not reachable** from
`/flow` and is not an allowed flow step. Run it before `/superpowers:brainstorming`, not after
`/claude-tweaks:specify`.

## Input resolution

`/claude-tweaks:research verify [brief-path|#N]`

| Input | Resolution |
|---|---|
| A brief path (`docs/plans/{YYYY-MM-DD}-{topic}-brief.md`) | Read `### Key Assumptions Surfaced` and `### Open Questions for Brainstorming`. Each entry becomes one candidate question. |
| A record reference (`#N`) | Resolve the record, then look for a brief for its topic. Found — read it as above. Not found — fall to the no-brief case below. |
| Neither (a bare topic, or a record with no brief) | **No-brief case.** Generate the candidate set from the topic directly: enumerate the claims the design would rest on if written today. Skipping `/claude-tweaks:challenge` must not skip grounding. |

The candidate set is the input to the consequence filter below. It is never researched as-is.

### The bare-`verify` ambiguity

`/claude-tweaks:research verify` with nothing after it is ambiguous: `verify` could be the mode
token with a missing argument, or it could be the research topic (a user researching the word
"verify"). Resolve it by presenting a choice — never by silently assuming either reading. Call
`AskUserQuestion` with `question`: `"'verify' could be the verify-mode token or the research
topic. Which did you mean?"`, `header`: `"Input type"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Verify mode (Recommended)"`, `description`: `"Run verify mode; I'll ask which brief, record, or topic to ground."`
- Option 2 — `label`: `"Topic named 'verify'"`, `description`: `"Run the bare-topic web survey on the literal topic \"verify\"."`

This mirrors the numbered-choice disambiguation `/claude-tweaks:specify`'s `## Input` already
establishes for its own topic-vs-path collision.

## The consequence filter

The filter is the entire cost-control mechanism. There is no budget knob and no per-source
authorization: a topic where nothing diverges correctly costs nothing, and a topic on new ground —
where you have no priors, so almost everything diverges — automatically authorizes more work. The
filter self-calibrates, which is why no separate green-field mode exists.

Apply it to every candidate question, one at a time:

> **If the answer surprised me, would the design change?**

The question has exactly two outcomes. It is not a severity scale and not a scoring rubric —
do not rank candidates by importance, confidence, or cost, and do not assign points.

| Outcome | Action |
|---|---|
| **Yes** — at least one answer leads to a different design | Keep it. It goes to routing (below). |
| **No** — both branches lead to the same design | Drop it, and log the drop. |

Both branches converging is the *only* reason to drop a question. A question is never dropped for
being expensive, broad, or unlikely to resolve.

Order the surviving questions by **divergence** — how different the two designs are — highest
first. That ordering is the output; it is what makes a partial run useful when one is cut short.

### Logging a drop

Every drop writes one line to the run's `decisions.md`, in the entry schema
`skills/_shared/auto-decision-log.md` defines:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

Concretely, under a `## /research` heading:

```
- AUTO 14:22:07 — verify filter: dropped "does the cache need a TTL?" — both answers lead to the same design (the module is rebuilt per-run either way). Reversibility: high.
```

A drop is `AUTO`, never `STAGED` or `KEPT-PROMPT`: the filter acted, and the log is how that action
stays auditable. Dropping silently is forbidden — an unlogged drop is indistinguishable from a
question nobody thought of.
