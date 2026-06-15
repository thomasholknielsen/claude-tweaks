# `/recon` — Proactive, Recurring Repo-Improvement Finder

**Status:** Design complete (brainstorm). Pending decomposition into specs.
**Date:** 2026-06-14
**Origin:** A skill (`sweep`) was accidentally built inside `memenu-app`
(`docs/superpowers/artifacts/claude-tweaks-sweep/`). It belongs here. This design
**reconceives** that work for claude-tweaks rather than copying it: the existing
implementation is treated as **unreliable** (its own `PORT.md` confesses a
fully-broken `commit-registry`, fingerprint instability, and a `$SKILL_DIR` bug)
and **misaligned** with how this plugin's skills are built. 227 green tests test
what was built, which is the wrong shape.
**Metaphor:** a watchman doing rounds — a recurring, eventually-complete sweep
that keeps technical debt visible without a human driving each pass.

---

## 1. Summary

`/recon` is a recurring, **report-only**, project-agnostic skill that rounds a
repository over time, applies improvement lenses to a rotating slice, and files
the work worth doing as **GitHub issues** (deduplicated). It never edits code.

It is the **proactive front-end the plugin lacks**: today the lifecycle is
reactive (you bring a spec or a diff; it runs build → test → review → wrap-up).
`/recon` *generates* the work worth doing. One-liner: *the plugin reacts to
changes you make; `/recon` surfaces the changes worth making.*

The essence worth preserving (everything else from `sweep` is implementation
detail to rethink or drop):

1. **Proactive, not reactive** — the only thing that generates work.
2. **Recurring + eventually-complete coverage** — rounds the whole repo so
   nothing rots unseen.
3. **Durable, deduplicated cross-run memory** — findings persist, don't
   re-flood, and remember standing decisions. *The part the plugin genuinely
   lacks, and the only part that truly needs determinism.*
4. **Findings are pre-specs** — shaped to drop into the existing funnel.

## 2. Goals and non-goals

**Goals**
- Continuously surface improvement opportunities across an entire repo over
  time, without a human initiating each pass.
- Multi-lens: convention drift, rot/dead weight, dependency hygiene, oversized
  files, plus judgment lenses (architecture depth, simplification, review-style
  quality) — reusing existing skills' criteria, not reimplementing them.
- Work on **any** project; run on a Claude subscription (no separate API key).
- Keep signal clean: never re-report a known finding; remember standing
  decisions across runs (via GitHub issue state).
- Produce findings that drop into the implementation flow with near-zero
  translation.

**Non-goals**
- No auto-fixing, no auto-PRs, no auto-merge. Report-only.
- No new local backlog store. We already have four (see §6); `/recon` adds none.
- No auto-writing into INBOX. Promotion to INBOX is a triage choice, not default.
- Not a CI quality gate (CI stays reactive/blocking; `/recon` is proactive/advisory).

## 3. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Name | `/recon` | Scope the terrain, report back, never engage — captures report-only. |
| 2 | Autonomy | Report-only (surfacer) | Automates discovery; fixing stays with the human + existing build pipeline. |
| 3 | Form factor | One new skill + a `/flow` affordance | Triage is the tail of the run; "doing the work" is the existing lifecycle. No separate "act" skill. |
| 4 | Persistence | **GitHub issues are the durable sink**; only local state is a gitignored `.claude-tweaks/` dedup cache (rebuildable from issues) | Externalizes persistence, team-visible, free cross-run memory via issue state, and **adds no fifth backlog**. |
| 5 | Cross-run memory | Issue state: open = relevant, closed = resolved, `wontfix` label = standing decision | Replaces the old engine's `accept`/`wont-fix`/`regressed` machinery with GitHub's own lifecycle. |
| 6 | Surviving code | Minimal: fingerprint/dedup + cheap mechanical checks, in `bin/lib/` | The 14-file engine is reconceived, not copied. Code lives where the plugin already keeps Node. |
| 7 | Judgment lenses | Delegate to `/review` · `/deepen` · `/simplify` via **shared `_shared/` criteria fragments** | One source of truth for "what's worth flagging"; no duplicated judgment. |
| 8 | Coverage | Weighted area score + round-robin starvation floor | Bias to hot/important areas, but guarantee eventual full coverage. |
| 9 | Trigger | Claude Code Routine (subscription-billed) + on-demand `--dry-run` bootstrap | Native scheduling, no API key, GitHub access for filing issues. |
| 10 | Noise control | Only findings ≥ a severity/confidence threshold are filed; below-threshold are *remembered* (cache) but not filed | Keeps the issue tracker clean. |

## 4. Architecture

