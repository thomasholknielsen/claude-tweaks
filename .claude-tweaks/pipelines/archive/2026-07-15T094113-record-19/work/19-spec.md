---
record: 19
origin: human
risk: low
effort: medium
grants: [build]
surface: backend
---
# 19: Migrate pull-issues.js's ingestion path onto record.js's readers, then retire ingest.js

## Current State
`bin/lib/issues/ingest.js` is not caller-free: `bin/lib/code-health/pull-issues.js:7` requires
`issuesToBriefs`/`SEVERITY_RANK` from it, and `pull-issues.js` is itself required only by
`bin/code-health.js`'s `pull-issues` CLI command (`cmdPullIssues`, wired at `bin/code-health.js:134,158`).
That is the only live caller chain; `ingest.js`'s other exported symbol, `isFormShaped`, has no
caller outside `ingest.js` itself (called internally at `ingest.js:58`) and its own test —
`skills/init/bootstrap-steps.md:249` mentions it only in prose, not as a code caller.

`ingest.js` pre-dates the unified work-record taxonomy (`bin/lib/issues/record.js`,
`skills/_shared/work-record.md`) and both of its label/marker readers are now stale against
the labels/markers code-health actually files:

- `severityOf`/`SEV_LABEL_RE` (`ingest.js:10,22-28`) matches only the legacy
  `code-health:(?:risk-)?(critical|high|medium|low|info)` label (5-tier: critical/high/medium/low/info).
  The only payload function that ever emitted that label is `toIssuePayload` (v1) in
  `bin/lib/code-health/issue-payload.js`, which is explicitly frozen/dead — its own header comment
  says "Not called by bin/code-health.js (which uses toIssuePayloadV2 exclusively)". `toIssuePayloadV2`
  (the one actually used) delegates to `recordPayload` and emits `by:code-health` + `risk:<tier>`
  (3-tier: low/medium/high, matching `record.js`'s `TIERS` and `dedup.js`'s `RISK_RANK`) instead.
  So `severityOf` cannot match any label a currently-filed code-health issue actually carries —
  every current-format issue silently falls through to the `'info'` default, and `pull-issues
  --min-severity` filters against that stale default rather than the issue's real risk tier.
- `FP_RE` (`ingest.js:9`) matches only the legacy `<!-- code-health-fingerprint: ... -->` marker.
  `recordPayload` (`record.js:90-92`) writes the current `<!-- work-fingerprint: ... -->` marker
  into every issue `toIssuePayloadV2` files. `ingest.js` has no fallback to the new marker (unlike
  `record.js`'s own `extractFingerprint`, which tries `FP_RE_WORK` first and falls back to
  `FP_RE_LEGACY`) — so `issuesToBriefs` returns `fingerprint: null` for every current-format issue.

Both gaps mean `pull-issues` already silently degrades against real, currently-filed code-health
issues; this isn't just a stylistic duplication of logic `record.js` now owns canonically.

## Deliverables
Migrate `pull-issues.js` (and `bin/code-health.js`'s `cmdPullIssues`) onto `record.js`'s readers:
`parseRecordFacets` for the `risk:<tier>` facet (replacing `severityOf`/`SEV_LABEL_RE`'s legacy
5-tier scale with the 3-tier `risk`/`RISK_RANK` scale already used by `--min-risk` elsewhere in
`bin/code-health.js`), and `extractFingerprint` for the dual-marker fingerprint read (replacing
`FP_RE`). Decide whether `--min-severity`'s CLI surface is renamed to align with `--min-risk`'s
existing 3-tier vocabulary or kept as an aliased/deprecated flag for compatibility. Once
`issuesToBriefs`/`isFormShaped`/`SEVERITY_RANK` have no remaining callers, delete
`bin/lib/issues/ingest.js` + `bin/lib/issues/tests/ingest.test.js`, and either delete
`bin/lib/code-health/pull-issues.js` (folding its thin wrapper directly into `bin/code-health.js`)
or keep it as record.js's direct caller if a separate module still earns its keep.

## Acceptance Criteria
`code-health.js pull-issues --min-severity <tier>` filters real currently-filed `by:code-health`
issues by their actual `risk:<tier>` label (verified against a fixture issue carrying
`by:code-health`/`risk:high`/`work-fingerprint`, not the legacy label/marker shape);
`bin/lib/code-health/tests/*` (including any renamed/added pull-issues coverage) pass;
`bin/lib/issues/ingest.js` and its test file are deleted; `skills/init/bootstrap-steps.md`'s
`isFormShaped` reference is updated or removed to match; `npm test` passes in full.

