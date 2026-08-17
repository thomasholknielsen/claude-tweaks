# #674 — Staged-Patch Contract (validate at staging, description fallback at the console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every code-fix proposal staged for the Review Console is validated with `git apply --check` when written, carries a normalization description (target file + invariant) inside the same artifact, and both consoles fall back to re-deriving the edit from that description when the literal diff has gone stale.

**Architecture:** One new cross-skill contract file, `skills/_shared/staged-patch.md`, states the artifact format (a `Target:`/`Invariant:`/`Finding:`/`Staged-at:` preamble followed by the unified diff — `git apply` accepts free-text before the first `diff --git` header, empirically probed), the staging-time `git apply --check` gate with its description-only degrade, and the console-side apply-with-fallback procedure. The three existing patch-staging sites (`review/step3-routing.md`, `test/SKILL.md` stage flow, `_shared/multi-agent-coordination.md` reproduction staging) and the two console apply steps (`wrap-up/review-console.md`, `flow/multispec-review-console.md`) cite that file rather than restating it — this repo's "state once, cite everywhere" convention. A Node test pins the single-statement rule and runs the live `git apply --check` discrimination probe (preamble accepted; malformed rejected; stale rejected) so the prose's mechanism is proven, not asserted.

**Tech Stack:** Markdown skill files, `node --test`, `git apply --check`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T221740-spec-674-675/spec-674/work/674-spec.md` (materialized from GitHub issue #674).

## Global Constraints

- Prose only in `skills/**` — no new tooling; `git apply --check` and the existing Edit-based fallback are the only mechanisms (spec Technical Approach).
- Every skill reference inside actionable instruction text uses the fully-qualified `/claude-tweaks:{skill}` form (CLAUDE.md Cross-references).
- Commit messages: `{Verb} {what} — {detail}`, ending with `refs #674` (never `closes`/`fixes` — the PR body carries `Fixes`), plus the `Claude-Session:` trailer.
- `docs/skill-authoring.md` governs any `skills/**/*.md` edit — no `[[wikilinks]]`, prefer describing list sizes by reference, cite `_shared` files by path.
- Work from the shared worktree only: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-674-675`. Verify with `pwd` and `git rev-parse --show-toplevel` before any edit or commit. Never touch the main checkout.
- Do not run the full `npm test` inside a task — run only the named test file(s); the orchestrator runs the full suite after all tasks (CLAUDE.md fix-dispatch convention).

---

### Task 1: The contract file + its discrimination test

**Files:**
- Create: `skills/_shared/staged-patch.md`
- Create: `tests/staged-patch-contract.test.js`

**Interfaces:**
- Produces: the file path `skills/_shared/staged-patch.md` and its three section headings — `## Artifact format`, `## Staging-time gate`, `## Console apply with description fallback` — which Tasks 2 and 3 cite by name. Produces the preamble field names `Target:`, `Invariant:`, `Finding:`, `Staged-at:` used verbatim by every citing site.

- [ ] **Step 1: Write the failing test**

Create `tests/staged-patch-contract.test.js`:

