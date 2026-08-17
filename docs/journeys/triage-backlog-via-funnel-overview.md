---
files:
  - bin/lib/issues/backlog.js
  - bin/lib/issues/record.js
  - bin/lib/issues/facet-shape.js
  - skills/backlog/overview-mode.md
  - skills/backlog/SKILL.md
---

# Triage the Backlog Through the Funnel Overview

**Persona:** A maintainer with an open work-record queue who wants one glance to answer "where is everything, and what do I act on?" — without reading three lens tables or a full trust matrix.
**Goal:** Read the bare-mode funnel header, understand each stage's population and its single next verb, and drill into a lens only when a specific population needs detail.
**Entry point:** A Claude Code session in a project with `work-backend: github-issues` (or `local-files`); type `/claude-tweaks:backlog` with no arguments.
**Success state:** A funnel header whose stage counts sum to the open queue, at most two annotation lines beneath it, a "Recommended next" callout, and per-stage paste blocks with integrity rules and a closing `Next:` line — with no lens tables rendered and every record appearing exactly once.

## Steps

### 1. Read the funnel header — bare `/claude-tweaks:backlog`
- **Action:** Run the skill with no lens argument and read the header block at the top of the report.
- **Should feel:** Like a process gauge, not a report — six stages in pipeline order (`captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight`), a count per stage, and a fully-qualified command under each actionable stage.
- **Should understand:** The buckets are mutually exclusive (`funnelBuckets` in `bin/lib/issues/backlog.js` — first-match-wins precedence: live bot work outranks stage labels; a granted-but-blocked record shows as `granted`, never `dispatchable`). The header *is* the counts — there is no separate summary paragraph.
- **Red flags:** A record id in the header; a Critical/Risk-Value/Cleanup table rendering without a lens argument; stage counts that don't sum to the open queue; a "step passed" narration line (narration is failure-only).

### 2. Read the annotation lines — trust and parked/not-planned
- **Action:** Look immediately beneath the header. At most two lines can appear: a trust consequence line (only when some class verdict is `mixed`, e.g. `trust: clean, except human:human|low (mixed) → merges below stay PR-gated`) and `parked N · not-planned M → /claude-tweaks:tidy owns these` (only when non-zero).
- **Should feel:** Silent when clean — no `trust: clean` line, nothing about parked when there are none.
- **Should understand:** The full trust table moved behind `/claude-tweaks:backlog overview trust` (uncapped, unchanged contract); `insufficient-evidence` cells render nothing in bare mode. `not-planned` counts open records carrying the `wontfix` label (`facets.notPlanned`).
- **Red flags:** More than two annotation lines; a rendered trust table in bare mode; a consequence line for an `insufficient-evidence` cell.

### 3. Drill into a lens — `/claude-tweaks:backlog overview trust` (or `critical` / `risk-value` / `cleanup`)
- **Action:** Re-run with an explicit lens argument when a population needs detail.
- **Should feel:** The full table you expected, exactly as before the funnel redesign — the lenses kept their complete renders, they just stopped rendering uninvited.
- **Should understand:** The buildable population Step 3's "Recommended next" ranks over is `funnelBuckets`' `dispatchable` ∪ `granted` — the same numbers the header showed, one predicate, so the recommendation can never disagree with the funnel counts.
- **Red flags:** A capped or truncated trust-lens table; lens output leaking into a later bare-mode run.

### 4. Trust the recommendation's dependency data — or see it loudly refuse
- **Action:** In bare mode, read the "Recommended next" callout on a repo with `work-links: native` and a wired dependency chain.
- **Should feel:** Grounded — the recommendation ranks on the native blocked-by graph (`blockersOf` in `bin/lib/issues/ranking.js`: attached `blockedBy` → local `facets.blockedBy` → canonical body lines), not on prose guesses. A chain's tail record never outranks its unbuilt prerequisites on a phantom zero-dependency read.
- **Should understand:** When a record's body *mentions* a dependency in prose but nothing resolves mechanically, the dependency-mismatch flag fires: the flagged records get no mechanical recommendation, and the headline is either a corrected pick with its evidence cited inline, or a plain "ranking is unreliable for these" statement pointing at `/claude-tweaks:backlog refine`'s repair. An unsynced local record's blockers are never matched against GitHub issue numbers (different id namespaces).
- **Red flags:** A "Recommended next" the same output later retracts; a chain's last record recommended first on a natively-wired repo; a flagged record silently dropped from the report.

### 5. See the human lane surface what no agent can drain
- **Action:** On a repo where any record carries `needs:definition` or `solution:unjustified` (or its pre-rename spelling `framing:baked` — still read), read the `└─ needs you: {n}` branch line under the funnel header and the `── Needs you ──` section rendered last, just above the Next Actions block.
- **Should feel:** Like the report handing you *your* work: paste blocks send agents off; the lane's launcher lines (`/claude-tweaks:specify #N` for definition gaps, `/claude-tweaks:challenge --lens=1 #N` for `solution:unjustified` evidence calls — a form `/challenge` accepts today, whose own Next Actions route back to `/claude-tweaks:specify #N` to clear the label on an `open` verdict) are the session's recommended move whenever the lane is non-empty. A `solution:unjustified` record that also appears in a Shape or Dispatch paste block carries a `# ⚠ #N solution:unjustified — one-line evidence call pending` annotation immediately above its command line.
- **Should understand:** The lane is an overlay (`funnelBuckets`' `needsYou`) — records keep their stage bucket and are counted twice by design; only in-play records surface (in-flight/parked/not-planned are filtered); on a repo where no record carries either label nothing renders at all (dormant-safe). Both halves of the lane are live: `needs:definition` since v6.85.0, `solution:unjustified` since #677 renamed `framing:baked`.
- **Red flags:** The lane naming a parked or bot-claimed record as your next move; a needs-you branch line on a repo with no needs-labels; more than 3 rows without the attention pointer.
