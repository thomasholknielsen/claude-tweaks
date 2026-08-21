---
files:
  - plugin/bin/lib/wrap-up/engine-verify.js
  - plugin/bin/wrap-up-engine.js
  - plugin/skills/wrap-up/execution-and-verification.md
  - plugin/skills/wrap-up/review-console.md
---

# Verify a Wrap-Up Run's Closure Checklist Through wrap-up-engine.js verify

**Persona:** the agent session running `/claude-tweaks:wrap-up` (an internal tooling user), at the point `execution-and-verification.md`'s "Verify execution" section gates the closure line — previously a ~9-item hand-run checklist (`ls` globs, `git log --grep`, `gh issue view`), now a single deterministic verb call.
**Goal:** get a verbatim pass/fail/skip/unknown table proving every closure condition actually landed, and BLOCK the closure line rather than emit it when one didn't — replacing "I ran the checks" narration with evidence.
**Entry point:** the wrap-up run directory (`$PIPELINE_RUN_DIR`) exists, its cleanup/curation steps have executed (or been explicitly deferred), and `execution-and-verification.md` reaches the "Verify execution" section.
**Success state:** a rendered markdown table with one row per check, exit code `0`, and the closure line emitted; or exit code `3` with `BLOCKED — {failing check row}` and the closure line withheld.

## Steps

### 1. Run the verb against the run directory
- **URL:** `node plugin/bin/wrap-up-engine.js verify --run-dir "$PIPELINE_RUN_DIR" --base {base-ref}`
- **Action:** Invoke it exactly as `execution-and-verification.md` instructs, once cleanup has run.
- **Should feel:** One command replacing a hand-run checklist — no more trusting the model's own narration that it checked `git log`, `gh issue view`, and a handful of `ls` globs.
- **Should understand:** `--run-dir` accepts either the run's original path or (the normal case — archival precedes verification) its archived copy under `.claude-tweaks/pipelines/archive/`; the verb resolves both. `--base` is consumed only by `carrier-commit` and `reference-repairs`, the two checks that walk `{base}..HEAD`.
- **Red flags:** Any check silently reporting `pass` for a condition that plainly doesn't hold on disk — the exact failure class three separate fix rounds in this feature's own build caught (a match-key bug, a vacuous slug match, an ISO-timestamp-stripping regression) before this journey's own files reached the state they're in now.

### 2. Read the table's four distinct states
- **URL:** the same command's stdout
- **Action:** Inspect a row of each kind — `pass`, `fail`, `skip (reason)`, `unknown (reason)`.
- **Should feel:** Each state means something different and none of them silently substitute for another.
- **Should understand:** `pass`/`skip`/`unknown` never change the exit code — only `fail` does (or a `null` run dir, which forces exit 3 even though every row renders `unknown`). `skip` means a real, known condition why the check doesn't apply here (e.g. `deferred to parent console`, `nothing recorded`). `unknown` means the check genuinely could not run (`gh` absent, `verify-expectations.json` missing) — visible, but not blocking, matching how the old checklist surfaced an un-runnable check rather than treating it as a failed action.
- **Red flags:** A multi-line or pipe-containing detail string breaking the table's column count (the renderer sanitizes this — collapsing whitespace and escaping `|` — so a broken table here means the sanitizer itself regressed).

### 3. Hit a real fail row and watch closure get blocked
- **URL:** `execution-and-verification.md`'s Verify execution section, downstream of Step 1's table
- **Action:** Run the verb against a run where one approved cleanup action didn't actually execute (e.g. the worktree is still listed, or the archive path is missing).
- **Should feel:** The pipeline stops here, not three steps later when something downstream trips over the half-finished state.
- **Should understand:** Exit code `3` means "surface `BLOCKED — {failing check row, verbatim}` and stop" — never emit the closure line. This is a genuinely new exit code (`0` unchanged, `1`/`2` keep their existing "bad payload"/"malformed invocation" meanings from the verb's sibling `plan`/`record`/`render` commands).
- **Red flags:** The closure line emitting anyway despite a `fail` row in the table; a `BLOCKED` message that doesn't name which check failed.

### 4. Run it with `gh` unavailable
- **URL:** the same command, in an environment with no `gh` on `PATH`
- **Action:** Invoke the verb where `acceptance-labeling` (and any `carrier-commit`/`upstream-feedback` fallback needing `gh`) would otherwise need it.
- **Should feel:** Degrades visibly, never silently — a reader sees exactly which rows the environment couldn't evaluate.
- **Should understand:** The verb is deliberately `gh`-CLI-only (module header states this) — a `gh`-absent row always renders `unknown (gh absent)`, never a silent `pass`. Any MCP-path manual verification stays the skill prose's affair, outside this verb's scope.
- **Red flags:** A `gh`-dependent check reporting `pass` when `gh` never actually ran.

## Origin
- Created during build of #900 (wrap-up verify verb — mechanizes `execution-and-verification.md`'s hand-run closure checklist into a deterministic table), part of the shared #343+#900 `/flow` multi-spec run.
- Related: #343 (prerequisite — fixed the same skill file's circular gate condition on the same branch), #892/#891 (the sibling `bin/verify.js` deterministic-check-runner family — a different subsystem covering type/lint/test checks, not this feature's closure-gate checks).
