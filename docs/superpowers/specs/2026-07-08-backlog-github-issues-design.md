# Backlog on GitHub issues (INBOX/DEFERRED backend) — Design

## Problem

`specs/INBOX.md` and `specs/DEFERRED.md` are flat, append-only markdown files
that `/claude-tweaks:capture` and `/claude-tweaks:tidy` write to and triage.
At any real volume they stop being practical: no structured metadata beyond a
hand-written `**Category:**`/`**Added:**` line, no filtering or querying, no
visibility outside the repo (nothing a collaborator or a phone can glance
at), and append-only shared files cause diff noise/conflicts when multiple
sessions touch them concurrently.

The plugin already has substantial GitHub-issues-as-work-definition
infrastructure — `/claude-tweaks:code-health` files issues,
`/claude-tweaks:flow --from-code-health/--from-label/--from-issues` derives
specs from issues, `/claude-tweaks:specify` ingests a raw issue reference
directly, and `_shared/issue-claims.md` provides atomic cross-agent locking —
but none of it currently backs INBOX/DEFERRED. Separately, the plugin must
keep working in two harder environments: repos with no GitHub remote at all,
and GitHub Enterprise hosts (`_shared/github-pr-scan.md`'s Detection Ladder
currently gates on the remote literally containing the string `github.com`,
a false negative on any GHE host).

