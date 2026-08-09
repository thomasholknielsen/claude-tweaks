# Superpowers Upstream-Drift Manifest Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `superpowers` entry to `tools/upstream-drift/manifest.yml` so the repo's heaviest dependency gets mechanical drift protection, backed by a complete pin/inert classification of every superpowers-citing file, and bring `.claude/skills/upstream-drift/SKILL.md` to truth about the shipped runner.

**Architecture:** The entry is pure data riding existing machinery — the runner iterates the manifest, the `plugin-cache-glob` probe type already exists (`impeccable-plugin` precedent), and `checks.js` does literal-substring `must-match` checks against the installed artifact root (the directory containing `.claude-plugin/`, so upstream-paths are `skills/...`-relative — identity mapping, verified). No `checks.js`/`manifest.js`/schema change of any kind (spec AC7).

**Tech Stack:** Hand-rolled YAML subset parser (`tools/upstream-drift/manifest.js` — supports `\"`/`\\` in double-quoted and `''` in single-quoted scalars), `node --test`, `gh` CLI.

## Global Constraints

- **Premise re-verified 2026-08-09 (build time):** installed superpowers is 6.2.0 (sole version under `~/.claude/plugins/cache/claude-plugins-official/superpowers/`), latest upstream tag is `v6.2.0`. Pin `"6.2.0"`.
- **No version bump, no CHANGELOG entry** — every touched path is maintainer-only unshipped surface (precedent: `240f40a2`).
- **No `checks.js`/`manifest.js` changes** — a diff touching those files fails spec AC7.
- **Never run `tools/upstream-drift/run.js` or `bin/*-health.js` with real arguments** — `run.js` writes a local dedup cache (`[IL-73]`). Verify via `node -e` against `checks.js` exports and the unit suites only.
- **Every `must-match` literal is verified against the installed artifact before writing** — no literal from memory or paraphrase (spec AC4). All literals below were grep-verified against `/Users/thomasholknielsen/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/` on 2026-08-09.
- Commit messages: `{Verb} {what} — refs #262` (imperative, no conventional-commit prefixes; `refs`, never `closes`/`fixes` — the record closes at wrap-up).
- Working directory for every command: the worktree root (`pwd` must equal `git rev-parse --show-toplevel` = `.../.claude/worktrees/superpowers-drift-manifest`).

---

### Task 1: Sweep classification ledger

**Files:**
- Create: `docs/plans/2026-08-09-262-sweep-classification.md`

**Interfaces:**
- Produces: the classification table (columns `File | Verdict | Detail`) that Task 2 reads for promoted pins and Task 4 posts verbatim as the #262 comment. Verdict vocabulary: exactly `pin` or `inert`.

- [ ] **Step 1: Enumerate the denominator**

Run from the worktree root:

```bash
git grep -il superpowers -- ':!docs/superpowers' ':!docs/incident-log.md'
```

Record the exact file count N (was 119 at plan time; recompute — the tree has moved). This N is the denominator: the classification table MUST have exactly N rows (spec AC3).

- [ ] **Step 2: Classify every file**

Classification rule (from the spec, apply verbatim):
- **inert** — bare `/superpowers:{name}` invocation references (they fail loudly at the Skill tool); descriptive prose; code identifiers with no behavioral dependency on upstream content; historical audit artifacts (materialized specs under `.claude-tweaks/pipelines/**`, eval fixtures, ADRs describing past decisions).
- **pin** — claims about upstream behavior, vocabulary, output shape, file layout, or sequencing that claude-tweaks acts on and whose breakage is silent.

Known verdicts (verified at plan time — do not re-derive, but do sanity-check each file still contains the cited claim):

