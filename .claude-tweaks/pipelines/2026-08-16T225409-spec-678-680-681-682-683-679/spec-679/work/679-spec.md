---
record: 679
origin: human
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 679: feedback session-evaluation: no evaluation watermark — a second bare /feedback re-judges the whole transcript; delta scoping was hand-authored by the caller

Surface: backend

## Current State

- `skills/feedback/session-evaluation.md` (loaded by `/claude-tweaks:feedback`'s Step 0 bare-invocation umbrella) dispatches one transcript-judge subagent with four prompt items: the objectives rubric, the output template, the resolved transcript path, and slicing guidance. It carries no notion of a prior evaluation of the same transcript — no offset, no already-filed set, no opt-in for a deliberate full re-judge.
- Measured on one session: transcript 6.49 MB; the second bare `/feedback` re-judged the whole file for a ~585 KB (9%) delta; the first judge cost ~130K subagent tokens / 83 tool uses / 632 s for eight findings. The delta scoping that made the second run affordable was hand-written prose in the dispatch prompt.
- Transcript resolution (its own section in `session-evaluation.md`) yields a stable path per session; the file grows append-only, so byte size is a valid watermark. Some cloud sandboxes resolve no transcript at all (the section's fallback).
- `/feedback` already knows which records it filed per run (Step 8; staged files under the run dir when `--pre-confirmed`); nothing persists across invocations within a session.
- Persistence homes available: the pipeline run dir (`_shared/pipeline-run-dir.md`) or a gitignored file under `.claude-tweaks/`.

## Deliverables

- [ ] Evaluation watermark: after each judge returns, `/feedback` writes `{ transcriptPath, bytesAtDispatch, evaluatedAt, filedRecords: ["#N", …], dismissedFingerprints: [...] }` to a per-transcript file (recommended: `.claude-tweaks/feedback/watermarks/{transcript-basename}.json`, gitignored via `/claude-tweaks:init`'s ignore list; fall back to the run dir when one resolves).
- [ ] On a later bare invocation against the same transcript path, `session-evaluation.md`'s "Prompt contents, in this order" list gains a fifth item: "evaluate from byte offset N (line L); these records already exist: …; omit findings they cover" — contract text, not improvised prose.
- [ ] `--full` flag on `/feedback`, documented in `SKILL.md`'s flag table: ignore the watermark, re-judge the whole transcript, then overwrite the watermark.
- [ ] Watermark read/write as a small module `bin/lib/feedback/watermark.js` (byte offset → line number conversion included) with tests under `tests/bin-lib/feedback/`; the skill shells to it rather than hand-editing JSON.
- [ ] `docs/plugin-structure.md` lists the new module.

## Acceptance Criteria

1. First bare `/feedback` in a session: no watermark exists → the dispatch prompt carries no offset clause; after the judge returns, a watermark file exists with the transcript's byte size at dispatch time and the filed record numbers.
2. Second bare `/feedback` in the same session: the dispatch prompt contains the literal offset (`bytesAtDispatch`, plus its line number) and the filed record list; the judge is instructed to slice from that offset only.
3. `--full` bypasses the watermark (no offset clause) and rewrites it afterward.
4. A different transcript path (new session, or a worktree switch — see project memory: transcript slug tracks cwd) never reads another transcript's watermark.
5. Watermark write failure degrades open (evaluation still runs full) and is reported in Step 0's output — never a silent skip, never a blocked evaluation.
6. Module tests cover read-missing, write, read-back, `--full` reset, and byte→line conversion; `npm test` passes.

## Technical Approach

- Byte size via `fs.statSync(path).size` **at dispatch time**, not after the judge returns — the judge's own tool calls append to the transcript.
- The prompt item is appended to `session-evaluation.md`'s existing four-item list; the four items stay unchanged.
- The judge already slices with Grep/Read; the offset instruction gives it a `Read` line offset computed once by the module.

### Key Files
- `skills/feedback/session-evaluation.md`, `skills/feedback/SKILL.md` (Step 0, flag table)
- `bin/lib/feedback/watermark.js` (new), `tests/bin-lib/feedback/`
- `docs/plugin-structure.md`; the `.gitignore` pattern owned by `/claude-tweaks:init`

## Gotchas

- Key the watermark on the resolved transcript *path*, not the session id — a worktree switch changes the transcript directory slug mid-session.
- No transcript resolved (cloud fallback) → skip the watermark entirely, don't error.
- Store only record numbers and fingerprints — never finding text; the watermark is not a second backlog.
- Don't leave `.claude-tweaks/feedback/` untracked-but-visible in consuming repos: the ignore pattern lands where `/claude-tweaks:init` writes the others.

## Original request

feedback session-evaluation: no evaluation watermark — a second bare /feedback re-judges the whole transcript; delta scoping was hand-authored by the caller

**Summary:** `session-evaluation.md` has no concept of a prior evaluation of the same transcript (no watermark, offset, or already-filed set), so a second bare invocation in one session re-reads the full file from byte zero; the delta scoping that made this session's second run affordable was improvised prose in the dispatch prompt, not contract.

**Kind:** Gap

**Affected component:** `skills/feedback/session-evaluation.md`; `skills/feedback/SKILL.md` Step 0

**Objective:** Context overhead

**Measurement:** transcript 6.49 MB re-judged for a ~585 KB (9%) delta; the first judge cost ~130K subagent tokens / 83 tool uses / 632 s for eight findings; 0 lines in `session-evaluation.md` address re-evaluation.

**Use case:** Bare `/feedback` is meant to be cheap enough to run at the end of every session — and more than once when a session continues after the first run.

**Proposed fix:** Persist an evaluation watermark after each judge returns (transcript path, byte size at evaluation, record numbers filed) under `.claude-tweaks/` or the run dir; on a later invocation against the same transcript pass it into the dispatch as contract text ("evaluate from offset N; these records exist; omit what they cover"). Add a documented `--full` opt-in for a deliberate whole-transcript re-judge.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-f2e18dde -->

