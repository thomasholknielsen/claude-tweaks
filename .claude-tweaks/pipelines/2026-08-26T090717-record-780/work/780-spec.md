---
record: 780
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 780: issue-claims.md "The lock" steps 1-2: spell out the 404→__ABSENT__ exit-status branch and the content-vs-wrapper extraction; migrate tidy's broken claim read

Surface: backend

Origin: consolidated Review Console of flow run 2026-08-17T044553-spec-720-721-722-723-724 (final review of #720 + review lens findings, batch-approved via consoleAutoResolve)
Defer-reason: pre-existing-outside-diff

## Current State

- `_shared/issue-claims.md` "The lock" step 1 (`gh` path) emits the wrapper object `{content: (.content | @base64d), sha: .sha}`; step 2 reads `${CONTENT_PATH_OR_ABSENT_SENTINEL}` and passes the file's whole text to `classifyClaimBlob`. A literal follower who dumps step 1's output verbatim to the content path hands `classifyClaimBlob` a JSON object with no `claimedAt`/`released` keys, which classifies `'unreadable'` → fails closed to live — a false contest on the *present*-blob path (the absent path is correct).
- Step 1 also shows no shell snippet for the exit-status branch that turns a 404 into the literal `__ABSENT__` sentinel fed to step 2 — a manual follower has to invent it. (`bin/claim-targets.js` implements both correctly since #723; this defect is about the prose path that `gh`-absent/MCP environments and manual followers still use.)
- `skills/tidy/scan-procedures.md:175` still carries the exact broken read form #720 removed from `flow/claim-targets.md` (`-q '.content' | base64 -d`, no absent/failure branch). The #720 conformance sweep whitelists it via citation-presence only; the underlying read is structurally broken on newline-embedded base64.

## Deliverables

- [ ] State explicitly in steps 1-2 that step 2's content input is the **`.content` field value** (the decoded blob text), not step 1's whole wrapper object — with the one-line extraction between them.
- [ ] Add the explicit exit-status branch (non-zero `gh api` exit → pass the literal `__ABSENT__` sentinel) as a shell snippet in step 1.
- [ ] Migrate `skills/tidy/scan-procedures.md`'s claim read to cite the canonical read (or invoke `bin/claim-targets.js`/`claim-store.js`-backed tooling).
- [ ] Conformance check that the two steps compose (fixture-driven or prose-pin).

## Acceptance Criteria

1. Following steps 1-2 literally against a live claim classifies `'live'` (not `'unreadable'`), and against a never-claimed issue classifies `'absent'` on the first read.
2. `grep -c 'base64 -d' skills/tidy/scan-procedures.md` → 0 (or the surviving read carries an explicit absent/failure branch).
3. `npm test` green.

## Technical Approach

Rewrite `_shared/issue-claims.md`'s "The lock" steps 1-2 so the prose path (still relied on by `gh`-absent/MCP environments and any manual follower) matches what `bin/claim-targets.js` already does correctly since #723: step 1 gains the explicit non-zero-exit → `__ABSENT__` branch as a shell snippet, and the handoff between step 1 and step 2 is stated as "pass the decoded `.content` field value, not the wrapper object" with a one-line extraction shown inline. Then migrate `skills/tidy/scan-procedures.md:175`'s broken `-q '.content' | base64 -d` read (with no absent/failure branch) to cite the corrected canonical read, or to invoke the `claim-targets.js`/`claim-store.js`-backed tooling directly instead of hand-rolling the read. Close with a conformance check (fixture-driven or prose-pin) proving the two steps compose end-to-end.

### Key Files
- `skills/_shared/issue-claims.md`
- `skills/tidy/scan-procedures.md`
- `tests/` (conformance)

## Gotchas

- The false-contest bug is specific to the *present*-blob path — the absent-blob (`__ABSENT__` sentinel) path already classifies correctly today; don't over-broaden the fix into code that isn't actually broken.
- `bin/claim-targets.js` already implements both fixes correctly since #723 — this record is about bringing the prose path (and `scan-procedures.md`'s manual read) up to the same standard, not about touching the CLI.
- The #720 conformance sweep whitelisted `scan-procedures.md`'s broken read via citation-presence only, so a citation-only re-check would not catch a regression here — the new conformance check (Deliverable 4) needs to actually exercise the read, not just check for a citation string.

## Original request

issue-claims.md "The lock" steps 1-2: spell out the 404→__ABSENT__ exit-status branch and the content-vs-wrapper extraction; migrate tidy's broken claim read

Surface: backend

Origin: consolidated Review Console of flow run 2026-08-17T044553-spec-720-721-722-723-724 (final review of #720 + review lens findings, batch-approved via consoleAutoResolve)
Defer-reason: pre-existing-outside-diff

## Current State

- `_shared/issue-claims.md` "The lock" step 1 (`gh` path) emits the wrapper object `{content: (.content | @base64d), sha: .sha}`; step 2 reads `${CONTENT_PATH_OR_ABSENT_SENTINEL}` and passes the file's whole text to `classifyClaimBlob`. A literal follower who dumps step 1's output verbatim to the content path hands `classifyClaimBlob` a JSON object with no `claimedAt`/`released` keys, which classifies `'unreadable'` → fails closed to live — a false contest on the *present*-blob path (the absent path is correct).
- Step 1 also shows no shell snippet for the exit-status branch that turns a 404 into the literal `__ABSENT__` sentinel fed to step 2 — a manual follower has to invent it. (`bin/claim-targets.js` implements both correctly since #723; this defect is about the prose path that `gh`-absent/MCP environments and manual followers still use.)
- `skills/tidy/scan-procedures.md:175` still carries the exact broken read form #720 removed from `flow/claim-targets.md` (`-q '.content' | base64 -d`, no absent/failure branch). The #720 conformance sweep whitelists it via citation-presence only; the underlying read is structurally broken on newline-embedded base64.

## Deliverables

- [ ] State explicitly in steps 1-2 that step 2's content input is the **`.content` field value** (the decoded blob text), not step 1's whole wrapper object — with the one-line extraction between them.
- [ ] Add the explicit exit-status branch (non-zero `gh api` exit → pass the literal `__ABSENT__` sentinel) as a shell snippet in step 1.
- [ ] Migrate `skills/tidy/scan-procedures.md`'s claim read to cite the canonical read (or invoke `bin/claim-targets.js`/`claim-store.js`-backed tooling).
- [ ] Conformance check that the two steps compose (fixture-driven or prose-pin).

## Acceptance Criteria

1. Following steps 1-2 literally against a live claim classifies `'live'` (not `'unreadable'`), and against a never-claimed issue classifies `'absent'` on the first read.
2. `grep -c 'base64 -d' skills/tidy/scan-procedures.md` → 0 (or the surviving read carries an explicit absent/failure branch).
3. `npm test` green.

## Technical Approach

### Key Files
- `skills/_shared/issue-claims.md`
- `skills/tidy/scan-procedures.md`
- `tests/` (conformance)

**Related:** #720, #723 (the CLI already subsumes the manual path for `gh` environments)

