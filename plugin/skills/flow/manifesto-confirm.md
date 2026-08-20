Loaded only when `/flow`'s mode is `confirm` or `hybrid` — the approval-gate path through the Manifesto (Step 3). Never loaded under `auto`: that path's own FYI variant (`manifesto.md`'s "Present the Manifesto") renders and writes `config.yml` without any approval step, so none of the content below ever applies to it. Split out of `manifesto.md` so an `auto`-mode run's own Manifesto read never has to load this file at all — see #657.

## The approval question

Immediately after presenting the Manifesto table (`manifesto.md`'s "Present the Manifesto" template), call `AskUserQuestion` with:

- `question`: `"Approve these pipeline levers, override specific ones, or cancel the pipeline?"`, `header`: `"Pipeline Config Manifesto"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Run the pipeline with the recommended lever values shown above."`
- Option 2 — `label`: `"Override"`, `description`: `"Reply with one or more #=value pairs from the valid-overrides list (e.g., 2=stop-and-ask, 7=medium) — see Override semantics (manifesto-overrides.md)."`
- Option 3 — `label`: `"Cancel pipeline"`, `description`: `"Abort; do not create the run directory."`

If "Override" is chosen, the `#=value` pairs are ordinary free-text chat in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's `Other` field. At least one pair is required; a bare selection with no pairs is invalid and will re-prompt for the pair(s).

## Rendering rules for the preview

- **All-skip single-spec run:** replace the preview table with one line — e.g., `Preview: spec 42 (infra) — pipeline runs without polish / stories / QA. No friction expected.`
- **Mixed-surface multi-spec run:** keep the table; per-spec rows make the contrast visible (one frontend, two backend, etc.).
- **Friction note column:** only populate when a recommended lever value will introduce a mid-flow prompt for *this* spec under the *recommended* values. If "Approve all" runs silently for that spec, leave the column as `—`.

## On override / On cancel

**On override:** read `manifesto-overrides.md` in this skill's directory for each pair's semantics, then parse the user's `#=value` pairs, apply them to the recommendation set, validate each value against the lever's option vocabulary (reject typos with an inline retry), write the final config to `config.yml` (same target and shape as `manifesto.md`'s "On approval" branch). Do not loop on the Manifesto itself — the user gives all overrides in one reply. If validation fails on any pair, present a single retry line listing the invalid pairs only (`Invalid: 2=foo (must be add-to-plan / stop-and-ask / drop)`).

**On cancel:** abort the pipeline. Do not create the run directory.
