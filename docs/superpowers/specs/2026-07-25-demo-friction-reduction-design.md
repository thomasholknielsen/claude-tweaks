# /demo — Single-Item Scope + Pre-Flight Self-Verification — Design

**Goal:** Close two compounding friction sources observed in a real `/demo` session: (1) the
skill handed a human untested manual verification steps and let *them* discover a port
collision, a hardcoded-port auth bug, and a hydration failure one round-trip at a time, instead
of Claude verifying reachability/render itself first; and (2) the skill's own cross-record sweep
and batch-decision flow got derailed by a declined `AskUserQuestion` and never recovered, while
the conversation organically grew an entire unrelated feature with no checkpoint flagging the
scope had shifted from *verify* to *build*.

**Architecture:** Six changes, all to skill prose (`/demo` has no backing code):

1. `/demo` Step 3 gains a pre-flight self-check (resolve a working dev server, confirm the page
   actually renders and — when credentials are available — that login works) before ever handing
   a human a live-browser walkthrough or manual instructions.
2. Manual instructions, when generated, follow a fixed quality contract (self-contained `cd`, no
   inline comments in copyable blocks, verified-not-guessed values, proactive explanation of
   surprising-but-correct state).
3. A one-per-session scope-fork checkpoint fires the first time a `/demo` conversation crosses
   from confirming existing behavior into requesting new behavior.
4. Task-anchor discipline: any pending verdict must be explicitly restated before the
   conversation moves to an unrelated topic, never silently dropped.
5. `/demo` stops sweeping the `demo:pending` backlog. It operates on one item per invocation —
   this session's own recall-detected work (no argument) or one explicit `#N` — full stop.
6. `/help` becomes the sole discovery surface for the acceptance queue: Stage 4.7 lists
   outstanding `#N`s instead of a bare count.

## Motivation

Concrete trigger: a `/demo` session on 5 just-merged records (Azure Cost Overview,
`#1123`-`#1127`). None carried `demo:pending` (the build ran through `/flow` without ever
reaching `/wrap-up`'s Step 10), so `/demo` fell back to session-recall for all 5 and presented a
5-row batch table. The user declined the "how do you want to work through these?" question; the
conversation never returned to it. Asked in plain text for instructions to check `#1127`
manually — this bypassed `/demo`'s only live-verification mechanism (the "Show me live" option,
which drives `agent-browser` itself) entirely. What followed: four rounds of the user
copy-pasting hand-authored instructions and reporting back what broke (missing `cd`, unwanted
inline comments, no port-fallback awareness, no explanation of the empty-state), a legitimate
follow-on feature request (compare all 4 environments on one chart) built entirely inside the
`/demo` session with no checkpoint, and a ~40-minute live debugging spree (an orphaned process
squatting a hardcoded port, a `NEXTAUTH_URL` bug, a hydration failure) conducted by handing the
human diagnostic legwork one command at a time instead of Claude verifying the environment
itself. The session ended with new feature work committed and the original 5 records still
unresolved.

Two root causes, not one: (a) `/demo` never verifies its own "here's how to see it" output before
handing it to a human — `dev-url-detection.md` already solves the exact port-collision problem
that consumed most of the debugging time (worktree-aware detection, auto-starts an ephemeral
server on a free port), but nothing in `/demo`'s manual-instructions path invokes it; (b) `/demo`'s
cross-record sweep (Step 1 Source A + Step 2's batch table) adds a whole layer of aggregation
machinery whose failure mode (a declined bulk question) has no recovery, and which — per the
`/triage`-vs-`/review-backlog` discussion this design grew out of — belongs to a different
responsibility (backlog *discovery*) than the one `/demo` should own (single-item *verdict*).

## Non-Goals

- **Not adding local-verification runbook persistence.** A durable, project-level "how to run
  this locally" doc that accumulates env gotchas across sessions was considered and explicitly
  deferred — bigger scope (new doc convention, registry integration, staleness handling) than
  this design's trigger justifies. The pre-flight self-check (Section 1) already eliminates most
  of the cost this would have amortized, since Claude verifies reachability itself instead of
  rediscovering it via human trial-and-error each time.
- **Not fixing `/flow`'s failure to invoke `/wrap-up`'s Step 10.** Whether `/flow` should always
  reach `/wrap-up` so `demo:pending` + a Verification Brief always exist is a real, separate
  question this design does not answer. Section 5's `#N` fallback (recall-compose a brief for an
  explicitly-named record with no label, when this session has memory of it) works around the
  symptom for the in-session case without touching `/flow` or `/wrap-up`.
