---
record: 856
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: transcript-judge-extraction:extract-skills-shared-transcript-judge-md-and-namespace-the
surface: backend
---
# 856: Extract skills/_shared/transcript-judge.md and namespace the evaluation watermark per consumer

Surface: backend

## Overview

Extract the consumer-agnostic transcript-judging mechanics from `skills/feedback/session-evaluation.md` into a new `skills/_shared/transcript-judge.md`, and give the evaluation watermark a per-consumer namespace so a second consumer (reflect, in the follow-up sub-issue) can judge the same transcript without corrupting feedback's incremental-evaluation state. Consumers never share a watermark file — isolation is the disjoint per-consumer path, and concurrent judging of the same transcript by two consumers needs nothing beyond that path separation (each consumer's offsets are meaningful only to its own evaluation); anything further is out of scope. Feedback's rubric, output template, Frontier profile, and watermark payload semantics stay in `session-evaluation.md`; everything mechanical moves. This is the enabling extraction for the whole decomposition — both sibling sub-issues consume the shared file it creates.

**Complexity:** Medium
**Estimated tasks:** 6-8

## Non-Goals

- No change to what feedback's judge evaluates or how its findings route — behavior-preserving extraction.
- No reflect changes (the follow-up sub-issue) and no finding-shape changes (the third sub-issue).
- No taxonomy merge between `_shared/feedback-objectives.md` and reflect's lenses (parent #855's Decision Rationale).
- No declined-learning fingerprint store — deferred as #849.
- No on-disk watermark migration — the default consumer path stays byte-identical.
- No responsibility for #500's adoption of the shared file — see the Related note below.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none | — |

Related: #500 — companion; its transcript-fallback candidate for the Friction lens should consume the `_shared/transcript-judge.md` this record creates rather than reinventing transcript resolution. #500 is expected to land after this merges; this record creates the harness but does not gate on, or own, #500's adoption of it.

## Current State

