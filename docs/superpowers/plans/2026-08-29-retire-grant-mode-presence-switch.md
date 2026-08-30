# Retire Grant Mode — Presence-Switched Refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire `/claude-tweaks:backlog grant` as a separate mode: its grant sweep moves wholesale into a new `backlog/refine-headless.md`, reached through a presence switch (`--source <human|routine|sweep>`), with `grant` surviving only as a deprecated alias.

**Architecture:** Move-and-generalize, never rewrite: `grant-mode.md`'s Steps 0-5 (30,545 B — including #1352's now-landed gh-absent MCP fallback) relocate verbatim-in-effect into `refine-headless.md`. **Ceiling ruling (ledgered):** `refine-mode.md` sits at 40,902/40,960 B, so the presence switch and headless routing live in `SKILL.md` (24,451 B, ample room) — the same routing-in-SKILL.md precedent #1489's `refine-record.md` split established; `refine-mode.md` gets zero edits unless a ≤58 B pointer genuinely fits. **Sweep ruling (ledgered):** AC4's zero-hit grep is interpreted with two archival exemptions — `docs/incident-log.md` and past `docs/superpowers/plans/*` files are historical narrative, not dangling references; every LIVE surface (skills, docs guides, README, journeys) is swept.

**Tech Stack:** Markdown skill files + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T155933-spec-1608-1492-1489-1490-1491-1493-1494-666/spec-1490/work/1490-spec.md`

## Global Constraints

- Non-Goals are hard walls: no change to `grant-gate.js`'s chain/signature, the two-key opt-in (`autonomy: unattended` + `grant-origination-enabled`), `fleet-daily-grant-cap`, the veto window, breaker trip conditions; no `/sweep` build; Re-authorize, `--reset-breaker`, `#N`, and the batch-confirm stay human-present-only.
- **Never-self-grant invariant survives byte-for-byte in effect**: the gate chain's refusal of human-filed (no `by:*`) records and the "no skill that claims, builds, or merges may invoke this headlessly" rule; `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml` is read, never modified.
- The `<!-- grant-mode-audit: -->` comment format, cap tracking, and `auto:merge` maturation hand-off move unchanged (AC2's byte-identical guarantee).
- Presence and ceiling are orthogonal: headless at `supervised` runs labeling lanes, grants nothing; the `grant` alias forces `headless` regardless of `--source` — this exception is cross-referenced from BOTH the switch text and the alias entry.
- Every `wc -c` on an edited `plugin/skills/**` file ≤ 40,960; `refine-mode.md` stays ≤ 40,960 (target: byte-identical).
- Commit style: imperative, "refs #1490" (never closes/fixes), Claude-Session trailer.

---

### Task 1: `refine-headless.md` (the move), delete `grant-mode.md`, new `backlog/deprecated-aliases.md`

**Files:**
- Create: `plugin/skills/backlog/refine-headless.md`
- Delete: `plugin/skills/backlog/grant-mode.md`
- Create: `plugin/skills/backlog/deprecated-aliases.md`
- Verify-only: `plugin/skills/backlog/mcp-transport.md` (its consumer is the moved content — update its header's caller name only if it names grant-mode.md)

**Interfaces:**
- Produces: `refine-headless.md` structured as: (1) a header stating it is refine's headless posture — loaded when `SKILL.md`'s presence switch resolves `headless` (`--source routine|sweep`, or the `grant` alias) — never by a human-present firing; (2) a **Labeling-lanes preamble**: the Priority, Related, Flag-back, and mechanical Dependency-repair lanes run exactly as `refine-mode.md`/`refine-lanes.md` document, with the batch-confirm resolved headlessly (zero-click, the `refineAutoApply` semantics) and every human-decision lane (Re-authorize, Grant-lane interactive confirm, `#N`, `--reset-breaker`) unreachable; a judgment-required Dependency-repair finding stamps `needs:decision` in this posture exactly as interactively (state this explicitly — grant-mode never had that lane); (3) **the Grant chain**: `grant-mode.md`'s Steps 0-5 moved wholesale — Step 0 ceiling gate (with its AUTO stop line), Step 0.5 breaker sweep (auto:merge forced off when tripped; never offers the reset question — nobody present), Step 1+2 Phase A candidate fetch + gates 1-3 (`bin/backlog-grant-gate.js`), Step 3 body-shape re-verification, Step 4 apply (audit marker + maturation hand-off), Step 5 report, cap tracking, AND the gh-absent MCP-fallback text #1352 added (grep grant-mode.md for `mcp-transport`/MCP before moving — carry every such clause).

- [ ] **Step 1:** Read `grant-mode.md` in full. Create `refine-headless.md` per the structure above — the grant-chain content is a MOVE: copy each section, adjusting only entry-point framing ("this mode" → "this posture"), file self-references, and the lane-preamble integration. Do not re-derive any gate, format, or cap logic. Renumber headings coherently.
- [ ] **Step 2:** `git rm plugin/skills/backlog/grant-mode.md` (outright — no stub).
- [ ] **Step 3:** Create `plugin/skills/backlog/deprecated-aliases.md` mirroring `plugin/skills/dispatch/deprecated-aliases.md`'s shape (read it first): one section — `## \`grant\` (deprecated alias for \`refine\`'s headless posture)`: parses identically to the old mode; **forces the headless posture regardless of any `--source` value or its absence** (the one deliberate override of the presence switch — cross-reference the switch text in SKILL.md by name); runs no batch-confirm and no lanes beyond the grant chain, preserving today's exact grant-mode behavior; one warn-tier notice per invocation. Removal condition: once `.claude-tweaks/policy.yml`, `skills/help/reference-card.md`'s argument grammar, and `backlog/routine-template.yml` cite only `refine`, checked at the next minor release.
- [ ] **Step 4:** Verify: `wc -c plugin/skills/backlog/refine-headless.md` ≤ 40960 (quote it); `ls plugin/skills/backlog/grant-mode.md` errors; `grep -c "mcp\|MCP" plugin/skills/backlog/refine-headless.md` ≥ the same count grant-mode.md had (quote both — proves the #1352 carry).
- [ ] **Step 5: Commit** — message must state plainly: grant-mode.md deleted, content moved not rewritten, #1352's MCP fallback carried.

---

### Task 2: Presence switch + routing (`SKILL.md`), routine template, fleet row

**Files:**
- Modify: `plugin/skills/backlog/SKILL.md`
- Modify: `plugin/skills/backlog/routine-template.yml`
- Modify: `plugin/skills/routine/fleet.md` (row 10 + withheld wording)
- Target zero edits: `plugin/skills/backlog/refine-mode.md` (40,902 B — a pointer sentence ONLY if it fits under 40,960; otherwise SKILL.md alone carries the routing)

**Interfaces:**
- Consumes: Task 1's `refine-headless.md` + alias entry.
- Produces: `SKILL.md` grammar `[refine|overview|attention]` + `[--source <human|routine|sweep>]`; Input rows; consolidated Preflight.

- [ ] **Step 1: `SKILL.md` edits** (read in full first):
1. `argument-hint`: drop `grant`; add `[--source <human|routine|sweep>]`.
2. Input table: remove the `grant` row; add a `--source` row — the **presence switch**, resolved before any worklist fetch: absent/`human` → human-present (a skill invoking refine on a human's behalf passes nothing extra); `routine`/`sweep` → headless → read `refine-headless.md` (which layers the grant chain over the zero-click labeling lanes); note presence ⊥ ceiling (headless at `supervised` still runs labeling lanes; human-present at `unattended` still renders lanes, `refineAutoApply` governs the click). Add a `grant` **deprecated-alias** row: forces headless posture regardless of `--source` (cross-ref `backlog/deprecated-aliases.md` and the switch row by name), one warn-tier notice.
3. **Preflight consolidation:** replace the three long `work-backend: local-files` stop paragraphs (refine's grant sub-stage ~line 61; grant mode's ~line 63; attention's equivalent) with per-mode citations of `_shared/local-files-preflight-stop.md` (the canonical home `dispatch/SKILL.md` cites — read it first; keep each citation to the caller-specific deltas: which sub-stage stops vs proceeds, e.g. refine's priority/Related half still runs under local-files). The grant-mode Preflight paragraph's Detection-Ladder + MCP-transport routing moves to cover the headless posture (`refine-headless.md`).
4. Component-Skill Contract reword, verbatim from the spec: "`refine`'s grant-originating and re-authorizing lanes require a present human or the two-key headless opt-in; `refine` may be invoked headlessly by a Routine or by `/claude-tweaks:sweep`, and by no skill that claims, builds, or merges."
5. Anti-Patterns: re-point every row naming `grant` mode at the headless posture; keep the never-self-grant and Routine-forms rows intact.
6. The mode diagram/summary lines (~10, 22): three modes + the headless posture.
- [ ] **Step 2: `routine-template.yml`**: `kickoff: backlog refine --source routine`; bump `template_version`; notes updated — state plainly the behavioral change: a firing below the two-key threshold now runs the labeling lanes (priority/Related writes every firing), no longer a pure no-op.
- [ ] **Step 3: `fleet.md` row 10**: prompt cell + the "Withheld" status wording → "Grant lane withheld — labeling lanes still run" (adapt to the row's format; read the row first).
- [ ] **Step 4:** Verify: `wc -c` SKILL.md ≤ 40960 and refine-mode.md **still 40902** (or ≤ 40960 with the pointer, stating which); `grep -n "grant" plugin/skills/backlog/SKILL.md` shows no mode-grammar `grant` outside the alias row/deprecation text.
- [ ] **Step 5: Commit** — message states the routine-template behavioral change explicitly.

---

### Task 3: Contract + citation sweep

**Files:**
- Modify: `plugin/skills/_shared/work-record-permission-matrix.md` (merge row `/backlog grant` into `/backlog refine`), `plugin/skills/_shared/work-record.md` (any `backlog grant` prose), `plugin/skills/_shared/policy-schema.md` (grant-origination key rows' mode references)
- Modify (live-surface sweep — every `backlog grant` phrase repointed at refine's headless posture): `docs/skill-graph.md`, `plugin/skills/help/reference-card.md`, `docs/getting-started.md`, `README.md`, `docs/plugin-structure.md`, `docs/journeys/routine-fleet-on.md`, `docs/journeys/triage-backlog-via-funnel-overview.md`, `plugin/skills/backlog/overview-mode.md`, `plugin/skills/backlog/grant-lane-decision.md`, `plugin/skills/backlog/machine-grant-outlook.md`, `plugin/skills/capture/SKILL.md`, `plugin/skills/dispatch/grant-maturation-gate.md`, `plugin/skills/assess-agent-autonomy/SKILL.md`, `plugin/skills/assess-agent-autonomy/grant-check.md`, `plugin/skills/tidy/step-6-auto.md`
- NEVER touch: `docs/incident-log.md`, `docs/superpowers/plans/2026-08-26-*.md` (archival exemption, ledgered)

**Interfaces:** Consumes Tasks 1-2's names (`refine-headless.md`, the alias, `--source`).

- [ ] **Step 1: Matrix row merge** — fold row `/backlog grant`'s Adds/Removes/Never content into `/backlog refine`'s row with the headless-posture condition on the `auto:*` cell: origination requires a present human's click OR the two-key opt-in in headless posture (`refine-headless.md`'s gate chain — machine-origination path); keep row 28's #1489 clauses intact; delete the standalone grant row. Check `_shared/work-record.md`'s prose for `/backlog grant` references (its Grant-semantics section) and re-point.
- [ ] **Step 2: Sweep** — for each file above, `grep -n "backlog grant\|grant-mode\|grant mode"` and repoint each hit: mode references → "refine's headless posture (`--source routine|sweep`, or the deprecated `grant` alias)"; file references `grant-mode.md` → `refine-headless.md`. Preserve each file's voice; `tidy/step-6-auto.md` and `machine-grant-outlook.md` may reference `grant-gate.js` directly — code references stay. **Watch the 40 KB ceiling on `work-record.md` (check `wc -c` first — if within 10% of 40960, prefer trimming the merged row's redundancy over adding).** `step-6-auto.md` is freshly trimmed under its ceiling (#1650) — keep its edit byte-negative or neutral if possible; quote its `wc -c`.
- [ ] **Step 3:** Verify AC4's grep with the ruling applied: `grep -rln "backlog grant" plugin/ docs/ README.md --include="*.md" --include="*.yml"` returns ONLY `plugin/skills/backlog/deprecated-aliases.md`, `docs/incident-log.md`, and `docs/superpowers/plans/2026-08-26-sweep-residue-needs-decision-marker.md` (archival). Quote the raw output. Also `grep -rln "grant-mode.md" plugin/ docs/` → only deprecated-aliases.md (if it cites the old name historically) or empty.
- [ ] **Step 4: Commit.**

---

### Task 4: Tests — re-point, pin, run

**Files:**
- Modify: `tests/grant-mode-inprogress-pin.test.js` (re-point read targets `grant-mode.md` → `refine-headless.md`; same assertions)
- Modify: `tests/bin-lib/backlog-grant-gate/backlog-grant-gate.test.js` (only if it reads grant-mode.md prose — it tests the CLI, likely no change; verify and state)
- Create: `tests/backlog-refine-headless.test.js`
- Check for other suites reading grant-mode.md: `grep -rln "grant-mode" tests/ evals/` — re-point every hit (assertions/fixtures unchanged, paths only).

- [ ] **Step 1:** Re-point per above. New suite `tests/backlog-refine-headless.test.js` pins (read the real files, discriminating assertions): (1) `grant-mode.md` absent from disk, `refine-headless.md` present; (2) `refine-headless.md` carries the ceiling gate, breaker sweep (reset question never offered), audit marker `<!-- grant-mode-audit:`, cap tracking, and MCP-fallback text; (3) the Dependency-repair `needs:decision` both-postures sentence; (4) SKILL.md hint has no `grant` mode token but has `--source <human|routine|sweep>`; the alias row cross-references `deprecated-aliases.md`; (5) `backlog/deprecated-aliases.md` exists with the forces-headless override + removal condition; (6) routine-template kickoff `backlog refine --source routine`; (7) fleet.md row 10's new withheld wording; (8) matrix has exactly one `/backlog refine` row and no `/backlog grant` row; (9) the AC4 sweep as a test: read every file in Task 3's live-surface list + the plugin tree, assert no `backlog grant` phrase outside `deprecated-aliases.md` (hard-code the archival exemptions with a comment naming the ruling).
- [ ] **Step 2:** Run: `node --test tests/backlog-refine-headless.test.js tests/grant-mode-inprogress-pin.test.js tests/bin-lib/backlog-grant-gate/backlog-grant-gate.test.js tests/backlog-attention-rows.test.js tests/backlog-overview-foldin-no-truncation.test.js tests/backlog-refine-foldin-no-truncation.test.js` — quote RAW output, all pass. Read (never modify) `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml` and state whether any assertion targets retired text (AC3). Do NOT run full `npm test` (central later).
- [ ] **Step 3: Commit.**

---

## Verification (whole plan)

- Targeted suites green; full `npm test` central after last commit.
- AC trace: AC1/AC2 → T1's preamble + moved chain, pinned by T4 (audit marker, cap, gates); AC3 → T2's Preflight consolidation + T4's eval read; AC4 → T3 Step 3 + T4's sweep test (with ledgered archival exemptions); AC5 → T1 Step 3 alias + T4 pins; AC6 → T2 Steps 2-3 + T4 pin 6-7.
- Gotchas honored: content moved not rewritten; #1352 carried; routine behavioral change stated in commit; never-self-grant trip-wires (matrix + eval) run before done.
