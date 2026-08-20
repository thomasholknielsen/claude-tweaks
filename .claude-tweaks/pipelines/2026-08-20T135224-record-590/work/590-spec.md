---
record: 590
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 590: worktree.always gate: env-prefixed and path-qualified git (FOO=1 git …, /usr/bin/git …) bypass both the parser and the hooks.json matchers

Surface: backend

## Current State

`bin/lib/hooks/git-command.js`'s `gitTargets` (the function `worktree.always`'s PreToolUse gate uses to prove a `git commit`/`git push` target) only recognizes a shell segment whose *first token* is the literal string `git` — the check is `if (t[0] !== 'git') return;`. `hooks/hooks.json`'s PreToolUse `if` matchers are independently anchored the same way (`Bash(git commit *)`, `Bash(git push *)`, `Bash(git -C *)`, `Bash(git -c *)`, `Bash(git --exec-path=*)`, `Bash(git --namespace=*)`).

Both layers miss three equivalent invocation shapes that a real shell treats identically to a bare `git` command:

- `FOO=1 git commit -m x` (env-var-prefixed)
- `/usr/bin/git commit -m x` (path-qualified)
- `env git commit -m x` (via the `env` builtin)

Verified directly: `gitTargets(cmd, '/tmp/x')` returns `[]` for all three shapes today, and `hooks.json`'s matchers (lines 28-32) never spawn the hook process for any of them — because the matcher grammar can only key on a literal leading command word, not a normalized/parsed one. The result: the entire `worktree.always` gate (commit AND push protection) is silently bypassed for these shapes, independent of and in addition to #537's allowlist work. Filed while red-teaming #537's commit allowlist; related to #70's original two-layer-must-move-together discipline (the `sed -i` bypass, where a parser-only fix without a matching `hooks.json` matcher left the hook process never spawning for a shape the parser could otherwise prove).

## Deliverables

