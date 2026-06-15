# Recon Phase 0: Shared Criteria Extraction — Implementation Plan

> **Canonical interface:** cross-phase API signatures (cache, fingerprint, dedup, paths, labels) live in `2026-06-14-recon-interface-contract.md`. Where this plan's inline names differ, the contract wins.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Extract the analysis criteria ("what is worth flagging") of `/deepen`, `/simplify`, and `/review` into three self-contained `skills/_shared/criteria-*.md` fragments, then rewire those three skills to reference the fragments — one source of truth that `/recon`'s judgment lenses (Phase 2) will reuse.

**Architecture:** Each fragment is "criteria only" — the durable judgment knowledge (shallow-module detection, simplification smells, the severity/category/calibration taxonomy) lifted out of skill-specific workflow, so it is consumable verbatim by both the reactive skill *and* a future Phase 2 subagent prompt. The three skills keep their workflow steps but replace inlined criteria text with a "read `skills/_shared/criteria-*.md`" reference. This is a content-preserving refactor: no behavior changes, only the home of the criteria moves. A small `node --test` assertion test locks in that the fragments exist and the skills point at them.

**Tech Stack:** Markdown skill files; node --test for any assertion tests

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `skills/_shared/criteria-architecture-depth.md` | **Create** | Architecture-depth criteria from `/deepen`: depth-as-leverage, the deletion test, the two opportunity kinds (deepen/collapse), leverage ranking, dependency classification (pure / local stand-in / network-boundary → port+adapter), controlled vocabulary. Criteria only — no Steps, no auto-mode, no Next Actions. |
| `skills/_shared/criteria-simplification.md` | **Create** | Simplification criteria from `/simplify`: the "what it catches" list (unnecessary complexity, verbose debugging patterns, abandoned-approach defensive code, cross-file inconsistency, dead paths / redundant conditionals / over-abstraction, cross-task consolidation) + the behavior-preserving constraint and the readability counter-rule. |
| `skills/_shared/criteria-review-quality.md` | **Create** | Review-quality criteria from `/review`: severity taxonomy (`low\|medium\|high\|critical` + `info`), the category enum (Architecture, Security, Convention, Performance, Error handling, Test quality, Coverage, UX, Docs), the per-lens severity-floor calibration table, the byte-identical CALIBRATION "only flag when / do not flag" block, and a pointer to `_shared/auto-mode-contract.md` for confidence/reversibility vocab (not duplicated). |
| `skills/deepen/SKILL.md` | **Modify** | Vocabulary Contract + Step 2 reference the new fragment for the depth criteria; keep workflow. |
| `skills/deepen/depth-analysis.md` | **Modify** | Becomes the *method/workflow* file that references the criteria fragment for the depth model + vocabulary instead of restating them; keeps the Step-2-to-4 procedural wiring. |
| `skills/simplify/SKILL.md` | **Modify** | Step 2 "What it catches" / "Constraints" reference the new fragment instead of inlining the list. |
| `skills/review/SKILL.md` | **Modify** | Step 3 severity-floor table + lens criteria reference the review-quality fragment; keep lens routing/workflow. |
| `skills/review/step3-routing.md` | **Modify** | CALIBRATION block + severity scale reference the fragment as the source of truth (keep the byte-identical inlined copy for dispatch, but mark the fragment canonical). |
| `tests/recon/criteria-fragments.test.js` | **Create** | `node --test` assertions: the three fragments exist, contain their signature criteria text, and the three skills reference them by path. |
| `CLAUDE.md` | **Modify** | Add the three `criteria-*.md` fragments to the `skills/_shared/*.md` description line (catalog hygiene only — not a cross-ref or version bump). |

> **Out of scope for Phase 0 (do NOT do here):** bidirectional Relationship-table cross-refs for `/recon`, the `plugin.json` version bump, README / `/help` / marketplace updates. Those ship when `/recon` itself lands (Phase 1, per design §12 and §13). Phase 0 only moves criteria text to a shared home and rewires the three reactive skills.

---

## Task 1: Extract architecture-depth criteria from /deepen

**Files:**
- Create `skills/_shared/criteria-architecture-depth.md`

The source criteria already exist in `skills/deepen/depth-analysis.md` (the "Depth = leverage", "The deletion test", "Two kinds of opportunity", "Leverage ranking", "Dependency classification", and "Controlled vocabulary" sections — lines 5-71). This task lifts that *criteria content* into the fragment, stripping the skill-specific procedural wiring ("Step 3 presents…", "Step 4 interface conversation", "Loaded by /deepen Steps 2-4").

