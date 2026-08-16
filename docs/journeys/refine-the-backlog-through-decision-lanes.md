---
files:
  - skills/backlog/refine-mode.md
  - skills/backlog/refine-lanes.md
  - skills/backlog/SKILL.md
  - bin/lib/issues/backlog.js
---

# Refine the Backlog Through Decision Lanes

**Persona:** A maintainer sweeping the backlog's label hygiene — `priority:*`, `**Related:**`, and grants (`auto:build`/`auto:merge`) — who wants one confirm gate instead of editing labels record by record.
**Goal:** Run `/claude-tweaks:backlog refine`, read the six precedence-ordered decision lanes, apply an accepted batch through the single confirm gate, and resolve the one row only a human can decide via its interactive launcher.
**Entry point:** A Claude Code session in a project with `work-backend: github-issues` (or `local-files` for the priority/Related sub-stage only); type `/claude-tweaks:backlog refine`.
**Success state:** A count-summary line, up to six populated lanes (Re-authorize / Grant / Flag-back / Priority / Dependency repair / Needs you) each with a paste-ready `gh` block, one `AskUserQuestion` confirm gate, every applied action logged to `decisions.md`, an autonomy-ceiling footer, and a closing `Next:` line.

## Steps

### 1. Run `/claude-tweaks:backlog refine` at `supervised` — the cheap path
- **Action:** Run the skill on a repo whose `autonomy` ceiling resolves `supervised` (the project default), without `--trust`.
- **Should feel:** Cheap — the run doesn't pause for a trust-table fetch or a `git log` read; it goes straight from grant-check to the lanes.
- **Should understand:** `refine-mode.md` Step 1 resolves the ceiling once (`resolve-policy.js --values autonomy trust-revert-window-days`). Step 3's "Trust signal" section gates the entire trust-table fetch on that resolved ceiling being `trusted`+ **or** `--trust` being passed; at `supervised` with no `--trust`, `_shared/trust-table.md`'s Fetch section — including its per-parent branches and its own `git log` read — never runs this session, and Trust evidence is omitted from the report. Step 4's footer states the skip plainly: `"Autonomy ceiling: supervised — trust not fetched this run (recorded, never acted on; pass --trust to render it)."` — the skip-case wording, replacing the ceiling-description wording a `trusted`+ (or `--trust`) run would get instead.
- **Should understand:** `--trust` (`SKILL.md`'s Input) is the opt-in that forces the fetch at any ceiling, including `supervised` — it's the only way to see Trust evidence without raising the project's ceiling.
- **Red flags:** A `↳ trust:` consequence line rendered under any lane row on a `supervised`, no-`--trust` run; the ceiling-description footer wording appearing instead of the skip-case wording; a visible delay for a trust-table `git log` fetch on this run.

### 2. Read the lanes — precedence order, one lane per record
- **Action:** Read the report top to bottom: the one-line count-summary first, then the lanes in fixed order — Re-authorize, Grant, Flag-back, Priority, Dependency repair, Needs you.
- **Should feel:** Like reading a decision queue already sorted for you, not six independent reports to reconcile — each record shows up exactly once.
- **Should understand:** `refine-mode.md` Step 4 fixes the precedence (Re-authorize → Grant → Flag-back → Priority → Dependency repair → Needs you); a record qualifying for more than one lane renders in the earliest lane it reaches only. Empty lanes render nothing at all — no heading, no table, no paste block. The count-summary names only the lanes that actually rendered, e.g. `` `23` suggestions across `6` lanes: `2` re-authorize, `7` grant, `3` flag-back, `8` priority, `1` dependency-repair, `2` needs-you `` — counts are lane array lengths, computed fresh every run. A Dependency-repair *annotation* riding under another lane's row is counted under that row's own lane, never double-counted as a Dependency-repair row too.
- **Red flags:** The same record number appearing as a row in two different lanes; a lane with zero rows still printing a heading or empty table; the count-summary total not matching the sum of the lanes actually rendered below it.

### 3. Apply a batch — the confirm gate is the single stop
- **Action:** After reading every lane's paste block, answer the one `AskUserQuestion` under `<!-- refine-confirm-gate -->`: `"Apply these label changes, or override specific items?"` — Option 1 `Apply all recommended (Recommended)`, Option 2 `Override specific items`, Option 3 `Grant auto:build only, hold merge`, Option 4 `Skip all suggestions`.
- **Should feel:** One stop for the whole batch, not six — each lane's `gh issue edit …` paste block already shows exactly what Option 1 will run, so nothing about the write is a surprise at confirm time.
- **Should understand:** `SKILL.md`'s Anti-Patterns table calls this out directly: "Skipping or bulk-bypassing the batch-confirm in `refine` mode … the human action is the load-bearing security signature — never skip it, even for an all-recommended batch." Step 5's Apply section runs each lane's mechanics only after that answer — Priority/Related edits, Grant edits (stripping `bot:blocked` in the same edit as a re-authorize grant), Dependency-repair edits, Flag-back label-removal-plus-comment. Option 3 is a session-wide override: it applies every non-grant suggestion and every grant row's `auto:build`/re-authorize normally, but withholds `auto:merge` on every row for the rest of this run, even rows the Grant lane recommended it for. Every applied action gets one line in this run's `decisions.md`.
- **Red flags:** Any label changing on GitHub (or a local record file) before the `AskUserQuestion` is answered; a lane's paste block missing from the report; an `auto:merge` label landing on a record after choosing Option 3; an applied action with no corresponding `decisions.md` line.

### 4. Resolve a Needs-you row — interactive launchers, no batch
- **Action:** On a repo where the Needs-you lane rendered (`needs:definition`-labeled records, or judgment-required rows with no batchable command), read its rows and the report's closing `Next:` line, then run the named launcher directly.
- **Should feel:** Like the report handing you personally the one move only you can make — not another table to batch-approve.
- **Should understand:** Needs-you rows are exempt from paste blocks by design — `refine-lanes.md`'s Needs-you section gives each row an interactive launcher instead: `/claude-tweaks:specify #{n}` for a `needs:definition` gap, `/claude-tweaks:challenge --lens=1 #{n}` for a `solution:unjustified` confirmation, `/claude-tweaks:backlog refine #{n}` for a judgment-required dependency repair — each with a `#`-comment naming why it landed there. The closing `Next:` line names the top Needs-you item whenever that lane is non-empty; only when Needs-you is empty does it fall back to naming the highest-value batch among the lanes above.
- **Red flags:** A Needs-you row carrying a `gh issue edit` paste block; the `Next:` line naming a batch lane while Needs-you still has rows; a launcher missing the `#`-comment explaining why the row needs a human.
