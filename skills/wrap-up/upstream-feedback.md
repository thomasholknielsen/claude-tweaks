# Upstream Feedback (D5) — /wrap-up Step 7.11

Stage-and-surface procedure for every learning `_shared/learning-routing.md` resolves to **D5** —
a defect or gap belonging to an upstream dependency rather than to this project.

## Step 1: Run the self-reference check first

Apply the contract's self-reference check before anything else. When it collapses D5 — the
"upstream" component turns out to be this project — re-classify the learning and handle the result
in the appropriate earlier step instead. Nothing is staged here in that case.

## Step 2: Stage, never file during the run

One proposal per surviving learning:

```
STAGED {time} — Step 7.11: upstream {defect|gap} report proposed for {component}. Reversibility: medium (public issue; stage path: staged/wrap-up-upstream-{N}.md).
```

The stage file holds the fully drafted **and already scrubbed** body. Scrubbing happens at staging
time, not at filing time — the approver reads what will actually be published, and a body scrubbed
later is a body nobody approved.

Filing happens on approval — at the Review Console's `On approval` step (Step 8.6), or, in
interactive mode, `summary-template.md`'s Upstream feedback section — by invoking
`/claude-tweaks:feedback` per approved row. Step 10 only confirms the filing landed; see
`execution-and-verification.md`.

Filing is never auto-resolved regardless of mode: `_shared/auto-mode-contract.md` lists upstream
feedback among what `auto` does not silence, on the grounds that it publishes privately-derived
content to a public repository. It is **not** exempt under `unattended-tier`.

## Step 3: Standalone wrap-up has no console to stage for

When no run directory resolves, no Review Console will ever read a staged file here — the same
reasoning `ledger/resolve-gate.md` applies to a standalone ledger item. Skip the `STAGED` line and
the `staged/` file entirely; present the proposal directly in `summary-template.md`'s Upstream
feedback section and invoke `/claude-tweaks:feedback` on approval there instead.

## Mandatory summary

Emitted every run regardless of outcome:

```
SCANNED {time} — Step 7.11 upstream feedback: {N} learnings classified, {M} resolved D5 ({D} defect / {G} gap), self-reference: {collapsed|not applicable}. Reversibility: N/A.
```

Auto mode appends this line to `decisions.md` under the `SCANNED` tag; interactive mode prints it
inline.