- **Not widening `/triage` or `/review-backlog` to cover the acceptance queue**, and not merging
  them with each other. Considered and rejected: the work-record taxonomy's permission matrix
  (`_shared/work-record.md`) maps one skill per axis with an explicit "Never" column per skill —
  `/triage` owns the Authorization axis (a live autonomous-execution grant), `/review-backlog`
  owns `priority:*` (informational, not even one of the seven core axes), `/demo` owns Acceptance
  (a retrospective human verdict on already-shipped work). Three different consequence models;
  collapsing any two erodes the safety boundary the "Never" column exists to provide. The surface
  similarity (all three are human-facing batch/backlog UX) is a UI similarity, not an axis one —
  this system already treats axis, not UI shape, as the thing that defines a skill boundary.
- **Not making `/demo` fix application bugs it discovers.** The pre-flight self-check (Section 1)
  only ever gets the *environment* into a checkable state (server up, on a free port) — that's
  infrastructure `dev-url-detection.md` already owns. A genuine product defect the check
  encounters (broken login, a hydration failure, a chart not rendering) is evidence for a
  **Request changes** verdict, never something `/demo` silently patches. Keeping `/demo` at
  "never edits code" is unchanged from today.
- **Not adding multi-`#N` invocation grammar** (e.g. `/demo #1123 #1124`). Reviewing several
  specific records is `/demo #N`, invoked once per record — consistent with `/help`'s new role
  (Section 6) as the place that lists which `#N`s exist to review.

## Architecture

### 1. Pre-flight self-verification (extends Step 3)

