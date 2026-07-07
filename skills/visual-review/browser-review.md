# Browser Review Procedures

Visual inspection, interactive testing, performance vitals, and creative assessment of the running application. This file contains the detailed procedures for the visual review modes of `/claude-tweaks:visual-review`.

## Prerequisites

`agent-browser` must be installed. The daemon auto-starts on port 4848 with the first command. If `agent-browser` is unavailable, **stop** and report the missing dependency per `SKILL.md` Step 1 (Browser Prerequisites). Recovery on crash: `agent-browser doctor`.

Use the `/claude-tweaks:browse` skill's operation vocabulary and conventions for all browser operations throughout this document. Concrete commands live in `agent-browser-reference.md` in that skill's directory; `browse` is the single source of truth for the operation table.

### Session naming

Derive a kebab-case session name from the review target: `pricing-page-review`, `checkout-journey-review`, `discover-public-pages`. One session per page review or per journey walk.

### Screenshot path convention

All screenshots in this skill are annotated and written to:

```
screenshots/browse/<session>/<NN>_<description>.png
```

`<NN>` is a zero-padded sequence number per session (`01_landing`, `02_pricing`, ...). Annotated screenshots overlay numbered markers tied to the most recent `snapshot` refs — write findings using those overlay numbers, never spatial language like "the button on the right."

## Mode Resolution

| Mode | Input | What happens |
|------|-------|-------------|
| **Page mode** | URL or description | Review a single page or flow. Full creative framework applies. Vitals captured for the page. |
| **Journey mode** | `journey:{name}` | Walk a documented journey via a single `agent-browser batch` invocation. Each step is reviewed against its "should feel" / "red flags." Vitals captured per page. Overall arc assessed. |
| **Discover mode** | `discover` | Explore the running app to identify and document undocumented user journeys. Codebase scan + browser walkthrough. Vitals captured per discovered page. |

Page mode is for quick checks or pages that aren't part of a defined journey yet. Journey mode is the richer review — it has defined personas, goals, and experiential expectations at every step. Discover mode is for brownfield projects that need journey coverage bootstrapped.

### Dev URL Resolution

Run the canonical procedure in `dev-url-detection.md` in `skills/_shared/` — it probes `stories/servers.yml` (`servers.default.url`) first and falls back to detection heuristics. This eliminates the "Enter URL" prompt on subsequent runs when the dev server is running at the same address.

### Ensure the app is running

