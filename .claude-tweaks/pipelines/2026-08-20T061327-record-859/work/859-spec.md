---
record: 859
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 859: Strip the non-UTF8 byte from initiative-budget.js and guard payload text files

Origin: wrap-up of #418
Defer-reason: pre-existing

## Current State

`plugin/bin/lib/issues/initiative-budget.js` contains a stray non-UTF8/NUL byte: git diffs the file as binary, and plain grep silently skips it (the known "NUL byte breaks grep" hazard class). Every sweep in the #418 cutover had to special-case it with `grep -a`. The byte predates #418 and is owned by no record.

## Deliverables

- Locate and strip the stray byte (behavior-preserving — the module's tests stay green).
- A conformance check asserting every payload `.js`/`.md` file is valid UTF-8, red on a planted NUL.

## Acceptance Criteria

- `git diff` renders the file as text; `file` reports it as ASCII/UTF-8.
- The new guard test fails when a NUL is planted in a payload file and passes at HEAD.
- `npm test` green.

_Filed by `wrap-up` via specShapedBody._