Step 3's existing "Show me live" option — offered only when the brief's entry point resolved, and
only for testable records (`verification-brief.md`'s own Step 2 testability determination,
reused unchanged, not `/demo`'s Step 2, which Section 5 removes entirely) — is renamed **"See it
yourself"** and gains a pre-flight before it does anything else, whether reached via the
structured `AskUserQuestion` answer or an equivalent freeform request in conversation:

1. Resolve a working dev server via the existing `dev-url-detection.md` procedure — already
   project-agnostic (port probing, `CLAUDE.md`/`package.json` command detection, worktree
   awareness) and already auto-starts an ephemeral server on a free port when nothing is
   running. This alone removes the port-collision failure class; the check never assumes a fixed
   port.
2. Open a quick `agent-browser` session at the resolved entry point (reusing `/browse`'s
   conventions, the same relationship this option already has with `/browse`) and confirm the
   target page actually renders — not just an HTTP 200. If the page requires auth and
   credentials are already resolvable (Auth Vault / `stories/auth.yml`, the same source `/stories`
   uses), attempt login too. No configured credentials → skip the login check, still valuable to
   confirm reachability/render on their own.
3. Close the session.

Runs once per record per `/demo` session (on first selection of "See it yourself") and is reused
for the rest of that record's Step 3 walkthrough.

**On success:** `/demo` asks one short follow-up — 2 options, well inside `AskUserQuestion`'s
2-4 cap — "Open a live session and show you, or give you the steps to check it yourself?" Picking
live reuses the already-open, already-verified session from the pre-flight; picking "give me the
steps" hands off manual instructions per Section 2, built from the *actual verified*
URL/port/credentials, never a guessed default.

**On failure:** not a side quest to chase mid-conversation, and the live-vs-manual follow-up
question above never gets asked — a broken environment is broken either way. Capture the
evidence (screenshot, console error) and surface it as part of this record's walkthrough with
**Request changes** as the natural next step — the same shape as any other defect `/demo` already
knows how to handle. `/demo` does not debug application code itself (see Non-Goals).

**Browser tools unavailable:** same fallback `verification-brief.md` already documents for this
case — skip without blocking, note visual verification wasn't available in this environment.

### 2. Manual-instructions quality contract

Step 3's primary question keeps exactly the same 4 options it has today — Approve / **See it
yourself** (renamed, Section 1) / Request changes / Skip for now — no 5th option added (the
`AskUserQuestion` tool caps at 4). The "give me the steps" choice from Section 1's follow-up
question formalizes what the transcript's freeform "give me instructions" request actually
wanted. Instructions generated for it (after Section 1's pre-flight has already passed) follow a
fixed checklist rather than ad hoc prose refined over several correction rounds:

- **Self-contained** — every command block includes its own `cd` to the right checkout/worktree;
  never assumes an inherited working directory.
- **Copy-paste-clean** — no inline commentary inside a block meant to be pasted as-is;
  explanation goes in prose before/after the block, never inside it.
- **Verified values only** — URL/port/command come from Section 1's pre-flight, which actually
  confirmed they work. Never a guessed default.
- **Proactively explain surprising-but-correct state** the pre-flight itself observed while
  rendering (e.g. an empty dashboard on first load) — inline, before the human has to ask.

Formatting/content contract only — no project-specific commands or fixes get written into the
skill itself; the command text still comes from whatever `dev-url-detection.md` resolved for
that project.

### 3. Scope-fork checkpoint

When a `/demo` conversation crosses from confirming already-built behavior into requesting new
behavior (a feature addition, an infrastructure change beyond what's needed to make the
environment checkable), `/demo` stops once — the first time this is detected in a given
session — rather than silently absorbing it:

> "That's new scope beyond what's being demoed here. Want me to capture it as a backlog item now
> and come back to your sign-off decision, or build it now as its own thing outside `/demo`?"

Reuses Step 4's existing "Request changes → file a linked follow-up record" machinery (same
`recordPayload`/`createRecord` composition, same `Origin:` provenance convention) rather than a
new filing mechanism. Fires once per session: if the human says "keep going," don't re-ask for
further closely-related work in the same thread.

### 4. Task-anchor discipline

A pending verdict — the current record's Step 3 decision, not yet Approved/Request-changes/
Skipped — must never be silently dropped because the conversation moves on, whether from a
declined `AskUserQuestion`, a scope-fork detour (Section 3), or a pre-flight failure (Section 1)
that grows its own back-and-forth. Once any such detour concludes, before shifting to a new
unrelated topic, `/demo` restates what's still outstanding for this record and offers to resume.
A `/demo` run must not end with an un-acted-on record silently left mid-decision.

### 5. Narrow `/demo` to single-item scope

Step 1's "Source A" stops being a sweep:

- **`/demo` with no arguments** → session-recall only (existing Source B, unchanged in
  mechanism): recap whatever distinct units of work this conversation actually did with no
  backing record. Almost always one item; the existing "skip straight to Step 3 when there's
  exactly one session-recall entry" rule now covers the overwhelming majority of invocations —
  no batch table, no bulk-decision question.
- **`/demo #N`** → a single targeted lookup (one `gh issue view`, not a `--label demo:pending`
  list) of that one record's Verification Brief, then straight to Step 3. **New fallback:** when
  the record has no `demo:pending` label (e.g. it was built via a path that skipped `/wrap-up`'s
  Step 10 — see Non-Goals), and this session has conversational memory of that `#N`, compose a
  session-recall-style brief for it exactly as Source B already does for unlabeled work, instead
  of reporting nothing found. When neither a label nor session memory exists, report plainly:
  "`#N` has no Verification Brief and this session has no memory of it — nothing to show."
- **Step 2's batch table and "how do you want to work through these?" bulk question are removed**
  outright, not just bypassed — they only ever served Source A's multi-record sweep, which no
  longer exists. The rare case of 2+ genuinely distinct session-recall items in one session just
  walks each through Step 3 in sequence — no aggregation ceremony, and no loss versus today,
  since session-recall entries never had risk/effort data to pre-fill an "Approve the low-risk
  batch" option in the first place.
- Frontmatter `description`, "When to Use," and opening framing rewritten to drop "aggregates
  every record" language. `/demo`'s job becomes: give a human verdict on one thing.

### 6. `/help` becomes the sole acceptance-queue discovery surface

`_shared/github-pr-scan.md`'s `acceptance-queue` scope (consumed by `/help` Stage 4.7):

- Query changes from `gh issue list --label demo:pending --state all --json number --limit 200
  -q 'length'` to requesting `number,title` and rendering each record, not just the count. Same
  single API call, same `--state all` (unchanged — `demo:pending` persists independent of
  open/closed state), only the `--json`/`-q` shape and render format change.
- Render format: `Awaiting sign-off: **{N} records** — #1123, #1124, ... (run /demo #N on any of
  these)`, still one line, still omitted when `N` is 0.
- The scope section's rationale line ("Cheap count only — the walkthrough stays `/demo`'s job")
  becomes "Cheap list only — the walkthrough stays..." — division of labor (discovery vs.
  walkthrough) is unchanged, only what counts as "cheap" output grows from a number to a list.
- Reciprocal relationship-table rows update on both sides: `/demo/SKILL.md`'s `/help` row → "the
  sole discovery surface for the acceptance queue — lists every outstanding `#N`; `/demo #N`
  executes the walkthrough for one." `/help/SKILL.md`'s `/demo` row updates to match (list, not
  count).

