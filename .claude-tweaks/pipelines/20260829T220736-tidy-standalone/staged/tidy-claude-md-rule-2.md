# Staged: CLAUDE.md rule — budget _shared byte ceiling before extending a contract

Invariant: extending an existing `_shared/*.md` contract to a new consumer keeps hitting that
file's 40,960 B ceiling because headroom isn't measured before writing — recurred 3 times
(#1275→#1274→#1391), plus the same root cause in review findings for #1263/#1264 and a /review
fix-wave that tripped the ceiling test on PR #1448 after already reporting PASS.

Proposed docs/donts.md addition — this already exists as "Hard-ceiling headroom check before
adding" per user memory; this pattern confirms it needs a stronger check, not a new rule. Proposed
change: promote it from a Don't-list entry to a mechanical pre-flight step in
`shared-contract-extraction` skill/reference — measure `wc -c` on the target file and report
headroom BEFORE drafting the extension, not after writing it and discovering the overrun.

Source: .claude-tweaks/pipelines/archive/2026-08-25T060310-spec-1391/staged/reflect-3.md;
review-summary-1263.md Key Learning 4; review-summary-1264.md Key Learning 2.
