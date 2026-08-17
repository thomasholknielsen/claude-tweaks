# Criteria: Accessibility (a11y)

Shared, criteria-only fragment — what to flag when judging accessibility in frontend/UI code. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s a11y judgment lens (frontend areas only). Confidence floor: `high` — flag only clear, concrete violations, not speculative issues.

## What to flag

- Interactive elements (buttons, links, form controls) with no accessible label: missing `aria-label`, `aria-labelledby`, or visible text content that a screen reader can reach.
- Images with no `alt` attribute, or `alt=""` on an image that carries meaning (decorative-only images with `alt=""` are correct — but verify the image is truly decorative before accepting the empty string).
- Keyboard-inaccessible interactive elements: a `div` or `span` with an `onClick` handler and no `role`, no `tabIndex`, and no keyboard event handler (`onKeyDown`/`onKeyUp`/`onKeyPress`).
- Form inputs with no associated `<label>` element (either via `for`/`id` pairing or wrapping).
- Color contrast issues only when the contrast ratio is verifiably below WCAG AA (4.5:1 for normal text) — do not guess; if you cannot verify the colors from the code, do not flag.
- Missing `lang` attribute on the root `<html>` element in a static template.
- ARIA attributes used incorrectly (e.g., `role="button"` on an element that already has native button semantics, or `aria-hidden="true"` on a focusable element).

## What NOT to flag

- Subjective readability or UX issues that are not accessibility defects.
- Missing ARIA on purely decorative or non-interactive elements.
- Contrast ratio concerns without verifiable color values from the code.
- "Could be more accessible" without a concrete violation of WCAG 2.1 AA criteria.
- Issues in vendored or generated code.

## Severity calibration

- **high** — a primary interactive path (form submission, navigation, modal) is completely inaccessible by keyboard or screen reader.
- **medium** — a specific interactive element is inaccessible but the surrounding flow has alternatives.
- **low** — a minor labeling gap on a decorative or secondary element.
