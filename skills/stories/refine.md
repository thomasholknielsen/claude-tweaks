# Stories — Refine (Step 5)

Loaded by `/claude-tweaks:stories` Step 5 **only when** `REFINE=true` (the default). When `refine=false` was passed in `$ARGUMENTS`, SKILL.md skips Step 5 entirely.

Refine validates a sample of newly-written stories against the live app, captures traces on failure, runs one self-correction round, and tags persistently-failing stories for manual review.

## 5a. Quick Validation Pass

1. Select a sample of stories to validate from the stories just written or regenerated (not unchanged existing stories):
    - All `priority: high` stories.
    - Up to 3 randomly selected `priority: medium` stories.
    - Skip `priority: low` stories in the validation sample.
    - Maximum 10 stories total — but never at the expense of validating every `priority: high` story. When the high-priority set alone exceeds 10, validate all of them anyway, skip the medium-priority sampling for this run, and note the overflow explicitly in the refinement summary (the reported count reflects the actual, uncapped total) — never silently truncate the high-priority set (same "note the overflow, never silently truncate" rule `wrap-up/skill-curation.md` applies to its own cap).
    - When NEGATIVE is also active, include a mix of positive and negative stories.

2. For each selected story, validate against the live app using agent-browser:
    a. `agent-browser --session <story-id> open <story.url>` (kebab-case session, derived from the story id).
    b. If the story declares `auth: { vault: "<name>" }`: `agent-browser --session <story-id> auth use <name>`. A story with no `auth.vault` is unauthenticated for this validation — its subsequent steps are expected to fail for that reason, not a story defect.
    c. `agent-browser --session <story-id> snapshot -i -c` to get the accessibility tree.
    d. For each step, attempt execution:
       - **Locator resolution:** Run `agent-browser --session <story-id> find <type> <args>` for the step's semantic locator. If `find` returns 0 matches, record failure: `{ storyId, stepIndex, issue: "locator_unresolved", locator }`. If `find` returns >1 matches, record: `{ storyId, stepIndex, issue: "locator_ambiguous", locator, matchCount }` — flag for disambiguation. If exactly 1, capture the resulting `@eN` ref and proceed.
       - **Action execution:** Run the action against the resolved ref (e.g., `click @e3`, `fill @e7 "user@example.com"`). If it fails, record: `{ storyId, stepIndex, issue: "action_failed", action, error }`.
       - **Verify assertion:** If the step has `verify` or is `assert_visible`, evaluate against the post-action snapshot. If the expected element/text is not present, record: `{ storyId, stepIndex, issue: "assertion_mismatch", expected, actual }`.
    e. **On any step failure:** capture trace before closing — `agent-browser --session <story-id> trace save traces/<story-id>/<timestamp>.zip`. Attach the trace path to the failure record. Then close the session.
    f. **On success:** `agent-browser --session <story-id> close`.

3. Collect all validation failures into a FAILURES list. Each failure record includes the trace path when one was captured.

## 5b. Self-Correction Round

4. If FAILURES is empty:
    - Log: "Refinement: All {N} sampled stories validated successfully. No corrections needed."
    - Skip to Step 6.

5. If FAILURES is non-empty:
    - For each failed story:
      a. Log the failure details: "Story '{storyId}' failed validation — Step {stepIndex}: {issue}. Trace: {tracePath}"
      b. Re-open the story's URL in a fresh session and run `agent-browser --session <story-id> snapshot -i -c` to capture the current accessibility tree.
      c. Regenerate ONLY the failed story with corrected semantic locators, actions, and assertions based on the live snapshot. For ambiguous locators, prefer adding `name` (for `role`-only locators), switching to `testid` if available, or scoping by an enclosing `role: region` / `role: form`.
      d. Rewrite the corrected story into the YAML file, replacing the draft version.

6. Log the correction summary: "Refinement: {N} stories validated, {M} corrected. Trace files captured for {K} initial failures: traces/<story-id>/<timestamp>.zip."

## 5c. Persistent Failure Handling

7. If any stories still fail after the correction round:
    - Do NOT delete them. Keep them in the YAML.
    - Add a YAML comment above the story: `# REFINEMENT_WARNING: This story failed automated validation. Manual review recommended. Trace: traces/<story-id>/<timestamp>.zip`
    - Add tag `needs-review` to the story's tags array.
    - Log: "Refinement: {K} stories still failing after correction — tagged 'needs-review' for manual review. See trace files for inspection: `agent-browser trace view <path>`."

8. Maximum one correction round. Do not loop further. (agent-browser's token-efficient snapshot+find pattern reduces context cost vs. earlier CSS-selector validation, but the cap stays in place to avoid infinite loops on genuinely broken pages.)
