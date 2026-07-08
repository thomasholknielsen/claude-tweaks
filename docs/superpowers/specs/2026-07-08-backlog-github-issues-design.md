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

### Backend selection (`.claude-tweaks/policy.yml`)

New key `backlog-backend: github-issues | local-files`, same pattern as the
existing `design-integration:`/`diagram-integration:` flags. Set once by
`/claude-tweaks:init` (default recommendation: `github-issues` when a GitHub
remote + authenticated `gh` are detected at init time, else `local-files`),
re-asked by Update-Mode's existing drift pass if GitHub availability has
changed since (e.g. a local-only repo later pushed to GitHub, or vice versa).

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
consumer of the Detection Ladder pattern, not just this feature.

### Labels

Two new bare labels — `inbox`, `deferred` — matching this codebase's
existing convention (`code-health`, `harness-health`, `agent:go` are all
bare, no `claude-tweaks:` prefix). Bootstrapped with real descriptions the
same way `/claude-tweaks:code-health` already does (check-if-exists,
create-with-description-if-not, before first use). Mutually exclusive: an
issue carries at most one of the two, reflecting which stage of the backlog
it's in.

### Issue body templates

Same fields as today's markdown entries, as issue body sections instead of
a `##` block:

- **inbox issue** — title = short entry title; body carries
  `**Category:**` / `**Related:**` + `Context:` + `Scope:`, same ~5-line-cap
  philosophy as today's INBOX entries (labels now carry the
  machine-filterable metadata that free-text `**Category:**` used to
  approximate).
- **deferred issue** — title = short entry title; body carries
  `**Origin:**` + `Context:` + `**Trigger:**` + `Options considered:` — a
  near-direct lift, since real DEFERRED.md entries already read almost
  exactly like this.

Both templates are pure functions (`{title, body, labels}` in, no network),
living alongside `bin/lib/code-health/issue-payload.js` and
`bin/lib/issues/ingest.js` in `bin/lib/issues/backlog.js` — network calls
(the actual `gh issue create`) stay in the skill's shell steps, matching this
codebase's established emit-only pattern.

### `/claude-tweaks:capture` changes

