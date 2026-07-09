# Impeccable CLI Schema-Drift Fix — Design

## Problem

`skills/design/impeccable-cli.md` documents the Impeccable CLI's `detect --fast --json` output as a JSON object shaped `{files_scanned, findings: [...]}`, with each finding carrying `rule`/`message`/`severity: error|warning|info` fields. `skills/design/modes/test.md` (the `/claude-tweaks:design test` mode invoked by `/claude-tweaks:test` Step 1.5) parses per that documented schema and computes `result: pass|fail` from it.

This was discovered wrong on 2026-07-07 (commit `ebf5762`, tracked in `specs/DEFERRED.md`) and re-verified today (2026-07-09) directly against live CLI 3.2.0 output and its installed source (`findings.mjs`, `cli/engine/cli/main.mjs`, `registry/antipatterns.mjs`):

- Real output is a **bare JSON array** of findings, not an object wrapper. `files_scanned` does not exist in CLI output at all — it was never really there, at any CLI version this repo has tested against.
- Each finding is `{antipattern, name, description, severity, file, line, snippet}` — not `{rule, severity, line, message}`.
- `severity` only ever takes two real values: `warning` (the default — applies to the large majority of rules: purple/AI-tell gradients, low contrast, bounce easing, layout-transition jank, colored glow on dark backgrounds) and `advisory` (an explicit override on exactly 9 rule ids: `repeated-section-kickers`, `numbered-section-markers`, `design-system-color`, `design-system-radius`, `gpt-thin-border-wide-shadow`, `repeating-stripes-gradient`, `codex-grid-background`, `theater-slop-phrase`, `image-hover-transform`). **`severity: error` never occurs.** Independent of the exit-code bug below, this alone means the current "fail only on `severity: error`" logic can never fail.
- Exit codes are deliberate, not incidental: `process.exit(0)` when zero findings, `process.exit(2)` specifically when findings are present (any severity). A genuine parse failure (crash, non-JSON stdout) is the only case that should mean "skip" — but the current docs treat *any* non-zero exit as "malformed output → skip," so a real findings-present run (exit 2) gets misclassified as a skip instead of evaluated.
- `file` is an **absolute path** (the CLI does `path.resolve(target)` before scanning), not relative-to-project-root as documented.

Net effect: the `/test` Step 1.5 design gate cannot currently fail under any real-world input. It always either skips (misreading exit 2 as malformed) or passes (misreading the always-absent `error` severity as "no failing findings").

## Fix

Rewrite the schema documentation and parsing/pass-fail logic to match verified reality, and cascade the resulting severity-language change through every file that currently says "errors fail the gate, warnings do not."

### 1. `skills/design/impeccable-cli.md` — schema rewrite

Replace the "Expected JSON output schema" section, field reference table, and severity-to-result table with the verified shape:

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

Field reference:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `antipattern` | string | Yes | Rule identifier (use for de-dup, grouping) |
| `name` | string | Yes | Short human-readable rule name |
| `description` | string | Yes | Full explanation of the anti-pattern |
| `severity` | string | Yes | `warning` (default — most rules) or `advisory` (9 specific rule ids — see Problem section) |
| `file` | string | Yes | **Absolute** path (CLI resolves before scanning) |
| `line` | integer | Yes | Line number; `0` for file-level findings (the CLI always sets this field, defaulting to `0`) |
| `snippet` | string | Yes | The matched text/pattern that triggered the finding |

Severity-to-result mapping:

| Findings present | Wrapper result |
|-------------------|----------------|
| None (`[]`) | `pass` |
| `advisory` only | `pass` (surfaced in output, does not block) |
| Any `warning` | `fail` (gate fails, caller blocks pipeline) |

Defensive parsing rules (replaces the current 6-rule list):

