# Recon v2 — LLM-as-Code-Judge, Scheduled Routine

**Status:** Design complete (brainstorm). Pending decomposition into specs.
**Date:** 2026-06-15
**Supersedes:** the v1 design (`2026-06-14-recon-proactive-repo-finder-design.md`) and
its shipped engine (v4.20.0). v2 is **greenfield** — the v1 deterministic mechanical-lens
engine is a *parts donor* (its dedup/registry/issue plumbing is reused), not the center.
**One-liner:** an LLM judges the code, on a schedule, and files the work worth doing.

---

## 1. Summary

Recon v2 is **an LLM judging a codebase**, wrapped as a scheduled Claude Code Routine.
On each run it picks a bounded slice of the repo, judges it against a catalog of criteria
(calling deterministic tools as evidence when they help), deduplicates what it finds against
existing tracked work, and **files GitHub issues describing each finding and a suggested fix
approach** — no code changes. Humans pick fixes up through the existing `/flow → /build`
pipeline.

The inversion from v1: in v1 the spine was a deterministic mechanical-lens engine with a
bolt-on LLM path. In v2 **the LLM is the spine**; deterministic tools (lint, typecheck, knip,
audit, madge, grep/git) are *assists the LLM calls*, and the only surviving deterministic code
is plumbing: scope/rotation, fingerprint/dedup, the registry, and issue-payload projection.

This keeps recon's identity from v1 — **proactive** (it surfaces the changes worth making; the
rest of the plugin reacts to changes you make), **report-only**, **recurring**, with **durable
cross-run memory** — but makes the judgment itself the product.

## 2. Goals and non-goals

**Goals**
- An LLM judges code quality across a wide variety of project types, on a schedule, unattended.
- Each run is **bounded** (a slice) so a daily Routine stays affordable; coverage is
  **eventually-complete** via rotation.
- **Project-agnostic:** a criteria catalog gated by detected area type, so the right lenses run
  on the right code (no a11y on a Go backend, no migration-safety on a static site).
- **Durable, deduplicated memory:** never re-file a known finding; respect `wontfix`/closed
  across runs. GitHub issue state is the source of truth.
- Findings shaped as **pre-specs with a suggested approach**, so they drop into `/specify` →
  `/build` with near-zero translation.

