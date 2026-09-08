# Per-Phase Timing Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pipeline run two mechanical phase-boundary sources — a `verify` event written by the runner itself and a persisted `phases[]` log in `manifest.yml` — plus a pure derivation (`bin/phase-timing.js`) that renders a per-phase Timing table into the Pipeline Summary, the wrap-up summary, the run's PR, and dispatch's report; and stop `subagent-stop.js` grading the parent session's own narration as a subagent reply.

**Architecture:** `verify.js --run <dir>` appends one `verify` event through the existing `appendEvent` after it writes `report.json` (anchoring reuses `stage-item/write.js`'s `resolveTarget`; a shadow path is refused on stderr). `manifest.js`'s `transitionSpec` persists `phase` and appends `{phase, status, at}` to `spec.phases[]`; the hand-rolled YAML parser/serializer learns that one nested list. `bin/lib/timing/derive.js` is a pure function over `{events, manifest, runState, now}` implementing the spec's boundary table; `bin/phase-timing.js` is the thin CLI that reads the run dir, writes `timing.json`, and prints the markdown table. Prose consumers render that output verbatim. `flow/multi-spec.md` is split first (its own 20,480-byte read-budget pin leaves 10 bytes) so the `phases[]` field has somewhere to be documented.

**Tech Stack:** Node 18+ (no deps), `node --test`, markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1928/work/1928-spec.md` (record #1928; the parent design is #1920).

## Global Constraints

- Every `plugin/skills/**/*.md` stays ≤ 40,960 bytes. `plugin/skills/dispatch/SKILL.md` is at **40,948 bytes** — Task 7 trims before it adds. `plugin/skills/flow/multi-spec.md` has its own pin: **< 20,480 bytes** (`tests/run-dir-timestamp-utc.test.js`, "fit the ~20KB read budget") and sits at 20,470 — Task 6 splits it before Task 6 adds one sentence.
- `appendEvent(runDir, type, data, attribution)` spreads derived `ts`/`type` last; never spread parsed external JSON after them. The `verify` event passes no `attribution` (the caller named the run).
- `--run` must refuse a worktree-local shadow path (`[IL-127]`) via `resolveTarget` from `plugin/bin/lib/stage-item/write.js` (`{ok, dir | reason}`), never a re-derived check.
- `skill_invoked` records model-initiated Skill calls only; phases with no event render `unattributed`, never guessed.
- The frozen fixture is anonymized (no session ids, no PR URLs, no real paths) and small.
- Event vocabulary pins: `tests/reflect-friction-lens-vocab.test.js` pins the *friction* event types only (`verify` is not one — no change there); `docs/hooks.md`'s event prose must name `verify`.
- Existing pins on `flow/multi-spec.md` that must keep passing after the split: the `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-spec-{N1}-{N2}-{N3}/` literal (`tests/flow-run-dir-anchoring.test.js`), `bin/preflight-records.js` (`tests/flow-claim-preflight.test.js`), the Execution-section pins (`tests/multispec-boundary-freshness.test.js`, `tests/multi-spec-config-scaffold.test.js`, `tests/test-skill-affected-conformance.test.js`, `tests/multispec-artifact-namespacing-conformance.test.js`, `tests/multispec-not-run-callsite.test.js`, `tests/worktree-adopt-or-create-consolidation.test.js`). Only the **Run directory layout** section moves, and its anchoring paragraph + diagram stay.
- `tests/flow-subfile-table-completeness.test.js` pins `docs/plugin-structure.md`'s flow sub-file row against the directory — the new sub-file must be added to that row.
- `tests/bin-lib/verify/snippet-conformance.test.js` parses `test/verification.md`'s canonical `verify.js` snippet through the real `parseArgs` — `--run "$PIPELINE_RUN_DIR"` must therefore be a flag the parser accepts with any (even empty) value.
- Commit subjects `{Verb} {what} — {detail} (refs #1928)`; `refs`, never `closes`.

## Design decisions locked here

1. **The frozen fixture is synthesized, not copied.** No `#1535` archive exists (`.claude-tweaks/pipelines/archive/` holds no `record-1535`), and every archived dispatched run predates the `verify` event, so none can exercise the `tasks`→`test` boundary. `tests/fixtures/timing/record-1535/{events.jsonl,manifest.yml}` is hand-authored with the real event shapes (`appendEvent`'s `{…data, ts, type}` layout, the `skill_invoked`/`commit`/`verify`/`session-end` types) and timestamps chosen to reproduce the record's reference boundaries: call-1 span 25 min, call-2 exclusive (preflight) 24 min, review 8, wrap-up 15. The spec's own Gotcha re-baselines AC3 to "whichever fixture is actually checked in"; the numbers below are that baseline.
2. **`minutes` is the span, `ownMinutes` is the exclusive time.** Every phase row carries both. `call-1`/`call-2` and `build` are containers: their `ownMinutes` is span minus the nested phases (`build` − `plan` − `tasks`; a call − every top-level phase inside it). `totals.minutes` sums `ownMinutes` over all phases — each minute counted once (spec Gotcha 2). The markdown `Minutes` cell prints `minutes`, with ` (own N)` appended when the two differ.
3. **A phase's end is the earliest of** the next top-level `claude-tweaks:*` `skill_invoked`, the `merge` phase's start (the first `commit` `action: push` after wrap-up's start), and the run's terminal event (`session-end`, or a `close-run`/`worktree-reaped` event, or `now`). Without the merge clip, wrap-up and merge would overlap.
4. **`journeys` joins the nested-skill parent map** alongside the spec's eight (`simplify`, `reflect`, `visual-review`, `capture`, `design-wrapper`, `challenge`, `assess-agent-autonomy`, `ledger`) — `/claude-tweaks:journeys` fires inside build's Common Step 6 on every run, and the spec's "un-mapped ⇒ new top-level phase" rule would otherwise mint a spurious `journeys` phase on every fixture.
5. **`verify.js --run ""` is "no run".** The canonical `verification.md` snippet must be one plain command (`snippet-conformance` forbids `;`/`&&`), so it carries `--run "$PIPELINE_RUN_DIR"` unconditionally; an unset variable arrives as the empty string and the runner treats it exactly like an absent flag. `--run` with `--stamp-status` or `--changed-files` is a usage error.
6. **`phase-timing.js` treats a missing `events.jsonl` as an empty event list** (every phase `unattributed`, exit 0); a *present but unreadable* file is the malformed-invocation exit 2 the spec names. Reading is harmless, so `--run` is not anchoring-checked here — anchoring guards writers, and `timing.json` is written next to the events it was derived from.
7. **The `multi-spec.md` split moves the Run directory layout section's tail** — the slug-prefix paragraph, the per-spec `config.yml` paragraph, and the `manifest.yml` description with its YAML example — into `plugin/skills/flow/multispec-run-dir-layout.md`. The anchoring paragraph and the tree diagram stay (they carry the `$RUN_ROOT` pin and the per-spec scaffolding note). The `phases[]` sentence lands in the new sub-file.
8. **Seven tasks, each its own review surface:** manifest, verify event, derivation + fixture, CLI, subagent-stop, the split, prose + conformance test.

## Boundary table (normative for Task 3)

| Phase | Start | End (subject to decision 3) |
|---|---|---|
| `call-1` / `call-2` | 1st / 2nd `skill_invoked` `claude-tweaks:flow` | next call's start, else terminal |
| `build` | `skill_invoked` `claude-tweaks:build` | next top-level `claude-tweaks:*` event |
| `plan` (in build) | `skill_invoked` `superpowers:writing-plans` | `skill_invoked` `superpowers:subagent-driven-development` |
| `tasks` (in build) | `skill_invoked` `superpowers:subagent-driven-development` | first `verify` event after it |
| `test` / `review` / `wrap-up` | their `skill_invoked` | next top-level `claude-tweaks:*` event |
| `polish` | last `skill_invoked` `claude-tweaks:design-wrapper` strictly after review's own first `design-wrapper` event and before wrap-up's start | wrap-up's start; none ⇒ 0 min, `unattributed`, start = end = wrap-up's start |
| `verify` sub-rows | each `verify` event | — |
| `merge` | first `commit` with `action: push` after wrap-up's start | `runState.pr.mergedAt` when present, else a `commit` with `action: merge`, else terminal |

Top-level `claude-tweaks:*` skills: any `claude-tweaks:{name}` whose `{name}` is not in the parent map. `superpowers:*` events other than the two above are ignored.

---

### Task 1: Persist `phase` and `phases[]` in `manifest.js`

**Files:**
- Modify: `plugin/bin/lib/flow/manifest.js:33-78` (parser + serializer), `:130-165` (`transitionSpec`)
- Test: `tests/bin-lib/flow/manifest.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `spec.phase` (string, latest) and `spec.phases: [{phase, status, at}]` (append-only) on every `transitionSpec` call; `parseManifestYaml`/`serializeManifestYaml` round-trip both. Task 3 reads `manifest.multispec.specs[].phases`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/flow/manifest.test.js` (reuse its `tmpRunDir()` and `LIVE_MANIFEST`; the file writes a manifest with `writeManifest(runDir, parseManifestYaml(LIVE_MANIFEST))` in its existing transition tests — copy that setup):

```js
// #1928 AC2: every transition persists the phase and appends to phases[].
test('#1928: transitionSpec persists phase and appends {phase, status, at} to phases[]', () => {
  const runDir = tmpRunDir();
  writeManifest(runDir, parseManifestYaml(LIVE_MANIFEST));
  const t1 = transitionSpec({ runDir, specId: 690, status: 'running', phase: 'build', now: '2026-09-06T10:00:00.000Z' });
  assert.equal(t1.ok, true);
  const t2 = transitionSpec({ runDir, specId: 690, status: 'complete', phase: 'wrap-up', now: '2026-09-06T11:30:00.000Z' });
  assert.equal(t2.ok, true);
  const spec = readManifest(runDir).multispec.specs.find((s) => String(s.id) === '690');
  assert.equal(spec.phase, 'wrap-up');
  assert.deepEqual(spec.phases, [
    { phase: 'build', status: 'running', at: '2026-09-06T10:00:00.000Z' },
    { phase: 'wrap-up', status: 'complete', at: '2026-09-06T11:30:00.000Z' },
  ]);
});

test('#1928: phases[] round-trips through serialize → parse byte-for-byte', () => {
  const m = parseManifestYaml(LIVE_MANIFEST);
  const spec = m.multispec.specs[0];
  spec.phase = 'review';
  spec.phases = [
    { phase: 'build', status: 'running', at: '2026-09-06T10:00:00.000Z' },
    { phase: 'review', status: 'running', at: '2026-09-06T10:40:00.000Z' },
  ];
  const text = serializeManifestYaml(m);
  assert.deepEqual(parseManifestYaml(text), m);
  assert.equal(serializeManifestYaml(parseManifestYaml(text)), text);
});

test('#1928: a manifest without phases[] still round-trips unchanged', () => {
  const m = parseManifestYaml(LIVE_MANIFEST);
  assert.equal(serializeManifestYaml(m), LIVE_MANIFEST.endsWith('\n') ? LIVE_MANIFEST : LIVE_MANIFEST + '\n');
});
```

If the third test's expected text differs only by a trailing newline from what the file's existing round-trip test already asserts, keep the existing assertion's form and drop this third test — it must not duplicate a pin.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/flow/manifest"); const t=m.serializeManifestYaml({multispec:{parent:"p/",specs:[{id:1,status:"running",phase:"build",phases:[{phase:"build",status:"running",at:"2026-09-06T10:00:00.000Z"}]}]}}); process.exit(t.includes("phases:") ? 0 : 1)'`
Expected: FAIL — exit code 1 (the serializer emits no `phases:` line today). Then `node --test tests/bin-lib/flow/manifest.test.js` must also show the three new tests red (`spec.phase` is `undefined`).

- [ ] **Step 3: Implement**

In `parseManifestYaml`, inside the `for` loop and **before** the existing `fieldMatch` branch, add the nested-list handling (a `phases:` line has no value after the colon, so today's `^ {6}(\w+): (.*)$` never matches it):

```js
    const phasesHeader = raw.match(/^ {6}phases:\s*$/);
    if (phasesHeader && current) {
      current.phases = [];
      continue;
    }
    const phaseItem = raw.match(/^ {8}- phase: (.+)$/);
    if (phaseItem && current && Array.isArray(current.phases)) {
      current.phases.push({ phase: phaseItem[1].trim() });
      continue;
    }
    const phaseField = raw.match(/^ {10}(\w+): (.*)$/);
    if (phaseField && current && Array.isArray(current.phases) && current.phases.length) {
      current.phases[current.phases.length - 1][phaseField[1]] = phaseField[2].trim();
      continue;
    }
```

In `serializeManifestYaml`, after the `startedAt` line inside the per-spec loop:

```js
    if (spec.phase) lines.push(`      phase: ${spec.phase}`);
    if (Array.isArray(spec.phases) && spec.phases.length) {
      lines.push('      phases:');
      for (const p of spec.phases) {
        lines.push(`        - phase: ${p.phase}`);
        lines.push(`          status: ${p.status}`);
        lines.push(`          at: ${p.at}`);
      }
    }
```

In `transitionSpec`, immediately after `spec.status = status;`:

```js
  // #1928: persist the phase and log the transition — the timing derivation
  // (bin/lib/timing/derive.js) reads phases[] as the manifest-side boundary
  // source. Append-only: a re-entered phase adds another entry.
  spec.phase = phase;
  if (!Array.isArray(spec.phases)) spec.phases = [];
  spec.phases.push({ phase, status, at: nowIso });
```

Update the header comment above `transitionSpec` (`// { runDir, specId, status, phase, now? } ->`) to say `phase` is persisted as `spec.phase` and appended to `spec.phases[]`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/flow/manifest.test.js tests/bin-lib/flow/preflight.test.js tests/bin-lib/flow/preflight-cli.test.js`
Expected: PASS, including every pre-existing manifest test (the `LIVE_MANIFEST` round-trip must still be byte-identical — no `phase:` line is emitted when `spec.phase` is unset).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/flow/manifest.js tests/bin-lib/flow/manifest.test.js
git commit -m "Persist phase and phases[] on every spec-status transition — manifest.yml round-trips the log (refs #1928)"
```

---

### Task 2: `verify.js --run <dir>` appends a `verify` event

**Files:**
- Modify: `plugin/bin/lib/verify/args.js:14-90` (`VALUE_FLAGS`, `parseArgs`, `USAGE`), `plugin/bin/verify.js:15-32` (requires), `:377-382` (after `writeJsonAtomic(jsonPath, report)`)
- Test: `tests/bin-lib/verify/args.test.js`, `tests/bin-lib/verify/cli.test.js`

**Interfaces:**
- Consumes: `resolveTarget({ runDir })` from `plugin/bin/lib/stage-item/write.js` → `{ok: true, dir} | {ok: false, reason: 'missing'|'not-anchored'}`; `appendEvent(runDir, type, data)` from `plugin/bin/lib/hooks/context.js`.
- Produces: one `events.jsonl` line `{mode, suitesRun, durationMs, pass, sha, flakyRetried, reportPath, ts, type: 'verify'}`; `parseArgs(...).run` (string or `null`). Task 3's fixture and derivation read `type: 'verify'` with `mode`, `suitesRun`, `durationMs`, `pass`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/verify/args.test.js`:

```js
test('#1928: --run is parsed as a value flag and defaults to null', () => {
  assert.strictEqual(parseArgs(['--cmd', 'tests=node -e 0']).run, null);
  assert.strictEqual(parseArgs(['--run', '/tmp/run-x', '--cmd', 'tests=node -e 0']).run, '/tmp/run-x');
  assert.strictEqual(parseArgs(['--run', '', '--cmd', 'tests=node -e 0']).run, '');
});

test('#1928: --run is a usage error with --stamp-status or --changed-files', () => {
  assert.throws(() => parseArgs(['--stamp-status', '--run', '/tmp/run-x']), UsageError);
  assert.throws(() => parseArgs(['--changed-files', '--run', '/tmp/run-x']), UsageError);
});
```

Append to `tests/bin-lib/verify/cli.test.js` (reuse `tmpDir`, `tmpGitRepo`, `runCli`):

```js
// #1928 AC1: the runner is the mechanical source of the verify event.
function anchoredRunDir(repo) {
  const dir = path.join(repo, '.claude-tweaks', 'pipelines', '2026-09-06T100000-record-7');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('#1928 AC1: --run appends exactly one verify event with the report fields', async () => {
  const { repo } = tmpGitRepo();
  const runDir = anchoredRunDir(repo);
  const { code, stderr } = await runCli(['--run', runDir, '--no-stamp', '--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0, stderr);
  const lines = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const ev = JSON.parse(lines[0]);
  assert.strictEqual(ev.type, 'verify');
  assert.strictEqual(ev.pass, true);
  assert.strictEqual(typeof ev.durationMs, 'number');
  assert.strictEqual(ev.mode, 'full');
  assert.deepStrictEqual(ev.suitesRun, ['tests']);
  assert.match(ev.sha, /^[0-9a-f]{40}$/);
  assert.deepStrictEqual(ev.flakyRetried, []);
  assert.ok(ev.reportPath.endsWith('report.json'));
  assert.strictEqual(typeof ev.ts, 'string');
  assert.strictEqual('attribution' in ev, false);
});

test('#1928 AC1: without --run (or with --run "") the events file is untouched', async () => {
  const { repo } = tmpGitRepo();
  const runDir = anchoredRunDir(repo);
  await runCli(['--no-stamp', '--cmd', 'tests=node -e 0'], { cwd: repo });
  await runCli(['--run', '', '--no-stamp', '--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(fs.existsSync(path.join(runDir, 'events.jsonl')), false);
});

test('#1928 AC1: a run dir outside the main checkout is refused on stderr and nothing is appended', async () => {
  const { repo } = tmpGitRepo();
  const foreign = tmpDir(); // no git root above it → not anchored
  const { code, stderr } = await runCli(['--run', foreign, '--no-stamp', '--cmd', 'tests=node -e 0'], { cwd: repo });
  assert.strictEqual(code, 0, 'a refused --run never fails the verification run itself');
  assert.match(stderr, /--run .* refused/);
  assert.strictEqual(fs.existsSync(path.join(foreign, 'events.jsonl')), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const {parseArgs}=require("./plugin/bin/lib/verify/args"); try { parseArgs(["--run","/tmp/x","--cmd","tests=node -e 0"]); process.exit(0); } catch (e) { process.exit(1); }'`
Expected: FAIL — exit code 1 (`--run` is an unknown flag today, so `parseArgs` throws). Then `node --test tests/bin-lib/verify/args.test.js tests/bin-lib/verify/cli.test.js` must show the five new tests red.

- [ ] **Step 3: Implement `args.js`**

Add `'--run'` to `VALUE_FLAGS`; add `let run = null;` beside the other locals; inside the value-flag branch add `if (flag === '--run') { run = value; continue; }`; after the loop (next to the `--base`/`--integration-branch` check) add:

```js
  if (run !== null && (stampStatus || changedFiles)) {
    throw new UsageError('--run applies to a check run — not to --stamp-status or --changed-files');
  }
```

Add `run` to the returned object, and `[--run <dir>]` to the first `USAGE` line (after `[--git-dir <dir>]`).

- [ ] **Step 4: Implement `verify.js`**

Add the two requires beside the existing ones:

```js
const { resolveTarget } = require('./lib/stage-item/write');
const { appendEvent } = require('./lib/hooks/context');
```

Immediately after `writeJsonAtomic(jsonPath, report);` (line ~382):

```js
  // Verify event (#1928): the runner is the mechanical source for the
  // tasks→test phase boundary (bin/lib/timing/derive.js). Written only when
  // the caller named a run dir; the canonical skill snippet passes
  // --run "$PIPELINE_RUN_DIR" unconditionally, so an unset variable arrives
  // as "" and means "no run". A path that is not anchored under the main
  // checkout's pipelines tree (a worktree-local shadow, [IL-127]) is refused
  // aloud — never written silently, never fatal to the run.
  if (parsed.run) {
    const target = resolveTarget({ runDir: parsed.run });
    if (!target.ok) {
      process.stderr.write(`verify.js: --run ${parsed.run} refused (${target.reason}) — not an anchored run directory under the main checkout ([IL-127]); no verify event written\n`);
    } else {
      appendEvent(target.dir, 'verify', {
        mode: report.scope ? report.scope.mode : 'full',
        suitesRun: report.scope ? (report.scope.suites || []) : results.map((c) => c.name),
        durationMs: report.durationMs,
        pass: report.pass,
        sha: git.sha,
        flakyRetried: results.filter((c) => Array.isArray(c.flakyRetried) && c.flakyRetried.length).map((c) => c.name),
        reportPath: jsonPath,
      });
    }
  }
```

`results` is the array passed to `composeReport` as `checks`; each entry carries the `--cmd` name in `name` (confirm in `plugin/bin/lib/verify/run.js` — if the field is named differently, use that field; do not add a new one).

- [ ] **Step 5: Run the tests**

Run: `node --test tests/bin-lib/verify/args.test.js tests/bin-lib/verify/cli.test.js tests/bin-lib/verify/snippet-conformance.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/verify/args.js plugin/bin/verify.js tests/bin-lib/verify/args.test.js tests/bin-lib/verify/cli.test.js
git commit -m "Append a verify event from the runner under --run — anchored run dirs only, refused aloud otherwise (refs #1928)"
```

---

### Task 3: `bin/lib/timing/derive.js` + the frozen fixture

**Files:**
- Create: `plugin/bin/lib/timing/derive.js`, `tests/fixtures/timing/record-1535/events.jsonl`, `tests/fixtures/timing/record-1535/manifest.yml`
- Test: `tests/bin-lib/timing/derive.test.js`

**Interfaces:**
- Consumes: event lines as `appendEvent` writes them (`{…data, ts, type}`), `manifest.multispec.specs[].phases` from Task 1, `verify` events from Task 2.
- Produces: `derivePhases({ events, manifest = null, runState = null, now = new Date() })` → `{ phases: [...], totals: { minutes, verifyRuns, verifyModes } }` where each phase is `{ phase, start, end, minutes, ownMinutes, source, verify: [{ mode, suitesRun, durationMs, pass, at }] }`; `PHASES` (the canonical ten-name array) and `NESTED_PARENT` (the parent map) are exported. Task 4 wraps it.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/timing/record-1535/events.jsonl` — exactly these lines, in this order (synthetic, anonymized; see decision 1):

```
{"skill":"claude-tweaks:flow","ts":"2026-09-05T13:00:00.000Z","type":"skill_invoked"}
{"skill":"claude-tweaks:build","ts":"2026-09-05T13:01:00.000Z","type":"skill_invoked"}
{"skill":"superpowers:writing-plans","ts":"2026-09-05T13:02:00.000Z","type":"skill_invoked"}
{"skill":"superpowers:subagent-driven-development","ts":"2026-09-05T13:08:00.000Z","type":"skill_invoked"}
{"action":"commit","ts":"2026-09-05T13:11:00.000Z","type":"commit"}
{"action":"commit","ts":"2026-09-05T13:15:00.000Z","type":"commit"}
{"action":"commit","ts":"2026-09-05T13:19:00.000Z","type":"commit"}
{"skill":"claude-tweaks:simplify","ts":"2026-09-05T13:21:00.000Z","type":"skill_invoked"}
{"mode":"scoped","suitesRun":["tests"],"durationMs":95000,"pass":true,"sha":"0000000000000000000000000000000000000001","flakyRetried":[],"reportPath":"report.json","ts":"2026-09-05T13:22:00.000Z","type":"verify"}
{"skill":"claude-tweaks:journeys","ts":"2026-09-05T13:22:30.000Z","type":"skill_invoked"}
{"action":"push","ts":"2026-09-05T13:22:50.000Z","type":"commit"}
{"skill":"claude-tweaks:test","ts":"2026-09-05T13:23:00.000Z","type":"skill_invoked"}
{"mode":"full","suitesRun":["types","lint","tests"],"durationMs":210000,"pass":true,"sha":"0000000000000000000000000000000000000001","flakyRetried":[],"reportPath":"report.json","ts":"2026-09-05T13:23:30.000Z","type":"verify"}
{"action":"push","ts":"2026-09-05T13:24:30.000Z","type":"commit"}
{"skill":"claude-tweaks:flow","ts":"2026-09-05T13:25:00.000Z","type":"skill_invoked"}
{"skill":"claude-tweaks:review","ts":"2026-09-05T13:49:00.000Z","type":"skill_invoked"}
{"skill":"claude-tweaks:design-wrapper","ts":"2026-09-05T13:52:00.000Z","type":"skill_invoked"}
{"skill":"claude-tweaks:wrap-up","ts":"2026-09-05T13:57:00.000Z","type":"skill_invoked"}
{"skill":"claude-tweaks:reflect","ts":"2026-09-05T13:58:00.000Z","type":"skill_invoked"}
{"action":"commit","ts":"2026-09-05T14:05:00.000Z","type":"commit"}
{"action":"commit","ts":"2026-09-05T14:10:00.000Z","type":"commit"}
{"action":"push","ts":"2026-09-05T14:12:00.000Z","type":"commit"}
{"ts":"2026-09-05T14:13:00.000Z","type":"session-end"}
```

`tests/fixtures/timing/record-1535/manifest.yml`:

```yaml
multispec:
  parent: .claude-tweaks/pipelines/2026-09-05T130000-spec-1535/
  specs:
    - id: 1535
      status: complete
      subdir: spec-1535/
      startedAt: 2026-09-05T13:01:00.000Z
      phase: wrap-up
      phases:
        - phase: build
          status: running
          at: 2026-09-05T13:01:00.000Z
        - phase: wrap-up
          status: complete
          at: 2026-09-05T14:12:00.000Z
```

Reference numbers this fixture encodes (the AC3 baseline): `call-1` 25 (span 13:00→13:25), `call-2` span 48 / own 24 (13:25→13:49 preflight), `build` span 22 / own 2, `plan` 6, `tasks` 14, `test` 2, `review` 8, `polish` 0, `wrap-up` 15 (13:57→14:12, clipped by merge), `merge` 1, `totals.minutes` = 24 + 1 (call-1 own: 25 − 22 − 2) + 2 + 6 + 14 + 2 + 8 + 0 + 15 + 1 = 73, `verifyRuns` 2, `verifyModes` `['scoped', 'full']`.

- [ ] **Step 2: Write the failing test**

`tests/bin-lib/timing/derive.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { derivePhases, PHASES, NESTED_PARENT } = require('../../../plugin/bin/lib/timing/derive');
const { parseManifestYaml } = require('../../../plugin/bin/lib/flow/manifest');

const FIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'record-1535');
function fixtureEvents() {
  return fs.readFileSync(path.join(FIX, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}
function fixtureManifest() {
  return parseManifestYaml(fs.readFileSync(path.join(FIX, 'manifest.yml'), 'utf8'));
}
const byName = (out) => Object.fromEntries(out.phases.map((p) => [p.phase, p]));

test('#1928 AC3: the frozen fixture reproduces the reference boundaries within ±1 minute', () => {
  const out = derivePhases({ events: fixtureEvents(), manifest: fixtureManifest(), now: new Date('2026-09-05T14:13:00.000Z') });
  assert.deepEqual(out.phases.map((p) => p.phase), PHASES);
  const p = byName(out);
  const near = (a, b) => Math.abs(a - b) <= 1;
  assert.ok(near(p['call-1'].minutes, 25), `call-1 ${p['call-1'].minutes}`);
  assert.ok(near(p['call-2'].ownMinutes, 24), `call-2 own ${p['call-2'].ownMinutes}`);
  assert.ok(near(p.plan.minutes, 6));
  assert.ok(near(p.tasks.minutes, 14));
  assert.ok(near(p.build.ownMinutes, 2));
  assert.ok(near(p.test.minutes, 2));
  assert.ok(near(p.review.minutes, 8));
  assert.equal(p.polish.minutes, 0);
  assert.equal(p.polish.source, 'unattributed');
  assert.equal(p.polish.start, p['wrap-up'].start);
  assert.ok(near(p['wrap-up'].minutes, 15), `wrap-up ${p['wrap-up'].minutes}`);
  assert.ok(near(p.merge.minutes, 1));
  assert.equal(p.tasks.verify.length, 1);
  assert.equal(p.tasks.verify[0].mode, 'scoped');
  assert.equal(p.test.verify.length, 1);
  assert.equal(p.test.verify[0].mode, 'full');
  assert.equal(out.totals.verifyRuns, 2);
  assert.deepEqual(out.totals.verifyModes, ['scoped', 'full']);
  assert.ok(near(out.totals.minutes, 73), `totals ${out.totals.minutes}`);
});

test('#1928: sources are labelled by the boundary that produced them', () => {
  const p = byName(derivePhases({ events: fixtureEvents(), manifest: fixtureManifest() }));
  assert.equal(p['call-1'].source, 'skill_invoked');
  assert.equal(p.tasks.source, 'verify');
  assert.equal(p.merge.source, 'commit');
});

test('#1928 AC4 (derivation half): only session-end ⇒ every canonical phase is unattributed, 0 minutes', () => {
  const out = derivePhases({ events: [{ ts: '2026-09-05T14:13:00.000Z', type: 'session-end' }] });
  assert.deepEqual(out.phases.map((p) => p.phase), PHASES);
  for (const p of out.phases) { assert.equal(p.source, 'unattributed'); assert.equal(p.minutes, 0); }
  assert.equal(out.totals.minutes, 0);
});

test('#1928: an un-mapped claude-tweaks skill opens its own top-level span (never nests silently)', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:10:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:mystery', ts: '2026-09-05T13:15:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:wrap-up', ts: '2026-09-05T13:20:00.000Z', type: 'skill_invoked' },
    { ts: '2026-09-05T13:25:00.000Z', type: 'session-end' },
  ];
  const out = derivePhases({ events });
  const p = byName(out);
  assert.equal(p.review.minutes, 5, 'review ends when the un-mapped skill starts');
  assert.ok(out.phases.some((x) => x.phase === 'mystery' && x.minutes === 5));
  assert.equal(NESTED_PARENT.journeys, 'enclosing');
});

test('#1928: a re-entered phase sums every span attributed to its name', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:01:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:build', ts: '2026-09-05T13:05:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:15:00.000Z', type: 'skill_invoked' },
    { ts: '2026-09-05T13:18:00.000Z', type: 'session-end' },
  ];
  assert.equal(byName(derivePhases({ events })).review.minutes, 7);
});

test('#1928: merge ends at runState.pr.mergedAt under pr-first, else at a merge commit or the terminal event', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:wrap-up', ts: '2026-09-05T13:01:00.000Z', type: 'skill_invoked' },
    { action: 'push', ts: '2026-09-05T13:10:00.000Z', type: 'commit' },
    { ts: '2026-09-05T13:30:00.000Z', type: 'session-end' },
  ];
  assert.equal(byName(derivePhases({ events, runState: { pr: { mergedAt: '2026-09-05T13:14:00.000Z' } } })).merge.minutes, 4);
  assert.equal(byName(derivePhases({ events })).merge.minutes, 20);
  const local = [...events.slice(0, 3), { action: 'merge', ts: '2026-09-05T13:12:00.000Z', type: 'commit' }, events[3]];
  assert.equal(byName(derivePhases({ events: local })).merge.minutes, 2);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/bin-lib/timing/derive.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/lib/timing/derive'`.

- [ ] **Step 4: Implement `plugin/bin/lib/timing/derive.js`**

```js
// bin/lib/timing/derive.js — pure derivation of per-phase timing (#1928).
//
// Input: a run's events (as appendEvent wrote them), its manifest (optional,
// phases[] is the manifest-side boundary source), and run-state (optional,
// pr.mergedAt ends the merge phase under pr-first). Output: the canonical
// ten-phase list, each with a span, an exclusive duration, and the source
// that bounded it. No I/O, no clock reads beyond the injectable `now`.
//
// Nested skills attribute to the enclosing phase via NESTED_PARENT. The map
// is NOT exhaustive by design: an un-mapped `claude-tweaks:*` skill_invoked
// event opens a new top-level phase named after the skill — the safe default
// (an unrecognized skill gets its own attributed span rather than silently
// nesting into an unrelated phase). A maintainer adding a new nested-skill
// call site inside review/wrap-up/build must add its name here, or every
// run will grow a spurious top-level phase.
'use strict';

const PHASES = ['call-1', 'call-2', 'build', 'plan', 'tasks', 'test', 'review', 'polish', 'wrap-up', 'merge'];

const NESTED_PARENT = Object.freeze({
  simplify: 'enclosing', reflect: 'enclosing', 'visual-review': 'enclosing', capture: 'enclosing',
  'design-wrapper': 'enclosing', challenge: 'enclosing', 'assess-agent-autonomy': 'enclosing',
  ledger: 'enclosing', journeys: 'enclosing',
});

const TERMINAL_TYPES = new Set(['session-end', 'close-run', 'worktree-reaped']);
const NS = 'claude-tweaks:';

function ms(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; }
function minutesBetween(a, b) { return a === null || b === null || b < a ? 0 : Math.round((b - a) / 60000); }
function iso(t) { return t === null ? null : new Date(t).toISOString(); }
function skillName(ev) { return typeof ev.skill === 'string' && ev.skill.startsWith(NS) ? ev.skill.slice(NS.length) : null; }
function isTopLevel(ev) { const n = skillName(ev); return n !== null && !(n in NESTED_PARENT); }

// { events, manifest?, runState?, now? } -> { phases, totals }
function derivePhases({ events, manifest = null, runState = null, now = new Date() } = {}) {
  const evs = (Array.isArray(events) ? events : [])
    .filter((e) => e && typeof e === 'object' && ms(e.ts) !== null)
    .map((e) => ({ ...e, t: ms(e.ts) }))
    .sort((a, b) => a.t - b.t);
  const nowT = now instanceof Date ? now.getTime() : (ms(now) ?? Date.now());
  const terminal = evs.find((e) => TERMINAL_TYPES.has(e.type));
  const endOfRun = terminal ? terminal.t : nowT;

  const skillEvents = evs.filter((e) => e.type === 'skill_invoked');
  const flows = skillEvents.filter((e) => e.skill === `${NS}flow`);
  const topLevel = skillEvents.filter(isTopLevel);
  const verifies = evs.filter((e) => e.type === 'verify');
  const pushes = evs.filter((e) => e.type === 'commit' && e.action === 'push');
  const merges = evs.filter((e) => e.type === 'commit' && e.action === 'merge');

  const wrapUpStart = (() => { const w = topLevel.find((e) => e.skill === `${NS}wrap-up`); return w ? w.t : null; })();
  const mergeStart = wrapUpStart === null ? null : (pushes.find((e) => e.t > wrapUpStart) || { t: null }).t;

  // A top-level span ends at the earliest of: the next top-level event, the
  // merge phase's start, the terminal event (decision 3 in the plan).
  function spanEnd(startT, startIndexInTopLevel) {
    const next = topLevel[startIndexInTopLevel + 1];
    const candidates = [endOfRun];
    if (next) candidates.push(next.t);
    if (mergeStart !== null && mergeStart > startT) candidates.push(mergeStart);
    return Math.min(...candidates);
  }

  const spans = new Map(); // name -> [{start, end, source}]
  const add = (name, start, end, source) => {
    if (!spans.has(name)) spans.set(name, []);
    spans.get(name).push({ start, end: end < start ? start : end, source });
  };

  topLevel.forEach((e, i) => {
    const name = skillName(e);
    if (name === 'flow') return; // calls are handled below
    add(name, e.t, spanEnd(e.t, i), 'skill_invoked');
  });

  flows.forEach((f, i) => {
    const next = flows[i + 1];
    add(`call-${i + 1}`, f.t, next ? next.t : endOfRun, 'skill_invoked');
  });

  // plan / tasks nest in build.
  const plans = skillEvents.filter((e) => e.skill === 'superpowers:writing-plans');
  const sdds = skillEvents.filter((e) => e.skill === 'superpowers:subagent-driven-development');
  plans.forEach((p) => {
    const sdd = sdds.find((s) => s.t >= p.t);
    if (sdd) add('plan', p.t, sdd.t, 'skill_invoked');
  });
  sdds.forEach((s) => {
    const v = verifies.find((e) => e.t >= s.t);
    if (v) add('tasks', s.t, v.t, 'verify');
  });

  // polish: the LAST design-wrapper strictly after review's own first one
  // and before wrap-up's start (review's Step 6.5 always precedes polish's).
  const reviewStart = (() => { const r = topLevel.find((e) => e.skill === `${NS}review`); return r ? r.t : null; })();
  if (reviewStart !== null && wrapUpStart !== null) {
    const dws = skillEvents.filter((e) => e.skill === `${NS}design-wrapper` && e.t > reviewStart && e.t < wrapUpStart);
    if (dws.length >= 2) add('polish', dws[dws.length - 1].t, wrapUpStart, 'skill_invoked');
  }

  // merge: first push after wrap-up start → pr.mergedAt | merge commit | terminal.
  if (mergeStart !== null) {
    const mergedAt = runState && runState.pr && runState.pr.mergedAt ? ms(runState.pr.mergedAt) : null;
    const mergeCommit = merges.find((e) => e.t >= mergeStart);
    const end = mergedAt !== null ? mergedAt : (mergeCommit ? mergeCommit.t : endOfRun);
    add('merge', mergeStart, end, 'commit');
  }

  // Manifest phases[] fill gaps the events could not: a phase with no
  // skill_invoked span but a manifest transition gets its manifest span.
  const specs = manifest && manifest.multispec && Array.isArray(manifest.multispec.specs) ? manifest.multispec.specs : [];
  for (const spec of specs) {
    const log = Array.isArray(spec.phases) ? spec.phases : [];
    log.forEach((entry, i) => {
      if (spans.has(entry.phase)) return;
      const start = ms(entry.at);
      const next = log[i + 1];
      if (start === null) return;
      add(entry.phase, start, next && ms(next.at) !== null ? ms(next.at) : endOfRun, 'manifest');
    });
  }

  const names = [...PHASES, ...[...spans.keys()].filter((n) => !PHASES.includes(n))];
  const rows = names.map((name) => {
    const list = spans.get(name) || [];
    if (!list.length) {
      const unattributedStart = name === 'polish' && wrapUpStart !== null ? wrapUpStart : null;
      return { phase: name, start: iso(unattributedStart), end: iso(unattributedStart), minutes: 0, ownMinutes: 0, source: 'unattributed', verify: [] };
    }
    const start = Math.min(...list.map((s) => s.start));
    const end = Math.max(...list.map((s) => s.end));
    const minutes = list.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
    const verify = verifies.filter((v) => list.some((s) => v.t >= s.start && v.t <= s.end))
      .map((v) => ({ mode: v.mode ?? null, suitesRun: Array.isArray(v.suitesRun) ? v.suitesRun : [], durationMs: v.durationMs ?? null, pass: v.pass ?? null, at: v.ts }));
    return { phase: name, start: iso(start), end: iso(end), minutes, ownMinutes: minutes, source: list[0].source, verify, _list: list };
  });

  // Exclusive minutes: build minus plan/tasks; each call minus the top-level
  // phases whose spans fall inside it. Nothing is counted twice in totals.
  const byName = Object.fromEntries(rows.map((r) => [r.phase, r]));
  const nestedIn = (inner, outer) => inner._list && outer._list && inner._list.every((s) => outer._list.some((o) => s.start >= o.start && s.end <= o.end));
  if (byName.build._list) {
    byName.build.ownMinutes = Math.max(0, byName.build.minutes - byName.plan.minutes - byName.tasks.minutes);
  }
  for (const call of rows.filter((r) => /^call-\d+$/.test(r.phase) && r._list)) {
    let inner = 0;
    for (const r of rows) {
      if (r === call || /^call-\d+$/.test(r.phase) || r.phase === 'plan' || r.phase === 'tasks') continue;
      if (nestedIn(r, call)) inner += r.minutes;
    }
    call.ownMinutes = Math.max(0, call.minutes - inner);
  }
  // A verify event belongs to the innermost phase only — drop it from build
  // when tasks already claims it, so sub-rows are not double-listed.
  if (byName.build._list && byName.tasks._list) {
    const taskAts = new Set(byName.tasks.verify.map((v) => v.at));
    byName.build.verify = byName.build.verify.filter((v) => !taskAts.has(v.at));
  }
  for (const call of rows.filter((r) => /^call-\d+$/.test(r.phase))) call.verify = [];

  const phases = rows.map(({ _list, ...r }) => r);
  const totals = {
    minutes: phases.reduce((s, r) => s + r.ownMinutes, 0),
    verifyRuns: verifies.length,
    verifyModes: [...new Set(verifies.map((v) => v.mode).filter((m) => typeof m === 'string'))],
  };
  return { phases, totals };
}

module.exports = { derivePhases, PHASES, NESTED_PARENT };
```

- [ ] **Step 5: Run the test**

Run: `node --test tests/bin-lib/timing/derive.test.js`
Expected: PASS. If a reference number is off by more than one minute, fix the derivation — not the fixture, and not the tolerance.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/timing/derive.js tests/bin-lib/timing/derive.test.js tests/fixtures/timing/record-1535/events.jsonl tests/fixtures/timing/record-1535/manifest.yml
git commit -m "Derive per-phase timing from events.jsonl and manifest.yml — pure derivation over a frozen fixture (refs #1928)"
```

---

### Task 4: `bin/phase-timing.js` CLI

**Files:**
- Create: `plugin/bin/phase-timing.js`
- Test: `tests/bin-lib/timing/cli.test.js`

**Interfaces:**
- Consumes: `derivePhases` (Task 3), `readManifest(runDir)` from `plugin/bin/lib/flow/manifest.js`.
- Produces: `{run-dir}/timing.json` = `{ runDir, generatedAt, phases, totals }`; `--markdown` prints a table headed `| Phase | Minutes | Verify |`; `--json` prints the same object; exit 0 always except 2 on a malformed invocation. Task 7's prose cites `node "${CLAUDE_PLUGIN_ROOT}/bin/phase-timing.js" --run "$PIPELINE_RUN_DIR" --markdown`.

- [ ] **Step 1: Write the failing test**

`tests/bin-lib/timing/cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'phase-timing.js');
const FIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'record-1535');
function run(args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }
function tmpRun(copyFixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-timing-'));
  if (copyFixture) for (const f of ['events.jsonl', 'manifest.yml']) fs.copyFileSync(path.join(FIX, f), path.join(dir, f));
  return dir;
}

