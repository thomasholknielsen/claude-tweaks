---
files:
  - plugin/bin/verify.js
  - plugin/bin/lib/verify/args.js
  - plugin/bin/lib/verify/run.js
  - plugin/bin/lib/verify/extract.js
  - plugin/bin/lib/verify/report.js
  - plugin/skills/test/verification.md
---

# Run a Deterministic Verification Check Through bin/verify.js

**Persona:** claude-tweaks skill author (or a maintainer of a project using the plugin) who wants proof that `verification.md`'s migrated Step 2 invocation actually produces bounded output and a trustworthy `report.json` — rather than trusting the skill's prose to have described the CLI's behavior correctly.
**Goal:** Watch the runner execute a mix of passing, failing, and fail-fast-skipped checks, and confirm stdout stays bounded, exit codes key off each check's own result, and `report.json` carries the evidence `VERIFICATION_PASSED`/`VERIFICATION_SHA` downstream consumers rely on.
**Entry point:** A terminal at a project checkout root, `plugin/bin/verify.js` reachable (this repo's own checkout, or another project's resolved plugin root per `docs/skill-authoring.md`'s plugin-root contract).
**Success state:** A markdown results table on stdout with one row per check plus at most one bounded failing region, a `report.json` whose `pass`/`sha`/`dirty`/`checks` fields match what actually ran, and a non-zero process exit exactly when something failed.

## Steps

### 1. Run the reserved three-stage set — terminal
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --log-dir "$(git rev-parse --git-dir)/claude-tweaks-verify" --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"`
- **Action:** Run against a project that supplies all three reserved names.
- **Should feel:** One command replacing the old prose-orchestrated capture recipe — no `LOG=`, no `tail`, no `grep` pipeline to hand-assemble.
- **Should understand:** `types` and `lint` start concurrently; `tests` only starts once every supplied one of them has exited 0. A stage-1 failure reports `tests` as `skipped: fail-fast` in both the stdout table and `report.json` — never silently dropped, never spawned anyway.
- **Red flags:** `tests` spawning before `types`/`lint` finish; a `types` failure that still lets `tests` run; a raw `npm test` log (megabytes of TAP output) landing on stdout instead of a bounded summary.

### 2. Read the bounded stdout, not the log file
- **URL:** the same command's own stdout
- **Action:** Point a check's command at something that fails loudly (e.g. `--cmd tests="node -e \"process.exit(1)\""`), then read what the runner prints.
- **Should feel:** Legible in one screen — a status table plus, only for a failing check, one capped failing-region excerpt (≤100 lines, each line truncated past 500 characters).
- **Should understand:** The full, unbounded output still exists — one plain-text log file per check under `--log-dir` (`{name}.log`) — the runner's own stdout is a summary, never a copy. The trailing `report: {path}` line survives for a reader that consumes all of stdout (`| cat`, `| tee`), because the runner sets `process.exitCode` and lets Node drain pending writes rather than calling `process.exit()` mid-flush. A reader that closes early (`| head`) legitimately truncates the output instead — the runner's EPIPE guard exits quietly rather than crashing.
- **Red flags:** A truncated table with no trailing `report:` line when the reader consumed all of stdout; a failing region that's actually the whole raw log; an EPIPE crash (a raw stack trace) when piped into an early-closing reader.

### 3. Read report.json's evidence fields
- **URL:** `cat {log-dir}/report.json` after Step 1 or 2
- **Action:** Inspect `pass`, `sha`, `dirty`, and each entry under `checks`.
- **Should feel:** Machine-readable proof, not a narrated claim — this is what turns `VERIFICATION_PASSED`/`VERIFICATION_SHA` (the values `/build` and `/test` pass between pipeline steps) into evidence instead of prose.
- **Should understand:** `sha` is `git rev-parse HEAD` — outside a git repository it (and `dirty`) is `null`; `dirty: true` means "verified this tree, which is not exactly commit `sha`" — never trust `sha` alone on a dirty tree. Every non-skipped check's entry carries `counts: {tests, pass, fail}` whenever its output parses (TAP, jest/vitest, pytest) — including a failing check, not only a passing one; an unparseable or ambiguous summary omits `counts` entirely rather than guessing. A check that couldn't even spawn records `exitCode: null` plus a `spawnError` string rather than a `counts` block.
- **Red flags:** `counts` present with a fabricated or guessed value; `pass: true` while a supplied check's `exitCode` is non-zero or `null`; `report.json` missing or half-written after a run that was interrupted mid-flight (the write is atomic — temp file then rename — so this should never happen).

### 4. Add an unknown check name
- **URL:** `node plugin/bin/verify.js --log-dir /tmp/verify-demo --cmd tests="npm test" --cmd smoke="./scripts/smoke.sh"`
- **Action:** Supply a `--cmd` name outside the reserved `types`/`lint`/`tests` set.
- **Should feel:** Extensible without a spec change — any project-specific check rides along under the same ordering discipline.
- **Should understand:** Unknown names run serially, after the known stages, in the order given, subject to the same fail-fast rule — a failing `tests` skips `smoke`, and a failing `smoke` (if there were a second unknown check after it) would skip that one too.
- **Red flags:** An unknown check running before `tests` finishes; an unknown check's failure not fail-fasting a later unknown check.

### 5. Trigger a usage error
- **URL:** `node plugin/bin/verify.js --log-dir /tmp/verify-demo --cmd "smoke:e2e=echo hi"`
- **Action:** Supply a malformed `--cmd` — an invalid name (must match `[A-Za-z0-9_-]+`), a duplicate name, an empty command, a missing flag value, or an unknown flag.
- **Should feel:** Fails fast and explains itself — no checks spawn, no `report.json` is written.
- **Should understand:** A malformed invocation prints the specific problem plus the usage line to stderr and exits `2`, before anything runs. `--json <path>` relocates the report away from the `{log-dir}/report.json` default used elsewhere in this journey — pass it when a caller needs the report at a fixed, predictable path.
- **Red flags:** Any check spawning despite a malformed invocation; an exit code other than `2` for a usage error.

## Origin
- Created during build of #892 (deterministic verification runner + `verification.md` migration) — replaces the retired prose-orchestrated `LOG=`/`tail`/`grep` capture discipline `verification.md` Step 2 used to document directly.
- Related specs: #891 (parent — deterministic verification runner family), #881 (suite-count regression detection, a future consumer of `report.json`'s `counts` field), #882 (flake adjudication — landed as a standalone `node --test` isolated re-run recipe in `verification.md`'s own "Flake adjudication" section; does not consume `verify.js`'s per-check log files)
