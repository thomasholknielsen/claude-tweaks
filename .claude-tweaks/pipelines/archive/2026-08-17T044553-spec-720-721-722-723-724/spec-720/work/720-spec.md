---
record: 720
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 720: flow claim-targets: inline claim-read snippet has no absent (404) branch — a never-claimed target classifies unreadable and contests

Surface: backend

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)
Defer-reason: genuinely-larger

## Current State

- `flow/claim-targets.md` ("Claim every named target, all-or-abort") prescribes the read as `gh api ".../contents/claims/issue-${ISSUE}.json?ref=claims-registry" -q '.content' | base64 -d > "/tmp/flow-claim-${ISSUE}.json"` followed by `readFileSync` → `classifyClaimBlob`. On a 404 (a never-claimed target) that pipeline writes an **empty** file; `classifyClaimBlob('')` returns `{state:'unreadable'}`, and the step's fail-closed rule turns every never-claimed target into a contest.
- The snippet is wrong on live blobs too: `-q '.content'` emits GitHub's base64 with embedded newlines, so `base64 -d` fails (`base64: stdin: (null): error decoding base64 input stream`) — observed ×8 in one run, yielding no classification and forcing a second disambiguation round.
- `_shared/issue-claims.md` steps 1-2 already carry the correct form — `-q '{content: (.content | @base64d), sha: .sha}'` plus the `__ABSENT__` sentinel keyed on a non-zero exit — so the two files disagree. The run only proceeded because the model wrote a bespoke `claim.js` mapping 404 → `content=null`, routing around the skill text.

## Deliverables

- [ ] Replace `claim-targets.md`'s inline read snippet with a citation of `_shared/issue-claims.md` steps 1-2 (or the identical content: capture `gh api` exit status, pass `__ABSENT__` on non-zero, `@base64d` + `sha` in one `jq`) — one canonical read, not two.
- [ ] Conformance test: `skills/flow/claim-targets.md` contains no `base64 -d` read; any claim-read snippet under `skills/**` either cites `_shared/issue-claims.md` or carries an explicit absent branch.

## Acceptance Criteria

1. `grep -c 'base64 -d' skills/flow/claim-targets.md` → `0`.
2. Following `claim-targets.md` literally against a never-claimed issue classifies `absent` on the first read — no second round, no bespoke script.
3. `npm test` green including the new conformance test.

## Technical Approach

### Key Files
- `skills/flow/claim-targets.md`
- `skills/_shared/issue-claims.md`
- `tests/` (new conformance test)

## Gotchas

- `-q '.content'` also fails on **live** blobs (GitHub returns base64 with embedded newlines), so the fix must use `@base64d` in `jq` — not just add an absent branch to the old pipe.
- Keep the MCP transport parity: `_shared/issue-claims.md`'s MCP path reads the same blob via `get_file_contents`; the citation must not re-fork the two transports.
- The conformance grep for `base64 -d` must be scoped to claim reads — other `_shared` files legitimately decode blobs.

**Related:** #686 (release-side CLI — same claim family), #607

## Original request

flow claim-targets: inline claim-read snippet has no absent (404) branch — a never-claimed target classifies unreadable and contests

Defer-reason: genuinely-larger

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

- `flow/claim-targets.md` ("Claim every named target, all-or-abort") prescribes the read as `gh api ".../contents/claims/issue-${ISSUE}.json?ref=claims-registry" -q '.content' | base64 -d > "/tmp/flow-claim-${ISSUE}.json"` followed by `readFileSync` → `classifyClaimBlob`. On a 404 (a never-claimed target) that pipeline writes an **empty** file; `classifyClaimBlob('')` returns `{state:'unreadable'}`, and the step's fail-closed rule turns every never-claimed target into a contest.
- The snippet is wrong on live blobs too: `-q '.content'` emits GitHub's base64 with embedded newlines, so `base64 -d` fails (`base64: stdin: (null): error decoding base64 input stream`) — observed ×8 in one run, yielding no classification and forcing a second disambiguation round.
- `_shared/issue-claims.md` steps 1-2 already carry the correct form — `-q '{content: (.content | @base64d), sha: .sha}'` plus the `__ABSENT__` sentinel keyed on a non-zero exit — so the two files disagree. The run only proceeded because the model wrote a bespoke `claim.js` mapping 404 → `content=null`, routing around the skill text.

## Deliverables

- [ ] Replace `claim-targets.md`'s inline read snippet with a citation of `_shared/issue-claims.md` steps 1-2 (or the identical content: capture `gh api` exit status, pass `__ABSENT__` on non-zero, `@base64d` + `sha` in one `jq`) — one canonical read, not two.
- [ ] Conformance test: `skills/flow/claim-targets.md` contains no `base64 -d` read; any claim-read snippet under `skills/**` either cites `_shared/issue-claims.md` or carries an explicit absent branch.

## Acceptance Criteria

1. `grep -c 'base64 -d' skills/flow/claim-targets.md` → `0`.
2. Following `claim-targets.md` literally against a never-claimed issue classifies `absent` on the first read — no second round, no bespoke script.
3. `npm test` green including the new conformance test.

## Technical Approach

### Key Files
- `skills/flow/claim-targets.md`
- `skills/_shared/issue-claims.md`
- `tests/` (new conformance test)

**Related:** #686 (release-side CLI — same claim family), #607
