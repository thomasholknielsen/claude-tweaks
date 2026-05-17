# Design Mode — test

Invoked via `/claude-tweaks:design test <files>`. Returns `{mode, result, files_scanned, findings}` or `{mode, skipped, ...}` to caller.

## When this runs

Called by `/claude-tweaks:test` after the standard verification suite (types/lint/tests). Acts as a frontend anti-pattern gate via the deterministic Impeccable CLI. Errors fail the gate; warnings/skips do not.

## Preconditions

Run the universal preconditions from `../SKILL.md`:

- **Layer 1 (kill-switch)** — CLAUDE.md `design-integration` must not be `disabled`/missing.
- **Layer 2 (spec frontmatter)** — applies only when a spec is resolvable from the file list. `surface: backend|infra` returns skip.
- **Layer 3 (file-extension sniff)** — at least one file must match frontend triggers per `../frontend-detection.md`.
- **Availability** — `npx impeccable --version` must exit 0. On failure, return skip with `install_hint: "npm install -g impeccable (verify with npx impeccable --version)"`.

## Procedure

### Step 1: Run preconditions

Run all three detection layers + availability. On any skip, return the skip object immediately.

### Step 2: Resolve target files

If `<files>` was passed, use that list. Otherwise run `git diff --name-only` to collect uncommitted changes (staged + unstaged).

### Step 3: Filter to frontend files

Apply the Layer 3 sniff rules from `../frontend-detection.md` to drop non-frontend files. If zero files remain after filtering, return `{skipped: "no frontend files in scope"}`.

### Step 4: Invoke the CLI

Invoke exactly as documented in `../impeccable-cli.md`:

```bash
npx impeccable detect --fast --json <files>
```

### Step 5: Parse JSON output

Parse per `../impeccable-cli.md`'s schema rules into normalized findings.

### Step 6: Compute pass/fail

- **pass** — zero findings, or all findings are `severity: warning`
- **fail** — any finding with `severity: error`

Warnings are included in the findings list but do not cause `result: fail`. Callers may surface warnings informationally.

## Output to caller

```json
{
  "mode": "test",
  "result": "pass" | "fail",
  "files_scanned": <int>,
  "findings": [ { "file": "...", "rule": "...", "severity": "...", "line": <int>, "message": "..." }, ... ]
}
```

Or on skip:

```json
{ "mode": "test", "skipped": "<reason>", "install_hint": "<when availability>" }
```
