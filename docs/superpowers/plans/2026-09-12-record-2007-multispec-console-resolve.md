# Plan: Route the multi-spec Review Console's short-circuit through console-resolve.js (#2007)

## For agentic workers

Executed directly in this session (subagent execution strategy, `/claude-tweaks:flow #2007 build,test`). No further execution skill needed — this plan records what was already implemented and verified.

## Context

`flow/multispec-review-console.md`'s "Auto-resolution short-circuit" section carried a hand-rolled per-item resolution loop (render every section as `AUTO-RESOLVED`, resolve every item per its stated default, log one decisions line per item, write no `console.json`), structurally diverged from `wrap-up/review-console.md`'s already-shipped one-call `console-resolve.js --run … --policy console-auto` pattern (#1932). The missing `console.json` write left an unattended multi-spec run un-archived by `archive-merged.js`'s `readConsoleState` — the same gap #1854 fixed for the single-spec path.

Full spec: `.claude-tweaks/pipelines/2026-09-12T111554-record-2007/work/2007-spec.md`.

## Task 1: Fan `console-resolve.js` out over each `spec-{N}/` dir plus the parent

**Files:**
- Modify: `plugin/skills/flow/multispec-review-console.md` (`## Auto-resolution short-circuit` section, ~line 62-67 pre-change)

**Step 1 — Replace the per-item loop:**

Replace the hand-rolled "render every section... resolve every item... log one AUTO line per item" prose with: for each `spec-{N}/` subdirectory named in `manifest.yml` (spec execution order), plus once more over the parent run dir itself, invoke `node "${CLAUDE_PLUGIN_ROOT}/bin/console-resolve.js" --run {dir} --policy console-auto [--dry-run]` — N+1 calls, never a single call over the whole tree (per this record's Non-Goals — no parent-manifest-aware mode added to `bin/lib/console/resolve.js`).

**Step 2 — Per-call isolation:**

A call that exits non-zero for one `spec-{N}/` (malformed `engine-state.json`, or any other non-zero exit) does not abort the fan-out for the rest — mirror Step 3's existing engine-call isolation precedent in the same file. Note the dropped directory in the Not run/Failed footer with the CLI's own stderr text.

**Step 3 — Aggregate and execute:**

Insert each surviving call's stdout table verbatim, in manifest order. Each call already writes its own `decisions.md` block and `console.json` — no separate per-item logging remains in the prose. Execute every returned resolution through the file's own "On approval" procedure.

**Step 4 — Bundle merge decision stays independent:**

State explicitly that the bundle-level branch-finish/merge decision is never read from any individual call's own `merge.resolution` field (each call only sees its own directory's members/grants; the parent-level call has none). The needs-human and ungranted-member carve-out prose is preserved verbatim from the pre-change section — it is not itself part of the CLI wiring, and existing conformance tests (`console-autoresolve-needs-human-carveout.test.js`, `console-autoresolve-ungranted-member-carveout.test.js`) pin its exact phrasing and adjacency to "defaults to merge".

**Verify:**
```bash
node --test tests/console-resolve-conformance.test.js tests/console-autoresolve-needs-human-carveout.test.js tests/console-autoresolve-ungranted-member-carveout.test.js tests/multispec-review-console-render-not-skip.test.js
```
Expected: all pass (byte ceiling 40960 respected — file is 37825 bytes after the change).

**Status: DONE.**

## Task 2: Conformance test pinning the fan-out shape

**Files:**
- Modify: `tests/console-resolve-conformance.test.js`

Add tests (go-red proven against a frozen pre-#2007 excerpt of the retired per-item-loop prose, per `skill-prose-conformance-tests`):
1. The short-circuit section contains `console-resolve.js" --run` exactly once.
2. The retired per-item logging clause (`log one \`AUTO {time} — Review Console: auto-resolved {item}\``) no longer appears.
3. The fan-out names `spec-{N}/`, "the parent run dir itself", and "N+1 calls, never a single call over the whole tree".
4. The bundle merge-decision independence statement is present.

**Status: DONE** — `node --test tests/console-resolve-conformance.test.js` passes (9 tests).

## Full verification

```bash
npm test
```

Ran; 8236/8237 pass. The one failure (`tests/impeccable-cli-contract.test.js:60` — "the installed CLI matches the pinned version") is pre-existing environment drift (globally installed `impeccable@4.1.0` vs the pinned `3.6.0`), reproduced identically on a clean stash of this branch's changes — unrelated to this record.

## Acceptance Criteria mapping

1. Section contains `console-resolve.js" --run` and no hand-rolled per-item loop — pinned by the new conformance test (Task 2).
2. Each `spec-{N}/` and the parent get their own `console.json` — each fan-out call writes its own (`console-resolve.js`'s own write path, unchanged by this record).
3. One dir's failure doesn't drop the whole console — Step 2 above (isolation prose), and verified directly against the real CLI: `tests/bin-lib/console/cli.test.js`'s new "multi-spec fan-out isolation" test builds two sibling run dirs under one root, makes one's `console.json` unparseable (exit 5), and confirms the sibling's own `--run` call still resolves normally (exit 0) — proving each fan-out call's independence rather than only asserting it in prose.
4. Bundle merge decision never reads a per-call `merge.resolution` — pinned by the new conformance test.
5. `npm test` passes with no regressions — confirmed above.