GitHub Projects was considered and explicitly dropped from this design after
zooming out on what it uniquely offers beyond issues + labels (see "Out of
scope" below) — the one genuinely unique win, cross-repo aggregation, doesn't
apply here since each repo claude-tweaks is installed in has its own
independent GitHub backend with no cross-repo board use case today.

## Solution

### Backend selection (CLAUDE.md flag)

New flag `backlog-backend: github-issues | local-files` under a
`## Backlog integration` section in CLAUDE.md — the same location and
mechanics as the existing `design-integration:`/`diagram-integration:`
flags (**not** `.claude-tweaks/policy.yml`: that file is read by
`bin/lib/policy.js`'s hardcoded no-YAML-dependency regex parser
specifically because hooks are plain Node processes with no LLM in the loop
to read CLAUDE.md prose — `worktree.always` needs that because a
`PreToolUse` hook enforces it. `backlog-backend` is read by skills during
ordinary LLM-driven execution, exactly like `design-integration`, so it
belongs in CLAUDE.md, not policy.yml). Set once by `/claude-tweaks:init`
(default recommendation: `github-issues` when a GitHub remote +
authenticated `gh` are detected at init time, else `local-files`), re-asked
by Update-Mode's existing drift pass if GitHub availability has changed
since (e.g. a local-only repo later pushed to GitHub, or vice versa) — the
same re-run/upgrade-path pattern `design-integration` already uses.

This is a **configured-backend-with-resilient-fallback** design (not pure
per-call detection, not a bare config with no safety net): the config picks
one consistent backend so there's never a split-brain between
issue-backed and file-backed entries for the same repo, but every write site
still keeps a lightweight fallback for the rare case the configured backend
is transiently unreachable (see "Resilient local fallback" below) — an entry
is never silently lost or silently misrouted.

### GitHub Enterprise detection fix

Replace `_shared/github-pr-scan.md`'s Detection Ladder check #1 (`git remote
get-url origin` contains `github.com`) with a real capability probe: confirm
a remote exists (any host), then run `gh repo view --json owner,name` as a
single check that replaces both the old string-match and the separate
"gh authenticated" check. `gh` itself resolves the host from the remote and
works transparently against GHE once authenticated for that host, so this
one check is host-agnostic by construction. This fix benefits every existing
consumer of the Detection Ladder pattern, not just this feature. Found while
researching for the implementation plan: `skills/init/bootstrap-steps.md`
Step 9 and Step 14 have the identical bug as two independent inline checks
(not routed through the Detection Ladder at all) — same root cause, same
fix, folded in alongside the Detection Ladder fix since it's mechanical,
not a new design decision.

### Labels

Rethought from first principles rather than porting the two-file split
1:1. Five labels, split by whether the concept is backlog-specific or
genuinely shared across every issue type this plugin manages:

**Backlog-specific:**
- `backlog` — presence filter, every issue originating from
  `/claude-tweaks:capture` or `/tidy`'s Defer action.
- `backlog:category-{product|technical|legal|infrastructure}` — same four
  values as today's INBOX `**Category:**` field, now a real label instead
  of unfilterable prose.
- `backlog:priority-{high|medium|low}` — **optional**, never set at
  capture (keeps `/capture` low-friction), only ever set/updated during
  `/tidy` triage with a pre-filled suggestion. Absence is a legitimate
  "unprioritized" state, not an error.

**Generic (no `backlog:` prefix, deliberately — see below):**
- `parked` — "evaluated and intentionally postponed." Replaces the earlier
  `deferred` stage label. There is **no `inbox` label at all**: an issue
  is "inbox" simply by being `backlog`-labeled, open, and lacking `parked`
  — inbox was never a state worth asserting, just the absence of one.
- `status:in-progress` — added when an issue-claim ref is acquired
  (`_shared/issue-claims.md`), removed when it's released. Lives in the
  shared claim protocol, not in this feature's code, so it applies to
  *every* claim consumer — code-health, harness-health, backlog-origin
  issues alike — not just this feature. Closes a real gap `issue-claims.md`
  already names: the claim ref is "invisible in the GitHub UI" today, for
  every issue type, not only backlog's. Implementing this generically costs
  *less* than scoping it to backlog only would (no source check needed —
  every claim gets the label, unconditionally) and gives every existing
  issue producer GitHub-UI-visible in-progress status as a free byproduct.

Category and priority stay backlog-specific rather than generic — code-health
already has its own non-overlapping axes (`code-health:<criterion>`,
evidence-graded severity) that would duplicate, not unify with, a generic
category/priority label.

**Trigger type is not a label at all.** Rather than a
`parked:until-touch`/`-schedule`/`-event` sub-taxonomy (an earlier draft of
this design), the trigger type is inferred directly from which structured
signal is present on the parked issue — nothing to keep in sync, nothing
that can drift from the data it describes:

- **A GitHub Milestone is attached** → revisit near/at that milestone. This
  is the answer to "I want to defer this to a moment in time, like before
  launch" — `/claude-tweaks:flow --from-milestone <m>` already exists and
  already pulls a milestone's open issues with zero new code. Mechanically:
  `gh issue edit --milestone "name"` attaches by name but requires the
  milestone to already exist — there is no `gh milestone` command group, so
  creating a new one goes through `gh api repos/{owner}/{repo}/milestones -f
  title="name"` directly (check existence first via `gh api
  repos/{owner}/{repo}/milestones --jq '.[].title'`).
- **A `**Watched paths:**` field is present in the body** → revisit when
  those paths are touched (git-log-checkable, no LLM read needed to know
  *whether* to look, only to judge what was found).
- **Neither** → prose-only `**Trigger:**` condition, LLM-judged every
  sweep — today's behavior, unchanged. All three of the real DEFERRED
  entries in this repo are this type, so this is the common case, not a
  fallback path that never runs.

All five labels are bootstrapped with real descriptions the same way
`/claude-tweaks:code-health` already does (check-if-exists,
create-with-description-if-not, before first use).

### Issue body templates

- **inbox-stage issue** — title = short entry title; body carries
  `**Related:**` + `Context:` + `Scope:` (Category moved to a label, no
  longer body prose), same ~5-line-cap philosophy as today's INBOX entries.
- **parked issue** — title = short entry title; body carries `**Origin:**`
  + `Context:` + `**Trigger:**` + `Options considered:` (near-direct lift
  from real DEFERRED.md entries), plus an optional `**Watched paths:**`
  field when the trigger type is touch-based. Milestone assignment is a
  GitHub-native attribute, not a body field.

Both templates are pure functions (`{title, body, labels}` in, no network),
living alongside `bin/lib/code-health/issue-payload.js` and
`bin/lib/issues/ingest.js` in `bin/lib/issues/backlog.js` — network calls
(the actual `gh issue create`) stay in the skill's shell steps, matching this
codebase's established emit-only pattern.

### `/claude-tweaks:capture` changes

Step 1 (`Append entry to specs/INBOX.md`) becomes: attempt `gh issue create
--label backlog --label backlog:category-<value>` with the templated body
(falling back per "Resilient local fallback" below); title/body built from
the same `$ARGUMENTS` parsing that exists today (`<idea text> [--route=...]
[--title=...]`). The routing prompt (challenge / brainstorm / keep-in-inbox
/ merge-into-spec-N) is unchanged in shape — "keep in inbox" now means
"leave the issue open, `backlog`-labeled, no `parked` label" (nothing to
add — that *is* the inbox state).

### `/claude-tweaks:tidy` changes

**Scan.** Fold one `gh issue list --label backlog --state open` query into
`_shared/github-pr-scan.md`'s `repo-wide` scope, alongside its existing
code-health/harness-health issue queries — one canonical GitHub-listing
procedure instead of a second parallel one. (One query, not two — client-side
split by presence/absence of `parked` gives the inbox/parked buckets,
instead of querying each stage separately.) When `backlog-backend:
local-files`, `specs/INBOX.md`/`specs/DEFERRED.md` are scanned exactly as
they are today (unchanged). When `backlog-backend: github-issues`, the
files are scanned too, but under a different rule: **any non-empty entry
found there is unsynced by definition** — see "Resilient local fallback"
below for why that single rule is enough, without needing to distinguish
how the entry got there.

**Triage actions**, mapped from today's Action Vocabulary table onto issue
mutations — this reuses a pattern `/tidy` already runs today for stale
code-health issues (`github-pr-scan.md`'s "Close (GitHub)" recommendation),
not a new capability:

| Action | Today (file-based) | New (issue-based) |
|---|---|---|
| Keep | no-op | no-op, issue stays open |
| Promote | remove from source, hand to brainstorm/specify | hand issue number to `/claude-tweaks:specify` directly (existing case-1 issue-ingestion path, unchanged) — see "Lifecycle labels" for the side-effect this now needs |
| Defer (inbox → parked) | move entry between files | add `parked`; if the trigger names a moment in time, attach a GitHub Milestone (create it first if it doesn't exist); if it names specific files, add `**Watched paths:**` to the body; otherwise leave the prose-only `**Trigger:**` as-is |
| Merge into spec N | remove from source | `gh issue close` + comment naming the target spec |
| Delete | remove from source | `gh issue close --reason "not planned"` + comment |
| **Sync to GitHub** (new) | n/a | create the issue now from the locally-stored entry, remove it from the local file on success |

### Lifecycle labels: `parked` and `status:in-progress`

Walking the full lifecycle surfaces a gap the table above doesn't cover on
its own: once `/claude-tweaks:specify` promotes a parked issue into a spec,
`parked` must be **removed** — otherwise `/tidy`'s backlog scan re-surfaces
the same item as still-parked on every pass while it's actively being
built. (Inbox-stage promotions need no such step — there was never a label
to remove.) But if that spec is later **declined at the Review Console or
abandoned at a failed gate** (both existing, already-modeled outcomes in
`_shared/issue-claims.md`'s release-triggers table), the issue would end up
unlabeled — invisible to the backlog scan, not closed either. That's the
exact "cross-file promise with no consumer" failure pattern this repo's own
CLAUDE.md warns against.

Fix — a new frontmatter field, `recon-was-parked: true`, joining the
existing `recon-issue:`/`recon-fingerprint:`/`code-health-effort:` set.
Simpler than an earlier draft's `recon-prior-label: inbox|deferred`: since
inbox has no label, there's only ever one thing to remember (was it parked,
yes or no), not which of two label values to restore. Milestone attachment
and any `**Watched paths:**` body content are never touched at promotion,
so there's nothing else to preserve or restore for them either.

| Stage | Label state | Where |
|---|---|---|
| Captured | `backlog` + category (+ optional priority); no `parked`, no `status:in-progress` — this **is** inbox | `/claude-tweaks:capture` |
| Triaged → parked | `parked` added; milestone/`Watched paths:`/prose trigger set per the table above | `/claude-tweaks:tidy` Defer action |
| Triaged → promoted | `parked` removed *iff present*; spec stamped `recon-was-parked: true` *iff it was* | `/claude-tweaks:specify`'s issue-ingestion step, and `/claude-tweaks:flow`'s batch equivalent in `flow/from-code-health.md` |
| Claim acquired (build starts) | `status:in-progress` added | the shared claim-acquisition step in `_shared/issue-claims.md`'s protocol (`flow/from-code-health.md` Step 2.5, and wherever the direct single-issue `/specify` path acquires its claim) — generic, applies to every claim consumer, not backlog-specific |
| Merged | issue closes via existing close-via-merge (`Fixes #N`) — terminal; `status:in-progress` moot | unchanged |
| **Declined / abandoned before merge** | `status:in-progress` removed; `parked` restored *iff* `recon-was-parked: true` | claim-release step, `wrap-up/cleanup-procedures.md` Section E — extended to check the release reason (`declined at review console` / `abandoned: spec {spec}`, not `merged:`/`pr-opened:`) and act. **Must land in both places this release logic is duplicated today** — the single-spec path and `flow/multispec-review-console.md`'s consolidated multi-spec path — or one silently drifts from the other. |
| Missed restoration (defense-in-depth) | flagged, not auto-fixed | `/claude-tweaks:tidy` Step 4.7's existing stale-claim sweep gets two backstop checks, same shape as its existing (already-open, in this repo's own DEFERRED.md) backstop for missed `agent:go` removal: (1) open issue, `recon-was-parked: true` on its spec, no `parked` label, no active claim, no linked open/merged PR → "likely missed `parked` restoration"; (2) `status:in-progress` present but no active claim ref → "likely missed `status:in-progress` removal" |

