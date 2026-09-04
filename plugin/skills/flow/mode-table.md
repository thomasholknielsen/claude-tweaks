# Flow — Mode Table

Loaded by `/claude-tweaks:flow`'s Arguments section (the `auto`/`confirm`/`interactive`/`hybrid` rows) and Step 3 (Pipeline Config Manifesto — the per-mode Manifesto-behavior table). `SKILL.md` keeps a trimmed one-line summary of each row inline so a reader can pick a mode at a glance; this file holds the full prose behind each summary. Read it before choosing a mode for anything beyond the common case, or before changing what a mode silences/gates.

## Mode argument rows (full prose)

The complete text behind `SKILL.md`'s Arguments table rows for `auto` / `confirm` / `interactive` / `hybrid`:

| Argument | Required | Description |
|----------|----------|-------------|
| `auto` | No | **Flow's default mode** — pipeline runs hands-off. The Config Manifesto (Step 3) renders as a read-only FYI and proceeds without an approval stop. Silences branch-divergence-check (Step 2.5), shape-check (Step 2.6), all path-selection prompts mid-pipeline, and forbids the model from inserting its own reality-checks or context-window concerns. Failures surface via the ledger and the failure card, never via mid-pipeline questions. **Full contract:** see `_shared/auto-mode-contract.md` — that file is the single source of truth for what `auto` silences AND what it does NOT silence (resolve gate and hard validation mandatory; work-record creation follows the tiered stance). Passing `auto` explicitly is redundant (it is already the default) but harmless. Passed through to `/build`. |
| `confirm` | No | Stay in `auto` but **re-enable the Manifesto approval gate** at Step 3 (the `Approve all / Override / Cancel` block). Use when you want to inspect and tweak the policy levers before the pipeline runs hands-off. Everything after the Manifesto still runs as `auto`. |
| `interactive` | No | Opt out of auto entirely — skills present each decision in-flow as the standalone skills do. The Manifesto is skipped. Highest friction; use when you want a checkpoint at every decision. |
| `hybrid` | No | Manifesto approval gate runs, and downstream skills still prompt when a decision fails the reversibility/confidence floors or the severity ceiling (see `_shared/auto-mode-contract.md`). Between full `auto` and `interactive`. |

## Manifesto behavior by mode (full prose)

The complete text behind `SKILL.md` Step 3's per-mode summary — what the Pipeline Config Manifesto does in each mode:

| Mode | Manifesto behavior |
|------|-------------------|
| `auto` (default) | **Read-only FYI.** Render the computed levers as a `### Pipeline Config (auto)` table (value + source per lever), print `→ proceeding (no approval needed)`, and continue. No stop. |
| `confirm` | **Approval gate.** Present the `Approve all / Override / Cancel` block and wait. After approval, the rest of the pipeline runs as `auto`. |
| `hybrid` | Approval gate (same as `confirm`); downstream skills still prompt on floor failures. |
| `interactive` | Skipped — no Manifesto and no run directory; skills prompt each decision in-flow rather than reading `config.yml`. |