- [ ] Create `skills/_shared/criteria-architecture-depth.md` with a header that names it as a shared, criteria-only fragment and lists its two consumers (`/deepen` and `/recon` Phase 2 subagents). Then move, verbatim, the criteria blocks from `depth-analysis.md`: the leverage definition, the deletion test, the two-kinds table, the leverage-ranking factors, the dependency-classification table, and the controlled-vocabulary table. Remove only the sentences that reference `/deepen` Step numbers (e.g. the "Step 3 presents… Step 4 interface conversation" tails) so the fragment stands alone. Proposed content:

```markdown
# Criteria: Architecture Depth

Shared, criteria-only fragment — the "what is worth flagging" knowledge for architectural depth. No workflow, no auto-mode handling, no Next Actions. Consumed by `/claude-tweaks:deepen` (the reactive depth pass) and by `/claude-tweaks:recon`'s architecture-depth judgment lens (Phase 2 subagents). One source of truth so a reactive review and a proactive sweep apply identical criteria.

## Depth = leverage, not line ratio

A **deep** module hides a lot of behavior behind a small interface. A **shallow** module has an interface nearly as complex as its implementation — the abstraction isn't earning its keep, and a caller would be no worse off inlining it.

Do **not** measure depth as a ratio of implementation lines to interface lines. That metric rewards padding the implementation to look deep, and it punishes genuinely simple-but-deep modules. Measure **leverage** instead:

> **Leverage = how much behavior a caller can exercise per unit of interface they must learn.**

A module is deep when callers (and their tests) get a lot of mileage from a tiny surface area. It is shallow when learning the interface costs nearly as much as reading the implementation would have. This is a behavioral judgment, not a line count — make it by reading the call sites, not by counting.

## The deletion test

For any module you suspect is shallow, ask:

> **Would deleting this module concentrate complexity, or just move it?**

- **Concentrates complexity** → the module was earning its keep. Inlining it would force every caller to relearn the hidden behavior. Keep it; it is deep enough. Not a candidate.
- **Just moves it** → the module is a pass-through. Its callers already carry the complexity; the module only adds a name and an indirection. **Shallow** — a candidate for collapsing into its caller or merging with a sibling.

The deletion test is the primary shallow-detector. Apply it before proposing any deepening — a "deepening opportunity" that fails the deletion test is really a "deletion opportunity," and you should say so.

## Two kinds of opportunity

| Opportunity | Signal | Move |
|-------------|--------|------|
| **Deepen** | A real abstraction exists but leaks — callers must know implementation details, pass redundant config, or sequence calls in a fixed order the module could own. | Widen what the module hides; shrink the interface. |
| **Collapse** | The deletion test says "just moves it" — a thin wrapper, a one-call pass-through, a module whose interface mirrors its single dependency. | Inline it, or merge it into a sibling so the surviving module gets deeper. |

Both increase average depth across the codebase. Report each as what it is — do not dress a collapse up as a deepening.

## Leverage ranking

Rank candidates by leverage gained per unit of churn, highest first:

1. **Callers affected** — how many call sites get simpler. More callers = more leverage.
2. **Interface shrink** — how much smaller the surface a caller must learn becomes (fewer params, fewer required call sequences, fewer leaked types).
3. **Blast radius** — how much code must change to do it. Lower is better; a high-leverage change with a small blast radius ranks above a high-leverage change that rewrites a subsystem.

## Dependency classification (testing the deepened module)

A deeper module is only safe to ship if it stays testable. When deepening, classify the module's dependencies — this determines the test approach:

| Class | Examples | Test approach |
|-------|----------|---------------|
| **Pure computation** | Parsing, formatting, calculation, pure transforms | Deepens trivially — test through the public interface with plain inputs/outputs. No stand-ins needed. |
| **Local stand-in** | Database, filesystem, cache | Deepens with an in-process stand-in running in the suite (e.g. PGLite for Postgres, in-memory FS). Test through the interface against the stand-in. |
| **Network boundary** | Third-party API, remote service, message bus | Define a **port** at the seam (a narrow interface the module owns) and inject the transport as an **adapter**. Test the module against a fake adapter; test the real adapter separately. This is ports-and-adapters at the granularity of one module. |

If a candidate's dependencies can't be classified into one of these — or deepening would force a network call into a previously pure module — flag that as a risk, because it raises the cost of the refactor.

## Controlled vocabulary

Use exactly these terms when proposing and discussing refactors. Consistent language keeps proposals comparable.

| Term | Meaning |
|------|---------|
| **module** | A unit with an interface and a hidden implementation. |
| **interface** | What a caller must learn to use the module. |
| **implementation** | What the module hides. |
| **depth** | Leverage — behavior exercised per unit of interface learned. |
| **seam** | A point where a dependency can be substituted (the boundary a port sits on). |
| **adapter** | The concrete transport behind a port. |
| **leverage** | The ranking quantity — see above. |

Do **not** drift into `component`, `service`, `API`, or `boundary` in proposals — they blur the distinctions above and make two proposals hard to compare. (`API` is fine when it literally means a network API; not as a synonym for "interface".)
```