For any promoted issue that was never `parked` in the first place —
code-health-originated issues, inbox-stage promotions, or an arbitrary
human-filed issue promoted directly by number — `recon-was-parked` is
simply absent, and the restoration step is a no-op. Safe and additive: no
existing frontmatter field is touched, no existing promotion path changes
behavior. `status:in-progress`'s add/remove is likewise additive to the
claim protocol — existing claim consumers keep working exactly as before,
they just also become visible in the GitHub UI now.

### Resilient local fallback

`/claude-tweaks:capture` and `/tidy`'s Defer action always attempt the
configured `github-issues` backend first. On a write failure (GitHub
unreachable, `gh` broken, transient API error), they fall back to writing a
normal entry to the local file (`INBOX.md`/`DEFERRED.md`) — same format as
today, no special marker needed, because the scan rule established above
already treats *any* non-empty local-file content as unsynced once
`backlog-backend: github-issues`. `/tidy`'s scan surfaces this as
`[unsynced] N item(s) in INBOX.md/DEFERRED.md not yet mirrored to GitHub`
(same batch-table/apply-all-or-override UI `/tidy` already uses) until the
Sync to GitHub action resolves it. This fallback only activates when the
configured backend is `github-issues`; a repo configured for `local-files`
never touches it, and its scan behaves exactly as it does today.

