---
name: claude-tweaks:visual-review
description: Use when you want to visually review a running application in the browser — inspect UI quality, walk user journeys, discover undocumented journeys, or generate creative improvement ideas. Works standalone or as a step within /claude-tweaks:review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


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

This skill resolves the dev URL silently when possible. The canonical resolution procedure lives in `dev-url-detection.md` in `skills/_shared/` (probes `stories/servers.yml` first, then falls back to detection heuristics). The auto-mode behavior below extends that procedure with policy-driven skip semantics.

If the resolved URL doesn't respond:

**Auto mode:** auto-skip visual review entirely (do not retry, do not ask). Append to the auto-decision log under `## /visual-review` in `{run-dir}/decisions.md` (per `_shared/auto-decision-log.md`):
```
- STAGED {HH:MM:SS} — Step 2: dev URL {url} unreachable. Visual review skipped. Surface at Review Console with hint: start dev server and re-run /visual-review.
```
Write `staged/visual-review-dev-url.md` capturing the URL attempted and the request to retry. The review proceeds in code-only mode.

**Interactive mode:**

```
The app doesn't seem to be running at {url}. Should I:
1. Try a different URL
2. Wait while you start the dev server
```

Do NOT attempt to start the dev server yourself.

## Step 3: Run Visual Review

Run the full review procedures from `browser-review.md` in this skill's directory. That file is the canonical source for everything mechanical — session lifecycle, batch journey walks, annotated screenshots, vitals capture and thresholds, trace-on-failure, and the Step 0-6 review flow (Reconnaissance, Health Check, First Impressions, Use It, Analyze, Reimagine, Report & Route).

Select the procedure block matching the resolved mode:

- **Page mode** — read `browser-review.md` "Page Mode" section, then Steps 1-6.
- **Journey mode** — read `browser-review.md` "Journey Mode" section (loads the journey, assembles the batch, walks per-step, assesses the arc), then Step 6 for the report.
- **Discover mode** — read `browser-review.md` "Discover Mode" section (Phases 1-6: codebase scan → candidates → browser walkthrough → write journey files → coverage report → handoff).

Reconnaissance (Step 0) runs before the main steps in **page** and **journey** modes — read `reconnaissance.md` in this skill's directory for the procedure. Discover mode finds the pages itself (Phase 1 codebase scan, Phase 2 candidate selection), so per-page reconnaissance does not apply — see `discover-mode.md`.

## Step 4: Creative Opportunities Survey

After the visual review report is assembled (per `browser-review.md` Step 6: Report & Route), invoke the `/claude-tweaks:design` wrapper's `survey` mode to surface ranked Creative Opportunities — recommendations for which Impeccable creative commands (`bolder` / `delight` / `animate` / `colorize` / `extract` / `onboard` / `quieter` / `distill` / `overdrive`) might enhance the reviewed pages.

```
/claude-tweaks:design survey <changed-files> --screenshots <captured-paths>
```