- [ ] Verify the fragment exists and carries the signature criteria: `grep -n "Leverage = how much behavior" skills/_shared/criteria-architecture-depth.md` and `grep -n "deletion test" skills/_shared/criteria-architecture-depth.md` and `grep -n "ports-and-adapters" skills/_shared/criteria-architecture-depth.md` all return a hit.
- [ ] Diff-think: confirm no criteria were lost in the lift — every row of the two tables (two-kinds, dependency-classification, vocabulary) and the leverage/deletion definitions present in `depth-analysis.md` lines 5-71 appear in the fragment. The only deletions allowed are `/deepen`-Step references and the "Loaded by /deepen Steps 2-4" header line.
- [ ] Commit: `Extract architecture-depth criteria into _shared/criteria-architecture-depth.md`

---

## Task 2: Rewire /deepen to read the architecture-depth fragment

**Files:**
- Modify `skills/deepen/depth-analysis.md`
- Modify `skills/deepen/SKILL.md`

`depth-analysis.md` becomes the *method/workflow* file (how `/deepen` walks Steps 2-4) and defers the criteria to the fragment. SKILL.md's Vocabulary Contract and Step 2 point at the fragment as the criteria source.

- [ ] In `skills/deepen/depth-analysis.md`, replace the six criteria sections (Depth = leverage, The deletion test, Two kinds of opportunity, Leverage ranking, Dependency classification, Controlled vocabulary) with a single pointer paragraph plus the *procedural* tails that are `/deepen`-specific. Proposed replacement body (keep the existing header line "Loaded by `/claude-tweaks:deepen` Steps 2-4"):

```markdown
# Depth Analysis — the method behind /claude-tweaks:deepen

Loaded by `/claude-tweaks:deepen` Steps 2-4. The **criteria** — the depth model (leverage, not line ratio), the deletion test, the two opportunity kinds, the leverage ranking, the dependency classification, and the controlled vocabulary — now live in one shared place: read `_shared/criteria-architecture-depth.md` (path relative to the skills root). This file covers only how `/deepen` *applies* those criteria across its steps.

## Applying the criteria across the steps

- **Step 2 (find shallow modules):** apply the deletion test and the leverage judgment from the criteria fragment to each in-scope module, classifying each suspected-shallow module as a **deepen** or a **collapse** opportunity.
- **Step 3 (rank and present):** order candidates by the leverage ranking (callers affected → interface shrink → blast radius). **Do not propose interfaces yet** — present *what* is shallow and *why*. Proposing concrete interfaces for every candidate up front is the runaway-rewrite this skill exists to prevent.
- **Step 4 (design the interface):** only for candidates the user picked, run the dependency classification from the criteria fragment to state how the deepened module will be tested (pure / local stand-in / network-boundary → port+adapter).
```

