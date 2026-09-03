---
record: 658
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 658: worktree-always gate: verb-aware read-only allowlist for loops, and exempt the plugin's own hooks.js launcher

Surface: backend

## Current State

- The `worktree-always` PreToolUse gate (`bin/lib/hooks/pre-tool-use.js` + `bin/lib/hooks/git-command.js`) enforces isolation for exactly the coverage `_shared/policy-schema.md`'s canonical `<!-- gate-coverage:begin/end -->` block states and `GATE_COVERAGE` mirrors in code: `Edit`/`Write`/`NotebookEdit`, git `commit`/`push`, and Bash write-shapes `cp`/`mv`/`tee`/`sed`/`perl`/`install`/`ln`/`truncate`/`dd` (`WRITE_SHAPES`, `git-command.js:296`).
- `git push` is deliberately ungated by flag or shape today — `gitTargets()` treats every `push` sub-command identically regardless of arguments, and `policy-schema.md`'s "Consequence for procedures" paragraph states "git push stays gated regardless" as a deliberate design choice, including after `close-run` clears a worktree assignment. There is no existing carve-out for a content-free, ref-only operation like a branch-delete push (`git push <remote> --delete <branch>` / `git push <remote> :<branch>`).
- Separately, and this is the fact-check that reshapes this record's scope: the observed denials for `for`/`while` loops, multi-command Bash, and the `node bin/hooks.js record-worktree` launcher are **not produced by this plugin's own code**. `hooks/hooks.json`'s PreToolUse matchers spawn `pre-tool-use.js` only for a fixed, verb-anchored allowlist of leading command words (`git commit`/`push`/`-C`/`-c`/`--exec-path=`/`--namespace=`, `git worktree`, `cp`, `mv`, `mkdir`, `tee`, `sed`, `perl`, `install`, `ln`, `truncate`, `dd`) — there is no `Bash(node *)` matcher and no unconditional `Bash(*)` matcher (that trade-off was measured and declined for bare redirection, per `policy-schema.md`'s own cost note). `fileWriteTargets()`/`gitTargets()` never recognize a `node` invocation or loop syntax as a write shape either. A bare `node bin/hooks.js record-worktree ...`, or a `for`-loop of read-only `gh` GET calls, therefore never reaches this hook at all (verified against the current `WRITE_SHAPES` constant and `hooks/hooks.json`'s matcher list). Those refusals are the Claude Code CLI harness's own compound-Bash-shape restriction inside a worktree-isolated session — independent of this plugin, and not configurable from this repo — already tracked by #538 (rewrite skill snippets as single-command CLI entry points) and #640 (document the constraint at worktree-entry time). This record's originating session conflated the two systems because both fired in the same run under the same "worktree-always" umbrella.

## Deliverables

1. Decide whether `git push <remote> --delete <branch>` (and the equivalent `git push <remote> :<branch>` refspec-delete form) should be exempted from the worktree-always gate's `push` coverage as a content-free, ref-only operation — analogous in spirit to the existing policy-only-commit allowlist exemption (#537) but for branch deletion. Record the decision — and, if declined, why — rather than letting scope shrink silently (the same discipline #590's Deliverable 1 uses for its own git-parsing scope call).
2. If exempting: extend `git-command.js`'s `gitTargets()` (or a sibling helper) to recognize the delete-only push shape via a strict allowlist grammar — exactly `git push <remote> --delete <branch>` or `git push <remote> :<branch>`, one branch argument, no other flag, no shell operator (`&&`, `;`, `|`, `$()`, backticks), no env-var prefix, no path to `git` other than the bare word — and thread the exemption signal through to `pre-tool-use.js`'s `checkWorktreeRequired`, fail-closed on anything unprovable (mirrors the existing commit-exemption's discipline). `hooks/hooks.json`'s existing `Bash(git push *)` matcher already spawns the hook for this shape unconditionally, so this is a parser/gate-logic-only change — no matcher update needed, and no #70/#590-style parser-vs-matcher asymmetry risk.
3. Regardless of the exemption decision: improve the gate's deny message for a `git push` target to name the sanctioned fallback for a post-teardown branch-delete — `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}` or `gh pr merge --delete-branch` — instead of (or in addition to) the current generic "set up a worktree and retry this edit inside it" text, which doesn't fit a branch-delete-only push: there is nothing to "retry inside a worktree" once the worktree is already gone.
4. Update `_shared/policy-schema.md`'s worktree-always coverage block and its "Consequence for procedures" paragraph (currently: "git push stays gated regardless") to reflect whichever way Deliverable 1 lands, preserving the canonical-prose/`GATE_COVERAGE`-constant pairing the file already establishes.
5. Out of scope: changing the harness's own compound-Bash-shape refusal (loop denials, the `node` launcher denial). That system is outside this plugin's code and already covered by #538 and #640 — this record's scope is the plugin's own `push` gate only.

## Acceptance Criteria

- Deliverable 1's decision is recorded in the shipped change (a code comment or doc line) even if the answer is "declined."
- If exempted: `gitTargets('git push origin --delete my-branch', cwd)` and the `git push origin :my-branch` refspec form are recognized as exempt from the worktree-always deny in a new `tests/hooks-git-command.test.js` (or sibling) case; a compound or flag-augmented variant (e.g. `git push origin --delete my-branch && rm -rf /`, or an extra positional/flag) still denies, fail-closed.
- `git push origin main` (an ordinary content push) is unaffected — still denied from a non-isolated checkout, per existing coverage.
- The improved deny message (Deliverable 3) is asserted by a test covering the branch-delete-push scenario.
- `_shared/policy-schema.md`'s worktree-always coverage block and "Consequence for procedures" paragraph are updated to match Deliverable 1's decision; `tests/hooks-gate-coverage.test.js` continues to pass (parser/prose agreement).
- No change is made to `hooks/hooks.json`'s matcher list, `WRITE_SHAPES`, or any harness-facing configuration — the record's scope stays inside the plugin's own `push` handling.
- `npm test` passes in full.

## Technical Approach

Follow the existing commit-exemption's discipline (`isPolicyOnlyCommit` in `pre-tool-use.js`, `policy-schema.md`'s "second exemption" paragraph) as the template: a whole-command allowlist grammar match, fail-closed on anything not provably safe. Because `hooks/hooks.json`'s `Bash(git push *)` matcher already spawns the hook unconditionally for every `git push`, this is purely a `git-command.js`/`pre-tool-use.js` parser-and-gate-logic change — the matcher-side risk `#590` documents for its own `FOO=1 git`/`env git` shapes does not apply here, since the matcher already fires for every `git push` regardless of flags.

