# Animate Frequency Gate — Motion Presence Heuristic for `/impeccable animate`

**Date:** 2026-07-08
**Status:** Approved (brainstorm 2026-07-08)
**Origin:** A user question about `kylezantos/design-motion-principles` (a third-party motion-design skill) led to a deeper audit of the Impeccable integration. Direct comparison of that skill's framework against Impeccable's actual `reference/animate.md`, `reference/motion-design.md`, and `reference/delight.md` found nearly all of it already covered — duration bands, easing curves, `prefers-reduced-motion`, even the "best animation is invisible" framing verbatim. One idea was genuinely missing: gating whether to animate an interaction *at all*, based on how often the user triggers it.

## Problem

Impeccable's `animate` command (and the `motion-design.md` reference it reads) fully specifies *how* to animate once motion has been decided on — duration, easing, staggering, reduced-motion fallback. Nothing in its guidance decides *whether* an interaction should be animated in the first place. A keyboard-driven power-user action and a once-a-month onboarding celebration get the same treatment: "animate it well." That's a real gap, not a duplicate of what Impeccable already does.

claude-tweaks' `/claude-tweaks:design` wrapper dispatches `animate` in two places: `polish` mode's intent-driven dispatch (`design-intent: delightful` → auto-invokes `delight` then `animate`, per `command-map.md`), and implicitly whenever a user runs `/impeccable:impeccable animate` themselves after seeing it in a `survey`-mode recommendation. Today the wrapper passes only a bare file list as the command's target argument (confirmed in `modes/polish.md`: "the wrapper passes the file list as a single space-separated argument") — no guidance text is ever appended to any Impeccable invocation anywhere in this codebase. This would be the first use of that mechanism.

## Decision

Add a fixed **Frequency Gate** guardrail, applied only to `animate` (not `delight` — see Scope below), via two changes:

1. **Auto-dispatch guardrail.** Whenever `polish` mode invokes `animate` (currently only the `delightful`-intent path), the wrapper appends a fixed guidance suffix to the target argument.
2. **Survey rationale.** `survey` mode's existing `animate` recommendation row gets an added clause pointing at the same check, so a user deciding whether to manually run `/impeccable animate` after a Creative Opportunities suggestion sees the same guidance — survey remains read-only; it only adds a sentence to what it already suggests.

### Guardrail text (single source of truth)

> "Apply a frequency gate before animating: keyboard-initiated actions and actions triggered 100+ times per day get no animation (instant state change only); daily/occasional actions get subtle, fast motion; rare (monthly-or-less) actions may receive expressive motion. Decide whether to animate first, using this gate — then apply your own duration/easing rules."

This is framed and treated as a **guardrail**, the same category as Impeccable's own mandatory `prefers-reduced-motion` rule baked into every `animate` call — not creative drift, and not gated behind audit findings or `design-intent`. It applies unconditionally whenever this wrapper dispatches `animate`.

### Scope — why `delight` is excluded

`delight` covers content and personality (copy, illustration, celebratory moments), of which motion is one technique among several, and it already carries its own restraint framework ("delight at specific moments, not pages," "quick, <1 second," "compound over time"). A trigger-frequency gate keyed to "keyboard-initiated → never" would actively fight `delight`'s stated purpose — e.g. a first-time Cmd+K palette reveal is exactly the kind of keyboard-initiated, one-time moment `delight` wants to celebrate. `animate`'s entire job, by contrast, is deciding whether and how to add motion, so the gate belongs there and nowhere else.

## Changes

Single source of truth: `skills/design/command-map.md`.

1. **`skills/design/command-map.md`, `### Step 3 — Intent-driven` section** (under "Polish-mode dispatch"). Add a subsection immediately after the existing "Multi-intent ordering" paragraph, documenting the fixed suffix on `animate`'s dispatch, framed as a guardrail (parallel structure to how that same section already documents the `delight` → `animate` fixed pairing order for `delightful`). State explicitly that the suffix applies to every `animate` dispatch this wrapper makes, not just the `delightful`-intent path, so it also covers any future auto-fit or issue-driven dispatch of `animate` if one is ever added.
2. **`skills/design/command-map.md`, `### Survey "would help" criteria → command mapping` table** (under "Survey mode"). Extend the existing `animate` row's rationale snippet (currently: *"Static interactions feel unpolished"*) to: *"Static interactions feel unpolished — but skip if the control is keyboard-initiated or fires 100+ times/day."*
3. **`skills/design/modes/polish.md` — Step 6 (Intent-driven dispatch).** Add a one-line pointer noting `animate`'s target always carries the Frequency Gate suffix per `command-map.md`, so a future reader of `polish.md` doesn't assume it's a bare file list. Do not duplicate the guardrail string itself here — `command-map.md` stays the single source of truth per this repo's existing convention (see how `impeccable-cli.md` and `frontend-detection.md` each own one canonical fact rather than being restated across files).

No changes to `modes/survey.md` — it already delegates its criteria table to `command-map.md` ("Each observation maps to one creative command per the criteria table in `../command-map.md`"), so the rationale-text edit there is picked up automatically.

## Testing

This is prose/prompt content — no unit test in this repo covers skill markdown, and Impeccable itself is an external plugin not under test here. Verification:

- **Consistency check (do now):** the guardrail string is defined exactly once (`command-map.md`) and every other reference (`polish.md`) points at it rather than re-quoting it, so there is no risk of the two drifting apart.
- **Manual smoke test (deferred, documented not run):** this repo has no frontend fixture to actually invoke `/impeccable:impeccable animate` against. First real verification happens the next time `/flow` runs polish phase with `design-intent: delightful` on an actual frontend spec in a downstream project — confirm the assembled invocation string is well-formed and that Impeccable's `animate` command visibly applies the gate (e.g. skips animating a keyboard-shortcut-triggered action) rather than silently ignoring the trailing text.

## Risks

1. **Free-text steering is a prompt-engineering lever, not a documented API.** Impeccable's routing rule ("everything after the command name is the target") and its LLM-driven nature make trailing guidance text plausible to work, but there's no guarantee Impeccable's `animate` procedure reads or honors extra context beyond a file list. If the manual smoke test shows the suffix is ignored, the fallback is documenting the gate as advisory-only guidance in `survey`'s rationale (already planned) and dropping the auto-dispatch suffix rather than pretending it's enforced.
2. **Version drift.** The installed Impeccable plugin in this environment is 3.0.6 while `impeccable-cli.md` was last verified against skill 3.9.1 — `animate.md`'s exact procedure may have changed between versions in ways not re-verified here. Out of scope for this change; noted for whoever next touches Impeccable version currency.
