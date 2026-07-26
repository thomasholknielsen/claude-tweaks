---
record: 54
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
fingerprint: wrap-up-drift-prevention:skill-curation-hardening
surface: backend
---
# 54: Wrap-up: harden skill curation (Step 7) — null-result logging, broadened gap detection, fold-into-existing branch

Surface: backend

## Current State

`/claude-tweaks:wrap-up`'s Step 7 (Skill Curation, `skills/wrap-up/skill-curation.md`) already generates skill-update candidates independently from the work — an independent domain-overlap scan (7.2) plus gap detection (7.3-7.5) that runs even with zero ledger/reflect seeds. But a real-data audit of 23 `decisions.md` audit logs across ~30 wrap-up executions found exactly one real skill update produced via this pipeline (seeded by a reflect finding, not Step 7's own scan) and one correctly-declined new-skill candidate — the other ~28 executions logged nothing about Step 7 at all, because a "no updates needed" outcome writes **nothing** to the audit log today (only `AUTO`/`STAGED`/`KEPT-PROMPT` entries get logged). There's no record of what was scanned or how deep the ranking went, so the claim "nothing needed updating" is currently unfalsifiable.

Separately, `_shared/harness-health-analysis.md` Step 3 (New-Skill Gap Detection — shared by wrap-up Step 7, standalone `/harness-health`, and `/init` Phase 3/6) only proposes a new-skill candidate from a *multi-file* cohesion signal (3+ files sharing a naming convention, a repeated import pair across 3+ files, a commit keyword across 3+ commits). A single, well-designed reusable module never reaches Step 4's qualification gate, no matter how clearly reusable. And Step 4's gate today has only two outcomes — propose `kind: "new-skill"`, or drop — with no check for whether an existing skill's domain could absorb the content instead.

## Deliverables

1. **Null-result logging** (`skills/wrap-up/skill-curation.md`, 7.6 Stage-or-Present) — add a mandatory one-line summary emitted every Step 7 run, regardless of outcome. Auto mode writes to `decisions.md`; interactive mode prints the equivalent inline, replacing today's bare "No skill updates needed" in `skills/wrap-up/SKILL.md`'s Step 9 summary template (that bare phrase currently appears in two places — Step 7's own Anti-Patterns-table description and Step 9's summary template line — both need updating, not just one). Format:
   ```
   AUTO {time} — Step 7 skill curation summary: {S} seeds, {R} skills read
   (top-{cap}: {names}), gap detection: {what was examined, found/not found}.
   Result: {N} applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}).
   ```
   `{R}` counts the skills actually read in 7.2's independent scan (the union of the ranked top-`{cap}` set and any seeded skills from 7.1 — i.e. the same "read set" 7.2 step 5 already defines, not a separate count). `{cap}` is 7.2's own existing default-5/fast-lane-2/`--skill-budget`-override value — no new constant introduced. When `{S}` is 0, render `{names}` as the literal text `none (no seeds)` rather than an empty list.
