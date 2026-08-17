---
files:
  - skills/backlog/attention-mode.md
  - skills/backlog/SKILL.md
---

# Review the Backlog Attention Queue

**Persona:** A claude-tweaks maintainer doing a periodic backlog check-in, wanting to know what's waiting on a human decision before picking the next thing to build.
**Goal:** See every open record that genuinely needs a human call — an undecided idea (`needs:definition`) or a solution nobody justified (`solution:unjustified`) — ranked in one place, and know exactly what to do about each one.
**Entry point:** A terminal with `/claude-tweaks:backlog attention` run bare.
**Success state:** One ranked table (or an explicit "nothing needs attention" line) covering both label types with no duplicate rows, each carrying a concrete next command to run — the maintainer picks one and moves, without having to separately remember what each label means or re-derive its remedy.

## Steps

### 1. Run the query — terminal
- **URL:** `/claude-tweaks:backlog attention`
- **Action:** Invoke the mode bare. It fetches open records carrying `needs:definition` and `solution:unjustified` as two separate label queries, merges by issue number, ranks by priority band then age, and renders one table.
- **Should feel:** Read-only and safe — like checking a dashboard, not opening a work queue that might mutate something. No grant, no shaping, no write happens anywhere in this mode.
- **Should understand:** A record carrying both labels renders as exactly one row (`Type: needs:definition + solution:unjustified`) with both remedies concatenated, never two separate rows for the same issue.
- **Red flags:** The same issue number appearing twice in the table; a mode that writes a label, grants, or shapes anything instead of just listing.

### 2. Read a row's recommended action — terminal
- **URL:** same session, immediately after Step 1's table renders
- **Action:** Read the `Recommended action` column for the row the maintainer wants to act on. A `needs:definition` row points to `/claude-tweaks:specify #{n}` (routes through brainstorming — the record has no decided approach yet). A `solution:unjustified` row points to `/claude-tweaks:backlog refine #{n}` (grant despite the flag, accepting the risk) or re-running `/claude-tweaks:specify #{n}` after adding evidence to the record's Current State.
- **Should feel:** Like the table already did the remembering — the maintainer doesn't need to separately recall which label means what or which skill resolves it.
- **Should understand:** This mode never runs the recommended command itself — it only names it. The maintainer runs it in a follow-up message, same as reading `/claude-tweaks:help`'s Triage Queue and then acting on one row.
- **Red flags:** A recommended action that doesn't match the label (e.g. a `needs:definition` row pointing at `/backlog refine`); a row with no recommended action at all.

### 3. Act on the top pick — terminal
- **URL:** same session
- **Action:** Run the command from the row acted on, or from the table's trailing "Pick up next" line if undecided which to tackle first (the same oldest/highest-priority record the ranking already surfaced).
- **Should feel:** Like picking up exactly where the table left off — no re-fetching, no re-deriving priority by hand.
- **Should understand:** Both remedies are genuinely human-owed — a `needs:definition` record structurally cannot be shaped by `/specify` in place (it redirects to brainstorming instead), and a `solution:unjustified` record's grant requires the same one-line judgment call a human would make anyway at grant time.
- **Red flags:** `/claude-tweaks:specify` shaping a `needs:definition` record in place instead of redirecting; a `solution:unjustified` record silently granted with no human decision recorded anywhere.

## Origin
- Created during the retroactive wrap-up of #473-#476 (`needs:definition`/`solution:unjustified` decomposition, PR #480) — `/backlog attention` shipped with zero journey coverage anywhere in `docs/journeys/`
- Related specs: #473 (needs:definition), #474 (this mode), #475 (solution:unjustified)
