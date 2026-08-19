# Stories — Refine (Step 5)

Loaded by `/claude-tweaks:stories` Step 5 **only when** `REFINE=true` (the default). When `refine=false` was passed in `$ARGUMENTS`, SKILL.md skips Step 5 entirely.

Refine validates a sample of newly-written stories against the live app, captures traces on failure, runs one self-correction round, and tags persistently-failing stories for manual review.

## 5a. Quick Validation Pass

1. Select a sample of stories to validate from the stories just written or regenerated (not unchanged existing stories):
    - All `priority: high` stories.
    - Up to 3 randomly selected `priority: medium` stories.
    - Skip `priority: low` stories in the validation sample.
    - **In update mode, always add existing stories tagged `needs-review`** — they are healing candidates: a previously-failing story that validates cleanly now gets its tag cleared (see 5c), and skipping them would leave the tag stale forever.
    - Maximum 10 stories total — but never at the expense of validating every `priority: high` story. When the high-priority set alone exceeds 10, validate all of them anyway, skip the medium-priority sampling for this run, and note the overflow explicitly in the refinement summary (the reported count reflects the actual, uncapped total) — never silently truncate the high-priority set (same "note the overflow, never silently truncate" rule `wrap-up/skill-curation.md` applies to its own cap).
    - When NEGATIVE is also active, include a mix of positive and negative stories.

2. For each selected story, validate against the live app using agent-browser:
    a. `agent-browser --session <story-id> open <story.url>` (kebab-case session, derived from the story id), then start trace recording immediately: `agent-browser --session <story-id> trace start`. Tracing is record-then-stop — a failure with no recording started yields no trace.
    b. If the story declares `auth: { vault: "<name>" }`: `agent-browser --session <story-id> auth login <name>`. A story with no `auth.vault` is unauthenticated for this validation — its subsequent steps are expected to fail for that reason, not a story defect.
    c. `agent-browser --session <story-id> snapshot -i -c` to get the accessibility tree.
    d. For each step, attempt execution:
       - **Locator check (non-mutating):** search the **current snapshot** for an element matching the step's semantic locator (role + accessible name, testid, text, label, placeholder). Zero matches → record failure: `{ storyId, stepIndex, issue: "locator_unresolved", locator }`. More than one plausible match → record: `{ storyId, stepIndex, issue: "locator_ambiguous", locator, matchCount }` — flag for disambiguation. Exactly one → proceed. Never probe existence with an action-less `find` — a bare `find` with no action **clicks** the element, which mutates the very state being validated.
       - **Action execution:** run the step as one command — `agent-browser --session <story-id> find <locator> <value> <action> [text]` (e.g. `find role button click --name "Add to cart"`, `find label "Email" fill "user@example.com"`), or act on the matching `@eN` ref from the current snapshot (`click @eN`). If the command errors, record: `{ storyId, stepIndex, issue: "action_failed", action, error }`. Take a fresh snapshot after the action — refs regenerate every snapshot and are never reused across steps.
       - **Verify assertion:** If the step has `verify` or is `assert_visible`, evaluate against the post-action snapshot. If the expected element/text is not present, record: `{ storyId, stepIndex, issue: "assertion_mismatch", expected, actual }`.
    e. **On any step failure:** save the trace before closing — `agent-browser --session <story-id> trace stop traces/<story-id>/<timestamp>.zip`. Attach the trace path to the failure record. Then close the session.
    f. **On success:** `agent-browser --session <story-id> close` (recording ends with the session).

3. Collect all validation failures into a FAILURES list. Each failure record includes the trace path when one was captured.

## 5b. Self-Correction Round

4. If FAILURES is empty:
    - Log: "Refinement: All {N} sampled stories validated successfully. No corrections needed."
    - Proceed to the tag self-heal check (step 7a below), then skip to Step 6.

5. If FAILURES is non-empty:
    - For each failed story:
      a. Log the failure details: "Story '{storyId}' failed validation — Step {stepIndex}: {issue}. Trace: {tracePath}"
      b. Re-open the story's URL in a fresh session and run `agent-browser --session <story-id> snapshot -i -c` to capture the current accessibility tree.
      c. Regenerate ONLY the failed story with corrected semantic locators, actions, and assertions based on the live snapshot. For ambiguous locators, prefer adding `name` (for `role`-only locators), switching to `testid` if available, or scoping by an enclosing `role: region` / `role: form`.
      d. Rewrite the corrected story into the YAML file, replacing the draft version.

6. Log the correction summary: "Refinement: {N} stories validated, {M} corrected. Trace files captured for {K} initial failures: traces/<story-id>/<timestamp>.zip."

## 5c. Persistent Failure Handling and Tag Self-Heal

7. If any stories still fail after the correction round:
    - Do NOT delete them. Keep them in the YAML.
    - Add a YAML comment above the story: `# REFINEMENT_WARNING: This story failed automated validation. Manual review recommended. Trace: traces/<story-id>/<timestamp>.zip`
    - Add tag `needs-review` to the story's tags array.
    - Log: "Refinement: {K} stories still failing after correction — tagged 'needs-review' for manual review. Traces are Chrome DevTools traces — open via Chrome DevTools → Performance → Load profile."

7a. **Tag self-heal:** for every validated story that carried a `needs-review` tag from a previous run and passed this validation pass (directly or after one correction), remove the `needs-review` tag and its `# REFINEMENT_WARNING` comment as part of the write. The tag records "failed validation at generation time" — once a later validation passes, keeping it makes `/test qa`'s Story Hygiene section re-report a solved problem indefinitely. Log: "Refinement: cleared needs-review from {N} story(ies) that now validate."

8. Maximum one correction round. Do not loop further — the cap avoids runaway token usage on genuinely broken pages.
