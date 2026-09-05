# Fast-Lane Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `ceremony-profile: fast-lane` review/wrap-up run one short, single-read file that names every fast-lane skip/narrow decision, so procedure-discovery no longer requires opening every sub-file that happens to mention ceremony just to learn its one-line fast-lane verdict.

**Architecture:** Add `plugin/skills/_shared/fast-lane-digest.md` as the single source a fast-lane run reads for routing. It restates (never overrides) the skip/narrow facts already scattered across `review/code-mode-steps.md`, `wrap-up/ceremony-derivation.md`, `wrap-up/skill-curation.md`, `wrap-up/docs-health-integration.md`, and `wrap-up/SKILL.md`'s escape hatch. Wire the cheapest, highest-value short-circuits into the existing entry points: `review/SKILL.md` points fast-lane runs at the digest before loading `code-mode-steps.md`; `wrap-up/ceremony-derivation.md`, `wrap-up/skill-curation.md`, and `wrap-up/docs-health-integration.md` each get a one-line pointer replacing (or preceding) their own restated fast-lane paragraph, so a fast-lane run that already knows `ceremony-profile` need not read that paragraph's rationale. `wrap-up/SKILL.md` is not touched — it sits at 40708/40960 bytes (#1808), essentially no headroom — its existing fast-lane facts stay as the last-resort behavioral source of truth; the digest cites them without requiring an edit there.

**Tech Stack:** Markdown (SKILL.md/`_shared/*.md` prose), `node --test` conformance test.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T174130-record-1765/work/1765-spec.md` (record #1765)

## Global Constraints

- No SKILL.md may exceed 40 KB (`tests/bin-lib/skill-audit/context-cost.test.js`) — `wrap-up/SKILL.md` (40708 B) gets no edits in this plan.
- No behavior change: which review/wrap-up steps execute or skip at any ceremony profile must be identical before and after this change (spec Acceptance Criteria).
- Every fast-lane fact in the new digest must be a verbatim-consistent restatement of its existing canonical source, not a new invention.

---

### Task 1: Add the fast-lane digest and wire the ceremony-gated entry points

**Files:**
- Create: `plugin/skills/_shared/fast-lane-digest.md`
- Modify: `plugin/skills/review/SKILL.md` (insert one paragraph before the existing "In `code` and `full` mode, read `code-mode-steps.md`..." line)
- Modify: `plugin/skills/wrap-up/ceremony-derivation.md` (insert one paragraph at top)
- Modify: `plugin/skills/wrap-up/skill-curation.md` (replace the existing "Fast-lane narrows breadth, never gates existence" paragraph with a shorter citation to the digest, keeping the same fact)
- Modify: `plugin/skills/wrap-up/docs-health-integration.md` (same replacement)
- Test: `tests/fast-lane-digest.test.js`

**Interfaces:**
- Consumes: nothing new — reads existing prose facts already present in `code-mode-steps.md` (Ceremony-Aware Step Selection section, lines 5-20), `wrap-up/SKILL.md` (Reflect section lines 118-130, Ceremony escape hatch lines 132-149, registry table lines 159-162), `reflect/light-mode.md`.
- Produces: `plugin/skills/_shared/fast-lane-digest.md` — a markdown file other skills/tests may cite by path; no code API.

- [ ] **Step 1: Write the failing conformance test**

```javascript
'use strict';
// tests/fast-lane-digest.test.js — pins that plugin/skills/_shared/fast-lane-digest.md
// exists and states the fast-lane skip/narrow facts for review and wrap-up (#1765),
// and that the ceremony-gated entry points cite it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIGEST_PATH = path.join(ROOT, 'plugin', 'skills', '_shared', 'fast-lane-digest.md');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('fast-lane-digest.md exists', () => {
  assert.ok(fs.existsSync(DIGEST_PATH), 'plugin/skills/_shared/fast-lane-digest.md must exist');
});

