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
