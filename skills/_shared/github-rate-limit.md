# GitHub Rate-Limit Recognition & Response — Shared Contract

One recognition-and-response playbook for every skill that shells to `gh` or calls the
GitHub API/MCP directly. Classification and backoff live here; each caller keeps its own
degradation *outcome* (skip, `DONE_WITH_CONCERNS`, log-and-continue, retry-once-then-TTL,
etc.) — this file never dictates what a caller does after classifying, only how to classify
and how long to wait before giving up.

## Recognition taxonomy

Classification reads the response **body and headers**, never the status code alone — a
bare 403/429 is ambiguous between all three rows below. Shelling through `gh` (rather than
a raw HTTP client), the error text `gh` prints to stderr carries the secondary-limit message
verbatim, so no `-i`/`--include` header capture is needed to spot it. Distinguishing primary
exhaustion from secondary abuse-detection needs one follow-up read-only probe:
`gh api rate_limit` — `remaining: 0` on the bucket the failed call used means primary
exhaustion; quota still remaining means the failure was a secondary/abuse limit, not
exhaustion.

| Signature | How to recognize | Classification |
|---|---|---|
| Secondary / abuse limit | HTTP 403 whose body/error text contains a "secondary rate limit" message; usually carries `Retry-After`; `gh api rate_limit` shows quota still remaining on the bucket in use | Transient — retry per the response policy below |
| Primary exhaustion | HTTP 403 or 429 whose body/headers show `X-RateLimit-Remaining: 0` on the bucket in use (REST and GraphQL track separate buckets); `gh api rate_limit` confirms `remaining: 0` | Transient — retry per the response policy below, honoring the bucket's `reset` time when known |
| Plain 403 (catchall) | Carries neither the secondary-limit message nor exhaustion evidence — includes any response matching neither positive signature above | Not transient — never retry; surface immediately per the caller's own error contract |

Fail loud beats a blind wait: a response that doesn't positively match one of the two
transient rows is the plain-403 row, by construction, not a default-to-retry.

## Response policy

- Honor a `Retry-After` header when present.
- Otherwise wait 45-90 seconds with uniform jitter before retrying. This number, like every
  number in this section, is documentary authoring guidance — pinned as text for authors to
  follow, never runtime-enforced.
- At most 2 retries, as a *ceiling* — a caller's own contract may undercut it (e.g.
  `_shared/issue-claims.md`'s Section E keeps its existing retry-once-then-TTL outcome
  unchanged; this file only supplies the recognition step feeding into that retry).
- A total wall-clock bound of ~5 minutes for the whole retry sequence. When honoring
  `Retry-After` (or the bucket's `reset` time, or the sum of prior waits) would exceed the
  bound, skip the remaining retries and degrade immediately per the caller's own outcome —
  never poll open-endedly (the anti-pattern named by record-418's background poller).
- Recognition, classification, and backoff are mode-agnostic. Only the logging step is bound
  to a pipeline run: with an active `$PIPELINE_RUN_DIR`, log one `decisions.md` line naming
  the classified signature (`_shared/auto-decision-log.md`'s entry schema), then apply the
  caller's own stage/defer-or-continue outcome. With no run dir (a standalone invocation),
  skip the log and apply the caller's outcome directly.

## Codified fallbacks

- **Contents-API read fallback.** A `gh api .../contents/...` *read* may always fall back to
  reading the identical blob via plain git — `git fetch` then `git show 'ref:path'` —
  independent of any claims-registry-specific machinery. This fallback is unconditional for
  reads; it carries no rate-limit-classification precondition of its own.
- **Protocol swap (primary exhaustion only).** Swapping from REST to GraphQL (or the
  reverse) is legitimate *only* for a primary-exhaustion classification, and only toward
  whichever protocol's bucket still has quota — never as an escape from a secondary/abuse
  limit, since abuse detection is domain-shared across both protocols. A swap is valid only
  for a call with a documented equivalent on the other protocol (label operations, comments,
  issue edits are the documented set); the caller verifies the equivalent exists before
  swapping. No other mid-run transport invention is sanctioned by this file.

## Burst-shape authoring rules

For any skill or `bin/lib/` module issuing a scripted sequence of mutative GitHub calls:

- Leave at least 1 second between scripted mutative calls (GitHub's own documented guidance).
- Coalesce every label change for one target into a single call carrying the full label list
  (e.g. `addLabelsToLabelable` with the complete set), rather than one call per label.
- When a fixed scripted sequence has no data dependencies between its calls, prefer one
  aliased GraphQL request over N sequential mutations.

## Consumers

Each consumer keeps its own degradation *outcome* — only its recognition wording cites this
file.

| Consumer | Outcome this file does not change |
|---|---|
| `skills/_shared/forge-detection.md` | Degrades to `DONE_WITH_CONCERNS` with partial results |
| `skills/_shared/pr-run-comments.md` | Logs to `decisions.md` as a retryable failure and falls back to the issue-only post |
| `skills/tidy/scan-procedures.md` | Skips the rest of the step and notes it in the report |
| `skills/_shared/issue-claims.md` | Retry-once-then-TTL-backstop (Section E's own outcome contract, unchanged) |
| `skills/assess-agent-autonomy/failure-check.md` | Classifies the failure `transient` in retry/merge-eligibility judgment |
| `skills/_shared/github-write-transport.md` | Pacing rules for scripted mutation sequences (this file's burst-shape rules, directly) |
| `.claude/skills/gh-api-module-pattern/SKILL.md` | Burst-shape rules for `bin/lib/` module authors |
