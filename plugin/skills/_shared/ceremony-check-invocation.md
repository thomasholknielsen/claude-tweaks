# Ceremony-Check Invocation — Shared Snippet

The canonical `ceremony-check` invocation pattern every call site in this codebase uses: read
`facets.ceremony` when it's already stamped, else invoke `/claude-tweaks:assess-agent-autonomy`
in `ceremony-check` mode and use (and, where the call site owns writeback, stamp) the verdict.
Referenced by `specify/shaping-mode.md`, `specify/record-creation.md`, and
`flow/materialize.md`. Consumers reference this file; do not restate the invocation prose
inline — mirrors `_shared/label-bootstrap.md`'s "canonical snippet cited by multiple skills"
convention.

## When to invoke

Skip the call entirely when `facets.ceremony` (the `ceremony:fast-lane`/`ceremony:standard`
label, or the local-files `facets.ceremony` field) is already stamped on the record — reuse the
existing value. This axis has no unscored state: unlike `risk:*`/`size:*`'s
omit-when-unscored convention, every record gets an explicit verdict the first time it's judged,
so a `null`/absent value always means "not yet invoked," never "deliberately unscored."

## Canonical call

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check {#n or bare}")
```

The mode reads the record's already-composed or already-fetched body (Current State /
Deliverables / Acceptance Criteria) — never a fresh fetch when the caller already holds it in
memory — and outputs:

```
CEREMONY: fast-lane | standard
RATIONALE: {one paragraph, naming the specific content signal the verdict is based on}
```

Full Gather/Judge/Render contract, including the conservative-on-ambiguity default
(`standard` when nothing in the content clearly supports `fast-lane`):
`skills/assess-agent-autonomy/ceremony-check.md`.

## Call-site deltas (not restated here — see each site)

Every call site parameterizes this pattern along three axes, documented at the site itself
rather than folded into this shared file:

- **Writeback vs. fallback-only** — whether the verdict is stamped back onto the record as an
  explicit label/facet, or used only for the current run's own in-memory purpose.
- **Per-record vs. per-leaf** — a single-record invocation vs. one invocation per sub-issue
  inside a decomposition loop.
- **With vs. without `#{n}`** — whether an issue number exists yet at invocation time (a
  pre-numbering call omits it, per `ceremony-check.md`'s documented exception).