1. Decide whether env-var-prefixed and path-qualified `git` invocations should be gated — they are the same underlying action as bare `git`, and a trivial `FOO=1` prefix defeating a security gate is a real bypass, not a theoretical one. Record the decision (and, for any shape descoped, why) rather than letting scope shrink silently.
2. Extend `bin/lib/hooks/git-command.js` (`gitTargets`, and `forEachCommandSegment`'s `cd`-detection if the same bypass applies there) to normalize `t[0]` before the `!== 'git'` check: skip zero or more leading `NAME=value` assignment tokens, and strip a directory prefix from an executable path ending in `/git`.
3. Update `hooks/hooks.json`'s PreToolUse `if` matchers to fire on the same normalized shapes. Before assuming this is possible: confirm whether the matcher grammar supports anything beyond a literal leading command word. If it doesn't, this is the same trade-off `_shared/policy-schema.md` already measured and declined once for bare shell redirection (an unconditional `Bash` matcher spawning the hook on every Bash call, measured at ~42ms idle / ~68ms under three-way test-suite contention) — re-measure and re-decide for this case rather than assuming the earlier "declined" verdict transfers, since closing a real commit/push-gate bypass is a different cost/benefit than redirection was.
4. Add or extend tests in `tests/hooks-git-command.test.js` (parser-level) and `tests/hooks-gate-coverage.test.js` (parser/matcher agreement) pinning that both layers recognize the same shapes — the same coverage discipline #70 established.

## Acceptance Criteria

- `gitTargets('FOO=1 git commit -m x', cwd)` returns a non-empty target (today: `[]`).
- `gitTargets('/usr/bin/git commit -m x', cwd)` returns a non-empty target (today: `[]`).
- `env git commit -m x` either also returns a non-empty target, or the record's shipped change documents why `env` specifically was descoped, with the reasoning stated (not silently dropped).
- For every shape the parser now recognizes, `hooks/hooks.json`'s PreToolUse matchers also gate it — no shape where `gitTargets` can prove a target but the hook process never spawns (the #70 asymmetry), OR that residual gap is explicitly documented with its measured cost, mirroring the redirection precedent.
- `tests/hooks-gate-coverage.test.js` and `tests/hooks-git-command.test.js` both pass and pin agreement between the two layers for the new shapes.
- `npm test` passes in full.

## Technical Approach

- `bin/lib/hooks/git-command.js`: `gitTargets` (currently `if (t[0] !== 'git') return;`) is the single line the parser-side bypass hinges on. Normalize before that check: strip leading `NAME=value` tokens (pattern `^[A-Za-z_][A-Za-z0-9_]*=`), and reduce a path-qualified executable to its basename when it ends in `/git`. Apply the same normalization to `forEachCommandSegment`'s `cd`-detection (`t[0] === 'cd'`) only if a prefixed/path-qualified `cd` independently defeats effective-cwd tracking — verify before assuming it's in scope.
- `hooks/hooks.json`: the `if` matcher grammar (lines ~28-32 for the git-specific matchers) only keys on a literal leading command name today. Confirm the actual matcher schema's capabilities before committing to a matcher-side fix — read `_shared/policy-schema.md`'s bare-redirection paragraph first, since it's the closest existing precedent and states the measured cost of the unconditional-matcher alternative.
- `env git ...` is a third, structurally distinct shape from `FOO=1 git` — `env` is itself the leading command (`t[0] === 'env'`), and handling it (skip `env` plus any `-i`/`NAME=value` args before the real subcommand) is a separate code path from the assignment-stripping fix for `FOO=1 git`. Don't assume one fix covers both.

## Gotchas

- The matcher-side fix may not be achievable within the existing `if`-matcher grammar without falling back to an unconditional `Bash` matcher — that trade-off was already measured and declined once for redirection (`_shared/policy-schema.md`); re-measure for this case rather than reusing the old verdict, because the benefit side (closing a real commit/push bypass) differs from redirection's.
- Fixing only the parser without the matcher reproduces exactly the #70 asymmetry: `gitTargets` proves a target but the hook process never spawns, so the fix looks complete in a unit test while doing nothing in a real session. `hooks-gate-coverage.test.js` exists specifically to catch this — don't ship a parser-only change as if it closes the gap.
- `env git commit ...` needs its own detection logic distinct from the `NAME=value`-stripping fix for `FOO=1 git commit ...` — treating them as the same fix will silently leave one shape unhandled.

## Original request

worktree.always gate: env-prefixed and path-qualified git (FOO=1 git …, /usr/bin/git …) bypass both the parser and the hooks.json matchers

**Related:** #537, #70

Context: found while red-teaming #537's commit allowlist. `git-command.js`'s `gitTargets` only recognizes a segment whose FIRST token is literally `git`, and `hooks/hooks.json`'s PreToolUse if-matchers are all `Bash(git …*)` — anchored on a leading `git`. So `FOO=1 git commit -m x`, `env git commit -m x`, and `/usr/bin/git commit -m x` produce no target AND never spawn the hook: the entire `worktree.always` gate (commit AND push) is bypassed for these shapes today, independent of #537. Verified: `gitTargets(cmd,'/tmp/x')` returns `[]` for all three; hooks.json lines 28-32 show the anchored matchers.

Scope: (1) decide whether env-var-prefixed and path-qualified `git` invocations should be gated (they are the same action; a bare `FOO=1` prefix is a trivial bypass), (2) if yes, both layers must move together per the #70 discipline — a `forEachCommandSegment`/`gitTargets` change to skip leading `NAME=value` assignments and strip a directory prefix from an executable ending in `/git`, plus matching `hooks.json` if-matchers (note: the matcher grammar can only key on a command NAME, so `FOO=1 git` may need the same unconditional-matcher trade-off `_shared/policy-schema.md` already declined for redirection — measure before deciding), (3) tests in `hooks-git-command.test.js` + `hooks-gate-coverage.test.js` pinning the two layers agree.

