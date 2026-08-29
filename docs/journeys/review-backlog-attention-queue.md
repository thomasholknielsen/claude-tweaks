---
files:
  - plugin/skills/backlog/attention-mode.md
  - plugin/skills/backlog/SKILL.md
  - plugin/skills/specify/next-mode.md
  - plugin/bin/lib/issues/grant-gate.js
---

# Review the Backlog Attention Queue

**Persona:** A claude-tweaks maintainer doing a periodic backlog check-in, wanting to know what's waiting on a human decision before picking the next thing to build.
**Goal:** See every open record that genuinely needs a human call — an undecided idea (`needs:definition`), a solution nobody justified (`solution:unjustified`), or a spec a machine wrote that nobody has reviewed or granted (`shaped:headless` with no `auto:build`) — ranked in one place, and know exactly what to do about each one.
**Entry point:** A terminal with `/claude-tweaks:backlog attention` run bare.
**Success state:** One ranked table (or an explicit "nothing needs attention" line) covering all three classifications with no duplicate rows, each carrying a concrete next command to run — the maintainer picks one and moves, without having to separately remember what each label means or re-derive its remedy.

## Steps

### 1. Run the query — terminal
- **URL:** `/claude-tweaks:backlog attention`
- **Action:** Invoke the mode bare. It runs three `gh issue list` fetches — `needs:definition` and `solution:unjustified` as their own single-label queries, plus `ready` + `shaped:headless` as one deliberate two-label AND query — merges by issue number, drops any `shaped:headless` record that already carries `auto:build`, ranks by priority band then age, and renders one table.
- **Should feel:** Read-only and safe — like checking a dashboard, not opening a work queue that might mutate something. No grant, no shaping, no write happens anywhere in this mode.
- **Should understand:** A record matching two or three classifications renders as exactly one row (`Type: needs:definition + solution:unjustified`) with each remedy concatenated in fixed fetch order, never a separate row per matched type for the same issue. The first two fetches are separate calls because `--label` ANDs within one call; the third is one call *because* it wants that AND — splitting it would silently widen the query to every `ready` record plus every `shaped:headless` record.
- **Red flags:** The same issue number appearing twice in the table; a mode that writes a label, grants, or shapes anything instead of just listing; a `shaped:headless` record that already carries `auto:build` appearing in the table at all (it has been granted — it is no longer waiting on anyone)

### 2. Read a row's recommended action — terminal
- **URL:** same session, immediately after Step 1's table renders
- **Action:** Read the `Recommended action` column for the row the maintainer wants to act on. A `needs:definition` row points to `/claude-tweaks:specify #{n}` (routes through brainstorming — the record has no decided approach yet). A `solution:unjustified` row points to `/claude-tweaks:backlog refine #{n}` (grant despite the flag, accepting the risk) or re-running `/claude-tweaks:specify #{n}` after adding evidence to the record's Current State. A `shaped:headless (no grant)` row points to `/claude-tweaks:backlog refine #{n}` to grant it, with the reason stated inline — the spec body was written by a bare `/claude-tweaks:specify` drain (or its deprecated `next` alias) on a scheduled firing and no human has read it.
- **Should feel:** Like the table already did the remembering — the maintainer doesn't need to separately recall which label means what or which skill resolves it.
- **Should understand:** This mode never runs the recommended command itself — it only names it. The maintainer runs it in a follow-up message, same as reading `/claude-tweaks:help`'s Triage Queue and then acting on one row.
- **Red flags:** A recommended action that doesn't match the label (e.g. a `needs:definition` row pointing at `/backlog refine`); a row with no recommended action at all.

### 3. Act on the top pick — terminal
- **URL:** same session
- **Action:** Run the command from the row acted on, or from the table's trailing "Pick up next" line if undecided which to tackle first (the same oldest/highest-priority record the ranking already surfaced).
- **Should feel:** Like picking up exactly where the table left off — no re-fetching, no re-deriving priority by hand.
- **Should understand:** All three remedies are genuinely human-owed — a `needs:definition` record structurally cannot be shaped by `/specify` in place (it redirects to brainstorming instead), and a `solution:unjustified` record's grant requires the same one-line judgment call a human would make anyway at grant time, and a `shaped:headless` record above the fixed `medium` provenance floor on either risk or size structurally cannot be machine-granted at all — `evaluateGrantGate` denies it with `shaped-headless-floor` on every firing of the grant unit, so this list is the only place it will ever surface.
- **Red flags:** `/claude-tweaks:specify` shaping a `needs:definition` record in place instead of redirecting; a `solution:unjustified` record silently granted with no human decision recorded anywhere.

## Origin
- Created during the retroactive wrap-up of #473-#476 (`needs:definition`/`solution:unjustified` decomposition, PR #480) — `/backlog attention` shipped with zero journey coverage anywhere in `docs/journeys/`
- Related specs: #473 (needs:definition), #474 (this mode), #475 (solution:unjustified)
- Updated during build of #967/#968/#969 — `/specify next` (the headless shaping unit at the time, now bare `/specify` drain's deprecated `next` alias, refs #1491) introduced `shaped:headless`, `/backlog attention` gained it as a third classification, and `grant-gate.js` gained the `shaped-headless-floor` deny that makes this list the sole surface for a machine-shaped record above the provenance floor.
