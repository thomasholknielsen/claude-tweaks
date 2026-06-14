# Depth Analysis — the method behind /claude-tweaks:deepen

Loaded by `/claude-tweaks:deepen` Steps 2-4. Defines the depth model, the deletion test, the leverage ranking, and the dependency classification that decides how a deepened module gets tested.

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

Present the ranked list as numbered candidates. **Do not propose interfaces yet** — Step 3 presents *what* is shallow and *why*; the interface design happens in Step 4 only for the candidate(s) the user picks. Proposing concrete interfaces for every candidate up front is the runaway-rewrite failure this skill exists to prevent.

## Dependency classification (testing the deepened module)

A deeper module is only safe to ship if it stays testable. When you propose deepening, classify the module's dependencies — this determines the test approach and is part of the Step 4 interface conversation:

| Class | Examples | Test approach |
|-------|----------|---------------|
| **Pure computation** | Parsing, formatting, calculation, pure transforms | Deepens trivially — test through the public interface with plain inputs/outputs. No stand-ins needed. |
| **Local stand-in** | Database, filesystem, cache | Deepens with an in-process stand-in running in the suite (e.g. PGLite for Postgres, in-memory FS). Test through the interface against the stand-in. |
| **Network boundary** | Third-party API, remote service, message bus | Define a **port** at the seam (a narrow interface the module owns) and inject the transport as an **adapter**. Test the module against a fake adapter; test the real adapter separately. This is ports-and-adapters at the granularity of one module. |

If a candidate's dependencies can't be classified into one of these — or deepening would force a network call into a previously pure module — flag that as a risk in the candidate, because it raises the cost of the refactor.

## Controlled vocabulary

Use exactly these terms when proposing and discussing refactors. Consistent language is the point — it keeps the conversation precise and the proposals comparable.

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
