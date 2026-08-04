# Relationship-table triage — the 510-row verdict table

Companion to `2026-08-04-skill-bloat-reduction-design.md`. Produced by 18 classification
agents (one to four skills each) over the whole corpus, then normalised by the controller.
Human decision on scope: **full removal + graph**, taken 2026-08-04.

## Method

Each agent read one skill's rows plus that skill's own `SKILL.md`, and answered one question
per row: **does this row bind what the model does while executing this skill?**

- **OPERATIVE** — yes. Never deleted; relocates into the step body that implements it.
- **NAV** — no, but a real edge. One line in `docs/skill-graph.md`, stated once.
- **DEAD** — no, and already stated elsewhere. Deleted.

Confidence is the agent's own. `LOW`/`MEDIUM` rows and every OPERATIVE row get individual
human review; `HIGH` DEAD/NAV rows with no orphan identifiers are bulk-approved.

## Result

| Class | Rows | Share |
|---|---:|---:|
| DEAD | 275 | 53.9% |
| NAV | 215 | 42.2% |
| **OPERATIVE** | **20** | **3.9%** |

Zero OPERATIVE rows in 24 of 32 skills. The design's premise — that paragraph-length rows
carry unique live contract needing relocation — is wrong: they carry *duplicated* contract.

## Corrections the raw agent output needs

These are controller-applied, not agent verdicts. Each is recorded in the design doc's
Verification section with its measurement.

1. **Circular DEAD → NAV.** A DEAD verdict whose evidence cites another skill's *Relationship
   row* is circular: that row is deleted too. 17 of 17 sampled citations from `code-health`
   and `design-wrapper` were of this shape. Reclassify to NAV so the edge survives once in the
   graph. Detect mechanically: resolve the cited `file:line`, test whether it lands inside that
   file's Relationship section.

2. **`_shared/auto-mode-contract.md` rows normalised as one batch.** All 21 came back split
   across all three classes. Nine are pure boilerplate ("Single source of truth for auto-mode
   behavior — read before adding any auto-mode handling", under 130 chars) and are DEAD by
   inspection: the sentence is addressed to a skill author, not to the running model. Twelve
   carry extra text; the seven naming the specific step that implements the contract's floors
   (`review`, `tidy`, `test`, `visual-review`, `init`, `deepen`, `design-wrapper`) are the
   OPERATIVE ones, and their destination is that named step.

3. **`reflect`'s 7 OPERATIVE verdicts are outliers** against 0 in every comparable component
   skill (`simplify`, `deepen`, `journeys`, `challenge`, `visual-review` all returned 0). Rows
   10 and 11 in particular were called OPERATIVE for "read it before adding or changing any
   auto-mode handling here" — author-facing by the same test that made the other nine
   boilerplate rows DEAD. Re-review before applying.

4. **`dispatch` row 12 stands as DEAD** despite the dispatch prompt naming it as a likely
   OPERATIVE example. The agent applied the literal test, found the content stated in both
   Step 1 and the Component-Skill Contract, and flagged the contradiction with the prompt.
   The agent is right; the prompt was pre-judging.

## Blocking worklist — resolve before any deletion

**88 identifiers appear only in a Relationship row and are reachable from nothing else in the
payload.** Not a veto, but each needs a decision (reword into a step, accept the loss, or keep
the row). Full list at `unreached.tsv` in the run scratchpad; distribution:

| Skill | Count | | Skill | Count |
|---|---:|---|---|---:|
| `routine` | 13 | | `build` | 3 |
| `design-wrapper` | 7 | | `docs-health` | 3 |
| `help` | 7 | | `harness-health` | 3 |
| `assess-agent-autonomy` | 6 | | `journeys` | 3 |
| `backlog` | 5 | | `wrap-up` | 3 |
| `code-health` | 5 | | `browse`, `journey-health`, `visualize` | 2 each |
| `ledger` | 4 | | 13 further skills | 1 each |
| `specify` | 4 | | | |
| `tidy` | 4 | | | |

**Dangling in-body pointers.** `deepen/SKILL.md` lines 98 and 163 read "(see the
`/claude-tweaks:ledger` row in Relationship to Other Skills)". Deleting the section orphans
them. Sweep for this shape across all 32 skills before applying — it is not unique to `deepen`.

