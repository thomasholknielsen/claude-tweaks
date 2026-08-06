# Design Mode — test

Invoked via `/claude-tweaks:design-wrapper test <files>`. Returns `{mode, result, files_scanned, findings}` or `{mode, skipped, ...}` to caller.

## When this runs

Called by `/claude-tweaks:test` after the standard verification suite (types/lint/tests). Acts as a frontend anti-pattern gate via the deterministic Impeccable CLI. Findings carrying `advisory === true` do not fail the gate; any other finding does. Skips do not fail the gate either.

## Preconditions

Run the universal preconditions from `../SKILL.md` (all three detection layers). Availability is mode-specific here — `test` mode requires the Impeccable CLI, not the plugin's LLM commands: `npx impeccable --version` must exit 0. On failure, return skip with `install_hint: "npm install -g impeccable (verify with npx impeccable --version)"`.

## Procedure

### Step 1: Run preconditions

Run all three detection layers + availability. On any skip, return the skip object immediately.

### Step 2: Resolve target files

If `<files>` was passed, use that list. Otherwise run `git diff --name-only` to collect uncommitted changes (staged + unstaged). If that command itself fails (non-git directory, git error, mid-rebase state), return `{skipped: "unable to resolve target files (git diff failed)"}` immediately — see `../SKILL.md`'s Input section for this shared fallback-failure rule.

### Step 3: Filter to frontend files

Apply the Layer 3 sniff rules from `../frontend-detection.md` to drop non-frontend files. If zero files remain after filtering, return `{skipped: "no frontend files in scope"}`.

### Step 4: Invoke the CLI

Invoke the CLI exactly as specified in `../impeccable-cli.md` ("Invocation"), and derive `pass` / `fail` from its "Advisory-to-result mapping". The flags and the parse are deliberately not restated here — three copies of this contract is what let it drift.

### Step 5: Parse JSON output

1. Capture stdout and the process exit code from Step 4's invocation.
2. Exit code `1`, or stdout that fails to parse as JSON → malformed; return the malformed-output skip object from `../impeccable-cli.md` immediately; do not proceed to Step 6.
3. Otherwise (exit code `0` or `2`) → parse stdout as JSON per `../impeccable-cli.md`'s defensive parsing rules into normalized findings. The exit code carries no findings signal beyond distinguishing ran from crashed — an advisory-only scan exits `0` with a non-empty findings array, so treating exit `0` as "zero findings" would silently discard it.

`files_scanned` is the count of files in the list resolved by Steps 2-3 — the CLI's own output never includes this field.

### Step 6: Compute pass/fail

- **pass** — zero findings, or every finding carries `advisory === true`
- **fail** — any finding without `advisory === true`

Findings carrying `advisory === true` are included in the findings list but do not cause `result: fail`. Callers may surface them informationally.

## Output to caller

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [ /* each finding has the shape documented in ../impeccable-cli.md's field reference — not restated here */ ]
}
```

Or on skip:

```json
{ "mode": "test", "skipped": "<reason>", "install_hint": "<when availability>" }
```
