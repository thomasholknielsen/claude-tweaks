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
   c. Determine the update using the doc update patterns from `docs-structure.md` in the `/claude-tweaks:init` skill's directory. Each doc type has specific triggers and update actions:
      - API endpoint added/changed/removed → add/update/remove rows in the endpoint table
      - New env variable or config → add to prerequisites or env setup section
      - New dependency or tool → update stack or prerequisites
      - Broken file path references → fix paths to new locations
      - Architectural change → flag for wrap-up (too big for inline)
   d. **Update inline** when the change is clearly scoped (adding a table row, updating a command, fixing a path — < 5 minutes of editing). Commit separately:
      `git commit -m "Update {doc} — {what changed}"`
   e. **Defer to wrap-up** when the change is structural (doc needs reorganization, new section, or requires reading multiple files to understand impact). Append to ledger with phase `build/docs` and status `open`:
      "{doc} may need updates — {what changed in code}. Review in wrap-up."
5. **No matches** — skip silently. No output.
