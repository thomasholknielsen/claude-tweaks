# Impeccable CLI — Invocation + JSON Parsing

*Last verified against Impeccable CLI 3.2.0 (2026-07-09), verified directly against live output and the installed package source.*

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

Run the CLI from the project root (the directory containing the spec/CLAUDE.md) so relative `<files>` arguments resolve correctly. File paths in the output are absolute (the CLI resolves each target with `path.resolve()` before scanning), regardless of the working directory used to invoke it.

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

## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. This schema was last re-verified directly against live CLI output and installed package source on 2026-07-09 (CLI 3.2.0) — re-verify the same way after any future Impeccable CLI major version bump, the way the 2026-07-07 drift was originally caught.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
