---
record: 796
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: github-rate-limit-contention:shared-github-rate-limit-contract-shared-github-rate-limit-m
surface: backend
---
# 796: Shared GitHub rate-limit contract: _shared/github-rate-limit.md + consumer migration

Surface: backend

## Overview

Create `skills/_shared/github-rate-limit.md` — the fleet's single recognition-and-response playbook for GitHub rate limiting — and migrate every skill file that currently carries its own one-line rate-limit clause to cite it. Three sessions hit rate limits in 48 hours and each improvised a different workaround; the contract replaces improvisation with one classification taxonomy (secondary/abuse vs primary exhaustion vs plain 403), one response policy, and burst-shape authoring rules. Callers keep their own degradation *outcomes*; the contract owns only recognition and backoff.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No change to the claims-registry transport — that is #787 (amended to a git-CAS-first core; its build classifies secondary-limit responses per this contract's taxonomy, but the classification *rules* live here).
- No GitHub App / identity change — parked as #794 with a recorded revisit trigger.
- No caching layer for reconciler reads (#405 measured them negligible) and no new `bin/` retry helper — this is a prose contract plus conformance tests; bin/lib modules get authoring rules via `.claude/skills/gh-api-module-pattern`, not a shared runtime dependency.
- No local cross-session write-lock (rejected in the design — partial coverage, shared-mutable-state risk).
- No behavioral/fault-injection verification of agent compliance. The conformance suite pins text presence only — the same ceiling every prose contract in this plugin has, because agents following loaded prose *is* the plugin's operating model. Stated here so the AC set is never mistaken for runtime enforcement.

## Current State

- `skills/_shared/forge-detection.md:15` — "Individual `gh` command failures mid-scan (rate limit, network, transient API errors) degrade to `DONE_WITH_CONCERNS`…" — outcome stays, recognition should cite the contract.
- `skills/_shared/pr-run-comments.md:77` — "**On failure of either the find or the write** (network, auth, rate limit): log to `decisions.md`" — same shape.
- `skills/tidy/scan-procedures.md:164` — listing-call failure clause ("rate limit, transient…").
- `skills/_shared/issue-claims.md` — the claim/release steps carry a "retry once, then log and continue" rule with the TTL backstop; the TTL outcome stays, the retry/recognition half migrates.
- `skills/assess-agent-autonomy/failure-check.md:22` — classifies "`gh api` rate-limit (HTTP 429) responses" as transient signatures; gains the secondary-vs-primary distinction (a secondary limit is transient; primary exhaustion has a known reset time; plain 403 is not transient at all).
- `skills/_shared/github-write-transport.md` — both transports' shared write-path contract; the natural place to cite pacing rules for scripted mutation sequences.
- `.claude/skills/gh-api-module-pattern/SKILL.md` — the bin/lib authoring skill; gains the burst-shape rules (pacing, label coalescing) for module authors.
- Incident evidence (read these before writing the taxonomy): `.claude-tweaks/pipelines/archive/2026-08-16T232102-spec-702/decisions.md` lines 86-87, `archive/2026-08-17T044452-record-697/decisions.md` line 40, `archive/2026-08-17T054156-record-676/decisions.md` line 13, `archive/2026-08-17T053210-record-714/decisions.md` line 71, `2026-08-17T074558-record-418/events.jsonl`.
- Tests: `tests/` prose-conformance suites (e.g. `tests/deferral-gate-conformance.test.js`) show the pin pattern for `_shared` contract files; see the `skill-prose-conformance-tests` skill before writing the new suite.
- Cross-reference home: `docs/skill-graph.md` (every skill relationship stated once, never inside a SKILL.md); `docs/plugin-structure.md` enumerates `_shared` files.

## Deliverables

- [ ] `skills/_shared/github-rate-limit.md` with: (a) a three-row recognition taxonomy — secondary/abuse limit (403 + "secondary rate limit" message body, usually `Retry-After`, quota still remaining), primary exhaustion (403/429 + `X-RateLimit-Remaining: 0`, separate REST/GraphQL buckets), plain 403, positively defined as carrying neither exhaustion evidence nor a secondary-limit message — never retry, surface per the caller's error contract; a response matching neither positive signature also classifies here (fail loud beats a blind wait) — stating that classification reads the response body/headers, never the status code alone, and naming the mechanism that makes this practical for a skill shelling through `gh`: the error text `gh` prints carries the secondary-limit message verbatim, and primary-vs-secondary is settled by a follow-up `gh api rate_limit` probe (remaining 0 on the bucket in use → primary; quota remaining → secondary) — no `-i`/`--include` header capture required; (b) a response policy — honor `Retry-After`, else wait 45–90s (uniform jitter; documentary guidance for authors, like every number in this contract — pinned as text, never runtime-enforced), at most 2 retries as a *ceiling* a caller's own contract may undercut (issue-claims.md's Section E retry-once stays as-is by design), and a total wall-clock bound of ~5 minutes for the whole sequence — when honoring `Retry-After` (or the summed waits) would exceed it, skip the remaining retries and degrade immediately; the wall-clock bound, not the call-count cap alone, is what separates this from record-418's open-ended poller; never an unbounded poll (record-418's background poller named as the anti-pattern); recognition, classification, and backoff are mode-agnostic — only the logging step is bound to a pipeline run: with a run dir, log one `decisions.md` line naming the classified signature (per `_shared/auto-decision-log.md`'s entry schema), stage/defer the write, move on; with no run dir (standalone invocations), skip the log and apply the caller's outcome directly; (c) codified fallbacks — a contents-API *read* may always fall back to reading the same blob via plain git (`git fetch` + `git show 'ref:path'` — exactly what record-697 did; independent of #787's machinery); a protocol swap is legitimate for *primary* exhaustion only and is symmetric — swap toward whichever protocol's bucket has quota — and only for calls with a documented equivalent on the other protocol (the record-676 set: label ops, comments, issue edits; the caller verifies the equivalent exists before swapping); it is explicitly not an escape from secondary limits (shared abuse-detection domain); no other mid-run transport invention; (d) burst-shape authoring rules — ≥1s between scripted mutative calls (GitHub's documented guidance), all labels in one call (`addLabelsToLabelable` with the full list), prefer one aliased GraphQL request over N sequential mutations when a fixed scripted sequence has no data dependencies.
- [ ] Migrate the six skill prose consumers listed in Current State plus `.claude/skills/gh-api-module-pattern/SKILL.md`: each keeps its degradation outcome and cites `_shared/github-rate-limit.md` for recognition/backoff instead of restating it, following `_shared/worktree-setup.md:9`'s "cites, rather than duplicates" phrasing shape — a line-anchored mention of the contract file next to the caller's own outcome.
- [ ] `docs/skill-graph.md`: add the new contract's consumer edges (stated once there, per CLAUDE.md's cross-reference rule); add the `_shared` file to `docs/plugin-structure.md`'s enumeration if `_shared` files are individually listed there (verify before editing — follow whatever granularity that file actually uses).
- [ ] A conformance test suite (`tests/`, `node --test`) that pins: the three taxonomy signatures present in the contract file; each migrated consumer citing `github-rate-limit.md`; and the two burst rules (pacing, single label call) present. Deliberately unpinned: the consumers' outcome wording — that stays owned by each consumer's existing pin suites (e.g. wrap-up's Section E conformance), and this suite must not create a second copy of those pins.

## Acceptance Criteria

1. `skills/_shared/github-rate-limit.md` exists and contains all three signature classifications and both burst-shape authoring rules; the response policy names `Retry-After`, a bounded retry count, and the auto-mode log-stage-continue shape.
2. Each of the seven consumer files greps for `github-rate-limit.md` (case-insensitive, content-anchored), and none of the six skill prose consumers still carries its own standalone recognition wording for rate limits — the sweep's target phrases are exactly the clauses quoted in Current State (e.g. "rate limit, network, transient API errors"; "network, auth, rate limit"; "rate limit, transient"; "HTTP 429"), each paired with a whitespace-spanning control scan — while their degradation outcomes (`DONE_WITH_CONCERNS`, TTL backstop, log-and-continue) remain verbatim.
3. `docs/skill-graph.md` carries the new edges; no `skills/**/SKILL.md` restates them.
4. The new conformance suite fails when any pinned element is removed (verify by reverting one pin target before finalizing — see Gotchas), and `npm test` is green.

## Technical Approach

Prose-first: one new `_shared` contract file, six one-clause citation swaps in skill prose, one authoring-skill addition, graph edges, and a conformance suite. No runtime code changes. Model the contract file's structure on existing `_shared` recognition/procedure contracts (e.g. `_shared/forge-detection.md`'s degrade rules, `_shared/worktree-setup.md`'s fail-open-distinctly logging) — state the taxonomy as a table, the policy as short rule paragraphs, and keep caller outcomes out of it entirely.

### Key Files

- `skills/_shared/github-rate-limit.md` — new contract file (taxonomy, response policy, fallbacks, authoring rules)
- `skills/_shared/forge-detection.md` — cite for recognition; keep DONE_WITH_CONCERNS outcome
- `skills/_shared/pr-run-comments.md` — cite; keep log-to-decisions outcome
- `skills/tidy/scan-procedures.md` — cite; keep MCP-path/partial-scan outcome
- `skills/_shared/issue-claims.md` — cite; keep retry-once-then-TTL outcome wording as the *outcome*, recognition per contract
- `skills/assess-agent-autonomy/failure-check.md` — cite; add secondary-vs-primary distinction to the transient-signature list
- `skills/_shared/github-write-transport.md` — cite; pacing rules for scripted mutation sequences
- `.claude/skills/gh-api-module-pattern/SKILL.md` — burst-shape rules for bin/lib authors
- `docs/skill-graph.md` — consumer edges
- `docs/plugin-structure.md` — `_shared` enumeration (only if it lists `_shared` files individually)
- `tests/github-rate-limit-conformance.test.js` — new pin suite (name per existing `tests/*-conformance.test.js` convention)

## Gotchas

- **Verify the new tests can go red**: revert one pinned element and re-run before finalizing — a pin that reads correctly can still never fail (project memory: verify-test-discrimination-by-reverting).
- **Full suite before merging markdown-only changes**: repo-wide prose-conformance tests pin skill text — a green targeted suite is not enough (memory: full-suite-before-merging-markdown-prs). Also check `wc -c` on any near-ceiling file before adding text; `_shared` files have a ~40KB practical ceiling (#204's precedent).
- **Sweep greps must span line wraps**: when asserting "no standalone recognition wording remains," pair single-line greps with a `grep -z`/`\s+` control scan — literals wrap mid-clause in prose (memory: whitespace-spanning-sweep-greps).
- **#787 and #780 both edit `skills/_shared/issue-claims.md`** (different sections — #787 the transport prose, #780 the lock steps 1-2). Merge upstream immediately before the final whole-branch review; siblings sharing files ship mid-build in this repo.
- **The retry-once wording in `issue-claims.md` is Section E's outcome contract** — wrap-up's claim-release behavior is conformance-pinned; change the recognition framing around it, not the outcome semantics.
- `npm test` failure counts that vary run-to-run on identical code track machine load, not regressions — re-run affected files in isolation before diagnosing (CLAUDE.md).
- A skill reference inside actionable instruction text must use the fully-qualified `/claude-tweaks:{skill}` form; bare `/{skill}` is for descriptive prose only (CLAUDE.md cross-references rule).

## Decision Rationale

See the parent record's Decision Rationale — bar choice, why #787 carries the transport change, why the App identity is parked as #794, and the two checked-and-already-handled items (routine stagger, reconciler reads).

**Related:** #787 (git-CAS claims consolidation — classifies per this taxonomy), #794 (parked App identity), #780 (co-edits issue-claims.md), #172 (gh-absence degradation in scan-procedures/github-write-transport — adjacent topic, different failure mode)

<!-- work-fingerprint: github-rate-limit-contention:shared-github-rate-limit-contract-shared-github-rate-limit-m -->