- [ ] In `skills/deepen/SKILL.md`, update the **Vocabulary Contract** paragraph: change "Definitions live in `depth-analysis.md` in this skill's directory." to "Definitions live in `_shared/criteria-architecture-depth.md` (the shared depth criteria). `depth-analysis.md` shows how `/deepen` applies them." Leave the rest of the Vocabulary Contract intact.
- [ ] In `skills/deepen/SKILL.md` Step 2, change the lead-in "Apply the method in `depth-analysis.md` (read it in this skill's directory):" to "Apply the depth criteria in `_shared/criteria-architecture-depth.md`; `depth-analysis.md` (this skill's directory) shows how those criteria map onto Steps 2-4:". Leave the three numbered sub-points in Step 2 unchanged.
- [ ] In `skills/deepen/SKILL.md` Step 3 and Step 4, change the two inline "see `depth-analysis.md`" / "per `depth-analysis.md`" references that point at *criteria* (the leverage-ranking factors in Step 3, the dependency-classification in Step 4) to point at `_shared/criteria-architecture-depth.md`. Keep references that point at procedure unchanged.
- [ ] Add an `_shared/criteria-architecture-depth.md` row to `/deepen`'s **Relationship to Other Skills** table: `| _shared/criteria-architecture-depth.md | The shared depth criteria (leverage, deletion test, dependency classification, vocabulary) — single source of truth read by both /deepen and /recon's architecture-depth lens. |`
- [ ] Verify the rewire: `grep -n "criteria-architecture-depth" skills/deepen/SKILL.md skills/deepen/depth-analysis.md` returns hits in all three locations (Vocabulary Contract, Step 2, depth-analysis pointer). Confirm `grep -n "Leverage = how much behavior" skills/deepen/depth-analysis.md` returns **no** hit (the criteria text moved out).
- [ ] Diff-think: read `skills/deepen/SKILL.md` end-to-end and confirm the workflow still reads correctly — Steps 1-5, auto-mode, Component-Skill Contract, Anti-Patterns, Relationship table all intact; only the criteria *home* changed.
- [ ] Commit: `Rewire /deepen to read shared architecture-depth criteria`

---

## Task 3: Extract simplification criteria from /simplify

**Files:**
- Create `skills/_shared/criteria-simplification.md`

`/simplify` has no sub-files today — its criteria are inlined in SKILL.md Step 2 ("What it catches" + "Constraints", lines 84-98) and the readability counter-rule in its Anti-Patterns (line 177). This task lifts that criteria content into a fragment.

- [ ] Create `skills/_shared/criteria-simplification.md`. Move the "What it catches" list and the behavior-preserving / scope / readability constraints from `skills/simplify/SKILL.md` Step 2 and Anti-Patterns into a criteria-only fragment. Proposed content:

```markdown
# Criteria: Simplification

Shared, criteria-only fragment — the "what is worth simplifying" knowledge. No workflow, no subagent dispatch, no Next Actions. Consumed by `/claude-tweaks:simplify` (the reactive cleanup pass, which dispatches `code-simplifier:code-simplifier`) and by `/claude-tweaks:recon`'s simplification judgment lens (Phase 2 subagents). One source of truth so a reactive cleanup and a proactive sweep flag the same kinds of complexity.

## What is worth flagging

- Unnecessary complexity from iterative development
- Verbose patterns from trial-and-error debugging
- Leftover defensive code from abandoned approaches
- Inconsistent naming or structure across changed files
- Dead paths, redundant conditionals, over-abstraction
- Cross-file / cross-task patterns (when multiple changes touched related files):
  - Inconsistent naming or patterns between files modified by different tasks
  - Opportunities to consolidate similar code written by different authors/subagents
  - Unnecessary complexity that accumulated across iterative implementation

## Constraints (what NOT to flag)

