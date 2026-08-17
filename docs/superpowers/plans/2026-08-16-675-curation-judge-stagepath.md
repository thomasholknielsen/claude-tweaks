# #675 — Curation-Judge stagePath Verification + Shadow Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A curation judge that stages a finding must prove the file landed at the **absolute** anchored `stagePath` and echo that path; the controller rejects a relative `stagePath`; and after every judged fan-out the engine routinely sweeps the current worktree's shadow of the run-dir `staged/` path, relocating and logging any stray file.

**Architecture:** Prose hardening in `skills/wrap-up/curation-engine.md` — §3's `stagePath` contract row states the absolute-anchored requirement and the controller's rejection rule; §4 gains (a) the judge self-verification instruction that every dispatch prompt (fan-out or singleton) inlines, and (b) a routine **post-fan-out shadow sweep** with a literal bash snippet, targeting only `staged/` (and a stray shadow `decisions.md`), never `work/`. `skills/flow/multispec-batch-curation.md` — the batch pass where the incident happened — cites the sweep explicitly at its registry-pass step. Both Review Console files are at their 40 KB ceiling and read what the sweep already relocated, so they are not touched. A Node test pins the dispatch-template text (AC1) and runs the documented sweep snippet as a live probe against a fixture worktree shadow (AC2) — the snippet is asserted byte-identical between the doc and the test so the doc *is* what was probed.

