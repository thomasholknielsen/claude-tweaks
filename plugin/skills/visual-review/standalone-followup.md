# Visual Review — Standalone Follow-Up (Apply Gate + Boost)

Loaded by `/claude-tweaks:visual-review` SKILL.md only when running standalone and interactive — no `$PIPELINE_RUN_DIR` set (same signal SKILL.md's Step 4 return-shape table and the Component-Skill Contract already use). When invoked by a parent skill (`$PIPELINE_RUN_DIR` set, or the explicit `--source <parent-skill>` fallback), this file is skipped entirely — SKILL.md's Step 4 Creative Opportunities block is the final word, and Step 5 (Boost) does not run.

This file is the continuation of SKILL.md's Step 4 ("Applying a recommendation") plus the whole of Step 5 ("Boost").

## Step 4 continued: Applying a recommendation

When running standalone (no `$PIPELINE_RUN_DIR`), the Creative Opportunities block (SKILL.md Step 4) is never the final word — follow it with the apply gate below, using `question`: `"Apply any of these?"`, `header`: `"Creative Opportunities"`. "Apply all" means every row above; each row's target is its listed page.

### Apply gate (shared procedure — used here and by Step 5's "Fix flagged issues")

Both this section and Step 5's "Fix flagged issues" resolve their own already-rendered batch table through this same three-branch procedure. The caller supplies its own `question`/`header` (see each call site); the branches, invocation mechanics, and re-verify step below are identical for both.

Call `AskUserQuestion` with `multiSelect`: `false` and:

- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply every item the table above recommends"`
- Option 2 — `label`: `"Choose individually"`, `description`: `"Pick which items to apply"`
- Option 3 — `label`: `"None"`, `description`: `"Leave things as-is, apply nothing"`

- **"Apply all"** — apply every item the table above already marks for action (this section: every row; Step 5: every row marked `Fix`).
- **"Choose individually"** — narrow to a subset via a follow-up free-text list of row numbers (the table is already numbered — no per-row `AskUserQuestion` needed).
- **"None"** — no further action; the report stands as rendered.

Before invoking any accepted item's command, verify Impeccable plugin availability directly — check whether `/impeccable:impeccable` resolves in the available skills list (same check as `design-wrapper/SKILL.md` Step 2). This check is required here: `survey`'s own precondition check does NOT gate on availability (design-wrapper/SKILL.md's "Universal preconditions" `survey` note — it's informational only, so `survey` can still return non-empty recommendations when Impeccable isn't installed), unlike `review`'s own gate for Step 5, which does confirm availability before returning findings. If unavailable, report `"Impeccable plugin not installed — run /claude-tweaks:init to set up integration"` for the affected item(s) and skip invocation entirely rather than calling the Skill tool.

For each accepted item (once availability is confirmed), invoke its listed command directly via the Skill tool against its target (page or file) — e.g. `/impeccable:impeccable bolder pricing` — the same low-level invocation the relevant `design-wrapper` mode performs internally; no new wrapper mode is needed. Group items that share the same file and command into one invocation (relevant to Step 5's findings table; a no-op here, since each row here targets its own page).

Before applying any accepted item, assemble craft context per `_shared/design-craft.md` at runtime: a path that dispatches an agent inlines the assembled result into the dispatch prompt (agents can't follow references), and a path that applies fixes directly in-session assembles the same context into the composer's own working context before editing.

If any command ran, re-verify: invoke `/claude-tweaks:test skip-qa` and report the result. If re-verification fails, report the failure and name the most recently invoked command as the likely cause rather than reverting automatically — reverting is the user's call.

## Step 5: Boost

After Step 4's Creative Opportunities block (and any apply-gate action from it) completes, offer once, as its own message:

> Want me to go further?
>
> 1. Fix flagged issues **(Recommended)**
> 2. Explore alternatives
> 3. Both
> 4. No thanks, just the report

**Option 1 or 3 — Fix flagged issues:**

1. Invoke `/claude-tweaks:design-wrapper review --source visual-review` via the Skill tool with no explicit target — the wrapper's `review` mode documents its target as a spec number or path, not a file list, and always resolves scope itself: an active spec's file list intersected with `git diff --name-only`, or a full-diff fallback filtered to frontend paths (see `design-wrapper/modes/review.md` Step 2). This means Fix path's scope tracks the current uncommitted diff, not necessarily every page walked in this browser session — if the two differ noticeably, note that in the report.
2. The wrapper runs `critique` + `audit` and returns `{result: "advisory", findings: [...], score_trend: {...}}`. Render the findings as a batch table:

   ```
   | # | Source | File | Category | Severity | Message | Recommended |
   |---|--------|------|----------|----------|---------|-------------|
   | 1 | {source} | {file} | {category} | {severity} | {message} | {Fix\|Skip} |
   ```

   Pre-fill Recommended: `severity: error` or `severity: warning` → `"Fix"`; `severity: info` → `"Skip"`.
3. Run the apply gate ("Apply gate (shared procedure)" above), using `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`. "Apply all" here means every row marked `Fix` above; each accepted finding's command is its `suggestion`-named Impeccable command, invoked against the finding's `file`.

   Before applying any accepted finding here, assemble craft context per `_shared/design-craft.md` at runtime — same split as Step 4's apply gate: inline into the dispatch prompt when dispatching, assemble into the composer's own working context when editing in-session. The "Explore alternatives" option below (a delegation to `live` mode that processes no outcome) gets nothing.

**Option 2 or 3 — Explore alternatives:**

Invoke `/claude-tweaks:design-wrapper live <APP_URL> --source visual-review` via the Skill tool, targeting the already-running app (the `APP_URL` resolved back in SKILL.md Step 2). The human explores alternatives directly in their browser; this skill does not process the outcome further — `live` mode's own accept flow already writes any accepted change to source. After the live session ends, note in the report that a live-mode session ran and mention re-running `/claude-tweaks:test` if changes were accepted.

**Option 4:** No further action.
