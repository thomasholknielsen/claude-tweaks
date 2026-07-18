# cross-spec-promise-tracking — Design

**Goal:** Formalize the ad hoc "promise register" pattern from the spec 13-23 build — which caught
3 real cross-spec breaks that task-scoped review couldn't see — into a repeatable mechanism that
survives past the pipeline run that creates it, without building new durable-storage
infrastructure or a new automated scanning skill.

**Architecture:** An optional trailing-assumption extension to the existing `Blocked by #N`
body-line convention, a `## Cross-Spec Promises` section maintained on a decomposition's **parent
GitHub issue** (not a new file, not a new branch — the parent already exists and is already the
durable, discoverable anchor every leaf links back to), seeded by `/specify` and maintained by
ordinary `/review` on any leaf regardless of how it was dispatched. A small, precisely-specified
follow-up amendment to `assess-agent-autonomy`'s `grant-check` mode is documented but **not
applied** by this design (see Coordination Note).

## Motivation

The spec 13-23 build (11 sequential specs decomposing one design) used a hand-rolled
`promise-register.md` at the pipeline run root, tracking forward references like "spec 14
provides X, which spec 20 consumes" and reconciling them at each subsequent spec's whole-branch
review. It caught 3 real breaks nothing else would have (a writer landing with no reader ever
specified; a retired frontmatter convention with 11 inbound references scattered across 4 later
specs' owning files; a config-key rename whose old name survived in a standalone-auto allowlist).

Two things make this less proven than it first looks:

1. **It's currently gitignored.** `.claude-tweaks/pipelines/*/*` is excluded from git; only `work/`
   subdirectories survive. `promise-register.md` exists on disk only because nobody's pruned that
   archive directory yet — a fresh clone has zero trace of it, and the only permanent residue
   anywhere in the repo is two terse code comments citing a conclusion ("F8 from the program
   promise register") without the reasoning that produced it.
2. **It fired exactly once, was never formalized as a required step, and was self-liquidating.**
   No skill file (`flow/multi-spec.md`, `review/SKILL.md`) documents creating one — whoever ran
   spec 13-23 invented it during whole-branch review, the only multi-spec run in this repo's
   history at that scale. Every entry resolved *within* that run: `SATISFIED` with the lesson
   folded into shipped code/docs (one catch is now permanently `tidy/scan-procedures.md` Shape 3),
   or handed to a named owner, with spec 23's "sweep assert-zero" as a designed final backstop.
   Nothing in the evidence shows a promise surviving past its own pipeline and rotting silently —
   that failure mode is a real risk, not an observed one.

What *has* changed since: the dominant workflow post-6.0.0 is `/dispatch`/`/triage` over a queue
of independently-claimed records, not big continuous multi-spec `/flow` batches. A decomposition's
leaves increasingly get built weeks apart, each in its own solo `/flow` + `/review`, never sharing
a branch. That's precisely the shape where a promise *would* silently rot if nothing tracks it —
and precisely the shape the original register, scoped to one continuous run, never had to survive.

## Non-Goals

- **Not** a periodic or automated scanning skill. No new `/tidy`- or `/code-health`-style sweep
  that checks promises on a schedule, independent of human review. Rejected direction — see
  Relationship to Existing Mechanisms.
- **Not** a new durable-storage subsystem. `health-state.md`'s dedicated branch stays scoped to
  genuinely homeless operational state (rotation cursors, retry queues with no natural single-issue
  home). A promise is always about a specific record; per `work-record.md`, "the GitHub issue...
  is the *one* durable work record" and "labels are projection, not truth — the body [is]" —
  this design keeps promise truth on the record graph rather than inventing a parallel store.
- **Not** coverage for `/flow` batches of unrelated records with no shared parent. No natural
  anchor exists for those; out of scope.
- **Not** a hard gate anywhere. The `grant-check` follow-up (once applied) surfaces a mismatch in
  its rationale text only — same non-binding, human-still-decides posture as every other
  `assess-agent-autonomy` judgment. Nothing here auto-reopens, auto-blocks, or auto-edits.
- **Not** retroactive. Does not attempt to reconstruct the already-vanished spec 13-23 promise
  history; that pattern already fully resolved within its own run.
- **Does not** touch `parseDependencies`/`DEP_RE` or the dispatch queue filter that depends on
  them. Purely additive — see Architecture.
- **Does not** widen `work-links: native` mode's actual dependency-relationship API usage. The
  assumption-text convention below is body-text regardless of `work-links` mode, since it's prose
  GitHub's native relationship has no field for — the relationship *edge* itself (native vs.
  body-text) is unaffected. (The pre-existing gap where `parseDependencies` doesn't query the
  native relationship at all is dispatch's own documented follow-up, not this design's to fix.)

## Architecture

### The assumption convention

`Blocked by #N: {assumption}` — the colon and trailing text are optional; a bare `Blocked by #N`
line means exactly what it means today. This parses under the *existing* `DEP_RE` with zero
changes: `/^Blocked by #(\d+)\b/gm` already stops matching at the number, so anything after it on
the line is currently ignored, not rejected. A new, separate helper in `bin/lib/issues/record.js`
captures the trailing text:

```js
const DEP_ASSUMPTION_RE = /^Blocked by #(\d+):[ \t]*(.+)$/gm;

function parseDependencyAssumptions(body) {
  // returns [{ number, assumption }, ...] for lines carrying trailing ': {text}'
  // (bare 'Blocked by #N' lines are absent from this list, not present with assumption: null)
}
```

Sibling to `parseDependencies`, not a modification of it. `parseDependencies`, `DEP_RE`, and every
consumer of them (dispatch's queue filter) are unchanged by this design.

### Config key: `promise-register-min-leaves`

New key in `work-record.md`'s Config keys table, default `4`. Below this size, a human re-reading
2-3 leaf bodies at triage doesn't need structured help — 11 was the scale that actually broke
unaided tracking in the one run that produced evidence. Read by `/specify` at decomposition time
only; not re-probed elsewhere.

### Parent-issue register

No new file, no new branch. A decomposition's parent record (already the design summary that
leaves link back to, per `work-record.md`'s Decomposition rules) gains:

- **A `## Cross-Spec Promises` table in the issue body** — current-state truth, edited in place
  (`gh issue edit`) each time a row changes. Reuses the proven format verbatim:

  ```
  | # | Promise | Owner (#leaf) | Status |
  |---|---------|-----------------|--------|
  | F1 | leaf #48 assumes leaf #46 exposes getStatus() | #48 | open |
  ```

- **A chronological reconciliation log as issue comments** — one comment per event (a promise
  added, updated, or confirmed satisfied), naturally timestamped and attributed by GitHub. This
  splits the original file's two roles (a live table + an append-only narrative) onto the two
  GitHub primitives that already do each natively, rather than fighting either: the body always
  shows current truth; the comment thread is the full audit trail, exactly as
  `promise-register.md`'s own Reconciliations section was, but no longer at risk of vanishing with
  a gitignored directory.

### Seeding — `/specify`

When decomposition produces `>= promise-register-min-leaves` leaves under one parent: after
creating all leaves, `/specify` writes the initial `## Cross-Spec Promises` table to the parent
body. If the decomposition reasoning already surfaced forward dependencies (it has to reason about
leaf ordering and `Blocked by #N` links regardless), those become the first rows. If none are
apparent yet, the section is still created empty — a well-known anchor for `/review` to find,
rather than something it has to detect the absence of.

### Maintenance — `/review`

**Not gated on whole-branch-review or multi-spec-batch mode.** That was an earlier, incorrect
framing of this design: whole-branch review (`review/SKILL.md`) only exists *inside* a multi-spec
`/flow` batch — several specs sharing one worktree/branch — and gating on it would miss exactly
the now-dominant case of independently `/dispatch`ed leaves, each with its own solo `/review`,
weeks apart, no shared branch at all.

Instead: any `/claude-tweaks:review` run on a leaf record — solo or batch — resolves the record's
parent (native sub-issue relationship, or the parent-task-list convention under
`work-links: body-text`) and, if that parent carries a `## Cross-Spec Promises` section:

1. Checks whether any `open` row names this leaf as Owner. If so, this review's own diff is
   exactly the evidence needed — judge whether it satisfies the stated promise, update the row
   (`SATISFIED`, commit ref) or leave it open with a comment explaining what's still missing.
2. Checks whether this leaf's own work reveals a *new* forward assumption on another sibling not
   yet tracked (mirroring how the original catches were spotted mid-review, not anticipated at
   decomposition time). If so, add a row, post a seeding comment, and — when the assumption
   concerns a still-open sibling — add the corresponding `Blocked by #N: {assumption}` line to
   this leaf's own body, so both the existing dispatch gate and the `grant-check` follow-up below
   can see it.

This runs identically whether the record was dispatched as part of a live batch or picked up cold
by the routine dispatcher months later — the only gate is "does my parent carry a Promises
section," a fact decided once, at decomposition time.

## Relationship to Existing Mechanisms

**The ledger (`claude-tweaks:ledger`).** Structurally adjacent, not overlapping. Multi-spec
`/flow` runs already elevate some tracking to parent-run-directory scope (`multi-spec.md`'s
pre-flight-sweep baseline failures) — this design reuses that same "elevate to parent scope"
instinct, applied to different content and, per direction, made durable rather than deleted. But
the ledger has a hard invariant: *the pipeline cannot complete with an `open` item.* A promise is
supposed to still be open when its origin leaf's own pipeline phase ends — that's the entire
point, it names something not built yet. Fitting promises into the ledger would mean either
breaking that invariant or carving out a long-lived-item exemption, which is really a second
mechanism built inside the first without gaining anything. The content shape differs too: a ledger
item is a *finding* resolved to a terminal status (fixed/deferred/accepted/observation), where
"deferred" spins off a brand-new standalone record; a promise is a *relational claim between two
already-named sibling records* with no terminal state until the owner leaf lands. And
discoverability differs: a ledger file's identity (`docs/plans/YYYY-MM-DD-{feature}-ledger.md`)
requires knowing which historical run produced it; a promise on the parent issue is findable by
construction, since every leaf already links to its parent.

**Dispatch's existing `Blocked by #N` gate.** Completely unchanged (see Non-Goals). That gate
answers "is #N still open" — existence only. This design adds a content layer checked at two
distinct points: proactively, when the *owner* leaf's own review lands (Maintenance, above);
reactively, as a backstop, when a *dependent* leaf is about to be authorized and its assumption
concerns an already-closed sibling (the `grant-check` follow-up below) — for promises an earlier
review missed, or that predate this mechanism entirely.

**Rejected: an active, periodic cross-run scanning skill.** Considered and set aside. The evidence
supports "a promise can rot if nothing ever looks at it again" as a real risk, but not "an
automated system, independent of human review, needs to go looking for rot on a schedule." The
`/review`-time check above already covers the case with an actual owner (a leaf whose parent has a
tracked promise). The `grant-check` follow-up covers the case where that leaf gets triaged before
anyone's reviewed it. Between the two, every point where a human is already about to make a
judgment call on a record gets sharper information; no new autonomous surface is added.

## Coordination Note — `assess-agent-autonomy`'s `grant-check`

The originally-discussed integration point — `grant-check` reading a `Blocked by #N: {assumption}`
line, fetching #N's closing PR diff, and folding "does this still hold?" into its rationale — is
**not applied by this design.** `assess-agent-autonomy` moved from "unbuilt design doc" to "actively
being implemented" partway through this brainstorm: `main` now carries a full 8-task implementation
plan (`docs/superpowers/plans/2026-07-15-assess-agent-autonomy.md`) derived from that design doc,
and a locked worktree (`assess-agent-autonomy-impl`) is carrying the build forward. Editing the
design doc now would drift it out of sync with a plan already derived from its current content.

**Follow-up, to be applied once that implementation lands:**

- `grant-check`'s **Input** gains: for any `Blocked by #N: {assumption}` line in the record's body
  where #N is closed, that record's closing PR diff (`gh issue view #N --json
  closedByPullRequestsReferences` → `gh pr diff`).
- `grant-check`'s **Calibration examples** gain: a closed blocker whose actual delivered diff
  doesn't plausibly satisfy the stated assumption → name the mismatch explicitly in `RATIONALE`,
  even if scoring labels alone would recommend both grants. Non-binding — the human still decides.

## Doc fix — `ledger/SKILL.md`

The Anti-Patterns table's "Using the ledger for feature tracking" row currently points only at
`specs/INDEX.md` — which `wrap-up/cleanup-procedures.md` scopes to the **legacy spec-file-alias**
path (pre-unified-record-model specs with no materialized issue header; "Record mode: no-op...
`specs/INDEX.md` is never touched"). It has no equivalent pointer for the current Record/GitHub-issue
path. Add: for `work-backend: github-issues` records, cross-spec tracking belongs on the
decomposition's parent record (this design), not the ledger.

## Testing

- `parseDependencyAssumptions` — ordinary pure-function tests in the existing
  `bin/lib/issues/tests/record.test.js`, alongside `parseDependencies`' own: bare `Blocked by #N`
  (absent from the assumptions list), `Blocked by #N: text` (both captured), multiple lines,
  mid-line occurrences ignored (matching `DEP_RE`'s existing line-anchoring).
- The parent-issue register's maintenance logic isn't unit-testable in the traditional sense (LLM
  judgment reading diffs) — the worked example in Architecture anchors it, the same role
  `assess-agent-autonomy`'s own calibration examples play for its judgment calls.
- The `grant-check` follow-up's testing is owned by whoever applies it, once the in-flight
  implementation lands.

## Known Touch Points

- **New:** nothing structurally new — no new skill, no new file format, no new storage.
- **Modified:** `bin/lib/issues/record.js` (+ `bin/lib/issues/tests/record.test.js`);
  `skills/_shared/work-record.md` (document the assumption convention + `promise-register-min-leaves`
  config key); `skills/specify/SKILL.md` or its decomposition-mode sub-file (seeding); `skills/review/SKILL.md`
  (new per-record parent-promise check, not gated on whole-branch-review); `skills/ledger/SKILL.md`
  (Anti-Patterns table pointer fix, above).
- **Deferred, not applied here:** `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`'s
  `grant-check` section — see Coordination Note. Apply after the in-flight implementation lands;
  re-check this design's assumptions about `grant-check`'s shape against whatever actually shipped,
  since the design doc may have moved further by then too.
