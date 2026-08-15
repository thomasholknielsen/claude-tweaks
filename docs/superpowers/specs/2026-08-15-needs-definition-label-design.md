# Human-owed backlog signals: `needs:definition`, `solution:unjustified`, `/backlog attention`

## Problem

An audit of the backlog pipeline (this session, 2026-08-15) found that the taxonomy already
distinguishes health-sweep chores (born-`ready`, agent-runnable by construction) from captured
ideas (born stage-less, meant to reach `ready` only through `/claude-tweaks:specify`) — but the
boundary between the two has a real hole:

1. **`/specify`'s shaping mode never routes an idea-stage record back to brainstorming.**
   `specify/SKILL.md:72` states plainly: "A backlog reference never invokes brainstorming on its
   own." Shaping mode (`shaping-mode.md:18`) instead manufactures spec shape out of whatever text
   exists — "raw captures rarely state [Acceptance Criteria] explicitly," so it writes them fresh.
   An undecided idea and a decided one produce an identical-looking `ready` record.
2. **`grant-check` (`assess-agent-autonomy/grant-check.md`) judges blast-radius sensitivity, not
   decidedness.** Its four criteria ask "is this touching something sensitive," never "was this
   ever traded off." There is no third verdict for "this reads as undecided."
3. **`framing:baked` — the one signal that does mean "never traded off" — is narrower and
   non-gating.** It only fires when `/specify` has already shaped a record into naming a solution
   (`shaping-mode.md:60`); `refine-mode.md:297` states outright "a `baked` row is not a reason to
   withhold a grant"; `/help`'s Needs Attention flag (`status-scan.md:88`) only surfaces it while
   the record is still in the backlog bucket, so it goes dark the moment shaping promotes the
   record to `ready`.
4. **Discovery, when a wrongly-granted idea reaches `/dispatch`, is expensive.** Dispatch never
   reads the record body; `/flow`'s plan-structure check silences itself under `auto` mode; the
   system's actual failure signal is three failed build attempts, ending in `bot:blocked`.

No document in the repo states this specific tension, and no gate's stated purpose is to catch
it (confirmed by a second audit pass over `dispatch`, `flow`, `build`, and
`assess-agent-autonomy`).

**How each gap resolves below:** #1 and #2 are closed directly by `needs:definition` (Components
1-5) — a hard gate and a redirect, since decidedness genuinely can't be resolved without a human.
#4 is closed as a side effect: an idea that can't reach `ready` unresolved can't reach `/dispatch`
unresolved either. #3 turns out to be two problems wearing one description, and they resolve
differently: `framing:baked`'s *non-gating* nature was reconsidered during brainstorming and kept
deliberately (Component 6, Two tracks) — its remedy is answerable inline, so gating it would be
solving a one-line decision with a structural detour. Its *visibility* turns out not to need a
`/help` fix at all: it's stamped exactly when a record is promoted to `ready`, so it was never
truly a backlog-bucket signal misfiring on-promotion — `/backlog refine`'s batch table, which
already operates on `ready` records, was always the correctly-scoped surface for it; nothing was
actually broken there once traced through.

## Goals

- Give `/capture` and `/feedback` a way to mark, at filing time, "this is an undecided idea — an
  agent must not be authorized to build it as-is."
- Make that mark a genuine hard gate on `auto:build`, not another soft, ignorable flag like
  `framing:baked`.
- Route a flagged record through `/superpowers:brainstorming` before it can ever reach `ready` in
  a form that authorizes a build — closing gap #1 directly, not just working around it downstream.
- Keep the mechanism to a single label for the decidedness question. Do not generalize into a
  `needs:*` family (the "prior-art check" / "feasibility check" / "scope-split" variants
  considered during brainstorming are explicitly cut — one flag is enough for that problem).
