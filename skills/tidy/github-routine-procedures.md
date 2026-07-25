# Tidy — GitHub Routine Procedures

Full detail for the four `--scope=github`-routine-firing subsections `SKILL.md`'s Step 6 summarizes and points here for: Evidence tier, Rolling digest, Notification, and Archival compaction. All four apply only inside the Standalone-auto path (`SKILL.md`'s "Standalone auto" paragraph) — an interactive invocation or a `/tidy` run embedded in a larger pipeline never reads any of this. The orchestrator reads this file directly when executing a Standalone-auto firing; it is not inlined into per-step scan-agent prompts the way `scan-procedures.md` is (these run in the orchestrating context after Steps 1-4.8 assemble, not inside a dispatched Task agent).

---

## Evidence tier (`--scope=github` routine firings only)

This subsection applies only inside the Standalone-auto path — an interactive invocation or a `/tidy` run embedded in a larger pipeline never reads `tidy-routine-autonomy` and never auto-mutates on evidence; those runs always route through the aggressiveness table exactly as documented there, unaffected by this flag's value.

When this Standalone-auto firing was invoked with `--scope=github` exactly (Step 4.8 ran and no other step did — not a full/unscoped sweep or a multi-scope combination that happens to include `github`), read `tidy-routine-autonomy` from CLAUDE.md (default `conservative`). Under `conservative`, nothing in this subsection applies — every GitHub-mutation finding routes through the table above exactly as always (all four "Stage — never auto-applied" rows stay staged).

Under `evidence-based`, before staging any of the following four finding shapes, check whether it carries the specific cite-able evidence listed. If it does, auto-apply the mutation instead of staging it, and log the evidence literally:

| Finding shape | Evidence required | Auto-applied action | Step that produces it |
|---|---|---|---|
| Unresolved review thread whose flagged file:line a later commit touches | The commit SHA that touches those lines | Resolve thread (GraphQL `resolveReviewThread`) | Step 4.8 |
| Parked record, `milestoneDueOn` is in the past | The due date itself | `gh issue edit {n} --remove-label parked`, then comment citing the due date | Step 1 — **currently unreachable on the shipped `tidy-github-triage` routine** (see Reachability note below) |
| Parked record, a `watchedPaths` entry has a matching commit in `git log` since the record was parked | The commit SHA `git log` returns | `gh issue edit {n} --remove-label parked`, then comment citing the commit SHA and touched path | Step 1 — **currently unreachable on the shipped `tidy-github-triage` routine** (see Reachability note below) |
| Code-health/harness-health/journey-health/docs-health issue whose flagged code is demonstrably removed or rewritten since filing (a diff shows the flagged lines gone or materially changed) | The diff reference (commit range or PR number) | `gh issue close {n} --reason "not planned"` after a comment citing the diff reference | Step 4.8 |

**Reachability:** the two Parked-record rows above require Step 1, which the shipped `tidy-github-triage` routine (`--scope=github` only) never runs — they stay documented as this tier's intended-but-currently-unreachable design until a routine variant also covers `backlog`.

These four are the only shapes this tier ever touches. Every other GitHub-mutation finding — stale-PR close-or-resume, PR-superseded-by-equivalent-work, a stale backlog record past 4 weeks (delete-or-promote), and any "still valid" code-health/harness-health/journey-health/docs-health assessment — is a judgment call per `_shared/github-pr-scan.md`'s own findings table and stays staged regardless of `tidy-routine-autonomy`. Note that removing the `parked` label is the entire mutation for the two Promote-evidence rows above — this tier never auto-runs `/claude-tweaks:specify`; the record simply becomes visible as a plain backlog record again, same as if a human had removed `parked` by hand.

Log entries follow the same format as the table above, e.g.:
```
AUTO 03:14:02 — Step 6 (evidence tier): resolved thread on PR #88 — commit a1b2c3d touches src/auth.ts:42-48 (the flagged lines). Reversibility: low (GitHub state; thread can be manually re-opened).
AUTO 03:14:09 — Step 6 (evidence tier): removed `parked` label from issue #142 — milestone "Q3 launch" due date 2026-08-01 has passed. Reversibility: med (label re-addable; commented with cited evidence).
```

## Rolling digest (`--scope=github` routine firings only)

Every Standalone-auto `--scope=github` firing updates one rolling digest artifact in place — never creates a new one per firing.