```js
// tests/staged-patch-contract.test.js — pins #674's single-statement rule: the staged-patch
// artifact format, the staging-time `git apply --check` gate, and the console apply-with-
// description-fallback procedure live once in skills/_shared/staged-patch.md, and every
// patch-staging site and console apply step cites it. Also runs the live `git apply --check`
// discrimination probe the contract's prose relies on (preamble accepted; malformed and stale
// rejected) so the mechanism is proven on this machine, not asserted.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILLS = path.join(__dirname, '..', 'skills');
const CONTRACT = path.join(SKILLS, '_shared', 'staged-patch.md');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

test('contract file exists with its three named sections', () => {
  const text = fs.readFileSync(CONTRACT, 'utf8');
  for (const h of ['## Artifact format', '## Staging-time gate', '## Console apply with description fallback']) {
    assert.equal(text.split('\n').filter((l) => l === h).length, 1, `${h} stated exactly once`);
  }
  for (const field of ['Target:', 'Invariant:', 'Finding:', 'Staged-at:']) {
    assert.ok(text.includes(field), `contract names the ${field} preamble field`);
  }
  assert.match(text, /git apply --check/);
});

// Every site that writes a `.patch` under staged/ must cite the contract; the console apply
// steps must cite it too. Anchored on the literal filenames each site already uses.
const STAGING_SITES = [
  ['review', 'step3-routing.md', /staged\/review-\{n\}\.patch/],
  ['test', 'SKILL.md', /staged\/test-fix-\{n\}\.patch/],
  ['_shared', 'multi-agent-coordination.md', /staged\/review-unconfirmed-\{n\}\.patch/],
];
for (const [dir, file, anchor] of STAGING_SITES) {
  test(`${dir}/${file} still stages a .patch and cites _shared/staged-patch.md`, () => {
    const text = read(dir, file);
    assert.match(text, anchor, 'staging site anchor present');
    assert.ok(text.includes('_shared/staged-patch.md'), `${dir}/${file} must cite the contract`);
    assert.match(text, /git apply --check/, `${dir}/${file} must name the staging-time gate`);
  });
}

const CONSOLE_SITES = [
  ['wrap-up', 'review-console.md'],
  ['flow', 'multispec-review-console.md'],
];
for (const [dir, file] of CONSOLE_SITES) {
  test(`${dir}/${file} apply step cites the contract and names the staleness case`, () => {
    const text = read(dir, file);
    assert.ok(text.includes('_shared/staged-patch.md'), `${dir}/${file} must cite the contract`);
    assert.match(text, /stale/i, 'must document the staleness case');
    assert.match(text, /Invariant:/, 'must name the description fallback field');
  });
}

test('the fallback procedure heading is stated once — only in the contract', () => {
  const walk = (dir, acc = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (e.name.endsWith('.md')) acc.push(full);
    }
    return acc;
  };
  for (const file of walk(SKILLS)) {
    if (file === CONTRACT) continue;
    assert.ok(!/^## Console apply with description fallback$/m.test(fs.readFileSync(file, 'utf8')), `${path.relative(SKILLS, file)} restates the fallback heading`);
  }
});

// ---- Live discrimination probe: the mechanism the contract's prose relies on ----
function gitFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-patch-probe-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'probe@example.invalid');
  git('config', 'user.name', 'probe');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'base');
  return { dir, git };
}

const PREAMBLE_PATCH = [
  'Target: a.txt',
  'Invariant: the second line reads "line2-fixed"',
  'Finding: medium correctness — example',
  'Staged-at: 0000000',
  '',
  'diff --git a/a.txt b/a.txt',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,3 @@',
  ' line1',
  '-line2',
  '+line2-fixed',
  ' line3',
  '',
].join('\n');

test('probe: git apply --check accepts a patch carrying the Target:/Invariant: preamble', () => {
  const { dir, git } = gitFixture();
  fs.writeFileSync(path.join(dir, 'p.patch'), PREAMBLE_PATCH);
  const r = git('apply', '--check', 'p.patch');
  assert.equal(r.status, 0, r.stderr);
});

test('probe: git apply --check rejects a malformed hunk and a description-only file (no diff)', () => {
  const { dir, git } = gitFixture();
  fs.writeFileSync(path.join(dir, 'bad.patch'), PREAMBLE_PATCH.replace('@@ -1,3 +1,3 @@', '@@ broken @@'));
  const bad = git('apply', '--check', 'bad.patch');
  assert.notEqual(bad.status, 0, 'malformed hunk must be rejected');
  fs.writeFileSync(path.join(dir, 'nodiff.patch'), 'Target: a.txt\nInvariant: something\n');
  const nodiff = git('apply', '--check', 'nodiff.patch');
  assert.notEqual(nodiff.status, 0, 'description-only file must be rejected as a patch');
  assert.match(nodiff.stderr, /No valid patches in input/);
});

test('probe: a patch staged before the target moved is rejected as stale, distinguishable from malformed', () => {
  const { dir, git } = gitFixture();
  fs.writeFileSync(path.join(dir, 'p.patch'), PREAMBLE_PATCH);
  assert.equal(git('apply', '--check', 'p.patch').status, 0);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line0\nline1\nlineX\nline2\nline3\n');
  git('commit', '-qam', 'restructure');
  const stale = git('apply', '--check', 'p.patch');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /patch does not apply/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: FAIL — `ENOENT` reading `skills/_shared/staged-patch.md` in the first test; the site/console tests fail on the missing citation. The three `probe:` tests PASS already (they exercise git, not the prose) — that is expected and fine.

- [ ] **Step 3: Write the contract file**

Create `skills/_shared/staged-patch.md`:

````markdown
# Staged Patch — validate at staging, describe the invariant, fall back at the console

Canonical contract for every code-fix proposal that a pipeline phase stages under
`.claude-tweaks/pipelines/{run-id}/staged/` as a `.patch` for the Review Console to apply
later. Stated once here; the staging sites (`review/step3-routing.md`'s Auto-mode routing table,
`test/SKILL.md`'s Step 3 stage flow, `_shared/multi-agent-coordination.md`'s reproduction
staging) and the console apply steps (`wrap-up/review-console.md` "On approval",
`flow/multispec-review-console.md` "On approval") cite this file rather than restating it.

## Why

A patch is staged mid-pipeline, in a worktree whose HEAD advances several more times before the
console runs — `/simplify`, polish, `/test` fix waves, later specs in a multi-spec run. Staleness
is therefore structural, not an edge case: the literal diff bytes are the least durable part of
the proposal. Two things went wrong in run 2026-08-16T164927 that this contract closes: a staged
diff was malformed and nobody noticed until `git apply` failed at the console ("No valid patches
in input"), and a well-formed diff went stale because `/simplify` legitimately restructured the
target lines after staging. Both surfaced only at the console, where the one-line fix had to be
re-derived by hand.

## Artifact format

One file per proposal, `staged/{slug}-{n}.patch` (`review-{n}.patch`, `test-fix-{n}.patch`,
`review-unconfirmed-{n}.patch` — each site keeps its existing filename). The file is a unified
diff **preceded by a description preamble** — free text before the first `diff --git` header,
which `git apply` skips (the same tolerance that lets it apply `git format-patch` output):

```
Target: {repo-relative path of the file the fix edits — one line per file when the diff touches several}
Invariant: {one sentence — the property the edit establishes, stated so it can be re-derived without the diff; e.g. "the `rel` assignment normalizes separators to posix before comparison"}
Finding: {severity} {category} — {the finding text as logged}
Staged-at: {short sha of the worktree HEAD at staging time}