test('#1928 AC4: --markdown prints the table and writes timing.json', () => {
  const dir = tmpRun(true);
  const r = run(['--run', dir, '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], '| Phase | Minutes | Verify |');
  assert.match(r.stdout, /^\| call-1 \| 25 \|/m);
  assert.match(r.stdout, /^\| tasks \| 14 \| scoped ×1 \|/m);
  assert.match(r.stdout, /^\| build \| 22 \(own 2\) \|/m);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
  assert.equal(json.runDir, dir);
  assert.equal(typeof json.generatedAt, 'string');
  assert.equal(json.totals.verifyRuns, 2);
});

test('#1928 AC4: an events file with only session-end prints every phase unattributed and exits 0', () => {
  const dir = tmpRun(false);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"ts":"2026-09-05T14:13:00.000Z","type":"session-end"}\n');
  const r = run(['--run', dir, '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split('\n').slice(2);
  assert.equal(rows.length, 10);
  for (const row of rows) assert.match(row, /\| 0 \| unattributed \|$/);
});

test('#1928: a malformed line is skipped, not fatal; a missing events file is an empty run', () => {
  const dir = tmpRun(true);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), 'not json\n');
  assert.equal(run(['--run', dir, '--json']).status, 0);
  const empty = tmpRun(false);
  const r = run(['--run', empty, '--json']);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).totals.minutes, 0);
});

