# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, a statusline, and a subagent contract for parallel dispatch.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for the statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier (built-in subagent), agent-browser (optional), git CLI (optional — required only for the statusline git segment), gh CLI (optional — the default transport whenever `work-backend: github-issues` is active: the unified work-record system, the four health-sweep skills' issue filing, and the GitHub PR/issue scans in /tidy and /help all use it. Not a hard requirement since 6.24.0 — a `gh`-absent environment, typically a cloud Routine sandbox, routes the same CRUD surface through `_shared/github-write-transport.md`'s MCP path, with `_shared/issue-claims.md`'s file-blob claim lock standing in for the ref-level one) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

Full directory tree, the per-skill sub-file table, and the command reference live in `docs/plugin-structure.md`. Orientation:

- `skills/{name}/SKILL.md` — skill definition; `skills/{name}/*.md` — sub-files lazy-loaded by that skill
- `skills/_shared/*.md` — cross-skill contracts, criteria, and canonical procedures cited by skills rather than restated
- `bin/` — Node executables; `bin/lib/{name}/` — multi-file modules as flat sibling directories, NOT a nested `_shared/` wrapper (that convention is specific to `skills/_shared/`)
- `hooks/hooks.json` + `bin/hooks.js` — one dispatcher for every hook event
- `tests/` — `node --test` suites; `evals/` — a separate Node project (own `package.json`/`node_modules`), not part of the plugin runtime

## Conventions

### Skill authoring — moved

SKILL.md structure, Interaction patterns (incl. the canonical CSC template), Frontmatter conventions, the Interaction style directive, and Parallel execution directives now live in `docs/skill-authoring.md`. Read it before creating or editing any `skills/**/*.md`.

### Versioning

- Version lives in `.claude-plugin/plugin.json`
- Bump minor version for feature additions, patch for fixes
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional commit prefixes)

### Releasing (two repos)

Invocation: `node bin/release.js <minor|patch> "<summary>"` from clean `main`. The whole-branch review gates the bump — run it before the version bump, not as a later task in the same plan. Full procedure, judgment calls, and the shipped-vs-never-shipped renumber split: `docs/releasing.md`.

### Cross-references

- Every relationship between skills is stated **once**, in `docs/skill-graph.md`. Adding or changing a skill means adding or updating its edges there. Do not restate an edge inside a `SKILL.md`: the bidirectional convention this replaces required each edge in two places, and the two copies drifted
- Workflow diagrams in `/help` must list all skills
- The artifact lifecycle diagram in `/help` and `README.md` must stay in sync
- Prefer describing a list's size by reference ("see the table below") over restating it as a literal count — see the cardinality rule in `## Don'ts`
- A skill reference inside actionable instruction text (a `## Step N` body, a `## Next Actions` block) MUST use the fully-qualified `/claude-tweaks:{skill}` form — the `Skill` tool requires it, and a bare `/{skill}` there fails with "Unknown skill" at invocation time. Bare short-form references (`/{skill}`) are reserved for descriptive prose and Relationship-to-Other-Skills tables, where they're never passed to a tool call.

### Hooks

All hook registrations route through `bin/hooks.js <event>` — one dispatcher, one module per event in `bin/lib/hooks/`. Rules:

- **Never break a session.** Every path — including a PreToolUse deny — exits 0; no module ever sets a non-zero `exit`. A deny is communicated entirely via `hookSpecificOutput.permissionDecision: 'deny'` in the stdout JSON, not the process exit code (see `pre-tool-use.js`'s own header comment for why exit 2 doesn't work for this). New modules must pass the garbage-stdin invariant test in `tests/hooks-dispatcher.test.js`.
- **Tiered posture per `_shared/auto-mode-contract.md`:** block (E1 wrong-checkout commit; the `worktree.always` policy gate), warn (non-blocking systemMessage), inform (SessionStart additionalContext), log (append to the run dir's `events.jsonl`). What that gate covers, what it deliberately doesn't, and its one `.claude-tweaks/pipelines/` exemption are stated once — in `skills/_shared/policy-schema.md`'s `worktree.always` coverage block, pinned to `pre-tool-use.js`'s exported `GATE_COVERAGE` by `tests/hooks-gate-coverage.test.js`. Don't restate the list here or anywhere else; five files did and all five went stale `[IL-93]`.
- **Project-agnostic by construction:** modules key off plugin-owned state (`$PIPELINE_RUN_DIR`, `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`), never off project structure. E1/E2/E3 no-op without a resolved run dir — the `worktree.always` policy gate is the one PreToolUse check that is deliberately run-independent, since its job is to require a worktree even before any pipeline run exists. `post-tool-use.js`'s closing-keyword check (warn tier) is the analogous exception on the PostToolUse side — it fires on any `git commit` regardless of run-dir state, since the gap it catches (a fix commit made outside the structured `/specify` → `/build` → `/wrap-up` pipeline, with no closing keyword) is exactly a commit that would never resolve a run dir in the first place. The deferred-subproject capture check (also warn tier) mirrors this on `Write`: it fires on any write to `docs/superpowers/specs/*-design.md` regardless of run-dir state, since a brainstorming session that hasn't reached `/specify` yet has no pipeline run dir to gate on either.
- **Ambiguity resolves to allow** — E1 denies only provable mismatches. A recorded worktree whose path no longer exists also resolves to allow (fail-open) — tear-down without close-run ends enforcement, not the session. Ownership counts toward provability: `record-worktree` stamps the recording session's id (`CLAUDE_CODE_SESSION_ID`), and a wrong-checkout commit from a *different* session is allowed with a warn (`wd-foreign-session` event) instead of denied; missing identity on either side falls back to deny.
- Run-dir state files written by hooks: `events.jsonl` (append-only typed events) and `run-state.json` (status: active | interrupted | clean, worktree assignment, owning session id). Skills write run-state only through `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree <path>` / `close-run` (plus the one creation-time stamp: wrap-up Phase 1 writes the initial `run-state.json` with `createdBy` when it creates a standalone run dir — no `hooks.js` verb creates run dirs).
- Hook processes are spawned with the harness's own environment, so a `PIPELINE_RUN_DIR` exported inside a Bash tool call does not reach them; hooks instead resolve runs from the Bash call's cwd, and a commit issued from inside a worktree that contains no `.claude-tweaks/` resolves no run dir and is allowed (fail-open).
- **Two resolutions, not one** (`context.js`'s `resolveRun`, since 6.47.0): enforcement reads the newest non-terminal run *regardless of owner* — E1's foreign-session warning exists precisely to tell a bystander the checkout belongs to someone else's worktree. Anything that **writes** (event breadcrumbs, `interrupted`/`lastEvent` stamps) uses the ownership-scoped `ctx.ownedRun` instead: a run owned by another session is never written to, and an unowned run is written to but tagged `attribution: "fallback"`. Ownership is stamped only by `record-worktree`, so runs that never provisioned a worktree stay unowned by design `[IL-96]`.

Referenced by (worktree assignment, enforcement, and `events.jsonl` consumption): `_shared/git-discipline.md`, `_shared/subagent-output-contract.md`, `_shared/pipeline-run-dir.md`, `_shared/auto-mode-contract.md`, `build/worktree-setup.md`, `flow/worktree-merge.md`, `dispatch/SKILL.md` (auto-merge gate clears the run's worktree assignment via `close-run` before merging into the main checkout), `wrap-up/cleanup-procedures.md`, `wrap-up/SKILL.md`, `wrap-up/review-console.md`.

## Philosophy

- **Do it properly.** No display-only workarounds for data model issues, no "good enough" shortcuts that leave technical debt. If a value needs renaming, rename it everywhere including the database. If a type needs changing, change it at the source.
- **Assume zero cost.** Decide as if implementation is free. Never choose an inferior design because the better one "isn't worth the effort."
- **Assume zero time.** Decide as if implementation is instant. Never choose a shortcut because the proper approach "takes too long."
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record (via `/claude-tweaks:capture`) with scope and context. Never silently skip work or leave TODO comments without a corresponding backlog record.

Established codebase distributed to real users via a versioned plugin marketplace. Contract changes (skill frontmatter shape, hook payloads, work-record schema, `_shared/*.md` conventions consumed by multiple skills) follow the same expand-contract discipline as a public API: add the new, migrate every consumer across the repo, remove the old — never a silent breaking rename. A deprecated behavior gets a recorded removal condition (see the Don'ts rule on this), not an indefinite compatibility shim. Prefer stability over novelty in shipped skill contracts — adopt new conventions in new skills first, then migrate existing ones deliberately, with the incident log recording what each migration cost.

## Working Approach

How to execute any task here. These apply project-wide unless a more specific rule or instruction overrides them; use judgment on trivial tasks.

- **Think before coding.** State assumptions; ask rather than guess when uncertain. Push back when a simpler approach exists. Stop when confused.
- **Honest, not agreeable.** When the user proposes a direction, pressure-test it before agreeing — name the weakest assumption first, not the strengths. State disagreement plainly: no flattery openers, no hedging, no reflexive reassurance. If you genuinely can't find a flaw, say so rather than manufacturing one.
- **Simplicity first.** Write the minimum correct code for what was asked — nothing speculative, no abstractions for single-use code. ("Do it properly" above means correct, not more.)
- **Surgical changes.** Touch only what the task requires. Don't reformat or "improve" adjacent code. Match the surrounding style.
- **Goal-driven.** Define success criteria up front and loop until they're verified, rather than following steps blindly.
- **Read before you write.** Before adding code, read the file's exports, immediate callers, and shared utilities — duplicate logic usually already exists nearby.
- **Checkpoint multi-step work.** After each significant step, state what's done, what's verified, and what's left. Don't build on a state you can't describe back.
- **Fail loud.** "Done" is wrong if anything was skipped; "tests pass" is wrong if any were skipped. Surface uncertainty and partial results — never hide them.

## Commands

```bash
npm test                            # Full suite — tests/, every bin/lib/*/tests/ directory, plus tools/upstream-drift/tests/
npm run test:perf                   # Timing budgets (perf/) — deliberately excluded from npm test, see docs/plugin-structure.md
claude --plugin-dir ./              # Local development — load plugin from current directory
```

Per-suite test invocations, the `bin/*.js` CLIs (the four health sweeps plus `record-graph`, `wrap-up-state`, and `release`), and the evals harness commands are in `docs/plugin-structure.md`.

### Subagent Contract (v4.2+)

The contract is **dispatch correctness** discipline, not a token-saving measure: the clean room is what makes N agents independent evidence rather than N echoes, the status line stops a failed dispatch from aggregating as a clean result, and the templates keep aggregation mechanical rather than paraphrased. Costing less to run is a side effect, never the rationale.

Skills that dispatch parallel Task agents must reference `skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model profile selection** (`Fast | Standard | Capable`; `Frontier` only at contract-enumerated singleton slots, never in a fan-out — resolved per the contract's Model Selection section) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Used by `/browse`, `/dispatch` (two sequential Task calls per claimed file-overlap group — `build,test`, then, gated on it, `review,polish,wrap-up`; each has its own minimal GROUP/OUTCOME/MANIFEST template — none of Templates A/B/C fit a pipeline-executing agent; the status line and input discipline still apply (`skills/dispatch/SKILL.md` Step 5)), `/help`, `/init`, `/review`, `/specify`, `/test` (qa-prompts), `/tidy`, and `/visual-review`. When adding a new dispatch site, follow the full pattern, not just the output template.

**Third-party agents are exempt**, on a structural condition: the agent's definition lives outside this repo's `agents/` directory, so it ships with someone else's plugin and is invoked as a delegation. Anything under our own `agents/` is never exempt. The exemption covers the agent only — the caller still normalizes the foreign output at the boundary, checks availability at the *agent* level (plugin presence does not imply agent presence), and distinguishes unavailable / failed / empty / unparseable rather than reporting a clean result. `impeccable-finish-reviewer` is the one such dispatch today (`design-wrapper/modes/review.md` Step 3.7). Full carve-out: the Exemption section of that `_shared` file.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

**Single source of truth:** `skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence/severity floors, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog or parked records, governance gates) — except the narrow, explicit `autonomy` ceiling's bookkeeping capabilities (see `_shared/autonomy-ceiling.md`), which let floor-clearing ledger residue, queue writes, and ops-ack resolve without a click at `trusted`/`unattended`.

**Audit trail:** `skills/_shared/auto-decision-log.md` — every auto-resolution writes a one-line entry to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (`AUTO` / `STAGED` / `KEPT-PROMPT` / `SCANNED`), rationale, and reversibility. The Review Console reads this log.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a decision is decision-worthy, stage it (log it, don't act) and surface at the Review Console. Mid-flow stops are reserved for HARD-GATEs (test failures, spec compliance, structural coupling, plan validation) and the explicit "not silenced" list in the contract.

**Per-pipeline run directory** (collision-safe across parallel agents): `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` contains `config.yml` (Manifesto answers), `decisions.md` (audit log), and `staged/` (proposals awaiting Review Console). Skills locate the active run via `PIPELINE_RUN_DIR` env var or by selecting the most recent matching run. **Project policy** lives in `.claude-tweaks/policy.yml` — the only config home since 6.48.0 — read as defaults by the Manifesto, overridable per-run.

## Design integration

diagram-suggestions: enabled

## Cloud parity

Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config. Two things are required, and the declaration alone is not enough: this project's `.claude/settings.json#enabledPlugins` (paired with `extraKnownMarketplaces`) says what a sandbox may load, and the Setup script below is what actually installs it. The field is confirmed effective for interactive cloud sessions; it was measured not reaching scheduled Routine sandboxes (scope of affected sandbox types unknown) — the routine prompt preamble's self-heal fallback (#260), not this field, is what guarantees a scheduled firing ends in a real result or a diagnosable failure `[IL-117]`.

- **Setup script (required, not optional):** paste the canonical Setup-script line (see `scripts/claude-cloud-setup.sh`'s header) into this project's cloud environment's Setup script field (claude.ai/code environment settings, web UI only — no API/CLI can set this remotely). Installs every declared plugin/marketplace plus `agent-browser`. Regenerated by `/claude-tweaks:init` Step 14; don't hand-edit it. Without it, a declared plugin is simply absent. Confirmed for interactive cloud sessions; measured not reaching scheduled Routine sandboxes — see the paragraph above. This paste requirement applies per *environment*, not per repo — an environment selected in the session composer that has never had this pasted fails this way even for a fully-declared repo `[IL-113]`.
- **Branch:** cloud sessions check out the environment's configured branch (typically `main` here) — declarations only take effect once merged there. Scheduled Routines are pinned independently: each audits the branch it was given at creation.
- **First exposure:** if a skill is uninvocable in a cloud session, run `ls ~/.claude/plugins/` before waiting. Missing directory means nothing installed — the Setup script is absent or failed, and waiting won't fix it. Present and populated but still uninvocable is the transient case, observed once to clear a session later; re-check rather than assuming.
- **MCP servers:** this project's committed `.mcp.json` is what cloud sessions see. Servers configured only in `~/.claude.json` don't reach cloud, and are never auto-copied (they can carry credentials).

## Work records

work-backend: github-issues
work-types: labels

## claude-tweaks Pipeline

**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.

**Entry point:** `/claude-tweaks:specify` — accepts a topic (calls `/superpowers:brainstorming`), design-doc path, or a backlog work-record ref.

**`/claude-tweaks:flow`:** specs only — it rejects design docs. Defaults to `auto` (hands-off); pass `confirm`, `interactive`, or `hybrid` to change that.

**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.

## Don'ts

Rules only — each is a rule plus one clause of why. Where a rule carries an `[IL-nn]` tag, the full post-mortem behind it — which build it bit, how it was caught, what it cost — is in `docs/incident-log.md`.

**Adding one:** write the incident-log entry first, then compress to the rule — writing the rule first pads it, and this file is paid for per dispatched agent, not per session. Allocate the next free `IL-nn` (gaps are fine) and never renumber one that reached `main`; but re-check yours against `origin/main` immediately before pushing — if another session's entry took your number, renumber **yours**, move it below theirs, and sweep your own citations only. **Removing one:** `/claude-tweaks:harness-health`'s rule-expiry check proposes it, and only on positive evidence the hazard can no longer occur — a rule nobody has violated lately is usually one that is working. The incident-log entry stays even when its rule goes.

- Don't add "What's Next?" / "Pick an action" navigation menus at the end of skills — use `## Next Actions` blocks with pre-filled commands
- Don't add per-item decision prompts for lists — use batch tables with "apply all / override"
- Don't create skills without the standard structure (frontmatter, interaction directive, anti-patterns table) — and don't add a relationship table back; its edges belong in `docs/skill-graph.md`
- Don't add one-directional cross-references — always update both sides
- Don't silently skip or drop findings — every surfaced item must be explicitly resolved (fix now, defer, accept with reason)
- Don't put detailed reference content inline in a SKILL.md — extract to a sub-file, cited as "read `{filename}` in this skill's directory". **40 KB is a soft ceiling for a SKILL.md and for each sub-file**: `Read` has no section granularity, so once two stubs cite *sections* of one sub-file, every stub pays the whole file. Split by the unit the stubs name, extract rather than reorganize in place, leave the original heading as a stub so external section/step references still resolve, and confirm every substantive original line survives somewhere — no test reads skill prose `[IL-70]`
- Don't forget to update README.md and `/help` when adding or changing skills
- Don't use emojis in skill files — use `**(Recommended)**` bold text instead
- Don't write to `~/.claude-tweaks/` from skill content — that path is runtime state owned by the harness layer
- Don't dispatch parallel Task agents without inlining a literal output template (Template A/B/C) from `skills/_shared/subagent-output-contract.md` — references won't reach the agent
- Don't dispatch agents running `git` or `node --test` without anchoring the working directory in the prompt — CWD doesn't propagate reliably. Require `cd "$WORKTREE"` plus a `pwd` + `git rev-parse --show-toplevel` check before commit
- Don't invent new mid-flow stops in `auto` mode — stage decision-worthy things to the auto-decision log for the Wrap-Up Review Console; stops are reserved for HARD-GATEs and `_shared/auto-mode-contract.md`'s "not silenced" list
- Don't auto-resolve a decision without writing to the auto-decision log — silent automation without an audit trail is forbidden
- Don't spread parsed external JSON after derived/trusted fields — `{ ...parsed, derived }`, never the reverse; parsed data silently overrides whatever follows `[IL-01]`
- Don't leave a cross-file promise (deferred action, staged artifact, documented lifecycle step) without the same change-set adding the consumer that acts on it — task-scoped review sees one file at a time `[IL-02]`
- Don't write a plan step deleting content justified by "this now lives in Step N" unless Step N's drafted text actually includes it — read it directly, or a reviewer matches the diff to the plan's own wrong instruction and approves `[IL-03]`
- Don't call a producer/consumer task pair complete because each task's own review passed — verify the producer's output shape carries every field the consumer reads; only whole-branch review sees across the boundary `[IL-04]`
- Don't merge or delete branches in the main checkout without verifying `git branch --show-current` in the same compound command — concurrent sessions switch its branch underfoot. Prefer `git push . <sha>:main`; that's refused when `main` is checked out, so use a branch-guarded `git merge --ff-only` there `[IL-05]`
- Don't blanket-ignore a directory that has a committable child — `!` can't reliably re-include a subdirectory of an ignored parent. List transient subdirectories explicitly `[IL-06]`
- Don't dispatch `subagent_type: "fork"` for a narrow task — a fork inherits the whole parent conversation, including any in-progress plan, and acts well beyond your instruction. Use a fresh non-fork agent `[IL-07]`
- Don't trust a fork's own narrative — verify `tool_uses`/duration and real git/`gh` state; reports err in both directions `[IL-07]`
- Don't assume a performance-motivated control-flow reorder preserves correctness because the early return sits in the same place — verify which *value* now reaches any downstream security-relevant check `[IL-08]`
- Don't assume a shared, kind-agnostic function stays generic because the suite is green — a caller can narrow it with zero failures, since the caller that would expose the narrowing doesn't exist yet `[IL-09]`
- Don't assume a phase's file list is complete because every task's diff is self-consistent — grep the wider repo, untouched files included, for prose assuming the OLD state `[IL-10]`
- Don't trust a third-party tool's `.git/info/exclude` exclusion inside a linked worktree — that path is worktree-specific, so state leaks into every other worktree. Use the committed `.gitignore` `[IL-11]`
- Don't let a phase's version bump depend on remembering it — write an explicit bump step into every feature-addition plan, or a concurrent session's bump silently absorbs yours `[IL-12]`
- Don't call `mcp__claude-in-chrome__*` tools in plugin skills — `agent-browser` is the only backend working in both interactive sessions and hosted Routines. Exception: `/browse backend=chrome`, human-invoked only
- Don't call the `Artifact` tool from plugin skills — availability isn't guaranteed across environments, and publishing pushes project content to a third-party link. `/claude-tweaks:visualize` writes standalone HTML instead
- Don't pass `isolation: "worktree"` to the Agent tool when dispatching from inside a worktree already set up for the task — it creates a second, unrelated worktree and orphans the commit. Anchor to the existing path via the prompt
- Don't assume migrating a free-text bulk convention onto `AskUserQuestion` preserves that capability's visibility — the escape hatch lands in an undocumented `Other` field. Restate the hint in the rendered text `[IL-13]`
- Don't reuse an absolute path captured before `EnterWorktree` switched cwd — it still resolves (to the main checkout), so nothing errors; the wrong-checkout hook denies the write instead. Re-derive under the new root
- Don't defer a filesystem write to "wherever this invocation ends" by enumerating termination paths — enumeration misses paths, and prose ordering bugs are invisible to any test suite. State an unconditional rule `[IL-14]`
- Don't audit "does anything fail to handle X" by grepping X — that only finds files already mentioning X, never one whose defect is total silence. Grep the structural pattern `[IL-15]`
- Don't put an unescaped backtick inside a single-quoted alternation in a verification `grep` — the shell reads it as command substitution. Run every planned grep against a sample of the after-state first `[IL-16]`
- Don't consider a stale cross-skill description fixed after correcting its first occurrence — the same fact recurs elsewhere, often reworded, so a keyword grep can't replace reading the whole file `[IL-17]`
- Don't hand-list a skill's reciprocal Relationship entries as a separate design-doc checklist when its drafted table already names them — the two lists restate one fact and drift. Derive the checklist from the table `[IL-18]`
- Don't start `superpowers:subagent-driven-development` with uncommitted work — a later task's `git add` on an overlapping file sweeps both bodies of work into one commit. Commit or stash first `[IL-19]`
- Don't wait until a long-running branch is finished to check how far `main` has diverged — check `git log --oneline <branch>..main` periodically so conflict resolution isn't back-loaded onto the riskiest moment `[IL-20]`
- Don't read `git diff <base>..HEAD --stat` as your own changes once `<base>` has diverged — it mixes in the other branch's commits. Diff against `git merge-base HEAD <base>` `[IL-20]`
- Don't rely solely on a literal-path grep to confirm a terminology retirement — it misses generic-vocabulary occurrences and case variants. Sweep case-insensitively, and bake a bare-word sweep into every dispatch from task one `[IL-21]`
- Don't assume a shell-redirection trick in a skill's bash snippet is portable because your interactive shell accepts it — zsh and bash disagree on repeated same-fd redirection. Verify under `bash -c` `[IL-22]`
- Don't take a request to strip a recently-added compatibility path at face value — check git log for why it was added (often a deliberate fix) and verify against the dependency's *current* instruction file, not its release notes `[IL-23]`
- Don't assert in a design doc how existing, unchanged code or prose behaves without grepping the literal text — a paraphrase can be wrong in ways every task-scoped review trusts rather than re-derives `[IL-24]`
- Don't add a force-select phase to a rotation-based selector without an exclusion at every scope its signal can outlive — ignoring cursor state repeats the pick on every slot of a `--budget > 1` call, and forever if the condition holds until a human acts `[IL-25]`
- Don't treat a session vanishing from `claude --resume` after entering a worktree as a claude-tweaks bug — it's an upstream limitation (`EnterWorktree` pivots session storage). See `_shared/git-discipline.md`
- Don't assume `cd`-ing to a sibling repo inside a Bash command changes which project's `worktree.always` policy applies — the gate resolves from the session's tracked cwd, not the `cd` target. `EnterWorktree` for *this* repo first `[IL-26]`
- Don't trust a markdown insertion by reading the diff — read the rendered result around it. Next to a fenced block a stray sentence lands *inside* the fence; next to prose it can split an existing sentence and orphan its tail `[IL-27]`
- Don't write a "prove the removed pattern is gone" sweep without excluding the plan document — a plan documenting X's removal necessarily quotes X verbatim `[IL-28]`
- Don't let each task in a set of near-identical repeated tasks rediscover a bug an earlier sibling's review already found — patch the remaining briefs before dispatching `[IL-29]`
- Don't build a test-double whose `returns`/`throws` fields are eagerly-invoked IIFEs — they fire before the code under test runs, so the test proves nothing. Make them lazily-called functions `[IL-30]`
- Don't infer whether an optional per-consumer state slice exists from truthiness of an always-present default object — every consumer's default read is truthy, so all of them get it. Gate on an explicit construction-time flag `[IL-31]`
- Don't accept a plan's "duplicate across N≥2 near-identical consumers, no shared module yet" framing as final — extract the shared logic, so bugs in it get fixed once rather than N times `[IL-32]`
- Don't assume `flow/materialize.md`'s ordering (commit the record, then branch the worktree) works under `worktree.always` — the gate denies main-checkout writes with no pipeline-bookkeeping exemption. Create the worktree first, scaffold inside it `[IL-33]`
- Don't chain `git merge --ff-only <branch> && git push` into one Bash call from the main checkout — the hook denies the whole invocation, so the ungated merge never runs either. Issue two calls `[IL-33]`
- Don't write a repo-wide grep exclusion for a *file* as a bare content substring — it drops any line whose *content* mentions that path, swallowing real hits. Anchor to the path position (`grep -v "^path:"`) `[IL-34]`
- Don't approve a data-shape or destructuring fix by re-reading the code — a wrong property name reads as plausible but is silently wrong. Execute it against the real dependency and inspect the output `[IL-35]`
- For a design-mode build (brainstorm → design doc → plans → SDD, skipping `/specify`), keep the design doc and plan under `docs/superpowers/` at wrap-up — nothing consumes them, and bulk pruning is a separate deliberate action (ADR-0007) `[IL-36]`
- Don't assume two paths sharing a directory or a near-identical name belong to the same category — verify each against live cross-references before a bulk delete or rename `[IL-37]`
- Don't write a plan-embedded classifier or pattern-list without checking every entry against the target file's literal text — a pattern can match exactly what that file forbids `[IL-38]`
- Don't write a `grep -rli PATTERN . | grep -v "^./path"` exclusion — `grep -rli … .` returns paths without a leading `./`, so the exclusion silently matches nothing. Anchor to the bare relative path `[IL-39]`
- Don't restate a list's cardinality as a literal in prose ("8-lever", "17 core labels") — no keyword grep catches every reworded restatement when the list changes. Describe the count by reference; if a literal is unavoidable, any cardinality-changing edit owes a broad sweep for numeric restatements `[IL-40]`
- Don't trust a recommendation inferring "still needs action" from "a related file changed" — the change may already be the resolution. Read the matching commit's diff first `[IL-41]`
- Don't assume `git add <files> && git commit` commits only those files — with no pathspec, `git commit` takes the *entire* staged index. Verify `git diff --cached --name-only` immediately before each commit `[IL-42]`
- Don't dispatch parallel implementer subagents assuming file-disjointness makes it safe — their `git add`+`commit` sequences race on one shared index. Sequence dispatches until the prior commit lands `[IL-43]`
- Don't resolve a conflict against a *structural* refactor by picking a side — content still in the old location must be re-homed. Upstream refactored: take its structure wholesale, verify byte-identity, re-apply your additions. *Your* branch refactored and upstream edited the old file in place: the mirror applies — keep your structure, re-home upstream's edits into the new files `[IL-44]`
- Don't take `ExitWorktree`'s commit-count refusal at face value when the branch already merged — it counts against the fork point, not `main`'s tip. Verify by **content** (`git diff <branch> <default-branch>` empty), never by SHA: this repo's usual rebase/squash merges rewrite the commits `[IL-45]`
- Don't let a gitignored SDD/scratch tracking file sit unresolved through worktree cleanup — removal deletes it permanently with no git history to recover from. Surface its content first `[IL-46]`
- Don't compute a git `--since` boundary via `.toISOString().slice(0, 10)` on a possibly-zero timestamp — it yields `"1970-01-01"`, returning zero commits in positive-UTC-offset zones; `@<seconds>` is also wrong (parsed as relative). Use a full ISO 8601 datetime `[IL-47]`
- Don't redo an SDD task from scratch when an implementer's connection dies mid-task — this falls outside the four documented statuses. Verify the edit via `git diff`, then dispatch a recovery agent to verify-and-commit `[IL-48]`
- Don't wrap an entire literal message in backticks when it contains a term also meant to be backtick-quoted — the nesting doesn't escape and splits into disconnected code spans. Use a blockquote `[IL-49]`
- Don't add a verification/gating/resolver helper beside an existing sibling without testing that it fails in the *same direction* on malformed input — "looks like its sibling" isn't "fails like its sibling" `[IL-50]`
- Don't give parallel implementer agents git access when the fan-out is wide — dispatch them edit-only and run every git operation centrally afterward, removing the index race rather than narrowing it `[IL-51]`
- Don't treat a batch of agents each fixing one cross-cutting concern as done when each diff looks right — they can't see each other's edits, so each may leave cross-references claiming the others didn't fix it. Grep centrally `[IL-52]`
- Don't scope a parallel audit's per-skill findings to the audited skill when a finding names a sibling as having the same issue — split it into an entry under each named skill, or that sibling's fix agent never sees it `[IL-53]`
- Don't write a tool-deny guard on an SDK optional field by checking only explicit `true`/`false` — read the doc comment for the omitted default; the Agent SDK's `run_in_background` defaults to `true` `[IL-54]`
- Don't write a renumbering/rename verification grep expecting "no output" — afterwards the new numbers are legitimate content, so presence can't signal staleness either way. Verify topic-consistency instead `[IL-55]`
- Don't assume a design doc's explicit file-touch list survives into the plan it feeds — task-scoped review can't catch an item the plan never scheduled. Cross-check the two lists at plan-authoring time `[IL-56]`
- Don't scope a feature meant to prevent an observed failure down to documenting that failure as a caveat — check at design time that it closes the loop rather than narrating around it `[IL-57]`
- Don't run raw `git worktree remove` on a **locked** worktree — it fails on the lock, and superpowers' cleanup docs show only the raw form. Use `ExitWorktree` for the session's own (always live-locked); `SessionStart`'s reaper collects abandoned ones `[IL-58]`
- Don't stop to ask before completing the marketplace-mirror half of a release — the release procedure **already authorizes both repo pushes as one action**, so pausing risks the mirror never happening `[IL-59]`
- Don't assume a new subsection in a dispatcher-inlined `_shared/*.md` fragment reaches consumers because it's documented there — each consumer's own "what the dispatcher inlines" sentence must name it, or it silently no-ops `[IL-60]`
- Don't derive a *display* project name from the statusline's `workspace.*` paths by basename — `EnterWorktree` pivots them to the worktree. Detect a linked worktree and resolve via `git rev-parse --git-common-dir`'s parent `[IL-61]`
- Don't compute a test's expected value the way the implementation does from the same live environment — it can't distinguish "correct" from "matches current behavior". Derive the expectation independently `[IL-62]`
- Don't design a module assuming MCP tools are callable from a spawned subprocess — they're only invocable from the calling agent's own turn. Signal what needs writing and let the skill's prose drive the call `[IL-63]`
- Don't assume one consumer's call topology generalizes to a similar-looking sibling when designing shared infrastructure — verify each consumer's actual invocation shape before drafting the plan `[IL-64]`
- Don't assume task-scoped review catches every producer/consumer mismatch — it can't catch a same-function self-inconsistency, or prose whose literal retry instructions undo their own precondition via a code side-effect `[IL-65]`
- Don't write a plan-verification grep as a single-line literal match against markdown prose — hard-wrapped text splits phrases across lines, so it returns zero while the phrase is present. Use a whitespace-flexible pattern `[IL-66]`
- Don't assume a tool's `list` action paginates — verify a cursor/limit parameter exists before building a filter on it. When a lookup can't enumerate its domain, add a locally-recorded enumeration as a first-class source `[IL-67]`
- Don't add a resolution source to a multi-source lookup without auditing every bypass flag's own "skip these sources" list — a flag naming sources by identity silently stops skipping the new one `[IL-68]`
- Don't point an in-place transform script at the same file the transform replaces — re-running it (you will) reads its own output as source and can corrupt what it already wrote. Read from an immutable copy `[IL-70]`
- Don't leave "what happens to the artifact this step creates" unresolved when a procedure produces real, billed, hard-to-delete infrastructure — decide at design time whether it's the deliverable or a throwaway needing cleanup `[IL-69]`
- Don't implement an issue body's own suggested fix or acceptance-criteria wording without measuring it against the live files first — it was written against a snapshot and never executed. Check the issue's *premise* too: the fix it asks for may already have shipped `[IL-71]`
- Don't inline a large block into a size-capped file and plan to extract later — when a fix's deliverable is "inline N KB into a prompt," check the host file's budget first and extract to a sub-file the caller inlines *from* `[IL-72]`
- Don't run a health CLI (`bin/{code,harness,journey,docs}-health.js`) with real arguments to test a change — it pushes durable state to the shared `health-state` branch and stamps a rotation cursor suppressing that target for 90 days. Exercise the module or its unit suite instead `[IL-73]`
- Don't read "grep found nothing" as a fact about the code before confirming it's a fact about the file — one stray NUL byte makes grep treat the file as binary and return silently, while `Edit` fails to match text `Read` just displayed. Dump code points `[IL-74]`
- Don't widen what a value can range over without grepping for the invariant its old range encoded — "only ever X" comments and single-value-derived cache keys are records of that range, and both go silently wrong rather than failing a test `[IL-75]`
- Don't treat the bytes moved out of a file as an extraction's saving — measure what each resolved mode loads afterward, since the sub-file's header plus the stub left behind can exceed the branch that mode skips `[IL-76]`
- Don't correct a restated count to match its canonical source without also checking the data printed beside it — where the artifact copies that data, the stale part is the copy, and a "right" number contradicting what the reader sees is the worse failure `[IL-77]`
- Don't add a compatibility path without recording the condition under which it gets removed — with no stated end date nothing ever collects it, and a half-maintained alias produces silently wrong behavior rather than an error `[IL-85]`
- Don't treat a passing verification as evidence without measuring what it examined — a check that would pass on any input is most seductive when it agrees with the conclusion you wanted `[IL-78]`
- Don't grep a placeholder as a fully-delimited token — `{result}` cannot match the populated `{result: ...}`, so "zero occurrences" describes the grep, not the file. Search the bare name, and open the file before recording any absence `[IL-79]`
- Don't write a test that reads live production content you intend to change — "this real file currently contains X" is a scheduled failure timed to the migration, so the test is gone exactly when the change is riskiest. Freeze the input as a fixture `[IL-80]`
- Don't cite a figure from a plan's own measurement command without checking its boundary behavior — a design doc generated by the same command corroborates nothing `[IL-81]`
- Don't edit a reference in a dispatcher-inlined file without confirming which region actually gets inlined — a test suite's own split point tells you `[IL-82]`
- Don't place a special-case exemption after an early return that can claim the same value — the exemption only runs on whichever branch you didn't put it after `[IL-83]`
- Don't add a `bin/lib/{name}/tests/` directory without adding its glob to `package.json`'s test script — an enumerated list of globs doesn't pick up a new one on its own `[IL-84]`
- Don't let a renumber that happens *inside* a conflict resolution skip the cross-reference sweep — the diff under review is scoped to the hunks, so references to the old number elsewhere in the same file can't appear in it `[IL-86]`
- Don't treat a conflict-free merge as a merge whose intent landed, when your side moved content — upstream's deletions apply cleanly to locations that no longer hold it. Diff the merge base against upstream, collect every deleted line, and grep each against your whole tree `[IL-87]`
- Don't publish a plan's prewritten completion claim without re-verifying each item against the tree — the claim was authored before the work, in the plan's own voice, which is what makes verification feel redundant `[IL-88]`
- Don't read an idempotent updater's success as evidence the artifact changed — `claude plugin update` compares a version string against the *local* catalog and exits 0 having inspected no files. Resolve the running build from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, never from install metadata or `gitCommitSha` `[IL-89]`
- Don't let "all N sources' suites still pass" close an extraction — parity proves the move, not the behavior, and N implementations agreeing is exactly when a shared bug reads as the spec `[IL-90]`
- Don't write `"$ref:path"` in a zsh command — `:s` is a parameter-expansion modifier, so the string is mangled and the command returns empty instead of erroring; brace it as `"${ref}:path"`, and drop `2>/dev/null` while exploring `[IL-91]`
- Don't read a fail-open branch's comment as the full list of causes reaching it — it stays true while going incomplete, so a transient cause on a permanent-sounding branch suspends the policy silently `[IL-92]`
- Don't widen an enforcement mechanism without sweeping the prose describing its old reach — those claims were true when written, and keyword search can't find a procedure whose defect is silence `[IL-93]`
- Don't attach a step that hangs off an automated event to prose alone — bind it to that event, or it runs at whatever rate memory supplies `[IL-94]`
- Don't move where a value is *read from* without moving where it's *written* in the same change — a reader-keyed audit cannot find the writer, whose defect is that it names the new location nowhere at all; `[IL-04]` for output shape, this for output location `[IL-97]`
- Don't edit data to satisfy a failing check before confirming the check against a source that doesn't share its assumptions — a check is a hypothesis too, and "the suite is green now" is guaranteed either way `[IL-95]`
- Don't let a fallback that *guesses* which record to use also *write* to it — check whether the write is one of that path's own future inputs; a self-feeding wrong guess latches instead of being wrong once `[IL-96]`
- Don't promote a behavior observed on every available run to a guarantee — read what the emitting code gates it on, since measuring the observation against live files (`[IL-71]`'s check) confirms it either way `[IL-100]`
- Don't trust a `--first-parent` walk as release history — a branch that merges `main` into itself and is pushed as `main` moves everything since the fork point onto the second parent, so versions *leave* the set. Read `docs/shipped-versions.tsv`, and catch branches up by rebasing `[IL-95]`
- Don't read the version pre-check's three sources as complete — an already-executed bump on unpushed local `main` is on no branch, in no plan, and absent from `git log origin/main` `[IL-98]`
- Don't trust a merged counter that both branches raised from the same base — identical text merges silently while the value is short by the other side's contribution, and only the prose around it conflicts. Recompute it `[IL-99]`
- Don't reuse a set as the gate for a second decision without restating its membership criterion against the new question — near-total overlap hides the one case where the criteria diverge, and that case can be the largest bucket `[IL-101]`
- Don't read a committed artifact from the working checkout without first establishing the checkout is current — `git status` and `git branch -vv` measure against the stale remote-tracking ref, so a badly-behind checkout looks clean. Fetch first or read from the ref, and gate any resulting stop on a *verified* comparison so offline degrades instead of blocking `[IL-104]`
- Don't add an instruction to a procedure without confirming the nearest thing that *executes* — a command block, a serializer, a payload builder — carries the new item; "the step above says to do it" is not a mechanism `[IL-102]`
- Don't adopt a neighbouring convention before stating its common case and checking yours matches — borrowing the idiom of a convention whose common case is *present* stamps a presence-only marker on every record, destroying the signal `[IL-103]`
- Don't treat a check's green as evidence before naming what its red would look like — a count-based grep, a suite that never loaded the file, and a sweep that silently dropped part of its input all pass identically either way `[IL-105]`
- Don't trust a new worktree's base, and don't expect a prior `git fetch` to fix it — a worktree came up four releases behind a ref fetched seconds earlier. `git merge origin/main` inside it, first action, every time `[IL-106]`
- Don't start a record after checking only branches, claims, and labels — a live session's unpushed work is invisible to all three. Enumerate `git worktree list --porcelain` and `ps` its lock-owning pids `[IL-107]`
- Don't verify a content assertion by checking it matches the prose you just wrote — that is guaranteed. Negate the prose and assert the regex *fails*, one claim at a time (a multi-assertion test short-circuits); bare tokens and wide `[\s\S]{0,N}` windows routinely survive inversion `[IL-105]`
- Don't put a long-running command between an implementer subagent's last edit and its commit — they stall at exactly that wait, leaving work uncommitted. Commit after focused tests; run the full suite centrally `[IL-108]`
- Don't close a hazard you noticed with a mitigation you did not execute — a remedy can create a worse instance of the same hazard, and "resolved" is what stops anyone re-deriving it `[IL-111]`
- Don't believe a check's red before checking the check — it asserts the code is broken *and* the harness sound. Suspect the harness first when the change altered how many calls the code makes, or in what order; `[IL-105]` is this pointed at green `[IL-112]`
- Don't batch many records into one `/flow` run where concurrent sessions ship — a record's stated facts expire while it waits its turn. Re-verify each record's premise immediately before its own build `[IL-109]`
- Don't state a total for a domain your lookup can't enumerate, and never let a neighbouring set's cardinality supply it — a borrowed count is plausible and unrefutable, so it survives every re-read `[IL-110]`
- Don't ship the config that *grants* a capability as the fix without finding what exercises it, and don't assume that exerciser covers every consumer class — `enabledPlugins` is a permission, the Setup script is the installer `[IL-113]`
- Don't hand-roll a fix in a domain this plugin already automates — grep `skills/` for the capability first, since it has usually shipped already `[IL-113]`
- Don't trust a "render this, then call the tool" instruction to bind itself at runtime — nothing stops the tool firing from a response that never rendered the content, and an approval never implies a differently-scoped write is authorized. State an explicit pre-call check for the first, a dedicated per-decision approval for the second — `[IL-102]`'s hazard at the interaction boundary `[IL-114]`
- Don't gate a repair loop's drift check on "a comparison value could be resolved" — a resolution *failure* and a legitimate *absence* can degrade to the same sentinel, so a total non-install passed as "ok" when the lookup that would have flagged it failed for the same reason. Gate on the unambiguous signal (`installed === "none"`) directly `[IL-115]`
- Don't call `ExitWorktree`/`git worktree remove` directly to finish a pipeline-run worktree, even after verifying no commits are lost — it skips `cleanup-procedures.md` Section C step 3.5's Transitional guard, permanently destroying the run's gitignored `config.yml`/`decisions.md`/`staged/` with no git history to recover them. Route worktree teardown through wrap-up's own Step 10 cleanup execution instead `[IL-116]`
- Don't treat pasting the environment Setup script as covering scheduled Routines — it is confirmed for interactive cloud sessions only and was measured not reaching three fresh Routine containers, and the routine preamble's fallback is what guarantees a firing ends in a real result or a diagnosable failure (dispatch and tidy excluded from manual execution) `[IL-117]`
- Don't hand-author a sweep/audit ledger's classification or literal-transcription table without excluding the ledger's own future committed path from its enumeration, or flagging cross-file duplication for a check — a self-referential artifact matches its own scan, and a hand-copied literal drifts from its source with no single diff spanning both files `[IL-118]`
- Don't trust a loaded skill's procedure to match this repo's checked-out HEAD when developing claude-tweaks on itself — the installed marketplace cache can lag local commits by many releases with no warning. Check `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`'s version against this repo's own first `[IL-119]`