## Relationship to Existing Mechanisms (delta)

- **vs. `2026-07-19-demo-session-recall-design.md`** — that design's Non-Goals explicitly said
  "Not touching `/help`'s `demo:pending` dashboard count" and described the label-backed sweep as
  "`/demo`'s normal 'sweep every parallel thread' use case, unaffected." This design deliberately
  reverses both: the sweep is removed (Section 5) and `/help`'s count becomes a list (Section 6).
  Session-recall's own mechanism (dual-source discovery, recall-entry composition, verdict
  handling per entry kind) is otherwise unchanged — Section 5 just makes it the *only* discovery
  path `/demo` itself runs, rather than one of two.
- **vs. `dev-url-detection.md`** — no changes to that file. Section 1 is a new *consumer*, the
  same relationship `/stories`, `/test`, `/flow`, and `/visual-review` already have with it.
- **vs. `verification-brief.md`** — unchanged. Step 2.5's Visual-Review Safety-Net Gate already
  does a build-time equivalent of Section 1's render check for label-backed records; Section 1
  extends the same idea to demo-time, where environment state (ports, orphaned processes) may
  have drifted since wrap-up ran, and to session-recall entries, which never went through
  Step 2.5 at all.
- **vs. `/triage`, `/review-backlog`** — no changes. See Non-Goals.
- **vs. `work-record.md`'s permission matrix** — no changes. `/demo`'s row (adds
  `demo:approved`/`demo:changes-requested`, removes `demo:pending`) is unchanged; Section 6 only
  changes what `/help` *reads*, not what anyone writes.

## Testing

`/demo` has no backing code — verification is procedural:

- `npm test` stays green throughout (no expected changes to any existing suite).
- Manual walkthrough, pre-flight success path: build something real with a genuine dev-server
  step (or reuse an existing feature branch), run `/demo`, pick "See it yourself," then the live
  sub-choice — confirm `dev-url-detection.md` resolves/starts a server without prompting for a
  port, confirm the live session opens at that URL.
- Manual walkthrough, pre-flight failure path: point the target page at something that errors on
  load; confirm `/demo` surfaces the failure as a Request-changes candidate with captured
  evidence, skips the live-vs-manual follow-up question entirely, and does not attempt to fix the
  underlying code itself.
