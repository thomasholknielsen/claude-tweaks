# Code-Health — Rename, Risk-Based Triage, and Closing-Keyword Discipline

**Date:** 2026-07-07
**Status:** Design complete (brainstorm). Pending decomposition into specs.
**Builds on:** `2026-07-06-recon-signal-quality-design.md` (v2.1 hardening — severity filter wiring,
workspace-aware slicing, bundled findings, persistence hardening — already shipped). This design
does not touch that hardened baseline's mechanism; it renames the tool, replaces the severity-only
filing gate with a computed risk model, and closes two lifecycle-efficiency gaps.
**Parallel to (not shared with):** `2026-07-06-harness-health-design.md` (renames `skill-health` →
`harness-health`, independently scoped to harness documentation). This design gives `recon` a
matching identity in the same watchman family; no code is shared between the two efforts.
**One-liner:** rename `recon` to `code-health`, replace severity-only filing with a computed risk
(severity × likelihood) + effort model on one shared low/medium/high vocabulary, and close two
efficiency gaps in the issue lifecycle — downstream triage/implementation automation reading
risk/effort, and a commit-time safety net for the GitHub closing-keyword convention.

---

## 1. Summary

Real data was pulled before designing anything: 181 `recon`-labelled GitHub issues from
memenu-app (132 open), the current label taxonomy (21 `recon:*` label values, only 3 with real
descriptions), and one live example of a fix that never closed its issues because the commit used
`Addresses #N` instead of a recognized GitHub closing keyword. Three real, independent problems
came out of that audit, plus one already-approved-but-unshipped parallel effort that reframes the
first:

1. **Naming.** `recon` reads as security-reconnaissance jargon and doesn't signal it belongs to
   the same "proactive watchman that judges and files GitHub issues" family as the in-flight
   `harness-health` rename (approved 2026-07-06, implementation plan drafted 2026-07-07, not yet
   shipped). Both tools share the identical mechanism — LLM judge, rotation, fingerprint, dedup,
   GitHub-issue filing — but nothing in their names says so.
2. **Triage signal.** Severity is the only axis gating what gets filed. The audit surfaced a
   hand-rolled workaround already in production: `/tidy`'s one-time `recon:remembered` backfill,
   which retroactively downgrades old `low`/`medium` issues after the fact — a manual proxy for
   "don't treat this with today's urgency" that only exists because severity alone isn't a
   sufficient triage signal. There is no field capturing how *likely* a finding is to actually
   matter (hot path vs. dead corner, shared module vs. one call site, exploitable vs. theoretical)
   or how *expensive* it is to fix.
3. **Label hygiene.** Of 21 `recon:*` label values in use, only 3 (`doc-freshness`, `dead-code`,
   `dependency-health`) carry real descriptions — the rest are blank because `gh issue create`
   auto-vivifies undescribed labels on first use rather than being pre-created deliberately.
4. **Closing-keyword gap.** claude-tweaks already has a mature mechanism for this — `Fixes
   #{issue}` carrier commits are wired into `/wrap-up`, `/flow --from-recon`, and
   `worktree-merge.md` — but it only engages when a spec carries `recon-issue:` frontmatter, i.e.
   when the fix was derived via `/specify` from that exact issue. A fix commit made outside that
   structured path has no safety net; the real example that surfaced this used `Addresses #N`
   instead of `Fixes #N`, so the referenced issues stayed open even after the code was fixed.

## 2. Goals and non-goals

**Goals**
- `code-health`'s name signals its place in the harness's proactive-watchman family, parallel to
  `harness-health`, instead of reading as security jargon.
- Filing gates on computed risk (severity × likelihood) rather than raw severity — fewer,
  better-targeted issues; a high-severity finding in genuinely dead code stops flooding the
  tracker, while a medium-severity, high-likelihood, cheap-to-fix finding surfaces.
- Every qualitative axis (severity, likelihood, effort, confidence, and the computed risk) shares
  one low/medium/high vocabulary — no per-field tier schemes to remember, no `critical` outlier.
- GitHub's own label/filter UI becomes a real triage tool: sort by risk, filter to quick wins,
  without opening every issue.
- Effort flows downstream into model-tier selection for implementation, so trivial fixes don't
  burn an expensive model and complex fixes get a capable one.
