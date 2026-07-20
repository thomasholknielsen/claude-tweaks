# Decision Records (ADRs) — the 3-factor gate

Canonical contract for when and how the workflow captures an Architecture Decision Record. Referenced by `/claude-tweaks:wrap-up` (Step 6.3, writes ADRs for qualifying decisions) and `/claude-tweaks:challenge` (flags ADR candidates in the brief). The folder taxonomy (`docs/decisions/`) is created by `/claude-tweaks:init` Phase 8.5.

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

## Template

The literal ADR template lives in `skills/_shared/diataxis-genre-templates.md`'s ADR section — read that file for the current skeleton. This file owns the gate, location convention, and who-reads-who-writes contract above; the template body is shared with `/claude-tweaks:init`'s missing-doc scaffolding and `/claude-tweaks:wrap-up`'s missing-doc detection, so it lives in one place rather than three.

`Status` is `accepted` for a decision being recorded after the fact. If a later ADR overturns this one, change this file's status to `superseded by NNNN` rather than deleting it — the trail is the value.

## Who reads, who writes

| Skill | Role |
|-------|------|
| `/claude-tweaks:init` | Creates the `docs/decisions/` folder in the Tier-3 doc taxonomy (Phase 8.5). |
| `/claude-tweaks:challenge` | **Flags** candidates. When a framing decision in the brief passes the 3-factor gate, tag it `[ADR-candidate]` in "Constraints to Carry Forward" — but does NOT write the file (the decision isn't final pre-brainstorm). |
| `/claude-tweaks:deepen` | **Flags** candidates. Interface trade-offs surfaced during an architectural-depth pass are tagged `[ADR-candidate]` — same flag-only contract as `/challenge`, does NOT write the file. |
| `/claude-tweaks:wrap-up` | **Applies the gate and writes.** Step 6.3 collects decisions surfaced during build/review/reflection (plus any `[ADR-candidate]` from the brief and from `/deepen`), runs the 3-factor gate, and proposes ADR creation. Proposed ADRs are routed through the Step 9 batch table / Review Console like any other configuration update — never written silently. |

## Auto-mode

ADR creation is a **configuration-class change**, not a code change. It is routed through the Wrap-Up Review Console (or the Step 9 batch decision in interactive mode) alongside doc and CLAUDE.md updates — `auto` may stage it, but the user approves the final set. Every staged ADR proposal logs one entry to `decisions.md` per `_shared/auto-decision-log.md`. Writing an ADR without surfacing it for approval is forbidden — see `_shared/auto-mode-contract.md`.