diff --git a/{path} b/{path}
--- a/{path}
+++ b/{path}
@@ ... @@
```

`Target:` and `Invariant:` are the durable intent — the console's fallback (below) re-derives the
edit from them alone. `Finding:` ties the artifact back to its `decisions.md` entry. `Staged-at:`
lets the console show what moved (`git diff --stat {Staged-at}..HEAD -- {Target}`) when a diff
has gone stale. The diff is the fast path, never the only path. A multi-spec console applies
patches "against the cumulative pipeline state," so `Target:` must be an explicit repo-relative
path — cumulative drift stays resolvable only when the fallback knows which file to open.

## Staging-time gate

Immediately after composing the file, and before logging it as staged, run — from the worktree,
the same tree the diff was composed against:

```bash
git apply --check "$STAGE_PATH"
```

- **Exit 0** — the artifact is well-formed and applies to the tree it was written against. Keep
  it; write the site's normal `STAGED {time} — … Stage path: staged/{slug}-{n}.patch.` entry.
- **Non-zero** — the diff is malformed (`patch with only garbage`, `No valid patches in input`,
  `corrupt patch`) or already doesn't apply to the tree it was just composed against. **Do not
  keep the `.patch`.** Recompose the diff once from the current tree and re-check. If it fails
  again, delete the `.patch`, write the description alone to `staged/{slug}-{n}.md` (the same
  `Target:`/`Invariant:`/`Finding:`/`Staged-at:` block, no diff), and log the composition error
  where it happened rather than at the console:

  `STAGED {time} — {step}: {finding} — patch failed \`git apply --check\` at staging ({first stderr line}); staged description-only at staged/{slug}-{n}.md. Reversibility: high.`

  The finding is not lost — the console applies a description-only stage through the same
  fallback it uses for a stale diff. Under `auto` this is a log line and a degraded artifact,
  never a mid-flow stop (`_shared/auto-mode-contract.md`).

## Console apply with description fallback

For each staged `.patch` (and each description-only `.md` written by the gate above), in the
order the console lists them:

1. **Fast path** — `git apply --check "$STAGE_PATH"`; on exit 0, `git apply "$STAGE_PATH"` and
   log `AUTO {time} — Review Console apply: staged/{slug}-{n}.patch applied. Reversibility: high (commit).`