1. **Unknown finding fields** → ignore (do not fail).
2. **Top-level JSON is an array** → treat directly as the findings list (this is the real, verified shape).
3. **Top-level JSON is an object exposing a `findings` array** → use `.findings` as the findings list, ignore other top-level fields (forward-compatibility only — not the current real shape, but cheap to keep in case a future CLI version reintroduces a wrapper).
4. **`severity` not in `{warning, advisory}`** → treat as `warning` (fail-safe — unknown is more serious, not less).
5. **Exit code 0** → expect `[]`; treat as zero findings regardless of stdout content (defensive: even if stdout is somehow non-empty, exit 0 is the CLI's own "nothing found" signal).
6. **Exit code 2** → expect a non-empty JSON array on stdout; parse per rules 1-4.
7. **Any other exit code, or stdout that fails `JSON.parse` under rules 5/6's expectations** → malformed output:

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI returned malformed output",
  "install_hint": "Reinstall: `npm install -g impeccable` and verify with `npx impeccable --version`"
}
```

Update the file header's "Last verified against" line to `Impeccable CLI 3.2.0 (2026-07-09), verified against live output and installed source`.

Remove the "Open items" paragraph describing the drift (resolved by this fix). Replace with a short, permanently-true note: schema was last re-verified against real CLI output and source on 2026-07-09; re-verify after any future Impeccable CLI major version bump, the same way this drift was originally caught.

Update "Sample invocation (canonical)" to the verified array-shaped example.

### 2. `skills/design/modes/test.md` — parsing + pass/fail logic

**Step 5 (Parse JSON output)** — replace with:

1. Capture stdout and the process exit code.
2. Exit code 0 → zero findings, skip to Step 6 with an empty findings list.
3. Exit code 2 → parse stdout as JSON per `impeccable-cli.md` rules 1-4 above.
4. Any other exit code, or a parse failure under steps 2-3 → return the malformed-output skip object immediately (do not proceed to Step 6).

**Step 6 (Compute pass/fail)** — replace with:

- **pass** — zero findings, or all findings are `severity: advisory`
- **fail** — any finding with `severity: warning`

**`files_scanned`** — no longer parsed from CLI output (confirmed never present). Set it to the count of files in the list resolved by Steps 2-3 (the wrapper's own filtered file list, already known before invoking the CLI).

**Output to caller** — update the JSON template to the real field names:

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [
    { "antipattern": "...", "name": "...", "description": "...", "severity": "warning" | "advisory", "file": "...", "line": <int>, "snippet": "..." }
  ]
}
```

Update the "When this runs" line ("Errors fail the gate; warnings/skips do not") to: "Findings with `severity: warning` fail the gate; `advisory` findings and skips do not."

### 3. Cascade: severity-language updates (no logic changes, these files only describe/consume the gate's result)

- **`skills/design/SKILL.md`** line 131 — "Errors fail the gate; warnings do not." → "Findings with `severity: warning` fail the gate; `advisory` findings do not."
- **`skills/test/SKILL.md`** Result-handling table (~159-160): change the `{result: "pass", ...}` row's parenthetical from "(zero findings or warnings only)" to "(zero findings, or advisory only)", and the `{result: "fail", ...}` row's parenthetical from "(any `severity: error`)" to "(any `severity: warning`)". Update the "Surface warnings... as informational" line to "Surface advisory findings... as informational."
- **`skills/test/SKILL.md`** reporting template (~168): `{N findings: Y errors, Z warnings}` → `{N findings: Y warning, Z advisory}`.
- **`skills/test/SKILL.md`** Relationship table (~287): "Errors fail the gate; warnings and skips do not." → "Findings with `severity: warning` fail the gate; `advisory` findings and skips do not."
- **`skills/_shared/design-wrapper-handling.md`** line 12: `"(e.g., `test` mode found `severity: error`)"` → `"(e.g., `test` mode found `severity: warning`)"`.

### 4. Close the deferred item

Remove the "Impeccable CLI schema has drifted from documented shape" entry from `specs/DEFERRED.md` — this fix resolves it in full (all three drift points named there: bare array, field names, exit-code collision — plus the additional `severity: error` non-existence finding discovered during this fix's investigation, which was not in the original DEFERRED.md entry but blocks the same gate).

## Out of scope

- `skills/design/modes/review.md` and `skills/review/SKILL.md`'s `error`/`warning`/`info` severity handling — that's the separate LLM-driven `critique`/`audit` Impeccable skill commands, not the `detect` CLI binary this fix addresses. DEFERRED.md's own entry named only `impeccable-cli.md` and `modes/test.md` as affected; verified during investigation that `review.md`'s severity model is a different code path entirely.
- Removing the now-permanently-inert `--fast` flag from the invocation. `impeccable-cli.md` already documents this as a separate, non-urgent cleanup (the flag is a harmless no-op as of CLI 3.x) — not part of this fix.
- Relativizing `file` to project root. The CLI returns absolute paths; documenting that accurately is in scope, but adding wrapper-side path rewriting is new behavior beyond a schema-drift fix.

## Testing

Skill markdown content, not executable logic — no unit tests. Verification is: (1) every changed file's new text is internally consistent (no leftover `rule`/`message`/`error` references in the changed sections), (2) the plan's self-review confirms all 6 files' changes agree with each other on field names and severity language, (3) task reviewers diff each file's exact before/after text against this design doc.
