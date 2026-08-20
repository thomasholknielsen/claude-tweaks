# CLAUDE.md — claude-tweaks plugin

## What this is

A Claude Code plugin containing markdown skill files that guide Claude through a structured development lifecycle, with browser automation, QA pipeline support, a statusline, and a subagent contract for parallel dispatch.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Claude Code plugin system + Node 18+ (for the statusline) |
| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `plugin/bin/` |
| Dependencies | Superpowers plugin (`/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, `/superpowers:systematic-debugging`), code-simplifier plugin (`code-simplifier:code-simplifier` subagent), agent-browser (optional), git CLI (optional — statusline git segment only), gh CLI (optional — default transport for `work-backend: github-issues`: work-record system, the four health-sweep skills' issue filing, /tidy and /help's PR/issue scans. Not required since 6.24.0 — a `gh`-absent env (typically cloud Routine sandbox) routes the same CRUD via `_shared/github-write-transport.md`'s MCP path, with `_shared/issue-claims.md`'s file-blob lock standing in for the ref-level one) |
| Test runner | `node --test tests/` (built-in, no external deps) |
| Distribution | Plugin marketplace via `thomasholknielsen/claude-tweaks-marketplace` |

## Structure

**The plugin payload is the `plugin/` subtree — nothing else in this repo ships** (`docs/decisions/0015-*`): `tests/`, `docs/`, `evals/`, `perf/`, `tools/`, `scripts/`, and `work/` are maintainer-side, so where a new file goes decides whether users install it. Full directory tree, the per-skill sub-file table, and the command reference live in `docs/plugin-structure.md`. Orientation:

- `plugin/skills/{name}/SKILL.md` — skill definition; `plugin/skills/{name}/*.md` — sub-files lazy-loaded by that skill
- `plugin/skills/_shared/*.md` — cross-skill contracts, criteria, and canonical procedures cited by skills rather than restated
- `plugin/bin/` — Node executables; `plugin/bin/lib/{name}/` — multi-file modules as flat sibling directories, NOT a nested `_shared/` wrapper (that convention is specific to `plugin/skills/_shared/`)
- `plugin/hooks/hooks.json` + `plugin/bin/hooks.js` — one dispatcher for every hook event
- `tests/` — `node --test` suites; `evals/` — a separate Node project (own `package.json`/`node_modules`), not part of the plugin runtime

## Conventions

### Skill authoring — moved

SKILL.md structure, Interaction patterns (incl. the canonical CSC template), Frontmatter conventions, the Interaction style directive, and Parallel execution directives now live in `docs/skill-authoring.md`. Read it before creating or editing any `plugin/skills/**/*.md`.

### Versioning

- Version lives in `plugin/.claude-plugin/plugin.json`
- Bump minor version for feature additions, patch for fixes
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional commit prefixes)

### Releasing (two repos)

Invocation: `node plugin/bin/release.js <minor|patch> "<summary>"` from clean `main`. The whole-branch review gates the bump — run it before the version bump, not as a later task in the same plan. Full procedure, judgment calls, and the shipped-vs-never-shipped renumber split: `docs/releasing.md`.

### Cross-references

- Every relationship between skills is stated **once**, in `docs/skill-graph.md`. Adding or changing a skill means adding or updating its edges there. Do not restate an edge inside a `SKILL.md`: the bidirectional convention this replaces required each edge in two places, and the two copies drifted
- Workflow diagrams in `/help` must list all skills
- The artifact lifecycle diagram in `/help` and `README.md` must stay in sync
- Prefer describing a list's size by reference ("see the table below") over restating it as a literal count — see the cardinality rule in `## Don'ts`
- A skill reference inside actionable instruction text (a `## Step N` body, a `## Next Actions` block) MUST use the fully-qualified `/claude-tweaks:{skill}` form — the `Skill` tool requires it, and a bare `/{skill}` there fails with "Unknown skill" at invocation time. Bare short-form references (`/{skill}`) are reserved for descriptive prose and Relationship-to-Other-Skills tables, where they're never passed to a tool call.

### Hooks

All hook registrations route through `plugin/bin/hooks.js <event>` — one dispatcher, one module per event in `plugin/bin/lib/hooks/`. The full contract — tiered posture, run-dir resolution and ownership, the never-break-a-session invariant, and its consumers — is in `docs/hooks.md`. Read it before touching `plugin/bin/hooks.js`, `plugin/bin/lib/hooks/`, or `plugin/hooks/hooks.json`.

## Philosophy

- **Do it properly.** No display-only workarounds for data model issues, no "good enough" shortcuts that leave technical debt. If a value needs renaming, rename it everywhere including the database. If a type needs changing, change it at the source.
- **Assume zero cost.** Decide as if implementation is free. Never choose an inferior design because the better one "isn't worth the effort."
- **Assume zero time.** Decide as if implementation is instant. Never choose a shortcut because the proper approach "takes too long."
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record via `/claude-tweaks:capture` — with a spec-shaped body (Current State / Deliverables / Acceptance Criteria) and a `Defer-reason:` from `_shared/deferral-gate.md` when an agent holds the context; a stub is for a human typing an idea. Never silently skip work or leave TODO comments without a corresponding backlog record.

Established codebase distributed to real users via a versioned plugin marketplace. Contract changes (skill frontmatter shape, hook payloads, work-record schema, `_shared/*.md` conventions consumed by multiple skills) follow the same expand-contract discipline as a public API: add the new, migrate every consumer (including the installed build, which reads this repo's own committed config with older code), remove the old — never a silent breaking rename. A deprecated behavior gets a recorded removal condition (see the Don'ts rule on this), not an indefinite compatibility shim. Prefer stability over novelty in shipped skill contracts — adopt new conventions in new skills first, then migrate existing ones deliberately, with the incident log recording what each migration cost.

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
npm test                            # Full suite — tests/ (includes every tests/bin-lib/{module} suite) and tools/upstream-drift/tests/ — a recursive glob, not a fixed list; new tests/bin-lib/{x} directories are picked up automatically
npm run test:perf                   # Timing budgets (perf/) — deliberately excluded from npm test, see docs/plugin-structure.md
claude --plugin-dir ./plugin        # Local development — load the payload subtree from this checkout
```

Per-suite test invocations, the `plugin/bin/*.js` CLIs (the four health sweeps plus the standalone CLIs listed there), and the evals harness commands are in `docs/plugin-structure.md`.

A `npm test` failure count that varies run-to-run on byte-identical code tracks machine load (sibling agents/sessions running concurrently), not a regression — re-run only the affected file(s) in isolation (`node --test path/to/file.test.js`) before concluding anything is actually broken.

### Subagent Contract (v4.2+)

The contract is **dispatch correctness** discipline, not a token-saving measure: the clean room is what makes N agents independent evidence rather than N echoes, the status line stops a failed dispatch from aggregating as a clean result, and the templates keep aggregation mechanical rather than paraphrased. Costing less to run is a side effect, never the rationale.

Skills that dispatch parallel Task agents must reference `plugin/skills/_shared/subagent-output-contract.md` and follow its full contract: minimal **input** (scope + paths + literal output template — no conversation history), a **status line** (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`) as the agent's first reply line, an **output template** (Template A/B/C) inlined verbatim in the dispatch prompt, and **model profile selection** (`Fast | Standard | Capable`; `Frontier` only at contract-enumerated singleton slots, never in a fan-out — resolved per the contract's Model Selection section) appropriate to the work. Agents only see what's in their prompt — references to sibling files don't reach them. Used by `/browse`, `/design-wrapper` (`review` mode Step 3.8 — craft critics), `/dispatch` (`build,test` then `review,polish,wrap-up`, two Task calls per file-overlap group, own GROUP/OUTCOME/MANIFEST template — none of A/B/C fit; status line + input discipline still apply, `plugin/skills/dispatch/SKILL.md` Step 5), `/help`, `/init`, `/review`, `/specify`, `/test` (qa-prompts), `/tidy`, and `/visual-review`. When adding a new dispatch site, follow the full pattern, not just the output template.

**Third-party agents are exempt**, on a structural condition: the agent's definition lives outside this repo's `plugin/agents/` directory, so it ships with someone else's plugin and is invoked as a delegation. Anything under our own `plugin/agents/` is never exempt. The exemption covers the agent only — the caller still normalizes the foreign output at the boundary, checks availability at the *agent* level (plugin presence does not imply agent presence), and distinguishes unavailable / failed / empty / unparseable rather than reporting a clean result. `impeccable-finish-reviewer` is the one such dispatch today (`plugin/skills/design-wrapper/modes/review.md` Step 3.7). Full carve-out: the Exemption section of that `_shared` file.

### Auto-Mode Contract + Bookend Architecture (v4.6+)

claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.

**Single source of truth:** `plugin/skills/_shared/auto-mode-contract.md` — defines mode states, decision precedence (CLI arg > pipeline config > project policy > skill default), reversibility/confidence floors and a severity ceiling, the HARD-GATE exemption list, and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog or parked records, governance gates) — except the narrow, explicit `autonomy` ceiling's bookkeeping capabilities (see `_shared/autonomy-ceiling.md`), which let floor-clearing ledger residue, queue writes, and ops-ack resolve without a click at `trusted`/`unattended`, and — at `unattended` only — let the Review Console's memory, queue-write, and upstream-filing approvals resolve with zero clicks under `consoleAutoResolve`.

**Audit trail:** `plugin/skills/_shared/auto-decision-log.md` — every auto-resolution writes a one-line entry to `.claude-tweaks/pipelines/{run-id}/decisions.md` per that file's canonical entry schema. The Review Console reads this log. Staged code-fix proposals follow `plugin/skills/_shared/staged-patch.md` — validated with `git apply --check` at staging time and re-derived from their `Invariant:` preamble at the console when the diff has gone stale.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a decision is decision-worthy, stage it (log it, don't act) and surface at the Review Console. Mid-flow stops are reserved for HARD-GATEs (test failures, spec compliance, structural coupling, plan validation) and the explicit "not silenced" list in the contract.

**Per-pipeline run directory** (collision-safe across parallel agents): `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` contains `config.yml` (Manifesto answers), `decisions.md` (audit log), and `staged/` (proposals awaiting Review Console). Resolve it — and `PIPELINE_RUN_DIR`, adoptable only once it resolves under `$RUN_ROOT` — per `plugin/skills/_shared/pipeline-run-dir.md`: `$RUN_ROOT` is the main checkout, never the cwd worktree, and a bare relative path silently shadows it `[IL-127]`. **Project policy** lives in `.claude-tweaks/policy.yml` — the only config home since 6.48.0 — read as defaults by the Manifesto, overridable per-run.

## Design integration

diagram-suggestions: enabled

## Cloud parity

Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config. Two things are required, and the declaration alone is not enough: this project's `.claude/settings.json#enabledPlugins` (paired with `extraKnownMarketplaces`) says what a sandbox may load, and the Setup script below is what actually installs it. The field is confirmed effective for interactive cloud sessions; it was measured not reaching scheduled Routine sandboxes (scope of affected sandbox types unknown) — the routine kernel's self-heal fallback (#260), not this field, is what guarantees a scheduled firing ends in a real result or a diagnosable failure `[IL-117]`.

- **Setup script (required, not optional):** paste the canonical Setup-script line (see `scripts/claude-cloud-setup.sh`'s header) into this project's cloud environment's Setup script field (claude.ai/code environment settings, web UI only — no API/CLI can set this remotely). Installs every declared plugin/marketplace plus `agent-browser`. Regenerated by `/claude-tweaks:init` Step 14; don't hand-edit it. Without it, a declared plugin is simply absent. Confirmed for interactive cloud sessions; measured not reaching scheduled Routine sandboxes — see the paragraph above. This paste requirement applies per *environment*, not per repo — an environment selected in the session composer that has never had this pasted fails this way even for a fully-declared repo `[IL-113]`.
- **Branch:** cloud sessions check out the environment's configured branch (typically `main` here) — declarations only take effect once merged there. Scheduled Routines are pinned independently: each audits the branch it was given at creation.
- **First exposure:** if a skill is uninvocable in a cloud session, run `ls ~/.claude/plugins/` before waiting. Missing directory means nothing installed — the Setup script is absent or failed, and waiting won't fix it. Present and populated but still uninvocable is the transient case, observed once to clear a session later; re-check rather than assuming.
- **MCP servers:** this project has no committed `.mcp.json` — a cloud or Routine session's MCP servers (e.g. `github`, `Claude_Code_Remote`) come from the hosting environment/account configuration, not a repo file. Servers configured only in `~/.claude.json` don't reach cloud, and are never auto-copied (they can carry credentials).

## Work records

work-backend: github-issues
work-types: labels

## claude-tweaks Pipeline

**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.

**Entry point:** `/claude-tweaks:specify` — accepts a topic (calls `/superpowers:brainstorming`), design-doc path, or a backlog work-record ref.

**`/claude-tweaks:flow`:** specs only — it rejects design docs. Defaults to `auto` (hands-off); pass `confirm`, `interactive`, or `hybrid` to change that.

**Integration model** (`plugin/skills/_shared/integration-model.md`): GitHub-backed projects default to `pr-first` — a worktree run is born public (draft PR at run start, every phase pushes, merge happens via `gh pr merge`); no-forge projects use `local-merge`, the permanent fallback. Never re-derive which one applies ad hoc — read the resolution, once, per that file.

**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.

## Don'ts

Rules only — each is a rule plus one clause of why. Where a rule carries an `[IL-nn]` tag, the full post-mortem behind it — which build it bit, how it was caught, what it cost — is in `docs/incident-log.md`. The full rule list now lives in `docs/donts.md` (moved out of this always-loaded file to fit the 150-line budget); read it before touching code covered by any tagged rule.