**Same-change-set dependency (`[IL-02]`, `[IL-60]`).** `skills/_shared/auto-mode-contract.md:205`
requires every pipeline-participating skill to "Reference this file in its Relationship table".
That rule breaks the moment the tables leave and must be re-pointed in the same commit — the
natural replacement is a reference at the point where the skill implements an auto branch,
which is exactly where the seven OPERATIVE auto-mode rows relocate to.

## Bugs found incidentally

Real defects surfaced by classification, worth fixing regardless of the bloat work:

| Where | Defect |
|---|---|
| `help` row 14 | Claims `stories` sits between `test` and `review`; `reference-card.md` has it between `build` and `test` |
| `help` row 24 | Calls `design-wrapper` a Utility skill; `reference-card.md:29` lists it as a Component |
| `backlog` row 17 | Credits `groupByFileOverlap`/`grouping.js` to overview-mode, which only calls `ranking.js`'s `rankNextToBuild`. `grouping.js` is used by `dispatch`, `specify`, `help`, and `flow` |
| `tidy` row 7 | Claims `extractFingerprint` backs the Sync action's payload; `actions-github-issues.md`'s Sync procedure uses only `recordPayload` |
| `help` rows 5, 25 | Describe `/help` recommendation behaviour absent from Section 3's Priority Order — documented but unimplemented |
| `capture` row 7 | Asserts leftover work becomes a `parked` record, which conflicts with `tidy`'s Defer attribution at `capture/SKILL.md:22` |

## Per-skill verdicts

Format: `row | class | confidence | destination or covering location`.

### capture (17)
1 NAV HIGH graph · 2 NAV HIGH graph · 3 NAV HIGH graph · 4 NAV HIGH graph ·
5 DEAD HIGH Review Workflow · 6 NAV HIGH graph · 7 NAV LOW graph · 8 NAV HIGH graph ·
9 DEAD HIGH CSC ¶1 · 10 NAV HIGH graph · 11 DEAD HIGH CSC ¶1 · 12 DEAD HIGH CSC ¶1 ·
13 NAV HIGH graph · **14 OPERATIVE HIGH Step 1 Backend Selection** · 15 NAV HIGH graph ·
16 NAV HIGH graph · 17 DEAD HIGH Routing prompt

### review (30)
1 NAV HIGH · 2 DEAD HIGH Step 2.5 · 3 DEAD HIGH Step 1.5 · 4 NAV MED · 5 NAV LOW ·
6 DEAD HIGH Step 6 · 7 NAV HIGH · 8 NAV MED · 9 NAV MED · 10 DEAD HIGH Step 3g-cov ·
11 NAV LOW · 12 DEAD HIGH step3-routing.md · 13 DEAD HIGH Ceremony-Aware ·
14 DEAD HIGH SKILL.md:6 · 15 DEAD HIGH Step 4 · 16 DEAD HIGH Step 5 · 17 DEAD HIGH Step 3e ·
18 NAV MED · 19 DEAD HIGH Important Notes:591 · 20 DEAD HIGH Step 4 · 21 NAV HIGH ·
22 DEAD HIGH Step 6.5 · 23 NAV MED · 24 NAV HIGH · 25 NAV MED · 26 DEAD HIGH Step 3 intro ·
27 DEAD HIGH Step 3 · 28 DEAD MED step3-debate.md · 29 DEAD HIGH Step 3i:439,459 ·
30 DEAD HIGH Ceremony-Aware

### help (28)
1 NAV HIGH · 2 DEAD HIGH §3 · 3 DEAD HIGH status-scan Stage 1 · 4 DEAD HIGH Priority 8 ·
**5 OPERATIVE LOW §3 Priority Order (unimplemented gap)** · 6 DEAD HIGH Priority 2 ·
7 DEAD HIGH Priority 3 · 8 DEAD HIGH Priority 9 · 9 DEAD HIGH Stage 4.6 · 10 DEAD HIGH Stage 4.7 ·
11 DEAD HIGH Stage 1 · 12 DEAD HIGH ref-card Utility · 13 DEAD HIGH ref-card Utility ·
14 DEAD LOW ref-card Lifecycle **(CONTRADICTED — see bugs)** · 15 NAV MED ·
16-21 DEAD HIGH ref-card Component · 22 NAV HIGH · 23 NAV LOW ·
24 NAV LOW **(CONTRADICTED)** · **25 OPERATIVE LOW §3 Priority Order (gap)** · 26 NAV HIGH ·
27 DEAD HIGH Stages 4.5-4.7 · 28 NAV MED

