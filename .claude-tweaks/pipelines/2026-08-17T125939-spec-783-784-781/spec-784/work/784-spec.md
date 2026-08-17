---
record: 784
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-28420473
surface: backend
---
# 784: capture: documented /tmp payload paths are fixed, not session-scoped — collide across concurrent sessions

Surface: backend

## Current State

The `github-issues` filing snippet in `skills/capture/SKILL.md` (Backend Selection, "When work-backend: github-issues" step 2, lines ~174–194) writes intermediate payloads to fixed, non-unique paths: `/tmp/capture-payload.json` and `/tmp/capture-body.md`. Concurrent `/claude-tweaks:capture` invocations against the same checkout — routine in projects using this plugin, including parallel agent sessions — can read or clobber each other's in-flight payload before `gh issue create` runs: the second write silently overwrites the first, and whichever create call reads second files the wrong (or interleaved) body. Measured symptom: a session's own adaptation of this step used a fixed non-unique name (`/tmp/capture-body-tmp.md`) that remained on disk after the run (827 bytes) — the pattern also leaks temp files.

## Deliverables

- The documented snippet derives session-unique temp paths — a PID/session-id suffix, or the harness-advertised per-session scratchpad directory when one exists — instead of fixed `/tmp` names.
- The snippet deletes its temp files once `gh issue create` returns successfully.
- Any other restatements of the fixed-path pattern (other skills, tests pinning the snippet) updated in the same pass.

## Acceptance Criteria

- Two concurrent invocations of the documented snippet produce distinct paths — neither can read or overwrite the other's payload.
- Temp files no longer persist after a successful filing.
- `npm test` passes, including any conformance suites that byte-pin the current snippet.

## Technical Approach

Edit the Backend Selection step-2 snippet in `skills/capture/SKILL.md` to derive one unique base path (e.g. `${TMPDIR:-/tmp}/capture-$$`) used for both files, and remove the files after the create call succeeds. Grep repo-wide for `/tmp/capture-` literals to catch restatements and pinned test fixtures before editing.

## Gotchas

- Skill-prose conformance tests may byte-pin the executable snippet — expect test edits, and run the full suite rather than capture-named files only.
- The snippet is executed by sessions in varied shells and worktree-restricted environments; keep each step a single plain command (no `&&` chains) so restricted sessions can still run it verbatim.
- Keep the payload flowing through `node -e` + `--body-file` exactly as today — only the paths change; earlier incidents show shell-quoting rewrites of these snippets (echo escape interpretation) introduce their own defects.

## Original request

capture: documented /tmp payload paths are fixed, not session-scoped — collide across concurrent sessions

**Summary:** `skills/capture/SKILL.md`'s own `github-issues` filing snippet writes to fixed, non-unique paths (`/tmp/capture-payload.json`, `/tmp/capture-body.md`). A concurrent `/capture` invocation in the same checkout — a routine occurrence in projects using this plugin, including the one this session ran in — can read or overwrite another session's in-flight payload before its `gh issue create` runs.

**Kind:** Defect

**Affected component:** `skills/capture/SKILL.md` — Backend Selection, "When work-backend: github-issues" step 2

**Objective:** Recovery quality

**Measurement:** this session's own adaptation of this step still used a fixed non-unique name (`/tmp/capture-body-tmp.md`), which remained on disk after the run completed (827 bytes).

**Repro steps:**
1. Start two `/claude-tweaks:capture` invocations against the same repo checkout at roughly the same time (two terminals, or two concurrent agent sessions).
2. Both reach Backend Selection's `github-issues` step 2 and write to the same fixed `/tmp/capture-payload.json` / `/tmp/capture-body.md` paths.

**Expected vs. actual:**
Expected: each invocation's intermediate payload is isolated from any concurrent invocation.
Actual: the second write silently clobbers the first's temp file; whichever `gh issue create` reads the file second files the wrong body (or, if timed between write and read, a truncated/interleaved one).

**Proposed fix:** Suffix the documented temp paths with the session id or PID, or write into a harness-provided per-session scratchpad directory when one is advertised, and delete the temp file once `gh issue create` returns successfully.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation).
<!-- fingerprint: feedback-28420473 -->