test('#1928: malformed invocation exits 2 — no --run, or a --run that is not a directory', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['--run', path.join(os.tmpdir(), 'ct-timing-does-not-exist')]).status, 2);
  assert.equal(run(['--run']).status, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bin-lib/timing/cli.test.js`
Expected: FAIL — the CLI file does not exist (`spawnSync` status 1, module not found).

- [ ] **Step 3: Implement `plugin/bin/phase-timing.js`**

```js
#!/usr/bin/env node
// bin/phase-timing.js — render a run's per-phase timing (#1928).
//
//   node bin/phase-timing.js --run <dir> [--json] [--markdown]
//
// Reads {run-dir}/events.jsonl (per-line JSON; a malformed line is skipped,
// a missing file is an empty run), {run-dir}/manifest.yml (optional) and
// {run-dir}/run-state.json (optional, pr.mergedAt), writes
// {run-dir}/timing.json, and prints the markdown table (--markdown) or the
// JSON object (--json); with neither it prints the path it wrote. Exit 0 in
// every derivable case — missing events degrade per row to `unattributed`.
// Exit 2 only on a malformed invocation: no --run, a --run that is not a
// directory, or an events.jsonl that exists but cannot be read.
'use strict';
const fs = require('fs');
const path = require('path');
const { derivePhases } = require('./lib/timing/derive');
const { readManifest } = require('./lib/flow/manifest');

const USAGE = 'usage: phase-timing.js --run <dir> [--json] [--markdown]\n';

function parseArgs(argv) {
  const o = { run: null, json: false, markdown: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run') { o.run = argv[i + 1]; i++; if (o.run === undefined) return null; continue; }
    if (a === '--json') { o.json = true; continue; }
    if (a === '--markdown') { o.markdown = true; continue; }
    return null;
  }
  if (!o.run) return null;
  return o;
}

function readEvents(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, events: [] };
    return { ok: false, error: err.message };
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* per-row skip, never fatal */ }
  }
  return { ok: true, events };
}

