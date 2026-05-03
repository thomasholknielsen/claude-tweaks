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

## Input

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

## Step 1: Browser Prerequisites

`agent-browser` must be installed. The daemon auto-starts on port 4848 on the first command — no setup required. Recovery on crash: `agent-browser doctor`.

If `agent-browser` is unavailable:

```
agent-browser is not installed.

1. Install: `npm install -g agent-browser`
2. Skip visual review — proceed with code-only review
```

Do not silently skip. Always report and offer options.

Use the `/claude-tweaks:browse` skill's operation vocabulary and conventions (session naming, screenshot path, trace path) for all browser operations. Concrete commands live in `agent-browser-reference.md` in the `/claude-tweaks:browse` skill's directory.

### Session naming for this skill

Derive a kebab-case session name from the review target: `pricing-page-review`, `checkout-journey-review`, `discover-public-pages`. One session per page or per journey walk.

## Step 2: Dev URL Resolution

Before prompting for a URL, check the persisted config:

1. Read `stories/auth.yml` — if `servers.default.url` exists, probe it
2. If it responds — use it silently (no prompt needed)
3. If it doesn't respond or no config exists — run the dev URL detection procedure from `dev-url-detection.md` in the `/claude-tweaks:stories` skill's directory

### Ensure the app is running

Before navigating, confirm the application is accessible. If the URL doesn't respond:

```
The app doesn't seem to be running at {url}. Should I:
1. Try a different URL
2. Wait while you start the dev server
```

Do NOT attempt to start the dev server yourself.

## Step 3: Run Visual Review

For the full review procedures, read `browser-review.md` in this skill's directory. That file contains:

- **QA Data Loading** — optional enrichment from recent `/claude-tweaks:test` runs
- **Step 0: Reconnaissance** — contextual pre-analysis (read `reconnaissance.md` in this skill's directory)
- **Step 1: Health Check** — console errors, network failures, rendering
- **Step 2: First Impressions** — the 5-second test, raw reactions
- **Step 3: Use It** — persona-based interaction
- **Step 4: Analyze** — structured inspection
- **Step 5: Reimagine** — creative "best version" exercise
- **Step 6: Report & Route** — findings table with routing

### Mode-specific behavior

- **Page mode** — open a session, run all review steps on the target URL, capture vitals, capture annotated screenshots
- **Journey mode** — walk the journey's steps via a single `agent-browser batch` invocation that bundles `open`, `snapshot`, `screenshot --annotate`, and per-step ops; capture vitals per page; assess the overall arc
- **Discover mode** — codebase scan → journey candidates → browser walkthrough → write journey files; capture vitals per discovered page

### Annotated screenshots

Always use annotated screenshots for visual-review captures. Annotated screenshots overlay numbered markers that match `snapshot` refs, so findings can reference elements precisely (e.g., "primary CTA at element [3] competes visually with secondary link at [5]").

```
agent-browser --session <name> screenshot --annotate --filename screenshots/browse/<session>/<NN>_<description>.png
```

Write findings using the numbered overlays — never describe element position by spatial language ("the button on the right") when an overlay number exists.

### Batch journey walks

For journey mode, replace per-step `agent-browser` invocations with a single `batch` invocation that owns the session lifecycle for that walk:

```
agent-browser batch --session <session> \
  "open <step-1-url>" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/<session>/01_<step-1>.png" \
  "vitals" \
  "open <step-2-url>" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/<session>/02_<step-2>.png" \
  "vitals" \
  ...
  "close"
```

One `batch` invocation owns one session — never mix session names in the same batch. For per-step interactive ops (click, fill, type) that depend on resolving refs from a fresh snapshot, run those interactions outside the batch within the same session, then resume the batch for the next page.

### Performance: vitals capture

After each page is reviewed (page mode) or after each journey step's page settles (journey/discover modes), capture Web Vitals:

```
agent-browser --session <session> vitals
```

Capture: **LCP, CLS, INP, TTFB, FCP**. Include values verbatim in the review summary under a **Performance** heading. Flag the following thresholds as findings (Source = `Performance`):

| Metric | Threshold | Severity |
|---|---|---|
| LCP | > 2.5s | Major |
| CLS | > 0.1 | Major |
| INP | > 200ms | Major |
| TTFB | > 800ms | Minor |
| FCP | > 1.8s | Minor |

Performance findings flow into the Step 6 findings table alongside Health/Persona/Analyze/Reimagine findings.

### Trace on failure

When a journey step fails — assertion fails, page errors, navigation timeout, broken render — capture a trace **before** closing the session:

```
agent-browser --session <session> trace save traces/<session>/<timestamp>.zip
```

Include the trace path in the failure report. Then close the session. View later with `agent-browser trace view <path>`. There is no automatic retention policy — users manage cleanup.

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
| /pricing | Hero feels generic — pure black on white, no personality | `/impeccable bolder pricing` |
| /empty-cart | Empty state shows only "No items" text | `/impeccable delight empty-cart` |

> These are recommendations only. Run any command manually if you want to apply it.
```

When the wrapper reports `suppressed > 0` in its return, append a small note below the table: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design reset-recommendations <spec>.`

## Standalone Next Actions

When invoked directly (not by a parent skill), end with:

```
### Next Actions

1. `/claude-tweaks:review {spec}` — full code review **(Recommended)**
2. `/claude-tweaks:visual-review journey:{name}` — walk a specific journey
3. `/claude-tweaks:stories` — generate QA stories from what was reviewed
4. `/claude-tweaks:capture` — save ideas surfaced during the review
```

When invoked by `/review`, omit Next Actions — the parent handles flow control and summary.

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

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /visual-review in Step 6. In full mode (code + visual), visual review runs after code review. In standalone visual/journey/discover modes, /review delegates entirely to /visual-review. |
| `/claude-tweaks:browse` | /visual-review uses /browse's conventions (session naming, screenshot path, trace path) and operation vocabulary. /browse is the conventions reference; /visual-review is the review procedure. Annotated screenshots, batch walks, vitals, and trace-on-failure all follow /browse's contract. |
| `/claude-tweaks:stories` | Provides `dev-url-detection.md` for URL resolution. /visual-review may recommend running /stories after discovering pages. |
| `/claude-tweaks:journeys` | /visual-review (journey mode) walks journeys created by /journeys. /visual-review (discover mode) creates new journey files. |
| `/claude-tweaks:test` | QA data from /test enriches the visual review (page inventories, caveats, screenshots). Trace-on-failure convention is shared with qa-agent. |
| `/claude-tweaks:flow` | /flow invokes /review in full mode, which delegates to /visual-review for the browser portion. |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup. Phase 7 delegates to /visual-review discover for brownfield journey bootstrapping. |
| `/claude-tweaks:capture` | /visual-review may recommend capturing ideas surfaced during the review. |
| `/claude-tweaks:design` | After the review report is assembled, /visual-review invokes `/claude-tweaks:design survey` with the captured screenshot paths and renders the resulting Creative Opportunities block in the report (anchor 2 of v4.5.0's creative surfacing system). The wrapper handles its own detection (non-frontend skips); the block is omitted when the wrapper returns no recommendations. |
