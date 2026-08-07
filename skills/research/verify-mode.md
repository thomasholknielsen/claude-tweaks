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

## Question shape: falsifiable vs. unfalsifiable

Every surviving question is classified by shape before it is researched, because the two shapes
return different things.

| Shape | Meaning | Routes to | Returns |
|---|---|---|---|
| **Falsifiable** | A specific source could show the claim is wrong — "does `X` already handle `Y`?", "is this file loaded at startup?" | The source registry | A **verdict** |
| **Unfalsifiable** | No single source settles it — "how do other tools approach this?", "what are the tradeoffs here?" | Survey | A **landscape** |

The registry itself — every source, what each can falsify, its confidence tier, and how it is
read — lives in `source-registry.md` in this skill's directory, along with the routing rules, the
dispatch procedure, and the verdict shape. Read it when a question routes to the registry.

### Depth tiers bound survey breadth only

`--mode=quick|standard|deep|ultradeep` **bounds survey breadth only** — how wide the landscape
sweep goes for unfalsifiable questions. The tiers do not govern falsifiable questions at all: a
verdict is settled by whether a source falsifies the claim, and no depth setting makes that answer
more or less true. A falsifiable question is researched until a source settles it or the sources
are exhausted, regardless of the tier in effect.

### Absence is a finding

A source that returns nothing has answered the question. Report it as such — "no precedent exists"
— never omit it. A silently-absent result is indistinguishable from a lookup that failed, and
silence cannot be found by keyword search later. This binds hardest on history- and
telemetry-shaped sources, where "we have never done this before" is frequently the single most
design-changing thing the run surfaces.

## Auto-mode behavior

Survey depth resolves through the standard chain in `skills/_shared/auto-mode-contract.md` —
**CLI arg > pipeline config > project policy > skill default** — never by prompting:

1. **CLI arg** — an explicit `--mode=` on this invocation always wins.
2. **Pipeline config** — the run directory's `config.yml`, when one resolves.
3. **Project policy** — `.claude-tweaks/policy.yml`.
4. **Skill default** — `standard`.

Verify mode introduces **no new mid-flow stop**. The Mode Picker's interactive prompt is skipped
whenever `auto` is active or `$PIPELINE_RUN_DIR` is set, exactly as the bare-topic path already
does; the resolved tier is logged rather than asked.

The bare-`verify` ambiguity above is not an exception to this, but it does need its own rule.
`verify` is not reachable from `/claude-tweaks:flow` (see Lifecycle position), so no orchestrator
invokes it as a pipeline step — but a run directory can still resolve here, because
`/claude-tweaks:capture`, `/claude-tweaks:challenge`, and `/claude-tweaks:specify` all set
`$PIPELINE_RUN_DIR` when they invoke this skill (see `SKILL.md`'s Component-Skill Contract), and
`_shared/pipeline-run-dir.md`'s most-recent-matching-directory fallback can resolve one with no
orchestrator at all.

- **No run directory resolves** — a direct human invocation. Present the choice above. This is the
  normal case.
- **A run directory resolves** — do not prompt, and do not guess a target. A bare `verify` carries
  no brief, no record, and no topic, so the missing input is a *target*, not a mode: picking either
  reading still leaves nothing to research. Log `NEEDS_CONTEXT` to the run's `decisions.md` per
  `skills/_shared/auto-mode-contract.md` ("if the skill genuinely needs information not in the
  Config Manifesto, it logs `NEEDS_CONTEXT` … and surfaces it at the Review Console"), report the
  missing target, and stop this skill — not the pipeline. A hard gate is permitted here where a
  prompt is not.

Every verdict writes one `decisions.md` line, in the same entry schema a filter drop uses.

## Output

Verify mode writes no dated report directory. `SKILL.md`'s Workflow Steps 2 and 6 — which
construct `{root}/[YYYY-MM-DD]-[topic-slug]/` and write `report.md` — are exactly the steps it
routes around, so `--output=<path>` has nothing to override here. `--engine=auto|inline` does not
apply either: a falsifiable question is settled by the source registry, not by `/deep-research` or
the inline WebSearch method.

| Output | Destination |
|---|---|
| One line per filter drop, and one per verdict | The run's `decisions.md` (see Logging a drop) |
| The verdicts themselves | Written back into the brief's assumption lines — **record #178's deliverable, not built yet.** Until it lands, verify mode reports verdicts inline to its caller and they are not persisted. |
