# Transcript-Judge Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the consumer-agnostic transcript-judging mechanics from `plugin/skills/feedback/session-evaluation.md` into `plugin/skills/_shared/transcript-judge.md`, and namespace the evaluation watermark per consumer so a second consumer (reflect, sibling spec #857) can judge transcripts without corrupting feedback's watermark state.

**Architecture:** Move (not restate) the consumer-invariant transcript-resolution, dispatch, slicing, degradation, and watermark mechanics into one shared file, parameterized at four points (rubric, output template, model profile, watermark consumer key). `session-evaluation.md` shrinks to feedback's own rubric/template/profile/payload and cites the shared file for everything moved.

**Tech Stack:** Node.js (`plugin/bin/lib/`), markdown skill contracts, `node --test`.

**Spec:** `.claude-tweaks/pipelines/20260817T200443-spec-856-857-858/spec-856/work/856-spec.md`

**Note (re-planned mid-build):** v6.95.0 (`d1d8064b`) cut the plugin payload over to a `plugin/` subtree while this build was in flight. This plan was re-derived against the new layout — every path below is `plugin/`-prefixed where the pre-cutover plan said a bare `skills/`/`bin/` path. `tests/` and `docs/` did not move (maintainer-side, per the new CLAUDE.md).

## Global Constraints

- `node --test tests/` must pass in full after every task's commit.
- Existing on-disk watermarks under `.claude-tweaks/feedback/watermarks/` must stay readable — default consumer path is byte-identical to today (`watermarkPath('/x/abc.jsonl')` → `.claude-tweaks/feedback/watermarks/abc.json`).
- `plugin/skills/_shared/transcript-judge.md` must stay under 40,960 bytes.
- `plugin/skills/feedback/session-evaluation.md`'s post-migration byte count must be at or below its pre-migration size.
- Moved clauses are cited from `session-evaluation.md`, never restated.

## Tasks (completed inline during this build session — see commit history on this branch for the actual diffs)

1. **Move and extend the watermark module** — `plugin/bin/lib/feedback/watermark.js` → `plugin/bin/lib/transcript-judge/watermark.js`, add `{ consumer = 'feedback' }` param to `watermarkPath`/`readWatermark`/`writeWatermark`; move+extend `tests/bin-lib/feedback/watermark.test.js` → `tests/bin-lib/transcript-judge/watermark.test.js` (adds consumer-disjoint-path and per-consumer-round-trip tests).
2. **Create `plugin/skills/_shared/transcript-judge.md`** — the extracted shared harness: transcript resolution, judge dispatch, slicing guidance, finding norms, self-assessment degradation, watermark protocol; four named consumer parameterization points (rubric, output template, model profile, watermark consumer key).
3. **Migrate `plugin/skills/feedback/session-evaluation.md`** — shrink to feedback's own rubric binding, output template, profile resolution, and watermark payload; cite `_shared/transcript-judge.md` for everything moved.
4. **Generalize the gitignore suggestion** in `plugin/skills/init/bootstrap/step-04-gitignore-suggestions.md` — `.claude-tweaks/feedback/` → `.claude-tweaks/*/watermarks/*.json` (root `.gitignore` keeps its feedback-specific blanket line unchanged — existing on-disk state).
5. **Rewrite conformance tests** — `tests/feedback-watermark-prose.test.js` keeps feedback-specific pins (`--full`, gitignore divergence), drops moved-prose pins; new `tests/transcript-judge-prose.test.js` pins the shared file's four parameters, scope statement, timing/degrade-open clauses, both consumer keys, byte ceiling.
6. **Update `docs/skill-graph.md` and `docs/plugin-structure.md`** — add the feedback→transcript-judge edge; replace the `plugin/bin/lib/feedback/` family line's `watermark.js` mention with a new `plugin/bin/lib/transcript-judge/` family line; add `transcript-judge.md` to the `_shared` listing.
7. **Full suite + retirement sweep** — `npm test` all green; `grep -rn "bin/lib/feedback/watermark" plugin/ tests/ docs/` returns only the permitted `docs/journeys/evaluate-a-session-for-upstream-feedback.md` historical citation; AC literal-path and byte-ceiling verification.
