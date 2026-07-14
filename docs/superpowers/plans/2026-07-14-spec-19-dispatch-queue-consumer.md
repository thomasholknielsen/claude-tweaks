# Spec 19: /dispatch — the Queue Consumer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `skills/dispatch/SKILL.md`: `select → claim group → invoke /flow → settle`. Three selection forms (bare picklist / `next` / `#N`), group-claim-all, unconditional failure-downgrade, ceiling → `bot:blocked` + notify, the ported four-layer auto-merge gate. Dispatch's routine template replaces triage's. No drain mode.

**Architecture:** This is a **port with vocabulary translation**, not new design. Source: the pre-spec-18 triage file — `git show 80e9a5ecb8684db3d0aed2cf47ca492f63668751:skills/triage/SKILL.md` — whose `dispatch` mode carries the claims (Step 2), grouping (Step 2.5), capped-concurrent Task dispatch + output template + CLAIM_RUN_ID threading (Step 3), retry ceiling + failure-downgrade (Step 4), the four-layer auto-merge gate, and the Configuration table. Translation: `tier:approved|fast-track` → `auto:build` (+`auto:merge`), `status:*` → `bot:*`, spec-derivation loop DELETED (records are pre-shaped; a bundle is `/flow #A,#B` — no `/specify` call in the dispatch path).

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel`.
- Queue = open + `auto:build` + no `bot:*` + unclaimed (AC 1). Dispatch NEVER adds `auto:*` or `ready` — it only removes/downgrades (permission matrix hard line).
- Selection: bare → batch table of the authorized queue grouped by file overlap (rows are GROUPS) + one AskUserQuestion pick, up to `dispatch-pick-max-concurrent` (3) concurrent groups; `next` → ONE group by the literal ordering `priority:high > priority:medium > priority:low > unprioritized, oldest-first within each band; a group's rank = its highest-priority member`; `#N` → that record's WHOLE overlap group (claiming a member alone is forbidden — AC 3).
- Group claiming per `_shared/issue-claims.md`'s group-claim rule: ALL members before starting any; per-member 201/422 + four-row `claimStatus` fold; partial claim → release own, log, skip the group this firing. Group membership computes over UNCLAIMED records only (race note from the spec's Gotchas).
- Execution: one Task agent per group; agent invokes `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n}[,#{m}...]`; output template inlined VERBATIM per `_shared/subagent-output-contract.md` (port triage's status-line + GROUP/OUTCOME/MANIFEST template); worktree anchoring + `refs #N` (never `closes #N`) instructions in the agent prompt.
- Settle: success → nothing (wrap-up released the claim; close-via-merge closes the record). Failure → ownership check (`claim.runId === $RUN_ID`), release claim, **unconditionally revoke `auto:merge` if present** (AC 4: any failure permanently drops merge autonomy), count attempts via `retry.js`; at `dispatch-retry-ceiling` (3) → remove ALL `auto:*`, add `bot:blocked`, `PushNotification`; below ceiling → leave `auto:build` for a future firing.
- Auto-merge gate (only for groups holding `auto:merge`): port the four layers VERBATIM in mechanics — (1) grant present at dispatch time; (2) scoring eligibility; (3) runtime cleanliness (no review findings ≥ medium); (4) blast-radius caps `automerge-max-lines` (40) / `automerge-max-files` (2) — plus the branch-guarded `--no-ff` merge procedure incl. `close-run` and the conflict-abort-to-pending-review fallback.
- Config keys: `dispatch-retry-ceiling`, `automerge-max-lines`, `automerge-max-files`, `dispatch-pick-max-concurrent` read from CLAUDE.md/policy.yml; old `triage-*` keys accepted as legacy aliases with ONE note line.
- `drain` appears ONLY in a rationale note explaining why it doesn't exist (context rot — throughput = routine cadence × single-group firings) (AC 2).
- Reporting: per-firing output = one group's outcome; headless outcomes append to the rolling digest (cross-reference `/tidy`'s digest by name); pending-review parks (branch + run dir wait for a human). NO consolidated multi-group console.
- `$RUN_ID` = the standalone-auto run dir basename (dispatch is allowlisted per `_shared/pipeline-run-dir.md`); `PushNotification` only at ceiling + auto-merge FYIs (notification-fatigue rule).
- Standard skill structure (frontmatter with keywords, interaction directive byte-identical, lifecycle diagram, When to Use, Input, workflow, Next Actions, CSC, Anti-Patterns, Relationship — bidirectional with triage/flow/wrap-up/tidy/issue-claims/work-record).
- Migration note near the routine template: existing cloud routines created from triage's old template still fire `triage dispatch` — the user must re-create them via `/claude-tweaks:routine create dispatch` (cannot be checked from here; surfaced, not silently orphaned).
- No emojis; commit style.

