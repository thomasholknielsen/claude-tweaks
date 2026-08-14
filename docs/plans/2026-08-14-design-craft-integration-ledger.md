# Open Items — Design craft integration (records 383, 384, 385, 387)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Skill-graph consumer rows for `_shared/design-craft.md` assert wiring in present tense ahead of #384/#385 landing (spec 383 reviewer finding) | accepted | Same-branch multi-spec run: #384/#385 land on this branch before the single end-of-run merge, and the siblings' Non-Goals forbid restating edges — the rows were #383's deliverable by decomposition design; #386's explore edge already carries a pending marker |
| 2 | review | `visual-html-output.md` described the v3-era sibling `DESIGN.json` sidecar; pinned upstream 4.0.2 uses `.impeccable/design.json` (pre-existing drift, surfaced by spec 383 review) | fixed | Updated to the 4.x root path with pre-4.x sibling fallback — `4af52240` |
| 3 | review | `_shared/design-craft.md` names `visual-html-output.md`'s three-path lookup for `DESIGN.md` while `pre-build` Step 4 keeps its own canonical-paths+fallback-glob procedure — latent contract/consumer divergence, pre-existing shape (spec 384 reviewer note) | observation | Same three roots in both; pre-build's extra `docs/design/*.md` glob is a superset. Informational — no behavior conflict today |
