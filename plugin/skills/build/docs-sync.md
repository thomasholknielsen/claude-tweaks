# Common Step 6.5: Documentation Sync — Full Procedure

Loaded by `/claude-tweaks:build` Common Step 6.5 only when `docs/REGISTRY.md` exists.

After journey capture, check if the build's code changes affect documented areas.

1. **Read registry** — Read `docs/REGISTRY.md`.
2. **Get changed files** — `git diff --name-only` since build start (same file list used by Step 6).
3. **Match patterns** — For each registry entry, check if any changed file matches its Auto-detect glob patterns.
4. **For each matched doc:**

> **Parallel execution:** Use parallel tool calls — all Read operations on matched docs and their source files are independent.

   a. Read the doc file
   b. Read the relevant changed source files
   c. Determine the update and the inline-vs-defer decision using `docs-structure.md`'s own "Doc Update Patterns (for /build Step 6.5)" section, in the `/claude-tweaks:init` skill's directory — the canonical doc-type/trigger/action table and the inline-vs-defer threshold live there; this step doesn't restate them.
   d. **Update inline** (per that threshold). Commit separately:
      `git commit -m "Update {doc} — {what changed}"`
   e. **Defer to wrap-up** (per that threshold). Append to ledger with phase `build/docs` and status `open`:
      "{doc} may need updates — {what changed in code}. Review in wrap-up."
5. **No matches** — skip silently. No output.