Step 1 (`Append entry to specs/INBOX.md`) becomes: attempt `gh issue create
--label inbox` with the templated body (falling back per "Resilient local
fallback" below); title/body built from the same `$ARGUMENTS` parsing that
exists today (`<idea text> [--route=...] [--title=...]`). The routing prompt
(challenge / brainstorm / keep-in-inbox / merge-into-spec-N) is unchanged in
shape — "keep in inbox" now means "leave the issue open, labeled `inbox`."

### `/claude-tweaks:tidy` changes

**Scan.** Fold two more `gh issue list --label` queries (`inbox`,
`deferred`, both `--state open`) into `_shared/github-pr-scan.md`'s
`repo-wide` scope, alongside its existing code-health/harness-health issue
queries — one canonical GitHub-listing procedure instead of a second
parallel one. When `backlog-backend: local-files`, `specs/INBOX.md`/
`specs/DEFERRED.md` are scanned exactly as they are today (unchanged). When
`backlog-backend: github-issues`, the files are scanned too, but under a
different rule: **any non-empty entry found there is unsynced by
definition** — see "Resilient local fallback" below for why that single
rule is enough, without needing to distinguish how the entry got there.

**Triage actions**, mapped from today's Action Vocabulary table onto issue
mutations — this reuses a pattern `/tidy` already runs today for stale
code-health issues (`github-pr-scan.md`'s "Close (GitHub)" recommendation),
not a new capability:

| Action | Today (file-based) | New (issue-based) |
|---|---|---|
| Keep | no-op | no-op, issue stays open |
| Promote | remove from source, hand to brainstorm/specify | hand issue number to `/claude-tweaks:specify` directly (existing case-1 issue-ingestion path, unchanged) — see "Cradle-to-grave label lifecycle" for the label side-effect this now needs |
| Defer (inbox → deferred) | move entry between files | swap `inbox` label for `deferred`, add trigger condition as a body edit/comment |
| Merge into spec N | remove from source | `gh issue close` + comment naming the target spec |
| Delete | remove from source | `gh issue close --reason "not planned"` + comment |
| **Sync to GitHub** (new) | n/a | create the issue now from the locally-stored entry, remove it from the local file on success |

### Cradle-to-grave label lifecycle

Walking the full lifecycle surfaces a gap the table above doesn't cover on
its own: once `/claude-tweaks:specify` promotes an inbox/deferred issue into
a spec, the `inbox`/`deferred` label must be **removed** — otherwise
`/tidy`'s backlog scan re-surfaces the same item as "untriaged" on every
pass while it's actively being built. But if that spec is later **declined
at the Review Console or abandoned at a failed gate** (both existing,
already-modeled outcomes in `_shared/issue-claims.md`'s release-triggers
table), the issue would end up with no label at all — invisible to both the
backlog scan and in-progress tracking, and not closed either. That's the
exact "cross-file promise with no consumer" failure pattern this repo's own
CLAUDE.md warns against.

Fix — a new frontmatter field, `recon-prior-label: inbox | deferred`,
joining the existing `recon-issue:`/`recon-fingerprint:`/`code-health-effort:`
set:

| Stage | Label state | Where |
|---|---|---|
| Captured | `inbox` added | `/claude-tweaks:capture` |
| Triaged → parked | `inbox` → `deferred` | `/claude-tweaks:tidy` Defer action |
| Triaged → promoted | label **removed**; spec stamped with `recon-prior-label: inbox\|deferred` | `/claude-tweaks:specify`'s issue-ingestion step, and `/claude-tweaks:flow`'s batch equivalent in `flow/from-code-health.md` |
| Merged | issue closes via existing close-via-merge (`Fixes #N`) — terminal | unchanged |
| **Declined / abandoned before merge** | prior label **restored** from `recon-prior-label:` | claim-release step, `wrap-up/cleanup-procedures.md` Section E — extended to check the release reason (`declined at review console` / `abandoned: spec {spec}`, not `merged:`/`pr-opened:`) and restore the label. **Must land in both places this release logic is duplicated today** — the single-spec path and `flow/multispec-review-console.md`'s consolidated multi-spec path — or one silently drifts from the other. |
| Missed restoration (defense-in-depth) | flagged, not auto-fixed | `/claude-tweaks:tidy` Step 4.7's existing stale-claim sweep gets a backstop check: open issue, no `inbox`/`deferred` label, no active claim, no linked open/merged PR → "likely missed label restoration," same shape as the sweep's existing (already-open, in this repo's own DEFERRED.md) backstop for missed `agent:go` removal |

For any promoted issue that never carried `inbox`/`deferred` in the first
place — code-health-originated issues, or an arbitrary human-filed issue
promoted directly by number — `recon-prior-label` is simply absent, and the
restoration step is a no-op. Safe and additive: no existing frontmatter
field is touched, no existing promotion path changes behavior.

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
migration: every current `INBOX.md`/`DEFERRED.md` entry becomes an issue via
the templates above, through the standard batch-table + apply-all/override
UI, then the files are cleared. Declining the offer leaves the files as-is —
the same scan rule above still surfaces every entry left behind as
`[unsynced]` on the next `/tidy` run, with the identical Sync to GitHub
action, so a declined migration behaves exactly like a transient-failure
fallback write from the scan's point of view. Nothing is silently dropped
either way, and the two paths need no separate handling.

### What's reused unchanged

`/claude-tweaks:specify`'s issue-ref ingestion (Resolve-the-input case 1),
`recon-issue:` frontmatter and the close-via-merge mechanism,
`_shared/issue-claims.md`'s ref-based locking, `/claude-tweaks:flow
--from-label inbox`/`--from-label deferred` (already generic, zero new
code), and `/code-health`'s label-bootstrap pattern. This design's actual
new surface area is small: two labels, two payload templates, one new
frontmatter field, one Detection Ladder fix, and the label-lifecycle edits
listed above.

## Out of scope (YAGNI)

- **GitHub Projects.** Walked through explicitly during brainstorming: its
  one genuinely unique capability over issues+labels is cross-repo
  aggregation (a Project can span multiple repos; `gh issue list` can't).
  Confirmed no cross-repo use case exists today — each repo claude-tweaks
  installs into has its own independent GitHub backend. The remaining
  Projects capabilities (typed custom fields, built-in status automation,
  single-repo kanban) are largely redundant with what `/tidy` already does
  directly to issue labels/state. Revisit if a cross-repo need materializes,
  or if day-to-day use makes the visual-board gap acutely felt.
- **Per-project configuration of label names.** `inbox`/`deferred` are fixed
  names, not configurable — no evidence of a need for that yet.
- **A renewal/heartbeat mechanism for unsynced local entries.** They're
  surfaced every `/tidy` run until resolved; no separate TTL/staleness model
  needed beyond that (unlike issue claims, which do need a TTL because
  they're a concurrency lock, not a to-do list).
- **Migrating `code-health`/`harness-health`-filed issues into this label
  scheme.** They have their own severity/criterion label taxonomy already
  wired into `/flow`'s selectors; no reason to touch it.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Backend selection strategy | Configured (`policy.yml`) + resilient local fallback, not pure per-call detection and not a bare config with no safety net |
| Scope | Both INBOX and DEFERRED together (structurally similar, same four pain points) |
| Existing-content migration | One-time offered batch migration at backend switch-over, not mandatory, not silent |
| GitHub Projects | Dropped — no cross-repo use case, remaining value redundant with existing `/tidy` mechanics |
| Label naming | Bare `inbox`/`deferred`, matching existing bare-label convention (`code-health`, `agent:go`) |
| Promoted-issue label handling | Removed at promotion, restored on decline/abandon via new `recon-prior-label:` frontmatter — closes an orphaned-issue gap the initial design missed |
| GHE fix | Replace `github.com` string-match with a real `gh repo view` capability probe |

## Testing / verification approach

1. **Pure logic, unit-tested (`node --test`).** Issue payload template
   builders (`bin/lib/issues/backlog.js`: inbox/deferred `{title, body,
   labels}` construction) and `recon-prior-label` extraction/application
   logic — all emit-only, no network, mirroring the existing
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
3. **End-to-end.** Exercise `/claude-tweaks:capture` → issue created →
   `/claude-tweaks:tidy` scan sees it → Promote → `/claude-tweaks:specify`
   consumes it → label removed, `recon-prior-label` stamped, against this
   repo's real GitHub backend (already `gh`-authenticated) as part of
   implementation, not just unit tests.
4. **Decline/abandon path.** Explicitly exercise the restoration branch —
   promote an inbox item, decline the resulting spec at the Review Console,
   confirm the `inbox` label reappears on the issue — since this is exactly
   the path most likely to silently regress.
