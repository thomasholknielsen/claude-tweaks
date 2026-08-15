---
record: 174
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: feedback-65b07cd5
surface: backend
---
# 174: worktree.always gate: read-only compound Bash commands refused as "too complex to verify"

Surface: backend

## Current State

The `worktree.always` PreToolUse gate (`bin/hooks.js` / `bin/lib/hooks/pre-tool-use.js`) refuses to allow a Bash command it cannot statically prove stays inside the worktree the moment the command uses any compound shell syntax — `&&` chains, `for` loops, heredocs, or bare parameter expansion — regardless of whether the command actually writes anywhere, let alone outside the worktree. Six concrete shapes were refused in a single session, every one either a pure read or a write into the session's own sanctioned scratchpad (which is outside the worktree entirely and already exempt the way `.claude-tweaks/pipelines/` is):

1. Chained read-only git: `cd <worktree> && git fetch origin <branch> --quiet && echo "..." && [ "$(git rev-parse origin/<branch>)" = "$(git rev-parse HEAD)" ] && echo OK`
2. Loop over greps: `for d in a b c; do echo "--- $d ---"; grep -h -A2 '<pat>' "<dir>/$d/<file>"; done`
3. Parameter expansion only, no filesystem access: `echo "VAR=${VAR:-<unset>}"; echo "VAR2=${VAR2:-<unset>}"`
4. git reads in a loop: `for c in <sha1> <sha2>; do git show --stat --format="" $c; done`
5. Heredoc writing into the session's scratchpad directory: `cat > probe.mjs <<'EOF' ... EOF`
6. Read-only cloud CLI query in a loop: `for x in a b; do <cli> list ... | python3 -c "..."; done`

The gate never permitted anything unsafe — the defect is a usability cost (roughly six extra round-trips in the reporting session), not a correctness gap. The gate bails on compound syntax itself rather than analyzing whether any write target in the command actually escapes the worktree. Related but distinct: #138 covered this gate's coverage being *described* wrongly in skill docs; this is about the gate's runtime false-positive rate.

## Deliverables

- Update the `worktree.always` gate's static-verification logic so it evaluates whether a command's write targets (if any) stay inside the worktree, rather than refusing on compound shell syntax alone.
- Recognize as safe (still enforced, not exempted from the underlying rule — just correctly classified):
  1. Chained read-only git commands (`fetch`, `rev-parse`, comparisons) with no write step
  2. `for`/`while` loops whose body contains only read-only commands (`grep`, `git show --stat`, etc.)
  3. Pure parameter-expansion/`echo` commands with no filesystem access at all
  4. Heredocs (`cat > ... <<EOF`) whose target path resolves to the session's sanctioned scratchpad directory — exempt the same way `.claude-tweaks/pipelines/` already is
  5. Read-only CLI queries piped into further read-only processing, including inside a loop
- Preserve today's refusal for any compound command whose write target cannot be proven to stay inside the worktree (or the scratchpad exemption) — this is a loosening of false positives, not a loosening of the underlying rule.

## Acceptance Criteria

- Each of the six repro shapes above is allowed to run under `worktree.always` without a "too complex to verify" refusal.
- A compound command containing a write to a path outside both the worktree and the scratchpad exemption is still refused, unchanged from today's behavior.
- The existing `worktree.always` gate test suite (`tests/hooks-gate-coverage.test.js` and any sibling PreToolUse gate tests) passes.
- New tests cover each of the six shapes as an allow case, plus at least one negative-control case (an unsafe compound write) confirming it is still denied.

## Technical Approach

Replace the current "any compound syntax → refuse" bail-out with logic that inspects the command for write-shaped constructs (redirection targets, heredoc targets, commands like `git commit`/`rm`/`mv`/`cp` with a destination) and checks each resolved write target against the worktree boundary and the scratchpad exemption — the same boundary check the gate already applies to simple, non-compound commands. Read-only compound constructs (loops/chains/expansions with no write-shaped construct inside) pass through without a target check at all, since there is nothing to verify.

## Gotchas

- This is enforcement logic for a `block`-tier gate (`_shared/auto-mode-contract.md`) — a false negative here (a command misclassified as safe that actually writes outside the worktree) is a security regression, not just a missed convenience. Any new allow-path needs a negative-control test proving it still catches real escapes.
- The scratchpad exemption must key off the session's actual sanctioned scratchpad path, not a hardcoded guess — reuse whatever mechanism `.claude-tweaks/pipelines/` exemption already uses rather than inventing a second one.
- Six shapes are the reported set from one session; treat them as the acceptance floor, not an exhaustive enumeration — other safe-but-compound shapes may surface later and should extend this same classification logic rather than accumulate as one-off special cases.

## Original request

worktree.always gate: read-only compound Bash commands refused as "too complex to verify"

**Summary:** Under `worktree.always`, the PreToolUse gate refuses read-only Bash commands it cannot statically verify, costing a round-trip each to split or rewrite.

**Kind:** Defect

**Affected component:** `worktree.always` PreToolUse gate (`bin/hooks.js`)

**Repro steps:**

1. Enable `worktree.always` in `.claude-tweaks/policy.yml`.
2. Enter a worktree via `EnterWorktree`.
3. Run any compound but read-only Bash command from inside the worktree.

Six shapes were refused in a single session, every one a pure read — or a write to the session's own sanctioned scratchpad, which is outside the worktree entirely:

1. Chained read-only git:
   `cd <worktree> && git fetch origin <branch> --quiet && echo "..." && [ "$(git rev-parse origin/<branch>)" = "$(git rev-parse HEAD)" ] && echo OK`
2. Loop over greps:
   `for d in a b c; do echo "--- $d ---"; grep -h -A2 '<pat>' "<dir>/$d/<file>"; done`
3. Parameter expansion only, no filesystem access at all:
   `echo "VAR=${VAR:-<unset>}"; echo "VAR2=${VAR2:-<unset>}"`
4. git reads in a loop:
   `for c in <sha1> <sha2>; do git show --stat --format="" $c; done`
5. Heredoc writing into the session's scratchpad directory (outside the worktree, and explicitly sanctioned by the system prompt):
   `cat > probe.mjs <<'EOF' ... EOF`
6. Read-only cloud CLI query in a loop:
   `for x in a b; do <cli> list ... | python3 -c "..."; done`

**Expected vs. actual:**

Expected: a command with no write shape at all (git reads, `grep`, `echo`, a list query) passes regardless of compound syntax; a write into the session's own scratchpad path is exempt the way `.claude-tweaks/pipelines/` already is.

Actual: refused with `this command is too complex to verify that it stays inside the worktree; break it into plain, separate commands.` Each refusal costs a round-trip — split the command, or write a scratch script and invoke it. Roughly six extra round-trips in one session.

The gate never permitted anything unsafe; the cost is usability, not correctness. It appears to bail on any compound construct (loops, chained `&&`, heredocs, parameter expansion) rather than analysing whether a write target actually escapes the worktree.

Related but distinct: #138 covered this gate's coverage being described wrongly in skill files. This report is about the gate's runtime false-positive rate.

**Plugin version:** 6.50.0

---

Filed via `/claude-tweaks:feedback`.

<!-- fingerprint: feedback-65b07cd5 -->