```
/recon run   (on-demand, or scheduled via a Routine)
   │  pick a rotating slice of the repo   (eventually-complete coverage)
   │  apply lenses → raw findings
   │  fingerprint each → dedup against OPEN issues (+ gitignored cache)
   ▼
 triage
   ├─ open issue exists      → skip (no flood)
   ├─ closed / wontfix       → stay silent (memory = issue state)
   ├─ worth tracking         → file GitHub issue  (label: recon, fingerprint marker)
   ├─ fuzzy / needs thought  → INBOX
   └─ ready to build         → /specify
   ▼
 do the work  → existing lifecycle:
                issue/spec → /build, or /flow (pulls `recon`-labelled issues as a batch)
```

Two layers:
- **Deterministic** (small Node helpers in `bin/lib/`): area selection/scoring,
  cheap mechanical lenses, fingerprint + dedup. Fast, reproducible, free.
- **Agentic** (LLM subagents via the subagent-output contract): judgment lenses,
  dispatched only against the top-K prioritized areas, reading the shared
  criteria fragments from §7. Cost is bounded by K and a subagent cap.

## 5. The skill: `/recon`

A standalone lifecycle skill. Two invocation modes:

- **Scheduled (headless Routine):** no human present. Discover → dedup → file
  issues for findings ≥ threshold → log a run summary. Triage happens later, in
  GitHub, by a human (close / `wontfix` / pick one up).
- **Interactive (on-demand):** present findings as the standard batch table;
  per finding the user routes to *file issue / INBOX / /specify / dismiss*.
  `--dry-run` writes nothing (bootstrap + smoke test).

The skill body is the orchestrator: select areas → run lenses → fingerprint →
dedup against open issues → file/route → summarize.

## 6. Avoiding redundancy (the core integration constraint)

The plugin already has these "things to do" stores:

| Store | Who writes it | Semantics |
|-------|--------------|-----------|
| `specs/INBOX.md` | human, via `/capture` | fuzzy ideas, curated, pre-spec |
| `specs/DEFERRED.md` | pipeline, during a run | known work consciously postponed |
| `specs/` (numbered) | `/specify` | committed, agent-sized work units |
| ledger | pipeline | per-run open items, spec-scoped |

A `/recon` registry would be a **fifth** store overlapping INBOX/DEFERRED in
*purpose* and differing only in *origin* (machine vs human). We avoid this by
splitting two things the old design conflated:

- **Cross-run memory** ("don't re-surface what I've seen/dismissed") — genuinely
  persistent → **GitHub issue state** (+ a rebuildable local cache).
- **A backlog** (the list of work to do) — already exists four times over → reuse
  it. `/recon` routes findings into issues / INBOX / specs; it owns none of them.

