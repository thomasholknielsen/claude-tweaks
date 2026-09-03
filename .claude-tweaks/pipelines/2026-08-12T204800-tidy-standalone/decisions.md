# Tidy Decisions Log — 2026-08-12T204800-tidy-standalone

Full unscoped sweep, standalone auto mode (conservative aggressiveness). Report presented for
interactive batch approval before execution (per prior run's precedent — a human is present).

AUTO 20:55 — Step 3: deleted 2026-08-07-earned-autonomy-tier-design.md (all 4 phases shipped v6.50-v6.59) and 2026-08-06-impeccable-upstream-contract-design.md (all phases decomposed/specified). Commits bdb2f4f6, 6d51be8a, merged to main (76cb6442), pushed to origin. Reversibility: high (git revert).
AUTO 20:56 — Step 4.5: removed 2 checked-out worktrees (policy-read-path-design, demo-observation-plan-design) and deleted 4 merged local branches (worktree-autonomy-lanes-design, worktree-policy-read-path-design, worktree-demo-observation-plan-design, worktree-dispatch-autonomy-design). Commits f0eafbc4, fbddb975, e9991116, 76cb6442, merged to main, pushed to origin. Reversibility: high (branches recreatable from SHA, all commits reachable from main).

STAGED — Step 4.8 bug finding: skills/_shared/github-pr-scan.md, skills/tidy/step-1-records.md, skills/_shared/work-record.md still query the retired `family:parent` label instead of `parent-issue` (renamed today, specs #339-341). Breaks family-gate scope (always returns zero) and inflates acceptance-gap counts (every decomposed leaf falsely counts as a gap). Staged as a new backlog record proposal — staged/tidy-capture-1.md.
STAGED — Step 4.7: 4 stale claims (issue-179, -220, -221, -223, claimedAt 2026-08-09T15:22:50, TTL expired) with orphaned bot:in-progress labels — staged/tidy-claims-1.md. Never auto-released per contract.
STAGED — Step 4.7 (recurring, 2nd sighting): .claude-tweaks/pipelines/2026-07-20T000000-review-backlog-standalone — decisions.md absent on a clean run. Flagged in both 2026-08-11 and 2026-08-12 runs, still unresolved.
STAGED — Step 3: skill-bloat-reduction-design.md "Mark as specified" (recurring, 2nd sighting, still not applied) — staged/tidy-doc-1.md.
STAGED — Step 3: mechanical-vs-substantive-merge-judgment-design.md — status says "design approved, plan pending" but no derived specs — staged/tidy-doc-2.md.
STAGED — Step 1: 12 parked records (#41,#44,#72,#113,#123,#126,#127,#137,#159,#193,#279,#332) flagged by scan agent for manual review without live trigger evaluation; note 2026-08-11 run found zero parked items needing action on the same population — treat with skepticism, re-verify before acting.
STAGED — Step 5.5: 4 cross-spec patterns (stale enumeration/cardinality prose x6 specs, test-discrimination defects x3, comment/vocabulary drift x5, restated _shared/ conventions x3) — CLAUDE.md/code-health rule candidates — staged/tidy-patterns-1.md.
STAGED — Step 4.8 (carried over from 2026-08-11 run, still unresolved): family-gate due on #306, #293, #288, #284, #263 (verified directly since the scope itself is broken — see bug finding above).

NOT ACTED — Step 4.8: ~184 closed records (30d) with no acceptance disposition. Count unreliable — inflated by the family:parent/parent-issue label bug above. Never auto-applied regardless (contract).
NOT ACTED — Step 3 / Step 4: ~39 unspecified design docs, ~70 legacy docs/superpowers/plans/ files — consistent with 2026-08-11 run's non-action; IL-36/ADR-0007 concern these may be deliberate design-mode-build artifacts. Tracked by parked record #113.
NOT ACTED — Step 4.6: doc registry — healthy, no findings.
NOT ACTED — Step 4.9: doctor mode skipped silently (no design-integration field in CLAUDE.md).
NOT ACTED — Step 4.5: worktree flow-spec-348-349 — locked, actively in use. worktree-autonomy-console-headless-wrapup-design branch — unmerged, active work (specs 347-351).
NOT ACTED — Step 5: sizing review of 5 ready-unclaimed records (#348,#349,#350,#351,#337) — all appropriately sized, no findings.

AUTO 21:05 — Step 4.7 (post-report, user-approved): released stale claims on issues #179, #220, #221, #223 (blob state 'stale', claimedAt 2026-08-09T15:22:50 by run 2026-08-09T152032-dispatch-standalone, TTL 72h expired). Removed orphaned bot:in-progress label from all 4, posted release-marker comments. Reversibility: high (tombstone overwrite on claims-registry, non-destructive).
AUTO 21:10 — Step 4.8 (post-report, user-approved): filed backlog record #353 (Capture) for the family:parent/parent-issue stale label bug. Routed to brainstorm per user choice.

CORRECTION 21:20 — Issue #353 (the family:parent/parent-issue capture) was itself a false alarm caused by plugin-cache staleness: this session's installed claude-tweaks build was 6.76.0, but repo main is at 6.79.0. v6.79.0 (specs #339-341, merged earlier today) already fixed the dual-label query in _shared/github-pr-scan.md and step-1-records.md, AND renamed the finding prefix [family-gate] -> [parent-gate] repo-wide. Closed #353 as not-planned with a correcting comment. User will refresh the installed plugin outside this session before further /tidy-family work is trusted.

CAVEAT — this run's Step 4.8 [family-gate]/[acceptance-gap] findings (~184 acceptance-gap count, 0 family-gate found) are unreliable artifacts of the same staleness — do not act on them as reported. The 5 parent-gate-due records (#306, #293, #288, #284, #263) were independently verified via direct gh queries and remain accurate; re-run /claude-tweaks:tidy after the plugin refresh for a trustworthy full re-scan.

CORRECTION 21:35 — Step 4.5's re-scan agent reported a branch "worktree-wrapup-archive-348-349" (merged, spec 348-349 wrapped up) that does not exist — `git branch -d` failed "not found", `git branch --list` confirms it's absent. The actual related branch, worktree-autonomy-console-headless-wrapup-design, still carries 2 unmerged commits (7e25864c, fe6f2053) not on main — genuinely NOT mergeable, consistent with the earlier (correct) finding from this morning's first tidy run. No action taken — fabricated scan-agent finding, not executed. Row 1 of the corrected batch is void; nothing else in that batch depended on it.

STAGED 21:40 — Step 4.8: Open parent gate proposals for 6 due parents (#338,#306,#293,#288,#284,#263) — staged/tidy-parent-gate-1.md.
STAGED 21:40 — Step 1: 2 parked records with confirmed-met triggers (#113 promote, #332 re-evaluate) — staged/tidy-parked-2.md.
STAGED 21:40 — Step 5.5: 4 cross-spec patterns, 3rd sighting, elevated to high severity — staged/tidy-patterns-2.md.
STAGED 21:40 — Step 3: skill-bloat-reduction-design.md (mark as specified) and mechanical-vs-substantive-merge-judgment-design.md (status update), both 3rd sighting, still unresolved — recommend prioritizing.

NOT ACTED — Step 4.8: acceptance-gap corrected to 159 closed records (30d) without disposition — standing backlog, never auto-applied, informational only.
NOT ACTED — Step 4.8: harness-health #354 (policy.yml validation) already ready/auto:build-queued — no tidy action needed.
NOT ACTED — Step 3: ~41 unspecified design docs — consistent with prior runs' IL-36/ADR-0007 non-action.

AUTO 22:10 — Opened parent gate on all 6 due parents (#338, #306, #293, #288, #284, #263): composed and posted Verification Briefs (comment before label, per invariant), applied demo:pending. All re-verified fresh (OPEN, no acceptance label, every sub-issue closed) immediately before posting. None applies demo:approved/changes-requested — that stays /claude-tweaks:demo's job.
AUTO 22:15 — Investigated Step 5.5's 4 cross-spec patterns before acting: patterns 1 (cardinality) and 2 (test-discrimination defects) were already fixed today by commit 37ef6292 (refs #348) — a plan-authoring check added directly to skills/build/SKILL.md covering both. Patterns 3 (sweep grep misses variants) and 4 (_shared/ restatement) are already documented (IL-17, IL-21, IL-126 for #3; IL-93 + CLAUDE.md's Cross-references section for #4). No new Don'ts added — would have duplicated existing coverage. Reversibility: n/a (no-op, investigation only).
AUTO 22:20 — Step 3: marked skill-bloat-reduction-design.md as Specified (companion relationship-triage-verdicts.md confirmed as the executed pass) and mechanical-vs-substantive-merge-judgment-design.md as Resolved (grant-check Step 2's described self-contradiction verified absent from current skills/assess-agent-autonomy/SKILL.md). Commits 4766e83f, 173bc376, merged to main, pushed to origin. Reversibility: high (git revert).

SKIPPED (explicit user instruction) — Step 1: parked records #113, #332 with confirmed-met triggers — left staged/tidy-parked-2.md untouched, no action taken.

AUTO 22:30 — /claude-tweaks:demo sign-off on all 6 parent-gated issues, batch-approved per explicit user direction (overriding the skill's default one-at-a-time verdict flow). demo:pending -> demo:approved on each, all 6 closed --reason completed (parent issues, per Step 3's decomposition-parent close rule): #338, #306, #293, #288, #284, #263. Reversibility: high (label/state, git-native GitHub history retains everything).