### Existing content migration

When a repo's `backlog-backend` first switches to `github-issues` (at
`/claude-tweaks:init` or its Update-Mode drift pass), offer a one-time batch
migration: every current INBOX.md entry becomes an inbox-stage issue
(`backlog` + inferred category); every DEFERRED.md entry becomes a `parked`
issue, with trigger type judged the same way `/tidy`'s Defer action would
judge it live (names specific files → `Watched paths:`; names a moment in
time → offer to attach/create a milestone; otherwise prose-only) — through
the standard batch-table + apply-all/override UI, then the files are
cleared. Declining the offer leaves the files as-is — the same scan rule
above still surfaces every entry left behind as `[unsynced]` on the next
`/tidy` run, with the identical Sync to GitHub action, so a declined
migration behaves exactly like a transient-failure fallback write from the
scan's point of view. Nothing is silently dropped either way, and the two
paths need no separate handling.

### What's reused unchanged

`/claude-tweaks:specify`'s issue-ref ingestion (Resolve-the-input case 1),
`recon-issue:` frontmatter and the close-via-merge mechanism,
`/claude-tweaks:flow --from-label backlog` and `--from-milestone` (already
generic, zero new code — the milestone selector in particular is the entire
mechanism behind "defer to a moment in time"), and `/code-health`'s
label-bootstrap pattern. `_shared/issue-claims.md`'s ref-based locking is
reused with one small, deliberately generic addition (`status:in-progress`,
described above) that benefits every consumer of the protocol, not just
this feature. This design's actual new surface area is small: five labels,
two payload templates, one new frontmatter field, one Detection Ladder fix,
and the label-lifecycle edits listed above.

## Out of scope (YAGNI)

