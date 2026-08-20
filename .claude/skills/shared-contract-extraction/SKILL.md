---
name: shared-contract-extraction
description: Use when extracting a cross-skill contract into a new `plugin/skills/_shared/*.md` file and migrating existing consumers to cite it — the consumer-list derivation, what each consumer keeps versus surrenders, the retirement sweep, and the conformance suite that pins the migration. Keywords - shared contract, `_shared`, extraction, consolidation, consumer migration, citation sweep, retired clause, conformance suite, IL-66, IL-70.
---

# Shared contract extraction

How this repo extracts a recurring cross-skill rule into a new `plugin/skills/_shared/*.md` contract and migrates its consumers to cite it instead of restating it. Recurs constantly (`git log --diff-filter=A -- 'plugin/skills/_shared/' 'skills/_shared/'` — both spellings, because this repo's history straddles the #418 payload move (ADR-0015); discount the cutover commit's own bulk add — shows ~25 additions over six months, several explicitly extraction/consolidation commits: `b91e704b`, `47ed1675`, `d937f35d`, `31df65dc`, `ce9dab9c`, `545cd4fd`, `c59f19f8`, `3a270ad4`, `ccd502b0`) but has had no procedural home — the accumulated failure knowledge is scattered across five project-memory entries with no recipe tying them together.

## The steps, in order

1. **Derive the consumer list before writing the contract.** Grep every spelling of the retired vocabulary **and its regex-escaped form**; leaf-only sub-files and test pins are what a shape-match sweep misses. Pair the single-line grep with a `grep -z` / `\s+` control scan — hard-wrapped prose splits a literal mid-command `[IL-66]`. Re-run the derivation after every upstream merge: a sibling branch can land a brand-new consumer file mid-run that no plan's file list could have named (the lesson `.claude/skills/work-record-facet-rename/SKILL.md` records at its "Re-run the vocabulary sweep after every upstream merge" gotcha).
2. **Decide per consumer: surrender, or keep and cite.** Not every consumer surrenders the same amount. Classify each into one of three shapes before editing anything — the split is what makes the conformance suite writable:
   - **retired a standalone clause** and now defers wholly to the new contract
   - **purely additive** — never had a clause of its own, gained only a citation
   - **outcome wording stays owned by the consumer** — the contract owns recognition, the consumer keeps what it *does* about it
3. **Check headroom before you add.** Measure `wc -c` on every file gaining a citation against the ~40 KB `_shared` sub-file ceiling before planning the additions — a byte-budget can be arithmetically unachievable, and thin headroom makes slimming a prerequisite, not a follow-up (`[IL-70]`; shipped instances that had to split a file mid-migration: `d937f35d`, `47ed1675`).
4. **Update the edges, once.** Every skill relationship is stated once in `docs/skill-graph.md` (CLAUDE.md's Cross-references rule). A new `_shared` file means adding its consumer edges there and adding nothing to any `SKILL.md`'s relationship prose.
5. **Pin the migration with a conformance suite.** Follow the `skill-prose-conformance-tests` skill. Write assertion families matching step 2's classes: contract anchors present, each consumer cites the contract, each retiring consumer no longer carries its retired clause — **each with a whitespace-collapsed control, absence assertions included.** Absence assertions fail open on a line-wrapped literal; presence assertions fail loud. Verify the suite can actually go red: revert one pinned element and re-run before finalizing.
6. **Prove the retirement, don't assert it.** Grep for *citations* of the retired rule — by name, path, and paraphrase — not just restatements of it; dead anchors survive text sweeps. Where a tombstone marker is required, state its scope in the spec — a same-line `grep -v` filter fails on adjacent-line and construct-intro tombstones. Before ruling "no consumer depends on the old behavior", grep repo-wide for the fixture-creation pattern — a per-suite spot check is not a sweep.

## Project conventions

- **The contract owns recognition and policy; consumers own outcomes.** Never let the extracted contract dictate what a consumer *does* about a condition it recognizes — only how it recognizes and classifies it. This is what keeps step 2's third class (outcome-wording-stays-owned) from collapsing into a restatement.
- **Cite, don't restate — including in the same author's own later prose.** A migration that gets the first N consumers right can still regress on the N+1th: two consumers in record #796's own migration restated burst-shape rules the same plan had written cite-only for the rest, caught only at final whole-branch review.

## Gotchas

- **A dormant forward reference may already name the future contract.** Check for commented-out or "pending #N" references to the contract file before assuming every consumer starts from zero.
- **The live label/edge may already exist from a reverted build** — verify current state before writing, never trust a spec's carrier list as fact in a multi-session repo.
- **Launcher commands and journeys carry the vocabulary too** — a citation swept into skill prose can leave a journey or a paste-ready command still naming the retired clause.
- **A later consumer added to an already-extracted contract still needs step 4's edge update — plus a sweep step 4 doesn't cover.** Step 4 ("update the edges, once") was written for a brand-new `_shared` file at extraction time. When an *existing* contract instead gains a consumer later — no extraction, just a new citation — also grep the contract file's own self-description ("sole consumer", "only X reads this", "no consumer yet") and update it alongside its `docs/skill-graph.md` row; both go stale the moment a second consumer lands, and the extraction-time step never runs again to catch it (record #194 caught two stale instances — `existing-convention-detection.md`'s own "Read by" line and `docs/skill-graph.md`'s row — only at final review).

## Anti-patterns

| Pattern | Why it fails here |
|---|---|
| Deriving the consumer list from the spec's file list alone | A sibling branch lands a new consumer mid-run; the list is a hypothesis, not a fact |
| One sweep grep, single-line, unescaped | Misses the escaped form, the mid-command wrap, and leaf-only sub-files `[IL-66]` |
| Adding the citation to every consumer uniformly | Conflates "retired a clause" with "purely additive"; the conformance suite then can't be written without lying about one class |
| Restating the new edge inside a `SKILL.md` | Two copies of an edge drift; `docs/skill-graph.md` is the single home |
| Asserting the retired clause is gone with a plain `includes()` | Fails open on a line wrap — the deletion is certified without being verified |

## Evidence

- Record #796 (`plugin/skills/_shared/github-rate-limit.md`, seven-plus consumer migration, `tests/github-rate-limit-conformance.test.js`) is the instance this skill was extracted from — including its own near-miss: the conformance suite initially paired the whitespace-spanning control scan with citation-presence assertions only, not retired-clause-absence assertions, caught by a reviewer's memory recall rather than written guidance. That gap is what step 5 above closes.
- Prior extraction/consolidation commits: `b91e704b`, `47ed1675`, `d937f35d` (IL-70 split), `31df65dc`, `ce9dab9c`, `545cd4fd`, `c59f19f8`, `3a270ad4`, `ccd502b0`.
