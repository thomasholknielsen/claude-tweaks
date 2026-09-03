---
record: 630
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 630: worktree-always gate denies Bash writes to paths outside the repo when the target is a same-command shell variable — resolve simple VAR= prefixes or exempt non-repo absolute paths

Surface: backend

## Current State

- `bin/lib/hooks/git-command.js` implements the `worktree-always` Bash-write gate's target extraction. `isUnresolvable()` (~line 112) currently treats any raw argument containing `$` (or a backtick, `~`, etc.) as unprovable, and `resolveWriteTarget()`/`resolveCd()` (~lines 135, 240) return `null` for it — so `fileWriteTargets()`/`gitTargets()` report **no target** for a segment like `sed -i ... "$SP/file.md"`, even when a literal `SP=/private/tmp/x` assignment appears earlier in the *same* Bash command. `forEachCommandSegment()` (~line 151) already tracks exactly one thing across segments of a single command — the effective cwd through `cd` — via the mechanism this spec extends to plain variable assignments.
- Verified directly against this repo's current code:
  ```js
  const { fileWriteTargets } = require('./bin/lib/hooks/git-command.js');
  fileWriteTargets('SP=/private/tmp/foo; sed -i "" -e "s/x/y/" "$SP/file.md" && grep -c x "$SP/file.md"', cwd);
  // => []
  ```
  No target is reported, which means `checkWorktreeRequired()` (`bin/lib/hooks/pre-tool-use.js` line 538: `if (!targetPaths.length) return {};`) **allows** the command outright. This is the opposite of the originally-reported symptom (a denial). The reported finding's diagnosis — "the indeterminate-target fail-closed branch" — does not match this code path: `indeterminate` (`pre-tool-use.js` line 566) governs whether `git` itself failed to answer (timeout/fork-refusal/missing binary), not whether a shell variable can be resolved from the command text.
- This fail-open behavior is not accidental — it is the module's deliberate, already-documented safety posture (`git-command.js`'s comment above `WRITE_SHAPES`: "Ambiguity resolves to 'no target' (allow) ... never fabricate a target from a path this can't prove"), and it is pinned by tests that predate this issue: `tests/hooks-git-command.test.js`'s `'a shell-variable cd on its own line, preceded by an unrelated statement, is unresolvable — no target (never falls back to the stale cwd)'` (added 2026-07-12, commit `0c14778d`, five weeks before this issue was filed) and `tests/hooks-pre-tool-use.test.js`'s `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'`.
- The real, verified gap: because a same-command assignment is never substituted, a write whose true target IS inside the current (non-isolated) `worktree-always` repo — e.g. `WT=$(pwd); sed -i ... "$WT/README.md"` run from the main checkout — is *also* silently allowed today, bypassing the gate's entire purpose for that command shape. This is the inverse of the originally-reported symptom: not excess friction, but a coverage gap in the other direction.

## Deliverables

