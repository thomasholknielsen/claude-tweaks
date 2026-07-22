# Review Effort Tiering — Design

**Goal:** Bring native Claude Code's `/code-review` effort-argument concept (`low`/`medium`/
`high`/`xhigh`/`max` — fewer, higher-confidence findings at the low end; broader coverage,
including uncertain findings, at the high end) into `/claude-tweaks:review`'s own Step 3 lens
pipeline, so review depth scales with the risk and blast radius of what's actually being
reviewed instead of running every lens at full strength on every diff regardless of size or
danger.

**Architecture:** A new Step 2.5 (Derive Review Effort) resolves a `review-effort` tier per
review run — from an explicit argument, else from the work record's own `risk:*`/`effort:*`
labels (read via the same `parseRecordFacets` helper `assess-agent-autonomy` already uses), else
from a deterministic diff-size/sensitive-path heuristic. The tier gates which of Step 3's
agent-dispatched lenses run, whether cross-lens debate (Step 3.5) fires, and whether
`unconfirmed`/`contested` findings surface inline versus staying staged-only. The same derived
tier also drives a dynamic `/code-review {tier}` recommendation in the Next Actions block, closing
the loop between the plugin's own review depth and the native command's.

**Tech Stack:** Markdown skill-file changes only (prose procedure) across `skills/review/SKILL.md`,
`skills/review/step3-routing.md`, and `skills/review/review-summary-template.md`. No new code —
`parseRecordFacets` (`bin/lib/issues/record.js`) and the `merge-sensitive-paths` config key both
already exist and are reused read-only, the same way `assess-agent-autonomy` already reads them.

## Motivation