2. **Stale diff (expected, not exceptional)** — on a non-zero check (`patch does not apply`,
   `patch failed`), read the preamble's `Target:` and `Invariant:`, open the target file in the
   *current* tree, and establish the invariant with a direct edit — the same Edit-based path the
   console already uses for `.md` proposals. Then re-read the target to confirm the invariant
   holds. Log `AUTO {time} — Review Console apply: staged/{slug}-{n}.patch stale ({first stderr line}; target moved since {Staged-at}: {git diff --stat summary}); re-derived from Invariant via direct edit. Reversibility: high (commit).`
   - If the invariant **already holds** in the current tree (a later phase fixed the same thing),
     make no edit and log `… already satisfied by {commit or phase}; dropped.`
3. **Description-only stage** — no diff to try; go straight to step 2's re-derivation.
4. **Cannot re-derive** — the `Target:` file no longer exists, or the `Invariant:` no longer
   names anything in it (the code the finding was about was removed). Do not guess and do not
   drop silently: leave the item's ledger entry `open`, render it in the console's "Not applied"
   footer with the reason, and log `KEPT-PROMPT {time} — Review Console apply: staged/{slug}-{n}.patch could not be re-derived ({reason}). Surfaced for human decision.`

`--dry-run` consoles (`wrap-up/review-console.md`) print each of these outcomes as a preview line
instead of executing the apply or the edit; the `--check` itself is read-only and still runs.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Staging a diff without `git apply --check` | A malformed diff is first discovered at the console, hours later, by a different reader — the composition error belongs to the phase that composed it |
| Staging only the diff, no `Invariant:` | Later phases legitimately move the target; with no description the console can only error out or hand-derive the fix from the finding text |
| Treating a stale diff as a failure | Staleness is the expected end state of a diff written mid-pipeline; the description is the durable intent, the diff bytes are a cache |
| Silently dropping an item that can't be re-derived | The finding was real when staged; a vanished target is a human decision, not a no-op |
| Restating this procedure at a staging site or console | The two consoles and three staging sites drifted apart once already — cite this file |
````

- [ ] **Step 4: Run test to verify the contract-file test passes**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: `contract file exists with its three named sections` PASS, `the fallback procedure heading is stated once` PASS, three `probe:` tests PASS; the five site/console tests still FAIL (Tasks 2–3 fix those). Report the pass/fail split exactly.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/staged-patch.md tests/staged-patch-contract.test.js
git commit -m "Add staged-patch contract — validate at staging, Invariant preamble, console description fallback (refs #674)

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

### Task 2: Cite the contract at the three staging sites

**Files:**
- Modify: `skills/review/step3-routing.md:79-86` (Auto-mode routing table + a paragraph after it)
- Modify: `skills/test/SKILL.md:179` (Stage flow line)
- Modify: `skills/_shared/multi-agent-coordination.md:70-77` (reproduction staging log block)
- Test: `tests/staged-patch-contract.test.js` (from Task 1 — no new test file)

**Interfaces:**
- Consumes: `skills/_shared/staged-patch.md`'s section names `## Artifact format` and `## Staging-time gate` and the preamble field names.

- [ ] **Step 1: Run the site tests to confirm they fail before editing**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: the three `… still stages a .patch and cites _shared/staged-patch.md` tests FAIL (`must cite the contract`).

- [ ] **Step 2: Edit `skills/review/step3-routing.md`**

In the Auto-mode table (the three rows currently reading `Stage as patch in \`staged/review-{n}.patch\`. Surface at Review Console.` for **High** and **Medium**, and `Stage as patch + \`KEPT-PROMPT\`` for **Critical**), leave the rows as they are, and add this paragraph immediately **after** the line `When \`review-auto-apply-ceiling: none\`: stage everything; never auto-apply.` and before `After routing, append all findings to the ledger as usual …`:

```markdown
**Staging a patch — validate first, describe the invariant.** Every `staged/review-{n}.patch` written by the rows above follows `_shared/staged-patch.md`: the file opens with a `Target:` / `Invariant:` / `Finding:` / `Staged-at:` preamble (the target file plus the one-sentence property the fix establishes — the durable intent) followed by the unified diff, and is validated with `git apply --check` from the worktree **before** the `STAGED` log entry is written. A failing check blocks the `.patch` write and surfaces the composition error here, at staging time, per that file's Staging-time gate — never first at the console. This matters because `/simplify`, polish, and later fix waves legitimately move the target lines between now and the console; the console applies the diff when it still fits and otherwise re-derives the edit from `Invariant:` (that file's Console apply with description fallback), so a stale diff is expected, not an error.
```

