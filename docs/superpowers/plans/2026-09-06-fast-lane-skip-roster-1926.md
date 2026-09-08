# Fast Lane That Sheds Cost (#1926) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ceremony-profile: fast-lane` shed real minutes — skip SDD's whole-branch review for single-task fast-lane plans and skip the polish phase under fast-lane — and put every fast-lane skip on one roster that a test pins.

**Architecture:** `plugin/bin/plan-audit.js` gains a read-only `--count-tasks` verb (reusing the existing `extractTaskBlocks` parser) so the single-task condition is read from the plan file, never inferred. A new `plugin/skills/_shared/ceremony-profile.md` roster holds three tables — Skips by profile (keyed by a short **tag** in its Step column), Never skipped, and Mentions that are not skips — and every skill line that pairs `fast-lane` with `skip` either carries a roster tag in its citation or is listed in the third table. `build/dispatch.md` composes the SDD invocation with the conditional whole-branch skip; `flow`'s polish row, decision tree, step note, and summary literal gain the fast-lane skip; the escape hatch states that build-side skips have already happened. A conformance test (last task, after every citation exists) fails on any new unrostered `fast-lane … skip` line.

**Tech Stack:** Node 18+, `node --test`, markdown skill prose. No new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1926/work/1926-spec.md` (record #1926)

## Global Constraints

- Every edited `plugin/skills/**` file stays ≤ 40,960 bytes (`wc -c`). Sizes now: `flow/SKILL.md` 40,138 (822 spare); `wrap-up/SKILL.md` 40,752 (208 spare — the escape-hatch sentence in Task 5 must fit, else trim in the same paragraph); `dispatch/SKILL.md` is never touched.
- The single-task condition is read from the plan file via `plan-audit.js --count-tasks`, never from the diff or SDD's narration.
- The third-party SDD skill file is never edited; the instruction lives in the invocation text `build/dispatch.md` composes. `tools/upstream-drift/manifest.yml` already pins SDD's `## Final Review` step — reuse it, add no second assertion.
- Decision-log literals, exact: `SKIP {time} — Whole-branch review skipped: fast-lane, single-task plan (task review covers the whole branch). Reversibility: n/a.` and `SKIP {time} — polish skipped: fast-lane. Reversibility: n/a.`
- `--count-tasks` output, exact: `{"tasks": n, "batched": boolean}` on one stdout line, exit 0; exit 2 on a missing/unreadable plan or a readable plan with zero parseable tasks.
- **Batched-plan marker (defined by this record):** a plan is `batched: true` when the text before its first `### Task` heading contains the line `**Execution:** batched`, or any `### Task N:` heading title contains `[batch]`. Nothing else marks a batch.
- Roster tags (the Skips table's Step column, verbatim): `review-step-1`, `review-step-1.6`, `review-step-4`, `plan-audit`, `architecture-alignment`, `reflect-light-mode`, `red-team-persona`, `sdd-whole-branch-review`, `polish`. A citing line writes `roster tag \`{tag}\`` plus `\`_shared/ceremony-profile.md\`` on the same line.
- Skill references inside instruction text use the fully-qualified `/claude-tweaks:{skill}` form; cross-skill relationships are stated once, in `docs/skill-graph.md`.
- Commit subjects end with `(refs #1926)`; last line `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`. Never `git stash`/`checkout --`/`reset`; stage explicit paths only.
- Worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony` (confirm with `git rev-parse --show-toplevel`).

**Design decisions locked here (deviations from the record body, recorded at the alignment check):**
- The roster's Step column holds short tags rather than prose step names, because the existing skip lines (e.g. `code-mode-steps.md:24`) do not carry their step number on the same line; the record's "step name appears verbatim as a Step column value" rule is satisfied by the tag.
- A third roster table, **Mentions that are not skips**, lists the skill lines that pair `fast-lane` with `skip` without skipping a step (summary-template renderings, the escape hatch's own gate, `fast-lane-digest.md`'s restatement, `review/SKILL.md`'s pointer, `ceremony-check-invocation.md`'s label-present skip, `ceremony-derivation.md`'s "skip this file", `review-effort-derivation.md`'s aside, `wrap-up/review-console.md`'s `tag: fast-lane` merge line). The conformance test exempts exactly those.
- The conformance test is the last task, after every citation exists, so each task stays independently green.
- The batched-plan marker is defined here (no plan-file convention existed).

---

### Task 1: `plan-audit.js --count-tasks`

**Files:**
- Modify: `plugin/bin/lib/plan-audit/args.js`
- Modify: `plugin/bin/lib/plan-audit/parser.js`
- Modify: `plugin/bin/plan-audit.js`
- Test: `tests/bin-lib/plan-audit/parser.test.js`, `tests/bin-lib/plan-audit/cli.test.js`

**Interfaces:**
- Produces: `parseArgs(argv)` returns `{ planFile, repoRoot, countTasks: boolean }` (`--count-tasks` is a boolean flag; `USAGE` becomes `usage: plan-audit.js <plan-file> [--repo-root <dir>] [--count-tasks]`); `countTasks(text) → { tasks: number, batched: boolean }` exported from parser.js; the CLI's `--count-tasks` branch prints `{"tasks": n, "batched": b}` and exits 0, or exits 2 (message on stderr) for a missing/unreadable plan or zero tasks.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/plan-audit/parser.test.js` (its top already destructures from parser.js — add `countTasks` there):

```js
test('countTasks counts ### Task N: headings and reports batched=false by default (#1926)', () => {
  assert.deepStrictEqual(countTasks('### Task 1: Only\nbody\n'), { tasks: 1, batched: false });
  assert.deepStrictEqual(countTasks('# Plan\n\n### Task 1: A\n\n### Task 2: B\n\n### Task 3: C\n'), { tasks: 3, batched: false });
  assert.deepStrictEqual(countTasks('# Plan with no tasks\n'), { tasks: 0, batched: false });
});

test('countTasks flags a batched plan by the header marker or a [batch] task title (#1926)', () => {
  assert.deepStrictEqual(countTasks('# Plan\n\n**Execution:** batched\n\n### Task 1: A\n'), { tasks: 1, batched: true });
  assert.deepStrictEqual(countTasks('# Plan\n\n### Task 1: Same one-line fix across files [batch]\n'), { tasks: 1, batched: true });
  // The marker only counts in the header — a task BODY mentioning it is prose, not a marker.
  assert.deepStrictEqual(countTasks('# Plan\n\n### Task 1: A\n\nSee **Execution:** batched in another plan.\n'), { tasks: 1, batched: false });
});
```

and append to `tests/bin-lib/plan-audit/cli.test.js` (it has `makeTmpRepo`, `writePlan`, `CLI`, `execFileSync`; add a `runCount` helper):

```js
function runCount(planFile) {
  try {
    const stdout = execFileSync('node', [CLI, planFile, '--count-tasks'], { encoding: 'utf8' });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

test('--count-tasks prints {"tasks": 1, "batched": false} for a one-task plan, 3 for three, batched:true for a batched plan; exit 0 (#1926 AC2)', () => {
  const repo = makeTmpRepo();
  try {
    const one = writePlan(repo, '### Task 1: Only\n**Files:**\n- Modify: `a.js`\n');
    assert.deepStrictEqual(runCount(one), { exitCode: 0, stdout: '{"tasks": 1, "batched": false}\n', stderr: '' });
    const three = writePlan(repo, '### Task 1: A\n\n### Task 2: B\n\n### Task 3: C\n');
    assert.strictEqual(runCount(three).stdout, '{"tasks": 3, "batched": false}\n');
    const batched = writePlan(repo, '# P\n\n**Execution:** batched\n\n### Task 1: A\n\n### Task 2: B\n');
    assert.strictEqual(runCount(batched).stdout, '{"tasks": 2, "batched": true}\n');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('--count-tasks exits 2 for a missing plan and for a readable plan with zero tasks (#1926 Gotchas)', () => {
  const repo = makeTmpRepo();
  try {
    const missing = runCount(path.join(repo, 'nope.md'));
    assert.strictEqual(missing.exitCode, 2);
    assert.match(missing.stderr, /cannot read plan file/);
    const empty = writePlan(repo, '# A plan with no tasks\n');
    const r = runCount(empty);
    assert.strictEqual(r.exitCode, 2);
    assert.match(r.stderr, /no parseable tasks/);
    assert.strictEqual(r.stdout, '');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('--count-tasks never runs Checks A/B/C — a plan naming a missing path still counts and exits 0 (#1926)', () => {
  const repo = makeTmpRepo();
  try {
    const plan = writePlan(repo, '### Task 1: X\n**Files:**\n- Modify: `does/not/exist.js`\n');
    assert.strictEqual(runCount(plan).exitCode, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/plan-audit/parser.js"); process.exit(typeof m.countTasks==="function"?0:1)'`
Expected: FAIL (exit 1). Then `node --test tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/cli.test.js` fails the new tests (`countTasks is not a function`; `unknown flag: --count-tasks`).

- [ ] **Step 3: Implement** — `args.js`: `USAGE = 'usage: plan-audit.js <plan-file> [--repo-root <dir>] [--count-tasks]'`; in the loop, before the `startsWith('--')` rejection:

```js
    if (flag === '--count-tasks') { countTasks = true; continue; }
```

(declare `let countTasks = false;` beside `repoRoot` and return it: `{ planFile, repoRoot, countTasks }`.) `parser.js`, after `extractTaskBlocks`:

```js
// Task count for /build's single-task fast-lane condition (#1926): the plan
// file is the authority, never the diff or SDD's own narration. `batched`
// is true only for the two markers this record defines — the header line
// `**Execution:** batched` (text before the first "### Task" heading) or a
// task title carrying `[batch]` — because a batched dispatch bundles work
// items reviewed together, which the single-task equivalence never covers.
function countTasks(text) {
  const blocks = extractTaskBlocks(text);
  const firstHeading = text.search(/^###\s+Task\s+\d+:/m);
  const header = firstHeading === -1 ? text : text.slice(0, firstHeading);
  const batched = /^\*\*Execution:\*\*\s*batched\s*$/m.test(header)
    || blocks.some((b) => /\[batch\]/i.test(b.title));
  return { tasks: blocks.length, batched };
}
```

and export it. `plan-audit.js`: after the plan file is read (the existing `text` read — its "cannot read plan file" exit-2 branch already covers a missing plan), before `resolveRepoRoot`:

```js
  if (parsed.countTasks) {
    const { tasks, batched } = countTasks(text);
    if (tasks === 0) {
      process.stderr.write(`plan-audit.js: ${parsed.planFile} has no parseable tasks (no "### Task N:" heading)\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`{"tasks": ${tasks}, "batched": ${batched}}\n`);
    return;
  }
```

(import `countTasks` in the parser destructure). Extend the file's header comment with one clause: "`--count-tasks` (#1926) is a read-only verb printing `{tasks, batched}` for /build's single-task fast-lane condition — it never runs the checks."

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/cli.test.js tests/bin-lib/plan-audit/checks.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/plan-audit/args.js plugin/bin/lib/plan-audit/parser.js plugin/bin/plan-audit.js tests/bin-lib/plan-audit/parser.test.js tests/bin-lib/plan-audit/cli.test.js
git commit -m "plan-audit.js --count-tasks — read-only {tasks, batched} for the single-task fast-lane condition (refs #1926)"
```

---

### Task 2: The roster — `plugin/skills/_shared/ceremony-profile.md`

**Files:**
- Create: `plugin/skills/_shared/ceremony-profile.md`

**Interfaces:**
- Produces: the three tables below; Task 6's test parses the Skips table's Step column (backticked tags) and the Mentions table's `File` + `Line contains` columns.

- [ ] **Step 1: Write the file** (create-only; no test yet — Task 6 pins it):

````markdown
# Ceremony profile — the skip roster

`ceremony-profile` (`fast-lane` | `standard`) is stamped as a `ceremony:*` label by `/claude-tweaks:specify` (`docs/decisions/0006-ceremony-tiering-owned-by-specify.md`), folded into a run's `config.yml` by `flow/manifesto.md`, narrowed `standard` → `fast-lane` from diff facts for headless firings by `wrap-up/ceremony-derivation.md`, and raised back to `standard` only by `wrap-up/SKILL.md`'s Ceremony escape hatch. This file is the **single roster** of what each profile skips and what no profile may skip (#1926). Consumers cite it by name next to their own skip; none restates a row. `tests/ceremony-profile-roster.test.js` pins it: every `plugin/skills/**/*.md` line that mentions `fast-lane` together with `skip` must carry a tag from the Skips table's Step column, or match a row of the Mentions table.

## Skips by profile

| Step (tag) | Skipping profile | Condition | Citing file | Why the guarantee holds |
|---|---|---|---|---|
| `review-step-1` | `fast-lane` | Always under the profile | `review/code-mode-steps.md` Step 1 (Spec Compliance) | Spec compliance is exact per-record overhead independent of diff size; `[IL-145]` is the one recorded defect it let through, and the escape hatch exists because of it |
| `review-step-1.6` | `fast-lane` | Always under the profile | `review/code-mode-steps.md` Step 1.6, `review/cross-spec-promise-check.md` | Promise tables belong to multi-record parents; a fast-lane record's promise check re-runs at the parent's own gate |
| `review-step-4` | `fast-lane` | Always under the profile | `review/code-mode-steps.md` Step 4 (Implementation Hindsight) | Hindsight is narrative fixed cost; Steps 2, 3, and 5 — the judgment of the diff itself — never skip |
| `plan-audit` | `fast-lane` | Always under the profile (also: fewer than 3 file references and no `Scope keywords:`, any profile) | `build/SKILL.md` Common Step 1.5, `build/plan-audit.md` | A `ceremony-check` verdict of `fast-lane` is itself the judgment that the plan needs no scope-creep audit |
| `architecture-alignment` | `fast-lane` | Always under the profile (also: design mode with no spec; a trivial plan) | `build/SKILL.md` Common Step 4.5, `build/architecture-alignment.md` | Alignment compares built-vs-spec prose; a fast-lane diff is small enough for the lens review to see the whole of it |
| `reflect-light-mode` | `fast-lane` | Always under the profile | `wrap-up/SKILL.md` Reflect, `reflect/light-mode.md` | Surprises, Approach, and the tradeoff review are narrative; Near-misses, Fresh-start, and Friction still run and can still fire the escape hatch |
| `red-team-persona` | `fast-lane` | Always under the profile (one persona instead of three) | `specify/red-team.md` | The Skeptical Reviewer persona alone covers the framing check; the other two add breadth a fast-lane record's scope does not need |
| `sdd-whole-branch-review` | `fast-lane` | `--count-tasks` prints `tasks: 1` **and** `batched: false` | `build/dispatch.md` "Whole-branch review model" | With one task the task review's diff *is* the whole branch; every cross-task incident in `[IL-02]`/`[IL-04]`/`[IL-10]`/`[IL-97]`/`[IL-101]` needed two or more tasks (an empirical observation from this codebase's incident history, not a structural proof). Multi-task and batched plans keep the review |
| `polish` | `fast-lane` | Always under the profile (also: non-frontend spec, `no-polish`, Impeccable absent — any profile) | `flow/steps-and-gates.md` polish row, `flow/SKILL.md` | Polish is Impeccable refinement, not correctness; `/claude-tweaks:test`'s Design CLI gate and `/claude-tweaks:review` Step 6.5's read-only design judgment still run, so a design finding still reaches the escape hatch |

**Escape hatch and the build-side skips.** Every row above except `reflect-light-mode` has already happened by the time `wrap-up/SKILL.md`'s Ceremony escape hatch fires; the downgrade to `standard` means the record's *next* run runs standard — it never re-runs a skipped step in the current run.

**The two-call split is kept.** A fast-lane record still runs `/claude-tweaks:build` + `/claude-tweaks:test` and `/claude-tweaks:review` + `/claude-tweaks:wrap-up` as two calls (`dispatch/two-call-gate.md`): collapsing them saves only the second call's preflight and loses the clean-room review (`[IL-07]`, `[IL-130]`) — the last independent judgment a fast-lane record gets.

## Never skipped

| Step | Where | Why no profile may skip it |
|---|---|---|
| review Step 2 (Identify What Changed) | `review/code-mode-steps.md` | The diff shape is what every later step reasons from |
| review Step 3 (Code Review lenses) | `review/code-mode-steps.md` | The safety-relevant judgment the whole scheme protects |
| review Step 5 (Simplify) | `review/code-mode-steps.md` | Scoped to the diff already; nothing to cap |
| review Step 6 rendered-UI check | `review/code-mode-steps.md`, CLAUDE.md's merge precondition (#808) | A UI-dependent record must not reach a merge decision without a real rendered check or an explicit decline |
| build Common Step 5 (Final Verification) | `build/SKILL.md` | The producer of `VERIFICATION_PASSED`/the runner pass stamp |
| reflect Near-misses, Fresh-start, Friction | `reflect/light-mode.md` | The lenses that can still produce the Safety regression finding the escape hatch keys on |
| Ceremony escape hatch | `wrap-up/SKILL.md` | The control for `[IL-145]`'s failure class |
| `[IL-116]` cleanup floor | `wrap-up/cleanup-procedures.md` Section C, step 3.5 | Teardown ordering is a floor `cleanup-only` may never relax |
| HARD-GATEs | `_shared/auto-mode-contract.md` | Test failures, spec compliance blocks, structural coupling, plan validation stop every mode |

## Mentions that are not skips

Lines that pair `fast-lane` with `skip` without skipping a step. The conformance test exempts a line only when its file matches and the line contains the `Line contains` text.

| File | Line contains | Why it is not a skip |
|---|---|---|
| `review/SKILL.md` | `the \`fast-lane\` skips for Steps 1, 1.6, and 4` | A pointer to the three rows above |
| `review/review-summary-template.md` | `skipped — fast-lane` | Summary rendering of a row above |
| `review/review-summary-template.md` | `Skipped — ceremony-profile: fast-lane.` | Summary rendering of a row above |
| `review/review-effort-derivation.md` | `Step 1 is skipped under \`ceremony-profile: fast-lane\`` | An aside explaining why the label read is independent of Step 1 |
| `wrap-up/SKILL.md` | `Skip entirely when \`config.yml\`'s \`ceremony-profile\` is not \`fast-lane\`` | The escape hatch's own gate |
| `wrap-up/review-console.md` | `tag: fast-lane` | A merge-tag literal, not a ceremony skip |
| `wrap-up/ceremony-derivation.md` | `Skip this file.` | Derivation has nothing to do when the profile is already set |
| `_shared/ceremony-check-invocation.md` | `Skip the call entirely when \`facets.ceremony\`` | The ceremony-check CLI is skipped when a label already exists, at any profile |
| `_shared/fast-lane-digest.md` | `skips or narrows` | A restatement file that defers to this roster |
````

