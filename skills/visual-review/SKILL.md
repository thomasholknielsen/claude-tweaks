---
name: claude-tweaks:visual-review
description: Use when you want to visually review a running application in the browser — inspect UI quality, walk user journeys, discover undocumented journeys, or generate creative improvement ideas. Works standalone or as a step within /claude-tweaks:review.
argument-hint: "[<url>|journey:<name>|discover]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Visual Review — Browser-Based UI Inspection

Review a running application through the browser: first impressions, persona-based interaction, structured analysis, performance vitals, and creative reimagination. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │
                                             [ /claude-tweaks:visual-review ]
                                              (page, journey, or discover mode)
```

This SKILL.md is the **orientation + mode resolution** layer. The mechanical browser procedures (warm-up, batch walks, vitals capture, trace on failure, the Step 1-6 review flow) live in `browser-review.md` in this skill's directory — that file is canonical.

## When to Use

- After a build — visually inspect what was built
- To walk a documented user journey and test its "should feel" expectations
- To discover and document journeys in a brownfield project
- During `/claude-tweaks:review` Step 6 — invoked in **full** mode
- After QA test runs — leverage screenshots and page inventories for enriched review
- Standalone visual inspection of any running web application

## Modes

| Mode | Input | What happens |
|------|-------|-------------|
| **page** | URL or description | Review a single page or flow. Full creative framework + vitals. |
| **journey** | `journey:{name}` | Walk a documented journey step by step using a single batch invocation. Each step reviewed against its "should feel" / "red flags." Vitals captured per page. |
| **discover** | `discover` | Explore the running app to identify and document undocumented user journeys. Vitals captured per discovered page. |
| **recommendation** | `--mode=recommendation` (typically passed by `/review` Step 6 code-only) | Detect UI changes via `git diff` and identify affected journeys. Returns a structured recommendation (which journeys to walk, severity) without opening the browser. No agent-browser dependency. |

### When to use each mode

- **Journey mode** is the richer review — defined persona, goal, and experiential expectations at every step. Use when a documented journey exists for the affected flow.
- **Page mode** is for quick checks, single-page changes, or pages that aren't part of a defined journey yet.
- **Discover mode** is for brownfield projects that need journey coverage bootstrapped — codebase scan + browser walkthrough produces new journey files.
- **Recommendation mode** is for callers that need a "should we walk anything?" signal without committing to a full browser review — used by `/review` Step 6 in code-only mode to surface journey suggestions in the review summary.

## Mode Resolution

`$ARGUMENTS` controls mode and target.

### Standalone (invoked directly):

```
/claude-tweaks:visual-review http://localhost:3000           → page mode
/claude-tweaks:visual-review journey:checkout                → journey mode
/claude-tweaks:visual-review discover                        → discover mode
/claude-tweaks:visual-review                                 → page mode, auto-detect dev URL
```

### Pipeline context (invoked by `/review`):

The parent skill passes:
- **Mode** — `full` (code + visual), `visual`, `journey:{name}`, or `discover`
- **QA data** — when available from a recent `/claude-tweaks:test` run
- **Spec context** — spec number or changed files for scoping

When invoked by `/review` in **full** mode, the visual review runs after code review steps complete. In standalone visual/journey/discover modes, the code review is skipped.

## Step 0.5: Mode — `recommendation` (short-circuit)

When the resolved mode is `recommendation` (typically invoked as `--mode=recommendation` from `/review` Step 6 code-only), skip the browser entirely and produce a structured recommendation instead. This mode has no `agent-browser` dependency and no dev URL requirement.

Procedure:

1. **Resolve scope** — accept the changed-files list from the parent (preferred) or fall back to `git diff --name-only` against the base branch.
2. **Cross-reference with journeys** — read `docs/journeys/*.md` and match the changed files against each journey's `files:` frontmatter. A journey is **affected** when at least one of its `files:` entries appears in the changed-file set.
3. **Score severity** — for each affected journey:
   - `high` — primary flow step files (page entry, primary action component) changed
   - `medium` — supporting components or non-primary steps changed
   - `low` — peripheral files (helpers, styles only) changed
4. **Return structured recommendation:**

```markdown
### Visual Review Recommendation (no browser)

| Journey | Severity | Changed files in journey |
|---------|----------|--------------------------|
| {journey-name} | {high\|medium\|low} | {file1}, {file2} |

> Recommended follow-up: `/claude-tweaks:visual-review journey:{top-severity-journey-name}`
```

If no journeys are affected, return: `No documented journeys affected by the diff. Visual review not recommended.`

5. **Return control** — skip the remaining Steps (1-4). Do not open the browser, do not run a survey, do not append a Creative Opportunities block.

Recommendation mode is **read-only and browser-free** — it produces a routing signal, nothing else.

## Step 1: Browser Prerequisites

See `_shared/browser-detection.md` for the detect / install / verify procedure (daemon auto-starts on port 4848; recovery via `agent-browser doctor`).

Visual-review-specific behavior when `agent-browser` is unavailable:

**Auto mode:** in addition to the standard `STAGED` log line from the shared procedure, write `staged/visual-review-skipped.md` describing the skip and the install command. Append to the auto-decision log under `## /visual-review` in `{run-dir}/decisions.md` (per `_shared/auto-decision-log.md`). Surface at Review Console. The review proceeds in code-only mode without further interruption.

**Interactive mode:** the shared procedure prompts with install / skip options. Frame the skip choice as "skip visual review — proceed with code-only review" so the user understands the impact in this skill's context. Never silently skip — always report and offer options.

Session naming, screenshot paths, and the full operation vocabulary follow the `/claude-tweaks:browse` skill's conventions. See `browser-review.md` (Prerequisites + Session naming sections) for the canonical naming and path rules used by this skill.

## Step 2: Dev URL Resolution

This skill resolves the dev URL silently when possible. The canonical resolution procedure lives in `dev-url-detection.md` in `skills/_shared/` (probes `stories/servers.yml` first, then applies **worktree awareness** (Step 2.7 — a responding port in a worktree run may be the main checkout's server, serving the *wrong* code), then falls back to detection heuristics and, in auto mode, **starting an ephemeral worktree server** on a free port). The auto-mode behavior below extends that procedure with policy-driven skip semantics.

If `dev-url-detection.md` cannot yield a reachable `APP_URL` for *this* checkout:

**Auto mode:** Run the full `dev-url-detection.md` Step 3 first — in a worktree (the `/flow` default) it auto-starts an ephemeral server on a free port (reversible, tracked, torn down at wrap-up). Only when that yields no `APP_URL` (no dev command found, or the server failed to come up) do you auto-skip visual review (do not ask). Append to the auto-decision log under `## /visual-review` in `{run-dir}/decisions.md` (per `_shared/auto-decision-log.md`):
```
- STAGED {HH:MM:SS} — Step 2: no reachable dev URL for this checkout (start attempted: {yes/no}, reason: {no-dev-command | start-timeout}). Visual review skipped — code-only mode. Surface at Review Console.
```
Write `staged/visual-review-dev-url.md` capturing what was attempted. The review proceeds in code-only mode.

**Interactive mode:**

Call `AskUserQuestion` with `question`: `"The app doesn't seem to be running at {url}. Should I:"`, `header`: `"Dev server"`, `multiSelect`: `false` — no option is marked (Recommended); the current text has no explicit recommendation among the three:

- Option 1 — `label`: `"Start dev server"`, `description`: `"start it on a free port and continue"`
- Option 2 — `label`: `"Try different URL"`, `description`: `"provide a different URL to check"`
- Option 3 — `label`: `"Wait"`, `description`: `"wait while you start the dev server yourself"`

In interactive mode, only start the server with the user's consent (option 1). In auto mode, starting an ephemeral worktree server is pre-authorized (it is reversible and torn down at wrap-up) — see `dev-url-detection.md` "Ephemeral server start".

## Step 3: Run Visual Review

Run the full review procedures from `browser-review.md` in this skill's directory. That file is the canonical source for everything mechanical — session lifecycle, batch journey walks, annotated screenshots, vitals capture and thresholds, trace-on-failure, and the Step 0-6 review flow (Reconnaissance, Health Check, First Impressions, Use It, Analyze, Reimagine, Report & Route).

Select the procedure block matching the resolved mode:

- **Page mode** — read `browser-review.md` "Page Mode" section, then Steps 1-6.
- **Journey mode** — read `browser-review.md` "Journey Mode" section (loads the journey, assembles the batch, walks per-step, assesses the arc), then Step 6 for the report.
- **Discover mode** — read `browser-review.md` "Discover Mode" section (Phases 1-6: codebase scan → candidates → browser walkthrough → write journey files → coverage report → handoff).

Reconnaissance (Step 0) runs before the main steps in **page** and **journey** modes — read `reconnaissance.md` in this skill's directory for the procedure. Discover mode finds the pages itself (Phase 1 codebase scan, Phase 2 candidate selection), so per-page reconnaissance does not apply — see `discover-mode.md`.

## Step 4: Creative Opportunities Survey

After the visual review report is assembled (per `browser-review.md` Step 6: Report & Route), invoke the `/claude-tweaks:design-wrapper` wrapper's `survey` mode to surface ranked Creative Opportunities — recommendations for which Impeccable creative commands might enhance the reviewed pages, per the survey "would help" criteria → command mapping in `command-map.md` (the single source of truth for that set — see design-wrapper/SKILL.md's Reference sub-files).

```
/claude-tweaks:design-wrapper survey <changed-files> --screenshots <captured-paths> --source visual-review
```

Pass `--source visual-review` on every call this skill makes into `/claude-tweaks:design-wrapper` (this section and Step 5 below) — it is this wrapper's Component-Skill Contract fallback signal for a caller-invoked call arriving with no `$PIPELINE_RUN_DIR` (standalone `/visual-review` never has one of its own to forward), and without it the wrapper cannot tell this call apart from a direct human invocation.

Pass:
- The file list scoped to the review (from `git diff --name-only` or the spec's file list).
- The annotated screenshot paths captured during review (`screenshots/browse/<session>/*.png`) — the wrapper analyzes each per the criteria table in `command-map.md`.

Handle the wrapper's return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` with non-empty list, `$PIPELINE_RUN_DIR` set | Render the Creative Opportunities block (template below) appended to the review report — recommendations-only, unchanged from prior behavior. The parent pipeline owns any further decision. |
| `{result: "ok", recommendations: [...]}` with non-empty list, no `$PIPELINE_RUN_DIR` (standalone) | Render the Creative Opportunities block (template below), then the apply-gate (see "Applying a recommendation" below). |
| `{result: "ok", recommendations: []}` | Omit the block entirely — no opportunities surfaced is a valid outcome, not a failure. |
| `{skipped: ...}` | Omit the block. Note the skip reason inline only when it would surprise the user (e.g., "Creative survey skipped — Impeccable plugin not installed"). |

### Creative Opportunities block template

```markdown
### Creative Opportunities (from /visual-review)

| # | Page | Observation | Suggested command |
|---|------|------------|-------------------|
| 1 | /pricing | Hero feels generic — pure black on white, no personality | `/impeccable:impeccable bolder pricing` |
| 2 | /empty-cart | Empty state shows only "No items" text | `/impeccable:impeccable delight empty-cart` |
```

When the wrapper reports `suppressed > 0` in its return, append a small note below the table: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design-wrapper reset-recommendations <spec>.`

### Applying a recommendation (standalone only)

When running standalone (no `$PIPELINE_RUN_DIR`), the block above is never the final word — follow it with the apply gate below, using `question`: `"Apply any of these?"`, `header`: `"Creative Opportunities"`. "Apply all" means every row above; each row's target is its listed page.

#### Apply gate (shared procedure — used here and by Step 5's "Fix flagged issues")

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

If any command ran, re-verify: invoke `/claude-tweaks:test skip-qa` and report the result. If re-verification fails, report the failure and name the most recently invoked command as the likely cause rather than reverting automatically — reverting is the user's call.

## Step 5: Boost (standalone only)

Runs only when `/visual-review` is standalone and interactive — no `$PIPELINE_RUN_DIR` set (same signal Step 4 and the Component-Skill Contract already use). When parent-invoked, this step does not apply; behavior is unchanged.

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
3. Run the apply gate (Step 4's "Apply gate (shared procedure)" above), using `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`. "Apply all" here means every row marked `Fix` above; each accepted finding's command is its `suggestion`-named Impeccable command, invoked against the finding's `file`.

**Option 2 or 3 — Explore alternatives:**

Invoke `/claude-tweaks:design-wrapper live <APP_URL> --source visual-review` via the Skill tool, targeting the already-running app (the `APP_URL` resolved back in Step 2). The human explores alternatives directly in their browser; this skill does not process the outcome further — `live` mode's own accept flow already writes any accepted change to source. After the live session ends, note in the report that a live-mode session ran and mention re-running `/claude-tweaks:test` if changes were accepted.

**Option 4:** No further action.

## Next Actions

When invoked directly (not by a parent skill), call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Code review (Recommended)"`, `description`: `"/claude-tweaks:review {spec} — full code review"`
- Option 2 — `label`: `"Walk a journey"`, `description`: `"/claude-tweaks:visual-review journey:{name} — walk a specific journey"`
- Option 3 — `label`: `"Generate QA stories"`, `description`: `"/claude-tweaks:stories — generate QA stories from what was reviewed"`
- Option 4 — `label`: `"Capture ideas"`, `description`: `"/claude-tweaks:capture {idea} — save ideas surfaced during the review"`

This is the canonical handoff block for the skill. Mode-specific Next Actions exist in `discover-mode.md` (post-discover variant emphasising journey walks) and `browser-review.md` (post-page-review variant gated by review-source signals) for situations where the standalone block doesn't fit the mode's deliverable — they render their own independent `AskUserQuestion` call instead of this one, never merged with it. When invoked by a parent (`/review` or `/init`), omit Next Actions — the parent handles flow control and summary.

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 6) in `full` mode, by `/claude-tweaks:init` (Phase 8) for brownfield journey discovery, and by `/claude-tweaks:wrap-up` (`verification-brief.md` Step 2.5 safety-net gate) when a testable record reaches wrap-up without a full pass already having run. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run) — or, when the caller has no run directory of its own to signal with (standalone `/wrap-up` invoking this safety-net gate), by an explicit `--source wrap-up` flag it passes instead, the same fallback `/claude-tweaks:reflect`'s Component-Skill Contract documents. When invoked by a parent (via either signal), omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (neither signal present), render Next Actions as shown above.

**Code-modifying exception.** `/visual-review` is otherwise read-only with respect to code. Two specific, standalone-only, always-consent-gated paths modify code: Step 4's Creative Opportunities apply-gate, and Step 5's Boost gate (Fix option). Both re-verify afterward via `/claude-tweaks:test skip-qa`. Parent-invoked `/visual-review` (`$PIPELINE_RUN_DIR` set) never modifies code — Steps 4 and 5's apply/boost paths do not run in that context.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently skipping when `agent-browser` is unavailable | Always report the missing dependency and offer options — never skip without telling the user |
| Skipping First Impressions in visual review | The whole point is raw reaction before structured analysis — don't make it analytical |
| Starting the dev server without asking **in interactive mode** | Interactive mode offers to start — it doesn't force it. (Auto mode is different: starting an ephemeral worktree server on a free port is pre-authorized and tracked — see `dev-url-detection.md`.) |
| Reusing a responding port without checking it serves *this* worktree | In a worktree run, a server on :3000 is usually the main checkout — reviewing it reports false confidence on the wrong code. Always apply `dev-url-detection.md` Step 2.7 (worktree awareness) before trusting a port. |
| Generic visual ideas ("improve the UX") | Ideas must be concrete and implementable in the current tech stack |
| Running visual review without a running app | The browser can't inspect what isn't served — verify the URL responds first |
| Describing elements by position instead of annotated overlay number | "The button on the right" is brittle; "element [3]" is precise. Always reference annotated screenshot overlays in findings |
| Skipping `vitals` capture | Performance is a first-class finding category — every reviewed page must produce LCP/CLS/INP/TTFB/FCP values |
| Closing the session before saving a trace on failure | Failure reports without a trace path are not actionable — `trace save` first, then `close` |
| Per-step `agent-browser` invocations during journey walks | Use `batch` for journey walks — one process, one session lifecycle, fewer tokens and less latency |
| Batching across sessions | One `agent-browser batch` invocation owns a single session — never mix session names |
| Silently auto-applying a Creative Opportunities suggestion without the apply-gate | The block is recommendations only until the user explicitly accepts via the apply-gate (standalone mode) or takes it away to run manually (parent-invoked mode). /visual-review never executes an Impeccable creative command without that explicit accept. |
| Rendering the Creative Opportunities block when the wrapper returned `recommendations: []` or `{skipped}` | An empty result is a valid outcome — omit the block entirely. Surfacing "no opportunities found" as positive signal is misleading because survey is heuristic, not exhaustive. |
| Duplicating browser procedures in SKILL.md | `browser-review.md` is canonical for all mechanical browser procedures. SKILL.md is for mode resolution, auto-mode policy, and orientation — never copy procedure detail here. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /visual-review in Step 6. In full mode (code + visual), visual review runs after code review. In standalone visual/journey/discover modes, /review delegates entirely to /visual-review. |
| `/claude-tweaks:browse` | /visual-review uses /browse's conventions (session naming, screenshot path, trace path) and operation vocabulary. /browse is the conventions reference; /visual-review is the review procedure. Annotated screenshots, batch walks, vitals, and trace-on-failure all follow /browse's contract. |
| `/claude-tweaks:stories` | Both skills consume `dev-url-detection.md` from `skills/_shared/` for URL resolution. /visual-review may recommend running /stories after discovering pages. |
| `/claude-tweaks:journeys` | /visual-review (journey mode) walks journeys created by /journeys. /visual-review (discover mode) creates new journey files. |
| `/claude-tweaks:journey-health` | The deep tier falls back to `/visual-review journey:{name}` when auditing a journey that has no story coverage yet. |
| `/claude-tweaks:test` | QA data from /test enriches the visual review (page inventories, caveats, screenshots). Trace-on-failure convention is shared with qa-agent. |
| `/claude-tweaks:flow` | /flow invokes /review in full mode, which delegates to /visual-review for the browser portion. |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup. Phase 8 delegates to /visual-review discover for brownfield journey bootstrapping. |
| `/claude-tweaks:capture` | /visual-review may recommend capturing ideas surfaced during the review. |
| `/claude-tweaks:design-wrapper` | After the review report is assembled, /visual-review invokes `/claude-tweaks:design-wrapper survey` with the captured screenshot paths and renders the resulting Creative Opportunities block in the report (anchor 2 of v4.5.0's creative surfacing system). The wrapper handles its own detection (non-frontend skips); the block is omitted when the wrapper returns no recommendations. Standalone-only, the Step 5 Boost gate additionally invokes `review` mode (Fix flagged issues, which re-verifies via `/claude-tweaks:test skip-qa` after applying) and `live` mode (Explore alternatives, which notes in the report that re-running `/claude-tweaks:test` may be worth it if changes were accepted, rather than re-verifying itself) — both consent-gated. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The "Auto mode" branches in Step 1 (browser prereqs) and Step 2 (dev URL) implement the contract's auto-skip + stage-at-Review-Console pattern. |
| `/claude-tweaks:wrap-up` | `verification-brief.md`'s Step 2.5 safety-net gate invokes /visual-review directly (same mode resolution as /review Step 6) when a testable record reaches wrap-up without a full pass already having run. Any bug found gates `demo:pending` the same way /review's Step 3 Routing gates PASS. |
| `/claude-tweaks:demo` | `/demo`'s Verification Brief digest (Step 3) is sourced from /visual-review's own report — headline result + 1-3 committed screenshots. `/demo`'s optional "Show me live" escape hatch consumes /browse's conventions directly (the same relationship /visual-review itself has with /browse), not a re-invocation of /visual-review. |
| `/claude-tweaks:help` | Component skill — /claude-tweaks:help lists it in the component skills table. |
