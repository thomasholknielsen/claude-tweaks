---
files:
  - skills/_shared/upstream-feedback-batch.md
  - skills/feedback/SKILL.md
  - skills/wrap-up/review-console.md
  - skills/wrap-up/upstream-feedback.md
---

# File Upstream Feedback in Batch

**Persona:** A claude-tweaks maintainer who just let a headless health-sweep Routine run overnight and now has several `upstream-candidate` issues waiting in this project's own backlog, plus a `/claude-tweaks:flow` run that surfaced a couple more D5 (upstream) learnings during wrap-up.
**Goal:** Clear all the waiting upstream-feedback candidates — decide which get filed against `thomasholknielsen/claude-tweaks` and which get declined — without answering one confirmation prompt per candidate.
**Entry point:** A terminal with `/claude-tweaks:feedback --queue` run bare (no free-text learning), or the Wrap-Up Review Console rendered at the end of a `/claude-tweaks:flow`/`/claude-tweaks:wrap-up` run that staged `U#` items.
**Success state:** Every candidate has an explicit disposition — filed (a real upstream issue URL) or declined (a comment on the local `upstream-candidate` issue, or a logged decline) — reached via one `multiSelect` confirmation per group of up to 4, never one confirmation per candidate.

## Steps

### 1. Gather the local queue — terminal
- **URL:** `/claude-tweaks:feedback --queue`
- **Action:** Invoke the skill bare (or with `--queue`); it lists every open `upstream-candidate` issue and, for each, runs Steps 1-6 (gather, classify, self-reference check, dedup search, draft, scrub) non-interactively before rendering anything.
- **Should feel:** Like triage, not paperwork — the maintainer reads finished drafts, not raw issue bodies they'd have to interpret themselves.
- **Should understand:** Each candidate's fully scrubbed draft renders as literal text above the confirmation call, including a `⚠ possible duplicate: #{N}` flag inline wherever the dedup search found a plausible match — a duplicate never gets its own separate prompt.
- **Red flags:** A candidate's draft missing from the rendered text before the confirmation call; a dedup match silently omitted instead of flagged.

### 2. Approve a chunk — terminal
- **URL:** same session, immediately after Step 1's drafts render
- **Action:** Answer the `multiSelect` confirmation. With 6 candidates this is exactly 2 calls (4 items, then 2) — never one call per candidate, never one 6-option call (the tool caps options at 4 per question). Every option renders **unchecked**; checking an item is the one explicit act that authorizes filing it.
- **Should feel:** Fast and deliberate at once — one screen per group of up to 4, and checking a box is unambiguously "file this now," not "shortlist this for later."
- **Should understand:** The question text states plainly that a checked item will be filed, and restates the edit escape hatch ("describe the change and which item it applies to, by title, in your next message") — the maintainer never has to already know about the tool's undocumented `Other` field.
- **Red flags:** An item filing without ever having been checked; a chunk boundary splitting one candidate's draft from its own confirmation.

### 2a. Decline one, edit another — terminal
- **URL:** same session
- **Action:** Leave one candidate's box unchecked, and reply in the next message naming a different candidate by title with a requested change instead of checking or unchecking it.
- **Should feel:** Safe to be selective — nothing gets filed by default, and correcting a draft doesn't mean starting the whole batch over.
- **Should understand:** The unchecked candidate's local `upstream-candidate` issue gets a comment — "Declined via /claude-tweaks:feedback batch review, {date}" — and stays open for a future run; nothing is silently dropped. The named-edit candidate re-drafts and re-renders for a fresh confirmation.
- **Red flags:** A declined candidate's local issue closing or losing its label; an edit request being ignored or silently applied without a fresh confirmation.

### 3. Approve staged items from the Wrap-Up Review Console — terminal
- **URL:** the Review Console rendered at the end of `/claude-tweaks:wrap-up` (or `/claude-tweaks:flow`'s consolidated multi-spec console)
- **Action:** Review the console's `Upstream feedback` section (staged during the run's D5 curation), then answer its own chunked `multiSelect` call(s) the same way as Step 2 — separate from the console's "Approve all" batch choice, which never covers `U#` rows.
- **Should feel:** Consistent with Step 2 — the same batching shape, so a maintainer who's done this once from the CLI recognizes it instantly inside a pipeline run.
- **Should understand:** Each row was staged earlier in this same run, before the console ever rendered — `/claude-tweaks:wrap-up`'s D5 curation step already drafted and scrubbed it (the same "stage, never file during the run" rule Step 1's `--queue` gather follows). A checked item here invokes `/claude-tweaks:feedback --pre-confirmed`, which skips its own re-ask — but only after re-reading the staged file fresh and diffing it against the exact snapshot the console rendered; if they differ (someone edited the staged file after the table was shown), that one item alone falls back to a normal confirm showing the diff, and the rest of the chunk still files without interruption. The scrub itself always reruns as a separate safety net either way, whether or not drift was found.
- **Red flags:** `--pre-confirmed` skipping the confirm on an item whose staged content changed since rendering; the scrub not rerunning on the content that's actually about to be filed.

## Origin
- Created during build of #294 (batch upstream-feedback filing into one multiSelect decision, collapse /feedback's double-ask)
- Steps 1-3 built in this session
- Related specs: #290 (sibling — batches Q#/M# the same way, U# carved out to this leaf)
