# Impeccable CLI — Invocation + JSON Parsing

*Last verified against Impeccable skill 3.9.1 / CLI 3.2.0 (2026-07-07).*

Reference for the wrapper's `test` mode dispatch. The Impeccable CLI is a deterministic Node binary that scans frontend files for design anti-patterns without LLM cost.

## Invocation

The wrapper invokes the CLI exactly as:

```bash
npx impeccable detect --fast --json <file1> <file2> ... <fileN>
```

| Flag | Why |
|------|-----|
| `detect` | Subcommand — runs the deterministic anti-pattern scanner |
| `--fast` | No-op as of CLI 3.x — the detector always full-scans regardless of this flag. Kept in the invocation for now; harmless either way, and removing it is a separate, non-urgent cleanup. |
| `--json` | Machine-readable output — required for parsing |
| `<files>` | Space-separated list of files to scan; passed positionally |

### Arguments resolution

The wrapper passes the file list resolved by the preconditions:

1. The mode's `<files>` argument if explicitly provided
2. Otherwise the result of `git diff --name-only` (uncommitted, staged + unstaged)
3. Filtered to files matching the frontend trigger extensions/paths from `frontend-detection.md`

If the file list is empty after filtering, the wrapper returns `{skipped: "no frontend files in scope"}` without invoking the CLI.

### Working directory

Run the CLI from the project root (the directory containing the spec/CLAUDE.md). File paths in the output will be relative to this directory.

### Timeout

Use the Bash tool's default timeout. The CLI is fast (`--fast` flag); a single invocation should complete in well under a minute even for large file lists. If the CLI times out, treat as a transient failure and return:

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI timed out",
  "install_hint": "Re-run later or invoke manually with `npx impeccable detect --fast --json <files>`"
}
```

Timeout is treated as a skip, not a failure — same rationale as the availability check (a CLI problem must not block the test gate).

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

## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. Re-validate sample output after every Impeccable major version bump. Last re-validated 2026-07-07 against skill 3.9.1 / CLI 3.2.0 (see header note) — schema unchanged, defensive parsing still sufficient.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