**Identity:**
- `work-backend: github-issues` (or any project with a reachable GitHub remote, regardless of which record-storage backend is active — this is about where the digest lives, not the record-storage choice): find the digest issue via a plain, strongly-consistent list — never `gh issue list --search`, which rides GitHub's eventually-consistent search index (this produced three separate duplicate digest issues in production before this fix — #1016, #1079, #1089) and, without an explicit `--limit`, can also silently paginate past the target issue on a busy repo. `specify/record-creation.md`'s Idempotency section documents and avoids this identical anti-pattern; this step now follows the same idiom:

  ````bash
  gh issue list --state open --json number,title,body,createdAt --limit 500 > /tmp/tidy-digest-issues.json

  node -e "
    const { findByMarker } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/dedup-lookup.js');
    const issues = require('/tmp/tidy-digest-issues.json');
    const result = findByMarker(issues, '<!-- tidy-digest-marker -->');
    require('fs').writeFileSync('/tmp/tidy-digest-lookup.json', JSON.stringify(result));
  "
  ````

  Read `/tmp/tidy-digest-lookup.json`:
  - `null` (first-ever firing, or the issue was manually closed): `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once.
  - `canonical` set: `gh issue edit {canonical.number} --body-file <file>`.
  - `duplicates` non-empty (however that happened — this is the hedge, not the expected path): before continuing, close every entry — `gh issue close {n} --reason "not planned"` with a comment `"Duplicate of #{canonical.number} — same <!-- tidy-digest-marker --> match, closing to restore the rolling-digest invariant of one issue per repo."` — then log one line per closed duplicate to this firing's `decisions.md`: `AUTO {time} — Step 6 (rolling digest): closed duplicate issue #{n} (marker match with canonical #{canonical.number}). Reversibility: low (GitHub state; issue can be manually re-opened).` This keeps the "one issue, always" invariant true even if a future firing's lookup ever fails in some way this fix didn't anticipate — the accumulation this bug originally caused stays bounded to one extra firing cycle instead of growing forever.
- `work-backend: local-files` with no reachable GitHub remote: rewrite `.claude-tweaks/tidy-digest.md` in place and commit it.

**Structure**, exactly four sections in this order:

```markdown
<!-- tidy-digest-marker -->
# Tidy GitHub-Triage Digest

Last updated: {ISO timestamp}

## Auto-applied

- {finding} — {action} — {timestamp}

## Auto-mutated with evidence

- {finding} — {action} — evidence: {literal evidence cited} — {timestamp}

## Still needs your review

- {finding} — {recommendation} — (still open as of {timestamp})

**Pending authorization:** {N} records awaiting a grant
- #{number}: {title}

**Blocked:** {N} records hit their retry ceiling
- #{number}: {title}

**Backlog:** {N} records with no stage label
- #{number}: {title}

## Pipeline Funnel

| Transition | Median | Sample size |
|---|---|---|
| Shaping latency (filed → ready) | {duration} | {N} |
| Grant latency (ready → authorized) | {duration} | {N} |
| Build latency (authorized → closed) | {duration} | {N} |

Retry rate: {rate}% ({failedAttempts}/{totalAttempts} across sampled records)

Wontfix rate by origin:
| Origin | Rate |
|---|---|
| {by:code-health, etc.} | {rate}% ({wontfix}/{total}) |
```

Each bucket's bullet list is one `- #{number}: {title}` line per entry in that bucket's list (`pendingList`/`blockedList`/`backlogList` from `github-pr-scan.md` item 8) — omit both the summary line and the bullet list together when a bucket's count is 0. No cap on list length: if a bucket holds 40 records, all 40 render.

Because Step 4.8 runs as a dispatched Task agent bound to the Output Contract's `[queue]` row (bare counts only, per `github-pr-scan.md`'s Output Contract section) — not the underlying `pendingList`/`blockedList`/`backlogList` arrays item 8's script computes internally — the digest-writing step sources these bullets by re-running item 8's query itself, directly, after Steps 1-4.8 complete (the orchestrator has its own `gh`/`node` access; this is not something any Step 4.8 subagent does). This is a second, cheap invocation of the same single `gh issue list --state open` query item 8 already runs once for the `[queue]` row's counts — not a change to the Output Contract shared by every other tidy scan step.