test('digest names the review fast-lane skip list (Steps 1, 1.6, 4)', () => {
  const md = read('plugin/skills/_shared/fast-lane-digest.md');
  assert.ok(/Step 1 .*Spec Compliance/i.test(md), 'must name Step 1 (Spec Compliance Check)');
  assert.ok(/Step 1\.6 .*Cross-Spec Promise/i.test(md), 'must name Step 1.6 (Cross-Spec Promise Check)');
  assert.ok(/Step 4 .*Implementation Hindsight/i.test(md), 'must name Step 4 (Implementation Hindsight)');
  assert.ok(md.includes('**skip**'), 'must mark skipped steps distinctly');
});

test('digest names the wrap-up narrowed caps and reflect light mode', () => {
  const md = read('plugin/skills/_shared/fast-lane-digest.md');
  assert.ok(md.includes('top 2'), 'must state the fast-lane Skills row cap (top 2)');
  assert.ok(md.includes('top 1'), 'must state the fast-lane Docs row cap (top 1)');
  assert.ok(/light.*mode/i.test(md), 'must name Reflect light mode');
  assert.ok(md.includes('Near-misses') && md.includes('Fresh start') && md.includes('Friction'),
    'must name all three light-mode lenses');
});

test('digest names the ceremony escape hatch trigger conditions', () => {
  const md = read('plugin/skills/_shared/fast-lane-digest.md');
  assert.ok(/finding at any severity/i.test(md), 'must name the review-finding trigger');
  assert.ok(/Safety.regression/i.test(md), 'must name the Safety-regression trigger');
});

test('digest states it never overrides its canonical sources', () => {
  const md = read('plugin/skills/_shared/fast-lane-digest.md');
  assert.ok(/never override|restates it, never overrides/i.test(md),
    'must state the restate-not-override relationship to its canonical sources');
});

test('review/SKILL.md points fast-lane runs at the digest before code-mode-steps.md', () => {
  const md = read('plugin/skills/review/SKILL.md');
  assert.ok(md.includes('fast-lane-digest.md'), 'review/SKILL.md must cite fast-lane-digest.md');
});

test('wrap-up/ceremony-derivation.md short-circuits when config.yml already reads fast-lane', () => {
  const md = read('plugin/skills/wrap-up/ceremony-derivation.md');
  assert.ok(md.includes('fast-lane-digest.md'), 'ceremony-derivation.md must cite fast-lane-digest.md');
});

test('wrap-up/skill-curation.md and docs-health-integration.md cite the digest for the cap number', () => {
  const skillMd = read('plugin/skills/wrap-up/skill-curation.md');
  const docsMd = read('plugin/skills/wrap-up/docs-health-integration.md');
  assert.ok(skillMd.includes('fast-lane-digest.md'), 'skill-curation.md must cite fast-lane-digest.md');
  assert.ok(docsMd.includes('fast-lane-digest.md'), 'docs-health-integration.md must cite fast-lane-digest.md');
});

