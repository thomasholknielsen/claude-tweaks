# Impeccable CLI Contract Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:test`'s Impeccable design gate capable of failing, by upgrading the CLI to a pinned 3.5.0 and replacing `impeccable-cli.md`'s prose contract with one proven by an executed, replayable fixture.

**Architecture:** The gate is broken because the installed CLI (2.1.8) writes findings JSON to stderr while the wrapper reads stdout, so every real finding falls through to a "malformed output" skip. Upgrading to 3.5.0 fixes the stream, but surfaces a second latent bug: the wrapper treats exit 0 as "no findings," which discards advisory-only results. Both are fixed by deriving pass/fail from the `severity` field on parsed stdout and never from the exit code. A committed fixture pair plus a contract test converts the whole thing from prose into something a later phase can replay.

**Tech Stack:** Node 18+, `node:test`, CommonJS (matching `tests/`), `child_process.spawnSync`, Impeccable CLI 3.5.0 from npm.

**Scope:** This is Phase 1 of the four-phase design in `docs/superpowers/specs/2026-08-06-impeccable-upstream-contract-design.md`. Phases 2-4 (drift auditor, dispatch rework, capability integration) get their own plans.

## Global Constraints

- Node 18+ runtime; tests are CommonJS (`'use strict'` + `require`), matching every file in `tests/`.
- No emojis in skill files; use `**(Recommended)**` for emphasis.
- Commit messages: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes.
- Never restate a list's cardinality as a literal in prose (`[IL-40]`). Describe by reference.
- Do not write to `~/.claude-tweaks/` from skill content — harness-owned runtime state.
- A new `bin/lib/{name}/tests/` directory requires its glob in `package.json`'s test script (`[IL-84]`). This plan adds no such directory; its test lives in `tests/`, already globbed as `tests/`.
- Verify `git diff --cached --name-only` immediately before every commit (`[IL-42]`).
- Version number is claimed at ship time with the full pre-check, not reserved by this plan.

## Established facts

Measured 2026-08-06 by executing both CLI versions with streams separated. Do not re-derive these; do verify them if a step's expected output disagrees.

**Installed globally today: 2.1.8.** Its behavior, which is what the gate runs against right now:

| Case | Exit | stdout | stderr |
|---|---|---|---|
| Anti-pattern found | 2 | 0 bytes | JSON array |
| Clean | 0 | `[]` | 0 bytes |

Findings at 2.1.8 carry **no `severity` field**. `--fast` there means "regex-only, skips jsdom, misses linked stylesheets."

**Target 3.5.0**, measured from a sandboxed install:

| Case | Exit | stdout | stderr |
|---|---|---|---|
| Warning finding | 2 | JSON array | empty |
| Clean | 0 | `[]` | empty |
| Any invocation with `--fast` | unchanged | unchanged | `Note: --fast is deprecated and ignored. The full scan is fast now and runs every rule.` |

A 3.5.0 finding object carries: `antipattern`, `name`, `description`, `severity`, **`category`**, `file`, `line`, `snippet`. `category` is new and absent from `impeccable-cli.md`'s field table.

**Advisory path — established from source, not execution.** `cli/engine/cli/main.mjs:432` is `process.exit(primary.length > 0 ? 2 : 0)`, and the comment above line 421 reads: *"The exit code and failure count reflect non-advisory findings only. An advisory-only scan still prints its notes but exits 0 (a clean pass), so advisory rules never break CI or block automation."* So exit 0 with a non-empty stdout array is a normal result. Task 6 tries to pin this with a fixture; Task 4's fix does not depend on Task 6 succeeding.

## File structure