Before navigating, confirm the application is accessible. If the URL doesn't respond, call `AskUserQuestion` with `question`: `"The app doesn't seem to be running at {url}. Should I:"`, `header`: `"Dev server"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Try different URL"`, `description`: `"provide a different URL to check"`
- Option 2 — `label`: `"Wait"`, `description`: `"wait while you start the dev server"`

Do NOT attempt to start the dev server yourself — the user knows their setup best.

---

## QA Data Loading (optional enrichment)

Before starting the review steps, check whether QA data is available from a recent `/claude-tweaks:test qa` or `/claude-tweaks:test all` run. QA data enriches the structured review steps (Health Check, Analyze, Reimagine) but is not required — the full visual review works without it. Intuitive steps (First Impressions) are deliberately kept QA-free to preserve raw reactions.

> **Parallel execution:** Use parallel tool calls aggressively — all Glob and Read operations below are independent and should run concurrently.

1. **Find the latest QA run directory:** Glob for `screenshots/qa/*/report.json` and take the most recent by timestamp prefix.
2. **Read `report.json`:** Extract `page_inventories`, `caveats`, `findings`, and `stories` (for screenshot directories).
3. **Collect screenshots:** List screenshot files across story subdirectories in the QA run directory.

If no QA run directory or `report.json` exists, set `QA_DATA_AVAILABLE = false` and proceed — all QA integration points below are skipped silently.

If QA data is found, set `QA_DATA_AVAILABLE = true` and store:
- `QA_PAGE_INVENTORIES` — structured page data (element counts, forms, navigation, accessibility, layout)
- `QA_CAVEATS` — observations from PASS_WITH_CAVEATS stories
- `QA_SCREENSHOTS` — paths to pre-captured screenshots
- `QA_FINDINGS` — classified findings from failures (code-bug, stale-selector, ux-issue, flaky-env, story-bug)

---

## QA-Accelerated Mode

When `QA_DATA_AVAILABLE = true`, the visual review shifts from comprehensive inspection to **verify + discover**. QA already performed mechanical checks (element counts, accessibility attributes, layout measurements, happy-path execution). The visual review focuses on what QA cannot assess: raw human reactions, visual feel, interaction quality, and creative ideas.

Steps 1, 3, and 4 have QA-accelerated variants that are shorter. Steps 2 (First Impressions) and 5 (Reimagine) run at full depth regardless — Step 2 captures raw reactions that must be QA-free, and Step 5 is judgment-based. Step 6 (Report & Route) is unchanged.

When `QA_DATA_AVAILABLE = false`, run all steps at full depth as documented below.

---

## Step 0: Reconnaissance

Before the structured review steps, understand what the page IS to generate contextual review perspectives instead of applying generic checklists.

Read `reconnaissance.md` in this skill's directory and run the full procedure. The output is a **Review Brief** containing: page classification (6 dimensions), selected review perspectives (6-10, trigger-scored), source code analysis (when accessible), and a central question framing the core tension.

Carry the Review Brief through all subsequent steps. Each step consults the brief's **Step Enrichment Map** for perspectives that inform that step's analysis.

**Gate:** If the page is broken or blank during reconnaissance browsing, abort and proceed directly to Step 1 (Health Check) — the health check will catch and report the failure.

**In journey mode:** Pass the journey's persona and goal to the reconnaissance procedure. These override the Audience and Auth dimension inference and weight perspective selection toward journey-relevant perspectives.

**In QA-accelerated mode:** Reconnaissance runs at full depth regardless — it is lightweight and classification quality does not depend on QA data.

---

## Journey Mode

When the resolved mode is `journey:{name}`, read `journey-mode.md` in this skill's directory for the full Journey Mode procedure (load journey → batch invocation → per-step review → arc assessment → journey-mode report → journey-file updates → trace-on-failure).

---

## Discover Mode

When the resolved mode is `discover`, read `discover-mode.md` in this skill's directory for the full Discover Mode procedure (codebase scan → journey candidates → browser walkthrough → write journey files → coverage report → handoff).

---

## Page Mode

When running in page mode (URL or description, no journey), run Steps 1-6 below. This is the standard creative review flow.

Open the session, navigate to the URL, take a snapshot and an annotated screenshot, capture vitals — then proceed through the structured steps. A typical page-mode warm-up:

```
agent-browser --session <session> open <url>
agent-browser --session <session> snapshot -i -c
agent-browser --session <session> screenshot --annotate --filename screenshots/browse/<session>/01_landing.png
agent-browser --session <session> vitals
```

Or as a single batch:

```
agent-browser batch --session <session> \
  "open <url>" \
  "snapshot -i -c" \
  "screenshot --annotate --filename screenshots/browse/<session>/01_landing.png" \
  "vitals"
```

**Dispatcher column mapping (page-review use):** When assembling agent output into the Step 6 Report & Route table, map the agent's `| Severity | Path:Line | Finding | Evidence |` columns as follows: Severity = severity/impact (`critical` for broken page or failed health check, `high`/`medium` for major UX or perf issues, `low` for cosmetic, `info` for ideas), Path:Line = the page URL + overlay ref (`/pricing#[3]`, `/checkout#[7]`), Finding = the issue or idea (`Primary CTA at [3] competes visually with [5]` / `LCP 3.1s exceeds 2.5s threshold`), Evidence = the screenshot path + raw measurement (`screenshots/browse/pricing-review/02_above-fold.png; LCP 3.1s; persona: distracted mobile`). The dispatcher merges all agents' tables into the Step 6 Report & Route table, filling Source from the lens that produced each finding (Health / Performance / First Impression / Persona / Analyze / Reimagine).

> **Parallel execution (conditional):** When the review covers 3+ independent pages (different URLs with no shared state or navigation dependency), dispatch page reviews as parallel Task agents. Each agent owns its own session, runs its own batch, and returns findings in the `| Severity | Path:Line | Finding | Evidence |` format (see the output template below). The dispatcher maps these rows into the Step 6 Report & Route table using the column mapping documented immediately above. When pages share state (form submission on page A affects page B) or there are fewer than 3 pages, review sequentially.
>
> **Model tier:** Standard (Sonnet) — per-page review agents run Steps 1-5 (health, first impressions, persona walk, structured analysis, reimagine) which require integration across snapshot, screenshot, vitals, and source context. Upgrade to Capable (Opus) only when the page's "reimagine" pass is the primary deliverable and creative synthesis dominates the work.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | critical | /checkout#[7] | Submit button is disabled on valid input | screenshots/browse/checkout-review/03_form.png; INP 240ms; persona: returning user |
> | medium | /pricing#[3] | Hero feels generic — pure black on white, no brand voice | screenshots/browse/pricing-review/01_landing.png |
> | low | /dashboard#[12] | Tertiary CTA dominates visual weight over primary | screenshots/browse/dashboard-review/02_above-fold.png |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
> ```
>
> Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the table.

---

## Step 1: Health Check

> **Review Brief:** Consult the Step Enrichment Map for reconnaissance-added health signals.

Verify the page is functional before investing in a deeper review.

**Gate:** Page must be functional to proceed. If broken, capture a trace (see "Trace on failure" in Journey Mode), close the session, and report.

> When `QA_DATA_AVAILABLE = true`, use the QA-accelerated path — see `qa-accelerated.md` in this skill's directory.

### Full inspection (when QA not available):

#### Capture (already done in warm-up):
- Snapshot (accessibility tree) for interaction context
- Annotated screenshot for visual reference
- Vitals (LCP, CLS, INP, TTFB, FCP)
- Page title, visible state, immediate errors

#### Check for obvious problems:
- Console errors visible in the snapshot output
- Failed network requests visible in the snapshot output
- Blank or broken page rendering (visible in screenshot)
- Missing assets (images, fonts, styles)

If the page is broken or blank, run `trace save`, then `close`, then report immediately — no point continuing a visual review on a non-functional page.

### Vitals interpretation

Read the vitals output captured during warm-up (or per-step in journey mode). Flag findings against these thresholds — they flow into the Step 6 findings table with **Source = Performance**:

| Metric | Threshold | Severity | What to flag |
|---|---|---|---|
| LCP (Largest Contentful Paint) | > 2.5s | Major | Slow primary content render — hero image, main heading, large text block |
| CLS (Cumulative Layout Shift) | > 0.1 | Major | Layout jumping during load — unsized images, late-injected banners, font swaps |
| INP (Interaction to Next Paint) | > 200ms | Major | Sluggish interaction response — heavy event handlers, blocking JS |
| TTFB (Time to First Byte) | > 800ms | Minor | Slow server response — backend or CDN issue |
| FCP (First Contentful Paint) | > 1.8s | Minor | Slow paint of any content — render-blocking resources |

Report values verbatim under a **Performance** heading in the report (e.g., `LCP 3.1s, CLS 0.04, INP 180ms, TTFB 410ms, FCP 1.4s`). Even values within thresholds are worth recording — they become the baseline for future reviews.

---

## Step 2: First Impressions

> **Review Brief:** Apply the reconnaissance-selected perspectives mapped to Step 2. Answer the Central Question from your gut reaction.

This is the most important step. Before any structured analysis, just *look* and *react*.

### The 5-second test

Look at the annotated screenshot for 5 seconds (no scrolling or extra clicking yet). Then answer:

- **What's the first thing your eye goes to?** Is that the right thing to notice first?
- **What's the overall feeling?** Cluttered? Clean? Sparse? Overwhelming? Inviting? Cold?
- **What's confusing?** Anything that makes you pause or wonder "what does this do?"
- **What's missing?** Not bugs — expectations. What did you expect to see that isn't there?
- **If you had to describe this page in one sentence to a friend, what would you say?**

Reference annotated overlay numbers when calling out specific elements (e.g., "element [7] dominates the visual weight even though it's a tertiary action").

### Why this matters

Structured checklists catch known issue types. First impressions catch the things users *actually feel* — the vague sense that something's off, the moment of hesitation, the slight confusion. These reactions disappear once you start analyzing systematically, so capture them first.

> **Tone:** Be honest, not diplomatic. "This feels cluttered and I'm not sure where to look" is more useful than "layout could be improved." Write like you're texting a colleague, not filing a bug report.

---

## Step 3: Use It

> **Review Brief:** If reconnaissance selected personas based on page classification (e.g., Mobile Readiness selected Distracted Mobile User), prioritize those personas.

Now interact with the page — but not as a QA tester checking boxes. Use it as a *person trying to accomplish something*.

> When `QA_DATA_AVAILABLE = true`, use the QA-accelerated path — see `qa-accelerated.md` in this skill's directory.

### Full persona rotation (when QA not available):

Experience the page from at least two of these perspectives. Pick the most relevant ones:

| Persona | What they care about | What they notice |
|---------|---------------------|-----------------|
| **First-time visitor** | "What is this? What should I do?" | Missing onboarding, unclear CTAs, jargon |
| **Impatient power user** | "Let me do the thing fast" | Unnecessary steps, slow feedback, no keyboard shortcuts |
| **Distracted mobile user** | "I have 10 seconds and one thumb" | Touch targets, information density, scroll depth |
| **Error-prone user** | "I'll get this wrong" | Recovery paths, error messages, undo capability |
| **Returning user** | "Where was that thing I used before?" | Navigation consistency, state persistence, discoverability |

For each persona, actually walk through the flow. Don't just imagine it — click, type, navigate using the session's interactive ops. Note what each persona would struggle with. After each material interaction, take a fresh annotated screenshot so the report can reference the new state with overlay numbers.

### Interaction feel

Beyond "does it work," notice *how it feels*:

- **Speed** — Does the app feel snappy or sluggish? Cross-check against the captured INP metric — values > 200ms confirm a "sluggish" gut reaction.
- **Feedback** — When you click something, do you know it registered? Loading states, button state changes, progress indicators?
- **Transitions** — Are there animations? Are they smooth or janky? Too slow? Too fast? Distracting?
- **Flow** — Does one step lead naturally to the next, or do you have to figure out where to go?
- **Recovery** — You made a mistake. Now what? Is there undo? Back? Cancel? Or are you stuck?

### What to test (full inspection only)

- Exercise the primary flow (happy path)
- Try at least one edge case from each persona's perspective (empty input, very long text, rapid clicks, back button)
- Check what happens when things go wrong — error states, empty states, loading states. Capture an annotated screenshot of each notable state.
- Watch the snapshot for JavaScript errors triggered by interactions

---

## Step 4: Analyze

> **Review Brief:** Focus the structured analysis on perspectives mapped to Step 4. Source analysis signals (component count, spacing patterns, auth conditionals) provide code-grounded anchors for visual observations.

Now shift to structured inspection. This is the analytical pass — systematic where Steps 2-3 were intuitive.

> When `QA_DATA_AVAILABLE = true`, use the QA-accelerated path — see `qa-accelerated.md` in this skill's directory.

### Full structured analysis (when QA not available):

#### Layout & Visual Structure
- Is the page layout coherent and balanced?
- Are elements aligned properly?
- Is spacing consistent (margins, padding, gaps)?
- Does content hierarchy make sense (headings, sections, groupings)?
- Is the visual weight distributed intentionally (or does it feel lopsided)?

Reference annotated overlay numbers when calling out specific elements.

#### Content & Microcopy
- **Labels and headings** — Are they descriptive or generic? Would a new user understand them?
- **Button text** — Do buttons say what they'll do? ("Save changes" vs "Submit", "Delete account" vs "Delete")
- **Error messages** — Do they explain what went wrong AND how to fix it?
- **Empty states** — When there's no data, is there helpful guidance? Or just blank space?
- **Placeholder text** — Helpful examples or useless "Enter text here"?
- **Tone** — Is the voice consistent? Does it match the brand? Does it feel human?

#### Visual Polish
- Are interactive elements obviously clickable (buttons look like buttons)?
- Do hover/focus states exist and feel right?
- Are images/icons displaying at correct size and resolution?
- Is the color scheme consistent?
- Are fonts loading correctly?

#### Responsive Behavior (if applicable)
Set viewport to common breakpoints and re-capture an annotated screenshot at each:

```
agent-browser --session <session> set viewport 375 667    # Mobile
agent-browser --session <session> screenshot --annotate --filename screenshots/browse/<session>/<NN>_mobile.png
agent-browser --session <session> set viewport 768 1024   # Tablet
agent-browser --session <session> screenshot --annotate --filename screenshots/browse/<session>/<NN>_tablet.png
agent-browser --session <session> set viewport 1280 800   # Desktop
agent-browser --session <session> screenshot --annotate --filename screenshots/browse/<session>/<NN>_desktop.png
```

Check for overflow, cramped layouts, or hidden content at each size. Only test responsive if the project is expected to support it — ask if unsure.

#### Performance
- Reference vitals captured in Step 1.
- LCP > 2.5s, CLS > 0.1, INP > 200ms → flag as Major performance findings.
- TTFB > 800ms, FCP > 1.8s → flag as Minor.

#### Accessibility (quick check)
- Can you tab through interactive elements in a logical order?
- Are form inputs labeled (check the snapshot)?
- Is there sufficient color contrast?
- Do images have alt text?

> **Note:** This is a quick pass, not a WCAG compliance review. Flag obvious issues only.

---

## Step 5: Reimagine

> **Review Brief:** Perspectives mapped to Step 5 are the primary reimagine targets. The Central Question frames what "great" means for this specific page.

This is the creative step. Analysis found what's wrong. Now ask: **what would make this great?**

### The "best version" exercise

For the page or feature you reviewed, brainstorm what a truly excellent version would look like. Not just "fix the bugs" — think about what would make a user *prefer* this over alternatives.

Consider:

- **What would make someone smile using this?** Small delights — a clever interaction, a helpful shortcut, a moment of "oh that's nice." Not gratuitous animation, but genuine thoughtfulness.
- **What would a 10x simpler version look like?** If you had to cut half the UI, what would stay? That's probably what matters most — is it prominent enough?
- **What's the invisible friction?** Things users tolerate but shouldn't have to. Extra clicks, unnecessary fields, information in the wrong place, having to remember something the app should remember.
- **What would the next version add?** Not a feature wishlist — what's the one thing that would make the biggest difference to the user experience?

### "Steal like an artist"

Think about well-known products that solve similar problems. What do they do well that this could learn from? Be specific — not "be more like Notion" but "Notion's empty state has a template picker that makes blank pages feel like opportunities, not dead ends."

### Propose alternatives

For the most important finding from the reimagine exercise, sketch out 1-2 concrete alternatives:

```
Current: {what it is now} (annotated overlay [N])
Alternative A: {a different approach} — {why it might be better}
Alternative B: {another approach} — {the tradeoff}
```

These aren't prescriptions — they're conversation starters. The goal is to expand the solution space, not narrow it.

> **Constraint:** Keep this grounded. Ideas should be implementable in the current tech stack within a reasonable scope. "Rewrite in a different framework" is not helpful. "Add a skeleton loader to the list view" is.

### QA-informed reimagining (when QA_DATA_AVAILABLE)

QA findings, caveats, and the captured vitals can spark ideas that pure visual inspection might miss:

- **Accessibility caveats** reveal where the experience is broken for some users. "Missing aria-label on 3 elements" isn't just a compliance issue — it's a design opportunity. What would the experience feel like if every interaction was narrated?
- **Slow LCP or FCP** suggests a perception problem. The "best version" exercise should consider: what would users see during the wait? A skeleton loader? An instant optimistic update? A progress bar with real information?
- **High CLS** signals a stability problem. What would the page feel like if it never jumped during load?
- **Console warnings** often indicate technical shortcuts that degrade experience over time. These are signals of where the implementation diverges from the ideal.
- **Page inventories** reveal structural opportunities. A page with 8 tabs and 20+ buttons may benefit from progressive disclosure. A form with 6 fields and no labels is a redesign candidate, not just an accessibility fix.

Use QA data and vitals as creative fuel for the "best version" exercise, not as a bug list. The reimagine step asks "what would make this great?" — those signals tell you where "great" is furthest from the current state.

---

## Step 6: Report & Route

Present findings from the review in a single structure that serves as both the report and the routing table.

### Header

```markdown
## Visual Review: {page/feature description}

**URL:** {url}
**Session:** {session name}
**Classification:** {Type} | {Auth} | {Stage} | {Data} | {Complexity} | {Audience}
**Central Question:** {The central question from the Review Brief}
**Health:** {functional / N console errors / N failed requests / broken}
**Performance:** LCP {value} | CLS {value} | INP {value} | TTFB {value} | FCP {value}
**First Impression:** {The honest 5-second reaction in 1-2 sentences. Keep the raw tone.}
**Interaction Feel:** Speed: {snappy/acceptable/sluggish} | Feedback: {clear/inconsistent/missing} | Transitions: {smooth/janky/none}
**Screenshots:** {paths under screenshots/browse/<session>/}
**Trace (if failure):** {path under traces/<session>/ — omit if no failure}
**QA context:** {QA run dir, stories covering this page, QA status — or "No QA data"}
```

**Strengths** (before the findings table): When something is genuinely good, note it in one sentence: "Strengths: {1-2 specific things that work well and should be preserved}." Do not create a separate section — this anchors what to protect while fixing issues.

### Findings & Ideas

Present all findings and ideas in a single batch table. Findings reference annotated overlay numbers from the screenshots:

```
| # | Finding | Type | Source | Severity/Impact | Recommended |
|---|---------|------|--------|-----------------|-------------|
| 1 | {description with overlay refs e.g. "element [3] competes with [5]"} | Issue | Health | Critical | Fix now |
| 2 | LCP 3.1s exceeds 2.5s threshold | Issue | Performance | Major | Fix now |
| 3 | CLS 0.18 — hero image lacks dimensions | Issue | Performance | Major | Fix now |
| 4 | {description} | Issue | Analyze | Minor | Fix now |
| 5 | {description} | Issue | Persona | Cosmetic | Fix now |
| 6 | {description} | Idea | Reimagine | High | Fix now — add to current spec |
| 7 | {description} | Idea | Reimagine | Medium | Defer — not relevant now |
| 8 | {description} | Idea | Reimagine | Low | Capture to INBOX — needs brainstorming |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"tell me which #s to change"`

The **Source** column traces each finding to its origin step (Health, Performance, First Impression, Persona, Analyze, Reimagine). This replaces the separate "Functional Issues," "Visual & Content Issues," and "UX Observations" report sections.

**Recommendation rules for Issues:**
- **All severities** — default "Fix now." Close the gap now.
- **Defer** (DEFERRED.md) — the fix is understood but bigger and not relevant to the current work. Include origin, affected files, trigger.
- **Capture to INBOX** — the issue is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **"Accept as-is"** — only for intentional design choices. If it's a genuine defect, fix it or route it.

**Recommendation rules for Ideas:**
- **Fix now** — the strong default. If the idea can be implemented in the current session, do it. Add to the current spec scope if applicable.
- **Defer** (DEFERRED.md) — the idea is clear but bigger and not relevant to the current work.
- **Capture to INBOX** — the idea is complex or uncertain and needs brainstorming/exploration before it can be acted on.

> **Routing bias:** Fix it now — always the recommended default. Defer when the fix is bigger and not relevant now. Capture to INBOX when the issue/idea needs exploration. Cosmetic issues accumulate into a feeling of low quality — fix them while they're fresh.

Group related cosmetic issues into a single row rather than listing each individually. Every idea goes to a durable destination. "Note for later" without a destination means "lose forever."

### Verdict

After the findings table:
- **CLEAN** — No significant issues. Ideas are enhancements, not fixes.
- **ISSUES FOUND** — {count} issues need attention.
- **BROKEN** — Page is non-functional. (Trace path attached above.)

### Creative Opportunities (survey integration)

After the verdict, the parent `SKILL.md` Step 4 invokes `/claude-tweaks:design survey` with the captured screenshot paths and renders a Creative Opportunities block from the wrapper's recommendations. The block is appended verbatim to this report — it lives below the verdict and above Next Actions.

The survey block is a separate concern from the findings table: the findings table catalogs issues and idea routing; the Creative Opportunities block surfaces ranked Impeccable command suggestions (`bolder` / `delight` / `animate` / `colorize` / `extract` / `onboard` / `quieter` / `distill` / `overdrive`). Recommendations are never auto-applied — the user runs any command manually if it resonates.

When the survey wrapper returns no recommendations or a skip (non-frontend, Impeccable not installed, integration disabled), omit the block entirely. Do not surface "no creative opportunities found" as a positive signal — survey is heuristic and an empty result means "nothing matched the criteria," not "design is complete."

See `SKILL.md` Step 4 for the exact template, return-shape handling, and the suppression-note convention when the wrapper reports `suppressed > 0`.

### Next Actions

This mode-specific table supplements the canonical handoff in SKILL.md `## Next Actions` — "supplements" here means *substitutes when more specific*, not *merges option sets*. This section is its own independent `AskUserQuestion` call, resolved dynamically from the signal table below exactly as `design/SKILL.md`'s Return-shape table resolves — render it (with its own options, including `/claude-tweaks:wrap-up {N}`, which is not one of SKILL.md's 4 static options) when the review-source signals (full review mode, missing code review, "fix now" items, standalone) usefully refine the standalone block. It renders *instead of* SKILL.md's canonical Next Actions call, never alongside or merged with it. When in doubt, defer to SKILL.md `## Next Actions`.

The signal-to-option lookup table below stays as-is — the assistant's own logic for picking which options apply this run, never itself shown to the user or converted into an `AskUserQuestion` option:

| Signal | Option |
|--------|--------|
| Coming from full review mode | `/claude-tweaks:wrap-up {N}` — capture learnings and clean up |
| Not yet code-reviewed | `/claude-tweaks:review {N}` — run code review before wrapping up |
| "Fix now" items exist | Address fixes first, then re-run this review |
| Standalone | `/claude-tweaks:capture` — save ideas surfaced during the session |

Once the signals are resolved, call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 (when coming from full review mode) — `label`: `"Wrap up (Recommended)"`, `description`: `"/claude-tweaks:wrap-up {N} — capture learnings and clean up"`
- Option 2 (when not yet code-reviewed) — `label`: `"Code review"`, `description`: `"/claude-tweaks:review {N} — run code review before wrapping up"`
- Option 3 (when "fix now" items exist) — `label`: `"Fix first"`, `description`: `"Address fixes first, then re-run this review"`
- Option 4 (standalone) — `label`: `"Capture ideas"`, `description`: `"/claude-tweaks:capture — save ideas surfaced during the session"`

---

## Important Notes

- This review requires `agent-browser` — install with `npm install -g agent-browser` if missing
- Snapshots are ephemeral; annotated screenshots and traces are persistent — findings reference overlay numbers and screenshot/trace paths
- Every reviewed page produces vitals — Web Vitals are a first-class finding category, never skip the `vitals` op
- Always use annotated screenshots — bare screenshots lose the overlay numbering that makes findings precise
- Journey walks use a single `batch` invocation per session lifecycle slice — never spread a journey across many one-off invocations
- When a step fails, `trace save` first, then `close` — failure reports without a trace path are not actionable
- The review is scoped to the current work — don't review the entire application (except in journey mode, where the full journey is in scope, and discover mode, which scans the whole app)
- Journey mode auto-detects when invoked with no arguments by checking `docs/journeys/` against recent changes
- Journey files are living documents — update them when visual review reveals gaps or inaccuracies
- Console errors and network failures are often the fastest signal — check them in the snapshot output during health check
- Resize testing is optional and should be skipped unless layout changes are in scope; use `set viewport` rather than env vars
- The step order matters: reconnaissance → reaction → experience → analysis → imagination. Don't rearrange.
- Reconnaissance (Step 0) is a fast pre-step — it classifies and moves on. The review steps are where depth happens. If reconnaissance takes more than 60 seconds, something is wrong.