test('wrap-up/SKILL.md is untouched by this change (stays under the 40 KB ceiling with no new growth)', () => {
  const md = read('plugin/skills/wrap-up/SKILL.md');
  assert.ok(!md.includes('fast-lane-digest.md'),
    'wrap-up/SKILL.md must not be edited in this plan (near-zero headroom under the 40 KB ceiling, #1808)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/fast-lane-digest.test.js`
Expected: FAIL — `plugin/skills/_shared/fast-lane-digest.md` does not exist yet (first test fails; later tests fail on missing file read).

- [ ] **Step 3: Write `plugin/skills/_shared/fast-lane-digest.md`**

Content (verbatim):

```markdown
# Fast-Lane Digest — `/claude-tweaks:review` and `/claude-tweaks:wrap-up` at `ceremony-profile: fast-lane`

One condensed lookup, read once instead of opening every sub-file below just to learn what
`fast-lane` skips or narrows (#1765). This file restates it, never overrides it — every fact
below is a literal restatement of what its cited canonical source already states. A drift
between this file and its cited source is a bug in this file, never authority to change
behavior on its own.

**When to read this file:** `/claude-tweaks:review` (`code`/`full` mode) or `/claude-tweaks:wrap-up`,
once a pipeline run directory's `config.yml` reads `ceremony-profile: fast-lane`. Standalone
invocations (no run directory) and `standard`-profile runs get no benefit here — proceed to the
full procedure documented in each skill's own `SKILL.md` instead.

## Review — Ceremony-Aware Step Selection (`code`/`full` mode)

| Step | Fast-lane | Sub-file (open only once you actually reach this step) |
|---|---|---|
| 1 — Spec Compliance Check | **skip** | n/a |
| 1.5 — Test Gate | run | `code-mode-steps.md` |
| 1.6 — Cross-Spec Promise Check | **skip** | n/a — `cross-spec-promise-check.md` never opens |
| 2 — Identify What Changed + Merge-Provenance Check | run | `code-mode-steps.md`, `merge-provenance-check.md` |
| 2.5 — Derive Review Effort | run | `review-effort-derivation.md` |
| 3 / 3.5 / 3.6 / Step 3 Routing — Code Review, debate, refutation, routing | run | `code-mode-steps.md`, `step3-lens-dispatch.md`, `step3-debate-and-refutation.md`, `step3-doc-freshness-lens.md`, `step3-routing.md` |
| 4 — Implementation Hindsight | **skip** | n/a |
| 5 — Simplify Changed Code | run | `code-mode-steps.md` |
| 6 — Visual Review | run (browser/dev-server permitting) | `code-mode-steps.md` |
| 6.5 — Design Quality Pass | run (per `design-critique` lever) | `code-mode-steps.md`, `ux-analysis.md` |
| 6.7 — Late Findings Routing | run | `code-mode-steps.md` |
| 7 — Present Review Summary | run | `code-mode-steps.md`, `review-summary-template.md` |

A finding at any severity in Step 3 (or a Safety-regression finding at wrap-up's Reflect step
below) trips the ceremony escape hatch documented in the wrap-up section below — review itself
never re-derives ceremony.

Canonical source: `review/code-mode-steps.md`'s "Ceremony-Aware Step Selection" section.

## Wrap-up — narrowed rows and escape hatch

**Reflect (Phase 1):** `light` mode — Near-misses, Fresh start, Friction only, no tradeoff
review, no Surprises/Approach lenses. Canonical: `reflect/light-mode.md`.

**Registry rows (Phase 2), domain-overlap caps only — gate/existence unaffected:**

| Row | Standard cap | Fast-lane cap | Judge file (open only if the row's gate is open and you must actually curate it) |
|---|---|---|
| Skills | top 5 | top 2 | `skill-curation.md` |
| Docs | top 3 | top 1 | `docs-health-integration.md` |

Every other registry row (Journeys, CLAUDE.md & rules, Decision records, Broken references,
Memory, Upstream feedback) is unaffected by ceremony — same gate, same scope, at every profile.

**Ceremony escape hatch (fast-lane only):** after Reflect, downgrade `ceremony-profile` to
`standard` for the rest of the run when either:
- `/claude-tweaks:review`'s summary carried a finding at any severity, or
- the Reflect pass above produced a Safety-regression finding.

Canonical: `wrap-up/SKILL.md`'s "Ceremony escape hatch" section.

**Diff-derived ceremony default (headless firings only):** a `standard` header default can
itself narrow to `fast-lane` before Reflect runs, when the diff is low-surface (0 production
files changed). Canonical: `wrap-up/ceremony-derivation.md` — open it only when this run's
header-fold default is `standard` and you need to check whether it narrows; once `config.yml`
already reads `fast-lane`, there is nothing left to derive and this file never needs to open.

## What this file does not replace

- Each cited sub-file's actual step **content** (the code review itself, the curation
  judgment, the reflect lenses) — this digest names whether a step runs and where its
  procedure lives, never the procedure itself.
- `SKILL.md`'s own mode dispatch (`code`/`full`/`visual`/`journey`/`discover` for review;
  Phase 1-4 structure for wrap-up) — read the owning `SKILL.md` first to resolve mode/phase,
  then this digest for the ceremony-aware branch within it.
```

- [ ] **Step 4: Wire `review/SKILL.md`**

Insert immediately before the existing paragraph that begins "In `code` and `full` mode, read
`code-mode-steps.md` in this skill's directory now...":

```markdown
**Fast-lane shortcut.** When a pipeline run directory's `config.yml` already reads
`ceremony-profile: fast-lane`, read `_shared/fast-lane-digest.md` first — it names every
skip/narrow decision below in one place. It never replaces `code-mode-steps.md`'s actual step
content (Steps 1.5, 2, 2.5, 3-3.6, 5, 6, 6.5, 6.7, 7 still run there); it only saves re-deriving
the skip list for Steps 1, 1.6, and 4 from that file's own header.
```

- [ ] **Step 5: Wire `wrap-up/ceremony-derivation.md`**

Insert at the top of the file, immediately after its title line:

```markdown
**Already `fast-lane`? Skip this file.** If `config.yml`'s `ceremony-profile` already reads
`fast-lane` (a header-set value, not a headless derivation), there is nothing left for this
file's derivation logic to do — go straight to `_shared/fast-lane-digest.md`'s wrap-up section.
This file matters only for a headless firing whose header default is still `standard`.
```

- [ ] **Step 6: Wire `wrap-up/skill-curation.md`**

Replace:

```markdown
**Fast-lane narrows breadth, never gates existence.** Under `ceremony-profile: fast-lane` (the lever is defined in `_shared/policy-schema.md`; its rationale was `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`, deleted `70849915`), 7.2's independent scan still always runs regardless of seeds — only its cap shrinks. This is a deliberate, narrow exception to the cap number, not a reopening of the seed-gating question this principle exists to close.
```

with:

```markdown
**Fast-lane narrows breadth, never gates existence.** See `_shared/fast-lane-digest.md`'s
wrap-up section for the exact cap number — 7.2's independent scan still always runs regardless
of seeds; only its cap shrinks. This is a deliberate, narrow exception to the cap number, not a
reopening of the seed-gating question this principle exists to close.
```

- [ ] **Step 7: Wire `wrap-up/docs-health-integration.md`**

Replace:

```markdown
**Fast-lane narrows breadth, never gates existence.** Under `ceremony-profile: fast-lane` the engine applies the profile to `scope.cap` only, never to gate evaluation (`engine-plan.js`'s `resolveDomainOverlapScope`) — D0's scan still runs whenever the row's gate is open, with a smaller cap. The same principle `skill-curation.md` states for the Skills row; it holds for this row too.
```

with:

```markdown
**Fast-lane narrows breadth, never gates existence.** See `_shared/fast-lane-digest.md`'s
wrap-up section for the exact cap number — the engine applies the profile to `scope.cap` only,
never to gate evaluation (`engine-plan.js`'s `resolveDomainOverlapScope`); D0's scan still runs
whenever the row's gate is open, with a smaller cap. The same principle `skill-curation.md`
states for the Skills row; it holds for this row too.
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/fast-lane-digest.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 9: Run the full size-ceiling suite to confirm no regression**

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS — `wrap-up/SKILL.md` untouched; all edited files stay well under 40 KB.

- [ ] **Step 10: Commit**

```bash
git add plugin/skills/_shared/fast-lane-digest.md plugin/skills/review/SKILL.md \
  plugin/skills/wrap-up/ceremony-derivation.md plugin/skills/wrap-up/skill-curation.md \
  plugin/skills/wrap-up/docs-health-integration.md tests/fast-lane-digest.test.js
git commit -m "Add fast-lane digest for review/wrap-up ceremony procedure-discovery (refs #1765)"
```