- A batch run (`/flow --from-code-health`) does the highest-value work first when it can't finish
  everything in one pass.
- A commit that references an issue number gets a commit-time nudge toward the closing-keyword
  convention, regardless of whether it went through the structured spec pipeline.

**Non-goals**
- No migration of existing `recon`-labelled issues in already-deployed projects. Explicitly
  decided: bare rename, no shim. Old open `recon`-labelled issues become invisible to
  `code-health`'s dedup query and may get re-filed under the new label — an accepted, known gap,
  not solved here.
- No change to the underlying judge mechanism, fingerprint basis (`criterion + areaId +
  normalizeAnchor(anchor)`), or dedup contract the v2.1 hardening design established.
- No cross-project rollup or dashboard of risk/effort — GitHub's own label filters are the triage
  surface; no new UI is built.
- No enforcement (blocking) of the closing-keyword convention — warn tier only. A commit may
  legitimately use `Addresses` for a partial fix that still needs follow-up work.
- No change to `harness-health` — independently scoped parallel effort; this design does not touch
  its code, labels, or docs.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Name | `code-health` — parallels `harness-health`; both are "proactive watchman" siblings |
| 2 | Migration | Bare rename, no migration shim — accepted gap for already-deployed projects |
| 3 | Tier vocabulary | Drop `critical`; standardize `severity`/`likelihood`/`effort`/`confidence` on low/medium/high |
| 4 | Risk computation | Deterministic `severity × likelihood` product-bucket matrix — not an LLM-judged field |
| 5 | Filing threshold | `--min-severity` → `--min-risk`, default `high` (same selective-by-default philosophy) |
| 6 | CI gate | `status --fail-on critical` → `--fail-on risk-high` |
| 7 | Labels | `code-health:{criterion}` kept (pre-created with real descriptions); `code-health:{severity}` replaced by `code-health:risk-{tier}`; new `code-health:effort-{tier}` |
| 8 | Downstream: model tier | `code-health-effort:` spec frontmatter drives Fast/Standard/Capable dispatch tier |
| 9 | Downstream: batch order | `/flow --from-code-health` sorts the pulled batch by risk (high first) |
| 10 | Downstream: quick wins | New `--quick-wins` filter = `risk:high AND effort:low` |
| 11 | Downstream: spec sizing | `/specify` flags `effort:high` issues to consider decomposition |
| 12 | Closing-keyword | Warn-tier PostToolUse hook check, harness-wide (not code-health-specific) |

## 4. Component 1 — Rename

Mechanical rename, following the exact pattern the (unshipped) `harness-health` plan already
established for `skill-health`:

- `bin/recon.js` → `bin/code-health.js`
- `bin/lib/recon/*` (incl. `tests/`, `lenses/`) → `bin/lib/code-health/*`
- `skills/recon/` (incl. `routine-template.yml`) → `skills/code-health/`
- Persistent state root: `.claude-tweaks/recon/` → `.claude-tweaks/code-health/`
- GitHub labels: `recon` → `code-health`, `recon:{x}` → `code-health:{x}`
- Fingerprint id prefix: `recon-` → `codehealth-`
- `skills/flow/from-recon.md` → `skills/flow/from-code-health.md`; `/flow --from-recon` flag →
  `--from-code-health`

