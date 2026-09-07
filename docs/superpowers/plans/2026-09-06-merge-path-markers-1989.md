# Merge-path markers Implementation Plan (#1989)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fence the branch-specific prose already inside `plugin/skills/_shared/pr-first-merge.md` and `plugin/skills/_shared/pr-early-run-lifecycle.md` with `<!-- when: key=value -->` markers — inserting marker lines only, never editing a sentence — switch the two named consumers to compose and read one `merge` bundle, and add the permanent marker-conformance suite.

**Architecture:** Purely additive marker lines around six existing passages (two in `pr-first-merge.md`, four in `pr-early-run-lifecycle.md`); a one-token addition to `compose.js`'s parser (`fenced: true` on text tokens inside code fences) so the new conformance test can skip code-fence lines the same way the parser does; two consumer paragraphs gain the compose call plus the verbatim fallback sentence; one new live-corpus test. Byte-identity (`stripMarkers(new) === git show origin/main:{file}`) is the proof that nothing but marker lines changed.

**Tech Stack:** Markdown, Node 18+ (`node --test`, `node:assert/strict`), the shipped `plugin/bin/lib/compose-context/compose.js` (`parseMarkers`, `stripMarkers`, `KEYS`, `VOCAB`) and `plugin/bin/compose-context.js`.

