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

Derive the result from the **parsed findings**, never from the exit code:

| Findings after parsing stdout | Wrapper result |
|-------------------------------|----------------|
| None (`[]`) | `pass` |
| `advisory` only | `pass` (listed in output, does not block) |
| Any `warning` | `fail` (gate fails, caller blocks pipeline) |

### Schema version compatibility

The schema above is the pinned CLI version's real, verified output shape — the pin comment and contract statement at the top of this file, proven by `tests/impeccable-cli-contract.test.js`, are the authority on which version; this section does not restate it. The CLI may evolve.

### Defensive parsing rules

1. **Parse stdout unconditionally.** `--json` writes the findings array to stdout at the pinned version; stderr carries only diagnostics. Never read findings from stderr.
2. **The exit code is not a findings signal, and does not track the `severity` field.** `main.mjs` sets it via `process.exit(primary.length > 0 ? 2 : 0)`, where `primary` is filtered by a registry flag independent of the JSON `severity` field — so exit code and `severity` can disagree in either direction at the pinned version (see the note after the parsing rules below for the verified specifics). Never derive `pass`/`fail` from the exit code; always parse stdout and classify by the [Severity-to-result mapping](#severity-to-result-mapping) below. Exit code distinguishes only ran (0 or 2) from crashed (1, a usage error).
3. **Unknown finding fields** → ignore. `category` was added this way.
4. **Top-level JSON is an array** → treat directly as the findings list.
5. **`severity` missing or outside `{warning, advisory}`** → treat the finding as `advisory` for this run, and surface a contract-breach note naming the observed value. Under a pin, an unrecognized severity is not a fact about the project's code; it is evidence the pin was violated, and failing the user's build on that is the wrong axis. Phase 2's drift auditor is what escalates it.
6. **Exit code 1, or stdout that does not parse as JSON** → malformed; return the skip object below.

```json
{
  "mode": "test",
  "skipped": "Impeccable CLI returned malformed output",
  "install_hint": "Verify the pin: `npx impeccable --version` should print 3.5.0"
}
```

Malformed output is a skip, not a fail — same rationale as the availability check.

**Advisory path — unproven by fixture; a structural discrepancy found and verified live in both directions instead.** Rule 2's account above is written from upstream source (`main.mjs`'s `process.exit(primary.length > 0 ? 2 : 0)` and its accompanying comment), not from a replayable fixture — and reading `registry/antipatterns.mjs` and `findings.mjs` shows why: the exit code and the JSON `severity` field are populated from two different, independent registry keys. `isAdvisory()` (in `cli/engine/cli/main.mjs`) exempts a finding from the exit-code count only when its rule carries a registry `advisory: true` flag; `finding()` sets the JSON `severity` field from a separate key (`ap.severity`, defaulting to `'warning'` when the rule declares none) and never consults `advisory` at all. At the pinned version these two keys are disjoint everywhere both are set on the same rule — which rule ids currently fall on which side is upstream's data, deliberately not enumerated here for the same reason the `severity` field entry in the field reference above gives. Verified live in both directions: firing a rule whose registry entry sets `severity: 'advisory'` without `advisory: true` produced a finding reporting `severity: "advisory"` that exited 2; firing the rule whose registry entry sets `advisory: true` without a `severity` key produced a finding reporting `severity: "warning"` that exited 0.

This has a concrete, opposite-direction consequence from the bug Rules 2 and 5 exist to fix. The CLI's own `--no-advisory` help text names em-dash overuse (`Suppress advisory findings entirely (e.g. em-dash overuse)`) as its worked example of a non-blocking advisory finding — but that finding's `severity` field reads `"warning"`, so the wrapper's own [Severity-to-result mapping](#severity-to-result-mapping) above will `fail` the gate on exactly the finding upstream calls out as safe to ignore. The other direction is not wrapper-facing: a `severity: "advisory"` finding that isn't exit-code-exempt is still correctly mapped to `pass` here, because the mapping only ever reads `severity`, never the exit code.

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

**Result rules:** see the [Severity-to-result mapping](#severity-to-result-mapping) table above — not restated here. This sample has one `warning` finding, so `result` is `fail`.

## Open items (tracked in parent design doc)

- **Schema stability** — the CLI may change output between releases. The wrapper's defensive parsing rules above handle unknown/missing fields, but a genuinely breaking change (e.g. a new required field, or a `severity` value outside `{warning, advisory}`) still needs a version pin bump. This used to rely on a human re-verifying by hand after each bump — a 2026-07-20 pass caught a patch bump that had silently added a new advisory rule id, but the same manual process was written in good faith twice while the actually-installed CLI had drifted further still, because nothing compared the stamp to what was installed (`[IL-89]`, see the pin comment at the top of this file). `tests/impeccable-cli-contract.test.js` now does this mechanically: it replays committed fixtures against whatever CLI is actually installed on every test run, so drift is caught structurally instead of depending on someone remembering to re-verify.
- **Log path** — the wrapper does not currently log invocations. The parent design proposes `~/.claude-tweaks/logs/design.jsonl` for token-cost instrumentation. That path is harness-owned (skill content must not write there); add only when the harness gains a logger for this purpose.
