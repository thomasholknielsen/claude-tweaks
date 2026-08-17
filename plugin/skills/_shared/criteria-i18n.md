# Criteria: Internationalization (i18n)

Shared, criteria-only fragment — what to flag in user-facing applications for i18n correctness and future-proofing. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s i18n judgment lens (frontend + backend areas serving user-visible content).

## What to flag

- User-visible strings hard-coded in source code rather than referenced from a translation key (e.g., `<p>Welcome back!</p>` with no i18n call, when the project uses an i18n library like `react-intl`, `i18next`, `vue-i18n`, or a server-side translation function).
- Date, time, or number formatting that calls `toLocaleString()` without a locale argument, relying on the runtime default.
- Plural handling that does not use the i18n library's plural API — a pattern like `count === 1 ? 'item' : 'items'` instead of `t('item', { count })` where `t` supports plural forms.
- RTL (right-to-left) layout assumptions hard-coded via CSS `margin-left`/`margin-right` or `text-align: left` in components that will be RTL-flipped.
- Currency or units formatted without locale or explicit currency code.

## What NOT to flag

- Hard-coded strings in developer-facing output (logs, error messages not shown to users, console.error calls).
- Projects with no i18n library and no stated intention to support multiple languages — flag only when there is evidence of i18n intent (an i18n library is already installed, or locale-switching logic exists).
- Translation key strings themselves (the key `"auth.login.submit"` is not a user-visible hard-coded string).

## Severity calibration

- **high** — a primary user flow is entirely untranslated when the project ships in multiple languages.
- **medium** — a date or number format is locale-insensitive in a user-visible context.
- **low** — a minor string is untranslated or a plural rule is missing for an edge case.
