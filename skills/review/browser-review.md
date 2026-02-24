# Browser Review Procedures

Visual inspection, interactive testing, and creative assessment of the running application. This file contains the detailed procedures for the visual review modes of `/claude-tweaks:review`.

## Prerequisites

A browser backend must be available. Run the backend detection and resolution from the `/claude-tweaks:browse` skill (Backend Detection and Backend Resolution sections). If resolution fails, **stop** and report the error message from the browse skill's resolution table.

Use the `/claude-tweaks:browse` skill's operation mapping table for all browser operations throughout this document. The browse skill is the single source of truth for all backend detection, resolution, and command mappings.

## Mode Resolution

| Mode | Input | What happens |
|------|-------|-------------|
| **Journey mode** | `journey:{name}` | Walk a documented journey step by step. Each step is reviewed against its "should feel" / "red flags." The overall arc is assessed for coherence. |
| **Page mode** | URL or description | Review a single page or flow. The full creative framework applies but without journey-level expectations to test against. |
| **Discover mode** | `discover` | Explore the running app to identify and document user journeys that don't have journey files yet. Hybrid: codebase scan for routes/pages, then browser walkthrough to create journey files. |

Journey mode is the richer review — it has defined personas, goals, and experiential expectations at every step. Page mode is useful for quick checks or pages that aren't part of a defined journey yet. Discover mode is for brownfield projects that need journey coverage bootstrapped.

### Ensure the app is running

Before navigating, confirm the application is accessible. If the URL doesn't respond, ask the user:
```
The app doesn't seem to be running at {url}. Should I:
1. Try a different URL
2. Wait while you start the dev server
```

Do NOT attempt to start the dev server yourself — the user knows their setup best.

---

## Journey Mode

When running in journey mode, the skill walks the full journey and applies the creative framework at each step, then assesses the overall arc.

### Load the journey

Read `docs/journeys/{name}.md`. Extract:
- **Persona** — this becomes the primary persona for the entire review (additional personas from Step 3 can supplement)
- **Goal** — this is what "success" looks like
- **Entry point** — this is where the review starts
- **Success state** — this is how you know the journey worked
- **Steps** — each step has a URL, action, "should feel", "should understand", and "red flags"

### Walk each step

For each step in the journey:

1. **Navigate** to the step's URL
2. **Health check** — console errors, failed requests, broken rendering (same as Step 1 below)
3. **First impression** — apply the 5-second test from Step 2, but *calibrated against the journey's expectations*. The journey says this step "should feel like low commitment." Does it?
4. **Use it as the persona** — don't rotate through multiple personas. Use the journey's defined persona. Perform the documented action. Notice what the persona would notice.
5. **Test "should feel"** — this is the key test. Does the step deliver the emotional/experiential quality the journey defines? Be honest and specific about gaps.
6. **Check "red flags"** — does the step exhibit any of the journey's documented red flags?
7. **Assess the transition** — after completing this step, does the next step feel like a natural continuation? Or is there a jarring context switch, a confusing redirect, or a loss of momentum?

### Assess the overall arc

After walking all steps, step back and evaluate the journey as a whole:

- **Momentum** — does the journey build toward the goal, or does it stall somewhere?
- **Coherence** — does it feel like one experience, or stitched-together features?
- **Payoff** — does the success state deliver on the promise of the entry point? Is the "aha moment" actually there?
- **Length** — too many steps? Too few? Are there steps that could be eliminated or combined?
- **Drop-off risk** — where in the journey would a user most likely give up? Why?

### Journey mode report

The report follows the same structure as the standard report (Step 6 below) but adds journey-specific sections:

```markdown
### Journey Assessment: {journey name}
**Persona:** {persona}
**Goal:** {goal}

| Step | Should Feel | Actually Feels | Verdict |
|------|------------|----------------|---------|
| {step name} | {from journey file} | {honest assessment} | {pass/gap/fail} |

### Journey Arc
- Momentum: {builds well / stalls at step N / loses steam}
- Coherence: {feels unified / disjointed between steps N and M}
- Payoff: {delivers / underwhelming / missing}
- Drop-off risk: {step N — because {reason}}

### Journey-Level Ideas
- {ideas that span multiple steps or address the arc, not just individual pages}
```

After the journey report, proceed to Step 7 (Route Findings) as normal.

### Update the journey file

If the browser review revealed that "should feel" descriptions are inaccurate, red flags are missing, or steps need reordering, **update the journey file**. The journey is a living document — each browser review refines it.

---

## Discover Mode

When running in discover mode, the goal is to identify all user and developer journeys in an existing application and create journey files for them. This is the brownfield bootstrapping mode — used when a project has features but no documented journeys.

### Phase 1: Codebase Scan

