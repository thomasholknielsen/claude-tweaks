# Health Sweep — Issue Index for Dedup

Single source of truth for how the four health sweeps (`/claude-tweaks:code-health`,
`/claude-tweaks:harness-health`, `/claude-tweaks:journey-health`,
`/claude-tweaks:docs-health`) build the `by:{skill}` issue index their
`validate-findings` step dedups against. Each skill's own `gh issue list` command and
fingerprint-parsing instructions stay in that skill's GATHER OPEN ISSUES step; this file
owns transport selection and what each possible outcome means.

`{SKILL}` below is the calling skill's own name (`harness-health`, `docs-health`, …) and
`{ISSUES_FILE}` its own parsed-index path.

## Transport

`gh` present (`command -v gh` exits 0) → run the skill's own `gh issue list` command
unchanged.

`gh` absent → **rebuild the same index via the MCP `list_issues` tool**, filtered to label
`by:{SKILL}` and state `all`, per `_shared/github-write-transport.md`'s CRUD mapping.
Project the results into the identical `{ number, state, labels, fingerprint }` shape and
write them to the same `{ISSUES_FILE}` path, so the `validate-findings` call downstream is
byte-identical on both transports. Never `search_issues` — it rides an eventually-consistent
index and has caused real duplicate-filing incidents (see that file).

A missing `gh` is a reason to **change transport, never a reason to skip this step**. The
detection is a capability probe, not an environment classification: it holds regardless of
*why* `gh` is missing, and the unattended cloud Routine firing where `gh` is reliably absent
is precisely the run that most needs a correct index.

## The three outcomes are not interchangeable

| Outcome | `ISSUES_FILE` | Meaning |
|---|---|---|
| Index fetched on either transport, one or more issues returned | path to the parsed JSON | Normal. Pass `--issues`. |
| Index fetched, but the repo genuinely has no `by:{SKILL}` issues yet | path to a file containing `[]` | **Legitimate empty index** — a first-ever sweep, or every prior finding since deleted. Dedup against it is correct *and complete*. Still pass `--issues`. |
| Neither transport can reach GitHub (no `gh`, no MCP tool, or the API is down/unauthenticated) | `""` | **Degraded** — the index is *unknown*, not empty. Omit `--issues`, and say so explicitly in the run's output (see below). |

Writing `""` for the second row is the specific mistake this file exists to prevent. An
empty index and an unavailable index produce the same `--issues`-less command but mean
opposite things, and collapsing them is what silently disabled `wontfix` suppression across
three of these four skills (#163).

## Reporting a degraded run

On the third row only, state it in the run's own output — do not let it pass silently:

> Issue index unavailable this run (`gh` absent and no GitHub MCP transport reachable) —
> dedup fell back to durable state only. Findings already suppressed on a prior run stay
> suppressed; a `wontfix` applied since the last successful index fetch is not visible to
> this run.

That last clause is the real residual risk and the reason the fallback below exists rather
than being relied on alone.

## Why a degraded run is survivable

`wontfix` lives on the GitHub issue, so an index-less run cannot read it fresh. What makes
that survivable is that a run which *does* read the index hands its readings forward: every
finding suppressed because its matching issue carries `wontfix` is persisted to the durable
`declined` slice on the `health-state` branch (`_shared/health-state.md`), which — unlike
the local gitignored `cache.json` — survives a scheduled Routine firing's fresh, stateless
container. See `bin/lib/health-core/mark.js`'s `mergeWontfixIntoDeclined` and
`bin/lib/health-core/validate-findings-dispatch.js`'s `wontfixSuppressed` hand-off.

So the two mechanisms cover different failures and both are needed:

| Failure | Covered by |
|---|---|
| `gh` missing (the cloud Routine sandbox) | the MCP transport above |
| GitHub unreachable entirely, or a `wontfix` applied before this container existed | the durable `declined` slice |

The local `cache.json` covers **neither** in a Routine: it is recreated empty in every fresh
container. Do not cite it as the fallback for either row.
