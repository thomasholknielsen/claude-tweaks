---
record: 133
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 133: code-health slicer emits config dot-directories as rotation candidates

Surface: backend

## Current State

code-health's slicer (`bin/lib/code-health/scope.js`) enumerates rotation candidates via `SKIP_DIRS`/`listSlices`. `SKIP_DIRS` already excludes build-output and tool-cache directories (`node_modules`, `dist`, `build`, `coverage`, `.next`, `.turbo`, plus `.claude-tweaks`, `.git`, `.claude`, `.worktrees`), but does not cover config dot-directories such as `.devcontainer`, `.github`, `.husky`, `.vscode`. Those directories are still emitted as rotation candidates and get audited despite holding little or no judgeable source, spending audit slots inefficiently.

This was deferred from #130's wrap-up reflection. #130's body described the offenders as "build-output and tool-cache directories" — that framing was wrong, and acting on it directly would have been a no-op, since `SKIP_DIRS` already excludes those. The directories actually observed consuming slots in #130's repro narrative are config dot-directories, which `SKIP_DIRS` does not cover. The rotation-starvation half of #130 was fixed in 6.39.1; this waste half was left, and severity is now much lower — before 6.39.1 these four sat at the front of the only reachable rotation window and consumed a large fraction of all audits a repo would ever get, but the rotation now reaches every candidate, so this is four low-value slices costing four slots per full sweep, not starvation. Filed separately from #130 rather than reopening it.

## Deliverables

- Decide deliberately between two candidate rules for excluding low-value directories from `listSlices` in `bin/lib/code-health/scope.js` — they are not equivalent:
  - Skip dot-directories by default (broad — would also skip a hypothetical `.config/` holding real source).
  - Skip a directory that yields zero files matching `SOURCE_EXTS` (narrow — targets the actual defect, needs no name list to maintain; `.github` typically holds YAML workflows rather than `SOURCE_EXTS` matches, so this rule likely catches it too).
- Implement the chosen rule in `bin/lib/code-health/scope.js`.
- Add a unit test covering the chosen rule in `tests/bin-lib/code-health/scope.test.js`, in the style of the existing `listSlices excludes .claude and .worktrees` test.

## Acceptance Criteria

1. `.devcontainer`, `.github`, `.husky`, `.vscode` no longer appear in `listSlices`' output for this repo.
2. Enumerate `listSlices` before and after the change and diff the id sets — the change must not drop a slice that currently contributes judgeable source in this repo.
3. A new unit test in `tests/bin-lib/code-health/scope.test.js` covers the chosen rule.
4. The change composes with `splitOversized` — an excluded directory must not reappear as a split child.

## Technical Approach

Modify `SKIP_DIRS`/`listSlices` in `bin/lib/code-health/scope.js` per the chosen rule (validate against the live file before implementing — the rule choice affects implementation shape, and this repo's own directory set should confirm which candidate is safe). Prefer the narrow "zero `SOURCE_EXTS` matches" rule unless the broad dot-directory rule is shown safe against this repo's actual top-level directories, since the narrow rule targets the actual defect without a name list to maintain. All current consumers of `listSlices` (`resolveArea`, the slicing loop) live inside `scope.js` itself, so the change is self-contained to that file plus its test.

## Gotchas

- The two candidate rules are not equivalent — a broad dot-directory skip risks silently dropping a real source directory that happens to start with `.` (e.g. a hypothetical `.config/`); confirm against this repo's live directory set before committing to the broad rule.
- This is a low-severity waste fix, not a starvation fix — do not conflate with or reopen #130.
- The original issue text named the test file as `bin/lib/code-health/tests/scope.test.js`; the actual path is `tests/bin-lib/code-health/scope.test.js` (verified against the live tree) — corrected above.

## Original request

code-health slicer emits config dot-directories as rotation candidates

**Summary:** code-health's slicer emits config dot-directories (`.devcontainer`, `.github`, `.husky`, `.vscode`) as first-class rotation candidates, spending audit slots on directories with little or no judgeable source.

**Type:** Task

**Affected component:** `bin/lib/code-health/scope.js` — `SKIP_DIRS` / `listSlices`

**Origin:** Deferred from #130's wrap-up reflection. #130's body raised this as a compounding factor; the rotation-starvation half was fixed in 6.39.1, this half was left.

**Correcting the premise:** #130 described the offenders as "build-output and tool-cache directories." That framing is wrong, and acting on it directly would have been a no-op — `SKIP_DIRS` already excludes `node_modules`, `dist`, `build`, `coverage`, `.next`, `.turbo`. The directories actually observed consuming slots (`.devcontainer`, `.github`, `.husky`, `.vscode`, per #130's own repro narrative) are config dot-directories, which `SKIP_DIRS` does not cover.

**Severity is much lower after 6.39.1.** Before the rotation fix these four sat at the front of the *only reachable window*, so they consumed a large fraction of all audits a repo would ever get. Now they are four low-value slices in a rotation that reaches every candidate, costing four slots per full sweep. That is waste, not starvation — which is why this is filed separately rather than reopening #130.

**Acceptance criteria (to be validated against the live file before implementing — see `[IL-71]`):**

1. Decide the rule deliberately rather than extending `SKIP_DIRS` by name. Two candidate shapes, and they are not equivalent:
   - Skip dot-directories by default (broad; would also skip a hypothetical `.config/` holding real source).
   - Skip a directory that yields zero files matching `SOURCE_EXTS` (narrow; targets the actual defect — nothing to judge — and needs no name list to maintain). Note `.github` typically holds YAML workflows, not `SOURCE_EXTS` matches, so the narrow rule likely catches it.
2. Whichever rule is chosen, confirm it does not drop a slice that currently contributes judgeable source in this repo — enumerate `listSlices` before and after and diff the id sets.
3. Add a unit test covering the chosen rule in `bin/lib/code-health/tests/scope.test.js`, in the style of the existing `listSlices excludes .claude and .worktrees` test.
4. Confirm the change composes with `splitOversized` — an excluded directory must not reappear as a split child.