Pass:
- The file list scoped to the review (from `git diff --name-only` or the spec's file list).
- The annotated screenshot paths captured during review (`screenshots/browse/<session>/*.png`) — the wrapper analyzes each per the criteria table in `command-map.md`.

Handle the wrapper's return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` with non-empty list | Render the Creative Opportunities block (template below) appended to the review report. |
| `{result: "ok", recommendations: []}` | Omit the block entirely — no opportunities surfaced is a valid outcome, not a failure. |
| `{skipped: ...}` | Omit the block. Note the skip reason inline only when it would surprise the user (e.g., "Creative survey skipped — Impeccable plugin not installed"). |

### Creative Opportunities block template

```markdown
### Creative Opportunities (from /visual-review)

| Page | Observation | Suggested command |
|------|------------|-------------------|
| /pricing | Hero feels generic — pure black on white, no personality | `/impeccable:impeccable bolder pricing` |
| /empty-cart | Empty state shows only "No items" text | `/impeccable:impeccable delight empty-cart` |

> These are recommendations only. Run any command manually if you want to apply it.
```

When the wrapper reports `suppressed > 0` in its return, append a small note below the table: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design reset-recommendations <spec>.`

## Next Actions

When invoked directly (not by a parent skill), end with:

```
1. `/claude-tweaks:review {spec}` — full code review **(Recommended)**
2. `/claude-tweaks:visual-review journey:{name}` — walk a specific journey
3. `/claude-tweaks:stories` — generate QA stories from what was reviewed
4. `/claude-tweaks:capture {idea}` — save ideas surfaced during the review
```

This is the canonical handoff block for the skill. Mode-specific Next Actions exist in `discover-mode.md` (post-discover variant emphasising journey walks) and `browser-review.md` (post-page-review variant gated by review-source signals) for situations where the standalone block doesn't fit the mode's deliverable — they reference back to this section. When invoked by a parent (`/review` or `/init`), omit Next Actions — the parent handles flow control and summary.

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 6) in `full` mode and by `/claude-tweaks:init` (Phase 8) for brownfield journey discovery. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently skipping when `agent-browser` is unavailable | Always report the missing dependency and offer options — never skip without telling the user |
| Skipping First Impressions in visual review | The whole point is raw reaction before structured analysis — don't make it analytical |
| Starting the dev server without asking | Dev URL auto-detection offers to start — it doesn't force it |
| Generic visual ideas ("improve the UX") | Ideas must be concrete and implementable in the current tech stack |
| Running visual review without a running app | The browser can't inspect what isn't served — verify the URL responds first |
| Describing elements by position instead of annotated overlay number | "The button on the right" is brittle; "element [3]" is precise. Always reference annotated screenshot overlays in findings |
| Skipping `vitals` capture | Performance is a first-class finding category — every reviewed page must produce LCP/CLS/INP/TTFB/FCP values |
| Closing the session before saving a trace on failure | Failure reports without a trace path are not actionable — `trace save` first, then `close` |
| Per-step `agent-browser` invocations during journey walks | Use `batch` for journey walks — one process, one session lifecycle, fewer tokens and less latency |
| Batching across sessions | One `agent-browser batch` invocation owns a single session — never mix session names |
| Auto-running commands suggested by the Creative Opportunities block | The block is recommendations only. The user invokes any command manually. /visual-review never executes Impeccable creative commands directly. |
| Rendering the Creative Opportunities block when the wrapper returned `recommendations: []` or `{skipped}` | An empty result is a valid outcome — omit the block entirely. Surfacing "no opportunities found" as positive signal is misleading because survey is heuristic, not exhaustive. |
| Duplicating browser procedures in SKILL.md | `browser-review.md` is canonical for all mechanical browser procedures. SKILL.md is for mode resolution, auto-mode policy, and orientation — never copy procedure detail here. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /visual-review in Step 6. In full mode (code + visual), visual review runs after code review. In standalone visual/journey/discover modes, /review delegates entirely to /visual-review. |
| `/claude-tweaks:browse` | /visual-review uses /browse's conventions (session naming, screenshot path, trace path) and operation vocabulary. /browse is the conventions reference; /visual-review is the review procedure. Annotated screenshots, batch walks, vitals, and trace-on-failure all follow /browse's contract. |
| `/claude-tweaks:stories` | Both skills consume `dev-url-detection.md` from `skills/_shared/` for URL resolution. /visual-review may recommend running /stories after discovering pages. |
| `/claude-tweaks:journeys` | /visual-review (journey mode) walks journeys created by /journeys. /visual-review (discover mode) creates new journey files. |
| `/claude-tweaks:test` | QA data from /test enriches the visual review (page inventories, caveats, screenshots). Trace-on-failure convention is shared with qa-agent. |
| `/claude-tweaks:flow` | /flow invokes /review in full mode, which delegates to /visual-review for the browser portion. |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup. Phase 8 delegates to /visual-review discover for brownfield journey bootstrapping. |
| `/claude-tweaks:capture` | /visual-review may recommend capturing ideas surfaced during the review. |
| `/claude-tweaks:design` | After the review report is assembled, /visual-review invokes `/claude-tweaks:design survey` with the captured screenshot paths and renders the resulting Creative Opportunities block in the report (anchor 2 of v4.5.0's creative surfacing system). The wrapper handles its own detection (non-frontend skips); the block is omitted when the wrapper returns no recommendations. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The "Auto mode" branches in Step 1 (browser prereqs) and Step 2 (dev URL) implement the contract's auto-skip + stage-at-Review-Console pattern. |
