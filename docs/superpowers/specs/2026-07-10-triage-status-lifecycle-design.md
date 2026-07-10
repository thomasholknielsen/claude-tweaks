# Triage skill + unified status lifecycle — Design

## Problem

`/flow`'s issue-sourced batch mode (`--from-code-health`/`--from-label`/
`--from-issues`/`--from-milestone`, `--quick-wins`, risk-ordered batching —
`flow/from-code-health.md`, `flow/steps-and-gates.md`) conflates two different
jobs: **selecting** which issues to build, and **executing** the build itself
(derive spec, build, test, review, wrap-up). `flow/routine-template.yml`'s
scheduled routine runs `/claude-tweaks:flow --from-label agent:go
--require-eligible auto worktree` headless — one skill doing both selection and
execution.

Separately, authorization for headless dispatch today uses two labels,
`agent:eligible` (a general-purpose "may this ever be considered by any
selector" check) and `agent:go` (the standing "please build this" request the
default routine selects on) — a split whose only real justification was
supporting *multiple* selectors independently. Once selection lives in exactly
one place, that justification disappears.

There's also a visibility gap in the status lifecycle: `status:in-progress` is
the only status label today, so "queued, never attempted" and "attempted,
failed a gate, silently retrying forever" look identical to anyone scanning
issues — and there's no ceiling on retries at all.

Finally, there's a real, higher-consequence question underneath all of this:
given that code-health can file "a great deal" of issues daily, and one-by-one
manual authorization doesn't scale, what's the *safe* way to let some of that
get automated end-to-end — including all the way through merge — without
that becoming an AI auto-authorizing its own work?

## Solution

### A. New skill: `/claude-tweaks:triage`

Owns everything `/flow`'s issue-sourced batch mode used to. One skill, two
invocation shapes:

**Bare invocation, `/claude-tweaks:triage`** (interactive, human-run
periodically): pulls every code-health/harness-health issue carrying no
`status:*` tier label yet. For each, computes a recommended tier via the Tier
Rule (Solution C) and renders the standard batch table (issue #, title, risk,
effort, recommended tier) with one `AskUserQuestion` apply-all/override gate.
On confirm, writes the resulting `status:*` label via `gh issue edit`.