- [ ] **Step 2: Verify the file's own consistency**

Run: `node -e 'const t=require("fs").readFileSync("plugin/skills/_shared/ceremony-profile.md","utf8"); const tags=[...t.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)].map(m=>m[1]); console.log(tags.join(",")); process.exit(tags.length===9?0:1)'`
Expected: prints the nine tags, exit 0. Also `wc -c plugin/skills/_shared/ceremony-profile.md` well under 40,960.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/_shared/ceremony-profile.md
git commit -m "Add _shared/ceremony-profile.md — the fast-lane skip roster: skips by profile, never skipped, non-skip mentions (refs #1926)"
```

---

### Task 3: SDD whole-branch review skip + build-side citations

**Files:**
- Modify: `plugin/skills/build/dispatch.md` ("Whole-branch review model" paragraph)
- Modify: `plugin/skills/build/SKILL.md` (Common Step 1.5's skip sentence; Common Step 4.5's skip sentence)
- Modify: `plugin/skills/build/plan-audit.md` (line ~63)
- Modify: `plugin/skills/build/architecture-alignment.md` ("## Skip this step if" section)
- Modify: `docs/skill-graph.md` (`## build` → `/superpowers:subagent-driven-development` row)

**Interfaces:**
- Consumes: Task 1's `--count-tasks`; Task 2's tags `sdd-whole-branch-review`, `plan-audit`, `architecture-alignment`.

