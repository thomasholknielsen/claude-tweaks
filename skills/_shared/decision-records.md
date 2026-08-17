# Decision Records (ADRs)

Canonical contract for when and how the workflow captures an Architecture Decision Record. Referenced by `/claude-tweaks:wrap-up` (its Decision records curation row, `wrap-up/adr-curation.md`, writes ADRs for qualifying decisions). `/claude-tweaks:init` Phase 8.5 may flag `docs/decisions/` as a missing doc and backlog a pointer to this file's template (it never creates the folder or a file itself); the `docs/decisions/` folder is first created in practice when that curation row's first ADR file is written into it.

## Why this exists

Decisions made during build evaporate across sessions. The next session re-litigates "why Postgres for the write model?" from scratch. An ADR is the durable, human-facing record of *why* — distinct from `decisions.md` (the per-run auto-decision audit log) and from the spec (which records *what*, not the trade-off behind it).

The failure this guards against is the opposite of no records: **a repo with 200 ADRs is as useless as one with zero.** ADRs are valuable precisely because they are rare. The gate below keeps them rare.

## The gate: write an ADR only when ALL THREE hold

| Factor | Question | If false |
|--------|----------|----------|
| **Hard to reverse** | Would changing our mind later cost meaningful rework (data migration, API break, dependency swap)? | Skip — easily-reversed choices don't need a record. |
| **Surprising without context** | Will a future reader wonder "why did they do it *this* way?" | Skip — obvious choices are self-documenting. |
| **Result of a real trade-off** | Were there genuine alternatives, and did we pick one for specific reasons? | Skip — a forced or only-option choice has no trade-off to record. |

If **any** factor is missing, do **not** write an ADR. A choice that is easy to reverse, or obvious, or had no alternative is not an ADR — capture it (if at all) in the spec, a code comment, or CLAUDE.md.

**Anti-pattern:** logging routine implementation choices ("used a `for` loop", "named the file `utils.ts`") as ADRs. That noise buries the three or four decisions that actually mattered.

## Location and filename

```
docs/decisions/NNNN-{kebab-slug}.md
```

`NNNN` is a zero-padded sequence (`0001`, `0002`, …) — find the highest existing number under `docs/decisions/` and increment. Slug describes the decision, not the feature (`0007-soft-delete-accounts`, not `0007-accounts-feature`).

**This is the plugin's convention and the default everywhere.** It is not a claim about what any given repo already does. Before proposing a path, `/claude-tweaks:wrap-up`'s Decision records curation row runs `_shared/existing-convention-detection.md` against `docs/decisions/`: a repo whose existing decision records follow a different grammar gets the conflict surfaced once at the Review Console and the answer recorded in `doc-convention-adr`, rather than a seventeenth file in a seventeenth style. A repo with no decision records, or one already following this convention, never sees a prompt.

## Template

The literal ADR template lives in `skills/_shared/diataxis-genre-templates.md`'s ADR section — read that file for the current skeleton. This file owns the gate, location convention, and who-reads-who-writes contract above; the template body is shared with `/claude-tweaks:init`'s missing-doc scaffolding and `/claude-tweaks:wrap-up`'s missing-doc detection, so it lives in one place rather than three. That skeleton also owns the `Status` value and the supersede form; this file does not restate them.

## Who reads, who writes

| Skill | Role |
|-------|------|
| `/claude-tweaks:init` | Phase 8.5's missing-doc detection may flag `docs/decisions/` as a gap in the Tier-3 doc taxonomy and backlog a work record pointing at this file's template — it does not create the folder or file itself (`init/docs-structure.md`'s Registry Creation Procedure only ever creates `docs/REGISTRY.md`; see `wrap-up/docs-health-integration.md`'s D2 section). |
| `/claude-tweaks:deepen` | **Flags** candidates. Step 4 names each interface trade-off's cost/benefit; when a trade-off is genuinely hard-to-reverse, surprising, and a real choice (the same ADR gate below), it's tagged `[ADR-candidate]` for `/wrap-up` to pick up — does NOT write the file itself. |
| `/claude-tweaks:wrap-up` | **Applies the gate and writes.** Its Decision records curation row (`wrap-up/adr-curation.md`) collects decisions surfaced during build/review/reflection (plus any `[ADR-candidate]` from `/deepen`), runs the ADR gate, and proposes ADR creation. Proposed ADRs are routed through the Review Console like any other configuration update — never written silently. |

## Auto-mode

ADR creation is a **configuration-class change**, not a code change. It is routed through the Wrap-Up Review Console, in every mode, alongside doc and CLAUDE.md updates — `auto` may stage it, but the user approves the final set. Every staged ADR proposal logs one entry to `decisions.md` per `_shared/auto-decision-log.md`. Writing an ADR without surfacing it for approval is forbidden — see `_shared/auto-mode-contract.md`.
