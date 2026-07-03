# Hook Surface for claude-tweaks — Pipeline Continuity + Enforcement

**Date:** 2026-07-03
**Status:** Approved (brainstorm 2026-07-03)
**Origin:** Deep-research pass on the Cherny/Sumner "Code w/ Claude SF 2026" workflow patterns concluded hooks are the highest-leverage adoption for this plugin: Claude Code exposes ~30 hook events and the plugin registers exactly one (`SessionStart` → deps check).

## Problem

claude-tweaks defines behavioral contracts (auto-mode tiers, working-directory discipline, subagent output contract, pipeline run-dir state) but relies entirely on the model to self-police them. Hooks can make the highest-value contracts mechanical. The constraint: no harness bloat — hooks ship to every project where the plugin is enabled, so each one must be justified against firing in arbitrary repos, and latency must be paid only where value is delivered.

## Decisions (from brainstorm)

1. **Job of hooks:** pipeline enforcement as the spine, plus a small always-on set that is project-agnostic by construction — hooks key off *plugin-owned state* (`.claude-tweaks/` run dirs, `$PIPELINE_RUN_DIR`), never off project structure. Ruled out: project-dependent automation (formatters, test runners — that is `/test`'s and user-level hooks' job) and harness-behavior guards (duplicate what the harness already does).
2. **Enforcement posture:** severity-tiered, reusing the auto-mode contract's reversibility/severity logic — block only what is expensive to reverse, warn where the agent can self-correct, log everything else. Hooks mechanize `_shared/auto-mode-contract.md`; they do not invent new policy.
3. **Architecture:** single dispatcher (`bin/hooks.js <event>`) with logic modules in `bin/lib/hooks/`, following the established `bin/recon.js` CLI + lib + `node --test` pattern.

## Hook set (6 registrations)

