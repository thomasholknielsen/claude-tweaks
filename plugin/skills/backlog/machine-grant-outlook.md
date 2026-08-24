# Backlog Overview — Machine-Grant Outlook

Loaded by `overview-mode.md`'s bare-mode render only when the repo's policy resolves
`autonomy: unattended` with `grant-origination-enabled: true` under `work-backend: github-issues` —
the gate lives at the caller; this file assumes it already passed. On such a repo the funnel's
human-pointed stages are supposed to drain themselves (the fleet's grant unit for `specified`, the
born-ready capture chain for `captured`), so rendering the plain human pointers hides the one fact
that matters: *why a stage isn't draining*. The two annotations below say why, mechanically.

Both are advisory display only — they grant nothing, write nothing, and stay inside the funnel
header's `#`-comment format (no command text on an annotation line). They do not count against the
two annotation lines below the header, which sit under it rather than inside it.

## `specified` stage — grant-gate outlook

Compute the outlook mechanically — `machineGrantOutlook(funnel.specified, { ceiling, grantOriginationEnabled }, trustRows)`
(`bin/lib/issues/backlog.js`), with `trustRows` = the rows Step 1.5 already computed. This file is
loaded separately from `overview-mode.md`'s own fence, so re-resolve the path rather than
assuming its shell variable survived (`_shared/session-tmp-root.md`; `sessionTmpPath` is
idempotent per session+filename, so this resolves to the identical path Step 1.5 wrote):

```bash
eval "$(node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" ST_BACKLOG_OVERVIEW_TRUST_ROWS=backlog-overview-trust-rows.json)"
```

`trustRows` re-reads from `"$ST_BACKLOG_OVERVIEW_TRUST_ROWS"` rather than re-fetched. Phase-1 gates only (ceiling,
opt-in, `needs:definition`, class trust, `by:*` origin) — never run grant-check here (overview's
"entirely mechanical" contract); `eligible` means "reaches the grant unit's own grant-check on a
future firing", not "will be granted". Render one extra `#`-comment line directly under the
`# specified {n}` line, before its `/claude-tweaks:backlog grant` command line:

```
# machine-grant live (≤{cap}/day): {eligible.length} eligible pending grant-check; {refused-total} refused — {failedKey}: {count}, ... — refused records need a human grant via /claude-tweaks:backlog refine
```

The `{failedKey}: {count}` list renders in descending count order; when `refused` is empty, omit
it and the `— refused records need …` tail with it. `{cap}` is the resolved
`fleet-daily-grant-cap`; when unset, drop the `(≤{cap}/day)` parenthetical.

## `captured` stage — born-ready chain suppression

Same gate as above, except ceiling `trusted` also qualifies — the born-ready capture chain
(`_shared/autonomy-ceiling.md`) is live from `trusted` up. When any Step 1.5 row whose `key`
starts `producer:capture|` has a verdict other than `clean`, render one `#`-comment line directly
under the `# captured {n}` line:

```
# born-ready capture chain suppressed — producer:capture trust is {verdict(s)}; captures land raw until it clears
```

Nothing when every `producer:capture|*` cell is `clean` or no such cell exists yet — absence of
the line means the stage self-drains (or there is no evidence either way), matching Step 1.5's
render-nothing-when-clean convention.