function readJsonOrNull(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function verifyCell(verify) {
  if (!verify.length) return '—';
  const counts = new Map();
  for (const v of verify) counts.set(v.mode || 'unknown', (counts.get(v.mode || 'unknown') || 0) + 1);
  return [...counts].map(([m, n]) => `${m} ×${n}`).join(', ');
}

function renderMarkdown(out) {
  const lines = ['| Phase | Minutes | Verify |', '|---|---|---|'];
  for (const p of out.phases) {
    const minutes = p.ownMinutes !== p.minutes ? `${p.minutes} (own ${p.ownMinutes})` : String(p.minutes);
    lines.push(p.source === 'unattributed'
      ? `| ${p.phase} | ${minutes} | unattributed |`
      : `| ${p.phase} | ${minutes} | ${verifyCell(p.verify)} |`);
  }
  lines.push(`| total | ${out.totals.minutes} | ${out.totals.verifyRuns} run(s)${out.totals.verifyModes.length ? ` (${out.totals.verifyModes.join(', ')})` : ''} |`);
  return lines.join('\n') + '\n';
}

function main(argv) {
  const o = parseArgs(argv);
  if (!o) { process.stderr.write(USAGE); return 2; }
  let runDir;
  try { runDir = fs.realpathSync(o.run); } catch { process.stderr.write(`phase-timing.js: --run ${o.run} is not a directory\n${USAGE}`); return 2; }
  if (!fs.statSync(runDir).isDirectory()) { process.stderr.write(`phase-timing.js: --run ${o.run} is not a directory\n${USAGE}`); return 2; }
  const events = readEvents(path.join(runDir, 'events.jsonl'));
  if (!events.ok) { process.stderr.write(`phase-timing.js: events.jsonl unreadable (${events.error})\n`); return 2; }
  const out = derivePhases({ events: events.events, manifest: readManifest(runDir), runState: readJsonOrNull(path.join(runDir, 'run-state.json')) });
  const timing = { runDir, generatedAt: new Date().toISOString(), phases: out.phases, totals: out.totals };
  const timingPath = path.join(runDir, 'timing.json');
  fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');
  if (o.markdown) process.stdout.write(renderMarkdown(out));
  else if (o.json) process.stdout.write(JSON.stringify(timing, null, 2) + '\n');
  else process.stdout.write(`timing: wrote ${timingPath}\n`);
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, parseArgs, renderMarkdown };
```

Note: the "total" row is an eleventh row — the AC4 unattributed test slices `rows` after the two header lines and expects 10 phase rows; make the total row render only when `out.totals.minutes > 0` or `verifyRuns > 0` (an all-unattributed run has nothing to total). Add that guard to `renderMarkdown`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/timing/`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/phase-timing.js tests/bin-lib/timing/cli.test.js
git commit -m "Add phase-timing.js — writes timing.json and prints the Timing table from a run directory (refs #1928)"
```

---

### Task 5: Remove `subagent-stop.js`'s parent-transcript fallback; document the `verify` event

**Files:**
- Modify: `plugin/bin/lib/hooks/subagent-stop.js:1-20` (header comment), `:112` (the fallback line); `docs/hooks.md:9` (run-dir state-files line) and the `contract-violation` mention on the same or a nearby line
- Test: `tests/hooks-log-modules.test.js`

**Interfaces:** none new. AC5 is the behavior.

- [ ] **Step 1: Write the failing test**

Append to `tests/hooks-log-modules.test.js`, next to the existing `substop.run(...)` cases (reuse the file's `transcript(...)` helper and its `run` temp dir setup):

```js
// #1928 AC5: no agent transcript ⇒ nothing to grade. The parent session's own
// transcript_path was the fallback that graded orchestrator narration as a
// subagent reply (2,471 events in the corpus, most of this shape).
test('#1928 AC5: transcript_path alone appends no contract-violation event', () => {
  const run = mkRun();
  const out = substop.run({ input: { transcript_path: transcript('I did some things.') }, runDir: run, runState: null, ownedRun: { dir: run, attribution: 'session' }, cwd: '/x' });
  assert.deepStrictEqual(out, {});
  assert.strictEqual(fs.existsSync(path.join(run, 'events.jsonl')), false);
});
```

`mkRun()`, `transcript()`, and `substop` are the file's existing helpers/requires — reuse them, add nothing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -e 'const s=require("fs").readFileSync("plugin/bin/lib/hooks/subagent-stop.js","utf8"); process.exit(s.includes("|| ctx.input.transcript_path") ? 1 : 0)'`
Expected: FAIL — exit code 1 (the fallback expression is still present). Then `node --test tests/hooks-log-modules.test.js` must show the new test red (the fallback grades the parent transcript and appends a `contract-violation` event).

- [ ] **Step 3: Implement**

Replace line 112:

```js
  const transcriptPath = ctx.input.agent_transcript_path || ctx.input.transcript_path;
```

with:

```js
  // #1928: only a real agent transcript is graded. The former fallback to
  // the parent session's transcript_path scored the orchestrator's own
  // narration as a subagent reply — the bulk of the corpus's false fires.
  const transcriptPath = ctx.input.agent_transcript_path;
```

In the header comment, replace item 2's opening ("A session running as a background job … has every one of its own turn boundaries checked independently …") with a shorter, now-historical note:

```
// 2. (fixed, #1928) The parent session's own transcript used to be graded
//    whenever agent_transcript_path was absent, so an orchestrator's interim
//    narration turns were logged as violations. Absent agent_transcript_path
//    is now a no-op; a harness that stops sending the field silently
//    disables this check rather than flooding the log.
```

`docs/hooks.md` line 9: after "`events.jsonl` (append-only typed events" insert " — including the runner-written `verify` event under `verify.js --run`, #1928". Find the `contract-violation` description in `docs/hooks.md` (`grep -n "contract-violation" docs/hooks.md`) and append to it: "; fires only on a real `agent_transcript_path` (the parent-transcript fallback was removed in #1928)". If the file has no `contract-violation` prose, add that clause to the same line 9 after the `verify` insertion.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/hooks-log-modules.test.js tests/hooks-dispatcher.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/subagent-stop.js tests/hooks-log-modules.test.js docs/hooks.md
git commit -m "Grade only real agent transcripts in subagent-stop — drop the parent-transcript fallback (refs #1928)"
```

---

### Task 6: Split `flow/multi-spec.md`'s Run directory layout tail into a sub-file; document `phases[]`

**Files:**
- Create: `plugin/skills/flow/multispec-run-dir-layout.md`
- Modify: `plugin/skills/flow/multi-spec.md:64-111` (the `## Run directory layout` section), `docs/plugin-structure.md:37` (the `bin/lib/flow/` row's "Run directory layout" pointer) and `:84` (the flow sub-file row)
- Test: `tests/timing-prose-conformance.test.js` (create — Task 7 extends it)

**Interfaces:** none in code. Produces the sub-file Task 7's docs rows and `docs/skill-graph.md` may cite.

- [ ] **Step 1: Write the failing test**

Create `tests/timing-prose-conformance.test.js`:

```js
// tests/timing-prose-conformance.test.js — #1928 prose pins.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('#1928: multi-spec.md cites the run-dir layout sub-file and stays under its read budget', () => {
  const ms = read('plugin/skills/flow/multi-spec.md');
  assert.match(ms, /multispec-run-dir-layout\.md/);
  assert.ok(Buffer.byteLength(ms, 'utf8') < 20480, `multi-spec.md is ${Buffer.byteLength(ms, 'utf8')} B`);
  assert.match(ms, /\$RUN_ROOT\/\.claude-tweaks\/pipelines\/\{ISO-timestamp\}-spec-\{N1\}-\{N2\}-\{N3\}\//, 'the anchoring diagram stays in multi-spec.md');
});

test('#1928: the layout sub-file documents manifest.yml phases[] and the latest phase', () => {
  const sub = read('plugin/skills/flow/multispec-run-dir-layout.md');
  assert.match(sub, /phases:\s*\n\s+- phase: /, 'the YAML example shows the phases[] list');
  assert.match(sub, /`phases\[\]`[^.]*append-only|append-only[^.]*`phases\[\]`/i);
  assert.match(sub, /spec-status/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/timing-prose-conformance.test.js`
Expected: FAIL — `multi-spec.md` does not cite `multispec-run-dir-layout.md`, and the sub-file does not exist.

- [ ] **Step 3: Split**

Create `plugin/skills/flow/multispec-run-dir-layout.md` with this header, then the moved text **verbatim**:

```markdown
# Multi-spec run directory — per-spec config, slug convention, and `manifest.yml`

Read from `multi-spec.md`'s "Run directory layout" section (which keeps the anchoring rule and the tree diagram). This file carries the field-level detail.

```

Then move, verbatim and in order, from `multi-spec.md`'s `## Run directory layout` section: the paragraph beginning "The parent dir uses a single `spec-` prefix…", the paragraph beginning "**Each `spec-{N}/` carries its own `config.yml`**…", the paragraph beginning "`manifest.yml` lists the records in execution order…", and the ```yaml block. In the YAML block, extend spec `157`'s entry with the two new fields (indentation exactly as `manifest.js` serializes them):

```yaml
      startedAt: 2026-05-16T14:32:07.000Z   # set once, on this spec's FIRST running transition
      phase: wrap-up        # latest phase named by spec-status (#1928)
      phases:               # append-only transition log — one entry per spec-status call
        - phase: build
          status: running
          at: 2026-05-16T14:32:07.000Z
        - phase: wrap-up
          status: complete
          at: 2026-05-16T14:47:40.000Z
```

After the YAML block add one paragraph:

```markdown
`phase` and `phases[]` (#1928) are written by every `spec-status` call — `phase` is the latest, `phases[]` is append-only (a re-entered phase adds another entry, never rewrites one). `bin/phase-timing.js` reads `phases[]` as the manifest-side boundary source for the run's Timing table; nothing else consumes it.
```

In `multi-spec.md`, replace the moved text with one paragraph, placed right after the tree diagram:

```markdown
The slug convention, the per-spec `config.yml` copy, and `manifest.yml`'s field-by-field description — including the `phase`/`phases[]` transition log `spec-status` writes (#1928) — are in `multispec-run-dir-layout.md` in this skill's directory.
```

Check with `grep -n "Run directory layout" docs/plugin-structure.md plugin/skills/**/*.md plugin/bin/lib/flow/manifest.js` for other citations of the section that now need to point at the sub-file for field detail; update `docs/plugin-structure.md:37` (`bin/lib/flow/` row) to cite `multispec-run-dir-layout.md`, and add `multispec-run-dir-layout.md` to the flow row on line 84 (alphabetical position next to `multispec-review-console.md`).

- [ ] **Step 4: Run the tests**

Run: `node --test tests/timing-prose-conformance.test.js tests/run-dir-timestamp-utc.test.js tests/flow-run-dir-anchoring.test.js tests/flow-claim-preflight.test.js tests/multispec-boundary-freshness.test.js tests/multi-spec-config-scaffold.test.js tests/test-skill-affected-conformance.test.js tests/multispec-artifact-namespacing-conformance.test.js tests/multispec-not-run-callsite.test.js tests/worktree-adopt-or-create-consolidation.test.js tests/flow-subfile-table-completeness.test.js tests/skill-catalog-completeness.test.js`
Expected: PASS. Also quote `wc -c plugin/skills/flow/multi-spec.md plugin/skills/flow/multispec-run-dir-layout.md`.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/flow/multi-spec.md plugin/skills/flow/multispec-run-dir-layout.md docs/plugin-structure.md tests/timing-prose-conformance.test.js
git commit -m "Split multi-spec.md's run-dir layout detail into a sub-file — room for the phases[] log under the 20 KB pin (refs #1928)"
```

---

### Task 7: Timing tables, the `timing` PR comment kind, dispatch's line, `--run` in the canonical snippet, docs rows

**Files:**
- Modify: `plugin/skills/flow/summary-template.md:24-27` (after the Reconcile line), `plugin/skills/wrap-up/summary-template.md:58` (before `### Phase 1 — Establish`), `plugin/skills/_shared/pr-run-comments.md:30-33` (kinds table) and `:85-88` (producers table), `plugin/skills/wrap-up/verification-brief.md:286-293` (the `pr` object present block), `plugin/skills/dispatch/SKILL.md:193-206` (Reporting), `plugin/skills/test/verification.md:21` and `:74` (the two `verify.js` invocations), `docs/plugin-structure.md` (the `bin/lib/` rows near line 37-41 and the CLI list near line 119-131), `docs/skill-graph.md:249-262` (`## flow`) and `:541-552` (`## wrap-up`)
- Test: `tests/timing-prose-conformance.test.js` (extend)

**Interfaces:**
- Consumes: `bin/phase-timing.js --run <dir> --markdown` (Task 4), `verify.js --run` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `tests/timing-prose-conformance.test.js`:

```js
const CEILING = 40960;

test('#1928 AC6: both summary templates carry a ### Timing section rendered from phase-timing.js', () => {
  for (const f of ['plugin/skills/flow/summary-template.md', 'plugin/skills/wrap-up/summary-template.md']) {
    const t = read(f);
    assert.match(t, /^### Timing$/m, f);
    assert.match(t, /bin\/phase-timing\.js" --run "\$PIPELINE_RUN_DIR" --markdown/, f);
    assert.match(t, /\| Phase \| Minutes \| Verify \|/, f);
  }
});

test('#1928 AC6: pr-run-comments.md has a timing comment kind with its producer', () => {
  const t = read('plugin/skills/_shared/pr-run-comments.md');
  assert.match(t, /^\| `timing` \| `\/claude-tweaks:wrap-up`[^|]*\| `<!-- run-comment: timing -->` \|$/m);
  assert.match(t, /^\| `\/claude-tweaks:wrap-up` \([^)]*verification-brief\.md[^)]*\) \| `timing` \|/m);
  assert.match(read('plugin/skills/wrap-up/verification-brief.md'), /run-comment: timing/);
});

test('#1928 AC6: dispatch/SKILL.md prints the per-group timing line from timing.json and stays under the ceiling', () => {
  const t = read('plugin/skills/dispatch/SKILL.md');
  assert.match(t, /`timing: call-1 \{m\}m · call-2 \{m\}m · verify \{n\} run\(s\) \(\{modes\}\)`/);
  assert.match(t, /timing\.json/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= CEILING, `dispatch/SKILL.md is ${Buffer.byteLength(t, 'utf8')} B`);
});

test('#1928: the canonical verify.js snippets pass --run "$PIPELINE_RUN_DIR"', () => {
  const v = read('plugin/skills/test/verification.md');
  const snippets = [...v.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => b.includes('bin/verify.js') && b.includes('--cmd'));
  assert.ok(snippets.length >= 2, 'both the canonical and the --scope invocation');
  for (const s of snippets) assert.match(s, /--run "\$PIPELINE_RUN_DIR"/);
  assert.match(v, /empty[^.]*no `verify` event|no `verify` event[^.]*empty/i);
});

test('#1928: docs name the timing module, the CLI, and the flow/wrap-up table source', () => {
  const ps = read('docs/plugin-structure.md');
  assert.match(ps, /^plugin\/bin\/lib\/timing\/ /m);
  assert.match(ps, /^node plugin\/bin\/phase-timing\.js --run <dir> \[--json\] \[--markdown\]/m);
  assert.match(ps, /verify\.js[^\n]*\[--run <dir>\]/);
  const sg = read('docs/skill-graph.md');
  const flow = sg.slice(sg.indexOf('\n## flow\n'), sg.indexOf('\n## ', sg.indexOf('\n## flow\n') + 1));
  const wrap = sg.slice(sg.indexOf('\n## wrap-up\n'), sg.indexOf('\n## ', sg.indexOf('\n## wrap-up\n') + 1));
  assert.match(flow, /`bin\/phase-timing\.js`/);
  assert.match(wrap, /`bin\/phase-timing\.js`/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/timing-prose-conformance.test.js`
Expected: FAIL on every new test (no `### Timing`, no `timing` kind, no `timing: call-1` literal, no `--run` in the snippets, no docs rows).

- [ ] **Step 3: Summary templates**

In `plugin/skills/flow/summary-template.md`, after the `**Reconcile:**` line and before `### Key Outputs`, insert:

```markdown
### Timing

Rendered verbatim from `node "${CLAUDE_PLUGIN_ROOT}/bin/phase-timing.js" --run "$PIPELINE_RUN_DIR" --markdown` (#1928) — never composed by hand; a phase with no event reads `unattributed`. `{Minutes}` is the phase's span, with `(own N)` when nested phases are excluded.

| Phase | Minutes | Verify |
|---|---|---|
| {phase} | {minutes} | {mode ×n | — | unattributed} |
| total | {totals.minutes} | {verifyRuns} run(s) ({modes}) |

```

In `plugin/skills/wrap-up/summary-template.md`, immediately before `### Phase 1 — Establish`, insert the same block verbatim.

- [ ] **Step 4: `timing` comment kind**

`plugin/skills/_shared/pr-run-comments.md` — kinds table (after the `brief` row):

```markdown
| `timing` | `/claude-tweaks:wrap-up`, right after the Verification Brief | `<!-- run-comment: timing -->` |
```

Producers table (after the `brief` producer row):

```markdown
| `/claude-tweaks:wrap-up` (`verification-brief.md` Step 4, after the brief) | `timing` | The run's Timing table, `bin/phase-timing.js --run "$PIPELINE_RUN_DIR" --markdown` verbatim under the same `pr`-object gate as the brief; find-or-update by marker, so a re-run replaces it (#1928) |
```

`plugin/skills/wrap-up/verification-brief.md` — inside the "**`pr` object present:**" block, after the existing ```bash block and before "Post the comment(s) before adding the label", add:

```markdown
Then post the run's Timing table as the `timing` kind, under the same gate (#1928):

```bash
printf '<!-- run-comment: timing -->\n\n' > /tmp/pr-timing-{issue}.md
node "${CLAUDE_PLUGIN_ROOT}/bin/phase-timing.js" --run "$PIPELINE_RUN_DIR" --markdown >> /tmp/pr-timing-{issue}.md
# find-or-create per _shared/pr-run-comments.md's post-or-update procedure, kind=timing, against {pr-number}
```
```

- [ ] **Step 5: `dispatch/SKILL.md` — trim first, then add**

Before editing, run `grep -rn "A prior design's console\|outlives the container" tests/` and confirm no test pins either sentence (both greps returned nothing at plan time). Then, in the Reporting section:

1. Replace `A prior design's console aggregated a whole batch's outcomes into one table; per-group reporting (Step 5) has nothing to aggregate, so none exists here (see When to Use above).` with `(See When to Use above.)`
2. In the `pending-review` paragraph, delete the trailing clause `, so a parked run already has a live PR carrying its Verification Brief — the work outlives the container that built it with nothing further to push here` and end the sentence at `kept it current.`
3. After the first Reporting paragraph (the one ending with the trimmed `(See When to Use above.)`), add:

```markdown
Each group's block ends with one timing line read from `{run-dir}/timing.json` (`bin/phase-timing.js --run "$PIPELINE_RUN_DIR"`, #1928) — never composed by hand: `timing: call-1 {m}m · call-2 {m}m · verify {n} run(s) ({modes})`.
```

Run `wc -c plugin/skills/dispatch/SKILL.md` — it must print ≤ 40960. If it does not, shorten the added line's lead-in ("Each group's block ends with one timing line" → "One timing line per group") until it does; never trim anything a test pins (`grep -rn "<phrase>" tests/` before each further cut).

- [ ] **Step 6: `test/verification.md`**

Line 21's canonical invocation becomes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --run "$PIPELINE_RUN_DIR" --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

Line 74's `--scope` invocation gains the same `--run "$PIPELINE_RUN_DIR"` immediately after the script path. Directly under the line-21 block add one sentence:

```markdown
`--run` names the pipeline run so the runner appends its `verify` event to that run's `events.jsonl` (#1928, the tasks→test boundary in `bin/phase-timing.js`); an unset `$PIPELINE_RUN_DIR` passes an empty value and writes no `verify` event, and a run dir outside the main checkout is refused on stderr without failing the run.
```

Run `node --test tests/bin-lib/verify/snippet-conformance.test.js tests/verification-flake-handling.test.js tests/test-skill-affected-conformance.test.js` — all must pass (the snippet now parses `--run $PIPELINE_RUN_DIR` through the real parser).

- [ ] **Step 7: Docs rows**

`docs/plugin-structure.md`:
- After the `plugin/bin/lib/flow/` row (line ~37) add: `plugin/bin/lib/timing/            → derive.js — pure per-phase timing derivation over a run's events.jsonl + manifest.yml (#1928): the canonical ten-phase list, span and exclusive minutes, verify sub-rows, the nested-skill parent map. Consumed by plugin/bin/phase-timing.js.`
- In the CLI list (near line 119), after the `wrap-up-pack.js` line add: `node plugin/bin/phase-timing.js --run <dir> [--json] [--markdown]   # Per-phase timing (#1928) — writes {run-dir}/timing.json, prints the Timing table; exit 0 whenever derivable, 2 on a malformed invocation`
- In the `verify.js` usage line (near line 131) insert `[--run <dir>]` after `[--git-dir <dir>]`.

`docs/skill-graph.md` — add to the `## flow` table:

```markdown
| `bin/phase-timing.js` | The Pipeline Summary's `### Timing` section is that CLI's `--markdown` output over the run's `events.jsonl` + `manifest.yml` (#1928) — rendered verbatim, never composed by hand. |
```

and to the `## wrap-up` table:

```markdown
| `bin/phase-timing.js` | The wrap-up summary's `### Timing` section and the PR's `timing` run-comment (`verification-brief.md` Step 4, `_shared/pr-run-comments.md`) are that CLI's `--markdown` output (#1928). |
```

- [ ] **Step 8: Run the tests**

Run: `node --test tests/timing-prose-conformance.test.js tests/bin-lib/verify/snippet-conformance.test.js tests/verification-flake-handling.test.js tests/test-skill-affected-conformance.test.js tests/skill-catalog-completeness.test.js tests/flow-subfile-table-completeness.test.js tests/dispatch-worktree-anchoring.test.js tests/dispatch-flow-rundir-handoff.test.js tests/dispatch-budget-drain.test.js tests/batch-ref-argument.test.js tests/wrap-up-registry-pin.test.js`
Expected: PASS. Quote `wc -c` for every `plugin/skills/**/*.md` touched.

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/flow/summary-template.md plugin/skills/wrap-up/summary-template.md plugin/skills/_shared/pr-run-comments.md plugin/skills/wrap-up/verification-brief.md plugin/skills/dispatch/SKILL.md plugin/skills/test/verification.md docs/plugin-structure.md docs/skill-graph.md tests/timing-prose-conformance.test.js
git commit -m "Render the Timing table in flow, wrap-up, the PR, and dispatch's report — from phase-timing.js, never by hand (refs #1928)"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 → Task 2 (`verify` event, refusal, snippet `--run` in Task 7 Step 6). Deliverable 2 → Task 1 (+ the sub-file sentence in Task 6). Deliverable 3 → Tasks 3-4. Deliverable 4 → Task 7 (templates, `timing` kind, dispatch line). Deliverable 5 → Task 5. Deliverable 6 (tests) → Tasks 1-7's test files; prose pins in `tests/timing-prose-conformance.test.js`. Deliverable 7 (docs) → Task 6 (`plugin-structure.md` flow rows) + Task 7 (rows, skill-graph). AC1 → Task 2; AC2 → Task 1; AC3 → Task 3; AC4 → Task 4; AC5 → Task 5; AC6 → Task 7; AC7 → the build's full-suite step.
- **Placeholder scan:** none; every code step carries its code.
- **Type consistency:** `derivePhases` returns `{phases, totals}` (Tasks 3, 4); phase rows carry `minutes` and `ownMinutes` (Tasks 3, 4, 7's template note); `parseArgs(...).run` (Task 2); `spec.phases[].{phase,status,at}` (Tasks 1, 3, 6).
- **Plan-authoring checks:** Return-shape widening — `transitionSpec`'s manifest gains fields; `tests/bin-lib/flow/manifest.test.js`'s `LIVE_MANIFEST` round-trip stays byte-identical because nothing is emitted when unset (Task 1 Step 4 pins it). Byte-pin — `multi-spec.md` < 20,480 (own pin) handled by Task 6; `dispatch/SKILL.md` at 40,948 of 40,960 handled by Task 7's trim-first rule with `wc -c` quoted. Sole-site and producer-side — `serviceVars`-style single-site claims: none made; the `timing` comment's producer (`verification-brief.md`) is extended in the same task as the kinds row; the `### Timing` consumers name their producer CLI. Gate-over-producers — the conformance test's regexes are content-anchored to text the same plan writes. Behavioral-claim — every "rendered from" sentence names `bin/phase-timing.js`, which Task 4 creates. Verbatim-command run-once — the snippet's `--run "$PIPELINE_RUN_DIR"` is proven by `snippet-conformance` parsing it through `parseArgs` (Task 7 Step 6).
