# Depth Analysis — the method behind /claude-tweaks:deepen

Loaded by `/claude-tweaks:deepen` Steps 2-4. The **criteria** — the depth model (leverage, not line ratio), the deletion test, the two opportunity kinds, the leverage ranking, the dependency classification, and the controlled vocabulary — now live in one shared place: read `_shared/criteria-architecture-depth.md` (path relative to the skills root). This file covers only how `/deepen` *applies* those criteria across its steps.

## Applying the criteria across the steps

- **Step 2 (find shallow modules):** apply the deletion test and the leverage judgment from the criteria fragment to each in-scope module, classifying each suspected-shallow module as a **deepen** or a **collapse** opportunity.
- **Step 3 (rank and present):** order candidates by the leverage ranking (callers affected → interface shrink → blast radius). **Do not propose interfaces yet** — present *what* is shallow and *why*. Proposing concrete interfaces for every candidate up front is the runaway-rewrite this skill exists to prevent.
- **Step 4 (design the interface):** only for candidates the user picked, run the dependency classification from the criteria fragment to state how the deepened module will be tested (pure / local stand-in / network-boundary → port+adapter).