Native Claude Code's local `/code-review` command takes an effort argument
(`low`/`medium`/`high`/`xhigh`/`max`, the same enum used session-wide) that trades signal for
coverage: low effort returns fewer, higher-confidence findings; high through max broaden coverage
and may surface uncertain findings. `/claude-tweaks:review`'s Step 3 has no equivalent concept
today — every applicable lens (3a-3h, minus whatever the existing "doesn't apply to this change
type" heuristic prunes) runs at full strength on every review, whether the diff is a two-line
typo fix or a security-sensitive schema migration. That's wasted cost on the low end and, more
importantly, no signal that a genuinely high-risk change deserves *more* scrutiny than the
default gives it.

This codebase already has the exact signal needed to make that call without inventing a new
judgment mechanism: `/specify` stamps every record with `risk:*`/`effort:*` labels (a three-value
scoring pair — risk/blast-radius and implementation size), and `assess-agent-autonomy`'s existing
modes (`grant-check`, `merge-check`, `ceremony-check`) already read those same labels via
`parseRecordFacets` to make their own risk-weighted judgment calls. Review-effort derivation
follows that established pattern directly rather than inventing a parallel one.

One structural constraint shaped the design: the `Agent`/Task dispatch mechanism `/review` uses
for its Step 3 lens fan-out has no per-agent "effort" parameter (only a `model` tier). True
per-agent reasoning-effort control exists only through the `Workflow` tool's `agent()` hook, which
requires explicit user opt-in (ultracode or an explicit orchestration request) and can't be
silently substituted into a step that runs by default on every review. So `review-effort` is
implemented as a **review-owned behavioral knob** — which lenses run, whether debate runs, how
findings surface — not a literal pass-through of an effort value to dispatched sub-agents.

## Non-Goals

- **Not extending effort-awareness to `/code-health` or `/simplify`.** Both share
  `_shared/criteria-review-quality.md` with `/review` and could plausibly get the same treatment
  later, but this design scopes to `/review` only — proving the concept there first.
- **Not a literal effort-API pass-through to dispatched lens agents.** Ruled out by the Task/Agent
  tool's schema (see Motivation). At `xhigh`/`max`, dispatched lens prompts get one additional
  sentence asking for careful reasoning about subtle edge cases — a soft prompt-level nudge, not a
  verified effort override.
- **Not a static config default or ceiling.** An earlier draft of this design proposed a
  `review-effort` config key in `config.yml`/CLAUDE.md as the no-argument default source. Rejected
  in favor of pure derivation from the problem's own risk/blast-radius — a static default doesn't
  adapt to what's actually being reviewed, which was the whole point.
- **Not a `/flow` Pipeline Config Manifesto lever.** A single pipeline-wide review-effort choice
  would defeat per-record derivation in a multi-spec batch, where each spec can carry a different
  risk profile. `/flow` needs no changes — it already passes a record reference through to
  `/review`, which derives its own tier per invocation.
- **Not a new `assess-agent-autonomy` mode or consumer relationship.** An earlier draft considered
  adding `/review` as a fifth consumer (an "effort-check" content-aware judgment call, alongside
  `grant-check`/`merge-check`/`failure-check`/`ceremony-check`). Rejected: it would add an LLM
  judgment call to every single review, including trivial ones, when the record's existing
  `risk:*`/`effort:*` labels (already computed upstream by `/specify`) are sufficient signal.
  `/review` reads those labels directly via `parseRecordFacets`, the same low-level helper
  `assess-agent-autonomy` itself uses — no skill-to-skill call.
- **Not model-tier or reproduction-agent-count scaling.** Considered and rejected in favor of
  lens-set scaling: keeps `bin/lib/coordination.js`'s `categoriseReproduction`/`resolveDebate`
  fixed at their current 2-agent comparison shape, no generalization to N-way consensus needed.
- **Not persisted as a record label.** `review-effort` is derived fresh on every review run from
  whatever the record's labels or the diff look like *at that time* — it is never written back to
  the record, unlike `risk:*`/`effort:*`/`ceremony:*`, which are stamped once and persist.

## Architecture

### Effort tier → Step 3 behavior mapping

| Tier | Agent-dispatched lenses in scope | Cross-lens debate (3.5) | Findings surfaced |
|------|------|------|------|
| `low` | 3b (Security), 3c (Error handling) only — the two lenses whose contract is "always actionable, no info findings" | Skipped — contested findings stay `unconfirmed`/staged, never resolved | `confirmed` only |
| `medium` | + 3a (Convention), 3f (Test quality) — the two Fast-tier mechanical lenses | Skipped | `confirmed` only |
| `high` | + 3d (Performance), 3e (Architecture), 3h (UX, when QA data available) — i.e. every applicable lens. **This tier reproduces today's unchanged default behavior.** | Runs as today | `confirmed` only; `unconfirmed`/`contested` still staged to the Wrap-Up Review Console, unchanged |
| `xhigh` | Same lens set as `high` | Runs as today | `confirmed` **+ `unconfirmed`** surface inline in the Step 3 Routing table, labeled "low-confidence" |
| `max` | Same lens set as `high` | Runs as today | `confirmed` + `unconfirmed` **+ `contested`** all surface inline, each labeled with its status |

The existing "skip a lens if it doesn't apply to this change type" heuristic (e.g. skip
Performance on a docs-only diff) stays in effect at every tier, applied on top of whatever the
tier's default lens set is — effort widens or narrows the default set; applicability skipping
prunes further from there, never the reverse.

The main-thread/deterministic lenses — 3g-cov (journey-story coverage), 3i (doc freshness),
3i-diagram (visual documentation gap) — are **not** gated by effort. They stay gated only by
their existing data-availability conditions (journeys/stories exist, `docs/REGISTRY.md` exists,
`diagram-suggestions: enabled`). They're cheap, deterministic, main-thread computations rather
than agent dispatches, so there's no cost rationale for gating them by effort.

Reproduction pairs (the 2-agent verification step, Step 3's Mode 1 dispatch) always run for every
lens that's in scope, at every tier — verification never gets skipped, only the initial lens set
that gets a chance to flag something changes. This mirrors native `/code-review`'s own behavior:
it always validates flagged issues before reporting them regardless of effort; effort only
affects what gets a chance to be flagged in the first place.

At `xhigh` and `max`, each dispatched lens's prompt gets one sentence appended after the
CALIBRATION block (not replacing it): an instruction to reason carefully about subtle edge cases
and second-order effects. This is a best-effort prompt-level nudge — there is no way to confirm it
measurably changes a dispatched agent's actual reasoning depth, and the design doesn't depend on
it doing so; the lens-set and surfacing changes above are the load-bearing mechanism.

### Deriving the tier — Step 2.5

New step, inserted between Step 2 (Identify What Changed) and Step 3 (Code Review). Resolution
order:

1. **Explicit argument.** If the caller passed an effort token (see Grammar below), use it. Always
   wins — a user who explicitly asks for `low` on a scary change, or `max` on a trivial one, gets
   what they asked for.
2. **Record risk/effort labels.** If this review targets a work record and it carries
   `risk:*`/`effort:*` labels, read them per `work-backend` — the same branch every other
   consumer of these facets already makes (see `/review`'s own Step 1.6, `assess-agent-autonomy`'s
   `grant-check`/`ceremony-check`): `github-issues` — `parseRecordFacets(issue.labels)`
   (`bin/lib/issues/record.js`); `local-files` — the record's frontmatter facets via
   `local-store.js`'s own facet reader (`risk`/`effort` are already in its `defaultFacets`
   whitelist, per `2026-07-20-lifecycle-ceremony-tiering-design.md`'s Known Touch Points, which
   added `ceremony` alongside the pre-existing `risk`/`effort` entries there). Both resolve to the
   same `{risk, effort}` shape regardless of backend, then combine via one canonical table:

   | risk ↓ / record effort → | low | medium | high |
   |---|---|---|---|
   | **low** | low | low | medium |
   | **medium** | medium | medium | high |
   | **high** | high | xhigh | max |

   Risk (blast radius/safety) is the primary driver — `risk:high` always yields at least `high`,
   scaling up to `max` only when the record's own implementation-size (`effort:*`) label compounds
   it. `risk:low` floors at `low` unless size pushes it to `medium`.
3. **Diff heuristic (fallback).** For reviews with no record (a file-path review, or a spec-less
   git-diff review), derive risk/effort proxies from the change analysis Step 2 already computes,
   then feed the *same* table above:
   - Risk proxy = **high** if the diff touches a path matching the existing `merge-sensitive-paths`
     config key (already used by `assess-agent-autonomy`'s `merge-check` for the identical
     "elevated risk from touched paths" purpose — reused here, not duplicated), a schema/migration
     file, infra/CI-CD config, or introduces a new dependency (Step 2 already detects all of these
     for its ops-ledger check); **medium** if it touches public API surface or a cross-package
     interface; **low** otherwise.
   - Record-effort proxy (size, not the review tier) = **high** at 10+ files or 300+ lines changed;
     **medium** at 3-9 files or 50-299 lines; **low** otherwise.

   These thresholds are fixed defaults, not configurable — no config layer exists for this
   derivation (see Non-Goals).

The resolved tier and its source (`explicit argument` / `record labels: risk:{x} × effort:{y}` /
`diff heuristic: {reasoning}`) are recorded for Step 7's summary — see Transparency below.

### Argument grammar

The effort argument is a new optional token recognized anywhere in `$ARGUMENTS`: the literal
`low`, `medium`, `high`, `xhigh`, or `max`. It's unambiguous against the rest of the existing
grammar — spec numbers are numeric, `full`/`visual`/`journey:`/`discover` are fixed keywords that
never collide with the five effort words.

| Input | Resolution |
|---|---|
| `/claude-tweaks:review 42` | Spec 42, mode code, effort derived per Step 2.5 |
| `/claude-tweaks:review 42 high` | Spec 42, mode code, effort = high (explicit) |
| `/claude-tweaks:review 42 full xhigh` | Spec 42, mode full, effort = xhigh — order-independent |
| `/claude-tweaks:review high` | No spec — git-diff mode (existing rule 7), effort = high |
| `/claude-tweaks:review src/foo.ts low` | File-path mode, effort = low |

Effort is a no-op in `visual`/`journey:`/`discover` modes — those delegate entirely to
`/visual-review` and skip Steps 1-7, where the lens system lives. An effort token passed alongside
one of those mode keywords is silently ignored; note this explicitly in the skill so it isn't
surprising.

### Cross-skill interactions

- **Orthogonal to `ceremony-profile`.** That axis only gates Steps 1/1.6/4 (fixed-cost wrapper
  steps, per `2026-07-20-lifecycle-ceremony-tiering-design.md`); `review-effort` only touches
  Step 3's lens set. A `fast-lane` run can still derive `max` review-effort for a genuinely
  high-risk record, and a `standard` run can still derive `low` for a trivial one — independent
  axes, same as the ceremony design established for its own scope.
- **Orthogonal to `review-severity-floor`.** That controls auto-mode staging/auto-apply thresholds
  for whatever findings exist; `review-effort` controls how many findings get a chance to exist in
  the first place. No interaction needed.
- **`/flow` batches.** No special handling needed — derivation is per-record, so `/flow` invoking
  `/review` for each spec in a multi-spec batch gets correct per-spec derivation automatically
  from each spec's own `risk:*`/`effort:*` labels.

### Next Actions tie-in

The derived tier also drives the existing "Independent second opinion" Next Actions option
(`review-summary-template.md`), replacing today's flat, always-identical suggestion:

| Derived `review-effort` | Next Actions recommendation |
|---|---|
| `low` / `medium` / `high` / `xhigh` | `/code-review {tier}` — same tier, reusing the vocabulary this review already resolved |
| `max` | `/code-review ultra` — the highest-risk changes get pointed at the deeper cloud pass, since `max` is already the ceiling of what an in-session `/code-review` tier offers |

This reuses a value already computed at Step 2.5, at zero extra cost, and gives the user a
coherent story: "this review ran at {tier} because {reasoning}; here's the matching native
cross-check if you want independent verification."

### Transparency in the summary

Step 7's review summary states the derived tier and its reasoning, so a shallower-than-expected
review is visible rather than silent:

```
Review effort: high (derived from risk:high × effort:medium)
```
or, on the fallback path:
```
Review effort: medium (derived from diff heuristic — no record risk labels; 6 files, 140 lines,
no security/schema/infra paths touched)
```

## Testing

This is prose/skill-file logic, not testable code — no unit tests apply. Verification is a
hand-trace of concrete scenarios against the literal written procedure text (not a paraphrased
summary of it), matching this project's own convention for judgment-heavy skill logic:

1. A record labeled `risk:high` × `effort:high` → expect `max`. Debate runs, all lenses in scope,
   `confirmed`+`unconfirmed`+`contested` all surface inline, Next Actions recommends
   `/code-review ultra`.
2. A spec-less single-file docs-only fix, no record → diff heuristic: 1 file, ~10 lines, no
   sensitive paths → risk proxy low, effort proxy low → `low`. Only 3b/3c run, debate skipped,
   `confirmed` only, Next Actions recommends `/code-review low`.
3. `/claude-tweaks:review 42 medium` on a record labeled `risk:high` × `effort:high` → explicit
   argument wins → `medium`, regardless of the record's own high-risk labels. The summary states
   the source as `explicit argument`, not the record labels, so the user can see their override
   took effect.
4. A record with malformed or unreadable `risk:*`/`effort:*` labels (parse failure) → falls
   through to the diff heuristic (see Error Handling) rather than erroring the whole review.

## Error Handling

Ambiguity never resolves toward *less* scrutiny — the inverse of the failure mode that matters
here. If `parseRecordFacets` fails to parse the record's labels (malformed, or the record backend
returns something unexpected), fall through to the diff heuristic rather than defaulting to `low`.
If the diff heuristic itself can't render a clear signal (e.g. `git diff` produces no output to
classify — genuinely nothing changed), default to `high`, the tier that reproduces today's
existing default behavior, rather than skipping lenses on an assumption of low risk. This mirrors
`2026-07-20-lifecycle-ceremony-tiering-design.md`'s own error-handling principle: when a judgment
can't be rendered cleanly, resolve toward the safer, more thorough outcome.

