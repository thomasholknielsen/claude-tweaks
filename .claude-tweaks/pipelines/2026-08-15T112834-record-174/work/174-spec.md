---
record: 174
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-65b07cd5
surface: backend
---
# 174: worktree.always gate: read-only compound Bash commands refused as "too complex to verify"

Surface: backend

## Current State

The exact refusal quoted in this record's Original request — `this command is too complex to verify that it stays inside the worktree; break it into plain, separate commands` — is produced by the Claude Code CLI harness's own `EnterWorktree`-session Bash guard, not by this plugin's `worktree.always` PreToolUse gate (`bin/lib/hooks/pre-tool-use.js`, confirmed by full-text search: the message appears nowhere in this repo's code). The two are easy to conflate, and this record originally was. `bin/hooks.js` has no code path that can change harness-level Bash-tool enforcement, so the fix described in the original report isn't buildable in this repo.

`docs/skill-authoring.md`'s existing "Plugin-root references" section already carries one passing acknowledgment of this fact (a single clause justifying why a `CLAUDE_PLUGIN_ROOT`-resolution fallback ladder was rejected: "worktree-isolated sessions refuse compound commands"), but there is no canonical, discoverable statement of the behavior itself, its actual boundary, or a workaround pattern — agents (and issue triage) rediscover it cold each time.

## Deliverables

- Add a canonical section to `docs/skill-authoring.md` documenting: (1) that this is Claude Code CLI harness behavior, distinct from and outside `bin/hooks.js`'s own `worktree.always` gate; (2) the empirically observed refusal boundary — narrower than "any compound syntax" (single commands, single-substitution commands, pipelines, and 2-command `&&` chains pass; `;`-separated sequences, loops, multiple independent `$(...)` substitutions in one command are refused, regardless of read/write shape); (3) the workaround — one plain command per Bash call inside a worktree session, and for genuine multi-step logic, a scratch script created via the `Write` tool and invoked with a single plain command.
- Update the existing "Plugin-root references" clause to cite the new section instead of restating the fact inline.
- Add a one-line cross-reference from `skills/_shared/worktree-setup.md` (the canonical worktree-procedure file every creation call site already reads) pointing at the new section, per this project's "state a fact once, cite it elsewhere" convention.

## Acceptance Criteria

- `docs/skill-authoring.md` contains a section stating the harness-vs-plugin-gate distinction and the observed refusal boundary, citable by name.
- The "Plugin-root references" section's existing clause cites the new section rather than restating the claim.
- `skills/_shared/worktree-setup.md` links to the new section.
- No code in `bin/lib/hooks/` is changed — this record is documentation-only.

## Technical Approach

Pure Markdown documentation change in two files (`docs/skill-authoring.md`, `skills/_shared/worktree-setup.md`) — no code, no tests to add beyond the existing suite passing unchanged.

## Gotchas

- The exact refusal boundary is empirically observed (tested live in this record's own build worktree, 2026-08-15, against the harness build available then) — it may shift as Claude Code's own harness evolves, and this doc should be read as "the shape as last observed," not a guaranteed contract.
- Keep this doc change from overclaiming: it describes what was observed, not the harness's actual implementation, which this plugin has no visibility into.

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

**Re-triage note (2026-08-15):** re-scoped from a `bin/hooks.js` code fix to a documentation task — see the issue comment for the full finding. The original report's "Affected component" and repro attribution were incorrect; the refusal is Claude Code CLI harness behavior, not this plugin's own gate.
