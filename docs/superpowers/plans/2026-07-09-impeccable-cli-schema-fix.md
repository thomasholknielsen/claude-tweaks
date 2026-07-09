# Impeccable CLI Schema-Drift Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `skills/design/impeccable-cli.md` and `skills/design/modes/test.md` to document and parse the Impeccable CLI's real, verified output shape (bare JSON array, `antipattern`/`description` fields, `warning`/`advisory` severities, deliberate exit codes), then cascade the resulting severity-language change through every file that describes the gate's pass/fail behavior, and close the resolved item in `specs/DEFERRED.md`.

**Architecture:** Three prose-only skill-markdown edits, no code or tests. Task 1 rewrites the canonical schema reference (`impeccable-cli.md`). Task 2 rewrites the mode that parses per that reference (`modes/test.md`). Task 3 updates every satellite file that echoes the old "errors fail / warnings don't" language in its own words, then removes the now-resolved `specs/DEFERRED.md` entry.

**Tech Stack:** Markdown (skill content) only. No Node code, no `npm test` — verification is exact-text `grep`/`Read` checks against this plan's literal before/after blocks.

## Global Constraints

- Every replacement severity value is exactly `warning` or `advisory` — never reintroduce `error`, `info`, or any other severity token into the files this plan touches (`error`/`info` genuinely do not exist in CLI 3.2.0's output).
- Every replacement field name is exactly `antipattern`, `name`, `description`, `severity`, `file`, `line`, `snippet` — never `rule` or `message` (those field names do not exist in real CLI output).
- Do not touch `skills/design/modes/review.md`, `skills/review/SKILL.md`, or `skills/design/command-map.md` — their `error`/`warning`/`info` severity language belongs to the separate LLM-driven `critique`/`audit` Impeccable skill commands, a different code path this fix does not address.
- Do not remove or alter the `--fast` flag from any invocation example — it stays in the CLI invocation (documented elsewhere as a separate, non-urgent cleanup), this plan only fixes what the flag's *output* looks like once parsed.
- File paths in CLI output are absolute, not relative to project root — every place this plan touches that claims otherwise must be corrected to say absolute.

---

### Task 1: Rewrite `skills/design/impeccable-cli.md`'s schema documentation

**Files:**
- Modify: `skills/design/impeccable-cli.md`

**Interfaces:**
- Produces: the canonical schema reference that Task 2's `modes/test.md` Step 5 points to by name (`../impeccable-cli.md`'s "schema rules," specifically "rules 1-4" for field-level parsing and "rule 7" for the malformed-output skip object). Task 2's implementer must find these rule numbers matching what this task actually writes — the exact numbering below is load-bearing for Task 2's cross-reference.

- [ ] **Step 1: Fix the header's "last verified" line**

In `skills/design/impeccable-cli.md`, replace:

````markdown
*Last verified against Impeccable skill 3.9.1 / CLI 3.2.0 (2026-07-07).*
````

With:

````markdown
*Last verified against Impeccable CLI 3.2.0 (2026-07-09), verified directly against live output and the installed package source.*
````

- [ ] **Step 2: Fix the "Working directory" section's absolute-path claim**

Replace:

````markdown
Run the CLI from the project root (the directory containing the spec/CLAUDE.md). File paths in the output will be relative to this directory.
````

With:

````markdown
Run the CLI from the project root (the directory containing the spec/CLAUDE.md) so relative `<files>` arguments resolve correctly. File paths in the output are absolute (the CLI resolves each target with `path.resolve()` before scanning), regardless of the working directory used to invoke it.
````

- [ ] **Step 3: Rewrite "Expected JSON output schema" through "Schema version compatibility"**

Replace the entire block from `## Expected JSON output schema` through the end of the `### Schema version compatibility` section (everything from the `## Expected JSON output schema` heading down to, and including, the "Malformed output is treated as a skip, not a fail — same rationale as availability check." line just before `## Sample invocation (canonical)`):

````markdown
## Expected JSON output schema

The CLI emits a single JSON object on stdout. Expected shape:

