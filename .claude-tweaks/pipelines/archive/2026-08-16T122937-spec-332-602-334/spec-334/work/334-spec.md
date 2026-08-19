---
record: 334
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 334: Migrate the six run-config direct-read sites onto the resolver's --run overlay

Surface: backend

## Current State

Six sites read a pipeline run's `config.yml` directly, most with an inline default, instead of the canonical resolver (`bin/resolve-policy.js --run`). Each inline default is a second copy of the schema default (`POLICY_KEYS`) — the drift class #330 retired for `policy.yml` reads — and every one of them skips the `policy.yml` level the resolver would serve when the run's `config.yml` has no line for the key.

| Site | Key | Inline default |
|---|---|---|
| `skills/test/SKILL.md:175` (Auto mode) | `auto-fix-threshold` | `lint+type` |
| `skills/tidy/step-6-auto.md:6` | `tidy-aggressiveness` | `moderate` |
| `skills/review/step3-routing.md:51` (inputs list) | `review-severity-floor` | `low` |
| `skills/review/step3-routing.md:75` (auto-mode routing) | `review-severity-floor` | `low` |
| `skills/specify/decomposition-mode.md:56` | `overlap` | `companion` |
| `skills/specify/design-pre-steps.md:107` (Auto mode) | `design-intent` | — (none stated) |

Line numbers as of `main` at 6b80ccf6; re-derive with `grep -rn 'from \`config.yml\`' skills`. Origin: spec #330's review (pipeline run 2026-08-11T195542-spec-329-330-331), finding 5 — outside that record's `policy.yml` scope but the same drift class it retired; widened 2026-08-16 from the two sites originally named to the full class after a repo sweep.

## Deliverables

1. Every site above resolves its key via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values <key>` — the canonical form per `skills/_shared/policy-schema.md`'s Canonical read path — using the resolver's own `--run` overlay for the run-dir precedence rather than a hand-rolled `config.yml` grep. Inline defaults deleted; the schema default is the resolver's, stated once in `POLICY_KEYS`.
2. Behavior-preserving except each site gaining the documented `policy.yml` fallback level between the run's `config.yml` and the schema default — state that delta in the change (commit message or PR body).
3. When #332 (the rename program) has landed before this record builds, the two `step3-routing.md` sites read the *new* key name `review-auto-apply-ceiling`; if this record lands first, #332's sweep picks the sites up. Whichever lands second reconciles — no dual naming survives.

## Acceptance Criteria

- `grep -rn 'from \`config.yml\`' skills` returns zero hits.
- `grep -rnE '\(default \`(lint\+type|moderate|low|companion)\`\)' skills/test/SKILL.md skills/tidy/step-6-auto.md skills/review/step3-routing.md skills/specify/decomposition-mode.md` returns zero hits — the inline defaults are gone, not reworded.
- Each of the five files carries a `resolve-policy.js" --run` invocation for its key (six invocations total, or five if the two `step3-routing.md` reads are folded into one resolved variable reused at the second site).
- `npm test` green (conformance suites pin skill prose repo-wide — run the full suite, not filename-matched files only).

## Technical Approach

- Read `skills/_shared/policy-schema.md`'s Canonical read path and one existing migrated site (e.g. `skills/tidy/step-6-auto.md:53`'s standalone-auto read, which already uses the resolver) to match the exact invocation shape; `skills/_shared/pipeline-run-dir.md` for how `$PIPELINE_RUN_DIR` is resolved before the call.
- Prose-only edit; no code change. Each site becomes "resolve `{key}` — `{VAR}=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values {key})` — and route per …", dropping the parenthetical default.

### Key Files
- skills/test/SKILL.md
- skills/tidy/step-6-auto.md
- skills/review/step3-routing.md
- skills/specify/decomposition-mode.md
- skills/specify/design-pre-steps.md

## Gotchas

- `step-6-auto.md:6` currently states `moderate` as the default with `conservative` as "the documented opt-down" — the opt-down note is real guidance and stays; only the parenthetical default goes.
- `design-pre-steps.md:107` has no inline default today; it still bypasses the `policy.yml` level, so it migrates like the others.
- Don't fold this into a `config.yml`-parsing helper of your own — the resolver *is* the helper (a fourth parallel reader is exactly the sprawl #329/#330 removed).

## Original request

Migrate the six run-config direct-read sites onto the resolver's --run overlay

**Origin:** spec #330's review (pipeline run 2026-08-11T195542-spec-329-330-331), finding 5 — outside that record's policy.yml scope but the same drift class it retired. Widened 2026-08-16 from two sites to the full class after a repo sweep (`grep -rn "from \`config.yml\`" skills`).

## Problem

Six sites read a pipeline run's `config.yml` directly, most with an inline default, instead of the canonical resolver (`bin/resolve-policy.js --run`). Each inline default is a second copy of the schema default (`POLICY_KEYS`) — the drift class #330 retired for `policy.yml` reads — and every one of them skips the `policy.yml` level the resolver would serve when the run's `config.yml` has no line for the key.

| Site | Key | Inline default |
|---|---|---|
| `skills/test/SKILL.md:175` (Auto mode) | `auto-fix-threshold` | `lint+type` |
| `skills/tidy/step-6-auto.md:6` | `tidy-aggressiveness` | `moderate` |
| `skills/review/step3-routing.md:51` (inputs list) | `review-severity-floor` | `low` |
| `skills/review/step3-routing.md:75` (auto-mode routing) | `review-severity-floor` | `low` |
| `skills/specify/decomposition-mode.md:56` | `overlap` | `companion` |
| `skills/specify/design-pre-steps.md:107` (Auto mode) | `design-intent` | — (none stated) |

Line numbers as of `main` at 6b80ccf6; re-derive with the grep above.

## Deliverable

Every site resolves via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values <key>` (canonical form per `skills/_shared/policy-schema.md`'s Canonical read path — use the resolver's own `--run` overlay for the run-dir resolution rather than a hand-rolled config.yml grep), inline defaults deleted. Behavior-preserving except each site gaining the documented `policy.yml` fallback level between the run's `config.yml` and the schema default — state that delta in the change.

If a sibling record renames `review-severity-floor` (the #332 rename program), the review sites read the *new* key name; whichever record lands second reconciles.

Verification: the grep above returns zero hits under `skills/`; `npm test` green.

### Key Files
- skills/test/SKILL.md
- skills/tidy/step-6-auto.md
- skills/review/step3-routing.md
- skills/specify/decomposition-mode.md
- skills/specify/design-pre-steps.md

Refs #330.