| File | Responsibility |
|---|---|
| `tests/fixtures/impeccable-cli/warning.html` (create) | Minimal input that provokes exactly one `severity: warning` finding |
| `tests/fixtures/impeccable-cli/clean.html` (create) | Minimal input that provokes none |
| `tests/impeccable-cli-contract.test.js` (create) | Replays both fixtures against the pinned CLI and asserts exit code, carrying stream, and field shape. Skips when the CLI is absent or off-pin. |
| `skills/design-wrapper/impeccable-cli.md` (modify) | Invocation, schema, and parsing rules — rewritten against executed behavior |
| `skills/design-wrapper/modes/test.md` (modify) | Consumes the corrected parse |
| `skills/test/design-gate.md` (modify) | Caller-side gate description kept consistent |

---

### Task 1: Upgrade and pin the CLI

**Files:**
- Modify: `skills/design-wrapper/impeccable-cli.md:3`

**Interfaces:**
- Produces: a machine-readable pin line that Phase 2's `tools/upstream-drift/manifest.yml` will read as this dependency's `pinned` value.

- [ ] **Step 1: Record what is installed before changing it**

```bash
npx --no-install impeccable --version
```

Expected: `2.1.8`. If it already prints `3.5.0`, someone upgraded ahead of this plan — skip Step 2 and continue.

- [ ] **Step 2: Upgrade globally**

```bash
npm install -g impeccable@3.5.0
```

- [ ] **Step 3: Verify the upgrade took**

```bash
npx --no-install impeccable --version
```

Expected: `3.5.0` exactly. If npx resolves a different binary than the global one, run `command -v impeccable` and resolve the conflict before continuing — a wrong binary here invalidates every later task.

- [ ] **Step 4: Replace the stale verification stamp**

In `skills/design-wrapper/impeccable-cli.md`, replace line 3:

```markdown
*Last verified against Impeccable CLI 3.2.1 (2026-07-20), verified directly against live output and the installed package source.*
```

with:

```markdown
<!-- upstream-pin: impeccable-cli@3.5.0 -->
*Contract pinned to Impeccable CLI 3.5.0 and proven by `tests/impeccable-cli-contract.test.js`, which replays committed fixtures against the installed binary. A prose re-verification pass is not a substitute for running that test: the 3.2.1 stamp this replaces was written in good faith twice while the machine ran 2.1.8, because nothing ever compared the stamp to what was installed (`[IL-89]`).*
```

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/impeccable-cli.md
git diff --cached --name-only
git commit -m "Pin the Impeccable CLI contract to 3.5.0 — replace an unchecked verification stamp"
```

---

### Task 2: Commit executed fixtures and a replay test

**Files:**
- Create: `tests/fixtures/impeccable-cli/warning.html`
- Create: `tests/fixtures/impeccable-cli/clean.html`
- Create: `tests/impeccable-cli-contract.test.js`

**Interfaces:**
- Consumes: the pinned version from Task 1.
- Produces: `PINNED` (string constant `'3.5.0'`) and the two fixture paths. Phase 2's drift auditor replays this same test as its fixture check.

- [ ] **Step 1: Create the warning fixture**

`tests/fixtures/impeccable-cli/warning.html` — this exact content provoked one `ai-color-palette` finding at `severity: warning` when measured:

```html
<div class="from-purple-500 to-cyan-400 bg-gradient-to-r">
  <h1>Hero</h1>
</div>
```

- [ ] **Step 2: Create the clean fixture**

`tests/fixtures/impeccable-cli/clean.html`:

```html
<div class="p-4"><h1>Hi</h1></div>
```

- [ ] **Step 3: Write the failing test**

`tests/impeccable-cli-contract.test.js`. Note two deliberate choices: `spawnSync` rather than `execFileSync`, because only it returns `status`, `stdout` and `stderr` uniformly for both the exit-0 and exit-2 paths; and `--no-config --no-design-system`, because this repo has a root `DESIGN.md` and could gain an `.impeccable/config.json`, either of which would inject or suppress findings and make the probe non-deterministic across machines. The wrapper itself does **not** pass those flags — project config is the user's escape hatch. This probe tests the CLI contract, not this repo's design compliance.

```js
// tests/impeccable-cli-contract.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');