- **Preserve all behavior** — simplification never changes behavior. If behavior needs changing, that is a different concern, not a simplification finding.
- **Stay in scope** — only the changed files. Never flag unrelated code.
- **Don't over-simplify at the cost of readability** — simpler isn't always better. Dense one-liners can be harder to read than explicit code; a clarity loss is not a simplification.
- **Don't simplify generated files** — generated code is regenerated, not hand-simplified.
```

- [ ] Verify: `grep -n "Verbose patterns from trial-and-error" skills/_shared/criteria-simplification.md` and `grep -n "over-simplify at the cost of readability\|cost of readability" skills/_shared/criteria-simplification.md` both return hits.
- [ ] Diff-think: confirm every bullet from `/simplify` SKILL.md "What it catches" (lines 84-94) and the Anti-Pattern readability/scope/generated-file rules (lines 173-177) are represented in the fragment.
- [ ] Commit: `Extract simplification criteria into _shared/criteria-simplification.md`

---

## Task 4: Rewire /simplify to read the simplification fragment

**Files:**
- Modify `skills/simplify/SKILL.md`

Replace the inlined "What it catches" / "Constraints" criteria in Step 2 with a fragment reference. Keep the subagent dispatch contract (the output template the subagent must follow) — that is workflow, not criteria.

- [ ] In `skills/simplify/SKILL.md` Step 2, replace the "**What it catches:**" block and the "**Constraints:**" block (lines 84-98) with a pointer paragraph. Proposed replacement:

```markdown
**What it catches and the constraints** are the shared simplification criteria — read `_shared/criteria-simplification.md`. The same criteria are reused by `/claude-tweaks:recon`'s simplification lens, so the reactive pass and the proactive sweep flag identical complexity. (The `code-simplifier` subagent applies them; the dispatch prompt above carries the scope and output contract.)
```

- [ ] Keep the Anti-Patterns table rows as-is (they restate constraints in the standard `| Pattern | Why It Fails |` form, which is the required skill structure) — but they now mirror the fragment rather than being the only home. No edit needed there beyond confirming consistency.
- [ ] Add an `_shared/criteria-simplification.md` row to `/simplify`'s **Relationship to Other Skills** table: `| _shared/criteria-simplification.md | The shared simplification criteria (what's worth simplifying + the behavior/scope/readability constraints) — single source of truth read by both /simplify and /recon's simplification lens. |`
- [ ] Verify: `grep -n "criteria-simplification" skills/simplify/SKILL.md` returns hits (Step 2 pointer + Relationship row). Confirm the long "What it catches" bullet list no longer appears inline: `grep -n "Leftover defensive code from abandoned approaches" skills/simplify/SKILL.md` returns **no** hit.
- [ ] Diff-think: read `skills/simplify/SKILL.md` end-to-end — Steps 1-4, the subagent output template, verification gate, Component-Skill Contract, Anti-Patterns all intact; only the criteria moved.
- [ ] Commit: `Rewire /simplify to read shared simplification criteria`

---

## Task 5: Extract review-quality criteria from /review

**Files:**
- Create `skills/_shared/criteria-review-quality.md`

`/review`'s criteria are spread across SKILL.md Step 3 (the severity-floor-per-lens table lines 134-146, the lens definitions 3a-3i lines 162-260) and `step3-routing.md` (the CALIBRATION block + severity scale). This fragment pulls the *taxonomy and calibration* into one place: the severity scale, the category enum, the per-lens severity floors, and the byte-identical CALIBRATION "only flag / do not flag" rules. It points at `_shared/auto-mode-contract.md` for confidence/reversibility vocab rather than duplicating it (per design §7 one-source-of-truth, and the auto-mode-contract already owns those floors).

- [ ] Create `skills/_shared/criteria-review-quality.md`. Proposed content:

```markdown
# Criteria: Review Quality

Shared, criteria-only fragment — the "what is worth flagging in a code review and how to label it" knowledge. No workflow, no routing, no Next Actions. Consumed by `/claude-tweaks:review` (the reactive quality gate) and by `/claude-tweaks:recon`'s review-quality judgment lens (Phase 2 subagents). One source of truth so a reactive review and a proactive sweep apply the same calibration, severity scale, and categories.

## Severity scale

`critical` / `high` / `medium` / `low` / `info`

- **critical** — security vulnerability, data-loss risk, or correctness defect that hard-fails. Always actionable; always interrupts.
- **high** — broken behavior, missing validation, an error path that leaves the system in a bad state.
- **medium** — a real gap worth closing now (a convention violation that compounds, a moderate-effort fix).
- **low** — minor or trivial; most are quick fixes. Never blocks.
- **info** — observation only; not an actionable finding. Drop a security/coverage "info" rather than filing it.

## Category enum

Every finding carries exactly one category from this enum:

`Architecture` · `Security` · `Convention` · `Performance` · `Error handling` · `Test quality` · `Coverage` · `UX` · `Docs`

(When a finding is routed to INBOX, this enum collapses to INBOX's 4-value enum: code→technical, UX→product, license→legal, infra→infrastructure — see design §8.)

## Per-lens severity floors (calibration)

Over-flagging is the most common review failure. Each lens has an expected ceiling:

| Lens | Category | Expected ceiling | Notes |
|------|----------|------------------|-------|
| Convention | Convention | medium | Only flag when divergence compounds (e.g., a third logging pattern); single-instance style differences are not findings. |
| Security | Security | critical / high | Always actionable. No "info" findings — drop a non-actionable security observation. |
| Error handling | Error handling | high | Critical only when an uncaught error leaves the system in a broken state. |
| Performance | Performance | high | Critical only when a measured regression exists (real query, real benchmark); never speculative. |
| Architecture | Architecture | high | Critical only when a layering violation will break a near-term feature; otherwise medium. Includes shallow-module detection — for module-level depth criteria see `_shared/criteria-architecture-depth.md`. |
| Test quality | Test quality | medium | Tests are not production code; flag only when a missing test would have caught a real bug. |
| Coverage | Coverage | low / informational | Never blocks. |
| UX (QA data) | UX | high | Judgment-heavy synthesis. |
| Doc freshness | Docs | low / informational | Never blocks. |

## Calibration — what to flag and what to drop

This block is the filter every reviewer applies. It must be reproduced **byte-identical** wherever it is inlined into a dispatched agent prompt (the cross-lens reproduction logic depends on every agent applying the same filter — do not paraphrase):

```
Only flag issues where:
- the user will hit a bug, broken state, or unsafe behavior
- the code will fail under realistic load, edge cases, or future maintenance
- a project convention is violated in a way that compounds (not isolated stylistic choices)

Do NOT flag:
- alternate naming you'd prefer ("`fetchUser` would read better as `getUser`")
- formatting, whitespace, or import ordering quibbles
- "could be DRYer" without a concrete second caller that proves the duplication is real
- hypothetical edge cases the spec didn't require ("what if the input is a 4GB string?")
- missing comments on self-explanatory code

When in doubt: would a calibrated senior engineer block a PR on this finding alone? If no, drop it.
```

## Confidence and reversibility

The confidence / reversibility / severity-floor vocabulary that governs whether a finding may be auto-resolved is **not** redefined here — it lives in `_shared/auto-mode-contract.md` ("Reversibility / confidence / severity floors"). Read it there. In short: a finding may be auto-resolved only when reversibility:high AND confidence:high AND severity ≤ the configured floor; everything else is staged or kept-prompt.
```

- [ ] Verify: `grep -n "Severity scale" skills/_shared/criteria-review-quality.md`, `grep -n "Architecture · Security · Convention" skills/_shared/criteria-review-quality.md` (or grep each enum value), `grep -n "calibrated senior engineer block a PR" skills/_shared/criteria-review-quality.md`, and `grep -n "auto-mode-contract" skills/_shared/criteria-review-quality.md` all return hits.
- [ ] Diff-think: confirm the severity-floor table preserves every lens row from SKILL.md lines 134-146, the category enum matches the contract list exactly (9 values), and the CALIBRATION block is byte-identical to the one in `step3-routing.md` lines (the "Only flag / Do NOT flag" block). Confidence/reversibility correctly points to the contract instead of restating it.
- [ ] Commit: `Extract review-quality criteria into _shared/criteria-review-quality.md`

---

## Task 6: Rewire /review to read the review-quality fragment

**Files:**
- Modify `skills/review/SKILL.md`
- Modify `skills/review/step3-routing.md`

Point Step 3's severity-floor table and the lens criteria at the fragment as the source of truth. In `step3-routing.md`, keep the byte-identical CALIBRATION copy that gets inlined into dispatched agents (agents can't read sibling files — the inline copy is load-bearing), but mark the fragment canonical so they cannot drift.

- [ ] In `skills/review/SKILL.md` Step 3, immediately above the "Severity floor per lens" table, add a pointer sentence: "The severity scale, category enum, per-lens floors, and the CALIBRATION filter are the shared review-quality criteria — read `_shared/criteria-review-quality.md` (also used by `/claude-tweaks:recon`'s review lens). The table below is the operative copy:". Keep the existing table in place (it is load-bearing for the lens routing) — the pointer establishes the fragment as the single source of truth.
- [ ] In `skills/review/SKILL.md` lens 3e (Architecture), where it mentions shallow modules, append "(module-level depth criteria: `_shared/criteria-architecture-depth.md`)" so the two fragments cross-reference at the point of use. (This is a use-site pointer, not a Relationship cross-ref — those ship with `/recon`.)
- [ ] In `skills/review/step3-routing.md`, above the CALIBRATION code block ("## Per-lens Calibration + Output template"), add: "The CALIBRATION filter and severity scale below are the canonical copy from `_shared/criteria-review-quality.md`, reproduced here because dispatched agents cannot read sibling files. Keep them byte-identical to the fragment." Leave the byte-identical block itself unchanged.
- [ ] Add an `_shared/criteria-review-quality.md` row to `/review`'s **Relationship to Other Skills** table: `| _shared/criteria-review-quality.md | The shared review-quality criteria (severity scale, category enum, per-lens floors, CALIBRATION filter) — single source of truth read by both /review's Step 3 lenses and /recon's review-quality lens. The CALIBRATION block in step3-routing.md is the byte-identical inlined-for-dispatch copy. |`
- [ ] Verify: `grep -n "criteria-review-quality" skills/review/SKILL.md skills/review/step3-routing.md` returns hits in all three spots (Step 3 pointer, step3-routing canonical note, Relationship row). `grep -n "criteria-architecture-depth" skills/review/SKILL.md` returns the lens-3e use-site pointer.
- [ ] Diff-think: read `skills/review/SKILL.md` Step 3 and `step3-routing.md` end-to-end — the lens definitions, severity table, CALIBRATION block, routing logic, and reproduction/debate machinery are all intact; nothing routing-related was removed, only a "source of truth" pointer was added.
- [ ] Commit: `Rewire /review to read shared review-quality criteria`

---

## Task 7: Add the criteria-fragment assertion test

**Files:**
- Create `tests/recon/criteria-fragments.test.js`

Lock in the contract: the three fragments exist, carry their signature criteria, and the three skills reference them. Mirror the existing `tests/research/` style (`node:test`, `node:assert`, `REPO_ROOT` resolution, `readFileSync`).

- [ ] Create `tests/recon/criteria-fragments.test.js` with content:

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readShared(name) {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', '_shared', name), 'utf8');
}
function readSkill(skill, file = 'SKILL.md') {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', skill, file), 'utf8');
}

const FRAGMENTS = [
  'criteria-architecture-depth.md',
  'criteria-simplification.md',
  'criteria-review-quality.md',
];

test('all three criteria fragments exist', () => {
  for (const f of FRAGMENTS) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'skills', '_shared', f)),
      `expected skills/_shared/${f} to exist`
    );
  }
});

test('architecture-depth fragment carries signature criteria', () => {
  const body = readShared('criteria-architecture-depth.md');
  assert.match(body, /Leverage = how much behavior/, 'leverage definition');
  assert.match(body, /deletion test/i, 'deletion test');
  assert.match(body, /port/i, 'dependency classification (port/adapter)');
});

test('simplification fragment carries signature criteria', () => {
  const body = readShared('criteria-simplification.md');
  assert.match(body, /trial-and-error/i, 'verbose debugging patterns');
  assert.match(body, /readability/i, 'readability counter-rule');
});

test('review-quality fragment carries signature criteria', () => {
  const body = readShared('criteria-review-quality.md');
  assert.match(body, /critical.*high.*medium.*low/i, 'severity scale');
  for (const cat of ['Architecture', 'Security', 'Convention', 'Performance',
                     'Error handling', 'Test quality', 'Coverage', 'UX', 'Docs']) {
    assert.match(body, new RegExp(cat), `category enum value: ${cat}`);
  }
  assert.match(body, /calibrated senior engineer block a PR/, 'CALIBRATION filter');
  assert.match(body, /auto-mode-contract/, 'points at contract for confidence/reversibility');
});

test('/deepen references the architecture-depth criteria fragment', () => {
  const skill = readSkill('deepen');
  const sub = readSkill('deepen', 'depth-analysis.md');
  assert.match(skill + sub, /criteria-architecture-depth\.md/);
});

test('/simplify references the simplification criteria fragment', () => {
  assert.match(readSkill('simplify'), /criteria-simplification\.md/);
});

test('/review references the review-quality criteria fragment', () => {
  const skill = readSkill('review');
  const routing = readSkill('review', 'step3-routing.md');
  assert.match(skill + routing, /criteria-review-quality\.md/);
});

test('review-quality CALIBRATION block stays byte-identical between fragment and step3-routing', () => {
  const frag = readShared('criteria-review-quality.md');
  const routing = readSkill('review', 'step3-routing.md');
  // Both must contain the load-bearing filter line verbatim.
  const anchor = 'When in doubt: would a calibrated senior engineer block a PR on this finding alone? If no, drop it.';
  assert.ok(frag.includes(anchor), 'fragment contains the calibration anchor line');
  assert.ok(routing.includes(anchor), 'step3-routing contains the calibration anchor line');
});
```

- [ ] Run the test: `node --test tests/recon/` — confirm all assertions pass against the fragments and rewired skills from Tasks 1-6.
- [ ] Run the full suite once to confirm no regression: `node --test tests/`.
- [ ] Commit: `Add assertion test for shared criteria fragments`

---

## Task 8: Update the CLAUDE.md _shared catalog line

**Files:**
- Modify `CLAUDE.md`

Catalog hygiene only — list the three new fragments in the `skills/_shared/*.md` description in the Structure section. NOT a version bump, NOT a Relationship cross-ref (those ship with `/recon` in Phase 1).

- [ ] In `CLAUDE.md`, find the `skills/_shared/*.md` line in the Structure block. Append to its parenthetical inventory: "..., decision records / ADR gate, **shared analysis criteria: architecture-depth / simplification / review-quality**". Match the existing comma-separated style; do not reformat the rest of the line.
- [ ] Verify: `grep -n "criteria: architecture-depth" CLAUDE.md` returns a hit.
- [ ] Diff-think: confirm the edit only extended the `_shared` inventory line — no version, no skill-count, no Relationship-table changes (those are Phase 1's job per design §12-§13).
- [ ] Commit: `Document shared criteria fragments in CLAUDE.md _shared catalog`

---

## Self-Review

### Spec coverage (every Phase 0 requirement → a task)

| Phase 0 requirement (design §7, §13) | Task |
|--------------------------------------|------|
| Produce `criteria-architecture-depth.md` (shallow module / leverage / deletion test / dependency classification) | Task 1 |
| Produce `criteria-simplification.md` (unnecessary complexity, verbose patterns, cross-file inconsistency) | Task 3 |
| Produce `criteria-review-quality.md` (severity taxonomy low\|medium\|high\|critical, category enum (9 values), confidence/reversibility vocab) | Task 5 (severity + enum inline; confidence/reversibility via pointer to `auto-mode-contract.md`) |
| Each fragment is self-contained "criteria only", consumable by both the reactive skill and a Phase 2 subagent | Tasks 1, 3, 5 (headers name both consumers; no workflow/Steps/auto-mode in fragments) |
| Rewire `/deepen` (+ depth-analysis.md) to reference the fragment | Task 2 |
| Rewire `/simplify` to reference the fragment | Task 4 |
| Rewire `/review` (+ step3-routing.md) to reference the fragment | Task 6 |
| No behavior change — content-preserving refactor | Diff-think step in every rewire task (2, 4, 6) + full-suite run in Task 7 |
| Re-verify the three skills still read correctly | Diff-think (read end-to-end) steps in Tasks 2, 4, 6 |
| Assertion test that fragments exist + skills reference them | Task 7 |

### Placeholder scan

No `{TODO}`, no "TBD", no unspecified content. Every fragment's full proposed body is shown verbatim in its task's fenced block (Tasks 1, 3, 5). The depth-analysis criteria are lifted verbatim from `skills/deepen/depth-analysis.md` lines 5-71; the simplification criteria from `skills/simplify/SKILL.md` lines 84-98 + 173-177; the review CALIBRATION block byte-identical from `skills/review/step3-routing.md`; the severity-floor table from `skills/review/SKILL.md` lines 134-146 — concrete sources named, exact destinations specified.

### Consistency (fragment filenames match the cross-plan contract EXACTLY)

- `skills/_shared/criteria-architecture-depth.md` ✓ (contract name, from /deepen)
- `skills/_shared/criteria-simplification.md` ✓ (contract name, from /simplify)
- `skills/_shared/criteria-review-quality.md` ✓ (contract name, from /review; severity `low|medium|high|critical`, the 9-value category enum, confidence/reversibility vocab via `auto-mode-contract.md`)

These are the exact names Phase 2's judgment-lens subagents will read. The test in Task 7 hard-codes the same three names, so any drift breaks the suite.

### Cross-plan note for the reader

Bidirectional Relationship-table cross-refs for `/recon`, the `plugin.json` version bump (4.17.0 → 4.18.0), and README / `/help` / marketplace updates are **deliberately not in Phase 0** — they ship when `/recon` itself lands (design §12, §13 Phase 1). The use-site pointers added in Tasks 2/4/6 (and the `_shared/criteria-*` Relationship rows for the three reactive skills) are within-repo references to the new fragments, which is content-preserving and self-contained; do not extend them to `/recon` here.