**Spec:** `.claude-tweaks/pipelines/2026-09-06T110420-spec-1988-1989-1990-1991-1992-1993-1994-1995-1996-1997/spec-1989/work/1989-spec.md` (materialized record #1989)

## Global Constraints

- **[IL-144] — never delete or alter a sentence while fencing.** Every fenced passage's content stays byte-identical; only `<!-- when: key=value -->` / `<!-- /when -->` lines are inserted, each on its own line. Proof: `stripMarkers(new file) === git show origin/main:{file}` for both files (Task 6), pasted into PR #1998's description by the controller.
- **Never fence a heading, a `**Step N**` label, or an anchor another file cites.** Section headings stay outside every fence (the fence opens on the line after the heading's following blank line). Citation sweep done at plan time: no file under `plugin/skills/` or `docs/` cites `## Local-merge fallback`, `## Skip / degrade behavior`, or `## Root cause: MCP PR-body sanitization…` by anchor; `build/SKILL.md` cites "Skip / degrade behavior section" by name, and that heading stays unfenced.
- **The fence question is "is this passage really local-merge-only / mcp-only?"** A sentence that reads correctly under both branches stays unconditional. A passage is fenced only when it is a whole line or whole paragraph; a branch-specific clause mid-sentence is left alone (splitting a line is rewriting).
- Marker vocabulary: exactly the six keys and values `plugin/bin/lib/compose-context/compose.js` exports as `KEYS`/`VOCAB` — cite the module, never restate the list. Nesting depth 0 here (no nested fences are needed).
- Both consumers carry the identical compose call and the identical fallback sentence, verbatim: `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step merge plugin/skills/_shared/pr-first-merge.md plugin/skills/_shared/pr-early-run-lifecycle.md` then "read `$PIPELINE_RUN_DIR/context/merge.md`" then **"if the compose command is unavailable or exits non-zero, read the named source files directly."** The `${CLAUDE_PLUGIN_ROOT}` spelling is mandatory (`tests/skill-prose-plugin-root-invocations.test.js` pins that no skill prose uses `node plugin/bin/…`).
- The four `needs:decision` records that touch the same files (#1728, #1875, #1793, #1795) were all still OPEN at plan time (checked 2026-09-06) — nothing to rebase onto; Task 6 re-checks `origin/main` before the proof.
- Repo conventions: imperative commit messages, `refs #1989` (never `closes`/`fixes`), trailing `Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj` line; every git command `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" …`; one plain command per Bash call (no `&&`, `;`, pipes, heredocs, `cd`, shell variables); Edit/Write tools for file content; never `git add -A`.
- Pre-existing baseline failures (never regressions): `tests/bin-lib/reconcile/reap-merged.test.js` 3/15 fail on macOS realpath (tracked by #1900); `tests/reconcile.test.js`'s #872 wall-clock test and `tests/statusline.test.js` are load-sensitive flakes.

## Plan-authoring rulings (recorded per `build/plan-authoring-checks.md`)

- **Ruling — AC2's 35 KB figure cannot be met by additive fencing; the plan reports the measured number instead.** Measured at plan time with the shipped CLI on the unfenced pair: 58,751 bytes. The six passages this record may fence total roughly 5 KB, so the composed `merge` bundle under `integration-model=pr-first` + `transport=gh` will land near 53 KB. The remaining prose is genuinely pr-first-and-gh prose — the file *is* the pr-first procedure — and the record's own Non-Goals forbid rewriting it. The parent design (#1987) sets no 35 KB figure; it came from this record's shaping. AC2's coherence clause ("reads as one procedure, no orphaned reference to a fenced-out section") is met and checked in Task 6; its byte clause is reported as measured, the materialized spec is amended at `/build` Common Step 4.5 (classified *Update the spec*, staged for the consolidated console), and the byte budget itself is #1990's gate to set from real measurements (Cross-Spec Promise F3's sibling — the controller records it on #1987). Cost if wrong: a later record fences more or restructures; nothing here forecloses that.
- **Ruling — `cleanup-procedures-execution.md` Section C's pr-first branch does not "read the procedure directly" as the record states; it cites `pr-first-merge.md` and says the Review Console already ran it.** The deliverable is still applied literally — that paragraph gains the compose call, the read instruction, and the fallback sentence — so a reader of that step reads the bundle instead of two sources. The other real merge sites (`review-console.md` step 6, `dispatch/settle-and-merge.md`, `flow/worktree-merge.md`) are out of scope per Non-Goals.
- **Ruling — `## Skip / degrade behavior` is NOT fenced as a whole under `integration-model=local-merge`.** The record's parenthetical ("it describes what happens when there is no PR to react to") is wrong on inspection: its table's rows 2-7 are pr-first degrade paths (push fails, `gh pr create` fails twice, `gh` absent, offline), and `pre-tool-use.js`'s bookkeeping-stamps gate releases a PR-less pr-first run only on the `FAILED` line those rows document. Fencing them would hide pr-first degrade rules from pr-first runs. Only the section's local-merge paragraph and its `SKIP` code block are local-merge-only, and only they are fenced. Cost if wrong: one fence widened later.
- **Ruling — a branch-specific clause that sits mid-line is left unfenced** (`pr-first-merge.md` line 17's "`local-merge` projects keep all four…", `pr-early-run-lifecycle.md` line 327/331's "…when it is absent" clauses). The grammar is line-anchored; splitting a line to fence a clause is a rewrite, which [IL-144] forbids.
- **Ruling — `parseMarkers` gains a `fenced: true` flag on text tokens inside code fences** (Task 1). The conformance test's heading check must skip `# comment` lines inside bash fences exactly as the parser does; exposing the parser's own fence state is the one-grammar-one-validator choice (#1988's ruling) rather than a second fence tracker in the test. Additive: existing tokens are unchanged, `stripMarkers`/`compose` untouched.
- Verbatim-command run-once check: the compose call was run once at plan time (above); the `git show origin/main:` proof is a read-only git command. Degrade-clause check: the fallback sentence is the record's own mandated wording. Gate-over-producers: the conformance test scans every `plugin/skills/**/*.md`, which is the whole producer set for markers today. Renumbering: none.

---

### Task 1: `parseMarkers` marks code-fenced text tokens

**Files:**
- Modify: `plugin/bin/lib/compose-context/compose.js` (the `parseMarkers` loop — the fence-state branch)
- Test: `tests/bin-lib/compose-context/compose.test.js` (append one test)

**Interfaces:**
- Consumes: the existing `parseMarkers(text, file)` token stream.
- Produces: text tokens inside a code fence (the fence lines themselves and every line between them) carry `fenced: true`; every other token is unchanged. `stripMarkers`, `compose`, `MarkerError` untouched.

- [ ] **Step 1: Write the failing test** — append to `tests/bin-lib/compose-context/compose.test.js`:

```js
test('parseMarkers tags text tokens inside a code fence with fenced: true and nothing else', () => {
  const { parseMarkers } = require('../../../plugin/bin/lib/compose-context/compose');
  const tokens = parseMarkers('a\n```bash\n# not a heading\n<!-- when: mode=auto -->\n```\nb\n');
  assert.deepEqual(tokens.map((t) => [t.type, t.fenced === true]), [
    ['text', false], ['text', true], ['text', true], ['text', true], ['text', true], ['text', false], ['text', false],
  ]);
  assert.ok(!('fenced' in tokens[0]), 'an unfenced token carries no fenced key');
});
```

- [ ] **Step 2: Run it — Expected: FAIL** (`fenced` is undefined on every token today).
Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/tests/bin-lib/compose-context/compose.test.js"`

- [ ] **Step 3: Implement** — in `parseMarkers`, where a fence line or an inside-fence line currently pushes `{ type: 'text', line }`, push `{ type: 'text', line, fenced: true }` instead (both the opening/closing fence lines and the lines between them); the non-fenced text push stays `{ type: 'text', line }`. One-line comment: "`fenced` lets a consumer (the marker-conformance test) skip code-fence lines with the parser's own fence state instead of a second tracker."

- [ ] **Step 4: Run — Expected: PASS**, 23 tests. Also run `cli.test.js` (11) and `resolve-conditions.test.js` (11).

- [ ] **Step 5: Commit** — `plugin/bin/lib/compose-context/compose.js` and the test file:
`Tag code-fenced text tokens with fenced: true in parseMarkers — the conformance test's fence state (refs #1989)` + the Claude-Session trailer.

---

### Task 2: Fence `pr-first-merge.md` (two passages)

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md`

**Interfaces:**
- Consumes: nothing. Produces: two fenced passages; the file is otherwise byte-identical.

- [ ] **Step 1: Fence the Local-merge fallback body.** The heading `## Local-merge fallback` (line 417 today) and the blank line after it stay outside. Insert `<!-- when: integration-model=local-merge -->` on its own line immediately before the paragraph that begins `Not this file's concern — \`local-merge\` projects keep each citing file's own pre-#411 procedure`, and `<!-- /when -->` on its own line immediately after that paragraph's last line (`keeps a compact section stating this rather than duplicating the old prose here.`).

- [ ] **Step 2: Fence Step 2.5's gh-absent paragraph.** Insert `<!-- when: transport=mcp -->` immediately before the line beginning `` `gh` absent → the lever is unenforceable; proceed as `off` and disclose at **warn** tier per `` and `<!-- /when -->` immediately after the paragraph's last line (`already fails.`). The blank lines around the paragraph stay where they are (put the markers inside the blank-line gap, adjacent to the paragraph).

- [ ] **Step 3: Byte-identity proof.** Run, from the worktree root:
`node -e 'const {stripMarkers}=require("/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design/plugin/bin/lib/compose-context/compose.js");const fs=require("fs");const cp=require("child_process");const f="plugin/skills/_shared/pr-first-merge.md";const now=stripMarkers(fs.readFileSync(f,"utf8"));const base=cp.execFileSync("git",["-C","/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design","show","origin/main:"+f],{encoding:"utf8"});console.log(JSON.stringify({file:f,identical:now===base,nowBytes:now.length,baseBytes:base.length}))'`
Expected: `"identical":true`. If false, diff the two strings and fix — the only legal change is marker lines.

- [ ] **Step 4: Parse check.** `node -e 'const {parseMarkers}=require("…/compose.js");parseMarkers(require("fs").readFileSync("plugin/skills/_shared/pr-first-merge.md","utf8"),"pr-first-merge.md");console.log("ok")'` (same absolute require path as Step 3). Expected: `ok`.

- [ ] **Step 5: Run every test that reads this file**, each in isolation: `tests/pr-first-merge.test.js`, `tests/merge-verification-gate-conformance.test.js`, `tests/local-merge-auto-finish.test.js`, `tests/auto-merge-short-circuit-ledger-deletion.test.js`, `tests/dev-url-detection-lease-conformance.test.js`, `tests/sweep-backstop.test.js`, `tests/dispatch-flow-rundir-handoff.test.js`, `tests/scratch-worktree-remote-branch-delete.test.js`, `tests/bin-lib/skill-audit/context-cost.test.js`. Expected: all green. A pin that fails ONLY because it spans one of the two inserted marker lines is retargeted to the unchanged text on either side (never by asserting the marker); record every retarget in the report with the old and new assertion. A pin that fails for any other reason is a defect in this task — fix the fence, not the test.

- [ ] **Step 6: Commit** — the md file plus any retargeted test files:
`Fence pr-first-merge.md's local-merge fallback body and gh-absent paragraph with when: markers (refs #1989)` + trailer.

---

### Task 3: Fence `pr-early-run-lifecycle.md` (four passages)

**Files:**
- Modify: `plugin/skills/_shared/pr-early-run-lifecycle.md`

- [ ] **Step 1: Fence the file's local-merge scope statement.** Insert `<!-- when: integration-model=local-merge -->` before the line beginning `` `local-merge` runs (`_shared/integration-model.md`) skip this file entirely `` and `<!-- /when -->` after that paragraph's last line (`lifecycle, unchanged.`).

- [ ] **Step 2: Fence the MCP root-cause body.** The heading `## Root cause: MCP PR-body sanitization strips HTML comments on read, not write (#929)` and its following blank line stay outside. Insert `<!-- when: transport=mcp -->` before the line beginning `Confirmed against `github/github-mcp-server`'s own source` and `<!-- /when -->` after the last line of the `**Scope extends to issue reads, not just PR reads (#1700).**` paragraph (the line ending `rather than restating it here.`). The next heading, `## Callers`, stays outside with its preceding blank line.

- [ ] **Step 3: Fence the phase-checklist gh-absent write paragraph.** Insert `<!-- when: transport=mcp -->` before the indented line beginning `` `gh`-absent: `mcp__github__update_pull_request` with the same composed body `` and `<!-- /when -->` after that paragraph's last line (`regardless of which one was used to locate the span.`). Markers are inserted at column 0 (the grammar allows leading whitespace but column 0 is the convention).

- [ ] **Step 4: Fence the Skip/degrade section's local-merge paragraph and its code block.** The table and the "None of these ever block the pipeline" paragraph stay unfenced. Insert `<!-- when: integration-model=local-merge -->` before the line beginning `**`local-merge` row specifically (`build/SKILL.md` Spec Step 1's documented conditional action):**` and `<!-- /when -->` after the line `Standalone `/build` (no run dir): list the skip in the Step 7 handoff instead (`build/handoff-template.md`'s inline-skip listing).` — the fenced span therefore contains the paragraph, the ```bash code block (its `#`-free lines), and the standalone line.

- [ ] **Step 5: Byte-identity proof** — Task 2 Step 3's command with `f="plugin/skills/_shared/pr-early-run-lifecycle.md"`. Expected: `"identical":true`.

- [ ] **Step 6: Parse check** — Task 2 Step 4's command against this file. Expected: `ok`.

- [ ] **Step 7: Run every test that reads this file**, in isolation: `tests/pr-early-run-lifecycle.test.js`, `tests/pr-early-run-lifecycle-degrade-warning-conformance.test.js`, `tests/pr-run-comments.test.js`, `tests/build-skip-degrade-trace-adoption.test.js`, `tests/hooks-bookkeeping-stamps-gate.test.js`, `tests/superpowers-overrides-validate-precondition.test.js`, `tests/skill-prose-plugin-root-invocations.test.js`, `tests/ports-release-sites-conformance.test.js`, `tests/bin-lib/skill-audit/context-cost.test.js`. Same retarget rule as Task 2 Step 5.

- [ ] **Step 8: Commit** — the md file plus any retargeted tests:
`Fence pr-early-run-lifecycle.md's local-merge and MCP-transport passages with when: markers (refs #1989)` + trailer.

---

### Task 4: Switch the two consumers to the composed `merge` bundle

**Files:**
- Modify: `plugin/skills/wrap-up/cleanup-procedures-execution.md` (Section C, step 3's `integration-model: pr-first` paragraph)
- Modify: `plugin/skills/wrap-up/auto-merge-short-circuit.md` (the `**`integration-model: pr-first` …:** run `_shared/pr-first-merge.md`'s procedure now` paragraph)

- [ ] **Step 1: cleanup-procedures-execution.md.** In Section C step 3's pr-first paragraph (it ends with `Proceed to step 4 with whichever outcome the Review Console's merge step produced.`), append — as a new sentence at the end of that same paragraph, same indentation — exactly:
`` To read that procedure as one bundle: `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step merge plugin/skills/_shared/pr-first-merge.md plugin/skills/_shared/pr-early-run-lifecycle.md`, then read `$PIPELINE_RUN_DIR/context/merge.md`; if the compose command is unavailable or exits non-zero, read the named source files directly. ``

- [ ] **Step 2: auto-merge-short-circuit.md.** In the pr-first paragraph, immediately after the clause `` `summary` the record's own title. `` insert exactly:
`` Read that procedure as one composed bundle: `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step merge plugin/skills/_shared/pr-first-merge.md plugin/skills/_shared/pr-early-run-lifecycle.md`, then read `$PIPELINE_RUN_DIR/context/merge.md`; if the compose command is unavailable or exits non-zero, read the named source files directly. ``
(Keep the existing `run `_shared/pr-first-merge.md`'s procedure now` citation — the bundle is how it is read, not a replacement of the reference.)

- [ ] **Step 3: Verify.** `grep -n "compose-context.js" plugin/skills/wrap-up/cleanup-procedures-execution.md plugin/skills/wrap-up/auto-merge-short-circuit.md` shows one hit each; both hits contain the literal fallback sentence `if the compose command is unavailable or exits non-zero, read the named source files directly.` Run in isolation: `tests/skill-prose-plugin-root-invocations.test.js`, `tests/pr-first-merge.test.js`, `tests/auto-merge-short-circuit-ledger-deletion.test.js`, `tests/local-merge-auto-finish.test.js`, `tests/bin-lib/skill-audit/context-cost.test.js` (both files stay under 40 KB: 32,644 and 20,866 bytes today plus ~400 each). Expected: green.

- [ ] **Step 4: Commit** — both md files:
`Compose the merge bundle at both wrap-up merge sites — cleanup-procedures-execution.md Section C and auto-merge-short-circuit.md (refs #1989)` + trailer.

---

### Task 5: `tests/compose-markers-conformance.test.js`

**Files:**
- Create: `tests/compose-markers-conformance.test.js`

**Interfaces:**
- Consumes: `parseMarkers`, `KEYS`, `VOCAB`, `MarkerError` from `plugin/bin/lib/compose-context/compose.js` (Task 1's `fenced` flag).
- Produces: a live-corpus conformance suite plus a fixture-driven negative case.

- [ ] **Step 1: Write the test**:

```js
'use strict';
// #1989: every `<!-- when: key=value -->` marker in the live skill corpus is well-formed (opens and
// closes in-file, key/value from the vocabulary plugin/bin/lib/compose-context/compose.js exports,
// nesting at most one deep) and no fenced block contains a markdown heading or a **Step N** label —
// a heading inside a fence is the one composition defect that breaks citations silently and
// repo-wide (docs/skill-authoring.md, "Conditional blocks and the composer"). Headings are kept
// outside every fence by construction; this suite is the backstop.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseMarkers, MarkerError, KEYS, VOCAB } = require('../plugin/bin/lib/compose-context/compose');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const HEADING_RE = /^#{1,6} /;
const STEP_LABEL_RE = /^\*\*Step \d/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

// text -> [] of "file:line: message" problems. Grammar problems come from parseMarkers itself
// (which validates key/value against VOCAB and nesting/closure); this adds the heading rule.
function checkMarkers(text, file) {
  let tokens;
  try { tokens = parseMarkers(text, file); } catch (err) {
    if (err instanceof MarkerError) return [`${file}:${err.line}: ${err.message}`];
    throw err;
  }
  const lines = text.split('\n');
  const problems = [];
  let depth = 0;
  tokens.forEach((token, i) => {
    if (token.type === 'open') depth += 1;
    else if (token.type === 'close') depth -= 1;
    else if (depth > 0 && !token.fenced) {
      const line = lines[i];
      if (HEADING_RE.test(line)) problems.push(`${file}:${token.line}: heading inside a when: block — "${line.trim()}"`);
      if (STEP_LABEL_RE.test(line)) problems.push(`${file}:${token.line}: Step label inside a when: block — "${line.trim()}"`);
    }
  });
  return problems;
}

test('vocabulary is the six keys compose.js exports (cited, not restated)', () => {
  assert.equal(KEYS.length, 6);
  for (const key of KEYS) assert.ok(Array.isArray(VOCAB[key]) && VOCAB[key].length >= 2, key);
});

test('every when: marker in plugin/skills/**/*.md is well-formed and no fenced block holds a heading or Step label', () => {
  const problems = [];
  let markedFiles = 0;
  for (const file of walk(SKILLS)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/<!--\s*when:/.test(text)) continue;
    markedFiles += 1;
    problems.push(...checkMarkers(text, path.relative(SKILLS, file)));
  }
  assert.ok(markedFiles >= 2, `expected at least the two #1989 sources to carry markers, saw ${markedFiles}`);
  assert.deepEqual(problems, []);
});

test('discrimination: a heading inside a when: block is reported (fixture)', () => {
  const bad = '<!-- when: mode=auto -->\n## A heading\n**Step 3: x**\n<!-- /when -->\n';
  const problems = checkMarkers(bad, 'fixture.md');
  assert.equal(problems.length, 2);
  assert.match(problems[0], /fixture\.md:2: heading inside/);
  assert.match(problems[1], /fixture\.md:3: Step label inside/);
  // a heading-shaped line inside a code fence inside the block is fine — the parser's own fence state
  assert.deepEqual(checkMarkers('<!-- when: mode=auto -->\n```bash\n# comment\n```\n<!-- /when -->\n', 'fixture.md'), []);
  // a malformed marker is reported with its line, never thrown past the check
  assert.match(checkMarkers('<!-- when: mode=auto -->\nx\n', 'fixture.md')[0], /fixture\.md:1: unclosed/);
});
```

- [ ] **Step 2: Run — Expected: PASS** (Tasks 1-3 landed first, so the corpus scan finds the two marked files and no problems). If the corpus test fails, the fence in the named file:line is wrong — fix Task 2/3's marker placement, never the test.

- [ ] **Step 3: AC5 red proof.** Temporarily move one `<!-- when: integration-model=local-merge -->` line in `pr-first-merge.md` to just above the `## Local-merge fallback` heading (so the heading falls inside the block), run the suite, confirm the corpus test goes red naming `_shared/pr-first-merge.md:{line}`, then restore the file byte-identical (re-run Task 2 Step 3's byte-identity command to prove it) and confirm green. Record the red output lines in the report — AC5 requires them.

- [ ] **Step 4: Commit** — `Add compose-markers-conformance.test.js — live-corpus when: marker conformance with a heading-in-fence backstop (refs #1989)` + trailer.

---

### Task 6: Measure the composed bundle, re-run the proofs, full suite

**Files:**
- Read only. No new files; the report carries the numbers.

- [ ] **Step 1: Freshness.** `git -C "<worktree>" fetch origin main` then `git -C "<worktree>" rev-list --count HEAD..origin/main`. Expected `0`; if not, STOP and report (the controller rebases — #1728/#1875/#1793/#1795 may have landed).

- [ ] **Step 2: Compose the bundle** with the repo's own CLI against this spec's run dir (the installed plugin predates the CLI, so the `${CLAUDE_PLUGIN_ROOT}` form is not usable here):
`node plugin/bin/compose-context.js --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-09-06T110420-spec-1988-1989-1990-1991-1992-1993-1994-1995-1996-1997/spec-1989" --step merge plugin/skills/_shared/pr-first-merge.md plugin/skills/_shared/pr-early-run-lifecycle.md`
Record the JSON line verbatim (`bytes` is the AC2 measurement; baseline before fencing was 58751). Then read `…/spec-1989/context/merge.md` once, end to end, and confirm: the first line is the resolved header with `integration-model=pr-first` and `transport=gh`; no fenced-out passage is referenced by a surviving sentence (search the bundle for "Local-merge fallback", "Root cause", "Skip / degrade" — each surviving citation must still resolve to a heading that is present, since every heading stays unfenced); record `grep -c "<!-- when:" merge.md` = 0.

- [ ] **Step 3: Both byte-identity proofs again** (Task 2 Step 3's command for each file). Expected `"identical":true` twice; paste both JSON lines into the report verbatim.

- [ ] **Step 4: Full suite.** `npm test` as ONE plain Bash call (timeout 900000). Read only the trailing `# tests`/`# pass`/`# fail` lines and every `not ok` line. Expected: every `not ok` inside the known baseline/flake files (Global Constraints); any other `not ok` is this record's regression — a pin spanning a marker line is retargeted per Task 2 Step 5's rule and committed as `Retarget prose pins that spanned a when: marker line (refs #1989)`; anything else is reported, not fixed.

- [ ] **Step 5: No commit unless Step 4 retargeted a pin.** Report: the compose JSON line, the two proof lines, the suite summary, every `not ok` verbatim with its classification.

---

## Self-review

- **Spec coverage:** Deliverable 1 (pr-first-merge.md markers) → Task 2; Deliverable 2 (pr-early-run-lifecycle.md markers) → Task 3 (with the Skip/degrade ruling above); Deliverable 3 (never fence a heading, citation sweep) → done at plan time + Task 5's backstop; Deliverables 4-5 (consumers) → Task 4; Deliverable 6 (conformance test) → Task 5; Deliverable 7 (byte-identity proof) → Tasks 2/3/6 + the controller's PR-description paste; Deliverable 8 (retarget pins) → Tasks 2/3/6; Deliverable 9 (rebase) → Task 6 Step 1; Deliverable 10 (confirm U1 exists) → satisfied on this shared branch (commits b68d0288d…52f222787 ship the composer; #1988 merges with this run). AC1 → Tasks 2/3 parse checks; AC2 → Task 6 Step 2 with the measured-number ruling; AC3 → Task 4 Step 3; AC4 → Task 6 Step 3 + controller; AC5 → Task 5 Step 3; AC6 → Task 6 Step 4.
- **Placeholder scan:** none.
- **Type consistency:** Task 1's `fenced: true` is what Task 5's `checkMarkers` reads; Task 5 imports `parseMarkers, MarkerError, KEYS, VOCAB` — all exported by `compose.js` today.