### specify (27)
1 DEAD HIGH · 2 DEAD HIGH decomposition-mode Step 2 · 3 DEAD HIGH Anti-Patterns · 4 NAV HIGH ·
5 NAV HIGH · 6 DEAD HIGH shaping-mode · 7 NAV HIGH · 8 DEAD HIGH shaping-mode · 9 NAV HIGH ·
10 NAV MED · 11 NAV MED · 12 NAV MED · 13 DEAD HIGH decomposition Step 2.5d · 14 NAV HIGH ·
15-18 DEAD HIGH shaping-mode · 19 DEAD HIGH decomposition Step 1 · 20 DEAD HIGH Anti-Patterns ·
21 NAV MED · 22 NAV HIGH · 23 DEAD MED decomposition Step 5 · 24 DEAD HIGH red-team.md ·
25 NAV MED · 26 DEAD HIGH record-creation.md · 27 DEAD HIGH record-creation.md

### build (25)
1 NAV MED · 2 NAV HIGH · 3-9 DEAD HIGH (Spec/Design Step 3, Common Step 2 ×2, Git Strategy ×2,
Common Step 5, Common Step 3) · **10 OPERATIVE HIGH Common Step 4.5** · 11 DEAD HIGH Common Step 6 ·
12 NAV HIGH · 13 NAV MED · 14 NAV HIGH · 15 NAV HIGH · 16 DEAD HIGH architecture-alignment.md ·
17 DEAD HIGH Common Step 4 · 18 NAV HIGH · 19 NAV MED · 20 DEAD HIGH per-step ledger lines ·
21 DEAD HIGH design-prebuild.md · 22 DEAD MED CSC · 23 NAV HIGH · 24 NAV HIGH ·
25 DEAD MED Build Options

### wrap-up (25)
1 DEAD LOW Step 7 · 2 NAV HIGH · 3 DEAD LOW Step 3 · 4 DEAD HIGH verification-brief.md ·
5 DEAD HIGH Step 3 · 6 DEAD HIGH Step 6.1 · 7 NAV HIGH · 8 DEAD HIGH leftover-routing.md ·
9 DEAD HIGH Step 8 · 10 NAV HIGH · 11 DEAD LOW Step 7 · 12 DEAD HIGH cleanup-procedures C ·
13 NAV LOW · 14 DEAD HIGH Steps 3,5,8.5,10 · 15 DEAD HIGH Step 5/10 · 16 NAV HIGH · 17 NAV LOW ·
18 DEAD HIGH review-console.md · 19 DEAD HIGH Step 6.2 · 20 DEAD HIGH Step 6.2 ·
21 DEAD HIGH Step 7.7 · 22 DEAD HIGH Step 7.8 · 23 NAV HIGH · 24 DEAD HIGH cleanup E ·
25 DEAD HIGH skill-curation.md

### tidy (24)
1 NAV HIGH · 2 DEAD HIGH Action Vocabulary · 3 DEAD MED scan-procedures 5.5 ·
4 DEAD MED scan-procedures 5.5 · 5 NAV HIGH · **6 OPERATIVE HIGH Action Vocabulary / Step 7** ·
**7 OPERATIVE LOW Step 1 / Sync (claim unverified — see bugs)** · 8 DEAD HIGH scan 4.5 ·
9 DEAD HIGH scan 4.6 · 10 NAV MED · 11-14 NAV MED · 15 DEAD HIGH Routine Config ·
**16 OPERATIVE MED Action Vocabulary / Step 7** · 17 NAV MED · **18 OPERATIVE HIGH Step 6** ·
19 DEAD HIGH step-6-auto.md · 20 DEAD HIGH Parallel execution block · 21 DEAD HIGH scan 4.7 ·
22 DEAD HIGH scan 4.8 · 23 DEAD HIGH scan Backstop · 24 DEAD HIGH scan Backstop