- [ ] **Step 1: Probe the anchors exist**

Run: `node -e 'const fs=require("fs"); const d=fs.readFileSync("plugin/skills/build/dispatch.md","utf8"); const s=fs.readFileSync("plugin/skills/build/SKILL.md","utf8"); process.exit(d.includes("Whole-branch review model.**") && s.includes("**Skip this step entirely when** the plan has fewer than 3 file references") && s.includes("**Skip this step if:** design mode with no formal spec") && !d.includes("Whole-branch review skipped") ? 1 : 0)'`
Expected: FAIL (exit 1 — anchors present, literal absent).

- [ ] **Step 2: `build/dispatch.md`** — inside the "Whole-branch review model" paragraph, immediately before the sentence beginning `Log the resolution:`, insert:

```markdown
**Single-task fast-lane skip (#1926; roster tag `sdd-whole-branch-review`, `_shared/ceremony-profile.md`).** Before composing that instruction, read `config.yml`'s `ceremony-profile` from the run directory and run `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-audit.js" --count-tasks {plan-file}` (one JSON line, `{"tasks": n, "batched": boolean}`; exit 2 means the plan is unreadable or has no tasks — treat as not qualifying). When the profile is `fast-lane` **and** `tasks` is exactly `1` **and** `batched` is `false`, instruct `/superpowers:subagent-driven-development` instead to skip its final whole-branch review dispatch (and the fix wave and re-review that follow it) and stop after the last task review — the task review's diff *is* the whole branch — and log `SKIP {time} — Whole-branch review skipped: fast-lane, single-task plan (task review covers the whole branch). Reversibility: n/a.` Multi-task plans and batched plans (`batched: true`, regardless of count) keep the whole-branch review at every profile; a `standard` profile keeps it for any count. The count comes from the plan file only — never from the diff or SDD's own narration (`[IL-07]`).
```

- [ ] **Step 3: `build/SKILL.md`** — in Common Step 1.5, replace the clause `**or** when \`config.yml\`'s \`ceremony-profile\` is \`fast-lane\` (read fresh from the run directory) — a \`ceremony-check\` verdict of \`fast-lane\` is itself a judgment that this record's plan doesn't need auditing against scope creep.` with `**or** when \`config.yml\`'s \`ceremony-profile\` is \`fast-lane\` (read fresh from the run directory) — roster tag \`plan-audit\`, \`_shared/ceremony-profile.md\`, which holds the rationale.` In Common Step 4.5, replace `or \`config.yml\`'s \`ceremony-profile\` is \`fast-lane\` — see \`architecture-alignment.md\`'s own Skip section for the full rationale (why fast-lane skip is deliberate, not an oversight, and what the safety net is).` with `or \`config.yml\`'s \`ceremony-profile\` is \`fast-lane\` — roster tag \`architecture-alignment\`, \`_shared/ceremony-profile.md\` (the rationale and the safety net live there; \`architecture-alignment.md\`'s own Skip section keeps only the three conditions).` Measure: `wc -c plugin/skills/build/SKILL.md` ≤ 40,960 (it is ~36.9 KB).

