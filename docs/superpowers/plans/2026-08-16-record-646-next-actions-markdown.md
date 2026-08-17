# Terminal Next Actions as Paste-Ready Markdown (#646) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Interaction style directive's terminal-menu clause — terminal `## Next Actions` blocks render as plain markdown with paste-ready fully-qualified commands; `AskUserQuestion` is reserved for blocking decisions and documented machine-consumed terminal decisions — in one expand-contract sweep across `docs/skill-authoring.md`, every SKILL.md, the sub-file templates, and the conformance pins.

**Architecture:** `docs/skill-authoring.md` is the single source; every SKILL.md restates its directive blockquote verbatim (hand-maintained — no generator exists; confirmed by grepping `bin/` for the directive: zero hits) and two test files pin the exact line byte-for-byte. The sweep updates the source, then the 33 restated blockquotes by exact-string script, then rewrites every terminal-menu `AskUserQuestion` instruction to the markdown form, then updates/extends the pins — all on one branch so pins and prose never disagree.

**Tech Stack:** Markdown skill files, `node --test` conformance suites, Node scripts for exact-string sweeps.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T210739-spec-646/work/646-spec.md`

## Global Constraints

- **The new canonical directive line** (exact, single line, used verbatim in every location — the ONLY authorized replacement text):

  ```
  > **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.
  ```

- **The retired directive line** is the single `> **Interaction style:** …` line every SKILL.md currently carries, which ends with the words `navigation menu.` — it is deliberately NOT reproduced in this plan (this plan lives under `docs/`, and acceptance criterion 1 greps the retired sentence across `skills/` and `docs/` expecting zero hits; embedding it here would make the plan its own acceptance failure). Task 2's sweep script derives it dynamically from `skills/capture/SKILL.md` and sanity-checks its tail before replacing anything. For the same reason, every verification step in this plan expresses the retired sentence as a whitespace-tolerant regex, never as the literal string.

- **The markdown close-out form** (the target shape every converted terminal block instructs — one paste-ready command per line, fully qualified, params pre-filled, em-dash annotation, recommended option first with its command bolded and annotated `(recommended)`):

  ```markdown
  **`/claude-tweaks:flow #42`** — automated pipeline for record #42: "{title}" (recommended)
  `/claude-tweaks:build #42` — build only (no test/review/wrap-up)
  `/claude-tweaks:help` — pipeline dashboard
  ```

- **Conversion rules for every terminal block** (apply in Tasks 3–6):
  1. Keep the `## Next Actions` heading exactly (section-order conformance tests key on it; `### Next Actions`/`#### Next Actions` sub-file headings likewise stay).
  2. Keep every situational condition ("omit when…", signal tables, parent-suppression sentences, headless-render guards) as prose — only the *rendering instruction* changes: "call `AskUserQuestion` with options…" becomes "render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):" followed by the command lines.
  3. Each old option's `description` command becomes the command line; its label/rationale becomes the em-dash annotation. Nothing from the option content is dropped.
  4. Commands MUST be fully qualified (`/claude-tweaks:{skill}`, `/superpowers:{skill}`) with parameters pre-filled — never bare `/{skill}` in these blocks.
  5. The old "fewer than 2 options → state or execute directly" rule dissolves: a lone surviving option still renders as a one-line markdown block (markdown costs no interaction). Delete "lone option isn't a decision" clauses from converted blocks; also delete `Other`-field mentions.
  6. After conversion the section must not contain the string `AskUserQuestion` at all (a new conformance pin enforces this for SKILL.mds), EXCEPT the one documented keep-case in Task 6 (flow/failure-cards.md — a sub-file, not covered by the pin).
  7. Mid-flow `AskUserQuestion` usage anywhere OUTSIDE the Next Actions sections is untouched — do not edit any other section.
  8. **Every `## Component-Skill Contract` section stays byte-unchanged** (acceptance criterion 3).
