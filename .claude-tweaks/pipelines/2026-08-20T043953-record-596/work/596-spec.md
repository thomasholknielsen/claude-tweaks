---
record: 596
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 596: auto-decision-log.md: run-dir appends are refused from a worktree session, and the contract says a /flow worktree 'already satisfies the gate' — add log-decision, fix the prose

Surface: backend

## Current State

`skills/_shared/auto-decision-log.md` (around line ~137) states that a skill already running inside a `/flow`/`/build`-created worktree "is unaffected and keeps using the Read+Write pattern — the worktree already satisfies the gate." This is false: the run directory is anchored to the **main checkout** (`_shared/pipeline-run-dir.md`, Anchoring section) while the session runs inside the worktree. From a worktree session, `Edit`/`Write` to `$RUN_DIR/decisions.md` is refused by the harness ("Edit the worktree copy of this file instead of the shared-checkout path"), and the contract's own documented fallback shapes — `printf … >> "$RUN_DIR/decisions.md"` and `cat >> … <<'EOF'` — are also refused ("too complex to verify" from a worktree session). The contract's conditional heading ("before a worktree exists for this run", scoped to standalone-auto skills) misdiagnoses the cause: the failure is orthogonal to whether a worktree exists at all — it's the main-checkout run dir vs. worktree session split.

Measured in the 2026-08-16 session: 3 refusals on run-dir appends (Edit pin x1, redirect x2), and 4 `node -e "fs.appendFileSync(...)"` manual workarounds. Every `/flow` run under a worktree pays this cost today.

Related: #594 (same family of plain-command hook verbs), #174 (harness worktree guard, `docs/skill-authoring.md:86`).

## Deliverables

1. Ship `bin/hooks.js log-decision --run <dir> --skill <name> --entry <text>` — appends one canonical-schema line under the correct `## /{skill}` heading in `$RUN_DIR/decisions.md`. Plain command, absolute paths, no redirection or heredoc, so it passes the harness's write guards from either checkout. Add the corresponding module under `bin/lib/hooks/`, following this repo's one-dispatcher-one-module-per-event convention (`docs/hooks.md`). The `pipelines/` exemption already permits the underlying write.
2. Delete the "unaffected … already satisfies the gate" sentence in `skills/_shared/auto-decision-log.md`, and replace the whole conditional block (the one keyed on "before a worktree exists for this run") with one unconditional instruction: always use `log-decision` to append to `decisions.md`, regardless of whether the session sits in a worktree or the main checkout.
3. Sweep every skill file that prescribes a `decisions.md` append shape (`grep -r decisions.md skills/`) and update each to cite the `log-decision` subcommand instead of a Read+Write/printf/heredoc pattern.
4. Add test pinning (`node --test`) asserting that no skill file under `skills/` prescribes a redirection (`>>`) or heredoc (`<<`) append to `$RUN_DIR`/`decisions.md`.

Out of scope for this record: the companion `manifest.yml`/`run-state.json` write pattern named in the same verb family — tracked separately in #594.

## Acceptance Criteria

- `bin/hooks.js log-decision --run <dir> --skill <name> --entry <text>` exists, appends a canonical-schema line under the correct `## /{skill}` heading in `<dir>/decisions.md`, and succeeds when invoked from inside a worktree session against a main-checkout run dir (the exact scenario in Current State).
- `skills/_shared/auto-decision-log.md` no longer contains the "already satisfies the gate" sentence or the worktree-conditional block; it instead states unconditionally to use `log-decision`.
- Every skill file matched by `grep -r decisions.md skills/` that previously prescribed a Read+Write/printf/heredoc append shape now cites `log-decision` instead.
- A new `node --test` suite fails when re-run against the pre-fix skill text (proving it actually catches the defect it's meant to prevent) and passes against the fixed text.
- `npm test` passes in full.

## Technical Approach

Follow the existing hook-CLI pattern: one subcommand added to `bin/hooks.js`'s dispatcher, backed by a new module in `bin/lib/hooks/` (per `docs/hooks.md`'s contract for touching `bin/hooks.js`/`bin/lib/hooks/`). The subcommand takes `--run <dir> --skill <name> --entry <text>`, locates or creates the `## /{skill}` heading in `<dir>/decisions.md`, and appends the entry line beneath it in the canonical schema already defined by `_shared/auto-decision-log.md`. Because it's a single plain command with only absolute-path arguments (no shell redirection, no heredoc), it passes the harness's "too complex to verify" and shared-checkout-path guards from both a worktree session and the main checkout.