### flow (23)
1-7 DEAD (Step 4.2/4.4 ×4, auto-story section, Step 5) · 8 NAV HIGH · 9 NAV MED · 10 NAV HIGH ·
11 DEAD HIGH Step 2.7 · 12 DEAD HIGH multi-spec.md · 13 DEAD HIGH multi-spec/worktree-merge ·
14 DEAD HIGH Steps 1.8/4.5/5 · 15 DEAD HIGH polish+survey · 16 DEAD HIGH auto-story:76 ·
17 NAV HIGH · 18 DEAD HIGH Arguments:46 · 19 DEAD HIGH auto arg / Step 3 ·
**20 OPERATIVE LOW Step 3** · 21 NAV MED · 22 NAV MED · 23 DEAD HIGH materialize.md:83

### init (21)
1 DEAD HIGH Lifecycle:13 · 2 NAV HIGH · 3 NAV HIGH · 4 DEAD HIGH Phase 8 Opt 2 · 5 NAV LOW ·
6 NAV LOW · 7 NAV LOW · 8 NAV HIGH · 9 DEAD HIGH Step 7 · 10 DEAD HIGH Step 11 ·
11 DEAD HIGH Step 12 · 12 DEAD HIGH Step 13 · 13 DEAD LOW Step 6 · 14 NAV HIGH ·
15 DEAD HIGH :104 · 16 DEAD HIGH step-15-routine · 17 DEAD HIGH :368 ·
18 DEAD HIGH step-17-backend · 19 DEAD HIGH step-17-backend · 20 DEAD HIGH :204,214,314 ·
21 DEAD LOW :9-11

### journey-health (20)
1 DEAD HIGH · 2 NAV MED · 3 DEAD HIGH Step 3 · 4 DEAD HIGH Step 3.5 · 5 DEAD HIGH Step 3.5 ·
6 NAV MED · 7 DEAD HIGH Routine Config · 8 NAV MED · 9 DEAD LOW · 10 NAV MED · 11 NAV MED ·
12 DEAD HIGH · 13 NAV HIGH · 14 DEAD HIGH Step 2 · 15 DEAD HIGH Step 6 · 16 DEAD HIGH Step 6 ·
17 DEAD HIGH Step 3.6 · 18 DEAD HIGH Step 3/6 · 19 DEAD LOW Routine Config · 20 DEAD MED Step 3

### backlog (17)
1 NAV MED · 2 NAV HIGH · 3 NAV LOW · 4 DEAD HIGH refine-mode Step 2 · 5 DEAD HIGH refine 3.5 ·
6 NAV MED · 7 NAV MED · 8 DEAD MED refine 2/3.5 · 9 DEAD HIGH Preflight · 10 NAV LOW ·
11 NAV MED · 12 DEAD HIGH refine Step 5 · 13 DEAD HIGH CSC · 14 DEAD MED Anti-Patterns ·
15 DEAD MED Preflight · 16 DEAD HIGH refine Step 3 · 17 DEAD LOW **(FACTUALLY WRONG — see bugs)**

### docs-health (17)
1 NAV MED · 2 NAV MED · 3 NAV MED · 4 DEAD HIGH Step 6 · 5 NAV MED · 6 NAV MED · 7 NAV HIGH ·
8 DEAD HIGH Routine Config · 9 DEAD HIGH Steps 1,3 · 10 DEAD HIGH Step 3 · 11 NAV MED ·
12 DEAD HIGH Step 6 · 13 NAV MED · 14 NAV MED · 15 DEAD HIGH Step 3.5 · 16 NAV MED · 17 NAV MED

### harness-health (17)
1 NAV MED · 2 NAV MED · 3 DEAD HIGH Step 3 · 4 DEAD HIGH Step 3 · 5 DEAD HIGH Step 1 ·
6 NAV HIGH · 7 NAV MED · 8 NAV HIGH · 9 NAV HIGH · 10 NAV HIGH · 11 DEAD HIGH Routine Config ·
12 NAV HIGH · 13 NAV MED · 14 NAV MED · 15 NAV HIGH · 16 DEAD MED Step 3 ·
17 DEAD HIGH Routine Config

