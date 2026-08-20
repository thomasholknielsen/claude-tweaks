---
record: 319
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: review-reproduction-pair-no-direct-verification-override
surface: backend
---
# 319: review: reproduction-pair confidence has no direct-verification override

Surface: backend

## Current State

`skills/review/step3-routing.md`'s confidence model documents `unconfirmed` findings as originating from several sources (its "Inputs" section) — the primary one being "No reproduction agreement (Step 3) — a lens's finding surfaced by only one of its two reproduction agents." The actual confirmed/unconfirmed decision is made upstream, in `skills/review/step3-lens-dispatch.md`'s reproduction-pair dispatch: "Findings present in both agents' outputs … → emit as `confirmed`. Findings present in only one agent's output → emit as `unconfirmed` … Unconfirmed findings do **not** enter Step 3 Routing — they route directly to the Wrap-Up Console's Low-confidence subsection."

Reproduction-pair agreement is documented as the only path from a single-agent finding to full confidence. There is no documented path for a reviewer's own direct verification against the actual source (reading the conflicting text itself, not re-reading the agent's report) to do the same — even though a lived case showed this is stronger evidence than a second agent's agreement: it independently rules out two agents sharing the same misread, which agent-pair agreement alone cannot rule out.

## Deliverables

- Add guidance to the confidence-model documentation (the natural target is `skills/review/step3-routing.md`'s "Inputs" section, where the several sources of `unconfirmed` findings are already enumerated; if the builder determines the actual confirmed/unconfirmed decision point in `skills/review/step3-lens-dispatch.md`'s reproduction-pair dispatch also needs a corresponding carve-out for the override to take effect procedurally rather than just be documented, extend there too) stating that a reviewer's own **direct verification against source** — reading the actual conflicting text the finding is about, not re-reading the agent's report — can independently elevate a single-agent (reproduction-unconfirmed) finding to full/confirmed confidence.
- State this explicitly as an **additional** path alongside reproduction-pair agreement, never as a replacement for it — reproduction-pair agreement remains the default/primary mechanism.
- Decide and document, as part of this change, what routing consequence the override has (e.g. whether an override-elevated finding is re-routed to the Step 3 Routing table as `confirmed`, or handled some other explicit way) — the guidance can't just declare "full confidence" is reached without saying what changes downstream, since today's routing sends every `unconfirmed` finding straight to the Wrap-Up Console regardless of confidence.

## Acceptance Criteria

- [ ] The confidence-model documentation (in `skills/review/step3-routing.md` and/or `skills/review/step3-lens-dispatch.md`, per the placement decided during implementation) states in writing that a reviewer's own direct verification against the actual source text can independently elevate a single-agent finding to full/confirmed confidence.
- [ ] The added text frames this as **alongside** reproduction-pair agreement, not instead of it — reproduction-pair agreement is not weakened, demoted, or presented as optional.
- [ ] The added text distinguishes "direct verification against source" (reading the actual conflicting text) from "re-reading the agent's report" or general reviewer agreement/opinion — worded precisely enough that it cannot be read as "any reviewer opinion can override agent disagreement." A reviewer applying the text correctly rejects the override for a case where they merely agreed with the single agent's report without independently reading the source.
- [ ] The routing consequence of an override-elevated finding is stated explicitly (not left implicit) — i.e., the text says what happens to the finding next (e.g., whether it now enters the Step 3 Routing table as `confirmed`), not just that "confidence" is reached in the abstract.
- [ ] No other confidence-model behavior is altered: the severity-based auto-routing table, the `contested`/debate handling, and the existing reproduction-pair confirmed/unconfirmed mechanics are unchanged — this is an additive carve-out, not a rewrite.
- [ ] The addition reads coherently in place — internally consistent with the surrounding "Inputs" section (or the reproduction-pair dispatch section, if extended there) rather than a bolted-on aside.

## Technical Approach

Two files are the identified candidates, found by tracing the confidence model end to end:

- `skills/review/step3-routing.md` — the "Inputs" section (its "`unconfirmed` findings can originate from several sources" list) is the descriptive/downstream side of the model: it already enumerates the sources of `unconfirmed` findings, so the new override is a natural addition there — either as a new bullet describing the override path, or as a note directly following the "No reproduction agreement (Step 3)" bullet it modifies.
- `skills/review/step3-lens-dispatch.md` — the reproduction-pair dispatch section (currently: "Findings present in both agents' outputs … → emit as `confirmed`. Findings present in only one agent's output → emit as `unconfirmed`") is where the confirmed/unconfirmed decision is actually made procedurally. If the override is meant to change what a reviewer *does* mid-review (not just what they understand), the operative carve-out likely needs to live here too, since this is the section a reviewer/agent is actually following when the decision is made.

Whether one file or both need the addition is an implementation decision, not predetermined by this record — the deliverable is the documented override with precise-enough wording and an explicit routing consequence, not a specific file.

## Gotchas

- **Auto-mode ambiguity.** The lived case behind this gap happened with an active reviewer (human or the orchestrating agent) reading source directly during a review session. `skills/review/step3-routing.md`'s Auto mode section runs unattended, severity-routed, with no human in the loop reading source text. The added guidance should be clear about whether the override applies only when an active reviewer/agent is actually reading source mid-review (interactive/hybrid modes, or an auto-mode agent that happens to read source as part of its own pass) — and not silently imply a fully unattended auto run can invoke it without anyone/anything having actually read the conflicting text.
- **Precision risk.** The central risk flagged in the originating issue is that loose wording reads as "any reviewer opinion overrides agent disagreement" — this is a much broader (and wrong) claim than what's being added. The override is scoped tightly to verified-against-source, not agreed-with-report or merely-believed. Get this distinction into the actual sentence, not just implied by context.
- **Downstream routing gap.** `step3-lens-dispatch.md` currently states unconfirmed findings "do **not** enter Step 3 Routing." If the guidance only documents the override's existence in `step3-routing.md`'s Inputs section without touching this routing statement, the two sections would contradict each other for an override-elevated finding. This needs to be resolved as part of the same change, not left as a follow-up.

## Original request

review: reproduction-pair confidence has no direct-verification override

**Summary:** The review protocol's reproduction-pair confidence model has no path for a reviewer's own direct verification against ground-truth source to elevate a single-agent finding to full confidence — only agent-agreement counts.

**Kind:** Gap

**Affected component:** `review/step3-routing.md` (confidence model / reproduction-pair routing)

**Use case:** During a review, one lens's finding was caught by only 1 of 2 reproduction-pair agents — mechanically this routes to unconfirmed/low-confidence, deferred to the wrap-up console rather than Step 3 Routing. Before deciding, the reviewer independently read the actual conflicting source text the finding was about and confirmed the finding was correct — not a misread by the one agent that caught it. That direct verification is stronger evidence than a second agent's agreement (it eliminates the possibility of two agents sharing the same misread), not weaker, but the protocol as currently documented has no path other than reproduction-pair agreement to reach full confidence.

Suggestion: document explicitly that a reviewer's own direct verification against source (reading the actual conflicting text, not just re-reading the agent's report) can independently elevate a single-agent finding to full confidence, alongside — not only via — reproduction-pair agreement.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: review-reproduction-pair-no-direct-verification-override -->