- [ ] **Step 4: `build/plan-audit.md`** — on the line containing `or \`ceremony-profile: fast-lane\`) — none of them introduces a new skip condition of its own.`, change the parenthetical to `or \`ceremony-profile: fast-lane\` — roster tag \`plan-audit\`, \`_shared/ceremony-profile.md\`) — none of them introduces a new skip condition of its own.` `build/architecture-alignment.md`: in "## Skip this step if", add one sentence at the end of that section (before "## On skip"): `The fast-lane bullet's rationale and safety net are stated once in \`_shared/ceremony-profile.md\` (roster tag \`architecture-alignment\`) — this section keeps only the three conditions.` If that section restates why fast-lane skips (a sentence naming the safety net), delete that restatement in the same edit.

- [ ] **Step 5: `docs/skill-graph.md`** — in `## build`, extend the `/superpowers:subagent-driven-development` row's text with: ` Since #1926 the same invocation text conditionally skips SDD's final whole-branch review — \`ceremony-profile: fast-lane\` and \`plan-audit.js --count-tasks\` reporting exactly one non-batched task (roster: \`_shared/ceremony-profile.md\`, tag \`sdd-whole-branch-review\`).`

- [ ] **Step 6: Verify**

Run: `node -e 'const fs=require("fs"); const d=fs.readFileSync("plugin/skills/build/dispatch.md","utf8"); const s=fs.readFileSync("plugin/skills/build/SKILL.md","utf8"); const ok=d.includes("Whole-branch review skipped: fast-lane, single-task plan") && d.includes("`tasks` is exactly `1` **and** `batched` is `false`") && s.includes("roster tag `plan-audit`") && s.includes("roster tag `architecture-alignment`") && Buffer.byteLength(s)<=40960; process.exit(ok?0:1)'`
Expected: exit 0. Then `node --test tests/skill-graph-table-structure.test.js` (pins the skill-graph table shape the extended row must keep).

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/build/dispatch.md plugin/skills/build/SKILL.md plugin/skills/build/plan-audit.md plugin/skills/build/architecture-alignment.md docs/skill-graph.md
git commit -m "build: skip SDD's whole-branch review for single-task fast-lane plans; plan-audit/alignment cite the ceremony roster (refs #1926)"
```

---

### Task 4: Polish skipped under fast-lane

**Files:**
- Modify: `plugin/skills/flow/steps-and-gates.md` (polish row ~line 15; polish-phase decision tree ~line 166)
- Modify: `plugin/skills/flow/SKILL.md` (line 16's parenthetical; Step 4's `review → polish` bullet ~line 178)
- Modify: `plugin/skills/flow/summary-template.md` (polish outcome ~line 20)
- Modify: `docs/skill-graph.md` (`## flow` gains a `/design-wrapper` row)