**`/claude-tweaks:triage dispatch`** (headless, runs on the routine's cron):
pulls every issue labeled `status:approved` or `status:fast-track`, claims
each (`refs/claims/issue-<n>`, `status:in-progress` alongside), and hands it
to `/claude-tweaks:flow <issue-ref>` for pure execution — no filtering logic
of its own beyond "does it carry a tier label."

`flow/routine-template.yml` is retargeted to invoke `/claude-tweaks:triage
dispatch` instead of calling `/claude-tweaks:flow --from-label agent:go
--require-eligible` directly.

### B. `/flow` becomes a pure executor

Remove the entire issue-sourced-batch mode: `--from-code-health`, `--from-label`,
`--from-issues`, `--from-milestone`, `--quick-wins`, `--require-eligible`, and
`from-code-health.md` in full. `/flow` accepts a spec number (existing,
unchanged) or an issue reference handed to it by `/claude-tweaks:triage
dispatch` — in the latter case it runs the existing `/specify`-derive-then-
build procedure for that one issue and nothing else. `/flow` never selects,
filters, sorts, or batches issues itself again.

### C. Unified `status:*` lifecycle — replaces `agent:eligible`/`agent:go`/`agent:fast`

One namespace holding two coexisting concerns, not one linear enum: a **tier**
(persists across a run, human-set only, mutually exclusive with the other tier
values) and a transient **execution marker** (set by the dispatch mode,
coexists alongside whichever tier is present).

| Label | Kind | Meaning |
|---|---|---|
| *(none)* | — | Never triaged — today's bypass/manual state, invisible to `/claude-tweaks:triage` |
| `status:needs-review` | tier | Triager flagged this — signals warrant a closer human look before authorizing anything. Never reaches `/flow`. |
| `status:approved` | tier | Build it, full pipeline, human approves the merge (was `agent:go`) |
| `status:fast-track` | tier | Build it, full pipeline, auto-merge only if the run comes back clean (was `agent:go` + `agent:fast` combined) |
| `status:in-progress` | execution | Currently claimed and being built — cosmetic mirror of the claim ref, no locking semantics of its own |
| `status:blocked` | execution | Hit the retry ceiling — needs a human look, no longer retrying automatically |

**Tier Rule** (mechanical, the only rule the bare invocation's recommendation
uses — no separate discretionary judgment layered on top): `risk:low AND
effort:low → fast-track`, else `→ approved`. (Code-health's `confidence` score
is a pre-filing decision input, not a persisted label — every filed issue
already cleared whatever confidence bar applied before it existed, so the
rule only ever checks the two labels that actually exist on the issue:
`risk-<tier>` and `effort-<tier>`.)

The human still explicitly executes the batch-confirm that writes the label —
even when that's a single "apply all recommended" click every time. This is
the load-bearing security boundary (GitHub's own triage-permission model as the
gate against prompt-injected issue content), not a discretionary nicety: the
rule can decide the recommendation, but only a human action writes it.

**`agent:eligible` is dropped.** Its only justification — a general-purpose
check usable with *any* `/flow` selector — no longer applies once selection
lives solely in `/claude-tweaks:triage`, which only ever pulls on the tier
labels. A second label serving the same purpose as `agent:go` bought nothing
once there was exactly one selection path left.

**Failure-downgrade rule:** any failed run downgrades `fast-track` →
`approved`. A retry that didn't come back clean the first time doesn't get
another unsupervised shot at auto-merge — its next attempt, however it turns
out, waits for a human's merge approval.

**Retry ceiling:** after N=3 consecutive failures (configurable via a
CLAUDE.md/`policy.yml` flag, `triage-retry-ceiling`, default 3), the dispatch
mode strips the tier label, sets `status:blocked`, and sends a
`PushNotification`. Each failed attempt first posts a comment (`Attempt {n}
failed: {reason}. Claim released, will retry.`) rather than writing to a
hidden marker — the dispatch mode counts these comments to track the ceiling,
and a human glancing at the issue sees exactly what happened on every attempt
without needing to reconstruct it from `decisions.md`.

### D. Auto-merge gate model (fast-track only)

Four independent, deterministic layers. All must pass; any single failure
falls back to Standard (wait for `/wrap-up`'s Review Console) — never errors,
never proceeds anyway. No LLM re-judges "is this risky" at the gate itself —
the gate is pure arithmetic over already-produced structured outputs, so the
system's own risk assessment is never what authorizes skipping review of its
own work.

1. **Authorization** — `status:fast-track` present (a human tiered this)
2. **Pre-scored eligibility** — already enforced by the Tier Rule at triage
   time (only `risk:low`+`effort:low` issues are ever tiered `fast-track` to
   begin with)
3. **Runtime cleanliness** — zero hard-gate failures, and `/review`'s Step 3
   Routing produced nothing at Medium severity or above (only Low findings,
   which already auto-apply today, are compatible with "clean")
4. **Blast radius** — the diff only touches files the original finding's
   fingerprint/anchor pointed at, and stays under a size cap (proposing 40
   changed lines / 2 files as a starting default, configurable)

**Wrap-up's other output still surfaces.** A headless `/flow`-dispatched run
ends at `/wrap-up`'s own Review Console, which already renders up to six
sections (Auto-applied / Pending review / Low-confidence / Contested / Skill
updates / Configuration updates). Fast-track auto-merge skips the *blocking
wait* for a live approval, not the *content* — the full Review-Console-
equivalent summary, including any skill-curation suggestions or leftover
ledger items wrap-up surfaced, is still generated and attached to the
auto-merge notification as a non-blocking FYI. Nothing wrap-up finds is
silently dropped just because the merge itself didn't wait for a click.

Every auto-merge: a distinct commit-message tag (`[fast-lane]`, for easy `git
log` spotting and reverting), a `decisions.md` entry citing exactly what
"clean" meant for that run, and its own `PushNotification` — a plain FYI,
distinct in purpose from any "needs action" notification, since a fast-lane
merge needs no action but is worth passive awareness of.

### E. `/help` dashboard additions

A new stage in `help/status-scan.md` surfacing three cheap counts (detail
stays `/tidy`'s and `/claude-tweaks:triage`'s job, not `/help`'s):
pending-authorization backlog size ("N issues awaiting your decision — run
`/claude-tweaks:triage`"), `status:blocked` count, and a rolling "N
auto-merged this week (fast-lane)" line.

## Out of scope (YAGNI)

- **A general "N labels, arbitrary tiers" system.** Three tier values
  (`needs-review`/`approved`/`fast-track`) cover the motivating cases; nothing
  here assumes more tiers will be needed.
- **Automated escalation beyond `status:blocked`.** Hitting the retry ceiling
  strips the tier and notifies — it doesn't attempt any smarter recovery
  (e.g. auto-filing a follow-up issue). A human decides what happens next.
- **Letting the headless dispatch mode itself add `status:fast-track`/
  `status:approved`.** Only the interactive (bare) invocation, human-confirmed,
  ever writes a tier label — `/claude-tweaks:triage dispatch` only ever reads
  them.

## Key decisions (from conversation)

| Decision | Choice |
|---|---|
| Selection logic's home | New `/claude-tweaks:triage` skill (bare invocation = interactive triage, `dispatch` subcommand = headless), not `/flow` |
| Skill name | `triage`, not `dispatch` — names the interesting decision (assess risk/effort, decide treatment) rather than the mechanical hand-off that follows it |
| `/flow`'s scope | Pure executor — accepts a spec number or a handed-off issue reference, never selects/filters/sorts issues itself |
| Label namespace | Unified under `status:*`, not a separate `agent:*` namespace |
| Tier vs. execution state | Two coexisting concerns under one prefix (tier persists, execution marker is transient), not one linear FSM |
| Tier assignment | Mechanical rule (`risk:low AND effort:low → fast-track`), not per-issue discretionary judgment |
| `agent:eligible` | Dropped — its justification depended on multiple selectors, which no longer exist |
| Fast-track after a failure | Downgrades to `approved` — no unsupervised retry of the fast path |
| Retry ceiling | N=3 (configurable), tracked via failure comments (visible), not a hidden marker |
| Auto-merge gating | Four independent deterministic layers, fail-closed direction (any failure = more human involvement, never less) |
| Wrap-up's other findings on a fast-lane merge | Still generated and attached as non-blocking FYI — never dropped |

## Testing / verification approach

1. Author the new `/claude-tweaks:triage` skill's bare (interactive) invocation
   against a repo with a mix of `risk-low`/`effort-low` and higher-tier
   code-health issues — confirm the recommended-tier column matches the Tier
   Rule exactly, and that applying "recommended" writes the correct `status:*`
   label per issue.
2. Confirm `/claude-tweaks:triage dispatch` only ever pulls
   `status:approved`/`status:fast-track` issues, claims each, and hands off to
   `/flow <issue-ref>` — verify it never reads `risk-<tier>`/`effort-<tier>`
   itself (that's the interactive invocation's job only).
3. Run a fast-track issue through a deliberately "dirty" pipeline (inject a
   Medium-severity review finding) — confirm it falls back to Standard and
   parks at Review Console rather than auto-merging.
4. Run a fast-track issue through a clean pipeline with an oversized diff —
   confirm the blast-radius cap alone is sufficient to force the Standard
   fallback.
5. Fail a `status:approved` issue's build three times — confirm the third
   failure strips the tier, sets `status:blocked`, and fires a notification;
   confirm each attempt posted its own failure comment.
6. Confirm a fast-track issue that fails once and later succeeds on retry
   waits for a human merge approval (failure-downgrade rule), rather than
   auto-merging on the eventual clean run.
