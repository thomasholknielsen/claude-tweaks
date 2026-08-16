---
name: reflect
description: Use when you want to step back and evaluate recent work through structured lenses — approach correctness, structural debt, surprises, near-misses. Works standalone or as a step within /claude-tweaks:review and /claude-tweaks:wrap-up.
argument-hint: "[hindsight|full|light] [<spec-number>|<file-path>...]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Reflect — Structured Evaluation of Recent Work

Step back from implementation and evaluate what was built through structured lenses. Surfaces improvements, surprises, and patterns worth capturing — before they fade from context. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │                        │
                                                     └──────── /claude-tweaks:reflect ────────┘
                                                       component called from review (Step 4, hindsight mode)
                                                       and wrap-up (Phase 1, full or light mode)
```

## When to Use

- After any implementation work — you want a second look before moving on
- During `/claude-tweaks:review` Step 4 — invoked in **hindsight** mode
- During `/claude-tweaks:wrap-up` Phase 1 — invoked in **full** mode, or **light** mode when the run's `ceremony-profile` is `fast-lane`
- After a small fix, when a full five-lens pass is more ceremony than the change warrants — invoke standalone in **light** mode for a cheap three-lens pass
- After a debugging session or refactor — capture what you learned
- After conversation-based work that had no formal review

## Modes

| Mode | Lenses | Invoked by | Best for |
|------|--------|------------|----------|
| **hindsight** | Approach, Structure, Consolidation, Convention, Skills | `/claude-tweaks:review` Step 4 | Pre-ship "should we change something?" gate |
| **full** | All five lenses (Surprises, Approach, Near-misses, Fresh start, Friction) + Tradeoff review | `/claude-tweaks:wrap-up` Phase 1 | Post-review knowledge capture |
| **light** | Near-misses, Fresh start, Friction (no tradeoff review) | `/claude-tweaks:wrap-up` Phase 1, when `ceremony-profile: fast-lane`; or direct invocation with the `light` keyword | Cheap post-review capture for a fast-lane record, or a quick standalone pass after a small fix |
| *(default)* | **full** when standalone | Direct invocation | General-purpose reflection |

## Input

`$ARGUMENTS` controls scope and mode.

### Standalone (invoked directly):

1. **Mode keyword** — `hindsight`, `full`, or `light` (default: `full`)
2. **Scope** — spec number, file paths, or omitted:
   - Spec number (e.g., `42`) → scope to files changed for that spec
   - File paths → scope to those files
   - No scope → use `git diff` against the base branch or recent commits

```
/claude-tweaks:reflect                     → full mode, scope from git diff
/claude-tweaks:reflect 42                  → full mode, scope from spec 42
/claude-tweaks:reflect hindsight           → hindsight mode, scope from git diff
/claude-tweaks:reflect hindsight 42        → hindsight mode, scope from spec 42
/claude-tweaks:reflect light               → light mode, scope from git diff
/claude-tweaks:reflect src/api/ src/db/    → full mode, scope to those directories
```

Standalone `light` mode runs the same three lenses as pipeline-invoked light mode (see `light-mode.md`), with no ceremony-profile to seed from or downgrade — there is no `config.yml` in a standalone invocation, so the escape-hatch/ceremony-downgrade behavior described in `light-mode.md` is simply a no-op here.

### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Mode** — `hindsight` (from `/review`) or `full`/`light` (from `/wrap-up`; `light` when the run's
  `ceremony-profile` is `fast-lane`, `full` otherwise)
- **Scope** — changes already analyzed by the parent
- **Ledger phase** — `review/hindsight` (from `/review`) or `wrap-up` (from `/wrap-up`)
- **Seed context** (full and light modes only) — review summary, key learnings, tradeoffs accepted

When no ledger phase is provided (standalone), use `reflect` as the default phase.

## Step 1: Gather Context

> **Parallel execution:** Use parallel tool calls aggressively — all Read, Grep, and Bash operations for context gathering are independent and should run concurrently.

1. **Identify changed files** — from scope resolution above
2. **Read the changed files** — understand what was built
3. **Read git log** — understand the sequence of changes, commit messages, any false starts
4. **Check for existing context** — spec file, review summary, ledger entries

## Step 2: Run Lenses

Mode-specific lens procedures live in sub-files (a given invocation only uses one):

- **Hindsight mode** → see `hindsight-mode.md` in this skill's directory (5 evaluations, action gate)
- **Full mode** → see `full-mode.md` in this skill's directory (5 lenses + tradeoff review; superset of hindsight)
- **Light mode** → see `light-mode.md` in this skill's directory (3 lenses, no tradeoff review; narrowed subset of full, for `ceremony-profile: fast-lane` wrap-ups or standalone with the `light` keyword)

**Standalone-only `[Use: Frontier]` singleton (record #221).** When this run is **standalone** (per the Component-Skill Contract's component-invoked ⇒ no dispatch / standalone ⇒ dispatch rule below), the main thread assembles one artifact bundle — Step 1's gathered context (changed files, git log, existing spec/review/ledger context) and the resolved mode's lens file (`hindsight-mode.md` / `full-mode.md` / `light-mode.md`) inlined in full — and dispatches **one** Task agent (never a loop, never a parallel fan-out) to run every lens in that single pass, resolved via `node bin/resolve-profile.js frontier --run-dir "$PIPELINE_RUN_DIR"` (`--unattended` in a headless context; degrades to Capable per the resolver's own preconditions, logged in its `source` — never re-enumerated here). Output template: the agent returns, per lens, the same finding shape Step 3 already routes (`{lens name, finding summary, category}` — a plain list, one entry per finding, empty list when a lens found nothing). The dispatch structure never branches on which model the resolver returns — only the model differs. When this run is **component-invoked**, skip this dispatch entirely and run the lens procedure inline in the main thread exactly as today (no Task agent, no resolver call) — this is what "component-invoked ⇒ no dispatch" means mechanically.

## Step 3: Route Findings

### Auto mode (policy-driven routing — shared across every mode)

> **Canonical reference:** `_shared/auto-mode-contract.md` defines what `auto` may and may not silence — read it before adding or changing any auto-mode handling here. Every auto-resolution MUST write an entry to the auto-decision log per `_shared/auto-decision-log.md` (path: `{run-dir}/decisions.md`, canonical entry schema lives there). Silent automation without an audit trail is forbidden.

When a pipeline run directory exists, route findings by category without prompting:

**Classify first.** Route every insight through `skills/_shared/learning-routing.md` before applying any row below. A D4 (memory) or D5 (upstream) outcome is staged for approval and applied only via its own gate — the Review Console's batch "Approve all" at `supervised`/`trusted`, or auto-resolution under `consoleAutoResolve` at `unattended` — regardless of what the rows below would otherwise do.

| Finding type | Default routing | Log entry |
|---|---|---|
| Safety regression (security, data loss, broken invariants — e.g., token expiry bug, auth bypass, dropped writes, resource leak, race condition on shared state) | KEPT-PROMPT — surfaces inline; cannot defer safety findings autonomously | `KEPT-PROMPT {time} — Step 3: safety finding "{summary}". Surfaced inline.` |
| Convention drift, code smell, simplification opportunity | STAGED — write to `staged/reflect-{n}.md`. Surface at Wrap-Up Review Console. | `STAGED {time} — Step 3: convention finding "{summary}". Stage path: staged/reflect-{n}.md.` |
| Tangential idea (new feature, alternative design) | STAGED → backlog work-record candidate. Surfaces at the Wrap-Up Review Console's Queue writes section, following `_shared/auto-mode-contract.md`'s tiered stance — folded into the batch "Approve all" at `supervised`/`trusted`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` at `unattended`. | `STAGED {time} — Step 3: tangential idea "{summary}" — backlog candidate — landing: {born-ready|needs:definition} (defer-reason: tangential). Surface at the Queue writes gate.` |
| Pattern observation, design tradeoff acknowledgment | STAGED — write to `staged/reflect-{n}.md`. Most go to skill updates handled by `/claude-tweaks:wrap-up`'s Skills curation row. | `STAGED {time} — Step 3: pattern observation "{summary}". Stage path: staged/reflect-{n}.md.` |

