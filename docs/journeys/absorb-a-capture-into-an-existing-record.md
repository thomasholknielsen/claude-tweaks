---
files:
  - plugin/skills/capture/SKILL.md
  - plugin/skills/_shared/auto-mode-contract.md
  - plugin/skills/_shared/work-record.md
---

# Absorb a Capture into an Existing Record

**Persona:** A claude-tweaks maintainer typing `/claude-tweaks:capture` with an idea that turns out to already have a home — and the agent-driven filing path that hits the same decision with nobody present.
**Goal:** The idea lands where the work actually is, once, with a visible audit trail — not as a second record that drifts from the first.
**Entry point:** `/claude-tweaks:capture "<idea>"` in a project with `work-backend: github-issues`.
**Success state:** Either the content is appended under a dated `## Absorbed:` heading on the matched record (stub closed, `size:` raised if warranted, target and append both named in the output) or a fresh record exists carrying `**Related:** #N` — never both, and never a silent duplicate.

## Steps

### 1. High similarity — absorb is Option 1 (Recommended)
- **URL:** `/claude-tweaks:capture "the digest sweep should expire entries older than the rollover window"` where an open record already covers `plugin/skills/tidy/digest-sweep.md`
- **Action:** Answer the post-capture routing `AskUserQuestion`. Absorb leads it: `label`: `"Absorb into record {N} (Recommended)"`, `description`: `"This belongs in an existing record"` — then Brainstorm and Keep.
- **Should feel:** Like the skill already knows where this belongs — one click to agree, one click to decline, no record-number hunting.
- **Should understand:** The recommendation is not a similarity score. Both halves of the two-criteria bar must hold, each anchored on a concrete shared artifact: **(a) same file/subsystem** — the candidate's body (its `### Key Files` section when spec-shaped, else its title subject) and the capture's `Context:`/`Scope:` text name at least one identical file path or module/subsystem; **(b) same kind of change** — an identical `type:{t}` value *and* the same operation on that subject (matching verb-plus-target). Several candidates clearing the bar are tie-broken by most shared file paths, then most-recently-updated (`updatedAt`). Absorb is only ever shown when a real candidate was found — never as an option with a placeholder number to fill in.
- **Red flags:** Absorb recommended on a candidate that shares a subsystem but carries a different `type:{t}`; an absorb option whose record number the maintainer has to supply; a candidate list that ranks by a fuzzy score rather than shared paths.

### 2. Low or ambiguous similarity — Brainstorm leads, absorb sits last
- **URL:** the same prompt, where a candidate exists but only one half of the bar holds
- **Action:** Read the three options: `"Brainstorm directly"` **(Recommended)** / `"Keep as backlog record"` / absorb, conditional and last.
- **Should feel:** The absorb route stays reachable without being urged — a near-match is offered, not pushed.
- **Should understand:** The ordering is the whole signal. The call carries 3 options only when absorb is visible, in either ordering; when no candidate was found at all, it is Brainstorm and Keep only. The recommended-absorb ordering of step 1 applies under `github-issues` only.
- **Red flags:** Absorb rendered as Recommended on a one-criterion match; a two-option prompt that silently dropped a real candidate; the same prompt asked twice for one capture.

### 3. An excluded target — closed / decomposition parent / `bot:in-progress` files fresh
- **URL:** `/claude-tweaks:capture "…" --route=absorb:416` where `#416` carries `parent-issue`
- **Action:** Nothing further — the exclusion resolves before any write.
- **Should feel:** A refusal that names the reason and the alternative, not a silent fallback to some other route.
- **Should understand:** Absorb never targets (1) a closed record, (2) a `parent-issue` carrier, (3) a `bot:in-progress` carrier — all three file fresh with a `**Related:** #N` line instead. An explicit `--route=absorb:N` naming an unresolvable, already-closed, or excluded record stops before writing or closing anything and reports the invalid `N`; it never silently falls back to `keep`.
- **Red flags:** A capture absorbed into a decomposition parent; an invalid `N` quietly rerouted to `keep`; a stub closed before the target write was confirmed.

### 4. An agent-driven filing — the structural bar decides with no prompt
- **URL:** a `/claude-tweaks:flow` phase calling capture with `$PIPELINE_RUN_DIR` set (or `--source`, or `--defer-reason=`)
- **Action:** Nothing — nobody is present. The bar is judged at filing time, before any record is created and before the born-ready chain fires.
- **Should feel:** (Observed after the fact, in the run's decision log.) A decision that was made, not deferred: `AUTO {time} — capture absorbed into #{N} (shared path + same type). Reversibility: medium (append is visible on #{N}).`
- **Should understand:** Headlessly, only the *structural* half of the bar is applied — (a) as a literal path match plus (b)'s `type:{t}` match — standing in for the operation-match judgment a human would make. An explicit `--route` still wins over the automatic decision, and a bare `auto` invocation keeps the contract's `keep` default: it absorbs only via a front-loaded `--route=absorb:N`. Anything that fails the bar files fresh with `**Related:** #N`. An absorbing capture never files and never chains — there is no stub left behind to reconcile later.
- **Red flags:** A headless filing hanging on the routing question; a bare `auto` invocation absorbing without an explicit route; an absorb with no `AUTO` entry where a run directory resolved.

### 5. A large target — past 55,000 chars the append becomes a comment
- **URL:** an absorb into a long-lived record whose body is already near GitHub's 65,536-character body cap
- **Action:** Read the output's naming of the target and the append.
- **Should feel:** The same outcome by a different mechanism — the content is on the record either way, and the output says which form it took.
- **Should understand:** The append is composed once via `_shared/github-write-transport.md` (`gh issue edit {N} --body-file`); past 55,000 post-append characters it is posted as a comment instead of a body edit. Either way the target's `size:` is re-judged **raise-only, never lowered**, `priority:*` stays unwritten (a higher priority is suggested in the output instead), the stub is commented `Absorbed into #N.` and closed as not planned, and the session record snapshot is invalidated per `_shared/record-queue-fetch.md`.
- **Red flags:** A body edit that silently truncates past the cap; `size:` lowered on the target; a `priority:*` label written by capture; a later capture in the same session matching against the stale pre-absorb snapshot.

## Origin
- Created for #1264 (capture absorb-by-default), part of the #1261-#1264 multi-spec run
- Related journeys: `refuse-to-shape-a-decomposition-parent` (the `parent-issue` exclusion's other side), `link-records-natively-in-one-command` (the `**Related:** #N` alternative outcome), `tidy-standalone-auto-report` (where kept backlog records are triaged later)