- Manual walkthrough, "give me the steps" sub-choice: confirm the rendered instructions have no
  inline comments in any command block, every block includes its own `cd`, and the URL/port match
  what the pre-flight actually verified.
- Manual scope-fork check: mid-walkthrough, ask for a new feature; confirm the checkpoint fires
  once, and does not re-fire for a second closely-related follow-up ask in the same session.
- Manual `#N` fallback check: run `/demo #N` for a record with no `demo:pending` label that this
  session has discussed; confirm a recall-style brief is composed instead of "nothing found."
  Run it again for a record neither labeled nor discussed; confirm the plain "nothing to show"
  message.
- Manual sweep-removal check: run `/demo` with no arguments in a session that did two genuinely
  distinct, unrecorded units of work; confirm both surface and are walked through in sequence
  with no batch table.
- `/help` check: with 2+ `demo:pending` records open, run `/help`; confirm the acceptance-queue
  line lists individual `#N`s, not just a count.

## Known Touch Points

- `skills/demo/SKILL.md` — frontmatter `description`; "When to Use"; Step 1 rewritten (sweep
  removed, `#N` fallback added); Step 2 removed; Step 3's "Show me live" renamed "See it
  yourself" and gains the pre-flight + live-vs-manual follow-up question (Section 1), the
  "give me the steps" instructions contract (Section 2), the scope-fork checkpoint (Section 3),
  and task-anchor language (Section 4) — option count stays at 4, unchanged from today; Step 4
  simplified for always-single-item context; Anti-Patterns table gains rows for handing over
  unverified instructions and for silently dropping a mid-decision record; Relationship table's
  `/help` row updated (Section 6).
- `skills/_shared/github-pr-scan.md` — `acceptance-queue` scope section: query shape, render
  format, rationale line (Section 6).
- `skills/help/status-scan.md` — Stage 4.7 description updated to match.
- `skills/help/SKILL.md` — `/demo` relationship row updated to match.
- `skills/browse/SKILL.md` — a "When to Use" bullet and the Relationship-table `/demo` row both
  name "Show me live" and `/demo`'s Step 3 by number; both need the rename ("See it yourself")
  and renumbering (Step 2) applied from the other side. Verified via a repo-wide grep during
  plan-writing — not originally listed here, corrected before implementation.
- `skills/visual-review/SKILL.md` — same reciprocal fix: its Relationship-table `/demo` row names
  both "Show me live" and Step 3.
- `.claude-plugin/plugin.json` — version bump (minor — new option added to `/demo`, behavior
  change to `/help`; check `origin/main` for a concurrent bump first, per the Releasing section's
  discipline).
- **No changes** to `CLAUDE.md` — verified during plan-writing that no one-line `demo`/`help`
  skill summary table actually exists there (the "Skill directories" section only lists bare
  skill names); the touch point originally noted here was inaccurate and has been removed.
- **No changes** to `dev-url-detection.md`, `_shared/browse` conventions, `verification-brief.md`,
  `wrap-up/SKILL.md`, `work-record.md`'s label taxonomy/permission matrix, `triage/SKILL.md`,
  `review-backlog/SKILL.md`, or `bin/lib/issues/*`.

## Prior Design

Builds on `2026-07-16-demo-skill-design.md` (original Acceptance axis + `/demo` skill, v6.3.0),
`2026-07-17-demo-verification-brief-redesign-design.md` (digest-shaped brief, safety-net gate,
vision/fit framing), and `2026-07-19-demo-session-recall-design.md` (dual-source discovery,
recall-entry composition). This document is not purely additive — Section 5 removes the
label-backed sweep both prior designs treated as a stable, unaffected mechanism, and Section 6
reverses the 07-19 design's explicit non-goal of leaving `/help`'s count untouched. Sections 1-4
are additive extensions to Step 3 with no analogous prior-design conflict.