- Contract prose: `skills/feedback/session-evaluation.md` (8,745 B) owns transcript resolution (project-slug derivation with `/`, space, `.` → `-` and the doubled-hyphen rule; `$CLAUDE_CODE_SESSION_ID` path; mtime-newest fallback with mandatory disclosure; main-session-only scope statement), the single-Task-agent dispatch shape, the one-re-dispatch-on-`NEEDS_CONTEXT`/`BLOCKED` and format-retry rules, slicing guidance (grep/Read over sequential; countable-lens anchoring vs judgment-lens sampling; `NOT EVALUATED — {reason}`), the self-assessment degradation (including the `record-failure` clause added in commit a0742fe7), and the watermark protocol (capture `bytesAtDispatch` pre-dispatch; write on `DONE`/`DONE_WITH_CONCERNS` only; degrade open on write failure).
- Module: `bin/lib/feedback/watermark.js` — `watermarkPath` / `readWatermark` / `writeWatermark` / `byteOffsetToLine` / `formatOffsetClause`; path is hardcoded `.claude-tweaks/feedback/watermarks/{base}.json`; injectable-fs params throughout; sibling module `bin/lib/feedback/file-feedback.js` stays where it is.
- Tests: `tests/bin-lib/feedback/watermark.test.js` (unit) and `tests/feedback-watermark-prose.test.js` (prose pins on session-evaluation.md's watermark text — will go red if the migration forgets it).
- Other consumers of the path/module by name: `skills/init/bootstrap/step-04-gitignore-suggestions.md` (gitignore suggestion names `.claude-tweaks/feedback/watermarks/*.json` and cites the module path) and `docs/journeys/evaluate-a-session-for-upstream-feedback.md` (cites `bin/lib/feedback/watermark.js`).
- Extraction discipline: the repo has a dedicated `shared-contract-extraction` project skill (consumer-list derivation, keep-vs-surrender split, retirement sweep, conformance suite) — follow it.

## Deliverables

- [ ] `skills/_shared/transcript-judge.md` owning, verbatim-moved (not restated): transcript resolution incl. fallback + disclosure + main-session-only scope statement; the one-Task-agent dispatch shape with a **consumer-supplied model-profile parameter** and the `_shared/subagent-output-contract.md` status line; the one-re-dispatch-on-`NEEDS_CONTEXT`/`BLOCKED` and format-retry rules; slicing guidance; the finding norms (symptom / transcript evidence / proposed fix / `Cost this session:`, `Measurement:` with a session-sizing denominator for countable lenses, and "NO FINDING is the expected common answer"); the self-assessment degradation incl. the `record-failure` clause; the watermark protocol keyed by transcript path **plus a consumer key**. Before the move, confirm the degradation prose is payload-agnostic: where its current wording names feedback's payload fields (`filedRecords`, `dismissedFingerprints`), the payload reference is a fourth consumer-supplied point and the naming stays in `session-evaluation.md` — never in the shared file.
- [ ] `watermark.js`: `watermarkPath(transcriptPath, { consumer = 'feedback' })` → `.claude-tweaks/{consumer}/watermarks/{base}.json`; `readWatermark`/`writeWatermark` accept and forward the same option; default output byte-identical to today.
- [ ] Move `bin/lib/feedback/watermark.js` → `bin/lib/transcript-judge/watermark.js` (flat sibling dir per `bin/lib/` convention) and `tests/bin-lib/feedback/watermark.test.js` → `tests/bin-lib/transcript-judge/watermark.test.js`; update every citation found in Current State. (`bin/lib/feedback/file-feedback.js` does not require watermark.js — verified via `grep -n "watermark" bin/lib/feedback/file-feedback.js` returning no matches, re-runnable at pickup; the move is prose-and-test-path only.)
- [ ] `skills/feedback/session-evaluation.md` migrated: keeps rubric binding (`_shared/feedback-objectives.md` inlined as prompt item 1), its output template, the Frontier profile resolution and standalone-cap rationale, and its `filedRecords`/`dismissedFingerprints` watermark payload; cites `_shared/transcript-judge.md` for everything moved. Retirement sweep: no moved clause survives as a restatement.
- [ ] `skills/init/bootstrap/step-04-gitignore-suggestions.md` gitignore suggestion generalized to the literal `.claude-tweaks/*/watermarks/*.json` (still no blanket `.claude-tweaks/` line — the `!`-negation rationale in that file stands).
- [ ] Conformance tests: the shared file owns each moved clause; `session-evaluation.md` cites it; each new assertion proven able to go red per the `skill-prose-conformance-tests` discipline.
- [ ] Unit tests: default path pinned as a literal (`.claude-tweaks/feedback/watermarks/{base}.json`); `consumer: 'reflect'` produces a disjoint path; read/write round-trip per consumer.
- [ ] `docs/skill-graph.md` gains the feedback→transcript-judge edge; `docs/plugin-structure.md` gains the new `_shared` file and the `bin/lib/transcript-judge/` module.

## Acceptance Criteria

1. `node --test tests/` passes in full, including the updated `tests/feedback-watermark-prose.test.js` and the relocated watermark unit suite.
2. `watermarkPath('/x/abc.jsonl')` with no option returns exactly `.claude-tweaks/feedback/watermarks/abc.json` (pinned literal in a unit test), and `watermarkPath('/x/abc.jsonl', { consumer: 'reflect' })` returns `.claude-tweaks/reflect/watermarks/abc.json`.
3. A case-insensitive grep over `skills/feedback/session-evaluation.md` for the moved mechanics' anchor phrases (project-slug derivation rules, "newest `.jsonl`", the self-assessment template rule, the `bytesAtDispatch` capture-before-dispatch rationale, the re-dispatch-on-`NEEDS_CONTEXT`/`BLOCKED` rule, and the format-retry rule) finds citations of `_shared/transcript-judge.md`, not restatements — the conformance suite encodes this and has been demonstrated to fail when a restatement is reintroduced.
4. `grep -rn "bin/lib/feedback/watermark" bin/ tests/ skills/ docs/` returns zero matches, with exactly one permitted exemption: matches inside a `## Change History` section of a `docs/journeys/*.md` file, which keep the old path as history.
5. `wc -c skills/_shared/transcript-judge.md` < 40,960 (the 40 KB sub-file ceiling).
6. Sanity check subordinate to AC3: `skills/feedback/session-evaluation.md`'s post-migration byte count is at or below its pre-migration 8,745 B; small residual growth from citation text is acceptable only if AC3's citation-not-restatement check passes — AC3 is the correctness proof, this is the smell test.

## Technical Approach

Follow the `shared-contract-extraction` skill end-to-end. The shared file is parameterized by consumer at four points, composed by a stated join convention: **prompt items 1–2 are consumer-supplied (the rubric file inlined verbatim, and the consumer's output template); the shared file defines items 3 onward (transcript path, slicing guidance, the conditional offset clause) plus every surrounding dispatch rule** — along with the model-profile argument and the watermark consumer key. These four points were validated against the second consumer's known needs before this shape was fixed: parent #855's Decision Rationale pins reflect's parameters (lens-file rubric, `frontier` profile, `reflect` watermark key, existing-singleton dispatch), so the interface is consumer-validated, not speculative. Everything else is consumer-invariant prose moved verbatim (the extraction rule: move, don't rephrase — rephrasing is how retirement sweeps miss).

### Data / API Surface

- `watermarkPath(transcriptPath, { consumer = 'feedback' } = {})` — string derivation only, no fs. The consumer key is any non-empty string; no enum or registry — collision avoidance is the caller's responsibility, and the shared file's consumer-parameterization section names the known consumers (`feedback`, and `reflect` once the sibling lands) so a third consumer's author sees what is taken.
- `readWatermark(transcriptPath, { consumer, readFile } = {})` / `writeWatermark(transcriptPath, data, { consumer, mkdirSync, writeFile } = {})` — forward `consumer` to `watermarkPath`; degrade-open/throw semantics unchanged.
- `byteOffsetToLine` / `formatOffsetClause` — unchanged.
- Model-profile parameter: a profile name string (`frontier` / `capable` / `standard` / `fast`) the consumer passes into the shared file's stated `resolve-profile.js` invocation form — not an object, not a callback.

### Key Files

- `skills/_shared/transcript-judge.md` — new; the extracted contract.
- `skills/feedback/session-evaluation.md` — shrinks to rubric + template + profile + payload + citation.
- `bin/lib/feedback/watermark.js` → `bin/lib/transcript-judge/watermark.js` — consumer option + move.
- `tests/bin-lib/feedback/watermark.test.js` → `tests/bin-lib/transcript-judge/watermark.test.js` — path pins + consumer cases.
- `tests/feedback-watermark-prose.test.js` — re-point prose pins at the split text.
- `skills/init/bootstrap/step-04-gitignore-suggestions.md` — per-consumer gitignore text.
- `docs/journeys/evaluate-a-session-for-upstream-feedback.md` — module-path citation.
- `docs/skill-graph.md`, `docs/plugin-structure.md` — new edges / new entries.

### Package Dependencies

- none (Node built-ins only, matching the existing module).

## Gotchas

- `tests/feedback-watermark-prose.test.js` byte-pins prose in `session-evaluation.md` — run the full suite, not just the touched suites, before merging (conformance tests pin prose repo-wide).
- The retirement sweep must grep each moved clause's distinctive phrases AND their regex-escaped forms; leaf files and escaped test pins are the usual misses.
- Commit a0742fe7 (2026-08-17) added the `record-failure` clause to the degradation path — it moves with the degradation text; do not sweep it away as an unrecognized restatement. Its `resolve-profile.js record-failure {model}` invocation is consumer-invariant (it records whichever model failed) and moves verbatim inside the degradation prose — it is not one of the four parameterization points.
- Existing on-disk watermarks under `.claude-tweaks/feedback/watermarks/` must stay readable with zero migration — the consumer default is the compatibility contract; pin it as a literal, not via the derivation.
- Keep `step-04-gitignore-suggestions.md`'s no-blanket-`.claude-tweaks/` rationale intact when generalizing the watermark line — git cannot re-include a subdirectory of an ignored parent via `!` negation.
- `_shared/transcript-judge.md` states the main-session-only scope as a **named coverage gap** (dispatched Task agents write separate transcripts) — this disclosure is load-bearing for the reflect consumer (see parent #855's Decision Rationale cross-session caveat).

## Decision Rationale

See parent #855's Decision Rationale — this sub-issue implements the shared-harness and watermark-namespacing decisions recorded there.


<!-- work-fingerprint: transcript-judge-extraction:extract-skills-shared-transcript-judge-md-and-namespace-the -->

