# Impeccable CLI — Invocation + JSON Parsing

<!-- upstream-pin: impeccable-cli@3.5.0 -->
*Contract pinned to Impeccable CLI 3.5.0 and proven by `tests/impeccable-cli-contract.test.js`, which replays committed fixtures against the installed binary. A prose re-verification pass is not a substitute for running that test: the 3.2.1 stamp this replaces was written in good faith twice while the machine ran 2.1.8, because nothing ever compared the stamp to what was installed (`[IL-89]`).*

Reference for the wrapper's `test` mode dispatch. The Impeccable CLI is a deterministic Node binary that scans frontend files for design anti-patterns without LLM cost.

## Invocation

The wrapper invokes the CLI exactly as:

```bash
npx impeccable detect --json <file1> <file2> ... <fileN>
```

| Flag | Why |
|------|-----|
| `detect` | Subcommand — runs the deterministic anti-pattern scanner |
| `--json` | Machine-readable output — required for parsing |
| `<files>` | Space-separated list of files to scan; passed positionally |

`--fast` was removed from this invocation. At the pinned 3.5.0 it is deprecated and ignored, and passing it writes `Note: --fast is deprecated and ignored. The full scan is fast now and runs every rule.` to stderr on every call — noise in a stream the parser reads. At 2.1.8 it was not a no-op at all: it forced regex-only scanning and skipped linked stylesheets entirely, which is the degradation CLI 3.5.0's own release notes describe as turning eighteen findings into one.

### Arguments resolution

The wrapper passes the file list resolved by the preconditions:

1. The mode's `<files>` argument if explicitly provided
2. Otherwise the result of `git diff --name-only` (uncommitted, staged + unstaged)
3. Filtered to files matching the frontend trigger extensions/paths from `frontend-detection.md`

If the file list is empty after filtering, the wrapper returns `{skipped: "no frontend files in scope"}` without invoking the CLI.

### Working directory

Run the CLI from the project root (the directory containing the spec/CLAUDE.md) so relative `<files>` arguments resolve correctly. File paths in the output are absolute (the CLI resolves each target with `path.resolve()` before scanning), regardless of the working directory used to invoke it.

### Timeout

Use the Bash tool's default timeout. A single invocation completes in well under a minute even for large file lists. If the CLI times out, treat as a transient failure and return:

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI timed out",
  "install_hint": "Re-run later or invoke manually with `npx impeccable detect --json <files>`"
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
    "category": "slop",
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
| `severity` | string | Yes | `warning` or `advisory`. Which rule ids carry which severity is upstream's data and is deliberately not enumerated here — read the field off the output. Enumerating it is what drifted this file three times. |
| `category` | string | Yes | Rule grouping (e.g. `slop`). Present since at least 3.5.0; useful for dispatch grouping in place of keyword-matching `description`. |
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

The schema above reflects verified live CLI 3.2.1 output and source. The CLI may evolve. Defensive parsing rules:

1. **Unknown finding fields** → ignore (do not fail).
2. **Top-level JSON is an array** → treat directly as the findings list (this is the real, verified shape).
3. **Top-level JSON is an object exposing a `findings` array** → use `.findings` as the findings list, ignore other top-level fields (forward-compatibility only — not the current real shape, but cheap to keep in case a future CLI version reintroduces a wrapper).
4. **`severity` not in `{warning, advisory}`** → treat as `warning` (fail-safe — unknown is more serious, not less).
5. **Exit code 0** → treat as zero findings, regardless of stdout content (the CLI's own "nothing found" signal).
6. **Exit code 2** → expect a non-empty JSON array on stdout; parse per rules 1-4 above.
7. **Any other exit code, or stdout that fails to parse as JSON under rule 6** → malformed output; return:

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
$ npx impeccable detect --json src/components/Hero.tsx
```

The CLI's raw stdout for this invocation has the same shape as the sample under "Expected JSON output schema" above — repeating it here added nothing but a second copy to keep in sync, so it isn't restated. What that section doesn't show is what the wrapper hands back after processing the CLI's output:

```json
{
  "mode": "test",
  "result": "fail",
  "files_scanned": 1,
  "findings": [
    { "antipattern": "ai-color-palette", "name": "AI color palette", "description": "Purple/violet gradients and cyan-on-dark are the most recognizable tells of AI-generated UIs. Choose a distinctive, intentional palette.", "severity": "warning", "category": "slop", "file": "/project/src/components/Hero.tsx", "line": 47, "snippet": "from-purple-500 gradient" }
  ]
}
```

**Result rules:** Any `severity: warning` sets `result: fail`. Otherwise `result: pass`. `advisory` findings appear in the findings list but never promote the result. Empty findings (`[]`) is a pass.

## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing handles unknown/missing fields, but breaking changes (e.g., renamed `severity` values) would require pinning a CLI version. This schema was last re-verified directly against live CLI output and installed package source on 2026-07-20 (CLI 3.2.1) — that pass found the 3.2.0→3.2.1 *patch* bump had silently added a 10th advisory rule id (`design-system-font-size`) to the field-reference table above, proving "major version bump" is not a sufficient re-verification trigger. Re-verify the same way after any future Impeccable CLI version bump — major, minor, or patch — not just major, the way both the 2026-07-07 and 2026-07-20 drifts were caught.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