- **Commits:** one per task, message style `{Verb} {what} — {detail}`, reference the record as `refs #646` — NEVER `closes`/`fixes` (the run's PR body owns the closing keyword).
- **Worktree shell discipline:** work from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-646` (verify with `pwd` and `git rev-parse --show-toplevel` before the first edit). The harness refuses compound Bash in worktree sessions — one plain command per Bash call, no `&&`, no heredocs, no shell loops; write a `.mjs` file (then `node file.mjs`, then `rm file.mjs`) for anything scripted. Use the Edit/Write tools for file edits.
- Don't restate file counts in prose you write (cardinality rule — describe lists by reference).

---

### Task 1: docs/skill-authoring.md — the source of truth

**Files:**
- Modify: `docs/skill-authoring.md` (two sites: the "Skill handoffs (Next Actions)" bullet in `## Interaction patterns`, and the `## Interaction style directive` section)

**Interfaces:**
- Produces: the canonical directive line and the Skill-handoffs convention text that Tasks 2–7 cite and restate. The directive line is fixed in Global Constraints — do not re-draft it.

- [ ] **Step 1: Replace the "Skill handoffs (Next Actions)" bullet**

In `docs/skill-authoring.md`, find the bullet beginning `- **Skill handoffs (Next Actions)** — End each skill with a` (currently ~line 47) and replace the ENTIRE bullet with:

```markdown
- **Skill handoffs (Next Actions)** — End each skill with a `## Next Actions` block (standalone, top-level; a Next Actions block nested inside a larger rendered report template — Pipeline Summary, failure cards, review summary — may stay `### Next Actions` as that report's own subsection heading), rendered as **plain markdown**: one paste-ready command per line, fully qualified (`/claude-tweaks:{skill}`) with all parameters pre-filled, an em-dash annotation after the command, the recommended option first with its command bolded and its annotation suffixed `(recommended)`. Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability) — never a navigation menu of generic commands without parameters. A single surviving option still renders as a one-line block: markdown costs no interaction, so there is no minimum option count. `AskUserQuestion` remains the tool for decisions that **block the skill from finishing** — mid-flow gates, overlap resolution, findings routing, the ledger resolve gate — and, rarely, for a terminal decision a documented machine consumer must resolve (a policy lever or contract point that reads the answer); such a surviving terminal call carries a one-line inline justification naming its machine consumer, where it is used. Rationale and revisit trigger: see the Interaction style directive section below.
```

- [ ] **Step 2: Rewrite the `## Interaction style directive` section**

Replace the section's fenced directive line with the new canonical line (Global Constraints), and append this rationale paragraph directly after the fence (before the next `## ` heading):

```markdown
The terminal clause changed from mandating an `AskUserQuestion` menu to plain markdown in 2026-08 (#646). Evidence basis: the 2026-08-16 session evaluation's Avoidable-interactions findings — both terminal menus that fired (`/backlog overview`, `/specify`) were rejected outright, costing two interruptions for zero decisions — plus the project's standing report-line convention (actionable report lines carry paste-ready commands; interactive launchers are reserved for human-owed decisions). Two structural points closed the loop: pipeline-invoked skills already suppress the terminal menu via their Component-Skill Contract, so the clause only ever fired on standalone close-outs; and a genuinely headless caller cannot answer an `AskUserQuestion` at all — headless resolution happens via policy levers and `consoleAutoResolve`, never a terminal menu. The evidence base is one evaluated session plus those standing conventions — stated honestly, not presented as settled by volume. Revisit trigger: a later session evaluation showing the markdown close-outs going unused, or users asking for the menus back.
```

- [ ] **Step 3: Verify no other stale statement remains in this file**

Run: `grep -n "via \`AskUserQuestion\`" docs/skill-authoring.md`
Expected: zero hits. Also run `grep -n "navigation menu" docs/skill-authoring.md` and confirm every remaining hit (if any) is consistent with the new rule ("never a navigation menu of generic commands" in the new bullet is fine).

- [ ] **Step 4: Commit**

```
git add docs/skill-authoring.md
git commit -m "Rewrite Interaction style directive: terminal Next Actions as paste-ready markdown — refs #646"
```

---

### Task 2: Blockquote sweep + the two exact-line pins

**Files:**
- Modify: every `skills/*/SKILL.md` carrying the retired directive line (derive the list by grep — do not hardcode it), plus `docs/superpowers/plans/2026-08-16-record-528-routine-kickoff.md` (embeds the blockquote in a plan snippet)
- Modify: `tests/skill-conventions.test.js` (the `CANONICAL_DIRECTIVE` constant, lines ~12–16)
- Modify: `tests/bin-lib/skill-audit/house-structure.test.js` (the `INTERACTION_STYLE` constant, lines ~38–43)

**Interfaces:**
- Consumes: the new canonical line from Global Constraints (byte-identical everywhere).
- Produces: a corpus where both conformance suites pass again — Tasks 3–6 edit Next Actions sections only, never the blockquote.

- [ ] **Step 1: Write and run the sweep script**

Write `sweep-directive.mjs` at the worktree root:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Derive the retired line from a live SKILL.md rather than embedding it here —
// this plan must never carry the retired sentence itself (see Global Constraints).
const capture = readFileSync('skills/capture/SKILL.md', 'utf8');
const OLD = capture.split('\n').find((l) => l.startsWith('> **Interaction style:**'));
if (!OLD || !OLD.endsWith('navigation menu.')) {
  throw new Error('could not derive the retired directive line from skills/capture/SKILL.md — already swept, or the corpus changed');
}
const NEW = '> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.';

const files = execFileSync('grep', ['-rlF', OLD, 'skills/', 'docs/superpowers/plans/'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
// Exclude this plan itself defensively (it must not contain OLD, but never rewrite the running plan).
const targets = files.filter((f) => !f.includes('2026-08-16-record-646-next-actions-markdown'));
let replaced = 0;
for (const f of targets) {
  const text = readFileSync(f, 'utf8');
  if (!text.includes(OLD)) throw new Error(`grep hit but no exact match: ${f}`);
  writeFileSync(f, text.split(OLD).join(NEW));
  replaced++;
}
console.log(`replaced in ${replaced} files:`);
targets.forEach((f) => console.log(`  ${f}`));
if (replaced < 30) throw new Error('expected the whole SKILL.md corpus (30+) — something matched too narrowly');
```

Run: `node sweep-directive.mjs` then `rm sweep-directive.mjs`
Expected: 34 files listed (the SKILL.md corpus + the one plan file). If fewer, STOP and investigate before committing.

- [ ] **Step 2: Update the pin in tests/skill-conventions.test.js**

Replace the `CANONICAL_DIRECTIVE` string-concat literal so it equals the NEW line exactly (keep the multi-line `' +'` concat style; the assembled string must be byte-identical to the new canonical line).

- [ ] **Step 3: Update the pin in tests/bin-lib/skill-audit/house-structure.test.js**

Replace the `INTERACTION_STYLE` string-concat literal the same way (this file uses `+`-led continuation lines; keep that style). Do not touch `NO_NEXT_ACTIONS` or any other constant.

- [ ] **Step 4: Run the two suites**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS.
Run: `node --test tests/bin-lib/skill-audit/house-structure.test.js`
Expected: PASS.

- [ ] **Step 5: Verify the retired line is gone (whitespace-tolerant regex — never type the literal sentence)**

Run: `grep -rEn "En[d] with .## Next Actions. via" skills/ docs/`
Expected: zero hits (test files under `tests/` are not in scope of this grep and were rewritten anyway).

- [ ] **Step 6: Commit**

```
git add -A skills/ docs/superpowers/plans/2026-08-16-record-528-routine-kickoff.md tests/skill-conventions.test.js tests/bin-lib/skill-audit/house-structure.test.js
git commit -m "Sweep the directive blockquote to the markdown-terminal form and repin both conformance constants — refs #646"
```

---

### Task 3: Convert terminal menus — small standalone close-outs

**Files:**
- Modify: `skills/capture/SKILL.md`, `skills/challenge/SKILL.md`, `skills/browse/SKILL.md`, `skills/simplify/SKILL.md`, `skills/journeys/SKILL.md`, `skills/stories/SKILL.md`, `skills/test/SKILL.md`, `skills/feedback/SKILL.md`, `skills/demo/SKILL.md`

**Interfaces:**
- Consumes: the conversion rules and markdown close-out form (Global Constraints).
- Produces: `## Next Actions` sections free of the string `AskUserQuestion` (Task 7's new pin asserts this corpus-wide).

- [ ] **Step 1: Convert each file's `## Next Actions` section**

For each file, read the whole `## Next Actions` section (heading to the next `## ` heading) and apply the conversion rules. Worked example — `skills/capture/SKILL.md`'s current section instructs an `AskUserQuestion` with three options; it becomes exactly:

```markdown
## Next Actions

When invoked by a parent skill, omit this block — the parent owns the handoff. When invoked directly by a user, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`/claude-tweaks:capture {next idea}`** — capture another idea while you're in brainstorming flow (recommended)
`/claude-tweaks:tidy` — review and triage backlog records (promote, absorb, or drop stale items)
`/claude-tweaks:specify {ref}` — promote this record straight to a spec ({ref} is `#{n}` under `work-backend: github-issues`, or the record id under `work-backend: local-files`); omit this line when the born-ready chain already shaped the record earlier this turn — there is nothing left to promote
```

Apply the same mechanical transformation to the other files: keep parent-suppression/omit-condition prose, convert each option to a command line + em-dash annotation, recommended first and bold with `(recommended)`, drop `question:`/`header:`/`multiSelect:` scaffolding, drop `Other`-field and lone-option clauses.

- [ ] **Step 2: Verify the sections**

For each file run: `grep -A 20 "^## Next Actions" skills/{name}/SKILL.md`
Expected: markdown command lines, no `AskUserQuestion` anywhere in the section, heading intact, all commands fully qualified.

- [ ] **Step 3: Run the conformance suites**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS (blockquote untouched by this task).
Run: `node --test tests/bin-lib/skill-audit/house-structure.test.js`
Expected: PASS (section order and headings unchanged).

- [ ] **Step 4: Commit**

```
git add skills/capture/SKILL.md skills/challenge/SKILL.md skills/browse/SKILL.md skills/simplify/SKILL.md skills/journeys/SKILL.md skills/stories/SKILL.md skills/test/SKILL.md skills/feedback/SKILL.md skills/demo/SKILL.md
git commit -m "Convert terminal Next Actions menus to markdown close-outs (capture, challenge, browse, simplify, journeys, stories, test, feedback, demo) — refs #646"
```

---

### Task 4: Convert terminal menus — lifecycle core + review/wrap-up templates

**Files:**
- Modify: `skills/build/SKILL.md`, `skills/review/SKILL.md`, `skills/review/review-summary-template.md`, `skills/wrap-up/SKILL.md`, `skills/reflect/SKILL.md`, `skills/deepen/SKILL.md`, `skills/visualize/SKILL.md`, `skills/research/SKILL.md`
- Check (edit only if needed): `skills/wrap-up/summary-template.md`

**Interfaces:**
- Consumes: conversion rules (Global Constraints).
- Produces: same contract as Task 3.

- [ ] **Step 1: Convert the seven SKILL.md sections and review-summary-template.md**

Same transformation as Task 3. File-specific notes:
- `skills/build/SKILL.md`: the Next Actions section keeps its signal-to-option lookup table verbatim (it is the assistant's own selection logic, already marked as such) — only the "Once the signals are resolved, call `AskUserQuestion` …" paragraph and its option list convert to "render the selected options as plain markdown", command lines derived from the same table. The two-branch review recommendation (visual vs code-only) and the worktree-mode recommendation switch stay as conditions on which line is bolded first.
- `skills/review/review-summary-template.md`: BOTH branches (PASS and BLOCKED) convert — the signal tables stay, the two "Once resolved, call `AskUserQuestion`…" blocks become markdown command blocks. These are `### Next Actions` inside a report template; the heading depth stays. Findings-routing `AskUserQuestion` calls elsewhere in review files are mid-flow blocking decisions — untouched.
- `skills/research/SKILL.md`: the mid-flow ambiguous-mode `AskUserQuestion` (pinned by `tests/research/skill-md.test.js`'s `/ambiguous[\s\S]{0,300}AskUserQuestion/i`) is NOT in the Next Actions section — do not touch it; convert only the terminal block.
- `skills/wrap-up/summary-template.md`: has no `## Next Actions` heading of its own (inline mentions only) — read it, confirm no terminal-menu instruction exists, and leave it unchanged if so.

- [ ] **Step 2: Verify**

Run per file: `grep -A 25 "Next Actions" {file}` — converted sections show markdown lines, no `AskUserQuestion` in any Next Actions section.
Run: `node --test tests/research/skill-md.test.js`
Expected: PASS (ambiguous-mode pin and `## Next Actions` heading pin both intact).

- [ ] **Step 3: Commit**

```
git add skills/build/SKILL.md skills/review/SKILL.md skills/review/review-summary-template.md skills/wrap-up/SKILL.md skills/reflect/SKILL.md skills/deepen/SKILL.md skills/visualize/SKILL.md skills/research/SKILL.md
git commit -m "Convert terminal Next Actions menus to markdown close-outs (build, review + template, wrap-up, reflect, deepen, visualize, research) — refs #646"
```

(Include `skills/wrap-up/summary-template.md` in the add only if Step 1 actually changed it.)

---

### Task 5: Convert terminal menus — queue/backlog family + helpers

**Files:**
- Modify: `skills/help/SKILL.md`, `skills/init/SKILL.md`, `skills/specify/SKILL.md`, `skills/backlog/SKILL.md`, `skills/dispatch/SKILL.md`, `skills/routine/SKILL.md`, `skills/design-wrapper/SKILL.md`, `skills/ledger/SKILL.md`
- Check (edit only if needed): `skills/help/policy.md`, `skills/specify/shaping-mode.md`, `skills/specify/decomposition-mode.md`, `skills/specify/record-creation.md`

**Interfaces:**
- Consumes: conversion rules (Global Constraints).
- Produces: same contract as Task 3.

- [ ] **Step 1: Convert the eight SKILL.md sections**

Same transformation. File-specific notes:
- `skills/specify/SKILL.md`: the Situation → options table stays verbatim (assistant-internal lookup, already marked as such). Replace the closing "Once the matching situation is resolved, replace the rendering of its numbered list with a call to `AskUserQuestion` …" paragraph with: render the matching row's entries as the markdown close-out — first entry bold with `(recommended)`, one command per line, `local-files` id-form note kept.
- `skills/backlog/SKILL.md`: three sub-blocks (`refine`, `overview`, `grant`) all convert. Keep every omit-condition and the overview block's Recommended-computation rule (precedence through needs-you → Dispatch entry → fallback ladder — now deciding which line renders first and bold instead of which label gets the suffix). Keep the headless-render guard on `grant` (a Routine firing renders nothing). Rewrite the zero-options clause: it no longer needs menu-skipping language — when situational filtering leaves zero lines, restate the report's own closing `Next:` line as the terminal statement (restate, never substitute — that rule survives verbatim).
- `skills/dispatch/SKILL.md`: keep the "render only when a human is present" guard prose; convert the option list.
- `skills/ledger/SKILL.md`: straightforward three-option conversion.
- The four Check files: read each, confirm their Next Actions references are prose descriptions or already-markdown content (no terminal `AskUserQuestion` instruction); convert only if one instructs a terminal menu.

- [ ] **Step 2: Verify**

Per file: `grep -B2 -A 30 "Next Actions" {file}` — no `AskUserQuestion` inside any Next Actions section; all conditions preserved.

- [ ] **Step 3: Commit**

```
git add skills/help/SKILL.md skills/init/SKILL.md skills/specify/SKILL.md skills/backlog/SKILL.md skills/dispatch/SKILL.md skills/routine/SKILL.md skills/design-wrapper/SKILL.md skills/ledger/SKILL.md
git commit -m "Convert terminal Next Actions menus to markdown close-outs (help, init, specify, backlog, dispatch, routine, design-wrapper, ledger) — refs #646"
```

(Add any of the four Check files that actually changed.)

---

### Task 6: Convert terminal menus — health family, tidy, visual-review, flow (incl. sub-files)

**Files:**
- Modify: `skills/code-health/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`, `skills/tidy/SKILL.md`, `skills/visual-review/SKILL.md`, `skills/visual-review/browser-review.md`, `skills/visual-review/discover-mode.md`, `skills/flow/SKILL.md`, `skills/flow/summary-template.md`, `skills/flow/worktree-merge.md`, `skills/flow/failure-cards.md`
- Check (edit only if needed): `skills/_shared/harness-health-analysis.md`

**Interfaces:**
- Consumes: conversion rules (Global Constraints).
- Produces: same contract as Task 3, plus the one documented interactive survivor (failure-cards' claims-release decision).

- [ ] **Step 1: Convert the SKILL.mds and simple sub-files**

Same transformation for the four health SKILL.mds, tidy, visual-review (SKILL.md + `browser-review.md`'s `#### Next Actions` + `discover-mode.md`'s block — signal tables stay, call-instructions convert; the "renders instead of SKILL.md's canonical block" substitution rules stay verbatim), `flow/summary-template.md`, and `flow/worktree-merge.md`. `flow/SKILL.md`'s own `## Next Actions` section defers to the templates — reword its description of the success-template call so it references the markdown close-out instead of "the canonical `AskUserQuestion` call".

- [ ] **Step 2: Convert flow/failure-cards.md with the one interactive survivor**

The failure card's navigation options (Resume / Run manually / Re-verify) convert to markdown command lines like every other block. The **claims-release decision keeps its `AskUserQuestion`**: when issue claims are held at a gate failure, releasing-vs-keeping is a decision the skill itself executes before finishing its failure handling (a blocking decision under the reservation's case 1 — the claim affects other agents' ability to pick up the record, and no paste-ready command exists for an in-session release procedure). Rewrite the section so:
- the command options render as a markdown block (Resume line first, bold, `(recommended)`);
- a separate paragraph instructs: "When issue claims are held, additionally call `AskUserQuestion` (single decision — release the claim(s) or keep them held; the skill executes the release itself; kept-vs-released changes what other dispatchers may do, which is why this is a blocking decision, not navigation)."
- the old 4-option-cap arithmetic paragraph is deleted (it counted menu options that no longer share one call).

- [ ] **Step 3: Check `skills/_shared/harness-health-analysis.md`**

Its Next Actions content has no `AskUserQuestion` reference — confirm, and update only if it restates the terminal-menu rule.

- [ ] **Step 4: Verify**

Per file: `grep -B2 -A 30 "Next Actions" {file}` — converted; the only `AskUserQuestion` inside any Next Actions section across `skills/` is failure-cards' claims-release paragraph.
Run: `node --test tests/bin-lib/code-health/skill-md.test.js`
Expected: PASS (required tokens incl. `## Next Actions` heading intact).

- [ ] **Step 5: Commit**

```
git add skills/code-health/SKILL.md skills/docs-health/SKILL.md skills/harness-health/SKILL.md skills/journey-health/SKILL.md skills/tidy/SKILL.md skills/visual-review/SKILL.md skills/visual-review/browser-review.md skills/visual-review/discover-mode.md skills/flow/SKILL.md skills/flow/summary-template.md skills/flow/worktree-merge.md skills/flow/failure-cards.md
git commit -m "Convert terminal Next Actions menus to markdown close-outs (health family, tidy, visual-review, flow + sub-files; failure-card claims-release stays interactive) — refs #646"
```

---

### Task 7: Terminal-menu conformance pin, control scans, and residual audit

**Files:**
- Modify: `tests/bin-lib/skill-audit/house-structure.test.js` (append the new pin)
- Test: `tests/bin-lib/skill-audit/house-structure.test.js`, `tests/skill-conventions.test.js`

**Interfaces:**
- Consumes: the converted corpus from Tasks 3–6.
- Produces: the standing guard that stops terminal menus creeping back one skill at a time.

- [ ] **Step 1: Append the terminal-menu pin to house-structure.test.js**

Add after the existing per-skill test loop:

```js
// #646: terminal `## Next Actions` renders as plain markdown, never an
// `AskUserQuestion` menu (docs/skill-authoring.md's Skill handoffs convention).
// A skill's Next Actions section may mention AskUserQuestion only for a
// documented machine-consumed terminal decision, listed here with its
// justification. Empty today — the reservation exists in the convention;
// no current skill uses it. (flow/failure-cards.md's claims-release decision
// is a sub-file, outside this SKILL.md-scoped pin.)
const TERMINAL_ASK_EXCEPTIONS = new Set([]);

test('no SKILL.md instructs a terminal-menu AskUserQuestion outside the documented reservation', () => {
  for (const name of skills) {
    if (NO_NEXT_ACTIONS.has(name) || TERMINAL_ASK_EXCEPTIONS.has(name)) continue;
    const body = readSkill(name);
    const start = sectionIndex(body, '## Next Actions');
    if (start === -1) continue; // absence is the house-order test's concern
    const rest = body.slice(start + '## Next Actions'.length);
    const end = rest.search(/^## /m);
    const section = end === -1 ? rest : rest.slice(0, end);
    assert.ok(
      !section.includes('AskUserQuestion'),
      `skills/${name}/SKILL.md's Next Actions section still instructs an AskUserQuestion terminal menu`,
    );
  }
});
```

- [ ] **Step 2: Run the suite — it must discriminate**

Run: `node --test tests/bin-lib/skill-audit/house-structure.test.js`
Expected: PASS. Then prove the pin bites: temporarily append the word `AskUserQuestion` to one skill's Next Actions section (e.g. `skills/capture/SKILL.md`), re-run, confirm FAIL, then revert that temporary edit (`git checkout -- skills/capture/SKILL.md` — a harness "modified externally" reminder after this checkout is the checkout's own side effect, not real signal) and re-run to confirm PASS.

- [ ] **Step 3: Whitespace-spanning control scans (acceptance criterion 1's second half)**

Write `control-scan.mjs` at the worktree root:

```js
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = execFileSync('bash', ['-c', "find skills docs -name '*.md' -type f"], { encoding: 'utf8' }).trim().split('\n');
const patterns = [
  /End\s+with\s+`##\s*Next\s+Actions`\s+via\s+`AskUserQuestion`/,
  /not\s+a\s+navigation\s+menu/,
  /via\s+`AskUserQuestion`,\s+not\s+a/,
];
let hits = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const p of patterns) {
    if (p.test(text)) { console.log(`HIT ${f} :: ${p}`); hits++; }
  }
}
console.log(hits === 0 ? 'CLEAN' : `${hits} residual hit(s)`);
// negative control — the scanner must be able to hit at all:
if (!/Terminal\s+`##\s*Next Actions`/.test(readFileSync('docs/skill-authoring.md', 'utf8'))) {
  throw new Error('negative control failed: scanner cannot find the NEW directive either — pattern bug');
}
console.log('negative control ok');
```

Run: `node control-scan.mjs`
Expected: `CLEAN` + `negative control ok`. Fix any residual hit (reflowed prose wrapping mid-sentence), then `rm control-scan.mjs`.

- [ ] **Step 4: Residual audit**

Run: `grep -rn "What's next?" skills/ --include="*.md"`
Expected: zero hits (every menu converted; if a hit remains, it is a missed conversion — fix it in place following Global Constraints).
Run: `grep -n "navigation menus" docs/donts.md`
Expected: the existing Don'ts line ("Don't add 'What's Next?' / 'Pick an action' navigation menus at the end of skills — use `## Next Actions` blocks with pre-filled commands") — still true under the new rule; leave unchanged.

- [ ] **Step 5: Full relevant-suite pass**

Run: `node --test tests/skill-conventions.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/research/skill-md.test.js tests/bin-lib/code-health/skill-md.test.js`
Expected: PASS across all four.

- [ ] **Step 6: Commit**

```
git add tests/bin-lib/skill-audit/house-structure.test.js
git commit -m "Pin terminal Next Actions sections against AskUserQuestion menus — refs #646"
```

(Also add any files Step 3/4 fixed.)
