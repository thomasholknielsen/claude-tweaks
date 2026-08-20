---
files:
  - plugin/skills/specify/SKILL.md
  - plugin/skills/specify/shaping-mode.md
---

# Shape Several Backlog Records in One Paste via /specify

**Persona:** A claude-tweaks maintainer who just read a `/claude-tweaks:tidy` report (or `/claude-tweaks:backlog overview`) and holds a Yours group of five-to-ten unshaped or trigger-met records that all want `/claude-tweaks:specify` — and wants to hand the whole group to one session in one paste, not ten.
**Goal:** Take every record in the group from raw capture to `ready` — spec-shaped body, scoring stamped, ceremony and framing judged — with one command, while still getting each record's own decisions asked one at a time.
**Entry point:** A terminal in a session with the plugin loaded, holding a comma-separated ref list — a `/tidy` Yours group head such as `/claude-tweaks:specify #41,#113,#128`, or a list typed by hand.
**Success state:** Every element that could be fetched is `ready` on the tracker with its own shaped body and labels; the run summary shows one row per element with `shaped` / `already shaped, no-op` / `skipped: {reason}`; the closing Next Actions recommends `/claude-tweaks:flow #41,#113,#128` over the shaped set only.

## Steps

### 1. Paste the list — `/claude-tweaks:specify #41,#113,#128`
- **URL:** `/claude-tweaks:specify #N,#M[,...]` (bare local ids `12,14` under `work-backend: local-files`; a space after a comma is tolerated and trimmed)
- **Action:** Paste the group head from the tidy report, or type the list. Every element must be a record reference; the run then enters shaping mode once per element, in list order.
- **Should feel:** One paste for the whole group — the report's batch line is the command, nothing to edit before running it.
- **Should understand:** Batch is shaping-mode-only. A list where some but not all elements are record refs (`#41,docs/x-design.md`) is a hard input error before any write, naming the offending element; a comma string with no record refs at all (`auth, login flow`) is not a list but ordinary free text, resolved as a topic — so a topic containing a comma is neither a batch nor an error. An element that resolves to a decomposition parent likewise fails the whole batch before anything is shaped — every parent offender named in one message, tier-2 (sniff-only) hits refused without a prompt, with a pointer to the single-record form to repair (`shape-several-records-in-one-specify-call` step 7 documents the full behavior).
- **Red flags:** Any record written before a mixed list is rejected; a Task fan-out (parallel subagents shaping records concurrently) instead of a sequential loop; a topic containing a comma refused as a "bad list".

### 2. Watch each record shape, one at a time
- **URL:** *(no command — specify loops)*
- **Action:** Nothing per record unless a frontend sniff fires, in which case the design-intent question is asked for that record alone, as its turn comes. Each element gets the full single-record procedure — compose, `ceremony-check`, `framing-check`, one compose-then-write-once call — with no cross-record merging and no batched label call.
- **Should feel:** Per-record judgment at paste-once cost — the same shaping you would get invoking each ref alone, in the order you listed them.
- **Should understand:** The Interaction-style directive's "multi-item → batch table" does not apply here — the one per-record decision (design-intent) is asked per element as the sniff fires, never collected into one table. A record already fully shaped is verified and left alone (`already shaped, no-op`), not rewritten.
- **Red flags:** One design-intent table covering every frontend record; a record's body composed from another record's content; `--surface` applied to the first element only (it applies to every element).

### 3. Read the per-element summary — skips do not stop the batch
- **URL:** *(Actions Performed table rendered by specify)*
- **Action:** Scan one row per attempted element, in list order: `shaped`, `already shaped, no-op`, or `skipped: {reason}` (a fetch failure — missing issue, wrong repo, no matching `specs/{n}-*.md`).
- **Should feel:** Nothing silently dropped — every ref you typed has a row and a verdict.
- **Should understand:** A skipped element does not abort the rest; the remaining refs still shape. Under `github-issues` the edits already landed via the API (no commit); under `local-files` each record file is committed.
- **Red flags:** A batch that stops at the first unfetchable ref; a summary with fewer rows than refs; a skipped ref appearing in the recommended flow command.

### 4. Pipeline the shaped set — one Next Actions block, after the last element
- **URL:** *(Next Actions rendered by specify)*
- **Action:** Take the recommended `/claude-tweaks:flow #41,#113,#128` (shaped elements only, list order), or `/claude-tweaks:flow #41` for just the first, or `/claude-tweaks:help`.
- **Should feel:** The batch closes the same way a single shaping does, once — not a Next Actions block after every record.
- **Should understand:** Under `--chained` (the `/claude-tweaks:capture` born-ready chain, which only ever passes one ref) Next Actions is not rendered at all; a batch under `--chained` is permitted but has no caller.
- **Red flags:** Next Actions rendered per element; the recommended command including a skipped ref; a "commit then flow" option (records are already durable).

## Origin
- Created during build of #695 (specify + demo `#N,#M` batch argument)
- Steps 1-4 built in this session
- Related specs: #695, #685 (tidy's command-grouped Yours section, whose group heads produce the paste line this journey starts from)