- Give `framing:baked` — renamed `solution:unjustified` (see Component 6) — a bounded
  auto-resolution attempt before it ever reaches a human, and a concrete, actionable remedy
  when it does. This is a distinct concern from decidedness (see Component 6's own framing) and
  gets its own label, deliberately not folded into `needs:definition`.
- Provide one discovery surface, `/backlog attention` (Component 7), for every record where the
  taxonomy has recorded that a human specifically must act — distinct from `/help`'s Triage Queue
  (awaiting authorization, flagged or not) and Acceptance Queue (awaiting sign-off).

## Non-Goals

- Not adding a judgment step to `/specify` for records that never carried the flag (no
  from-scratch backstop judgment inside shaping mode). A human-filed-directly record (no `by:*`
  label) is exempt by convention — filing directly is itself an assertion the human knows what
  they want.
- Not changing anything about how `/superpowers:brainstorming` itself classifies spike / bounded
  / architectural work.

## Two tracks

Every record in the pipeline resolves into one of two tracks: **automated** (nothing outstanding —
health-filed, well-specified captures, anything that reaches `ready` cleanly) or **human-owed**
(the taxonomy has recorded that a human specifically must act before the record can safely
proceed). `needs:definition` and `solution:unjustified` are both human-owed markers, but they
differ in *why* a human is needed and therefore in remedy shape:

| | `needs:definition` | `solution:unjustified` |
|---|---|---|
| What's missing | A decision — which of several viable directions to take | Evidence — why the already-chosen direction beats the alternatives |
| Can an agent close the gap? | No — picking among genuinely viable options is a taste/tradeoff call | Partially — an agent can search for existing evidence first (Component 6); only the residual where evidence doesn't exist yet needs a human |
| Remedy | A real, separate session (`/superpowers:brainstorming`) | One inline judgment, answerable in the same click as a grant decision |
| Gate | Hard — `/specify` structurally cannot shape a flagged record in place | None — informational at grant time, self-renewing via `/backlog refine`'s own recurring worklist |

Both are worth a place in `/backlog attention` (Component 7) precisely because both are genuinely
human-owed, not because they're the same kind of problem — the surface unifies discovery without
blurring the labels or their remedies.

## Design overview

```
/capture or /feedback
   │  (judgment call, same turn as filing)
   ▼
record filed, needs:definition present ── no ──► record filed normally (today's behavior, unchanged)
   │
   │ (record sits in backlog state — capture/feedback never also mark it ready/born-ready
   │  when this flag is present)
   ▼
human runs /claude-tweaks:specify #N (whenever — no urgency, no headless path reaches this)
   │
   ▼
/specify sees needs:definition on #N → skips shaping mode entirely
   │
   ▼
invokes /superpowers:brainstorming on #N's content (title + body)
   │
   ▼
brainstorming produces a design doc (CLAUDE.md's existing override: brainstorming
"stops after the design doc — route to /specify")
   │
   ▼
/specify runs its EXISTING decomposition mode on that doc
   │
   ▼
parent issue + fresh sub-issue(s), each independently ready/scored/ceremony-tagged —
none carry needs:definition, because they were never filed by /capture or /feedback,
they were born through decomposition
   │
   ▼
#N (the original flagged record) is closed, referencing the new sub-issue(s)
   │
   ▼
sub-issues flow through /flow exactly like any other decomposed spec
```

The flag is never "removed." It dies with the record it was stamped on. This is deliberately the
same shape the taxonomy already uses for `wontfix` (presence suppresses re-filing until the
record's own lifecycle ends) rather than inventing a new removal mechanic.

**Defense in depth:** every consumer downstream of `/specify` — `grant-check` and the headless
`/backlog grant` machine lane — still refuses unconditionally on presence of `needs:definition`.
Under normal operation they should never see it (a flagged record can't reach `ready` without
going through the redirect above, and decomposition-mode sub-issues never inherit the flag), but
if that invariant is ever broken — a manual mislabel, a future bug, someone shaping a record by
hand outside `/specify` — the grant gate still holds.

## Component 1: The label

**Name:** `needs:definition`. Matches the taxonomy's existing namespace convention (`by:`,
`risk:`, `demo:`, `framing:`). Presence-only flag, no enum — same shape as `framing:baked`.

**`_shared/work-record.md`, Label taxonomy table** — new one-off entry, alongside `Framing (1)`
and `Structure (1)`, not a new formal axis (it doesn't join "## The axes" table any more than
`framing:baked` did):

```
| Definition (1) | needs:definition | Marks a record that hasn't had its tradeoffs decided yet — stamped by /capture or /feedback at filing time; presence blocks auto:build unconditionally (grant-check refuses, /backlog grant's machine lane refuses) and makes /specify route to brainstorming instead of shaping in place |
```

**`_shared/label-bootstrap.md`, canonical `LABELS_JSON`** — new entry (85 chars, under the
100-char cap):

```js
["needs:definition", "Undecided idea — must go through /specify's brainstorm redirect before reaching ready"]
```

Bump `LABEL_BOOTSTRAP_VERSION` per that file's own instructions when this lands.

**Taxonomy closure (#239):** this design names its consumers (Component 3, Component 4's
`/specify` redirect check, Component 5) before any producer stamps the label, satisfying
`work-record.md:107`'s closed-taxonomy rule.

**Permission matrix (`_shared/work-record.md`)** — two row changes:

- `/capture` row, **Adds** column: append `needs:definition` (judgment call — see Component 2).
- New `/feedback` row (this actor has none today):

  ```
  | **/feedback** | needs:definition (judgment call, see below); bug/enhancement only when gh label list confirms it exists | nothing | every other internal-taxonomy label (by:*, type:*, risk:*, ready, size:* — feedback/SKILL.md's standing rule); needs:definition is the one deliberate exception |
  ```

No actor gets a **Removes** entry for this label — see Design overview above.

## Component 2: Producers — `/capture` and `/feedback`

**Judgment, not a heuristic.** Both skills already run an LLM turn to file the record; the
decision — "does this name a genuine open choice with no tradeoff made yet, or a single clear
ask?" — is made in that same turn, not a separate call and not a mechanical length/keyword check
(both were considered and rejected: a structural heuristic both over- and under-fires, and this
codebase's whole `grant-check`/`framing-check`/`ceremony-check` precedent is content judgment,
not string matching).

**Surfaced and overridable, reusing the existing Type-guess UX exactly.** `capture/SKILL.md`
already has a battle-tested pattern for this shape of decision (`## Guessing the Type`): guess
by default, ride the existing presentation line, overridable via free text in interactive mode,
overridable via an explicit flag in auto/headless mode where there's no next message. Reuse it
verbatim rather than inventing a second mechanism:

- `capture/SKILL.md`'s "Added: '{title}' (Type: {t})" presentation line
  (`## Routing prompt`, interactive branch) extends to `"Added: '{title}' (Type: {t}, Definition:
  {needed|clear})"`. When `needed`, add one clause naming the rationale inline (e.g. "— multiple
  viable directions, no tradeoff made").
- Interactive: the human can override via free text in the next message, same as Type today.
- Auto/headless: add `--needs-definition` / `--no-needs-definition` as explicit overrides,
  siblings to `--type=`, in `capture/SKILL.md`'s `## Input` table and `argument-hint`.
- **Default is the judgment call** — this is what "surfaced, overridable, judgment-call-as-default"
  (the explicit design requirement) means concretely: nobody has to ask for the flag, and anybody
  can turn it off in the same turn they see it.

**Filing mechanics** — `capture/SKILL.md`'s Backend Selection section (`work-backend:
github-issues` branch) gets one more conditional `--label needs:definition` on the `gh issue
create` call, bootstrapped per Component 1, applied only when the judgment (post-override) says
`needed`. `work-backend: local-files` gets a parallel `facets.needsDefinition: true` on the
`createRecord` call.

**Interaction with the born-ready exception.** `capture/SKILL.md:53`'s trusted+-ceiling exception
(files with `ready` already applied when `producer:capture`'s trust verdict is `clean`) must
never co-occur with `needs:definition` — a record judged undecided cannot simultaneously be
judged born-ready. Add one line to that section: skip the born-ready resolution block entirely
when this filing carries `needs:definition` (checked before the `bornReady` node call, cheapest
place to short-circuit — no need to spend the `gh issue list`/git-log round-trip on a record that
can't be born-ready anyway).

**`/feedback`** — the judgment happens at Step 1 (Gather) or Step 5 (Draft); no new gate. The
existing Step 7 confirm gate (`## Step 7: Confirm — HARD GATE`) already shows the full scrubbed
draft and requires human confirmation before anything is filed — add one line to the rendered
draft, `**Definition:** Needed | Clear — {one-line rationale}`, and the human's existing
confirm/decline mechanism (or free-text edit, under the batch contract) is the override. No
second `AskUserQuestion`, consistent with this skill's existing "one confirm gate, not two"
shape. Step 8's filing logic gets one more conditional `--label needs:definition`, positioned as
the named, singular exception to the "never apply the internal automation taxonomy" rule stated
there today.

`--dry-run` renders the Definition line like everything else Step 7 renders; nothing files.

## Component 3: Consumer — the hard gate

**`assess-agent-autonomy/grant-check.md`, Step 2 — new first bullet, checked before the existing
four:**

> Does the record's labels (already fetched in Step 1) include `needs:definition`? If so, skip
> the rest of this judgment entirely and render `RECOMMEND_BUILD: false` / `RECOMMEND_MERGE:
> false` with `RATIONALE: "record carries needs:definition — must go through /specify's
> brainstorming redirect before this class of judgment applies."` This is mechanical, not
> content-weighed, unlike the other four bullets.

This single file serves both consumers named in its own header (`/backlog refine`'s per-record
pass, and `/backlog grant`'s gate 4) — one edit covers both.

**`bin/lib/issues/grant-gate.js`** — new pure, pre-LLM gate in Phase A (alongside the existing
ceiling/opt-in/origin checks), consistent with the module's own stated reason for phasing gates
1-3 before gate 4: "don't spend an LLM call on a record already refused for a cheaper reason."
Requires `parseRecordFacets` (`bin/lib/issues/record.js`) to expose a new `facets.needsDefinition`
boolean, parsed the same presence-only way `facets.framing` already is. Deny with
`failedKey: 'needs-definition'` before the origin/trust gates run — this disqualifier is
independent of trust class or origin, so it should short-circuit as early and as cheaply as
the ceiling checks do.

**`/backlog refine`'s Step 3.5 body-shape re-verification** needs no change — it already
downgrades on structural grounds independently; `needs:definition` records are refused earlier,
at the grant-check step, before Step 3.5 would even matter for this reason.

## Component 4: Consumer — `/specify`'s redirect

**`specify/SKILL.md`, Resolve-the-input, case 1** (work record reference) — after the existing
fetch (`gh issue view {n} --json number,title,body,url,labels`), check the fetched labels for
`needs:definition` before deciding shaping vs. decomposition mode:

- **Present:** do not enter shaping mode. Invoke `/superpowers:brainstorming` (Skill tool) with
  the record's title + body as input — the same invocation shape case 4 already uses for a bare
  topic, just triggered by the label instead of "topic with no matching design doc." Per
  CLAUDE.md's existing override ("`/superpowers:brainstorming` stops after the design doc — route
  to `/claude-tweaks:specify`"), wait for the resulting design doc, then enter **decomposition
  mode** on it (Step 1 onward, `decomposition-mode.md`) exactly as case 4 does.
- **Absent:** unchanged — shaping mode, as today.

This applies uniformly regardless of what brainstorming's own path classification (spike / bounded
/ architectural) turns out to be — the record came from the structured backlog pipeline and
returns to it the same way, through decomposition, not through brainstorming's own
implement-directly bounded-path terminal state. (Confirmed safe: `/specify` is never invoked
non-interactively anywhere in the current architecture — dispatch explicitly skips calling it,
`/flow`'s materialize gate stops and points at it rather than invoking it even under `auto` mode,
and `/backlog grant` only ever touches already-`ready` records. Whoever reaches this redirect is,
by construction, a human at a terminal.)

**New requirement on decomposition finalization (`record-creation.md` / wherever decomposition
mode's Step 9 currently closes out):** when this run was entered via the `needs:definition`
redirect (not via a bare design-doc/topic input), close the origin record (`#N`) once the parent
and sub-issue(s) it produced all exist, with a comment referencing them — e.g. "Superseded by
decomposition: #{parent}, #{sub1}, #{sub2}, ...". This is new behavior scoped specifically to this
redirect path; it does not apply to cases 2-5's existing entry points, which have no "origin
record" to close.

**Explicitly out of scope, flagged for awareness:** `/capture`'s existing `--route=brainstorm`
immediate-invocation path (`capture/SKILL.md`'s Route execution table) already opens
`/superpowers:brainstorming` inline at filing time, and does *not* close/supersede the freshly
filed record afterward — the same orphaning gap this design closes for the `/specify` redirect,
but pre-existing and unrelated to `needs:definition`. Not fixed here; worth its own backlog record
if ever wanted.

## Component 5: Consumer — `/help` visibility

**`help/status-scan.md`, Stage 1** — new flag paragraph, parallel to the existing Framing flag
(`status-scan.md:88`), and *not* subject to the same "goes dark on promotion" problem: a
`needs:definition` record cannot leave the backlog bucket without going through Component 4's
redirect, which is the only thing that ever resolves it (by closing the record). So flagging only
backlog-bucket records — the same scope Framing already uses — is not a visibility gap here the
way it is for `framing:baked`.

```
Flag every backlog-bucket record carrying needs:definition (github-issues: the label;
local-files: facets.needsDefinition) in the Needs Attention table: "{ref} — needs definition,
run /claude-tweaks:specify {ref} to route through brainstorming."
```

## Component 6: `solution:unjustified` — rename + bounded auto-resolution

**Rename, not a fresh addition.** `framing:baked` → `solution:unjustified` throughout:
`_shared/work-record.md`'s Label taxonomy table (the Framing row) and its permission matrix's
`/specify` row (Adds column), `_shared/label-bootstrap.md`'s `LABELS_JSON` entry,
`shaping-mode.md`'s Framing subsection, `record-creation.md`'s per-sub-issue Framing subsection,
`refine-mode.md`'s Framing column, `help/status-scan.md`'s Framing flag paragraph. Because this
renames a shipped, in-use label rather than adding a new one, it follows CLAUDE.md's
expand-contract discipline for contract changes — see Rollout.

**`challenge/SKILL.md`'s `framing-check` mode itself is unchanged.** It stays a pure judge exactly
as documented today: "Not for: ... gating anything. This skill renders a verdict or a perspective;
callers act on it," and its Anti-Patterns table already forbids it from taking actions or writing
anything. All new behavior belongs to its two callers.

**Bounded auto-resolution, identical in both callers** (`shaping-mode.md`'s single-record Framing
subsection, `record-creation.md`'s per-sub-issue Framing subsection):

1. Invoke `framing-check` against the composed body, as today.
2. On `solution-baked`: before stamping anything, run ONE bounded evidence search — grep the
   codebase for an existing benchmark/profile/measurement referencing the named technology or
   mechanism, search project memory and `CLAUDE.md` for a documented prior decision on this exact
   tradeoff, and check related closed records for prior art that traded off the same alternatives.
   A single pass, not iterative — a quick attempt, not an open-ended investigation.
3. If evidence is found: fold it into the composed body's `## Current State` section before the
   compose-then-write-once write call (no second write triggered), and re-invoke `framing-check`
   once against the updated body. Use this second verdict.
4. If evidence is not found, or the second verdict still reads `solution-baked`: stamp
   `solution:unjustified` and fold the assumptions into `## Gotchas`, exactly as `framing:baked`
   does today.

**No hard gate, no `grant-check` change.** Stays informational at the human's existing grant-time
review, because the remedy is answerable inline (see Two tracks above), and `/backlog refine`'s
worklist (`ready` + no existing grant) already guarantees a still-unresolved record reappears in
every subsequent refine run — a self-renewing backstop, no new sweep needed.

**`refine-mode.md`'s batch table** — the column's text changes from a bare fact to a named remedy:
`"unjustified — grant anyway (accept the risk) or run /claude-tweaks:specify #{n} again after
adding evidence to Current State."`

## Component 7: `/backlog attention` — the human-owed discovery surface

A new, fourth `/backlog` mode (`skills/backlog/attention-mode.md`, dispatched from
`skills/backlog/SKILL.md` alongside `refine`/`overview`/`grant`), read-only like `overview` mode
— no writes, no grants, a ranked list plus a recommendation.

**Fetch:** two `gh issue list --state open --label {X}` calls (`needs:definition`,
`solution:unjustified` — `gh`'s `--label` flag ANDs multiple values within one call, so this needs
two calls, not one), merged. No automated path ever stamps both on the same record — a
`needs:definition` record is redirected out of shaping mode before `/specify` ever reaches the
`framing-check` step that could stamp `solution:unjustified` — but a human can always add any
label directly (the permission matrix's Human row), so the merge step dedupes by issue number
defensively, rendering one row with both types listed, rather than assuming the two sets are
disjoint.

**Rank:** priority band (`priority:*`, when set) first, then oldest `createdAt` first — the same
two-key ordering `/dispatch`'s own ranking already uses, reused rather than inventing a third
convention.

**Render**, one row per record, type-differentiated remedy:

```
| Record | Type | Filed | Recommended action |
|---|---|---|---|
| #{n} | needs:definition | {age} | run /claude-tweaks:specify #{n} to route through brainstorming |
| #{n} | solution:unjustified | {age} | grant anyway (accept risk), or add evidence to Current State and re-run /claude-tweaks:specify #{n} |
```

Plus one recommendation line, the same shape `overview` mode already renders, here scoped to
"what to pick up next": the oldest/highest-priority record across both types.

## Testing / verification

- `bin/lib/issues/record.js` — `parseRecordFacets` unit test: `needs:definition` label parses to
  `facets.needsDefinition: true`; absence parses to `false`/absent, matching `facets.framing`'s
  existing test shape.
- `bin/lib/issues/grant-gate.js` — unit test: a candidate record with `facets.needsDefinition:
  true` denies with `failedKey: 'needs-definition'` regardless of every other input (trust class,
  origin, ceiling) — the gate must short-circuit before those are even consulted.
- `capture/SKILL.md` / `feedback/SKILL.md` — no unit-testable judgment (LLM content call), but the
  override plumbing (`--needs-definition`/`--no-needs-definition`, the born-ready short-circuit)
  is checkable the same way existing `--type=` override tests are, if any exist.
- End-to-end: file a deliberately-undecided idea via `/capture`, confirm `needs:definition` lands;
  run `/backlog refine` and confirm `grant-check` refuses with the mechanical rationale; run
  `/claude-tweaks:specify #N` and confirm it redirects to brainstorming rather than shaping in
  place; confirm the origin issue closes once decomposition completes, referencing the new
  sub-issue(s).
- `solution:unjustified`: shape a record whose Deliverables name an unjustified technology choice
  where the codebase *does* carry a relevant benchmark — confirm the auto-resolution search finds
  it, folds it into Current State, and the record ships with no label. Repeat with no relevant
  evidence anywhere — confirm `solution:unjustified` lands and the Gotchas bullets carry the
  unresolved assumptions.
- `/backlog attention`: with one open record of each type, confirm both rows render with their
  distinct recommended-action text, ranked by the stated priority-then-age rule, and confirm a
  record carrying `ready` with neither label is correctly excluded.

## Rollout

`needs:definition` needs no migration — purely additive, with a closed set of new consumers all
enumerated above before any producer stamps it (satisfying `work-record.md:107`'s closure rule).
Existing open records are entirely unaffected; nothing retroactively re-judges the current
backlog.

`solution:unjustified` **is** a migration, since it renames a shipped, in-use label — follow
CLAUDE.md's expand-contract discipline for contract changes:

1. Bootstrap `solution:unjustified` as a new label (Component 1's bootstrap mechanism, extended).
2. Migrate every read/write site listed in Component 6's Rename bullet in the same change.
3. One-time relabel sweep over currently-open records: `gh issue list --state open --label
   framing:baked`, add `solution:unjustified` and remove `framing:baked` on each.
4. Retire `framing:baked` from `label-bootstrap.md`'s canonical `LABELS_JSON` (bump
   `LABEL_BOOTSTRAP_VERSION` per that file's own instructions).

Closed issues carrying the old label are left untouched — historical record, not live state
anything reads back.
