# Token Saver — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-02-token-saver-design.md`
**Branch:** `feature/token-saver`
**Mode:** Design mode (no spec file, direct implementation from design doc)

## Phase A — Foundation libraries

Independent helpers used by the filter, statusline, and deps check. Build first; everything else depends on these.

- [ ] **A1** Create `bin/lib/paths.js` — cross-platform `~/.claude-tweaks/` path resolution (`os.homedir()`, `path.join`). Exports: `dataDir()`, `logsDir()`, `cacheDir()`, `bashLogPath(ts)`, `filterEventsPath()`, `usageCachePath()`. Ensures dirs exist on read.
- [ ] **A2** Create `bin/lib/jsonl.js` — append + tail-read helpers for JSONL files. Exports: `appendEvent(path, obj)`, `readTail(path, maxBytes)`. Defensive: skip malformed lines.
- [ ] **A3** Create `bin/lib/color.js` — ANSI 8-color helpers respecting `NO_COLOR` env var. Exports: `red(s)`, `yellow(s)`, `green(s)`, `dim(s)`, `colorEnabled()`.
- [ ] **A4** Create `bin/lib/deps.js` — runs as SessionStart hook. Detects Node + git; on missing dep, prints platform-appropriate install instruction. Detects package managers (brew, winget, scoop, apt, dnf, pacman). No silent installs.

## Phase B — Hooks + executables

Depends on Phase A.

- [ ] **B1** Create `bin/filter-bash-output.js` — port of governor's filter logic. Reads hook payload from stdin, applies threshold + noisy-command rules, writes raw log + JSONL telemetry, returns summary via `additionalContext`. Constants match design doc verbatim. Failure modes: passthrough on error.
- [ ] **B2** Create `bin/claude-tweaks-statusline.js` — reads stdin JSON from Claude Code, renders 9 segments with auto-hide and ANSI colors. Performance budget <100ms. Async usage cache refresh; never blocks render.
- [ ] **B3** Update `hooks/hooks.json` — add `PostToolUse[Bash]` hook, replace existing SessionStart one-liner with `bin/lib/deps.js`.
- [ ] **B4** Update `.claude-plugin/plugin.json` — version bump 4.1.0 → 4.2.0.

## Phase C — Skill content (subagent contract)

Independent of A/B; can run in parallel.

- [ ] **C1** Create `skills/_shared/subagent-output-contract.md` — Templates A/B/C with literal output formats, anti-patterns, references.
- [ ] **C2** Update `skills/init/SKILL.md` — add deps check + statusline wiring step.
- [ ] **C3** Update `skills/help/SKILL.md` — mention filter + statusline in reference card.
- [ ] **C4** Update `skills/review/SKILL.md` — add inline contract reminders at the two existing parallel-Task dispatch sites (lines 137, 276), Template A.
- [ ] **C5** Update `skills/visual-review/SKILL.md`, `skills/reflect/SKILL.md`, `skills/journeys/SKILL.md`, `skills/stories/SKILL.md`, `skills/test/SKILL.md`, `skills/build/SKILL.md` — add note in their parallel-execution sections referencing the contract for future Task-agent dispatches.

## Phase D — Tests

Depends on B1, B2.

- [ ] **D1** Create `tests/filter-bash-output.test.js` — Node `node --test` runner. Cases per design doc: below threshold, noisy + failure, noisy + huge, generic huge, stderr preservation, failure regex, log written, telemetry written, malformed input.
- [ ] **D2** Create `tests/statusline.test.js` — empty cache / no skills / no specs, full population, auto-hide, NO_COLOR, color thresholds, stale cache, performance.

## Phase E — Documentation

- [ ] **E1** Update `README.md` — token-saving features section: bash filter, statusline (with example line), prerequisites, setup walkthrough.
- [ ] **E2** Update `CLAUDE.md` — extend Don'ts: "Don't write to `~/.claude-tweaks/` from skill content".

## Phase F — Verification

- [ ] **F1** Run `node --test tests/` — all tests pass.
- [ ] **F2** Smoke-check: `node bin/lib/deps.js` runs without crashing.
- [ ] **F3** Smoke-check: `echo '{"tool_input":{"command":"npm test"},"tool_response":{"stdout":"...","stderr":"","exit_code":0}}' | node bin/filter-bash-output.js` produces expected JSON.
- [ ] **F4** Smoke-check: `echo '{"model_display_name":"Sonnet 4.6","context_used":40000,"context_window_size":200000}' | node bin/claude-tweaks-statusline.js` outputs a line.

## Out of scope for this build

- Live Anthropic usage API integration (segments 5, 6) — auth path documented in code comments, full integration deferred. Cache file format and refresh logic are stubbed out.
- Cross-platform manual smoke tests — Windows verification deferred to wrap-up acceptance.
- Browser-based visual review (no UI in this feature).