## Known Touch Points (not exhaustive — writing-plans owns the file-by-file breakdown)

- **Modified:** `skills/review/SKILL.md` — new Step 2.5 (Derive Review Effort) with the resolution
  order and canonical table above; Step 3's lens dispatch gated by the resolved tier; Step 3.5
  gated (skipped below `high`); Review Modes table and Input resolution table get the new
  grammar; Relationship to Other Skills gains a row for `/claude-tweaks:specify` (the `risk:*`/
  `effort:*` label producer) if not already present.
- **Modified:** `skills/review/step3-routing.md` — lens-set gating detail inlined alongside the
  existing per-lens dispatch contract; debate-skip note; `unconfirmed`/`contested` inline-surfacing
  rules for `xhigh`/`max`.
- **Modified:** `skills/review/review-summary-template.md` — new "Review effort: {tier} (derived
  from {reasoning})" summary line; the "Independent second opinion" Next Actions option becomes
  dynamic per the tie-in table above.
- **Modified (reciprocal cross-reference only):** `skills/specify/SKILL.md` — add a row pointing
  to `/claude-tweaks:review` as a consumer of the `risk:*`/`effort:*` labels Step 3 stamps, if no
  such row already exists, per this project's bidirectional cross-reference convention.
- **Documentation:** check `skills/help/reference-card.md` for any place `/review`'s invocation
  syntax or mode table is mirrored, and update if so.
- **No code changes.** `parseRecordFacets` (`bin/lib/issues/record.js`) and the
  `merge-sensitive-paths` config key both already exist and are reused read-only.