```json
{
  "files_scanned": 12,
  "findings": [
    {
      "file": "src/components/Hero.tsx",
      "rule": "purple-gradient",
      "severity": "error",
      "line": 47,
      "message": "Avoid the default purple→pink gradient — overused and recognizable as AI-default."
    },
    {
      "file": "src/components/Card.tsx",
      "rule": "fixed-pixel-padding",
      "severity": "warning",
      "line": 12,
      "message": "Padding hard-coded in pixels — prefer spacing tokens."
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `files_scanned` | integer | Yes | Total files the CLI inspected |
| `findings` | array | Yes | May be empty (zero findings = pass) |
| `findings[].file` | string | Yes | Path relative to project root |
| `findings[].rule` | string | Yes | Rule identifier (use for de-dup, grouping) |
| `findings[].severity` | string | Yes | One of `error`, `warning`, `info` |
| `findings[].line` | integer | No | Line number (omitted for file-level findings) |
| `findings[].message` | string | Yes | Human-readable description |

### Severity-to-result mapping

| Highest severity in findings | Wrapper result |
|------------------------------|----------------|
| No findings | `pass` |
| `info` only | `pass` (informational, surfaced in output but not gate-blocking) |
| `warning` only | `pass` (warnings appear in output, do not fail the gate) |
| Any `error` | `fail` (gate fails, caller blocks pipeline) |

### Schema version compatibility

The schema above reflects what the wrapper was built against. The CLI may evolve. Defensive parsing rules:

1. **Unknown top-level fields** → ignore (do not fail).
2. **Unknown finding fields** → ignore (do not fail).
3. **Missing `files_scanned`** → fall back to counting unique values of `findings[].file`; emit a warning.
4. **Missing `findings`** → treat as `findings: []` (pass result).
5. **Severity values not in {`error`, `warning`, `info`}** → treat as `error` (fail-safe — unknown severity is more serious, not less).
6. **Malformed JSON / non-zero exit** → return:

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI returned malformed output",
  "install_hint": "Reinstall: `npm install -g impeccable` and verify with `npx impeccable --version`"
}
```

Malformed output is treated as a skip, not a fail — same rationale as availability check.
````

With:

````markdown
## Expected JSON output schema

The CLI emits a single JSON array on stdout — one element per finding, no top-level wrapper object. Expected shape:

```json
[
  {
    "antipattern": "ai-color-palette",
    "name": "AI color palette",
    "description": "Purple/violet gradients and cyan-on-dark are the most recognizable tells of AI-generated UIs. Choose a distinctive, intentional palette.",
    "severity": "warning",
    "file": "/project/src/components/Hero.tsx",
    "line": 47,
    "snippet": "from-purple-500 gradient"
  }
]
```

### Field reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `antipattern` | string | Yes | Rule identifier (use for de-dup, grouping) |
| `name` | string | Yes | Short human-readable rule name |
| `description` | string | Yes | Full explanation of the anti-pattern |
| `severity` | string | Yes | `warning` (default — most rules) or `advisory` (9 specific rule ids: `repeated-section-kickers`, `numbered-section-markers`, `design-system-color`, `design-system-radius`, `gpt-thin-border-wide-shadow`, `repeating-stripes-gradient`, `codex-grid-background`, `theater-slop-phrase`, `image-hover-transform`) |
| `file` | string | Yes | Absolute path (the CLI resolves before scanning) |
| `line` | integer | Yes | Line number; `0` for file-level findings (the CLI always sets this field, defaulting to `0`) |
| `snippet` | string | Yes | The matched text/pattern that triggered the finding |

### Severity-to-result mapping

| Findings present | Wrapper result |
|-------------------|----------------|
| None (`[]`) | `pass` |
| `advisory` only | `pass` (surfaced in output, does not block) |
| Any `warning` | `fail` (gate fails, caller blocks pipeline) |

### Schema version compatibility

The schema above reflects verified live CLI 3.2.0 output and source. The CLI may evolve. Defensive parsing rules:

1. **Unknown finding fields** → ignore (do not fail).
2. **Top-level JSON is an array** → treat directly as the findings list (this is the real, verified shape).
3. **Top-level JSON is an object exposing a `findings` array** → use `.findings` as the findings list, ignore other top-level fields (forward-compatibility only — not the current real shape, but cheap to keep in case a future CLI version reintroduces a wrapper).
4. **`severity` not in `{warning, advisory}`** → treat as `warning` (fail-safe — unknown is more serious, not less).
5. **Exit code 0** → treat as zero findings, regardless of stdout content (the CLI's own "nothing found" signal).
6. **Exit code 2** → expect a non-empty JSON array on stdout; parse per rules 1-4 above.
7. **Any other exit code, or stdout that fails to parse as JSON under rules 5-6** → malformed output; return:

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI returned malformed output",
  "install_hint": "Reinstall: `npm install -g impeccable` and verify with `npx impeccable --version`"
}
```

Malformed output is treated as a skip, not a fail — same rationale as availability check.
````

- [ ] **Step 4: Rewrite "Sample invocation (canonical)"**

Replace:

````markdown
## Sample invocation (canonical)

```bash
$ npx impeccable detect --fast --json src/components/Hero.tsx src/components/Card.tsx
{"files_scanned":2,"findings":[
  {"file":"src/components/Hero.tsx","rule":"purple-gradient","severity":"error","line":47,"message":"..."},
  {"file":"src/components/Card.tsx","rule":"fixed-pixel-padding","severity":"warning","line":12,"message":"..."}
]}
```

Wrapper returns:

```json
{
  "mode": "test",
  "result": "fail",
  "files_scanned": 2,
  "findings": [
    { "file": "src/components/Hero.tsx", "rule": "purple-gradient", "severity": "error", "line": 47, "message": "..." },
    { "file": "src/components/Card.tsx", "rule": "fixed-pixel-padding", "severity": "warning", "line": 12, "message": "..." }
  ]
}
```

**Result rules:** Any `severity: error` sets `result: fail`. Otherwise `result: pass`. Warnings appear in the findings list but never promote the result. Empty `findings: []` is a pass.
````

With:

````markdown
## Sample invocation (canonical)

```bash
$ npx impeccable detect --fast --json src/components/Hero.tsx
[
  {
    "antipattern": "ai-color-palette",
    "name": "AI color palette",
    "description": "Purple/violet gradients and cyan-on-dark are the most recognizable tells of AI-generated UIs. Choose a distinctive, intentional palette.",
    "severity": "warning",
    "file": "/project/src/components/Hero.tsx",
    "line": 47,
    "snippet": "from-purple-500 gradient"
  }
]
```

Wrapper returns:

```json
{
  "mode": "test",
  "result": "fail",
  "files_scanned": 1,
  "findings": [
    { "antipattern": "ai-color-palette", "name": "AI color palette", "description": "Purple/violet gradients and cyan-on-dark are the most recognizable tells of AI-generated UIs. Choose a distinctive, intentional palette.", "severity": "warning", "file": "/project/src/components/Hero.tsx", "line": 47, "snippet": "from-purple-500 gradient" }
  ]
}
```

**Result rules:** Any `severity: warning` sets `result: fail`. Otherwise `result: pass`. `advisory` findings appear in the findings list but never promote the result. Empty findings (`[]`) is a pass.
````

- [ ] **Step 5: Rewrite "Open items" to close the drift note**

Replace:

````markdown
## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. Re-validate sample output after every Impeccable major version bump. Last re-validated 2026-07-07 against skill 3.9.1 / CLI 3.2.0 (see header note) — **the schema HAS drifted and defensive parsing is NOT currently sufficient** (discrepancy first found in commit `ebf5762`): live CLI 3.2.0 output is a bare JSON array, not the `{files_scanned, findings: [...]}` wrapper documented above; findings use `antipattern`/`description` fields instead of `rule`/`message`; and the CLI exits non-zero whenever any finding is present (any severity), which collides with this file's own "non-zero exit → malformed output → skip" rule above and would let a real failing gate get silently misreported as a skip. This is not fixed here — see `specs/DEFERRED.md`'s "Impeccable CLI schema has drifted from documented shape" entry for the dedicated follow-up.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
````

With:

````markdown
## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. This schema was last re-verified directly against live CLI output and installed package source on 2026-07-09 (CLI 3.2.0) — re-verify the same way after any future Impeccable CLI major version bump, the way the 2026-07-07 drift was originally caught.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
````

- [ ] **Step 6: Verify no stale field/severity names remain**

Run: `grep -n '"rule":\|"message":\|severity: error\|Total files the CLI inspected' skills/design/impeccable-cli.md`
Expected: no output (empty match) — every prior `rule`/`message`/`error`/object-wrapper reference in this file has been replaced.

Run: `grep -c 'antipattern\|advisory' skills/design/impeccable-cli.md`
Expected: `8`

- [ ] **Step 7: Commit**

```bash
git add skills/design/impeccable-cli.md
git commit -m "Rewrite Impeccable CLI schema doc to match verified live CLI 3.2.0 output"
```

---

### Task 2: Rewrite `skills/design/modes/test.md`'s parsing and pass/fail logic

**Files:**
- Modify: `skills/design/modes/test.md`

**Interfaces:**
- Consumes: `skills/design/impeccable-cli.md`'s defensive-parsing rules 1-4 (field-level normalization) and rule 7 (the malformed-output skip object), as written by Task 1. This task's Step 5 procedure must reference those rule numbers, which Task 1 already fixed in place — do not renumber them independently.
- Produces: the `{mode: "test", result, files_scanned, findings}` output shape (new field names: `antipattern`, `name`, `description`, `severity`, `file`, `line`, `snippet`) that Task 3's `skills/test/SKILL.md` and `skills/_shared/design-wrapper-handling.md` edits describe in their own result-handling tables.

- [ ] **Step 1: Fix the "When this runs" severity language**

Replace:

````markdown
Called by `/claude-tweaks:test` after the standard verification suite (types/lint/tests). Acts as a frontend anti-pattern gate via the deterministic Impeccable CLI. Errors fail the gate; warnings/skips do not.
````

With:

````markdown
Called by `/claude-tweaks:test` after the standard verification suite (types/lint/tests). Acts as a frontend anti-pattern gate via the deterministic Impeccable CLI. Findings with `severity: warning` fail the gate; `advisory` findings and skips do not.
````

- [ ] **Step 2: Rewrite Step 5 (Parse JSON output) and Step 6 (Compute pass/fail)**

Replace:

````markdown
### Step 5: Parse JSON output

Parse per `../impeccable-cli.md`'s schema rules into normalized findings.

### Step 6: Compute pass/fail

- **pass** — zero findings, or all findings are `severity: warning`
- **fail** — any finding with `severity: error`

Warnings are included in the findings list but do not cause `result: fail`. Callers may surface warnings informationally.
````

With:

````markdown
### Step 5: Parse JSON output

1. Capture stdout and the process exit code from Step 4's invocation.
2. Exit code `0` → treat as zero findings; skip to Step 6 with an empty findings list.
3. Exit code `2` → parse stdout as JSON per `../impeccable-cli.md`'s schema rules 1-4 into normalized findings.
4. Any other exit code, or a parse failure under step 3 → return the malformed-output skip object from `../impeccable-cli.md`'s rule 7 immediately; do not proceed to Step 6.

`files_scanned` is the count of files in the list resolved by Steps 2-3 — the CLI's own output never includes this field.

### Step 6: Compute pass/fail

- **pass** — zero findings, or all findings are `severity: advisory`
- **fail** — any finding with `severity: warning`

`advisory` findings are included in the findings list but do not cause `result: fail`. Callers may surface them informationally.
````

- [ ] **Step 3: Fix the "Output to caller" JSON template**

Replace:

````markdown
## Output to caller

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [ { "file": "...", "rule": "...", "severity": "...", "line": <int>, "message": "..." }, ... ]
}
```
````