**Interfaces:**
- Consumes: Task 2's tag `polish`.

- [ ] **Step 1: Probe**

Run: `node -e 'const fs=require("fs"); const g=fs.readFileSync("plugin/skills/flow/steps-and-gates.md","utf8"); const t=fs.readFileSync("plugin/skills/flow/summary-template.md","utf8"); process.exit(g.includes("Skipped on non-frontend specs (wrapper detection). |") && t.includes("Skipped — no-polish") && !t.includes("Skipped — fast-lane") ? 1 : 0)'`
Expected: FAIL (exit 1).

- [ ] **Step 2: `flow/steps-and-gates.md`** — in the polish row, replace `Skipped on non-frontend specs (wrapper detection). |` with `Skipped on non-frontend specs (wrapper detection) and, since #1926, under \`ceremony-profile: fast-lane\` — read from the run's \`config.yml\` before invoking the wrapper, logged \`SKIP {time} — polish skipped: fast-lane. Reversibility: n/a.\` (roster tag \`polish\`, \`_shared/ceremony-profile.md\`; \`/claude-tweaks:test\`'s Design CLI gate and \`/claude-tweaks:review\` Step 6.5 still run). |` In the decision tree, replace the first line `Polish phase entry (after review PASS, no-polish not set)` with `Polish phase entry (after review PASS, no-polish not set, ceremony-profile not fast-lane — a fast-lane run logs the polish SKIP and proceeds to wrap-up)`.

- [ ] **Step 3: `flow/SKILL.md`** — line 16: replace `(polish + re-verify run only when frontend)` with `(polish + re-verify: frontend and not fast-lane)`. Step 4's bullet: replace `- \`review\` → \`polish\` (when \`no-polish\` not set)` with `- \`review\` → \`polish\` (when \`no-polish\` not set and \`ceremony-profile\` is not \`fast-lane\` — roster tag \`polish\`, \`_shared/ceremony-profile.md\`)`. Measure `wc -c plugin/skills/flow/SKILL.md` ≤ 40,960 (822 B spare before; this adds ~110).