**Dedup (applies to the "Still needs your review" finding rows only — the other two sections are a fresh append per firing since they're already-resolved actions, and the three enumerated buckets below "Still needs your review" — Pending authorization/Blocked/Backlog — are regenerated fresh from a live query each firing, not appended-and-deduped, so a record dropping out between firings needs no removal step):** before adding a row, compute its key as `{PR or issue number}:{finding-type}` (e.g. `142:stale-pr`, `88:unresolved-thread`). Read the digest's current "Still needs your review" section and check for a row with a matching key (match on the PR/issue number and finding-type substring in the existing row text — both are always present in the rendered row). If found, update only that row's `(still open as of {timestamp})` suffix to the current firing's timestamp — do not add a second row, and do not mark this finding as new-this-firing (see the Notification subsection below, which fires only on new-this-firing findings). If not found, append a new row and mark it new-this-firing — this is either a genuinely new finding or one whose finding-type changed materially for the same number (e.g. a PR that was `Review` last firing is now `CI-red` — a different finding-type key, so a new row).

**Pipeline Funnel (regenerated fresh each firing, not appended-and-deduped — same treatment as the three enumerated buckets above, not the finding rows):** sample closed records from the last 90 days (bounds the `gh api` cost on a digest rewritten every firing) via `gh issue list --state closed --json number,labels,stateReason,createdAt,closedAt --search "closed:>{90-days-ago}"`. For each sampled record, fetch its labeled/unlabeled timeline events (`gh api repos/{owner}/{repo}/issues/{n}/timeline --jq '.[] | select(.event == "labeled" or .event == "unlabeled")'`) and its comments (for retry-rate input), then compute:

```bash
node -e "
  const { computeStageDurations, computeWontfixRate, summarizeFunnel } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/metrics.js');
  const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
  const sampled = require('/tmp/tidy-funnel-sample.json'); // [{createdAt, closedAt, events, labels, stateReason, comments}]
  const perIssueDurations = sampled.map((r) => computeStageDurations(r));
  const wontfixByOrigin = computeWontfixRate(sampled.map((r) => ({ labels: r.labels, stateReason: r.stateReason })));
  const failedAttempts = sampled.reduce((sum, r) => sum + countFailedAttempts(r.comments), 0);
  const totalAttempts = sampled.length;
  console.log(JSON.stringify(summarizeFunnel(perIssueDurations, wontfixByOrigin, { failedAttempts, totalAttempts })));
"
```

Render the `## Pipeline Funnel` section from the result — `medianMs`/`sampleSize` per transition into the table, `retryRate` into the retry-rate line, `wontfixByOrigin` into the wontfix table. **Omit the entire section** (not a table of zeroes or dashes) when the 90-day sample is empty — a new or low-volume project has nothing meaningful to report yet.

## Notification (`--scope=github` routine firings only)

After the digest is written, call `PushNotification` at most once per firing, and only when at least one row in "Still needs your review" was marked new-this-firing by the dedup step above (a genuinely new finding, or an existing finding whose finding-type materially changed) — not merely because the section is non-empty. A lingering, unresolved-but-unchanged finding that only got its `(still open as of {timestamp})` suffix bumped does NOT by itself trigger a fresh notification; per the design's own stated goal, dedup exists specifically to stop the same open finding from re-notifying every cycle, not just to stop it from appearing twice in one render. Compose the notification body from the new-this-firing findings specifically, e.g. `"{N} new items need your review — {top new finding title}. See the Tidy GitHub-Triage Digest."` (`{N}` here is the count of new-this-firing rows, not the section's total row count). Never fire when no row was marked new-this-firing (including an all-clear firing, or a firing where everything in the section is a carried-over timestamp bump) — this keeps the signal high-value; a routine firing every 3 hours that notified on every unresolved item would train the user to ignore it.

Note: the finding-type vocabulary this section keys on changed with this rename (`inbox`/`deferred`-era names → the new Shape names) — one firing right after migration re-notifies every still-open finding under its new key, since the old key no longer matches. Accepted as a one-time cost, not a bug.

## Archival compaction (every Standalone-auto firing, any scope)

Unlike the evidence tier, digest, and notification subsections above (which are `--scope=github`-specific), this compaction sweep runs on every Standalone-auto `/tidy` firing regardless of scope — it's about aging out prior standalone runs, not about this run's own findings.

Before writing this run's own report, scan `.claude-tweaks/pipelines/` for two kinds of aged-out run directories:

- **Standalone runs** (name matches `*-standalone`) whose ISO-timestamp prefix is more than 30 days old — compacted on age alone, same as always.
- **Abandoned non-standalone runs** — a `/flow`-orchestrated run directory (no `-standalone` suffix) whose ISO-timestamp prefix is more than 30 days old AND whose `run-state.json` status is not `active` (`interrupted`, or the file is missing/unreadable). This covers a run that stopped at an interactive HARD-GATE and was never resumed or wrapped up — it never reaches `/wrap-up`'s successful-closure archival, so without this rule it would sit on disk indefinitely with no cleanup path. The `status` check (absent from the standalone rule, which compacts on age alone) exists so a genuinely long-running, still-`active` pipeline is never swept purely for being old.

For each matched directory:

1. Read its `decisions.md`.
2. Append its content to `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (the month derived from the run's own timestamp, not today's date — a run compacted late still files under the month it actually ran), creating the file if absent. Prefix the appended block with the run's own directory name as a header so entries stay attributable.
3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` (same target `/wrap-up` uses for completed pipeline runs — see `wrap-up/cleanup-procedures.md` Section B).
4. Log one `AUTO` line to *this* firing's own `decisions.md`: `AUTO {time} — Archival: compacted {run-id} (age: {N} days) into index-{YYYY-MM}.md. Reversibility: high (archive is additive, nothing deleted).`

Skipped staged items inside a compacted run are preserved verbatim in the archive (not silently dropped) — same rule `/wrap-up`'s own archival already follows.