| # | Event + matcher | Tier | Job |
|---|----------------|------|-----|
| A1 | `SessionStart` | inform | Absorbs the existing deps.js check (one spawn, both jobs), then detects stale/interrupted pipeline runs in `.claude-tweaks/pipelines/` and injects "unfinished `/flow` run" context |
| A2 | `SessionEnd` | log | Marks the active run dir clean/interrupted in `run-state.json` — ground truth for A1 |
| A3 | `PreCompact` | log | Writes a pipeline-state breadcrumb so compaction cannot lose where a `/flow` run was |
| E1 | `PreToolUse`, Bash matcher scoped to `git commit` / `git push` | **block** | Working-directory discipline: deny commits targeting the wrong checkout during parallel dispatch, corrective reason fed to the agent |
| E2 | `PostToolUse`, same matcher | log | Commit breadcrumb (hash, checkout, agent) to the run dir — feeds Actions Performed and the Review Console |
| E3 | `SubagentStop` | warn | Subagent Contract status-line compliance check — best-effort only (upstream reliability bug #27755), never blocking |

E1–E3 gate on `$PIPELINE_RUN_DIR` in-script and exit in ~1ms of script time outside pipelines. A1–A3 fire at most once per session at moments where no one is waiting on latency.

**Explicitly dropped:** `FileChanged` watchers for auto-triggering `/visual-review`. Hottest available event (hundreds of fires per `/flow` run), "UI paths" are project-dependent (breaks the agnostic rule), and the review step already computes UI-touching diffs from git.

**Deferred (revisit, not rejected):** `WorktreeCreate`/`WorktreeRemove` registration of desktop-managed worktrees (speculative until desktop parallel sessions are in real use); always-on `SubagentStop` scoped to plugin agent names via matcher (matcher only sees `general-purpose` for generic Task dispatches, so coverage would mislead).

## Dispatcher architecture

`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" <event>` — every hooks.json entry points at the same entry point.

- Reads the hook's stdin JSON once; resolves shared context once: `$PIPELINE_RUN_DIR` from env, else newest run dir that is not terminal (terminal = `run-state.json` present with status `clean`, i.e. `/wrap-up` or `SessionEnd` closed it out).
- Routes to one module per event: `bin/lib/hooks/session-start.js`, `session-end.js`, `pre-compact.js`, `pre-tool-use.js`, `post-tool-use.js`, `subagent-stop.js`.
- deps.js keeps its exports (existing tests stand); `session-start.js` calls into it.

**Cardinal invariant: a hook must never break a session.** Top-level try/catch; best-effort writes (same philosophy as recon's best-effort persistence); always exit 0. The only deliberate non-zero exit is E1's deny. Malformed stdin, missing run dir, fs errors → silent exit 0.

### Tier → output protocol

| Tier | Mechanism |
|------|-----------|
| block | E1 only: PreToolUse deny (exit 2 / decision JSON) with corrective reason on stderr |
| warn | Non-blocking error context returned to the agent (hook JSON output) |
| inform | `additionalContext` injection (A1) |
| log | Append to run-dir files, exit 0 silent |

## E1 — working-directory discipline (the only blocking hook)

- Active only when `$PIPELINE_RUN_DIR` is set **and** coordination state declares worktree assignments.
- Parses the Bash command for `git commit`/`git push` subcommands; resolves the target checkout from explicit `git -C <path>`, `cd X && …` chains, or the session cwd in the hook input.
- Denies **only on a provable mismatch** between target checkout and assigned worktree, with a corrective reason naming the expected path.
- **Ambiguity resolves to allow + log.** A false-positive freeze during an unattended overnight `/flow` run is strictly worse than a missed catch — which E2's breadcrumb still records for the Review Console.

## Data flow — one new file, not three

- **`events.jsonl`** (per run dir, append-only, single format): all hook modules write typed events — commit breadcrumbs (E2), contract violations (E3), compact/session markers (A2/A3). Consumers: `/wrap-up` Actions Performed generation, Review Console.
- **`run-state.json`** (per run dir): sessionId, lastEvent, `clean` | `interrupted`. Written by A2/A3, read by A1.
- `decisions.md` unchanged — it remains the human-readable auto-decision log; hooks do not write prose to it.

## Docs, conventions, release

- CLAUDE.md: structure entries for `bin/hooks.js` + `bin/lib/hooks/`; a short "Hooks" convention block (tier policy, events.jsonl contract, never-break-the-session invariant).
- `_shared/auto-mode-contract.md`: cross-ref — hooks mechanize the tiers.
- `_shared/pipeline-run-dir.md`: add `events.jsonl` + `run-state.json` to the run-dir contract; `_shared/git-discipline.md` and the Working Directory Discipline section of `_shared/subagent-output-contract.md` gain a note that E1 mechanically enforces the worktree assignment they describe.
- Worktree assignment is not currently persisted anywhere — `skills/build/worktree-setup.md` gains a `record-worktree` call after base verification, and the finish/merge path gains a clear step, both via auxiliary dispatcher subcommands (`node bin/hooks.js record-worktree <path>` / `close-run`), so run-state has a single writer.
- README hook-surface mention; minor version bump (5.0.0 → 5.1.0 — CLAUDE.md's "v4.20.0" header is stale and gets corrected in the same pass) + marketplace mirror per release procedure.

## Testing

- Per-module `node --test` units: fixture stdin JSON, temp run dirs, asserted exit codes and JSON outputs.
- E1 gets the deepest suite — command parsing: `git -C`, `cd x && git commit`, chained subcommands, `push` vs `commit`, ambiguous cases MUST allow.
- One invariant test across all modules: garbage stdin → exit 0, no stderr.

## Risks and validation gates

1. **Matcher granularity (implementation step 1, empirical check).** Design assumes hooks.json matchers can target Bash *command content* (`git commit`-level), per mid-2026 docs. If the live harness only matches tool names, the dispatcher would spawn on every Bash call — exactly the bloat this design forbids. Fallback: drop E1/E2 to skill-driven checks rather than ship them hot.
2. **#27755:** `SubagentStop` fires unreliably for Task dispatches → E3 is best-effort logging by design, never load-bearing.
3. **Stdin schema drift** across Claude Code versions → defensive parsing; the invariant test covers it.