- [ ] **Step 4: `flow/summary-template.md`** — in the polish outcome cell, after `Skipped — no-polish` insert ` | Skipped — fast-lane`.

- [ ] **Step 5: `docs/skill-graph.md`** — in `## flow`, add a row after the `/specify` row: `| \`/design-wrapper\` | \`/flow\`'s polish phase invokes \`/claude-tweaks:design-wrapper polish <spec>\` (\`polish-execution.md\`) — skipped on non-frontend specs, under \`no-polish\`, and since #1926 under \`ceremony-profile: fast-lane\` (roster: \`_shared/ceremony-profile.md\`, tag \`polish\`); \`/review\` Step 6.5's read-only design pass still runs on a polish-skipped record. |`

- [ ] **Step 6: Verify**

Run: `node -e 'const fs=require("fs"); const g=fs.readFileSync("plugin/skills/flow/steps-and-gates.md","utf8"); const t=fs.readFileSync("plugin/skills/flow/summary-template.md","utf8"); const s=fs.readFileSync("plugin/skills/flow/SKILL.md","utf8"); process.exit(g.includes("polish skipped: fast-lane") && t.includes("Skipped — fast-lane") && s.includes("roster tag `polish`") && Buffer.byteLength(s)<=40960 ? 0 : 1)'`
Expected: exit 0. Then `node --test tests/manifesto-lever-conformance.test.js tests/manifesto-auto-fast-path.test.js tests/flow-claim-preflight.test.js tests/skill-graph-table-structure.test.js`.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/flow/steps-and-gates.md plugin/skills/flow/SKILL.md plugin/skills/flow/summary-template.md docs/skill-graph.md
git commit -m "flow: skip the polish phase under ceremony-profile fast-lane, logged and rostered (refs #1926)"
```

---

### Task 5: Review / reflect / red-team / wrap-up citations and the escape-hatch sentence

**Files:**
- Modify: `plugin/skills/review/code-mode-steps.md` (Steps 1, 1.6, 4 skip lines; the "Ceremony-Aware Step Selection" paragraph)
- Modify: `plugin/skills/review/cross-spec-promise-check.md` (line 3)
- Modify: `plugin/skills/specify/red-team.md` (the persona-selection sentence, lines ~7-10)
- Modify: `plugin/skills/reflect/light-mode.md` (line ~15)
- Modify: `plugin/skills/wrap-up/SKILL.md` (Reflect paragraph's light-mode sentence; the escape-hatch section — one added sentence)
- Modify: `plugin/skills/wrap-up/ceremony-derivation.md` (cite the roster)

**Interfaces:**
- Consumes: tags `review-step-1`, `review-step-1.6`, `review-step-4`, `reflect-light-mode`, `red-team-persona`.

- [ ] **Step 1: Probe**

Run: `node -e 'const fs=require("fs"); const c=fs.readFileSync("plugin/skills/review/code-mode-steps.md","utf8"); const w=fs.readFileSync("plugin/skills/wrap-up/SKILL.md","utf8"); process.exit(c.includes("roster tag") || w.includes("_shared/ceremony-profile.md") ? 0 : 1)'`
Expected: FAIL (exit 1).

- [ ] **Step 2: `review/code-mode-steps.md`** — Step 1: replace `Skip this step entirely under \`ceremony-profile: fast-lane\` (see "Ceremony-Aware Step Selection"\nabove) — proceed directly to Step 1.5.` with `Skip this step entirely under \`ceremony-profile: fast-lane\` (roster tag \`review-step-1\`,\n\`_shared/ceremony-profile.md\`) — proceed directly to Step 1.5.` Step 1.6: replace `**Skip entirely** under \`ceremony-profile: fast-lane\`, or silently when` with `**Skip entirely** under \`ceremony-profile: fast-lane\` (roster tag \`review-step-1.6\`, \`_shared/ceremony-profile.md\`), or silently when`. Step 4: replace `Skip this step entirely under \`ceremony-profile: fast-lane\` (see "Ceremony-Aware Step Selection"\nabove) — proceed directly to Step 5.` with `Skip this step entirely under \`ceremony-profile: fast-lane\` (roster tag \`review-step-4\`,\n\`_shared/ceremony-profile.md\`) — proceed directly to Step 5.` In "Ceremony-Aware Step Selection", after the sentence ending `... \`/claude-tweaks:wrap-up\`.` (the first sentence), insert: `The roster of every profile's skips — and of what no profile may skip — is \`_shared/ceremony-profile.md\`; this section keeps only the three step numbers.` Note the two-line wraps: the original text breaks lines after `Selection"` — match the file's actual line breaks when editing (read the lines first).

- [ ] **Step 3: `review/cross-spec-promise-check.md`** line 3: replace `Skip entirely under \`ceremony-profile: fast-lane\` (see "Ceremony-Aware Step Selection" above).` with `Skip entirely under \`ceremony-profile: fast-lane\` (roster tag \`review-step-1.6\`, \`_shared/ceremony-profile.md\`).`

- [ ] **Step 4: `specify/red-team.md`** — in the "Persona selection by tier" paragraph, after the clause that says `ceremony:fast-lane` → one persona (the Skeptical Reviewer), append ` (roster tag \`red-team-persona\`, \`_shared/ceremony-profile.md\` — the fast-lane skip of the other two personas is rostered there)`. `reflect/light-mode.md` line 15: replace `Surprises and Approach are skipped — light mode exists specifically to trim ceremony for a \`fast-lane\`-profiled record.` with `Surprises and Approach are skipped — light mode exists specifically to trim ceremony for a \`fast-lane\`-profiled record (roster tag \`reflect-light-mode\`, \`_shared/ceremony-profile.md\`).`

