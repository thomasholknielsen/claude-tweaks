# Manifesto-Authorized Merge — the `merge-authorization` lever's Auto-merge short-circuit branch

Cited from `wrap-up/review-console.md`'s "Auto-merge short-circuit" section — read this file only
when that section's applicability check reaches its `merge-authorization` branch (below); the
existing `auto:merge`-label branch is unchanged and does not need this file.

## Applicability (second, independent trigger)

In addition to the existing condition (issue's live labels carry `auto:merge`), this short-circuit
also applies when this run's `config.yml` resolves `merge-authorization` to `merge-when-green`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-authorization
```

`flow/manifesto.md`'s lever 13 — always a live Manifesto `confirm`/`hybrid` override answer, never
a `.claude-tweaks/policy.yml` default (`bin/lib/policy-schema.js`'s resolver special case discards
a `policy.yml` value for this key). When this condition is true, Layer 1 (Authorization) of the
short-circuit's two-layer gate is satisfied by the lever alone — no `auto:merge` label is required.
Layer 2 (Content judgment, `assess-agent-autonomy merge-check`) is unchanged and still applies:
the lever authorizes the merge decision, not a skip of the content-judgment safety net.

## Tag selection

Both merge call sites resolve the same `{tag}` the same way: `_shared/pr-first-merge.md` Step 3's
`{tag}` parameter (`pr-first` subsection) and the `local-merge` subsection's own inline `git merge
-m "[{tag}] ..."` substitution. `{tag}` is `fast-lane` when the live `auto:merge` label is present
(the standing, pre-existing signal wins when both conditions hold); `manifesto-authorized` when
only the `merge-authorization` lever triggered this branch (no `auto:merge` label).

## Log line (lever-triggered case only)

Both the `pr-first` and `local-merge` subsections of the Auto-merge short-circuit already log an
`AUTO {time} — Fast-lane auto-merge: issue #{n}, ...` line on the `auto:merge`-label path. On the
`merge-authorization`-lever path (no `auto:merge` label present), log instead:

`AUTO {time} — Manifesto-authorized auto-merge: issue #{n}, assess-agent-autonomy verdict
auto-merge (see RATIONALE), pr-first-merge outcome {merged|armed|pending-review}. {Merge commit:
{sha}. Reversibility: high (git revert). | Reversibility: n/a (nothing merged yet).} [lever:
merge-authorization=merge-when-green (run-config)]`

Same shape, same placement, in both the `pr-first` and `local-merge` subsections — only the tag and
the trailing `[lever: ...]` attribution differ from the `auto:merge`-label path's existing line.
