---
record: 782
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 782: specify shaping-mode: parallel-safety property (no worktree needed for github-issues backend) undocumented

Surface: backend

## Current State
`skills/specify/shaping-mode.md` and `skills/specify/SKILL.md` describe shaping mode as an in-place edit against a `github-issues`-backend record (`gh issue edit`) with no mention of what that implies for concurrency. In practice, shaping a `github-issues`-backend record writes nothing to the local filesystem — it only fetches and edits the GitHub issue via `gh` — so multiple records can be shaped concurrently with zero collision risk: there is no shared local file, no worktree, and no lock to contend over. That property had to be rediscovered by reading the skill's source mid-session, after first (incorrectly) recommending that every record in a batch get its own isolated worktree — costing real time and, on a project enforcing `worktree.always`, an unnecessary multi-terminal recommendation to the user.

## Deliverables
Add one explicit line, near the top of `shaping-mode.md` (or in `SKILL.md`'s `## Input` section), stating: shaping a `github-issues`-backend record writes no local files — it edits the GitHub issue directly via `gh`, so no worktree is required and multiple records may be shaped concurrently. The `local-files` backend does write a file (via `writeRecord`) and is not safe to parallelize without isolation — state that contrast in the same line or the adjacent sentence.

## Acceptance Criteria
- `shaping-mode.md` (or `SKILL.md`'s `## Input`) states, in one clearly worded sentence, that `github-issues`-backend shaping is safe to run concurrently with no worktree.
- The same statement (or an adjacent one) makes the `local-files`-backend contrast explicit — that driver writes a tracked file and does need isolation.
- No behavior changes — this is a documentation-only addition; nothing in the shaping procedure itself is modified.

## Technical Approach
Pure documentation addition — no code or procedure change. Place the line where a caller deciding on parallelism/isolation would read it first: the opening of `shaping-mode.md` (before the per-record procedure begins) is the more natural spot, since that's the file a multi-record loop (see the related gap in `#705`) would consult per record.

## Gotchas
- Keep the statement driver-conditional, not a blanket claim — it is true for `work-backend: github-issues` only; a project on `work-backend: local-files` still needs isolation for concurrent shaping runs, and the line must not accidentally read as a universal safe-to-parallelize claim.
- This is a one-line addition; resist the urge to expand it into a fuller parallelism-strategy section — the gap is specifically "this fact wasn't stated," not "no parallelism guidance exists at all."

## Original request

specify shaping-mode: parallel-safety property (no worktree needed for github-issues backend) undocumented

**Summary:** Shaping mode on a `github-issues`-backend record writes nothing locally — it only fetches and edits the GitHub issue via `gh` — so N records can be shaped concurrently with no worktree and no collision risk. Neither `skills/specify/SKILL.md` nor `shaping-mode.md` states this; the property had to be rediscovered by reading the skill source mid-session, after first (wrongly) recommending every record get its own isolated worktree.

**Kind:** Gap

**Affected component:** `skills/specify/SKILL.md`; `skills/specify/shaping-mode.md`

**Objective:** Trust calibration

**Use case:** A caller (human or model) deciding how much parallelism/isolation is safe for a batch of `/specify` shaping-mode calls has to either read the skill's source to find the write boundary, or default to the conservative — and here, wrong — assumption that every invocation needs a separate worktree, costing real time and, in a project enforcing `worktree.always`, an unnecessary multi-terminal recommendation to the user.

**Proposed fix:** Add one explicit line to `shaping-mode.md`'s opening (or `SKILL.md`'s `## Input`): "Shaping a github-issues-backend record writes no local files — it edits the GitHub issue directly via gh, so no worktree is required and multiple records may be shaped concurrently. The local-files backend does write a file and is not safe to parallelize without isolation." so the safe autonomy level is stated, not re-derived per session.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation).
<!-- fingerprint: feedback-0f139ed7 -->