### test (17)
1 DEAD HIGH Pipeline Context table · 2 NAV HIGH · 3 NAV HIGH · 4 NAV MED · 5 NAV HIGH ·
6 NAV HIGH · 7 DEAD HIGH qa-reporting 5.5 · 8 DEAD HIGH design-gate.md · 9 DEAD HIGH qa-procedures ·
10 NAV MED · 11 NAV HIGH · 12 NAV HIGH · 13 NAV HIGH · 14 DEAD HIGH verification.md ·
15 DEAD HIGH qa-reporting 5 · 16 DEAD HIGH Step 3 Fix Mode · 17 DEAD MED Step 3 Auto

### code-health (16)
1 DEAD HIGH Step 9 · 2 DEAD HIGH diagram · **3,5,6,8,9,10,11 DEAD→NAV (circular)** ·
4 NAV HIGH · 7 DEAD HIGH Routine Config · 12 DEAD HIGH Step 9 · 13 DEAD HIGH Step 9 ·
14 DEAD HIGH Step 7 · 15 DEAD HIGH Step 6/9 · 16 NAV MED

### design-wrapper (16)
1 DEAD HIGH Layer 1 · 2 DEAD HIGH modes/test.md ·
**3,4,5,6,7,8,9,10,15,16 DEAD→NAV (circular)** · 11 DEAD LOW Anti-Patterns *(borderline —
agent requested second opinion)* · 12 DEAD MED design-wrapper-handling.md · 13 NAV MED ·
14 DEAD HIGH Step 2