Cross-references to update (bidirectional convention, per this repo's own CLAUDE.md): CLAUDE.md
(skill list, structure diagram, sub-file table), README.md, `skills/help/reference-card.md`,
`skills/init/SKILL.md` + `skill-template.md`, `skills/routine/SKILL.md`, `skills/tidy/SKILL.md` +
`scan-procedures.md`, `skills/wrap-up/SKILL.md` + `skill-curation.md`, `skills/specify/SKILL.md` +
`spec-template.md`, `skills/_shared/issue-claims.md`, `skills/_shared/github-pr-scan.md`,
`skills/flow/worktree-merge.md` + `multispec-review-console.md`, `package.json`'s test script
(`bin/lib/recon/tests/*.test.js` → `bin/lib/code-health/tests/*.test.js`).

Historical docs (`docs/superpowers/specs/2026-06-14-recon-*`, `2026-06-15-recon-v2-*`,
`2026-07-06-recon-signal-quality-*`) are left untouched as historical record, matching the
convention the `harness-health` plan already set for its own predecessor docs.

**Known limitation (accepted):** no migration for already-deployed projects. A project that ran
`recon` before this ships keeps its old `recon`-labelled issues under the old label; a subsequent
`code-health` run dedups only against `code-health`-labelled issues, so a finding matching an
already-open `recon`-labelled issue may be re-filed. This is a deliberate scope cut, not an
oversight.

## 5. Component 2 — Schema unification

Finding schema (Step 6 emit shape) changes:

- `severity`: `low | medium | high` (was `low | medium | high | critical` — `critical` dropped;
  it was 2 of 181 issues in the audit, and its "most urgent" meaning moves to the risk matrix)
- **New `likelihood`**: `low | medium | high` — one holistic judgment, not three separate fields.
  The judge weighs whichever of these three factors actually apply to the finding at hand:
  - **Exposure** — is this code on a hot/frequently-executed path and user-facing, or a rarely
    touched internal script / dead corner?
  - **Blast radius** — does this affect one call site, or a shared/foundational module many
    things depend on?
  - **Exploitability** — for security-relevant criteria specifically: can external input actually
    reach and trigger this, or is it a theoretical concern with no real attack surface?
  Non-security criteria simply have no exploitability consideration to weigh — same pattern as
  today's per-criterion confidence-floor policy (noisy criteria require `confidence: high`), a
  calibration nuance the judge reasons about, not a separate schema field per factor.
- **New `effort`**: `low | medium | high` — cost/complexity of the finding's own
  `suggestedApproach`. A one-line parameter addition is `low`; a bundled fix across several sibling
  occurrences is `medium`; a structural change (new abstraction, cross-file rework) is `high`.
- `confidence`: unchanged meaning, spelling normalized from `med` to `medium` for consistency with
  the other three axes.

Step 7's verify gate gains two questions alongside the existing three: does the evidence actually
support the claimed `likelihood` (not just asserted), and is `effort` consistent with what
`suggestedApproach` actually describes (a `suggestedApproach` that reads as a one-line change
should not carry `effort: high`).

## 6. Component 3 — Deterministic risk matrix

Risk is *computed*, not judged — a small new deterministic helper
(`bin/lib/code-health/risk.js`, mirroring the existing engine-computes/LLM-judges split already
established by `dedup.js#decide()`), scoring `low=1, medium=2, high=3` and bucketing the product of
`severity × likelihood`:

| | likelihood: low | likelihood: medium | likelihood: high |
|---|---|---|---|
| **severity: low** | risk: low | risk: low | risk: medium |
| **severity: medium** | risk: low | risk: medium | risk: high |
| **severity: high** | risk: medium | risk: high | risk: high |

(Score buckets: 1–2 → low, 3–4 → medium, 6–9 → high — the same product-then-bucket shape as a
standard qualitative risk-register matrix.)

This is a pure function: `computeRisk(severity, likelihood) → 'low' | 'medium' | 'high'`,
unit-testable exactly like `dedup.js#decide()` — same input always yields the same tier,
independent of any LLM run-to-run variance. It is not part of the fingerprint basis (unchanged:
`criterion + areaId + normalizeAnchor(anchor)`), so a finding's risk can be recomputed or
retuned later without disturbing dedup identity.

## 7. Component 4 — Filing threshold & CI gate rename

- `bin/code-health.js#cmdValidateFindings`: `--min-severity` becomes `--min-risk` (default
  `high`), filtering on the computed `risk` tier instead of raw `severity`. `decide()`'s threshold
  logic is unchanged — this is a call-site input change, same shape as the v2.1 hardening's own
  severity-filter wiring fix.
- Net behavioral effect: a high-severity finding with low likelihood (e.g. a real anti-pattern in
  code with no live callers) now computes to `risk: medium` and is remembered, not filed — sharper
  flood control than severity alone gave. A medium-severity, high-likelihood finding now computes
  to `risk: high` and files — work that severity-only filtering would have held back.
- `bin/code-health.js#cmdStatus`: `--fail-on critical` becomes `--fail-on risk-high`, gating CI on
  the computed tier rather than a raw severity value that no longer exists.

## 8. Component 5 — Label restructuring & hygiene

Labels per filed issue: `code-health`, `code-health:{criterion}` (unchanged set of criteria),
`code-health:risk-{low|medium|high}` (replaces the old `code-health:{severity}` label as the
primary triage tag), `code-health:effort-{low|medium|high}` (new).

Note on `remembered`: this stays a **cache-only** status (`bin/lib/code-health/cache.js`'s
`status` enum) for findings that never clear `--min-risk` — they are held, not filed, so no
GitHub label is ever attached to them by the engine. The `recon:remembered` *label* seen in the
audit was never something the engine applies; it was a one-time `/tidy` backfill against the
already-filed backlog after the severity-filter fix shipped (§8 of the v2.1 hardening design).
Because this design's rename is a bare rename with no migration (§4), there is no equivalent
backlog to reconcile under the new risk threshold — every `code-health`-labelled issue is filed
under the new scheme from its first run, so this one-time backfill pattern does not recur here.

Hygiene fix: `bin/code-health.js`'s filing step (Step 9 in the skill) checks `gh label list`
before calling `gh issue create`; any `code-health:{criterion}` label not yet present is created
via `gh label create` with a real description sourced from that criterion's existing entry in
`criteria.js` — replacing today's blank auto-vivified labels with descriptions that already exist
in the codebase, just not surfaced to GitHub.

## 9. Component 6 — Downstream efficiency

Four levers, all reusing existing mechanisms rather than inventing new ones:

- **Effort → model tier.** `/specify` stamps `code-health-effort: <tier>` frontmatter on a spec
  derived from a code-health issue (same mechanism as today's `recon-issue:`/`recon-fingerprint:`
  stamping in `spec-template.md`). Whichever skill dispatches the implementing agent (`/build`,
  `/flow`'s per-spec worker) reads it and selects model tier: `low` → Fast, `medium` → Standard,
  `high` → Capable — reusing the Subagent Contract's existing Fast/Standard/Capable convention, no
  new dispatch mechanism. Specs with no `code-health-effort:` frontmatter (not derived from a
  code-health issue) default to Standard, unchanged from today.
- **Risk-ordered batching.** `/flow --from-code-health` sorts the pulled issue set by `risk`
  (high first) before claiming issues and deriving specs (per `_shared/issue-claims.md`'s existing
  claim-before-derive contract) — a run that doesn't finish everything still did the highest-value
  work first.
- **Quick-wins selector.** A new `--quick-wins` filter, usable with `--from-code-health` or
  standalone in `/tidy`'s hygiene pass, narrows the pulled set to `risk:high AND effort:low` — a
  deliberate "just the easy high-value stuff" run.
- **Spec-sizing signal.** When `/specify` derives a spec from a `code-health-effort: high` issue,
  it surfaces a note asking whether the work should decompose into multiple specs rather than one
  oversized unit — consistent with `/specify`'s existing scope-check judgment, not a new gate.

## 10. Component 7 — Closing-keyword safety net

A new check inside `bin/lib/hooks/post-tool-use.js` (added alongside the existing E2 commit
breadcrumb logic in the same module — this repo's hooks convention is one module per event, not
one module per check), warn tier:

- Reuses `gitTargets(command, ctx.cwd)` from `git-command.js` — the same call E2 already makes —
  to detect a `commit` action and its target directory. No new command-parsing logic.
- Rather than parsing the commit message out of the raw Bash command text (this repo's own commit
  convention passes multi-line messages via a `$(cat <<'EOF' ... EOF)` heredoc, which is brittle
  to parse reliably out of a shell string), the check reads the message back from git itself —
  `git -C <dir> log -1 --format=%B` — the same "ask git, don't reparse the shell" approach E2
  already uses for `shortHead(dir)`.
- Scans that text for a bare `#\d+` not immediately preceded by a recognized closing keyword
  (`Fixes`/`Closes`/`Resolves`, case-insensitive). If found, returns
  `{ json: { systemMessage: '...' } }` (the same warn-tier return shape `subagent-stop.js` already
  uses) suggesting the reword — non-blocking, the commit already happened.
- **Deliberately not gated on `ctx.runDir`**, unlike E2's breadcrumb logic. The motivating case
  for this check is exactly a commit made *outside* any pipeline run — ad hoc fix work that
  references an issue number without going through `/specify` → `/build` → `/wrap-up`. Gating on
  run-dir presence would exempt the precise scenario this exists to catch.
- Harness-wide, not code-health-specific: it fires for any bare issue reference, including
  `harness-health`-labelled or human-filed issues — the closing-keyword convention isn't unique to
  this tool's issues.

## 11. Testing plan

- `bin/lib/code-health/tests/risk.test.js` (new): the full 3×3 matrix — every `(severity,
  likelihood)` pair maps to its documented tier; confirms the function is pure (same inputs, same
  output, no hidden state).
- `bin/lib/code-health/tests/dedup.test.js`: `--min-risk` actually filters on the computed tier,
  not raw severity — a `severity: high, likelihood: low` finding (risk: medium) lands in
  `remember` under the default `--min-risk high`; a `severity: medium, likelihood: high` finding
  (risk: high) lands in `file`.
- `bin/lib/code-health/tests/validate-finding.test.js`: schema accepts `likelihood` and `effort`
  as required low/medium/high fields; rejects `severity: critical` as invalid post-rename.
- `bin/lib/code-health/tests/issue-payload.test.js`: emits `code-health:risk-{tier}` and
  `code-health:effort-{tier}` labels; no longer emits a bare severity label.
- `bin/lib/code-health/tests/cli-status.test.js`: `--fail-on risk-high` exits 1 when an open
  cache entry has a computed `risk: high`; `--fail-on critical` is no longer a recognized flag.
- `bin/lib/hooks/tests/post-tool-use.test.js` (existing file, extended): a commit message
  containing `Fixes #12` produces no warning; `Addresses #12` produces a `systemMessage`; a
  message with no issue reference at all produces no warning; the check fires with no `runDir` set
  in the hook context (unlike E2, this path must not be gated on pipeline state).

## 12. Known limitations

- No migration for already-deployed `recon` installs (§4, deliberately deferred, not solved).
- The closing-keyword check only fires on `git commit` Bash invocations the harness itself makes —
  a commit made through a different tool (an IDE's own git integration, a manual terminal outside
  Claude Code) is invisible to it. This mirrors the existing scope of every other git-discipline
  hook in this codebase (E1, E2) — none of them see commits made outside the harness.
- `likelihood`'s three folded factors (exposure, blast radius, exploitability) are not separately
  recorded — only the final holistic judgment is. If a future need arises to audit *why* a
  likelihood was judged a particular way, only the finding's `evidence` prose carries that
  reasoning, not a structured field.

## 13. Phasing (each phase = its own spec)

1. **Rename** (§4) — mechanical, no behavior change; ship first so every later phase is authored
   against the final names.
2. **Schema unification + risk matrix** (§5, §6) — the new fields and the deterministic
   computation; independent of labels/downstream until phase 3 consumes it.
3. **Filing threshold, CI gate, and label restructuring** (§7, §8) — depends on phase 2's `risk`
   field existing to filter/label on.
4. **Downstream efficiency** (§9) — depends on phase 1 (names) and phase 3 (labels/frontmatter
   values) being live; the four levers are independent of each other and could ship as separate
   specs if preferred.
5. **Closing-keyword safety net** (§10) — fully independent of phases 1–4; could ship in any order,
   including before the rename.

## 14. Glossary

- **Risk** — a computed (not judged) tier, `severity × likelihood` through the fixed matrix in
  §6. Distinct from severity (impact alone) and likelihood (exposure/blast-radius/exploitability
  alone).
- **Likelihood** — one holistic judgment of how probable a finding is to actually matter in
  practice, folding exposure, blast radius, and (where relevant) exploitability.
- **Effort** — the judged cost/complexity of the finding's own suggested fix; independent of risk.
- **Quick win** — the `risk:high AND effort:low` intersection; the target of the new
  `--quick-wins` selector.
- **Closing keyword** — a GitHub-recognized commit/PR trailer (`Fixes`, `Closes`, `Resolves`
  immediately preceding `#N`) that auto-closes issue `N` when the commit reaches the repository's
  default branch.
