# Design Mode — pre-build

Invoked via `/claude-tweaks:design-wrapper pre-build <spec>`. Returns `{mode, result: "ok", loaded, context_size, missed}` or `{mode, skipped, ...}` to caller.

## When this runs

Called by `/claude-tweaks:build` before implementation. Lazy-loads Impeccable reference files plus project design context (`PRODUCT.md` + `DESIGN.md`) into the build subagent's context. Does not modify code — read-only enrichment.

## Preconditions

Run the universal preconditions from `../SKILL.md` (all three detection layers + availability for the Impeccable plugin).

## Procedure

### Step 1: Run preconditions

On any skip, return the skip object — `/build` proceeds without lazy-loaded references (skip is informational, not a gate failure).

### Step 2: Read the spec file

When `<spec>` is a record reference, resolve via the run's materialized file (`{run-dir}/work/{n}-spec.md`, per `skills/flow/materialize.md`); when a path, read directly. Inspect the spec's contents to choose which Impeccable reference files to load.

### Step 3: Decide which Impeccable references to load

> **Parallel execution:** Use parallel tool calls aggressively — Steps 3-4 together read a set of independent files (every Impeccable reference doc the selection rules below resolve to, plus `PRODUCT.md`/`DESIGN.md` or their fallback globs); none depends on another's content, so batch every Read once the file list is decided.

Reference selection rules (inspect the spec body):

- **Always load** when frontend: `typography.md`, `color-and-contrast.md`, `spatial-design.md`
- **Add `motion-design.md`** when the spec mentions animations, transitions, micro-interactions, motion, or hover effects
- **Add `responsive-design.md`** when the spec mentions breakpoints, mobile, tablet, responsive, or viewport
- **Add `interaction-design.md`** when the spec mentions hover/focus states, keyboard navigation, or interactive controls
- **Add `ux-writing.md`** when the spec mentions copy, microcopy, error messages, empty states, or labels

Reference files live inside the Impeccable plugin's skill directory. The wrapper does not bundle them — it lazy-loads them via the Skill tool's read of `/impeccable:impeccable` (consult the Impeccable plugin's own SKILL.md for the canonical paths). When a reference cannot be located, note the miss and continue with what was loaded.

### Step 4: Load project design context (when present)

- **Canonical paths:** `PRODUCT.md` and `DESIGN.md` at the project root. These are written by `/impeccable:impeccable init` (PRODUCT) and `/impeccable:impeccable document` (DESIGN). Confirmed against Impeccable's official documentation (https://impeccable.style/).
- **Fallback discovery:** If neither file is present at root, glob `docs/design/*.md` and `docs/PRODUCT.md`, `docs/DESIGN.md` as a defensive secondary location.

Missing files are not errors — they mean `/impeccable:impeccable init` and `document` have not been run yet. Read each discovered file and include it in the loaded set.

## Output to caller

```json
{
  "mode": "pre-build",
  "result": "ok",
  "loaded": [ "<path1>", "<path2>", ... ],
  "context_size": <approx tokens, sum of file sizes / 4>,
  "missed": [ "<path that was expected but not found>" ]
}
```

The `context_size` is a rough estimate (`bytes / 4`) — used by `/build` to decide whether to summarize the references before injecting into the subagent prompt versus passing them whole.

`pre-build` does not modify code. The loaded references are read-only context for the implementer subagent.