- [ ] **Step 5: `wrap-up/SKILL.md`** (40,752 B; ceiling 40,960 — measure after each edit). (a) In the Reflect paragraph, replace `Light mode (\`skills/reflect/light-mode.md\`) runs only the Near-misses, Fresh-start, and Friction lenses and skips the tradeoff review` with `Light mode (\`skills/reflect/light-mode.md\`; roster tag \`reflect-light-mode\`, \`_shared/ceremony-profile.md\`) runs only the Near-misses, Fresh-start, and Friction lenses and skips the tradeoff review`. (b) In the Ceremony escape hatch section, after the sentence `This never re-runs the reflect pass itself, or any build-side step already completed under the original \`fast-lane\` value — see the design doc's Escape Hatch section for why this is deliberate, not a gap.` replace that sentence with `This never re-runs the reflect pass itself, or any build-side skip in \`_shared/ceremony-profile.md\`'s roster (the SDD whole-branch review and polish skips included) — those have already happened; the downgrade means the record's next run runs \`standard\`.` — that replacement is shorter than the original, which pays for (a). Then `wc -c plugin/skills/wrap-up/SKILL.md` ≤ 40,960; if over, shorten (a) to `Light mode (\`skills/reflect/light-mode.md\`, roster tag \`reflect-light-mode\`)`.

- [ ] **Step 6: `wrap-up/ceremony-derivation.md`** — after the first paragraph's last sentence (`This file matters only for a headless firing whose header default is still \`standard\`.`) add: `What each profile skips is rostered in \`_shared/ceremony-profile.md\`; this file only decides which profile a headless firing gets.`

- [ ] **Step 7: Verify**

Run: `node -e 'const fs=require("fs"); const r=(p)=>fs.readFileSync(p,"utf8"); const c=r("plugin/skills/review/code-mode-steps.md"), w=r("plugin/skills/wrap-up/SKILL.md"); const ok=["review-step-1`","review-step-1.6`","review-step-4`"].every((t)=>c.includes("roster tag `"+t)) && r("plugin/skills/review/cross-spec-promise-check.md").includes("review-step-1.6") && r("plugin/skills/specify/red-team.md").includes("red-team-persona") && r("plugin/skills/reflect/light-mode.md").includes("reflect-light-mode") && w.includes("reflect-light-mode") && w.includes("next run runs `standard`") && Buffer.byteLength(w)<=40960 && Buffer.byteLength(c)<=40960; console.log("wrap-up bytes", Buffer.byteLength(w)); process.exit(ok?0:1)'`
Expected: exit 0. Then `node --test tests/deferral-gate-conformance.test.js tests/wrap-up-registry-pin.test.js tests/ceremony-framing-per-record-conformance.test.js tests/verification-flake-handling.test.js tests/wrap-up-flaky-escalation-row.test.js` (the last two pin wrap-up/SKILL.md and verification.md literals that must survive).

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/review/code-mode-steps.md plugin/skills/review/cross-spec-promise-check.md plugin/skills/specify/red-team.md plugin/skills/reflect/light-mode.md plugin/skills/wrap-up/SKILL.md plugin/skills/wrap-up/ceremony-derivation.md
git commit -m "review/reflect/red-team/wrap-up cite the ceremony roster; escape hatch states build-side skips already happened (refs #1926)"
```

---

### Task 6: Roster conformance test + ADR note

**Files:**
- Create: `tests/ceremony-profile-roster.test.js`
- Modify: `docs/decisions/0006-ceremony-tiering-owned-by-specify.md` (append a dated note after the existing `**Note (2026-08-13):**` paragraph; original body untouched)

**Interfaces:** none.

- [ ] **Step 1: Write the test** — create `tests/ceremony-profile-roster.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'plugin', 'skills');
const ROSTER = path.join(SKILLS, '_shared', 'ceremony-profile.md');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}`);
  assert.notStrictEqual(start, -1, `roster lacks "## ${heading}"`);
  const rest = text.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

// Table rows only (skip the header and the |---| separator).
function rows(sectionText) {
  return sectionText.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Step') && !l.startsWith('| File') && !/^\|\s*-/.test(l));
}

function cells(row) {
  return row.split('|').slice(1, -1).map((c) => c.trim());
}

const roster = fs.readFileSync(ROSTER, 'utf8');
const skipTags = rows(section(roster, 'Skips by profile')).map((r) => cells(r)[0].replace(/`/g, ''));
const neverRows = rows(section(roster, 'Never skipped')).map((r) => cells(r)[0]);
const mentions = rows(section(roster, 'Mentions that are not skips')).map((r) => {
  const [file, contains] = cells(r);
  return { file: file.replace(/`/g, ''), contains: contains.replace(/^`|`$/g, '').replace(/\\`/g, '`') };
});

test('the roster names the nine expected skip tags and the never-skipped floor (#1926 AC1)', () => {
  assert.deepStrictEqual(skipTags, [
    'review-step-1', 'review-step-1.6', 'review-step-4', 'plan-audit', 'architecture-alignment',
    'reflect-light-mode', 'red-team-persona', 'sdd-whole-branch-review', 'polish',
  ]);
  for (const literal of ['review Step 2', 'review Step 3', 'review Step 5', 'review Step 6 rendered-UI check', 'build Common Step 5', 'reflect Near-misses, Fresh-start, Friction', 'Ceremony escape hatch', '`[IL-116]` cleanup floor', 'HARD-GATEs']) {
    assert.ok(neverRows.some((r) => r.includes(literal)), `never-skipped row missing: ${literal}`);
  }
});