For the prose fix, replace the entire existing conditional block in `auto-decision-log.md` (not just the flagged sentence) with the single unconditional `log-decision` instruction, since the conditional's premise (worktree existence determines write pattern) is itself wrong, not just its conclusion.

For the sweep, `grep -r decisions.md skills/` is the enumeration step; each hit needs a judgment call on whether it prescribes an append shape (rewrite) versus merely mentioning the file (leave alone).

## Gotchas

- The conditional block being replaced may be referenced by wording (not just structurally) from other `_shared/*.md` files — a sweep for citations of the specific sentence/paragraph, not just a structural diff, is needed to avoid leaving a dangling description of removed behavior.
- `#594` names the same fix pattern for `manifest.yml`/`run-state.json` writes; implementing `log-decision` first may make that record's own scope trivially smaller (a template to copy) rather than independent work — worth checking #594's shape before or after this ships.
- The test pin (Deliverable 4) needs both a positive check (fixed text names `log-decision`) and a negative check (no skill file left prescribing `>>`/`<<` against `$RUN_DIR`/`decisions.md`) — a same-line-only grep can miss a redirection that wraps onto an adjacent line in prose.

## Original request

auto-decision-log.md: run-dir appends are refused from a worktree session, and the contract says a /flow worktree "already satisfies the gate" — add log-decision, fix the prose

**Related:** #594 (same family of plain-command hook verbs), #174 (harness worktree guard, docs/skill-authoring.md:86)

Context: `skills/_shared/auto-decision-log.md` line ~137 states: "A skill already running inside a `/flow`/`/build`-created worktree is unaffected and keeps using the Read+Write pattern — the worktree already satisfies the gate." This is false. The run directory is anchored to the **main checkout** (`_shared/pipeline-run-dir.md`, Anchoring) while the session sits inside the worktree, so from a worktree session: `Edit`/`Write` to `$RUN_DIR/decisions.md` is refused by the harness ("Edit the worktree copy of this file instead of the shared-checkout path"), and the contract's own fallback shapes — `printf … >> "$RUN_DIR/decisions.md"` and `cat >> … <<'EOF'` — are refused too (redirection and heredoc are both "too complex to verify" from a worktree session). The contract's conditional heading ("before a worktree exists for this run", scoped to standalone-auto skills) misdiagnoses the cause: it is orthogonal to whether a worktree exists; it is the main-checkout run dir vs. worktree session split.

Measured in the 2026-08-16 session: 3 refusals on run-dir appends (Edit pin ×1, redirect ×2), 4 `node -e "fs.appendFileSync(...)"` workarounds — every `/flow` run pays this.

Scope: (1) ship `bin/hooks.js log-decision --run <dir> --skill <name> --entry <text>` (append one canonical-schema line under the right `## /{skill}` heading; plain command, absolute paths, no redirect/heredoc — passes both guards from either checkout; the pipelines/ exemption already permits the write). (2) Delete the "unaffected … already satisfies the gate" sentence and replace the whole conditional block in `auto-decision-log.md` with one unconditional instruction: use `log-decision`. (3) Sweep every skill that prescribes a `decisions.md` append shape (grep `decisions.md` across `skills/`) to cite the subcommand instead. (4) Test pinning that no skill file prescribes a redirection or heredoc append to `$RUN_DIR`/`decisions.md`. Companion for `manifest.yml`/`run-state.json` writes may fall out of the same verb family (#594).

