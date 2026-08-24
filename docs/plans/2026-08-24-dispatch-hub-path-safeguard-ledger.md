# Open Items — record #1365 (dispatch: hub-path safeguard in file-overlap grouping)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/hindsight | Design-tradeoff observation: hub-path exclusion in groupByFileOverlap is default-on for all five consumer surfaces (dispatch grouping, ranking computeOverlapSet, /help dashboard conflicts, /specify creation-time conflicts, multispec conflict detection), so conflict-detection surfaces now warn less when 3+ records share a generic path; plan only considered preflight-records.js/ranking.js call sites — staged/reflect-1.md | deferred | Staged as pattern observation for the Wrap-Up Review Console (auto mode); suppressed warnings are the same hub noise #1365 names, so consistent behavior is plausibly an improvement, but the tradeoff deserves the console's eyes |
