# Routine Template Kernel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frozen ~95-line prompt preamble with a compressed canonical **kernel** in `_shared/routine-template-schema.md` (assembled per firing at instantiation), a required `kickoff` field replacing `prompt` in all seven templates, `kernel_version` dual-drift tracking, and the consumer updates (assembly, fleet, status, freshness).

**Architecture:** The coupled expand-contract atom (schema + 7 templates + rewritten schema tests) lands as ONE commit — Task A — because `tests/routine-template-schema.test.js` pins templates to the schema byte-for-byte; splitting them makes the suite red between commits. Consumer prose (Task B) and dual-drift (Task C) are independently green. Kernel size: ~38 lines (target ≤45; assembled prompt ≤55). Parser change is exactly two things: `'kernel_version'` joins `SIGNIFICANT_FIELDS`, and a tiny pure `kernelFreshness()` helper gives AC5 an automated home.

**Tech Stack:** Markdown skill prose + YAML templates + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T062945-spec-276-528-529-530/spec-529/work/529-spec.md` (materialized record #529)

## Global Constraints

- **Verified state (survey 2026-08-16):** template versions backlog=2, code-health/dispatch/docs-health/harness-health=8, journey-health/tidy=9. Kickoff lines: `backlog grant` / `code-health` / `dispatch next` / `docs-health` / `harness-health` / `journey-health --min-confidence high` / `tidy`. All seven prompts are byte-identical apart from the `Then:` line (zero template-specific additions). Dispatch's file has a 5-line header comment above `template_version` — preserve it.
- The `{{TARGET_BRANCH}}` substitution table (schema `### {{TARGET_BRANCH}}` section) survives with its unresolved-fallback wording **verbatim** — only its intro sentence's "preamble" vocabulary updates to "kernel".
- The frozen-catalog fallback sentence lands EXACTLY as: "If, after a successful self-heal, invoking /claude-tweaks:routine-kickoff via the Skill tool still fails with an unknown- or unrecognized-skill error, read `<plugin-root>/skills/routine-kickoff/SKILL.md` — the plugin root resolved above — and follow its instructions directly as written."
- Kernel closing line: `Then: /claude-tweaks:routine-kickoff {kickoff}` — `{kickoff}` spliced at assembly with the template's `kickoff` value.
- Load-bearing survivors in the kernel: rung names (`env`, `hook-path`, `cache-scan-unique`, `cache-scan-highest-of-N`), the format line `claude-tweaks v{version} @ {path} (resolved via: {env | hook-path | cache-scan-unique | cache-scan-highest-of-N})`, `--ff-only`, the diverged-stop rule, `{{TARGET_BRANCH}}`.
- `kickoff` grammar: whitespace-delimited; first token equals the owning skill's directory name; remaining tokens pass through verbatim; single-space joins; no quoting.
- Every `template_version` increments by exactly 1 (2→3, 8→9 ×4, 9→10 ×2). `kernel_version: 1` is a machine-greppable literal line adjacent to the kernel block; read mechanism: `grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md`.
- Version-bump enforcement stays honest: review discipline, not automation — do not claim otherwise in schema prose.
- Negative greps (AC2) run with `git grep` or plain grep over `skills/` only, each with a positive control.
- Commits: `{Verb} {what} — {detail}`, `refs #529`. Targeted suites between edits; full suite at each commit point.
- Do NOT edit `skills/routine-kickoff/SKILL.md` (#528's file) or `skills/routine/SKILL.md`'s Anti-Patterns table / docs-graph surfaces (#530's) — the ONE `skills/routine/SKILL.md` edit allowed is the `--branch` Input-row phrase (behavior doc, not a cross-reference surface).

---

### Task 1: The atom — schema kernel + seven templates + rewritten schema test (ONE commit)

**Files:**
- Modify: `skills/_shared/routine-template-schema.md` (field table L17 area; `## Standard prompt preamble` section L27-127; `###
 {{TARGET_BRANCH}}` intro; instantiated-record table ~L158-167; `## Re-provisioning` ~L171-181; `## Anti-Patterns` ~L183-196)
- Modify: all seven `skills/{backlog,code-health,dispatch,docs-health,harness-health,journey-health,tidy}/routine-template.yml`
- Modify (rewrite): `tests/routine-template-schema.test.js`

**Interfaces:**
- Produces: the fenced kernel block under a heading `## Standard prompt kernel` with an adjacent literal line `kernel_version: 1`; templates with `kickoff:` (no `prompt:`); the rewritten test. Tasks 2-3 reference the kernel heading and the grep mechanism by exact text.

- [ ] **Step 1: Rewrite the schema's preamble section as the kernel**

Replace the `## Standard prompt preamble` heading and everything down to (not including) `### {{TARGET_BRANCH}} — substituted at instantiation, never sent literally` with:

`````markdown
## Standard prompt kernel

Every live routine's prompt is assembled at instantiation from the canonical kernel below: `{{TARGET_BRANCH}}` substituted per the table in the next section, and `{kickoff}` on the closing line replaced with the template's `kickoff` value. Templates carry no prompt text of their own — the firing lifecycle beyond the kernel (stale-docs guard, plugin-list dump, reconcile, target invocation and its exclusions) lives in `skills/routine-kickoff/SKILL.md` and updates with each plugin release instead of being frozen into every live prompt.

kernel_version: 1

The line above is the kernel's own version, machine-greppable via `grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md` (this file is markdown; `bin/lib/routine-template-parser.js` stays uninvolved). **Any edit to the kernel block text below requires `kernel_version` += 1.** Enforcement is review discipline — the schema test asserts the field is a positive integer, never that it incremented; the structural mitigation is that the kernel is one file, so a bump is one edit, not seven. `template_version` now means only "this template's own fields changed."

```
Before anything else, fetch origin and confirm this checkout is on {{TARGET_BRANCH}}
and at its tip. If the container started on a different branch, check the target
branch out first (`git checkout <branch>`, creating it from `origin/<branch>` if it
isn't local yet). If it's merely behind, fast-forward via `git merge --ff-only` —
never `git reset --hard`. If it has diverged rather than just fallen behind, stop
and report that instead of proceeding on unverified state.

Before the kickoff below, print exactly one line recording which plugin build this
session resolved AND which path resolved it. Try in order, stopping at the first
that yields a readable `.claude-plugin/plugin.json`: (1) `env` —
`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, if that variable is set and
non-empty (it is routinely empty in a cloud Routine sandbox — never assume it).
(2) `hook-path` — the plugin root embedded in the claude-tweaks SessionStart hook's
own `node "<path>/bin/hooks.js"` line, when present in this session's context
(often absent; that is normal, not an error). (3) `cache-scan` — glob
`~/.claude/plugins/cache/*/claude-tweaks/*/.claude-plugin/plugin.json`; exactly one
match reports as `cache-scan-unique`; two or more means the highest-semver
directory is a GUESS — report it as `cache-scan-highest-of-N`, N being the
candidate count, never as a confirmed answer. (4) If nothing resolves, say
`claude-tweaks version unresolved (no CLAUDE_PLUGIN_ROOT, no hook path, no plugin
cache found)` and carry on. Format: `claude-tweaks v{version} @ {path} (resolved
via: {env | hook-path | cache-scan-unique | cache-scan-highest-of-N})`. Never
report a version without its resolution path. Diagnostic only — never a gate,
never a reason to stop.

If all four rungs came up empty (`unresolved`), the plugin cache is genuinely
empty — do not attempt the kickoff yet. Read `$HOME/claude-cloud-setup.log` (via
`tail -5 "$HOME/claude-cloud-setup.log"` or equivalent — shell expansion, not a
literal path) and print exactly one line: `claude-cloud-setup.log: absent — the
environment Setup script left no trace in this container (not executed, or its
write failed)` or `claude-cloud-setup.log: present — tail: {last 5 lines}`. Then
run `bash scripts/claude-cloud-setup.sh` to self-heal, and re-run the
resolved-build line once before proceeding to the kickoff.

If, after a successful self-heal, invoking /claude-tweaks:routine-kickoff via the
Skill tool still fails with an unknown- or unrecognized-skill error, read
`<plugin-root>/skills/routine-kickoff/SKILL.md` — the plugin root resolved above —
and follow its instructions directly as written.

Then: /claude-tweaks:routine-kickoff {kickoff}
```

`--ff-only` (not `git reset --hard`) deliberately keeps this compatible with `_shared/git-discipline.md`'s NEVER-`git reset` rule — a fresh routine firing hasn't made any commits of its own yet, so nothing is lost by refusing to proceed on a genuine divergence instead of forcing past it.
`````

Then update the `### {{TARGET_BRANCH}}` section's intro sentence: "`{{TARGET_BRANCH}}` is the kernel's only placeholder besides `{kickoff}`" (table itself + unresolved-fallback wording untouched, verbatim). Also update its last paragraph's "Copying a template's `prompt` by hand" to "Copying an assembled prompt by hand". The `### Resolved-build line` section survives as-is (its content describes rung authority, still true).

- [ ] **Step 2: Schema field tables**

1. Template field table: replace the `prompt` row with:

```markdown
| `kickoff` | string | yes | The target-skill invocation the assembled kernel's closing line carries — whitespace-delimited tokens, the first of which must equal the owning skill's directory name (e.g. `code-health`), the rest passing through verbatim (`key=value` or flag tokens; values containing spaces unsupported — the same constraint the `focus` grammar already carries). Instantiation splices it into the kernel's `Then: /claude-tweaks:routine-kickoff {kickoff}` line; `skills/routine/fleet.md`'s per-vertical rows append `focus=<value>` to it with a single space. |
```

2. Instantiated-record field table: add after the `template_version` row:

```markdown
| `kernel_version` | integer | yes (on new writes) | The schema's `kernel_version` at assembly time (read via the documented grep). A record without it reads as kernel-stale. Significant for `skills/routine/record-freshness.md`'s comparison — unlike `created_at`. |
```

3. In the `template_version` row (template table), append: "Narrowed meaning since the kernel split: bumped when *this template's own fields* change; kernel edits bump `kernel_version` instead."

- [ ] **Step 3: Re-provisioning + Anti-Patterns rewrite**

Re-provisioning section: update its prose so the drift story covers both versions — a template-field edit bumps `template_version`; a kernel edit bumps `kernel_version`; STATUS reports each staleness distinctly ("kernel stale" vs template drift); live routines pick either up via `/claude-tweaks:routine update {skill}`. Anti-Patterns rows:
- "Writing a new `prompt` that skips the standard preamble" → `| Hand-provisioning a routine without the kernel | Observed in production: a CCR container started from a checkout up to a week stale. The assembled kernel is the cheap, self-contained mitigation; every live routine's prompt must open with it — assemble via /claude-tweaks:routine, never paste a bare kickoff into the console. |`
- "Skipping `template_version` bumps…" row: extend to cover `kernel_version` ("…and a kernel edit that skips the `kernel_version` bump leaves every routine kernel-stale with nothing reporting it").
- "Sending a prompt with `{{TARGET_BRANCH}}` still in it" — keep as-is (still representable).
- Other rows: revise where they say "preamble"; never silently delete a row.

- [ ] **Step 4: Migrate the seven templates**

For each template: delete the entire `prompt: >` block (preamble + kickoff), add `kickoff: <audited value>` (from Global Constraints' table — re-verify each file's own `Then:` line before deleting it), bump `template_version` by exactly 1. Keep everything else (routine_name, model, allowed_tools, mcp_connections, default_schedule, notes, code-health's `# Optional: focus:` comment block, dispatch's 5-line header comment). Result: each file well under 50 lines.

- [ ] **Step 5: Rewrite `tests/routine-template-schema.test.js`**

Replace the prompt-based assertions with (keep the existing conformance loop's non-prompt assertions — template_version integer, routine_name shape, model, allowed_tools, mcp_connections, default_schedule, FORBIDDEN_KEYS — intact):

```js
// In the per-template conformance loop, replacing the prompt/preamble assertions:
assert.equal(tpl.prompt, undefined, 'templates no longer carry a prompt field — the kernel is assembled at instantiation (#529)');
assert.equal(typeof tpl.kickoff, 'string', 'kickoff is required');
const kickoffFirst = tpl.kickoff.trim().split(/\s+/)[0];
assert.equal(kickoffFirst, skillName, `kickoff's first token must equal the owning skill directory (got '${kickoffFirst}')`);
assert.ok(!/\bBefore anything else\b/.test(fs.readFileSync(tplPath, 'utf8')), 'no template may contain kernel text');
assert.ok(!fs.readFileSync(tplPath, 'utf8').includes('{{TARGET_BRANCH}}'), 'no template may contain the kernel placeholder');

// New top-level tests:
test('the schema declares an integer kernel_version adjacent to the kernel block', () => {
  const schema = fs.readFileSync(path.join(SKILLS_DIR, '_shared', 'routine-template-schema.md'), 'utf8');
  const m = schema.match(/^kernel_version: (\d+)$/m);
  assert.ok(m, 'kernel_version literal line missing');
  assert.ok(Number(m[1]) >= 1);
});

test('the kernel block carries its four parts in order', () => {
  const schema = fs.readFileSync(path.join(SKILLS_DIR, '_shared', 'routine-template-schema.md'), 'utf8');
  const section = schema.split('## Standard prompt kernel')[1];
  assert.ok(section, 'schema must carry a "## Standard prompt kernel" section');
  const block = section.split('```')[1];
  assert.ok(block, 'the kernel section must carry a fenced block');
  const posBranch = block.indexOf('git merge --ff-only');
  const posLadder = block.indexOf('cache-scan-highest-of-N');
  const posFallback = block.indexOf('follow its instructions directly as written');
  const posClosing = block.indexOf('Then: /claude-tweaks:routine-kickoff {kickoff}');
  assert.ok(posBranch > -1 && posLadder > posBranch && posFallback > posLadder && posClosing > posFallback,
    `kernel parts out of order: branch-sync@${posBranch} ladder@${posLadder} fallback@${posFallback} closing@${posClosing}`);
  assert.ok(block.includes('{{TARGET_BRANCH}}'));
  assert.ok(block.includes('If it has diverged rather than just fallen behind, stop'));
  assert.ok(block.includes('claude-tweaks v{version} @ {path} (resolved via:'));
});
```

Keep (adapted) the focus-regression pin: `code-health`'s `tpl.focus === undefined` and `assert.equal(tpl.kickoff, 'code-health', "the parameterless template's kickoff must stay exactly this — no focus= suffix")`.

- [ ] **Step 6: Verify + single atom commit**

Run: `node --test tests/routine-template-schema.test.js tests/routine-template-parser.test.js` — green.
Run: `grep -l "Before anything else" skills/*/routine-template.yml || echo NONE` → NONE; `grep -c "{{TARGET_BRANCH}}" skills/*/routine-template.yml` → 0 each; positive control `grep -c "{{TARGET_BRANCH}}" skills/_shared/routine-template-schema.md` ≥ 1. `wc -l skills/*/routine-template.yml` — all < 50.
Run the FULL suite (`npm test > /tmp/529-taskA.log 2>&1`, grep `# fail` = 0).

```bash
git add skills/_shared/routine-template-schema.md skills/backlog/routine-template.yml skills/code-health/routine-template.yml skills/dispatch/routine-template.yml skills/docs-health/routine-template.yml skills/harness-health/routine-template.yml skills/journey-health/routine-template.yml skills/tidy/routine-template.yml tests/routine-template-schema.test.js
git commit -m "Migrate routine templates to kernel + kickoff — schema, seven templates, rewritten pin test (refs #529)"
```

---

### Task 2: Assembly consumers — create-and-update, guided creation, SKILL.md Input row

**Files:**
- Modify: `skills/routine/create-and-update.md` (Steps 5.5, 6, 7-Customize, 8, 9; UPDATE Steps 2, 4, 7)
- Modify: `skills/routine/guided-environment-creation.md` (~L63-65 `instructions` contract)
- Modify: `skills/routine/SKILL.md` (ONLY the `--branch` Input-table row, ~L42)

**Interfaces:**
- Consumes: Task 1's kernel heading `## Standard prompt kernel`, the `{kickoff}` splice point, and the grep mechanism `grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md`.
- Produces: the new Step 6 assembly definition Task C's fleet RECONCILE cites.

- [ ] **Step 1: create-and-update.md edits** (preserve step numbering; keep quoted load-bearing phrases)

1. Step 5.5 (~L65): "The template's `prompt` carries one placeholder" → "The kernel (`_shared/routine-template-schema.md`'s `## Standard prompt kernel`) carries one branch placeholder".
2. Step 6 (~L95): redefine assembly: "`RESOLVED_PROMPT` is the schema's canonical kernel block with its single `{{TARGET_BRANCH}}` placeholder replaced using Step 5.5's result (table below unchanged), and `{kickoff}` on the closing line replaced with `template.kickoff` — producing `Then: /claude-tweaks:routine-kickoff {template.kickoff}`." Keep the substitution table and the **"Verify no `{{` remains in the assembled content before calling `RemoteTrigger`"** sentence. Fix the stale claim at ~L102: Step 9's record records `kernel_version`, not the prompt.
3. Step 7 Customize (~L119): "re-running Step 6's substitution" wording survives — just ensure it says the kernel assembly, not `template.prompt`.
4. Step 8 (~L123): `instructions = RESOLVED_PROMPT` stays; replace the parenthetical "never raw `template.prompt`, which still holds the `{{TARGET_BRANCH}}` placeholder" with "never the raw kernel text, which still holds the `{{TARGET_BRANCH}}` and `{kickoff}` placeholders".
5. Step 9 (~L129-138): add to the record fields: `kernel_version: <the schema's current kernel_version at assembly time — grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md>` (placed after `template_version`).
6. UPDATE Step 2 (~L158): extend the early-stop comparison: "already in sync" additionally requires the record's `kernel_version` to match the schema's current one — a kernel bump alone is reason to proceed with the update.
7. UPDATE Step 7 (~L186): the record rewrite list adds "the new `kernel_version` (resolved fresh from the schema at assembly time)".

- [ ] **Step 2: guided-environment-creation.md ~L63-65**

Reword the `instructions` contract: the caller's `RESOLVED_PROMPT` is the assembled kernel (branch-substituted, kickoff-spliced per CREATE Step 6); passing raw kernel text creates a routine that tries to check out a branch literally named `{{TARGET_BRANCH}}` — keep that failure description.

- [ ] **Step 3: SKILL.md `--branch` row (~L42)**

"substituted into the prompt's `{{TARGET_BRANCH}}` placeholder" → "substituted into the kernel's `{{TARGET_BRANCH}}` placeholder". Touch nothing else in the file.

- [ ] **Step 4: Verify + commit**

Run: `git grep -n "template.prompt" skills/` → zero hits (positive control: `git grep -c "template.kickoff" skills/routine/create-and-update.md` ≥ 1). `git grep -n "RESOLVED_PROMPT" skills/` → hits only in create-and-update.md, fleet.md, guided-environment-creation.md (unchanged variable name — it survives as the assembly variable by design; record that fact for #530's sweep derivation). Run `node --test tests/routine-template-schema.test.js` (still green) and full `npm test > /tmp/529-taskB.log 2>&1` → 0 fail.

```bash
git add skills/routine/create-and-update.md skills/routine/guided-environment-creation.md skills/routine/SKILL.md
git commit -m "Assemble routine prompts from the kernel — create/update, guided creation, --branch row (refs #529)"
```

---

### Task 3: Dual-drift — fleet, status, record-freshness, parser helper, freshness tests

**Files:**
- Modify: `skills/routine/fleet.md` (~L101 focus-append; ~L104-108 RECONCILE)
- Modify: `skills/routine/status.md` (Step 3 ~L74; Step 1 `--all` template-parse note ~L41)
- Modify: `skills/routine/record-freshness.md` (significant-fields note ~L101)
- Modify: `bin/lib/routine-template-parser.js` (`SIGNIFICANT_FIELDS` + new `kernelFreshness` helper + export)
- Modify: `tests/routine-record-freshness.test.js` (AC5 scenarios)

**Interfaces:**
- Consumes: Task 1's grep mechanism and kernel heading; Task 2's Step 6 assembly definition.
- Produces: `kernelFreshness(recordKernelVersion, currentKernelVersion)` → `'kernel-stale' | 'fresh'` — missing/undefined/NaN or behind → `'kernel-stale'`; equal or ahead → `'fresh'`. Exported from `bin/lib/routine-template-parser.js`.

- [ ] **Step 1: fleet.md**

1. ~L101 (CREATE, rows 1-4): "after computing `RESOLVED_PROMPT` per the template's own substitution table, append `focus=<value>` to the kickoff line" → "append `focus=<value>` to the template's `kickoff` args (single-space join) before Step 6's kernel assembly splices it into the closing line, producing `Then: /claude-tweaks:routine-kickoff code-health focus=dead-code`, etc."
2. ~L104: RECONCILE's re-render cites the new assembly: "re-render `RESOLVED_PROMPT` fresh via CREATE Step 6's kernel assembly (current schema kernel + this run's resolved branch + the row's `kickoff`, with `focus=` appended for rows 1-4)". Keep the byte-comparison rule and IL-89 note verbatim.
3. Add the mass-drift note to RECONCILE: "Immediately after the kernel migration ships, every pre-migration live routine diffs as drifted (old full preamble vs newly assembled kernel) — the intended lazy-migration signal, resolved by the standard `update` path, not an error."

- [ ] **Step 2: status.md dual-drift**

1. Step 1's `--all` template parse (~L41): also read the schema's current `kernel_version` once per run (the documented grep).
2. Step 3 (~L74): after the template_version comparison, add: "Also compare the record's `kernel_version` against the schema's current one (`grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md`), via `kernelFreshness` (`bin/lib/routine-template-parser.js`): report **kernel stale (recorded `kernel_version` N < current M — run `/claude-tweaks:routine update <skill>`)** distinctly from template-field drift; a record with no `kernel_version` reports kernel-stale." Kernel-staleness renders within the **Drifted** verdict's Detail column — never a sixth verdict (the five-verdict set is closed; `skills/init/update-mode.md` enumerates it).

- [ ] **Step 3: record-freshness.md ~L101**

Extend the `fields` row note: "`kernel_version` IS significant (unlike `created_at`) — an update that re-assembles against a newer kernel must read as divergence."

- [ ] **Step 4: parser + tests (TDD)**

Test additions to `tests/routine-record-freshness.test.js` first (run → fail), then implement:

```js
const { kernelFreshness, SIGNIFICANT_FIELDS } = require('../bin/lib/routine-template-parser.js');

test('kernelFreshness: missing kernel_version is kernel-stale', () => {
  assert.equal(kernelFreshness(undefined, 1), 'kernel-stale');
  assert.equal(kernelFreshness(null, 1), 'kernel-stale');
});
test('kernelFreshness: behind the schema literal is kernel-stale', () => {
  assert.equal(kernelFreshness(1, 2), 'kernel-stale');
});
test('kernelFreshness: equal is fresh', () => {
  assert.equal(kernelFreshness(2, 2), 'fresh');
});
test('kernel_version is a significant field for record comparison', () => {
  assert.ok(SIGNIFICANT_FIELDS.includes('kernel_version'));
});
```

Implementation in `bin/lib/routine-template-parser.js`: add `'kernel_version'` to `SIGNIFICANT_FIELDS` (~L196); add and export:

```js
// Kernel staleness verdict for STATUS Step 3's dual-drift check (#529): a record
// with no recorded kernel_version predates the kernel split and always reads stale.
function kernelFreshness(recordKernelVersion, currentKernelVersion) {
  const recorded = Number(recordKernelVersion);
  if (!Number.isFinite(recorded)) return 'kernel-stale';
  return recorded >= Number(currentKernelVersion) ? 'fresh' : 'kernel-stale';
}
```

- [ ] **Step 5: Verify + commit**

Run: `node --test tests/routine-record-freshness.test.js tests/routine-template-parser.test.js tests/routine-template-schema.test.js` — green. Also `node --test tests/routine-fleet-status-off.test.js` (fleet.md pins from #276 must survive). Full `npm test > /tmp/529-taskC.log 2>&1` → 0 fail.

```bash
git add skills/routine/fleet.md skills/routine/status.md skills/routine/record-freshness.md bin/lib/routine-template-parser.js tests/routine-record-freshness.test.js
git commit -m "Track kernel_version dual-drift — fleet reconcile, status, freshness, kernelFreshness helper (refs #529)"
```

---

### Task 4: Landing checks (verification-only; commits only if a check fails and needs a fix)

**Files:** none (read-only checks), unless a failure needs fixing.

- [ ] **Step 1: AC checks**

1. AC2 greps (with positive controls): `grep -l "Before anything else" skills/*/routine-template.yml` → nothing; `grep -c "{{TARGET_BRANCH}}" skills/*/routine-template.yml` → 0 each; `git grep -l "{{TARGET_BRANCH}}" -- skills/` → exactly `skills/_shared/routine-template-schema.md` and `skills/routine/create-and-update.md`.
2. AC3: rewritten schema test asserts kickoff-first-token; `wc -l skills/*/routine-template.yml` all < 50.
3. AC4 dry-run walkthrough: manually assemble `code-health`'s prompt per the new Step 6 (kernel text, `{{TARGET_BRANCH}}` → `` `main` ``, `{kickoff}` → `code-health`): count lines ≤ 55, last line exactly `Then: /claude-tweaks:routine-kickoff code-health`; same for journey-health ending `Then: /claude-tweaks:routine-kickoff journey-health --min-confidence high`. Record both counts in the report.
4. AC6: for each of the seven templates, `git show origin/main:skills/{skill}/routine-template.yml | grep -m1 template_version` vs the working copy — each exactly +1.
5. AC1: `npm test` full-suite green already verified at each commit; re-run once at HEAD if any fix landed.

- [ ] **Step 2: Report** — a table of every check + outcome, in the task report.
