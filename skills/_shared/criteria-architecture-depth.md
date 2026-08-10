# Criteria: Architecture Depth

Shared, criteria-only fragment — the "what is worth flagging" knowledge for architectural depth. No workflow, no auto-mode handling, no Next Actions. Consumed by `/claude-tweaks:deepen` (the reactive depth pass), `/claude-tweaks:code-health`'s architecture-depth judgment lens (Phase 2 subagents), and `/claude-tweaks:review`'s Architecture lens shallow-module check. One source of truth so a reactive review and a proactive sweep apply identical criteria.

## Depth = leverage, not line ratio

A **deep** module hides a lot of behavior behind a small interface. A **shallow** module has an interface nearly as complex as its implementation — the abstraction isn't earning its keep, and a caller would be no worse off inlining it.

Do **not** measure depth as a ratio of implementation lines to interface lines. That metric rewards padding the implementation to look deep, and it punishes genuinely simple-but-deep modules. Measure **leverage** instead:

> **Leverage = how much behavior a caller can exercise per unit of interface they must learn.**

A module is deep when callers (and their tests) get a lot of mileage from a tiny surface area. It is shallow when learning the interface costs nearly as much as reading the implementation would have. This is a behavioral judgment, not a line count — make it by reading the call sites, not by counting.

## The deletion test

For any module you suspect is shallow, ask:

> **Would deleting this module concentrate complexity, or just move it?**

- **Concentrates complexity** → the module was earning its keep. Inlining it would force every caller to relearn the hidden behavior. Keep it; it is deep enough. Not a candidate.
- **Just moves it** → the module is a pass-through. Its callers already carry the complexity; the module only adds a name and an indirection. **Shallow** — a candidate for collapsing into its caller or merging with a sibling.

The deletion test is the primary shallow-detector. Apply it before proposing any deepening — a "deepening opportunity" that fails the deletion test is really a "deletion opportunity," and you should say so.

## Two kinds of opportunity

| Opportunity | Signal | Move |
|-------------|--------|------|
| **Deepen** | A real abstraction exists but leaks — callers must know implementation details, pass redundant config, or sequence calls in a fixed order the module could own. | Widen what the module hides; shrink the interface. |
| **Collapse** | The deletion test says "just moves it" — a thin wrapper, a one-call pass-through, a module whose interface mirrors its single dependency. | Inline it, or merge it into a sibling so the surviving module gets deeper. |

Both increase average depth across the codebase. Report each as what it is — do not dress a collapse up as a deepening.

## Leverage ranking

Rank candidates by leverage gained per unit of churn, highest first:

1. **Callers affected** — how many call sites get simpler. More callers = more leverage.
2. **Interface shrink** — how much smaller the surface a caller must learn becomes (fewer params, fewer required call sequences, fewer leaked types).
3. **Blast radius** — how much code must change to do it. Lower is better; a high-leverage change with a small blast radius ranks above a high-leverage change that rewrites a subsystem.

## Dependency classification (testing the deepened module)

A deeper module is only safe to ship if it stays testable. When deepening, classify the module's dependencies — this determines the test approach:

| Class | Examples | Test approach |
|-------|----------|---------------|
| **Pure computation** | Parsing, formatting, calculation, pure transforms | Deepens trivially — test through the public interface with plain inputs/outputs. No stand-ins needed. |
| **Local stand-in** | Database, filesystem, cache | Deepens with an in-process stand-in running in the suite (e.g. PGLite for Postgres, in-memory FS). Test through the interface against the stand-in. |
| **Network boundary** | Third-party API, remote service, message bus | Define a **port** at the seam (a narrow interface the module owns) and inject the transport as an **adapter**. Test the module against a fake adapter; test the real adapter separately. This is ports-and-adapters at the granularity of one module. |

If a candidate's dependencies can't be classified into one of these — or deepening would force a network call into a previously pure module — flag that as a risk, because it raises the cost of the refactor.

## Controlled vocabulary

Use exactly these terms when proposing and discussing refactors. Consistent language keeps proposals comparable.

| Term | Meaning |
|------|---------|
| **module** | A unit with an interface and a hidden implementation. |
| **interface** | What a caller must learn to use the module. |
| **implementation** | What the module hides. |
| **depth** | Leverage — behavior exercised per unit of interface learned. |
| **seam** | A point where a dependency can be substituted (the boundary a port sits on). |
| **adapter** | The concrete transport behind a port. |
| **leverage** | The ranking quantity — see above. |

Do **not** drift into `component`, `service`, `API`, or `boundary` in proposals — they blur the distinctions above and make two proposals hard to compare. (`API` is fine when it literally means a network API; not as a synonym for "interface".)

## Cross-file calibration (duplicate abstractions)

The sections above judge one module's own depth. This section applies the same criterion across files, for `code-health`'s `focus=abstraction-police` candidate stream (`bin/lib/code-health/candidates-abstraction-police.js`): a cluster of near-identical exported helpers rebuilt in more than one file. The candidate generator's clustering is lexical/structural (signature shape + body token overlap) — it nominates, it does not decide. Judge each cluster the same way you would judge any depth finding, using the calibration below.

**Unify when the copies drift-fix independently.** The clearest signal a duplicated abstraction is a real depth problem: the same bug gets fixed in one copy and not the others, or a behavior change lands in one copy while its siblings silently keep the old behavior. This is the N-times-fixed-bug shape — every future fix has to remember to touch every copy, and the ones a fixer doesn't know about stay wrong. A cluster with any history of this shape (visible in the candidate's evidence, or inferable from how the copies differ) is a strong unify candidate.

**Do NOT unify when:**
- The similarity is coincidental shape sharing across genuinely different domains — two functions that happen to validate a similarly-shaped object for unrelated reasons are not the same abstraction merely because their parameter destructuring and control flow look alike. Read what each copy is *for*, not just what it does structurally.
- Unification would couple modules across a deliberate boundary — if the two files sit on opposite sides of an intentional seam (e.g. a plugin boundary, a client/server split, a public-API/internal-implementation line), merging them re-introduces the coupling the boundary exists to prevent. A little duplication is the price of that boundary, not a defect in it.
- One copy is about to be deleted anyway — a duplicate inside code already flagged for removal, or behind a flag being sunset, is not worth unifying; the unification would outlive the code it serves.

**Behavioral differences are part of the finding, not noise to reconcile silently.** Per IL-90 (N implementations agreeing is exactly when a shared bug reads as the spec), do not assume the copies are behaviorally identical just because they cluster on structure. When a cluster's members differ in any observable way — one validates a field the other skips, one throws where the other returns false — the unification finding must call that difference out explicitly and flag which copy looks like the bug, rather than silently picking one copy's behavior as canonical. A judge that unifies without surfacing the behavioral drift ships a silent regression into whichever copies didn't have it.
