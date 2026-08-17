# Pipeline Run Directory Resolution — Shared

Operational reference for skills that need to locate the active pipeline run directory. Ownership is split. **This file owns the Resolution order below** — the canonical, complete ordered algorithm for finding the active run, cited by step number from `/capture`, `/tidy`'s `scan-procedures.md`, `flow/materialize.md`, and `_shared/auto-decision-log.md`. `auto-mode-contract.md`'s "Pipeline run directory: location and collision-safety" section owns everything around it — directory structure, collision-safety rationale, cleanup/archival lifecycle, and gitignore treatment — and does not restate the ordering. Consult that section for anything not covered here.

**Not the hook-side algorithm.** Hooks cannot see a skill's spec/topic, so `bin/lib/hooks/context.js`'s `resolveRun` answers a different question with different rules (ownership-scoped, no slug matching — see CLAUDE.md's Hooks section). A change to the order below does not change hook behavior, and vice versa.

## Resolution order

1. **`PIPELINE_RUN_DIR` env var** — set explicitly by `/flow` when orchestrating. Use this when present (preferred path) **only after verifying it resolves under `$RUN_ROOT`** (the Anchoring section below — `git rev-parse --git-common-dir`, then its parent directory). An inherited value naming a directory that exists but resolves *inside* a linked worktree instead of the main checkout is stale/wrong the same way a missing directory is: treat it as unset and fall through to step 2, noting the discrepancy rather than silently adopting it. This is the adoption-time counterpart to the Anchoring section's creation-time rule — a caller can set the env var from inside a worktree just as easily as a creation site can build a path from cwd, and the failure mode (a worktree-trapped run directory a later `git worktree remove` silently destroys) is identical either way (`[IL-127]`).
2. **Most-recent matching directory** — when the env var is unset, find the most recent directory under `.claude-tweaks/pipelines/` whose `spec-slug` segment matches the current spec or topic.
3. **Record-mode materialization exception** — when neither step 1 nor step 2 resolves AND the invocation is `/claude-tweaks:build #{n}` running standalone (no `/flow` parent), create a standalone run dir at `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-record-{n}-standalone/` via `skills/flow/materialize.md`'s own fallback, purely as artifact storage for the materialized file. `$RUN_ROOT` is the **main checkout** root resolved by the Anchoring section below, not the current directory — a bare relative path builds the run dir inside whatever worktree happens to be cwd, which is exactly what anchoring exists to prevent. This is a mode-independent branch keyed on the invocation itself, distinct from step 4's auto-mode allowlist below: it fires regardless of mode — materialization needs somewhere to write the file whether or not `auto` is active — and `/build` is not itself on the step 4 allowlist.
4. **Standalone auto fallback** — when steps 1-3 don't resolve AND the skill is running in `auto` mode AND the skill is on the standalone-auto allowlist (`/tidy`, `/init`, `/capture`, `/claude-tweaks:dispatch`, `/claude-tweaks:backlog`), create a standalone run dir at `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{skill-name}-standalone/` (same `$RUN_ROOT` as step 3, as the Bash snippet below already builds it) with `decisions.md` and `staged/`. The audit log stays on; the skill auto-resolves per project policy in `.claude-tweaks/policy.yml`. The dir is presented in a Pending Review section at the end of the skill's report (no separate Review Console — this is the bookend-end for a standalone run).

   `/claude-tweaks:wrap-up` is on this allowlist with **its own clause, not this one's**: it creates a standalone run dir in *every* mode, not only `auto`, at Phase 1, because its Review Console runs in every mode and needs somewhere to read `decisions.md` and `staged/` from. Two further differences from the clause above: it stamps `createdBy: "wrap-up-standalone"` into `run-state.json` at creation, which is what its Component-Skill Contract reads to tell a created run from an inherited one; and it renders the real Review Console rather than a Pending Review section. That stamp is **the one direct `run-state.json` write at creation time in the whole plugin**: `resolve-run-dir --create` (below) may mint the directory itself — mkdir, plus `decisions.md`/`staged/` when `--standalone` names it — but it never touches `run-state.json`; `record-worktree` and `close-run` still own every later write to that file, and wrap-up applies its own stamp as a separate follow-up write after calling the command, omitting `--mode` so the command creates unconditionally rather than gating on `auto`. Wrap-up's own snippet lives in `wrap-up/SKILL.md`'s "Establish the run directory (unconditional)".

   `/reflect`, `/journeys`, `/visual-review`, and `/simplify` are NOT on this allowlist — they are component skills whose own Component-Skill Contract gates auto-mode behavior on `$PIPELINE_RUN_DIR` already being set by a parent (`/build`, `/review`, `/wrap-up`, or `/flow`). None of them implement a standalone-run-dir fallback; invoked directly with no active pipeline run, they fall through to step 5 (interactive mode) like any other non-allowlisted skill.

   `/claude-tweaks:dispatch`'s `next` form is a special case: it's the headless-safe selection form a scheduled Routine fires unattended (no human present), so step 5's interactive fallback below is never a real option for it — `next` always needs a standalone run dir to resolve, which is why dispatch is on this allowlist despite not being one of the original "auto-mode skills." (Dispatch's bare and `#N` forms can run with a human present and answering prompts, but resolve their own claim/release audit trail through this same allowlisted path regardless of form — dispatch never inherits `$PIPELINE_RUN_DIR`, since it is never invoked as a pipeline component.)
