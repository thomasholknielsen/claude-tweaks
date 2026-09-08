## Tidy Report — 2026-09-06

Standalone-auto run. Policy: auto-mode default-on, autonomy unattended, tidy-aggressiveness moderate,
integration-model pr-first, worktree-always true, work-backend github-issues, work-links native.

**Environment note:** gh CLI is absent in this sandbox for the whole run. Issue-backed reads routed
through the GitHub MCP server (list_issues/issue_read/list_pull_requests/pull_request_read), which
usefully also covers get_sub_issues/get_check_runs/get_review_comments. Step 4.7 (issue-claims audit
trail on the claims-registry branch) has no MCP equivalent for repo-contents reads on a non-default
branch and was skipped entirely - flagged, not silently dropped. Step 4.8's Part D "last 30 days"
filter was unreliable: essentially all ~1095 closed issues carry a bulk-touched updated_at around
2026-09-02 (a metadata touch, not a real close date), so the acceptance-gap sweep below is drawn from
the ~200 highest-numbered closed issues as a recency proxy, not a verified 30-day window.

**Applied automatically**
```text
deleted      -     12 orphaned execution plans (docs/superpowers/plans/*)      commit 878939ad
deleted      -     1 orphaned ledger (2026-09-03-record-976-1012-1099-1431)    commit 878939ad
```
Pushed as PR #1968 (tidy-housekeeping-pr marker, base main). housekeeping-auto-merge: true +
moderate -> arm-now attempted (enable_pr_auto_merge); failed - PR mergeable_state unstable
(required checks not yet green). PR #1968 opened, NOT armed - checks pending. A future tidy run's
moderate+ "Arm ready PR" backstop will pick it up once green, or arm it by hand once checks pass.

**Approve (1)**
```text
1  [parent-gate]  #1702  Intake: the braindump gatekeeper - sort a mixed dump onto this repo's shelves
   Open parent gate - parent's 2 sub-issues (#1703, #1704) both closed, no demo:* label yet
   Post Verification Brief comment + demo:pending label on #1702, then recommend /claude-tweaks:demo #1702
```
Not executed this run - outward-facing GitHub write, staged at every tier per the auto-mode contract.

**Yours (11 groups)**

```text
demo (1)
   #1702  (see Approve above - /claude-tweaks:demo #1702 once the gate opens)
ledger review (2)
   1058-ledger    docs/plans/2026-08-28-record-1058-ledger.md - orphan pattern matches, but touched
                  within the last 2 days - manual review before deleting
   journey-crlf-parsing-ledger  correlates with pipelines/2026-09-05T202803-record-1787, one of the 3
                  unfinished runs this session flagged at startup that may still be live in a sibling
                  session - manual review before deleting
backlog refine (1)
   #666  permittedGrants contract phase - hit bot:blocked retry ceiling - outward GitHub write, never
         auto per reversibility floor
   /claude-tweaks:backlog refine
specify (2)
   #1235  reconcile/cache.js batching - too vague, no scoped AC yet - judgment call, no mechanical fix
   #1236  wrap-up engine-verify.js gh-call batching - too vague, no scoped AC yet - judgment call
   /claude-tweaks:specify #1235,#1236
review (1)
   PR #1959  Sweep's Next Actions buries the staged tidy --approve (#1822) - CI stuck pending, 0
             checks reported against the head SHA, 0 unresolved review threads - outward GitHub
             state, judgment call whether CI is misconfigured or just hasn't started
   Look at PR #1959's checks directly - investigate
impeccable (1)
   PRODUCT.md schema drift (route) - needs a real Impeccable command to resolve
   /impeccable:impeccable init
parked review (17)
   #44,#159,#193,#127,#137,#490,#491,#496,#794,#986,#279,#123,#126,#1611,#1597,#1705,#1477 - each
   carries a live trigger condition that needs a human read, not staleness - judgment call, no
   mechanical fix
   (read each record's Trigger line; no batch command - disposition varies per record)
harness-health (2)
   #1537  CLAUDE.md drift: Auto-Mode Contract + Bookend Architecture - still open, updated ~1 day ago
   #1774  Skill best-practice: skill-prose-conformance-tests - still open, updated <1 day ago
   outward GitHub write, never auto per reversibility floor - /claude-tweaks:backlog refine
docs-health (5)
   #1804,#1818,#1877,#1878,#1776  Doc staleness - all updated within the last 2 days, still open
   outward GitHub write, never auto per reversibility floor - /claude-tweaks:backlog refine
demo (acceptance-gap, 60+)
   #1904,#1870,#1861,#1860,#1802,#1773,#1772,#1714,#1713,#1700,#1688,#1687,#1633,#1520,#1433 (+45 more
   in the sampled ~200-issue range alone; true total across all ~1095 closed issues not enumerated -
   see environment note above) - closed with no acceptance disposition
   judgment call, no mechanical fix - recommend /claude-tweaks:demo against records as they're picked up
```

**Clean:**
```text
backlog-stale        99 checked, 0 stale (all <14 days old)
needs-scoring        67 ready records checked, 0 missing risk/size
legacy-labels        189 open issues checked, 0 carrying a retired label
digest container     #1426 - single container, no bootstrap-race
worktrees/branches   0 findings (residue scope repo; no build/* branches)
doc registry         31-line REGISTRY.md, every entry resolves, every docs/*.md covered
design docs          0 found (docs/superpowers/specs/*-design.md)
plans (non-orphan)   0 remaining after this run's deletes
ledgers (non-orphan) 9 checked, all Keep (open row or matching live pipeline run dir)
calibration          no telemetry yet (wrap-up-outcomes.tsv absent)
cross-spec patterns  no review-summary artifacts on disk (deleted at wrap-up); insufficient data -
                     velocity note: 205 wrap-up commits in the last 8 weeks, 16 open PRs (15 draft)
                     at scan time - very high concurrent build activity
code-health/journey-health issues  0 open on both labels
open PR triage       15 of 16 PRs are drafts (mid-build), no findings
issue-claims audit   skipped - no MCP path for claims-registry contents reads
```

Full decision log: .claude-tweaks/pipelines/2026-09-06T040551-tidy-standalone/decisions.md