For the deny-message improvement, reuse `GATE_COVERAGE`-derived text where possible, the same way the current message already composes itself from `GATE_COVERAGE.tools.join('/')` etc., so widening or narrowing the gate can't leave the message describing stale coverage.

### Key Files

- `bin/lib/hooks/git-command.js` — `gitTargets()` (push-action detection), `WRITE_SHAPES` constant
- `bin/lib/hooks/pre-tool-use.js` — `checkWorktreeRequired()`, `GATE_COVERAGE`, the deny message
- `skills/_shared/policy-schema.md` — worktree-always coverage block, "Consequence for procedures" paragraph
- `tests/hooks-git-command.test.js`, `tests/hooks-gate-coverage.test.js` — parser tests and prose/code agreement pin

## Gotchas

- **The record's original ask conflates two different systems, and only one is this plugin's to change.** `hooks/hooks.json`'s matcher grammar only spawns `pre-tool-use.js` for a fixed set of leading command words, and this plugin's hook code has no loop/complexity-shape check anywhere to begin with — the "too complex to verify" refusal quoted in the originating session is the Claude Code CLI harness's own compound-Bash restriction inside a worktree-isolated session, not something `bin/lib/hooks/` implements or can override. #538 already proposes the available mitigation (rewrite skill snippets as single-command CLI entry points); #640 already proposes documenting the constraint at worktree-entry time. Do not reopen either under this record — shaping narrowed this record's scope to the one piece that is genuinely this plugin's own code: the `push` gate's handling of branch-delete pushes.
- **`policy-schema.md` currently states "git push stays gated regardless" as a deliberate design choice, not an oversight.** Deliverable 1's decision is a real policy call (does a ref-only delete carry the same risk as a content push?), not a rubber-stamp. If declined, this record still ships Deliverable 3 (the message improvement) as a standalone friction fix.
- Any new exemption here needs the same two-layer discipline #590 documents for its own git-parsing scope: a parser-only fix the matcher never reaches is dead code that reads like a fix. This case doesn't carry that risk today (the matcher already spawns unconditionally for `git push *`), but a future editor extending this exemption to a different git subcommand must re-verify that assumption rather than copying it blindly.
- #630 (`VAR=` prefix / non-repo-target resolution) and #590 (env-prefixed/path-qualified `git` bypass) are adjacent, independent gate-hardening records touching the same files (`git-command.js`, `pre-tool-use.js`) — check their status before starting to avoid concurrent edits to the same target-resolution logic without awareness of each other.

## Original request

worktree-always gate: verb-aware read-only allowlist for loops, and exempt the plugin's own hooks.js launcher

## Overview

The worktree-isolation Bash gate refuses read-only, non-git commands purely on syntactic shape. Observed in run 2026-08-16T091924-spec-563-564-565-566 (17 error-and-recover events total, ~12 wasted tool calls):

- `for ISSUE in 563 564 565 566; do gh api .../claims/issue-${ISSUE}.json ...; done` — refused ("too complex to verify that it stays inside the worktree") despite being a pure GitHub GET loop with `/tmp` redirects. Same for an equivalent `gh issue view` loop.
- The forced unrolling degraded a post-restart 4-record state check into a 1-of-4 sample presented as a 4-of-4 conclusion — a correctness cost, not just friction.
- The gate also denied the plugin's own `node bin/hooks.js record-worktree --run ...` launcher (whose writes land in `.claude-tweaks/pipelines/`, already on the gate's own exemption list) and, post-teardown, `git push origin --delete` for a merged branch — forcing a `gh api -X DELETE` fallback.

Related (different angles on the same gate): #538 (single-command forms), #630 (VAR= prefix false positives), #640 (document the constraint), #590 (bypass shapes), #596 (run-dir appends refused).

## Suggested shape

Make the shape check verb-aware rather than syntax-aware:

1. Allow `for`/`while` loops and command lists when every command resolves to a read-only allowlist (`gh issue view`, `gh api` GET, `jq`, `printf`, `grep`, `sed -n`) and redirects target only `/tmp` or the session scratchpad.
2. Exempt `node "$CLAUDE_PLUGIN_ROOT"/bin/hooks.js` invocations — denying the launcher contradicts the `.claude-tweaks/pipelines/` carve-out that already covers its writes.

**Origin:** `/claude-tweaks:feedback` session evaluation (Friction lens), run 2026-08-16T091924-spec-563-564-565-566.

**Files:** bin/lib/hooks/ (worktree gate), skills/_shared/policy-schema.md (worktree-always coverage block)

