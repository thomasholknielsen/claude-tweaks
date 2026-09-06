# Per-step composed-bytes measurement Implementation Plan (#1990)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `plugin/bin/lib/skill-audit/context-cost.js`'s hard byte gate from "no single skill file exceeds 40 KB" to "no compose call site's composed bytes exceed the ceiling under any condition combination its sources actually branch on" — the number a reader pays — while the per-file assertions become warnings measured on CRLF-normalized, marker-stripped bytes (closing #1880).

**Architecture:** Four additions to one module — `findComposeCallSites` (scans `skills/**/*.md` for the single-line compose call form), `measureComposed` (composes a call site's sources via `compose-context/compose.js`'s `compose` under every combination of the `when:` keys those sources use), `composedBytesReport` (one row per call site, one column per combination), `overCeilingWarnings` (the former per-file hard assertions as a warning list) — plus a `measuredBytes` reader every per-file measurement now goes through (CRLF → LF, `stripMarkers`, `Buffer.byteLength`). One new hard-gate test over the real corpus with a per-step exception map for the one call site already known to exceed the ceiling (`merge`, 55,995 B at #1989's head), a stale-exception check, synthetic fixtures for every proof, and one evidence pre-check row in `_shared/harness-health-analysis.md`.

**Tech Stack:** Node 18+ (`node --test`, `node:assert`), the shipped `plugin/bin/lib/compose-context/compose.js` (`parseMarkers`, `stripMarkers`, `compose`, `KEYS`, `VOCAB`, `MarkerError`).

**Spec:** `.claude-tweaks/pipelines/2026-09-06T110420-spec-1988-1989-1990-1991-1992-1993-1994-1995-1996-1997/spec-1990/work/1990-spec.md` (materialized record #1990)

## Global Constraints

- **`CEILING_BYTES` stays exported and unchanged** (40 × 1024). Importers: `skill-audit/bloat.js`, `plan-audit/checks.js` (`headroomCheck` — U10's to retarget, untouched here), `merge-size-probe.js`, and eight test files. Task 5 proves them by running their suites, not by reading.
- **`repoRoot` in this module is the plugin payload root** (`plugin/` — the directory with `skills/` beneath it), as `context-cost.test.js`'s `REPO` constant states. A `${CLAUDE_PLUGIN_ROOT}/…` source path in a compose call therefore resolves against `repoRoot` itself.
- **One grammar, one validator:** every marker read here goes through `compose.js`'s `parseMarkers`/`stripMarkers`/`compose` — never a second regex. A `MarkerError` from any of them is reported as a measurement finding (`{file, line, message}`), never thrown out of a measurement pass (parent #1987 promise F1).
- Per-file measurements keep their entry shapes (`{name, bytes}` / `{skill, file, bytes}`) so `overCeiling`, `nearCeiling`, `headroom`, `totalBytes` and every existing test keep working; `bytes` is now the CRLF-normalized, marker-stripped count.
- Repo conventions: imperative commit messages, `refs #1990` (never `closes`/`fixes`), trailing `Claude-Session: https://claude.ai/code/session_01AU9zM5ZMdZaeTJV4GtBjZj` line; every git command `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/skill-context-composer-design" …`; one plain command per Bash call (no `&&`, `;`, pipes, heredocs, `cd`, shell variables); Edit/Write tools for file content; never `git add -A`; every `node -e` fixture single-quoted.
- Pre-existing baseline failures (never regressions): `tests/bin-lib/reconcile/reap-merged.test.js` 3/15 fail on macOS realpath (tracked by #1900); `tests/reconcile.test.js`'s #872 wall-clock test and `tests/statusline.test.js` are load-sensitive flakes.

## Plan-authoring rulings (recorded per `build/plan-authoring-checks.md`)

- **Ruling — per-file bytes are measured from the working tree after CRLF → LF normalization, not from the git blob.** Deliverable 3 names `git show HEAD:{path}`, but its only stated purpose is #1880 (a `core.autocrlf=true` checkout inflates every file by one byte per line). Normalizing `\r\n` to `\n` before counting closes #1880 identically — the blob under autocrlf *is* the LF form — with zero git spawns per measurement, no "tracked-but-edited reads the working tree, clean reads HEAD" split (the deliverable's own parenthetical already concedes edited files must read the working tree, which is the stale-HEAD hazard in one sentence), no dependency on `git` being present, and a proof that can run on an untracked temp fixture (AC4). A file that genuinely commits CRLF bytes is measured LF-normalized too — the reader pays the CRLF, but the gate exists for cross-checkout consistency, which is what #1880 asks for. Recorded as an *Update the spec* deviation at `/build` Common Step 4.5 (staged). Cost if wrong: one reader function swaps its source.
- **Ruling — the hard gate over the real corpus carries a per-step exception map, `COMPOSED_STEP_EXCEPTIONS = { merge: 56 * 1024 }`.** The only real call site today, the `merge` bundle, measures 55,995 B under `pr-first` + `gh` (#1989's PR-time measurement; parent promise F4) — over `CEILING_BYTES` before this record exists. The record's Non-Goals say it only measures, so the gate cannot demand a restructure the record forbids; a provisional per-step ceiling 1.3 KB above today's number makes any growth fail immediately, a stale-exception test fails the moment the step fits under `CEILING_BYTES` (so the entry cannot outlive its reason), and the restructuring itself is a follow-up record the controller files at wrap-up (`/claude-tweaks:capture`, spec-shaped, `Defer-reason:` scope — the record's Non-Goals). AC2 is proven on a synthetic fixture with no exception. Cost if wrong: one map entry.
- **Ruling — a compose line whose source tokens carry a placeholder (`{…}`, `<…>`) is documentation, not a call site.** `_shared/pipeline-run-dir.md` and `docs/skill-authoring.md` quote the call form with `{files}`; the scanner skips such lines rather than failing on ENOENT. A source that resolves to no file is still an error (a real call site with a typo must not go unmeasured).
- **Ruling — `measureComposed` combinates only the keys the sources use**, pinning every unused key to `VOCAB[key][0]` (a marker-free key cannot change the output). The `unresolved` value is not a combination: it is the standalone-run both-branches read, whose bytes are the raw sum the per-file warnings already show. Sources with no markers produce exactly one combination (`conditions: {}`).
- **Ruling — the scanner treats a call line as single-line by construction** (the record's stated gap): every call site this decomposition produces sits on one line; a wrapped call is not found and the function's own comment says so. `tests/skill-prose-plugin-root-invocations.test.js` already normalizes wrapped invocations for its own check; unifying the two scanners is a later concern.
- Verbatim-command run-once check: the composed measurement of the real `merge` site is run by Task 5 and its numbers quoted in the report. Degrade-clause check: none introduced. Gate-over-producers: `findComposeCallSites` scans every `plugin/skills/**/*.md`, the whole producer set of compose call sites. Renumbering: none — the two new tests append to the existing suite.

---

### Task 1: CRLF-normalized, marker-stripped per-file bytes; per-file ceiling becomes a warning

**Files:**
- Modify: `plugin/bin/lib/skill-audit/context-cost.js` (`measureSkills`, `measureSubFiles`; add `measuredBytes`, `overCeilingWarnings`; import `stripMarkers`, `MarkerError` from `../compose-context/compose`)
- Modify: `tests/bin-lib/skill-audit/context-cost.test.js` (retarget the two hard ceiling tests; add the CRLF proof, the over-ceiling warning proof, and the marker-error proof)

**Steps:**
- [ ] **Step 1: Write the failing tests first** (append after the existing `no lazy-loaded sub-file exceeds the ceiling either` test; use `makeFixtureRepo`-style temp dirs under `os.tmpdir()`):
  1. `measuredBytes: a CRLF file measures the same marker-stripped byte count as its LF twin (#1880)` — write `a.md` with `line one\r\nline two\r\n` and `b.md` with `line one\nline two\n`, assert `measuredBytes(a).bytes === measuredBytes(b).bytes === 18`.
  2. `measuredBytes: marker lines are not counted` — a file `x\n<!-- when: mode=auto -->\ny\n<!-- /when -->\nz\n` measures 6 bytes.
  3. `measuredBytes: a malformed marker is reported, never thrown (F1)` — a file with `<!-- when: mode=auto -->` and no close: `bytes` equals the raw byte count and `markerError` matches `/:1: /` naming the file.
  4. `overCeilingWarnings: a synthetic SKILL.md over 40 KB is warned about, not failed` — fixture repo with one skill whose SKILL.md body is `'x'.repeat(CEILING_BYTES + 100)`; `overCeilingWarnings(measureSkills(root))` returns one string containing the skill name and `KB`; the function never throws.
  5. Retarget: the two tests `no SKILL.md exceeds the 40 KB per-invocation ceiling` and `no lazy-loaded sub-file exceeds the ceiling either` become one test `per-file ceiling is a warning tier now (#1990): report, never fail` that calls `overCeilingWarnings` over both measurements, `console.warn`s each line, and asserts only that every warned entry really is over `CEILING_BYTES` (a composition check, mirroring the `nearCeiling` test's shape).
  6. `no measured skill file carries a marker error` — `[...measureSkills(REPO), ...measureSubFiles(REPO)].filter((e) => e.markerError)` is `[]` (the corpus is clean; the conformance suite says the same from the other side).
- [ ] **Step 2: Run the suite, confirm the new tests fail** — `node --test tests/bin-lib/skill-audit/context-cost.test.js`. Expected-FAIL probe: `node -e 'const m=require("./plugin/bin/lib/skill-audit/context-cost.js");console.log(typeof m.measuredBytes, typeof m.overCeilingWarnings)'` prints `undefined undefined`.
- [ ] **Step 3: Implement.** `measuredBytes(file)`: read utf8, `.replace(/\r\n/g, '\n')`, try `stripMarkers(text)` → `{ bytes: Buffer.byteLength(stripped, 'utf8') }`; on `MarkerError` return `{ bytes: Buffer.byteLength(text, 'utf8'), markerError: \`${file}:${err.line}: ${err.message}\` }` (rethrow anything else). `measureSkills`/`measureSubFiles` spread `measuredBytes(file)` into each entry (so `bytes` and an optional `markerError` land on the existing shape). `overCeilingWarnings(entries)` returns `overCeiling(entries).map((e) => \`${e.name || e.file} ${(e.bytes / 1024).toFixed(1)} KB\`)`. Update the module header comment: the per-file ceiling is a warning tier since #1990; the hard gate is composed bytes per compose call site (Task 4).
- [ ] **Step 4: Run the suite green** — `node --test tests/bin-lib/skill-audit/context-cost.test.js`; also `node --test tests/bin-lib/skill-audit/bloat.test.js` (the `CEILING_BYTES` import) and `node --test tests/bin-lib/plan-audit/checks.test.js`.
- [ ] **Step 5: Commit** — `Measure skill files CRLF-normalized and marker-stripped; the per-file 40 KB ceiling becomes a warning tier (refs #1990)`.

### Task 2: `findComposeCallSites`

**Files:**
- Modify: `plugin/bin/lib/skill-audit/context-cost.js` (add `parseComposeCallLine`, `findComposeCallSites`)
- Modify: `tests/bin-lib/skill-audit/context-cost.test.js` (append)

**Steps:**
- [ ] **Step 1: Failing tests:**
  1. `parseComposeCallLine: the production merge call parses to step + two plugin-root sources` — the literal line from `wrap-up/auto-merge-short-circuit.md` (copy it verbatim from the file at build time) with `repoRoot = '/r'` yields `{ step: 'merge', sources: ['/r/skills/_shared/pr-first-merge.md', '/r/skills/_shared/pr-early-run-lifecycle.md'] }`.
  2. `parseComposeCallLine: a documentation line with a placeholder is not a call site` — `` `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step {step} {files}` `` returns `null`.
  3. `parseComposeCallLine: a line without compose-context.js is null`.
  4. `findComposeCallSites: finds both real merge sites in the shipped corpus` — over `REPO`, filtering `step === 'merge'`, the `file` values (relative to `skills/`) are exactly `wrap-up/auto-merge-short-circuit.md` and `wrap-up/review-console.md` (sorted), each with the two `_shared` sources as absolute paths that exist.
  5. `findComposeCallSites: a fixture skill file with a call site is found with its line number` — temp repo `skills/demo/SKILL.md` containing one call line; result `[{ step: 'demo', file: 'demo/SKILL.md', line: N, sources: [...] }]`.
- [ ] **Step 2: Expected-FAIL probe** — `node -e 'console.log(typeof require("./plugin/bin/lib/skill-audit/context-cost.js").findComposeCallSites)'` prints `undefined`.
- [ ] **Step 3: Implement.** `parseComposeCallLine(line, repoRoot)`: `const m = line.match(/compose-context\.js"?\s+([^\`\n]*)/)`; `null` if no match; tokenize `m[1]` with `/"[^"]*"|\S+/g`; walk tokens: skip `--run` and its value, take `--step`'s value as `step`, everything after it is a source until the end; strip surrounding quotes; if any source contains `{`, `}`, `<`, or `>` return `null` (documentation); resolve `${CLAUDE_PLUGIN_ROOT}/x` → `path.join(repoRoot, 'x')`, anything else → `path.resolve(repoRoot, '..', token)` (repo-relative to the checkout root); return `null` when no step or no sources. `findComposeCallSites(repoRoot)`: walk `skills/**/*.md` (reuse `measureSubFiles`'s walk shape — extract a shared `walkMarkdown(dir)` generator used by both), for each line containing `compose-context.js` call `parseComposeCallLine`, push `{ step, file: path.relative(skillsDir, p), line: i + 1, sources }`. Comment: single-line call form only, by construction of this decomposition's call sites; a wrapped call is not found.
- [ ] **Step 4: Suite green; Step 5: Commit** — `Add findComposeCallSites — scan skill prose for single-line compose-context call sites (refs #1990)`.

### Task 3: `measureComposed`

**Files:**
- Modify: `plugin/bin/lib/skill-audit/context-cost.js` (add `usedConditionKeys`, `conditionCombinations`, `measureComposed`; import `parseMarkers`, `compose`, `KEYS`, `VOCAB`)
- Modify: `tests/bin-lib/skill-audit/context-cost.test.js` (append)

**Steps:**
- [ ] **Step 1: Failing tests** (fixture: temp repo with `skills/_shared/a.md` = `# A\n<!-- when: integration-model=pr-first -->\n` + `'p'.repeat(100)` + `\n<!-- /when -->\n<!-- when: transport=mcp -->\n` + `'m'.repeat(50)` + `\n<!-- /when -->\n`, and `skills/_shared/b.md` = plain `# B\nbody\n`):
  1. `usedConditionKeys: only the keys the sources use, in canonical order` — `['integration-model', 'transport']`.
  2. `measureComposed: one row per combination of the used keys, bytes differ where a branch is taken` — call site `{ step: 'x', file: 'f', sources: [a, b] }` → 4 combinations; the `{integration-model: 'pr-first', transport: 'mcp'}` row is the largest, `{local-merge, gh}` the smallest, and every row's `bytes` equals `Buffer.byteLength(compose(...))` recomputed in the test for that row's full six-key conditions (unused keys pinned to `VOCAB[k][0]`).
  3. `measureComposed: marker-free sources yield exactly one combination with empty conditions`.
  4. `measureComposed: a malformed source is reported on the row, never thrown (F1)` — a source with an unclosed marker → `{ error: 'file:line: message', combinations: [] }`.
  5. `measureComposed: a missing source is an error row naming the path`.
- [ ] **Step 2: Expected-FAIL probe** — `node -e 'console.log(typeof require("./plugin/bin/lib/skill-audit/context-cost.js").measureComposed)'` prints `undefined`.
- [ ] **Step 3: Implement.** `usedConditionKeys(sources)` (sources as `[{path, content}]`): union of `parseMarkers(content, path).filter((t) => t.type === 'open').map((t) => t.key)`, returned in `KEYS` order. `conditionCombinations(keys)`: cartesian product over `VOCAB[key]` for the used keys → array of partial condition objects (`[{}]` when no keys). `measureComposed(repoRoot, callSite)`: read every source (`{ path: path.relative(repoRoot, file), content }`; an ENOENT → `{ ...callSite, error: \`missing source: ${file}\`, combinations: [] }`); `usedConditionKeys` inside a try — a `MarkerError` → error row; for each combination build the full six-key conditions (`KEYS` pinned to `VOCAB[k][0]`, overridden by the combination), `bytes = Buffer.byteLength(compose(sources, conditions), 'utf8')`; return `{ step, file, line, sources, keys, combinations: [{ conditions, bytes }], max }`.
- [ ] **Step 4: Suite green; Step 5: Commit** — `Add measureComposed — composed bytes per call site under every combination of the keys its sources branch on (refs #1990)`.

### Task 4: `composedBytesReport`, the hard gate, the exception map, the evidence pre-check row

**Files:**
- Modify: `plugin/bin/lib/skill-audit/context-cost.js` (add `COMPOSED_STEP_EXCEPTIONS`, `composedBytesReport`, `overComposedCeiling`)
- Modify: `tests/bin-lib/skill-audit/context-cost.test.js` (append the hard gate, the stale-exception test, the AC2 fixture proof, the informational table)
- Modify: `plugin/skills/_shared/harness-health-analysis.md` (one evidence pre-check row, check 10, after check 9 — file is 36,410 B, ceiling 40,960 B; keep the row under 600 B)

**Steps:**
- [ ] **Step 1: Failing tests:**
  1. `overComposedCeiling: a synthetic call site whose composed bytes exceed 40 KB fails the gate (AC2)` — fixture sources totaling > `CEILING_BYTES` with no markers → `overComposedCeiling(composedBytesReport(root))` returns one entry `{ step, file, conditions: {}, bytes, ceiling: CEILING_BYTES }`.
  2. `overComposedCeiling: a per-step exception raises that step's ceiling only` — same fixture with `{ exceptions: { [step]: bytes + 1 } }` → `[]`; a different step name still fails.
  3. **Hard gate:** `no compose call site's composed bytes exceed its ceiling under any condition combination (#1990)` — `assert.deepStrictEqual(overComposedCeiling(composedBytesReport(REPO)).map(fmt), [])` with a message naming the composition rule (fence or restructure the sources, never raise `CEILING_BYTES`); rows with `error` fail the same assertion with the error text.
  4. `COMPOSED_STEP_EXCEPTIONS: every exception is still needed` — for each `[step, ceiling]`, some real row for that step has `max > CEILING_BYTES` (else the entry is stale: remove it), and `ceiling > CEILING_BYTES`.
  5. Informational: `reports composed bytes per call site and combination` — `console.log` one line per row: `step @ file:line — {k=v …}: N KB` for each combination, then `max`; assert every real row has `combinations.length >= 1` and no `error`.
- [ ] **Step 2: Expected-FAIL probe** — `node -e 'console.log(typeof require("./plugin/bin/lib/skill-audit/context-cost.js").composedBytesReport)'` prints `undefined`.
- [ ] **Step 3: Implement.** `COMPOSED_STEP_EXCEPTIONS = { merge: 56 * 1024 }` with a comment: measured 55,995 B under pr-first+gh at #1989 (parent #1987 promise F4); restructuring is a follow-up record filed at this record's wrap-up; the stale-exception test removes the entry's reason to exist the moment `merge` fits. `composedBytesReport(repoRoot)` = `findComposeCallSites(repoRoot).map((c) => measureComposed(repoRoot, c))`. `overComposedCeiling(rows, { exceptions = COMPOSED_STEP_EXCEPTIONS } = {})` → for each row, `ceiling = exceptions[row.step] ?? CEILING_BYTES`; emit `{ step, file, line, conditions, bytes, ceiling }` per combination over it, plus `{ step, file, line, error }` for error rows. Export all three.
- [ ] **Step 4: The evidence pre-check row** in `harness-health-analysis.md` after check 9: `10. **Composed-bytes measurement** (skills only). Run \`composedBytesReport\` from \`${CLAUDE_PLUGIN_ROOT}/bin/lib/skill-audit/context-cost.js\` over the plugin root and read the per-call-site table it returns (one row per compose call site, one column per condition combination its sources branch on); a combination over \`CEILING_BYTES\` — or a step carried by \`COMPOSED_STEP_EXCEPTIONS\` — is evidence for dimension 9, cited by the module's numbers, never restated here.` Then `wc -c` the file: must stay under 40,960.
- [ ] **Step 5: Suite green** (`context-cost.test.js`; the hard gate passes on the real corpus only through the `merge` exception — quote the printed table in the report). **Step 6: Commit** — `Add the composed-bytes hard gate with a per-step exception map, the report table, and the harness-health evidence row (refs #1990)`.

### Task 5: Callers, docs, measurement, full verification

**Files:**
- Modify: `docs/plugin-structure.md` (the `plugin/bin/lib/skill-audit/` line, if it enumerates context-cost.js's role — state the composed-bytes gate and the warning tier)
- Modify: `docs/skill-authoring.md` line 21 (the `**Size:**` sentence: 40 KB per file is a warning tier since #1990; the hard gate is composed bytes per compose call site)
- Read only: every importer of `CEILING_BYTES`, `measureSkills`, `measureSubFiles` (Global Constraints list)

**Steps:**
- [ ] **Step 1: Caller sweep** — `grep -rn "measureSkills\|measureSubFiles" plugin tests perf tools --include=*.js`: confirm no caller outside `context-cost.js` and its test (true at plan time — `option-description.js` only mentions it in a comment). Quote the grep output in the report.
- [ ] **Step 2: Docs** — the two edits above; `node --test tests/skill-graph-table-structure.test.js` (plugin-structure.md table pins).
- [ ] **Step 3: Measurement, quoted verbatim in the report:** `node -e 'const c=require("./plugin/bin/lib/skill-audit/context-cost.js");for(const r of c.composedBytesReport("plugin"))console.log(JSON.stringify({step:r.step,file:r.file,max:r.max,combinations:r.combinations}))'` — expected: two `merge` rows, four combinations each, max 55,995 (pr-first + gh) — and `node -e 'const c=require("./plugin/bin/lib/skill-audit/context-cost.js");const s=c.measureSkills("plugin");console.log(JSON.stringify({skills:s.length,over:c.overCeilingWarnings(s)}))'`.
- [ ] **Step 4: Targeted suites** — `node --test tests/bin-lib/skill-audit/` (all six), `node --test tests/bin-lib/plan-audit/checks.test.js`, `node --test tests/merge-size-probe-cli-e2e.test.js`, `node --test tests/bin-lib/compose-context/compose.test.js`. Then the full `npm test` redirected to a file; expected only the baseline failures listed in Global Constraints.
- [ ] **Step 5: Commit** — `Docs for the composed-bytes gate — skill-authoring size rule and plugin-structure line (refs #1990)`.

## Verification (whole plan)

- `node --test tests/bin-lib/skill-audit/context-cost.test.js` — every new test green; the hard gate passes only via the `merge` exception, the stale-exception test proves the exception is live.
- `node --test tests/bin-lib/skill-audit/bloat.test.js` and `node --test tests/bin-lib/plan-audit/checks.test.js` — `CEILING_BYTES` importers unchanged (AC5).
- CRLF proof (AC4), over-ceiling warning proof (AC3), synthetic over-40 KB gate proof (AC2) — all fixture-driven inside the suite.
- Real `merge` call site: four `integration-model` × `transport` combinations printed by the informational test (AC1).
- `npm test` — only the baseline failures (AC6).
