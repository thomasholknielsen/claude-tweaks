---
record: 315
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 315: Dispatch reads claim-tombstone reason/link at claim time (already-built detection)

Surface: backend

## Current State

Dispatch's Step 4 claim path re-claims an issue whenever `classifyClaimBlob` returns `state: 'tombstone'`, treating that as a legitimate re-claim per `_shared/issue-claims.md` (line 87) — without first reading the tombstone's `reason` and `link` fields. When the tombstone's reason is `pr-opened: spec {spec}` and links a still-open PR, the record already has a completed build in flight; the claim path has no logic today to detect that and instead proceeds straight into a fresh re-claim.

This surfaced concretely on 2026-08-11: re-claiming #272 for dispatch bounced off a tombstone whose `reason` field read `pr-opened: spec 272` with a link to open PR #304 — the only signal that a build already existed. The duplicate build was prevented by the create-only write failing (an incidental collision), not by any procedure reading and acting on the tombstone's reason/link fields.

## Deliverables

1. `_shared/issue-claims.md` release-reason vocabulary: document that `pr-opened:` reason entries carry a `link` field pointing to the opened PR, and that a claim-time reader may consult it.
2. Dispatch Step 4 (claim path) amendment: after `classifyClaimBlob` returns `state: 'tombstone'`, before treating it as a legitimate re-claim, read the tombstone's `reason` and `link` fields.
   - When `reason` starts with `pr-opened:` and `link` is present, check whether the linked PR is still open (e.g. `gh pr view <link> --json state --jq .state`).
   - If open, do not re-claim/re-build — route to the existing settle-the-existing-build handling (the resume/merge-decision path dispatch/`/flow` already has for a run whose PR is open) instead of a fresh claim.
   - If the PR is closed/merged, or the state check itself fails, fall through to today's re-claim behavior unchanged (fail open — never let this new check wedge dispatch).
3. No behavior change for non-`pr-opened:` tombstone reasons (`merged:`, `abandoned:`) — those already denote no live build, and the existing re-claim path is correct for them as-is.

## Acceptance Criteria

- Given a tombstone with `reason: "pr-opened: spec 272"` and `link` pointing to a PR that `gh pr view` reports as `state: OPEN`, dispatch's Step 4 claim path does not re-claim/re-build the issue, and instead surfaces/routes to the existing open PR.
- Given a tombstone with `reason: "pr-opened: spec {n}"` whose linked PR is closed or merged, dispatch's Step 4 claim path proceeds to re-claim exactly as it does today.
- Given a `merged:` or `abandoned:` tombstone, dispatch's Step 4 claim path is unchanged.
- If the PR-state check itself errors or times out, dispatch's Step 4 claim path falls through to today's re-claim behavior rather than blocking.
- `_shared/issue-claims.md`'s release-reason vocabulary documents the `link` field for `pr-opened:` entries.
- A new test exercises the tombstone-with-open-linked-PR path and confirms it does not re-claim; existing `issue-claims.md`/dispatch tests continue to pass.

## Technical Approach

Add the tombstone reason/link read immediately after Step 4's `classifyClaimBlob` call returns `state: 'tombstone'`, before the existing conditional-overwrite claim write. Parse `reason` for the `pr-opened:` prefix and extract `link`; when present, shell to `gh pr view <link> --json state --jq .state` to decide open vs. closed/merged. Leave the existing create-only/conditional-overwrite claim mechanics untouched for every other case — this is a pre-check gate in front of them, not a rewrite of them. Route the open-PR case into whatever resume/merge-decision handling dispatch's Step 6 / the Review Console already has for a run whose PR is open, rather than inventing a new "settle" mechanism.

## Gotchas

- The link check adds a network/API call to the claim path. Keep it fail-open (mirroring `issue-claims.md`'s existing `state: 'unreadable'` precedent) so a `gh` outage or API hiccup falls through to today's behavior instead of wedging dispatch.
- "Settle the existing build" should route into the resume/merge-decision machinery that already exists for an open-PR run, not duplicate it — confirm the exact hook-in point in dispatch Step 6 / the Review Console before implementing.
- Confirm whether the local-files driver's tombstone format has an equivalent `link` field before assuming this is GitHub-only; if not, scope the PR-state check to `work-backend: github-issues` and document the local-files gap rather than silently no-op'ing there.

## Original request

Dispatch reads claim-tombstone reason/link at claim time (already-built detection)

**Related:** #314

Context: Re-claiming #272 for dispatch bounced off a tombstone whose reason field read pr-opened: spec 272 with a link to open PR #304 — the only signal that a build already existed. The duplicate build was prevented by the create-only write failing, not by any procedure reading the tombstone. (2026-08-11 session.)

Scope: Dispatch Step 4 claim path: when classifyClaimBlob returns tombstone, surface the tombstone reason and link fields before re-claiming — a pr-opened tombstone with a still-open linked PR routes to settle-the-existing-build instead of build-again. Contract addition to _shared/issue-claims.md release-reason vocabulary plus a dispatch step amendment.

