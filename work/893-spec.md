---
record: 893
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 893: archiveRunDir() never moves engine-state.json, leaving orphaned run-dir residue

## Current State

plugin/bin/lib/reconcile/archive-merged.js's archiveRunDir() moves a fixed file list — ['config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged'] — into .claude-tweaks/pipelines/archive/{run-id}/, but omits engine-state.json (written by bin/wrap-up-engine.js plan/record for any wrap-up run that used the curation engine). Hit this twice in one session (2026-08-18): archiving 2026-08-12T054337-dispatch-automerge-checkout-fix-standalone and this run's own 2026-08-18T124945-ledger-cleanup-standalone both left an orphaned engine-state.json behind in the live (pre-archive) directory, which also silently defeats archiveRunDir's final fs.rmdirSync(runDir) cleanup (non-empty dir, caught by its own best-effort try/catch) — the emptied-looking run dir never actually disappears from .claude-tweaks/pipelines/.

## Deliverables

- Add `engine-state.json` to the file-name list in `archiveRunDir()` (`plugin/bin/lib/reconcile/archive-merged.js`)
- Check for other wrap-up-engine-written filenames with the same gap (only `engine-state.json` is confirmed so far)

## Acceptance Criteria

- Archiving a run dir that has an `engine-state.json` moves it into the archive alongside the other bookkeeping files
- The live run dir is fully empty after archival and `fs.rmdirSync` actually succeeds
- A regression test pins this (archive a fixture run dir with `engine-state.json` present, assert it lands in the archive path and the source dir no longer exists)

_Filed by `capture` via specShapedBody._

## Build note (verification-only — no code change)

`archiveRunDir()`'s fixed file-name list was already replaced with directory enumeration by
`08098fe7` ("Enumerate run-dir archival instead of a fixed list; guard tracked strays", refs #902),
already on `origin/main` (this worktree was fast-forwarded `0054543a..e8efe7fb` to pick it up before
this build ran). The enumeration loop moves every entry in the run dir except `work/` and
`spec-{N}/` subdirectories — `engine-state.json`, or any other current or future wrap-up-engine
filename, is caught automatically; there is no longer a fixed list to fall behind. A regression
test already pins this exact scenario: `tests/reconcile.test.js:337`,
`'archiveRunDir: enumeration archives files the fixed list never named (engine-state.json,
extra.txt)'` — passes (`node --test tests/reconcile.test.js`, 71/71).

All three Acceptance Criteria are satisfied by code already on `main`. This record is superseded
by #902's broader fix and should be closed as already-resolved (referencing #902 / commit
`08098fe7`) rather than merged as new work — no diff accompanies this build.