5. **Fall back to interactive mode** — when none of steps 1-4 resolve, no policy lookup is possible and no auto-decisions are allowed. The skill MUST behave as if invoked in interactive mode for this run.

The resolved directory contains `config.yml` (Manifesto answers / policy — absent for every standalone run, `wrap-up-standalone` ones included: only the `/flow` Manifesto writes it, and a standalone run never runs one), `decisions.md` (auto-decision log), `staged/` (proposals awaiting the Review Console / Pending Review section), `run-state.json` (hook-maintained status/worktree assignment; terminal = status `clean`), and `events.jsonl` (hook-appended typed events). Full layout and lifecycle in `auto-mode-contract.md`.

## Resolving it: `resolve-run-dir` (preferred over composing `$RUN_ROOT` by hand)

`node plugin/bin/hooks.js resolve-run-dir [--spec-slug <s>] [--mode auto] [--standalone <name>] [--create] [--root-only]`
(`bin/lib/hooks/run-dir-resolve.js`) implements steps 1, 2, and 4 above on top of
`bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot()` — the same anchoring the Bash snippet
below computes, but as a single command every citing skill step calls instead of restating that
snippet inline (`[IL-127]`: a restated, hand-typed copy is exactly how the anchoring rule got
read and then violated in the incident this command exists to prevent). Prints the resolved
absolute path on stdout and exits `0`; exits non-zero with a message on stderr naming the problem
when nothing resolves, or when `PIPELINE_RUN_DIR` (or a candidate) resolves inside a linked
worktree instead of the main checkout — a shadow, the exact `[IL-127]` shape, refused loudly
rather than silently substituted. Never creates a directory unless `--create` is passed.

- No flags: steps 1-2 only (env var, then newest matching directory for `--spec-slug`). This is
  the read-only "where is the run I already have" call most steps need.
- `--create` with `--spec-slug <s>` and no `--standalone`: the plain mkdir-only mint shape
  `/flow` (`flow/steps-and-gates.md` case 4), `/claude-tweaks:dispatch` (`dispatch/SKILL.md` Step
  4), and `flow/claim-targets.md`'s direct-invocation mint use — `config.yml`/`decisions.md` are
  written later, by whichever step actually initializes the run.
- `--create` with `--standalone <name>`: step 4's standalone-auto-fallback shape —
  `{ISO-timestamp}-{name}-standalone/`, pre-populated with `decisions.md` and `staged/`. Pass
  `--mode auto` too when the caller is on the standalone-auto allowlist above (the command then
  refuses to create outside auto mode); omit `--mode` entirely for a caller that creates in every
  mode regardless — wrap-up's own documented exception.