| File | Verdict | Detail |
|---|---|---|
| `skills/_shared/subagent-output-contract.md` | pin | assertion 1 below (four-status vocabulary; file never says "superpowers" — it appears in the denominator only if the grep matches it; if the grep does NOT return it, still keep assertion 1 and note in the comment that the coupling is grep-invisible, which is exactly why it needs pinning — `[IL-15]`) |
| `skills/build/SKILL.md` | pin | assertions 2 + 3 below (finishing-branch suppression; Model Selection tier override) |
| `CLAUDE.md` | pin | assertion 4 below (brainstorming → writing-plans override) |
| `skills/_shared/local-files-preflight-stop.md` | pin | assertion 5 below (`.superpowers/sdd/` workspace path; `skills/wrap-up/summary-template.md`'s "SDD ledger" wording rides the same assertion) |
| `skills/build/failure-recovery.md` | pin | assertion 6 below (SDD's re-dispatch/escalation ladder backs the "built-in retry" deferral) |
| `skills/specify/decomposition-mode.md` | inert | REJECTED starting candidate: no upstream literal encodes a tasks-per-work-unit count — writing-plans' granularity vocabulary is per-step ("bite-sized", "2-5 minutes", "smallest unit that carries its own test cycle"); the 3–8 sizing is local convention, and the row's skill references are bare invocations. Gets the manifest comment (Task 2). |

For every other file: read enough of the file's superpowers-citing lines (`git grep -in superpowers -- <file>`) to judge. One-line reason per file. Do not bucket-wave: every row gets its own verdict, though the Detail may reference a shared reason (e.g. "materialized spec — historical audit artifact").

If a file's claim is pin-worthy but not already covered by assertions 1–6, derive a `must-match` literal, verify it with `grep -n '<literal>' /Users/thomasholknielsen/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/<upstream-path>` (must return exactly the expected line), and record it in the table row as `PROMOTE: {file → upstream-path → literal}`. A promoted pin that fails verification is a finding, not an assertion — record why it failed.

- [ ] **Step 3: Write the classification file**

`docs/plans/2026-08-09-262-sweep-classification.md`, structure:

```markdown
# Sweep classification — record #262 (denominator: N files)

Command: `git grep -il superpowers -- ':!docs/superpowers' ':!docs/incident-log.md'`
Run at: {commit sha of worktree HEAD when run}

| File | Verdict | Detail |
|---|---|---|
| ... one row per enumerated file, N rows total ... |
```

- [ ] **Step 4: Verify row-count parity**

Re-run the Step 1 command; assert its line count equals the table's data-row count. If the tree moved between Steps 1 and 3, re-run classification for the delta.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-08-09-262-sweep-classification.md
git commit -m "Add the #262 sweep classification ledger — refs #262"
```

---

### Task 2: Manifest entry + test expectation

**Files:**
- Modify: `tools/upstream-drift/manifest.yml` (append the entry after `impeccable-plugin`)
- Modify: `tools/upstream-drift/tests/manifest.test.js:400-403` (name-list expectation)

**Interfaces:**
- Consumes: Task 1's classification table — any `PROMOTE:` rows become additional assertions appended after assertion 6, same YAML shape, literals already verified by Task 1.
- Produces: the final `superpowers` entry whose assertion list Task 4's comment must mirror.

- [ ] **Step 1: Extend the test expectation (failing first)**

In `tools/upstream-drift/tests/manifest.test.js`, change the name-list assertion (currently lines 400–403):

```js
  assert.deepStrictEqual(
    result.dependencies.map((d) => d.name),
    ['impeccable-cli', 'impeccable-plugin', 'superpowers'],
  );
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node --test tools/upstream-drift/tests/manifest.test.js`
Expected: FAIL — the P3 real-manifest test reports the two-element list not matching the expected three.

- [ ] **Step 3: Append the manifest entry**

Append to `tools/upstream-drift/manifest.yml` (after the `impeccable-plugin` entry, same two-space list indentation). Add any Task-1 `PROMOTE:` assertions after assertion 6 in the same shape:

```yaml
  # superpowers: the repo's heaviest dependency — eight consumed skills, and
  # /build's controller rides SDD's documented loop. Assertions pin the upstream
  # literals claude-tweaks acts on; the full pin/inert classification of every
  # citing file (the sweep ledger) is a comment on #262.
  # Rejected assertion candidate: specify/decomposition-mode.md's 3-8
  # tasks-per-work-unit sizing — no upstream literal encodes a task count
  # (writing-plans' granularity vocabulary is per-step: "bite-sized",
  # "2-5 minutes"); the sizing is local convention, its skill references bare
  # invocations (inert).
  - name: superpowers
    kind: claude-plugin
    installed-probe:
      type: plugin-cache-glob
      glob: "~/.claude/plugins/cache/*/superpowers/*/.claude-plugin/plugin.json"
    pinned: "6.2.0"
    upstream:
      repo: "obra/superpowers"
      tag-prefix: "v"
    contract-paths:
      - "skills/subagent-driven-development/SKILL.md"
      - "skills/subagent-driven-development/implementer-prompt.md"
      - "skills/brainstorming/SKILL.md"
    assertions:
      - file: "skills/_shared/subagent-output-contract.md"
        claims: "the four-status vocabulary mirrors SDD's implementer statuses"
        upstream-path: "skills/subagent-driven-development/implementer-prompt.md"
        must-match: "DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT"
      - file: "skills/build/SKILL.md"
        claims: "SDD ends by invoking finishing-a-development-branch — the step /build suppresses"
        upstream-path: "skills/subagent-driven-development/SKILL.md"
        must-match: "Use superpowers:finishing-a-development-branch"
      - file: "skills/build/SKILL.md"
        claims: "SDD has a per-task model-selection heuristic the effort-tier override overrides"
        upstream-path: "skills/subagent-driven-development/SKILL.md"
        must-match: "## Model Selection"
      - file: "CLAUDE.md"
        claims: "brainstorming's terminal step invokes writing-plans — the step the project override suppresses"
        upstream-path: "skills/brainstorming/SKILL.md"
        must-match: "Invoke the writing-plans skill"
      - file: "skills/_shared/local-files-preflight-stop.md"
        claims: "the SDD workspace lives at .superpowers/sdd/ — also cited as the SDD ledger by wrap-up's summary template"
        upstream-path: "skills/subagent-driven-development/scripts/sdd-workspace"
        must-match: 'base="$root/.superpowers/sdd"'
      - file: "skills/build/failure-recovery.md"
        claims: "SDD handles failed tasks with its own re-dispatch/escalation ladder — the recovery table defers to it before main-thread fallback"
        upstream-path: "skills/subagent-driven-development/SKILL.md"
        must-match: "provide more context and re-dispatch with the same model"
    # fixtures: [] — frozen-artifact rationale: an installed plugin cache dir is
    # immutable post-install, so version movement is the only mechanical change
    # signal; there is no runtime surface to replay (the impeccable-plugin
    # precedent). Falsifier, accepted as out-of-scope risk: a same-version
    # re-publish replacing bytes under an existing cache dir would go unseen.
    fixtures: []
```

Literal-verification provenance (all grep-verified against the installed 6.2.0 artifact at plan time; Task 1 re-verifies nothing here, but the deterministic check in Step 5 re-executes every one):
1. `implementer-prompt.md:130` · 2. `SKILL.md:423` · 3. `SKILL.md:157` · 4. `brainstorming/SKILL.md:131` · 5. `scripts/sdd-workspace:36` · 6. `SKILL.md:245`.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node --test tools/upstream-drift/tests/manifest.test.js` — Expected: PASS.
Run: `node --test tools/upstream-drift/tests/` — Expected: PASS (run.test.js's generic `length >= 2` iteration and stubbed `buildFindings` are unaffected by design; this run proves it).

- [ ] **Step 5: Run the deterministic check (spec AC1)**

From the worktree root:

```bash
node -e "const{loadManifest}=require('./tools/upstream-drift/manifest.js');const{checkVersion,checkAssertions,replayFixtures}=require('./tools/upstream-drift/checks.js');const d=loadManifest('./tools/upstream-drift/manifest.yml').dependencies.find(x=>x.name==='superpowers');console.log(JSON.stringify({version:checkVersion(d),assertions:checkAssertions(d),fixtures:replayFixtures(d)},null,2))"
```

Expected: `version.status: "ok"` with installed `["6.2.0"]` including pinned `6.2.0`; every assertion result `status: "ok"`; fixtures `status: "ok"` (empty). Any `unmatched`/`missing-file` = a wrong literal or path — fix the entry (never the checker) and re-run.

- [ ] **Step 6: Commit**

```bash
git add tools/upstream-drift/manifest.yml tools/upstream-drift/tests/manifest.test.js
git commit -m "Add the superpowers entry to the upstream-drift manifest — refs #262"
```

---

### Task 3: upstream-drift SKILL.md truth pass

**Files:**
- Modify: `.claude/skills/upstream-drift/SKILL.md` (four sites: lines 23, 35, 107, 116 at plan time)

**Interfaces:**
- Consumes: nothing from other tasks (independent).
- Produces: nothing downstream — target state is spec AC6: zero remaining text describing #143, the runner, or a `--source upstream-drift-runner` flag as future/existing mechanism respectively.

- [ ] **Step 1: Rewrite the Lifecycle line (line 23)**

Replace:

```markdown
**Lifecycle:** utility, no fixed position. Runs standalone today; `#143` will add the runner, version-driven triggers, and issue filing that make it schedulable.
```

with:

```markdown
**Lifecycle:** utility, no fixed position. Runs standalone, or on a schedule via `tools/upstream-drift/run.js` — the runner decides which dependencies are DUE from version movement and emits issue payloads on stdout for the caller to file.
```

- [ ] **Step 2: Rewrite the "Not for" filing sentence (line 35)**

Replace:

```markdown
Not for: editing upstream, editing `skills/**`, or filing issues. This skill produces findings; `#143` owns turning them into `by:upstream-drift` GitHub issues. Not for auditing this repo's own harness documentation — that is `/claude-tweaks:harness-health`.
```

with:

```markdown
Not for: editing upstream, or editing `skills/**`. This skill produces findings; when they should become `by:upstream-drift` GitHub issues, `tools/upstream-drift/run.js` emits the deduplicated payloads on stdout and the caller — this skill's user, or a human piping the output — files them. Not for auditing this repo's own harness documentation — that is `/claude-tweaks:harness-health`.
```

- [ ] **Step 3: Rewrite Next Actions Option 1's description (line 107)**

Replace:

```markdown
- Option 1 — `label`: `"File the findings"`, `description`: `"/claude-tweaks:capture — capture the capability findings as backlog records; the automated by:upstream-drift filing path arrives with #143"`. Suffix the label `(Recommended)` when any finding is `severity: high`.
```

with:

```markdown
- Option 1 — `label`: `"File the findings"`, `description`: `"/claude-tweaks:capture — capture the capability findings as backlog records; drift findings can instead ride tools/upstream-drift/run.js, which emits deduplicated by:upstream-drift issue payloads on stdout for the caller to file"`. Suffix the label `(Recommended)` when any finding is `severity: high`.
```

- [ ] **Step 4: Rewrite the Component-Skill Contract paragraph (line 116)**

Replace:

```markdown
`#143` (runner, version-driven triggers, issue filing) is the first foreseen parent. When it lands it must set `--source upstream-drift-runner`, and this contract must then gate `## Next Actions` on that flag — the runner owns the handoff once it exists. `$PIPELINE_RUN_DIR` is **not** the right signal here: that variable marks a `/claude-tweaks:flow` pipeline run, and this skill's runner is a scheduled sweep, not a pipeline orchestrator.
```

with:

```markdown
The runner (`tools/upstream-drift/run.js`) is not a parent either: it never invokes this skill — the split runs the other way, with the runner emitting issue payloads on stdout and the skill (or a human piping the output) filing them. No runner-set flag exists, so nothing gates `## Next Actions` on one. `$PIPELINE_RUN_DIR` is **not** a signal here either: that variable marks a `/claude-tweaks:flow` pipeline run, and a scheduled drift sweep is not a pipeline orchestrator.
```

- [ ] **Step 5: Verify AC6 (zero stale text)**

Run: `grep -n '#143\|--source upstream-drift-runner\|upstream-drift-runner' .claude/skills/upstream-drift/SKILL.md`
Expected: no output. (The `#143`-quoting sweep-classification file from Task 1 and this plan are exempt — the AC covers the SKILL.md only.)

Then read the four edited regions in full (not the diff) to confirm no sentence was split mid-flow (`[IL-27]`).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/upstream-drift/SKILL.md
git commit -m "Bring the upstream-drift skill to truth about the shipped runner — refs #262"
```

---

### Task 4: Post the #262 classification comment

**Files:**
- None (a `gh` write; reads `docs/plans/2026-08-09-262-sweep-classification.md` and `tools/upstream-drift/manifest.yml`)

**Interfaces:**
- Consumes: Task 1's classification file (final content, including any `PROMOTE:` rows Task 2 turned into assertions) and Task 2's final entry.

- [ ] **Step 1: Compose the comment body**

Header: the sweep command verbatim, the denominator N, and the worktree HEAD sha it was computed at. Body: the full N-row classification table. For each `pin` row, the Detail must state the assertion it became (file → upstream-path → must-match literal). For the rejected candidate, restate the rejection reason. Close with: any promoted-then-failed candidates and their reasons (or "none").

- [ ] **Step 2: Verify parity before posting**

Re-run the sweep command; its output count must equal the table row count. The set of `pin` rows must equal the entry's assertion `file:` values plus grep-invisible couplings noted as such (subagent-output-contract.md may be table-listed only if the grep returned it; the assertion exists regardless).

- [ ] **Step 3: Post**

```bash
gh issue comment 262 --body-file /tmp/262-comment.md
```

(Write the composed body to the scratchpad first; any path works — the file is disposable.)

- [ ] **Step 4: Verify the comment landed**

Run: `gh issue view 262 --json comments --jq '.comments[-1].body' | head -5`
Expected: the sweep-command header line.

No commit — this task changes no tracked file.

---

## Self-review notes (spec coverage)

- Deliverable 1 (premise re-verify) — done at plan time, recorded in Global Constraints; Task 2 Step 5's deterministic check re-executes the version probe at build time.
- Deliverable 2 (entry) — Task 2. Deliverable 3 (sweep + denominator) — Task 1. Deliverable 4 (durable ledger comment + rejected-candidate manifest comment) — Tasks 4 + 2. Deliverable 5 (four starting assertions) — Task 2, none dropped. Deliverable 6 (pre-located candidates) — sdd-workspace and failure-recovery promoted (assertions 5, 6); decomposition-mode rejected with manifest comment. Deliverable 7 (test expectation) — Task 2 Step 1. Deliverable 8 (SKILL.md truth pass) — Task 3.
- AC1 → Task 2 Step 5; AC2 → Task 2 Step 4 + final full `npm test` (build's Common Step 5); AC3 → Task 1 Step 4 + Task 4 Step 2; AC4 → literals 1–6 verified at plan time + deterministic check re-executes; AC5 → fixtures comment in the entry; AC6 → Task 3 Step 5; AC7 → no task touches `checks.js`/`manifest.js`.