const PINNED = '3.5.0';
const FIXTURES = path.join(__dirname, 'fixtures', 'impeccable-cli');

function cliVersion() {
  const r = spawnSync('npx', ['--no-install', 'impeccable', '--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim();
}

function detect(fixture) {
  const r = spawnSync(
    'npx',
    ['--no-install', 'impeccable', 'detect', '--json', '--no-config', '--no-design-system',
     path.join(FIXTURES, fixture)],
    { encoding: 'utf8' }
  );
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

const version = cliVersion();
const skip = version === null
  ? 'Impeccable CLI not installed'
  : version !== PINNED
    ? `Impeccable CLI ${version} does not match pinned ${PINNED}`
    : false;

test('a warning finding exits 2 with JSON on stdout and nothing on stderr', { skip }, () => {
  const r = detect('warning.html');
  assert.strictEqual(r.code, 2, 'non-advisory findings must exit 2');
  assert.strictEqual(r.stderr, '', 'findings must not go to stderr (the 2.1.8 bug)');
  const findings = JSON.parse(r.stdout);
  assert.ok(Array.isArray(findings) && findings.length >= 1, 'stdout must carry a non-empty array');
  for (const f of findings) {
    assert.ok(typeof f.severity === 'string', `every finding needs a severity: ${f.antipattern}`);
  }
  assert.ok(findings.some((f) => f.severity === 'warning'), 'fixture must provoke a warning');
});

test('a clean file exits 0 with an empty array on stdout', { skip }, () => {
  const r = detect('clean.html');
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.stderr, '');
  assert.deepStrictEqual(JSON.parse(r.stdout), []);
});

test('every documented field is present on a finding', { skip }, () => {
  const [finding] = JSON.parse(detect('warning.html').stdout);
  for (const key of ['antipattern', 'name', 'description', 'severity', 'category', 'file', 'line', 'snippet']) {
    assert.ok(key in finding, `field '${key}' missing — impeccable-cli.md's schema table is stale`);
  }
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
node --test tests/impeccable-cli-contract.test.js
```

Expected before the fixtures exist: FAIL. If Task 1 was skipped and the CLI is still 2.1.8, the tests report as **skipped**, not passed — confirm the output says `# skipped 3`, since a skip that reads as a pass is the exact failure mode this plan exists to remove (`[IL-78]`).

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test tests/impeccable-cli-contract.test.js
```

Expected: `# pass 3`, `# fail 0`, `# skipped 0`.

- [ ] **Step 6: Prove the test discriminates**

Temporarily change `assert.strictEqual(r.stderr, '')` in the first test to `assert.strictEqual(r.stderr, 'x')` and re-run. Expected: that test FAILS. Revert the change and re-run to confirm it passes again. A contract probe that would pass on any input is worthless, and this is the cheapest way to know it isn't one.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/impeccable-cli/ tests/impeccable-cli-contract.test.js
git diff --cached --name-only
git commit -m "Prove the Impeccable CLI contract by execution — fixtures plus a replay test"
```

---

### Task 3: Rewrite the invocation and schema sections

**Files:**
- Modify: `skills/design-wrapper/impeccable-cli.md:7-48` (Invocation), `:50-79` (schema + field table)

**Interfaces:**
- Consumes: the executed facts recorded in Task 2's test.
- Produces: the corrected invocation string `npx impeccable detect --json <files>` that Task 5's `modes/test.md` must match verbatim.

- [ ] **Step 1: Drop `--fast` from the invocation**

Replace the code block at `impeccable-cli.md:11-13`:

```bash
npx impeccable detect --fast --json <file1> <file2> ... <fileN>
```

with:

```bash
npx impeccable detect --json <file1> <file2> ... <fileN>
```

- [ ] **Step 2: Replace the flag table**

Delete the `--fast` row entirely. The remaining table:

```markdown
| Flag | Why |
|------|-----|
| `detect` | Subcommand — runs the deterministic anti-pattern scanner |
| `--json` | Machine-readable output — required for parsing |
| `<files>` | Space-separated list of files to scan; passed positionally |
```

Then add below it:

```markdown
`--fast` was removed from this invocation. At the pinned 3.5.0 it is deprecated and ignored, and passing it writes `Note: --fast is deprecated and ignored. The full scan is fast now and runs every rule.` to stderr on every call — noise in a stream the parser reads. At 2.1.8 it was not a no-op at all: it forced regex-only scanning and skipped linked stylesheets entirely, which is the degradation CLI 3.5.0's own release notes describe as turning eighteen findings into one.
```

- [ ] **Step 3: Add the missing `category` field to the schema**

In the sample JSON at `impeccable-cli.md:54-66`, add `"category": "slop",` immediately after the `"severity"` line. In the field-reference table, add this row after `severity`:

```markdown
| `category` | string | Yes | Rule grouping (e.g. `slop`). Present since at least 3.5.0; useful for dispatch grouping in place of keyword-matching `description`. |
```

- [ ] **Step 4: Replace the advisory rule-id list**

The `severity` row currently enumerates ten rule ids. That enumeration was wrong at 4.0.2 (thirteen advisory rules), wrong at 4.0.4 (twelve), and named `numbered-section-markers`, which is not a real id — the registry calls it `numbered-section-labels`. Which ids are advisory is upstream's data. Replace the row with:

```markdown
| `severity` | string | Yes | `warning` or `advisory`. Which rule ids carry which severity is upstream's data and is deliberately not enumerated here — read the field off the output. Enumerating it is what drifted this file three times. |
```

- [ ] **Step 5: Sweep the remaining `--fast` occurrences in this file**

Steps 1 and 2 fix two of five. Correcting the first occurrence of a recurring fact and stopping is a known failure here (`[IL-17]`), so fix all three remainders explicitly:

**Line 38** currently reads *"Use the Bash tool's default timeout. The CLI is fast (`--fast` flag); a single invocation..."*. Replace that sentence with:

```markdown
Use the Bash tool's default timeout. A single invocation completes in well under a minute even for large file lists.
```

**Line 44**, the timeout skip's `install_hint`, currently suggests re-running with `--fast`. Replace its value with:

```
"Re-run later or invoke manually with `npx impeccable detect --json <files>`"
```

**Line 113**, under "Sample invocation (canonical)", is a **second** JSON sample that Step 3's schema edit does not reach — Step 3 only touches the block at lines 54-66. Update the command to drop `--fast`, and add `"category": "slop",` after the `"severity"` line in *this* block too, plus in the wrapper-return block below it. Two samples of one schema is itself a restatement; if the second adds nothing, delete it rather than maintaining both.

- [ ] **Step 6: Verify no stale rule ids survive**

```bash
grep -rnE "repeated-section-kickers|numbered-section-markers|single-font" skills/
```

Expected: no output. Those three ids are retired, renamed, or never existed. A hit means an enumeration was missed. (Verified during planning to return exactly one hit — `impeccable-cli.md:75` — on the pre-fix tree, so a silent pass here means the edit landed, not that the grep is inert.)

- [ ] **Step 7: Verify `--fast` is gone from this file except its epitaph**

Count occurrences, not matching lines — `grep -c` counts lines, and Step 2's paragraph mentions `--fast` more than once, so its result would depend on how the paragraph happens to wrap:

```bash
grep -o -- "--fast" skills/design-wrapper/impeccable-cli.md | wc -l
grep -n -- "--fast" skills/design-wrapper/impeccable-cli.md
```

Expected: every remaining occurrence sits inside Step 2's explanatory paragraph, and nowhere else. Read the second command's output and confirm that by eye — the count alone cannot tell you *where* they are, which is the thing that matters. Measured before the fix: 5 occurrences across 5 distinct lines (12, 18, 38, 44, 113).

- [ ] **Step 8: Commit**

```bash
git add skills/design-wrapper/impeccable-cli.md
git diff --cached --name-only
git commit -m "Rewrite the Impeccable CLI schema against executed 3.5.0 output — drop --fast, add category"
```

---

### Task 4: Replace the parsing rules

This is the fix. Tasks 1-3 make it correct; this task makes the gate work.

**Files:**
- Modify: `skills/design-wrapper/impeccable-cli.md:80-108` (severity mapping + parsing rules)

**Interfaces:**
- Produces: the result-derivation rule (`pass` / `fail`) that `modes/test.md` and `skills/test/design-gate.md` both describe in Task 5.

- [ ] **Step 1: Replace the severity-to-result mapping**

```markdown
### Severity-to-result mapping

Derive the result from the **parsed findings**, never from the exit code:

| Findings after parsing stdout | Wrapper result |
|-------------------------------|----------------|
| None (`[]`) | `pass` |
| `advisory` only | `pass` (listed in output, does not block) |
| Any `warning` | `fail` (gate fails, caller blocks pipeline) |
```

- [ ] **Step 2: Replace the defensive parsing rules wholesale**

Replace rules 1-7 with:

```markdown
### Defensive parsing rules

1. **Parse stdout unconditionally.** `--json` writes the findings array to stdout at the pinned version; stderr carries only diagnostics. Never read findings from stderr.
2. **The exit code is not a findings signal.** It reports whether *non-advisory* findings exist (`main.mjs`: `process.exit(primary.length > 0 ? 2 : 0)`), so an advisory-only scan exits **0 with a non-empty array on stdout**. Treating exit 0 as "no findings" silently discards every advisory result. Exit code distinguishes only ran (0 or 2) from crashed (1, a usage error).
3. **Unknown finding fields** → ignore. `category` was added this way.
4. **Top-level JSON is an array** → treat directly as the findings list.
5. **`severity` missing or outside `{warning, advisory}`** → treat the finding as `advisory` for this run, and surface a contract-breach note naming the observed value. Under a pin, an unrecognized severity is not a fact about the project's code; it is evidence the pin was violated, and failing the user's build on that is the wrong axis. Phase 2's drift auditor is what escalates it.
6. **Exit code 1, or stdout that does not parse as JSON** → malformed; return the skip object below.

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI returned malformed output",
  "install_hint": "Verify the pin: `npx impeccable --version` should print 3.5.0"
}
```

Malformed output is a skip, not a fail — same rationale as the availability check.
```

- [ ] **Step 3: Verify the self-contradiction is gone**

The old rule 5 ("exit code 0 → treat as zero findings") contradicted the file's own result rules, which promise advisory findings appear in the list. Confirm no surviving text ties findings to the exit code:

```bash
grep -niE "exit code 0.*zero findings|regardless of stdout" skills/design-wrapper/impeccable-cli.md
```

Expected: no output.

- [ ] **Step 4: Verify the two result statements agree**

```bash
grep -nE "^\*\*Result rules|advisory.*never promote" skills/design-wrapper/impeccable-cli.md
```

Read each hit and confirm it says the same thing as the Step 1 table. The file previously stated its result rules in two places that disagreed (`[IL-65]`); if a second statement still exists, make it a pointer to the table rather than a restatement.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/impeccable-cli.md
git diff --cached --name-only
git commit -m "Derive the design gate result from severity, not exit code — unblocks advisory findings"
```

---

### Task 5: Propagate to the callers

**Files:**
- Modify: `skills/design-wrapper/modes/test.md:32`
- Modify: `skills/design-wrapper/command-map.md:58`
- Modify: `skills/design-wrapper/SKILL.md:47`

**Interfaces:**
- Consumes: Task 3's invocation string and Task 4's result-derivation rule.

**Do not modify `skills/test/design-gate.md`.** It was surveyed during planning and restates nothing — its whole instruction is *"Invoke `/claude-tweaks:design-wrapper test <changed-files>`"*, which is already the delegation this plan is trying to produce everywhere else. Editing it would be churn.

**Two files mention `impeccable detect` and correctly need no change:** `skills/init/bootstrap/step-11-impeccable-design-integration.md:5,29` and `docs/getting-started.md:118` name the binary in descriptive prose without any flags. Naming a dependency is not restating its contract. Leave them.

- [ ] **Step 1: Update the three restatement sites**

All three carry `--fast`. `modes/test.md:32` and `command-map.md:58` are code blocks reading:

```bash
npx impeccable detect --fast --json <files>
```

Replace the body of each with a pointer rather than a corrected duplicate:

```markdown
Invoke the CLI exactly as specified in `impeccable-cli.md` ("Invocation"), and derive `pass` / `fail` from its "Severity-to-result mapping". The flags and the parse are deliberately not restated here — three copies of this contract is what let it drift.
```

`SKILL.md:47` is a table cell reading `Runs \`npx impeccable detect --fast --json\` on the files; returns pass/fail`. Replace with:

```markdown
| `test <files>` | Space-separated file list | Runs the deterministic CLI per `impeccable-cli.md`; returns pass/fail |
```

- [ ] **Step 2: Verify no `--fast` survives in shipped content**

The plan and design docs quote `--fast` while documenting its removal, so they must be excluded or the check can never pass (`[IL-28]`). Anchor the exclusion to the path position, not as a bare substring (`[IL-34]`):

```bash
grep -rn -- "--fast" skills/ docs/ README.md | grep -v "^docs/superpowers/"
```

Expected: exactly one hit — the explanatory paragraph added in Task 3 Step 2. Any other hit is a missed restatement.

- [ ] **Step 3: Verify the invocation now lives in one place**

```bash
grep -rn "impeccable detect --" skills/ docs/ README.md | grep -v "^docs/superpowers/"
```

Expected: only `skills/design-wrapper/impeccable-cli.md`. Hits in `step-11-impeccable-design-integration.md` and `getting-started.md` will not appear — they carry no flags, which is why the pattern requires a trailing `--`.

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: `# fail 0`. Baseline before this plan was 2008 passing. The three new contract tests bring it to 2011 (2012 if Task 6 lands a fourth); a lower total means something was lost.

- [ ] **Step 5: Commit**

```bash
git add skills/design-wrapper/modes/test.md skills/design-wrapper/command-map.md skills/design-wrapper/SKILL.md
git diff --cached --name-only
git commit -m "Point the design-gate callers at the CLI contract — stop restating the invocation"
```

---

### Task 6: Pin the advisory path with a fixture

Separable on purpose: Task 4's fix does not depend on this succeeding, and a reviewer can accept Tasks 1-5 while rejecting this. Attempt it, and if it cannot be done in reasonable time, record the negative result rather than inventing a fixture that does not fire.

**Files:**
- Create: `tests/fixtures/impeccable-cli/advisory.html` (if achievable)
- Modify: `tests/impeccable-cli-contract.test.js`

**Interfaces:**
- Consumes: `detect()` and `skip` from Task 2's test.

- [ ] **Step 1: Read what has already been ruled out**

These four attempts produced zero findings at 3.5.0 during planning. Do not repeat them (`[IL-29]`):

| Attempt | Result |
|---|---|
| HTML, ~370 body chars, 12 em-dashes | `[]`, exit 0 — below the rule's body-text density model |
| HTML, 3900 body chars, 24 em-dashes, 6 numbered section labels | `[]`, exit 0 |
| `.css` with a `blink` keyframe animation on a caret element | `[]`, exit 0 |
| `.tsx` exporting a template literal of em-dash-saturated copy | `[]`, exit 0 |

`em-dash-overuse` documents its trigger as "at least 8 em-dashes (— or --) at a density near one per 500 characters of body text." The second attempt satisfies that arithmetic and still did not fire, so the gap is in how body text is extracted, not in the counts.

- [ ] **Step 2: Read the rule implementation rather than guessing at more fixtures**

```bash
node -e 'const r=require("child_process").execFileSync("npm",["root","-g"],{encoding:"utf8"}).trim();console.log(r)'
```

Then read `<global-root>/impeccable/cli/engine/registry/antipatterns.mjs` for `em-dash-overuse` and `<global-root>/impeccable/cli/engine/engines/regex/detect-text.mjs` for how body text is selected. Write the fixture the implementation actually requires. If reads under a global `node_modules` are denied in this environment, use the sandboxed copy pattern from the planning session: `npm install --prefix <scratch> impeccable@3.5.0` and read there.

- [ ] **Step 3: If a fixture fires, add the decisive test**

```js
test('an advisory-only scan exits 0 with a non-empty array on stdout', { skip }, () => {
  const r = detect('advisory.html');
  const findings = JSON.parse(r.stdout);
  assert.ok(findings.length >= 1, 'fixture must provoke at least one finding');
  assert.ok(findings.every((f) => f.severity === 'advisory'), 'fixture must provoke advisory only');
  assert.strictEqual(r.code, 0, 'advisory-only must exit 0 — this is why exit code cannot gate findings');
});
```

- [ ] **Step 4: Run it**

```bash
node --test tests/impeccable-cli-contract.test.js
```

Expected: `# pass 4`.

- [ ] **Step 5: If no fixture fires, record the negative result**

Add to `impeccable-cli.md` under the parsing rules:

```markdown
**Advisory path — unproven by fixture.** Rule 2's advisory-only case is established from upstream source (`main.mjs`'s `process.exit(primary.length > 0 ? 2 : 0)` and its accompanying comment), not from a replayable fixture: several attempts failed to provoke an advisory-only scan. The parse is written so that being wrong about this is safe — advisory findings are surfaced and never block — but it is not fixture-proven, and a fixture would be a genuine improvement.
```

- [ ] **Step 6: Commit**

```bash
git add tests/ skills/design-wrapper/impeccable-cli.md
git diff --cached --name-only
git commit -m "Pin the Impeccable advisory path — fixture-proven, or the negative result recorded"
```

---

## Self-review

**Spec coverage.** Phase 1 of the design is A1 (upgrade, pin, drop `--fast`, commit executed fixtures) and A2 (parse as assertions: exit code not a findings signal, keep the severity table, delete the rule list, flip the unknown-severity default, delegate the escape hatch). Task 1 covers the upgrade and pin. Task 2 covers the fixtures. Task 3 covers `--fast` and the rule-list deletion. Task 4 covers the exit-code fix, the severity table and the unknown-severity flip. Task 5 propagates. Task 6 covers the one A2 claim not provable by execution during planning. The escape-hatch delegation needs no task: it is the *absence* of wrapper logic, and Task 4 Step 2's rule 5 already routes escalation to Phase 2 rather than to a local mechanism.

**Not in Phase 1, by design:** A3 (dispatch), A4 (context-signals), all of Part B, all of Part C. Task 1's `upstream-pin` comment and Task 2's test are the two hooks Phase 2 consumes.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Task 6 Step 2 names files to read rather than showing code, which is correct — its deliverable is a fixture whose content is not yet knowable, and the plan says so explicitly instead of inventing one.

**Type consistency.** `detect(fixture)` returns `{code, stdout, stderr}` in Task 2 and is called with that shape in Task 6 Step 3. `PINNED`, `FIXTURES` and `skip` are defined in Task 2 and reused, not redefined, in Task 6. The invocation string in Task 3 Step 1 matches the argument array in Task 2's `detect()` except for `--no-config --no-design-system`, which Task 2 Step 3 explains as deliberate probe hermeticity.

**One risk worth naming.** Task 1 upgrades a *global* binary, so it affects every project on this machine, not just claude-tweaks. The design accepts this — the alternative is a repo-local devDependency, which would make `npx impeccable` resolve differently inside and outside the repo and reintroduce exactly the installed-versus-assumed ambiguity this phase exists to remove.
