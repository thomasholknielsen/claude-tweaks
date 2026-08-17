# The Debiasing Lenses

Referenced by `skills/challenge/SKILL.md`'s `--lens` mode — loaded only when that mode runs.
`framing-check` does not use these directly; its own Step 2 signals are self-contained judgment
criteria, conceptually related to lenses 1 and 7 but never reading this file.

Seven lenses, addressed by number in `--lens`.

## Lens 1: Surface Hidden Assumptions

**Bias targeted:** Premise control, anchoring

Ask: *"What must be true for your current framing to make sense?"* Identify 2-3 assumptions embedded in the question, present them back explicitly, and ask which have been verified versus taken for granted.

**Example:** "Should we use Redis or Memcached?" embeds the assumption that a caching layer is needed at all.

## Lens 2: Invert the Question

**Bias targeted:** Confirmation bias (Popper's falsification)

Ask: *"How would someone who disagrees frame this?"* Restate the problem from the opposite perspective. What would a critic say the real problem is? What evidence would disprove the current hypothesis?

## Lens 3: Zoom Out One Level

**Bias targeted:** Symptom-fixing, functional fixedness (Senge's systems thinking)

Ask: *"Is this the problem, or a symptom of a bigger one?"* Place it in its larger system context. Is this the right level of abstraction? What pattern does it fit?

## Lens 4: Outsider Lens

**Bias targeted:** Cognitive entrenchment, expertise blindness (Scott Page's diversity bonus)

Ask: *"How would someone from a completely different background see this?"* Apply 2-3 outside perspectives — an economist, a psychologist, a first-time user — whichever creates the most productive contrast. What would they find obvious?

## Lens 5: Pre-Mortem

**Bias targeted:** Overoptimism, planning fallacy (Klein's pre-mortem)

Ask: *"It is 6 months on and this failed completely. What went wrong?"* Generate 3-5 specific failure scenarios. Which are most likely to be dismissed as improbable? Those are usually the real risks.

## Lens 6: Temporal Distance

**Bias targeted:** Reactive thinking, emotional proximity (Construal Level Theory)

Ask: *"How would you advise someone else on this in 2 years?"* Create psychological distance from immediate pressure. What is important versus noise? What decision would they wish they had made?

## Lens 7: The Meta-Question

**Bias targeted:** Question substitution, framing effects

Ask: *"Is this even the right question?"* Has the problem itself changed? Propose an alternative framing if one has emerged. Often the most valuable output.