Scan the codebase to build a map of what exists before opening the browser.

> **Parallel execution:** Use parallel tool calls aggressively — all glob/grep operations across the four scan categories below are independent and should run concurrently. Front-load all codebase reads before browser interaction.

**Routes and pages:**
- Search for route definitions (React Router, Next.js pages/app directory, Express routes, Rails routes, etc.)
- Search for navigation components (navbars, sidebars, menus) to understand the information architecture
- Search for page/view components or templates

**Entry points:**
- Public pages (landing, login, signup, pricing)
- Authenticated pages (dashboard, settings, profile)
- Admin/internal pages
- API documentation pages
- Developer-facing entry points (CLI commands, setup scripts, config files)

**User-facing features:**
- Forms (signup, settings, create/edit flows)
- CRUD operations (lists, detail views, create, edit, delete)
- Workflows (multi-step processes, wizards, checkout flows)
- Search, filtering, sorting interfaces

**Personas (infer from the codebase):**
- Are there user roles? (admin, user, guest, developer)
- Is there an onboarding flow? (implies first-time user persona)
- Is there a public-facing site vs. authenticated app? (implies visitor vs. user)
- Is there API documentation or a developer portal? (implies developer persona)

### Phase 2: Journey Candidates

From the codebase scan, compile a list of candidate journeys. Each candidate is a hypothesis: "a {persona} probably does {goal} by going through {these pages}."

Present the candidates as numbered options:

```
Found {N} potential user journeys in the codebase:

1. New user signup → onboarding → first project
   Persona: First-time visitor
   Pages: /, /signup, /onboarding, /projects/new

2. Returning user creates a {thing}
   Persona: Authenticated user
   Pages: /dashboard, /{things}/new, /{things}/{id}

3. Admin manages users
   Persona: Admin
   Pages: /admin, /admin/users, /admin/users/{id}

4. Developer sets up local environment
   Persona: New developer
   Entry: README.md → install → config → first run

...

Proceeding to walk all {N} journeys in the browser. Say "skip {numbers}" to exclude any.
```

Include developer journeys when the project has CLI tools, APIs, or developer-facing setup.

### Phase 3: Browser Walkthrough

> **Parallel execution (conditional):** When multiple candidate journeys share no pages, walk them in parallel using separate browser tabs — each journey runs independently. Journeys that share pages must remain sequential to avoid state interference (e.g., login state, form data). A single journey's steps are always sequential.

For each approved candidate, open the browser and walk the journey. This is where the codebase skeleton gets filled with experiential details.

For each step in the candidate journey:

1. **Navigate** to the page
2. **Apply the First Impressions test** (Step 2 below) — capture the raw "should feel" for this step
3. **Interact as the persona** — perform the action, note friction, note delight
4. **Discover adjacent steps** — the codebase scan may have missed steps. If a page leads naturally to another page not in the candidate, add it.
5. **Write the "should feel" and "red flags"** — these come from actually experiencing the page, not guessing from code

### Phase 4: Write Journey Files

For each walked journey, create a file at `docs/journeys/{journey-name}.md` using the standard journey format (see `/build` Common Step 5 for the template).

Key differences from build-created journeys:
- **Origin section** says "Created during journey discovery (brownfield)" instead of referencing a spec
- **"Should feel" comes from actual browser experience**, not from spec intentions
- **Steps may reference features built across many past commits** — no single spec to reference

### Phase 5: Coverage Report

After creating all journey files, present a coverage report:

```markdown
## Journey Discovery Report

### Journeys Created
| Journey | Persona | Steps | Coverage |
|---------|---------|-------|----------|
| {name} | {persona} | {count} | {which pages/features are covered} |

### Pages Not Covered by Any Journey
| Page/Route | Reason |
|-----------|--------|
| {route} | {no clear user goal identified / admin-only / deprecated / utility page} |

### Gaps Identified
| Gap | Description |
|-----|-------------|
| {what's missing} | {e.g., "no error recovery journey", "no mobile journey", "no developer onboarding journey"} |
```

Present uncovered pages and gaps as a batch:

```
| # | Gap | Recommended |
|---|-----|-------------|
| 1 | {page/route} | Not a journey — utility page |
| 2 | {missing flow} | Capture to INBOX |
| 3 | {page/route} | Create a journey — needs exploration |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

### Phase 6: Handoff

Commit journey files with message: "Add {N} user journeys from discovery (brownfield)"

**Recommended next:** `/claude-tweaks:review journey:{name}` — test a specific journey against its expectations.

---

## Page Mode

When running in page mode (URL or description, no journey), run Steps 1-7 as documented below. This is the standard creative review flow.

---

## Step 1: Health Check

Navigate to the target URL and verify the page is functional before investing in a deeper review.

### Capture:
- Take a browser snapshot (accessibility tree) for interaction context
- Take a screenshot for visual reference
- Note the page title, visible state, and any immediate errors

### Check for obvious problems:
- Console errors (Playwright: `playwright-cli -s=<session> console` / Chrome: `mcp__claude_in_chrome__read_console_messages(tabId)`)
- Failed network requests (Playwright: `playwright-cli -s=<session> network` / Chrome: `mcp__claude_in_chrome__read_network_requests(tabId)`)
- Blank or broken page rendering
- Missing assets (images, fonts, styles)

If the page is broken or blank, report immediately — no point continuing a visual review on a non-functional page.

**Gate:** Page must be functional to proceed. If broken, stop and report.

---

## Step 2: First Impressions

This is the most important step. Before any structured analysis, just *look* and *react*.

### The 5-second test

Look at the page for 5 seconds (one snapshot, no scrolling or clicking yet). Then answer:

- **What's the first thing your eye goes to?** Is that the right thing to notice first?
- **What's the overall feeling?** Cluttered? Clean? Sparse? Overwhelming? Inviting? Cold?
- **What's confusing?** Anything that makes you pause or wonder "what does this do?"
- **What's missing?** Not bugs — expectations. What did you expect to see that isn't there?
- **If you had to describe this page in one sentence to a friend, what would you say?**

### Why this matters

Structured checklists catch known issue types. First impressions catch the things users *actually feel* — the vague sense that something's off, the moment of hesitation, the slight confusion. These reactions disappear once you start analyzing systematically, so capture them first.

> **Tone:** Be honest, not diplomatic. "This feels cluttered and I'm not sure where to look" is more useful than "layout could be improved." Write like you're texting a colleague, not filing a bug report.

---

## Step 3: Use It

Now interact with the page — but not as a QA tester checking boxes. Use it as a *person trying to accomplish something*.

### Persona rotation

Experience the page from at least two of these perspectives. Pick the most relevant ones:

| Persona | What they care about | What they notice |
|---------|---------------------|-----------------|
| **First-time visitor** | "What is this? What should I do?" | Missing onboarding, unclear CTAs, jargon |
| **Impatient power user** | "Let me do the thing fast" | Unnecessary steps, slow feedback, no keyboard shortcuts |
| **Distracted mobile user** | "I have 10 seconds and one thumb" | Touch targets, information density, scroll depth |
| **Error-prone user** | "I'll get this wrong" | Recovery paths, error messages, undo capability |
| **Returning user** | "Where was that thing I used before?" | Navigation consistency, state persistence, discoverability |

For each persona, actually walk through the flow. Don't just imagine it — click, type, navigate. Note what each persona would struggle with.

### Interaction feel

Beyond "does it work," notice *how it feels*:

- **Speed** — Does the app feel snappy or sluggish? Do actions respond immediately or is there a delay?
- **Feedback** — When you click something, do you know it registered? Loading states, button state changes, progress indicators?
- **Transitions** — Are there animations? Are they smooth or janky? Too slow? Too fast? Distracting?
- **Flow** — Does one step lead naturally to the next, or do you have to figure out where to go?
- **Recovery** — You made a mistake. Now what? Is there undo? Back? Cancel? Or are you stuck?

### What to test

- Exercise the primary flow (happy path)
- Try at least one edge case from each persona's perspective (empty input, very long text, rapid clicks, back button)
- Check what happens when things go wrong — error states, empty states, loading states
- Check console for JavaScript errors triggered by interactions

---

## Step 4: Analyze

Now shift to structured inspection. This is the analytical pass — systematic where Steps 2-3 were intuitive.

### Layout & Visual Structure
- Is the page layout coherent and balanced?
- Are elements aligned properly?
- Is spacing consistent (margins, padding, gaps)?
- Does content hierarchy make sense (headings, sections, groupings)?
- Is the visual weight distributed intentionally (or does it feel lopsided)?

### Content & Microcopy
- **Labels and headings** — Are they descriptive or generic? Would a new user understand them?
- **Button text** — Do buttons say what they'll do? ("Save changes" vs "Submit", "Delete account" vs "Delete")
- **Error messages** — Do they explain what went wrong AND how to fix it?
- **Empty states** — When there's no data, is there helpful guidance? Or just blank space?
- **Placeholder text** — Helpful examples or useless "Enter text here"?
- **Tone** — Is the voice consistent? Does it match the brand? Does it feel human?

### Visual Polish
- Are interactive elements obviously clickable (buttons look like buttons)?
- Do hover/focus states exist and feel right?
- Are images/icons displaying at correct size and resolution?
- Is the color scheme consistent?
- Are fonts loading correctly?

### Responsive Behavior (if applicable)
- Resize the browser (Playwright: `playwright-cli -s=<session> resize <w> <h>` / Chrome: resize browser window) to common breakpoints:
  - Mobile: 375x667
  - Tablet: 768x1024
  - Desktop: 1280x800
- Check for overflow, cramped layouts, or hidden content at each size
- Only test responsive if the project is expected to support it — ask if unsure

### Accessibility (quick check)
- Can you tab through interactive elements in a logical order?
- Are form inputs labeled (check the accessibility snapshot)?
- Is there sufficient color contrast?
- Do images have alt text?

> **Note:** This is a quick pass, not a WCAG compliance review. Flag obvious issues only.

---

## Step 5: Reimagine

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
Current: {what it is now}
Alternative A: {a different approach} — {why it might be better}
Alternative B: {another approach} — {the tradeoff}
```