test('every skill line pairing fast-lane with skip carries a roster tag or is a rostered non-skip mention (#1926 AC5)', () => {
  const offenders = [];
  for (const file of walk(SKILLS)) {
    if (file === ROSTER) continue;
    const rel = path.relative(SKILLS, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const lower = line.toLowerCase();
      if (!(lower.includes('fast-lane') && lower.includes('skip'))) return;
      const tagged = skipTags.some((t) => line.includes(`roster tag \`${t}\``) || line.includes(`tag \`${t}\``));
      const exempt = mentions.some((m) => rel === m.file && line.includes(m.contains));
      if (!tagged && !exempt) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(offenders, [], `unrostered fast-lane skip lines:\n${offenders.join('\n')}`);
});

test('build/dispatch.md gates the single-task skip on all three conditions and carries the SKIP literal; flow rows carry fast-lane (#1926 AC3, AC4)', () => {
  const d = fs.readFileSync(path.join(SKILLS, 'build', 'dispatch.md'), 'utf8');
  const sentence = d.split('\n').find((l) => l.includes('Whole-branch review skipped: fast-lane, single-task plan'));
  assert.ok(sentence, 'dispatch.md lacks the SKIP literal');
  assert.ok(sentence.includes('`fast-lane`') && sentence.includes('`tasks` is exactly `1`') && sentence.includes('`batched` is `false`'));
  assert.ok(d.includes('batched plans (`batched: true`, regardless of count) keep the whole-branch review'));
  const gates = fs.readFileSync(path.join(SKILLS, 'flow', 'steps-and-gates.md'), 'utf8');
  const polishRow = gates.split('\n').find((l) => l.startsWith('| `polish` | `/claude-tweaks:design-wrapper polish'));
  assert.ok(polishRow && polishRow.includes('fast-lane'));
  assert.ok(fs.readFileSync(path.join(SKILLS, 'flow', 'summary-template.md'), 'utf8').includes('Skipped — fast-lane'));
});

test('every touched skill file stays under the 40,960-byte ceiling (#1926 AC7)', () => {
  for (const rel of ['build/SKILL.md', 'flow/SKILL.md', 'wrap-up/SKILL.md', 'review/code-mode-steps.md', 'build/dispatch.md', 'flow/steps-and-gates.md', '_shared/ceremony-profile.md']) {
    const bytes = Buffer.byteLength(fs.readFileSync(path.join(SKILLS, rel), 'utf8'), 'utf8');
    assert.ok(bytes <= 40960, `${rel} is ${bytes} bytes`);
  }
});
```

- [ ] **Step 2: Run it — it must pass against Tasks 2-5's edits; then prove AC5 by a temporary edit**

Run: `node --test tests/ceremony-profile-roster.test.js`
Expected: PASS. Then append a line `Under fast-lane this step is skipped.` to `plugin/skills/help/SKILL.md` (any skill file), re-run — Expected: FAIL naming `help/SKILL.md`; remove the line (edit it back out — never `git checkout --`), re-run — PASS. State this check in the task report.

- [ ] **Step 3: ADR note** — in `docs/decisions/0006-ceremony-tiering-owned-by-specify.md`, after the `**Note (2026-08-13):** …` paragraph, add:

```markdown
**Note (2026-09-06):** the skip roster — every step each ceremony profile skips, and every step no profile may skip — now lives in `plugin/skills/_shared/ceremony-profile.md` (#1926), pinned by `tests/ceremony-profile-roster.test.js`; consumers cite it by tag rather than restating a skip. Two skips were added there: SDD's final whole-branch review for a single-task, non-batched fast-lane plan, and the polish phase under fast-lane. The two-call split (`build,test` then `review,polish,wrap-up`) is deliberately kept for fast-lane records: collapsing it saves only the second call's preflight and loses the clean-room review — the last independent judgment a fast-lane record gets (`[IL-07]`, `[IL-130]`).
```

Nothing above or below the existing notes changes.

- [ ] **Step 4: Verify**

Run: `node --test tests/ceremony-profile-roster.test.js tests/bin-lib/plan-audit/cli.test.js tests/skill-graph-table-structure.test.js` (no test pins `docs/decisions/*.md`'s body — the ADR note is checked by reading the file: the two older `**Note (…)**` paragraphs and everything after them are byte-identical to before).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ceremony-profile-roster.test.js docs/decisions/0006-ceremony-tiering-owned-by-specify.md
git commit -m "Pin the ceremony skip roster — every fast-lane skip line carries a tag or is a rostered mention; ADR 0006 note (refs #1926)"
```

---

## Self-review notes

- Spec coverage: Deliverable 1 → Task 2; 2 → Tasks 1 + 3; 3 → Task 4; 4 → Task 5 (escape hatch + derivation); 5 → Tasks 3 + 5; 6 → Tasks 6 (ADR) + 3/4 (skill-graph); 7 (tests) → Tasks 1 and 6. AC1 → Task 6 test 1; AC2 → Task 1; AC3/AC4 → Task 6 test 3; AC5 → Task 6 Step 2; AC6 → Task 6 Step 3; AC7 → Task 6 test 4 + the build's Common Step 5.
- Ordering: the conformance test lands last so every task is green on its own; Task 2's roster lists the non-skip mentions from today's grep, and Tasks 3-5 tag every real skip line.
- Types: `countTasks` returns `{tasks, batched}` (Task 1) and Task 3's prose reads `tasks`/`batched` — consistent. Tags are spelled identically in Task 2's table, Tasks 3-5's citations, and Task 6's expected array.