**Tech Stack:** Markdown skill files, `node --test`, bash (`test -f`, `mv -n`).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T221740-spec-674-675/spec-675/work/675-spec.md` (materialized from GitHub issue #675).

## Global Constraints

- Prose only in `skills/**`; no new mechanism — reuse `_shared/pipeline-run-dir.md`'s Anchoring section (`$RUN_ROOT` = parent of `git rev-parse --git-common-dir`) for path resolution (spec Technical Approach).
- The sweep targets only `staged/` (and a stray shadow `decisions.md`), **never** `work/` — the materialized `work/` subtree legitimately lives in the worktree (spec Gotchas).
- Do not edit `skills/wrap-up/review-console.md` or `skills/flow/multispec-review-console.md` — both are within ~20 bytes of the 40 KB ceiling pinned by `tests/console-on-pr.test.js`.
- Commit messages: `{Verb} {what} — {detail}`, ending `refs #675` (never closes/fixes), plus the `Claude-Session:` trailer.
- Work only from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-674-675`; verify with `pwd` + `git rev-parse --show-toplevel` before any edit or commit. Run every shell command as one plain command per Bash call.
- Do not run the full `npm test` inside a task — only the named test file(s); the orchestrator runs the full suite afterwards.

---

### Task 1: The test — dispatch-template pins + live sweep probe

**Files:**
- Create: `tests/curation-judge-stagepath.test.js`

**Interfaces:**
- Produces: the exact bash sweep snippet `SWEEP_SNIPPET` that Task 2 must place verbatim inside a ```` ```bash ```` fence in `skills/wrap-up/curation-engine.md` §4 (the test asserts the doc contains it byte-for-byte), and the phrases Task 2 must include: `test -f`, `absolute`, `stagePath`, `re-prompt once`, `unstaged`, `shadow`, `never \`work/\``.

- [ ] **Step 1: Write the failing test**

Create `tests/curation-judge-stagepath.test.js`:

```js
// tests/curation-judge-stagepath.test.js — pins #675: a curation judge that stages a finding
// self-verifies the file at the ABSOLUTE anchored stagePath and echoes that path; a relative
// stagePath is a payload violation the controller rejects; and after every judged fan-out the
// engine sweeps the current worktree's shadow of the run-dir `staged/` path. The sweep snippet
// below is asserted byte-identical to the one in curation-engine.md, then run live against a
// fixture worktree shadow — so the documented procedure is what this probe exercised.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILLS = path.join(__dirname, '..', 'skills');
const ENGINE = fs.readFileSync(path.join(SKILLS, 'wrap-up', 'curation-engine.md'), 'utf8');
const BATCH = fs.readFileSync(path.join(SKILLS, 'flow', 'multispec-batch-curation.md'), 'utf8');

// The documented sweep — must appear verbatim inside a ```bash fence in curation-engine.md §4.
const SWEEP_SNIPPET = [
  'RUN_ROOT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)',
  'REL="${PIPELINE_RUN_DIR#"$RUN_ROOT"/}"           # e.g. .claude-tweaks/pipelines/{run-id}[/spec-{N}]',
  'SHADOW="$WORKTREE/$REL"',
  'if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -d "$SHADOW/staged" ]; then',
  '  for f in "$SHADOW"/staged/*; do',
  '    [ -e "$f" ] || continue',
  '    mv -n "$f" "$PIPELINE_RUN_DIR/staged/" && echo "relocated: $(basename "$f")"',
  '  done',
  '  rmdir "$SHADOW/staged" 2>/dev/null || true',
  'fi',
  'if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -f "$SHADOW/decisions.md" ]; then',
  '  cat "$SHADOW/decisions.md" >> "$PIPELINE_RUN_DIR/decisions.md" && rm "$SHADOW/decisions.md" && echo "relocated: decisions.md (appended)"',
  'fi',
].join('\n');

test('curation-engine.md §4 carries the judge self-verification step and the absolute-stagePath rule', () => {
  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  assert.match(s4, /test -f/, 'judge self-verifies with test -f');
  assert.match(s4, /absolute/, 'names the absolute anchored path');
  assert.match(s4, /stagePath/, 'names the payload field');
  assert.match(s4, /re-prompt once/, 'controller re-prompts once on a relative stagePath');
  assert.match(s4, /unstaged/, 'then treats the finding as unstaged and surfaces it');
});

test('curation-engine.md §3 stagePath row requires the absolute anchored path and names the rejection', () => {
  const row = ENGINE.split('\n').find((l) => l.startsWith('| `findings[].stagePath` |'));
  assert.ok(row, 'stagePath contract row present');
  assert.match(row, /absolute/i);
  assert.match(row, /reject/i);
});

test('curation-engine.md §4 documents the post-fan-out shadow sweep verbatim, scoped to staged/ never work/', () => {
  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  assert.ok(s4.includes('```bash\n' + SWEEP_SNIPPET + '\n```'), 'sweep snippet present byte-for-byte inside a bash fence');
  assert.match(s4, /shadow/i);
  assert.match(s4, /never `work\/`/, 'states the work/ exclusion');
});

test('multispec-batch-curation.md cites the sweep at its registry pass', () => {
  assert.match(BATCH, /shadow sweep/i);
  assert.ok(BATCH.includes('curation-engine.md'), 'cites the engine file that owns the sweep');
});

// ---- Live probe: the documented sweep relocates a stray shadow file and leaves work/ alone ----
test('probe: the documented sweep relocates a staged file written to the worktree shadow and never touches work/', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-probe-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  const main = path.join(root, 'main');
  fs.mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'config', 'user.email', 'probe@example.invalid');
  git(main, 'config', 'user.name', 'probe');
  fs.writeFileSync(path.join(main, 'a.txt'), 'a\n');
  git(main, 'add', 'a.txt');
  git(main, 'commit', '-q', '-m', 'base');
  const wt = path.join(root, 'wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'probe');

  const runRel = '.claude-tweaks/pipelines/2026-01-01T000000-spec-1/spec-1';
  const runDir = path.join(main, runRel);
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# log\n');
  // A judge that resolved the run dir relatively from inside the worktree — the incident shape.
  const shadow = path.join(wt, runRel);
  fs.mkdirSync(path.join(shadow, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(shadow, 'work'), { recursive: true });
  fs.writeFileSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md'), 'proposal\n');
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '- STAGED stray line\n');
  fs.writeFileSync(path.join(shadow, 'work', '1-spec.md'), 'materialized — must stay\n');

  const r = spawnSync('bash', ['-c', SWEEP_SNIPPET], {
    cwd: wt, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: wt },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /relocated: wrap-up-skill-1\.md/);
  assert.match(r.stdout, /relocated: decisions\.md/);
  assert.ok(fs.existsSync(path.join(runDir, 'staged', 'wrap-up-skill-1.md')), 'file now at the anchored path');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged', 'wrap-up-skill-1.md')), 'shadow copy gone');
  assert.ok(!fs.existsSync(path.join(shadow, 'staged')), 'empty shadow staged/ removed');
  assert.match(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), /STAGED stray line/, 'shadow decisions.md appended to the anchored log');
  assert.ok(!fs.existsSync(path.join(shadow, 'decisions.md')), 'shadow decisions.md removed after append');
  assert.ok(fs.existsSync(path.join(shadow, 'work', '1-spec.md')), 'work/ untouched');
});

test('probe: the sweep is a no-op when no shadow exists', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stagepath-probe-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, 'main');
  fs.mkdirSync(main);
  const r0 = spawnSync('git', ['init', '-q'], { cwd: main, encoding: 'utf8', timeout: 30_000 });
  assert.equal(r0.status, 0, r0.stderr);
  const runDir = path.join(main, '.claude-tweaks/pipelines/x/spec-1');
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  const r = spawnSync('bash', ['-c', SWEEP_SNIPPET], { cwd: main, encoding: 'utf8', timeout: 30_000, env: { ...process.env, PIPELINE_RUN_DIR: runDir, WORKTREE: main } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '');
  assert.ok(fs.existsSync(path.join(runDir, 'staged')), 'anchored staged/ survives — the same-path guard stops the sweep from rmdir-ing it');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/curation-judge-stagepath.test.js`
Expected: the four doc-pinning tests FAIL (the phrases/snippet are not in the docs yet); the two `probe:` tests PASS (they exercise the snippet directly). Report the split.

- [ ] **Step 3: Commit the test alone (RED)**

```bash
git add tests/curation-judge-stagepath.test.js
git commit -m "Pin curation-judge stagePath self-verification and the shadow sweep — RED test (refs #675)

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

### Task 2: curation-engine.md — §3 stagePath row, §4 self-verification + shadow sweep

**Files:**
- Modify: `skills/wrap-up/curation-engine.md` (§3 payload-contract table row `findings[].stagePath`; §4 after the singleton paragraph, before "The `record` calls stay in the main thread…")
- Test: `tests/curation-judge-stagepath.test.js` (from Task 1)

**Interfaces:**
- Consumes: `SWEEP_SNIPPET` from Task 1 (verbatim), the pinned phrases.
- Produces: the section text `multispec-batch-curation.md` (Task 3) cites as "`curation-engine.md` §4's post-fan-out shadow sweep".

- [ ] **Step 1: Confirm RED**

Run: `node --test tests/curation-judge-stagepath.test.js` — the three `curation-engine.md` tests FAIL.

- [ ] **Step 2: Edit §3's `stagePath` row**

Replace the table row:

```markdown
| `findings[].stagePath` | staged findings | Path of the `staged/` file holding the proposal. Same rendering caveat. |
```

with:

```markdown
| `findings[].stagePath` | staged findings | The **absolute** anchored path of the `staged/` file holding the proposal — under `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/` per `_shared/pipeline-run-dir.md`'s Anchoring section, exactly as the judge verified it with `test -f` (section 4). A relative value is a contract violation the controller rejects before `record` — see section 4. Same rendering caveat. |
```

- [ ] **Step 3: Insert the self-verification rule and the sweep in §4**

Immediately after the paragraph that ends `…which is what justifies Frontier's premium over Capable's here.` and before the paragraph beginning `The \`record\` calls stay in the main thread regardless of which branch ran`, insert (blank line before and after):

````markdown
**Judge self-verification of `stagePath` (both branches).** A judge that stages a finding runs inside the worktree by necessity — it reads and edits repo files there — so a run-dir path resolved relatively from that cwd lands in the worktree's *shadow* of `.claude-tweaks/pipelines/…`, not in the anchored run directory (`_shared/pipeline-run-dir.md`'s Anchoring section). That is the default failure mode, not agent carelessness, so the guard is structural. Every dispatch prompt — the fan-out and the singleton alike — inlines this instruction verbatim: *after writing a staged file, run `test -f "$ABS_STAGE_PATH"` where `$ABS_STAGE_PATH` is the absolute path under `$PIPELINE_RUN_DIR/staged/` you were given, and echo that absolute path as the finding's `stagePath`; if the test fails, move the file there and re-run it before reporting.* On the controller side, before piping a payload to `record`: a `stagePath` that is not absolute, or does not start with the anchored `$PIPELINE_RUN_DIR`, is a payload violation — re-prompt once (that judge, with the absolute path spelled out); if the second payload still carries a relative or unanchored value, treat the finding as **unstaged**: do not `record` it as `staged`, log `STAGED {time} — {row}: judge returned an unanchored stagePath twice ({value}); finding surfaced unstaged. Reversibility: high.` to `decisions.md`, and surface it in the console's row for that target with the judge's summary so nothing is silently dropped.

**Post-fan-out shadow sweep (routine, after every judged fan-out or singleton).** Independently of what the payloads claim, sweep the current worktree's shadow of the run-dir path for stray staged files and relocate them to the anchored run directory — from the worktree, with `PIPELINE_RUN_DIR` set to the anchored run dir and `WORKTREE` to the worktree root:

```bash
RUN_ROOT=$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)
REL="${PIPELINE_RUN_DIR#"$RUN_ROOT"/}"           # e.g. .claude-tweaks/pipelines/{run-id}[/spec-{N}]
SHADOW="$WORKTREE/$REL"
if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -d "$SHADOW/staged" ]; then
  for f in "$SHADOW"/staged/*; do
    [ -e "$f" ] || continue
    mv -n "$f" "$PIPELINE_RUN_DIR/staged/" && echo "relocated: $(basename "$f")"
  done
  rmdir "$SHADOW/staged" 2>/dev/null || true
fi
if [ "$SHADOW" != "$PIPELINE_RUN_DIR" ] && [ -f "$SHADOW/decisions.md" ]; then
  cat "$SHADOW/decisions.md" >> "$PIPELINE_RUN_DIR/decisions.md" && rm "$SHADOW/decisions.md" && echo "relocated: decisions.md (appended)"
fi
```

The sweep targets `staged/` and a stray shadow `decisions.md` only — never `work/`, whose materialized `{n}-spec.md` legitimately lives in the worktree and reaches the main checkout by merge. Log one line per relocated file to the anchored `decisions.md` — `AUTO {time} — Shadow sweep: relocated staged/{name} from the worktree shadow to the anchored run dir. Reversibility: high.` — and, when a relocated file's name matches a payload's `stagePath` basename, treat that payload's `stagePath` as the anchored path from then on. The same-path guard makes the sweep a no-op when it runs from the main checkout (`$SHADOW` is then the anchored dir itself). `mv -n` never overwrites an anchored file of the same name; a collision stays in the shadow and is logged as `KEPT-PROMPT` for the console. In a multi-spec run the sweep runs once per `spec-{N}/` run dir the fan-out wrote to, plus the parent (`multispec-batch-curation.md`'s registry pass). A no-op sweep writes nothing.
````

- [ ] **Step 4: Run the test**

Run: `node --test tests/curation-judge-stagepath.test.js`
Expected: the three `curation-engine.md` tests now PASS; `multispec-batch-curation.md cites the sweep` still FAILS (Task 3); both probes PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/wrap-up/curation-engine.md
git commit -m "Require curation judges to verify the absolute anchored stagePath and add the routine post-fan-out shadow sweep — refs #675

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

### Task 3: multispec-batch-curation.md — cite the sweep at the registry pass

**Files:**
- Modify: `skills/flow/multispec-batch-curation.md` ("## Batch-scope registry pass" section, after the paragraph beginning `Then the same \`record\` (once per open row) / \`render --section trace\` sequence`)
- Test: `tests/curation-judge-stagepath.test.js`

- [ ] **Step 1: Confirm RED** — `node --test tests/curation-judge-stagepath.test.js`: only `multispec-batch-curation.md cites the sweep at its registry pass` fails.

- [ ] **Step 2: Insert the citation**

After the paragraph that ends `…this holds across the aggregated batch signal set, not per-spec.` insert (blank line before and after):

```markdown
**Shadow sweep after the batch fan-out.** The batch judges run inside the shared worktree, so `curation-engine.md` §4's post-fan-out shadow sweep runs here too — once against the parent run dir and once per `spec-{N}/` subdirectory a judge may have been handed — before this file's `record` calls and before `multispec-review-console.md`'s step 2 reads any `staged/`. A judge that wrote its proposal to the worktree's relative shadow of `.claude-tweaks/pipelines/…/staged/` (observed in run 2026-08-16T164927's Skills judge, which then misreported sibling specs' staged files as dangling) is caught and relocated by that sweep as routine, not by chance inspection; its payload's `stagePath` is required to be the absolute anchored path per `curation-engine.md` §3, verified by the judge with `test -f`.
```

- [ ] **Step 3: Run the test** — `node --test tests/curation-judge-stagepath.test.js`: all 6 PASS. Also `node --test tests/console-on-pr.test.js` — PASS (nothing in the console files changed).

- [ ] **Step 4: Commit**

```bash
git add skills/flow/multispec-batch-curation.md
git commit -m "Cite the post-fan-out shadow sweep at the batch registry pass — the incident site — refs #675

Claude-Session: https://claude.ai/code/session_01X716mnnxff6CEhNR9jYbbY"
```

---

## Self-review

**Spec coverage.** Deliverable 1 (dispatch guidance: judge `test -f`s the absolute anchored path and echoes it as `stagePath`; relative `stagePath` = contract violation → re-prompt once, then unstaged + surfaced) → Task 2 Step 3 first paragraph + Step 2's §3 row. Deliverable 2 (the engine's own post-fan-out pass sweeps the worktree shadow of the run-dir path after every judged fan-out, relocating and logging — routine) → Task 2 Step 3 second paragraph + snippet; batch pass cites it (Task 3). AC1 (dispatch-template text contains the self-verification step and the absolute-stagePath requirement; `npm test` passes) → Task 1's first two tests pin exactly those phrases; suite is the orchestrator's Common Step 5. AC2 (a file deliberately written to the worktree shadow is detected and relocated by the documented sweep, verified by a probe) → Task 1's live probe runs `SWEEP_SNIPPET`, which the third test asserts is byte-identical to the doc's fence. Gotcha (judges run in the worktree → structural guard) → stated in the self-verification paragraph. Gotcha (only `staged/` + decisions.md-adjacent, never `work/`) → snippet + prose + probe asserts `work/` untouched.

**Placeholder scan.** None. Every step carries its literal text.

**Type/text consistency.** `SWEEP_SNIPPET` in Task 1 equals the fenced block in Task 2 Step 3 line-for-line (13 lines; the `REL=` comment spacing is identical). Phrases pinned by the test (`test -f`, `absolute`, `stagePath`, `re-prompt once`, `unstaged`, `shadow`, `never \`work/\``, `shadow sweep`) all appear in the corresponding inserted text. `_shared/pipeline-run-dir.md`'s Anchoring section is cited, not restated (the one-liner `RUN_ROOT=…` is that section's own resolution, quoted).
