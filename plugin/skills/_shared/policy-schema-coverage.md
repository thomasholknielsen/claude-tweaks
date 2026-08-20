<!-- Sibling of `_shared/policy-schema.md` — its `worktree-always`/teardown gate coverage blocks and the `merge-verification` derivation block, split out per #635 when the parent file pushed against the 40,960 B ceiling. -->

## `worktree-always` coverage — canonical

**This block is the single statement of what the gate intercepts.** Every other file cites it; none restates the list. `bin/lib/hooks/pre-tool-use.js`'s exported `GATE_COVERAGE` constant is its machine counterpart, and `tests/hooks-gate-coverage.test.js` asserts the two agree — so widening the gate fails a test until this block is updated.

That binding exists because the list has drifted before. The gate was widened twice on 2026-07-20 (`push` in `c8f929e1`, `cp`/`mv`/`tee` in `cab6142b`) and neither commit swept the prose describing it; five skill files went on documenting the pre-widening gate, three of them prescribing procedures the widened gate denies (#138).

<!-- gate-coverage:begin -->
- Tools: `Edit`, `Write`, `NotebookEdit`
- Git actions: `commit`, `push`
- Bash write shapes: `cp`, `mv`, `tee`, `sed`, `perl`, `install`, `ln`, `truncate`, `dd`
- Exemptions: `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`, and an allowlisted `policy-only` commit
<!-- gate-coverage:end -->

`sed` and `perl` count only for an **in-place** edit (`-i`, `-i.bak`, `--in-place`, or a bundled `-pi`/`-ni`). A plain read such as `sed -n '…p' file` is not a write and stays allowed everywhere, including the main checkout.

**The cost that buys.** `hooks.json`'s if-matcher can only key on a command *name*, not its flags, so `Bash(sed *)` spawns the hook for **every** `sed` — read-only invocations included, where it resolves no target and allows. That is ~42 ms on each such call (see the measurement below). Breadth was chosen over precision deliberately: a narrower `Bash(sed -i*)` predicate would miss `sed -ni`, `sed --in-place`, and `perl -pi -e`, reintroducing exactly the silent-gap class this covers. A false negative here is invisible; the latency is not.

**What the gate can see at all.** It is a `PreToolUse` hook, so it inspects *tool calls* — `Edit`/`Write`/`NotebookEdit` inputs and the command string of a `Bash` call. Git and filesystem work performed by the plugin's own Node code via `execFileSync` never passes through a tool call and is therefore never gated: `bin/lib/health-core/durable-state.js`'s `git push` to the `health-state` branch is the standing example, and it is correct as written. Do not "fix" such a call by routing it through Bash.

**Not covered — deliberately, and measured.** `git merge`, `git checkout`, `git pull`, `git fetch`, and every other git subcommand pass freely. Two write shapes also remain uncovered, for two different reasons (#70):

- **Bare shell redirection** (`>`, `>>`). It has no command word, and `hooks/hooks.json`'s if-matcher can only recognize a named command — so catching it requires an unconditional `Bash` matcher that spawns the hook on *every* Bash tool call in every session. Measured on `bin/hooks.js pre-tool-use` with a no-target payload, 30 invocations: **42.0 ms idle, 67.9 ms under three concurrent test suites**. The contention figure is the operative one, since parallel worktree sessions are the normal working mode here. Declined on that cost, not on principle — revisit if the hook ever gets meaningfully cheaper.
- **Opaque program strings** (`python -c`, `sh -c`, `awk`). The write target lives inside a program this cannot parse, so no matcher and no latency budget would help.

Do not write a procedure that depends on either gap: they are unpatched holes, not a supported bypass. And do not add a `fileWriteTargets` branch without the matching `hooks.json` if-matcher — the hook never spawns, so the branch is dead code that reads exactly like a fix. `tests/hooks-gate-coverage.test.js` asserts the two lists agree precisely because that asymmetry hid `sed -i` for months.

**Non-bare `git` invocations (#590).** `gitTargets` (`bin/lib/hooks/git-command.js`) recognizes three shapes a real shell treats identically to a bare `git commit`/`git push`: an env-var-assignment prefix (`FOO=1 git commit`), the `env` builtin wrapping the real command (`env git commit`, `env -i git commit`), and a directory-qualified executable ending in `/git` (`/usr/bin/git commit`). Matcher-side coverage for these differs by shape, verified against Claude Code's own permission-rule-syntax docs (`hooks/`'s `if` field reuses that grammar) rather than assumed:

- **Env-var-assignment prefix** — already covered, no `hooks.json` change needed. Claude Code's own matcher strips a leading `NAME=value` assignment before matching an `if` predicate (documented behavior, confirmed against the platform docs); `Bash(git commit *)` already matches `FOO=1 git commit -m x` today.
- **Bare `env git ...` (no flags of its own)** — closed with six new literal `if` predicates mirroring the existing six (`Bash(env git commit *)`, `Bash(env git push *)`, `Bash(env git -C *)`, `Bash(env git -c *)`, `Bash(env git --exec-path=*)`, `Bash(env git --namespace=*)`) in both the `PreToolUse` and `PostToolUse` `Bash` groups — a precise literal addition, not the unconditional-matcher trade-off.
- **Path-qualified (`/usr/bin/git ...`) and `env` with its own flags/assignments (`env -i git ...`, `env FOO=1 git ...`)** — declined, on the same measured cost as bare shell redirection above. The matcher grammar can only key on a literal leading command word (or a documented, finite set of stripped wrappers/assignments) — it has no way to express "any path ending in `/git`" or "`env` followed by an arbitrary run of its own flags." Enumerating every real-world git install path is incomplete by construction; an unconditional `Bash` matcher would catch it, but pays the same ~42 ms idle / ~68 ms contention cost measured above on *every* Bash call project-wide, to close a shape that (unlike redirection) requires deliberate, unusual invocation to reach in the first place. `gitTargets` still recognizes these two shapes — the parser is not dead code for them, only unreachable via this hook alone until this trade-off is revisited.

**The two exemptions.** File writes targeting a path under the repo's own `.claude-tweaks/pipelines/` are allowed from anywhere — that directory is plugin-owned, gitignored pipeline bookkeeping (run config, the auto-decision log, staged proposals), not the project work this gate isolates. It applies to file-write targets only: a `git commit`/`git push` target is the command's *working directory*, so exempting those by prefix would permit any commit merely issued from inside a run dir. The exemption also fails closed — a relative or unresolvable path is never exempt.

The second (#537): an `Edit`/`Write`/`NotebookEdit` — the three file tools only, never a Bash write shape (`tee`/`cp`/`sed -i`/…), which stays gated for this file — whose target, once fully resolved to a real path (symlinks followed, `..` normalized, on-disk casing canonicalized), IS the repo root's `.claude-tweaks/policy.yml` — exact identity, never containment, so a symlinked alias resolves to the same allow and `policy.yml` itself being swapped for a symlink elsewhere resolves to the same deny. Alongside it, `git commit` is allowed when the **entire command string** matches an allowlist grammar — exactly `git commit` plus one or more `-m`/`--message` args and an optional `--no-verify`, in any order, and nothing else: no other flag, no pathspec, no shell operator (`&&`, `;`, `|`, `` $() ``, backticks), no env-var prefix, no path to `git` other than the bare word — **and** the staged set (`git diff --cached --name-status`) is provably one row — an Add, Modify, or Delete of `.claude-tweaks/policy.yml`; a rename or copy *into* that path is rejected on its status letter, since `--name-only` would collapse it to a single misleading line. `git push` stays gated regardless. Both exemptions fail closed: anything unprovable about a path, a command's grammar, or the staged set keeps the deny.

**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy). A merge followed by a push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front. The one exception: an isolated `.claude-tweaks/policy.yml` edit plus its allowlisted, policy-only-staged commit may now both run from a main checkout without a worktree.

## Teardown gate coverage — canonical

**This block is the single statement of what the teardown gate intercepts** (`bin/lib/hooks/pre-tool-use.js`'s `GATE_COVERAGE.teardownTools`/`teardownGitCommands` are its machine counterpart; `tests/hooks-gate-coverage.test.js` pins the two). The gate denies teardown of a worktree recorded as a **non-terminal** (`active`/`interrupted`) pipeline run's assignment — `close-run` is the sanctioned exit, and clearing the assignment lifts the gate. It is run-*targeted* rather than run-independent: it fires only when a recorded assignment matches the teardown target, and every ambiguity (unresolvable target, no match, recorded path gone, corrupt run-state, unconfidently-parsed command) resolves to allow. Foreign-owned runs get a warn instead of a deny, with a `wd-foreign-teardown` event on the target run. The companion warn tier lives in `close-run` itself: closing a run with no recorded wrap-up invocation appends `close-without-wrapup` and prints a warning — never a block, because dispatch's close-before-merge is sanctioned and human-typed wrap-ups leave no ledger event (measured, spec #371 finding (e)). `skills/wrap-up/cleanup-procedures-execution.md`'s Section C closes the run (step 3.6) immediately before removing the worktree (step 4) — the sanctioned exit this gate's own deny message points to.

<!-- teardown-gate-coverage:begin -->
- Tools: `ExitWorktree`
- Git commands: `worktree remove`
<!-- teardown-gate-coverage:end -->

`git worktree` subcommands other than `remove` (`list`, `add`, `prune`, `lock`, …) pass untouched. `git push`/merge are deliberately not gated (dispatch's auto-merge path), and SessionEnd is not hooked (it cannot deny) — that window belongs to the SessionStart run-integrity scan.

## `merge-verification` derivation — canonical

<!-- merge-verification-derivation:start -->
The single prose statement of the derived default (code twin: `bin/lib/merge-verification.js`'s `deriveMergeVerification`; every other file cites this block rather than restating it). Four branches, first match wins, no fall-through:

1. `integration-model` (`_shared/integration-model.md`) resolves `local-merge` → `off`. Short-circuits before any workflow read.
2. No PR-triggered CI → `off`. Detection reads only `{root}/.github/workflows/*.yml|*.yaml` and looks for a top-level `on:` naming `pull_request` or `pull_request_target` in any legal shape — bare string, flow array, block list, or mapping key. Trigger *presence* is a deliberate proxy for "CI verification is requested"; enforcement (branch protection) is out of scope. GitHub Actions-only by intent — a repo on another CI system derives `off` and opts in with the one-line explicit value.
3. Integration branch is the repository default branch → `merge-when-green`.
4. Any other (non-default) integration branch → `off`.

Branches 3–4 obtain both branches through the canonical resolution in `_shared/integration-branch.md` (its rank 3 `integration-branch:` policy key, else the rank-5 GitHub-default half) via the shared code resolver, never a hand-rolled detection. Every failed lookup — no `gh`, API error, no upstream, unreadable workflow file — resolves toward `off`, the permissive default, never toward the stricter value.
<!-- merge-verification-derivation:end -->
