# 247 — Close the claim deprecation window, then trim issue-claims.md

**Spec:** `.claude-tweaks/pipelines/2026-08-09T094731-spec-246-247-254/spec-247/work/247-spec.md`

**End-condition verification (done at plan time):** v6.73.0 (the release that shipped #241) is line 229 of `docs/shipped-versions.tsv`; `gh api "repos/thomasholknielsen/claude-tweaks/git/matching-refs/claims/"` returns empty (no in-flight legacy claims). The window may close.

**Premise corrections found at plan time (IL-71):**
- `claimFilePath` is NOT a "now-unused compatibility export" — it formats the **live** blob keyspace (`claims/issue-<n>.json`) and both payload builders call it. It stays. Only `claimRef` (the retired `refs/claims/issue-<n>` keyspace) goes. The closing disposition must record this correction to the End condition's wording.
- `claimPayload`/`releasePayload` doc comments still describe gh-CLI **ref writes** (`gh api ".../git/refs" -f "ref=..."` / `gh api -X DELETE ".../git/${ref}"`) that nothing performs anymore — stale comments to rewrite in the same change.
- The legacy surface has prose consumers beyond the contract file (scope added per `add-to-plan`): `dispatch/claim-outcomes.md`, `dispatch/mcp-transport.md`, `dispatch/SKILL.md` (line ~268), `tidy/scan-procedures.md`, `tidy/SKILL.md` (line ~107), `flow/failure-cards.md` (line ~19).

**Word-count target:** baseline (pre-#241, `git show d2ed600a:skills/_shared/issue-claims.md | wc -w`) = **3173**; current = **4038**; under-half target = **≤1586**. Measure honestly at the end; if unreachable without losing consumer-needed mechanical detail, record an explicit downgrade in the disposition (the spec authorizes this).

## Task 1: Remove the legacy surface from claims.js + tests

Files: `bin/lib/issues/claims.js`, `bin/lib/issues/tests/claims.test.js`

- Remove `claimRef`, `claimStatus`, `parseClaimMarker`, and the `RELEASE_RE`/`CLAIM_RE` regexes (only `parseClaimMarker` uses them; `claimStatus` was its only caller; the deprecation-window fallback was `claimStatus`'s only remaining caller).
- Keep `claimFilePath` (live), `CLAIMS_BRANCH`, `DEFAULT_TTL_HOURS`, `claimPayload`, `releasePayload`, `isStale` (used by `classifyClaimBlob`), `classifyClaimBlob`.
- Remove the `ref` field from both payloads' returns and the legacy `sha` param from `claimPayload` (its only documented role was the retired ref-creation call; `_shared/issue-claims.md` line ~43 states it is "unused by anything below"). Before removing, grep `skills/ bin/` for `.ref` / `p.sha` / `payload.sha` consumers of these payload fields and STOP if any live consumer reads them.
- Rewrite the module header comment and both payload doc comments to describe only the blob-store mechanism.
- Tests: delete the `claimRef` test and every `claimStatus`/`parseClaimMarker`/`everReleased` test (delete, not skip); keep the `claimFilePath` test and all `classifyClaimBlob`/`isStale` coverage.
- Commit 1: `Close the claim deprecation window — retire the refs/claims keyspace surface, refs #247`

## Task 2: Delete the deprecation-window content from issue-claims.md and sweep its consumers

Files: `skills/_shared/issue-claims.md`, `skills/dispatch/claim-outcomes.md`, `skills/dispatch/mcp-transport.md`, `skills/dispatch/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/tidy/SKILL.md`, `skills/flow/failure-cards.md`

In `issue-claims.md`: delete the `### Deprecation window` subsection; delete the "Legacy fallback, `claimStatus` (comment-fold)…" paragraph and its snippet; delete the Failure posture table's "**Deprecation window only:**" row; delete the "**No more `everReleased` split.**" historical paragraph; delete/condense the "(`sha` is no longer part of the claim payload…)" parenthetical (the param no longer exists) and shrink the "**Never pass a payload's `sha`…**" warning to one line stating the only `sha` ever passed is the target file's blob sha from the fresh read.

Consumers: remove `claim-outcomes.md`'s deprecation-window fallback paragraph; remove `mcp-transport.md`'s legacy `claimStatus` fold passage; in `dispatch/SKILL.md` drop the "(plus the legacy `claimStatus` comment-fold, deprecation-window only)" clause; in `tidy/scan-procedures.md` remove the `matching-refs` listing, its fold prose, and the two "**Deprecation window only:**" table rows; in `tidy/SKILL.md` line ~107 drop the `+ git/matching-refs/claims/ legacy fallback, deprecation window only` fragment; in `flow/failure-cards.md` reword the `claimStatus` aside (e.g. "plain text, no marker — the claim classifier ignores it").

Commit 2 (with Task 3): see Task 3.

## Task 3: Editorial trim of the remaining contract prose

Files: `skills/_shared/issue-claims.md`

Tighten without losing mechanical detail: condense pre-unification historical rationale ("This is what makes the collision this file used to leave open…", "restated here only because…", "This is exactly the property that closes the pre-unification `everReleased` limbo…" and similar backward-looking passages) to at most one short clause each or delete; keep every procedure step, table, snippet, and failure row a consumer executes. Do NOT split the file into sub-files (IL-76). Do NOT change the protocol.

Commit 2: `Trim issue-claims.md prose after closing the deprecation window, refs #247`

## Task 4: Measure and record

- `git show d2ed600a:skills/_shared/issue-claims.md | wc -w` and `wc -w skills/_shared/issue-claims.md` — record both.
- Verdict: met (≤1586) or explicit downgrade with one-sentence reason, appended to the spec file under `## Build Finding — Word-count measurement` together with the `claimFilePath` End-condition correction from the premise notes above.

## Verification

- `grep -rn "claimRef\|claimStatus\|parseClaimMarker\|everReleased\|matching-refs/claims" skills/ bin/ tests/` → zero hits outside `docs/superpowers/plans/`, `docs/incident-log.md`, frozen fixtures (`bin/lib/skill-audit/tests/fixtures/`), and this run's committed pipeline artifacts.
- Control grep: `grep -n "classifyClaimBlob" skills/_shared/issue-claims.md` → non-zero.
- `npm test` → same pass count as baseline minus deleted tests, 0 fail.