With:

````markdown
## Output to caller

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [ { "antipattern": "...", "name": "...", "description": "...", "severity": "...", "file": "...", "line": <int>, "snippet": "..." }, ... ]
}
```
````

- [ ] **Step 4: Verify no stale field/severity names remain**

Run: `grep -n '"rule"\|"message"\|severity: error' skills/design/modes/test.md`
Expected: no output (empty match).

Run: `grep -n 'severity: warning\|severity: advisory\|antipattern' skills/design/modes/test.md`
Expected: 4 matching lines (Step 1's "When this runs" line, Step 6's pass/fail bullets, and the Output to caller template all use the new terms).

- [ ] **Step 5: Commit**

```bash
git add skills/design/modes/test.md
git commit -m "Fix design test mode's parsing to match real CLI exit codes and severities"
```

---

### Task 3: Cascade severity-language updates and close the deferred item

**Files:**
- Modify: `skills/design/SKILL.md`
- Modify: `skills/test/SKILL.md`
- Modify: `skills/_shared/design-wrapper-handling.md`
- Modify: `specs/DEFERRED.md`

**Interfaces:**
- Consumes: the `severity: warning` (fails) / `severity: advisory` (informational) result contract Task 2 implemented, and the `antipattern`/`description` field names Task 1 and Task 2 established. This task makes zero logic changes — it only re-states that same contract in each file's own descriptive language.

- [ ] **Step 1: Fix `skills/design/SKILL.md`'s mode summary**

Replace:

````markdown
Runs `npx impeccable detect --fast --json` as a frontend anti-pattern gate. Errors fail the gate; warnings do not. Read `modes/test.md` in this skill's directory for the full procedure.
````

With:

````markdown
Runs `npx impeccable detect --fast --json` as a frontend anti-pattern gate. Findings with `severity: warning` fail the gate; `advisory` findings do not. Read `modes/test.md` in this skill's directory for the full procedure.
````

- [ ] **Step 2: Fix `skills/test/SKILL.md`'s Result handling table**

Replace:

````markdown
| `{result: "pass", findings: [...]}` (zero findings or warnings only) | Proceed. Surface warnings in the test output as informational. |
| `{result: "fail", findings: [...]}` (any `severity: error`) | **Fail the test gate.** Surface the findings table in the test report. Do NOT auto-fix — design findings require human judgment. |
````

With:

````markdown
| `{result: "pass", findings: [...]}` (zero findings, or advisory only) | Proceed. Surface advisory findings in the test output as informational. |
| `{result: "fail", findings: [...]}` (any `severity: warning`) | **Fail the test gate.** Surface the findings table in the test report. Do NOT auto-fix — design findings require human judgment. |
````

- [ ] **Step 3: Fix `skills/test/SKILL.md`'s reporting template and Design Findings table**

Replace:

````markdown
| Design CLI | {pass/fail/skipped} | {Xs} | {N findings: Y errors, Z warnings} or {skip reason} |
```