Default behavior: **defer everything** to the Review Console. The exception is safety regressions, which always surface inline.

**Stage-file format** (`{run-dir}/staged/reflect-{n}.md`):

```markdown
# Reflect — staged finding {n}

**Category:** {convention | tangential | observation}
**Severity:** {low | med | high}
**Reversibility:** {high | med | low}
**Source:** {full | hindsight | light} mode, lens "{lens name}"
**Causal:** {terminal | systemic — omit this line entirely when the finding did not go through a causal-depth chain walk}
**Files:** {comma-separated paths or "general"}

## Finding

{1-3 sentences. What was observed; why it might matter.}

## Suggested resolution

{Optional. Concrete change or routing recommendation.}

## Decision-log reference

{Copy the matching `STAGED …` line from `decisions.md` so the Console can cross-link.}
```

For a **tangential** finding specifically — the one category that becomes a Queue-writes record
proposal (see `review-console.md`'s "On approval" step 5 and `flow/multispec-review-console.md`,
both of which read a `Title:`/`Type:`/`Labels:` header off the staged file to create the record) —
prepend a 4-line header above the `# Reflect —` line, the same shape `wrap-up/leftover-routing.md`
step 3 writes for `leftover-{slug}.md`. The body below the header is composed via `specShapedBody`
(the finding → Current State, the proposed change → Deliverables, the observable outcome →
Acceptance Criteria; `header: ''`; `filedBy: 'reflect'`; `provenance: { origin: 'reflect {mode} from #{n}', deferReason:
'tangential' }`; footer `_Filed by \`reflect\` via specShapedBody._`) — with the `# Reflect —
staged finding {n}` title line and `**Category:**` line kept above it; a finding whose own text
names an open choice uses the composer's `openQuestion` variant and lands `needs:definition` (no
`ready`, no scoring). Labels: scored + `ready` (born-ready) on the AC path, per
`_shared/work-record.md`'s `/reflect` row:

```markdown
Title: {short work-record title}
Type: {bug | feature | task}
Labels: {comma-separated labels or "none"}
Defer-reason: tangential

# Reflect — staged finding {n}

**Category:** tangential

{specShapedBody output — Origin:/Defer-reason: provenance lines, then ## Current State / ## Deliverables / (## Acceptance Criteria | ## Open Question), then the _Filed by `reflect` via specShapedBody._ footer}
```

The non-tangential format's `Severity:`/`Reversibility:`/`Source:`/`Files:`/`Decision-log reference` fields are dropped on the tangential variant — the composed sections carry that content, and nothing downstream reads those fields off a queue-write proposal.

Without this header the Console's record-creation step has nothing to read a title, type, or
labels from — it is required whenever `**Category:** tangential`, and omitted for `convention`/
`observation` findings (those are never Queue writes). The `Defer-reason: tangential` line is category-first by rule (`_shared/deferral-gate.md`): a tangential finding is by definition not a fix to the current work, so its reason is its category; the other five vocabulary values apply only to non-tangential findings.

Number `{n}` is a per-run sequence counter — increment as each staged file is written so multiple stages in one run never collide.

### Interactive mode (batch user routing — differs by mode)

- **Hindsight mode** → see `hindsight-mode.md` (Implementation Hindsight batch table + recommendation rules)
- **Full mode** → see `full-mode.md` (Reflection Insights batch table + routing guide)
- **Light mode** → same mechanics as full mode (see `full-mode.md`'s Interactive mode section); only the lens set feeding the table narrows

## Step 4: Ledger Integration

**Write all findings to the open items ledger** (see `/claude-tweaks:ledger`):

| Context | Phase | Behavior |
|---------|-------|----------|
| Invoked by `/claude-tweaks:review` | `review/hindsight` | Write findings. Status: `open` for "Change now" (then `fixed` after changes); `deferred` for "Defer" and "Capture" (both result in a new backlog record — directly for Defer, via `/claude-tweaks:capture` for Capture); `accepted` for "Accept as-is" (state the reason in the entry body). |
| Invoked by `/claude-tweaks:wrap-up` | `wrap-up` | Write insights. Status: `open` for "Implement now" (then `fixed` once implemented); `deferred` for "Defer" and "Capture" (both result in a new backlog record — directly for Defer, via `/claude-tweaks:capture` for Capture); `accepted` for "Don't capture" (state the reason in the entry body, per the Anti-Patterns table). |
| Standalone, ledger exists | `reflect` | Write findings/insights to existing ledger, using the same status mapping as above. |
| Standalone, no ledger | *(skip)* | Present findings without ledger tracking. |

## Step 5: Report

When invoked directly (not by a parent skill), present findings and end with the Next Actions block below. When invoked by a parent, omit Next Actions — the parent handles flow control.

## Next Actions

When invoked directly (not by a parent skill), render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`/claude-tweaks:review {spec}`** — full code review (recommended)
`/claude-tweaks:test {spec}` — verify changes from reflection
`/claude-tweaks:wrap-up {spec}` — capture learnings and clean up

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 4, `hindsight` mode) and `/claude-tweaks:wrap-up` (Phase 1, `full` or `light` mode). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/review`, `/wrap-up`, or other pipeline orchestrators) — or by an explicit `--source review` or `--source wrap-up` flag the parent passes instead. `/claude-tweaks:wrap-up` passes `--source wrap-up` on **every** run, standalone included, since its Phase 1 now creates a run directory unconditionally and `$PIPELINE_RUN_DIR` alone no longer distinguishes a pipeline from a standalone wrap-up; standalone `/review` passes `--source review` because it has no run directory of its own to set (per its own SKILL.md "always runs every step" including Step 4). When invoked by a parent (via either signal), omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (neither signal present), render Next Actions as shown above.

**Dispatch rule (record #221): component-invoked ⇒ no dispatch, standalone ⇒ dispatch.** The same two signals above — `$PIPELINE_RUN_DIR` set, or an explicit `--source` flag — that gate the Next Actions block also gate Step 2's Frontier-eligible singleton dispatch: either signal present means a parent already owns this run's dispatch budget, so Step 2 runs its lens procedure inline in the main thread with zero Task-tool dispatches of its own. Neither signal present (a direct, standalone invocation) means Step 2 dispatches its one singleton. This uses only the two documented signals — no new flag is added — and structurally prevents a `/wrap-up`-invoked `/reflect` from ever producing a dispatch of its own, since `--source wrap-up` is set on every wrap-up call, standalone included.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Accepting all hindsight findings as-is | "change now" items must be fixed at the action gate |
| Running full mode during review | Review needs the focused hindsight gate; full is for wrap-up or standalone |
| Skipping reflection for "simple" work | Simple work still surfaces surprises and near-misses |
| Silently dropping insights with no obvious destination | Every insight gets an explicit decision — even "don't capture" needs a reason |
| Generic findings ("improve error handling") | Cite the file, the pattern, the concrete change |
| Re-deriving insights already in Key Learnings | Use review's Key Learnings as seeds, don't re-analyze |
| Padding findings with praise before naming what's weak | Lead with the weakness — strengths are easy to see unaided |
| Manufacturing a finding to look thorough when the work is sound | "Nothing worth changing" is a valid outcome — don't invent one |