These aren't prescriptions — they're conversation starters. The goal is to expand the solution space, not narrow it.

> **Constraint:** Keep this grounded. Ideas should be implementable in the current tech stack within a reasonable scope. "Rewrite in a different framework" is not helpful. "Add a skeleton loader to the list view" is.

---

## Step 6: Report

Present a structured report that balances issues, observations, and ideas.

```markdown
## Visual Review: {page/feature description}

**URL:** {url}
**Browser:** {playwright-cli|Chrome MCP}

### Page Health
- Console errors: {count or "none"}
- Failed requests: {count or "none"}
- Page load: {fast/slow/broken}

### First Impressions
{The honest, unfiltered 5-second reaction from Step 2. Keep the raw tone — don't polish it into corporate feedback.}

### What's Working Well
{Specific things that are genuinely good. Not filler — real strengths that should be preserved and built on. Understanding what works is as important as finding what doesn't.}

### Functional Issues
| Issue | Severity | Description |
|-------|----------|-------------|
| {what's broken} | {critical/major/minor} | {what happened, what was expected} |
(or: No functional issues found.)

### Visual & Content Issues
| Issue | Severity | Description |
|-------|----------|-------------|
| {what looks or reads wrong} | {major/minor/cosmetic} | {what it is, what it should be} |
(or: No visual or content issues.)

### UX Observations
| Observation | Persona | Description |
|-------------|---------|-------------|
| {what was noticed} | {which persona surfaced it} | {details and why it matters} |
(or: No UX concerns — flow feels smooth for all personas tested.)

### Interaction Feel
- Speed: {snappy/acceptable/sluggish}
- Feedback: {clear/inconsistent/missing}
- Transitions: {smooth/janky/none}
- Recovery: {easy/possible/difficult}

### Ideas
| Idea | Impact | Effort | Description |
|------|--------|--------|-------------|
| {what could be better} | {high/medium/low} | {small/medium/large} | {the vision — what it would feel like, not just what to change} |

### Verdict
**{CLEAN}** — No significant issues. Ideas are enhancements, not fixes.
**{ISSUES FOUND}** — {count} issues need attention. Ideas included for when they're resolved.
**{BROKEN}** — Page is non-functional, needs fixing before anything else.
```

---

## Step 7: Route Findings

Present all findings — issues and ideas — in a single batch table with a Type column to distinguish them.

```
| # | Finding | Type | Severity/Impact | Recommended |
|---|---------|------|-----------------|-------------|
| 1 | {description} | Issue | Critical | Fix now |
| 2 | {description} | Issue | Minor | Fix now |
| 3 | {description} | Issue | Cosmetic | Fix now |
| 4 | {description} | Idea | High | Fix now — add to current spec |
| 5 | {description} | Idea | Medium | Defer — not relevant now |
| 6 | {description} | Idea | Low | Capture to INBOX — needs brainstorming |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

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

### Recommended next

**Recommended next** (adjust based on context):
- Coming from full review mode → `/claude-tweaks:wrap-up {number}`
- Not yet code-reviewed → `/claude-tweaks:review {number}`
- "Fix now" items exist → address fixes first, then re-run this review
- Standalone → `/claude-tweaks:capture` for ideas surfaced during the session

---

## Important Notes

- This review requires browser integration — playwright-cli or Chrome MCP must be configured
- Screenshots and snapshots are ephemeral — findings should be captured in the report, not as file references
- The review is scoped to the current work — don't review the entire application (except in journey mode, where the full journey is in scope, and discover mode, which scans the whole app)
- Journey mode auto-detects when invoked with no arguments by checking `docs/journeys/` against recent changes
- Journey files are living documents — update them when visual review reveals gaps or inaccuracies
- Console errors and network failures are often the fastest signal — check them first in the health check
- Resize testing is optional and should be skipped unless layout changes are in scope
- The step order matters: reaction → experience → analysis → imagination. Don't rearrange.
