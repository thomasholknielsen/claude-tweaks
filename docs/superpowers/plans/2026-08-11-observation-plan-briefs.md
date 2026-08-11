# Observation-Plan Briefs (#324) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Verification Brief's binary testable/non-testable shape with a builder-authored `### Observation plan`, and rewrite `/claude-tweaks:demo`'s walkthrough to execute that plan show-first.

**Architecture:** The schema lives once in a new `skills/_shared/observation-plan.md`; the producer (`skills/wrap-up/verification-brief.md`) and consumer (`skills/demo/SKILL.md`) carry only the template skeleton plus a citation. Expand-contract: old `### See it yourself (optional)` / `### Verify it yourself (manual)` sections stop being written but stay readable — demo keeps a compatibility branch for briefs posted before this ships.

**Tech Stack:** Markdown skill prose; one JS comment edit; `node --test` suite as the regression net.

**Spec:** the materialized record at `.claude-tweaks/pipelines/2026-08-11T210247-spec-324-325/spec-324/work/324-spec.md` — read it in full before your task; its Deliverables and Gotchas sections are normative.

## Global Constraints

- 40 KB soft ceiling per SKILL.md and per sub-file: run `wc -c` on every edited/created skill file after editing; if > 40960, extract by the stubs' own unit into a sub-file cited as "read `{filename}` in this skill's directory", leaving the old heading as a stub.
- No emojis in skill files.
- Skill references inside actionable instruction text (Step bodies, Next Actions) MUST use `/claude-tweaks:{skill}`; bare `/{skill}` only in descriptive prose and tables.
- `tests/pending-review-durability.test.js` pins `verification-brief.md`'s `### Branch` section field names — do not touch that section's field lines.
- Verify markdown insertions by reading the rendered result around them, not the diff (fence-adjacency hazard).
- Do NOT bump the version — the follow-up leaf (#325) owns the family's single bump.
- Commits: message style `{Verb} {what} — {detail}`, reference the record as `refs #324` — NEVER `closes`/`fixes` (the record must not auto-close).
- The kind vocabulary is exactly: `rendered-page | app-route | cli | flow | diff` (this order, these spellings). The section heading is exactly `### Observation plan` (capital O, lowercase p).

---

### Task 1: Create `skills/_shared/observation-plan.md`

**Files:**
- Create: `skills/_shared/observation-plan.md`

**Interfaces:**
- Produces: the canonical schema + grammar + per-kind semantics + precedence rule. Tasks 2 and 3 cite this file as `` read `_shared/observation-plan.md` `` (wrap-up cites `../_shared/...` relative from its own directory in prose form "see `skills/_shared/observation-plan.md`" — match each host file's existing citation idiom for `_shared` files) and carry only the template skeleton, never a second copy of the semantics.

- [ ] **Step 1: Write the file** with this content shape (flesh prose minimally; keep every normative rule below verbatim in meaning):

````markdown
# Observation Plan — Schema and Authoring Rules

Canonical definition of the `### Observation plan` section of a Verification Brief. The
producer (`skills/wrap-up/verification-brief.md` Step 2) authors one per record at wrap-up
time; `/claude-tweaks:demo` Step 2 executes it show-first; demo's session-recall path
composes one directly from recall. Both cite this file — the schema and per-kind semantics
are stated once, here.

## Schema

```markdown
### Observation plan
- Surface: rendered-page | app-route | cli | flow | diff
- Entry point: {deep link URL/route, or the command to run, or the diff range for `diff`}
- Prepare: {one command per `-` sub-bullet, or `none`}
- Inspect: {one pointer per `-` sub-bullet — what to open/run and what to look for;
  a flow pointer may carry one indented `Regenerate: {command}` continuation line}
```

## Grammar rules

- One Prepare command per `-` sub-bullet; `Prepare: none` when nothing needs running first.
- One Inspect pointer per `-` sub-bullet.
- `Regenerate:` attaches to its Inspect pointer as an indented continuation line, at most
  one per pointer.

## Per-kind semantics

- `rendered-page` — Entry point is the changed page's deep link, never the site root.
- `app-route` — Entry point is the affected route; state-seeding commands go in Prepare.
- `cli` — Entry point is the invocation; Prepare is usually `none`; the command's output is
  the outcome to observe.
- `flow` — Entry point is the flow's own invocation or first artifact; Prepare usually
  `none`; one Inspect pointer per verdict-relevant intermediate, ordered by stage.
- `diff` — the floor: Entry point is the diff range; Prepare `none`; Inspect optional.

## Choosing the kind (authoring rules + precedence)

The builder picks the kind by judgment from what the run actually did — not from a path
classifier. Precedence rule: when any changed path is UI, route, or rendered-content code,
`app-route`/`rendered-page` take precedence — choosing `cli`/`flow`/`diff` anyway requires
a one-line justification written into the plan's own text.
````

- [ ] **Step 2: Size check.** Run: `wc -c skills/_shared/observation-plan.md` — expect ≤ 40960.
- [ ] **Step 3: Verify the schema line greps.** Run: `grep -c 'Surface: rendered-page | app-route | cli | flow | diff' skills/_shared/observation-plan.md` — expect ≥ 1.
- [ ] **Step 4: Commit.**
```bash
git add skills/_shared/observation-plan.md
git commit -m "Add _shared/observation-plan.md — canonical observation-plan schema (refs #324)"
```

### Task 2: Rewrite `skills/wrap-up/verification-brief.md` (Steps 2, 2.5, 3, 4 + Family-Gate prose)

**Files:**
- Modify: `skills/wrap-up/verification-brief.md`

**Interfaces:**
- Consumes: Task 1's `skills/_shared/observation-plan.md` (cite it; do not restate per-kind semantics).
- Produces: Step 4 template with one always-present `### Observation plan` section (heading + the four field lines only — a skeleton, citing the `_shared` file), and Step 2/2.5/3 keyed on plan kinds. Task 3's demo rewrite assumes exactly this template shape for new briefs.

Edits, in file order:

- [ ] **Step 1: Family-Gate prose** — two spots that name the retired headings:
  - "What this path deliberately does not run" (currently: "it omits both `### See it yourself` and `### Verify it yourself (manual)`, so `/claude-tweaks:demo` Option 2 is not offered for one"): rewrite to say the parent brief omits the `### Observation plan` section — part 2's inline end-to-end walkthrough still carries the human.
  - "Compose the parent brief" (currently "Omit **See it yourself** and **Verify it yourself (manual)** — part 2's walkthrough already names the entry point inline"): rewrite to "Omit the **Observation plan** section — part 2's walkthrough already names the entry point inline within Confirmed."
  - The Family-Gate Procedure is otherwise functionally untouched — only sentences naming the retired headings change. Do not restructure it.
- [ ] **Step 2: Rewrite `## Step 2: Determine testability` → `## Step 2: Author the observation plan`.** The builder picks the surface kind by judgment from what this run actually did, per `skills/_shared/observation-plan.md` (cite the file; state the precedence rule by reference, one line). Remove the `verificationSurface` `node -e` block and every mention of the function from this step. Keep the `{base}` resolution line (Step 3 and `diff`-kind plans still need it). Fold the old non-interactive manual-steps guidance (skill file → name behavior to exercise; bin/ code → command + expected output; doc/config → file + claim to check) into guidance for authoring `cli`/`flow`/`diff` plans' Entry point/Inspect pointers. End the step by routing: `app-route`/`rendered-page` plans → Step 2.5; `cli`/`flow`/`diff` plans → skip Step 2.5, go to Step 3.
- [ ] **Step 3: Step 2.5 gate condition** — retitle its scope from "(testable records only)" to keying off plan kind: runs when the plan's kind is `app-route` or `rendered-page`; skip otherwise ("there is nothing to walk"). The branch table and severity-floor behavior stay unchanged.
- [ ] **Step 4: Step 3's two sourcing branches re-keyed** to plan kinds:
  - Branch 1 heading: applies to `app-route`/`rendered-page` plans whose Step 2.5 walk completed.
  - Branch 2 heading: applies to `cli`/`flow`/`diff` plans, and to `app-route`/`rendered-page` plans under the browser-unavailable fallback.
  - The parenthetical "(Step 2 found no interactive surface, or Step 2.5's browser-unavailable fallback applied)" must be rewritten to name plan kinds — the literal phrase "found no interactive surface" must not survive anywhere in the file.
- [ ] **Step 5: Step 4 template** — replace the mutually-exclusive `### See it yourself (optional)` and `### Verify it yourself (manual)` sections (and their `{omit...}` guidance lines) with one always-present section:

```markdown
### Observation plan
- Surface: {rendered-page | app-route | cli | flow | diff}
- Entry point: {from Step 2}
- Prepare: {command sub-bullets, or none}
- Inspect: {pointer sub-bullets — flow pointers may carry an indented Regenerate: line}
```

  plus one prose line after the template noting the section's content follows `skills/_shared/observation-plan.md` and is always present on a leaf brief (parents omit it — Family-Gate). Do NOT touch the `### Branch` section or its `push:`/`pr:`/`branch:` field lines (test-pinned).
- [ ] **Step 6: Size + regression check.**
```bash
wc -c skills/wrap-up/verification-brief.md          # expect ≤ 40960; if over, extract per Global Constraints
grep -c 'verificationSurface' skills/wrap-up/verification-brief.md   # expect 0
grep -c 'found no interactive surface' skills/wrap-up/verification-brief.md  # expect 0
node --test tests/pending-review-durability.test.js  # expect pass
```
- [ ] **Step 7: Read the rendered result** around every edit point (fence-adjacency check), then commit.
```bash
git add skills/wrap-up/verification-brief.md
git commit -m "Rewrite verification brief around builder-authored observation plan — refs #324"
```

### Task 3: Rewrite `skills/demo/SKILL.md` (show-first walkthrough + fallbacks + Anti-Patterns)

**Files:**
- Modify: `skills/demo/SKILL.md`

**Interfaces:**
- Consumes: Task 1's schema (cite `../_shared/observation-plan.md` per the file's existing `../_shared/` idiom); Task 2's template shape (`### Observation plan` on new briefs; old briefs carry the retired pair).
- Produces: Step 2 = Prepare → Validate → Show → one verdict question (Approve / Request changes / Skip for now).

Edits, in file order:

- [ ] **Step 1: Session-recall path (Step 1, no-arguments):** replace the See-it-yourself/Verify-it-yourself composition and its `verificationSurface` call with: compose a `### Observation plan` in the new schema directly from recall, per `../_shared/observation-plan.md` — builder judgment, no classifier. Keep the existing omission rules, restated in the new vocabulary: no recallable work → "Nothing awaiting sign-off.", stop; recalled work with no confident path/surface → compose the brief without a plan section and go straight to the verdict.
- [ ] **Step 2: Closing-commit reconstruction (Step 1, `#N` not-labeled path):** keep the `verificationSurface` call as the floor, and rewrite its render rule: `interactive` → compose a best-effort `app-route` plan, resolving the entry point via `skills/_shared/dev-url-detection.md`; `non-interactive` → compose the manual steps as today, presented as a `cli` plan when those steps name a runnable command, else a `diff` plan. Every remaining `verificationSurface` occurrence in this file must be inside this reconstruction path.
- [ ] **Step 3: Rewrite Step 2's walkthrough show-first.** After rendering the brief (and the design-contract section, unchanged), execute the plan BEFORE any question:
  - **Prepare** — run the plan's Prepare commands (`none` → skip). If a Prepare command exits non-zero, or the entry point does not respond afterward (connection refused or HTTP 404), fall back to `skills/_shared/dev-url-detection.md`.
  - **Validate** — URL surfaces (`rendered-page`/`app-route`) only; run whenever browser tools are available (agent-browser is headless-capable): quick session confirms the exact deep link renders, attempts Auth-Vault login when credentials resolve, then closes. Browser tools unavailable → skip Validate without blocking.
  - **Show** — by kind: URL surfaces → `open <entry-point>` on macOS / `xdg-open` on Linux; when neither command exists or the call exits non-zero, degrade to presenting the validated URL plus self-contained steps (keep the existing steps checklist verbatim here: self-contained `cd`, copy-paste-clean, proactively explain surprising-but-correct state). `cli` → run the command and show its output. `flow` → walk Inspect pointers in order, opening each artifact; when an artifact is gone, run its `Regenerate:` line; a `Regenerate:` that itself exits non-zero is treated exactly like a missing artifact — state it and continue, never block. `diff` → render the diff: full under ~200 lines, else stat + the hunks most central to the record's Acceptance Criteria.
  - **Verdict** — one `AskUserQuestion`, `question`: `"Does {title} do what you asked for?"`, `header`: `"Verdict"`, options exactly: Approve / Request changes / Skip for now (keep the existing per-entry-shape Skip descriptions). Delete the old Option 2 ("See it yourself"/"Verify it yourself") and the entire live-vs-steps follow-up question + its sub-choices; the literal question text "Open a live session and show you, or give you the steps to check it yourself?" must not survive anywhere in the file.
  - **Failure posture:** Prepare/Validate failure is evidence for Request changes, never a debugging detour (keep the existing capture-what-broke language). **Caching:** once per record per `/claude-tweaks:demo` invocation; cached = resolved entry-point URL/port/credentials and the validation outcome — never a live browser session handle (Validate's session closes). A Request-changes verdict ends the record's walkthrough; any later re-demo is a new invocation with fresh preparation.
- [ ] **Step 4: Compatibility branch (Step 2):** a label-backed brief with NO `### Observation plan` section (posted before this shipped, carrying `### See it yourself` / `### Verify it yourself (manual)`) walks today's Option-2 flow unchanged — keep that machinery in a clearly-scoped compatibility subsection, and state inside the branch's own text that the retired headings are quoted deliberately for backward compatibility (so the follow-up sweep leaf can cite the exemption instead of guessing).
- [ ] **Step 5: Anti-Patterns table:** retire "Handing over 'Give me the steps' instructions without running the pre-flight first" in favor of its show-first equivalent (e.g. handing the human an entry point without Prepare/Validate having run); add rows for: asking for the verdict before showing; blocking on a stale flow pointer instead of stating-and-continuing; skipping Validate and handing the human an unverified URL.
- [ ] **Step 6: Size + content checks.**
```bash
wc -c skills/demo/SKILL.md    # expect ≤ 40960; if over, extract per Global Constraints
grep -c 'verificationSurface' skills/demo/SKILL.md    # expect ≥ 1, all in the reconstruction path
grep -c 'Open a live session and show you' skills/demo/SKILL.md   # expect 0
```
- [ ] **Step 7: Read the rendered result** around each edit, then commit.
```bash
git add skills/demo/SKILL.md
git commit -m "Rewrite /demo walkthrough show-first around the observation plan — refs #324"
```

### Task 4: Correct `bin/lib/issues/acceptance.js` header comment

**Files:**
- Modify: `bin/lib/issues/acceptance.js:13-17` (comment only — no code change)

- [ ] **Step 1: Edit the consumer-list comment** above `NON_INTERACTIVE`: remove `skills/wrap-up/verification-brief.md Step 2` from the list; the demo entry becomes its closing-commit reconstruction fallback (e.g. "skills/demo/SKILL.md Step 1's closing-commit reconstruction fallback, and the acceptance-gap sweep on both work-record drivers (...) all call in rather than restate it."). Keep the "Deliberately absent" paragraph untouched.
- [ ] **Step 2: Verify no code changed.** Run: `git diff bin/lib/issues/acceptance.js` — confirm the diff touches only comment lines. Run: `node --test bin/lib/issues/tests/*.test.js` — expect pass.
- [ ] **Step 3: Commit.**
```bash
git add bin/lib/issues/acceptance.js
git commit -m "Correct acceptance.js consumer-list comment — verification-brief no longer calls verificationSurface (refs #324)"
```

### Task 5: Acceptance-criteria verification (negative controls + full suite)

**Files:**
- Read-only over the three edited/created files; no source edits expected (fix-forward if a check fails).

- [ ] **Step 1: AC1 —** `grep -rl 'Surface: rendered-page | app-route | cli | flow | diff' skills/` matches the `_shared` file plus at most the two template skeletons. Negative control: `grep -rl 'Surface: rendered-page | app-route | cli | flow | wrong-kind' skills/` must return nothing.
- [ ] **Step 2: AC2 —** the Step 4 template block in `verification-brief.md` contains `### Observation plan` and contains neither `### See it yourself` nor `### Verify it yourself`. Negative controls, one claim at a time: a grep for `### Observation plan` with the section name inverted (e.g. `### Observation plna`) must fail; greps for the two retired headings inside `verification-brief.md` must return 0.
- [ ] **Step 3: AC3 —** `grep -c 'verificationSurface' skills/wrap-up/verification-brief.md` = 0; `grep -c 'verificationSurface' skills/demo/SKILL.md` ≥ 1 and every occurrence (read each match's surrounding section) sits inside the closing-commit reconstruction path; `grep -c 'found no interactive surface' skills/wrap-up/verification-brief.md` = 0. Negative control for the zero-greps: run the same grep against `git show HEAD~N` (pre-change) and confirm it MATCHED there — proving the grep finds the pattern when present.
- [ ] **Step 4: AC4 —** in `demo/SKILL.md` Step 2 the verdict `AskUserQuestion` lists exactly Approve / Request changes / Skip for now; `grep -c 'Open a live session and show you, or give you the steps' skills/demo/SKILL.md` = 0 (positive control against the pre-change blob as above).
- [ ] **Step 5: AC5 — read checks:** read `demo/SKILL.md` Step 2 top-to-bottom: Prepare → Validate → Show appear in that order before the verdict question, with the compatibility branch stated explicitly; read `verification-brief.md` Step 3's two branch headings: they name plan kinds, not interactive/non-interactive.
- [ ] **Step 6: AC6 —** `wc -c` on all three markdown files ≤ 40960 each.
- [ ] **Step 7: AC7 —** every new bash snippet added to the three files parses: extract each new fenced `bash` block and run `bash -n` on it (write to a temp file first).
- [ ] **Step 8: AC8 —** full `npm test` passes (capture to a file, read the `# tests`/`# fail` summary lines).
- [ ] **Step 9:** no commit expected; report results.

## Self-Review notes (done at authoring time)

- Spec coverage: Deliverable→Task map: `_shared` file→T1; Step 2 rewrite→T2.2; Step 2.5→T2.3; Step 3 re-key→T2.4; Step 4 template + Family-Gate refs→T2.1+T2.5; demo Step 2 show-first→T3.3; demo compat/fallbacks→T3.1/T3.2/T3.4; Anti-Patterns→T3.5 (verification-brief.md has no Anti-Patterns table — the "both files" deliverable resolves to demo's table plus confirming none exists in verification-brief.md; note this in the task report); acceptance.js comment→T4; AC sweep→T5.
- Type consistency: kind vocabulary and `### Observation plan` heading pinned in Global Constraints; both edit tasks consume Task 1's exact strings.