- **GitHub Projects.** Walked through explicitly during brainstorming: its
  one genuinely unique capability over issues+labels is cross-repo
  aggregation (a Project can span multiple repos; `gh issue list` can't).
  Confirmed no cross-repo use case exists today — each repo claude-tweaks
  installs into has its own independent GitHub backend. The remaining
  Projects capabilities (typed custom fields, built-in status automation,
  single-repo kanban) are largely redundant with what `/tidy` already does
  directly to issue labels/state, and priority/category now have a
  label-based home anyway. Revisit if a cross-repo need materializes, or if
  day-to-day use makes the visual-board gap acutely felt.
- **A `parked:until-*` trigger-type sub-label taxonomy.** Considered and
  dropped in favor of inferring trigger type from whichever structured
  signal (milestone / `Watched paths:` / neither) is actually present —
  a label asserting the trigger type could drift from the real data; an
  inferred value can't.
- **Genericizing `backlog:category-*`/`backlog:priority-*` beyond
  backlog-origin issues.** code-health already has its own non-overlapping
  criterion/severity axes; unifying would duplicate, not simplify.
- **Per-project configuration of label names.** The five labels above are
  fixed names, not configurable — no evidence of a need for that yet.
- **A renewal/heartbeat mechanism for unsynced local entries.** They're
  surfaced every `/tidy` run until resolved; no separate TTL/staleness model
  needed beyond that (unlike issue claims, which do need a TTL because
  they're a concurrency lock, not a to-do list).
- **New automation that reads `status:in-progress` programmatically**
  beyond the Step 4.7 consistency backstop already described above. The
  label's job is human GitHub-UI visibility; anything more is a separate
  future feature, not required for this one.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Backend selection strategy | Configured (CLAUDE.md flag) + resilient local fallback, not pure per-call detection and not a bare config with no safety net |
| Scope | Both INBOX and DEFERRED together (structurally similar, same four pain points) |
| Existing-content migration | One-time offered batch migration at backend switch-over, not mandatory, not silent |
| GitHub Projects | Dropped — no cross-repo use case, remaining value redundant with existing `/tidy` mechanics and the new label taxonomy |
| Inbox modeling | No `inbox` label — inbox is the absence of `parked` on an open `backlog`-labeled issue, not an asserted state |
| Trigger-type modeling | Inferred from structured signal (milestone / `Watched paths:` / prose), not a label — avoids a value that could drift from the data |
| "Defer to a moment in time" | Reuses GitHub's native Milestone field + the already-existing `/flow --from-milestone` selector, not a custom date field |
| `status:in-progress` scope | Implemented once, generically, in the shared `_shared/issue-claims.md` protocol — benefits every claim consumer (code-health, harness-health, backlog) for less code than scoping it to backlog alone would cost |
| Category/priority scope | Stay backlog-specific — code-health's criterion/severity axes already cover that need for code-health issues, non-overlapping |
| Promoted-issue label handling | `parked` removed at promotion (only if present), restored on decline/abandon via new `recon-was-parked: true` frontmatter — simpler than an earlier draft's two-value `recon-prior-label` since inbox never had a label to begin with |
| GHE fix | Replace `github.com` string-match with a real `gh repo view` capability probe |

## Testing / verification approach

1. **Pure logic, unit-tested (`node --test`).** Issue payload template
   builders (`bin/lib/issues/backlog.js`: inbox-stage and parked `{title,
   body, labels}` construction) and `recon-was-parked` extraction/
   application logic — all emit-only, no network, mirroring the existing
   `bin/lib/code-health/issue-payload.js` / `bin/lib/issues/ingest.js` test
   pattern.
2. **Detection Ladder fix.** Verified against this repo's real
   github.com remote (already authenticated) for the positive case; the
   negative case (no remote / no `gh` / no auth) is exercised the same way
   `github-pr-scan.md`'s existing fail-open tests already cover it. No live
   GHE host is available to test against directly — call this out
   explicitly in the PR rather than claiming full verification, same as the
   non-default-branch tracking design's precedent for an unverifiable-
   without-a-live-instance case.
3. **End-to-end, inbox path.** Exercise `/claude-tweaks:capture` → issue
   created with `backlog`+category labels → `/claude-tweaks:tidy` scan sees
   it (no `parked`) → Promote → `/claude-tweaks:specify` consumes it → no
   label removal needed, no `recon-was-parked` stamped, against this repo's
   real GitHub backend as part of implementation, not just unit tests.
4. **End-to-end, parked + restoration path.** Defer an item (confirm
   `parked` added, milestone/`Watched paths:` set correctly per trigger
   type) → Promote (confirm `parked` removed, `recon-was-parked: true`
   stamped) → decline the resulting spec at the Review Console → confirm
   `parked` reappears on the issue. This is exactly the path most likely to
   silently regress, since it's the one requiring the restoration step to
   actually fire.
5. **`status:in-progress` visibility.** Exercise a claim acquire/release
   cycle end-to-end and confirm the label appears and disappears on the
   issue (`gh issue view --json labels`) — this is new GitHub-UI-facing
   behavior with no prior test coverage to extend, so it needs its own
   explicit check.