So discovery produces a **transient triage queue** (this run's findings), not a
store. The queue is drained every run. The only persistent local artifact is the
dedup cache, which is an optimization, not state.

## 7. Lens model + shared criteria

**Mechanical lenses** (deterministic, cheap, run broadly; `bin/lib/`): oversized
file, dead export, TODO/FIXME, dependency freshness, project lint/typecheck.
These have **zero overlap** with existing skills — nothing does repo-wide
mechanical scanning today.

**Judgment lenses** (LLM subagents, top-K areas): architecture depth,
simplification, review-style quality (correctness/convention/security/etc.). To
avoid reimplementing `/deepen` · `/simplify` · `/review`, their analysis criteria
are **extracted into shared fragments under `skills/_shared/`** that *both* the
reactive skills and `/recon`'s subagents reference. One source of truth; the
reactive skills get tighter as a side effect.

## 8. Finding → issue notation (a finding is a pre-spec)

Each filed issue carries the fingerprint (hidden marker in the body or a label)
and a body shaped to the `/specify` template, so promotion is near-zero
translation:

- **title** → spec title
- **files / evidence** → Current State
- **suggestion** → Deliverables
- **acceptance** → Acceptance Criteria
- **labels** → `recon`, severity (`recon:high`…), category (`/review` enum collapsed
  to the INBOX 4-value enum when routed to INBOX: code→technical, UX→product,
  license→legal, infra→infrastructure)

**Fingerprint** = hash of `(lens + areaId + normalized signature)`, with line
numbers / whitespace / volatile identifiers stripped so cosmetic edits don't
mint a new id (the top engineering risk; the old engine got this wrong twice).

## 9. Dedup + lifecycle (via issue state)

On each run, each finding's fingerprint is matched against existing `recon`-labelled
issues:

- Matches an **open** issue → bump (comment/skip), don't file again. (No flood.)
- Matches a **closed** issue, and the finding reappears → reopen with a
  "regressed" note. (Regression alert.)
- Matches a **`wontfix`** issue → suppress. (Respect the standing decision.)
- New fingerprint ≥ threshold → file a new issue.
- New fingerprint < threshold → record in the cache only (remembered, not filed).

The cache mirrors fingerprint→issue/dismissed so a run can dedup without a full
issue query, and is rebuildable from the issue list if lost.

## 10. The `/flow` affordance

`/flow` gains a mode to pull a batch of open `recon`-labelled issues (optionally
filtered by severity/area), run each through `/specify`, and execute the pipeline
— reusing the existing multi-spec batching + Review Console. This is the only
change to an existing skill besides §7. No new "act" skill.

## 11. Trigger and billing

**Substrate:** Claude Code Routines (`/schedule` or `claude.ai/code/routines`).
Subscription-billed, native scheduling, GitHub access to file issues. Design for
**small predictable sips**: tight per-run budget (K = 1–3 areas, capped subagent
fan-out), scheduled off-peak. A skipped/rejected run is harmless — the
round-robin floor means coverage resumes next window.

(The old SKILL.md baked in dated, speculative billing claims tied to 2026-06-15.
Drop them; keep a single neutral note: "Routines run inside the subscription;
verify any automation-credit specifics against the live account.")

## 12. claude-tweaks integration + conventions

- **Skill file:** `skills/recon/SKILL.md`, `name: claude-tweaks:recon`,
  auto-discovered. Standard preamble, interaction-style directive, Anti-Patterns,
  Component-Skill Contract keyed on `$PIPELINE_RUN_DIR`, Relationship table,
  `## Next Actions`.
- **Relationship back-references (bidirectional — both sides updated):** `/recon`
  references `/specify`, `/capture`, `/tidy`, `/flow`; each of those gets a
  `/recon` row.
- **Doc-sync surface:** README, `/help` reference card + workflow diagrams +
  artifact lifecycle diagram, the CLAUDE.md skill catalog + "skills with
  sub-files" table, version bump (4.17.0 → 4.18.0), and the **marketplace repo**
  (`marketplace.json` version mirror + description).
- **Code home:** Node helpers in `bin/lib/`; co-located tests under the repo test
  convention (extend `node --test` discovery to `bin/lib/` or add a glob).
- **No committed registry / no gitignore carve-out:** the only local file is the
  gitignored `.claude-tweaks/` cache.

## 13. Phasing (each phase = its own spec)

- **Phase 0 — Shared criteria extraction.** Extract `/review` · `/deepen` ·
  `/simplify` analysis criteria into `skills/_shared/` fragments; rewire those
  three skills to read from them; re-verify. Chosen up-front for a clean
  dependency order (so `/recon` builds on stable, shared criteria).
- **Phase 1 — Spine.** `/recon` with **mechanical lenses only** + fingerprint/
  dedup + GitHub issue filing + on-demand `--dry-run`. No LLM, no redundancy.
- **Phase 2 — Judgment.** Add judgment lenses as area-scoped subagents reading
  the Phase 0 fragments, with model-tier control and caps.
- **Phase 3 — Autonomy.** Wire the Routine, the `/flow` pull-issues affordance,
  coverage/scoring tuning, regression reopen, fingerprint-churn monitoring.

## 14. Source migration + cleanup (memenu-app)

Final state has **zero `recon`/`sweep` residue in memenu-app**. Remove, after the
skill is safely in claude-tweaks:

- `docs/superpowers/artifacts/claude-tweaks-sweep/` (the whole artifact tree)
- `docs/superpowers/specs/2026-06-14-sweep-recurring-repo-improvement-finder-design.md`
- `docs/superpowers/plans/2026-06-14-sweep-m1a…m3-m4*.md` (six plan docs)
- `.claude/skills/` reference to sweep, if any

Salvage value before deletion: the fingerprint-normalization and dedup-lifecycle
logic (and the bugs already found) inform Phase 1's deterministic helpers, even
though the code is rewritten.

## 15. Testing

- Unit (deterministic layer): scoring (fixtures → ranking), fingerprint
  (stability across cosmetic diffs), dedup decision table (every transition),
  issue-payload projection.
- Lens contracts: validated subagent output with mocked agents.
- `--dry-run --area <x>`: no issues filed; powers the bootstrap + smoke tests.
- Idempotency: two runs on identical state file zero new issues on the second.

## 16. Open questions and risks

- **Fingerprint stability** (top engineering risk): the old engine minted new ids
  on cosmetic edits twice. Conservative normalization + a churn metric to tune it.
- **GitHub auth in scheduled runs:** confirm the Routine env can file issues
  non-interactively.
- **Lens noise/tuning:** judgment lenses will be noisy until calibrated; the
  threshold + `wontfix` memory absorb this over time.
- **Test discovery:** extend `node --test` to cover `bin/lib/` additions.
- **Billing model:** verify Routines/automation-credit specifics against the live
  account before relying on "spare capacity."

## 17. Glossary

- **Area:** a sweep unit (a workspace or a subdivision of one).
- **Lens:** one improvement perspective applied to an area (mechanical or judgment).
- **Finding:** one improvement opportunity, fingerprinted, with a status derived
  from its GitHub issue.
- **Triage queue:** the transient, per-run set of findings (not a store).
- **Round-robin floor:** the staleness threshold that forces eventual coverage of
  every area.