If errors are present, append a Design Findings section before the standard test-failure section:

```markdown
### Design Findings (Impeccable CLI)

| File | Line | Rule | Severity | Message |
|------|------|------|----------|---------|
| {file} | {line} | {rule} | error | {message} |
```
````

With:

````markdown
| Design CLI | {pass/fail/skipped} | {Xs} | {N findings: Y warning, Z advisory} or {skip reason} |
```

If `severity: warning` findings are present, append a Design Findings section before the standard test-failure section:

```markdown
### Design Findings (Impeccable CLI)

| File | Line | Antipattern | Severity | Description |
|------|------|-------------|----------|-------------|
| {file} | {line} | {antipattern} | warning | {description} |
```
````

- [ ] **Step 4: Fix `skills/test/SKILL.md`'s Relationship table row**

Replace:

````markdown
| `/claude-tweaks:design` | /test invokes `/claude-tweaks:design test <files>` as Step 1.5 after the standard suite. Errors fail the gate; warnings and skips do not. The wrapper handles its own detection and availability checks. |
````

With:

````markdown
| `/claude-tweaks:design` | /test invokes `/claude-tweaks:design test <files>` as Step 1.5 after the standard suite. Findings with `severity: warning` fail the gate; `advisory` findings and skips do not. The wrapper handles its own detection and availability checks. |
````

- [ ] **Step 5: Fix `skills/_shared/design-wrapper-handling.md`'s example**

Replace:

````markdown
| `{result: "fail", findings: [...]}` | The mode ran and found blocking issues (e.g., `test` mode found `severity: error`) | Fail the caller's gate. Surface findings to the user. Do not auto-fix — design findings require human judgment. |
````

With:

````markdown
| `{result: "fail", findings: [...]}` | The mode ran and found blocking issues (e.g., `test` mode found `severity: warning`) | Fail the caller's gate. Surface findings to the user. Do not auto-fix — design findings require human judgment. |
````

- [ ] **Step 6: Remove the resolved entry from `specs/DEFERRED.md`**

Replace:

````markdown
### Impeccable CLI schema has drifted from documented shape

**Origin:** Discovered 2026-07-07 during Task 4 of the Impeccable re-baseline plan (`docs/superpowers/plans/2026-07-07-impeccable-rebaseline.md`), commit `ebf5762`, while live-verifying the `--fast` CLI flag against the real Impeccable CLI 3.2.0.

**Context:** `skills/design/impeccable-cli.md` documents the Impeccable CLI's `detect --fast --json` output as a JSON object shaped `{files_scanned, findings: [...]}`, with each finding carrying `rule`/`message` fields. Live output from CLI 3.2.0 does not match this: it's a bare JSON array (no `files_scanned`/`findings` wrapper), and each element uses `antipattern`/`description` instead of `rule`/`message`. Separately, CLI 3.2.0 exits non-zero whenever any finding is present, regardless of severity — but `impeccable-cli.md`'s own defensive-parsing rules treat "non-zero exit" as "malformed output" and instruct the wrapper to skip rather than fail. The two affected files are `skills/design/impeccable-cli.md` (the schema documentation, whose "Expected JSON output schema" section and non-zero-exit handling were deliberately left untouched by the Task 4 fix) and `skills/design/modes/test.md` (the mode that invokes the CLI per that schema and computes the `pass`/`fail` result consumed by `/claude-tweaks:design test`). As documented today, a real failing gate — findings with `severity: error` — would exit non-zero and get classified as "CLI returned malformed output" → skip, rather than surfacing as a fail.

**Trigger:** Revisit before trusting `/claude-tweaks:test`'s deterministic Impeccable gate against any project running current Impeccable CLI (3.x). Also revisit proactively whenever someone next touches the `/design test`/`review`/`audit` modes.

**Options considered:** (a) rewrite `impeccable-cli.md`'s schema section to match the new bare-array/`antipattern`-field shape and update `test.md`'s pass/fail logic accordingly, verified against real CLI output; (b) pin the wrapper to invoke an older CLI version if one is still available; (c) treat this as a signal to move toward Impeccable's own new automatic hook (see `skills/build/worktree-setup.md`'s "Impeccable hook consent" section) as the primary detection mechanism instead of the CLI-based `test` mode, if the hook's own output format proves more stable.

````

With:

````markdown
````

(i.e., delete the entire entry — the four paragraphs above plus the blank line separating it from the next entry — leaving the `### Fix flaky ...` entry immediately following the `### Scope harness-health's runs/ ...` entry's `**Options considered:**` line, exactly as if this entry had never existed between them.)

- [ ] **Step 7: Verify no stale field/severity names remain, and the deferred entry is gone**

Run: `grep -rn 'severity: error\|{rule}\|{message}\|errors, Z warnings' skills/design/SKILL.md skills/test/SKILL.md skills/_shared/design-wrapper-handling.md`
Expected: no output (empty match).

Run: `grep -c 'Impeccable CLI schema has drifted' specs/DEFERRED.md`
Expected: `0`

Run: `grep -c '^### ' specs/DEFERRED.md`
Expected: `2` (only the harness-health `runs/`+`churn-report` entry and the flaky-statusline-test entry remain)

- [ ] **Step 8: Commit**

```bash
git add skills/design/SKILL.md skills/test/SKILL.md skills/_shared/design-wrapper-handling.md specs/DEFERRED.md
git commit -m "Cascade Impeccable severity-language fix and close resolved DEFERRED.md entry"
```