- `--root-only`: skips run resolution entirely and prints the anchored `$RUN_ROOT` itself — for a
  call site that only ever needed the main-checkout root (a `find` backstop scoped to the whole
  `pipelines/` tree, the transitional copy-out guard's destination computation), never a specific
  run's directory.

## Anchoring

Run directories live under the **main checkout's** `.claude-tweaks/pipelines/`, never a
linked worktree's. Resolve the root once, before any path is built:

```bash
RUN_ROOT=$(git rev-parse --git-common-dir)
RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)
```

Resolved from the main checkout, `$RUN_ROOT` lands on the repo root and nothing changes —
the raw `--git-common-dir` output varies with cwd (`.git` at the root, `../../.git` from a
subdirectory), but the `cd`+`pwd` above normalizes either form to the same absolute path.
Resolved from inside a linked worktree, it lands on the main checkout instead. Every path
below is built from `$RUN_ROOT`, not from the current directory.

Two consequences, both load-bearing:

- **A worktree never holds the only copy** of `config.yml`, `decisions.md`,
  `events.jsonl` or `staged/`. Removing a worktree therefore cannot destroy pipeline
  state, which is what makes automatic reaping (`bin/lib/hooks/worktree-reap.js`, fired from
  `session-start.js`) safe. Run directories that predate anchoring are the one exception, and
  `skills/wrap-up/cleanup-procedures-execution.md` Section C step 3.5 carries the transitional guard that
  copies them out before a worktree is removed.
- **`work/{n}-spec.md` is the exception** and stays inside the worktree. It is git-tracked
  and must be committed onto the feature branch; it reaches the main checkout by merge.

The `worktree-always` PreToolUse gate permits writes to this path from anywhere — see the
one exemption in `_shared/policy-schema.md`. That exemption is file-write-only, so a
`git commit` issued from the main checkout is still denied.

A second, unconditional PreToolUse guard (`bin/lib/hooks/pre-tool-use.js`'s
`checkPipelineShadowGuard`, not gated on `worktree-always`) denies the opposite direction: an
Edit/Write/NotebookEdit or Bash write/mkdir that would CREATE a *new* `.claude-tweaks/pipelines/`
run directory inside a linked worktree — a shadow, the exact split this file's Anchoring section
exists to prevent. It flags only a genuinely new creation; a pre-anchoring run directory already
sitting in a worktree (`wrap-up/cleanup-procedures-execution.md` Section C step 3.5's transitional guard,
sunset 2026-11-07) is left alone.

`resolve-run-dir` above mirrors the snippet below; a citing skill step calls the command, not
this snippet directly. Kept here as the canonical, executable reference implementation (and
pinned verbatim by `tests/pipeline-run-dir-adoption-anchoring.test.js`) — a change to the
resolution order lands here first, then in the command.

## Bash snippet (resolution)

```bash
RUN_ROOT=$(git rev-parse --git-common-dir); RUN_ROOT=$(cd "$(dirname "$RUN_ROOT")" && pwd)
RUN_DIR="${PIPELINE_RUN_DIR:-}"
if [ -n "$RUN_DIR" ]; then
  # Adoption-time anchoring check (step 1): an inherited value must resolve under $RUN_ROOT,
  # not inside whatever worktree happens to be cwd — same failure shape as an unanchored
  # creation, just caught at adopt time instead. Mismatch = treat as unset, fall through.
  REAL_RUN_DIR=$(cd "$RUN_DIR" 2>/dev/null && pwd)
  case "$REAL_RUN_DIR" in
    "$RUN_ROOT"/*) : ;;      # anchored to the main checkout — keep it
    *) RUN_DIR="" ;;         # missing, or resolves outside $RUN_ROOT (e.g. inside a worktree)
  esac
fi
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(find "$RUN_ROOT/.claude-tweaks/pipelines/" -maxdepth 1 -type d -name "*${SPEC_SLUG}*" 2>/dev/null | sort | tail -n 1)
fi
if [ -z "$RUN_DIR" ] && [ "$MODE" = "auto" ] && [ -n "$STANDALONE_SKILL" ]; then
  # Standalone auto fallback — see resolution order step 4 (step 3, the record-mode
  # materialization exception, is /build-specific and handled separately in materialize.md)
  TS=$(date -u +%Y-%m-%dT%H%M%S)
  RUN_DIR="$RUN_ROOT/.claude-tweaks/pipelines/${TS}-${STANDALONE_SKILL}-standalone"
  mkdir -p "$RUN_DIR/staged"
  touch "$RUN_DIR/decisions.md"
fi
[ -d "$RUN_DIR" ] || RUN_DIR=""  # empty = fall back to interactive mode
```

**ISO-timestamp rule** (load-bearing — mixed timezones flip newest-first ordering): every run-directory `{ISO-timestamp}` is `YYYY-MM-DDTHHMMSS` in **UTC** — always `date -u +%Y-%m-%dT%H%M%S`, never a local-time `date`. Two concurrent sessions minting in different zones otherwise produce stamps that sort in the wrong order, and the hook fallback resolver attributes events to whichever sorts newest. Mint sites (`flow/claim-targets.md` Step 2.8, `flow/manifesto.md` Path conventions, `dispatch/SKILL.md` Step 4) cite this rule rather than restating the format.

**SPEC_SLUG conventions** (load-bearing — short numeric slugs would collide with timestamps without a prefix):
- Spec runs: pass `SPEC_SLUG="spec-42"` (with `spec-` prefix) — matches dirs like `2026-05-15T143207-spec-42` without colliding with timestamp digits.
- Multi-spec runs: pass `SPEC_SLUG="spec-42-45-48"` (single prefix, dash-joined IDs).
- Topic runs: pass `SPEC_SLUG="meal-planning"` (no prefix — non-numeric slugs don't collide).
- Last-resort: `git branch --show-current` after a worktree exists. `/flow` and `/build` create the worktree before any path-sensitive command, so this fallback is safe at the time the resolution runs.

## See also

- `_shared/auto-mode-contract.md` — full spec (directory layout, lifecycle, archive rules)
- `_shared/auto-decision-log.md` — log entry format for `decisions.md`
