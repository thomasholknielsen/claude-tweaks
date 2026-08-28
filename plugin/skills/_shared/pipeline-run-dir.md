# Pipeline Run Directory Resolution — Shared

Operational reference for skills that need to locate the active pipeline run directory. Ownership is split. **This file owns the Resolution order below** — the canonical, complete ordered algorithm for finding the active run, cited by step number from `/capture`, `/tidy`'s `scan-procedures.md`, `flow/materialize.md`, and `_shared/auto-decision-log.md`. `auto-mode-contract.md`'s "Pipeline run directory: location and collision-safety" section owns everything around it — directory structure, collision-safety rationale, cleanup/archival lifecycle, and gitignore treatment — and does not restate the ordering. Consult that section for anything not covered here.

**Not the hook-side algorithm.** Hooks cannot see a skill's spec/topic, so `bin/lib/hooks/context.js`'s `resolveRun` answers a different question with different rules (ownership-scoped, no slug matching — see CLAUDE.md's Hooks section). A change to the order below does not change hook behavior, and vice versa.

## Resolution order

1. **`PIPELINE_RUN_DIR` env var** — set explicitly by `/flow` when orchestrating. Use this when present (preferred path) **only after verifying it resolves under `$RUN_ROOT`** (the Anchoring section below — `git rev-parse --git-common-dir`, then its parent directory). An inherited value naming a directory that exists but resolves *inside* a linked worktree instead of the main checkout is stale/wrong the same way a missing directory is: treat it as unset and fall through to step 2, noting the discrepancy rather than silently adopting it. This is the adoption-time counterpart to the Anchoring section's creation-time rule — a caller can set the env var from inside a worktree just as easily as a creation site can build a path from cwd, and the failure mode (a worktree-trapped run directory a later `git worktree remove` silently destroys) is identical either way (`[IL-127]`).
2. **Most-recent matching directory** — when the env var is unset, find the most recent directory under `.claude-tweaks/pipelines/` whose `spec-slug` segment matches the current spec or topic.
3. **Record-mode materialization exception** — when neither step 1 nor step 2 resolves AND the invocation is `/claude-tweaks:build #{n}` running standalone (no `/flow` parent), create a standalone run dir at `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-record-{n}-standalone/` via `skills/flow/materialize.md`'s own fallback, purely as artifact storage for the materialized file. `$RUN_ROOT` is the **main checkout** root resolved by the Anchoring section below, not the current directory — a bare relative path builds the run dir inside whatever worktree happens to be cwd, which is exactly what anchoring exists to prevent. This is a mode-independent branch keyed on the invocation itself, distinct from step 4's auto-mode allowlist below: it fires regardless of mode — materialization needs somewhere to write the file whether or not `auto` is active — and `/build` is not itself on the step 4 allowlist.
4. **Standalone auto fallback** — when steps 1-3 don't resolve AND the skill is running in `auto` mode AND the skill is on the standalone-auto allowlist (`/tidy`, `/init`, `/capture`, `/claude-tweaks:dispatch`, `/claude-tweaks:backlog`, `/claude-tweaks:specify`), create a standalone run dir at `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{skill-name}-standalone/` (same `$RUN_ROOT` as step 3, as the Bash snippet below already builds it) with `decisions.md` and `staged/`. The audit log stays on; the skill auto-resolves per project policy in `.claude-tweaks/policy.yml`. The dir is presented in a Pending Review section at the end of the skill's report (no separate Review Console — this is the bookend-end for a standalone run).

   `/claude-tweaks:wrap-up` is on this allowlist with **its own clause, not this one's**: it creates a standalone run dir in *every* mode, not only `auto`, at Phase 1, because its Review Console runs in every mode and needs somewhere to read `decisions.md` and `staged/` from. Two further differences from the clause above: it stamps `createdBy: "wrap-up-standalone"` into `run-state.json` at creation, which is what its Component-Skill Contract reads to tell a created run from an inherited one; and it renders the real Review Console rather than a Pending Review section. That stamp is **the one direct `run-state.json` write at creation time in the whole plugin**: `resolve-run-dir --create` (below) may mint the directory itself — mkdir, plus `decisions.md`/`staged/` when `--standalone` names it — but it never touches `run-state.json`; `record-worktree` and `close-run` still own every later write to that file, and wrap-up applies its own stamp as a separate follow-up write after calling the command, omitting `--mode` so the command creates unconditionally rather than gating on `auto`. Wrap-up's own snippet lives in `wrap-up/SKILL.md`'s "Establish the run directory (unconditional)".

   `/reflect`, `/journeys`, `/visual-review`, and `/simplify` are NOT on this allowlist — they are component skills whose own Component-Skill Contract gates auto-mode behavior on `$PIPELINE_RUN_DIR` already being set by a parent (`/build`, `/review`, `/wrap-up`, or `/flow`). None of them implement a standalone-run-dir fallback; invoked directly with no active pipeline run, they fall through to step 5 (interactive mode) like any other non-allowlisted skill.

   `/claude-tweaks:dispatch`'s `next` form is a special case: it's the headless-safe selection form a scheduled Routine fires unattended (no human present), so step 5's interactive fallback below is never a real option for it — `next` always needs a standalone run dir to resolve, which is why dispatch is on this allowlist despite not being one of the original "auto-mode skills." (Dispatch's bare and `#N` forms can run with a human present and answering prompts, but resolve their own claim/release audit trail through this same allowlisted path regardless of form — dispatch never inherits `$PIPELINE_RUN_DIR`, since it is never invoked as a pipeline component.)

   `/claude-tweaks:specify`'s `next` form is the identical special case: the headless-safe selection form a scheduled Routine fires unattended, so step 5's interactive fallback below is never a real option for it — `next` always needs a standalone run dir to resolve, to claim the record it selects, which is why specify is on this allowlist despite not being one of the original "auto-mode skills" (`specify/next-mode.md`'s Claim step). Specify's other input forms are always human-invoked and never reach this allowlisted fallback.
5. **Fall back to interactive mode** — when none of steps 1-4 resolve, no policy lookup is possible and no auto-decisions are allowed. The skill MUST behave as if invoked in interactive mode for this run.

The resolved directory contains `config.yml` (Manifesto answers / policy — absent for every standalone run, `wrap-up-standalone` ones included: only the `/flow` Manifesto writes it, and a standalone run never runs one), `decisions.md` (auto-decision log), `staged/` (proposals awaiting the Review Console / Pending Review section), `run-state.json` (hook-maintained status/worktree assignment; terminal = status `clean`), and `events.jsonl` (hook-appended typed events). Full layout and lifecycle in `auto-mode-contract.md`.

## Resolving it: `resolve-run-dir` (preferred over composing `$RUN_ROOT` by hand)

`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir [--spec-slug <s>] [--mode auto] [--standalone <name>] [--create] [--root-only]`
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

**The staged-file invariant.** A staged proposal (`_shared/staged-patch.md`'s Artifact
format — a review/reflect/test-fix/deepen-collapse `.patch`) lives at the **absolute**
anchored path under `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/`, never at a
worktree-relative shadow — the same rule as the bullet above, restated as its own
paragraph because a curation judge (`wrap-up/curation-engine.md` §3/§4) runs inside the
worktree by necessity, so a path resolved relatively from that cwd is the *default*
failure mode there, not agent carelessness. The staging-time `git apply --check` gate
(`_shared/staged-patch.md`'s Staging-time gate) and the judge's own `test -f`
self-verification (`curation-engine.md` §4) both check against this same anchored path
before anything is logged as staged; the post-fan-out shadow sweep (`curation-engine.md`
§4) is the routine remedy for a staged file that ends up in the shadow anyway.

The `worktree-always` PreToolUse gate permits writes to `work/{n}-spec.md` from anywhere — see
the one exemption in `_shared/policy-schema.md`. That exemption is file-write-only, so a
`git commit` issued from the main checkout is still denied.

**The hook-level exemption above is necessary but not sufficient.** The Edit/Write/NotebookEdit
tools apply their own cross-checkout write-pinning refusal for a path under the shared main
checkout, independent of and not covered by the `worktree-always` hook exemption — a session
isolated to this worktree can still see an Edit/Write attempt against `decisions.md`,
`staged/*.md`, `manifest.yml`, or any other file under a resolved run directory refused outright.
When that happens, use `bin/log-decision.js` (`_shared/auto-decision-log.md`'s canonical
appender) for a `decisions.md` entry, or `bin/stage-item.js` for a new staged file; `bin/set-config.js`
writes a `config.yml` policy lever (`--run <run-dir> --key <lever> --value <value>` — the
ceremony escape hatch's downgrade path, refs #1376) the same way — none of the three are
subject to this tool-level pinning, and all work identically from a worktree session or the
main checkout.

A second, unconditional PreToolUse guard (`bin/lib/hooks/pre-tool-use.js`'s
`checkPipelineShadowGuard`, not gated on `worktree-always`) denies the opposite direction: an
Edit/Write/NotebookEdit or Bash write/mkdir that would CREATE a *new* `.claude-tweaks/pipelines/`
run directory inside a linked worktree — a shadow, the exact split this file's Anchoring section
exists to prevent. It flags only a genuinely new creation; a pre-anchoring run directory already
sitting in a worktree (`wrap-up/cleanup-procedures-execution.md` Section C step 3.5's transitional guard,
sunset 2026-11-07) is left alone.

**`work/{n}-spec.md` carve-out (#959).** The guard takes the first path segment under `pipelines/`
as the run-dir candidate and, before this fix, denied whenever that directory did not already
exist in the worktree — with no exception for the tracked `work/` path the paragraph above
documents, so even the sanctioned `bin/materialize.js` route needed its own separate anchoring fix
(below) to reach the write at all. `shadowPipelineRunDir` now checks the candidate's tail against
`WORK_SPEC_TAIL_RE` — `work[/{n}-spec.md]` or the multi-record `spec-{slug}/work[/{n}-spec.md]` —
and allows it regardless of whether the run-id directory pre-exists, so a normal `Write` tool call
or a `mkdir -p … && cat > …` heredoc now reaches the file directly, the same as `bin/materialize.js`
does. The carve-out is narrow by construction (`tests/hooks-pipeline-shadow-guard.test.js`'s `#959`
cases pin both the positive shapes and the negative controls — any other file under `work/`, one
level deeper than `work/`, or elsewhere in the run dir is still denied). Do not work around a
denial outside this one documented shape by writing the blob via git plumbing
(`hash-object`/`update-index`/`commit`) — that tunnels under every PreToolUse gate at once rather
than satisfying any of them (see the matching Don't in `docs/donts.md`).

A third guard sits at the **CLI-argument boundary** — the one path neither of the two above
covers, a run directory handed to a binary explicitly on the command line rather than inherited
or created. Three rules live at this boundary — the first two split by whether the binary has a
documented legitimate run directory outside the repository, the third carried by the
sanctioned-write family:

- **Pipeline-owned binaries** — `bin/hooks.js` (`resolveRunArg`, `--run`), `bin/wrap-up-engine.js`
  (`main`, `--run-dir`), `bin/materialize.js` (`run`, `--run-dir`), and `bin/apply-refine-labels.js`
  (`--run`) — have no such use: each resolves `mainCheckoutRoot()`/`isAnchoredUnderRoot()` from
  `bin/lib/hooks/worktree-detect.js` and refuses any value not anchored under the main checkout
  **before any filesystem write**, with exit code 2 (malformed invocation). `bin/hooks.js`'s
  `resolveRunArg` carries the one narrow exception to this rule — see **Worktree-local `--run`
  fallback (#280)** immediately below.

### Worktree-local `--run` fallback (#280)

`resolveRunArg` (`bin/hooks.js`, shared by `record-worktree`, `record-pr`, `spec-status`,
`close-run`, `teardown-run`, `check-resume-freshness`, `check-staged-inventory`, and `archive-run`
— every CLI verb an explicit `--run <dir>` reaches) adds one narrow exception to the
unanchored-rejection rule above.
It exists for the harness-isolation incident this record documents (flow run
`2026-08-09T140101-spec-262`): a session whose
harness refuses every write to the main checkout for the whole session has no anchored run
directory to name at all — its run dir was legitimately initialized worktree-local as the only
available option, and without this exception `--run "$RUN_DIR"` for that run can never resolve
(`record-worktree` prints `worktree not recorded` and E1 enforcement never binds).

The gating signal that separates this from an ordinary stray worktree-local directory is
**containment and initialization, not mere existence**: a `--run` candidate is adopted only
when (a) it resolves inside a linked worktree *of this same repo* — not an arbitrary directory,
and not an unrelated repo's checkout (`#1183`: an earlier version of this check verified none of
this, so any directory carrying a stray marker file was adopted); (b) that path, relative to the
worktree's own `.claude-tweaks/pipelines/`, has a run-id-shaped segment in the position that names
the run — the leading segment ordinarily, or the segment immediately after `archive/` for an
archived shadow (the same `RUN_ID_RE` shape `context.js`'s run-dir enumeration,
`iterRunDirsWithState`, uses to distinguish a real pipeline run dir from an arbitrary directory);
(c) it is already an **initialized** run dir — carries at least one of `decisions.md`,
`run-state.json`, or `config.yml`, the same bar every other resolver in this file uses to tell a
real run from a bare `mkdir`; and (d) no directory exists at the *same pipelines-relative path*
under the main checkout, which would make that copy the authoritative one instead (`#1183`: this
used to compare only the directory's basename, so a nested multi-spec shadow
(`pipelines/{parent}/spec-N`) or an archived shadow (`pipelines/archive/{id}`) computed the wrong
main-checkout candidate and was adopted even though the anchored copy existed at the correct
nested/archived path). An `archive/{id}` shadow is also checked against a *live*, non-archived
copy of the same run-id under the main checkout — a run can be live under one id while a
worktree-local session independently archived its own local copy under the same id, and checking
only the archived path would miss that (`#1183` fix-wave). The mirror direction holds too: a
*live*-shape shadow (no `archive/` prefix) is checked against an **archived** copy of the same
run-id under the main checkout — a run can be archived at the main checkout while a worktree-local
session independently kept or re-created a live copy under the same id, and checking only the
live-to-live path would miss that (`#1299`). Both twin-checks are ORed into the same condition (d):
a shadow is refused when *any* of the three main-checkout candidates — same pipelines-relative
path, live twin, archived twin — exists. A bare `mkdir` of a worktree-local pipelines path (the [IL-96]/[IL-127]
shadow shape `checkPipelineShadowGuard` exists to prevent, above) fails condition (c) and is
rejected exactly as before — an ordinary run with no worktree-local run dir at all can never
spuriously match this fallback, satisfying the "blocked vs. absent" distinction the record's
Deliverables call for. `record-worktree`'s stdout names the fallback explicitly (`resolved via
the worktree-local fallback (#280)`) rather than reporting it identically to the ordinary
anchored path, so the degraded state (this run's audit trail lives only in the worktree until
merge) is diagnosable, not silent.

**Scoped to `resolveRunArg` only — not mirrored into `bin/lib/hooks/context.js`'s
`resolveRunDir`/`resolveRun`.** That function answers a different question (this file's header
note above): an *implicit* fallback scan across every run dir for hook-event attribution, with no
caller-named target to validate against. `resolveRunArg`'s fallback is deliberately narrow because
it validates a single, explicitly-named candidate the caller already believes is theirs; the same
logic applied to `resolveRun`'s broad scan would mean every hook event silently widens its search
to a second directory tree on every invocation, for a scenario (harness-blocked main-checkout
writes) `resolveRun`'s callers have no way to detect or react to differently than the ordinary
case. If a future incident shows hook-event attribution needs the same recovery path, it should
be evaluated on its own — mirroring this fallback verbatim would import `resolveRunArg`'s
single-candidate assumption into a many-candidate scan without re-deriving whether its safety
argument still holds there.
- **Resolver CLIs with a documented sandbox use** — `bin/resolve-profile.js` (`--run-dir`) and
  `bin/resolve-policy.js` (`--run`), whose journey and test invocations legitimately point outside
  any checkout (`docs/journeys/resolve-dispatch-model-profile.md`'s `/tmp/mp-journey`) — apply the
  **anchored-or-outside** rule via `worktree-detect.js`'s `checkRunDirAnchoredOrOutside()`: a
  resolved path inside any git checkout must be anchored under the main checkout resolved from
  cwd; a path outside any checkout is accepted as-is, no flag needed. Rejection exits 1, these
  CLIs' documented invocation-failure code — a deliberate, stated deviation from the family's
  exit 2.

- **Sanctioned-write CLIs** — `bin/log-decision.js`, `bin/stage-item.js`, and `bin/set-config.js`
  (`--run`, refs #1376) — the run-dir writers a worktree-isolated session invokes when tool-level
  pinning refuses the run dir (see the tool-level pinning note above). Each applies the same
  strict anchored-under-the-main-checkout rule, but through `bin/lib/stage-item/write.js`'s
  exported `resolveTarget` rather than `worktree-detect.js` directly, and refuses with exit **3**
  — their documented run-dir-failure code, kept distinct from their exit 2 (malformed
  invocation), with its own two messages ("run dir does not exist" versus "not anchored under
  the main checkout (a worktree-local shadow)"). A fourth writer imports that `resolveTarget`
  rather than re-deriving the predicate.

The first two rules keep the two failure modes distinct in the message — "resolves outside the main
checkout" (a worktree-relative shadow) versus "could not determine the git repository root" (no
repo at all); collapsing them sends a reader hunting for the wrong problem — and both are
existence-independent (the walk-up runs against whichever ancestor directory exists), so they
hold for a path about to be created as well as one that already exists. The run-directory
argument reaches the check through the CLI's own `deps` seam where the binary has one — a guard
added later that reads `process.cwd()` or `worktree-detect` directly re-opens the hole the seam
exists to close — a rule scoped to the pipeline-owned binaries above: the two resolver CLIs have
no run-dir/cwd `deps` seam at all (their injectable seams serve policy-resolution, not path
handling), so their guard calls `worktree-detect` directly and their tests spawn the real binary
against real fixture repos instead. **A new `bin/*.js` that accepts a run-directory argument owes one of these two
guards** (`[IL-127]`) — the strict rule by default; anchored-or-outside only when a documented
legitimate outside-repo use exists, as it did for the two resolver CLIs (#1065).

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