**Non-goals**
- No code changes, no patches, no PRs (output is #1: issue + described approach + acceptance).
- No new local backlog store (issues are the durable sink; the local cache is a rebuildable
  optimization).
- Not a scheduled `/review` — recon judges code that *isn't* changing (latent debt), not diffs.
- Not a CI gate (CI stays reactive/blocking; recon is proactive/advisory).

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Spine | **LLM judges the code**; tools are assists it calls |
| 2 | Trigger | A **scheduled Claude Code Routine** (`/schedule`); also on-demand |
| 3 | Output | **#1** — GitHub issue with a described fix approach + acceptance criteria; **no code** |
| 4 | Scope per run | **Rotation + change-aware skip**: next slice in round-robin; skip slices whose content-hash is unchanged since last judged; churn sets priority; eventually-complete |
| 5 | Slice granularity | **Directory-level** |
| 6 | Criteria structure | **Hybrid** — enumerated criteria checklist + holistic judgment within each + a final "anything else worth flagging?" pass |
| 7 | Criteria catalog | Universal core (always) + domain-specific (gated by area type); noisy criteria file at high confidence only |
| 8 | Area routing | Each criterion carries `appliesTo`; recon **detects each area's type** from signal files and applies universal + matching-domain criteria |
| 9 | Dedup | **Stable LLM-emitted signatures** (`criterion + areaId + anchor`), fingerprinted; matched against open `recon` issues + local cache; never hash prose |
| 10 | Memory | GitHub issue state (open / closed / `wontfix`) + a rebuildable local cache |
| 11 | Form | A **SKILL that drives Claude** (the judge); deterministic code is thin plumbing in `bin/lib/recon/` |
| 12 | Greenfield | Reuse v1 plumbing; replace the mechanical-lens spine |

## 4. Architecture

```
Routine (scheduled, off-peak)  ──or──  on-demand /claude-tweaks:recon
        │
        ▼
  the SKILL drives Claude (the judge):
        │
        ├─ 1. SCOPE: pick the next directory slice (rotation + change-skip + hotspot priority)
        ├─ 2. CLASSIFY: detect the slice's area type → select applicable criteria
        ├─ 3. JUDGE: read the code; apply each criterion (holistically); call tools as evidence
        │        + a final "anything else?" pass
        ├─ 4. SIGNATURE: emit a stable signature per finding (criterion + area + anchor)
        ├─ 5. DEDUP: fingerprint; compare to open `recon` issues + cache → decide
        │        (file / skip / suppress / reopen / remember)
        ├─ 6. GATE: drop low-confidence findings for noisy criteria
        └─ 7. FILE: `gh issue create` with a /specify-shaped body + suggested approach
        ▼
  human triages in GitHub → /flow --from-recon → /specify → /build
```

Two layers:
- **Judgment (the LLM, via the SKILL).** Claude reads code, applies criteria, calls tools,
  decides what's worth filing. This is the product.
- **Plumbing (thin deterministic helpers in `bin/lib/recon/`).** Scope/rotation + content-hash,
  fingerprint, dedup decision, registry/cache I/O, issue-payload projection, area-type
  detection. Pure, zero-network, unit-tested. **The LLM never hand-computes these** — it calls
  the helpers so dedup stays deterministic.

## 5. Scope and rotation (one run's slice)

- **Unit = a directory.** Coarse enough to keep related code together for good judgment, fine
  enough to skip cheaply when untouched.
- **Rotation:** runs walk directories in a round-robin; a per-area cursor records when each was
  last judged.
- **Change-aware skip:** each directory has a **content hash** (of its source files). If the
  hash is unchanged since it was last judged, skip it — no wasted LLM pass — unless it has gone
  stale past a re-judge threshold (e.g. criteria changed, or N days) which forces a fresh look.
- **Priority:** order candidates by **risk-hotspot** signal = high churn × high complexity
  (git history × size/complexity). Debt hurts most where code is both busy and gnarly.
- **Eventually-complete floor:** any directory unjudged past `MAX_STALE_DAYS` jumps the queue,
  so nothing rots permanently unseen.
- **Budget:** a per-run cap (`K` slices and/or a token budget) keeps a scheduled run cheap; a
  skipped run is harmless (rotation resumes next window).

This is the precise answer to "don't recon the same area every time": unchanged directories are
**skipped by content-hash**, not merely de-duplicated after re-judging.

## 6. Criteria catalog

Hybrid structure: each criterion is an **enumerated lens** (named, configurable, contributes to
the finding's signature) that the LLM applies **holistically**; a final **"anything else worth
flagging?"** pass catches what the checklist misses.

Each criterion carries `appliesTo` (universal | frontend | backend | library | infra | data |
cli | docs …). Recon detects area type (§7) and runs **universal + matching-domain** criteria.

**Universal core (every area):**
- architecture-depth · simplification · review-quality (correctness / convention /
  static-security / performance / error-handling / test-quality) — *reuse the existing
  `_shared/criteria-*.md` fragments*
- scalability · security (logic-level) · bad-practice / anti-patterns · doc-freshness ·
  dead-code / rot · test-quality & coverage gaps
- **resilience / fault-tolerance** (timeouts, retries, unhandled failure on I/O & network)
- **observability** (logging/metrics/tracing on critical paths; never logging secrets/PII)
- **config & secrets hygiene** (hardcoded config, committed secrets, missing env validation)
- **dependency & supply-chain health** (abandoned/unmaintained deps, **license incompatibility**,
  risky ranges, duplicates)
- **input-validation at trust boundaries**
- **naming & clarity / cognitive load**

**Domain-specific (gated by area type):**
- **accessibility (a11y)** → frontend/UI
- **internationalization (i18n)** → user-facing apps
- **API / contract stability** → libraries & public services
- **data / migration safety** → DB-backed areas
- **IaC security & hygiene** → infra areas
- **privacy / PII handling** → areas touching user data
- **concurrency safety** → areas with shared mutable state / async

**Guardrails against noise:**
- **Per-criterion confidence/severity floor:** noisy criteria (performance, privacy, a11y) file
  only at high confidence; speculative findings are dropped, not filed.
- **Verify gate:** before filing, the finding is sanity-checked ("is it real, actionable, does it
  reproduce?") — the adversarial-verify discipline that caught real bugs while building v1 — so
  plausible-but-wrong judgments don't become issues.

**Tools the LLM calls as evidence** (used when present, gracefully skipped when absent): project
lint + typecheck, knip/depcheck (dead code/deps), npm-audit/osv (vuln deps), madge (cycles),
plus its own grep/git reconnaissance. Tools ground or confirm judgment; they are not a separate
pass.

## 7. Area-type detection

A deterministic helper classifies each directory/area from signal files, e.g.:
- **frontend** — `react`/`vue`/`svelte`/`@angular` in deps, `.jsx/.tsx/.vue`, a `components/` dir
- **backend** — server frameworks (express/fastify/nest/django/flask/gin…), no UI deps
- **library** — `exports`/`publishConfig`/`main`+`types`, no app entrypoint
- **infra** — `*.tf`, `Dockerfile`, `k8s`/`helm`, `*.bicep`
- **data** — a `migrations/` dir, ORM/schema files, `.sql`, notebooks
- **cli** — a `bin` field / shebang entrypoints
- **docs** — predominantly `.md`/`.mdx`

Detection is best-effort and additive (an area can carry multiple types). Unknown → universal
criteria only. Stored on the area as `flags`/`types` (the v1 `Area.flags` field, finally used).

## 8. Findings, dedup, and issues

**A finding** (LLM output, validated by a plumbing helper) carries: `criterion`, `areaId`,
`anchor` (a **stable code locator** — file path + nearest named symbol, normalized; never a line
number or prose), `severity`, `confidence`, `title`, `evidence`, `suggestedApproach`,
`acceptance`.

**Stable signature → fingerprint.** `fingerprint = hash(criterion + areaId + normalized anchor)`.
The LLM is instructed to produce the canonical anchor; the engine hashes it. This is the crux of
making LLM findings dedupable across scheduled runs — *we hash the locator, never the wording.*

**Dedup decision** (reused from v1, now over LLM findings): match the fingerprint against open
`recon`-labelled issues (marker `<!-- recon-fingerprint: recon-XXXX -->` in the body) and the
local cache →
- open issue exists → **skip** (no re-file)
- closed non-`wontfix` issue reappears → **reopen** (regressed) + comment
- `wontfix` issue → **suppress** (standing decision respected)
- new ≥ threshold → **file**
- new < threshold → **remember** (cache only)

**The issue (output #1):** title; body in `/specify` shape — **Current State** (evidence +
anchor), **Deliverables** (the suggested approach), **Acceptance Criteria** — plus the hidden
fingerprint marker; labels `recon`, `recon:<severity>`, `recon:<criterion>`. No diff, no code.

**Churn monitoring** stays: track fingerprint stability run-to-run; high churn signals the LLM
is producing unstable anchors and the anchoring instructions need tightening (the top risk).

## 9. Tools as assists

The LLM may call deterministic tools to ground judgment; each is optional and **skipped
gracefully when not installed**. The engine never calls the network; tool invocation is the
LLM's (via the skill), and external side effects (filing issues) go through `gh`. Tool output is
*evidence the LLM weighs*, not findings in itself — this keeps a confirmed-by-a-tool finding
higher-confidence and avoids dumping raw linter output into the tracker.

## 10. Trigger, scheduling, cost

- **Routine:** `/schedule` runs `/claude-tweaks:recon` (e.g. daily, off-peak). Small sips: a
  bounded slice count + token budget per run.
- **Gating:** a `status`-style check can halt a scheduled run for a human when regressions or
  open criticals exist.
- **Billing:** Routines run inside the subscription; verify automation-credit specifics against
  the live account. A skipped/rejected run is harmless — rotation resumes next window.

## 11. What survives from v1 vs what's rebuilt

| v1 piece | v2 fate |
|----------|---------|
| `fingerprint`, `dedup` (decide), `cache`/registry, `issue-payload`, `pull-issues` | **Reused** (the plumbing) — extended for LLM signatures + the new issue body |
| area detection + scoring + cursors + churn run-log | **Reused & extended** — directory slices, content-hash skip, hotspot priority, area-type classify |
| `_shared/criteria-*.md` fragments | **Reused** — the seed of the criteria catalog |
| mechanical lenses (`todo-comments`, `oversized-file`, `dead-export`, `dependency-freshness`) | **Demoted** — folded into "tools/cheap checks the LLM can call," not the spine |
| `plan-judgment` / `ingest-judgment` subagent dance | **Replaced** — the SKILL drives the judge directly; the engine validates + dedups its output |
| SKILL.md | **Rewritten** — the judge orchestration is the skill |

## 12. claude-tweaks integration

- **SKILL-driven:** `skills/recon/SKILL.md` is the spine (drives Claude through scope → judge →
  dedup → file). Deterministic helpers stay in `bin/lib/recon/`; the standard test convention
  applies. Component-Skill Contract keyed on `$PIPELINE_RUN_DIR`.
- **Relationships (bidirectional):** `/specify` (findings are pre-specs), `/capture` (fuzzy
  findings → INBOX), `/tidy` (recon issues fold into backlog hygiene), `/flow`
  (`--from-recon` pulls recon issues into the build pipeline), `/review` / `/deepen` / `/simplify`
  (share the criteria fragments). Update README, `/help`, CLAUDE.md catalog, version, marketplace.
- **No new local backlog:** issues + a rebuildable cache only.

## 13. Phasing (each phase = its own spec)

- **P1 — Judge spine, on-demand, universal criteria.** The SKILL drives Claude over one
  directory slice; universal criteria; stable-signature output; dedup + issue filing (output #1);
  `--dry-run`. Reuse v1 plumbing. Proves the LLM-judge loop end-to-end.
- **P2 — Area-type routing + domain criteria + tool-assists.** Area classification; domain
  criteria gated; confidence/verify gate; tool invocation with graceful skip.
- **P3 — Rotation, change-skip, hotspots, budget.** Directory content-hash skip, hotspot
  priority, per-run budget, the eventually-complete floor.
- **P4 — Routine + autonomy.** `/schedule` wiring, status/regression gating, churn monitoring,
  `/flow --from-recon` integration verified end-to-end.

## 14. Open questions and risks

- **Anchor stability is the #1 risk** (it replaces v1's fingerprint risk). If the LLM emits
  inconsistent anchors, dedup breaks (re-files or fragments). Mitigation: a tightly-specified
  anchor format (file + nearest named symbol), a plumbing-side normalizer, and the churn metric
  to detect drift.
- **Cost/latency of scheduled LLM runs** — bounded by slice budget + token cap; tune cadence.
- **Criteria noise** — the confidence floor + verify gate + `wontfix` memory absorb it; expect a
  calibration period.
- **Greenfield vs the merged v1** — v2 replaces v1's spine on the same skill name; decide whether
  to ship v2 behind the existing `/recon` (replacing) or stage it; the plumbing is shared either
  way.

## 15. Glossary

- **Slice** — the unit judged in one run (a directory).
- **Criterion** — one enumerated lens the LLM judges against (universal or domain-gated).
- **Anchor** — the stable code locator (file + nearest symbol) that makes an LLM finding
  dedupable; hashed into the fingerprint.
- **Area type** — the detected kind of a slice (frontend/backend/library/infra/data/cli/docs),
  which gates domain criteria.
- **Hotspot** — high-churn × high-complexity code; jumps the rotation queue.