- [ ] **Step 3: Edit `skills/test/SKILL.md`**

Replace the single line:

```markdown
**Stage flow:** write the proposed fix to `staged/test-fix-{n}.patch` and log `STAGED {time} — Step 3: {N} {type} failures staged for review. Stage path: staged/test-fix-{n}.patch.`. The test gate fails until the user resolves at the Review Console.
```

with:

```markdown
**Stage flow:** write the proposed fix to `staged/test-fix-{n}.patch` per `_shared/staged-patch.md` — a `Target:` / `Invariant:` / `Finding:` / `Staged-at:` preamble followed by the diff, validated with `git apply --check` from the worktree before logging (a failing check blocks the write and is surfaced here, per that file's Staging-time gate) — and log `STAGED {time} — Step 3: {N} {type} failures staged for review. Stage path: staged/test-fix-{n}.patch.`. The test gate fails until the user resolves at the Review Console, which applies the diff or, when later phases moved the target, re-derives the edit from `Invariant:`.
```

- [ ] **Step 4: Edit `skills/_shared/multi-agent-coordination.md`**

Immediately after the fenced block that ends with the line
`- STAGED {HH:MM:SS} — /review reproduction: finding {path}:{line} surfaced by one agent only. Stage path: staged/review-unconfirmed-{n}.patch.`
(i.e. after its closing ```` ``` ````) and before `### Review Console staging format`, add:

```markdown
`staged/review-unconfirmed-{n}.patch` follows `_shared/staged-patch.md`: `Target:` / `Invariant:` / `Finding:` / `Staged-at:` preamble plus the diff, validated with `git apply --check` from the worktree before the `STAGED` entry above is written — a failing check blocks the write and surfaces the composition error at staging (that file's Staging-time gate), and the console re-derives from `Invariant:` when the diff has gone stale.
```

- [ ] **Step 5: Run the test to verify the site tests pass**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: all three staging-site tests PASS; the two console tests still FAIL (Task 3). Also run `node --test tests/multi-agent-coordination.test.js` — expected PASS (its line 155 sample entry is a decisions.md format probe, unaffected).

- [ ] **Step 6: Commit**

```bash
git add skills/review/step3-routing.md skills/test/SKILL.md skills/_shared/multi-agent-coordination.md
git commit -m "Cite staged-patch contract at the three patch-staging sites — git apply --check gate + Invariant preamble (refs #674)

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

### Task 3: Both consoles' apply steps — cite the fallback, document staleness

**Files:**
- Modify: `skills/wrap-up/review-console.md:338` ("On approval" step 1) and `:352` ("On override" step 2)
- Modify: `skills/flow/multispec-review-console.md:274` ("On approval" step 1)
- Test: `tests/staged-patch-contract.test.js` (from Task 1)

**Interfaces:**
- Consumes: `skills/_shared/staged-patch.md`'s `## Console apply with description fallback` section and the `Invariant:` / `Target:` / `Staged-at:` field names.

- [ ] **Step 1: Run the console tests to confirm they fail before editing**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: the two `… apply step cites the contract and names the staleness case` tests FAIL.

- [ ] **Step 2: Edit `skills/wrap-up/review-console.md` "On approval" step 1 (compact pointer — the file sits within 61 bytes of the 40 KB sub-file ceiling pinned by `tests/console-on-pr.test.js`, so the pointer stays short and the contract file carries the detail, per `docs/donts.md`'s extraction rule)**

Replace:

```markdown
1. Apply all staged patches in `staged/` for items 5–7 (run `git apply` or equivalent for each)
```

with:

```markdown
1. Apply all staged patches in `staged/` for items 5–7 per `_shared/staged-patch.md`: `git apply` while the diff still fits; a stale diff — expected once `/simplify`, polish, or a fix wave moved the target — is re-derived from its `Target:`/`Invariant:` preamble, never dropped silently
```

- [ ] **Step 3: Dedup two verbatim-repeated decline clauses in `skills/wrap-up/review-console.md` "On approval" (byte budget — semantics unchanged; step 7 keeps the full clause)**

In step 8 (the `M#` memory-update step), replace the sentence

```markdown
Skip (Override only) drops the proposal — log the decline to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
```

with

```markdown
Skip (Override only) drops the proposal — log the decline as in step 7.
```

(Only the step-8 occurrence — step 7's identical sentence stays.) In step 9 (the `U#` upstream-feedback step), replace

```markdown
is declined per the shared contract's decline rule — log to `decisions.md` with the user's stated reason, or "declined, no reason given" when none was offered.
```

with

```markdown
is declined per the shared contract's decline rule — log the decline as in step 7.
```

"On override" step 2 stays as it was (`2. For each item: apply, skip (delete from staged/), or modify (re-edit the staged patch then apply)`) — its apply path is step 1's.

- [ ] **Step 4: Edit `skills/flow/multispec-review-console.md` "On approval" step 1 (compact pointer, same ceiling reason) + one dedup**

Replace:

```markdown
1. For each `spec-{N}/staged/` patch: `git apply` (each spec already has its own commit context — patches apply against the cumulative pipeline state)
```

with:

```markdown
1. For each `spec-{N}/staged/` patch, in spec order: apply per `_shared/staged-patch.md` against the cumulative pipeline state — `git apply` while the diff still fits; a stale diff (expected once later specs' phases have run) is re-derived from its `Target:`/`Invariant:` preamble, never dropped silently
```

and in step 3 (the `M#` step) replace the opening

```markdown
3. For each `M#` memory update: Approve all resolves it to `Apply` directly, no prompt; Override prompts per item (above).
```

with

```markdown
3. For each `M#` memory update: same Approve all / Override handling as `Q#`.
```

Byte check after Steps 2–4: `wc -c skills/wrap-up/review-console.md skills/flow/multispec-review-console.md` — both must be ≤ 40960 (expected ≈ 40928 and ≈ 40940).

- [ ] **Step 5: Run the test to verify everything passes**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: all tests PASS (contract, 3 staging sites, 2 consoles, single-statement, 3 probes).
Also run: `node --test tests/console-on-pr.test.js tests/console-execution.test.js tests/pr-first-merge.test.js` — expected PASS (they read the console files; verify the edits didn't disturb a pinned line).

- [ ] **Step 6: Commit**

```bash
git add skills/wrap-up/review-console.md skills/flow/multispec-review-console.md
git commit -m "Route both Review Consoles' patch apply through the staged-patch fallback — stale diff re-derived from Invariant, staleness documented (refs #674)

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

## Self-review

**Spec coverage.** Deliverable 1 (staging site validates with `git apply --check`, failing check blocks the write and surfaces the error; "any other patch-staging site found by grep") → Task 1 §Staging-time gate + Task 2 (three sites: `review/step3-routing.md`, `test/SKILL.md`, `_shared/multi-agent-coordination.md` — the grep over `skills/` for `.patch` staging found exactly these three writers). Deliverable 2 (artifact carries a normalization description — target file plus invariant — and consoles fall back to re-deriving from it) → Task 1 §Artifact format + §Console apply with description fallback; Task 3 cites it at both consoles. Deliverable 3 (both consoles document the staleness case; description is the durable intent) → Task 3 steps 2 and 4 say so in the apply step itself. AC1 (malformed patch rejected at staging, verified by a discrimination test or documented probe) → Task 1's `probe:` tests run `git apply --check` live against malformed / no-diff inputs; the gate prose makes staging call it. AC2 (a target moved after staging still applies via description fallback; `npm test` passes) → the `probe: … stale` test proves the check discriminates stale from malformed; the fallback prose routes stale to re-derivation; full suite is the orchestrator's Common Step 5. Gotcha "staleness is structural" → contract §Why + both console edits. Gotcha "multi-spec cumulative state; fallback must name its target file" → `Target:` required, multispec edit says why.

**Placeholder scan.** No TBD/TODO; every edit step carries the full replacement text; the test file is complete.

**Type consistency.** Field names `Target:` / `Invariant:` / `Finding:` / `Staged-at:` identical across the contract, the three site edits, both console edits, and the test's `PREAMBLE_PATCH` fixture. Section headings `## Artifact format` / `## Staging-time gate` / `## Console apply with description fallback` match between the contract and the test's regexes. Filenames `review-{n}.patch` / `test-fix-{n}.patch` / `review-unconfirmed-{n}.patch` match the test anchors and the existing site text.
