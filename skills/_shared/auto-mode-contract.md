# Auto-Mode Contract

Single source of truth for what `auto` means across the claude-tweaks pipeline. Every skill that has at least one interactive stop MUST reference this file rather than redefining the semantics inline.

## Why this exists

Without a contract, "auto" was whatever each skill author thought it meant. Some skills checked it, some ignored it, some let the model insert its own caution prompts ("this plan is large, should I split it?"). Users invoking `auto` precisely to avoid those interruptions still got friction.

This contract defines:
1. **Mode states** — what `auto` / `interactive` / `hybrid` actually mean
2. **Bookend architecture** — where stops are allowed to live (begin + end, never middle)
3. **Decision precedence** — which override wins when sources disagree
4. **Auto-decision log** — the audit trail that makes silent automation safe
5. **Reversibility / confidence / severity floors** — what `auto` is allowed to decide
6. **HARD-GATE exemption** — what `auto` never silences

## Bookend Architecture

The pipeline has at most two stops in `auto` mode, regardless of how many decisions it makes:

```
┌─────────────────────────────┐                                  ┌─────────────────────────┐
│  [BEGIN]                    │                                  │  [END]                  │
│  Pipeline Config Manifesto  │  ─── pure automation against ───►│  Wrap-Up Review Console │
│  (front-loaded policy)      │      policy, log every decision  │  (back-loaded review)   │
└─────────────────────────────┘                                  └─────────────────────────┘
```

- **Begin stop** — the Pipeline Config Manifesto computes all policy levers (mode, scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness, unattended-tier, ceremony-profile — `flow/manifesto.md`'s canonical lever numbering 1-10) and saves them to `config.yml` inside the run directory at `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`.
- **Begin stop is opt-in under `auto`.** `/flow` defaults to `auto`, and in `auto` the Manifesto renders as a **read-only FYI** (display levers + sources, then proceed) — so the everyday auto pipeline has effectively **one** user-facing stop: the end-of-run Review Console. Pass `confirm` (or use `hybrid`) to turn the begin stop into a real approval gate. The "at most two stops" promise is a ceiling, not a floor.
- **One message, not many.** When the begin stop *is* a gate (`confirm` / `hybrid`), it is a single message with every lever pre-filled and an Approve all / Override / Cancel choice. Never a chain of per-lever questions — if you need to ask twice, you've already broken the bookend.
- **Mid-flow** — skills look up policy and execute. Every auto-decision lands in the auto-decision log.
- **End stop** — `/wrap-up` Review Console presents one consolidated batch table covering everything that was auto-decided or staged.

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto` mode. If a skill discovers something that warrants a decision, it stages the decision for the Review Console. The only mid-flow stops permitted are HARD-GATEs and the items listed under "What `auto` does NOT silence" below.

## Mode states

| Mode | When set | Behavior |
|---|---|---|
| `auto` | **`/flow`'s default**; also explicit `auto` arg or `auto-mode: default-on` in CLAUDE.md | Bookend architecture with the begin stop as a **read-only FYI** (Manifesto displays, does not gate) — so the only user-facing stop is the end Review Console. Pure automation in the middle. HARD-GATEs and mandatory user-input items still fire. |
| `confirm` | Explicit `confirm` arg | Same as `auto`, but the begin stop is a real **approval gate** (Approve all / Override / Cancel). After approval, the rest of the pipeline runs as `auto`. |
| `hybrid` | Explicit `hybrid` arg | Begin stop is an approval gate; downstream skills also auto-resolve only when reversibility:high AND confidence:high AND severity ≤ low — everything else asks. Review Console still runs at end. |
| `interactive` | Explicit `interactive` arg, or `auto-mode: default-off` in CLAUDE.md | No Manifesto presented; skills present each decision in-flow as the standalone skills do. |

**Default note:** `/flow` defaults to `auto` (its purpose is hands-off automation). Standalone skills invoked outside `/flow` with no mode signal fall back to `interactive`. The `auto-mode:` CLAUDE.md flag lowers (`default-off` → interactive) or confirms (`default-on` → auto) the default; an explicit mode arg always wins.

## Decision precedence

When multiple sources can dictate a choice, highest wins:

1. **Explicit CLI arg** — `/flow 42 auto no-polish` always wins for that invocation
2. **Pipeline config** — answers from the Config Manifesto (`config.yml` in the run directory at `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`)
3. **Project policy** — defaults in `CLAUDE.md` (e.g., `scope-creep: add-to-plan`)
4. **Skill default** — the skill's fallback behavior when nothing above is set

When in doubt: ask once at the Config Manifesto, then never again for the rest of the pipeline.

## Pipeline run directory: location and collision-safety

Each `/flow` invocation gets a unique, per-run directory at:

```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/
├── config.yml         ← Pipeline Config Manifesto answers
├── decisions.md       ← Auto-decision log (see auto-decision-log.md)
└── staged/            ← Patches and proposals awaiting Review Console
    ├── review-{n}.patch
    ├── tidy-{n}.md
    └── ...
```

Where `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons; portable across filesystems) and `spec-slug` is the spec number(s) or topic slug — e.g.:

```
.claude-tweaks/pipelines/2026-05-15T143207-spec-42/
.claude-tweaks/pipelines/2026-05-15T143207-spec-42-45-48/
.claude-tweaks/pipelines/2026-05-15T143207-meal-planning/
```

**Why unique:** multiple parallel agents (different worktrees, different terminals, even just same-second invocations on the same checkout) never collide. Each run's artifacts live together and clean up atomically.

**How downstream skills find the active run:** the entrypoint skill (`/flow`, or first standalone skill in a chain) creates the directory and a marker file. Downstream skills look up the active run by:

1. Reading the `PIPELINE_RUN_DIR` env var if set by an explicit caller (preferred path used by `/flow`)
2. Else picking the most recent directory in `.claude-tweaks/pipelines/` whose `spec-slug` matches the current spec or topic
3. Else, if running in `auto` mode and the skill is on the standalone-auto allowlist (`/tidy`, `/init`, `/capture`, `/claude-tweaks:dispatch`, `/claude-tweaks:triage`, `/claude-tweaks:review-backlog`), creating a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-{skill-name}-standalone/` — see `_shared/pipeline-run-dir.md`'s Resolution order step 3 for the full allowlist rationale and exceptions
4. Else falling back to `interactive` mode (no policy available — no auto-decisions allowed)

**Cleanup:** the Wrap-Up Review Console moves completed runs to `.claude-tweaks/pipelines/archive/{run-id}/` on successful pipeline closure (preserving the audit trail). `/tidy`'s Standalone-auto path additionally compacts standalone run directories older than 30 days into a monthly rollup — see `_shared/auto-decision-log.md`'s Archival section for the exact behavior.

**Gitignore:** most of `.claude-tweaks/` is runtime state, but `/init` deliberately does **not** blanket-ignore the directory — it adds split entries (`.claude-tweaks/pipelines/`, `.claude-tweaks/research/`, `.claude-tweaks/code-health/`, `.claude-tweaks/harness-health/`, `.claude-tweaks/journey-health/`, `.claude-tweaks/docs-health/`, `.claude-tweaks/routine-environment-cache.yml`) instead, because `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records) is explicitly meant to stay committable, and git's `!` negation can't reliably re-include a subdirectory of an already-ignored parent (see `init/bootstrap-steps.md` Step 4). This covers each health skill's own local `cache.json` (`code-health/`, `harness-health/`, `journey-health/`, `docs-health/` — cursor and run-history state live on the durable `health-state` git branch instead, see `_shared/health-state.md`). Pipeline runs are not committed history; the auto-decision log is for the user, not the repo.

## Auto-decision log

Every auto-resolution is logged. This is non-negotiable — silent automation without an audit trail is forbidden.

See `auto-decision-log.md` for the full schema. Summary:

- Path: `.claude-tweaks/pipelines/{run-id}/decisions.md` (per-run, append-only)
- Format: per-skill section with timestamped entries
- Read by: `/wrap-up` Review Console
- Each entry: action, rationale, reversibility, status (`AUTO` | `STAGED` | `KEPT-PROMPT`)

## Reversibility / confidence / severity floors

A skill MAY auto-resolve a decision only when ALL of these hold:

| Floor | Threshold | Why |
|---|---|---|
| **Reversibility** | `high` — undoable via file edit or `git revert` | Auto-decisions must be cheap to roll back at the Review Console |
| **Confidence** | `high` — skill states "this is clearly the right choice given inputs" | Low-confidence choices need user judgment |
| **Severity** | `low` (for findings) — nits, conventions, mechanical fixes | Higher severity is human-judgment territory |

When any floor fails, the skill MUST stage the decision (log it, don't act) and surface it at the Review Console.

The hook surface (`bin/hooks.js`, see CLAUDE.md Conventions → Hooks) mechanizes these tiers for working-directory discipline and run continuity — block/warn/inform/log map 1:1 to the reversibility floors defined here.

### Always-reversible (auto-OK)

- File edits in worktree (`git revert`)
- Patch files staged in `.claude-tweaks/pipelines/{run-id}/staged/` (apply later, never silently)
- Auto-decision log entries (delete to undo)
- Cache writes under `.claude-tweaks/pipelines/{run-id}/cache/*.json` (regeneration is cheap)
- Ledger appends with status `observation` or `open`
- **Ephemeral dev server** started on a free port, anchored to the worktree root, with PID/port tracked in `{run-id}/ephemeral-server.txt` and torn down at wrap-up (kill the process to undo). This is the worktree-correct way to make a running app reachable for `/visual-review` and `/stories` in auto mode — see `_shared/dev-url-detection.md`, "Ephemeral server start". (A *global install* like `agent-browser` is NOT in this class — see `browser-detection.md`.)

### Never-reversible (auto-FORBIDDEN, regardless of mode)

- Closing or deleting work records
- Closing ledger items as `fixed` / `accepted` / `dropped` (Phase 2 of the resolve gate)
- `git push` to shared branches
- Creating work records (filing new records on the user's tracker) — except scheduled health-skill born-ready records (see `_shared/work-record.md`'s born-ready rule) and queue-write proposals when `unattended-tier` is on (see `_shared/unattended-tier.md`)
- Network calls beyond reads (no API writes, no message sends)
- Modifying CLAUDE.md project-policy values
- Deleting specs

## What `auto` silences

| Prompt / decision | Default behavior | Behavior under `auto` |
|---|---|---|
| Pre-flight merge-check (`/flow` Step 2.5) | Offer rebase vs continue | Continue and add `ops` ledger entry |
| Shape-check warnings (`/flow` Step 2.6) | Offer decompose / proceed / cancel | Proceed with the documented default and add `ops` ledger entry naming the signal |
| Worktree consent (`/build` Common Step 1) | `/superpowers:using-git-worktrees` consent prompt | Pre-authorized by `auto` (user explicitly opted in) |
| Plan audit scope-creep (`/build` Common Step 1.5) | Add-to-plan / continue / stop | Apply policy from manifesto (default `add-to-plan`) |
| Overlap handling (`/specify` Step 1) | Skip / extend / companion / replace | Apply policy from manifesto (default `companion`) |
| Impeccable shape (`/specify` Step 2.5b) | Run / skip | Auto-run for frontend specs; skip for others |
| Design intent (`/specify` Step 2.5c) | 6-way creative direction | Apply manifesto value (default `none` — no intent applied) |
| Design polish-phase dispatch (`/flow` polish phase, via `/claude-tweaks:design-wrapper polish`) | N/A — auto-fit and issue-driven have no interactive equivalent (they're always-run and signal-triggered respectively); intent-driven was already pre-selected at `/specify` Step 2.5c | Auto-fit: always dispatched when frontend. Issue-driven: dispatched per audit-flagged category. Intent-driven: dispatched per pre-declared `design-intent:`. All `AUTO` — logged by `/flow` using `/design-wrapper polish`'s `decision_summary` field. |
| Code review findings (`/review` Step 3 Routing) | Apply all / override | Severity:low → `AUTO`; severity:medium → `STAGED`; severity:high → `STAGED`; severity:critical → `KEPT-PROMPT` (rare — security/correctness hard-fails the bookend) |
| Tidy cleanup (`/tidy`) | Per-item decision | Auto-apply Keep and unambiguous Delete; stage Merge/Promote/ambiguous |
| Test fix mode (`/test` Step 3) | Auto-fix / show / skip | `lint` tier: lint-only. `lint+type` tier (default): lint + type-only. `lint+type+test` tier (opt-in via Manifesto): also auto-fix straightforward test failures. Anything beyond the tier ceiling is staged. |
| Architecture alignment (`/build` Common Step 4.5) | Per-deviation decision | Deviations classified `Beneficial` → `AUTO` (apply silently to plan/spec, log entry includes commit ref of spec edit). `Neutral` → `STAGED`. `Concerning` → `KEPT-PROMPT`. |
| Visual-review prereqs (`/visual-review` Step 1) | Install / skip | Auto-skip if not installed; surface in report |
| Visual-review dev URL (`/visual-review` Step 2) | Try other / wait | First **attempt to start an ephemeral worktree server** on a free port (reversible, tracked, torn down at wrap-up — see `dev-url-detection.md` Step 3 + "Always-reversible" above). Auto-skip to code-only mode with a "dev URL unreachable — no dev command / start failed" log entry **only if** no server can be started. Never reuse a foreign (main-checkout) server in a worktree run. |
| Stories v1 detection (`/stories` Step 1) | Regenerate all / diff / cancel | Auto-skip migration; stage as "legacy stories detected" |
| Story journey link suggestions (`/stories` Step 6) | Apply all / override | Auto-apply (mechanical mapping) |
| Init Phase 3 classification | Confirm / override | Auto-confirm when detection confidence ≥ 0.8 and signals are consistent |
| Capture next-action routing | Numbered options | Apply `--route` arg if set; else default to `keep` (record stays in backlog state — most conservative) |
| Reflect insight routing | Per-item decision | Auto-route: defer (default), keep (tangential — stages a record proposal for the Review Console, stays in backlog state), fix-now (only safety regressions) |
| Wrap-up Step 4 leftover routing | Per-item decision | Apply `leftover-default` policy from manifesto (default `defer`) |
| Wrap-up Step 7 skill updates | Apply all / override | Auto-apply purely additive changes (new examples, anti-patterns) — including those the independent domain scan surfaces, not only ledger-seeded ones; stage restructures and new-skill candidates |
| Wrap-up Step 8.6 per-spec Review Consoles under multi-spec `/flow` | One console per spec at each wrap-up (N consoles for N specs) | **Consolidated into one** end-of-run Review Console at `/flow`. Per-spec wrap-ups skip Step 8.6 when `MULTISPEC_REVIEW_DEFER=1` is set; the parent `/flow` runs a single console reading the parent run dir's `decisions.md` + `staged/` and every per-spec `decisions.md` + `staged/` after the last spec completes. Preserves the bookend promise (one start stop, one end stop) regardless of N. See `flow/multispec-review-console.md`. |
| Mid-pipeline reality-checks inserted by the model | Free-form prompt | **NOT ALLOWED** — see Anti-Patterns |
| "Are you sure?" before authorized reversible operations | Confirmation prompt | Proceed silently |
| Cost / wall-clock estimates as stop questions | Free-form prompt | **NOT ALLOWED** — surface in summary, not as a blocking question |

## What `auto` does NOT silence

`auto` is not a global skip-everything flag. The following are policy gates, not UX preferences, and require explicit user input regardless of `auto` state:

| Item | Why mandatory |
|---|---|
| Ledger resolve gate Phase 2 (every open item, per-item) | Items represent unfinished work — silently dropping them is the bug `auto` is *not* allowed to introduce, unless `unattended-tier` is on — see `_shared/unattended-tier.md` for the narrow, backlog-only carve-out |
| Work-record creation (new backlog records) | Each record filed on the user's tracker needs explicit user approval — the record queue is the user's, not the model's. Scheduled health-skill filing is exempt — born-ready records are those skills' documented output (see `_shared/work-record.md`, born-ready rule). Queue-write proposals are also exempt when `unattended-tier` is on — see `_shared/unattended-tier.md`. |
| Ops-acknowledgment (`/wrap-up` "Ops acknowledgment" step, when ops items exist) | Ops items represent infrastructure changes the user must action post-merge — bulk-acknowledging without the user reading each one risks a missed action, so every item requires explicit confirmation. Exempt only when `unattended-tier` is on — see `_shared/unattended-tier.md` for the narrow, logged carve-out. |
| Marking records `parked` | Same — putting work on hold is a user decision |
| `/challenge`'s Listen + Reflect-back steps | The user-engagement entry points where the problem statement is supplied and confirmed. After Reflect-back, lens proposers + the aggregator run autonomously per Mode 4 (Layered MoA) — those are not user-prompt cycles. |
| `/init` Phase 4 (skill manifest), Phase 8 (Impeccable), Phase 9 (final confirmation), scope-selection gate | Project-shape governance decisions are user-only |
| HARD-GATE / BLOCKED / STOP conditions | `/review` Step 1 spec compliance, `/review` Step 1.5 test gate, `/flow` Step 2.7 design-doc rejection, `/build` Design Step 3 plan validation, `/build` Common Step 1.5 plan audit hard-fails. These prevent degraded output. (`/flow` Step 2.6's shape-check hard-fail is NOT in this list — under `auto` it auto-resolves to "proceed anyway" with an `ops` ledger note per the row above; it only actually stops the pipeline in `interactive`/`hybrid` mode.) |
| Hard validation failures (uncommitted changes, missing prereqs, malformed input) | Correctness gates. Bypassing them produces broken pipelines. |
| Final pipeline failure cards | A failure is information the user needs — don't suppress |
| Code modifications outside the skill's documented scope | If a skill is asked to do X and would modify Y to make X work, that's a scope expansion the user must authorize |
| Resolution of merge conflicts in worktree finishing | Conflict resolution requires intent the model cannot infer |
| Design intent (when manifesto value is `none` AND skill detects creative work) | Creative direction is user-only when explicitly left open |

## Forbidden under auto

The model is explicitly forbidden from inserting model-side reality-checks beyond what skill steps prescribe. Specifically banned:

- Size-driven scope checks ("this spec is large — should I split it?") — the shape gate handles structural signals; size is not a signal
- Context-window concerns ("the context is getting large — should I summarize?") — context management is the harness's job
- "Just checking in" prompts mid-flow
- Re-asking decisions already answered by the Config Manifesto
- Inserting "are you sure?" prompts before reversible authorized actions
- Bulk-resolve fast paths for the ledger resolve gate (always per-item)
- Pre-emptively stopping the pipeline over speculative concerns

If the skill genuinely needs information not in the Config Manifesto, it logs `NEEDS_CONTEXT` to the auto-decision log and surfaces it at the Review Console — it does not stop mid-flow.

## Per-skill compliance

The canonical per-stop behavior table is the "What `auto` silences" / "What `auto` does NOT silence" pair above. Each pipeline-participating skill MUST:

1. Reference this file in its Relationship table (e.g., `\| _shared/auto-mode-contract.md \| Single source of truth for auto-mode behavior \|`).
2. When implementing an auto branch, follow the "Skill integration pattern" below (read pipeline config → project policy → skill default → log entry).
3. Resist the urge to redeclare semantics inline. If a skill needs a per-stop quick reference, link to the relevant row in the silences table rather than duplicating it.

Per-skill `## Auto-mode behavior` tables in SKILL.md are deprecated as of v4.7.0 — the silences table is the single source of truth. Drift between two copies (skill-local and contract-canonical) was the failure mode they were meant to prevent and instead enabled.

## Adding a new policy lever

Extending the Manifesto with a new lever (as `unattended-tier` did, becoming lever #9, and `ceremony-profile` after it, becoming lever #10) touches more files than the lever's own logic. Checklist, grounded in gaps this exact addition initially missed and caught only at whole-branch review:

1. **This file** — add the lever name to the Bookend Architecture's computed-levers list (above); add its row(s) to "What `auto` silences" / "does NOT silence" if it changes either list; add a caveat anywhere an existing table row's guarantee narrows.
2. **`flow/SKILL.md`** Step 3 — add the lever name to the levers-computed sentence.
3. **`flow/manifesto.md`** — the lever needs an entry in *every* one of: the suppression-rules table, the canonical numbering line, the illustrative Policy Levers example table, the Suppressed/Valid-overrides footer, the Override Semantics table, the Recommendation Defaults table, and the `config.yml` schema example.
4. **`help/reference-card.md`** and **`help/context-flow.md`** — both files independently enumerate the full lever list ("every policy lever" / the `config.yml` consumer row) and sit outside the Manifesto's own file tree — easy to miss entirely, and the only two gaps a whole-branch review caught that no task-level review touching the Manifesto files themselves could have seen.
5. **The enforcement skill file(s)** the lever actually gates — where the new behavior lives.

Verify with a grep for the lever's kebab-case name across `skills/` and root `CLAUDE.md` before considering the addition complete — a zero-hit file that should have one is the failure mode this checklist exists to prevent.

## Skill integration pattern

When a skill has a historical mid-flow stop, rewrite it like this:

```markdown
### Step N: {decision name}

**Interactive mode:** call `AskUserQuestion` with the options below and wait.

**Auto mode:**
1. Read pipeline config from `{run-dir}/config.yml` (resolve `{run-dir}` via `PIPELINE_RUN_DIR` env var or most-recent matching run under `.claude-tweaks/pipelines/`) for `{policy-key}` → if set, apply.
2. Else read project policy from CLAUDE.md → if set, apply.
3. Else apply skill default: `{skill-default-value}`.
4. Log to auto-decision log (append under `## /{skill}` heading in `{run-dir}/decisions.md`):
   `- AUTO {HH:MM:SS} — {step name}: applied {value}. Reason: {policy-source}. Reversibility: {high|med|low}.`
5. If reversibility != high OR confidence != high OR severity > low → stage instead:
   `- STAGED {HH:MM:SS} — {step name}: {what was found}. Stage path: staged/{slug}.{ext}.`
   Surface at the Wrap-Up Review Console.
```

## Failure-mode contract

`auto` shifts the failure mode from "ask the user" to "fail loud at the gate." Skills under `auto`:

- Must reach a gate or successful completion without prompting (except for "What auto does NOT silence")
- Must surface failures via the ledger and the failure card, not mid-pipeline questions
- Must NOT swallow failures to "keep things automatic" — silent failure is worse than loud failure

The user's contract under `auto` is: "I trust the pipeline; if it can't proceed, stop and tell me why — don't ask me to make decisions you should be making."

## Anti-Patterns

These are the failure modes this contract prevents. If you (the model) catch yourself about to do one of them under `auto`, stop.

| Anti-pattern | Why it's wrong |
|---|---|
| Inserting a "Pipeline reality check" or "I want to surface a concern before we proceed" mid-pipeline | The user said `auto`. Concerns belong in the ledger or final summary, not as blocking prompts. |
| Offering "three paths forward" when the skill prescribes one | If the skill defines a default, take it. If not, that's a skill bug — fix the skill. |
| Treating `auto` as authorization to bulk-resolve the ledger | The resolve gate Phase 2 is non-negotiable. Per-item input always. |
| Filing work records autonomously because a finding "obviously belongs there" | Each record needs user approval. "Obvious" is the model's judgment, not the user's. This still holds by default — `unattended-tier` (see `_shared/unattended-tier.md`) is a separate, explicit, project-level opt-in with its own floor and audit trail, not a model deciding something is "obvious" on its own. |
| Adding more model-side reality-checks "to be safe" | The contract is the safety. Model-added prompts under `auto` are contract violations. |
| Stopping the pipeline because of context-window concerns the user didn't raise | Pre-emptive stops violate `auto`. Loud failure at gates only. |
| Re-asking a question the user already answered with `auto` or in the Config Manifesto | If the user answered upstream, don't ask again per skill. |
| Skipping the auto-decision log entry | Silent automation without an audit trail is forbidden. Always log. |
| Auto-applying severity:medium or severity:high findings | Severity floor exists for a reason. MED and HIGH need user judgment. |
| Honoring pipeline config from a different date's pipeline file | Pipeline configs are per-invocation. Always read the one matching the current pipeline date stamp. |
| Forwarding the Config Manifesto's full answer set into every subagent prompt | Subagents work on their own scope. Pass only policies that affect their decisions. |