### dispatch (16)
1-7 DEAD (Anti-Patterns, Step 5, Step 4/6, Step 6, Preflight, Reporting, Step 5) · 8 NAV HIGH ·
9 DEAD HIGH Routine Config · 10 DEAD HIGH Step 5 · 11 DEAD MED Step 4 ·
12 DEAD LOW Step 1 + CSC *(agent overrode the prompt's OPERATIVE framing — agent is right)* ·
13 DEAD HIGH Preflight · 14 DEAD HIGH Preflight · 15 DEAD MED Steps 2/4/6 ·
16 DEAD MED settle-and-merge.md

### visual-review (15)
1 DEAD HIGH · 2 DEAD HIGH Step 1 · 3 DEAD HIGH Step 2 · 4 NAV HIGH · 5 DEAD HIGH CSC ·
6 NAV MED · 7 NAV HIGH · 8 NAV MED · 9 DEAD HIGH Next Actions 4 · 10 DEAD HIGH Step 4 ·
11 NAV HIGH · 12 NAV MED · 13 NAV HIGH · 14 NAV MED · 15 NAV MED

### deepen (14)
1 DEAD HIGH intro:11 · 2 DEAD HIGH :24 · 3 DEAD HIGH :24 · 4 DEAD HIGH Step 5 · 5 NAV HIGH ·
6 NAV LOW · 7 NAV HIGH · 8 NAV HIGH · 9 NAV HIGH · 10 DEAD LOW Step 3 **(dangling pointers at
:98 and :163 — see worklist)** · 11 DEAD HIGH Step 4 · 12 DEAD HIGH Step 3 · 13 DEAD HIGH Step 5 ·
14 NAV MED

### journeys (14)
1 DEAD HIGH :26 · 2 NAV MED · 3 NAV HIGH · 4 NAV HIGH · 5 NAV HIGH · 6 DEAD HIGH :11 ·
7 NAV LOW · 8 NAV MED · 9 DEAD HIGH Step 3.5 · 10 NAV HIGH · 11 NAV HIGH · 12 DEAD HIGH Step 3.5 ·
13 DEAD HIGH Step 3.6 · 14 DEAD HIGH Step 4

### assess-agent-autonomy (12)
1 NAV HIGH · 2 DEAD HIGH :150,314 · 3 DEAD HIGH :27-29,449 · 4 DEAD HIGH :223-233 · 5 NAV LOW ·
6 DEAD HIGH :322-324 · 7 DEAD HIGH :219 · 8 NAV LOW · 9 NAV LOW · 10 DEAD LOW :376 ·
11 NAV HIGH · 12 DEAD HIGH :373-386

### stories (12)
1 DEAD HIGH Step 2/schema · 2 NAV HIGH · 3 NAV HIGH · 4 NAV HIGH · 5 DEAD HIGH Step 1.1/3b ·
6 NAV HIGH · 7 NAV LOW · 8 NAV LOW · 9 NAV LOW · 10 NAV HIGH · 11 NAV LOW · 12 NAV HIGH

### ledger (11)
1-4 DEAD Phase Taxonomy table · 5 NAV MED · 6 NAV MED · 7 DEAD HIGH Resolve Gate ·
8 DEAD HIGH Create/Resolve · 9 DEAD HIGH When to Use · 10 NAV MED ·
**11 OPERATIVE HIGH Resolve Gate / Anti-Patterns**

### reflect (11) — see correction 3, these are outliers
1 DEAD HIGH · 2 DEAD HIGH · 3 DEAD MED diagram · **4,5,6,7,9,10,11 OPERATIVE HIGH** · 8 NAV MED

### routine (11)
1 NAV MED · 2 NAV MED · 3 NAV MED · 4 DEAD HIGH · **5 OPERATIVE HIGH create-and-update Step 1** ·
6 NAV MED · **7 OPERATIVE LOW CSC / Input table** *(1790 B — only the `--source init` kernel is
operative; agent flagged the size/scope mismatch)* · 8 NAV MED · 9 NAV MED · 10 NAV MED ·
11 NAV MED

### simplify (11)
1 DEAD HIGH · 2 DEAD HIGH · 3 DEAD HIGH Step 3:91 · 4 NAV HIGH · 5 NAV MED · 6 DEAD HIGH Step 2:87 ·
7 NAV HIGH · 8 DEAD HIGH Step 2:67,87 · 9 DEAD HIGH Step 3:111-121 · 10 DEAD HIGH Step 3:93-95 ·
11 DEAD HIGH Step 2:87

### browse (10)
1 DEAD HIGH :11,23 · 2 DEAD HIGH :11,24 · 3 DEAD HIGH :25,11 · 4 DEAD HIGH :71,91 · 5 NAV HIGH ·
6 NAV HIGH · 7 NAV MED · 8 NAV HIGH · 9 NAV HIGH · 10 DEAD HIGH :26,158

### challenge (10)
1 DEAD MED :13 · 2 DEAD HIGH :222,253 · 3 DEAD HIGH :68,254 · 4 DEAD HIGH :30 ·
5 DEAD HIGH :261 · 6 DEAD HIGH :242 · 7 DEAD HIGH :64 · 8 DEAD HIGH :150 · 9 DEAD HIGH :156-208 ·
10 NAV MED

### visualize (9)
1 DEAD HIGH · 2 DEAD HIGH · 3 DEAD HIGH · 4 NAV MED · 5 NAV HIGH · 6 NAV HIGH ·
7 DEAD HIGH Step 5:107 · **8 OPERATIVE HIGH Steps 2,4,5,6** · 9 NAV MED

### research (6)
1 DEAD HIGH Next Actions 1 · 2 DEAD HIGH Next Actions 2 · 3 DEAD HIGH Next Actions 3 ·
4 NAV HIGH · 5 NAV HIGH · 6 NAV MED

### demo (5)
1 DEAD HIGH · 2 DEAD HIGH Step 2:120-122 · 3 NAV MED · 4 DEAD HIGH · 5 DEAD HIGH Step 3:209-211

### version (3)
1 DEAD HIGH Next Actions 1 · 2 NAV HIGH · 3 DEAD HIGH :72

## Spot-checks the controller ran directly

Nine DEAD claims verified by reading the cited location, across four skills — all nine held:
`review` 3 (TEST_PASSED gate at :112/:119/:132), `review` 14 (the claim was right, the cited
line was wrong — actual coverage is :6, not :475), `review` 19 (:591), `review` 29 (:439/:459),
`simplify` 3/8/11, `challenge` 5/6.

Citations are therefore approximate. **The orphan scan, not the citation, is what gates
deletion.**
