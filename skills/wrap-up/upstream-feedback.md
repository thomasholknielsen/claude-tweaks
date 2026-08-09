# Upstream Feedback (D5) — judge file

Judge file for the `upstream` registry row (`Upstream feedback`), loaded per that row when its gate opens. The gate, the scope, and the row's `SCANNED` line are **engine-owned** — see `curation-engine.md`; this file is judgment only. The row's disposition is `stage`: **every** finding it emits carries `"action": "staged"`.

Stage-and-surface procedure for every learning `_shared/learning-routing.md` resolves to **D5** —
a defect or gap belonging to an upstream dependency rather than to this project.

## Step 1: Run the self-reference check first

Apply the contract's self-reference check before anything else. When it collapses D5 — the
"upstream" component turns out to be this project — re-classify the learning and hand it back to
the registry row that owns the re-classified destination. Nothing is staged here in that case.

## Step 2: Stage, never file during the run

One proposal per surviving learning:

```
STAGED {time} — Upstream feedback row: upstream {defect|gap} report proposed for {component}. Reversibility: medium (public issue; stage path: staged/wrap-up-upstream-{N}.md).
```

The stage file holds the fully drafted **and already scrubbed** body. Scrubbing happens at staging
time, not at filing time — the approver reads what will actually be published, and a body scrubbed
later is a body nobody approved.

Filing happens on approval, at `review-console.md`'s **On approval step 9** — that is what invokes
`/claude-tweaks:feedback` for each approved `U#` row. The console's own *Upstream feedback section*
does not file: it only renders the `U#` table and issues the per-item `AskUserQuestion`. Both run in
every mode. Phase 4's execution step files nothing either — it only confirms the filing landed; see
`execution-and-verification.md`.

Filing is never auto-resolved regardless of mode: `_shared/auto-mode-contract.md` lists upstream
feedback among what `auto` does not silence, on the grounds that it publishes privately-derived
content to a public repository. It is **not** exempt under `unattended-tier`.
