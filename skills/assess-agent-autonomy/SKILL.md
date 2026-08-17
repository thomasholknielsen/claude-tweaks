---
name: assess-agent-autonomy
description: Use when backlog, dispatch, or specify need a content-aware trust or ceremony verdict, not a label lookup. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification, ceremony profile, fast-lane.
argument-hint: "<grant-check|merge-check|failure-check|ceremony-check> [#{n}] [--base <ref>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.

# Assess Agent Autonomy — Content-Aware Trust Verdicts

Four-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:backlog refine`, `/claude-tweaks:backlog grant`, `/claude-tweaks:dispatch`,
`/claude-tweaks:specify`, or (fallback only) `/claude-tweaks:flow`:

```
/claude-tweaks:backlog refine         [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:backlog grant          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge    [ merge-check ]    -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle        [ failure-check ]  -> CLASSIFICATION + NOTIFY_NOW
/claude-tweaks:specify Step 3         [ ceremony-check ] -> CEREMONY: fast-lane | standard
```

Each mode's full Gather/Judge/Render procedure lives in its own sub-file — read only the one the
caller needs:

- `grant-check` → `grant-check.md`
- `merge-check` → `merge-check.md`
- `failure-check` → `failure-check.md`
- `ceremony-check` → `ceremony-check.md`

## When to Use

The diagram above names the call site for each mode; each sub-file's own "Called from" line gives
the full detail (e.g. `grant-check` also covers `/claude-tweaks:backlog grant`'s gate chain, and
`merge-check` also covers `/claude-tweaks:wrap-up`'s Review Console Auto-merge short-circuit — both
same-mode, same call shape as their primary caller).

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:backlog refine`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), deciding auto-merge
eligibility or blast-radius caps (that's still `merge-check` alone — `ceremony-profile` and
`auto:merge` are independent axes), or any decision outside the call sites above — this is not a
general-purpose risk service.

## Input

`$ARGUMENTS` is `{mode} [#{n}] [--base <ref>]`, where `mode` is one of `grant-check` |
`merge-check` | `failure-check` | `ceremony-check` and `#{n}` is the record's issue number. Each
mode's own Step 1 ("Gather," in its sub-file) is the source of truth for how it's used — they differ:
`grant-check` fetches the record body via `gh issue view` keyed on `#{n}`; `failure-check` fetches
issue/PR comments via `gh api ".../issues/${N}/comments..."`, also a genuine fetch keyed on `#{n}`;
`ceremony-check`'s primary call path (from `/specify`) issues no fetch at all — it reuses
body/label data the caller already holds in memory, and its fallback path (from `/flow`) likewise
reuses data `materialize.md` already fetched; `merge-check` uses `#{n}` only as a temp-file-name
suffix for its own git-diff/config-derived gather — it never fetches the record itself.

`#{n}` is omitted only from `ceremony-check`'s primary call in `/specify`'s Step 3
decomposition-mode per-sub-issue loop — the sub-issue has no issue number yet at that point in the
procedure (it's assigned only after the record is created, later in the same step), so that call
site invokes this skill as bare `ceremony-check` with no trailing `#{n}` at all. Every other mode,
and `ceremony-check`'s own Shaping-mode and `/flow`-fallback calls, always pass `#{n}`.

`--base <ref>` is `merge-check`-only: an optional pre-known merge-base commit or ref the caller
already has in context (e.g. one of dispatch's per-group Task calls, which ran `/flow` inside the
worktree its dispatching session set up). When present, `merge-check`'s Step 1 uses it directly instead of re-deriving
the merge base from this project's integration branch. Ignored by the other three modes.

Invoked inline via the Skill tool — not as a fresh Task-agent dispatch. The calling agent (a
human-driven `/claude-tweaks:backlog refine` session, or one of dispatch's per-group Task calls running `/flow` — `failure-check` from the `build,test` call, `merge-check` from the `review,polish,wrap-up` one)
runs this skill's procedure in its own context and reads the produced report directly; there is no
cross-process hand-off.

## Error Handling

If this skill cannot render a clear verdict for any reason (malformed input, an inconclusive read),
default to the conservative outcome for whichever mode was running: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`; `ceremony-check` → `CEREMONY: standard`. Never
resolve ambiguity toward more autonomy or less ceremony — a missed auto-merge or a fuller wrap-up
pass costs a human a click or a few extra minutes; a wrongly-granted shortcut could ship something
bad or under-reflect on real complexity.

## Component-Skill Contract

`/claude-tweaks:assess-agent-autonomy` is **always** a component skill — it is never invoked
directly by a human, and never renders a `## Next Actions` block. Its only callers are
`/claude-tweaks:backlog refine` (Step 2, `grant-check`), `/claude-tweaks:backlog grant` (gate chain
gate 4, `grant-check` — same mode, a machine-written label instead of a human-confirmed table row),
`/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`), `/claude-tweaks:wrap-up` (the Review Console's Auto-merge
short-circuit, `merge-check` — the single-record version of dispatch's same gate, run whether or not
`/claude-tweaks:dispatch` was involved), `/claude-tweaks:specify` (Step 3, `ceremony-check`), and
`/claude-tweaks:flow` (materialization fallback, `ceremony-check` only when record carries no
`ceremony:*` label).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The caller already holds the diff/review-findings/failure-output — a subagent only pays to re-derive it. |
| Treating `ceremony-check`'s verdict as a merge-safety signal | `ceremony-profile` and `auto:merge` are independent axes — a `fast-lane` record can still fail `merge-check`. Ceremony depth never influences merge eligibility, or vice versa. |
| Writing to `decisions.md` from inside this skill | This skill doesn't resolve run dirs; logging is the caller's job (`/claude-tweaks:backlog refine` or `/claude-tweaks:dispatch`). |

Mode-specific Anti-Patterns rows live in their own sub-file (`merge-check.md`, `failure-check.md`) —
these three are the ones that hold across every mode.