- [ ] Extend `forEachCommandSegment()` in `bin/lib/hooks/git-command.js` to track simple literal variable assignments (`NAME=value`, `NAME="value"`, or `NAME='value'` — one assignment per top-level segment, no `export`, no arrays, no command substitution) across segments of the same Bash command, using the same single-pass mechanism it already uses to track `cd`'s effective cwd: a `Map<name, literal-value>` that persists forward through the command (a later assignment of the same name overwrites the earlier one), with an entry dropped/never recorded whenever the assignment's own value fails the existing `isUnresolvable()` check.
- [ ] Add a substitution step, run before `isUnresolvable()`/`resolveWriteTarget()`/`resolveCd()` classify a raw token: when a token is exactly `$NAME` / `${NAME}`, or has `$NAME` / `${NAME}` as the token's only `$`/backtick occurrence, and `NAME` was assigned earlier in the same command to a resolvable literal, substitute the tracked value before classification proceeds. A token referencing an unassigned variable, or one assigned to an unresolvable value, is left untouched and falls through to the existing (unchanged) `isUnresolvable()`/null-target behavior.
- [ ] Apply the substitution identically to both consumers that already share `isUnresolvable()`/`resolveCd()`/`resolveWriteTarget()` — `gitTargets()` (`cd`/`git -C` targets) and `fileWriteTargets()` (sed/perl/tee/cp/mv/install/ln/truncate/dd targets) — so a same-command variable used in either a `cd`/`-C` argument or a Bash write-shape argument resolves the same way.
- [ ] Update `tests/hooks-git-command.test.js`'s existing test `'a shell-variable cd on its own line, preceded by an unrelated statement, is unresolvable — no target (never falls back to the stale cwd)'`: its command (`MKT="/wt/spec-1"\ncd "$MKT" && git commit -m "x"`) is exactly a same-command literal assignment, so after this change it resolves to `[{ action: 'commit', dir: '/wt/spec-1' }]`, not `[]`. Reword the test title and assertion to state the new, correct expectation. Add an adjacent new test, using a genuinely-unassigned variable (mirroring `tests/hooks-pre-tool-use.test.js`'s `"$SOME_VAR"` case), asserting the original `[]`/unresolvable behavior still holds when no same-command assignment exists for the referenced name.
- [ ] Add new tests to `tests/hooks-git-command.test.js` covering: (a) `fileWriteTargets()` resolving `SP=/private/tmp/foo; sed -i "" -e "s/x/y/" "$SP/file.md"` to `[{ action: 'edit', file: '/private/tmp/foo/file.md' }]`; (b) a dynamic/unresolvable assignment value (`SP=$(pwd); sed -i ... "$SP/file.md"`) still resolving to `[]` (no recursive/dynamic evaluation); (c) a later re-assignment of the same name overriding the earlier one, mirroring the existing `cd`-chain tests' shape.
- [ ] Add a new test to `tests/hooks-pre-tool-use.test.js`, near the existing `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'` test, asserting the gate now **denies** a same-command-variable write whose resolved target is inside the current non-isolated, `worktree-always` repo (e.g. `WT=<repo>; sed -i 's/x/y/' "$WT/a.js"` run from the main checkout, using this file's own `policedRepo()` helper) — the concrete gap this spec closes — plus a companion test asserting the same shape still **allows** when the resolved target is provably outside the repo (the originally-reported command shape, now provable rather than merely defaulted).

## Acceptance Criteria

1. `fileWriteTargets('SP=/private/tmp/foo; sed -i "" -e "s/x/y/" "$SP/file.md"', cwd)` returns `[{ action: 'edit', file: '/private/tmp/foo/file.md' }]` — a same-command literal `VAR=value` prefix is resolved before classification.
2. The same shape with a dynamic/unresolvable assignment value (`SP=$(pwd)`, or `SP` itself assigned from another unresolved `$`-bearing expression) still returns `[]` — no recursive shell evaluation is attempted, preserving the fail-open posture for anything beyond a single literal assignment.
3. Using `tests/hooks-pre-tool-use.test.js`'s `policedRepo()` fixture: a Bash command of the shape `WT=<repo-path>; sed -i 's/x/y/' "$WT/a.js"`, run with `worktree-always: true` from the (non-isolated) main checkout, is **denied** — closing the coverage gap where a same-command variable previously let an in-repo write bypass the gate silently.
4. The same fixture with `WT` assigned a path genuinely outside the repo continues to be **allowed** — no regression versus current (already-allowed) behavior for the originally-reported command shape.
5. `tests/hooks-pre-tool-use.test.js`'s existing `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'` test (the `"$SOME_VAR"`-with-no-same-command-assignment cases) continues to pass unmodified — a variable referenced but never assigned within the command stays unresolvable/allowed.
6. `tests/hooks-git-command.test.js`'s existing `cd`-chain, quote-handling, backslash-handling, and comment-handling tests continue to pass, with the one deliberate exception named in Deliverables (the `MKT=`/`cd "$MKT"` test), whose expectation is updated on purpose, not accidentally broken.
7. `npm test` passes in full.

## Technical Approach

All work is scoped to `bin/lib/hooks/git-command.js`'s shared segment-walk (`forEachCommandSegment`, `resolveCd`, `resolveWriteTarget`, `isUnresolvable`) — the module already documents (header comments, ~lines 5-16) that it deliberately shares state-tracking across segments for exactly this kind of same-command-context problem, today only for `cd`'s effective cwd.

- **Detecting a "simple assignment" segment:** a segment whose first (and only) token, per the existing `tokenize()`, matches `^[A-Za-z_][A-Za-z0-9_]*=(.*)$`, with no leading `export` or other command word and no further tokens in that segment (segments are already split by `splitSegments()` on `;`/`&&`/`||`/newline). Quote-strip the value half via the existing `stripQuotes()`, then re-check it with the existing `isUnresolvable()` — reuse, don't reimplement, the same unresolvable-value classification already applied to `cd`/write-target arguments.
- **Threading the tracked-vars map:** widen `forEachCommandSegment()`'s existing single-pass closure (which currently tracks just `effCwd`) to also carry a `Map<string,string>`, updated whenever an assignment segment is seen, and read at substitution time for every other segment's tokens.
- **Substitution point:** happens at the token level, before `resolveCd`/`resolveWriteTarget` see the raw string. `tokenize()`'s existing quoted+adjacent merge (comment ~lines 73-78) already produces one token like `$SP/file.md` for `"$SP/file.md"` — regex-replace only an exact `\$NAME\b` or `\$\{NAME\}` occurrence, and leave the token untouched (still unresolvable) if it contains any *other* `$`/backtick.
- **No chaining:** substitution is never recursive/transitive — a value that is itself `$OTHER` is not resolved through a second hop. Keeping the decision provably safe is the entire point of scoping this to single literal assignments; chaining reopens exactly the "can we really prove this" question the existing fail-open posture exists to avoid.

## Gotchas

- **This change necessarily changes an existing pinned test's expected result.** `tests/hooks-git-command.test.js`'s `'a shell-variable cd on its own line, preceded by an unrelated statement, is unresolvable — no target (never falls back to the stale cwd)'` test's command (`MKT="/wt/spec-1"\ncd "$MKT" && git commit -m "x"`) is exactly the shape this spec makes resolvable. This is a deliberate, expected test update, not a regression to chase down — do not "fix" the new code to keep that old assertion passing; update the test per Deliverables instead.
- **The originally-filed issue's diagnosis does not match the code.** #630 attributed the observed friction to "the indeterminate-target fail-closed branch" (`pre-tool-use.js`'s `indeterminate` handling, driven by `wtDetect.repoInfo()` — a `git`-process failure/timeout signal). A same-command shell-variable target is `[]`/no-target (fail-**open**, allow) — verified directly against current code, and pinned by tests since 2026-07-12, five weeks before this issue was filed. Whatever the reporting agent actually observed being denied, it was not this mechanism. Do not build toward "stop denying this shape" as the goal — it is not denied today. The value this spec delivers is the opposite-direction fix: making the gate correctly *deny* when a same-command-variable target is provably inside the repo, which today it silently is not.
- **Don't widen resolution beyond the current command's own text.** `tests/hooks-pre-tool-use.test.js`'s `"$SOME_VAR"` case has no same-command assignment for `SOME_VAR` — it's the "referenced but never assigned in this command" case, and must stay unresolvable/allowed after this change. There is no way to know a real *environment* variable's value from the command string alone, and pretending otherwise would fabricate targets — the exact failure mode `[IL-50]` (cited at `tests/hooks-pre-tool-use.test.js` ~line 669) already warns against for this file.
- **Implement once, in the shared path.** `resolveCd`/`resolveWriteTarget`/`isUnresolvable` are deliberately shared by both `gitTargets()` and `fileWriteTargets()` (module comment, ~lines 129-134) specifically so a future fix to cd-resolution edge cases "can never land in one caller and not the other." Implement the variable-tracking/substitution once in the shared segment-walk, not duplicated per caller.

## Original request

worktree-always gate denies Bash writes to paths outside the repo when the target is a same-command shell variable — resolve simple VAR= prefixes or exempt non-repo absolute paths

# Reflect — staged finding 1 (batch pass)

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** full mode, lens "Friction"
**Files:** bin/lib/hooks/pre-tool-use.js

## Finding

Before this run started (main checkout, gate ON), `SP=/private/tmp/...; sed -i ... "$SP/file.md" && grep -c ... "$SP/file.md"` was denied by the worktree-always gate although the target is outside the repo. The same shape had succeeded twice moments earlier; the denial reads as the indeterminate-target fail-closed branch (the target path is a shell variable defined in the same command). A write to /private/tmp is not a covered edit by the gate's own stated policy; fail-closed here is friction, not safety.

## Suggested resolution

Teach the target resolver to substitute simple `VAR=value;`/`VAR=value ` prefixes from the same command before classifying, and/or treat an absolute target that resolves outside the repo root as exempt. Add a test with the exact command shape.

## Decision-log reference

STAGED 15:12:50 — batch reflect Step 3: tangential idea "gate denies non-repo write via same-command variable" — backlog candidate. Surface at the Queue writes gate.

Filed from pipeline run 2026-08-16T122937-spec-332-602-334 (batch reflect (Friction lens)). Surface: backend.