2. **Broadened gap-detection trigger** (`skills/_shared/harness-health-analysis.md` Step 3) — add a fourth signal alongside the existing three: a single new file/module reused (imported/called) from 2+ other files, where the reused interface is itself non-trivial (has 2+ exported functions/methods, or a documented options/config surface — not a one-line wrapper). Drop the softer "clearly designed for reuse even with one call site" alternate clause raised in this leaf's own red-team pass — it had no mechanical anchor and risked qualifying almost any competently-written module; require actual 2+ call sites, matching the concrete-anchor bar every other Step 3 signal already meets.
3. **Fold-into-existing-skill branch** (`skills/_shared/harness-health-analysis.md` Step 4) — **ordering, resolved explicitly (was ambiguous — apply it this way)**: Step 4's existing ≥2-of-3 qualification gate runs first, unchanged, exactly as it does today. Only for a candidate that already clears the gate, THEN check whether an existing skill's domain (read that skill's full body, not just its frontmatter `description` — a superficial keyword match against a broad/catch-all description is not sufficient evidence of genuine fit) already reasonably covers this territory. If yes, propose a `kind: "patch"` to that skill instead of a new file. If no existing skill's domain fits, propose `new-skill` as today. A candidate that fails the ≥2-of-3 gate is still dropped outright, exactly as today — the domain-fit check never becomes a second path around the gate, and a signal-4-admitted candidate's "reusability" criterion must still be judged independently against complexity/project-specificity, not treated as automatically satisfied by the fact that signal 4 admitted it.
4. **Scope note for the shared file's three consumers**: `harness-health-analysis.md` Step 4's new domain-fit check has a different comparison scope per consumer — wrap-up's Step 7 already has a bounded read set (7.2's top-cap ∪ seeds) to check the candidate against; standalone `/harness-health` and `/init` Phase 3/6 have no equivalent pre-bounded skill list for this check. Accept scanning the full skill library for the domain-fit check specifically in those two cases (it's a cheap frontmatter-description scan, not a full-body read for every skill) — document this scope difference explicitly rather than leaving it implicit.

## Acceptance Criteria

- [ ] A wrap-up run whose Step 7 finds nothing produces a logged/printed summary line naming the seed count, the skills actually read (with names), and the gap-detection outcome — not a bare "No skill updates needed" in either of its two current locations (Step 7's Anti-Patterns description and Step 9's summary template).
- [ ] `harness-health-analysis.md` Step 3's fourth gap-detection signal requires actual 2+ call sites with a non-trivial reused interface — no "clearly designed for reuse, even with one call site" softer clause.
- [ ] `harness-health-analysis.md` Step 4 documents the gate-then-domain-fit ordering explicitly (gate first, unchanged; domain-fit check only for gate-passing candidates; domain-fit reads full skill bodies, not just frontmatter), with `kind: "patch"` as its output when the check hits.
- [ ] All three consumers of `harness-health-analysis.md` (wrap-up Step 7, standalone `/harness-health`, `/init` Phase 3/6) are re-read to confirm the Step 3/Step 4 changes don't break their existing call patterns, and the per-consumer domain-fit scope difference (deliverable 4) is documented in the shared file itself, not left implicit.
- [ ] `skills/wrap-up/SKILL.md`'s own Anti-Patterns table gets a row for "declaring 'no updates needed' with no logged scan scope."
- [ ] `npm test` still passes unmodified (no `bin/lib/*` code touched by this leaf — everything here is skill-markdown).

## Technical Approach

### Key Files
- `skills/wrap-up/SKILL.md` — Step 7's Anti-Patterns table row describing "Skill curation declares 'No skill updates needed' only when..." (currently around line 200) AND Step 9's summary template line "Resolved in Step 7 — {N} updates applied / 0 updates needed" (currently around line 309) — both need the null-result-logging update, they are two separate sentences in two separate locations, not one contiguous quote.
- `skills/wrap-up/skill-curation.md` — 7.6 Stage or Present, where the new mandatory summary line is emitted.
- `skills/_shared/harness-health-analysis.md` — Step 3 (New-Skill Gap Detection) and Step 4 (New-Skill Qualification Gate).

Read `skills/harness-health/SKILL.md` and `skills/init/SKILL.md`'s Phase 3/6 sections before editing the shared file, to confirm neither has an assumption about Step 3/4's current two-outcome shape that the new branch would break.

## Open Questions

| Persona | Finding | Suggested Resolution |
|---|---|---|
| Skeptical Reviewer | The null-result log line isn't a traditional `AUTO`/`STAGED`/`KEPT-PROMPT` decision (nothing was decided) — `_shared/auto-decision-log.md`'s Status-semantics table defines `AUTO` as "Skill auto-applied the decision per policy. Action complete," which a null-result scan doesn't match. No acceptance criterion in this leaf forces a durable decision on the tag, and `_shared/auto-decision-log.md` isn't listed as a Key File. | Decide during implementation whether to (a) add a new status tag to `_shared/auto-decision-log.md`'s own schema, documented there, or (b) fold it under `AUTO` with a distinct verb ("SCANNED", say) and update that file's Status-semantics table to name the exception. Either way, add `_shared/auto-decision-log.md` to Key Files and update its schema doc — don't leave the choice implicit in `skill-curation.md` alone, since Review Console grouping logic elsewhere may read this schema too. |

## Gotchas

- This project's own CLAUDE.md warns: "Don't consider a stale cross-skill relationship description fixed after correcting the first place it appears" — `harness-health-analysis.md` is read by three consumers; after editing Step 3/4, grep all three consumer files (`wrap-up/skill-curation.md`, `harness-health/SKILL.md`, `init/SKILL.md`) for any prose that paraphrases the *old* two-outcome gate behavior and would now be stale.
- Don't weaken Step 4's ≥2-of-3 gate while broadening Step 3's input — the point is more candidates *reaching* the gate, not a looser gate. A signal-4-admitted candidate's reusability criterion is judged on its own merits at the gate, not assumed satisfied by the fact that signal 4 fired (this leaf's own red-team pass flagged the circularity risk — see Deliverable 3's explicit resolution).


<!-- work-fingerprint: wrap-up-drift-prevention:skill-curation-hardening -->