---

### Task 1: Create `skills/dispatch/SKILL.md` (the port)

**Files:** Create `skills/dispatch/SKILL.md`

- [ ] Step 1: Extract the port source: `git show 80e9a5ecb8684db3d0aed2cf47ca492f63668751:skills/triage/SKILL.md > /tmp/triage-pre18.md`; read it fully (the dispatch mode sections are the source of truth for claims/grouping/execution/settle/auto-merge mechanics — port them, do not re-design them).
- [ ] Step 2: Write `skills/dispatch/SKILL.md` per the Global Constraints (translation applied; ~350-450 lines expected). The three selection forms are new framing AROUND the ported mechanics. Include the drain rationale note, the config table with legacy aliases, the migration note, and the four-layer gate verbatim-in-mechanics.
- [ ] Step 3: Verify (ACs 1-4, 6-partial):
```bash
grep -n "auto:build" skills/dispatch/SKILL.md | head -3            # queue definition present
grep -in "never adds \`auto:\|never grants\|only ever removes" skills/dispatch/SKILL.md | head -3
grep -in "drain" skills/dispatch/SKILL.md                           # rationale note only
grep -n "whole.*group\|entire group\|all members" skills/dispatch/SKILL.md | head -5   # AC 3
grep -in "any failure.*revoke\|unconditionally revoke\|permanently drops" skills/dispatch/SKILL.md | head -3   # AC 4
grep -n -- "--no-ff\|close-run\|automerge-max-lines" skills/dispatch/SKILL.md | head -6   # AC 6 gate ported
grep -n "tier:approved\|tier:fast-track\|status:in-progress\|status:blocked" skills/dispatch/SKILL.md   # 0
grep -n "CLAIM_RUN_ID" skills/dispatch/SKILL.md | head -3
```
- [ ] Step 4: Commit — `git add skills/dispatch/ && git commit -m "Add dispatch skill — queue consumer porting triage's dispatch mode onto grants"`

### Task 2: Routine template swap + shared-file updates

**Files:** Create `skills/dispatch/routine-template.yml`; DELETE `skills/triage/routine-template.yml`; Modify `skills/flow/multispec-review-console.md` (remove dispatch-consolidation duties; file survives for /flow's own runs); Modify `skills/_shared/pipeline-run-dir.md` (F12: allowlist entry + rationale rename triage→dispatch)

- [ ] Step 1: Read triage's routine-template.yml; create dispatch's (same shape; prompt `/claude-tweaks:dispatch next`; description/cadence prose translated); `git rm skills/triage/routine-template.yml`.
- [ ] Step 2: `multispec-review-console.md`: remove/replace prose assigning it dispatch-consolidation duties (grep `dispatch` there; the consolidated console remains for /flow multi-record runs; the claim-release/label steps it documents keep working for flow — only the "dispatch reuses this console" framing dies, replaced by dispatch's per-firing reporting note).
- [ ] Step 3: `pipeline-run-dir.md`: allowlist `/claude-tweaks:triage` → `/claude-tweaks:dispatch`; rewrite the stale rationale paragraph (dispatch runs unattended; always needs a standalone run dir).
- [ ] Step 4: Verify: `test -f skills/dispatch/routine-template.yml && ! test -f skills/triage/routine-template.yml && echo swap-ok`; `grep -n "dispatch next" skills/dispatch/routine-template.yml`; `grep -in "triage" skills/_shared/pipeline-run-dir.md` (only legitimate mentions); `grep -in "dispatch" skills/flow/multispec-review-console.md | head -5` (no consolidation duties).
- [ ] Step 5: Commit — `Swap routine template to dispatch and update shared-file pointers — F12 allowlist rename`

### Task 3: Spec-19 acceptance sweep

- [ ] Step 1: ACs 1-7: re-run Task-1 greps; `grep -n "auto-merge\|fast-track" skills/triage/SKILL.md` → 0 workflow matches (AC 6); `npm test` tail (AC 7); structure check (all standard sections present in dispatch SKILL.md); Relationship bidirectionality spot-check (triage's Next Actions/Relationship already forward-reference /dispatch — confirm the reverse rows exist).
- [ ] Step 2: Fix findings (spec-19 files only), re-run until clean. Commit only if fixes: `Fix spec-19 acceptance sweep findings`
